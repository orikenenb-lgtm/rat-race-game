# T4: Opening, onboarding, character & dream; free learning mode & ⚡/🔋 naming; library & in-context practice (spec)

Status: ready to implement, in two parts (ENGINE, LOBBY/UI) · Branch `feat/rat-race-next-level` · Owner brief sections §7, §13, §14.
Inputs: `research/ux.md` (cited **UX§n**), `research/content.md` (**CT§n**), `research/gameplay.md` (**GP§n**), `TASK_BOARD.md`, `specs/T1-stability-saves.md` (**T1§n**).
`specs/T2-strategic-depth.md` did not exist when this was written. Every T2 touch point below is a **contract with feature detection**: T4 works whether or not T2 has shipped.
Line numbers are against HEAD on 2026-11-21. If a line has moved, search for the quoted string.
Priority tags: **P0** must ship · **P1** should ship in the same session · **P2** may be cut, and must be listed as cut if it is.

---

## 0. Scope, lanes, hard rules

### 0.1 Two implementation parts (director decision)

| Part | Who | Files it may edit | When |
|---|---|---|---|
| **ENGINE** (§13) | engine lane | `js/engine.js`, `js/worlds/w1.js`, `js/finance/business.js` (one string), `js/life.js` (one comment), new `js/dreams.js`, new `js/practice.js`, `supabase/functions/verify-result/*` (CODES + mirror + re-pin), `tools/sim.mjs` (tutorial policy only) | after T2/T3 engine work, **in the same `SAVE_VERSION = 4` bump** (GP§5) |
| **LOBBY/UI** (§14) | lobby lane + in-game UI lane | `js/lobby.js`, `css/lobby.css`, `js/library.js`, `js/energy.js` (labels only), `js/progress.js`, `js/net.js` (one string), new `js/data/lessons-meta.js`, new `js/data/characters-meta.js`; in-game: `js/ui.js`, `css/game.css`, new `js/onboard.js` | can start now; every engine feature is feature-detected (§14.1) |
| **Shell requests** (§14.9) | shell lane (T1 owns `js/game.js`) | `js/game.js` only, about 30 lines, listed exactly as IR-T4-1…9 | after T1's `game.js` changes merge |

`index.html` is **not** edited by T4. Everything T4 adds to the in-game DOM is injected by `ui.js`/`onboard.js` at runtime.

### 0.2 Hard rules
1. **No ranked change.** Learning mode, dream goals, the intro scenario, the tutorial deal and practice questions never exist in `daily`/`weekly`/`challenge`. The verifier's `configFor` stays as it is (`tutorial:false`, no `learn`, no `dream`). Ranked scores, seeds and leaderboards are unchanged.
2. **No new randomness.** Nothing in T4 calls `next()`/`int()` on any stream, and no T4 option changes how many draws a card takes. A test compares the full `st.rng` state before and after each T4 action (§16 T-E7).
3. **No money from nowhere.** The intro "salary" beat has **no money effect** (the pawn starts on the payday corner and starting cash already is this month's money). Practice questions and dream missions have no money, 🔋 or 😊 effect.
4. **No new currency.** Dream badges and practice marks are records, not spendable. ⚡ keeps its exact economy (MAX 25, +1 per 6 min, CAP 99, gifts, daily +10, streak, achievement +2, quiz +1).
5. **Existing user data survives.** `rr2-progress`, `rr2-library`, `rr2-energy`, `rr2-coach`, saves: read old shapes, write new shapes additively (§14.4–14.6). Players with `gamesPlayed > 0` are never shown the new tutorial or the gradual reveal (§4.6).
6. **No test talks to production Supabase** (T1 rule 5). Every browser test routes `**/*.supabase.co/**`.
7. **Text style:** Hebrew, singular masculine imperative as the current UI ("לחץ", "בחר"), no English words on screen, money through the existing `iso()`/`num()` isolation (UX§2.7).

---

## 1. Decisions (and why)

| # | Decision | Reason |
|---|---|---|
| D-1 | Learning mode is a **boolean flag `learn:true` on a `mode:'free'` game**, not a new `mode` string. | `mode === 'free'` (or `!== 'free'`) is tested in 21 places (`engine.js:69,2687` time limit,`:2795` intro; `ui.js:186,374`; `game.js:33,50,197,234,550`; lobby ×11). A new mode string would make learning games time-limited, give them a ranked-style save key and break resume. The flag keeps all free behaviour and changes only what the director listed: `rollCost` 0, no boards, no ⚡ rewards, no ⚡-granting achievements. The director's "e.g. mode 'learn'" is satisfied in intent. |
| D-2 | First game: **2 screens** to the first decision (welcome → game). The character screen is optional on that path. | Brief: first meaningful decision ≤ 60 s, ≤ 3 screens. Today it is 4 screens and ~300 words (UX§2.1). |
| D-3 | The first decision is a **scripted, engine-owned intro card** (`type:'intro'`): salary → glitch → choice → visible effect → next goal. No roll needed. | Matches the brief's storyboard exactly, needs no reading of a document, and reuses the life-card pattern (effect chips, "no single right answer"), which UX§3.4 calls the best card in the game. |
| D-4 | The tutorial deal is **sized from the player's state** so its highlighted option always agrees with its verdict, and it appears only when the player can afford it with a 1-month cushion. | UX§2.2: today the tutorial's own deal is gold "לוותר" and buying scores 0/100. |
| D-5 | Dream goal is picked **before** a game (character screen, end of the first game, profile), never mid-game. No new action code for it. | Keeps the replay log unchanged for dreams; keeps the ≤ 2-screen first path. |
| D-6 | Dream missions are **display + meta badges only**, free/learn modes only. They never touch stars, win conditions or ranked. | Brief: "affects missions and progress display without breaking existing win conditions"; director: "must not change ranked scoring". |
| D-7 | Practice questions are engine data + a pure selector; an answer is a new logged action `['Q', qid, idx]`, free/learn only. | Director: practice data in the engine, no money effect, no RNG draws. Logging keeps free-game replay exact. |
| D-8 | ⚡ is named **"זריקות"** (singular "זריקה") everywhere; 🔋 stays **"כוח"**. Code identifiers are not renamed. | Director decision. Renaming `L.energy` would churn saves and the verifier mirror for no player benefit. A lint test guards the UI strings (§16 T-M6). |
| D-9 | First game: the first **10 rolls cost no ⚡** (`TUTORIAL_FREE_ROLLS = 10`), then the ⚡ chip appears with a one-line coach that also points to learning mode. **P1**, can be cut alone. | A new player has 25 ⚡ and a game needs 60+ rolls; meeting the limit before the fun is the wrong order (UX§3.1: the welcome spends 25% of its words on ⚡). Not farmable: only the first w1 game has `tutorial`. |
| D-10 | Library teasers, unlock hints, worked examples and simplification labels live in a **lobby-lane data file**, not in `life.js`. | Text-only data in `life.js` would force a verifier re-pin for every wording fix (GP§5). |
| D-11 | No new short mode, no new campaign. "Continue after win" is **deferred to T6** (it owns the end summary and return-to-decision). | The daily sprint already is a short mode with a clear goal; the four worlds already are the campaign (§11). |
| D-12 | Learning-mode games use their **own save slot** `rr2-save-learn-<w>`. | So a player who runs out of ⚡ can practise without deleting the normal game (§7). |

---

## 2. User flows and exact strings

String ids (`S-…`) are referenced by tests. Lobby strings live in one `const T4 = {…}` object at the top of the T4 section of `js/lobby.js`; in-game strings in `const STR = {…}` in `js/onboard.js`. `{x}` = placeholder, filled with pre-formatted values.

### F1 · New player, quick start (P0)
1. **Welcome** (`renderWelcome`, rewritten). Max 35 words.
   - S-W1 h1: `החיים שלך. הכסף שלך. הזמן שלך.`
   - S-W2 lead: `משכורת נכנסת, הוצאות יוצאות. המטרה: נכסים שמשלמים את החשבונות — ולהישאר מאושר בדרך.`
   - S-W3 primary (`data-act="welcome-go"`, initial focus): `יאללה, משחק ראשון ←` → `startFree('w1','teacher',{quick:true})` with `tutorial:true`.
   - S-W4 secondary link button (`data-act="welcome-pick"`): `אני רוצה לבחור דמות` → world view w1.
   - S-W5 small link (`data-act="welcome-restore"`, P2): `כבר שיחקתי במכשיר אחר` → profile restore form.
   - The ⚡ bullet, the ★★★ bullet and the plan bullet are removed (they return as just-in-time coaches, §4).
   - `rr2-onboarded` is set on either button (unchanged key).
2. **Game** opens with the intro card (§4.2). The first meaningful decision is beat 2.

### F2 · New player, picks a character (P0)
Welcome → world view w1 (character select, §5) → game with intro card. 3 screens. The dream row is shown but optional (§6.3).

### F3 · Returning player (P0)
Unchanged entry (home). The first game's end screen gains the dream invitation (S-D10). From game 2, the character screen shows the dream row, preselected with the last choice.

### F4 · Help and reopening the tutorial (P0)
- In game: a `❓` button injected by `ui.js` as the **first** child of `.htools` (`#helpBtn`, aria-label S-H0 `איך משחקים`). It opens a `ui.modal`:
  - S-H1 tag `איך משחקים`, title S-H2 `מה תרצה לראות?`
  - S-H3 `🎬 סיור קצר במסך (5 צעדים)` → `onboard.tour()` (§4.5)
  - S-H4 `📖 מה כל סימן אומר` → `onboard.legend()` (§4.5)
  - S-H5 `🔄 הדרכה מלאה במשחק הבא בשכונה` → `P.requestTutorialReplay()`, toast S-H6 `נפתח את ההדרכה במשחק הבא בשכונה.`
  - action `סגירה` (dismissable, Escape closes)
- Lobby: profile → "הגדרות" card gains the same three rows (S-H3 runs only in game, so in the lobby it reads S-H7 `🎬 סיור קצר — בפעם הבאה שתיכנס למשחק` and sets `rr2-reveal.tourNext = true`), plus S-H8 `👋 להציג שוב את מסך הפתיחה` → `go({k:'welcome'})`.
- The tutorial is **never** started automatically again once `P.tutorialDone` is true (§4.6).

### F5 · Learning mode (P0)
World view, above the characters: a radio group (`role="radiogroup"`, aria-label S-M0 `איך משחקים?`):
- S-M1 `⭐ משחק רגיל` · sub S-M2 `כוכבים, הישגים ובונוסים. כל הטלה עולה ⚡ זריקה אחת.`
- S-M3 `🎓 תרגול חופשי` · sub S-M4 `בלי הגבלת זריקות. בלי כוכבים, הישגים ובונוסי ⚡. לנסות, לטעות וללמוד.`
- Default: normal. The choice is remembered per device (`rr2-progress.lastMode`), but **a brand-new player always gets normal** for the first game.
- Continue buttons: if both slots exist, two rows: S-M5 `▶ להמשיך · {char} · חודש {m}` and S-M6 `▶ להמשיך בתרגול 🎓 · {char} · חודש {m}`.
- In game: the world card shows tag S-M7 `🎓 תרגול` next to the world name (injected by `ui.js` when `ctx.cfg.learn`).
- End screen in learning mode: §7.4.

### F6 · Out of ⚡ (P0)
Both "empty" surfaces (lobby `emptyEnergyHtml`, in-game `showNoEnergy`) gain a first button S-M8 `🎓 לתרגל בלי הגבלה`. In the lobby → world view of the last world played, mode = learn. In game → IR-T4-6.

### F7 · Dream goal (P0)
§6. Picked on the character screen, on the first game's end screen, or in the profile.

### F8 · Library and practice (P0 library, P1 practice)
§9 and §10.

---

## 3. First-minute storyboard (new player, phone 390 px)

Headless baselines are from UX§2.1 (phone: welcome at 7.8 s, board ready about 3 s after the click). Human times assume a skim reader.

| t (s) | Screen | What the player sees | Words to read | Tap |
|---|---|---|---|---|
| 0 → 8 | loading | T1 stages | – | – |
| 8 | **1 Welcome** | hero art, S-W1, S-W2, S-W3 | 18 | S-W3 at ≈ 13 |
| 13 → 16 | **2 Game** | board, HUD shows only cash + month (§4.3); intro card beat 1 "המשכורת נכנסה" with 3 numbers | 14 + 3 numbers | `ממשיכים ←` at ≈ 22 |
| 22 | 2 Game | beat 2 "מכונת הכביסה התקלקלה": 3 options with effect chips. **First meaningful decision available** | 30 | choice at ≈ 30 |
| 30 | 2 Game | beat 3 "ככה זה השפיע": cash ₪5,000 → ₪4,100 animates on the card and in the HUD; the "תזרים חודשי" stat appears; **next goal** box | 25 | `להטיל קובייה ראשונה 🎲` at ≈ 38 |
| 38 | 2 Game | coach on Roll (one sentence) | 14 | roll at ≈ 42 |
| 42 → 50 | 2 Game | dice, hops, first tile | – | – |

Budget for the test (AC-O1): first decision **enabled ≤ 60 s** after navigation start on both 390×844 and 1300×820 headless (desktop board-ready was 27.8 s in UX§2.1, so the budget holds with margin), with **≤ 3 screens** on both F1 and F2.

---

## 4. Tutorial: intro scenario, steps and gradual reveal

### 4.1 Principles
- **Short:** the core is the intro card + 2 coaches (roll, meter): 5 taps, under 2 minutes.
- **Skippable:** beat 1 has S-I3 `דלג על ההדרכה`. Every core coach has the same link. Skip = everything revealed, no more tutorial coaches this game, `P.tutorialDone = true`.
- **Reopenable:** F4.
- **Never forced again:** §4.6.
- **Gradual:** HUD parts appear when the game first needs them (§4.3), each with at most one sentence.
- **In-game examples:** every coach text uses the player's current numbers (placeholders filled from `E.metrics(S)` or the open card's `ev.data`).
- **At most one coach per turn**; a coach never opens while an event card is open, except the two in-card coaches (roi, plan).

### 4.2 The intro card (engine `type:'intro'`, w1 only, `st.tutorial` only)

Created by `createGame({tutorial:true})` as the pending event (contract E-3). `game.js` already opens a pending event on start (`startGame` → `handleLanding` when `S.pending`), so no shell change is needed to show it. One card, three beats; the card stays open between beats (`ctl.update`).

Numbers below are for the teacher (net ₪9,000, expenses ₪7,300, cash ₪5,000). `E` = `expensesOf(st)`, `cf` = `metrics().cashflow`.

**Beat 1 · salary** (`data.step = 'salary'`)
- tag S-I1 `חודש 1 · יום המשכורת` · title S-I2 `המשכורת נכנסה 🎉`
- 3 rows (`grid`): `נטו לחשבון` `{net}` · `הוצאות קבועות` `−{E}` · `נשאר בסוף החודש` `{cf}` (big, `pos`)
- line: `בקופה עכשיו: {cash}`
- mentor (bar): S-I4 `{who}, ככה נראה חודש: כסף נכנס, כסף יוצא. מה שנשאר — איתו בונים חופש.`
- options: `next` S-I5 `ממשיכים ←` (primary) · `skip` S-I3 `דלג על ההדרכה` (rendered as a text link, still a `<button>`, 44 px)
- money effect: **none**.

**Beat 2 · glitch** (`data.step = 'glitch'`)
- tag S-I6 `תקלה` · title S-I7 `מכונת הכביסה התקלקלה` · text S-I8 `הטכנאי אומר: {cost} לתיקון. איך משלמים?`
- note under the options (life-card pattern): S-I9 `אין כאן תשובה נכונה אחת. כל דרך עולה משהו אחר.`
- mentor: S-I10 `תקלות קורות לכולם. השאלה היא מה הן לוקחות ממך: מזומן, תזרים או זמן.`
- **no primary** on any option, no verdict pill, no decision record.

| option id | label | chips (sign = effect on you; red = cost) | engine effect |
|---|---|---|---|
| `fix:pay` | S-I11 `לשלם עכשיו {cost}` | `מזומן −{cost}` | `cash −= cost` |
| `fix:inst` | S-I12 `3 תשלומים של {inst}` | `−{inst} בחודש × 3` · `עולה {fee} יותר` | 3-month expense line `תשלומים: מכונת כביסה`, amount `inst`, ends by itself |
| `fix:diy` | S-I13 `לתקן עם חבר לפי סרטון ({diy})` | `מזומן −{diy}` · `🔋 −10 כוח` | `cash −= diy`, `life.energy −= 10` |

