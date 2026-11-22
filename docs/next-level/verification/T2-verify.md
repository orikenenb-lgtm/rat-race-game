# T2 "Strategic depth core": independent verification

- **Verified commit:** HEAD `0f601d8` on `feat/rat-race-next-level`. I worked on a clean export (`git archive HEAD | tar -x -C /tmp/v2/wt`). Uncommitted edits in the shared tree (`js/ui.js`, `js/game.js`, `css/game.css`, `js/onboard.js`, `tests/game_e2e.py`) are **not** covered.
- **Engine:** canonical bundle `e9d0b3c299cf…`. `build-edge --check` ✓.
- **Balance data:** measured on `7f5b5ef06ed5`. I re-ran 90 matrix records on HEAD and they came out identical (§3).
- **Browser setup:** `SRC=/tmp/v2/wt COPY_DIR=/tmp/v2 PORT_BASE=8895 bash tests/serve_copies.sh` (copies on :8895–8897). Every context used the `fakebackend` Supabase guard; `assert_clean` came back clean.
- **Scope of changes:** no network, no production, no git writes, no code edits. I created only this file.
- **Probes and scripts:** `/tmp/v2/probes/*.mjs` and `/tmp/v2/browser/*.py`.
- **Logs:** `/tmp/v2/logs/`.
- **Screenshots:** `/tmp/v2/shots/`.

**Verdict:** the engine side of T2 and the four review fixes I was asked to check hold up. Two **major UI defects** remain:

- **D1:** at guide level, the highlighted option is invisible on about 40 % of deal cards.
- **D2:** the research focus's new edge from the M1 fix never reaches the screen, and the gauge mislabels how old the official figure is.

Several balance gates are still unmet (the balance report already says so). The seed set behind the gate numbers is less precise than the report implies (D3).

---------------------------------------------------------------------------------------------------

## 1. Suites (clean export, run one after another on the shared 2-core box)

| command | result | time |
|---|---|---|
| `node tests/t2.test.mjs` | **17/17** pass: T1–T15, review M2, review M1, review minors m1–m3 | 49 s |
| `node tests/verify.test.mjs` | **10/10** pass: 120 honest ranked games, forgeries, T17, CR-29, review B1 | 28 s |
| `node tests/determinism.test.mjs` | **2/2** pass: static scan; 300 games with Math nudged ±1 ulp | 68 s |
| `node tests/engine.test.mjs 400` (moderate) | **52/52** pass: 1,133 games (155 won / 547 lost / 431 bankrupt), 35/40 achievements seen | 909 s |
| `node tools/build-edge.mjs --check` | ✓ verify-result pins the current engine `e9d0b3c299cfd1c823f83761188dea5bb2ff2b977cc607a579dc38becf4e75cd` | — |
| `python3 tests/game_e2e.py --nl --nov32 --noplay` (desktop; copy with SHOTS → /tmp/v2/shots) | **pass**: dd, hint, impact, focus + agenda, gauge, payday focus, switch to pro, end analysis, w1 guide | 3.5 min |
| same with `--phone` | **FAIL (test flake, D9)**: inspect:1 lost the deal to a T6 rival, so the wait for `.ddbox.lv1` timed out | — |

## 2. Review findings: re-verified with my own probes

### B1 · ranked games around the cut-over: **FIXED**

Probe: `b1_cutover.mjs`. Each game is created the way `lobby.js` + `game.js` create it (`dateKey`), played by the seeded random player with the v4 actions, and replayed by the **edge bundle** verifier. I built each row the way `index.ts` builds it (`daily_key` / `weekly_start` / `challenge_day` / `finished_day`). Four games per scenario.

```
RULES4_FROM client 2026-12-07 verifier 2026-12-07 weekday 1 (Monday)
OK  daily 12-06 (Sun before)                          client 3 · verifier 3 · verified 4/4
OK  daily 12-06 begun, finished 12-07                 client 3 · verifier 3 · verified 4/4
OK  daily 12-07 (cut-over Mon)                        client 4 · verifier 4 · verified 4/4
OK  weekly W49 (Mon 11-30) played 12-05               client 3 · verifier 3 · verified 4/4
OK  weekly W49 begun 12-06, finished 12-08            client 3 · verifier 3 · verified 4/4
OK  weekly W50 (Mon 12-07)                            client 4 · verifier 4 · verified 4/4
OK  challenge created 12-03, played 12-20             client 3 · verifier 3 · verified 4/4
OK  challenge created 12-08                           client 4 · verifier 4 · verified 4/4
OK  NO dateKey, daily 12-05, finished 12-08 (window)  client 4 · verifier 3 · verified 4/4 (fallback 4)
OK  NO dateKey, daily 12-05, finished 12-05 (before)  verified 0/4  replay_mismatch   ← fallback correctly refused
OK  NO dateKey, challenge 12-01, finished 12-14       verified 0/4  replay_mismatch   ← after the window: refused
OK  NO dateKey, daily 12-05, finished_day missing     verified 0/4                    ← refused
lobby weekly-key fallback vs rules.js isoWeekStart, every day 2026-11-01..2027-01-10: 0 mismatches
```

