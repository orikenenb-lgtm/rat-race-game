# w7 · רשתות המסחר

Mechanic id `chain` · tier 6 (fork B) · unlock: ★ in w5 · minRules 6 · difficulty 3/5 · numbers TUNE.

## Story
> יש לך שלוש חנויות שמצליחות. כל יועץ אומר לך לפתוח עוד שלושים. כל סניף חדש בולע מלאי, שכירות ומנהל, ומרוויח רק אחרי חצי שנה.
> רשתות לא נופלות מהפסד. הן נופלות ממחסור במזומן.

## Visual language
- Shopping-street evening: sky `#2b2d42 → #ef8354`, warm paving board `#efe6dd`.
- Red/white awning accent `#e63946` (ink `#9b1c24`). Decor `storefronts`.
- Each branch is a storefront whose lights grow with ramp-up stage (4 stages).
- A regional manager appears as a small office tower connecting 6 storefronts with light lines. An over-span chain shows flickering signs.
- 2D motif 🛍️.

## Money ranges
- Start equity ₪8–15M.
- Branch capex ₪1.5–6M plus initial inventory ₪0.4–2M.
- A mature branch makes ₪60–250k/mo contribution. A regional manager costs ₪70k/mo. Warehouse/DC ₪12M.
- Goal NW **₪120M** + liquidity. `econ`: loanUnit ₪200k, ddMinFee ₪30k, bands deal [0.4M, 40M].

## Core mechanic: growth vs profitability
**Chain state:** `{branches:[{id, loc:'A'|'B'|'C', age, area, own:true|franchise}], managers, dc, stock, onOrder:[{qty, arrives}], supplierTerms}`.

```
sales_i  = base × locMult[loc] × ramp[age] × (1 − cannib(area)) × spanPenalty × cycle cfOther × stockFill
ramp     = 0.40, 0.55, 0.70, 0.82, 0.92, 1.00 (months 1–6)
cogs     = 62% − scaleDisc(n)        scaleDisc = min(8%, 1% per 5 branches) (central purchasing; with a DC another −2%)
span     = managers × 6 (+ 3 the owner can run, costs 🔋)
spanPenalty = 1 − 5% × max(0, branches − span)       (every branch suffers, not just the new one)
stockFill   = min(1, stock / needed)                 lost sales when short; overstock above 2.5 months → markdown −15% value
cash cycle  = inventory paid on order (lead time 2 months) − supplier credit (30/60 days by terms)
```
`locMult` A 1.25 / B 1.0 / C 0.65 is **sealed at the landing** (1 `world` draw). A location survey (dd, fee ₪30k) gives a 2-of-3 range.
`cannib`: a branch in an area with k others loses 6% × k.

**Decisions:**
- **Open a branch** (O-card per location): capex + inventory + 6 months of ramp losses. Speed versus cash.
- **Regional manager** (`Z:hire`): fixed cost that unlocks scale.
- **Inventory order** (`Z:order` qty, or an auto rule "N months of cover"): working capital versus stock-outs.
- **Own vs franchise** on an opening card:
  - Franchise: the franchisee pays capex; you get a 6% royalty and no inventory. Quality is not yours (sealed operator draw → rep events).
- **Close a branch** (sell the lease at 20–60%).
- **Supplier terms** (negotiation focus): 60 days of credit = free working capital, at a −1% price discount lost.

**Fixed draws:** per payday 1 (demand noise); per opening card 2 (location, franchisee quality); per inventory arrival 0.

