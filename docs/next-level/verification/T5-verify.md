# T5 "Living city & visual identity": independent verification

- **Verified commit:** HEAD `003d11d` on `feat/rat-race-next-level`. The T5 code is `6a43039…7e06659` plus the T5 hooks in `ca2c4c8`. I worked on a clean export (`git archive HEAD | tar -x -C /tmp/v5/wt`). Uncommitted edits in the shared tree (`js/game.js`, `js/ui.js`, `js/onboard.js`, `css/game.css`, tests) are **not** covered.
- **Base:** `/tmp/basewt` (706c0ff app code).
- **Copies:**
  - Branch: `SRC=/tmp/v5/wt COPY_DIR=/tmp/v5 PORT_BASE=8900 bash tests/serve_copies.sh`, served on :8900–8902 (real copy :8902).
  - Base: I did **not** run `serve_copies.sh` with `SRC=/tmp/basewt`. The base tree's own `make_*copy.sh` ignore `COPY_DIR` and would have rebuilt the shared `/tmp/rr2real` and `/tmp/rr2lobby` (the T5 review's process note). Instead I ran HEAD's `make_realcopy.sh` with `SRC=/tmp/basewt COPY_DIR=/tmp/v5base` and served it on **:8907**. The shared `/tmp/rr2*` copies were left untouched (mtime unchanged).
- **Safety:** every browser context ran with the `tests/fakebackend.py` guard (`install(ctx, fb)` plus `chrome_args('offline')`: DNS block and `--no-proxy-server`). The T5 e2e and perf probe use their own DNS block. Every run reported the guard clean: 0 requests to `*.supabase.co`. No code edits, no git writes. This file is the only file I created in the repo.
- **Environment:** google-chrome 153 + swiftshader on a shared 2-core box. Other agents were running browsers at the same time, so the 1-minute load average was **2.1–10.8** (budget `load_max` 2.5). Every timing below carries its load and is marked noisy where it applies. Counts (draw calls, bytes, GLB lists, frames, kit instances) are exact.
- **Artefacts:**
  - Probes: `/tmp/v5/probes/` (`verify_t5.py`, `find_states.mjs`, `tiers.py`, `pick_dbg.py`, `bidi_modal.py`, and `perfcopy/` = perf_probe with one documented change, §3).
  - Logs and JSON: `/tmp/v5/logs/`.
  - Perf: `/tmp/v5/perf/` (`compare-desk.md`, `phone/compare-phone.md`).
  - Screenshots: `/tmp/v5/shots/` (e2e set in `/tmp/v5/shots/e2e/`).

**Verdict.**

- **The rendering lane (part B) and the review fixes hold up under my own probes.** M-1, M-2 (including the *real* link-failure path), M-3 (lobby radios in-session, governor disarm/re-arm), M-4, M-5, raycast-first picking and the 3D→2D context release are all confirmed.
- **The living city works in real, engine-built games in w1, w2 and w3:**
  - plinths with the world rim;
  - engine stage → pips and kit;
  - an animated stage-up during real UI turns;
  - resume without feedback;
  - a w2 upgrade in 3D and 2D;
  - tap-to-inspect with exact `metrics()` values.
- **The in-game UI half of T5 (U2) is largely not delivered**, and it accounts for most of the failures:
  - no §4.2 feedback queue and no level-up card;
  - the level-up feedback can be silently dropped (**D1**);
  - several §12 strings are missing;
  - focus is lost after the keyboard sheet path on phones (**D2**);
  - no character portraits.
- **A-36 cannot pass with the §3 colours as specified.**
- **Tally:** 45 criteria → **32 PASS** (6 of them partial or unit-only), **8 FAIL**, **5 NOT VERIFIED**.

---------------------------------------------------------------------------------------------------

## 1. Suites (clean export, run one after another)

| Command | Load at start | Result |
|---|---|---|
| `node tests/contrast.test.mjs` | 5.07 | **145/0** |
| `node tests/render_vocab.test.mjs` | 5.07 | **286/0** |
| `node tests/render_api.test.mjs` | 5.07 | **231/0** |
| `python3 tests/t5_render_e2e.py http://localhost:8902/ --shots=/tmp/v5/shots/e2e` | 4.91 | **66/0**, 0 page errors (boot, city, pick, hidden, turn, motion, worlds, review, phone, twod, shots) |
| `python3 tests/a11y_e2e.py` **branch** :8902 | 3.66 → 6.47 | 7 PASS, 6 FAIL, 3 STALE, 16 not implemented, 7 N/A. Guard clean. See below |
| `python3 tests/a11y_e2e.py` **base** :8907 | 5.49 → 4.96 | 10 PASS, 6 FAIL, 18 not implemented, 10 N/A. Guard clean |

