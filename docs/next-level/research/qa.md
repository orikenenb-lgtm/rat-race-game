# Research — Quality, performance, accessibility & offline test backend (Next Level, T7 → NL-15 / NL-16)

Branch `feat/rat-race-next-level`. Read-only investigation: no existing file was edited, nothing was committed, and **no request reached the production Supabase project** (`xvqaxphyfqdzkddmoosu`). Every browser run below either DNS-blocked all non-localhost hosts (`--no-proxy-server --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE localhost"`) or answered Supabase URLs from an in-process fake with a catch-all abort guard behind it.
Tags: **[OBSERVED]** = ran it here, **[CODE]** = read in the source (file:line), **[HYPOTHESIS]** = inferred, not run.

Method / environment
- Machine: 2 shared cores, 8 GB. **Other agents were running browser suites at the same time**: the 1-minute load average was 4.5–7.7 during my runs, and it is recorded per run. Timings are therefore noisy. Bytes, request counts, heap, DOM and WebGL object counts are stable.
- Browser: Playwright (Python) + `/usr/bin/google-chrome`, headless, `--use-gl=angle --use-angle=swiftshader` (software WebGL, the same flags as `tests/*.py`). **Swiftshader makes every rendered frame CPU-bound**, so FPS and "3D init" times here are pessimistic. They work as a before/after yardstick under identical conditions. They do not predict what a phone does.
- Site copy: `http://localhost:8772/` (`/tmp/rr2real`: the real game files, three.js 0.170 served locally). **Measured code = the runtime files of HEAD `6782efd`.** At 17:00, `diff -rq js/css` showed the copy identical to the checkout. Another session rebuilt the copy at 17:17, and every HEAD file it contains is byte-identical to HEAD. HEAD's new modules `js/render/*`, `js/flags.js`, `js/saves.js` and `css/stability.css` are not in the copy and are not imported by HEAD's `index.html`/`main.js`. Other sessions edited `index.html`, `engine/game/lobby/main/rng/scene.js` from 17:22 on without committing. **Those edits are NOT in any measurement here.** The fake-backend prototype used `/tmp/rr2lobby` (built 16:27).
- Scratch scripts and raw output: `/tmp/research-qa/` (`perf_probe.py`, `a11y_probe.py`, `followup_probe.py`, `fake_proto.py`, `hashtext.py`, `*.json`, `shots/*.png`). axe-core 4.14.1 was installed with `npm i axe-core@4` in `/tmp/research-qa/axe`.
- **Not run:** none of the existing suites (`tests/*.py`, `tests/*.mjs`). No real device. No screen reader. No axe on the group page, end screen or event card. No CPU throttling.

---

## 0. Summary (most important first)

1. **Four lobby suites write to production today**, and three more scripts do too. A stateful in-memory fake for all 19 client-facing `rr_*` RPCs plus `verify-result` is feasible: a 250-line prototype drove a two-player register → daily → group → challenge → feed flow fully offline, 7/7 checks [OBSERVED]. The design is in §2. Estimated size is ~600 LOC for `tests/fakebackend.py`, ~50 LOC for a node replay sidecar, and ~100 LOC of edits across the suites.
2. **The lobby is on screen in about 0.4–0.5 s, then the main thread freezes for 13–20 s in a single task, and a second freeze of ~12 s follows** (software GL, 3 runs). A click on a world card in that window waits up to ~35 s. First roll came 23–36 s after navigation. On Fast 3G: lobby at 8.5 s, **46 s from tapping a character to an enabled roll button**, and 55 s from navigation [OBSERVED].
3. **8.6 MB per cold visit, and all of it loads before the first roll** (59 requests): 4.7 MB GLB, 2.4 MB JS (three.module.js alone is 1.3 MB unminified), and 1.5 MB PNG. The life and history GLBs (wedding, time machine, home_family, pension, university, hand; about 2.5 MB) are fetched at boot although the first game needs none of them [OBSERVED].
4. **Detached-DOM leak:** each new game from the lobby keeps about 580 more DOM nodes alive after GC. Attached nodes stay at about 530. The total went 1 309 → 4 531 over 5 re-entries. Live WebGL buffers and VAOs creep upward too (buffers 206 → 437) [OBSERVED].
5. **Keyboard and screen-reader:** the lobby overlay is not modal. The first 5 Tab stops in the lobby are hidden game-HUD buttons, and the HUD stays in the accessibility tree. Opening a world drops focus to `<body>`. A 6-option event card did not receive focus and has no focus trap: Tab leaves the card into the HUD. Rolling the dice takes 18 Tabs [OBSERVED].
6. **axe (WCAG 2.2 AA plus best practice), 9 screens:** 1 critical issue (`#hGoal role=meter` has no `aria-valuenow`) and 3 serious ones: contrast (`.lb-title` 3.64:1 on every screen, gold/green small text 2.83–4.23:1 in light mode), label-in-name (WCAG 2.5.3), and duplicate banner landmarks. No button is missing a name [OBSERVED].
7. **Text-only zoom does nothing:** 0 of 32 sampled lobby text elements grew when the root font-size was set to 200%, because sizes are in px. Page zoom to 200% causes no overflow. The HUD has 12 of 13 phone controls under 44 px (life chips are 30 px tall). None are under 24 px [OBSERVED]. `scene.js` ignores `prefers-reduced-motion` [CODE]. Lobby CSS respects it (7 running animations → 0) [OBSERVED].

---

## 1. Backend inventory — every call the client makes

### 1.1 Who calls the network [CODE]
- Only `js/net.js` talks to Supabase. Its `rpc()` wrapper (`net.js:40-48`) sends `POST {SB}/rest/v1/rpc/<fn>` with headers `apikey` and `Content-Type: application/json`, a JSON body, and no auth session. Errors: `!r.ok` → `e.code = j.message` (the PostgREST envelope `{code:'P0001', message:'<code>'}`), and the Hebrew text comes from `ERR` (`net.js:8-33`). A network failure throws "אין חיבור לשרת…" with no `code`.
- `net.verify()` (`net.js:99-109`) sends `POST {SB}/functions/v1/verify-result`. The error code is read from `j.error`, plus `e.status`. A network failure gives `code='offline'`.
- Callers: `js/lobby.js` (all lobby features), `js/progress.js:369-392` (profile sync), and `js/game.js:50-74` (ranked checkpoints only). `grep fetch(` over `js/` finds no other caller. `tests/security_live.mjs` calls production directly from Node.
- The other external hosts are Google Fonts (`index.html:12-14`) and jsDelivr three.js (`index.html:17`). The test copies rewrite three to `/three/`, but **the fonts are still fetched from the internet by every Playwright suite** [CODE + OBSERVED: the perf probe recorded the attempt].

### 1.2 RPC table
Auth for every row except `rr_register2` is `{p_id, p_secret}` (localStorage `rr-player`), checked server-side by `game.auth()` (sha256) [CODE: docs/ARCHITECTURE.md:166]. Error codes come from `net.js ERR`, `tests/security_live.mjs` (live evidence from 2026-11-20), and `lobby.js` handling.

