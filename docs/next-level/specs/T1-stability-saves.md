# T1 — Stability, 3D fallback & saves (spec)

Status: ready to implement · Branch `feat/rat-race-next-level` · Covers TASK_BOARD NL-02 + the client half of NL-03.
Input: `docs/next-level/research/engine-robustness.md` (cited below as **R§n**). Every file:line ref is against HEAD `9e871e3`.
Priority tags: **P0** must ship · **P1** should ship in the same session · **P2** may be cut, and must be listed as cut if it is.

---

## 0. Scope, ownership, hard rules

**T1 may edit:** `index.html`, `js/main.js`, `js/game.js`, `js/scene.js` (only `init`, `loadGLB`, `preloadWorld`, `preloadLife`, `preloadDice`, plus the new `dispose`/`onContextLost`/`failedModels`), the new `js/render/*`, `js/flags.js` and `js/saves.js`, and in `js/lobby.js` only the lines listed in §4.8. It may add the new tests in §6.
**T1 must not touch:** `js/engine.js` and anything engine.js imports (that would change the verify pin, R§4.3), `js/ui.js`, `css/*`, `js/progress.js`, `js/net.js`, `js/energy.js`. Engine needs go to the other team as interface requests (§4.9).

Hard rules:
1. One engine and one `game.js` flow. A renderer only draws. `board2d.js` must not import `engine.js` for any rule, and it may call only `E.boardInfo()` for tile labels and colours.
2. `engine.js` never imports `flags.js`, `saves.js` or `js/render/*`. A test enforces this (§6.1 T-graph).
3. T1 never deletes a game save without first making a backup (§4). It never overwrites a future-version save.
4. No new CSS files. Each new module injects its own `<style id="…">` once (`overlay.js` → `#t1-overlay-css`, `board2d.js` → `#t1-b2d-css`). This is because `css/*` is owned by another team.
5. No test talks to production Supabase. Every browser test routes `**/*.supabase.co/**` (§6.2).
6. Module evaluation of `board2d.js`, `null.js`, `flags.js` and `saves.js` must not touch `document` or `window` at import time, so Node tests can import them. `saves.js` and `flags.js` read storage only inside functions, never at import.

---

## 1. Behaviours and exact Hebrew strings

All strings use singular masculine imperative, as the existing UI does ("בדוק", "נסה"). The ids (`S-…`) are referenced by the tests. Implementation keeps them in one `const STR = {…}` object in `js/render/overlay.js` (UI chrome) and in `js/saves.js` (save messages).

### 1.1 Loading (P0)
| id | Where | Text |
|---|---|---|
| S-L0 | `#loadText` at boot (static in index.html) | `פותחים את המשחק…` |
| S-L1 | stage: renderer | `מכינים את התצוגה` |
| S-L2 | stage: world models | `טוענים את {worldName}` · counter `{n} מתוך {N} דגמים` |
| S-L3 | stage: life models | `טוענים את דגמי החיים` · counter `{n} מתוך {N}` |
| S-L4 | stage: board | `מסדרים את הלוח` |
| S-L5 | stage hint, after `SLOW_HINT_MS` in one stage | `לוקח יותר מהרגיל…` |
| S-L6 | renderer stage exceeded `RENDERER_TIMEOUT_MS` | `התלת־ממד מתעכב, עוברים למצב קל…` |
| S-L7 | inline boot watchdog (index.html), after `BOOT_SLOW_MS` | `הטעינה לוקחת יותר מהרגיל. אם זה נתקע, נסה לרענן את הדף.` + button `רענון הדף` |

No percentage character ever appears in `#loading` (acceptance A-12).

### 1.2 Fatal start failure: error panel inside `#loading` (P0)
Shown only when no renderer at all could start **and** the game state could not be shown, or when `startGame` threw for any other reason. role=`alertdialog`, focus goes to the primary button.
- S-E1 title: `לא הצלחנו לפתוח את המשחק`
- S-E2 body: `ההתקדמות שלך שמורה. אפשר לנסות שוב, לעבור למצב קל (בלי תלת־ממד) או לחזור ללובי.`
- Buttons: S-E3 `לנסות שוב` (primary) · S-E4 `מצב קל` (hidden when flag `board2d` = `off`) · S-E5 `חזרה ללובי`
- S-E6 `<details>` summary: `פרטים טכניים` (body = `error.message`, at most 300 characters, no stack)

### 1.3 Renderer notices: toasts after the board is shown, once per page load (P0)
Use `ui.toast(text, { ms: 6000, action })`.
| id | Reason code | Text | Action |
|---|---|---|---|
| S-N1 | `no-webgl` | `הדפדפן הזה לא תומך בתלת־ממד, אז פתחנו את המשחק במצב קל. המשחק עצמו זהה.` | — |
| S-N2 | `three-failed`, `three-timeout` | `לא הצלחנו לטעון את התלת־ממד, אז עברנו למצב קל. המשחק עצמו זהה.` | `לנסות תלת־ממד` → `reloadInto3D()` (§2.6) |
| S-N3 | `webgl-init-failed` | `התלת־ממד לא עלה במכשיר הזה, אז עברנו למצב קל. המשחק עצמו זהה.` | — |
| S-N4 | `user-lite` (only right after the player turns it on) | `מצב קל פועל: לוח שטוח ומהיר, אותו משחק בדיוק.` | — |
| S-N5 | `none` (no renderer at all) | `לא הצלחנו להציג את הלוח, אבל אפשר להמשיך לשחק: הקוביות, הכרטיסים והדוח עובדים כרגיל.` | — |
| S-N6 | 3D, ≥1 model failed | `חלק מהציורים לא נטענו, ובמקומם מופיעים סימנים פשוטים. זה לא משפיע על המשחק.` | — |
| S-N7 | 3D and `scene.lowPower` is true (P1), at most once ever (`rr2-settings.liteOffered`) | `התלת־ממד כבד למכשיר הזה? במצב קל הכל זז מהר יותר.` | `למצב קל` → `setLite(true)` |

Lite toggle button `#liteBtn` (P1) in `.htools`: content `🪶` and `aria-pressed` = lite on. aria-label/title when off: `מצב קל (בלי תלת־ממד)`. When on: `חזרה לתלת־ממד`.

### 1.4 Recover bar `#recover` (P0)
A fixed bar above the bottom controls (z-index 60), role=`alertdialog`. It is never dismissed by Escape or an outside click.
| id | Case | Title | Body | Buttons (first = primary) |
|---|---|---|---|---|
| S-R1 | stuck mid-turn | `משהו נתקע באמצע התור` | `ההתקדמות שלך שמורה, ואפשר להמשיך בדיוק מאותה נקודה.` | `להמשיך מהשמירה` · `חזרה ללובי` |
| S-R2 | 3rd stuck within `RECOVER_WINDOW_MS` | same title | `זה קורה שוב. אפשר לנסות במצב קל, או לחזור ללובי.` | `להמשיך במצב קל` · `להמשיך מהשמירה` · `חזרה ללובי` |
| S-R3 | WebGL context lost and not restored within `CONTEXT_RESTORE_WAIT_MS` | `התצוגה התלת־ממדית נעצרה` | `זה קורה לפעמים בטלפונים כשנגמר הזיכרון. ההתקדמות שמורה.` | `להמשיך במצב קל` · `לנסות שוב בתלת־ממד` · `חזרה ללובי` |
| S-R4 | flag `recover` = off (rollback path) | toast only: `משהו השתבש. אפשר לחזור ללובי ולהמשיך מהשמירה.` | | |

