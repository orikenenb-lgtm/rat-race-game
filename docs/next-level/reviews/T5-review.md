# T5 review — Living city & visual identity (independent)

Reviewer: independent review agent (did not write T5). Scope: part A (`3746713 dfe1907 8061266 1540746 eaef477 17064fd ef0f9f4 b43b91d`) and part B (`6a43039 a01704c 673806a 9d07859 40635fc 6cddcf3 5cd06d9`).
Tree reviewed: clean worktree of HEAD `8d3a3c4` at `/tmp/t5rev/wt` (T5 files identical to `5cd06d9`; `css/game.css` only gained T2 additions since). Copies served privately: HEAD real copy `:8862` (`/tmp/t5rev/rr2real`), base `706c0ff`-equivalent (`9e871e3`, no js/css diff) `:8865` (`/tmp/t5rev/basereal`). All browser runs: google-chrome + swiftshader, `--host-resolver-rules=MAP * ~NOTFOUND` (no Supabase host can resolve; nothing contacted production).
Scripts and raw output: `/tmp/t5rev/{cmp_shots.py,probe.py,swap_probe.py,lobby_shots.py}`, `/tmp/t5rev/probe/*.json`, `/tmp/t5rev/lobby_audit.json`, `/tmp/t5rev/t5_render_e2e.log`.

**Verdict: 0 blockers, 6 majors, 11 minors, 9 nits.** The rendering core is solid: flattening is pixel-faithful, lighting/shadows/env are unchanged versus base, the boot path is clean, offline degradation works, and pause/dispose mostly work. The majors are one real visual bug (a lazily swapped model freezes in mid-air), one diagnosability hole (no shader-error path left at all), an integration gap in the quality setting, inert 2D buttons, T5 tests that the T7 gate never runs, and a polluted commit.

---

## Majors

### M-1 Lazily loaded model swapped in mid-bounce stays frozen in the air
`js/scene.js:1199-1206` (`swapWhenReady`) with `js/scene.js:1230-1232` (spawn tween).
- **Evidence.** `swapWhenReady` copies the stand-in's *current* pose (`n.position.copy(it.obj.position) … n.scale.copy(it.obj.scale)`). The running spawn tween keeps animating the **old** object, which has already been removed. The new model therefore stays at whatever height and scale the bounce had reached.
- **Reproduction.** `/tmp/t5rev/swap_probe.py`. The bounce window is widened with `setSpeed(20)` so the race is deterministic on swiftshader.
  - Screenshot `/tmp/t5rev/probe/swap-midair-slow-crop.png`: the `life/university` model floats well above the board, and its gold-rim plinth on the board is empty.
- **Failure scenario.** On any device with a warm HTTP cache, the first spawn of a life model on a page reloads the GLB. Fetch + parse + flatten takes tens of ms, well inside the 480 ms bounce (240 ms in turbo). This is likely on every second session; there is no reload in between, only the browser cache.
  - The model hangs up to 7 units above the board at 0.8× scale. It stays there until the next `relayout(false)`, `setLevel` or `syncCity`.
  - Reduced motion has the same race on scale (0.9→1).
- **Fix.** Either:
  - swap to the *target* pose: `n.position.set(x, CITY_Y, z)` and `n.scale.setScalar(sOf(it))`; or
  - make the spawn/relayout tweens read `city.get(key)?.obj` instead of the captured `obj`; or
  - defer the swap until the item's spawn tween has resolved (keep a `it.spawning` promise).

### M-2 No shader/program error path is left in production
`js/scene.js:67`.
- **Evidence.** `checkShaderErrors` is false unless `?shaderdebug`. In three r170 (`WebGLProgram.js:919-934`), the `LINK_STATUS` check, the info-log read and `debug.onShaderError` all sit inside `if (renderer.debug.checkShaderErrors)`. There is no other path.
- **Failure scenario.** Every flattened model shares one *new* `onBeforeCompile` shader (`js/render/flatten.js:21-33`). This covers all city items, landmarks, pawns-minus-tint and decor GLBs.
  - If it fails on some GPU/driver, or after a three upgrade changes the replaced chunks, every model renders as nothing.
  - No console line, no `logErr`, no S-N6 notice, and no fallback to 2D. The game still "works", so neither telemetry nor players' reports point at it.
