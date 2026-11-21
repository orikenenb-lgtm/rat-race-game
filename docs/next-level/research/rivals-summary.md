# Next Level · Phase A research · T6: rivals, success metrics, personal end summary, practice rewind

- **Task:** T6 (owner brief §15, §16; continue-after-win deferred from T4 D-11). Read-only investigation: no repo file was edited except this one.
- **Branch:** `feat/rat-race-next-level`, HEAD `6782efd`. The working tree holds the **uncommitted, in-progress T2 engine** (`js/engine.js` +846 lines, `js/systems/*`, `SAVE_VERSION = 4`) and T1 shell changes (`js/game.js`, `js/saves.js`).
- **Line references:** `engine.js:N` = the committed base engine (HEAD, identical to the live `706c0ff` engine, 2843 lines). `engine.js(WT):N` = the working-tree snapshot taken 2026-11-21 ~17:40 (3461 lines). The WT file was still changing while I worked, so WT numbers drift. Other files use the current working tree.
- **Tags:** **[OBSERVED]** = I ran it here (Node 22, headless Chrome with CDP CPU throttling, a scratch PostgreSQL 16 in `/tmp`). **[CODE]** = read in the source. **[HYPOTHESIS]** = inferred, not run.
- **Machine:** 2 cores, shared with other agents (load average 2–8 during the runs). **All timings are noisy and pessimistic.** I report min and median, and I never treat one run as a performance claim.
- **Scratch:** `/tmp/research-t6/` contains the scripts (`scripts/*.mjs`, `scripts/bench.py`), the raw JSON outputs, `head/` and `wt/` (frozen code copies used for the runs), and `sql/` (the proposed migration, the local mock and the test output). Production Supabase was never called (the browser bench aborted `*supabase.co*`).
- **Memory:** nothing from user memory was used.

---

## 0. Summary (decisions I recommend)

| # | Topic | Recommendation | Why |
|---|---|---|---|
| R1 | Rivals | **"Ghost players on the same board" (variant G)** for P0. Each archetype is a policy that plays **the same seed** (same dice, same cards) through the **unchanged engine**, deciding only from `E.publicView`. They run off the main thread (Web Worker) and are cached per (world, char, seed, archetype, engine pin). | No engine change, no new stream, no re-pin, no ranked-fairness risk. Money creation is impossible by construction. The comparison is maximally readable: "same luck, different decisions". It reuses the duel/same-board idea and the T2 archetype policies (T2 §13.2). |
| R2 | Rivals, later | Keep gameplay.md §7d (shared listings, streams `rival`/`listing`, action `B`) as **P2**. The reserved streams stay unused. | It changes the player's outcomes, so it needs engine work, a re-pin and fairness rules. §15 does not require interaction. |
| R3 | Info limit | During a game, ghost data **never goes past the player's current month**. Full ghost results appear only after the player's game ends. | A ghost on the same seed has already lived the player's future, so showing its month-30 state at month 12 is a lookahead tool. |
| R4 | End summary data | Add a compact **per-payday timeline** `st.tl` (engine-side, inside `payday()`), a capped **notable-events list** `st.marks`, a per-event **luck log** `dq.luckLog`, and the **action index `k`** in decision records. All are logging only, with no outcome change. They ride the T2/T3 v4 re-pin. **Fallback if T6 misses that release:** a UI-side `S.ui.tl` in `game.js track()`. | Today there is no net-worth history at all, crises are counters only, and luck is aggregated per category. The engine-side copy is exact at every payday (a roll can cross 2 paydays), and a rewind or replay rebuilds it for free. Cost ≈ 2–4 KB per 60-month save. |
| R5 | Success metrics | Show **raw, explained facts per dimension** (speed, resilience, decisions, happiness, business), each compared with the 4 ghosts. **No composite score.** Show the existing 0–100 decision score as verdict counts. | §15: "understandable, without arbitrary scoring formulas". |
| R6 | Practice rewind | `replay(prefix)` → branch. A branch is always a **`learn:true` game (T4 rules)** in its own slot `rr2-save-branch-<w>`. The original stays untouched. Free and learn games only; never ranked. | Measured: replay is exact (30/30 games), and dice, tiles and RNG streams stay 100% identical after a different choice (4,257 rolls). |
| R7 | Ranked hardening | (a) Additive migration: append-only `checkpoint.actions` trigger, `log` mode first, then `enforce`. (b) verify-result: the stored checkpoint's actions must be a prefix of the submitted log. (c) Client: prefer the local save only if its log extends the server log. **These are production changes and need the owner's approval.** | The only rewind exploits left are server-side (engine-robustness.md §4.4). Tested on a local PostgreSQL 16 mock (§7.5). |
| R8 | Continue after win | A new action `['W']` ("keep living") for free and learn games only. The win is recorded once, `checkEnd` stops auto-ending on the goal, and the player ends with "לפרוש עכשיו" (`['X']`) or at a cap. | Today `finalize()` sets `phase:'over'` and the lobby deletes the free save, so continuing is impossible. |

---

## 1. Inputs and what already exists

### 1.1 Rivals and fairness (inputs)
- gameplay.md §5: decisions never consume draws; sealed fields (`negR`, `p.hidden`, `coin.path`, `raiseR`, `sideSeed`, `st.decks`, `bizRng`, `inflationYear`). §7d: archetypes saver/founder/diversified/gambler, variant A (ranked-safe) / B (interactive).
- T2 spec §2: streams `rival` (12) and `listing` (13) are reserved and carried by v4 saves. §12.2: `publicView()`. §13.2: archetype policies "playing as the player", "same code that T6 rivals will reuse", exported from `tools/policies.mjs`.
- [CODE] `publicView` exists in WT (`engine.js(WT):3215`). It deep-freezes, removes `inflationYear` and adds `econPublic`. The archetype policies **do not exist yet**: `tools/sim.mjs:104` has only random/cautious/greedy/smart/tapper/reckless. They take `st`, not `publicView` (`greedyLike(st, …)`, `sim.mjs:192`). A grep for `negR|hidden|decks|.rng|raiseR|sideSeed|coin.path|inflationYear|.pending` in `sim.mjs` finds nothing, so today's policies do not read sealed fields.

