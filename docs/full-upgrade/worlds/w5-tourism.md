# w5 · עיר התיירות ("מפרץ השמש") — first new world, end to end

Mechanic id `season` · tier 5 · unlock: ★ in w4 · minRules 6 · difficulty 2/5 · all numbers TUNE.

## Story (opening card)
> יצאת מהמירוץ. עכשיו המשחק גדול יותר: עיר חוף בדרום שחיה מעונות. בפסח ובקיץ אין חדר פנוי, ובנובמבר הטיילת ריקה.
> מלון לא נסגר בחורף: המשכורות, החשמל והריבית ממשיכים. המטרה: הכנסה שנתית יציבה מהנכסים, לא חודש קיץ מוצלח.

The city is fictional (a Red Sea resort town). Real features such as the VAT exemption of a free-trade zone are not used unless they are verified and
labelled; the game uses its own simplified rules (BRIEF §11 "separate game rules from real facts").

## Visual language (render-side, `WORLD_STYLE.w5`)
- Golden-hour beach. Sky `#ffd6a5 → #48cae4`, sand board `#f3e2c0`, turquoise sea plane, palm decor (`decor:'palms'`).
- Accent coral `#ff7a59`, ink `#9a3412`.
- A **season ribbon** around the board centre shows the 12 months tinted by demand.
- Buildings dim their windows in low season, so occupancy is visible in 3D and in 2D (window-pip count = occupancy decile).
- 2D motif 🌴. Must keep ΔE ≥ 10 from w3's sand board (vocab test).

## Money ranges
| item | range |
|---|---|
| start equity (cash + equity in starting assets) | ₪3–6.5M |
| personal expenses | ₪45–70k/mo (life, doodads `doodadWealth`, chains: unchanged systems) |
| management salary | ₪0–45k/mo (active income, never counts toward the goal) |
| assets | ₪1.5M (dive centre) – ₪60M (resort); down 25–35%; hotel loans ~0.5–0.6%/mo + cycle |
| asset monthly cf at season mult 1.0 | ₪20k – ₪900k; off-season months can be negative |
| goal | 12-month average owner income ≥ **₪300k/mo** (≈ ₪3.6M/yr) |
| `econ` | loanUnit ₪100k, autoUnit ₪50k, ddMinFee ₪15k, tipDoodad ₪1.5M, bands deal [1.5M, 60M] |

## Core mechanic: seasons, capacity pricing, allotments
**State:**
- `st.world.cal` (month of year; the game starts in **October**, with winter ahead).
- `st.world.tour` (city demand index, starts 1.0, range [0.6, 1.3], mean-reverting).
- `st.world.pas12` (ring of 12 goal-passive values).
- Each op-asset: `{rooms|seats, profile, adr, base, fixed, varPct, tier:{peak, off}, staff:'core'|'seasonal', rep}`.

**Season profiles** (demand multiplier by month, Jan→Dec):
- `beach`: .55 .60 .80 1.05 .90 1.15 1.35 1.40 1.05 1.00 .70 .75
- `winterSun` (desert spa, conferences): 1.20 1.25 1.10 .90 .80 .60 .50 .50 .80 1.00 1.15 1.20
- `flat`: ≈1.0
- `waterpark`: beach curve, but 0 revenue Nov–Feb with fixed costs ×0.4

**Monthly op-asset cash flow:**
```
occ   = min(0.98, base × season[cal] × tour × tierDemand[tier] × repFactor(rep))
rev   = units × 30 × occ × adr × tierPrice[tier]      (seats: covers/month)
cf    = rev × (1 − varPct) − fixed × staffFixed[staff, isPeak] − debt × rate − allotmentAdj
tierPrice  = {budget .80, standard 1, premium 1.25}
tierDemand = {budget 1.25, standard 1, premium .75}   (premium × .6 if rep < 60)
repFactor  = .85 + .3 × rep/100
staffFixed = {core: 1, seasonal: peak 1.05 / off .80}
rep moves: seasonal −4 per off month, core +1; premium with rep < 60 → −2
```
The cap at 0.98 is the point. **In peak months a hotel is capacity-bound, so raising the price is pure gain. Off-peak it is demand-bound,
so cutting the price fills rooms that would otherwise only cost fixed money.** A flat "standard" plan leaves both on the table.

**Decisions:**
1. **Season price plan** (`Z:pricePlan {assetId, peak, off}`).
   - Peak = the months where the profile ≥ 1.0.
   - A standing rule, not a monthly click (no grind).
   - Default standard/standard. The guide (beginner level) suggests premium/budget only when rep ≥ 60.
