# VERIFY_INTEGRATION — server-side verification of ranked results (T-15)

> Security Engineer (Agent 28), 2026-11-20. For the orchestrator (owner of `js/net.js`, Supabase, git) and the lobby lead (`js/lobby.js`).
> `js/net.js` and `js/lobby.js` were **not** modified. Everything below is paste-ready.

## 0. State right now

| Piece | State |
|---|---|
| Edge Function `verify-result` | **Deployed, ACTIVE (v3)**, `verify_jwt=false` (it authenticates the player itself). URL `https://xvqaxphyfqdzkddmoosu.supabase.co/functions/v1/verify-result` |
| Engine pin | `f588aa83…27f2bd` = the `js/` engine of 2026-11-20 ~15:40. **Must be re-pinned at release** (§4). The live site (GitHub Pages) still serves v2, so today the function answers `503 engine_unavailable` to real calls that do not carry the bundle. Nothing calls it yet. |
| Migration A `supabase/migrations/20261120_t15_verify_result.sql` | **Applied** (2026-11-20, by the orchestrator; verified live: `verified`, `verify_error`, `verified_at`, `verify_attempts`, `verified_result` exist on `game.results`). The function now runs in stored mode. |
| Migration B `supabase/migrations/20261120_t15b_board_verified.sql` | **Applied** (2026-11-20; verified live: `game.board` returns the `verified` key). Rollback text is in the file. |
| Tests | `tests/verify.test.mjs` (120 games + forgeries), `tests/determinism.test.mjs` (300 games, ±1 ulp), `tests/security_live.mjs` (live backend). |

## 1. What the function does

`POST {id, secret, result_id, actions}` → 
1. `game.auth(id, secret)` (same check as every `rr_*`), then the result row must belong to the player and be finished.
2. The replay config is built **only from the server row**: mode (challenge / weekly / daily), world, character (`challenges.profession`, or `idx:N` → `world.daily.chars[N]` exactly like `lobby.js dailyChar()`), seed (`challenges.seed`, or the same `hashtext` formula as `game.week()/game.day()`), `maxMonths` 24 for daily, `tutorial:false`, `bailout:false`.
3. `E.replay(cfg, actions)` with the pinned engine. Compared with what `rr_finish` stored: status, months, passive, expenses, net worth (after the same rounding `net.finish` does), `stats.stars`, `stats.progress` (±0.006).
4. Stored mode: match ⇒ the replayed numbers are written + `verified=true`; mismatch ⇒ claim kept, `verified=false`, `verify_error`, `verified_result` (server numbers, diff, engine hash, timing, browser family). A verified row is never touched again. 5 attempts per result.

Responses (JSON):

| HTTP | body | client action |
|---|---|---|
| 200 | `{ok:true, verified:true, stored, result}` | done (✓) |
| 200 | `{ok:true, verified:true, already:true}` | done |
| 200 | `{ok:true, verified:false, error:'claim_mismatch'\|'replay', detail, result}` | done — result flagged (⚠). Do not retry. |
| 401 `unauthorized` · 404 `result_not_found` | | drop |
| 409 `not_finished` | | call `net.finish` first, then retry |
| 422 `no_actions` / `bad_world` / `bad_char` / `unsupported_mode` | | drop (old save without a full action log) |
| 400 `bad_actions` / `bad_json` · 413 `too_big` | | drop (client bug) |
| 429 `rate_limited` | | keep, retry next session |
| 503 `engine_unavailable` · 500 · network error | | keep in the pending queue, retry later (site/function release window) |

## 2. `js/net.js` — add this (orchestrator)

```js
const FN_VERIFY = `${SB}/functions/v1/verify-result`;
// add to ERR: no_actions: 'אין יומן מהלכים למשחק הזה', not_finished: 'המשחק עוד לא נשלח לשרת', engine_unavailable: 'השרת מתעדכן — ננסה שוב בעוד רגע',

  /** Server-side replay of a finished ranked game (Edge Function verify-result).
   *  actions = the engine's st.actions (also in summaryForServer(st).actions). Call AFTER finish().
   *  → {ok, verified:boolean, stored:boolean, already?, error?: 'claim_mismatch'|'replay', result:{status, months, passive, expenses, netWorth, stars, progress}} */
  async verify(resultId, actions) {
    const { p_id, p_secret } = auth();
    let r;
    try {
      r = await fetch(FN_VERIFY, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p_id, secret: p_secret, result_id: resultId, actions }) });
    } catch (e) { const er = new Error('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'); er.code = 'offline'; throw er; }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(ERR[j?.error] || 'משהו השתבש בשרת. נסה שוב.'); e.code = j?.error || 'http_' + r.status; e.status = r.status; throw e; }
    return j;
  },
```

## 3. `js/lobby.js` — call it after `net.finish` (lobby lead)

**3a. Keep the log out of `rr_finish` stats, keep it for verify** (line ~1109, `addPending`). `summaryForServer` now carries the full `actions` log; `rr_finish` silently drops the whole `stats` (incl. `progress`, used for ranking lost games) when it is ≥ 16 KB. Measured ≤ 8.3 KB in 80 random games, but trading-heavy long games can grow:

```js
const { actions = null, ...summary } = e.summary || {};
addPending({ pid: net.me()?.id, resultId: e.resultId, status: e.status, months: e.months, passive: e.passive || 0, expenses: e.expenses || 0, netWorth: e.netWorth || 0,
  actions, stats: { ...(e.summary ? summary : { stats: e.stats || {} }), progress: e.progress ?? null, stars: e.stars || 0, world: e.worldId, char: e.charId } });
```
(`net.finish` ignores unknown fields of its argument, so `actions` in the pending item is harmless there.)

**3b. finish → verify, in one helper used by both `flushPending()` and `submitResult()`:**

```js
/** finish (if needed) then verify. Returns true when the pending item can be dropped. */
async function sendResult(a) {
  try { await net.finish(a); }
  catch (e) { if (!['already_finished'].includes(e.code)) { if (['result_not_found', 'unauthorized'].includes(e.code)) return true; throw e; } }
  if (!a.actions || !net.verify) return true;                       // v2 save without a log: nothing to verify
  try { const v = await net.verify(a.resultId, a.actions); a.verified = v.verified; return true; }
  catch (e) {
    if (['offline', 'engine_unavailable', 'rate_limited', 'server_error'].includes(e.code) || e.status >= 500) { a.finished = true; addPending(a); return false; }
    return true;                                                     // 4xx: not retryable
  }
}
```
- `flushPending()`: replace `await net.finish(a); dropPending(a.resultId);` by `if (await sendResult(a)) dropPending(a.resultId);` (keep the existing catch for codes).
- `submitResult()`: replace the `net.finish(args)` try-block by `if (args && !(await sendResult(args)))` → show the existing "לא נורא — ננסה שוב" note but still load the board; then `dropPending` only when `sendResult` returned true.
- A pending item that already finished (`a.finished`) gets `already_finished` from `rr_finish` on retry — handled above.

**3c. Board ✓ / ⚠** (in `boardHtml`, the row template at line ~386, next to the nickname). Works after migration B (`verified` key); before it the key is absent and nothing shows:

```js
const vmark = r.verified === true ? '<span class="lb-ver ok" title="תוצאה מאומתת בשרת">✓</span>'
            : r.verified === false ? '<span class="lb-ver bad" title="התוצאה לא עברה אימות בשרת">⚠</span>' : '';
// … <span class="nm">${esc(r.nickname)}${vmark}${r.me ? ' <small>(אתה)</small>' : ''}</span> …
```
CSS: `.lb-ver{margin-inline-start:.3em;font-size:.8em}.lb-ver.ok{color:#1f9d63}.lb-ver.bad{color:#c2410c}`.
End screen (optional): when `verify` answered `verified:false`, show "התוצאה לא אומתה בשרת ולכן מופיעה בסוף הטבלה".

## 4. Release procedure (engine ⇄ function must match)

1. `node tests/engine.test.mjs && node tests/verify.test.mjs && node tests/determinism.test.mjs`
2. `node tools/build-edge.mjs` — pins the current `js/` engine (writes `supabase/functions/verify-result/{engine_pin.js, engine.bundle.json, engine/}`).
3. Deploy the site (GitHub Pages) with that same `js/`.
4. Deploy the function: Supabase MCP `deploy_edge_function(name:'verify-result', verify_jwt:false, files: index.ts, verify_core.js, engine_loader.js, engine_pin.js)` (≈ 22 KB; the engine itself is NOT uploaded) — or `supabase functions deploy verify-result --no-verify-jwt`.
5. `curl https://xvqaxphyfqdzkddmoosu.supabase.co/functions/v1/verify-result` → `{engine:<new hash>}`. The first POST loads the engine from `https://orikenenb-lgtm.github.io/rat-race-game/js/<files>` and checks the SHA-256 (`engineSource:'site'`). Override with the function secret `RR_ENGINE_BASE_URL` (e.g. a staging site).
6. CI / pre-merge: `node tools/build-edge.mjs --check` fails when `js/` changed without a re-pin.

Between steps 3 and 5 (and up to ~10 min of Pages CDN cache) verify answers `503 engine_unavailable`; the client keeps the item pending and retries — honest players are never flagged by a release.
Code that does not hash to the pin is never executed, whatever the source (site, request `engine_bundle`).

## 5. Applying the migrations (needs approval)

- A (columns only): MCP `apply_migration(name:'t15_verify_result_columns', query: <file A>)`. Verify: `GET` health → `"store": true` within a minute.
- B (board): MCP `apply_migration(name:'t15b_board_verified', query: <file B>)`. Rollback = the commented block at the bottom of file B.
- After A: `select verified, count(*) from game.results group by 1;` · rejected rows: `select id, verify_error, verified_result->'diff' from game.results where verified is false;`

## 6. Later (not done here)

- Ranked stars from verified rows only (`rr_sync_progress` still trusts the client, S4).
- Optional: once all clients send logs, hide unverified rows older than N minutes from boards (one line in `game.board`).