### 1.2 End screen (existing)
- Engine `checkEnd` (`engine.js:2684-2715`) builds the result: status/reason/months/stars plus the ★★★ gates (`starsBlockedByHappiness`, `starsBlockedByFund`), `nearMiss` (`:2755`), `leaks` (`leaksOf :1024`), `tip` (`tipFor :2772`, a single line from the biggest *chosen* leak or a world mechanic), `log` (last 80), `lifeSummary` (`:2732`: age, real net worth, free time, family, avg happiness, pension, burnouts, top 5 decisions by ₪ size `|v|`), `learning` (`learningOf :2060`: decision quality 0–100, verdict counts, mastery per principle, luck total + 6 parts, top 3 worst gaps, a sentence), lessons, happiness. WT adds `ddRecap`, `ddPassed` and `econPath` (the true cycle path revealed at the end, `engine.js(WT):3328-3332`).
- Lobby `renderEnd` (`js/lobby.js:1219-1281`) renders result, stars, rank, duel, near-miss, progress bar, benchmark, ★★★ gate, leaks, 4 stats, "החלטות מול מזל" (`learnHtml :1304`), life card (`lifeHtml :1370`), news (stars, unlocks, ⚡, lessons, achievements, pawns), world lesson + tip, and buttons (`endButtons :1449`: same board / new board / next world / share).
- ux.md §16 [OBSERVED there]: rich, but 370–384 words and 2.5–2.7 phone screens. No net-worth chart. No rewind. The life-story overlay auto-closes (`ui.js:1096`: `max(4200, 1600 + 45 ms/char)`).

### 1.3 Per-month history that exists today [CODE]
| Series | Where | Length |
|---|---|---|
| Index price | `L.idxHist` (`engine.js(WT):1093`), history `H.idxHist` (`engine.js:1090`) | 60 |
| Interest rate (w2) / USD (w3) | `world.rateHist` / `world.usdHist` | 40 |
| Cycle signal (T2) | `econ.hist` (`{m, s}`), `econ.truth` | ≤ 24 / all |
| Business | `b.hist` (`finance/business.js:478`, `HIST_MAX = 24`): rev, gp, opex, np, cash | 24 per business |
| Pension | **UI-side** `S.ui.pensionHist` (`game.js:644 track()`, once per render when the month changes) | 120 |
| Happiness | only `L.hapSum`/`L.hapN` → average (`engine.js:854`) | — |
| **Net worth, cash, cash flow, passive, expenses** | **none** | — |
| Decisions | `dq.decisions` (`engine.js:2052`, cap 120): `{t, m, type, c, o, s, v, f, p, why, gap}`, no action index, no outcome | 120 |
| ₪-sized choices | `st.log` (`engine.js:191-196`, cap 80): `{t, c, o, v}` | 80 |
| Life events | `L.events` (`engine.js:2162`): `{m, id, o}` | unbounded |
| Crises | counters only: `stats.crises`, `crisisNoLoan`, `crisisPaid`, `forcedLoans`, `autoLoans`, `negMonths`, `L.burnouts`, `flags.bailoutUsed` | — |
| Luck | `dq.luck` per category: index, angels, crypto, negotiation, raise, friend (+ T2: dd, cycle). Summed, with no event or time (`addLuck`, `engine.js(WT):2453`; call sites `:880, :973, :1095, :1233, :2211, :2499, :2513, :2690`) | — |

---

## 2. §15: rivals and broader success metrics

### 2.1 Status table §15

| Requirement | Status | Evidence / gap |
|---|---|---|
| Rivals: cautious saver, entrepreneur, diversified investor, risk lover | **missing** | No rival code. Archetype policies are specified (T2 §13.2) but not written. |
| Clear rules, strengths and weaknesses | **missing** | Proposal in §2.3 (rule card + "strong when / weak when" per archetype). |
| Same information limits | **needs improvement** (foundation exists) | `publicView` exists (WT). Today's sim policies read `st` (no sealed fields found by grep). They must switch to `publicView`, and the T2 T8 scramble test should cover them. |
| No future knowledge | **missing (design constraint)** | Policies decide only on the current event. **New constraint R3:** ghost data must never be shown past the player's month during play. |
| No hidden money creation | **exists by construction in variant G** / missing in §7d | Ghosts run the real engine. §7d's shadow model would need the reconciliation assert from gameplay.md §7d. |
| Efficient on phones | **feasible** | §2.4: a light rival step costs ~1–1.6 ms per payday for 4 rivals on this box. Full ghosts cost ~4–28 ms per month for 4 and need a Worker. |
| Broader success metrics (speed, resilience, decision quality, happiness, business stability) | **needs improvement** | Speed, happiness average, decision quality and business totals exist. Resilience has counters only, with no timeline. There is no per-dimension presentation (§2.5). |
| Shown understandably, no arbitrary formulas | **needs improvement** | The "החלטות מול מזל" bar shows a 0–100 score (`lobby.js:1329`) and a `tanh` luck bar (`:1310`). Both are formula-based. Prefer verdict counts and ₪ facts. |
| Extend existing groups/challenges, not real-time multiplayer | **exists (base)** | Groups ≤ 50, challenges (same seed + character), daily/weekly boards, duel links, group feed (`lobby.js:1135-1176`, `net.js`). Ghosts slot in as reference rows (§2.6). |

### 2.2 Two rival designs compared