- The client and the verifier share one date and one rule (`js/systems/rules.js` ≡ `verify_core.js`, and the suite tests that they are equal).
- The fallback from rules 3 to rules 4 happens only for results that finished in the cut-over week, and it is never applied from 4 to 3.
- `rr_begin` does not return `date_key` (the SQL is not in the repo). The lobby derives the key from:
  - `cache.weekly.key`;
  - the challenge's `created_at || starts_at` (the fake sets `starts_at = now` at creation);
  - today's Israel date.

  The only remaining risk is a midnight race between `rr_begin` and `P.israelDate()`.
- **Residual (by design):** a v3 ranked save started by a stale v3 tab *after* the cut-over is migrated to rules 3, because a v3 save has no `dateKey`. The verifier then says 4, and it never falls back from 4 to 3. This is review scenario 4; it is narrow and accepted.

### M1 · the "sealed" phase: **engine PARTIAL, UI FAIL (D2)**

Probe: `m1_research.mjs`. 60 free games per world with a random player; half of them pick research every third month.

| world | phase readable from the public bank-rate add-on | gauge \|signal − SCORE[phase]\|, sharp vs normal | "young" report → change next month | "ripe" → change | a public rate-tracker can derive "ripe" itself |
|---|---|---|---|---|---|
| w1 | **100 %** (4 values) | 5.2 vs 9.1 | 3/4,224 | 15 % | 9,758/9,993 report months, agrees 99.4 % |
| w2 | n/a (rate cards) | 5.9 vs 10.1 | 2/1,561 | 19 % | — |
| w3 | **100 %** | 6.0 vs 10.3 | 2/897 | 21 % | 1,999/2,160, agrees 99.6 % |
| w4 | **100 %** | 5.9 vs 10.4 | 0/577 | 21 % | 1,266/1,427, agrees 99.7 % |

How to read this:
- The "young → change" cases are all two-month jumps between my samples (for example months 1040 → 1042). The report is truthful.
- The fix chose "the phase is inferable, document it". `econ.phase` is no longer scrambled in T8, which is consistent with that choice.
- Research does give a real but limited edge **to someone who only reads the gauge**:
  - the gauge error drops by about 45 %;
  - the official figure arrives 1 month after the fact instead of 3;
  - a truthful phase-age report.
- To someone who tracks the bank rate it adds almost nothing: the tracker already knows the phase and its age in 94–98 % of report months.
- Outcome in the sim (balance report): `f:research` is best in 2 cells and worse than `f:none` in 24; `adaptive` is below `smart` in every world.
- **In the game none of this edge is visible (D2).**

### M2 · the level-1 range leaks the truth: **FIXED (minor residual D6)**

Probe: `m2_range.mjs`. 1,039 level-1 inspections. For each one I changed only the sealed truth (`f`, `vf`, `repair`, `risk`; jitter kept) and inspected again.

- **Value-range width:** identical in 1,039/1,039.
- **Cashflow-range width:**
  - identical within rounding in 988/1,039;
  - the other 51 are the shown (asset-level) range of w2 NOI cards and w3 FX cards whose range crosses zero. That transform applies the cycle and FX factors differently on each side of zero, so the width only tells you what the range already shows: that it crosses zero.
- **Position:** moved in 975/1,039. The jitter is the only sealed part.
- **Truth inside the shown range:** 948/948 (checked against the `inspect:2` verified number).
- **Residual (D6):** the cashflow and value ranges share **one** jitter. A Bayesian who combines the value range with the public factor tables (`ddCfg`, same risk class for f and vf) narrows the feasible cashflow interval from 82 % to 76 % of the range on average, and below 25 % in 54/636 positive-claim cases. My model is approximate: it keeps the truth feasible in 93 % of cases.

