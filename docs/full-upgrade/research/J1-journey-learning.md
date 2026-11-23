# J1 — Player journey, onboarding, stories, learning, recovery and end (teams א + ג, research worker J1)

Brief: `docs/full-upgrade/BRIEF.md` §3, §8, §9, §15, §16, §17, §18 (payday screen, money-management access).
Branch `feature/3d-world-upgrade` @ `c6c79a2`. Read-only research: no code edited, no git writes.

**How this was measured.**
- **Sims:** a private export (`git archive HEAD` → `/tmp/j1/wt`). Scripts are in `/tmp/j1/scripts`, not committed:
  - `journey.mjs` calls `tools/sim.mjs` `play()` with the `onRoll`/`onLanding` hooks. It ran 25 seeds × every character × {guideTapper, naive, smart, blindTapper} per world: 1,150 games.
  - `daily.mjs` ran the 24-month daily config: 15 seeds × each daily character × {guideTapper, smart}.
- **Browser:** `serve_copies.sh` on ports 9900–9902, the offline `FakeBackend` plus the guard, and Chrome with `--no-proxy-server`. The guard stayed clean (`assert_clean` passed) and the pages threw no errors.
- **Screenshots:** in `/tmp/j1/shots` (not committed). Phone = 390×844, desktop = 1300×820.
- **Pinned files:** "pinned" means the file is in the server engine bundle (`tools/build-edge.mjs collect()`). That covers `engine.js`, `life.js`, `practice.js`, `history.js`, `achievements.js`, `rng.js`, `data/{real,tax}.js`, `finance/*`, `systems/{chains,cycle,dd,dreams,focus,mentor,recap,rivals,rules}.js` and `worlds/*`. Changing any byte in them, text included, means re-pinning verify-result.
  - The bundle is at 844,429 of 900,000 characters (`FINAL_REPORT.md` §4).
  - `js/data/lessons-meta.js`, `js/data/characters-meta.js`, `ui.js`, `lobby.js`, `game.js`, `onboard.js`, `summary.js`, `hudgoal.js` and `library.js` are **not** pinned.

---

## 1. Measured numbers

### 1.1 Length of a normal run (free mode, rules 4)

| world | month limit per character | won runs: median months / median rolls (guideTapper · smart) | in time (guide · naive · smart · blind) | rolls per month | goal progress at half the limit (guide median) |
|---|---|---|---|---|---|
| w1 השכונה | teacher 52 · driver 64 · dev 66 · doctor 82 | 54 / 75 · 46 / 65 | 73% · 91% · 90% · 1% | 1.40–1.41 | 0.50 |
| w2 העיר הגדולה | 76 / 76 / 76 | 50 / 68 · 51 / 69 | 64% · 39% · 76% · 1% | 1.41–1.42 | 0.63 |
| w3 הנמל | 60 / 60 / 60 | 55 / 78 · 54 / 78 | 75% · 36% · 68% · 8% | 1.43 | 0.52 |
| w4 עמק העתיד | founder 70 · engineer 69 · social 84 | 63 / 87 · 59 / 83 | 72% · 72% · 80% · 5% | 1.40–1.41 | 0.51 |

These match `tools/balance-report.md` (N = 100 per cell) within sampling noise.

**A won run takes 65–87 rolls.**
- Wall clock per roll: `docs/next-level/verification/playtests.md:76,106,145` measured 7–12 s in the harness, plus about 20 s per human-read card and 60–90 s on deal cards. That puts a full run at roughly **20–40 minutes of active play**. This is an estimate from those numbers; it was not timed on a person.
- **⚡ gate:**
  - A roll costs 1 ⚡ in a normal free game (`js/engine.js:55-61`).
  - The cap is `MAX = 25` with one ⚡ back every 6 minutes (`js/energy.js:18-19`). A new player also gets 10 free tutorial rolls (`TUTORIAL_FREE_ROLLS`, `engine.js:35`).
  - So a first normal run has about 35 rolls before it stalls. The remaining 30–50 rolls need **3–5 h of refill or bonuses**, which means a normal run is spread over several sessions.
  - Learning mode, daily, weekly and group challenges cost 0 ⚡.

### 1.2 The "short challenge" that exists today

- The daily challenge (`engine.js:5059-5066`) runs 24 months in every world (`worlds/w*.js daily.maxMonths: 24`). It takes **34–35 rolls** (about 6–12 minutes by the same per-roll estimate).
- Almost nobody escapes in 24 months:

| world | guideTapper: wins / median progress | smart: wins / median progress (p90) |
|---|---|---|
| w1 | 0/30 · 11% | 0/30 · 55% (66%) |
| w2 | 0/30 · 21% | 1/30 · 52% (82%) |
| w3 | 0/45 · 20% | 0/45 · 38% (58%) |
| w4 | 1/30 · 24% | 2/30 · 32% (66%) |

- So the short challenge is in practice a **progress-% race**. The end screen already frames it that way: "הספרינט נגמר", "הגעת ל־X% מהחופש" (`lobby.js:1647-1649`, `:1700`).
- There is no short *guided* mode. The tutorial is part of a normal w1 run.

### 1.3 Lost runs: when a run becomes hopeless, and what happens next

**Method.**
- For every run that did not escape in time, I took its goal progress every 3 months.
- I looked up P(escape in time) among all runs of that world with progress within ±0.05 at the same month. Runs that had already won are excluded; all four policies are pooled.
- "Hopeless" = the first month at which that probability drops below 5%.
- Pooling includes player skill, so read these as an upper bound on how early the outcome is decided.

| world | lost runs analysed | hopeless at (share of the month limit), p25 / median / p75 | months left until the limit (median / p75) | choice cards (≥ 2 enabled options) in that tail, median / p75 |
|---|---|---|---|---|
| w1 | 131 of 145 | 0.47 / 0.56 / 0.80 | 27 / 36 (~38–50 rolls) | 26 / 38 |
| w2 | 164 of 165 | 0.36 / 0.55 / 0.71 | 34 / 49 | 33 / 49 |
| w3 | 154 of 160 | 0.65 / 0.70 / 0.85 | 18 / 21 | 21 / 24 |
| w4 | 86 of 128 | 0.57 / 0.73 / 0.86 | 21 / 34 | 14 / 23 |

**Reading.**
- A typical losing run is decided **at about 55–73% of the limit**. The player then plays another **18–34 months (25–50 rolls)** whose choices cannot change the star outcome.
- **In free mode nothing happens at the limit.**
  - `checkEnd` ends on time only when `mode !== 'free'` (`engine.js:4875`).
  - The HUD hides the limit in free mode (`ui.setMonth(m, 0)`, `game.js:1167`; `ui.js:329`).
  - So a losing free run never reaches an end screen unless the player goes bankrupt. Bankruptcy hit 13–55% of blindTapper games and 0–7 of 75–100 games for the other policies.
  - Abandoning a run means starting a new game, which deletes the save (`lobby.js:306`). That skips the summary, the focused lesson and "רגעי החלטה": `rr2-last-game` is written only by `endGame` (`game.js:1579`; `rewind.js:11`).
- The first card with ≥ 2 options comes on roll 1 (median). The tutorial intro card comes before any roll.

### 1.4 Screens measured in the browser

| screen | phone 390×844 | desktop 1300×820 |
|---|---|---|
| Welcome (`lobby.js:758`) | 1 primary button "יאללה, משחק ראשון ←" goes straight into the w1 tutorial game (teacher) | same |
| Intro card 1 ("המשכורת נכנסה 🎉") | 446 px, 44 words, 3 payslip rows, 3 buttons | 468 px |
| Payday card with plans ("קיבלת משכורת") | **1,219 px card, 14 buttons, 8 payslip rows, 4 plan tiles, 16 effect chips, 185 words**, focus section, plus a "טיפ" coach on top | **1,712 px (2.1 screens), 16 buttons, 8 rows, 5 plans, 20 chips, 274 words** |
| "הדוח הכספי" sheet (phone) | **2,978 px (3.5 screens)**. The money actions (invest / to-from fund / loan / repay) are at the bottom | side panel |
| HUD life row (phone) | 10 chips: 5 visible, 5 behind "⋯" (credit, econ, rivals, cpi, age) | all visible |
| End screen (`renderEndT6`) | graph + 5 dimensions + suggestion + rewind + after-win + 4 buttons above the fold. 10 collapsed sections below | same |

Shots: `01_entry_*`, `02_after_welcome_*`, `03_pick_*`, `04/05_intro_*`, `06_payday_*`, `06c_payday_mid_phone`, `07_sheet_phone`, `08_board_*`, `09_end_top_*` / `09b_end_full_*`.

---

## 2. Inventory vs the brief

Legend: ✅ exists · 🟡 partial · ❌ missing.

### 2.1 Journey (§3, §8)

