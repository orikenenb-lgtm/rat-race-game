# Next Level, Phase A: research on content, learning and stories

- **Domain:** Content, learning & stories. Owner sections: **§9** (six story chains, NL-08), **§11** (business at the centre of the game, NL-09), **§13** (library and in-context practice, NL-10).
- **Mode:** read-only investigation. No existing file was edited. This is the only file I created.
- **Base:** `main` at `9e871e3`, working tree `/home/claude/rat-race-game`. Line numbers are correct for 2026-11-21. If a line has moved, search for the quoted string.
- **Tags used below:**
  - **[CODE]**: I read it in the source. A file:line reference is given.
  - **[OBSERVED]**: I ran it with node and saw the output. The scripts were throw-away files in `/tmp`, run against the real modules.
  - **[HYPOTHESIS]**: a proposal or design. It is not in the code.

---

## 0. What I ran

| # | Command / script (in /tmp) | What it measured |
|---|---|---|
| R1 | `import('js/engine.js')` → `LESSONS` | Lesson count per category, text length, how many lessons contain digits |
| R2 | grep every `lesson(st, out, '…')` literal + `lesson:` fields in worlds + `biz_*` ids in business.js, compared with `LESSONS` ids | Lessons that no code path ever unlocks |
| R3 | `tests/lib/random-player.mjs` `playOut`, 60 seeds × 4 worlds, `mode:'challenge'` (time-limited) | Life events per game, repeats, distribution per event |
| R4 | Forced `st.pending = {type:'life', eventId}` for each of the 12 events × 3 characters (teacher/dev/driver, w1), then `choose()` each option | `decisionRecord` score / verdict per option; which option is marked as the primary |
| R5 | `business.js` toyshop, 240 simulated months | Business event frequency |
| R6 | `real.js` series: DCA and lump-sum per scenario, home/CPI ratio | Checked the numeric claims in the scenario `lesson` texts |

---

## 1. Lesson library

### 1.1 Counts vs. claims

**[OBSERVED] R1.** There are **75** lessons in total: 59 life lessons (`js/life.js:167-227`) and 16 business lessons (`js/finance/business.js:156-173`).

| cat | count | Hebrew header in the UI (`js/lobby.js:560`) |
|---|---|---|
| tax | 13 (11 life + `biz_vat`, `biz_draw`) | 🧾 משכורת ומסים |
| business | 14 | **missing, so the raw English word "business" is shown** |
| life | 11 | 🌱 החיים |
| money | 10 | 💸 כסף ומחירים |
| invest | 9 | 📈 השקעות |
| debt | 6 | 💳 חובות ואשראי |
| time | 6 | ⏳ זמן ואנרגיה |
| world | 4 | 🗺️ מהעולמות |
| history | 2 | 📜 מההיסטוריה |

- **[CODE] English label in the UI.** `lobby.js:560` `CAT_HE` has no `business` key, and `lobby.js:568` falls back to `l.cat`. The library therefore shows a section titled **"business"** in English, with no emoji.
- **[CODE] Unreachable lessons.** R2 found two lessons that no code path unlocks: **`time_in_market`** (`life.js:191`) and **`benchmark`** (`life.js:226`). `benchmark` is the core lesson of history mode, and even history mode does not unlock it. As a result the library can never go above **73/75**, and the progress bar (`lobby.js:569-574`) can never reach 100%.
- **Stale counts in comments and docs:**
  - **[CODE]** `life.js:9` says "58 lessons", but there are 59.
  - `docs/EDUCATION_REVIEW.md:5` also says 58.
  - `docs/ENGINE.md:486` gives the right count (59 + 16) but its category list leaves out `business`.
  - `docs-v3/DESIGN-v3.md:33` says "40+".
  - The UI itself computes `have/total` live (`library.js:53-58`), so the number on screen is correct (x/75).

### 1.2 How lessons unlock

- **[CODE]** `engine.js:991-996` `lesson(st, out, id)`: unlocks a lesson once per game (`st.lessons`) and adds `{id,title,text}` to `out.lessons`.
- **[CODE]** `game.js:667-669`: emits bus `lesson` and shows a gold toast "📚 שיעור חדש בספרייה: {title}" with a "לקרוא" button (`ui.js:1041-1047`).
- **[CODE]** `library.js:40-62`: stores the id per device in `localStorage['rr2-library']`, across games, with read/unread state.
- **Triggers are about exposure, not understanding.** Examples:
  - payday #1/2/3/5 → gross_net / bituah_leumi / pension_match / tax_brackets (`engine.js:777-781`);
  - any IDX sale at a loss → `panic_selling` (`engine.js:2280`, `2620`), whether or not the market is in a crash;
  - a quiz unlocks its lesson **whether the answer is right or wrong** (`engine.js:2388`);
  - 3 kinds of assets → `diversification` (`engine.js:1955`);
  - business notes → `biz_*` lessons through `report.lessons` (`business.js:697`, `engine.js:890`).
- **[CODE] Locked lessons** show "?" + "שיעור נעול" + "שחק כדי לגלות" (`lobby.js:578`). No lesson has a `hint` or `world` field (R1: 0/75), so every locked card looks the same. The title is hidden, and there is no hint about which event teaches it.

### 1.3 Link between a lesson and the event the player lived

- **[CODE] There is no link.** `lesson()` stores only the id. No month, no event title and none of the player's numbers are kept.
- The lesson card (`ui.js:1045-1047`, `lobby.js:583-589`) shows only the generic `text`. The library cannot answer "where did I learn this?" or "what did it cost me?".
- Business notes do carry the player's own numbers ("ההכנסות עלו ב־₪X, אבל הרווח ירד ב־₪Y…", `business.js:657`), but see §3.4: those notes are never rendered.

### 1.4 Numbers and paragraph length

- **[OBSERVED] R1:** the average text is **96 characters**. The longest are `rental_tax` (226), `credit_card_debt` (221), `betterment_tax` (198), `capital_gains` (154) and `buy_the_dip` (152). 5 lessons are over 150 characters. The library grid cuts them at 147 + "…" (`lobby.js:577`), and the full text is shown only in the sheet.
- **[OBSERVED]** only **14/75** lessons contain any digit. Worked numeric examples exist only in:
  - `biz_vat` (₪118 → ₪18);
  - `biz_ltv_cac` (₪100 vs ₪300 / ₪50);
  - `pension_match` (₪6 → ₪12.5);
  - `credit_points` (₪242).
