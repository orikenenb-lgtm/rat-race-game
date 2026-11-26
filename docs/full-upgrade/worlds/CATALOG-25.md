# קטלוג 25 העולמות — CATALOG-25 (planning & research)

Worker: planning/research · 2026-11-24 · branch `feature/3d-world-upgrade` · docs only, no code touched.
Inputs read: `BRIEF.md`, `BRIEF-worlds.md`, `worlds/DESIGN.md`, `worlds/w5…w12-*.md`, `js/worlds/meta.js`, `js/worlds/goals.js`,
`js/worlds/mech/{index,stages,season,plant,chain,projects}.js`, `js/money.js`, `js/rng.js`, `js/finance/invest.js`, `js/engine.js` (tickers,
`tradePending`, `replay`, `st.actions`), `tools/validate-worlds.mjs`, `tools/balance-data/*` (gate ids), plus the owner's new brief
(as summarised by the director). Every number marked TUNE is a starting point for the balance worker. Nothing here is simulated yet.

## תקציר

- **25 עולמות, 12 שכבות (tiers).** w1–w8 בנויים. w9–w12 מתוכננים (יש להם מסמכים). w13–w25 חדשים וכולם מוגדרים כאן.
  כל עולם מוסיף **החלטה חדשה**, לא רק מספרים גדולים יותר.
- **ההנדסה נשארת סופית.** יש 4 מודולים בנויים ו־4 מתוכננים. מעליהם נוספים **6 מודולי מנוע חדשים בדיוק**: `market`, `auction`, `credit`,
  `platform`, `insure`, `public`. נוספות גם 2 מערכות משותפות שאינן מנגנון של עולם (`content`, `run`), ו־7 מתאמי חוקים קטנים (≤ 300 שורות כל אחד).
  כל אחד מ־13 העולמות החדשים מורכב מהחלקים האלה, ויש לו כלל אחד שמבדיל אותו.
- **הבורסה (`market`) נבנית ראשונה, בתוך w10.** אחר כך משתמשים בה w15, w16, w17, w19, w20, w21, w23, w24, w25 ומצב ההמשך.
  - היא כוללת חברות בדיוניות, ענפים, 6 מצבי שוק, אירועי חברה, פשיטת רגל ורישום חדש עם מזהה חדש.
  - נר חודשי נבנה מהמחירים שבאמת היו בחודש.
  - היא מושכת מספרים אקראיים רק מ־stream ייעודי (`exch`, אינדקס 16), תחת חוקים 7, כך ש־w1–w9 נשארים זהים בייט־לבייט.
- **מה עובר בין עולמות:** שום דבר שבתוך המשחק (מזומן, נכסים, חובות, מניות, מצב שוק). מה שכן עובר: כוכבים, פתיחת עולמות, תארים, הישגים,
  הספרייה (שיעורים), פריטים חזותיים ותוצאות עבר. (§0.2)
- **המסלול הקצר ביותר ל־w25 עובר ב־13 עולמות.** 12 עולמות הם אופציונליים. אחרי w5 אף עולם בודד לא חוסם את w25: גם w11 ו־w12 אופציונליים בדרך אליו.
- **מצב ההמשך "הכלכלה הפתוחה"** נפתח אחרי w25.
  - כל ריצה מורכבת מזרע (seed): מפה, תכונות מפה, מצב שוק, משקלי אירועים, יעד וקושי.
  - היא אף פעם לא מדורגת.
  - ההרכבה תמיד מסתיימת, והשמירה חסומה בגודל.

---

## 0. Ground rules for all 25 worlds

### 0.1 Design invariants (every world, enforced — not aspirations)

| # | invariant | enforced by |
|---|---|---|
| I1 | **Cost shown before confirming.** Every spending/borrowing/selling option carries `preview {cash, monthly, months, risk}`, and the card shows it before the tap. | validator fuzz: every option of every generated card (decks + pools + module tiles) has a non-null preview; e2e screenshot check |
| I2 | **No guaranteed-profit strategy.** No fixed policy is best in > 60 % of cells. Round-trip trades always lose fees plus spread. No pool entry has `cost ≤ 0 && cf > 0` without a sealed risk. | G-dom + world ablations; `M-roundtrip`; `C-free` |
| I3 | **No unsolvable cash lock.** From any state with cash < 0 at least one recovery action is enabled (module `recovery: [actionIds]`). A greedy-liquidate policy reaches cash ≥ 0 or a clean game end within 6 paydays. | `G-lock` probe: 500 random mid-game states per world |
| I4 | **Achievable goal for every start.** | G-reach (smart ≥ 40 % in time per character) + validator static bound |
| I5 | **Recovery paths exist and cost something** (time, stars-worth of months, dilution, discount) but never end the run silently. | per-world "recovery" lists below; G-loss requires real losses *and* recoveries observed in the sim |
| I6 | **Bigger deals AND bigger commitments, not uniform scaling.** Per tier, rise at least 2 of: median ticket ÷ start equity, months from payment to income, share of fixed commitments, number of coupled risks. Yields on equity fall (DESIGN §2). | `G-ramp2` (new, §6.3): computed from the sim per world, checked along every unlock edge |
| I7 | **Fairness in rooms.** Every sealed value is drawn with a fixed count, never conditioned on the player's holdings or choices. A market event may never target "the company you just bought". | `G-draws` (opposite policies → same stream positions), `M-target` |
| I8 | **Identity is immutable.** An accepted offer, a held asset or a held stock keeps its id, name and frozen numbers for life. Content or price updates never rewrite it. | `C-freeze`, `M-id` |

### 0.2 What carries between worlds (explicit)

| carries | does NOT carry |
|---|---|
| unlocks, ★ per world (max 75 = 25 × 3), titles, achievements, the library (lessons seen and learned), cosmetic ★★★ skins, best-months per world, profile `contentSeen` (local, display only) | cash, assets, debts, holdings, market state, companies, managers, reputation, characters, any sealed value, the seed |

- A later "קריירת טייקון" campaign with carried capital stays out of scope (DESIGN §1.4). If it is ever built, it gets its own save namespace, is never ranked and never gives ★.
- Knowledge carries through the mentor. On entry to a world, the mentor may quote a lesson the player earned earlier ("זוכר את הנזילות מ־w10?"). That changes words only, never numbers.
- Titles: keep the existing ones (0…36). Add **45 שר האוצר · 55 ברון · 65 טייטן · 75 אגדת הכלכלה**. `progress.js` nextGoal already computes the ★ total.

### 0.3 Tier rule (checked by the validator)

`tier(w) = 1 + max over clauses c of (the count(c)-th smallest tier among c.any)`. A world's `meta.tier` must equal the computed tier (new
check `V-tier`). Money scale, diff and the I6 metrics are compared along unlock edges, not by id.

---

## 1. The 25 worlds

### 1.1 Identity, modules, scale, difficulty

Scale = start equity → goal, written in `money(n,'short')` form. Modules: **bold** = first world to build that module.

| id | tier | name | one-line identity | mechanic module(s) | scale | diff |
|---|---|---|---|---|---|---|
| w1 | 1 | השכונה | משכורת, הוצאות ונכסים ראשונים | `basic` (engine) | ₪2 אלף–30 אלף → פסיבי ≈ ₪7–30 אלף/ח׳ | 1 |
| w2 | 2 | העיר הגדולה | משכנתאות וריבית שזזה | `rate` (engine) | ₪30–90 אלף → עסקאות עד ₪3 מיליון | 3 |
| w3 | 3 | הנמל הגלובלי | דולר, גידור וזהב: סופרים שווי | `fx` (engine) | ₪0.4–0.8 מיליון → ₪9 מיליון | 3 |
| w4 | 4 | עמק העתיד | צ׳קים קטנים לסטארט־אפים + השפעה | `angel` (engine) | ₪1.5–3.2 מיליון → ₪9 מיליון | 3 |
| w5 | 5 | עיר התיירות | הקיץ משלם את החורף | **`season`** | ₪3–6.5 מיליון → ₪300 אלף/ח׳ (ממוצע 12) | 2 |
| w6 | 6 | אזור התעשייה | קיבולת, תחזוקה, עלויות קבועות | **`plant`** | ₪10–20 מיליון → ₪80 מיליון | 3 |
| w7 | 6 | רשתות המסחר | צמיחה אוכלת מזומן | **`chain`** | ₪8–15 מיליון → ₪120 מיליון | 3 |
| w8 | 6 | מטרופולין הנדל"ן | מימון בשלבים ועיכובים | **`projects`** + `stages` lib | ₪20–40 מיליון → ₪250 מיליון | 4 |
| w9 | 7 | מדבר האנרגיה | לבנות, למחזר מימון, לבנות שוב | `projects`/`stages` + **`energy`** | ₪25–60 מיליון → ₪3.5 מיליון/ח׳ | 4 |
| w10 | 7 | מרכז הפיננסים | בורסה, חשיפה משותפת, נזילות, מרווח | **`market`** + **`portfolio`** | ₪80–150 מיליון → ₪400 מיליון | 4 |
| w11 | 8 | התאגיד הבינלאומי | האצלת סמכויות במידע חלקי | **`multinational`** | ₪120–200 מיליון → ₪800 מיליון | 5 |
| w12 | 9 | האימפריה | ערבות מול גידור, הדבקה | **`holding`** (+ `light()` of earlier) | ₪500–700 מיליון → ₪2 מיליארד | 5 |
| w13 | 7 | אצטדיון הכוכבים | מועדון כדורגל: מקום בטבלה = כסף | `season` + **`auction`** + adapter `league` | ₪40–120 מיליון → ₪450 מיליון | 3 |
| w14 | 8 | רובע הבנקים | אתה הבנק: מפקידים, הלוואות ובריחה | **`credit`** + `rate` cards | הון ₪150–250 מיליון (תיק ₪1.2–2.5 מיליארד) → הון ₪700 מיליון | 4 |
| w15 | 8 | מגדלי הענן | אפליקציה, שריפת מזומן, דילול | **`platform`** + `market` (regimes) | אחזקה ₪100–250 מיליון → ₪800 מיליון | 4 |
| w16 | 8 | ארץ השדות | יבול שלא ידוע מול מחיר שננעל | `season` + `market` (commodities) + `portfolio` (margin) + adapter `harvest` | ₪100–250 מיליון → ₪5 מיליון/ח׳ (ממוצע 12) | 4 |
| w17 | 9 | גבעת המעבדות | תרופות: סיכוי ידוע, מתי לעצור | `stages` + `market` + `dd` + adapter `trials` | ₪200–400 מיליון → ₪1.2 מיליארד | 4 |
| w18 | 9 | חוף הסערות | ביטוח: כסף עכשיו, סערה אחר כך | **`insure`** + `portfolio` (float) + `season` (storm season) | הון ₪300–500 מיליון → ₪1.2 מיליארד | 4 |
| w19 | 9 | פעמון הבורסה | החברה שלך רשומה למסחר | `market` (option `issuer`) + `plant`/`chain` `light()` | ₪400–700 מיליון → אחזקה ₪1.5 מיליארד | 4 |
| w20 | 10 | רחוב הקרנות | כסף של לקוחות, שורט וזרימות | `market` + `portfolio` (options `flows`, `short`) | אישי ₪50–150 מיליון, AUM ₪0.8–2 מיליארד → אישי ₪800 מיליון + AUM ₪4 מיליארד | 5 |
| w21 | 10 | בית ההשקעות הפרטי | לקנות במינוף, לתקן, למכור לפני סוף הקרן | `auction` + `credit` (covenants) + `holding` `light()` + `market` + adapter `lbo` | קרן ₪3 מיליארד → DPI 2× + אישי ₪400 מיליון | 5 |
| w22 | 10 | העיר החדשה | כל תשתית מייקרת את כל הקרקע שלך | `projects`/`stages` + `public` `light()` + adapter `capture` | קרקע ₪1–2 מיליארד → ₪3 מיליארד + 60 אלף תושבים | 4 |
| w23 | 11 | בית המסחר העולמי | פער בין היום למחר: carry, צד נגדי, עקומה | `market` (option `curve`) + `portfolio` + `credit` (counterparty) + `multinational` fx + `auction` + adapter `carry` | ₪0.8–1.5 מיליארד → ₪4 מיליארד | 5 |
| w24 | 11 | אוצר המדינה | מדינת אי: ריבית מול צמיחה, אמינות | **`public`** + `market` (regimes) + `rate` | תוצר ₪40 מיליארד/שנה; יעד ביחסים (חוב/תוצר) | 5 |
| w25 | 12 | מגדל העולם | קונגלומרט רשום: שליטה, משכון מניות, הדבקה | `holding` + `market` (`issuer`) + `portfolio` (option `pledge`) + `credit` + `multinational` fx + adapter `apex` | אחזקה ₪3–5 מיליארד → ₪10 מיליארד | 5 |

