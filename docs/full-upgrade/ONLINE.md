# ONLINE — contract of live rooms, groups v2 and competitions (teams ו + ז, backend core)

> Status 2026-11-23, branch `feature/3d-world-upgrade`. **Nothing here is applied or deployed.** The SQL is DRAFT migrations
> (`supabase/migrations/20261124_*.sql`, header "NOT APPLIED — needs owner approval"); the Edge Function `supabase/functions/room/` is not
> deployed. Everything below runs offline: the fake backend (`tests/fakebackend.py` + `tests/fakeroom.mjs`) answers every RPC and the
> Edge endpoint with the same code, and the SQL drafts are executed for real in PGlite (`tests/sql_drafts.test.mjs`).
> Design source: `docs/full-upgrade/research/O1-online-design.md` (deviations: §11). Fairness: `docs/FAIRNESS.md`.

## 1. Pieces

```
client ──POST /rest/v1/rpc/rr_room_* (create, join, ready, leave, kick, cancel, state, heartbeat, react, my_rooms) ──► SQL (draft rooms.sql)
   │                                                                                   (SECURITY DEFINER, search_path='', game.auth first,
   │                                                                                    room row FOR UPDATE)
   └──POST /functions/v1/room {op: start | act | tick} ──► Edge `room` (index.ts, Deno)
                                                            ├─ game.auth → throttle → pinned engine (verify-result/engine_pin.js,
                                                            │   engine.bundle.json imported statically, SHA-256 re-checked)
                                                            ├─ ONE transaction: room_store.loadRoom (FOR UPDATE) → room_core.dispatch
                                                            │   → room_store.saveRoom (rooms, room_seats, room_actions, room_events)
                                                            └─ room_core.js: pure logic (the fake's sidecar runs the same file)
```

| File | Role |
|---|---|
| `supabase/functions/room/room_core.js` | pure room logic: settings, lobby, start, intents, rounds, timeouts, redaction, ranking, `dispatch()` |
| `supabase/functions/room/room_store.js` | Postgres ↔ room object (needs only `q(text, params)`; Deno: `tx.unsafe`, tests: PGlite) |
| `supabase/functions/room/index.ts` | HTTP + auth + engine + transaction (thin; `deno check` clean) |
| `supabase/migrations/20261124_rooms.sql` | tables, constraints, indexes, RLS on / no policies, `rr_room_*`, grants (additive) |
| `supabase/migrations/20261124_groups_v2.sql` | roles, handles, description, invite rotation/pause, removal, transfer, throttle, history |
| `supabase/migrations/20261124_competitions.sql` | competition columns on `game.challenges`, attempts, `game.board2`, cancel, new `rr_begin` |
| `tests/fakebackend.py` (`PARAMS_NEXT`, `room_fn`) + `tests/fakeroom.mjs` | offline parity: all new RPCs + `/functions/v1/room` |

## 2. Room model

- 2–4 seats, **one server seed** for all seats (same dice, same cards), each seat runs its own economy (no trading/lending between players).
- **Simultaneous rounds.** Round *r*: every active seat rolls once (`r` = `rollDice` + `landing`, atomic) and resolves its card(s); any time
  actions (`L R C P A I S T F H Q`) are allowed. A seat is *done* when it rolled in round *r*, `phase = 'roll'` and nothing is pending (or its
  game ended / it forfeited). The round closes when every active seat is done, or at the deadline (lazy timeout, §5).
- Ends: `end = first_win` → the round in which someone escapes is the last; `all` → until every seat's game ended; always at `max_rounds`.
  Then **finish exactly once**: results computed on the server (`st.result`, or `E.endNow` = "capped" for unfinished seats), ranked with the
  competition metric (won → fewer months → progress; tiebreak passive/expenses ratio → net worth; **never time**; forfeits last; equal keys
  share a rank). The seed is revealed after the room ended.
- Engine config per seat (`seatConfig`): `{worldId, charId, seed: room seed, mode, tutorial:false, bailout:false, mentor: help}`;
  `mode: ranked` → engine `challenge` with `dateKey` = the room's Israel start day (rules era like a challenge; mentor fixed `hint`),
  `mode: casual` → engine `free` with the chosen help level. The history world is never offered.
- Statuses: room `lobby → playing → finished | cancelled` (`end_reason`: first_win · all_done · max_rounds · abandoned · host · vote · empty ·
  expired). Seat `joined ⇄ ready → playing ⇄ away → finished | forfeit`.

