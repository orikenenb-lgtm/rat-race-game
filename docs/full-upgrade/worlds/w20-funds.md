# w20 · רחוב הקרנות

- Rule adapter: `funds` (`js/worlds/adapters/funds.js`, `uses: ['market', 'portfolio']`)
- Tier 10. Unlock: ★ in one of w18 / w19.
- minRules 7. Difficulty 5/5. All numbers are TUNE.
- Spec: CATALOG-25 §1.4 (w20 card), §2.2, §6.3 (`W20-flow`, `W20-short`).
- This file is the **as built** record (engine lane, wave A5).

## Story
> הכסף לא שלך. הלקוחות נשארים כשמרוויחים, ובורחים בדיוק בתחתית, כשאתה הכי צריך אותם.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/funds.js` | rule adapter `funds` (tile `W` משקיע חדש); all state in `st.world.funds` | 217 lines (V-adapter ≤ 350) |
| `js/worlds/w20.js` | world data, characters, decks, `lessonDefs` | 131 lines |
| `tools/policies/funds.mjs` | sim plug-in + `W20-flow`, `W20-short` | 91 lines |
| `tests/w20.test.mjs` | 13 tests | — |

Changes in `tools/sim.mjs`:
- `funds` is in the plug-in list.
- `modForced` = outflow spirals: money under management below ½ of its peak.
- `modStat` = bit 1 if the game was won in time, or money under management was ≥ the goal at the month limit; bit 2 if a squeeze on its short made a month of −15 % or worse.

No validator check was added. The 12 companies are entries of the `market` pool (`js/worlds/data/companies.js`), which M-fict already checks. The pack carries that data file: w20.js + adapters/funds.js + data/companies.js.

### The catalog's composition, as built
- **`market`:** re-implemented in the adapter. The real module draws 69 a payday on `exch`, and its holdings are bought with cash. Here, 12 fixed companies from the pool each have:
  - a beta from the pool's range;
  - a **sealed** monthly alpha of −1.3…+1.3 %;
  - a public research band: alpha ± σ, with σ 0.3 % for the quant and 0.8 % for the others;
  - a public short interest ("crowding") that leans toward the weak names.
- **Regimes:** bull / normal / bear / crash (one draw a payday). A crash lasts one or two months, then a bear market follows.
- **Company returns:** each month, beta × the market + alpha + noise. **The index is the 12 companies equally weighted**, so a book of 1/12 each returns exactly the index.
- **`portfolio.flows`:** client money flows by four things:
  - the trailing 12-month return vs the index (× 0.06);
  - the regime (bull +0.2 %, normal 0, bear −0.6 %, crash −2 % a month);
  - a 3-month drawdown worse than −8 % (−2 %);
  - noise.

  The result is scaled by the character's reaction (1.5 / 2 / 1) and capped at −15…+6 % a month. Inflows are also scaled by reputation.
- **Redemptions** are a **notice**: they are paid next payday by selling into the market. The cost is paid × the regime's liquidity cost (2 / 3 / 6 / 15 %) × gross exposure (at least 0.2), and it falls on everyone who stays.
- **The gate:** caps payments at 10 % of the fund for 3 paydays. It costs reputation −0.15, and ★★★ requires no gate (`starGates`).
- **`portfolio.short`:** a borrow fee of 1 % + 15 % × crowding² a year. In a crash, a ban force-covers every short and refuses new ones.
- **Squeeze:** 5 % a payday, on the most crowded name when its crowding is ≥ 0.55. The name jumps +30…+80 %, and its crowding halves.
- **Fraud:** 3 % a payday, on one name: −50 %, and its alpha becomes −1.5 %.
- **No margin:** longs ≤ 100 % of the fund, shorts ≤ 50 %, 30 % per company, in 5 % steps on the grid.

### Fees and personal net worth
- **Management fee:** 1.5 % a year on the clients' money.
- **Performance fee:** 20 % of the return **above the index**, past the high-water mark of the fund-to-index ratio. Hugging the benchmark therefore earns only the management fee.
- **The index product** (once, ₪5M): starts at 5 % of the clients' money, earns the index + 0.5 % a month (−0.5 % in bear or crash), and pays a 0.3 % fee.
- **Fees** are paid to your cash every payday.
- **Your own money** sits in the fund (the asset "החלק שלך בקרן"). `seed` / `draw` move ₪10M in or out.
- **Net worth** = cash + your money in the fund.

### Fixed draws (stream `world`)
- **init: 26** — 2 per company (alpha + beta; research noise + crowding), the regime, and the anchor client's month.
- **payday: 16** — the regime, the market noise, one per company, the client flows, and an event target.
- **`W` landing: 3** — size and research label, the fee share, and the sealed patience.

### Tile W (משקיע חדש)
- **The offer:** a mandate of 5–15 % of the fund, at 60–100 % of your fees.
- **The visible hint:** a label (pension fund / family office / fund of funds) leans toward the sealed patience, but is noisy.
- **Options:**
  - **take:** hot money may leave after a 3-month drawdown worse than −5 %;
  - **lock:** 80 % of that fee share, and it cannot leave for 12 months;
  - **pass:** safe.

### Characters
| character | money under management | your money | research σ | client reaction | notes |
|---|---|---|---|---|---|
| quantAnalyst | ₪0.9B | ₪80M | 0.3 % | 1.5 | reputation 0.9 |
| starPicker | ₪1.45B | ₪150M | 0.8 % | 2 | reputation 1.15 |
| endowmentPm | ₪1.95B | ₪50M | 0.8 % | 1 | an anchor client holds 40 % and redeems 30 % of it at a sealed month (6–54) |

The inherited book of every character hugs the index.

### Goal
- `all`, hold 3: `nw` ≥ ₪800M **and** `modValue aum` ≥ ₪4B. AUM is the fund plus the index product.
- maxMonths 84 (★★ 72, ★★★ 62). ★★★ also needs no gate.

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w20`, 354 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper / smart | 92% | 100% | 55 | 0% |
| blindTapper | 5% | 21% | 108 | 0% |
| naive | 4% | 9% | 97 | 0% |
| saver | 3% | 9% | 95 | 0% |
| founder | 44% | 72% | 75 | 0% |
| diversified | 64% | 98% | 75 | 0% |
| gambler | 36% | 85% | 93 | 0% |
| f:frugal / f:none / maxDebt | 92% | 100% | 55 | 0% |
| benchmarkHug | 11% | 41% | 100 | 0% |
| maxActive | 69% | 91% | 68 | 0% |
| shortHeavy | 43% | 89% | 85 | 0% |
| gateEarly | 91% | 100% | 60 | 0% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 92 % · worst 89 % (quantAnalyst 92, starPicker 89, endowmentPm 94) |
| G-blind | met | 5 % |
| G-smart | met | smart 92 % med 55 · naive 4 % med 97 |
| G-reach | met | 92 / 89 / 94 % |
| G-loss | met | naive 96 % out of time · maxDebt 8 % · smart loses 8 % |
| G-dom | **NOT met** | A4: diversified best in 83 % of 6 cells · ablation gateEarly 91 % (Δ 1 pp) |
| G-frugal | met | 92 vs 92 % |
| G-durable | met | 216 / 216 = 100 % |
| G-time | met | median 79 rolls (p10 51, p90 117) |
| W20-flow | **NOT met** | benchmarkHug misses AUM at the limit in 45 % (needs ≥ 60 %) · maxActive spiral 31 % (met) |
| W20-short | met | shortHeavy squeeze blow-ups 57 % |