- Core lessons have no number at all: `compound_interest`, `inflation`, `diversification` (45 characters, the shortest), `opportunity_cost`, `cashflow`.

---

## 2. Life events and dilemmas

### 2.1 Inventory

- All 12 events are **shared by every world**: `LIFE_EVENTS` in `life.js:96-163`, drawn on tile **L**.
- L tiles per 40-tile board: w1 3, w2 4, w3 3, w4 3, h 3 (from the board strings).
- **Trigger:** `createLife` (`engine.js:1201-1206`) pops a card from a per-game shuffled deck (`drawCard`, `engine.js:1139-1142`, reshuffled when empty) and always draws one extra `r` from the `life` stream. If `when()` fails, the card is swapped to its `alt`.
- **Effects:** `lifeEffects` (`engine.js:1373-1383`) previews them. `applyLife` (`engine.js:2135-2165`) applies them. S = base net salary, minimum ₪3,000 (`engine.js:1339`).

| id | personal | when / alt | options → immediate effect | delayed effect | lesson unlocked |
|---|---|---|---|---|---|
| wedding `life.js:97` | yes | not married / → vacation | modest −1.2S +8😊 · big −2.5S +9😊 +6✨ · registry −0.2S +5😊 | married ⇒ happiness set point +5 (`engine.js:795`) | wedding |
| baby `:103` | yes | kids<3 / → parent | yes −0.5S, **+0.1S/month for good**, +10😊 −12🔋, kid+1 · later −1😊 | baby's first 12 months: −2🔋 every month (`engine.js:815,822`); +1 credit point (tax) | kids_cost, credit_points |
| moving `:108` | yes | — | bigger −0.3S, rent +0.1S · stay rent +0.03S · smaller −0.2S, rent −0.08S, −4😊 | permanent change to the "rent" line (`engine.js:2139`) | — |
| parent `:114` | yes | — | monthly +0.08S × 12 · once −0.9S · no −7😊 | 12-month expense line | — |
| car `:120` | no | — | fix −0.4S · lease −0.3S + 0.12S × 36 · bus −6🔋 −3😊, car line −60% for good | lease ends after 36 months | car_cost |
| friend `:126` | yes | — | lend −1S · guarantee 0 now (risk 1.5S) · no −3😊 | **Resolves after 6 months**: lend repaid 60% of the time; guarantee called 35% of the time (`engine.js:858-869`, `2160-2161`) | friend_loan / guarantor |
| reserve `:132` | no (single option) | — | go +0.3S, −20🔋 | — | reserve_duty |
| jobOffer `:136` | yes | — | take +25% gross, workLoad +1 · counter 60% chance of +10% (`p.r`) · stay +2😊 | workLoad: −4🔋 every work month, for good (`engine.js:821`) | job_offer |
| layoff `:142` | yes | — | withdraw / keep severance; both: 2 months at 60% of net | jobless ends with a news line (`engine.js:857`) | unemployment, severance |
| health `:147` | no | — | private −0.5S +12🔋 · public −8🔋 −2😊 | — | — |
| vacation `:152` | yes | — | abroad −1S +7😊 +15🔋 · local −0.3S +4😊 +10🔋 · skip −3🔋 | — | — |
| course `:158` | no | — | take −0.5S −6🔋, +3 study months · skip | can finish studies → +20% gross (`engine.js:933-939`) | (through studyDone) human_capital |

Other "life-like" dilemmas that are not on tile L:

- monthly plans on payday (`life.js:63-69`);
- edu tile (`engine.js:1409-1417`);
- the tax tile, with the choice to report side income (`engine.js:1419-1430`, `2191`);
- world crises on tile X, all `noSalary` (for example `w1.js:124-128`, `w2.js:159-163`);
- doodad "needs" such as "תיקון לרכב" and "טיפול שיניים" (`w1.js:106-108`).

### 2.2 Chains vs. one-shot

- **[CODE] The only real follow-up chain is `friend`.** It stores `L.friend {kind, amount, at, ok}` and resolves 6 months later with news and cash (`engine.js:858-869`).
- Other delayed effects are "tails", not chains: a lease, a parent's 12-month expense, being jobless for 2 months, a baby's energy drain, workLoad, study months. They never come back as a new decision.
- **[CODE] `L.events` is written** (`engine.js:2162`) but only ever **counted** (`engine.js:1044`, `2750`). No event reads earlier decisions.
- The only memory-like checks are `when()` on wedding (married) and baby (kids < 3).
- **Consequences of having no memory** (all [CODE]):
  - **Car:** choosing "bus" (`carCut`) sets no `noCar` flag. The doodad "תיקון לרכב" (`w1.js:106`) can still appear. A second car card can offer "fix" again, and "lease" will add a line called "ליסינג רכב חדש", which `carLine()` (`engine.js:1370`) then treats as a car again.
  - **Moving vs. homeowners:** `rentLine()` matches `/שכירות|משכנתא/` (`engine.js:1371`). A homeowner (dev 'משכנתא' 7,500, `w1.js`) therefore sees "בעל הבית רוצה להעלות שכירות" (`life.js:108`), and "stay" adds +0.03S to the **mortgage**.
  - **Friend: one slot only.** A second friend card within 6 months overwrites `L.friend` (`engine.js:2160-2161`). The first loan then disappears: no repayment and no news. This is possible after the deck reshuffles.

### 2.3 Repetition

**[OBSERVED] R3** (random legal player, time-limited mode, 60 seeds per world):

| world | months/game | life events/game | max | games with a repeated event |
|---|---|---|---|---|
| w1 | 63 | 6.7 | 17 | 13/60 |
| w2 | 71 | 10.3 | 19 | **33/60** |
| w3 | 56 | 5.5 | 13 | 6/60 |
| w4 | 57 | 5.8 | 17 | 12/60 |