2. **Staffing** (`Z:staff {assetId, core|seasonal}`): cheaper winters versus reputation that compounds.
3. **Allotment tile `N` ("מפעיל תיירות")**, 4 per board.
   - An operator offers to pre-buy 30–60% of an asset's rooms for the next 6 months at **−22% ADR** (as built; spec −25%), paying 50% now.
   - Overlap 0.4: part of the operator's guests would have come anyway, so walk-in demand shrinks by 0.4 × the allotted share.
   - Shown: a **booking-pace forecast** of `tour` for the next 6 months (noisy). The research focus or the hotelier character narrows it.
   - Options:
     - `accept`: cash now. Allotted rooms ignore `tour` and season up to their share.
     - `counter`: the negotiation mechanism, **−12% instead of −22%** (as built). Chance 50% (+25 pp for the promoter). May fail, and the offer goes to a rival.
     - `decline` (safe).
   - Landing draws: 2 from `world` (operator share, counter outcome), consumed whatever the choice.
4. **Seasonal credit line** (bank 'B' tile option + `Z:line`):
   - Up to 2 months of fixed costs at loan pct −1 pp.
   - Must be zero at the August payday, or it converts into a regular loan + 1 pp penalty.
   - Teaches seasonal working capital versus the forced loan.
5. **Festival** (promoter character only, `Z:festival`):
   - Costs ₪300k (as built; spec ₪1.5M) in an off month and adds +0.3 to `tour` that month **for the whole city, rivals included** (a public good).

**Monthly world draws (`world` stream, fixed 2 per payday):**
- [tour noise] ±0.04 + revert 0.1 to 1.0
- [rep event?] p = 0.1: a viral review ±8 rep to one asset, chosen by a modulo of the draw. The count is always 2.

**Goal `passive12`.** The average of the last 12 paydays of goal-passive must be ≥ ₪300k, hold 2.
- Goal-passive = op-asset cf + managed business sustainable draws (E1 B2 rule) + rents + dividends.
- Owner-run businesses are active income and never count.

## Mapping onto existing systems (and what is new)
| need | existing system | new code |
|---|---|---|
| restaurants, dive centre (owner-run → hire manager) | `business.js` archetypes + `SEASONS` + `SEASON_PREP` (cal already supported for t3) | +2 archetypes `beachRestaurant`, `diveCenter` with seasons |
| competition (a new resort opens, an operator gives the allotment to a rival) | `rivals.js` CFG → `systems.rivals: 'HARD'` | rival "new hotel" market card lowers `base` −5% on beach assets |
| hidden problems in a hotel deal (rep, renovation) | `dd.js` → `systems.dd` with a `hotel` flag pool | flag pool data (rep < 40, roof, kitchen licence) |
| demand moves with the economy | `cycle.js` `cfOther` (amp 1.0) multiplies `tour` | none |
| knowing the booking pace | focus `research` | forecast-width effect in the module |
| leverage cost | bank loan pct + cycle | none |
| **new** | — | `mech/season.js`: op-asset kind, monthly hook, tile `N`, `Z` actions (pricePlan, staff, line, festival), indicators (12-month strip, `tour` gauge, winter-cash runway), cityModels, score, recapHint; `goals.js passive12`; `TILE_TYPES.N` |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `hotelier` | דנה, מלונאית דור שני | 120-room beach hotel (value ₪30M, debt ₪21M, rep 70), cash ₪1.8M, salary ₪45k, expenses ₪55k | sees the booking pace one month further and ±50% narrower; strong reputation (premium works at once) | huge fixed costs (₪900k/mo); first winter arrives in month 2; an old building (renovation chain) |
| `chef` | אבי, שף ובעל מסעדות | 2 owner-run beach restaurants (₪4M), cash ₪3.5M, expenses ₪48k | hire/fire costs halved; flexible costs survive winter; seasonal staffing costs no rep for restaurants | his income is active until he hires managers; small scale; must buy capacity |
| `promoter` | מיכל, מפיקת פסטיבלים | cash ₪6.5M, no assets, expenses ₪62k | `Z:festival`; +1 to the negotiation roll on allotments | no base income at all; everything bought at market; festivals help rivals too |

## Assets and deals (deck 'O', ~22 cards + 3 golden)
- Boutique hotel 40 rooms (beach, ₪9M).
- Resort 200 rooms (beach, ₪60M, the high-fixed-cost trap in winter).
- Desert spa 60 rooms (winterSun, ₪14M).
- Conference centre (winterSun, ₪22M, the natural hedge).
- Water park (₪25M, closed in winter).
- 6 vacation apartments (flat-ish beach, ₪7M, low fixed costs, platform fee 15%).
- Staff housing building (flat, ₪5M; −5% staffing cost on your hotels).
- Traps: "beach hotel at a bargain" (rep 30, roof), "half-built water park", "hotel with a 10-year management contract to a chain" (fixed fee, no tier control).
- Golden: a hotel in receivership (−40%).
- Index and tickers: the IDX plus a "tourism stocks" ticker (beta to `tour`).

## Unique events
- **Market (M):**
  - winter jazz festival (+0.25 `tour`, 1 month)
  - foreign airlines cancel flights (−0.3, 2 months)
  - a new direct route from Europe (+0.08 permanent)
  - a heatwave (beach −0.1, spa −0.05)
  - a storm floods the promenade (repair ₪300k per beach asset)
  - a mega-resort opens (rivals)
  - an airport strike
