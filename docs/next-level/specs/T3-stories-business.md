# T3 · Stories & business: implementation spec

- **Owner sections:** §9 (event chains, NL-08) and §11 (business at the centre, NL-09).
- **Branch:** `feat/rat-race-next-level`. The spec was written against the tree of 2026-11-21. Line numbers can drift; when one has moved, search for the quoted string.
- **Inputs read:**
  - `docs/next-level/research/content.md` (§2 life events, §3 business, §4 chain proposals, §6 accuracy);
  - `docs/next-level/research/gameplay.md` (§5 fairness, §7 designs);
  - `docs/next-level/research/engine-robustness.md` (§3.2 saves, §4 replay and pin);
  - `docs/ENGINE.md`;
  - the code: `js/engine.js`, `js/life.js`, `js/finance/business.js`, `js/worlds/*.js`, `js/rng.js`, `js/ui.js`, `js/game.js`, `tests/lib/random-player.mjs`, `supabase/functions/verify-result/verify_core.js`.
- **Order:** T3 is built **after T2**, by the same engine lane. Everything here sits on top of T2's save version, streams, economic cycle, mentor levels, `ops` focus and `impact` object. §0.2 lists the assumptions about T2. When I finished, T2's spec (`docs/next-level/specs/T2-strategic-depth.md`) did not exist yet, so the implementer must check those assumptions against it.
- **Tags:**
  - **[REQ]** a requirement;
  - **[TUNE]** an initial number that the sim must confirm;
  - **[CODE]** a fact read in the current code.

---

## 0. Summary of decisions

### 0.1 Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | Chain **data** goes in a new pure module, **`js/systems/chains.js`** (Hebrew texts, steps, options, declarative effects, transitions). The **interpreter** goes in `engine.js`, in a new section "stories". `life.js` keeps the 12 standalone cards and gains the new lessons. | `life.js` is already a 230-line data file shared by everything, and chains roughly triple the content. The task board names `js/systems/chains.js` (NL-08). Declarative data can be linted in tests (every `next` step exists, every step can be reached, every option has a Hebrew label). `build-edge.mjs` pins every module that `engine.js` imports, so the server mirror picks the file up automatically. The interpreter needs engine-private helpers (`setGross`, `lifeS`, `ensureCash`, `lesson`), so it cannot live in the data module without a circular import. |
| D2 | **One delivery mechanism for follow-ups: the story inbox** (`st.story.inbox`). Entry steps that already have a card (car, moving, friend) stay on tile **L**. Every later step, and every state-triggered chain (career, side hustle, crisis), arrives as an inbox item at a payday. The player resolves it at any time with `resolveStory(st, itemId, optionId)`, logged as **`['Q', itemId, optionId]`**. An item nobody resolves applies its declared default at its `due` payday. | A tile-L landing happens about **0.1 times a month** (content.md R3: 6.7 life events in 63 months). Chains that run only on L would advance about once every 10 months, and the brief needs real multi-step stories. Business decisions need the same channel. Defaults keep old policies, the sims and the random player working with no change. |
| D3 | **No extra draws on any existing stream.** Tile L still draws exactly one deck card plus one `r` from `life`. Every substitution and chain override is a pure function of state. New randomness comes from (a) a new appended stream **`story`**, with **exactly 2 draws every payday**, and (b) one new sealed stream per business, `st.bizStory['a'+id]`, with **exactly 2 draws per simulated month**. | This is the rule in gameplay §5. Popping extra deck cards could trigger a reshuffle of the `life` stream, which would shift every later payday draw. |
| D4 | Business depth goes **inside `js/finance/business.js`**: seasons, setups, a general expansion, B2B receivables, decision events, `why`, growth stage. The engine only adds glue (inbox items, a calendar, news). | The owner says "NO parallel engine". `business.js` is already pure, deterministic and integer-exact. |
| D5 | Life and chain options get a **signed `flow`** (positive = more money for you each month) and a rendered **`salary`**. `monthly` (positive = cost) stays for one release, marked deprecated. | This fixes the sign bug at `ui.js:606-616` and the "salary change not shown" bug at the root, so every card uses one convention. |
| D6 | Every option carries **`dq: 'personal' \| 'mixed' \| 'financial'`**. The evaluator scores each class differently (§9). | "Don't score family/values decisions as if there were one right financial answer." |
| D7 | Saves: T3 adds fields with defaults through an idempotent `ensureStoryState(st)`. If T2 and T3 ship **in the same release**, call it from T2's `migrateV3` and keep `SAVE_VERSION = 4`. If T2 ships first, bump to **5** and add `migrateV4` (= `ensureStoryState`). | Either way an old save loads. Nothing in the migration draws randomness. |

### 0.2 Assumptions about T2 (verify against `docs/next-level/specs/T2-strategic-depth.md`)

