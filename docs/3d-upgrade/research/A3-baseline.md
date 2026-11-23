# A3 — Baseline before the 3D world upgrade (team א, independent tester)

**What was measured:** `git archive HEAD` of `feature/3d-world-upgrade` @ `b651f3c` (= main `94138c8` + the brief), extracted to /tmp/a3/wt. Copies were built by `tests/serve_copies.sh` with `COPY_DIR=/tmp/a3 PORT_BASE=9400` (rr2test :9400, rr2lobby :9401, rr2real :9402). /tmp/rr2* and ports 8770–8772 were not touched. The worktree is not a git repo, so run_all prints `HEAD ` (empty) / `clean`.
**Safety:** offline only. Every browser context used the fake backend and guard from `tests/fakebackend.py`, with Chrome `--no-proxy-server` and `*.supabase.co` unresolvable. Every guard came out clean. No repo file was edited except this report and the PNG/JPG files in `docs/3d-upgrade/baseline/`. No git writes.
**Environment:** shared 2-core box. Chrome 153 headless (`/usr/bin/google-chrome`). WebGL is **software (ANGLE → SwiftShader)**, so the game's quality detection picks tier **low** (dpr capped 0.6, no shadows, no AA). No result here comes from a physical device or a GPU. Load (1-min) was sampled every 30 s in /tmp/a3/load.log: **0.37–11.59** over the session. From 08:10 onward, other agents' browser suites kept it mostly at 4–10. The load per suite is given below.
**Interrupted:** the session server restarted at ~10:55. The coordinator said not to start new long runs. Perf desk run 3 + `--leak` and the whole 3g/`--twod` probe were stopped or never ran (see §2).

---

## 1. Test suites

### Tier 0 + tier 1 — `run_all.sh --tier=1 --keep-going --no-serve` (07:45–08:43, logs /tmp/a3/runs/20261123-074507)

24 PASS / 1 FAIL (balance_gates).

