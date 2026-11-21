# T1 review: Stability, 3D fallback & saves

Reviewer: independent review agent, 2026-11-21. Scope: T1 commits b8907f6, d6f61e7, 9b289e6, 3174422, 91a9564, c44a8c4, e5af630, d735394 on `feat/rat-race-next-level`. I did not write this code.

How I checked it:
- Read every T1 diff against `cc5b886` (the pre-T1 base). No other lane touched these files in between.
- Ran `node tests/{saves,flags,render_api}.test.mjs`: 90 / 10 / 176 pass.
- Ran `node tools/build-edge.mjs --check`: passes, pin `2402da72…`.
- Ran Node probes against `js/saves.js` (`/tmp/t1rev/probe1.mjs`).
- Ran Playwright probes on a private copy of `git archive HEAD`, served on port 8796 with Supabase routed to a local 503 (`/tmp/t1rev/probe_r2.py`, `/tmp/t1rev/probe_lite.py`).
- I did not run the whole `stability_e2e.py` suite on my copy (2 shared cores).
- By mistake, one helper import ran the whole suite once against the default shared port 8772. That copy is not this HEAD, and Supabase was routed for that run too. Its failures are **not** used as evidence here.

Line numbers below are against HEAD `e7b5a08`.

---

## Blockers

### B-1: In 2D or `none`, the S-R2 primary button ("להמשיך במצב קל") leaves the game dead
`js/game.js:73`, `:82-87`, `:279-282`
```js
// recover():
OV.hideRecover(); stuck = false; busy = false; closeCard();
if (lite && flag('board2d') !== 'off') return setLite(true);
// setLite(true):
if (scene.kind !== '3d') { if (stuck) return recover(); syncLiteBtn(); return; }
```
**What goes wrong:** `recover()` clears `stuck` before it calls `setLite(true)`. When the renderer is already 2D (or `none`), `setLite` sees `stuck === false` and returns without resuming. Nothing re-enables the roll button. `enterStuck` set `setRollEnabled(false)`, and `updateRollEnergy` only redraws the label. There is no card, no bar, and `stuck` is false. So the lobby's "חזרה למשחק" (`resume-active`) can't recover it either, because the `#start` observer only acts when `stuck` is true.

**Probe output** (`probe_r2.py`: `?ff=board2d:on`, three `#dieSr` injections, then the R2 primary button):
```
stuck 3 renderer 2d | משהו נתקע באמצע התור / זה קורה שוב. אפשר לנסות במצב קל, או לחזור ללובי. / להמשיך במצב קל / להמשיך מהשמירה / חזרה ללובי
after R2 primary in 2D: {"roll": false, "card": false, "start": false, "rec": false, "month": "2", "renderer": "2d"}
isStuck False
after lobby round-trip: {"roll": false, "card": false, "start": false, "rec": false, ...}
```
**Who hits it:** every no-WebGL player, every מצב קל player and every `none` player who gets stuck three times within 2 minutes. That is exactly the low-end group the feature is for. The only way out is a page reload. A-17 only tests this from 3D (`stability_e2e.py:470-488`).

**Fix:**
- In `recover()`, take the lite branch only when `scene.kind === '3d'`. Otherwise fall through to `startGame({...CFG, resume:true})`. Or make `setLite`'s non-3D branch always `return CFG ? startGame({...CFG, resume:true}) : false`.
- In `showRecoverBar`, when `scene.kind !== '3d'`, show S-R2 without the lite button, with a body that doesn't suggest מצב קל (for example S-R1's body plus "חזרה ללובי").
- Add an A-17 variant with `?ff=board2d:on` that asserts the game is playable after the primary button.

---

## Majors

None beyond B-1. The save shell, the ranked handling and the engine-pin isolation are sound (see "Verified OK").

---

## Minors

### m-1: The soft byte cap deletes `future` backups and quarantined data with no storage pressure
`js/saves.js:130-140` (`enforceCaps`), called from every `backup()`.

`evictionList({keep, withQuarantine: !overItems})` uses the default `withFuture: true`. One backup bigger than about 250 KB pushes `bytesUsed()` over `BAK_BYTES_SOFT`. The loop then removes every other backup, every quarantine record (including `rr2-quarantine:rr-player`) and other slots' `future` items. This is a voluntary cap, not a `QuotaExceededError`.

