# Research — Engine, data, saves & 3D robustness (Next Level, Phase A / NL-01)

Branch `feat/rat-race-next-level` (base `706c0ff`, HEAD `9e871e3`). Read-only investigation: no existing file was edited.
Tags: **[OBSERVED]** = ran it here (Playwright/Chromium or Node), **[CODE]** = read in the source (file:line), **[HYPOTHESIS]** = inferred, not run.

Method / environment
- Browser runs: Playwright + `/usr/bin/google-chrome` against `http://localhost:8772/` (full site, three.js served locally from `/tmp/rr2real`). Every run registered `page.route('**/*.supabase.co/**')` → HTTP 503. In all runs the blocked list stayed **empty**: with no `rr-player` identity the client never calls the backend at boot [OBSERVED].
- Scripts and raw logs: `/tmp/research-eng/{webgl.py, saves.py, throwmid.py, nothree.py, saves.mjs, mkstate.mjs, noop.mjs}` and `*.json`. Screenshots are listed in the appendix.
- The machine was loaded (2 cores, other browser suites running). A swiftshader boot took 10–17 s. **No timing in this file is a performance claim.**
- Baseline tests: `node tests/determinism.test.mjs` passed 2/2 (75 s). `node tests/verify.test.mjs` passed 7/7. `tests/engine.test.mjs` hit my 200 s timeout on the loaded machine; that is not a failure claim [OBSERVED]. `node tools/build-edge.mjs --check` → "✓ verify-result pins the current engine 6ed2ae6f…" [OBSERVED].

---

## 1. WebGL failure, missing three.js, failing GLBs, loading screen

### 1.1 Where the renderer is created and what happens on failure
- `js/main.js:19-20` starts `import('./game.js')` at boot, then `g.initGame().catch(e => showLoading('משהו נכשל בטעינת התלת־ממד: ' + e.message))`. The lobby is imported separately (`main.js:24-26`), so **it does not depend on WebGL** [CODE].
- `js/game.js:88-91` `initGame()` → `doInit()` (`game.js:97-123`) → `scene.init(canvas)` (`game.js:101`) → `new THREE.WebGLRenderer(...)` at `js/scene.js:31`. The constructor is not wrapped. Its throw rejects `initP`, and `game.js:89` resets `initP = null`, so every later `startGame()` retries the whole init [CODE].
- `startGame()` (`game.js:185-194`): if init is not done it shows `#loading` and awaits `initGame()`. On a throw it calls `hideLoading()` and rethrows. `lobby.js:230-238` `launch()` catches the throw → `openLobby(view)` and shows the generic toast **"משהו השתבש בפתיחת המשחק"** [CODE].
- There is no WebGL capability check, no `webglcontextlost`/`webglcontextrestored` handler (grep: none in `js/`), no global `error`/`unhandledrejection` handler (only an IMG-error listener at `lobby.js:1593`), and no retry button [CODE].

**[OBSERVED] — WebGL off** (`webgl.py nogl`: flags `--disable-gpu --disable-webgl --disable-3d-apis`, plus an init script making `getContext('webgl*')` return `null`; `saves.py corrupt` reproduced the same thing with the flags alone):
1. t≈1.0 s: `#loading` is visible with "משהו נכשל בטעינת התלת־ממד: Error creating WebGL context."
2. t≈1.5 s: `boot()` → `hideLoading()` (`main.js:33`) hides that message. The lobby appears and is fully usable: map, daily, groups, character picker (`nogl_1_lobby.png`, `nogl_2_world.png`). The error was on screen for under 0.5 s.
3. Clicking a character → `#loading` "טוען את העולם…" at 5% → init fails again → back in the world view with the toast "משהו השתבש בפתיחת המשחק" (`nogl_3_after_start.png`, taken after the 2.6 s toast had faded). It can be retried forever with the same result. The player is never told that the device lacks 3D or what to do about it.
4. Console: `THREE.WebGLRenderer: Error creating WebGL context` twice (boot plus the start attempt). No `pageerror`. No save or energy was consumed (`localStorage` keys after the run: `rr2-onboarded`, `rr2-progress`).

### 1.2 three.js module unavailable (CDN blocked)
- `index.html:17` importmap → `cdn.jsdelivr.net/npm/three@0.170.0`. `game.js:7` imports `scene.js` statically, and `scene.js:3-6` imports `three` and its addons. **If three fails, `game.js` itself fails to load** [CODE].
- **[OBSERVED]** (`nothree.py`, `/three/**` aborted): the lobby renders (11 actions). `pageerror: Failed to fetch dynamically imported module …/js/game.js` (the unhandled `gameMod` rejection, `main.js:19-20`). Starting a game gives the toast **"המשחק עוד נטען… נסה שוב בעוד רגע"** (`lobby.js:232`), which is misleading: it never loads. The built-in picker (`main.js:42-48`) is **not** used, because `lobby.js` loaded fine. Screenshots: `nothree_1_lobby.png`, `nothree_2_after_start.png`.
- [HYPOTHESIS] Chrome keeps a failed module fetch in the module map, so the lobby's retry (`lobby.js:101` resets `gameP`) cannot succeed without a reload. Vendoring three (as `/tmp/rr2real` already does) removes this single point of failure.

