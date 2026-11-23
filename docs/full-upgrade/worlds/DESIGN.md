# עולמות והתקדמות — Design (planning & economy worker)

Worker: planning & economy, team "עולמות והתקדמות" · 2026-11-23 · branch `feature/3d-world-upgrade` · read-only on code.
Binding inputs: `BRIEF-worlds.md` (owner addendum), BRIEF §11–§14, §19, §24–§25, research E1 / J1 / O1, `docs/next-level/TASK_BOARD.md`.
Per-world specs: [`w5-tourism.md`](w5-tourism.md) · [`w6-industry.md`](w6-industry.md) · [`w7-retail.md`](w7-retail.md) ·
[`w8-metropolis.md`](w8-metropolis.md) · [`w9-energy.md`](w9-energy.md) · [`w10-finance.md`](w10-finance.md) ·
[`w11-multinational.md`](w11-multinational.md) · [`w12-empire.md`](w12-empire.md).

All numbers marked **TUNE** are starting points for the balance worker. Nothing here has been simulated yet, and no world is
"balanced" until it passes the gates in §5.3 (BRIEF-worlds §10).

## תקציר

- **12 עולמות:** ארבעת הקיימים לא משתנים (אותם חוקים, שמירות ותוצאות). אחריהם 8 עולמות חדשים. אחרי w5 יש **הסתעפות**: תעשייה, מסחר
  או נדל"ן (מספיק ★ באחד מהם כדי להמשיך). אחר כך שוב בחירה: אנרגיה או פיננסים. אחר כך התאגיד הבינלאומי והאימפריה.
- **פתיחה הוגנת:** אף עולם לא דורש יותר מ־★ אחד בעולם קודם. אף עולם ארוך לא חוסם לבדו את כל ההמשך. מסלול מינימלי
  מ־w1 ל־w12 עובר ב־10 עולמות, לא ב־12.
- **הסכומים גדלים ובמקביל משתנים המנופים:** מאלפי ₪ (w1) עד ₪2 מיליארד (w12). כל עולם מוסיף מנוף קושי אחר (עונתיות, מינוף תפעולי, הון חוזר,
  מימון בשלבים, זמן החזר ארוך, מתאם ונזילות, האצלת סמכויות, הדבקה בקבוצה) ולא רק מכפיל מספרים.
- **מנגנון אחד חדש לכל עולם,** במודול נפרד (`js/worlds/mech/*.js`) עם חוזה hooks אחיד. אין קובץ ענק של `if (world === …)`.
  רוב המנגנונים נשענים על מערכות קיימות (עסקים, בדיקת נאותות, מחזור כלכלי, יריבים, דולר, ריבית, מוקד).
- **ממצאי תשתית חוסמים:**
  - (1) `rr_finish` דוחה שווי נקי מעל ±₪2 מיליארד והכנסה פסיבית מעל ±₪100 מיליון (`bad_values`). העמודות הן `integer`. w12 ייכשל.
  - (2) ב־DB יש `CHECK` שמתיר רק `w1`–`w4` באתגרים.
  - (3) `tools/sim.mjs` מחשב seed לפי `wid.charCodeAt(1)`, ולכן `w10`/`w11`/`w12` יקבלו את אותם seeds כמו `w1`. גם ה־regex `^w\d$` לא מזהה אותם.
  - (4) `fmtM` כותב "₪1000 מיליון" ואין לו "מיליארד".
- **עולם ראשון מקצה לקצה: w5 עיר התיירות** (עונתיות ותפוסה). הוא השער לכל ההמשך, ובו בזמן בודק את כל חוזה המודול: משבצת חדשה, יעד חדש
  (ממוצע 12 חודשים), stream חדש עם מספר הגרלות קבוע, פעולת `Z` בין הטלות, מדדים ופאנל, מודלים בעיר ומדיניות סימולציה.

---

## 1. Progression map

### 1.1 Order by complexity (what each world adds)

The existing four already teach, in order: assets vs liabilities (w1) → leverage and rates (w2) → exposure and hedging, net worth
(w3) → power law, patience, a second goal (w4). They stay unchanged (ids, board, decks, goals, stars, saves, rules 3/4/5 outcomes).

The new worlds move from **personal freedom** to **running an economic unit**. After w4 the player has "escaped". From w5 on, the goal is an
organisation-scale target, with personal expenses and life still present. The order follows how many interacting state variables a
decision has to weigh:

| # | id | name | one new lever (BRIEF-worlds §4) | builds on |
|---|---|---|---|---|
| 5 | w5 | **עיר התיירות** | time-varying cash flow inside a year (seasons), capacity pricing | business system, w2 leverage |
| 6a | w6 | **אזור התעשייה** | fixed costs and capacity (operating leverage), deferred maintenance as hidden debt | business capacity, cycle, dd |
| 6b | w7 | **רשתות המסחר** | the cost of fast expansion: working capital, ramp-up, management span | business inventory, rivals, dd |
| 6c | w8 | **מטרופולין הנדל"ן** | long commitments, staged financing, delays, presales (gap between paying and earning) | w2 rate, dd, rivals |
| 7a | w9 | **מדבר האנרגיה** | the longest payback, capital recycling (build, refinance, repeat), queue competition | w8 projects module, w2 rate, rivals |
| 7b | w10 | **מרכז הפיננסים** | correlated exposure, liquidity classes, margin calls | tickers, w2 bonds, w3 USD, cycle, research focus |
| 8 | w11 | **התאגיד הבינלאומי** | management attention and delegation under hidden information, multi-currency, supply-chain links | w3 fx generalised, dd, focus/🔋 |
| 9 | w12 | **האימפריה** | combining systems: group structure, guarantees vs ring-fencing, contagion; stability as a goal | every module above (light versions) |

