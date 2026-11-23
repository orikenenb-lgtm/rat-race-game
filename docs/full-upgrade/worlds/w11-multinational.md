# w11 · התאגיד הבינלאומי

Mechanic id `multinational` · tier 8 · unlock: ★ in any two of w6/w7/w8 **and** ★ in one of w9/w10 · minRules 6 · difficulty 5/5 · numbers TUNE.

## Story
> החברה שלך פועלת בחמש מדינות, בחמישה מטבעות, עם ספקים בשלוש יבשות. אתה לא יכול להיות בכל מקום.
> השאלה היא את מי אתה שם שם, ואיך אתה יודע שהוא עושה עבודה טובה.

## Visual language
- World map at night: sky `#020617 → #1e1b4b`, dark-teal board `#134e4a` with a projected globe at the centre.
- Accent amber `#f59e0b` (ink `#b45309`). Decor `globe`.
- Each country is a mini-district around the board with its own flag colour and local clock.
- Supply links are arcs. A disrupted arc turns red and dims its downstream districts.
- Districts run by the player glow. Districts run by a manager show the manager's portrait token with a trust meter that fills only through audits and results.
- 2D motif 🌍.

## Money ranges
- Start equity ₪120–200M.
- Subsidiaries ₪50–400M in local currency.
- Country manager ₪120–300k/mo. Audit ₪500k.
- Goal consolidated NW **₪800M** (₪). `econ`: loanUnit ₪2M, ddMinFee ₪500k, bands deal [30M, 400M].

## Core mechanic: delegation under hidden information (+ multi-currency, supply links)
**Countries:** 5 fictionalised markets (e.g. "אירופה", "ארה״ב", "הודו", "ברזיל", "וייטנאם") with currencies EUR/USD/INR/BRL/VND.
- Each FX rate follows the w3 drift/revert model, generalised to N currencies (1 `world` draw each per payday, fixed).

**Subsidiary:** `{country, base cf (local ccy), mgr: self|{competence, integrity}, supplier: countryId, dualSource, trust}`.

```
cf_local = base × (self ? 1.0 : 0.75 + 0.5 × competence) × supplyFactor × cycle
cf_₪     = cf_local × fx[ccy]   (hedgeable per currency, w3 hedge rule)
self-run: costs 1 attention slot (3 per month) + 🔋 (existing energy); max 3 self-run subs
manager:  competence, integrity ∈ [0,1] sealed at hire (2 world draws at the hire card, fixed)
fraud:    each payday, per managed sub, a fixed world draw; if draw < (1 − integrity) × 0.04 → a fraud event
          (cash loss 1–3 months of cf, rep hit); after an audit the probability halves for 12 months
audit (dd inspect): reveals competence ±0.1 and integrity ±0.15
supplyFactor: a disruption in country X → every sub whose supplier is X runs at 0.6 (0.9 if dualSource)
```

**Decisions:**
- **Self-run vs delegate**, under 3 attention slots: the real scarce resource.
- **Hire** (pay more for a better expected manager), **audit** (cost versus knowledge), **fire/replace** (6 months of severance + a 2-month gap).
- **Dual sourcing** (`Z:dualSource`: cost +4% cf, cuts propagation).
- **Currency hedging** per currency (w3 rule).
- **Expand into a new country** (sub acquisition: a deal card with dd).
- **Repatriate cash** vs keep it local (a withholding tax of 5–15% on repatriation; local cash is FX-exposed).

## Mapping
| need | existing | new |
|---|---|---|
| FX drift, hedging | w3 `fx` (`setUsd`, hedge, `fxExposure`) | generalised to N currencies (a new module; w3's code untouched) |
| hidden quality + inspection | `dd.js` | pools `manager`, `acquisition` |
| attention and fatigue | focus + 🔋 energy (`life.energy`) | attention slots |
| rivals for acquisitions | `rivals.js` | — |
| regime | `cycle.js` per country with amp offsets (country cycles out of phase) | — |
| **new** | — | `mech/multinational.js` (countries, N-ccy fx, managers with sealed traits, fraud hazard, audits, supply graph and disruptions, repatriation), indicators (world map panel: per-country cf, trust, FX, link status), cityModels |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `ceo` | תמר, מנכ"לית | 3 subs (all self-run), ₪40M cash | +1 attention slot (4) | burnout risk if all slots are used (🔋) |
| `exporter` | יואב, יצואן ותיק | 2 subs with long-time managers (traits known), ₪60M cash | known managers; supplier relationships (disruption −50%) | concentrated in one supplier country |
| `pe` | נטע, קרן רכישות | ₪180M cash, no subs | acquisitions −5% price; audit cost halved | every sub starts with an unknown manager; debt-funded (higher rate) |

## Assets and deals
- Subsidiary acquisitions (manufacturing in Vietnam, retail in Europe, software in the US, distribution in Brazil, services in India).
- A regional HQ (+1 attention slot, fixed ₪400k/mo).
- An ERP system (audits −50%, fraud −30%).
- A logistics hub (dual source at +2% instead of +4%).
- Traps: a fast-growing sub with a star manager (integrity sealed low), a cheap acquisition in a currency at a 10-year high.

## Unique events
- A port closure (supply disruption, 2 months).
- New tariffs between two countries.
- A currency crisis in one country (FX −25%).
- A star manager poached by a rival.
- A regulator fine (if integrity low).
- A political election (cycle shift in one country).
- A global shipping-rate spike.

## Risks
- Spreading attention too thin (burnout).
- Trusting unaudited managers.
- A single-supplier dependency.
- Currency concentration.
- Cash trapped abroad.

## Recovery
- Audit and replace.
- Sell a sub (to a rival, at 70–90%).
- Hedge.
- Dual-source.
- Repatriate cash before a currency crisis.
- Close a country (severance).

## Lesson
"מי שגדל מעבר לכוחות שלו חייב לסמוך על אחרים, וגם לבדוק אותם. ופיזור בין מדינות עוזר רק אם הספקים שלך לא עוברים כולם באותו נמל."

## Goal and stars
- Goal NW ≥ ₪800M consolidated (₪ at the current FX), hold 2.
- Stars: ★ 84 · ★★ 68 · ★★★ 56, plus happiness and fund.

## Solo / online / competition
- FX draws, fraud draws (per sub slot, fixed 6) and manager traits at the hire card are all shared.
- Safe = keep the current manager, no audit.
- Rank: months → NW/target. Sealed traits are redacted in rooms (`assets[].mgr.integrity`).

## Sim policies and gates
- `smart`: self-run the 2 largest subs; audit every new manager within 3 months; dual-source the top supplier link; hedge currencies over 25% of cf.
- Ablations `selfRunAll`, `delegateAllNoAudit`, `auditEverything`, `noHedge`. Each must lose to smart by ≥ 5 pp.
- World gate: `delegateAllNoAudit` suffers ≥ 1 fraud in ≥ 40% of games.

## Size
XL. `mech/multinational.js` ~1,000 lines, data ~400, tests ~600.