Extra check, `impact_l1_scramble.mjs`: I moved the sealed truth and the jitter together so the **published** level-1 range stays identical (1,417 cases). `impactFor`, `scoreOptions` and the hint changed in only 6, 5 and 2 cases (about 0.4 %). `describe` itself changed in 5 of them, which points to my scramble's rounding rather than a leak channel. Conclusion: no meaningful level-1 leak through impact, scores or hints.

### M4 · w1 naive ≤ smart − 5 pp: **PASS (barely, D3)**

From `tools/balance-data/matrix-*.json`, paired by (character, seed):

```
w1: smart 90.8% naive 83.2%  paired diff +7.5 pp ± 3.6 (95% CI) → naive ≤ smart − 5  ✓ (lower CI bound 3.9 < 5)
w2: smart 75.3% naive 51.0%  +24.3 ± 5.1
w3: smart 65.7% naive 38.0%  +27.7 ± 5.9
w4: smart 73.0% naive 72.0%  +1.0 ± 6.3   ← director target "smart ≥ naive + 5 in every world" NOT met in w4
w1 life:cheap 93.8% vs life:dear 84.2% = 9.6 pp (target ≤ 10 ✓, borderline); w2 cheap 82.0 vs dear 56.0 = 26 pp (review M4 said the same about w2; it is unchanged there)
```

### Minors claimed fixed (m1–m3)

- Covered by the t2 test "review minors", which passes.
- My browser run confirms m1: the hint clears after an inspection, and asking again is counted again (`dq.hints` +1 per request, saved).
- Not fixed, and not claimed:
  - **m5:** `fakebackend.py:571` still uses `starts_at` in UTC.
  - **m6:** `expected.base` is not exposed. T9's dd branch asserts only that assumptions exist.
  - **m10:** content verdicts are still in `w2.js:114` ("עדיף ממזומן ולא מאשראי") and `w3.js:72` ("ולכן המחיר מנופח").

## 3. Small independent simulation sample (HEAD)

Probes: `sim_sample.mjs` and `sim_sample2.mjs`.

**Exact replay of the committed matrix.** The first 5 seeds × all characters × {blindTapper, guideTapper, smart} give **45/45 identical** records in w2 and **45/45** in w4. The report's data is therefore valid for HEAD.

**Fresh seeds, 30 per character (90 per policy per world, seeds `seedOf(w, 500+i)`):**

```
w2 blindTapper  3.3% ±3.7 vs report  7.3%      w4 blindTapper  6.7% ±5.2 vs  5.7%
w2 guideTapper 48.9% ±10.3 vs report 60.0%     w4 guideTapper 65.6% ±9.8 vs 62.7%
w2 smart       56.7% ±10.2 vs report 75.3%     w4 smart       84.4% ±7.5 vs 73.0%
```

**100 seeds per character (300 per policy):**

```
w2 hashed seeds     smart 72.0%  guideTapper 61.3%   (report 75.3 / 60.0)  bucket mix ≈ report's
w2 seeds 500..599   smart 63.0%  guideTapper 52.7%
w4 hashed seeds     smart 77.3%  guideTapper 68.3%   (report 73.0 / 62.7)
w4 seeds 500..599   smart 77.0%  guideTapper 69.3%
```

Reading:
- blindTapper agrees everywhere.
- The hashed sample agrees with the report within about 3–6 pp.
- A second block of seeds from the same arithmetic family moves w2 smart by **−12 pp**.
- Every character and policy shares the same seeds, so cycle path and deck luck are common to all of them. The real standard error of a per-world rate is therefore about 4–5 pp, not the binomial 2.5 pp (D3).
- **Consequence:** these gates are not statistically settled, either way:
  - A3 w2 (75.3 vs the 75 ceiling);
  - A1 w2 (60.0);
  - the director's "guide ≥ 60" (w2 at exactly 60.0);
  - M4 w1 (gap 7.5 vs 5);
  - "w1 cheap vs dear ≤ 10" (9.6).

  My hashed sample would put w4 smart **above** 75 (A3 fails there too) and w4 guide above 65.

## 4. Browser: w2 at hint, played as a thinking player for about 10 turns (`t2_play.py`, desktop 1300×820 and phone 390×800)

What I did each run:
1. Picked the research focus in month 1.
2. Read the gauge.
3. On every card:
   - scanned the whole DOM for verdict words;
   - counted highlighted options (DOM `.primary` and engine `o.primary`);
   - asked for a hint on some cards;
   - opened the impact panel on major options;
   - compared every before → after row with `E.impactFor` on the saved state, formatted with the engine's `fmtM` / `sgn`.
