# w12 · האימפריה

Mechanic id `holding` (uses light formulas of `season`, `plant`, `chain`, `projects`, `energy`, `portfolio`, `multinational`) · tier 9
unlock: ★ in w11 · minRules 6 · difficulty 5/5 · numbers TUNE.

## Story
> קבוצת חברות: מלונות, מפעלים, רשת, נדל"ן, אנרגיה ותיק השקעות. אתה כבר לא מנהל עסק, אתה מנהל את הקשרים בין עסקים.
> המשבר הבא לא יפיל את החברה הכי חלשה. הוא יפיל את מי שערב לה.

## Visual language
- Marble and bronze: sky `#f5f5f4 → #a8a29e`, marble board `#f3f0ea`, bronze edge `#78350f`, accent deep green `#166534` (ink `#14532d`).
- The centre is a HQ tower.
- Each division is a miniature of its home world's district (a callback to w5–w11: palms, stacks, storefronts, cranes, solar, glass tower, globe).
- **Guarantee cables** link a division to HQ. A ring-fenced division has a visible fence. Contagion animates along cables.
- 2D motif 👑🏛️.

## Money ranges
- Start: a holding with 5–6 divisions worth ₪1.2B gross, debt ₪600–700M, equity ₪500–700M, HQ cash ₪60M.
- Divisions ₪100–400M. Annual capital budget ₪50–200M.
- Goal NW **₪2B** (above today's `rr_finish` cap; the DB migration is mandatory before ranking, see DESIGN §4.6).
- `econ`: loanUnit ₪5M, ddMinFee ₪1M, bands deal [50M, 600M].

## Core mechanic: group structure, guarantees, contagion
**Divisions:** `{kind, light-model params, debt, structure:'ringfenced'|'guaranteed', health}`.

The light model is a 4–6-parameter monthly formula derived from the home module, so the player recognises each world's driver without its full UI:
- tourism: season curve
- industry: condition and utilisation
- retail: ramp/span reduced to a growth knob
- real estate: one project pipeline
- energy: PPA share
- finance: the portfolio factor mix
- multinational: one FX basket

```
division cf = light model × storm exposure
storms: multi-factor shocks (the w10 factor set) on X tiles and severe market cards; each division has fixed betas
debt service: ringfenced rate = base + 1.5 pp;  guaranteed = base
default: a division's cash < 0 for 2 consecutive paydays after HQ support is declined
  → ringfenced: the division is lost (its equity → 0, its debt leaves with it)
  → guaranteed: its debt moves to HQ (HQ loan) + group credit rating −1 → all guaranteed rates +0.5 pp (contagion)
annual allocation card (every 12 paydays, a fixed slot, not a tile): HQ cash split between divisions (growth +), dividend to
  the board (≥ 3% of equity or a board-pressure event), and a reserve
liquidity coverage = (HQ cash + undrawn lines) ÷ next 12 months' guaranteed debt service
```

**Decisions:**
- **Ring-fence vs guarantee** per division (`Z:structure`, a costly switch: 1% of division debt). Cheap money versus contagion.
- **Annual allocation** (one card, a slider set): grow winners, fix losers, dividend, reserve.
- **Support a failing division** (inject HQ cash) or **let it go**.
- **Buy/sell divisions** (deal cards with dd).
- **Group-level hedges** (the w10 put overlay on the storm factors).

## Mapping
| need | existing | new |
|---|---|---|
| storms and correlation | `mech/portfolio.js` factors | division betas |
| division drivers | each earlier module's light formula (exported `light(params, ctx)`) | — |
| dd on acquisitions | `dd.js` | pool `division` |
| regime | `cycle.js` (amp 1.2) | — |
| rivals bidding for divisions | `rivals.js` | — |
| **new** | — | `mech/holding.js` (divisions, structure, default/contagion, credit rating, annual allocation card, board pressure, liquidity coverage), goals `noDefault` + `liquidity` + `all`, indicators (group map with cables, coverage gauge, rating), cityModels |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `chair` | יו"ר הקבוצה, דור שני | 6 divisions, half of them guaranteed | rating A (cheaper debt) | old structure: a weak division (industry, health 40) is guaranteed |
| `activist` | משקיע אקטיביסט | 4 divisions bought cheaply, all ring-fenced, HQ cash ₪120M | discount on division sales and purchases | the board demands a 6% dividend (pressure events) |
| `thirdGen` | דור שלישי, צעירה | 5 divisions, HQ cash low (₪25M) | allocation cards give +10% (a fresh team) | low liquidity coverage at the start; must sell or restructure early |

## Assets and deals
- Division acquisitions of each kind.
- An insurance arm (a natural hedge to storms: pays in a storm, costs premiums).
- A shared-services centre (−3% costs all divisions, ₪60M).
- Group bonds (cheap long debt for HQ; covenants: coverage ≥ 1.2, else the rate +1 pp).
- Traps: a "trophy" division (high status, negative cf, guaranteed by default).

## Unique events
- A multi-country recession (storm: eq −, credit −, tourism −).
- An energy crisis (energy +, industry −).
- A rating-agency review.
- A succession dispute (board pressure; happiness −).
- A cyber attack on shared services.
- A government antitrust review (forced sale of one division at 85%).

## Risks
- Contagion through guarantees.
- Storms hitting correlated divisions.
- Over-paying dividends.
- Covenant breaches.
- A "too big to manage" span (attention from w11 applies at HQ: 3 slots).

## Recovery
- Ring-fence the sick division before it defaults (if affordable).
- Sell a healthy division to save the group.
- Cut the dividend (board pressure).
- Issue group bonds.
- Insurance payout.
- Bailout rule replaced by "restructuring": a one-time debt haircut with a loss of 2 stars' worth of months (the time cost).

## Lesson
"בקבוצה גדולה, הסיכון הגדול הוא לא העסק הכי גרוע. הוא החוטים שמחברים אותו לכל השאר. יציבות לאורך משברים שווה יותר מעוד אחוז צמיחה."

## Goal and stars
- Goal `all`: NW ≥ ₪2B + `noDefault` (24 months) + `liquidity` coverage ≥ 1.0, hold 3.
- Stars: ★ 84 · ★★ 70 · ★★★ 58, plus happiness and fund.

## Solo / online / competition
- Storm draws and division noise are shared (fixed: 1 per division slot × 8, plus 2 storm draws per payday).
- Safe = keep structure, default allocation (the reserve-heavy preset).
- Rank: months → min-part progress. NW here exceeds `int4`: **not rankable until the bigint migration**.

## Sim policies and gates
- `smart`: guarantee only divisions with health ≥ 70 and beta < 1; reserve ≥ 1.2 coverage; dividend at the minimum; sell the weakest guaranteed division in a storm.
- Ablations `guaranteeAll`, `ringFenceAll`, `maxDividend`, `neverSell`. Each must lose to smart by ≥ 5 pp.
- World gate: `guaranteeAll` defaults with contagion in ≥ 20% of games. `ringFenceAll` is slower by ≥ 6 median months.

## Size
XL. `mech/holding.js` ~900 lines plus `light()` exports in each earlier module (~60 lines each), data ~400, tests ~650.
Ship last, after every module it composes has passed its own gates.