- `vacation` appears about 1.6× as often as the other events in every world (w1: 55 vs ~33), because it is the fallback for `wedding` (`alt:'vacation'`) when the character is already married.
- In free mode (no time limit) the same player averaged 12.6 (w1) and 28.4 (w2) life events, up to 121. Long free games repeat the same 12 cards many times.
- **Repetition risks:**
  - the same dilemma comes back with no reference to last time;
  - text that contradicts the player's state (car after bus, landlord for a homeowner, "wedding" swapped to "vacation");
  - the friend overwrite.

### 2.4 Scoring of values/family decisions

- **[CODE]** `decisionRecord` (`engine.js:2027-2049`): `personal` events always score 100. Only a risk flag lowers the score, and then only to 50 (`engine.js:2038-2040`). `noCushion` is set when the option needs a loan (`engine.js:2003`).
- Personal events have no primary button (`engine.js:1474`). The UI shows "החלטה אישית — אין כאן תשובה נכונה אחת" (`ui.js:639-640`).
- **[OBSERVED] R4**, the problems that remain:
  - **`health` (not personal):** "טיפול פרטי" scores **0, "החלטה יקרה"** for the teacher and the driver, and 100 for the dev. `optionU` for life events counts cash, monthly and salary, plus happiness × 0.05, but **ignores energy** (`engine.js:2003`). The +12🔋 / −8🔋 trade-off is invisible to the score. This is a health/wellbeing choice that is scored as if it had one right financial answer.
  - **`course` (not personal):** the mentor's own primary option "להירשם" ("הבחירה של המנטור", `ui.js:641`) scores **0 "החלטה יקרה"** for all 3 characters. Study progress (`e.study`) is not valued in the life branch. The plan branch does value it (`engine.js:2009`). The verdict therefore contradicts the mentor's recommendation on the same card.
  - **`car`:** primary "לתקן" scores 63–70 ("סבירה"). "אוטובוס" always scores 100 because the car-line saving × 24 months dominates and −6🔋/−3😊 barely count. Transport is a lifestyle trade-off, so it should not have one money-optimal answer.
  - **`friend` guarantee:** always 100. The risk `e.risk = 1.5S` (`engine.js:1380`) is shown as a chip but never enters `optionU`. Personal scoring caps the effect, but the 50-point "risky" flag is never raised for the guarantee, only for lending with a loan.
  - **`layoff`** is `personal`, so "withdraw vs keep severance" is always 100/100. This is a real financial decision (liquidity vs. retirement savings) that could be taught. It needs a cushion-aware hint, not a verdict.

### 2.5 What the card shows before the decision (hints)

- **[CODE] Sign of monthly costs on life cards.** `effectChips` (`ui.js:606-616`) renders `e.monthly` with `sgn()` and `cls()` (`ui.js:15`, positive = green). In life effects, positive `monthly` is a **cost** (`engine.js:1375`). So:
  - "כן, עכשיו" (baby) shows **"+₪900 בחודש" in green** (teacher);
  - a lease shows "+₪1,080 בחודש × 36" in green;
  - "bus" shows its saving as a **red** "−₪540 בחודש".
- **[CODE] `e.salary` is never rendered** by `effectChips`. jobOffer "take" (+₪1,744 net for the teacher) and layoff (−₪3,600/month × 2) show no money chip at all. The number exists only in the label text or in nothing.

---

## 3. Business system

### 3.1 Business types in practice

**[CODE]** Five archetypes in `business.js:49-134`:

| id | what | offered in |
|---|---|---|
| `coffee` | coffee cart at a train station; owner-operated, fresh stock | w1, w2, h, and **every** side hustle (`engine.js:837`) |
| `laundromat` | self-service; high fixed costs; machines cap capacity; expandable | w2, w3, w4, h |
| `toyshop` | online toy import from the Far East: inventory, 1-month lead time, shipping + 12% duty, 50% of sales collected next month | w1, w3 |
| `pizza` | franchise: 8% royalty, staff 4–8, expandable oven | w2, w4 |
| `app` | fitness app, subscription: churn, CAC/LTV, burn and runway, 15% store fee | w4 |

- Offers rotate per world through `bizOffers`, one K tile per board (`engine.js:925-931`).
- There is **no** physical toy store, no service business and no B2B business.
- The side hustle always turns into a coffee cart after 15 months, whatever the world.

### 3.2 Mechanics that exist

**[CODE]**, all in `business.js`:

| mechanic | status | where |
|---|---|---|
| pricing (±10% steps, min/max) | ✅ linear elasticity | `:218`, `:592`, engine `:912-913` |
| demand (base × price × marketing × effects × ±10% noise) | ✅ | `:375` |
| marketing with diminishing returns | ✅ | `:220`, note `:681-686` |
| staff: hire (25% of a wage as hiring cost; new hires work at half capacity), fire (1 month of severance), quits | ✅ | `:226`, `:265-266`, `:331` |
| inventory / lead time / dead stock (toyshop) · spoilage of fresh stock (coffee, pizza) | ✅ | `:271-277`, `:355`, `:387-396` |
| fixed vs. variable costs, royalty, card fees, fulfilment | ✅ | `:397-408` |
| VAT 18% output − input, paid monthly | ✅ | `:383`, `:423-430` |
| corporate tax 23% + loss carry-forward · dividend tax 30% on draws · 30% capital-gains tax on a sale | ✅ | `:410-413`, `:435-437`, `:528-529` |
| receivables (`cashShare`, 1-month `arLag`) | ✅ | `:417-422` |
| payables / supplier credit | ❌ suppliers are always paid immediately | — |
| business cash; automatic owner injection when cash goes below zero | ✅ (no business loan or overdraft) | `:433-434` |
| depreciation · break-even · margins | ✅ | `:406`, `:485-497` |
| owner draw (reinvest = draw less / inject) | ✅ | `:435-437`, `:284` |
| manager (passive vs. active income, energy) | ✅ | `:226-233`, engine `:1454` |
| expand (laundromat, pizza only) | ✅ | `:259`, `:278-281` |
| valuation and sale (profit multiple, revenue multiple for a growing app, asset floor) | ✅ | `:505-539` |
| inflation (costs rise, the price does not) · economy shocks | ✅ | `:542-549`; engine `:950`, `:2342` (holiday bonus), `:2362` (recession ×0.8, 3 months) |
| link to the dollar (w3 is the FX world, and toyshop is an importer there) | ❌ `business.js` has 0 references to usd/fx | — |
| seasonality calendar · reputation/quality · competitor price response · business loan | ❌ | — |

