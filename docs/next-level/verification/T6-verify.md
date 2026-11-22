# T6 verification — rivals & deal competition, ghosts, success metrics, end summary, practice rewind, after-win, ranked gates

Independent verifier (did not build or review T6). Spec: `docs/next-level/specs/T6-rivals-summary.md` (31 AC, gates G1–G9). Review: `docs/next-level/reviews/T6-review.md`.

* **Code verified:** clean `git archive` of **03c9fc8** in `/tmp/v6/wt`. Copies were built with `SRC=/tmp/v6/wt COPY_DIR=/tmp/v6 PORT_BASE=8930 tests/serve_copies.sh`, and the real copy was served on :8932.
* **HEAD moved during the run.** It is now e435125, which adds T3/T4 fixes, including `f8d2a7d` in the engine's `cityModels()`. None of those commits touches a T6 file. On a fresh export of e435125 these still pass: `t6_client` 131/0, `verify` 10/0, `build-edge --check` (pin `aaefe6fb…`) and `t6_ghost_node --time` (all 4 worlds within budget). The long suites and browser probes below were **not** re-run on e435125.
* **Backend:** offline only. Every browser context used the fake backend plus the guard (`FB.install_mode(..., 'offline')`). The guard was clean in every context, there were 0 page errors, and production Supabase was never called. No MCP or remote browser was used.
* **Probe scripts:** `/tmp/v6/probes/` (`fair.mjs`, `m3_quota.mjs`, `m6_capped.mjs`, `wx_ranked.mjs`, `simgates.mjs` + `simreport.mjs`, `g5.mjs`, `fixtures.mjs`, `v6probe.py`).
* **Logs:** `/tmp/v6/logs/`.
* **Screenshots:** `/tmp/v6/shots/` (my probes) and `/tmp/v6/shots/e2e/` (`t6_e2e`).

## Verdict

**The client, engine and fairness work holds. The balance gates do not.**

Every suite passes. The five re-checked review majors (M1, M2, M3, M4, M6) are fixed. The checks I wrote myself confirm three things:

* **Competition is honest.** The shown % is within ±0.3 pp of what actually happens, pooled over 30,000 competed cards per world. Four rival draws happen on every deal or mystery landing, whatever the player chooses.
* **Ghosts never look ahead** of the player's month.
* **Ranked games cannot rewind or continue after a win**, either in the client or in `verify`.

The **§16 sim gates were never run by the implementer** (spec implementation note 9). Run now, **G1, G2, G4, G5 and G7 fail**, and G8 fails in part. The committed N=100 matrix (`tools/balance-data`, engine 7f5b5ef) agrees on G1 and G4. Balance tuning (spec §16: "tune `pN` / `close` before anything else") is still open.

## Test counts (all on 03c9fc8, sequential runs, machine load 4–8 from other lanes)

| Suite | Result | Time |
|---|---|---|
| `node tests/t6_client.test.mjs` | **131 passed, 0 failed** | 13 s |
| `node tests/t6_engine.test.mjs` | **19 passed, 0 failed** (AC-1…16, AC-30, client CRs, worker API 2, m8) | 881 s |
| `node tests/t6_ghost_node.mjs --time` | w1 p95 26.6 ms / finish 138 ms · w2 p95 51.3 / 711 ms · w3 p95 45.7 / 210 ms · w4 p95 18.7 / 123 ms (budgets: 400 ms, 20 s) | 4 s |
| `node tests/verify.test.mjs` | **10 passed, 0 failed** | 35 s |
| `node tests/determinism.test.mjs` | **2 passed, 0 failed** (300 ranked games, ±1 ulp) | 138 s |
| `node tools/build-edge.mjs --check` | the edge copy pins the current engine (`7f15b760…`) | – |
| `python3 tests/t6_e2e.py` (offline) | **69 passed, 0 failed** (createBranch at 4× throttle: 275/141/88 ms; ghost message handler p95 0.10 ms) | ~9 min |
| `v6probe.py --only=ranked` | **8 / 0** | |
| `v6probe.py --only=ghost` | **8 / 0** | |
| `v6probe.py --only=m12` | **15 / 0** | |
| `v6probe.py --only=end` | **89 / 1** (the 1 failure is a probe artifact, see §6) | |
| Node probes | `fair.mjs`, `m3_quota.mjs`, `m6_capped.mjs`, `wx_ranked.mjs`: all as reported below | |
| Sim gates | `simgates.mjs` N=50 × 13 policies × all characters × 4 worlds (372–500 s per world); `g5.mjs` N=12 | |

