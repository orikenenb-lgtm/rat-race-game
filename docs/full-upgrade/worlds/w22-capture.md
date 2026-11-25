# w22 · העיר החדשה

- Rule adapter: `capture` (`js/worlds/adapters/capture.js`, `uses: ['projects', 'stages', 'public', 'rate']`)
- Tier 10. Unlock: ★ in one of w12 / w18 / w19.
- minRules 7. Difficulty 4/5. All numbers are TUNE.
- Spec: CATALOG-25 §1.4 (w22 card), §2.2, §6.3 (`W22-sequence`, `W22-services`).
- This file is the **as built** record (engine lane, wave A5).

## Story
> גבעות ריקות ותוכנית מתאר. כל רכבת, בית ספר ופארק שתבנה מייקרים את כל הקרקע שעוד נשארה אצלך, אבל הריבית רצה גם על עיר ריקה.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/capture.js` | rule adapter `capture` (tile `W` הצעה לעיר); all state in `st.world.capture` | 213 lines (V-adapter ≤ 350) |
| `js/worlds/w22.js` | world data, characters, decks, `lessonDefs` | 128 lines |
| `tools/policies/capture.mjs` | sim plug-in + `W22-sequence`, `W22-services` | 75 lines |
| `tests/w22.test.mjs` | 13 tests | — |

Changes in `tools/sim.mjs`:
- `capture` is in the plug-in list.
- `modForced` = paydays with residents leaving.
- `modStat` = 1 if the game was won in time, or the city had the goal's residents at the end.

No validator check was added. The pack is w22.js + adapters/capture.js (no data file).

### The catalog's composition, as built
None of `projects`, `stages`, `public` or `rate` is imported. Their ideas are re-implemented inside the adapter, so `projects.js` / `stages.js` and the w8 / w9 packs stay untouched. `public.light()` is not a new module export.

- **Land:** 20 plots in 5 zones in a row: גבעת האורנים · עמק הנחל · מרכז העיר · רכס המזרח · שכונת הדרום. Adjacent zones are "next".
  - A plot's base = the character's base × the zone (0.85 / 0.95 / 1.25 / 0.95 / 0.8) × ± 9 % inside the zone.
  - **Plot price = base × Π(the finished amenities' factors) × the cycle (boom 1.1 / normal 1 / slow 0.88) × growth.** Growth = 1 + residents ÷ 60,000, up to × 2.
- **`stages` (amenities):** each costs its price spread month by month over its build months. One of each kind per zone. A petition holds the next build for 4 months.

  | amenity | cost | months | own zone | next zones | demand | running cost / month | capacity |
  |---|---|---|---|---|---|---|---|
  | rail station | ₪260M | 18 | × 1.5 | × 1.2 | + 0.35 | ₪0.5M | — |
  | school | ₪90M | 10 | × 1.12 | × 1.05 | + 0.2 | ₪0.8M | 15,000 seats |
  | park | ₪40M | 6 | × 1.15 | × 1.05 | + 0.15 | ₪0.2M | — |
  | hospital | ₪200M | 16 | × 1.08 | × 1.04 | + 0.12 | ₪1.5M | 30,000 beds |
  | mall | ₪120M | 12 | × 1.25 | × 1.08 | + 0.15 | −₪1M (rent) | — |

- **The sealed spill:** the effect on the next zones is the table's step × a sealed multiplier per kind (0.5–1.5, drawn at init). The **cityPlanner** sees the exact spill on the panel and the PPP card; the others see the table.
- **Residents (`projects` buyers):** a sold plot is built by its buyer and starts filling after a lag of 3–9 months (from the month's draw). It fills at 30 % of its target a month.
  - Target = 2,000 × (1 + the demand of its zone's amenities + half of the next zones' + 0.25 with a campus), capped at 5,000.
- **Property tax:** ₪150 per resident a month. The city's monthly cash = tax − running costs − the PPP shares − interest and principal − the build payments, straight to your cash.
- **`public.light` (services):** services = the average of min(1, seats ÷ residents) and min(1, beds ÷ residents).
  - Satisfaction = 10 + 70 × services + 5 per park / mall (up to 15) − 15 during a school strike.
  - **Under 50, 3 % of the residents leave each payday** and nobody moves in (lesson `build_order`).
- **`rate` (bonds):** ₪100M a step, up to ₪1.5B, 20-year amortisation.
  - Coupon = the base rate (4.5 %, ± 1 % per rate card, 2.5–8 %) + a spread on today's DSCR: 1 % (≥ 2 or no debt), 2 % (≥ 1.5), 3.5 % (≥ 1), 6 % (< 1).
  - The stock's coupon is the weighted average. Refinancing resets it to today's coupon only if that is cheaper. Repay ₪100M from cash.
  - **DSCR** = (tax − running costs − PPP shares) ÷ (interest + principal); 99 without bonds.

### The distinct rule — the sequencing externality
- **An amenity first:** everything you still hold in its zone and the next zones is repriced at once. But you pay for it, and interest runs on bonds while the city is empty.
- **Selling first:** funds the plan at low prices. A sold plot also no longer gains from what you build next.
- **Only sold plots bring residents.** Holding everything means no tax and no residents.
- **No presale threshold** (unlike w8).
- **Net worth** = cash + **held land at the zone's last clearing price** (the price today × the zone's last clearing factor, 0.9 before any sale) − bonds − loans.

### Sales
- `sell` happens at the month's clearing factor (0.86–1.10, one draw a payday).
- **Recession:** 6 months without plot sales and a slow market.
- `bundle` sells the 2 cheapest held plots to a developer at 80 %, also during a recession. The clearing factor of their zones drops to 0.8.

### Fixed draws (stream `world`)
- **init: 6** — the cycle and one sealed spill per amenity kind.
- **payday: 3** — the cycle, the clearing factor (and the next sale's lag), and an event target.
- **`W` landing: 3** — the kind (PPP 55 % / campus), the zone, and the amenity / the terms.

### Tile W (הצעה לעיר)
- **PPP:** a partner builds and funds a school / park / hospital / mall in a zone, for 20 % of that zone's tax for 10 years.
  - `take` (not if the zone already has one) / `pass` (safe).
  - The guide takes everything but a mall.
- **Campus:** an employer buys one of your plots in the zone at 60–80 % of the price; demand in that plot rises by 0.25.
  - `take` / `pass` (safe).
  - The guide passes, because it lowers the zone's clearing price.

### The guide (panel `suggested`, public data only)
1. **Services first** when the seats or beds cover < 70 % of the residents (built and coming). The school / hospital goes in the zone with the most residents to come.
2. **Otherwise** the rail / park / mall that adds the most to your held land, net of its cost (≥ 1.25 × its cost). There are none after month 54, and at most 2 builds at a time.
3. **Bonds** when the next build is short of cash and DSCR ≥ 1.8, or while the city is nearly empty (up to ₪500M).
4. **Sell** at most one plot a month, at most 4 + month ÷ 4 sold in all, and keep 4. Sell only in a zone next to a finished amenity, with no build running in it, at a clearing factor ≥ 0.95. After month 45, sell if the residents to come fall short of 60k.
5. **Repay** when DSCR < 1.7 or nothing is planned. **Refinance** when it is cheaper.

### Characters
| character | plots | base / plot | cash | edge |
|---|---|---|---|---|
| cityPlanner | 16 (4 sold before) | ₪115M | ₪150M | sees the exact spill |
| plotMagnate | 20 | ₪100M | ₪40M | the largest land bank (₪1.52B at the start's mark; the others ₪1.35B / ₪1.43B) |
| transitEngineer | 16 (4 sold before) | ₪115M | ₪100M | amenities −15 % |

### Goal
- `all`, hold 3: `nw` ≥ ₪3B **and** `modValue residents` ≥ 60,000 **and** `modValue dscr` ≥ 1.5.
- maxMonths 84 (★★ 72, ★★★ 62).

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w22`, 564 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper | 92% | 96% | 60 | 0% |
| blindTapper | 0% | 0% | — | 0% |
| naive | 0% | 0% | — | 0% |
| smart | 92% | 96% | 60 | 0% |
| saver | 0% | 0% | — | 0% |
| founder | 0% | 0% | — | 0% |
| diversified | 34% | 54% | 71 | 0% |
| gambler | 0% | 0% | — | 0% |
| f:frugal | 92% | 96% | 60 | 0% |
| f:none | 92% | 96% | 60 | 0% |
| maxDebt | 92% | 96% | 60 | 0% |
| sellAllEarly | 0% | 0% | — | 0% |
| holdAll | 0% | 0% | — | 3% |
| noServices | 25% | 37% | 73 | 0% |
| bondMax | 0% | 0% | — | 0% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 92% · worst 89% · cityPlanner 94% plotMagnate 89% transitEngineer 92% |
| G-blind | met | 0% |
| G-smart | met | smart 92% med 60 · naive 0% med — |
| G-reach | met | cityPlanner 94% · plotMagnate 89% · transitEngineer 92% |
| G-loss | met | naive 100% (bankrupt 0%) · maxDebt 8% (bankrupt 0%) · smart loses 8% |
| G-dom | **NOT met** | cells 3: saver 0% founder 0% diversified 100% gambler 0% · ablations: bondMax 0% (Δ 92 pp) |
| G-frugal | met | f:frugal 92% vs smart 92% · f:none 92% |
| G-durable | met | 200/208 = 96% |
| G-time | met | median 87 rolls (p10 79, p90 100) · median won months smart 60 guide 60 |
| W22-sequence | met | smart 92% · sellAllEarly 0% · holdAll 0% |
| W22-services | met | noServices residents missed 56% · months with people leaving in 97% of games |

