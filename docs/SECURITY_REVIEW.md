# SECURITY_REVIEW — מירוץ העכברים (v2 live + v3 branch)

> Security Engineer (Agent 28) · 2026-11-20 · scope: master spec §10 (multiplayer: "the server is the source of truth"), §11 (reliable economy),
> §12 (security), §14 (tests). Builds on PROJECT_AUDIT §4 (S1–S10). Live tests ran against project `xvqaxphyfqdzkddmoosu` with `טסט` players only.
> Nothing existing was altered, revoked or deleted. Severity = impact on players / fairness (there is no real money in the game).

## 1. Summary

| # | Threat | Severity | Status after this task |
|---|---|---|---|
| S1 | Forged ranked result via devtools (`rr_finish` trusts the client) | **High** | **Mitigated server-side, pending activation** — `verify-result` deployed and proven live (forged claim → `verified:false`); needs migration A (+B for the board) and the 20-line client call (VERIFY_INTEGRATION §2–3) |
| X1 | **Stored XSS in the group feed** (`lobby.js:873`, `lobby.js:877`) | **High** | **Open — confirmed live**, fix below (1 line each) |
| S3 | Seed pre-simulation (daily/weekly seeds computable offline **days ahead**) | Medium | Open — proven; fix designed (§3.5) |
| S4 | Stars / meta trusted from the client (`rr_sync_progress2`) | Medium | Open — proven live (12★ in one call) |
| X2 | Group-feed DoS: negative `stars` throws (`lobby.js:871`) | Medium | Open — fix below |
| S2 | Checkpoint accepts any state | Low (after S1 fix) | By design; resume-only; rewinds/size blocked (proven) |
| S7 | three.js from CDN without SRI / no CSP | Low–Medium | Open — exact hashes + CSP below |
| R1 | No rate limit on sign-up / group join / checkpoint volume | Low | Open — recommendations |
| S5 | Referral farming | Low | **OK** — 5/day/referrer proven live |
| D1 | Duplicate finish / duplicate attempts | — | **OK** — `already_finished` + unique indexes (proven) |
| A1 | Another player's turn / result / checkpoint | — | **OK** — ownership enforced (proven ×4) |
| K1 | Key/secret exposure | Low | OK (publishable key only; secret in localStorage — see X1) |
| F1 | Cross-engine float drift → honest results flagged | Low | **Mitigated** — 0 approximated-math calls, 300/300 games bit-identical under ±1 ulp; CI guard |
| L1 | Legacy v1 RPCs still callable (`rr_start`, `rr_create_challenge`, `rr_register`) | Low | Open — revoke after v1 is confirmed dead (needs approval) |
| S10 | AI misuse | n/a | no AI service exists |

## 2. What was built and deployed (T-15)

- **Edge Function `verify-result` (ACTIVE, v3, `verify_jwt=false`)** — `supabase/functions/verify-result/{index.ts, verify_core.js, engine_loader.js, engine_pin.js}`.
  Authenticates (`game.auth`) **before** doing any work, derives seed/world/character/limits from the server row, replays with the pinned engine, compares, writes (stored mode). Service credentials never leave the function (it uses its own `SUPABASE_DB_URL` connection; nothing new is exposed through REST/GraphQL).
- **Engine integrity:** the function holds only the SHA-256 of the canonical engine bundle (`tools/build-edge.mjs`). It loads the files from the live site (= exactly what players run) and executes them only if the hash matches; a mismatch is `503 engine_unavailable` (retry, never flagged).
- **Migrations (written, NOT applied — `apply_migration` needs a human approval and was auto-cancelled):** A = 6 additive columns (`verified, verify_error, actions_hash, verified_at, verify_attempts, verified_result`); B = `game.board` with rejected-last / verified-first ordering and a `verified` key (rollback text included). Until A is applied the function runs in dry-run mode (answers, stores nothing).
- **Hardening found while testing my own function (fixed before v3):** v2 loaded the engine before authenticating — anonymous requests could trigger site fetches and got `503` instead of `401`. v3 authenticates first; `GET` health does no work.