Names adapted from the owner's list. "מדבר האנרגיה" avoids a second "עמק" next to w4 "עמק העתיד".

**No duplication:**
- w8 develops (builds, staged draws, presales), while w2 buys finished income property with a mortgage.
- w10 is about *correlation and liquidity of a whole portfolio*, while w3 is about one currency factor and a hedge per asset.
- w11 reuses w3's FX only as a background layer. Its decision centre is delegation.
- w9 shares the construction lifecycle with w8. Its decision centre is different: revenue contract (PPA vs merchant) and refinancing to recycle equity.

### 1.2 Map (a DAG, not a line)

```
w1 ─► w2 ─► w3 ─► w4 ─► w5 ─┬─► w6 אזור התעשייה ─┐
                            ├─► w7 רשתות המסחר  ─┼─► w9 מדבר האנרגיה ─┐
                            └─► w8 מטרופולין    ─┘   w10 מרכז הפיננסים ─┼─► w11 התאגיד ─► w12 האימפריה
                                 (any 1 opens w9 and w10)               │
                                 (any 2 of w6–w8, plus 1 of w9/w10) ────┘
```

### 1.3 Unlock rules (data in each world's meta, evaluated by one function)

`unlock: [{ any: [ids], count: k, stars: 1 }, …]`. All clauses must hold. A referenced world counts only if it is itself unlocked. This
keeps today's rule that stars banked from a daily challenge in a locked world count once the chain reaches it (`progress.js:8-9`).

| world | rule | why |
|---|---|---|
| w1 | always | — |
| w2–w4 | `[{any:[prev], count:1}]` | unchanged (= today's `isUnlocked`) |
| w5 | `[{any:['w4'], count:1}]` | trunk |
| w6, w7, w8 | `[{any:['w5'], count:1}]` | the specialisation fork: all three open together |
| w9, w10 | `[{any:['w6','w7','w8'], count:1}]` | one specialisation is enough. Both open together (second fork) |
| w11 | `[{any:['w6','w7','w8'], count:2}, {any:['w9','w10'], count:1}]` | breadth before the multinational, never one specific world |
| w12 | `[{any:['w11'], count:1}]` | capstone |

- **Never ★★ or ★★★ as a gate.** ★ = a win within the character's limit (today's rule).
- **Shortest path to w12:** w1–w5, two of w6–w8, one of w9/w10, w11, w12 = **10 worlds**. Two worlds are optional. No single long world blocks everything after it.
- **Owner/admin "everything unlocked"** (memory: the owner wants everything unlocked on his side) must keep working: the evaluator takes the existing override first.
- **Private-room temporary access (BRIEF-worlds §8):**
  - A room host may play any world they have unlocked with guests who have not.
  - The seat result is stored with `access:'room'`. `recordGame` then gives **no stars, unlocks or titles** for a world locked for that player, and the result is never ranked.
  - The lobby says so before joining: "תשחק בעולם שעוד לא פתחת. התוצאה לא תיספר להתקדמות."
