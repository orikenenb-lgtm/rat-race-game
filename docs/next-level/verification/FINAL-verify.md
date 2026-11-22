# FINAL VERIFY — מירוץ העכברים "Next Level" (feat/rat-race-next-level)

**Verified hash: `1beb2e118ae979fd509f09b59cc387cea3f74197`** (taken with `git archive HEAD` at 19:08, extracted to /tmp/fv/wt).
The branch moved to `4b2b5e4` at 20:51, after this snapshot (f65f00a + 4b2b5e4: playcss loader / toast queue fixes, 7 files, +37/−26). Everything below is for 1beb2e1 unless a row says 4b2b5e4.

Setup: copies built by HEAD's `tests/serve_copies.sh` with `COPY_DIR=/tmp/fv PORT_BASE=9100` (it honours COPY_DIR: /tmp/fv/rr2test, rr2lobby, rr2real on 9100–9102). I did not rebuild /tmp/rr2* or use ports 8770–8772. Base for perf: /tmp/basewt (9e871e3, which has the same app files as 706c0ff: `git diff 706c0ff 9e871e3 -- js css index.html assets` is empty). It was copied with HEAD's `make_realcopy.sh` / `make_testcopy.sh` into /tmp/fv/base and served as rr2real on 9112.
No live Supabase was contacted: fake backend plus guard only. The perf probe runs Chrome with --no-proxy-server and the host-resolver block. No repo files were edited and no git writes were made.
Run logs: /tmp/fv/runs/<ts>/ (tier 0: 20261122-190918, tier 1: 20261122-190928, tier 2: 20261122-193601, lobby_v3 rerun: 20261122-203435), /tmp/fv/runs/game_e2e_w234, /tmp/fv/runs/rerun-t4hints, perf in /tmp/fv/perf and /tmp/fv/perf2.
Load is the 1-min load average, sampled every 30 s (/tmp/fv/load.log), shown as min–max over the suite's window. Other agents shared the box during tier 2: a second stability_e2e ran on :9202 from 19:47.

## Suites