**Probe** (`probe1.mjs` §3): a w2 `future` backup, a quarantined `rr-player`, then a 291 KB w1 `overwrite` backup:
```
after big backup: backups [["rr2-save-free-w1","overwrite"]] quarantine rr-player kept? false
```
Measured save sizes on the current engine (`/tmp/t1probe_size.mjs`): about 35–48 KB at month 120–240. A very long free game (month 1000+) reaches 190–230 KB. So this is rare, but it breaks the "nothing ever deletes a future save" promise (§4.4).

**Fix:** for the byte cap, call `evictionList({keep, withQuarantine:false, withFuture:false})`. Remove `future` items and quarantine only on a real quota error (the `write()` path already does this). Or let the soft cap stop early instead of evicting protected kinds.

### m-2: No warning when storage is blocked rather than full
`js/game.js:122`, `js/saves.js:47-50`.

When `localStorage` access throws `SecurityError` (cookies or site data blocked, some embedded webviews), `write()` returns `{ok:false, quota:false}`. S-S7 only fires on `r.quota`, so the player never learns their progress isn't saved. `keys()` also calls `store()` outside its `try`, so `sweep()` throws. `main.js:14` catches that, so there is no crash.

Probe output:
```
sweep(getter throws) THREW SecurityError
write(getter throws) {"ok":false,"quota":false}
```
**Fix:** show S-S7 (or a variant) on any failed write, `!r.ok && !r.future`. Move `store()` inside the `try` in `keys()`.

### m-3: `claimSlot` overwrites an unreadable save without a backup when the earlier backup failed
`js/saves.js:252`.

Sequence: `load()` finds a state that classifies as `current` but `deserialize` throws (for example unknown world). The backup fails for lack of space, so the slot is kept (correct). `startGame` then creates a new game and calls `claimSlot(key, cfg.seed)`. `cfg.seed` comes from the same saved cfg, so the same-seed shortcut returns `{ok:true}`, and the next `persist()` overwrites the slot.

Probe output:
```
load undeserializable w/o room: incompatible slot kept? true
claimSlot same seed: {"ok":true}
```
**Fix:** skip the same-seed shortcut unless the existing state deserializes, or pass a flag from `startGame` when `note` is `corrupt` or `incompatible`.

### m-4: The future-save guard in `write()` runs once per page (concurrent tabs)
`js/saves.js:228-232`.

After the first check, `checked` stops re-reading the slot. Scenario: a tab still on the old build stays open while the player continues the same slot in a new tab after a deploy. The old tab's next `persist()` overwrites the newer-version save with no backup.

**Fix:** a cheap per-write check, for example `get(key)` plus a regex on `"sv":(\d+)` or `"v":` before the full parse. Or listen to the `storage` event and drop the key from `checked`.

### m-5: The 2D→3D auto-resume skips the lobby's launch bookkeeping
`js/main.js:49-60`.

`afterBoot` calls `G.startGame(...)` directly while the lobby is open. `startGame` only sets `#start.hidden`, so `closeLobby()` never runs. `stopGroupRefresh()` and `stopEnergyTicker()` don't run, `body.lb-lobby-open` stays, and lobby group polling keeps running during the game. `P.beginSession()`, `sessLessons = []` and `lastEndSig = null` from `lobby.launch` are also skipped, which affects the end-of-game session bookkeeping.

**Fix:** resume through the lobby API (for example a lobby `launch` export, or a `bus.emit('lobby:resume', cfg)` handled in lobby.js). If lobby edits are out of scope for T1, file a request with the lobby owner.

### m-6: The 2D board drops the pawn colour on old browsers
`css/stability.css:38`.

The pawn's only `background` uses `color-mix()` (Chrome 111+, Safari 16.2+). The 2D board exists precisely for old or weak devices. On an engine without `color-mix` the declaration is invalid, so the token shows only the glyph and the white ring.

**Fix:** put a plain `background: var(--pawn);` line before the gradient. The same applies to `.b2d-cap` (`:29`), which already degrades acceptably.

