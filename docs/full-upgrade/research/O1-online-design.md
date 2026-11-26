# O1 — Online, groups, live rooms, competitions and fairness (BRIEF §20–§27, §30)

> Research & design worker O1 (teams ו + ז), 2026-11-23, branch `feature/3d-world-upgrade`. **Read-only research**: no code, SQL,
> Supabase or git changes. Sources: repo files cited as `file:line`; production behaviour is known only through
> `tests/fakebackend.py` (a mirror, marked [FAKE] where it is an assumption), `docs/SECURITY_REVIEW.md` (live evidence of
> 2026-11-20) and `docs/VERIFY_INTEGRATION.md`. Measurements were made locally with Node 22 on a shared 2-core box (scripts in
> `/tmp/o1bench/`, not committed). Tags: [CODE] read in code · [MEASURED] run here · [DOC] stated in repo docs · [FAKE] fake-backend
> semantics, not confirmed in production · [PROPOSAL].

## 0. Summary (most important first)

1. **Fairness is already strong, and no engine change is needed.** I played two opposite policies (always pass vs. always buy/act)
   with the same seed: 100 games, 7,960 turns. **All 15 RNG streams were in the same position after every turn, and the dice and
   tiles were identical in every turn** [MEASURED]. Cards differed in 93 turns (1.2 %), and every case came from state, not from RNG:
   the business tile showing "manage your business" instead of "offer" (82), life-card eligibility substitution (6), and doodad
   amounts scaled to your salary (5). §2 says what to document and adds one test. The real fairness hole is **seed knowledge**
   (S3: daily/weekly seeds can be computed offline, and challenge seeds go to any member at `rr_begin`). Verification cannot fix
   that. Only a server-held RNG can, and live rooms provide one.
2. **The engine can be stepped on the server.** State is plain JSON (`serialize`/`deserialize`, `SAVE_VERSION = 4`,
   `js/engine.js:50,333-343`). A step from a snapshot (deserialize, one action, serialize) took **1–7 ms (p50 ≈ 3.6 ms)**. A full
   replay took 200–640 ms on the same loaded box (45–118 ms live in Deno, SECURITY_REVIEW §3.1) [MEASURED]. A room action therefore
   costs about 2 DB round trips plus about 5 ms of CPU. That is far inside the Edge limit of 2 s CPU per worker.