- **Fix.** Keep the boot path free of sync waits, but restore one check:
  - (a) after the first game frame, run one deferred `gl.getProgramParameter(p.program, gl.LINK_STATUS)` over `renderer.info.programs` (by then links are complete, so the wait is ~0). On failure: `console.error` + `logErr('shader')` + offer מצב קל (`forced2d`).
  - or (b) set `checkShaderErrors = !lowPower`. The freeze was measured on software GL only; on real GPUs the check costs milliseconds.

### M-3 Quality setting: not applied in-session, wrong "עכשיו" tier, governor ignores an explicit choice
`js/scene.js:70`, `js/scene.js:794-815`, `js/render/quality.js:48-55`, consumer `js/lobby.js:1345` (T4 lane, already on the branch).
- **Evidence.** `/tmp/t5rev/probe/probe-gov.json` (`?hq&perf=1`):
  - the governor stepped high→mid;
  - then `setQualityPref('high')` emitted `quality:change {tier:'high', auto:false}`, but `scene.getQuality()` stayed `mid`;
  - nothing in game.js or scene.js listens (CR-B4 is not wired).
- The governor's `disabled` flag is decided once at init from the saved pref. A pref changed later leaves it armed, so it can still step down from a tier the user chose explicitly.
- The lobby status line uses `resolveTier()` without `lowPower`. On a software-GL device it shows "עכשיו: גבוהה" while the scene renders `low`.
- **Failure scenario.** The player picks חסכונית on a struggling phone and nothing changes until reload. The hint says only antialiasing needs a reload. The status line can also contradict reality.
- **Fix.** In `scene.init` (rendering lane, no shell dependency): `bus.on('quality:change', e => { if (e.auto) return; governor.disabled = e.pref !== 'auto'; setQuality(resolveTier({ lowPower, coarse, pref: e.pref })); })`. The scene must resolve the tier itself, because the lobby's `tier` lacks `lowPower`.
  - Let `makeGovernor` expose a settable `disabled`.
  - Point the lobby status at `(await import('./scene.js')).getQuality()` (CR-B4 already says so).

### M-4 2D city cards are focusable buttons that do nothing (until CR-B2 + `ui.assetInfo` land)
`js/render/board2d.js:189-203`.
- **Evidence.** In HEAD, `game.js` has no `onPick` / `city:pick` consumer:
  - `git grep -n "onPick\|city:pick" HEAD -- js/game.js js/ui.js` → none;
  - CR-B2 is still open.
- In מצב קל (the accessibility/low-end fallback), every owned asset is a `<button>` in the tab order. Its accessible name is announced ("עגלת קפה · עסק, שלב 1 מתוך 3 · יציב"), and Enter/click does nothing.
- **Failure scenario.** Keyboard and screen-reader users tab through up to 64 dead buttons per turn. This is the population מצב קל serves.
- **Fix.** Either land CR-B2 + U-lane `ui.assetInfo` in the same release, or render cards as non-interactive until a consumer registers. For example, `tabindex="-1"` + `aria-disabled` while `pickCbs.size === 0`, with the bus emit kept for tests. Do not ship part B alone.

### M-5 T5's tests are not in the T7 gate
`tests/run_all.sh:49-50,66-69`.
- **Evidence.** The runner registers `t5_tokens.test.mjs`, `t5_vocab.test.mjs`, `t5_perf.py`, `t5_city.py`, `t5_ui.py` and `t5_lobby.py`. None of these exist, so they report MISSING.
- What T5 actually shipped:
  - `tests/render_vocab.test.mjs` and `tests/t5_render_e2e.py` are not registered;
  - `tests/t5_freeze_trace.py` is not registered either;
  - only `render_api` and `contrast` run.
- **Failure scenario.** A regression in the stage kit, picking, pause/hidden, reduced motion in 3D, boot GLB list or world-dispose is never caught by `run_all`.
- **Fix.** Register `render_vocab` (tier 0/1) and `t5_render_e2e` (tier 2, swiftshader, 1800 s), or rename them to the expected ids. Remove the phantom rows or keep them explicitly "planned".

