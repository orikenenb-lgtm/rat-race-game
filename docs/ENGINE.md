# מירוץ העכברים 2.0 — Engine API (contract for the UI)

Pure, deterministic game logic. **No DOM, no THREE, no `Math.random`, no `Date`.** Works as an ES module in the browser and in Node.

```
js/rng.js            mulberry32 (identical to v1 R()) + int/pick/shuffle/weighted/makeStreams/seedFrom
js/engine.js         the engine (this document)
js/worlds/index.js   WORLDS = [w1, w2, w3, w4], getWorld(id)
js/worlds/common.js  tile types + default mentor voice
js/worlds/w1..w4.js  all world data (Hebrew text, numbers, theme, decks, mentor lines)
js/achievements.js   ACHIEVEMENTS, checkAchievements, checkMetaAchievements, TITLES, titleFor
tools/sim.mjs        balance simulator  (node tools/sim.mjs 600 [w1] [--md tools/balance-report.md])
tests/engine.test.mjs  node tests/engine.test.mjs [gamesPerWorld=2000]
```

```js
import * as E from './js/engine.js';
const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 12345, mode: 'free' });
// turn loop
const roll = E.rollDice(st);          // animate roll.steps, paydays, news
let ev = E.landing(st);               // render card
const res = E.choose(st, ev, 'buy');  // apply decision → effects, mentor, spawn…
// res.event !== null → still open (trade window / sell list): re-render res.event
// res.done → back to rolling;  res.end → game over (also in st.result)
localStorage.setItem(key, E.serialize(st));   // save any time
```

---------------------------------------------------------------------------------------------------

## 1. Game flow / phases

`st.phase`: `'roll'` → `rollDice()` → `'land'` → `landing()` → `'event'` → `choose()` (closing option) → `'roll'` … → `'over'`.

| function | when | throws if |
|---|---|---|
| `rollDice(st)` | phase `'roll'` | game over / an event is pending |
| `landing(st)` | after a roll (returns `null` in phase `'roll'`) | — |
| `currentEvent(st)` | any time; the pending event re-described or `null` | — |
| `choose(st, event, optionId, params?)` | an event is pending | unknown option id, stale `event.id`, no pending event, game over |
| `takeLoan / repayLoan / payCredit` | any time (also while a card is open — then re-render `result.event`) | game over |

* **landing() is idempotent.** The first call draws the card (seeded) and stores it in `st.pending`; every later call (after resume, after `takeLoan`, …) returns the **same** event with fresh numbers / enabled flags. Never cache an event across actions — use `result.event` or `currentEvent(st)`.
* A **disabled** option passed to `choose()` does not throw: it returns `{ok:false, error, event}` and changes nothing.
* Game end is checked only when an event closes (and after `repayLoan`/`payCredit` between events). `choose().end` / `repayLoan().end` is non-null exactly once; `st.over` (`'won'|'lost'`) and `st.result` then stay set.

## 2. Functions

### `createGame({worldId, charId, seed, mode, maxMonths?, tutorial?}) → state`
* `worldId` `'w1'..'w4'` (default w1); `charId` from `world.characters[].id` (default first).
* `seed` uint32 (0 → 1). Same seed ⇒ same dice and same cards for everyone, whatever they decide.
* `mode` `'free' | 'daily' | 'weekly' | 'challenge'`. Free never times out (stars still count months).
* `maxMonths` override (daily = 40). Default = `character.maxMonths ?? world.maxMonths`.
* `tutorial: true` → the first deal drawn is `world.starterDeal` (small, clearly good). It consumes the same random draws, so the rest of the game is unchanged. Use only for a player's very first game, never in ranked modes.

### `rollDice(st) → RollResult`
Moves the pawn, applies **every payday the pawn touches** (passing or landing, v1 rule; months advance only on paydays), forces bank loans if cash < 0, and runs world monthly mechanics (w3 dollar drift, w4 startup signals/exits, impact growth).
```json
{ "ok": true, "die": 3, "from": 4, "to": 7, "steps": [5, 6, 7],
  "paydays": [ { "tile": 6, "step": 1, "amount": 1700, "month": 2, "landed": false, "salary": 9000, "passive": 0, "expenses": 7300 } ],
  "news": [ { "kind": "hedgeExpired", "assetId": "a2", "text": "הגידור על ספינת מכולות משומשת הסתיים. מעכשיו הוא חשוף שוב לדולר." } ],
  "effects": [ { "type": "sound", "name": "roll" }, { "type": "cash", "amount": 1700, "label": "+₪1,700", "at": "pawn" }, { "type": "sound", "name": "coin" } ],
  "mentor": null, "toast": null, "spawn": [], "despawn": [], "achievements": [] }
```
* `paydays[].step` = index in `steps` where it happened (show the floating number when the pawn hops onto that tile). `landed:true` → the landing event will be a `payday` card.
* `news[]` kinds: `exit` (w4: `{angelId, name, amount, mult, cash, big, text}`), `signal` (w4 half-way news: `{angelId, text, paper}`), `hedgeExpired` (w3). Show as toasts/cards **before** the landing card; exits with `big:true` deserve a celebration (`golden` sound + sparkle effect already emitted).
* `mentor` is set when something notable happened (auto-loan, first negative cashflow, an exit). `toast` for the auto-loan.

### `landing(st) → Event`  — see §3.