`bounds.nwMax` for w12–w25 is ≤ 1e11 (JS-safe with a ×100 margin to the validator's 1e13). Every world from w12 on needs the bigint
DB migration before ranking (DESIGN §4.6). Until then all new worlds keep `ranked:false`.

### 1.2 Goal, unlock, choice, risks, what is new

Goal types are those of `js/worlds/goals.js`, plus two small additions (§2.5): `modValue` gets `cmp:'le'`, and `maxDrawdown` is new.
"hold n" = the goal must hold for n paydays (GOAL_HOLD default 2).

| id | goal + completion rule | unlock (all clauses) | unique strategic choice | main risks | new vs the previous tier |
|---|---|---|---|---|---|
| w1 | passive ≥ expenses, hold 2 | always | buy assets vs doodads; small deals now vs save for a big one | debt, doodads, the crypto coin | — |
| w2 | passive ≥ (high) expenses, hold 3 (rules 5) | ★ w1 | fixed vs variable rate; upgrade vs cut | rate spikes | leverage and the price of money |
| w3 | NW ≥ ₪9M, hold 2 | ★ w2 | hedge or carry USD exposure; gold | FX swings | net worth instead of cash flow; one risk factor |
| w4 | NW ≥ ₪9M + impact 90 | ★ w3 | many small checks vs few big; impact vs NW | power-law zeros | two goals; patience |
| w5 | `passive12` ≥ ₪300k/mo | ★ w4 | season price plan, staff, allotments | winter cash | income varies within the year; goal on a year |
| w6 | `nw` (goalValue: profit × condition) ≥ ₪80M | ★ w5 | maintenance policy, contract vs spot, shifts | breakdowns, idle fixed cost | operating leverage; hidden debt (wear) |
| w7 | `all`: nw ₪120M + `liquidity` ≥ 4 mo | ★ w5 | expand vs consolidate; own vs franchise | working-capital crunch, span | growth costs cash; two goals in tension |
| w8 | NW (WIP at cost) ≥ ₪250M | ★ w5 | presale level, contractor, sell vs hold | sealed delays, rates | long commitments; staged financing |
| w9 | `modValue` opIncome ≥ ₪3.5M/mo, hold 3 | ★ 1 of w6–w8 | PPA vs merchant; refinance to recycle | rate shock on refi, curtailment | the longest payback; capital recycling |
| w10 | `nw` ≥ ₪400M, hold 3 (★★★ + 0 forced sales) | ★ 1 of w6–w8 | allocation across companies and classes; margin | correlated drops, margin calls, a company bankruptcy | **a real stock market**; correlation and liquidity |
| w11 | `nw` consolidated ≥ ₪800M, hold 2 | ★ 2 of w6–w8 **and** ★ 1 of w9/w10/**w13** | self-run vs delegate; audit | fraud, supply chain, FX | hidden quality of people; N currencies |
| w12 | `all`: nw ₪2B + `noDefault` 24 + `liquidity` cov ≥ 1, hold 3 | ★ w11 | ring-fence vs guarantee; annual allocation | contagion | system of systems; stability as a goal |
| w13 | `all`: nw ≥ ₪450M (squad at book) + `modValue` wageRatio12 `le` 0.70, hold 2 | ★ 1 of w6/w7/w8 | spend to cross the promotion cliff vs a sustainable wage bill; develop-and-sell vs buy stars | relegation cliff (revenue −40 %), wage lock, winner's curse in bidding | **non-linear tournament payoff vs rivals**; assets that age on a schedule and are bid for |
| w14 | `all`: `modValue` equity ≥ ₪700M + `modValue` capRatio ≥ 0.10 + `noDefault`(regulator) 12, hold 3 | ★ 1 of w9/w10 | loan pricing vs adverse selection; long fixed loans on short deposits | deposit run, concentration, rate squeeze on margin | **you are the lender**; the risk is on the funding side |
| w15 | `all`: `modValue` stakeValue ≥ ₪800M + `liquidity` runway ≥ 12 mo (or cash-flow ≥ 0), hold 3 | ★ 1 of w10/w13 | burn for growth vs runway; raise in a bubble vs wait for metrics | funding winter, down-round dilution, users that churn | **dilution as the price of growth**; unit economics revealed by cohorts over time |
| w16 | `all`: `passive12` farm income ≥ ₪5M/mo + `noDefault`(margin) 12, hold 2 | ★ 1 of w9/w10 | **hedge ratio on a harvest you can't see yet** | over-hedge in a drought, margin calls before harvest, spoilage | derivatives against an unknown quantity; a hedge that works can still drain cash |
| w17 | `all`: nw ≥ ₪1.2B (pipeline at cost) + `modValue` productsEarning ≥ 2, hold 2 | ★ 1 of w11/w15 | continue / abandon / license each phase (printed odds) | phase-III failure, burn with no revenue, patent cliff | **real options with known odds**; scheduled revenue end |
| w18 | `all`: nw ≥ ₪1.2B + `modValue` solvency ≥ 1.2 + `modValue` combined12 `le` 1.00, hold 3 | ★ 1 of w14/w16 | price adequacy vs growth; coastal concentration; how much tail to reinsure | catastrophe season, reserve shock, float crash with a storm | **cash first, cost later**; one season brings the correlated tail |
| w19 | `all`: `modValue` stakeMkt ≥ ₪1.5B + `modValue` netDebtEbitda `le` 3, hold 3 | ★ 1 of w11/w14/w15 | IPO timing and float; guidance; buyback vs dividend vs secondary | over-promising, buyback at the top, dilution at the bottom, activist | **a public price that reacts to you** |
| w20 | `all`: nw (personal) ≥ ₪800M + `modValue` aum ≥ ₪4B, hold 3 (★★★ + no gate used) | ★ 1 of w18/w19 | hug the benchmark vs active bets; short or not; gate redemptions | outflow spiral at the bottom, short squeeze, crowded trades | **other people's money**: flows amplify drawdowns; short selling |
| w21 | `all`: `modValue` dpi ≥ 2.0 + nw (personal) ≥ ₪400M, hold 2 | ★ 1 of w12/w17/w19 | how much to bid; leverage; when to exit before the fund ends | winner's curse, covenant breach, forced exit in a bad regime | **a deadline on exits**; marks don't count, only cash returned |
| w22 | `all`: nw (land at clearing price) ≥ ₪3B + `modValue` residents ≥ 60k + `modValue` dscr ≥ 1.5, hold 3 | ★ 1 of w12/w18/w19 | build first or sell first; which amenity where | empty city with interest running, selling too cheap, services lagging | **your projects raise the value of your other assets** (sequencing externality) |
| w23 | `all`: nw ≥ ₪4B + `noDefault`(margin/counterparty) 24, hold 3 | ★ 1 of w20/w21 **and** ★ 1 of w11/w16 | is the carry worth the counterparty and curve-flip risk | funding pulled in a crisis, a fraudulent counterparty, contango → backwardation | **three earlier risks in one trade** (margin + credit + FX) |
| w24 | `all`: `modValue` gdpPerRes ≥ +25 % + `modValue` debtGdp `le` 0.60 + `modValue` rating ≥ A + `modValue` satisfaction ≥ 50, hold 3 | ★ 2 of w20/w21/w22 | deficit vs austerity by phase; credibility of rules; tax mix | debt spiral (spread ↑ with debt), stop-go, satisfaction collapse | **no owner's equity**: your choices change the growth rate itself |
| w25 | `all`: `modValue` stakeValue ≥ ₪10B + `modValue` control ≥ 0.501 + `noDefault` 24 + `liquidity` cov ≥ 1, hold 3 | ★ 1 of w12/w21/w22 **and** ★ 1 of w23/w24 | fund growth by issuing shares (dilution), group debt (contagion) or pledging your own shares (reflexive margin) | pledge spiral, bank-division run, losing control | **your own share price is your collateral**; every earlier lever on one balance sheet |
| ∞ | per run (§5) | ★ w25 | per run | per run | mixes everything; never ranked |

### 1.3 Unlock graph (DAG)

```
tier 1–5   w1 → w2 → w3 → w4 → w5                                  (trunk, unchanged)
tier 6     w6 · w7 · w8                 ← w5                         (fork A, unchanged)
tier 7     w9 · w10 · w13               ← 1 of (w6, w7, w8)
tier 8     w11 ← 2 of (w6,w7,w8) + 1 of (w9,w10,w13)
           w14 ← 1 of (w9, w10)         w15 ← 1 of (w10, w13)        w16 ← 1 of (w9, w10)
tier 9     w12 ← w11                    w17 ← 1 of (w11, w15)
           w18 ← 1 of (w14, w16)        w19 ← 1 of (w11, w14, w15)
tier 10    w20 ← 1 of (w18, w19)        w21 ← 1 of (w12, w17, w19)   w22 ← 1 of (w12, w18, w19)
tier 11    w23 ← 1 of (w20, w21) + 1 of (w11, w16)
           w24 ← 2 of (w20, w21, w22)
tier 12    w25 ← 1 of (w12, w21, w22) + 1 of (w23, w24)
∞          ← w25
```

- **Acyclic and reachable.** Every clause references only lower tiers. The validator's reachability loop (`validate-worlds.mjs`) already proves both, and `V-tier` adds tier consistency.
- **Shortest path to w25 (13 worlds):** w1–w5 → w6 → w10 → w14 → w19 → w20 → w21 → w24 → w25.
  The other 12 worlds are optional. In particular w11 and w12 are **not** required for w25.
- **No single long world blocks the map after w5.** Every world from w6 on has ≥ 2 routes, except w12 (only through w11), and nothing requires w12. Validator rule 4 (DESIGN §4.4) still applies once `estMin` is measured.
- **Unchanged:** w1–w10 rules. **Changed** (planned worlds only): w11 adds w13 to its second clause. w10's mechanic becomes `['market','portfolio']`, minRules 7.
- Locked-world cards render from these rules through `unlockText()` (no code change).
- **As built w11 (wave A3, engine lane):** `js/worlds/mech/multinational.js`, goal `nw` ₪800M hold 2; gates N = 36 all met except G-dom — see `w11-multinational.md`.
- **As built w12 (wave A4, engine lane):** `js/worlds/mech/holding.js` (the seven light division models inside it), goal `all`(nw ₪2B, noDefault 24, liquidity 12 months = coverage 1.0) hold 3, maxMonths 72; gates N = 36 all met except G-dom (founder 100 % of cells, guaranteeAll Δ 2 pp) — see `w12-empire.md`.

---

## 1.4 World cards w13–w25 (atmosphere · start · economy · assets · events · goal · reward · choices · recovery)

w1–w12 are specified in `DESIGN.md` and the per-world files. The only additions are w10's market (§3) and w11's unlock (§1.3). Character ids
below are globally unique (validator rule 2). All amounts are TUNE.

### w13 · אצטדיון הכוכבים (tier 7, diff 3)
- **סיפור:** "מועדון בליגה השנייה, אצטדיון חצי ריק ואוהדים שזוכרים ימים טובים. כל מקום בטבלה שווה כסף אחר, ובין המקום השני לשלישי עובר צוק."
- **Visual:** a night match under floodlights. Pitch-green board `#166534`, stands ring, club-red accent `#dc2626` (ink `#7f1d1d`). Decor `floodlights`. Players are tokens with an age ring. The league table is a live strip. 2D motif ⚽🏟️.
- **Start (characters):**
  - `coachOwner` (former coach): sees a player's potential ±5 instead of ±15. Small cash.
  - `localTycoon`: ₪120M cash. Fans demand a star every window, otherwise happiness drops.
  - `academyDirector`: the youth academy yields 1 sealed-quality player per season. Low cash, low wages.
- **Economy:**
  - Revenue = gate (seats × price × form), TV by final rank, sponsors (content pool), prize money.
  - Wages are locked for 24–36-month contracts.
  - Players carry book value = fee − straight-line amortisation over the contract. Market value comes from rating × age curve.
  - 8 fictional clubs. One match per round is drawn from relative strength (fixed 4 `world` draws per month, one per fixture).
  - The season runs 10 months + 2 transfer windows (`season` calendar profile `league`).
- **Assets & deals:**
  - Players (bought in an `auction` vs 1–3 rival clubs, with sealed injury-proneness).
  - Loans of players, stadium expansion (`stages` light, 2 stages), training ground (+development), academy upgrade, naming rights (cash now vs 5 % of gate for 36 months).
- **Events:** injury (fixed 2 draws/month: whether + which squad slot), a star asks to leave, a rival poaches the coach, a cup run, a sponsor scandal, an FFP audit, a fan protest.
- **Goal:** NW ≥ ₪450M with the squad at book value (hype doesn't count) **and** 12-month wages ÷ revenue ≤ 70 %, hold 2.
- **Reward:** ★ opens w15 and counts for w11. ★★★ skin "אצטדיון מוזהב". Library: "צוק התגמול", "קללת המנצח".
- **Choices:**
  - Spending to reach top-2 (promotion: revenue ×1.6) is a cliff bet: one rank lower pays ×1.0, and relegation pays ×0.6.
  - Buy young and sell at the peak (trading) vs buy proven stars.
  - Bid high in a contest vs walk away.
- **Recovery:** sell a player in the window (rating × age price, −10 % if forced), loan out, sell naming rights, an owner loan (happiness cost), a wage-cut deal (the star leaves).
- **As built (wave A2, engine lane):** `js/worlds/adapters/league.js` + `js/worlds/mech/auction.js` + pool `js/content/deals-w13.js`; `modules: ['league','auction']` (the league calendar lives in the adapter; the hotel `season` module is not attached); goal targets as above; all gates met at N = 36 — see `w13-stadium.md`.

### w14 · רובע הבנקים (tier 8, diff 4)
- **סיפור:** "אתה הבנק. הכסף שלך הוא בעיקר של אחרים. מאזן אחד, עשרות אלפי מפקידים, ושמועה אחת ברשת שיכולה להוציא את כולם לתור."
- **Visual:** a stone bank street at dusk. Sandstone board `#e7d8b5`, vault-steel accent `#475569`, gold ink `#a16207`. Decor `columns`.
  Depositors queue visibly when confidence falls. The loan book shows as a stacked bar by segment. 2D motif 🏦.
- **Start:**
  - `riskChief`: exact segment PDs, a slow-growth book.
  - `familyBanker`: sticky retail deposits, an old book concentrated in developers.
  - `fintechFounder`: cheap digital growth; hot deposits that leave 3× faster.
- **Economy (`credit`):**
  - 5 segments: mortgages, SMEs, developers, consumer, corporates. Each has a sealed PD band, LGD and risk weight.
  - Deposits: retail (sticky) and wholesale (rate-sensitive).
  - Policy rate from the `rate` deck. NIM = loan yield − funding cost.
  - Provisions: expected loss booked at origination. Defaults are drawn per segment per payday (fixed 5 draws).
  - Capital ratio = equity ÷ RWA, with a regulator minimum of 8 %.
  - A confidence index drives deposit outflows. Below 30 it triggers a run event.
- **Distinct rule — adverse selection:**
  - Your loan rate vs the market rate changes both volume and the average PD of new borrowers: price above market and the good borrowers leave.
  - Long fixed mortgages on short deposits squeeze NIM when rates rise.
- **Assets & deals:** loan portfolios to buy (dd on the book), a big corporate loan (concentration), a branch network vs digital, bond holdings (w2 pricing), a failing rival's deposits (cheap funding but flighty).
- **Events:** rate shock, property slump (developer PD ×2), a big borrower default, a social-media run rumour, a regulator stress test, a rival bank failure, branch fraud.
- **Goal:** equity ≥ ₪700M **and** capital ratio ≥ 10 % **and** no regulator intervention in the last 12 paydays, hold 3.
- **Reward:** opens w18 and w19. ★★★ skin "כספת זהב". Library: "בריחת מפקידים", "ברירה שלילית".
- **Choices:** price for volume or for quality; how much maturity mismatch; when to pay dividends vs hold capital.
- **Recovery:** raise capital (dilution: issue to an investor at −15 %), sell a loan book (85–95 % of par), the central-bank window (expensive, once per 12 months), cut dividends, tighten underwriting.
- **As built (wave A3, engine lane):** module `js/worlds/mech/credit.js`, 7 draws a payday (+ a shared credit cycle and its crunch), the stock side of adverse selection (good borrowers refinance away from a bank priced above the market), a bought book's discount as a credit mark; gates N = 36: every required gate met, G-dom open (diversified 100 % of cells) — see `w14-banks.md`.

### w15 · מגדלי הענן (tier 8, diff 4)
- **סיפור:** "אפליקציה עם מיליון משתמשים ואפס רווח. כל סבב גיוס קונה עוד זמן, ומוכר עוד חתיכה ממך."
- **Visual:** glass co-working towers at night. Cloud-grey board `#e2e8f0`, neon violet accent `#7c3aed` (ink `#4c1d95`). Decor `servers`.
  Users show as a swelling particle cloud. Runway shows as a fuse. 2D motif ☁️📱.
- **Start:**
  - `soloFounder`: 70 % stake, ₪20M cash.
  - `bigTechExec`: 45 % stake, ₪80M cash, hires faster.
  - `bootstrapper`: 100 % stake, profitable small product, no investors, slow.
- **Economy (`platform`):**
  - Users, and CAC by channel (3 channels with saturation).
  - Monthly cohorts with a sealed true retention curve. Each month of data narrows the shown range.
  - ARPU, burn, runway.
  - A network-effect threshold (above it, CAC −30 % and retention +5 pp).
  - A rival platform's share.
- **Valuation:** marked monthly as a tech-sector multiple (from `market` regime) × ARR, never "the last round". Raising a tiny round at a silly price therefore cannot inflate the goal.
- **Distinct rule — dilution and the funding climate:** raising sells % at today's multiple. A bubble lets you raise cheap. A winter forces a down-round with a ratchet.
- **Assets & deals:** funding rounds (content pool `round`, sized by regime), venture debt (covenant: runway ≥ 6), acqui-hires, a marketing blitz, a pivot, an acquisition offer from a giant (a fixed price now).
- **Events:** an app-store policy change, a viral month, a data breach, a key engineer leaves, a rival's huge round, a bubble pop (market regime), a giant copies the feature.
- **Goal:** your stake's value ≥ ₪800M **and** runway ≥ 12 months (or cash flow ≥ 0), hold 3.
- **Reward:** opens w17 and w19. Library: "LTV מול CAC", "דילול".
- **Choices:** growth spend vs runway; raise now vs prove metrics first; accept the acquisition offer or not.
- **Recovery:** cut burn (layoffs: happiness −, growth −), a bridge from insiders at −20 %, venture debt, sell the company (the offer floor), a pivot (resets cohorts, keeps cash).
- **As built (wave A3, engine lane):** `js/worlds/mech/platform.js` (+ the market regime table), `modules: ['platform']`; all gates met at N = 36 except G-dom — see `w15-cloud.md`.

### w16 · ארץ השדות (tier 8, diff 4)
- **סיפור:** "שדות ומים בעמק. את היבול רואים רק בקציר, ואת המחיר אפשר לנעול כבר בזריעה. כמה לנעול, כשאתה לא יודע כמה תקצור?"
- **Visual:** a golden-hour patchwork. Wheat board `#eab308` / field greens, sky `#fde68a → #93c5fd`, irrigation-blue accent `#0284c7`. Decor `silos`.
  Fields fill as the yield range narrows. Hedges show as a padlock on the field's price tag. 2D motif 🌾💧.
- **Start:**
  - `agronomist`: yield ranges 30 % narrower.
  - `moshavFarmer`: old equipment (`plant` condition 55), senior water rights.
  - `agriFund`: cash, leases land, no water seniority.
- **Economy:**
  - The `season` crop calendar (sowing → growth → harvest per crop profile).
  - `market` commodity instruments (wheat, cotton, export avocado, dairy) in supply regimes (bumper / normal / drought / export-ban). Each has one *harvest future* (the expected spot at harvest).
  - `portfolio` margin on futures.
  - Adapter `harvest`:
    - A sealed yield per field is drawn at sowing (fixed 1 `world` draw per field slot, 6 slots). It is shown as a range that narrows every month.
    - A water quota cut in droughts.
    - A silo: sell later, 1.5 %/mo spoilage.
- **Distinct rule — hedge under quantity uncertainty:** lock X % of the *expected* yield.
  - In a drought, yield is low and price is high, so the over-hedged farmer buys back futures at a loss on top of a small crop.
  - Under-hedged, a price collapse hits fully.
  - Margin calls arrive *before* the harvest pays.
- **Assets & deals:** land plots, irrigation tech, a packing house, crop insurance (premium; pays on sealed bad yields), water rights (auction-light, no rivals), an export contract.
- **Events:** drought, hail (one field), a pest outbreak, an export ban abroad (price spike), a global bumper crop (price −), a USD swing on export crops, an irrigation subsidy.
- **Goal:** 12-month average farm operating income ≥ ₪5M/mo **and** no forced margin liquidation in the last 12 paydays, hold 2.
- **Reward:** opens w18 and counts for w23. Library: "גידור כמות", "קריאת מרווח של גידור".
- **Choices:** hedge ratio per crop, crop mix (correlation), store vs sell at harvest, insure vs self-insure.
- **Recovery:** roll the hedge (cost), sell silo stock forward, lease out a field, sell water rights, crop insurance payout.
- **As built (wave A3, engine lane):** rule adapter `js/worlds/adapters/harvest.js` (season calendar, commodity regimes and futures margin re-implemented inside it), `modules: ['harvest']`, maxMonths 54; gates N = 36: the five required gates + G-dom met, G-durable (80 %) and W16-hedge (hedge0 Δ 4 pp) open — see `w16-fields.md`.

### w17 · גבעת המעבדות (tier 9, diff 4)
- **סיפור:** "מתוך עשר מולקולות, אחת מגיעה למדף. את הסיכוי של כל שלב כולם יודעים. השאלה היא מתי להפסיק לשלם על חלום."
- **Visual:** white labs on a green hill. Clinical board `#f1f5f9`, teal accent `#0d9488` (ink `#134e4a`). Decor `labs`.
  Each candidate is a flask that fills by phase. A failure is shown as a cracked flask on the shelf. 2D motif 🧪💊.
- **Start:**
  - `scientist`: sees each own molecule's true-quality band.
  - `pharmaVet`: licensing terms +20 %.
  - `bioInvestor`: cash-rich, no pipeline, buys candidates.
- **Economy:**
  - `stages` lib: phase I / II / III / approval = 4 stages with public cost & months.
  - Adapter `trials`:
    - Each candidate has **printed** phase odds (e.g. 60 / 35 / 60 / 90 %) and a sealed quality that shifts them ±10 pp. It is drawn when the candidate is acquired (fixed 2 draws).
    - The readout at each phase end is 1 draw.
  - Approved drugs ramp to peak sales over 12 months and earn until the **patent cliff** month, then −80 %.
  - Peers are listed on `market` (biotech sector). Licensing deal prices follow the sector regime.
- **Distinct rule — known-odds real options:**
  - At each readout choose: continue, abandon (salvage 0–10 %), or license out (the partner pays milestones + a royalty and takes the upside).
  - Sunk cost is visible and irrelevant.
- **Assets & deals:** candidate acquisitions, a manufacturing plant (`plant` light), a royalty sale (cash now for a share of sales), co-development, a CRO contract.
- **Events:** a competitor approval (share halved), a safety signal, a fast track (−1 stage month), a generic challenge (the cliff 12 months earlier), a pricing reform (−15 %), an M&A offer.
- **Goal:** NW ≥ ₪1.2B, with the pipeline at cost-to-date (w8 rule: no paper value) and approved drugs at 5× trailing annual profit until the cliff. **And** ≥ 2 products earning. Hold 2.
- **Reward:** opens w21 (a buyer of companies needs to price binary bets). ★★★ skin. Library: "אופציה ריאלית", "צוק הפטנט".
- **Choices:** continue/abandon/license per readout, pipeline breadth vs depth, sell the royalty or keep it.
- **Recovery:** license out, sell royalties, partner co-funding, cut early programmes, sell the plant.
- **Similarity fix:** `G-dom` must show that `neverAbandon` and `licenseAll` both lose (§6.3).
- **As built (wave A4, engine lane):** rule adapter `js/worlds/adapters/trials.js` (`uses: stages, market, dd`; the `stages` build record used as is, the biotech regime and dd re-implemented), 8 slots, printed odds +5 pp over the example above, a band on the sealed quality that narrows with dd and every passed readout, license / partner / stop / go with a real-option guide; gates N = 36: the required gates met, G-dom and W17-cliff open — see `w17-labs.md`.

### w18 · חוף הסערות (tier 9, diff 4)
- **סיפור:** "הלקוחות משלמים היום. הסערה מגיעה מתי שהיא רוצה. מי שגבה מעט מדי בקיץ יגלה את זה בחורף."
- **Visual:** a coastal town under a bruised sky. Slate board `#cbd5e1`, storm-indigo `#312e81`, lifebuoy-orange accent `#f97316`. Decor `lighthouse`.
  Insured houses show by colour per line. A storm track crosses the board in storm season. 2D motif 🌊☂️.
- **Start:**
  - `actuary`: true loss ratios per line.
  - `topBroker`: +40 % volume, −5 % price power.
  - `mutualChair`: owned by policyholders; no dividends, cheaper capital, decisions 1 month slower.
- **Economy (`insure`):**
  - 5 lines: car, coastal home, inland home, health, business interruption.
  - Your price vs the market rate drives volume and adverse selection (shared shape with `credit`, its own data).
  - Claims: frequency draws per line per payday (fixed 5), plus 1 catastrophe draw that is live only in the `season` storm months.
  - Long-tail reserves with a sealed adequacy, revealed over 12 months.
  - Reinsurance: quota share or excess-of-loss (cost vs tail cap).
  - Solvency = capital ÷ required capital (by exposure).
  - The float is invested through `portfolio` (factors + liquidity classes), so a crash and a storm can coincide.
- **Distinct rule — inverted cash cycle + correlated tail:**
  - Growth *feels* profitable because premiums arrive first.
  - The real choices are price adequacy, coastal concentration and how much tail to sell.
  - The goal demands underwriting profit (combined ratio ≤ 100 %), not just float income.
- **Assets & deals:** books of policies to buy, a reinsurance treaty (renewed yearly; its price jumps after a cat), a cat bond, a claims-tech upgrade (fraud −), a run-off portfolio.
- **Events:** hurricane, flood, a fraud ring, a court ruling that raises old claims (reserve shock), reinsurance price spike, a regulator capital rule, a float-portfolio crash.
- **Goal:** NW ≥ ₪1.2B **and** solvency ≥ 1.2 **and** 12-month combined ratio ≤ 100 %, hold 3.
- **Reward:** opens w20 and w22. Library: "הזנב המתואם", "יחס משולב".
- **Choices:** price vs volume, line mix and coast share, reinsurance depth, float liquidity.
- **Recovery:** buy reinsurance (dear after cats), put a line into run-off, raise capital, issue a cat bond, sell a book.
- **As built (wave A4, engine lane):** new module `js/worlds/mech/insure.js` (`uses: portfolio, season`, both re-implemented inside: the float's two liquidity classes + forced sale, storm months Aug–Oct), 238 lines; tile Z תיק פוליסות למכירה; an inherited under-priced book with short reserves; storms frequent and smaller than sketched (20 % a storm month, 0.3–1.5 × the storm base); gates N = 36: the required gates met, G-dom and G-durable open — see `w18-storms.md`.

### w19 · פעמון הבורסה (tier 9, diff 4)
- **סיפור:** "החברה שלך עולה לבורסה. מעכשיו יש לה מחיר בכל חודש, ולכל מספר שתבטיח יש קהל שבודק אותך."
- **Visual:** an exchange floor with a big bell. Charcoal board `#1f2937`, ticker-green `#16a34a` / red `#dc2626`, brass accent `#b45309`. Decor `bell`.
  Your company's live candle stands on the centre screen. 2D motif 🔔📈.
- **Start:**
  - `founderCeo`: 80 % stake, guidance credibility high.
  - `familyBoard`: the family holds 60 % and expects dividends.
  - `turnaroundCeo`: cheap entry, heavy debt, low credibility.
- **Economy:**
  - A mature operating group built from `plant.light()` + `chain.light()`, the same exports w12 uses.
  - `market` option **`issuer`**: your company is a listed company in the market, with its own id.
    - price = EBITDA × the regime's sector multiple × credibility factor, plus a beat/miss reaction, plus buyback/issuance flow.
    - Peers are listed alongside. You choose the IPO month (regime) and the float (20–49 %).
- **Distinct rule — capital-markets actions with feedback:**
  - Set quarterly guidance: beat → +, miss → −, and sandbagging lowers the price now.
  - Choose buyback vs dividend vs a secondary offering (issue when the price is high).
  - An activist appears if the price lags peers by 25 %.
- **Assets & deals:** bolt-on acquisitions (paid in shares or cash), selling a division, a convertible bond, index inclusion (passive inflow).
- **Events:** index inclusion, a short-seller report (true or false; dd checks), lock-up expiry, sector rotation, an analyst downgrade, an insider rumour.
- **Goal:** the market value of your stake ≥ ₪1.5B **and** net debt ≤ 3× EBITDA, hold 3.
- **Reward:** opens w20, w21 and w22. Library: "הדרכה ואמינות", "קנייה עצמית".
- **Choices:** IPO timing/size, guidance level, buyback vs dividend vs issue, shares vs cash for acquisitions.
- **Recovery:** reset guidance (a one-time hit), a secondary at a discount, sell a division, cut the dividend.
- **As built (wave A4, engine lane):** rule adapter `js/worlds/adapters/bell.js` (`uses: market, plant, chain`; the issuer price and the two divisions re-implemented inside — `market.issuer` was not added to `market.js`, so the w10 / w15 / w16 packs stay pinned), 180 lines; tile W רכישה משלימה (cash or shares); maxMonths 66; gates N = 36: the required gates met, G-dom open — see `w19-bell.md`.

### w20 · רחוב הקרנות (tier 10, diff 5)
- **סיפור:** "הכסף לא שלך. הלקוחות נשארים כשמרוויחים, ובורחים בדיוק כשהמחירים בתחתית, וכשאתה הכי צריך אותם."
- **Visual:** trading-room monitors. Midnight board `#0b1020`, cyan accent `#22d3ee`, alert magenta `#db2777`. Decor `screens`.
  AUM is a water tank: inflows fill it, redemptions drain it. A short position is a red, inverted block. 2D motif 📉📈.
- **Start:**
  - `quantAnalyst`: exact betas, low client trust (flows react 1.5×).
  - `starPicker`: high trust, flows react 2× both ways.
  - `endowmentPm`: one patient anchor client (40 % of AUM) that may redeem 30 % at once (sealed month).
- **Economy:**
  - `market`: 12 fictional companies, stock picking.
  - `portfolio` option **`flows`**:
    - AUM in/out = f(trailing 12-month return vs the index, regime, sealed client patience). Fixed 1 draw per payday.
    - Fees 1.5 % management + 20 % performance above the high-water mark.
    - Redemptions on 1 month's notice. A gate caps them at 10 %/mo (reputation −).
  - `portfolio` option **`short`**:
    - borrow fee by crowdedness
    - a squeeze event when short interest is high and a positive company event hits (+30…+80 % jump)
    - a regulator short ban in crashes (forced cover)
  - No margin borrowing in w20: leverage is other people's money.
- **Distinct rule:**
  - Asymmetric fees vs flow risk. Hugging the benchmark keeps clients but earns only management fees. Active bets earn performance fees, or trigger outflows at the worst time (forced selling into lows).
  - Shorts can lose without limit.
- **Assets & deals:** a seed investor (cash + fee share), a new fund launch, an index product (stable, low fee), co-investments.
- **Events:** the market regimes, a squeeze, fraud discovered at a holding (a big short wins), a crowded-trade unwind, a short ban, a star analyst leaves, an investor conference.
- **Goal:** personal NW (own stake + fees) ≥ ₪800M **and** AUM ≥ ₪4B, hold 3. ★★★ also requires that no gate was used.
- **Reward:** counts for w23 and w24. Library: "כסף של אחרים", "שורט וסחיטה".
- **Choices:** active share, gross/net exposure, shorts, the gate, launching a stable product.
- **Recovery:** cut gross exposure, a gate (reputation), seed from your own money, the index product.
- **As built (wave A5, engine lane):** rule adapter `js/worlds/adapters/funds.js` (`uses: market, portfolio`; 12 companies of the market pool with a sealed alpha, the index = their equal-weighted mean, flows / short / gate re-implemented inside — `market.js` and `portfolio.js` untouched, so the w10 / w15 / w16 packs stay pinned), 217 lines; tile W משקיע חדש (take / lock / pass); maxMonths 84; gates N = 36: the required gates met, G-dom and W20-flow (AUM part) open — see `w20-funds.md`.

### w21 · בית ההשקעות הפרטי (tier 10, diff 5)
- **סיפור:** "קונים חברה בהלוואה, מתקנים אותה ומוכרים. לקרן יש תאריך סיום, והקונים לא תמיד מגיעים בזמן."
- **Visual:** a wood-panelled boardroom over a harbour. Walnut board `#78350f`, cream `#fef3c7`, deep-green accent `#15803d`. Decor `boardroom`.
  Portfolio companies are cards on the table. An hourglass shows the fund's life. 2D motif ⌛💼.
- **Start:**
  - `operatingPartner`: synergy realisation +20 %.
  - `dealMaker`: wins auctions 5 % cheaper, weaker operations.
  - `firstTimeGP`: a ₪1.5B fund with strict LPs (no extension).
- **Economy:**
  - `auction`: 2–4 rival funds bid for each target. True EBITDA potential is sealed. dd (the 100-day plan) narrows it.
  - Portfolio companies run on `holding`-style `light()` formulas.
  - `credit` LBO debt (≤ 5× EBITDA) with covenants (debt/EBITDA). A breach brings an equity cure or the lender takes the company.
  - Exits: trade sale (auction to strategics), IPO through `market` (regime multiple), or a secondary fund.
  - Adapter `lbo`: fund life = `maxMonths`. Management fee falls on uninvested capital. **DPI** = cash distributed ÷ committed.
- **Distinct rule — deadline-driven exits:** only cash returned counts (marks count 0 for DPI). You must sell in whatever regime comes. A dividend recap extracts cash early, at a risk.
- **Assets & deals:** targets of every earlier kind (factory, chain, hotel group, software), add-on acquisitions, a dividend recap, a continuation fund.
- **Events:** a credit freeze (no LBO debt for 6 months), exit windows by regime, management quits, a covenant reset, a rival outbids, a strategic buyer appears.
- **Goal:** DPI ≥ 2.0 **and** personal NW (carry + fees) ≥ ₪400M, hold 2.
- **Reward:** counts for w23, w24, w25. Library: "קללת המנצח", "תאריך יציאה".
- **Choices:** bid level, leverage, which company to fix first, the exit route & timing, recap or not.
- **Recovery:** an equity cure, a 12-month fund extension with LP consent (fee cut + months), a secondary sale at −15 %, a partial exit.
- **As built (wave A5, engine lane):** rule adapter `js/worlds/adapters/lbo.js` (`uses: auction, credit, holding, market`; sealed-bid auctions vs 2–4 rivals that follow the sealed potential, LBO debt with a covenant and a leverage premium, the 18-month fix, exits by regime, the fund's end at month 72 with a −30 % forced sale — all re-implemented inside, so the four modules and their packs are untouched), 178 lines; tile W חברה למכירה (dd / low / mid / high / pass); **DPI is measured ÷ paid-in, not ÷ committed** (deviation); maxMonths 84; gates N = 36: the required gates met, G-dom and W21-curse open — see `w21-lbo.md`.

### w22 · העיר החדשה (tier 10, diff 4)
- **סיפור:** "גבעות ריקות ותוכנית מתאר. כל רכבת, בית ספר ופארק שתבנה מייקרים את כל הקרקע שעוד נשארה אצלך, אבל הריבית רצה גם על עיר ריקה."
- **Visual:** a city growing from bare hills. Terrain board `#d6c7a1`, planner-blue accent `#2563eb`. Decor `masterplan`.
  The influence radius of each amenity shows as a soft halo raising plot tags. Residents show as lights at night. 2D motif 🏙️🗺️.
- **Start:**
  - `cityPlanner`: sees exact demand radii.
  - `plotMagnate`: the largest land bank, low cash.
  - `transitEngineer`: infrastructure −15 % cost.
- **Economy:**
  - About 20 plots in 5 zones.
  - Amenities (rail station, school, park, hospital, mall) built with `stages`. Each raises plot values and demand in its radius by public, fixed factors.
  - Residents arrive with a 6–18-month lag.
  - Property tax income.
  - Municipal bonds (rate from `rate` + a spread on DSCR).
  - `public.light()` services ratio (seats/beds per resident) drives satisfaction. Below 50 residents leave.
  - Adapter `capture`: plot price = base × Π(amenity factors) × cycle. Plot sales clear in an auction-light (1 draw).
- **Distinct rule — sequencing externality:**
  - Building amenities first raises every plot you still hold, but interest runs on an empty city.
  - Selling plots early funds amenities, at low prices.
  - There is no presale threshold (unlike w8).
- **Assets & deals:** plots, amenities, a PPP (a partner builds an amenity for a revenue share), a big employer campus, a stadium (a callback to w13).
- **Events:** a national rail plan (a free station, or not), recession (sales freeze), an employer arrives, a school strike, an environmental petition (delay), rate moves.
- **Goal:** NW (land at the last clearing price per zone) ≥ ₪3B **and** residents ≥ 60k **and** DSCR ≥ 1.5, hold 3.
- **Reward:** counts for w24 and w25. Library: "לכידת ערך קרקע", "סדר בנייה".
- **Choices:** build vs sell order, amenity siting, bond vs plot-sale funding, services pace.
- **Recovery:** sell a plot bundle to a developer at −20 %, a PPP, refinance bonds, phase the plan.
- **As built (wave A5, engine lane):** rule adapter `js/worlds/adapters/capture.js` (`uses: projects, stages, public, rate`; 20 plots in 5 zones, amenities paid month by month that reprice their zone and the next ones (a sealed spill the planner sees), residents after a lag on sold plots, property tax, bonds with a DSCR spread, the services ratio and satisfaction — all re-implemented inside, so `projects.js` / `stages.js` and the w8 / w9 packs are untouched; `public.light()` is not a new export), 213 lines; tile W הצעה לעיר (PPP / campus / pass); maxMonths 84; gates N = 36: the required gates and W22-sequence / W22-services met, G-dom open — see `w22-capture.md`.

### w23 · בית המסחר העולמי (tier 11, diff 5)
- **סיפור:** "אוניות, מחסנים ועקומת מחירים. מרוויחים על הפער בין היום למחר, עד שהעקומה מתהפכת, הבנק סוגר את הקו או שהלקוח לא משלם."
- **Visual:** a container port at sunrise. Steel-blue board `#334155`, container colours, cargo-amber accent `#d97706`. Decor `tankers`.
  Each position is a ship on a route arc, with a curve chart per commodity. 2D motif 🚢🛢️.
- **Start:**
  - `oilTrader`: wide credit lines, no fleet.
  - `shipOwner`: own fleet (freight cheaper, fleet fixed cost).
  - `tradeFinancier`: cheapest funding, strictest limits.
- **Economy:**
  - `market` option **`curve`**: spot + 3/6/12-month futures per commodity (4 commodities). The shape (contango/backwardation) comes from the supply regime.
  - `portfolio` margin on futures.
  - `credit` option **`counterparty`**: buyers on credit terms with sealed PD, letters of credit as protection at a fee.
  - `multinational` FX layer (USD/EUR).
  - `auction` for storage/charter capacity vs rivals.
  - Adapter `carry`: storage cost, financing line availability by regime.
- **Distinct rule — the carry trade:** buy spot + store + finance + sell forward is a locked spread **only if** the curve holds, the counterparty pays and funding stays available. Three earlier risks meet in one position.
- **Assets & deals:** storage tanks, ship charters, offtake contracts, a blending plant, an LC facility.
- **Events:** a canal blockage (freight spike), sanctions (a counterparty frozen), a storage glut (deep contango), a supply shock (backwardation), a counterparty fraud (fake warehouse receipts: dd catches), a USD squeeze.
- **Goal:** NW ≥ ₪4B **and** no margin or counterparty default in the last 24 paydays, hold 3.
- **Reward:** counts for w25. Library: "carry", "סיכון צד נגדי".
- **Choices:** carry size vs funding headroom, credit terms vs LCs, hedge FX or not, which capacity to bid for.
- **Recovery:** sell storage forward, cargo insurance, demand collateral, cut limits, hedge FX, sell a charter.

### w24 · אוצר המדינה (tier 11, diff 5)
- **סיפור:** "אתה שר האוצר של מדינת אי קטנה ובדיונית. מדינה לא פושטת רגל כמו עסק, אבל הריבית שהעולם דורש ממנה אומרת לך כמה מאמינים לך."
- **Visual:** an island capital seen from the sea. Coral-sand board `#fde7c8`, lagoon-teal `#0f766e`, parliament-white. Decor `capitol`.
  Gauges for debt/GDP, the bond spread and satisfaction. 2D motif 🏝️🏛️.
- **Neutrality rule:** no real countries, parties or ideologies. Every trade-off is shown symmetrically, and the mentor never says which policy is "right", only what the numbers did.
- **Start:**
  - `economist`: exact multipliers.
  - `formerBanker`: low starting spread (credibility 70).
  - `reformer`: high satisfaction, debt/GDP 90 % at the start.
- **Economy (`public`):**
  - GDP per resident grows with productivity. Investment in education/infrastructure pays with 12–36-month lags (a `stages` build).
  - Tax rate & mix: revenue vs growth drag.
  - Spending lines: services, transfers, infrastructure, education.
  - Bonds: rate = world rate (`rate` deck) + spread(debt/GDP, deficit, credibility).
  - Rating from the spread; satisfaction 0–100; a fiscal rule you may announce (credibility + if kept, −− if broken).
  - The global regime from `market` drives export demand and spreads.
- **Distinct rule — r vs g and credibility:**
  - Deficits pay off only while growth > the interest rate.
  - Keeping your own announced rule lowers spreads.
  - Austerity in a recession deepens it.
- **Assets & deals:** state companies (privatise: cash now, dividends lost), a port concession (callback), a sovereign fund (invests surpluses through `portfolio`), infrastructure programmes.
- **Events:** global recession, a natural disaster, a tourism boom, an export price spike, a bond-market tantrum, a tech hub (if education is high), ageing.
- **Goal:** GDP per resident ≥ +25 % **and** debt/GDP ≤ 60 % **and** rating ≥ A **and** satisfaction ≥ 50, hold 3.
- **Reward:** counts for w25. Library: "ריבית מול צמיחה", "אמינות".
- **Choices:** timing of deficits, tax vs spending mix, announce a rule or keep flexibility, privatise or keep.
- **Recovery:** a "קרן עולמית" programme (cheap money, strict rules, a months cost), privatisation, a spending review, a tax reform.
- **Money:** big numbers (₪ billions), but the goal and the ranking tiebreak are ratios. The validator band uses `econ.band` in ₪ billions.

### w25 · מגדל העולם (tier 12, capstone, diff 5)
- **סיפור:** "קבוצה גלובלית רשומה בבורסה, עם בנק, חברת ביטוח, מפעלים ופרויקטים. המניה שלך היא גם הבטוחה שלך, וגם המראה של כל טעות."
- **Visual:** a skyline crowned by your tower. Marble-black board `#111827`, gold `#d4af37`, emerald accent `#047857`. Decor `tower`.
  Each division is a miniature from its home world (callbacks w5–w24). Guarantee cables run to HQ, as in w12. The share price is the tower's lit floors. 2D motif 🌐👑.
- **Start:**
  - `founderChair`: 60 % control, 20 % of it already pledged.
  - `heirTwins`: 2 siblings with 30 % + 25 %; votes must agree (sealed disagreement events).
  - `outsiderCeo`: 25 % + a voting pact with a partner (45 % combined); the partner may exit (sealed).
- **Economy:**
  - `holding` divisions: light versions of season, plant, chain, projects, energy, credit, insure, platform.
  - `market` `issuer`: the holding is listed; peers & regimes.
  - `portfolio` option **`pledge`**: your personal loans are secured by your own shares. A price drop brings a margin call, which forces you to sell shares, which presses the price: reflexive.
  - `credit`: the bank division's deposits run if the group rating falls.
  - `multinational` FX basket.
  - Adapter `apex`: control %, rights issues, the pledge loop and board confidence.
- **Distinct rule — control and reflexivity:**
  - Fund growth by issuing shares (dilutes control), by group debt (guarantees → contagion as in w12) or by pledging your shares (cheapest; the price feedback hits *your* stake).
- **Assets & deals:** division acquisitions (`auction`), a rights issue, group bonds, an insurance hedge, spinning off a division (IPO on `market`).
- **Events:** a multi-factor storm, a short-seller report on the group, a bank-division run, a rating downgrade, an antitrust forced sale, a succession dispute, an activist.
- **Goal:** stake value ≥ ₪10B **and** control ≥ 50.1 % **and** no division default in the last 24 paydays **and** group liquidity coverage ≥ 1, hold 3.
- **Reward:** opens **∞ הכלכלה הפתוחה**. ★★★ skin "מגדל הזהב". Title progress.
- **Choices:** the funding mix (equity / debt / pledge), ring-fence vs guarantee per division, which division to sell in a storm.
- **Recovery:** sell a division, a rights issue (keeps control, costs personal cash), unpledge by selling personal assets, ring-fence the bank, cut the dividend.

---

## 2. Reuse plan (engineering stays finite)

### 2.1 Inventory

| layer | items | status |
|---|---|---|
| engine-internal mechanics | `basic`, `rate`, `fx`, `angel` (+ `history`) | built; untouched (byte-identical) |
| world modules, built | `season`, `plant`, `chain`, `projects` + lib `stages` | built (w5–w8) |
| world modules, planned (docs exist) | `energy` (w9), `portfolio` (w10), `multinational` (w11), `holding` (w12) | planned |
| **new engine modules (6)** | `market` (w10), `auction` (w13), `credit` (w14), `platform` (w15), `insure` (w18), `public` (w24) | this doc |
| shared systems (not a world mechanic) | `js/systems/content.js` (pools, §4), `js/systems/run.js` (continuation composer, §5) | this doc |
| module **options** (no new module) | `market.issuer` (w19, w25) · `market.curve` (w23; w16 uses the 1-tenor harvest future) · `market.commodity` instruments (w16, w23) · `portfolio.flows` + `portfolio.short` (w20) · `portfolio.pledge` (w25) · `credit.counterparty` (w21, w23) | this doc |
| **rule adapters (7)**, mech-module contract, ≤ 300 lines each, no own subsystem | `league` (w13), `harvest` (w16), `trials` (w17), `lbo` (w21), `capture` (w22), `carry` (w23), `apex` (w25) | this doc |
| `light(params, ctx)` exports | `season`, `plant`, `chain`, `projects`, `energy`, `credit`, `insure`, `platform` (~60 lines each) | for w12, w19, w21, w25 |

Validator additions (§6.4):
- `V-adapter`: an adapter file is ≤ 350 lines, declares `uses: [moduleIds]`, and owns no state path outside `st.world.<adapterId>`.
- `V-mods`: every module/option a world names exists.

### 2.2 Per-world composition beyond w12 (the distinct rule = the new decision)

| world | modules (+options) | the ONE rule that makes it different | reused as-is |
|---|---|---|---|
| w13 | `season`(profile league) + **`auction`** + `league` | final-rank cliff payoff vs rivals; squad assets age and resell | rivals' bidder count, dd (scouting), stages light (stadium) |
| w14 | **`credit`** + `rate` | rate → volume **and** borrower quality (adverse selection); deposits run on confidence | w2 rate deck, cycle, dd (credit committee) |
| w15 | **`platform`** + `market` (regime only) | valuation from the regime multiple → dilution decision; cohorts reveal retention | market regimes, dd (due diligence on acquihires) |
| w16 | `season` + `market.commodity` + `portfolio` (margin) + `harvest` | hedge ratio against a sealed, narrowing yield | season calendar, portfolio margin engine, w3 hedge text |
| w17 | `stages` + `market` + `dd` + `trials` | printed phase odds; continue/abandon/license; patent cliff | stages lib, market biotech sector, dd |
| w18 | **`insure`** + `portfolio` + `season` | premiums-first cash cycle; cat season correlation; combined-ratio goal | portfolio float, season storm months, select-curve shape from credit |
| w19 | `market.issuer` + `plant.light` + `chain.light` | your announcements move your own listed price | market, light() exports |
| w20 | `market` + `portfolio.flows` + `portfolio.short` | AUM flows chase performance; HWM fees; shorts & squeezes; no margin | market, portfolio |
| w21 | `auction` + `credit` (covenants) + `holding.light` + `market` + `lbo` | fund deadline; DPI counts cash only | auction, credit, market exits |
| w22 | `projects`/`stages` + `public.light` + `capture` | own amenities raise own plot values (externality) + services ratio | stages, rate, public light |
| w23 | `market.curve` + `portfolio` + `credit.counterparty` + `multinational` fx + `auction` + `carry` | carry = curve × counterparty × funding in one position | all listed |
| w24 | **`public`** + `market` (regime) + `rate` + `stages` (lagged investment) | r vs g with credibility-priced spreads; no equity | market regimes, rate, stages |
| w25 | `holding` + `market.issuer` + `portfolio.pledge` + `credit` + fx + `apex` | control % and the pledge reflexive loop | everything |

### 2.3 Similarity audit (flagged pairs and the fix applied)

| pair | risk | fix (already in the cards above) |
|---|---|---|
| w20 ↔ w10 | both are "manage a portfolio on `market`" | w20 has **no margin**. Its new decisions are client flows, HWM fees, shorts and the gate. w10 keeps own money, margin and liquidity classes. Gate `W20-flow`. |
| w23 ↔ w16 ↔ w3 | all hedge prices | w3 = one FX factor per asset. w16 = producer, **quantity** unknown. w23 = no production; spread/carry + counterparty + funding. |
| w22 ↔ w8 | both build with `stages` | w22 has no presale gate. Its decision is build/sell **sequencing** with an externality across plots, plus a services ratio. |
| w25 ↔ w12 | both are group structures | w25 is listed. It adds control % and the pledge loop. w12 is private and has no reflexivity. |
| w18 ↔ w14 | both are regulated balance sheets | opposite cash timing. A seasonal catastrophe tail. The goal requires an underwriting profit (combined ratio). |
| w19 ↔ w15 | both value a company | w15 = private rounds and cohorts. w19 = a mature business, guidance, buybacks, a public price. |
| w21 ↔ w19/w12 | buy/run companies | w21 = auctions + LBO covenants + a hard exit deadline; DPI counts cash only. |
| w17 ↔ w4 | both are binary bets | w4 = unknown fates of many passive checks. w17 = printed odds, an active continue/abandon decision, a patent cliff. |
| w13 ↔ w5 | the `season` calendar | the decision centre is the rank cliff and the transfer auction. Occupancy pricing is not offered. |
| **rejected** "concessions" (toll road/port) | availability vs demand risk ≈ w9's PPA vs merchant; refinance ≈ w9 | dropped; replaced by w22 העיר החדשה |
| **rejected** sovereign wealth fund | ≈ w20 flows + w10 | dropped; the sovereign fund lives inside w24 as an asset |
| **rejected** VC fund | ≈ w4 + w21 | dropped |
| **rejected** airline / REIT / crypto exchange | ≈ w5 + w6 / w2 + w8 / w1 coin | dropped |

### 2.4 New-module sketches (beyond `market`, which is §3)

Each module follows DESIGN §4.2:
- pure functions, `world` stream draws with fixed declared counts;
- `Z` actions, `indicators` panel descriptor, `cityModels`, `sealed` paths, a `light()` export;
- only `+ − × ÷ round min max floor` (no pow/exp/log).

| module | state (per item) | fixed draws | Z actions | size |
|---|---|---|---|---|
| `auction` | lot `{id, item, reserve, bidders[k]:{sealedValue}, rounds}` | at lot creation: 1 + 1 per bidder slot (max 4) = 5, always | `bid {lot, amount}`, `walk` | ~450 lines |
| `credit` | segment `{book, pdBand, pdTrue(sealed), lgd, rw, priceSpread}`, deposits `{retail, wholesale, rate}`, `capital`, `confidence` | 1 per segment per payday (5) + 1 confidence | `price {seg, spread}`, `fundMix`, `raiseCapital`, `sellBook`, `window` | ~700 |
| `platform` | `users, cohorts[ring 24]{size, retTrue(sealed), seen}`, `channels[3]`, `cash, burn, stake, rounds[]` | 1 per payday (cohort noise) + 2 per new cohort (retention curve) = fixed 3 | `spend {channel}`, `raise {size}`, `cut`, `pivot`, `debt` | ~650 |
| `insure` | line `{premium, priceRel, lrTrue(sealed), exposure}`, `reserves{booked, adequacy(sealed)}`, `treaty`, `solvency` | 1 per line (5) + 1 cat per payday | `price {line}`, `treaty {type, depth}`, `runoff {line}`, `catBond` | ~700 |
| `public` | `gdp, pop, taxRate, spend{4}, debt, spread, rating, credibility, satisfaction, invest[]` | 1 growth noise per payday | `budget {tax, spend}`, `rule {announce}`, `issue {years}`, `privatise` | ~700 |

### 2.5 Goal registry additions (tiny)

- `modValue` gains `cmp: 'ge' | 'le'` (default `ge`). For `le`, progress = clamp(target ÷ value). This covers wage ratio, combined ratio, debt/GDP and net debt/EBITDA. About 10 lines.
- `noDefault {months, key}`: already planned for w12. Generalised by `key` (default, regulator, margin, counterparty). The module reports the payday of the last event.
- `maxDrawdown {pct}`: peak NW over a bounded ring (≤ 200) vs now. Used only by continuation goals.

---

## 3. The `market` module (built first, inside w10)

File `js/worlds/mech/market.js` (~900 lines) plus data `js/worlds/data/companies.js` (pool, ~400 lines) and tests (~600 lines).
It is consumed by w10, w15, w16, w17, w19, w20, w21, w23, w24, w25 and ∞. The state lives under `st.mkt` (not `st.world`), so several modules can read it.

### 3.1 Companies pool (fictional)

- **8 sectors:** `tech` טכנולוגיה · `fin` פיננסים · `energy` אנרגיה · `consumer` צריכה · `health` בריאות · `property` נדל"ן · `industry` תעשייה · `transport` תחבורה.
  Plus `commodity` instruments for w16/w23 (not companies: no bankruptcy, no events except supply regimes).
- **≥ 6 companies per sector (≥ 48 entries).** Each entry:
  `{key, name, tk, sector, size:'large'|'mid'|'small', beta:[lo,hi], vol:[lo,hi], div:[lo,hi], q:[lo,hi], debt:'low'|'mid'|'high', px:[lo,hi], blurb}`.
  - `q` = sealed quality 0–1, drawn at listing within the range.
  - Examples: שבבי הגליל (SHGL, tech, mid) · אורות פיננסים (ORFN, fin, large) · נגב סולאר (NGSL, energy, small) · מאפיות השפלה (MAFS, consumer, mid) · תרופות הכרמל (TRKM, health, small) · מגדלי החוף (MGHF, property, mid) · פלדת הצפון (PLDZ, industry, large) · קווי הים התיכון (KVYM, transport, mid).
- **Validator `M-fict`:** names and tickers unique in the pool. No name or ticker matches a denylist of real listed companies (`tools/data/real-names.txt`, TASE + major US/EU, maintained by hand). No real person names.
- **World selection:** each world declares `market: {slots: 12, sectors: {tech: 3, …} | 'all', sizes, issuer?: true}`. At `init` the module fills the slots from the pool by seed.

### 3.2 State

```
st.mkt = { v:1,
  regime: { id:'growth'|'recession'|'highVol'|'bubble'|'recovery'|'sectorCrisis', sector:null|sectorId, since, minLeft },   // minLeft public; exit sealed by draws
  idx: { px, cand:[ring 60] },                                   // market index (agorot ×100 base 10000)
  cos: { [coId]: { id, key, name, tk, sector, size, beta, vol, div, q /*SEALED*/, recov /*SEALED*/, distress, status:'listed'|'halted'|'bankrupt'|'merged',
                   listedM, endedM, endPx, peakPx, px, open:{o,h,l,c,n,v}, cand:[ring 36], ev:[ring 12 {m,type,pct}], lastEvM:{type:m} } },
  slots: [coId|null × 12],  nextId, usedKeys:[keys ever listed this game],
  held: { [coId]: { qty, basis, fees, divs, opened, short?:{qty, proceeds, borrowFee} } },
  closed: [ring 24 {coId, name, qty, basis, proceeds, pnl, reason:'sold'|'bankrupt'|'merged', m}],
  news: [ring 24 {m, coId|null, type, text, poolId}],  grave: [ring 12 compact {id,name,tk,peakPx,endPx,endedM,reason}],
  claims: [{coId, qty, px, payM}] }
