# T5 — Living city & visual identity (spec)

Status: ready to implement after T1 merges · Branch `feat/rat-race-next-level` · Brief §10 (plus the §18 performance items that belong to rendering).
Inputs: `research/ux.md` (**UX§n**), `research/engine-robustness.md` (**R§n**), `specs/T1-stability-saves.md` (**T1§n**), `specs/T3-stories-business.md` (**T3§n**), `research/content.md`, `TASK_BOARD.md`.
Line numbers drift. T1 is being implemented while this spec is written (`js/render/*`, `js/flags.js` and `js/saves.js` exist, and `scene.js`/`game.js` are modified). Code is cited **by function name**. Where a line is quoted, search for the quoted text.
Priority tags: **P0** must ship · **P1** should ship in the same wave · **P2** may be cut, and if cut must be listed as cut.

---

## 0. Scope, principles, dependencies

### 0.1 What T5 delivers
1. **One visual language.** Tokens for colour, type, spacing, radii and motion, plus icon rules. They keep today's warm board-game look (cream paper, gold CTAs, Secular One titles, Rubik body). Hues stay; only luminance changes where contrast fails. No generic dark redesign.
2. **World identity.** Every world gets a fixed identity sheet (§3), used the same way in 3D, in 2D and in the UI chrome.
3. **Feedback moments** for purchase, progress, world unlock, achievement and business level-up. Motion is ≤ 600 ms. Each moment has turbo and reduced-motion variants, and one overlay queue means nothing piles up (§4).
4. **The city reflects game state:**
   - every owned asset stands on an "owned" plinth;
   - managed businesses show growth stages 0–3, using T3's data;
   - upgrades change the look;
   - activity badges show what is going on (§5).
5. **Tap an asset to see its info**, in 3D (raycast) and in 2D (buttons). The DOM alternative is the financial sheet (§6).
6. **Reduced motion and mute** in 3D, 2D and DOM, with an in-app setting that overrides the OS (§7).
7. **Performance for weak devices:**
   - quality tiers and a pixel-ratio cap;
   - fewer draw calls (from 304 to ≤ 130 for a 24-asset city);
   - pausing while the page is hidden;
   - disposing models on world change;
   - a measurement method (§8).
8. **Asset plan:** no new GLB files at P0. The stage kit is procedural, from shared, instanced geometry (§9).

### 0.2 Principles (hard rules)
- **R-1 Renderers only draw.** No game rule lives in `scene.js` or `board2d.js`. Levels, stages and activity come from the engine (`cityModels`, `metrics`) through `game.js`. Neither renderer imports `engine.js` for logic (board2d keeps only `E.boardInfo`, T1§0 rule 1).
- **R-2 The two renderers stay coherent.** Every new visual concept goes through one shared, DOM-free and three-free data module, `js/render/vocab.js` (§10.1), and one shared API extension (§10.2). Every function exists in `scene.js`, `board2d.js` and `null.js`. A Node test checks parity (A-44).
- **R-3 Never block the turn on decoration.** Only dice and hops are awaited, and they have a hard budget (§4.3). Everything else is fire-and-forget. Tapping the board finishes running turn animations (`skip()`).
- **R-4 No engine outcome changes.** T5 adds no RNG draw, state field or action code. It needs no verify re-pin by itself. Its only engine needs are T3's already-specified outputs (§5.1).
- **R-5 No images of text.** Hebrew is always real DOM text or runtime canvas text drawn with Rubik (as today). New textures carry icons only.
- **R-6 Supabase is never touched by tests.** Every browser test routes `**/*.supabase.co/**` to abort or a mock, as UX§0 did.

### 0.3 Dependencies
| Needs | From | If it is missing |
|---|---|---|
| T1 merged: renderer selection, `board2d.js`, `null.js` `SCENE_API`, `scene.dispose`, GLB timeout | T1 (shell lane) | T5 does not start the rendering lane. Token and lobby work (U1, L1) can start in parallel |
| `cityModels()` biz entries with `stage` and `activity`; effects `bizStage` and `bizPulse`; `summary().stage` | T3§6.8 (engine lane, after T2) | Graceful degradation: business items show the plinth and no stage kit or pips (A-16). A dev fixture (§13) drives the visuals for tests |
| Overlay holds from the coach (`ui.holdFeedback`) | T4 (coach and onboarding) | T5's queue still works. The coach just isn't treated as a hold |

---

## 1. Baseline (measured on this tree)

### 1.1 Draw calls and triangles [OBSERVED]
**Method.**
- Real copy (`tests/make_realcopy.sh`) served on localhost, with three served locally.
- Chromium with swiftshader (the `game_e2e.py` args), `?hq` so `lowPower=false`, and Supabase and Google Fonts routed to abort.
- After boot, the page imports `/js/scene.js` (the same module instance game.js uses) and hides `#start`. It then:
  - calls `setPaused(false)` and `setCameraMode('overview')`;
  - spawns N silent items cycling `apartment, business, stock, crypto`;
  - waits 1.5 s, then reads `scene.renderStats()`.

`calls` = `renderer.info.render.calls` (main pass, as three reports it).

| w1, overview, 1300×820 | calls | triangles | meshes | geometries | textures |
|---|---|---|---|---|---|
| empty city | 124 | 22,452 | 123 | 46 | 14 |
| 12 items | 214 | 67,314 | 213 | 46 | 14 |
| 24 items | **304** | **112,176** | 303 | 46 | 14 |

Phone 390×844 at DPR 3 gives the same calls: the pixel ratio is capped at 1.75 on coarse pointers. **Follow** camera, 24 items: 85 calls, because of frustum culling.

**Why the counts are high [CODE]:**
- **Board tiles.** `buildWorld` creates **two meshes per tile** (frame + face). That is 80 calls on a 40-tile board.
- **City models.** Each GLB is one joined mesh with **one primitive per material**, so 6–17 calls per city item. Measured +7.5 calls per item.

Per-GLB numbers (from the GLB JSON):

| GLB group | KB each | triangles | primitives (= calls per instance) |
|---|---|---|---|
| w1 apartment / business / stock / crypto | 321 / 206 / 215 / 291 | 4.6k / 2.9k / 3.1k / 4.3k | 9 / 9 / 6 / 6 |
| w2 tower / mall / hotel / bank | 306 / 247 / 405 / 372 | 5.6k / 4.9k / 8.0k / 7.5k | 12 / 12 / 16 / 10 |
| w3 ship / warehouse / factory / gold | 212 / 343 / 311 / 409 | 3.9k / 7.1k / 5.7k / 8.0k | 15 / 14 / 17 / 9 |
| w4 campus / datacenter / rocket / foundation | 247 / 303 / 220 / 219 | 4.6k / 5.8k / 4.1k / 4.0k | 10 / 9 / 8 / 10 |
| life (7) + history (2) | 255–419 | 4.6k–7.9k | 11–20 |

Total GLB weight: **9.3 MB**. The 7 PNG cards add 2.0 MB. The GLBs are not quantized: about 70 bytes per triangle.

Only `w1`, `life`, `history` and `hand_die` have Blender build scripts in `blender/`. **The w2–w4 and pawn GLBs cannot be rebuilt from the repo.** This is why draw-call reduction happens at load time (§8.3), not in Blender.

### 1.2 Other findings that shape this spec [CODE]
- **Shadows.** `scene.init` turns shadows on for every device. The map is 2048 (1536 on coarse pointers, 1024 when lowPower).
- **Pixel ratio.** The DPR is 0.6 for software renderers, else min(dpr, 1.75 coarse / 2 fine). There is no middle tier.
- **No pause when hidden.** There is no `visibilitychange` handling in `scene.js`. The `setAnimationLoop` callback keeps running and returns early, and audio keeps its context.
- **GLB cache.** The cache (`cache`/`ready` Maps) keeps every world's models forever. A w1→w2→w3 session holds all three sets.
- **History world.** It adds a full-screen CSS `filter:sepia()` on the WebGL canvas (`css/game.css` `body[data-world=h] canvas#c`). This is an extra compositing pass on weak GPUs.
- **Reduced motion in 3D.** `scene.js` never reads reduced motion (UX§1 §10). `board2d.js` reads only the OS media query.
- **Existing feedback lengths.** These are all over 600 ms:

  | Effect | Today |
  |---|---|
  | `spawn` drop | 720 ms |
  | `floatLabel` | 1900 × 1.2 ms |
  | `sparkle` | 1400 ms |
  | `confetti` | 5200 ms |
  | `celebrate` | 1500 ms (awaited) |
  | achievement card | 3300 ms hold |
  | `throwDice` | ~1.7 s (awaited) |

---

## 2. Design tokens (P0, in-game UI lane: `css/game.css` `:root`; lobby reuses them)

### 2.1 Colour: text and semantic tokens, with measured WCAG contrast
Contrast is computed with the WCAG 2.x formula on the three light surfaces `--paper #fffaf0`, `--paper2 #f6eedd` and `--paper3 #efe4cd`, and the three dark surfaces `#1f1b27`, `#2a2533` and `#352f40`. **The worst surface counts.**

| Token | Light (old → **new**) | Light contrast paper / paper2 / paper3 | Dark (old → **new**) | Dark contrast (worst) | Use |
|---|---|---|---|---|---|
| `--ink` | #1d1a2b (keep) | 16.35 / 14.73 / 13.48 | #f3eee4 (keep) | 11.13 | body text |
| `--mut` | #6b6478 → **#5f586c** | 6.51 / 5.87 / 5.37 (old 4.48 ✗ on paper3) | #aaa3b6 → **#b3acbf** | 5.86 | secondary text |
| `--green` | #178a55 → **#13744a** | 5.57 / 5.02 / 4.59 | #3ccf8a (keep) | 6.42 | gains, positive numbers |
| `--red` | #d23b30 → **#b8322a** | 5.72 / 5.16 / 4.72 | #ff7a6e (keep) | 5.06 | losses, negative numbers |
| `--blue` | #2f6fdb → **#2459b8** | 6.32 / 5.69 / 5.21 | #7aa7ff → **#8ab2ff** | 6.06 | links, info |
| `--pink` | #c0266d → **#be185d** | 5.80 / 5.23 / 4.79 | #ff7ab8 → **#ff8cc2** | 5.99 | impact (w4) |
| **`--gold-text`** (new) | **#8a5a00** | 5.70 / 5.13 / 4.70 | #f2b632 | 7.05 | gold-coloured *text*: kickers, "המשימה הבאה", ranks, star-threshold text, achievement `small` |
| `--gold` | #f2b632 (keep) | — fill only | same | — | CTA fill, earned star fill, pips |
| `--gold2` | #c98a12 (keep) | 2.83: **fill and border only, never text** | same | — | CTA 3D edge, borders |
| `--gold-ink` | #2b1d00 (keep) | 9.01 on #f2b632 | same | — | text on gold |
| **`--focus`** (new) | #2f6fdb | ≥ 3.77 (non-text 3:1 ✓) | #7aa7ff | 5.39 | focus outline (decoupled from `--blue`) |