4. On deals: read the flags and the claim, asked a hint, read impact, inspected, re-read impact, bought, and compared impact with the real result.
5. Finally forced a deal: `inspect:2`, then bought on the certain basis and compared.

| check | desktop | phone 390 |
|---|---|---|
| mentor / rules of a new w2 game | hint / 4 | hint / 4 |
| cards seen | upgrade, doodad, payday ×2, bank, deal | crisis, upgrade ×2, payday, doodad, deal, bank (+ forced deal) |
| highlighted options at hint (DOM and engine) | **0** | **0** |
| strict verdict words (`ההמלצה` / `משתלמת` / `מומלץ`) in the DOM at any point | **0** | **0** |
| extended words | `לא כדאי כש…` only in the focus tiles (spec §17 `notBest`); `תזרים היה עדיף` only inside the *post-decision* verdict pill | same |
| hint panel | 3 hints, dashed `רמז` badge on 1 option, never `.primary`; note "לא הבטחה" present | same; hint lists the rival risk |
| impact table vs `E.impactFor` (cash, cashflow rows) | 7/7 identical | 5/5 identical |
| certain basis: impact "after" vs real after choosing | upgrade, doodad, bank, payday: exact | forced level-2 buy: cash ₪816,800 = ₪816,800, cashflow +₪1,022 = +₪1,022 |
| expected basis (level 1) bought | cash 630 = 630; cashflow 4,028 vs real 4,010 (difference = midpoint − truth, inside the range) | deal lost to rival "מאיה" after inspect:1 |
| gauge vs `metrics().econ` | label, signal and aria-label (`מד הכלכלה: מיתון, 20 מתוך 100`) match; **report text not shown, lag mislabelled (D2)** | same |
| focus picker | 7 tiles, costs, `notBest`, disabled reasons; no "suggested" tag at hint; set → saved | same |
| layout overflow (page, card, impact, hint, focus) | none | none; **toasts overlap card content (D7)** |
| console / page errors · guard | 0 · clean | 0 · clean |
| w1 guide | highlights present (5/7 cards); **flagged deals with an inspection primary show no highlight (D1)** | — |

Node scan (`verdict_scan.mjs`), 48 games per level across all worlds:
- 7,568 hint events and 7,568 pro events.
- 0 verdict-word hits (`ההמלצה`, `משתלמת`, `מומלץ`, `ממליץ`, `הבחירה של המנטור`).
- 0 primaries, 0 `suggested:true`.

Additional consistency probe (`impact_loan.mjs`, 873 loan-financed level-1 buys):
- Impact's cashflow change equals the card's public basis (median |impact − exp| = ₪0).
- impactΔ − realΔ = exp − truth in 600/873. The rest differ because the real repair is not the bucket's expected repair, so the loan is a different size.
- Real Δcf falls **outside** the buy button's "לפי הבדיקה: X עד Y" range in 202/873 (D5).

## 5. Acceptance criteria

**Gates, spec §13.5.** Numbers come from `tools/balance-report.md`, whose records I reproduced on HEAD.

| # | criterion | status | evidence |
|---|---|---|---|
| A1 | guideTapper ≥ 65 % in every world, no character < 50 % | **FAIL** | w1 67 · w2 60 · w3 76 · w4 63 (per-character floor holds); my hashed sample: w2 61, w4 68 |
| A2 | blindTapper ≤ 30 % | **PASS** | 2 / 7 / 5 / 6 %; mine: w2 3 %, w4 7 % |
| A2b | naive ≤ 40 % (target) | **FAIL (reported, not blocking)** | 83 / 51 / 38 / 72 % |
| A3 | smart and adaptive 55–75 % | **FAIL** | w1 91 / 89; w2 75.3 (edge); w4 73 (mine 77) |
| A4 | no policy best in > 60 % of cells | PASS (report) | smart 40 % of 31 cells; I did not re-run the cells |
| A5 | each focus best in ≥ 1 cell and worse than none in ≥ 1 | PASS (report) | f:research best in 2 cells, worse in 24 |
| A6 | dd:flagged beats never and always | **FAIL** | pooled 77 % = never 77 %; beaten in only w1 and w4 |
| A6b | always < never in ≥ 1 world | PASS | all 4 worlds |
| A7 | no option top > 85 % except the allowlist | **FAIL** | plan:study, w2 trims, w2 price:up (report) |
| A8 | ramp | **FAIL** | follows from A1/A3 |
| A9 | ablations change smart by ≥ 3 pp | PASS | noDD 7–24 pp, noCycle 5 pp in w3, f:none 3 pp in w3/w4 |
| A10 | describe p95 < 2 ms, impactFor p95 < 8 ms, sim speed | PASS / **NOT VERIFIED** (speed) | 0.13 / 1.8 ms; games/s measured on a loaded box (report says so) |

