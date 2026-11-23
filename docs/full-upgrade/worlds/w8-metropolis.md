# w8 · מטרופולין הנדל"ן

Mechanic id `projects` · tier 6 (fork C) · unlock: ★ in w5 · minRules 6 · difficulty 4/5 · numbers TUNE.

## Story
> העיר צומחת לגובה. קרקע, ועדות, מנופים. כל פרויקט הוא התחייבות של שנים, והכסף יוצא הרבה לפני שהוא חוזר.
> הבנק ייתן הלוואת בנייה רק אחרי שתשים הון עצמי ותמכור מספיק דירות על הנייר.

## Visual language
- Construction dawn: sky `#fde68a → #93c5fd`, concrete board `#e5e7eb`, crane-yellow accent `#eab308` (ink `#854d0e`).
- Decor `cranes` (reuse `assets/w3/crane.glb`).
- Each project is a **tower that grows by stage**: fenced lot → foundations → floors (by % complete) → glass → lights on.
- A delayed project shows a red tarp and a stopped crane.
- 2D motif 🏗️ with a progress bar.

## Money ranges
- Start equity ₪20–40M.
- Projects ₪60–400M total cost: land 20–35%, construction 55–70%, soft costs 10%.
- Equity required 20–30% before any loan draw. Construction loans ~0.55%/mo + rate (w2 deck) and interest is capitalised.
- Sale margins 12–25% on cost when on time.
- Goal NW **₪250M**. `econ`: loanUnit ₪1M, ddMinFee ₪150k, bands deal [10M, 400M].

## Core mechanic: staged development
**Project lifecycle:**
`land → permit (sealed months) → build (N stages) → complete → sell remaining | hold for rent`

```
at the landing (fixed 4 world draws): permitDelay 2–14 mo, buildOverrun 0–25 %, buildDelay 0–6 mo, contractorFail (p by tier)
equity call at each stage start until equity ≥ eqReq; then the loan draws the stage cost
loan draws only while presales ≥ presaleReq (e.g. 30% of units); otherwise the stage waits (interest still runs)
presale price = list × (0.85 + 0.1 × stage/N) × demand(rate, cycle)          (sell early = cheaper + unlocks the loan)
capitalised interest = loanBalance × (pct + rate)/12 per month, added to cost
completion: unsold units sell at list × demand (or `hold` → rental asset, w2-style noi)
goalValue: WIP at cost-to-date (land + paid stages − debt); completed/held at market − debt
```

**Decisions:**
- **Which land** (permit risk; dd "בדיקת תב"ע" narrows the permit range).
- **Contractor tier** (cheap: overrun and default risk; reliable: +8% cost).
- **Presale pace** (`Z:presale %`): cash and loan release now versus the upside at completion.
- **Phasing** (start the next project before the first completes: overlap equity calls).
- **Hold vs sell at completion** (rent income versus recycled equity).
- **Combination deal** (קומבינציה, the landowner character): give 30–40% of the units to a developer instead of paying for construction.
- **Rate exposure** (B tiles: the w2 rate deck): a higher rate means costlier loans **and** slower presales.

## Mapping
| need | existing | new |
|---|---|---|
| rate path | w2 `rate` mechanic (B tiles, `setRate`) as a module dependency | rate read by projects |
| hidden permit / contractor risk | `dd.js` pools `permit`, `contractor` | range reveal |
| others bid for land / buy distressed projects | `rivals.js` | a rival buys your stalled project at 60–70% |
| boom/bust prices | `cycle.js` `grow` + dealCost | demand factor |
| **new** | — | `mech/projects.js` (lifecycle, staged equity and loan draws, presale threshold, capitalised interest, sealed delays, hold → rental conversion, goalValue), indicators (Gantt strip per project, equity-call calendar, presale %, runway), cityModels with stages. **Reused by w9.** |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `developer` | רחל, יזמית ותיקה | a 90-unit tower at stage 3/6 (cost ₪150M, loan ₪70M), cash ₪12M | permits −25% months; presale price +3% | heavy existing debt; the next equity call comes soon |
| `landowner` | משפחת חורי, בעלי קרקעות | 3 plots (value ₪60M, no debt), cash ₪4M | no land cost; combination deals | almost no liquidity; selling a plot fast = −20% |
| `contractor` | אלון, קבלן ביצוע | cash ₪18M | builds at cost −10%; overrun range halved | permits +25% months; no sales team (presale price −3%) |

## Assets and deals
- Residential towers (60–150 units).
- Urban renewal (pinui-binui: cheap land, permits 8–20 months).
- An office building (presales impossible, so it is loan-heavy; then rental).
- A logistics centre (fast build, rental).
- Mixed-use.
- Distressed projects (a stalled tower at 60% of cost: overrun already known).
- A land bank plot (no permit yet).
- Golden: a plot with an approved plan.

## Unique events
- The planning committee freezes approvals (permit +3 months for all).
- A steel price spike (open stages +8%).
- A crane accident (one project stopped 1 month).
- A rate shock (w2 deck).
- A wave of foreign buyers (presale +10%).
- The contractor goes bankrupt (if the cheap contractor; replace at +15%, 2 months).
- A government housing lottery ("מחיר מטרה" style: list prices −7% for 6 months).
- A strike at the concrete plant.

## Risks
- Running out of equity mid-build.
- Delays × capitalised interest.
- Overlapping projects' equity calls in a downturn.
- Presales locked at low prices before a boom (the opposite risk).
- A rate shock on both cost and demand at once (correlated).

## Recovery
- Bring in an equity partner (give 40% of profit).
- Sell the project to a rival at 60–70%.
- Pause a stage (interest continues, no new draws).
- Mezzanine loan (expensive, +1.5 pp).
- Convert unsold units to rentals.
- Sell a plot from the land bank.

## Lesson
"בפרויקט ארוך הכסף נגמר לפני שהבניין נגמר. הון עצמי בצד, מכירות מוקדמות ותזמון שלבים הם ההבדל בין יזם לפושט רגל.
ושווי על הנייר של בניין שלא נגמר הוא לא שווי."

## Goal and stars
- Goal NW ≥ ₪250M with `goalValue` (WIP at cost), hold 2.
- Stars: ★ 80 · ★★ 64 · ★★★ 52, plus happiness and fund.

## Solo / online / competition
- All 4 project draws happen at the landing (shared, decision-independent). Safe = `pass` / no presale change.
- Rank: months → NW/target. Sealed fields (`delay`, `overrun`, `fail`) are redacted in rooms.

## Sim policies and gates
- `smart`: presale to the threshold + 10%; reliable contractor when equity < 1.5× the next call; ≤ 2 overlapping projects; dd on permits.
- Ablations `noPresale`, `presaleAll`, `cheapContractorAlways`, `maxOverlap`. Each must lose to smart by ≥ 5 pp.
- World gate: ≥ 50% of smart losses come from a liquidity squeeze, not from a single draw.

## Size
XL (the module is shared with w9). `mech/projects.js` ~1,000 lines, data ~350, tests ~600.
