# T7 final verification — "Next Level" upgrade (regression, performance, accessibility, balance)

- **Verified commit:** HEAD `82aa1ba` on `feat/rat-race-next-level`. I worked on a clean export (`git archive HEAD | tar -x -C /tmp/t7f/wt`). Uncommitted edits in the shared tree are **not** covered. Engine id of the export: `aaefe6fb3cf0…`.
- **Base:** `/tmp/basewt` (`9e871e3`, app files identical to `706c0ff`; checked with `git diff --stat 706c0ff -- js css index.html assets` = empty).
- **Copies:**
  - HEAD: `SRC=/tmp/t7f/wt COPY_DIR=/tmp/t7f PORT_BASE=8950` (real copy :8952). `run_all.sh` rebuilt these copies at the start of each group.
  - Base: HEAD's `make_testcopy.sh`/`make_realcopy.sh` with `SRC=/tmp/basewt COPY_DIR=/tmp/t7f/base`, served on :8955–8957 (real copy :8957).
- **Role:** I did not build any of the features. No code edits, no git writes. This file is the only file I created in the repo. Raw outputs are in `/tmp/t7f/` (`runs/<ts>/` = run_all logs and summaries, `perf/`, `a11y/`, `sim/`, `bg/`, `probes/`, `out/load.log` = load average sampled every 30 s).
- **Production safety:** I never called production Supabase. The guard was clean in every run:
  - every fake-backend suite printed `guard clean` (lobby_smoke, lobby_e2e, v21, v3, v3b with 10 contexts, lobby_real, both a11y runs);
  - `stability_e2e` printed `no unrouted supabase request` for S1–S11;
  - `game_e2e` runs with the guard-only sink and ended `ERRORS 0`;
  - every perf run had `externalResponses = 0` (DNS block plus `--no-proxy-server`).
- **Environment:** google-chrome 153 + swiftshader on a **shared** 2-core box. Other agents ran browsers and node processes the whole time (up to 30 chrome processes besides mine). The 1-minute load average was **3.1–16.6** during my runs and **never** at or below 2.5 for a whole perf run. Every timing below is therefore noisy. Counts (bytes, requests, GLBs, nodes, GL objects, draws, axe results, sim results) are exact.

## Process incident (read first)

While building the base copies, I first ran `/tmp/basewt/tests/serve_copies.sh` the way the brief described. The base tree's `make_realcopy.sh`/`make_testcopy.sh` (at `9e871e3`) **ignore `COPY_DIR`**. They rebuilt the **shared** `/tmp/rr2real` and `/tmp/rr2lobby` from the base tree at 10:54. Those are the default copies, served on :8771/:8772 since 11-21. The T5 verifier had warned about exactly this.
- I tried to rebuild them from the HEAD export. The permission layer refused that write outside `/tmp/t7f`, so **they still hold base (`706c0ff`) app code**.
- Any agent that tests against :8771/:8772 or `/tmp/rr2*` without rebuilding is testing base code. To restore them, run `bash tests/serve_copies.sh` from the checkout, with default `COPY_DIR`/`PORT_BASE`.
- After that I built the base copies with HEAD's `COPY_DIR`-aware scripts, as described above.

## 1. Regression matrix (`tests/run_all.sh`, offline, HEAD export)

I ran Tier 0 as `--tier=0`. Tier 1 and Tier 2 ran as `--only=` groups of the same runner (same table, timeouts and status rules), so the long sims, browser suites and perf could be ordered for the 2-core box. Each group's `summary.md` is under `/tmp/t7f/runs/<ts>/`.