### 3.3 Business events

**[CODE]** `business.js:142-153`, weighted per archetype, 25% chance per month, no warning. **[OBSERVED] R5:** toyshop over 240 months had costSpike 16, customsDelay 15, platformChange 14, competitor 11, holiday 4, viral 3.

| requested event | status |
|---|---|
| holiday stock | ⚠️ `holiday` = demand ×1.2 for 1 month, **at random**. You cannot see it coming or order stock for it. There is no "order before the holiday" decision. The market card "bonus" can also trigger it (`engine.js:2342`). |
| shipping delay | ✅ `customsDelay` (+1 month on orders already in transit) |
| raw-material prices | ✅ `costSpike` (unit cost +15% for 3 months), with text per archetype |
| employee leaving | ✅ `staffQuit` |
| new competitor | ✅ `competitor` (demand ×0.82 for 6 months) |
| big **late-paying** client | ❌ `bigClient` adds units in a single month and is collected like any other sale. There is no late payment, no default and no payment terms. |
| campaign overloading supply | ⚠️ There is no explicit event. A `viral` demand spike or heavy marketing does produce `lostSales.capacity` and the note "…הלכו לאיבוד — לא היו מספיק ידיים/מכונות" (`:667`), so the mechanic is there but it is not staged as a story. |
| also present | breakdown, inspection, platformChange |

### 3.4 Is revenue ≠ profit ≠ available cash shown?

- **The engine computes it all.** [CODE]
  - `report.lines` has every P&L line, then "שינוי בקופת העסק", "לכיס שלך", "הזרמת מכיסך" (`business.js:623-647`).
  - The headline is "מחזור X · רווח נקי Y · בקופה ±Z" (`:476`).
  - `teach()` writes `cash_vs_profit`, `rev_up_profit_down` and `injection` notes with the player's own numbers (`:649-698`).
- **What the player actually sees:** [CODE]
  - **Monthly toast:** headline + "לכיס שלך" + first event (`game.js:678-681`). The three numbers are on one line, which is good.
  - **The teaching note is dropped.** `monthlyBusiness` puts `note: r.notes[0].text` into the news (`engine.js:891`), but `game.js:678-681` never renders `n.note`. `summary().notes` is not rendered on the manage card either (`ui.js:847-857`). The key explanations ("רווח נקי ₪X, אבל הקופה זזה ב־₪Y — כי קנית מלאי…") never reach the screen. Only the lesson toast appears.
  - **Manage card:** last month's net profit, business cash, valuation, net-profit sparkline. There is **no revenue line** and **no P&L breakdown** (`ui.js:847-857`).
  - **Offer card:** 3-month revenue, gross profit and net profit. `forecast3.cashChange` exists (`engine.js:1438`) but is **not shown** (`ui.js:835-845`). For toyshop, a positive profit next to a cash drain is exactly the lesson, and it is hidden.

---

## 4. Six event chains [HYPOTHESIS]

### Common rules for all six

**Determinism and fairness:**

- Keep `createLife` at exactly the same draws: it draws a card and one `r` today.
- When a chain step is due, **override the drawn card after drawing it**. The `life` stream then stays aligned for ranked, daily and server replay.
- Any extra randomness goes into a **new stream appended at the end** of `STREAMS` (`js/rng.js:59`). Appending keeps every existing stream seed unchanged, because seeds are derived from the stream's index.
- `supabase/functions/verify-result/engine/` holds a mirror copy of the engine. It must get the same change.

**State:**

- Store everything in `st.life.chains = { car:{…}, move:{…}, career:{…}, side:{…}, friend:{…}, crisis:{…} }`. It is plain JSON and serializable.
- Bump `SAVE_VERSION` (`engine.js:22`, currently 3) and add a migration that defaults it to `{}`.

**Delivery:**

- A due step replaces the next tile-L card (`nextAt` = earliest month).
- If the player never lands on L, a step may ride on the payday card as an extra option, capped at one chain step per payday.
- At most **one active step per chain**, and **at most 2 chains open at the same time**.

**Anti-repeat:**

- While a chain is open, its entry card is removed from the deck draw: swap it to `alt`/next.
- After the chain ends, wait a cooldown before it can start again.

**Scoring:**

- Wellbeing and values steps are `personal` (score 100; only risk flags count).
- Purely financial steps are scored. `optionU` must value energy and study (§2.4) before any chain relies on it.

**Hints before the decision (nothing should be impossible to know):** every chain card shows

1. the cost of each option over 12 or 24 months, with the same formula the score uses;
2. "יש לך X חודשי כרית" (`emergencyOf`);
3. any odds as **game odds**, with the label "במשחק";
4. a "זוכר?" line that recalls the earlier choice and its real cost so far.

### 4.1 Car, repairs and transport (`chains.car`)

- **Trigger:** the existing `car` card (`life.js:120`) is step 1.
- **Eligibility:** `carLine(st)` exists. Characters with no car get a "transport to a new job" variant (step B2) instead.
- **Flags:** `{stage, path:'fix'|'lease'|'bus', startM, spent, nextAt, noCar}`. `noCar=true` removes the "תיקון לרכב" doodad from the draw (swap to the next doodad) and blocks re-entry.