**a11y, branch vs base (same harness):**

- **Better on the branch:**
  - K-1: the base's first Tab stops were in the hidden HUD; on the branch they are in the lobby (FAIL → PASS).
  - The axe serious-violation count went from 12 unallowlisted to 4. The 4 that remain are all T4's `#endShare` label-content-name-mismatch.
  - Three allowlist entries are now STALE (fixed).
- **Worse on the branch:**
  - **AX-T 24×24:** PASS → FAIL. The world view at 360 px has radio `input`s of 18×18 and 22×22. These are the world-view mode/learning radios (T4 lane), not T5 controls. T5's settings radios measure 100–144 × 44 (§2, A-39).
  - **K-3 crashed** on the branch: "game did not start" after 240 s at load ~5. K-2/K-4/K-7/K-8/K-9 therefore did not run on the branch and are not compared.
- **Unchanged:**
  - AX-T 44 px still fails on both. The branch list is different: chips of 38 px, `.rvp` (T6) 68×38.
  - AX-M (reduced motion: no long or infinite CSS animation) passes on both.

## 2. Review fixes (my own probes, `verify_t5.py --only=fixes`, `pick_dbg.py`; load 2.5–4.8)

| Fix | Probe | Result |
|---|---|---|
| **M-1** model swapped in mid-bounce | Lazily loaded `life/wedding` spawned at `setSpeed(20)` (normal) and `life/hospital` at `setSpeed(60)` + reduced motion (the scale race). Measured with `itemPose()` | **PASS.** At swap: y 0.18 = `CITY_Y` and scale 1.247 = rest, in scene, no stand-in left. Before the swap: normal y 7 (mid-bounce); reduced scale 1.122 (mid 0.9→1). `fix-m1-after-swap.png` |
| **M-2** shader error path | **Real path, not only `shaderCheck({fail})`.** An init script makes `getProgramParameter(…, LINK_STATUS)` return false. three does not read it while `checkShaderErrors` is off, so only the T5 check sees it | **PASS.** Exactly one `console.error` "[render] the flattened-model shader failed to link…". `__rrErrors` contains `flat_shader_link`. `perfStats().shader = {checked:true, ok:false}`. The board is still drawn (30 calls), no page error (`fix-m2-real-fallback.png`). `checkShaderErrors` stays off on the boot path |
| **M-3** quality in-session | Real lobby UI: profile → "איכות גרפיקה" radios during a running w1 game | **PASS.** Status line "עכשיו: חסכונית" matches the scene (low on software GL). בינונית → scene `mid`, shadows on, status "עכשיו: בינונית". Back to אוטומטית → `low`, shadows off, "עכשיו: חסכונית" (`fix-m3-settings-1300.png`) |
| **M-3** governor | `?hq&perf=1`, `__rrPerfInject(50, 90)` | **PASS.** An explicit `high` pref disarms it (no step). `auto` re-arms it: high→mid once. A second injection within 30 s does not step. T5-Q1 toast shown |
| **M-4** inert 2D cards | Real w1 game in `?ff=board2d:on`. Focus the business card → Enter | **PASS.** `#gm` "עגלת קפה" opens with rows = `metrics()`. Card name: "עגלת קפה · עסק, בהתחלה · עוד לא יציב" (`twod-real-modal-1300.png`). Minor: after Escape, focus lands on a button that is not the card (D13) |
| **M-5** gate registration | `tests/run_all.sh` | **PASS.** `render_vocab` (tier 0) and `t5_render_e2e` (tier 2, 2400 s) are registered; the phantom rows are gone |
| **m-1** picking order | Fixture city (24 items) at overview. A 2–5 px grid of `pickAt` samples was compared with "nearest projected centre ≤ 22.5 px" and with the proxies' screen boxes (`pickRects`) | **PASS (raycast first).** 183 points (1300) and 85 points (390) return the ray-hit item although another centre is nearer. Points outside every box use the 22 px nearest-centre fallback: 70/70 (1300) and 457/457 (390) correct. In follow mode only 1–2 items are on screen; rayWins 37/20 there. (My first in-game variant, with items spawned outside the follow view, was a probe error and is not counted) |
| **m-2** 3D→2D releases the context | Real HUD switch `#liteBtn` in a running w1 game | **PASS.** `#c` `isContextLost() === true`, canvas hidden, 2D board shown |