Amounts (engine, E-3): `cost = clamp(round100(0.12·E), 600, 3500)` (teacher 900, driver 900, dev 2,300, doctor 3,200); `inst = ceil10(cost·1.05/3)` (teacher 320); `fee = 3·inst − cost` (teacher 60); `diy = round100(0.3·cost)` (teacher 300).

The chips are rendered by a new `introChips()` in `ui.js` with explicit sign semantics (a monthly **cost** is shown as `−₪320 בחודש` in red). It does **not** reuse `effectChips()`, whose monthly-cost sign is inverted (CT§2.5; fixing that function is T3's job).

**Beat 3 · result + next goal** (`data.step = 'result'`)
- tag S-I14 `מה השתנה` · title S-I15 `ככה זה השפיע`
- rows show before → after, only for what changed:
  - `בקופה` `{cashBefore} → {cashAfter}`
  - `נשאר בסוף החודש` `{cfBefore} → {cfAfter}` + ` · ל־3 חודשים` (inst only)
  - `🔋 כוח` `70 → 60` (diy only)
- next-goal box (`.nextgoal`, gold outline): heading S-I16 `🎯 המטרה הבאה` and one of:
  - goal `cushion` (when `cash + savings < E` after the glitch): S-I17 `לשים בצד חודש הוצאות ({E}). ככה התקלה הבאה לא תיקח לך הלוואה.` + bar `{now} / {E}`
  - goal `asset` (otherwise): S-I18 `לקנות נכס ראשון שמכניס כסף כל חודש.`
- mentor: cushion S-I19 `קודם כרית, אחר כך נכסים. בוא נתחיל לזוז.` · asset S-I20 `יש לך כרית. עכשיו מחפשים נכס שעובד בשבילך.`
- option `go` S-I21 `להטיל קובייה ראשונה 🎲` (primary). Closes the card; `onboard` then runs the roll coach.

The HUD cash and cash-flow numbers animate at the same moment as the card rows (`ui.setCash(v, true)` already animates); this is the "sees the effect immediately" beat.

### 4.3 Reveal keys and schedule (gradual HUD)

Gradual reveal is active **only** in a game started with `cfg.tutorial` and only until it is skipped. In every other game all keys are revealed (but the first-time one-liners of §4.4 can still appear once per player, free/learn only).

`onboard.isRevealed(key)` is exported; `ui.renderHUD` and the card renderers call it. A hidden HUD part gets `hidden` (not `visibility:hidden`), so it is out of the tab order and the accessibility tree. When a key is revealed: the element appears with a 600 ms gold pulse (`.t4-new`, none under reduced motion) and the live region announces S-R0 `נוסף לתצוגה: {name}`.

| key | element(s) | revealed when (game state) | coach (§4.4) | `{name}` |
|---|---|---|---|---|
| `cash`, `month`, `mentor`, `home`, `mute`, `help` | `#hCash` stat, `#hMonth` stat, `#bar #mentor`, `#homeBtn`, `#muteBtn`, `#helpBtn` | always | – | – |
| `roll` | `#roll`, `#dice` | always visible; disabled until the intro closes | C-roll after beat 3 | – |
| `cf` | `#hCf` stat | intro beat 1 shown | – | `תזרים חודשי` |
| `next` | `#hNext` (new, injected) | intro closes with a goal | – | `המטרה הבאה` |
| `energy` (🔋) | `.lc.en` chip | glitch `fix:diy`, or first landed payday card | C-power | `🔋 כוח` |
| `goal` | `#hGoal` | first asset bought, or first payday passed, whichever first | C-meter | `מד החופש` |
| `plan` | `.lc.plan` chip | first landed payday card (plan tiles) | C-plan (in card) | `התוכנית החודשית` |
| `sheet` | `#sheetBtn`; desktop sheet auto-open | first payday card closed | C-sheet | `הדוח שלי` |
| `fund` | `.lc.fund` chip | goal `cushion` shown, or first `savings`/forced-loan news, or month ≥ 4 | C-fund | `🛟 קרן חירום` |
| `happy` | `.lc.hp` chip | first life event, first doodad "want", or month ≥ 6 | C-happy | `😊 אושר` |
| `credit` | `.lc.cr` chip | first loan (any kind), first `credit` doodad, or month ≥ 10 | C-credit | `🏦 דירוג אשראי` |
| `age` | `.lc.age` chip | first life event, or month ≥ 12 | – | `🎂 גיל` |
| `cpi` | `.lc.cpi` chip | first `inflation` news (month 13) | C-cpi | `🛒 אינפלציה` |
| `zr` (⚡) | `#hEnergy`, `#rollEn` | `turn ≥ TUTORIAL_FREE_ROLLS` (normal mode only; never in learning mode) | C-zr | `⚡ זריקות` |
| `tools` | `#turboBtn`, `#camBtn` | month ≥ 6 | – | `כלים` |
| `focus` (T2) | T2's focus row on the payday card | 3rd landed payday | C-focus | `מוקד החודש` |
| `impact` (T2) | T2's impact panel on deal cards | 2nd deal card | C-impact | `פאנל ההשפעה` |
| `mentorLevel` (T2) | – (lobby only) | after the first completed game | §6.5 | – |

Desktop: until `sheet` is revealed the sheet stays closed and `freeRect()` treats it as absent. The payday card shows the plan tiles **above** the payslip, and the payslip collapses into `<details>` with summary S-R1 `נכנס לכיס {net} · פירוט ▾` (UX§4 fix 6; all games, P1).

State: per game in `S.ui.reveal = {keys: string[], skipped: bool, coached: string[]}` (travels with the save, so resume restores it). Per player in `localStorage['rr2-reveal'] = {v:1, all:bool, coached:string[], tourNext:bool}`.

### 4.4 Tutorial steps table

"Core" steps run once in the tutorial game; "hint" steps are one-liners that run the first time their trigger happens in any free/learn game for a player who has not seen them (never in ranked, never if `rr2-reveal.all`).

| step | kind | trigger | target | title | text (exact; placeholders from the current state) | buttons |
|---|---|---|---|---|---|---|
| I1–I3 | core | game created | intro card | §4.2 | §4.2 | §4.2 |
| C-roll | core 1/2 | intro closed (`go`) | `#roll` | S-C1 `מטילים קובייה` | coarse pointer: S-C2 `לחץ על "הטל קוביות". החייל זז, ובכל משבצת מחכה הזדמנות, הוצאה או הפתעה.` · fine pointer: S-C2 + ` (אפשר גם רווח)` | `הבנתי` · `דלג על ההדרכה` |
| C-roi | core (in card) | the tutorial deal card is open | `#evCard [data-roi]` | S-C3 `כמה הכסף מרוויח?` | S-C4 `{down} שמכניסים {cf} בחודש = {roi}% בשנה. לחץ כאן כדי לראות את החישוב.` | `הבנתי` |
| C-meter | core 2/2 | `goal` revealed | `#hGoal` | S-C5 `מד החופש` | S-C6 `הכנסה פסיבית {passive} מתוך {E} הוצאות: {pct}%. כשהפס מלא — יצאת מהמירוץ.` | `הבנתי` · `דלג על ההדרכה` |
| C-plan | hint (in card) | first landed payday with plan tiles | `.plans` | S-C7 `התוכנית החודשית` | S-C8 `איך תעביר את החודש? "שעות נוספות" מוסיפות {otCash} בחודש ולוקחות 🔋 {otEnergy}. מנוחה מחזירה כוח.` (`otCash`, `otEnergy` from the overtime plan option's `effects`) | `הבנתי` |
| C-sheet | hint | `sheet` revealed | `#sheetBtn` | S-C9 `הדוח שלי` | S-C10 `כאן כל השורות: נטו {net}, הוצאות {E}, נשאר {cf}. לפני החלטה גדולה — תציץ.` | `הבנתי` |
| C-power | hint | `energy` revealed | `.lc.en` | S-C11 `🔋 כוח` | S-C12 `הכוח של {who} בסיפור: {en} מתוך 100. מתחת ל־25 יש סכנת שחיקה — חודש בלי משכורת.` | `הבנתי` |
| C-fund | hint | `fund` revealed | `.lc.fund` | S-C13 `🛟 קרן חירום` | S-C14 `יש לך {months} חודשים בצד. כשנגמר המזומן, הקרן משלמת לפני שהבנק נותן הלוואה כפויה.` | `הבנתי` |
| C-happy | hint | `happy` revealed | `.lc.hp` | S-C15 `😊 אושר` | S-C16 `אושר {hp} מתוך 100. ל־★★★ צריך לפחות 60. פיתויים משמחים לרגע, ואז דועכים.` | `הבנתי` |
| C-credit | hint | `credit` revealed | `.lc.cr` | S-C17 `🏦 דירוג אשראי` | S-C18 `הדירוג שלך {score}. הלוואה כפויה מורידה אותו, ואז כל הלוואה עולה יותר.` | `הבנתי` |
| C-cpi | hint | `cpi` revealed | `.lc.cpi` | S-C19 `🛒 אינפלציה` | S-C20 `המחירים עולים השנה ב־{infl}%. מזומן שלא עובד שווה פחות כל שנה.` | `הבנתי` |
| C-zr | hint (P1) | `zr` revealed | `#hEnergy` | S-C21 `⚡ זריקות` | S-C22 `עד עכשיו ההטלות היו במתנה. מעכשיו כל הטלה עולה ⚡ זריקה אחת, ויש לך {n}. רוצה בלי הגבלה? בלובי יש תרגול חופשי.` | `הבנתי` |
| C-focus | hint (T2) | `focus` revealed | T2 focus row | S-C23 `מוקד החודש` | S-C24 `על מה תשים לב החודש, חוץ מהעבודה? כל מוקד עולה קצת 🔋 כוח.` | `הבנתי` |
| C-impact | hint (T2) | `impact` revealed | T2 impact panel | S-C25 `מה הבחירה עושה` | S-C26 `לכל אפשרות: מה קורה לקופה, לתזרים ולסיכון — לפני שבוחרים.` | `הבנתי` |
| W-* | hint | first visit to w2/w3/w4 (existing `WORLD_COACH`, `game.js:293`) | unchanged | unchanged | unchanged | unchanged |

Bubble chrome: small label S-C0 `הדרכה {i}/2` for core, `טיפ` for hints. Escape = `הבנתי`.

### 4.5 Tour and legend (reopen content, P0)
- **Tour** (S-H3): 5 coach marks in a row, label `סיור {i}/5`, each with `הבנתי` and `סיום`: cash+cf (S-C10 text), goal (S-C6), the life row (`.hlife`, text S-T1 `החיים שלך: גיל, 🔋 כוח, אושר, אשראי ועוד. לחיצה על כל סימן מסבירה אותו.`), roll (S-C2), sheet (S-C10). Temporarily reveals hidden keys while it runs; restores after.
- **Legend** (S-H4): `ui.modal` titled S-T2 `מה כל סימן אומר`, a table: icon · name · your current value · one line (from `ui.lifeDetails()` texts). Rows: 💰 מזומן, 💧 תזרים חודשי, 📊 מד החופש, 🎂 גיל, 🔋 כוח, 😊 אושר, 🏦 דירוג אשראי, 🛒 אינפלציה, 🛟 קרן חירום, 📅 התוכנית, ⚡ זריקות (hidden in learning mode), 🎯 המטרה/החלום.

### 4.6 Lifetime of the tutorial (P0)
- `startFree` computes `tutorial = worldId === 'w1' && !opts.duel && !opts.seed && (!P.getProgress().tutorialDone || P.consumeTutorialReplay())`.
- `P.setTutorialDone()` is **no longer called on launch** (`lobby.js:260`). It is called on bus `onboard:done` (`{reason:'done'|'skip'}`, emitted by `onboard.js` when the intro card closes with `go` or `skip`) and, as today, by `recordGame`.
- Quit during the intro → the save has the intro pending → "continue" reopens it. A *new* w1 game while `tutorialDone` is false → tutorial again.
- **Existing players** (first load of this version with `progress.gamesPlayed > 0` or `learnGames > 0`): `rr2-reveal = {v:1, all:true, coached:[all hint ids]}` is written once. They see no tutorial, no gradual reveal and no hints.

### 4.7 Overlay queue (P0, UX§4 fix 2)
One queue in `ui.js` for everything that floats above the board. Priority: coach (1) > event card (2, modal) > achievement (3) > dream mission (4) > lesson (5) > verdict (6) > info toast (7) > practice chip (8).
- At most **one floating overlay** at a time (coach bubble, achievement card, toast, verdict pill). An event card may coexist only with an in-card coach.
- While a coach is open, everything else waits; released one by one, each shown ≥ 1.3 s × speed.
- On phones (≤ 600 px) a verdict waits while a toast is visible.
- Queue cap 6; info toasts beyond it are dropped oldest-first; achievements and lessons are never dropped (they are also in the profile/library).
- The desktop coach ring is re-placed after the card's `animationend` and after `scrollIntoView` settles (fixes the 40 px offset, UX§3.1).

---

## 5. Character select (world view), mobile first (P0)

### 5.1 Layout (360–430 px; cards stack, 1 column; ≥ 820 px: 2–3 columns)
```
┌──────────────────────────────────────────┐
│ (●)  מורה                         ●○○ קל │  avatar 48 px on a tinted circle · name · difficulty dots + word
│      בת 26 · רווקה                        │  identity line (computed, §5.3)
│ משכורת צנועה, הוצאות צנועות. הדרך הכי    │  story = existing c.desc (≤ 2 lines)
│ קצרה לחופש.                               │
│ 💪 הוצאות קבועות נמוכות — היעד קרוב       │  strength
│ ⚠️ רק ₪5,000 במזומן — מתחילים בקטן        │  weakness
│ בסוף כל חודש נשאר     +₪1,705            │  big number, from metrics(createGame()).cashflow
│ 🎯 לצאת תוך 52 חודשים                     │  the ★ condition only
│ [ עוד פרטים ▾ ]              [ לשחק ← ]  │  two sibling buttons, each ≥ 44 px
└──────────────────────────────────────────┘
```
- The card is an `<article>` (not a `<button>`: today's `.wv-char` is a button wrapping everything, so a disclosure can't be nested). `לשחק ←` keeps `data-act="char" data-w data-c`. `עוד פרטים` is `aria-expanded`/`aria-controls`.
- **Details** (expanded in place): `נטו בחודש {net}` · expense lines (top 5 from `c.expenses`) · `מזומן בהתחלה {cash}` · existing assets/holdings/impact (existing `extras`) · the star block S-K1 `★ עד {t1} חודשים · ★★ עד {t2} · ★★★ עד {t3}, וגם 😊 60 ו־🛟 קרן של 3 חודשים`.
- Negative cash flow (founder): label S-K2 `בסוף כל חודש חסר` in `--t4-neg` + S-K3 ` (חיה מהמזומן)` / ` (חי מהמזומן)` by gender.
- Above the cards: the mode radio group (§2 F5), then the dream row (§6.3), then the cards. On a phone the first card's `לשחק` is visible without scrolling when the dream row is collapsed (it collapses to one line after a dream is chosen).
- Removed from the card face: the 5 star conditions and the `wv-happy`/`wv-fund` chips (UX§1 "fewer star conditions").
- Stars earned in this world use ★ (earned, filled) vs ☆ (unearned, outline) — shape, not colour (UX§4 fix 8).

### 5.2 Data (`js/data/characters-meta.js`, lobby lane)
`export const CHAR_META = { 'w1:teacher': {strength, weakness}, … }`. Missing key → the rows are omitted (no crash).

| key | 💪 strength | ⚠️ weakness |
|---|---|---|
| w1:teacher | `הוצאות קבועות נמוכות — היעד קרוב` | `רק ₪5,000 במזומן — מתחילים בקטן` |
| w1:driver | `הכי הרבה זמן בשכונה: 64 חודשים` | `חוב אשראי חודשי ומעט מזומן — כל הפתעה כואבת` |
| w1:dev | `₪30,000 במזומן — אפשר לקנות נכס כבר בהתחלה` | `הוצאות של ₪19,000 בחודש — הקו רחוק` |
| w1:doctor | `המשכורת הכי גבוהה בשכונה` | `גם ההוצאות הכי גבוהות: משכורת גבוהה זה לא חופש` |
| w2:lawyer | `₪90,000 במזומן ותזרים של +₪7,500` | `סגנון חיים של ₪34,500 בחודש — יש מה לקצץ, אם תעזי` |
| w2:chef | `כבר יש עסק שמכניס ₪2,700 בחודש` | `ההלוואה על הביסטרו בריבית משתנה: ריבית עולה, תזרים יורד` |
| w2:pm | `2,500 מניות של החברה — הון שמחכה להחלטה` | `רק ₪30,000 במזומן, ומשפחה עם 2 ילדים` |
| w3:importer | `עסק יבוא שמכניס ₪14,000 בחודש` | `דולר חזק = רווח חלש: העסק רגיש לשער` |
| w3:exporter | `מטע שמוכר לאירופה ומכניס ₪11,000 בחודש` | `דולר חלש = שנה קשה` |
| w3:captain | `₪760,000 במזומן ותזרים של +₪10,400` | `המשכורת בדולרים, ואין עדיין שום הכנסה פסיבית` |
| w4:founder | `₪3.2 מיליון במזומן — הכי הרבה הון בעמק` | `תזרים שלילי: כל חודש יוצאים ₪13,000 מהקופה` |
| w4:engineer | `תזרים של +₪23,000 בחודש` | `קו הסיום הכי קצר: 60 חודשים` |
| w4:social | `20 נקודות השפעה כבר בהתחלה, ו־84 חודשים` | `הכי מעט כסף בעמק: ₪1.3 מיליון` |
| h:h1 (P2) | `₪120,000 חיסכון ראשון` | `משכורת ממוצעת — אין הרבה מקום לטעויות` |
| h:h2 (P2) | `שתי משכורות ו־₪250,000 בצד` | `ילד בגן והוצאות קבועות גבוהות` |

All numbers were checked against `characterCard()` and `metrics(createGame())` on 2026-11-21. A unit test re-checks every ₪ figure that appears in a strength/weakness against the engine (§16 T-M4), so a balance change can't leave a stale number.

### 5.3 Identity line (computed, no slash forms)
`(gender==='f' ? 'בת ' : 'בן ') + age + ' · ' + partner + kids`, partner: none → `רווק`/`רווקה`, together → `בזוגיות`, married → `נשוי`/`נשואה`; kids: 1 → ` + ילד`, n > 1 → ` + {n} ילדים`. Example: `בן 31 · נשוי + ילד`.

### 5.4 Monthly surplus
Computed in the lobby as `E.metrics(E.createGame({worldId, charId, seed: 1})).cashflow` (pure, no engine change; cached per character). It equals the first number the player sees in the HUD (`+₪1,705`, not `+₪1,700`). The label is S-K4 `בסוף כל חודש נשאר`.

---

## 6. Dream goals (P0 engine data + display; P1 meta badges)

### 6.1 The four dreams

| id | icon | name | one line (S-D…) | missions (in order) |
|---|---|---|---|---|
| `biz` | 🚀 | `עסק משלי` | S-D1 `לבנות משהו שעובד גם בלעדיך` | **biz_seed** `הון התחלתי: חודשיים של הוצאות בצד` (cash + savings ≥ 2E) → **biz_own** `עסק ראשון` (any asset with `a.biz`, or `k` in {`biz`,`side`,`mall` when it is the player's business}, or `life.side.months ≥ 1`) → **biz_quarter** `העסק מכסה רבע מההוצאות` (sum of business cash flow ≥ 0.25E) |
| `family` | 👨‍👩‍👧 | `זמן למשפחה` | S-D2 `פחות שעות בשביל כסף, יותר בשביל אנשים` | **fam_rest** `חודש של מנוחה ומשפחה בלי לרדת למינוס` (a payday on plan `rest` with cash flow ≥ 0 after it) → **fam_power** `🔋 כוח מעל 50 שישה ימי משכורת ברצף` → **fam_half** `ההכנסה הפסיבית מכסה חצי מההוצאות` (passive ≥ 0.5E) |
| `stable` | 🛟 | `יציבות` | S-D3 `שקט: כרית בצד ובלי חובות מפתיעים` | **st_fund1** `חודש הוצאות בקרן החירום` (savings ≥ E) → **st_fund3** `שלושה חודשים בקרן` (savings ≥ 3E; the same bar as ★★★) → **st_clean** `12 חודשים בלי הלוואה כפויה ובלי חוב אשראי` |
| `free` | 🗽 | `חופש כלכלי` | S-D4 `נכסים שמשלמים את כל ההוצאות` | **fr_first** `נכס ראשון שמכניס כסף` (an asset with cf > 0) → **fr_quarter** `הכנסה פסיבית = רבע מההוצאות` → **fr_half** `הכנסה פסיבית = חצי מההוצאות` |

`E` = `expensesOf(st)` at evaluation time. Missions are ordered but evaluated independently (a later one can complete first; the display still lists them in order). Missions are checked at the end of every payday and after every `choose()` that adds or sells an asset (E-7).

### 6.2 What a dream does and does not do
- **Does:** shows a dream chip in the HUD, a mission list on tap, a mentor line and a gold toast when a mission completes, a line on the end screen, and (P1) a lifetime badge in the profile.
- **Does not:** change money, 🔋, 😊, stars, win conditions, RNG, the verdict, `optionU`, or anything sent to the server. Not available in ranked or history modes (`createGame` ignores `dream` unless `mode === 'free'`).

### 6.3 Picking a dream (lobby)
- Character screen row (`role="radiogroup"`, aria-label S-D5 `החלום שלי`): title S-D6 `מה בשבילך לצאת מהמירוץ?`, sub S-D7 `זה לא משנה את הכוכבים — רק את המשימות שתראה בדרך.` Four radio cards (icon, name, S-D1…4) + S-D8 `בלי חלום כרגע`. Collapsed to one line S-D9 `החלום שלי: {icon} {name} · שינוי` after a choice.
- First game end screen (and any end screen while no dream is set, free/learn only): a card S-D10 `לפני המשחק הבא: מה החלום שלך?` with the same four options; choosing saves it and shows S-D11 `נשמר. במשחק הבא תראה את המשימות של {name}.`
- Profile: section S-D12 `🎯 החלומות שלי` (P1): the current dream (changeable) and the badges earned per dream (`{icon} {mission title} ✓`).
- Stored in `rr2-progress.dream` (local only, never synced). Passed as `cfg.dream` by `startFree` only.

### 6.4 Display in game
- `#hDream` chip injected after `#hGoal` (same row on phone; replaces `#hNext` once the tutorial goal chain is done): `{icon} {done}/3`, aria-label S-D13 `החלום: {name}, {done} מתוך 3 משימות`. 44 px tap target.
- Tap → `ui.modal` tag S-D14 `החלום שלך`, title `{icon} {name}`, list of missions with a progress bar (`role="progressbar"` with `aria-valuenow`) and `✓` + month for done ones; footer note S-D15 `החלום לא משנה את הכוכבים ואת הניצחון. הוא מראה לך את הדרך שלך.`
- Mission done → overlay queue item (priority 4): toast S-D16 `{icon} משימה הושלמה: {title}` (gold) + mentor S-D17 `{title} — צעד אמיתי לכיוון {name}.`
- End screen line (free/learn): S-D18 `{icon} החלום שלך, {name}: {done} מתוך 3 משימות` + the done titles.

### 6.5 Mentor level onboarding (contract with T2, feature-detected)
If the engine exports `MENTOR_LEVELS` (T2):
- The tutorial game is always `cfg.mentor = 'guide'`.
- After the first completed game, the end screen shows S-G1 `רוצה פחות עזרה? במשחק הבא אבא עשיר רק ירמוז.` with a switch → `rr2-progress.mentorPref = 'hint'`.
- Character screen row S-G2 `רמת עזרה:` with radios S-G3 `מדריך` · S-G4 `רמזים` (locked until 1 completed game) · S-G5 `מקצוען` (locked until the first ★★ in any world; locked label S-G6 `🔒 אחרי ★★`).
- T2 owns what the levels do; T4 owns when they are offered. Ranked uses T2's fixed per-mode level and ignores `mentorPref`.

---

## 7. Free learning mode (P0)

### 7.1 Rules
| Aspect | Learning mode (`cfg.learn = true`, `mode:'free'`) |
|---|---|
| Worlds | unlocked worlds w1–w4 only (unlock rules unchanged). Not history. |
| Roll cost | 0 (`rollCost(st)` returns 0 when `st.learn`). The ⚡ chip and `#rollEn` stay hidden (`usesEnergy()` already reads `rollCost`). |
| Save slot | `rr2-save-learn-<w>` (IR-T4-1). A learning save is never resumed as a normal game: `continueFree` uses `sv.cfg`, which carries `learn`. |
| Stars, best months, world unlock, titles, pawns | not recorded |
| Achievements | not recorded and no ⚡ (lobby ignores bus `achievement` while the active cfg is learning; `recordLearnGame` never calls `addAchievements`; `worldsPlayed` is not updated, so the meta achievement "played all worlds" can't be farmed) |
| ⚡ bonuses | none: quiz (+1), daily, streak, achievements, gifts are untouched; `onQuizReward` and `creditQuizAtEnd` return early |
| Leaderboards, group feed, duels | none (`logMilestones` returns early; the "לאתגר חבר" / same-board duel buttons are hidden) |
| Bail-out | always available (`bailout:true`), and a learning bankruptcy never sets `P.hadBankruptcy` |
| Library lessons | **unlocked** (learning is the point; lessons grant nothing spendable) |
| Practice questions | yes (§10) |
| Learning insights (`P.recordLearning`) | recorded, tagged `learn` in the signature (so the profile's "מה למדתי" includes practice) |
| Dream missions | shown in game; **not** recorded as profile badges |
| Mentor level | any unlocked level |
| Counters | `P.learnGames += 1`; `gamesPlayed`, `wins` unchanged (they are synced to the server) |
| Tutorial | allowed (a brand-new player picking learning first still gets the intro) |

### 7.2 Why no other mode is needed
Learning mode differs from free play in exactly the rewards and the limit, which no existing mode covers. History mode keeps costing ⚡ (unchanged); a learning variant of it is out of scope (P2 idea, not specified).

### 7.3 Detecting learning mode in the lobby
`onGameEnd(e)`: `learn = e.learn === true || (e.summary && e.summary.config && e.summary.config.learn === true) || (activeConfig && activeConfig.learn === true)`. (`summaryForServer` already embeds `replayConfig(st)`, `engine.js:1046`; E-9 adds `learn` to it.)

### 7.4 End screen in learning mode
- Title: won S-L1 `יצאת מהמירוץ — בתרגול 🎓` · lost S-L2 `נשארת במירוץ — בתרגול 🎓`.
- Instead of the stars row: S-L3 `במשחק רגיל התוצאה הזאת הייתה שווה {stars}.` (`{stars}` = ★/★★/★★★ string from `e.stars`) or S-L4 `במשחק רגיל זה עוד לא היה כוכב.`
- Note S-L5 `במצב תרגול לא נאספים כוכבים, הישגים ו־⚡. השיעורים נכנסים לספרייה.`
- Everything about learning (decision quality, luck, principles, lessons, practice results) is shown as in a normal game.
- CTAs: primary S-L6 `לנסות במשחק רגיל ⭐` (same world and character, new normal game) · S-L7 `עוד תרגול 🎓`.

---

## 8. ⚡ / 🔋 naming map (P0)

Rule: **⚡ זריקות** = the real-world limit on dice rolls (outside the story). **🔋 כוח** = the character's strength inside the story. The word "אנרגיה" disappears from the UI (except the w4 pitch sector "אנרגיה", which means the energy industry). Daily sprint uses ⏱️, never ⚡.

`js/energy.js` exports `NAME = 'זריקות'`, `ONE = 'זריקה'`, `ICON = '⚡'` and `label(n)` → `'זריקה אחת'` / `'{n} זריקות'`. Lobby code uses them instead of literals.

| # | Where (lane) | Today | New |
|---|---|---|---|
| N1 | lobby chip aria (`lobby.js:472`) | `אנרגיה {e} מתוך {MAX}` | `זריקות: {e} מתוך {MAX}` |
| N2 | lobby energy toast (`:1639`) | `⚡ מלא: {n} הטלות. כל הטלה עולה ⚡ אחד.` / `⚡ {e}/{MAX} · עוד ⚡ בעוד {t}` | `⚡ {e}/{MAX} זריקות. כל הטלת קוביות עולה זריקה אחת.` + (if not full) ` עוד זריקה בעוד {t}.` |
| N3 | lobby empty card (`:492-494`) | `נגמרה האנרגיה ⚡` · `עוד {t} תקבל ⚡ חדש` · `(לא עולה ⚡)` · `🎁 לשלוח ⚡ לחברים` | `נגמרו הזריקות ⚡` · `בעוד {t} תקבל זריקה חדשה. בינתיים:` · `(בלי זריקות)` · `🎁 לשלוח זריקות לחברים` · new first button S-M8 |
| N4 | gifts toasts (`:506`) | `{nick} הצטרף בזכותך: +{n}⚡` · `{nick} שלח לך {n}⚡` · `קיבלת {n}⚡` | `{nick} הצטרף בזכותך: +{label(n)} ⚡` · `{nick} שלח לך {label(n)} ⚡` · `קיבלת {label(n)} ⚡` |
| N5 | quiz toast (`:526`) | `📚 תשובה נכונה: +1⚡` | `📚 תשובה נכונה: +זריקה אחת ⚡` |
| N6 | welcome (`:552`) | ⚡ bullet | removed (C-zr explains it in context) |
| N7 | daily sprint (`:743`, `:746`) | `⚡ ספרינט {n} חודשים` | `⏱️ ספרינט {n} חודשים` |
| N8 | group send (`:932-933`) | `שלח ⚡` · title `לשלוח 3⚡ (פעם ביום)` · `שלחת לו ⚡ היום` | `שלח ⚡ 3` · `לשלוח 3 זריקות (פעם ביום)` · `שלחת לו זריקות היום` |
| N9 | group feed (`:949`) | `{who} שלח ⚡` | `{who} שלח זריקות ⚡` |
| N10 | toast after send (`:1651`) | `⚡ שלחת 3⚡ ל{n}` | `⚡ שלחת 3 זריקות ל{n}` |
| N11 | end screen (`:1434-1435`) | `בונוס אנרגיה` `+{n}⚡` · `הבנה שווה אנרגיה` | `בונוס זריקות` `+{label(n)} ⚡` · `הבנה שווה זריקות` |
| N12 | library category (`:560`) and principle (`:1293`) | `⏳ זמן ואנרגיה` | `⏳ זמן וכוח` |
| N13 | `net.js:25` (lobby lane) | `כבר שלחת לו ⚡ היום` | `כבר שלחת לו זריקות היום` |
| N14 | `ui.js:267` life chip 🔋 | `…(זה לא ⚡ — ⚡ היא אנרגיה להטלות)…` | `🔋 כוח: {n} מתוך 100. זה הכוח של הדמות בסיפור — לא ⚡ זריקות. שעות נוספות, לימודים ועסק צדדי שוחקים; מנוחה ומשפחה ממלאות. מתחת ל־25 — סכנת שחיקה: חודש בלי משכורת.` |
| N15 | `ui.js:1031-1037` roll chip | title `⚡ {v}/{max} — כל הטלה עולה ⚡ אחת` | title `⚡ {v}/{max} זריקות — כל הטלה עולה זריקה אחת`; `#hEnergy` aria-label set at runtime to `זריקות: {v} מתוך {max}` (replaces the static `אנרגיה להטלות` in `index.html:33` without editing it) |
| N16 | `game.js:408` (shell, IR-T4-7) | tag `⚡ אנרגיה` · `כל הטלה במשחק חופשי עולה ⚡ אחת, והאנרגיה מתמלאת…` | tag `⚡ זריקות` · `כל הטלה במשחק רגיל עולה זריקה אחת ⚡, והזריקות מתמלאות לבד עם הזמן. אתגרים מדורגים (יומי, שבועי, קבוצות) ותרגול חופשי לא עולים זריקות. בונוסים: האתגר היומי, חברים שמצטרפים, ורצף ימים.` |
| N17 | `game.js:416-420,435` (shell, IR-T4-7) | `נגמרה האנרגיה ⚡` · `עד ⚡ הבאה` · `כל הטלה עולה ⚡ אחת. האנרגיה מתמלאת לבד…` · `⚡ לשלוח אנרגיה לחברים` · `⚡ מוכן!` | `נגמרו הזריקות ⚡` · `עד הזריקה הבאה` · `כל הטלה עולה זריקה אחת ⚡. הזריקות מתמלאות לבד — עד {max}, אחת כל כמה דקות. המשחק שלך שמור ומחכה.` · `🎁 לשלוח זריקות לחברים` · `⚡ יש זריקה!` + new first button S-M8 |
| N18 | `business.js:688` (engine lane) | `−{n} אנרגיה בחודש` | `−{n} 🔋 כוח בחודש` |
| N19 | in-game double (`engine.js:694`, `common.js` `doubleEnergy`) | `דאבל! +8 🔋 כוח` | unchanged (already correct) |

---

## 9. Library changes (P0 unless marked)

### 9.1 Categories in Hebrew
`CAT_HE` moves to `js/data/lessons-meta.js` as `CATS` and gains `business: '🏪 עסקים'`; `time` becomes `⏳ זמן וכוח`. A category without a Hebrew name falls back to `📚 שיעורים`, **never** to the raw key (`lobby.js:568` today shows "business").

### 9.2 Every lesson reachable (engine, E-8)
- `time_in_market`: unlocked when the player held index-fund units through a month of −8% or worse (`L.lastCrash` set in `monthlyIndex`) and, 3 paydays later, still holds at least the same quantity with no index sale in between.
- `benchmark`: unlocked at the end of every history-mode game (won or lost); `checkEnd` adds it to `st.lessons` and to `res.lessons` (the lobby already unlocks `e.end.lessons`, `lobby.js:1190`).
- After this the library can reach 75/75. `life.js:9` comment "58 lessons" → "59 lessons" (engine lane); `docs/EDUCATION_REVIEW.md:5` likewise (docs, any lane).

### 9.3 Locked lessons: curious title + how to unlock
Locked card: `🔒` + **teaser** (bold) + `🔓 {hint}`; aria-label S-B1 `שיעור נעול: {teaser}. איך פותחים: {hint}`. The real title stays hidden. In `js/data/lessons-meta.js` as `LESSON_META[id] = {teaser, hint, example?, sim?}`. A test requires `teaser` and `hint` for every `LESSONS` id (§16 T-M2). Hints describe the real trigger (verified against `engine.js` lines in CT§1.2 and the trigger list above); the engine lane re-checks the `biz_*` hints against `business.js` `teach()` while implementing E-8 and reports any mismatch.

| id | teaser | hint |
|---|---|---|
| gross_net | למה המשכורת קטנה ממה שסוכם? | ביום המשכורת הראשון. |
| bituah_leumi | מי עוד לוקח חלק מהתלוש? | ביום המשכורת השני. |
| pension_match | הכסף שהמעסיק מוסיף בשקט | ביום המשכורת השלישי. |
| tax_brackets | למה השקל הבא ממוסה אחרת? | ביום המשכורת החמישי. |
| credit_points | נקודות ששוות כסף אמיתי | כשנולד ילד, או כשמסיימים לימודים. |
| asset_liability | מה באמת מכניס כסף לכיס? | קונים נכס ראשון. |
| cashflow | המספר שקובע הכל | כשנכס מכניס כסף ביום המשכורת. |
| passive_income | כסף שעובד כשאתה ישן | ההכנסה הפסיבית מגיעה לחצי מההוצאות. |
| emergency_fund | הכרית שמצילה בחורף | מפקידים לקרן החירום, או כשמשבר פוגע. |
| opportunity_cost | המחיר שלא כתוב בקבלה | מוותרים על 3 פיתויים. |
| credit_card_debt | החוב שגדל כשלא מסתכלים | משלמים על פיתוי באשראי מתגלגל. |
| good_debt | מתי חוב עובד בשבילך? | קונים נכס עם הלוואה, והתזרים עדיין חיובי. |
| forced_loan | כשהבנק מחליט במקומך | המזומן נגמר ואין קרן חירום. |
| leverage | הכוח (והסכנה) של כסף של הבנק | קונים נכס שרובו במימון. |
| credit_score | המספר שהבנק שופט אותך לפיו | הדירוג יורד מתחת ל־650. |
| credit_excellent | מה מקבלים על דירוג מצוין? | הדירוג עולה מעל 760. |
| compound_interest | הכדור שמתגלגל לבד | אחרי שנה, כשהפנסיה צוברת שנה של משכורות. |
| index_fund | איך קונים את כל השוק? | קונים יחידות בקרן מדד. |
| diversification | למה לא שמים הכל בסל אחד? | מחזיקים 3 סוגי נכסים שונים. |
| dollar_cost | השקעה על טייס אוטומטי | מפעילים הוראת קבע לקרן המדד. |
| drawdown | הירידה שכל משקיע פוגש | המדד יורד 20% מהשיא. |
| panic_selling | הטעות הכי יקרה בשוק | מוכרים קרן מדד בהפסד. |
| buy_the_dip | לקנות כשכולם מפחדים | קונים קרן מדד עד 3 חודשים אחרי ירידה חדה. |
| time_in_market | למה לא כדאי לתזמן? | מחזיקים בקרן מדד לאורך ירידה חדה, בלי למכור. |
| inflation | למה אותו שקל קונה פחות? | בסוף השנה הראשונה (חודש 13). |
| wage_lag | למה המשכורת תמיד באיחור? | בסוף השנה הראשונה (חודש 13). |
| real_vs_nominal | עלה במספרים, ירד באמת | בסוף שנה עם אינפלציה. |
| capital_gains | המס שמחכה ביום המכירה | מוכרים השקעה ברווח. |
| loss_offset | מתי הפסד חוסך כסף? | מוכרים ברווח אחרי שכבר מכרת בהפסד. |
| rental_tax | כמה מהשכירות באמת שלך? | קונים דירה שמכניסה שכירות. |
| betterment_tax | המס על דירה שעלתה בערך | מוכרים נכס נדל"ן ברווח. |
| tax_refund | כסף שהמדינה חייבת לך | במשבצת המס, כשמגיע לך החזר. |
| side_tax | העסק הצדדי והמס | עסק צדדי, ואז משבצת המס. |
| negotiation | כמה שווה לבקש פחות? | מציעים מחיר נמוך יותר בעסקה, והמוכר מסכים. |
| negotiation_fail | מה קורה כשהמוכר אומר לא? | מציעים מחיר נמוך יותר, והמוכר מסרב. |
| ask_raise | מה קורה כשמבקשים? | מבקשים העלאה ביום המשכורת. |
| human_capital | ההשקעה שאף אחד לא יכול לקחת | מסיימים לימודים בתוכנית "לימודים". |
| time_scarce | המשאב שאי אפשר לקנות | חודש בתוכנית "שעות נוספות". |
| marginal_overtime | כמה נשאר מכל שעה נוספת? | חודשיים בתוכנית "שעות נוספות". |
| burnout | כשהגוף עוצר בשבילך | שחיקה: הכוח (🔋) נגמר. |
| rest_value | מה מרוויחים מחודש רגוע? | חודש בתוכנית "מנוחה ומשפחה". |
| side_hustle | ערב בשבוע שהופך לעסק | חודש בתוכנית "עסק צדדי". |
| hedonic | למה השמחה מצעצוע נגמרת? | קונים פיתוי. |
| lifestyle_creep | המנוי הקטן שגדל | בוחרים מנוי חודשי בכרטיס פיתוי. |
| wedding | כמה עולה יום אחד? | אירוע "חתונה" במשבצת החיים. |
| kids_cost | הוצאה ששווה כל שקל | אירוע "תינוק" במשבצת החיים, ובוחרים כן. |
| guarantor | חתימה אחת שעולה הרבה | חבר מבקש עזרה, ובוחרים ערבות. |
| friend_loan | לעזור לחבר בלי לאבד אותו | חבר מבקש עזרה, ומלווים לו. |
| car_cost | כמה באמת עולה רכב? | אירוע "הרכב" במשבצת החיים. |
| reserve_duty | מילואים והכסף | אירוע "צו מילואים" במשבצת החיים. |
| job_offer | יותר כסף, יותר שעות? | הצעת עבודה במשבצת החיים, ולוקחים אותה. |
| severance | הכסף שמחכה בצד | אירוע "פיטורים" במשבצת החיים. |
| unemployment | מה קורה כשהעבודה נגמרת? | אירוע "פיטורים" במשבצת החיים. |
| rate_risk | כשהריבית זזה מתחתיך | קונים נכס בריבית משתנה (בעיר הגדולה). |
| fx_risk | כשהדולר מחליט בשבילך | קונים נכס שרגיש לדולר (בנמל). |
| power_law | למה מעטים עושים את כל הכסף? | סטארט־אפ שהשקעת בו מגיע לסוף (בעמק העתיד). |
| giving | הנתינה שצומחת | תורמים במשבצת הנתינה (בעמק העתיד). |
| bubble | כשכולם בטוחים שזה רק עולה | במשבצת ההפתעה בעמק העתיד. |
| benchmark | ניצחת את המדד? | מסיימים תרחיש במכונת הזמן. |
| biz_revenue_profit | למה מחזור גדול לא אומר רווח? | מנהלים עסק במשבצת העסקים. |
| biz_gross_net | שני סוגים של רווח | מנהלים עסק כמה חודשים. |
| biz_vat | הכסף שעובר דרכך ולא שלך | מנהלים עסק במשבצת העסקים. |
| biz_receivables | הכסף שעוד לא הגיע | עסק שבו לקוחות משלמים בחודש הבא. |
| biz_breakeven | מתי העסק מפסיק להפסיד? | עסק שעוד לא הגיע לנקודת האיזון. |
| biz_marketing | למה עוד פרסום לא תמיד עוזר? | מגדילים פרסום בעסק שוב ושוב. |
| biz_inventory | מלאי הוא כסף שישן במחסן | קונים מלאי בעסק יבוא. |
| biz_spoilage | סחורה שהולכת לפח | עסק עם סחורה טרייה שלא נמכרה. |
| biz_owner_job | עסק או משרה נוספת? | פותחים עסק במשבצת העסקים. |
| biz_capacity | כשיש לקוחות ואין ידיים | עסק שמגיע לתקרת הקיבולת. |
| biz_elasticity | מה קורה כשמשנים מחיר? | משנים מחיר בעסק. |
| biz_burn | כמה זמן נשאר בקופה? | מנהלים אפליקציה שעוד לא רווחית. |
| biz_ltv_cac | כמה שווה לקוח אחד? | מנהלים אפליקציה ומשקיעים בשיווק. |
| biz_depreciation | הציוד שמאבד ערך | מנהלים עסק עם מכונות. |
| biz_draw | איך מוציאים כסף מהעסק? | מושכים רווח מעסק שאתה מנהל. |
| biz_valuation | כמה שווה עסק? | מוכרים עסק שאתה מנהל. |

### 9.4 Link a lesson to the event the player lived (engine E-6 + library)
- The engine attaches `ctx` to every unlocked lesson (`{month, worldId, event, num}`, E-6). `bus 'lesson'` already carries `out.lessons`, so `library.js` stores it: `rr2-library` v2 = `{v:2, ids, read, ctx:{[id]: {m, w, ev, num:{label, value}|null, at}}, practiced:{[topic]: {n, right}}}`. v1 (`{ids, read}`) is read as v2 with empty maps. The first context wins (where you first learned it).
- Lesson sheet (lobby `openLesson`, in-game `ui.lessonCard`) shows, in order: title · text (≤ 160 characters; longer texts get S-B2 `עוד ▾`) · S-B3 `🔢 דוגמה: {example}` · S-B4 `📍 למדת את זה בחודש {m} ב{world}{ — "{ev}"}{ · {num.label} {num.value}}` · S-B5 `🎲 פישוט של המשחק: {sim}` when present · practice status S-B6 `💡 תרגלת: {right} מתוך {n} נכונות` (P1).
- In game, the lesson toast (`📚 שיעור חדש בספרייה: {title}`) is unchanged; its `לקרוא` card now shows the S-B4 line with this game's numbers.

### 9.5 Worked numeric examples (`LESSON_META[id].example`)
Required for the lessons that the 12 practice topics touch (test T-M2 checks this list); optional elsewhere. Game-model numbers carry `sim`.

| id | example | sim |
|---|---|---|
| cashflow | `שכירות ₪3,000 − משכנתא ₪2,400 = תזרים +₪600 בחודש.` | |
| asset_liability | `דירה שמכניסה ₪600 בחודש = נכס. רכב שעולה ₪900 בחודש = התחייבות.` | |
| passive_income | `הכנסה פסיבית ₪3,500 מול הוצאות ₪7,000 = חצי דרך לחופש.` | |
| emergency_fund | `הוצאות ₪7,000 בחודש × 3 = כרית של ₪21,000.` | |
| opportunity_cost | `₪4,500 על טלפון = ₪4,500 שלא קנו נכס שמכניס כל חודש.` | |
| lifestyle_creep | `מנוי של ₪90 בחודש = ₪1,080 בשנה.` | |
| hedonic | `צעצוע נותן +6 😊, ואחרי חודשיים נשאר בערך +1.5.` | `במשחק השמחה מצעצוע נחצית כל חודש.` |
| credit_card_debt | `₪4,000 באשראי ב־5% לחודש = ₪200 ריבית בכל חודש, והחוב לא יורד.` | `5% לחודש זו ריבית מוגזמת של המשחק.` |
| forced_loan | `חסרו ₪2,300 → הבנק נתן ₪3,000 בכוח, והדירוג ירד.` | |
| good_debt | `הלוואה עולה ₪300 בחודש, הנכס מכניס ₪700 → +₪400 בחודש.` | |
| leverage | `₪20,000 שלך + ₪180,000 של הבנק = דירה של ₪200,000. עלייה של 10% = +₪20,000: פי 2 מההון שלך.` | |
| credit_score | `דירוג נמוך = ריבית גבוהה יותר על כל הלוואה.` | |
| compound_interest | `₪1,000 × 1.05 × 1.05 = ₪1,102.50 אחרי שנתיים.` | |
| pension_match | `אתה מפריש ₪6, המעסיק מוסיף ₪12.5 (כולל פיצויים).` | |
| dollar_cost | `₪500 כל חודש: כשהמחיר יורד, אותו סכום קונה יותר יחידות.` | |
| index_fund | `יחידה אחת בקרן = חתיכה קטנה מהרבה חברות.` | `במשחק הקרן עולה בערך 4% בשנה בממוצע.` |
| diversification | `3 סוגי נכסים: משבר בנדל"ן פוגע רק בשליש.` | |
| fx_risk | `נכס שמכניס $1,000: בשער 3.5 זה ₪3,500, בשער 3.0 רק ₪3,000.` | |
| inflation | `אינפלציה 4%: סל של ₪1,000 עולה ₪1,040 בשנה הבאה.` | |
| real_vs_nominal | `העלאה 3%, אינפלציה 5% → בפועל בערך −2%.` | |
| gross_net | `ברוטו − מס הכנסה − ביטוח לאומי − פנסיה = נטו.` | |
| tax_brackets | `מדרגה גבוהה חלה רק על השקלים שמעליה, לא על כל המשכורת.` | |
| marginal_overtime | `₪1,000 שעות נוספות במדרגה של 31% → נשארים ₪690.` | `פישוט: בלי ביטוח לאומי ומס בריאות.` |
| capital_gains | `קנית ב־₪10,000, מכרת ב־₪14,000 → מס רק על ₪4,000 הרווח.` | |
| biz_vat | `מחיר ₪118 כולל מע"מ = ₪100 שלך + ₪18 למדינה.` | `שיעור המע"מ במשחק: 18%.` |
| biz_revenue_profit | `מחזור ₪60,000 − עלויות ₪55,000 = רווח ₪5,000.` | |
| biz_gross_net | `מחזור ₪60,000 − סחורה ₪20,000 = גולמי ₪40,000; פחות שכירות ושכר = נקי.` | |
| biz_receivables | `מכרת ב־₪10,000, חצי משלמים בחודש הבא → בקופה רק ₪5,000.` | |
| side_hustle | `עסק צדדי של ₪1,500 בחודש = עוד ₪18,000 בשנה, ופחות 🔋.` | |
| power_law | `10 צ'קים קטנים: 7 נכשלים, 2 מחזירים, 1 עושה פי 20.` | `ההסתברויות של המשחק.` |
| unemployment | `נטו ₪9,000 → בערך ₪5,400 בחודש, לחודשיים.` | `במשחק: 60% מהנטו לחודשיים. במציאות לפי הברוטו, עם תקרה ותנאים.` |
| reserve_duty | — | `גובה המענק במשחק הוא מספר של משחק.` |
| kids_cost | — | `במשחק עלות הילד קבועה לתמיד; במציאות היא משתנה עם הגיל.` |
| biz_valuation | — | `"פי 1.5 עד 4" זה כלל אצבע, לא חוק.` |

### 9.6 Long paragraphs in play
In game, lesson texts over 160 characters are cut with S-B2 `עוד ▾` (`<details>`). The 5 lessons over 150 characters (CT§1.4) are not rewritten by T4.

---

## 10. In-context practice (engine data E-10 · UI P1)

### 10.1 Delivery rules
- **Where:** a chip S-P1 `💡 שאלת רגע` (aria-label S-P2 `שאלת תרגול קצרה, לא חובה`) beside the Roll button, only between turns (roll enabled, no card, no coach, no modal). It hides when the player rolls. 44 px.
- **Tap:** a small sheet (`role="dialog"`, focus trap, Escape = skip): tag S-P3 `💡 שאלת רגע · {topicName}`, the question, 3 answer buttons, footer link S-P4 `דלג`. Below the answers: S-P5 `לא משפיע על הכסף במשחק.`
- **After an answer:** right S-P6 `✓ נכון!` / wrong S-P7 `✗ לא בדיוק.` (icon + word, not colour only) + the one-line explanation + `🎲 מספרים של משחק` when the item has `sim` + button S-P8 `ממשיכים`. The correct answer is marked with `✓`.
- **Dose:** at most 1 offer per 3 turns, at most 6 per game, never before turn 4, never while the intro or a core coach is pending, each question at most once per game. An ignored chip counts as offered.
- **Choice:** deterministic from the lessons unlocked **this game** (most recent first) and the turn; no RNG (E-10). Item `b` (far transfer) of a topic is offered only when item `a` was answered ≥ 8 turns earlier in this game, or in an earlier game (the lobby passes the list, `memo.doneA`).
- **Modes:** free and learning only. Never ranked, never history.
- **Reward:** none spendable (no ⚡: practice must not become a ⚡ faucet). The answer updates `st.dq.transfer[principle]` (engine) and `rr2-library.practiced[topic]` (lobby); the end screen and the profile "מה למדתי" show S-P9 `תרגול: {right} מתוך {n}`.
- **Transfer test:** item `a` is a near transfer (same idea, new people and numbers); item `b` is a far transfer (same principle in a different domain). The profile shows a principle as "transferred" (S-P10 `הצלחת גם בתרחיש חדש ✓`) only after a correct `b`.

### 10.2 The 24 items (`js/practice.js`, engine lane)
`{E}` = `expensesOf(st)` rounded to ₪100; formatted with `fmtM`. ✔ marks the correct answer (index `c`). Every number was hand-checked.

| id | topic · principle | offered after any of these lessons | question | answers | why |
|---|---|---|---|---|---|
| budget_a | תקציב · cashflow | cashflow, gross_net, lifestyle_creep, hedonic | לנועה נטו ₪8,000 והוצאות קבועות ₪6,500. היא נרשמת לחדר כושר ב־₪250 בחודש. כמה נשאר לה בסוף החודש? | ₪1,750 · ✔ ₪1,250 · ₪1,500 | 8,000 − 6,500 − 250 = 1,250. כל מנוי חדש יוצא מהתזרים. |
| budget_b | תקציב · cashflow | same | לרון עסק קטן: נכנסים ₪12,000 בחודש ויוצאים ₪11,400. ספק מעלה מחיר ב־₪200 לחודש. כמה נשאר לו? | ₪800 · ₪600 · ✔ ₪400 | 12,000 − 11,400 − 200 = 400. אותו חשבון, גם בעסק. |
| debt_a | חוב וריבית · debt_cost | credit_card_debt, forced_loan, good_debt, credit_score | חוב של ₪10,000 בריבית 12% בשנה. משלמים ₪100 בחודש. מה קורה לחוב? | יורד לאט · ✔ נשאר בערך אותו דבר · נגמר בעוד 100 חודשים | 12% בשנה הם בערך ₪100 ריבית בחודש. כל התשלום הולך לריבית. |
| debt_b | חוב וריבית · debt_cost | same | בחנות: מקרר ב־₪3,600 עכשיו, או 12 תשלומים של ₪330. כמה עולה האשראי? | ✔ ₪360 · כלום · ₪330 | 12 × 330 = 3,960. 3,960 − 3,600 = 360 — זה המחיר של הכסף. |
| fund_a | קרן חירום · cushion | emergency_fund, forced_loan | ההוצאות החודשיות שלך עכשיו: {E}. כמה צריך בצד לכרית של 3 חודשים? | {E} · ✔ {3E} · {6E} | 3 × ההוצאות החודשיות — לא 3 משכורות. |
| fund_b | קרן חירום · cushion | same | למיכל ₪12,000 בצד והוצאות של ₪6,000 בחודש. היא מאבדת את העבודה, ואין לה שום הכנסה אחרת. כמה זמן הכרית מחזיקה? | חודש · ✔ חודשיים · חצי שנה | 12,000 ÷ 6,000 = 2. הכרית קונה זמן לחפש עבודה בלי לקחת חוב. |
| cfnw_a | תזרים מול שווי · cashflow | asset_liability, passive_income, cashflow | לדנה דירה ששווה ₪2 מיליון ומשכנתא של ₪1.5 מיליון, והדירה מוציאה ממנה ₪500 בחודש. מה נכון? | ✔ שווי נקי חיובי, תזרים שלילי · היא כבר חופשית כלכלית · יש לה הפסד של ₪500 אלף | שווי = מה יש פחות מה חייבים. תזרים = מה נשאר כל חודש. |
| cfnw_b | תזרים מול שווי · cashflow | same | לאבי 3 מכונות כביסה ששוות ₪20,000 ומכניסות ₪900 בחודש נטו. לגיל דירה של ₪1 מיליון בלי משכנתא, ריקה. למי יש יותר הכנסה פסיבית? | ✔ לאבי · לגיל · שווה | שווי גבוה לא משלם חשבונות. תזרים כן. |
| liq_a | נזילות · cushion | emergency_fund, forced_loan, drawdown | מה הכי מהר הופך למזומן, בלי להפסיד? | דירה להשכרה · ✔ חיסכון נזיל בבנק · מניה שירדה 30% | נזיל = זמין מחר, בלי למכור בזול. |
| liq_b | נזילות · cushion | same | ליוסי דירה ששווה ₪400,000 ו־₪2,000 בעו"ש. מחר המוסך מבקש ₪6,000. מה הבעיה שלו? | אין לו מספיק שווי · ✔ אין לו מספיק נזילות · יש לו יותר מדי חיסכון | עשיר על הנייר, בלי מזומן זמין. דירה לא מוכרים בשביל מוסך. |
| div_a | פיזור · diversification | diversification, fx_risk, rate_risk, power_law | לרון 3 דירות באותה עיר, ושום דבר אחר. מה הסיכון הכי גדול? | ✔ מכה אחת לעיר פוגעת בכולן · אין סיכון בנדל"ן · המס | פיזור = לא כל הכסף תלוי בדבר אחד. |
| div_b | פיזור · diversification | same | יבואן מוכר רק דרך אתר אחד, וכל הסחורה מספק אחד. איזה צעד הכי מפזר את הסיכון? | להוריד מחירים · ✔ להוסיף ספק שני · להגדיל הזמנה מאותו ספק | כשספק אחד נופל, השני ממשיך. פיזור עובד גם בעסק. |
| cmp_a | ריבית דריבית · time_in_market | compound_interest, pension_match, dollar_cost, index_fund | ₪1,000 בתשואה של 5% בשנה, בלי למשוך. כמה יהיה אחרי שנתיים? | ₪1,100 · ✔ ₪1,102.50 · ₪1,050 | בשנה השנייה גם ה־₪50 מהשנה הראשונה מרוויחים: 1,050 × 1.05. |
| cmp_b | ריבית דריבית · time_in_market | same | שני חברים חוסכים ₪500 בחודש באותה תשואה. אחד מתחיל בגיל 25, השני בגיל 35. למי יהיה יותר בגיל 65? | שווה — אותו סכום בחודש · ✔ למי שהתחיל ב־25 · למי שהתחיל ב־35 | עשר שנים נוספות של ריבית על ריבית — זה ההבדל הגדול. |
| inf_a | אינפלציה · fees_tax | inflation, wage_lag, real_vs_nominal | אינפלציה 4% בשנה, והחיסכון שלך מקבל 2% בשנה. מה קרה לכוח הקנייה של ₪10,000 אחרי שנה? | עלה · ✔ ירד, בערך 2% · לא השתנה | ריאלי ≈ ריבית פחות אינפלציה: 2% − 4% = בערך −2%. |
| inf_b | אינפלציה · fees_tax | same | קיבלת העלאה של 3%, והמחירים עלו השנה ב־5%. מה קרה למשכורת שלך באמת? | עלתה ב־3% · ✔ ירדה בערך ב־2% · עלתה ב־8% | במספרים עלתה, בקנייה ירדה. זה ההבדל בין נומינלי לריאלי. |
| tax_a | מסים · fees_tax | biz_vat, tax_brackets, gross_net, capital_gains | מחיר בקופה ₪59, כולל מע"מ 18%. כמה מזה מע"מ? | ₪10.62 · ✔ ₪9 · ₪18 | 59 × 18 ÷ 118 = 9. המע"מ כבר בתוך המחיר. (sim: `שיעור המע"מ במשחק: 18%.`) |
| tax_b | מסים · fees_tax | marginal_overtime, tax_brackets, side_tax | הרווחת עוד ₪1,000 ברוטו בשעות נוספות. מדרגת המס השולית שלך 31%. כמה נשאר לך? | ₪1,000 · ✔ ₪690 · ₪310 | המדרגה חלה רק על השקל הנוסף: 1,000 × 0.69 = 690. (sim: `פישוט: בלי ביטוח לאומי ומס בריאות.`) |
| risk_a | סיכון · risk_size | power_law, bubble, panic_selling, negotiation_fail | א׳: ₪100 בטוח. ב׳: 50% לקבל ₪250, 50% לקבל ₪0. מה התוחלת של ב׳? | ₪250 · ✔ ₪125 · ₪100 | 0.5 × 250 + 0.5 × 0 = 125 — הממוצע על הרבה פעמים. |
| risk_b | סיכון · risk_size | same | הימור: 50% לזכות ב־₪25,000, 50% לקבל ₪0, תמורת ₪10,000. יש לך בדיוק ₪10,000 — וזה כסף השכירות. מה נכון? | לקחת, התוחלת ₪12,500 · ✔ לוותר, הפסד אחד יפיל אותך · לקחת חצי בהלוואה | תוחלת גבוהה לא שווה כלום אם הפסד אחד מוציא אותך מהמשחק. |
| opp_a | מחיר הוויתור · opportunity_cost | opportunity_cost, hedonic, lifestyle_creep | ₪4,500 על טלפון חדש, או להשאיר אותם בחיסכון של 2% בשנה. על מה אתה מוותר כשאתה קונה את הטלפון? | ₪90 · ✔ ₪4,500 ועוד הריבית שהיו מרוויחים · כלום, זה הכסף שלך | הוויתור = כל מה שהכסף יכול היה לעשות במקום. |
| opp_b | מחיר הוויתור · time | time_scarce, rest_value, side_hustle, marginal_overtime | שבת אחת: משמרת נוספת תמורת ₪600, או יום עם המשפחה. מה המחיר של יום המשפחה? | ₪0 · ✔ ₪600 שלא תרוויח · ₪600 שתוציא | גם לזמן יש מחיר: מה שוויתרת עליו. לפעמים שווה לשלם אותו. |
| prof_a | רווח מול מחזור · cashflow | biz_revenue_profit, biz_gross_net, biz_owner_job, side_hustle | פלאפלייה: מחזור ₪60,000 בחודש, חומרי גלם ₪20,000, שכירות ושכר ₪35,000. מה הרווח לפני מס? | ₪60,000 · ✔ ₪5,000 · ₪40,000 | 60,000 − 20,000 − 35,000 = 5,000. מחזור זה לא רווח. |
| prof_b | רווח מול מחזור · cashflow | biz_receivables, biz_inventory, biz_revenue_profit | אותה פלאפלייה הרוויחה ₪5,000, אבל חצי מהמחזור (משרדים) ישולם רק בחודש הבא. מה קורה לקופה החודש? | עולה ב־₪5,000 · ✔ יכולה לרדת למינוס, למרות הרווח · לא משתנה | רווח ≠ מזומן. כסף שעוד לא נכנס לא משלם לספקים. |

Topic names (`topicName`): `תקציב`, `חוב וריבית`, `קרן חירום`, `תזרים מול שווי`, `נזילות`, `פיזור`, `ריבית דריבית`, `אינפלציה`, `מסים`, `סיכון`, `מחיר הוויתור`, `רווח מול מחזור`. Principle ids are the existing `PRINCIPLE` keys (`ui.js:900`). If T3 adds a `liquidity` lesson, it joins the trigger list of `liq_*`.

---

## 11. Modes, return reasons, no pressure (analysis + decisions)

| Brief item | Finding | Decision |
|---|---|---|
| Short mode with a clear goal | Exists: the daily sprint, 24 months, "כמה קרוב לחופש תגיע?" (`lobby.js:724-746`). | No new mode. Rename its icon to ⏱️ (N7). |
| Long campaign | Exists: 4 worlds with unlocks, stars, titles. | No new mode. |
| Continue after win | Missing: `checkEnd` ends the game at the goal. | Deferred to T6 (end summary, return to a decision point). T4 adds nothing. |
| No duplicate modes | Learning mode is the only new mode, and only because no mode has "no limit, no rewards". | §7.2 |
| Positive reasons to return | Dream missions + lifetime badges (§6), curious locked lessons with clear hints (§9.3), practice and "transferred" marks (§10), the learning-mode "this would have been ★★" line (§7.4). New scenarios and story progress are T3. | §6, §9, §10 |
| No threatening streak loss | `lobby.js:739` says `אל תשבור את הרצף!` with a `warn` style; the header fire chip turns `warn` when today's daily is not played (`:381`). | Replace with S-S1 `🔥 {n} ימים ברצף. האתגר של היום מחכה לך.`; the `warn` class becomes a neutral style (no red, no shake). No other copy mentions losing a streak. |
| No artificial pressure / forced stops | No decision timers exist (GP§8). The ⚡ limit is a forced stop. | Mitigated: 10 free tutorial rolls (D-9), learning mode always one tap away from the empty-⚡ card (F6). |

---

## 12. Accessibility (P0 for every T4 screen)

| # | Requirement | Applies to |
|---|---|---|
| A11Y-1 | **Focus trap**: Tab/Shift+Tab cycle inside the open dialog; the background is `inert` (`#c`, `#hud`, `#bar`, `#sheet`; plus `#start` content when an in-game dialog is open over it). One helper `trapFocus(root) → release()` in `ui.js`, used by `modal()`, `openEvent()`, the practice sheet, the dream and help modals; `lobby.js` uses the same helper (imported from `ui.js`) for `#lbLesson` and sets `inert` on the in-game DOM while the lobby overlay is open. | `#gm`, `#evm`, `#lbLesson`, practice sheet, lobby overlay (UX§2.5) |
| A11Y-2 | **Escape** (bound on `document`, topmost dialog only): closes dismissable `#gm`, `#lbLesson`, help, legend, dream modal (= "later"), practice sheet (= skip), and collapses an open "עוד פרטים". Coach: Escape = `הבנתי`. Decision cards (intro, events) ignore Escape. | all |
| A11Y-3 | **Initial focus**: welcome → S-W3; world view → the mode radio group's checked radio; intro card → primary; practice sheet → first answer; dream modal → the selected/first option. **Focus returns** to the opener on close. | all |
| A11Y-4 | **Focus order = reading order (RTL)**: world view: back chip → mode group (arrow keys inside) → dream group (arrow keys) → per card: `עוד פרטים` → `לשחק`. Game HUD: help → home → stats → goal → dream/next → life chips → tools → roll → sheet. | world view, HUD |
| A11Y-5 | **Targets ≥ 44 × 44 px** for every new control and for the life chips on phones (`min-height:44px`, the row wraps at ≤ 360 px instead of truncating the plan chip). | all new controls, `.lc` |
| A11Y-6 | **Contrast**: new tokens in `css/game.css :root` (no existing token value changes): `--t4-pos: light-dark(#116a43,#3ccf8a)`, `--t4-neg: light-dark(#a82d26,#ff7a6e)`, `--t4-gold-ink: light-dark(#7a5000,#f2c14e)`, `--t4-mut: light-dark(#5f5870,#aaa3b6)`. Measured ≥ 5.2:1 on `#fffaf0`, `#f6eedd`, `#efe4cd` (light) and ≥ 5.0:1 on `#1f1b27`, `#2a2533`, `#352f40` (dark). T4 text never uses `--green`, `--red` or `--gold2` (they fail on cream, UX§2.6). Non-text (progress bars, ring, star outlines) ≥ 3:1. | all T4 text |
| A11Y-7 | **Not colour only**: difficulty has its word; money has its sign; practice feedback has ✓/✗ + a word; stars ★ vs ☆. | char cards, practice, stars |
| A11Y-8 | **Live region**: `ui.js` injects one visually hidden `#a11yLive` (`aria-live="polite"`). Used for reveals (S-R0), mission done (S-D16), practice result, the practice chip appearing (S-P2, once per game). At most one message per 2 s (queued). | game |
| A11Y-9 | **Reduced motion**: reveal pulse, chip slide-in and card count-ups are instant under `prefers-reduced-motion: reduce`. | all new animation |
| A11Y-10 | **Accessible names**: life chips get `aria-label` (`גיל 31`, `כוח 70 מתוך 100`, `אושר 60 מתוך 100`, `דירוג אשראי 680, טוב`, `אינפלציה 2.2% בשנה`, `קרן חירום: 0 חודשים`, `התוכנית: עבודה רגילה, לשנות`); `#hNext`, `#hDream`, `#hEnergy` per §4/§6/§8. | HUD |
| A11Y-11 | **Text size** ≥ 12 px for every T4 element (body text ≥ 14 px on phones). | all |
| A11Y-12 | **Input hints match the device**: no "רווח" key hint on coarse pointers (S-C2). | coaches |
| A11Y-13 | **No timed dismissal** of anything that is needed to act: intro, coaches, practice, dream and help never auto-close. | all |
| A11Y-14 | **Bidi**: every ₪/%/± value goes through `iso()`/`num()`/`<bdi>`; the `bidiscan` method of UX§0 finds 0 misplaced signs on the T4 screens. | all |

---

## 13. ENGINE part (contracts)

### E-1 `createGame(o)` new inputs (P0)
```js
// o.learn?: boolean   honoured only when (o.mode || 'free') === 'free'; else false
// o.dream?: 'biz'|'family'|'stable'|'free'   honoured only in mode 'free'; else null
// o.tutorial (existing)   now also allowed with learn:true (still mode 'free' only)
st.learn = boolean;
st.dream = null | { id, done: { [missionId]: month }, track: { powerStreak: 0, cleanSince: 1 } };
st.intro = null | { step: 'salary'|'glitch'|'result'|'done'|'skipped',
                    glitch: { cost, inst, fee, diy }, choice: null|'fix:pay'|'fix:inst'|'fix:diy',
                    before: { cash, cf, energy } | null, goal: null|'cushion'|'asset'|'fund'|'done' };
st.practice = { answered: { [qid]: 0|1 } };
st.dq.transfer = { [principle]: { n, right } };
st.lessonCtx = { [lessonId]: { m, ev, num: {label, value}|null } };
```
When `o.tutorial` (w1 only; other worlds ignore it as today): `st.intro.step = 'salary'`, `st.phase = 'event'`, `st.pending = { id: st.nextEventId++, type: 'intro' }`. No RNG draw.

### E-2 `rollCost(st)` (P0 / P1)
`ranked mode → 0; st.learn → 0; (P1) st.tutorial && st.turn < TUTORIAL_FREE_ROLLS (10) → 0; else 1.` Export `TUTORIAL_FREE_ROLLS`.

### E-3 Intro event (P0)
- `DESCRIBE.intro(st, p, ev)` → `ev = { type:'intro', id, tag, title, text, mentor, data:{ step, payslip:{net, expenses, cashflow, cash}, glitch?:{cost, inst, fee, diy}, result?:{cashBefore, cashAfter, cfBefore, cfAfter, energyBefore, energyAfter, instMonths}, goal?:{id, title, text, value, target} }, options:[{id, label, enabled:true, effects:{cash, monthly, months, energy, happy}, primary}] }`. Strings exactly as §4.2 (the engine owns them, like other card text; `{who}` via `gz()`).
- Options per step: `salary` → `next` (primary), `skip`; `glitch` → `fix:pay`, `fix:inst`, `fix:diy` (no primary); `result` → `go` (primary).
- `CHOOSE.intro`: `next` → step `glitch`, return `false` (card stays open); `fix:*` → apply the effect (§4.2 table), store `choice`/`before`, set the goal (`cushion` if `cash + savings < E`, else `asset`), step `result`, return `false`; `go` → step `done`, `phase = 'roll'`, return `true`; `skip` → step `skipped`, `goal = null`, `phase = 'roll'`, return `true`.
- `decisionRecord` returns no record for `type === 'intro'` (no verdict, no `dq` entry, no mastery change). `describe()` must **not** fall back to a SAFE/first primary for `glitch` (life personal-card behaviour).
- The `fix:inst` line: a 3-month expense line labelled `תשלומים: מכונת כביסה`, created and expired with the same mechanism life events use for temporary lines (the engine lane picks it; the sheet must show `(עוד {n} חודשים)` as for other temporary lines).
- Replay: logged as `['c', optionId]` automatically by `choose()`.

### E-4 Tutorial goal chain (P0)
- `metrics(st).nextGoal = null | { id, title, value, target, unit:'₪'|'count', done:false }` while `st.intro.goal` is `cushion`, `asset` or `fund`.
- Chain: `cushion` (`cash + savings ≥ E`; title `חודש הוצאות בצד`) → `asset` (`assets.length ≥ 1`; title `נכס ראשון שמכניס כסף`) → `fund` (`savings ≥ E`; title `🛟 חודש הוצאות בקרן החירום`) → `done`. A character that starts with a cushion starts at `asset`.
- Checked at the end of payday and after `choose()`/`moveSavings()`. On completion: `out.news.push({ kind:'goal', text: 'הושג: {title}. הבא: {nextTitle}' })` (last: `'הושג: {title}. סיימת את ההדרכה! 🎓'`), and the next goal is set. No RNG, no money.

### E-5 Tutorial deal (P0)
- Replaces the fixed `w1.starterDeal` use in `createDeal` (`engine.js:1192-1195`) for `st.tutorial`:
  - eligible iff `!st.flags.tutorialDone && downFor(st) ≥ 1000`, where `downFor(st) = clamp(floor500(cash + savings − E), 0, 5000)`;
  - card `{ k:'biz', n:'עגלת הקפה של השכן', d:'השכן עובר דירה ומוכר את העגלה. בלי הלוואה.', cost: down, down, cf: round10(down × 0.09), tutorialDeal: true, q:'עסקה ראשונה: {down} שמכניסים {cf} כל חודש. כמה חודשים עד שהכסף חוזר אליך?' }`;
  - `tutorialDeal` → no negotiation offers on that card; `dealReality` → `🎲 מספר של משחק: עגלה כזאת במציאות מחזירה את עצמה הרבה יותר לאט.`
- Dice: the existing `turn === 0` remap (`engine.js:677-680`) becomes "the first roll at which the tutorial deal is eligible (and the deal not yet drawn)": the sum is remapped to a deal tile, the two dice draws are still consumed. When eligibility first becomes true after turn 0, `out.mentor` on that payday says `השכן מוכר עגלת קפה — שווה לבדוק בהטלה הבאה.`
- **Guarantee (tested, AC-T6):** for every w1 character × each glitch choice × 20 seeds, when the tutorial deal appears: `primary === 'buy'`, `d.warning` is undefined, `d.cushionAfter ≥ 1`, and `decisionRecord(buy).score ≥ 80`.

### E-6 Lesson context (P0)
`lesson(st, out, id)` also writes `st.lessonCtx[id] = { m: st.month, ev: eventTitleOf(st), num: numFor(id, st) }` and pushes `{ id, title, text, ctx: { month, worldId, event, num } }`. `eventTitleOf(st)`: the pending card's `n`/title if any; on a payday `'יום המשכורת'`; on the yearly roll-over `'סוף שנה'`; else `null`. `numFor` (others `null`):

| id | label | value |
|---|---|---|
| gross_net | `נטו` | base net salary |
| bituah_leumi | `ביטוח לאומי ומס בריאות` | from this payslip |
| tax_brackets | `המדרגה השולית שלך` | `marginalRate` as % |
| cashflow | `התזרים שלך` | `metrics().cashflow` |
| passive_income | `הכנסה פסיבית` | passive |
| emergency_fund | `בקרן החירום` | savings |
| forced_loan | `הלוואה כפויה` | the forced amount |
| credit_card_debt | `חוב באשראי` | `st.credit` |
| good_debt | `תזרים אחרי ההלוואה` | net of that buy |
| leverage | `חוב על הנכס` | asset debt |
| asset_liability | `הנכס מכניס` | asset cf |
| compound_interest | `בפנסיה` | pension |
| inflation | `אינפלציה השנה` | % |
| diversification | `סוגי נכסים` | count |
| opportunity_cost | `ויתרת על פיתויים ב־` | `stats.toysResisted` |
| hedonic | `הוצאת על פיתוי` | amount |
| panic_selling | `ההפסד במכירה` | loss |
| index_fund | `יחידות בקרן` | qty |
| capital_gains | `מס ששילמת` | tax |
| marginal_overtime | `המדרגה השולית שלך` | % |
| burnout | `עלות השחיקה` | cost |
| side_hustle | `הכנסה מהצד` | first side income |
| biz_revenue_profit | `רווח נקי החודש` | net profit |

### E-7 Dreams (P0) — new `js/dreams.js` (pure; imported by `engine.js`)
`export const DREAMS = [{ id, icon, name, line, missions:[{ id, title }] }]` (texts exactly §6.1); `export function dreamTick(st, out)` (called at the end of `payday()` and after `choose()`/`moveSavings()`/`takeLoan()`/`payCredit()`); `metrics(st).dream = null | { id, icon, name, missions:[{ id, title, progress 0..1, done, doneMonth }], done }`; new completions → `out.dream = [{ id, title }]`. `track.powerStreak` counts consecutive paydays with 🔋 ≥ 50 (reset below); `track.cleanSince` = the month of the last forced loan or of the last month with `credit > 0`. Must not read or write anything that affects outcomes.

### E-8 Unreachable lessons (P0)
§9.2. Plus N18 (`business.js:688`) and the `life.js:9` comment.

### E-9 Replay config and summary (P0)
`replayConfig(st)` adds `learn: !!st.learn` and, when set, `dream: st.dream.id`. Ranked configs (verifier `configFor`) don't set them, so verification is unchanged. `summaryForServer` already includes `config` (used by the lobby, §7.3).

### E-10 Practice (P1) — new `js/practice.js` (pure data; selection in `engine.js`)
```js
export const PRACTICE = [{ id, topic, topicName, principle, kind:'a'|'b', after:[lessonIds], q, answers:[3], c, why, sim? }];
export function practiceDue(st, memo) // memo = { lastTurn:int, offered:[qid], doneA:[topic] }
  // → null in ranked/history, while st.intro is not done/skipped, if st.turn < 4,
  //   if st.turn - memo.lastTurn < 3, or if memo.offered.length >= 6.
  // Otherwise: walk st.lessons from the newest; for each topic triggered by that lesson, return its 'a'
  // item if not answered/offered this game, else its 'b' item if 'a' was answered >= 8 turns ago
  // (st.practice.answered + an internal turn record) or topic ∈ memo.doneA. Placeholders filled from st.
  // Returns { id, topic, topicName, q, answers, why, sim } — the correct index is NOT returned.
export function answerPractice(st, qid, idx)
  // → { ok:false } in ranked/history, for an unknown qid, an already answered qid, or phase !== 'roll'.
  // Else act(st, ['Q', qid, idx]); st.practice.answered[qid] = right; dq.transfer[principle].n++/right++;
  // returns { ok:true, right, correct: c, why, sim }.
```
- `replay()` gets `case 'Q': r = answerPractice(st, a[1], a[2]); break;`. `verify_core.js` `CODES` gets `'Q'` for parity with the rule on the TASK_BOARD (the engine rejects it in ranked, so a ranked log containing it fails replay).
- `learningOf()` adds `transfer: { [principle]: { n, right } }` to `end.learning`.
- No RNG, no money/🔋/😊 change, no lesson unlock.

### E-11 Save version (P0)
Rides on the shared `SAVE_VERSION = 4` bump (T2/T3, GP§5; wrapper rules in T1§4). `migrateV3` defaults: `learn:false`, `dream:null`, `intro:null`, `practice:{answered:{}}`, `dq.transfer:{}`, `lessonCtx:{}`. A v3 save with the old tutorial (`st.tutorial` and `flags.tutorialDone` false) keeps working: no intro is created for a migrated save; the new deal sizing applies.

### E-12 Verifier pin (P0)
Any change to `engine.js` or its imports needs the mirror update and the re-pin (`tools/build-edge.mjs`), released together with the site (TASK_BOARD risks). `node tools/build-edge.mjs --check` passes after the re-pin.

### E-13 Sim (P1)
`tools/sim.mjs` gains a `--tutorial` switch: runs w1 games with `tutorial:true` and a tapper that picks `fix:pay`. Report: ★ in-time rate and median months for tutorial vs non-tutorial games. Acceptance: in-time rate within ±3 pp of the non-tutorial tapper (the intro adds no money; the deal is smaller than today's).

---

## 14. LOBBY/UI part

### 14.1 Feature detection (UI must work before and after the engine part)
`ev.type === 'intro'` (else today's coach flow runs); `m.nextGoal`; `m.dream`; `typeof E.practiceDue === 'function'`; `typeof E.TUTORIAL_FREE_ROLLS === 'number'`; `E.DREAMS`; `E.MENTOR_LEVELS` (T2). Missing → the feature is simply not shown.

### 14.2 New module `js/onboard.js` (in-game UI lane)
```js
export function afterStart(h)          // h = { S, CFG, W, my, gen:()=>int, persist, render, isBusy:()=>bool }
export function afterTurn(h)           // between turns: queued coaches, practice chip
export function onCard(ev, ctl, h)     // in-card coaches (roi, plan); reveal triggers by ev.type
export function onCardClosed(ev, res, h)
export function isRevealed(key)        // used by ui.js renderers
export function tour(h); export function legend(h);
// emits bus 'onboard:done' {reason:'done'|'skip'} once, when the intro closes
```
It owns: the reveal state (§4.3), the coach schedule (§4.4), the tour/legend (§4.5), the practice chip/sheet flow (§10.1), `WORLD_COACH` (moved from `game.js:293-310`, texts unchanged), and the trace hook `window.__t4trace` (array of `{t, screen}`; test-only, harmless in production).

### 14.3 `js/ui.js` changes (in-game UI lane)
- Overlay queue (§4.7); `trapFocus()`; document-level Escape; `#a11yLive`; `#helpBtn`, `#hNext`, `#hDream` injection; `#hEnergy` aria-label (N15).
- `renderEvent` case `'intro'` (§4.2) with `introChips()`; payday card order (§4.3, P1).
- `renderHUD`/`renderLife`: respect `onboard.isRevealed`; chip aria-labels (A11Y-10); learning tag (S-M7).
- `practiceChip(q, onAnswer)` and `practiceSheet` (§10.1); `dreamModal(m.dream)`; `dreamToast(list)`.
- `lessonCard(l)` shows the S-B2…S-B6 lines (reads `LESSON_META` via `library.js` `meta(id)`; `ctx` from the lesson object).
- `coach()`: Escape = next; re-place after `animationend`; the bubble's buttons ≥ 44 px; label texts per §4.4.
- N14, N15.

### 14.4 `js/progress.js` (lobby lane)
New fields in `fresh()` (merged by `load()`, so old data reads fine): `learnGames:0`, `dream:null`, `dreams:{}` (`{[dreamId]: { done:[missionId], games }}`), `tutorialReplay:false`, `lastMode:'normal'`, `mentorPref:null`. New exports: `setDream(id|null)`, `requestTutorialReplay()`, `consumeTutorialReplay() → bool`, `setLastMode(m)`, `setMentorPref(l)`, `recordLearnGame(e) → { learn:true, wouldStars, worldId }` (increments `learnGames`, sets `tutorialDone`, `lastChar`; nothing else), `recordDream(e)` (free normal games only: merges `e.end.dream` done missions into `dreams`). None of the new fields is added to `metaOf()` or synced.

### 14.5 `js/library.js` (lobby lane)
Storage v2 (§9.4) with v1 read. New: `unlock(ids, list?)` stores `ctx` from list items; `contextOf(id)`; `meta(id)` (from `LESSON_META`); `markPracticed(topic, right)`; `practiceStats()`. `bus 'lesson'` handler passes `p.list`. `bus 'practice'` (`{topic, right}`) → `markPracticed`.

### 14.6 `js/lobby.js` (lobby lane)
- Welcome rewrite (F1); world view: mode group, dream row, character cards (§5), two continue rows, mentor row (§6.5).
- `startFree(worldId, charId, opts)`: adds `learn` (`opts.learn`), `dream` (`P.getProgress().dream`, normal and learning), `mentor` (T2), the tutorial rule of §4.6, `bailout: learn ? true : P.bailoutAvailable()`; no `P.setTutorialDone()` on launch; `bus.on('onboard:done', () => P.setTutorialDone())`.
- `continueFree(worldId, {learn})` reads the matching slot via `G.saveKeyFor({mode:'free', worldId, learn})`.
- Learning gates (§7.1): `onGameEnd`, `bus 'achievement'` handler, `onQuizReward`, `creditQuizAtEnd`, `logMilestones`, duel buttons; end screen §7.4.
- Dream on end screen (S-D10, S-D18); profile sections (S-D12, help rows F4); library (§9); streak copy (§11); naming N1–N12; empty-⚡ learning button (F6).
- One-time migration on boot: §4.6 existing players → `rr2-reveal.all`.

### 14.7 `js/energy.js` (lobby lane)
Labels only (`NAME`, `ONE`, `ICON`, `label(n)`). No logic change; `tests/energy.test.mjs` keeps passing unchanged.

### 14.8 CSS
`css/lobby.css`: welcome, mode group, dream row, character card (§5.1), locked lesson card, lesson sheet lines, learning end screen; all with A11Y-5/6/9. `css/game.css`: `--t4-*` tokens, `.t4-new` pulse, `#hNext`, `#hDream`, `#helpBtn`, `.nextgoal`, intro card, practice chip/sheet, `.lc` 44 px on phones, coach button sizes.

### 14.9 Shell interface requests (`js/game.js`, after T1 merges)
| id | Change (exact) |
|---|---|
| IR-T4-1 | `saveKeyFor(cfg)`: `if ((cfg.mode === 'free' || !cfg.mode) && cfg.learn) return \`rr2-save-learn-${cfg.worldId || 'w1'}\`;` before the free line. If T1's `saves.js` owns key building, the same rule goes there. |
| IR-T4-2 | `startGame` `E.createGame({...})` (`game.js:234`) adds `learn: !!cfg.learn && cfg.mode === 'free', dream: cfg.mode === 'free' ? cfg.dream : undefined, mentor: cfg.mentor` and keeps `tutorial: !!cfg.tutorial && cfg.mode === 'free'`. |
| IR-T4-3 | Replace the tutorial coach code with hooks: `game.js:275-285` → `await onboard.afterStart(h)`; `:329-337` (`wantCoach`/`showCoach`) removed; `:539-541` → `await onboard.afterTurn(h)`; `:614-620` → `onboard.onCard(cur, ctl, h)`; in `close()` → `onboard.onCardClosed(cur, res, h)`. `worldCoach`/`WORLD_COACH`/`markWorldCoached` move to `onboard.js` (`rr2-coach` key and format unchanged). `h` is built once per start: `{ S, CFG, W, my, gen: () => gen, persist, render, isBusy: () => busy }`. |
| IR-T4-4 | `applyOut`: `if (out.dream && out.dream.length) ui.dreamToast(out.dream);` and news `kind === 'goal'` → `ui.toast('🎯 ' + n.text, { kind: 'gold' })`. (`out.lessons` already flows to the library with `ctx`.) |
| IR-T4-5 | `endGame` payload adds `learn: !!CFG.learn, dream: S.dream ? E.metrics(S).dream : null`. |
| IR-T4-6 | `showNoEnergy`: first button `<button data-go="learn">🎓 לתרגל בלי הגבלה</button>`; `onExtra`: `go === 'learn'` → `persist(); bus.emit('lobby:open', { view: 'world', id: W.id, learn: true })`. Lobby `normalize()` accepts `learn`. |
| IR-T4-7 | ⚡ strings N16, N17. |
| IR-T4-8 | Practice answer path used by `onboard.js`: `E.answerPractice(S, qid, idx)` then `render(); persist();` (no `checkpoint()`: practice never runs in ranked). Exposed through `h`. |
| IR-T4-9 | `goLobby()` and `endGame()` call `ui.hideCoach()` (already) and `onboard.hidePractice()`. |

---

## 15. Acceptance criteria (numbered, testable)

**Opening**
- AC-O1 A scripted new player (empty storage, Supabase routed to 503) reaches an **enabled first meaningful decision (intro beat 2 options) ≤ 60 s** after navigation start, on 390×844 and on 1300×820, with **≤ 3 screens** on F1 and on F2 (counted from `__t4trace` screen events: welcome, world, game).
- AC-O2 F1 is exactly 2 screens; the welcome has ≤ 35 words and contains no ⚡, ★★★ or plan text.
- AC-O3 Beat 2 has 3 enabled options, none with `primary`, and shows S-I9.
- AC-O4 After a beat-2 choice, the HUD cash equals `result.cashAfter` within 1.5 s (animation end) and beat 3 shows the before → after rows and a next-goal box.
- AC-O5 With the intro closed, the HUD shows `#hNext` with the goal title and `value/target`.

**Tutorial**
- AC-T1 Skip on beat 1 closes the intro, reveals every key, shows no further tutorial coach in that game, and sets `progress.tutorialDone`.
- AC-T2 Quitting during the intro leaves `tutorialDone` false; continuing the save reopens the intro at the same beat.
- AC-T3 After `tutorialDone`, starting w1 never sets `cfg.tutorial` unless `requestTutorialReplay()` was called, and then only once.
- AC-T4 The help modal opens from `#helpBtn` in every mode; the tour shows 5 steps over current values; the legend lists every visible chip with its current value.
- AC-T5 In a tutorial game, at turn 0 the HUD shows only the always-on keys plus `cf`; each other key in §4.3 appears exactly when its trigger fires (scripted per key).
- AC-T6 Tutorial deal guarantee (E-5) holds for 4 characters × 3 choices × 20 seeds; and in a browser run the deal card shows no negotiation offers and its gold button is `לקנות`.
- AC-T7 Never more than one floating overlay is visible: across a scripted 30-turn phone game, sampling every 100 ms, `#coach .bubble`, `#achv .ach`, `#toast.on` and a visible `#verdict` are never visible two at a time.
- AC-T8 A player with `gamesPlayed > 0` before the upgrade sees no intro, no hidden HUD part and no hint coach.
- AC-T9 The desktop ROI ring's rectangle overlaps the `[data-roi]` button's rectangle by ≥ 80%.

**Character select**
- AC-C1 Every character card shows identity line, story, strength, weakness, difficulty word, `בסוף כל חודש נשאר/חסר` equal to `metrics(createGame()).cashflow`, and only the ★ condition; details show all star conditions.
- AC-C2 No card is a `<button>` that contains another interactive element; `עוד פרטים` toggles `aria-expanded`.
- AC-C3 At 360×760 the first card's `לשחק` is within the first viewport when the dream row is collapsed.
- AC-C4 Every ₪ figure in `CHAR_META` matches the engine (T-M4).

**Dream**
- AC-D1 `createGame({mode:'daily', dream:'stable'})` → `st.dream === null`; with `mode:'free'` → set.
- AC-D2 Same seed and action log with each of the 4 dreams and with none → identical `metrics()` (excluding `dream`), identical `checkEnd()` result, identical `st.rng`.
- AC-D3 A mission completes at the first payday where its condition holds; `out.dream` lists it once; the HUD chip count increments; a gold toast appears.
- AC-D4 The end screen shows S-D18 in free/learn, never in ranked; the first end screen without a dream shows S-D10 and saving sets `progress.dream`.

**Learning mode**
- AC-L1 In a learning game, 40 rolls leave `rr2-energy.e` unchanged and `#hEnergy`/`#rollEn` stay hidden.
- AC-L2 A learning game that earns an achievement, answers a quiz right and wins: no change to `progress.stars`, `best`, `achievements`, `worldsPlayed`, `gamesPlayed`, `wins`, `hadBankruptcy`, `rr2-energy`; no `net.logEvent`; `learnGames` +1; new lessons are in `rr2-library`.
- AC-L3 A normal free save and a learning save of the same world coexist; both continue rows appear; continuing each restores its own `learn` flag.
- AC-L4 The learning end screen shows S-L1/S-L2, S-L3/S-L4 and S-L5, and has no duel/share button.
- AC-L5 The empty-⚡ card (lobby and in game) offers S-M8, which opens the world view with learning selected without deleting the normal save.

**Naming**
- AC-N1 No user-facing string in `js/` and `index.html` contains `אנרגי` except the w4 pitch sector (T-M6), and every ⚡ label reads זריקות/זריקה.
- AC-N2 The 🔋 chip popover contains `לא ⚡ זריקות`.

**Library**
- AC-B1 No library section header contains Latin letters; `business` shows `🏪 עסקים`.
- AC-B2 Every lesson has a non-empty `teaser` and `hint`; locked cards show them; no card says `שיעור נעול`.
- AC-B3 `time_in_market` and `benchmark` are unlocked by scripted engine runs (E-8); a full sweep can reach 75/75.
- AC-B4 A lesson unlocked in a game stores `ctx` (`m`, `w`, `ev`, `num` when defined) and its sheet shows the S-B4 line; a v1 `rr2-library` value loads without loss.
- AC-B5 Every lesson in the practice trigger lists has an `example`; lessons with `sim` show S-B5.

**Practice**
- AC-P1 `practiceDue` never consumes RNG (`st.rng` deep-equal before/after) and returns `null` in ranked, history, before turn 4 and during the intro.
- AC-P2 In a scripted 60-turn free game, offers are ≥ 3 turns apart, ≤ 6 in total, each `qid` at most once.
- AC-P3 `answerPractice` changes only `st.practice`, `st.dq.transfer` and `st.actions`; `replay(cfg, actions)` with `Q` entries reproduces the state; ranked `answerPractice` returns `ok:false`.
- AC-P4 All 24 items: 3 answers, `c` ∈ {0,1,2}, the correct answer's number recomputed by the test equals the stated one (numeric items), `why` ≤ 90 characters.
- AC-P5 No ⚡ is granted for practice in any mode.

**Accessibility**
- AC-A1 Tab from the last focusable element of each T4 dialog returns to its first, and never reaches `#hud`/`#bar`/`#sheet` (Tab walks as in UX§2.5).
- AC-A2 Escape behaves per A11Y-2 for each dialog listed; decision cards stay open.
- AC-A3 Every T4 control measures ≥ 44×44 at 390 and 360 widths (audit script of UX§0).
- AC-A4 Computed contrast of every T4 text node ≥ 4.5:1 in light and dark.
- AC-A5 With `prefers-reduced-motion: reduce`, no T4 element has a running CSS animation.
- AC-A6 The bidi scan finds 0 misplaced signs on welcome, world view, intro beats, practice sheet, dream modal, library and lesson sheet.

**Regression / compatibility**
- AC-R1 All existing Node suites pass (engine, finance, business, progress, energy, library, verify, determinism), plus `node tools/build-edge.mjs --check` after the re-pin.
- AC-R2 A ranked game (daily, routed fake backend) produces the same action log and end result before and after T4 for 5 fixed seeds and scripted choices.
- AC-R3 v3 saves (free, history, ranked) load after the v4 bump (E-11); an old-tutorial v3 save continues.
- AC-R4 `rr2-progress`, `rr2-library`, `rr2-energy`, `rr2-coach` values from HEAD load without loss and are written back only additively.
- AC-R5 The sim tutorial check of E-13 holds (P1).

---

## 16. Test plan

Never production: every browser context first runs `await ctx.route('**/*.supabase.co/**', handler)`. Default handler: `route.fulfill(status=503, body='{"message":"t4-test"}')`. "Fake" variant: `rr_*` read RPCs (profile, daily, groups) return fixed JSON; every write (`rr_begin`, `rr_checkpoint`, `rr_finish`, `rr_sync*`, `verify-result`, `register`) returns 503. A `request` listener fails the test if any request to a `supabase.co` host is seen without having been routed. Pages are served from the local test copy (`tests/serve_copies.sh` / `make_testcopy.sh`), as `game_e2e.py` does.

### Node (each prints `N passed`, non-zero exit on failure)
- **`tests/t4_engine.test.mjs`** (engine lane)
  - T-E1 intro: beats, option ids, no primary on `glitch`, money effects per choice for 4 characters, `skip`.
  - T-E2 tutorial deal guarantee (AC-T6) and the dice remap; seeded draws still consumed (dice stream position equals a non-tutorial game's after N rolls).
  - T-E3 goal chain transitions and news texts.
  - T-E4 `rollCost` table (ranked, learn, tutorial < 10, ≥ 10, free).
  - T-E5 dreams: AC-D1, AC-D2, mission timing, `powerStreak` and `cleanSince` edge cases.
  - T-E6 lesson ctx shape; `time_in_market` and `benchmark` unlocks.
  - T-E7 RNG neutrality: deep-equal `st.rng` around every intro choice, `practiceDue`, `answerPractice`, `dreamTick`.
  - T-E8 practice: AC-P1…P4; replay with `Q`, intro choices and a dream.
  - T-E9 `migrateV3` defaults; v3 tutorial save continues.
- **`tests/t4_meta.test.mjs`** (lobby lane)
  - T-M1 `progress.js`: `recordLearnGame` changes only `learnGames`, `tutorialDone`, `lastChar`; `requestTutorialReplay`/`consume…`; `setDream`; old `rr2-progress` loads.
  - T-M2 `lessons-meta.js`: every `LESSONS` id has `teaser` + `hint`; every practice-trigger lesson has `example`; `CATS` covers every category with Hebrew only.
  - T-M3 `library.js`: v1 → v2 read; `unlock(ids, list)` stores the first `ctx`; `markPracticed`.
  - T-M4 `characters-meta.js`: every ₪ figure in a strength/weakness equals the matching `characterCard()`/`metrics(createGame())` value (parser for `₪[\d,.]+( מיליון)?`).
  - T-M5 `energy.js` labels; existing `energy.test.mjs` untouched and passing.
  - T-M6 naming lint: scan string literals in `js/**/*.js` and `index.html` for `אנרגי` (allow-list: the w4 pitch sector) and for `⚡` within 12 characters of `כוח` (must not appear together as one meaning).

### Playwright (Python, like `tests/game_e2e.py`)
- **`tests/t4_onboarding.py`**
  - P-1 F1 timing (AC-O1, AC-O2): fresh context; 390×844 and 1300×820; the scripted player waits for each target to be visible, pauses 1.5 s, clicks. Records `performance.now()` when `[data-intro-opt="fix:pay"]` is enabled; asserts ≤ 60,000 ms; asserts `__t4trace` screens ≤ 3.
  - P-2 F2 path (welcome → world → game): ≤ 3 screens, ≤ 60 s.
  - P-3 AC-O3…O5, AC-T5 (reveal by key, scripted with forced states through an in-page engine driver as in UX `cards.py`), AC-T9.
  - P-4 skip, quit-and-continue, replay request (AC-T1…T3); help/tour/legend (AC-T4).
  - P-5 learning mode: AC-L1…L5 (40 rolls; achievement and quiz forced through the engine driver; storage diffs before/after).
  - P-6 dream: pick on world view, mission completion toast, end-screen line, first-end invitation (AC-D3, AC-D4).
  - P-7 library: Hebrew headers, locked teaser/hint, lesson context line after a played unlock (AC-B1, B2, B4).
  - P-8 practice: chip appears after a trigger lesson, sheet answer, no ⚡ change (AC-P2, AC-P5).
  - P-9 existing-player migration (AC-T8): seed `rr2-progress` with `gamesPlayed: 3`, then load.
  - P-10 overlay sampling (AC-T7).
  - P-11 ranked unchanged (AC-R2) with the fake backend's daily config.
- **`tests/t4_a11y.py`**: Tab walks and Escape per dialog (AC-A1, A2); 44 px audit at 390 and 360 (AC-A3); computed contrast light/dark (AC-A4); reduced motion (AC-A5); bidi scan (AC-A6). Reuses the audit approach of UX§0 (`audit_lib.py` logic copied into the test file; nothing imported from `/tmp`).

Run order: `node tests/t4_engine.test.mjs && node tests/t4_meta.test.mjs && python3 tests/t4_onboarding.py && python3 tests/t4_a11y.py`, then all existing suites (AC-R1). Lobby suites that write to production stay disabled (TASK_BOARD).

---

## 17. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | `game.js` is in T1's lane and T1 is changing it now; T4 hooks conflict. | T4's shell edits are 9 small, listed requests applied **after** T1 merges; `onboard.js` holds the logic, so the `game.js` diff stays small. |
| R2 | Engine changes require a verifier re-pin and a coordinated release; T4 adds an action code. | Ride the single v4 release with T2/T3 (E-11, E-12). `Q` is free/learn only and rejected in ranked. |
| R3 | T2's spec may define mentor levels, focus or the impact panel differently. | T4 only decides *when* they are offered (§4.3, §6.5), behind feature detection; T2 owns semantics. |
| R4 | The 10 free tutorial rolls change the ⚡ economy for new players. | Once per player (first w1 game); P1 and separable; clearing storage already resets ⚡ to 25 today, so no new exploit. |
| R5 | "זריקות" also means "injections" in Hebrew. | Director's decision; always shown with ⚡ and with "הטלה"/"קובייה" nearby (N2, N16). If playtests show confusion, "הטלות" is a one-file change in `energy.js` labels + N-rows. |
| R6 | Dream missions read as win conditions. | S-D7 and S-D15 say so explicitly; the stars row and goal meter are unchanged. |
| R7 | Practice prompts feel like homework. | A chip, never a modal; ≤ 6 per game, ≥ 3 turns apart; one-tap skip; never during the intro; no penalty, no ⚡ either way. |
| R8 | The tutorial deal is small (₪1,000–₪1,500) for cash-poor characters and may feel trivial. | It arrives as the reward for the cushion goal, and the ROI coach turns it into the "how to evaluate a deal" lesson; rich characters keep ₪5,000. |
| R9 | The gradual reveal hides information a returning player needs. | Only the first w1 game for a brand-new player; existing players are migrated to "all"; the legend and tour are always one tap away. |
| R10 | Strength/weakness numbers go stale after a balance change. | T-M4 fails the build. |
| R11 | Library storage migration loses data. | Additive v2, v1 read path, unit test with real HEAD-shaped data (AC-R4). |
| R12 | Headless timing is noisy (swiftshader, 2 cores). | The 60 s budget is about 2× the measured desktop baseline; the test records the number in its output for trend tracking. |
| R13 | Lesson hints may not match a changed trigger later. | Hints are kept next to the trigger table; the engine lane re-checks `biz_*` while implementing E-8; any trigger change must update `lessons-meta.js` (noted in a comment beside `lesson()`). |

---

## 18. P-tag summary and cut list

- **P0:** §2 F1–F7, §3, §4.1–4.7 (except C-zr), §5, §6.1–6.4, §7, §8, §9.1–9.5, §11 streak copy, §12, E-1, E-3…E-9, E-11, E-12, the matching UI and shell rows.
- **P1:** D-9/E-2 free tutorial rolls + C-zr; payday card reorder (§4.3); §6.3 profile badges (S-D12); §10 practice UI and E-10 engine; E-13 sim; S-B6.
- **P2:** S-W5 restore link; `h:` character meta; library "practise now" outside a game.
- Explicitly deferred: continue after win (T6).

---

## Implementation notes — LOBBY/META + SHELL part (T4 implementer, 2026-11-21)

Files: `js/lobby.js`, `css/lobby.css`, `js/progress.js`, `js/library.js`, `js/energy.js`, `js/net.js` (N13), `js/main.js` (T5 CR-L2), `js/game.js` (IR-T4-1…9), new `js/onboard.js`, `js/practice.js`, `js/data/lessons-meta.js`, `js/data/characters-meta.js`. Tests: new `tests/t4_meta.test.mjs`, `tests/t4_lobby.py`; updated `tests/lobby_v3.py`, `tests/lobby_v3b.py`, `tests/stubs/js/game.js`. Not touched: `js/ui.js`, `css/game.css`, `js/engine.js` and its import graph, `index.html`, `js/scene.js`, `js/render/*`.

**Works with or without the engine part.** Every engine feature is detected (§14.1): `ENG.DREAMS` (tests may set `window.__t4dreams`), `ENG.MENTOR_LEVELS || ENG.MN.LEVELS` (T2 is in, so the mentor row is live), `E.practiceDue`, `E.TUTORIAL_FREE_ROLLS`, `st.intro`. Until the engine lands: learning rolls cost no ⚡ through `game.js usesEnergy()` (`CFG.learn`), the first 10 rolls of the tutorial game are free through the same gate (only while `E.TUTORIAL_FREE_ROLLS` is absent), the tutorial runs today's roll → meter → ROI coaches (moved to `onboard.js`), and `onboard:done` fires when the tutorial game is on screen (the moment `lobby.js` used to call `setTutorialDone()` on launch).

**Where the code differs from the spec, and why**
1. Action code for practice is **`K`** (TASK_BOARD), not `Q` (T3's). `js/practice.js` is pure (no engine import): `pickPractice(st, memo, expenses, fmt)`, `checkAnswer`, `recordAnswer(st, qid, idx, turn)` (writes `st.practice.answered/turns` and `st.dq.transfer`). The engine wraps them (CR-E3).
2. 82 lessons in the working tree, not 75 (T2 added `due_diligence`, `business_cycle`; T3 is adding `total_cost`, `housing_share`, `sunk_cost`, `biz_seasonality`, `biz_terms`); all got a teaser + hint (the T3 hints name the story chain / business event that teaches them — T3 should re-check them when it lands). 11 practice-trigger lessons had no example in §9.5 (`drawdown, rate_risk, wage_lag, side_tax, bubble, panic_selling, negotiation_fail, time_scarce, rest_value, biz_owner_job, biz_inventory`); T-M2 requires one, so they were written here (hand-checked numbers).
3. `w2:chef` "₪2,700": the bistro now makes ₪2,660 (variable rate after T2). T-M4 compares figures rounded to ₪100 (millions to 0.01), so the spec string stays; importer/exporter are checked against the character's nominal asset cash flow (the live one moves with the dollar).
4. Streak copy S-S1 uses "יום" for n = 1 (`🔥 1 יום ברצף.`), "ימים" otherwise.
5. Welcome S-W3 for a player who already played (reached via S-H8) goes home instead of starting a new w1 game.
6. Character card: an `<article>` with the two sibling buttons (AC-C2); a tap on the card's plain area still plays (the old whole-card button behaviour, kept for pointer users and the existing suites). Keyboard: mode radio → dream → mentor → per card עוד פרטים → לשחק.
7. Mentor row labels follow T4 (מדריך / רמזים / מקצוען), not T2's (מתחיל / מתקדם / מומחה). The tutorial game is always `guide`.
8. The dream row collapses to S-D9 only after a pointer choice: arrow keys fire `change` on every step (A11Y-4), so keyboard users keep the open group.
9. Lobby legend (S-H4) lists the signs without values (no game is running); the in-game legend (`onboard.legend`) shows current values.
10. `--t4-*` tokens are defined in `css/lobby.css` scoped to `.lb-shell, #lbLesson` (same values) until `game.css :root` gets them (CR-U-T4-1).
11. Phone world view is compacted (≤ 600 px: short hero, one goal row, 2-column mode group, one-line mentor row) so AC-C3 holds: first card's לשחק bottom at 753 px of 760 (360×760, dream row collapsed, mentor row shown).
12. The quality group in settings appears only when `js/render/quality.js` loads (T5 rendering lane); מצב קל is a switch calling `game.setLite(on)` (off → page reload into 3D, T1).
13. `rr2-reveal` migration also runs after a server merge / restore code that turns a "new" device into an existing player.

### Change requests — engine lane (after T2/T3, same v4 save bump)
- **CR-E1** E-1/E-2/E-9: `createGame({learn, dream, mentor})` (game.js already passes them, IR-T4-2); `rollCost(st)` → 0 when `st.learn`; export `TUTORIAL_FREE_ROLLS = 10` (game.js then stops its client fallback automatically); `replayConfig` adds `learn` and `dream`.
- **CR-E2** E-3/E-4/E-5 intro card + goal chain + sized tutorial deal; give the intro options `data-intro-opt` hooks via the UI lane (CR-U-T4-5). `onboard.onCardClosed` emits `onboard:done` with `reason:'skip'` when `st.intro.step === 'skipped'`.
- **CR-E3** E-10 with action **`K`**: `practiceDue(st, memo) = PR.pickPractice(st, memo, expensesOf(st), fmtM)`; `answerPractice(st, qid, idx)`: guard (ranked/history, unknown/answered qid, `phase !== 'roll'` → `{ok:false}`), `act(st, ['K', qid, idx])`, return `PR.recordAnswer(st, qid, idx, st.turn)`; `replay()` `case 'K'`; `CODES` gains `'K'`; `learningOf()` adds `transfer`.
- **CR-E4** E-6 `num.value`: a pre-formatted string is shown as is; a number is shown as % for `tax_brackets / marginal_overtime / inflation` (≤ 1 → ×100), as a count for `diversification / index_fund`, else as ₪ (lobby `ctxValue`).
- **CR-E5** E-7 `metrics().dream` and `end.dream` (game.js sends `E.metrics(S).dream` as `payload.dream`, IR-T4-5): `{id, missions:[{id, title, done}]}` — the lobby counts `done` and stores ids for badges.
- **CR-E6** E-8 + N18 (`business.js:688` `−{n} 🔋 כוח בחודש`); re-check the `biz_*`, `due_diligence`, `business_cycle` hints in `js/data/lessons-meta.js`.

### Change requests — in-game UI lane (`js/ui.js`, `css/game.css`)
- **CR-U-T4-1** `game.css :root`: `--t4-pos: light-dark(#116a43,#3ccf8a); --t4-neg: light-dark(#a82d26,#ff7a6e); --t4-gold-ink: light-dark(#7a5000,#f2c14e); --t4-mut: light-dark(#5f5870,#aaa3b6);` then drop the scoped copy at the end of `css/lobby.css`.
- **CR-U-T4-2** N14, `ui.js lifeDetails` `energy:` → `['🔋 כוח', \`🔋 כוח: ${Math.round(L.energy)} מתוך 100. זה הכוח של הדמות בסיפור — לא ⚡ זריקות. שעות נוספות, לימודים ועסק צדדי שוחקים; מנוחה ומשפחה ממלאות. מתחת ל־25 — סכנת שחיקה: חודש בלי משכורת.\`]`.
- **CR-U-T4-3** N15, `renderRollEnergy`: title `⚡ ${v}/${max} זריקות — כל הטלה עולה זריקה אחת`; `$('#hEnergy').setAttribute('aria-label', \`זריקות: ${v} מתוך ${max}\`)` (replaces `אנרגיה להטלות` of `index.html:35` at runtime).
- **CR-U-T4-4** F4: inject `<button id="helpBtn" class="ibtn" aria-label="איך משחקים">❓</button>` as the first child of `.htools`, `onclick = () => bus.emit('onboard:help')` (game.js + `onboard.help()` already handle it).
- **CR-U-T4-5** `renderEvent` case `'intro'` (§4.2) with `introChips()`; option buttons carry `data-intro-opt="{id}"` (tests/t4_lobby.py waits for `[data-intro-opt="fix:pay"]`).
- **CR-U-T4-6** §4.3 reveal: `renderHUD` / `renderLife` call `onboard.isRevealed(key)` (exported; today it returns true unless `S.ui.reveal` exists) and set `hidden`; `.t4-new` pulse; `#a11yLive`.
- **CR-U-T4-7** §10.1: `export function practiceChip(q, onAnswer)` and `hidePractice()`; `onAnswer(idx)` returns `{ok, right, correct, why, sim}` (onboard.js already calls `ui.practiceChip` when it exists and emits bus `practice`).
- **CR-U-T4-8** §6.4: `dreamToast(list)` (game.js calls it when it exists, IR-T4-4), `#hDream` chip + `dreamModal(m.dream)`.
- **CR-U-T4-9** S-M7: world card tag `🎓 תרגול` when `ctx.cfg.learn`.
- **CR-U-T4-10** `lessonCard(l)`: S-B2…S-B6 from `library.js` `meta(id)`, `contextOf(id)` / `l.ctx`, `practiceStats()` (the lobby's `lessonLines()` is the reference).
- **CR-U-T4-11** A11Y-1/2: `trapFocus(root)` in `modal()` / `openEvent()`, document-level Escape for the topmost dialog, coach Escape = `הבנתי`, coach buttons ≥ 44 px; `.t4-legend` / `.t4-help` styles for the in-game legend and help modal.

### Change requests — T7 (tests)
- **CR-T7-T4-1** `tests/a11y_e2e.py` K-3 Tabs until `document.activeElement.matches('.wv-char')`; the card is now an article: match `.wv-char .wv-go` (3 Tabs from the focused mode radio when the mentor row is shown).

### Review fixes (docs/next-level/reviews/T4-review.md)
- **M-2** The 10 free rolls (D-9) are a separate flag: the lobby sets `cfg.tutorialFree` only for a brand-new player's first game (`progress.firstEverGame()`: no `tutorialDone`, no finished normal or learning game, not a learning game). `game.js usesEnergy` gates on `CFG.tutorialFree`, not on `CFG.tutorial`. A replayed tutorial keeps its coaches and pays ⚡. **CR-E1 update (engine):** E-2 must gate on the same flag, `createGame({tutorialFree})` → `st.tutorialFree`, and `rollCost` returns 0 only for `st.tutorialFree && st.turn < TUTORIAL_FREE_ROLLS`; add `tutorialFree` to `replayConfig` for free games only.
- **M-3** Tutorial rule = `consumeTutorialReplay() || (!tutorialDone && no finished game)`. `mergeProfile` sets `tutorialDone` when the server's `meta.games > 0` (restore code / server progress on a new device).
- **M-4** "יאללה, משחק ראשון" goes through the normal `startFree` confirm when a w1 save exists.
- **M-5** Driver strength is now `64 חודשים — זמן נוח להתחיל לאט`. T-M4b re-derives every "הכי …" claim from the world data (max/min of max months, salary, expenses, cash); an unclassified claim fails.
- **M-1** `t4_meta` reports lessons-meta ids without an engine lesson as PENDING (the T3 lessons until T3's engine work is committed).
- **Minors done:** m-1 (learning end screen: no ★ near-miss line, no ★★★ gate), m-2 (topics from every item's trigger list), m-3 (mentor names from `E.MN.LEVEL_TEXT`: מתחיל / מתקדם / מומחה), m-4 (phone: personal best in the hero; a locked level explains itself on tap; story 2 lines), m-5 (focus after "שינוי"), m-7 and m-8 (tests tightened; regression scenarios `review` and `replayreal`), m-9 (`recordDream` deduplicated), nits 3, 6 (icons escaped, `__t4dreams` read only under `navigator.webdriver`), 7, 8, 9.
- **Left as change requests (other lanes' files):**
  - m-6 in-game legend ⚡ value, `onboard.js` legend row `['⚡', 'זריקות', …]`: value `${EN.get()}/${EN.MAX}` from `./energy.js` (dynamic import).
  - Nit 1 tour step 1 → title `💰 מזומן ותזרים`.
  - Nit 2 `game.js resolveCard`: move `let closedRes = null;` up next to `let cur = ev, working = false;`.
  - These sit next to the in-game UI lane's open hunks, so they were not touched here.