| | **G: ghosts on the same seed** (recommended P0) | **M: shared listings market** (gameplay.md §7d) |
|---|---|---|
| What a rival is | A full engine game (same world, character, seed, mode, rules, mentor) driven by an archetype policy | A light shadow balance sheet acting at paydays on 3 shared listings |
| Interaction with the player | None. Pure comparison. | Rivals pick before the player (A) or can be preempted with `['B', i]` (B) |
| Engine change | **None** (rivals = UI-side module + worker importing `engine.js`) | `js/rivals.js` (pinned), streams `rival`/`listing` start drawing, `payday()` hook, `metrics().rivals`, action `B`, verifier `CODES`, re-pin |
| Ranked impact | None. Ghosts are identical for everyone on a seed, so they can sit on daily boards. | Variant A only. It changes what the player can buy, so it must go through `replayConfig`, the verifier and release timing. |
| Money rules | The real engine (cannot diverge) | Must duplicate `assetCf`/loans/forced-loan logic and add a reconciliation test |
| Information limit | Same `publicView` gate as the T2 sim policies | `publicView(listing)` scoping, DD truth only if paid |
| Lookahead risk | **Yes**: a ghost has lived the player's future. Mitigated by R3 (cap at the player's month). | No (rivals advance in lockstep with the player) |
| Cost | Higher (a full game per rival). Off-main-thread + cache (§2.4). | ~1 ms per payday |

### 2.3 Archetypes (rule cards; Hebrew names are fixed so they read consistently)
All four use the T2 policy contract: `decide(pv, ctx) → [optionId, params]` and `between(pv, ctx) → actions` (loans, repay, invest, plan, focus). `pv = E.publicView(ghostSt, {freeze:false})`. Each has its own tiny PRNG seeded from `(seed, archetype)` for tie-breaks, never from game streams. [HYPOTHESIS: the parameters come from gameplay.md §7d and need T2-style sim tuning]

| Archetype | Rule shown to the player | Strong when | Weak when |
|---|---|---|---|
| 🐢 **נועה החוסכת** (cautious saver) | "שומרת 6 חודשי כרית. קונה רק נכס עם תזרים חיובי, בלי הלוואה. 20% מהעודף לקרן מדד." | crises, recessions, layoffs, high rates | expansions, cheap credit: slow to escape |
| 🚀 **עומר היזם** (entrepreneur) | "מעדיף עסקים. לוקח הלוואה כשהעסקה מכניסה יותר מהריבית. מנהל את העסק בעצמו." | business tiles, expansion phase | burnout (🔋), recessions hit demand, concentration |
| 🧺 **מאיה המפזרת** (diversified investor) | "40% מהעודף לקרן מדד, נכס אחד מכל סוג, כרית של 3 חודשים." | long games, mixed cycles: steady | short sprints (daily 24 months), w4 impact goals |
| 🎲 **רועי המהמר** (risk lover) | "מינוף מקסימלי, קריפטו וצ'קים גדולים לסטארט־אפים." | lucky seeds, expansions | almost everything else, so a good teacher of "luck ≠ judgment" |

Acceptance (reuse T2 §13.5 A4 logic): no archetype is best in > 60% of cells, and each is best in ≥ 1 cycle bucket. That makes "strong when / weak when" true statements, not decoration.

### 2.4 CPU cost, measured [OBSERVED]
Scripts: `/tmp/research-t6/scripts/rivalcost.mjs` (Node), `scripts/bench.py` + `bench/bench.html` (headless Chrome, CDP `Emulation.setCPUThrottlingRate` 1×/4×/6× as a phone-class proxy). Raw: `rival_head.json`, `rival_wt.json`, `bench_browser.json`.

**Building blocks (Node, mid-game states, medians; HEAD = live v3 engine, WT = T2 in progress, w1–w3 only):**

| | w1 | w2 | w3 | w4 |
|---|---|---|---|---|
| `metrics(st)` µs (HEAD / WT) | 13 / 24 | 24 / 34 | 15 / 19 | 16 / – |
| `rollDice` with a payday µs (HEAD / WT) | 125 / 213 | 94 / 167 | 86 / 130 | 79 / – |
| `rollDice` without a payday µs | 1–5 | | | |
| `scoreOptions` on a deal µs (WT) | 12 | 47 | 79 | – |
| **4 light rivals per payday** (= 4 × (payday-like step + 2 `metrics` + 3 listing scores)), µs | **1,078 / 1,191** | 1,415 / 1,510 | 987 / 1,623 | 1,029 / – |
| Full policy player, ms per simulated month (HEAD, cautious/smart/greedy/reckless) | 0.99/1.80/0.93/0.91 | 4.17/1.74/2.46/2.22 | 3.36/5.15/1.42/0.81 | 0.81/2.56/1.14/1.73 |
| **4 ghosts per month, worst policy × 4**, ms (HEAD / WT) | 7.2 / 28.4 | 16.7 / 9.1 | 20.6 / 9.2 | 10.2 / – |

**Phone-class factor:** in Chrome, CPU throttling 4× and 6× slowed a full 60-month replay by **~2–6×** compared with 1× (noisy under load; `bench_browser.json`). I use **4–6×** for "phone-class" [HYPOTHESIS: there was no real device].

**Estimates:**
- Light rivals (design M): **~4–10 ms per payday on a phone** for 4 rivals. A payday happens about once per 1.4 rolls, and each roll has ≥ 1 s of animation, so this is fine on the main thread.
- Ghosts (design G): **~16–170 ms per player-month on a phone** for 4 ghosts, or about 1–10 s for a whole 60-month game. **Do not run this on the main thread.** Plan:
  1. Run the ghosts in a module **Web Worker** (`js/rivals/worker.js` imports `engine.js` and the policies; the engine has no DOM, so it can run in a worker [CODE `engine.js:1-4`]). Advance them to `S.month` after each payday. They post back only `{arch, tl:[…≤ S.month], end?}`.
  2. Fallback when there are no Workers: one ghost-month per `requestIdleCallback`.
  3. Cache finished ghost timelines in `rr2-ghosts` (LRU of 8 seeds × 4 ghosts × ~2.5 KB ≈ 80 KB), keyed by `world|char|seed|rules|mentor|enginePin`. A daily/weekly ghost is computed once per device.