### 1.5 Save messages (P0 unless marked)
| id | Case | UI | Text |
|---|---|---|---|
| S-S1 | continue on a **future** save | `ui.modal` tag `שמירה מגרסה חדשה` | title `המשחק הזה נשמר בגרסה חדשה יותר` · body `כנראה שיחקת בו בגרסה מעודכנת של מירוץ העכברים. רענן את הדף כדי לקבל את הגרסה החדשה ולהמשיך מאותה נקודה. השמירה לא נמחקה.` · buttons `רענון הדף` (primary, `location.reload()`) · `חזרה ללובי` |
| S-S2 | migrated an older save | toast | `עדכנו את המשחק השמור לגרסה החדשה. עותק של המקור נשמר במכשיר.` |
| S-S3 | migration failed (incompatible), free/history | toast `kind:'bad'` | `לא הצלחנו להמיר את המשחק השמור לגרסה הזאת. שמרנו עותק שלו, ומתחילים משחק חדש.` |
| S-S4 | corrupt slot found (boot sweep, or at start) | toast | `משחק שמור אחד נפגם ולא ניתן לטעינה. שמרנו עותק שלו במכשיר.` |
| S-S5 | ranked: server/local state can't be loaded (corrupt or incompatible) | toast `kind:'bad'`, then lobby | `לא הצלחנו לטעון את ההתקדמות שלך באתגר. המשחק לא התחיל מחדש. נסה שוב בעוד רגע.` |
| S-S6 | backup before migration failed for lack of space | `ui.modal` | title `אין מקום לגיבוי` · body `לפני שמעדכנים משחק שמור אנחנו שומרים עותק של המקור, אבל אין מספיק מקום במכשיר. אפשר להמשיך בלי גיבוי או לחזור ללובי.` · buttons `להמשיך בלי גיבוי` · `חזרה ללובי` (primary) |
| S-S7 | quota: persist failed, once per game | toast `kind:'bad'`, `ms:8000` | `אין מקום במכשיר לשמור את המשחק. אפשר להמשיך לשחק, אבל אם תסגור את הדף ההתקדמות תאבד. כדאי לפנות מקום בדפדפן או לצאת מגלישה בסתר.` |
| S-S8 | boot sweep: `rr2-progress` quarantined | toast | `נתוני ההתקדמות במכשיר נפגמו. שמרנו עותק שלהם. אם יש לך כינוי, הכוכבים וההישגים יחזרו מהשרת.` |
| S-S9 | boot sweep: `rr-player` quarantined | toast | `פרטי הכינוי במכשיר נפגמו. שמרנו עותק שלהם. אפשר לשחזר את החשבון עם קוד השחזור.` |
| S-S10 | boot sweep: `rr2-pending-finish` quarantined (whole or some items) | toast | `תוצאה של אתגר שעוד לא נשלחה לשרת נפגמה. שמרנו עותק שלה במכשיר.` |
| S-S11 (P2) | auto-restored a `future` backup after an upgrade | toast | `המשחק השמור שלך חזר, ואפשר להמשיך ממנו.` |
| S-S12 | lobby: `game.js` itself failed to import (§4.8) | lobby toast | `לא הצלחנו לטעון את המשחק. בדוק את החיבור ורענן את הדף.` |

Other corrupt keys (`rr2-energy`, `rr2-library`, `rr2-settings`, …) are quarantined silently.

---

## 2. Module design

### 2.1 Files
| File | New/edit | ~Lines | Role |
|---|---|---|---|
| `js/flags.js` | new | 40 | UI-layer feature flags (§2.2) |
| `js/saves.js` | new | 230 | Client save shell: classify, backup, quarantine, quota, sweep (§4) |
| `js/render/select.js` | new | 90 | WebGL probe, renderer choice, dynamic import with timeout, fallback chain |
| `js/render/null.js` | new | 50 | `SCENE_API` list + a no-op scene (initial binding and last-resort renderer) |
| `js/render/board2d.js` | new | 450–550 | DOM 2D renderer implementing `SCENE_API` (§2.4) |
| `js/render/overlay.js` | new | 200 | Loading stages, error panel, recover bar, injected CSS (§3, §1.2, §1.4) |
| `js/game.js` | edit | +150 / −40 | `let scene`, `initShell`/`initRenderer`, stage reporting, saves.js integration, error boundary, recover, lite switch |
| `js/main.js` | edit | +40 | boot sweep, notices, `overlay` instead of `ui.showLoading`, auto-resume after reload, no error flash |
| `js/scene.js` | edit | +40 | GLB timeout + retry, progress detail, `kind`, `dispose`, `onContextLost`, `failedModels` |
| `index.html` | edit | +25 | `#board2d`, `#liteBtn`, `#recover`, `#loadSteps`, `#loadErr`, inline boot watchdog |
| `js/lobby.js` | edit | ≈8 lines | history save-key fix, `startGame` → `false` handling, S-S12 (§4.8) |

No other decomposition. `game.js` grows by about 110 net lines, which is acceptable because the new logic lives in the new modules.

### 2.2 `js/flags.js` (P0)
```js
// UI-layer feature flags. NEVER imported by engine.js or anything it imports (verify pin).
export const DEFAULTS = Object.freeze({ board2d: 'auto', recover: true });
const ALLOWED = { board2d: ['auto', 'on', 'off'], recover: [true, false] };
export function flag(name)            // → value, lazily loaded once per page
export function allFlags()            // → copy (for debugging and tests)
export function _resetForTests(src = {}) // {search, storage}: re-read (Node tests)
```
- Sources, low → high: `DEFAULTS` < `localStorage['rr2-flags']` (JSON object) < URL `?ff=` (comma list: `name:value`, bare `name` = true, `-name` = false). Values not in `ALLOWED` are ignored. Corrupt JSON is ignored.
- Meaning: `board2d: 'auto'` = 3D when available, else 2D. `'on'` = always 2D. `'off'` = never 2D: the chain becomes 3D → none. `recover: false` = rollback to the old silent behaviour plus S-R4.
- Only these two flags. No flag for the save shell: wrapper v3 is backward-readable by the old client (§4.2), so a code revert is a full rollback.

### 2.3 `js/render/select.js` (P0)
```js
export const RENDERER_TIMEOUT_MS = 20000;
export function webglAvailable()          // cached; offscreen canvas getContext('webgl2')||getContext('webgl');
                                          // releases it via WEBGL_lose_context; never throws
export function prefetch3D()              // starts import('../scene.js') once; stores the promise with .catch (no unhandled rejection)
export function preferredKind()           // 'lite' setting → '2d'; flag board2d 'on' → '2d'; 'off' → '3d'; 'auto' → webglAvailable() ? '3d' : '2d'
/** → { scene, kind: '3d'|'2d'|'none', reason: null|'user-lite'|'flag'|'no-webgl'|'three-failed'|'three-timeout'|'webgl-init-failed'|'2d-failed' } */
export async function loadRenderer({ want, canvas, root, onSlow })
```
Algorithm:
1. If `want === '3d'`: `mod = await race(prefetch3D(), RENDERER_TIMEOUT_MS)`. On timeout → reason `three-timeout`, and call `onSlow()` so the overlay shows S-L6. On a failed import → `three-failed`. Else `try { await mod.init(canvas) } catch → 'webgl-init-failed'`, then try `mod.dispose?.()`. On success → `{scene: mod, kind: '3d'}`.
2. Here because of a 2D want or a 3D failure, unless flag `board2d === 'off'`: `b = await import('./board2d.js')`, `b.init(root)`. On a throw → reason `2d-failed`.
3. Last resort: `{scene: nullScene, kind: 'none'}`.
4. Always set `document.body.dataset.renderer = kind`. The injected CSS (overlay.js) hides `canvas#c` unless `body[data-renderer="3d"]`. `[hidden]` alone does **not** hide the canvas, because `css/game.css:38` sets `display:block`. It shows `#board2d` only for `2d`.
5. A late three import that resolves after the timeout is ignored (store a `settled` flag).

`game.js` calls `prefetch3D()` at module evaluation when `preferredKind() === '3d'`. This keeps today's parallel download of three; without it, three would start only after game.js.

### 2.4 Scene API: what `board2d.js` and `null.js` must export
`js/render/null.js` exports `SCENE_API` (frozen array). These are the **32 functions `game.js` calls today** (from `grep -o "scene\.\w*" js/game.js`; research §5 said 33, but the list has 32 names), plus 4 T1 additions:

| Function | Called at (game.js) | 3D semantics | `board2d` behaviour | `null` behaviour |
|---|---|---|---|---|
| `init(el)` | 101 | renderer + scene | build root DOM inside `#board2d`, inject CSS, unhide | resolve |
| `setSpeed(f)` | 126 | duration factor | store factor; all durations × f | no-op |
| `setPaused(b)` | 120 | stop rendering | pause running WAAPI animations | no-op |
| `frame(rect)` | 177 | fit board to free rect | position the square board inside `rect` (`{x0,y0,x1,y1}`), side = min(w,h) | no-op |
| `preloadWorld(w, onProgress)` | 105, 245 | GLBs | `onProgress(1,{done:0,total:0,failed:0})`, resolve `{failed:[]}` | same |
| `worldLoaded(w)` | 243 | all GLBs ready | `true` | `true` |
| `preloadLife(onProgress?)` | 117, 248 | life GLBs | resolve | resolve |
| `preloadDice()` | 107 | dice GLBs | resolve | resolve |
| `setPawn(id, color)` | 106, 247 | pawn model | token: circle in `color` with glyph `{classic:'♟',car:'🚕',tophat:'🎩',rocket:'🚀',crown:'👑',diamond:'💎'}[id] ?? '♟'` | resolve |
| `buildWorld(w)` | 110, 251 | board + decor; clears the city | ring of `w.board.length` tiles from `E.boardInfo(w.id)`; theme colours from `w.theme` (`board`, `boardEdge`, `center`), history (`w.mechanic==='history'`) → sepia like `css/game.css:555`; centre caption `{w1:'התיק שלך',w2:'העיר שלך',w3:'הנמל שלך',w4:'העמק שלך'}[w.id] ?? 'התיק שלך'`; clears the city | no-op |
| `placePawn(i)` | 110, 252 | jump to tile | move the token instantly | no-op |
| `hop(from, to, last)` | 520 | ~190 ms (+110 squash) × speed | WAAPI arc `D(190)` (+ `D(110)` squash if `last`); resolves after | resolve |
| `throwDice(faces, {held,onBounce})` | 511 | ~1.7 s scripted throw; resolves with faces | `await D(450)`; call `onBounce(1)` at 55% and `onBounce(2)` at 78%; resolve `faces`. Don't draw dice: the DOM dice in `#bar` (ui.js) already show the result | resolve `faces` after `D(150)` |
| `holdDice(n)` / `cancelHold()` | 480 / 486, 502, 506 | hand shakes dice | no-op (ui.shakeDomDice runs anyway) | no-op |
| `resetCamera()` | 256 | — | no-op | no-op |
| `setCameraMode(m)` / `getCameraMode()` | 147 | follow/overview | store and return the mode (`'follow'` default). `#camBtn` is hidden unless 3D (§2.5) | same |
| `spawn(key, model, {label,color,golden,silent})` | 377, 666 | drop a model into the city | card (emoji + short label) in the centre grid; grid n = smallest n in 4..8 with n² ≥ count (as `scene.js:904`); drop-bounce `D(720)` unless `silent`; then `floatLabel(label)` and `sparkle` if golden | no-op |
| `despawn(key)` | 378, 664 | shrink | shrink `D(380)` then remove | no-op |
| `launch(key, success)` | 664 | rocket / topple | success: fly up `D(1300)`; fail: rotate + fade `D(800)` | no-op |
| `syncCity(list, {silent})` | 253 | reconcile with `E.cityModels` | same reconcile, no animation | no-op |
| `hasKey(key)` | 377, 378, 658 | — | city map lookup | `false` |
| `bump(key)` | 655 | pulse + sparkle | scale pulse `D(520)` + small sparkle | no-op |
| `shield(keys)` | 656 | dome | blue ring around each card `D(1700)` | no-op |
| `floatLabel(text, color, at, {rise,dur})` | 547, 647, 650, 655, 657, 658 | sprite rising | RTL pill above the anchor, rising and fading `D(dur ?? 1900)`; colours `{green:'#178a55',red:'#d23b30',blue:'#2f6fdb',gold:'#a8740a'}` or a raw CSS colour | no-op |
| `sparkle(at)` / `hearts(at)` | 590, 653 / 658 | particles | 6 `✨` / 5 `❤` spans burst `D(1400)` | no-op |
| `shake(amp, dur)` | 591, 652, 693, 702 | camera shake | jitter the board root by `amp*20` px for `D(dur)` | no-op |
| `confetti()` | 654 | 320 boxes | 40 coloured spans falling `3000 ms`; returns a promise | resolve |
| `celebrate(win)` | 793 | camera move ~1.4 s | board scale 1→1.04→1 over `D(win?1500:1200)`; await | resolve |
| `project(at)` | 548, 648 | screen point of anchor | centre of the token or card `getBoundingClientRect()` → `{x,y}` | `{x: innerWidth/2, y: innerHeight/2}` |
| **new** `kind` (const) | — | `'3d'` | `'2d'` | `'none'` |
| **new** `dispose()` | switch | stop the loop, `renderer.dispose()`, remove listeners | remove DOM, cancel timers | no-op |
| **new** `onContextLost(cb)` | — | `webglcontextlost` (with `preventDefault`) and `webglcontextrestored` → `cb('lost'|'restored')` | no-op | no-op |
| **new** `failedModels()` | S-N6 | names whose GLB failed or timed out | `[]` | `[]` |

`board2d.js` rules:
- **Layout:** the ring uses the same mapping as `scene.js:342 tilePos`, with side = n/4 (40 → 10). Tile i → grid column `gx+1`, row `gz+1` on a `(side+1)×(side+1)` CSS grid. Tile 0 sits bottom-right and the ring runs right→left along the bottom, as the 3D camera shows it. The grid container is `direction:ltr` with explicit placement, so the RTL page does not mirror it. Tile text inside is `dir=rtl`.
- **Tile content:** `boardInfo` color/ink; name truncated with ellipsis; icon emoji from `tile.icon`: `coin 💰, trend 📈, bag 👜, bars 📊, question ❓, bank 🏦, hammer 🔨, dollar 💵, ship 🚢, rocket 🚀, heart ❤️, life/family 🏠, edu/school/cap/study 🎓, tax/receipt 🧾, piggy 🐷, index/fund/pension/chart 📊, shop/store/business 🏪, news/newspaper 📰, x ✖️, default ⭐`.
- **City emoji by model name** (`key` may contain `dir/`): `apartment 🏢, business 🏪, stock 📈, crypto 🪙, bank 🏦, tower 🏙️, mall 🛍️, hotel 🏨, ship 🚢, warehouse 📦, factory 🏭, gold 🥇, campus 🏫, datacenter 🖥️, rocket 🚀, foundation 💗, home_family 🏡, wedding 💍, university 🎓, pension 🏝️, index_fund 📊, side_hustle 🛠️, hospital 🏥`, default `🏠`.
- `D(ms) = max(1, ms*speed)`. With `prefers-reduced-motion: reduce`, durations clamp to ≤ 60 ms, and shake/confetti/sparkle are skipped. `hop` still resolves.
- No `requestAnimationFrame` loop. Idle cost must be zero (weak phones).
- Every exported function catches its own errors (`try { … } catch (e) { console.warn('[b2d]', e) }`), and returns the documented default. Unknown keys are ignored.
- Root: `<div id="board2d" role="img" aria-label="לוח המשחק (מצב קל)">`. Decorative children are `aria-hidden`.

