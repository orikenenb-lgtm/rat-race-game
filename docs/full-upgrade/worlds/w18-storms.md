# w18 · חוף הסערות

New module `insure` (`js/worlds/mech/insure.js`, `uses: ['portfolio', 'season']`) · tier 9 · unlock: ★ in one of w14 / w16 · minRules 7 ·
difficulty 4/5 · numbers TUNE. Spec: CATALOG-25 §1.4 (w18 card), §2.2, §2.4, §6.3 (`W18-price`, `W18-cat`). This file is the **as built**
record (engine lane, wave A4).

## Story
> הלקוחות משלמים היום. הסערה מגיעה מתי שהיא רוצה. מי שגבה מעט מדי בקיץ יגלה את זה בחורף.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/mech/insure.js` | module `insure` (tile `Z` תיק פוליסות למכירה), all state in `st.world.ins` | 238 lines (catalog sketch ~700; kept lean) |
| `js/worlds/w18.js` | world data, characters, decks, `lessonDefs` | 134 lines |
| `tools/policies/insure.mjs` | sim plug-in + `W18-price`, `W18-cat` | 81 lines |
| `tests/w18.test.mjs` | 13 tests | — |

`tools/sim.mjs`: `insure` in the plug-in list; `modForced` = paydays under the solvency floor, `modStat` = 1 / 0 / null (insolvent ever / not /
no storm). No content pool (legacy decks; market and crisis cards carry `mk` keys the module applies). No new validator check: the world has no
named companies (lines and books are generic), so there is nothing for a denylist to match.

### The catalog's composition, as built
- `insure` (new): five lines, price vs the market, adverse selection, reserves with a sealed adequacy, reinsurance, solvency, the regulator.
- `portfolio` (float): **re-implemented** — two liquidity classes (liquid 0.3 % a month; risky 0.6 % ± 5 %, a −18 % crash on 2.5 % of paydays),
  a target risky share (10 / 30 / 50 %) rebalanced 20 % a month, and a forced sale of the risky class at a 4 % haircut when claims exceed the
  liquid class. `portfolio` itself margins a loan against holdings and lists equities on the `exch` stream, which this world does not need.
- `season` (storm season): **re-implemented** as the calendar months August–October (`ctx.calOf`); `season` is hotel-specific (w5).

### Fixed draws (stream `world`)
init **6** (the reserve adequacy · one loss-ratio quality per line) · payday **8** (one claims draw per line · the storm · the float · an
event target for the fraud crisis) · `Z` landing **3** (line · quality + jitter · size + price).

### Economy (TUNE)
- **Lines** (market loss ratio · long-tail share · storm weight): car 0.66 · 45 % · 0.05 — coastal homes 0.39 · 10 % · 0.6 — inland homes
  0.53 · 10 % · 0.2 — health 0.73 · 20 % · 0 — business interruption 0.47 · 50 % · 0.3. Expenses 20 % of gross premium + ₪1M a month.
  A sealed quality 0.92–1.08 per line multiplies the loss ratio; the shown loss ratio blends from the market's into the truth over the first
  12 months (the actuary sees the truth).
- **Price** per line −10 … +15 % vs the market (6 steps). Exposure moves 15 % a month toward demand × (1 − 3 × price) (0.3–1.6); the
  market grows 0.5 % a month. **Adverse selection:** claims per policy × (1 + 0.6 × price) above the market, × (1 + 1.2 × |price|) below;
  the risk mix follows at the renewal speed. Reserves booked while the book is under-priced are short by 2 × the under-priced share.
- **Inherited book:** car and coastal homes 15 % under the market, inland homes and health 10 %; no storm reinsurance; the reserves short by
  12 pp on top of the sealed adequacy 0.94–1.14. Doing nothing loses (blindTapper 0 %).
- **Reserves:** the long-tail share of claims is booked; the true cost (× adequacy) runs off over 24 months; the difference is the reserve
  development (in the result and the combined ratio).
- **Storms:** in each storm month 20 % odds; severity 0.3–1.5 × the storm base (Σ weight × annual exposure); the risky float −6 % the same
  payday; reinsurance hardens × 1.6 for 12 months. Floods (crisis card) hit inland + BI outside the season and are not covered by XoL.
- **Reinsurance:** XoL layers 1–3 (retention 0.4, each 0.4 × the storm base; rates on line 51 / 29 / 6.5 % a year ≈ 1.15 × the expected
  layer loss) · quota share 30 % (22 % ceding commission) · cat bond (3 years, a fixed 20 % rate on one layer, paid up front).
- **Solvency** = equity ÷ (15 % of net premium + 10 % of reserves + 50 % of the net storm loss at severity 1.4 + 10 % of the risky float),
  × 1.15 for 24 months after the regulator's capital-rule card. < 1: the regulator (12 paydays: no dividend, demand × 0.7; < 0.8 also a forced
  quota share; `lastEvent:regulator`). Equity ≤ 0: bankrupt.
- **Capital:** raise 20 % of equity once per 6 paydays at a 15 % discount (dilutes your stake; the mutual raises at par); dividend 25 % of
  the last 12 months' profit once a year (not the mutual; not under the regulator).
- **Tile Z (תיק פוליסות למכירה):** a book of 8–20 % of the current premium on one line at 12 % × 0.9–1.2 of its annual premium, paid from
  the insurer; its sealed quality 0.85–1.2 blends into the line; due diligence (₪1.5M from the insurer) narrows ±12 % to ±3 %.
- **Characters:** actuary (equity ₪400M, premium ₪0.9B, sees the true loss ratios) · topBroker (₪440M, ₪0.9B, coast-heavy mix, × 1.4
  demand, premium × 0.95) · mutualChair (₪500M, ₪1.1B, no dividends, raises at par, price changes take effect a payday later).

### Goal
`all` hold 3: `nw` ≥ ₪1.2B (your stake × the insurer's equity + personal cash) · `modValue solvency` ≥ 1.2 · `modValue combined12`
`cmp: 'le'` 1.00. maxMonths 84 (★★ 72, ★★★ 60).

### The guide (panel `suggested`)
Each line's price maximises the expected yearly underwriting result per unit of exposure at the shown loss ratio, minus the capital it ties
up (λ 0.35 under solvency 1.35, else 0.06); XoL layers so that the biggest storm costs ≤ 60 % of equity; quota share under 1.15 (off over
1.7); risky float `low` before / in the season (July–September) or under 1.3, else `mid`; a cat bond while reinsurance is hard; raise
under 1.05; run-off a line only when even +15 % cannot make it pay.

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w18`, 210 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper | 68% | 86% | 64 | 0% |
| blindTapper | 0% | 0% | — | 96% |
| naive | 0% | 2% | 106 | 92% |
| smart | 66% | 86% | 64 | 0% |
| saver | 3% | 33% | 104 | 0% |
| founder | 12% | 19% | 70 | 28% |
| diversified | 63% | 85% | 66 | 0% |
| gambler | 45% | 60% | 65 | 6% |
| f:frugal / f:none | 67 / 66% | 86% | 64 | 0% |
| maxDebt | 66% | 86% | 64 | 0% |
| underprice | 0% | 0% | — | 90% |
| noReinsurance | 63% | 80% | 63 | 0% |
| maxReinsurance | 8% | 43% | 103 | 0% |
| coastHeavy | 36% | 62% | 76 | 6% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 68 % · worst 61 % (actuary 64, topBroker 61, mutualChair 78) |
| G-blind | met | 0 % |
| G-smart | met | smart 66 % med 64 · naive 0 % med 106 |
| G-reach | met | 64 / 56 / 78 % |
| G-loss | met | naive 100 % (bankrupt 92 %) · maxDebt 34 % · smart loses 34 % |
| G-dom | **NOT met** | A4: diversified best in 100 % of 3 cells · ablations maxReinsurance 8 % (Δ 57 pp), coastHeavy 36 % (Δ 30 pp) |
| G-frugal | met | 67 vs 66 % |
| G-durable | **NOT met** | 151 / 186 = 81 % (a storm year after the win pushes the 12-month combined ratio over 100 %) |
| G-time | met | median 90 rolls (p10 52, p90 156) |
| W18-price | met | underprice 0 % · the regulator steps in in 100 % of underprice games (smart 40 %) |
| W18-cat | met | noReinsurance insolvent or bankrupt in 53 % of 103 storm games (smart 42 %) |
Open: G-dom (only 3 cells have ≥ 8 saver games; `diversified` = smart's module play with the generic archetype's deal choices wins them) and
G-durable. Noted: `noReinsurance` is only 3 pp behind smart in time (63 vs 66 %) though more often insolvent — the XoL rates (1.15 × the
expected loss) leave the guide's reinsurance roughly at cost; W18-cat holds. Tuning history (the first passes were blind 41 → 25 → 17 %):
expenses 25 → 22 → 20 %, the inherited mispricing (−5 → −15 %) and short reserves (+12 pp), adverse selection below the market 0.3 → 1.2,
storms from rare and large (10 % a storm month, severity 0.5–2.5) to frequent and smaller (20 %, 0.3–1.5) so that a calm 5 years is rare,
market growth 0.8 → 0.5 % a month (the book outgrew its capital), XoL repriced to the new storm law, the guide's tail cap 35 → 60 % of equity.

### Registration
`LAZY_IDS` + `js/worlds/all.js` + meta (tier 9 ← 1 of w14 / w16, status lazy, playable) + SQL draft row (`20261125_worlds.sql`, unranked,
never applied) + sim plug-in list + re-pin: core +7 chars (885,674 / 900,000) and pack `w18` = w18.js + mech/insure.js. Lessons (with the
pack): `correlated_tail` (הזנב המתואם), `combined_ratio` (יחס משולב) — need lessons-meta entries (UI lane; t4_meta T-M2 until then).
