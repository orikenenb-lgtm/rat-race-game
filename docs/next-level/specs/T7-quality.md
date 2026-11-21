# T7 — Quality gates: offline fake backend, performance, accessibility, balance & regressions (spec)

Status: ready to implement · Branch `feat/rat-race-next-level` · TASK_BOARD row T7 (NL-15 / NL-16), owner brief §18 + §19.
Inputs: `docs/next-level/research/qa.md` (cited as **QA§n**), `research/ux.md` (**UX§n**), specs T1–T5 (**T1 A-n**, **T2 A-n / T-n**, **T3 #n / U-n**, **T4 AC-…**, **T5 A-n**), `TASK_BOARD.md`, `tools/sim.mjs`.
Tags: **[OBSERVED]** measured, **[CODE]** read in source, **[ASSUMED]** a default the implementer uses until confirmed, **[TUNE]** a threshold to be re-set from the first real run (the rule for re-setting is stated next to it).
Priorities: **P0** must ship in T7 · **P1** should ship in the same session · **P2** may be cut, and must then be listed as cut.

T7 is a **gate owner**, not a feature lane. It builds the test infrastructure that every other lane runs, it owns the cross-cutting gates that no single spec owns (boot path, leaks, long play, mode switching, app-wide accessibility, balance across all systems), and it files app fixes as change requests. It does not repeat the per-feature acceptance criteria of T1–T5. Where a gate already exists in another spec, this spec only says where it runs in the matrix.

---

## 0. Scope, ownership, hard rules

**The T7 implementer may create or edit only:**
- new: `tests/fakebackend.py`, `tests/fakeverify.mjs`, `tests/fakebackend_test.py`, `tests/backend_contract.mjs`, `tests/guard_lint.py`, `tests/perf_probe.py`, `tests/perf_budgets.json`, `tests/a11y_e2e.py`, `tests/a11y_known.json`, `tests/journey_e2e.py`, `tests/balance_gates.mjs`, `tests/run_all.sh`, `tests/vendor/axe-core/axe.min.js` + `tests/vendor/axe-core/LICENSE` (+ `README.txt` with version and source);
- existing test infrastructure that no active lane owns: `tests/lobby_e2e.py`, `tests/lobby_v21.py`, `tests/lobby_v3.py`, `tests/lobby_v3b.py`, `tests/lobby_real.py`, `tests/lobby_shots.py`, `tests/lobby_smoke.py`, `tests/game_e2e.py` (guard lines only, §2.7), `tests/security_live.mjs` (env guard only), `tests/make_testcopy.sh`, `tests/make_realcopy.sh`, `tests/serve_copies.sh`.

**The T7 implementer must not edit:** anything under `js/`, `css/`, `index.html`, `assets/`, `supabase/`, `tools/` (sim.mjs is the engine lane's), `docs/` (except that the task manager records results on the board), or another lane's test files (`tests/stability_e2e.py`, `tests/t2.test.mjs`, `tests/stories.test.mjs`, `tests/t4_*`, `tests/t5_*`, `tests/saves|flags|render_api.test.mjs`, `tests/lib/random-player.mjs`). App defects found by T7 become change requests to the owning lane (§7).

Hard rules:
1. **No request reaches production Supabase** (`xvqaxphyfqdzkddmoosu.supabase.co`) from any T7 file, in any mode. `--live` means a staging project or Supabase branch, never production (§2.3).
2. **Never present a test as run when it was not run, and never present a fake-backend run as live.** Every result line printed by `run_all.sh` carries its run status and its backend (`fake`, `live-staging`, `none`) (§6.5).
3. **No network in the default path.** Default runs need no internet: Supabase is faked, Google Fonts are stubbed, three.js is served locally, axe-core is vendored. A missing local dependency fails loudly with an instruction. It never triggers a silent download.
4. **Counts are gated strictly, timings with a noise policy.** Bytes, requests, DOM nodes, listeners, GL objects and violations must pass on every run. Timings use the median of 3 valid runs and the load-average rule (§3.9).
5. **Automation does not prove fun.** The sim gates prove the absence of known balance failures. Whether the game is interesting is judged in the manual play protocol (§5.5). Its limits are written down there.
6. **Before/after under identical conditions.** The same committed probe measures the base copy and the branch copy on the same machine, alternating runs (§3.9).

---

## 1. What T7 does not re-specify (dedupe map)

| Area | Owned by | T7's role |
|---|---|---|
| 3D failure, 2D fallback, saves, quota, recover bar | T1 A-1…A-33, `stability_e2e.py` | Runs it in the matrix. Adds only the "performance mode on slow network" timing (PF-22) |
| Engine v4: focus, DD, cycle, mentor, impact, info leaks, replay, migration | T2 T1–T17, A1–A10 | Consolidates A1–A10 into `balance_gates.mjs` (§5.1). Adds B-gates (§5.2) |
| Stories, business, pacing, `why` invariants | T3 #1–#30, U1–U19 | Consolidates the sim checks (§5.1) |
| Onboarding, learning mode, library, T4 dialogs' focus trap/Escape/44 px/contrast | T4 AC-*, `t4_a11y.py` | Runs it. T7's a11y crawler (§4) covers **all** dialogs and screens as a regression net and uses the same assertions. It does not redefine the behaviour |
| Tokens/contrast values, tiers, DPR caps, draw calls, pause-when-hidden, dispose on world change, reduced motion in 3D | T5 A-1…A-45, `t5_*.py` | Runs it. T7 measures the **boot path, leaks, long play, return-to-lobby and slow network**, which T5 does not gate. T7 reports T5's numbers in the before/after table |
| Rivals, success metrics, personal summary, return to a decision point | T6 (spec not written yet) | §5.1 reserves rows G-T6-1…4. T6's spec must fill them |

---

## 2. (A) Offline fake backend — `tests/fakebackend.py` (P0)

### 2.1 Deliverables
| File | Size [estimate, QA§2.5] | What |
|---|---|---|
| `tests/fakebackend.py` | 650–750 LOC | `FakeBackend` (pure Python, state in memory), `install()`, the guard, the CLI flags, HTTP mode `--serve`, state dump/load |
| `tests/fakeverify.mjs` | ~60 LOC | A persistent Node sidecar for `verify-result` replay (§2.5) |
| `tests/fakebackend_test.py` | ~250 LOC | Pure unit tests of the fake (no browser): every RPC, every error code, clock, seeds, boards, energy accounting, param drift against `js/net.js` |
| `tests/backend_contract.mjs` | ~150 LOC | The `security_live.mjs` cases plus response-shape checks. Target: the fake's HTTP mode by default, staging with `--live` (§2.8) |
| `tests/guard_lint.py` | ~60 LOC | A static check that every browser suite installs the guard (§2.9) |

The prototype `/tmp/research-qa/fake_proto.py` (7/7 [OBSERVED]) and `/tmp/research-qa/hashtext.py` (QA App. B) are the starting points. Copy their logic in. Nothing may import from `/tmp`.

### 2.2 Python API
```python
SB_PROD = 'https://xvqaxphyfqdzkddmoosu.supabase.co'      # the only place the production ref appears in tests/ (plus the allowlist in guard_lint)

class FakeError(Exception):                               # raised inside handlers / overrides
    def __init__(self, code, status=400): ...

class FakeBackend:
    def __init__(self, now=None, verify='replay', board='t15b', characters=None, rate_limits=True): ...
        # now: None = real wall clock (matches the browser) | datetime | callable → aware datetime
        # verify: 'replay' (Node sidecar, default) | 'scripted' (queue) | 'accept' (verified:true, no replay)
        # board: 't15b' (migration B ordering + `verified` key) | 'v2' (today's production order, no `verified`)
        # characters: {world: [char ids]}; default = read once from js/worlds/*.js by `node -e` (cached per process)
    # protocol
    def handle(self, fn: str, body: dict) -> tuple[int, object]       # PostgREST-like: 200 JSON | 400 {code:'P0001', message:<code>} | 404 {code:'PGRST202', …}
    def verify(self, body: dict) -> tuple[int, dict]                  # Edge Function-like (§2.5)
    # test helpers (never reachable from the page)
    def seed_player(self, nickname='טסט', stars=None, achievements=(), pawn=None, meta=None, streak=0) -> dict   # {'id','secret','nickname'}
    def seed_group(self, owner: dict, name='טסט קבוצה', members=()) -> dict                                    # {'id','code','name'}
    def seed_challenge(self, group: dict, world='w1', char=None, days=3, title='טסט אתגר', seed=None) -> dict
    def set_daily(self, world, char_index, max_months=24); def set_weekly(self, world, char_index)
    def set_now(self, dt); def advance(self, days=0, hours=0)
    def fail(self, fn, code, status=400, times=1)        # next `times` calls of fn answer the error
    def fail_network(self, fn, times=1)                  # next `times` calls are aborted (route.abort) → client "offline" paths
    def override(self, fn, callable_)                    # callable_(fb, body) → value | raises FakeError; payload injection (lobby_v3b)
    verify_queue: list                                   # 'scripted' mode: items (status, body)
    calls: collections.Counter                           # fn → count
    log: list                                            # (t, fn, body with p_secret/secret redacted, status)
    blocked: list                                        # URLs the guard aborted (must stay empty)
    unexpected: list                                     # PGRST202 answers, legacy RPCs, unknown params (must stay empty unless a test expects them)
    def dump(self, path); @classmethod def load(cls, path, **kw)
    def close(self)                                      # stops the sidecar; also registered with atexit

async def install(ctx, fb, *, fonts='stub', live=None) -> None    # fb=None → guard + fonts only (suites with no backend use)
def new_context_kwargs() -> dict                                  # {'service_workers': 'block'}; suites spread it into browser.new_context(...)
def mode_from_argv(argv=None) -> str                              # 'offline' (default) | 'live'; exits on unsafe live (§2.3)
def chrome_args(mode, base_args) -> list                          # adds '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND' in offline mode
def assert_clean(fb, allow_unexpected=()) -> None                 # raises with a readable list if blocked/unexpected is non-empty
```

### 2.3 Install, guard, flags, live mode
`install(ctx, fb)` registers, **in this order** (Playwright gives priority to the most recently registered route, and page routes win over context routes):
1. **Guard:** `ctx.route(re.compile(r'^https?://[^/]*\.supabase\.co/.*'), abort)`. It records `route.request.url` in `fb.blocked` and aborts with `blockedbyclient`.
2. **Fonts:** `fonts='stub'` routes `**/fonts.googleapis.com/**` → 200 `text/css` with an empty body and `**/fonts.gstatic.com/**` → 404, as T1 §6.2 does. `fonts='allow'` registers nothing (screenshot suites that want real glyphs opt in). `fonts='abort'` aborts both.
3. **RPC:** `ctx.route(SB_PROD + '/rest/v1/rpc/**', …)`. `OPTIONS` → 204 with `access-control-allow-origin: *`, `-headers: *`, `-methods: POST, OPTIONS`. `POST` → `fb.handle(fn, json)`. A fn in `fb.fail_network` → `route.abort('internetdisconnected')`.
4. **Verify:** `ctx.route(SB_PROD + '/functions/v1/verify-result', …)` → `fb.verify(json)`, with the same CORS answer.
5. A `ctx.on('request')` listener. Any request whose host ends in `.supabase.co` and that reached neither handler 3 nor handler 4 is appended to `fb.blocked`. This catches requests from workers or service workers. `new_context_kwargs()` also blocks service workers.
6. Where the installed Playwright supports `ctx.route_web_socket`, any WebSocket to `*.supabase.co` is closed and recorded. The client opens none today [CODE: `net.js` only].

**Flags, identical in every suite that touches the backend:**
- default `offline`: the fake answers, and `chrome_args` adds the resolver rule as defense in depth.
- `--live`: allowed only when **all** of these hold, otherwise the process exits with code 2 and a message, before a browser starts:
  - env `RR_LIVE=1`;
  - env `RR_SB_URL` is an `https://<ref>.supabase.co` URL whose `<ref>` is **not** `xvqaxphyfqdzkddmoosu`;
  - env `RR_SB_ANON` is set.

  In live mode, `install(ctx, None, live=(url, anon))` rewrites production-host requests with `route.continue_(url=<same path on RR_SB_URL>, headers={…, 'apikey': RR_SB_ANON})`. The production host is still never contacted, and anything not rewritten hits the guard. Live suites keep the `טסט` nickname prefix and clean up by leaving their groups.
- Live mode needs a staging schema that does not exist in the repo yet (QA§1.3, §2.6). It is blocked on CR-22 (Uri's approval for a read-only schema dump). Until then `--live` runs fail at the staging URL check, and that is the expected state, not a bug.

### 2.4 Behaviour per RPC
Common rules:
- **Param sets** come from `js/net.js` (source of truth). `fakebackend_test.py` parses every `rpc('rr_…', {…})` call in `js/net.js` (spread `...auth()` = `p_id, p_secret`) and asserts the keys equal `PARAMS[fn]`, so client drift fails a test. An unknown key, or a missing non-optional key, answers **404 `{code:'PGRST202'}`** (PostgREST's signature mismatch) and is recorded in `fb.unexpected`. Optional keys: `p_ref`, `p_challenge`, `p_pawn`, `p_meta`.
- **Auth** for all but `rr_register2`: unknown `p_id` or wrong `p_secret` → `unauthorized`.
- **Errors**: HTTP 400 `{code:'P0001', message:<code>}` [ASSUMED status, QA§1.3; the client reads only `message`].
- **Clock**: the Israel day = `zoneinfo('Asia/Jerusalem')` date of `fb.now`. Week key = ISO `IYYY-"W"IW`, e.g. `2026-W48` [OBSERVED parity QA§1.3].
- **Seeds**: weekly `abs(hashtext('ratrace-' + week_key))` [OBSERVED: `2026-W48` → 1382272518]. Daily `abs(hashtext('ratrace-daily-' + day_key))` with `day_key` = ISO `YYYY-MM-DD` [ASSUMED format; the formula is from `index.ts` ROW, CODE]. Challenge: a random 31-bit seed from `random.Random(fb_seed)`, stored on the challenge.
- **Legacy RPCs** (`rr_register`, `rr_start`, `rr_create_challenge`, `rr_sync_progress`) → 404 PGRST202 and recorded in `unexpected`. The client must never call them.

| RPC | Validation / limits | State change | Response | Errors |
|---|---|---|---|---|
| `rr_register2` | nickname trimmed 2–20 chars | new player `{id: uuid4, secret: token_hex(16), nickname, stars:{}, achievements:[], pawn:null, meta:{games:0,wins:0,best:{}}, daily_streak:0, best_streak:0, last_daily:null}`. With `p_ref` = an existing id: a pending `referral` gift of 5⚡ for the referrer, at most 5 per referrer per Israel day | `{id, secret, nickname}` | `bad_nickname` |
| `rr_rename` | 2–20 | nickname stored verbatim (HTML allowed) | `{nickname}` | `bad_nickname` |
| `rr_profile` | — | — | `{id, nickname, stars, total_stars, achievements, pawn, daily_streak, best_streak, last_daily, meta}` | `unauthorized` |
| `rr_sync_progress2` | stars keys ∈ w1..w4 (and `h`), values clamped 0–3; achievements ⊆ known ids [ASSUMED: any `^[a-z0-9_]{1,40}$`]; unknown keys dropped | merge: per-world max; achievements union; pawn replaced if valid; meta games/wins = max, `best[w]` = min of positive values | profile shape | `unauthorized` |
| `rr_create_group` | name 2–40; ≤ 20 groups per player | group `{id, code: 6 chars [A-Z2-9], name, owner}`; owner becomes a member | `{id, code, name, is_owner:true, members:1, active:0}` [ASSUMED fields] | `bad_name`, `too_many_groups` |
| `rr_join_group` | code uppercased; ≤ 50 members | add member (idempotent); feed row `joined` | `{id, code, name, is_owner, members, active}` | `group_not_found`, `group_full` |
| `rr_leave_group` | member | remove; an empty group is deleted | `null` | `not_member` |
| `rr_my_groups` | — | — | `[{id, code, name, is_owner, members, active}]` (active = open challenges) | — |
| `rr_group` | member | — | `{id, code, name, is_owner, members:[{nickname, owner, me, stars, pawn}], challenges:[{id, title, profession, world, starts_at, ends_at, active, my_status, board}]}` | `not_member` |
| `rr_create_challenge2` | title 2–50; world ∈ w1..w4; char ∈ that world's characters; days 1–30; ≤ 5 active per group | challenge with `starts_at = now`, `ends_at = now + days` | `{id, title, world, profession, starts_at, ends_at}` | `bad_title`, `bad_world`, `bad_profession`, `bad_days`, `too_many_challenges`, `not_member` |
| `rr_daily` | — | — | `{key, world, char_index, max_months, ends_at, my_status, streak, board}` | — |
| `rr_weekly` | — | — | `{key, world, char_index, profession:null, ends_at, my_status, board}` | — |
| `rr_begin` | mode ∈ daily/weekly/challenge; challenge: member, not closed | **unique** per (player, day / week / challenge): a repeat returns the same row with its `checkpoint` and `checkpoint_turn`. Daily streak: +1 when `last_daily` = yesterday, = when today, else 1 [ASSUMED: on begin] | `{result_id, status, seed, world, char (challenge), char_index (daily/weekly), max_months, title, group_id, streak, checkpoint_turn, checkpoint}` | `challenge_closed`, `challenge_not_found`, `not_member` |
| `rr_checkpoint` | own result, status `playing` | `p_turn < stored` → error; `json.dumps(p_state)` > 300 000 chars → error; else store | `null` | `result_not_found` (also another player's), `stale_checkpoint`, `state_too_big` |
| `rr_finish` | own result | only from `playing`. Clamp months 1–200 as `net.finish` does. Drop `p_stats` when its JSON ≥ 16 KB. Feed rows `ranked_won`/`ranked_lost` `{title, mode, months, stars, progress}`: to the challenge's group; daily/weekly to every group of the player [ASSUMED] | `null` | `already_finished`, `result_not_found` |
| `rr_send_energy` | sender and recipient are members of `p_group` | pending `gift` 3⚡ for the recipient, unique (from, to, Israel day); feed row `gift` | `null` | `already_sent_today`, `player_not_found`, `not_member` |
| `rr_claim_energy` | — | marks all pending gifts claimed | `{total, from:[{nickname, kind:'gift'\|'referral', amount}]}` | — |
| `rr_log_event` | kind `^[a-z0-9_]{1,30}$` [ASSUMED regex]; `json(p_data)` < 2 048 chars; ≤ 50 per player per Israel day (when `rate_limits`) | feed row appended **verbatim** to every group of the player | `null` | `bad_kind`, `rate_limited` |
| `rr_group_feed` | member | — | `{feed:[{nickname, kind, data, at, me}] (newest first, ≤ 50), gifted_today:[nickname]}` (recipients of the caller's gifts today in this group) | `not_member` |

**Boards** (inside daily/weekly/group): exactly the `20261120_t15b_board_verified.sql:12-29` ordering and row keys (`nickname, status, months, net_worth, passive, expenses, me, stars, pawn, progress, verified`), limit 100. The ordering code is in the prototype's `board()`. `board='v2'` drops `verified` and the verified sort keys.

**Daily/weekly rotation:** default table by ISO weekday `[(w1,0),(w2,1),(w3,0),(w4,1),(w1,1),(w2,0),(w3,1)]` [ASSUMED; production's `game.day()` is not in the repo]. Tests that depend on it call `set_daily` / `set_weekly`.

### 2.5 `verify-result` in the fake
- **Request checks**, in `index.ts` order: body > 1 000 000 chars → 413 `too_big`; `parseRequest` errors → 400; auth → 401 `unauthorized`; rate limit 10 per minute per player (fake clock, when `rate_limits`) → 429; unknown or another player's result → 404 `result_not_found`; status `playing` → 409 `not_finished`; already verified → 200 `{ok:true, verified:true, already:true, stored:true, result}`; more than 5 attempts per result → 429; no actions → 422 `no_actions`.
- **`replay` mode (default):** `fakeverify.mjs` is started once per `FakeBackend` (lazily) as `node tests/fakeverify.mjs`. It loads the engine exactly as `tests/verify.test.mjs` does (`loadEngine(bundleText(collect()))` + `verifyGame`).
  - Protocol: newline-delimited JSON on stdin and stdout.
  - Request: `{"rid":n,"row":{mode, world, profession, seed, max_months, status, months, passive, expenses, net_worth, claim_stars, claim_progress, daily_key|weekly_start|challenge_day},"actions":[…]}`. The `row` fields mirror `index.ts` ROW and `verify.test.mjs rowFor`.
  - Response: `{"rid":n,"ok":bool,"error":str|null,"result":{…},"diff":{…}}`.
  - The date key fields must be set from the result's start date, because `rulesFor(row)` picks rules 3 before `RULES4_FROM` (2026-12-01) [CODE verify_core.js:9-20].
  - A suite that plays ranked games must therefore fix both clocks: `FakeBackend(now=…)` and `page.clock.set_system_time(…)` (or `ctx.add_init_script` with a fixed `Date`). Otherwise the browser's rules era and the fake's can differ.
  - Timeout 30 s per call → 503 `engine_unavailable`.
  - The fake stores `verified` on the row, so boards show ✓/⚠ as in production.
- **`scripted` mode:** pops `verify_queue` items `(status, body)`, as `lobby_v3b`'s `M.verify_queue` does, for the 503/409/422 retry paths. **`accept` mode:** 200 `verified:true` without replay. It is for stub-game suites whose action logs are not replayable. The suite summary must say `verify=accept`.

### 2.6 Assumed semantics (each one has a switch, and is listed for live confirmation)
| # | Unknown (QA§1.3) | Fake default | Switch |
|---|---|---|---|
| S-1 | `stale_checkpoint` on an equal turn | equal turn accepted | `fb.stale_on_equal = True` |
| S-2 | Streak bumped on begin or on finish | begin | `fb.streak_on = 'finish'` |
| S-3 | Which groups get `ranked_*` feed rows for daily/weekly | all groups of the player | `fb.ranked_feed = 'none'` |
| S-4 | `rr_create_group` response fields | `{id, code, name, is_owner, members, active}` | — (the contract test reports any difference on staging) |
| S-5 | HTTP status for `RAISE` | 400 | `fb.raise_status` |
| S-6 | Daily key format | `YYYY-MM-DD` | `fb.daily_key_fmt` |
| S-7 | `rr_log_event` kind regex | `^[a-z0-9_]{1,30}$` | `fb.kind_re` |
| S-8 | Daily world/char rotation | weekday table above | `set_daily` |

These rows are confirmed only by a live run against staging (§2.8), or by a read-only look at production SQL with Uri's approval (CR-23). Until then the fake is called **"consistent with the client and the documented evidence"**, never "faithful to production".

### 2.7 Migration of the existing suites (offline by default)
Every suite adds the same 4 lines:
```python
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv(); fb = FB.FakeBackend()            # per suite or per scenario, as the table says
ctx = await b.new_context(**FB.new_context_kwargs(), …); await FB.install(ctx, fb)
…; FB.assert_clean(fb)                                       # at the end; a failure here fails the suite
```
plus `args=FB.chrome_args(MODE, ARGS)` at launch.

| Suite | Port | Change | Fake setup |
|---|---|---|---|
| `lobby_e2e.py` | 8771 | Shared `fb` across contexts A, B, C. Remove the `/tmp/lb/creds.json` write; instead `fb.dump('/tmp/lb/fake_state.json')` | `verify='accept'` (stub game). Fixed `now`. `set_daily('w1', 0)` |
| `lobby_v21.py` | 8771 | Shared `fb`. The `rr_begin` idempotency and checkpoint asserts stay as they are | `verify='accept'` |
| `lobby_v3.py` | 8771 | social: register with `p_ref`. The test keeps asserting **exactly 8⚡** (referral 5 + gift 3) | default |
| `lobby_v3b.py` | 8771 | Scripted `Mock` (`:45-103`) → `fb.override(...)` per fn. `fb.verify_queue` replaces `M.verify_queue`. `live_xss` runs **offline by default**: the payloads are stored verbatim by the fake and come back through `rr_group`/`rr_group_feed` exactly as in production. `--no-live` stays accepted (it is now a no-op); `--live` follows §2.3 | `verify='scripted'` |
| `lobby_real.py` | 8772 | Real game. `checkpoint_resume` exercises many real `rr_checkpoint` calls | `verify='replay'`, fixed clocks (§2.5) |
| `lobby_shots.py` | 8771 | Reads `/tmp/lb/fake_state.json` if present, else seeds its own player/group/challenge with `seed_*` | `FakeBackend.load(...)` |
| `lobby_smoke.py` | 8771 | Guard only | `install(ctx, None)` |
| `game_e2e.py` | 8770 | Guard only. Its own page route for `rr_checkpoint` (`:282-288`) keeps priority (page routes win) | `install(ctx, None)` |
| `security_live.mjs` | Node | At the top: exit 0 with `SKIPPED (live-only; set RR_LIVE=1 and RR_SB_URL=<staging>)` unless both are set and the URL is not production. Its cases move into `backend_contract.mjs` | — |
| T1 `stability_e2e.py`, T4/T5 suites, future T6 suites | — | **Not edited by T7.** CR-20 asks those lanes to call `FB.install(ctx, None or fb)` instead of their own route. `guard_lint.py` accepts their current pattern through the allowlist until then | — |

### 2.8 Contract tests — `tests/backend_contract.mjs`
- Target: `--target=http://localhost:8779` by default, with the fake in HTTP mode started by the test itself (`python3 tests/fakebackend.py --serve 8779`, killed at exit). `--live` (with the §2.3 env checks) targets staging.
- **Cases:**
  - every row of the §2.4 table: one happy path with a response-shape check (required keys and JSON types, e.g. `seed` is a number, `board` is an array of rows with the board keys);
  - every listed error code at least once;
  - every limit at its boundary (2/20 chars, 2/40, 2/50, days 1/30, 300 000-char state, 16 KB stats, 2 KB event data, 20 groups, 5 active challenges, 5 referrals a day, 50 events a day);
  - `rr_begin` idempotency;
  - `stale_checkpoint`;
  - the `verify-result` status codes (§2.5);
  - the `security_live.mjs` cases (auth, cross-player access, no direct table access through `/rest/v1/<table>` → the fake answers 404 and the test expects "not 200").
- **Output:** one line per case, `PASS`/`FAIL`/`DIFF-ASSUMED`. `DIFF-ASSUMED` means staging differs on an S-row of §2.6: the run prints the observed value so the fake can be corrected. The summary says `target=fake` or `target=staging <ref>`.
- The same file, with the same cases, keeps the fake honest once staging exists.

### 2.9 `tests/guard_lint.py`
Static, under 1 s, part of Tier 0.
- Every `tests/*.py` that contains `chromium.launch` must contain `fakebackend` (import and `install`). Otherwise it must be in `ALLOW = {file: reason}`. The initial allowlist: `stability_e2e.py` (own 503 route + unrouted check, T1), and `t4_*.py` / `t5_*.py` (own route, CR-20).
- No file under `tests/` other than `fakebackend.py` and `guard_lint.py` contains the string `xvqaxphyfqdzkddmoosu`, except allowlisted legacy files that already have an env guard (`security_live.mjs`, `lobby_v3b.py` until migrated).
- No `tests/*.py|mjs` contains `npm i`/`npm install`/`pip install` outside `serve_copies.sh`'s documented three.js step.
- The output lists violations with file:line. Exit 1 on any violation.

---

## 3. (B) Performance plan (P0 unless marked)

### 3.1 Fixed measurement conditions
These are the QA§3.1 conditions, so the base numbers in QA§3.2 stay comparable:
- Chrome `/usr/bin/google-chrome`, headless.
- Args: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --enable-precise-memory-info --no-proxy-server --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE localhost, EXCLUDE 127.0.0.1"`. Every non-localhost host fails DNS. There is no request interception in the probe, so there is no route overhead, and the backend is "routed to failure".
- Fresh context per run. `Network.setCacheDisabled`. localStorage: `rr2-onboarded=1` plus the fake `rr-player` identity of QA App. A.
- **Conditions:**
  - **C-desk**: 1300×820 at DPR 1, no throttling.
  - **C-3G**: C-desk plus the DevTools Fast 3G preset (562.5 ms RTT, 180 000 B/s down, 84 375 B/s up).
  - **C-phone**: 390×844, DPR 3, `is_mobile`, `has_touch`, CPU throttle 4×. This is a new condition. Its R0 values are recorded first, and PF-21 is report-only.
  - Quality tier: `auto`, which is `low` under swiftshader (T5 §8.1). Other tiers are report-only.
- **Copies:**
  - Base copy: `git archive 706c0ff | tar -x -C /tmp/t7base`, plus three served locally, built by the same copy script with `SRC=/tmp/t7base`. This makes no repository writes.
  - Branch copy: `tests/make_realcopy.sh` from the checkout.
  - The probe records `git rev-parse HEAD`, whether `git status --porcelain` is clean (and refuses to label a dirty tree as "after"), the Chrome version, `nproc`, and the 1-minute load average at the start and end of each run.

### 3.2 `tests/perf_probe.py`
This is QA App. A promoted to a committed tool, with these additions. CLI:
```
python3 tests/perf_probe.py [--base=URL] [--cond=desk|3g|phone] [--runs=3] [--leak] [--long=60] [--trace] [--heap]
                            [--twod] [--label=base|branch] [--out=/tmp/t7perf/<label>-<cond>-<ts>.json] [--gate]
```
- **Marks.** It uses `performance.mark('rr:lobby-usable'|'rr:start-click'|'rr:3d-ready'|'rr:roll-enabled')` when present (CR-18), and otherwise the QA MutationObserver marks. Both are recorded. **Gating always uses the DOM fallback marks**, because they exist on the base copy too.
- **Phase A** (cold, QA§3.1): nav → lobby usable → **idle 10 s in the lobby** (new: long tasks inside this window are reported separately as `lobbyIdleLongTasks`) → click w1 at the end of the window → first character → `#roll` enabled. It records the bytes and requests before the lobby, before the click and before the roll, and every `.glb` URL with its start time relative to the marks.
- **Input probe** (new): in a second Phase-A run, it clicks the w1 card at lobby usable + 2 s, and records the click → `.wv-chars` visible latency.
- **`--leak`** (Phase B, QA§3.1, extended): idle FPS, dice FPS, and lobby-over-game for 3 s while counting GL `draw*` calls through the prototype wrapper (`drawArrays`, `drawElements`, `drawArraysInstanced`, `drawElementsInstanced`). Then **5** re-entries alternating w2/w1. After each: GC ×2, then `Performance.getMetrics` nodes, listeners and heap, attached nodes (`document.getElementsByTagName('*').length`), live GL objects, and click → roll time. It also records homeBtn → `.lb-home` visible, and lobby → "חזרה למשחק" → roll enabled.
- **`--long=N`** (new, P1): a seeded free w1 game, played for N turns by the `game_e2e.py` roll-and-answer loop (copied, not imported). It samples metrics after GC at turn 10 and turn N, and records page errors.
- **`--twod`**: the same Phase A with `?ff=board2d:on` (T1's performance mode). It asserts no `/three/` or `.glb` request (as a report; T1 A-2 owns the assert) and records the timings.
- **`--trace` / `--heap`**: §3.3 and §3.5.
- **`--gate`**: compares the medians and counts against `tests/perf_budgets.json` and prints one `PASS`/`FAIL`/`INCONCLUSIVE(noisy)`/`N/A(missing hook)` line per budget id. Exit 1 on any FAIL of a gated budget.
- **Output:** JSON (all raw numbers, every run) plus a short Markdown table in the same folder. The before/after table in the final report is generated from two JSON files: `--compare base.json branch.json`.

### 3.3 Root cause of the 13–20 s freeze (investigation deliverable, P0)
Question: is the single long task after the lobby (QA§3.2: 13.2–20.1 s, then a ~12 s second one around the life/history GLB fetch) swiftshader shader compilation, or JS work (GLB parse, world build, geometry merge, texture upload)? **Method** (on the branch copy at T7 start and on the base copy; `--trace`):
1. **CDP tracing:**
   - `Tracing.start` with categories `devtools.timeline, disabled-by-default-devtools.timeline, disabled-by-default-devtools.timeline.frame, v8.execute, disabled-by-default-v8.cpu_profiler, blink.user_timing, gpu, disabled-by-default-gpu.service, toplevel`;
   - `transferMode: ReturnAsStream`, from navigation to `rollEnabled`;
   - saved to `/tmp/t7perf/trace-<label>.json.gz`.
   - Parse the trace in Python. For the two longest `RunTask` events on `CrRendererMain`:
     - compute the self time of their descendants by event name (`FunctionCall`, `EvaluateScript`, `v8.compile`, `ParseHTML`, `Layout`, `GPUTask`, …);
     - attribute `ProfileChunk` samples inside the task window to `(functionName, url:line)`;
     - top 15 by self time.
2. **In-page WebGL timing** (an init script, no app edit):
   - wrap `compileShader`, `linkProgram`, `getProgramParameter`, `getShaderParameter`, `getProgramInfoLog`, `texImage2D`, `texSubImage2D`, `bufferData`, `drawElements`, `drawArrays`, and their instanced variants, with `performance.now()` accumulators per method and per long task;
   - record `KHR_parallel_shader_compile` availability and `renderer.info.programs.length` (via the module, as T5 §1.1 does).
3. **A/B experiments** without app edits, 3 runs each, recording the long-task total and the longest task:
   - **E1:** `assets/life/*` and `assets/history/*` → 404 (the app has procedural fallbacks, T1 A-5). Does the second freeze vanish?
   - **E2:** a warm GPU program cache: a second Phase A in the **same browser** (new context), versus a fresh browser. If the freeze collapses when warm, compilation dominates.
   - **E3:** `rr2-settings.quality='low'` vs `'high'` (shadows off vs PCFSoft 2048), once T5 tiers exist. Before T5: `?hq` vs default.
   - **E4:** the GLB parse cost alone: in a blank page, `GLTFLoader.parse` the 17 boot GLBs and time it.
- **Decision rule, written into the report:**
  - if GL compile/link/status calls plus the GPU wait make up **≥ 60 %** of the longest task, it is **shader-bound**. Fixes go to CR-19a (rendering lane):
    - `renderer.compileAsync(scene, camera)` (three r158+) behind a loading stage, before the first render;
    - fewer unique programs (T5 flattening already reduces materials);
    - shadows off for the first frame at low.
  - if JS self time (parse, build, merge) is **≥ 60 %**, it is **JS-bound**. Fixes go to CR-19b (rendering and shell): chunk `buildWorld` with yields, defer non-visible work, lazy models (§3.4).
  - otherwise it is mixed, and both CRs apply, ordered by measured share.
- The trace summary (top items with ms) is attached to the CR. **The swiftshader caveat** goes on every number: software GL makes compile and draw CPU-bound. The same trace on a real phone (Chrome remote debugging, §3.10) confirms or refutes the conclusion before a large refactor is approved.

### 3.4 Boot path and lazy loading (requirements; the code changes are CRs)
- **R-1 (P0):** nothing of `assets/life/*`, `assets/history/*` (unless the started world is `h`), or any `assets/wN/*` other than the started world, is requested **before `#roll` is first enabled**. Life models load on first need or with `requestIdleCallback` after the first roll is enabled. History models load only for `h`. Today all 17 GLBs load before the first roll (QA§3.2). → CR-05 (T1 owns `preloadLife`, and T5 §8.4 has lazy-load at P1; T7 asks the director to raise it to P0, because PF-5 and PF-9 depend on it).
- **R-2 (P0):** world models are requested only after the user opens that world's view (prefetch on view open is allowed), never at boot for every world. "Don't preload all worlds": at most one world's models in flight at a time.
- **R-3 (P1):** `three.module.min.js` instead of the 1.3 MB unminified build, in `index.html`'s import map (shell lane, CR-06). The test copy scripts (T7-owned) serve whichever file the import map names.
- **R-4 (P1):** `assets/history/card.png` (300 KB) and the other PNG cards are fetched only when shown. WebP is P2 (assets, CR-07).
- **R-5 (P2):** GLB quantization (meshopt), already P2 in T5 §16. T7 only reports the potential: the probe prints a "transfer if gzip -6" estimate per file type, computed offline from the served files, because `http.server` sends no compression and GitHub Pages likely does not gzip `.glb` [HYPOTHESIS, QA§3.2].

### 3.5 DOM leak (≈ +580 detached nodes per world entry)
- **Diagnosis (T7 deliverable, P0), `--heap`:**
  - after 3 re-entries, `HeapProfiler.takeHeapSnapshot` (streamed chunks) → `/tmp/t7perf/heap-<label>.heapsnapshot`;
  - a Python parser reads the snapshot JSON (`nodes`, `edges`, `strings`), selects nodes whose name starts with `Detached ` (Chrome ≥ 120 marks detached DOM wrappers that way), groups them by root detached subtree, and walks retainers to the first non-DOM retainer (closure context variable, `Map`/`Set`/`Array` element, or module variable) and prints its retainer path, for the 10 largest groups.
  - Output: `heap_retainers.md` with group sizes and paths, attached to CR-04.
- **Hypotheses to check first** [HYPOTHESIS, from QA§3.2]:
  - old lobby/world/end views kept by closures in `lobby.js` render helpers;
  - `ui.js` card trees cached between games;
  - the `#gm` replace-save confirm content;
  - event bus subscribers that capture DOM (listeners stay flat at 69–71, so these are not DOM listeners).
- **Fix owner:** the lane that owns the retaining module (lobby, in-game UI, or shell). **Gate PF-10.**

### 3.6 WebGL disposal
- Raw GL object counters (the QA wrapper) are independent of three's bookkeeping, so they also catch leaks that `renderer.info` misses. T5 A-32 gates `renderer.info.memory` for w1 → w2 → w1. T7 gates the raw counters over 5 alternating re-entries (PF-13). On a failure, `--leak --trace-gl` logs each `createBuffer`/`createVertexArray` with a short JS stack (`new Error().stack`, first 3 frames) during re-entry 3 and groups by stack. That names the code path that creates without disposing (CR-17, rendering lane).

### 3.7 Tiers, pixel ratio, pause when hidden, performance mode (coordination)
- **Owned by T5:** tiers, DPR caps (A-29), shadows, decor density, the governor, pause when hidden (A-31), idle frames (A-30), dispose on world change (A-32), `perfStats()`/`?perf=1`. T7 adds no new tier rules. The probe reads `perfStats()` when present and reports, per condition, `tier`, `dpr`, `calls`, `texMB` and frames rendered, so the before/after table shows T5's effect on the boot and leak numbers.
- **Owned by T1:** "מצב קל" (2D). T7 adds only PF-22 (the 2D path on slow network) because no spec gates it.
- **Lobby over a paused game** (PF-14): no spec gates it today. T5 `setPaused` exists. T7 gates GL draws = 0 while the lobby covers the game.

### 3.8 Budgets — `tests/perf_budgets.json`
Base numbers are from QA§3.2 [OBSERVED, base runtime = `706c0ff`]. "H" = hard count gate (every run). "T" = timing gate (median of 3 valid runs, §3.9). "R" = report only.

| id | Cond | Metric | Base | Budget P0 | Target P1 | Type |
|---|---|---|---|---|---|---|
| PF-1 | desk | Nav → lobby usable | 458 ms | ≤ 800 ms | ≤ 600 ms | T |
| PF-2 | desk | Longest task during 10 s idle in the lobby | 13.2–20.1 s | **≤ 1 000 ms** | ≤ 500 ms | T |
| PF-2b | desk | Click on a world card at lobby + 2 s → world view visible | up to ~35 s | ≤ 500 ms | ≤ 300 ms | T |
| PF-3 | desk | Nav → first roll enabled (scripted path of §3.2) | 23.3–35.8 s | ≤ 15 s | ≤ 10 s | T |
| PF-4 | desk | Character click → roll enabled | 0.25–1.0 s (3D preloaded) | ≤ 8 s | ≤ 5 s | T |
| PF-5 | desk | Bytes before the first roll (identity encoding) | 8.59 MB / 59 req | ≤ 5.5 MB | ≤ 3.5 MB | H |
| PF-6 | desk | Bytes / requests before lobby usable | 1 122 KB / 36 | ≤ 1 200 KB / ≤ 38 | — | H |
| PF-7 | desk | Boot-path GLB rule R-1 + R-2 (URL list) | 17 GLBs, all worlds' life/history | 0 violations | — | H |
| PF-8 | 3g | Nav → lobby usable | 8.50 s | ≤ 9.0 s | ≤ 7.0 s | T |
| PF-9 | 3g | Character click → roll enabled | 45.8 s | ≤ 25 s | ≤ 15 s | T |
| PF-10 | desk | All DOM nodes after GC over 5 re-entries: max − min of the per-visit values | +3 222 (1 309 → 4 531) | ≤ 150 | ≤ 80 | H |
| PF-10b | desk | Attached nodes over the same re-entries: max − min | ≈ 25 | ≤ 60 | — | H |
| PF-11 | desk | JS listeners over re-entries: max − min | 2 | ≤ 10 | — | H |
| PF-12 | desk | Heap after GC: last − first over 5 re-entries | +1.4 MB | ≤ 1.0 MB | ≤ 0.5 MB | H |
| PF-13 | desk | Live GL objects at each repeat visit of the same world vs its first visit | buf 206 → 370, vao 80 → 141 | buf ≤ +10, vao ≤ +5, tex ≤ +2, prog ≤ +2 | — | H |
| PF-14 | desk | GL draw calls while the lobby is open over a paused game, 3 s | not measured (rAF 10.5 fps) | 0 | — | H |
| PF-15 | desk | GL draw calls with the tab hidden, 3 s (T5 A-31 owns) | not paused | 0 | — | R |
| PF-16 | desk | Frames over 5 s after 3 s quiet in game (T5 A-30 owns) | ≤ 1 per 2 s | ≤ 2 | — | R |
| PF-17 | desk | `#homeBtn` → lobby visible; lobby → "חזרה למשחק" → roll enabled | R0 | ≤ 500 ms; ≤ 1 000 ms | — | T |
| PF-18 | desk | World switch: lobby → another world's character → roll enabled | R0 | ≤ 10 s | ≤ 6 s | T |
| PF-19 | desk | Long play, turn 10 → turn 60 (P1): attached nodes, all nodes after GC, listeners, heap, page errors | R0 | ≤ +200, ≤ +400, ≤ +20, ≤ +8 MB, 0 | — | H |
| PF-20 | desk | Dice throw rAF and main-thread % (swiftshader) | 1.4 fps / ~100 % | — | — | R |
| PF-21 | phone | PF-1, PF-3, PF-4 and PF-10 under C-phone | R0 | report; budgets set after R0 at ≤ 2× C-desk [TUNE] | — | R |
| PF-22 | 3g | Performance mode `?ff=board2d:on`: character click → roll enabled; nav → roll | R0 | ≤ 5 s; ≤ 15 s | — | T |
| PF-23 | desk | Page errors in every probe run | 0 | 0 | — | H |

`perf_budgets.json` holds, for each id: `cond`, `metric` (the JSON path in the probe output), `base`, `budget`, `target`, `type` and `owner_cr` (the CR that must land for the budget to pass). The JSON is the gate input. This table is its documentation. A budget may only be loosened by the director, with a reason recorded in the file (`"changed": [{date, from, to, why}]`).

### 3.9 Noise policy and the before/after protocol
- **Valid run:** the 1-minute load average is ≤ 2.5 at start (poll every 30 s, for up to 10 min). If it never drops, the run is recorded with `noisy:true`. A timing gate computed from noisy runs prints `INCONCLUSIVE`, never `PASS`. The task manager pauses the other agents' browser suites for the perf window (QA§3: load was 4.5–7.7 during the baseline).
- **Order:** for each condition, `base, branch, base, branch, base, branch` (ABAB), in one browser process per run. Timing gates use the median of the 3 runs per copy, and the report shows all 6 values. Count gates must pass on all 3 branch runs.
- **The base runs are repeated in the same session**, rather than reusing QA's numbers. The QA numbers stay as context, because they were taken under load.
- **Report:** `/tmp/t7perf/compare.md`. One row per budget: base median, branch median, Δ, budget, verdict, owning CR. This file goes into the PR body.

### 3.10 Manual real-device run (P1, documented, never claimed as automated)
- Devices: the T5 §13.3 reference low phone (Android Chrome, ≤ 4 GB, Mali-G52 class), plus a 2019+ laptop with an iGPU.
- Method:
  - Chrome remote debugging → Performance panel;
  - cold load of the branch build served on the LAN (no production backend: the page is opened with `?ff=` defaults and no `rr-player`, so it stays a guest);
  - record the 4 `rr:` marks, the longest task after the lobby, and the trace summary for §3.3;
  - then T5's `perfRun()` (A-34).
- Record device model, browser version, network, and the numbers, in the PR body. Without a device, write "manual device run: NOT DONE" in the report. Nothing is estimated.

---

## 4. (C) Accessibility plan — `tests/a11y_e2e.py` (P0)

### 4.1 Setup and axe gate
- **axe-core.** Vendored by copying `/tmp/research-qa/axe/node_modules/axe-core/{axe.min.js,LICENSE}` (version **4.14.1**, MPL-2.0, 654 KB) into `tests/vendor/axe-core/`, with a `README.txt` that states the version, source and license. No network is needed. Resolution order: env `RR_AXE` → `tests/vendor/axe-core/axe.min.js` → `/tmp/t/node_modules/axe-core/axe.min.js`. If none exists, the suite exits 2 with a message. It asserts `axe.version === '4.14.1'` unless `RR_AXE` is set.
- **Run config:** `runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}`, `resultTypes:['violations']`, on `document`, after the screen is idle (no running transitions; 400 ms after the last mutation).
- **Backend:** the fake (§2), with a seeded player who has a group, a challenge, a finished daily (so boards and feed render), and stars in w1–w2 (so w2 and history unlock).
- **Screen tour.** Each screen is reached by real clicks where cheap, or by the UX `cards.py` technique (drive `engine.js` in page → save → resume), copied in:

| # | Screen | Reached by |
|---|---|---|
| 1 | Welcome (new player, T4) | empty storage |
| 2 | Lobby home | seeded |
| 3 | World view / character select | click w1 |
| 4 | Profile + settings (T5 §7.3) | lobby nav |
| 5 | Library + lesson sheet | lobby nav |
| 6 | Group page + feed | seeded group |
| 7 | Daily board | lobby daily section |
| 8 | Game HUD after one roll | start w1 |
| 9 | Event card: deal (with DD options, T2) | engine driver |
| 10 | Event card: payday / plan / focus | engine driver |
| 11 | Story card + inbox (T3) | engine driver |
| 12 | `#gm` generic modal (index or emergency fund) | HUD |
| 13 | Sheet open (phone) | `#sheetBtn` |
| 14 | Asset info modal (T5) | sheet row |
| 15 | Help / tour / legend (T4) | `#helpBtn` |
| 16 | End screen: won | engine driver |
| 17 | End screen: lost | engine driver |
| 18 | Learning-mode end (T4) | engine driver |
| 19 | 2D board (`?ff=board2d:on`) | flag |

  - Viewports: every screen at **desktop 1300×820 light** and **phone 390×844 dark**. Screens 8–14 also at **360×740 light**.
  - A screen whose feature has not landed yet (e.g. 11 before T3, 14 before T5) prints `N/A (not implemented: <lane>)`. It is not counted as a pass.
- **Gate (ratchet):**
  - **Default mode:** 0 `critical` and 0 `serious` violations that are not matched by an entry in `tests/a11y_known.json` (`{rule, screen, selector_regex, owner_lane, cr, note}`). New violations fail at once. An allowlisted entry that no longer occurs prints `STALE allowlist entry → remove it`, which fails the suite with `--strict-allowlist`.
  - **`--strict`** (the release gate before merge to `main`, AX-3): the allowlist is ignored, and 0 critical and 0 serious violations are allowed on every screen.
  - `moderate`/`minor` violations are reported per screen with counts. They are not gated, except `landmark-no-duplicate-banner`, which is serious-equivalent in `--strict` (it is the HUD exposed under the lobby).
  - The initial `a11y_known.json` holds exactly the QA§4.1 findings that are still present at T7 start, each mapped to its CR (§7): `aria-required-attr #hGoal` → CR-01; `color-contrast .lb-title`/light tokens → CR-11; `label-content-name-mismatch` → CR-12; landmarks → CR-13.

### 4.2 Keyboard and focus flows (cross-cutting; T4 AC-A1/A2 and T5 A-20 stay where they are)
All flows are Tab/Shift+Tab/Enter/Space/Escape only. "Focus inside X" = `X.contains(document.activeElement)`. The focus ring is visible on every stop (computed outline or box-shadow under `:focus-visible`, as QA§4.2 measured).

| id | Flow | Pass condition | Today (QA§4.2) |
|---|---|---|---|
| K-1 | Lobby open (new or returning) | The first Tab stop is inside the lobby. No Tab stop in 40 is inside `#hud`, `#bar`, `#sheet` or `#c`. Those elements are `inert` or `aria-hidden` while the lobby is open | stops 1–5 are HUD buttons |
| K-2 | Every lobby view change (world, profile, library, group, daily, back) | After the render, `activeElement` is not `<body>`: it is the view's heading (`tabindex=-1`) or its first control | `<body>` |
| K-3 | Lobby → w1 → character → game | ≤ 12 key presses from the lobby's first focus to a started game | 10 + 3 + Enter |
| K-4 | In game, first roll | Roll is reachable in ≤ 8 Tabs from the start of the HUD focus order, **or** a documented single key (existing Space/Enter when focus is not in a control) rolls. Both are recorded | 18 Tabs; Space works [CODE] |
| K-5 | Every `[role=dialog]`/`[aria-modal=true]` that the tour opens (event cards, `#gm`, story, inbox, asset info, help, practice, dream, lesson sheet) | Initial focus inside. (n + 2) Tabs and (n + 2) Shift+Tabs stay inside. On close, focus returns to the opener, or to Roll when the opener is gone. Escape closes only dismissable dialogs (decision cards stay open) | card: `<body>`, no trap |
| K-6 | Coach bubble visible together with a focused card | Never both: the coach either holds focus or is not shown over a focused card (T4 §4.7 queue) | both visible |
| K-7 | End screen | The first Tab stop is inside the end screen, and the background is inert | via HUD chips |
| K-8 | Sheet (phone) | Focus is trapped while it is open as an overlay, and Escape closes it | leaves sheet |
| K-9 | Return to lobby from the game and back | Focus lands in the lobby (K-1). On resume, focus is on Roll or on the open card | — |
| K-10 | 2D board | Every city card and the roll are reachable by Tab (T5 A-19 names) | — |

### 4.3 Other checks
| id | Check | Method | Gate |
|---|---|---|---|
| AX-T | Touch targets | `getBoundingClientRect` of visible interactive elements on all tour screens at 360/390/414 | **Hard:** 0 below 24×24 (WCAG 2.2 2.5.8). **Hard for the listed primary controls:** `#roll`, card option buttons, lobby primary CTAs, life chips (T4 A11Y-5), modal actions ≥ 44×44. Others below 44: reported with CR-15 |
| AX-Z1 | Text-only zoom | Root `font-size: 200%`, 32 sampled text elements per lobby screen and the HUD | **P1, depends on T5's P1 px→rem.** Pass: ≥ 80 % of the samples grow by ≥ 1.5×. If T5 cuts px→rem, this prints `REPORT (cut by T5)` and CR-14 stays open |
| AX-Z2 | Page zoom 200 % and 400 % reflow | Viewport 650×410 at DPR 2, and 320×256 CSS px | 200 %: no horizontal scroll (hard). 400 %: lobby screens have no horizontal scroll (report; WCAG 1.4.10) |
| AX-M | Reduced motion | `emulate_media(reduced_motion='reduce')` on every tour screen | Hard: `document.getAnimations()` has 0 running infinite animations, and 0 running animations longer than 600 ms. The 3D side is T5 A-23 |
| AX-S | Information not dependent on sound | Init script wraps `AudioScheduledSourceNode.prototype.start` and `HTMLMediaElement.prototype.play` with timestamps. A MutationObserver records text changes in `#toast`, `#mSr`, `#dieSr`, `#a11yLive`, open dialogs and HUD values. Scripted 30-turn w1 game, muted and unmuted | Hard: every sound that does not start within 150 ms of a user click has a text change within ±1 000 ms. Unmatched sounds are listed (CR-24) |
| AX-C | Canvas-only information | After each landing, read the live regions | Hard: after every roll, a live region contains the dice values **and** the landing tile's name (`E.boardInfo()` label). Today `#dieSr` has the dice only [CODE game.js:469] → CR-27. The city has a DOM equivalent (sheet rows, T5 A-19/A-20); T7 checks that the sheet lists every owned asset (count = `metrics().assets.length`) |
| AX-N | Accessible names | All visible interactive elements | Hard: none with an empty accessible name (Playwright `aria_snapshot` or a computed-name walk). Life chips follow T4 A11Y-10 |
| AX-B | RTL and numbers | UX `bidiscan` method (copied in), on all tour screens | Hard: 0 misplaced ₪/$/%/± signs. ₪ never in "Secular One" (T5 A-5 method), checked app-wide |
| AX-W | Widths | 360×740, 390×844, 414×896, 820×1180, 1300×820, lobby and game | Hard: no horizontal overflow (`scrollWidth ≤ innerWidth`); `#roll` fully inside the viewport; no text container with `scrollWidth > clientWidth + 1` among the HUD chips, card titles and option labels |
| AX-L | Timed content | Life-story overlay, toasts that carry the only copy of a fact | Hard: no element needed to act auto-dismisses (T4 A11Y-13 app-wide). The life story stays until dismissed, or its text stays reachable in the sheet/log → CR-25 |

### 4.4 Manual accessibility pass (P1, documented; screen readers are not automated)
- NVDA + Chrome (Windows) or VoiceOver + Safari (macOS/iOS), and TalkBack + Chrome on Android, if available.
- Script: welcome → w1 → character → 3 turns (one deal, one payday) → open the sheet → lobby → library → end of a short learning game.
- Record, per step: what was announced (verbatim), whether the dice result and landing tile were announced, whether dialogs announced their title, and any trap or lost focus.
- An agent without a screen reader writes `screen reader pass: NOT DONE (no SR available)`. It never infers announcements from the DOM and calls them a screen-reader result.

---

## 5. (D) Balance and simulation gates

### 5.1 Consolidated gate table (run by `tests/balance_gates.mjs`)
| id | Source | Gate (threshold from the source spec) | Command that produces the data | Blocking |
|---|---|---|---|---|
| G-A1…A10 | T2 §13.5 | A1 guide ≥ 65 %, no character < 50 %; A2 blind ≤ 30 %; A2b naive ≤ 40 % (measured, **not blocking**, director decision); A3 smart and adaptive 55–75 %; A4 no policy best in > 60 % of cells; A5 each focus best in ≥ 1 cell and worse than `f:none` in ≥ 1; A6 `dd:flagged` beats never/always (pooled and ≥ 3/4 worlds); A6b report; A7 dominance ≤ 85 % outside the allowlist; A8 ramp; A9 ablation ≥ 3 pts; A10 node perf | `node tools/sim.mjs --matrix 100 wN` (per world, sequential), `--dominance 40`, `--ablate`; T2's own A10 bench | yes (A2b, A6b: report) |
| G-S8…S11 | T3 #8–#11 | C1 no car repair with `noCar`; C2 no mortgage-line change; C3 cooldowns, vacation ≤ 1.25× mean, 0 repeats within 12 months; C4 no two friend loans | T3 sim (300 games per world) | yes |
| G-S15…S17 | T3 #15–#17 | natural frequencies; pacing; no illogical repeats | same | #15 [TUNE]: report until T3 sets final values, then blocking. #16, #17 blocking |
| G-S21, S24, S25 | T3 #21, #24, #25 | `why` invariants; lateClient frequencies ±3 pp; stage reach 5–50 % | same + 10 000 sealed draws | yes |
| G-S28 | T3 #28 | vs the T2 baseline: smart/tapper in time ±5 pp, median months ±3, smart ★★★ ±4 pp | T3 sim vs `tools/balance-t2.json` | yes |
| G-T4 | T4 AC-R5 / E-13 | the tutorial sim check (P1 in T4) | T4's sim mode | if T4 ships it |
| G-T6-1…4 | T6 (spec pending) | reserved: rivals do not move the player's streams; rival archetypes sit between blindTapper and smart; ranked never exposes return-to-decision; the personal summary's numbers equal the engine's metrics | T6 sim / tests | filled by the T6 spec |

**`balance_gates.mjs` behaviour:**
- It reads JSON only: `tools/balance-t2.json`, `tools/balance-t3.json`, `tools/balance-t7.json` (§5.2). It never re-implements engine logic.
- **Freshness:** each JSON must carry `engineSha` = `sha256(bundleText(collect()))` from `tools/build-edge.mjs`. If it differs from the current engine, the gate prints `STALE (engine changed since the sim ran)` and exits 3. Stale data never passes.
- `--run` executes the producing commands first: one world at a time; at most 2 Node processes; never while a browser suite or the perf probe runs.
- Output: one line per gate `PASS`/`FAIL`/`REPORT`/`STALE`/`MISSING(<lane>)`, plus the numbers. Exit 1 on any blocking FAIL.
- **Data contract the sim must emit** (CR-21, engine lane, `tools/sim.mjs` + `tools/policies.mjs`):
  - `--json <file>` for every mode;
  - per-cell aggregates as T2 §13.4 already plans;
  - plus per-game rows with the fields §5.2 needs: `world, char, policy, seed, bucket, status, months, inTime, stars, bankrupt, maxNegCashStreak, forcedPicks, errors, decisions, decisionsByType, distinctCards, repeatsWithin12, impactMismatches, replayOk`.

### 5.2 New T7 gates (owner §19 questions not covered by T2/T3)
These are computed by `balance_gates.mjs` from `tools/balance-t7.json` (produced by `node tools/sim.mjs --t7 100 wN`, CR-21) and from the T2 matrix JSON.

| id | Owner question | Gate | Type |
|---|---|---|---|
| B-1 | Can a cautious player progress? | `cautious` in time ≥ 30 % in every world, **and** ≥ 0.5 × smart's in-time %. No character < 15 % | blocking [TUNE: if T2 tuning makes this impossible without breaking A3, report to the director with the numbers; do not tune around it] |
| B-2 | Is high risk over-rewarded? | In every world: `reckless` and `gambler` in time ≤ smart − 15 pp; their ★★★ ≤ smart's ★★★; their median net worth at the cap ≤ smart's; `reckless` bankrupt share ≥ 30 %. `greedy` in time ≤ smart | blocking |
| B-3 | Soft locks | (a) 0 thrown errors or invariant failures over all sim games; (b) 0 events with no enabled option; (c) loop-guard forced picks ≤ 0.1 % of decisions; (d) "dead end" = still playing at the cap with cash + savings < 0 and no available credit for the last 12 months: ≤ 5 % for guideTapper/cautious/smart/adaptive (report for the others) | (a)–(c) blocking, (d) blocking |
| B-4 | Recovery from mistakes | New policy `recover` = `naive` for the first 12 months, then `adaptive`. In time ≥ 35 % in every world and ≥ 0.5 × adaptive. Bankrupt ≤ 25 % | blocking [TUNE as B-1] |
| B-5 | Do characters really differ? | (a) per character, smart in time ∈ [45 %, 85 %] (no trivial or impossible character; blocking); (b) per world, the characters' smart median months span ≥ 6 months, **or** their best focus/policy differs (report); (c) per character, the share of decisions by type (report) | (a) blocking, (b)(c) report |
| B-6 | Do worlds really differ? | A8 ramp (T2) is the difficulty part. Distinctness: the Jensen–Shannon distance between the worlds' `decisionsByType` distributions (smart) is ≥ 0.05 for every pair | report; reviewed in manual play |
| B-7 | Too long or repetitive? | smart median turns ≤ 70 per game in every world (v3 target 60 for default characters, plus T2/T3 additions); median decisions per month (report; tracked against R0, flagged if > R0 × 1.5); the share of games where one card id is seen ≥ 3 times (report). T3 #10/#16 pacing gates stay blocking | median turns blocking [TUNE from R0]; the rest report |
| B-8 | Do forecasts match engine calculations? | Over every sim decision with `impact.basis === 'certain'`: `impactMismatches` = 0 (cash, cf, loans, savings, 🔋, 😊 equal a real `choose` on a clone; this is T2 T9 at matrix scale). T3 #20 (`total24` = `storyMoney`) and T4 AC-C1/T-M4 (character surplus) run in their own suites | blocking |
| B-9 | Determinism and replay at scale | A 5 % sample of matrix games: `replay(replayConfig(st), st.actions)` is byte-identical (`replayOk`) | blocking |

All [TUNE] thresholds are re-set by the director only, after the first full run, with the numbers in `tools/balance-t7.md`. **The rule:** a threshold may move toward the measured value only when the reason is written down. It never moves to make a failing run pass silently.

### 5.3 Coverage of the owner's test categories (§19)
| Category | Where it is tested | Status at spec time |
|---|---|---|
| Economic calculations | `finance.test.mjs`, `engine.test.mjs`, T2 T9/T11 | exists / T2 |
| Payments and debts | `finance.test.mjs` (loans, credit), T2 T12/T15 (`debt` focus) | exists / T2 |
| Pricing and inventory | `business.test.mjs`, T3 U14–U18 | exists / T3 |
| Story triggers and branches | T3 U5/U6 (lint + forced walk), G-S15…S17 | T3 |
| Save/load | T1 `saves.test.mjs` + A-22…A-30, T3 U10, journey J-3 | T1 (landed) / T3 / T7 |
| Migrations | T2 T6, T3 U11, T4 AC-R3/R4, T1 A-26 | T1–T4 |
| Determinism and replay | `determinism.test.mjs`, T2 T3/T4, T3 #2/#4/#7, B-9 | exists / T2/T3 / T7 |
| Result verification | `verify.test.mjs`, T2 T17, T3 U19, journey J-2 (fake backend + **real replay** sidecar) | exists / T7 |
| Rewind not exploitable in ranked | J-4 (§6.6), G-T6-3 | T7 / T6 |
| Start, turn, win, lose | `game_e2e.py` (w1–w4, `--end`, `--bail`, `--tut`) | exists |
| Mode switching | journey J-1 | T7 |
| 3D failure | T1 S1–S12 | T1 |
| Mobile and RTL | `game_e2e.py --phone`, AX-W/AX-B/AX-T, T4 AC-A6, T5 A-6 | exists / T4/T5 / T7 |

### 5.4 Manual play protocol (P0 for agent playthroughs, P1 for human sessions)
**Why:** sims show that known failures are absent. They cannot show that a decision felt meaningful, that a forecast was understood, or that the player wanted another game.
- **Sessions.**
  - At least **6 agent playthroughs** on the branch build, with the fake backend for ranked:
    - **P-kid**: a new player who does not read long text; w1, mentor `guide`, phone 390;
    - **P-teen**: knows Monopoly, plays fast; w1→w2, `hint`;
    - **P-adult**: understands money and reads the numbers; w2/w3, `hint`; checks the impact panel against the outcome;
    - **P-ranked**: daily and weekly, through to verification;
    - **P-a11y**: keyboard only plus reduced motion plus 360 px;
    - **P-learner**: learning mode, library, practice.
  - Each session is 30–45 minutes of play, or 2 full games.
  - At least **3 human sessions** are requested from the owner (Uri chooses the people). They are run on a phone, with the same recording sheet. Agents do not stand in for them.
- **Record per session** (template; the results go to `docs/next-level/PLAYTESTS.md`, written by the task manager, not by the T7 implementer):
  - build commit, device, browser, viewport, persona, world, character, mentor level, mode;
  - time to the first meaningful decision;
  - number of decisions in total, and the ones where the player hesitated (turn number + why);
  - did the impact panel predict the outcome? Yes/no per checked decision, with numbers;
  - any perceived dominant choice ("I always do X"), with the turn where it was noticed;
  - boredom or repetition moments (turn number + card id);
  - confusion (a verbatim quote or screenshot);
  - bugs (steps + screenshot);
  - "want to play again" 1–5, and why;
  - the result (status, months, ★).
- **Limits, stated in every report:** an agent playthrough is not a human playtest. The agent knows the rules and the code, cannot feel boredom or delight, and its "hesitations" are simulated. Personas are approximations. Human sessions are few and not statistically meaningful. The headless renderer is swiftshader, not a phone. Findings are qualitative inputs for the director, not pass/fail gates, except bugs, which become CRs.

---

## 6. (E) Regression matrix

### 6.1 Suite inventory
Times are on the 2-core box. **[OBSERVED]** = timed at spec time, under load 7–8, on the working tree that had another lane's uncommitted engine edits. Those numbers are calibration, not a baseline: `engine.test.mjs` hit the 300 s timeout, and `verify.test.mjs` printed 6 passed / 1 failed on that mid-implementation tree. **[estimate]** values must be replaced by `run_all.sh`'s recorded times after the first full run.

| Suite | Owner | Kind | Time | Tier |
|---|---|---|---|---|
| `guard_lint.py` | T7 | static | < 1 s | 0 |
| finance, business, progress, energy, library, saves, flags, render_api `.test.mjs` | existing / T1 | node | ≈ 3 s in total [OBSERVED] | 0 |
| `node tools/build-edge.mjs --check` | engine | node | < 5 s [estimate] | 0 |
| `fakebackend_test.py` | T7 | python | < 10 s [estimate] | 0 |
| `backend_contract.mjs` (target fake) | T7 | node + fake HTTP | < 20 s [estimate] | 0 |
| `verify.test.mjs` | engine | node | 34 s [OBSERVED, loaded] | 1 |
| `determinism.test.mjs` | engine | node | 160 s [OBSERVED, loaded] | 1 |
| `engine.test.mjs` | engine | node | > 300 s under load [OBSERVED]; measure clean | 1 |
| `t2.test.mjs`, `stories.test.mjs`, `t4_engine`, `t4_meta`, `t5_tokens`, `t5_vocab` `.test.mjs` | T2–T5 | node | 1–5 min each [estimate] | 1 |
| `balance_gates.mjs` (check only) | T7 | node | < 5 s | 1 |
| `balance_gates.mjs --run` (T2 matrix + T3 + T7 sims) | T7 + engine | node | ≈ 15 + 12 + 10 min [T2/T3 estimates] | 2 |
| `lobby_smoke.py` | T7-migrated | browser | ~1 min [estimate] | 1 |
| `game_e2e.py worlds=w1 turns=8` | existing | browser | 3–6 min [estimate] | 1 |
| `game_e2e.py` w1–w4 (+ `--phone`, `?ff=board2d:on`) | existing | browser | 30–60 min; h:gfc 1 770 s observed under load (TASK_BOARD) | 2 |
| `stability_e2e.py` (no `--slow`) | T1 | browser | 10–20 min [estimate] | 2 |
| lobby_e2e, v21, v3, v3b, real (offline) | T7-migrated | browser | 2–5 min each [estimate] | 1 (lobby lane) / 2 |
| `t4_onboarding.py`, `t4_a11y.py` | T4 | browser | 10–15 min [estimate] | 2 |
| `t5_perf.py`, `t5_city.py`, `t5_ui.py`, `t5_lobby.py` | T5 | browser | 20–30 min [estimate] | 2 |
| `journey_e2e.py` | T7 | browser | 10–15 min [estimate] | 2 |
| `a11y_e2e.py` | T7 | browser | 10–15 min [estimate] | 2 (`--strict` at 3) |
| `perf_probe.py --gate` (desk ×6, 3g ×6 incl. `--twod`, leak ×2) | T7 | browser, alone | 25–35 min [estimate] | 2 |
| `perf_probe.py --cond=phone`, `--long=60` | T7 | browser | 10–15 min [estimate] | 3 |
| `lobby_shots.py`, T5 screenshot matrix | T7 / T5 | artifacts | 10 min [estimate] | 3 |
| Manual: device run (§3.10), screen reader (§4.4), playtests (§5.4), live contract (§2.8, when staging exists) | T7 / owner | manual | — | 3 |

### 6.2 Suites × lanes (which suites a change in a lane's files must run before review)
● = required · ○ = smoke (the first world / first scenario only) · — = not needed. Tier 0 always runs.

| Suite group | Engine | Shell | Rendering | In-game UI | Lobby/meta | Backend (verify, SQL) | Tests infra (T7) |
|---|---|---|---|---|---|---|---|
| Node: engine, determinism, verify, t2, stories, t4_engine, build-edge --check | ● | — | — | — | — | ● | ○ |
| Node: progress, energy, library, t4_meta, t5_tokens, t5_vocab | ○ | — | ○ | ● | ● | — | ○ |
| balance_gates `--run` | ● | — | — | — | — | — | — |
| backend_contract, fakebackend_test | — | — | — | — | ● | ● | ● |
| game_e2e | ● (w1–w4) | ● | ● (+2D) | ● | ○ | — | ○ |
| stability_e2e | ○ | ● | ● | ○ | ○ | — | ○ |
| lobby suites (offline) | ○ (ranked) | ○ | — | — | ● | ● | ● |
| t4_onboarding / t4_a11y | ○ | ○ | — | ● | ● | — | — |
| t5_* | — | ○ | ● | ● | ○ | — | — |
| journey_e2e | ● | ● | ○ | ○ | ● | ● | ● |
| a11y_e2e | — | ● | ○ | ● | ● | — | ○ |
| perf_probe `--gate` | ○ | ● | ● | ○ | ● | — | ○ |

### 6.3 `tests/run_all.sh`
```
bash tests/run_all.sh [--tier=0|1|2|3] [--lane=engine,shell,rendering,ui,lobby,backend,tests] [--only=a,b] [--skip=a,b]
                      [--strict] [--live] [--keep-going]
```
- **Preflight** (fails fast with a fix instruction):
  - `node`, `python3`, Playwright for Python, `/usr/bin/google-chrome`;
  - three.js present at `/tmp/t/node_modules/three` (it does not install it);
  - `tests/vendor/axe-core/axe.min.js` present;
  - ports 8770–8772 and 8779 free, or already serving the right copies.
  - It then runs `serve_copies.sh` (copies rebuilt from the checkout) and records `git rev-parse HEAD` and whether the tree is dirty.
- **Selection:** a tier gives the base set from §6.1. `--lane` adds the ● and ○ suites of §6.2. Suites are listed in one table inside the script (`name | cmd | tier | lanes | kind | needs`).
- **Execution:** strictly sequential for browser suites. Node suites of Tier 0/1 may run two at a time when no browser suite is running. The perf probe always runs **last and alone**, after `balance_gates --run`. Each suite gets a timeout of 2× its recorded time (default 30 min). A timeout counts as `FAIL(timeout)`.
- **Logs:** `/tmp/t7run/<ts>/<suite>.log` plus `summary.json` and `summary.md`. Exit code: 0 only when every selected required suite is `PASS`.

### 6.4 Run order and time budget on the 2-core box
1. **Tier 0 (fail fast, budget ≤ 5 min):** `guard_lint` → fast Node suites → `build-edge --check` → `fakebackend_test` → `backend_contract`.
2. **Tier 1 (lane PR, budget ≤ 30 min, plus the lane's ● suites):** verify → determinism → engine → new Node suites → `balance_gates` check → `lobby_smoke` → `game_e2e w1` → lobby suites for lobby/backend changes.
3. **Tier 2 (wave gate before independent review, budget ≤ 150 min):** Tier 1 → `balance_gates --run` (sims; no browser at the same time) → `game_e2e` w1–w4, phone, 2D → `stability_e2e` → all lobby suites → T4 suites → T5 suites → `journey_e2e` → `a11y_e2e` → `perf_probe --gate` (alone; load rule §3.9).
4. **Tier 3 (release candidate before asking Uri to merge to `main`):** Tier 2 + `a11y_e2e --strict` + `--strict-allowlist` + phone and long-play probe + screenshots + every manual item of §6.1 (each either done with results, or listed as NOT DONE with a reason) + the live contract against staging (only if CR-22 is approved and staging exists).
5. **Budget rule:** if the recorded Tier 2 total exceeds 180 min, the task manager moves the slowest non-gating suites (screenshots, `h:gfc`, phone probe) to Tier 3. No gating suite may be dropped from Tier 2 without a director note on the board.

### 6.5 Reporting honesty (enforced by `run_all.sh`)
- Every suite line has: `status ∈ {PASS, FAIL, FAIL(timeout), NOT RUN, MISSING(<lane>), SKIPPED(<reason>), INCONCLUSIVE(noisy), STALE}`, `backend ∈ {fake, live-staging, none}`, `verify ∈ {replay, scripted, accept, n/a}`, `renderer ∈ {swiftshader, 2d, mixed}`, plus duration and rc.
- A suite file that does not exist yet (written by a lane that has not landed) is `MISSING(<lane>)`, never `PASS`. Tier 2/3 summaries list them at the top.
- `summary.md` ends with this fixed paragraph: "All browser results above ran headless with software WebGL (swiftshader) on a 2-core machine. Backend results ran against the offline fake backend unless the backend column says live-staging. No result here was obtained on a real phone, with a screen reader, or against production."
- A report or PR body that quotes T7 results must quote the `summary.md` line, including the status and the backend column.

### 6.6 `tests/journey_e2e.py` (P1; cross-mode flows no lane owns)
Real copy (8772), fake backend with `verify='replay'`, fixed clocks.
- **J-1 Mode switching in one session:** new player → tutorial game (3 turns) → lobby → learning-mode game in w1 (3 turns) → lobby → free w1 continue (it restores the normal save, not the learning one; T4 AC-L3) → history scenario (2 turns) → lobby → daily (begin, 3 turns, checkpoint) → lobby → free w1 continue again. After each step: 0 page errors, the right save keys exist (T1 §4.1 matrix), `rr2-energy` changed only where the mode spends ⚡, and the lobby shows the right "continue" rows.
- **J-2 Ranked to the end, verified:**
  - daily on a short character, driven to an end by the roll-and-answer loop (max 24 months);
  - `rr_finish` is called; the client calls `verify-result`;
  - the fake's replay sidecar returns `verified:true`; the board row shows ✓;
  - then a tampered variant (`fb.override('rr_finish', …)` changes the claimed `net_worth`) → `claim_mismatch` → ⚠ on the board.
- **J-3 Save/load across reloads:** mid-turn reload in free w1 (T1 behaviour), then reload in a ranked game: it resumes from the server checkpoint with `turn ≥` the last accepted checkpoint.
- **J-4 Rewind is not exploitable in ranked:**
  - play a ranked daily to turn N (checkpointed);
  - snapshot localStorage at turn N−5, play on to turn N, restore the snapshot, reload;
  - the game must not resume at a turn lower than the last accepted checkpoint (it resumes at ≥ N, or refuses with T1's S-S5);
  - a later `rr_checkpoint` with a lower turn gets `stale_checkpoint`;
  - the final verify replays the server-side log.
  - This is the T1 R§4.4 risk. The pass condition holds whichever of T1/T6 implements the fix. Until the fix lands, J-4 is expected to FAIL and is listed as such, never skipped.
- **J-5 World switching and return to lobby:** w1 → lobby → w2 → lobby → w1 continue. The state is unchanged (`month`, `turn`, `cash` identical to before leaving), and 0 errors.
- **J-6 3D failure mid-session:** start w1 in 3D → lobby → `?ff=board2d:on` reload → continue the same save in 2D → identical `month`/`turn`/`cash` (T1 A-7 covers the in-place switch; J-6 covers it across the lobby).

---

## 7. (F) File ownership and change requests

### 7.1 Ownership
The T7 implementer owns exactly the files of §0. T7 **reviews** (but does not edit) other lanes' test files for guard use and honesty labels. App fixes found by T7 are filed as CRs with: id, evidence (file:line or measurement), owning lane, priority, the T7 check that verifies the fix, and whether another spec already covers it ("verify only").

### 7.2 Change requests (from research; more are added when T7's own runs find them)
| CR | Issue | Evidence | Owning lane (files) | Covered by | Pri | Verified by |
|---|---|---|---|---|---|---|
| CR-01 | `#hGoal role=meter` has no `aria-valuenow`/`min`/`max`/`valuetext` (axe critical) | QA§4.1; `index.html:33` | Shell (`index.html` initial attrs) + in-game UI (`ui.js`, update on goal change) | — (new) | P0 | axe AX gate, every screen |
| CR-02 | The HUD stays in the a11y tree and Tab order while the lobby is open | QA§4.2 K-1 | Lobby (`lobby.js`: `inert` on `#hud #bar #sheet #c`) | T4 A11Y-1 | P0 | K-1, axe landmarks |
| CR-03 | Focus drops to `<body>` on world open and on every lobby view render | QA§4.2 | Lobby (`lobby.js`) | T4 A11Y-3 (world view only) → new for profile, library, group, daily, back | P0 | K-2 |
| CR-04 | Detached DOM leak ≈ 580 nodes per world entry | QA§3.2 | TBD from the §3.5 retainer report (lobby / in-game UI / shell) | — | P0 | PF-10, PF-10b |
| CR-05 | Life/history GLBs (~2.5 MB) and all worlds' models load at boot | QA§3.2 | Shell (T1 `preloadLife`, `game.js`) → rendering after the T1 merge | T5 §8.4 lazy-load **P1** → T7 asks for P0 | P0 | PF-5, PF-7, PF-9 |
| CR-06 | `three.module.js` unminified (1.3 MB) | QA§3.2 | Shell (`index.html` import map) | — | P1 | PF-5 |
| CR-07 | PNG cards (1.5 MB) fetched at boot | QA§3.2 | Rendering / assets | — | P1 (lazy), P2 (WebP) | PF-5 |
| CR-08 | Event card: no initial focus, no focus trap | QA§4.2 | In-game UI (`ui.js` `trapFocus`) | T4 A11Y-1/3 | P0 | K-5 |
| CR-09 | 18 Tabs to Roll | QA§4.2 | In-game UI / shell (focus order) | T4 A11Y-4 | P1 | K-4 |
| CR-10 | `scene.js` ignores reduced motion | QA§4.3 | Rendering | T5 §7, A-23 | P0 | AX-M (CSS) + T5 A-23 |
| CR-11 | Contrast: `.lb-title` 3.64:1, `.pf-total` 2.83:1, green/gold/red text on cream | QA§4.1, UX§2.6 | In-game UI tokens (`game.css`) + lobby (`lobby.css`) | T5 A-1/A-3 (game), T5 L1 (lobby) | P0 | axe `color-contrast` |
| CR-12 | Label-in-name mismatch: `#homeBtn`, `.lb-player`, `.lb-energy`, `#hEnergy` | QA§4.1 | Shell (`index.html` `#homeBtn`), in-game UI (`#hEnergy`), lobby (`.lb-*`) | — (new) | P1 | axe `label-content-name-mismatch` |
| CR-13 | Duplicate banner landmark; content outside landmarks | QA§4.1 | Shell (`index.html`: `<main>` per view) + lobby | partly CR-02 | P2 | axe landmarks (moderate) |
| CR-14 | Text-only zoom ignored (px fonts) | QA§4.3, UX§1 | In-game UI + lobby CSS | T5 px→rem **P1** | P1 | AX-Z1 |
| CR-15 | HUD targets 30–42 px on phones (turbo/mute/cam 40×46, voice 36×36, sheet 93×36) | QA§4.3, UX§2.4 | In-game UI (`game.css`) | T4 A11Y-5 covers the life chips only → new for the other controls | P1 | AX-T |
| CR-16 | Idle re-render every 2 s | QA§3.2 [CODE scene.js:91] | Rendering | T5 A-30 | P1 | PF-16 (report) + T5 A-30 |
| CR-17 | GL buffer/VAO creep across re-entries of the same world | QA§3.2 | Rendering (`scene.js` dispose paths) | T5 A-32 (`renderer.info` only) | P1 | PF-13 |
| CR-18 | No `performance.mark` milestones for manual and automated timing | — | Lobby (`rr:lobby-usable`), shell (`rr:start-click`, `rr:3d-ready`, `rr:roll-enabled`) | — (new) | P1 | the probe reports `marks:'rr'` vs `'dom'` |
| CR-19a/b | The 13–20 s main-thread freeze after the lobby | QA§3.2 | Rendering (a: shader path) and/or shell + rendering (b: JS path), per §3.3 | — | P0 | PF-2, PF-2b, PF-3 |
| CR-20 | T1/T4/T5 suites use their own Supabase route instead of the shared guard | T1 §6.2, T4 §16, T5 §13 | T1/T4/T5 test files | — | P1 | `guard_lint.py` allowlist shrinks to 0 |
| CR-21 | Sim must emit JSON with `engineSha`, per-game rows (§5.1), the `recover` policy, impact and replay checks, `decisionsByType` | §5 | Engine (`tools/sim.mjs`, `tools/policies.mjs`) | T2 §13.4 (partly: matrix JSON) | P0 | `balance_gates.mjs` (MISSING → PASS) |
| CR-22 | No backend schema in the repo, so no staging or live contract | QA§1.3, §2.6 | Backend (NL-16/17); **needs Uri's approval** (read-only `pg_dump --schema-only`) | — | P1 | `backend_contract.mjs --live` |
| CR-23 | Unknown server semantics S-1…S-8 | §2.6 | Backend; **needs approval** for read-only SQL inspection | — | P2 | contract `DIFF-ASSUMED` count = 0 |
| CR-24 | Sounds without a visual or text counterpart (if AX-S finds any) | — | In-game UI (`audio.js` callers) | — | P1 | AX-S |
| CR-25 | Life-story overlay auto-dismisses and is not focused (unless reduced motion) | UX§2.5 [CODE ui.js:1084-1096] | In-game UI | T5 §7.2 (reduced motion only) → new for the default | P1 | AX-L |
| CR-26 | `#gm` Escape bound to `#gm`, not `document` | UX§2.5 [CODE ui.js:122] | In-game UI | T4 A11Y-2 | P1 | K-5 |
| CR-27 | `#dieSr` announces the dice but not the landing tile | [CODE game.js:469] | Shell (`game.js`) | — (new) | P1 | AX-C |
| CR-28 | Group feed uses masculine verbs for every player ("דנה יצא") | UX§2.7 | Lobby (copy) | — (not a11y; forwarded) | P2 | manual |

---

## 8. Acceptance criteria (numbered, testable)

**Fake backend (FB)**
- **FB-1 (P0)** `python3 tests/fakebackend_test.py` passes, and covers: every RPC of §2.4 (a happy path and each listed error); hashtext parity (`abs(hashtext('ratrace-2026-W48')) == 1382272518`); the Israel day rollover at 00:00 Asia/Jerusalem; the ISO week key across a year boundary; the t15b board ordering on a 12-row fixture; the referral cap (6 sign-ups in a day → 25⚡); exactly 8⚡ for referral + gift; and `PARAMS` equal to the keys parsed from `js/net.js`.
- **FB-2 (P0)** With the fake installed, an unhandled `*.supabase.co` URL is aborted and appears in `fb.blocked`: a test page that fetches `https://x.supabase.co/rest/v1/foo` makes `assert_clean` raise. The production host is also unresolvable at launch (`chrome_args` adds the resolver rule).
- **FB-3 (P0)** `--live` without `RR_LIVE=1`, or with `RR_SB_URL` pointing at the production ref, or without `RR_SB_ANON`, exits with code 2 before a browser launches (3 negative cases, tested).
- **FB-4 (P0)** `lobby_e2e.py`, `lobby_v21.py`, `lobby_v3.py`, `lobby_v3b.py` (including `live_xss`), `lobby_real.py`, `lobby_smoke.py`, `lobby_shots.py` and `game_e2e.py worlds=w1 turns=8` pass offline with default flags, with `fb.blocked == []` and `fb.unexpected == []`. Each prints `backend=fake`. A DNS-level check confirms 0 connections: Chrome's resolver rule leaves nothing to resolve, and the run's `requestfailed` list shows no `supabase.co` URL except the deliberately blocked ones.
- **FB-5 (P0)** In `replay` mode, an honest ranked game played in `lobby_real.py`/`journey_e2e.py` gets `verified:true` from the sidecar, and a tampered claim gets `claim_mismatch` (J-2). The 409/422/429/503 paths are exercised in `scripted` mode by `lobby_v3b.py`.
- **FB-6 (P0)** `node tests/backend_contract.mjs` passes against the fake, with every §2.4 row, every listed error code and every boundary present. The summary says `target=fake`.
- **FB-7 (P0)** `python3 tests/guard_lint.py` exits 0 on the final tree. Its allowlist lists only the files named in §2.9, each with a reason.
- **FB-8 (P1)** `--state` dump/load round-trips: `lobby_shots.py` renders the group and challenge created by `lobby_e2e.py` with no live credentials.

**Performance (PF)**
- **PF-A (P0)** `tests/perf_probe.py` is committed, runs under the §3.1 conditions on both the base copy (`git archive 706c0ff`) and the branch copy, and writes raw JSON plus `compare.md` with all 6 runs per condition and the load averages.
- **PF-B (P0)** The freeze investigation (§3.3) is delivered as a trace summary with the top items in ms, the four experiment results, and the decision-rule verdict (shader-bound / JS-bound / mixed), attached to CR-19.
- **PF-C (P0)** The heap retainer report (§3.5) names the retainer path of the largest detached group and the owning lane, attached to CR-04.
- **PF-D (P0)** `perf_probe.py --gate` evaluates every `H` and `T` budget of `tests/perf_budgets.json` and prints one verdict line per id. Gated FAILs exit 1. The final report lists every budget's verdict and owning CR. A budget whose CR has not landed is reported as FAIL with the CR id. It is never omitted.
- **PF-E (P0)** No timing gate is reported as PASS from noisy runs (load > 2.5): tested by setting the threshold to 0 with an env override and checking for `INCONCLUSIVE`.
- **PF-F (P1)** `--long=60` and `--cond=phone` run, and their numbers are in `compare.md` (PF-19 gated, PF-21 report).
- **PF-G (P1)** The manual device run (§3.10) is either recorded with its device details, or listed as NOT DONE.

**Accessibility (AX)**
- **AX-1 (P0)** `axe-core 4.14.1` is vendored under `tests/vendor/axe-core/` with its LICENSE and README. `a11y_e2e.py` runs without network.
- **AX-2 (P0)** `python3 tests/a11y_e2e.py` visits every screen of the §4.1 tour that exists in the build (others print `N/A (<lane>)`), on the listed viewports, and passes the ratchet gate. `a11y_known.json` contains only QA-known findings mapped to CRs.
- **AX-3 (P0, release gate)** `a11y_e2e.py --strict --strict-allowlist` reports 0 critical and 0 serious violations, and no stale allowlist entries, on every screen. This is required before T7 signs off a release candidate. If owners have not landed their CRs, T7 reports FAIL with the CR list. T7 does not lower the gate.
- **AX-4 (P0)** K-1…K-10 are implemented as automated checks. Each prints PASS/FAIL with the Tab sequence (element ids) on failure.
- **AX-5 (P0)** AX-T, AX-M, AX-S, AX-C, AX-N, AX-B, AX-W and AX-L are implemented with the §4.3 gates. AX-Z1/Z2 are implemented as P1/report as stated there.
- **AX-6 (P1)** The manual screen-reader pass (§4.4) is recorded verbatim, or listed as NOT DONE.

**Balance (BL)**
- **BL-1 (P0)** `node tests/balance_gates.mjs` reads the sim JSON, checks `engineSha` freshness (exits 3 on STALE), and prints PASS/FAIL/REPORT/STALE/MISSING for every row of §5.1 and §5.2. Rows whose data the sim does not emit yet print `MISSING(engine: CR-21)`.
- **BL-2 (P0)** After CR-21 lands, `balance_gates.mjs --run` completes on the 2-core box (it never runs concurrently with browser suites) and all blocking gates pass, or the failures are reported to the director with the numbers. No threshold changes without a written reason in `tools/balance-t7.md`.
- **BL-3 (P0)** At least 6 agent playthroughs (§5.4) are recorded with the full template and the limits paragraph. 3 human sessions are requested from the owner; their status (done / pending) is stated.

**Regression (RG)**
- **RG-1 (P0)** `bash tests/run_all.sh --tier=0` passes in ≤ 5 min. `--tier=1` and `--tier=2` run end to end, and write `summary.md` with the §6.5 columns and closing paragraph.
- **RG-2 (P0)** `run_all.sh` reports `MISSING(<lane>)` for every suite file that does not exist yet, and never PASS. Tested by temporarily pointing one table entry at a non-existent file in a dry-run mode (`--dry-run --only=<that>`).
- **RG-3 (P0)** The recorded Tier 2 duration is in the PR body. If it exceeds 180 min, the §6.4 budget rule is applied and recorded.
- **RG-4 (P1)** `journey_e2e.py` J-1…J-6 run. J-4 is reported FAIL until the ranked-resume fix lands; it is never skipped.
- **RG-5 (P0)** `security_live.mjs` without the live env prints `SKIPPED (live-only …)` and exits 0. It makes no network request (checked with the resolver rule in a child process).

**Ownership (OW)**
- **OW-1 (P0)** The T7 diff touches only the files listed in §0 (`git diff --name-only` check in review).
- **OW-2 (P0)** Every app defect found by T7 runs is filed as a CR row (in the §7.2 format) in the T7 report, with evidence, lane and verifying check. The research CRs (CR-01…CR-28) each have a status: open, landed, or verified.

---

## 9. Work order, risks, rollback

### 9.1 Work order (each step leaves Tier 0 green)
1. `fakebackend.py` + `fakebackend_test.py` + `guard_lint.py` (the guard first: it blocks the production risk immediately).
2. Migrate `lobby_smoke.py` and `game_e2e.py` (guard only), then `lobby_v3b.py` (its Mock becomes overrides), then `lobby_v21.py`, `lobby_v3.py`, `lobby_e2e.py` + `lobby_shots.py`, then `lobby_real.py` with the replay sidecar. Add the env guard to `security_live.mjs`. Then `backend_contract.mjs`.
3. `perf_probe.py` + the base copy + R0 for all conditions (ABAB), then the §3.3 trace and §3.5 heap investigations. File CR-19 and CR-04 with evidence.
4. Vendor axe; `a11y_e2e.py` with screens 1–8 and 12–13 first (they exist today); add the others as their lanes land.
5. `balance_gates.mjs` (reads whatever JSON exists; MISSING otherwise).
6. `run_all.sh`, then a full Tier 2 run with recorded times.
7. `journey_e2e.py` (P1).
8. Manual protocol sessions (agents), then the final report: `compare.md`, a11y summary, balance summary, CR status table, Tier 2 `summary.md`.

### 9.2 Risks
| Risk | Mitigation |
|---|---|
| The fake drifts from production semantics, so offline green ≠ live green | `PARAMS` checked against `net.js`; assumed semantics listed with switches (§2.6); the same contract cases run on staging when CR-22 is approved; the fake is never called "faithful" |
| Timing noise on the shared 2-core box (QA: load 4.5–7.7) | Count gates are strict; timings use median of 3 with the load rule and ABAB order; INCONCLUSIVE instead of PASS; the task manager reserves a quiet window |
| Swiftshader misrepresents GPU-bound costs | Every number labelled; §3.10 device run; the freeze verdict is confirmed on a device before a large refactor |
| Budgets fail because other lanes' CRs are not done | That is the gate's purpose. FAIL is reported with the CR id; the director decides scope. T7 never loosens a budget silently (`changed` log in the JSON) |
| a11y allowlist becomes a permanent excuse | The allowlist ratchet (new violations fail, stale entries fail with `--strict-allowlist`), and `--strict` at Tier 3 |
| Sim run time grows past budget with T2/T3/T7 modes | One world per process, sequential; `--t7` reuses matrix games where possible (CR-21); budget rule §6.4 |
| Replay sidecar slow or flaky | One persistent process per fake; 30 s timeout → 503 path, which is a tested client path; `accept` mode only for stub-game suites and labelled |
| Fixed clocks vs the rules-era gate (RULES4_FROM) cause verify mismatches | Both clocks set together (§2.5); J-2 runs once before and once after 2026-12-01 |
| Lobby suites written for production have hidden live assumptions | Migrate one suite at a time (§9.1), assert `fb.unexpected == []` to surface any call the fake does not model |

### 9.3 Rollback
T7 changes no app code. Rollback = revert the T7 commits. The only behaviour change outside new files is that the migrated lobby suites now default to offline. Reverting them restores the old live-by-default behaviour, which the board forbids in this wave. So the guard part (step 1 and the guard lines of step 2) should be kept even if the rest is reverted.

**Definition of done:** FB-1…FB-7, PF-A…PF-E, AX-1…AX-5, BL-1, BL-3, RG-1…RG-3, RG-5, OW-1, OW-2 pass (each P1 either passes or is listed as cut with a reason). The final report contains the Tier 2 `summary.md`, `compare.md`, the a11y result (ratchet and strict), the balance table, the CR status table, and the manual-session records with their limits paragraph. Budgets and strict gates that fail because of open CRs are reported as FAIL with the CR, never as done.