### `choose(st, event, optionId, params?) → ChooseResult`
```json
{ "ok": true, "effects": [ { "type": "sound", "name": "buy" }, { "type": "cash", "amount": -11000, "label": "−₪11,000", "at": "pawn" },
                           { "type": "achievement", "id": "first_asset", "name": "הנכס הראשון" }, { "type": "sound", "name": "achievement" } ],
  "mentor": "זה נכס: ₪550 נכנסים לך כל חודש בלי לעבוד. תשואה של 60% בשנה על הכסף ששמת. ושים לב: גם ההלוואה עולה ₪500 בחודש.",
  "toast": null,
  "spawn": [ { "assetId": "a1", "key": "a1", "model": "apartment", "label": "+₪550 לחודש", "color": "green", "golden": false } ],
  "despawn": [], "achievements": [ { "id": "first_asset", "name": "הנכס הראשון", "desc": "קנית נכס שמכניס כסף כל חודש.", "icon": "seed" } ],
  "news": [], "event": null, "done": true, "end": null }
```
* `params.qty` (integer ≥ 1) is required for options with `needsQty:true` (trade buy/sell).
* `event` = the still-open event (re-render it) or `null`; `done` = the card closed.
* `mentor` = the "after" line (explains the decision). `null` → keep the previous line.
* `end` = `checkEnd` result when the game just ended (see below).

### Player actions (any time)
* `takeLoan(st, amount?)` — one loan unit (w1 ₪5,000 · w2 ₪10,000 · w3 ₪20,000 · w4 ₪25,000). `{ok:false, error}` past the income cap (Changes v2.1).
* `repayLoan(st, amount?)` — one unit, or the remainder if smaller (needs that much cash). May return `end` (lower expenses can finish w1/w2!).
* `payCredit(st)` — pays the whole credit-card debt.
All return `{ok, error?, effects, mentor, event (current pending event or null), end?}`.

### `metrics(st) → Metrics`  (HUD + statement sheet; pure, call after every action)
```js
{ month, maxMonths, turn, mode, cash, salary, passive, expenses, cashflow, netWorth, loans, credit,
  goalType: 'passive'|'netWorth'|'netWorthImpact',
  goalProgress: 0..1,            // the freedom meter (w4 = min of both parts)
  goalText: 'הכנסה פסיבית ₪1,200 מתוך ₪7,300',
  goalParts: [{ key:'passive'|'netWorth'|'impact', label, value, target, progress }],   // w4 has two → two meters
  incomeLines:  [{ label, amount, assetId? }],   // salary first, then assets, then dividends
  expenseLines: [{ label, amount, id }],         // id 'loan' / 'credit' for debt payments
  assets: [{ id:'a3', assetId:3, kind, kindLabel, name, model, cost, down, value, debt, equity, cf,
             fixedRate, variable, sens, hedgedUntil, hedgeRate, impact, upgrades, golden, grow }],
  liabilities: [{ label, amount, assetId?|id? }],
  holdings: [{ ticker, name, unit, qty, price, value, basis, avg, div, model }],
  angels:   [{ id:'v7', name, amount, paper, status:'active'|'exited'|'failed', result, mult, revealAt, news }],
  worldIndicators: {...},        // per world, see §6
  canRepay, canPayCredit, loanUnit, loanUnitCost }
```

### `checkEnd(st) → null | Result`
```json
{ "status": "won", "reason": "goal", "months": 27, "turns": 46, "stars": 2,
  "netWorth": 312000, "passive": 7450, "expenses": 7300, "cashflow": 9150, "impact": 0, "progress": 1,
  "nearMiss": { "text": "עוד 4 חודשים פחות ו־★★★ היו שלך.", "monthsToNext": 4 },
  "tip": "משחק נקי. נסה דמות אחרת וראה כמה זה משנה.",
  "lesson": "נכס מכניס כסף לכיס…", "worldId": "w1", "charId": "teacher", "stats": { "...": 0 }, "achievements": ["first_asset"] }
```
* `status` `'won'|'lost'`, `reason` `'goal'|'time'|'bankrupt'`. Lost → `nearMiss.text` is the "היית רק ₪800 מהחופש" line (`gap` / `gapImpact` numbers included).
* **Bankrupt** = after a payday the cashflow is negative *and* net worth < −10 × monthly living costs. Rare for sensible play; ends hopeless spirals (also in free mode).
* `stars`: 0 if escaped after the limit; else 1 + (months ≤ T2) + (months ≤ T3). Thresholds are **per character** (characters differ in difficulty): `E.starThresholds(worldId, charId) → {t2, t3, maxMonths}`; `E.starsFor(world, months, maxMonths, charId)`.

### Other helpers
| function | returns |
|---|---|
| `intro(st, resumed?)` | `{mentor, goalText, goalLabel, world, tagline}` — opening mentor line (or "חזרת לחודש X") |
| `cityModels(st)` | every 3D object the city should show now: `[{key, assetId, model, label, kind:'re'…/'holding'/'angel'/'foundation', golden}]` — rebuild the board from this on resume |
| `boardInfo(worldId)` | `[{index, ch, type, name, color, ink, icon}] × 24` for building the ring |
| `worldList()` | lobby data: `[{id, order, name, tagline, goal, goalLabel, maxMonths, stars, theme, mechanic, characters:[characterCard]}]` |
| `characterCard(world, c)` | `{id, name, desc, salary, salaryUsd, cash, expenses, surplus, perk, icon}` |
| `dailyConfig('YYYY-MM-DD')` | `{worldId, charId, seed, mode:'daily', maxMonths:40}` — the caller passes the Israel date (engine has no clock); worlds rotate daily w1→w4 |
| `serialize(st)` / `deserialize(json)` | save string / state (throws on unknown `v`) |
| `fmt / fmtM / sgn / fmtP / tpl` | ₪ formatting exactly as the engine's texts (`fmtM` → "₪1.25 מיליון") |
| `assetCf / assetValue / loanPct` | low-level numbers (already inside metrics) |
| `getWorld(id)`, `WORLDS`, `achievementById(id)`, `SAVE_VERSION` | data access |

