# Next Level · Phase A research · Design & UX

Scope: first-run experience, lobby/world map, character select, in-game HUD and cards, end summary, mobile and accessibility. The brief sections covered are 7 (strong opening), 10 (living city and visual identity), 16 (end summary) and 18 (mobile and accessibility).
Repo state: branch `feat/rat-race-next-level`. No existing file was changed; this file is the only repo write.

Labels:
- **[OBSERVED]** = I ran it. The screenshot path is given; every shot is under `/tmp/research-ux/`.
- **[CODE]** = read in code (file:line).
- **[HYPOTHESIS]** = an inference or a proposal that I did not test.

## 0. Method (what was actually run)

**Server and browser.** Local server `http://localhost:8772/`, Python Playwright, Chrome with swiftshader (the same args as `tests/game_e2e.py`). Runs were sequential on 2 cores.

**Backend safety.** Every `*.supabase.co/**` request was intercepted by `route()` in `/tmp/ux-scripts/mock.py`, so nothing reached production.
- **Offline mode:** every request was aborted.
- **Mock mode:** `rr_*` RPCs got fake JSON, and `rr_begin`, `rr_checkpoint`, `rr_finish` and `verify-result` got a 400 error. The nickname "registration" was answered by the mock only.

**Viewports.** Desktop 1300×820, phone 390×844 and 360×760, tablet 820×1180. One desktop dark-mode pass.

**Scripts** (scratch, outside the repo, in `/tmp/ux-scripts/`):
- `walk.py`: new player from first load. Counts clicks and times, takes screenshots.
- `cards.py`: drives `engine.js` in-page to a pending event of a chosen type, saves it as a normal free-play save, then resumes through the real lobby → "להמשיך" → game. This captures card types that random play reaches slowly.
- `audit.py` + `audit_lib.py`, which check:
  - touch targets under 44 px;
  - accessible names and icon-only buttons;
  - computed WCAG contrast per visible text node;
  - text under 12 px and word counts;
  - keyboard Tab walks with focus location;
  - Escape behaviour.
- `misc.py`: offline returning player, tablet, 360 px, dark mode, life-chip popovers and the emergency-fund modal.
- `lobbyscroll.py`: paged captures of scrollable lobby screens.
- `bidi.py` / `bidiscan.py`: visual-order check of signed ₪/$/% numbers. The scanner was validated against a known-bad sample (`bidicheck.py`).
- `/tmp/ux-node/primcheck.mjs`: a Node engine probe comparing the recommended deal choice with its verdict score.

**Limits of the measurements.**
- The contrast audit cannot compute text over images or gradients. Those hits (`img=True`) are excluded below.
- Times are headless swiftshader wall-clock. They are an upper bound, not real-device timing.
- The mock profile returns `stars:{w1:1}`, so mock-mode lobby shots show w2 unlocked. That is a mock artifact, not a bug.

**Not tested:**
- a real screen reader;
- OS-level text scaling;
- real touch devices;
- ranked daily/weekly/challenge play (the mock refuses `rr_begin`);
- w4 and history in-game screens.

---

## 1. Status tables

### §7 Strong opening
| Item | Status | Evidence |
|---|---|---|
| First meaningful decision ≈ 1 min | **exists (borderline)** | 4 clicks and 4 screens to the first deal. 23 s on phone and 52 s on desktop (headless) [OBSERVED §2.1]. A human reads about 300 words first [HYPOTHESIS]. |
| Tutorial skippable | exists | Coach bubble has "דלג על ההדרכה" [OBSERVED desk_05_coach1.png; CODE game.js:329-337]. |
| Tutorial re-openable | **missing** | No replay entry anywhere. `tutorialDone` is set the moment the first w1 game launches, even if the player quits after 5 s [CODE lobby.js:256-261, progress.js:143]. `rr2-onboarded` hides the welcome screen forever [CODE lobby.js:189,1643]. |
| Gradual reveal | **needs improvement** | Only 3 coach marks: roll, freedom meter, ROI [CODE game.js:329]. From turn 1 the HUD shows 7 life chips + energy + 3 tool buttons, and the desktop sheet shows the full payslip/tax breakdown (431 words on the first desktop game screen) [OBSERVED desk_05_coach1.png]. |
| Char select: identity / story / difficulty / strength-weakness / monthly surplus | **partial** | Has emoji icon, name, 1-line story, difficulty dots + word, salary/expenses/**נשאר בחודש**/cash [OBSERVED desk_03_world_chars.png]. No explicit strength/weakness, no portrait, no link to the pawn. |
| Fewer star conditions up front | **needs improvement** | Every card shows 5 conditions: ★/★★/★★★ month limits, 😊 60 and 🐷 a 3-month fund. The welcome screen repeats the ★★★ rule [OBSERVED desk_01_welcome.png, desk_03z_charcard_nums.png]. |
| Personal dream goal | **missing** | Nothing in code [CODE: no `dream`/`חלום` goal in js/]. |

