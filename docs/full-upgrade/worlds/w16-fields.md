# w16 · ארץ השדות

Rule adapter `harvest` (`js/worlds/adapters/harvest.js`, `uses: ['season', 'market', 'portfolio']`) · tier 8 · unlock: ★ in one of w9 / w10 ·
minRules 7 · difficulty 4/5 · numbers TUNE. Spec: CATALOG-25 §1.4 (w16 card), §2.2, §6.3 (`W16-hedge`). This file is the **as built** record
(engine lane, wave A3).

## Story
> שדות ומים בעמק. את היבול רואים רק בקציר, ואת המחיר אפשר לנעול כבר בזריעה. כמה לנעול, כשאתה לא יודע כמה תקצור?

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/harvest.js` | rule adapter `harvest` (tile `H` בורסת התוצרת), all state in `st.world.harvest` | 270 lines (V-adapter ≤ 350) |
| `js/worlds/w16.js` | world data, characters, decks, `lessonDefs` | 138 lines |
| `tools/policies/harvest.mjs` | sim plug-in + `W16-hedge` | — |
| `tests/w16.test.mjs` | 15 tests | — |

Verifier pack `w16` = w16.js + adapters/harvest.js, 48,216 chars (24.1 % of 200,000). Core +7 chars (`'w16'` in `LAZY_IDS`). No content pool
(legacy decks serve `O` / `M` / `X` / `?`; the market and crisis cards carry `mk` keys the adapter applies).

### The catalog's composition, as built
`season` (calendar) + `market` (commodity regimes) + `portfolio` (margin) are **re-implemented inside the adapter**, not attached: the w5
`season` module is hotel-specific (occupancy, allotments), `market` lists equities and draws from its own `exch` stream (69 draws a payday),
and `portfolio`'s margin is an LTV loan on a securities book. What the adapter keeps of each: a per-crop sowing / harvest calendar on the
engine's `calOf` (the world starts in September), regime-driven commodity prices with a mean-reverting path, and initial / maintenance margin
with calls and forced liquidation. `modules: ['harvest']`, `mechanic: 'harvest'` (like w13's `league`).

### Fixed draws (stream `world`)
init **10** (the regime · 3 prices · one per field slot) · payday **12** (the regime · 3 prices · the dollar · one per field slot — used only by a
slot that sows that month · the hail target) · `H` landing **2** (export contract vs water rights + its slot, the price factor).

### Economy (TUNE)
- **6 field slots.** Crops: wheat (sow Nov, 6 months, 8,500 t, ₪2,000/t, ₪0.5M/month while growing, water 0.5, storable), cotton (sow Apr,
  6 months, 3,600 t, ₪5,600/t, ₪1M/month, water 1.0, storable, packing +10 %), export avocado (an orchard: a 12-month cycle from January,
  3,000 t at $2,450 × the dollar, ₪0.55M/month, water 0.8, NOT storable, packing +10 %; planting ₪8M and 24 months before the first cycle).
- **Sealed yield per field at sowing:** Q = E × u × weather, u ∈ [0.88, 1.12] from that slot's payday draw, E = base × irrigation 1.12 × (old
  equipment 0.9). The shown range is E × weather-so-far × [u − 2w·j, u − 2w·j + 2w] with w = 0.12 × months-left / months-of-growth + 0.01
  (the agronomist × 0.7) — it always contains the truth and narrows to harvest; `u` / `j` are sealed.
- **Supply regimes:** normal (min 3, exit 0.25 → bumper 30 / drought 45 / glut 25) · bumper (yields +2.5 %/month, prices ×0.88–0.95) · drought
  (yields × (1 − 0.17 × water × (1 − quota)) a month, halved by irrigation; prices wheat ×1.15, cotton ×1.12, avocado ×1.05) · glut (a global
  oversupply, prices ×0.7 / 0.7 / 0.8). Long-run mean of the multipliers ≈ 1.0 (stationary semi-Markov check).
- **Prices:** fair price reverts 15 %/month to anchor × regime × a running event (export ban abroad: wheat ×1.35 for 4 months; world bumper
  crop: cotton ×0.8 for 5 months), monthly σ 8 / 9 / 7 %; the dollar reverts to 3.6.
  **Harvest future** h months ahead = A + (T − A) × 0.85^h + (fair − T) × 0.8^h (A the long-run anchor, T today's regime anchor) — no free edge.
  It settles at the fair price; the crop itself sells at the **local price**: −15 % in the crop's harvest month, −7 % the month after.
- **Hedges:** `hedge <slot>:<0|0.25|0.5|0.75|1>` locks that share of the range's midpoint at today's future; 8 % initial margin from cash;
  marked monthly; below 5 % a call tops it back to 8 % from cash — without the cash the broker closes it (**forced**: P&L realised, the goal's
  `noDefault` 'margin' part restarts its 12 paydays). At harvest the hedge closes at the fair price; a shortfall (Q < q) in a price spike is the
  **over-hedge buy-back loss** (`buyLoss`, `overDrought` when the harvest was drought-hit).
- **Cash vs goal:** sales and costs are booked by the payday step and paid as the farm asset's cash flow at the next payday; margin moves cash at
  once; hedge P&L and between-roll silo sales enter the goal through `goalAccrual` (never twice); the goal also subtracts the interest on bank
  loans (the engine's `loanPct`), so borrowing is not free farm income.
- **Silo:** wheat / cotton not sold go to the silo (per field `store`, default on), 1.5 %/month spoils, sold by `sell <crop>` at the local price,
  auto-sold after 6 months. **Insurance** (first 2 months of growth): 3 % of E × the future; pays (0.8 E − Q) × the locked price when Q < 0.8 E.
- **Land:** `buyLand` ₪60M (+₪5M per purchase), 40 % down, the rest a mortgage at 0.4 %/month (a module liability), once in 15 months;
  `lease` ₪330k/month, once in 30 months; `sellLand` (idle owned: 90 % of ₪60M, repays the mortgage share); irrigation ₪8M (half under the
  subsidy card), packing house ₪30M, new equipment ₪12M, `repay` ₪10M of the mortgage. Overhead ₪1M + ₪100k per field a month.
- **H card (בורסת התוצרת):** 60 % an export contract on a growing cotton / avocado field (30 % of its midpoint at 1.04–1.16 × the future, no
  margin; a shortfall is bought at the fair price + 10 %), else water rights (₪14–22M for +10 % drought quota). Decline = safe.
- **Market cards** (`mk`): drought · ban · glut · usdUp / usdDown · subsidy · pest (cotton −15 %). **Crisis** `hail`: one growing field −30 %.
- **Guide picks** (the panel's `suggested`): hedge up to the level ≤ 90 % of the range's LOW end (75 % in a drought) when cash covers 3 months of
  costs + the deposit + twice the margin on everything locked, and at least 2 months remain; step a hedge down when it is above the low end or
  when next payday's cash would not cover 1.5 × the margin; keep the silo on and sell 2 months after the harvest; insure thirsty unirrigated
  fields in a drought; switch one idle wheat field at a time to cotton while cotton ≤ half the fields (irrigated or quota ≥ 0.7); buy a field /
  lease one when allowed and cash − (4 months of costs + margin + ₪5M) covers it; irrigate (thirsty fields first); the packing house with ≥ 2
  cotton / avocado fields; the equipment; repay with ₪60M spare. The card: the export contract when it fits under 90 % of the low end at ≥ 1.07;
  water rights with ≥ 2 thirsty fields, quota < 0.75 and the buffer.

### Z actions
`crop <slot>:<wheat|cotton|avo>` · `hedge <slot>:<level>` · `store <slot>:<0|1>` · `sell <crop>` · `insure <slot>` · `buyLand <crop>` · `lease <crop>` ·
`sellLand <slot>` · `irrigate <slot>` · `pack` · `equip` · `repay`.

### Characters
| id | icon | cash | start | rule |
|---|---|---|---|---|
| `agronomist` | sprout | ₪40M | 3 owned fields (2 cotton a month from harvest, 1 wheat), mortgage ₪20M | yield ranges 30 % narrower |
| `moshavFarmer` | house | ₪14M | owned cotton + wheat + a bearing avocado orchard, mortgage ₪10M | drought quota 85 %; old equipment (yield × 0.9 until replaced) |
| `agriFund` | briefcase | ₪170M | 2 leased fields (cotton, wheat) | drought quota 55 %; leases ₪330k a month each |
Start net worth ≈ ₪206M / ₪201M / ₪176M; monthly farm costs at the start ≈ ₪3.4M / ₪2.9M / ₪2.9M.

### Goal and stars
`all`, hold 2: `passive12` ≥ ₪5M a month (the farm's booked income + hedge P&L + silo sales − bank-loan interest, 12-payday average) **and**
`noDefault` 12 paydays, key `margin` (the adapter's `lastEvent:margin` = the payday of the last forced liquidation). maxMonths 54, ★★ ≤ 46, ★★★ ≤ 38.

### Lessons (`lessonDefs`)
`qty_hedge` גידור כמות · `hedge_margin` קריאת מרווח של גידור.

### Gates (N = 36 per character, rules 7, `tools/balance-data/gates-w16.json`)
| gate | status | numbers |
|---|---|---|
| G-guide | met | 91 % · worst 83 % · agronomist 97 % moshavFarmer 83 % agriFund 92 % |
| G-blind | met | 0 % |
| G-smart | met | smart 89 % med 43 · naive 64 % med 52 |
| G-reach | met | agronomist 94 % · moshavFarmer 81 % · agriFund 92 % |
| G-loss | met | naive 36 % · maxDebt 7 % · smart loses 11 % |
| G-dom | met | cells 6: saver 0 % founder 25 % diversified 58 % gambler 17 % · ablations monoCrop 68 % (Δ 21 pp) · neverStore 36 % (Δ 53 pp) |
| G-frugal | met | 89 % vs 89 % |
| G-durable | **NOT met** | 172 / 216 = 80 % |
| G-time | met | median 61 rolls (p10 36, p90 77) · median won months 43 |
| W16-hedge | **NOT met** | hedge100 83 % (Δ 6 pp) · hedge0 85 % (Δ 4 pp) vs smart 89 % · buy-back losses in 83 % of 102 hedge100 drought games · forced: hedge100 37 %, smart 5 % |

Open:
- **G-durable 80 %** (needs 85 %): a fully developed farm sits around ₪5.5–6M a month at anchor prices, so a drought year or a glut after the
  win pulls the 12-month average under ₪5M in ~1 of 5 continuations; early "lucky" wins (≈ month 24, a price year) fail most. Two fix
  attempts were spent (one crop switch at a time + irrigation for every field: 54 → 75 %; prices +6 % with slower land pacing: 86 % at N = 12,
  91 % at N = 36 in an earlier calibration — but that one failed G-smart, G-loss and G-time); the shipped calibration trades it for the five
  required gates. Next lever (not done): a post-win growth path (precision-farming upgrade, a second orchard) or a smaller drought hit.
- **W16-hedge**, the hedge0 half (Δ 4 pp): hedging costs the reference player margin cash and buy-back losses and buys protection against
  gluts only; with drought prices rising when yields fall (the natural hedge) the no-hedge farm is almost as fast. The hedge100 half and the
  drought buy-back share are met. Two fix attempts on this gate (more price risk: revert 0.15, σ ↑; less yield noise + 54 months) plus a model
  fix (futures with a regime-persistence term; insurance 3 % / 0.8; drought price ↑ smaller, glut bigger) moved hedge0 from +2 pp better than
  smart to 4 pp worse.

### Deviations from the catalog
- The three named modules are re-implemented in the adapter (above); `uses:` names them for the composition record.
- Dairy is not a crop (3 crops: wheat, cotton, export avocado). The harvest future settles at the fair price; the local harvest dip is a
  separate rule (−15 % / −7 %), so hedging does not avoid the dip — storing does.
- 12 fixed payday draws (catalog: 1 per field slot, 6): the regime, prices, the dollar and the hail target need their own.
- The goal subtracts bank-loan interest from the farm income (otherwise personal loans are free leverage for `passive12`).
- maxMonths 54 (★★ 46, ★★★ 38): the farm reaches the goal in ~4 years; a longer window made every policy win.
- Recovery: sell silo stock, step a hedge down, sell / return a field, insurance payouts, the engine's bank loans. "Roll the hedge", "lease out
  a field" and "sell water rights" are not separate actions.