---------------------------------------------------------------------------------------------------

## 3. The event object

```ts
{ id: number, type, tile: 'O'|'D'|…, tag: string, color: '#hex', ink: '#hex',
  title: string, text: string,        // card heading + description
  mentor: string,                     // the mentor's question BEFORE the decision (always non-empty)
  options: [{ id, label, enabled, reason?, primary?, needsQty?, max?, kind?: 'buy'|'sell'|'give' }],
  data: {...},                        // all numbers the card shows (per type below)
  golden: boolean,                    // golden deal → gold card, sparkle, 'golden' sound; tag "עסקת זהב"
  sound: 'card'|'coin'|'loss'|'golden' }   // play when the card opens
```
Exactly one option has `primary:true` (focus it; Enter/Space). `reason` explains a disabled option (show it under the button). Labels are ready to show; build richer layouts from `data`.

### Option ids per type (all closing unless noted)
| type | tiles | options | notes |
|---|---|---|---|
| `payday` | P (landed) | `ok` | data = the payday that already happened in rollDice. DESIGN: modal only the first time; toast after. |
| `deal` | O, ? | w1/w4: `buy`, `pass` · w2 mortgaged deals: `buyVar`, `buyFix`, `pass` · w3 FX-exposed: `buy`, `buyHedge`, `pass` | if cash is short the label already says "הלוואה ₪X ו…" and the engine takes the loan. `data.roiText` = the ROI chip text. |
| `trade` | O, M | `buy` (needsQty), `sell` (needsQty), `done` | **buy/sell keep the window open** (repeat freely); `done` closes. Clamp the slider to `option.max`. `data.lastResult` = last action. |
| `doodad` | D | `pay`, `credit` (installments, 5%/mo) and/or `sub` (w2: permanent monthly expense); wants also `skip` | amounts may scale with the salary (w2–w4); `data.need`, `data.pay/shortfall/loanAmount/loanMonthly` |
| `market` | M | `ok` · sell offers: `sell:<assetNum>` (repeatable, stays open) + `done` · w4 match: `give:0..2` + `done` | `data.kind` = `sell|repair|bonus|loss|div|rate|fx|reval|exitwave|markdown|match` |
| `crisis` | X | `ok` · w3 with gold held: also `okSellGold` | camera shake effect on choose |
| `mystery` | ? | `ok` · quiz: `a0..a2` (answers) | `data.kind` = `cash|quiz|raise|expense|boost|shares|impact|usd`; golden mystery arrives as a `deal` with `golden:true` |
| `bank` | B (w2) | `refi` (fix all variable mortgages), `prepay`, `ok` | the rate move already happened when the card was drawn |
| `upgrade` | U (w2) | `up:<assetNum>` (≤3), `trim:<expenseId>` (≤1), `pass` | |
| `fx` | F (w3) | `hedgeImp`, `hedgeExp` (when relevant), `ok` | the dollar move already happened; hedges lock the NEW rate |
| `shipping` | S (w3) | `ok` · insurance offer: `insure`, `ok` | |
| `pitch` | A (w4) | `inv:0` small / `inv:1` medium / `inv:2` large check, `pass` | outcome is hidden; revealed by rollDice news months later |
| `giving` | G (w4) | `give:0..2`, `pledge` (monthly), `pass` | |

### `data` by type (real examples, shortened)

**deal (w1)**
```json
{ "id":10,"type":"deal","tile":"O","tag":"הזדמנות · נדל\"ן","color":"#1f9d63","ink":"#ffffff","title":"דירה ישנה שדורשת שיפוץ",
  "text":"זולה, אבל התיקונים אוכלים את כל השכירות.","mentor":"זול זה לא אותו דבר כמו משתלם. מה המספר בשורה התחתונה?",
  "options":[{"id":"buy","label":"הלוואה ₪5,000 וקנייה","enabled":true,"primary":true},{"id":"pass","label":"לוותר","enabled":true}],
  "data":{"kind":"re","kindLabel":"נדל\"ן","debtLabel":"משכנתא","model":"apartment","name":"דירה ישנה שדורשת שיפוץ","cost":60000,"down":5000,
          "debt":55000,"value":60000,"discount":0,"cf":-200,"roi":-48,"cash":2700,"roiText":"−₪200 × 12 ÷ ₪5,000 = -48% בשנה",
          "impact":0,"golden":false,"grow":0,"loanNeeded":5000,"loanMonthly":500},"golden":false,"sound":"card" }
```
**deal (w2)** — extra: `rate, fixedRate, cfVar, cfFix, roiFix, cfAt:[{rate:2,cf:450},{rate:4,cf:-600},{rate:6,cf:-1650},{rate:8,cf:-2700}]` → draw a mini "what if the rate moves" bar chart.
Options: `{"id":"buyVar","label":"ריבית משתנה 4% (−₪600)"}`, `{"id":"buyFix","label":"ריבית קבועה 5% (−₪1,120)"}`, `pass`.

