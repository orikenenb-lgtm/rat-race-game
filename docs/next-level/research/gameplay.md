# Next Level · Phase A research · Gameplay & Economy

Scope: why the game feels "roll the dice and pick the right thing", which existing systems can carry real strategy, what the fairness/replay rules allow, and concrete designs for the owner's brief (strategic action, due diligence, mentor levels, rivals, economic cycle). Repo state: branch `feat/rat-race-next-level` @ 706c0ff. No existing file was changed.

Labels: **[OBSERVED]** = I ran it (numbers below are from my runs) · **[CODE]** = read in code (file:line) · **[HYPOTHESIS]** = design proposal, not implemented or tested.

How the [OBSERVED] numbers were produced:
- `node tools/sim.mjs 40 <w> --quiet` for w1..w4. That is 40 games per character × policy, with the sim's own fixed seeds.
- Scratch scripts in `/tmp/gp/`, outside the repo. They import `js/engine.js` and do not change any file.
  - `probe.mjs`: 195 tapper games (15 seeds × 13 characters) that record the engine's own `choose().decision`.
  - `probe2.mjs`: 130 games (10 seeds × 13 characters), looking at deals and at the decisions that scored below 100.
  - `sim2.mjs`: a copy of `tools/sim.mjs` with two extra policies, 30 games per row.
- All runs used `nice`, so on the 2-core box a world takes about 25 s at 40 games.

---------------------------------------------------------------------------------------------------

## 1. The turn loop, end to end [CODE]

`rollDice` (engine.js:669) → `landing` (:1149) → `describe` (:1295) → `choose` (:1883) → back to `'roll'`.

**`rollDice`**
- Always draws 2 dice from the `dice` stream (:676). The tutorial only re-maps the sum (:677-680).
- Every payday tile the pawn touches calls `payday()` (:687).
- A double gives either +8 🔋 or `L.peek` (+10% negotiation chance, :692-697, used at :1367).

