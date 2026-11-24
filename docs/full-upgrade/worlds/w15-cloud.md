# w15 · מגדלי הענן

Mechanic id `platform` (new engine module, `uses: ['market']` — the regime table) · tier 8 · unlock: ★ in one of w10 / w13 · minRules 7 · difficulty 4/5 · numbers TUNE.
Spec: CATALOG-25 §1.4 (w15 card), §2.2, §2.4 (`platform`), §6.3 (`W15-*`). This file is the **as built** record (engine lane, wave A3).

## Story
> אפליקציה עם מיליון משתמשים ואפס רווח. כל סבב גיוס קונה עוד זמן — ומוכר עוד חתיכה ממך.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/mech/platform.js` | new engine module `platform` (tile `H` פגישה עם משקיעים) | 207 lines |
| `js/worlds/w15.js` | world data, characters, decks, `lessonDefs` | 134 lines |
| `tools/policies/platform.mjs` | sim plug-in + `W15-runway`, `W15-dilute` | — |
| `tests/w15.test.mjs` | 13 tests | — |

Verifier pack `w15` = w15.js + platform.js + market.js + data/companies.js (market's import), 87,812 chars (43.9 % of 200,000). Only the market
module's `REGIMES` table (labels, minimum months, exit probabilities, next-regime weights) is used; market.js is not attached as a mechanic
(no `exch` stream, no companies listed). Core +7 chars (`'w15'` in `LAZY_IDS`). No content pool (the catalog's `round` pool is the `H` tile's
term sheet + buyout; legacy decks serve `O`).

### Fixed draws (stream `world`)
init **4** (first regime · sealed product quality q · cohort jitter · the rival's start share) · payday **4** (regime transition · organic noise /
rival drift · the new cohort's sealed retention · its shown range's jitter) · `H` landing **2** (term sheet vs buyout + %, the price factor).

### Economy (TUNE)
- Valuation EV = the regime's tech multiple × ARR: growth 7 · bubble 11 · recession 3.5 · recovery 5 · high volatility 4.5 · sector crisis 3.
  stakeValue = stake × (EV + cash − venture debt); after a sale = the proceeds. The company asset's value = stake × EV (NW counts all cash).
- Users = a core bucket (retention 0.97) + a ring of 24 monthly cohorts. A cohort's sealed monthly retention = 0.86 + 0.08 q ± 0.02 (+0.5 pp
  past the network threshold, −1 pp during a cut, event mods). Its shown range is 0.06 wide at birth and narrows as 0.03 / (1 + age / 2) per side.
- 3 channels (search ₪14, social ₪10, TV ₪22 base CAC; saturation ₪4M / ₪3M / ₪8M), spend levels ₪0 / 0.5M / 1.5M / 4M a month each.
  CAC = base × (1 + spend / sat) × (1 + 2 × users / 8M) × (1 + rival share) × (0.8 past 2M users) × (0.85 big tech) × events.
  The marketing team caps the level: 1, +1 every 18 months (+1 for big tech). Organic +0.8 %/month of users.
- ARPU grows 0.5 %/month; servers ₪0.8/user; opex per character; cash flow = MRR − opex − marketing − servers − debt interest (the asset's cf).
- Rounds `raise s|m|l` sell 8 / 15 / 25 % at (EV + cash − debt) × (1.15 bubble · 0.7 winter = recession / sector crisis / high volatility),
  once in 6 months; below the last post-money a **ratchet** gives the earlier investors 50 % of the shortfall out of your stake. `bridge` = 8 % at
  0.8 (3 months apart). Cash < 0 at a payday → an **emergency round** of 15 % at 0.6 (counted: `crunches`).
- Venture debt ₪20M at 1 %/month (covenant runway ≥ 6; below it the lender takes 3 % of the company every month). `cut` = −30 % opex for 6
  months (−1 pp retention, happiness −5). `pivot` (once) = −40 % users and a new sealed quality.
- `H` card: 35 % a giant's buyout at 1.0–1.6 × EV (your part = stake × (price + cash − debt), the company is gone, the proceeds are your stake
  value); else a term sheet of 12 / 18 / 25 % at 0.8–1.25 × the market. Decline = safe.
- Guide picks: spend each channel at the highest level (≤ the team cap) whose CAC ≤ LTV / 1.6 (LTV planned with the LOW end of the shown retention
  of cohorts ≥ 3 months old) while runway ≥ 9 and 6 months of the extra burn are in cash; raise m when runway < 9 outside a winter, s below 6 in a
  winter, m in a bubble below 18; take a term sheet when runway < 9 at ≥ 0.95 × market (0.8 in a winter); the buyout only when your part ≥ ₪800M
  or in a winter with < 4 months; cut / bridge below 4–6 months; pivot when 6 young cohorts all show < 88.5 % (months 9–36).

### Z actions
`spend <ch>:<0-3>` · `raise s|m|l` · `bridge` · `debt` · `repayDebt` · `cut` · `pivot`.

### Characters
| id | icon | cash | stake | start | rule |
|---|---|---|---|---|---|
| `soloFounder` | rocket | ₪20M | 70 % | 400k users, ARPU ₪6, opex ₪2.5M | — |
| `bigTechExec` | briefcase | ₪80M | 45 % | 600k users, ARPU ₪6, opex ₪4M | CAC −15 %, team cap +1 |
| `bootstrapper` | sprout | ₪8M | 100 % | 150k users, ARPU ₪7, opex ₪0.7M, no marketing | profitable from day 1 |
Start stake value at the growth multiple: ≈ ₪152M / ₪198M / ₪96M (the bootstrapper sits a little under the catalog's ₪100M; the start regime is drawn).

### Goal and stars
`all`, hold 3: `modValue stakeValue` ≥ ₪800M **and** `liquidity` ≥ 12 months (the module's `liqMonths` = runway, 99 when cash flow ≥ 0).
maxMonths 84, ★★ ≤ 70, ★★★ ≤ 58.

### Lessons (`lessonDefs`)
`ltv_cac` LTV מול CAC · `dilution` דילול.

### Gates (N = 36 per character, rules 7, `tools/balance-data/gates-w15.json`, run on the unregistered world with the same engine files)
| gate | status | numbers |
|---|---|---|
| G-guide | met | 70 % · worst 58 % · soloFounder 58 % bigTechExec 58 % bootstrapper 94 % |
| G-blind | met | 0 % |
| G-smart | met | smart 69 % med 54 · naive 12 % med 63 |
| G-reach | met | soloFounder 56 % · bigTechExec 58 % · bootstrapper 94 % |
| G-loss | met | naive 88 % · maxDebt 29 % · smart loses 31 % |
| G-dom | **NOT met** | cells 6: saver 17 % founder 75 % diversified 8 % gambler 0 % · ablations neverRaise 61 % (Δ 8 pp) · acceptFirstOffer 5 % (Δ 65 pp) |
| G-frugal | met | 69 % vs 69 % |
| G-durable | met | 198 / 198 |
| G-time | met | median 81 rolls (p10 42, p90 165) · median won months 54 |
| W15-runway | met | blitzGrowth out of runway 54 % (in time 71 %) · smart 1 % |
| W15-dilute | met | raiseEveryRound 0 % vs smart 69 % · median final stake 0 % vs 60 % |

Open: G-dom (allowed alone) — the founder archetype (top spend always) is the best archetype in 75 % of cells. Watch: blitzGrowth burns into the
emergency round in 54 % of games yet ends in time 71 % (≈ smart): the emergency round at 60 % is not costly enough — a re-tune should make it
dearer (0.4–0.5) and re-run. maxDebt (personal bank loans into the company) is 71 % vs smart 69 %.
W15-runway needed one fix (the blitz policy took every term sheet and never ran out; it now raises nothing).

### Deviations from the catalog
- `market` contributes its regime table only (not attached, no `exch` stream): `modules: ['platform']`, `uses: ['market']`.
- 4 fixed payday draws (catalog: 3) — the regime needs its own.
- The team capacity cap and the market-size friction on CAC are additions (the time scale of growth); network effect at 2M users,
  CAC −20 %, retention +0.5 pp (catalog: −30 % / +5 pp).
- No acqui-hires / marketing blitz cards; "a key engineer leaves" / "a giant copies the feature" are retention events; the data breach is −10 % users.