| suite | result | counts | duration | load (1-min) |
|---|---|---|---|---|
| **Tier 0** (run_all --tier=0, 19:09) | 15/15 PASS | — | 6 s | 0.00–0.08 |
| guard_lint | PASS | 0 violations | 0 s | 0.15 |
| finance | PASS | 37 passed, 0 failed | 0 s | 0.15 |
| business | PASS | 104 passed | 0 s | 0.15 |
| progress | PASS | 41 passed | 0 s | 0.15 |
| energy | PASS | 26 passed | 0 s | 0.15 |
| library | PASS | 6 passed | 0 s | 0.15 |
| saves | PASS | 105 passed, 0 failed | 0 s | 0.15 |
| flags | PASS | 16 passed, 0 failed | 1 s | 0.15 |
| render_api | PASS | 231 passed, 0 failed | 0 s | 0.15 |
| contrast | PASS | 146 passed, 0 failed | 0 s | 0.15 |
| preload | PASS | 183 passed, 0 failed | 0 s | 0.15 |
| build_edge_check (`node tools/build-edge.mjs --check`) | PASS | verify-result pins engine d1d75867c5b6… | 0 s | 0.15 |
| fakebackend_test | PASS | 20/20 | 3 s | 0.15 |
| backend_contract | PASS | 100 passed, 0 failed, 0 DIFF-ASSUMED, 0 skipped (target=fake) | 1 s | 0.15 |
| render_vocab | PASS | 286 passed, 0 failed | 0 s | 0.15 |
| **Tier 1** (run_all --tier=1 --keep-going, 19:09–19:32) | 24 PASS / 1 FAIL (balance_gates) | — | 23 min 0 s | 0.08 → 4.28 |
| verify | PASS | 10 passed, 0 failed | 18 s | 0.15 |
| determinism | PASS | 2 passed, 0 failed (300 seeded ranked games byte-identical, ±1 ulp) | 49 s | 0.94–1.33 |
| engine | PASS | 52 passed, 0 failed | 924 s | 1.26–3.85 |
| t2 | PASS | 18 passed, 0 failed | 42 s | 2.02 |
| stories | PASS | 47 passed, 0 failed | 93 s | 1.93–1.99 |
| t4_engine | PASS | 9 passed, 0 failed | 8 s | 1.99 |
| t4_meta | PASS | 128 passed (82/82 lessons reached) | 12 s | 1.99 |
| balance_gates (check mode) | **FAIL** rc=1 | see the gate table below | 0 s | 1.99 |
| lobby_smoke | PASS | 4/4 | 4 s | 1.99 |
| game_e2e_w1 (8 turns, desktop) | PASS | ERRORS 0 | 225 s | 2.32–4.00 |
| **Tier 2** (run_all --tier=2 --strict --keep-going --only=…, 19:36–20:26) | 10 PASS / 2 FAIL (both flaky) | — | 50 min 24 s | 0.76 → 6.79 |
| lobby_e2e | PASS | 46/46 | 65 s | 0.81–1.92 |
| lobby_v21 | PASS | 20/20 | 15 s | 1.39 |
| lobby_v3 | FAIL, then **PASS on rerun** | run 1: 24 PASS, then a timeout on `.gp-code` (social/registration step); rerun: 30/30 | 111 s / 101 s | 0.95–1.79 / 2.15–3.43 |
| lobby_v3b | PASS | 59/59 | 79 s | 0.83–0.97 |
| lobby_real | PASS | 18/18 | 47 s | 0.76–1.36 |
| game_e2e_phone (w1, 12 turns, --phone) | PASS | ERRORS 0 | 196 s | 1.66–3.31 |
| game_e2e_2d (w1, 12 turns, ff=board2d:on) | PASS | ERRORS 0 | 76 s | 2.87–2.97 |
| stability_e2e | PASS | 125 passed, 0 failed, 0 unexpected errors | 403 s | 2.26–4.16 |
| t4_lobby (full, all scenarios) | FAIL, then **PASS on rerun** of the failing scenario | 131/132, 1 pending (quality group hidden: js/render/quality.js not loadable); the failure was `hints`: "§4.7 phone: no toast on screen while a coach is open" (a toast showed with coach "מד החופש"); rerun `--only=hints`: 13/13 | 1257 s / 292 s | 1.82–5.86 / 3.77–4.63 |
| t5_render_e2e | PASS | 66 passed, 0 failed | 195 s | 4.74–5.88 |
| t6_e2e | PASS | 70 passed, 0 failed | 263 s | 1.12–4.37 |
| a11y_e2e --strict --strict-allowlist | PASS | PASS 17, REPORT 5, N/A 8, NOT IMPLEMENTED 18; AX-2 axe gate: 0 unallowlisted critical/serious (axe 4.14.1) | 317 s | 1.71–6.79 |
| **game_e2e w2,w3,w4 16 turns --nl, desktop** (separate run) | PASS | rc=0, ERRORS 0, nextlevel_desk 1; w2 376 s, w3 225 s, w4 250 s | 1126 s | 4.30 start → 2.71 end |

Extra smoke on **4b2b5e4** (/tmp/fv2, ports 9120–9122; for information only, the coordinator verified these commits separately): run_all tier 1, skipping engine, determinism, stories, t2, verify, t4_engine and t4_meta: 17 PASS, balance_gates FAIL (same data, engine sha unchanged, so not STALE); t4_lobby `--only=hints,dreamtut` 15/15; lobby_real 18/18 (load 0.77–2.19).

## Perf (perf_probe.py --ab=base 706c0ff :9112, branch 1beb2e1 :9102, --runs=3, ABAB)

Verdicts are for the branch. load_max is 2.5. Run 1 of desk had one branch run start at load 2.65 (base 2.58), so its timing gates were INCONCLUSIVE(noisy). Desk was rerun once (perf2) with every branch run start ≤ 2.21; that rerun gives the clean verdicts below. 3g was run twice; all runs started at load ≤ 1.69.