- Server: no cost in G. In M, verify replays rivals too: about +1.5 ms × 60 paydays ≈ +0.1 s per verification on this box [HYPOTHESIS].

### 2.5 Success metrics: show facts, not a formula
Each dimension shows one headline fact plus one comparison line ("החוסכת: …"). Every number comes from the engine, and none is computed in the UI.

| Dimension | Headline fact (Hebrew copy sketch) | Data today | Missing |
|---|---|---|---|
| ⏱️ Speed | `יצאת בחודש 38 (★★ עד 40)` / `הגעת ל־72% מהדרך` | `months`, `starThresholds`, `progress` | — |
| 🛡️ Resilience | `עברת 3 משברים — 2 בלי הלוואה כפויה. הכרית הכי נמוכה: 0.4 חודש (חודש 14).` | `stats.crises`, `crisisNoLoan`, `autoLoans`, `negMonths`, `burnouts`, `flags.bailoutUsed`, end `emergency.months` | **cushion over time, worst month, drawdown and recovery time** → `st.tl` (§3.3) |
| 🧠 Decisions | `31 החלטות חזקות · 6 סבירות · 3 מסוכנות` (+ "the decision to rethink" with a rewind button) | `learning.verdicts`, `learning.top` | action index `k` for the rewind link |
| 😊 Happiness | `אושר ממוצע 66 · התחלת ב־60 וסיימת ב־71 · 1 שחיקה` | `avgHappiness`, final happiness, burnouts | happiness and 🔋 **over time** → `st.tl` |
| 🏪 Business | `העסק הרוויח ב־14 מתוך 18 חודשים · שלב "צומח"` | `BIZ.summary(b).hist` (24 months), `totals.months`, T3 `growthStage` | profitable-month count beyond 24 (add `totals.profitMonths` in business.js, T3 lane) |

The 0–100 decision score and the `tanh` luck bar stay available under "פרטים", but they are not the headline. That meets "without arbitrary scoring formulas" and keeps what already exists.

### 2.6 Extending groups and challenges (no real-time)
- **Boards** (`boardHtml`, `lobby.js:411-439`): after the player's own result, append the 4 ghosts as **unranked reference rows** (`🤖 נועה החוסכת · חודש 44`), styled apart, never sent to the server, never numbered among humans. Daily/weekly/challenge seeds are shared, so everyone sees the same ghost lines. Show them only after `rr_begin` has given this device the seed (no new seed exposure) and only after the player finishes (R3).
- **Duel screen** (`renderDuel`, `lobby.js:1157`): "גם נועה החוסכת שיחקה את הלוח הזה" with the ghost's result.
- **Group challenge creation:** no server change. Ghosts are client-side.
- **Optional P2 (server):** show per-dimension facts for *other* players on group boards. This must come from **verify-result's replay** (trusted), not from client `stats` (unverified, SECURITY_REVIEW §3.6). verify-result could add `{crises, crisisNoLoan, avgHappiness, …}` to `verified_result`, and `game.board` would return them for `verified = true` rows. That replaces a function, so it needs approval.

---

## 3. §16: personal end summary

### 3.1 Status table §16

| §16 item | Status | Data today | What is missing |
|---|---|---|---|
| Achievements | **exists** | `end.achievements = st.ach` (`engine.js:1913-1916`), lobby `newsHtml` (`lobby.js:1441-1446`) | Only placement: collapse them under "פרטים" |
| Meaningful decisions | **needs improvement** | `lifeSummary.topDecisions` (top 5 by ₪ size `v`, `engine.js:2734`), `learning.top` (worst 3 by gap, `:2068`) | No link between a decision and its outcome. Two lists answer different questions. Need `k` (action index) and the outcome link (§3.4). |
| Judgment-driven successes | **missing** | ex-ante score `s` per decision exists | A per-decision realised outcome / sealed-luck amount (§3.4) |
| Lucky successes | **missing** (aggregate exists) | `dq.luck` parts (sum per category) | `dq.luckLog`: each sealed outcome with month, part, ₪ and the decision `k` |
| Main crisis and how it was handled | **missing** | counters only (§1.3). T3 will add `story.memory` facts and `lifeSummary.stories`. T2 WT adds `econPath`. | `st.marks` (when / what / ₪) + the timeline to find the worst drawdown window and what followed (forced loan? sold? cut expenses?) |
| Readable money graph | **missing** | — | `st.tl` per payday. The UI has `spark()` (`ui.js:323`) as a base. |
| Happiness and resilience change | **needs improvement** | final + average happiness, burnouts, end cushion | Start → end series (`st.tl` hap/en/liquid) |
| Focused suggestion for the next attempt | **needs improvement** | `tipFor` (1 line), "כדאי לחזק" principle, "ההחלטה ששווה לחשוב עליה שוב" | Three overlapping suggestions. Pick **one** (rule in §3.5) and attach a "🔁 לנסות אחרת" rewind. |
| Length / scannability | **needs improvement** | ux.md: 2.5–2.7 phone screens | One-screen top (§3.6) |
| Life-story overlay | **needs improvement** | auto-closes (`ui.js:1096`) | No auto-close (T4 A11Y-13). Its content moves into the summary. |

### 3.2 Sizes today [OBSERVED `timing.mjs`, 60-month games, random policy]
| | w1 | w2 | w3 | w4 |
|---|---|---|---|---|
| Full state JSON, HEAD / WT (KB) | 18.6 / 29.8 | 28.7 / 34.6 | 40.6 / 31.8 | 25.0 / – |
| of which `actions` (KB) | 2.4 | 2.4 | 2.6 | 2.3 |
| of which `dq.decisions` (KB, HEAD / WT) | 8.1 / 14.7 | 11.7 / 15.3 | 12.2 / 11.4 | 6.1 |
| of which `log` (KB) | 3.0 | 4.7 | 4.9 | 3.2 |
| of which `econ` (WT, KB) | 1.9 | 1.9 | 1.9 | – |
| Timeline reconstructed (60 rows × 8 ints, JSON) | 2.2 KB | 2.5 KB | 2.5 KB | 2.5 KB |