### §10 Living city and visual identity
| Item | Status | Evidence |
|---|---|---|
| World distinction | exists | Per-world card art, sky theme and board [OBSERVED ph390_L_home_guest_p0.png; CODE ui.js:141 applyTheme]. |
| Typography hierarchy | needs improvement | Secular One titles + Rubik body work. But 39×12px, 16×11px and 3×10px declarations, and HUD labels are 11 px [CODE css; OBSERVED audit tiny<12px]. In the title font the ₪ glyph renders as "שח" [OBSERVED ph390_10z_title_bidi.png]. |
| RTL with ₪ $ % | **exists (good)** | `iso()`/`<bdi>`/`.num{direction:ltr;unicode-bidi:isolate}` [CODE ui.js:11, lobby.js:22-24, game.css:47]. The scanner found **0** misplaced signs on 12 rendered screens (home, char select, w1 deal/payday/business/doodad/trade, w2 bank/deal, w3 fx/deal/shipping) [OBSERVED bidi_scan.json]. |
| Consistent icons | needs improvement | Emoji (🎂🔋🙂🏦🛒🛟💼📅) are mixed with the SVG `ICON` set. Emoji rendering is platform-dependent; 📅 shows English "July 17" [OBSERVED ph390_01z_welcome_icons.png]. |
| Colour not the only cue | **needs improvement** | Earned and unearned stars are the same ★ glyph, told apart by colour only. Earned gold #f2b632 is 1.75:1 on paper [CODE lobby.css:65-66]. The deal recommendation is a gold button with no text label (life events do have "הבחירה של המנטור") [OBSERVED desk_06_card_deal.png; CODE ui.js:599-601 vs 638-641]. ± money uses sign + colour (good). |
| Character visual identity | needs improvement | Emoji icon only in select. In game, no character portrait; the pawn is chosen separately [OBSERVED]. |
| Short animations | exists | Card pop, dice, hops, coins, building drop [CODE scene.js:912-922]. Roll→card took 7.6 s on phone and 17.5 s on desktop (headless). |
| Feedback: purchase / progress / unlock / achievement | exists but **collides** | Building drops with a float label; achievement, lesson, rumor and verdict toasts. On phone up to 4 overlays stacked on one coach bubble [OBSERVED ph390_07_verdict.png, ph390_06_card_deal.png]. |
| Reduced motion | **partial** | CSS covers DOM animations [CODE game.css:376-380, lobby.css:513]. `scene.js` never reads `prefers-reduced-motion`: dice throw, hops, camera shake on loss cards and confetti stay on [CODE scene.js:39 only matchMedia(pointer)]. The life-story typewriter also ignores it [CODE ui.js:1088-1091]. |
| Mute | exists | `#muteBtn` with `aria-pressed`; lobby toggle uses `role=switch` [CODE index.html:33, lobby.js:388-404]. |
| Owned assets shown in world | exists | `cityModels()` → central city grid [CODE engine.js:593-603; OBSERVED desk_card_business_business.png]. |
| Business growth stages | **missing** | One model per asset kind, with no stage or upgrade visual [CODE engine.js:595, scene.js:912]. |
| Inspect asset via world | **missing** | No raycaster or pointer picking in `scene.js` [CODE]. Asset info exists only in the sheet text. |
| Turbo respected | exists | `D()`/`pause()` scale durations [CODE game.js:26-27, scene.js setSpeed]. Turbo is offered only after the 2nd game [CODE game.js:323]. Lobby end-screen sequencing ignores turbo [CODE lobby.js:1504-1516]. |

### §16 End summary
| Item | Status | Evidence |
|---|---|---|
| Result + stars + near-miss line | exists | [OBSERVED desk_E_win.png, ph390_E_win_p0.png] |
| Core stats (months, passive, expenses, net worth) | exists | same |
| Decision quality vs luck, strongest / weakest principle, "decision to rethink" | exists | [OBSERVED ph390_E_win_text.txt] |
| Life story (age, real net worth, free time, family, happiness, pension) + top 3 decisions + mentor quote | exists | [OBSERVED ph390_E_win_p1.png] |
| Loss: leak breakdown, biggest leak, % of the way | exists | [OBSERVED ph390_E_lose_p0.png] |
| Library growth, self-control, achievements, world lesson, next tip | exists | [OBSERVED ph390_E_win_p2.png] |
| Net-worth / cash-flow timeline chart | **missing** | No chart is rendered on the end screen [OBSERVED]. `ui.spark()` exists for the sheet [CODE ui.js:323]. |
| Return to a decision point | **missing** | Only "same board" / new board [OBSERVED]. T6 scope. |
| Length / scannability | **needs improvement** | Phone: 370–384 words, 2151–2264 px tall (2.5–2.7 screens). Primary CTA is sticky (good) [OBSERVED]. |
| Pre-summary story overlay | needs improvement | Auto-closes after max(4.2 s, 1.6 s + 45 ms/char). Focus does not move to its button [CODE ui.js:1093-1096]. |

