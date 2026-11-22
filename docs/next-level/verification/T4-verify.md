# T4 verification: opening, onboarding, character and dream, learning mode, ⚡/🔋 naming, library and practice

- **What was tested:** a clean `git archive` of **03c9fc8**, unpacked to `/tmp/v4/wt` and served as private copies on ports 8925, 8926 (lobby stub) and 8927 (real game).
- **HEAD moved during the run:** it is now **82aa1ba** (8 T3 commits). In the T4 files those commits change only gendered strings (`ui.gw`) and the T3 business/story code. The coach, skip, reveal and practice logic that this report relies on is byte-identical. D1 therefore still applies at 82aa1ba.
- **How it ran:** every browser context used the T7 guard or fake backend (`fakebackend.install`), and the guard ended clean in every run. Nothing touched production, and no MCP or remote browser was used.
- **Environment:** headless Chrome with swiftshader on 2 shared cores. Nothing was tested on a real phone or with a screen reader.
- **Probes:** `/tmp/v4/probe.py`, `chip.py`, `quit.py`, `practice_sim.mjs`, `sweep.mjs`, `sweep2.mjs`, `chars2.mjs` and `dreamtut.mjs`. Their logs and JSON are in `/tmp/v4/`, and the screenshots are in `/tmp/v4/shots/` (47 files, plus 27 in `/tmp/v4/shots/t4lobby/`).

## 1. Suite counts (on my copy)

| suite | result |
|---|---|
| `tests/t4_meta.test.mjs` | 126 pass · 1 PENDING ("75/75 sweep needs E-8": stale, see D5) |
| `tests/t4_engine.test.mjs` | 9/9 groups pass (T-E1…T-E9, incl. T-E8 practice: AC-P1…P4, dose, replay `K`, ranked refused) |
| `tests/progress.test.mjs` | 41/41 |
| `tests/library.test.mjs` | 6/6 |
| `tests/energy.test.mjs` | 26/26 |
| `tests/saves.test.mjs` | 105/105 |
| `node tools/build-edge.mjs --check` | ✓ pins the current engine |
| `tests/t4_lobby.py` (stub 8926 + real 8927) | **92 PASS · 1 FAIL** (AC-L1: only 35 of the 40 rolls fit the 18-min drive deadline under load; ⚡ 5 → 5 was unchanged, so this is test infra: D4) |
| `run_all.sh --only=lobby_smoke,lobby_e2e,lobby_v21,lobby_v3,lobby_v3b,lobby_real` | **6/6 PASS**: smoke 6 s, e2e 65 s, v21 19 s, v3 101 s, v3b 92 s, real 94 s. All on the fake backend. |
| my probes (real copy, 390×844 and 1300×820) | about 70 checks: 4 real failures (D1, D3), the rest PASS |

## 2. First minute, brand-new player (empty storage, fake backend)

Each step had a 1.5 s "reading" pause before the click. Times are `performance.now()` from navigation start.

| path · viewport | welcome visible | 1st decision enabled (beat 2) | effect (beat 3) | intro closed | screens | taps to the decision |
|---|---|---|---|---|---|---|
| F1 · 390×844 | 1.0 s | **9.2 s** | 12.0 s | 16.1 s | 2 (welcome → game) | 2 |
| F1 · 1300×820 | 0.9 s | **10.2 s** | 15.3 s | 19.3 s | 2 | 2 |
| F2 · 390×844 (dream + developer) | 1.2 s | **12.4 s** | 15.7 s | 19.0 s | 3 (welcome → world → game) | 3 (+1 optional dream tap) |
| F2 · 1300×820 | 0.9 s | **11.3 s** | 17.1 s | 20.3 s | 3 | 3 |
| t4_lobby (no pauses) | | 8.0–9.4 s | | | 1–2 before the game | |

- **Welcome:** 19 words (h1 + lead), with no ⚡, ★ or plan text. There is no rules document anywhere on the path.
- **Intro chain:**
  - Beat 1: salary, with the rows `נטו ₪9,005 / −₪7,300 / +₪1,705`.
  - Beat 2: the glitch, with 3 enabled options, none primary, and S-I9 shown.
  - Beat 3: before → after rows (`₪5,000 ← ₪4,100`). The HUD changed ₪5K → ₪4.1K, the same value. The next-goal box is shown.
  - After `go`: `#hNext` reads "🎯 חודש הוצאות בצד ₪4.1K / ₪7.3K".