Across 16 HEAD + 12 WT games (`rewind_*.json`), states were 13.5–48.4 KB and action logs 0.6–2.7 KB (71–297 actions). The ranked checkpoint limit is ~300 KB (qa.md:53), so there is room.

### 3.3 What the engine should record (engine lane; logging only, outcome-neutral)
1. **`st.tl`**, pushed at the end of `payday()` after `ensureCash`/auto-invest/savings (`engine.js:706-789`). It is columnar and all integers:
   ```js
   st.tl = { m0: 1, nw: [], liq: [], pas: [], exp: [], hap: [], en: [] }   // nw in ₪100 units; liq = cash + savings
   ```
   - Values come from one extra `metrics()` call (13–45 µs measured) or from the cheaper `netWorthOf`/`passiveOf`/`expensesOf` helpers already used in `payday`.
   - **Size:** ~1.6–2.2 KB at 60 months. Cap 240 entries (free games have no time limit). Past the cap, halve the resolution (keep every 2nd) instead of dropping the start.
   - It is deterministic, so `replay()` rebuilds it byte-for-byte. The determinism test (`replay(full log) == live state`) covers it automatically, and a rewind branch gets the prefix of the timeline for free.
2. **`st.marks`**, ≤ 40 entries `[m, kind, amount, k?]`. Kinds: `crisis` (crisis card paid, `engine.js:2354`), `forced` (forced loan, `:649`), `burnout`, `jobless`, `crash` (index crash), `bailout`, `bigSale`, `bigBuy`, `recession` (T2 label change), `story` (T3 chain step). ~1 KB.
3. **`dq.luckLog`**, ≤ 40 entries `[m, part, amount, k]`, appended inside `addLuck` for the event-type parts (negotiation, raise, angels, crypto, friend, dd, T3 story). Ambient parts (`index`, `cycle`) stay aggregate only. ~1 KB.
4. **Decision record** (`decisionRecord`, `engine.js:2027`): add `k: st.actions.length` (the index of the `c` action about to be logged) and, for buys, `a: <asset id>`. A few bytes each. **Offset idea (not required):** `dq.decisions` is the biggest block (6–15 KB) because `why`/`c` repeat Hebrew strings. Storing a `why` key instead of the text would save more than T6 adds.
5. **`summaryForServer`** (`engine.js:1039`) needs none of this. Keep server payloads small.

**Total added: ~3–4 KB per 60-month save (+8–15%).**
- **Version:** if this lands **before the v4 release**, it goes into `v4Defaults` (`engine.js(WT):129`) as missing-field defaults and needs no bump. Otherwise it needs v5 + `migrateV4` (T2 §16.2 already anticipates this).
- **Saves migrated mid-game:** they start the timeline at the migration month. The UI may backfill the earlier months once by replay (≤ 0.4 s on a phone, §4.3) and should mark the backfilled part.

**UI-only fallback (no re-pin):** extend `game.js track()` (`game.js:644`) to push the same row into `S.ui.tl`.
- Limits: it samples once per *render*, so a roll that crosses 2 paydays (board `PODOLMOIOXPOOODKOMEOPODMOLOIXOPDOML?OTMO`: paydays every 10 tiles, dice up to 12) loses a month.
- Branches must cut it by month.
- There is no luck log or `k`. Those can be reconstructed at the end by an instrumented replay (≈ 20–330 ms on this box, 90–1800 ms throttled), which duplicates the `replay()` switch in UI code.

### 3.4 "Judgment vs luck" without a new formula
For each scored decision with a linked sealed outcome (`luckLog.k = decision.k`), or a buy with a realised asset outcome (`a.dd` truth vs claim in T2, sale proceeds), place it in a 2×2. Use the **existing** ex-ante verdict (`v`: strong/ok vs costly/risky) and the **sign and size** of the ₪ luck (relative to monthly expenses, as `learnHtml` already does):

| | Luck helped | Luck hurt |
|---|---|---|
| **Good decision** | `✅ החלטה טובה שגם הצליחה` | `💪 עשית נכון — הפעם לא הסתדר` (the most important line to teach) |
| **Weak decision** | `🍀 הצליח, אבל בזכות מזל — אל תסמוך על זה` | `⚠️ החלטה חלשה שגם עלתה ביוקר` |

Show at most one example per cell (the largest ₪). The cells come straight from engine data, and nothing is weighted.

### 3.5 One focused suggestion (rule, in order)
1. A **costly/risky decision that cost ≥ 1 month of expenses** (from the 2×2) → `בפעם הבאה: {why}` + `🔁 לנסות את ההחלטה הזו אחרת` (rewind to `k`).
2. Else the biggest **chosen** leak ≥ 0.5 E (`tipFor` logic, `engine.js:2781`).
3. Else the weakest principle with ≥ 3 decisions and mastery < 0.6 (`learnHtml` "כדאי לחזק").
4. Else the world-mechanic tip (`tipFor` `:2783-2785`).

### 3.6 Layout: one phone screen on top, details below
- **Top (≤ 1 screen at 390 px):**
  - title + stars + near-miss;
  - **money graph** (net worth line + liquid band; cushion < 1 month shaded red; T2 recession bands from `econPath.truth`; ≤ 3 annotations from `st.marks`, e.g. "משבר · הלוואה כפויה", "קנית את המכבסה");
  - the 5 dimension facts (§2.5) as one-liners;
  - the one suggestion + rewind CTA;
  - sticky primary button.
