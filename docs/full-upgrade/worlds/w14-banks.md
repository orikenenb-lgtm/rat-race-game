# w14 · רובע הבנקים — DRAFT (engine lane, wave A3; not registered, not playable)

Status: `js/worlds/mech/credit.js` (module `credit`, ~250 lines), `js/worlds/w14.js` (world data) and `tools/policies/credit.mjs` exist, but
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