### 2.5 `game.js` changes (P0)
- `import * as scene` becomes `let scene = nullScene` (from `./render/null.js`). Every call site stays the same. Because the initial binding is a no-op scene, `applySettings()` / `frame()` / resize before init can't crash.
- Split `doInit()`:
  - `initShell()`: once. `wireUI()`, settings, the `#start` MutationObserver (installed once), the error boundary (§2.7), and `#liteBtn` wiring.
  - `initRenderer()`: re-runnable. Stage reporting (§3), `loadRenderer(...)`, `scene.setSpeed`, fonts race, `preloadWorld(w1, …)` + `setPawn` + `preloadDice` (3D only), `buildWorld`, `placePawn(0)`, `lifeP`. If the kind is 3D, attach `scene.onContextLost(...)`. Then `$('#camBtn').hidden = scene.kind !== '3d'`.
  - `initGame()` keeps its contract: idempotent, and it retries after a rejection. It now practically never rejects. It records `rendererInfo = {kind, reason}` for the notices.
- Saves: `readSave`/`persist`/`savedGame`/`clearSave` delegate to `js/saves.js` (§4.3). `saveKeyFor` keeps its keys, except `history` without `scenarioId`, which becomes `rr2-save-history-seed-<seed>` instead of `…-x` (writers always pass `scenarioId`, so no existing key moves).
- `startGame(cfg)` returns `Promise<boolean>`: `true` = game on screen. `false` = a handled failure, where a message is shown and the lobby is reopened via `bus.emit('lobby:open', {})` or offered in the panel. It throws only on a programming error.
- Move `persist()` to right after a successful `E.rollDice(S)` (`game.js:506`), before any scene/ui work (R§2, rec. 4). Keep the later `persist()` calls.
- Wrap the bodies of `turn()`, `handleLanding()`, the resume tail of `startGame()` (from `scene.buildWorld` to the end), and `sheetAction()` in `try { … } catch (e) { enterStuck(e, '<where>') }`.
- Lite switching: `setLite(on)`. It writes `rr2-settings.lite`. 3D→2D happens live: `persist(); gen++; closeCard(); scene.dispose(); initDone=false; initP=null; startGame({...CFG, resume:true})`. 2D→3D goes through `reloadInto3D()` (§2.6), because re-initialising three in the same page is not supported.
- `render(false)` after the world loads also calls `frame()` (already there). Board2d relies on `frame` for layout.

### 2.6 Reload helpers (P1)
`reloadInto3D()`: `persist()`, `writeSettings({lite:false})`, then `sessionStorage['rr2-resume-once'] = JSON.stringify(CFG)` and `location.reload()`. `main.js` boot, after the lobby opens: if `rr2-resume-once` holds a valid cfg, remove it, then `G.startGame({...cfg, resume:true})`. Ranked cfg (has `resultId`) is **not** auto-resumed. The player continues from the lobby, which re-runs `rr_begin` (anti-replay path unchanged).

### 2.7 Error boundary (P0)
Inside `game.js`:
```js
let stuck = false; const stuckLog = [];           // timestamps
window.__rrErrors = window.__rrErrors || [];      // capped at 20 {msg, where, at}; read by tests; no storage
function enterStuck(err, where) {                  // local catch → definitely stuck
  log(err, where);
  if (!flag('recover')) { busy = false; ui.setRollEnabled(!S?.over && S?.phase === 'roll'); ui.toast(STR.R4); return; }
  try { if (S && CFG) persist(); } catch {}        // engine mutators throw before mutating → S is consistent (R§2)
  stuck = true; busy = true; ui.setRollEnabled(false);
  stuckLog.push(Date.now()); showRecover(stuckLog.filter(t => Date.now() - t < RECOVER_WINDOW_MS).length >= 3 ? 'R2' : 'R1');
}
export function isStuck() { return stuck; }
export async function recover({ lite = false } = {}) { hideRecover(); stuck = false; busy = false; closeCard(); if (lite) return setLite(true); return startGame({ ...CFG, resume: true }); }
```
- Global `error` and `unhandledrejection` listeners are installed once at game.js module evaluation. They count only if a game is active (`S && !S.over && $('#start').hidden`) **and** the stack/filename contains `/js/game.js`, `/js/ui.js`, `/js/scene.js`, `/js/render/` or `/js/engine.js`. Then, after `STUCK_CHECK_MS`: if `busy`, or the roll is disabled while no card (`!ui.isEventOpen()`) and no `#gm` modal is open → `enterStuck(err,'global')`. Otherwise only log. This avoids false bars from extensions or the lobby.
- Lobby button → "חזרה למשחק" (`resume-active`, `lobby.js:1614`) only hides `#start`. `initShell`'s `#start` observer runs `recover()` when `#start` becomes hidden while `stuck` is true. No lobby change is needed.
- "חזרה ללובי" from the bar: `persist(); hideRecover(); bus.emit('lobby:open', {})`. `stuck` stays true, so returning via `resume-active` recovers.
- Context lost (3D): `persist()`. If there is no `restored` within `CONTEXT_RESTORE_WAIT_MS` → `enterStuck` variant with S-R3 (buttons → `recover({lite:true})`, `reloadInto3D()`, lobby).
- `main.js`: drop the `showLoading('משהו נכשל…')` in the `initGame().catch` (`main.js:20`, the 0.5 s flash, R§1.1). Use `console.warn` only. `startGame` reports problems itself.

### 2.8 `index.html` (P0)
- After `<canvas id="c">`: `<div id="board2d" hidden></div>`.
- In `.htools`, after `#camBtn`: `<button id="liteBtn" class="ibtn" aria-pressed="false" aria-label="מצב קל (בלי תלת־ממד)" title="מצב קל (בלי תלת־ממד)">🪶</button>`.
- Before `#toast`: `<div id="recover" class="recover" hidden role="alertdialog" aria-labelledby="recoverT" aria-describedby="recoverD"></div>`.
- In `#loading .ld`: change `#loadText` to S-L0, and add `<ol id="loadSteps" class="lsteps" hidden></ol>` and `<div id="loadErr" class="lerr" hidden role="alertdialog" aria-labelledby="loadErrT"></div>`. Give `.lbar` `role="progressbar" aria-valuemin="0" aria-valuemax="100"`.
- Keep the importmap exactly as is: `tests/make_realcopy.sh` rewrites it with sed.
- Inline classic `<script>` before the module script (≤ 15 lines): after `BOOT_SLOW_MS` (20 s), if `!window.__rrBooted` and `#loading` is still visible, append S-L7 and a `רענון הדף` button (`location.reload()`). `main.js` sets `window.__rrBooted = 1` right after the lobby opens. The overlay is not hidden by the watchdog, so a late boot still completes normally.

---

## 3. Loading stages and honest progress (P0)

Constants (exported from `overlay.js` or `select.js`): `RENDERER_TIMEOUT_MS = 20000`, `GLB_TIMEOUT_MS = 15000`, `SLOW_HINT_MS = 8000`, `BOOT_SLOW_MS = 20000`, `CONTEXT_RESTORE_WAIT_MS = 3000`, `STUCK_CHECK_MS = 1500`, `RECOVER_WINDOW_MS = 120000`.

`overlay.js` API:
```js
export function showStages(list)            // list: [{id, label, countable:boolean}] → #loading visible, #loadSteps rendered
export function stageProgress(id, done, total) // countable stages only; done counts settled files (loaded OR failed)
export function stageDone(id)
export function stageNote(id, text)         // S-L5 / S-L6 under the active step
export function hideLoading()
export function bootText(text)
export function showFatal({ title, body, details, actions })   // actions: [{label, primary?, fn}]
export function showRecover({ title, body, actions }) / hideRecover()
```

**Boot (`main.js`):** `#loadText` = S-L0. The bar stays empty, with an indeterminate stripe (CSS animation on `.lbar`, no width change). It hides when the lobby is open, as today (`main.js:22-34`). The 3D init that runs behind the lobby shows **no** overlay and **no** error.

**Game start (`startGame`)**: build the list from what is still pending. Stages already complete are not shown.
1. `renderer`: S-L1, not countable. Shown only if `initGame()` hasn't finished.
2. `models`: S-L2, countable. N = GLB files still unsettled: init set (world names + pawn + 3 dice files) ∪ `worldModelNames(W)` if `!worldLoaded(W)`. 3D only.
3. `life`: S-L3, countable, N = 9 (`LIFE_MODELS` + `HISTORY_MODELS`). Only if `lifeP` hasn't settled. 3D only. Today this wait is invisible (`game.js:249`).
4. `board`: S-L4, not countable. `buildWorld`/`syncCity`/first render.

