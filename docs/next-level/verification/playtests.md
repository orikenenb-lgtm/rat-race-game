# Playtests: "Next Level" (T7 §5.4 manual play protocol, agent sessions)

- **Build:** HEAD `82aa1ba` on `feat/rat-race-next-level`. This is a clean `git archive` export to `/tmp/pt/wt`, served by `tests/serve_copies.sh` (PORT_BASE 8960). Every session ran on the real copy on :8962, which has the lobby and the real game.
- **Backend:** `tests/fakebackend.py` in offline mode with `verify=accept`, plus the guard and `--no-proxy-server`. At the end of each session the guard's blocked list was empty. Production was never contacted. There were no ranked sessions.
- **Browser:** Chromium headless with swiftshader, driven by Playwright through a command daemon (`/tmp/pt/daemon.py`). It clicked real buttons and read the visible card text (`innerText`).
- **Engine access:** engine functions were never called to decide anything. Sheet and engine state were read only to record results afterwards.
- **Page errors:** none in any of the 6 sessions.
- **Screenshots:** `/tmp/pt/*.png`. Transcripts: `/tmp/pt/trans_s1…s6.log`. Notes: `/tmp/pt/notes_s*.md`.
- **Date:** 2026-11-22.

> **Limits, as T7 §5.4 requires.** An agent playthrough is not a human playtest.
> - I know the rules and the code. I cannot feel boredom or delight, and my "hesitations" are simulated.
> - Personas are approximations. Parts of sessions 1, 2, 4, 5 and 6 were played by small persona rules that only read the screen, so the sessions would reach 25+ turns in the time available. Those parts are marked "(scripted)". A scripted rule is honest for the "tapper" and "risk lover" personas. It is weaker for the "thinking" ones.
> - The renderer is swiftshader, not a phone, so wall-clock times are not human times.
> - These findings are qualitative input. The only pass/fail items are the bugs, and they should become CRs.
> - The ⚡ energy for sessions 3–6 was pre-filled to 99 (a test convenience). Session 2 kept the real limit.

## Session summary

| # | Persona | Device | World · character · mentor | Turns (rolls / months) | Outcome | Want next month (1–5) |
|---|---|---|---|---|---|---|
| 1 | Brand-new, taps fast, reads nothing | phone 390×844 | w1 · teacher (assigned by "יאללה, משחק ראשון") · מתחיל | 36 / 27 | **Won ★★** in 27 months (fund ✗). Decision quality **88/100 "מצוינות"** | 2 |
| 2 | Careful beginner, follows the guidance | phone 390×844 | w1 · truck driver (בינוני) · מתחיל · dream יציבות | 50 / 30 | Still playing at month 30. Freedom 29% (it was 33% at month 15). **Out of ⚡ at month 30** | 3 |
| 3 | Thinking player | desktop 1280×800 | w2 · product manager (CHIP shares) · מתקדם | 40 / 26 | Month 26: freedom 13%, net worth ₪488K. Hit by a rate-hike chain | 4 |
| 4 | Risk lover (scripted) | phone 390×844 | w3 · captain (₪760K) · מתקדם | 50 / 35 | Net worth **−₪703,542** at month 35 (started at +₪760K) | 2 |
| 5 | Business-focused | desktop 1280×800 | w3 · toy importer · מתקדם · dream עסק משלי | 40 / 28 | Net worth ₪2.81M (31%). Opened and ran an online toy store | 3 |
| 6 | Learning mode + practice rewind | phone 390×844 | w1 · teacher · learning · מתקדם, then מתחיל | 3 games (59, 36, and a 31-month branch) | Careful learner: 59 months, quality **42/100**. Tapper: 36 months, 89/100. Rewind branch "study at month 5": 36 months, net worth **₪186,933 vs ₪92,977**, 96/100 | 3 |

## Overall verdict against the owner's complaint

**Is it now "much more thinking"? Partly.** The thinking is there, and much of it is good. But the game does not require it, and in several places it does the thinking for the player.

### What now works

- **Consequence chains** are the best new thing:
  - Periphery move → a commute choice 3 months later → a rent renewal with an inflation comparison.
  - Layoff rumour → layoff → a severance decision.
  - Side business → tax-file choice → a 200-cake order that ties up working capital.
  - These create "what happens next month" curiosity, which v3 did not have.
- **Rival investors against inspection** ("👥 30–35% שיקדימו אותך") is a real dilemma. Inspection also really does catch lemons:
  - Jerusalem flat: claimed +₪560, inspected range ₪200–370, big repairs.