### 1.3 One failing GLB does not break the game
- `scene.js:235-250` `loadGLB()` caches the promise per URL. `preloadWorld()` (`312-318`) catches per model and logs `model failed`. `inst()` (`319-329`) returns a procedural fallback for life models (`LIFE_FALLBACK`, `273-310`) or else a coloured placeholder box. `setPawn()` (`853-869`) falls back to `classic` and then to `inst('pawn')` (a box). `preloadDice()` (`1123-1124`) and `preloadLife()` (`270`) swallow errors [CODE].
- **[OBSERVED]** (`webgl.py glb404`: 404 on `w1/apartment.glb`, `w1/business.glb`, `pawns/classic.glb`, `life/die.glb`): the game booted and a free w1 game started. Two rolls ran, a deal was bought (city = 2 objects, placeholders), and the save advanced to month 2 / turn 2 / 5 actions. No `pageerror`. `glb404_4_turns.png` shows the board, the HUD and an event card. My driver stopped at a market card, which is a limit of the test script, not a game bug.
- Side effects [CODE]: (a) **a rejected promise stays cached** (`scene.js:236-237`), so a transient network error is never retried until reload. The console showed `model failed apartment` twice but only one 404 fetch [OBSERVED]. (b) `worldLoaded()` (`311`) stays false, so every `startGame` re-runs `preloadWorld` behind the loading bar. (c) A GLB fetch that **hangs** (no timeout in `loadGLB`) would block `startGame` forever behind `#loading` [HYPOTHESIS, not run].

### 1.4 Loading screen: real stages or fake %?
- Markup: `index.html:72-74` (`#loadText`, `#loadBar`). There is no retry or cancel control. CSS `css/game.css:290-296`: `z-index:50`, bar width transitions [CODE].
- **Boot** (before the lobby): static text "טוען את העיר…". The bar is **never driven** (stays at width 0) [OBSERVED: `bar:''` in every boot sample of the glb404 run]. It is hidden once the lobby module and fonts are ready (`main.js:22-34`), not when 3D is ready.
- **Game start** while init is still running (`game.js:189-191`): the bar shows `initPct`, which is **real but count-based**: 0.05 at init start, then `0.1 + 0.85 × (GLBs settled / GLBs needed)` (`game.js:98,105`) [CODE]. Observed "טוען את העולם…" at 5% in the nogl run. Then a world switch: `0.02 → 0.05 + 0.9 × p` per settled GLB (`game.js:244-245`). Not driven: fonts (`game.js:102`, ≤ 2.5 s race), `setPawn`, `lifeP` (`game.js:247-249`, ~2.5 MB of life/history models). So the bar can sit at ~95–100% while those load. Verdict: **real stages, coarse granularity, no byte progress, no stage names, no failure state.**

---

## 2. Error handling and recovery

| Path | Where | Behaviour |
|---|---|---|
| WebGL / init failure | `main.js:20`, `game.js:89,192`, `lobby.js:236-237` | Message hidden after ~0.5 s. Each start gives the generic toast. Retries forever [OBSERVED] |
| `game.js` import failure | `lobby.js:99-103,232` | Toast "המשחק עוד נטען…" forever [OBSERVED] |
| `E.rollDice` throws | `game.js:506` | Caught: busy reset, roll re-enabled [CODE] |
| `E.choose` throws in a card | `game.js:597-604` | Caught: re-describes the current event or closes [CODE] |
| sheet actions / invest / savings throw | `game.js:722,728-729,751-754,771` | Caught, `console.error` (+ toast for invest/savings) [CODE] |
| **Anything thrown in `turn()` after the roll** (scene.throwDice/hop, ui.landDice, applyOut, card/bailout modals) | `game.js:507-541` (no try) | Unhandled rejection. `busy` stays `true` and the roll button stays disabled forever. **No message** [OBSERVED, below] |
| Same in `handleLanding` / `startGame` resume | `game.js:266-269,554-581` | Same pattern [CODE] |
| Server/network in lobby | `net.js:38-47` | Hebrew message per error code (`net.js:8-32`). Generic "משהו השתבש בשרת. נסה שוב." [CODE] |