- **Screenshots:** `first-f1-phone_1…6`, `first-f2-phone_1…8`.
- **Gradual HUD reveal (F1 phone):**
  - At turn 0 only cash, cf, month, next, home, mute and ❓ (`#helpBtnM`) are visible.
  - After roll 1: 🔋, plan and the life row.
  - After roll 2: goal meter and sheet.
  - After roll 3: 😊.
  - After roll 6: camera and turbo.
  - The live region announced "נוסף לתצוגה: …" for each key.
  - The first-ever game cost no ⚡ over 8 rolls: 25 → 27, the +2 being one new achievement.
- **Tutorial deal (F2, developer):** the first roll opened "עגלת הקפה של השכן". It offers only `לקנות ב־₪5,000` (primary) and `לוותר`, with no negotiation.
- **Skip:** sets `tutorialDone`. All keys are revealed, the next w1 game has no tutorial, and ❓ → "הדרכה מלאה במשחק הבא" gives the tutorial exactly once (replay #1 tutorial=True, #2 False).
  - **However, coaches still appear after skip (D1).**
- **Quitting at beat 2:** `tutorialDone` stays false, and continuing reopens beat 2 (`fix:*` options). That is AC-T2.

## 3. Character cards (all 13) against engine data (`createGame`, `metrics`, `starThresholds`, `st.life.family`)

Every card shows identity, difficulty, story, 💪 strength, ⚠️ weakness, `בסוף כל חודש נשאר/חסר` and the ★ line. The cards are `<article>` elements with no nested buttons, and `עוד פרטים` toggles `aria-expanded` false → true.

| check | result |
|---|---|
| monthly surplus = engine `cashflow` | 13/13 exact: +1,705, +1,105, +3,004, +3,303, +7,501, +2,660, +6,002, +17,583, +13,672, +10,400, −12,995 ("חסר (חיה מהמזומן)"), +23,003, +7,004 |
| identity line (age, partner, kids) | 13/13 match `st.life` |
| comparisons (superlatives) | All true. Teacher has the lowest expenses (7,300 vs 7,400) and the shortest horizon (52). Driver has the least cash (3,500) and a credit-card line. Doctor has the highest net pay (30,003) and the highest expenses (26,700). Founder has the most capital (3.2 M), engineer has less (1.5 M) and the shortest finish (69 vs 70/84), and social has the least (1.3 M, 20 impact, 84 months). The chef's bistro loan has no fixed rate, so it really is variable. |
| rounded figures | Chef "₪2,700" is ₪2,660 in the engine, importer "₪14,000" is 13,580 and exporter "₪11,000" is 10,670. These are acceptable round-offs. Lawyer, captain and founder figures are exact. |

## 4. Dream

- **Picker:** 4 dreams plus "בלי חלום כרגע". For a returning player it collapses to "החלום שלי: 🗽 חופש כלכלי · שינוי".
- **Returning player:** the `#hDream` chip "🗽 0/3" is 44 px high with an aria-label. The modal shows 3 missions, a progress bar and the note "החלום לא משנה את הכוכבים". Buying an asset gives the gold toast "🗽 משימה הושלמה: נכס ראשון שמכניס כסף" and the chip goes to 1/3.
- **Brand-new player (F2) with a dream:** in the tutorial game the chip is hidden while the goal chain runs (by §6.4 design). The mission completes in the engine (`fr_first`), but no toast was ever shown (D3).

## 5. Learning mode

- **Setup:** the world card tag reads "🎓 תרגול", `cfg.learn` is true, and the save goes to `rr2-save-learn-w1` only.
- **⚡:** unchanged over 16 + 20 browser rolls (6 → 6), and `#hEnergy`/`#rollEn` stay hidden. `game.js usesEnergy()` returns false for `CFG.learn`.
- **Progress and network:**
  - Progress (stars, achievements, gamesPlayed) is untouched during the game.
  - The fake backend received **0** calls during the learning game: no `rr_log_event`, no begin/finish.
  - The learning end screen, AC-L2 and AC-L4 were checked by t4_lobby (PASS).
- **Practice dose (Node):** I emulated onboard's exact memo across 104 games (13 characters × 4 seeds × free/learn, up to 90 months):
  - offers are always ≥ 3 turns apart, never before turn 4, at most 6 per game, with no repeated question;
  - `practiceDue` and `answerPractice` never touched the RNG, cash, savings or 🔋;
  - ranked play is refused.
  - In the browser the chip appeared once in 20 rolls (roll 13), at 110×44 px. Its answer sheet marks the correct option with ✓ and is disabled after the answer (`learn-chip_1…3`).
- **Practice answers:** recomputed 9 numeric items (budget_a/b, debt_b, fund_b, cmp_a, tax_a/b, risk_a, prof_a), and all are correct. All 24 items have 3 answers, `c` ∈ {0,1,2} and `why` ≤ 90 characters.

## 6. ⚡ "זריקות" vs 🔋 "כוח"

- **Rendered DOM (text + aria-label + title):** 0 hits for `אנרגי` on 13 screens: welcome, world w1–w4, intro beats, in-game after 8 rolls, learning game, dream game, lobby home with ⚡ 0, the empty-⚡ card, profile and library.
- **Labels:** the legend reads "⚡ זריקות 27/25" and "🔋 כוח … לא ⚡ זריקות", and the 🔋 chip popover contains "לא ⚡ זריקות" (AC-N2).
- **Source grep:** only the w4 pitch sector `'אנרגיה'` (the allowed exception) and `js/data/real.js:309` (history news "מחירי האנרגיה", meaning real energy prices). That one is fine in meaning but falls outside the letter of AC-N1 (info).

## 7. Library

- **Engine:** 82 lessons. 82/82 are reachable:
  - a broad sweep (13 characters × 8 sim policies × 2 seeds, plus 14 history scenarios) reached 79/82 in 72 s;
  - a targeted run (story `more` choices, w4 app business) reached the other three: `sunk_cost`, `biz_burn` and `biz_ltv_cac`.
- **UI:**
  - 3 unlocked + 79 locked = 82 cards, under 9 Hebrew headers (`🏪 עסקים` included, no Latin) and a counter of 3/82.
  - Every locked card has a teaser, a 🔓 hint and the S-B1 aria-label ("שיעור נעול: … איך פותחים: …"). No card says "שיעור נעול".
  - The `biz_vat` sheet shows the 🔢 example and the 🎲 S-B5 line.
- **Context from a played unlock:** `gross_net` was learned at the first payday. Its sheet shows "📍 למדת את זה בחודש 2 בשכונה — "יום המשכורת" · נטו ₪9,005", and the stored ctx is `{m:2,w:'w1',ev:'יום המשכורת',num}`.
- **Old storage:** a v1 `rr2-library` loads into v2 with its ids and read list kept.

## 8. Existing players

- **v3-era seed:** I seeded the pre-T4 `fresh()` shape of `rr2-progress`: 7 games, stars, achievements, best, streak, learn, `onboarded`. I also seeded `rr2-energy` (e=31 > MAX, with grants), a v1 `rr2-library`, `rr2-coach` and a v3 free save (fixture `deal`, month 14).
- **Result:**
  - The player lands on home, not the welcome.
  - **0 progress fields changed**; energy stays 31 with its grants; library and coach are unchanged.
  - `rr2-reveal.all` is true.
  - The v3 save continues at month 14 with the full HUD and no intro.
  - A new w1 game has no tutorial, no free rolls and no coach.
- **Restored on a new device:** I used the restore code through the welcome link, against a fake server profile with `meta.games:9`. Result: gamesPlayed 9, `tutorialDone` true, `rr2-reveal.all` true. The first w1 game has `tutorial=false` and `tutorialFree` unset, no intro, and goal and sheet visible.

## 9. Acceptance criteria

The "(suite)" label means the evidence is a passing suite check that I re-ran on my copy, not my own probe.

| AC | verdict | evidence |
|---|---|---|
| AC-O1 | PASS | §2: 9.2–12.4 s; ≤ 3 screens |
| AC-O2 | PASS | 2 screens on F1, 19 words, no ⚡/★ |
| AC-O3 | PASS | 3 enabled, 0 primary, S-I9 |
| AC-O4 | PASS | HUD ₪4.1K equals the beat-3 row; before → after rows and goal box |
| AC-O5 | PASS | `#hNext` title + value/target |
| AC-T1 | **FAIL** | D1: a coach follows the skip |
| AC-T2 | PASS | `quit.py`: tutorialDone false, beat 2 reopened |
| AC-T3 | PASS | my skip run + suite (True, False) |
| AC-T4 | PASS (partial) | ❓ in tutorial and normal games (phone `#helpBtnM`, desktop `#helpBtn`); legend with current values; tour 5/5 (suite). Learning and ranked help not checked. |
| AC-T5 | PARTIAL | Turn-0 keys and the reveal order are as specified (§2). Not scripted key by key. The §4.4 coaches attached to reveals are missing (D2). |
| AC-T6 | PASS | t4_engine + browser deal card (no negotiation, gold `לקנות`) |
| AC-T7 | NOT VERIFIED | 100 ms overlay sampling was not run |
| AC-T8 | PASS | §8 (v3 seed + restored player): no intro, no hidden part, no coach |
| AC-T9 | NOT VERIFIED | |
| AC-C1 | PASS | §3: 13/13 |
| AC-C2 | PASS | article, `aria-expanded` |
| AC-C3 | PASS (suite) | bottom = 750 at 360×760 |
| AC-C4 | PASS | §3 engine cross-check |
| AC-D1 / AC-D2 | PASS (suite) | t4_engine T-E groups |
| AC-D3 | PARTIAL | Normal game: toast and chip 1/3 ✓. Tutorial game: no toast (D3). |
| AC-D4 | PASS (suite) | S-D18 / S-D10 / S-D11 |
| AC-L1 | PASS | Functionally (16 + 20 rolls, ⚡ unchanged, chips hidden). The suite's 40-roll check timed out at 35 (D4). |
| AC-L2 | PASS | suite + 0 backend calls in my run |
| AC-L3 | PASS (suite) | |
| AC-L4 | PASS (suite) | |
| AC-L5 | PASS (suite) | |
| AC-N1 | PASS | §6 (info: `real.js` news line) |
| AC-N2 | PASS | popover text |
| AC-B1 | PASS | Hebrew headers |
| AC-B2 | PASS | 79 locked cards checked |
| AC-B3 | PASS | 82/82 reachable (the AC states 75/75) |
| AC-B4 | PASS | played-unlock ctx + v1 load |
| AC-B5 | PASS | `biz_vat` S-B5; t4_meta examples |
| AC-P1 | PASS | Node sim: RNG untouched, turn-4 gate, ranked null |
| AC-P2 | PASS | 104 games: gaps ≥ 3, ≤ 6, unique |
| AC-P3 | PASS (suite) | T-E8 |
| AC-P4 | PASS | independent recompute |
| AC-P5 | PASS | ⚡ unchanged in learning games |
| AC-A1 / AC-A2 | PASS (suite, partial) | A11Y-1/2 for the lesson sheet and details |
| AC-A3 | PASS (suite) | ≥ 44 px at 360 |
| AC-A4 / AC-A5 / AC-A6 | NOT VERIFIED | Contrast, reduced motion and the bidi scan were not run. Spot visual: the signs in the beat-1 and beat-3 rows look correct. |
| AC-R1 | PASS (partial) | t4_meta, t4_engine, progress, library, energy, saves, build-edge. engine, finance, business, verify and determinism were not re-run. |
| AC-R2 | NOT VERIFIED | |
| AC-R3 | PASS | saves 105 + v3 save continued in the browser |
| AC-R4 | PASS | §8: nothing lost, additive writes |
| AC-R5 | NOT VERIFIED | |

Tally (50 ACs): **40 PASS**, of which 11 rest only on suite evidence (the "(suite)" rows) and AC-T4, AC-A1, AC-A2 and AC-R1 are partial in scope · **1 FAIL** (AC-T1) · **2 PARTIAL** (AC-T5, AC-D3) · **7 NOT VERIFIED** (AC-T7, AC-T9, AC-A4, AC-A5, AC-A6, AC-R2, AC-R5).

## 10. Defects

**D1 · MAJOR · AC-T1: tutorial coaches keep running after "דלג על ההדרכה".**
- **Repro (3 of 3 runs):**
  1. Use empty storage on a 390×844 viewport.
  2. Tap welcome "יאללה, משחק ראשון".
  3. On intro beat 1, tap "דלג על ההדרכה".
  4. Within about 2 s the coach "הדרכה 1/3 · מטילים קובייה" opens over the roll button (`shots/skip-phone_1_after_skip.png`).
  5. In one run "הדרכה 2/3 · מד החופש" also appeared after the first roll.
- **What is otherwise correct:** `tutorialDone` is set and the HUD is fully revealed.
- **Cause:**
  - `js/onboard.js wantCoach()` (line 90) gates only on `CFG.tutorial && !S.ui.coach.skip`.
  - The intro skip goes through `emitDone(h,'skip')` and `revealSkip(S)`, and neither sets `S.ui.coach.skip`.
  - So the legacy roll, meter and ROI coaches still fire.
- **Still at 82aa1ba:** yes; that diff touches only coach texts.
- **Fix:** when the intro is skipped (`S.intro.step === 'skipped'`), set `S.ui.coach.skip = true`, or gate `wantCoach` on `S.ui.reveal.skipped`.

**D2 · MAJOR (spec gap, P0) · the §4.4 coaches are not implemented and not listed as cut in §18.**
- **Hint coaches missing:** C-plan, C-sheet, C-power, C-fund, C-happy, C-credit, C-cpi, C-focus and C-impact ("טיפ" one-liners with live values) do not exist. None of the S-C8/S-C10/S-C12/S-C14/S-C16/S-C18/S-C20 strings appear in `js/`, and `HINT_IDS` in `lobby.js:603` is used only to mark everything as "coached" for existing players.
- **Core coaches use the old texts:**
  - They show the legacy texts with "הדרכה i/3" instead of S-C3 to S-C6 (with the live `{passive}/{E}/{pct}` and `{down}/{cf}/{roi}` values) and "הדרכה i/2".
  - The implementation note says "legacy tutorial coaches … unchanged texts".

**D3 · MINOR · AC-D3: no mission toast in the tutorial game.**
- **Repro (2 of 2 runs):**
  1. Use empty storage on a 390×844 viewport.
  2. Choose "אני רוצה לבחור דמות", then dream 🗽, then the developer.
  3. Play the intro: pay, then go.
  4. Roll, and buy the tutorial coffee cart.
- **Engine side:** the engine reports `out.dream=[fr_first]` on that buy (`dreamtut.mjs` shows it on 5/5 seeds), and the save has `dream.done.fr_first`.
- **What the screen shows:** in 25 s of polling only the lesson ×2, goal and double toasts appeared, never "משימה הושלמה", and `#hDream` is hidden while the goal chain runs. The same mission in a normal game shows the toast.
- **Likely cause:** `ui.toast` keeps at most 6 entries and drops the oldest non-`keep` entry first. The tutorial buy emits several toasts at once, and the dream toast is the oldest.
- **Fix:** give the dream toast `keep`.

**D4 · MINOR (test infra) · t4_lobby `learnreal` AC-L1 fails on the roll count, not on behaviour.** Under load, the 18-minute drive deadline yields only 35 of the required 40 rolls, while ⚡ stays unchanged (5 → 5). Raise the deadline or use turbo with a lower per-roll wait.

**D5 · INFO · t4_meta still reports "PENDING 75/75 reachability sweep".** E-8 has landed and 82/82 lessons are reachable (§7). Replace the pending entry with a real sweep; `/tmp/v4/sweep.mjs` plus `sweep2.mjs` can serve as the base.

**D6 · MINOR (code reading, not observed) · the practice memo resets when the game object changes.**
- `practice.reset` re-creates `{lastTurn:null, offered:[]}` on every new `h.S`, which includes continuing after a reload.
- So the "≥ 3 turns apart / ≤ 6 per game" rules hold per session, not per saved game. Ignored offers are not persisted either.

**D7 · INFO · a pre-welcome-era player is shown the welcome again.**
- A player with `gamesPlayed 7` but no `rr2-onboarded` and `progress.onboarded:false` gets the welcome.
- Any start from there is still tutorial-free (`completedAny`), so this is cosmetic.

**D8 · INFO · fixed by T3 at 82aa1ba.** In 03c9fc8 the roll coach said "לחץ" to the female teacher; HEAD now has `ui.gw()`.