- **Below, collapsed `<details>`:**
  - "החלטות ומזל" (the 2×2 + the existing bars);
  - "המשבר הגדול" (worst drawdown window from `tl` + the marks inside it + what you did);
  - "מול היריבים" (per-dimension table vs 4 ghosts, each with its rule card);
  - life story (absorbs the overlay);
  - achievements, library, lesson.
- The graph is an inline SVG built from integers (extend `spark()` to two series, axis labels in RTL with `dir="ltr"` numbers). No chart library.

---

## 4. Practice rewind

### 4.1 Replay → branch → continue works today [OBSERVED]
Script `/tmp/research-t6/scripts/rewind.mjs`. 16 games on HEAD (w1–w4) + 12 games on WT (w1–w3; the WT snapshot of w4 crashed in a pitch scorer that was being edited and is already fixed in the current tree). Policies: tapper/cautious/smart/random, capped at 60 months.
- **Exactness:** `replay(replayConfig(st), st.actions)` equals the live state in **28/28** games.
- **Decision points**, derived from the log alone (replay step by step and note a pending non-auto event with ≥ 2 enabled options before each `c`): **11–95 per game**.
- **Branch test:** at 6 decision points per game (0–95% through the game), replay the prefix, choose a *different* enabled option, then play 30 more rolls in both branches with the same tie-break PRNG. **168 branches, 4,257 rolls compared:**

| Compared after the different choice | Identical |
|---|---|
| dice | **4,257 / 4,257** |
| landing tile | **4,257 / 4,257** |
| all shared RNG streams (dice…index, + dd, cycle, rival, listing in WT) after each roll | **4,257 / 4,257** |
| card shown on landing | 4,254 / 4,257 |

The 3 card differences are **state-dependent presentation, not different draws**: a business tile shows "manage your business" instead of an offer once you own one (2×, after `start` vs `pass`), and a payday/edu card title differs after a plan change (1×). The RNG states were equal in all 3.

**Conclusion:** stream independence holds. A branch replays the same dice and the same cards, with only your decisions changed. That is exactly the pedagogical promise.

### 4.2 Comparison limits to explain in the UI (Hebrew copy sketch)
1. `אותן קוביות ואותם קלפים — רק ההחלטות שלך שונות.` (true for 99.9% of landings, [OBSERVED])
2. `לפעמים משבצת נראית אחרת כי המצב שלך שונה (למשל כשיש לך עסק).`
3. **Sealed outcomes repeat:** the same negotiation answer, the same pitch result, the same deal truth. So `בענף התרגול אתה כבר יודע מה קרה. ההשוואה מראה מה הייתה עושה ההחלטה *בקלפים האלה* — לא אם היא הייתה נכונה מראש.` The branch's decision still gets the **ex-ante** score.
4. Life and story events that depend on your situation may differ later (T3 chains, career triggers).
5. `ענף תרגול לא נותן כוכבים, הישגים, ⚡ או מקום בטבלה.`

### 4.3 Timing (60-month games, 268–293 actions)
| | Node (box), min–median ms | Chrome 1× | Chrome 4× | Chrome 6× |
|---|---|---|---|---|
| Full replay, w1/w2/w4 | 16–28 / 24–57 | 19–47 / 34–66 | 86–98 / 109–153 | 118–130 / 165–298 |
| Full replay, w3 (heaviest) | 63–231 / 115–385 | 77–118 / 122–341 | 105–228 / 576–661 | 356–405 / 533–1439 |
| Prefix to mid-game | 6–46 | 9–72 | 38–114 | 59–373 |
| Timeline rebuild by replay (metrics at each payday) | 29–288 | 21–328 | 87–1785 | 150–843 |

Sources: `timing_*.json`, `bench_browser.json`. Load average 2–8 throughout.

**Reading:**
- Jumping to a decision point costs **~0.1–0.4 s on a phone-class CPU** (w3 up to ~1 s under load). Show a short "מחזירים את הזמן…" overlay.
- No snapshot cache is needed. If w3 proves slow on devices, keep in memory a serialized state every 12 months of the current session and replay from the nearest one. That needs a `replayFrom(state, actions)` helper. A UI-side loop works, but an engine export is cleaner.
- Server verification replays the same work (w3 ~0.1–0.4 s on this box), well inside edge limits.

### 4.4 Storage and flow
- **Original preserved:**
  - **Live free/learn game:** the original stays in its slot (`rr2-save-free-<w>` / T4 `rr2-save-learn-<w>`) and is **never written by a branch**.
  - **Finished game:** the lobby deletes the free save at the end today (`lobby.js:1208`). Keep `rr2-last-game` = `{cfg, actions, tl, endLite, at}` (~4–6 KB, one per device, replaced by the next finished free/learn game). `endLite` = the result fields the comparison screen needs.
- **Branch slot:** `rr2-save-branch-<w>` (full state like any save, 15–50 KB). It sits under the `rr2-save-` prefix, so T1's `saves.js` classifies it, backs it up and never evicts it (`saves.js:9,15`).
  - One active branch per world.
  - Branch metadata `rr2-branches` = `[{w, origin:'live'|'last', originKey, k, month, label, at}]` (≤ 4, < 1 KB). Add it to `SWEEP_KEYS` (`saves.js:12`).
  - Worst case: 4 branches × 50 KB + 4 KB, well under the ~5 MB origin quota alongside T1's backups.
- **A branch is a T4 learning game:** `learn:true` on `mode:'free'` (T4 D-1) with `S.ui.branch = {k, originKey}`. It inherits every T4 rule (rollCost 0, no stars, achievements, ⚡ or boards; lessons still unlock). No new mode string, no new reward rules.
- **Creating a branch:**
  1. `S2 = E.replay(cfg, actions.slice(0, k))`;
  2. set `S2.learn = true`. This needs the engine to treat `learn` as data, not cfg: replay with `cfg.learn = true`. **T4 requires `replayConfig` to carry `learn`.** Put `learn` into the cfg passed to `replay`, so the prefix is replayed as a learn game from turn 0 (rollCost never affects outcomes, `engine.js:27`);
  3. write the branch slot;
  4. `startGame({…, resume:true})` on that slot.