### m-7: Loading list is re-announced on every file
`index.html` `#loading role=status aria-live=polite` together with `js/render/overlay.js:53`.

`render()` replaces `#loadSteps.innerHTML` on every file that settles (20+ times per start). Inside a polite live region, screen readers can re-read the whole step list each time. `#loadErr` (`role=alertdialog`) also sits inside the live region.

**Fix:** mark `#loadSteps` `aria-hidden="true"` (the progressbar's `aria-valuetext` already carries the step and count), or update only the changed `<small>` text. Move `#loadErr` out of the `role=status` container, or drop `aria-live` while it is shown.

### m-8: 2D board text below the T5 12 px floor, and no test covers `stability.css`
`css/stability.css:24`, `:34`: `.b2d-tn` and `.b2d-cl` use `font-size:max(8px, …)`.

`tests/contrast.test.mjs:10` reads only `game.css` and `lobby.css`, so this file escapes the floor check. On a desktop-sized 2D board (cell about 50–70 px), tile names render at 8–11 px. `.lsteps li{opacity:.55}` for upcoming steps also has unchecked contrast.

**Fix:** `max(12px, …)` (names already hide below a 46 px cell via `.b2d-sm`), and ask T5 to add `css/stability.css` to the contrast test.

### m-9: `#liteBtn` offers "חזרה לתלת־ממד" on devices that can't do 3D
`js/game.js` `syncLiteBtn`.

When the reason is `no-webgl`, clicking it saves, reloads, and lands back in 2D with S-N1. **Fix:** hide or disable the button (or change its label) when `!webglAvailable()`.

---

## Nits

- **n-1:** `js/game.js:89` `OWN` leaves out `motion.js`, `energy.js`, `audio.js` and `net.js`. Async errors from game flows that pass through them never count. They are usually caught by the local `try`, so this is low impact. Spec §4.1 also says main.js's static imports don't read swept keys, but `audio.js:11` reads `rr2-settings` at evaluation. It is tolerant (`try`/`{}`), so harmless, but the claim is wrong.
- **n-2:** `select.js` `webglAvailable()` creates and loses a probe WebGL context synchronously when `game.js` evaluates (from `preferredChoice()` at line 24), then `scene.init` creates the real one. On some Android GPUs creating a context costs 50–200 ms of main thread while the lobby renders. Consider probing lazily (only when `board2d==='auto'` and three isn't cached), or measure it in `perf_probe.py`.
- **n-3:** `scene.dispose()` leaves the canvas `webglcontextlost`/`restored` listeners attached (callbacks are emptied, so harmless). Three stays in memory after a live 3D→2D switch, which is accepted by design (3D comes back only via reload).
- **n-4:** The per-slot cap in `backup()` can drop an older `future` item when a slot holds two `future` items and a non-future one arrives. This is acceptable at cap 2. Document it.
- **n-5:** `quotaWarned` resets on every `startGame`, so each recover or lite switch can show S-S7 again. "Once per game" becomes once per start.
- **n-6:** `tests/stability_e2e.py` has no `if __name__ == '__main__':` guard, and its default `--base` is the shared port 8772. Importing it for helpers runs the whole suite against whatever is on 8772. Add the guard, and honour a `PORT_BASE`/`BASE` env var like `serve_copies.sh` does.
- **n-7:** The 2D board is `role=img` with a fixed label. The pawn's tile isn't exposed. The 3D canvas has the same gap, so this is not a regression. A cheap improvement: update `aria-label` with the current tile name in `placePawn`/`hop`.

---

## Test quality

- **A-19 passes even without the origin filter.** The injected errors fire while the game is idle. `looksStuck()` already returns false then (roll enabled, `busy` false), so deleting `OWN` would still pass. To really test the filter, throw a foreign-origin error while `busy` (for example during a held dice throw), or a foreign error whose stack has no `/js/` frame while the roll is disabled.
- **The R2 path in 2D/none is untested** (see B-1).
- **The "v1" save fixture is synthetic** (`tests/fixtures/make_saves.mjs`, `saves.test.mjs v1Raw`): a current-shape state with `v:1` and some fields removed. Now that the engine lane's v4 is in flight, adding the real v3 golden fixtures from `cc5b886` as an `old`-migration case would test a true older shape.
- **Missing unit cases:** `write()` refusing when a future backup fails (`{future:true}`); `clear()` keeping the slot when its backup fails; byte-cap eviction of protected kinds (m-1); storage that throws on access (m-2).
- **Fine:** A-30 (caps / oldest-first / future survives), backup-before-deserialize ordering via the call log, byte-identical raw checks, the pending-item split and the T-graph/T-api checks are real assertions, not just runs.

---

## Verified OK

- **Engine pin / determinism.**
  - No T1 commit touches any file in the engine graph (`collect()`: engine.js, rng.js, life.js, history.js, data/*, finance/*, systems/*, worlds/*, achievements.js).
  - `build-edge --check` passes.
  - The T-graph test confirms engine.js never reaches `flags.js`, `saves.js` or `render/`.
  - Action logs are unchanged: T1 only adds `persist()` calls and UI wrappers.
- **Ranked handling.**
  - A corrupt or incompatible server checkpoint gives S-S5 and `false`, never `createGame` (closes the restart-from-turn-0 path).
  - A future checkpoint gives S-S1.
  - The seq rule is unchanged.
  - The extra `persist()` after the roll doesn't bump `ui.seq`, so a lobby resume still prefers the server state. Dice come from the state's RNG stream, so a reload or clearing the local save can't reroll.
  - The 2D→3D reload never auto-resumes ranked games (`main.js:58`).
  - Lite, recover and the fatal retry all resume from the latest local or server state. I found no new rewind or seed-replay path.
- **Future saves.**
  - `load()` never writes.
  - `clear()` and `claimSlot()` back up with reason `future` before removing.
  - `write()` backs up before the first overwrite and refuses if that fails (A-24/A-25 logic is right).
  - `clear()` keeps the slot when its backup fails.
- **Corrupt or pending data.** The sweep quarantines raws byte for byte, splits bad pending items, and leaves the plain-string keys alone.
- **XSS.**
  - `overlay.js` escapes every label, body and detail (error message cut to 300 chars, no stack).
  - `board2d.js` uses only `textContent` and style properties.
  - The future modal uses `ui.esc`.
  - No save field is rendered as HTML by T1 code.
- **Prototype pollution.** Saves are read with `JSON.parse` plus object spread (no `Object.assign` or deep merge). The probe with `__proto__` keys in the wrapper and cfg shows no pollution.
- **Flags.** Only `board2d` (`auto|on|off`) and `recover` (bool). Invalid values and corrupt JSON are ignored. Neither flag can change game rules or the ranked flow; `?ff=-recover` only restores the old silent behaviour plus a toast.
- **2D renderer fidelity.**
  - It imports only `boardInfo` from the engine and contains no economic logic.
  - The layout uses explicit `direction:ltr` grid placement.
  - No requestAnimationFrame loop.
  - Every animation has a safety timeout, so awaited flows can't hang, even while paused under the lobby.
  - Reduced motion clamps durations and skips shake, bursts and confetti.
- **Error boundary.**
  - Local catches cover `turn`, `handleLanding`, the resume tail, `sheetAction`, the card choice and `endGame` from the sheet.
  - Locally caught errors are re-thrown asynchronously, so real bugs stay visible in devtools and monitoring.
  - The global handler needs a game on screen, an error from one of the game's own modules, and two checks plus a flow-progress counter. Cross-origin "Script error." (no filename) is ignored.
- **Double click on `#liteBtn` in 3D.** Probe result: one switch to 2D, no reload, HUD unchanged.
  ```
  before … "renderer":"3d" loads 1  →  after dblclick … "renderer":"2d" loads 1
  ```
- **Leaks across repeated games.** Watcher sets are cleared in `finally`. The `motion:change` subscription and the `#start` observer are installed once. 3D `onContextLost` is attached once per page. `buildWorld` clears the grid and city each time, and effect spans remove themselves.
- **Hebrew strings.** S-L*, S-E*, S-N*, S-R* and S-S* match the spec exactly (singular masculine imperative, ־ hyphen in תלת־ממד). No `%` in loading text.