**White-on-colour tags and badges** (must be ≥ 4.5):

| Badge | Old → new | Contrast |
|---|---|---|
| title badge t0 | #8a8396 → **#6f687c** | 5.32 |
| opportunity tag | #1f9d63 → **#157a4b** | 5.36 |
| bad tag | #d23b30 → **#b8322a** | 5.95 |
| burnout `#b45309` | already passes | 5.02 |

**3D/2D float-label colours** (`COLORS` in `scene.js` and `board2d.js`, drawn on a #fffaf0 pill):

| Colour | Value | Contrast |
|---|---|---|
| green | #13744a | 5.57 |
| red | #b8322a | 5.72 |
| blue | #2459b8 | 6.32 |
| gold | #8a5a00 (was #a8740a, 3.91 ✗) | 5.70 |
| impact pink | #be185d (was #db2777, 4.42 ✗) | 5.80 |

These live in `vocab.js` `LABEL_COLORS`, the single source for both renderers.

**Stars and pips (non-text, need ≥ 3:1).** Shape carries the state: an earned star is a filled ★, an unearned star is an outline ☆.
- Earned star: fill `--gold` with a 1.5 px `--gold-text` stroke (stroke 4.70 on paper3).
- Unearned star: outline in `--mut` (5.37).
- Old empty star #dccfb5 (1.33) is removed.

**World accent tokens.** `--accent` is a fill only. The new **`--accent-ink`** is a text-safe variant, set by `ui.applyTheme` from §3:

| World | Light | Dark |
|---|---|---|
| w1 | #8a5a00 (4.70) | #f2b632 (7.05) |
| w2 | #9d1784 (5.76) | #ff4fd8 (4.51) |
| w3 | #0b5f78 (5.70) | #38bdf8 (6.01) |
| w4 | #6d28d9 (5.63) | #22d3ee (9.34) |
| h | #7a5520 (5.29) | #c8a24a (5.34) |

Text on an accent *fill* uses `--ink` #1d1a2b. It is ≥ 5.96 on every world accent except h #a8763e (4.31). For h, the fill becomes `#c8a24a` (7.06).

### 2.2 Typography
**Fonts.**
- Titles: **Secular One**.
- Body and **all numbers and currency**: **Rubik** (400/500/700/800).
- Fallback: `system-ui, "Segoe UI", Arial`.

**The ₪ rule (P0).** Secular One draws ₪ like "שח" (UX§2.7).
- **Money, numbers and % are always wrapped in `.num`.** `.num` gets `font-family: var(--font)` (Rubik) and keeps `direction:ltr; unicode-bidi:isolate; tabular-nums`.
- This applies inside titles too (`h1 .num`, `h2 .num`, `.end-title .num`, `.banner .num`, event-card `h2`).
- Text produced by the engine with an embedded ₪ (e.g. `"MOON נסחר ב־₪1"`) goes through `ui.iso()`. That function already wraps signed numbers; T5 extends it so **every** `₪`/`$`-number token becomes `<span class="num">`.
- A DOM scan test enforces the rule (A-5).
- **P2:** self-host the fonts (OFL, `assets/fonts/` + LICENSE). Use a `unicode-range` for the title face that excludes U+20AA, so ₪ falls back to Rubik automatically. Also load "Frank Ruhl Libre" for the history world: today it is referenced in `game.css` but never loaded, so it falls back.

**Scale** (rem, so OS text scaling works; 1 rem = 16 px). New tokens: `--fs-*`.

| Token | Size | Line height | Font / weight | Use |
|---|---|---|---|---|
| `--fs-cap` | 0.75 rem (12) | 1.3 | Rubik 700 | HUD labels, tags, captions. **Minimum size anywhere** |
| `--fs-sm` | 0.875 rem (14) | 1.4 | Rubik 500/700 | chips, notes, secondary rows |
| `--fs-md` | 1 rem (16) | 1.5 | Rubik 400 | body, card text |
| `--fs-lg` | 1.1875 rem (19) | 1.25 | Rubik 800, tabular | key numbers (HUD cash, card numbers block) |
| `--fs-xl` | 1.4375 rem (23) | 1.15 | Secular One | card and modal titles |
| `--fs-2xl` | 1.75 rem (28) | 1.1 | Secular One | section heads, level-up card name |
| `--fs-3xl` | clamp(2rem, 6vw, 2.75rem) | 1.05 | Secular One | screen titles (lobby) |
| `--fs-display` | clamp(2.375rem, 8vw, 3.375rem) | 1.02 | Secular One | end title, world banner |

**Hierarchy rules:**
- one Secular One element per card or modal (the title);
- numbers are always Rubik 800, never Secular One;
- labels are `--fs-cap` in `--mut`.

**Rollout:**
- **P0:** define the tokens, and raise every 10 px and 11 px declaration to `--fs-cap` (UX§1: 16×11 px and 3×10 px).
- **P1:** replace the px font sizes in `game.css` (123) and `lobby.css` (179) with tokens.

**Mixing ₪, $, numbers and % (keep the current system, UX§1 "exists, good"):**
- ₪ before the number, no space: `₪1,234`.
- Negative: U+2212 `−₪826`.
- Deltas are always signed: `+₪450`, `−₪120`.
- `$1,234`; `4.5%`; ranges `₪3,000–₪5,000` (en dash); "פי 1.5".
- Units after the number in Hebrew: `12 חודשים`.
- Compact HUD money (`₪16.6K`) keeps an `aria-label` with the full value.

### 2.3 Spacing, radii, elevation, layers
- **Spacing:**

  | Token | `--sp-1` | `--sp-2` | `--sp-3` | `--sp-4` | `--sp-5` | `--sp-6` | `--sp-7` |
  |---|---|---|---|---|---|---|---|
  | px | 4 | 8 | 12 | 16 | 24 | 32 | 48 |

  New and edited rules use only these.
- **Radii:**

  | Token | Value | Use |
  |---|---|---|
  | `--r-xs` | 6 | badges, pips |
  | `--r-sm` | 10 | inputs |
  | `--r-md` | 12 | buttons, existing |
  | `--r-lg` | 18 | cards (= `--radius`) |
  | `--r-xl` | 24 | sheets, overlays |
  | `--r-pill` | 999 | |
- **Elevation:** `--shadow-s` and `--shadow` (existing), plus `--shadow-l: 0 14px 40px rgba(40,20,0,.28)` for the celebratory slot.
- **Layers** (document the existing z-indexes as tokens, with no behaviour change):

  | Layer | z-index |
  |---|---|
  | board | 0 |
  | banner | 4 |
  | HUD | 20 |
  | toast | 35 |
  | celebratory slot | 40 |
  | modal | 50 |
  | coach | 55 |
  | recover bar (T1) | 60 |
  | loading | 100 |

### 2.4 Motion tokens
| CSS var | JS (`vocab.js` `MOTION`) | Value | Use |
|---|---|---|---|
| `--dur-1` | `t1` | 120 ms | fades, reduced-motion swaps |
| `--dur-2` | `t2` | 200 ms | presses, small pops |
| `--dur-3` | `t3` | 350 ms | slide-ins, meter fills |
| `--dur-4` | `t4` | 480 ms | drops, level-up pulse |
| `--dur-max` | `tmax` | 600 ms | **ceiling for any feedback motion** |
| `--ease-out` | `easeOut` | cubic-bezier(.2,.8,.2,1) | default |
| `--ease-pop` | `easePop` | cubic-bezier(.2,1.4,.4,1) | celebratory pops |

**Holds** (time a readable item stays on screen) are not motion. They never block input and are listed separately (§4.2).

**Turbo** multiplies motion **and** holds by `speed` (0.5).

### 2.5 Icons and non-colour cues
**Icon rules:**
1. **Functional icons are SVG** from the `ICON` set in `ui.js`. That covers HUD tools, money direction, stars, lock, level pips, inspect, close, warning, check and info. Each icon:
   - uses a 24×24 viewBox;
   - is drawn with `currentColor`, either a 2 px stroke with round caps or a solid fill;
   - renders at 20 px minimum;
   - is `aria-hidden`, and its button carries `aria-label`.

   New icons (P0): `star`, `starOutline`, `lock`, `unlock`, `check`, `alert`, `info`, `pip`, `pipEmpty`, `inspect`, `city`.

   P1: replace the life-chip emoji with SVG for 🎂🔋🙂🏦🛒🛟 and the plan icon. `📅` is **removed** now, because it renders as English "July 17" (UX§1).
2. **Emoji are flavour only.** That means characters, achievements, lesson categories and 2D city glyphs. An emoji is never the only label: it always sits next to text, or next to an `aria-label`/`sr` text.
3. **One meaning, one icon.** The same icon is used in HUD, sheet, cards, 2D board and 3D badges. 3D badges are drawn from the SVG paths into the shared icon atlas (§9.2).

**Non-colour cue table (P0, each row testable):**
| Meaning | Colour | Required non-colour cue |
|---|---|---|
| Money gain / loss | green / red | Explicit `+`/`−` sign. Deltas also carry the `up`/`down` arrow icon |
| Star earned / not earned | gold / mut | Filled ★ vs outline ☆ shape, plus `aria-label="{n} כוכבים מתוך 3"` |
| Recommended option | gold button | Text tag (T2 owns when it shows: only `o.primary`) |
| Locked world / lesson | grey | `lock` icon plus the word "נעול" |
| Business stage / asset upgrade | gold pips | Filled pip vs hollow ring, plus the text "שלב 2 מתוך 3 · צומח" |
| Business in trouble / down a stage | red | `alert` triangle badge (shape), plus text in the toast and in the info modal |
| Toast kind good / bad | gold / grey | Leading icon (`check`/star vs `alert`) |
| Energy low | warn colour | Bar length plus number (exists) |
| Owned asset (3D) | — | A physical model on an "owned" plinth |
| Hedged / insured | blue | `shield` icon plus text (exists) |
| Activity (busy, event) | — | Icon badge (§5.3), with text in the info modal |

---

## 3. World identity (P0 data in `vocab.js`; CSS per `body[data-world]`)

The theme values below are today's (`js/worlds/w*.js` `theme`). T5 freezes them as the identity and adds `accentInk`, the 2D motif, the caption and the city mood. **No world changes its sky or board colours.**

| | **w1 · השכונה** | **w2 · העיר הגדולה** | **w3 · הנמל הגלובלי** | **w4 · עמק העתיד** | **h · מכונת הזמן** |
|---|---|---|---|---|---|
| Mood / time | late afternoon, warm | dusk, neon | bright noon by the sea | night, aurora, glass | sepia newspaper |
| Sky (`--sky1→--sky2`) | #ffd9a0 → #ff9f7a | #1e2a4a → #ff7e67 | #7dd3fc → #e0f2fe | #050816 → #1b1f4b | #efe2c4 → #c9b089 |
| Board / edge | #f6efe2 / #6b4430 | #3b4252 / #1f2433 + neon trim | sand planks #e9d5a8 / #8b5e34 | glass #e8f1ff / #94a3b8 | #efe4c8 / #5b4127 |
| Decor (3D) | trees, plaza | skyline, road, lamp posts | sea, crane, containers | stars, turbines, aurora | clock tower, plaza |
| City models (re / biz / holding) | apartment / business / stock, crypto | tower, mall, hotel / mall / bank | ship, warehouse, factory / warehouse / gold | datacenter, campus / campus / rocket (angel), foundation | = w1 |
| `--accent` (fill) | #f2b632 | #ff4fd8 (+#22d3ee) | #0ea5e9 | #22d3ee (+#a78bfa) | #c8a24a (was #a8763e) |
| `--accent-ink` light / dark | #8a5a00 / #f2b632 | #9d1784 / #ff4fd8 | #0b5f78 / #38bdf8 | #6d28d9 / #22d3ee | #7a5520 / #c8a24a |
| Plinth rim (3D "owned") | gold #f2b632 | magenta emissive #ff4fd8 | sea blue #0ea5e9 | cyan emissive #22d3ee | brass #c8a24a |
| 2D motif (CSS gradients only, no images) | dotted paper | thin neon grid lines | wave stripes | star dots | newsprint rules |
| Centre caption | התיק שלך | העיר שלך | הנמל שלך | העמק שלך | התיק שלך |
| World-name font in HUD | Secular One | Secular One | Secular One | Secular One | serif stack `"Frank Ruhl Libre","David",serif` (P2: load it) |
| History canvas sepia | — | — | — | — | CSS filter at high/mid only; **off at low** (the theme colours are already sepia) |

**Rule:** the board colours belong to the theme. UI chrome (cards, sheet, HUD) stays on paper surfaces in every world, so text contrast is one problem and not five. Worlds differ through the sky, board, decor, accent, plinth rim and 2D motif.

### 3.1 Character identity (P0 data in `vocab.js` `CHAR_STYLE`; lobby and HUD)
Each character gets a **portrait token**: a 48 px circle filled with the character colour, the existing `CHAR_ICON` emoji centred at 26 px, and a 3 px ring in the world `--accent`.

It shows in four places:
- the character-select card;
- 24 px in the HUD world card, next to the world name;
- the end screen hero;
- the 3D/2D **pawn ring colour**, which becomes the character colour. This links the pawn to the character without overriding the pawn shape the player chose.

Colours are distinct within each world's select screen:

| World | Character → colour |
|---|---|
| w1 | teacher #d9485f · driver #3a7bd5 · dev #7b5cd6 · doctor #1f9d8a |
| w2 | lawyer #4b5563 · chef #e8833a · pm #2a9df4 |
| w3 | importer #c2410c · exporter #4d7c0f · captain #0e7490 |
| w4 | founder #db2777 · engineer #64748b · social #16a34a |
| h | the chosen scenario's character colour, or #a8763e |

P2: SVG portraits instead of emoji.

---

## 4. Feedback moments

### 4.1 Moments (P0 unless marked)
"3D" means `scene.js`, "2D" means `board2d.js`, "DOM" means `ui.js`/`lobby.js`. Motion durations are at normal speed. Turbo = ×0.5. **Reduced** = the reduced-motion variant (§7).

| Moment (trigger) | 3D | 2D | DOM | Sound / haptic | Motion | Hold | Reduced variant |
|---|---|---|---|---|---|---|---|
| **Purchase** (`out.spawn`) | Drop with bounce, 480 ms (was 720). Dust 400 ms. Plinth rim lights up 300 ms. Float label `-₪X`/name rises 600 ms | Card drop 480 ms, then label | Coins fly to cash 500 ms (exists, shortened). HUD cash count-up 400 ms | `buy`, 14 ms vibrate | ≤ 600 | label 1.2 s | Item fades and scales 0.9→1 in 120 ms. No dust, no coins: the cash pill pulses its outline 120 ms. Label is static |
| **Progress: cash flow / freedom meter up** (`render` after `applyOut`) | — | — | `#hGoal` fill 350 ms. At 25/50/75 %: notch fills, plus a toast (C channel, §4.2) once per game per milestone | `coin` at milestones | 350 | toast | Fill jumps. Toast unchanged |
| **Business level-up** (`bizStage` up, or `upgrade` effect) | `setLevel(key, lvl, {animate:true})`: model pulse 450 ms (`bump` shortened), new kit parts pop in staggered 3 × 120 ms, pips fill 200 ms, sparkle 600 ms at 40 % count | Card pulse 450 ms, pips fill, border style changes | Celebratory card (B channel): pips icon, "העסק התקדם!" / name / "שלב n מתוך 3 · label" | `unlock`, vibrate [12,40,18] | ≤ 600 | 2.6 s | Instant swap of kit and pips, plus a 120 ms fade. No sparkle. The card fades in |
| **Business level-down** (`bizStage` down) | Kit part removed with a 200 ms fade. `alert` badge 1.5 s | Same, with the border | Toast, `bad` kind, `alert` icon (§12) | `loss` (soft) | 200 | toast | Instant |
| **Business pulse** (`bizPulse`, ≤ 1 per business per payday, T3 UI-9) | Bob 300 ms, plus an `up`/`down` arrow badge above the item | Arrow badge | (the T3 UI-4 business toast already reports the numbers) | none | 300 | badge 1.2 s | Badge only |
| **Achievement** (`bus 'achievement'`) | — | — | B-channel card: slide-in 350 ms (was 450), medal pop 400 ms (was 1200) | `achievement`, vibrate | ≤ 400 | 2.6 s (was 3.3) | Fade 120 ms, no pop |
| **World unlock** (lobby end screen, map) | — | — | End screen `end-unlock`: lock→unlock icon morph 250 ms, card scale 0.96→1 plus colour reveal 350 ms. Map: the newly unlocked card shows a "חדש" badge and a one-time 600 ms glow ring the first time the map opens after the unlock (`localStorage 'rr2-seen-unlock'`). The world path becomes solid up to the newest world | `unlock` once | ≤ 600 | — | Static unlocked state, badge kept |
| **World entry** (first game ever in a world) | `introWorld()`: camera from overview to follow, 600 ms, **not awaited**, input enabled | Board fade-in 200 ms | `worldBanner(w, 'עולם חדש נפתח')`: in 450 ms / out 350 ms (was 700/600), hold 1.6 s | `unlock` | 600 | 1.6 s | No camera move. Banner fades |
| **Loss card** (`effects.shake`, crisis/bailout/burnout) | `shake` 300 ms amp 0.25 (was 520 / 0.4) | Jitter 300 ms | HUD cash outline flashes 300 ms, and the number shows `−` | `loss`, vibrate | 300 | — | **No shake.** Cash outline flash only (opacity, 120 ms) |
| **Golden / sparkle** (`effects.sparkle`) | sparkle 600 ms (was 1400), 60 % count | ✨ burst 600 ms | — | `golden` | 600 | — | Static star badge, 800 ms hold |
| **Win** (`game:end`) | `celebrate` ≤ 1200 ms (was 1500), awaited once per game, tap to skip. Confetti ≤ 2400 ms (was 5200), decorative, never awaited; off at the low tier | 40-span confetti 2400 ms | End screen | `win` | exception, see below | — | No camera move, no confetti. `celebrate` resolves at once |

**Exceptions to the 600 ms ceiling** (listed in `vocab.js` `MOTION_EXCEPTIONS`; a unit test fails on any other entry over 600):
- dice ≤ 1200 ms;
- `celebrate` ≤ 1200 ms (once per game);
- confetti ≤ 2400 ms (decorative, not awaited);
- hops (budget in §4.3).

### 4.2 One overlay queue (P0, in-game UI lane, `ui.feedback()`)
This replaces the independent `toast()`, `achievementToast()`, `lessonToast()` and `verdict()` timers. Their signatures stay as thin wrappers, so existing callers keep working. It fixes UX§4 #2.

**Channels:**
- **A Blocking:** event card, `#gm` modal, coach (T4), recover bar (T1). Not queued here; A only *holds* other channels.
- **B Celebratory slot** `#achv`: achievement, level-up, world entry.
- **C Info pill** `#toast`: news, business toast, milestones, governor notice.
- **D Verdict badge** `#verdict`.
- **E In-world labels** (3D/2D `floatLabel`). Not queued. Concurrency is capped per tier (§8.1).

**Rules:**
1. On phones (≤ 600 px wide), **at most one** of B/C/D is visible at a time. On wider screens, at most B + one of C/D.
2. While a **coach** bubble or the **recover bar** is open, B, C and D are held. While an **event card** is open on a phone, B and C are held. Toasts with an action button and D are exempt: the verdict appears inside the card when `inCard`.
3. Priority when released: B level-up / world entry > B achievement > C bad > C lesson > C other > D.
4. Holds:
   - C uses the existing length formula, × 0.75 when more are queued;
   - B = 2.6 s;
   - D = 2.2 s;
   - all × `speed` in turbo.
5. Coalescing: two business toasts on the same payday become one ("🏪 2 עסקים: …"). Identical consecutive C texts are dropped.
6. Max queue length 6. The oldest C items are dropped first; B is never dropped.
7. API:
   - `ui.feedback(kind, payload)` with kind ∈ `levelUp | levelDown | achievement | worldEntry | milestone | toast | lesson | verdict`;
   - `ui.holdFeedback(bool)`, for T4's coach;
   - `ui.flushFeedback()`, called on lobby open and new game.
8. Reduced motion: slides become 120 ms fades. Holds are unchanged.

### 4.3 Turn animation budget and skip (P0, rendering lane + one shell hook)
| Step (awaited by `game.js` `turn()`) | Normal | Turbo | Reduced |
|---|---|---|---|
| `throwDice` | ≤ 1200 ms (was ~1700). Hand arc compressed; bounces at 50 % / 72 % | ≤ 600 | ≤ 200: dice appear already showing their faces, 150 ms fade; the hand is skipped |
| `hop` per tile | 160 ms + 90 ms squash on the last (was 190 + 110) | 80 + 45 | Teleport: 80 ms fade-out, 120 ms fade-in at the target. The **tiles passed get a 300 ms glow**, so passing payday stays visible. Total ≤ 300 ms per move, not per tile |
| **Total, roll → card, 7-tile move** | ≤ 2.6 s | ≤ 1.4 s | ≤ 0.6 s |

**Measurement.** The total is the **sum of requested awaited durations**: `scene.perfStats().lastTurnMs`, a counter incremented by `throwDice`/`hop`. It is deterministic, unlike swiftshader wall-clock.

**Skip.**
- `scene.skip()` resolves every running awaited tween at its end state. `board2d.skip()` finishes WAAPI animations.
- Shell hook **G-6**: a `pointerdown` on `#c`/`#board2d`, or Space/Enter, while `busy && rolling` calls `scene.skip()`.

---

## 5. Living city: levels, stages, activity

### 5.1 Data (engine lane, already specified by T3; T5 consumes only)
- **IR-T5-1 (dependency, = T3§6.8 as written):**
  - `cityModels(st)` biz entries carry `stage` (0–3, with hysteresis) and `activity` (`{busy, event, stockout, …}`);
  - effects `{type:'bizStage', at, from, to}` and `{type:'bizPulse', at, kind:'good'|'bad'|'event', amount}`;
  - `metrics().businesses[i].stage`.

  Stage names follow T3: **0 "התחלה" · 1 "יציב" · 2 "צומח" · 3 "מותג"**. `vocab.js` copies the labels. A test asserts they match the T3 export (`business.js` `STAGE_NAMES`, if exported), or the strings in this spec.
- **IR-T5-2 (optional, nice to have):** `cityModels` biz entries carry `bizType` (archetype id). Without it, `game.js` joins `metrics().businesses[].type` by `assetId` (G-2). No re-pin is needed on T5's account.
- **Upgrades** (w2 `upgrade` tile, `a.ups` 0..`world.upgrade.max`) need **no engine change**. `game.js` joins `metrics().assets[].upgrades` with `W.upgrade.max`.

**The `level` object `game.js` passes to the renderers** (built in G-2, so renderers never derive rules):
```js
level = { kind: 'biz', n: 0..3, of: 3, label: 'צומח', type: 'coffee', activity: { busy, event } | null }
      | { kind: 'upgrade', n: ups, of: upgrade.max, label: 'שדרוגים: 1 מתוך 2' }
      | null                                   // every other asset: plinth only
```

### 5.2 3D presentation (rendering lane, `scene.js`; procedural, instanced)
**Every city item stands on an "owned" plinth.** This is a rounded slab (r = 1.05 × slot, h 0.08, 24 segments) in a light shade of the board centre, with an emissive or metal rim in the world's plinth colour (§3).
- Plinths are **one `InstancedMesh`** for the whole city.
- Pips sit at the plinth's front edge (camera side), 3 for biz and `of` for upgrades:
  - filled pips are gold metal discs: `InstancedMesh` #1;
  - empty pips are thin `--mut` rings: `InstancedMesh` #2;
  - so the two states differ in shape, not only colour.

**Business stage kit.** It applies to whatever model the world uses for `biz` (business / mall / warehouse / campus), and it follows T3's look table:

| Stage | Base model | Added parts (all procedural, shared geometry, instanced per part type) | Archetype sign |
|---|---|---|---|
| 0 התחלה | scale ×0.8, y ×0.85 | scaffold frame (4 poles + 2 rails, thin boxes) and one traffic cone | — (T3: "no sign") |
| 1 יציב | ×1.0, windows lit (emissive +0.2 on emissive materials) | — | **sign**: a disc on a short pole, with the archetype icon from the atlas (coffee cup, washer, box, pizza, phone). Billboard sprite, ≤ 1 per business |
| 2 צומח | ×1.0 | **annex**: a second, flattened copy of the base model at 0.55 scale, offset back-left on the plinth. **Queue**: 3 capsule people, only while `activity.busy` | sign |
| 3 מותג | ×1.12 | annex, plus a **gold flag** on top (cone + box), plus a **plinth glow ring** (emissive torus in `--accent`). **Crowd**: 5 people while busy | larger sign, gold rim |

**Upgradable assets** (w2 tower, mall, hotel):
- ups 1: a neon roof band in `--accent`;
- ups 2: band plus a rooftop dome (spa or garden).
- Pips show `ups` of `max`.

**Activity badges (P0).**
- A small sprite above the item, from the icon atlas:
  - `busy` → people icon;
  - `competitor` → crossed-shop;
  - `breakdown` → wrench;
  - `stockout` → empty box;
  - season → garland.
- At most one badge per item; trouble beats activity.
- **P2:** T3's props (a rival stall, smoke, empty shelves, decorations).

**Trouble** (stage went down this month, or the last `bizPulse` was `bad` twice in a row) shows the `alert` badge, red triangle shape, for 1.5 s after the change. It stays visible in the info modal.

**Level changes** (`setLevel(key, level, {animate})`):
- When animating: base scale tween 450 ms, new parts pop in (scale 0→1, 120 ms each, staggered), pips fill 200 ms, then sparkle.
- When not animating (resume or sync), everything is set at once.
- At most **one level animation per item per payday**. A second change in the same payday is applied silently.

**Budget per item:**
- base model ≤ 3 calls after flattening (§8.3);
- the kit adds ≤ 1 non-instanced call (the sign sprite);
- every other part is instanced city-wide (plinth, pips ×2, scaffold, people, flag, glow): **≤ 7 extra calls for the whole city**;
- kit triangles ≤ 1,200 per item.

### 5.3 2D presentation (rendering lane, `board2d.js`, after the T1 handoff)
Each city card becomes a `<button class="b2d-card" data-key data-level="n" data-kind="biz|upgrade|plain">`.

| State | Card look | Badge / pips |
|---|---|---|
| plain owned asset | solid border in `--accent`, emoji (T1's `CITY_ICON`), short label | — |
| biz 0 | **dashed** border, 🚧 corner badge | ○○○ |
| biz 1 | solid border, archetype emoji corner (☕ 🧺 📦 🍕 📱) | ●○○ |
| biz 2 | solid border plus a "+" annex chip | ●●○ |
| biz 3 | **double gold** border, ★ corner | ●●● |
| upgrade | solid border | ● × ups, ○ × (max − ups) |
| activity / trouble | — | top-start corner badge: activity emoji, or ⚠ for trouble |

- Pips are `aria-hidden`. The button's accessible name carries the level text (§12).
- 2D motif per world (§3) goes on `#board2d .b2d-center` through CSS gradients.
- Level-up uses WAAPI: pulse 450 ms, pip fill 200 ms. Reduced motion: instant.
- **Hit size:** cards are ≥ 44×44 CSS px when the centre grid allows it (`gridN ≤ 6` on 390 px). Never below 24×24 (WCAG 2.2 AA 2.5.8). The financial sheet is the full-size alternative (§6.3).

### 5.4 Flow (shell hook G-2, `game.js`)
`syncLevels({ animate })` runs after every `applyOut()`, after `render()`, and at the end of resume:
1. `list = E.cityModels(S)`.
2. Build `level` per entry (§5.1).
3. Compare with the in-memory `prevLevels` Map. It is ephemeral, not saved.
4. Call `scene.setLevel(key, level, { animate: animate && prev != null && changed })`.
5. On `n` up → `ui.feedback('levelUp', …)` + `sfx('unlock')`. On down → `ui.feedback('levelDown', …)`.
6. For `bizPulse` effects in `out.effects` → `scene.pulse(at, kind)`.
7. Resume calls `syncLevels({ animate: false })`, so there is no feedback on resume (A-15).
8. Also update `#c`'s `aria-label` with the city count (§12).

The existing `case 'upgrade'` (`bump` + "שדרוג!") stays, and the level-up animation replaces the `bump` for that key.

---

## 6. Tap an asset → info (P0)

Naming: "**פרטי הנכס**" / `assetInfo`. It is deliberately not "inspect", which T2 uses for deal due diligence.

### 6.1 3D picking (rendering lane)
**Proxies.** Every city item gets an invisible pick proxy:
- a box Mesh sized to the item's bounding box × 1.15;
- on **layer 1**. The camera renders only layer 0, so proxies cost 0 draw calls;
- the Raycaster uses layer 1.

**Gesture.** On the canvas:
- `pointerdown` → `pointerup` with < 8 CSS px of movement and < 350 ms, one active pointer only, counts as a tap;
- drags, pinches and orbits never pick. OrbitControls stays as is.

**Hit test:**
1. Raycast the proxies; the first hit wins.
2. If there is no hit, use screen-space fallback: the item whose `project(key)` centre is within **22 px** wins (nearest), which guarantees a 44 px target.

**Hover** (`pointer:fine` only):
- `pointermove` is throttled to one check per rendered frame;
- the hovered item's plinth rim brightens (instance colour) and the cursor becomes `pointer`;
- `invalidate()` runs only when the hovered key changes.

**API:**
- `onPick(cb)` → unsubscribe; `cb(key, {x, y})`;
- `pickAt(clientX, clientY)` → key|null, used by tests and fallbacks;
- `highlight(key|null)`.

The proxies are rebuilt in `spawn`, `despawn`, `syncCity`, `relayout` and `setLevel`, because scale changes the bounds.

### 6.2 2D (rendering lane)
City cards are real buttons (§5.3). Click or Enter calls the same `onPick` callbacks. Focus shows the standard 3 px `--focus` ring.

### 6.3 DOM alternative and modal (in-game UI lane)
**Sheet rows.** The asset rows in the financial sheet (`renderSheet`) become `<button class="as-row" data-asset="a12">`. Holdings rows get `data-asset="h:stock"` and angel rows `data-asset="v3"`, the same keys as `cityModels`. Click or Enter opens the same modal.

**`ui.assetInfo(key, m, ctx)`** opens `#gm`, the shared `modal()`, with `dismissable:true`. It uses only `metrics()` data and does no finance arithmetic (the T2 rule):
- **Tag:** `kindLabel`. **Title:** name.
- **Level block** (if `ctx.level`): pips icon row plus the level line, plus "הצעד הבא" hint text (§12).
- **Rows** (`.grid .row`, numbers in `.num` via `fmtM`/`sgn`):
  - תזרים חודשי `cf`;
  - שווי `value`;
  - חוב `debt`;
  - הון עצמי `equity`.

  Businesses add:
  - בחודש שעבר `business.headline`;
  - סוג הכנסה (פעילה / פסיבית);
  - כוח בחודש `−{ownerEnergy} 🔋`.

  Holdings show כמות and שווי. Angels show the check and status from `m.angels`.
- **Activity / trouble** line, with its icon, if present.
- **Actions:**
  - `לדוח הכספי`: opens the sheet and scrolls the row into view;
  - P1 `לנהל את העסק`: only when `m.focus?.opsOpen` (T2). It calls the same handler as T2's `🏪 לפתוח את לוח העסק`;
  - `סגירה` (primary).
- **Escape and focus:** Escape closes the modal. Focus returns to the invoking row, card or canvas (the existing `modal()` restore).

**Gating (shell hook G-1).** `game.js` registers `scene.onPick(key => …)` and opens the modal only when all of these hold:
- `!busy`;
- `!ui.isEventOpen()`;
- `#gm` is hidden;
- the lobby is closed;
- no coach bubble is open.

Otherwise the tap only highlights the item for 600 ms.

---

## 7. Reduced motion and mute (P0)

### 7.1 One source of truth: `js/motion.js` (new, rendering lane, ~40 lines, no DOM at import)
```js
export function motionPref()            // 'auto' | 'reduce' | 'full'   (rr2-settings.motion, default 'auto')
export function reducedMotion()         // pref 'reduce' → true; 'full' → false; 'auto' → matchMedia('(prefers-reduced-motion: reduce)')
export function setMotionPref(p)        // writes rr2-settings (merge), sets <html data-motion="reduce|full">, emits bus 'motion:change'
export function initMotion()            // sets data-motion, listens to the media query change → bus 'motion:change'
```
- **CSS.** Every existing `@media (prefers-reduced-motion: reduce)` block in `game.css` and `lobby.css` is duplicated as `:root[data-motion=reduce] …`. `:root[data-motion=full]` suppresses the media query (the in-app setting wins).
- **JS.** `ui.js`, `lobby.js`, `board2d.js` and `scene.js` call `reducedMotion()` instead of their own `matchMedia`. The current calls are at `ui.js` `flyCoins`, `lobby.js` end sequence and `board2d.js` `reduced()`.
- **Turbo + reduced → reduced wins.**

### 7.2 What changes when reduced (3D = `scene.setMotion(true)`)
| Effect | 3D | 2D | DOM |
|---|---|---|---|
| Dice | No hand. Dice appear already showing their faces (150 ms fade), stay 600 ms, then hide. `throwDice` resolves ≤ 200 ms | already short | DOM dice: no spin |
| Pawn move | Teleport plus tiles-passed glow (§4.3) | teleport plus glow | — |
| Camera | **No shake.** Follow and overview switches **snap** (no `camStep` lerp). `celebrate` and `introWorld` resolve at once. `controls.enableDamping = false` (no inertia) | — | — |
| Particles | No confetti, sparkle, dust or hearts. Golden shows a static star badge | none | no coin flyers |
| Spawn / despawn / launch | Fade + scale 0.9→1, 120 ms / fade 120 ms / fade 200 ms | same | — |
| Float labels | No rise; opacity fade only | same | — |
| Idle motion | Pawn spin, decor updaters (motes, water, aurora) and the pawn ring spin are frozen | — | `#roll.ready` pulse off |
| Level-up | Instant swap + 120 ms fade | same | card fades |
| Text | — | — | Life-story typewriter shows instantly, does not auto-close, and gets focus (fixes UX§4 #14). HUD count-ups are instant. Banner is static |

### 7.3 Settings UI (lobby lane, profile/settings section next to the existing mute switch)
- **"תצוגה ותנועה"** section:
  - **תנועה במשחק**: radio group "לפי המכשיר" / "מופחתת" / "מלאה";
  - **איכות גרפיקה**: radio group "אוטומטית" / "גבוהה" / "בינונית" / "חסכונית", with "עכשיו: {tier}" shown under it;
  - Strings are in §12.
- The radios are real `<input type=radio>` inside a `<fieldset>`, each label ≥ 44 px high.
- **Mute:**
  - stays where it is (`#muteBtn` in the HUD, `role=switch` in the lobby);
  - **new P0:** audio follows page visibility. Hidden → `ctx.suspend()`, visible → `resume()` if not muted (`audio.js` `suspend()`/`resume()`).

---

## 8. Performance

### 8.1 Quality tiers (`js/render/quality.js`, new, rendering lane, no three import)
| Setting | **high** | **mid** | **low** |
|---|---|---|---|
| DPR cap: fine / coarse pointer | 2 / 1.75 | 1.5 / 1.5 | 1 / 1 (software renderer: 0.6, as today) |
| Antialias (init only; needs a reload to change) | on | on | off when low was chosen at init |
| Shadows | PCFSoft, 2048 (coarse 1536) | PCF, 1024 | **off**, plus a blob-shadow decal under each city item (part of the plinth instance) |
| Shadow casters | city, pawn, landmarks, trees | city, pawn, landmarks | none |
| Decor density (`scatter` counts) | 100 % | 70 % | 40 % |
| Decor updaters (motes, water, aurora) | on | on | off (static) |
| Particles / confetti | 100 % / 320 | 60 % / 160 | 30 % / 0 |
| Concurrent float labels | 4 | 3 | 2 (the oldest is removed early) |
| History CSS sepia filter | on | on | off |
| Stage kit people / crowd | on | on | off (badge only) |

**Detection (`autoTier()`):**
- software renderer (`lowPower`) → `low`;
- `navigator.deviceMemory ≤ 2` or `hardwareConcurrency ≤ 2` → `low`;
- coarse pointer and memory ≥ 6 and cores ≥ 6 → `high`;
- other coarse pointers → `mid`;
- everything else → `high`.
- `?hq` forces `high`. The saved pref `rr2-settings.quality` (`auto|high|mid|low`) overrides detection.

**Governor (P1).**
- Frame deltas are sampled **only while the scene is actively animating**, over a window of 90 frames.
- If the median is > 34 ms and the tier is `auto`, step down **one** tier: at most once per 30 s, at most 2 steps per session, never up.
- Emits `bus 'quality:change' {tier, auto:true}`. Toast S-Q1 shows once per session.
- At `low` with a median still > 40 ms, the governor triggers T1's existing S-N7 lite offer (it replaces T1's `lowPower`-only trigger).
- Disabled when `lowPower` (the software renderer is already at low, and CI runs swiftshader).

**Runtime switch** `setQuality(tier)`:
- DPR, shadows and casters change immediately;
- decor density and updaters re-run `buildWorld(world)` with the city kept;
- antialias changes only after a reload (stated in the settings hint).

### 8.2 Budgets (measured exactly as in §1.1; overview camera; w1; harness city)
| Scene | Metric | high | mid | low | Baseline today |
|---|---|---|---|---|---|
| empty city | calls | ≤ 50 | ≤ 45 | ≤ 40 | 124 |
| 12 items, mixed levels | calls | ≤ 100 | ≤ 90 | ≤ 70 | 214 |
| **24 items, mixed levels** | **calls** | **≤ 130** | **≤ 110** | **≤ 80** | **304** |
| 24 items | triangles | ≤ 170k | ≤ 150k | ≤ 130k | 112k (no kits) |
| any | texture MB (`perfStats().texMB`, includes shadow map) | ≤ 40 | ≤ 20 | ≤ 10 | record in R0 |
| any | pixel ratio | per §8.1 | | | 1.75 / 2 |
| idle 5 s after 3 s quiet | frames rendered | ≤ 2 | ≤ 2 | ≤ 2 | (render on demand exists) |
| hidden tab, 3 s | frames rendered | 0 | 0 | 0 | not paused today |
| device FPS (manual, §13.3) | median / p95 | ≥ 55 fps desktop iGPU | — | ≥ 30 fps / ≤ 50 ms on the reference low phone | — |

"Mixed levels" = items 0–3 are businesses at stages 0, 1, 2 and 3 (two busy), items 4–5 are w2-style upgrades at 1 and 2, and the rest are plain. For w1, the harness forces `level` objects through `setLevel`.

### 8.3 Draw-call reductions (rendering lane, P0)
1. **Board tiles: 80 → ≤ 11 calls.**
   - Tile frames become one `InstancedMesh` (shared `tGeo`/`tMat`).
   - Tile faces become one `InstancedMesh` **per tile type** (≤ 10 types per world; same `mats[ch]` textures).
   - `tilePos`/rotation go into the instance matrices.
   - This changes `buildWorld` only.
2. **City models: flattened at load.** In the `loadGLB` post-process, after T1's timeout and retry, `flattenModel(group)`:
   - **Bucket key.** Primitives are grouped by `transparent`, `emissiveIntensity > 0` (with `KHR_materials_emissive_strength`), metalness ≥ 0.5, and roughness rounded to 0.25.
   - **Merge.** Each bucket is merged with `BufferGeometryUtils.mergeGeometries`. The base colour is baked into a `color` vertex attribute, so one `MeshStandardMaterial({vertexColors:true})` per bucket.
   - **Result.** 6–17 primitives become **1–3**.
   - **Material names.** Names that code depends on are kept unmerged: `PawnColor` (pawns) and the emissive "LitWindow" materials (used by the stage-1 "lights" boost).
   - **Debug flag.** `?flat=0` disables flattening, for visual comparison.
   - **Visual check.** A screenshot diff per model, before and after, mean ΔE ≤ 3 over the model's pixels (§13.2).
3. **Shared materials.** The stage kit, plinths, pips, people, flags and glow use a single 12-colour palette module. Materials are created once and reused across worlds, with the colour per instance. No per-spawn material allocation except the pawn tint.
4. **Float labels.** Reuse a pool of sprite and canvas pairs (size = concurrency cap) instead of allocating a 1024×128 canvas and texture per label.

### 8.4 Lifecycle (rendering lane; T1 owns `init`/`dispose` first, and T5 edits them only after the T1 merge)
- **Pause when hidden (P0).** In `init`: on `visibilitychange`, hidden → `renderer.setAnimationLoop(null)`; visible → restore the loop, then `wake()` and `invalidate()`. This combines with the existing `setPaused` (the lobby pause), so both must allow rendering.
- **Dispose on world change (P0).** In `buildWorld(w)`, when `assetDir(w)` differs from the previous one:
  - traverse and dispose geometries and materials of `ready` entries for **other world dirs** (w1–w4);
  - delete them from `cache` and `ready`;
  - keep `life/`, `pawns/` and `history/`.

  History reuses `w1`, so h↔w1 keeps them. Flattened geometry follows the same rule.
- **Lazy-load (P1, coordinate with T1, which owns `preloadLife`).** Start the life and history GLBs (9 files, ~2.8 MB) with `requestIdleCallback` *after* the world models settle, not in parallel with them, so the first board appears sooner on slow networks. Missing life models already fall back to the procedural stand-ins.
- **No new startup requests at P0** (A-35).

### 8.5 Measuring (`scene.perfStats()`, P0; extends `renderStats()`)
```js
perfStats() → { calls, triangles, geos, textures, texMB, dpr, tier, framesRendered, lastTurnMs,
                fps: { median, p95, samples } }   // fps from the active-frame window (§8.1)
```
- `texMB` = Σ over textures referenced by scene materials: w × h × 4 × (1.33 if mipmapped), plus shadow map size² × 4.
- **`?perf=1`** shows a small fixed overlay (`aria-hidden`, top-start) with `perfStats()` every second. It also adds `scene.perfRun()`, a scripted 10 s run:
  - overview camera with a 360° auto-orbit;
  - a 24-item mixed-level city;
  - one level-up;
  - one purchase.

  It returns the fps stats. URL param only, like the existing `?hq`; not a `flags.js` flag (T1 allows only two).

---

## 9. Asset plan

### 9.1 Reuse first (inventory, §1.1)
- Every city, life, history, pawn and dice GLB stays as is: **no rebuild and no new GLB at P0**.
- Growth stages, plinths, pips, people, flags, scaffolds and glow rings are **procedural** in `scene.js`. They are built from three primitives in the same chunky, flat-shaded style as today's `LIFE_FALLBACK`, with shared and instanced geometry (§5.2).
- This is required anyway: the w2–w4 GLBs have no build scripts, and Blender is not installed in this container (`which blender`: none).

### 9.2 New runtime textures (no files)
**One icon atlas** `CanvasTexture`: 512×128, 8 cells of 64 px, ≈ 0.35 MB in GPU memory.
- Cells: coffee cup, washer, box, pizza, phone, people, crossed-shop, wrench, empty box, garland, alert, up, down.
- The cells are drawn from the same SVG path data as `ICON` with `Path2D`.
- No Hebrew and no text glyphs.
- It is used by the signs and badges. 2D uses emoji and DOM (§5.3).

### 9.3 Optional (P2) Blender stage kit
**Script.** `blender/build_stage_kit.py`, using `rr_lib.py` (`reset`, `mat`, `box`, `cyl`, `cone`, `finish`, `export`), exports `assets/common/stage_kit.glb` with these parts:
- scaffold;
- annex roof;
- flag;
- sign disc;
- person;
- cone.

**Targets:**
- ≤ 80 KB;
- ≤ 6k triangles total;
- ≤ 4 materials;
- one named node per part;
- `export_texcoords=False`, as `rr_lib.export` does.

**Docs and license.** Documented in `assets/common/STAGE_KIT.md` (purpose, script, size, license: original work under the repo's license), in the style of `assets/life/DIE.md`.

**Loading.** The runtime loads it lazily on the first stage ≥ 1. If it is missing, the procedural parts are used.

**P2 (network needed).** A dev-only GLB quantization pass (`KHR_mesh_quantization` via gltf-transform, not shipped at runtime, so no decoder is needed). Target −40 % bytes on the existing GLBs.

### 9.4 Rules for any future asset
- Licensed: original work, or CC0 with the source recorded.
- Documented next to the file.
- New city or kit GLBs: ≤ 150 KB, ≤ 5k triangles, ≤ 4 materials (after flattening ≤ 3 calls).
- Textures: ≤ 512² and power of two.
- **No raster images containing Hebrew text** when the text can be real UI text.

---

## 10. Shared contracts

### 10.1 `js/render/vocab.js` (new, rendering lane; pure data; Node-importable; no DOM or three)
```js
export const MOTION = { t1:120, t2:200, t3:350, t4:480, tmax:600, dice:1200, hop:160, hopSquash:90, celebrate:1200, confetti:2400 };
export const MOTION_EXCEPTIONS = ['dice', 'celebrate', 'confetti'];       // only these may exceed tmax
export const LABEL_COLORS = { green:'#13744a', red:'#b8322a', blue:'#2459b8', gold:'#8a5a00', pink:'#be185d' };
export const WORLD_STYLE = { w1:{ accentInk:['#8a5a00','#f2b632'], rim:'#f2b632', motif:'dots', caption:'התיק שלך' }, /* w2,w3,w4,h per §3 */ };
export const CHAR_STYLE = { teacher:'#d9485f', /* … 13 entries per §3.1 */ };
export const STAGE_LABELS = ['התחלה', 'יציב', 'צומח', 'מותג'];            // = T3 §6.8
export const ARCHETYPE_ICON = { coffee:'cup', laundromat:'washer', toyshop:'box', pizza:'pizza', app:'phone' };   // atlas cells
export const ARCHETYPE_EMOJI = { coffee:'☕', laundromat:'🧺', toyshop:'📦', pizza:'🍕', app:'📱' };
export const ACTIVITY_ICON = { busy:'people', competitor:'rival', breakdown:'wrench', stockout:'emptybox', season:'garland' };
export const ACTIVITY_EMOJI = { busy:'👥', competitor:'🏪', breakdown:'🔧', stockout:'📭', season:'🎉' };
export const CITY_EMOJI = { /* moved from board2d.js CITY_ICON, unchanged */ };
export function levelText(level)      // → 'שלב 2 מתוך 3 · צומח' | 'בהתחלה · עוד לא יציב' | 'שדרוגים: 1 מתוך 2' | ''
export function levelHint(level)      // → §12 next-step string | ''
export function pipsText(level)       // → '●●○' (2D visual, aria-hidden)
```
The stage colours and pip geometry follow from these tables, so the 3D and 2D renderers can't disagree.

### 10.2 Scene API additions (both renderers + `null.js`; `SCENE_API` grows by these names)
| Function | 3D (`scene.js`) | 2D (`board2d.js`) | `null.js` |
|---|---|---|---|
| `setLevel(key, level, {animate})` | plinth pips, stage kit, scale (§5.2) | `data-level`, pips, border, aria-label (§5.3) | no-op |
| `pulse(key, kind)` | bob 300 ms + arrow badge | arrow badge | no-op |
| `onPick(cb)` → unsubscribe | raycast taps (§6.1) | card button clicks | returns a no-op unsubscribe |
| `pickAt(x, y)` → key\|null | raycast + 22 px fallback | `elementFromPoint` → card key | `null` |
| `highlight(key\|null)` | plinth rim brighten | `.hl` class | no-op |
| `setMotion(reduced)` | §7.2 | §7.2 (replaces `reduced()`) | no-op |
| `setQuality(tier)` / `getQuality()` | §8.1 | store and return; no visual change | store and return |
| `skip()` | resolve awaited tweens at their end state | finish WAAPI animations | no-op |
| `introWorld()` | 600 ms camera move, not awaited | 200 ms fade | no-op |
| `setPawnRing(color)` | pawn ring colour (§3.1) | token border colour | no-op |
| `perfStats()` | §8.5 | `{framesRendered:0, lastTurnMs, tier}` | `{}` |
| `syncCity(list)` | entries may carry `level` → applied silently | same | no-op |

`syncCity` keeps its signature, and every new function catches its own errors (the T1 board2d rule). `game.js` calls each one guarded with `?.`, so a renderer without it never throws.

### 10.3 Shell hook requests (`game.js` / `index.html`, shell lane; one commit, after T1 merges, reviewed by the T1 owner)
| Id | Where | Change |
|---|---|---|
| G-1 | after `initRenderer` | `scene.onPick?.(onAssetPick)`. `onAssetPick` applies the gating (§6.3) and then calls `ui.assetInfo(key, E.metrics(S), {level: prevLevels.get(key), world: W, opsOpen})` |
| G-2 | after `applyOut`, `render`, resume | `syncLevels({animate})` (§5.4), plus forwarding `bizPulse` effects to `scene.pulse`. Also handles `bizStage` (no direct scene call: syncLevels picks it up) |
| G-3 | init + `bus 'motion:change'` | `initMotion()`; `scene.setMotion?.(reducedMotion())`; `ui.setMotion?.(…)` |
| G-4 | init + `bus 'quality:change'` | `scene.setQuality?.(tier())`. At low, offer T1 S-N7 (replaces the `lowPower` trigger) |
| G-5 | init | `document.visibilitychange` → `audio.suspend()/resume()` (the renderer handles its own loop) |
| G-6 | `turn()` | while rolling or hopping: `pointerdown` on `#c`/`#board2d`, or Space/Enter, → `scene.skip?.()` (§4.3) |
| G-7 | `startGame` (first game in a world: `!progress.played(worldId)`) | `scene.introWorld?.()` (not awaited) + `ui.feedback('worldEntry', …)` |
| G-8 | `startGame` / `setPawn` | `scene.setPawnRing?.(CHAR_STYLE[charId])` |
| G-9 | `index.html` | `#c` `aria-label` is updated by G-2. No new elements: the inspect path is the sheet, and the settings live in the lobby |

---

## 11. Files and ownership (lanes from `TASK_BOARD.md`; one implementer per file at a time)

| Lane | Files T5 may edit | Work items | Own tests |
|---|---|---|---|
| **Rendering (R)** | `js/scene.js` (after T1 merges, including `init`/`loadGLB`/`buildWorld`), new `js/render/vocab.js`, new `js/render/quality.js`, new `js/motion.js`, `js/render/board2d.js` + its `#board2d` section in `css/stability.css` (**ownership moves from the shell lane to rendering after T1 merges**; PM updates TASK_BOARD), `js/render/null.js` (only `SCENE_API` names + no-ops), `assets/*` (none at P0), `blender/build_stage_kit.py` (P2) | **R0:** `perfStats`, baseline record, `?perf`. **R1:** tile instancing, model flattening, label pool, tiers, pause hidden, dispose. **R2:** plinth, pips, stage kit, activity, `setLevel`/`pulse`, 2D levels. **R3:** picking 3D/2D. **R4:** motion variants, turn budget, `skip`, `introWorld`, durations | `tests/t5_vocab.test.mjs`, `tests/t5_perf.py`, `tests/t5_city.py` |
| **In-game UI (U)** | `js/ui.js`, `css/game.css`, `js/audio.js` | **U1:** tokens (§2), `.num` font, `iso()` money wrap, icons, label sizes. **U2:** `feedback()` queue, `assetInfo`, sheet rows as buttons, motion-aware DOM (coins, typewriter, count-ups), milestones, `applyTheme` sets `--accent-ink`, HUD portrait, audio `suspend`/`resume` | `tests/t5_tokens.test.mjs`, `tests/t5_ui.py` |
| **Lobby (L)** | `js/lobby.js`, `css/lobby.css` | **L1:** tokens and stars (outline ☆, `--gold-text`), char portraits, world-unlock reveal, map path, "חדש" badge, settings section (motion, quality), `CAT_HE.business` (UX§4 #15) | `tests/t5_lobby.py` (`--no-live`, Supabase mocked) |
| **Shell (S), request** | `js/game.js`, `index.html` | G-1…G-9 (§10.3) | covered by `t5_city.py` / `t5_ui.py` |
| **Engine (E), request** | `js/finance/business.js`, `js/engine.js` | IR-T5-1 = T3§6.8 (dependency). IR-T5-2 optional | T3's tests |

**Order:**
1. U1 and L1 start now: tokens only, no shared files with T1.
2. R0, R1 and R4 start after T1 merges.
3. R2 and R3, plus G-1/G-2, follow. R2 can use the dev fixture (§13) before T3 lands.
4. U2 runs in parallel with R2.
5. The final screenshot pass comes last.

**Shared-file conflicts to avoid:**
- In `ui.js`, T3's UI-1…UI-10 edit `effectChips`, the story card, inbox, business toast and manage card. T4 edits the coach. T5 edits only `toast`/`achievementToast`/`lessonToast`/`verdict` (as wrappers), the new `feedback`, `assetInfo` and `setMotion`, `renderSheet` (asset rows only), `flyCoins`, `lifeStory` (the timing part only), `applyTheme`, `renderHUD` (portrait only) and `ICON`.
- In `game.css`, T5 owns the `:root` tokens; other lanes consume them.

---

## 12. Hebrew strings (exact; ids referenced by tests)

| Id | Where | Text |
|---|---|---|
| T5-L0 | level line, biz stage 0 | `בהתחלה · עוד לא יציב` |
| T5-L1 | level line, biz stage 1–3 | `שלב {n} מתוך 3 · {label}` (label ∈ יציב / צומח / מותג) |
| T5-L2 | level line, upgrade | `שדרוגים: {n} מתוך {of}` |
| T5-H0 | next-step hint, stage 0 | `כדי להתייצב: רווח ממוצע חיובי לאורך 3 חודשים.` |
| T5-H1 | hint, stage 1 | `כדי לצמוח: להרחיב, לגייס עובדים או להגדיל את המכירות.` |
| T5-H2 | hint, stage 2 | `כדי להפוך למותג: שנה של פעילות, מנהל או שווי גבוה, והרחבה.` |
| T5-H3 | hint, stage 3 | `זה השלב הכי גבוה. העסק מכניס גם כשאתה לא שם.` |
| T5-HU | hint, upgrade below max | `אפשר לשדרג במשבצת "שדרוג" בלוח.` |
| T5-U1 | level-up card `small` | `העסק התקדם!` |
| T5-U2 | level-up card body | `{name}` (title) · `שלב {n} מתוך 3 · {label}` |
| T5-D1 | level-down toast (`bad`, alert icon) | `{name}: חזרה לשלב "{label}". כדאי להציץ בלוח העסק.` |
| T5-A1 … A5 | activity, modal and 2D sr | `יש תור` · `מתחרה חדש בסביבה` · `תקלה בציוד` · `המלאי אזל` · `עונה חמה` |
| T5-I0 | modal action | `לדוח הכספי` |
| T5-I1 | modal action (P1) | `לנהל את העסק` |
| T5-I2 | modal rows | `תזרים חודשי` · `שווי` · `חוב` · `הון עצמי` · `בחודש שעבר` · `סוג הכנסה` · `כוח בחודש` · `כמות` |
| T5-I3 | income kind values | `פעילה (אתה עובד בעסק)` · `פסיבית (יש מנהל)` |
| T5-C1 | `#c` aria-label | `לוח המשחק. בעיר שלך {N} נכסים. פרטים על כל נכס בדוח הכספי.` (N = 0 → `לוח המשחק. עדיין אין נכסים בעיר.`) |
| T5-C2 | 2D card accessible name | `{label} · {kindLabel}` + (`, ` + T5-L0/L1/L2 when there is a level) + (`, ` + T5-A* when there is activity) |
| T5-M1 … M3 | milestone toasts | `רבע מהדרך לחופש!` · `חצי מהדרך לחופש!` · `שלושה רבעים מהדרך. כמעט שם!` |
| T5-W1 | world-entry banner `sub` | `עולם חדש נפתח` |
| T5-W2 | map badge | `חדש` |
| T5-S0 | settings section title | `תצוגה ותנועה` |
| T5-S1 | motion legend · options · hint | `תנועה במשחק` · `לפי המכשיר` / `מופחתת` / `מלאה` · `מופחתת: בלי רעידות, קונפטי וקפיצות. הקוביות והחייל זזים מיד.` |
| T5-S2 | quality legend · options · hint · status | `איכות גרפיקה` · `אוטומטית` / `גבוהה` / `בינונית` / `חסכונית` · `חסכונית: בלי צללים ועם פחות קישוטים. מתאים לטלפונים ישנים. החלקת קצוות משתנה אחרי רענון.` · `עכשיו: {tierLabel}` |
| T5-Q1 | governor toast (once per session) | `הורדנו את איכות הגרפיקה כדי שהמשחק ירוץ חלק. אפשר לשנות בהגדרות.` |
| T5-LC | library category (lobby `CAT_HE`) | `business: '🏪 עסקים'` |

**Rules:**
- Verbs follow the existing UI voice: singular masculine imperative, as T1§1 notes.
- Lines that mention a business or a player avoid gendered verbs (names like "עגלת קפה" are feminine).
- No English words appear in T5 UI.
- Every text ≤ 120 characters (T3 UI-8 limit).

---

## 13. Test plan

**Harness.**
- Every browser test uses the real copy (`tests/make_realcopy.sh`), three served locally, and Chromium with swiftshader.
- Supabase is routed: `page.route('**/*.supabase.co/**', abort)`, with T7's mock backend once it lands. Lobby suites run in `--no-live` style.
- Google Fonts are allowed. A second run with fonts aborted checks the fallbacks.

**Dev fixture (rendering lane).** `?fx=levels` (URL param, test-only, ignored in ranked). After `buildWorld`, it spawns the "mixed levels" city from §8.2 through `syncCity` + `setLevel`. This lets R2 and R3 be built and tested before T3 delivers `stage`.

### 13.1 Node (no browser)
- `t5_tokens.test.mjs`:
  - parses `css/game.css` `:root`, including the `light-dark()` pairs, and computes WCAG contrast for every text token against the three surfaces per mode (A-1, A-2);
  - checks `--accent-ink` × 5 worlds × 2 modes;
  - fails on any `font-size` below 12 px in `game.css`/`lobby.css` (A-4).
- `t5_vocab.test.mjs`:
  - every model name in every world's `models`/`tickers` and in `LIFE_MODELS` has a `CITY_EMOJI`;
  - all 13 characters have a `CHAR_STYLE`, distinct within each world;
  - `STAGE_LABELS` match T3;
  - `MOTION` values ≤ `tmax` except `MOTION_EXCEPTIONS` (A-8);
  - `levelText`/`levelHint` return the §12 strings;
  - **renderer parity:** the export names of `scene.js` (parsed statically), `board2d.js` and `null.js` all contain every name in `SCENE_API` (A-44).

### 13.2 Browser
- `t5_perf.py` (rendering), for each tier forced via `rr2-settings.quality`:
  - `perfStats()` for empty / 12 / 24 mixed-level items at overview, desktop 1300×820 (A-26 … A-29);
  - idle frames (A-30);
  - hidden tab: override `document.visibilityState` and dispatch `visibilitychange` (A-31);
  - w1 → w2 → w1 memory (A-32);
  - governor with injected frame times via `window.__rrPerfInject` (test hook, `?perf=1` only) (A-33);
  - `.glb` request count at w1 start (A-35);
  - flatten visual diff: per model, a `?flat=0` vs default screenshot of the model alone on a neutral background, mean ΔE ≤ 3 (A-45).
- `t5_city.py` (rendering + shell), with `?fx=levels` and, once T3 lands, a real save with a managed business built in-page through the engine (the UX§0 `cards.py` technique):
  - stage 0–3 parts and pips in 3D (`userData.level`), and in 2D (`data-level`, accessible name) (A-12);
  - `bizStage` up and down (A-13);
  - w2 upgrade (A-14);
  - resume (A-15);
  - an engine without `stage` (A-16);
  - picking: tap, drag, empty board, 22 px fallback, busy gating (A-17 … A-21);
  - modal numbers vs `metrics()` (A-22);
  - turn budget and skip (A-9, A-10);
  - 2D run with `?ff=board2d:on`.
- `t5_ui.py` (in-game UI):
  - computed-contrast audit (UX `audit_lib` method) on 12 screens in light and dark (A-3);
  - ₪ font scan (A-5), bidi scan (A-6);
  - overlay queue on phone at the tutorial first buy (A-11);
  - reduced motion via `emulate_media(reduced_motion='reduce')`, and via `rr2-settings.motion` both ways (A-23, A-24);
  - audio suspended when hidden (A-25);
  - DOM path: keyboard-only through sheet → row → modal → Escape (A-20);
  - icons (A-38);
  - touch targets (A-39).
- `t5_lobby.py`:
  - stars (A-7);
  - character portraits (A-37);
  - world-unlock reveal and "חדש" badge, using a mocked profile;
  - settings controls and persistence;
  - the `business` category in Hebrew.

### 13.3 Screenshots and manual
**Screenshot matrix** (saved to `/tmp/t5shots/`, attached to the PR):

| Dimension | Values |
|---|---|
| Viewport | desktop 1300×820 · phone 390×844 · phone 360×760 · tablet 820×1180 |
| Theme | light, plus dark for desktop and phone |
| World | w1, w2, w3, w4, h |
| Renderer | 3D and 2D |

**States:** the board with the mixed-level city, the asset-info modal, a level-up card, the char select, the map with a new unlock, the end screen, and settings.

**World distinctness (A-36)** is automated on the same shots: the mean Lab colour of a fixed board-centre region and a sky region, with ΔE ≥ 15 between every pair of worlds.

**Manual device FPS (A-34).** Results are recorded in the PR body. Run `?perf=1` `perfRun()` at tier auto on:
- the reference low phone: Android Chrome, ≤ 4 GB RAM, Mali-G52-class GPU (Galaxy A12/A13 or Redmi 9 class): median ≥ 30 fps, p95 ≤ 50 ms;
- a 2019+ laptop with an integrated GPU: median ≥ 55 fps.

**Regression:** `node` suites unchanged; `game_e2e.py` w1–w4 in 3D and with `?ff=board2d:on`; 0 `pageerror`.

---

## 14. Acceptance criteria (numbered, testable)

**Tokens, type, icons**
- **A-1 (P0)** Every light-mode text token (`--ink`, `--mut`, `--green`, `--red`, `--blue`, `--pink`, `--gold-text`, and `--accent-ink` for 5 worlds) is ≥ 4.5:1 on `#fffaf0`, `#f6eedd` and `#efe4cd`. Every dark-mode text token is ≥ 4.5:1 on `#1f1b27`, `#2a2533` and `#352f40`. Computed by `t5_tokens.test.mjs` from `game.css`.
- **A-2 (P0)** Non-text ≥ 3:1 on adjacent surfaces: the earned-star stroke, the unearned-star outline, the pip ring and the focus ring.
- **A-3 (P0)** The rendered audit on 12 screens (home, char select, game HUD, deal, payday, business, asset info, level-up card, sheet, end, settings, map), light and dark, finds **0** text nodes below 4.5:1. Text over images or gradients and disabled controls are excluded, as in UX§0.
- **A-4 (P0)** No visible text has a computed font size below 12 px on those screens. There is no `font-size` < 12 px in either CSS file.
- **A-5 (P0)** 0 text nodes contain ₪ while their computed `font-family` starts with "Secular One" (DOM walk on the A-3 screens and on a card whose title contains money, e.g. the crypto card "נסחר ב־₪1").
- **A-6 (P0)** The bidi scanner (UX `bidiscan.py` method) finds 0 misplaced ₪/$/% signs on the 12 screens.
- **A-7 (P0)** Unearned stars render as an outline (`☆` or `starOutline` SVG). Earned stars render as a filled shape. Every star group has `aria-label="{n} כוכבים מתוך 3"`.
- **A-38 (P0)** The HUD and tool buttons contain an `svg` child. No `📅` is rendered anywhere in the game screen.
- **A-39 (P0)** Every new T5 control (settings radios, modal actions, sheet asset rows) is ≥ 44×44 CSS px on 390 px and 360 px viewports. 2D city cards are ≥ 44×44 when `gridN ≤ 6` and never below 24×24.
- **A-40 (P0)** All §12 strings appear verbatim. No English word is visible in T5 UI. The `business` library section reads "🏪 עסקים".

**Feedback**
- **A-8 (P0)** Every `MOTION` value is ≤ 600 ms except `dice` (≤ 1200), `celebrate` (≤ 1200) and `confetti` (≤ 2400). With `setSpeed(0.5)` the requested spawn duration is ≤ 240 ms (instrumented tween log).
- **A-9 (P0)** `perfStats().lastTurnMs` for a 7-tile move is ≤ 2600 (normal), ≤ 1400 (turbo) and ≤ 600 (reduced motion).
- **A-10 (P0)** A tap on the board during hops resolves `turn()`'s awaited animations within 100 ms. The card then opens normally and the game state is identical to a run without the tap (same `S.month`, `S.pos`, cash).
- **A-11 (P0)** On a 390 px phone at the tutorial's first buy, at most one of {`#coach` bubble, `#achv` card, `#toast.on`, `#verdict` visible} is visible at any 100 ms sample over 8 s. All queued items are eventually shown, in priority order.
- **A-13 (P0)** A `bizStage` up effect produces exactly one `setLevel(…, {animate:true})`, one level-up card (T5-U1/U2) and one `unlock` sfx. A down effect produces no card, no sparkle, and one `bad` toast T5-D1 with the alert icon.

**Living city**
- **A-12 (P0)** For businesses at stages 0, 1, 2 and 3:
  - **3D:** `userData.level.n` matches, and the parts present match the §5.2 table (scaffold only at 0; sign from 1; annex from 2; flag and glow at 3). Pips show n filled and 3 − n hollow, as separate instanced meshes.
  - **2D:** `data-level` matches, the border style matches §5.3, and the accessible name contains T5-L0 or T5-L1.
- **A-14 (P0)** In w2, an upgrade changes that asset's pips from 0/2 to 1/2 and adds the roof band, in 3D and 2D.
- **A-15 (P0)** Resuming a save reproduces every level exactly, with no level animation, no feedback card and no sound.
- **A-16 (P0)** With `cityModels` entries that have no `stage`, the game runs with 0 errors. Business items show the plinth only, without pips or a stage kit.
- **A-41 (P0)** Every city item (any world, any kind) stands on an "owned" plinth whose rim uses the world's plinth colour (§3).

**Asset info**
- **A-17 (P0)** On phone emulation, a tap at `scene.project(key)` of any city item opens `#gm` with that asset's name as the title within 300 ms. A 12 px drag starting there opens nothing. A tap on an empty board area opens nothing.
- **A-18 (P0)** With 24 items at overview on a 390 px phone, `pickAt(c.x ± 22, c.y)` and `pickAt(c.x, c.y ± 22)` return the item's key for every item (c = projected centre). Where targets overlap, the nearest centre wins.
- **A-19 (P0)** In 2D, every city card is a `<button>` whose accessible name follows T5-C2. Enter opens the same modal.
- **A-20 (P0)** Keyboard only: Tab reaches `#sheetBtn` → open → Tab to an asset row → Enter opens the modal (focus on its primary button) → Escape closes it and focus returns to the row.
- **A-21 (P0)** Picks during dice or hops, or while an event card, `#gm`, the lobby or a coach is open, do not open the modal. They highlight the item only.
- **A-22 (P0)** Modal values equal `E.metrics(S)` for that asset (`cf`, `value`, `debt`, `equity`; business headline and income kind), formatted by `fmtM`/`sgn` inside `.num`.

**Reduced motion and mute**
- **A-23 (P0)** With OS reduced motion emulated, or with `rr2-settings.motion='reduce'`:
  - the camera position changes by 0 during a loss card's shake window;
  - no confetti `InstancedMesh` is ever added;
  - `throwDice` resolves in ≤ 200 ms;
  - a hop move resolves in ≤ 300 ms;
  - no sparkle sprites are created;
  - `controls.enableDamping === false`;
  - no `.coin` DOM flyers appear;
  - the life-story text is complete on open and does not auto-close.
- **A-24 (P0)** `motion='full'` with OS reduce gives full motion. `motion='reduce'` with OS no-preference gives reduced motion. `<html data-motion>` reflects the effective value, and CSS animations obey it in both directions.
- **A-25 (P0)** With the page hidden, `AudioContext.state === 'suspended'`. When visible again it is `running`, unless muted. The mute switch keeps working as today.

**Performance**
- **A-26 (P0)** Draw calls (§1.1 method, overview, desktop 1300×820, w1) for the 24-item mixed-level city: ≤ 130 high, ≤ 110 mid, ≤ 80 low (baseline 304). For 12 items: ≤ 100 / 90 / 70. Empty: ≤ 50 / 45 / 40.
- **A-27 (P0)** Triangles for the same 24-item scene: ≤ 170k high, ≤ 150k mid, ≤ 130k low.
- **A-28 (P1)** `perfStats().texMB` ≤ 40 high, ≤ 20 mid, ≤ 10 low. The R0 baseline is recorded in the PR.
- **A-29 (P0)** On an emulated DPR-3 phone, `renderer.getPixelRatio()` is 1.75 high, 1.5 mid and 1.0 low. On desktop DPR 2: 2 / 1.5 / 1.
- **A-30 (P0)** After 3 s with no input and no animation, `framesRendered` grows by ≤ 2 over the next 5 s.
- **A-31 (P0)** While hidden, `framesRendered` does not grow over 3 s. Rendering resumes within one frame of becoming visible.
- **A-32 (P0)** After w1 → w2 → w1, `renderer.info.memory.geometries` and `.textures` are each ≤ the first-w1 values + 5. The GLB cache holds only the current world's dir plus `life/`, `pawns/` and `history/`.
- **A-33 (P1)** Injected 50 ms frames for 90 active frames at tier auto/high step the tier down to mid exactly once and show T5-Q1 once. There is no second step within 30 s, and never a step up.
- **A-34 (P1, manual)** The reference low phone gives median ≥ 30 fps and p95 ≤ 50 ms in `perfRun()` at tier auto. A desktop integrated GPU gives median ≥ 55 fps. Results are recorded in the PR body with device model and browser version.
- **A-35 (P0)** Starting w1 requests no more `.glb`/font/image files than the baseline on this tree.
- **A-45 (P0)** Flattening keeps the look: for each of the 36 city, life, history and pawn models, mean ΔE ≤ 3 between `?flat=0` and the default on a neutral backdrop. `PawnColor` tinting still works (the pawn colour matches the chosen colour).

**Identity**
- **A-36 (P0)** On the screenshot matrix, every pair of worlds (w1–w4, h) differs by ΔE ≥ 15 in both the mean sky-region colour and the mean board-region colour, in 3D and in 2D.
- **A-37 (P0)** All 13 character cards show a portrait token in their `CHAR_STYLE` colour, and the colours are distinct within each world. In game, the pawn ring (3D) or token border (2D) has the character's colour.

**General**
- **A-42 (P0)** 0 `pageerror` events and a clean console (T1§6.2 allow-list) in every T5 browser run. No request reaches `*.supabase.co`.
- **A-43 (P0)** No regression: the Node suites pass unchanged; `game_e2e.py` w1–w4 passes in 3D and with `?ff=board2d:on`; T1's acceptance tests still pass.
- **A-44 (P0)** Parity: `scene.js`, `board2d.js` and `null.js` export every `SCENE_API` name, including the §10.2 additions.

---

## 15. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| T3's `stage`/`activity` arrive late or change | No growth visuals | Graceful degradation (A-16); the `?fx=levels` fixture; labels and hints keyed to T3§6.8 in one place (`vocab.js`). If T3 changes the criteria, T5-H0…H2 change with them (copy review in T3's PR) |
| Lane collisions in `ui.js` (T3 UI-1…10, T4 coach, T5 feedback) and in `game.js` (T1) | Merge conflicts, regressions | The function-level split in §11; G-hooks in one commit after T1 merges; `feedback()` keeps the old wrappers so other lanes' calls are untouched |
| Model flattening changes the look (merged roughness, metalness) | Visual drift, "cheaper" feel | Buckets keep emissive, transparent and metal separate; `?flat=0` comparison; ΔE gate (A-45); per-model opt-out list in `vocab.js` |
| Antialias can't change at runtime | Low tier picked mid-session keeps AA cost | DPR and shadows give most of the gain; AA follows the tier after a reload (stated in the settings hint) |
| Picks fight OrbitControls on touch | Accidental modals or missed taps | 8 px / 350 ms tap rule, single pointer only, pinch never picks; gating while busy |
| Reduced-motion teleport hides "passed payday" information | Confusion | Tiles-passed glow, plus the existing payday toast and card |
| Contrast changes make the palette feel colder | The owner's "keep it warm" | Hues are unchanged; only luminance drops on text tokens; fills (gold, accents, boards) are untouched; screenshot review against the current shots in `/tmp/research-ux/` |
| The governor misfires on CI or slow first frames | Tier drops for no reason | Samples only active frames after the first 3 s; disabled when `lowPower`; tests inject frame times |
| Dispose on world change and the T1 retry cache | Reloading the same world twice | Dispose only when `assetDir` changes; history↔w1 shares; A-32 |
| Turn-budget compression makes dice feel cheap | Less satisfying | Keep the hand and both bounces at normal speed; shorter mainly in turbo and reduced; owner screenshot and video review |
| Emoji differ per platform in 2D and portraits | Inconsistent look | Emoji are flavour only (§2.5); pips and labels carry the meaning; P2 SVG portraits |
| `css/stability.css` (a T1 file) is extended by T5 | Ownership confusion | The PM records the handoff in TASK_BOARD before R2 starts |

---

## 16. Priority summary and cut list

| P0 | P1 | P2 (cut if needed, and list it) |
|---|---|---|
| tokens and contrast · `.num` ₪ fix · 12 px floor · stars outline · non-colour cues · icon set (functional) · world identity data · char portrait and pawn ring · feedback durations · overlay queue · turn budget and skip · plinths, pips, stage kit, activity badges (3D + 2D) · `setLevel`/`pulse`/`syncLevels` · asset info (3D pick, 2D buttons, sheet rows, modal) · `motion.js` and reduced-motion variants and settings · audio suspend when hidden · tiers with DPR cap and shadows · tile instancing · model flattening · label pool · pause hidden · dispose on world change · `perfStats`/`?perf` · tests §13 | px → rem font tokens · SVG life-chip icons · "לנהל את העסק" action · governor · lazy life-model loading · texMB budget gate · manual device FPS | self-hosted fonts with `unicode-range` and Frank Ruhl Libre · Blender `stage_kit.glb` · T3 activity props (rival stall, smoke, shelves) · SVG character portraits · GLB quantization |
