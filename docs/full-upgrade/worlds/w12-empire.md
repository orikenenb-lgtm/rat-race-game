# w12 · האימפריה

Mechanic id `holding` (uses light formulas of `season`, `plant`, `chain`, `projects`, `energy`, `portfolio`, `multinational`) · tier 9
unlock: ★ in w11 · minRules 7 · difficulty 5/5 · numbers TUNE. **Built (CATALOG-25 wave A4, engine lane) — see "As built" below; the plan
sections after it are kept as written.**

## Story
> קבוצת חברות: מלונות, מפעלים, רשת, נדל"ן, אנרגיה ותיק השקעות. אתה כבר לא מנהל עסק, אתה מנהל את הקשרים בין עסקים.
> המשבר הבא לא יפיל את החברה הכי חלשה. הוא יפיל את מי שערב לה.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/mech/holding.js` | new module `holding` (tile `Z` חטיבה למכירה), all state in `st.world.hd` | 331 lines |
| `js/worlds/w12.js` | world data, characters, decks, `lessonDefs` | 141 lines |
| `tools/policies/holding.mjs` | sim plug-in + `W12-contagion`, `W12-fence` | 105 lines |
| `tests/w12.test.mjs` | 15 tests | 213 lines |

Verifier pack `w12` = w12.js + mech/holding.js, 56,703 chars (28.4 % of 200,000). Core +7 chars (`'w12'` in `LAZY_IDS`: 885,646 → 885,653).
No content pool (legacy decks serve `O` / `M` / `X` / `?`; the market and crisis cards carry `mk` keys the module applies).

### The plan's composition, as built
The seven "light" division models are **re-implemented inside `holding.js`** (a kind table + one formula), not `light()` exports added to
season / plant / chain / projects / energy / portfolio / multinational: adding exports would change the pinned packs of w5–w11 for no rule
change. What each kind keeps of its home world: hotels (w5) a summer-peak season curve ±35 %; industry (w6) condition × utilisation (health
weighs 60 % instead of 40 %, health decays 0.8 a month); retail (w7) the fastest organic growth (1 %/month); real estate (w8) a project that
delivers +5 % every 24 months and the highest rate beta; energy (w9) mostly PPA (a low growth beta, a +1.0 energy beta); finance (w10) the
market factor (growth beta 1.6, the highest noise); global trade (w11) the FX beta 1.2. The w10 factor set is the storm vector (growth,
rates, energy, FX). `cycle` amp 1.2, `rivals` HARD and `dd` (prior HARD, pool of 6 findings) are the engine systems the plan named.

### Fixed draws (stream `world`)
init **16** (per division slot: quality, beta jitter) · payday **10** (8 division noises — one per slot, empty slots too — · storm start/type ·
severity) · `Z` landing **4** (template / size · quality · price · health). Market / crisis cards use the engine decks (no extra draws).

### Economy (TUNE)
- **Divisions (≤ 8):** op profit = base × eff(health) × ((1 + fs) × demand − fs) × (shared services 1.03) × (1 ± vol); demand = the kind's light
  model × (1 + Σ beta × storm shock), clamped 0.1–1.8; fs = operating leverage (0.2 real estate … 1.3 trophy). Gross value = **100 ×** the
  trailing 12-month op profit (the public estimate fills unseen months); a ring-fenced division never counts below 0 (limited liability).
- **Debt** sits on each division (asset debt), 0.3 %/month amortisation; rate = the group rating's (AA 4.5 % · A 5 % · BBB 5.5 % · BB 6 % · B 7 %
  · CCC 8.5 %), **ring-fenced +1.5 pp and 30 % of its surplus swept to its lenders**. Switching structure costs 0.5 % of the debt; a
  guaranteed division in deficit cannot be ring-fenced.
- **Support / breach / default:** a negative month asks HQ to pay the gap (support on and cash enough), else the gap joins the division's debt.
  Two negative paydays in a row = a covenant breach: guaranteed → the lenders call **60 %** of its debt from HQ; unpaid (no cash, or support
  declined) = **group default**: the debt **+ 25 %** penalty moves to HQ (rate + 2 pp, 1 %/month amortisation), rating −1 notch, health ≤ 30,
  `lastEvent:default` = this payday, and every other guaranteed division in deficit breaches at once (**cross-default**). Ring-fenced → a
  **30 %** cure; unpaid (or support off) the lenders take the division (equity lost, debt leaves, no rating effect, no default).
- **Storms:** 10 % a payday when none runs: recession (G −0.36, 5 months) · rates (R −0.26, 4) · energy (N +0.30 / G −0.05, 3) · FX (X −0.30, 3) ·
  boom (G +0.12, 4) · global credit (G −0.30, R −0.20, 4); severity 0.7–1.6, +0.8 in the worst quarter (a fat tail); decays linearly.
  Market cards start a recession (1.2), an energy crisis (1.1) or a boom; `review` runs the rating review; `antitrust` forces the largest
  division's sale at 85 % (6+ divisions). Crisis cards: a succession dispute (board pressure +1, happiness −10), a cyber attack (₪2M, ₪6M with
  shared services).
- **Annual (every 12 paydays):** the board's dividend = min % × NW (3 %, the activist 6 %, +1 pp per pressure; `high` +3 pp; `skip` 0) paid from
  HQ cash as far as it goes; under the minimum → pressure +1 and happiness −8. Then the **rating review**: coverage < 1 → −1 notch; ≥ 1.5 and
  12 paydays without a default → +1.
- **Coverage** (goal part, `liqMonths`) = HQ cash ÷ a month of group service (guaranteed divisions' interest + amortisation, HQ debt, bond
  coupons); 12 months = coverage 1.0. Undrawn lines are not counted (the engine's bank loans are the emergency line).
- **HQ:** ₪0.8M a month fixed (module `expense`), HQ debt and bonds (`liability`). Bonds: ₪100M for 60 months at the rating − 0.5 pp, ≤ 3,
  rating BB or better; coverage < 1.2 = covenant breach (+1 pp while it lasts); early repayment at 101 %. Insurance arm: 0.015 % of gross a
  month, pays 35 % of the storm loss. Shared services ₪60M once: +3 % profit everywhere. Grow ₪ = 5 % of gross → +8 % profit (×1.1 for the third
  generation), once per 6 months per division; fix = 2 % of gross → health +25, once per 6 months; sell at 92 % of gross (the activist 100 %),
  minus its debt. **Restructuring** (once, only with HQ debt and cash < 0 or coverage < 0.5): 40 % off the HQ debt; it counts as a default
  (the 24-month clock restarts) and caps the stars at ★ (`starGates`).
- **Tile Z (6 on the board):** a division of a random template (16 fictional ones, 2 per kind incl. 2 "trophy" traps with quality 0.35–0.7),
  size 0.6–1.4 × (1 + month / 72), quality 0.7–1.25 (sealed), health 45–95, price 100 × estimate × 0.88–1.10 (the activist × 0.92). Shown range
  ±0.22 around a jittered point that contains the truth; dd (max ₪1M, 0.4 % of price) narrows to ±0.06 and keeps the card open. `buy`
  (guaranteed) / `buyRf` (ring-fenced): 40 % down from HQ (bank loan if short), 60 % as the division's debt. `pass` = safe. Guide pick: dd,
  then buy when 100 × the low end ≥ 95 % of the price within cash − a 15-month reserve; guaranteed only with health ≥ 70 and a growth beta < 1.

### Z actions
`structure d<id>` · `support d<id>` (toggle) · `grow d<id>` · `fix d<id>` · `sell d<id>` · `dividend min|high|skip` · `bond` · `repayBond` · `repayHq` ·
`insure` (toggle) · `services` · `restructure`. Every option carries `preview {cash, monthly, months, risk}`.

### Characters
| id | start | pros | cons |
|---|---|---|---|
| `chair` | 6 divisions (gross ≈ ₪1.2B, debt ≈ 55 %), 3 guaranteed incl. the foundry at health 40; rating A; HQ ₪60M | cheapest debt | the weak foundry is guaranteed |
| `activist` | 4 divisions, all ring-fenced; rating BBB; HQ ₪120M | deals 8 % cheaper (sales at 100 %) | dividend minimum 6 % |
| `thirdGen` | 5 divisions, 4 guaranteed (debt ≈ 58 %); rating BBB; HQ ₪25M (coverage ≈ 0.5) | grow +10 % | must raise coverage early (bond / sale) |
Start NW ₪526–600M. maxMonths **72** (★★ 62, ★★★ 52) for every character.

### Goal and stars
`all`: `nw` ₪2B + `noDefault` 24 (key `default`) + `liquidity` 12 months (= coverage 1.0), hold 3. Restructuring caps the stars at ★.

### Lessons (`lessonDefs`)
`contagion` הדבקה דרך ערבויות · `ring_fence` לגדר חטיבה · `stable_group` יציבות שווה יותר מצמיחה (the UI lane's lessons-meta has no entry yet).

### Gates (N = 36 per character, rules 7, `tools/balance-data/gates-w12.json`)
| gate | status | numbers |
|---|---|---|
| G-guide | met | 86 % · worst 75 % · chair 92 % activist 75 % thirdGen 92 % |
| G-blind | met | 1 % |
| G-smart | met | smart 86 % med 62 · naive 0 % med 100 |
| G-reach | met | chair 92 % · activist 75 % · thirdGen 92 % |
| G-loss | met | naive 100 % · maxDebt 15 % · smart loses 14 % |
| G-dom | **NOT met** | cells 3: saver 0 % founder 100 % diversified 0 % gambler 0 % · ablations guaranteeAll 84 % (Δ 2 pp) · ringFenceAll 56 % (Δ 30 pp) · maxDividend 75 % (Δ 11 pp) · neverSell 75 % (Δ 11 pp) |
| G-frugal | met | 86 % vs 86 % |
| G-durable | met | 209 / 216 = 97 % |
| G-time | met | median 87 rolls (p10 75, p90 107) · median won months 62 |
| W12-contagion | met | guaranteeAll ≥ 1 group default in 20 % (in time 84 %) · smart 11 % |
| W12-fence | met | ringFenceAll median 69 vs smart 62 (Δ 7 months) |

Open:
- **G-dom**: the founder archetype (buys every affordable division without dd) is the best of the four archetypes in all 3 cells — at
  0.88–1.10 × the estimate with a true quality of 0.7–1.25 a blind purchase is mildly positive on average. One fix attempt (asking price
  0.95–1.15): founder stayed at 100 % and guaranteeAll overtook smart, so it was reverted. The guaranteeAll ablation is only 2 pp behind smart:
  a guarantee is cheap debt until the fat-tail storm, and its defaults (20 %) cost the 24-month clock mostly when they come late.
- **W12-contagion** sat at 19 % after the first N = 36 run; two attempts: a 70 % call (13 %: the guide's pre-emptive sale fires more often) —
  reverted; a fatter storm tail (+0.8 severity in the worst quarter instead of +0.7 in the worst fifth) — 20 %, kept (at the gate's edge).

### Deviations from the plan
- Light models live inside `holding.js` (above) — no `light()` exports in the earlier modules.
- Default is reached through a **covenant breach** (2 negative paydays → a 60 % guarantee call / a 30 % cure), not "cash < 0 for 2 paydays
  after support is declined": a monthly gap is tiny against HQ cash, so without the call no policy ever defaulted. A default carries a
  25 % penalty and a cross-default; ring-fenced divisions also have a 30 % cash sweep (otherwise ring-fencing everything was the fastest).
- The smart rule guarantees health ≥ 60 and a growth beta < 1.3 (plan: ≥ 70 and < 1): the stricter rule lost to guaranteeAll (78 vs 83 % at
  N = 12). The card's guide pick keeps ≥ 70 / < 1 for a new purchase.
- The "group-level hedge" (a w10 put overlay) is the insurance arm (35 % of the storm loss for a premium); there is no separate overlay.
- maxMonths 72 (★★ 62, ★★★ 52), not 84 / 70 / 58: with 84 months smart, guideTapper and every ablation finished in time (G-loss failed).
- The annual allocation is not a slider card: grow / fix / dividend / reserve are panel actions (grow once per 6 months per division).
- Coverage counts HQ cash only (no undrawn lines); `liquidity` months 12 = coverage 1.0.
- Board pressure from a skipped dividend raises next year's minimum (+1 pp) and costs happiness; there is no separate pressure event.
- Rivals bidding for divisions and the "too big to manage" attention span (3 HQ slots) are not modelled.

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