### §18 Mobile and accessibility
| Item | Status | Evidence |
|---|---|---|
| Keyboard play | exists | Space/Enter roll, focus moves to the card's primary button and back to Roll [CODE game.js:166-174, ui.js:569-571]. Visible 3 px blue focus ring [OBSERVED]. |
| Modal focus trap | **missing** | Event card, `#gm` modal, sheet and lobby overlay: Tab leaves the dialog into the HUD/sheet behind it [OBSERVED Tab walks §2.5]. |
| Background inert under overlays | **missing** | On the welcome screen, Tab #1 lands on `#homeBtn` behind the lobby [OBSERVED]. |
| Modal initial focus / restore | exists | [CODE ui.js:108-113] |
| Accessible names on icon-only buttons | exists | home/turbo/mute/cam/voice all have `aria-label` [OBSERVED audit iconOnly]. |
| Life chips' names | needs improvement | Accessible name is the emoji + number ("🎂 31"); `title` is ignored because the button has content [CODE ui.js:252-258]. |
| Contrast | **needs improvement** | Light `--green` #178a55 is 4.20 on paper, 3.79 on #f6eedd and 3.47 on #efe4cd. `--red` is 4.13/3.78 on the surfaces. `--gold2` #c98a12 is 2.83. Title badge white on #8a8396 is 3.64 [OBSERVED computed]. Dark theme passes except empty stars (1.80). |
| Touch targets | **needs improvement** | Phone: life chips 30 px tall (6), turbo/mute/cam 40×46, voice 36×36, sheet 93×36, "› למפה" 71×36, mission CTA 67×40, "תראה לי את החישוב" 140×36, group chips 36 px [OBSERVED audit]. |
| Text zoom | needs improvement | Every font size is in px (123 in game.css, 179 in lobby.css). Pinch zoom is allowed (no `user-scalable=no`) [CODE index.html:5]. OS text scaling not tested. |
| Canvas-only info alternatives | partial | Canvas has `aria-label`, and dice/mentor have live regions [CODE index.html:20,46-51]. Pawn tile and city assets have no text equivalent except the sheet. |
| Offline behaviour | exists | A new guest plays fully with the backend blocked. A returning player sees "אין חיבור לשרת…" + retry in the daily/groups sections [OBSERVED ph390_F_offline_home.png]. |

---

## 2. Measurements

### 2.1 Time and clicks to the first meaningful decision (new player) [OBSERVED]
| Step | Phone 390 (`ph390_log.json`) | Desktop 1300 (`desk_log.json`) |
|---|---|---|
| Load → welcome visible | 7.8 s | 17.4 s |
| Click 1 "יאללה, מתחילים" → w1 character select (welcome-go skips the map for new players [CODE lobby.js:1643]) | 9.9 s | 20.1 s |
| Click 2 character → game; roll enabled | 12.8 s | 27.8 s |
| Coach "מטילים קובייה" appears; click 3 "הבנתי" | 14.4 s | 29.9 s |
| Click 4 roll → first card = **deal "עגלת הקפה של השכן"** | 23.2 s | 51.6 s |

- **Total:** 4 clicks and 4 screens (welcome → char select → game + coach → deal).
- **Reading load before the first roll:** welcome 101 words + char select 202 words.
- [HYPOTHESIS] A first-time teen reader who reads it will take ~60–120 s. A skimmer will take ~30 s.
- The 2nd decision, the monthly plan, sits below the fold on the payday card:
  - desktop: card scrollHeight 1036–1094 vs 664 visible;
  - the plan tiles start at y≈640/820 [OBSERVED desk_06_card_payday.png].