- **Rates, mortgages and bonds in w2** punish a wrong macro bet in a way you feel:
  - Session 3: I took a variable rate in a recession expecting cuts. The rate went 6.5% → 7.25% → 8%, and passive income fell from ₪705 to ₪5.
- **Risk is not over-rewarded.** In session 4, leverage + gold + no inspections + a negative-cash-flow factory ended at −₪703K net worth. That is consistent with gate B-2.
- **Revenue ≠ profit ≠ cash is now clear** in the business toasts and the full report (VAT, cost of goods, corporate tax, dividend tax). Example: "הקופה ירדה ב־₪9,357, כי קנית מלאי ב־₪24,304". This is the strongest teaching moment in the build.
- **The end screen** shows success alongside happiness, time and life story, and a decision-vs-luck split. The owner asked for exactly this.

### Where it is still "just pick the right thing"

1. **At מתחיל the highlighted button is an autopilot.** Session 1 never read a card and only tapped the highlighted or first button. It won ★★ in 27 months with "איכות ההחלטות 88/100 מצוינות". In session 6 the same policy scored 89/100. A careful player who inspected every deal and read everything scored **42/100** and took 59 months. The score rewards following the highlight, not thinking.
2. **Pre-computed totals turn decisions into "pick the biggest number".** Almost every life and story card prints `סה״כ ב־24 חודשים: ±₪X`, often with the probability already folded in. Examples:
   - "להתחיל לחפש בשקט … +₪15,004" against "לסרב −₪8,160".
   - The business board shows `+/−₪X ב־3 חודשים` on all 11 levers. After every action the numbers are recomputed, so you click the biggest positive until all are negative. The grade even says "100 החלטה חזקה · הכי משתלם לפי מה שראית".
3. **Some cards are pure arithmetic with one sane answer**, and they come again and again:
   - Upgrade or trim cards at 240–423%/yr.
   - "הוצאה מפתה → לוותר".
   - Stock, index and hedge cards that a goal-driven player always skips.
   - In w1/w2 the index-fund card appeared at months 3, 7, 13 and 15 in session 2. In w3 the dollar-hedge card appeared 9+ times in 35 months in session 4.
   - Equity or index investing never moves the freedom meter, so it is never a real choice. Index yield is about 0.40 per unit per month against goals of ₪8–28K per month.
4. **Some cards tell you the rule outright.** Gold: "במשחק הוא תמיד עולה במשבר".

## Per-session records

Counting rule: a decision is **meaningful** when I weighed two or more options and the right one was not obvious from the card. It is **automatic** when one option was obviously right (or highlighted) and choosing took no thought. Times are wall clock in the harness (swiftshader). "Human estimate" is my reading-time estimate at about 200 words a minute.

### S1: brand-new tapper (w1, phone)

- **Flow:**
  - Welcome → "יאללה, משחק ראשון ←" → the teacher is assigned.
  - Tutorial: three "הבנתי" taps plus three in-card mentor steps.
  - First decision at about 3 s: the washing machine card, with pay / installments / DIY.
- **Decisions:** 28 counted by the game. Meaningful: 0, by persona design.
  - In 12 cards the highlight was the mentor's pick: inspect when "המנטור ממליץ לבדוק", then buy after the inspection.
  - That path took the Afula building with a ₪13K loan at month 9 (freedom 28%), a pizza franchise with a loan at month 21, and the Petah Tikva office floor with a loan at month 24 (100%).
- **Confusion:** none felt, because a tapper reads nothing. The player did not learn why they won.
- **Time:** about 7 s per roll in the harness, roll animation included. Human estimate: about 10 s per turn.
- **Next month?** 2/5. Fast and positive, but nothing was asked of me.
- **Result:** won ★★, month 27, passive ₪9,457 against expenses ₪8,359, net worth ₪51,164. A forced bank loan came at month 10 (cash ₪549).
- **Learned:** only what the end screen said: "חסרה קרן חירום של 3 חודשים". The "5 decisions to rethink" list repeats "קיבלת משכורת · להמשיך — היה עדיף: לימודים" twice.
- **Bug:** see B1, "עוד -5 חודשים פחות ו־★★★ היו שלך" (`s1_end.png`).

### S2: careful beginner (w1, phone)

