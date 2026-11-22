# T2 · Strategic depth core — implementation spec

- **Task:** T2 "Strategic depth core" of the Next Level upgrade (TASK_BOARD NL-06 + the engine half of NL-07).
- **Branch:** `feat/rat-race-next-level`. Line numbers refer to the tree at 706c0ff. If a line moved, search for the quoted code.
- **Inputs:** `docs/next-level/research/gameplay.md` (§2 measurements, §3 root causes, §5 fairness rules, §7a–e designs), `docs/next-level/research/content.md` (§2.4 scoring bugs), `docs/ENGINE.md`, `tools/sim.mjs`, the engine code.
- **Owner's problem:** "the game is too light: roll the dice and pick the right thing". Measured: a tapper who always presses the highlighted option escapes in time 70–91% of games, and 81% of its scored decisions get 100 (gameplay.md §2.1, §2.3).
- **Binding director decisions:** these are restated in §0. Rivals are out of scope (they come in T6), but the public view and the stream order in this spec are designed for them.

Contents:
- §0 Scope and principles
- §1 Architecture, new files, rules gate
- §2 Streams and draw counts
- §3 State, save v4, migration
- §4 Action codes, replay, verifier diff
- §5 Mentor levels
- §6 Monthly focus
- §7 Deal due diligence
- §8 Economic cycle
- §9 Impact panel data
- §10 Evaluator fixes
- §11 Dominated options and verdict wording
- §12 Public view and info-leak rules
- §13 Sim policies and acceptance matrix
- §14 Unit tests
- §15 UI requirements
- §16 Work order, risks, rollback
- §17 Hebrew copy table

---------------------------------------------------------------------------------------------------

## 0. Scope and principles

T2 has seven parts, all of them engine work plus the engine's API. The UI agent builds the screens from §15.

| part | what it delivers |
|---|---|
| (a) Focus, "מוקד החודש" | Costs 🔋. Extends the plan (it does not duplicate it). Agenda of 2 queued months. Action `F`. |
| (b) Due diligence | New appended stream `dd`, a fixed number of draws per deal. Public flags. Inspect levels are card options logged as `c`. Claimed vs verified numbers. The trap-question leak is removed. |
| (c) Mentor levels | Three levels: `guide`, `hint`, `pro`. Action `H` (requestHint). Defaults: w1 `guide`, w2+ `hint`. Changeable in free modes (action `M`). Ranked modes are fixed at `hint` and the hint count is recorded. |
| (d) Economic cycle | New appended stream `cycle`, always 2 draws per payday. A public signal that is lagged and noisy. Effects come only from multipliers, never from extra draws. |
| (e) Impact data | Every major decision gets a structured `impact` object. The UI does no finance math. |
| (f) Evaluator fixes | So the post-game analysis can be trusted. |
| (g) Cleanup | Dominated options are removed and verdict wording no longer leaks. |

Every change follows the owner's rules:

1. **Every action has a cost, a benefit and a risk.** Each one also has at least one situation where it is NOT the best choice. The tables in §6, §7 and §11 state that situation explicitly.
2. **No pressure clock.** No timer is added anywhere.
3. **Decisions are scored only from what the player could see at the time** (§10, §12). Luck is reported separately. A reckless decision that happened to work out still scores low, because scoring is ex-ante. A reasonable decision is never marked as a mistake because a rare outcome followed.
4. **No forecast is presented as a promise.** Every scenario carries the disclaimer (§9). An already-drawn future value is never revealed (§12).
5. **No heavy accounting.** Each addition must create a decision, a clear piece of feedback, or a meaningful moment. Anything that does none of these was cut. The cuts are: no focus streak bonuses, no separate inspection currency, and cycle effects are multipliers only.

---------------------------------------------------------------------------------------------------

## 1. Architecture, new files, rules gate

### 1.1 New pure modules

All of them live in `js/systems/`. They are picked up automatically by `tools/build-edge.mjs collect`, because engine.js imports them. Rules for these files:

- No DOM, no `Math.random`, no `Date`.
- No approximated math: `tests/determinism.test.mjs` scans them.
- They hold data plus pure helpers only.
- Anything that needs `metrics`, `CHOOSE` or `describe` stays in engine.js, to avoid circular imports.

| file | exports | notes |
|---|---|---|
| `js/systems/focus.js` | `FOCUS` (table §6.2), `FOCUS_IDS`, `focusCfg(worldId)` | data plus helpers that take plain numbers |
| `js/systems/dd.js` | `DD_DRAWS = 6`, `ddCfg(worldId)`, `drawDD(rs, card, worldId, opts)` (rs = the 6 numbers), `posterior(worldId, k)`, `expectFactors(worldId, k)`, `rangeOf(dd, claimed)`, `FLAG_POOLS` | Bayes tables are precomputed at module load with + − × ÷ only |
| `js/systems/cycle.js` | `CYCLE_DRAWS_INIT = 2`, `CYCLE_DRAWS_MONTH = 2`, `cycleCfg(worldId)`, `initEcon(r1, r2, worldId)`, `stepEcon(econ, rT, rN, worldId, sharp)`, `mult(econ, worldId, key)`, `econPublic(econ, month)`, `cyclePath(seed, worldId, months)` | `cyclePath` rebuilds the phase path from the seed alone. Sim buckets and tests use it. It must equal the engine path (test §14 T14). |
| `js/systems/mentor.js` | `LEVELS = ['guide','hint','pro']`, `defaultLevel(cfg)`, `VERDICT_WORDS` (RegExp), `neutralLabel(id, text, level)`, `LEVEL_TEXT` | wording filters |

### 1.2 The rules gate (also the rollback switch)

- New state field `st.rules`, either `3` or `4`. New games get `4`.
- Every T2 behaviour that can change an **outcome** or an **option set** is wrapped in `R4(st)`:

  ```js
  const R4 = (st) => (st.rules || 3) >= 4;
  ```

  This covers: dd draws and truth, cycle draws and multipliers, focus, inspect options, inst3/credit changes, the tax-report fee and the side-report fee.
- With `rules: 3` the engine plays exactly as v3 does today:
  - `rules: 3` never touches the new streams;
  - option sets stay the same;
  - money is identical.
- Some changes do not affect outcomes and are applied to both rule sets: mentor-level presentation (primary flags, wording) and evaluator scoring (`st.dq`).
- Why the gate exists:
  1. **Ranked games in flight at release** keep `rules: 3` (§3.3), and the verifier replays them with `rules: 3` (§4.3).
  2. **Rollback:** change `createGame`'s default from `4` to `3` and re-pin the edge bundle. That is a one-line kill switch with no revert (§16.3).
  3. **Legacy-equivalence test** (§14 T7) proves that the gate is complete.

---------------------------------------------------------------------------------------------------

## 2. Streams and draw counts

`js/rng.js:57` changes as below. Only append. A stream's seed comes from its index (`rng.js:58-62`), so streams 0–9 keep their seeds.

```js
export const STREAMS = ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index',
  'dd', 'cycle', 'rival', 'listing'];
```

| idx | stream | owner | draws (fixed, decision-independent) |
|---|---|---|---|
| 10 | `dd` | T2 | **exactly 6** on every landing on a deal tile (`createDeal`, engine.js:1185) and on every landing on a mystery tile (`createMystery`, :1246). Order: `[riskR, flagR, cfR, repairR, valueR, jitterR]`. The 6 draws happen whatever the card turns out to be (asset deal, stock, crypto, golden, quiz). They are used only if the result is an asset `deal` pending. |
| 11 | `cycle` | T2 | **2** in `createGame` (initial phase, initial months-in-phase). Then **exactly 2 per payday** (`payday`, :706): `[rT transition, rN signal noise]`. This happens in every mode, history included, where the values are ignored. |
| 12 | `rival` | **reserved for T6** | 0 in T2 |
| 13 | `listing` | **reserved for T6** | 0 in T2 |
| 14+ | — | future tasks (e.g. NL-08 `chain`) | append after `listing` |

**Why `rival` and `listing` are reserved now:** v4 saves already carry those two streams, so T6 needs no stream migration. With `rules: 3` the engine never consumes `dd` or `cycle`.

**Guarantees (tested, §14 T2/T3):**
- After N turns, the stream state is identical across any two decision sequences.
- Inspecting, negotiating, the chosen focus, hints and the mentor level never consume a draw.
- An `ops` focus opens a business panel with no draw: it does not call `createBusinessEvent`, which spends 2 `deal` draws.

---------------------------------------------------------------------------------------------------

## 3. State, save v4, migration

### 3.1 New and changed state (all plain JSON)

```js
st.v = 4                         // SAVE_VERSION (engine.js:22)
st.rules = 4                     // 3 = legacy behaviour (§1.2)
st.mentor = 'guide'|'hint'|'pro'
st.rng.dd, st.rng.cycle, st.rng.rival, st.rng.listing          // uint32 (rival/listing unused in T2)
st.econ = null | {               // null when rules 3 or history mode
  phase: 'exp'|'slow'|'rec'|'recov',   // SEALED: true phase, never output directly (§12)
  m: 0,                          // paydays spent in this phase
  signal: 50, prev: 50,          // public gauge 0..100 and last month's value
  label: 'צמיחה', trend: 0,      // public: label from signal + trend
  sharpUntil: 0,                 // research focus: sharper signal until this month (inclusive)
  hist: [{ m, s }],              // public signal history (≤ 24)
  truth: [{ m, phase }],         // SEALED: full path; exposed only with a lag of ≥ 3 months (§8.4), all of it at game end
}
st.life.focus = { id: 'none', m: 1, opsOpen: false, opsUsed: false }   // active focus for the month that started at payday m
st.life.agenda = [null, null]    // focus ids queued for the next 2 paydays
st.life.focusMonths = { scout:0, debt:0, ops:0, frugal:0, network:0, research:0, none:0 }
st.life.debtDeal = null | { until, adj }   // debt focus: lower loanPct for 6 months
st.life.frugalCuts = 0           // also lowers the happiness setpoint by 1 per cut (max 4)
st.dq.hints = 0; st.dq.levelChanges = []; st.dq.luck.dd = 0; st.dq.luck.cycle = 0
st.stats.inspections = 0; st.stats.inspectSpent = 0; st.stats.ddRepairs = 0; st.stats.ddAvoided = 0
// pending deal (asset):
p.dd = { risk, flags: ['photos', …], f, vf, repair, jitter, level: 0|1|2 }   // risk/f/vf/repair/jitter SEALED
p.hinted = true|undefined
// asset bought from a dd deal:
a.dd = { claimedCf, claimedValue, level, repair }    // shown after purchase ("מוצהר ₪X · בפועל ₪Y")
```

`setpoint(L)` (engine.js:795) subtracts `Math.min(4, L.frugalCuts || 0)`.

### 3.2 `deserialize` chain (engine.js:213-220)

```js
export function deserialize(json) {
  const st = typeof json === 'string' ? JSON.parse(json) : clone(json);
  if (!st || typeof st !== 'object') throw new Error('save_incompatible');
  if (st.v === 1) migrateV2(st);          // must now set st.v = 3 (today it sets SAVE_VERSION, :240)
  if (st.v === 3) migrateV3(st);
  if (st.v !== SAVE_VERSION) throw new Error('save_incompatible');   // v5+, junk
  getWorld(st.worldId);
  return st;
}
```

### 3.3 `migrateV3(st)` (new, after engine.js:242)

The whole body is wrapped in `try … catch → throw new Error('save_incompatible')`, the same way `migrateV2` is. Steps:

1. **Streams:**

   ```js
   const fresh = makeStreams(st.seed);
   for (const k of STREAMS) if (st.rng[k] == null) st.rng[k] = fresh[k];
   ```

   The values are deterministic from the seed. Existing streams are untouched.
