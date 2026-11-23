# E1 — Economy & balance research (team ב)

Worker E1 · 2026-11-23 · branch `feature/3d-world-upgrade` @ `e6f6035` · engine bundle `d1d75867c5b6` (same engine as `tools/balance-data`).
Scope: BRIEF §10–§14, §19, §29. Read-only on code. Every number below comes from runs made for this report (scratch harness in `/tmp/e1`,
which imports `js/engine.js` and `tools/sim.mjs` and writes nothing in the repo). Bots are not proof of human fun (§29).

## תקציר (Hebrew summary)

- **הכלכלה עקבית ברובה.** ‏144 משחקי fuzz ו־44,883 בדיקות מצב: אין NaN, אין מזומן שלילי בין תורות, השווי הנקי = נכסים − התחייבויות בכל בדיקה, והמשכורת שמגיעה שווה בדיוק לתזרים שהוצג לפני ההטלה. קנייה ומכירה מיידית של קרן מדד, לקיחה והחזר של הלוואה, והפקדה ומשיכה מקרן החירום מחזירות בדיוק לאותו מצב (1,990 בדיקות). סדר הפעולות ביום המשכורת ברור.
- **שני באגי מנוע מוכחים שמצדיקים כללים 5:** (1) **אפשר "לנפח" את דירוג האשראי בלי עלות.** לוקחים הלוואה ומחזירים אותה מיד: 29 סבבים מעלים את הדירוג מ־680 ל־850, וזה מוחק את הקנס על הלוואה כפויה. (2) **יעד ההכנסה הפסיבית סופר משיכת מזומן מעסק עם מנהל**, גם כשהמשיכה גדולה מהרווח. משיכה של כל הקופה במשך שתי משכורות מנצחת את w1, והחודש אחרי זה ההכנסה הפסיבית קורסת.
- **באג תצוגה אחד:** כשמובטל לומד, שכר הלימוד נגבה אבל לא מופיע בשורות ההוצאות (28 בדיקות).
- **ניצחון ואיזון:** חוב מקסימלי **לא** מקל לנצח (w1–w4: ‏75/50/67/58% בזמן, מול 89/64/75/69% לשחקן החכם). עבודה פעילה **לא** נספרת כהכנסה פסיבית (חוץ מהפרצה בבאג 2). חיסכון בלבד ו"קריירה בלבד" לא מנצחים אף פעם (0% בכל העולמות). קניית כל נכס מענישה (w2: 19% פשיטת רגל). **המוקד "ביקורת הוצאות" מנצח או משתווה לשחקן החכם בכל ארבעת העולמות**, וקיצוצי השדרוג ב־w2 נבחרים כמעט תמיד. כלומר הפחתת הוצאות זולה מדי.
- **ויתורים (§13):** האושר משפיע רק על הכוכב השלישי. גם בוט שעובד שעות נוספות בכל חודש, עם 16–23 שחיקות למשחק ואושר סופי 9–13, עדיין מנצח בזמן ב־56–61% מהמשחקים ב־w1, ‏w3 ו־w4. רק w2 מעניש באמת (22–25% ניצחון, 25% פשיטת רגל).
- **זמן (§10):** הטלה ממוצעת היא כ־0.7 חודש (1.43 הטלות לחודש). ב־31% מההטלות לא עובר חודש, וב־1.06% עוברים שני חודשים בהטלה אחת, בלי שום סיכום בממשק.

---

## 1. §11 — Definitions audit (how each quantity is computed, where it is shown)