| step | when | decision | immediate effect | delayed effect |
|---|---|---|---|---|
| 1 | entry | fix / lease / bus (existing) | existing | sets `path`, `spent` |
| 2A (fix) | +6..10 months | "הבלמים והטסט: ₪{0.25S}" → fix again / sell and buy a cheaper used car (cash +0.6S −0.9S, car line −20%) / give up the car | cash | repeated repairs raise `spent`. The card shows "הרכב עלה לך {spent} ב־{n} חודשים" |
| 2B (lease) | +12 months | "הביטוח והטיפולים עלו" → keep (+0.02S/month) / exit the lease early (penalty = 3 payments) | cash / monthly | at month 36: "הליסינג נגמר" → return it / buy it at the residual value (−1S) |
| 2C (bus) | +4 months | "הבקרים ארוכים" → e-bike (−0.25S, +4🔋 back) / car-share (+0.04S/month) / stay as is | energy / monthly | `noCar` stays true |
| End | after step 2 (or the lease end); cooldown 24 months | | | |

- **Lessons:** car_cost, opportunity_cost, emergency_fund, lifestyle_creep. New lesson: `total_cost` ("עלות כוללת של בעלות").
- **Hint line (Hebrew):**
  - «זוכר? לפני 8 חודשים תיקנת ב־₪3,600. עכשיו המוסך מבקש עוד ₪2,250.»
  - «ב־24 חודשים: תיקון ₪2,250 · יד שנייה ₪7,200 · בלי רכב חוסך ₪12,960.»

### 4.2 Moving apartment and cost of living (`chains.move`)

- **Trigger:** the existing `moving` card.
- **Eligibility:** there must be a **rent** line (`/שכירות/`). For a mortgage, use a homeowner variant: "the building needs a repair fund (ועד בית)" or swap to `alt`. This also fixes §2.2.
- **Flags:** `{stage, rentAt0, area:'center'|'periphery', deposit, nextAt}`.

| step | when | decision | effects |
|---|---|---|---|
| 1 | entry | bigger / stay / smaller (existing) + **new:** "לפריפריה: −25% שכירות, +נסיעות" | rent line; `area` |
| 2 | the first `yearlyPrices` after entry (`engine.js:941`) | «בעל הבית מבקש +{infl+2}% בחידוש החוזה» → negotiate (reuse the `negotiate()` odds, shown as a %) / accept / move with roommates (only if `partner !== married`) | a deposit of 2 months' rent leaves cash and comes back when you leave (liquidity) |
| 3 (periphery) | +3 months | the commute: needs a car (→ hands off to 4.1) / 2 days a week from home (−5% gross) / train (−3🔋/month) | links to the car chain |
| End | after step 2/3; cooldown 24 months | | |

- **Lessons:** inflation, wage_lag, real_vs_nominal, negotiation, lifestyle_creep. New lesson: `liquidity`.
- **Hint:** rent as a % of net, labelled "כלל אצבע, לא חוק". 12-month difference per option.
- **Hebrew:** «החוזה נגמר בעוד חודש. בעל הבית רוצה ₪250 יותר. השכירות כבר 36% מהנטו שלך.»

### 4.3 Studies / career and burnout (`chains.career`)

- **Trigger:**
  - energy < 35 at 2 paydays in a row; **or**
  - jobOffer "take" (`workLoad > 0`); **or**
  - `study.done`.
- **Eligibility:** not jobless; at most one per game for each sub-path.
- **Flags:** `{stage, cause, promoted, warned, nextAt}`.

| step | decision | effects / hint |
|---|---|---|
| 1 "אות אזהרה" | push on / vacation week (−0.3S, +12🔋) / 2 months on the "rest" plan | Hint: **show `burnoutChance(energy+Δ)` as a %** (`engine.js:791`), and "מכל ₪100 שעות נוספות נשארים ₪{100×(1−marginal)}" (`marginalRate`) |
| 2 "קידום לניהול" (after study or 10 work months) | accept (+15% gross, workLoad +1) / ask for a 4-day week (−10% gross, workLoad −1) / stay | personal: no single right answer |
| 3 "לחפש עבודה עם התואר" (if `study.done`) | interview (1 month of `jobless`, then +X% with the odds shown) / stay and ask for a raise (existing `askRaise`) | uses the existing `raiseChance` |
| End | a burnout happens (existing `engine.js:816-818`), energy > 60 for 3 months, or a job switch; cooldown 18 months | |

- **Lessons:** burnout, time_scarce, marginal_overtime, rest_value, human_capital, ask_raise, job_offer.
- **Hebrew:** «שלושה חודשים בלי הפסקה. הסיכוי להישחק בחודש הבא: 31% (במשחק).»

### 4.4 Side hustle becomes a business (`chains.side`)

- **Trigger:** `L.side.months` milestones (`engine.js:832-843`).
- **Eligibility:** plan = side.
- **Flags:** `{stage, reported, bigOrder:{amount,dueAt}, nextAt}`. `L.side` and `L.sideReport` already exist.

| step | when | decision | effects |
|---|---|---|---|
| 1 | side month 1 | «ההכנסה הראשונה!» → open a tax file now (sets `sideReport`, the existing action) / later | Hint: «בקצב הזה תצבור חוב מס של ₪{due×12} בשנה, ועוד 10% קנס בסוף השנה» (`engine.js:727-729`, `959-961`) |
| 2 | month 6 | «לקוח רוצה הזמנה גדולה» → take it: buy supplies now (−0.3S), paid **next month** / ask for a 50% advance (odds) / decline | teaches receivables before the player owns a business |
| 3 | month 10 | «להתפטר ולעבוד על זה במשרה מלאה?» → yes (salary stops; graduates now) / not yet / keep it small for good (stays side income, no 15-month graduation) | Hint: runway = cash ÷ monthly expenses, plus a `BIZ.forecast` of the business it would become |
| 4 | month 15 (existing graduation) | **pick the archetype** from the world's `bizOffers` instead of always coffee | `addBusiness` with the chosen type |
| End | graduation, or 3 months off the side plan; once per game | | |

- **Lessons:** side_hustle, side_tax, biz_receivables, biz_owner_job, emergency_fund.
- **Hebrew:** «בית קפה שכונתי רוצה 200 עוגות לחג. צריך לקנות חומרים עכשיו — והתשלום רק בחודש הבא.»

### 4.5 Partnership or a loan to a friend (`chains.friend`)

