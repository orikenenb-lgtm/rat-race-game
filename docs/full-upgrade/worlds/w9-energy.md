# w9 · מדבר האנרגיה

Mechanic ids `projects` + `energy` · tier 7 · unlock: ★ in any one of w6/w7/w8 · minRules 6 · difficulty 4/5 · numbers TUNE.

## Story
> שמש, רוח ואגירה במדבר. תשתית עולה הון עצום היום ומחזירה אותו לאט, לאורך עשרים שנה.
> מי שבונה פרויקט אחד ומחכה, מחכה. מי שבונה, מממן מחדש ובונה שוב, מגלגל פרויקט אחד לעשרה.

## Visual language
- Desert noon: sky `#fef3c7 → #fbbf24` haze, ochre dunes board `#e9c46a`, deep-blue solar panels `#1e3a8a`.
- Accent electric cyan `#06b6d4` (ink `#155e75`). Decor `solar` + `turbine` (reuse `assets/w4/turbine.glb`).
- Power lines animate current pulses ∝ output. A plant waiting for a grid slot shows an unconnected cable end.
- 2D motif ☀️⚡.

## Money ranges
- Start equity ₪25–60M.
- Projects ₪80–600M (solar 50 MW ≈ ₪180M, wind ≈ ₪350M, storage ≈ ₪120M, transmission share ₪60M).
- Build 8–24 game months. Operating margin before debt 70–85%. Project-finance LTV up to 75% of DCF value.
- Goal **₪3.5M/mo** operating income after debt service. `econ`: loanUnit ₪1M, ddMinFee ₪200k, bands deal [40M, 600M].

## Core mechanic: build, refinance, repeat (+ PPA vs merchant)
- **Grid slot:** a project card needs a connection slot.
  - Slots arrive on 'O'/special cards and are contested by rivals (the existing rival delay/close mechanics: "rival takes the slot").
  - A slot is consumed when construction starts.