## 3. Performance (perf_probe ABAB, base :8907 vs branch :8902, desk + phone)

**Harness deviation (D11).** HEAD `tests/perf_probe.py` phase A starts the game **unseeded**. On the branch that opens the T4 tutorial's first-payday card at once (`perf-dbg-branch.png`), so `#roll` never enables and the run times out after 300 s (`/tmp/v5/perf/desk.log` of the first attempt). I ran a private copy, `/tmp/v5/probes/perfcopy/perf_probe.py`, whose only change is `seeded=True` in phase A, for **both** base and branch. The seed is the stars/tutorialDone progress the probe already uses for phase B. Consequences:

- PF-6 (bytes and requests before the lobby) is **not comparable** with the budget baseline, because the seeded lobby is the full home.
- The A/B comparison itself is fair.

**Desk 1300×820, `--runs=2 --leak`.** Run order: base, branch, base, branch.

| Metric | Base, valid run (load 2.08) | Branch, valid run (load 2.39) | Noisy runs (base / branch; load) | Budget | Verdict |
|---|---|---|---|---|---|
| PF-1 nav → lobby usable | 576 ms | 397 ms | 598 (6.8) / 956 (5.33) | 800 | INCONCLUSIVE (noisy medians) |
| PF-2 longest task, 10 s lobby idle | **13.3 s** | **0.21 s** | 26.4 s (6.8) / 0.27 s (5.33) | 1000 | branch ≪ budget in every run; formally INCONCLUSIVE |
| PF-2b click world at lobby + 2 s → world view | 16.8 s (2.97 ⚠) | 0.74 s (2.58 ⚠) | 19.6 s (7.3) / 1.22 s (6.63) | 500 | FAIL by gate (median 980), every branch run noisy; −94 % vs base |
| PF-3 nav → first roll | 34.7 s | 12.2 s | 48.0 s / 15.3 s | 15000 | INCONCLUSIVE; branch under budget in both runs |
| PF-4 character click → roll | 4.96 s | 3.44 s | 5.32 s / 6.84 s | 8000 | INCONCLUSIVE |
| PF-5 bytes before first roll | 8.58 MB | **5.77 MB** | — | 5.5 | **FAIL** (exact; see below) |
| PF-7 GLB violations before roll | 12 | **0** | — | 0 | PASS. The branch GLBs before roll are `pawns/classic` + `w1/{apartment,business,stock,crypto}` |
| PF-10 / 10b DOM nodes range / attached range (5 re-entries) | 2717 / 37 | 3628 / 141 | — | 150 / 60 | FAIL (CR-04, T7; not a T5 retainer, per the notes) |
| PF-12 heap growth | +1.34 MB | +1.08 MB | — | 1.0 | FAIL (marginal) |
| PF-13 GL buf / vao / tex / prog on repeat visits | +202 / +63 / 0 / 0 | **−15 / −2 / −1 / 0** | — | 10/5/2/2 | PASS |
| PF-14 GL draws, lobby over paused game | 0 | 0 | — | 0 | PASS |
| PF-16 frames in 5 s after 3 s quiet | 3 | **0** | — | 2 | PASS (A-30) |
| PF-17 home → lobby | 14.0 s | 6.9 s | (B phase load 8.04 / 2.58 ⚠) | 500 | FAIL (noisy) |
| PF-18 world switch → roll | 10.3 s | 9.7 s | noisy | 10000 | INCONCLUSIVE |
| PF-20 dice fps (report) | 1.1 | 2.3 | noisy | — | report |
| PF-23 page errors | 0 | 0 | — | 0 | PASS |

The branch's 5.77 MB before roll includes exactly the 5 GLBs T5 intended. The part-B notes measured 5.31 MB. The extra ~0.46 MB comes from non-GLB resources on the current HEAD (86 requests before roll), most likely T4/T6 code that landed after T5. It is not attributable to T5's model loading, but PF-5 now fails.

**Phone (390×844, DPR 3, touch, CPU ×4), `--runs=1`:**

| Metric | Base | Branch | Load |
|---|---|---|---|
| nav → roll (PF-21) | 32.2 s | 15.7 s | 3.23 / 9.44 — **noisy** |
| longest idle task | 14.8 s | 1.69 s | noisy |
| input → world view | 11.1 s | 2.69 s | 7.39 / 10.02 — noisy |
| bytes before roll / GLB violations | 8.58 MB / 12 | 5.77 MB / 0 | exact |