| suite | tier | result | count | duration | backend / verify / renderer | load (1 min) | run dir |
|---|---|---|---|---|---|---|---|
| guard_lint | 0 | PASS | 0 violations (allowlist: T1/T4/T5 own routes CR-20, perf_probe) | 0 s | none | 0.1 | 105250 |
| finance | 0 | PASS | 37 / 0 | 1 s | none | 0.1 | 105250 |
| business | 0 | PASS | 104 | 0 s | none | 0.1 | 105250 |
| progress | 0 | PASS | 41 | 0 s | none | 0.1 | 105250 |
| energy | 0 | PASS | 26 | 0 s | none | 0.1 | 105250 |
| library | 0 | PASS | 6 | 0 s | none | 0.1 | 105250 |
| saves | 0 | PASS | 105 / 0 | 0 s | none | 0.1 | 105250 |
| flags | 0 | PASS | 13 / 0 | 0 s | none | 0.1 | 105250 |
| render_api | 0 | PASS | 231 / 0 | 0 s | none | 0.1 | 105250 |
| contrast | 0 | PASS | 146 / 0 | 0 s | none | 0.1 | 105250 |
| build_edge_check | 0 | PASS | engine `aaefe6fb…` pinned | 1 s | none | 0.1 | 105250 |
| fakebackend_test | 0 | PASS | 20 / 20 | 2 s | fake / replay / swiftshader | 0.1 | 105250 |
| backend_contract | 0 | PASS | 100 pass, 0 fail, 0 DIFF-ASSUMED · target=fake | 2 s | fake / replay | 0.1 | 105250 |
| render_vocab | 0 | PASS | 286 / 0 | 0 s | none | 0.1 | 105250 |
| verify | 1 | PASS | 10 / 0 | 52 s | none | 7–8 | 105908 |
| determinism | 1 | PASS | 2 / 0 (incl. 300 ranked games ±1 ulp) | 154 s | none | 8–12 | 105908 |
| engine | 1 | **FAIL(timeout)** → rerun **PASS** | timeout at 2 400 s · rerun 52 / 0 in 4 681 s | 2 401 s / 4 681 s | none | 10–16 | 105908 · `out/engine-rerun.log` |
| t2 | 1 | PASS | 18 / 0 | 282 s | none | 11–13 | 105908 |
| stories | 1 | PASS | 47 / 0 | 433 s | none | 11–13 | 105908 |
| t4_engine | 1 | PASS | 9 / 0 | 42 s | none | ~11 | 105908 |
| t4_meta | 1 | PASS | 126 + 1 pending (E-8 library reachability, other lane) | 0 s | none | ~11 | 105908 |
| balance_gates (check) | 1 | PASS **(hollow, see F-8)** | 0 files read, every row MISSING | 0 s | none | — | 105908 |
| lobby_smoke | 1 | PASS | 4 / 4, guard clean | 9 s | fake / n/a / swiftshader | 11 | 120534 |
| game_e2e_w1 | 1 | PASS | w1 8 turns, ERRORS 0 | 559 s | none (guard) / swiftshader | 11–15 | 120534 |
| lobby_e2e | 2 | PASS | 46 / 46 | 82 s | fake / accept | 13 | 122229 |
| lobby_v21 | 2 | PASS | 20 / 20 | 29 s | fake / accept | 13 | 122229 |
| lobby_v3 | 2 | PASS | 30 / 30 | 130 s | fake / replay | 13 | 122229 |
| lobby_v3b | 2 | PASS | 59 / 59 (incl. live_xss offline) | 115 s | fake / scripted | 13 | 122229 |
| lobby_real | 2 | PASS | 18 / 18 (honest + forged ranked, board ✓) | 135 s | fake / replay | 13–15 | 122229 |
| stability_e2e | 2 | PASS | 125 / 0, 0 unexpected errors | 727 s | own route / mixed | 13–15 | 122229 |
| t5_render_e2e | 2 | PASS | 66 / 0 | 324 s | own route / swiftshader | 10–14 | 122229 |
| t4_onboarding | 2 | **MISSING(onboarding (T4))** | file does not exist (T4 shipped `t4_lobby.py`; see F-9) | — | — | — | 122229 |
| t4_a11y | 2 | **MISSING(onboarding (T4))** | file does not exist (see F-9) | — | — | — | 122229 |
| journey_e2e | 2 | **MISSING(T7 (P1))** | not written | — | — | — | 122229 |
| a11y_e2e (ratchet) | 2 | PASS | 17 PASS · 5 REPORT · 7 N/A · 18 NOT IMPLEMENTED | ~12 min | fake / accept / swiftshader | 10–15 | 124813 |
| balance_gates_run | 2 | **NOT RUN as written** → replaced | `--run` calls `--matrix 100 … --json` and `--t7` (not in the sim). I ran `sim.mjs --matrix 50 wX` instead, §4 | 1 601–2 088 s per world | none | 7–16 | `sim/` |
| perf_gate (desk) | 2 | **FAIL** (gated count FAILs; timings INCONCLUSIVE) | §2 | ~18 min | none / swiftshader | 1.9–8.8 | `perf/desk` |
| perf_gate_3g | 2 | **FAIL** (PF-8, PF-22) | §2 | ~23 min | none / swiftshader | 5.4–10.4 | `perf/3g` |
| perf_phone | 3 | REPORT (PF-21) | §2 | ~17 min | none / swiftshader | 2.2–9.1 | `perf/phone` |
| a11y_strict (HEAD) | 3 | PASS | 0 critical / 0 serious on every visited screen | ~11 min | fake / accept | 9–14 | `a11y/strict-head.*` |
| game_e2e_all | 2 | PASS | w1 543 s · w2 658 s · w3 595 s · w4 709 s (incl. save/resume); ERRORS 0 | 2 604 s | none (guard) / swiftshader | 8–11 | 142239 |
| game_e2e_phone | 2 | PASS | w1 12 turns at 390 px, ERRORS 0 | 262 s | none (guard) / swiftshader | ~6–10 | 142239 |
| game_e2e_2d | 2 | **FAIL** → rerun **FAIL (real, test defect)** | crashes before the 2D game loop: `pg.click('#camBtn')` times out because the app hides `#camBtn` in 2D by design (`js/game.js:288`) | 113 s / 120 s | none / 2d | ~6 | 142239 · `out/game_e2e_2d-rerun.log` |