**[OBSERVED] Exception mid-turn** (`throwmid.py`): removed `#dieSr` so `ui.landDice` throws at `ui.js:469` *after* `E.rollDice` mutated `S` and *before* `persist()` (`game.js:530`).
- `pageerror: Cannot set properties of null (setting 'textContent')`. The DOM dice show 1+4, the pawn did not move, the roll button is disabled, and no toast appears (`throwmid_1_stuck.png`). Clicking roll again does nothing.
- The save in `localStorage` was still the pre-roll state (turn 0, phase roll, 0 actions). ⚡ was already spent (25→24, `game.js:501`).
- Recovery A: lobby → "חזרה למשחק" (`resume-active`, `lobby.js:1614`) only hides the lobby. **Still stuck.**
- Recovery B: lobby → world → "להמשיך" → `startGame({resume:true})` → playable. `goLobby()` (`game.js:782-786`) had persisted the **in-memory post-roll state** (turn 1, phase land, lastRoll [4,1]). The resume resolved that landing (an auto market event) with the **same dice**: no re-roll and no lost turn. So the save itself is safe and consistent, and the only problem is the stuck UI. A page reload instead of the lobby would resume the pre-roll save and re-draw identical dice: the engine is deterministic and RNG state is in the save [CODE + Node §3]. It would cost one more ⚡.
- Engine side [OBSERVED, `saves.mjs` §8]: `choose(unknown option)` and `rollDice` while an event is pending both **throw before mutating**. The state was byte-identical after the throw.

Recommendations (owner: shell agent, `game.js`/`main.js`): (1) wrap `turn()`/`handleLanding()`/`resolveCard()` bodies in a `try/finally` that resets `busy`, re-enables roll and shows a recoverable message ("משהו נתקע — ממשיכים מהשמירה" + a button that runs `startGame({...CFG, resume:true})`); (2) global `unhandledrejection`/`error` handler that logs once and shows the same recover bar while a game is active; (3) make `resume-active` call `startGame({...cfg, resume:true})` when `busy` is stuck (e.g. a `game.isStuck()` probe); (4) keep `persist()` before any scene/UI work after an engine mutation (move `persist()` to directly after `E.rollDice` at `game.js:506`).

---

## 3. Saves

### 3.1 localStorage keys (all client-only unless noted)
| Key | Owner / code | Format | On corrupt JSON [CODE; OBSERVED = `saves.py corrupt`] |
|---|---|---|---|
| `rr2-save-free-<w>` / `rr2-save-history-<sid>` / `rr2-save-<resultId>` / `rr2-save-<mode>-<w>-<seed>` | `game.js:31-43` | `{v:2, cfg, state:<engine state v3 + ui>, savedAt}`. The wrapper `v:2` is **never read** | `readSave` → `null` → treated as "no save". The next `persist()` overwrites it silently. Lobby OK [OBSERVED] |
| `rr2-progress` | `progress.js:25,58-73` | `{v:1, stars, best, achievements, pawn, …, learn}`. `v` not checked | Falls back to `fresh()`. The **next save overwrites → local progress lost** (server merge restores stars/achievements only for registered players) |
| `rr2-energy` | `energy.js:14,18-24` | `{e, at, granted}` | Reset to **full 25⚡** (a trivially reachable local refill; acceptable since ⚡ is local anyway) [OBSERVED: lobby showed 25/25] |
| `rr-player` | `net.js:5,35-37` | `{id, secret, nickname}` | `me = null` → guest. Identity lost unless the recovery code is used |
| `rr2-settings`, `rr2-coach`, `rr2-onboarded`, `rr2-fallback`, `rr2-library`, `rr2-ref`, `rr2-quiz-credit`, `rr2-seen-chal` | `game.js:12,288`, `lobby.js:451,160,517,898`, `main.js:53`, `library.js:9` | small JSON/flags | All parsed in try/catch → defaults [CODE] |
| `rr2-pending-finish` | `lobby.js:317-321` | array of ranked finishes + action logs | `[]` → **queued ranked results/verification silently dropped** |
With every key above corrupted at once, the lobby still rendered (11 actions, no `pageerror`). Corrupt values stay in storage until the owning module writes [OBSERVED: `saves_corrupt_1_lobby.png`].