**deal (w3)** — extra: `value, discount` (value − cost: the instant net-worth gain), `grow` (monthly value trend, e.g. 0.013 = +1.3%/mo; negative = declining), `sens` (−3 importer … +3 exporter), `usd, hedgeFee, hedgeMonths, usdLinked, cfAtUsd:[{usd:3.2,cf:14220,value:2666667},{usd:3.6,…},{usd:4,…}]`.
Show "שווי מול מחיר", the trend arrow, and the dollar sensitivity.

**deal (w4)** — same as w3 minus FX; plus `impact` (points per month for impact assets).

**trade**
```json
{ "type":"trade","tag":"שוק","title":"BANK עלתה ל־₪22","text":"הבנק הרוויח יפה ברבעון והשוק שם לב.",
  "options":[{"id":"buy","label":"לקנות","enabled":true,"needsQty":true,"max":284},
             {"id":"sell","label":"למכור","enabled":false,"needsQty":true,"max":0,"reason":"אין לך מה למכור"},
             {"id":"done","label":"סיום","enabled":true,"primary":true}],
  "data":{"ticker":"BANK","name":"BANK · בנק","unit":"מניות","kind":"stock","price":22,"qty":0,"holdingValue":0,"avg":0,"cash":6250,
          "maxBuy":284,"maxSell":0,"div":0.15,"step":[10,100],"model":"stock","lastResult":null} }
```
`kind`: `stock|crypto|bond|gold|usd`. `step` = the ± button increments (v1.1 window: slider, ±small, ±big, "מקסימום לקנייה", "כל המניות שלי", "איפוס", buy, sell, "סיום"). After buy/sell, `event.mentor` already holds the post-action line.

**doodad** — `data:{amount, cash, installment|null, sub|null}`.

**market** — `data.kind` and:
`sell:{offers:[{assetId,name,offer,debt,net,profit,cf}]}` · `repair:{count,amount}` · `bonus/loss/div:{amount}` · `rate:{from,to}` · `fx:{from,to}` · `reval:{changed:[{assetId,from,to}],valueChange}` (net worth only, no cash) · `exitwave:{pulled:[angelIds]}` (they are revealed when the card is closed → exits in `choose().news`) · `markdown:{marked}` · `match:{match:true,eff,levels}`.

**crisis** — `data:{amount (negative = pay), lines:[{label,amount}], expenses, passive, gold, usd, angelMark, goldAfter?}`.

**mystery (quiz)**
```json
{ "type":"mystery","tag":"שאלת אבא עשיר","title":"שאלת אבא עשיר","text":"מה זה תזרים מזומנים?","mentor":"תחשוב רגע לפני שאתה עונה. התשובה הנכונה שווה כסף.",
  "options":[{"id":"a0","label":"כמה כסף נכנס פחות כמה יוצא כל חודש","enabled":true,"primary":true},{"id":"a1","label":"כמה כסף יש לך בבנק","enabled":true},{"id":"a2","label":"המשכורת שלך","enabled":true}],
  "data":{"kind":"quiz","reward":1000,"question":"מה זה תזרים מזומנים?"} }
```
(Shuffle the answer buttons visually if you like — ids stay the same. `choose().mentor` starts with ✔ when right.)
Other mystery kinds: `cash:{amount}` · `raise:{amount}` · `expense:{amount}` · `boost:{assetId,amount,assetName}` · `shares:{ticker,qty,value}` · `impact:{impact}` · `usd:{delta}`.

**bank (w2)**
```json
{ "type":"bank","title":"האינפלציה נרגעת","text":"המחירים התייצבו. ריבית −0.75%.","sound":"coin",
  "options":[{"id":"refi","label":"לקבע ריבית 4.25% לכל המשכנתאות (עמלה ₪5,525)","enabled":true},
             {"id":"prepay","label":"להקטין משכנתא ב־₪50,000 (בניין ותיק בבת ים לפינוי־בינוי)","enabled":false,"reason":"אין מספיק מזומן"},
             {"id":"ok","label":"המשך","enabled":true,"primary":true}],
  "data":{"from":4,"to":3.25,"delta":-0.75,"variableCount":1,"variableDebt":1105000,"fixedRate":4.25,"refiFee":5525,"cfNow":7210,"cfIfFixed":6290,"loanMonthlyDelta":-1950,"monthlyImpact":2640} }
```
**upgrade (w2)** — `data:{contractor, upgrades:[{assetId,name,label,cost,gain,valueUp,roi}], trims:[{expenseId,label,cut,cost}]}`.

**fx (w3)** — `data:{from,to,delta,importers,exporters,hedgeFeeImporters,hedgeFeeExporters,hedgeMonths,exposure:{cf,value},gold}` (exposure = ₪ change per +10% dollar, see §6).

**shipping (w3)** — `data:{kind:'freight'|'loss'|'insure'|'bonus'|'cash', amount, insured, insuredUntil, fee?, months?}`.