**Flake vs real.**
- **engine:** a **timeout, not a defect**. Under load 10–16, the four "2 000 random games" blocks alone took 1 884 + 1 378 + 1 080 + 238 s. A rerun with a 5 400 s limit passed 52 / 0 (`/tmp/t7f/out/engine-rerun.log`). Classification: **harness budget** (the 2 400 s timeout is too small on a loaded 2-core box). There is no functional failure.
- **game_e2e_2d:** **real and deterministic** (identical on the rerun), but the defect is in the test, not the app.
  - `tests/game_e2e.py:510-511` clicks `#camBtn` for the overview screenshot whenever `not phone`.
  - The 2D renderer hides that button (`cam.hidden = scene.kind !== '3d'`).
  - The run therefore dies in the v3.2 screenshot block, **before the 2D game loop**, so 2D play was **not verified** by this suite.
  - 2D boot and first input *were* exercised by perf PF-22 (0 GLBs, first input 0.8–1.7 s after the character click) and by a11y screen 19.
- No other suite failed.
- Screenshots of the `game_e2e` runs went to the shared default `/tmp/rrshots` (prefixes `run_`, `run2d_`, `rerun2d_`), because the suite does not take `RR_SHOTS`.

All browser results above ran headless with software WebGL (swiftshader) on a 2-core machine. Backend results ran against the offline fake backend unless the backend column says live-staging. No result here was obtained on a real phone, with a screen reader, or against production.

**Totals:**
- Tier 0: 14/14 PASS in 6 s.
- Tier 1 (node + browser): 9 PASS, 1 FAIL(timeout) that passed on rerun, and 1 hollow PASS (balance_gates). That is 56 min for the node group under load, plus 10 min for browsers.
- Tier 2: 13 PASS (lobby ×5, stability, t5, a11y, game_e2e w1–w4, phone, and the a11y strict run), 1 FAIL (2D, test defect), 3 MISSING, and balance `--run` replaced. Perf: 2 FAIL conditions on gated budgets.
- The Tier 2 wall time on this shared box was about 4 h 20 min, including the sims (≈ 65 min) and perf (≈ 58 min). That is over the 180 min §6.4 budget rule, so the task manager should apply that rule.

## 2. Performance — base `706c0ff` vs HEAD `82aa1ba`, ABAB, one browser per run

Protocol: `perf_probe.py --ab=base,branch --runs=3`. Desk ran with `--leak` and 3G with `--twod`.
- **Deviation:** `--wait-quiet=120` instead of 600. The load never fell to 2.5, so with 600 every run would have waited 10 minutes for nothing. Every run is recorded as noisy.
- Load at the start of each run (base / branch, in run order):
  - desk: 4.45 5.09 1.87 2.27 5.01 6.80 / 3.52 3.10 2.47 4.33 4.97 5.40; leak 8.78 / 5.45;
  - phone: 2.24 5.07 6.34 6.96 5.44 8.57 / 6.54 9.09 4.94 6.52 3.72 4.35;
  - 3G: 5.39 9.71 10.35 10.08 6.02 6.61 / 7.53 8.29 6.39 7.14 7.47 8.65.
- **Rule (§3.9):** a timing gate from noisy runs is never PASS. A timing whose median is inside its budget prints INCONCLUSIVE(noisy). A timing over its budget prints FAIL, and I mark it "noisy" when the load could plausibly explain the miss.
- Files: `/tmp/t7f/perf/{desk,phone,3g}/compare-*.md`, raw `base-*.json`/`branch-*.json`, and `gate-all.txt` (all three conditions gated together).

