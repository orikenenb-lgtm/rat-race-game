# Wave 1 independent review and test (3D upgrade, teams ג + ב)

Reviewer: independent review/test worker (wrote none of this code). Commit reviewed: **4b890fa** (branch `feature/3d-world-upgrade`),
compared with **f0e8d4d**. Reviewed and tested on an export (`git archive 4b890fa` → `/tmp/rv1/wt`), served by
`SRC=/tmp/rv1/wt COPY_DIR=/tmp/rv1 PORT_BASE=9700 bash tests/serve_copies.sh` (9700 game-only copy, 9702 real copy), plus a
`/rat-race-game/` subpath copy on :9705. All browser runs were offline: fake backend + guard, Chrome `--no-proxy-server`,
`*.supabase.co` unresolvable. No repo file was edited except this report. Nothing was committed.

Scope: `git diff f0e8d4d 4b890fa` minus docs. Team ג: `js/render/tiles.js` (new), `js/scene.js`, `js/render/board2d.js`,
`kit3d.js`, `null.js`, `js/game.js`, `js/ui.js`, `css/game-play.css`, `tests/board_ux*`. Team ב: `js/render/select.js`,
`overlay.js`, `css/stability.css`, `index.html`, `vendor/three` + `vendor/fonts`, `ATTRIBUTION.md`, `tests/fallback_*`.

## Verdict

No BLOCKER. **2 MAJOR, 6 MINOR, 5 NIT.** Every required suite passes with 0 errors, and no turn got stuck in any scenario I
tried. The two MAJORs are:
1. The tile list can open during a move, so it stacks with the landing card and traps keyboard focus.
2. Some tile descriptions are false in some worlds: the market tile in w1 to w4, and the deal tile in w3, w4 and h.

Both are small fixes. They should land before wave 2 builds on the tile sheet.

## Findings

### MAJOR-1: the tile list opens during a move, then the landing card opens with it (two dialogs, keyboard trapped under the list)

- **Where:** `js/game.js:438-439` (`openTileList` guard has no `busy` check; compare `onAssetPick` at `js/game.js:503`, which does).
  `css/game-play.css:913-916`: `#boardTools` stays visible and clickable during the turn and while a card is open.
  `js/ui.js:2312`: `tileList` uses the shared `#gm` modal, and its Escape handler is on `#gm` (`js/ui.js:259`).
- **Scenario (reproduced 3×: 3D desktop twice, 2D desktop once; probe `/tmp/rv1/scripts/dbg_list*.py`):**
  1. Press "הטל קוביות", then press 📋 while the pawn hops.
  2. The list opens. When the pawn lands, the payday/deal card (`#evm`) opens too, so both are visible. Screenshot:
     `/tmp/rv1/shots/dbg_list3d.png` shows the list drawn over the payday card.
  3. The card opens after the list, so its `trapFocus` is on top of the stack. Tab cycles through the *hidden* card buttons, and
     Enter picks a card option the player cannot see.
  4. Escape does not close the list, because focus is not inside `#gm`. A keyboard or screen-reader user cannot reach "סגירה".
  5. Picking a tile in the list does nothing, because `onTilePick` returns on `busy`.

  The game is not stuck: a mouse click on "סגירה" closes the list and the card is under it. But this is a §16 focus-management
  failure, and an option can be chosen blind.
- **Fix:**
  1. Add `busy ||` to the `openTileList` guard.
  2. Hide the tools while a card is open: `body:has(#evm:not([hidden])) #boardTools{display:none}`.
  3. Better still, disable `#tilesBtn` while `busy` (`ui.setRollEnabled` already runs at the same points).
  4. Add an e2e step: click 📋 mid-hop and assert `!(gm && card)`.

### MAJOR-2: tile descriptions say things the engine never does on that tile in some worlds

`tileText()` ignores the world (`js/render/tiles.js:52`). The shared type text is wrong for some worlds. I checked it against
`engine.landing()` / `createMarket()` / `createDeal()` (`js/engine.js:1410-1470`) and against the card decks of every world
(dump script: `/tmp/rv1/scripts/tiles_dump.mjs`):