| Feature | RPC (`net.js` line) | Params (beyond auth) | Response (as the client reads it) | Error codes / limits |
|---|---|---|---|---|
| Identity | `rr_register2` (55) | `p_nickname, p_ref` (referrer id or null) | `{id, secret, nickname}` → stored as `rr-player` | `bad_nickname` (2–20 chars). No rate limit (SECURITY_REVIEW). The referrer gets +5⚡ (≤5 referrals/day/referrer) |
| | `rr_rename` (66) | `p_nickname` | `{nickname}` | `bad_nickname`. Stored verbatim (HTML allowed; the client escapes) |
| | `rr_profile` (68, also `restore` 112) | — | `{id, nickname, stars{w1..w4}, total_stars, achievements[], pawn, daily_streak, best_streak, last_daily, meta{games,wins,best{}}}` | `unauthorized` (`restore` maps any error → "קוד שחזור לא תקין") |
| | `rr_sync_progress2` (71) | `p_stars{}, p_achievements[], p_pawn, p_meta` | profile (same shape) | Server merge: max stars per world capped at 3, union of valid achievement ids, pawn validated, meta max games/wins and min best. Unknown keys dropped (live) |
| Groups | `rr_create_group` (73) | `p_name` | group `{id, code, name, …}` (the lobby uses `.id`) | `bad_name` (2–40), `too_many_groups` (20) |
| | `rr_join_group` (74) | `p_code` (6 chars, uppercased by the client) | `{id, name, …}` | `group_not_found`, `group_full` (50). Unthrottled |
| | `rr_leave_group` (75) | `p_group` | ok | `not_member` |
| | `rr_my_groups` (77) | — | `[{id, code, name, is_owner, members:int, active:int}]` | — |
| | `rr_group` (79) | `p_group` | `{id, code, name, is_owner, members:[{nickname, owner, me, stars, pawn}], challenges:[{id, title, profession, world, starts_at, ends_at, active, my_status, board}]}`. Polled every 20 s while open (`lobby.js:910`) | `not_member` (live) |
| | `rr_create_challenge2` (80) | `p_group, p_title, p_world, p_char, p_days` | `{id, …}` (`lobby.js:1693` uses `.id`) | `bad_title` (2–50), `bad_world`, `bad_profession`, `bad_days` (1–30), `too_many_challenges` (5 active), `not_member` |
| Ranked | `rr_daily` (85) | — | `{key, world, char_index, max_months(24), ends_at, my_status(null/playing/won/lost), streak, board}` | — |
| | `rr_weekly` (83) | — | `{key, world, char_index, profession(v1, unused), ends_at, my_status, board}` | — |
| | `rr_begin` (88) | `p_mode` (`daily`/`weekly`/`challenge`), `p_challenge` | `{result_id, status, seed, world, char (challenge only), char_index (daily/weekly), max_months, title, group_id, streak, checkpoint_turn, checkpoint}`. **Idempotent:** a second call returns the same row and its checkpoint (`lobby_v21.py`) | `challenge_closed`, `challenge_not_found`, `not_member`. A finished row comes back with `status≠'playing'` and the lobby toasts "כבר סיימת" |
| | `rr_checkpoint` (90) | `p_result, p_turn` (monotonic `S.ui.seq`), `p_state` (full engine state) | ok | `result_not_found` (also for someone else's result), `stale_checkpoint` (turn below the stored one; live: 5 after 10), `state_too_big` (>~300 KB; 320 KB rejected live). Arbitrary state accepted (S2) |
| | `rr_finish` (92) | `p_result, p_status, p_months(1–200), p_passive, p_expenses, p_net_worth, p_stats` | ok | `already_finished`, `result_not_found`, `unauthorized`. **Stats ≥16 KB are dropped** (`lobby.js:323`). Trusts the client (S1). Writes `ranked_won`/`ranked_lost` feed rows [HYPOTHESIS: the feed shows them; the client never logs them, `lobby.js:455`] |
| Board rows (inside daily/weekly/group) | `game.board()` (SQL in repo) | — | `[{nickname, status, months, net_worth, passive, expenses, me, stars(total), pawn, progress, verified}]`, limit 100 | Order: rejected last → won/lost/playing → verified first → won: months asc / else −progress (fallback passive/expenses) → net_worth desc → passive desc → finished_at/started_at asc (`20261120_t15b_board_verified.sql:12-29`, **not applied in production yet**; the live order lacks `o0/ov` and the `verified` key) |
| Social v3 | `rr_send_energy` (59) | `p_group, p_nickname` | ok | `already_sent_today` (unique from-to-day), `player_not_found`, `not_member` |
| | `rr_claim_energy` (61) | — | `{total, from:[{nickname, kind:'gift'\|'referral', amount}]}` | Gift 3⚡, referral 5⚡ capped at 5/referrer/day (live: 6 sign-ups → 25) |
| | `rr_log_event` (63) | `p_kind, p_data` | ok | `bad_kind` (regex; not in `ERR`), `rate_limited` (50/day), data <2 KB. **Data is echoed verbatim to group members** (XSS surface, fixed client-side) |
| | `rr_group_feed` (65) | `p_group` | `{feed:[{nickname, kind, data, at, me}], gifted_today:[nickname]}` (the lobby shows 12). Kinds: `escaped, world_unlocked, stars3, history_done, ranked_won, ranked_lost, gift/energy, joined` (`lobby.js:939-955`) | `not_member` |
| Edge Function | `verify-result` (99) | body `{id, secret, result_id, actions}` | 200 `{ok, verified:true, stored, already?, result}` or `{ok, verified:false, stored, error:'replay'\|'claim_mismatch', detail, result}` | 400 `bad_json/bad_request/bad_actions`, 401 `unauthorized`, 404 `result_not_found`, 409 `not_finished`, 413 `too_big`, 422 `no_actions/unsupported_mode/bad_world/bad_char/bad_seed`, 429 `rate_limited` (10/min/isolate, 5 attempts/result in stored mode), 503 `engine_unavailable`, 500 `server_error` (`index.ts`, `verify_core.js`). The client retries offline/503/5xx/429/409 up to 30 times over 14 days (`lobby.js:326-328`, 349) |
| Legacy (unused) | `rr_register`, `rr_start`, `rr_create_challenge`, `rr_sync_progress` | | | still executable (SECURITY_REVIEW L1) |

### 1.3 Gaps (SQL not in the repo)
- `supabase/migrations/` holds only **2 files**: the T-15 columns (6 additive columns) and `game.board()` with its rollback. **Neither is applied in production yet** (headers of both files). None of the 19 client-facing `rr_*` definitions (23 with the legacy ones) are in the repo, and neither are `game.auth/day/week`, tables, indexes or RLS. Everything in §1.2 beyond `board()` is derived from client code, docs (ARCHITECTURE §DB, SECURITY_REVIEW) and live evidence in `security_live.mjs`. A local Supabase stack or staging branch cannot be built from the repo today.
- **Seed formulas.** I ported PostgreSQL `hash_bytes()`/`hashtext()` to Python (`/tmp/research-qa/hashtext.py`, Appendix B). `abs(hashtext('ratrace-2026-W48')) = 1382272518` matches the production week-48 seed documented in SECURITY_REVIEW §3.3, which **confirms the port and the weekly key format `IYYY-"W"IW`** [OBSERVED]. The **daily key format is unknown**: 84 candidate formats (7 dates × 12 formats, plus prefixes) did not reproduce the documented 1960546479/776670202. The day→world/character rotation (`game.day()`, "an array by weekday" per PROJECT_AUDIT) is also not in the repo.
- Unknown exact semantics, to confirm read-only before the fake is called "faithful": does `stale_checkpoint` fire on an equal turn? Does `rr_begin` bump the streak on begin or on finish? Which feed rows does the server write (`joined`, `gift`, `ranked_*`), and to which groups? What fields does `rr_create_group` return? Which HTTP status does PostgREST use for `RAISE` (400 assumed; the client only reads `message`)?

---

## 2. Offline fake backend for Playwright (design for NL-16)

### 2.1 Which tests touch the backend today
| Suite | Port | Live writes today | RPCs it needs (offline) | Notes |
|---|---|---|---|---|
| `lobby_e2e.py` | 8771 | yes: 2 players, 1 group, 2 challenges, daily + weekly + challenge results | register2, sync_progress2, profile, claim_energy, daily, weekly, my_groups, begin (×3 modes), finish, create_group, create_challenge2, join_group, group (+20 s poll seen by a 2nd context), group_feed, log_event, leave_group, restore→profile | Shared state across 3 contexts (A, B, C). Writes `/tmp/lb/creds.json` for `lobby_shots.py` |
| `lobby_v21.py` | 8771 | yes: 2 players, a daily result + checkpoint | register2, sync_progress2, claim_energy, daily (`my_status:'playing'` → "להמשיך"), weekly, my_groups, begin daily ×2 (idempotent + checkpoint), checkpoint (real engine state), profile (restore), log_event | Needs `rr_begin` to return the stored checkpoint |
| `lobby_v3.py` | 8771 | yes (social only): 2 players, group, gift, referral | solo_flow: **none** (guest). social: register2 **with p_ref**, daily, begin, finish, create_group, join_group, send_energy, claim_energy (must total **exactly 8 = referral 5 + gift 3**), log_event, group_feed (`gifted_today`), group, my_groups, weekly, sync | Referral and gift accounting must be exact |
| `lobby_v3b.py` | 8771 | `live_xss` only (default ON; `--no-live` skips it) | Already mocked: scripted `Mock` (`lobby_v3b.py:45-103`) for profile, claim, daily, weekly, my_groups, group, group_feed, begin, finish + verify queue. live_xss: register2, create_group, create_challenge2, log_event, join_group, group, group_feed, leave_group | Keep `Mock` as an override layer (payload injection) on top of the stateful fake |
| `lobby_real.py` | 8772 | `checkpoint_resume` only: 1 player, a daily + checkpoints | register2, daily, weekly, my_groups, claim, sync, begin daily ×2, checkpoint (DRIVE + the **real** `game.js` pump), profile (restore) | Real game ⇒ many `rr_checkpoint` calls with full states |
| `lobby_shots.py` | 8771 | yes: group + challenge per config, finishes | create_group, create_challenge2, begin challenge, finish, group, daily, weekly, my_groups, profile, sync, claim | Depends on a live player from `lobby_e2e` → offline: seed a player into the fake directly |
| `lobby_smoke.py` | 8771 | no (guest) | none | Needs only the guard |
| `game_e2e.py` | 8770 | no | `rr_checkpoint` (already `page.route`d, `game_e2e.py:282-288`) | Add the guard |
| `security_live.mjs` | Node | **yes by design** (prod security evidence) | all | Live-only. Offline counterpart: run the same cases as a contract test against the fake's HTTP mode (§2.6) |

### 2.2 Shape
- **One module, `tests/fakebackend.py`**, holding a pure-Python class `FakeBackend` with `handle(fn, body) -> (status, json)`. All state lives in memory: players `{id, secret, nickname, stars, achievements, pawn, meta, streaks, ref, gifts[]}`, groups `{id, code, name, owner, members[]}`, challenges `{id, group, title, world, char, seed, starts_at, ends_at}`, results `{id, player, daily|weekly|challenge key, status, seed, world, profession, months, passive, expenses, net_worth, stats, checkpoint, checkpoint_turn, started_at, finished_at, verified, verify_attempts}`, feed rows, gift rows and daily counters.
- **Why Python in the test process and not JS in the page:** several suites need **one backend shared by 2–3 browser contexts** (A creates a group, B joins via link, A's page sees B's result through the 20 s poll). Route handlers in the test process share state for free. In-page fakes would need a cross-context channel.
- **Install with one helper:** `fb = FakeBackend(); await fakebackend.install(ctx, fb)`. It registers:
  1. `ctx.route(SB + '/rest/v1/rpc/**')` → `fb.handle` (answers the CORS `OPTIONS` preflight with 204 + `access-control-allow-*`; errors as `400 {code:'P0001', message:<code>}`, the PostgREST envelope),
  2. `ctx.route(SB + '/functions/v1/verify-result')` → `fb.verify` (§2.4),
  3. **a catch-all guard** `ctx.route('**/*.supabase.co/**', abort)` registered *first*, so any route not handled above is aborted and recorded in `fb.blocked`. Playwright gives priority to the most recently registered route. A suite asserts `fb.blocked == []` at the end.
- **CLI flag, the same in every suite:** `mode = fakebackend.mode_from_argv()`, which is `offline` by default. `--live` exits with a message unless `RR_LIVE=1` is also set in the environment. The double opt-in matches the board rule: no writes to production in this wave. In offline mode the helper also adds `--host-resolver-rules=MAP *.supabase.co ~NOTFOUND` to the launch args (defense in depth: even a `fetch` from a worker or a missed route cannot resolve the host). The fonts question is separate: allow them, or vendor Rubik/Secular One under `tests/fonts/` and route them, so screenshots are deterministic offline.
- **Clock:** `fb.now` is injectable. Day key = Israel date (`zoneinfo('Asia/Jerusalem')`). Week key = `IYYY-Www` (confirmed). Seeds: weekly `abs(hashtext('ratrace-' + key))`, the same as production [OBSERVED parity]. Daily `abs(hashtext('ratrace-daily-' + key))` with an ISO date key (format unconfirmed, §1.3). Challenge: random 31-bit seed stored on the challenge. Daily world/char rotation is a configurable table (default from the weekday), and `fb.set_daily(world=…, char_index=…)` makes it deterministic per test.
- **Overrides for adversarial tests:** `fb.override(fn, callable)` and `fb.fail(fn, code, status=400, times=1)` keep `lobby_v3b`'s payload injection (`<img onerror>` in every field) and inject 503/409/422 for verify, `stale_checkpoint` once (as `game_e2e` does), or `network` (route.abort) to test the offline/pending-finish queue.
- **HTTP mode:** `python3 tests/fakebackend.py --serve 8779` serves the same `handle()` over `http.server`, for Node contract tests and for manual exploratory runs. The page is pointed at it with a route that rewrites the host. Optional `--state file.json` loads and dumps state, so cross-process flows work (`lobby_e2e` → `lobby_shots`).

### 2.3 Semantics to implement (each mirrors §1.2)
- Auth on every call except register: unknown id or wrong secret → `unauthorized`. A result of another player → `result_not_found`. A group you are not in → `not_member`.
- Validation lengths: nickname 2–20, group name 2–40, title 2–50, days 1–30, world ∈ w1..w4, char ∈ `world.characters` (read the ids from `js/worlds/*.js` once with a small `node -e`, or hard-code them). Limits: 20 groups/player, 50 members/group, 5 active challenges/group.
- `rr_begin`: unique `(player, day|week|challenge)`. A repeat returns the same row and its checkpoint. A closed challenge → `challenge_closed`. Streak: +1 when `last_daily` = yesterday, else 1 (to confirm).
- `rr_checkpoint`: `p_turn < stored` → `stale_checkpoint`. JSON >300 000 chars → `state_too_big`.
- `rr_finish`: only from `playing`, else `already_finished`. Clamp the ranges as `net.finish` does. Drop stats ≥16 KB. Append `ranked_won/lost` feed rows `{title, mode, months, stars, progress}` to the challenge's group (daily/weekly: to every group of the player [HYPOTHESIS]).
- Boards: exactly the `t15b` ordering and keys (code in the prototype). A flag `fb.board_v2=True` reproduces today's production order (no `verified`) until migration B is applied.
- Energy: `send_energy` makes a pending 3⚡ gift (unique from-to-Israel-day) plus a `gift` feed row, and `gifted_today` lists the sender's recipients today in that group. `register2(p_ref)` credits a pending 5⚡ `referral` to the referrer, capped at 5 per referrer per day. `claim_energy` returns and marks all pending gifts.
- `rr_log_event`: kind regex `^[a-z0-9_]{1,30}$` [HYPOTHESIS for the exact regex], data <2 KB, 50/day → `rate_limited`, appended to all of the player's groups. `rr_join_group` appends `joined`.
- `rr_sync_progress2`: as in the table (cap 3, union, meta max/min).

### 2.4 `verify-result` in the fake
- **Default `replay`:** a persistent Node sidecar `tests/fakeverify.mjs` (~50 LOC) reads JSON lines on stdin. It imports `verify_core.js` and the engine exactly as `tests/verify.test.mjs` does (`loadEngine(bundleText(collect()))`), builds the row from the fake result (mode, world, profession or `idx:N`, seed, max_months, the claim) and answers `verifyGame()`. The fake therefore returns real `verified:true`, `claim_mismatch` and `replay:` outcomes, and stores `verified` on the row so boards show ✓/⚠. HTTP codes are as in `index.ts` (401/404/409/422/429 with a 5-attempt cap).
- **`scripted`:** a queue, as `lobby_v3b`'s `M.verify_queue`, for the 503/409/422 retry paths. **Stub-game suites** (`__stubEnd` with fake action logs) use `scripted` or `accept-all`, because their logs are not replayable.

### 2.5 Size and effort estimate [HYPOTHESIS, calibrated by the prototype]
| Piece | LOC |
|---|---|
| `tests/fakebackend.py` (state 80, 19 handlers ~330, boards/keys/hashtext ~90, verify adapter ~60, install/guard/flags/HTTP mode ~80) | ~600–700 |
| `tests/fakeverify.mjs` (replay sidecar) | ~50 |
| Suite edits: e2e ~15, v21 ~10, v3 ~10, v3b ~25 (Mock → overrides; live_xss offline), real ~10, shots ~20 (seed player instead of creds.json), smoke/game_e2e ~4 each | ~100 |
| Contract test `tests/backend_contract.mjs` (the `security_live` cases, target = fake HTTP mode by default, staging with `--live`) | ~150 |
About 1–1.5 developer-days including making every lobby suite green offline. **Prototype evidence [OBSERVED]:** `/tmp/research-qa/fake_proto.py` (≈250 LOC, 13 RPCs + verify + guard, stub-game copy on 8771) passed 7/7: register → daily begin (seed `1448745155`) → finish → own row on the board; group + challenge; a 2nd context joins via `?join=` (shared state); B plays the challenge and ranks #1; A's group page shows B's result and the feed. `fb.blocked == []`. Calls observed: begin 2, claim 1, create_challenge2 1, create_group 1, daily 3, finish 2, group 5, group_feed 4, join 1, my_groups 2, register2 2, sync_progress2 4, weekly 2.

### 2.6 What only a live run can test (keep as opt-in `--live`)
- Real PL/pgSQL behaviour: `security definer` + `search_path`, sha256 auth, **unique indexes under concurrency** (two tabs calling `rr_begin`/`rr_finish` at once), RLS and no direct table access (`security_live` §7), the PostgREST envelope and status codes, JSON number types (e.g. bigint seed).
- Server time: Israel-day rollover, the `game.day()` rotation, and seed parity for the daily.
- The deployed `verify-result`: engine pin loaded from GitHub Pages, dry-run vs stored mode (migrations A/B pending), per-isolate throttle, platform 413/504, cold starts, CORS from the real origin.
- Rate limits keyed to real days (referrals 5/day, events 50/day), and real network latency and timeouts.
- **Proposal:** `--live` = `RR_LIVE=1` + `RR_SB_URL` pointing to a **Supabase branch or staging project**, never production, while this wave runs. That requires the schema (gap §1.3): a read-only `pg_dump --schema-only` of `game` + `public.rr_*` committed as a baseline migration. It needs Uri's approval because it reads production. Live suites keep the `טסט` prefix and clean up by leaving groups. The contract test runs the same cases against fake and staging, which keeps the fake honest.

---

## 3. Performance baseline

### 3.1 Method (identical conditions for "after")
The probe is `/tmp/research-qa/perf_probe.py` (verbatim in Appendix A). Each run uses a fresh browser context, HTTP cache off (CDP), and DNS failure for every non-localhost host. The backend is therefore "routed to failure" without request interception: 5 RPCs were attempted and failed (`rr_claim_energy, rr_daily, rr_my_groups, rr_profile, rr_weekly`), and so did the Google Fonts CSS. localStorage holds `rr2-onboarded=1` and a fake `rr-player`, so the lobby really calls the backend. The viewport is 1300×820 at DPR 1.
- **Phase A (first-run user, tutorial on):** nav → `.lb-home` rendered and `#loading` hidden ("lobby usable") → click world w1 → first character → `#roll` enabled. Marks come from a MutationObserver and the Paint/LCP/Long Task observers. Bytes are CDP `encodedDataLength`. Heap, nodes and listeners come from CDP `Performance.getMetrics` after a forced GC. Live WebGL objects are counted by wrapping `create*/delete*` on the GL prototypes.
- **Phase B (`--leak`; progress seeded, tutorialDone):** rAF counter for 4 s idle in game, 3 s from a dice click, 3 s with the lobby open over the paused game. Main-thread busy % = ΔTaskDuration/Δwall. Then 3 re-entries (lobby → other world → new character), each followed by GC + counts. `followup_probe.py` repeats the re-entry 5× and separates attached nodes (`getElementsByTagName('*')`) from all live nodes.
- Commands: `python3 perf_probe.py http://localhost:8772/ --runs=2` (an earlier revision of the probe without the TTI/resource fields; the numbers shown are the same fields), then `--runs=1 --leak`, then `--net=fast3g` (DevTools preset: 562.5 ms RTT, 180 000 B/s down, 84 375 B/s up).

### 3.2 Results [OBSERVED]
**Phase A — cold first visit, unthrottled (3 runs; load average at start 4.95 / 5.78 / 7.70):**
| Metric | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| First contentful paint | 216 ms | 172 ms | 196 ms | 196 ms |
| Lobby rendered and `#loading` hidden | 522 ms | 458 ms | 363 ms | 458 ms |
| `setTimeout(0)` after the lobby appeared | — | — | 377 ms (responsive at first) | |
| **Long tasks** (count / total / longest) | 11 / 37.0 s / **18.8 s** | 12 / 27.2 s / **13.2 s** | 13 / 38.4 s / **20.1 s** (starts at 1.2 s; 2nd one 12.0 s at 21.8 s) | |
| Main thread quiet again (end of the last long task before the click) | — | — | 35.0 s | |
| LCP | 33.2 s | 21.8 s | 34.1 s | 33.2 s |
| Click on a character → roll enabled (3D already loaded) | 997 ms | 249 ms | 823 ms | 823 ms |
| **Navigation → first roll enabled** | **35.2 s** | **23.3 s** | **35.8 s** | **35.2 s** |
| Requests / bytes (all before the first roll) | 59 / 8.59 MB | 59 / 8.59 MB | 59 / 8.59 MB | |
| Bytes finished before the lobby appeared | | | 36 req / 1 122 KB | |
| JS heap after GC: at lobby → at first roll | 7.3 → 7.9 MB | 7.3 → 8.0 MB | | |
| DOM nodes / listeners: lobby → first roll | 807/68 → 1163/69 | 796/68 → 1163/69 | | |
| Live WebGL objects at first roll | tex 14, buf 114, prog 14, vao 39 | tex 14, buf 114, prog 15, vao 47 | tex 14, buf 114, prog 15, vao 47 | |

Bytes by type (identical every run): Fetch 17 = 4 781 KB (GLB models), Script 33 = 2 409 KB, Image 6 = 1 488 KB, CSS 2 = 113 KB, HTML 5 KB. Largest: `three.module.js` 1 315 KB · `life/wedding.glb` 429 KB · `history/time_machine.glb` 428 KB · `life/home_family.glb` 427 KB · `life/pension.glb` 330 KB · `w1/apartment.glb` 330 KB · `life/university.glb` 316 KB · `life/hand_closed.glb` 300 KB · `life/hand.glb` 300 KB · `history/card.png` 300 KB. The life and history GLBs are requested at ~21.7 s, right after the first freeze, and are followed by the second ~12 s freeze. Note: `python -m http.server` sends no compression. GitHub Pages gzips JS/CSS but most likely not `.glb` [HYPOTHESIS].

**Phase A under Fast 3G (load 4.83):** FCP 2.59 s · lobby usable **8.50 s** (32 requests / 1 024 KB before it) · main thread quiet at 9.5 s (downloads, not CPU, are now the bottleneck: 20 long tasks, longest 2.7 s) · **character click → roll enabled 45.8 s** · navigation → roll 55.4 s · the same 59 requests / 8.59 MB.

**Phase B (seeded, unthrottled, load 6.81 → 5.65):**
| Scenario | rAF rate | Longest gap | Main thread busy |
|---|---|---|---|
| In game, idle 4 s | 34.5 fps | 883 ms | 44 % (script 1 %) |
| Dice throw, 3 s from the click | **1.4 fps** | 1 017 ms | ~100 % (CDP reported 122 %) |
| Lobby open over the paused game, 3 s | 10.5 fps | 183 ms | 9 % |
Rendering is on demand (`scene.js:77-91`): idle still renders ≤1 frame every 2 s, which costs ~0.9 s per frame on swiftshader [CODE + OBSERVED]. Read the dice figure as **"one software-rendered frame ≈ 0.7–1 s at 1300×820 with a 2048² shadow map"**, not as phone FPS.

**Re-entry leak check (GC before each sample):**
| Step | Nodes (all) | Nodes (attached) | Heap MB | Listeners | GL buffers / VAO / textures / programs |
|---|---|---|---|---|---|
| perf_probe: game 1 (w1) → w2 → w1 → w2 | 1 832 → 2 161 → 2 739 → 3 341 | — | 8.5 → 9.5 → 9.2 → 9.7 | 71 → 69 | buf 129 → 303 → 280 → 354 · vao 57 → 109 → 105 → 124 · tex 14–16 · prog 15–16 |
| followup: start (w1, after playing cards) → w2 → w1 → w2 → w1 → w2 → lobby | 1 309 → 1 880 → 2 452 → 3 049 → 3 628 → 4 240 → 4 531 | 543 → 518 → 534 → 521 → 534 → 530 → 530 | 8.6 → 9.6 → 9.2 → 9.8 → 9.4 → 10.0 → 10.0 | 71 → 69 (flat) | buf 206 → 385 → 362 → 393 → 370 → 437 · vao 80 → 135 → 131 → 145 → 141 → 157 · tex 16–18 · prog 15–16 |
Reading: **≈ +580 detached DOM nodes retained per world entry** (attached stays ≈ 530). The JS heap grows only ~0.3 MB per cycle, so the retained nodes are probably small: old lobby/world/end views, or ui card trees, kept alive by a closure or cache [HYPOTHESIS: a heap snapshot "Detached" filter will name the retainer]. GL buffers and VAOs for the same world rise across visits: w1 206 → 362 → 370, w2 385 → 393 → 437. That points to a minor disposal gap (fx/tween meshes or per-game geometry) [HYPOTHESIS]. Textures and programs are stable. Each re-entry also showed a `#gm` confirm (replace the saved game?) that the probe accepts.

### 3.3 What to change for the "after" (inputs for NL-15)
- Measure again with the same probe, same flags, `--runs=3` (median), and record the load average. Add one real-phone manual run (Chrome remote debugging: Performance panel, the same 4 marks) because swiftshader inflates GPU-bound work.
- Targets proposed for the "after", on this machine and these conditions: no long task >1 s after the lobby appears; cold bytes before the first roll ≤ 3.5 MB; Fast 3G character click → roll ≤ 15 s; nodes flat (±50) across 5 re-entries; GL buffers flat per world.

---

## 4. Accessibility baseline

### 4.1 axe-core 4.14.1 (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice) [OBSERVED]
Screens: lobby home, world w1, profile, library × (desktop 1300 light, phone 390 dark), plus the in-game HUD (desktop, tutorial game after one roll). Guest user, backend unreachable.
| Rule (impact, WCAG) | Where | Detail |
|---|---|---|
| `aria-required-attr` (**critical**, 4.1.2) | every screen (the HUD is in the DOM under the lobby) | `#hGoal role="meter"` without `aria-valuenow` (`index.html:33`) |
| `color-contrast` (serious, 1.4.3) | all 9 | `.lb-title` white on `#8a8396` = **3.64:1** (every screen, both themes). Light only: world cards 17 nodes (green `#178a55` on `#f6eedd` 3.78; gold `#a86b00` on `#fffaf0` 4.23), profile `.pf-total` `#c98a12` on `#fffaf0` **2.83**, map "next" line 4.23, game sheet red `#d23b30` on `#f6eedd` 4.12, green on `#fffaf0` 4.20. Dark: only `.lb-title` |
| `label-content-name-mismatch` (serious, 2.5.3) | lobby, world, profile, library, HUD | `#homeBtn` (visible "לובי" ≠ name "חזרה ללובי (המשחק נשמר)"), `.lb-player`, `.lb-energy`, `#hEnergy` |
| `landmark-no-duplicate-banner`, `landmark-unique` (moderate) | lobby screens | the game `<header id="hud">` stays exposed while the lobby is open |
| `region` (moderate) | all; library 160 nodes | content outside landmarks (`#c` canvas, lobby sections) |
| `button-name` | none | plus a custom scan: no visible button/link with an empty name (icon buttons carry `aria-label`) |

### 4.2 Keyboard-only flow (desktop 1300, Tab/Enter only) [OBSERVED]
| Step | Result |
|---|---|
| Lobby → w1 card | **10 Tabs.** Stops 1–5 are the game HUD buttons behind the lobby overlay (`#homeBtn, #turboBtn, #muteBtn, #camBtn, #voiceBtn`): the overlay is not modal and the game is not `inert`. Then profile, energy, mute, "יאללה", w1 card. **Focus was visible on every stop** (outline/box-shadow computed under `:focus-visible`) |
| Enter on w1 → world view | **Focus lands on `<body>`** (the view is re-rendered with `innerHTML`; no focus management) |
| → character | 3 Tabs (back chip, mini-player, first character). Enter starts the game |
| Game start (tutorial) | The coach bubble takes focus ("הבנתי") and Enter dismisses it ✓ |
| → Roll | **18 Tabs** (HUD, 7 life chips, energy, turbo, mute, camera, payslip `<summary>`, 3 sheet actions, voice, then roll; roll comes last in DOM order). Enter rolls ✓ |
| Event card, run 1 (tutorial, pass/buy card) | Focus moved into the card, on its primary button "לוותר", **while a coach bubble was also visible**. Enter therefore acts on the card, not on the coach [OBSERVED focus; consequence HYPOTHESIS] |
| Event card, run 2 (monthly plan, 6 enabled buttons, no tutorial) | **Focus stayed on `<body>`.** Tab went through the 6 card buttons, then `<body>`, `#homeBtn` and the life chips behind the modal (`aria-modal="true"` but **no focus trap**). Shift+Tab from the start went into the HUD. Escape does nothing (acceptable for a mandatory decision). Screenshot `followup_card_tab.png` |
| Generic modal `#gm` | Moves focus to its primary button and restores focus on close, Escape only when `dismissable`; no Tab trap [CODE `ui.js:103-123`] |

### 4.3 Targets, motion, zoom, widths [OBSERVED unless tagged]
- **Touch targets** (visible interactive elements; `min(w,h)`):
  - Lobby: 1–2 under 44 px at every width ("לבחור כינוי" chip 94×36, "יאללה" 68×40 on phones, "› למפה" 73×36, mini-player 138×40). None under 24.
  - Game HUD: **12 of 13 (at 360) and 12 of 14 (at 390 and 414)** controls are under 44 px. The life chips `button.lc` are 30 px tall (34 on tablet/desktop), turbo/mute are 32×44 at 360 and 40×46 at 390+, `#homeBtn` is 42×44 at 360, and voice is 40×40. None are under 24 px. So the HUD passes WCAG 2.2 AA 2.5.8 (24 px) and misses the 44 px goal (2.5.5 AAA / platform guidance).
- **prefers-reduced-motion:** lobby with no preference: 7 running CSS animations, including 2 infinite (`lb-pulse`, `lb-glow`). With `reduce`: 0. In-game, `ui.js:479` and `lobby.js:1504` check it, but **`scene.js` has no check** (camera shake `scene.js:1026`, pawn hops, dice and coin tweens, auto-rotating pawn) [CODE].
- **Text-only zoom 200%** (root `font-size:200%`): **0 of 32** sampled lobby text elements changed size, because font sizes are in px. Browser font-size settings will not help low-vision users [HYPOTHESIS for Chrome's setting; the root-size test is OBSERVED]. Page zoom 200% (650 CSS px at DPR 2): no horizontal overflow (`scrollWidth 650 = innerWidth`).
- **Widths 360/390/414/820/1300:** no horizontal overflow in the lobby or the game. Roll is fully visible at every width (131×51 at 360). HUD height is 118–122 px on phones and 94 px at 820. Screenshots: `a11y_lobby_{w}x{h}.png`, `a11y_game_{w}x{h}.png`.
- Not covered: screen-reader announcements (only `aria-live` regions exist: `#mSr`, `#dieSr`, `#toast`); the end screen, group page and event card under axe; 400% reflow.

---

## 5. Prioritized issues

| # | Pri | Issue | Evidence | Suggested fix | Task |
|---|---|---|---|---|---|
| 1 | P0 | Lobby suites write to production (`טסט` players, groups, results, feed rows). `lobby_v3b` live_xss is ON by default | §2.1 [CODE] | `tests/fakebackend.py` + guard + `--live` double opt-in (§2) | NL-16 |
| 2 | P0 | No suite blocks Supabase by default: an unrouted call goes to production (e.g. `game_e2e` routes only `rr_checkpoint`) | [CODE] | Shared guard in every suite; resolver rule in the launch args | NL-16 |
| 3 | P0 | Main thread frozen 13–20 s right after the lobby appears, and again ~12 s later. Lobby unresponsive; first roll 23–36 s after navigation | §3.2 [OBSERVED, software GL] | Confirm on a phone. Defer the life/history GLB preload until after the first roll or idle. Use `renderer.compileAsync` (three r158+) / `KHR_parallel_shader_compile`. Split world build into yielded chunks. Smaller first shadow map | NL-15 / NL-02 |
| 4 | P1 | 8.6 MB cold, all before the first roll. three.js unminified 1.3 MB; GLBs uncompressed | §3.2 | `three.module.min.js`; Draco/meshopt + gzip for GLBs; lazy-load life (≈2.5 MB) and history assets; `card.png` → WebP | NL-15 / NL-11 |
| 5 | P1 | Fast 3G: 46 s from tapping a character to a usable roll | §3.2 | As #3/#4, plus progress UI with bytes and a "start with a simple board" path | NL-15 |
| 6 | P1 | Detached DOM leak ≈580 nodes per world entry | §3.2 | Heap snapshot → retainer, then fix | NL-15 |
| 7 | P1 | Event card without initial focus or focus trap. Lobby overlay not inert (Tab reaches hidden HUD). Focus lost on view change | §4.2 | `inert` on the inactive layer; focus the card's heading/first option; Tab trap in `#evm`/`#gm`; focus the `h1` after each lobby render | NL-15 / NL-04 |
| 8 | P1 | Contrast `.lb-title` 3.64:1 everywhere, `.pf-total` 2.83:1, gold/green small text 3.78–4.23:1 | §4.1 | Darken the tokens (≥4.5:1) | NL-11 |
| 9 | P1 | `#hGoal role=meter` without `aria-valuenow/min/max` (axe critical) | §4.1 | Set the values in `ui.js` when the goal updates | NL-15 |
| 10 | P2 | Text-only zoom ignored (px fonts) | §4.3 | rem-based type scale | NL-11 |
| 11 | P2 | HUD targets 30–42 px on phones | §4.3 | Min 44×44 hit area (padding or `::after`), keeping the visual size | NL-11 |
| 12 | P2 | `scene.js` ignores reduced motion | [CODE] | Skip shake and auto-rotation, shorten tweens when `reduce` | NL-11 |
| 13 | P2 | GL buffer/VAO creep across re-entries | §3.2 | Audit `scene.js` dispose paths for fx and per-game objects | NL-15 |
| 14 | P2 | Idle game re-renders every 2 s (battery) | [CODE `scene.js:91`] | Stop rendering when idle and nothing is dirty | NL-15 |
| 15 | P2 | 18 Tabs to roll; coach bubble shown while focus sits on a card button | §4.2 | Put Roll early in tab order or add an `R` shortcut/skip link; coach should hold focus or not overlap a focused card | NL-04 |
| 16 | P3 | Label-in-name mismatches; duplicate banner; region landmarks | §4.1 | Include the visible text in `aria-label`; `aria-hidden`/`inert` the HUD under the lobby; `<main>` per view | NL-15 |
| 17 | P3 | Every suite fetches Google Fonts from the internet | [CODE + OBSERVED] | Vendor fonts for tests or allow-list them explicitly | NL-16 |
| 18 | P3 | Backend SQL (19 client RPCs + 4 legacy, `game.day/week`, tables) not in the repo; daily key format unknown | §1.3 | Read-only schema dump into a baseline migration (needs approval) | NL-16 / NL-17 |

Facts worth remembering (from this investigation, not from memory): weekly seed key format `IYYY-"W"IW` confirmed against production docs; migrations t15/t15b are still unapplied; `lobby_v3b.py` runs its live part by default unless `--no-live` is passed.

---

## Appendix A — `/tmp/research-qa/perf_probe.py` (verbatim; run with the commands in §3.1)

```python
# Perf baseline probe for מירוץ העכברים (NL-15 / T7). Measures the REAL site copy (default http://localhost:8772/).
# Usage: python3 perf_probe.py [base] [--runs=N] [--net=none|fast3g] [--leak] [--vp=1300x820] [--out=file.json]
# Conditions (keep identical for "after"):
#   * Chrome /usr/bin/google-chrome, headless, swiftshader WebGL (same ARGS as tests/*.py) + precise memory info.
#   * Every non-localhost host fails DNS (--host-resolver-rules) and no proxy is used ⇒ Supabase (production) and Google
#     Fonts are unreachable: the backend is "routed to failure" without request interception (no route overhead).
#   * Fresh context per run, HTTP cache disabled (CDP Network.setCacheDisabled), localStorage: rr2-onboarded=1 and a fake
#     player identity (so the lobby really tries daily/weekly/groups/profile RPCs and gets network errors).
#   * Phase A (first-run user, no progress → tutorial on): nav → usable lobby → click w1 → first char → #roll enabled.
#   * Phase B (--leak; progress seeded w1★3 w2★2, tutorialDone): idle FPS, dice FPS, then 3× (lobby → other world → new game)
#     with GC + heap/DOM/listener/live-WebGL-object counts after each re-entry.
import asyncio, json, os, sys, time, statistics
from playwright.async_api import async_playwright

ARGV = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
BASE = ARGV[0] if ARGV else 'http://localhost:8772/'
RUNS = int(OPT.get('runs', 1)); NET = OPT.get('net', 'none'); LEAK = 'leak' in OPT
VPW, VPH = map(int, OPT.get('vp', '1300x820').split('x'))
OUT = OPT.get('out', '/tmp/research-qa/perf_%s_%s.json' % (NET, int(time.time())))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info',
        '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost, EXCLUDE 127.0.0.1']
NETS = {'none': None,  # DevTools presets
        'fast3g': {'offline': False, 'latency': 562.5, 'downloadThroughput': 180000, 'uploadThroughput': 84375},
        'slow4g': {'offline': False, 'latency': 150, 'downloadThroughput': 1.6 * 1024 * 1024 / 8 * .9 * 2.5, 'uploadThroughput': 750 * 1024 / 8 * .9}}
FAKE_ME = {'id': '0b0b0b0b-0000-4000-8000-00000000beef', 'secret': 'perf-probe-secret', 'nickname': 'פרוב'}

INIT = r"""
(() => {
  window.__m = { marks: {}, lt: [], gl: {} };
  const mark = (k) => { if (!(k in __m.marks)) __m.marks[k] = Math.round(performance.now()); };
  const mo = new MutationObserver(() => {
    if (document.querySelector('.lb-home') && !('lobbyDom' in __m.marks)) { mark('lobbyDom'); setTimeout(() => mark('lobbyTimer0'), 0); }
    const l = document.getElementById('loading'); if (document.querySelector('.lb-home') && (!l || l.hidden || getComputedStyle(l).display === 'none')) mark('lobbyUsable');
    const r = document.getElementById('roll'); if (r && !r.disabled) { mark('rollEnabled'); }
  });
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class'] });
  window.__markReset = (k) => { delete __m.marks[k]; };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __m.marks[e.name] = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __m.marks.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __m.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  // live WebGL object counters (create − delete): a three.js disposal leak shows up here
  for (const C of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
    if (!C) continue; const P = C.prototype;
    for (const [mk, del, k] of [['createTexture', 'deleteTexture', 'tex'], ['createBuffer', 'deleteBuffer', 'buf'], ['createProgram', 'deleteProgram', 'prog'], ['createFramebuffer', 'deleteFramebuffer', 'fb'], ['createVertexArray', 'deleteVertexArray', 'vao']]) {
      const c = P[mk], d = P[del]; if (!c || !d) continue;
      P[mk] = function () { __m.gl[k] = (__m.gl[k] || 0) + 1; return c.apply(this, arguments); };
      P[del] = function (o) { if (o) __m.gl[k] = (__m.gl[k] || 0) - 1; return d.apply(this, arguments); };
    }
  }
})();
"""
FPS = """(ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); let last = t0, gap = 0, over50 = 0;
  const f = (t) => { n++; const g = t - last; if (g > gap) gap = g; if (g > 50) over50++; last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (t - t0)).toFixed(1), maxGapMs: Math.round(gap), framesOver50ms: over50 }); };
  requestAnimationFrame(f); })"""
ROLL_FPS = "(ms) => { document.querySelector('#roll').click(); return (%s)(ms); }" % FPS

def log(*a): print(*a, flush=True)

async def metrics(cdp, gc=False):
    if gc:
        await cdp.send('HeapProfiler.collectGarbage'); await asyncio.sleep(0.3); await cdp.send('HeapProfiler.collectGarbage')
    m = {x['name']: x['value'] for x in (await cdp.send('Performance.getMetrics'))['metrics']}
    return {'heapUsedMB': round(m['JSHeapUsedSize'] / 1048576, 1), 'heapTotalMB': round(m['JSHeapTotalSize'] / 1048576, 1),
            'nodes': int(m['Nodes']), 'listeners': int(m['JSEventListeners']), 'documents': int(m['Documents']),
            'taskS': m['TaskDuration'], 'scriptS': m['ScriptDuration'], 'layoutS': m['LayoutDuration'], 'styleS': m['RecalcStyleDuration']}

async def busy(cdp, pg, js, arg):
    a = await metrics(cdp); t0 = time.time(); r = await pg.evaluate(js, arg); dt = time.time() - t0; b = await metrics(cdp)
    r['mainThreadBusyPct'] = round(100 * (b['taskS'] - a['taskS']) / dt); r['scriptPct'] = round(100 * (b['scriptS'] - a['scriptS']) / dt)
    return r

async def new_page(b, seeded):
    ctx = await b.new_context(viewport={'width': VPW, 'height': VPH}, device_scale_factor=1)
    init = "localStorage.setItem('rr2-onboarded','1');" + f"localStorage.setItem('rr-player', {json.dumps(json.dumps(FAKE_ME, ensure_ascii=False))});"
    if seeded: init += "localStorage.setItem('rr2-progress', JSON.stringify({stars:{w1:3,w2:2},best:{w1:14},tutorialDone:true,gamesPlayed:5,wins:2}));"
    await ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded','1');" + init + "}")
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); pg.set_default_timeout(300000)
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Network.enable'); await cdp.send('Performance.enable'); await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    if NETS.get(NET): await cdp.send('Network.emulateNetworkConditions', NETS[NET])
    net = {'req': {}, 'bytes': 0, 'byType': {}, 'n': 0, 'failed': [], 'external': []}
    def on_resp(e): net['req'][e['requestId']] = e.get('type', 'Other')
    def on_fin(e):
        t = net['req'].get(e['requestId'], 'Other'); n = e.get('encodedDataLength', 0)
        net['bytes'] += n; net['n'] += 1; d = net['byType'].setdefault(t, [0, 0]); d[0] += 1; d[1] += n
    def on_fail(e): net['failed'].append(e.get('errorText'))
    def on_req(e):
        u = e['request']['url']
        if not u.startswith(('http://localhost', 'http://127.0.0.1', 'data:', 'blob:')): net['external'].append(u.split('?')[0][:90])
    cdp.on('Network.responseReceived', on_resp); cdp.on('Network.loadingFinished', on_fin); cdp.on('Network.loadingFailed', on_fail); cdp.on('Network.requestWillBeSent', on_req)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    return ctx, pg, cdp, net, errs

def netsum(net):
    return {'requests': net['n'], 'MB': round(net['bytes'] / 1048576, 2),
            'byType': {k: {'n': v[0], 'KB': round(v[1] / 1024)} for k, v in sorted(net['byType'].items(), key=lambda kv: -kv[1][1])},
            'failed': len(net['failed']), 'externalAttempts': sorted(set(net['external']))}

async def start_game(pg, world, nth=0, timeout=240000):
    await pg.click(f'.map-card[data-id="{world}"]'); await pg.wait_for_selector('.wv-chars')
    await pg.evaluate("window.__markReset('rollEnabled')")
    t_click = await pg.evaluate('performance.now()')
    await pg.locator('.wv-char').nth(nth).click()
    for _ in range(2):  # a confirm (e.g. replace a saved game) may appear
        try:
            await pg.wait_for_function("!document.querySelector('#roll').disabled && document.querySelector('#start').hidden", timeout=6000 if _ == 0 else timeout); break
        except Exception:
            if await pg.locator('#gm:not([hidden]) .acts button.primary').count(): await pg.click('#gm .acts button.primary')
    t_roll = await pg.evaluate("__m.marks.rollEnabled")
    return round(t_roll - t_click)

async def phase_a(b):
    ctx, pg, cdp, net, errs = await new_page(b, seeded=False)
    la = os.getloadavg()[0]; t = time.time()
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=240000)
    await pg.wait_for_function("__m.marks.lobbyUsable != null", timeout=240000)
    lobby_net = netsum(net); lob = await metrics(cdp, gc=True)
    click_to_roll = await start_game(pg, 'w1')
    await pg.wait_for_timeout(1500)
    marks = await pg.evaluate('__m.marks'); lt = await pg.evaluate('__m.lt'); gl = await pg.evaluate('__m.gl')
    res_list = await pg.evaluate("performance.getEntriesByType('resource').map(e => [e.name.replace(location.origin, ''), e.initiatorType, Math.round(e.startTime), Math.round(e.responseEnd), e.encodedBodySize, e.decodedBodySize])")
    lu = marks.get('lobbyUsable') or 0
    before = [x for x in res_list if x[3] <= lu]
    ends = [s0 + d for s0, d in lt]
    tti = max([lu] + [e for e in ends if e <= (marks.get('rollEnabled') or 1e12) - click_to_roll])
    game = await metrics(cdp, gc=True)
    r = {'loadavg_start': round(la, 2), 'loadavg_end': round(os.getloadavg()[0], 2), 'wallS': round(time.time() - t, 1),
         'fcpMs': marks.get('first-contentful-paint'), 'lcpMs': marks.get('lcp'), 'lobbyDomMs': marks.get('lobbyDom'), 'lobbyUsableMs': marks.get('lobbyUsable'),
         'clickToRollMs': click_to_roll, 'navToRollMs': marks.get('rollEnabled'),
         'lobbyTimer0Ms': marks.get('lobbyTimer0'), 'lobbyQuietMs(TTI≈end of last long task before the click)': tti,
         'longTasks': {'n': len(lt), 'totalMs': sum(d for _, d in lt), 'maxMs': max([d for _, d in lt] or [0]), 'list': lt},
         'bytesBeforeLobbyKB': round(sum(x[4] for x in before) / 1024), 'requestsBeforeLobby': len(before),
         'top10': sorted(res_list, key=lambda x: -x[4])[:10],
         'netAtLobby': lobby_net, 'netAtRoll': netsum(net), 'memAtLobby': lob, 'memAtRoll': game, 'liveGL': gl, 'pageErrors': errs[:5]}
    await pg.screenshot(path=f'/tmp/research-qa/shots/perf_A_{NET}_{VPW}.png')
    await ctx.close(); return r

async def phase_b(b):
    ctx, pg, cdp, net, errs = await new_page(b, seeded=True)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=240000)
    out = {'loadavg_start': round(os.getloadavg()[0], 2)}
    out['firstGameClickToRollMs'] = await start_game(pg, 'w1')
    await pg.wait_for_timeout(2500)
    out['idle'] = await busy(cdp, pg, FPS, 4000)
    out['dice'] = await busy(cdp, pg, ROLL_FPS, 3000)
    await pg.wait_for_timeout(4000)
    # lobby overlay open over a paused scene
    await pg.click('#homeBtn'); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(1500)
    out['lobbyOverGame'] = await busy(cdp, pg, FPS, 3000)
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('home'))"); await pg.wait_for_selector('.lb-home')
    snaps = [{'step': 'game1 (w1)', **(await metrics(cdp, gc=True)), 'gl': await pg.evaluate('__m.gl')}]
    for i, w in enumerate(['w2', 'w1', 'w2']):
        if i: await pg.click('#homeBtn'); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(800)
        ms = await start_game(pg, w, nth=(i + 1) % 3); await pg.wait_for_timeout(2000)
        m = await metrics(cdp, gc=True); snaps.append({'step': f're-entry {i + 1} ({w})', 'clickToRollMs': ms, **m, 'gl': await pg.evaluate('__m.gl')})
    for s in snaps:
        for k in ('taskS', 'scriptS', 'layoutS', 'styleS'): s.pop(k, None)
    out['leak'] = snaps; out['loadavg_end'] = round(os.getloadavg()[0], 2); out['pageErrors'] = errs[:5]
    out['net'] = netsum(net)
    await ctx.close(); return out

async def main():
    res = {'base': BASE, 'net': NET, 'viewport': f'{VPW}x{VPH}', 'nproc': os.cpu_count(), 'date': time.strftime('%Y-%m-%d %H:%M:%S'), 'A': [], 'B': None}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        res['chrome'] = b.version
        for i in range(RUNS):
            r = await phase_a(b); res['A'].append(r)
            json.dump(res, open(OUT, 'w'), ensure_ascii=False, indent=1)
            log('A', i, json.dumps({k: r[k] for k in ('loadavg_start', 'fcpMs', 'lobbyUsableMs', 'clickToRollMs', 'navToRollMs')}), 'MB', r['netAtRoll']['MB'])
        if LEAK:
            res['B'] = await phase_b(b); log('B', json.dumps(res['B'], ensure_ascii=False)[:1500])
        await b.close()
    if res['A']:
        for k in ('fcpMs', 'lobbyUsableMs', 'clickToRollMs', 'navToRollMs'):
            v = [r[k] for r in res['A'] if r[k] is not None]; res.setdefault('median', {})[k] = statistics.median(v) if v else None
    json.dump(res, open(OUT, 'w'), ensure_ascii=False, indent=1); log('saved', OUT)

asyncio.run(main())
```

## Appendix B — PostgreSQL `hashtext()` port for the fake backend (`/tmp/research-qa/hashtext.py`)
Verified: `abs(hashtext('ratrace-2026-W48')) == 1382272518` (the production week-48 seed in SECURITY_REVIEW §3.3).
```python
M = 0xffffffff
def _rot(x, k): return ((x << k) | (x >> (32 - k))) & M
def _mix(a, b, c):
    a = (a - c) & M; a ^= _rot(c, 4);  c = (c + b) & M
    b = (b - a) & M; b ^= _rot(a, 6);  a = (a + c) & M
    c = (c - b) & M; c ^= _rot(b, 8);  b = (b + a) & M
    a = (a - c) & M; a ^= _rot(c, 16); c = (c + b) & M
    b = (b - a) & M; b ^= _rot(a, 19); a = (a + c) & M
    c = (c - b) & M; c ^= _rot(b, 4);  b = (b + a) & M
    return a, b, c
def _final(a, b, c):
    c ^= b; c = (c - _rot(b, 14)) & M
    a ^= c; a = (a - _rot(c, 11)) & M
    b ^= a; b = (b - _rot(a, 25)) & M
    c ^= b; c = (c - _rot(b, 16)) & M
    a ^= c; a = (a - _rot(c, 4)) & M
    b ^= a; b = (b - _rot(a, 14)) & M
    c ^= b; c = (c - _rot(b, 24)) & M
    return a, b, c
def hash_bytes(k: bytes) -> int:
    n = len(k); a = b = c = (0x9e3779b9 + n + 3923095) & M; i = 0
    while n >= 12:
        a = (a + int.from_bytes(k[i:i+4], 'little')) & M
        b = (b + int.from_bytes(k[i+4:i+8], 'little')) & M
        c = (c + int.from_bytes(k[i+8:i+12], 'little')) & M
        a, b, c = _mix(a, b, c); i += 12; n -= 12
    t = k[i:]
    if n >= 9: c = (c + (int.from_bytes(t[8:n], 'little') << 8)) & M
    if n >= 5: b = (b + int.from_bytes(t[4:min(n, 8)], 'little')) & M
    if n >= 1: a = (a + int.from_bytes(t[0:min(n, 4)], 'little')) & M
    a, b, c = _final(a, b, c)
    return c
def hashtext(s: str) -> int:
    h = hash_bytes(s.encode('utf-8'))
    return h - (1 << 32) if h >= (1 << 31) else h
```

## Appendix C — artifacts
- Raw results: `/tmp/research-qa/perf_none.json` (runs 1–2), `perf_none2.json` (run 3 + phase B), `perf_fast3g.json`, `a11y.json`, `followup.json`.
- Scripts: `perf_probe.py` (App. A), `a11y_probe.py` (axe + keyboard + targets + motion + zoom + widths), `followup_probe.py` (event-card keyboard + 5× re-entry), `fake_proto.py` (fake backend feasibility, 7/7), `hashtext.py`.
- Screenshots `/tmp/research-qa/shots/`: `a11y_lobby_{360x740,390x844,414x896,820x1180,1300x820}.png`, `a11y_game_{…}.png`, `a11y_kb_game_start.png`, `a11y_kb_card.png`, `followup_card_tab.png`, `a11y_textzoom200_lobby.png`, `a11y_pagezoom200_lobby.png`, `perf_A_none_1300.png`, `perf_A_fast3g_1300.png`.