### Settings (`rr_room_create.p_settings`, frozen at start — §21)
| key | values (default) |
|---|---|
| `world` | `w1` `w2` `w3` `w4` (`w1`) |
| `mode` | `ranked` \| `casual` (`ranked`) |
| `char_policy` | `same` (everyone `char`) \| `choose` (each seat picks at ready) (`same`) |
| `char` | a character of the world (the first one) |
| `help` | ranked: `hint` only · casual: `guide` `hint` `pro` (`hint`) |
| `turn_secs` | 60–300 (90); deadline = turn + 15 s grace |
| `disconnect` | `autopilot` (away after 3 missed rounds, forfeit after 10) \| `strict` (forfeit after 3) |
| `end` | `first_win` \| `all` (`first_win`) |
| `max_rounds` | 10–120 (80) |
| `privacy` | `code` (anyone with the code) \| `group` (members of `p_group` only) |
| `max_seats` / `min_seats` | 2–4 (4) / 2–max (2) |
Unknown keys or wrong types → `bad_settings`.

## 3. SQL RPCs (draft `20261124_rooms.sql`; every one starts with `game.auth`)

Errors are raised codes (PostgREST: HTTP 400, body `{code:'P0001', message:'<code>'}`). Times are **epoch milliseconds**.

| RPC (+ `p_id, p_secret`) | returns | errors |
|---|---|---|
| `rr_room_create(p_settings jsonb, p_group uuid)` | `{room_id, code}` | bad_settings · not_member (group room) · too_many_rooms (≥ 3 open) · rate_limited (≥ 10 created / day) |
| `rr_room_join(p_code text)` | `{room_id, seat, rejoined}` — a member gets the SAME seat back | room_not_found (unknown / started / ended / kicked: one answer, no oracle) · room_full · not_member · too_many_rooms · rate_limited (≥ 20 failed codes / h) |
| `rr_room_ready(p_room, p_ready bool, p_char text)` | `{version}` | not_in_room · room_started · bad_char |
| `rr_room_leave(p_room)` | lobby: `{left, status}` (host role → lowest seat; last one → cancelled) · playing: `{left, forfeit:true, status}` + `needs_tick` | not_in_room |
| `rr_room_kick(p_room, p_seat smallint)` | `{version}` (kicked player cannot rejoin by code) | not_in_room · not_host · room_started · bad_seat |
| `rr_room_cancel(p_room)` | `{status, votes, of}` — lobby: host only; playing: a vote, majority of active seats cancels | not_in_room · not_host · room_not_playing · seat_finished |
| `rr_room_state(p_room, p_since bigint)` | `{unchanged, version, state_version, now}` if `p_since ≥ version`, else `{room, seats, me, events}` (below) | not_in_room · room_not_found |
| `rr_room_heartbeat(p_room, p_conn text)` | `{version, state_version, deadline, now, status, needs_tick, primary}` | not_in_room |
| `rr_room_react(p_room, p_kind)` | `{version}`; kinds: `clap wow lol strong bravo again` (UI: 👏 😮 😂 💪 "כל הכבוד" "עוד סיבוב!"), ≥ 3 s apart | bad_reaction · rate_limited |
| `rr_my_rooms()` | `[{id, code, status, world, seats, max_seats, round, host, seat}]` (open + finished in 24 h) | |

`rr_room_state` body: `room {id, code, status, settings, round, deadline, version, now, host_seat, rules, engine_sha, signal_topic, end_reason,
started_at, finished_at, results, seed (finished/cancelled after start only, else null), needs_tick}` · `seats [{seat, nickname, pawn, status,
char, me, connected (seen ≤ 45 s), done, pub, pub_round, result (finished only)}]` · `me {seat, state_version, view, done, rolled}` ·
`events [{id, round, kind, data, at}]` (last 30). **Opponents never get `view`/state**; their `pub` is the snapshot of the last closed round:
`{month, progress, passive, expenses, nw_band, over, won, bankrupt, assets, news[≤2]}`.

## 4. Edge Function `room`

`POST {op, id, secret, room, …}`, body ≤ 8 KB, `verify_jwt = false` (self-authenticating like verify-result).