- **Play:** manual for months 1–18, reading every card, with 3 hints. Months 18–30 followed the highlights (scripted). That is exactly what "follows guidance" means here.
- **Meaningful (about 10):**
  - Washing machine: DIY.
  - Monthly plan: the hint said study.
  - Rent: move to the periphery.
  - Laundromat: inspect → the mentor recommended a second inspection (₪500) → the hint said "offer −5%" → accepted → bought with an ₪8K loan.
  - Commute.
  - Job search after the degree.
  - Rent renewal: negotiate.
  - Hadera flat with 3 rivals.
  - Jerusalem flat: inspection revealed ₪200–370 → passed.
- **Automatic (about 13):** index ×4, TCHN/BANK ×2, coffee cart, get-rich course, dental, a ₪0 startup, and others.
- **Confusion and overload:**
  - The hint said "לימודים". The same panel warned "⚠ הסיכון העיקרי: אחרי זה תישאר כרית של 0.5 חודשים". The intro had said "קודם כרית, אחר כך נכסים". That is three contradictory signals on one card.
  - The impact panel opens on a tab ("לימודים") that is not the highlighted choice. Nothing on screen says which option the before/after table describes.
  - **The outcomes of the job search and the rent negotiation were never shown.** The next screen was a roll.
  - The index card says "כאן אפשר גם להגדיר הוראת קבע", but the card has no standing-order control.
  - A truck driver was offered "יומיים בשבוע מהבית".
  - Months 5–6: 3 rolls in a row with no card.
  - From month 15 to month 30 freedom went **down**, from 33% to 29%, while following the guidance. The guided "מלאי קטן — הבחירה של המנטור" put ₪35K into an online store that shows "₪0 (אתה עובד בו — לא פסיבי)".
  - ₪36.9K sat idle while the 🛟 emergency fund stayed at 0/3. The impact panel's "כרית (חודשים)" counts cash, but ★★★ needs the separate fund. The same miss cost session 1 its ★★★.
- **Stuck:** at month 30 the screen showed "נגמרו הזריקות ⚡" (`s2_noenergy.png`). A medium-difficulty character needs about 40–60 rolls. A new player gets 25 plus bonuses, then 1 every 6 minutes.
- **Time:** 8–12 s per roll in the harness. Human estimate: 60–90 s on deal cards (1,200–1,800 characters), about 20 s otherwise.
- **Next month?** 3/5. The story chains pulled me forward. The flat freedom meter and the ⚡ wall pushed me out.
- **Result:** still playing at month 30. Net salary ₪14,239, passive ₪2,493 against ₪8,331, real net worth ₪109K.
- **Learned:** inspection catches lemons, and moving changes commute and rent later. It did not teach that a cash cushion is not the ★★★ fund.

### S3: thinking player (w2, desktop, מתקדם)

- **Meaningful (about 14):**
  - Expense-audit focus in month 1.
  - The first trim card (₪8K).
  - Overtime, then side business, then rest.
  - Scout focus.
  - Bat Yam pinui-binui: +₪460K below market, two rivals, variable vs fixed rate, a rate table. I ignored the hint "offer −10%" and bought at the variable rate.
  - Severance withdrawal while laid off.
  - Bonds as a rate bet.
  - The 200-cake order.
  - Two refinance offers, both declined.
  - Coffee machines: inspect, then buy.
  - CHIP: sold all at −33%.
  - Corner store: pass.
  - Repaying a ₪60K bank loan.