Scale note: the engine suite runs at SCALE=1, which is below the spec's sizes:

* AC-3: 60 games instead of 300.
* AC-30: 25 games per archetype per world instead of 100.

My own probes cover AC-2 (200 seeds × 3 policies) and AC-8 (30,000 cards per world) at or above the spec's scale.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-1 Streams | PASS | t6_engine. Own probe: 48,088 deal/mystery landings each advanced `rival` by exactly 4, and every other landing by 0 (`fair.mjs` fixed part) |
| AC-2 Fixed draws | PASS | t6_engine. Own probe: 200 seeds × {buy-now, delay-until-lost, pass}, with 26,384 aligned landings compared → **0 stream-state differences** (the delay policy lost 3,129 deals along the way) |
| AC-3 Replay | PASS (reduced scale) | t6_engine, 60 games incl. W/X. M6 probe: ghost `end` equals engine replay |
| AC-4 Sealed | PASS | t6_engine |
| AC-5 No money creation | PASS | t6_engine (600 cards; the spec asks for 2,000) |
| AC-6 Interest public | PASS | t6_engine (AC-6a, AC-2/6b) |
| AC-7 Buy now never loses | PASS | t6_engine. Own probe: the buy-first policy lost **0** of thousands of competed cards |
| AC-8 Calibration | PASS | Own probe below: pooled realised minus shown is −0.10 / +0.23 / +0.25 / +0.31 pp (w1…w4). Every cell with ≥ 1,000 samples is within ±2 pp |
| AC-9 Reveal | PASS | t6_engine, e2e `deal` (reveal screenshot `e2e/t6_deal_reveal_phone.png`) |
| AC-10 Evaluator | PASS | t6_engine |
| AC-11 Timeline | PASS | t6_engine. Own: graph table rows equal `tl` length, and the last row equals `metrics().netWorth` (within 50 ₪ rounding) in 8 end fixtures |
| AC-12 k / k0 | PASS | t6_engine, e2e `rewind` |
| AC-13 Saves | PASS | t6_engine |
| AC-14 After-win | PASS | t6_engine. Own `wx_ranked.mjs`: a free win → `continueAfterWin` ok, `retire` gives `retired` with the same stars, and replay matches |
| AC-15 Lobby after-win | PASS | e2e (4 checks, `rr2-progress` unchanged) |
| AC-16 Public data only | PASS | t6_engine |
| AC-17 No look-ahead | PASS | e2e plus my own browser probe (§3) |
| AC-18 Ghost determinism | PASS | e2e: browser worker == Node (SAME 4 ghosts). M6 probe: 24 ghosts |
| AC-19 Main thread | PASS | e2e perf (p95 0.10 ms). Page long tasks up to 601 ms were seen but not attributed to T6 (3D included) |
| AC-20 Worker and branch | PASS | ghost_node timing. createBranch 88–275 ms at 4× throttle; 475–2,028 ms in my unthrottled but heavily loaded run (w1) |
| AC-21 Boards and network | **FAIL (partial)** | No ghost data in `net.js` or on boards (static: only `lobby.js` imports `ghosts.js`, and only for the end summary). **The group-challenge reference rows and their toggle are not implemented**: the string `להציג את יריבי המחשב` is absent. This is review m12, still open and not listed as cut |
| AC-22 Engine overhead | NOT VERIFIED | No pre-T6 baseline run. G-sim throughput looked normal (372–500 s per world for N=50 × 13 policies) |
| AC-23 Length | PASS | 8 fixtures at 390×844 (all worlds × won/lost × learn on/off): `#endTop` is 1.29–1.48 screens after the ghosts finish (w1-won-free is the largest at 1252 px = 1.48). See §6 |
| AC-24 Data only | PASS (spot-checked) | All 5 headlines equal the replayed engine `recap.dims[*].headline`, `alt` equals `recap.graph.alt`, and 5 numbers per fixture trace to engine state (§6) |
| AC-25 Accessibility | PASS | SVG has `role=img` and the engine alt. The keyboard table toggle works both ways. The caption is "הנתונים של הגרף". Table rows equal `tl` rows (8/8 fixtures) |
| AC-26 2×2 and suggestion | PASS | t6_client (rules 1, 2, 4 from real games; rule 3 from a fixture). Exactly 1 suggestion in 8/8 fixtures |
| AC-27 Branch isolation | PASS | t6_client, e2e. Own: the learn-slot hash is unchanged through live branch create, compare, branch end, "עוד תרגול" → cancel |
| AC-28 Branch fidelity | PASS | t6_client (branch = `replay(cfg, actions.slice(0, k0))`) |
| AC-29 Ranked rewind | PASS | e2e (daily). Own: daily, weekly **and challenge**, with `?ff=rewind,afterwin,rivals`: `flagFor` is false, `allowed`/`endAllowed` false, `createBranch` throws `rewind_ranked`, `saveLastGame` refuses, and there is no ⏪/🌴/🏁/branch banner in the HUD or the ⋯ list |
| AC-30 Rule cards | PASS (reduced scale) | t6_engine, 25 games per archetype per world (the spec asks for 100) |
| AC-31 Server | PASS (header only) | t6_client: the drafts say NOT APPLIED; nothing under `supabase/migrations`; `verify_core.js` unchanged. The SQL suite is not run (not approved) |