- **Build:** `mech/projects.js` lifecycle (no presales). Equity first, then a construction loan; sealed delay and overrun.
- **Revenue model at completion:**
  - **PPA**: a fixed ₪/MWh for the rest of the game, ~85% of the average spot.
  - **Merchant**: the spot power index `st.world.power`, mean-reverting with spikes and price-cannibalisation at solar noon (merchant solar earns less as more solar exists — including rivals').
  - **Storage** earns on spot volatility (a natural hedge for merchant solar).
- **Output** = capacity × capacityFactor. CF is sealed per plant slot per month (8 slots × 1 `world` draw, fixed) plus a season curve.
- **Refinance** (`Z:refi`): an operating plant's DCF value at the current rate (w2 rate deck) × LTV 75% − existing debt = cash out.
  - Higher rate → lower value → less cash.
  - Refinancing raises debt service, so goal income falls.
  - The tension: recycle equity into the next project versus hit the income goal sooner.
- **Sell a stake** (`Z:sellStake` 49%): cash now, half the income.

## Mapping
| need | existing | new |
|---|---|---|
| lifecycle, delays, staged draws | `mech/projects.js` (w8) | presale disabled; PPA choice at completion |
| rate-dependent value and refinancing | w2 `rate` (B tiles) | DCF value |
| competing for grid slots | `rivals.js` | a slot is a deal; a rival can close |
| site/permit risk | `dd.js` pool `site` | — |
| boom/bust | `cycle.js` (power demand) | spot drift multiplier |
| **new** | — | `mech/energy.js` (power index, CF draws, PPA/merchant, refi, storage spread, goal `passiveTarget` operating income), indicators (pipeline Gantt, income vs target, DCF/LTV headroom per plant), cityModels |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `gridEng` | ליאור, מהנדסת רשת | cash ₪25M | sees each slot's rival interest and a narrower CF range | smallest capital |
| `infraFund` | דוד, מנהל קרן תשתיות | cash ₪60M | refinance LTV 80% | **LP pressure**: must distribute 6% of equity every 12 months (a forced cash outflow) |
| `kibbutz` | קיבוץ בערבה | land for 2 projects (no land cost), cash ₪10M | land free; local support (permit −20%) | a community vote delays each start by 1–3 months (sealed); low cash |

## Assets and deals
- Solar fields (20–100 MW), wind farm, battery storage, a hybrid (solar + storage), an operating plant for sale (yield known, price high), a transmission line share (regulated fixed return), green hydrogen pilot (trap: hype, negative cf, power-law-style payoff, small).
- Golden: an operating PPA plant from a distressed seller.

## Unique events
- Regulator cuts feed-in for new projects (new PPAs −10%).
- A heatwave (spot spike).
- A sandstorm (CF −30% for solar this month).
- A grid curtailment (output capped for 2 months).
- Interest-rate shock (refi values fall).
- A panel price collapse (new projects −12% capex).
- Carbon price introduced (spot +8% permanent).

## Risks
- Equity locked in long builds while no income arrives.
- Over-refinancing → debt service eats income in a rate shock.
- Merchant exposure to price collapse (solar cannibalisation).
- LP distributions draining cash (the fund).

## Recovery
- Sell a 49% stake.
- Switch merchant → PPA mid-life (at a discount).
- Pause a build.
- Refinance at a longer tenor (lower debt service, more total interest).
- Sell the grid slot to a rival.

## Lesson
"תשתית היא כסף של היום תמורת כסף של מחר. הכנסה ארוכה ויציבה שווה הרבה, ואפשר ללוות כנגדה כדי לבנות עוד. אבל כל שקל שמשכת היום הוא החזר שתשלם מחר."

## Goal and stars
- Goal `passiveTarget`: operating income after debt service ≥ ₪3.5M/mo, hold 3.
- Stars: ★ 84 · ★★ 68 · ★★★ 56, plus happiness and fund.

## Solo / online / competition
- Power path, CF draws and project draws are shared. Slot contests use the existing rival draws.
- Safe = `pass`, no refi.
- Rank: months → income/target.

## Sim policies and gates
- `smart`: build in a pipeline of 2; refi when value headroom > 30% and rate ≤ average; 60% PPA / 40% merchant + storage.
- Ablations `allPPA`, `allMerchant`, `neverRefi`, `maxRefi`. Each must lose to smart by ≥ 5 pp.
- World gate: `neverRefi` reaches the goal in < 40% (capital recycling is necessary). `maxRefi` goes bankrupt in ≥ 10% (and fails in rate shocks).

## Size
L, on top of `projects.js`. `mech/energy.js` ~650 lines, data ~300, tests ~450.

## As built (rules 6 — engine lane, wave 4)

Shipped in `js/worlds/mech/energy.js` (the `energy` module, on the shared staged-build core `js/worlds/mech/stages.js` written for w8),
`js/worlds/w9.js`, `tools/policies/energy.mjs`, `tests/w9.test.mjs`. Replaces the TUNE values above where they differ. The world's
`mechanic` is `energy` (one module: it reuses `stages.js`, not the w8 `projects` module — no presales, so nothing of it applies).

| item | as built |
|---|---|
| draws (`world`) | **8 at init** (the sealed fate of up to 2 starting projects, 4 each — every character draws 8), **10 per payday** (spot noise — whose low digits also move the policy rate — the spike draw, and one capacity-factor draw for each of the 8 plant slots, empty slots included), **4 per `V` landing** (permit months, overrun, build delay + its stage, the site's resource quality / the kibbutz's vote) |
| board | 8 × `V` "אתר אנרגיה" (module tile, safe = `pass`; type `powerSite`) + 11 × `O` (3 grid-slot cards ₪3–5M, an operating 40 MW PPA plant for sale, a transmission-line share, a green-hydrogen pilot, index funds; golden: a 50 MW PPA plant from a distressed seller) |
| sites (`w9.sites`) | solar 20 / 40 / 50 / 100 MW (₪66M / 140M / 170M / 320M), wind 60 MW ₪330M, storage 25 / 50 MW (₪60M / 115M), hybrid solar + storage 40 MW ₪185M |
| technologies | CF solar 0.24, wind 0.33 (seasons: solar 0.86–1.12, wind 0.92–1.10; monthly slot noise 0.9–1.1; quality 0.88–1.12 sealed); opex ₪/MW/month solar 6,000 · wind 13,000 · storage 4,000 · hybrid 8,500; stages × 2 months: solar 4, wind 6, storage 3, hybrid 5; sealed permits solar 2–6, wind 3–8, storage 1–4 months |
| build | development 5 % of capex paid at the landing (the first equity); **equity 25 %** (spec 30 % — TUNE) then the construction loan at rate + 2.5 %/yr (capitalised) — **the loan gate is a grid slot**: a project without one stalls as soon as a stage month needs the loan (contractor standby 5 % of the month in cash); sealed overrun 0–15 %, delay 0–3 months; 3 months stuck on equity → the bank sells it to a rival at 70 % of cost |
| grid slots | `O` cards (fee ₪3–5M; the rival draws contest them like any deal; the guide buys one when a project would wait) or `Z:applySlot` (₪1M, arrives after a fixed public 9 months, ≤ 2 queued; the grid engineer pays 25 % less); consumed when construction starts; ≤ 2 free; `Z:sellSlot` at 110 % |
| V tile options | `check` (resource study ₪250k → quality ± 3 %), `build`, **`partner`** (new: a 49 % partner pays 49 % of the development and every equity call and owns 49 % of the plant), `pass` |
| completion | the construction loan becomes a **floating** term loan (rate + 1.5 %, 228 months; payment re-amortised every month); PPA = **85 % × the 12-month average spot** (storage: a tolling fee = 85 % of its expected spread revenue) × the regulator's cut; merchant = spot × capture |
| power market | spot mean ₪355/MWh × cycle demand (exp 1.06 · slow 1 · rec 0.9 · recov 0.96) × carbon; reverts 18 %/month, ± ₪26 noise, 7 % spike months (+40 %); solar capture = 1 − 0.26 × (rivals' 2,600 MW + 15 MW a month + boom cards + 2 × own solar) ÷ 4,000, floor 0.55; wind 0.97; hybrid capture + 0.15; storage ₪/MW/month = 360 × spot × (0.12 + 0.8 × (1 − capture) + spike 0.25 + 0.5 × volatility) |
| rate | module policy rate 4.5 %, reverts 3 %/month, ± 0.15 a month (from the spot draw), cards +1 · +3 (shock) · −1 · −1.25; range 1.5–9 % |
| value (DCF) | expected month (bank view: merchant at the mean × 0.9) − opex, over the remaining life (240 months) at rate + **2 %** (PPA; spec premium unstated) · + 3.5 % (merchant) · + 1.5 % (line) |
| refinancing | `Z:refi` (or `:long`, + 60 months tenor): LTV × DCF − debt in cash (1 % fee); LTV PPA 75 % · merchant 60 % · line 80 % (+ 5 pp for the fund); the guide suggests it when the room is > **15 %** of the debt (spec "> 30 %" left plants idle), the rate ≤ its 12-month average + 0.5 and an equity call or a free pipeline slot needs the cash, never within 15 % of the goal |
| recovery | sell 49 % (`Z:sellStake`, 95 % of book), merchant → PPA at a 10 % discount (`Z:offtake`; a PPA is never cancelled), pause, the long tenor, sell the slot, sell a plant (95 % of value) or a project (70 % of cost) |
| goal | new registered type **`passiveTarget`** (js/worlds/goals.js): the module's `opIncome` = every plant's **run-rate** month (an average month at the site's quality; merchant at the 12-month average × today's capture; PPA at its price) − opex − today's debt service, your share, − bank-loan interest − the hydrogen burn; ≥ ₪3.5M, hold 3. The run-rate keeps a sunny month or a one-month spike from winning (the cash flow itself is the real month) |
| squeeze | (new) the plants' real month below their debt service while forced bank debt exceeds the voluntary cap by more than the month's gap: 3 such paydays within 6 → the lenders call the loans (bankruptcy) |
| characters | gridEng (ליאור): ₪25M, a 30 MW solar field in permits with its grid slot, narrower quality range (± 6 %), queue −25 % · infraFund (דוד): ₪60M, refi LTV + 5 pp, **LP pressure: 6 % of max(₪60M, net worth) every 12 paydays** · kibbutz: ₪10M, 2 own parcels (40 MW solar, 25 MW storage; land + council support count as **20 %** of capex in equity — spec "land free"), permits × 0.8, a sealed vote +1–3 months on each start; all ★ 84 / 68 / 56 |
| deck | operating 40 MW PPA plant ₪175M (₪52M down; the guide buys an operating plant only if a refinancing right after returns ≥ half the down payment), transmission share ₪60M (regulated ₪450k/month), hydrogen pilot ₪12M (−₪90k/month, 18 months, 10 % → ₪90M, else 0 — the guide passes), golden 50 MW PPA plant ₪130M |
| events | market: rate ±, rate shock +3, feed-in cut −10 % (new PPAs), heatwave +35 %, sandstorm solar −30 %, curtailment 70 % × 2 months, panel prices −12 % (new and permit-phase projects), carbon +8 % (permanent), a solar boom (+600 MW rivals), index · crises: a transformer (the largest plant off 2 months), neighbours' suit ₪1M, a military operation |
| Z actions | `offtake` · `refi` · `sellStake` · `pause` · `applySlot` · `sellSlot` · `develop` (kibbutz parcels, `:partner`) · `sellPlant` |
| lessons | `dcf_value` · `refinance` · `ppa_merchant` · `cannibalisation` · `debt_service` (js/life.js) |

Balance (tools/balance-data/gates-w9.json, N = 36 per character): guide 79 % (worst kibbutz 75 %), blind 0 %, smart 78 % vs naive 0 %,
every character ≥ 75 %, durable 97 %, median won rolls 99 (won months 68 / 68). Ablations: allPPA 35 % (−43 pp), allMerchant 48 % (−30),
neverRefi 35 % (−43), maxRefi 39 % (−39); maxDebt 78 % (bankrupt 1 %). World gates: neverRefi < 40 % **met** (35 %); maxRefi bankrupt ≥ 10 %
**not met** (3 %: a fully re-levered PPA plant keeps DSCR ≈ 1.3 at 75 % of a DCF at rate + 2 % against a loan at rate + 1.5 %, so even the
+3 shock rarely turns it negative; maxRefi loses on income, not solvency). Open: G-dom — A4 founder best in 3/3 cells (78 % vs smart 78 %: a
pipeline of 3 beats 2 in every character; only the B3_long bucket has ≥ 8 games per character).