- **Automatic (about 16):** trims and upgrades at 240–423%/yr (the same "חזית ומיתוג חדשים" upgrade was offered twice in a row and stacked ×2), temptations, index ×4, the tax file.
- **Hints used:** 1.
- **Confusion and overload:**
  - **Turn 1:** a single-option crisis card, "לשלם ₪27,600 ולהמשיך", took 92% of the cash with no choice. Another single-option card at month 23 took ₪24,364.
  - Upgrade flavour is nonsensical: "קבלן מעולה פנוי … לקצץ משלוחים ומסעדות: עולה ₪8,000". Others: "קבלן איטי … לקצץ שני רכבים ₪7,000", "לקצץ גאדג'טים ומנויים ₪4,500". Paying a contractor to cancel subscriptions makes no sense, and selling a car should bring cash in, not cost money.
  - The coffee-machines card has three mismatches:
    - The flag reads "⚠ השכנים מדברים על בנייה ליד".
    - The realism note talks about apartment yields.
    - The mentor says "כאן כמעט הכל במינוף" on a card that says "בלי הלוואה בכלל".
  - The side-business tax card says "חוב מס של בערך ₪19,100 בשנה", but filing costs "−₪200 בחודש". The numbers do not reconcile.
  - The refinance card says "אם תקבע עכשיו (8.25%) +₪660 במקום +₪1,630", and it is not clear what +₪1,630 refers to.
  - Two "index" products in the same months: "מדד ת"א · סל מניות ₪125 (בשיא)" and "קרן מחקה מדד ₪82".
  - The Greece vacation shows 😊 only inside the impact panel (+2), not on the buttons.
  - **The first asset deal came at month 9.** Months 2–8 were payday cards, temptations and empty rolls.
  - The character's signature decision (CHIP: "למכור ולהשקיע — או לחכות לזינוק?") first appeared as a card at **month 26**.
  - The sheet shows "הלוואה בנקאית — במשחק 42.7% בשנה" costing ₪3,204 a month while ₪67K sat idle. Nothing warned about it. Repaying takes ₪10K per tap plus a confirmation, so 12 taps for ₪60K.
  - The monthly plan stayed on "מנוחה ומשפחה" from month 16 to month 26 without the plan card coming back.
  - Desktop HUD: 13 chips plus the side sheet. This is the overload point on desktop.
- **Time:** 20–35 s per roll in the harness (heavy desktop scene). Human estimate: 90–180 s on deal and bank cards.
- **Next month?** 4/5. This is the "much more thinking" game the owner asked for, but only from month 9.
- **Result:** month 26, freedom 13% (₪3,559 / ₪26,260), net worth ₪488K (₪726K with pension), cash flow +₪9.5K after repaying the loan. No end yet (76-month limit).
- **Learned:**
  - A variable rate is a bet.
  - A bond's price falls when rates rise.
  - Uninspected seller claims run high.
  - A 42%/yr loan is worse than idle cash. The game showed this; it did not point it out.

### S4: risk lover (w3, phone, scripted)

- **Policy:** read from the screen only:
  - always buy, preferring the variable rate;
  - never inspect;
  - max-buy every trade card (gold, crypto, index);
  - overtime; withdraw severance; never hedge.
- **What it bought:** an outlet mall near the port, a tug in Haifa port, a laundromat business, an old textile factory, 23 oz of gold and 1,501 index units.
  - The textile factory was bought with a ₪190K bank loan: "בסוף החודש: −₪10,260". A "buy" button on a deal that loses money every month is allowed without any extra friction.
- **Month 17:**
  - Assets ₪4.15M against liabilities ₪5.43M. The outlet was worth ₪1.55M against a ₪2.81M loan.
  - Burnout at month 15: "שחיקה / נשרפת. חודש בבית".
  - Happiness 25.
- **Month 35:** net worth −₪703,542 against the ₪9M goal. Credit 583.
- **Fun?** Swingy and loud. But the main feedback ("שווי נקי 0%") is a flat bar: from month 5 the HUD meter showed 0% for 30 months while passive income was +₪16K a month. The player feels rich by cash flow and only learns about the negative net worth in the sheet. That is the right w3 lesson, but it is buried.
- **Repetition:** the "בלי גידור" dollar-hedge card appeared 9+ times.
- **Next month?** 2/5.
- **Risk over-rewarded?** No. Gold did rise from about ₪9.5K to ₪22K per ounce, but leverage swamped it.

### S5: business-focused (w3, desktop)

- **The character's business:** the toy importer already owns a business, but **it cannot be managed.** The "🏪 יום עבודה על העסק" focus is disabled until you start a T3 business. A month-4 offer to buy the company at 1.3× was declined.
- **Online store:** "חנות צעצועים אונליין — יבוא מהמזרח הרחוק".
  - Three start options, each showing "רווח ב־3 חודשים" and "קופה ב־3 חודשים", plus seasonality and a break-even of "66 הזמנות". This is very well done.
  - I chose מלאי גדול ושיווק (₪80K): the biggest numbers.
- **Monthly management:**
  - The toasts explained profit against cash every month.
  - Board in month 7: "להזמין מלאי +₪18,876 ב־3 חודשים", then the price raise, then everything turned negative. That is a greedy optimisation, not a strategy.
  - The 3-month horizon makes "פחות שיווק +₪5,967" beat "יותר שיווק −₪5,540", which teaches short-termism.