| term (§11) | engine definition | file:line | shown |
|---|---|---|---|
| מזומן cash | `st.cash`, an integer number of ₪. Never < 0 between rolls: `ensureCash` takes money from the emergency fund first, then forces a bank loan in `autoUnit` steps | `js/engine.js:818-839` | HUD; sheet `js/ui.js:775` |
| נכסים assets | `totalAssetsOf` = cash + savings + holdings at market + angel paper + asset **market value** (before debt) | `engine.js:732` | sheet `ui.js:776` (total row) |
| התחייבויות liabilities | `loans + credit + Σ asset.debt` (mortgages / business loans) | `engine.js:692`, list `657-661` | sheet `ui.js:777` |
| שווי נקי net worth | `netWorthOf` = cash + savings − loans − credit + holdings + angel paper + Σ(value − debt). **Excludes pension** | `engine.js:532-536` | sheet `ui.js:778`; goal bar in w3/w4 |
| שווי נזיל liquid NW | **not defined.** The timeline column `liq` is cash + savings only, with no debt netted and no holdings (`engine.js:2810`) | — | nowhere as a named number (gap, see (a)) |
| הכנסה מעבודה job income | `payslipOf().net`. Gross → Israeli payslip (`life.js slip`), adjusted by the plan (overtime ×1.25, rest ×0.85, pay cuts) and the degree raise. Unemployment = 60% | `engine.js:428-449`, `life.js:43-54,62-68` | sheet payslip; `incomeLines[salary]` |
| הכנסה מעסק פעיל active business | Draws from owner-run businesses (`activeBizOf`) + expected side-plan income + temporary `incomeExtra`. Labelled "(…עובד בו — לא פסיבי)" | `engine.js:460, 424, 709, 630-632` | income lines |
| הכנסה פסיבית passive | `passiveOf` = Σ asset cf (after the mortgage) + **draws from managed businesses** + dividends − rental tax | `engine.js:513-518` | w1/w2 goal bar; income lines (no subtotal in w3/w4) |
| תזרים cash flow | `salary + side + activeBiz + passive + extra − expenses` | `engine.js:590` | sheet total `ui.js:774` |
| פנסיה pension | employee 6% + employer + severance deposited at each payday (not in a burnout month or while unemployed). Grows with the index (r + 0.25%/month). Severance is a sub-account | `engine.js:912, 1235-1236, 2946` | sheet `ui.js:779` ("not counted toward the goal") |
| קרן חירום emergency fund | `st.savings`. Interest minus 15% tax at each payday. **Pays first** when cash goes negative. Target 3 months (★★★ gate) | `engine.js:950, 820-825, 728-731` | sheet `ui.js:775` |
| עלות מימון financing cost | Bank loan and credit card are **interest-only lines** (`lineInterest` = balance × monthly % via `bank.js checkingMonth`). Mortgages are inside asset cf (`noi − debt×rate/1200` in w2, card cf elsewhere). `realWorldRates` shows the real comparison | `engine.js:392-415, 486-497, 562-575` | expense lines with a "real world" label `engine.js:643-644` |

### Specific checks

- **Loan balance vs monthly payment.** Consistent by design: every bank or card loan is a revolving interest-only line, so the monthly cost = balance × pct. The engine says so in the loan line (`engine.js:643` reality note). `loanUnitCost` matches the charged line in all checks. Mortgages also never amortize (`a.debt` is constant until a sale), so equity grows only through value changes. That is a teaching simplification, not a bug, but the sheet never says "interest only" for mortgages (display gap).
- **Net worth with and without pension.** The goal uses `netWorth` (no pension). `netWorthTotal = netWorth + pension` appears only in a separate sheet row (`engine.js:688`, `ui.js:779`). Consistent.
- **Buy / sell.** The index fund and tickers trade at one price with no fees (as the mentor line says). An immediate buy→sell with no prior holding returns cash and net worth exactly (fuzz). With an existing lot, the sale uses the **average cost** and realizes real capital-gains tax on the older lots (`engine.js:3439-3441`). That is correct, not an asymmetry. Assets enter net worth at `value` (a discount card gives instant equity, w3 `buyDiscount`). They leave at `value × card mult − debt − betterment tax` (`engine.js:2099`). A business sells for valuation + cash + receivables (`2098`), which matches `a.value` (`1124`).
- **Profit vs revenue vs cash (business).** `js/finance/business.js:500-590` keeps them apart: gross revenue, VAT, revenue, COGS, gross profit, opex incl. depreciation, EBT, corporate tax, net profit, cash change, draw, 30% dividend tax, automatic owner injection when the till goes negative. The report card explains cash vs profit (`business.js:874-883`). Sound. **But** the player's goal reads the *draw*, not the profit (finding B2).
- **Taxes.** Payslip (TAX_IL 2026 brackets, credit points, BL + health, pension), side income (marginal rate; monthly advances + accountant fee, or a year-end bill +10%), rental 10% track above the exemption, 25% real capital gains, 30% dividend on business draws, 15% on savings interest, 35% donation credit through the refund. Single source `js/data/tax.js`. **Not verified against official sources here (no network)**: hand to whoever owns §11 "verify real facts".
- **Standing orders.** Auto-invest runs at payday **after** `ensureCash`, as `min(order, cash)` (`engine.js:945-948`). It can never force a loan by itself, but **it is not shown as an outflow**: the sheet's "תזרים חודשי" (`ui.js:774`) says +X while cash rises by X − order (display gap). Subscriptions (`st.subs`) and monthly pledges are expenses. Subscriptions cannot be cancelled except by the frugal focus.
- **Rounding.** All stored money stays an integer: 0 non-integer cash, savings or loans in 44,883 checks. Interest is computed in agorot and rounded (`bank.js:351-363`).
- **NaN / impossible balances.** None (see §2).