- **Market** (`tiles.js:11`): "מחירים, ריבית, הדולר או שווי הנכסים זזים".
  - **w1 (השכונה, the main world):** the market deck has only `sell, price, crypto, repair, bonus, div`. There is no rate
    card, no dollar (fx) card and no revaluation, so 3 of the 4 promised effects never happen there. The real ones (a repair
    bill, a bonus, a buyer's offer, a dividend) are not mentioned.
  - **w2:** no dollar.
  - **w4:** no rate and no dollar. The deck has startup exit waves and markdowns instead.
  - **w3:** correct apart from the rate.
- **Deal** (`tiles.js:9`): "דירה, עסק, מניה או משהו אחר".
  - **w3:** ships, warehouses, factories, GOLD and USD, but no apartments.
  - **w4:** data centres, campuses and an index, but no apartments.
  - **h (מכונת הזמן):** `deals` are filtered to `!c.tk && !c.crypto` (`js/worlds/h.js`), so there are never shares.
- **Checked and true:**
  - payday (including the landing plan picker), doodad, crisis and its per-world overrides, mystery (every world has a golden
    mystery card), bank, upgrade (assets or expense trims), fx, shipping, pitch, giving.
  - life ("כוח" is the game's own word for energy), edu (`planOptions` + course), tax (the engine's own "פעם בשנה" text),
    index (standing order), business (manage when owned, otherwise offer), h "כותרות".

Why MAJOR: this is new educational text in a game for children. Brief §10/§23 asks reviewers whether every new visual "reflects
real data", and the unit test only checks the length (`tests/board_ux.test.mjs`, T-tiles).

- **Fix:**
  1. `tileText(tile, worldId)` with per-world `market` / `deal` text. For example, w1 market: "חדשות מהשוק: מחירי מניות
     וקריפטו זזים, מישהו מציע לקנות נכס שלך, או תיקון/בונוס. לפעמים אפשר לקנות או למכור". Use per-world deal lists in the
     same way.
  2. Add a data-driven test: each effect word maps to a card kind, and the test asserts that the kind exists in that world's
     deck.

### MINOR-1: landscape phone (844×390): both board tools sit under the HUD and cannot be tapped

- **Where:** `css/game-play.css:913` (`#boardTools` z-index 3, placed at `--fr-y1 - 52px`); `js/game.js:419`.
- **Scenario:** the free board rect is only `0,0 → 486,198`.
  - 🎯 (`#homeViewBtn` 62,146-106,190) is under the life-row "…" button (`.lc.more`, "עוד בשורת החיים");
    `elementFromPoint` = `lc more`.
  - 📋 (`#tilesBtn`) is under `#hLife`.
  - In 2D, 📋 overlaps the HUD in the same way.
  - Screenshot: `/tmp/rv1/shots/land.png`.
  - Portrait 360/390 and tablet 768×1024 / 1024×768 are clean, in both 3D and 2D.
- **Fix (overlaps team ד's HUD wave):**
  1. Place the tools only when the free rect is tall enough. Otherwise dock them in the top toolbar row, or put them beside the
     dice.
  2. Add a collision check against `.hud` in `placeBoardUi`.

### MINOR-2: the 2D current tile is not exposed to assistive tech

- **Where:** `js/render/board2d.js:137` and `markTile` (`:211-219`).
- **Problem:** the label is "יום משכורת, משבצת 1 מתוך 40", with no "אתה כאן" and no `aria-current`. The destination
  (`.b2d-dest`) is visual only. The tile list does set `aria-current="location"`, but the board itself does not.
- **Fix:** in `markTile`, set or remove `aria-current="location"` on the current tile and append "· אתה כאן" / "· לכאן
  זזים" to the label.

### MINOR-3: city reconcile can run in the middle of a roll and drop the engine's exit/spawn animation

- **Where:** `js/game.js:801` (`reconcileCity()` at the end of `render()`).
  - `render(false)` also runs from the resize handler (`:406`) and from `ghosts:state` (`:1474`). Both can fire during the
    hop loop.
  - By then `E.rollDice` has already changed `cityModels(S)` (startup exits, roll-time despawns), but `applyOut` has not yet
    played `scene.launch` / `despawn`.
- **Effect:** the item disappears silently and the launch animation is lost (`scene.launch` finds no key). `syncCity` then
  `relayout(false)`s the grid without animation.
  - The comment "engine spawns keep their animation" is true only outside that window.
  - It never shows wrong ownership: the end state is right.
- **Fix:** skip `reconcileCity` while `rolling` / until `applyOut(out)` of the current roll has run (a `pendingOut` flag), or
  call it only from the post-`applyOut` `render()` calls.

### MINOR-4: B1 G11 (assigned to team ב in PLAN.md) not done: 🪶 still works mid-hop

- **Where:** `js/game.js:375`.
- **What I checked:** switching to מצב קל mid-hop (tested twice) leaves no stuck turn and keeps state consistent. Same turn
  count, city == cityModels, 2D marker on `S.pos`, no stale destination mark.
- **What is still open:** B1 notes that the roll's cosmetic payload is dropped (payday fx, roll news, bailout/burnout info
  card). That is not addressed.
- **Fix:** disable `#liteBtn` while `busy` (the simplest option, per B1), or persist a small pending-fx marker.

### MINOR-5: some tests confirm the code's own text, not behaviour; important cases are untested

- **Regex tests:** `tests/board_ux.test.mjs:37-43` (T-opt: watchdog / camera / markTile) regex-match the *source text* of
  `scene.js` / `game.js`. Brief §22 asks for no tests that "only confirm the code calls its own function". The behaviour is
  covered by `board_ux_e2e.py`, so these could go.
- **T-tiles:** checks the length only (see MAJOR-2).
- **Reconcile e2e:** never covers a **sale** (despawn) or an actual drift repair. I checked drift repair myself: despawn an
  owned key and spawn a fake one, then resize, and the city equals cityModels again. It passed.
- **`a11y_e2e.py` AX-C:** still REPORTs "landing tile name missing", because it only reads `#dieSr`. The landing is now
  announced through `ui.announce` (board_ux_e2e checks that). Update the check.

### MINOR-6: 2D tiles are 30×30 px on a 360 px phone (brief §16 asks for about 44×44)

- **Where:** `css/game-play.css` `#board2d .b2d-tile` / the 11×11 grid.
- **Sizes:** 47×47 on desktop, 30×30 at 360 px.
- **Mitigation:** the tile list (44 px rows) is an equivalent path, and 30 px passes WCAG 2.5.8 (24 px).
- **Action:** record this as an accepted exception, or enlarge the hit area on phones.

### NITs

- **NIT-1:** the empty-city state ("כאן יקומו הנכסים שלך", lots) disappears as soon as a *life* marker exists (for example
  `L:wedding`), even with no assets. `js/scene.js:720-721` and `board2d.js updateEmpty` count every key. Count non-`isLifeMarker`
  keys instead.
- **NIT-2:** the "פרטים טכניים" GPU string is cut at 59 characters, in the middle of a parenthesis: "…(SwiftShader Device
  (Subzero) (…". See `js/render/overlay.js:32`.
- **NIT-3:** the tile list (the text alternative of the board) is hidden when the renderer is `none` (`js/game.js:419`
  `show: scene.kind !== 'none'`). That is exactly when no board is drawn.
- **NIT-4:** each roll is announced twice: the chip's "זורקים…" (polite) and `#dieSr`'s dice. The landing is a third
  announcement. Over 4 turns the chip announced only "זורקים…" ×4 (the rest are `quiet`), so this is not spam. The chip is
  `direction: rtl`, and its numbers ("זזים 5 צעדים") read in the right order.
- **NIT-5:** `tests/make_realcopy.sh` still symlinks `/tmp/t/node_modules/three` and seds the old CDN URLs. That is now dead,
  harmless code. The copies do serve the vendored files, which is good: the tests exercise what ships.

## Test results (export of 4b890fa)

The machine was shared with another implementation agent, and the load rose from about 0.1 to about 14 during the session.
Every suite ran one at a time with these exceptions:
- S2 runs 2 and 3 overlapped my subpath check, so two browsers were running at once.
- The tier-1 node suites ran next to the report writing (no browser).

No suite failed, so none needed the rerun-once rule. My own probe findings were deterministic and reproduced (see
MAJOR-1 / MINOR-1).

| Suite | Result | Time | Load (1-min, start → end) |
|---|---|---|---|
| node tier 0: finance / business / progress / energy / library / saves / flags | 37 / 104 / 41 / 26 / 6 / 105 / 16 passed, 0 failed | <2 s each | 0.02 |
| node: render_api / contrast / preload / render_vocab | 231 / 148 / 189 / 286 passed, 0 failed | <2 s each | 0.02 |
| node: **board_ux.test** / **fallback_reasons.test** | 1074 passed / 150 of 150 passed | <1 s | 0.02 |
| `tools/build-edge.mjs --check` | ✓ verify-result pins engine d1d75867…af03 | — | — |
| guard_lint | 0 violations | — | — |
| node tier 1: t4_meta / t6_client / verify / determinism / t4_engine | 128 / 135 / 10 / 2 / 9 passed, 0 failed | 88 / 85 / 214 / 411 / 76 s | about 10 → 14 |
| **board_ux_e2e.py** (3D + 2D × desk / phone / small) | **86 passed, 0 failed, 0 page errors** | 318 s | 0.11 → 2.44 |
| game_e2e w1 8 (desktop 3D) | PASS, ERRORS 0 | 583 s | 4.23 → 8.75 |
| game_e2e w1 12 `--phone` | PASS, ERRORS 0 | 465 s | 8.29 → 9.50 |
| game_e2e w1 12 2D (`?ff=board2d:on`, checked 2D in shots) | PASS, ERRORS 0 | 120 s | 9.50 → 8.17 |
| stability_e2e (all) | **125 passed, 0 failed, 0 unexpected errors** (S7's PAGEERRs are the suite's injected faults, same as in the A3 baseline) | 1000 s | 8.06 → 8.15 (peak about 9.7) |
| stability_e2e `--only=S2` ×3 | 8/0, 8/0, 8/0 (no flake in 3 runs; team ג had seen one) | 29 / 23 / 22 s | 5.70 / 6.97 / 6.12 |
| t5_render_e2e | 66 passed, 0 failed | 292 s | 4.26 → 7.65 |
| t6_e2e | 70 passed, 0 failed (perf note: long tasks max 956 ms) | 339 s | 7.65 → 8.09 |
| a11y_e2e `--strict` | rc 0: PASS 16, REPORT 5, N/A 8, NOT IMPLEMENTED 18 (pre-existing T7 part-B stubs), axe serious/critical 0 | 802 s | 8.09 → 11.81 |
| lobby_real | 18 of 18 passed, guard clean | 224 s | 11.81 → 14.00 |
| fallback_probe `--phones` | 16 of 16 runs, notices match the cause (table below) | about 7 min | 11–14.8 |

### Reviewer probes (`/tmp/rv1/scripts/probe.py`, `probe2.py`, `subpath.py`; logs `/tmp/rv1/logs/probe*.log`)

| Scenario | Result |
|---|---|
| Tile list opened mid-hop (3D, 2D) | **FAIL**: list and card open together (MAJOR-1) |
| Focus: 📋 → list (focus on "אתה כאן" row) → Esc → back on 📋; list → tile → sheet (focus inside) → Esc → 📋; sheet → "כל המשבצות" → list; Space in the list does not roll | 7 of 7 OK |
| 2D: arrow + Enter → sheet → Esc → focus back on the tile; desktop tile 47 px | OK; current tile has no aria-current (MINOR-2) |
| Double roll (2 clicks + Space + Enter) ×3 | 1 turn each time |
| Orientation flip 390×844 ↔ 844×390 mid-move ×3 (3D) and ×3 (2D) | Turn finishes; pawn tile = `S.pos`; city = cityModels |
| 3D → 2D with a card open | Same card reopens; turn, cash and pos unchanged; city = cityModels; 2D marker on pos |
| 3D → 2D mid-hop ×2, and 2D → 3D reload | Not stuck; one turn; no stale destination mark |
| 2D hidden tab mid-move | Turn finishes, marker on pos |
| City drift repair (despawn owned + spawn fake, then resize) | Reconciled to cityModels |
| Layout 360×740, 390×844, 768×1024, 1024×768 (3D and 2D): horizontal scroll, tools ≥ 44 px and in view, nothing covers card buttons | 46 of 46 OK |
| Layout 844×390 landscape | **FAIL**: tools under the HUD (MINOR-1) |
| Turn chip over 4 turns | Polite announcements: "זורקים…" ×4 only; RTL |
| axe on the 2D board, board tools, tile list, tile sheet (1300 and 360) | 0 serious/critical; the sheet is a named dialog; no horizontal scroll |
| Subpath `/rat-race-game/index.html` (desktop + phone) | 3D starts. three + 4 addons + 4 woff2 all load from `/rat-race-game/vendor/…`. No request outside the subpath. Fonts `Rubik 300 900` and `Secular One 400` loaded. The only 404s are lobby.js/progress.js, which the game-only copy removes on purpose. A roll works. |

### Notices per real cause (fallback_probe, desktop + phone)

| Cause | Renderer | Notice | Technical details line | Action |
|---|---|---|---|---|
| no WebGL | 2d | N1 "התלת־ממד (WebGL) לא זמין… האצת החומרה…" | `no-webgl` | — |
| WebGL1 only | 2d | N1b "…רק בגרסה הישנה של WebGL…" (three is **not** downloaded) | `no-webgl2 · <GPU>` | — |
| three download fails | 2d | N2 "לא הצלחנו להוריד את קבצי התלת־ממד…" | `three-failed · <GPU>` | "לנסות שוב בתלת־ממד" |
| three slow (> 20 s) | 2d | N2s "…נטען לאט מדי ברשת הזאת…" | `three-timeout · <GPU>` | "לנסות שוב בתלת־ממד" |
| GLB fails | 3d | N6 "חלק מהציורים לא נטענו…" | — | — |
| context lost in game | 3d → R3 bar | "התצוגה התלת־ממדית נעצרה" + neutral body; the bar does **not** cover the card's decision buttons (0 of 5 covered) | `context-lost · <GPU>` | מצב קל / 3D / לובי |
| context lost in lobby | 2d | N8 "…נעצרה (כנראה נגמר הזיכרון הגרפי)…" (no longer N3) | `context-lost · <GPU>` | "לנסות שוב בתלת־ממד" |
| player chose מצב קל | 2d | none (silent, correct) | — | — |

Every notice matches its cause, and `noticeFor` returns silence for an unknown reason (it never gives a wrong diagnosis).

## Pinned engine, saves, vendor

- **Pinned files untouched:** `git diff f0e8d4d 4b890fa` is empty for `js/engine.js`, `js/worlds`, `js/systems`, `js/finance`,
  `js/life.js`, `js/rng.js`, `js/data`, `js/practice.js`, `js/history.js`, `js/achievements.js`, `js/saves.js`,
  `verify-result`, `supabase`. `build-edge --check` ✓.
- **Saves:** `SAVE_VERSION = 4` in both commits. No new `S.ui` key. `S.ui.weddingAge` existed before; it is now set earlier in
  `syncLifeCity` (display only, A2 G-09). saves.test passes 105 of 105.
- **three.js:** `vendor/three/VERSION` says 0.170.0. I compared sha256 against `npm pack three@0.170.0`:
  `build/three.module.min.js`, `OrbitControls.js`, `GLTFLoader.js`, `RoomEnvironment.js`, `BufferGeometryUtils.js` and `LICENSE`
  are byte-identical. `three.module.min.js` r170 has no imports of its own. The addons import only bare `three` (importmap) and
  `../utils/BufferGeometryUtils.js` (vendored).
- **Fonts:** the 4 woff2 files are byte-identical to `@fontsource-variable/rubik@5.3.0` and `@fontsource/secular-one@5.3.0`. The
  OFL texts match the packages' LICENSE files. `ATTRIBUTION.md` lists three (MIT), the fonts (OFL), axe (MPL, test-only) and the
  in-house assets.
- **Import map:** paths are relative (`./vendor/three/...`) and work under `/rat-race-game/` (see the subpath probe). No CDN or
  Google Fonts reference is left in shipped files. Only the test stub `tests/stubs/index.html` still links Google Fonts, and it
  is not shipped.

## Answers to BRIEF §23

| Question | Answer and evidence |
|---|---|
| **Is it clear what to do at every moment?** | Mostly yes: the turn chip ("זורקים…" → "זזים N צעדים" → "נחתת על …"), the destination mark before the first hop, the current-tile mark, the tile sheet with "עוד N צעדים / אתה כאן", the tile list, and "מבט ראשי". The exception is MAJOR-1: the list can sit on top of the landing card. |
| **Does every visual change reflect real data?** | City: yes. scene keys == `cityModels` (+`L:*`) after every decision (board_ux, 3D/2D × 3 sizes), after resize/orientation flips, after lite switches (also mid-hop), and a forced drift is repaired. Markers: yes. The marker and pawn tile equal the engine `S.pos` after landing, after the watchdog, after a hidden tab and after flips. Life markers have a distinct base and heart, and landmarks sit on stone pedestals, not owned plinths. **Tile descriptions: partly false** (MAJOR-2). The empty state hides on life-only markers (NIT-1). Reconcile can pre-empt an exit animation (MINOR-3). |
| **Does the 3D improve understanding and enjoyment?** | Not measurable with tests. The before/after shots (`docs/3d-upgrade/shots/wave1`) and mine show readable short names (no "…"), a clear destination, and an intentional empty centre. This needs a real-player look (not done here: no physical device or GPU). |
| **Do the numbers stay readable?** | Wave 1 did not touch the HUD numbers. The new texts with numbers ("זזים 5 צעדים", "עוד 36 צעדים", "משבצת 12") read in the right order. The technical line isolates its Latin text (U+2066/2069). HUD readability is team ד's (wave 2). |
| **Can you play in מצב קל?** | Yes. game_e2e 2D 12 turns PASS; fallback_probe 16 of 16 (each cause gives a usable 2D board in 2.5–23 s); 2D tile buttons + keyboard; axe clean. |
| **Does any action get stuck?** | None found. Checked: the stalled-loop watchdog (3D), a hidden tab mid-hop (3D and 2D), 6 orientation flips mid-move, 3D→2D mid-hop ×2 and with an open card, double roll ×3, and stability_e2e 125 of 125. The near miss is MAJOR-1: not stuck, but keyboard focus is trapped under the list. |
| **Were the previous features kept?** | Yes as far as tested: every required suite passes with 0 errors (game_e2e, stability, t5_render, t6, a11y --strict, lobby_real, tier 0/1 node). Engine pinned. Saves unchanged. |
| **Was the performance improvement measured?** | Not in wave 1, and wave 1 makes no performance claims. The bundle changed: three is now the vendored **min** build, served same-origin, and fonts are self-hosted. Neither was measured before/after (left to wave 3 / team ו). t6's perf note: long tasks max 956 ms at load about 8 (swiftshader). |
| **Are there claims in the report without evidence?** | No wave-1 report was written; I checked code comments, commit messages and PLAN.md. Three claims are not borne out: (1) "The descriptions follow what engine.landing() / describe() actually do" (`tiles.js:3-4`) is partly false (MAJOR-2). (2) "engine spawns keep their animation" (`game.js:452`) is not true mid-roll (MINOR-3). (3) PLAN.md gives B1 G11 to team ב, and it was not delivered (MINOR-4). The other claims I checked hold: per-cause notices, vendored files identical to npm, relative paths working under the subpath, the watchdog, orbit kept across resize, "מבט ראשי", no camera gestures under a dialog. |

## Not checked here

- A physical phone, a real GPU, a screen reader (NVDA/VoiceOver).
- Live staging.
- game_e2e w2–w4 (only w1 was required).
- Reduced-motion visuals of the new markers (checked by reading the code: the arrow is static and the 2D destination is not
  animated under reduced motion, both in CSS and in `markStep`).
- Sale → city in a real game (only drift repair was checked).
- The bailout/burnout payload loss of a mid-hop lite switch (MINOR-4) was not checked by observation.