**Director targets (review M4):**
- smart w1 70–85 %: **FAIL** (91 %).
- guide ≥ 60 %: PASS, but w2 is exactly 60.0.
- blind ≤ 30 %: PASS.
- smart ≥ naive + 5 everywhere: **FAIL** (w4 +1.0).
- w1 cheap vs dear ≤ 10 pp: PASS (9.6).

**Unit tests, spec §14:**

| id | status | evidence |
|---|---|---|
| T1–T15 | PASS | t2.test.mjs 17/17 |
| T16 | PASS | engine.test.mjs 52/52 at 400 games; determinism 2/2 |
| T17 | PASS | verify.test.mjs 10/10 |
| T9 (expected-basis numbers) | weak test | the dd branch checks no numbers (m6). My probes cover it: impact = public basis; certain basis exact in the browser |

**UI, spec §15:**

| # | requirement | status | evidence |
|---|---|---|---|
| 1 | mentor level picker / in-game change | PASS (in-game) / **NOT VERIFIED** (lobby picker, ranked lock note) | e2e --nl desktop: switch to pro, confirm, no hint button |
| 2 | highlighting: hint/pro none, title focus; guide reads `o.primary` | hint/pro **PASS**; guide **FAIL (D1)** | 0 primaries; e2e asserts title focus; inspection primaries not rendered |
| 3 | DD on the deal card: flags, claim / range / verified, repairs, inspection row, card stays open | PASS with minors D4, D5 | screenshots `v2_deal_*`, `v2_deal_inspected_desk.png` |
| 4 | focus picker, agenda, payday section | PASS | e2e (agenda network), my runs |
| 5 | hint button, counter, dashed badge, reasons, note | PASS | — |
| 6 | gauge: label, sparkline, official line, sharp badge, aria; never a phase name outside label / official | PASS for the listed items; **FAIL on the T2-M1 contract (D2)** | — |
| 7 | impact panel (collapsed at hint, rows, risk, scenarios, disclaimer) | PASS | 12/12 rows equal to the engine; certain basis exact |
| 8 | verdict pill only post-decision | PASS | e2e; my runs |
| 9 | end-screen analysis | PASS (pro) | e2e desktop |
| 10 | strings / numbers from the engine only | **FAIL (D2)** | hard-coded "לפני 3 חודשים" |
| 11 | accessibility: gauge aria, hint aria-live, impact `<details>` | PASS (spot check) | — |
| — | phone 390 layout: deal / impact / focus | PASS (no overflow) with **D7** | `v2_*_phone.png` |

## 6. Defects

**D1 · MAJOR · the guide highlight is invisible when the highlighted option is an inspection** (`js/ui.js` `ddBox` → `insBtn`)
- `insBtn` renders `class="insp"` and never adds `primary` when `o.primary` is set. The highlight rule from T3 review M7 ("check a flagged deal first") makes `inspect:1` the primary on **371/938 (40 %)** of w1 guide deal cards that offer an inspection (`guide_insp.mjs`).
- On those cards:
  - no button is highlighted (`.primary` count 0);
  - keyboard focus goes to `#evTitle`;
  - the impact panel does not auto-open.
- That breaks spec §15.2 for the kids' world, which is exactly where guide is the default.
- **Repro:** w1 guide game, force or land on a flagged deal. Screenshot: `/tmp/v2/shots/v2_w1_guide_flagged_deal_no_highlight.png`. DOM: `inspect:1:insp, inspect:2:insp, offer:*:noff, buy:hasnet, pass:` while the engine says primary = `['inspect:1']`.
- **Fix:** add `${o.primary ? 'primary' : ''}` to the inspection button class, and let `focusPrimary` find it.

**D2 · MAJOR · the research benefit from the M1 fix never reaches the player; the gauge mislabels the lag** (`js/ui.js` `econBlockHtml`)
- The function always prints `נתון רשמי (לפני 3 חודשים)`.
- It ignores `econ.officialLag`: with research active the lag is 1 month, so a 1-month-old figure is labelled as 3 months old.
- It ignores `econ.report` (the phase-age report): its text "לפי הדוחות: השלב הנוכחי כבר ארוך…" was absent from the gauge modal while the engine returned it (desktop run, month 1).
- So in the shipped UI, research buys only the sharper needle. The "real, limited edge" exists only in the engine.
- The "3" is also a UI-side number (§15 general rule).
- **Fix:** render `official` with `officialLag` and show `report.text` when `report` is present.