| id | cond | metric | base: 3 runs → median | HEAD: 3 runs → median | budget | verdict | owner |
|---|---|---|---|---|---|---|---|
| PF-1 | desk | nav → lobby usable ms | 440, 382, 809 → 440 | 567, 487, 2 153 → 567 | 800 | INCONCLUSIVE(noisy) | — |
| PF-2 | desk | longest task in 10 s lobby idle ms | 14 375, 5 400, 26 549 → 14 375 | 228, 324, 1 002 → 324 | 1 000 | INCONCLUSIVE(noisy); the freeze is gone | CR-19 |
| PF-2b | desk | click w1 at lobby + 2 s → world view ms | 9 349, 3 410, 17 035 → 9 349 | 403, 1 869, 1 808 → 1 808 | 500 | FAIL (noisy; 1 run at 403 ms under load 3.1) | CR-19a/b |
| PF-3 | desk | nav → first game input ms | 31 143, 11 392, 47 373 → 31 143 | 11 638, 13 553, 15 855 → 13 553 | 15 000 | INCONCLUSIVE(noisy) | — |
| PF-4 | desk | character click → first input ms | 5 017, 3 144, 6 236 → 5 017 | 3 019, 5 399, 5 653 → 5 399 | 8 000 | INCONCLUSIVE(noisy) | — |
| PF-5 | desk | MB before first input (identity) | 8.58 (68 req) | **5.86** (86 req) | 5.5 | **FAIL** (count, exact) | CR-06/CR-07 (shell/assets) |
| PF-6 | desk | KB / requests before lobby usable (worst run) | 1 127–2 554 / 36–40 (timing-dependent on base) | **1 870–1 995 / 59–63** on every run | 1 200 / 38 | **FAIL** (real: +23 modules, F-2) | shell (new CR-33) |
| PF-7 | desk | boot-path GLB violations | 12 | **0** | 0 | **PASS** | CR-05 landed |
| PF-8 | 3g | nav → lobby usable ms | 8 603, 8 559, 8 712 → 8 603 | **13 417, 13 766, 13 600 → 13 600** | 9 000 | **FAIL (real**: 3 tight runs, network-bound; F-2) | shell (CR-33) |
| PF-9 | 3g | character click → first input ms | 37 192, 35 978, 35 740 → 35 978 | 16 481, 17 275, 15 791 → 16 481 | 25 000 | INCONCLUSIVE(noisy) | — |
| PF-10 | desk | all DOM nodes after GC, max − min over 5 re-entries | 2 713 (1 754 → 4 467) | **3 676** (2 229 → 5 905) | 150 | **FAIL**, worse than base (≈ +790 nodes per entry vs +600) | CR-04 (open) |
| PF-10b | desk | attached nodes, max − min | 37 | **160** (550 at first game, then 679–710 flat) | 60 | **FAIL** (first visit vs the rest; no creep after re-entry 1) | CR-04 |
| PF-11 | desk | listeners, max − min | 0 | 2 | 10 | PASS | — |
| PF-12 | desk | heap growth MB | 1.37 | 0.93 | 1.0 | PASS (just under) | — |
| PF-13 | desk | GL objects at a repeat visit vs the first (buf/vao/tex/prog) | +202 / +63 / 0 / 0 | **+23** / +4 / +1 / +2 | 10 / 5 / 2 / 2 | **FAIL** on buf only. A one-time w1 offset (104 → 127, then flat at 127); no creep, unlike base | CR-17 |
| PF-14 | desk | GL draws while the lobby covers a paused game, 3 s | 0 | 0 | 0 | PASS | — |
| PF-15 | desk | draws with the tab hidden | — | — | 0 | N/A (not implemented in the probe) | T7 |
| PF-16 | desk | frames in 5 s of quiet play | 2 | 0 | 2 (R) | REPORT (better) | — |
| PF-17 | desk | homeBtn → lobby ms; lobby → resume ms | 8 840; 142 | **7 965**; 259 | 500; 1 000 | **FAIL** on homeBtn on both copies (the first number is taken right after a dice roll; known CR-32) | shell (CR-32) |
| PF-18 | desk | world switch → first input ms | 12 733 | 9 770 | 10 000 | INCONCLUSIVE(noisy) | — |
| PF-19 | desk | long play | — | — | 200 | NOT RUN (`--long` not implemented) | T7 |
| PF-20 | desk | dice fps / idle fps | 1.1 / 18.3 | 1.5 / 43.2 | R | REPORT | — |
| PF-21 | phone | nav → first input ms (390×844, DPR 3, CPU 4×) | 27 825, 25 052, 30 777 → 27 825 | 16 661, 16 365, 16 266 → 16 365 | R | REPORT | — |
| PF-21 | phone | lobby usable / idle long task / input probe ms | 1 091 / 10 768 / 2 481–29 196 | **1 666** / 1 269 / 1 250–2 922 | R | REPORT (lobby +575 ms, F-2) | — |
| PF-22 | 3g | 2D: click → input ms; nav → input ms | 36 122; 54 827 (base has no 2D: 17 GLBs) | **898**; **25 086** (0 GLBs) | 5 000; 15 000 | **FAIL** on nav → input (the 13.6 s 3G lobby dominates it); click → input passes | shell (CR-33), T1 |
| PF-23 | all | page errors over every run | 0 | 0 | 0 | PASS | — |