2. **Rules:**

   ```js
   const ranked = ['daily','weekly','challenge'].includes(st.mode);
   st.rules = ranked ? 3 : 4;
   ```

   - In-flight ranked games keep legacy rules, so the verifier can replay them (§4.3).
   - Free and history games get the new systems from the moment they are migrated.
3. **Mentor:** `st.mentor = ranked ? 'hint' : (st.tutorial || st.worldId === 'w1' ? 'guide' : 'hint')`.
4. **Life:** `focus = {id:'none', m: st.month, opsOpen:false, opsUsed:false}`, `agenda = [null,null]`, `focusMonths` all 0, `debtDeal = null`, `frugalCuts = 0`.
5. **dq and stats:** `dq.hints = 0`, `dq.levelChanges = []`, `dq.luck.dd = 0`, `dq.luck.cycle = 0`. New stats keys are set to 0.
6. **Econ:**

   ```js
   st.econ = R4(st) && !st.history ? initEconFromStream(st) : null;
   ```

   This draws the 2 init values from the cycle stream, which is at position 0. The result is deterministic for a given seed. Free games are never server-verified, so the migration point does not matter.
7. **Pending deal (mid-card save):** a pending deal without `p.dd` stays a **legacy card**. It gets no inspect options and its claimed numbers are its true numbers. Never draw dd for a card that was already drawn.
8. `st.v = 4`.

**Release note.** Ship at an Israel day boundary that is also a week boundary, so that in-flight daily and weekly games are as few as possible. Saves that cannot be migrated still show the existing toast (game.js:226). NL-03 adds the pre-migration backup.

---------------------------------------------------------------------------------------------------

## 4. Action codes, replay, verifier diff

### 4.1 New actions

Each action is logged only when it changes state. Failed calls are never logged, as today.

| code | log entry | export | allowed when | effect |
|---|---|---|---|---|
| `F` | `['F', id, slot]` | `setFocus(st, id, slot = 0)` | `R4`, not over. `slot 0` (activate this month): phase `'roll'`, or a pending `payday`/`edu` card. `slot 1/2` (agenda): any time. | §6 |
| `H` | `['H']` | `requestHint(st)` | level `guide` or `hint`; a pending, non-auto event with a scoreable decision; first request for that event | sets `p.hinted = true`, `st.dq.hints++`. A second request for the same event returns the same hint and is **not** logged. |
| `M` | `['M', level]` | `setMentorLevel(st, level)` | modes `free` and `history` only; level differs from the current one | `st.mentor = level`; pushes `{m, from, to}` to `st.dq.levelChanges` |
| `c` | `['c', 'inspect:1' \| 'inspect:2']` | via `choose` | §7 | non-closing card option |

All return the usual `{ok, error?, effects, mentor, event, end?}`. `requestHint` also returns `hint` (§5.4). `setFocus` also returns `decision` when it is scored (§10.7).

### 4.2 `replay` (engine.js:2631-2654) and `replayConfig` (:2656)

```js
case 'F': r = setFocus(st, a[1], a[2] ?? 0); break;
case 'H': r = requestHint(st); break;
case 'M': r = setMentorLevel(st, a[1]); break;
```

`replayConfig(st)` gains `mentor: st.mentor` and `rules: st.rules`. `createGame` must accept both:

```js
createGame({ …, mentor, rules })
// rules: only 3|4, default 4
// mentor: forced to 'hint' in daily/weekly/challenge, forced to 'guide' when tutorial; otherwise o.mentor ?? defaultLevel
```

**Mentor and replay.** The *starting* level comes from cfg. Changes made mid-game are replayed through `M`.

**Dev-only flags for the sim.** `createGame({_dev:{noCycle, noDD}})` is used only by `--ablate`. When it is present, `replayConfig` must carry it. It is rejected in ranked modes.

### 4.3 Verifier diff (`supabase/functions/verify-result/verify_core.js`)

```diff
-const CODES = new Set(['r', 'l', 'c', 'L', 'R', 'C', 'P', 'A', 'I', 'S', 'T']); // = the cases of engine.js replay()
+const CODES = new Set(['r', 'l', 'c', 'L', 'R', 'C', 'P', 'A', 'I', 'S', 'T', 'F', 'H', 'M']); // = the cases of engine.js replay()
+/** Israel date (YYYY-MM-DD) of the first day the v4 engine is live. Set at release. Earlier ranked games replay with rules 3. */
+export const RULES4_FROM = '2026-12-01';
+/** Legacy games (daily/weekly/challenge started before RULES4_FROM) replay with the pre-T2 rules. */
+export function rulesFor(row) {
+  const day = row.daily_key || row.weekly_start || row.challenge_day; // YYYY-MM-DD strings, see index.ts ROW
+  return day && String(day) < RULES4_FROM ? 3 : 4;
+}
 …
-  const cfg = { worldId: world.id, charId, seed, mode: row.mode, tutorial: false, bailout: false };
+  const cfg = { worldId: world.id, charId, seed, mode: row.mode, tutorial: false, bailout: false, mentor: 'hint', rules: rulesFor(row) };
```

What else has to change for the verifier:

- **`index.ts` ROW** (the select at index.ts:78-86) adds three columns:
  - `r.daily_key`;
  - `weekly_start`, derived from `r.weekly_key` to the Monday of that week (check the stored key format and convert it in SQL);
  - `(select c.created_at::date from game.challenges c where c.id = r.challenge_id) as challenge_day`.
- **`M` in a ranked log** makes `setMentorLevel` return `ok:false`, so `replay` throws `replay_mismatch`. That is the correct rejection.
- **The hint count needs no extra verification.** It comes from replaying `H`, so the server's count is authoritative. `summaryForServer` reports it (§5.6).
- **`validateActions` needs no change.** Every new entry has ≤ 3 elements, and its string arguments are ≤ 40 characters.
- **`MAX_ACTIONS` = 6000 stays.** `F` and `H` add only a few dozen entries per game.
- **Re-pin at release:** run `node tools/build-edge.mjs`, then commit `engine.bundle.json` and `engine_pin.js`. Run `--check` in the release checklist.
- **Tests:** `tests/verify.test.mjs` gets cases for the new codes, `rulesFor`, and a rules-3 replay (§14 T17).

---------------------------------------------------------------------------------------------------

## 5. Mentor levels

### 5.1 Behaviour per level

| aspect | `guide` (מתחיל) | `hint` (מתקדם) | `pro` (מומחה) |
|---|---|---|---|
| `primary` on options | exactly one. It is the evaluator's top option (§5.2); for unscored card types the existing rules apply. Personal and values life events get none. | **none** (all `false`) | **none** |
| deal pre-question `c.q` (the trap leak) | shown | replaced by the neutral rotating `dealAsk`. After the decision, `c.q` comes back as reflection in `out.mentor`. | same as hint |
| `roiVsLoan` text | as today | numbers only: `תשואה X% בשנה · הלוואה Y% בשנה` | same as hint |
| business option `biz:suggest` | label "ההמלצה: …" | label `הגדרות אוטומטיות של העסק` (no verdict). Card mentor is neutral (`bizAsk`, new line). | same as hint |
| payday plan tag "מתאים לכוח שלך עכשיו" | shown (UI reads `o.primary`) | not shown (no primary) | not shown |
| focus picker suggestion (`suggested:true`) | shown | not sent | not sent |
| `requestHint` (`H`) | allowed. Returns the primary's reasons and is counted. | allowed and counted | refused (`ok:false`, not logged) |
| verdict pill after a decision (`out.decision`) | shown | shown | **not returned during play**: `out.decision` is withheld, `st.dq` still records. Full review at the end. |
| impact panel (§9) | auto-open for the primary option | on tap | on tap |
| end screen | learning summary as today | + "עם רמז / בלי רמז" | + full decision-by-decision review (`learning.review`) |

**DESIGN-v3 §4 promise.** "Primary-follower must still usually escape" is kept **only at `guide`**. It is tested at ≥ 65%, §13.

### 5.2 One source of truth for the "best" option

New internal `scoreOptions(st, ev)`. It returns `[{id, U, flags, reasons}]` for the decision pool, using the same pool rules as `decisionRecord` (engine.js:2027-2049, after the §10 fixes). Three things use it:

1. **guide** `primary` = the argmax over enabled options. Ties go to closing options when the difference is below 0.1.
2. **`requestHint`** suggests the same argmax.
3. **`decisionRecord`** scores against the same pool.

This ends the primary-vs-evaluator contradiction (gameplay.md §3.3). Types that are not scored (trade, crisis, giving, shipping, auto, single-option) keep their existing primary rules at `guide`, and have no primary at hint/pro.

It is exported for the sim and tests as `E.scoreOptions(st, ev)`. It is pure, reads only the public context (§12) and never mutates.

### 5.3 `describe` change (engine.js:1309-1313)

At the end of `describe`, call `applyMentor(st, ev)`:
- `guide`: run today's single-primary logic, with the pick from §5.2 for scored types.
- `hint`/`pro`: `for (const o of ev.options) o.primary = false`. No fallback to `SAFE_IDS`.
- Then run the `VERDICT_WORDS` neutralizer on `label`, `mentor`, `text` and `data.roiVsLoan` (§11.2).
- `ev.suggested` must **never** be put on the event.

### 5.4 `requestHint(st)` → result

```js
{ ok: true, hintsUsed: 3,
  hint: { optionId: 'inspect:1' | null,          // null on personal/values events: "no single answer"
          label: 'לבדוק בעצמי (−4 🔋)',
          reasons: ['יש 2 סימני אזהרה, והעסקה גבולית: בדיקה יכולה לשנות את ההחלטה', 'אחרי הקנייה תישאר כרית של 0.6 חודשים'],
          note: 'רמז לפי מה שידוע עכשיו — לא הבטחה.' } }
```

- Reasons are the top-2 entries of `reasons` from `scoreOptions` (§10.8).
- On a `trade` window, or when no scoreable decision exists: `{ok:false, error:'אין כאן רמז — זו לא החלטה עם תשובה'}`.

### 5.5 `setMentorLevel(st, level)`
- Free and history modes only. In a tutorial game it is allowed only after the tutorial deal.
- It changes presentation only. No money effect.

### 5.6 Reporting
- `metrics().mentor = { level, label, hintsUsed, canHint }`.
- `summaryForServer` adds `mentor`, `rules`, `hints`.
- `checkEnd().learning` adds:
  - `hints`;
  - `byHint: {withHint:{n, avg}, without:{n, avg}}`;
  - `levelChanges`;
  - `review: [{t, m, c, o, score, verdict, why, best, hinted}]` (≤ 40, all levels; pro shows it by default);
  - `luck.parts.dd`, `luck.parts.cycle`.
- Decision records get `h: 1` when the event was hinted.

---------------------------------------------------------------------------------------------------

## 6. Monthly focus, "מוקד החודש"

### 6.1 Concept

The **plan** (`setPlan`) decides how many hours you sell for salary. The **focus** decides where your unpaid attention goes this month.

- One focus per month (between two paydays).
- It is paid **on activation**, from the same 🔋 budget the plan uses at payday. So overtime plus an active focus raises the burnout risk. That is the tension.
- **Why paid on activation:** it stops the exploit "set scout, inspect for free, switch back before payday".
- **The agenda:** 2 queued slots, popped at each payday. Planning ahead matters because a payday can pass mid-roll, and the next card may be a deal before you get a chance to act.

### 6.2 The FOCUS table (`js/systems/focus.js`)

