## Reading (engine lane, final balance pass of the "Next Level" upgrade, T6 verify D1/D2 + playtest items, 2026-11-22)

**Engine measured.** `d1d75867c5b6` (sha256 of the canonical bundle), every file in `tools/balance-data` (matrix N = 100 per world ×
character × policy, `--dominance 40`, `--stories 60`, `--perf`, `--rivals 80`) on a clean export of the committed tree. The box ran other
lanes' suites at the same time, so the A10 speed row is not an engine measurement.

**What changed (all rules 4 only; rules-3 golden, fixed draw counts, scrambles and replay identity hold — t2 T1–T8, determinism).**
* *Deal competition (G7).* `close` tables: the first delay step is a quick look that others rarely beat (HARD step 1: .08 / .15 / .25 for
  1 / 2 / 3 interested, was .20 / .35 / .50); a second step gives them time. w4 (prior risk 2–3 ≈ 52 %: checking is needed more often)
  closes a bit slower still. `pN` / `roiCuts` unchanged, still 4 draws per landing. AC-8 calibration passes on 300,000 cards per world.
* *The reference player reads the 👥 chip.* `smart` (sim) checks a flagged deal unless the shown risk is ≥ 30 % (the guide's own M7 rule)
  and makes a lower offer only while the risk is < 15 %; `dd:always` keeps inspecting whatever the risk. In net-worth worlds smart values a
  deal at the public basis (value × expected value factor − expected repair), not the seller's claim.
* *Due diligence (G4).* Hidden problems cost real value in the net-worth worlds (w3/w4 value factor risk 2: .72–.97, risk 3: .45–.85) and
  more cash in w1 / w2 (w1 cf risk 2 .30–.95, risk 3 −.60–.50; w2 cf table of its own, NOI risk 2 .62–.98, risk 3 .30–.85; w2 prior
  .27/.31/.26/.16). The guide's "check a flagged deal first" (M7) now outranks a lower offer too, so the highlight stays the evaluator's best.
* *Business and cycle realism (G1/G2).* Asset values follow the cycle (an asset's monthly value change × 1.5 in a boom, × 0.8 in a
  slowdown, × −0.5 in a recession, amp-scaled; only w3/w4 assets have `grow`). Non-rent cash flow feels a recession more (cfOther slow .96 /
  rec .84 / recov .96, was .98 / .90 / .97); an owner-run business loses 20 % of its customers for 6 months when a recession starts (was
  12 % for 4).
* *Archetypes (rule cards unchanged and still true, AC-30; ARCH_V 2).* gambler: overtime only while there is energy for it (was > 35 🔋:
  8–29 burnouts a game) and his lower offer is the 5 % step (offer:15 lost 70 % of his deals to refusals) — he still always tries to lower
  the price; founder: a rent asset only when it adds ≥ 20 % of E (was 10 %); diversified: a second asset of a kind from 5 % of E (was 10 %),
  a loan from 8 % (was 15 %), her lower offer is the 5 % step.
* *Playtest items.* B6: in rules 4 a crisis landing before month 6 passes by (the card still draws). S6: an inspection the information
  justified (warning signs, a checked range across zero, or a value of information worth its cost) scores ≥ 85; a payday plan choice is a
  wide band (≥ 60 unless risky) and the same "keep going" within 6 months is one decision, not one per payday (the careful learner's 42/100
  came from ~40 identical payday verdicts, not from the inspections, which already scored ~98). B4: every chance outcome of a story choice
  is a news item marked `outcome: true, hit` (job search and rent negotiation already had text; the cake order's on-time and advance
  outcomes now do too). The per-option 24-month / 3-month totals stay in the engine data.

**Gates met.** G1 (founder 39 % / diversified 47 % / saver 10 % / gambler 5 % of 31 cells, was founder 81 %), G2 (saver w3 B1, gambler w3 B0,
founder w1–w3, diversified w1–w4), G3, G4 / A6 (flagged 79 % / 52 mo beats never 76 % / 53 and always 64 % / 60; w1, w3, w4), G7 (−0.5 / −1.3 /
+0.3 / −2.3 pp, was up to −12), A2, A4, A6b, A10. Keep list: guide 71 / 63 / 79 / 64 % (worst character 55 %), blind ≤ 8 %, smart ≥ naive +
7 pp everywhere, smart w2–w4 74 / 76 / 73 %, w1 90 %.

**Not met — needs a decision (numbers in the tables above).**
* G5: on flag-free competed cards `inspect:1` is almost never the top option (0 %): such cards are strong deals, where the value of
  information is 0, and on the borderline ones the professional check (inspect:2, full information) outranks it. On flagged competed cards it
  is top 91 % (limit 85 %) because of M7. Meeting both bounds needs an evaluator change (spec: "never optionU weights for T6's sake"), e.g.
  scoring inspect:1 against inspect:2 with the level-1 range instead of 0.7 × the full-information value.
* G6: smart's median lost deals per 60 months is 0 (mean 0.43; dd:always 2.37, naive 0). A player who reads the chip rarely delays a contested
  deal, which is what G7 needed; G6 and G7 pull against each other for this policy. Recommendation: measure "felt" on dd:always /
  the guide-tapper, or accept a mean in [0.3, 2.5].
* G9 (report): the sim sample (2–2.7k competed cards per world) is within ±5 pp of the table; the 300,000-card AC-8 check is the binding one.
* A5 / A9 (T2, regressed from met): with asset prices following the cycle, the cycle's gains and losses roughly cancel for smart (abl:noCycle
  within ±2 pp, medians 2–3 months faster without it) and the research focus is never the best focus. A1 (guide ≥ 65 %: w2 63 %, w4 64 %),
  A3 / A8 (w1 smart 90 %) and A7 (`plan:study`, review m13) were already open.