**T5 count budgets (A-26/27/28):** `tiers.py`, w1 overview desk, fixture city, tier set through `setQualityPref`. Counts are exact; the load was 8–11.

| Items | Tier | Calls (budget) | Triangles (budget) | texMB (budget) |
|---|---|---|---|---|
| 0 | low / mid / high | 30 / 30 / 30 (≤40/45/50) ✓ | 19.4k / 20.9k / 22.5k | 15.0 ✗ / 19.0 ✓ / 31.0 ✓ (≤10/20/40) |
| 12 mixed | low / mid / high | 58 / 58 / 58 (≤70/90/100) ✓ | 74.7k / 76.8k / 78.4k | 16.7 ✗ / 20.7 ✗ / 32.7 ✓ |
| 24 mixed | low / mid / high | 70 / 70 / 70 (≤80/110/130) ✓ (baseline 304) | 125.5k / 127.5k / 129.0k (≤130k/150k/170k) ✓, low with 4.5k margin | 16.7 ✗ / 20.7 ✗ / 32.7 ✓ |

The DPR is 0.6 at every tier on software GL, which is by design. Calls are identical across tiers; `renderer.info.render.calls` evidently does not include the shadow pass. Treat the calls column as main-pass calls (the §1.1 method).

## 4. Living city in real games (`verify_t5.py --only=city`; load 3.9–4.6)

**How the states were built.** States come from the real engine, with no hand edits: `/tmp/v5/probes/find_states.mjs` → `states.json`. The policy is "start a business > buy > safe option". The same policy is mirrored by the browser autoplayer, which clicks `#evCard button[data-o]`.

| State | Seed | Assets | Business | Engine prediction |
|---|---|---|---|---|
| w1 `dev` | 20 | `a3` דירת 3 חדרים בחדרה, `a6` **עגלת קפה** | stage 0 | stage 0→1 in 2 rolls |
| w3 `importer` | 23 | 4 assets including `a2` **מכבסה** | stage 0 | 0→1 in 1 roll |
| w2 `lawyer` | 2 | — | — | the next roll lands on the upgrade tile |

Each state was loaded with `G.startGame({state})` (not awaited: `startGame` waits on the coach). After that, every action went through the real UI.

| Check | w1 | w3 |
|---|---|---|
| A-41: plinth per item, world rim | 3 items / 3 plinths, rim `#f2b632` ✓ | 6 / 6, rim `#0ea5e9` ✓ |
| A-12: engine stage → `levelOf().n`, pips | n 0 = `metrics().businesses[].stage` 0; pips 0 on / 3 off; scaffold + cone, scale 0.8 ✓ | same ✓ (laundromat) |
| A-17/A-22: tap on the business → `#gm` | Title "עגלת קפה", tag "עסק". Rows = `fmtM`/`sgn` of `metrics()`: cf ₪0, value ₪39,923, debt ₪0, equity ₪39,923, "בחודש שעבר", "פעילה (אתה עובד בעסק)", "−12 🔋" ✓. Every `.num` is Rubik ✓ | "מכבסה" +₪2,800 / ₪102,194 … ✓ |
| Non-business asset tap | `a3` ✓ | `a1` warehouse ✓ ("⁦₪1.31⁩ מיליון": text equal after removing the bidi marks) |
| Level block | "בהתחלה · עוד לא יציב" + T5-H0 hint, pips 0/3, `aria-label` = level text ✓ | ✓ |
| Actions / focus | "לדוח הכספי" (primary, focused) + "סגירה" ✓ | ✓ |
| Escape after a **canvas** tap | Modal closes; focus → `<body>`, not the canvas (minor; the canvas is not focusable) | same |
| A-13: real UI turns → stage change | 0→1 after 2 turns (as predicted) ✓ | 0→1 after 1 turn ✓ |
| Level-up animated | ✓ The first sample after the change has scale 0.998 against a new rest of 1.247 (tween path; the silent path sets the scale synchronously, code `setLevel`). w3 also showed 1.264 (the 12 % bump) | ✓ |
| Level-up feedback visible | ✗ **Never shown.** The live region announced "עגלת קפה עלה לשלב 1", but `#toast` showed only 🎲 / 📚 / 📚 / … (**D1**) | ✓ one toast "⬆️ מכבסה: שלב 1 מתוך 3" + live "מכבסה עלה לשלב 1" |
| T5-U1/U2 card ("העסק התקדם!", B channel) | ✗ not implemented | ✗ |
| After the change | pips 1/3, sign sprite 1, scaffold gone, scale 1.0 ✓ | ✓ |
| A-15: reload → lobby → "continue" | Levels identical `{a6:1}`, no level toast or announce, scale = rest from the first sample ✓ | ✓ `{a2:1}` |
| Activity badge | not reachable: `activity` is always null in real games (**D9**) | same |