| step | status | evidence | gap |
|---|---|---|---|
| Entry | ✅ | Welcome card: 3 lines + 3 buttons (`lobby.js:758-770`, strings `:542-544`). One tap starts a first game | — |
| Understanding the goal | ✅ | World goal meter `#hGoal` and goal panel (rule, gaps, 2-payday hold, star rows: `hudgoal.js:35-93`). Intro card 3 shows "🎯 המטרה הבאה" (`engine.js:4585-4591`). w1 coach "מד החופש" (`onboard.js:229`) | In free mode the month limit is hidden (`game.js:1167`). Star deadlines live only inside the collapsed goal panel |
| First game | ✅ | Tutorial w1 game with the free tutorial rolls | — |
| First decision | ✅ | Intro beat 2, washing machine: pay / 3 installments / DIY. Each option costs a different resource; "אין כאן תשובה נכונה אחת" (`engine.js:4541-4583`) | — |
| First success | ✅ | Goal chain cushion → asset → fund, with "הושג: … הבא: …" news (`engine.js:4549-4566`). Tutorial deal with a game-simplification note (`engine.js:858, 1459, 1670`) | — |
| Strategy | 🟡 | Plans, focus, mentor levels, rivals, DD. Archetype rule cards appear only at the end (`summary.js:330-350`) | No in-run "your path so far" (career / business / assets / index). Nothing invites a change of course at a clear price (§13) |
| Crisis | 🟡 | Crisis tile (`engine.js:2161-2178`): cost lines plus how it will be paid (`shortfallInfo`). Crisis chain with real options (`chains.js:224-262`) | The crisis tile has one option ("לשלם … ולהמשיך", plus selling gold in w3). Its cause and the player's exposure are not explained; see §2.5 |
| Recovery | 🟡 | Fund pays first, then a forced loan with the cost in a mentor line (`engine.js:818-840`). One bailout (`engine.js:1256-1275`). Crisis chain "אחרי הסערה" | No recovery plan offered after a forced loan or a crisis (what to do now, with prices) |
| End | 🟡 | Won / bankrupt / time-up (non-free) / after-win | A losing **free** run has no end at all (§1.3) |
| Understanding the result | ✅/🟡 | T6 summary: graph, 5 dimensions, focused suggestion, decision / luck grid, crisis, rivals, life story (`summary.js:294-365`, `recap.js`) | The suggestion text is broken (§2.4). No income-source breakdown |
| Retry | ✅ | "↻ אותו לוח שוב", "דמות אחרת", next world, rewind to a decision (`lobby.js:1987-2015`) | — |

**Shown at every moment (§8).**

| item | status | evidence | gap |
|---|---|---|---|
| Current state | ✅ | Cash, cash flow and month in the HUD | — |
| World goal | ✅ | Meter % | Phone shows "מד החופש 57%" |
| Available action | ✅ | Roll button with ⚡ cost, turn chip "זזים N צעדים", 📬 inbox chip (`ui.js:530`) | — |
| **Near goal** | 🟡 | Only during the tutorial goal chain (`metrics().nextGoal`, w1 tutorial game only, `engine.js:4551`), then the dream card if a dream was picked (`game.js:794-796`) | **Not shown in w2–w4, ranked or daily games, after the tutorial chain, or when there is no dream** (the default). This is where orientation is lost; see also playtest S2, "freedom went down 33% → 29% over 15 months" (`playtests.md:103`) |

### 2.2 Onboarding (§9)

