# T2 "Strategic depth core" — independent review

- **Scope:** T2 commits cc5b886 … 7d68b61 (engine, systems, verifier, sim, tests). I reviewed a read-only snapshot of 7d68b61 (`git archive` → `/tmp/t2rev/t2`). For CR-29 I also reviewed the later fix cf2b666 (`/tmp/t2rev/cr29`). Line numbers below refer to 7d68b61 unless a line says otherwise.
- **Method:** code reading, plus 14 node probes in `/tmp/t2rev/probes/` (each one runs with `node <file>` against the snapshot), plus the suites.
- **Suites:**
  - `t2.test.mjs`: 14/14.
  - `verify.test.mjs`: 9/9 at HEAD, including the new CR-29 test.
  - `determinism.test.mjs`: 2/2.
  - `engine.test.mjs`: started on the snapshot, still running at the time of writing. The tests that finished all pass, including "w1: 2000 random games".
  - `build-edge --check`: ✓ at 7d68b61 (pin 2402da72…) and ✓ at cf2b666 (pin 5cc98fff…). It currently fails in the working tree because of uncommitted T3 edits, which are not T2's.
- **Not done:** no network access, no production calls, no git writes.

Ranking: **1 blocker, 4 major, 10 minor, 6 nit.**

---------------------------------------------------------------------------------------------------

## BLOCKER

### B1 · CR-29 is still open end-to-end: honest ranked games around the cut-over fail verification

**Where:**
- `supabase/functions/verify-result/verify_core.js:9,17` (`RULES4_FROM`, `rulesFor`).
- `js/engine.js:113` (`st.rules = o.rules === 3 ? 3 : 4`).
- cf2b666 added `createGame({dateKey})` and `js/systems/rules.js`, **but nothing passes a date key.** `js/game.js:525` (HEAD) calls `E.createGame({worldId, charId, seed, mode, maxMonths, tutorial, bailout, scenarioId, learn, dream, mentor})`, with no `dateKey` and no `rules`.
- `net.begin` / `rr_begin` (`js/net.js:86`) returns `{result_id, seed, world, char, char_index, max_months, …}` and no date key at all. In particular, the client never sees the challenge's `created_at`.

**Evidence** (probe `p12_cr29.mjs`, engine and verifier of cf2b666, games created exactly the way game.js creates them):

```
RULES4_FROM 2026-12-01 (weekday 2 = Tue)
daily 2026-11-28 (client deployed early)             client rules 4 · verifier rules 3 → FAILED replay_mismatch at 37 (["F","frugal",1])
weekly of Mon 2026-11-30, game begun Wed 2026-12-02  client rules 4 · verifier rules 3 → FAILED …
challenge created 2026-11-25, played 2026-12-05      client rules 4 · verifier rules 3 → FAILED …
daily 2026-12-03 (control)                           client rules 4 · verifier rules 4 → VERIFIED
```

**Failure scenarios:**
1. The v4 client ships before 2026-12-01, as T7 found. Every new daily, weekly and challenge game fails.
2. `RULES4_FROM` falls on a **Tuesday**. Every weekly game of the week that starts Monday 2026-11-30 is replayed with rules 3 until 12-06, even when it was begun after release.
3. A challenge created before the cut-over and played after it fails, because challenges outlive the day they were created.
4. A stale v3 tab that starts a game dated after the cut-over fails the other way round. `migrateV3` (`engine.js:280`) forces rules 3 on every in-flight ranked save, whatever its date.

**Fix (exact):**
1. **One date, one source.** In `rr_begin`, add `date_key` to the returned JSON, using the same expressions the verifier uses:
   ```sql
   coalesce(r.daily_key, r.weekly_key, to_char(c.created_at at time zone 'Asia/Jerusalem','YYYY-MM-DD')) as date_key
   ```
2. **Client.**
   - `lobby.js` (start of a ranked game): `cfg.dateKey = r.date_key`.
   - `game.js:525`: add `dateKey: cfg.mode !== 'free' ? cfg.dateKey : undefined`.
   - Store `st.dateKey` in createGame and in `replayConfig`.
   - `migrateV3`: for ranked saves, use `st.rules = st.dateKey ? rulesForDay(st.dateKey) : 3`.