- **December (Hanukkah, the strongest month):** "הרווח ירד … בעיקר בגלל מלאי שנגמר". This was a real consequence lesson, but nothing warned beforehand. Stock was 0.9 months in month 7.
- **Energy:** the business costs "🔋 −10 בחודש". Energy reached 16 by month 22, and the plan flipped to rest. That is a nice tension, but it went unannounced.
- **Scale problem:** the store was worth ₪108K and earned ₪3,150 a month. The import company was worth ₪1.93M (₪20,400 a month) and the container ship ₪2.82M (₪14,830 a month). In w3 the managed business does not matter for winning.
- **Decisions:**
  - Meaningful (about 5): sell-the-company offer, container ship (inspected ₪14,150–18,760; a natural hedge against the importer's dollar exposure), the child, marketplace expansion, the start option.
  - Automatic (about 25): the board levers, a pleasure-ship trap, a "מכולה דיגיטלית" token carrying the flag "חוזה השכירות נגמר בעוד שנה" (a flag that does not fit a token), gold, dollars and index.
- **Next month?** 3/5.
- **Result:** month 28, net worth ₪2.81M (31%), ₪935K cash idle. Net worth fell from ₪3.37M to ₪2.81M over months 22–28, and nothing on screen explained why.
- **Bug:** see B2, "[object Object]" in the full report (`s5_bizreport_objectObject.png`).

### S6: learning mode + practice rewind (w1, phone)

- **Learning game 1** (careful learner, scripted: inspect every deal, buy only when the inspected low end is positive):
  - Freedom reached 100% only at month 58. The game ended at month 59, after the 52-month limit.
  - "איכות ההחלטות 42/100 · יש מה לשפר · 113 החלטות".
  - The "5 decisions to rethink" were the same item 5 times: "קיבלת משכורת / לימודים וקריירה · להמשיך — היה עדיף: לימודים". "Study" looks like a dominant option; sessions 1 and 6 both got this advice.
  - The mentor's quote "שילמת על זה באושר ובכוח" came with 🔋 93.
- **Practice rewind is off by default** (`flags.js` DEFAULTS `rewind:false`). In the owner's build there is no way back to a decision. I enabled it with `?ff=rewind` for this session only.
- **Learning game 2** (tapper at מתחיל, flag on): month 36, ★★ equivalent, 89/100.
- **Rewind:** lobby → w1 → "🔁 לחזור לרגע מהמשחק האחרון".
  - The list of moments is long and noisy. Every sub-step is its own entry (one office deal produced 4 rows: buy / offer / pro inspection / basic inspection). The read text also showed the list twice.
  - I chose month 5, "קיבלת משכורת", and picked **לימודים** instead of עבודה רגילה.
- **Branch result:** same 36 months, but net worth **₪186,933 vs ₪92,977** and quality 96 vs 89. Luck was +₪6K vs −₪27K, so luck was not held constant and the comparison mixes luck with the decision.
- **Does it teach?** The mechanism does. The **branch end screen shows no comparison with the original** and no "↩ חזרה למשחק המקורי" button. `compareData` exists in `rewind.js` but is not shown here. The player has to remember the original numbers to see that studying doubled their net worth.
- **Next month?** 3/5. It would be 4/5 with a side-by-side view.

## Bugs (with repro) → proposed CRs

| id | Severity | Repro | Evidence |
|---|---|---|---|
| B1 | P1 | w1 teacher, win with ★★ where only the emergency fund is missing. The end-screen near-miss reads **"עוד -5 חודשים פחות ו־★★★ היו שלך."** (negative months; the real gap was the fund) | `s1_end.png` |
| B2 | P1 | w3 toy importer → start the online store → focus "יום עבודה על העסק" → "דוח מלא" shows 6 × **"[object Object]"**. `js/ui.js:1446` maps `L3.notes` items (objects) through `escI(t)` | `s5_bizreport_objectObject.png` |
| B3 | P1 | ⚡ zero mid-game for a new player: w1 truck driver, about 50 rolls → "נגמרו הזריקות ⚡" at month 30 | `s2_noenergy.png` |
| B4 | P2 | Outcomes of probabilistic choices are never shown. w1 "עם התואר ביד → לחפש עבודה חדשה" and "חידוש חוזה → להתמקח": the next screen is a roll, with no result card or toast | trans_s2 m11, m13 |
| B5 | P2 | The index card text "כאן אפשר גם להגדיר הוראת קבע" appears with no standing-order control on the card (w1, m3/m7/m13) | trans_s2 |
| B6 | P2 | Forced single-option crisis on turn 1 of w2: "לשלם ₪27,600 ולהמשיך" (92% of starting cash); again at m23 (₪24,364) | trans_s3 |
| B7 | P2 | Content mismatches: <br>• a real-estate flag on coffee machines; <br>• a lease flag on a crypto token; <br>• "יומיים בשבוע מהבית" offered to a truck driver; <br>• "הקבלן" trims (pay to cut deliveries, cars, subscriptions); <br>• mentor "₪410" vs card "+₪420"; <br>• hint "₪680 אחרי עלות ההלוואה" vs card net "+₪710"; <br>• tax-file ₪19,100/yr vs ₪200/month | trans_s2/s3/s5 |
| B8 | P2 | Rewind is off by default; the branch end has no original-vs-branch comparison; the moment list includes sub-steps | S6 |
| B9 | P3 | Gender: on a female character, the focus tiles say "כשאתה עייף" while the header says "תשימי" (w3 toy importer) | S5 |
| B10 | P3 | The impact panel for a 3-installment vacation lists two debt lines ("עד חודש 5" / "עד חודש 6") for one purchase | S3 m5 |

## Top 10 improvements, ranked by impact ÷ effort

1. **Stop the highlight from playing the game (high impact, small effort).**
   - At מתחיל, highlight the mentor's pick only after the player taps 💡 or the 📊 panel, or only during the first 6 months.
   - Give a lower decision-quality score to picks made by following the highlight.
   - Today a player who never reads wins ★★ with 88/100.
2. **Hide the "סה״כ ב־24 חודשים" / "₪X ב־3 חודשים" totals at מתקדם and מומחה (high, small).**
   - Show inputs and ranges instead (probabilities, monthly deltas, risk).
   - Reveal the total only through the 📊 panel, the 🧾 inspection, or the "מעקב אחרי הכלכלה" focus.
   - That turns arithmetic back into judgment.
3. **Fix the decision-quality score (high, medium).**
   - Count only real decisions: not trade-card buy/sell clicks, not inspection sub-steps.
   - Do not rank "study" as the top miss in every game.
   - Re-check against a careful inspector, who scores 42 while the tapper scores 88–89.
4. **No ⚡ wall inside a player's first games (high, small).**
   - Charge ⚡ per game start, or exempt the first 2 games, or refill at month boundaries.
   - Session 2 got stuck at month 30.
5. **One concept for the "cushion" (high, small).**
   - Make "כרית" in the impact panel and 🛟 קרן חירום (needed for ★★★) the same thing, or show both.
   - Offer "להעביר X לקרן" on the w1 payday card. Today it shows up only sometimes.
   - Two of three w1 winners missed ★★★ only because of this.
6. **Result cards for probabilistic and deferred choices (medium, small).** Job search, negotiation, asking for a raise, the cake order: show "קיבלת / לא קיבלת" with the number. This is the payoff of the consequence chains, which are the best new feature.
7. **Turn on rewind in learning mode and show the comparison (high teaching value, medium effort).**
   - Side-by-side original vs branch: months, net worth, quality, luck.
   - Collapse sub-steps into one moment per card.
   - Keep luck fixed, or show the luck delta, so the lesson is the decision.
8. **Cut repetition and dead rolls (medium, medium).**
   - Cooldowns for index, stock and hedge cards.
   - Move the index/standing-order option to the sheet.
   - Make sure every roll in the first 10 months gives something to decide. w2 had months 2–8 with no asset deal.
   - Surface the character's signature decision early: CHIP in month 1–3, the importer's business board, the captain's dollar salary.
9. **Content consistency pass (medium, small).**
   - Flag pools per asset type.
   - Character-aware options.
   - Upgrade flavour that makes sense.
   - Mentor numbers and hint numbers taken from the same source as the card.
   - One "index" product per world.
10. **Business: longer horizon and real stakes (medium, medium).**
    - A 12-month view next to the 3-month one, so marketing and stock become trade-offs.
    - A pre-season stock warning.
    - Let the character's own business (the importer) be managed.
    - Scale business opportunities to the world, so a managed business matters for the w3 goal.
    - Also: confirm deals with negative cash flow ("בסוף החודש: −₪10,260"), and add "repay all" to the sheet.

**What not to change:**
- the consequence chains;
- the rivals-against-inspection tension;
- the w2 rate shocks;
- the business P&L and cash-vs-profit toasts;
- the life story and happiness on the end screen.

These are what make it feel like "much more thinking" when the player chooses to think.
