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

## As built (rules 7 — engine lane, CATALOG-25 wave A3)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/mech/multinational.js` | new engine module `multinational` (tile `Z`) | 281 lines |
| `js/worlds/w11.js` | world data, characters, decks, `lessonDefs` | 141 lines |
| `tools/policies/multinational.mjs` | sim plug-in + `W11-fraud` | — |
| `tests/w11.test.mjs` | 14 tests | — |

Verifier pack `w11` = the 2 js files, 50,479 chars (25.2 % of 200,000). Core grew by 7 chars (885,625 → 885,632): `'w11'` in `LAZY_IDS`.
No content pool (the legacy decks serve `O`); minRules 7, no lazy stream.

### Fixed draws (stream `world`)
- init **18** — per sub slot (6): quality, competence, integrity — whoever plays;
- payday **14** — 5 FX · 6 fraud (one per sub SLOT, empty slots too) · 1 supply disruption · 2 for the month's manager candidate;
- `Z` landing **4** — template / size / price jitter · sealed quality · incumbent's competence · integrity.

### Economy (TUNE)
- 5 countries (אירופה יורו, ארה״ב דולר, הודו רופי, ברזיל ריאל, וייטנאם דונג), withholding tax 5 / 8 / 15 / 12 / 10 %.
- FX index per currency: `fx += 0.06 × (anchor − fx) + vol × 3.4 × (draw − 0.5)`, clamp 0.55–1.6; the anchor trends 0 / +0.1 / −0.6 / −0.7 / −0.4 % a month.
  A hedge books the currency at a rate that rolls 1/12 toward spot each month (cost 0.5 % of that country's profit).
- 8 fictional subsidiary templates, each with a supplier country ≠ its own. A sub's local profit a month =
  `base × eff × supply × events × cycle` (country cycles: a 24-month triangle wave, out of phase); eff = 1.1 self-run, `0.55 + 0.7 × competence`
  with a manager (× 0.85 in a month right after a second audit within 6 months; 0.7 during a 2-month handover or with no manager).
- ₪ profit = local × booked rate − manager wage (₪150k + ₪200k × shown competence) − second source (4 % of base, 2 % with the hub) − hedge cost;
  sent home minus withholding (or kept abroad: no tax, counts at spot, `repat` later). Acquisition loan service is deducted from the sub's cash flow.
- **Value** (net worth) = 32 × the trailing 12-month local profit (the purchase estimate fills months not yet seen) × the booked rate — the truth reaches
  the books only as it is earned. Organic growth 0.3 %/month.
- Attention: **2** self-run subs (CEO 3, +1 with the regional HQ); 3+ self-run subs cost 🔋 3 per sub beyond 2 every payday.
- Fraud: per managed sub, `draw < (1 − integrity) × 6 %` (× 0.4 for 12 months after an audit, × 0.7 with the ERP) → a loss of 4–8 months of its
  profit, a negative month in its books, happiness −3, the shown integrity capped at truth + 0.1.
- Supply: a disruption (12 %/payday, one country, 2 months) runs every sub supplied from there at 60 % (90 % dual-sourced, 80 % for the exporter).
- Acquisition card `Z`: price = 32 × estimate × FX × (0.95–1.15) (−10 % for the fund); size 0.7–1.6 × the template × (1 + month / 60); 35 % down,
  65 % an acquisition loan on the sub (0.6 % interest + 1 % of principal a month); the shown profit range (±25 %) contains the sealed truth
  (quality 0.55–1.25); due diligence (₪500k, half for the fund / with the ERP) narrows it to ±6 % and shows the manager ±0.1 / ±0.15 and keeps the card
  open. Incumbent managers: competence 0–0.85, integrity 0.2–1. Guide pick: check first; buy only when the fair value at the middle of the range covers
  the price and the low end covers 85 % of it, within the budget (cash + local cash + loan room − 3 months of fixed costs − ₪2M).

### Z actions (`act`, ≤ 40-char params)
`self s<id>` (6 months severance) · `hire s<id>` (the month's candidate, ranges ±0.25 / ±0.3, a 2-month handover; one a month) · `audit s<id>` ·
`dual s<id>` (toggle) · `hedge <c>` (toggle) · `keep <c>` (toggle) · `repat <c>` · `grow s<id>` (3 months of profit for +10 %, once in 6 months) ·
`sell s<id>` (80 % of value minus its loan) · `hq` (₪12M + ₪400k/month, +1 slot) · `erp` (₪8M) · `hub` (₪10M).

### Characters
| id | icon | cash | start NW | rule |
|---|---|---|---|---|
| `ceo` | briefcase | ₪40M | ≈ ₪151M | 3 self-run subs (US software, EU retail, VN components); 3 attention slots |
| `oldExporter` | ship | ₪60M | ≈ ₪155M | 2 subs with KNOWN managers (traits shown exactly), both supplied from וייטנאם; disruptions hit at 80 % |
| `pe` | chart | ₪200M | ₪200M | no subs; acquisitions −10 %; audits / due diligence at half price |

(`exporter` is w3's id — ids are global — so the doc's `exporter` became `oldExporter`.)

### Goal and stars
`nw` ≥ ₪800M, hold 2. maxMonths 84, ★★ ≤ 68, ★★★ ≤ 56.

### Lessons (`lessonDefs`)
`trust_verify` לסמוך ולבדוק · `supply_chain` נמל אחד, הרבה חברות · `trapped_cash` כסף כלוא בחו"ל.

### Gates (N = 36 per character, rules 7, `tools/balance-data/gates-w11.json`)
| gate | status | numbers |
|---|---|---|
| G-guide | met | 88 % · worst 64 % · ceo 100 % oldExporter 100 % pe 64 % |
| G-blind | met | 0 % |
| G-smart | met | smart 88 % med 72 · naive 6 % med 107 |
| G-reach | met | ceo 100 % · oldExporter 100 % · pe 64 % |
| G-loss | met | naive 94 % · maxDebt 15 % · smart loses 12 % |
| G-dom | **NOT met** | cells 3: gambler 100 % · ablations selfRunAll 88 % (Δ 0 pp) · delegateAllNoAudit 61 % (Δ 27) · auditEverything 87 % (Δ 1) · noHedge 85 % (Δ 3) |
| G-frugal | met | 88 % vs 88 % |
| G-durable | met | 214 / 214 |
| G-time | met | median 99 rolls (p10 86, p90 126) · median won months 72 |
| W11-fraud | met | delegateAllNoAudit ≥ 1 fraud in 66 % (in time 61 %) · smart 17 % |

G-dom is open (allowed alone): self-running everything ties smart (smart already fills attention with the biggest subs and replaces a manager only
rarely), audits and hedges are worth months, not in-time points, at this scale, and gambler (buys every acquisition) is the best archetype in all
3 cells. G-time sits at the edge (99 of ≤ 100 rolls). A re-tune should give replacement / hedging more weight before re-running.

### Deviations from the doc
- Attention slots 2 (CEO 3) instead of 3 (CEO 4); the doc's 3 left too few delegated subs for delegation to matter.
- Self-run efficiency 1.1, not 1.0; manager efficiency 0.55 + 0.7 × competence (not 0.75 + 0.5); fraud loss 4–8 months (not 1–3); fraud 6 %, audit
  cut × 0.4 (not halved).
- Added: acquisition financing (35 % down), `grow` (capex), FX anchors with EM trends, the audit drag; the candidate pool is one candidate per payday
  (2 fixed draws) instead of hire-card draws.
- The doc's "rival buyer at 70–90 %" is a fixed 80 %. Political elections shift one country's cycle by half a period; tariffs hit one supplier
  country's links (−15 %, 6 months); a currency crisis hits the currency at the highest level (−25 %).
- No content pools (`manager`, `acquisition`): the acquisition card is the module tile; managers come from the payday candidate.