## 2. Invariant fuzz (proof of consistency)

**Harness.** 4 worlds × 36 seeds, characters rotated, policies `random, blindTapper, reckless, gambler, smart, guideTapper`. Random story-inbox clicks. Played to 1.3× the month limit. Checks run after **every** `rollDice`, `choose`, `resolveStory` and between-roll action. Every 7th rest point also runs a symmetry battery on a serialized clone.

| invariant | checks | violations |
|---|---|---|
| all metrics finite (cash, savings, loans, credit, NW, cf, passive, expenses, salary, pension, totals, goal, every asset value/debt/cf, holdings) | 44,883 | **0** |
| cash, savings, loans are integers; loans, credit, savings, asset debt ≥ 0 | 44,883 | **0** |
| cash ≥ 0 at every rest point (between rolls) | ~14k | **0** |
| `netWorth == totalAssets − totalLiabilities` (±2) | 44,883 | **0** |
| Σ income lines − Σ expense lines == cashflow; expense lines == expenses | 44,883 | **28** → bug A1 (jobless + study) |
| passive == Σ non-salary, non-active, non-extra income lines | 44,883 | 0 |
| goal progress ∈ [0,1]; energy and happiness ∈ [0,100] | 44,883 | 0 |
| **payday amount == the cashflow shown before the roll** (no business, not on the side plan, no burnout) | every such payday | **0** |
| serialize → deserialize gives identical `metrics()` | 1,990 | 0 |
| index buy q → sell q (no prior lot) restores cash and NW | 1,990 | 0 |
| savings +1,000 → −1,000 restores state | 1,990 | 0 |
| takeLoan → repayLoan restores cash and loans | 1,990 | 0 |
| takeLoan → repayLoan leaves the **credit score** unchanged | 1,990 | **1,286 violations** → bug B1 |
| (info) bank loans above the voluntary cap | — | 3,892 states: forced loans have **no cap** (`engine.js:826-828`) |

No engine throws and no event loops. Outcomes of the 144 games: w1 14 won / 4 lost / 18 open; w2 12/13/11; w3 17/1/18; w4 15/9/12 (deliberately weak policies included).

## 3. §12–§13 — Strategy table (per world)

**Policies.** `smart` = the reference heuristic. `guideTapper` = follows the highlighted option. Archetypes = `js/systems/archetypes.js`. `f:frugal` = smart with the frugal focus. The new wrappers below are all built on smart:

- `maxDebt` borrows to the bank cap in every between-roll window.
- `noDebt` skips any buy that needs a loan and repays everything.
- `buyAll` takes the first enabled buy on every deal, business offer or pitch.
- `sideAlways` / `overtimeAlways` force that plan every month.
- `saveOnly` never invests, skips wants, takes the cheapest life option and moves all cash above 1 month of expenses into the fund.
- `career` studies, then works, asks for raises, keeps a 3-month fund and auto-invests 15% of salary in the index. It buys nothing else.

**Setup.** N = 36 per world × policy (12 per character in w2–w4, 9 in w1). The same seeds are used for every policy (paired). Free mode, cap 1.6× the limit. Quizzes are answered right. After each win the game continues 24 months under the same policy (`continueAfterWin`). **±8 pp sampling error at N = 36:** read differences under ~10 pp as ties.