**Reading.**
- Most of the upgrade's performance goals hold, even on this noisy box:
  - the 13–20 s post-lobby freeze is gone (longest idle task 0.2–1.0 s vs 5.4–26.5 s);
  - no wrong-world, life or history GLB is fetched before the first roll;
  - bytes before the first input fall from 8.58 to 5.86 MB;
  - first input arrives about twice as fast on desk and phone and 2.2× faster on 3G (2D: 0.9 s after the character click);
  - the GL buffer/VAO creep across re-entries is gone (only a one-time offset is left);
  - idle rendering stops (0 frames in 5 s).
- **Real regressions:**
  1. **Lobby boot:** 23–28 more modules (~330 KB) are fetched before the lobby. On 3G, lobby usable is +5.0 s (13.6 vs 8.6 s, three tight runs, PF-8 FAIL). It is +575 ms on phone and about +130 ms on desk (noisy).
  2. **DOM node growth per world re-entry got worse:** about +790 nodes per entry after GC, vs about +600 on base (PF-10; CR-04 still open).
- `PF-5` misses its budget by 0.36 MB.

## 3. Accessibility (`a11y_e2e.py`, axe-core 4.14.1, offline fake, seeded player)

Runs:
- `--strict --strict-allowlist` on HEAD (:8952) and on base (:8957), with HEAD's harness for both;
- the run_all ratchet run on HEAD.

Cell format is **distinct axe rules per screen: critical / serious / (moderate + minor)**. The serious and critical rule names are in brackets.