| brief item | status | evidence |
|---|---|---|
| Money in / out | ✅ | Intro beat 1: net, fixed costs, left at the end of the month (`engine.js:4592-4595`; shot `05_intro_1`) |
| Decision with a price | ✅ | Beat 2 (washing machine), beat 3 "ככה זה השפיע" before/after cash, cash flow, 🔋 (`engine.js:4585-4591`) |
| Building stability | ✅ | Goal "חודש הוצאות בצד" → "🛟 חודש הוצאות בקרן החירום" (`GOAL_CHAIN`, `engine.js:4549`) |
| Creating an income source | ✅ | Goal "נכס ראשון שמכניס כסף" + tutorial deal + C-roi coach (`onboard.js:312-318`) |
| Receiving income | 🟡 | C-meter coach "הכנסה פסיבית X מתוך Y" (`onboard.js:286-291`); `cashflow` lesson on a payday with asset income | No dedicated "your asset just paid you ₪X" beat on the first payday after buying |
| Next goal | ✅ | Chain news ends with "סיימת את ההדרכה! 🎓". The dream card takes over only if a dream was chosen |
| Skip | ✅ | "דלג על ההדרכה" on intro beat 1 and on each core coach. It is saved in `S.ui.coach.skip` (`onboard.js:103-118`) |
| No forced repeat | ✅ | The tutorial runs only in a first w1 game. Hints are once per player (`rr2-reveal.coached`), with "בלי טיפים" (`onboard.js:146-187`) |
| Refresh after a break | 🟡 | The only signal on resume is "חזרת לחודש X" (`engine.js:5051`, `game.js:723-726`). ❓ → tour (5 steps) / legend / replay the tutorial (`onboard.js:423-440`) | No "since you were away" card (goal %, near goal, open 📬 items, last decision) |
| Progressive disclosure | ✅ (tutorial only) | Reveal schedule: fund at month 4, 😊 and tools at 6, credit at 10, age at 12, goal at the first asset or payday, impact at the 2nd deal, focus at the 3rd payday (`onboard.js:66-90, 297-311`) | Non-tutorial games show the whole HUD from roll 1. Phone hides 5 of 10 chips behind "⋯" |
| Character pros / cons before start | ✅ | 💪 strength / ⚠️ weakness / surplus / difficulty / month limit on every card for all 13 characters (`data/characters-meta.js`, figures test-checked; shot `03_pick_*`) | — |
| Dream linked to missions and reflection | ✅ | 4 dreams × 3 missions (`systems/dreams.js`), HUD card, toast, end-screen line, profile badges (`lobby.js:1153, 1465, 1968`) | Optional and off by default ("בלי חלום כרגע"). Not offered at the first-game welcome |

### 2.3 Stories and events (§15)

| brief item | status | evidence / gap |
|---|---|---|
| Ongoing stories: opening → choice → later consequence → response → summary | ✅ | 6 chains: car, move, career, side, friend, crisis (`systems/chains.js`). `remember` lines ("זוכר? …"), cross-chain lines (`CROSS`), outcome news, and an end summary of stories (`engine.js storiesOf`). In the T3 sims chains completed in 90–94% of runs, with ~1 chain item per 12 months (`balance-report.md` T3 table) |
| Exposure | ✅ | Crisis chain options depend on holdings (`when: 'auto' / 'idx' / 'start'`). Crisis tile loss depends on asset kinds (`kindLoss`) and salary (`noSalary`). Car chain only with a car (`NO_CAR_DOODAD`) |
| Preparation | ✅ | Fund pays before a forced loan (`engine.js:818-825`). Hedging and insurance in w3. No crisis before month 6 (`CRISIS_GRACE`) |
| Response | 🟡 | Rich in chains. **The crisis tile itself offers no response** (one option) |
| News tied to the cycle, not prophecy | ✅ / 🟡 | Headline every 3 paydays or on a label change, from the **public, lagged, noisy** label (`engine.js:1001`; `cycle.js:97-116`). Only **10 headlines (2 per label)**, so they repeat over a 50–80-month run. The newspaper overlay exists only in history mode (`ui.js:2115`) |
| Variety between runs | ✅ | Sealed entry odds: car / move 0.7, friend 0.65; trigger odds (`chains.js:263-269`). Chain start rates 30–82% per chain per world; 0 standalone repeats within 12 months (`balance-report.md`) |
| Values, family, relationships | ✅ | Personal cards score 100 for every option ("no-answer", `balance-report.md` A7 list; `LIFE_DQ`, `chains.js:278`). Friend chain is `dq: 'personal'` |
| Giving does not always pay back money | ✅ | Lending to a friend: 40% bad outcome (`chains.js:196`). w4 giving returns **impact**, not money (`worlds/w4.js:9-11, 57-58`). Lesson wording flagged in §2.4 (`giving`) |

### 2.4 Learning and feedback (§16)