| op | extra fields | 200 body |
|---|---|---|
| `start` | — (host; every seat ready; ≥ `min_seats`) | `{version, round: 1, deadline}` |
| `act` | `action_id` (8–64 of `[A-Za-z0-9:_-]`, a UUIDv4 is fine), `state_version` (int), `code`, `args` (≤ 2 primitives, strings ≤ 40), `engine?` (client engine SHA-256) | `{state_version, round, out, event, end, view, done, room_version, room_status, round_now, now}`; a duplicate `action_id` → the stored `{state_version, round, out, end}` + `replayed:true, current_state_version, view` |
| `tick` | — (any member; lazy timeouts / abandonment / a pending round close) | `{status, round, deadline, version, applied, now}` |

Status codes: 400 `bad_json` `bad_op` `bad_action` · 401 `unauthorized` · 403 `not_in_room` `not_host` · 409 `stale{state_version, view}`
`not_your_roll` `room_not_playing` `room_started` `not_ready` `not_enough_players` `seat_finished` `action_id_reused` `version_changed` ·
413 `too_big` · 422 `illegal_action{msg}` · 426 `version_mismatch{engine}` · 429 `rate_limited` · 503 `engine_unavailable` · 500 `server_error`.

**Intent codes** (`room_core.ALLOWED`): `r` roll (+ landing) · `c [optionId, qty?]` choose on the open card · `L [amount?]` loan · `R [amount?]`
repay · `C` pay credit · `P [plan]` · `A [amount]` auto-invest · `I [side, qty]` index trade · `S [amount]` savings · `T [bool]` side-income report ·
`F [focus, slot]` · `H` hint · `Q [itemId, optionId]` story inbox. Refused: `l` (implicit), `M` (help is a room setting), `K` `W` `X` (practice /
after-win only). Amounts are requests — the engine caps them; money, randomness and results never come from the client.

### Order of checks for `act` (§22)
membership → idempotency (`(room, seat, action_id)` unique; same id + different intent → `action_id_reused`) → engine hash (426) → lazy
tick → room playing → seat active → `state_version` (409 stale + snapshot) → rate (120 intents/seat/min) → turn (`r` once per round) →
engine legality on a COPY (422, nothing changes) → commit (+1 `state_version`, room `version`, maybe round close / finish).

## 5. Disconnects and timeouts (§23)