| id | cond | metric | base | branch run 1 | branch run 2 (perf2) | budget | verdict (run 1 → run 2) |
|---|---|---|---|---|---|---|---|
| PF-1 | desk | A.lobbyUsableMs | 393 / 359 | 308 | 315 | 800 | INCONCLUSIVE(noisy) → PASS |
| PF-2 | desk | A.lobbyIdleLongTaskMaxMs | 3960 / 4028 | 229 | 209 | 1000 | INCONCLUSIVE → PASS |
| PF-2b | desk | A.inputClickToWorldMs | 3283 / 2784 | 489 | 397 | 500 | INCONCLUSIVE → PASS |
| PF-3 | desk | A.navToRollMs | 11498 / 11278 | 11545 | 11631 | 15000 | INCONCLUSIVE → PASS |
| PF-4 | desk | A.clickToRollMs | 3467 / 2695 | 2828 | 2628 | 8000 | INCONCLUSIVE → PASS |
| PF-5 | desk | A.bytesBeforeRollMB | 8.58 | 4.59 | 4.59 | 5.5 | PASS → PASS |
| **PF-6** | desk | A.bytesBeforeLobbyKB / requestsBeforeLobby | 2585 / 40 (run 2: 2554 / 41) | 1357 / 49 | 1357 / 48 | 1200 / 38 | **FAIL → FAIL** (H gate) |
| PF-7 | desk | A.glbViolations | 12 | 0 | 0 | 0 | PASS → PASS |
| PF-8 | 3g | A.lobbyUsableMs | 8508 / 8460 | 8822 | 8879 | 9000 | PASS → PASS |
| PF-9 | 3g | A.clickToRollMs | 36075 / 36132 | 12824 | 12933 | 25000 | PASS → PASS |
| PF-10 | desk | B.nodesRange | 33 | 44 | 49 | 150 | PASS → PASS |
| PF-10b | desk | B.attachedRange | 21 | 31 | 31 | 60 | PASS → PASS |
| PF-11 | desk | B.listenersRange | 0 | 0 | 0 | 10 | PASS → PASS |
| PF-12 | desk | B.heapGrowthMB | 0.39 / 0.34 | 0.44 | 0.44 | 1.0 | PASS → PASS |
| PF-13 | desk | B.glRepeat buf/vao/tex/prog | 204/64/0/0 | 10/2/0/2 | 10/2/0/2 | 10/5/2/2 | PASS → PASS |
| PF-14 | desk | B.drawsLobbyOverGame | 0 | 0 | 0 | 0 | PASS → PASS |
| PF-15 | desk | B.drawsHidden | — | — | — | 0 | N/A(missing): not in the probe's part A |
| PF-16 | desk | B.framesQuiet5s | 3 | 0 | 0 | 2 | REPORT |
| PF-17 | desk | B.homeToLobbyMs / resumeToRollMs | 1397 / 13 (run 2: 972 / 15) | 1179 / 21 | 76 / 15 | 500 / 1000 | FAIL (noisy run) → PASS: **flaky** |
| PF-18 | desk | B.worldSwitchToRollMs | 9518 / 8097 | 8363 | 8300 | 10000 | INCONCLUSIVE → PASS |
| PF-19 | desk | L.attachedGrowth | — | — | — | 200 | NOT RUN (--long not implemented in part A) |
| PF-20 | desk | B.diceFps | 2.2 / 2.3 | 3.1 | 3.3 | — | REPORT |
| PF-21 | phone | A.navToRollMs | — | — | — | — | NOT RUN (phone condition not requested; report-only, no budget) |
| **PF-22** | 3g | T.clickToRollMs / T.navToRollMs (2D) | 36150 / 54546 (run 2: 36215 / 54589) | 159 / 19230 | 649 / 19746 | 5000 / 15000 | **FAIL → FAIL**: navToRoll is over budget in all 6 branch runs (19172–19746 ms); clickToRoll is within budget |
| PF-23 | * | pageErrors | 0 | 0 | 0 | 0 | PASS → PASS |

## Balance gates (`node tests/balance_gates.mjs`, check mode; engine d1d75867c5b63cf2, tools/balance-data, all 14 files present and fresh, not STALE)

Totals: 12 PASS, 8 FAIL, 14 REPORT, 1 ACCEPTED, 9 MISSING. Exit 1.

