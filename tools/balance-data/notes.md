## Reading (engine lane, after T3 + the T2 review fixes, 2026-11-22)

**What changed since the T2 report.** T3 (chains, the story inbox, business seasons / events / setups, the w1 life-money scale), the
review fixes (M2 range widths from the claimed numbers, M1 research redesign, m1–m3) and the M4 tuning (DD priors w1 .40/.30/.18/.12
with a harsher risk-3 cashflow range, w2 .30/.33/.24/.13 on the hard table, w4 .20/.28/.30/.22 with CF_W4; w1 `lifeMoneyScale` 0.28).
The smart policy now uses v3's business-offer rule (review M3 / gate A5) and resolves story items with the evaluator (financial and
mixed; the default on personal items); guideTapper takes the highlighted story option, blindTapper a random one half the time.

**Engines measured.** w1 = `0d3b65e979f1` (final). w2–w4 = `52a975f645f6`: the only differences to the final engine are w1 data and
one business note string, so their numbers stand for the final engine.

**Met:** A2, A4, A5 (f:ops is now best in 7 cells and worse than f:none in 4 — the smart business rule made the ops focus usable), A6,
A6b, A9; director targets: blindTapper ≤ 30%, smart ≥ naive + 5 pp in every world (w1 91 vs 84 — believing the seller no longer wins
the kids' world), the w1 habit gap on personal / values cards 10 pp (94 vs 84; it was 95 vs 63 before the scale).

**Not met, with the reason:**
* **smart / adaptive too high in w1 (91 / 88) and w2 (79 / 78)**, just above in w4 (74 / 71); w3 is inside (75 / 75). Lowering the
  life-card money (needed for M4 c) made w1 easier for every careful policy. **guideTapper < 60% in w4 (54%, engineer 37%)** and
  A1's per-character floor in w1 (doctor 47%). The levers tried move smart and guideTapper together (the T2 finding still holds: the
  smart − guide gap is 15–25 pp); the harder DD tables pushed w4's guide under 60 while smart only fell 83 → 74. Hitting all three
  targets at once needs either a better guide highlight on the cards that decide w4 (business offers, the w4 deal mix) or per-character
  time limits for rules 4 — both are design decisions, so they are left to the director (recommendation: rules-4 per-character limits
  for doctor / engineer, and keep the DD tables).
* **A7**: `plan:study` is still top in every appearance until the degree is done (study early is dominant since v3), plus w2
  `upgrade:trim`. Unchanged from T2; needs a study-plan rebalance.
* **A10 sim speed**: 8.5 games/s (pre-T2 baseline 12.3, T2 14.2) measured while other lanes ran browser suites on the same 2 cores —
  T3 adds the story month, the business `why` / stage (a valuation per simulated month) and the policies' inbox reads (business
  previews run 3-month forecasts). The generated A10 row says "met" because the perf file has no baseline; read it as ~69% of the
  pre-T2 speed (target ≥ 75%), unconfirmed on an idle box. describe p95 0.13 ms and impactFor p95 1.3 ms are well inside budget.
* **T3 stories table**: crisis (90–98%) and career (81–90%) start more often than the [TUNE] ceilings (85% / 80%) even with the sealed
  trigger odds, and chain items per 12 months have a median of ≈ 1.4 (target 2–3). Pacing holds everywhere (≤ 2 open items, ≤ 2 open
  chains, no standalone repeat inside 12 months, completion ≈ 90%), business items ≈ 2.4–2.9 per business-year (target 2–4). The
  frequency and the item-count targets pull in opposite directions; content (more steps per chain) is the way to raise items without
  starting chains more often.
