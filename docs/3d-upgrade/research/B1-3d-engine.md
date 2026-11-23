# B1 — מנוע התלת־ממד ותאימות (צוות ב)

Research worker B1, branch `feature/3d-world-upgrade` @ `b651f3c`. Read-only on code. Brief sections covered: §7, §8, §12, §13, §17, §18.
Evidence is `file:line` at HEAD. Browser runs used a private copy (`/tmp/b1`, ports 9300–9302, `git archive HEAD`), headless
Chrome for Testing 153, `--no-proxy-server`, `*.supabase.co` unresolvable, plus the `tests/fakebackend.py` guard and FakeBackend.
Every run ended with `assert_clean` = **clean**. The probe scripts are `/tmp/b1/probe.py` and `/tmp/b1/probe2.py`, outside the repo.
Screenshots are in `/tmp/b1/shots`.

Measurement caveat: all 3D shots ran on SwiftShader (software GL). The scene detects it (`lowPower`), caps the DPR at 0.6 and
takes the low tier, so 3D shots are blurrier than on a real GPU. They are not device measurements.

---

## 0. תקציר

- The 3D stack is mature: one `WebGLRenderer`, render-on-demand, a hidden-tab stop, quality tiers, GPU disposal, a
  3D → 2D → none fallback chain, live switching that keeps state, context-loss recovery, and asset failures kept apart from
  "no support".
- **The message the owner saw (N1) shows only when the browser cannot create any WebGL context at all.** The probe reproduces
  it with WebGL disabled. GLB failures, three.js download failures, WebGL1-only devices and user-chosen lite mode each get a
  different message, or none. So in that cloud browser WebGL really was unavailable. The wording blames "the browser", but the
  usual real cause there is disabled or blocklisted GPU acceleration.
- Real mismatches vs §8:
  1. A context loss that happens while the lobby is open is later reported as "3D did not come up on this device" (N3).
  2. A WebGL1-only device passes the support probe, downloads three.js and then fails creating the renderer. three r170 needs
     WebGL2.
  3. The context-loss text always talks about phones, even on desktop.
- §12 gaps:
  - 2D tile names are cut with "…". The full name is only in a hover `title`, and phones show icons only.
  - Tiles are not tappable in either renderer, and no tile descriptions exist anywhere.
  - In normal motion there is no current-tile or destination-tile highlight.
  - There is no explicit "reset view" (only the overview/follow toggle).
- §10 gap: the zero-asset center is a faint dashed grid plus a caption ("התיק שלך"), so it reads as empty. The corner
  landmarks use the same GLBs as owned assets, without a plinth.

---

## 1. Library, renderer creation, support detection, fallback, messages (§8)

### 1.1 Facts
| Item | Evidence |
|---|---|
| three.js **0.170.0**, from the jsDelivr CDN via importmap (OrbitControls, GLTFLoader, RoomEnvironment addons) | `index.html:21`; `js/scene.js:3-6` |
| Renderer: `new THREE.WebGLRenderer({canvas:#c, antialias: tier, alpha:true, powerPreference:'high-performance'})`. ACES tone mapping, sRGB, PMREM room environment | `js/scene.js:64-87` |
| **WebGL2 is required.** three ≥ r163 dropped WebGL1, and the probe confirms it: with `webgl2` removed, three throws "Error creating WebGL context." | probe case `webgl1` |
| Support probe: `getContext('webgl2') \|\| getContext('webgl')`, cached, the probe context released at once. **It accepts WebGL1**, which does not match three's requirement | `js/render/select.js:10-19` |
| Software-GPU probe (swiftshader / llvmpipe) → `lowPower` → low tier, DPR 0.6, N7 "try lite" offer | `js/scene.js:46-54,57,67-72`; `js/game.js:350-353` |
| Choice order: flag `board2d=off` → 3D always; saved `rr2-settings.lite` → 2D (`user-lite`); flag `on` → 2D; else the WebGL probe | `js/render/select.js:32-38`; `js/flags.js:6` |
| Load: dynamic `import('../scene.js')` (prefetched when 3D is likely) raced against a **20 s** timeout, then `mod.init(canvas)`. Failures: `three-failed` (import error), `three-timeout`, `webgl-init-failed` (init threw, partial init disposed). Then `board2d.js` init, else `null.js` (`2d-failed`) | `js/render/select.js:23-26,46-71`; `js/game.js:31,253-260` |
| Notices, once per page, after the board shows: `no-webgl`→N1, `three-failed/timeout`→N2 + "לנסות תלת־ממד" (reload), `webgl-init-failed`→N3, `none`→N5, 3D with failed GLBs→N6, software GL→N7, live switch→N4, `user-lite`/`flag`→no toast | `js/game.js:334-354`; strings `js/render/overlay.js:22-30` |
| GLB loading: per-file 15 s timeout, recorded in `failed`, stand-ins shown, retried on `online`. **It never triggers the 2D fallback** (only N6) | `js/scene.js:341-368,162` |
| Start errors → fatal panel with Retry / מצב קל / Lobby. Mid-game errors → recover bar R1/R2, with lite offered on the 3rd error or on phones | `js/game.js:462-485,62-86` |