### M-6 A `perf(render)` commit carries engine behaviour + a verifier re-pin
Commit `9d07859` ("perf(render): CR-19a — the scene starts paused…").
- **Evidence.** `git show --stat 9d07859`. Besides `js/scene.js`, the commit changes:
  - `js/engine.js` (`applyMentor` `forcePrimary`, new `guideCheapPick`: guide-level highlight on values cards);
  - `supabase/functions/verify-result/engine/engine.js`;
  - `engine.bundle.json` and `engine_pin.js` (new `ENGINE_SHA256`);
  - `tests/t2.test.mjs`.
- These look like another lane's uncommitted edits swept in from the shared tree. Lane rule: rendering owns `scene.js`/`js/render/*` only.
- **Failure scenario.** Someone reverts or cherry-picks "the pause change", for example to address m-3. That silently reverts a T2 engine decision (gate A1) and desynchronises the ranked verifier pin from `js/engine.js`. Ranked verification then fails for every result.
- **Fix.** Record on the task board that `9d07859` contains T2/verifier hunks owned by the engine lane. Any revert of it must be partial (`git revert -n` + restore those paths). Commit with explicit paths, never `-a`/`.`, in the shared tree.

---

## Minors

**m-1 Picking order is the reverse of the spec, the 44 px target is not met at 24 items on phones, and the A-18 test is tautological.** `js/scene.js:1671-1685`; `tests/t5_render_e2e.py:144-150`.
- §6.1 says: raycast the proxies first, then the screen-space fallback. The code takes the nearest projected centre within 22.5 px first, so the raycast only runs when no centre is near.
- Measured on 390×844, overview, 24 fixture items (`/tmp/t5rev/probe/probe-phone.json`):
  - the minimum centre pitch is **33 px**, with 38 pairs closer than 45 px, so the "44 px target" claim cannot hold;
  - 25 px below a centre, 19/24 taps return the next row's item.
- The A-18 check compares `pickAt` with "nearest centre", which is the implementation's own rule, so it cannot detect a false pick.
- Impact: in perspective (desktop follow camera), a tap on the upper body of a tall front building can resolve to the item behind it.
- Fix:
  - raycast first and accept the fallback only when the ray misses, as the spec says;
  - assert against the proxy hit, not against nearest-centre;
  - document the real minimum target at gridN 5–8.

**m-2 3D→2D switch keeps the WebGL context and its GPU memory alive.**
- In `js/scene.js:350-362`, `dispose()` never calls `renderer.forceContextLoss()`. three's `renderer.dispose()` does not release the context.
- Probe `lite_switch` (`/tmp/t5rev/probe/probe-lite-offline.json`) after `setLite(true)`: `ctxAlive: true`, canvas 780×492 (display:none).
- Module-level resources also survive: the kit atlas and `cellMats`, the flatten `shared` materials, `pickGeo`, label pool, `soft/star/heart` textures, PMREM env, shadow map RT.
- The canvas `webglcontextlost`/`restored` listeners (`:100-101`) are not removed.
- Fix: in `dispose()`, after `ctxCbs = []`, call `renderer.forceContextLoss()`, and track the two canvas listeners in `onPtr`.

**m-3 New failure mode from `paused = true` by default.** `js/scene.js:151,157-161`.
- The 3D scene only becomes unpaused at the end of `initRenderer()` (`js/game.js:262`) or on a `#start` toggle (`:218`).
- If anything throws between `scene = r.scene` (`:228`) and `:262` while `#start` is already hidden, the canvas stays `visibility:hidden` until a lobby round-trip. In base the default was unpaused. Examples: `buildWorld`/`applyTheme` throwing, or the resume-once path after a 2D→3D reload.
- Verified OK in the normal paths: the lobby hides and resumes, and the T1 fatal overlay hides the canvas and resumes after its action (probe `lobby`, `fatal_overlay` in `/tmp/t5rev/probe1.log`).
- Fix: call `sync()` right after `scene = r.scene`, or put the last `setPaused` in a `finally`.