| suite | result | counts | duration | load (1-min) |
|---|---|---|---|---|
| guard_lint | PASS | 0 violations | 0 s | 0.5–1.3 |
| finance / business / progress / energy / library | PASS | 37 / 104 / 41 / 26 / 6 passed | 0 s | ≈1 |
| saves / flags / render_api / contrast | PASS | 105 / 16 / 231 / 146 passed | ≤1 s | ≈1 |
| preload | PASS | 189 passed | 0 s | ≈1 |
| build_edge_check | PASS | verify-result pins engine d1d75867c5b6… | 0 s | ≈1 |
| fakebackend_test / backend_contract | PASS | 20/20 · 100 passed, 0 DIFF-ASSUMED | 4 s / 1 s | ≈1 |
| verify | PASS | 10 passed | 28 s | ≈1.3 |
| determinism | PASS | 2 passed | 78 s | 1.3–1.9 |
| engine | PASS | 52 passed (8 000 random games) | 2 457 s | 1.9 → 10 (others' suites from 08:10) |
| t2 / stories / t4_engine / t4_meta / render_vocab | PASS | 18 / 47 / 9 / 82-of-82 lessons / 286 | 104 / 208 / 20 / 30 / 1 s | 4–8 |
| **balance_gates** (check) | **FAIL** rc=1 | 12 PASS · **8 FAIL** · 14 REPORT · 1 ACCEPTED · 9 MISSING | 0 s | — |
| lobby_smoke | PASS | 4/4 | 6 s | ≈7 |
| game_e2e_w1 (8 turns, desktop) | PASS | ERRORS 0 | 541 s | 1.6–8.4 |

### Tier 2 browser suites — `run_all.sh --tier=2 --strict --keep-going --only=…` (08:48–09:32, logs /tmp/a3/runs/20261123-084832), plus manual runs

| suite | result | counts | duration | load |
|---|---|---|---|---|
| lobby_real | PASS | 18/18 | 120 s | ≈4 |
| game_e2e_phone (w1, 12 turns, `--phone`) | PASS | ERRORS 0 | 293 s | 4–5 |
| game_e2e_2d (w1, 12 turns, `ff=board2d:on`) | PASS | ERRORS 0 | 87 s | ≈4 |
| stability_e2e | PASS | 125 passed, 0 unexpected errors | 560 s | 4–10 |
| t5_render_e2e | PASS | 66 passed | 354 s | 7–11 |
| t6_e2e | **FAIL → PASS on rerun** | run 1: 69/70 (AC-20 createBranch at 4× CPU = 1 051 ms vs ≤ 1 000 ms); rerun (/tmp/a3/runs/t6_rerun): 70/70, AC-20 489 ms | 326 s / 359 s | ≈10 / 6.3–8.9 |
| a11y_e2e `--strict --strict-allowlist` | PASS | PASS 17 · REPORT 5 · N/A 9 · NOT IMPLEMENTED 18; AX-2 axe gate 0 unallowlisted critical/serious; axe moderate: region 278, heading-order 4 | 878 s | 7–10 |
| **game_e2e w2,w3,w4 16 turns `--nl`** (desktop, :9400) | **FAIL ×2 (different causes) — not clean** | run 1 (/tmp/a3/runs/game_e2e_w234_run1): `--nl` section done; w2 turn ≈14 → `Exception: card loop` (a business card, 13 in-card adjustments in a row). Rerun (/tmp/a3/runs/game_e2e_w234): `stuck` inside `test_nextlevel` after `pass` on a w2 deal in pro mentor mode (no roll / card / start for 90 s). An earlier attempt was killed by the tool's 30-min limit; it had no errors up to that point. | 1 165 s / 255 s | 8.1–9.5 / 8.1–12.1 |

The a11y N/A rows were: 09_card ×2 (first landing opened no card), 13_sheet desk (#sheetBtn not visible at that width), 15_help ×3 and 18_learning_end ×3 (not implemented). REPORT rows: AX-W `hEnSr` clipped at 820/1300 (a screen-reader-only span), AX-C landing tile name not announced (needs a label source, CR-27), AX-Z2 400 % zoom OK.

### Pre-existing failures (baseline — not caused by the upgrade)

| failure | class | basis |
|---|---|---|
| balance_gates: G-A1, G-A3, G-A5, G-A7, G-A8, G-A9, T6-G8, B-5a | **real (data), pre-existing** | Same 12/8/14/1/9 split as `docs/next-level/verification/FINAL-verify.md` on 1beb2e1. Inputs are fresh (engine d1d75867c5b63cf2, 14 files). The balance owner decides on these. The 3D work must not change them. |
| t6_e2e AC-20 createBranch timing | **flaky (load)** | 1 051 ms at load ≈10 → 489 ms on rerun. A timing assertion at 4× CPU throttle on a loaded 2-core box. |
| game_e2e w2–w4 `--nl` run 1: `card loop` | **harness** | `run_world` seeds `random.Random(hash(tag))`, and Python string hashing is randomised per process, so the path is random. The business card keeps itself open for 11 of its 12 options. The guard `> 12` trips if the random walk misses `ok` 13 times. This is not a game fault. |
| game_e2e w2–w4 `--nl` rerun: `stuck` after pass in pro mode | **flaky / unconfirmed (probably load)** | It happened at load 12.1. `wait_idle` gives up after 90 s, and with swiftshader frames under that load a pawn move can take that long. FINAL-verify passed the same suite at load ≈4, and T2-verify D9 already lists `--nl` as flaky. **Not cleared**: there was no third run (server restart). The lead should rerun it at load < 3 before the upgrade lands, or the 3D lane inherits an unexplained "stuck". |
| PF-6 / PF-22 (from FINAL-verify) | real, pre-existing | Not re-measured here (perf probe cut short, §2). |

---

## 2. Performance (perf_probe.py)

`perf_probe.py --base=http://localhost:9402/ --cond=desk --runs=3 --leak --gate --wait-quiet=300` started at 10:42. Load never fell to `load_max` 2.5, so every run that finished is **noisy**: its timing gates would read INCONCLUSIVE(noisy). Runs 1–2 completed. Run 3, phase B (`--leak`: PF-10…PF-18, PF-20) and `--cond=3g --twod` (PF-8, PF-9, PF-22) were **NOT RUN**: the session server restarted and the coordinator said not to start new long runs. No JSON summary or gate table was written.

| id | metric | run 1 (load 3.66 / 4.47) | run 2 (load 5.28 / 6.94) | budget | note |
|---|---|---|---|---|---|
| PF-1 | A.lobbyUsableMs | 785 | 526 | 800 | noisy |
| PF-2 | A.lobbyIdleLongTaskMaxMs | 701 | 476 | 1000 | noisy |
| PF-2b | A.inputClickToWorldMs | 1 745 | 2 434 | 500 | over budget under load; FINAL-verify had 397 at load ≤ 2.2 |
| PF-3 | A.navToRollMs | 14 341 | 20 842 | 15 000 | noisy (FINAL-verify clean: 11 631) |
| PF-4 | A.clickToRollMs | 10 112 | 13 008 | 8 000 | noisy (FINAL-verify clean: 2 628) |
| PF-5 | A.bytesBeforeRollMB | **4.59** | **4.59** | 5.5 | H gate: pass (load-independent) |
| PF-7 | A.glbViolations | **0** | **0** | 0 | H gate: pass |
| PF-23 | pageErrors | **0** | **0** | 0 | pass |
| PF-6, PF-8…PF-22 | — | NOT RUN | | | reason above. PF-15/PF-19 are not implemented in the probe anyway; PF-21 is the phone condition, which was not requested. |

**Use as the comparison baseline:** the H-gate values above (4.59 MB, 0 GLB violations, 0 errors) and the clean desk/3g table in `docs/next-level/verification/FINAL-verify.md` (same app files: main 94138c8 contains 1beb2e1 + 4b2b5e4). The before/after comparison for the upgrade should be an ABAB run (`perf_probe.py --ab=<base>,<branch>`) at load < 2.5. A single-copy timing from this box today would not be a usable baseline.

### FPS / frame time (3D board): NOT RUN as a dedicated sample

The planned probe (`/tmp/a3/probe/baseline.py fps`: rAF frame times + counted WebGL draw calls, idle 5 s and roll + pawn move 4 s, auto tier and `?hq`) was written but not run, because of the restart. What exists, from the game's own `perfStats()` (`js/scene.js`), read in the desktop journey (1300×820, swiftshader, load ≈2):

| moment | tier / dpr | draw calls | triangles | geometries | textures (texMB est.) | programs | fps buffer (active frames only) |
|---|---|---|---|---|---|---|---|
| w1 game start, empty city | low / 0.6, shadows off, AA off, lowPower true | 25 | 8 742 | 19 | 13 (15.0 MB) | 13 | median 6.7 fps, 1 sample |
| after buying 3 stock lots (city = 3) | same | 27 | 13 660 | 29 | 17 (16.3 MB) | 16 | median 15 fps, p95 150 ms, 5 samples; last turn 1 930 ms |

Caveat: SwiftShader is a CPU rasteriser. These fps numbers show what a no-GPU machine gets. They say nothing about a phone or desktop GPU, and must not be reported as device FPS (§17). The render loop is on demand: idle frames are not drawn. FINAL-verify recorded PF-16 framesQuiet5s = 0 and PF-20 diceFps 3.1–3.3 for the same code. The scene also has a built-in benchmark (`?perf=1` → `window.__rrPerfRun()`: 10 s orbit over a 24-item city). The 3D lane should use that on a real device.

---

## 3. Bundle and asset weights

Raw bytes are what `python -m http.server` serves (no compression). GitHub Pages gzips JS/CSS, so gzip -9 sizes are also given.

| JS group | files | raw | gzip |
|---|---|---|---|
| engine / rules (engine.js 418 KB, finance/, systems/, worlds/, data/, rng, life, history, practice, energy) | 30 | 930 KB | 312 KB |
| render (scene.js 128 KB + js/render/* 10 files) | 10 | 208 KB | 71 KB |
| shell / UI (ui.js 221 KB, lobby.js 191 KB, game.js 104 KB, onboard, summary, progress, saves, …) | 19 | 723 KB | 243 KB |
| three r170 (three.module.js 1 314 KB + GLTFLoader, OrbitControls, BufferGeometryUtils, RoomEnvironment) | 5 | 1 457 KB | 297 KB |
| CSS (lobby 82, game-play 70, game 14, stability 9) | 4 | 175 KB | 41 KB |
| lobby `modulepreload` set in index.html | 39 | 1 172 KB | 394 KB |

In production, three is loaded from cdn.jsdelivr.net through the import map (the test copies rewrite it to /three/). Google Fonts (Rubik, Secular One) are also loaded from the CDN, and are stubbed in tests.

**assets/ (12 MB):** 38 GLB = 10.4 MB (life 3.37 MB: 10 models of 120–430 KB; w2 1.62 MB; w3 1.55 MB; w4 1.31 MB; w1 1.06 MB; history 0.72 MB; pawns 0.62 MB). Images: 7 PNG = 1.83 MB (one card.png of 266–309 KB per world/life/history, plus pawns.png 100 KB), 6 WebP = 0.18 MB (lobby card art). **Audio files: none** (audio.js synthesises with WebAudio). **Font files: none** (CDN).

**What loads before the first game input** (`baseline.py bytes`; desktop, cache disabled, seeded player, w1 first character, Network.loadingFinished bytes):

| | 3D (default) | 2D (setting "מצב קל", `rr2-settings.lite`) |
|---|---|---|
| lobby open + 1.2 s idle | 3 638 KB / 72 req: the lobby already prefetches scene.js + three (1 458 KB) and the render modules | 1 947 KB / 59 req |
| at first input (character click → roll/card) | **4 719 KB / 77 req**: app JS 1 632 · three 1 458 · GLB 1 081 (pawns/classic + w1 apartment, business, crypto, stock) · render JS 186 · CSS 177 · images 174 · html 9 | **2 050 KB / 64 req**: app JS 1 632 · CSS 177 · images 174 · render JS 57 · html 9; 0 GLB, no three |
| character click → first input | 7 373 ms (load ≈5) | 1 488 ms |

No other world's GLB loads before the first roll (PF-7 = 0). In this run (6 s after first input), the life/history GLBs had not loaded either.

---

## 4. Screenshots (`docs/3d-upgrade/baseline/`, 36 files, 5.2 MB)

Made by `/tmp/a3/probe/baseline.py shots`. Seeded player: `rr2-onboarded=1`, progress ★ w1:3 w2:2 w3:1 (so w4 is unlocked), tutorialDone. The real lobby copy :9402 with the fake backend. Desktop and tablet use dsf 1; the phones use dsf 2. A file is JPEG q80 when its PNG would have been over 300 KB. All 3D shots are tier low / dpr 0.6 (software GL), so the board looks more pixelated than on a GPU device. Do not judge the art from them.

Per viewport `desk` 1300×820 · `tablet` 820×1180 · `phone` 390×844 · `phone360` 360×740:
`_01_lobby_home`, `_02_world_w1`, `_03_game_w1_start` (3D, zero assets), `_04_decision_card` (the first card that opened), `_05_after_buy` (first purchase that grew the city), `_06_lite2d_w1` (2D light mode), `_07_board_w2|w3|w4`.
The decision cards that came up: desk trade/life · tablet deal · phone payday · phone360 deal "דירה בעיר פיתוח".

---

## 5. Player journeys (new game → roll → event → decision → money → city → save/reload)

I ran this on all four viewports. Steps: lobby → map card w1 → world view → first character ("מורה") → game. Then roll, answer cards and buy, until the 3D city grew. Then reload the page → lobby → w1 → "▶ להמשיך" → compare. Then 🏠 → w2, w3, w4. All four journeys finished with **0 page errors and 0 console errors**, and the fake-backend guard stayed clean.

| step | desk | tablet | phone 390 | phone 360 |
|---|---|---|---|---|
| lobby usable (wall) | 2.0 s | 2.1 s | 1.9 s | 2.2 s |
| w1 character click → first input | 2.3–3.7 s | 12.4 s (load spike) | 6.5 s | 2.5 s |
| start state | 3D, month 1, ₪5,000, cf +₪1,705 | same | ₪5K, +₪1.7K (compact format) | same |
| first purchase that grew the city | month 3, trade buy-max: ₪11,898 → ₪82, cf +₪3,471, city 0 → 3 | month 2, deal (after two inspections ₪6,705 → ₪6,105), city 0 → 1 | month 2, city 0 → 1 | month 2, city 0 → 2 |
| save → reload → "▶ להמשיך · מורה · חודש N" | **identical** (month, cash, cf, city size) | identical | identical | identical |
| w2 / w3 / w4 start (cash · cf) | ₪90,000 · +₪7,501 / ₪500,000 · +₪18,703 / ₪3.2 מיליון · −₪12,995 | same | ₪90K · +₪7.5K / ₪500K · **+₪15.8K** / ₪3.2M · −₪13K | ₪90K · +₪7.5K / ₪500K · +₪18.7K / ₪3.2M · −₪13K |
| 2D light mode, w1 first input | 106–335 ms | 286 ms | 187 ms | 168 ms |

Notes: unclear, stuck, truncated or overlapping:
1. **2D board tile names are truncated with an ellipsis on desktop** (`span.b2d-tn`: "הזדמ…", "הוצא…", "יום מ…", "קרן מ…" — 29 of the visible names), and some are truncated on tablet ("הוצאה מפתה", "קרן מדד ופנסיה", "לימודים וקריירה"). On the phones (390/360) no 2D tile name is clipped. See `desk_06_lite2d_w1.jpg`.
2. **The 3D game start shows a coach bubble ("מד החופש 1/2", "שני יעדים" in w4) over the board**, even for a player with tutorialDone. On phones it covers the upper middle of the board. The first 3D camera is a close follow cam on the pawn and a nearby asset model. A new player does not see the whole board or the city centre at the start (`*_03_game_w1_start`).
3. **3D tile labels:** the label of the tile the pawn stands on is hidden by the pawn ("קרן מדד ופנסיה" under the pawn, `desk_05_after_buy`). At dpr 0.6 (software GL), labels on far tiles cannot be read. a11y AX-C also reports that the landing tile name is not announced, only the dice values.
4. **Phone 360, deal card:** the primary buy / "הלוואה ₪2,000 וקנייה" action sits low in the scrolling sheet, and the mentor bubble's last line is cut mid-line ("…נסי לחשב את התשובה… / לבד" clipped). The mentor text in the bottom bar (`#mText`) is ellipsised on both phone sizes. That is by design, with "הקש לקריאה", but the bar is the only place the role/goal is stated.
5. The mentor line mixes genders: "לפני שאת מחליט" (feminine את with masculine מחליט). This is a content nit, not a 3D issue.
6. Lobby (desktop): no overlapping or unreachable controls. The world-view "לשחק ←" buttons are below the fold at 820 px height and need a scroll. The lobby "המפה" heading shows a focus ring on load (phone).
7. **w3 phone 390 started at cf +₪15.8K** while desk/tablet/phone360 started at +₪18.7K, with the same nth=0 character. This is probably randomised start data (dream / life roll) and not a bug. Note it so a 3D-only change is not blamed for it.
8. No horizontal overflow at any of the four widths. #roll was always inside the viewport, and no visible, hit-testable controls overlapped (heuristic in baseline.py, plus a11y AX-W PASS at 360/390/414/820/1300).
9. Save mapping seen: one slot `rr2-save-free-w1` (5–8 KB) per world/mode. The lobby's "חזרה למשחק" (`.lb-resume`) shows only while the game module is alive. After a reload, resume goes through the world view's `.lb-continue`. Both worked.

---

## 6. Not run / limits

- perf desk run 3, phase B `--leak` (PF-10…PF-18, PF-20), perf 3g `--twod` (PF-8, PF-9, PF-22): NOT RUN (session server restart; coordinator: no new long runs).
- Dedicated FPS / frame-time sample (idle and pawn move, auto vs `?hq`): NOT RUN (same reason). Probe ready at /tmp/a3/probe/baseline.py `fps`.
- A third run of game_e2e w2–w4 `--nl` at low load: NOT RUN (same reason). It is left as "not clean, probably flaky".
- Not requested / not possible here: physical phone, GPU, screen reader, live staging, game_e2e_all without `--nl`, t4_lobby, lobby_e2e / v21 / v3 / v3b, balance_gates `--run`.
- Every timing above is from a loaded shared 2-core box with software WebGL.

Artifacts: /tmp/a3/runs/* (suite logs), /tmp/a3/perf/desk.log, /tmp/a3/data/{bytes.json, pstats_*.json, notes_shots_*.txt, shots_mobile.log}, /tmp/a3/load.log, /tmp/a3/probe/baseline.py.