**w2 upgrade (A-14):** real roll → upgrade card (`up:2, up:1, trim:e2, pass`) → click `up:2`.

- 3D: `a2` level goes from `{upgrade, n 0, of 2}` to `{n 1, parts.band: true}` ✓.
- 2D (`?ff=board2d:on`): `data-level` 0→1, pips "○○"→"●○", name "… שדרוגים: 1 מתוך 2" ✓ (`upgrade-w2-{3d,2d}-1300.png`).

**Gating (A-21).** I dispatched a tap (pointerdown/up) on the canvas at the business:

- during the dice/hop animation → no modal ✓;
- with an event card open → no modal ✓;
- with the lobby open → no modal ✓.

The coach bubble also blocks the modal: seen incidentally, the tap highlighted only. The 3 `setPointerCapture` page errors in that run come from my synthetic `PointerEvent` with a fake `pointerId` reaching OrbitControls. They are a probe artefact and not counted.

**Keyboard path (A-20)**, real w1 state, coach skipped:

- **1300 px:** the sheet is a permanent side panel and `#sheetBtn` is hidden. Tab → asset row `alink` (18 tabs) → Enter → modal, focus on "לדוח הכספי" → Escape → focus back on the `a6` row ✓.
- **390 px and 360 px:** Tab → `#sheetBtn` (14 tabs) → Enter → Tab ×6 → row → Enter → modal with correct rows, focus on the primary button ✓ → Escape → focus on **`<body>`** ✗ (**D2**).

**Touch targets (A-39):**

- Sheet rows are 60×44.
- Modal actions are 169–230 × 44.
- The settings radio labels (motion + quality, 7 options) are 100–144 × 44 at 390, 360 and 1300 ✓ (`settings-{390,360,1300}.png`).

## 5. Reduced motion (`verify_t5.py --only=motion`; load 3.9–5.2), 3D and 2D, real w1 game and a real roll

| Case | `html[data-motion]` | Scene reduced / damping | `#roll` animation | Requested turn (`perfStats().lastTurnMs`) |
|---|---|---|---|---|
| 3D, OS reduce | reduce | true / false | none | **350 ms** ✓ |
| 3D, in-app `reduce` + OS no-pref | reduce | true / false | none | 350 ✓ |
| 3D, in-app `full` + OS reduce | full | false / true | breathe | 2730 (full motion, 9-tile move) ✓ |
| 3D, no preference | full | false / true | breathe | 2410 ✓ (A-9: e2e 2410 normal / 1205 turbo) |
| 3D, live lobby radio מופחתת during a game | reduce | true / false | — | applies in-session ✓ (`motion-settings-1300.png`) |
| 2D, OS reduce | reduce | (board2d) | none | **270 ms** ✓ |
| 2D, in-app reduce | reduce | — | none | 270 ✓ |
| 2D, none | full | — | breathe | 1500 |

The e2e adds the following for reduced motion:

- dice 150 ms with no hand;
- a 7-tile move requested ≤ 300 ms;
- no confetti mesh (control: full at tier mid adds one);
- `shake()` does not start (control: it does);
- damping off.

**Not exercised:**

- `.coin` flyers: 0 even in the full-motion control, because no coin-flying purchase happened.
- The life-story typewriter.

**Audio (A-25):** I wrapped the AudioContext and set `document.hidden` + `visibilitychange`:

- running → hidden **suspended** → visible **running** ✓;
- after the mute button: hidden suspended → visible running (the context resumes, sound stays muted).

## 6. Visual identity (`verify_t5.py --only=visual`; load 3.7–4.4)

**Screenshots** of real games started from the lobby (character 1; h through history → first scenario):

- `world-{w1,w2,w3,w4,h}-{1300,390,1300-2d}.png`;
- contact sheets `contact-worlds-1300.png`, `contact-worlds-390.png`, `contact-worlds-1300-2d.png`;
- the fixture-city set (overview, desk + phone) from the e2e: `/tmp/v5/shots/e2e/{w}-{desk,phone}-fixture.png`.

**By eye:**