**m-4 Abandoned in-flight loads leak, and disposal can hit geometry still on screen.** `js/scene.js:671-678`.
- `releaseOtherWorlds` iterates `cache.keys()` only. A world model still loading when the player switches world is deleted from `cache`, then lands in `ready`, and is never released.
- It also disposes `ready` geometry that a despawn/launch tween object may still be drawing. three then re-uploads it on the next frame, and that upload is never freed.
- Fix:
  - iterate `new Set([...cache.keys(), ...ready.keys()])`;
  - in the `loadGLB` resolve, drop results whose dir is no longer `worldDir` (unless it is life/pawns/history);
  - skip disposal while `cityGroup` still references the geometry.

**m-5 Placeholder leak on every board rebuild after a failed GLB.**
- `inst()` placeholders (`js/scene.js:465-474`) are marked `ownTree` on the group, but `clearWorld()` (`:652-664`) only frees meshes flagged `ownGeo`/`ownMat`.
- Each `buildWorld` leaks 1 BoxGeometry + 1 material per landmark or skyline/turbine placeholder. Rebuilds happen on world change, `setQuality` decor change, governor steps and late history models.
- Fix: in `clearWorld`, `worldGroup.children.forEach(o => o.userData.ownTree && disposeTree(o))`.

**m-6 The 2D board breaks the 12 px floor, and the contrast test cannot see it.**
- `css/stability.css` sizes:
  - `.b2d-pips` max(9px,…) at `:93`;
  - `.b2d-corner-b,.b2d-act` max(11px,…) at `:95`;
  - `.b2d-annex` max(10px,…) at `:99`.
- On 390 px the pips (the main non-colour level cue in 2D) render at 9 px.
- `tests/contrast.test.mjs:189` scans `game.css` and `lobby.css` only.
- Fix: raise all three to `max(12px, …)`, enlarging the card corner badges if needed, and add `stability.css` to the A-4 loop.

**m-7 2D/3D parity gap for `trouble`.** `js/render/board2d.js:358` flashes ⚠ only when the stage goes down. `js/scene.js:1308` also flashes `alert` when `level.trouble` turns on. Fix: use the same condition in 2D.

**m-8 Reduced motion: `shield()` still animates.**
- `js/scene.js:1332-1341` has no `reduced` branch: the dome scales 0→1 in ~425 ms and lives 1.7 s.
- Fix: under reduced motion, show a static 30 % dome with a 200 ms opacity fade.

**m-9 The idle life prefetch is dead code.** `js/scene.js:408` `prefetchLifeIdle()` is never called.
- The notes say "the rest are prefetched one at a time at idle after the first dice throw".
- Result: every first spawn shows a stand-in. For wedding, side_hustle and hospital that is the plain accent box.
- Models that failed while offline are never retried for an item that stays in the city. Dice GLBs are never retried either: `diceReq` is latched.
- Fix: call it after the first `throwDice` resolves. On `online`, clear `diceReq` and re-run `swapWhenReady` for stand-ins.

**m-10 T5 e2e checks that pass vacuously.** In `tests/t5_render_e2e.py`:
- `:126-131` `camSame`: the shake offset is added before `render()` and removed right after (`scene.js:131-137`), so `cameraState().pos` is identical with or without shake.
- `conf < 50`: on swiftshader the tier is low with `confetti: 0`, so `confetti()` resolves at once whether or not reduced motion is on.
- `:78-82` A-12 reads `levelOf()`, which is `kitParts(level)` (the pure table) plus `annex`. It never checks the kit's instance counts or sprites.
- `:181` "rim" is just `perfStats().city`, so A-41 (rim colour per world) is not asserted.
- `:97` the "empty board" tap at (30,400) is off the board, on grass.
- Fix:
  - spy `shakeUntil` via `perfStats`, or render twice and diff;
  - run the confetti check at `?hq`;
  - expose `kit.meshes[*].count` and the per-world `rimMat.color` in `perfStats().kit`;
  - tap the board centre away from items.