| brief item | status | evidence / gap |
|---|---|---|
| Decision quality separate from outcome | ✅ | The verdict is scored on the information available at the time. The end grid has 4 cells (`recap.js GRID_TITLES`). Learning analysis splits luck (`ui.js:2011-2026`). Achievement "החלטה טובה, מזל רע" |
| Got / gave up / risk taken, instead of a bare score | 🟡 | The in-card verdict line and pill show **a 0–100 number + label + one "why"** (`ui.js:1742-1756`), e.g. "92 · החלטה חזקה · הכי משתלם לפי מה שראית". The impact panel *before* a choice shows before/after (`impactFor`, `engine.js:4442`). Nothing *after* the choice names what was gained, what was given up and the risk taken |
| Lesson library: search | ❌ | None (`lobby.js:773-793`) |
| Categories | ✅ | 9 Hebrew categories (`data/lessons-meta.js CATS`). Counts: invest 10, world 5, tax 13, money 12, debt 6, time 6, life 12, history 2, business 16 = **82 lessons** |
| New | 🟡 | "חדש" tag per card (`lobby.js:797`). No filter or "new first" view |
| Unlocked | ✅ | Locked cards show a teaser + how to unlock (`lobby.js:795-804`). Counter has/total |
| Link to the decision | 🟡 | "📍 למדת את זה בחודש X בעולם — "event" · number" (`lobby.js:806-819`, `library.js ctxOf`). It is not linked to the decision itself (no rewind / "see that moment") |
| Short explanation | ✅ | Text ≤ 160 characters + "עוד ▾". Worked example on **42/82** lessons |
| Game simplification vs reality | 🟡 | `sim` label on only **10/82** lessons (`lessons-meta.js`). Some simplifications are inline elsewhere (tutorial deal `engine.js:1670`; "במשחק: …" odds) |
| Misleading absolute rules in lesson names | 🟡 | 13 items listed below |

**Lesson titles and texts that teach an absolute rule.**
- The title and text live in the **pinned** `life.js` / `finance/business.js` (`engine.js:45 LESSONS`).
- Cheapest fix: a UI-side `displayTitle` / `displayText` override in `js/data/lessons-meta.js` (not pinned), read by `library.js norm()` and the lesson toast. Fold it into the engine at the next re-pin.

| id | today (title · problem) | proposed |
|---|---|---|
| `good_debt` | "חוב טוב": the title labels a category of debt as good. The text adds the condition | **"מתי הלוואה משתלמת?"** |
| `buy_the_dip` | "לקנות בירידה": an imperative title. The text is nuanced | **"ירידה: הזדמנות או מלכודת?"** |
| `panic_selling` | text: "…ומפספס את העלייה שבאה אחריה" assumes a rise always comes | "…ועלול לפספס עלייה, אם תבוא" |
| `giving` | "נתינה שצומחת" / "נתינה מוקדמת צומחת…": can read as "giving always pays back" (brief §15) | **"נתינה והשפעה לאורך זמן"**. Text: "בעמק העתיד תרומה בונה השפעה לאורך חודשים — לא כסף בחזרה" |
| `human_capital` | "העלאה קבועה במשכורת מחזירה את ההשקעה שוב ושוב": always true here, and "study" is the top option in 97–99% of scored plan cards (A7) | "…יכולה להחזיר את ההשקעה — תלוי בתחום ובעיתוי". Add `sim`: "במשחק הלימודים כמעט תמיד משתלמים; במציאות לא" |
| `tax_refund` | "מי שבודק — מקבל בחזרה" | "מי שבודק — **עשוי** לקבל בחזרה" |
| `diversification` | "מכה אחת לא מפילה הכל" (correlated crashes) | "**פחות סביר** שמכה אחת תפיל הכל" |
| `power_law` | "ואחד מתוך הרבה מחזיר את כולם" | "**ולפעמים** אחד מתוך הרבה מחזיר את כולם" |
| `emergency_fund` | "בלעדיהם — כל הפתעה הופכת לחוב" | "…**עלולה** להפוך לחוב" |
| `ask_raise` | text: "העלאה מגיעה למי שמבקש… הכי גרוע שיגידו לא" (hides the relationship risk; the title is fine) | text: "…לפעמים אומרים לא, ולפעמים זה משפיע על היחסים" |
| `time_in_market` | "לא צריך לתזמן את השוק" (absolute) | "**קשה מאוד** לתזמן את השוק…" |
| `asset_liability` | the Rich-Dad definition (a home is a liability). This is a simplification | Add `sim`: "במשחק נכס = תזרים חיובי. במציאות דירה למגורים חוסכת שכירות ויש לה ערך" |
| `passive_income` | "כשהיא עוברת את ההוצאות — יצאת מהמירוץ" (the game rule) | Add `sim`: "כלל הניצחון של המשחק; במציאות צריך גם מרווח, אינפלציה ומיסוי" |

Not misleading, keep as they are: `benchmark` ("לנצח את המדד", the text says most do not), `drawdown`, `opportunity_cost`.

### 2.5 Recovery and end (§17)