| world | policy | in time | won ≤1.6× | median mo (p10–p90) | bankrupt | burnouts/game | final 😊 | win with cf<0 | goal still met 24 mo after win |
|---|---|---|---|---|---|---|---|---|---|
| w1 | smart | 89% | 100% | 48 (35–72) | 0% | 0.1 | 68 | 0% | 100% |
| w1 | guideTapper | 67% | 94% | 56 (31–105) | 0% | 1.7 | 72 | 0% | 100% |
| w1 | f:frugal | **92%** | 100% | 48 (31–71) | 0% | 0.0 | 65 | 0% | 100% |
| w1 | maxDebt / noDebt | 75% / 81% | 100% / 100% | 55 / 53 | 0% | 0.1 | 71 / 69 | 0% | 97% / 100% |
| w1 | buyAll | 47% | 92% | 70 (46–94) | 0% | 0.2 | 83 | 0% | 94% |
| w1 | sideAlways / overtimeAlways | 64% / 56% | 94% / 92% | 56 / 63 | 0% | **13.3 / 15.8** | **17 / 9** | 0% | 100% |
| w1 | diversified / saver / founder | 39% / 8% / 53% | 92 / 58 / 83% | 67 / 86 / 53 | 0–3% | ≤0.5 | 65–78 | 0% | 93–100% |
| w1 | saveOnly / career | **0% / 0%** | 0% / 0% | — | 3% / 0% | 0 | 62 / 65 | — | — |
| w2 | smart | 64% | 86% | 52 (35–104) | 0% | 0.2 | 76 | 0% | 84% |
| w2 | guideTapper | 53% | 75% | 54 (32–92) | 0% | 2.3 | 76 | 0% | **59%** |
| w2 | f:frugal | **69%** | 89% | 52 (33–87) | 0% | 0.1 | 67 | 0% | 78% |
| w2 | maxDebt / noDebt | 50% / 56% | 69% / 83% | 66 / 61 | 3% / 0% | 0.1 | 81 / 79 | 0% | 68% / 90% |
| w2 | buyAll | 17% | 22% | 55 | **19%** | 0.4 | 69 | 0% | 63% |
| w2 | sideAlways / overtimeAlways | 25% / 22% | 39% / 36% | 68 / 64 | **25% / 25%** | 23.4 / 21.7 | 11 / 11 | 0% | 86% / 54% |
| w2 | diversified / saver / founder | 36% / 6% / 39% | 50 / 22 / 50% | 67 / 95 / 48 | 0–3% | ≤1.6 | 75–79 | 0% | 75–78% |
| w2 | saveOnly / career | 0% / 0% | 0% | — | 3% / 0% | 0.5 | 64 / 65 | — | — |
| w3 | smart | 75% | 100% | 54 (45–80) | 0% | 0.1 | 76 | 0% | 94% |
| w3 | guideTapper | 75% | 100% | 51 (39–70) | 0% | 1.1 | 67 | 0% | 97% |
| w3 | f:frugal | **78%** | 100% | 54 (41–79) | 0% | 0.0 | 67 | 0% | 97% |
| w3 | maxDebt / noDebt | 67% / 72% | 100% / 100% | 55 / 56 | 0% | 0.1 | 77 / 76 | 0% | 94% |
| w3 | buyAll | 6% | 50% | 80 | 6% | 0.3 | 79 | 0% | 50% |
| w3 | sideAlways / overtimeAlways | 69% / 61% | 100% / 100% | 56 / 56 | 0% | 15.6 / 15.6 | 13 / 10 | 0% | 97% |
| w3 | diversified / saver / founder | 17% / 19% / 28% | 72 / 69 / 78% | 78 / 80 / 76 | 0% | ≤0.3 | 74–78 | 0% | 64–75% |
| w3 | saveOnly / career | 0% / 0% | 0% | — | 0% | 0 | 63 / 67 | — | — |
| w4 | smart | 69% | 92% | 62 (44–86) | 0% | 0.3 | 77 | 3% | 100% |
| w4 | guideTapper | 67% | 94% | 64 (48–95) | 0% | 2.2 | 72 | 0% | 100% |
| w4 | f:frugal | **78%** | 94% | 60 (43–88) | 0% | 0.2 | 67 | 3% | 100% |
| w4 | maxDebt / noDebt | 58% / 64% | 89% / 86% | 63 / 62 | 0% | 0.3 | 76 / 79 | 6% / 3% | 100% |
| w4 | buyAll | 36% | 67% | 71 | 8% | 0.4 | 83 | 0% | 96% |
| w4 | sideAlways / overtimeAlways | 56% / 56% | 89% / 89% | 62 / 62 | 0% | 20.4 / 19.6 | 15 / 9 | 0% | 100% |
| w4 | diversified / saver / founder | **75%** / 44% / 58% | 97 / 100 / 100% | 65 / 74 / 74 | 0% | ≤0.3 | 70–79 | 3–6% | 94–100% |
| w4 | saveOnly / career | 0% / 0% | 0% | — | 0% | 0.1 | 62 / 64 | — | — |