- w1 warm afternoon, w2 dusk/neon, w3 sea blue, w4 night with glass, h sepia. Each has its plinth rim (A-41 e2e: `#f2b632 / #ff4fd8 / #0ea5e9 / #22d3ee / #c8a24a`).
- The 2D motifs (dots, neon grid, waves, stars, newsprint) are visible.
- Money is RTL-correct in HUD, sheet and modal: `₪8.4K`, `+₪4.7K`, "דולר ₪3.60", "ריבית 3%".
- A glyph-position probe of the modal (`bidi_modal.py`) confirms `+` `₪` digits in LTR order inside `.num`.

**DOM scans on all 15 screens (5 worlds × 1300 / 390 / 1300-2D):**

- **0** text nodes with ₪ in Secular One (A-5).
- **0** ₪/$/% number tokens outside an LTR/isolate context (A-6). This is my approximation of `bidiscan`; a11y's AX-B is still "not implemented".
- **0** visible text below 12 px (A-4).
- 📅 is not rendered.
- **At 1300 px `#helpBtn` (❓) and `#liteBtn` (🪶) have no `svg`** (A-38, D4).

**World distinctness (A-36), ΔE76:**

- Computed from the §3 identity colours, the boards of w1–h (8.9), w3–h (11.0) and w1–w4 (14.9) are below 15.
- Measured on the fixture shots, the board-centre region gives w3–h 2.0, w1–w3 4.4 and w1–h 5.8. The sky region gives w1–h 12.1; the other sky pairs are 20–87.

§3 forbids changing board colours, so A-36 as written is unreachable (D7).

**Flatten (A-45, partial):** `?hq` vs `?hq&flat=0`, overview, reduced motion, no city, HUD hidden.

- w1: mean ΔE **0.00** (p99 0.0), calls 30 vs 56.
- w2: mean ΔE **0.00**, calls 81 vs 179.

Only the landmarks/decor and pawn models of w1/w2 were covered, not all 36 models (`flat-*.png`).

---------------------------------------------------------------------------------------------------

## 7. Criteria table (A-1 … A-45)

