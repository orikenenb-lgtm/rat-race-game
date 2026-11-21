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

---------------------------------------------------------------------------------------------------

## Changes v3 — "החיים האמיתיים" (engine lead) — FINAL CONTRACT
Everything from v2.1 still holds (primary flags, `net`/`netLabel`, `auto` cards, bail-out, leaks, `summaryForServer`, determinism, tutorial, daily = 24 months).
New engine files: `js/life.js` (payslip/tax, plans, credit bands, life events, LESSONS — pure data + helpers), `js/history.js` (real-data access for מכונת הזמן; loads `js/data/real.js` lazily with top-level `await import`, never required by the 4 worlds), `js/worlds/h.js` (history world, `getWorld('h')`, not in `WORLDS`).

### 1. Board & dice (owner addition)
* **Two dice.** `rollDice()` → `{dice:[a,b], die:a+b (2..12), double:{kind:'energy'|'peek', text}|null, burnout:{medical,text}|null, lessons?, …v2 fields}`. Both dice are drawn every roll (also in the tutorial, whose first roll is still steered onto a deal). `st.lastRoll = {die, dice, double, from, to, steps}`.
* **Doubles**: first die odd ⇒ `energy` (+8 energy, +2 happiness); even ⇒ `peek` (`st.life.peek`: +10% acceptance on the next negotiation). Also a `news` item `{kind:'double', bonus, text}`. No extra turn.
* **40 tiles** (11×11 ring), paydays on corners **0/10/20/30** (passing or landing ⇒ payday, as before). New tile types in `TILE_TYPES`: `L` life (`icon:'life'`), `E` education & career (`'school'`), `T` tax office (`'tax'`), `I` index fund & pension (`'piggy'`). Each world keeps its own mix (w1 more deals; w2 bank/upgrade; w3 fx/shipping; w4 pitch/giving).
* `boardInfo(worldId|state)` → array of `{index, i, ch, type, name, color, ink, icon}` (length 40) with extra props `.corners = [0,10,20,30]`, `.size`. Draw any length from it.
* Tempo: ≈1.4 rolls per month (v2: ≈1.7) — month thresholds were re-calibrated (see balance report).

### 2. New state (read via `metrics()`; never write)
```js
st.life = { age, startAge, energy 0..100, happiness 0..100 (base), glow:[{amt}] (toy happiness, halves monthly),
  plan:'work'|'overtime'|'study'|'side'|'rest', planMonths:{…}, study:{months, need:8, done}, side:{months, level, total},
  family:{partner:'none'|'together'|'married', wedding, kids}, kidsBorn:[month], workLoad,
  creditScore 300..850 (start 680), gross / grossUsd (base GROSS salary), pension, severance, cpi, cpiAdj, inflationYear, infl:[%],
  burnouts, raises, lastRaise, raiseR, jobless:{until}|null, events:[{m,id,o}], autoInvest, friend, taxRefund, sideTaxDue, lossCarry,
  idxHist, idxPeak, lastCrash, idxSold, idxSoldLoss, negWins, negLosses, negSaved, peek }
st.lessons = ['gross_net', …]                       // unlocked lesson ids (this game)
st.taxes   = {income, bl, capGains, rental, betterment, side}   // ₪ paid so far (whole shekels)
st.actions = [['r'], ['l'], ['c','buy',3], …]        // replay log (see §9)
st.history = {scenarioId, name, index, startYm, ym, months, base, bench, headline, idxHist, startCash, startNW}   // history mode only
st.salary  = base take-home (legacy field, kept in sync)
```

### 3. Payslip — salary is GROSS, cashflow uses NET
* Israeli 2026 parameters from `js/data/tax.js` `TAX_IL` (one source; tested deep-equal to `js/data/real.js` TAX_IL; `life.js TAX` is a frozen read-only view): brackets 10/14/20/31/35/47/50%, 2.25 credit points × ₪242 (+1 per child, +1 after a degree), Bituah Leumi 1.04%/7% + health 3.23%/5.17% (threshold ₪7,703, ceiling ₪51,910), pension employee 6%, employer 6.5% + severance 6% → `life.pension`.
* **₪15,000 gross → ₪11,312 net** (tested). `net = round(gross − exact deductions)`; the income-tax line absorbs rounding so lines always add up.
* Characters keep their v2 take-home: `gross = grossFromNet(v2 salary)` (±₪10). `characterCard()` adds `gross, net, age, family`.
* `metrics().payslip = {gross, base, overtime, incomeTax, bl, bituahLeumi, health, pensionEmployee, net, employerPension, severanceDeposit, pensionDeposit, effectiveTaxRate, marginalRate, sideIncome, studyCost, jobless?, lines:[{label, amount}]}`.
* `m.salary` = **net** take-home this month (plan-adjusted). `m.sideIncome` (expected side-hustle income), `m.cashflow = salary + sideIncome + passive − expenses`. `incomeLines[0].id = 'salary'` ("משכורת נטו"); side line id `'side'`; rent tax line id `'rentTax'` (negative). Study tuition is an expense line id `'study'`; temporary life costs are expense lines with "(עד חודש N)".

### 4. Metrics additions
```js
m.life = { age, ageText, energy, happiness (incl. glow), happinessBase, plan, planLabel, plans:[{id,label,desc,enabled,current}],
  creditScore, creditBand:'מצוין'|'טוב'|'בינוני'|'חלש'|'גרוע', creditBandId, loanPctAdj, pension, severance, cpi, inflationYear,
  realCash, realNetWorth, studyProgress 0..1, studyDone, sideLevel, sideMonths, family:{partner,kids,wedding,text}, freeTimeMonths,
  burnouts, jobless, burnoutRisk 0..1, autoInvest, raiseEligible, raiseChance }
m.payslip (above) · m.taxes · m.index = {ticker:'IDX', price, qty, value, avg, history:[≤24], autoInvest, divPerUnit}
m.pension · m.netWorthTotal = netWorth + pension
```
**`m.netWorth` is unchanged (liquid, excludes the pension)** — goals and rankings use it; the pension is shown separately (`netWorthTotal`).