- **Trigger:** the existing `friend` card.
- **Fix:** turn the single slot into a queue or block re-entry. This also fixes §2.2.
- **Eligibility:** no open friend chain; cooldown 18 months after it ends.
- **Flags:** `{stage, kind, amount, extra, ok (sealed at entry, as today), at, plan}`.

| step | when | decision | effects |
|---|---|---|---|
| 1 | entry | lend / guarantee / say no (existing) | Hint: «במשחק: בערך 4 מתוך 10 לא מחזירים» (lend: `p.r<0.6` ⇒ 40% default) and «ערבות: אם הוא לא ישלם — אתה משלם {1.5S}» |
| 2 | +3 months (lend/guarantee only) | «הוא מבקש עוד {0.5S} כדי לא לסגור» → give more (raises the exposure; the outcome stays sealed) / offer a partnership instead: 20% of the business for {0.5S} (a small asset with a share of profit) / refuse | new lesson `sunk_cost` ("עלות שקועה") |
| 3 | resolution (+6, existing) | if he defaults: accept a repayment plan (+0.05S × 12) / write it off / small-claims court (cost, odds) · guarantee called: pay now / spread it with a bank loan | credit_score link |
| End | step 3 | | |

- **Scoring:** all steps are personal. Only the risk flags apply (noCushion, and the guarantee exposure > cushion).
- **Lessons:** friend_loan, guarantor, sunk_cost, credit_score.
- **Hebrew:** «יוסי שוב מתקשר. "עוד ₪4,500 ואני עובר את החורף." כבר נתת לו ₪9,000.»

### 4.6 Economic crisis and recovery (`chains.crisis`)

- **Trigger:**
  - a crisis tile with a recession card (`w2.js:161`), or
  - an index month ≤ −8% (`L.lastCrash`, `engine.js:983`), or
  - the `crisisHit` market path (`engine.js:1163`).
- **Eligibility:** once every 36 months; not in history mode (it has real data).
- **Flags:** `{stage, startM, idxAtStart, idxPeak, choices:{auto, pay}, nextAt}`.

| step | when | decision | effects |
|---|---|---|---|
| 1 | entry | «המדד ירד {x}%. מה עם הוראת הקבע?» → continue / pause / sell everything (sets `panicSell`) | Hint: months of cushion, rate type of your debts. **Unlocks `time_in_market`**, today unreachable (§1.1) |
| 2 | +1..3 months | «המעסיק מציע: קיצוץ 10% בשכר — או סיכון לפיטורים» → accept / refuse (layoff odds shown) / start looking | reuses the `layoff` effects; managed businesses already get `applyShock` recession (`engine.js:2362`) |
| 3 recovery | when IDX ≥ 0.95 × `idxPeak`, or after 12 months | reflection card, no decision: "what your choice did", with **public** numbers only (units bought cheaply vs. not) | luck vs. decisions (`learningOf`) |
| End | step 3, or 18 months | | |

- **Lessons:** emergency_fund, drawdown, panic_selling, time_in_market, unemployment, diversification.
- **Hebrew:** «כותרות: מיתון. יש לך כרית ל־2.5 חודשים, והמשכנתא בריבית משתנה.»

---

## 5. Learning transfer: short in-context practice [HYPOTHESIS]

### Mechanism

- A "💡 שאלת רגע" chip appears on the **next calm card**: payday, doodad, market, or a business toast. It appears **2–6 turns after** the related lesson was unlocked or the related mistake was made.
- It is one tap to open and one tap to answer. It can be skipped and never blocks the game.
- **No money effect.**
- The question is chosen deterministically from (lesson id, turn), with **no RNG draw**, so ranked replay is safe.
- It updates `st.dq.mastery[principle]` with a `transfer` tag, as proposed in `EDUCATION_REVIEW.md` §4.6.
- At most 1 per 3 turns. Each question is shown once per game.
- The scenario is always **different** from the one the player just lived.
- Numbers come from the player's own state where that is safe, for example `E = expensesOf(st)`.

| topic | when to offer | new scenario (Hebrew) | answers (✔ = correct) | one-line explanation |
|---|---|---|---|---|
| budget | after a doodad or a new monthly line | «לנועה נטו ₪8,000 והוצאות קבועות ₪6,500. היא נרשמת לחדר כושר ב־₪250. כמה נשאר לה לחסוך?» | ₪1,750 · ✔ ₪1,250 · ₪1,500 | «8,000 − 6,500 − 250.» |
| debt & interest | after a loan or credit | «חוב ₪10,000 בריבית 12% בשנה. משלמים ₪100 בחודש. מה קורה לחוב?» | יורד לאט · ✔ נשאר אותו דבר · נגמר בעוד 100 חודשים | «הריבית בדיוק ₪100 בחודש — כל התשלום הולך לריבית.» |
| emergency fund | after a forced loan or a crisis | «לאבי הוצאות של ₪{E}. כמה זה כרית של 3 חודשים?» | ✔ ₪{3E} · ₪{E} · ₪{6E} | «3 × ההוצאות החודשיות — לא המשכורת.» |
| cash flow vs. net worth | after a reval or a buy with cf ≤ 0 | «לדנה דירה ששווה ₪2 מיליון, משכנתא ₪1.5 מיליון, ותזרים של ‎−₪500 בחודש. מה נכון?» | ✔ שווי נקי חיובי, תזרים שלילי · היא כבר חופשית · היא בהפסד | «שווי זה כמה יש לך; תזרים זה כמה נשאר כל חודש.» |
| liquidity | when cash < 1 month but net worth is high | «מה הכי מהר הופך למזומן בלי הפסד?» | דירה להשכרה · ✔ חיסכון נזיל · מניה שירדה | «נזיל = זמין מחר, בלי למכור בזול.» |
| diversification | after the 2nd asset of the same kind, or a kind-specific crisis | «לרון 3 דירות באותה עיר. מה הסיכון הגדול?» | ✔ מכה אחת פוגעת בכולן · אין סיכון בנדל"ן · מס | «פיזור = לא הכול באותו סל.» |
| compound interest | after the pension lesson or auto-invest | «₪1,000 בתשואה של 5% בשנה, בלי למשוך. כמה אחרי שנתיים?» | ₪1,100 · ✔ ₪1,103 · ₪1,050 | «בשנה השנייה גם ה־₪50 מרוויחים.» |
| inflation | after the yearly inflation news | «אינפלציה 4%, ריבית בחיסכון 2%. מה קרה לכוח הקנייה של ₪10,000 אחרי שנה?» | עלה · ✔ ירד בערך 2% · לא השתנה | «ריאלי = ריבית פחות אינפלציה.» |
| taxes | after an overtime month, or the business VAT note | «מחיר בקופה ₪59 כולל מע"מ 18%. כמה מזה מע"מ?» | ₪10.62 · ✔ ₪9 · ₪18 | «59 × 18 ÷ 118 — המע"מ בתוך המחיר.» |
| risk | after crypto, a pitch or a gamble flag | «א׳: בטוח ₪100. ב׳: 50% ₪250, 50% ₪0. מה התוחלת של ב׳?» + follow-up «ומה אם ₪0 אומר שלא תשלם שכירות?» | ₪250 · ✔ ₪125 · ₪100 | «תוחלת גבוהה לא שווה כלום אם ההפסד מפיל אותך.» |
| opportunity cost | after the 3rd paid doodad | «₪4,500 על טלפון, או חיסכון של ₪4,500 שמכניס 2% בשנה. מה הוויתור על הטלפון?» | ₪90 · ✔ ₪4,500 ועוד הריבית שלא תקבל · כלום | «הוויתור הוא כל מה שהכסף יכול היה לעשות.» |
| profit vs. revenue | after the first business month | «פלאפל: מחזור ₪60,000, חומרי גלם ₪20,000, שכירות ושכר ₪35,000. מה הרווח לפני מס?» | ₪60,000 · ✔ ₪5,000 · ₪40,000 + follow-up «ואם חצי מהלקוחות משלמים בחודש הבא?» → «הרווח ₪5,000, אבל הקופה במינוס» | «מחזור ≠ רווח ≠ מזומן.» |