3. **Cut-over on a Monday.** Use `RULES4_FROM = '2026-12-07'` (or 11-30), in both `js/systems/rules.js` and `verify_core.js`. Daily and weekly then flip together. Deploy the site **before** that date; with the date key in place, an early deploy is safe.
4. **Defence in depth (verifier only, no new SQL, closes the incident even before step 2 ships).** In `verifyGame`, if `rulesFor(row) === 3` and the replay throws `replay_mismatch` or the claim mismatches, replay again with `rules: 4` and accept that result if it matches. Store `detail.rulesFallback = true`.
   - This is safe: rules 4 is the **harder** rule set (smart in time 85 → 92 % with `abl:noDD`), so the fallback gives a cheater nothing.
   - Never fall back from 4 to 3.
5. **Tests.**
   - `fakebackend.py:571` uses `starts_at`, while `index.ts` uses `created_at`. Align them (see m5).
   - Add an e2e test: lobby → game → finish → verify, for a game dated before the cut-over.

---------------------------------------------------------------------------------------------------

## MAJOR

### M1 · The "sealed" cycle phase can be read from public data, and the evaluator and hints depend on it

**Where:**
- `engine.js:317-319`: `loanPct` includes `cycAdd(st)`, which is `CY.mult(st.econ, …, 'loanAdd')` read from the true `econ.phase`.
- `:325`: `loanCap` is multiplied by the phase.
- `:409-411`: asset cashflow is multiplied by the phase.
- `:1351-1353`: deal cost is multiplied by the phase while `value` keeps its level, so cost ÷ value = the multiplier.
- `:2269`: `pubCtx.loanPct` feeds `optionU`.
- `systems/cycle.js:77`: `mult`.
- `metrics()` publishes `loanPct`, `loanCap`, `life.loanPctAdj`, asset cashflow, and the deal's `cost` and `value`.

**Evidence:**
- Probe `p2_phase_leak.mjs`: `(metrics.loanPct − world.loan.pct − metrics.life.loanPctAdj)` identifies the **true current phase in 4419/4419 states (100 %)** in w1/w3/w4. The gauge label matches it only 74 % of the time.
- Probe `p3_scramble_phase.mjs`: the T8-style check, but changing **only** `st.econ.phase`, over 1601 states:

  | output | changed |
  |---|---|
  | `describe` | 662/1601 |
  | `scoreOptions` | 690/1601 |
  | `requestHint().hint` | **142/1601** |
  | `impactFor` | 957/1601 |
  | `metrics` / `publicView` | 1601/1601 |

- T8 never scrambles the current phase: `tests/t2.test.mjs:203` scrambles only `econ.m` and `truth` entries newer than month − 3. That is why the leak slipped through.