**Net-worth worlds at the moment of winning** (medians over winners):

| world | policy | liquid share of NW | angel paper share of NW | passive / expenses | 4%-rule income / expenses |
|---|---|---|---|---|---|
| w3 | smart | 0.58 | — | 2.89 | 1.9 |
| w3 | guideTapper | 0.13 | — | 5.08 | 1.6 |
| w4 | smart | 0.24 | 0.02 (max 0.09) | 2.47 | 0.8 |
| w4 | guideTapper | 0.06 | 0.05 (max 0.19) | 3.00 | 1.0 |
| w4 | maxDebt | 0.23 | 0.02 | 1.82 | 0.7 |

Liquid share = (cash + savings + holdings − loans − credit) / NW.

**Luck vs skill (paired seeds).** Share of seeds on which the first policy escapes earlier, or escapes while the other does not:

| pair | w1 | w2 | w3 | w4 |
|---|---|---|---|---|
| smart vs buyAll | 92% | 81% | 100% | 75% |
| smart vs overtimeAlways | 75% | 83% | 53% | 64% |
| smart vs guideTapper | 67% | 39% | 33% | 50% |
| f:frugal vs smart | 33% | 36% | 33% | 53% |

The rest are ties.

The engine's own luck ledger (`st.dq.luck`) correlates only weakly with months-to-win (Spearman ρ between −0.65 and +0.42 across cells, mostly |ρ| < 0.3). That ledger omits the biggest luck source, which deal cards you draw. So read the p10–p90 width as the luck measure instead: **smart's months span 35–72 (w1), 35–104 (w2), 45–80 (w3), 44–86 (w4).** For the same skill, the escape month varies by roughly ±40% of the median.

### Answers to §12 / §13

1. **Does dangerous debt make winning too easy?** No. `maxDebt` is 6–14 pp *below* smart in every world and slower. In w1/w2 loan interest is in `expenses`, so debt pushes the passive goal away. In w3/w4 the bank charges 3%/month (36%/yr), so idle borrowed cash loses net worth. Wins with negative cash flow are 0% in w1–w3 and 3–6% in w4. Forced loans are uncapped (`engine.js:826-828`), and bankruptcy needs *both* negative cf and NW < −10× expenses (`engine.js:959-965`). Even so, reckless leverage does not convert into wins. `buyAll` is punished (w2 19% bankrupt). The rule is sound.
2. **Does active work count as passive income?** Not by definition: owner-run business, side plan and temporary extra income are all excluded (`engine.js:460, 515, 590, 630`). **The exception is bug B2:** a managed business's *draw* is counted, and the draw can liquidate the till, so one-off business cash counts as "passive".
3. **How does saving count toward the goal?** In w1/w2 (passive goal) the emergency fund and cash count for nothing; only income-producing holdings do (index dividends ≈ 2.25%/yr net). In w3/w4 cash and savings count fully in net worth. `saveOnly` and `career` win **0%** everywhere: salary plus saving never reaches a 9M net worth or covers expenses passively within the limit. That is coherent with the game's thesis, but §13 lists "career and study" as a reasonable path. Here it is only a supporting path (study raises the salary that funds assets, A7), never a route of its own. Decision for the owner/director, see (c4).
4. **Are expense cuts balanced?** **No: they are the dominant lever.** `f:frugal` is best or tied-best in all four worlds (92/69/78/78% vs smart 89/64/75/69%). This matches the open gate A5, where f:frugal is best in 26 of 31 cells. In w2 the U-tile trim (−35% of a lifestyle line for 5 months of the cut, `w2.js:47`, applied `engine.js:3256-3264`) has **no happiness or energy cost at all**. It is the top option in 90–100% of its appearances (A7: `trim:e2` 99/99, `trim:e1` 126/139, `trim:e4` 99/109). The frugal focus at least lowers the happiness set point by 1 per cut (`engine.js:1028`).
5. **Can the player see what is missing?** Yes: `js/hudgoal.js` turns the engine's goal parts into "חסרה ₪X הכנסה פסיבית…", along with the hold rule. Gaps: the goal hold is 2 paydays (`GOAL_HOLD`, `engine.js:548`) while two engine comments still say 3 (`engine.js:951, 4878`; UI uses `need` correctly). There is also no "liquid NW" or "passive subtotal" in w3/w4.
6. **Does the win hold?** In w1, w3 and w4, yes: 93–100% of winners still meet the goal 24 months later and none went broke, and w3 winners have passive income of 2–5× expenses. **In w2 it is weakest:** 16–46% of winners no longer meet the passive goal 24 months later (smart 84%, guideTapper 59%, overtimeAlways 54%), because variable-rate mortgage costs move. Since `GOAL_HOLD = 2`, a rate-sensitive w2 win is often a snapshot. In w4 the 4%-rule income at the win covers only ~0.8× expenses, but measured passive income covers 2.5×, and angel paper is a small share (median ≤ 5%, max 25%).
7. **Real trade-offs between money, 🔋, time and 😊?** Partly.
   - **Energy bites:** burnout costs a month of pay + 30% medical + −15 😊 (`engine.js:901, 908, 1050`). Forcing overtime or the side plan every month costs 13–23 burnouts per game.
   - **Happiness has no mechanical effect on money, energy or events.** Its only uses are the ★★★ gate (`starThresholds` happy 60, `engine.js:4864`), the `balanced` achievement (`achievements.js:95`), the end-screen sentence (`engine.js:4981-4985`), decision scoring and the guide's plan hint (`engine.js:2717-2718`).
   - **Result:** `overtimeAlways` with final 😊 9–11 still escapes in time 56% (w1), 61% (w3), 56% (w4), vs smart 89/75/69%. Only w2 really punishes it (22%, 25% bankrupt).
   - **Time** is a real cost: study takes 8 months of tuition at −6 🔋, and the side plan takes 15 months before the business graduates.