**Open gates:**
- **G-dom.** `diversified` is smart's module play with the generic archetype's deal choices. The other three archetypes map to holding everything without services (saver), selling everything early (founder) and maxing bonds + taking every offer (gambler), and all three lose.

**Tuning history:**
1. The first pass taxed ₪520 per resident: a naive seller who built nothing won on tax cash alone. The tax went to ₪150, and growth became × 2 at 60k.
2. The guide sold up to 12 plots per month (one suggestion per call). It is now one a month, on a pace.
3. Parks always won on value per shekel, so the rail station was never built early. The plan now ranks by net gain on held land.
4. Residents (55–59k at the limit) were the binding part: the base went from 1,800 to 2,000 and the cap to 5,000, the lag from 6–18 to 3–9 months, and the fill pace from 15 % to 30 %.
5. The 16-plot characters' base went from ₪100M to ₪115M (NW was binding for them).
6. First full calibration (N = 36): every required gate met (the guide 92 %).

**Deviations from the catalog:**
- **Residents arrive on sold plots only.** The catalog's "demand in its radius" is read as each plot's resident target.
- **The DSCR spread** is fixed per issue and averaged into the stock.
- **Not built:** the stadium (w13 callback). The "big employer campus" is the W campus plus the employer market card.

### Registration
- `LAZY_IDS` + `js/worlds/all.js`.
- meta: tier 10 ← 1 of w12 / w18 / w19; status lazy; playable; diff 4.
- SQL draft row: unranked, never applied.
- Sim plug-in list.
- Re-pin:
  - core: +7 chars (885,702 / 900,000);
  - pack `w22` = w22.js + adapters/capture.js (35,987 chars).
- Lessons (with the pack): `land_capture` (לכידת ערך קרקע) and `build_order` (סדר בנייה). They need lessons-meta entries (UI lane; t4_meta T-M2 until then).