Small library upgrades that support transfer:

1. Store `{m, eventTitle, value}` when a lesson unlocks, and show «למדת את זה כש…».
2. Give each lesson one worked number line.
3. Add `hint` to locked lessons: «מחכה לך באירוע 'רכב'».

All three are [HYPOTHESIS].

---

## 6. Accuracy: game numbers that look like reality, and real claims without a source or date

### 6.1 Labelled correctly (no action needed)

- [CODE] Study: "+20% … (במשחק; במציאות זה תלוי בתחום)" (`life.js:66`).
- [CODE] Inflation lag: "⚠ במשחק השכר תמיד מפגר…" (`engine.js:955`).
- [CODE] Real-estate ROI: "מספר של משחק; במציאות הרבה פחות" (`common.js:53`).
- [CODE] Side-hustle tax: "🌍 במציאות פותחים תיק…" (`engine.js:961`).
- [CODE] Credit quiz: "זו ריבית מוגזמת של המשחק" (`w1.js:140`).
- [CODE] Business offer: "תחזית בלבד" (`ui.js:845`).

### 6.2 Game simplifications shown as fact, with no label

| # | where | the claim | what is simplified |
|---|---|---|---|
| A1 | `life.js:132` reserve | «ביטוח לאומי משלם תגמול… והמדינה מוסיפה מענק» | The game keeps the full salary **and** adds +0.3S cash, for every character. The size of the grant is a game number. |
| A2 | `life.js:142` + `engine.js:1378` layoff | «דמי אבטלה מכסים בערך 60%» | The game pays a flat 60% of **net** for exactly 2 months. Real benefits use gross, have a ceiling and waiting days, and require a qualifying period. This is EDUCATION_REVIEW S9 and is only half done ("בערך" was added). |
| A3 | `life.js:103-105` baby | "הוצאה קבועה של שנים" | The cost is +0.1S a month **for ever**, regardless of the child's age. |
| A4 | `life.js:108` + `engine.js:1371` moving | landlord raises rent | The same change is applied to a **mortgage** (see §2.2). The text and the mechanic disagree. |
| A5 | `business.js:88` toyshop | `dutyPct: 0.12` ("משלמים מכס… בנמל", `:85`) | It is shown as how importing works. There is no source for 12% duty on toys. **Unverified**: I did not check the current Israeli tariff and make no claim that it is wrong. It needs a source or a "במשחק" label. |
| A6 | `business.js:120` app | «חנות האפליקציות לוקחת 15%» | A real-world claim with no source and no date. App-store terms vary by program and year. |
| A7 | `business.js:172` lesson `biz_valuation` | «בדרך כלל פי 1.5 עד 4 מהרווח השנתי» | A rule of thumb presented as the norm, with no source. |
| A8 | `business.js:14-17` | VAT 18%, corporate tax 23%, dividend tax 30%, capital-gains tax on the sale 30% | Real Israeli rates, but they are **not listed in `docs-v3/sources.md`**, which covers only payroll, capital-gains and rental tax (§2). The surtax is not modelled. The 30% on selling a business is a simplification (substantial shareholder, no real/nominal split). Doc drift: `EDUCATION_REVIEW.md` S23 still says the code uses 25%. The code now uses 30%. |
| A9 | `engine.js:411-423` → `bank.js:113-128` | «בעולם האמיתי ≈ X% בשנה» on loans, overdraft and mortgage | The numbers come from constants the code itself calls «2026-ish market, approximations» (`bank.js:127`). Overdraft is "P+6%" where «banks quote P+3…P+10» (`bank.js:114`). The UI shows them as real-world facts with **no date and no source line**. |
| A10 | `life.js:178` lesson `credit_card_debt` | «בערך 8%–16% בשנה… החוק מגביל ריבית לריבית בנק ישראל ועוד 15%» | No source and no date in sources.md. The quiz `w1.js:140` says «החוק מגביל לכ־18% בשנה», which is right only while the BoI rate is about 3.25%, and it has no date. |
| A11 | `life.js:79` `idx` | index fund +4%/yr price + 0.25%/month distribution | A game model. The pension box also shows it with no label. This is EDUCATION_REVIEW S7/S8 and is still open as far as I read. I did not re-read the pension UI. |
| A12 | `business.js:63,80,97,115,131` | events hit 22–25% of months, at random, with no warning | Event frequency is a game choice. It is fine, but there is no label. |