**m-11 The lobby no longer shows the board behind it.**
- The canvas is `visibility:hidden` while paused on **all** devices (`js/scene.js:161`). The translucent `.overlay` backdrop now shows only the sky. Compare `/tmp/t5rev/lobby/base-lobby-1300.png` and `head-lobby-1300.png`: a subtle loss.
- The readback cost that motivated this is a software-compositing issue.
- Fix (product decision): keep it for `lowPower`. On real GPUs, paint one frame before pausing, or snapshot the canvas to a CSS background.

## Nits
- n-1 The lit-window boost is multiplicative (`flatten.js:30`, `vEmi*(1+0.2)`), while `?flat=0` and the spec are additive (`EI+0.2`). The two paths differ at EI ≠ 1.
- n-2 The low-tier blob decal is 0.003 above the centre plane (`kit3d.js:133`). The phone overview camera sits ~102 units away (probe `phone_pick_geometry.camDist`), where 24-bit depth resolution is ~0.006, so z-fighting is possible. Same class as the pre-existing tile faces (+0.004). Use `polygonOffset` on the decal and tile-face materials.
- n-3 `?fx=levels` (fake city items, which are pickable) and `?perf=1` (`window.__rrPerfInject` can change the tier) work in ranked/production builds. Gate them behind a dev flag or `location.hostname === 'localhost'`.
- n-4 `--accent-ink` w2 dark on `--paper3` is exactly **4.51**: AA with no margin.
- n-5 2D card borders (`--b2d-accent`) are < 3:1 against the card in w1/w3/w4 (#f2b632 ≈ 1.9, #22d3ee ≈ 1.8, #0ea5e9 ≈ 2.8 vs white). Dashed/solid/double is a stage cue, but pips and emoji also carry it.
- n-6 `texMB` at low is 16.7 against a budget of 10. Already a documented deviation; listed for tracking.
- n-7 `css/game.css:548` and `:551` define `.hlife .lc` twice; the second overrides most of the first. `.lb-shell input:focus` (lobby.css) uses `:focus`, not `:focus-visible`.
- n-8 Part-B notes quote `render_vocab 282/0` and `render_api 226/0`; the actual counts are 278 and 225 at this HEAD. Both still pass.
- n-9 Out of T5 scope, seen during the audit: T2's compact HUD chips `lc plan` (37×44) and `lc focus` (33×44) are under 44 px wide at 390 (`/tmp/t5rev/lobby/head-game-390.png`).

---

## Verified OK (with evidence)
1. **`tests/t5_render_e2e.py` passes, 44/0, against the HEAD copy.** Log: `/tmp/t5rev/t5_render_e2e.log`; screenshots: `/tmp/t5rev/shots/` (w1–w4 + h, desktop and phone, 2D, reduced).
   - Boot: GLBs before the first roll are only `w1/{apartment,business,stock,crypto}` + `pawns/classic`, with no life/history/dice/other-world requests.
   - Low tier on software GL: DPR 0.6, no shadows, no AA.
   - 24-item mixed city: 70 calls and 125.5k triangles (low).
   - Hidden tab: 0 frames. Idle: 0 frames.
   - `skip()` resolves in 12 ms.
   - w1→w2→w1: +1 geometry / +1 texture; cache dirs = w1/pawns/life.
2. **Flatten is visually faithful.** HEAD `?hq` vs `?hq&flat=0`, same scene, landmark regions:
   - mean |ΔRGB| **0.00** in w2 and h, ≤ 0.17 in w3/w4. Remaining differences are the random spawn yaw of city items, motes and pawn spin only (`/tmp/t5rev/cmp/diff-flat-vs-flat0-*.png`);
   - draw calls w2 92 vs 293, w3 60 vs 255, h 70 vs 199.
   - Material scan of all 37 GLBs (`/tmp/t5rev_glbscan.mjs`): no textures and no physical extensions, so nothing is dropped by `keyOf`.
3. **No lighting/env/shadow regression versus base.** Base vs HEAD at `?hq`: landmark regions are pixel-identical (mean |Δ| 0.00–0.22). Whole-frame differences are only the city layer (plinths/kit/layout), motes and the pawn (`/tmp/t5rev/cmp/diff-base-vs-head-*.png`; crops `crop-*-base-top-head-bottom.png`).
4. **Offline mid-game** (`/tmp/t5rev/probe/probe-lite-offline.json`: all `.glb` aborted after start):
   - `throwDice([3,4])` lands on [3,4] with the procedural die and hand;
   - life items spawn with stand-ins;
   - 3 real turns were played (cards answered, roll re-enabled);
   - no unhandled rejection, no recover overlay;
   - back online, a new life model loads and swaps in.
5. **Lobby pause and T1 overlays** (`/tmp/t5rev/probe1.log`):
   - under the lobby: `paused`, canvas hidden, **0 frames in 3 s**; on close it unpauses and renders;
   - `OV.showFatal` over a running game hides the canvas, and its action hides `#loading` and rendering resumes (MutationObserver path).
6. **Governor** (`/tmp/t5rev/probe/probe-gov.json`):
   - one step high→mid on 90×50 ms;
   - the city (12 items) and levels (fx3 stage 3, annex) are kept through `rebuildKeepCity`;
   - geometries 29→29 (no leak), PCF shadows kept;
   - a second injection within 30 s and a fast window both do not step;
   - never up, disabled on software GL (code + unit test), at most 2 steps, so no oscillation is possible.
7. **Contrast recomputed independently** (WCAG 2.x, Python): every ratio in the part-A table matches to 2 decimals.
   - Examples: `--mut` 6.51/5.87/5.37 and 7.69/6.78/5.86; `--green` light worst 4.59; `--focus` light worst 3.77.
   - Label colours on the pill: 5.57–6.32. The old ones were 3.91–4.58, so the CR-R1 change was needed.
8. **Rendered audit** (`/tmp/t5rev/lobby_audit.json`, screenshots `/tmp/t5rev/lobby/`):
   - text under 12 px: **0** at 1300/820/390/360 and in-game at 390. Base: 2/2/8/8 and 5;
   - targets under 44 px in the lobby: 0/0 at 1300/820 (base 2/2). At 390/360 only the HUD tools and home remain (CR-S2, documented). RTL and ₪ render correctly in all shots.
9. **motion.js semantics are consistent.**
   - `data-motion` always carries the effective value.
   - The OS rules are scoped `:root:not([data-motion=full])` with exact `[data-motion=reduce]` twins (count asserted by `contrast.test.mjs`).
   - `game.js` calls `initMotion()` before the renderer and `applyMotion(reducedMotion())` after it, plus the bus listener, so 3D and 2D both receive `setMotion`.
   - Private mode is kept in memory.
10. **Reduced motion in 3D** (code + e2e):
    - dice 150 ms with no hand, pawn teleport + tile glow;
    - no shake, confetti, dust, hearts or sparkle particles (static star instead);
    - damping off, camera snaps, `celebrate` and `introWorld` are no-ops, idle spin and updaters frozen.
    - Exception: m-8.
11. **2D board semantics:**
    - the root is `role=group` (was `img`, which hid the buttons); the city is `role=group` "העיר שלך";
    - cards are `<button>`s with T5-C2 names and `data-level`/`data-kind`;
    - Enter and click emit the same pick (`source:'2d'`); there are no GLB or three requests in 2D.
12. **Shared flattened materials are never disposed with a model** (`isSharedFlat`). Per-item lit copies are freed through `ownMat`. The procedural die and hand are freed once the GLBs replace them (CR-17).
13. **Tap vs drag:** a 12 px drag and a two-finger gesture never pick, and a touch tap picks. OrbitControls is unaffected.

## Process note
During setup the reviewer ran base `9e871e3`'s own `tests/serve_copies.sh`. It ignores `COPY_DIR`/`PORT_BASE`, so it **rebuilt the shared default copies `/tmp/rr2test`, `/tmp/rr2lobby` and `/tmp/rr2real` from BASE code and restarted servers 8770–8772.**
- Rebuilding them from the main checkout was blocked by the permission policy.
- Any lane that tests against `:8770–8772` must first re-run `bash tests/serve_copies.sh` from the main checkout.