## Re-checked review majors (own probes)

| Item | Status | What I did and saw |
|---|---|---|
| **M1** original learn game never cleared | **FIXED** | This used a *live* learning origin; the e2e covers the "last" origin.<br>1. Live learn game in w1 near its end → ⏪ newest decision → branch.<br>2. Branch played to its end. (Fixture step: the branch slot's state was fast-forwarded to the same game near its end, keeping `ui.branch`.)<br>3. Learn slot SHA unchanged at the branch end. "עוד תרגול" asks first («…משחק חדש ימחק אותו»); cancel leaves the hash unchanged.<br>4. Run 2 (original intact): the end screen offers `↩ חזרה למשחק המקורי` with the dashed original line. It resumes the original at month 36 (same as before), with no banner.<br>Shots: `m1_ask.png`, `m1_branch_end_origin.png` |
| **M2** origin identity mismatch | **FIXED** | The branch meta carries `id {seed, worldId, charId, mode, n, h}`.<br>• While the original matches, compare opens.<br>• After another learning game (w1, seed 7171) overwrites `rr2-save-learn-w1`, compare refuses with the toast «המשחק המקורי כבר לא זמין להשוואה».<br>• The branch end then shows the note «המשחק המקורי כבר לא זמין להשוואה.», with no ↩ button and no dashed line.<br>Shots: `m2_live_toast.png`, `m2_branch_end_foreign.png` |
| **M3** storage priority under quota | **FIXED (one minor issue, D4)** | `m3_quota.mjs`: in-memory storage with a byte quota; real saves, 2 T1 backups, a 60 KB `rr2-ghosts`, `rr2-last-game` and a w3 branch.<br>Eviction order is always **`rr2-ghosts` → other worlds' branches → T1 backups**:<br>• Branch write: ghosts only, then ok.<br>• Branch write when soft data is not enough: ghosts + branch-w3 evicted, then `{ok:false, quota:true}` with **backups untouched (2 → 2)**.<br>• Real save write: ghosts, branch-w3, then both backup items.<br>• `rewind.createBranch` under quota → `{ok:false, error:'quota'}`, origin byte-identical.<br>`rr2-last-game` is never evicted |
| **M4** no live branch of a free game | **FIXED** | Free w3 game (live):<br>• No `[data-life=moments]` anywhere, including the ⋯ list.<br>• `createBranch({origin:'live', originKey:'rr2-save-free-w3'})` throws `rewind_live`, both without cfg and with a free cfg.<br>• `allowed` is false, `endAllowed` is true (the end-screen rewind from "last" stays).<br>• No branch slot is written |
| **M6** capped ghosts use endNow | **FIXED** | `m6_capped.mjs`: 6 games (w1–w4, seeds 2024 and 3003) × 4 archetypes = 24 ghosts, 8 of them capped.<br>• Every `done.end.recap.dims` is byte-equal to `E.endNow(ghostState).recap.dims` (or `st.result` when finished).<br>• Happiness avg equals `round(hapSum/hapN)` for all 24 ghosts |

## Fairness (own probes)

### Shown vs realised competition (`fair.mjs`)

Method:

* Real `E.landing` on the deal tile.
* On each competed card (n ≥ 1), a cloned state walks the delay path `inspect:1 → inspect:2 → offer`.
* The bucket is (n, step). The shown value is `round(o.rivalRisk×100)`, i.e. what the chip shows.

**30,000 competed cards per world** (102,828 / 75,976 / 66,072 / 74,456 landings):

| World | Steps | Pooled shown % | Pooled realised % | Largest cell deviation (samples) |
|---|---|---|---|---|
| w1 | 75,351 | 13.55 | 13.45 | n≥3 s3 −2.2 pp (614 samples) |
| w2 | 63,961 | 30.35 | 30.58 | n≥3 s3 +1.9 pp (780) |
| w3 | 56,168 | 29.96 | 30.21 | n≥3 s3 +2.8 pp (710; 1.5 σ) |
| w4 | 16,869 | 30.23 | 30.54 | n≥3 s3 +3.3 pp (158) |

* All cells with ≥ 1,000 samples are within ±2 pp. Max is +1.9 pp (w4 n1 s2, 3,099 samples). Most are ≤ 1 pp.
* Cells outside ±2 pp have < 800 samples and sit at ≤ 1.5 σ.
* The ≥ 500 landings requirement is met many times over.
* The 3,000-card run showed the same picture with more noise.

### Fixed draws

200 seeds × 3 decision policies, 300 turns each: **0** stream differences across 26,384 aligned landings.

* Rival draws per landing: 4 on deal and mystery tiles, 0 elsewhere, with no exceptions.
* Deals lost: buy-now 0 · pass 0 · delay 3,129.

### Ghosts never beyond the player's month (browser, `v6probe.py --only=ghost`)

Setup: free w3 game resumed at month 11. The probe wrapped `Worker` to log every message and the HUD month at that moment, then played to month 21 with the 2D board.

Results:

* **44 `rows` messages, 0 violations.** No row had `m > upTo` or `m >` the HUD month, and no mark had `m ≥ upTo`.
* `advance` requests went 11 → 21, never ahead of the HUD.
* No `finish` or `done` arrived while playing.
* `rr2-ghosts` was sampled every 6 steps and never held an entry for the running game.
* `__rrGhosts.view(m)`: max row 21 ≤ 21, max mark 19. `view(m+30)` is still clamped to `upTo` 21.
* Rivals panel: 5 rows, text «רואים רק עד החודש שלך» (`ghost_rivals_panel.png`).
* `audit()`: 45 messages, 0 violations, handler p95 0.10 ms.

## Ranked (own)

* **Client:** see AC-29 above (daily, weekly and challenge; shots `ranked_*_hud.png`). The 👥 rivals chip is present in ranked games, which the spec allows (ghosts up to the player's month).
* **verify (edge bundle = client engine), `wx_ranked.mjs`:** 36 honest ranked games (daily/weekly/challenge × 4 worlds) all verify (36/36). The same logs were then tampered three ways:

| Tampering | Rejected |
|---|---|
| `W` appended | **36/36** |
| `W`,`X` appended | **36/36** |
| `W` inserted mid-game | **36/36** |

  * Every rejection is `replay_mismatch` at the `W` action.
  * The engine's `continueAfterWin` and `retire` return `ok:false` on every ranked end state.
  * `CODES` = `rlcLRCPAISTFHMQKWX`.

## Sim gates G1–G9 (own run: `simgates.mjs` N=50 seeds per world × character × policy; cells = world × character × cycle bucket with ≥ 15 games → 19 cells)

| Gate | Result | Numbers |
|---|---|---|
| G1 no archetype best in > 60% of cells | **FAIL** | founder **74%**, saver 16%, diversified 11%, gambler 0%. Committed N=100 matrix (engine 7f5b5ef, competition on, 31 cells): founder **81%** |
| G2 each archetype best in ≥ 1 bucket | **FAIL** | saver: none · gambler: none · founder: 11 world-buckets · diversified: w4 only |
| G3 T2 A4 holds | PASS | smart 42%, greedy 21%, guideTapper 11%, the rest ≤ 8% |
| G4 DD not always right/wrong | **FAIL** | Pooled: flagged 78% / median 54 mo; never 78% / 53; always 63% / 61. Flagged beats never+always only in w1 and w4 (2 of 4). In w3, never 72% > flagged 63%. Committed matrix: smart 77.3% = dd:never 77.3% (median 53 vs 52) |
| G5 dominance on competed cards | **FAIL** | inspect:1 with 0 warn flags is top-U in **0% of 881**. inspect:1 with ≥ 1 warn: 52% of 360 · best buy, 0 warn: 54.5% of 961 · best buy, ≥ 1 warn: 26% of 631 (`g5.mjs`, smart play, N=12 per character) |
| G6 competition felt, not punishing | PASS | Lost deals per 60 months, median (mean): smart 0.98 (1.22) · dd:always mean 3.21 (2.6× smart) · naive 0 in all games |
| G7 ablation `_dev.noRival` | **FAIL** | smart in-time with − without competition: w1 −1.0 · w2 −4.7 · **w3 −12.0 · w4 −6.0** pp (N=50 × characters; paired seeds) |
| G8 A1 / A3 still hold | **FAIL (partial)** | A1 guideTapper ≥ 65%: w1 74 ✓, **w2 63 ✗**, w3 73 ✓, w4 69 ✓.<br>A3 smart/adaptive in 55–75%: **w1 92/90 ✗, w2 77/74 ✗, w4 76/73 ✗**, w3 63/62 ✓.<br>w1/w2 A3 look pre-existing: the committed matrix has w1 smart 91%, adaptive 89% |
| G9 calibration report | PASS (report) | §"Fairness" table above |

## End summary on a 390×844 phone (`v6probe.py --only=end`)

**Fixtures** come from `fixtures.mjs`: sim games (smart → won, gambler → bankrupt), cut 2–5 rolls before their end, and resumed through the lobby with `tl` rebuilt by replay. All flags were on.

**Fixture list:** w1/w2/w3/w4 won free, w2/w4 won learn, w1/w2/w3 lost (bankrupt) free. 8 were run: w1-won-free, w1-lost-free, w2-won-learn, w3-won-free, w4-won-free, w3-lost-free, w4-won-learn, w2-lost-free.

**Results:**

* `#endTop` is 1.29–1.48 screens.
* Graph has `role=img` and the engine alt, plus a keyboard table with the same number of rows as `tl`.
* Exactly 5 dimension rows and 1 suggestion.
* No composite (no "ציון", "/100" or points).
* Comparison lines arrive after the ghosts finish.

**Traceability.** All 5 headlines equal `recap.dims[*].headline` from `E.replay(rr2-last-game)`. Five numbers per fixture were checked against engine state, 40 checks in total, all passing. Examples from w1-won-free:

| Number | Shown | Engine state |
|---|---|---|
| Speed | facts.months 38 | `result.months` 38 |
| Happiness avg | 59 (and "ממוצע 59" on screen) | `hapSum/hapN` = 59 |
| Happiness end | 58 | `life.happiness` 58 |
| Min cushion | 0.2 | min(tl liq×100/exp) = 0.166 (rounded) |
| Final net worth | last tl row 219,500 | `metrics().netWorth` 219,470 |

**Cross-check by coincidence:** the w1-lost-free fixture was played by the sim's `gambler` policy. The gambler ghost reproduced it exactly: lost at month 59, "7% מהדרך", average 24.

**The one probe failure is not a defect.** w1-lost-free has no comparison line on 🏪 business. Per summary.js `compareLine`, no line is drawn when nobody (neither the player nor any ghost) ran a business. My check was stricter than that design.

**Screenshots:**

* `end_*_top.png` (8 files)
* `end_w1-won-free_table.png`
* `end_w1-won-free_more_full.png`, `end_w3-lost-free_more_full.png` (sections: החלטות ומזל, המשבר הגדול, מול היריבים, סיפור החיים, ניתוח מלא, הישגים ושיעורים)

On w1-won-free, the achievement and library toasts briefly cover the top of the end screen. This is not T6.

## Defects

| # | Severity | Defect | Repro |
|---|---|---|---|
| D1 | **Major** | §16 balance gates G1, G2, G4, G5 fail; G8 fails in part.<br>• Founder is the best archetype in 74–81% of cells; saver and gambler are never best.<br>• `dd:flagged` does not beat `dd:never` (77.3% vs 77.3%, committed N=100).<br>• `inspect:1` is never top-U on 0-warn competed cards.<br>The implementer did not run the gates (spec implementation note 9), and `tools/balance-t6.md` does not exist | `node /tmp/v6/probes/simgates.mjs 50 <w>` per world, then `node /tmp/v6/probes/simreport.mjs`; `node /tmp/v6/probes/g5.mjs 12`. Cross-check: committed `tools/balance-data/matrix-*.json` |
| D2 | **Major** | G7: competition costs `smart` 12 pp of in-time wins in w3 and 6 pp in w4 (limit 5). The spec says to tune `pN` / `close` first | as D1 (`abl:noRival` = smart with `{_dev:{noRival:true}}`) |
| D3 | Minor | AC-21: group-challenge reference rows (🤖 toggle "להציג את יריבי המחשב (לא בדירוג)", default off, `rr2-settings`) are not implemented and not listed as cut (review m12, still open) | `grep -rn "יריבי המחשב" js/` → nothing |
| D4 | Minor | `saves.js softList` evicts other worlds' practice branches (`rr2-save-branch-*`) silently and without backup:<br>• This contradicts spec §7.2 ("never evicts" under the `rr2-save-` prefix).<br>• It even happens when the write fails anyway: a failing branch-w1 write destroyed branch-w3 and still returned `quota`.<br>• The `rr2-branches` meta entry is not pruned; I did not check what the lobby shows for it | `node /tmp/v6/probes/m3_quota.mjs`, scenarios 2–3 |
| D5 | Info | Test scale is below the spec: AC-3 60 instead of 300 games, AC-5 600 instead of 2,000 cards, AC-30 25 instead of 100 games per archetype per world. My probes cover AC-2 and AC-8 at full scale | `tests/t6_engine.test.mjs` output |
| D6 | Info | A branch is recognised only by `state.ui.branch`. A branch-slot state without `ui.branch` plays as an ordinary learning game, with no banner and no ↩. I found this while building a fixture; it is not reachable through the UI | `/tmp/v6/probes/dbg_branch.py` |

Not verified: AC-22 (no pre-T6 throughput baseline), the AC-31 SQL suite (drafts not approved), and the long suites and browser probes on e435125 (only the quick suites were re-run there).
