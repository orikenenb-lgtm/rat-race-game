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