### 2.2 First decision sends a contradictory message [OBSERVED + CODE]
- **The tutorial's first scripted deal:**
  - The mentor bubble says "עסקה ראשונה: ₪5,000 שמכניסים ₪450… כמה חודשים עד שהכסף חוזר?".
  - But the **gold primary button is "לוותר"**.
  - Buying is scored **0/100 "החלטה מסוכנת · השאיר אותך בלי כרית"** [OBSERVED ph390_07_verdict.png, desk_06_card_deal.png].
  - The engine marks `pass` primary when the cushion after buying is < 0.5 month [CODE engine.js:1537-1546].
  - The tutorial gives exactly ₪5,000 cash for a ₪5,000 deal.
- **Engine probe** (`/tmp/ux-node/primcheck.mjs`: 4 worlds × all characters × 12 seeds, always clicking the gold option):
  - **269 of 2,030 (13%) recommended deal choices scored < 50** in the verdict that follows.
  - Two failure modes: `buy` → "השאיר אותך בלי כרית"; `pass` → "היה עדיף: להציע 5% פחות".
  - The highlighted button and the verdict disagree.

### 2.3 Text density [OBSERVED audit `words`]
| Screen | Words |
|---|---|
| Welcome | 101 (4 bullets; one explains ⚡ energy, 25 rolls, 6-min refill) |
| Char select | 202 |
| Home (guest) | 201 |
| Home (player) | 277 |
| First game screen, desktop with sheet | 431 |
| First game screen, phone | 73 |
| Deal card | 98–132 |
| Payday card | 146–153 |
| Business card | 121 |
| End screen (phone) | 370–384 |
| Profile | 527 |

**Card overflow (scrollHeight/clientHeight):**
- desktop: deal 736/664–825/664, payday 1094/664, business 734/664, doodad 736/664;
- phone: deal 732/706, w3 deal 967/706.

The primary action stays pinned at the bottom (good).