| id | label | cost on activation | benefit during the month | NOT the best when | disabled when (reason) |
|---|---|---|---|---|---|
| `scout` | חיפוש עסקאות | −5 🔋 | `inspect:1` is free (0 🔋); `inspect:2` costs 50% | no cash or loan room to buy; recession with a tight loan cap; tired (🔋 < 45); no deal or mystery tile likely this month | 🔋 < 15 |
| `debt` | סדר בחובות | −3 🔋 and a fee = max(₪150, 0.5% of loans + credit), from cash | moves card debt into the bank loan (within the cap); `loanPct` −0.5 pp/month for 6 months (w2: −0.25); credit score +10 once | tiny debt (the fee outweighs the saving); no card debt and a cheap loan | no loans and no credit; 🔋 < 13 |
| `ops` | יום עבודה על העסק | −6 🔋 | opens the business manage panel now, as a pending card with no draw | no managed business; last decision < 3 months ago | no managed business; `!BIZ.canDecide(b)` (business.js:292) for all of them; 🔋 < 16 |
| `frugal` | ביקורת הוצאות | −1 🔋, −3 😊 now, and happiness setpoint −1 for good (max −4 in total) | cancels the most expensive subscription if there is one; otherwise cuts the largest eligible expense line by 10% in w1 or 8% in w2–w4, for good. Each line once (`x.audited`). | happiness close to the ★★★ gate (60); few months left in the game; lines already audited | no subscription and no eligible line (eligible = not rent, mortgage, loan, repayment, installment or a temporary `until` line) |
| `network` | קשרים | −4 🔋, +1 😊 | +0.10 negotiation chance on every offer this month (`negChance`, :1365, clamp 0.95); +0.10 raise chance (`raiseChance`, :798) | no deal or raise in sight; tired | 🔋 < 14 |
| `research` | מעקב אחרי הכלכלה | −3 🔋 | the cycle signal is sharp for 3 paydays (`econ.sharpUntil = month + 2`): noise ±5 instead of ±12, and no lag (§8.3) | early game with no money to act; history mode | history mode or `econ == null` |
| `none` | חודש רגיל | 0 | +3 🔋 at the next payday | — | never |

Implementation notes:
- **Costs.** 🔋 is applied with `clamp(L.energy - cost, 0, 100)`. 😊 goes to `L.happiness`. The `debt` fee goes through `ensureCash`.
- **The "disabled" thresholds** stop the player from driving 🔋 to 0 through focus alone. Plans still can.
- **Option payload shown on the picker:**

  ```js
  {id, label, desc, cost:{energy, happiness, cash}, benefit, notBest, enabled, reason, suggested?}
  ```

  The text fields come from §17.

### 6.3 Life cycle and rules

- **`setFocus(st, id, 0)`** activates for the current month. Allowed only if `L.focus.id === 'none'` and `L.focus.m === st.month` (i.e. not yet chosen this month), or the focus has already rolled to a new month. Then: charge the cost, set `L.focus = {id, m: st.month, …}`, and `L.focusMonths[id]++`.
  - Choosing `none` explicitly is allowed. It **locks** the month (`L.focus.locked = true`).
  - Once set, the focus cannot change until the next payday. Reason: "כבר בחרת מוקד לחודש הזה".
- **`ops`:**
  - Activating `ops` in phase `'roll'` opens the panel right away:

    ```js
    st.pending = { type:'business', mode:'manage', assetId: <oldest lastDecisionMonth>, source:'focus', id: st.nextEventId++, tile:'K', pos: st.pos, month: st.month };
    st.phase = 'event';
    ```

    The pawn does not move, and closing `ok` returns to `'roll'` (`choose`, :1904).
  - If `ops` was activated from the agenda at a payday, it sets `L.focus.opsOpen = true`. The UI shows "לפתוח את לוח העסק" between rolls, and calling `setFocus(st,'ops',0)` again opens the panel once (`opsUsed`).
- **`setFocus(st, id, slot∈{1,2})`** sets `agenda[slot-1] = id` (or `null` for `'none'`). No cost. It is logged even though it is free, because it changes state.
- **Rollover at payday:** inserted in `payday()` after `monthlyWorld` (:753), before `ensureCash` (:754), and only with `R4`:
  1. If the old focus was `none` → +3 🔋.
  2. Pop `agenda[0]` and shift the agenda.
  3. If the popped id is set and enabled, activate it (charge the cost) and push `news {kind:'focus', text:'המוקד לחודש הזה: <label>'}`.
  4. If it is disabled → `focus = none` and push `news {kind:'focus', text:'המוקד שתכננת (<label>) לא יצא לפועל: <reason>'}`.
  5. Otherwise → `focus = {id:'none', m: st.month}` (not locked).
- **`debtDeal`** is read by `loanPct` (§8.5, `focusAdj`). It expires when `st.month > until`.

### 6.4 Where focus shows up
- `metrics().focus = {current:{id,label,m}, locked, opsOpen, agenda:[{slot, id, label}], options:[…§6.2 payload…]}`.
- `payday` and `edu` events: `ev.data.focus` = the same block, so the payday card can host the picker. There are **no `focus:*` card options**: the UI calls `setFocus` (action `F`), so there is one path and one log entry.
- At guide level only, `options[i].suggested = true` on one option, chosen by `focusSuggest(st)` in this order:
  1. 🔋 < 45 → `none`;
  2. `st.credit > 0` → `debt`;
  3. managed business with `canDecide` → `ops`;
  4. a subscription exists → `frugal`;
  5. cash + loan room ≥ the median deal down payment of the world → `scout`;
  6. the signal label changed in the last 2 months → `research`;
  7. else `none`.

---------------------------------------------------------------------------------------------------

## 7. Deal due diligence

### 7.1 Draw and truth model (`js/systems/dd.js`)

- **When:** `createDeal` (:1185) and `createMystery` (:1246) first take `const rs = R4(st) ? DD_DRAWS × next(st.rng,'dd') : null`.
- **What it builds:** if the result is an asset `deal` pending (`dealPending` → `{type:'deal'}`, :1215), set `p.dd = drawDD(rs, card, worldId, {golden, starter})`.
- **Exceptions:** starter deal → `{risk:0, flags:[], f:1, vf:1, repair:0, level:0}`. Golden → risk 0, and the flag `rush` shown as a **good** flag.

Per world (`ddCfg`):

| param | w1 | w2 | w3 | w4 |
|---|---|---|---|---|
| prior P(risk 0..3) | .50 .33 .13 .04 | .35 .35 .20 .10 | .30 .32 .24 .14 | .25 .30 .27 .18 |
| P(k flags \| r), shared | r0: .75 .22 .03 · r1: .45 .45 .10 · r2: .15 .50 .35 · r3: .05 .30 .65 | | | |
| cf factor f ∈ [lo,hi] by r (cf-cards) | r0 .95–1.05 · r1 .82–1.04 · r2 .50–1.00 · r3 **.10**–.80 | (noi table below) | r0 .95–1.05 · r1 .82–1.04 · r2 .50–1.00 · r3 −.40–.80 | same as w3 |
| noi factor (cards with `noi`, w2) | — | r0 .97–1.03 · r1 .90–1.03 · r2 .75–1.00 · r3 .55–.95 | — | — |
| value factor vf (used in net-worth worlds) | r0 .97–1.03 · r1 .92–1.02 · r2 .82–1.00 · r3 .65–.95 (all worlds) | | | |
| repair chance by r | .05 .20 .45 .75 (all worlds) | | | |
| `inspect:2` minimum fee | ₪400 | ₪1,500 | ₪3,000 | ₪3,000 |

How the six draws are used:
- `risk` = inverse CDF of the prior at `riskR`.
- `k` = inverse CDF of P(k | r) at `flagR`. The flags are `k` distinct ids picked from the kind's pool (`FLAG_POOLS`). Selection is `(flagR × 997 + i × 7) mod pool.length`, skipping duplicates, so no extra draw is needed.
- `f = lo + (hi−lo) × cfR`, rounded to 0.01.
- `vf`: the same formula with `valueR`.
- `repair = repairR < chance[r] ? r100(down × (0.1 + 0.4 × repairR / chance[r])) : 0`.
- `jitter = jitterR`.
- **Rented kinds** (`w.kinds[k].rent`) use `FLAG_POOLS.re`; everything else uses `FLAG_POOLS.biz`. w3 adds `FLAG_POOLS.trade`. The pools are in §17.
- **Optional overrides** in world data: `card.dd = {risk}` fixes the risk on that card. Use them sparingly, for example `דירה עם דייר שלא משלם` → risk 3.

### 7.2 Claimed, range and verified numbers

- **Claimed** = the printed card numbers after the cycle's price multiplier (§8.5): `cf` or `noi`, `value`, `cost`. Everything the card shows today is "claimed".
- **Level 1** (range; widths come from public config):

  ```js
  const w = Math.max(50, Math.abs(cfTrue) * 0.3);
  const lo = r10(cfTrue - w * jitter), hi = r10(cfTrue + w * (1 - jitter));
  // value range ±6% the same way; repair bucket: 'none' | 'small' (< 15% of down) | 'big'
  ```

- **Level 2:** exact `cf`, `value` and `repair`.
- **Expected values (public).** `expectFactors(worldId, k)` gives E[f|k], E[vf|k], E[repair/down|k] from the posterior P(r|k) ∝ prior × likelihood. At level 1: the midpoint of the range. At level 2: exact.

`ev.data.dd` (the public block in `DESCRIBE.deal`, :1484):

```js
dd: { level: 0|1|2,
      flags: [{ id:'photos', text:'יש רק תמונות מבחוץ', kind:'warn'|'good' }],
      claimed: { cf, value, label:'לפי המוכר' },
      range:   level>=1 ? { cf:[lo,hi], value:[lo,hi], repair:'none'|'small'|'big' } : null,
      verified: level===2 ? { cf, value, repair } : null,
      basis: 'claimed'|'range'|'verified',
      inspect1: { energy: 4|0, free: scoutActive }, inspect2: { fee, half: scoutActive } }
```

How buy labels change:
- `netLabel` is prefixed with `לפי המוכר:` at level 0, `לפי הבדיקה:` with the range text at level 1, and `נבדק:` at level 2.
- `o.net` (used by guide and the sim) becomes the **expected** net for the current basis.
- `data.cf` / `cfVar` / `cfFix` stay **claimed** at level 0, so the UI can show "claimed", and switch to verified at level 2.

### 7.3 Options

Inserted before the buy options when `R4 && p.dd && best` (i.e. some buy is possible) and the card is not negotiated-out:

| id | label | cost | enabled when | effect |
|---|---|---|---|---|
| `inspect:1` | `לבדוק בעצמי (−4 🔋)` or, with `scout`, `לבדוק בעצמי (חינם החודש)` | 4 🔋 (0 with scout) | `p.dd.level === 0` and 🔋 ≥ 10 (reason "אין לך כוח לבדוק עכשיו") | `level = 1`; `stats.inspections++`. **Non-closing** (`CHOOSE.deal` returns `false`, like a successful negotiation, :2128). |
| `inspect:2` | re: `בדק בית ושמאי (₪X)` · biz: `רואה חשבון בודק את הספרים (₪X)` · ship: `סוקר ימי בודק (₪X)` | fee = max(minFee, r100(1% × cost)), × 0.5 with scout | `level < 2` and `st.cash ≥ fee` (no loan for fees; reason "אין מספיק מזומן לבדיקה") | `level = 2`; cash −fee; `stats.inspectSpent += fee`. **Non-closing.** |

- Negotiation offers stay available after an inspection.
- The flag `rush` ("המוכר ממהר") adds +0.10 to `negChance`. It is a hint that cuts both ways.

### 7.4 Buy applies the truth (`buyAsset`, :1922)

When `R4 && p.dd`:

```js
if (c.noi != null) c.noi = r10(c.noi * dd.f); else c.cf = r10(c.cf * dd.f);   // before addAsset
c.value = Math.round((c.value ?? c.cost) * dd.vf);
// after addAsset:
if (dd.repair) { st.cash -= dd.repair; st.stats.ddRepairs += dd.repair; cashFx(out, -dd.repair, `תיקון ${fmtM(dd.repair)}`);
  out.news.push({kind:'dd', text: level===2 ? `התיקון שהבדיקה מצאה: ${fmtM(dd.repair)}.` : `הפתעה: ${fmtM(dd.repair)} תיקונים שלא ידעת עליהם.`}); }
a.dd = { claimedCf, claimedValue, level: dd.level, repair: dd.repair };
addLuck(st, 'dd', (cfTrue − cfExpected) * 24 + nwWeight × (valueTrue − valueExpected) − (repair − repairExpected));
ensureCash(st, out, 'deal');
```

- The mentor line after the buy adds `מוצהר ${fmtM(claimed)} · בפועל ${fmtM(true)}` whenever the two differ by ≥ ₪10.
- **On pass:** if the player inspected (level ≥ 1) and the true net is ≤ 0 while the claimed net was > 0 → `stats.ddAvoided++`. This feeds a possible achievement. It is **not** told to the player during play, because the truth of a passed deal stays sealed until the end.
- **End screen:** `checkEnd().ddRecap = [{name, claimedCf, cf, repair, level}]` for bought assets, and `ddPassed: n` (count only).

### 7.5 Removing the trap-question leak
- `ev.mentor = c.q || dealAsk` (:1492) becomes:

  ```js
  ev.mentor = (st.mentor === 'guide' && c.q) ? c.q : mentorLine(st, 'dealAsk', {})
  ```

- At `hint` and `pro`, `c.q` is shown after the decision instead: in `CHOOSE.deal`, `out.mentor = c.q + ' ' + out.mentor` when `c.q` exists.
- The same rule applies to `doodad` `c.q`, which are educational rather than leaks. Keep them at all levels.

### 7.6 Every DD action: cost, benefit, NOT-best case

| action | cost | benefit | NOT best when |
|---|---|---|---|
| inspect:1 | 4 🔋 | a range for cf and value, plus a repair bucket | a clearly great deal with 0 flags; a clearly bad claimed number (net ≤ 0); tired |
| inspect:2 | ₪ fee | exact numbers | a cheap deal where the fee is a large share of the down payment; obvious cases; when level 1 already settled it |
| buy without checking | — | saves 🔋 or ₪ | a flagged, borderline deal |

---------------------------------------------------------------------------------------------------

## 8. Economic cycle

### 8.1 Phases and the Markov chain (`js/systems/cycle.js`)

The phase ring is `exp` (צמיחה) → `slow` (האטה) → `rec` (מיתון) → `recov` (התאוששות) → `exp`.

| param | w1 (gentle) | w2 / w3 / w4 |
|---|---|---|
| min length (paydays) exp / slow / rec / recov | 12 / 3 / 3 / 3 | 8 / 3 / 4 / 3 |
| advance probability after the min, exp / slow / rec / recov | .07 / .30 / .40 / .35 | .10 / .30 / .30 / .35 |
| slow → exp ("soft landing") share of advances | .60 | .35 |
| initial phase distribution exp / slow / rec / recov | .70 / .20 / 0 / .10 | .55 / .20 / .10 / .15 |
| effect amplitude (`amp`: multiplies every deviation from 1 in §8.5) | 0.5 | 1.0 (w4 1.1) |

The draws:

```js
// createGame (rules 4, not history), 2 cycle draws:
phase = invCDF(init, r1); m = Math.floor(r2 * minLen[phase]);
// each payday, 2 cycle draws:
if (econ.m + 1 >= minLen[phase] && rT < pAdv[phase])
  phase = (phase === 'slow' && rT < pAdv.slow * soft) ? 'exp' : next(phase), m = 0;
else m++;
```

**Biz shocks on entering a phase** use existing code, with no draws:
- entering `rec`: `BIZ.applyShock(b, {id:'cycle_rec', demand: 1 - 0.12×amp, months: 4})`;
- entering `exp`: `{id:'cycle_exp', demand: 1 + 0.06×amp, months: 6}`.

They apply to all managed businesses, the same way crises do (:2362).

### 8.2 Order inside `payday()` (:706-788)

1. `monthlyLife` (:751), unchanged.
2. `monthlyIndex` (:752). It uses the **current** phase (the month that just passed) for its parameters.
3. `monthlyWorld` (:753).
4. **New** `econStep(st, out)`: 2 draws, the transition, then the signal update (§8.3), the biz shock if the phase changed, `luck.cycle`, and econ news.
5. **New** focus rollover (§6.3).
6. `ensureCash` (:754) and the rest, unchanged.

### 8.3 The public signal

```js
const SCORE = { exp: 80, slow: 52, rec: 20, recov: 42 };
const sharp = econ.sharpUntil >= st.month;
const target = SCORE[sharp ? phaseNow : phaseLastMonth];          // lag 1 month unless research is active
const amp = sharp ? 5 : 12;
signal = clamp(Math.round(0.5 * prev + 0.5 * target + (rN - 0.5) * 2 * amp), 0, 100);
trend = signal - prev > 2 ? 1 : signal - prev < -2 ? -1 : 0;
label = signal >= 62 ? 'צמיחה' : signal <= 32 ? 'מיתון' : trend < 0 ? 'האטה' : trend > 0 ? 'התאוששות' : (prevLabel || 'יציב');
```

- `phaseLastMonth` is the phase before this payday's transition. It is kept as `econ.truth` at index −1.
- **News** `{kind:'econ', text, label, signal}` is sent when the label changes, and on every 3rd payday otherwise. The text is a headline picked deterministically by `(label, st.month % n)` from §17. It contains no numbers that would reveal the truth.

### 8.4 What is public

`econPublic(econ, month)`:

```js
{ signal, label, trend, sharp: econ.sharpUntil >= month, sharpUntil,
  hist: econ.hist.slice(-24),
  official: econ.truth.filter((x) => x.m <= month - 3).slice(-12).map(({m, phase}) => ({ m, label: PHASE_LABEL[phase] })),
  text: 'מד הכלכלה מתעדכן באיחור ועם רעש. הנתון הרשמי מתפרסם אחרי 3 חודשים.' }
```

- `official` is the realistic "the statistics bureau publishes with a delay". The true current phase is **never** in `describe`, `metrics` or `publicView`.
- **At game end:** `checkEnd().econPath = econ.truth` (the full path) plus the signal history, so the review can say "you held cash through the recession".

### 8.5 Multipliers (no draws)

All values below are at amp = 1. Each deviation from 1 is scaled by the world's amp; for example w1 recession dealCost = 1 − 0.14 × 0.5 = 0.93.

| effect | exp | slow | rec | recov | touch point |
|---|---|---|---|---|---|
| deal **cost** (and down, pro rata) at draw; `value` keeps its pre-cycle level | ×1.08 | ×1.00 | ×0.86 | ×0.94 | `dealPending` (:1212): clone, set `card.value = card.value ?? card.cost` first, then scale `cost`/`down` (r100). Starter deal exempt. |
| cf of rented kinds (`kinds[k].rent`) | ×1.02 | ×1.00 | ×0.97 | ×0.99 | `assetCfRaw` (:337), also used for the deal proto, so the card shows today's cf |
| cf of other non-managed kinds (biz-like, ship, factory…) | ×1.05 | ×0.98 | ×0.90 | ×0.97 | `assetCfRaw` |
| bank-loan `loanPct` add (pp/month; **not w2**, whose rate cards drive this) | −0.10 | +0.10 | +0.30 | 0 | `loanPct` (:249): `+ cycAdd(st) + focusAdj(st)`, inside the existing `max(0.1, …)` |
| `loanCap` | ×1.10 | ×1.00 | ×0.70 | ×0.90 | `loanCap` (:253) |
| index fund annual drift (replaces `X.annual` = 0.04) | 0.09 | 0.00 | −0.14 | 0.16 | `monthlyIndex` (:970), with the same 2 `index` draws |
| index crash chance multiplier | ×1 | ×2 | ×1.5 | ×1 | `monthlyIndex` (:970) |
| life card swap (after the `when`/`alt` swap, :1204) | `layoff` → `jobOffer` | — | `jobOffer` → `layoff` | — | `createLife`, no draw; off in w1 |

The stationary-weighted index drift ≈ 0.043/yr, about the same as today's 0.04.

`luck.cycle` is added each payday: Σ over assets of `(cf with cycle − cf neutral)` + `(loanPct with cycle − neutral) × loans / 100`. The cycle's effect on the index is already counted in `luck.index`.

### 8.6 Cycle-path buckets (sim and tests)

`cyclePath(seed, worldId, months)` → `[{m, phase}]`, computed from `makeStreams(seed).cycle` alone. Buckets over the character's `maxMonths`, assigned in this priority order:

| bucket | definition |
|---|---|
| `B3_long` | ≥ 10 recession months, or 2 recessions |
| `B1_early` | a recession starts at month ≤ 18 |
| `B2_late` | a recession starts at month > 18 |
| `B0_calm` | no recession month |

---------------------------------------------------------------------------------------------------

## 9. Impact panel data

### 9.1 API

```js
E.impactFor(st, ref, params?) → Impact | null
// ref = an option id of the pending event ('buy','buyVar','inspect:2','offer:10','start','fix','plan:overtime','sell:3',…)
//     | 'act:loan' | 'act:repay' | 'act:payCredit' | 'act:save:<₪>' | 'focus:<id>'
```

- **Computed on demand, never inside `describe`.** That keeps `describe` cheap for the sim.
- `describe` marks `o.major = true` on options that have an impact. These are options where any of the following holds:
  - `kind ∈ {buy, sell, give, life, plan, installments}`;
  - the id is in `{credit, sub, refi, prepay, start, biz:sell, offer:*, raise, report, inspect:2}`;
  - the card's effects move cash ≥ 0.5 × monthly expenses.
- The UI caches the result per `(event.id, ref)`.

### 9.2 How it is computed (one engine, no parallel formulas)

1. **Shadow clone** `shadowOf(st)`: JSON of `st` without `actions`, `log` and `dq.decisions`.
2. **Sealed values are replaced with public expectations**, so the dry-run cannot leak:
   - `p.dd`: `f`, `vf`, `repair` become the expected values for the current basis (§7.2).
   - `p.negR`: two runs, `0` (accepted) and `0.9999` (refused).
   - `p.raiseR` and life `p.r` for chance options: two runs, success and failure.
   - Nothing else is needed, because `choose` never draws.
3. Run the real `choose` (or the action) on the clone, then compare `metrics(before)` and `metrics(after)`.
4. **Business `start`:** the monthly figure comes from `BIZ.forecast` (no events), as the offer card does today (:1435). The assumption is named.

### 9.3 Schema

```js
Impact = {
  ref, label, basis: 'certain'|'expected'|'branches',
  cashBefore, cashAfter,                       // liquid cash
  fundBefore, fundAfter,                       // st.savings
  cushionMonthsBefore, cushionMonthsAfter,     // (cash + savings) / expenses
  fundMonthsAfter,                             // savings / expenses (★★★ needs 3)
  cfBefore, cfAfter, cfDelta,                  // metrics().cashflow
  passiveDelta, expensesDelta, netWorthDelta, goalProgressDelta,
  newLiabilities: [{ label, amount, monthly }], // loans taken, mortgage, card debt, installment lines
  power:     { before, after, delta, perMonth? },  // 🔋 (perMonth: e.g. owner-run business, workLoad)
  happiness: { before, after, delta },
  time:      { studyMonths?, note? },
  mainRisk:  { key, text },                    // §9.4
  assumptions: [string],                       // §9.5
  scenarios: {
    base: { months: 6, cash, cf, cushionMonths, forcedLoan },
    hard: { months: 6, cash, cf, cushionMonths, forcedLoan, what: [string] },
  } | null,
  branches: [{ p, label, cashAfter, cfAfter, netWorthDelta }] | null,   // offers, raise, counter-offer
  disclaimer: 'זה תרחיש לפי מה שידוע עכשיו — לא תחזית ולא הבטחה.'
}
```

