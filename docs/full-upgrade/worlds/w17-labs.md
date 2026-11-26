# w17 · גבעת המעבדות

Rule adapter `trials` (`js/worlds/adapters/trials.js`, `uses: ['stages', 'market', 'dd']`) · tier 9 · unlock: ★ in one of w11 / w15 · minRules 7 ·
difficulty 4/5 · numbers TUNE. Spec: CATALOG-25 §1.4 (w17 card), §2.2, §6.3 (`W17-stop`, `W17-cliff`). This file is the **as built** record
(engine lane, wave A4).

## Story
> מתוך עשר מולקולות, אחת מגיעה למדף. את הסיכוי של כל שלב כולם יודעים. השאלה היא מתי להפסיק לשלם על חלום.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/trials.js` | rule adapter `trials` (tile `V` מולקולה למכירה), all state in `st.world.trials` | 218 lines (V-adapter ≤ 350) |
| `js/worlds/w17.js` | world data, characters, decks, `lessonDefs` | 143 lines |
| `tools/policies/trials.mjs` | sim plug-in + `W17-stop`, `W17-cliff` | 74 lines |
| `tests/w17.test.mjs` | 13 tests | — |

`tools/validate-worlds.mjs`: new check `T-fict` (the molecule names against `tools/data/real-names.txt`, unique). No content pool (legacy
decks serve `O` / `M` / `X` / `?`; the market and crisis cards carry `mk` keys the adapter applies).

### The catalog's composition, as built
- `stages`: **used as is** — every running stage is a `newBuild({stages: 1, stageMonths, cost, eqReq: 1})` record stepped by `buildMonth`
  once a payday with the player's cash (no cash → the stage stalls, `stalls` counts); `costToComplete` / `pctDone` feed the panel and the guide.
- `market`: only the biotech-sector regime (bull ×1.3 / normal / winter ×0.6 on licensing upfronts and bought candidates), re-implemented
  in the adapter (the `market` module lists equities and draws 69 a payday from its own stream).
- `dd`: the V card's due diligence (₪2M) narrows the sealed quality from ±10 pp to ±3 pp (like w14's credit committee).

### Fixed draws (stream `world`)
init **8** (one per slot: a starting candidate's sealed quality and its band jitter) · payday **10** (one per slot — a readout or a finished
discovery uses it, otherwise it is spent unused · the sector regime · the CRO-crisis target) · `V` landing **3** (template, quality + jitter,
stage + price factor).

### Economy (TUNE)
- **8 candidate slots.** Stages: phase I 4 months ₪8M · phase II 6 months ₪24M · phase III 9 months ₪60M · approval 4 months ₪8M (× the
  molecule's cost multiplier 0.6–1.3).
- **8 fictional molecules** (area · printed odds · peak sales a month · patent months after approval): אונקופין onc 60/40/60/90 ₪48M 60 ·
  רמיטל rare 75/55/70/92 ₪21M 84 · סרבלין neuro 55/30/50/88 ₪72M 60 · קרדיון cardio 70/45/65/90 ₪39M 48 · אנטיבר antibiotic
  75/50/70/92 ₪8M 48 · דרמלון derm 70/50/65/90 ₪14M 36 · אימונקס immu 65/40/60/90 ₪45M 60 · מטבוליס metab 65/45/65/90 ₪30M 60.
- **Sealed quality** q ∈ [−10, +10] pp shifts every stage's odds (a safety signal moves q and the shown band by −8 pp together). Shown band: the prior ±10 pp; due diligence ±3 pp; every passed readout
  halves it (×½, ×¼, ×0.1); the band always contains q (a sealed jitter places it). The scientist sees her own molecules exactly.
- **At a readout** (the slot's payday draw < printed odds + q): pass → the next stage waits for a decision (`dec`); fail → a cracked flask
  for one payday, then the slot is free (the money spent is lost). Decisions (Z): `go` (pay the next stage), `stop` (5 % salvage), `license`
  (upfront = P(launch) × value × [5 / 15 / 30 / 40 %] by stage × the sector × 1.2 for the pharma veteran; royalty [4 / 6 / 10 / 13 %] of
  sales; the partner pays every later stage — also mid-stage, as a recovery), `partner` (co-development: half of every later stage, half
  of the profit).
- **The guide's value of `go`** is the real-option value: backwards from launch, every later stage is worth max(0, odds × value after it −
  its cost); the stage in front of you is paid. Sunk cost never enters it (tested).
- **Drugs:** ramp to peak over 9 months; profit = sales × (60 % margin + 8 % with the plant) × the pricing level × the competitor share;
  after the patent cliff sales × 0.2. Value = 5 × the trailing annual profit (the last 6 months × 2), never more than the years left to the
  cliff (≥ 1); a new drug keeps its cost basis until it has 6 months of sales. Royalty sale: 30 % of a drug's profit for 30 % × value × 0.9.
- **Plant** ₪60M (+8 pp margin on own drugs, ₪0.6M a month, kept at 70 % in NW, sold at 70 %). **Discovery** ₪8M, 4 months, a random
  template on the slot's draw. Lab overhead ₪0.8M a month.
- **Tile V (מולקולה למכירה):** a template and a stage (I 35 % / II 40 % / III 25 %; the investor's network: 15 / 35 / 50 %) at
  0.9 × the public real-option value × the sector × a 0.9–1.1 factor (the investor pays 40 % less). Options: due diligence, buy (into a
  free slot; cost basis = the price), pass (safe).
- **Events:** competitor approval (an area's drugs × 0.6 share), safety signal (an area's live candidates −8 pp), fast track (−2 months),
  generic challenge (an area's cliffs 12 months earlier, also for drugs approved later), pricing reform (−15 %, floor 70 %), bull / winter;
  crisis: a CRO failure (+3 months on a slot chosen by the payday's target draw — never by holdings).
- **Characters:** scientist (₪220M cash, 4 own molecules at phases I–III, sees their quality) · pharmaVet (₪60M cash, a heart drug at
  peak with its patent ending in 12 months, 2 candidates; licensing +20 %) · bioInvestor (₪380M cash, nothing in the lab; 40 % cheaper
  purchases and later-stage deals).

### Goal
`all` hold 2: `nw` ≥ ₪1.2B (the lab asset = the pipeline at cost + drugs at value + the plant) and `modValue productsEarning` ≥ 2 (approved
drugs, own or licensed, that earned last payday). maxMonths 84 (★★ 72, ★★★ 60).

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w17`, 303 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper | 63% | 74% | 51 | 2% |
| blindTapper | 0% | 0% | — | 0% |
| naive | 17% | 27% | 56 | 8% |
| smart | 62% | 72% | 51 | 2% |
| saver | 49% | 64% | 55 | 0% |
| founder | 21% | 26% | 55 | 8% |
| diversified | 48% | 56% | 53 | 0% |
| gambler | 19% | 25% | 46 | 12% |
| f:frugal / f:none | 62% | 72% | 51 | 2% |
| maxDebt | 60% | 76% | 50 | 2% |
| neverAbandon | 19% | 26% | 58 | 13% |
| abandonAll | 0% | 0% | — | 44% |
| licenseAll | 1% | 6% | 133 | 0% |
| noPipeline | 7% | 15% | 85 | 1% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 63 % · worst 50 % (scientist 67, pharmaVet 72, bioInvestor 50) |
| G-blind | met | 0 % |
| G-smart | met | smart 62 % med 51 · naive 17 % med 56 |
| G-reach | met | 64 / 75 / 47 % |
| G-loss | met | naive 83 % (bankrupt 8 %) · maxDebt 40 % · smart loses 38 % |
| G-dom | **NOT met** | A4: saver best in 100 % of 3 cells · ablations neverAbandon 19 % (Δ 44 pp), licenseAll 1 % (Δ 61 pp) |
| G-frugal | met | 62 vs 62 % |
| G-durable | met | 151 / 158 = 96 % |
| G-time | met | median 71 rolls (p10 44, p90 131) |
| W17-stop | met | smart 62 % · neverAbandon 19 % · abandonAll 0 % · licenseAll 1 % |
| W17-cliff | **NOT met** | noPipeline winners 16: 13 % fail 24 months on (needs ≥ 40 %) |
Open: G-dom (only 3 cells have ≥ 8 saver games; `saver` = license when the value of going on is under half its cost, the safest
archetype, wins them) and W17-cliff (a `noPipeline` winner usually wins on a drug far from its cliff; the few that win on the pharma
veteran's old drug fail later, but most noPipeline games never win). The binary outcomes make the variance high: smart loses 38 %.
Tuning history: printed odds +5 pp over the catalog's example, stage costs and months cut (₪130M / 33 months → ₪100M / 23 months), the guide
caps a purchase at 25 % of NW (45 % for P(launch) ≥ 0.45) after single big purchases ruined the investor; the investor's discount and
later-stage deal flow lifted her from 13 % to 50 % (two attempts on G-guide's worst character).

### Registration
`LAZY_IDS` + `js/worlds/all.js` + meta (tier 9 ← 1 of w11 / w15, status lazy, playable) + SQL draft row (`20261125_worlds.sql`, unranked, never
applied) + sim plug-in list + re-pin: core +7 chars (885,667 / 900,000) and pack `w17` = w17.js + adapters/trials.js + mech/stages.js, 49,175 chars (24.6 % of 200,000). Lessons (with the pack):
`real_option`, `patent_cliff` (need lessons-meta entries — UI lane); the readouts and `stop` also mark the core lesson `sunk_cost` (life.js, it already has lessons-meta).