8. **Dominant strategy?** No single policy wins every world. smart and the guide policy are comparable, and diversified is best in w4. But **the frugal focus is a dominant add-on everywhere**, and w2 trims are a dominant card choice. Debt-free play costs only 5–8 pp, so debt is a mild accelerator, which is healthy.
9. **Differences between worlds (§19).** They are real in the rules: passive goal + 3%/month loans (w1); a rate-linked loan and variable mortgages that make wins fragile (w2); FX + a 9M net-worth goal where wins are robust (w3); angel paper + impact (w4). Difficulty ramp, smart in time: 89 → 64 → 75 → 69%. w1 is easy and w2 is the hardest, which repeats the open gates A3/A8 (w1 smart 90%).

## 4. §10 — Time model (measured)

- **A roll** is a move of 2–12 tiles (two dice) on a 40-tile ring with paydays on the 4 corners (`js/worlds/common.js:27-31`). **A month** = passing or landing on a payday (`engine.js:865-869`). Everything monthly happens inside `paydayImpl`, in a fixed order (`engine.js:891-984`):
  1. 4 life draws
  2. story expiry
  3. business month
  4. side income
  5. burnout
  6. taxes and pension
  7. cash += cf
  8. month++
  9. life month (energy, happiness, CPI, yearly prices, side-tax bill)
  10. index and pension
  11. world mechanics
  12. cycle and focus rollover
  13. story month
  14. `ensureCash`
  15. auto-invest
  16. savings interest
  17. goal hold
  18. credit score
  19. bankruptcy check
  20. lessons
  21. timeline
- **Measured over 13,927 rolls:** 0 paydays 31.3% · 1 payday 67.6% · **2 paydays 1.06%**. That is **1.43 rolls per month**, so one roll ≈ 3 weeks.
- **Paydays inside a roll.** The client applies each payday mid-hop: a floating number, the cash and month counters update (`js/game.js:1136-1137, 1162-1168`). **There is no summary when one roll covers 2 months** (§10 asks for one). Paydays that are passed rather than landed on keep the remembered plan silently (`game.js:1183`).
- **Interest, energy, study and business** all accrue per payday, not per roll. 31% of rolls (an event with no month passing) therefore cost no time. That is fine, but it is invisible to the player.
- **Double-roll / double-charge guards:** `rollDice` throws unless `phase === 'roll'` (`engine.js:852`). A payday cannot be applied twice. The payday amount equals the shown cash flow (fuzz, 0 violations).