| Id | Status | Evidence |
|---|---|---|
| A-1 | **PASS** | contrast.test 145/0. Text tokens ×3 surfaces ×2 modes, `--accent-ink` ×5 worlds ×2 |
| A-2 | **PASS** | contrast.test non-text: focus 3.77 / 5.39, star/pip strokes 4.70 / 5.37 |
| A-3 | **NOT VERIFIED** (partial) | The a11y axe run (wcag2aa includes color-contrast) has 0 contrast violations on its screens (lobby, HUD, card, end; light, dark, 360). The asset-info modal, level-up card and sheet (desk N/A) were not in the axe tour. No 12-screen computed audit was rerun |
| A-4 | **PASS** | CSS scans (contrast.test; render_vocab covers stability.css) + 15 rendered game screens: 0 nodes below 12 px |
| A-5 | **PASS** (partial) | 0 ₪ in Secular One on 15 screens. The crypto "נסחר ב־₪1" card was not forced |
| A-6 | **PASS** (approx.) | My scan: 0 unisolated ₪/$/% tokens on 15 screens; modal glyph order verified |
| A-7 | **NOT VERIFIED** | Static only: `כוכבים מתוך 3` in lobby.js / main.js (CR-L2) |
| A-8 | **PASS** | render_vocab A-8; `MOTION.spawn` 480 × `speed` 0.5 = 240 (`D()`) |
| A-9 | **PASS** | e2e 2410 normal / 1205 turbo; real reduced turn 350 (3D) / 270 (2D) |
| A-10 | **PASS** (partial) | e2e: `skip()` resolves the throw in 1 ms. "Same state with and without the tap" was not checked |
| A-11 | **NOT VERIFIED** (likely FAIL) | §4.2 `feedback()` queue, `holdFeedback` and `flushFeedback` are absent. Only the phone overlay queue in ui.js exists. Not measured. See D1/D3 |
| A-12 | **PASS** | e2e fixture stages 0–3 (3D parts + kit instance counts; 2D `data-level`, border, names). Real w1/w3: stage 0 and 1 kits and pips |
| A-13 | **FAIL** | Up: one animated `setLevel` ✓, but no T5-U1/U2 card, and the toast was **dropped** in w1 (D1). Down: no natural state found in 400 seeds (not run); the code shows "⬇️ … ירד לשלב n", not T5-D1 |
| A-14 | **PASS** | Real w2 upgrade: 3D pips 0/2→1/2 + band; 2D `data-level` + name |
| A-15 | **PASS** | Real w1/w3 resume: identical levels, no feedback, no animation |
| A-16 | **PASS** | e2e: a business without a stage gets the plinth only |
| A-17 | **PASS** | Real tap → `#gm` with the name (w1, w3); e2e: 12 px drag / empty tile → none. The 300 ms bound cannot be measured on swiftshader |
| A-18 | **FAIL** (documented) | 390 px, 24 items: 30/96 probes at ±22 px return the aimed item, min pitch 33 px (e2e). Raycast-first is by design (m-1) |
| A-19 | **PASS** | e2e: buttons + T5-C2 names + Enter → pick. Real game: Enter on the 2D card opens the modal (M-4) |
| A-20 | **FAIL** | Desktop ✓. 390/360: focus returns to `<body>`, not the row (D2) |
| A-21 | **PASS** | Dice/hops, event card, lobby (+ coach seen) → no modal |
| A-22 | **PASS** | Modal rows = `metrics()` for 4 real assets (business + plain), in `.num` Rubik |
| A-23 | **PASS** (partial) | 3D/2D dice ≤ 200, move ≤ 300, no confetti, no shake, damping off (e2e + real). Coins and the life story were not exercised |
| A-24 | **PASS** | All 4 OS × app combinations + the live radio; `#roll` CSS animation follows `data-motion` |
| A-25 | **PASS** | hidden → suspended, visible → running; the mute switch works |
| A-26 | **PASS** | 0 / 12 / 24 items: 30 / 58 / 70 calls at every tier (baseline 304) |
| A-27 | **PASS** | 125.5k / 127.5k / 129.0k (low / mid / high) |
| A-28 (P1) | **FAIL** | texMB low 16.7 (≤10), mid 20.7 (≤20); high 32.7 ✓ |
| A-29 | **PASS** (unit) | render_vocab `tierDpr` 1.75/1.5/1 and 2/1.5/1. Software GL is always 0.6, so a device DPR cannot be observed here |
| A-30 | **PASS** | e2e 0 frames; PF-16 0 |
| A-31 | **PASS** | e2e 0 frames hidden; resumes (4 frames) |
| A-32 | **PASS** | e2e w1→w2→w1: +1 geometry / +1 texture; cache = w1/pawns/life; PF-13 negative deltas |
| A-33 (P1) | **PASS** | Governor probe (one step, none within 30 s, explicit choice disarms) + T5-Q1 toast |
| A-34 (P1) | **NOT VERIFIED** | Manual device FPS; no device here |
| A-35 | **PASS** | 5 GLBs before roll (the w1 set + pawn); PF-7 0 violations |
| A-36 | **FAIL** | §3 colours: board ΔE < 15 for w1–h, w3–h, w1–w4; rendered sky w1–h 12.1 (D7) |
| A-37 | **FAIL** | No portrait tokens on character cards, HUD or end screen. The pawn ring (3D) / token border (2D) colour is wired via `setPawnRing(CHAR_STYLE)`, checked in code only |
| A-38 | **FAIL** | Desktop `#helpBtn`/`#liteBtn` have no svg; 📅 not rendered on the screens visited (still a code fallback in ui.js:361/907 and game.js:783) |
| A-39 | **PASS** | Settings radios, sheet rows and modal actions ≥ 44 at 390/360; 2D cards ≥ 24 (e2e) |
| A-40 | **FAIL** | Missing: T5-U1/U2, T5-D1, T5-M1…M3, T5-W1, T5-C1 (`#c` keeps "לוח המשחק התלת־ממדי"), T5-I1 (shipped as "🏪 לוח העסק"). Present: L0–L2, H0–H3, A1–A5, I0, I2, I3, S0–S2, Q1, LC |
| A-41 | **PASS** | All 5 worlds × desk/phone (e2e fixture) + real w1/w3 |
| A-42 | **PASS** | 0 page errors in the e2e and in every product flow I ran. The only page errors were caused by my synthetic pointer events. Guard clean everywhere |
| A-43 | **NOT VERIFIED** | Only the T5 node suites were run (all pass); `game_e2e.py` w1–w4 3D/2D was not run |
| A-44 | **PASS** | render_api 231/0 + render_vocab parity |
| A-45 | **PASS** (partial) | ΔE 0.00 for the w1/w2 landmark/pawn sets; not all 36 models |

## 8. Defects