### 3.2 Versioning and migration (`js/engine.js`)
- `SAVE_VERSION = 3` (`engine.js:22`). `createGame` writes `v:3` (`:67`). `deserialize` (`:213-220`): `v===1` → `migrateV2` (`:222-242`); `v !== 3` → throw `save_incompatible`; unknown world → `getWorld` throws "unknown world …" (a different message). There is no `v:2` engine state: "v1/v2 saves (st.v = 1)" [CODE].
- `deserialize` clones its input (`JSON.parse` or `clone`), so `migrateV2` never mutates the caller's object [OBSERVED: "v1 input object mutated? false"]. **Nothing is backed up anywhere**, though: `game.js:224-227` on `save_incompatible` calls `clearSave(cfg)` and toasts "המשחק השמור מגרסה ישנה — מתחילים מחדש".
- Node results (`saves.mjs`) [OBSERVED]: round-trip OK. Truncated JSON throws a SyntaxError (not `save_incompatible`, so `game.js` starts fresh **without** clearing, then overwrites). `"null"`, `v:4`, missing `v` and `v:2` → `save_incompatible`. `worldId:'w9'` → "unknown world w9" (starts fresh and overwrites, no toast). Synthetic v1 → migrated (pos 7→12 on 40 tiles, 10 RNG streams). `migrateV2` also "succeeded" on a v1 state with `world:null` (weak validation).
- **Future-version save, end to end [OBSERVED]** (`saves.py future`, fixture = a month-10 w1 game with `state.v=4`): the lobby offers "▶ להמשיך מאיפה שעצרת · מורה · חודש 10" (`savedGame()` `game.js:76-80` does not check the version). Clicking it shows the toast **"…מגרסה ישנה — מתחילים מחדש"** (wrong wording: the save is *newer*). The save is **deleted** and replaced by a month-1 game (`after: {stateV:3, month:1}`; `saves_future_3_after_continue.png`). This is real data loss on any rollback (deploy v4 → revert → every v4 save wiped).
- **Ranked with an incompatible/corrupt server checkpoint** (`game.js:214-239`) [CODE]: the deserialize failure falls through to `createGame` with the **same seed**. `ckFloor` (`:230,239`) makes the new game's checkpoints `seq > floor`, so the server accepts them. The ranked game silently **restarts from turn 0 with full knowledge**. See §4.4 for why this matters.
- **History-mode save key mismatch (bug)** [CODE]: `game.js:34` keys history saves by `cfg.scenarioId` (`rr2-save-history-<sid>`). The lobby looks them up with `{mode:'history', worldId:'h', seed}` and no `scenarioId` (`lobby.js:632,653,656,658,1208`), which gives `rr2-save-history-x`. So "▶ להמשיך" for מכונת הזמן is never shown and the end-of-game clear misses. Not run in a browser.
- **Adding an RNG stream** [OBSERVED, Node]: `rng.next(holder, 'newStream')` on a save without that key yields `0` then a fixed sequence, **identical for every game**. Only `migrateV2` backfills streams (`engine.js:232-233`). Any new stream (e.g. NL-12 rivals) needs a backfill in `deserialize` (`fresh = makeStreams(st.seed)`), or a `SAVE_VERSION` bump plus migration. `STREAMS` is append-only (`rng.js:57-59`). Appending does not change existing streams, because each stream seed is `seed + (k+1)·φ`.
- `persist()` swallows quota errors (`game.js:42`). The player is not told the game is no longer being saved [CODE]. State size: 2.8 KB fresh, 7.7 KB after 25 turns / 75 actions [OBSERVED].

### 3.3 Proposed hardening (NL-03), all achievable **without touching engine.js** (no re-pin)
1. `js/systems/saves.js` (owned by the shell agent; game.js calls it): `readSave(key)` → `{ok, raw, wrapper, reason:'corrupt'|'future'|'incompatible'|'unknown_world'}`. Check `wrapper.state.v > E.SAVE_VERSION` *before* `E.deserialize`.
2. Before any migration or clear: copy the raw string to `rr2-bak-<key>` (one slot per key, plus `{at, appVersion, reason}`). Never `clearSave` a `future` save. Instead show "השמירה נוצרה בגרסה חדשה יותר — רענן את הדף" and keep the slot read-only (start new games in another slot or ask first).
3. Corrupt JSON: move it to backup and toast "השמירה פגומה — שמרנו עותק". Offer "start over" explicitly instead of silently overwriting.
4. `persist()`: on quota failure set a flag and show "השמירה נכשלה" once.
5. Wrapper: write `{v:3, app:<version>, engine:<pin hash>, cfg, state, savedAt}`. The hash can come from a generated `js/engine_version.js` that build-edge writes and that is **not imported by engine.js** (so it stays outside the pin).
6. Ranked resume: if the server checkpoint fails to deserialize, **do not** start fresh with the same seed. Show an error and keep it retryable (§4.4).
7. Fix the history key: lobby passes `scenarioId`, or `saveKeyFor` falls back to the seed.

---

## 4. Determinism and the server verification contract

### 4.1 What the engine guarantees [CODE]
- `engine.js:1-4`: no DOM, THREE, `Math.random` or `Date`. RNG = mulberry32 named streams in `st.rng` (`rng.js:9-15,57-63`). The streams are consumed by **where the pawn lands, never by decisions**.
- [OBSERVED, Node] A different choice at the same decision point gives the same next roll (`[6,6]` vs `[6,6]`) and `rng.dice` stays equal. `replay(full log)` equals the live state byte for byte. The determinism suite (300 ranked games with ±1-ulp math nudges) passes.