### 5. Time, energy, happiness
* **Monthly plan** applied at every payday (passed or landed); change it with `setPlan(st, id)` any time between rolls or on the payday / `E` cards. Plans (`PLANS` export): `work` (+4 energy) · `overtime` (+25% gross, taxed at your top bracket, −12 energy, −2 happiness) · `study` (tuition 12% of net, −6 energy; after 8 study months: **+20% gross for good**, +1 credit point, plan returns to work) · `side` (side income 8% of net × level 1–3 × pre-drawn 0.6–1.4, −8 energy; after 15 months it becomes a real business asset `k:'side'` with cf 30% of net) · `rest` (−15% gross, +18 energy, +4 happiness).
* **Burnout**: energy < 25 ⇒ chance 0.2 + (25−energy)/40 (pre-drawn every payday). Effect: that month no salary + medical cost 30% of net, happiness −15, energy → 45, plan → rest. `rollDice().burnout`, `news {kind:'burnout'}`.
* **Happiness**: plan deltas, life events, family set point (55 + married 5 / together 2 + 3 per child (max 2) + 2 after a degree), 10%/month adaptation to the set point, −2/month for debt stress (bank+credit > 6× income), negative cashflow, or energy < 30. Toys add `glow` (+2…+8) that halves monthly (hedonic adaptation) — **stars use the base happiness, not the glow**.
* **★★★ = escape by T3 AND final happiness ≥ `starThresholds().happy` (60) AND an emergency fund ≥ `starThresholds().fundMonths` (3) months of expenses** (v3.2). Otherwise ★★ and `result.starsBlockedByHappiness` / `result.starsBlockedByFund = true`.
* **Raise request** (payday card option `raise`, `chance` shown): eligible with energy ≥ 65 and ≥ 10 months since the last raise; chance 0.3 + (energy−65)/70 (+0.2 after a degree, +0.1 after 20 months), 0.1..0.85, pre-drawn at the payday. Yes ⇒ +8% gross; no ⇒ −3 happiness and wait 6 months. Result `out.raise = {accepted, gross?}`.

### 6. Inflation, index fund, pension, investment taxes
* CPI: monthly index `life.cpi`; prices adjust **once a year** (every 12 paydays): living costs × CPI, gross salary × 80% of it, rents (`kinds[k].rent`) × 70%, other businesses × 50%. Yearly inflation pre-drawn: 2–4% (10%: a 6–8% spike year). History mode uses the real CPI. News `{kind:'inflation', inflation}`.
* **Index fund `IDX`** in every world's `tickers` (`kind:'index'`, start ₪100): monthly return from `invest.js simulateReturns` (exactly 2 draws/month from the `index` stream; median +4%/yr price, vol 14%/yr, 1%/month crash −15%, every crisis tile −8%) + distribution 0.25%/month after 25% tax (= passive income). Trade it in any IDX trade window (tile `I`, history `M` tiles) or any time with `invest(st, 'buy'|'sell', qty)`; standing order `setAutoInvest(st, ₪)` (bought after each payday if cash allows; options `auto:on`/`auto:off` in IDX windows).
* Pension grows with the same monthly return (+ distribution). It is not cash.
* **Capital-gains tax 25% on the REAL gain** (v3.2, `invest.js capitalGainsTax mode:'real'`: the part that only kept up with the CPI is exempt; holdings keep a money-weighted `cpi` basis, assets a purchase `cpi`) on every realised trading gain (stocks, crypto, IDX, gold, USD, angel exits, asset/business sales) with loss carry-forward (`life.lossCarry`). Trade results carry `tax`; trade data `taxRate, unrealizedGain, lossCarry`. **Asset sales**: 25% on (offer − purchase price) → `offers[].tax`, `offers[].netAfterTax` (= `net`).
* **Rent tax** (v3.1, `invest.js realEstateYield` rule): total GROSS residential rent (`kinds.rent`: w1 re, w2 tower/mall, w4 campus; gross = card `rent`, else cf + mortgage interest at 4.9%, or NOI/0.8) is exempt up to ₪5,654/month; above the ceiling **10% of all of it** → income line `rentTax` ("10% מכל שכר הדירה (עברת את תקרת הפטור…)"); deal data `rentTax` = the extra tax this deal would add, `yield = {grossYield, netYield, capRate, lines, note}`.
* Tax office (tile `T`, type `tax`): pays out `life.taxRefund` (≈3% over-withholding, unused credit points in jobless months, 35% donation credit in w4) and collects `life.sideTaxDue` (undeclared side income × marginal rate). If you never visit, the side tax is billed automatically at year end **+10% penalty** (refunds wait for you). Data: `{refund, bill, net, taxes, paidTotal, effectiveRate}`; nothing to settle ⇒ `auto` toast.

### 7. Credit score (דירוג אשראי)
Start 680. Deltas = `bank.js CREDIT_DELTAS`: forced loan −25 · open credit-card debt at a payday −4 · clean month +2 · repay a loan unit / pay off the card +6 · bail-out −80. Rate add-on = `bank.js creditSpread(score)` (annual: ≥760 −0.5% · 680–759 0 · 600–679 +0.75% · 520–599 +1.5% · <520 refused) ÷ 12 as monthly percentage points (`m.life.loanPctAdj`). 520–599: half the loan cap; <520: **no voluntary loans** (forced loans still happen, +0.125 pp). Disabled loan options use the reason `דירוג האשראי שלך … — הבנק מגביל הלוואות חדשות`.