## 5. Prioritised findings and proposed fixes

### (a) Display-only (no outcome change)

| # | finding | evidence | fix |
|---|---|---|---|
| A1 | **Tuition is hidden while unemployed.** `payslipOf` returns `studyCost: 0` in the jobless branch, but `expensesOf` still charges `studyCost(st)`. The sheet's expense lines then sum ₪1,800–1,920 below the charged expenses | `engine.js:431-435` vs `519-520, 426`; line list `639`. Fuzz: 28 states, e.g. w3/exporter s447151 m6 (lines 13,000 vs expenses 14,920) | In `metricsRest` push `studyCost(st)` instead of `ps.studyCost`. *Outcome-neutral, but it lives in pinned `engine.js`: the bundle hash changes, so re-pin with no rules bump, or batch it with the rules-5 change.* A UI-only stopgap: show a "שכר לימוד" row equal to `expenses − Σ lines` when they differ |
| A2 | **Auto-invest is not shown as an outflow.** The sheet's "תזרים חודשי" overstates how much cash grows | `engine.js:945-948`; `ui.js:766, 774` | Under the total add "מתוכם הוראת קבע לקרן −₪X → למזומן +₪(cf−X)" (UI only, reads `m.index.autoInvest`) |
| A3 | **Two-month rolls have no summary** (§10) | 1.06% of rolls; `game.js:1136-1168` | After the hops, if `out.paydays.length > 1`, show one toast or card: "עברו 2 חודשים: משכורת ×2 = …, הוצאות …, שינוי במזומן …" from `out.paydays[]` (UI only) |
| A4 | **No liquid net worth and no passive subtotal in w3/w4** (§11) | definitions table above | UI: "שווי נזיל" = cash + savings + holdings − loans − credit (all in `metrics`). Add a passive-income subtotal row in every world |
| A5 | **Mortgages are shown without "interest only / no principal"**, and the loan line's reality note is not repeated for mortgages | `engine.js:643, 657-660` | A one-line label in the liabilities section (UI) |
| A6 | Time to the next payday is invisible (31% of rolls pass no month) | §4 | HUD chip "עוד N משבצות ליום המשכורת" from `boardInfo` / `st.pos` (UI) |
| A7 | Stale comments "3 consecutive paydays" while `GOAL_HOLD = 2` | `engine.js:951, 4878` | Fix the comments with the next engine touch (no hash concern if batched) |

### (b) Proven engine bugs worth a rules bump (rules 5, re-pin, verifier redeploy, owner approval)

| # | finding | proof | fix |
|---|---|---|---|
| **B1** | **Free credit-score farming.** `repayLoan` awards +6 (`CREDIT_DELTAS.loanRepaid`) on any repayment, including one made right after `takeLoan`, with no interest paid | `engine.js:3364-3370`, `bank.js:138`. Repro: w1/w2/w3 seed 7, 29 take→repay cycles → score 680 → **850**, `loanPct` 3.00 → 2.91 (w1). A "fair" score (605, after 3 forced loans) is restored to excellent in 26 cycles. It erases the −25 forced-loan penalty and the halved cap of the weak band (520–599). Fuzz: 1,286/1,990 symmetry checks | Award `loanRepaid` only for principal that was outstanding at the previous payday (track `L.loanAtPayday = st.loans` in `paydayImpl`, credit `min(amt, loanAtPayday − repaidSince)`), or at most once per month. Rules-gated (`R5(st)`), since the score feeds `loanPct` and `loanCap` |
| **B2** | **Passive-income goal counts liquidation of a managed business's till.** `passiveOf` adds `a.bizDraw`. `drawGross = min(b.draw, b.cash)` has no profit cap, presets reach ₪20,000, and the goal only has to hold 2 paydays | `engine.js:515, 1123`; `business.js:556-557, 774`; `engine.js:1169`. Repro: `owner` policy, w1, first toyshop. Apply the two legal card choices "hire manager" + draw ₪20,000, as `choose` does via `BIZ.applyDecisions`. **teacher seed 5**: passive 5,207 vs expenses 7,404 → 12,790 → 9,566 → **won at month 26**. **dev seed 4**: 16,756 vs 18,580 → 27,065 → 29,700 → won at 50. **teacher seed 2**: 3,653 → 10,751 → 6,743 → 3,763 (spike, then collapse). 2 wins out of 7 sampled toyshop games | For `goalMet` and `goalProgress`, value a managed business at its *sustainable* draw: `min(drawNet, max(0, valuation().normMonthlyProfit × (1 − DIV_TAX)))`, i.e. the trailing 3–12 month normalized profit, or require ≥ 3 months of history. Keep the cash effect as is. Rules-gated. *(Optional, same bump: raise `GOAL_HOLD` to 3 in w2 only, see c3.)* |
| B3 *(candidate, not a bug by itself)* | Forced loans have no cap, and bankruptcy needs NW < −10× expenses | `engine.js:826-828, 842, 959-965`; 3,892 fuzz states above the voluntary cap | Not needed for balance (debt does not win, §3). Keep unless the owner wants a "the bank stops lending" moment; if so, rules-gate it |