| T2 item (from the caller's brief and gameplay §7) | What T3 assumes | If T2 differs |
|---|---|---|
| `SAVE_VERSION 4` plus `migrateV3` | exists; T3 hooks `ensureStoryState` into it (D7) | add `migrateV4` instead |
| New streams `'dd'`, `'cycle'` appended to `STREAMS` | T3 appends `'story'` **after** them, so the stream index is 12 | append after whatever T2 adds last; never insert |
| `st.econ.phase` ∈ expansion/slowdown/recession/recovery (true phase, hidden) and a public, lagged signal | T3 reads **only the public signal**, through a helper `econSignal(st)` → `'expansion'\|'slowdown'\|'recession'\|'recovery'\|null` (null when there is no cycle, e.g. history) | map `econSignal` to T2's public field (likely `metrics().worldIndicators.econ.signal`). **Never read the true phase.** |
| Recession hits businesses via `BIZ.applyShock` (demand 0.85) | kept; T3 caps the stacked demand shock (§6.4) | apply the cap wherever T2 applies its multiplier |
| Monthly focus `ops`: business panel in any month | T3's business inbox items are listed on that panel (and on the K tile) | none |
| Mentor levels `guide/hint/pro` (`st.mentorLevel`) | story options get `primary` only at `guide`, and only on `financial` steps | follow T2's `describe()` primary rule |
| Structured `impact` object on major decisions | T3 fills it for every story option (§10.1) | rename fields to T2's schema; keep the values |
| New action codes `'F'` (focus), `'H'` (hint); NL-12 rivals may use `'B'` | T3 uses **`'Q'`** | choose another free letter and update `replay()` and `verify_core.js CODES` |
| Evaluator fixes (energy and study valued, cushion threshold) | T3's §9 relies on them; if T2 did not ship them, T3 ships the life-branch part | — |

---

## 1. Contradictions to fix (all [REQ])

| ID | Contradiction (evidence) | Fix | Test |
|---|---|---|---|
| C1 | **Bus vs car repair.** Choosing "bus" sets no flag, so the "תיקון לרכב" doodad (`w1.js:106`, also in `h`) still appears. `carLine()` (`engine.js:1370`) keeps finding the reduced line, because it is still labelled "רכב". [CODE] | (a) Expense lines get a **tag** at `createGame` (and in the migration), assigned once by regex: `rent` (/שכירות/), `mortgage` (/משכנתא/), `car` (/רכב\|ליסינג\|טנדר/ but not /הלוואת רכב/), `carLoan` (/הלוואת רכב/), otherwise `null`. Code reads tags, never labels. (b) "bus" sets `st.story.flags.noCar = true`, cuts **every** `car`-tagged line by `carCut`, and relabels and retags it `תחבורה ציבורית` / `transport`. (c) Doodad cards get `car: true` in data (`w1.js` "תיקון לרכב"; `h` inherits it). In `landing()`, a `car:true` doodad drawn while `noCar` is replaced **without a draw** by `NO_CAR_DOODAD = {n:'תיקון לאופניים וכרטיס רב־קו', a: 400, need: true, d: 'בלי רכב — אבל גם לאופניים יש פנצ׳רים.'}` (amount × the world's salary scale, see §3.6). (d) While `noCar`, a drawn `car` life card becomes the `carBack` entry (§5.1) or is substituted (§3.5). | U1, S2 |
| C2 | **Homeowner rent raise.** `rentLine()` matches /שכירות\|משכנתא/ (`engine.js:1371`), so a homeowner sees "בעל הבית רוצה להעלות שכירות" and "stay" raises the **mortgage**. [CODE] | Replace `rentLine` with `housingOf(st)` → `{line, kind:'rent'\|'mortgage'\|null}` (by tag). The `moving` card for `mortgage` (or `null`) becomes the homeowner variant `homeRepair` (§5.2). **No life or chain effect ever changes a `mortgage` line.** | U2, S3 |
| C3 | **Repeated events.** 33 of 60 w2 games repeat an event. `vacation` is drawn 1.6× as often because it is `wedding`'s `alt`. Long free games cycle through the same 12 cards. [OBSERVED in content.md R3] | Per-card cooldowns and caps, chain blocking, and a deterministic substitution list (§3.5). The `alt` field is dropped. | S1 |
| C4 | **Friend loan overwrite.** A second friend card within 6 months overwrites `L.friend` (`engine.js:2160-2161`). The first loan vanishes with no news and no repayment. [CODE] | Friend becomes chain 5. While it is open, the `friend` card is substituted. `L.friend` migrates into `st.story.chains.friend` (§8). | U3, S4 |
| C5 | **Sign of money on life cards.** `effectChips` renders `e.monthly` with `sgn/cls`, but on life effects a positive `monthly` is a **cost**. Result: the baby's "+₪900 בחודש" shows in green and the bus saving shows in red. [CODE `ui.js:606-616`, `engine.js:1375`] | The engine emits `effects.flow` = signed change to *your* monthly cashflow (cost → negative). `ui.effectChips` renders `flow`, never `monthly`, for `kind:'life'\|'story'`. `monthly` is kept and equals `−flow`, for one release (deprecated in ENGINE.md). | U4, UI-1 |
| C6 | **Salary change not shown.** `effectChips` ignores `e.salary`. jobOffer "take" (+₪1,744 net) and layoff (−₪3,600 × 2) show no money chip. [CODE] | `effectChips` renders `salary` as "משכורת נטו ±₪X בחודש" (with "× N" when `salaryMonths` > 0), coloured by sign. The engine always sets `salaryMonths` (0 = permanent). | U4, UI-1 |
| C7 (also found) | `lifeEffects` and texts would read next year's pre-drawn inflation `L.inflationYear` (a **sealed future value**) if a renewal text used "inflation". | Renewal texts and amounts use **last year's** published inflation (`L.infl[L.infl.length-1]`, or the world default of 3 before the first year). Test: no chain text or amount reads `inflationYear`. | U12 |
| C8 (also found) | `course` is drawn even when `study.done`, where it does nothing. `layoff` can be drawn while jobless. `jobOffer` can be drawn while jobless. | Eligibility in §3.5. | S1 |
| C9 (also found) | Scoring contradictions: `health` private scores 0 for the teacher; `course` "take" scores 0 while it is the mentor's primary; car "bus" always 100. | Evaluator rules (§9). | U9 |

---

## 2. What the player experiences (design intent)

- **Life:** a car, a home, a career, a side hustle, a friend and the economy each tell a story over 2–4 steps. A card says "זוכר?…" and quotes what you chose and what it has cost so far. Outcomes are drawn from odds that are **shown** on the card, labelled "במשחק". Values decisions (friends, family, where to live, a promotion) have no right-answer button and no money verdict.
- **Business:** each of the five businesses feels different:
  - toy import: stock and lead times, holiday peaks;
  - pizza: royalties and the Passover dip;
  - coffee: station commuters, and holidays are bad;
  - laundromat: machines and winter;
  - app: churn and runway.

  About every 2–4 months the business asks for a real decision (an event with choices). Every month the toast says three numbers (**מחזור · רווח · קופה**) and **one** sentence on why they changed. Details open on demand.

---

## 3. Story system: architecture

### 3.1 State (plain JSON, all integers or short strings)

```js
st.story = {
  chains: {                     // one record per chain id; missing = never started
    car:    { stage, run, path, startM, nextAt, nextStep, endM, seal:{entry, a, b}, data:{}, hist:[] },
    move: {...}, career: {...}, side: {...}, friend: {...}, crisis: {...},
  },
  // stage: 'idle' | <stepId> (waiting for nextAt or for the player) | 'done' (cooldown until endM + cooldown)
  // run: how many times this chain has started this game; path: chosen branch ('fix'|'lease'|'bus'|…)
  // seal: sealed uniform values used by this run (entry = the L card's r; a/b = the payday's story draws at item creation)
  // data: per-chain numbers (paid, spent, rent0, amount, idxAtStart, …); hist: [{m, step, o, v}] (≤ 8)
  inbox: [ { id, kind:'chain'|'biz', chain?, step?, assetId?, ev?, createdM, due, seal:{a,b}, data:{} } ],   // ≤ 3 open
  nextId: 1,
  seen: { <lifeCardId>: lastMonthShown },          // anti-repeat for standalone L cards
  memory: [ { m, chain, step, o, v, t } ],          // ≤ 40, newest last; t = short Hebrew fact for "זוכר?" lines and the end screen
  flags: { noCar:false, commute:0, area:'center', payCut:null /* {mult, until} */, carShare:false },
  r: [0.5, 0.5],                                    // this payday's two story draws (sealed when drawn)
  lastChainItemM: -99, lastBizItemM: -99,
  energyLow: 0,                                     // consecutive paydays with energy < 35 (career trigger)
};
st.bizStory = { 'a7': <uint32> };                   // per-business sealed story stream (D3)
st.expenses[i].tag  // 'rent'|'mortgage'|'car'|'carLoan'|'transport'|null (C1)
st.dq.luck.story    // ₪ realised − expected for sealed story outcomes (new luck part)
```

`st.life.friend` is removed (migrated, §8). `st.life.events` is still appended for every L card **and** every resolved story step, so `lifeSummary.lifeEvents` stays meaningful.

### 3.2 Payday order (inside `payday()`, decision-independent)

1. Existing pre-draws (4 `life`), T2's draws (`cycle` etc.), **then `storyDraw(st)`**: exactly 2 values from `story` → `st.story.r`. They are always drawn, also in history mode and with no chain active.
2. `monthlyBusiness` (existing). For each business, `BIZ.simulate(..., {cal, story: () => next(st.bizStory[key])})` makes **exactly 2** story draws on top of its existing 3. The report may carry `report.decide` (≤ 1 per business per month, §6.6).
3. `monthlyLife`, `monthlyIndex`, `monthlyWorld` (existing).
4. **`storyMonth(st, out)`** (new), before `ensureCash`:
   1. **Expire:** every inbox item with `due ≤ st.month` gets its `default` option applied. News: `{kind:'story', text:'לא החלטת — {defaultLabel}. {consequence}'}`. Decision quality is **not** recorded for defaults; the end-screen count `st.stats.storyDefaults` goes up by one.
   2. **Scheduled steps:** for chains with `nextAt ≤ st.month` and a `nextStep`, create the item if pacing allows (§3.4). Otherwise `nextAt += 1`.
   3. **Triggers:** career (warn / promo / degree), side (milestones), crisis (§5.3, §5.4, §5.6). Create at most one item if pacing allows.
   4. **Business decisions:** candidates from step 2 become `kind:'biz'` items if pacing allows. Otherwise the event's `default` is applied at once and reported as news (no decision is lost silently).
   5. `out.story = { created:[itemIds], expired:[itemIds] }` for the UI.
5. `ensureCash` and the rest (existing).

### 3.3 Resolving

```js
export function inbox(st)                              // → [storyEvent] (described now, fresh numbers; §10.1)
export function resolveStory(st, itemId, optionId)     // → {ok, error?, effects, mentor, toast, news, lessons, decision, spawn, despawn, event (pending card or null), end?}
// logs ['Q', itemId, optionId] only on success; replay(): case 'Q': r = resolveStory(st, a[1], a[2]);
```

- Allowed whenever `!st.over`, also while a tile card is pending (like `takeLoan`). It ends the game only through `endIfIdle`.
- A disabled option returns `{ok:false, error, event}` and changes nothing.
- An unknown or stale `itemId` returns `{ok:false, error:'stale'}`. A replay of that throws `replay_mismatch`.
- `verify_core.js CODES` gains `'Q'`. Arguments: a number (≤ 1e6) and a string (≤ 40 characters). Re-pin `tools/build-edge.mjs`.

### 3.4 Pacing (anti-fatigue) [TUNE]

| Rule | Value |
|---|---|
| New chain items per payday | ≤ 1 |
| Minimum gap between two chain items | 2 months (L-tile entries do not count) |
| New business items per payday (all businesses) | ≤ 1 |
| Minimum gap between business items of **the same** business | 2 months |
| Open items at once | ≤ 3. Extra business candidates fall back to news plus the default. Extra chain steps slide by +1 month. |
| Chain item `due` | `createdM + 2` (two paydays to decide) |
| Business item `due` | `createdM + 1` (before the next simulated month) |
| Open chains at once | ≤ 2. A third chain does not start: its entry card is substituted, or its trigger waits. Crisis is exempt, because the world forces it. |
| Target per 12 months (sim) | chain items median 2–3, p90 ≤ 5; business items median 2–4 for a player who owns a business, p90 ≤ 6 |

### 3.5 Anti-repeat for tile L

`createLife` keeps its exact draws (one deck pop and one `r`). It then calls `resolveLifeCard(st, card, r)` (pure, no RNG):

1. If the card is a **chain entry** (`car`, `moving`, `friend`), let the chain decide: start it (step 1 on this card), use a variant (`carBack`, `homeRepair`), or **block** it (chain open, cooldown, `maxRuns`, or 2 chains already open). Blocked → step 3.
2. If the card is standalone, check `ELIG` and `COOLDOWN` (table below). Failing → step 3.
3. **Substitute:** the first card in `SUBST = ['vacation','health','course','parent','reserve','quiet']` that passes its own eligibility and cooldown and differs from the original. `quiet` always passes.
4. Write `st.story.seen[id] = st.month` for the card actually shown.

| Card | Eligibility | Cooldown (months) | Cap per game |
|---|---|---|---|
| wedding | partner ≠ married | — | 1 |
| baby | kids < 3, partner ≠ none | 18 | — |
| parent | no active "עזרה להורים" line | 18 | — |
| reserve | not jobless | 12 | — |
| jobOffer | not jobless; crisis chain not at `job` | 18 | 2 |
| layoff | not jobless; crisis chain not at `job`; ≥ 6 months since the last job change | 24 | 1 |
| health | — | 12 | — |
| vacation | — | 8 | — |
| course | `!study.done` | 12 | — |
| **quiet** (new) | always | — | — |
| car, moving, friend | handled by chains 1, 2, 5 | chain cooldown | chain `maxRuns` |

New standalone card, in `life.js`:

```js
{ id: 'quiet', personal: true, title: 'חודש בלי הפתעות', text: 'אין דרמות החודש. מה עושים עם השקט?',
  options: [
    { id: 'treat', label: 'ערב בחוץ עם החברים', cash: -0.05, happiness: 2, note: 'קטן, משמח, נגמר.' },
    { id: 'rest',  label: 'ערב על הספה',       energy: 4,   note: 'גם זה מטעין.' },
  ] }
```

### 3.6 Amount scale

Story amounts use `S = lifeS(st)` (base net salary, at least ₪3,000), exactly as life cards do today. Business amounts come from `business.js` (₪, CPI-indexed). Doodad replacement (C1): `a = r100(400 × S / 9000)`, minimum ₪300.

### 3.7 Memory ("the world remembers")

- Every resolved step pushes `{m, chain, step, o, v, t}`:
  - `v` = ₪ impact over 24 months, same formula as `decisionValue`;
  - `t` = a short fact, e.g. `'תיקנת את הרכב ב־₪3,600'`.
- Chain records keep their own numbers in `data` (e.g. `car.data.paid`, `car.data.spent`, `friend.data.amount`, `move.data.rent0`).
- **"זוכר?" line:** every follow-up step has a `remember` template that is filled from `data`. Cross-chain lines (table below) are added when relevant.

| When | Line |
|---|---|
| car step while `area === 'periphery'` | `זוכר? עברת לפריפריה — ובלי רכב הדרך לעבודה ארוכה.` |
| career promo after crisis `job:accept` | `ההנהלה לא שכחה שהסכמת לקיצוץ בזמן המיתון.` |
| friend run 2 | `זוכר מה קרה עם יוסי? הפעם זו מיכל.` |
| move renewal after a `stay` at entry | `בפעם הקודמת נשארת וקיבלת העלאה קטנה.` |
| any story step after a forced loan in the last 3 months | `שים לב: לפני {n} חודשים הבנק כבר נתן לך הלוואה כפויה.` |

- Named characters, fixed so they read consistently: friend **יוסי** (run 1) and **מיכל** (run 2), manager **רונית**, garage **המוסך של אבי**. No personal data, no player name.
- **Gender:** every text goes through `gz()`. Add to `GZ` (`engine.js:630`): `['זוכר','זוכרת']`, `['תחליט','תחליטי']`, `['תעבור','תעברי']`, `['תשקיע','תשקיעי']`, `['תעזוב','תעזבי']`.
- **End screen:** `result.lifeSummary.stories = [{chain, title, path, outcome, cost}]` (≤ 6), built from `chains[*]` and `memory`.

---

## 4. Data format: `js/systems/chains.js`

### 4.1 Shape

```js
// Pure data. No imports from engine.js. Texts are templates with {vars} filled by engine storyVars().
export const CHAINS = {
  car: {
    id: 'car', title: 'רכב ותחבורה', worlds: ['w1','w2','w3','w4','h'], cooldown: 24, maxRuns: 2,
    entry: { card: 'car', variants: { noCar: 'carBack' } },          // L-card entry; or { trigger: 'warn' } etc.
    lessons: ['car_cost', 'total_cost'],
    steps: {
      s1: { title: 'הרכב התקלקל', text: 'אבי מהמוסך: תיבת הילוכים, {fix}. אפשר לתקן, לעבור לליסינג — או לוותר על רכב.',
            hint: 'במשחק: ברכב בגיל הזה יש סיכוי של 1 מתוך 2 לעוד תקלה גדולה בשנה הקרובה.',
            onCard: true,                                          // shown as the L card itself
            options: [
              { id: 'fix', label: 'לתקן', dq: 'mixed', fx: { cash: -0.4 }, path: 'fix',
                odds: { p: 0.5, use: 'entry', text: 'במשחק: 1 מתוך 2 — עוד תקלה בשנה הקרובה' },
                next: [{ step: 's2fix', in: 8, if: 'win' }, { end: true, in: 12, if: 'lose', news: 'carOk' }],
                memo: 'תיקנת את הרכב ב־{paidNow}' },
              { id: 'new', label: 'רכב חדש בליסינג', dq: 'mixed', fx: { cash: -0.3, line: { amt: 0.12, months: 36, label: 'ליסינג רכב חדש', tag: 'car' }, glow: 6 }, path: 'lease',
                next: [{ step: 's2lease', in: 12 }] },
              { id: 'bus', label: 'אוטובוס ואופניים', dq: 'mixed', fx: { energy: -6, happiness: -3, carCut: 0.6, set: { noCar: true, commute: -1 } }, path: 'bus',
                next: [{ step: 's2bus', in: 4 }] },
            ] },
      // … (see §5.1)
    },
  },
  // move, career, side, friend, crisis …
};
export const CHAIN_IDS = Object.keys(CHAINS);
```

### 4.2 Effect vocabulary (`fx`), interpreted by `applyStoryFx(st, fx, ctx, out)`

All money is a multiple of `S` unless the key ends in `Abs` (absolute ₪, used for computed values).

| Key | Meaning |
|---|---|
| `cash` | one-off cash × S (negative = pay). `ensureCash` runs after a negative amount, exactly as `applyLife` does. |
| `cashAbs` | one-off cash in ₪ (e.g. `{repaid}`) |
| `line` | `{amt, months, label, tag}`: new expense line, amt × S per month; `months` 0 = permanent; `until` = month + months − 1. A negative `amt` is an **income** line (e.g. a friend's repayment plan), added as `st.incomeExtra` (§4.4). |
| `rentPct` | change the `rent`-tagged line by ±%. It is a no-op on a mortgage (C2). |
| `carCut` | cut every `car`-tagged line by this fraction; retag it `transport` and relabel it `תחבורה ציבורית` |
| `carLinePct` | change `car`-tagged lines by ±% |
| `happiness`, `energy`, `glow` | as in `applyLife` |
| `grossMult` | permanent gross × mult (`setGross`) |
| `grossTemp` | `{mult, months}` → `st.story.flags.payCut = {mult, until}`. Applied **inside `payslipOf`** next to the plan's `grossMult`. It never changes `L.gross`, so there is no rounding drift. |
| `workLoad` | ± `L.workLoad` (minimum 0) |
| `plan` | set the plan (`applyPlan`), e.g. `'rest'` |
| `planLock` | `{plan, months}`: the plan is re-applied at each of the next N paydays, unless the player changes it with `setPlan` (that is allowed and simply ends the lock) |
| `jobless` | months on the benefit (existing mechanic) |
| `sideReport` | `true` → `setSideReport` semantics, without logging a `'T'` action (it is part of the `'Q'` action) |
| `study` | + study months (existing) |
| `autoInvest` | `'pause'` (remember the amount in `chains.crisis.data.auto`), `'resume'`, `'x1.5'` |
| `sellIdx` | sell all IDX at the current price through the existing `invest` path, with tax (no action logged) |
| `loanAbs` | add a bank loan of ₪ (forced-style, but no credit hit: an agreed settlement) |
| `asset` | `{kind:'stake', name, cfAbs, valueAbs}` via `addAsset` (`k:'stake'`, §5.5) |
| `set` | merge into `st.story.flags` |
| `bizSpawn` | `{typeId, setup}`: side-hustle graduation through `addBusiness` with `SIDE_GRAD` overrides (§5.4) |

Option-level keys:

- `odds: {p, use:'entry'|'a'|'b', text, win:{fx}, lose:{fx}}`. The outcome is `seal[use] < p` → win. `text` is shown **before** the decision.
- `next: [{step|end, in, if?, news?}]`.
- `path`, `memo`, `when` (eligibility predicate id), `dq`, `lesson: [ids]`, `default: true` (exactly one per inbox step).

### 4.3 Template variables (`storyVars(st, chainId)`)

`S`, `fix`, `paid`, `paidNow`, `spent`, `ago`, `saved`, `lease`, `rent`, `raise`, `raisePct`, `share` (rent ÷ net, %), `inflLast`, `energy`, `pBurn`, `cushion` (months, 1 decimal), `due12` (side-tax estimate), `first`, `avg`, `amount`, `extra`, `risk`, `dd` (drawdown %), `idxValue`, `units`, `diff`, `name` (friend), plus option-specific amounts.

- Every ₪ value is formatted with `fmtM`.
- **Every variable is derived from public state** (never from `seal`, `st.decks`, `inflationYear` or future draws). Test U12 greps the template keys against an allow-list.

### 4.4 Small engine additions the vocabulary needs

- `st.incomeExtra = [{id, label, amount, until}]`: temporary non-salary income (repayment plan, stake payout before it is an asset). It appears in `metrics().incomeLines`. It is **not passive** for the goal, except a `stake` asset, which is a real asset.
- `payslipOf`: `gross = r10(g0 × P.grossMult × (payCut active ? payCut.mult : 1))`, plus a payslip line "קיצוץ זמני בשכר".
- `monthlyLife`: `L.energy += st.story.flags.commute` on work/overtime months (the bus commute, −1 a month), and it expires `payCut`.

---

## 5. The six chains

Notation: S = base net salary; E = monthly expenses. "(inbox)" = delivered as an inbox item; "(L)" = shown as the tile-L card. Every option shows chips (now / flow × months / 😊 / 🔋 / risk), the **12- and 24-month totals** (§9.2) and "יש לך X חודשי כרית". Odds always read "במשחק: …".

### 5.1 Chain `car`: car, repairs and transport

- **Worlds:** all (w1–w4, h). **Cooldown** 24 months after the end. **maxRuns** 2.
- **Eligibility:**
  - normal entry `s1`: at least one `car`-tagged line and `!noCar`;
  - variant `carBack`: `noCar` and at least 24 months since the bus choice.
  - Otherwise the card is substituted.

```
idle ─(L 'car')→ s1 ─fix─(r<.5: +8)→ s2fix → end
                    └fix─(r≥.5: +12, news "carOk")→ end
                  ─new→ (+12) s2lease → [lease months left] → s3leaseEnd (at lease end, if game still running) → end
                  ─bus→ (+4) s2bus → end           (noCar stays; carBack possible after cooldown)
idle ─(L 'car' while noCar & ≥24m)→ carBack → end
```

| Step | Text (Hebrew) | Options → effects | dq |
|---|---|---|---|
| **s1** (L) | **הרכב התקלקל** · אבי מהמוסך: תיבת הילוכים, {fix}. אפשר לתקן, לעבור לליסינג — או לוותר על רכב. · *hint:* במשחק: ברכב בגיל הזה יש סיכוי של 1 מתוך 2 לעוד תקלה גדולה בשנה הקרובה. | **fix** "לתקן": −0.4S; odds 0.5 (`entry`) → s2fix in 8 months / else the chain ends in 12 months with news "carOk". **new** "רכב חדש בליסינג": −0.3S, line −0.12S × 36 "ליסינג רכב חדש" (tag car), ✨6. **bus** "אוטובוס ואופניים": car lines −60% for good, 🔋−6, 😊−3, `noCar`, commute −1 🔋 per work month | mixed |
| **s2fix** (inbox) | **שוב במוסך** · *remember:* זוכר? לפני {ago} חודשים תיקנת ב־{paid}. · עכשיו בלמים ומצמד: עוד {fix2}. בסך הכול הרכב עלה לך {spent} מתחילת השנה. | **fixAgain** "לתקן שוב": −0.25S (default). **swap** "למכור ולקנות יד שנייה צעירה יותר": −0.3S net (sale +0.6S, purchase −0.9S), car lines −20%. **drop** "למכור ולוותר על רכב": +0.4S, as `bus` (noCar, commute) | financial |
| **s2lease** (inbox) | **הליסינג התייקר** · *remember:* לפני שנה לקחת ליסינג ב־{lease} בחודש. · חברת הליסינג מעדכנת: הביטוח והטיפולים עלו, עוד {extra} בחודש. | **keep** "להמשיך כרגיל": lease line +0.02S (default). **exit** "לצאת מהחוזה מוקדם": −3 × lease payment now, lease line removed, car line unchanged (back to the old car). **downsize** "להחליף לרכב קטן יותר": −0.5 × lease payment fee, lease line −30% | financial |
| **s3leaseEnd** (inbox, only if lease end ≤ maxMonths) | **הליסינג נגמר** · שלוש שנים עברו. מה עכשיו? | **return** "להחזיר ולקנות יד שנייה": −1.2S, line removed, car line +10%. **buyout** "לקנות את הרכב במחיר הסופי": −1S, line removed. **noCar** "להחזיר ולהסתדר בלי רכב": as `bus`. Default: `return` | mixed |
| **s2bus** (inbox) | **הבקרים ארוכים** · *remember:* כבר {ago} חודשים בלי רכב — חסכת {saved}. · אבל כל בוקר מתחיל ב־40 דקות באוטובוס. | **ebike** "אופניים חשמליים": −0.25S, 🔋+4 now, commute → 0. **share** "מנוי לשיתוף רכבים": line −0.04S/month "שיתוף רכב" (tag transport), commute → 0, 😊+2. **stay** "ככה זה טוב לי": nothing (default) | mixed |
| **carBack** (L) | **לחזור לרכב?** · *remember:* לפני {ago} חודשים ויתרת על הרכב וחסכת מאז {saved}. · עבודה חדשה, הצעה לרכב יד שנייה במצב טוב. | **buy** "לקנות יד שנייה": −1.5S, line −0.1S/month "רכב" (tag car), `noCar=false`, commute → 0. **no** "ממשיכים בלי": 😊+1 | mixed |

- **Lessons:** `car_cost` (s1), **`total_cost`** (new; s2fix or s2lease), `emergency_fund` (when a step needed a forced loan).
- **Save:** `chains.car {stage, path, startM, nextAt, nextStep, seal.entry, data:{paid, spent, lease, savedFrom}}`; `flags.noCar`, `flags.commute`; expense tags.
- **Anti-repeat:** the `car` card is blocked while the chain is open. The C1 doodad swap applies. maxRuns is 2: `s1` plus one `carBack`, or two `s1` with 24 months between.

### 5.2 Chain `move`: home and cost of living

- **Worlds:** all. Cooldown 24. maxRuns 2.
- **Eligibility:** `housingOf(st).kind === 'rent'` → renter path; `'mortgage'` or `null` → owner path (`homeRepair`).

```
renter: idle ─(L 'moving')→ m1 ─bigger|stay|smaller→ (renewal) m2renew → end
                              └periphery→ (+3) m3commute → (renewal) m2renew → end
owner:  idle ─(L 'moving')→ homeRepair ─object & lose (+6)→ h2 → end ; otherwise → end
```

"Renewal" = the month **before** the next yearly price update: `nextAt = next m with (m−1)%12 === 0`, minus 1.

| Step | Text | Options → effects | dq |
|---|---|---|---|
| **m1** (L) | **החוזה נגמר** · בעל הבית רוצה {raise} יותר בחודש. השכירות היום {rent} — {share}% מהנטו שלך. | **bigger** "דירה גדולה ומרווחת": −0.3S, rent +0.1S per month, 😊+5. **stay** "נשארים ומקבלים העלאה קטנה": rent +0.03S. **smaller** "דירה קטנה וזולה": −0.2S, rent −0.08S, 😊−4. **periphery** "לעבור לפריפריה": −0.25S (move), rent −25%, `area='periphery'`, → m3commute in 3 | personal |
| **m2renew** (inbox) | **חידוש חוזה** · *remember:* {rememberMove}. · בעל הבית מבקש {raisePct}% יותר (אינפלציה בשנה שעברה: {inflLast}%) — עוד {raise} בחודש. השכירות כבר {share}% מהנטו. · *hint:* כלל אצבע, לא חוק: דיור עד בערך שליש מהנטו. | **negotiate** "להתמקח": odds 0.55 (`a`): win → +half the raise; lose → full raise, 😊−2. Text: "במשחק: בערך 1 מכל 2 בעלי בית מסכימים לחצי". **accept** "לקבל את ההעלאה": full raise (default). **roommates** "לעבור עם שותפים" (`when: single` = partner none, kids 0): −0.1S, rent −35%, 😊−4. **smaller** "לעבור לקטנה יותר": −0.2S, rent −10% of the current rent, 😊−3 | mixed (negotiate/accept), personal (roommates/smaller) — per option |
| **m3commute** (inbox) | **הדרך לעבודה** · *remember:* לפני 3 חודשים עברת לפריפריה וחסכת {saved} בשכירות. · עכשיו שעה וחצי לכל כיוון. | **train** "רכבת": line −0.03S/month "רכבת" (transport), commute −2 (default). **car** "לנסוע ברכב": if `noCar` → −1.2S used car, line −0.1S tag car, `noCar=false`; else car lines +15%. **hybrid** "יומיים בשבוע מהבית": gross −5% (`grossMult 0.95`), commute −1. Note on hybrid: "במשחק המעסיק מסכים; במציאות זה תלוי בו." | personal |
| **homeRepair** (L, owners) | **ועד הבית: שיפוץ הבניין** · הבניין בן 40. האסיפה רוצה לשפץ חזית ומעלית. החלק שלך: {share}. | **pay** "לשלם עכשיו": −0.8S. **spread** "בתשלומים לוועד": line −0.08S × 12 "תשלומי ועד בית" (total 0.96S). **object** "להתנגד באסיפה": odds 0.3 (`entry`): win → plan shelved, news; lose → h2 in 6 months. Text: "במשחק: בערך 7 מכל 10 פעמים הרוב מחליט לשפץ בכל זאת" | mixed |
| **h2** (inbox) | **השיפוץ יוצא לדרך** · *remember:* התנגדת באסיפה — אבל הרוב החליט. · החלק שלך עלה בינתיים ל־{share2}. | **pay** −0.9S. **spread** line −0.09S × 12 (default) | financial |

- **Lessons:** `inflation`, `negotiation`, `lifestyle_creep`, **`housing_share`** (new).
- **Save:** `chains.move {…, data:{rent0, raise, kind}}`; `flags.area`.
- **Fix C2:** no option touches a `mortgage` line. The `stay`/`bigger`/`smaller` effects apply only to a `rent`-tagged line. If none exists, the owner path is used.

### 5.3 Chain `career`: studies, career and burnout

- **Worlds:** all.
- **Sub-paths** `warn`, `promo`, `degree`: each at most once per game. One career item open at a time. 18-month cooldown between sub-paths.
- **Not eligible:** jobless, burnout this month, `history` scenarios shorter than 24 months.
- **Triggers** (checked in `storyMonth`, in this order):

| Sub-path | Trigger (public state only) |
|---|---|
| warn | `st.story.energyLow ≥ 2` (energy < 35 at 2 paydays in a row) |
| degree | `study.done` and `month − study.doneMonth ≥ 1` |
| promo | `month ≥ 12`, `planMonths.work + planMonths.overtime ≥ 10`, no raise in the last 10 months; or `workLoad > 0` for ≥ 6 months (after jobOffer "take") |

| Step | Text | Options → effects | dq |
|---|---|---|---|
| **warn** | **אות אזהרה** · {months} חודשים בלי הפסקה. הכוח שלך {energy}/100. · *hint:* במשחק: הסיכוי להישחק בחודש הבא — {pBurn}% (שחיקה = חודש בלי משכורת והוצאות רפואיות). | **pushOn** "להמשיך כרגיל" (default): nothing. If `pBurn ≥ 25` the evaluator flags `burnout`. **week** "שבוע חופש": −0.3S, 🔋+12, 😊+2. **rest2** "חודשיים של מנוחה ומשפחה": `planLock {rest, 2}` (−15% gross per month, +18 🔋 per month) | mixed |
| **promo** | **הצעה לקידום** · רונית, המנהלת, מציעה לך לנהל צוות: +15% ברוטו — וגם יותר שעות, ישיבות וטלפונים בערב. | **accept** "לקבל": grossMult 1.15, workLoad +1 (salary chip shows the net change). **four** "לבקש 4 ימים בשבוע במקום": grossMult 0.9, workLoad −1 (min 0), 😊+3, 🔋+6. **stay** "להישאר בתפקיד" (default): 😊+1. After `accept`: news at +6 months, no decision: "חצי שנה בתפקיד: הנטו עלה ב־{netUp}, הכוח בממוצע {energyAvg}." | personal |
| **degree** | **עם התואר ביד** · סיימת ללמוד. אפשר לחפש עבודה שמשלמת על התואר — או לבקש העלאה כאן. | **interview** "לחפש עבודה חדשה": jobless 1 month; odds 0.6 (`a`): win → grossMult 1.18 when the job starts; lose → grossMult 1.05. Text: "במשחק: 6 מכל 10 מוצאים משרה טובה יותר תוך חודש". **askHere** "לבקש העלאה כאן": odds = `raiseChance(st)` (shown): win → grossMult 1.08; lose → 😊−3. **stay** "להישאר בינתיים" (default) | financial |

- **End:** a sub-path ends after its step resolves. `warn` also ends early if energy > 60 at 2 paydays, or if a burnout happens (news: "הגוף עצר בשבילך. בפעם הבאה אפשר לעצור קודם." — no blame).
- **Lessons:** `burnout`, `rest_value`, `time_scarce`, `human_capital`, `ask_raise`, `job_offer`.
- **Save:** `chains.career {stage, sub:{warn, promo, degree}: month|null, data:{energyAtWarn}}`; `st.story.energyLow`.

### 5.4 Chain `side`: a side hustle becomes a business

- **Worlds:** all.
- **Eligibility:** plan `side`. Steps 1–4 at most once per game.
- **Close:** 3 consecutive paydays off the side plan close the chain (news "העסק הצדדי נרדם"). If the player resumes the side plan, the chain reopens at the next unreached milestone.
- **Triggers:** `L.side.months` reaches 1 → `s1`; 5 → `s2`; 10 → `s3`; graduation month (15, or 12 after `s3:partTime`) → `s4`. The existing auto-graduation at `engine.js:835-842` is **replaced** by `s4`.

| Step | Text | Options → effects | dq |
|---|---|---|---|
| **s1** | **ההכנסה הראשונה!** · קיבלת {first} על העבודה בערבים. ומה עם מס הכנסה? · *hint:* בקצב הזה: חוב מס של בערך {due12} בשנה. מי שלא מדווח מקבל חשבון בסוף השנה — ועוד 10% קנס. | **file** "לפתוח תיק ולשלם מקדמות": `sideReport` true. **later** "אחר כך" (default): nothing | financial |
| **s2** | **הזמנה גדולה** · בית קפה שכונתי רוצה 200 עוגות לחג. צריך לקנות חומרים עכשיו ב־{cost} — והתשלום רק בחודש הבא. | **take** "לקחת": −0.3S now; next payday +0.55S; odds 0.2 (`a`) late: pays one month later. Text: "במשחק: 1 מכל 5 לקוחות כאלה משלם באיחור". **advance** "לבקש מקדמה של חצי": odds 0.6 (`b`): win → +0.275S now, −0.3S now, +0.275S next month; lose → the client goes elsewhere (no deal). **decline** "לוותר" (default) | financial |
| **s3** | **להגדיל הימור?** · העסק הצדדי מכניס בממוצע {avg} בחודש. אפשר לצמצם משרה ולתת לו יותר זמן. · *hint:* יש לך {cushion} חודשי הוצאות בצד. | **partTime** "לעבור לחצי משרה": grossMult 0.6 until graduation (`grossTemp`), side income × 2, graduation moves to side month 12. **keep** "להמשיך ככה" (default). **small** "להשאיר אותו קטן": the side plan stays income-only; no graduation; level stays capped | mixed |
| **s4** | **הערבים הפכו לעסק** · אפשר לפתוח עסק אמיתי עם הציוד והלקוחות שכבר יש לך. איזה? | One option per `SIDE_GRAD` type allowed in this world (below), each with `BIZ.forecast` for 3 months, `ownerEnergy` and setup notes. Plus **small** "להישאר עם עסק צדדי". **Default = coffee** (today's behaviour) | mixed |

`SIDE_GRAD` (in `business.js`) — only small-capital types; equipment is free, as today:

```js
export const SIDE_GRAD = {
  coffee:  { overrides: { startCapital: 23000 }, worlds: 'all' },                 // equipment 20,000 + 3,000 cash
  toyshop: { overrides: { startStock: 120, startCapital: 10000 + 120*35 + 3000 }, worlds: ['w1','w3','h'] },
};
```

- Laundromat, pizza and app are **not** offered at graduation. The card says "עסק כזה דורש הון גדול — אפשר לפתוח אותו במשבצת 'העסק שלך'."
- **Lessons:** `side_hustle`, `side_tax`, `biz_receivables`, `biz_owner_job`.
- **Save:** `chains.side {stage, data:{first, partTime, gradAt}}`; `L.side` unchanged.

### 5.5 Chain `friend`: a loan or partnership with a friend

- **Worlds:** all. Cooldown 18. maxRuns 2. Friend names: יוסי (run 1), מיכל (run 2).

```
idle ─(L 'friend')→ f1 ─lend|guarantee→ (+3) f2 → (+6 from entry) f3/news → end
                    └no→ end
```

| Step | Text | Options → effects | dq |
|---|---|---|---|
| **f1** (L) | **{name} מבקש עזרה** · {name}, חבר מילדות, פותח עסק ומבקש הלוואה של {amount} — או לפחות שתחתום לו ערבות בבנק. *(run 2: remember line)* | **lend** "להלוות לו": −1S; sealed `ok = entry < 0.6`. Text: "במשחק: בערך 4 מכל 10 עסקים כאלה לא מחזירים בזמן". **guarantee** "לחתום ערבות": 0 now; risk 1.5S; sealed `called = entry < 0.35`. Text: "אם הוא לא ישלם — הבנק גובה ממך {risk}". **no** "לסרב בנימוס": 😊−3 | personal |
| **f2** (inbox, lend/guarantee) | **{name} שוב מתקשר** · *remember:* כבר נתת לו {amount}. · "עוד {extra} ואני עובר את החורף." *(guarantee: "הבנק רוצה ממני עוד ערבות של {extra}.")* · *hint:* הכסף הנוסף לא משנה את הסיכוי שהעסק יצליח. | **more** "לתת עוד": −0.5S (lend) or risk +0.5S (guarantee); the outcome is unchanged. **partner** "להציע שותפות במקום": −0.5S; the loan becomes a 20% stake (no cash repayment); if `ok` → stake asset at resolution. **refuse** "לא, מספיק" (default): 😊−2 | personal |
| **f3a** lend & !ok (inbox) | **{name} לא יכול להחזיר** · העסק נסגר. {name} מציע להחזיר לאט, כמה מאות בחודש. | **plan** "לקבל החזר בתשלומים": income +0.05S × 12 ("החזר מ{name}"). **forgive** "לוותר לו": 😊+3. **court** "תביעה קטנה": −0.05S; odds 0.5 (`a`): +0.5S in 3 months; 😊−4. Text: "במשחק: חצי מהתביעות כאלה מצליחות". Default: plan | personal |
| **f3b** guarantee & called (inbox) | **הבנק גובה ממך** · {name} לא עמד בהלוואה. הבנק דורש ממך, הערב, {risk}. | **pay** "לשלם עכשיו": −risk. **spread** "הסדר תשלומים עם הבנק": loanAbs risk (cost shown per month, no credit hit). Default: spread. Both apply `ensureCash` | financial |
| news (ok paths) | lend ok: "{name} החזיר {amount} — והזמין אותך לפתיחה." · guarantee ok: "הערבות שוחררה. פיו." · partner ok: "השותפות עם {name} מכניסה {cf} בחודש." · partner !ok: "העסק נסגר. גם החלק שלך." | — | — |

- **Stake asset:** `addAsset(st, {k:'stake', n:'20% מהעסק של {name}', cost: paid, down: paid, cf: r10(0.06S), value: r100(1.2 × paid)})`. Add `stake: {label:'שותפות', debtLabel:'הלוואה'}` to every world's `kinds` (a spread from `common.js`). The model falls back to `biz`.
- **Luck:** `addLuck(st, 'friend', …)` is kept, as today (`engine.js:861`).
- **Lessons:** `friend_loan`, `guarantor`, **`sunk_cost`** (new; f2), `credit_score` (f3b).
- **Save:** `chains.friend {stage, run, path:'lend'|'guarantee'|'no', seal.entry, data:{amount, extra, at, ok, partner}}`. **Migration of `L.friend`:** `{kind, amount, at, ok}` → `chains.friend = {stage:'wait', run:1, path:kind, startM: at − 6, nextAt: at, nextStep:'resolve', data:{amount, ok}}`, then `L.friend = null`.

### 5.6 Chain `crisis`: economic crisis and recovery (tied to T2's cycle)

- **Worlds:** w1–w4. **Off in history mode**, which has real headlines and its own benchmark. Cooldown 36. Exempt from the 2-open-chains cap.
- **Trigger** (public, at a payday; the first of these):
  1. `econSignal(st)` changes to `'recession'`;
  2. a crisis tile was resolved this month (`st.stats.crises` went up);
  3. a monthly IDX move ≤ −8% (news `indexDrop`).

  With no T2 cycle, only 2 and 3 apply.

```
idle → c1 (invest) → (+1) job → (+1, only with a managed business) bizCut → recovery (when signal ∈ {recovery, expansion}
     or IDX ≥ 0.95 × idxPeakAtStart, or 12 months) → end (18 months maximum)
```

| Step | Text | Options → effects | dq |
|---|---|---|---|
| **c1** | **כותרות: מיתון** · המדד ירד {dd}% מהשיא. יש לך כרית ל־{cushion} חודשים{debtLine}. מה עושים עם ההשקעות? (`debtLine` = "והמשכנתא בריבית משתנה" when variable debt exists) | **keep** "ממשיכים כרגיל" (default). **pause** "לעצור את הוראת הקבע": autoInvest pause. **sell** "למכור הכול": sellIdx (flag `panicSell` when IDX < 0.92 × peak). **more** "להגדיל את הוראת הקבע" (`when: cushion ≥ 3` and autoInvest > 0): autoInvest ×1.5. Card data: IDX holding value, paper loss, auto amount | financial (gentle: §9.3) |
| **job** (salaried, not jobless) | **במשרד מדברים על קיצוצים** · ההנהלה מציעה: 10% פחות שכר לחצי שנה — במקום פיטורים. | **accept** "להסכים לקיצוץ": grossTemp 0.9 × 6. **refuse** "לסרב": odds 0.3 (`a`): lose → jobless 2 months (benefit as in layoff) + severance kept; win → nothing. Text: "במשחק: 3 מכל 10 שמסרבים מפוטרים". **look** "להתחיל לחפש בשקט": commute-style −3 🔋/month × 2; odds 0.5 (`b`): win → grossMult 1.05 after 2 months. Default: accept | mixed |
| **bizCut** (owns ≥ 1 managed business) | **הלקוחות מקצצים** · {bizName}: הביקוש ירד. הקופה של העסק: {bizCash}. | **price** "מבצע: −5% במחיר": price −5%. **staff** "לצמצם עובד": fire 1 (severance shown). **hold** "להחזיק מעמד מהקופה" (default): nothing | financial |
| **recovery** (inbox, single option `ok`, not scored) | **אחרי הסערה** · המדד חזר ל־{back}% מהשיא. {pathLine} · מי שהמשיך להשקיע קנה {units} יחידות בזול — שוות היום {diff}. | `ok` "הבנתי". `pathLine` from c1's choice: keep → "המשכת — והיחידות שקנית בירידה שוות היום יותר."; pause → "עצרת — ובצדק אם לא הייתה כרית; היחידות שלא נקנו עלו בינתיים."; sell → "מכרת ב־{sellPrice}; היום המדד ב־{nowPrice}."; more → "הגדלת — ויש לך היום {units} יחידות שנקנו בזול." | none |

- **Public numbers only:** `units` = units bought by the auto order during the chain (actually bought, from `L.idxBuys`/basis deltas). For pause/sell it is computed **as if** the order had continued at the public monthly prices (a public counterfactual, no sealed data).
- `c1` unlocks **`time_in_market`** (on keep/more, or at recovery), which is unreachable today (content.md §1.1).
- **Lessons:** `emergency_fund`, `drawdown`, `panic_selling`, `time_in_market`, `unemployment`.
- **Save:** `chains.crisis {stage, startM, data:{idxAtStart, idxPeakAtStart, auto, choice, unitsDuring, sellPrice}}`.
- **Interaction with T2:**
  - while `job` is open, `layoff`/`jobOffer` cards are substituted (§3.5);
  - T2's recession weighting of layoff (when/alt substitution) must respect the 24-month layoff cooldown;
  - the business demand shock from T2's cycle and the crisis-tile shock are capped together (§6.4).

---

## 6. Business at the centre (§11), inside `js/finance/business.js`

### 6.1 Principles [REQ]

- **One engine.** Every mechanic below is a pure function in `business.js`, with JSON state, integer ₪, no `Math.pow/log/exp`. The engine only:
  - passes the calendar month and the story rng;
  - turns `report.decide` into inbox items;
  - applies `resolveEvent` on `'Q'`;
  - shows the news.
- **Layered information:** level 1 = three numbers and one "why" sentence; level 2 = P&L groups plus the cash bridge plus receivables and stock; level 3 = all lines, notes and history.
- **Nothing hidden that matters:** seasons are a public calendar announced ahead; odds of sealed outcomes are on the card; event frequencies are labelled "במשחק" on the business card.

### 6.2 New and extended mechanics

| Mechanic | Status today | T3 change |
|---|---|---|
| **Setup** | one fixed start per type | `SETUPS[type] = {lean, std, strong}` with overrides (below). Offer card options: `start:lean`, **`start`** (= std, the id is kept so in-flight replays still work), `start:strong`. `create(type, {setup})`. |
| **Seasons** | random `holiday` event (×1.2, 1 month) and the w1 "bonus" market card | `SEASONS[type][cal]` demand multipliers (calendar month 1–12). The random `holiday` is **removed** from `p.events`. A **season-prep** decision is announced ahead (§6.6 M). `simulate(b, d, rng, {cal})`; `forecast(b, d, n, {cal})` advances `cal`. The w1 bonus card still calls `applyShock` (kept). |
| **Calendar** | none | `calOf(st)` = history: the real `ym` month; otherwise `((st.month − 1) % 12) + 1`, where game month 1 = January. `metrics().calendar = {m, label:'דצמבר', season:'חנוכה'\|null}`. |
| **Expansion** | laundromat and pizza only (`cap`) | `p.expand` generalised to `{cost, cap?, demand?, rent?, fixed?, label, max}`. coffee "עגלה שנייה בתחנה אחרת" {cost 18000, demand +0.6, rent +2000, max 1}; toyshop "מרקטפלייס נוסף" {cost 8000, demand +0.4, fixed +600, max 2}; app "גרסת אנדרואיד" {cost 60000, demand: baseNew +0.5, fixed +3000, max 1}. `simulate` uses `baseDemand × (1 + expanded × demand)` and adds rent and fixed. Existing `cap` semantics unchanged. |
| **B2B receivables with terms** | `cashShare` + 1-month `arLag`; `bigClient` is paid like any sale | `b.arTerms = [{amount, due, late, bad, client}]`. The `lateClient` event (§6.6 F) books revenue now and cash at `due` (2 months later), or `due + 1` if `late`, or never if `bad` (P&L line **"חוב אבוד"** in opex, `badDebt`). Valuation's `receivables` includes `arTerms` not yet `bad`. |
| **Decision events** | 10 events, all automatic | `EVENTS[id].decide(b, ctx)` → choices (§6.6). `resolveEvent(b, key, choiceId)` → `{ok, errors, business, costs, changes, text, lessons}`, atomic like `applyDecisions`. `eventChoices(b, key)` → enabled flags, reasons and previews (`delta3` net profit, `cash3`). |
| **why** | `teach()` notes (computed, never rendered) | `report.why` (§6.7): profit and cash bridges that **sum exactly**, plus one sentence. |
| **Growth stage** | none | `growthStage(b)` 0–3 with hysteresis (§6.8). |
| **Reinvestment** | draw/inject exist | summary shows `retained = totals.netProfit − totals.drawnGross` as "השקעת מחדש בעסק". Suggest-line copy: "רווח שנשאר בעסק = כרית + צמיחה". |
| **Professional management** | manager toggle | unchanged; a manager covers the `staffQuit` "coverYourself" choice (overtime cost instead of owner 🔋). |
| **Sale** | `biz:sell` at valuation | plus the `buyerOffer` event (§6.6 L). |

`SETUPS` [TUNE]:

| type | lean | std (= today) | strong |
|---|---|---|---|
| coffee | owner alone, ₪25,000 | — same as lean, plus "std" label | premium machine: equipment 30,000, price 16, baseDemand ×1.05, startCapital 36,000 |
| laundromat | 10 machines: equipCap 2,100, equipment 85,000, startCapital 105,000 | 12 machines, 120,000 | 14 machines + dryers: equipCap 2,900, equipment 118,000, startCapital 140,000 |
| toyshop | startStock 300, startCapital 35,000 | 600, 60,000 | 1,000 stock + marketing 4,000, startCapital 80,000 |
| pizza | small branch: rent 12,000, equipCap 2,400, baseDemand 1,900, startCapital 200,000 | 250,000 | manager from day 1: startCapital 263,000 |
| app | 1 developer (founder only, staff 0), startCapital 150,000 | staff 1, 250,000 | staff 3, 400,000 |

Coffee std = lean, so coffee offers only `start` and `start:strong`.

### 6.3 Five distinct experiences

| type (worlds) | Core tension | Signature number on the summary (`signature`) | Season profile `SEASONS` (calendar month → ×demand) [TUNE] | Typical decision events (weights) |
|---|---|---|---|---|
| ☕ coffee (w1, w2, h, side) | you **are** the business: hours vs hiring | "תור בבוקר": utilization = units ÷ capacity | Aug 0.9 · Sep 0.8 · Oct 0.85 (holidays: the station empties) · else 1 | competitor 3, costSpike 2, staffQuit 1, lateClient 1, supplierDelay 1, viral 2, inspection 1 |
| 🧺 laundromat (w2, w3, w4, h) | high fixed costs, machines cap revenue | "ניצולת מכונות": units ÷ equipCap | Dec 1.15 · Jan 1.2 · Feb 1.15 (rain, drying) · Jul 0.95 | breakdown 3, competitor 2, costSpike 2, lateClient 1 (hostel linens), viral 1 |
| 📦 toyshop (w1, w3, side) | cash tied up in stock; lead time | "מלאי לכמה חודשים": stock ÷ expected demand; cash in stock ₪ | **Dec 1.6** (Hanukkah) · **Sep 1.3** (holidays) · Apr 1.2 (Passover) · Jan 0.8 · else 1 | customsDelay 2, costSpike 2, platformChange 2, competitor 2, lateClient 1 (kindergarten chain), viral 1 |
| 🍕 pizza (w2, w4) | big revenue, thin margin; the franchisor eats first | "מכל ₪100 מחזור נשאר לך": net margin; royalty ₪ | **Apr 0.6** (Passover: no chametz) · Jul 1.15 · Aug 1.15 · Dec 1.1 | competitor 3, inspection 2, costSpike 2, staffQuit 2, supplierDelay 1, lateClient 1 (school), breakdown 1 |
| 📱 app (w4) | burn vs growth; churn | "מסלול": months of runway; LTV vs CAC | signups: **Jan 1.5** (resolutions) · Sep 1.2 · Jul 0.85 · Aug 0.85 | viral 2, platformChange 2, competitor 2, staffQuit 2, lateClient 1 (corporate) |

### 6.4 Shock cap

Combined `demand` multipliers from `applyShock` effects (crisis tile 0.8, T2 recession 0.85, `competitor` 0.82, `platformChange` 0.85) are multiplied as today, then **floored at 0.6**, before season and price. Seasons are applied after the floor. [TUNE] This prevents a stacked crisis + cycle + competitor (0.56) from wiping a business with no warning.

### 6.5 Monthly report additions (`simulate` → `report`)

```js
report.cal, report.season = { mult, label } | null
report.decide = [ { key, id, title, text, choices: [ { id, label, note, preview: { delta3, cash3 }, odds?: { p, text }, default? } ], due, seal: { a, b } } ]  // ≤ 1
report.why = { profit: [ { k, amount, text } ], cash: [ { k, amount, text } ], sentence }
report.stage = { stage, prev, changed }
report.activity = { utilization, stockCover, lostSales, busy: utilization ≥ 0.95, stockout, event: firstEventId | null }
report.opex.badDebt
```

### 6.6 Business events table

All new choices are data in `EVENTS[id].choices`.

- **Base effect** = what happens anyway, applied in the month of the event.
- **Default** = the first-listed "do nothing" option, unless stated.
- `seal.a/b` = this business's two story draws for that month.
- "Preview" = `delta3` (3-month Δ net profit vs default, from `forecast` with no events) and `cash3`.

| # | Event (trigger) | Applies to | Base effect | Choices → effect | Odds shown | Lessons |
|---|---|---|---|---|---|---|
| A | **costSpike** "הספקים העלו מחירים" (random) | coffee, laundromat, toyshop, pizza | unit cost ×1.15 for 3 months (laundromat: fixed +15%) | **absorb** (default) · **price5** "להעלות מחיר ב־5%": price ×1.05 (elasticity preview) · **switch** "לעבור לספק זול יותר": cost effect becomes ×1.05; quality risk `a < 0.25` → demand ×0.92 for 2 months (coffee/pizza "לקוחות התלוננו על הטעם"; toyshop "מוצרים פגומים, החזרות"). Laundromat variant **night** "להפעיל בתעריף לילה": fixed effect becomes +7%, ownerEnergy +2 for 3 months, no risk | switch: "במשחק: 1 מכל 4 ספקים זולים מאכזב" | biz_gross_net, biz_elasticity |
| B | **customsDelay** "המשלוח תקוע בנמל" (random; a decision only if an order is in transit and stock cover < 1.5 months, otherwise news) | toyshop | orders in transit +1 month | **wait** (default; preview shows the expected stockout units) · **air** "להטיס חלק": 30% of the delayed units arrive now; extra cost = units × 0.3 × shipping × 4 ("טיסה עולה פי 4 מהים") · **local** "לקנות מספק מקומי": up to 100 units now at unitCost × 1.8, no duty | — | biz_inventory |
| C | **supplierDelay** "הספק לא הגיע" (random) | coffee, pizza | — | **short** "תפריט מצומצם" (default): demand ×0.85 this month · **retail** "לקנות בסופר": unit cost ×1.3 this month | — | biz_gross_net |
| D | **staffQuit** "עובד עזב בלי הודעה" (random; a decision only if staff > 0 after the quit, or for app) | coffee, pizza, toyshop, app | staff −1 | **leave** (default) · **replace** "לגייס מחליף": hire 1 (hiring cost; half capacity this month) · **cover** "לכסות בעצמי חודשיים": capacity +perStaff × 0.6 for 2 months, ownerEnergy +6 for 2 months (with a manager: overtime one-off of wage × 0.25 instead of 🔋). App: **freelance** "פרילנסר לשלושה חודשים": wage × 1.3 for 3 months at full speed, instead of cover | — | biz_capacity, biz_owner_job |
| E | **competitor** "מתחרה חדש נפתח קרוב" (random) | all | demand ×0.82 for 6 months | **ignore** (default) · **match** "להוריד מחיר ב־10%": price ×0.9 · **loyal** "כרטיס מועדון ושירות": fixed + r100(0.03 × last revenue) for 6 months; the effect becomes ×0.9 · **push** "קמפיין נגדי לחודשיים": marketing + mktHalf for 2 months, then back (queued revert). App variant: **freemium** "גרסה חינמית": price ×0.7, churn ×0.8 for 6 months | — | biz_elasticity, biz_marketing |
| F | **lateClient** "לקוח גדול — אבל משלם בשוטף+60" (random; replaces `bigClient`) | coffee (high-tech office), laundromat (hostel linens), toyshop (kindergarten chain), pizza (school), app (company subscriptions) | — | **decline** (default) · **accept** "לקבל בתנאים שלו": extra units = 0.25 × baseDemand next month at price × 0.9 (app: 3 × baseNew users for 6 months); costs now; cash due in 2 months; sealed `late = a < 0.25` (+1 month), `bad = b < 0.08` (never paid → "חוב אבוד") · **advance** "לבקש 30% מקדמה": sealed `a2 = (a + 0.5) % 1 < 0.6` client agrees (else no order); if it agrees, 30% now, the rest as accept | "במשחק: בערך 1 מכל 4 לקוחות כאלה מאחר בחודש, ו־1 מכל 12 לא משלם בכלל" · advance: "במשחק: 6 מכל 10 מסכימים למקדמה" | **biz_terms** (new), biz_receivables, biz_vat |
| G | **breakdown** "תקלה בציוד" (random) | laundromat, pizza | capacity ×0.7 this month + repair one-off (existing) | **repair** (default, as today) · **wait** "לחכות לטכנאי": no repair now; capacity ×0.7 for 2 more months; repair × 0.6 next month · **replace** "מכונה חדשה במקום": expand cost; +expand.cap for good; no repair | — | biz_capacity, biz_depreciation |
| H | **platformChange** "האלגוריתם השתנה" (random) | toyshop, app | demand ×0.85 for 3 months | **ignore** (default) · **ads** "פרסום ממומן לשלושה חודשים": marketing + mktHalf × 0.5 for 3 months, then revert · **own** "לבנות רשימת תפוצה ואתר": one-off 6,000; feePct −0.01 for good | — | biz_marketing |
| I | inspection, viral | as today | as today | news only (no decision) | — | — |
| K | **overload** "הקמפיין הצליח מדי" (**state**: lost capacity ≥ 15% of demand, and marketing raised in the last 2 months, or viral/season this month; once per 6 months) | coffee, laundromat, toyshop, pizza | (already lost sales) | **wait** "לתת להם לחכות" (default): demand ×0.95 for 2 months (deterministic, "לקוחות שחיכו לא חוזרים") · **temp** "עובד זמני מחברת כוח אדם": capacity ×(1 + perStaff ÷ capacity) for 2 months; one-off wage × 0.6 · **price10** "להעלות מחיר ב־10%" · **mktDown** "לחזור לתקציב השיווק הקודם" | — | biz_capacity, biz_elasticity |
| K' | **overload** (app) "השרתים כורעים" (state: newUsers ≥ 2.5 × baseNew) | app | — | **nothing** (default): churn ×1.4 for 2 months · **scale** "להגדיל שרתים": fixed +2,500 for good · **waitlist** "רשימת המתנה": newUsers capped at 1.5 × baseNew next month, no churn hit | — | biz_capacity |
| L | **buyerOffer** "קונה מציע לקנות את העסק" (state: b.month ≥ 12, stage ≥ 2, profit in 6 of the last 6 months, none in 12 months) | all | — | **keep** (default) · **sell** "למכור ב־{offer}": offer = r100(valuation.price × (0.9 + 0.4a)) + cash + receivables − tax · **counter** "להציע 10% יותר": sealed `b < 0.5` accepts → sale at offer × 1.1; else the buyer walks (news) | counter: "במשחק: בערך חצי מהקונים מסכימים להצעה נגדית" | biz_valuation, biz_owner_job |
| M | **season prep** (calendar; announced at peak − (leadTime + 1) months, so toyshop 2 months ahead, others 1) | per type, below | the season multiplier applies anyway (public) | see the next table | — | **biz_seasonality** (new), biz_inventory |

Season-prep choices:

| type | Text | Choices (default **bold**) |
|---|---|---|
| toyshop | **"{season} בעוד חודשיים"** · בעונה מוכרים פי {mult}. מלאי שמגיע אחרי החג נשאר במחסן. | **normal** "הזמנה רגילה" (= `suggest` order) · big "הזמנה גדולה לעונה": order = forecast demand × mult × (leadTime + 1) − stock − onOrder (cash needed shown; dead-stock risk shown: "מה שלא יימכר יאבד 2% בחודש") · none "בלי הזמנה" |
| pizza (Passover) | **"פסח בעוד חודש"** · רוב הלקוחות לא אוכלים חמץ — הביקוש ירד בערך ל־60%. | **asUsual** "כרגיל" · close "לסגור שבוע ולתת חופש": wages −25% that month, demand ×0.4 → less fresh-stock waste · kosher "מנות כשרות לפסח": one-off 3,000, the season effect becomes ×0.85 |
| pizza (summer) | **"החופש הגדול מתחיל"** · יותר משלוחים בערב. | **asUsual** · temp "עובד לקיץ": capacity +perStaff for 2 months, cost wage × 2 |
| coffee | **"החגים בדרך — התחנה מתרוקנת"** · בחגים יש פחות נוסעים. | **asUsual** · popup "לעבור לחודש לעמדה בקניון": one-off rent 2,500, the season effect becomes ×1.05 · short "לקצר שעות": wages −30% and capacity ×0.7 that month, ownerEnergy −6 |
| laundromat | **"החורף מגיע"** · בחורף כולם מייבשים אצלך. | **asUsual** · machine "מכונה נוספת לפני החורף" (= expand) · hours "שעות פתיחה ארוכות": fixed +800 for 3 months, capacity ×1.1 |
| app | **"ינואר: כולם מתחילים דיאטה"** · הרשמות פי 1.5 בינואר. | **normal** · campaign "קמפיין גדול לינואר": marketing × 2 for 1 month (an overload check follows) · referral "חבר מביא חבר": one-off 4,000, newUsers +20% for 2 months |

**Draw accounting:** an event is still chosen by the existing `r2 < eventChance` and `r3` (no change to the 3 draws). Sealed outcomes use the business's story draws `a, b` of **the month the event fires**. State-triggered and season events use the same `a, b`. At most one `decide` per month: priority season > overload > random event > buyerOffer; lower-priority candidates resolve with their default (news).

### 6.7 "Why did the result change" (every month)

**Profit bridge** (`why.profit`): Δ net profit vs last month (`b.last`), split into:

- `price`: Δprice × last units, net of VAT;
- `volume`: Δunits × current net price − variable cost. It is attributed to the **largest changed factor** among `season`, `event` (demand effects), `econ` (shock), `marketing`, `capacity` (lost to capacity), `stock` (lost to stock), `noise`. Shares use |ratio − 1|, + − × ÷ only;
- `unitCost` (costSpike, CPI);
- `waste`;
- one line per opex item that changed by ≥ ₪200 (wages, manager, rent, fixed, marketing, royalty, fees, depreciation, oneOff, badDebt);
- `tax`;
- `other` = remainder.

Show the top 3 by |amount|; the rest goes in "ועוד".

**Cash bridge** (`why.cash`): net profit → cash change:

- `+depreciation` "פחת — הוצאה בלי כסף שיצא";
- `−inventoryBought` "קנית מלאי — ייכנס להכנסות כשתמכור";
- `+cogsFromStock` "סחורה שנמכרה שולמה כבר";
- `−ΔAR` "₪X עוד אצל לקוחות" / "+ נכנס מלקוחות של החודש שעבר";
- `−capex`;
- `−vat timing` when relevant;
- `−drawGross` "משכת לכיס";
- `+injection` "הזרמת מהכיס".

**Sentence** template: "הרווח {עלה/ירד} ב־{Δ} בעיקר בגלל {top profit text}{, אבל/ו}הקופה {זזה ב־cashΔ} כי {top cash text}." Fallbacks: "חודש יציב — כמעט בלי שינוי." / first month: "החודש הראשון: {top cash text}."

**Invariants [REQ]:** `Σ why.profit.amount (incl. other) === netProfit − last.netProfit` and `netProfit + Σ why.cash.amount === cash.change`. Both are tested in integers.

**Example:**

```json
{ "profit": [ {"k":"season","amount":3200,"text":"חנוכה: ביקוש פי 1.6"}, {"k":"unitCost","amount":-1800,"text":"הספקים העלו מחירים (15%+)"}, {"k":"marketing","amount":-1000,"text":"שיווק +₪1,000"} ],
  "cash":   [ {"k":"stock","amount":-12000,"text":"קנית מלאי ב־₪12,000 — ייכנס להכנסות כשתמכור"}, {"k":"ar","amount":-4500,"text":"₪4,500 עוד אצל לקוחות"} ],
  "sentence": "הרווח עלה ב־₪400 בעיקר בגלל חנוכה, אבל הקופה ירדה ב־₪9,100 כי קנית מלאי." }
```

### 6.8 Growth stage (visual hook for the 3D/UI teams)

`growthStage(b)` computes a target each month:

| Stage | Name | Target criteria |
|---|---|---|
| 0 | "התחלה" | months < 3, or average net profit over 3 months < 0 |
| 1 | "יציב" | average net profit over 3 months ≥ 0, and units ≥ break-even in 2 of the last 2 months (app: users growing or runway ≥ 12) |
| 2 | "צומח" | stage-1 criteria and (average revenue over 3 months ≥ 1.25 × average of the first 3 months, or expanded ≥ 1, or staff ≥ start staff + 2; app: users ≥ 2 × startUsers) |
| 3 | "מותג" | stage-2 criteria and ≥ 12 months and (manager, or valuation ≥ 2.5 × invested) and (expanded ≥ 1, or app users ≥ 4 × startUsers) |

**Hysteresis:** up one step after the target is higher for 2 consecutive months; down one step after it is lower for 3 consecutive months; at most ±1 step per month. State: `b.stage`, `b.stageUp`, `b.stageDown`.

**Outputs:**

- `report.stage`;
- `summary().stage`;
- `cityModels()` biz entries gain `stage` and `activity`;
- effects `{type:'bizStage', at:'a<id>', from, to}` when it changes;
- effects `{type:'bizPulse', at, kind:'good'|'bad'|'event', amount: netProfit}` every month.

3D mapping, for NL-11:

| Stage | Look |
|---|---|
| 0 | a small stand, no sign |
| 1 | a sign and lights |
| 2 | an extension or second unit, people queueing (`activity.busy`) |
| 3 | a flagship with a logo and a crowd |

`activity.event` maps to an icon: competitor → a rival stall; breakdown → smoke; stockout → empty shelves; season → decorations. Assets are not part of T3.

### 6.9 Engine glue (no business logic in the engine)

- `monthlyBusiness`:
  - passes `{cal: calOf(st), story: () => next(st.bizStory[key], 'v')}`;
  - pushes news `{kind:'business', …, revenue, profit: netProfit, cashDelta: cash.change, toOwner: toOwner.net, why, stage, activity, decide: itemId|null}`;
  - **stops dropping `note`**: `why.sentence` replaces `note`, and `note` stays for one release.
- `bizStory` holder: `{v: uint32}` per key, seeded `mix32(seed ^ 0x51A7E5ED)` in `addBusiness`.
- The inbox `kind:'biz'` item holds `{assetId, key, id, choices snapshot}`. `resolveStory` calls `BIZ.resolveEvent`, debits any owner injection exactly like `CHOOSE.business` (`engine.js:2229`), and records the decision.
- **K tile and T2 `ops`:** the manage card lists the business's open inbox items **first** (as option buttons `q:<itemId>:<choiceId>` that route to `resolveStory`, so the log stays `'Q'`). Data: `ev.data.inbox = [storyEvent]`.

---

## 7. RNG plan

| Stream | Draws | Where | Rule |
|---|---|---|---|
| `dice`, `deal`, `doodad`, `market`, `crisis`, `mystery`, `special`, `drift`, `life`, `index`, plus T2's `dd`, `cycle` | **unchanged** | — | T3 adds **zero** draws. `createLife` = one deck pop plus one `r`, as today. Substitution, variants, chain overrides and doodad swaps are draw-free. |
| **`story`** (appended after T2's last stream) | **exactly 2 per payday**, always (also history, also no chains) | `storyDraw` at a fixed point in `payday()` | values → `st.story.r`. Seals for chain items created at that payday: `a = r[0]`, `b = r[1]`. Entry steps on L use the card's existing `r` (`seal.entry`). |
| **`st.bizStory[key]`** (one per business) | **exactly 2 per simulated month**, always | inside `BIZ.simulate` via `opts.story` | seed = `mix32(seed ^ 0x51A7E5ED)`, where `seed` is the business's own seed (drawn from `deal` at offer time; existing). `forecast()` passes no story rng and uses 0.5. |
| `st.bizRng[key]` | 3 per month, **unchanged** | — | — |

**Invariant tests:**

1. With the same seed and the same decisions, the sequence of states of every pre-existing stream is identical between the T3 engine and the T3 engine with stories disabled (module hook `__storiesOff()` for tests only; it never reaches saves).
2. A different choice on any story item leaves every stream's state identical at the next roll.
3. The number of `story` draws = 2 × paydays.

**Fairness:**

- sealed outcomes are fixed before the decision and never depend on it;
- the evaluator and every text read only the **odds** (`odds.p`), never `seal`;
- `seal` is part of the state (required for save/resume), but `describe`, `inbox()` and `metrics()` never output it. A test asserts that no described event contains a key named `seal` or the sealed values.

---

## 8. Saves, migration, replay

- **`ensureStoryState(st)`** (idempotent; no randomness):
  - `st.story ??= {chains:{}, inbox:[], nextId:1, seen:{}, memory:[], flags:{noCar:false, commute:0, area:'center', payCut:null, carShare:false}, r:[0.5,0.5], lastChainItemM:-99, lastBizItemM:-99, energyLow:0}`;
  - `st.rng.story ??= makeStreams(st.seed).story`;
  - for each managed business: `st.bizStory[key] ??= {v: mix32((st.bizRng[key] >>> 0) ^ 0x51A7E5ED)}`;
  - tag expenses (C1). If the label `תחבורה ציבורית` exists, tag it `transport` and set `noCar = true`. For legacy saves, also check `L.events` for a car `o:'bus'` → `noCar = true`;
  - migrate `L.friend` (§5.5);
  - `st.incomeExtra ??= []`;
  - `st.dq.luck.story ??= 0`;
  - `b.arTerms ??= []`, `b.stage ??= 0`, `b.stageUp = b.stageDown = 0` for every business;
  - remove `holiday` from the stored `b.p.events` (data is cloned into business state at create);
  - `b.p.expand` gains the new fields from `ARCHETYPES` when missing.
- **Version:** see D7. `deserialize` handles the chain v1 → v3 → v4 (→ v5). A future version is handled by NL-03 / T1, not here.
- **T1 alignment:** T1 (`docs/next-level/specs/T1-stability-saves.md`) asks for these, and T3 relies on them:
  - IR-1: `deserialize` keeps cloning its input;
  - IR-2: distinct `save_future` / `save_incompatible` errors;
  - IR-4: backfill missing streams and additive defaults **at every version**, not only inside a migration.

  So `deserialize` calls `ensureStoryState(st)` **unconditionally** after any migration, even when `st.v === SAVE_VERSION`. T1's backup-before-migrate wrapper needs nothing from T3.
- **Mid-chain round-trip [REQ]:** serializing at any point (an open L chain card, open inbox items, a scheduled step, a sealed outcome waiting, a business decision open) and deserializing gives a state that plays **byte-identically** to continuous play. Tested in U10.
- **Replay:** add `case 'Q'`. `replayConfig` is unchanged (stories are always on; crisis is off by mode only).
- **Verifier:**
  - `verify_core.js CODES` adds `'Q'`;
  - re-pin with `node tools/build-edge.mjs`, which now includes `js/systems/chains.js` automatically because the engine imports it;
  - synchronised site and function deploy (`docs/VERIFY_INTEGRATION.md §4`);
  - **release at a day boundary**: in-flight ranked games started on the old engine would mismatch.

---

## 9. Evaluator rules for story decisions

### 9.1 Classes (`option.dq`)

| Class | Used for | Score |
|---|---|---|
| `personal` | friend (all), move m1/roommates/smaller/m3, career promo, quiet | **100**, unless a risk flag: `noCushion` (cash + savings after < 1 month of E), `exposure` (risk amount > cash + savings, e.g. a guarantee), `burnout`. With a flag → 50, verdict `risky`. No `primary` at any mentor level. Card shows "החלטה אישית — אין כאן תשובה נכונה אחת". |
| `mixed` | car s1/s2bus/carBack/s3leaseEnd, move renew (negotiate/accept), homeRepair, career warn, side s3/s4, crisis job, health and layoff (existing cards, reclassified) | money **plus wellbeing**: U = money/E + happiness × 0.05 + energyValue/E. **Near band = 1 month of E** (instead of 0.5): any option within it scores 100. |
| `financial` | car s2fix/s2lease, move h2, career degree, side s1/s2, friend f3b, crisis c1/bizCut, every business event | existing `optionU` scoring, near band 0.5 E |

### 9.2 Money formula (one function, `storyMoney(st, opt, H)`, also used for the card totals)

```
money(H) = cash + flow × min(months || H, H) + salary × min(salaryMonths || H, H)
         + Σ_odds [ p × win(H) + (1 − p) × lose(H) ]          // the shown game odds, never the seal
         + studyValue (LIFE_CFG.studyRaise × baseNet × 24 / study.need × study)   // fixes course
energyValue = energy × E × (L.energy < 60 ? 0.02 : 0.005)      // same constants as plans (engine.js:2008); fixes health/bus
```

- Life and chain items use H = 24. The card shows `total12 = money(12)` and `total24 = money(24)`.
- Business items: money = `preview.delta3 × 2` (6 months), plus the expected sealed outcome at its odds, minus a **financing flag** `noCushion` when `cashNeeded > cash + savings − E`.
- **Consistency [REQ]:** the card's `total24` and the evaluator's money for the same option are equal (test U9).

### 9.3 Special rules

- **Crisis c1:**
  - `sell` gets `panicSell` when IDX < 0.92 × peak;
  - `pause` is never below `ok` (60) when the cushion is < 2 months ("זה בסדר לעצור כשאין כרית");
  - `keep`/`more` are `strong` when the cushion is ≥ 2;
  - `more` is disabled when the cushion is < 3.
- **Career warn:** `pushOn` gets the `burnout` flag when `pBurn ≥ 0.25` (shown on the card).
- **Side s1:** `later` is scored by the expected year-end bill with the +10% penalty, so `file` is best. That is honest, and the card says so.
- **Defaults on expiry:** not recorded as decisions; they only increment `st.stats.storyDefaults`.
- **Luck:** at the resolution of a sealed outcome, `addLuck(st, 'story', realised − expected)` in ₪ over the option's horizon. `learningOf` includes `luck.parts.story`.
- **Principles (DQ_PRINC):** story-car `['opportunity_cost','cushion']` · move `['cashflow']` · career `['time']` · side `['fees_tax','cashflow']` · friend `['risk_size','cushion']` · crisis `['time_in_market','cushion']` · biz `['cashflow','risk_size']`.
- **Reclassify existing cards** (C9):
  - `health` → mixed;
  - `course` → financial, with study valued;
  - `car` → handled by the chain;
  - `layoff` → mixed, cushion-aware: `keep` gets `noCushion` if the cushion after 2 jobless months is < 1; `withdraw` adds no flag;
  - `reserve` → single option, not scored (as today).

---

## 10. Data contracts for the UI

### 10.1 Story event (from `inbox(st)`), and life cards

```ts
storyEvent = {
  id: 'q12', itemId: 12, type: 'story', kind: 'chain'|'biz', chain?: 'car'|…, step?: 's2fix', assetId?: 'a7',
  tag: 'רכב ותחבורה' | 'העסק שלך · עגלת קפה', color, ink, title, text,
  remember: 'זוכר? לפני 8 חודשים תיקנת ב־₪3,600.' | null,
  hint: 'במשחק: …' | null, mentor: string,
  personal: boolean, progress: { n: 2, of: 3 } | null,           // "שלב 2 מתוך 3" (of = longest remaining path)
  options: [{ id, label, enabled, reason?, primary: boolean (guide + financial only), dq, kind: 'story',
              default: boolean,                                    // UI: "אם לא תחליט עד המשכורת הבאה: …"
              effects: { cash, flow, months, salary, salaryMonths, happiness, energy, glow, study,
                         risk: { amount, p, label } | null, total12, total24, note,
                         monthly /* deprecated = −flow */ },
              odds: { p, text } | null, loanAmount, loanMonthly,
              impact: /* T2 schema */ { now: cash, monthly: flow, months, horizon: 24, total: total24,
                                        risk: { p, amount, label }, wellbeing: { energy, happiness } },
              preview?: { delta3, cash3 } /* biz */ }],
  data: { cushion: { months, text: 'יש לך 2.4 חודשי כרית' }, due, dueText: 'עד המשכורת הבאה', defaultId,
          biz?: { summary L1 } }
}
```

Life cards (tile L) use the same `options[].effects` shape (`flow`, `salary`, `salaryMonths`, totals, `dq`, `odds`). Chain entry cards add `data.chain = {id, step, progress}` and `data.remember`.

### 10.2 Business

```ts
news { kind: 'business', assetId, name, type, icon, month, cal, revenue, revenueGross, profit, cashDelta, toOwner,
       why: { profit: [{k, amount, text}], cash: [{k, amount, text}], sentence }, events: [{id, title, text}],
       decide: itemId | null, stage, stagePrev, activity: { utilization, stockCover, lostSales, busy, stockout, event },
       headline /* existing */, note /* deprecated = why.sentence */ }

summary(b) += { stage, signature: { label, value, text }, calendar: { m, label, season },
  l1: { revenue, profit, cashDelta, toOwner, sentence },
  l2: { groups: [{ k: 'revenue'|'cogs'|'opex'|'tax'|'profit', label, amount, lines: [...] }], cashBridge: why.cash,
        receivables: { now, terms: [{ amount, due, client }] }, stock: { units, cover, onOrder, value } | null },
  l3: { lines, notes: allNotes, hist, breakEven, valuation, retained, totals } }

offer card data += { setups: [{ id: 'start:lean'|'start'|'start:strong', label, startCapital, forecast3: { netProfit, cashChange }, note }],
                     seasonProfile: [{ m, mult }], eventsText: 'במשחק: בערך פעם ב־4 חודשים קורה משהו בעסק' }
cityModels biz entry += { stage, activity }
effects += { type: 'bizStage', at, from, to }, { type: 'bizPulse', at, kind, amount }
metrics() += { calendar, inbox: { open, urgent /* due this payday */ } }
```

### 10.3 UI requirements (for the UI lane, `ui.js` / `game.js`)

| # | Requirement |
|---|---|
| UI-1 | `effectChips` renders `flow` (green when positive) and `salary` ("משכורת נטו ±₪X בחודש × N"). It never renders `monthly` for life or story options. This fixes C5 and C6 on **all** life cards, not only chains. |
| UI-2 | **Story card** (same modal as event cards):<br>• a "זוכר?" line under the title, in a distinct style;<br>• choice cards with chips;<br>• a 12/24-month total line per option ("ב־24 חודשים: −₪2,250");<br>• odds chip "במשחק: 1 מתוך 2";<br>• cushion line;<br>• "שלב 2 מתוך 3";<br>• the default option marked "אם לא תחליט: …";<br>• personal tag. |
| UI-3 | **Inbox:**<br>• new items open automatically after the roll animation and **before** the landing card, at most one modal per roll (others wait);<br>• a HUD badge with the count opens the list;<br>• items due this payday are marked "עד המשכורת הבאה";<br>• no timers and no countdown animation (no pressure clock: gameplay §8). |
| UI-4 | **Business monthly toast:** "🏪 {name}: מחזור {rev} · רווח {profit} · קופה {cashΔ}" plus `why.sentence` on a second line. A tap opens L2. A decision event shows a toast "יש החלטה בעסק" and the inbox. |
| UI-5 | **Manage card:**<br>• L1 block on top (3 numbers + sentence + signature number);<br>• open inbox items for this business;<br>• "פירוט" expands L2 (groups + cash bridge + receivables/stock);<br>• "דוח מלא" expands L3;<br>• revenue is visible (today it is missing). |
| UI-6 | **Offer card:** shows `forecast3.cashChange` (hidden today), the setup choices, a season strip (12 mini bars) and the events-frequency text. |
| UI-7 | **Calendar chip** in the HUD while the player owns a business, or always in w1–w4: "דצמבר · חנוכה". |
| UI-8 | **Copy:** Hebrew text ≤ 120 characters for `text` and ≤ 70 for `remember`/`hint` (mobile, 380 px). Lint in tests (U13). |
| UI-9 | **Scene (NL-11):** consume `bizStage` / `bizPulse` / `cityModels().stage`. Stage swaps animate with the existing `bump`. Never more than one pulse per business per payday. |
| UI-10 | **Accessibility:** story choice buttons are real `<button>`s; the default is announced in `aria-describedby`; chips have text equivalents (no colour-only signs, given C5). |

---

## 11. New lessons

New lessons go in `life.js` LESSONS and `business.js` BIZ_LESSONS. The library goes from 75 to 80; coordinate the counts and the `business` category label with NL-10.

| id | cat | title | text |
|---|---|---|---|
| total_cost | life | עלות כוללת של רכב | רכב עולה הרבה יותר מהמחיר שלו: דלק, ביטוח, טיפולים, תיקונים וירידת ערך. מחשבים את כל השנה — לא רק את החשבון של היום. |
| housing_share | money | כמה מהנטו הולך על דיור | כלל אצבע נפוץ: דיור עד בערך שליש מהנטו. זה לא חוק — אבל מעל זה כל העלאה בשכירות לוחצת על כל השאר. |
| sunk_cost | money | עלות שקועה | כסף שכבר נתת לא יחזור כי תיתן עוד. כל החלטה חדשה שואלת רק: מה הסיכוי מכאן והלאה? |
| biz_seasonality | business | עונות בעסק | בעסק יש חודשים חזקים וחלשים, ואפשר לדעת אותם מראש. מי שמזמין מלאי ומתכנן עובדים לפני העונה — מרוויח. מי שמגלה אותה באמצע — מפסיד. |
| biz_terms | business | תנאי תשלום וחוב אבוד | לקוח שמשלם "שוטף+60" מממן את עצמו מהקופה שלך. אם הוא מאחר — חסר לך מזומן. אם הוא לא משלם — הפסדת את הסחורה, ואת המע״מ כבר שילמת. במשחק אין החזר מע״מ על חוב אבוד; במציאות לפעמים יש, בתנאים. |

`time_in_market` becomes reachable through crisis c1 or recovery.

---

## 12. Acceptance criteria (numbered, testable)

1. `STREAMS` gains exactly one name, `'story'`, after T2's streams. No other stream changes order.
2. For 300 seeds × 4 worlds, with fixed decision scripts, the states of all pre-existing streams after each action are identical with stories on and off (`__storiesOff`).
3. `story` draws = 2 × `st.stats.paydays`. Each business's `bizStory` draws = 2 × `b.month`.
4. `replay(replayConfig(st), st.actions)` is byte-identical to the live state for 300 games per world that resolve inbox items through `'Q'` (random-player extended) and for 300 that never resolve them (defaults).
5. `verify_core.js CODES` contains `'Q'`. A `'Q'` with an unknown item id makes replay throw `replay_mismatch`. The pin is rebuilt and `build-edge.mjs --check` passes.
6. A v3 save, a T2 save and a save with an open `L.friend` all deserialize and play on. `L.friend` becomes `chains.friend` and resolves at the same month with the same outcome as before.
7. Mid-chain serialize/deserialize at every story state type (open L chain card, open chain item, scheduled step, open biz item) plays on byte-identically to continuous play (50 seeds per type).
8. **C1:** in 300 games per world, no "תיקון לרכב" doodad is applied while `noCar`, and no `car` s1 card shows while `noCar`.
9. **C2:** in 300 games per world, no life or story effect changes a `mortgage`-tagged line, and homeowners never see "בעל הבית".
10. **C3:**
    - no standalone L card is shown again within its cooldown;
    - `vacation` frequency ≤ 1.25 × the mean frequency of the other standalone cards;
    - games with a standalone repeat within 12 months = 0.
11. **C4:** never two friend loans or guarantees open at once. Every lend/guarantee resolves exactly once (news or item).
12. **C5/C6:** for every life and story option, `effects.flow === −effects.monthly`. The jobOffer "take" option has `salary > 0`. The UI snapshot shows the baby's monthly chip as negative and red, and the bus chip as positive and green.
13. No chain text or amount reads `inflationYear`, `seal`, `st.decks`, `negR`, `raiseR` or future draws (template allow-list plus a code grep test).
14. Every chain step is reachable: forced-state unit tests reach **every step of every chain in every world where it is enabled** (car/move/career/side/friend: w1–w4 + h; crisis: w1–w4).
15. **Natural frequency** (300 games per world, policies random + tapper + smart, time-limited mode) [TUNE]:
    - car starts in 25–60% of games;
    - move in 25–60%;
    - friend in 25–60%;
    - career (any sub-path) in 30–80%;
    - crisis in 30–85% (w1–w4);
    - side in ≥ 90% of games of a "side-plan" policy that keeps the plan for ≥ 15 months.
16. **Pacing:**
    - chain items per 12 months median 2–3, p90 ≤ 5;
    - business items per business-year median 2–4, p90 ≤ 6;
    - open items never > 3;
    - open chains never > 2 (crisis exempt).
17. **No illogical repeats over 300 games per world:**
    - no step id repeats within one chain run;
    - `maxRuns` and cooldowns are respected;
    - no `degree` without `study.done`;
    - no `warn` while jobless;
    - no `job` step while jobless;
    - no `bizCut` without a managed business;
    - no `s4` graduation twice;
    - no `carBack` without `noCar`.
18. Every option with a sealed outcome has `odds.text` containing "במשחק" before the decision. Every follow-up that can cost more than 1S is announced (hint or odds) on an earlier card of the same chain.
19. Personal options never carry `primary`. Their score is 100 or (with a flag) 50. `course` "take" scores ≥ 60 for teacher/dev/driver in w1. `health` private scores ≥ 60 for the teacher in w1.
20. For every story option, the card's `effects.total24` equals the evaluator's money term (`storyMoney(…, 24)`).
21. **Business:** for every simulated month in 300 business lifetimes per type,
    - Σ `why.profit` = Δ net profit;
    - net profit + Σ `why.cash` = `cash.change`;
    - all integers.
22. Every business type has at least one season with mult ≠ 1, and its season-prep item appears ahead of the peak by `leadTime + 1` months (toyshop 2) in a forced calendar test.
23. Each of the 7 requested business events (holiday stock = season prep, shipping delay, raw-material rise, employee leaving, new competitor, late big client, campaign overload) produces an inbox item with ≥ 2 enabled choices for every type it applies to (forced tests). Each choice changes the next 3 months' P&L or cash as its preview says (±₪1 for deterministic parts).
24. `lateClient` accept: receivable due at +2, or +3 when late, or written off as "חוב אבוד" when bad, with frequencies within ±3 pp of 25% / 8% over 10,000 sealed draws.
25. `growthStage` never jumps more than 1 per month, and needs 2 good / 3 bad months to change. Over 300 lifetimes per type, stage 3 is reached in ≥ 5% and ≤ 50% of lifetimes ≥ 24 months [TUNE].
26. Offer cards show setups (`start:lean`/`start`/`start:strong` where defined). The old option id `start` still works = std.
27. Side graduation offers only `SIDE_GRAD` types allowed in the world. The default (expiry) graduation is coffee, which keeps today's balance for idle players.
28. **Balance vs the T2 baseline** (same sim, 300 games per character × policy):
    - smart and tapper "in time" within ±5 pp;
    - median months within ±3;
    - smart ★★★ within ±4 pp.

    If a shift is larger, tune the [TUNE] values, not the rules.
29. `tests/determinism.test.mjs` (ranked, ±1-ulp nudges) passes with stories on. No `Math.pow/exp/log/**` in `chains.js` or the new business code.
30. Every Hebrew `text` is ≤ 120 characters and `remember`/`hint` ≤ 70 after template filling with typical values (lint U13). Every string passes through `gz()`, and the feminine variant is checked for 5 sample steps.

---

## 13. Tests and sim checks

### 13.1 Unit tests

New file `tests/stories.test.mjs`, plus extensions of `tests/business.test.mjs`.

| ID | Test |
|---|---|
| U1 | C1: bus → `noCar`; car lines cut and retagged; a forced "תיקון לרכב" doodad becomes `NO_CAR_DOODAD`; a car card while `noCar` (< 24 months) is substituted; after ≥ 24 months → `carBack` |
| U2 | C2: dev (w1, mortgage) draws `moving` → `homeRepair`; mortgage amount unchanged after every option |
| U3 | C4: lend → a second friend card inside 6 months is substituted; the first loan resolves at `at` |
| U4 | `flow`/`salary`/`salaryMonths` on all 12 standalone cards and all chain options; `monthly === −flow` |
| U5 | **Chain lint:** every `next.step` exists; every step is reachable from an entry; exactly one `default` per inbox step; every option has a Hebrew label; every `odds` has `text` with "במשחק"; template keys ⊆ allow-list |
| U6 | **Forced walk:** for each chain, each world enabled, and each path: set state, trigger, resolve each option, assert effects and the next scheduling (table-driven from `CHAINS`) |
| U7 | **Pacing:** creating 4 candidates in one payday → 1 chain + 1 biz item; others slide or default; open ≤ 3 |
| U8 | **Expiry:** an unresolved item applies its default at `due`; no `dq` recorded; `stats.storyDefaults++`; news emitted |
| U9 | **Evaluator:** personal 100/50; mixed near band; `total24 === storyMoney(24)`; course/health no longer 0 (C9); crisis c1 rules |
| U10 | **Save round-trip** mid-chain (all story state types) |
| U11 | **Migration:** v3 save with `L.friend`, legacy bus choice, and a business with `holiday` in `p.events` → `ensureStoryState` → plays; idempotent (run twice → equal) |
| U12 | **No sealed or future reads:** templates and amounts never reference `inflationYear`/`seal`/`decks`; described events contain no `seal` key; renewal amounts use `infl[last]` |
| U13 | **Copy lint** (lengths, `gz` feminine) |
| U14 | **Business:** `SETUPS` create valid businesses (cash ≥ 0); `SEASONS` applied; `simulate` uses exactly 3 + 2 draws; `forecast` with `cal` matches `simulate` with neutral luck |
| U15 | **Business:** each decision event × type → `eventChoices` enabled ≥ 2; `resolveEvent` atomic (invalid → unchanged); previews match a deterministic 3-month run |
| U16 | **Business `why` invariants** over random months (≥ 10,000) |
| U17 | **`growthStage` hysteresis** sequences |
| U18 | **lateClient** receivable timing and the bad-debt line; VAT already paid stays paid |
| U19 | **`replay` with `'Q'`;** `verify_core` accepts `['Q', 12, 'fixAgain']` and rejects `['Q', 'x'.repeat(50)]` |

### 13.2 Sim checks

Extend `tools/sim.mjs` and `tests/lib/random-player.mjs`:

- random-player: with probability 0.5, resolve a random enabled option of each open inbox item before rolling. Otherwise let it expire.
- sim policies:
  - tapper = primary or default;
  - smart = best `optionU` on financial items, default on personal;
  - **new policy `sideHustler`** (side plan for 15+ months) and `owner` (always starts the offered business).
- **Report table "stories"** per world: chain start rate, completion rate, steps per run, items per 12 months (median/p90), defaults share, substitution count by card, standalone repeat count, business items per business-year, stage distribution at the end.
- Assertions S1–S4 (criteria 8–11), 15–17, 21, 24, 25, 28. Run time: one world at 300 games ≈ 3 minutes on the 2-core box (gameplay §7: 25 s per 40 games). Run the worlds in separate processes.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **Decision fatigue:** chains plus business events plus T2's focus and due diligence add choices every month | Pacing caps (§3.4); defaults on expiry; news-only for minor events; criterion 16; check item counts per month in playtests (NL-15). |
| **Balance drift:** seasons, the new events, the shock cap and graduation options move business income | [TUNE] tables; criterion 28 against the T2 baseline; tune data, not rules. |
| **Replay/pin:** a new action code, a new module and new streams | Criteria 1–5; one re-pin per wave; release at a day boundary. In-flight ranked games across the boundary mismatch, which is known and also true for T2. |
| **Save migration:** two versions in flight (T2 then T3) | D7: one idempotent `ensureStoryState`, called from whichever migration is latest; tests U10/U11. |
| **T2 interface mismatch:** `econSignal`, `impact` schema, action letters, focus | §0.2 table; T3 reads T2 only through 3 small adapters (`econSignal`, `impactOf`, `primaryAllowed`). |
| **Information leaks:** sealed values sit in the state | Describe/inbox/metrics never output `seal`; U12; the evaluator uses `odds.p` only. |
| **Copy quality and length on mobile (RTL)** | Lint U13; owner and content review of all Hebrew strings in the PR; templates kept short. |
| **"במשחק" odds vs reality** (late payment, landlord negotiation, layoffs) could read as real statistics | Every odds text starts with "במשחק"; no real-world statistic is asserted without a source (content.md §6 rule). Real-world lines ("🌍 במציאות…") are added only with a source in `docs-v3/sources.md`. |
| **3D asset weight for growth stages** | T3 ships only data (`stage`, `activity`, effects). Asset work is NL-11, with its own budget. |
| **Lesson count change** (75 → 80) and the English "business" category label | Coordinate with NL-10. Counts are computed live in the UI. |
| **Long free games:** substitution falls to `quiet` often | Acceptable; content backlog: 3–4 more standalone cards (NL-10/NL-08 follow-up). |
| **Mirror engine drift** (`supabase/functions/verify-result/engine/`) | It is generated by `build-edge.mjs`, never hand-edited; `--check` runs in the release checklist. |

---

## 15. Work breakdown and files touched

| Step | Work | Files |
|---|---|---|
| 1 | Contradiction fixes C1–C9: tags, `housingOf`, `flow`/`salary`, anti-repeat and substitution, the `quiet` card, `NO_CAR_DOODAD`, evaluator reclassification | `js/engine.js`, `js/life.js`, `js/worlds/w1.js` (`car:true`), `js/worlds/common.js` (`stake` kind), `js/ui.js` (`effectChips`) |
| 2 | Story infrastructure: `st.story`, `storyDraw`, `storyMonth`, inbox, `resolveStory`/`inbox()`, `'Q'` in `act`/`replay`, `ensureStoryState`, migration hook | `js/engine.js`, `js/rng.js` (append `'story'`), `supabase/functions/verify-result/verify_core.js` |
| 3 | `js/systems/chains.js` (data) plus the interpreter (`applyStoryFx`, `storyVars`, triggers) for the six chains | `js/systems/chains.js` (new), `js/engine.js` |
| 4 | Business: `SETUPS`, `SEASONS`, `calOf`, generalised expand, `arTerms`, `why`, `growthStage`, shock floor, story rng in `simulate` | `js/finance/business.js`, `js/engine.js` (glue) |
| 5 | Business decision events: `EVENTS[].choices`, `eventChoices`, `resolveEvent`, `decide` priority, inbox glue, K-tile/ops listing | `js/finance/business.js`, `js/engine.js` |
| 6 | Evaluator: classes, `storyMoney`, luck part, principles | `js/engine.js` |
| 7 | UI: UI-1…UI-10 (story card, inbox, toasts, manage layers, offer card, calendar chip) | `js/ui.js`, `js/game.js`, `css/*` |
| 8 | Tests U1–U19, sim tables S, random-player | `tests/stories.test.mjs` (new), `tests/business.test.mjs`, `tests/determinism.test.mjs`, `tests/verify.test.mjs`, `tests/lib/random-player.mjs`, `tools/sim.mjs` |
| 9 | Docs and pin: ENGINE.md "Changes v4 — stories & business", re-pin, task board | `docs/ENGINE.md`, `supabase/functions/verify-result/engine*` (generated), `docs/next-level/TASK_BOARD.md` |

Steps 1 and 4 are independent and can be reviewed separately. Step 2 must land before steps 3 and 5. Step 6 depends on steps 3 and 5. Ship one engine re-pin for steps 1–6 together.