### 2.4 Touch targets < 44 px [OBSERVED ph390_audit_*.json]
| Element | Size (px) |
|---|---|
| HUD life chips `.lc` (age/energy/happy/credit/cpi/plan) | 44–88 × **30** |
| `#turboBtn` `#muteBtn` `#camBtn` | 40×46 |
| `#voiceBtn` | **36×36** |
| `#sheetBtn` | 93×36 |
| Lobby back chip "› למפה" / "› ללובי" | 67–71×36 |
| `.lb-mini-player` | 136–142×40 |
| `.lb-mission-go` "יאללה" | 67×40 |
| Card chip "תראה לי את החישוב" (the tutorial's ROI target) | 140×36 |
| Group "↻ רענון", "📲 לשתף", profile "✏️ שינוי כינוי" | ×36 |

All of these pass WCAG 2.2 AA 2.5.8 (24 px) but fail the 44 px platform target.

### 2.5 Keyboard / focus [OBSERVED Tab walks]
**Event card** (`role=dialog aria-modal=true`). With focus on the card's primary button, Tab goes:
1. BODY
2. `#homeBtn`
3. 7 life chips
4. turbo / mute / cam / voice
5. `#sheetBtn`
6. only then the card's own buttons ("אבא עשיר אומר", "תראה לי את החישוב", the negotiation chips)

So it is **not trapped**. Escape does not close it (by design; a decision is required).

**`#gm` index modal (`dismissable:true`).**
- Tab: "ביטול" → BODY → HUD.
- After focus left the modal, Escape did **not** close it, because `onkeydown` is bound to `#gm` [CODE ui.js:122].

**Sheet (phone).** Tab leaves the sheet into the HUD/roll.

**Lobby overlay.**
- Welcome has no initial focus [CODE lobby.js:543-558].
- Tab #1 → `#homeBtn` → turbo → mute → cam: game controls hidden behind the overlay.

**End screen.** Tab passes through HUD life chips and `#sheetBtn` before reaching "📸 לשמור כתמונה".

**Life-story overlay.** It is not focused and it auto-dismisses [CODE ui.js:1084-1096].

**Focus style.** 3 px solid #2f6fdb outline on all tested controls (good).

### 2.6 Contrast (computed, light theme) [OBSERVED]
| Token | on paper #fffaf0 | on #f6eedd | on #efe4cd | Where it shows |
|---|---|---|---|---|
| `--green` #178a55 | 4.20 ✗ | 3.79 ✗ | 3.47 ✗ | "+₪1,700" on char cards, net payslip, "+₪450 בחודש", negotiation "סיכוי" |
| `--red` #d23b30 | 4.58 | 4.13 ✗ | 3.78 ✗ | payslip deductions, "סיכוי 30%" |
| `--gold2` #c98a12 | 2.83 ✗ | 2.55 ✗ | 2.34 ✗ | "המשימה הבאה", "הדרכה 1/3", "0/75", leaderboard ranks |
| #a86b00 (star thresholds) | 4.23 ✗ | 3.82 ✗ | – | "★ עד 52" |
| Empty star #dccfb5 | 1.48 | 1.33 | – | all star rows (non-text, needs 3:1) |
| Earned star #f2b632 | 1.75 | 1.58 | – | same |

Also failing:
- white on title badge #8a8396 = 3.64 (11 px "עכבר");
- white on tag #1f9d63 = 3.46 ("הזדמנות · עסק").

Passing: `--ink`, `--mut` on paper (5.43), gold buttons (#2b1d00 on #f2b632 = 9.0).

Dark theme: all tokens ≥ 5.7 except empty stars (1.80) [OBSERVED desk_G_dark_home.png].

### 2.7 RTL / bidi [OBSERVED]
- **Scanner result:** 0 misplaced signs. The method proved that raw strings like `"מס הכנסה −₪826"` *would* render the sign on the wrong side; the app consistently isolates them, so this is a strength to preserve.
- **Title font:** the Secular One ₪ glyph looks like "שח" in titles ("MOON נסחר ב־1שח") [ph390_10z_title_bidi.png].
- **English in a Hebrew UI:** the library shows the category heading **"business 0/14"** in English. `CAT_HE` lacks `business` [CODE lobby.js:560; finance/business.js:157-167; OBSERVED ph390_L_library_p3.png].
- **Gender:** the group feed renders "דנה **יצא** מהמירוץ" (masculine for every player) [OBSERVED ph390_L_group_p0.png].

---

## 3. Findings by area

### 3.1 First entry and onboarding

**[OBSERVED desk_01_welcome.png, ph390_01_welcome.png] Welcome is one card: hero art, tagline and 4 bullets.**
- Warm and on-brand.
- It spends 25% of its text on ⚡ energy limits before any fun.
- At 390 px the emoji icons collide with the bullet headings [ph390_01z_welcome_icons.png].

**[OBSERVED ph390_05_coach1.png] Coach 1 ("מטילים קובייה").** It spotlights Roll with a dimmed backdrop. Good. It says "לחץ… (או על רווח)", which is a desktop hint shown on phone.

**[OBSERVED ph390_06_card_deal.png] Coach 2 (ROI) on phone.** It covers the mentor line and the card header. A "🎲 דאבל! שמעת שמועה…" toast sits on top of the coach text.

**[OBSERVED desk_06_card_deal.png] On desktop the ROI ring is drawn ~40 px below its target.** It circles "יש לך ₪5,000 במזומן", not the button. The likely cause is that the position is computed before the card's pop animation / `scrollIntoView` settles [HYPOTHESIS; CODE ui.js:504-527].

**[OBSERVED ph390_07_verdict.png] After the first buy, four layers stack at once on the phone:**
- achievement toast "הנכס הראשון";
- coach 3/3 "מד החופש";
- lesson toast "שיעור חדש בספרייה";
- verdict badge "0 · החלטה מסוכנת".

The coach title is unreadable.

**[CODE lobby.js:256-261] Tutorial lifetime.** The tutorial is consumed on launch. A player who closes the tab in the first minute never sees it again, and there is no "show tutorial again".

### 3.2 Lobby and world map

**[OBSERVED ph390_L_home_guest_p0.png] Guest home.** Mission banner, a map of 4 world cards (3 locked, each with a "how to unlock" line and a "taste via daily" line), the time machine and the library. Clear progression.
- "★ ראשון: לצאת תוך 52 חודשים" sits under w1.
- The gold kicker text fails contrast.

**[OBSERVED ph390_B_home_player.png] Player home on phone.** The daily challenge (hero image, streak, CTA, leaderboard) is placed **before** the map. On phone the map starts below the fold for a registered player.

**[OBSERVED ph390_L_group_p0.png] Group.** Challenges with board, feed, invite code, WhatsApp share and copy link. Good. The feed uses masculine verbs for everyone.

**[OBSERVED ph390_L_history_p0.png] Time machine.** Strong art and copy, one CTA per scenario.

**[OBSERVED ph390_L_library_p3.png] Library.**
- 75 lessons in 9 sections; every locked card reads "שיעור נעול" with a "?", so 75 identical tiles.
- The last section is titled "business" in English.

**[OBSERVED ph390_L_profile_p3.png] Achievements.** 40 tiles; locked ones are greyed and tagged with their world. Readable.

### 3.3 Character select (§7)

**[OBSERVED desk_03_world_chars.png, ph390_03_world_chars.png]** Each card has icon, name, difficulty (dots + קל/בינוני/קשה), a one-line story and a 4-number grid with "נשאר בחודש" in green. Good.

Gaps:
- No explicit "strength / weakness" pair. It is implied in the prose ("מעט מזומן בהתחלה וחוב אשראי").
- 5 star conditions per card.
- On phone only 1¼ cards are visible per screen, so comparison means scrolling.
- The `pawn` is not tied to the character [CODE lobby.js:229 pawn from progress].

### 3.4 Game screen and cards

**HUD on phone** [OBSERVED ph390_04b_rolling.png, ph360_04_game_hud.png]:
- Row 1: home, cash, cash flow, month, tools.
- Row 2: world, freedom meter.
- Row 3: 7 emoji chips; the plan chip is truncated ("עבודה ר…" at 360).
- The meter label is 11 px.
- A new player meets 🎂 26, 🔋 70, 🙂 60, 🏦 680, 🛒 2.2%, 🛟 0 with no legend until each is tapped.

**Payday / monthly plan** [OBSERVED desk_card_payday_payday_bottom.png]. Five plan tiles with effect chips (₪/month, 😊, 🔋), a "התוכנית שלך" tag and a "מתאים לכוח שלך עכשיו" recommendation. Good information design, but it sits under a 9-row payslip.

**Deal** [OBSERVED desk_card_deal_deal.png]. Price / down payment / net cash flow block, an ROI explainer, a reality disclaimer, negotiation chips with probability bars, and a buy/pass footer.

**Business** [OBSERVED desk_card_business_business.png]. Capital, 3-month revenue, gross margin, expected net, breakeven line, and "you work in it vs manager" explained.

**Life event** [OBSERVED desk_card_life_life.png]. Choice cards with 😊/🔋 chips and a "החלטה אישית — אין כאן תשובה נכונה אחת" tag. The best card pattern in the game.

**Bank (w2)** [OBSERVED ph390_w2_card_bank_bank.png]. Rate 3% → 2.25% big-number change, fixed vs variable with fee. Disabled action shows the reason "אין מספיק מזומן" (good).

**FX deal (w3)** [OBSERVED ph390_w3_card_deal_deal.png]. A three-scenario "השווי צמוד לדולר" strip. Clear.

**Doodad** [OBSERVED desk_card_doodad_doodad.png]. "פיתוי — מותר לוותר" tag, 3 payment modes with interest. Clear.

**Verdict pill** [OBSERVED desk_verdict_after_deal.png]. Score circle + "החלטה חזקה · תזרים" + why. It sits mid-board; it is good feedback but transient.

**Life-chip popover** [OBSERVED ph390_H_chip_happy.png]. "אושר 60/100. ל־★★★ צריך…" in a full modal with one "סגירה" button.

**Emergency fund** [OBSERVED ph390_H_savings_modal.png]. Number input "עד ₪3,500", and the copy explains "כסף בקרן לא משמש לקניות". OK.

**Index fund** [OBSERVED audit D_index_modal]. Signed quantity input "(+ קנייה, − מכירה)" is an error-prone pattern on mobile numeric keypads [HYPOTHESIS].

**Happiness/burnout indicators.** Shown as 🙂/🔋 chips. The energy chip has a bar + number + colour (warn/neg) [CODE ui.js:250-252].

**Not observed:** a burnout card (it needs low energy over several turns).

### 3.5 End and save/resume

**Win** [OBSERVED ph390_E_win_p0..p2.png]. Rich and well ordered:
1. result;
2. stars;
3. near-miss line;
4. 4 stats;
5. decisions vs luck;
6. life story;
7. top decisions;
8. mentor quote;
9. library / self-control / achievements;
10. world lesson + tip;
11. sticky "עוד פעם" + "לאתגר חבר".

**Lose** [OBSERVED ph390_E_lose_p0.png]. "פשטת רגל", an advice box, "עשית 5% מהדרך לחופש" and a leaks bar chart. Empathetic and actionable.

**Resume** [OBSERVED ph390_w2_resume_offer.png]:
- The world view offers "▶ להמשיך מאיפה שעצרת · <char> · חודש N" above "או משחק חדש — בחר דמות".
- Home shows "▶ שמור · חודש N" on the map card [CODE lobby.js:701-705].
- Resuming mid-event reopens the pending card [OBSERVED cards.py runs].
- Starting a new game over a save asks for confirmation [CODE lobby.js:248-251].

---

## 4. Top-15 UX problems, prioritized, with fixes that extend the current design

**1. The first decision teaches the opposite of the tutorial.** The gold "לוותר", a 0/100 "risky" verdict for buying the tutorial's own easy deal, and 13% of gold options scoring < 50 [§2.2].
- **Fix (engine + ui):**
  - Give the tutorial a ½–1-month cushion. For example, start cash = deal down + 0.5×expenses, or make the first deal ₪3,000.
  - Make the verdict use the same cushion rule as `primary`, so they agree.
  - Label the highlighted deal option with a small tag reusing the life-card pattern: `<small class="tagc rec">ההמלצה של אבא עשיר</small>`.

**2. Overlays pile up.** Coach, achievement, lesson, rumor and verdict appear together on phone [ph390_07_verdict.png].
- **Fix:** one queue in `ui.js` with priority coach > card > achievement > lesson > verdict, and at most one overlay above the board at a time. While a coach bubble is open, hold toasts and badges, then release them one by one (each ≤ 1.3 s × speed).

**3. No focus containment in dialogs, and a live background.** Event card, `#gm`, sheet, lobby, story [§2.5].
- **Fix:**
  - Set `inert` on `#hud,#bar,#sheet,#c` while `#evm`, `#gm`, `#start` or `#story` is open.
  - Add a tiny Tab-wrap helper in `modal()`/`openEvent()`.
  - Bind Escape on `document` for dismissable modals.
  - Focus `[data-act=welcome-go]` and `#stGo` on open.

**4. Tutorial can't be reopened, and it is consumed on launch.**
- **Fix:**
  - Mark `tutorialDone` only after coach 3/3 or game end.
  - Add a "❓ איך משחקים" chip to the HUD tools and to the profile settings that replays the 3 coach marks plus the world's 2 marks (the `WORLD_COACH` data already exists).
  - Make the welcome card reopenable from the profile.

**5. Everything is visible at turn 1.** 7 life chips, energy and the full desktop payslip.
- **Fix:** gradual reveal keyed to `S.month` / tutorial step. Show cash, cash flow, month and freedom meter first. Introduce each chip with a one-line coach the first time it changes: 🔋 at first plan, 😊 at first life event, 🛟 at first crisis, 🏦 at first loan. Collapse the desktop payslip to "נטו ₪9,005 ▾" until the first payday.

**6. Monthly plan (the core time decision) is below the fold.**
- **Fix:** on payday cards render the plan tiles first. Collapse the payslip to a single "נכנס לכיס +₪2,155 · פירוט ▾" row (a `<details>` like the sheet's payslip).

**7. Contrast of semantic colours on cream surfaces.**
- **Fix:** keep the hues, darken the light-mode values:
  - `--green` → #13744a (≈5.0 on #f6eedd);
  - `--red` → #b8322a;
  - text uses of `--gold2` → #8a5a00 (keep #c98a12 for fills and borders);
  - title badge t0 bg → #6f687c.

  This only touches the `light-dark()` light side; dark theme is already fine.

**8. Stars are colour-only and low-contrast.**
- **Fix:** unearned = outline ☆ (or a 1.5 px stroke) in `--mut`; earned = filled ★ with the existing gold + #8a5a00 stroke. `starStr()` already uses ☆ for boards [CODE lobby.js:74]; apply the same in `starsHtml`.

**9. Too many star conditions up front.**
- **Fix:** char cards show a single line "🎯 לצאת תוך 52 חודשים" plus difficulty. Move ★★/★★★ + 😊 + 🐷 into a "⭐ איך מקבלים 3 כוכבים" disclosure, auto-opened after the first ★ in that world. Drop the ★★★ bullet from the welcome card.

**10. Touch targets.**
- **Fix:**
  - life chips: `min-height:44px` on phone (they are already pill-shaped, so just more padding);
  - turbo/mute/cam: 44×44;
  - voice: 44;
  - lobby back chip and card chips: 44 min-height;
  - mission CTA: ≥44.

  The second HUD row can wrap or scroll horizontally on ≤360 px instead of truncating the plan chip.

**11. Life chips lack names.**
- **Fix:** `aria-label="גיל 31"`, `"כוח 70 מתוך 100"`, etc. Show a visible 9–10 px caption under each chip during the reveal phase (#5), then hide it after the player has tapped it once.

**12. Character select lacks identity, strength and weakness, and a dream.**
- **Fix:**
  - Add a "💪 חוזקה / ⚠️ חולשה" pair per character (data lives in `worlds/*.js`).
  - Add a portrait. The pawn could wear the character colour, or the card could reuse the existing emoji at 48 px on a tinted circle.
  - Add a one-tap "החלום שלי" step after picking (3–4 illustrated dreams, e.g. 🏖️ שנה בחו״ל / 🏡 בית / 🚀 עסק משלי), stored in the save. It is shown next to the freedom meter and as the end-screen headline ("בגיל 36 יצאת — והחלום: 🏡").

**13. City is decorative only.** No inspect, no growth stages.
- **Fix:**
  - Add a raycast tap on a city model → the same `#gm` modal used for life chips, with name, cash flow, value and a "למכור" shortcut where allowed.
  - Add an `a.level` / business stage → scale + a small badge sprite (1–3 stars or floors). The `bump()` + `sparkle()` juice already exists [CODE scene.js:951-955].
  - Text alternative: a "🏙️ הנכסים שלי" list in the sheet (already partly there).

**14. Reduced motion is ignored in 3D, and the story overlay is timed.**
- **Fix:**
  - In `scene.js` read `matchMedia('(prefers-reduced-motion: reduce)')`: skip `shake()` and confetti, set dice throw to a short fade, and reduce hops to a single glide.
  - In `lifeStory()`, if reduced motion is set or a key is pressed, show the text instantly and don't auto-close.
  - Offer a turbo toast at game 1 for returning players instead of after game 2.

**15. Small polish items:**
- the English "business" category: add `business: '🏪 עסקים'` to `CAT_HE`;
- the masculine feed verb: use `genderize()` or a neutral form, e.g. "דנה — יצאה/יצא" → "🎉 דנה: מחוץ למירוץ";
- desktop coach ring offset: re-run `place()` after `animationend` of `.card.pop`;
- the ₪ glyph in Secular One titles: wrap money in titles with `.num` using Rubik;
- the welcome icon overlap at 390 px: give the icon column a fixed 32 px width;
- 75 identical locked library tiles: show the title blurred, or group them as "🔒 עוד 14 שיעורים" per section.

---

## 5. Strengths to keep
- Warm palette, chunky gold CTAs, illustrated world cards and a consistent card grammar (kicker tag → title → numbers block → reasons → pinned actions).
- RTL number handling is systematic and correct on every screen scanned.
- Disabled actions always show *why* (`.why` / `aria-describedby`) [CODE ui.js:601].
- Life-event "no single right answer" framing, effect chips (₪/😊/🔋) and negotiation probability bars.
- The end screen separates decision quality from luck, and the loss screen is constructive.
- Offline: free play works with the backend blocked, and server sections fail with a retry.
- Visible focus ring; aria-labels on all icon-only tool buttons; live regions for mentor and dice.

## 6. Screenshot index (all in `/tmp/research-ux/`)

| Area | Files |
|---|---|
| Onboarding | `desk_01_welcome.png`, `ph390_01_welcome.png`, `ph390_01z_welcome_icons.png`, `tab820_01_welcome.png`, `ph360_01_welcome.png` |
| Character select | `desk_03_world_chars.png`, `desk_03z_charcard_nums.png`, `ph390_03_world_chars.png`, `tab820_03_world_chars.png`, `ph360_03_world_chars.png` |
| Game start / coach | `desk_04_game_start.png`, `desk_05_coach1.png`, `desk_05_coach2.png`, `ph390_05_coach1.png`, `ph390_05_coach2.png`, `ph360_04_game_hud.png`, `tab820_04_game_hud.png` |
| First deal / verdict | `desk_06_card_deal.png`, `desk_06_card_deal_roi.png`, `ph390_06_card_deal.png`, `ph390_07_verdict.png`, `tab820_06_first_card.png`, `ph360_06_first_card.png`, `desk_verdict_after_deal.png` |
| Cards | `desk_card_{payday,deal,business,life,market,doodad,mystery,crisis}_*.png`, `ph390_w2_card_bank_bank.png`, `ph390_w2_card_deal_deal.png`, `ph390_w3_card_fx_fx.png`, `ph390_w3_card_deal_deal.png`, `ph390_10_after_turns.png` (crypto trade) |
| Sheet / loans / fund / chips | `ph390_08_sheet.png`, `ph390_H_sheet_actions.png`, `ph390_H_savings_modal.png`, `ph390_H_chip_{energy,happy,credit,age}.png`, `desk_G_dark_happy_popover.png` |
| Lobby | `ph390_L_home_guest_p*.png`, `ph390_L_home_player_p*.png`, `ph390_B_home_player.png`, `ph390_L_group_p*.png`, `ph390_L_library_p*.png`, `ph390_L_history_p*.png`, `ph390_L_profile_p*.png`, `ph390_C_world_locked.png`, `ph390_F_offline_home.png` |
| End | `desk_E_win.png`, `desk_E_win_story.png`, `ph390_E_win_p0-2.png`, `ph390_E_lose_p0-2.png` (+ `_text.txt`) |
| Dark | `desk_G_dark_home.png`, `desk_G_dark_game.png` |
| Raw data | `*_audit_*.json`, `misc_results.json`, `bidi_scan.json`, `*_log.json` |