### (c) Balance changes (explicit, separate from visuals; rules 5 + a new `tools/balance-data` run, never compared across rule versions)

| # | change | why (numbers) | proposal |
|---|---|---|---|
| **C1** | **Make expense cuts cost something** | f:frugal ≥ smart in 4/4 worlds; A5 frugal best 26/31 cells; w2 trims top 90–100% (A7) | w2 U-tile trim: also `L.frugalCuts++` (the same set-point cost as the focus) and/or `costMonths` 5 → 8. Frugal focus: `frugalCut` 0.10 / 0.08 → 0.07 / 0.06, or lifestyle creep (a cut line recovers +2%/yr with CPI). Target: f:frugal best in ≤ 50% of cells and still best in ≥ 1 (A5) |
| **C2** | **Give happiness a mechanical bite** (§13) | overtime-always / side-always win in time 56–69% (w1/w3/w4) with final 😊 9–17 and ~15–20 burnouts | Reuse what exists, no new meter. For example, 😊 < 35 → raise chance × 0.5 and burnout threshold +5, or partner or job events weighted toward bad outcomes. Target: `overtimeAlways` in time ≤ smart − 25 pp in every world (now −33 / −42 / −14 / −13) |
| **C3** | **Durable wins in w2** | 16–46% of w2 winners fail the goal 24 months later (smart 84%, guide 59%, overtimeAlways 54%) | w2 only: `GOAL_HOLD` 3, or evaluate the goal at the *fixed-rate-equivalent* mortgage cost. Keep the A1 guide target (w2 guide is already 63%, below 65%), so pair it with an easier start, e.g. lawyer cash or the first deal |
| C4 | **Career as a real path or not** (§13) | career and saveOnly 0% in all worlds | Owner decision. If yes: let the degree or a promotion unlock a "senior" job event, or make a `pension`-backed early-retirement option count in w3/w4 (e.g. 50% of pension in a "freedom NW" for characters ≥ 45). If no: the guide says so explicitly ("משכורת לבד לא מוציאה מהמירוץ") |
| C5 | Difficulty ramp | smart in time 89 / 64 / 75 / 69%: w1 too easy (open A3/A8), w2 hardest | As the prior pass recommended. Do not reopen here: C1 alone will move w1 down (frugal is w1's cheapest lever) |

### Already sound (keep)

Debt does not win. Buy-everything is punished. Active and passive income are separated (apart from B2). Payday = the shown cash flow. Money is integer and finite, and net worth reconciles. Profit, cash and draw are separated inside the business. The emergency fund pays before the bank. Pension is excluded from the goal and shown separately. The rules are deterministic, and serialize round-trips.

## 6. Method notes and reproduction

- Policies, fuzz and analysis scripts live in `/tmp/e1/{fuzz,strat,analyze,frac,drain}.mjs`. They are scratch files, not committed, by instruction. They import `js/engine.js` and `tools/sim.mjs` `POLICIES` (smart, guideTapper, archetypes, `f:frugal`). The new wrappers are defined in §3.
- Strategy seeds: `9000 + i·13 + world·100003`. Fuzz seeds: `50000 + i·131 + world·7777`. Character = `i mod #characters`.
- N = 36 per cell, chosen for a shared 2-core box at load 8–11 (total ≈ 30 min). For gate decisions, rerun the chosen changes with `node tools/sim.mjs --matrix 100 wX`. Rules 4 throughout (`createGame` default). Do not compare these numbers with a rules-5 run.
- Not done: real-fact verification of tax and rate constants (no network), human playtests (§29: none invented), history mode `h`.