**pitch (w4)**
```json
{ "type":"pitch","title":"רחפני משלוחים לקיבוצים","text":"כל ערוצי החדשות מדברים עליהם. השווי בהתאם.",
  "options":[{"id":"inv:0","label":"צ'ק קטן: ₪100,000","enabled":true,"kind":"buy","primary":true},{"id":"inv:1","label":"צ'ק בינוני: ₪300,000 (עם הלוואה)","enabled":true,"kind":"buy"},
             {"id":"inv:2","label":"צ'ק גדול: ₪800,000 (עם הלוואה)","enabled":false,"kind":"buy"},{"id":"pass","label":"לוותר","enabled":true}],
  "data":{"sector":"לוגיסטיקה","team":2,"traction":2,"hype":3,"checks":[100000,300000,800000],"revealHint":"5–12 חודשים","active":2,
          "odds":"בערך: 6 מכל 10 נכשלים, 2 מחזירים בערך את הכסף, 1 עושה פי 5, ואחד מכל 15 — פי 20 ומעלה."} }
```
Show team / traction / hype as 1–3 icons (hype = 🔥: high hype ⇒ expensive ⇒ smaller multiple).

**giving (w4)** — `data:{cause, eff (impact per ₪ vs average, 0.5–1.6), levels:[{amount,impact}], pledge:{amount,impact}|null, impact, impactTarget}`.

---------------------------------------------------------------------------------------------------

## 4. Effects, sounds, 3D

`result.effects[]` (rollDice / choose / actions), in the order they happened:
| type | fields | UI |
|---|---|---|
| `sound` | `name` ∈ `roll hop coin loss buy sell card win lose unlock achievement golden` | play (the engine never emits `hop`/`unlock`: play `hop` per step and `unlock` for progression yourself) |
| `cash` | `amount, label, at:'pawn'|'a<id>'|'v<id>'` | floating number (green/red) + animate HUD cash |
| `float` | `text, color:'green'|'red', at` | floating text (trade profit/loss) |
| `loan` | `amount, auto:true` | toast "הבנק נתן לך הלוואה…" (also in `result.toast`) |
| `achievement` | `id, name` | achievement toast (full object in `result.achievements`) |
| `shake` | — | camera shake (crisis) |
| `sparkle` | `at` | gold sparkles (golden deal, big exit) |
| `confetti` | — | win |
| `upgrade` | `assetId` | bounce/scale-pop that model |
| `hedge` | `assetIds` | shield/lock icon on those models |
| `impact` | `amount` | heart particles toward the impact meter |
| `exit` | `angelId, mult, cash` | rocket launch (mult ≥ 1) or fizzle (0) before despawn |

`spawn[]`: `{assetId (= key), key, model, label, color:'green'|'red'|'blue'|'gold', golden}` — model ids map to files `assets/<worldId>/<model>.glb`:
w1 `apartment business stock crypto` · w2 `tower mall hotel bank` · w3 `ship warehouse factory gold` · w4 `campus datacenter rocket foundation`.
Keys: `a<n>` asset · `h:<model>` holdings group (one model per group, e.g. `h:stock`) · `v<n>` startup (one rocket per active check) · `f` the foundation (first gift/pledge).
`despawn[]`: keys to remove. On resume call `cityModels(st)` and spawn everything silently.

## 5. State fields the UI may read (read-only — mutate only through the API)
`v, worldId, charId, charName, seed, mode, maxMonths, phase, pos, month, turn, cash, salary, salaryUsd, loans, credit, expenses[], subs[], pledges[], assets[], holdings{}, prices{}, angels[], world{rate, rateHist, usd, usdHist, goldUsd, insuredUntil, impact, vesting}, pending, lastRoll, lastPayday, stats{}, ach[] (achievement ids earned this game), over, result`.
Prefer `metrics()` for anything displayed. `stats` keys: `deals bad doodad autoLoan autoLoans sold soldProfit golden crises crisisNoLoan tradeProfit upgrades trims hedges angels exits bigExits given quizRight quizWrong maxLoans negMonths paydays loansTaken` (good for the end screen).

### Save / resume
`serialize(st)` at any moment — including with a card open (the drawn card lives in `st.pending`). Resume: `st = deserialize(saved)`; rebuild city with `cityModels(st)`; place pawn at `st.pos`; then
`st.phase === 'event' || 'land'` → `landing(st)` (returns the same card, never redraws); `'roll'` → wait for roll; `'over'` → show `st.result`.
The JSON round-trip is tested to be identical to continuous play.

### Determinism / fairness
Named seeded streams (`dice, deal, doodad, market, crisis, mystery, special, drift`) are consumed only by *which tile you land on*. Decisions never consume randomness (startup outcomes are sealed when the pitch card is drawn). So for a seeded challenge every player sees the same dice and the same cards. **Never call anything in rng.js from the UI** — use `Math.random` for visual randomness only.

## 6. World mechanics — what to show on the HUD

`metrics().worldIndicators`:

| world | fields | HUD |
|---|---|---|
| w1 השכונה | — | freedom meter (passive / expenses) |
| w2 העיר הגדולה | `rate, rateHist[≤12], loanPct, fixedPremium` | **"ריבית 4.25%"** gauge with ▲▼ vs last value and a sparkline of `rateHist`; on the sheet mark each mortgage "משתנה" (red when rate rises) or "קבועה 5%"; show `loanPct` next to the loan buttons. Bank cards: animate the gauge from `data.from` to `data.to`. Subscriptions appear in `expenseLines` with "(מנוי)". |
| w3 הנמל הגלובלי | `usd, usdHist[≤12], usdRef, gold, insuredUntil, exposure:{cf, value}` | **"$ = ₪3.62"** ticker with sparkline; an exposure chip "דולר +10% → תזרים −₪4,420 · שווי −₪386K" (green if positive); 🛡 on hedged assets (`assets[].hedgedUntil`) and on cargo while `insuredUntil ≥ month`; gold price in the corner. Goal meter = net worth / ₪10M. |
| w4 עמק העתיד | `impact, impactPending, impactPerMonth, impactTarget, angelsActive, angelPaper` | **two meters** (`goalParts`): net worth / ₪10M and impact / 100 (show pending impact as a lighter extension and "+X בחודש"). A startup tray: `metrics().angels` cards with paper value; reveal them with drama on `news` kind `exit`. |