### 6.3 Real-data claims: checked

**[OBSERVED] R6** (S&P 500 = the default history index, `history.js:30`):

- **dotcom** «מי שהמשיך להשקיע סכום קבוע… סיים בערך מאוזן אחרי אינפלציה» (`real.js:227`): DCA ×1.063 nominal, **×1.039 real** (Israeli CPI). ✔
- **gfc** «מי שהמשיך להשקיע כל חודש סיים… ברווח» (`real.js:252`): DCA **×1.167** nominal, ×1.091 real. ✔
- **housingIL** «פי 2.4 ב־13 שנה… מדד לצרכן עלה רק כ־17%» (`real.js:331`): homeIL 2008-01→2020-12 **×2.365**; CPI **×1.167**. ✔
- **Caveat** (already in sources.md:30 and EDUCATION_REVIEW S13): the S&P 500 is a USD price index. The game applies it to a shekel fund with no FX and no dividends.
- **Sources and dates:** `docs-v3/sources.md` gives a URL and a retrieval date (2026-11-20) for every series and tax parameter in `real.js`/`tax.js`.
- **Exception:** the headlines listed under «Widely documented events, dated from general knowledge» (`sources.md:67-71`) have **no individual source**. They are paraphrased and do not drive numbers, but they still lack a source.

---

## 7. Status table for owner sections 9, 11 and 13

Legend: **exists** · **needs improvement** · **missing** · **not suitable now**.

### §9: Six story chains (NL-08)

| item | status | evidence |
|---|---|---|
| Chain engine (state, follow-ups, memory of earlier decisions) | **missing** | `L.events` is only counted (`engine.js:1044,2750`); no event reads it |
| Friend loan / guarantee with a delayed outcome | **exists** (1 step) | `engine.js:858-869`; one-slot overwrite bug (`:2160`) |
| Car & transport chain | **missing** | `car` is one-shot; no `noCar` flag; doodad conflict (`w1.js:106`) |
| Moving & cost of living | **needs improvement** | one-shot; a mortgage is treated as rent (`engine.js:1371`) |
| Studies/career & burnout | **needs improvement** | the parts exist (plans, `burnoutChance`, `studyDone`, `jobOffer`), but they are not chained or narrated |
| Side hustle → business | **needs improvement** | automatic coffee cart at month 15 (`engine.js:835-842`); tax-report option exists |
| Economic crisis & recovery | **needs improvement** | crisis tiles, recession `applyShock`, index crash and drawdown lesson exist; no recovery arc; `time_in_market` unreachable |
| Anti-repeat rules | **missing** | deck reshuffle only; 33/60 w2 games repeat an event (R3) |
| Hints before decisions | **needs improvement** | monthly cost chip has the wrong sign; salary effect not shown (`ui.js:606-616`) |
| No single right answer for values decisions | **needs improvement** | personal events are handled; `health`, `course` and `car` are still scored money-only, and `course` contradicts the mentor (R4) |
| Deterministic, replay-safe chains | **not suitable now** without the design in §4: stream append + mirror engine + save migration |

### §11: Business at the centre (NL-09)

| item | status | evidence |
|---|---|---|
| Business types (coffee, laundromat, online toy import, pizza franchise, app) | **exists** | `business.js:49-134` |
| Pricing, demand, marketing, staff, inventory, lead time, fixed/variable costs, VAT, corporate/dividend tax, receivables, cash, profit, reinvest/draw, manager, expand, sell | **exists** | §3.2 |
| Payables, business loan, seasonality, FX link for the w3 importer | **missing** | §3.2 |
| Events: shipping delay, raw-material prices, employee quits, competitor | **exists** | `business.js:142-153` |
| Holiday stock (plannable) | **needs improvement** | random demand spike, no pre-order decision |
| Big client who pays late | **missing** | `bigClient` is paid like a normal sale |
| Campaign overloading supply | **needs improvement** | the lost-sales mechanic exists, but there is no event or story |
| Revenue ≠ profit ≠ cash in the UI | **needs improvement** | headline toast has all three; the teaching note is dropped (`engine.js:891` vs `game.js:678-681`); manage card has no revenue or P&L lines; offer card hides the cash forecast |
| Business as a central loop (frequency) | **needs improvement** | one K tile per board; R3: the random player still owns 0.3–0.6 managed businesses on average when the game ends |

### §13: Library and in-context practice (NL-10)

| item | status | evidence |
|---|---|---|
| Library collection, per-device persistence, new/read state | **exists** | `library.js`, `lobby.js:561-590` |
| Correct count in the UI | **exists** (computed live, 75) | stale "58" in `life.js:9`, `EDUCATION_REVIEW.md:5` |
| All categories in Hebrew | **needs improvement** | "business" shows in English (`lobby.js:560,568`) |
| Every lesson reachable | **needs improvement** | `time_in_market`, `benchmark` are unreachable (max 73/75) |
| Locked-lesson hints | **missing** | 0/75 have a `hint`; generic "שחק כדי לגלות" |
| Link from a lesson to the event lived | **missing** | only the id is stored |
| Worked numeric examples | **needs improvement** | 14/75 contain any digit |
| Paragraph length | **exists**, mostly | average 96 characters; 5 over 150 are cut in the grid |
| In-context practice / transfer questions | **needs improvement** | 4 quizzes per world on one "?" tile; a quiz unlocks its lesson even when answered wrong; no transfer items (§5) |
| "In the real world" line per lesson, with a source | **missing** | EDUCATION_REVIEW §3.11 is still open |

---

## 8. Facts that may be worth remembering (for the main session)

- From the repo, not from memory: `docs/next-level/TASK_BOARD.md` maps §9 → NL-08 (`js/systems/chains.js`), §11 → NL-09 and §13 → NL-10.
- Server replay uses a mirror of the engine in `supabase/functions/verify-result/engine/`.
- RNG streams are listed in `js/rng.js:59`. Appending a stream keeps the existing seeds.