3. **The state cannot go to clients as it is.** It contains the future: `st.rng` (all streams), `bizRng`/`bizStory`, and sealed
   values in `pending` (dd truth, `negR`, `raiseR`, pitch `hidden`, rival `close`/`taker`), `life.sideSeed`/`raiseR`, the coin path
   and `story.r`. A **redacted view** (the same list the engine's own `shadowOf` neutralises, `js/engine.js:4407-4425`) is
   17 KB p50 / 53 KB max. Over 3,632 states, `E.metrics()` and `E.currentEvent()` on the redacted view matched the full state
   exactly [MEASURED; pass policy only, see §3.4]. So the existing UI can render a room game from the redacted view, while the server
   alone holds the real state.
4. **Recommended MVP:** private 2–4-player invite rooms. Everyone uses **one server seed, so they share the dice and cards**. Each
   player runs their own economy. **Rounds are simultaneous:** in each round everyone rolls once and resolves their own card, and the
   round closes when all are done or the turn timer runs out. Timeouts apply a safe action (roll, or pass/ok/skip), never a purchase
   or a loan. Opponents' progress is shown per round. Cheap actions (create, join, ready, state, heartbeat) are SQL RPCs
   `rr_room_*`. Engine actions go through one new Edge Function `room` that reuses the pinned engine loader. Sync starts with
   **polling** (no new client library). A Realtime "doorbell" comes later behind a flag. Free-plan limits: 200 concurrent
   connections and 2 M messages ([Realtime limits](https://supabase.com/docs/guides/realtime/limits),
   [pricing](https://supabase.com/docs/guides/realtime/pricing)).
5. **Blocking gap for groups and competitions (§20, §24):** the production SQL is **not in the repo**: none of the 19 client RPC
   bodies, no table/index/RLS definitions, and the groups/members table names are unknown (`docs/next-level/research/qa.md:63-66`).
   Room tables can be added purely additively. But roles, invite revocation, and competition fields change existing tables and
   functions. **Prerequisite P0: a read-only `pg_dump --schema-only` of `game` + `public.rr_*`, committed as a baseline migration
   (owner approval, because it reads production).**
6. Everything except real PL/pgSQL concurrency, Edge cold start and region latency, the gateway, and Realtime can be built and tested
   **offline**. Put all room logic in a pure `room_core.js` (like `verify_core.js`). Run it from both the Edge Function and a Node
   sidecar of `tests/fakebackend.py`. Drive 2–4 Playwright contexts (separate identities) against one fake (§4.4).

---

## 1. Inventory

### 1.1 Identity [CODE]
| What | Where | Notes |
|---|---|---|
| Identity = `{id, secret, nickname}` in `localStorage['rr-player']` | `js/net.js:1-2,5,36-39` | No Supabase auth session. Every RPC sends `p_id, p_secret`. |
| Register (nickname 2–20, optional `?ref=`) | `net.js:56`; fake `tests/fakebackend.py:307-316` | Server returns id + secret (24 random bytes, stored as SHA-256, SECURITY_REVIEW §3.9). **No rate limit on sign-up** (R1). |
| Rename | `net.js:67`; fake `:317-320` | **Nicknames are not unique** (fake). `rr_send_energy` addresses a friend **by nickname** (`net.js:60`, fake `:458-461` takes the first match), so duplicate names are ambiguous and can be used for impersonation inside a group. |
| Recovery code = base64 `[id, secret, nickname]` | `net.js:112-119`; UI `js/lobby.js:2222-2223,2298` | Not encrypted. No `rr_rotate_secret` (SECURITY_REVIEW §3.9 recommends one). |
| Auth check | `game.auth(id, secret)` | Used by every `rr_*` and by verify-result (`supabase/functions/verify-result/index.ts:89-90`). |

### 1.2 Groups [CODE/FAKE]
| Capability | State | Evidence |
|---|---|---|
| Create (name 2–40, ≤ 20 groups per player) | ✔ | `net.js:74`, fake `:346-350`, UI `lobby.js:2287` |
| Join by code (6 chars of a 32-char alphabet; link `?join=CODE`) | ✔ immediate, no approval, **no throttle** | `net.js:75`, fake `:212-217,351-358`, `lobby.js:1081,1314` |
| Leave | ✔. [FAKE] The last member leaving deletes the group. **When the owner leaves, `owner` keeps the departed id, so nobody owns the group.** | fake `:359-363`, `lobby.js:2213` |
| Members list (members only) | ✔ `rr_group` gives nickname, owner flag, me, stars, pawn. Polled every 20 s. | `net.js:79-80`, fake `:366-370`, `lobby.js:1229,1250` |
| Roles | **owner flag only.** It only shows a crown (`lobby.js:1271`). No admin/member permissions. | |
| Transfer ownership / remove a member | ✘ | |
| Description | ✘ | |
| Rotate or revoke the invite code | ✘. The code is permanent. | |
| Private by default | ≈ Members are visible only to members, and joining needs the code. But anyone holding the code joins instantly. | |
| History | ≈ `rr_group.challenges` lists every challenge, newest first, unpaginated. There is a feed of the last 50 events (`fake :481-486`). | |
| Group feed XSS (X1/X2) | Fixed in lobby code since the review (check `feedLine`). Server-side typed `p_data` is still recommended. | SECURITY_REVIEW §3.8 |

### 1.3 Challenges, daily, weekly, leaderboards [CODE/FAKE]
| Item | State |
|---|---|
| `rr_create_challenge2(group, title 2–50, world, char, days 1–30)` (`net.js:81`, fake `:371-384`) | **Any member** can create one. ≤ 5 active per group. Starts immediately (no scheduled start). Random 31-bit seed. One attempt per player (unique `(player, challenge)`). No cancel, no attempts setting, no ranking or tiebreak choice, no join policy. |
| Daily (`rr_daily`, fake `:391-394`) / weekly (`rr_weekly`, `:395-398`) | Server rotation of world and character. Daily is 24 months. Seeds are `abs(hashtext('ratrace-daily-'‖key))` / `abs(hashtext('ratrace-'‖key))`, so **they can be computed ahead** (S3). |
| `rr_begin` (fake `:404-428`) | Creates or returns the single result row. `challenge_closed` after `ends_at`. Gives out the **seed** plus the checkpoint. |
| `rr_checkpoint` (`:433-440`) | Monotonic turn, ≤ 300 KB, no count limit. |
| `rr_finish` (`:441-454`) | Values come from the client (range checks only). Exactly once (`already_finished`). [FAKE] **There is no deadline check**, so a game started before `ends_at` can finish later and still count. |
| Board `game.board` (`supabase/migrations/20261120_t15b_board_verified.sql:12-29`) | Order: rejected last, then won < lost < playing, then verified first, then months (won) or −progress, then net worth ↓, then passive ↓, then **finished/started time ↑**. The final tiebreak rewards whoever finished first. §25 forbids speed as a central metric; this is a minor case, but ties should share a rank (§1.6). Top 100. |
| Rules version | `verify_core.js:7-9,44-47` `rulesFor(row)` uses the daily key, the Monday of the weekly, or the challenge creation date (Israel). `RULES4_FROM = 2026-12-07`. So a challenge **is already frozen to the rules of its creation date**. |

### 1.4 Result verification, rate limits, RLS/grants [CODE/DOC]
- `verify-result` (`supabase/functions/verify-result/index.ts`). It authenticates first (`:89-90`), applies a per-isolate throttle of 10/min (`:66-71`), caps attempts at 5 per result (`:15,104`), builds the replay config only from the server row (`ROW :73-86`, `verify_core.js:85-99`), replays with the engine pinned by SHA-256 (`engine_pin.js`, `index.ts:44-56`), and writes the replayed numbers (`:118-126`). Body ≤ 1 MB, ≤ 6,000 actions, codes = `CODES` (`verify_core.js:6`). It is deployed, and migrations A and B are applied (VERIFY_INTEGRATION §0). The client calls it (`lobby.js:415-440`).
- Rate limits that exist: referral 5 per day, energy once per pair per day, `rr_log_event` 50 per day and < 2 KB, verify 5 per result. **Missing:** register, join, checkpoint volume, group/challenge creation per day (SECURITY_REVIEW §3.7).
- RLS: all 7 `game` tables have RLS with **0 policies** (deny-all). `anon`/`authenticated` have **no USAGE on schema `game`**. Access goes only through 23 `public.rr_*` SECURITY DEFINER functions with `search_path=''` (SECURITY_REVIEW §3.11). New objects must follow this pattern.
- Legacy RPCs `rr_start`, `rr_create_challenge`, `rr_register` are still executable (L1).

### 1.5 Gap list vs §20 (groups)
| §20 requirement | Missing / needed |
|---|---|
| Name and **description** | `description text` (≤ 200, plain text, rendered with `esc()`) + `rr_group_update` |
| **Admin / member roles** | `role` on the membership (`owner`/`admin`/`member`). Today only `owner` exists, and it grants nothing. |
| **Transfer ownership** | `rr_group_transfer(group, member)`. Leaving as owner must transfer (to the oldest admin, else the oldest member). This fixes the fake's ownerless group. |
| **Remove by permission** | `rr_group_remove(group, member)`: owner removes anyone, admin removes members. Removed members' results stay on boards. Rejoin with the same code is blocked until the code is rotated. |
| **Rotate / revoke invite** | `rr_group_rotate_code(group)`. The old code then answers the same `group_not_found` as an unknown code (no oracle). Optional `invite_open bool` pauses joining. |
| Private by default | Keep: join only by code, members visible only to members. **Members must be referenced by an opaque per-membership handle, never by player id** (ids appear in `?ref=` links) **and never by nickname** (not unique). |
| Invalid / revoked codes, long input, access by id | Join throttle (e.g. ≤ 20 failed codes per player per hour), length caps on every text field, membership checked on every group id (already done for `rr_group`). |
| Competitions + history | §1.6, plus paginated history (`rr_group_history(group, before)`). |
| No unneeded personal data | Nothing new is collected. Nickname and pawn only. |

### 1.6 Gap list vs §24 (competitions)
Recommendation: **extend `game.challenges` additively** rather than adding a parallel table. Old clients keep working, and
`verify-result`'s `ROW` and `game.board` already key on `challenge_id`. Name it "תחרות" in the UI. New nullable/defaulted columns:

| §24 field / case | Column / rule [PROPOSAL] |
|---|---|
| Name, group, start + end | Exist (`title`, `group_id`, `created_at`/`ends_at`). Add `starts_at` (scheduled start; `rr_begin` before it gives `not_started`). |
| World, opening conditions | Exist (`world`, `profession`). Add `start_cfg jsonb` (max months, help level; **never** bailout or tutorial). |
| **Rules version** | `rules smallint` + `engine_sha text`, frozen at creation (today derived from the date, which is equivalent). Never changed afterwards. |
| Limits, **attempts** | `attempts smallint default 1` (1–3). Attempt *k* uses seed *k* = `hash(server pepper, id, k)`. Every player's attempt *k* gets the same seed, and the best attempt counts. Practice is always free mode with a **different** seed. |
| **Ranking metric, tiebreak** | `metric text default 'escape'`: won first, then fewer months, then progress. `tiebreak text default 'ratio'`: passive ÷ expenses, then net worth. **Never the finish time.** Equal keys share the same rank number. |
| **Join policy, late join** | `join_policy text default 'members'` (`members` \| `members_before_start`). `late_join_until timestamptz` (default `ends_at`). Joining the group after the start is allowed unless the policy forbids it. |
| Unfinished attempt | Still `playing` at `ends_at`: shown as "לא הושלם", below every finished row (already `o1 = 2`), never verified. |
| Finish after the deadline | Accepted if `started_at < ends_at` and `finished_at ≤ ends_at + 2 h` grace. Otherwise shown greyed as "אחרי הזמן" and not ranked. This is a filter in `game.board`, not in `rr_finish`. |
| Disqualified | `verified = false`: shown last with ⚠ (exists). Admin hide later. |
| Ties | Dense shared rank (`rank()` over the metric tuple without the time key). |
| **Cancel** | `status` (`scheduled`/`open`/`closed`/`cancelled`) + `cancelled_at`. Creator or admin may cancel. The board is frozen and kept, not deleted. |
| **Version change** | The competition keeps `rules` + `engine_sha`. Policy: an engine change that alters ranked outcomes **must** be a new `st.rules` number gated by date (the existing `RULES4_FROM` pattern). A competition replays with its stored `rules`. If the server's pin can no longer replay a running competition's version, its unverified results stay unverified (never flagged false), and the UI says so. |
| Permission to create | Owner/admin only in groups v2 (today any member). |
| Live competition (§24 b) | = a **scheduled room** (§3) with `kind = 'live'`, linked to the competition. The ranking uses the same metric. |

---

## 2. Fairness (§25)

### 2.1 How the RNG works [CODE]
- `js/rng.js`: mulberry32 holders. There are **15 named streams** (`STREAMS`, `rng.js:64-65`), each seeded from
  `mix32(seed + (k+1)·φ)`, and the list is append-only. Helpers consume a fixed number of draws (`int`/`pick`/`chance`/`weighted` = 1,
  `shuffle` = n−1). Business-specific sealed streams live in `st.bizRng`/`st.bizStory`, seeded at the business offer
  (`engine.js:1147-1148`).
- Fixed draw counts by design. Two dice are always drawn (`engine.js:857`). Each payday draws 4 `life` (`:896`), 2 `story`
  (`:3514`), 2 `cycle` (`:991`), 2 `index` (`:1224`) and 1 `drift` in fx worlds (`:1317`). Each deal landing draws a card plus golden roll,
  golden idx, `negR`, **6 `dd` and 4 `rival`, "whatever the card turns out to be"** (`:1451-1456`). A mystery landing draws its 3 plus 6 `dd`
  plus 4 `rival` (`:1540-1544`). A business tile **always draws 2**, whether it shows an offer or your own business (`:1178`). A pitch seals
  its outcome with 3 draws "whether or not anyone invests" (`:1569`). Decks are reshuffled only when empty, from the tile's stream
  (`:1400-1402`). Yearly inflation draws 2 per year (`:262`).
- Movement never depends on decisions (`rollDice`, `engine.js:850-887`). Paydays come from laps, so **months stay aligned to turns
  for every player**. The tutorial's dice rigging is free-mode only, and ranked games are never tutorial (`verify_core.js:96`).

### 2.2 Same seed, different decisions: evidence [MEASURED]
Setup: two policies (always pass vs. greedy buy/act), same seed, rules 4, `challenge` mode, w1–w4 × 25 seeds. Turns were compared
until either game ended.

| Result | Value |
|---|---|
| Games / turns compared | 100 / 7,960 |
| Turns where any of the 15 stream positions differed | **0** |
| Turns where dice or tile differed | **0 / 0** |
| Turns where the first card's type or title differed | 93 (1.2 %): business 82, life 6, doodad 5 |

Existing tests cover parts of this: `tests/t2.test.mjs:81-101` (dd/cycle draws per tile, two games aligned) and
`tests/engine.test.mjs:321` (tutorial does not shift dice).

### 2.3 What to document: shared vs. decision-dependent (proposed `docs/FAIRNESS.md`, player-facing summary in Hebrew)
**Shared by everyone with the same seed (same competition / same room):** dice and every tile. The order of every deck. Which deals
are golden. The hidden truth of every deal (dd) and the other investors' behaviour (rival draws). Mystery, pitch, upgrade and
shipping outcomes. Market news and prices. Index returns. Dollar drift. The economic cycle. Inflation. The per-payday life and story
draws. The type and sealed seed of a business offered on a business tile.

**Depends on your own decisions (by design, not luck):**
1. The business tile shows **your business's management card** if you already run one, otherwise the shared offer.
2. A life card you are not eligible for is replaced by its alternative (e.g. no layoff when jobless, chain gating, cooldowns).
3. Costs scaled to your situation (lifestyle doodads relative to salary or wealth, tax, loan rates).
4. Whether a shared draw *hurts you*: burnout depends on your energy, the raise on your actions, side income on your plan.
5. After you buy a business, its own sealed stream.
6. When your game ends.

**Not protected by the seed:** knowing the seed in advance. Daily and weekly seeds can be computed, and challenge seeds are sent at
`rr_begin`, so a sock-puppet member can pre-simulate (S3). Fixes, in order: the pepper plus `results.seed` (SECURITY_REVIEW §3.5), then
**server-held RNG** (rooms, §3). Later, "sealed" async competitions can be played as single-seat rooms.

### 2.4 Adjustments (no engine change)
- Add `tests/fairness.test.mjs`. It runs the §2.2 probe as a gate: 0 stream divergences, 0 dice or tile divergences, and
  card-title divergences only of the 3 allowed kinds. Any future engine change that makes draws depend on decisions then fails CI
  before a re-pin.
- In competitions, rank by the success metric (won → months → progress), never by time. Show "same dice, same cards" in the
  competition card so players know.
- Practice for a competition always uses a new seed (already true for free play).
- Do **not** compare different `rules` values on one board. Today a weekly never straddles the cut-over (`RULES4_FROM` is a Monday);
  keep that invariant for every future rules bump.

---

## 3. Live rooms (§21–§23) — server-authoritative design that reuses the engine

### 3.1 Game model (MVP)
- 2–4 seats. The host chooses world, character policy (`same` = everyone plays one character | `choose` = each picks from the
  world's list), help level (fixed mentor level, so `M` is refused), turn time (60–300 s, default 90), disconnect policy, end rule
  (`first_win` = the round in which someone escapes is the last round | `all` = everyone plays to the end, with a round cap) and
  privacy (invite code | group members). **Nothing changes after start** (§21).
- One **server seed per room**. It is never sent to clients before the room finishes, and revealed afterwards for transparency.
  Every seat has the same dice and cards (§2).
- **Simultaneous rounds.** Room round *r* opens. Each active seat may **roll once** (`r` + `l` applied atomically). It resolves its
  card(s) and may do between-roll actions (`L R C P A I S T F H Q`). A seat is *done* when it rolled in round *r* and `phase === 'roll'`
  with nothing pending. The round closes when every active seat is done, or at the deadline (timeouts §3.5). Players do not wait
  through each other's animations, and months stay aligned for everyone.
- Engine config per seat: `{worldId, charId, seed: room seed, mode: 'challenge', dateKey: room start (Israel), mentor: help, tutorial:false,
  bailout:false}`. This is ranked rules and practice features off (`js/flags.js:61-63`, `PRACTICE_ONLY`), and every seat can be
  re-verified with `verify_core.verifyGame` logic. The history world `h` is excluded (it needs real data).
- Opponents see per round: nickname, pawn, connection and "done" status, month, and **progress, passive vs. expenses, net worth band**,
  plus 1–2 public news items ("קנה עסקה", "פשט רגל"). They see no hidden values and no cards ahead (everyone draws the same card at the
  same time anyway). There is no trading or lending between players (§21). Prepared reactions and emoji only, no free chat (§26).
- Ranking at the end uses the competition metric (§1.6). Ties share a rank.

### 3.2 Architecture
```
client (game.js RemoteDriver) ──POST /functions/v1/room {op:'act'|'start'|'tick'}──► Edge `room` (Deno)
      │                                                                        ├─ engine: same pinned bundle + engine_loader.js
      │                                                                        ├─ room_core.js (pure: validate, apply, redact, timeouts)
      │                                                                        └─ SUPABASE_DB_URL: game.room_load / game.room_commit (CAS)
      └──POST /rest/v1/rpc/rr_room_* (create, join, ready, leave, state, heartbeat, my_rooms) ──► SQL SECURITY DEFINER
optional: Realtime public channel `rr-room-<random topic>` = doorbell {v: room_version} only, never state
```
- The **engine is deployed with the function** (`engine.bundle.json` next to `index.ts`, 932 KB). Its SHA-256 is checked against the pin
  at load, exactly like verify-result (`index.ts:48-51`). Unlike verify-result, the room function does not depend on fetching from
  GitHub Pages at runtime. `tools/build-edge.mjs` writes the same pin and bundle into both functions (or into `_shared/`). **Never
  accept `engine_bundle` from requests in `room`.**
- A room records `engine_sha`. Clients send their engine hash (new generated `js/build_info.js`, outside the pinned set). A mismatch
  returns `426 version_mismatch`, and the client offers to reload. If the server's pin changes while a room is playing (deploy), the
  room pauses as `version_changed` and the host can end it as-is (frozen ranking) or cancel. Deploy at quiet times, and keep rooms
  short (cap about 80 rounds).
- The engine has module-level scratch variables (`CUR_K`, `LESSON_EV`, `STORIES_OFF`, `js/engine.js:2801,4637,3454`). Every engine call is
  synchronous, so interleaving inside one isolate is impossible. `room_core` must never call `__storiesOff`.

### 3.3 Protocol rules (§22)
| Requirement | Mechanism |
|---|---|
| Identity | `game.auth(id, secret)` first, before any engine work (the verify-result lesson, SECURITY_REVIEW §2). |
| Membership / seat | `room_seats(room_id, player_id)` unique. The seat is derived from the identity, never sent by the client. |
| Turn / phase | `r` only if `seat.rolled_round < room.round` and `phase === 'roll'`. Other codes only while the seat is `playing` and the room is `playing`. Codes outside `ALLOWED = r c L R C P A I S T F H Q` (`l` is implicit after `r`) get `400 bad_action`. Arguments use the same schema as `verify_core.validateActions`. |
| Conditions, money | The engine decides. A mutator returning `ok:false` gives `422 illegal_action` with the engine's message. Clients never send amounts that are taken as truth (a loan amount is a request the engine caps). |
| Randomness, result, score | Server only (the seed and state never leave the server unredacted). |
| Action id + idempotency | The client creates a UUIDv4 `action_id` per intent. Unique `(room_id, seat, action_id)`. A duplicate returns the **stored response** with `replayed: true`, including after reconnect. |
| State version / ordering | `seat.state_version` increases by 1 per applied action. A request carrying a stale `state_version` gets `409 stale` + the current view. Per-seat order is total. Room-level order uses `room.version` (lobby changes, round close). |
| Atomicity | `game.room_commit(...)` does one `UPDATE … WHERE state_version = $expected` + `INSERT room_actions` + round-close check in one statement or transaction. No lock is held across the network. 0 rows updated means a concurrent action won, and the caller gets 409. |
| Snapshot on reconnect | `rr_room_state` returns room, seats, `me.view` (redacted), `me.state_version`, deadline and server time. |
| Server clock | Deadlines are server `timestamptz`. Responses carry `now`, so the client derives its offset. |
| Duplicates, reordering | Doorbells carry `v`, and ≤ known is ignored. State always comes from an RPC. The UI disables controls until a response arrives (double click), and a second click with the same `action_id` is harmless. |
| Never expose the future | `room_core.redact(st)` strips `rng`, `bizRng`, `bizStory`, `actions` (replaced by a count) and the log beyond 40 rows, and neutralises the sealed fields of `pending`, `rivalDeals`, `life`, `world.coin.path` and `story.r` (the `shadowOf` list). A test asserts that no stream value or sealed number appears anywhere in the view JSON. |

### 3.4 Client reuse [CODE]
`js/game.js` is the single funnel for mutating calls (`E.rollDice :1110`, `E.landing :1178`, `E.choose :1189,1238`,
`E.takeLoan/repay/credit :1398`, `E.invest :1422`, `E.resolveStory :1026`, plus `setPlan/setFocus/…`). These calls already sit inside
async animation flows. A `RemoteDriver` makes each call `await room.act(code, args)`. The call replaces `S` with the returned view
(keeping the client-only `S.ui` it reattaches), uses the returned `out` (dice, steps, paydays, news, event, end) for the existing
`applyOut` and animations, and turns off `persist`, `checkpoint` and ⚡ gating in room mode. Read-only engine calls (`metrics`,
`currentEvent`, `impactFor`, `inbox`, `cityModels`) run locally on the view.
Caveat: my parity check used the pass policy. Before relying on local `describe` for held assets with hidden truth, the server should
return the event description it computed, `out.event`, and the client should prefer it. A parity test with the greedy policy is
part of the plan (§4.4).

### 3.5 Disconnects (§23)
| Case | Policy [PROPOSAL] |
|---|---|
| Temporary disconnect / closed tab | Heartbeat RPC every 15 s (and any action counts as one). `last_seen` > 45 s means the seat is shown as "מנותק". Turn timer and grace keep running. |
| Reconnect | `localStorage['rr2-room'] = room_id`. On load: `rr_room_state`, then resume from the view. An unacknowledged intent is resent with the **same** `action_id`. |
| Timeout (deadline passed) | Applied lazily by the first `tick` from any member (the client sees `deadline < now`). No cron is needed. For each seat not done, the safe autopilot runs, at most 10 steps: not rolled → roll; pending → **safe default**. Safe default = the first enabled `pass`/`skip`/`ok`/`done`/`next`, or else the single enabled option. It is **never** a buy, invest, loan or start-business option. Exhaustive offline fuzz over every event type and world asserts that a safe option always exists. Story inbox items already expire to their engine defaults at payday (`storyExpire`, `engine.js:900,3891`). |
| Repeated timeouts | 3 consecutive auto-played rounds mark the seat "away": the autopilot continues, so the room never stalls. 10 consecutive rounds, or an explicit leave, mean **forfeit**: the seat is frozen and ranked by its state at that moment, marked "פרש". |
| Leaving | In the lobby the seat is freed. During play it is a forfeit (with confirmation). |
| Host leaves | Nothing breaks, because the server is the source of truth. In the lobby the host role moves to the next seat. During play the host has no special power (cancel needs a majority of the remaining seats). |
| Two connections, same player (two tabs or a restored device) | Both may send intents, and CAS + idempotency allow only one apply per version. The heartbeat carries `conn_id`, and the newest connection is primary. Older tabs show "המשחק פתוח בחלון אחר" and become read-only (UX only, not security). |
| Stuck room | Everyone away for 30 min, or no action for 2 h, makes the room `abandoned` (lazy check on any call). It is ranked as-is and kept out of stats. |

### 3.6 Realtime vs polling
- **No supabase-js in the repo.** `net.js` uses raw `fetch`, and `vendor/` holds only three and fonts. The offline guard also kills
  WebSockets to `*.supabase.co` (`tests/fakebackend.py:662-667`).
- **MVP: polling** `rr_room_state(p_since_version)`. It returns `{unchanged:true}` when nothing changed: every 3 s while waiting for a
  round close or in the lobby, and every 15 s otherwise. PostgREST calls are not per-call billed, and the extra load is small queries.
- **Phase 2: Realtime Broadcast doorbell** (flag `roomRealtime`). There is no `postgres_changes`, because it would need anon read
  policies on `game` and break the deny-all model. The Edge Function or SQL (`realtime.send`) posts `{v}` on a **public** channel
  whose topic is a random 128-bit `signal_topic`. Only members get it from `rr_room_state`. A leaked topic reveals only "something
  changed". The client is a minimal Phoenix WebSocket client (about 80 lines), or `@supabase/realtime-js` vendored under `vendor/`
  (no CDN). Doorbells fire only on room-level changes (join, ready, start, round close, seat status), about 100 per game, ×4
  subscribers. Free-plan limits: **200 concurrent connections, 100 msg/s, 2 M messages included**
  ([limits](https://supabase.com/docs/guides/realtime/limits), [pricing](https://supabase.com/docs/guides/realtime/pricing)).
  That is about 50 simultaneous 4-player rooms. If the plan is exceeded, the client falls back to polling automatically.

### 3.7 Cost and latency estimate
| Item | Estimate |
|---|---|
| Engine CPU per action (deserialize, step, serialize, redact) | 1–7 ms [MEASURED, Node, loaded box]. A full replay is 50–100× more. |
| Engine cold load per isolate (932 KB via data: URLs) | ~0.2–0.5 s [ESTIMATE]. Edge CPU limit is 2 s per worker ([limits](https://supabase.com/docs/guides/functions/limits)). |
| DB per action | 2 round trips (`room_load`, `room_commit`). Run the function in the **database's region** (Supabase `x-region` / force region) so these are ~1–3 ms. Otherwise each adds a cross-region RTT. [verify live] |
| End-to-end per action (Israel) | p50 ≈ 150–300 ms warm, +0.5–2 s on a cold start [ESTIMATE, verify live]. |
| Actions per seat-game | 210–330 [MEASURED with a pass bot], so about 1,000–1,300 Edge invocations per 4-player game. Check the included Edge invocations on the plan's pricing page; `docs/guides/functions/pricing` could not be fetched here. |
| Payload | Request < 1 KB. Response = `out` (2–5 KB) + view (17 KB p50, 53 KB max), so ~6 MB per player-game uncompressed. Gzip JSON in the function (CompressionStream) for ~5×. Later: send the view only when it changes. |
| Storage | Latest full state per seat (≤ ~60 KB, TOAST-compressed) + small action rows. Finished rooms: keep for 30 days, then purge lazily (retention needs owner sign-off). |

---

## 4. Schema and contract [PROPOSAL — nothing applied]

### 4.1 Tables (schema `game`, RLS on, **no policies, no grants**, like the existing 7)
```sql
create table game.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),        -- invite code (rotatable while in lobby)
  host_id uuid not null references game.players(id),
  group_id uuid null,                                                     -- FK after the schema dump (groups table name unknown)
  competition_id uuid null,                                               -- live competition (§1.6) → game.challenges(id)
  status text not null default 'lobby' check (status in ('lobby','playing','paused','finished','cancelled','abandoned')),
  settings jsonb not null,            -- {world, char_policy, char, help, turn_secs, disconnect, end, max_rounds, privacy}; validated by rr_room_create
  rules smallint not null, engine_sha text not null,
  seed bigint not null,               -- NEVER returned while status <> 'finished'
  max_seats smallint not null check (max_seats between 2 and 4),
  round int not null default 0, round_deadline timestamptz,
  version bigint not null default 0,  -- room-level (lobby/round/seat-status changes)
  signal_topic text not null,         -- random 128-bit hex; Realtime doorbell topic
  created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
  last_activity_at timestamptz not null default now()
);
create table game.room_seats (
  room_id uuid not null references game.rooms(id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  player_id uuid not null references game.players(id),
  status text not null default 'joined' check (status in ('joined','ready','playing','away','finished','forfeit','left')),
  char_id text,
  state jsonb,                        -- full engine state (rng inside) — read only by the Edge Function
  view jsonb,                         -- redacted state (room_core.redact) — returned to this seat only
  pub jsonb,                          -- public per-round summary {month, progress, passive, expenses, nwBand, over, news[]}
  state_version bigint not null default 0,
  rolled_round int not null default 0,
  done_round int not null default 0,
  result jsonb,                       -- end summary + rank
  last_seen timestamptz, conn_id text, timeouts smallint not null default 0,
  primary key (room_id, seat), unique (room_id, player_id),
  check (octet_length(state::text) < 400000)
);
create table game.room_actions (
  room_id uuid not null, seat smallint not null, seq bigint not null,
  action_id uuid not null, a jsonb not null, by text not null check (by in ('player','timeout')),
  from_version bigint not null, response jsonb not null,  -- stored for idempotent replays (trimmed out + view hash)
  at timestamptz not null default now(),
  primary key (room_id, seat, seq), unique (room_id, seat, action_id),
  foreign key (room_id, seat) references game.room_seats(room_id, seat) on delete cascade
);
create table game.room_events (            -- public room feed: joins/leaves/round summaries/reactions
  id bigserial primary key, room_id uuid not null references game.rooms(id) on delete cascade,
  round int, kind text not null check (kind ~ '^[a-z_]{1,24}$'), data jsonb not null check (octet_length(data::text) < 1024),
  at timestamptz not null default now());
create index on game.rooms (status, last_activity_at);
create index on game.room_seats (player_id);
create index on game.room_events (room_id, id);
```
Limits enforced in SQL: ≤ 3 open rooms per player, ≤ 10 rooms created per player per day, ≤ 120 actions per seat per minute (Edge),
≤ 6,000 actions per seat (`MAX_ACTIONS`), reactions from a fixed list only, ≤ 1 per 3 s.

### 4.2 SQL RPCs (`public.rr_room_*`, SECURITY DEFINER, `search_path=''`, `game.auth` first)
| RPC | Args (+ `p_id, p_secret`) | Returns / errors |
|---|---|---|
| `rr_room_create` | `p_settings jsonb, p_group uuid null` | `{room_id, code}` · `bad_settings`, `too_many_rooms`, `rate_limited`, `not_member` |
| `rr_room_join` | `p_code text` | room snapshot · `room_not_found` (unknown/finished/full/started: one code to avoid an oracle), `room_full`, `not_member` (group rooms) |
| `rr_room_ready` | `p_room, p_ready bool, p_char text null` | `{version}` · `bad_char`, `not_in_room`, `room_started` |
| `rr_room_leave` | `p_room` | lobby: frees the seat (host moves) · playing: forfeit |
| `rr_room_kick` | `p_room, p_seat` | host, lobby only |
| `rr_room_state` | `p_room, p_since bigint null` | `{unchanged:true}` or `{room:{id, code, status, settings, round, deadline, version, now, signal_topic, seed (finished only)}, seats:[{seat, nickname, pawn, status, connected, done, pub}], me:{seat, view, state_version}, events:[…last 30]}` |
| `rr_room_heartbeat` | `p_room, p_conn text` | `{version, state_version, deadline, now, needs_tick, primary:bool}` |
| `rr_room_react` | `p_room, p_kind text` | fixed list (👏 😮 😂 💪 "כל הכבוד" "עוד סיבוב!") |
| `rr_my_rooms` | — | open rooms of the player (resume list) |
Internal functions used only by the Edge Function's own DB connection (no EXECUTE for anon): `game.room_load(room, player)` and
`game.room_commit(room, seat, expected_version, action_id, a, by, state, view, pub, response)` (CAS, then round close, then the
`version` bump, all in one transaction).

### 4.3 Edge Function `room` (`verify_jwt=false`, authenticates itself)
```
POST {op:'start', id, secret, room}                       host; all seats ready → createGame per seat (server seed), round 1
POST {op:'act',   id, secret, room, action_id, state_version, a:['r'] | ['c','buy',2] | ['L',5000] | …, engine:'<client sha>'}
POST {op:'tick',  id, secret, room}                       any member; applies overdue timeouts (idempotent per round)
200 {ok:true, state_version, room_version, out:{dice,steps,paydays,news,event,end,double,mentor}, view, round_done, now, replayed?}
400 bad_action|bad_json · 401 unauthorized · 403 not_in_room · 409 stale{state_version,view} | not_your_roll | room_not_playing
413 too_big (body > 8 KB) · 422 illegal_action{msg} · 426 version_mismatch · 429 rate_limited · 503 engine_unavailable · 500 server_error
```
The pure parts go in `supabase/functions/room/room_core.js`, unit-testable in Node: `newSeatState(settings, seed, charId, dateKey)`,
`validateIntent`, `apply(stateJson, a) → {state, out}`, `redact`, `pub`, `safeDefault(event)`, `autopilot(state, budget)` and
`rank(seats, metric)`. `index.ts` does only I/O (like verify-result).

### 4.4 Offline development and test plan
1. `tests/room_core.test.mjs` (Node, imports `room_core.js` + `js/engine.js`):
   - 4 seats × random policies × w1–w4. Final seat states equal `E.replay(cfg, actions)`, and `verify_core.verifyGame` accepts them
     (server audit).
   - **Leak test:** no `rng`/`bizRng`/`bizStory` value, dd truth, `negR`/`raiseR`/hidden/coin-path/story value appears anywhere in any
     view.
   - **Parity:** `metrics`/`currentEvent` on the view equal those on the state, with greedy and random policies too (extends my pass-only
     probe).
   - safeDefault fuzz: always exists and is never risky.
   - Idempotency: the same `action_id` returns the same response. CAS: a stale version is rejected.
   - Round close and autopilot. Ranking ties.
2. `tests/fairness.test.mjs` (§2.4).
3. `tests/fakebackend.py`:
   - Add `rr_room_*` to `PARAMS` (`fakebackend_test.py` already fails on drift with `net.js`).
   - Implement the SQL semantics in Python (CAS, unique action ids, limits, lazy abandonment), using the injectable clock (`fb.advance`)
     for timeouts.
   - Route `/functions/v1/room` (both in `install()` and in `serve()`) to a **Node sidecar `tests/fakeroom.mjs`** that runs the **same
     `room_core.js`**, like `fakeverify.mjs`.
   - Fault switches: `fail_network('room')`, `fb.fail('rr_room_state', …)`, delayed responses (out of order), duplicate delivery.
4. `tests/backend_contract.mjs`: add every `rr_room_*` and `room` case: happy path, every error code, limits at their boundary, stale,
   duplicate. These run against the fake now and against staging later.
5. **Multi-identity browser suite** `tests/room_e2e.py`: 2–4 Playwright **contexts** (separate `localStorage` identities) on one
   `FakeBackend`. It covers every §30 item:
   - create → join (bad/unknown code) → ready → start
   - acting out of turn (rolling twice in a round)
   - double click (one apply)
   - parallel acts from 2 tabs of the same identity (one applies, one gets 409)
   - duplicate or out-of-order responses
   - stale state after a reload
   - `ctx.set_offline(True)` then return (resume with the same `action_id`)
   - host leaves mid-game
   - timeout (`fb.advance(seconds=…)`, autopilot never buys)
   - finish exactly once (results written once, the rank shown in every context)
   - `assert_clean(fb)` (no real network)
   - 360 px RTL screenshots of the lobby, waiting and results views.
6. The Realtime flag is tested offline with `ctx.route_web_socket` serving a fake Phoenix broadcast. The default suite stays poll-only.

**Only live** (needs staging, or approval of a production dry run with `טסט` identities):
- Real PL/pgSQL CAS and unique-index races under concurrency.
- SECURITY DEFINER / grants (no anon EXECUTE on `game.room_*`).
- Edge cold start, region placement and per-action latency.
- Gateway body limits, gzip, CORS.
- Realtime delivery and quotas.
- Engine pin loading after a deploy.
- Real clock skew on phones.

---

## 5. Production changes that need the owner's explicit approval
| # | Change | Kind |
|---|---|---|
| P0 | Read-only schema dump of `game` + `public.rr_*` committed as a baseline migration | reads production; **prerequisite for #4–#6** |
| P1 | Staging: a second (free) Supabase project, or a paid branch | creates a project (never buy branching without approval) |
| 1 | Migration: `rooms`, `room_seats`, `room_actions`, `room_events` + `rr_room_*` + internal `game.room_*` | additive |
| 2 | Deploy Edge Function `room` (`verify_jwt=false`), forced to the DB region; re-pin both functions at each release | new function |
| 3 | Realtime Broadcast doorbell (public random-topic channel; the server sends with the service key inside the function) | config/usage |
| 4 | Groups v2: role, description, invite rotation, join throttle, transfer/remove RPCs; replace `rr_join_group`, `rr_leave_group`, `rr_group` | alters existing tables/functions (rollback text required) |
| 5 | Competitions: new columns on `challenges`; replace `game.board` (shared rank, grace window, cancelled filter) | alters existing (rollback kept, like t15b) |
| 6 | S3 pepper + `results.seed` (affects future seeds after a cut-over date) | alters seed derivation |
| 7 | Retention/cleanup of finished rooms (lazy SQL, or pg_cron if preferred) | data deletion policy |
| 8 | Optional hardening: revoke legacy RPCs (L1), `rr_rotate_secret`, register throttle | alters grants |

---

## 6. Risks and incremental plan (flags)

**Risks**
- *Engine/site/function version skew.* A room is bound to `engine_sha`, and clients are version-checked (426). Releases must deploy
  site + `verify-result` + `room` together (VERIFY_INTEGRATION §4 extended).
- *Redaction misses a future sealed field* added by a later engine task. Mitigation: the leak test plus a rule in TASK_BOARD that
  every new sealed field must be added to `redact` (better: export `redactedView(st)` from the engine at the next planned re-pin, so
  the list lives next to `shadowOf`).
- *Local `describe` on a redacted pending differs from the server's.* Mitigation: prefer the server's `out.event`, plus the greedy
  parity test.
- *Latency on phones and cold starts.* Mitigations: optimistic UI for dice animation only (the result is shown when it arrives), pin
  the region, gzip, poll fallback.
- *Unknown production SQL* (names, `rr_finish` behaviour, deadline handling). Mitigations: P0 dump, and the contract test against staging.
- *Quota.* Edge invocations scale with actions (about 300 per seat-game), and egress with view size. Monitor, and cap rooms per player.
- *Kids' safety.* No free chat (fixed reactions), nicknames escaped, no public member lists, invite-only rooms.
- *Scope creep.* No trading or loans between players, no matchmaking, no spectators in the MVP.

**Plan** (each step behind a flag in `js/flags.js` `ALLOWED`/`DEFAULTS`; all default **off** until approved)
| Step | Content | Prod changes | Flag |
|---|---|---|---|
| 0 | `docs/FAIRNESS.md` + `tests/fairness.test.mjs`; `room_core.js` + unit tests; fake + `fakeroom.mjs` + contract cases; `RemoteDriver` in `game.js`; lobby screens (create, join, waiting room, results) | none | `rooms` (via `?ff=rooms` only) |
| 1 | Approvals P0 (+ P1); apply #1, deploy #2; owner + `טסט` identities play live; measure latency and invocations | #1, #2 | `rooms` for testers |
| 2 | Groups v2 (§1.5) | #4 | `groups2` |
| 3 | Competitions v2 async (§1.6); live competition = scheduled room | #5 (+ #6) | `comp2` |
| 4 | Realtime doorbell; "sealed" async competitions as single-seat rooms | #3 | `roomRealtime`, `sealedComp` |

**Realistic MVP in this codebase:** steps 0–1. These are private 2–4-player invite rooms with simultaneous rounds on a shared
server seed, poll sync, safe-default timeouts, reconnect by snapshot, fixed reactions, and a final ranking. Rough size:
`room_core.js` 400–600 lines, `index.ts` about 200, SQL about 350, client (`net.js` + lobby room screens + `RemoteDriver`) about
600–700, fake + tests about 800. The engine is unchanged, so there is no re-pin for the engine itself (only the new function ships the
existing pinned bundle).