```

- Prices are **integer agorot** (shown via `fmtP`). Money stays integer ₪ (`qty × px / 100`, rounded once).
- `sealed: ['mkt.cos.*.q', 'mkt.cos.*.recov']` feed the rooms' redacted view (DESIGN §4.8).

### 3.3 Regimes and transitions

The regime is public ("מצב השוק"). Its remaining length beyond `minLeft` is not. One draw per payday decides whether it exits (after `minLeft`) and, on exit, the next regime.

| regime | μ index /mo | σ index /mo | event rate p | min months | exit p/mo | next (weights) |
|---|---|---|---|---|---|---|
| growth | +1.0 % | 3.0 % | 0.55 | 6 | 0.12 | bubble 25 · highVol 25 · recession 30 · sectorCrisis 20 |
| bubble (sector s: +3 %) | +2.0 % | 3.5 % | 0.60 | 3 | 0.25 | recession 50 · highVol 30 · sectorCrisis(s) 20 |
| recession | −1.6 % | 4.5 % | 0.65 | 4 | 0.20 | recovery 70 · highVol 30 |
| recovery | +1.8 % | 3.5 % | 0.55 | 4 | 0.18 | growth 70 · highVol 15 · recession 15 |
| highVol | 0.0 % | 7.0 % | 0.80 | 2 | 0.30 | growth 30 · recession 30 · recovery 40 |
| sectorCrisis (s: −4 %) | −0.3 % | 4.0 % | 0.75 | 3 | 0.25 | recovery 50 · growth 30 · recession 20 |

- **Sector choice** for bubble and sectorCrisis comes from the same draw (second half of its range), weighted by the world's sector mix.
- **Coupling.** A world with `cycle.js` may set `market.couple:'cycle'`. The cycle phase then tilts the next-regime weights ×2 toward its match (expansion → growth/bubble, slowdown → highVol, recession → recession, recovery → recovery). It never forces them, and it uses no extra draws.
- **Long-run drift is modest.** The stationary mix gives about +0.6 %/mo on the index. Once fees, spread and 25 % tax are paid, buy-and-hold is a decent baseline, not a winner (`M-dom`).

### 3.4 Monthly price path (payday) and candles

One payday step, with **K = 4 sub-steps** ("weeks"):

```
draws (fixed): 1 regime · 4 index (one per sub-step) · 8 sector (one per sector per month) · 12×4 idiosyncratic (slot × sub-step) · 2×3 event slots · 2 relist
             = 1 + 4 + 8 + 48 + 6 + 2 = 69 per payday, ALWAYS (empty slots, halted or bankrupt companies still consume theirs)