| brief item | status | evidence / gap |
|---|---|---|
| Crisis: explain the cause | 🟡 | Tile card: title, text, cost lines, "the fund covers / the bank will lend ₪X at ₪Y a month" (`shortfallInfo`). **The cause is not linked to the player's exposure** (e.g. "you have no fund", "your business is cyclical") |
| Crisis: options with price and risk | 🟡 | Crisis **chain**: yes, with odds text ("במשחק: 3 מכל 10 שמסרבים מפוטרים"). **Crisis tile**: one option, w3 gold sale aside (`engine.js:2172-2177`). After the hit, nothing offers "move fund / repay / rest plan / sell X" with prices |
| Prevent long lost runs without meaningful decisions | ❌ | §1.3: decided at 55–73% of the limit, then 18–34 months to play. Free mode never ends on time; abandoning loses the summary and rewind |
| "רגעי החלטה" for learning from an alternative path | ✅ / 🟡 | Live in learning games and branches only (`rewind.js:55-57`, `ui.js:2317`). From the end of a free or learn game: grid buttons "🔁 לנסות אחרת" and "לחזור לרגע מהמשחק האחרון". Up to 40 rows with a verdict word. Original vs branch compare (`lobby.js branchCmpHtml`) | **Unreachable for an abandoned run**. Rows do not say *what was at stake* (the alternative option) |

**End screen vs the brief list** (`lobby.js:1744-1780`, `summary.js:294-365`).