**Open gates:**
- **G-dom.** `diversified` is smart's module play with the generic archetype's deal choices. The gate ablation costs only reputation and ★★★, not time.
- **W20-flow, AUM part.** Hugging still grows with the market over 84 months, plus own money and the index product.

**Tuning history:**
1. The first pass had the index drift away from a hugging book (the market factor vs the 12 names). The index became their equal-weighted mean, and market cards move it too.
2. A 5 % step that did not land on the grid made the guide oscillate. Steps now snap to the grid.
3. maxMonths went from 72 to 84 (the binding part is personal net worth, from fees). The quant's fund went from ₪0.74B to ₪0.9B.
4. W20-flow got two attempts, both on the AUM part: the index product's inflow went from 1.2 % to 0.5 %, then the base flows went from bull 0.4 % / normal 0.1 % to 0.2 % / 0. It moved from 39 to 42 to 45 %. Stopped there.

**Deviation:** the catalog's "squeeze-bankrupt" is measured as a squeeze month of −15 % or worse on the fund, because a fund cannot go bankrupt here.

### Registration
- `LAZY_IDS` + `js/worlds/all.js`.
- meta: tier 10 ← 1 of w18 / w19; status lazy; playable; diff 5.
- SQL draft row: unranked, never applied.
- Sim plug-in list.
- Re-pin:
  - core: +7 chars (885,688 / 900,000);
  - pack `w20` = w20.js + adapters/funds.js + data/companies.js (45,226 chars).
- Lessons (with the pack): `other_money` (כסף של אחרים), `short_squeeze` (שורט וסחיטה). They need lessons-meta entries (UI lane; t4_meta T-M2 until then).