Mechanic summaries (for coach marks / help):
* **w2 ריבית** — mortgage cashflow = income − debt × rate ÷ 12. Variable mortgages follow the rate; fixed = rate + 1% when bought or refinanced at a בנק tile. Bank loans cost (1.5 + rate/4)% a month (credit cards 5%). Bonds (אג"ח) fall when the rate rises. שדרוג tiles: renovate an asset (more income, more value, no new debt) or trim a lifestyle expense (lowers the finish line). Lifestyle cards offer "מנוי" = a permanent new expense.
* **w3 דולר** — importers (sens < 0) lose income *and value* when the dollar rises, exporters/ships gain. A hedge locks the rate for 12 months for a fee. Holding both is a natural hedge. Gold jumps in crises (`okSellGold` lets you cash it in on the spot). Goal is net worth — buying below value (`discount`) and growing industries (`grow > 0`) build it; hyped/declining ones destroy it.
* **w4 מלאך** — each pitch has a hidden fate (most fail, a few 20×–60×), revealed 5–12 months later; half-way news moves the paper value (and sometimes lies). Many small checks beat one big bet. Giving: 30% of a gift's impact lands now, the rest over 10 months; pledges add impact every month; realised impact grows 1%/month — give before the end or you'll wait.

## 7. World data the UI reads directly (`getWorld(id)` / `worldList()`)
`id, order, name, tagline, goalLabel, lesson (end screen), starterDeal, daily {chars, maxMonths} (used by dailyConfig), theme {sky:[top,bottom], fog, board, boardEdge, center, accent, accent2?, water?, light:{hemiSky, hemiGround, sun}, decor:'trees'|'skyline'|'sea'|'stars', neon?, planks?, aurora?, glass?}, board (24 chars), tiles {ch: {type, name, color, ink, icon}}, maxMonths, stars {t2, t3}, characters [{id, name, icon, desc, salary|salaryUsd, cash, expenses, assets?, holdings?, impact?, maxMonths?, stars?}] (per-character `maxMonths`/`stars` override the world's — always read them through `starThresholds(worldId, charId)`), models, kinds, tickers, mentor (all lines)`.
Tile icons: `coin trend bag bars x question bank hammer dollar ship rocket heart`.

## 8. Achievements (`js/achievements.js`)
`ACHIEVEMENTS: [{id, name, desc, icon, hidden?, world?, meta?}]` (32). The engine checks in-game ones itself and returns them in `result.achievements` (store them in progress). Cross-game: `checkMetaAchievements({stars:{w1..w4}, achievements:[ids], worldsPlayed:[ids]})` → newly earned meta ones (`explorer`, `stars6`, `legend`). Titles: `TITLES`, `titleFor(totalStars)` → עכבר/חוסך/משקיע/טייקון/מיליונר/אגדה. Hidden ones: show "???" until earned.

## Balance v2.0 (superseded — see Changes v2.1 and tools/balance-report.md)
| world | goal | month limit | median months (turns) | ★★★ (per character) |
|---|---|---|---|---|
| w1 | passive ≥ expenses | 60 (dev 72, doctor 84) | teacher 23 (39) · driver 26 (45) · dev 37 (61) · doctor 53 (89) | ≤15 / ≤17 / ≤26 / ≤36 |
| w2 | passive ≥ expenses | 60 | 29–34 (~48) | ≤21 / ≤18 / ≤24 |
| w3 | net worth ₪10M | 48 | 32–34 (~55) | ≤24 / ≤25 / ≤24 |
| w4 | net worth ₪10M + impact 100 | 50 (social 56) | see v2.1 table | see v2.1 table |
Doctor/dev in w1 are the "hard mode" characters of v1 (high salary ≠ freedom); daily challenges use the lighter characters (`world.daily.chars`).

## Run
`node tests/engine.test.mjs [gamesPerWorld]` (23 tests, ~30 s at 2000 games/world) · `node tools/sim.mjs 800 --ablate --md tools/balance-report.md` (~2 min).


## Changes v2.1 (QA fix round) — read this first
All additions are backwards compatible except where marked **BREAKING**. Numbers below are the shipped defaults (see tools/balance-report.md).

### Debt (B3)
* Debt order everywhere: mortgage < bank loan < credit card. Monthly rates: w1/w3/w4 bank loan **3%**, w2 bank loan **1.5% + rate/4** (2.25% at the starting 3%), credit card (installments) **5%** in every world.
* Bank loans are **capped by income** ("הבנק בודק שתוכל להחזיר"), w1 included: total voluntary loans ≤ `loan.cap × (salary + passive)` (cap: w1 1.5, w2 2.5, w3/w4 3). `takeLoan` returns `{ok:false, error:'הבנק בודק שתוכל להחזיר — ...'}` past the cap. Deal/upgrade/pitch/giving/hedge options that would need a loan past the cap are disabled with that `reason`. Loans taken *inside* a buy/give option are rounded to `autoUnit` too.
* Forced (auto) loans still happen when cash < 0, rounded to `loan.autoUnit` (₪1,000 in w1/w2, ₪5,000 in w3/w4) — not to the voluntary unit. `repayLoan` repays one unit or the remainder if smaller.
* New in `metrics()`: `loanPct, creditPct, loanCap, loanRoom` (how much more the bank will lend), `canBorrow`.

### Every card that makes you pay shows the shortfall BEFORE you pay (B5, #5)
`doodad`, `crisis`, `market` (repair / loss), `mystery` (negative cash), `shipping` (loss) events now carry
`data.pay` (₪ you will pay now, ≥ 0), `data.shortfall` (pay − cash if positive, else 0), `data.loanAmount` (forced loan that will be taken), `data.loanMonthly` (its monthly cost).
Show "חסרים ₪X — הבנק ייתן הלוואה של ₪Y (עולה ₪Z בחודש)" when `shortfall > 0`.

### Doodads: wants vs needs (#4)
* `data.need: boolean`. Needs (car repair, fines…) are mandatory: `pay` (+ `credit` when allowed).
* Wants get a new option **`skip`** ("לוותר") — primary by default. Stats: `stats.resisted` (count), `stats.toysResisted` (₪), `stats.toysSpent` (₪ paid for wants), `stats.needsSpent`.
* New achievement `strong_will` (ויתרת על 4 פיתויים במשחק אחד).

### Smart default — `primary` on every option (#1) — **BREAKING-ish**
* Every option object now has `primary: true|false` (exactly one true; quiz answers: none, so Enter does not leak the answer).
* Deals: primary = the best buy option when its **net** monthly effect (asset cashflow − monthly cost of any loan it needs) is > 0 (and, in w3/w4, the asset is not overpriced/declining); otherwise `pass`.
* Buy options carry `net` (number, ₪/month incl. loan cost) and `netLabel` ("+₪350 בחודש" or "בסוף החודש: −₪4,900"). Also `loanAmount`, `loanMonthly` on the option. `data.roiVsLoan` (string) compares the deal's yearly ROI with the loan's yearly cost; `data.loanYearlyPct`.
* Doodad wants → `skip`; needs → `pay`; bank (w2) → `refi` when the new rate ≤ `rate.lockBelow` (4.5%) and the fee fits in cash; fx → hedge the exposed side when the dollar sits on its good side and the fee fits in cash, else `ok`; shipping insurance → `insure` when you are exposed and it costs ≤ 15% of cash; pitch → small check on a quiet good team (team+traction ≥ 4, hype ≤ 2) from spare cash, else `pass`; giving → smallest gift to an efficient cause (eff ≥ 1) from spare cash while impact < goal, else `pass`; upgrade → best upgrade/trim that pays back ≤ 24 months without a loan, else `pass`; others → the safe continue option.
* Upgrade/trim options also carry `net`, `netLabel`, `loanAmount`, `loanMonthly`, `payback` (months). Pitch and giving options carry `loanAmount`, `loanMonthly`.

### Irrelevant cards (#7)
* `event.auto: true` + `event.toastText` when the card does nothing to you (dividend without shares, bonus/repair/loss without matching assets, sell offer with nothing to sell, startup news without startups, rate move with no variable debt, dollar move with no exposure, crypto news while no coin is alive, deals you can neither pay for nor borrow for…). They have exactly one option (`ok`/`done`/`pass`): show the toast and call `choose(st, ev, ev.options[0].id)` yourself. They consume the RNG exactly like normal cards.

### Tutorial (B5, #2) — free mode only
`createGame({tutorial:true, mode:'free'})`: first roll is forced onto a deal tile (seeded die still consumed), first deal = `starterDeal` with down payment = min(down, cash), no crisis in the first 3 turns (a crisis tile becomes an auto toast). `tutorial` is ignored in every other mode.

### Bail-out (#1)
`createGame({..., bailout:true})`: the first time a game would end in bankruptcy, the bank restructures instead (money-losing assets sold at value, credit folded into the bank loan, part of the loan written off so the monthly cashflow is ≥ 0). `rollDice()` result gets `bailout: {title, text, mentor, leaks, sold:[names], writtenOff, creditFolded}` and the same object in `news` with `kind:'bailout'`. Show it as a mentor card. Once per game (`st.flags.bailoutUsed`).

### Crypto (B4, w1)
* MOON is a coin with a life: a "new coin" card launches a **new** coin (name changes: MOON → STAR → ROKET …) with a hidden fate drawn at launch (most die, a few pump ×3, rarely ×8). Expected value < 1. Old coin holdings are wiped at the next launch: `data.wiped: {qty, value, oldName}`.
* Event `data.name`, `metrics().holdings[].name` show the current coin name. `data.coinAlive`.
* Achievement `moon_landing` removed → **`lucky_exit`** "יצאת בזמן — הפעם היה מזל" (sold crypto at ≥ ×2).

### Loss explanations (#9)
* New stats: `interestPaid` (bank-loan + credit interest paid), `forcedLoans` (₪ of auto loans), `toysSpent`, `toysResisted`, `resisted`, `badAssets` (count of negative-cashflow assets bought), `badAssetLoss` (₪ those assets lost), `needsSpent`, `subsPaid`.
* `checkEnd()` adds `leaks: [{key, label, amount}]` sorted by amount (keys: `interest | toys | badAssets | subs | forced`) and `tip` from the biggest leak that was a choice (forced expenses are listed, never blamed).
* Market buy-out offers are based on current value and cashflow: assets that lose money get ≤ 85% of value, never a premium.

### Decision log & server summary (#10)
* `st.log`: `[{t: turn, c: card title (≤ 24 chars), o: option label (≤ 24 chars)}]`, the last ≤ 80 meaningful decisions (auto cards, payday "ok" and plain "done" are not logged).
* `E.summaryForServer(st)` → `{v, worldId, charId, months, turns, status, stars, netWorth, passive, expenses, impact, progress, stats, leaks, log}` — JSON < 10 KB. Send this with rr_finish.

### Ranking / daily (#7)
* `goalProgress` is now the ranking metric (0..1, strictly increasing with progress, 1 only when the goal is met): passive worlds `0.05 + 0.95 × passive/expenses` (negative passive still ranks); net-worth worlds `0.1 + 0.9 × netWorth/target`; w4 = (min + mean of its two parts)/2. **Display meters should use `goalParts[].progress`** (plain value/target). Tie-break unfinished games by `netWorth`, then `passive`.
* `dailyConfig(date)` now returns `maxMonths: 24` (daily sprint).

### Balance changes in this round (data only)
* Month limits / stars re-derived per character (tools/balance-report.md): w1 teacher 48, driver 54, dev 60, doctor 72; w2 48 (lawyer, pm 54); w3 48; w4 50 (social 56).
* w1: 2 new small trap deals, crypto rebuilt. w2: starts at 3% (long-run ≈ 5%), a +3% rate-shock bank card, 2 near-zero "rate traps", pricier subscriptions, deal income −8%. w3: dollar shocks of ±15% (±₪0.55), hedge fee 0.25% of value × |sens| per 12 months, crises push gold +45–50% and cut asset values, more starting cash. w4: rarer but bigger exits (25× / 100×), goal **₪10M** + 100 impact (was ₪12M).
* Wants/needs in every world's doodad deck (`need: true` on needs).

### Balance v2.1 (tools/balance-report.md, 600 seeded games per character × policy)
"tapper" = always taps the highlighted `primary` button and never touches the loan buttons.

| world | maxMonths | smart median months (turns) | default char turns | smart p90 | tapper median / in time / ★★★ | greedy med | cautious med | win in time: smart / greedy / cautious / reckless / random | smart ★★★ / ★★+ |
|---|---|---|---|---|---|---|---|---|---|
| w1 השכונה | 48 | 33 (56) | teacher 44 | 49 | 36 / 96% / 6% | 37 | 53 | 98% / 85% / 63% / 25% / 18% | 13% / 50% |
| w2 העיר הגדולה | 48 | 28 (46) | lawyer 46 | 50 | 31 / 84% / 13% | 29 | 46 | 91% / 78% / 35% / 27% / 22% | 14% / 51% |
| w3 הנמל הגלובלי | 48 | 32 (54) | importer 54 | 43 | 36 / 90% / 6% | 34 | 44 | 97% / 92% / 70% / 31% / 23% | 14% / 54% |
| w4 עמק העתיד | 50 | 34 (57) | founder 51 | 47 | 42 / 88% / 0% | 37 | 46 | 95% / 80% / 58% / 12% / 33% | 16% / 53% |

Per character (month limit / ★★ / ★★★): w1 teacher 48/26/19 · driver 54/30/21 · dev 60/33/25 · doctor 72/41/31 — w2 lawyer 54/27/20 · chef 48/26/17 · pm 54/30/22 — w3 importer 48/32/22 · exporter 48/34/24 · captain 48/32/22 — w4 founder 50/30/23 · engineer 50/34/26 · social 56/37/27.

Mechanic ablations (smart player, one rule switched): w2 lock-when-low 27 mo / 90% in time vs always-variable 27 / 85% vs always-fixed 29 / 89% vs no upgrades 33 / 71% · w3 hedge-when-favourable 33 / 97% vs never 34 / 95% vs always 36 / 94% (gold ≈ neutral: insurance, not growth) · w4 small diversified checks 33 / 96% vs no startups 35 / 98% vs big checks 41 / 59%.

### Copy
* `goalLabel`s are words, no "≥" (w1/w2 "ההכנסה הפסיבית עוברת את ההוצאות").
* `intro()` says "everyone gets the same dice" only in seeded modes (daily/weekly/challenge).
* `heCount(n, one, many, zero?)` helper → "יבואן אחד" / "2 יבואנים" / "אין יבואנים". fx events add `data.exposureText`.

## Changes
* 2026-11-19 (before any UI code): stars and month limits are **per character** → use `starThresholds(worldId, charId)`; gifts' impact vests over 10 months (`worldIndicators.impactPending`).
* v2.1 — see "Changes v2.1" above (debt rates & caps, primary defaults, auto cards, wants/needs, crypto, bail-out, leaks, log, ranking-safe goalProgress, daily 24 months, w4 goal ₪10M).
* API otherwise frozen; numbers in js/worlds/*.js may still be tuned.
