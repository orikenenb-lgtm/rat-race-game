# w19 · פעמון הבורסה

Rule adapter `bell` (`js/worlds/adapters/bell.js`, `uses: ['market', 'plant', 'chain']`) · tier 9 · unlock: ★ in one of w11 / w14 / w15 ·
minRules 7 · difficulty 4/5 · numbers TUNE. Spec: CATALOG-25 §1.4 (w19 card), §2.2, §6.3 (`W19-guide`, `W19-buyback`). This file is the
**as built** record (engine lane, wave A4).

## Story
> החברה שלך עולה לבורסה. מעכשיו יש לה מחיר בכל חודש, ולכל מספר שתבטיח יש קהל שבודק אותך.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/bell.js` | rule adapter `bell` (tile `W` רכישה משלימה), all state in `st.world.bell` | 180 lines (V-adapter ≤ 350) |
| `js/worlds/w19.js` | world data, characters, decks, `lessonDefs` | 129 lines |
| `tools/policies/bell.mjs` | sim plug-in + `W19-guide`, `W19-buyback` | 79 lines |
| `tests/w19.test.mjs` | 11 tests | — |

`tools/sim.mjs`: `bell` in the plug-in list; `modForced` = activist campaigns. No validator check added: the world names no company.

### The catalog's composition, as built
- `market.issuer`: **re-implemented in the adapter**, not as an option of `js/worlds/mech/market.js` — adding it there would re-pin the w10 /
  w15 / w16 packs and put the issuer inside the 69-draw `exch` stream. Your price = (trailing 12-month EBITDA × the sector multiple ×
  credibility × (1 + mood + the guidance premium) − net debt) ÷ shares; "peers" = the same EBITDA at the multiple with neutral credibility and
  mood. Sector regimes bull ×10 / normal ×8 / bear ×6 (1 draw a payday).
- `plant.light()` / `chain.light()`: these exports do not exist; each division is one EBITDA line (±12 % monthly noise, growth capex at 5 ×
  monthly EBITDA → +8 % six months later, once per 4 paydays; a division sale at 0.9 × its EBITDA × the multiple).

### Fixed draws (stream `world`)
init **2** (the sector · a seed) · payday **5** (one EBITDA draw per division · the sector · the mood noise · an event target) · `W` landing
**3** (division + size · sealed quality 0.8–1.2 · price factor 0.75–1.05).

### Economy (TUNE)
- Company cash flow: EBITDA − 20 % maintenance − 6 % interest − 20 % tax − ₪2M head office; a revolver covers a shortfall.
- **Guidance** (listed): every 3 paydays the quarter's EBITDA vs the guide = consensus (3 × today's EBITDA × 0.97) × 0.92 / 1.00 / 1.08
  (low / mid / high). The guide's premium is priced while it stands: low −10 %, high +6 %. Beat: mood +0.02 (+ up to 0.1), credibility +0.02
  (× 0.3 for a low guide); miss: mood −0.05 − 0.8 × the shortfall, credibility −0.08. Credibility 0.6–1.2 → × 0.85–1.15; mood ±0.35,
  decays 20 % a month. The listed characters inherit a **high** guide from the previous management.
- **Capital:** IPO 20 / 30 / 49 % new shares at 0.9 × the price (once) · buyback 2 % at the price × 1.03 (refused past 4 × EBITDA) ·
  dividend 2 % of equity value (once per 6 paydays; your share in cash) · secondary 5 % at 0.95 (mood −0.05) · repay debt from company cash.
- **Activist:** when the price < 75 % of peers (once a year): a forced dividend of 3 % and credibility −0.05. The family (familyBoard)
  loses 0.02 credibility a payday without a dividend for 12 months.
- **Tile W (רכישה משלימה):** 8–20 % of today's EBITDA at the sector multiple × 0.75–1.05; pay in cash + debt (refused past 4.5 ×) or in
  new shares at today's price (listed only); its sealed quality 0.8–1.2 scales the EBITDA you actually get.
- **Characters:** founderCeo (EBITDA ₪11M/mo, debt ₪250M, 80 %, private, credibility 1.1) · familyBoard (₪12M, ₪200M, 60 %, listed,
  wants dividends) · turnaroundCeo (₪14M, ₪440M, 70 %, listed, credibility 0.7).

### Goal
`all` hold 3: `modValue stakeMkt` ≥ ₪1.5B (your shares × the price; 0 before the IPO) · `modValue netDebtEbitda` `cmp: 'le'` 3. maxMonths
66 (★★ 58, ★★★ 50). In net worth, a private stake counts at 70 % of the formula price.

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w19`, 283 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper / smart | 85% | 100% | 54 | 0% |
| blindTapper | 1% | 1% | 51 | 0% |
| naive | 0% | 0% | — | 0% |
| saver | 0% | 9% | 96 | 0% |
| founder | 7% | 55% | 87 | 0% |
| diversified | 60% | 100% | 64 | 0% |
| gambler | 0% | 0% | — | 0% |
| f:frugal / f:none / maxDebt | 85% | 100% | 54 | 0% |
| sandbag | 40% | 75% | 66 | 0% |
| overpromise | 21% | 65% | 76 | 0% |
| buybackAtTop | 59% | 78% | 57 | 0% |
| issueAlways | 0% | 0% | — | 0% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 85 % · worst 61 % (founderCeo 100, familyBoard 94, turnaroundCeo 61) |
| G-blind | met | 1 % |
| G-smart | met | smart 85 % med 54 · naive 0 % |
| G-reach | met | 100 / 94 / 61 % |
| G-loss | met | naive 100 % out of time · maxDebt 15 % · smart loses 15 % (nobody goes bankrupt: losses are time) |
| G-dom | **NOT met** | A4: diversified best in 100 % of 6 cells · ablation issueAlways 0 % (Δ 85 pp) |
| G-frugal | met | 85 vs 85 % |
| G-durable | met | 200 / 216 = 93 % |
| G-time | met | median 78 rolls (p10 55, p90 101) |
| W19-guide | met | sandbag 40 % · overpromise 21 % vs smart 85 % |
| W19-buyback | met | buybackAtTop 59 % vs smart 85 % |
Open: G-dom (`diversified` = smart's module play with the generic archetype's deal choices). Noted: the founder and the family win almost
always (100 / 94 %); the variance lives in the sector regime and the turnaround's debt. Tuning history: the first pass had sandbag beating smart
(the miss cost > the low guide's discount) → the consensus shaded to 0.97, the low guide −10 %, misses cheaper; then smart won 100 % in 37
months → beats smaller, credibility range narrower, the old management's high guide, maxMonths 84 → 66, the buyback's 3 % impact.

### Registration
`LAZY_IDS` + `js/worlds/all.js` + meta (tier 9 ← 1 of w11 / w14 / w15, status lazy, playable) + SQL draft row (unranked, never applied) +
sim plug-in list + re-pin: core +7 chars (885,681 / 900,000) and pack `w19` = w19.js + adapters/bell.js (34,668 chars). Lessons (with the
pack): `guidance_cred` (הדרכה ואמינות), `buyback` (קנייה עצמית) — need lessons-meta entries (UI lane; t4_meta T-M2 until then).