| case | rule |
|---|---|
| temporary disconnect / closed tab | heartbeat every 15 s; seen > 45 s ago → shown "מנותק"; the timer keeps running |
| reconnect | `rr_room_state` (snapshot) → resend an unacknowledged intent with the **same** `action_id` (never applied twice) |
| deadline passed | the first `tick`/`act` of anyone applies, per seat not done: roll if not rolled, then **safe defaults only** — `pass skip ok done decline no later stay keep rest local public modest fix pay go a0`, else the neutral option that spends least; never buy / invest / borrow / start / offer / insure / hedge / sell (fuzzed over every card of 4 worlds) |
| missed rounds | `autopilot` policy: away after 3 in a row (played at round open while others play), forfeit after 10; `strict`: forfeit after 3. Any heartbeat/state/intent of an away player = back |
| leave during play | forfeit (frozen, ranked after everyone else); the next tick closes the round |
| host leaves | lobby: the host role moves; playing: nothing special (no host powers during play) |
| two connections, same player | same seat; both may send; `state_version` + idempotency allow ONE apply per version; heartbeat `conn` → newest = `primary` (older tab read-only, UX only) |
| stuck | no action for 2 h, or every active seat away for 30 min → finished (`abandoned`), ranked as-is (next Edge tick/act); lobby idle 2 h → cancelled (`expired`) — in SQL too: `game.room_sweep()` runs at the start of `rr_room_create` / `rr_room_join` / `rr_my_rooms` (no cron). The 3-open-rooms cap counts lobbies + playing rooms active in the last 2 h |
| cancel | lobby: host; playing: majority vote of active seats; nothing is ranked |
| deploy during a room | the room keeps `engine_sha`; a function with another pin answers `409 version_changed {closes_in}` for 2 minutes (the deploy window; a server with the room's own pin clears `pin_mismatch_at`), then its next start/act/tick closes the room: cancelled, `end_reason = version_changed`, unranked (room_core `pinGate`, ONLINE_RELEASE.md S1) — still deploy at quiet times |
| retention | `select game.room_purge(30);` (owner, SQL editor) deletes rooms that ended > 30 days ago with their seats/actions/events, and failed-join rows > 1 day; never scheduled, never granted to the API roles |

## 6. What a client may see — `room_core.redact()`

Removed: `seed`, `rng`, `bizRng`, `bizStory`, deck order (lengths kept, values −1), the action log (`actionsN`), log beyond 40 rows.
Neutralised: an uninspected/partly inspected dd card's truth (`f vf jitter risk repair base val`), `negR raiseR r`, a pitch's `hidden` fate,
rival `close/taker`, unrevealed rival-deal truths, `life.raiseR/sideSeed`, a friend loan's sealed outcome, the coin path, every story/chain
`seal`, the payday story draw `story.r`, a business offer's sealed `seed`, active angel investments' `mult/signalMult`, and economic truth newer
than one month. `view = {state: <redacted>, event: <the server's describe() of the open card>}`.
Tested (`tests/room_core.test.mjs`): no forbidden key, no RNG-grade number of the full state (stream states, the next 4 draws of every
stream, sealed values), no deck order appears in any view; `metrics(view) === metrics(state)` on every checked state (3,333 in the last
run); `currentEvent(view) === server event` except **documented exception**: a dd card at inspection level 1 — the view keeps the public
range (`pending.dd.range`) but a local `describe()` re-centres it; clients must render the server's `event` (they always get it).
Also kept on purpose: `econ.phase` (the current phase is not future information and is visible through public loan rates).
**Rule for every future engine task:** a new sealed field (anything drawn now and revealed later) must be added to `room_core.redact()` and to
the leak test's `secretsOf()` in the same change (better: export a `redactedView(st)` from the engine next to `shadowOf` at the next re-pin).

## 7. Groups v2 (draft `20261124_groups_v2.sql`; same names/signatures for every existing RPC)

| RPC | who | returns / errors |
|---|---|---|
| `rr_group` (existing) | members | + `description, my_role, invite_open, member_challenges`, `members[].role`, `members[].handle` (opaque per membership — never a player id or nickname) |
| `rr_join_group` (existing) | anyone with a code | unknown, rotated, closed, or removed-member code → `group_not_found` (one answer); ≥ 20 failed codes/h → `rate_limited` |
| `rr_leave_group` (existing) | members | owner leaving → oldest admin, else oldest member becomes owner; last member deletes the group |
| `rr_create_challenge2` (existing) | members (owner/admin when `member_challenges = false`) | `not_allowed` |
| `rr_group_update(p_group, p_name, p_description)` | owner, admin | `bad_name`, `bad_description` (≤ 200, no control chars; stored verbatim → clients `esc()`) |
| `rr_group_set_role(p_group, p_member handle, p_role admin\|member)` | owner | `bad_role`, `member_not_found`, `not_allowed` |
| `rr_group_transfer(p_group, p_member)` | owner (stays admin) | `not_allowed` |
| `rr_group_remove(p_group, p_member)` | owner: anyone else · admin: members only | removed = banned until the code rotates; results stay on boards |
| `rr_group_rotate_code(p_group)` | owner, admin | new code; old links revoked, bans cleared |
| `rr_group_settings(p_group, p_invite_open, p_member_challenges)` | owner, admin | `bad_settings` |
| `rr_group_history(p_group, p_before)` | members | `{challenges[≤20], log[≤50] {kind, actor, target, data, at}, next_before}` |
Every group RPC: `not_member` for a non-member / unknown id (no oracle).

## 8. Competitions (draft `20261124_competitions.sql`; extends `game.challenges`)

| RPC | returns / errors |
|---|---|
| `rr_create_competition(p_group, p_title, p_world, p_char, p_starts_at, p_ends_at, p_rules)` | `{…challenge keys, status scheduled\|open\|closed\|cancelled, rules{attempts 1–3, metric escape\|networth, tiebreak ratio\|networth, join_policy members\|members_before_start, late_join_until, grace_minutes 0–360}, engine_rules, engine_sha, kind, created_by_me, cancelled_at, my_status, attempts_used, board}` · `bad_title bad_world bad_profession bad_window bad_rules too_many_challenges not_member not_allowed` |
| `rr_competition(p_challenge)` | the same object · `challenge_not_found not_member` |
| `rr_cancel_competition(p_challenge)` | creator or owner/admin; board kept · `not_allowed already_cancelled challenge_closed` |
| `rr_begin` (existing, same signature) | challenge mode: + `attempt, attempts, rules`; new codes `not_started challenge_cancelled late_join` |
| `rr_begin_attempt(p_challenge)` | next attempt (seed *k* = `attempt_seed(seed, k)`, the same for everyone) · `attempt_open attempts_used` + the gate codes |
`game.board2` rows = `game.board` keys + `rank` (shared, no time key), `flag` (`ok` ranked · `playing` · `unfinished` · `late` · `disqualified`),
`attempt`, `attempts` — best attempt per player. Legacy challenges / daily / weekly keep `game.board` unchanged.

## 9. Client notes (for the RemoteDriver / lobby screens — team ד)

- Poll `rr_room_state(p_since = last version)` every 3 s while waiting (lobby, round close) and every 15 s otherwise; heartbeat every 15 s with
  a per-tab `conn`; call `tick` when `needs_tick`. Use `now` from responses for the clock offset (deadlines are server ms).
- One `action_id` per intent (UUIDv4), kept until a response arrives; resend the same id after a reload. Disable controls until the answer.
- Replace the local state with `view.state` and render `view.event` (server-described). Read-only engine calls (`metrics`, `inbox`,
  `impactFor`, `cityModels`) may run on `view.state`. Turn off persist/checkpoint/⚡ gating in room mode.
- Nicknames, descriptions and events are user text → `esc()`. Reactions are ids from the fixed list.

## 10. Tests (all offline)

| command | covers |
|---|---|
| `node tests/room_core.test.mjs [rooms=6]` | 22 tests: settings, lobby, protocol errors, idempotency, CAS/two tabs, 426, rate limit, full rooms 2–4 seats × w1–w4 × pass/greedy/random with **server step-by-step === local client engine** (byte equality after every intent, incl. autopilot rows), leak test, metrics/event parity, finish once, `E.replay(actions) === stored state` + `verify_core.verifyGame` on finished ranked seats, snapshot privacy, timeouts/away/forfeit/strict, host leaves, cancel vote, abandonment, reconnect, safe-default fuzz (36,941 cards), ranking ties, SQL char lists |
| `node tests/fairness.test.mjs [seeds=12]` | same seed × opposite policies: 15 streams + dice + tiles identical every turn; card differences only `business/life/doodad`; a live room: identical dice/tiles/streams per round |
| `node tests/room_net.test.mjs` | 5 identities over HTTP against the fake (§30 list: room+join, permissions, start, turn, out of turn, double click, parallel, duplicate, stale, disconnect+return, host leaves, timeout, finish once, forged result, foreign user, revoked invite, closed competition) |
| `python3 tests/groups_v2.test.py` | 32-cell permission matrix, handles, bans/rotation, throttle, long input, ownership, history, old keys, dump/load |
| `node tests/backend_contract.mjs` | + 85 draft cases (groups v2, competitions, rooms RPC + Edge status codes); staging runs them with `RR_DRAFTS=1`; `--live --local [--only=rooms]` = the local staging stack |
| `RR_PGLITE=<dir> node tests/online_migration.test.mjs` | rooms.sql alone on the baseline: additive, atomic, rollback exact, grants, volatility, order independence + lifecycle S2/S5/S6 |
| `node tests/online_smoke.mjs [--live --local]` | the release smoke (2 identities create → … → cancel vote) on the fake, the local stack, or (with approval) a hosted project |
| `tools/staging/{install,setup,start,stop,run_live}.sh` | LOCAL staging: PostgreSQL 17 + PgBouncer (transaction mode) + PostgREST + Deno running `index.ts` + a Supabase-like gateway — no hosted project |
| `node tests/online_local.test.mjs` | on the local stack: postgres.js json/jsonb/bigint binding, PostgREST error mapping + commit-on-400, concurrency through the pool, S1/S2/S5/S6 end to end |
| `python3 tests/rooms_e2e.py <site> --local` | the browser suite (rooms part) against the local stack (`tests/online_localstack.py` relays the page's calls; `RR_STAGING_FAKETIME=1` moves the DB clock) |
| `RR_PGLITE=<dir> node tests/sql_drafts.test.mjs` | the three drafts applied on the production baseline in PGlite; group/competition/room RPCs; the Edge write path (room_store) playing a room to the end; grants + RLS; `index.ts` static engine import hashes to the pin. SKIPs without PGlite (`npm i @electric-sql/pglite` anywhere) |

## 11. Deviations from the O1 design (and why)

1. **Row lock instead of lock-free CAS.** Every writer locks `game.rooms` `FOR UPDATE` (task requirement); the per-seat `state_version` check
   stays (stale intents → 409). The Edge Function does plain SQL in one transaction through `room_store.js` instead of `game.room_load/commit`
   functions — the same code is exercised against real PostgreSQL in PGlite.
2. **`action_id` is text** `[A-Za-z0-9:_-]{8,64}` (UUIDs fit) — autopilot rows need server ids (`auto-<round>-<seat>-<seq>`).
3. **State columns are `json`, not `jsonb`.** jsonb re-orders object keys and the engine's results depend on key order: a mid-game
   jsonb round trip changed the outcome in 8 of 40 games (measured). See §13 for the same issue in production.
4. **`mode: ranked | casual`.** The engine forces mentor `hint` in ranked modes, so a "help level" setting only exists in casual rooms (engine
   `free`, room-capped length).
5. **No `paused` / `version_changed` room status.** A pin change answers 409 `version_changed` for 2 minutes, then the room is cancelled with
   `end_reason = version_changed` (S1); old states are never continued with another engine.
6. **Opponent progress = last closed round** (not live): opponents hold the same card at the same time.
7. **Leaving during play** is SQL-only (forfeit + `needs_tick`); the round close needs the engine, so the next Edge `tick` does it.
8. **Competition board is a new `game.board2`** instead of replacing `game.board` (daily/weekly/legacy challenges keep their exact order
   and keys; v2 competitions rank without time). `rr_finish` keeps production's 6 h hard limit; `board2` ranks only finishes within
   `grace_minutes` (default 120).
9. **Throttle rows survive a "raise"** via `set_config('response.status','400')` + a returned PostgREST-shaped error (a real raise would roll
   the counter back). Verified on the local stack with PostgREST 12.2.3, 13.0.4 and 14.2: the 400 response is committed.
10. Not built (phase 2+): Realtime doorbell, live competitions as scheduled rooms (`kind = 'live'`, `competition_id` column exists), a scheduled
    retention job (only the callable `game.room_purge(days)`), sealed async competitions as single-seat rooms.

## 12. Production changes that need the owner's approval

| # | change | file | kind |
|---|---|---|---|
| 1 | Groups v2: new columns on `game.groups` / `game.group_members`, tables `group_bans`, `group_log`, `join_fails`; replaces `rr_create_group`, `rr_join_group`, `rr_leave_group`, `rr_my_groups`, `rr_group`, `rr_create_challenge2` (same signatures); new `rr_group_*` | `supabase/migrations/20261124_groups_v2.sql` | alters existing (rollback inside) |
| 2 | Competitions: columns on `game.challenges` / `game.results` (`attempt`, `seed`), unique index swap, `game.board2`, replaces `rr_begin` + `rr_group`, new `rr_create_competition`, `rr_competition`, `rr_cancel_competition`, `rr_begin_attempt` | `supabase/migrations/20261124_competitions.sql` | alters existing (rollback inside) |
| 3 | Rooms: 5 tables + `rr_room_*` + `rr_my_rooms` | `supabase/migrations/20261124_rooms.sql` | additive |
| 4 | Deploy Edge Function `room` (`verify_jwt = false`, in the DB region), released together with the site + `verify-result` pin | `supabase/functions/room/` | new function |
| 5 | verify-result follow-up for attempts > 1: `ROW` must use `coalesce(r.seed, c.seed)` | `supabase/functions/verify-result/index.ts` (not changed here) | alters a deployed function |
| 6 | ~~Staging project~~ replaced by the LOCAL staging stack (`tools/staging`, free); a hosted staging run stays optional | — | — |
| 7 | Retention of finished rooms: when / how often to run `game.room_purge(30)` | — | data deletion policy |

## 13. Only verifiable live

Now covered by the LOCAL staging stack (`tools/staging`, ONLINE_RELEASE.md §2–§3): PostgREST error mapping + commit-on-400, anon grants through
the API, `FOR UPDATE` under concurrent calls through a transaction pooler, pgcrypto in `extensions`, postgres.js binding (it found a real
bug: `$n::jsonb` double-encoded every JSON value — fixed with `$n::text::jsonb`), cold start under Deno (engine load 1.3–1.7 s CPU on a
loaded 2-core box). Still only verifiable on hosted Supabase: the Edge Runtime's own CPU accounting and limits, the real `SUPABASE_DB_URL`
(direct vs Supavisor), region placement and latency, the real gateway (body limits, `verify_jwt`), phone clock skew · Realtime (not built).

**Finding for production (not changed here):** `game.results.checkpoint` is `jsonb`. A ranked game resumed from the server checkpoint gets
its keys re-ordered, which can change the rest of the game (8/40 measured), so an honest player's final claim may fail verification. Fix
options: store checkpoints as `json`/text, or canonicalise key order on the client before saving and on resume.