## Mapping
| need | existing | new |
|---|---|---|
| inventory, lead time, dead stock, markdown | `business.js` `stock:'inventory'`, leadTime, `restockQty`, SEASON_PREP (holiday peaks reused) | chain-level aggregation |
| hidden location quality | `dd.js` | `location` pool |
| competitors next door | `rivals.js` | rival opens nearby → cannib +1 |
| managers and 🔋 | focus `ops`, energy layer | span rule |
| **new** | — | `mech/chain.js` (branches, ramp, span, cannibalisation, own/franchise, order book, chain P&L), goal `liquidity` (shared), indicators (cash runway, span gauge, stock cover), cityModels |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `founder` | שירה, מייסדת הרשת | 3 mature A/B branches, cash ₪5M | strong brand: ramp starts at 0.55 | no managers (span 3); cash tight |
| `cfo` | עמית, סמנכ"ל כספים לשעבר | cash ₪14M, no branches | sees the exact working-capital need; bank loan −0.3 pp; supplier 60 days at once | slow ramp (0.35); no brand |
| `franchisor` | גלעד, זכיין גדול | 8 franchised branches (royalties ₪160k/mo), cash ₪4M | steady passive income; franchise openings cost no capex | can't control quality; buying back a franchise costs 4× its annual contribution |

## Assets and deals
- Branch openings (mall, street, outlet, airport: high rent, A-only).
- A distribution centre (−2% COGS, ₪12M).
- An e-commerce platform (sales +8% chain-wide, fixed ₪120k/mo, a 9-month ramp).
- A competitor chain for sale (12 branches at once, mixed locations, a big span problem).
- Traps: an "anchor store in a new mall" (C hidden as A), a cheap lease with 5% annual rent escalation.