## 3. Threat model — details, evidence, fixes

### 3.1 S1 — balance tampering / forged results (High → mitigated)
`rr_finish` stores status/months/net worth/passive/expenses from the client (only range checks). Live: `טסט-B` played a real game (lost, month 47, ₪1,162,214) and `rr_finish` accepted *won, month 3, ₪50,000,000* (`tests/security_live.mjs`).
**Fix (deployed):** `verify-result` — live results:

| Attempt | Server answer |
|---|---|
| honest log + honest claim | `verified:true` (replayed in 45–118 ms) |
| real log + forged claim | `verified:false, claim_mismatch:status,months,passive,netWorth,stars,progress` |
| truncated / fabricated log | `verified:false, replay:not_over` |
| edited decisions (pass→buy) | `verified:false, replay_mismatch at 18 (["c","buy"]): unknown option buy for deal` |
| B verifies A's result | `404 result_not_found` · wrong secret `401` · malformed log `400 bad_actions` · SQL-ish id `404` |

Offline (`tests/verify.test.mjs`, 120 games, all worlds × daily/weekly/challenge): every honest game verifies; forged months / net worth / passive / expenses / status / stars / progress, edited decisions (15/15), dropped action, truncated log, other seed, other character, and a free-mode (bailout+tutorial) log under ranked rules are all rejected; the client cannot choose seed / bailout / tutorial / month limit.
**Remaining:** apply A+B, add the client call. Until then boards still show unverified claims.