z(u) = (u − 0.5) × 3.4641          // unit variance, bounded ±1.73 (no exp/log); fat tails come from events, not z
idx_k = idx_{k−1} × (1 + μ/4 + σ/2 × z_idx,k)                    // σ/2 = σ/√4
sec_s = tilt(regime, s)/4 + 0.02 × z_sec,s                        // one per sector per month, applied each sub-step
r_c,k = β_c × (idx_k/idx_{k−1} − 1) + sec_s + vol_c/2 × z_c,k − distressDrag_c
         clamped to [−0.35, +0.35] per sub-step
p_c,k = max(1, round(p_c,k−1 × (1 + r_c,k)))                      // ≥ 1 agora while listed; a floor hit adds distress +1
```

**Candle definition** (1 candle = 1 game month, built only from prices that really existed):

- `open` = the previous candle's close (or the listing price in the listing month); `h = l = o`, `n = 0`, `v = 0`.
- **Every price print updates the open candle:** `h = max(h,p)`, `l = min(l,p)`, `n++`. A print is:
  1. each sub-step price at payday;
  2. each event jump;
  3. a card that sets a price (`tradePending` path in w1–w4 style decks);
  4. the mid price at which a player trade fills (`v += qty`).
- **Close** at payday, after the sub-steps and the month's events: `c` = the last print. The candle is pushed to the ring and the next one opens with `o = c`.
- **Invariants** (`M-candle`, fuzz 10k months × 200 seeds):
  - `l ≤ min(o,c)` and `max(o,c) ≤ h`
  - `l ≥ 1` agora while listed
  - integers
  - rings ≤ 36 per company, ≤ 60 for the index
- **No future information.** A candle holds only prints that already happened. Sealed values (`q`, `recov`, the regime exit) never touch a candle or a news line. The UI reads candles and the open candle only.
- A bankrupt company's last candle closes at its recovery price and the series stops. A merged company's last candle closes at the deal price.

### 3.5 Company events (2 event slots per payday, 3 draws each, always consumed)

- **Draw 1** decides whether the slot fires (p from the regime).
- **Draw 2** picks the event type, weighted by regime × sector.
- **Draw 3** picks the company, weighted. The pick **never** depends on player holdings (I7, `M-target`).

| event | growth | recession | highVol | bubble | recovery | sectorCrisis | effect (jump print, TUNE) |
|---|---|---|---|---|---|---|---|
| revUp הכנסות עלו | 30 | 10 | 15 | 30 | 30 | 8 | +4…+12 %, distress −1 |
| revDown הכנסות ירדו | 12 | 30 | 20 | 8 | 15 | 25 | −5…−15 %, distress +1 |
| launch השקת מוצר | 18 | 6 | 12 | 25 | 15 | 5 | +8…+25 % (tech/health ×1.4 weight) |
| lostClient לקוח גדול עזב | 10 | 18 | 15 | 6 | 10 | 18 | −8…−20 %, distress +1 |
| debt גיוס חוב / אזהרת אשראי | 10 | 16 | 14 | 12 | 10 | 16 | −3…−8 %, distress +1 (fin ×0.5) |
| merger הצעת רכישה | 12 | 6 | 8 | 15 | 14 | 6 | +20…+35 % premium. Then `merged` at that price next payday: holdings cash out, id retired |
| fraud הונאה / "המייסדים נעלמו" | 2 | 5 | 6 | 6 | 2 | 6 | −40…−70 %, `halted` 1 month. 50 % chance of bankruptcy within 3 months (sealed at the event) |

- **As built (engine lane, after A2):** the `merger` weights are half of this table (6 · 3 · 4 · 8 · 7 · 3). Measured over 100 seeds × 24 months: ≈ 0.9 takeovers and 0.4 bankruptcies per game-year (was ≈ 1.6 takeovers); companies ended by month 13 — median 1, p90 3, max 6 (was median 2, p90 4, max 7). Per-type frequencies still follow the (edited) table (`M-freq`).

**Company pick weight** (draw 3):
- base 10
- negative events: × (1 + distress)
- fraud: only companies with `q < 0.35`, weight × (1.5 − q); at most once per company
- crisis sector: × 3 for negative events in sectorCrisis
- any event on the same company in the last 2 months: × 0.3
- the same type on the same company within 12 months: excluded

**Fallbacks:** if the eligible set is empty, the slot becomes a sector-wide news line (no company). The draws were still consumed.

**Distribution guard `M-spread`:** over 500 seeds, no single pool company, slot or tile receives > 15 % of all fraud events.
- The event comes from the payday process. A board tile only *shows* news, so a "founders fled" crash is never tied to one company or one tile.

**Bankruptcy:**
- **Triggers:** distress ≥ 4 at a payday, or the sealed fraud follow-up.
- **Effects:**
  - status `bankrupt`; price → `recov` (0–8 % of the pre-event price, sealed at listing from q).
  - Holdings become a **claim** `{qty, px: recov, payM: now+3}`. The claim pays `qty × recov` in cash at `payM`.
  - The realised loss is booked to `closed` with `reason:'bankrupt'`, and capital-loss carry follows `IV.capitalGainsTax` lossCarry.
  - Shorts are closed at the recovery price (w20).
- **History kept:** the company stays in `cos` until its claims pay, then moves to `grave` (compact; ring 12). Its candles stay viewable from `grave` (last 12).

**Relisting** (the 2 reserved relist draws per payday):
- An empty slot (bankrupt or merged ≥ 6 months ago) gets a **new company with a new id** `c<nextId++>`. The entry comes from the pool and is never a `key` already in `usedKeys` (no name or ticker reuse within a game).
- If the pool is exhausted, the slot stays empty. That is still valid.
- A news line may say "קמה מחדש מנכסי X", but the new company has its own id, history and price. The old loss is never renamed away.

**Identity (I8):** holdings, offers and pending trades key on `coId`, never on slot or ticker text. The `cos` record for a `coId` is append-only except for price, status and rings.

### 3.6 News tied to events

- Each event and regime change emits one news item. Its text comes from the content pool `news.<type>` (§4) with `{co} {sector} {pct}`. The template pick uses the `content` stream, not `exch`, so text variety never moves prices.
- **Rumours.** In highVol and bubble, `news.rumor` lines may appear: noise from the content stream, by construction uncorrelated with sealed state. The library says "שמועה היא לא מידע".
- **Partial information that can be investigated:** research focus (`focus.js` research) on a company reveals its q band (low/mid/high) and its distress. The q value itself is never revealed.

### 3.7 Trading, fees, P&L

- **Buy/sell between rolls** (`Z:trade {coId, side, qty}`), and on market tiles (`tradePending` shape). Fills at mid ± half-spread.
- **Half-spread** by size: large 0.05 % · mid 0.15 % · small 0.40 %. ×2 in highVol; ×3 for the crisis sector in sectorCrisis.
- **Commission** = `IV.tradeCost` (0.1 %, min ₪5 × `econ.feeScale`).
- **Tax:** 25 % capital-gains tax at sale with loss carry (existing). Dividends quarterly at the sector yield, 25 % withheld.
- **Preview before confirming (I1):** qty, price, spread cost, commission, total, the position after, and "if sold now after tax".
- **P&L per company:** unrealised (`qty × px − basis`), realised (`closed`), fees, dividends. Also a **benchmark line** "אילו קנית את המדד באותם חודשים" (teaching, no advice).
- Halted companies cannot be traded. Bankrupt companies resolve only through claims.
- **`M-roundtrip`:** buying and selling within the same month always loses ≥ spread + 2 commissions (I2).

### 3.8 Determinism and rules gating

- **New stream `exch` at STREAMS index 16** (appended last), so existing stream seeds are unchanged.
  - The state entry `st.rng.exch` is created **only** by worlds that declare `streams:['exch']`. Old saves and w1–w9 states therefore stay byte-identical, JSON included.
  - Append-only is noted in `rng.js` ("next free index: 18" after `content`, §4).
- **Rules 7.** `RULES_CURRENT = 7` with `RULES7_FROM` = the release date. Rules 7 = rules 6 for every world that does not use `market`/`content`, asserted by the replay corpus (w1–w8 × rules 3–7 × 8 policies × 25 seeds, byte-identical final state).
  - Every world that uses `market` has `minRules: 7`, including w10 (not yet released, so this is free).
- **Draw counts:** `draws: {init: 1 + 12×3, month: 69, landing: {}}` (the 12×3 at init = pool pick, q, listing jitter per slot). Asserted by `G-draws` with opposite policies.
- **Seed reproducibility:** `M-seed` replays the same seed and the same actions to the same `st.mkt`, in Node and in the pinned Deno verifier.

### 3.9 Light candle view for the existing tickers of w1–w4 (no engine change)

- **Render-only file** `js/render/candles-lite.js`. The engine, the state, saves and `engine.bundle.json` stay unchanged (asserted: bundle SHA identical).
- **Live mode.** After every engine call the UI already makes, it reads `st.month` and `st.prices` and keeps per-ticker open candles in UI memory. It uses the §3.4 rules:
  - open = the last close;
  - every observed change is a print;
  - close when `st.month` advances.
- **Rebuild mode** (resume, review, or "כך זזו המחירים"): in a worker, `replay(replayConfig(st), st.actions.slice(0,k))` is stepped k = 0…N, sampling `st.prices` after each step. The result is exact, because prices change only inside engine steps. Cap: 200 months × the world's tickers.
- **Honesty.** In w1–w4, card prices move only on cards (IDX monthly), so many candles are flat (doji). That is shown as is, with the caption "המחיר זז רק כשיש חדשות". IDX in history mode uses `L.idxHist`.
- **Tests:** `L-candle` (invariants; the last close equals `st.prices[tk]` at every step; live = rebuild on 100 replays) and `L-nochange` (engine bundle SHA unchanged).

---

## 4. Dynamic content pools (shared, `js/systems/content.js` + `js/content/<pool>.js`)

**The tile TYPE stays on the board. The CONTENT comes from pools.** Worlds w1–w8 keep their legacy decks untouched. Worlds with
`minRules ≥ 7` declare `content: {pools: {D:'deal', M:'news', …}}`. A legacy deck may be wrapped as a pool (`legacy:true`) for reuse, without changing w1–w8.

### 4.1 Pools

`deal` · `doodad` · `news` (market/company/regime text) · `crisis` · `opportunity` · `personal` (life events) · `economic` (macro) ·
`company` (= the §3.1 company pool) · `asset` (module asset templates: players, plots, candidates, policies books) · `round` (w15) ·
`mission` · `rumor`.

### 4.2 Entry schema (data only; validated)

```
{ id:'deal.boutiqueHotel', v:1, pool:'deal', tiles:['D'], worlds:['w5','w13','∞'] | tiers:[5,12], tags:['tourism','property'],
  w: 10,                                        // integer base weight
  mult: { regime:{bubble:1.5, recession:0.5}, cycle:{rec:0.7}, trait:{'seasonal':2} },   // multiplicative, integers ×10 internally
  needs:['asset:hotel>=1'], excl:['flag:crisis'], firstMonth:0, lastMonth:null,
  cooldown: 8,  perRun: 2,  trigger: null | {on:'regime:recession', months:6},
  gen: { cost:['band',0.4,0.9], down:['ofCost',0.2,0.35], cf:['yield',0.006,0.011] },    // econ-relative ranges → integer ₪ via econ.band
  text: { n:'מלון בוטיק {area}', d:'… {cost} …', q:'…' }, vars:{ area:['הטיילת','העיר העתיקה'] },
  effects: {…pool schema…},  preview: true,  risk: 'sealed:occupancy' | null }
