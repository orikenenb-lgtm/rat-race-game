# w6 · אזור התעשייה

Mechanic id `plant` · tier 6 (fork A) · unlock: ★ in w5 · minRules 6 · difficulty 3/5 · numbers TUNE.

## Story
> מפעל משפחתי בפארק תעשייה בנגב. יש הזמנות. השאלה היא אם המכונות יחזיקו, ומה עושים עם קו ייצור שעומד ריק אבל עולה כסף כל חודש.

## Visual language
- Industrial morning haze: sky `#cfd8dc → #f5f0e6`, concrete board `#d6d3cd`, steel edge `#4b5563`, safety-orange accent `#f97316` (ink `#9a3412`).
- Decor `stacks` (chimneys with steam that thickens with utilisation).
- Each line shows a **condition light** (green/amber/red) and stops its conveyor animation when it breaks down.
- 2D motif 🏭; condition is a 3-pip bar.

## Money ranges
- Start equity ₪10–20M. Lines ₪6–30M. Plants ₪30–80M.
- Fixed costs per plant ₪0.4–2.5M/mo. Contribution margin 25–45%.
- Goal NW **₪80M**. `econ`: loanUnit ₪250k, ddMinFee ₪40k, bands deal [3M, 80M].

## Core mechanic: capacity, maintenance, operating leverage
**Line state:** `{cap units/mo, cond 0–100, maint:'preventive'|'basic'|'run', shift:1|2|3, contract|null, downUntil}`.

**Monthly loop per line:**
```
demand   = contract volume (fixed) + spot orders × cycle cfOther × marketShare
output   = min(demand, cap × shiftCap[shift]) × (downUntil ≥ month ? 0 : 1)
cf       = output × (price − unitVar) − fixed − maintCost[maint] − debtService
cond    −= wear[maint] × util × shiftWear[shift]
hazard   = h(cond)   (0.5% at 100 … 25% at 20)
breakdown if worldDraw[slot] < hazard → down 1–3 months (from the same draw), repair ₪ = 4–10% of line value,
          contract penalty if contracted
```
- `maintCost`: preventive 0.6%/mo of line value, basic 0.25%, run 0.
- `wear` per month at full utilisation: 0.8 / 2.0 / 4.0 points.
- `shiftCap`: 1.0 / 1.4 / 1.7. `shiftWear`: 1.0 / 1.5 / 2.2. Shifts 2 and 3 also cost 🔋 (the existing energy layer: ops focus).

**Fixed draws:** 6 line slots × 1 `world` draw per payday (empty slots still consume theirs). Breakdown timing is therefore shared
by seed, and a well-maintained line simply has a lower hazard against the same draw. That keeps it fair and skill-dependent.

**Decisions:**
- Maintenance policy per line (`Z:maint`): spend now or pay later through downtime and value.
- Shift (`Z:shift`): a cheap capacity spike with hidden wear and 🔋 cost.
- **Contract vs spot** on 'O' contract cards:
  - A 24-month contract: fixed volume at −12% price, penalty 3× margin per undelivered unit.
  - Spot orders follow the cycle: +price in a boom, collapse in a recession.
  - Operating leverage makes this a real bet.
- **New line** (deal): pay 30% deposit and the rest on delivery after 6 months (a pending asset, value = deposit). A long commitment.
- **Used line** (cheaper): condition hidden → dd inspection reveals a range (`systems.dd` pool `machine`).
- **Valuation** (goal): `a.goalValue = sustainableProfit × multiple(5–7 by cycle) × (0.6 + 0.4 × cond/100) − debt`. Deferred maintenance shows up as lost value at the moment that matters.

## Mapping
| need | existing | new |
|---|---|---|
| demand swings | `cycle.js` cfOther / dealCost | spot price per kind |
| used-machine inspection | `dd.js` | `machine` flag pool, condition range reveal |
| capacity and staff | `business.js` capacity / staff concepts (formula reused, not the full sim) | the line model |
| energy cost spikes | market cards | `fixed` multiplier events |
| competition for contracts | `rivals.js` | a rival may take an unanswered contract (existing delay/close mechanics) |
| **new** | — | `mech/plant.js` (lines, condition, hazard per slot, maintenance/shift `Z`, contracts, lead-time orders, goalValue), indicators (utilisation, fixed-cost coverage, hazard bars), cityModels |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `opseng` | נועה, מהנדסת תפעול | 1 CNC line (cond 90), cash ₪6M | sees exact hazard %; preventive maintenance −25% cost | small; little cash for expansion |
| `heir` | יוסי, יורש המפעל | food plant ₪45M (debt ₪30M, cond 45, union contract fixed +15%) | big base, existing contracts | old lines (breakdowns soon); fixed costs can't be cut for 12 months |
| `trader` | רוני, סוחר מתכות | cash ₪15M, no plant | spot orders at +5% price; negotiation +1 | no capacity: must buy or build; a new line takes 6 months |

## Assets and deals
- CNC line ₪8M, plastics injection ₪15M, food plant ₪45M, recycling plant ₪25M (counter-cyclical spot), metal shop ₪6M.
- Logistics warehouse ₪10M (rent, no condition).
- Rooftop solar ₪3M (cuts fixed energy −8% on that plant).
- Automation upgrade (U-style card: −20% unitVar, capex ₪4M).
- Traps: a "bargain" used line (cond 25), a plant with a single customer (contract ends in month 6).