### 8. New / changed events
* `payday` (landed): options `ok` ("להמשיך: <plan>"), `plan:<id>` for the other plans, `raise` (when eligible). Plan options have `kind:'plan', plan, effects:{net, netDelta, gross, incomeTax, energy, happiness, note}`. Primary = the smart default (rest when tired, study early, else work — never overtime/side). Data adds `plan, planLabel, payslip, energy, happiness, burnout, creditScore, raiseChance?`.
* `edu` (tile E): the same plan options + `course` (short evening course: 50% of net, +2 study months).
* `payday` also offers `save` ("להעביר ₪X לקרן החירום", up to 3 months of expenses, keeps 1 month in cash) — v3.1.
* `tax` (tile T): see §6.
* `life` (tile L): `data:{eventId, kind, personal}`; **personal dilemmas (wedding, baby, moving, parent, friend, jobOffer, vacation, layoff) have NO primary** (v3.2 — no "right answer" button; `ev.options.every(o => !o.primary)`); every option `{kind:'life', effects:{cash, monthly, months (0 = permanent), happiness, energy, glow, note, salary?, risk?, study?}, loanAmount, loanMonthly, chance?}`; primary = the balanced choice (cheapest one if the balanced one needs a loan). Events (`LIFE_EVENTS`, amounts scale with net salary): `wedding` (modest / big / registry), `baby`, `moving`, `parent`, `car` (fix / lease / bus & bike = −60% car costs for good), `friend` (lend: repaid after 6 months with 60% / guarantee: 35% you pay 1.5× net / no), `reserve` (מילואים, +grant), `jobOffer` (take +25% gross & +4 energy cost/month / counter +10% with 60% / stay), `layoff` (2 months on 60% benefit; withdraw severance or keep it in the pension), `health`, `vacation`, `course`. Outcomes are pre-drawn with the card (`p.r`), reported later as `news {kind:'lifeNews'}`.
* `deal`: + `offer:5|10|15` options (`kind:'offer', chance, saved`, never primary) when you could buy. The seller's answer is **sealed when the card is drawn** (`pending.negR`, ranked-fair). Accepted ⇒ the same event re-renders cheaper (`data.negotiated = {pct, saved}`, offers gone, `out.negotiation = {accepted:true, pct, saved}`); rejected ⇒ the card closes (`out.negotiation.accepted = false`). Chance 80/55/30%, ×0.4 on golden deals, +10% after a "peek" double.
* `trade` on `IDX` (tile I: `source:'index'`; history M tiles: `source:'market'` with the real headline as title): data adds `index:true, pension, autoInvest, history`; options add `auto:on` / `auto:off`.
* `crisis` (worlds): the index fund drops 8% on landing.

### 9. Server = source of truth: replay
* Every state-changing call is appended to `st.actions` (compact): `['r']` roll · `['l']` landing that drew a card · `['c', optionId, qty?]` choose · `['L', amount]` takeLoan · `['R', amount]` repayLoan · `['C']` payCredit · `['P', plan]` setPlan · `['A', ₪]` setAutoInvest · `['I', side, qty]` invest. Failed calls are not logged.
* `replay(cfg, actions) → state` (pure; no Date/Math.random) re-runs the game; `replayConfig(st)` gives `{worldId, charId, seed, mode, maxMonths, scenarioId, bailout, tutorial}`. An impossible action throws `replay_mismatch at i (…)`. Tested: replay reproduces the byte-identical state in every world, ranked + free + history.
* `summaryForServer(st)` now also has `life{…}`, `scenarioId`, `lessons`, **`config` and `actions`** (log trimmed to the last 40; whole summary ≈ 5–9 KB). The Edge Function: `replay(summary.config, summary.actions)` then compare `checkEnd(state)` with the claim.

### 10. Money precision
All money is **whole shekels (integers)**: trades round `qty × price` once (`Math.round`), basis is stored in whole ₪, pension/taxes/payslip are integers, interest/fees were already rounded. Prices (share prices, index) may have agorot; cash never does. Tested over random games in all worlds. Known-value tests: ₪15,000 gross → ₪11,312 net; `compound(10000, 0.5%, 12) = 10,617`; ₪5,000 bank loan at 3%/month = ₪150/month; `inflate(10000, '2021-06', '2023-06')` = exact CPI ratio from real.js.

### 11. History mode — "מכונת הזמן"
* `scenarioList()` → `[{id, name, start, months, blurb, lesson, index}]` from real.js (dotcom 2000, gfc 2007, covid 2019, inflation22 2021, housingIL 2008–2021).
* `createGame({mode:'history', scenarioId, charId?:'h1'|'h2', seed})` → `worldId:'h'`, `maxMonths = scenario.months`. Throws `'history data not loaded'` if real.js is missing.
* Each payday = one real month: IDX follows the scenario index (sp500 default; price index + 0.167%/month distribution ≈ 2%/yr dividends), bank rate = BoI rate (loans cost (BoI + 4.5)/12 % a month), CPI real, home values follow `homeIL`, headlines arrive as `news {kind:'headline', ym, ymText, text}` and on M tiles. `metrics().worldIndicators = {ym, ymText, index, indexHist, rate, rateHist, cpi, home, usd, headline, benchmark, scenario}`; `goalType:'benchmark'`.
* End (only when the months run out): `won` if your liquid net worth ≥ the buy-and-hold investor (all starting cash into the fund + the same monthly saving, dividends reinvested). `result.benchmark = {netWorth, cashOnly, text, whatIf:[you, hold, cash, panic?], panicLoss, from, to}`. Stars: ★ real net worth grew · ★★ beat the benchmark · ★★★ beat it with happiness ≥ 60.

### 12. End — "סיפור החיים שלך"
`result.lifeSummary = {age, ageText, startAge, years, headline:'בגיל 41 יצאת מהמירוץ', netWorth, realNetWorth, passive, pension, freeTimeMonths, planMonths, family, kids, wedding, happiness, avgHappiness, energy, burnouts, creditScore, taxesPaid, studied, raises, lifeEvents, topDecisions:[{t,c,o,v}] (≤5, by ₪ impact), leaks, sentence}`; also `result.lessons` (all unlocked) and `result.happiness`. Decision-log entries carry `v` (₪ impact) when relevant.

### 13. Lessons library
`LESSONS` / `lessonsList()` (engine export): **59 life lessons + 16 business lessons (`biz_…`)** `{id, cat, title, text}` (cats: money, debt, invest, tax, time, life, world, history). Every result (`rollDice`, `choose`, actions) may carry `lessons:[{id,title,text}]` newly unlocked this step; `st.lessons` = all unlocked this game.