```

### 4.3 Selection (fixed draws, `content` stream = STREAMS index 17)

1. **Eligible** = the pool entries for this world/tier/tile, filtered by `needs/excl`, the month window and `perRun`. Entries in the active pack only (§4.4).
2. **No-repeat:** drop entries in the pool's recent ring (window `W = min(8, ⌊eligible/2⌋)`) and entries inside their own `cooldown` months.
3. **Weight** = `w × Π mult` (integers). Order is stable by `id`. **Draw 1** = cumulative pick.
4. **Draws 2…D(pool)** fill the `gen` ranges and `vars`. **D is constant per pool** (deal 4, news 2, crisis 3, mission 2, …). It is always fully consumed, even if the entry needs fewer.
5. **Empty set?** Relax the cooldown to W/2, then drop the ring, then fall back to the world's legacy deck. That deck is non-empty: the validator checks it.
6. **Freeze:** the instance gets `iid = pool:id:turn`. Every number is copied into the pending card or the asset. A later pack edit, rotation or market change never rewrites it (I8, `C-freeze`).

### 4.4 Rotation timing

- **Game start:** a seeded **active pack** per pool, `activeShare` 70 % of eligible entries (min 8 per pool × tier). Two seeds of the same world therefore feel different.
- **Periodic:** every 12 paydays, swap 25 % of each active pack. The draws are fixed: 1 per pool.
- **Triggered:** entries with `trigger` switch on for `months` when their event fires (a regime change, a crisis card, a module flag). Examples: recession → "קניית חברה במצוקה"; drought → "זכויות מים למכירה".

### 4.5 Seen tracking, seeds, versions

- **In game:** `st.content = {recent:{pool:[ring W]}, last:{id:m}, count:{id:n}}`.
  - Bounded: `last` is pruned to entries inside their cooldown; `count` keeps only `perRun`-limited ids. Budget ≤ 8 KB.
- **Profile `contentSeen`:** local only. It is used for library "חדש!" badges and for the **fresh-seed picker** in free play: try up to 8 seeds and pick the one whose start pack has the most unseen entries.
  - It **never** changes a seeded game's outcome, because the game stays a pure function of (world, rules, seed, actions).
  - It is never used in daily, ranked or room games.
- **Versions:** `CONTENT_V` is pinned with the rules. Results store `content_v`. Editing a pack = a new `CONTENT_V`, and the verifier bundle keeps the previous pack for old results.
- **Missions** (`mission` pool): at most 1 active. The reward is a library card + small happiness, **never ★ and never > 1 month of expenses** in cash. A mission must not be a money printer.

### 4.6 Validator `C-*`

- `C-schema`: required fields; every `{placeholder}` has a var or a gen field.
- `C-band`: generated money is inside `econ.band` for every world in `worlds/tiers`.
- `C-free`: no `cost ≤ 0 && cf > 0` without `risk`.
- `C-empty`: 10k simulated landings per world × regime never fall to an empty set without a legacy fallback.
- `C-repeat`: the window is honoured.
- `C-seed`: same seed → same content ids.
- `C-freeze`: a pack edit leaves frozen instances bit-identical.
- `C-draws`: D is fixed per pool.

---

## 5. Continuation mode ∞ "הכלכלה הפתוחה" (after w25)

**Unlock:** ★ in w25 (the owner/admin override applies). **Never ranked:** `ranked:false`, no ★, no daily, no leaderboard. Its own local stats
(runs finished, best goal %) and cosmetic badges. Allowed in private rooms with `access:'room'`, where everyone gets the same RunSpec and seed.

### 5.1 A run = a RunSpec (≤ 2 KB JSON, stored in the save, replayable)

```
{ v:1, runId, seed, rules:7, content_v,
  base:'w14',                                  // board, tiles, module set and pools of a released world
  traits:['volatileRates','sectorBubble'],     // 0–2 map traits, each compatible with base
  start:{ charTemplate:'base:riskChief', scale:1.0 },          // a base character, optionally scaled 0.6–1.4
  market:{ regime0:'recession', tilt:{bubble:+10} },           // only if base uses market
  events:{ weights:{crisis:1.3} },
  goal:{ template:'nwLiquidity', nw:700e6, liqMonths:6, hold:3 },
  diff: 3 }                                    // → maxMonths factor, regime harshness, trait count