## Unique events
- Electricity tariff spike (fixed +12%, 6 months).
- Skilled worker shortage (shift 3 unavailable for 4 months).
- An export order from Germany (big spot order, needs spare capacity now).
- Raw-material shortage (output −30%).
- A safety inspection (lines with cond < 30 must stop 1 month).
- An automation grant (government pays 20% of an upgrade).
- The biggest customer goes bankrupt (receivables loss).

## Risks
- High fixed costs in a recession.
- A run-to-failure cascade.
- A contract penalty during a breakdown.
- A capex commitment arriving in a downturn.

## Recovery
- Mothball a line (fixed −60%, cond frozen, restart cost).
- Sell a line to a rival at 70% of value.
- Sale-and-leaseback of the building.
- Renegotiate a contract (negotiation, may fail).
- Factoring receivables (cash now −3%).

## Lesson
"קיבולת שלא מנוצלת עולה כסף כל חודש. תחזוקה שנדחית לא נחסכת: היא חוזרת עם ריבית, כתקלה, וכשווי נמוך יותר ביום המכירה.
מינוף תפעולי מגדיל רווח בגאות ומכה בשפל."

## Goal and stars
- Goal: NW ≥ ₪80M (with `goalValue`), hold 2.
- Stars: ★ 72 · ★★ 58 · ★★★ 46, plus happiness, fund, and no safety-inspection stop in the last 12 months.

## Solo / online / competition
- Breakdown and demand draws are shared. Contract cards are drawn at the landing (rival draws as today).
- Safe options: `decline` / `run` keeps the current policy.
- Rank: months → NW/target.

## Sim policies and gates
- `smart`: preventive on lines with util > 70%, basic otherwise; shift 2 only in a boom; contract ≤ 60% of capacity.
- Ablations `runToFailure`, `preventiveAlways`, `contractAll`, `spotOnly`, `shift3Always`. Each must lose to smart by ≥ 5 pp.
- World gate: `runToFailure` has a better median NW at month 24 **but** a worse in-time rate. The lesson must be visible in the data.

## Size
L. `mech/plant.js` ~800 lines, data ~350, tests ~450.

## As built (rules 6 — commit 7c17553 + the housekeeping pass)

Shipped values in `js/worlds/mech/plant.js` / `js/worlds/w6.js`; they replace the TUNE values above where they differ.

| item | as built |
|---|---|
| draws (`world`) | 6 per payday (one per line slot, empty slots too), 3 per `C` landing, 0 at init |
| maintenance cost (of line cost / month) | preventive 0.8% (opseng −25%) · basic 0.25% · run 0 |
| wear (points / month at full use) | preventive 0.25 (cond capped at 95) · basic 1.0 · run 2.2; × max(0.3, utilisation) × shiftWear |
| shifts | capacity 1.0 / 1.4 / 1.7 · wear 1.0 / 1.5 / 2.2 · fixed ×1.0 / 1.15 / 1.4 · 🔋 −1 / −2 per line (max −4) |
| hazard (monthly) | cond 0 → 30%, 20 → 17%, 40 → 7.5%, 60 → 3%, 80 → 1%, 100 → 0.3% (linear between) |
| breakdown | down 1–3 months and repair 4–10% of cost from the same draw; cond +20 (max 85) |
| contract (`C` tile) | 24 months, 30–70% of one-shift capacity, price −15% (counter −8%, chance 45% / trader 65%), penalty **1.5 ×** margin per undelivered unit (spec 3 ×: bankrupted a stopped food plant in one month) |
| valuation | normal-month profit × 12 × multiple (exp 6.4 / slow 6.0 / rec 5.4 / recov 5.8) × (0.6 + 0.4 cond/100), floor 30% × cost × cond; mothballed × 0.8 |
| recovery | overhaul 8% of cost (1 month down, cond 95) · mothball fixed × 0.4 (restart 2%) · sell to a rival 70% of value · leaseback 25% of cost cash, rent 0.9%/mo of that · factoring 3% · renegotiate 50% (+20 pp trader) |
| upgrades | automation max(₪1M, 20% cost), variable −8%, grant −20% · solar max(₪0.5M, 6% cost), fixed −8% |
| characters | opseng cash ₪13M + CNC ₪8M (debt ₪3M, cond 90), ★ 80 / 64 / 50 · heir food plant ₪45M (debt ₪28M, cond 45, union +15% fixed, 18-month contract 50% at −5%, 12-month lock), cash ₪2.5M, ★ 72 / 60 / 46 · trader cash ₪15M, spot +5%, ★ 76 / 62 / 48 |
| safety inspection | market card: lines with cond < 30 stop for the month; a stop is recorded (`world.insp`) |
| ★★★ | months ≤ t3, happiness, 3-month fund **and no safety-inspection stop in the last 12 months** — the module star gate `starGates` (engine `buildEnd`, generic; result `starsBlockedBy: {id, label}`) |

Balance (tools/balance-data/gates-w6.json, N = 36 per character, after the housekeeping pass): guide 64 % (worst opseng 58 %), blind 2 %,
smart 67 % vs naive 1 %, every character ≥ 58 %, durable 99 %, median won rolls 87; maxDebt 66 % in time = smart − 1 pp (was +7 pp: smart now
overhauls a worn line when the restored value is ≥ 2 × the overhaul, on a bank loan if needed; the panel badges an overhaul at ≥ 3 × with no
contract running, or below cond 45). Ablations runToFailure −54, preventiveAlways −11, spotOnly −9, shift3Always −31, contractAll −3 pp.
Open: A4 — the gambler archetype is best in 3/3 cells (not reachable without changing the shared archetypes); contractAll Δ 3 pp (< 5).