- **UI entry points:**
  1. End screen: the focused suggestion and each 2×2 example get `🔁 לנסות אחרת`.
  2. In-game sheet (free/learn only): "רגעי החלטה" list (month · card · what you chose), built by the log scan of §4.1 or from `dq.decisions[].k`.
  3. Branch banner: `🧪 ענף תרגול — המשחק המקורי שמור` with `חזרה למקור` and `השוואה`.
  4. Comparison: two lines on the money graph (original vs branch, same months) + the 5 facts side by side + the limits text (§4.2).
- **Flag:** add `rewind` and `rivals` to `js/flags.js` `DEFAULTS`/`ALLOWED` (default `false` until QA). The PRACTICE_ONLY gate from engine-robustness.md §6 is not in the current `flags.js`; T6 adds it: `flag('rewind', {ranked:true}) → false`.

### 4.5 Naming conflicts to resolve before implementation
- **`js/practice.js`** is the rewind controller in engine-robustness.md §4.4 **and** the engine-lane practice-questions module in T4 E-10. → Call the rewind controller **`js/rewind.js`** (shell lane).
- **Action code `'Q'`** is used by **T3** (`resolveStory`, T3 D2/§3.3) **and T4** (`answerPractice`, T4 D-7/E-10). The TASK_BOARD decision gives `Q` to T3. → T4 must pick another letter (e.g. `'K'`, which is free today). T6's proposed codes are `W` (continue after win) and `X` (retire). `B` stays reserved for rivals variant M (T3 §0.2).

---

## 5. Ranked: rewind must be impossible to exploit

### 5.1 Vectors and guards
| # | Vector | Today | Guard |
|---|---|---|---|
| V1 | Rewind UI in a ranked game | no UI | Client gate: hidden and refused when `ranked()` (`game.js:123`) or `RANKED.has(mode)` (`game.js:689`). The flag is forced off in ranked. |
| V2 | Server checkpoint fails to load → silent restart from turn 0 with the same seed | **fixed in WT by T1**: `rankedFail()` (`game.js:382,469-470`) | keep it, and add a test |
| V3 | Devtools: restore an older local save with a higher `ui.seq` → it is preferred over the server (`game.js:471`) | open | Client: prefer local only if `isPrefix(srv.actions, local.actions)`. Server: append-only trigger (§5.2) + verify prefix (§5.3). |
| V4 | Forge a checkpoint (arbitrary state accepted, SECURITY_REVIEW §3.4) | open (harmless for results: verify replays from turn 0) | The trigger rejects a log that does not extend the stored one |
| V5 | Practise a live daily/weekly as a free game with its seed | possible only for someone who already has the seed (rr_begin); the ranked share text carries only the base link, no seed (`lobby.js:1492`) | "Practise this challenge" is allowed only after `ends_at` and after the player's own result is finished |
| V6 | Ghost data as a lookahead tool | n/a (new) | R3: never past the player's month during play |
| R | **Residual:** offline lookahead. The seed + public engine let a player simulate an open daily, or explore offline and come online with one clean line (checkpoints queue while offline, `game.js:131-146`). | inherent | Cannot be removed while the engine runs client-side (engine-robustness.md §4.4.4; SECURITY_REVIEW §3.5 seed pepper). Optional soft signal: audit large log jumps (`new_len − old_len > 60`) for review, never auto-reject (it would punish real offline play). |

### 5.2 Migration (PROPOSAL, additive, needs owner approval)
File drafted at `/tmp/research-t6/sql/t6_append_only.sql`. In the repo it would become `supabase/migrations/2026MMDD_t6_append_only_checkpoint.sql`.
- **What it adds:** 2 new tables (`game.t6_settings` with the mode `log|enforce|off`, `game.checkpoint_audit`), 1 trigger function `game.tg_checkpoint_append_only()`, and 1 `BEFORE UPDATE OF checkpoint ON game.results` trigger.
- **What it does not touch:** no `rr_*` signature or body, and no column change. That matters because the live `rr_checkpoint` body is not in the repo, so the trigger works without knowing it.
- **Rule:** if the old checkpoint has a non-empty `actions` array, the new one must be at least as long and `jsonb_path_query_array(new, '$[0 to oldLen-1]') = old`.
  - `log` mode records the divergence and accepts.
  - `enforce` raises `diverged_checkpoint` (PostgREST returns it as `message`, like `stale_checkpoint`).
  - `off` is the kill switch.
- **Backward compatible:**
  - Honest v3 and v4 clients only ever append. The T2 v3→v4 migration does not touch `actions` (`engine.js(WT):274-288`).
  - Older v3 clients keep working.
  - A checkpoint without `actions` is allowed only when the stored one has none either.
- **Client follow-ups:**
  - `net.js ERR.diverged_checkpoint = 'המשחק הזה המשיך במכשיר אחר — טוענים את השמירה מהשרת'`;
  - `game.js pumpCheckpoint` (`game.js:131`) treats that code like a resume from the server.
- **Tested locally [OBSERVED]** (scratch PostgreSQL 16, mock `game.results` + `rr_checkpoint_mock` reproducing the observed owner/stale/size behaviour; `sql/test_out.txt`). The log was from a real 174-action w1 game:

| Case | Result |
|---|---|
| first checkpoint; append; identical resend | accepted |
| branch that starts **at** the stored end | accepted (indistinguishable from honest play, which is fine: the stored state is *before* that choice) |
| choice already stored, then a branch from before it with a higher turn, `log` mode | accepted + audit row `diverged 79→94, turn 26→30` |
| same, `enforce` mode; a shorter log with a higher turn; a state without `actions` | `ERROR: diverged_checkpoint` |
| 6,000-action log (`MAX_ACTIONS`): append vs diverge | ~8–10 ms per call including parsing a 50 KB literal; typical games (≤ 700 actions) ≈ 1 ms [HYPOTHESIS by scaling] |