Scenarios are given for deals, business start, loans, refinancing and installments. They are deterministic, with no draws:
- `base.cash = cashAfter + 6 × cfAfter`.
- `hard` stacks three things:
  - one month without salary, using the payslip's net;
  - unverified dd assets at the P10 cf of the posterior (level 1: the range's `lo`);
  - this deal plus the existing portfolio under the recession multipliers of §8.5 (rent ×0.97, other ×0.90, `loanPct` +0.30).

  So `hard.cash = cashAfter + 6 × cfHard − salaryNet`.
- `forcedLoan` = the amount by which `cash + savings` would go negative, rounded up to `autoUnit`.
- `what` lists the hard assumptions in Hebrew (§17).

### 9.4 `mainRisk`

The first risk that applies, in this priority order. These are the same checks as the evaluator (§10.2), so the texts agree:

| key | when | text |
|---|---|---|
| `noCushion` | `cushionMonthsAfter < 1` (§10.2 exception aside) | `אחרי זה תישאר כרית של {x} חודשים. הוצאה לא צפויה אחת — והבנק יחליט בשבילך.` |
| `unverified` | dd level 0 with flags ≥ 1 | `המספרים לא נבדקו, ויש {k} סימני אזהרה.` |
| `dsr` | debt payments > 40% of income after the action | `החזרי החובות יעברו 40% מההכנסה.` |
| `rate` | variable-rate mortgage (w2) | `ריבית משתנה: אם הריבית תעלה ב־1%, התזרים יורד ב־{x}.` |
| `fx` | w3 exposed | `דולר +10% → תזרים {x}.` |
| `concentrated`, `gamble`, `burnout` | as `DQ_WHY` (:1967) | — |
| `none` | — | `אין סיכון בולט מעבר לרגיל.` |

### 9.5 `assumptions`

The texts below cover every case:
- `התזרים לפי מה שהמוכר הצהיר (לא נבדק)` / `לפי טווח הבדיקה` / `לפי בדיקה מקצועית`;
- `הריבית על ההלוואה נשארת {x}% בחודש`;
- `המשכורת והתוכנית החודשית לא משתנות`;
- `בלי שינוי במצב הכלכלה`;
- `תחזית העסק בלי אירועים מיוחדים`.

---------------------------------------------------------------------------------------------------

## 10. Evaluator fixes (`optionU` :1976, `decisionRecord` :2027)

### 10.0 Signature and public context

```js
optionU(ctx, ev, o, params)
// ctx = pubCtx(st), built once per decision:
ctx = { cash, savings, E: expenses, energy, happiness, loans, credit, netWorth, baseNet, goalType, nwWeight,
        study:{done, months, need}, idxPeak, idxPrice, worldId, econ: econPublic(...), loanPct, creditPct }
```

- `nwWeight` = 1 in net-worth worlds and 0.25 in passive worlds.
- `optionU` must not touch `st`.
- `pitchEV` (:1968) takes `(worldId, card)`.
- All §10 changes apply under both rules (they do not touch outcomes).

### 10.1 Negotiation (bug: gameplay.md §3.3, 357 cases)

```js
const buyU   = best enabled buy, U at the current price (same formula as the buy branch, incl. flags);
const buyDisc = same buy with cost/down/debt cut by k% (cf + r10(debtCut × 0.005), as negotiate() does at :2123),
                discount term weighted by nwWeight;
U(offer:k) = chance × max(0, buyDisc) + (1 − chance) × 0      // refused ⇒ the card closes = pass (U 0)
```

So an offer on a deal that stays bad after the discount is worth 0 — no better than pass — and on a good deal it competes honestly with buying outright. The buy branch's `discount` term also gets the `nwWeight`.

### 10.2 One cushion rule

```js
function cushionCheck(ctx, cashDelta, loan, net) {
  const after = (ctx.cash + ctx.savings + cashDelta + loan) / ctx.E;
  const flagged = after < 1 && !(net >= 0.15 * ctx.E && after >= 0.5);
  return { after, flagged };
}
```

It is used by the deal buy branch (replacing :1981 `cashAfter(...) < 1`), by the guide primary (via §5.2, replacing :1537-1541), by `d.warning` and `d.cushionAfter`, and by `impact.mainRisk`. One threshold, one text.

### 10.3 Life branch: energy, study, values

```js
money = cash − monthly × (months || 24) + salary × (months || 24) − 0.35 × (risk || 0);   // friend guarantee: public 35%
money += energy × E × (ctx.energy < 60 ? 0.02 : 0.005);                                      // same as plans (:2008)
if (study) money += LIFE_CFG.studyRaise × baseNet × 24 / study.need × study;                // same as plans (:2009)
```

- **New event flag `values: true`** on `car` and `health` (life.js:120, :147). These are lifestyle trade-offs.
  - Score them in a wide band: all options within **1.5 E** of the best score 100. Others score proportionally, floored at 60 (`ok`). The floor does not apply when flags exist.
  - `why` = `טרייד־אוף של סגנון חיים — אין כאן תשובה אחת`.
  - No primary at any level. The UI shows the values chip, the same way it does for personal events.
- **`course`** (life.js:158) keeps `primary`. With study valued, `take` scores ≥ `skip` whenever `!study.done`, 🔋 ≥ 40 and the cushion is OK. Content R4 found it at 0.
- The edu-tile `course` option uses the same study formula (2 study months), replacing the flat `0.5 × E` at :2013.
- **Guarantee flag:** if `risk > cash + savings`, flag it `noCushion`. A personal event with a flag scores 50 (:2040).

### 10.4 DD-aware deal valuation and value of information

```js
U_buy(f, vf, rep) = ((cfClaim × f − loanMonthly) × 24 + nwWeight × (value × vf − cost) + grow × value × 24 − rep) / E − penalties
```

- **Level 0:** `U_buy = Σ_r P(r|k) · U_buy(E[f|r], E[vf|r], E[rep|r])`.
- **Value of perfect information:** `EVI2 = Σ_r P(r|k)·max(0, U_r) − max(0, U_buy)`.
- **Level 1 share:** `EVI1 = 0.7 × EVI2`.
- **After level 1:** `EVI2' = 0.5·max(0,U(lo)) + 0.5·max(0,U(hi)) − max(0, U(mid))`.
- `U(inspect:1) = max(0, U_buy) + EVI1 − 4 × (energy < 60 ? 0.02 : 0.005)`, and 0 with scout.
- `U(inspect:2) = max(0, U_buy) + EVI(level) − fee / E`.

Inspect options join the deal pool. "Buy without checking" on a flagged borderline deal can then lose points, with the reason `היה עדיף: לבדוק קודם`. The ½-month tolerance (:2039) still protects reasonable choices.

### 10.5 Values for plans, focus and `save`
- Plans are unchanged (compared only with plans, :2034).
- `save` is still a habit (`pool = [o]`).
- Focus: §10.7.

### 10.6 Cycle neutrality

The evaluator never reads the true phase. Hint reasons may cite the **public** signal, for example `מד הכלכלה מראה האטה — כרית גדולה יותר נותנת מרחב`.

### 10.7 Focus scoring (in `setFocus` slot 0)

Focus value depends on future cards, so precise expected values would be fake precision. It is scored with **flags only**:
- `burnout`: 🔋 after activation < 25;
- `noUse`:
  - scout with no cash and no loan room ≥ the median deal down payment;
  - debt with total debt < 20 × fee;
  - network with no raise eligible and fewer than 2 deal or mystery tiles within 12 steps;
  - research in the last 6 months of the game.

No flags → 100 `strong`. One flag → 60 `mixed` with the reason. It is recorded with `type: 'focus'` and the principle `time`.

### 10.8 Reasons (for hints and the review)

`optionU` returns `reasons: [{key, text, w}]`:

| key | text |
|---|---|
| `net` | `לפי מה שידוע: בערך {x} בחודש אחרי עלות ההלוואה` |
| `cushion` | `אחרי זה תישאר כרית של {x} חודשים` |
| `flags` | `יש {k} סימני אזהרה — בדיקה יכולה לשנות את ההחלטה` |
| `evi` | `העסקה גבולית: בדיקה שווה יותר ממה שהיא עולה` |
| `price` | `המחיר {מתחת/מעל} השווי ב־{x}` |
| `debt` | `הלוואה ב־{x}% בחודש` |
| `energy` | `{±x} 🔋 — {חשוב/פחות חשוב} כשאתה {עייף/רענן}` |
| `study` | `מקרב את סוף הלימודים (+20% ברוטו בסוף)` |
| `signal` | `מד הכלכלה: {label}` |
| `risk` | `סיכוי {p}% לאבד {x}` |

The top 2 by `|w|` are used. No reason ever quotes a sealed value.

---------------------------------------------------------------------------------------------------

## 11. Dominated options and verdict wording

### 11.1 Options (rules 4 unless noted)

| # | option | problem | change | where it is still best / NOT best |
|---|---|---|---|---|
| 1 | doodad `credit` vs `inst3` | `inst3` strictly dominates (gameplay.md §3.2 #3) | `inst3` is offered only when `creditScore ≥ 600` (the store's check). **`credit` is hidden whenever `inst3` is shown.** | `credit` is offered only with a low score and a short bridge: it avoids a forced loan's −25 credit hit. It is not best when the debt will roll for months. |
| 2 | tax `report` | always better (§3.2 #6) | **side-report fee**: new world field `sideReportFee` (₪/month: w1 120, w2 200, w3 250, w4 250). It is charged at payday while `L.sideReport && sideAct > 0` (engine.js:726-729) and shown in the option label `(עלות רו״ח {fee} בחודש)`. | best with large side income; not best with tiny side income (the fee is more than the 10% penalty) |
| 3 | payday plan via `suggestPlan` | primary = answer | no primary at hint/pro (§5) | — |
| 4 | FX hedge, bank refi, upgrade, pitch, giving primaries | the primary leaks the answer | hint/pro: none | existing trade-offs stay |
| 5 | business `biz:suggest` "ההמלצה:" | label = verdict | neutral label at hint/pro (§5.1) | — |
| 6 | life `car` `fix` primary / `bus` money-optimal | contradiction (content §2.4) | values band, no primary (§10.3) | — |
| 7 | `save` | never highlighted, but needed for ★★★ | still never primary (it is a habit). Hint reasons mention it on payday cards when the fund is < 3 months: `שווה לבדוק גם: קרן החירום ({x}/3 חודשים)`. | — |

**Dominance gate (sim, §13 A7).** A non-closing option, or an alternative on a ≥ 2-option card, that has the top U in > 85% of its appearances gets flagged.
- Allowlist: `save` (habit) and `skip` on wants. Wants keep "skip is usually right" on purpose; that is the lesson.
- If `credit` still flags after change 1, **delete it** from doodads and keep the `credit_card_debt` lesson on the quiz.

### 11.2 Verdict wording

`VERDICT_WORDS = /ההמלצה|משתלמ|מומלץ|הבחירה הנכונה|כדאי לך/`. At hint/pro:
- `roiVsLoan` (:1532-1534) becomes numbers only;
- `biz:suggest` gets the neutral label;
- the business card mentor (:1447) uses the new `bizAsk` line in place of `o.suggest.why[0]`;
- deal `c.q` moves to after the decision (§7.5).

Test §14 T10 scans every `label`, `mentor`, `text` and `data.roiVsLoan` of every event, over random games at hint and pro. Post-decision feedback (`out.decision.why`, `DQ_WHY.best`) is allowed.

---------------------------------------------------------------------------------------------------

## 12. Public view and info-leak rules

### 12.1 Sealed (never in `describe`, `metrics`, `publicView`, hints or impact)
- `st.rng.*`, `st.decks`, `st.bizRng`
- `p.negR`, `p.r`, `p.raiseR`, `L.raiseR`, `L.sideSeed`
- `p.hidden` (pitch), `st.world.coin.path`
- `p.dd.{risk, f, vf, repair, jitter}`. The range is revealed after level 1, the exact values after level 2.
- `st.econ.phase`, and `st.econ.truth` newer than month − 3
- angel `mult`/`ev` until revealed

**Existing leak noted, out of T2 scope.** `metrics().life.inflationYear` (shown at ui.js:253, :270, :294) is next year's pre-drawn inflation. `publicView` replaces it with `inflationLastYear` (`L.infl.at(-1) ?? null`). The UI change belongs to the NL-07 copy pass; it is listed in §16.2.

### 12.2 `publicView(st, {freeze = true} = {})` (new export)

```js
{ v, worldId, charId, mode, mentor, rules, month, maxMonths, turn, phase,
  metrics: { ...metrics(st), life: { ...m.life, inflationYear: undefined, inflationLastYear } },
  event: currentEvent(st),            // describe output: already public by construction
  econ: econPublic(st.econ, st.month) | null,
  focus: metrics(st).focus, hintsUsed: st.dq.hints }
```

- It is deep-frozen when `freeze` is true (tests).
- The sim may pass `freeze:false` for speed.
- New sim policies (§13) decide **only** from `publicView` plus static world and `js/systems` tables.
- T6 rivals will use the same function, scoped to a listing.

---------------------------------------------------------------------------------------------------

## 13. Sim policies and acceptance matrix (`tools/sim.mjs`)

### 13.1 Mechanics
- `play(...)` gains `opts.mentor`, taken from the policy's `mentor` property (default `'hint'`).
- New policies read `E.publicView(st, {freeze:false})`. Quiz handling stays the same.
- Loop guard: non-closing options (`inspect:*`, `offer:*`, trade buy/sell) count against `ctx.n`. At `n ≥ 3`, pick the first of `['done','pass','ok']`.

### 13.2 Policies to add or change

| name | mentor | definition |
|---|---|---|
| `guideTapper` (rename of `tapper`) | guide | taps `primary`; on a payday card it also taps the `suggested` focus; personal and values events: random enabled |
| `blindTapper` | hint | uniform random among enabled options (trade: `done`); never requests hints; no between-roll actions. This is the literal highlight-free tapper. |
| `naive` | hint | buys whenever the claimed net > 0 and it can pay or borrow; never inspects or negotiates; skips wants; plan `work`; no fund, no focus, never repays. Life: cheapest option. |
| `smart` | hint | today's `greedyLike(smart)` plus: `ddFlagged` (§13.3), `adaptiveFocus` (§13.3), the expected net (posterior) instead of the claimed one; ignores the cycle |
| `adaptive` | hint | `smart` plus the cycle signal. Label `מיתון`/`האטה`: keep a 2-month cushion, no new loans for buys, buy discounted deals with cash, `research` focus when the signal is mid. Label `צמיחה`: buffer 0.6, leverage allowed when net > 0. |
| `cautious`, `greedy`, `reckless`, `random` | hint | existing ones; `greedy` and `reckless` use the claimed net |
| archetypes `saver`, `founder`, `diversified`, `gambler` | hint | as gameplay.md §7d, playing as the player. Same code that T6 rivals will reuse: export them from `tools/policies.mjs`. |
| focus variants `f:none`, `f:<id>` (each of the six), `f:adaptive` | hint | `smart` with the focus rule replaced: always `<id>` (agenda filled), or never |
| DD variants `dd:never`, `dd:always`, `dd:flagged`, `dd:borderline` | hint | `smart` with the inspect rule replaced. `always`: L1 and L2 on every buyable deal. `flagged`: L1 when flags ≥ 1 and claimed net > 0; L2 when the L1 range straddles the buy threshold. `borderline`: L1 when 0 < expected net < 0.3 E, regardless of flags. |

### 13.3 Shared helpers (`tools/policies.mjs`)
- `expectedNet(pv, ev)` uses `dd.js expectFactors`.
- `adaptiveFocus(pv)`, in order:
  1. 🔋 < 45 → none;
  2. credit > 0 → debt;
  3. a business with canDecide → ops;
  4. subscription or (happiness ≥ 64 and months left ≥ 18) → frugal;
  5. cash + loan room ≥ the median down payment → scout;
  6. label changed in the last 2 months → research;
  7. else none.

  The agenda is always filled for the next 2 months with the same logic, using projected 🔋.

### 13.4 Modes
- `node tools/sim.mjs N [w]`: as today, with the new policy set.
- `--matrix [N=100]`:
  - the full matrix for policies × worlds × characters;
  - each game is tagged with its cycle bucket (`E.cyclePath`, §8.6);
  - writes `tools/balance-t2.md` and `tools/balance-t2.json`;
  - runs one process per world (`--matrix w2` and so on). Budget about 15 min in total on the 2-core box.
- `--dominance [N=40]`: plays `smart` and records `E.scoreOptions` for every scored event. Reports, per card type and option, the share where the option was top.
- `--ablate`: adds `noCycle` and `noDD` (via `_dev`) and `f:none` to the existing variants.

### 13.5 Acceptance matrix

N = 100 seeds per (world × character × policy). "In time" = escaped within the character's `maxMonths`, in free mode capped at 1.6×. Seeds are fixed (sim.mjs:350 formula). Cells = world × character × cycle bucket, and only cells with ≥ 15 games count.

| # | gate | threshold |
|---|---|---|
| A1 | `guideTapper` in time, every world (all characters pooled) | ≥ 65%, and no single character < 50% |
| A2 | `blindTapper` in time, every world | ≤ 30% |
| A2b | `naive` in time, every world (the real difficulty test) | ≤ 40% target. If tuning cannot reach it without breaking A1 or A3, stop and report the numbers to the director. |
| A3 | `smart` **and** `adaptive` in time, every world | 55–75% |
| A4 | no policy best (highest in-time %, tie-break median months) in > 60% of cells; set = {guideTapper, naive, cautious, greedy, smart, adaptive, saver, founder, diversified, gambler} | ≤ 60% for each |
| A5 | each focus `f:<id>`: best single-focus variant (vs the other `f:*` and `f:none`) in ≥ 1 cell, **and** worse than `f:none` in ≥ 1 cell (by ≥ 3 points in time or ≥ 2 median months) | all 6 |
| A6 | `dd:flagged` beats `dd:never` and `dd:always` on in-time % and median months | pooled, and in ≥ 3 of 4 worlds |
| A6b | `dd:always` worse than `dd:never` in ≥ 1 world | desirable (report) |
| A7 | dominance scan: no option top in > 85% of appearances, except the allowlist | none flagged |
| A8 | ramp: smart in time w2 ≥ w3 − 5 and w3 ≥ w4 − 5; guideTapper w1 ≥ every other world − 5 | holds |
| A9 | ablation: turning off cycle, DD or focus changes smart in-time by ≥ 3 points in ≥ 1 world | each system |
| A10 | performance (node, mid-game state): `describe` p95 < 2 ms; `impactFor` p95 < 8 ms; sim games/sec ≥ 75% of the pre-T2 baseline (same N, same machine) | holds |

**Tuning knobs, in this order:**
1. dd cf ranges and priors;
2. cycle amp and the recession cf and cap multipliers;
3. the `inspect:2` fee;
4. focus costs;
5. `optionU` weights (they move guide and hint together).

Never tune by adding special-case primaries. Record the final numbers in `tools/balance-t2.md`, and in ENGINE.md "Changes v4".

---------------------------------------------------------------------------------------------------

## 14. Unit tests

New file `tests/t2.test.mjs` plus updates to the existing files. Fixtures for T6 and T7 are generated **before** any engine edit by a new script `tools/make-v3-fixtures.mjs`, which writes to `tests/fixtures/`.

| id | test |
|---|---|
| T1 | `STREAMS` equals the 14-name list (§2). `makeStreams(seed)` values for indexes 0–9 equal a v3 fixture for 20 seeds. |
| T2 | Fixed draws: two runs of the same seed with different decisions (inspect / never, focus scout / none, hint / no hint, offers / none) have identical `st.rng.dd` and `st.rng.cycle` after every `landing` and every payday. The dd stream advances by exactly 6 per deal or mystery landing; the cycle stream by 2 at creation and 2 per payday. |
| T3 | Determinism with new codes: same seed + different F/H/M/inspect decisions ⇒ identical dice, cards, `p.dd` truths and `econ.truth` path (extends engine.test.mjs:44). |
| T4 | Replay: `tests/lib/random-player.mjs` extended with `setFocus` (random id or slot, 5%), `requestHint` (5%), inspect options (they are already options), and `setMentorLevel` in free mode (1%). `replay(replayConfig(st), st.actions)` is byte-identical in every world, ranked + free + history (extends :550). |
| T5 | Config: `replayConfig` has `mentor` and `rules`. Ranked forces `hint`; tutorial forces `guide`. `setMentorLevel` in ranked → `ok:false` and nothing logged. `setFocus` with rules 3 → `ok:false`. |
| T6 | Migration v3→v4 from fixtures (roll phase; mid-deal pending; mid-trade window; ranked daily; history): `v === 4`; old streams unchanged; new streams = `makeStreams(seed)` values; every default present; ranked → `rules 3` and free → `rules 4`; a legacy pending deal has no inspect options; 60 more turns play without throwing. v2 (`v === 1`) chains to v4. `v: 5`, `v: 2` and junk → `save_incompatible` (updates :98, :576). |
| T7 | Legacy equivalence: 50 seeds × 4 worlds × the random player at `rules: 3` match the v3 golden fixture on `checkEnd` (status, months, netWorth, passive, expenses, stars) and on the final cash, loans and asset list. |
| T8 | No info leak: (a) `publicView` is deep-frozen and a recursive key scan finds none of: `negR`, `raiseR`, `sideSeed`, `rng`, `decks`, `bizRng`, `hidden`, `path`, `truth`, `phase`, `jitter`, `inflationYear`. (b) **Scramble test:** for 300 random mid-game states, scrambling every sealed field (§12.1) leaves `describe`, `scoreOptions`, `requestHint().hint` and `impactFor` (all major options) byte-identical. (c) `optionU` throws if handed `st` (assert on a Proxy that traps `rng`/`pending`). |
| T9 | Impact matches the engine: over 300 random states, for every major option with `basis:'certain'`, `cashAfter`, `cfAfter`, loans, savings, 🔋, 😊 and `netWorthDelta` equal a real `choose` on a clone. For dd options at level 0/1, they equal a dry-run with truth := expectation. `hard.cash ≤ base.cash`. Offer branches: `p` sums to 1, and the accepted branch equals choose-with-accept. `disclaimer` is present. |
| T10 | Mentor levels: over 200 random games per level, `guide` has exactly 1 primary on every non-personal, non-values event with ≥ 2 enabled options; `hint`/`pro` have 0 primaries on every event; no event at hint/pro has a field `suggested`; `VERDICT_WORDS` never matches. `requestHint`: pro → `ok:false` and not logged; hint → an enabled option id, counted once per event, one `['H']`. `pro` withholds `out.decision`. |
| T11 | Evaluator: a negative-net deal → `U(offer:*) ≤ U(pass)`. `cushionCheck` is one function used by primary, optionU and impact (spy). health private/public both ≥ 60 for every character of every world. Car never `costly`. Course `take` ≥ `skip` when not studied and 🔋 ≥ 40. A guarantee with risk > cash + savings → score 50. Values events have no primary. Personal events are never `costly`. The guide primary equals the argmax of `scoreOptions`. |
| T12 | Dominated options: `inst3` shown ⇒ `credit` absent; score < 600 ⇒ `inst3` absent and `credit` present. The report fee is charged monthly only while reporting with side income. The dominance scan on 20 games finds nothing outside the allowlist. |
| T13 | DD mechanics: inspect:1 costs 4 🔋 (0 with scout) and gives a range that contains the truth; inspect:2 costs the fee (half with scout) and shows exact values; the card stays open; buying sets the asset cf to `r10(claimed × f)` and charges the repair; `luck.dd` = actual − expected; golden and starter are risk 0; trap `c.q` appears before the decision only at guide. |
| T14 | Cycle: min lengths hold; w1 never starts in `rec`; signal in 0..100; `official` lag ≥ 3; with research active, the mean `|signal − SCORE[phase]|` is lower (1,000 paydays); deal cost multiplier applied at draw; `loanPct` and `loanCap` multipliers; index annual from the table; `econ === null` in history and rules 3; `cyclePath(seed, w, n)` equals the engine's `econ.truth`. |
| T15 | Focus: cost charged on activation; one activation per month; agenda pops at payday and reports disabled entries; disabled reasons; `ops` opens a business pending without moving any stream; `debt` consolidates the card and lowers `loanPct` for 6 months; `frugal` cuts each line once and lowers the setpoint (capped at −4); `network` adds +0.10 to negotiation and raise chances; `none` gives +3 🔋. |
| T16 | Updates to existing tests: engine.test.mjs:807 ("primary-follower ≥ 70" → guide only, plus blind ≪ guide); :824 (installments vs revolving credit under the new rule); `determinism.test.mjs` passes unchanged (it scans `js/systems/*` automatically). |
| T17 | `tests/verify.test.mjs`: `CODES` accepts F/H/M; `configFor` returns `mentor:'hint'` and `rulesFor`-based rules; a rules-3 ranked log replays and verifies; an `M` entry in a ranked log → `replay:` error. |

---------------------------------------------------------------------------------------------------

## 15. UI requirements (for the UI implementation agent)

**General rule.** `ui.js` and `game.js` consume engine data only. No finance arithmetic: every ₪, month, % and 🔋 value comes from `ev`, `metrics()`, `impactFor()` or `requestHint()`. Format with the engine's `fmtM`/`sgn`. RTL throughout, and numbers in `<bdi>`. **No timers** on any decision card.

1. **Mentor level picker**
   - Lobby, before a free or history game: three cards from `MN.LEVEL_TEXT` (§17). The default is preselected (w1 מתחיל, otherwise מתקדם). Pass it as `createGame({mentor})`.
   - Ranked: show a locked "מתקדם" with the note `בדירוג כולם משחקים באותה רמה. מספר הרמזים מופיע בטבלה.`
   - In-game settings (free and history only): change it with `E.setMentorLevel`, behind a confirm dialog. Show `metrics().mentor.label` in the HUD menu.
2. **Highlighting**
   - Read `o.primary` only; it is false at hint/pro.
   - At hint/pro the first keyboard focus goes to the card title (`#evTitle`, `tabindex=-1`), not to an option. Enter must not act until an option is focused. Fix `focusPrimary` (ui.js:568-571) and `modal` (:111) for event cards.
   - Remove the "הבחירה של המנטור" tag (ui.js:641) unless `o.primary`. Show the plan `rec` tag (:628-629) only when `o.primary`.
   - Values events: show the chip `טרייד־אוף — אין כאן תשובה אחת` when `ev.data.values`.
3. **Deal card (DD)**, in `BODY.deal` (ui.js:723-749):
   - Under the title, a flag chip row from `ev.data.dd.flags`: ⚠ amber for `warn`, ✓ green for `good`.
   - The cf row shows `claimed.label` with a "לא נבדק" badge (level 0), the range `₪X עד ₪Y` (level 1) or "נבדק ✓" (level 2). Do the same for value in net-worth worlds.
   - The repair line (level ≥ 1): `תיקונים צפויים: אין / קטנים / גדולים`, or the exact ₪.
   - An inspection row above the action buttons, built from the `inspect:*` options: `🔍 לבדוק בעצמי · −4 🔋` and `🧾 <label>`. Show "חינם החודש" or "½ מחיר" when `dd.inspect1.free` / `dd.inspect2.half`.
   - Choosing an inspect option re-renders the same card (`ctl.update`), exactly like a successful negotiation.
   - Buy buttons keep `netLabel`. It already carries the basis prefix.
   - After a buy: show `out.news` of kind `dd` as a toast, and the mentor line, which carries "מוצהר · בפועל".
4. **Focus picker**
   - HUD chip `🎯 <metrics().focus.current.label>` next to the plan chip (game.js:447-459 has the pattern). Tap opens a sheet.
   - The sheet has 7 tiles from `metrics().focus.options`: icon, label, cost chips (🔋/😊/₪), one benefit line, one line `לא כדאי כש…` (`notBest`), and a disabled state with its `reason`.
   - Guide only: a `suggested` tile gets the tag `המנטור ממליץ`.
   - Current month: if it is not locked, tapping calls `E.setFocus(id, 0)`; once locked, it shows `נבחר לחודש הזה`.
   - Agenda: 2 slots, `בחודש הבא` and `בעוד חודשיים`. Tapping a slot and then a tile calls `E.setFocus(id, slot)`; `ללא` clears it.
   - The payday card (`BODY.payday`, ui.js:705) hosts the same picker under the plans, from `ev.data.focus`.
   - If `metrics().focus.opsOpen`, a between-roll button `🏪 לפתוח את לוח העסק` calls `E.setFocus('ops', 0)` and renders the returned `event`.
   - `news` kind `focus` appears as a toast.
5. **Hint button** (hint level, and also guide)
   - On every decision card where `metrics().mentor.canHint`: `💡 רמז` plus the counter `רמזים: N`.
   - Tap calls `E.requestHint`. Show the hint panel:
     - outline the suggested option with a dashed `רמז` badge, never the `primary` class;
     - the 2 reasons;
     - the note `רמז לפי מה שידוע עכשיו — לא הבטחה`.
   - When `optionId === null`, show the reasons as "trade-offs".
   - Hidden at pro.
6. **Cycle gauge**
   - HUD widget from `metrics().econ`: a semicircle 0–100 with a needle at `signal`, `label` plus a trend arrow, and a sparkline of `hist`.
   - Tooltip: `econ.text`. Line `נתון רשמי (לפני 3 חודשים): <official.at(-1).label>`.
   - When `sharp`: the badge `מדויק יותר עד חודש <sharpUntil>`.
   - `news` kind `econ` appears as a headline toast.
   - **Never** show a phase name that does not come from `label` or `official`.
7. **Impact panel**
   - For options with `o.major`: a `מה זה עושה לי?` expander. Guide: auto-open for the primary option. Hint/pro: collapsed.
   - On open, call `E.impactFor(ref)` and cache it per event id.
   - Layout:
     - before → after rows: מזומן, קרן חירום (חודשים), כרית (חודשים), תזרים חודשי, חובות חדשים (list), 🔋, 😊;
     - `הסיכון העיקרי: <mainRisk.text>`;
     - `הנחות` bullets;
     - two columns `תרחיש רגיל / תרחיש קשה (6 חודשים)` with cash, cf and cushion, plus `forcedLoan` as `הבנק ייתן הלוואה של ₪X` when it is > 0, and the `what` bullets;
     - the `disclaimer` line, always.
   - For `branches`: two rows with the probability bar (reuse the negotiation bar styles, ui.js:644-650).
   - HUD actions (loan, repay, fund) show the same panel through `act:*` refs before confirming.
8. **Verdict pill.** Show it only when `out.decision` is present (game.js:672). The engine withholds it at pro, so no UI condition is needed beyond the existing check.
9. **End screen**
   - A `ניתוח` tab from `result.learning`: decision quality; luck parts including `dd` and `cycle`; the decision list (`review`: pro shows all of it, others the top 5); "עם רמז / בלי רמז"; level changes.
   - From `result.econPath`: a timeline with the true phases and the signal line, labelled `עכשיו אפשר לראות מה באמת היה`.
   - From `result.ddRecap`: a table of claimed vs actual numbers.
10. **Strings.** Every Hebrew string shown here comes from the engine, except these static UI labels: `מה זה עושה לי?`, `רמז`, `רמזים:`, `מוקד`, `בחודש הבא`, `בעוד חודשיים`, `ללא`, `ניתוח`, `תרחיש רגיל`, `תרחיש קשה (6 חודשים)`, `הנחות`, `הסיכון העיקרי`, `לפני`, `אחרי`.
11. **Accessibility**
    - Flags and verdicts never rely on colour alone: icon plus text.
    - The impact panel is a `<details>` element with a summary.
    - The hint panel is `aria-live=polite`.
    - The gauge has an `aria-label` of `מד הכלכלה: <label>, <signal> מתוך 100`.

---------------------------------------------------------------------------------------------------

## 16. Work order, risks, rollback

### 16.1 Work order (each step leaves all tests green)

| step | work |
|---|---|
| P0 | `tools/make-v3-fixtures.mjs`: v3 saves and golden results. **Before** any engine edit. |
| P1 | Rules gate, streams, SAVE v4 and `migrateV3`, the `mentor` and `rules` cfg fields, the `F`/`H`/`M` replay stubs, the verifier diff, `publicView` skeleton. Tests T1, T5, T6, T7, T17. |
| P2 | `pubCtx` refactor, evaluator fixes (§10.1–10.3, 10.8), `scoreOptions`, mentor levels and wording (§5, §11.2), dominated options (§11.1). Tests T10, T11, T12, T16. |
| P3 | Due diligence (§7). Tests T2, T13, partial T8. |
| P4 | Cycle (§8). Test T14. |
| P5 | Focus (§6). Test T15. |
| P6 | Impact (§9). Tests T9, full T8. |
| P7 | Sim policies, `--matrix`, `--dominance`, tuning to §13.5. Then ENGINE.md "Changes v4" and `tools/balance-t2.md`. |
| P8 | Re-pin the edge bundle (release only, after director and owner approval). |

### 16.2 Risks

| risk | mitigation |
|---|---|
| Too hard or too random; frustration | Gates A1 (guide ≥ 65%) and A3 (smart ≥ 55%). w1 is gentle (guide default, amp 0.5, mild DD priors, no life swaps). Knob order in §13.5. Luck is separated on the end screen (dd, cycle). |
| Ranked games broken at release (in-flight saves, verifier mismatch) | `rules: 3` for migrated ranked saves plus `rulesFor` in the verifier. Release at a day and week boundary. T7 and T17. |
| Save loss | Chained migration, fixtures (T6). NL-03 adds the backup before migration. |
| Info leak (truth visible through describe, hints or impact) | Sealed-field list (§12.1), shadow clone with expectations (§9.2), scramble test (T8). Note: a cheater can still read `st` in devtools, as with `negR` today. Accepted. |
| Phone performance | `impactFor` on demand only, cached per event. `publicView` without freezing in production paths. Gate A10. |
| Complexity creep or text overload | No streaks, no focus card options, multipliers only for the cycle. The UI shows one benefit and one "not best when" line per focus. |
| Evaluator changes move dq scores | dq is not part of verification or leaderboards. Documented in "Changes v4". |
| Other tasks also need save fields or streams (NL-03, NL-08 chains, T6) | Stream order is reserved (§2). If they ship in the same release they extend `migrateV3`; otherwise they bump to v5 with `migrateV4`. |
| `inflationYear` leak (pre-existing) | Excluded from `publicView`. A UI follow-up is recorded for NL-07: show last year's inflation, or a labelled forecast with noise. |
| Naive-policy target (A2b) unreachable | Escalate with numbers. Do not distort guide or smart to hit it. |

### 16.3 Rollback

| level | how | when |
|---|---|---|
| 1. Soft | `createGame` default `rules: 3`. All T2 outcome systems switch off: no dd, no cycle, no focus, old option sets. Mentor levels and evaluator fixes stay; they do not affect outcomes. Re-pin the bundle and redeploy Pages. Saves stay v4. | a balance emergency |
| 2. Partial | `_dev`-style per-system kill switches promoted to world config. Options: `cycleCfg(worldId).amp = 0` (cycle neutral, draws still consumed), dd priors set to all-risk-0 (inspections pointless but harmless), focus hidden from the UI. | one system misbehaves |
| 3. Hard | revert the branch merge. v4 saves would then fail on the old engine → `save_incompatible` toast. Ranked rows created under v4 cannot be verified by the old pin. | last resort |

---------------------------------------------------------------------------------------------------

## 17. Hebrew copy table (engine strings; natural, short)

**Mentor levels (`MN.LEVEL_TEXT`)**

| id | label | description |
|---|---|---|
| guide | מתחיל | המנטור מסמן אפשרות ומסביר למה. טוב לעולם הראשון. |
| hint | מתקדם | אין כפתור מסומן. אפשר לבקש רמז — והרמזים נספרים. |
| pro | מומחה | בלי סימונים ובלי רמזים. ניתוח מלא של כל ההחלטות בסוף. |

**Focus (`FOCUS`)**

| id | label | desc | benefit | notBest |
|---|---|---|---|---|
| scout | חיפוש עסקאות | בודקים הזדמנויות לעומק. | בדיקה בסיסית חינם החודש, בדיקה מקצועית בחצי מחיר. | לא כדאי כשאין כסף או הלוואה לקנות, או כשאתה עייף. |
| debt | סדר בחובות | מאחדים חובות ומתמקחים עם הבנק. | חוב האשראי עובר להלוואה, והריבית יורדת לחצי שנה. | לא כדאי כשהחוב קטן — העמלה גדולה מהחיסכון. |
| ops | יום עבודה על העסק | נכנסים לעומק המספרים של העסק. | פותחים את לוח העסק עכשיו, בלי לחכות למשבצת. | לא כדאי אם החלטת על העסק לפני פחות משלושה חודשים. |
| frugal | ביקורת הוצאות | עוברים על כל ההוצאות. | מבטלים מנוי או חותכים הוצאה אחת — לתמיד. | לא כדאי כשהאושר כבר נמוך: קשה יותר להגיע ל־★★★. |
| network | קשרים | פגישות, קפה, טלפונים. | יותר סיכוי במשא ומתן ובבקשת העלאה החודש. | לא כדאי כשאין עסקה או העלאה באופק. |
| research | מעקב אחרי הכלכלה | קוראים נתונים ודוחות. | מד הכלכלה מדויק יותר ל־3 חודשים. | לא כדאי כשאין לך עדיין כסף לפעול לפי זה. |
| none | חודש רגיל | בלי מוקד מיוחד. | +3 🔋 בסוף החודש. | — |

**Focus disabled reasons**
- `אין לך מספיק כוח החודש`
- `כבר בחרת מוקד לחודש הזה`
- `אין לך עסק לנהל`
- `החלטת על העסק לפני פחות מ־3 חודשים`
- `אין חובות לסדר`
- `אין מה לקצץ — כל ההוצאות כבר נבדקו`
- `במכונת הזמן הכלכלה אמיתית — אין מה לחזות`

**DD flags (`FLAG_POOLS`)**

| pool | flags (id: text) |
|---|---|
| `re` | `rush`: המוכר ממהר למכור · `photos`: יש רק תמונות מבחוץ · `noLease`: השכירות "צפויה" — אין חוזה חתום · `build`: השכנים מדברים על בנייה ליד · `old`: בניין ישן, ועד בית לא פעיל · `empty`: הדירה עמדה ריקה חצי שנה |
| `biz` | `rush`: המוכר ממהר למכור · `books`: הספרים "אצל רואה החשבון" · `cash`: רוב העסקאות במזומן · `oneClient`: לקוח אחד מביא חצי מההכנסות · `staff`: העובד הוותיק עוזב עם המוכר · `lease`: חוזה השכירות נגמר בעוד שנה |
| `trade` (w3 extra) | `freight`: חוזה ההובלה עוד לא חתום · `supplier`: הספק בחו״ל החליף בעלים |
| golden good flag | `rush` (kind `good`): היורשים רוצים לסגור מהר — המחיר נמוך |

**DD and buy texts**
- `לפי המוכר`
- `לפי הבדיקה: {lo} עד {hi}`
- `נבדק`
- `לא נבדק`
- `תיקונים צפויים: אין / קטנים / גדולים`
- `מוצהר {x} · בפועל {y}`
- `הפתעה: {x} תיקונים שלא ידעת עליהם.`
- `התיקון שהבדיקה מצאה: {x}.`

**Cycle labels and headlines (rotated by month)**

| label | headlines |
|---|---|
| צמיחה | «החנויות מלאות, הבנקים מחלקים הלוואות בקלות.» · «כולם מחפשים עובדים. גם המחירים עולים.» |
| האטה | «פחות קונים בקניונים. העיתונים מדברים על "האטה".» · «הבנקים מתחילים לבדוק הלוואות בזכוכית מגדלת.» |
| מיתון | «פיטורים במפעלים, והבנקים סוגרים את הברז.» · «מחירי הנכסים יורדים — מי שיש לו מזומן מסתכל סביב.» |
| התאוששות | «לאט לאט: עוד הזמנות, עוד משרות.» · «המדד עולה, והאופטימיות חוזרת בזהירות.» |

**Gauge text:** `מד הכלכלה מתעדכן באיחור ועם רעש. הנתון הרשמי מתפרסם אחרי 3 חודשים.`

**Impact `hard.what`**
- `חודש אחד בלי משכורת`
- `הנכס מכניס פחות ממה שהוצהר`
- `מיתון: שכר דירה −3%, עסקים −10%, ריבית +0.3%`

**Disclaimer:** `זה תרחיש לפי מה שידוע עכשיו — לא תחזית ולא הבטחה.`

**New mentor lines (common.js)**
- `bizAsk`: `מה הכי חשוב לעסק עכשיו: מחיר, אנשים, שיווק — או כמה כסף אתה מושך ממנו?`
- `focusAsk`: `על מה תשים את הראש החודש? זמן וכוח הם תקציב — כמו כסף.`

---------------------------------------------------------------------------------------------------

## Implementation notes (engine lane, 2026-11-21)

**Done as specified:** rules gate (`st.rules`, rules 3 proven equal to v3 on the 200-game golden fixture — `tests/t2.test.mjs` T7, replayed logs and the same player live), streams dd/cycle/rival/listing appended, save v4 with `migrateV2 → migrateV3` and ONE idempotent `v4Defaults(st)` run on every load (the extension point for T3/T4/T6), actions F/H/M in `replay` and `verify_core.js` (`RULES4_FROM = '2026-12-01'`, `rulesFor(row)`; `index.ts` selects `daily_key`, `weekly_start` = `to_date(weekly_key, 'IYYY-"W"IW')`, `challenge_day`), mentor levels, focus, DD, cycle, impact, publicView, evaluator fixes, dominated options, sim policies and `--matrix/--dominance/--perf/--report`. Numbers: `tools/balance-report.md`.

**Deviations (each deliberate):**
1. Evaluator weights tuned (§13.5 knob 5): 🔋 and 😊 are valued concavely (marginal 🔋 0.035/0.018/0.012/0.004 months per point below 30/55/80/above; 😊 0.06/0.04/0.015/0.005 below 50/65/80/above; a toy's joy ×0.4 — it is glow), cashflow horizon 36 months in passive-income worlds (24 in net-worth worlds), owner-run business start costs `ownerEnergy × 12 × 0.012` months and uses the one cushion rule, a refused offer costs ½ of the lost deal's value, selling an income asset in a passive world is weighed against 80 months of its cashflow. Without these the guide highlight rested half the game, sold income assets and opened loan-financed businesses (guideTapper w1 26/48 → 37/48 on the same seeds).
2. Guide primary ties (within 0.1): closing options, then the card's own default, then the safe "continue" option (`ok/pass/done/skip`) — otherwise e.g. w2 `prepay` won a 0-vs-0 tie.
3. DD: w1 priors/ranges harsher than the table (see the report); repair = down × (0.05 + 0.25u) instead of 0.1 + 0.4u; a hidden problem never makes a negative claimed cashflow better (`trueBase`: ×(2 − f) below zero); the cycle's cashflow multiplier is mirrored the same way. The level-1 range width is 30% of the true monthly cashflow (also for NOI cards). No inspection on golden (risk known) or starter cards; the starter card is treated as legacy (truth = claim).
4. Focus: debt's +10 credit is once per game (`L.debtBonus`); the guide suggestion asks 🔋 ≥ 60 and ≥ 3 deal tiles within 12 steps before suggesting `scout`; `frugal` also skips leasing lines.
5. `metrics().life.inflationYear` is now last year's figure (or the long-run expectation in year one); `inflationLastYear` added. UI lines `js/ui.js:253, :270, :294` still word it as "this year" — UI agent.
6. No hint on quizzes (it would reveal the answer). `metrics().mentor.canHint` is decided by card type (cheap; `requestHint` is authoritative).
7. Decision records carry `k` (index of the creating action in `st.actions`) and `b` (best option label) for T6's review/luck log.
8. business describe memoizes business.js forecasts by business state (pure) — describe of a business card went from ~18 ms to < 1 ms; `impactFor` p95 1.2 ms.
9. `replayConfig` also carries `gender` (a gender override previously made replay non-byte-identical).

**Gates not met** (numbers and diagnostics in `tools/balance-report.md`): A1 in w1/w4, A3 in w1/w2/w4, A8 (follows from A1/A3), A5 (only `f:ops`, a sim-policy gap), A7 (study plan, w2 trims, w3 business start). A2b reported (not blocking). Met: A2, A4, A6, A6b, A9, A10.


## Director decision after the persona playtests (UI lane, 2026-11-22): no precomputed totals at מתקדם / מומחה

- **Why:** in the playtests the per-option totals ("סה״כ ב־24 חודשים: ±₪X", business levers "+₪X ב־3 חודשים") turned decisions into "pick the biggest number".
- **מתחיל (guide):** unchanged — every option keeps its total line and its 3-month business chip.
- **מתקדם / מומחה (hint / pro):** life, chain and inbox story cards, the business levers board and business inbox items show only raw amounts: one-time cash, per-month flow with its duration, salary changes, 🔋 / 😊, and the "במשחק" odds. The engine data (`effects.total12/total24`, `preview.delta3`, `effects.delta3`) is unchanged.
- **On demand:** the totals stay one tap away in a collapsed "📊 החשבון המלא · סה״כ לכל אפשרות" under the options (`js/ui.js totalsOnDemand`). The T2 impact panel ("מה זה עושה לי?") is already collapsed at hint / pro. Opening either is not counted as used help: the engine has no API for that (`requestHint` only counts hints) — an engine-lane follow-up if wanted.
- **Not changed:** the business offer card (opening setups and its 3-month forecast) — a business plan, not a choice between levers.
- **Tests:** `tests/t4_lobby.py outcome` (guide keeps totals; hint and pro: none on the buttons, odds kept, collapsed on-demand block).