| # | Severity | Lane | Defect | Repro / evidence |
|---|---|---|---|---|
| **D1** | **major** | UI (U2) + shell | **The business level-up feedback can be silently dropped.** `ui.toast` keeps at most 4 queued toasts and drops the oldest (`if (tq.length > 4) tq.splice(0, tq.length - 4)`). `syncLevels(true)` runs before the news/lesson toasts in `applyOut`, so on a busy payday the "⬆️" toast is the oldest and is discarded. The spec (§4.2 rule 6) says celebratory items are never dropped. There is also no B-channel card at all (T5-U1/U2) | Load `states.json:w1_up` (seed 20) and play 2 turns with the policy. The engine stage goes 0→1 and the 3D animates. The live region says "עגלת קפה עלה לשלב 1", but `#toast` only ever showed 🎲 + 📚 ×4 (`verify_city2.json`). In w3 (fewer toasts) it shows |
| **D2** | **major** (P0 a11y) | shell | On phones (≤ 820 px), activating a sheet asset row closes the sheet (`game.js` `if (innerWidth <= 820) ui.toggleSheet(false)`). The modal's focus restore then targets a hidden button, and Escape leaves focus on `<body>`. Keyboard and screen-reader users lose their place (A-20) | `verify_keys2.json` 390/360: `back.focus = BODY`, `sheetOpen=false`. Desktop restores to the row |
| **D3** | **major** (scope) | UI (U2) / shell | Not delivered: the §4.2 overlay queue API (`feedback` kinds, `holdFeedback`, `flushFeedback`); milestones M1–M3; the world-entry banner (W1); the `#c` aria-label (C1); the level-down toast text (D1 string); the T5-U2 level text with label ("⬆️ מכבסה: שלב 1 מתוך 3" lacks "· יציב") | Static grep (A-40 row) + observed toasts |
| D4 | minor | T1/T4 chrome | `#helpBtn` ❓ and `#liteBtn` 🪶 render emoji, not SVG, at desktop. 📅 is kept as the fallback plan icon and in the no-energy screen | `verify_visual.json` A-38 rows |
| D5 | minor | UI/lobby | No character portrait tokens (§3.1) on the select cards, the HUD or the end screen | `grep CHAR_STYLE js/` → game.js only |
| D6 | minor (P1) | rendering | texMB low 16.7 > 10 and mid 20.7 > 20 (PMREM env + centre texture + shadow map) | `tiers.json` |
| D7 | minor (spec) | director | A-36 conflicts with §3: the fixed board colours w1 `#f6efe2`, h `#efe4c8`, w3 `#e9d5a8` and w4 `#e8f1ff` cannot reach ΔE 15. Decide whether to change the criterion (sky + accent + motif) or the colours | §6 numbers |
| D8 | minor (documented) | rendering | A-18 fails as written at 24 items / 390 px (30/96) | e2e `phone` |
| D9 | minor | engine / shell | Activity badges never appear in real games. `metrics().assets[].business` has no `activity`, `cityModels` does not carry it, and `game.js levelOf` reads `a.business.activity` → always null. The §5.2 activity badges and the modal activity line are fixture-only | `levelOf(a6).activity === null` in w1/w3 |
| D10 | minor | rendering / UI | After Enter on a 2D city card → Escape, focus lands on another button, not the card | `tiers.log` `focusBack: 'BUTTON'` (no `data-key`) |
| D11 | minor (harness) | T7 | `tests/perf_probe.py` phase A (unseeded) hangs on HEAD, because the tutorial's first-payday card keeps `#roll` disabled. PF-5 is 5.77 MB > 5.5 on HEAD (5 GLBs = the T5 set; the extra bytes are non-GLB) | `/tmp/v5/perf/desk.log` (first attempt), `perf-dbg-branch.png` |
| D12 | info (pre-existing, not T5) | shell | The business news toast renders "🏪 undefined:" (`game.js` `n.name` undefined), seen in the w1 real game | `verify_city.json` toast list |
| D13 | info (T4) | lobby | a11y AX-T: the branch world view at 360 has 18×18 / 22×22 radio inputs (base had none). The branch K-3 timed out at load ~5 | a11y logs |

## 9. Not covered

- The 2D level-down/trouble flash in real games: no natural down state was found.
- The life-story typewriter under reduced motion.
- `.coin` flyers.
- The A-3 12-screen contrast audit on asset-info, level-up and sheet.
- The lobby stars (A-7).
- The pawn-ring colour on screen.
- Device FPS (A-34).
- `game_e2e` regression (A-43).
- A-45 for all 36 models.
- A-10 state identity.