### 14. Other API
`setPlan` · `setAutoInvest` · `invest` · `replay` · `replayConfig` · `scenarioList` · `lessonsList` / `LESSONS` · `PLANS` · `payslipFor(gross)` · `inflate(amount, fromYm, toYm)` · `rollCost(st)` (1 free/history, 0 ranked — the ⚡ limit itself lives in the lobby lead's `js/energy.js`) · `registerRealData(mod)` (tests). New achievements: `balanced`, `negotiator`, `scholar`, `steady_hand` (history).

### 15. Saves
`SAVE_VERSION = 3`. `deserialize()` migrates v2 saves (`st.v === 1`): board position mapped 24→40 (never onto a payday), new RNG streams appended (`life`, `index`; old streams untouched), IDX added, life/taxes/lessons defaults (take-home preserved). Anything else throws `Error('save_incompatible')` → UI: "המשחק השמור מגרסה ישנה — מתחילים מחדש".

### 16. One economic engine (see "Changes v3.1")
The engine imports `js/finance/bank.js`, `invest.js`, `business.js` and uses them instead of its own formulas where they overlap.


---------------------------------------------------------------------------------------------------

## Changes v3.1 — one economic engine (ARCHITECTURE A1–A5) + owner/orchestrator additions
### A1. Finance modules replace the engine's own formulas (no parallel formulas)
| engine concern | now computed by |
|---|---|
| bank-loan & card interest (`loanPay`, `creditPay`) | `bank.js checkingMonth` (interest-only credit line = מסגרת; agora-exact) |
| credit-score rate spread / refusal / deltas | `bank.js creditSpread` (÷12 → monthly pp), `CREDIT_DELTAS` |
| capital-gains & asset-sale tax | `invest.js capitalGainsTax` (v3.2: `mode:'real'`) |
| index dividend tax | `invest.js INVEST.dividendTax` |
| index monthly return | `invest.js simulateReturns` (2 draws/month) |
| rent tax | `invest.js realEstateYield` (exemption track / 10% of gross) |
| emergency-fund interest | `bank.js savingsMonth` (2% − 15% tax; history: BoI − 1.25%) |
| "real world" rates | `bank.js loanOffer` (prime track, ₪50K/60m), `overdraftRate`, `BANK.mortgage.fixedRate` |
| compounding preview | `invest.js projectRange` (p10/p50/p90, `NOTE_NO_GUARANTEE`) |
| CPI monthly step | `bank.js dpow` (bit-identical across JS engines) |
| managed businesses | `business.js` (create / simulate / applyDecisions / suggest / forecast / valuation / sell / applyShock / applyInflation) |
Proof: same-seed before/after run of the formula swap (2,016 games = 4 worlds × 6 policies × 84 seeds): **2,011 identical**; 5 differ by ₪1–6 (w2 fractional rates now rounded to the agora — intended). All later rule changes are listed below as intended. Engine/life/history contain no `Math.pow/exp/log/sin/cos/**` (tested) so `replay()` is identical on the server.
* Not overlapping (kept): FX hedge fee (`hedgeFee`) — no FX product in the finance modules. Shpitzer mortgages/amortizing loans are not used for game cash yet (the game's loans/mortgages stay interest-only and are LABELLED so via `data.reality`); bank.js schedules are available for display.

### A2. Net worth
`m.netWorth` = liquid net worth (cash + savings + holdings + assets − debts), **excludes the pension**; `m.netWorthTotal` = incl. pension; goals use `netWorth`. Also `m.totalAssets`, `m.totalLiabilities` (the UI must not sum anything itself).
### A3. One tax table
`js/data/tax.js` (TAX_IL, = real.js TAX_IL, tested); no `setTaxTable`, no mutation.
### A5. Lazy real data
`js/history.js` no longer imports real.js at load. `await E.loadRealData()` (→ true/false) before `createGame({mode:'history'})`; `E.scenarioList()` returns `[]` and starts the load if it is not loaded yet. The Edge Function must `await loadRealData()` before replaying a history game.

### New mechanics
* **Emergency fund (קרן חירום)** — `st.savings` (liquid, counts in net worth). `moveSavings(st, ₪)` (+ deposit / − withdraw; action `['S', ₪]`); payday option `save`. Interest monthly (`savingsMonth`). When cash goes negative the **fund pays before any forced loan** (no credit hit; news `{kind:'savings'}`). A crisis you can cover from cash + fund costs no happiness; uncovered: −4. Metrics: `m.savings`, `m.emergency = {balance, months, target:3, covered, rate, text:'קרן חירום: X חודשי הוצאות'}`. Crisis data: `savings, fundCovers`.
* **Freedom must hold** — the world goal must be met on **2 consecutive paydays** (`GOAL_HOLD = 2`) before the game is won. `m.goalHold = {streak, need, met}`; news `{kind:'goalHold', streak, need}`; `goalProgress` reaches 1 only once held.
* **Real-world rates** — `m.realWorldRates = {boi, bankLoan:{gamePerYear, realPerYear, effectivePct, text}, credit:{…}, mortgage:{realPerYear, text}, savings}`; liabilities carry `gameRate, realWorldRate, realText`; loan/credit expense lines say "3% בחודש במשחק · בעולם האמיתי ≈ 7.25% בשנה".
* **Managed businesses — tile `K` ("העסק שלך", icon `shop`, type `business`)**: one per board. No business yet ⇒ an offer card (`data.mode:'offer'`, archetype from `world.bizOffers`, seeded from the `deal` stream: 2 draws always) with `start` (kind `buy`, startCapital, forecast) / `pass`. With a business ⇒ a decision card (`data.mode:'manage'`, `data.summary` = `business.js summary`, `data.options` = `decisionOptions`, `data.why`): options `biz:suggest` (primary, once per visit), `biz:manager`, `biz:price:up|down`, `biz:mkt:up|down`, `biz:hire|fire`, `biz:draw:up|down`, `biz:order`, `biz:expand`, `biz:sell` (`sale:{price, net, tax, text}`), `ok`. Decision options stay on the card (like a trade window) until `ok`/`biz:sell`. Each option: `effects:{netProfit3, delta3, energy}`, `cashNeeded` (the owner injects it).
  Every payday each business is simulated (`business.js simulate`, 3 draws from its own sealed stream `st.bizRng['a'+id]`): `st.cash += toOwner.net`, 🔋 −ownerEnergy, `st.taxes.business += corpTax + divTax`, lessons, news `{kind:'business', assetId, name, headline, note, events, net, netProfit, revenue}`. **Owner-run = active income** (income line `biz:aX`, `active:true`, not passive); **with a manager = passive** (counts toward the goal). Asset `k:'biz'`, `a.biz` (the business object), `a.bizDraw`, `a.bizNet`, `a.value` = valuation; `m.assets[].business`, `m.businesses`, `m.activeBizIncome`. Crises → recession shock; yearly CPI → `applyInflation`; w1 bonus cards → holiday demand shock; market buy-outs value it with `valuation × mult`; sale tax = capital gains (no double tax). The side hustle now grows into a managed coffee cart (free equipment). Leak `business` = cash injected into a losing business. `LESSONS` now includes `business.js BIZ_LESSONS` (ids `biz_…`).
* **Rename**: in-game energy is **🔋 כוח** in all engine copy (⚡ stays the roll limit).
* w3/w4 targets: **₪9M** (w3) and **₪9M + 90 impact** (w4) — tempo (default characters ≤ 60 turns).

## Changes v3.2 — education review (docs/EDUCATION_REVIEW.md)
* Copy fixed (C1–C10, S-items) in worlds/common/life/h/achievements: no "7% לחודש", no "החוב הכי יקר", honest `rateDown`, rent-tax label = math, `credit_card_debt`/`rental_tax`/`betterment_tax`/`capital_gains`/`buy_the_dip`/`credit_points`/`side_tax` lessons, gentle `passBad/passZero/buyBad`, gold/dividend/MADAD/MOON caveats, study "no guarantee", unemployment "בערך 60%", layoff "ולפעמים גם מס", Japan caveat in history, `no_installments` = "בלי אשראי", `unicorn` = luck. (C5 is in business.js — business engineer.)
* **Installments**: doodads offer `inst3` (`bank.js installments`: 3 interest-free payments — first now, the rest as expense lines with `from/until`) and `credit` relabelled honestly "באשראי מתגלגל (₪X ריבית בחודש · 5% לחודש — החוב עצמו לא קטן)". Data: `installments3`, `reality`.
* **Startups EV ≈ 1×** (w4 outcomes: ×1.1 at average quality, ×0.6 hyped, ~×2 best teams); honest `oddsText`, `revealHint` ("בעולם האמיתי: 5–10 שנים"), `pitchPass`/grant texts without FOMO.
* **Quizzes reward understanding, not money**: `data.reward = 'lesson'`, `data.lesson`; result `out.reward = {kind:'lesson', lesson, right}` (lobby may add a small ⚡); rewritten "it depends" quizzes (C12).
* **Degree credit point** lasts 36 months after graduation. **Side income can be reported**: `setSideReport(st, true)` (action `['T',1]`) or the tax tile option `report` ⇒ tax withheld monthly, no year-end +10% penalty.
* **★★★ needs a 3-month emergency fund** (see above). Deal primary only buys with ≥ ½ month of expenses left (or when the deal adds ≥ 15% of monthly expenses); `data.cushionAfter`, `data.warning` when < 1 month.
* **`data.reality`** ("⚠ במשחק / 🌍 במציאות") on: deals (real-estate yields & 50% LTV, interest-only mortgages, no bank-financed down payments, business ≠ fixed cashflow), doodads with credit, trades (fees; IDX distributions; gold), market sales (betterment tax), pitches (angel returns), payslip (pension), unemployment payslip, inflation news, history indicators (USD). Also `m.index.projection` / IDX trade `data.projection` = `projectRange` range + `text` ("תחזית בלבד — אין תשואה מובטחת…").
* **Gender**: characters have `gender` ('f'|'m'); `createGame({gender})` may override; all mentor/text output addressed accordingly (`E.genderize(text, gender)`; masculine data → "את / תחשבי / שימי לב…").
* **Understanding vs luck (§8)** — `st.dq`. Every real choice gets `{score 0–100, verdict:'strong'|'ok'|'mixed'|'risky'|'costly', why, principles}` from information visible at that moment (expected value + downside + flags: noCushion, dsr, gamble, panicSell, concentrated, burnout; options within ½ month of expenses of the best = 100; personal life choices = 100 unless risky; the monthly plan is compared with plans only). Returned on each `choose()` as `out.decision`. Luck (₪, separate): index path vs expectation, angel exits vs their public EV, crypto vs EV, negotiation & raise answers vs their odds, friend loans. `checkEnd().learning = {decisionQuality, decisions, verdicts, principles:{id:{mastery 0..1, n, shown}}, luck:{total, parts}, top:[{c,o,score,verdict,why}], sentence}`; also in `summaryForServer().learning`. Money is never affected. Principle ids: cashflow, cushion, debt_cost, leverage, rate_risk, diversification, time_in_market, opportunity_cost, risk_size, fees_tax, time, knowledge. Tested: primary-follower ≥ 70, random/reckless clearly lower, deterministic.
* New achievements: `cushion3`, `good_call`, `no_panic`.
* UI zero-math fields: `m.taxes.total`, trade `data.unrealizedTax`, `m.index.maxBuy`.

### API summary (v3.1/v3.2 additions)
`loadRealData()` · `moveSavings(st, ₪)` · `setSideReport(st, bool)` · `genderize(text, gender)` · `GOAL_HOLD` · `inflate(amount, fromYm, toYm)` · `registerRealData(mod)`. Replay actions: `r l c L R C P A I S T`.

---------------------------------------------------------------------------------------------------

## Changes v4 — T2 "עומק אסטרטגי" (strategic depth core) — engine contract
Spec: `docs/next-level/specs/T2-strategic-depth.md`. Everything from v3 still holds; all new fields are additive. New pure modules in `js/systems/` (picked up by `tools/build-edge.mjs` because engine.js imports them): `mentor.js`, `focus.js`, `dd.js`, `cycle.js`; the engine re-exports them as `E.MN`, `E.FC`, `E.DD`, `E.CY`.

### 1. Rules gate, saves, streams, actions
* `st.rules` 3 | 4 (`createGame({rules})`, default **4**). Rules 3 = the exact v3 game (no dd/cycle draws, v3 option sets, identical money — proven against `tests/fixtures/v3-golden*.json`, 200 games). Rollback = change the default to 3 and re-pin.
* `SAVE_VERSION = 4`. `deserialize`: v1 → `migrateV2` (→ v3) → `migrateV3` (→ v4); then **`v4Defaults(st)`** runs on every load. It is the ONE idempotent function that fills every missing v4 field — later lanes (T3 `story`, T4, T6 `st.tl`, `st.marks`, `dq.luckLog`, decision `k0`…) extend it. Migrated in-flight ranked games get `rules: 3`, free/history `rules: 4`; a pending deal drawn under v3 stays a legacy card (no dd).
* **Stream registry** (`js/rng.js STREAMS`, append-only; the seed comes from the index): 0–9 v1–v3 · **10 `dd`** (exactly 6 draws on every deal or mystery landing, rules 4) · **11 `cycle`** (2 in createGame + exactly 2 per payday, rules 4, every mode incl. history) · **12 `rival`** (T6 deal competition: exactly 4 draws per deal or mystery landing; created now, never drawn in T2) · **13 `listing`** (reserved) · **next free index: 14** (`story`, T3; then T3's per-business streams). Rules 3 never touches 10–13.
* **Action codes**: `F` `['F', id, slot]` setFocus · `H` `['H']` requestHint · `M` `['M', level]` setMentorLevel. (Q = T3, K = T4, W/X = T6, B reserved.) `replay` handles them; `replayConfig` adds `mentor` (the STARTING level), `rules`, `gender`, and `_dev` when present. `verify_core.js` accepts F/H/M and replays rows dated before `RULES4_FROM` with rules 3 (`rulesFor(row)`).
* Decision records (`st.dq.decisions[]`) carry `k` = the index in `st.actions` of the action that created them, `b` = the best option's label, `h: 1` when hinted.

### 2. Mentor levels (`st.mentor` 'guide' | 'hint' | 'pro')
* Default: ranked = `hint` (forced), tutorial = `guide` (forced), else `createGame({mentor})`, else w1 `guide`, others `hint`. Labels: `E.MN.LEVEL_TEXT` (מתחיל / מתקדם / מומחה + desc).
* **guide**: exactly one `primary` — for scored decisions it is the evaluator's top option (`E.scoreOptions`, ties within 0.1 → closing options, then the card's own default); none on quizzes, personal and values life events. **hint/pro**: every `primary` is false; no verdict wording (`E.MN.VERDICT_WORDS`) in labels / mentor / text / `data.roiVsLoan`; the deal trap question `c.q` moves to after the decision; `biz:suggest` label = "הגדרות אוטומטיות של העסק"; business card mentor = `bizAsk`.
* `requestHint(st)` (guide/hint; pro → `ok:false`): `{ok, hint:{optionId|null, label, reasons:[2+ texts], note}, hintsUsed}`; counted and logged once per event. No hint on trade windows, quizzes, auto/single-option cards.
* `setMentorLevel(st, level)` — free/history only (after the tutorial deal); pushes `{m, from, to}` to `st.dq.levelChanges`.
* pro: `choose().decision` is withheld (still recorded). `metrics().mentor = {level, label, hintsUsed, canHint}`.

### 3. Monthly focus ("מוקד החודש", rules 4)
* `setFocus(st, id, slot=0)` — ids `scout debt ops frugal network research none`. slot 0 activates now (between rolls, or on a payday / edu card), paid at once (🔋, 😊, debt fee in ₪); one per month (`none` locks it). slot 1/2 = the agenda (free), popped at each payday (disabled entries reported in `news {kind:'focus'}`). `ops` opens the business panel as a pending card with NO draw (`source:'focus'`); from the agenda it sets `opsOpen` and a later `setFocus('ops',0)` opens it once.
* Effects: scout → `inspect:1` free, `inspect:2` half price · debt → card debt into the bank loan (within the cap), loan rate −0.5 pp/month (w2 −0.25) for 6 months, +10 credit once per game · frugal → cancels the priciest subscription or cuts the largest eligible line 10% (w1) / 8% for good, happiness setpoint −1 per audit (max −4) · network → +0.10 negotiation and raise chances this month · research → sharp gauge for 3 paydays · none → +3 🔋 at payday.
* `metrics().focus` (null in rules 3) and payday/edu `ev.data.focus` = `{current:{id,label,m}, locked, opsOpen, agenda:[{slot,id,label}], options:[{id, icon, label, desc, cost:{energy,happiness,cash}, benefit, notBest, enabled, reason?, suggested? (guide only)}], text}`. `setFocus` returns `focus` (the same block) and `decision` when scored (flags only: burnout / noUse).

### 4. Due diligence (rules 4)
* Asset deal pendings get a sealed `p.dd = {risk, flags, f, vf, repair, jitter, level}`. Public: `ev.data.dd = {level 0|1|2, flags:[{id,text,kind:'warn'|'good'}], claimed:{cf,value,label}, range (level ≥ 1):{cf:[lo,hi], value:[lo,hi], repair:'none'|'small'|'big'}, verified (level 2):{cf,value,repair}, basis:'claimed'|'range'|'verified', expected:{cf,value,repair}, inspect1:{energy,free}, inspect2:{fee,half}}`.
* Options `inspect:1` (`kind:'inspect'`, `cost:{energy}`; 🔋 ≥ 10) and `inspect:2` (`cost:{cash}`; cash ≥ fee) come before the buy options and keep the card open. Buy options: `o.net` = EXPECTED net for the basis; `netLabel` prefixed `לפי המוכר:` / `לפי הבדיקה: X עד Y` / `נבדק:`; `o.basis` = the public scenarios used by the evaluator. `data.cf/cfVar/cfFix` stay claimed until level 2.
* Buying applies the truth (a hidden problem never makes a money-losing line better), charges the repair (`news {kind:'dd'}`), stores `asset.dd = {claimedCf, claimedValue, level, repair}`, mentor line adds "מוצהר X · בפועל Y". `luck.dd` = actual − expected. No inspections on golden (risk 0, good `rush` flag) or starter cards. `checkEnd().ddRecap`, `ddPassed`. Stats: `inspections, inspectSpent, ddRepairs, ddAvoided, ddPassed`.

### 5. Economic cycle (rules 4; `st.econ` null in rules 3, history and `_dev.noCycle`)
* Phases exp/slow/rec/recov (SEALED). Public gauge `metrics().econ = E.CY.econPublic(...)` = `{signal 0..100, label, trend, labelChangedAt, sharp, sharpUntil, hist:[{m,s}], official:[{m,label}] (≥ 3 months old), text}`. `news {kind:'econ', text, label, signal}` on a label change and every 3rd payday.
* Multipliers only (§8.5 of the spec, deviation × world amp: w1 0.5, w2/w3 1, w4 1.1): deal cost at the draw (value keeps its level), rent / other cashflow, bank-loan rate (not w2), loan cap, index drift and crash odds, job-card swaps (not w1), business demand shocks on entering rec/exp. `luck.cycle` per payday. `checkEnd().econPath = {truth, signal, text}`. `E.cyclePath(seed, worldId, months)` rebuilds the path from the seed (tested equal to the engine).

### 6. Impact, public view, evaluator
* `E.impactFor(st, ref, params?)` — ref = an option id | `act:loan` | `act:repay` | `act:payCredit` | `act:save:<₪>` | `focus:<id>`; `params.event` = the already described card (skips a describe). Returns `{ref, label, basis:'certain'|'expected'|'branches', cashBefore/After, fundBefore/After, cushionMonthsBefore/After, fundMonthsAfter, cfBefore/After/Delta, passiveDelta, expensesDelta, netWorthDelta, goalProgressDelta, newLiabilities:[{label,amount,monthly}], power:{before,after,delta,perMonth?}, happiness:{…}, time:{studyMonths?,note?}, mainRisk:{key,text}, assumptions:[…], scenarios:{base,hard}|null, branches:[{p,label,cashAfter,cfAfter,netWorthDelta,buyNet?}]|null, disclaimer}`. Options with an impact are marked `o.major = true`.
* `E.publicView(st, {freeze=true, event?})` — everything a player may see (metrics without `inflationYear`, the event, econ, focus, hintsUsed). `metrics().life.inflationYear` is now what a player can know (last year's figure, or the long-run expectation in year one); `inflationLastYear` added.
* `E.scoreOptions(st, ev)` → `[{id, U, flags, reasons:[{key,text,w}]}]` from the public context only (tested with a Proxy that throws on `rng/pending/decks/bizRng`, and a scramble of every sealed field).
* Evaluator changes (both rules; dq never affects money or verification): one cushion rule, offers = chance × max(0, discounted buy), DD expected value + value of information (inspections join the pool), life events value energy/study/guarantee risk, `values` events (car, health) in a 1.5-month band with no primary, edu course uses the study formula, focus scored by flags. `checkEnd().learning` adds `mentor, hints, byHint, levelChanges, review[≤40]`, `luck.parts.dd/cycle`; `summaryForServer` adds `mentor, rules, hints`.
* Dominated options (rules 4): doodad `inst3` only with credit score ≥ 600 and then `credit` is hidden; side-income reporting costs `world.sideReportFee` a month (w1 120, w2 200, w3/w4 250; label "עלות רו״ח").
* `_dev: {noCycle, noDD}` (sim ablations only; refused in ranked modes).

UI lines that still show the old inflation meaning (owned by the UI agent): `js/ui.js:253, :270, :294` read `metrics().life.inflationYear` — it is now last year's / the expected figure, so the copy "השנה המחירים עולים ב־…" should say "בשנה שעברה" (or use `inflationLastYear`).

## Changes v4 — T3 "סיפורים ועסקים" (stories & business) — engine contract
Spec: `docs/next-level/specs/T3-stories-business.md` (Implementation notes at its end). Everything is **rules 4 only** (a rules-3 game
never draws `story`, never gets a chain, an inbox item or a T3 business — tested against the v3 golden fixture). Save version stays 4:
`v4Defaults` → `ensureStoryState(st)` (idempotent, no randomness, runs at every load). Chain data: `js/systems/chains.js` (`E.CH`).

### 1. Streams, actions, saves
* **Stream 14 `story`**: exactly 2 draws every payday of a rules-4 game (history included) → `st.story.r` (the seals of chain items created
  that payday). **Per-business sealed story stream** `st.bizStory['a<id>']` (seed `mix32(bizSeed ^ 0x51A7E5ED)`): exactly 2 draws per
  simulated month (`BIZ.simulate(…, {cal, story})`, on top of the existing 3). No other stream gets a draw; tile L still pops one card + one `r`.
  Substitutions, variants, the bike doodad and every outcome are pure functions of state (+ the seals).
* **Action `Q`** `['Q', itemId, optionId]` = `resolveStory`. In `replay`, in `verify_core CODES`. A `q:<item>:<choice>` option on the
  business manage card routes to `resolveStory` (logged `Q`, the card stays open).
* New state: `st.story` {chains, inbox (≤ 3), nextId, seen/shown (L-card anti-repeat), memory (≤ 40), flags {noCar, commute, area, payCut,
  planLock, busM}, r, pacing marks}, `st.bizStory`, `st.incomeExtra` [{label, amount, from?, until?}] (in cashflow, not passive),
  `st.stats.storyDefaults`, `st.dq.luck.story`, `st.life.forcedM`. Expense **tags** are derived from labels (`tagOf`: rent / mortgage / car /
  carLoan / transport) unless a story effect stored one — so nothing is written at load and saves round-trip byte-identically.
  A pre-T3 rules-4 save: businesses → `BIZ.upgradeT3` (no `holiday`, T3 event table), an open `L.friend` → the friend chain (same month,
  same outcome), a legacy bus line → `noCar`.

### 2. Chains and the inbox
* Six chains (car, move, career, side, friend, crisis — crisis w1–w4 only). Entry steps of car / moving / friend are the **tile-L card**
  itself (`pending.chain = {id, step}`; `ev.data.chain`, `ev.data.remember`); later steps and the trigger chains (career, side, crisis)
  arrive as **inbox items** at a payday. Pacing: ≤ 1 chain item per payday, ≥ 2 months apart, ≤ 3 open items, ≤ 2 open chains (crisis exempt);
  chain item due = created + 2 paydays, business item due = the next payday (before the next simulated month). An item nobody resolves
  takes its `default` (news "לא החלטת — …", no decision recorded, `stats.storyDefaults++`).
* `E.inbox(st)` → story cards; `E.resolveStory(st, itemId, optionId)` → `{ok, error?, effects, news, lessons, decision, spawn, despawn,
  event (the pending tile card or null), inbox, end}`; `E.scoreStory(st, card)`; `E.storyMoneyFor(st, effects, H)` (= `effects.total24` at 24).
  `publicView().inbox` = the cards. Cards never contain a seal (tested by a scramble of every story seal).
* Story card: `{id:'q12', itemId, type:'story', kind:'chain'|'biz', chain?, step?, assetId?, tag, color, ink, title, text, remember, hint,
  mentor, personal, progress:{n, of}|null, options:[{id, label, enabled, reason?, primary, dq, kind:'story', default, effects:{cash, flow, months,
  salary, salaryMonths, happiness, energy, glow, study, risk, total12, total24, note, monthly (deprecated = −flow), oddsMoney}, odds:{p, text}|null,
  loanAmount, loanMonthly, impact:{now, monthly, months, horizon, total, risk, wellbeing}, preview? (biz)}], data:{cushion:{months, text}, due,
  dueText, defaultId, chain?, biz?}}`. `primary` only at guide: the evaluator's top on financial steps; the director's cheap pick on car /
  transport steps (`option.guide`, cushion-aware); never on personal options.
* C1–C9: tags + `housingOf`; bus → `noCar`, car lines cut 60 % and relabelled תחבורה ציבורית; a `car:true` doodad becomes the bike repair;
  homeowners get `homeRepair` (no effect ever touches a mortgage line); per-card cooldowns / caps + a deterministic rotating substitution
  (`CH.SUBST`, `quiet` = `LIFE_QUIET`, not in the life deck); every life option carries `flow` (signed), `salary`, `salaryMonths`, `total12/24`,
  `dq`; renewal texts use last year's published inflation; evaluator classes personal / mixed / financial (§9).
* End screen: `result.lifeSummary.stories = [{chain, title, path, outcome, cost, steps, open}]` (≤ 6), `storyDefaults`.
* `metrics()` (rules 4) adds `calendar {m, label, season}`, `inbox {open, urgent}`, `story {noCar, area, commute}`; income lines include
  `incomeExtra`; payslip shows "קיצוץ זמני בשכר" / "חצי משרה" while a `payCut` runs.

### 3. Business (js/finance/business.js, `create({t3:true, setup})` in rules-4 games)
* Setups `SETUPS[type]` (offer options `start:lean` / `start` (= std, the old id) / `start:strong`; `ev.data.setups`, `seasonProfile`,
  `eventsText`). `SEASONS` (public calendar, `calOf`: game month 1 = January; history = the real month), shock floor 0.6, general expansion
  (coffee / toyshop / app), B2B receivables on terms (`arTerms`, written off as `badDebt` "חוב אבוד"), decision events (`T3_CHOICES`,
  `eventChoices(b, {cal})`, `resolveEvent(b, key, choice)` atomic; previews = deterministic 3-month forecast deltas), state events (overload,
  buyerOffer, season prep announced leadTime + 1 months ahead), `report.why` {profit, cash, sentence} (Σ profit = Δ net profit; net profit + Σ
  cash = cash change; integers), `report.stage` / `growthStage` (hysteresis 2 up / 3 down), `report.activity`, `summary().{stage, signature,
  l1, l2, l3, seasonProfile, decide}`. `SIDE_GRAD` for the side chain's graduation.
* Engine glue: business news gains `{type, icon, cal, revenueGross, profit, cashDelta, toOwner, why, stage, stagePrev, activity, decide}`
  (`note` = `why.sentence`, deprecated); effects `{type:'bizStage', at, from, to}` and `{type:'bizPulse', at, kind, amount}`.

### 4. CR-29 (ranked rules from the date key)
* `js/systems/rules.js`: `RULES4_FROM`, `dayOf`, `rulesForDay`. `createGame({mode: ranked, dateKey})` → `st.rules = rulesForDay(dateKey)`
  (daily key, weekly key `YYYY-Www`, or the Israel date the challenge was created); `dailyConfig()` returns `dateKey` + `rules`.
  `verify_core.js rulesFor` is a tested duplicate; `index.ts` challenge_day = `created_at AT TIME ZONE 'Asia/Jerusalem'`.

### Review fixes on T2 (2026-11-21, `docs/next-level/reviews/T2-review.md`)
* **B1** `RULES4_FROM = 2026-12-07` (a Monday) in `js/systems/rules.js` and `verify_core.js`; `verifyGame` retries a failed rules-3
  replay once with rules 4 (`result.rulesFallback`, stored in `detail`), never 4 → 3; `createGame({dateKey})` stores `st.dateKey`
  (in `replayConfig`; `migrateV3` gives a dated ranked save `rulesForDay(dateKey)`). The lobby / shell must pass `dateKey`.
* **M1 (accepted)** the cycle phase is never output but IS inferable from public data (bank-loan rate, loan cap, deal price ÷ value,
  asset cashflow) — rates and prices are public signals, as in reality. The evaluator / hints read those public numbers. The gauge stays
  honest (one month late, ±12 noise, correlated). `research` now buys what public data cannot give, for 3 paydays: a sharper gauge,
  the official figure with a 1-month lag instead of 3 (`econ.officialLag`), and `econ.report = {ripe, text}` — has the current phase
  passed its minimum length (a transition may come any month; never the timing).
* **M2** level-1 inspection range widths come from the CLAIMED cashflow / value (`DD.rangeOf({width, valueWidth})`); only the
  position inside the range is sealed.