**D3 · MEDIUM (balance method) · the gate numbers carry seed-set uncertainty that the report does not state**
- One fixed, contiguous seed family is shared across all characters and policies.
- An independent 100-seed block moves w2 smart from 75.3 % to 63.0 %; hashed seeds give 72 % (w2) and 77 % (w4).
- **Fix:** gates within about 5 pp of a threshold need confidence intervals that treat the seed as a cluster, or a second seed family (review m7 asked for the same on A6).

**D4 · MINOR · level-1 deal card: the big cashflow figure is still the seller's claim but carries the badge "טווח מהבדיקה"**
- Example: `+₪2,570` badged as the inspection range while the range is ₪2,130–₪2,890.
- Screenshot: `/tmp/v2/shots/v2_deal_inspected_desk.png`.
- §15.3 expects the range at level 1.

**D5 · MINOR · the buy button's level-1 range "לפי הבדיקה: X עד Y" leaves out the repair-driven loan cost**
- At level 1 the repair is only a bucket, so a larger real repair means a larger loan and more interest.
- The real cashflow change falls outside the stated range in 202/873 (23 %) of loan-financed level-1 buys (`impact_loan.mjs`).
- **Fix:** widen the range by the repair bucket's loan-cost span, or word it as "תזרים הנכס".

**D6 · MINOR · M2 residual: one sealed jitter positions both the cashflow and the value range**
- Combined with the public tables, this narrows the cashflow range a little (82 → 76 % of the range on average).
- **Fix:** derive the value position from a different function of `jitterR` (for example `1 − j` mixed with `valueR`), without adding a draw.

**D7 · MINOR · phone 390: toasts cover T2 content**
- The T4 "שיעור חדש בספרייה · לקרוא" bubble and the low-graphics "למצב קל" bubble float over:
  - the deal card's header and mentor line;
  - the impact panel's tab row and summary;
  - the focus sheet's month and agenda slots.
- Screenshots: `v2_deal_1_phone.png`, `v2_impact_phone.png`, `v2_focus_picker_phone.png`. These are not T2 elements, but they block T2 controls.

**D8 · MINOR · open review items still unfixed**
- **m5:** the fake backend derives `challenge_day` from `starts_at` in UTC, while `index.ts` uses `created_at` in Israel time.
- **m6:** `expected.base` is not exposed, and T9 does not check expected-basis numbers.
- **m10:** the content verdicts in `w2.js:114` and `w3.js:72` are still there.
- **B1 scenario 4** (stale v3 tab) remains by design.

**D9 · MINOR (test) · `tests/game_e2e.py --nl --phone` is flaky**
- It assumes `inspect:1` keeps the card open, but T6 competition can close the deal ("…סגרה את העסקה לפניך"). It failed on my run; my own phone run saw the same thing.
- **Fix:** handle the rival-loss modal, or force a card with no rival.

**Note (no defect):** the post-decision verdict pill (for example "החלטה יקרה · תזרים היה עדיף: לקצץ…") stays in the DOM over the next card at hint level. This is by design (§15.8). It is post-decision only; nothing is shown before a decision.

## 7. Artifacts

**Probes:** `/tmp/v2/probes/`
- `b1_cutover.mjs`
- `m1_research.mjs`
- `m2_range.mjs`
- `impact_l1.mjs`
- `impact_l1_scramble.mjs`
- `impact_loan.mjs`
- `guide_inspect.mjs`
- `verdict_scan.mjs`
- `sim_sample.mjs`
- `sim_sample2.mjs`

**Browser scripts:** `/tmp/v2/browser/`
- `t2_play.py`
- `guide_insp.py`
- `game_e2e_v2.py` (the repo suite with SHOTS redirected)

**Logs:** `/tmp/v2/logs/`
- `t2.log`, `verify.log`, `determinism.log`, `engine.log`, `buildedge.log`, `summary.txt`
- `m2_probe.txt`, `m4_balance.txt`, `sim_sample*.txt`
- `e2e_nl_desk.log`, `e2e_nl_phone.log`

**Screenshots:** `/tmp/v2/shots/`
- My runs: `v2_*` (desktop and phone deal, hint, impact, inspected deal, gauge, focus picker, payday, HUD; the w1 guide deal; D1 evidence).
- Repo e2e: `e2e_*`.