### 5.3 verify-result change (Edge Function deploy, needs approval; engine pin unaffected)
- **`index.ts` ROW** (`supabase/functions/verify-result/index.ts:78-90`): add `case when jsonb_typeof(r.checkpoint->'actions') = 'array' then r.checkpoint->'actions' end as ck_actions`.
- **`verify_core.js`:** add `isPrefix(prefix, actions)`. In `verifyGame` (before replay):
  ```js
  if (Array.isArray(row.ck_actions) && !isPrefix(row.ck_actions, actions)) return { ok: false, error: 'rewind:checkpoint_prefix', result: null, diff: null, cfg };
  ```
  The row is stored as `verified = false` (sorted last by migration t15b).
- **Tested [OBSERVED]** (`scripts/prefix.mjs`): after a jsonb round trip through PostgreSQL, 4/4 real logs pass, and a shorter or diverged log fails.
- **Tests to add:** `tests/verify.test.mjs` cases for prefix pass/fail/missing.
- `verify_core.js` is not part of the engine pin (`build-edge.mjs` hashes the engine bundle only), so this does not force an engine re-pin.

---

## 6. Continue after win (deferred from T4 D-11)

### 6.1 Today [CODE]
- `checkEnd` (`engine.js:2684-2692`) ends the game when the goal has held for `GOAL_HOLD = 2` paydays. `finalize` (`:1913`) sets `st.over`, `st.result` and `phase:'over'`, and `rollDice` then throws `game over` (`:670`).
- `game.js endGame` (`game.js:1106`) shows the celebration and life story, then emits `game:end`.
- The lobby records stars (`P.recordGame`, `lobby.js:1192`) and **clears the free save** (`lobby.js:1208`).
- Free mode has no time limit (`timeUp = mode !== 'free' && …`, `engine.js:2687`).
- So nothing can continue, and the state is deleted.

### 6.2 Minimal design [HYPOTHESIS]
- **Scope:** `mode:'free'` (including `learn`). Never daily/weekly/challenge/history.
- **Engine** (one pinned change, rides the same re-pin):
  - `continueAfterWin(st)` requires `st.over === 'won' && st.mode === 'free'`. It sets `st.afterWin = {m: st.month, result: st.result}`, `st.over = null`, `st.result = null`, `st.phase = 'roll'`, then calls `act(['W'])`.
  - `checkEnd` with `st.afterWin`: the goal no longer ends the game. It ends on bankruptcy, on `retire(st)` (`act(['X'])`, allowed between events), or at `afterWin.m + 120` months.
  - The second result carries `afterWin: {winMonths, winStars, sinceWin: {nwDelta, passiveDelta, happinessDelta, months}}`.
  - Add `replay` cases `W`/`X` and verifier `CODES` parity (ranked logs containing them fail replay, which is correct).
- **Lobby:**
  - Win end screen (free/learn): a secondary button `🌴 להמשיך לחיות אחרי החופש`. The save is not cleared on a free win until the player either continues or leaves the end screen.
  - The continuation's end screen does **not** call `P.recordGame` again (stars/best/unlocks were recorded at the win). Gate on `e.end.afterWin`.
  - It shows "what freedom bought you": the money graph from the win month, free-time months, happiness, and passive still ≥ expenses?
- **Teaching value:** it shows that freedom has to keep holding (lifestyle creep, crises after the win). It reuses `GOAL_HOLD` wording.

---

## 7. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| Ghost cost on low-end phones | jank, battery | Worker + idle fallback + cache. Compute only while the end screen or the board is visible if no Worker exists. `rivals` flag defaults off until measured on a real device. |
| Ghost lookahead (R3 broken by a future UI) | ranked unfairness | A single accessor `ghostView(month)` that clamps to `S.month` while `!S.over`, plus a test |
| Archetype policies dominate or look silly | wrong lessons | Reuse T2 §13.5 A4 (no archetype best in > 60% of cells) and add a T6 check: each archetype best in ≥ 1 cycle bucket |
| Engine fields (tl, marks, luckLog, k, W/X) miss the v4 release | another save bump and re-pin | Land them with T2/T3 in `v4Defaults`, or use the UI-side fallback (§3.3) |
| Branch farming of rewards | free stars and unlocks | A branch = `learn:true` (T4 rules), with recordGame/achievements gated |
| localStorage pressure (branches + T1 backups) | save failures | Branch metadata ≤ 4; branch slots follow T1 quota handling (`saves.js` S7 toast) |
| Append-only trigger rejects a legitimate two-device game | a confused player | `log` mode first (watch `checkpoint_audit` for a week), a clear Hebrew message, and the client reloads the server state on `diverged_checkpoint` |
| Production DB / function changes | outage | All additive, with the mode switch as the kill switch. **Owner approval required.** Apply via `apply_migration` only after approval. TASK_BOARD: no writes to Supabase in this wave. |
| `Q` code and `js/practice.js` name collisions (T3/T4/T6) | broken replay or merge clash | §4.5: T4 changes its letter, and the rewind controller becomes `js/rewind.js` |
| Timings come from a loaded 2-core box | wrong budget | Re-measure on a real mid-range Android in T7 (CDP-throttled numbers here are only a proxy) |
| Offline lookahead in ranked (residual) | cheating by experts | Documented as inherent. Optional audit of log jumps, the seed pepper (SECURITY_REVIEW §3.5), and a server-held RNG in the long run. |

**Open questions for the director/owner:**
1. Ghosts (G) for P0 and the listings market (M) for later. Do you agree?
2. Should ghosts appear on daily/weekly boards for everyone (after their own result), or only on the personal end screen?
3. Do you approve the append-only migration (log → enforce) and the verify-result prefix check, as production changes?
4. Should "continue after win" be P1 or P2?