### 1.2 Probe matrix (desktop 1300×820 unless noted; phone 390×844 for `gl` and `nogl`)
| Case | Chrome condition | `webglAvailable` | Renderer | Notice shown | Accurate? |
|---|---|---|---|---|---|
| gl | swiftshader WebGL | true | **3d** | N7 "התלת־ממד כבד למכשיר הזה? …" (software GL) | yes |
| plain | headless defaults, no GL flags | true | 3d | N7 | yes (Chrome 153 headless still exposes WebGL) |
| **nogl** | `--disable-gpu --disable-webgl --disable-3d-apis` | false | **2d** | **N1 "הדפדפן הזה לא תומך בתלת־ממד, אז פתחנו את המשחק במצב קל. המשחק עצמו זהה."** | cause yes, wording partly (see 1.3) |
| webgl1 | `webgl2` blocked by an init script | **true** | 2d (after downloading three + failing init) | N3 "התלת־ממד לא עלה במכשיר הזה…" | half: it is a renderer-creation failure, but its real cause (no WebGL2) is detectable up front |
| threefail | `three.module.js` request aborted | true | 2d | N2 "לא הצלחנו לטעון את התלת־ממד…" + retry | yes |
| glbfail | every `assets/**/*.glb` aborted | true | **3d** (stand-ins) | N6 "חלק מהציורים לא נטענו…" | yes, not shown as no-support |
| lite | `rr2-settings.lite=true` | (not probed) | 2d | none (the 🪶 button shows pressed) | yes |
| context loss in game | `WEBGL_lose_context.loseContext()` | — | 3d → R3 bar after 3 s | R3 "התצוגה התלת־ממדית נעצרה / זה קורה לפעמים בטלפונים כשנגמר הזיכרון…" | mostly: the phone wording is wrong on desktop |