**Bar value:** `(completedStages + f) / shownStages`. `f` = `done/total` for a countable active stage, else `0`. It changes **only** on real events: a stage completing or a file settling. No timer moves it. It is monotonic within one start. `aria-valuenow` = round(value×100). `aria-valuetext` = `שלב {k} מתוך {S}: {label}{, n מתוך N}`. No `%` text anywhere. The active non-countable stage shows the indeterminate stripe over the unfilled part.

**Per-stage watchdog:** after `SLOW_HINT_MS` the active step gets S-L5. The renderer stage additionally falls back at `RENDERER_TIMEOUT_MS` (S-L6, §2.3). `models`/`life` can't hang, because every GLB has its own timeout.

**`scene.js` seams:**
- `loadGLB(url)`: `Promise.race([loader.loadAsync(url), timeout(GLB_TIMEOUT_MS)])`. On rejection: `cache.delete(url)` (so a later start retries; R§1.3a), and record `failed.add(name)`. A late success still sets `ready`.
- `preloadWorld(w, onProgress)`: calls `onProgress(done/total, {done, total, failed})` and resolves `{failed:[…]}`. `preloadLife(onProgress)`: same.
- `setPawn` already falls back. `inst()` placeholders stay as they are (R§1.3: already tolerant).

---

## 4. Saves

### 4.1 Save matrix: every localStorage key
| Key | Owner | Format / version | Corrupt (JSON) | Wrong/other version | Backup |
|---|---|---|---|---|---|
| `rr2-save-free-<w>` · `rr2-save-history-<sid>` · `rr2-save-<resultId>` · `rr2-save-<mode>-<w>-<seed>` | game.js via **saves.js** | wrapper `{v:3, app, sv, cfg, state, savedAt}` (reads v2 and v3; missing `v` = 2). `state.v` = engine `SAVE_VERSION` (3 now, 4 after the engine release) | boot sweep → `rr2-bak:` (reason `corrupt`), slot removed, S-S4 once | `state.v > SAVE_VERSION` or `wrapper.v > 3` → **future**: never modified, S-S1. `state.v < SAVE_VERSION` → backup `migrate`, then `E.deserialize`. Throws → backup kept, slot removed, S-S3 (ranked: S-S5, nothing created) | yes, §4.4 |
| `rr2-bak:<slotKey>` | saves.js | `{v:1, items:[{at, reason, app, sv, raw}]}`, newest first, ≤ 2 items | ignored (overwritten on the next backup) | — | n/a |
| `rr2-quarantine:<key>` | saves.js | `{v:1, at, raw}`, or for pending `{v:1, at, raw?, items:[…]}` | — | — | n/a |
| `rr2-progress` | progress.js | `{v:1,…}` | boot sweep → quarantine, key removed, S-S8 | untouched | quarantine |
| `rr2-pending-finish` | lobby.js | array of `{resultId, …}` | boot sweep → quarantine whole raw, key removed, S-S10. Array with invalid items (not an object, or no string `resultId`) → invalid items appended to `quarantine.items`, valid items written back, S-S10 | — | quarantine |
| `rr-player` | net.js | `{id, secret, nickname}` | boot sweep → quarantine, key removed, S-S9 | — | quarantine |
| `rr2-energy`, `rr2-library`, `rr2-settings`, `rr2-coach`, `rr2-fallback`, `rr2-flags`, `rr2-seen-chal`, `rr2-quiz-credit` | various | small JSON | boot sweep → quarantine, key removed, silent | — | quarantine |
| `rr2-onboarded`, `rr2-ref` | lobby.js | plain strings, not JSON | not swept | — | — |
| `rr2-settings` (new fields) | game.js | `+ lite:boolean` (default false), `+ liteOffered:boolean` (default false) | as above | unknown fields kept | — |
| `rr2-flags` (new) | flags.js | `{board2d?, recover?}` | ignored by flags.js, quarantined by the sweep | invalid values ignored | — |
| sessionStorage `rr2-resume-once` (new) | main.js/game.js | cfg JSON | ignored and removed | — | — |

The boot sweep (`saves.sweep()`) runs at the very top of `main.js`'s body, before `import('./game.js')` and `import('./lobby.js')`. None of `main.js`'s static imports read the swept keys at evaluation. It scans `localStorage` keys with the prefix `rr2-save-` plus the fixed list above. It checks only that the value is parsable JSON (an object for slots; an array for pending). It does not deserialize states at boot. It returns `{quarantined:[keys], corruptSlots:n, pendingItems:n}`, and `main.js` shows the matching toasts once, after `safeOpen({})`.

### 4.2 Wrapper and version rules
- Write: `{v: 3, app: APP_VERSION, sv: E.SAVE_VERSION, cfg, state, savedAt: Date.now()}`. `APP_VERSION` is a string constant in `saves.js` (`'nl1'`). The old client reads only `.cfg`/`.state`, so it can read v3 wrappers (rollback-safe).
- `S.ui` defaults: `normalizeUi(ui)` → `{seq: int≥0 (default 0), coach: object ({}), firstPayday: bool (false), hist?: array ≤240, pensionHist?: array ≤120, trackMonth?, weddingAge?, burnSeen?, lifeSeen?, inflReality?}`. Wrong types → default. Unknown fields kept. It replaces `newUi()` merging at `game.js:222`.
- Engine-state defaults for new fields are the engine team's job (IR-4). T1 never edits engine state fields.

### 4.3 `js/saves.js` API
```js
import * as E from './engine.js';            // allowed: saves → engine. Never engine → saves.
export const APP_VERSION = 'nl1', WRAP_V = 3, BAK = 'rr2-bak:', QUAR = 'rr2-quarantine:';
export const MAX_BAK_PER_SLOT = 2, MAX_BAK_TOTAL = 8, BAK_BYTES_SOFT = 256 * 1024;
/** Pure classification, no writes, no deserialize. */
export function classify(raw)   // → {status:'empty'|'corrupt'|'future'|'old'|'current'|'over', wrapper?, state?, stateV?}
/** Classify, then deserialize when status is old|current. Writes a backup BEFORE migrating. */
export function load(key, { allowNoBackup = false } = {})
   // → {status:'empty'|'ok'|'migrated'|'future'|'corrupt'|'incompatible'|'over'|'backup_failed', state?, cfg?, ui?, wrapper?}
export function write(key, cfg, state)      // → {ok:true} | {ok:false, quota:boolean}; quota → evict backups, then quarantine, retry once
export function claimSlot(key, seed)        // before the first write of a NEW game: back up existing content unless it's the same seed or over (reason 'overwrite' / 'future' / 'corrupt')
export function clear(key)                  // backup (reason 'clear') unless empty/over/corrupt-already-backed-up, then remove
export function backup(key, raw, reason)    // → boolean; enforces the caps (§4.4)
export function listBackups(key?)           // → [{key, at, reason, sv, app}]
export function restoreBackup(key, index = 0) // → boolean; only if the slot is empty or over
export function sweep()                     // §4.1
export function autoRestoreFuture()         // P2: backups with reason 'future' whose state.v ≤ SAVE_VERSION now, into empty slots
export function normalizeUi(ui)
export function isQuotaError(e)             // name 'QuotaExceededError' | 'NS_ERROR_DOM_QUOTA_REACHED' | code 22 | 1014
export function _setStorage(s)              // Node tests
```
`classify`:
- `null` → `empty`.
- Parse error, non-object, or no `state` object → `corrupt`.
- `typeof state.v !== 'number'` → `old` (it then fails in deserialize → `incompatible`).
- `state.v > E.SAVE_VERSION` or `wrapper.v > WRAP_V` → `future`.
- `state.over` → `over`.
- `state.v < E.SAVE_VERSION` → `old`.
- Else `current`.