**`payday()` (:706)**
1. Pre-draws 4 `life` draws (burnout, raise, side income, side seed; :711).
2. Runs managed businesses (`monthlyBusiness` :879, 3 draws a month from each business's own sealed `st.bizRng` stream, :883).
3. Applies cash, then `monthlyLife` (:812), then `monthlyIndex` (:967, 2 `index` draws), then `monthlyWorld` (:1050, FX drift from the `drift` stream, angel signals and exits).
4. `ensureCash` (:639): the emergency fund pays first, otherwise a forced loan plus a credit-score hit.
5. Auto-invest (:755), savings interest (:760).
6. Goal streak (:762, `GOAL_HOLD = 2` at :397), credit score (:766), bankruptcy test (:772).

**`landing()`**
- Draws the tile's card from its deck. `drawCard` (:1139) reshuffles from the tile's stream when the deck is empty.
- Seals every hidden outcome at draw time:
  - deal `negR` (:1190);
  - pitch `hidden.mult/revealIn/signal` (:1274-1285);
  - life `r` (:1203);
  - crypto fate path at coin launch (:161-172);
  - business seed (:927).
- Some "news" is applied at draw, never in `choose`: rate (:1239, :1258), FX (:1240, :1266), revaluation (:1241), crisis index hit (:1163).

**`choose()`**
1. Re-describes the event.
2. Scores the decision (`decisionRecord` :1894 → `optionU` :1976).
3. Applies `CHOOSE[type]` (:2167).
4. Logs `['c', optionId, qty?]` (:1899).
5. Closes or keeps the card open: trade buy/sell, market sell, a negotiation that succeeds (:2128), business decisions, tax report.

**Actions allowed any time (each one logged):**

| Function | Line | Log code |
|---|---|---|
| `takeLoan` | :2529 | `L` |
| `repayLoan` | :2542 | `R` |
| `payCredit` | :2556 | `C` |
| `setPlan` | :2567 | `P` |
| `moveSavings` | :2575 | `S` |
| `setSideReport` | :2586 | `T` |
| `setAutoInvest` | :2594 | `A` |
| `invest` (index fund, only between events) | :2601 | `I` |

### Event types and options [CODE]

| type (tile) | options | pre-marked `primary` rule |
|---|---|---|
| payday (P) | `ok` / `plan:<id>` / `save` / `raise` | `suggestPlan` (:1358-1364): rest if 🔋<40, study early, else work. `save` is **never** primary (:1402). |
| edu (E) | plans + `course` | same as payday (:1415) |
| deal (O,?) | `buy` · w2 `buyVar/buyFix` · w3 `buy/buyHedge` · `offer:5/10/15` · `pass` | buy only if net > 0, net-worth OK and cushion OK (:1535-1546). Offers are never primary (:1549-1552). |
| trade (M, O, index) | `buy`(qty) · `sell`(qty) · `auto:on/off` · `done` | `done` (:1582) |
| doodad (D) | `pay` · `inst3` · `credit` · `sub` · `skip` | `skip` for wants, `pay` for needs (:1600, :1604) |
| market (M) | `ok` · `sell:<n>` + `done` · `give:k` (w4 match) | `ok`/`done`. Most kinds are auto or single-option (:1608-1676). |
| crisis (X) | `ok` (+ `okSellGold` in w3) | `ok`. Single option in 96% of cases (§3). |
| mystery (?) | `ok` · quiz `a0..a2` | quiz: none (:1705) |
| life (L) | 1–3 options | `personal` events: none (:1474). Others: `E.primary` (:1476): car = `fix`, course = `take`, health = `public`, reserve = only `go` (life.js:120, :132, :158). |
| business (K) | offer: `start/pass` · manage: `biz:*`, `biz:sell`, `ok` | offer: start only with no loan and a 3-month cushion (:1440). Manage: an option literally labelled "ההמלצה: …" (:1453, primary :1461). |
| bank (B, w2) | `refi` · `prepay` · `ok` | refi if rate ≤ `lockBelow` 4.5 (w2.js:37, engine :1736) |
| upgrade (U, w2) | `up:<n>` · `trim:<id>` · `pass` | best payback ≤ 24 months without a loan (:1753) |
| fx (F, w3) | `hedgeImp/hedgeExp/ok` | the dollar sits on your "good side" of `ref` (:1774-1775) |
| shipping (S, w3) | `insure/ok` | exposed and fee ≤ 15% of cash (:1790) |
| pitch (A, w4) | `inv:0..2` · `pass` | small check, team+traction ≥ 4, hype ≤ 2, 2-month cushion (:1807) |
| giving (G, w4) | `give:0..2` · `pledge` · `pass` | `give:0` if eff ≥ 1 and the cushion is OK (:1818) |
| tax (T) | `ok` (+ `report`) | `ok` (:1427). Auto when there is nothing due. |
| index (I) | trade window + standing order | `done` |

`describe` keeps exactly one primary: the card's own choice, else a SAFE id (`ok/done/pass/skip`), else the first enabled option (:1309-1313).

**What the UI reveals [CODE]**
- Buy buttons carry `netLabel`, the monthly result after the cost of any loan (engine :1503-1506, ui.js:594-596).
- The primary option gets the CSS class `primary` and gets keyboard focus (ui.js:111, :571, :602).
- Effect choices get the tag "הבחירה של המנטור" (ui.js:641). Plans get a `rec` tag (ui.js:628-629).
- "תראה לי את החישוב" (ui.js:743-744) shows the ROI equation and `roiVsLoan`. That text states a verdict: "ההלוואה משתלמת / עולה יותר ממה שהנכס מכניס" (engine :1532-1534).
- `d.warning` covers a cushion of less than one month (:1539).
- Negotiation shows each acceptance chance with a bar (ui.js:644-650).
- After a decision a verdict pill appears (ui.js:898-930).
- Mentor lines rotate by `(turn + month) % n` (:624-628). The "after" line explains the result (buyAsset :1940-1950).

## 2. Quantifying "just tap the highlighted button"

### 2.1 Sim summary (40 games per character × policy) [OBSERVED]

| world | tapper in time | tapper median months | tapper ★★★ | smart in time | smart median | smart ★★★ / ★★+ | greedy med | cautious med | cautious / greedy / reckless / random in time |
|---|---|---|---|---|---|---|---|---|---|
| w1 | 76% | 53 | 0% | 91% | 43 | 18% / 55% | 56 | 49 | 92 / 50 / 1 / 0% |
| w2 | 70% | 47 | 0% | 90% | 40 | 8% / 55% | 43 | 56 | 70 / 59 / 6 / 10% |
| w3 | 91% | **42** | 0% | 88% | 43 | 19% / 52% | 44 | 51 | 82 / 83 / 21 / 16% |
| w4 | 90% | 50 | 0% | 92% | 47 | 13% / 50% | 54 | 56 | 74 / 66 / 18 / 16% |

**Reading:** in w3 and w4 the tapper is as fast as the reference "smart" heuristic, or faster (w3 median 42 vs 43), and escapes in time 90–91% of the time. These numbers agree with `tools/balance-report.md`, which has 300 games and shows tapper in time at 69–94%.

### 2.2 What separates tapper from smart (30 games per row, scratch copy of the sim) [OBSERVED]

| world | smart | tapper | tapper + 3-month fund only | tapper + smart between-roll habits (fund, repay, plan) |
|---|---|---|---|---|
| w1 | 93% · med 40 · ★★★ 18% | 78% · 53 · 0% | 74% · 56 · 3% | 80% · 48 · 7% |
| w2 | 90% · 39 · 8% | 73% · 47 · 0% | 67% · 47 · 9% | 77% · 43 · 12% |
| w3 | 92% · 43 · 24% | 90% · 45 · 0% | 90% · 47 · **18%** | 91% · 45 · 19% |
| w4 | 94% · 47 · 13% | 91% · 50 · 0% | 92% · 50 · 3% | 91% · 50 · 4% |

**Reading:**
- The tapper's 0% ★★★ comes almost entirely from one button that is not highlighted: `save`, the emergency fund (:1402). ★★★ needs a fund of 3 months or more (:2702).
- In w3 the highlighted buttons plus that one habit reach 18% ★★★, against 24% for smart.
- The real skill gap exists mostly in w1/w2: rolling-credit and loan avoidance, the fix/variable choice, upgrades. It is small in w3/w4.

### 2.3 Where the highlighted button agrees with the engine's own scorer (195 tapper games) [OBSERVED]

| Measure | Value |
|---|---|
| Events per game | 74 (14,480 total) |
| Auto events (no decision) | 8% |
| Events with a single enabled option | 14% |
| Scored decisions per game | 45.5 |
| **Share of the tapper's scored decisions that got score 100** | **81.1%** |
| Trade windows (≈ 10 per game) | tapper presses `done`; these are never scored |

| card | n | auto/single | tapper mean score | score = 100 |
|---|---|---|---|---|
| payday | 1541 | 0% | 100 | 100% |
| edu | 335 | 0% | 100 | 99% |
| doodad | 1023 | 5% single | 99 | 99% |
| fx | 284 | 23% single | 100 | 100% |
| upgrade | 269 | 0% | 96 | 95% |
| bank | 233 | 18% | 95 | 95% |
| deal | 3772 | 22% auto | 84 | 67% |
| pitch | 717 | 0% | 78 | 63% |
| business | 489 | 16% auto | 73 | 69% |
| crisis / tax / mystery cash | 676 / 419 / 151 | 96–100% single | — | — |
| quiz (no primary, tapper guesses) | 127 | — | 29 | 29% |
| life: car (`primary: fix`) | 82 | — | 72 | **6%** |
| life: course (`primary: take`) | 73 | — | 14 | **14%** |

Deals (130 games):
- 2,050 deal cards were not auto. Primary was buy on 1,241 and pass on 809.
- **The primary never recommended a buy with net ≤ 0 (0 cases).**
- On golden deals it was buy 55 of 61 times.

The top reasons the tapper scored below 100:

| Count | What the tapper did | What the scorer rated higher |
|---|---|---|
| 357 | `pass` | `offer:*` |
| 144 | `buyVar` | `offer:*` |
| 152 | pitch check | another check size |
| 155 | `buy`/`buyVar` | flagged "השאיר אותך בלי כרית" |
| 65 | course `take` | `skip` |
| 45 | car `fix` | `bus` |
| 43 | market `done` | a sale |
| 42 | business `pass` | `start` |

**So the "right answer" is almost always pre-computed and shown.** Where it is not, the primary rule and the evaluator disagree (§3.3), so the player is told two different things.

## 3. Why decisions are easy

### 3.1 Root causes [CODE]
1. **Deals have no hidden information.** The one number that decides the deal (net monthly after loan cost) is printed on the button (:1503-1506), in green or red. Only pitches, crypto fates and the negotiation reply are sealed.
2. **The trap marker leaks.** The mentor question `c.q` sits on 16 of 17 "bad" cards in w1/w3/w4, and on only 4 good cards there [OBSERVED, scan of `world.deals`]. When a question appears, the card is a trap.
3. **A smart default on every card** (§1 table). The UI focuses it and tags it "הבחירה של המנטור".
4. **Verdict text inside the "calculation"** (`roiVsLoan` :1533, "ההלוואה משתלמת").
5. **About a quarter of events are not decisions:** 22% auto or single-option (§2.3), e.g. crisis, tax, most market cards, mystery cash.
6. **Dominated options exist** (§3.2), so even the cards that show several options often have one obvious answer.
7. **Time never costs anything.** A deal not taken is gone, but nothing competes for it, and there is no cycle that makes "wait" or "hold cash" right at some times and wrong at others. The only macro movement is w2 rate cards and drift, and the w3 USD drift (:1054-1065).

### 3.2 Top 10 no-brainer / dominated decisions
| # | decision | why it is a no-brainer | file:line |
|---|---|---|---|
| 1 | Deal buy vs pass | The net/month after the loan is on the button. Primary = net > 0 plus cushion. 6 of 20 w1 asset deals have cf ≤ 0, openly. | engine.js:1503-1506, :1535-1546; w1.js:73-79 |
| 2 | Trap deals | Carry a warning question (`q`) that the good deals mostly lack | w1.js:78-79 (examples); deal `q` used at :1492 |
| 3 | Doodad `credit` vs `inst3` | Both are offered when `c.inst`: rolling credit at 5% a month whose principal never shrinks, against 3 payments at 0%. `inst3` strictly dominates. | :1601-1602; w1.js:20 `creditPct: 5` |
| 4 | Doodad want: `skip` | Skipping is primary. The happiness from a toy is glow that halves every month (:852), so buying a want is almost never right. Tapper 99% score 100. | :1604, :2305, :852 |
| 5 | Payday plan | `suggestPlan` is primary. The scorer compares plans only with plans (:2034). Tapper 100%. | :1358-1364, :2034 |
| 6 | Tax filing `report` | Always better than a 10% year-end penalty; there is no case for not reporting | :1428, :959-963 |
| 7 | Bank `refi` (w2) | Primary iff rate ≤ 4.5 and the fee fits in cash; the sim's smart rule is the same | :1736; w2.js:37; sim.mjs:244 |
| 8 | FX hedge (w3) | Primary iff the dollar is on the good side of `ref`; tapper 100% | :1774-1775 |
| 9 | Trade windows | Card prices sit far below or above the ticker's known `start`, so "buy ≤ 0.55 × start, sell ≥ 1.5 × start" is enough. Crypto is a sealed fate. Index: "buy and never sell". | sim.mjs:48-50; :161-189 |
| 10 | Business manage | One option is literally "ההמלצה: …" (module `suggest`) | :1453, :1461 |

Also no decision at all: crisis (single `ok` 96% of the time, :1688), tax (`ok`, :1427), reserve duty (one option, life.js:132), most market kinds (auto when not relevant, :1620-1664).

### 3.3 Where the primary and the evaluator contradict each other [OBSERVED + CODE]
- **Negotiation.** It is never primary, yet the evaluator often prefers it. `optionU` for an offer adds the saved shekels as money, also in the passive-goal world w1 (:1982, plus `discount` in :1981). A discount can make an offer on a negative deal "beat" passing (357 cases).
- **Cushion.** The primary allows buying while keeping ≥ 0.5 month (or net ≥ 15% of expenses) (:1541). The evaluator flags `noCushion` below 1 month (:1981) and gives the −4 penalty (:2023).
- **Car / course.** `primary: fix/take` (life.js:120, :158), but `optionU` counts the bus's permanent saving × 24 and does not value the course's study months (:2003).
- **The emergency fund `save`** is required for ★★★ but never highlighted. The scorer gives it 100 whatever happens, as a "good habit on its own" (pool = [o], :2034).

### 3.4 Systems with no real trade-off today [CODE]
- **Happiness:** adapts 10% a month toward a set point of about 55 (:850). Its only hard consequence is the ★★★ gate (≥ 60, :2701). The sim's smart policy rests below 57 (sim.mjs:79), so it works as a threshold to check, not as a tension.
- **Credit score:** changes the loan spread and cap (:249-253) and gets hit by forced loans (:650). Voluntary borrowing at 3% a month in w1 (w1.js:19) is rarely worth it anyway.
- **Loans:** the buttons already compute "loan + buy" for you (:1505). Manual `takeLoan` has almost no use; the tapper never touches it (sim.mjs:150).
- **🔋 power:** a real resource, but `suggestPlan` solves it ("rest if < 40").

## 4. Existing systems that can carry deeper strategy (without duplication) [CODE]

| system | where | what it already gives | gap / natural extension |
|---|---|---|---|
| Monthly plan (time) | `setPlan` :2567, `planOptions` :1343, `planEffects` :1350, `PLANS` life.js:63-69 | how many hours you **sell** (salary vs 🔋 vs happiness, study → +20% gross, side → business at 15 months) | nothing about **where your attention goes in money matters**. That is the slot for a "focus" (§6a). |
| 🔋 power / burnout | `L.energy`, `burnoutChance` :791, `monthlyLife` :821-822 | a cost for overtime, study, side work, owning a business (:889) | can be the shared budget that a focus also spends, so plan and focus compete |
| Happiness | :793-795, :846-853 | ★★★ gate | could gate negotiation/raise (confidence) or rival "reputation"; keep it light |
| Emergency fund | `moveSavings` :2575, `ensureCash` :641-645, `saveSuggestion` :1341 | pays shortfalls first, ★★★ gate | becomes valuable in a downturn (cheap deals, harder credit): a cycle (§6e) makes holding cash a real choice |
| Negotiation | `negChance` :1365, `negotiate` :2110, sealed `negR` :1190 | real EV trade-off: worth it on thin deals, not on great ones (lose the card on "no", :2115-2118) | the odds are fixed per % (0.8/0.55/0.3). Could depend on DD findings ("seller in a hurry"), cycle phase, or a "network" focus. |
| Credit score | `creditScore` :792, `bandAdj` :251, `loanCap` :253 | rate and cap | a "debt" focus could raise it or refinance; the cycle could tighten caps |
| Businesses | business.js `simulate` :300, `decisionOptions` :590, `canDecide` :292 (3-month cadence); engine `bizDecision` :906, `monthlyBusiness` :879 | a deep operating model (price, staff, marketing, draw, manager, sale) | reachable **only on a K tile** (:925-930). An "ops" focus could open it from payday. `applyShock` (business.js:542) is the hook for the cycle. |
| Index / auto-invest | `monthlyIndex` :967, `setAutoInvest` :2594, `invest` :2601 | DCA, crash luck accounting (:980) | return is i.i.d. (invest.js:373). A cycle-dependent drift would make "buy the dip" a skill. |
| Loans | `takeLoan/repayLoan/payCredit` :2529-2565, `loanFor` :1321 | leverage with a w2 rate link | cheap credit in good times, expensive in bad times (cycle) |
| Life dilemmas | `LIFE_EVENTS` life.js:96-169, `createLife` :1201, `applyLife` :2135 | personal choices without a primary (:1474) | fine as they are; fix car/course scoring (§3.3) |
| Decision quality / luck | `logDecision` :191, `decisionValue` :198, `optionU` :1976, `decisionRecord` :2027, `recordDecision` :2050, `learningOf` :2060 | a 0–100 score from public info only, luck kept separately (`st.dq.luck`, 6 parts) | luck does not cover deals (nothing hidden), skipped crises or golden draws. DD and the cycle add sealed truth, and luck parts for them come naturally. |
| Sim | tools/sim.mjs policies :104-179, `--ablate` :415-427 | 6 policies, ablations for w2–w4 | no archetype or regret matrix, no dominance test (§7) |

## 5. Randomness, fairness, replay [CODE]

**Streams**
- mulberry32 streams, named `STREAMS = [dice, deal, doodad, market, crisis, mystery, special, drift, life, index]` (rng.js:57).
- Each stream is seeded by its index (rng.js:58-62). The comment says **"append only"**.
- Each business also has its own stream in `st.bizRng[key]` (:900).

**Principle (engine.js:3-4)**
- Draws are consumed by **where the pawn lands, never by what the player decides**.
- Every card draws a fixed number of values: deals 4 (card, golden roll, golden index, `negR`) (:1187-1190); pitches 3; life 1 plus the deck; paydays 4 `life` + 2 `index` + 1 `drift` (w3).

**Sealed at draw (hidden from the player; a rival must not see these either)**
- `p.negR`, `p.hidden` (pitch multiplier, reveal time, signal), the crypto `coin.path`, `L.raiseR`, life `p.r`, `L.sideSeed`, `st.bizRng`.
- `L.inflationYear` is next year's inflation, pre-drawn (:138-143).
- **`st.decks`** holds the order of future cards.
- What is legitimately public: everything in `describe()` output and `metrics()`, plus the world's static odds texts.

**Replay contract**
- `act()` (:208) records `r l c L R C P A I S T`. `replay()` (:2631-2654) switches on exactly these.
- The server verifier whitelists the same set: `CODES` (supabase/functions/verify-result/verify_core.js:7).
- Entries must be `[code, ≤ 2 primitive args]`, strings ≤ 40 characters (:27-32).
- The verifier replays with a **pinned engine bundle** (tools/build-edge.mjs header, docs/VERIFY_INTEGRATION.md §4). Any engine change needs a re-pin.
- `replayConfig` (:2656) = `{worldId, charId, seed, mode, maxMonths, scenarioId, bailout, tutorial}`. Any new game option that changes outcomes (mentor level, rivals on/off, cycle on/off) must be added to it, and to the verifier's `configFor` (verify_core.js:47-62), which builds cfg from server fields only.

**Constraints for new code**
- No approximated Math (exp, log, pow…) or non-integer `**` in the replayed modules (tests/determinism.test.mjs:33-44). Use `bank.js ipow/dexp/dlog/dpow`.
- **Saves:** `SAVE_VERSION = 3` (:22). `deserialize` migrates only `v === 1` (:216) and throws `save_incompatible` on anything else. game.js:226 then discards the save (an in-flight ranked game would restart).
- New streams for old saves: fill them as `migrateV2` does (:232-233).

## 6. ⚡ roll energy vs 🔋 in-game power [CODE]

| | ⚡ "אנרגיה" (real-time) | 🔋 "כוח" (in-game) |
|---|---|---|
| owner / state | js/energy.js, localStorage `rr2-energy`; MAX 25, +1 every 6 min, CAP 99 (:11-13) | `st.life.energy` 0–100, start 70 (life.js:72) |
| spent by | each roll in free and history play: `rollCost` (engine.js:27) → game.js `usesEnergy` (:397-402) → `spend()` (:496-505) | plans (life.js:63-69), business ownership (:889), young kids (:822), work load (:821) |
| exemption | ranked modes: `rollCost` returns 0 for daily/weekly/challenge (:27); game.js also skips when `CFG.resultId` is set (:399). History mode **does** cost ⚡. | — |
| bonuses | daily +10, achievement +2, correct quiz +1, friends/referral (lobby.js:467-468, :516-526; net.js:54-58) | double with an odd face: +8 (:694) |

**Where they get confused**
1. Both are called **energy** in code: `L.energy`, `effects.energy`, `doubleEnergy` (common.js:139), `out.double.kind: 'energy'` (:694), against energy.js.
2. "⚡ ספרינט 24 חודשים" uses ⚡ for the daily *sprint* (lobby.js:743, :746).
3. The quiz reward is "+1⚡" for *understanding*, right next to 🔋 effects (game.js:671).
4. The HUD has both chips: 🔋 at ui.js:255 and ⚡ at ui.js:1026-1037 / index.html:33. Only the 🔋 tooltip explains the difference (ui.js:267).

[HYPOTHESIS] Rename the in-game resource in code to `power`/`koach` (UI already says "כוח") and keep ⚡ only for rolls. Use another icon for the sprint (⏱).

Any "learning mode" must also block the lobby's ⚡ bonuses (achievements, quiz). Otherwise unlimited rolls farm ⚡ for free play.

---------------------------------------------------------------------------------------------------

## 7. Designs [HYPOTHESIS]

Common rules for every design:
- Every new random value comes from a **new appended stream** with a **fixed number of draws per payday or card**, whatever the player decides. Existing streams stay identical, so current balance numbers remain comparable.
- Every new player action is either a card option (logged as `c` automatically) or a new top-level code. A new code must go into `act()`, `replay()`, verify_core `CODES` and the bundle re-pin.
- Bump to `SAVE_VERSION = 4` with a `migrateV3` (fill streams, default fields). Release at a day boundary, because in-flight ranked saves would otherwise be thrown away (game.js:226).
- Evaluators (`optionU`) use **only what the player could see**: priors when information was not bought, the revealed values when it was.

### (a) Monthly strategic focus — "מוקד החודש" (extends `setPlan`, does not duplicate it)

**Concept**
- The **plan** answers: how many hours do I sell for salary?
- The **focus** answers: where does my unpaid attention go this month?
- One focus per month. It spends 🔋 (the same budget as the plan), so overtime + an active focus risks burnout. That is a real tension, not a second plan menu.

| focus | cost | benefit | when it is NOT the best |
|---|---|---|---|
| `scout` (חיפוש עסקאות) | −5 🔋 | next deal card: DD level 1 free (§b), plus 1 extra public listing from the board (§d) | no cash or loan room to buy; recession with tight credit |
| `debt` (טיפול בחובות) | −3 🔋, a small fee | refinance or roll credit into a loan (lower `loanPct` band for 6 months), credit +10 | no debt, or debt that is already cheap |
| `ops` (ניהול העסק) | −6 🔋 | open the business panel without a K tile (`bizDecision` :906); obeys `canDecide` (business.js:292) | no business, or the last decision was under 3 months ago |
| `frugal` (ביקורת הוצאות) | −2 happiness | one `trimOffers` (:1869) in any world (today w2 only) | expenses already trimmed; happiness near the ★★★ gate |
| `network` (קשרים) | −4 🔋, +1 happiness | +0.1 negotiation (reuse `L.peek` :1367), +raise chance | no deal or raise coming up |
| `research` (מחקר שוק) | −3 🔋 | sharper cycle signal (§e) for 3 months | early game, when it is too soon to act on it |
| `none` | 0 | 🔋 recovers | — |

Planning ahead: an **agenda** of up to 3 queued focuses. Doing the same focus 2 months in a row gives a streak bonus (e.g. scout ×2 → DD level 2 free). Switching costs only the streak.

Engine touch points:
- life.js: a `FOCUS` table next to `PLANS`.
- `payday()` (:706): apply focus effects after `monthlyLife`.
- `DESCRIBE.payday` (:1386): add `focus:<id>` options (no primary at levels hint/pro). Logged as `c`.
- `decisionRecord` (:2034): score focus options only against other focus options.
- New export `setFocus(st, id, slot?)` → **action `['F', id, slot]`**. Add to `replay` and to `CODES`.

Save: `st.life.focus`, `focusStreak`, `agenda: []`, `focusMonths: {}`.

Sim:
- policies `noFocus`, `always<X>` for each X, `adaptiveFocus`;
- acceptance: every focus is the best single focus in at least one (world × situation) segment and worse than `none` in at least one.

### (b) Deal due diligence — hidden truth, revealed at a cost

**Data**
- Each deal card gets `dd: {risk 0–3, flags: [...]}` in world data.
- Flags are public hints: "המוכר ממהר", "רק תמונות מבחוץ", "שכירות צפויה (לא חוזה)", "השכנים מדברים על בנייה".
- At `createDeal` (:1185), draw **3 values from a new `dd` stream, always**:
  - a cf-truth factor;
  - a hidden one-off repair;
  - a value-truth factor.
- Their distribution widens with `risk`, and `risk` is correlated with the visible flags. A trap can be **suspected from public hints** but is never revealed for free.
- Remove the `q`-on-traps leak: either give every card a neutral question, or tie `q` to flags.

**Options**
- `inspect:1`: ₪ about 1% of cost, or −3 🔋. Shows a range.
- `inspect:2`: ₪ about 3%. Shows the exact numbers.
- The card stays open, the same way a successful negotiation returns `false` (:2128). Logged as `c`, so **no new action code**.
- Buying applies the truth in `addAsset` (:571). The UI shows "שכירות מוצהרת ₪X / נבדקה ₪Y".

**Trade-off:** inspection wastes money on obviously great or obviously bad cards and pays off on borderline or flagged ones. Negotiation odds can depend on findings ("seller in a hurry" → +chance).

Evaluator: `optionU` deal branch (:1981) uses the expected cf given the revealed information. Luck = truth − expectation, as a new `st.dq.luck.dd`.

Save: `p.dd` on the pending card, `a.dd` on the asset, `st.stats.inspections`; stream `dd`.

Sim: policies `ddNever / ddAlways / ddFlagged / ddBorderline`. Target: `ddFlagged` beats both extremes, and `ddAlways` is worse than `ddNever` in at least one world.

### (c) Mentor levels (`guide` / `hint` / `pro`)

- `createGame({mentor})` → `st.mentorLevel`. Add it to `replayConfig` (:2656) and to the verifier's `configFor`.
- `describe()` (:1309-1313):
  - `guide` = today's behaviour;
  - `hint` and `pro`: compute the pick as `ev.suggested` (internal), set every `primary` to false, and drop verdict wording. That means: `roiVsLoan`'s "משתלמת" (:1533) becomes plain numbers; "ההמלצה:" (:1453) becomes "התוכנית האוטומטית"; the UI "הבחירה של המנטור" tag (ui.js:641) goes; pre-questions turn generic.
- **`hint`:** a new export `requestHint(st)` → **action `['H']`**. It returns `ev.suggested` plus the top-2 `optionU` reasons and sets `st.dq.hints++`. The end screen shows decisions taken with and without a hint.
- **`pro`:** no verdict pill during play (ui.js:916). The full post-analysis appears at the end (`learningOf` :2060, plus decision-by-decision `why`).
- Ranked: fix the level per mode (e.g. daily = `hint` for everyone, hints-used shown on the leaderboard) so seeds stay comparable.
- DESIGN-v3 §4 promises "primary-follower must still usually escape". Keep that promise **only for `guide`**.

Sim targets: guide-tapper in time ≥ 70% (it is 70–91% today); pro-tapper (random among enabled options, today's random policy 0–16%) ≤ 30%; smart unchanged.

### (d) Four rival archetypes (cheap deterministic shadow players)

- `st.rivals = [{id, cash, salary, expenses, loans, assets: [{k, cf, value, debt}], idxQty, savings}]`, each starting from the same character template as the player.
- Archetypes:
  - **saver** (6-month buffer, buys only net > 0 without a loan, 20% DCA);
  - **founder** (prefers `biz`, borrows when net > 0, runs a managed business with `BIZ.suggest`);
  - **diversified** (index 40%, one asset of each kind, 3-month fund);
  - **gambler** (maximum leverage, crypto, large pitch checks).
- Rivals act only at paydays, through the **same money formulas** (`assetCf`-style, forced loans, interest). No "income from nowhere": the sim asserts that a rival's net worth delta = cash flows + revaluations.
- **Shared listings board:** each payday draw 3 listings from a new deck `listing` and a new stream `rival`, with a fixed draw count (3 card indices + 3 DD truths + 4 policy-noise values). The player's `deal` deck is untouched.
- Information limit: a rival decides from `publicView(listing)`: flags and quoted numbers only, never `negR`, DD truth, `st.decks`, `inflationYear` or future streams. It sees the truth only if it pays the same DD fee.
- Two variants:
  - **A (ranked-safe):** rivals pick before the player each month and never react to the player, so the leftovers are identical for every player on a seed.
  - **B (free/learn, interactive):** a rival's intent is published one month ahead ("ענבל בודקת את המכבסה") and the player can preempt it with **action `['B', listingIdx]`**. Still deterministic from the action log.
- Touch points: new `js/rivals.js` (pure); `payday()` calls `rivalsMonth(st, out)` after `monthlyWorld`; `metrics()` adds `rivals: [{id, nw, passive}]`; the end screen ranks you against them.

Sim: each archetype played as a player policy (same code) across worlds × cycle paths. Acceptance: none wins more than 40% of (world × character × seed-bucket) cells.

### (e) Economic cycle that changes which strategy is best

- `st.econ = {phase: 'expansion'|'slowdown'|'recession'|'recovery', m, signal}`.
- Each payday: **2 draws from a new `cycle` stream, always** (transition + signal noise). The Markov matrix has minimum phase lengths and is defined per world.
- Effects (multipliers, applied without new draws):

| Phase | Effects |
|---|---|
| recession | deal `cost` −10–20% while `value` holds (cheap assets); `loanCap` ×0.7 and `loanPct` + band (:249-253) (credit is hard to get); `BIZ.applyShock` demand 0.85 (business.js:542); layoff card weight up through the existing `when/alt` substitution in `createLife` (:1204), so no extra draw |
| slowdown | crash chance up in `monthlyIndex` (:970 parameters) |
| expansion | rents and business demand up, cheap credit, deals priced above value |

- Expected effect on the best strategy: leverage plus business expansion wins expansions; cash plus a fund plus low debt wins recessions (buy cheap, survive layoffs); DCA is robust; a "research" focus lets the player act earlier.
- The public signal is a lagged, noisy indicator shown as headlines and a gauge. The true phase is revealed later (decision quality is judged on the signal, luck on the truth).
- w2 rate cards and w3 FX can be nudged by phase (they keep their own decks).

Save: `st.econ`, stream `cycle`; `metrics().worldIndicators.econ` = `{signal, label}` only.

Sim: an `adaptive` policy (follows the signal) against fixed archetypes, on fixed cycle paths. Acceptance: adaptive is best on average, but **each fixed archetype is best on at least one cycle path**; no archetype is worst everywhere.

### Proving there is no dominant strategy (protocol)

1. **Regret matrix:** policies {tapper@guide, tapper@pro(random), saver, founder, diversified, gambler, smart, adaptive} × worlds × characters × 4 cycle-path buckets. Metric: in time %, median months, ★★★ %. Fail if one policy is best in more than 60% of cells.
2. **Option dominance scan:** for every card type, over N seeds, how often a single option has the top `optionU`. Flag above 85% (needs excluded). Today this would flag doodad credit vs inst3, tax report, and payday plan (via `suggestPlan`).
3. **Ablations** (extend sim.mjs `--ablate` :415): for each new system, on/off. Every system must change outcomes in at least one world, and over-using it must hurt in at least one.
4. **Info-leak test:** rival and evaluator code must never read sealed fields. Wrap the rival and `optionU` inputs in a frozen public view and assert it in tests.
5. **Budget:** today one world at 40 games per row takes about 25 s on this box. A full matrix needs about 10× that: run it per world in separate processes, with N = 100.

## 8. Requirements (owner brief §8 / §12 / §14 / §15)

I only have the caller's summary of the brief, which groups items under §8, 12, 14 and 15 without saying which item belongs to which section, so rows are listed by item.

| requirement | status | evidence / note |
|---|---|---|
| Choosing paths | **not suitable now (ranked)** / missing | Landing is fixed by dice. Letting the player choose a tile would make deck consumption depend on decisions and break the "same cards for everyone" rule (engine.js:3-4). Possible in free/learn modes only. |
| One strategic action per month | missing | Only the time plan exists (`setPlan` :2567). See §7a. |
| Pay time/cost to check a deal | missing | Deals are fully transparent (:1484-1556); only pitch and crypto are sealed. See §7b. |
| Handle debt or business instead of chasing an opportunity | needs improvement | Loans and credit any time (:2529-2565), but the business is reachable only on a K tile (:925) and the bank only in w2 |
| Plan several months ahead (no duplication of the plan) | needs improvement | The plan persists, auto-invest exists; there is no agenda or commitment. See §7a. |
| Every action: cost, benefit, risk, understandable impact | needs improvement | Effect chips exist (ui.js:605-614), but 22% of events are auto or single-option [OBSERVED] |
| Every action has at least one situation where it is NOT best | needs improvement | Dominated: credit vs inst3 (:1601-1602), tax report (:1428), toys (glow :852) |
| No single always-winning strategy | needs improvement | tapper ≈ smart in w3/w4 [OBSERVED §2.1]; there is no regret test |
| No pressure clock on major financial decisions | exists | No decision timers in ui.js/game.js. Timers found only for ⚡ waits and checkpoints (game.js:49, :404-437). |
| Mentor adapted to level (beginner / intermediate / advanced) | missing | One mode; `primary` on nearly every card (:1309-1313). See §7c. |
| Reduce pre-marking of the right answer | needs improvement | primary + focus + "הבחירה של המנטור" (ui.js:641), `roiVsLoan` verdict (:1533), "ההמלצה:" (:1453), `q` leak on traps |
| Evaluate decisions on information available at decision time | exists, inconsistent | `optionU` uses public data only (:1961-1964), but it contradicts the primary (§3.3) |
| Separate decision quality from luck | exists, partial | `st.dq.luck` has 6 parts (:133, :2058); deals, crises and golden draws are not covered |
| AI rivals (cautious saver, entrepreneur, diversified investor, risk lover) with the same info limits | missing | §7d; sealed-field list in §5 |
| No hidden money creation for rivals | missing (design constraint) | §7d: same formulas plus a net-worth reconciliation assert in the sim |
| Free learning mode with no ⚡ limit | missing | `rollCost` is 1 for free and history (:27). The lobby's ⚡ bonuses must be disabled in that mode (lobby.js:467-526). |
| Balance checks for dominant strategies | needs improvement | sim.mjs policies plus `--ablate` for w2–w4 only (:415-427); no matrix or dominance scan |

## 9. Risks and open questions for the orchestrator

- **Stated target vs owner's wish.** DESIGN-v3 §4 says "primary-follower must still usually escape". Making the game harder means this promise holds only at the `guide` level, and the owner should confirm that.
- **Ranked fairness.** New streams must be appended only. Rivals must be variant A in ranked modes. The mentor level must be fixed per mode. Any new cfg field goes into `replayConfig` and the verifier's `configFor`, followed by a re-pin.
- **Save bump to v4.** Without a migration path, every v3 save, ranked checkpoints included, is discarded (game.js:226). Add `migrateV3` and a release-day plan.
- **Scorer fixes come first.** Fixing the evaluator (negotiation money in the passive world, the cushion threshold, car/course, study value) is cheap and makes post-analysis trustworthy before mentor levels ship.
- **Learning mode.** Keep it out of the leaderboards and achievement-⚡ to prevent farming.
- **Facts from memory.** None of this report relies on memory.