Conclusion for the owner's report: N1 comes only from `reason === 'no-webgl'` (`js/game.js:342`), which comes only from
`webglAvailable()===false` (`select.js:37`). Assets, the CDN and renderer creation cannot produce it. A cloud or VM browser
with GPU acceleration off and no software GL fallback gets exactly this. The message is technically correct ("no 3D in this
browser") but does not say that 3D is turned off in this environment, and gives no technical details.

### 1.3 Message accuracy per §8 cause
| §8 cause | Today | Gap |
|---|---|---|
| True no-support | N1 | Wording: "לא תומך" vs "disabled / no acceleration". No details, no reason code visible |
| Renderer-creation failure | N3 | OK. The WebGL1-only case should get its own reason (`no-webgl2`) **before** downloading three |
| Asset-load failure | N6, stays in 3D | OK (preserve) |
| Context loss in game | R3 recover bar | Body text is phone-specific (`overlay.js:34`) |
| Context loss while the lobby is up | `ctxDead` → next start forces 2D with reason **`webgl-init-failed`** → **N3** (`game.js:300,510`) | **Inaccurate.** It should be a context-loss reason and message |
| User-chosen lite | none on load, N4 on a live switch | OK |
| three slow (> 20 s, e.g. 3G) | `three-timeout` → N2 "לא הצלחנו לטעון" | Acceptable. It could say "slow" instead of "failed" |

Unneeded capability dependency: the probe asks for `webgl2||webgl`, but no WebGL1 path exists. Nothing else is GPU-specific:
`KHR_parallel_shader_compile` is optional (`scene.js:788`), and `WEBGL_debug_renderer_info` is only used for detection.

---

## 2. Lifecycle (§8, §17)

- **One renderer and one loop per page.** `initGame()` is memoised (`game.js:198-201`). `init()` makes a single
  `WebGLRenderer` and calls `setAnimationLoop` once (`scene.js:155`).
  - Lobby ↔ game never re-creates the renderer. The lobby pauses rendering through a `MutationObserver` on `#start`
    (`game.js:236-239`, `scene.js:176-183`), and the paused canvas is `visibility:hidden` (boot-freeze fix).
  - `buildWorld` frees the previous world: `clearWorld` + `clearCity` + `releaseOtherWorlds` (`scene.js:674-701,702-704`).
- Disposal (3D → 2D) does all of this (`scene.js:370-384`): stops the loop; removes resize, visibility and pointer
  listeners; clears the bus subscriptions and the online handler; disposes all geometry, materials and textures;
  `forceContextLoss()`; disposes the controls.
- **Re-initialising three in the same page is unsupported by design.** 2D → 3D goes through a reload with
  `sessionStorage['rr2-resume-once']` (`game.js:326-332`, `main.js:89`).
- Hidden tab:
  - `visibilitychange` sets `setAnimationLoop(null)` and restarts it on return (`scene.js:157-159`).
  - Audio is suspended (`game.js:250`).
  - The 2D board has no loop (WAAPI only) (`board2d.js:1-4`).
- Context loss:
  - Handled with `preventDefault` + callbacks (`scene.js:105-109`).
  - `game.js` persists at once. With no restore within `CONTEXT_RESTORE_WAIT_MS = 3000` it shows R3 with lite / retry 3D /
    lobby (`game.js:296-302,78`; `overlay.js:4-5`). Verified in the probe.
- **2D ↔ 3D switch keeps state.** Verified with an open market card at month 2, pos 17, turn 2, ⚡ 73:
  - 3D → 2D live: the same card is re-opened. Cash, pos, turn, phase=`event`, `pending` and ⚡ are unchanged.
  - 2D → 3D via reload: identical, the card re-opens, no ⚡ spent.

  Why this works:
  - The roll is persisted right after `E.rollDice` (`game.js:1044`).
  - `setLite` persists, bumps `gen`, closes the card and resumes from the save (`game.js:314-325`).
  - `E.landing` is idempotent while `st.pending` exists (`engine.js:1410-1412`, `currentEvent` `engine.js:1447`).
  - Energy is only spent in `turnBody` (`game.js:1038`).

  So the switch does not start a new game, spend a roll, duplicate an event or lose an open decision.
- Small loss on a mid-hop switch: the cosmetic roll output (payday coins, roll news toasts, bailout or burnout info cards,
  `autoInbox`) belongs to the abandoned flow and is not replayed. The engine state is already applied, and the city is
  rebuilt from `cityModels`. See P2-6.

## 3. Camera (§12)

- Perspective camera, 42° FOV (`scene.js:79`). Two modes, both fitted to the free rect between the HUD, sheet and bar
  (`ui.freeRect`, `ui.js:1759-1769`; `scene.js:223-316`):
  - **follow** (default): close up, about 6–7.5 tiles across, tracks the pawn and dice.
  - **overview**: the whole board.
- Initial angle: landscape `dir (0.07,0.66,0.75)`, portrait `(0,0.84,0.55)` (`scene.js:274`). The first game in a world
  plays `introWorld` from overview to follow (`scene.js:1461-1468`).
- Limits:
  - OrbitControls with pan disabled and damping on.
  - `maxPolarAngle 1.36` rad (~78°), so the camera cannot go under the board.
  - Zoom `minDistance = min(7, fit*0.35)`, `maxDistance = max(40, fit*1.7)`.
  - Sources: `scene.js:81-83,311-312`.
  - **No azimuth limits** (free 360° orbit).
- Reset: `#camBtn` toggles overview ⇄ follow (`game.js:378`), shown only in 3D (`game.js:291`). There is no explicit "back to
  main view" action. `resize()` itself snaps the camera to the default direction (`scene.js:313`).
- Unexpected snaps: `resize()` runs on window resize, on HUD/bar `ResizeObserver` changes (`game.js:408-414`) and on
  `placePawn` in follow mode (`scene.js:1131`), so the user's orbit is discarded at those moments.
- Follow during movement: `focusOn` on every hop eases toward the target and lerps the direction 35% back toward the
  default (`scene.js:242-263,1149`). This is soft. The camera does not move while the user is dragging (`interacting`).
- Gestures while a dialog is open: blocked. `.modal` is `position:fixed; inset:0`, so the backdrop covers the canvas
  (`css/game.css:133`; phones `css/game-play.css:235`). Picks are ignored while busy or a card is open (`game.js:446-452`).
  `celebrate` disables the controls (`scene.js:1446-1459`).
- Mobile: the board is fitted to the free rect, so the HUD and bar do not cover it (verified in `gl_phone.png`). The 🪶 lite
  button is hidden ≤ 600 px; lite is reachable from lobby settings and the recover bar (`css/stability.css:11`;
  `game.js:83`). The R3 bar covers an open card's action buttons (`context_lost.png`).

## 4. Board (§12)

- Tile order matches the data. The 3D `tilePos(i)` and 2D `gridXY(i)` are the same ring mapping over `w.board[i]`, and
  `engine.pos` indexes `w.board` (`scene.js:512-518`, `board2d.js:46-51`, `engine.js:864-867`). Tile faces are instanced per
  tile type (`scene.js:737-751`).
- Current tile: the pawn plus a character-coloured ring (`scene.js:1126`, `game.js:657`). **No tile highlight.**
- Destination tile: **none in normal motion.** `tileGlow` exists only in reduced motion (`scene.js:1133-1146`), and the 2D
  `glowTile` likewise (`board2d.js:163,383`).
- Names:
  - 3D: baked into a 256 px canvas texture, wrapped to 2 lines and shrunk down to 22–24 px. No ellipsis, but they become
    unreadable at overview or on phones (`scene.js:579-600`; `_crop_phone_tiles.png`).
  - 2D: `.b2d-tn{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}` (`css/stability.css:24`). Desktop shows
    "הזדמ…", "הוצא…", "יום מ…", "לימוד…", "העס…", "מס ה…" (`nogl_desk.png`). Phones show icons only (`b2d-sm`;
    `nogl_phone.png`). The full name is only `title=` (hover) and the tiles are `aria-hidden` (`board2d.js:122-127`).
- Tap info: **not available for tiles in either renderer.** 3D picking covers city items only (`scene.js:1700-1740`). 2D
  tiles have no handler. Tile data has `type`, `name`, `color` and `icon` but **no description** (`worlds/common.js:4-20`,
  `engine.js:5079-5085`). City items do have tap info (`assetInfo`, `game.js:446-452`).

## 5. Turn flow and guards (§13)

- The sequence is explicit async code in `game.js`:
  - `turn()` guard: `stuck || busy || !S || S.over || eventOpen || lobby` (`game.js:1022-1029`).
  - Energy is spent (`game.js:1034-1042`).
  - `E.rollDice`, then persist immediately (`game.js:1043-1044`).
  - `throwDice(faces)` shows the engine's result only (`game.js:1051`).
  - `hop` per step with payday fx (`game.js:1059-1067`).
  - `applyOut`, render, persist; bailout/burnout cards; `autoInbox`; then `handleLanding` → `resolveCard` loop
    (`game.js:1071-1081,1099-1189`).
  - Re-enable roll (`game.js:1083-1085`).
- Guards:
  - Double roll: `busy` + `#roll` disabled + Space/Enter check (`game.js:399-405`) + hold path (`game.js:1018`).
  - Double buy: `working` flag + `ctl.busy` in `onChoose` (`game.js:1163-1164`).
  - Double event: engine `st.pending` (`engine.js:1411`).
  - Stale flows: the `gen` counter.
  - Stuck detector: `onGlobalError` + recover bar (`game.js:98-113`).
- **No `animationend` / `transitionend` anywhere** (grep).
  - 3D tweens resolve from the render loop on wall-clock time (`scene.js:131-135,188-193`). `skip()` finishes them on a tap
    (`scene.js:195-201`, `game.js:241-242`).
  - 2D WAAPI animations race a `duration + 1500 ms` safety timer (`board2d.js:33-43`).
- Hidden tab / background / lobby:
  - The 3D loop stops, so awaited tweens wait and complete on return (time-based, p ≥ 1 on the first frame).
  - There is **no watchdog** on 3D tweens. If frames never resume (e.g. a context lost without the R3 path firing), the flow
    waits. Context loss itself is covered by R3.
- Resize: debounced `frame()` + `render(false)` (`game.js:408`). The camera snaps (see §3).

## 6. Board center — living city (§10)

- Mapping: `E.cityModels(S)` gives one item per owned asset (`a<id>`), holding group (`h:<model>`), active angel (`v<id>`)
  and foundation (`f`), with model per asset kind or ticker (`engine.js:768-783`). It is restored with
  `scene.syncCity(..., {silent:true})` on every start/resume (`game.js:651`).
  - Buy/sell: engine `out.spawn` / `out.despawn` (+ `launch` for exits) (`game.js:1229-1232`).
  - Levels and stages: `syncLevels` / `setLevel` (`game.js:424-444`).
  - **Nothing visual is saved.** The city is derived from state (satisfies §18).
- Life markers: `L:*` (home, wedding, uni, pension, index, side, hospital) are derived from `metrics().life`
  (`game.js:755-776`). They share the same grid slots and plinths as owned assets, although some are life events, not
  assets.
- Zero assets:
  - 3D: `drawCenter` paints a faint dashed 4×4 grid + "התיק שלך / העיר שלך / הנמל שלך / העמק שלך" (`scene.js:602-621`).
  - 2D: a dotted center + caption (`nogl_*.png`).
  - Neither looks like an intended empty state.
- Decoration vs ownership:
  - Owned items stand on a rimmed "owned" plinth with pips (`kit3d.js:1-5`, `scene.js:1162`).
  - Decor (trees, skyline, sea, stars, history) is outside the board.
  - **Corner landmarks are the world's own asset GLBs** (apartment / business / stock / crypto …) placed on the board
    corners from turn 0, without a plinth (`scene.js:409-414,755-761`; the w1 crypto + stock landmark in `gl_desk.png`).
    They can be read as "already mine".
- The 3D center is pickable (`assetInfo`). The 2D city cards are buttons (`board2d.js:190-194`).

## 7. Per-world theming

- What exists:
  - Data theme per world (`js/worlds/w1-4.js` `theme:`).
  - A shared visual vocabulary `WORLD_STYLE` for w1–w4 + h (`render/vocab.js:24-31`).
  - Lighting presets per decor (`scene.js:666-672`).
  - Decor builders: trees (w1), skyline + neon (w2), sea + planks + crane (w3), stars + aurora + glass + turbine (w4),
    history sepia (`scene.js:764,955-1112`).
  - Landmarks and city models per world: 7 GLBs each, 1.4–1.9 MB (`assets/w1..w4`).
  - Center caption (`scene.js:602`), kit rim colour (`kit.setWorld`, `scene.js:768`), 2D motif classes (`board2d.js:121-125`).
- Lazy per-world loading, with other worlds freed on entry (`scene.js:477-482,694-701`; CR-B6).
- One engine; the theming is data only. This already meets the §11 "shared infrastructure + config" intent.

---

## 8. Gap list vs the brief

| # | Sev | Brief | Gap | Proposed change | Files | Risk |
|---|---|---|---|---|---|---|
| G1 | **P1** | §8 | A lobby-time context loss is reported as N3 "3D did not come up on this device" | Use `forced2d = 'context-lost'`. Add notice N8 ("התצוגה התלת־ממדית נעצרה (כנראה זיכרון גרפי), עברנו למצב קל. ההתקדמות שמורה.") + action "לנסות שוב בתלת־ממד" → `reloadInto3D` | `js/game.js:300,510,342-345`; `js/render/overlay.js` | Low |
| G2 | **P1** | §8 | The probe accepts WebGL1, while three r170 needs WebGL2. WebGL1 devices download about 0.7 MB of three and then get N3 | `webglAvailable()` returns `{gl2, gl1}`; `preferredChoice` → `{kind:'2d', reason:'no-webgl2'}` when only WebGL1 exists. New text (e.g. "המכשיר תומך רק בגרסה ישנה של תלת־ממד…"). Keep the cache and context release | `js/render/select.js:10-38`; `js/game.js:342`; `overlay.js`; `tests/render_api.test.mjs` | Low. Extend the unit tests |
| G3 | P1 | §8 | The N1 wording blames "the browser". In VM/cloud browsers WebGL is usually **disabled** (no GPU acceleration), and the reason code is invisible | Reword N1 ("התלת־ממד (WebGL) לא זמין בדפדפן הזה כרגע — למשל כשהאצת החומרה כבויה. פתחנו במצב קל; המשחק זהה."). Add a "פרטים טכניים" line with the reason code + renderer string to the toast or the settings "עכשיו" line | `overlay.js:22`; `game.js:334-354`; `lobby.js` settings | Low |
| G4 | P2 | §8 | R3 text says "בטלפונים" on desktop too. The R3 bar covers an open card's buttons | Neutral text. Give `#recover` a z-order and position that does not hide `#evCard .acts`, or close the card while R3 is up (it re-opens on recover anyway) | `overlay.js:34`; `css/stability.css`; `game.js:78` | Low |
| G5 | **P1** | §12 | 2D tile names cut with "…"; phones show icons only; the full name only on hover; no tile descriptions exist | Add a short name (`short`) + one-line description (`desc`) per tile type in `TILE_TYPES` and world overrides (display data, no rules). Tap/Enter on a tile (2D: buttons; 3D: raycast the tile InstancedMeshes via `userData.tileIdx`) opens a small sheet with icon, full name, what happens there, "you are here / N steps away" | `js/worlds/common.js`, `w*.js`; `engine.boardInfo`; `render/board2d.js:117-128`; `scene.js` pick; `ui.js`; `css/stability.css:24` | Medium: the pick must not fight OrbitControls (reuse the 8 px / 350 ms rule) |
| G6 | P1 | §12/§13 | No current-tile or destination-tile highlight in normal motion | Keep a persistent ring on the current tile. During `turnBody`, mark the destination `out.steps.at(-1)` before the first hop and clear it after landing. New optional scene API `markTile(i, kind)` (no-op in `null.js`); both renderers | `scene.js`, `board2d.js`, `null.js` (SCENE_API), `game.js:1051-1068` | Low: add to `SCENE_API` and the render_api test |
| G7 | P2 | §12 | No explicit "back to main view"; resize, HUD changes and `placePawn` silently reset the user's orbit; azimuth unlimited | Add a "מבט ראשי" action (long-press camBtn or a second button) calling `resetCamera()` + overview. Snap the direction on resize only when the user has not orbited recently. Optionally clamp the azimuth to about ±60° around the default so labels stay readable | `scene.js:240-318`; `game.js:378,408-414` | Low/Med (UX tuning) |
| G8 | **P1** | §10 | The zero-asset center reads as empty or broken (faint dashed grid + caption) | Intentional empty state per world: plots with "למכירה"-style signs or low decor, a caption like "כאן יקומו הנכסים שלך", and the first slot glowing. It must be visibly not owned (no plinth or rim). Same in 2D | `scene.js:602-621`, `kit3d.js`; `board2d.js` center; `vocab.js` WORLD_STYLE | Low |
| G9 | P2 | §10 | Corner landmarks use the same GLBs as ownable assets from turn 0. Life markers (`L:wedding`, `L:hospital`) sit on "owned" plinths | Give landmarks distinct decor models, or a muted/grey material and a base that is not a plinth. Show life markers without the owned rim (or with a separate "life" lane or ring) | `scene.js:755-761,1236-1258`; `game.js:755-776`; `kit3d.js` | Low/Med (art) |
| G10 | P2 | §13 | No watchdog on 3D awaited tweens; a stalled loop blocks the turn indefinitely | Mirror the 2D safety: `tween()` resolves at `dur + 1500 ms` via `setTimeout` if the loop has not finished it (skip it while `pageHidden` or `paused`, then re-arm). Never alter outcomes | `scene.js:188-193` | Low |
| G11 | P2 | §13/§18 | A mid-hop 3D→2D switch drops that roll's cosmetic payload (payday fx, roll news, bailout/burnout info card, autoInbox) | Persist a small `S.ui.pendingFx` marker (news ids / bailout flag) consumed on resume, or block the lite switch while `rolling` (simplest: disable 🪶 while busy) | `game.js:314-325,1043-1080` | Low |
| G12 | P2 | §17/§20 | three.js comes from the jsDelivr CDN (third-party, no SRI). Blocked CDNs (corporate or cloud) → N2 | Vendor `three@0.170.0` (module + the 3 addons used) into the repo for GitHub Pages, or add SRI and a same-origin fallback URL | `index.html:21`; `tests/make_realcopy.sh` | Low (≈1.3 MB in the repo) |
| G13 | P2 | §8 | `three-timeout` (> 20 s on slow networks) says "לא הצלחנו לטעון" | Separate "slow" text with the retry action | `game.js:343`; `overlay.js` | Low |

## 9. Already done — must be preserved

- The fallback chain 3D → 2D → none with distinct reasons (`select.js:46-71`) and the honest loading stages (no invented
  percentages) (`overlay.js:1-60`).
- Asset failures stay in 3D with stand-ins + N6, retried online (`scene.js:341-368,162`). They are not treated as
  "no support".
- One renderer and one loop per page; render-on-demand; pause under the lobby and loading overlay; hidden-tab stop; full GPU
  and listener disposal; `forceContextLoss` on the switch (`scene.js:55-184,370-384`).
- Context-loss flow: persist at once, R3 after 3 s with lite / retry / lobby (`game.js:296-302`).
- A live 3D → 2D switch and a 2D → 3D reload that keep the exact game state (verified, §2). Lite preference saved in
  `rr2-settings.lite`.
- Quality tiers auto/high/mid/low, saved, a governor that only steps down, DPR caps, the software-GL low tier
  (`render/quality.js`).
- Turn guards (`busy`, `gen`, `working`, engine `pending`), roll persisted before animation, dice result from the engine
  only, skip on tap, no animationend reliance.
- The city is derived from engine state (no visual data in saves); picking with the 8 px / 350 ms rule; asset info on tap.
- Per-world theme data + `WORLD_STYLE` shared by both renderers; lazy per-world GLBs; instanced tiles.
- Unit tests run here: `tests/render_api.test.mjs` 231/0 and `tests/render_vocab.test.mjs` 286/0 pass. Any new scene
  function (G6) must go into `SCENE_API` (`null.js:5-12`) and those tests.

## 10. Artefacts
- `/tmp/b1/shots/`:
  - Renderer cases: `gl_desk.png`, `gl_phone.png` (3D), `nogl_desk.png`, `nogl_phone.png` (2D + N1), `plain_desk.png`,
    `webgl1_desk.png` (2D + N3), `threefail_desk.png` (2D + N2), `glbfail_desk.png` (3D + N6), `lite_desk.png`.
  - Switch and context loss: `switch_before_3d.png`, `switch_after_2d.png`, `switch_back_3d.png`, `context_lost.png` (R3).
- Probe output: `/tmp/b1/probe_results.json`; scripts `/tmp/b1/probe.py`, `/tmp/b1/probe2.py`.