`load`:
- `old` → `backup(key, raw, 'migrate')`. If that fails and `!allowNoBackup` → `backup_failed` (game.js shows S-S6, then re-calls with `allowNoBackup:true` or goes back to the lobby).
- Then `E.deserialize(state)`. It clones (R§3.2, verified), so the raw string stays untouched in storage until the next `write`.
- Deserialize throws on `current`/`old` → `incompatible` if the message contains `save_incompatible`/`save_future`, else `corrupt`. Either way the raw is backed up (`incompatible`/`corrupt`) and the slot removed.
- Success on `old` → `migrated`.

**game.js integration:**
| Today | After |
|---|---|
| `readSave` (`game.js:39`) | `saves.load(key)` |
| `persist` (`game.js:40-43`) | `const r = saves.write(saveKeyFor(CFG), CFG, S)`. If `!r.ok && r.quota && !quotaWarned` → S-S7 once per game |
| `savedGame(k)` (`game.js:76-80`) | uses `classify`. `current`/`old` → as today. `future` → `{cfg, month, worldId, charName, future:true}` (the lobby still shows "להמשיך", and clicking it explains). `empty`/`corrupt`/`over` → `null` |
| `clearSave(k)` (`game.js:81`) | `saves.clear(keyOf(k))` |
| `startGame` load (`game.js:210-228`) | below |

`startGame` load, decision table:
| Source state | Free/history mode | Ranked (`cfg.resultId`) |
|---|---|---|
| `future` (local or `cfg.state`) | S-S1 modal; `return false`; slot untouched | same |
| `backup_failed` | S-S6: continue → `load(..., {allowNoBackup:true})`; lobby → `return false` | same |
| `incompatible` / `corrupt` | already backed up and removed; S-S3/S-S4 toast; create a new game | **do not `createGame`**: S-S5, `bus.emit('lobby:open')`, `return false` (closes R§3.2/§4.4 restart-from-turn-0 path) |
| `migrated` | play; S-S2 toast | play; S-S2 |
| `ok` | play | play |
| no source, `resume:false` | `claimSlot(key, seed)` then `createGame` | same (fresh ranked game, `checkpointTurn` 0) |

The ranked server-vs-local seq rule at `game.js:217` is unchanged. A local state counts only if `classify` says `current`/`old`.

