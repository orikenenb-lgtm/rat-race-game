# w14 · רובע הבנקים — as built (engine lane, wave A3; registered, lazy, playable)

Module `credit` (`js/worlds/mech/credit.js`) · tier 8 · unlock: ★ in one of w9 / w10 · minRules 7 · difficulty 4/5 · numbers TUNE. Spec: CATALOG-25
§1.4 (w14 card), §2.4, §6.3 (`W14-select`, `W14-run`). The draft history (first and second pass) is kept below.

## Third pass (registered)
The two open gates of the second pass needed two things (the doc's own next steps): a correlated credit shock the guide cannot fully avoid, and
a passive path that decays faster.
- **The shared credit cycle (1 more draw a payday → 7: 5 default draws, confidence, the cycle).** Every segment's default draw is tilted by the
  same cycle draw (weight 0.4), and a cycle draw above 0.98 starts a **credit crunch**: 9 paydays of PD × 3.5 in every segment (developers
  × 4.5), new-lending demand × 0.6 and a confidence shock of −15 for 3 months (mentor key `crunch`; indicators `crunch`, `crunchUntil`,
  `crunches`). It hits every bank whatever its prices; a bank that kept capital above the minimum survives it, but a late crunch or a
  regulator entry (it restarts the 12-payday `noDefault` part) can push even the guide past the month limit → smart loses 6 %.
- **The stock side of adverse selection.** Priced above the market (δ > 0), the good floating-rate borrowers of the existing book refinance
  away: an extra runoff of floating book × δ / maturity a payday, and the leavers carry half the segment's average PD, so the book's PD
  mix rises. The old management's +1.5 pp (what a passive bank keeps) now shrinks and sours the inherited book → blindTapper 5 %.
- **Market spreads +0.9 pp** (mortgages 2.7, SMEs 4.5, developers 5.5, consumer 7.9, corporates 3.1 over the policy rate) so an active bank
  that prices at the market reaches ₪700M in about 64 months despite the crunches (G-time: median 91 rolls).
- **A bought book's discount is a credit mark, not a day-one gain:** provisions += max(discount, expected loss); equity moves only by
  min(0, discount − expected loss). (Before, every discounted J book added its discount to equity at once, which made "take every offer"
  the fastest path.)
- riskChief's demand 0.8 → 0.9 (her slow book kept her under the guide's other characters by 10 pp).

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w14`, 290 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper | 94% | 100% | 64 | 0% |
| blindTapper | 5% | 99% | 104 | 0% |
| naive | 58% | 79% | 72 | 17% |
| smart | 94% | 100% | 64 | 0% |
| saver | 61% | 100% | 82 | 0% |
| founder | 83% | 100% | 73 | 0% |
| diversified | 93% | 100% | 68 | 0% |
| gambler | 49% | 95% | 84 | 0% |
| f:frugal / f:none / maxDebt | 94% | 100% | 64 | 0% |
| priceLow | 61% | 100% | 81 | 0% |
| priceHigh | 0% | 96% | 111 | 0% |
| maxMismatch | 71% | 100% | 81 | 0% |
| noDividendEver | 95% | 100% | 63 | 0% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 94 % · worst 92 % (riskChief 94, familyBanker 97, fintechFounder 92) |
| G-blind | met | 5 % |
| G-smart | met | smart 94 % med 64 · naive 58 % med 72 |
| G-reach | met | 94 / 97 / 92 % |
| G-loss | met | naive 42 % (bankrupt 17 %) · maxDebt 6 % · smart loses 6 % |
| G-dom | **NOT met** (accepted open) | A4: diversified best in 100 % of 6 cells · ablations maxMismatch 71 % (Δ 23 pp), priceHigh 0 % (Δ 94 pp) |
| G-frugal | met | 94 vs 94 % |
| G-durable | met | 216 / 216 |
| G-time | met | median 91 rolls (p10 75, p90 105) |
| W14-select | met | priceLow 61 % vs smart 94 % · new-loan PD × 2.85 (priceHigh) vs × 1.15 |
| W14-run | met | runs: naive 30 % · smart 0 % |
G-dom: `diversified` (the base archetype with the credit module's neutral management) is the best of the four archetypes in every cell; the
others change prices (`saver` +0.5, `founder` −0.5, `gambler` −1 / liquidity low / takes every offer) and all lose to it. Not fixed here
(the task allows G-dom alone open). `noDividendEver` does not lose (dividends move equity into the owner's pocket), so the ablation list is
maxMismatch + priceHigh, as in the second pass.

### Registration
`LAZY_IDS` + `js/worlds/all.js` + meta (tier 8 ← 1 of w9 / w10, status lazy, playable) + SQL draft row (`20261125_worlds.sql`, unranked, never
applied) + re-pin: core +7 chars (`'w14'` in `LAZY_IDS`, 885,660 / 900,000) and pack `w14` = w14.js + mech/credit.js, 42,021 chars (21.0 % of
200,000). `tests/w14.test.mjs` 13 tests. Lessons (with the pack): `bank_run`, `adverse_selection`, `maturity_mismatch`.

### Fixed draws (stream `world`)
init **0** · payday **7** (5 default draws, 1 confidence, 1 the shared cycle) · `J` landing **3** (the offer, its sealed quality, spare).

---

# Draft history


(Second-pass status, superseded:) `js/worlds/mech/credit.js` (module `credit`, ~250 lines), `js/worlds/w14.js` (world data) and `tools/policies/credit.mjs` exist, but
w14 is **not** in `LAZY_IDS`, `js/worlds/all.js` or `js/worlds/meta.js`, so no game, pack or pin carries it (the core pin is unchanged by it).
Reason: the balance is not acceptable yet — a passive bank (no module action) reaches the goal almost as fast as the guide.

## What is built
- 5 segments (mortgages, SMEs, developers, consumer, corporates): book, fixed-rate share and its yield, a book-weighted PD multiplier
  (adverse-selection memory), a price delta vs the market (−1 … +1.5 pp), stop-lending switch. Sealed: the month's default draws.
- Adverse selection: new volume × (1 − 0.45 δ), new-loan PD × (1 + 0.6 δ) above the market. Expected loss provisioned at origination;
  realised losses consume provisions first. A draw > 0.985 on corporates / developers = a big single default (3 % of the segment).
- Funding: retail deposits (follow the policy rate − 2 pp with a lag), wholesale at policy + 0.6 + stress, a liquidity buffer (10 / 15 / 25 %
  of retail), the central-bank window (once per 12 paydays, 2 % fee) or a fire sale at 85 % in a run.
- Capital ratio = equity ÷ RWA; < 8 % → the regulator (lastEvent `regulator`: 12 paydays without dividends or risky lending); < 5 % → resolved
  (bankrupt). Confidence 0–100 (capital, losses, hot money, the liquidity buffer, rumours); < 30 → a run.
- Tile `J` (הצעה לבנק, 3 draws): a loan book at a discount with a sealed PD multiplier (a credit committee narrows it), a big corporate loan, a failed
  rival's deposits. Z: `price seg:δ`, `tighten seg`, `liq low|mid|high`, `raise` (+20 % equity at −15 %: dilution), `sellBook seg` (25 % at 85–95 %),
  `dividend` (25 % of the 12-month profit to the owner).
- Draws: 0 at init, 6 per payday (5 default draws + 1 confidence), 3 per `J`.
- Goal: `all` hold 3 — `modValue equity` (your stake × equity) ≥ ₪700M, `modValue capRatio` ≥ 0.10, `noDefault` key `regulator` 12.

## Second pass (fixes asked by the coordinator)
- **Binding capital:** starting books 2.3 / 2.6 / 1.9 B → capital ratios 9.9 % / 9.0 % / ≈ 10 % at the start.
- **Run-off inherited book:** `seg.leg` = the starting book; it earns 0.8 pp below the market (`LEGACY.yAdj`) and runs off 2× faster
  than new loans (`LEGACY.run`). New loans of the old management are priced +1.5 pp (adverse selection: PD × (1 + δ), `SEL.pd` 1.0), and the
  liquidity buffer starts `low`.
- **Cycle-dependent vintages:** new-loan PD × `VINT` (boom 1.3 · slowdown 1.0 · recession 0.8 · recovery 0.9), blended into the segment's PD mix.
- Opex is mostly fixed (0.09 %/month of the starting book) + 0.03 %/month of the book; demand 7 % of the starting segment book a month;
  the fintech's deposits grow 1.3× with its lending (and leave 3× faster in a run).
- The guide: the market price; −0.5 pp on the wide-margin segments (spread ≥ 3.5) while capital ≥ 12 %; +0.5 below 10.5 %.

## Gates (N = 36 per character, rules 7, goal ₪700M — not registered: 3 gates open)
| gate | status | numbers |
|---|---|---|
| G-guide | met | 99 % · worst 97 % |
| G-blind | **NOT met** | 18 % (passive play: median 91 months) |
| G-smart | met | smart 99 % med 70 · naive 28 % med 87 |
| G-reach | met | 97 / 100 / 100 % |
| G-loss | **NOT met** | naive 72 % (bankrupt 10 %) · smart loses only 1 % (the guide is too safe) |
| G-dom | **NOT met** | A4: diversified best in 92 % of 6 cells · ablations maxMismatch 31 % (Δ 68 pp), priceHigh 9 % (Δ 90 pp) |
| G-frugal / G-durable / G-time | met | 99 vs 99 · 216 / 216 · median 100 rolls |
| W14-select | met | priceLow 12 % vs smart 99 % · new-loan PD × 2.84 (priceHigh) vs × 1.12 |
| W14-run | met | runs: naive 24 % · smart 0 % |
Tried for G-blind / G-loss: target ₪730M / ₪750M (blind 8 %, smart loses 4 %, but G-time breaks: 103–106 rolls). `noDividendEver` is not an
ablation that loses (dividends move equity to the owner's pocket); the ablation list is maxMismatch + priceHigh.
Next: more outcome variance for the guide (a correlated credit shock the guide cannot fully avoid), and a passive path that decays faster.

## Measured in the first pass (sim, N = 8 per character, before deregistering)
guide in time 96 % (fintech 88 %), **blindTapper 96 %**, naive 67 % (33 % bankrupt), priceLow 63 %, priceHigh 50 % (new-loan PD × 1.90),
maxMismatch 63 %, runs: naive 33 % / smart 0 %. After moving opex to mostly fixed and letting the guide lend spare capital below the market, the
guide beats passive play by only ~5–10 months (riskChief 76–79 vs 80–92, familyBanker 64–68 vs 69–77, fintech 87–114 vs 84–109).

## Open design problem (next step)
Equity grows from the margin on the inherited book whatever the player does. Needed: capital that is actually binding (a lower starting
ratio and growth that consumes it), a deposit franchise that must be bought (marketing / branches), vintages whose quality depends on the cycle
at origination, and a passive default that decays (the inherited book runs off). Then re-run `--world-gates 36 w14` and register the world.