| screen | base 706c0ff | HEAD 82aa1ba |
|---|---|---|
| 01 welcome desk / phone | 1/1/1 (aria-required-attr, label-content-name-mismatch) · 1/0/1 | 0/0/1 · 0/0/1 |
| 02 lobby home desk / phone | 1/2/3 (aria-required-attr, color-contrast, label-content-name-mismatch) · same | 0/0/1 · 0/0/1 |
| 03 world view desk / phone | 1/2/3 · 1/0/3 | 0/0/1 · 0/0/1 |
| 04 profile desk / phone | 1/2/1 · 1/0/1 | 0/0/1 · 0/0/1 |
| 05 library desk / phone | 1/1/3 · 1/0/3 | 0/0/1 · 0/0/1 |
| 05b lesson sheet desk / phone | 1/2/3 (+aria-dialog-name) · 1/1/3 | 0/0/1 · 0/0/1 |
| 06 group desk / phone | 1/2/3 · 1/0/3 | 0/0/1 · 0/0/1 |
| 07 daily desk / phone | 0/1/0 (color-contrast) · 0/1/0 | 0/0/0 · 0/0/0 |
| 08 HUD desk / phone / 360 | 1/2/1 · 1/2/1 · 1/1/1 | 0/0/1 · 0/0/1 · 0/0/1 |
| 09 event card desk / phone / 360 | 1/2/1 · 1/2/1 · 1/1/1 | strict run: N/A (the random first landing opened no card) · ratchet run: 0 critical/serious, `region` (moderate) only |
| 13 sheet phone / 360 | 1/0/1 · 1/1/1 | 0/0/1 · 0/0/1 |
| 16 end won desk / phone | 1/2/1 · 1/2/1 | 0/0/2 · 0/0/2 |
| 17 end lost desk / phone | 1/1/1 · 1/1/1 | 0/0/2 · 0/0/2 |
| 19 2D board desk / phone | — (no 2D in base) | 0/0/3 · 0/0/1 |
| 10, 11, 12, 14 (forced cards, story inbox, #gm, asset info) | NOT IMPLEMENTED in the harness | NOT IMPLEMENTED |
| 15 help, 18 learning end | N/A (harness says "not in the build") | N/A. **Both now exist** (`#helpBtn` from `ui.js:374`, T4 learning mode): this is a harness gap (F-10) |

- **AX-3 strict gate:**
  - HEAD **PASS**: 0 critical and 0 serious on every visited screen, no stale allowlist entries.
  - Base **FAIL**: 112 unallowlisted critical/serious findings.
  - The moderate findings left on HEAD are `region` (content outside landmarks), `heading-order`, `landmark-one-main` and `page-has-heading-one` on the 2D board. The ratchet run counted 280 `region` nodes in total.
- **Keyboard and other checks:**

| check | base | HEAD |
|---|---|---|
| K-1 first Tab in the lobby, HUD inert | FAIL (stops 1–5 = HUD) | PASS |
| K-2 focus off `<body>` on view change | FAIL (body ×5) | PASS (input / h1 / #lbMapH) |
| K-3 lobby → game key presses | FAIL (52) | PASS (7) |
| K-4 roll reachable | PASS via Space (Tab 24 on HEAD) | PASS via Space (tabs = 24) |
| K-5 card focus and trap | FAIL (focus escapes to body / #homeBtn) | PASS (Escape keeps decisions open) |
| K-7 end screen | PASS | PASS |
| K-8 phone sheet trap and Escape | FAIL (leaks to #voiceBtn, #roll) | PASS |
| K-9 return to lobby | PASS | PASS |
| K-6, K-10 | NOT IMPLEMENTED | NOT IMPLEMENTED |
| AX-T primary ≥ 44 px | FAIL (`button.chip` 146×36 at 414) | PASS |
| AX-T ≥ 24 px, AX-N, AX-W, AX-M, AX-Z2 200 % | PASS | PASS |
| AX-C live region: dice / landing tile | PASS / REPORT | PASS / REPORT (CR-27: tile name still missing) |
| AX-S, AX-B, AX-L, AX-Z1 | NOT IMPLEMENTED | NOT IMPLEMENTED |

- **Not done:** the screen reader pass (no SR available, §4.4) and the manual device run (§3.10).

## 4. Balance gates

**Freshness:**
- The committed `tools/balance-data/*` carries `engineSha 7f5b5ef0…`, but the current engine is `aaefe6fb…`, so the data was **stale**.
- I re-ran `node tools/sim.mjs --matrix 50 wX` for w1–w4 on the export, two at a time in the background (`/tmp/t7f/sim/`). That is 5 000 + 3 750 × 3 = 16 250 games, under load 7–16.
- I then ran:
  - `tests/balance_gates.mjs --dir=../bg`, with the matrices copied as `balance-t2-wN.json`, because the gate only reads `tools/balance-t*.json` (F-8);
  - `sim.mjs --report --md /tmp/t7f/sim/balance-report.md` for A1–A10.
- A7 (dominance) and A10 (perf) in that report still read the **stale committed** dominance/perf files. They are labelled stale below.

| gate | result (fresh, N = 50 per world × character × policy) | committed (N = 100, stale engine) |
|---|---|---|
| A1 guide ≥ 65 % per world, no character < 50 % | **FAIL**: w1 74 % · **w2 63 %** · w3 73 % · w4 69 %; worst character w2 pm 52 % (floor holds). `balance_gates.mjs` prints PASS because it pools all worlds (70 %; F-8) | w2 60 %, w4 63 % |
| A2 blind ≤ 30 % | PASS: 2 / 5 / 4 / 5 % | 2 / 7 / 5 / 6 |
| A2b naive ≤ 40 % (report) | 87 / 48 / 37 / 77 % | 83 / 51 / 38 / 72 |
| A3 smart and adaptive 55–75 % | **FAIL**: w1 92 / 90 · w2 77 / 74 · w3 63 / 62 · w4 76 / 73 | 91/89 · 75/72 · 66/65 · 73/71 |
| A4 no policy best in > 60 % of cells | PASS (19 cells; smart 42 %) | PASS |
| A5 every focus best somewhere and worse somewhere | PASS | PASS |
| A6 dd:flagged beats never and always | **FAIL** (pooled flagged 78 % med 54 vs never 78 % med 53; beaten in w1, w4 only) | FAIL |
| A6b | PASS (all worlds) | PASS |
| A7 option dominance | **FAIL — stale data** (plan:study, upgrade:trim, as before) | FAIL |
| A8 ramp | **FAIL** (smart 92 → 77 → 63 → 76; w4 > w3) | FAIL |
| A9 ablation ≥ 3 pts | **FAIL** in the report: `f:none` moves smart by ≤ 2 pts in every world at N = 50 (w3 was 3 pts at N = 100). noDD moves it 7–25 pts, noCycle up to 5 pts. Likely N noise on one sub-row | PASS |
| A10 performance | met — **stale data** (perf.json not re-run; the box is not idle) | met |
| B-1 cautious ≥ 30 % and ≥ 0.5× smart | PASS (69 / 41 / 56 / 59 %) | — |
| B-5a smart per character in [45, 85] % | **FAIL**: w1 driver 100 %, chef 92 %, teacher 90 %, dev 88 %, doctor 88 % are above 85 % | — |
| B-5b characters differ (smart median months span) | REPORT: w1 28 · w2 12 · w3 **3** · w4 9 months | — |
| B-2, B-5c, B-6, B-7, B-8, B-9, all G-S*, G-T4, G-T6-* | MISSING (CR-21 fields, T3 json and T4/T6 rows not emitted) | — |

**Director targets (fresh):**

| target | w1 | w2 | w3 | w4 | verdict |
|---|---|---|---|---|---|
| blind tapper ≤ 30 % | 2 % | 5 % | 4 % | 5 % | met |
| guide ≥ 60 % | 74 % | 63 % | 73 % | 69 % | met (w2 margin 3 pp) |
| smart ≥ naive + 5 pp | 92 vs 87 (+5) | 77 vs 48 | 63 vs 37 | **76 vs 77 (−1)** | **NOT met in w4**. w1 sits exactly at the line |
| smart in 55–75 % (w2–w4) | (w1 92 %) | **77 %** | 63 % | **76 %** | **NOT met** in w2 and w4 (1–2 pp over); w1 far over |

**Soft locks and recovery** (my probe `/tmp/t7f/sim/probe_b34.mjs` uses the sim's own `play()` and policies unchanged; 20 seeds × every character × 7 policies × 4 worlds = 1 820 games; `/tmp/t7f/sim/probe_b34.json`):
- **Soft locks:**
  - 0 thrown errors and 0 events without an enabled option, over the 1 820 probe games plus the 16 250 matrix games. The sim throws on an event loop > 40 steps and would crash on an option-less event, and none crashed.
  - Dead ends (still playing at the cap with cash + savings < 0): **0 %** for every policy.
  - Still playing at the cap at all: guide 2–23 % (w2 23 %), cautious 1–48 % (w2 48 %), naive up to 53 % (w2), blind 12–75 %.
  - Forced picks are not counted (CR-21). Credit is not considered.
- **Recovery** (`recover` = naive for 12 months, then adaptive; B-4 thresholds):

  | world | recover | adaptive | bankrupt |
  |---|---|---|---|
  | w1 | 92.5 % | 92.5 % | 0 % |
  | w2 | 65 % | 70 % | 0 % |
  | w3 | 56.7 % | 53.3 % | 0 % |
  | w4 | 85 % | 76.7 % | 0 % |

  B-4 **PASS** in every world. Note for the director: a year of naive play costs **≤ 5 pp** (it even helps in w3 and w4). Early mistakes barely matter, which fits the "too easy" A3 and B-5a findings.
- **Characters and worlds differ:**
  - Worlds clearly differ in difficulty, though not in ramp order (A8).
  - Characters within w1 span 28 median months. **In w3 they span only 3 months** (smart importer 60 %, exporter 58 %, captain 70 %), so B-5b is weak there.
  - Decision-type distinctness (B-6) cannot be computed: `decisionsByType` is not emitted (CR-21).

## 5. Determinism and server contract

- `node tools/build-edge.mjs --check` **PASS**: verify-result pins engine `aaefe6fb3cf0…`.
- `verify.test.mjs` 10 / 0 and `determinism.test.mjs` 2 / 0 (300 ranked games replay byte-identically with every approximated Math function nudged ±1 ulp). `backend_contract` 100 / 0 against the fake. `lobby_real` honest ranked → verified, forged → mismatch.
- **MAX_BUNDLE headroom:** the edge bundle is **839 512 chars**, and the limit is 900 000 (`verify_core.js:5`). That leaves **60 488 chars (6.7 %)**. Base was 484 184 chars, so the bundle grew by 73 % in this wave. One more engine feature of T2/T3 size would exceed the limit, and verify-result would then refuse the pinned bundle path (`index.ts:57`). → F-6.

## 6. Real failures and findings (repro · suggested owner lane)

| # | finding | evidence / repro | owner lane | severity |
|---|---|---|---|---|
| F-1 | 3G lobby usable 13.6 s vs 8.6 s on base (PF-8 FAIL). Phone +575 ms, desk about +130 ms | `python3 tests/perf_probe.py --ab=<base>,<head> --cond=3g --runs=3 --twod`. 3 tight runs on each copy | shell / lobby (import graph) — **new CR-33** | P0 for release (budget gate) |
| F-2 | Cause of F-1 and PF-6: 28 extra modules (~330 KB) are fetched before the lobby is usable, e.g. `summary.js`, `systems/chains.js`, `onboard.js`, `saves.js`, `data/lessons-meta.js`, `systems/recap.js`, `rewind.js`, `practice.js`, `ghosts.js`, `ghost-worker.js`, `systems/rivals.js`. Static imports deepen the module waterfall on a high-RTT network | `/tmp/t7f/probes/reqs.py` (base 59 requests by `.lb-home`, HEAD 66; 28 new files listed in `head_reqs.json`). PF-6 = 59–63 requests / 1.87–2.0 MB on every HEAD run | shell (`main.js`/`game.js` imports → dynamic `import()` for summary, rewind, practice, ghosts, recap, onboard) | P0 |
| F-3 | DOM node growth per world re-entry is worse than base: about +790 nodes per entry after GC (2 229 → 5 905 over 5 entries) vs about +600 on base. Attached nodes stay flat, so this is detached-tree retention | `perf_probe.py --cond=desk --leak` (snapshots in `branch-desk.json` `B.snaps`) | CR-04 (unassigned: needs the §3.5 `--heap` retainer report, still not implemented) → T7 for diagnosis, then the owning lane | P0 (PF-10 hard gate) |
| F-4 | PF-13: w1 repeat visit +23 GL buffers vs the first visit (104 → 127, then flat); tex +1, prog +2 at the limit | same leak run | rendering (CR-17: something survives the first w1 → w2 switch) | P2 (no creep) |
| F-5 | PF-17: homeBtn → lobby takes 8.0 s on HEAD (8.8 s on base) right after a dice roll | same leak run | shell (CR-32) | P1 |
| F-6 | Edge bundle at 93.3 % of MAX_BUNDLE | §5 | engine / backend (raise the limit with a deploy, or slim the bundle) | P1 |
| F-7 | Balance misses the director's targets: A3/A8, smart ≥ naive + 5 pp fails in w4, B-5a (5 w1/w2 characters > 85 %), A1 w2 63 %, A6, A9 (f:none). Early mistakes cost ≤ 5 pp (recover ≈ adaptive) | §4 (`sim/balance-report.md`, `bg/`, `sim/probe_b34.json`) | engine (balance) / director decision | P1 (director) |
| F-8 | Harness: `balance_gates.mjs` reads only `tools/balance-t*.json`, but the sim writes `tools/balance-data/matrix-wN.json`. So in run_all it reads **0 files**, prints MISSING for every row and exits 0, which shows as **PASS**. Its G-A1/A2/A3 pool all worlds instead of checking each world (A1 shows 70 % PASS while w2 is 63 %). `--run` calls `--json` and `--t7`, which do not exist | `node tests/balance_gates.mjs` → `files none`, rc 0 | T7 (tests) | P0 (honesty: a hollow PASS) |
| F-9 | Harness: run_all lists `t4_onboarding.py` and `t4_a11y.py` (MISSING), but T4 shipped `tests/t4_lobby.py` and T6 shipped `tests/t6_e2e.py`. Neither is in the matrix, so they are never run by run_all | `ls tests/` vs `run_all.sh` TABLE | T7 (tests) | P1 |
| F-10 | Harness: a11y screens 15 (help) and 18 (learning end) are hard-coded `N/A (not in the build)`, but both exist now. Screens 10/11/12/14, K-6, K-10, AX-S/B/L/Z1 are still NOT IMPLEMENTED. Screen 09 depends on a random landing (N/A in the strict run) | `a11y_e2e.py:167-168` | T7 (tests) | P1 |
| F-11 | Harness: the `engine` suite's 2 400 s timeout is too small for the loaded box (it passes in 4 681 s) | §1 | T7 (tests): raise it to ~5 400 s or split the random-games blocks | P2 |
| F-13 | `game_e2e_2d` always fails: the overview screenshot clicks the hidden `#camBtn` in 2D, so the 2D game loop never runs | `python3 tests/game_e2e.py w1 12 "--base=http://localhost:8950/index.html?ff=board2d:on"` → TimeoutError at `game_e2e.py:511` (twice) | tests (game_e2e owner; guard the click with `data-kind == '3d'`) | P1 (2D play is unverified until fixed) |
| F-12 | Process: the base tree's copy scripts overwrote the shared `/tmp/rr2real` and `/tmp/rr2lobby`. They still hold base code (see "Process incident") | — | task manager: rebuild the default copies from the checkout | P1 (other agents) |

**Not done / out of reach** (listed, never inferred): the manual device run (§3.10), the screen-reader pass (§4.4), agent and human playtests (§5.4), the live contract against staging (CR-22), `perf --long` (PF-19), `--trace`/`--heap` (PF-B/PF-C) and `journey_e2e.py` (RG-4).