## Unique events
- Holiday season (SEASON_PREP reused: stock up 2 months ahead).
- A supplier price hike.
- A shipping delay (inventory arrives one month late).
- A viral product (stock-outs everywhere).
- Mall foot traffic collapses (C locations −30%).
- Minimum wage up (all branches' fixed +4%).
- A bank tightens credit (credit line cut 30% in a recession).

## Risks
- Overexpansion → the span penalty plus ramp losses plus working capital at once.
- Running out of cash while profitable on paper.
- Overstock before a recession.
- Bad franchisees damaging the brand.

## Recovery
- Pause openings; close the worst branch.
- Convert owned branches to franchises (cash in, royalty out).
- An inventory clearance sale (cash now, −25%).
- Supplier credit; a sale-and-leaseback of the DC.

## Lesson
"צמיחה אוכלת מזומן. כל סניף חדש צריך הון, מלאי, מנהל וזמן. רשת רווחית יכולה לפשוט רגל אם היא גדלה מהר יותר מהקופה שלה."

## Goal and stars
- Goal `all`: NW ≥ ₪120M **and** `liquidity` (cash + savings + undrawn line + liquid holdings) ≥ 4 months of chain fixed costs. Hold 3.
- Stars: ★ 72 · ★★ 58 · ★★★ 46, plus happiness and fund.

## Solo / online / competition
- Location and franchisee draws are at the landing (shared). Safe = `pass` on openings; no order change.
- Rank: months → min(NW/target, liq/target).

## Sim policies and gates
- `smart`: open while runway ≥ 6 months and branches < span + 2; survey every unflagged C-risk card; keep 1.5 months of stock cover.
- Ablations `openEveryBranch`, `neverExpand`, `franchiseAll`, `noManagers`. Each must lose to smart by ≥ 5 pp.
- World gate: `openEveryBranch` must have ≥ 15% bankruptcies **with positive accounting profit at the time** (the lesson in data).

## Size
L. `mech/chain.js` ~800 lines, data ~300, tests ~450.

## As built (rules 6 — engine lane, wave 3)

Shipped in `js/worlds/mech/chain.js` / `js/worlds/w7.js` / `tools/policies/chain.mjs`; replaces the TUNE values above where they differ.

| item | as built |
|---|---|
| draws (`world`) | 1 per payday (demand noise; its low digits pick a bad franchisee's incident), 2 per `R` landing (site kind + sealed location; survey pair + franchisee quality), 0 at init |
| board | 6 × `R` "מיקום לסניף" (module tile, safe = `pass`) + 10 × `O`; 5 known-location branch cards on the `O` deck (the engine's due diligence prices them) |
| sites (`w7.sites`) | street ×4 (one with 5 %/yr rent escalation), mall, outlet (counter-cyclical), airport (always A), "anchor store in a new mall" (C 60 %); capex ₪1.8–6M, down 50 %, equipment loan 0.6 %/mo |
| sales | base × loc (A 1.25 / B 1 / C 0.65) × ramp × (1 − 6 % × neighbours, max 30 %; 10 areas) × span × cycle (exp 1.10 / slow 1 / rec 0.86 / recov 0.96; outlet 0.97/1/1.06/1) × demand (0.86–1.14) × season × brand (0.85 + 0.3 × brand/100) × shocks |
| fit-out + ramp | 2 months of rent and half the wages before opening; ramp 0.40 → 1.00 over 6 months (founder starts one step later, CFO 0.35 → 1.00) |
| purchasing | COGS 62 % − 1 % per 5 own branches (max 8 %) − 2 % with a DC; 60-day terms +1 % (free for the CFO) |
| span | managers × 6 + 3 (the owner, −1 🔋/mo); −5 % sales per branch over the span, floor 50 %, brand −0.5 per over branch a month; manager ₪120k hire + ₪70k/mo |
| stock | one pool (asset "המלאי של הרשת": value = stock + in transit, debt = supplier invoices); order-up-to (2 + cover) × the next months' need at every payday; lead 2 months (+1 on a shipping delay); invoices after 30/60 days; markdown 15 % of stock above max(2.5, cover + 1) months; clearance −25 % |
| inventory cash | payday cash += cost of goods sold − invoices paid (the profit already counted the goods) |
| franchise | 6 % royalty (franchisor 8 %), entry fee 15 % of capex to you, quality 0.6–1.15 (sealed); bad (< 0.35) → incidents (brand −6) that reveal the culprit; franchise system ₪1.5M (franchisor has it); buy back 4 × annual royalty; convert own → franchise at 70 % of value |
| value | own: 12 × mature normal month × multiple (exp 4.6 / slow 4.2 / rec 3.6 / recov 4.0) × (0.5 + 0.5 × ramp), floor 25 % of capex; franchise 12 × royalty × 4.5 |
| insolvency | bank debt beyond the voluntary loan cap by > 1 month of the chain's fixed costs → suppliers hold the next order; 3 such paydays in a row → bankrupt (whatever the branches are worth on paper) |
| goal | `all`: `nw` ≥ ₪120M **and** `liquidity` (cash + savings + liquid holdings) ≥ 4 months of fixed costs (rent + wages + managers + DC + e-commerce), hold 3 |
| characters | shopFounder (id renamed: `founder` is w4's) 3 trading shops + stock + pipeline, cash ₪3M, brand 75, ★ 66 / 54 / 47 · cfo cash ₪14M, 60-day terms, loans −0.3 pp/mo (rebate), ★ 72 / 56 / 46 · franchisor 8 franchises, cash ₪2.5M, 8 % royalty, ★ 80 / 74 / 64 |
| Z actions | `cover` (0.5/1/1.5/2/3) · `hire` · `fire` · `terms` (30/60) · `close` · `convert` · `buyBack` · `clearance` · `franSys` · `dcLeaseback` |

Balance (tools/balance-data/gates-w7.json, N = 36 per character): guide 68 % (worst franchisor 64 %), blind 0 %, smart 69 % vs naive 0 %
(bankrupt 100 %), every character ≥ 64 %, durable 100 %, median won rolls 89 (won months smart 65, guide 63). Ablations: openEveryBranch 38 %
(−31 pp, **bankrupt 52 %** — growth eats cash), neverExpand 26 % (−43), franchiseAll 45 % (−23), noManagers 1 % (−68); maxDebt 46 % (bankrupt
39 %). Open: G-dom A4 — the founder archetype (survey, then open with ≥ 2 months of fixed costs left) is best in 4/4 cells (79 % vs smart
69 %): bolder-but-surveyed growth beats the 4-month cushion rule. (A pass that loosened the guide to 3 months made smart worse, 65 %.)