| gate | verdict | detail |
|---|---|---|
| G-A1 | FAIL | guideTapper in time: w1 70.5 % (worst 59), w2 62.7 % (worst 55) ✗, w3 78.7 % (worst 71), w4 64.3 % (worst 57) ✗ |
| G-A2 | PASS | blindTapper: w1 1, w2 7.7, w3 5.7, w4 5.3 % |
| G-A2b | REPORT | naive: w1 82.8, w2 46.7, w3 34.7, w4 63.3 % |
| G-A3 | FAIL | smart/adaptive should be 55–75 %: w1 90.3/88.3, w2 74/73.3, w3 76/76.3, w4 73.3/70.7 |
| G-A4 | PASS | the best policy wins at most 44 % of cells (smart) |
| G-A5 | FAIL | f:scout 1/25, f:debt 8/8, f:ops 7/4, f:frugal 26/4, f:network 1/25, f:research 0/25 |
| G-A6 | PASS | dd:flagged w1 ✓ w2 ✗ w3 ✓ w4 ✓ |
| G-A6b | PASS | all 4 worlds true |
| G-A7 | FAIL | options top in > 85 %, e.g. w1 payday:plan:study 397/402, w2 upgrade:trim:e2 99/99 |
| G-A8 | FAIL | ramp: smart w1 .90 w2 .74 w3 .76 w4 .73; guide .71/.63/.79/.64 |
| G-A9 | FAIL | abl:noCycle −1/2/−1/2, abl:noDD 8/16/15/19, f:none −1/1/3/4 |
| G-A10 | PASS | describe p95 0.137 ms, impactFor p95 2.457 ms |
| G-S8, S9, S10, S11, S15, S16, S17, S21, S24, S25, S28 | REPORT (11) | see the T3 table in tools/balance-report.md |
| G-T4 | MISSING | onboarding (T4): AC-R5 |
| T6-G1 / G2 / G3 / G4 | PASS | — |
| T6-G5 | ACCEPTED | director: accepted known limit |
| T6-G6 / G7 | PASS | — |
| T6-G8 | FAIL | the same guide/smart figures as G-A1/A3 |
| T6-G9 | REPORT | max per-world change 2.1–5.2 pp |
| B-1 | PASS | cautious ≥ 30 % and ≥ 0.5× smart in every world |
| B-2, B-3, B-4, B-5c, B-6, B-7, B-8, B-9 | MISSING (8) | engine CR-21 fields |
| B-5a | FAIL | smart per character outside 45–85 %: teacher 95, driver 96, doctor 87, chef 88 … |
| B-5b | REPORT | median-month span w1 29, w2 6, w3 2, w4 13 |

The long `--run` sims (balance_gates_run) were not run: the caller allowed skipping them.

## Failure classification

| failure | class | basis |
|---|---|---|
| balance_gates FAIL (8 gates: G-A1, A3, A5, A7, A8, A9, T6-G8, B-5a) | **real** (data-determined, not flaky) | The same result on 1beb2e1 and 4b2b5e4. The inputs are fresh (engine sha matches). Whether these are expected or accepted by the director is for the lead to decide; the tool exits 1. |
| PF-6 bytes/requests before lobby (1357 KB / 48–49 req vs 1200 / 38) | **real** | Hard count gate, the same in both desk runs. Note: the 706c0ff base copy measured by this probe also fails (2554–2585 KB / 40–41 req), although perf_budgets.json records base as 1122 / 36. So the budget's base figure does not match what this probe measures on base today, and the gate may need recalibration. The branch fails it either way. |
| PF-22 3g 2D navToRoll 19.2–19.7 s vs 15 s | **real** | Reproduced in 6 of 6 branch runs over 2 invocations, all at load < 1.7. clickToRoll (159–649 ms) passes. |
| PF-17 homeToLobbyMs 1179 ms (desk run 1) | **flaky** | Rerun: 76 ms, PASS (all run starts ≤ 2.21). |
| lobby_v3 timeout on `.gp-code` | **flaky** | Rerun 30/30 PASS. |
| t4_lobby `hints` §4.7 toast while coach open | **flaky** (under load 1.8–5.9 with a parallel browser suite from another agent) | Rerun of the scenario 13/13 PASS; also 15/15 on 4b2b5e4. |
| desk run 1 timing gates INCONCLUSIVE(noisy) | harness noise rule | Cleared by the clean rerun (all PASS). |

## Not run

- balance_gates `--run` (the long sims): skipped as allowed; check mode only.
- game_e2e_all (w1–w4 without --nl): replaced by w2–w4 `--nl` desktop plus w1 desktop at tier 1. w1 was not run with `--nl`.
- game_e2e phone with `--nl`: not run; the phone run was w1, 12 turns, without --nl, as specified.
- Tier 3 rows (lobby_shots, perf_phone / PF-21, a11y_strict as a separate row): not requested. a11y ran with --strict --strict-allowlist inside tier 2.
- PF-15 (hidden-tab draws) and PF-19 (--long) are not implemented in the probe's part A.
- Manual items (real device, screen reader, playtests, live staging contract) were not done. They are outside this harness.
- Full re-verification of 4b2b5e4: not done by me; only the smoke listed above. The coordinator verified those commits separately.