| brief list | status |
|---|---|
| Result and duration | ✅ |
| Progress graph | ✅ Net worth, cash + savings, low-cushion and recession bands, 3 notes, table view (shot `09_end_top_phone`) |
| Income sources | ❌ Only passive total vs expenses (old layout stat cells). No salary / rent / business / dividend breakdown at the end. `metrics().incomeLines` exists and game.js has `S` at `endGame` |
| Debts and liquidity | 🟡 Liquidity line on the graph. The debt column is recorded (`tl.debt`) but not drawn. No final debt figure in the top block |
| Key decisions | ✅ Grid + list under "החלטות ומזל" (collapsed) |
| Crises | ✅ "המשבר הגדול" (collapsed) |
| Focused lesson | 🟡 Exists (`recap.js:166-176`), but **the rule-1 text is ungrammatical and context-free**: shot `09_end_top_phone` shows "בפעם הבאה: השאיר אותך בלי כרית". It is `T.next` + `DQ_WHY.noCushion` (`engine.js:2495`), with no subject, month or decision name |
| Retry under the same conditions | ✅ "↻ אותו לוח שוב" (free); "עוד תרגול" (learn) |
| Another path or character | ✅ "דמות אחרת", next world. There is **no "try another strategy" nudge** (e.g. show a rival archetype's path as a suggestion) |
| Share a summary without private data | 🟡 WhatsApp text + life-story PNG (`lobby.js:1900-1935, 2023-2040`). The link carries `ref=<player id>` (`withRef`, `lobby.js:192`) and the duel link carries `by=<nickname>` (`:2016-2020`). The PNG shows age and family. These are pseudonymous, but the player is never told what is shared and cannot drop the id |

### 2.6 Payday screen and money-management access (§18)

| item | status | evidence / gap |
|---|---|---|
| Simple payday screen | ❌ / 🟡 | §1.4: 2.1 desktop screens, 14–16 buttons, 185–274 words. Contents: 8-row payslip (gross, tax, BL, pension, net, passive, expenses, in pocket) + 4–5 plan tiles with 3–4 chips each + 🛟 deposit + 📈 raise + focus section + mentor + tip coach (`ui.js:1183-1203, 1426-1433`). The heading "איך תעביר את החודש הבא?" is **not gendered** for female characters (`ui.js:1432`; the coach next to it says "תעבירי") |
| Clear access to money management | 🟡 | Spread over 4 places: (1) sheet bottom on phone, ~3 screens down (invest, to-from fund, loan, repay, card); (2) 🛟 chip (fund); (3) 📅 chip (plan); (4) 🎯 chip (focus). Some of these are hidden behind "⋯" on phone. Desktop has the sheet as a side panel. Nothing says "ניהול כסף" |

---

## 3. Prioritised gaps and UI-side proposals

UI-side = `ui.js`, `game.js`, `lobby.js`, `onboard.js`, `summary.js`, `hudgoal.js`, `library.js`, `data/lessons-meta.js`, CSS. These use only existing engine exports, compute no new rules and need no re-pin.

### P0

1. **Finish and review a losing free run (§17).**
   - Add a "🏁 לסכם את הריצה" action in the ❓ / home menu.
   - Offer it automatically once `month > maxMonths` in free mode, as a one-time card: "עבר מועד הכוכבים (חודש N). להמשיך לנסות — או לסכם ולראות מה למדת?"
   - It calls the existing pure `E.endNow(S)` (`engine.js:4887`), which builds a 'capped' result with recap, graph and learning without touching state.
   - Route it through the normal `endGame` path so `rr2-last-game` is written and the end screen's rewind grid works.
   - Keep the save, so the player can still return and play on.
   - Also show the month limit in the HUD in free mode as "חודש 34 · ★ עד 52" (`game.js:1167` passes 0 today).
2. **Near goal at every moment (§8).**
   - After the tutorial chain, and in every world and mode, fill `#hNext` with the next milestone. Pick the first unmet item in a fixed ladder of engine values:
     - 🛟 1 month in the fund
     - first positive-cash-flow asset
     - 🛟 3 months
     - passive at ¼, then ½, then ¾ of expenses (w1/w2)
     - net worth at ¼ / ½ / ¾ of target (w3), plus impact (w4)
   - Pure comparisons on `metrics()`, the same pattern as `hudgoal.js`. A chosen dream keeps priority.
3. **Simpler payday card (§18).** Collapse it to one screen:
   - Header: "נכנס לכיס +₪X" with a one-line "נטו ₪A · הוצאות ₪B · פסיבי ₪C". The 8-row payslip goes into "🧾 התלוש המלא ▾".
   - Plans as a compact segmented row: current plan + 3 alternatives, each with one chip (₪/month and 🔋). Notes on long-press or "פרטים".
   - The focus section and 🛟 / 📈 go into a single "עוד החלטות לחודש" row.
   - Target ≤ 1 phone screen and ≤ 8 buttons.
   - Fix the gendered heading (use `ui.gw`).
4. **One "💼 ניהול כסף" entry (§18).**
   - A fixed HUD button, never in "⋯", that opens a short sheet in this order: fund (deposit / withdraw), loans (take / repay / card), index (buy / sell / standing order), plan, focus.
   - Each row shows the current value and the existing engine call (`moveSavings`, `takeLoan`, `repayLoan`, `payCredit`, `invest`, `setAutoInvest`, `setPlan`, `setFocus`).
   - The full report ("הדוח הכספי") stays as is.
5. **Fix the focused lesson text (§17).**
   - In `summary.js suggestionOf`, when `suggestion.k0` is set, look up the decision via `rewind.decisionPoints` / `recap.decisions`.
   - Render "בחודש N, "<card>": <why> — זה הלקח לפעם הבאה." instead of "בפעם הבאה: השאיר אותך בלי כרית".
   - The engine string can be fixed at the next re-pin (see E3).

### P1

6. **Crisis follow-up panel (§17).**
   - Right after a crisis tile, a forced loan or a bailout, open a "מה עכשיו?" card. It shows the cause, the exposure and 2–4 existing actions with price and risk, each a UI wrapper over an existing call:
     - Cause: e.g. "לא הייתה קרן — הבנק הלווה ₪X ב־₪Y לחודש".
     - Exposure: from `metrics()`, e.g. fund 0/3, debt-service %, business share of income.
     - Actions: repay ₪5,000 now (−₪… cash, −₪… a month), move the plan to rest (+🔋, −₪…), list an asset for sale (opens the sheet), keep going.
7. **Got / gave up / risk instead of a bare score (§16).**
   - In the verdict line and pill, replace the 0–100 number with three short facts from the `impactFor` before/after that the card already computed:
     - "קיבלת: +₪600 לחודש"
     - "ויתרת: ₪20,000 מזומן"
     - "סיכון: כרית 0.5 חודש · חוב חדש ₪180K"
   - The label (חזקה / יקרה …) can stay. Keep the number behind "📊".
8. **"Since you were away" card on resume (§9).** Show:
   - goal %
   - near goal (from P0-2)
   - open 📬 items
   - the last decision and its verdict word
   - one line on what the 📬 badge means
   - links to the tour and legend

   Show it only after more than 24 h (or more than 7 days) since `savedAt`.
9. **End screen: income sources, debt and liquidity (§17).**
   - At `endGame`, add `incomeLines` and `expenseLines` from `E.metrics(S)` to the UI end payload (game.js has `S`). Render "מקורות הכנסה בסוף" as a small stacked bar: salary, rent, business draw, dividends.
   - Draw the recorded `tl.debt` column on the graph and add a "חובות ₪X · כרית N חודשים" stat to the top block.
10. **Library (§16).**
    - Search box: client-side filter on title, text and teaser.
    - Filter chips: הכל / חדשים / נפתחו / נעולים.
    - "📍 לחזור לרגע הזה" on a lesson whose `ctx` matches `rr2-last-game` (rewind).
    - Apply the 13 rewordings (§2.4) through display overrides.
    - Add `sim` lines to at least the 20 lessons whose game numbers differ from reality: rent / mortgage figures, raises, study, index return, tax simplifications, crisis odds.
11. **Rewind rows show what was at stake (§17).**
    - In `momentsSheet`, add the alternative the evaluator ranked first ("האפשרות האחרת: …") and the verdict's `why`. Both are already in `decisionPoints` / `dq.decisions`.
    - From the "hopeless" card (P0-1), deep-link to the weakest decision.
12. **Short challenge framing (§8).**
    - The 24-month daily is a progress race (0–7% escape). Say so on the daily card: "24 חודשים · כמה קרוב תגיע לחופש?".
    - Show the player's previous daily % as the line to beat.
    - No economy change.

### P2

13. **Dream at first launch (§9).** After the tutorial goal chain completes ("סיימת את ההדרכה! 🎓"), offer the dream picker once, so a near goal continues.
14. **Strategy mirror (§3, §13).** A small "הדרך שלך עד עכשיו" line in the sheet, e.g. "70% מהפסיבי מנדל״ן · עסק 0 · מדד ₪…". Read it against the 4 archetype rule cards already in `RV.ARCH` at the end ("רותם החוסכת הייתה בוחרת…").
15. **Share privacy (§17).**
    - Show a preview of the WhatsApp text.
    - Add a toggle "לא לצרף קישור הפניה", which drops `ref` and `by`.
    - Life-story PNG: an option to hide age and family.
16. **Progressive disclosure outside the tutorial (§9).** In a player's first non-tutorial game in w2–w4, reveal the world-specific chips (econ, rate, FX, impact) with their existing first-visit world coaches rather than all at roll 1.

---

## 4. Items that need engine (pinned) changes — flag separately

Each needs a re-pin of verify-result. The bundle has about 55 KB of headroom.

| # | item | where | why it can't be UI-only |
|---|---|---|---|
| E1 | Crisis **tile** with real choices (e.g. pay from fund / installment loan / sell an asset at a discount), each with price and risk | `engine.js:2161-2178` DESCRIBE / CHOOSE.crisis; new option ids in `act()` / `replay()` / verify `CODES` | New outcome-affecting actions. P1-6 covers the UI interim |
| E2 | Lesson title and text rewording (§2.4) | `life.js` / `finance/business.js` LESSONS | Text inside the pinned bundle (no outcome change). P1-10 covers the interim via `lessons-meta.js` overrides |
| E3 | Grammatical `DQ_WHY` texts and a `T.next` template that names the decision | `engine.js:2495`, `systems/recap.js:12-20, 170` | Pinned text. P0-5 covers the interim |
| E4 | More cycle headlines (today 10, 2 per label), tied to the existing public label only | `systems/cycle.js:109-116` | Pinned text. Determinism is unaffected (picked by `month % n`) |
| E5 | `nextGoal` ladder for all games, if the near goal should be engine truth rather than UI-derived | `engine.js:4549-4566` | Today `nextGoal` exists only in tutorial games |
| E6 | Any **end-on-time in free mode**, or a "concede" result that counts as a game | `engine.js:4875 checkEnd` | Changes results and stars. **Not recommended**: P0-1 with `endNow` keeps it UI-only and outcome-neutral |
| E7 | Balance items that affect the learning message: "study" is top in 97–99% of plan cards (A7); `human_capital` reads as always true | `engine.js` / `life.js` PLANS | Balance work (team ב), explicitly separate from UI |

---

## 5. Notes for the main session

- **Read-only.** Nothing in the repo was edited except this file.
- **Browser runs:** only on my ports 9900–9902, offline fake backend + guard, Chrome `--no-proxy-server`, guard clean.
- **Not committed (in /tmp):** screenshots in `/tmp/j1/shots`, measurement scripts in `/tmp/j1/scripts` (`journey.mjs`, `daily.mjs`, `shots.py`, `shots2.py`) and raw sim output `/tmp/j1/journey.json`.
- **Limits:**
  - The wall-clock figures are estimates from earlier playtest timings, not a human timing.
  - The "hopeless" method pools policies (§1.3 caveat).
  - The end screen was captured on a *won learning* game (fixture `t6_fixture.mjs nearEnd`). A lost free run has no end screen to capture, which is gap P0-1 itself.