### 3.2 Replaying other players' turns / copying logs (Low)
Ownership is enforced everywhere (live: B cannot `rr_finish`, `rr_checkpoint`, or `verify` A's result). Two members of the same challenge share seed+character, so A's log would also verify for B — but logs are never exposed by any RPC (`stats` is not returned by boards/feeds). Copying needs the other player to hand it over. `actions_hash` is stored for audit; flagging equal hashes automatically would hit kids who tap the highlighted button every time (identical logs are realistic), so it is not automatic.

### 3.3 Duplicate finish / double submission (OK)
`rr_finish` → `already_finished` (live), unique indexes one result per (player, challenge/day/week), `verify-result` never overwrites a verified row (`… and verified is not true`) and caps attempts at 5 per result (stored mode).

### 3.4 S2 — checkpoint abuse (Low)
Live: `rr_checkpoint` accepted `{forged:true, cash:99999999}`; rewind → `stale_checkpoint`; 320 KB → `state_too_big`. A forged checkpoint only affects the player's own resume, and after S1 the result is judged by replay from turn 0, so a forged state cannot produce a verified result.
Optional hardening (lobby): on resume, accept the server checkpoint only if `E.replay(cfg, state.actions)` serializes to the same state. Rate limit: none — 300 KB per call, unlimited calls (storage/egress abuse); add `checkpoint_count` cap (e.g. 2,000 per result) when convenient.

### 3.5 S3 — seed pre-simulation (Medium)
- Daily/weekly seed = `abs(hashtext('ratrace-daily-' || key))` / `abs(hashtext('ratrace-' || key))`. `hashtext` is a public algorithm: a stock local PostgreSQL 16 returned `1960546479` for today (= live `game.day()` seed), `776670202` for tomorrow and `1382272518` for week 48, identical to production. World/character rotation is also deterministic ⇒ anyone can simulate tomorrow's daily tonight and play it perfectly. Replay verification cannot detect this (the log is legal).
- Challenge seeds are random but `rr_begin` reveals them to any member — a sock-puppet member can start first and pre-simulate.
**Fix (not applied — needs approval, affects seeds):** (1) add a server secret: `game.secrets(k text primary key, v text)` (RLS, no grants) and `hashtext('ratrace-daily-' || key || (select v from game.secrets where k='seed_pepper'))`, effective only for keys after a cut-over date so in-progress games keep their seed; (2) store the seed in `results.seed` at `rr_begin` (the verifier then reads it instead of re-deriving — update `index.ts ROW` accordingly). Residual (by design, PROJECT_AUDIT A4): the seed is still revealed when a game starts; the real fix is a server-held RNG.

### 3.6 S4 — stars / meta from the client (Medium)
Live: `rr_sync_progress2(stars {w1..w4: 3}, meta {games: 99999, wins: 99999})` → `total_stars: 12`, title "אגדה" on every board. Values are capped (3★ per world, keys/achievement ids/pawn validated — proven), but not earned.
**Fix:** for ranked display, derive stars from verified results (`max(stats->>'stars') where verified`), or show board titles from verified rows only. Free-play stars cannot be verified without uploading free games (by design).

### 3.7 R1/S5 — referral, gifts, rate limits
| Path | Limit | Evidence |
|---|---|---|
| Referral ⚡ | 5 per referrer per day | live: 6 sign-ups with `p_ref` → `rr_claim_energy` total 25 ⚡ ✓ |
| `rr_send_energy` | once per (from, to, day) — unique index | sock puppets in a group: +3 ⚡ per puppet per day (energy is local, no money: Low) |
| `rr_log_event` | 50/day, data < 2 KB, kind regex | live: `<script>` kind → `bad_kind` ✓ |
| `rr_register` | **none** | 61 players total, 37 + 24 in two days — mass sign-up possible (puppets for S3/gifts) |
| `rr_join_group` | none (code = 6 of 32 chars ≈ 1.07·10⁹) | enumeration impractical but unthrottled |
| `rr_checkpoint` | size only | see 3.4 |
| `verify-result` | 5 attempts/result (after A) + 10/min/player per isolate (best effort) | live: 14 calls in a row all 200 — requests spread over isolates, so until A is applied an authenticated player can make the function replay repeatedly (~50 ms CPU each; quota cost only) |
Recommendation (cheap, additive): per-player counters for checkpoint/join; for sign-ups a per-day global cap or moving registration behind an Edge Function with IP throttling.

### 3.8 X1/X2 — XSS via nicknames, group names, titles, feed (High)
Checked every `innerHTML` template in `js/lobby.js` (23 sinks) and `js/ui.js` (20): nicknames, group names, challenge titles, duel `by`, achievement names, leaks, history scenarios are all passed through `esc()`; toasts use `textContent`; `pawn` is regex-validated by the server; `ui.js` renders engine data (local constants) and the player's own checkpoint only. **Two holes, both in `feedLine()` (group feed), whose `d = f.data` is arbitrary JSON from `rr_log_event` of any group member:**

| Line | Code | Problem |
|---|---|---|
| `js/lobby.js:873` (`case 'escaped'`) | `` ${d.months ? ` · ${d.months} חודשים` : ''} `` | `d.months` unescaped → stored XSS |
| `js/lobby.js:877` (`case 'ranked_won'`) | `` ${d.months ? ` בחודש ${d.months}` : ''} `` | same (any member can log kind `ranked_won`) |
| `js/lobby.js:871` | `starStr(Math.min(3, d.stars \| 0))` | `stars:-1` → `'★'.repeat(-1)` RangeError → the whole group screen fails to render for every member (DoS) |

Live proof: `rr_log_event('escaped', {months:'<i>טסט-xss</i>'})` by `טסט-A` was returned verbatim to `טסט-B` by `rr_group_feed`. Impact: script in every member's lobby → reads `localStorage['rr-player']` (id + secret = the account) → can finish/verify/rename as the victim. Benign marker only; the test group was left afterwards.
**Fix (lobby lead, 3 lines):**
```js
const st = d.stars ? ' ' + starStr(Math.max(0, Math.min(3, d.stars | 0))) : '';                       // 871
… ${d.months ? ` · ${num(Math.floor(+d.months) || 0)} חודשים` : ''} …                                 // 873
… ${d.months ? ` בחודש ${num(Math.floor(+d.months) || 0)}` : ''} …                                   // 877
```
Server-side defense in depth (optional, additive): `rr_log_event` could keep only known keys with typed values (`months`/`age`/`stars` numeric). CSP (§3.10) would also have blocked the `onerror` payload class.

### 3.9 K1 — secrets and keys
- Browser holds only `sb_publishable_…` (public by design). `grep` of `js/`: no service/secret keys. The function's DB URL stays in its environment.
- Player secret: 24 random bytes, stored as SHA-256 server-side, kept in `localStorage['rr-player']` → readable by any XSS (hence X1 = High).
- Recovery code = base64 of `[id, secret, nickname]` (not encrypted): shown only on demand on the profile screen via `textContent`, copied to the clipboard on request, never put in a URL or logged. `verify-result` logs only the result id. Recommendation: an `rr_rotate_secret` RPC + "move device" flow, and a warning next to the code ("מי שיש לו את הקוד שולט בחשבון").

### 3.10 S7 — CDN integrity / CSP
`index.html:17` loads three@0.170.0 from jsDelivr via an import map, no SRI, no CSP; a CDN compromise = full script execution. SRI for import maps (`"integrity"` key) — exact hashes of the files actually imported (computed today from jsDelivr bytes):
```json
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"},
 "integrity":{
  "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js":"sha384-GY5FqjttLCFRt/McQbyaVdCk2O1IQtOeX8Py6NfD89BIAsIyJFRl4UgSXrk2vXAk",
  "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js":"sha384-aJoe4qqS/DgF2jh9njAuvA6QIveJYoCuYOfYjdFY8P3eawzmc9bEQ40jq2TvOyuP",
  "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js":"sha384-Lq1Wl94so5JCKGDvezrdVMJhdeKQkwb8iwRo59QrPPd61CnrCJZLxYmFlQ8ZuOKR",
  "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js":"sha384-wOjwauvHlJO7K6APr7FmMGH2nupQa3Ndzas9bJZhsAMOK055efJud8ns4aYmASKv",
  "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js":"sha384-9ItPPH2vgKbkvgrqTKq7ptGYe+WuAnqlZtlqleJW4/CJjnM5R7C+efD6iS7ADPJ9"}}
```
Browsers without import-map integrity support ignore the key (no breakage); for full coverage self-host `three` under `vendor/` (no build step needed) — the stronger option.
CSP (GitHub Pages cannot send headers → `<meta http-equiv="Content-Security-Policy">` as the first child of `<head>`). The import map is inline, so it needs its hash; **changing the import map changes the hash** (current: `sha256-+S5cjrE2kA9WKYoBqOcm8PSjn1mZpTjpO5Uc7USBpj0=`, recompute after adding `integrity`):
```
default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'sha256-<importmap>'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' https://xvqaxphyfqdzkddmoosu.supabase.co;
worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'
```
Before enabling: `js/lobby.js` has 3 inline `onerror="…"` attributes (blocked by this CSP — replace with `addEventListener('error', …)`), `style-src 'unsafe-inline'` covers the many `style=` attributes; test TTS/audio/GLB loading with the e2e suite. CSP would have neutralised X1's `onerror` payloads.

### 3.11 RLS / exposure / advisors
- RLS enabled on all 7 `game` tables, **0 policies** (deny-all); `anon`, `authenticated`, `service_role` have **no USAGE on schema `game`**; `public` has no tables. Live: `GET /rest/v1/players` → 404 PGRST205; `Accept-Profile: game` → 406 PGRST106 ("Only … public, graphql_public"); `game.*` RPC via REST → 406.
- All access through 23 `public.rr_*` `SECURITY DEFINER` functions with `search_path=''` and `game.auth(id, secret)` (sha256). Every one checked in this review re-checks ownership/membership.
- `get_advisors(security)` today: `rls_enabled_no_policy` INFO ×7 (intended deny-all), `anon_security_definer_function_executable` WARN ×23 and `authenticated_…` WARN ×23 (intended: the RPCs *are* the API, each authenticates itself). No new findings from T-15 (no DB objects were created).
- L1: v1 RPCs `rr_start`, `rr_create_challenge`, `rr_register` (wrapped by `rr_register2`) remain executable. Revoke `EXECUTE` from anon on `rr_start`/`rr_create_challenge` once v1 clients are gone (needs approval).

### 3.12 F1 — cross-engine determinism (Low, mitigated)
The browser (V8/JSC/SpiderMonkey) and Deno (V8) must produce bit-identical games or honest players get flagged. `tests/determinism.test.mjs`:
1. static scan of the exact replayed module graph (17 modules): **no** `Math.log/exp/pow/sin/cos/…` and no `**` with a non-integer exponent (two exact uses allow-listed with justification). The engine lead already replaced the Box–Muller `Math.log/cos` and the CPI `** (1/12)` with `finance/bank.js` `dexp/dlog/dpow` (+ − × ÷ only).
2. 300 seeded ranked games, then replayed with every approximated `Math` function nudged ±1 ulp: **0 calls** to them during play, **0/300 diverged** for +1 ulp and −1 ulp.
3. Harness sensitivity check: nudging `Math.sqrt` (used, correctly rounded) by ±1 ulp → 0/40 diverge (the engine's rounding to agorot/shekels absorbs last-bit noise); by 1e-6 → 10/40 diverge (the test does catch material drift).
Residual: future code. Guard: run the determinism test in CI; `verified_result.client` stores the browser family (v8/jsc/spidermonkey) so any false positive can be triaged.

### 3.13 Edge Function review (own code)
Auth before work; uuid + action-log schema validation (≤ 6,000 actions, primitive args); body ≤ 1 MB (larger bodies are cut by the platform/proxy first — a 1.05–1.3 MB live test got 504 from the gateway, a 500 KB junk body got `400 bad_json` instantly); parameterised SQL (postgres.js tagged templates); CORS `*` is safe (no cookies; the secret is in the body); responses carry codes only; logs carry result id, verdict, timing; no secrets. Engine code executes only if it hashes to the pin.

## 4. Live test evidence (2026-11-20, `node tests/security_live.mjs`)
Run 1 (tag 6966): 30 ✔, 2 ✘ — the two failures were in my function (unauthenticated engine load; throttle ordering) → fixed in v3. Run 2 (tag 6759, v3): 29 ✔, 2 ✘ → both reclassified as informational (platform 504 on >1 MB bodies before the function; per-isolate throttle not reached — function logs show the calls spread over 3 isolates). **Run 3 (tag 4984, final): 29 ✔, 0 ✘, 2 ℹ** (14 back-to-back verify calls all 200: in dry-run mode the per-isolate throttle is effectively no limit; the durable cap is `verify_attempts` once migration A is applied).
Edge logs show server replays of 45–118 ms CPU, verdicts as listed in §3.1.

**Test data left in production** (non-destructive policy; can be deleted with approval): players `טסט-A-6966`, `טסט-B-6966` (renamed `טסט<i>6966</i>`), `טסט-ref-6966-1…6`, `טסט-A-6759`, `טסט-B-6759` (renamed `טסט<i>6759</i>`), `טסט-A-4984`, `טסט-B-4984` (renamed `טסט<i>4984</i>`) — 12 players; groups `GUUCTE`, `AVBTDQ`, `L5GUDW` (all members left; one challenge each; 6 results: `cdeeffad…`, `cd1e5043…`, `cf7006c4…`, `861e763c…`, `b7018c86…`, `26a2b130…`, the B-results carry the forged claims); `טסט-A-*` carry 12★ (S4 test); `rr_log_event` rows with the `<i>טסט-xss</i>` marker. SQL to list them: `select id, nickname from game.players where nickname like 'טסט%' and created_at::date = '2026-11-20';` None of them appear on daily/weekly boards.

## 5. Recommended order
1. **X1/X2** lobby fix (3 lines) — today. 2. Apply migration A, then B; add `net.verify` + lobby calls (VERIFY_INTEGRATION). 3. At the v3 release: re-pin + deploy function with the site. 4. S3 pepper + `results.seed` (cut-over date). 5. CSP + SRI. 6. S4 stars from verified rows. 7. Rate limits (register/checkpoint/join), L1 revokes, `rr_rotate_secret`.