- **Locked-world card** (BRIEF-worlds §5), from meta:
  - what opens it (rendered from the rule: "★ באחד מ: אזור התעשייה · רשתות המסחר · המטרופולין")
  - what you learn (`learn`), what is different (`newHere`), and difficulty 1–5 (`diff`)
  - estimated length `estMin`, **shown only after it is measured** by the sim (median rolls × J1's 7–12 s per roll + card time). Until then it is hidden, never guessed.
- **Titles** (`achievements.js:131` TITLES) are by total stars (max 12 today). Extend, without renaming the existing ones:
  - 0 עכבר · 2 חוסך · 4 משקיע · 7 טייקון · 10 מיליונר · 12 אגדה
  - then new ones: 16 בעל אימפריה קטנה · 21 איל הון · 27 מגנט · 36 אגדה כלכלית
  - Fix the hard-coded "כל 12 הכוכבים" in `progress.js` nextGoal by computing it.

### 1.4 Money between worlds (BRIEF-worlds §6)

Runs stay separate. No capital carries across: each world has its own start conditions (equal terms for competitions). Persistent progression
is unlocks, stars, titles, achievements, cosmetic items (a building skin per world on ★★★) and the learning history. A later
"קריירת טייקון" campaign with carried capital is **out of scope**. If added, it gets its own save namespace and mode, is never ranked,
and never feeds stars.

---

## 2. World table (summary)

Money scale = start equity (cash + equity in starting assets) → goal. Difficulty is design intent (1–5), to be confirmed by sim. Months = the
first-star limit (TUNE). All new worlds keep monthly paydays (1.43 rolls per month, J1). Timelines are compressed and labelled
"במשחק" as a simplification, so a run stays at 60–85 rolls (J1: won runs today take 65–87).

| world | money scale | diff | core mechanic | unlock | win goal | ★ limit / ★★ / ★★★ |
|---|---|---|---|---|---|---|
| w1 השכונה | ₪2k–30k → passive ≈ ₪7–30k/mo | 1 | assets vs liabilities | always | passive ≥ expenses | per character (52–82) |
| w2 העיר הגדולה | ₪30–90k → deals to ₪3M | 3 | rate, fixed/variable, upgrades | ★ w1 | passive ≥ expenses (hold 3, rules 5) | 76 / 42 / 30 |
| w3 הנמל הגלובלי | ₪0.4–0.8M (+ asset) → ₪9M | 2–3 | USD, hedging, gold | ★ w2 | NW ₪9M | 60 / 43 / 32 |
| w4 עמק העתיד | ₪1.5–3.2M → ₪9M | 3 | power-law angels + impact | ★ w3 | NW ₪9M + 90 impact | 70 / 45 / 37 |
| **w5 עיר התיירות** | ₪3–6.5M → ₪300k/mo owner income (≈ ₪25–40M assets) | 2 | **seasons + occupancy pricing**, allotments | ★ w4 | 12-month average owner income ≥ ₪300k/mo | 72 / 58 / 46 |
| **w6 אזור התעשייה** | ₪10–20M → ₪80M | 3 | **capacity, maintenance, operating leverage**, contracts vs spot | ★ w5 | NW ₪80M (plants valued on sustainable profit × condition) | 72 / 58 / 46 |
| **w7 רשתות המסחר** | ₪8–15M → ₪120M | 3 | **growth vs profitability**: ramp-up, working capital, management span, own vs franchise | ★ w5 | NW ₪120M **and** liquidity ≥ 4 months of chain fixed costs | 72 / 58 / 46 |
| **w8 מטרופולין הנדל"ן** | ₪20–40M → ₪250M | 4 | **staged development**: equity first, presale threshold, sealed delays, construction loan | ★ w5 | NW ₪250M (work in progress at cost, not at projected value) | 80 / 64 / 52 |
| **w9 מדבר האנרגיה** | ₪25–60M → ₪3.5M/mo operating income | 4 | **build, refinance, repeat**; PPA vs merchant; grid queue | ★ one of w6–w8 | operating income (net of debt service) ≥ ₪3.5M/mo, hold 3 | 84 / 68 / 56 |
| **w10 מרכז הפיננסים** | ₪80–150M → ₪400M | 4 | **factor exposure, liquidity classes, margin calls**, capital calls | ★ one of w6–w8 | NW ₪400M, hold 3 (★★★ also needs 0 forced liquidations) | 72 / 58 / 46 |
| **w11 התאגיד הבינלאומי** | ₪120–200M → ₪800M | 5 | **delegation under hidden information** (attention slots, managers, audits), multi-currency, supply links | ★ two of w6–w8 + ★ one of w9/w10 | consolidated NW ₪800M | 84 / 68 / 56 |
| **w12 האימפריה** | ₪500–700M equity (₪1.2B gross) → ₪2B | 5 | **group structure**: ring-fence vs guarantee, contagion, annual capital allocation | ★ w11 | NW ₪2B **and** no division default in the last 24 months **and** liquidity coverage ≥ 1, hold 3 | 84 / 70 / 58 |

Curve: each step is about ×1.5–3 in money and adds a lever. Asset yields on equity *fall* from roughly 40–100%/yr in w1–w3 (game-exaggerated,
`common.js` buyGood mentor note) to about 15–30%/yr at average conditions in w8–w12. So the same doubling needs more leverage, longer
commitments and more liquidity planning. That is what makes "a new league" more than bigger numbers (BRIEF-worlds §3–§4).

---

## 3. Per-world summaries (details in the per-world files)

Each file has: story, visual language, money ranges, characters (pros/cons), win + stars, asset and deal types, the mechanic and its exact
engine mapping, unique events, risks, recovery, the lesson, and solo/online/competition fit. One line each here:

- **w5 עיר התיירות** ("מפרץ השמש"). Hotels, a resort, a water park, a desert spa, a conference centre, vacation apartments, a beach restaurant and a dive centre.
  - Mechanic: a public 12-month calendar with season curves per asset profile (beach / winter-sun / flat), plus a city demand index.
  - Decisions: a **season price plan** per asset (premium in peak, budget off-peak), staffing (seasonal vs year-round → reputation), and tour-operator **allotments** on a new 'N' tile (cash now at a discount vs walk-in upside).
  - Goal on a **12-month average**. Lesson: judge a seasonal business by the year, and summer must fund winter.
- **w6 אזור התעשייה.** Production lines have capacity, a condition score and a maintenance policy (preventive / basic / run-to-failure).
  - Breakdown hazard comes from a sealed monthly draw per line slot.
  - Choices: long contract (volume, penalties) vs spot orders driven by the cycle, plus a third shift (+capacity, ×wear, 🔋).
  - New lines arrive 6 months after the order. Valuation discounts poor condition, so deferred maintenance is visible as lost value.
- **w7 רשתות המסחר.** Branches go through a ramp-up curve. Central purchasing gets cheaper per unit with scale. A regional manager is needed per 6 branches, or every branch loses sales.
  - Opening a branch is a hidden-location gamble, which a location survey (dd) narrows. A new branch also cannibalises nearby ones.
  - Inventory has lead times. Own vs franchise is a choice. The goal pairs value with liquidity.
- **w8 מטרופולין הנדל"ן.** Project lifecycle: land → permits (sealed delay) → construction (staged draws) → completion → sell or hold.
  - Equity goes in first. The construction loan releases only above the presale threshold. Capitalised interest grows with every delay month.
  - Contractor choice changes overrun and default risk. Rate cards move both loan cost and buyer demand. The goal counts work in progress at cost.
- **w9 מדבר האנרגיה.** Projects need a grid-connection slot (contested by rivals). They take 8–24 game months to build. At completion you choose PPA (fixed) or merchant (spot power index).
  - An operating plant can be refinanced at up to 75% of its rate-dependent DCF value to fund the next one. Storage earns on spot spreads, a natural hedge for merchant solar.
  - Capacity factor is a sealed monthly draw per plant slot.
- **w10 מרכז הפיננסים.** Every holding has factor betas (equity, rates, credit, property, USD) and a liquidity class (daily / monthly / locked).
  - Market cards are factor shocks, so correlated losses arrive together. Borrowing against liquid holdings brings maintenance margin and margin-call events; fire sales of illiquid assets cost 20–40%.
  - Private-equity commitments bring later capital calls. The research focus reveals exact exposures.
- **w11 התאגיד הבינלאומי.** Subsidiaries in 5 fictionalised countries/currencies, each run by you (costs one of 3 attention slots + 🔋) or by a hired manager.
  - A manager has sealed competence and integrity. Audits (dd) and results reveal them, and a bad one means underperformance or a fraud event.
  - Supply links propagate disruptions. Dual sourcing costs more and cuts propagation.
- **w12 האימפריה.** A holding with 5–6 divisions, light versions of the w5–w11 models.
  - Each division's debt is either ring-fenced (+1.5 pp) or guaranteed by the holding (cheaper, but a default spreads).
  - Multi-factor storms hit divisions by exposure. An annual capital-allocation card and dividend pressure from the board add decisions. Stability is part of the goal.

---

## 4. Infrastructure spec

### 4.1 World config: data-driven, two layers

**Layer A — `js/worlds/meta/<id>.js` → aggregated by `js/worlds/meta.js` (small, always loaded by the lobby):**
- `id, order, tier, name, tagline, learn, newHere, diff, estMin|null, unlock, art, ranked, minRules`
- `scale` (label for the card: "מיליוני ₪")
- `goalLabel`
- `characters: [{id, name, icon, gender, desc, maxMonths, maxMonths4?, stars}]`: exactly what `starThresholds` and the picker need

`progress.js` and `lobby.js` import **only meta** (today `progress.js` imports `starThresholds` from the engine, and `worlds/index.js`
imports every full world).

**Layer B — `js/worlds/<id>.js` (full rules, loaded on demand):** today's shape plus these new blocks:

| block | content |
|---|---|
| `mechanic` | module id (string) or array of ids, resolved through `js/worlds/mech/index.js` |
| `econ` | **central money config of the world**. Every ₪-absolute constant the engine or systems use today must read it: `loanUnit, autoUnit, ddMinFee, focusDebtFee, sideReportFee, tipDoodad, doodadWealth, lifeMoneyScale, chainMoneyScale, givingUnit, bizScale`, and `band: {deal:[min,max], monthly:[min,max]}` for the validator. w1–w4 get explicit values equal to today's constants, so their outcomes are byte-identical. New worlds get defaults from one function `econDefaults(moneyScale)` and override only what they need. **No multiplier is written inside engine code.** |
| `systems` | per-world tables that today live keyed by world id inside the system files: `cycle` (`cycle.js:20` CFG), `dd` (`dd.js:23-26` CFG + `poolFor`), `rivals` (`rivals.js:44-47`), `focus` (`focus.js:36-41`), `chains` (the `worlds:[…]` lists in `chains.js` become `chains: {exclude:[…]}` per world, default all). Each system gets `cfgFor(worldId, w.systems?.x)`: world data first, then today's table (w1–w4 unchanged), then a named preset (`'GENTLE' \| 'NORMAL' \| 'HARD'`). |
| `goal` | `{type, …params}` from the goal registry (§4.3). Composite goals: `{type:'all', of:[…]}`. |
| `calendar` | optional `{startMonth}` (w5 uses months of the year; business archetypes already read `cal`). |
| `bounds` | `{nwMax, passiveMax}`: the largest values the world can plausibly produce. Used by the validator and the result-normalisation layer (§4.7). |

Theme stays render-side: `WORLD_STYLE` in `js/render/vocab.js` (sky, board, edge, centre, decor, accent, ink, rim, motif, caption). The
`theme` object in world files is kept only for w1–w4 compatibility. New worlds put visuals **only** in `vocab.js` plus a `DECOR_MODEL`
entry in `scene.js`.

### 4.2 Special rules as modules (no if-by-world-name)

`js/worlds/mech/<id>.js` exports one object. All hooks are optional, pure and deterministic. They receive `ctx` (engine helpers:
`next(rng,'world')`, `fmtM`, `mentorLine`, `cashFx`, `lesson`, `addLuck`, `ensureCash`, `assetCf`, `R(n)` rules check, `econ`), so a module
never imports `engine.js` (no cycle, Node-importable, part of the pinned bundle).

| hook | called from (today's branch it replaces or extends) | purpose |
|---|---|---|
| `draws: {init, month, landing:{type:n}}` | — | **declared fixed draw counts** on the `world` stream. A test asserts them. |
| `init(st, w, ch, ctx)` | `createGame` (`engine.js:139-141`) | world state |
| `defaults(st)` | `v4Defaults` | idempotent new fields (save compatibility) |
| `monthly(st, out, ctx)` | `paydayImpl` step 11, `monthlyWorld` (`engine.js:1338-1368`) | drift, sealed reveals, lifecycle steps |
| `tiles: {type: {create, describe, choose, safe}}` | `landing` switch (`engine.js:1444-1468`), `describe`, `chooseImpl` | new tile types. `safe` = the option id a room timeout may apply (O1/ONLINE: never buy, borrow or sell) |
| `deal: {options, apply, mentor}` | the deal option branches at `engine.js:1985-2030, 2500-2502` | extra buy variants (like `buyFix`, `buyHedge`) |
| `asset: {kinds, cf, value, goalValue, despawn}` | `assetCfRaw`, `assetValue`, `netWorthOf` | module-owned asset kinds (op-assets, projects, plants) |
| `act: {name: (st, params, ctx) → out}` | **one new action code `Z`** = `['Z', name, params]` in `act()`/`replay()`/verify `CODES` | between-roll module actions (price plan, maintenance policy, refinance, attention). Added once. Future worlds need no new server code. |
| `indicators(st, ctx)` | `metrics().worldIndicators` (`engine.js:688-691`) | HUD chips + a generic **panel descriptor** (rows, gauges, a 12-month strip, the `Z` actions list with ids, labels and enabled flags) that `ui.js` renders without world-specific code |
| `cityModels(st, ctx)` | `cityModels` (`engine.js:789-800`) | 3D/2D pieces |
| `score(st, ev, ctx)` | `scoreOptions` (`engine.js:2729`) | option utilities for the guide, mentor and dominance scan |
| `recapHint(st)` | `engine.js:5101-5103` | the "next time" line |
| `lessons, mentorKeys` | — | data, checked by the validator |

**Migration of w1–w4.** Phase 0 adds the hook calls **beside** today's `w.mechanic === …` branches. New worlds use hooks only. Moving
`rate/fx/angel/history` into modules is optional P2 work, and is allowed only with a byte-identical replay gate (the same final state
JSON for the golden corpus: rules 3/4/5 × w1–w4 × 8 policies × 25 seeds). The 7 `st.worldId === 'w…'` checks in `engine.js` and the
34 in other files become config reads (e.g. `goalHoldOf` → `w.goal.hold`; the w1 tutorial → `w.tutorial`).

### 4.3 Goal registry — `js/worlds/goals.js`

`{type: {met(st,c), progress(st,c), parts(st,c), label(w)}}`. `parts` keeps today's `goalParts` shape (`engine.js:619-646`), so
`hudgoal.js` renders every goal generically ("חסר …").

| type | used by | rule |
|---|---|---|
| `passive`, `netWorth`, `netWorthImpact`, `benchmark` | w1–w4, h | today's code moved, outputs identical |
| `passive12` | w5 | the average of the last 12 payday values of goal-passive (missing months = 0, so at least 12 months) ≥ `target`. Spikes cannot win (also closes the E1 B2 class of exploits by construction). |
| `passiveTarget` | w9 | the module's operating income ≥ `target` |
| `netWorth` + `valuation:'goal'` | w6, w8, w11 | uses `asset.goalValue` when a module defines it (sustainable-profit × condition in w6; work in progress at cost in w8) |
| `liquidity` | w7, w12 | (cash + savings + undrawn committed lines + liquid holdings) ÷ the module's monthly fixed costs ≥ `months` |
| `noDefault` | w12 | no division default in the last `months` paydays |
| `all` | w7, w10, w12 | every sub-goal met. `progress` = min of the parts |

`hold` lives in the goal (`{hold: 3}`). The default 2 stays `GOAL_HOLD`.

### 4.4 Config validator — `tools/validate-worlds.mjs` + `tests/worlds_config.test.mjs`

Runs in CI and in `run_all`. It fails on any error.

1. **Schema.** Required fields per layer. `meta` and the full config agree (id, order, characters' `maxMonths`/`stars`, goal label).
2. **Unique ids.**
   - World ids.
   - Character ids, **globally**: `CHAR_STYLE` in `vocab.js` and the `profession` column are keyed by them.
   - Ticker ids per world, card names per deck (warning), lesson ids, achievement ids, module ids.
3. **References.**
   - Every board char has a tile type, and every tile type has a deck or a module handler.
   - Every card `k` exists in `kinds`. Every `kinds` entry has a model (an existing GLB in `assets/<id>/` or a procedural stand-in listed in `kit3d.js`).
   - Every `tk` exists in `tickers`. `bizOffers` exist in `BIZ.ARCHETYPES`.
   - Every mentor key a module uses exists. `unlock` references existing worlds, the graph is acyclic, and every world is reachable from w1.
   - `WORLD_STYLE[id]` exists. `minRules ≤ RULES_CURRENT`.
4. **Fairness of unlock.** No clause with `stars > 1`. No world whose only path runs through a single world of `estMin > 60` (when measured).
5. **Money coherence.**
   - Every card amount is inside `econ.band` (warns on outliers ×3).
   - `down ≤ cost`. The `starterDeal` is affordable by every character (`down ≤ cash`).
   - `loanUnit` is 1–10% of the median down payment.
   - Numbers quoted in Hebrew text match the card fields when both exist (regex on ₪ amounts). No `{placeholder}` without a value.
   - `bounds.nwMax < 1e13` (JS-safe with margin).
6. **Goal sanity (static).**
   - `t3 < t2 < maxMonths ≤ 200` (the verifier clamps months to 200, `verify_core.js:107`).
   - Static upper bound: the sum of the best `k` deal yields reachable from start equity (no compounding) times `maxMonths` must be at least the target. Otherwise "impossible goal".
7. **Goal reachability (dynamic, smoke).**
   - `smart` and `guideTapper` on 6 seeds × each character, cap 1.6× the limit: at least one win per character, at least one in time per world.
   - Per-world module `draws` honoured: with two opposite policies on the same seed, every stream sits at the same position after every turn (generalises O1 §2.2's test to all worlds).
   - Full gates are the sim's job (§5.3), not the validator's.
8. **Room safety.** Every module tile declares `safe`, and `safe` is a non-spending option on every card (fuzz every card).

### 4.5 Lazy loading (12 worlds must not slow the lobby)

- **Lobby:** loads `meta.js` (target ≤ 12 KB gz for all 12) and card art as WebP thumbnails with `loading="lazy"`. Locked worlds use one shared silhouette sprite.
- **Engine:** `getWorld(id)` stays synchronous and throws `world_not_loaded`. New `ensureWorld(id)` (async, dynamic `import('./worlds/'+id+'.js')` + its mech modules) is called by the lobby **before** `createGame`, `deserialize`, resume and the character picker.
  - Node and the verifier import `js/worlds/all.js` (static, registers every world).
  - The pinned bundle entry becomes `tools/edge-entry.mjs` (engine + all.js), so `build-edge.mjs collect()` includes every world.
  - The browser never downloads rules for worlds it does not play.
- **3D:** already per world (`assets/<id>/*.glb`, `worldModelNames`, CR-05). New kinds start as procedural stand-ins in `kit3d.js`, with GLBs added later. The sea/sky/decor for a world loads on entry. Life models stay shared.
- **Budget gate** (T7 style): the lobby's first-load JS must not grow by more than 15 KB gz after all 12 worlds exist. Starting a game in a not-yet-loaded world adds ≤ 1 request for rules and ≤ 6 GLBs.

### 4.6 Big numbers: formatting and precision

**Today.** `fmtM` (`engine.js:73-79`) prints "₪1000 מיליון" for 10⁹ and has no short form. `ui.js:22` has its own `toLocaleString`. `business.js:39` has its own `fmt`.

**Spec.** One module, `js/money.js`, re-exported by the engine:
- `money(n, 'full')`: `₪1,234,567,890` (sheet, detail, receipts)
- `money(n, 'card')`: today's `fmtM` + "מיליארד" (≥ 10⁹: `₪1.25 מיליארד`)
- `money(n, 'dense')`: 3 significant digits (`₪850 אלף` · `₪12.5 מיליון` · `₪1.2 מיליארד`) for HUD, lists and the map
- `money(n, 'chip')`: ≤ 6 characters for 3D float labels (`₪850K`, `₪12.5M`, `₪1.2B`)
- Negative uses U+2212 everywhere. Output is wrapped in a directional isolate (U+2068…U+2069) for RTL.
- Tests: round-trip within rounding, monotonic, every tier boundary (999,999 → 1M; 999.95M → 1B).

**Precision.**
- State money stays **integer ₪** (verified by E1, 44,883 checks). JS doubles are exact up to 9.007×10¹⁵. The largest plausible value (w12 after a win, 120 more months) is < 10¹¹, and interest in agorot (`bank.js`) < 10¹³. That is safe.
- No 32-bit integer operations touch money (checked: `|0`/`>>>0` appear only in RNG and hashing, plus `dd.js:86` on a small index).
- Rule for new modules: only `+ − × ÷`, `Math.round` at every stored value, no `Math.pow/exp/log` (bit-identical in browser, Node and Deno, as in `business.js:7-8`). The validator runs a "no Math.pow/exp/log" lint on `js/worlds/mech/*`.

**Postgres (BLOCKING for w11/w12, owner approval needed, production schema).**

| item | today | breaks when | proposal |
|---|---|---|---|
| `game.results.net_worth integer` | ±2,147,483,647 | w12 (goal ₪2B, and after-win growth) | `alter … type bigint` |
| `game.results.passive/expenses integer` | ±2.1B | no new world reaches it, but keep symmetry | `bigint` |
| `rr_finish(p_net_worth integer, …)` + range check | `bad_values` when \|NW\| > ₪2B **or \|passive\| > ₪100M or expenses > ₪100M** | w12 NW. w10–w12 expenses (when they include group costs) can exceed ₪100M | new `rr_finish2` with `bigint` params and per-world bounds from a `game.worlds` table (id, nw_max, passive_max, ranked). Keep `rr_finish` for old clients. |
| `results.months` | 1–200 check | no (max 84 × 1.6 = 134) | — |
| `verify-result` writes `net_worth = ${r.netWorth}` | int column | same as above | ships with the migration |
| `game.challenges` `CHECK (world in w1..w4)` | **rejects w5+ today** | any challenge in a new world | replace with an FK to `game.worlds(id)` |
| daily/weekly world rotation (`array['w1','w2','w1','w3','w1','w4','w2']`, `wk % 2`) | hard-coded | new worlds never appear | read from `game.worlds where ranked and daily_weight > 0` |
| leaderboard tiebreak `o3 = net_worth`, `o2` uses `passive / expenses` | per board, so per world: fine | — | keep per world (§4.8) |

Rejected alternative: storing money in scaled units (thousands of ₪ in `integer`). It loses precision for w1 (₪450/mo), mixes units
per world, and still overflows at ₪2.1 trillion in thousands, so it gains nothing over `bigint`.

**Interim (until approved).** New worlds are **not ranked** (`ranked:false` in meta). Free play stores locally only. `net.finish` refuses
a ranked finish whose values exceed the server bounds with a clear message, rather than a silent failure.

### 4.7 Saves, rules, streams, codes (TASK_BOARD shared registries)

- **Stream:** append `'world'` at index **15** in `rng.js` STREAMS. `rng.js` says "next free index: 15". TASK_BOARD's line "15 והלאה:
  ה־stream החתום לכל עסק" conflicts with `rng.js`, which keeps per-business streams in `state.bizRng`. Fix the board text in the same change.
  Only modules use `world`, each with its declared fixed counts per payday and per landing type, never depending on decisions.
  w1–w4 never draw from it, so their outcomes are unchanged. `v4Defaults` fills the field for old saves (harmless, as with dd/cycle).
- **Action code:** `Z` (module action). Added once to `act()`, `replay()` and `verify_core.js` `CODES`. Module actions are validated by the module (`act[name]` exists, params schema).
- **Rules:**
  - `RULES_CURRENT = 6` with `RULES6_FROM` = the release date.
  - Rules 6 = rules 5 for w1–w4, asserted by the replay corpus test (no outcome change). Each new world has `minRules: 6`. `createGame` uses `max(rules, w.minRules)`, and the verifier rejects a new world for a row dated before `RULES6_FROM` (`bad_world`).
  - Any later balance change in a released world requires a new rules number (the existing TASK_BOARD policy), never a silent edit.
- **Save version:** stays 4. `v4Defaults` calls `mech.defaults`. A new world's save loads only after `ensureWorld`. An unknown world id in a save shows "העולם הזה מגיע בגרסה חדשה יותר", never a reset (the T1 future-save rule).
- **Pinned engine:** every wave that touches `engine.js`, `js/worlds/*`, `js/worlds/mech/*`, `js/finance/*`, `js/systems/*` or `rng.js` re-pins `engine.bundle.json` and needs a verify-result redeploy with the site, which needs the **owner's explicit approval** (TASK_BOARD). Worlds whose module is not yet released stay out of `WORLDS`, behind `?ff=world-w6` in free mode only, so a half-built world never reaches ranked play.

### 4.8 Online, rooms, competitions (O1-compatible)

- **Results** store `world` (exists) + `rules` + `engine_sha` (O1 §1.6). A board or competition is always single-world, so raw money is
  compared only inside one world. Rank by the competition metric: won → months → `progress` (0..1, the goal registry's normalised value).
  Tiebreak per world type (`meta.rankTiebreak`): `ratio` (passive ÷ target) for passive-type goals, `nwRatio` (NW ÷ target) for NW goals,
  min-part for composite goals. Never finish time (§25).
- **Cross-world displays** (profile, group stars, titles) use **stars and per-world `progress` only, never ₪.** The profile shows "best months" per world, not best money.
- **Fairness:** world modules draw from `world` with fixed counts, so the same seed gives the same calendar, demand path, sealed delays,
  breakdown draws and manager traits for everyone (O1 §2 property). Document per world what is shared and what depends on decisions (O1 §2.3 file).
  Sealed per-entity values are drawn **at the landing** with a fixed count, as rivals do today (4 draws), so pass and buy consume the same draws.
- **Rooms** (ONLINE.md): the room `world` parameter list comes from meta (`ranked || roomOk`). Timeouts use each tile's `safe` option.
  Module `Z` actions are never applied by a timeout. The redacted view (O1 §0.3) must also neutralise module-sealed fields: each module lists
  its sealed paths in `sealed: ['world.tour.path', 'assets[].proj.delay', …]`, consumed by `shadowOf`.
- **Competitions:** a world is offered for async competitions once `ranked:true` (gates passed + DB migration). Live rooms may use any released world.

---

## 5. Implementation plan

### 5.0 Wave 0: infrastructure (before any new world). Size: L.

| task | files (lane) | output | test |
|---|---|---|---|
| I1 world registry split meta/full + `ensureWorld` + `all.js` + edge entry | `js/worlds/*`, `tools/build-edge.mjs` (engine lane) | lobby imports meta only | lobby bundle diff; verifier loads all |
| I2 mech module contract + hook calls (additive) + action `Z` + stream `world` | `engine.js`, `rng.js`, `verify_core.js` | no behaviour change w1–w4 | **byte-identical replay corpus** (rules 3/4/5) |
| I3 goal registry (`goals.js`), w1–w4 goals moved | engine | identical `goalParts` | metrics parity over 3,600 states |
| I4 `econ` + `systems` config, per-system `cfgFor` | worlds, systems | w1–w4 explicit values | parity |
| I5 validator | tools, tests | CI gate | fixtures with each error class |
| I6 `money.js` formatter + UI audit (ui, lobby, hudgoal, board2d, scene labels) | engine/UI lanes | one formatter | formatter unit tests + 360 px screenshots with ₪1.25B values |
| I7 progress DAG unlock + titles + tiered map (lobby) | lobby lane | rules from meta | progress tests (fork, banked stars, admin override, room access) |
| I8 sim generalisation | `tools/sim.mjs` | `/^w\d+$/`; `seedOf` = legacy formula for w1–w4, `seedFrom('sim:'+wid)` for others (fixes the `charCodeAt(1)` collision w1/w10/w11/w12); world lists from `E.WORLDS`; module policy plug-ins `tools/policies/<mech>.mjs` | old reports identical for w1–w4 |
| I9 DB migration **draft** (bigint, `game.worlds`, challenge FK, rotation from table, `rr_finish2`) | `supabase/migrations/*draft*` | not applied | fake-backend tests (T7) |

### 5.1 Wave 1: w5 עיר התיירות end-to-end (proof of the infrastructure)

**Why w5 first.** It is the gate to everything new, so it must exist before any other new world is reachable. It also exercises **every**
part of the module contract: a new tile type (`N`, allotments, with sealed landing draws), a new goal type (`passive12`), a new monthly
state (calendar + demand index on the `world` stream), module-owned asset kinds (op-assets with occupancy), a `Z` between-roll action (season
price plan, staffing), new business archetypes with seasons (business system), indicators and a panel descriptor (12-month strip), city
models, and sim policies. Its decisions are new (pricing against capacity and time). It is not a re-skin.

Engine size estimate: `mech/season.js` ~700–900 lines, data `w5.js` ~350, `business.js` +2 archetypes ~120, `goals.js` +40, hooks
already from wave 0. UI panel via descriptor ~250 (generic, reused by all later worlds). Render: `WORLD_STYLE.w5`, decor `palms`,
4 procedural kinds then GLBs (hotel_beach, resort, waterpark, conference). Tests ~500. Sim policy ~200. **Size: L (≈ 3 agent-weeks after wave 0).**

### 5.2 Waves 2–4

| wave | worlds | shared new code first | size |
|---|---|---|---|
| 2 | w6 + w7 (parallel teams) | `mech/plant.js` (condition and hazard per slot, maintenance policy, contracts, lead-time orders). `mech/chain.js` (branches, ramp, span, cannibalisation, franchise). Both reuse business economics and dd | L + L |
| 3 | w8, then w9 | `mech/projects.js` (lifecycle, staged draws, presale threshold, capitalised interest, sealed delays) used by w8, and reused by `mech/energy.js` (queue via rivals, PPA/merchant, refinance at DCF, capacity-factor draws) | XL (projects) + L |
| 3' | w10 (parallel with w8/w9) | `mech/portfolio.js` (factor betas, liquidity classes, margin, capital calls) | L |
| 4 | w11, then w12 | `mech/multinational.js` (N-currency fx generalising w3, attention slots, managers with sealed traits, supply graph). `mech/holding.js` (divisions built from the light formulas of earlier modules, guarantees, contagion, allocation) | XL + XL |

Order inside a wave: module → data → validator green → sim gates → UI panel config → 2D/3D theme → room/competition flags (ranked
only after DB migration approval) → independent review → owner approval → merge. Each world is behind a feature flag until its gates pass.

### 5.3 Balance gates (per world; `node tools/sim.mjs --matrix 100 wN`)

The same gate set as T2 A1–A9, with the thresholds the caller set:

| gate | rule |
|---|---|
| G-guide | guideTapper in time **≥ 60%** (pooled), and the worst character ≥ 50% |
| G-blind | blindTapper in time **≤ 8%** (J1 measured 1–8% in w1–w4) |
| G-smart | smart in time **≥ naive + 5 pp**, and smart median months < naive |
| G-reach | every character has smart wins in time (≥ 40%), so the goal is reachable for every start |
| G-loss | a real loss exists: naive or `maxDebt` bankrupt or out of time in ≥ 15% of games, **and** some smart games lose (≥ 5%), so luck matters but not most |
| G-dom | no dominant strategy: A4 best-cell share ≤ 60% for every archetype; the dominance scan has no option top in > 90% of its appearances (except allowed `save`/`skip`); the module's own ablations both lose to smart by ≥ 5 pp (w5: `standardAlways`, `allotAlways`/`allotNever`; w6: `runToFailure`/`preventiveAlways`; w7: `openEveryBranch`/`neverExpand`; w8: `noPresale`/`presaleAll`; w9: `allPPA`/`allMerchant`/`neverRefi`; w10: `maxMargin`/`allCash`; w11: `selfRunAll`/`delegateAllNoAudit`; w12: `guaranteeAll`/`ringFenceAll`) |
| G-frugal | `f:frugal` is not best in > 50% of cells (E1 C1 lesson) |
| G-durable | ≥ 85% of winners still meet the goal 24 months after the win (E1 table column) |
| G-ramp | smart in time is non-increasing along each path within ±5 pp (w5 ≥ w6/w7/w8 ≥ w9/w10 ≥ w11 ≥ w12). Harder through decisions, never through more randomness (BRIEF-worlds §4) |
| G-time | median won rolls 60–100 (J1 range), so no world is a grind |
| G-big | fuzz (E1 harness) on the world: 0 NaN, integer money, NW = assets − liabilities, payday = shown cash flow; plus values near `bounds.nwMax` format correctly and the finish payload passes `rr_finish2` bounds |

### 5.4 Tests per world

- Config validator: green.
- Engine:
  - The module's draw counts (opposite policies, same seed → same stream positions).
  - Serialize round-trip at every rest point.
  - Every `Z` action is replayable and verifiable (`verify_core`).
  - Every tile's `safe` option is non-spending.
  - Goal parts sum and progress ∈ [0,1].
  - Mid-game saves load after a reload with lazy `ensureWorld`.
- Old worlds untouched: the replay corpus is byte-identical, and the w1–w4 matrices are unchanged within the same engine SHA.
- UI: e2e on desktop and phone (360 px), 3D and 2D (switching changes nothing in money or turn), panel descriptor rendering, big numbers, RTL.
- Online: a room game in the world (fake backend), timeout safe-defaults, a redacted view without sealed fields, the leaderboard in that world only.

### 5.5 Who does what (team, BRIEF-worlds §9)

Per world or pack: a task lead + (1) game & economy design (this doc → per-world tuning), (2) implementation & content, (3) independent
balance & tests (sim gates, fuzz, review). Shared specialists: render/3D (WORLD_STYLE, models), infrastructure (wave 0, DB draft,
verifier pin). Run in waves by capacity: wave 0 alone, then w5, then two parallel teams.

---

## 6. Open decisions for the owner / director

1. **DB migration** (bigint, `game.worlds`, challenge FK, rotation, `rr_finish2`): production schema change and verify-result redeploy. Until approved, the new worlds are free play only.
2. **Rules 6 cut-over date** (`RULES6_FROM`) and the re-pin/redeploy, together with the site release.
3. Whether the daily/weekly rotation should include new worlds (proposal: only after a world has been released for 2 weeks, with weight ≤ 1/7 each).
4. A cosmetic reward per world for ★★★ (building skin), which is render-side only.
5. Whether a persistent "קריירת טייקון" campaign is wanted later (separate mode, never ranked).