### 4.2 Action log (`st.actions`) = the replay contract
- Pushed by `act()` (`engine.js:208`): `['r']` rollDice (`:674`), `['l']` first landing (`:1152`), `['c', optionId(, qty)]` choose (only after success, `:1899`), `['L',amt]` `['R',amt]` `['C']` `['P',plan]` `['S',amt]` `['T',0|1]` `['A',amt]` `['I','buy'|'sell',qty]` (`:2534-2615`). `replay()` (`:2631-2654`) switches on exactly these codes. `verify_core.js:7` `CODES` must equal that set. `validateActions` allows ≤ 3 elements, primitives, strings ≤ 40, `MAX_ACTIONS = 6000` (`verify_core.js:4,25-36`).
- **Rules for any new feature**: every state-changing call must (a) go through an exported engine function that `act()`s a compact primitive tuple, (b) get a `replay()` case **and** a `CODES` entry, (c) be logged only on success, (d) draw randomness only from a named stream keyed by landing (or from a new appended stream, with backfill per §3.2), (e) never read UI state (`st.ui`) or flags. The only `choose` param logged is `qty` (`:1899`). Any new param (e.g. a negotiated price) must enter the tuple and `replay`.

### 4.3 Ranked modes, checkpoints and the pin
- Ranked = `cfg.resultId` + mode ∈ {daily, weekly, challenge} (`game.js:50,398`). ⚡ is free (`engine.js:27`). The seed, world and character come from `rr_begin` (`lobby.js:280-307`). Checkpoint after every landing and decision with monotonic `S.ui.seq` (`game.js:45-72`); the server rejects a lower turn (`stale_checkpoint`) [CODE; live behaviour per docs/SECURITY_REVIEW.md §3.4, not run by me].
- Finish → `rr2-pending-finish` queue → `net.finish` then `net.verify(resultId, actions)` (`lobby.js:316-369,1200-1208`). The edge function rebuilds the replay config **from the server row only** (`verify_core.js:47-62`, `index.ts` `ROW`: daily seed = `abs(hashtext('ratrace-daily-'||key))`, `max_months=24`), replays it and compares status/months/passive/expenses/netWorth/stars/progress (`verify_core.js:77-91`).
- **Pin**: `tools/build-edge.mjs` hashes `js/engine.js` plus **every module it imports** (currently 17 files: achievements, data/real, data/tax, finance/*, history, life, rng, worlds/*). The function only executes code whose canonical bundle hashes to `engine_pin.js:ENGINE_SHA256` (`index.ts` `useBundle`). Consequences: **any edit to those 17 files, or to any new `js/systems/*.js` that engine.js imports, requires a re-pin and a synchronized site + function deploy** (`docs/VERIFY_INTEGRATION.md §4`). During the gap verify answers 503 `engine_unavailable` (retryable). [HYPOTHESIS] A client still running a cached old engine *after* the deploy, or a ranked game started before and finished after it, is replayed by the new engine. If the rules changed, it is flagged `verified=false`. The finish payload carries no engine id (`summaryForServer` `engine.js:1039-1046` sends `v: SAVE_VERSION` only). Fix: send the pin hash and let verify answer `engine_mismatch` (retryable/ignored) instead of a false flag.
- Note that `achievements.js` is inside the pin. Adding an achievement is an engine release.

### 4.4 "Rewind to a decision point" (NL-13), and why ranked must stay safe
**Mechanism (works today, no engine change)** [OBSERVED, Node]: the state at decision point *k* is `E.replay(E.replayConfig(S), S.actions.slice(0, k))`. I checked 30/30 decision points (pending event, before the choice) against live snapshots: byte-identical. Replay of 90 actions took 8.5 ms on this machine. Decision points can be found client-side without engine changes: the action index after each `['l']`, plus after each `['c']` that leaves `pending` set. Store the indices in `S.ui.dp` (`S.ui` is client data, `game.js:19`).

**Practice controller** (`js/practice.js`, called by game.js): `rewind(k)` → `S2 = replay(prefix)`; `S2.ui = {...S.ui, practice: true, rewinds: n+1}` → `scene.clearCity()`/`syncCity(E.cityModels(S2))`/`placePawn(S2.pos)` → `render()` → `handleLanding()`. Thanks to landing-keyed streams the branch shows the *same* dice and cards with a different decision, which is the pedagogical point.

**Exploit analysis and guards:**
1. Client gate: refuse when `ranked()` (`game.js:50`) or `RANKED.has(CFG.mode)` (`game.js:398`). Hide the UI. A rewound game is tagged `S.ui.practice`, and the lobby end path (`lobby.js` END SCREEN, `progress.recordGame`) must not award stars, unlocks or achievements for it, or only a "practice" badge. Free-mode stars are local and unverified, but they gate world unlocks.
2. "Practice a past daily/weekly" = start a **new free-style game with that seed and no `resultId`**. Only allow it after `ends_at`.
3. **Server: the log alone cannot reveal a rewind.** A rewound branch is a perfectly valid action log. Two paths exist today [CODE + HYPOTHESIS, not run against the server]: (a) devtools: restore an earlier local save with a higher `ui.seq` (`game.js:217` prefers local when its seq is higher); (b) send a checkpoint the client cannot deserialize. `rr_checkpoint` accepts arbitrary state per SECURITY_REVIEW §3.4. Then `startGame` restarts from turn 0 with the same seed (§3.2), and the server accepts the new checkpoints. **Recommended server hardening (NL-13 dependency):** make the server-side action log append-only. `rr_checkpoint` must reject a state whose `actions` is not an extension of the previously stored `actions` (jsonb prefix compare), and `verify-result` must require that the stored checkpoint's `actions` is a prefix of the submitted log. Client side, a failed deserialize of a ranked checkpoint must never fall back to `createGame`.
4. Residual, inherent risk: the client receives the seed (`lobby.js:291`) and the engine is public, so an offline lookahead for an *open* daily is already possible. Rewind must not make this a one-click affair, but it cannot be eliminated while the engine runs client-side.

---

## 5. Architecture map for parallel work

Sizes (lines): `engine.js` 2843 · `lobby.js` 1719 · `scene.js` 1251 · `ui.js` 1099 · `game.js` 811 · `progress.js` 402 · `css/lobby.css` 781 · `css/game.css` 641 · others < 230 [OBSERVED `wc -l`].

Hot spots / internal seams [CODE]:
- `engine.js` sections: create/save `54-242` · economy `244` · metrics `426` · city `591` · turn/paydays `663` · server summary `1037` · landing `1138` · describe `1288` · choose `1875` · decision quality `1961` · any-time actions `2527` · replay `2627` · end `2668`. It is pinned, so a single owner should batch changes into one re-pin per wave.
- `lobby.js`: helpers `16` · starting games / ranked `228-315` · pending finish + verify `316-371` · energy/welcome/library `450` · history `592` · HOME `665` · WORLD `818` · GROUP `883` · PROFILE `1030` · END SCREEN `1094-1584` (490 lines) · events `1585` · bus `1714`.
- `ui.js`: toasts `57` · modal `98` · loading/theme `131` · HUD `156` · sheet `276` · mentor `409` · dice `450` · coach `495` · event cards `536-897` (360 lines) · verdict `898` · story `1069`.
- `game.js` is the integration choke point. Rewind, 2D mode, save hardening, error recovery and new systems all need hooks here.

Existing contracts to build on: `game.js:2-4` public API (`initGame, startGame, savedGame, hasActiveGame, activeConfig, clearSave, saveKeyFor`), `bus.js` events (`game:end`, `achievement`, `lesson`, `reward`, `lobby:open`, `energy:change`), the `E.*` API (game.js uses 25 functions), and the **scene API used by game.js (33 functions):** `init, setSpeed, setPaused, frame, preloadWorld, worldLoaded, preloadLife, preloadDice, setPawn, buildWorld, placePawn, syncCity, resetCamera, setCameraMode, getCameraMode, hop, throwDice, holdDice, cancelHold, spawn, despawn, launch, hasKey, bump, shield, floatLabel, sparkle, hearts, shake, confetti, celebrate, project` [OBSERVED grep]. Feature detection is already used as a soft seam (`typeof E.setPlan === 'function'`, `game.js:449,721,738,760`).

**Safe extension seams**
- `js/systems/*.js` comes in two kinds, and the split must be explicit: **engine-side** (changes outcomes): imported only by `engine.js`, pure, deterministic, pinned, logged per §4.2. **UI-side** (coaching, forecasts, summaries, rivals' *presentation*): imported by `game.js`/`ui.js`/`lobby.js` only, reads `E.metrics(S)`, writes only `S.ui`, never imported by the engine. (TASK_BOARD NL-06 says "js/systems/* + engine.js integration", so each new file must declare which kind it is in its header.)
- `js/render/` for alternative renderers behind the scene API (§7).
- `js/flags.js` (§6), `js/systems/saves.js`, `js/systems/errors.js`, `js/practice.js`.

**Recommended file ownership (5 implementation agents, no shared files)**
| Agent | Owns (exclusive) | Must not touch |
|---|---|---|
| A — Engine & rules | `js/engine.js`, `js/rng.js`, `js/finance/*`, `js/life.js`, `js/history.js`, `js/achievements.js`, `js/worlds/*`, `js/data/*`, engine-side `js/systems/*`, `tests/*.test.mjs` (engine/finance/business/determinism/verify), `tools/sim.mjs`, `tools/build-edge.mjs`, `supabase/functions/verify-result/*` (one re-pin per wave) | DOM files |
| B — Shell, saves, robustness, practice | `index.html`, `js/main.js`, `js/game.js`, `js/bus.js`, `js/flags.js`, `js/systems/saves.js`, `js/systems/errors.js`, `js/practice.js`, `tests/game_e2e.py` | engine files, scene, ui |
| C — Rendering | `js/scene.js`, `js/render/*` (board2d), `css/board2d.css`, `assets/**`, `blender/*` | game.js (requests hooks from B) |
| D — In-game UI | `js/ui.js` (may split into `js/ui/*.js` re-exported by ui.js), `css/game.css`, `js/audio.js`, UI-side `js/systems/*` (forecast/coach views) | lobby, engine |
| E — Meta / lobby / backend | `js/lobby.js`, `js/progress.js`, `js/energy.js`, `js/library.js`, `js/net.js`, `css/lobby.css`, `tests/lobby_*.py`, `tests/stubs/*` (NL-16 mock backend), `supabase/migrations/*` (append-only checkpoint, §4.4) | game.js, engine |
Coordination rule: cross-owner needs go through a written contract (function signature or bus event) that the owner implements. B owns `game.js`, so A, C and D add only exported functions, and B wires them. Only A re-pins.

---

## 6. Feature flags

- Exists: **no mechanism** [CODE]. There are only ad-hoc URL params (`?hq` `scene.js:38`, `?join`/`?ref`/`?duel` `lobby.js:158-161,1156`), one constant (`HAPPY_RULE`, `lobby.js:58`) and the `typeof E.fn === 'function'` capability checks.
- Minimal proposal, `js/flags.js` (~30 lines, owner B):
```js
// UI-layer feature flags. NEVER imported by engine.js or anything it imports (that would change the verify pin).
const DEFAULTS = Object.freeze({ board2d: 'auto', rewind: false, recoverBar: true /* … one line per Next-Level feature */ });
const PRACTICE_ONLY = new Set(['rewind']);            // forced off in ranked games
let F = null;
function load() {
  const f = { ...DEFAULTS };
  try { Object.assign(f, JSON.parse(localStorage.getItem('rr2-flags') || '{}')); } catch (e) { /* ignore */ }
  try { for (const t of (new URLSearchParams(location.search).get('ff') || '').split(',').filter(Boolean)) {
    const [k, v] = t.replace(/^-/, '').split(':'); if (k in DEFAULTS) f[k] = t.startsWith('-') ? false : v ?? true; } } catch (e) { /* ignore */ }
  return f;
}
export function flag(name, { ranked = false } = {}) { F ||= load(); return ranked && PRACTICE_ONLY.has(name) ? false : F[name]; }
export const allFlags = () => ({ ...(F ||= load()) });
```
- Rules: defaults ship as `false`/`'auto'` until QA signs off. Flags gate only UI/controller code. A flag must never change engine outcomes (use a world/mode config inside the engine and re-pin for that). `?ff=` lets QA/e2e toggle without code changes, e.g. `?ff=board2d:on,rewind`.

---

## 7. 2D / "light" fallback without WebGL

- Coupling [CODE]: `game.js:7` imports `scene.js` statically, and that pulls three at module-evaluation time. Every visual call goes through the 33-function scene API (§5). `game.js` holds no THREE objects. `ui.js` only receives screen coordinates (`scene.project()` → `ui.flyCoins`, `game.js:548,648`) and `ui.freeRect()` for `scene.frame()` (`game.js:177`). The **engine is fully renderer-agnostic** (`engine.js:2`). `E.cityModels(S)` (`engine.js:591`) already gives a renderer-neutral city list (key, model, label).
- Reusable pieces inside `scene.js`: board geometry `setBoardSize`/`tilePos` (`336-348`) is pure math wrapped in `THREE.Vector3` (port it to `{x,z}`). Tile art `tileTexture`/`drawIcon` (`365-431`) is plain canvas 2D: only `canvasTex()` is THREE, so the same canvas can become a `dataURL` or a `<canvas>` in DOM tiles. `drawCenter` (`433-452`) is canvas 2D too. `LIFE_FALLBACK`, decor and GLBs are THREE-only. 2D would replace them with emoji/SVG icons keyed by model name (`w.models`, `LIFE_MODELS` `scene.js:268-269`).
- Work items (agent C + a small hook from B), with [HYPOTHESIS] sizes:
  1. `js/render/board2d.js`, ~400–600 lines: a CSS-grid or SVG ring of `w.board.length` tiles (24 or 40) using the canvas tile art, a pawn `<div>` hopping by CSS transform (`hop` returns a promise like the 3D one), a city as a grid of icon cards in the board centre (`spawn/despawn/launch/bump/shield/syncCity/hasKey`), effects as CSS animations (`floatLabel`, `sparkle`, `hearts`, `confetti`, `shake`, `celebrate`), `project(at)` = `getBoundingClientRect()` centre, `throwDice` = short delay (the DOM dice already exist in ui.js `450-471`), `preload*` = no-ops, `setPaused/setSpeed/frame/camera*` = trivial. RTL: lay the ring out so tile 0 starts bottom-right, as in 3D.
  2. Renderer selection in `game.js` (B): replace the static import with `const scene = await import(useWebGL() ? './scene.js' : './render/board2d.js')` inside `doInit()`, where `useWebGL()` = `flag('board2d') === 'on' ? false : flag('board2d') === 'off' ? true : canvas.getContext('webgl2') || canvas.getContext('webgl')`. Also catch `scene.init` throwing (or a `webglcontextlost` event) → switch to 2D once, toast "מצב קל (בלי תלת־ממד)". Top-level `scene` becomes a `let` set in `doInit`. Every current call site keeps working.
  3. three as a lazy dependency: once `scene.js` is only imported dynamically, a CDN failure falls back to 2D instead of "המשחק עוד נטען…" forever (§1.2). Vendoring three locally is still recommended.
  4. Tests: `game_e2e.py` with `--disable-3d-apis` must play N turns in 2D (the `nogl` harness in `/tmp/research-eng/webgl.py` is a ready start).
- Effort/risk [HYPOTHESIS]: 1–2 agent-days for a functional board. The risk is in the visual parity of the city and in keeping `hop()`/`throwDice()` timings equivalent for flows that await them (`game.js:511-525`).

---

## 8. Status vs owner requirements

| Req. | Item | Status | Evidence |
|---|---|---|---|
| §6 stability & reliable entry | Lobby usable without WebGL | **exists** | §1.1 [OBSERVED] |
| §6 | Clear message when 3D is unavailable | **needs improvement** (flashes < 0.5 s, then a generic toast on every start) | §1.1 [OBSERVED] |
| §6 | Playable 2D/light mode without WebGL | **missing** | §7 |
| §6 | three CDN failure handling | **needs improvement** (misleading "עוד נטען" forever) | §1.2 [OBSERVED] |
| §6 | Missing/failed GLB tolerance | **exists** (placeholders) · retry of transient failures **missing** | §1.3 [OBSERVED] |
| §6 | Loading screen with real progress | **needs improvement** (count-based, boot bar idle, no stages/timeout/retry) | §1.4 |
| §6 | Recovery from an exception mid-turn | **missing** in-game (UI stuck, no message). Save stays consistent, and recovery is possible only via lobby → world → continue | §2 [OBSERVED] |
| §6 | Global error/unhandledrejection handler, context-loss handling | **missing** | §1.1, §2 |
| §17 architecture & saves | Save versioning + v1→v3 migration | **exists** | §3.2 [OBSERVED] |
| §17 | Backup before risky migration / before clearing | **missing** | §3.2 |
| §17 | Corrupted save handling | **needs improvement** (no crash, but silent overwrite; progress/pending-finish loss) | §3.1 [OBSERVED] |
| §17 | Future-version save | **missing / harmful** (deleted, wrong "old version" text) | §3.2 [OBSERVED] |
| §17 | History-mode continue | **needs improvement** (key mismatch bug) | §3.2 [CODE] |
| §17 | New RNG streams safe for old saves | **needs improvement** (no backfill outside migrateV2) | §3.2 [OBSERVED Node] |
| §17 | Deterministic engine + server replay + pin check | **exists** | §4 [OBSERVED tests] |
| §17 | Engine version in result / safe rollout across engine changes | **needs improvement** | §4.3 |
| §17 | Feature flags | **missing** (proposal §6) | §6 |
| §17 | Module seams for parallel work | **needs improvement** (game.js choke point; proposal §5) | §5 |
| §16 rewind | Replay-to-decision-point capability | **exists in the engine** (`replay(prefix)`, 30/30 exact) · UI **missing** | §4.4 [OBSERVED Node] |
| §16 | Rewind safe vs ranked | client gate **missing** (trivial) · server append-only log check **missing** · checkpoint-fallback restart **not suitable now** (must be fixed before shipping rewind) | §4.4 |

---

## Appendix — artifacts
Screenshots (`/tmp/research-eng/`): `nogl_1_lobby.png`, `nogl_2_world.png`, `nogl_3_after_start.png`, `glb404_1_lobby.png`, `glb404_2_world.png`, `glb404_3_after_start.png`, `glb404_4_turns.png`, `nothree_1_lobby.png`, `nothree_2_after_start.png`, `saves_corrupt_1_lobby.png`, `saves_future_1_lobby.png`, `saves_future_2_world.png`, `saves_future_3_after_continue.png`, `throwmid_1_stuck.png`, `throwmid_2_recovered.png`.
Logs: `nogl.json`, `glb404.json`, `nothree.json`, `saves_corrupt.json`, `saves_future.json`, `throwmid.json`. Node: `node /tmp/research-eng/saves.mjs`.
Inconclusive: in `throwmid.py` the final roll after recovery had spent ⚡ (24→23), but 7 s later the save had not advanced yet (likely slow swiftshader). No second `pageerror` occurred. I make no claim either way.