```

- **TRAITS (data, each with `needs` modules and `conflicts`):**
  - עונתיות חזקה (season profile ×1.5)
  - ריבית תנודתית (rate deck amplitude ×1.5)
  - מטבע חלש (FX drift)
  - שוק דובי (regime0 recession)
  - בועה בענף (bubble start)
  - רגולטור קשוח (+2 pp capital/solvency)
  - תחרות עזה (rivals ×1.3)
  - מידע חלקי (dd ×1.5, ranges +30 %)
  - משבר באמצע (a crisis at a sealed month 18–30)
  - הון מועט (cash ×0.6, maxMonths +10 %)
- **GOAL_TEMPLATES (new decisions, not bigger numbers):** each is built only from registered goal types.
  - `nwLiquidity` (NW and liquidity months)
  - `incomeNoMargin` (`passive12` + `noDefault` margin)
  - `surviveStorms` (`maxDrawdown` ≤ 30 % across ≥ 2 recessions + NW)
  - `fewLoans` (NW with at most 2 loans: a module flag)
  - `dualImpact` (NW + impact, w4 style)
  - `stableGroup` (w12/w25 style)
  - Parameters scale from the base world's own target × a diff factor (0.8–1.3). They are clamped to `bounds.nwMax ÷ 10` and must pass the validator's static reachability bound.
- **Replay a known map with a new seed** ("אותו עולם, זרע חדש"): available from any finished world, outside ∞.
  - Same world and character, `seedFrom('replay:'+world+':'+n)`, `mode:'replay'`, unranked.
  - Stars only if that world's normal free play already gives them (no change to today's rule).

### 5.2 Composer (`js/systems/run.js`)

- `composeRun(seed)` uses its **own** PRNG from `seedFrom('run:'+seed)`, never the game streams. It picks base → traits (respecting `needs/conflicts`) → start → market → goal.
- **Termination:** at most 32 attempts. Each attempt is statically checked: compatibility, money bounds, the goal static bound, and `t3 < t2 < maxMonths ≤ 200`.
  After 32 failures it falls back to one of 12 curated known-good specs. The composer therefore always returns, deterministically.
- **The output is data only.** `createGame` reads the RunSpec as a world overlay (traits = `systems`/`econ` overrides, start = character overrides, goal = goal object). No new engine branches.

### 5.3 Guards

| guard | rule | test |
|---|---|---|
| overflow / NaN | all money integer ₪; every scale factor applied once with `Math.round`; goal ≤ `bounds.nwMax ÷ 10`; values > `bounds.nwMax` clamp and end the run as "שיא" | `R-nan`: 200 composed runs × smart/blind × 200 months, 0 NaN/Infinity, NW = assets − liabilities |
| bounded history | every ring declared with a max (candles 36/60, news 24, closed 24, grave 12, content W, log 80, maxDrawdown 200) | `R-rings` |
| bounded save | serialized state ≤ 300 KB at month 200 (RunSpec ≤ 2 KB) | `R-save` |
| terminating generators | composer ≤ 32 attempts; content fallback chain; market relist stops when the pool is exhausted; auctions ≤ 3 rounds | `R-term` (10k seeds, max steps asserted) |
| months | ≤ 200 (verifier clamp); after the goal, "המשך" runs to 200 then ends cleanly | `R-end` |
| fairness in rooms | same RunSpec + seed → same stream positions for opposite policies | `G-draws` on 50 RunSpecs |

---

## 6. Build waves, sizes and acceptance gates

### 6.1 Waves (dependency order)

| wave | content | depends on | size |
|---|---|---|---|
| A0 | rules 7 + streams `exch`(16)/`content`(17) created lazily per world · `content.js` + pools + `C-*` validator · goals `modValue.cmp`, `noDefault.key`, `maxDrawdown` · `V-tier`, `V-adapter`, `V-mods` · titles 45/55/65/75 · **`candles-lite.js` (render-only, can ship independently, no pin)** | DESIGN wave 0 | L (content ~400 + pools data ~600 + validator ~200 + candles-lite ~250 + tests ~500) |
| A1 | **w10** = `market` (first) + `portfolio` | A0 | XL (market ~900 + data ~400 + portfolio ~800 + w10 data ~300 + tests ~1,000) |
| A2 | w9 (`energy`) ‖ **w13** (`auction` + `league`) | A1 for nothing (w9 independent); w13 needs A0 | L ‖ L (auction ~450, league ~280, w13 data ~350, tests ~500) |
| A3 | w11 (`multinational`) ‖ **w14** (`credit`) ‖ **w15** (`platform`) ‖ **w16** (`harvest`) | A1 (w15/w16 need market + portfolio margin) | XL ‖ L (~700+350) ‖ L (~650+350) ‖ M (~280+350, mostly reuse) |
| A4 | w12 (`holding` + all `light()`) ‖ **w17** (`trials`) ‖ **w18** (`insure`) ‖ **w19** (`market.issuer`) | A2–A3 (light() exports of the modules they compose) | XL ‖ M (~280+350) ‖ L (~700+350) ‖ M (issuer ~250 inside market + 350 data) |
| A5 | **w20** (`portfolio.flows/short`) ‖ **w21** (`lbo`) ‖ **w22** (`capture` + `public.light`) | A3–A4 (credit, auction, holding.light) | M (~350 options + 350 data) ‖ M (~280+350) ‖ M (~280 + public.light 120 + 350) |
| A6 | **w23** (`market.curve` + `credit.counterparty` + `carry`) ‖ **w24** (`public`) | A5 | L (curve ~250, counterparty ~150, carry ~280, data 350) ‖ L (~700+350) |
| A7 | **w25** (`portfolio.pledge` + `apex`) → **∞** (`run.js` ~450 + templates/traits data ~300 + tests ~400) | everything | L → M |

Order inside a wave is unchanged from DESIGN §5.2:
module → data → validator green → sim gates → panel descriptor → 2D/3D theme → room flags → independent review → owner approval → merge.
Every world stays behind `?ff=world-wN` until its gates pass. Every wave that touches engine/worlds/mech/rng **re-pins `engine.bundle.json` and needs
the owner's explicit approval before the verifier redeploy** (TASK_BOARD rule). A0's `candles-lite.js` is render-only and does not.

Rough engineering total for w13–w25 + market + content + ∞: **≈ 17–19k lines including tests**. The 6 new modules account for ≈ 4.1k of it, the adapters ≈ 2k, and world data ≈ 4.5k.

### 6.2 Shared gates (every world; ids as in `tools/balance-data/gates-wN.json` and DESIGN §5.3)

`G-guide` · `G-blind` · `G-smart` · `G-reach` · `G-loss` · `G-dom` · `G-frugal` · `G-durable` · `G-time` (already in the JSON files) plus
`G-ramp` and `G-big` (DESIGN §5.3, to be added to the JSON writer). New ones:

- `G-ramp` (made precise): smart in-time of a world ≤ max(smart in-time of the worlds that can unlock it) + 5 pp.
- `G-ramp2` (I6): at least 2 of the 4 commitment metrics rise along every unlock edge.
  The metrics are median ticket ÷ start equity, months payment → income, fixed-commitment share and the coupled-risk count. All are computed by the sim.
- `G-lock` (I3) · `G-draws` (I7, every module incl. `exch`/`content`) · `G-room` (every module tile's `safe` is non-spending; fuzz).

### 6.3 World-specific gates (named like the existing `W5-plan`, `W8-presale`)

Each listed ablation must lose to smart by ≥ 5 pp in-time unless stated otherwise.

| world | gates (ablations in sim `tools/policies/<mech>.mjs`) |
|---|---|
| w10 | `W10-margin`: `maxMargin` best p90 NW **and** worse in-time · ablations `allCash`, `privateHeavy`, `oneSector`. Plus `M-*` |
| w13 | `W13-cliff`: `allInPromotion` fails (bankrupt or FFP) ≥ 20 %; `neverSpend` ≤ smart −10 pp · `W13-trade`: `buyYoungSellPeak` not > 60 % of dominance appearances · ablations `starsOnly`, `bidMaxAlways` |
| w14 | `W14-select`: `priceLow` grows the book but loses; `priceHigh` shows new-loan PD ↑ ≥ 20 % · `W14-run`: runs in ≥ 5 % of naive games, ≤ 2 % of smart · ablations `maxMismatch`, `noDividendEver` |
| w15 | `W15-runway`: `blitzGrowth` runs out of runway ≥ 25 % · `W15-dilute`: `raiseEveryRound` loses via dilution · ablations `neverRaise`, `acceptFirstOffer` |
| w16 | `W16-hedge`: `hedge100` and `hedge0` both lose; over-hedge buy-back losses appear in ≥ 60 % of drought seeds · ablations `monoCrop`, `neverStore` |
| w17 | `W17-stop`: `neverAbandon` loses ≥ 8 pp; `abandonAll` and `licenseAll` lose · `W17-cliff`: `noPipeline` winners fail `G-durable` ≥ 40 % |
| w18 | `W18-price`: `underprice` grows then fails solvency ≥ 20 % · `W18-cat`: `noReinsurance` bankrupt or insolvent in ≥ 15 % of cat seeds · ablations `maxReinsurance`, `coastHeavy` |
| w19 | `W19-guide`: `sandbag` and `overpromise` both lose · `W19-buyback`: `buybackAtTop` loses · ablation `issueAlways` |
| w20 | `W20-flow`: `benchmarkHug` fails the AUM part ≥ 60 %; `maxActive` outflow spiral ≥ 20 % · `W20-short`: `shortHeavy` squeeze-bankrupt ≥ 10 % · ablation `gateEarly` |
| w21 | `W21-curse`: `bidMaxAlways` DPI < 1.5 in ≥ 40 % · `W21-exit`: `holdToEnd` forced exits lose · ablations `maxLeverage`, `recapAlways` |
| w22 | `W22-sequence`: `sellAllEarly` and `holdAll` both lose · `W22-services`: `noServices` loses residents (goal part fail ≥ 50 %) · ablation `bondMax` |
| w23 | `W23-carry`: `carryMax` funding or counterparty blow-up ≥ 15 % · `W23-cash`: `noTrade` fails ≥ 95 % · ablations `noLC`, `noFxHedge` |
| w24 | `W24-rg`: `austerityAlways` and `spendAlways` both lose · `W24-cred`: `ruleBreaker` average spread ≥ +1 pp vs smart · ablation `privatiseAll` |
| w25 | `W25-pledge`: `pledgeMax` spiral ≥ 20 % · `W25-control`: `issueAlways` loses control ≥ 30 % · ablations `guaranteeAll`, `ringFenceAll` |

### 6.4 Market, content, run, light-view gates (CI, `tests/market.test.mjs`, `tests/content.test.mjs`, `tests/run.test.mjs`)

- `M-candle` (§3.4 invariants) · `M-seed` · `M-draws` (69/payday) · `M-id` (ids monotone, never reused, no name reuse per game).
- `M-bk`: bankruptcy → claim paid at +3, loss in `closed`, relist gets a new id after ≥ 6 months.
- `M-spread` (fraud ≤ 15 % per company/slot/tile over 500 seeds) · `M-target` (event picks identical under opposite holdings).
- `M-freq`: per-regime event frequencies within ±20 % of the table over 2,000 runs.
- `M-roundtrip` · `M-dom`: none of `holdIndex`, `momentum`, `buyDip`, `allCash` is top in > 60 % of cells · `M-fict` · `M-size` (`st.mkt` ≤ 40 KB at month 200).
- `C-schema`, `C-band`, `C-free`, `C-empty`, `C-repeat`, `C-seed`, `C-freeze`, `C-draws` (§4.6).
- `R-nan`, `R-rings`, `R-save`, `R-term`, `R-end` (§5.3).
- `L-candle`, `L-nochange` (§3.9).
- Validator: `V-tier`, `V-adapter`, `V-mods`, plus the existing checks 1–8 (DESIGN §4.4).
- The replay corpus stays byte-identical for w1–w8 across rules 3–7.

### 6.5 Per-world acceptance checklist (DESIGN §5.4, unchanged, applied to w13–w25)

1. validator green;
2. module draw counts;
3. serialize round-trip at every rest point;
4. every `Z` action replayable and verifiable;
5. `safe` non-spending;
6. goal parts and progress ∈ [0,1];
7. lazy-load resume;
8. e2e desktop + 360 px, 3D and 2D;
9. room game with a redacted view (module `sealed` paths);
10. big-number formatting (`money()` up to ₪10 מיליארד; `tiny` ≤ 6 chars);
11. independent review;
12. owner approval.

---

## 7. Open decisions (owner / director)

1. Rules 7 cut-over date (`RULES7_FROM`), with the re-pin and verifier redeploy (owner approval).
2. The DB migration (bigint, `game.worlds`) before any world ≥ w12 is ranked. Until then all new worlds are free play / private rooms only.
3. The w24 theme (a fictional island state's treasury): confirm it is acceptable for the audience. The neutrality rule is in its card.
4. A sports world (w13) uses fictional clubs and a fictional league only. Confirm there are no real club names (the validator denylist extends to clubs).
5. Whether ∞ runs may be shared as a "RunSpec code" between friends (data only, never ranked).