### 4.4 Backups: naming, caps, quota
- One key per slot: `rr2-bak:<slotKey>` (e.g. `rr2-bak:rr2-save-free-w1`), holding ≤ `MAX_BAK_PER_SLOT` = 2 items, newest first. `raw` is the original string, byte-identical.
- Global: ≤ `MAX_BAK_TOTAL` = 8 items across all slots and ≤ `BAK_BYTES_SOFT` = 256 KB (sum of key+value lengths of `rr2-bak:*` and `rr2-quarantine:*`). On overflow, evict the oldest items first. Items with reason `future` are evicted last.
- Reasons: `migrate`, `corrupt`, `incompatible`, `future` (new game over a future save), `overwrite` (new game over a different unfinished game), `clear`.
- Quota, in order: (1) on `write`, catch `isQuotaError` → evict all `rr2-bak:*` items except `future`, oldest first, retrying after each. (2) Then `rr2-quarantine:*`. (3) Then give up: `{ok:false, quota:true}`. **Never evict** `rr2-save-*`, `rr2-progress`, `rr-player`, `rr2-pending-finish`, `rr2-energy`. A backup write that hits quota evicts other backups (never the same slot's `future` item), retries once, then returns `false`.
- Nothing ever deletes a `future` save: `clear()` and `claimSlot()` back it up first. `load()` never writes to a future slot.

### 4.5 Corrupted progress / pending finish (quarantine, don't drop)
Handled by `sweep()` (§4.1). The quarantined raw is byte-identical. `progress.js`/`lobby.js` then start from their usual defaults (same behaviour as today), but the original is preserved and the player is told. Registered players get stars/achievements back through the existing server merge (R§3.1).

### 4.6 History-mode save key bug (P0)
`game.js:34` keys history saves by `scenarioId`. The lobby looks them up without it, which yields `…-x` (R§3.2). The fix is in `lobby.js` (§4.8). It makes existing `rr2-save-history-<sid>` saves visible to "▶ להמשיך" and to the end-of-game clear.

### 4.7 Future-version policy (summary)
Keep, never delete, never overwrite, explain (S-S1). Starting a *new* game in that slot moves the future save to `rr2-bak:` (reason `future`). P2: after an upgrade, `autoRestoreFuture()` (called by the `main.js` boot after `sweep`) puts it back if its slot is empty, and shows S-S11.

### 4.8 Allowed `lobby.js` edits (exact)
1. History lookups add `scenarioId`:
   - `lobby.js:632` → `{ mode: 'history', worldId: 'h', scenarioId: sc.id, seed: h.lastSeed }`
   - `:653`, `:656`, `:658` → `scenarioId: sid`
   - `:1185`, `:1208` → `scenarioId: e.scenarioId`
2. `launch()` (`lobby.js:230-238`): `const r = await g.startGame(cfg); return r !== false;`. When `game()` resolved `null`, the toast becomes S-S12 instead of "המשחק עוד נטען…".

No other lobby change. The `resume-active` recover is handled in game.js (§2.7).

### 4.9 Interface requests to the engine team (engine.js is theirs)
- **IR-1:** `SAVE_VERSION = 4` with `migrateV3` chained inside `deserialize` (v1 → v3 → v4). `deserialize` must keep cloning its input before migrating (T1's backup-then-migrate relies on the raw staying untouched).
- **IR-2:** Distinct errors. `Error('save_future')` when `st.v > SAVE_VERSION`. `Error('save_incompatible')` for unknown, missing or unmigratable versions. `Error('save_incompatible:unknown_world')` instead of the bare `getWorld` throw. T1 pre-checks the version and treats any other throw as corrupt, so this is defence in depth.
- **IR-3 (nice to have):** `export const MIN_SAVE_VERSION = 1`.
- **IR-4:** In `deserialize`, backfill missing RNG streams (`makeStreams(st.seed)`) and defaults for any new additive state fields at **every** version, not only inside a migration (R§3.2).
- **IR-5:** Keep and document the invariant that every exported mutator (`rollDice`, `choose`, `takeLoan`, `repayLoan`, `payCredit`, `setPlan`, `invest`, `setSideReport`, …) throws **before** mutating. T1's "persist on error, then resume" depends on it.
- **IR-6:** `engine.js` and its import graph never import `flags.js`, `saves.js` or `render/*`. T1's T-graph test enforces this.
- **IR-7:** Keep `boardInfo(worldId)` → `[{index, name, color, ink, icon, type}]`, `cityModels(st)` → `[{key, model, label}]`, and `replay`/`replayConfig` stable. board2d and the tests use them.

---

## 5. Acceptance criteria (numbered, testable)

"0 page errors" = zero Playwright `pageerror` events. "Console clean" = no `console.error` except the allow-list in §6.2.

**Renderer and fallback**
- **A-1 (P0)** With WebGL disabled (§6.2 S1), starting w1 shows `body[data-renderer="2d"]` and a visible `#board2d` with 40 tiles. Toast S-N1 appears. 3 full turns can be played (roll → hops → card resolved). 0 page errors.
- **A-2 (P0)** In A-1, no request is made for any URL containing `/three/` or ending in `.glb`. No "Error creating WebGL context" console message appears.
- **A-3 (P0)** With three blocked (S2), the lobby renders and is usable. Starting w1 opens the 2D board with S-N2. 3 turns can be played. 0 page errors. The old "המשחק עוד נטען…" toast never appears.
- **A-4 (P1)** With three hanging (S3), the game is playable in 2D within `RENDERER_TIMEOUT_MS` + 10 s of clicking start, and S-L6 was shown.
- **A-5 (P0)** With `apartment.glb` and `pawns/classic.glb` returning 404 and WebGL on (S4), the game starts in 3D. S-N6 is shown. 3 turns can be played. 0 page errors. With `business.glb` hanging, the game still starts within `GLB_TIMEOUT_MS` + 10 s.
- **A-6 (P0)** After a GLB 404 at one start, the next start of the same world requests that GLB again (no cached rejection).
- **A-7 (P1)** `?ff=board2d:on` on a WebGL-capable browser gives a 2D game with no three request. Clicking `#liteBtn` in a running 3D game switches to 2D in place, with the same `month`/`turn`/`cash` in the HUD as before, and S-N4.
- **A-8 (P1)** With `board2d.js` returning 404 and `?ff=board2d:on` (S9), `body[data-renderer="none"]` and S-N5 appear, and 3 turns can still be played with DOM dice and cards.
- **A-9 (P0)** A 2D game's saved `state.actions` replays (`E.replay(E.replayConfig(state), state.actions)`) to the same `cash`, `month`, `pos` and `turn` as the saved state (same engine, no duplicated logic).
- **A-10 (P1)** In a 360×740 mobile viewport at 4× CPU throttle, the 2D board fits inside `ui.freeRect()` (no overflow), each tile is ≥ 26 px wide, and 3 turns can be played.

**Loading**
- **A-11 (P0)** The 3D start overlay lists the stages from §3. The `models` step shows `n מתוך N דגמים` with N equal to the number of GLB requests in that stage.
- **A-12 (P0)** Sampling `#loading` text every 100 ms during every scenario never finds a `%` character. The `#loadBar` width never decreases within one start. Its width changes only when a stage completes or a file settles (checked: no change during a 2 s stretch in which a GLB route is held).
- **A-13 (P0)** When the 3D init fails at boot, no error text flashes on screen (`#loading` is hidden once the lobby is open and stays hidden until a start).
- **A-14 (P1)** When `main.js` is blocked (route 404), S-L7 and the reload button appear after `BOOT_SLOW_MS`.

**Errors and recovery**
- **A-15 (P0)** Exception mid-turn (S7, `#dieSr` removed before a roll): within `STUCK_CHECK_MS` + 1 s, `#recover` shows S-R1. Clicking `להמשיך מהשמירה` makes the game playable. The resolved landing uses the same dice (`state.lastRoll` unchanged by recovery). `state.turn` advanced by exactly 1. ⚡ is spent exactly once for that roll. Exactly 1 page error (the injected one). 2 more turns can then be played.
- **A-16 (P0)** In A-15, the save in localStorage right after the error already has the post-roll state (`turn`+1, `phase` ≠ `roll`), because persist runs right after `E.rollDice`.
- **A-17 (P1)** A third stuck within 2 minutes shows S-R2 with the `להמשיך במצב קל` button, which resumes in 2D.
- **A-18 (P0)** From the stuck state, lobby → "חזרה למשחק" (`resume-active`) recovers the game (playable roll or card) without a reload.
- **A-19 (P1)** An `error` thrown from a lobby-origin or extension-origin script while a game is idle does not show `#recover`.
- **A-20 (P1)** `?ff=-recover` with the S7 injection shows the S-R4 toast and no `#recover`.
- **A-21 (P2)** Forcing `webglcontextlost` (`WEBGL_lose_context.loseContext()` from the page) shows S-R3 after 3 s. `להמשיך במצב קל` resumes in 2D at the same month/turn.

**Saves**
- **A-22 (P0)** Corrupt slot (S5): the lobby/picker renders with no continue for w1. `rr2-bak:rr2-save-free-w1` items[0].raw equals the seeded string byte for byte, with reason `corrupt`. S-S4 is shown once. A new w1 game starts. 0 page errors.
- **A-23 (P0)** Corrupt `rr2-progress` and `rr2-pending-finish` (S5): `rr2-quarantine:<key>.raw` equals the seeded string, and S-S8 and S-S10 are shown. With pending = `[{"resultId":"r1","status":"won"},5,"x"]`, the key afterwards holds exactly the `r1` item and the quarantine has `items` = `[5,"x"]`.
- **A-24 (P0)** Future save (S6, `state.v = SAVE_VERSION+1`, month 10): continue is offered. Clicking it shows S-S1. The slot is byte-identical afterwards. No new game state is written. 0 page errors.
- **A-25 (P0)** After A-24, starting a new w1 game moves the future raw to `rr2-bak:rr2-save-free-w1` (reason `future`, raw identical) before the new save is written.
- **A-26 (P0)** Old save (S6b, a v1 fixture): continue works and S-S2 is shown. `rr2-bak:…` items[0] has reason `migrate` and raw identical to the seeded string. The slot then has `state.v === SAVE_VERSION`.
- **A-27 (P0)** Ranked resume with a corrupt `cfg.state` (unit level: `startGame({resultId:'r', mode:'daily', state:{v:3, junk:1}, …})` with an empty local slot) returns `false`, never calls `E.createGame`, and shows S-S5.
- **A-28 (P0)** History: after starting a scenario and returning to the lobby, the scenario card shows "▶ להמשיך" (key `rr2-save-history-<sid>`), and finishing it clears that key.
- **A-29 (P0)** Quota (S10, `setItem` throws `QuotaExceededError` for `rr2-save-*`): the game continues, S-S7 appears exactly once in 3 turns, and 0 page errors.
- **A-30 (P0)** Unit: after 12 backups across 5 slots, at most 2 items per slot and at most 8 in total remain, the oldest are evicted first, and a `future` item survives when an older non-future item exists.

**Architecture**
- **A-31 (P0)** Unit T-graph: the static import graph of `js/engine.js` contains none of `flags.js`, `saves.js`, `render/`. `node tools/build-edge.mjs --check` still passes (engine pin unchanged by T1).
- **A-32 (P0)** Unit T-api: every `scene.<name>(` used in `game.js` is in `SCENE_API`, and `board2d.js` and `null.js` export every `SCENE_API` name as a function (`kind` as a string).
- **A-33 (P0)** The existing suites still pass: `node tests/determinism.test.mjs`, `tests/verify.test.mjs`, `tests/progress.test.mjs`, `tests/energy.test.mjs`, `tests/library.test.mjs`, `tests/business.test.mjs`, `tests/finance.test.mjs`. `python3 tests/game_e2e.py worlds=w1 turns=8` passes on the 3D path.

---

## 6. Test plan

### 6.1 Unit tests (Node, no browser): new files
Use the in-memory `localStorage` stub pattern from `tests/progress.test.mjs:2-3`. The stub supports `length`, `key(i)` and a byte `limit` (it throws a `DOMException`-like `{name:'QuotaExceededError'}` over the limit).
- **`tests/saves.test.mjs`**: empty / current / legacy wrapper v2 / wrapper v3. `old` (v1 fixture, built in-test from `E.createGame({worldId:'w1', seed:7})`: set `v:1`, delete `life` and the last 3 RNG streams. Assert the backup is written **before** deserialize, by having `_setStorage` record call order). `future` (`SAVE_VERSION+1`: no writes at all). Truncated JSON → corrupt + backup + removed. Unknown world `w9` → corrupt/incompatible + backup. `clear` on an over game → no backup. `claimSlot` over a future save / a different seed / the same seed (no backup). Caps (A-30). Quota eviction order and never-evict list. `sweep` on all fixed keys plus the pending item filter (A-23). `normalizeUi` type repair. `isQuotaError` variants. All versions are relative to `E.SAVE_VERSION`, so the suite still passes after the engine moves to v4.
- **`tests/flags.test.mjs`**: defaults; storage override; `?ff=board2d:on,-recover`; invalid value ignored; corrupt `rr2-flags` ignored.
- **`tests/render_api.test.mjs`**:
  - T-api (A-32): read `js/game.js` as text, take the set of `/\bscene\.(\w+)\(/g`, and assert it is ⊆ `SCENE_API`. Import `js/render/null.js` and `js/render/board2d.js` in Node (they must not touch the DOM at import) and check the exports.
  - T-graph (A-31): recursively parse `import … from '…'` in `js/engine.js` and its relative imports, and assert that no path matches `flags.js|saves.js|/render/`.
  - T-history-keys: `lobby.js` has no `mode: 'history', worldId: 'h'` object literal without `scenarioId`.
- `tests/fixtures/make_saves.mjs` (helper, not a test): prints JSON `{current, v1, future}` save wrappers for w1 at month 10, for the Playwright seeds. No committed binary or large JSON fixtures.

Run: `node tests/saves.test.mjs && node tests/flags.test.mjs && node tests/render_api.test.mjs`. Each prints `N passed` and exits non-zero on failure, like the existing tests.

### 6.2 Playwright scenarios: `tests/stability_e2e.py` (new)
Harness: reuse `attach()`/`wait_idle()`/the roll-and-answer loop style of `tests/game_e2e.py`. Serve the real copy (`tests/make_realcopy.sh` → `/tmp/rr2real`, port 8772, via `tests/serve_copies.sh`).

For **every** page, before navigation:
- `page.route('**/*.supabase.co/**', fulfill 503 '{}')`, and count the hits. The test fails if any request to `supabase.co` was **not** handled by the route (the `requestfailed`/`response` origin check). No `rr-player` is seeded, so the hit count is expected to be 0.
- `page.route('**/fonts.googleapis.com/**', fulfill 200 text/css '')` and `**/fonts.gstatic.com/**` → 404. This keeps the run offline and deterministic. The font races (1.5 s / 2.5 s) cover it.
- Sample `#loading` text and `#loadBar` width every 100 ms (A-12).
- Console allow-list: `Failed to load resource` for intentionally routed URLs, `model failed` / `pawn failed` warnings (these are warnings), and lobby-absent errors when a scenario blocks `lobby.js`.
- Game-path scenarios may block `**/js/lobby.js` to use the built-in picker (`#fbGo`, `#fbCont`; `main.js:56-95`), as `game_e2e.py` does. S2, S5-lobby and A-28 use the real lobby.

| # | Scenario | Setup | Asserts |
|---|---|---|---|
| S1 | No WebGL | Chrome args `--disable-gpu --disable-webgl --disable-3d-apis` + init script `HTMLCanvasElement.prototype.getContext` → `null` for `webgl*` | A-1, A-2, A-9, A-13 |
| S2 | three CDN blocked | route `**/three/**` and `**/cdn.jsdelivr.net/**` → abort; real lobby | A-3 |
| S3 | three hangs (P1, slow) | route `**/three/build/**` → never fulfil | A-4 |
| S4 | GLB 404 / hang | swiftshader args (`game_e2e.py:5`); `**/assets/w1/apartment.glb`, `**/assets/pawns/classic.glb` → 404; variant `**/assets/w1/business.glb` → hang | A-5, A-6, A-11, A-12 |
| S5 | Corrupt data | init script (once, guarded by a `sessionStorage` marker): slot `rr2-save-free-w1` = `{"v":2,"cfg":{"worldId":"w1"` (truncated), `rr2-progress` = `{bad`, `rr2-pending-finish` = `[{"resultId":"r1","status":"won"},5,"x"]`, and in run b `rr2-pending-finish` = `[{bad` | A-22, A-23 |
| S6 | Future save | seed the `future` fixture (from `make_saves.mjs`) into `rr2-save-free-w1` | A-24, then A-25 |
| S6b | Old save | seed the `v1` fixture | A-26 |
| S7 | Exception mid-turn | after the game is on screen: `document.getElementById('dieSr').remove()`, then click `#roll` | A-15, A-16, A-17 (repeat the injection 3×, re-adding `#dieSr` after each recover), A-18 (variant: open the lobby from the bar, then `resume-active`), A-20 (variant with `?ff=-recover`) |
| S8 | Low-end "מצב קל" | `?ff=board2d:on`; viewport 360×740, `is_mobile`, DPR 2; CDP `Emulation.setCPUThrottlingRate {rate:4}`; variant: 3D then `#liteBtn` | A-7, A-10. Log (don't assert) the time from start to the first enabled roll |
| S9 | No renderer at all | `?ff=board2d:on` + `**/js/render/board2d.js` → 404 | A-8 |
| S10 | Quota | init script wraps `Storage.prototype.setItem` to throw `new DOMException('full','QuotaExceededError')` for keys starting `rr2-save-` | A-29 |
| S11 | History key (real lobby) | needs `rr2-progress` with ★ in w1 (seed it) so history unlocks; start a scenario, go back to the lobby, open history | A-28 |
| S12 (P2) | Context loss | 3D game; `page.evaluate` → `document.querySelector('#c').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()` | A-21 |

Run: `bash tests/serve_copies.sh && python3 tests/stability_e2e.py [--only=S1,S7] [--slow]`. S3 and S12 run only with `--slow`. Exit code is non-zero if any assert fails or `ERRS` is non-empty.

---

## 7. Regression risks and rollback

| Risk | Where | Mitigation / check |
|---|---|---|
| A `scene.*` call before init, or a missed call site, after `import * as scene` → `let scene` | game.js | The initial binding is `nullScene` (all no-ops). T-api test. `game_e2e.py` on 3D |
| Slower first 3D start because scene.js/three now load after game.js | game.js | `prefetch3D()` at module evaluation keeps them parallel. Compare boot-to-world time in `game_e2e.py` logs before and after (information only) |
| `persist()` right after the roll changes reload behaviour | game.js:506 | Intended: a reload mid-hop resumes at the landing with the same dice and no extra ⚡ (R§2). The ranked checkpoint cadence is unchanged (still at landing/decision) |
| Recover bar false positives | error boundary | Origin filter + `STUCK_CHECK_MS` re-check (A-19). Flag `?ff=-recover` |
| Recovery loops on a deterministic engine throw | recover | The S-R2 repeat counter offers the lobby. The engine invariant IR-5 |
| Backups fill storage | saves.js | Caps 2/slot, 8 total, 256 KB. Evicted first on quota. Never touches live keys (A-29, A-30) |
| History key fix suddenly shows old history saves | lobby.js | Intended. Those saves are valid v3 states |
| 2D timing differs from 3D (`hop`/`throwDice` awaited at game.js:511-525) | board2d | Durations scale with `setSpeed`. Every awaited function resolves even with reduced motion. S1/S8 play full turns |
| Board2d mirrored by RTL | board2d | Explicit `direction:ltr` grid placement. Screenshot check in S1 (tile 0 bottom-right) |
| Canvas still visible in 2D because of `canvas#c{display:block}` | css/game.css:38 | Injected `body:not([data-renderer="3d"]) canvas#c{display:none}` |
| The engine team's v4 lands mid-work | saves tests | All version checks are relative to `E.SAVE_VERSION`. Fixtures are generated at test time from the live engine |
| Ranked: "no createGame on a broken checkpoint" blocks a player whose server state is truly unrecoverable | startGame | The message says to try again later. That is better than a silent turn-0 restart (exploit, R§4.4). The server-side append-only fix is tracked under NL-13 (outside T1) |

**Rollback ladder (least to most):**
1. Per device, no deploy: `?ff=board2d:off` (no 2D; 3D failure → `none` + panel), `?ff=-recover` (old silent error behaviour + S-R4 toast). Persisted via `localStorage['rr2-flags']` for testers.
2. For all players: change `DEFAULTS` in `js/flags.js` (one line), deploy.
3. Full revert of the T1 commits. Data stays safe: wrapper v3 is read by the old `game.js` (it uses only `.cfg`/`.state`). `rr2-bak:*` / `rr2-quarantine:*` are ignored by old code (dead weight ≤ 256 KB). Known limitation: the old code again deletes future-version saves and keeps the history-key bug. That is exactly what T1 fixes, and it is why a revert should be the last resort.

**Definition of done:** A-1…A-33 for every P0 (and each P1, or the P1 listed as cut with a reason). New and existing unit suites green. `tests/stability_e2e.py` green without `--slow`. A short note appended to `docs/next-level/TASK_BOARD.md` rows NL-02/NL-03 by the task manager (not by the implementer, unless told to).