**Failure scenario:**
- A player, sim policy or T6 rival can read the phase with no lag from the bank rate (or the loan cap, or any deal's price-to-value ratio). The lagged, noisy gauge and the `research` focus become worthless. The balance report bears this out: `f:research` is best in 3 cells and worse in 24.
- Hints and decision scores change with a value that spec §10.6 and §12.1 declare sealed ("The evaluator never reads the true phase").

**Fix.** First decide whether the current phase is meant to be secret.
- **If it is secret**, every *realised* effect must lag at least as much as the public information:
  - key `loanAdd` and `loanCap` to the published phase (`official`, ≥ 3 months old; "banks reprice on published data");
  - scale the deal card's `value` by the same multiplier as `cost`, and keep the "buy below value" lesson through the cashflow multiplier instead;
  - apply the asset-cashflow multipliers with the gauge's lag;
  - make T8 scramble `econ.phase` and `econ.m` and require byte-identical describe, scoreOptions, hint and impact.
- **If it is not secret**, drop the sealed claim from §8.4 and §12.1, and turn the gauge and `research` into a forecast of the *next* phase.

  Either way, `pubCtx` should take the rate without the cycle add-on, or the add-on of the published phase.

### M2 · The level-1 inspection range gives away the exact truth

**Where:** `systems/dd.js:119-120` (`w = 0.3 × |truth|`, `wv = 0.06 × |true value|`) and `engine.js:1582` (`width: Math.max(50, Math.abs(cfTrue) * 0.3)`, computed from the sealed true cashflow). Spec §7.2 says "widths come from public config".

**Evidence** (probe `p1_range_leak.mjs` / `p1b.mjs`, 300 real level-1 inspections across all worlds):
- **Value:** recovered from `(hi − lo) / 0.12` within 0.2 % in every case (max error 0.11 %). Example: range [122,049, 138,681] → value ≈ 138,600; true value 138,600.
- **Cashflow:** `|true asset cf| ≈ (hi − lo) / 0.3`. The median error is 7.8 % of the shown range width (p90: 19 %); 172/300 are within ₪70. Example: range [470, 670] → 667; true 670.

**Failure scenario:**
- `inspect:1` (4 🔋) yields almost everything `inspect:2` (₪ fee) does, except the exact repair amount. The inspection trade-off that A6 measures is weaker than designed for a careful player.
- The evaluator's assumption `EVI1 = 0.7·EVI2` is wrong for anyone who does the division.

**Fix:** compute both widths from public numbers only: `width = Math.max(50, |claimed asset cf| × 0.3)` and `wv = |claimed value| × 0.06`. Keep the sealed `jitter` for the position. Re-run A6, and add a test that the range width is a function of claimed numbers only (scramble `f`/`vf` → same width).

### M3 · The sim's "smart" reference never opens or manages a business, so the gate numbers that rely on it are not trustworthy

**Where:** `tools/sim.mjs:433`, in the business branch:
```js
return [(ev.options.find((x) => x.primary && x.enabled) || … 'ok'/'pass').id]
```
`primary` is always false at hint level (§5), so smart, adaptive and every `f:*` / `dd:*` variant always pass on business offers and never take a management decision. The same thing happens in `lifePick` (`sim.mjs:102`): greedy and other non-smart policies at hint pick the first option instead of the highlighted one.

**Evidence:**
- The dominance scan in the balance report finds `w3 business:start` is the evaluator's top option in **102/102** appearances, and smart declined all of them.
- `f:ops` is "never worse than f:none" because ops can never be enabled. The implementer acknowledges this as a "sim-policy gap".

**Failure scenario:**
- A3, A5, A7 and A8 are measured against a reference that ignores a whole system, and the evaluator and the reference policy disagree on w3's most common decision. The tuning conclusions in `tools/balance-report.md` ("A1/A3 pair conflict", "A2b is a lesson-design question") rest on these numbers.

**Fix:**
- Give smart v3's offer rule: start when `L.ok && !L.need && forecast > 0 && cash − startCapital ≥ 3 E`. For manage cards, use `biz:suggest` once per visit, or take `E.scoreOptions` from the public view.
- Give greedy's life pick an explicit rule.
- Re-run `--matrix` before anyone tunes against these numbers.

### M4 · Balance and design: strategic depth is inverted in w1, and the cards without a right answer decide the game

**Evidence** (`tools/balance-report.md`):
- w1 in time: **naive 92 % > smart 85 % > guideTapper 59 %**. "Believe the seller, never inspect, cheapest life option" is the best way to play the kids' world.
- The report's own diagnostic: picking the cheapest option on personal and values life cards raises guideTapper from 58 % to 83 % (w1) and from 56 % to 78 % (w2).

**Why it matters for the brief:** these cards are scored "no single right answer" (100 for every option; values cards within a 1.5 E band) and get no highlight or hint. Yet they move escape odds by about 25 points. The owner's problem was "roll the dice and pick the right thing". In w1 the depth now punishes the careful player and rewards credulity, while the swing comes from a choice the game tells the child is a matter of values.

**Fix (owner and director decision):** pick one.
- Shrink the money spread of personal and values cards so that "no right answer" is true in money terms too. For example, cap the option spread at ≈ 1.5 E and move the rest into 😊 / 🔋.
- Or keep the spread and show its money effect plainly (the impact panel on by default for these cards at guide).

Then re-check A1, A2b and A3 in w1 after M3 is fixed.

---------------------------------------------------------------------------------------------------

## MINOR

**m1 · Hints refresh for free after a non-closing option** (`engine.js:3226`).
- `p.hinted` is set once per pending card, but `requestHint` recomputes the hint from the current state each time.
- Probe `p9_hint_refresh.mjs` / `p9b.mjs`: after hint → `inspect:1` → hint, 114/200 second hints differ, and **18/200 name a different option**. None is counted or logged.
- Impact: ranked hint counts (shown on the leaderboard) are understated.
- Fix: cache the first hint on the pending card and return it, or count a new hint whenever `(dd.level, negotiated)` has changed.

**m2 · A verified repair is left out of the buy option's money check** (`engine.js:2203` vs `:2219`).
- Probe `p14_repair_forced.mjs`: after `inspect:2` shows a repair of ₪3,000, the buy option reads "הלוואה ₪1,000 וקנייה". Buying then triggers a **forced** loan of ₪3,000 that bypasses the loan cap, and the credit score drops 680 → 655.
- Fix: `loanFor(st, c.down + fee + (p.dd && p.dd.level === 2 ? p.dd.repair : 0))`, and include the expected repair in `cushionCheck`.

**m3 · The business card leaks its recommendation at hint/pro** (`engine.js:1671`).
- `ev.data.why = o.suggest.why`, which holds lines such as "עובד נוסף מכניס יותר ממה שהוא עולה" and "העסק מאוזן — אין צורך לשנות כלום".
- `ui.js` does not render it today, but `publicView` exposes it, so T4/T6/UI can pick it up.
- Fix: drop `why` when `st.mentor !== 'guide'`.

**m4 · The weekly key format is an unverified assumption** (`index.ts:88`, `to_date(weekly_key,'IYYY-"W"IW')`).
- If the stored format differs, the SQL throws and every weekly verification gets a 500 (the client retries up to 30 times, and nothing is stored).
- Release checklist: run a read-only `select weekly_key from game.results where weekly_key is not null limit 3` before deploying.

**m5 · The test double has drifted.**
- `tests/fakebackend.py:571` derives `challenge_day` from `starts_at` in UTC.
- `index.ts` (cf2b666) uses `created_at at time zone 'Asia/Jerusalem'`.
- The fake therefore cannot catch the B1 challenge edge. Align it with index.ts.

**m6 · T9's due-diligence oracle mixes units** (`tests/t2.test.mjs:260`).
- It assigns `ev.data.dd.expected.cf` (asset-level cashflow, after the cycle multiplier) to `dd.base` (the card's income line). It passes only because that card has no cycle or NOI effect.
- At scale (probe `p10_impact_dd.mjs`) the same oracle mismatches cashflow in 350/400 cases by ₪10–60. `impactFor` itself is right, because `shadowOf` uses `ddBasis().base`.
- Fix: expose `expected.base` (income line) and use it in the test.

**m7 · A6 is "met" within noise.** Pooled in-time figures are flagged 81 %, never 80 %, always 78 %, with a standard error of about 1.1 points each. The per-world margins are ≤ 1 point. Report a confidence interval, or raise N, before calling it a pass. M2 changes this gate anyway.

**m8 · `migrateV3` sets rules 3 for every in-flight ranked save, whatever its date** (`engine.js:280`). See B1, step 2.

**m9 · Focus scoring and suggestions inherit M1.** `focusDecision` / `focusSuggest` (`engine.js:3131, 3155`) use `loanRoomOf → loanCap(phase)`.

**m10 · `VERDICT_WORDS` is narrow, and verdict text is still in content.**
- Probe `p4_verdict_scan.mjs` / `p4b.mjs`: across 25,790 hint/pro events, `VERDICT_WORDS` matches nothing in any string field. ✓
- A wider word list does find verdicts:
  - `w2.js:114`: a doodad `q`, kept at every level by spec, says "…עדיף ממזומן ולא מאשראי". That decides between the card's pay options.
  - `w3.js:72`: the deal text says "המוכר יודע את זה — ולכן המחיר מנופח".
- Fix: content pass, and add `עדיף` / bare `כדאי` to the post-decision-only list.

---------------------------------------------------------------------------------------------------

## NIT

- **n1 · Dead config:**
  - `systems/focus.js:42` has `scoutInspect1` / `scoutInspect2Mult`, but `inspectInfo` hard-codes 0 and 0.5.
  - `systems/cycle.js:8-9` has `CYCLE_DRAWS_*`, but the engine hard-codes two `next()` calls.
- **n2 · Duplicated negotiation math:** `dealBuy` (`engine.js:2304-2305`) repeats `negotiate()`'s discount and cashflow formula. Extract one helper so the evaluator cannot drift from the engine.
- **n3 · An undocumented sealed stat:** `stats.ddAvoided` (`engine.js:2685`) is derived from the sealed truth of a deal the player passed on, and lives in `st.stats`. Add it to the §12.1 sealed list so no lane shows it mid-game.
- **n4 · Design note:** values of assets you already hold never move with the cycle; only new deal prices do. A recession is therefore a pure bargain for buyers and costs holders nothing in net worth.
- **n5 · Inconsistent policy semantics:** `greedy` / `cautious` life picks behave differently at hint than they did in v3 (the M3 pattern). Document them in the report.
- **n6 · Working tree:** it currently fails `build-edge --check` because of uncommitted T3 engine edits. That is not a T2 defect, but re-pin after T3 lands.

---------------------------------------------------------------------------------------------------

## Verified OK

- **Determinism.** Probe `p7_streams.mjs`: 80 seeds × 90 turns × 3 decision styles. The styles cover F with every id and the agenda, H, M, inspections, offers and buying businesses. Result: 7,200 turn comparisons and 1,856 sealed dd truths, with **0 divergences** in dice, dd, cycle or month; `econ.truth` is identical. T2/T3 in the tests also confirm dd +6 per deal or mystery landing and cycle +2 at creation and +2 per payday, history included.
- **Replay and saves.**
  - `replay(replayConfig(st), actions)` is byte-identical with F/H/M and inspections (T4).
  - Rules 3 reproduces the 200-game v3 golden fixture (T7).
  - v3 → v4 and v2 → v3 → v4 migrations work, and the v4 round-trip is stable (T6).
  - `v4Defaults` runs on every load and is idempotent.
  - Bad versions are rejected as `save_incompatible`.
- **Server contract.**
  - `CODES` matches the `replay()` switch cases (r l c L R C P A I S T F H M).
  - `configFor` gives `mentor:'hint'`, which equals the level createGame forces for ranked games.
  - An `M` entry in a ranked log is refused.
  - `validateActions` limits are fine.
  - The bundle pin is consistent at both 7d68b61 and cf2b666.
- **Money.**
  - Every money move T2 adds is integer: inspection fee r100, repair r100, debt fee `Math.round`, frugal cut r10.
  - The T2 diff has no `Math.pow`, `exp` or `log` (the only `**` matches are inside `/**` doc comments), and the dynamic ±1-ulp determinism test passes on 300 games.
  - Probe `p13_nw_buy.mjs`, no money creation:
    - 3,551 buys: ΔNW = value − cost − repair − hedge fee, exactly;
    - 3,981 inspections: ΔNW = −fee;
    - 7,188 focus activations: ΔNW = −debt fee (0 for the others).
  - Probe `p11_inspect_cost.mjs`: 601/601 inspections cost exactly what the option shows, with and without scout.
  - Probe `p6_cash_ledger.mjs`: `setFocus` and inspection cash moves always equal the reported effects. Other mismatches it shows (a voluntary loan inside a buy, auto-invest at payday) predate T2.
- **Mentor and leaks.**
  - The trap question `c.q` never appears before the decision at hint/pro (56 cards × 2 levels, probe `p5_trapq.mjs`).
  - There is no `suggested` and no primary at hint/pro.
  - pro withholds `out.decision`.
  - Personal cards score 100 for every option (50 only with a risk flag).
  - Values cards use the 1.5 E band with a floor of 60.
  - The hint `optionId` is `null` on trade-off cards.
  - There is no primary on personal, values or quiz cards.
  - `inflationYear` is no longer the pre-drawn value.
- **Robustness.**
  - Probe `p8_softlock.mjs`: 85,998 events under an adversarial policy (low 🔋, zero cash, non-closing options first) produced **0 cards with no enabled option**.
  - The failure paths of `setFocus`, `requestHint` and `setMentorLevel`, and `choose` with an unknown or stale option, return or throw before they log or mutate.
- **Performance:** A10 numbers are plausible. `describe` memoises business forecasts on the full `JSON.stringify(b)` key, which is safe because `BIZ.forecast` is a pure function of `b`.

**Probes** (all in `/tmp/t2rev/probes/`): `p1/p1b` range leak · `p2` phase leak · `p3` scramble of the phase only · `p4/p4b` verdict scans · `p5` trap question · `p6` cash ledger · `p7` streams · `p8` soft-locks · `p9/p9b` hint refresh · `p10` impact on dd cards · `p11` inspection cost · `p12` CR-29 · `p13` net-worth attribution · `p14` forced loan from a verified repair.