- **Crisis (X):** a regional tourism slump (`tour` −0.35 for 3 months, correlated across every beach asset).
- **Life chains:** unchanged. The hotelier also gets a "renovate the old wing" chain (3 steps, capex ₪6M, rep +15).

## Risks
- Winter cash burn under leverage.
- Correlated demand shocks hit every beach asset at once.
- Premium pricing without reputation.
- Seasonal staffing → a reputation spiral.
- Buying a summer-only asset just before winter.

## Recovery
- An allotment (cash now).
- The seasonal credit line.
- Closing a wing (`Z:closeWing`: fixed −30%, capacity −40%, rep −3).
- Selling vacation apartments (fast, small discount).
- Converting a beach asset to conferences (capex ₪3M, profile → mixed).
- A festival (promoter).
- The bank bailout rule (unchanged).

## Lesson
"עסק עונתי מודדים לפי שנה, לא לפי חודש. הקיץ משלם את החורף, אבל רק אם שמרת ממנו. מחיר גבוה כשאין חדר פנוי, מחיר נמוך כשהחדר ריק.
ונכסים לכמה עונות מאזנים זה את זה."

## Stars
- ★ = win within 72 months.
- ★★ = within 58.
- ★★★ = within 46, plus happiness ≥ 60 and a fund of 3 months of personal expenses.
- TUNE from sim medians.

## Solo / online / competition
- **Solo:** the season ribbon and the panel make the cause visible ("נובמבר: התפוסה 38%, כל חדר ריק עולה ₪…").
- **Online rooms:** the calendar and the `tour` path are shared (fixed draws). Allotment draws are at the landing. `N` safe = `decline`.
- **Competition:** rank = won → months → `progress` (pas12 avg ÷ target). Tiebreak `ratio`. Raw ₪ only inside w5 boards.

## Sim policies (`tools/policies/season.mjs`)
- `smart`: premium/budget when rep ≥ 60; core staff on the best asset; accept an allotment if winter runway < 3 months of fixed costs; buy a winterSun asset when beach share > 70%.
- Ablations: `standardAlways`, `allotAlways`, `allotNever`, `premiumAlways`, `seasonalStaffAlways`, `beachOnly`.
- World gates (on top of DESIGN §5.3):
  - smart ≥ standardAlways + 8 pp
  - neither allotment extreme beats smart
  - `beachOnly` + `maxDebt` bankrupt in ≥ 10% of games (a real correlated-risk loss)

## Engine change list (pinned → rules 6, re-pin at release)
- `rng.js` +`world` stream.
- `common.js` `TILE_TYPES.N`.
- `mech/season.js`, `mech/index.js`.
- `goals.js` `passive12`.
- `business.js` +2 archetypes.
- `w5.js` data, meta entry.
- `vocab.js` `WORLD_STYLE.w5`.
- `kit3d.js` stand-ins.
- `verify_core.js` (`Z` is added in wave 0).

## As built (rules 6 — commits 05394e1, 7d7238b)

Numbers below are the shipped values in `js/worlds/mech/season.js` / `js/worlds/w5.js`; they replace the TUNE values above where they differ.

| item | as built |
|---|---|
| draws (`world`) | 2 per payday, 2 per `N` landing, 0 at init |
| price tiers | budget ×0.9 price / ×1.235 demand · standard 1 / 1 · premium ×1.1 / ×0.826; premium with rep < 60: its demand × a further 0.6; occupancy cap 98% |
| season bands | peak = profile ≥ 1.15, off = ≤ 0.80, mid between |
| seasonal staff | fixed ×1.04 peak, ×0.9 off (core = 1) |
| allotment | 6 months, **−22%** (counter **−12%**, chance 50% / promoter 75%), 50% up front, share 30–60%, overlap 0.4 |
| tour index | 0.6–1.3, noise ±0.04, revert 0.1; viral review p 0.1, ±8 rep |
| seasonal line | up to 2 months of fixed costs at loan pct − 1 pp; must be 0 at the August payday, else it converts (fee 1%) |
| festival / convert / renovate / manager | ₪300k (+0.3 tour) · ₪3M · ₪6M (+15 rep) · ₪28k/mo wage + ₪60k hire |
| goal-passive (owner income) | after interest on bank debt beyond a 2-month fixed-cost working-capital allowance |
| characters | hotelier cash ₪1.8M, salary ₪45k, ★ 66 / 57 / 39 · restaurateur cash ₪4.5M, ₪18k, ★ 80 / 74 / 48 · promoter cash ₪8M, ₪25k, ★ 80 / 62 / 40 |

Balance (tools/balance-data/gates-w5.json, N = 40 per character): guide 66% (worst 57%), blind 8%, smart 65% vs naive 18%, durable 91%,
median won rolls 85; A4 founder 50% / gambler 50% of 4 cells; ablations standardAlways −25 pp, allotAlways −15 pp, allotNever −7 pp.
Open: W5-corr (`beachOnly` + `maxDebt` bankrupt 8%, gate ≥ 10%).
