# T3 "Stories & business": independent verification

- **Verified commit:** HEAD `03c9fc8` on `feat/rat-race-next-level`. I worked on a clean export: `git archive HEAD | tar -x -C /tmp/v3/wt`. Uncommitted edits in the shared tree are **not** covered.
- **Engine pin:** `node tools/build-edge.mjs --check` ✓ (`7f15b7600824…`).
- **Browser setup:** `SRC=/tmp/v3/wt COPY_DIR=/tmp/v3 PORT_BASE=8920 bash tests/serve_copies.sh` (copies on :8920–8922).
  - Every browser context used the `fakebackend` Supabase guard, and `assert_clean` came back clean every time.
  - No production, no network writes.
- **Scope of my changes:** none to code, none to git. I created only this file.
- **Where things are:**
  - probes: `/tmp/v3/probes/*.mjs`;
  - browser scripts: `/tmp/v3/browser/*.py`;
  - logs: `/tmp/v3/logs/`;
  - screenshots: `/tmp/v3/shots/`;
  - mutation copy: `/tmp/v3/mut`;
  - sim copy: `/tmp/v3/sim`.
- **Box:** 2 shared cores. Everything ran one at a time; the only exception was the 300-game probe, which ran alongside light single-core probes.

## Verdict

**The engine core of T3 is solid.** Over 2,400 games of 300 per world:

- replay is byte-identical, with 11,065 `Q` resolutions and 20,412 expiries;
- C1, C2 and C4 had 0 violations;
- the pacing caps were never broken;
- the streams are identical with stories on and off (1,200 seeds);
- the "why" bridges are exact over 48,158 business months.

**Review fixes:**

- **Fixed and confirmed by my own probes:** M1, M3, M4, M5, M7 (the highlights), M8 and M9.
- **Partly fixed:** M2 and M6.

**Open defects:** I found **3 major** and 7 minor defects plus several nits, none of which the suites catch:

- **D1:** the "זוכר?" memory line always says **"חסכת ₪0"** after the bus and periphery choices.
- **D2:** every business decision result shows a **"🏪 undefined:"** toast.
- **D3:** about 1 in 4 monthly business "why" sentences is still wrong or misleading (residue of M6).

**Criteria (§12, 30):**

| PASS | PARTIAL | FAIL | NOT VERIFIED |
|---|---|---|---|
| 26 | 1 (25) | 2 (16: the chain-item median; 30: gender) | 1 (28) |

**UI criteria (UI-1…UI-10):**

| PASS | PARTIAL |
|---|---|
| 7 | 3 (UI-4, UI-7, UI-9) |

---------------------------------------------------------------------------------------------------

## 1. Suites (clean export, run one after another)

| command | result | time |
|---|---|---|
| `node tests/t3.test.mjs` (= `stories.test.mjs`) | **40/40** pass | 3 m 44 s |
| `node tests/business.test.mjs` | **104/104** pass | 0.1 s |
| `node tests/verify.test.mjs` | **10/10** pass | 47 s |
| `node tests/determinism.test.mjs` | **2/2** pass; the static scan covers 27 modules, `systems/chains.js` included | 2 m 16 s |
| `node tests/engine.test.mjs 300` (300 per world) | **52/52** pass: 856 games (122 won, 413 lost, 321 bankrupt), 35/40 achievements | 9 m 59 s |
| `node tools/build-edge.mjs --check` | ✓ pin current | — |
| `python3 tests/game_e2e.py --t3 --nov32 --noplay --base=http://localhost:8920/index.html --shots=/tmp/v3/shots --prefix=e2e_` | **pass**, 0 console errors | 2 m 26 s |
| the same with `--phone` (390×844) | **pass**, 0 console errors | 1 m 20 s |
| `node tools/sim.mjs --stories 100 wX`, run in `/tmp/v3/sim` for w1…w4 (300 core games per world + 200 side/owner) | see §3, M8 | 69–92 s per world |

## 2. Wider probes (300 per world where the spec asks for it)

| probe | what it checks | result |
|---|---|---|
| `big300.mjs 300` | 300 games per world that resolve items through `Q` + 300 that let them expire (2,400 games, mixed modes and mentor levels, `random-player` `{v4, stories}`); it wraps `landing`, `choose`, `resolveStory` and `inbox` | **0** replay mismatches (§12.4).<br>**0** "תיקון לרכב" doodads and **0** car s1 cards while `noCar` (358 bus games) (§12.8).<br>**0** mortgage changes from life or story actions, and **0** "בעל הבית" for homeowners (1,800 games with a mortgage) (§12.9).<br>**0** cases of `L.friend` alongside the chain (§12.11).<br>Never more than 3 open items, never more than 2 open chains (§12.16).<br>Story draws = 2 × paydays in every game (§12.3). |
| `streams300.mjs` | stories on vs `__storiesOff`, 300 seeds × 4 worlds, 100 rolls each | 1,200 games, 119,253 rolls compared, **0** differences (§12.2) |
| `bridges300.mjs` | 5 types × 3 setups × 100 lifetimes × 36 months, with random decisions | 48,158 months:<br>• **0** profit or cash bridge failures;<br>• 0 non-integers;<br>• 0 stage jumps of more than 1 (§12.21, §12.25). |
| `m6_sentence.mjs` / `m6_calm.mjs` | the business "why" sentence in real engine games, 48 games of up to 160 months each | 4,673 months with random decisions + 6,443 months with default decisions. Results in M6 / D3. |
| `ui9.mjs` | `bizPulse` and `bizStage` effects | 331 pulses. The only "double" pulses came from rolls that crossed 2 paydays, so there is at most 1 per business per payday.<br>35 stage changes.<br>`cityModels()` has **no** `stage` (D8). |

## 3. Review majors, re-checked with my own probes

| # | verdict | evidence (probe → numbers) |
|---|---|---|
| **M1** pay-cut math | **FIXED** (minor residue D7) | `m1_paycut.mjs` runs the real path in w1, w2, w3 and w4: side s3 `partTime`, then crisis `job` → `accept`, then s4 graduation.<br>• Gross goes base → ×0.6 → **×0.54** in every world. In w2: 21,390 → 12,830 → 11,550.<br>• The accept chip equals the applied change: −792/−792, −542/−534, −1,156/−1,156, −638/−645 (the gaps are r10 rounding).<br>• After graduation only the `crisis` cut remains.<br>• Residue: a *permanent* raise chip (promo `accept`) is computed from the uncut base while a cut is active: chip +1,631 vs real +1,469 in w2 (D7). |
| **M2** friend gender | **PARTIAL** (D5) | `dump_texts.mjs f\|m` renders every step of every chain for both genders, and the friend steps for runs 1 and 2. Run 2 is now דני, and every friend text agrees with a male friend.<br>But the run-2 memory line reads **"זוכר מה קרה עם יוסי? הפעם זו דני."**: the feminine "זו" with a male name (`engine.js:3602`).<br>For a female *player*, f1 keeps the masculine "שתחתום לו ערבות" (D4).<br>The new M2 lint would not catch either of these. |
| **M3** tax report scoring | **FIXED** | `m3_side.mjs`:<br>• (a) 78 cases (every character × side months 1/4/9 × guide/hint): U(file) > U(later) in **78/78**, and the guide highlights `file` in every case.<br>• (b) Real play: same seed, file vs later, then 24 identical months. Net worth is better with `file` in **21/24** games and equal in 3 (the side plan ended). |
| **M4** burnout odds | **FIXED** | `m4_burn.mjs`:<br>• (a) 240 states (4 worlds × 5 plans × 6 energies × workLoad 0/1): the card hint, the HUD `burnoutRisk` and the evaluator flag agree in **240/240**.<br>• (b) Monte Carlo over 1,500 real paydays: the mean shown odds were **30.1 %** and the realised rate **31.6 %**. By band: 0 → 0.00, 0.3 → 0.35, 0.5 → 0.51, 0.7 → 0.74. |
| **M5** big-order cash chip | **FIXED** | `m5_order.mjs` covers 4 worlds × cash ₪200 / ₪5,000 / ₪100,000 × late and on time.<br>• The chip's cash equals the real Δcash (net of the loan) in **24/24**, e.g. w2: −12,600 / −12,600.<br>• The loan warning equals the loan taken (13,000 / 13,000; 0 when the cash covers it).<br>• The payment arrives at +1, or +2 when late. The card says "במשחק: 1 מכל 5 … באיחור". |
| **M6** business sentence (scan over more than 200 months) | **PARTIAL** (D3) | **Fixed:**<br>• glued "אבלהקופה": **0** of 11,116 sentences;<br>• broken spacing: **0**;<br>• "חוב אבוד" months called a collection: **0**;<br>• reasons are noun phrases.<br>**Still wrong**, counted on the 6,443-month run with default decisions:<br>• "הקופה עלתה ב־₪0" in **1,039 (16 %)**;<br>• "הרווח כמעט לא זז, **אבל** … — בערך כמו הרווח" in 362 (5.6 %);<br>• "הקופה **ירדה** ב־₪862 — ₪1,268 **יותר** מהרווח" in loss months: 230 (3.6 %);<br>• "בעיקר כי פחת — … / כי ציוד חדש ב־… / כי מע״מ…" (כי + a noun phrase) in 336 (5.2 %);<br>• a reason whose sign is opposite to the change in 25 (0.4 %). Examples: "הרווח ירד ב־₪1,249, בעיקר בגלל החופש הגדול (ביקוש פי 1.15)"; the browser showed "הרווח ירד ב־₪1,200, בעיקר בגלל **פחות** לקוחות שלא קיבלו שירות".<br>Taken together, **1,759 of 6,443 (27 %)** sentences have at least one of these problems. |
| **M7** guide highlights | **FIXED** (highlights); the A1 outcome is still not met | `m7_guide.mjs` (w1, w4, w2; every character × 5 seeds; mentor guide):<br>• flagged deals worth buying: inspection highlighted in **401/401**;<br>• `plan:rest` highlighted 87 times, 86 of them when tired;<br>• business offers: the highlight was pass 46 · std 13 · strong 19 · lean 7 (the review measured strong in 37 of 71); no strong highlight where the extra capital barely pays.<br>The balance report still lists A1 (guideTapper ≥ 65 %) as NOT met: w2 60 %, w4 63 %. |
| **M8** start rates (≥ 300 games per world) | **FIXED** for start rates; the item median is still open | `sim.mjs --stories 100` gives 300 core games per world (blindTapper, guideTapper, smart), time-limited.<br>Start rates for car / move / friend / career / crisis:<br>• w1: 37 / 39 / 36 / 71 / 66 %;<br>• w2: 48 / 41 / 43 / 72 / 82 %;<br>• w3: 34 / 34 / 41 / 59 / 77 %;<br>• w4: 42 / 38 / 33 / 74 / **84** %.<br>All are inside the 25–60 / 30–80 / 30–85 bands; w4 crisis sits at the edge.<br>Side reaches 100 % of 15-month side players.<br>Business items: median 2.4–3.0, p90 3.2–3.9 per business-year, so the w1 p90 of 10 is gone.<br>Still open: **chain items per 12 months have a median of 0.97–1.20** against the 2–3 target (D11). |
| **M9** tests that can fail | **FIXED** | 6 mutations in `/tmp/v3/mut`; each made its test fail:<br>• (1) glue back `', אבל'` → **U16 ✘**;<br>• (2) lateClient `advance` agreement back on `a` → **U18 ✘** "advance: P(late) 0.167 vs the card's 1 in 4";<br>• (3) pay cuts overwrite instead of stacking → **review M1 ✘**;<br>• (4) `deserialize` resets `story.lastChainItemM` → **U10 ✘** "round trip at biz";<br>• (5) a third business story draw per month → **§12.3 ✘** "a6: story draws = 2 × 47";<br>• (6) the warn hint uses the projected energy → **review M4 ✘**.<br>The files were restored and diffed identical to the export. |

## 4. Browser: human-style play

Scripts:

- `/tmp/v3/browser/human.py <world> <charIdx> <turns> [--phone]` executes `tests/game_e2e.py`'s helpers and uses its `seed` / `force_card` test hooks;
- `reload_mid.py` checks save/load mid-chain.

### w1, desktop 1300×820: teacher (female), 22 turns, month 1 → 14

- **Hooks:**
  - a K-tile offer with ₪400,000 cash; I took the coffee cart;
  - the car s1 card at turn 5.
- **Business, 12 months:** toasts "🏪 עגלת קפה: מחזור · רווח · קופה" plus the sentence and "פרטים", every month.
  - The calendar chip moved from "🗓️ פברואר" to "ספטמבר · החגים: התחנה מתרוקנת".
  - The season really hit in month 10: "בעיקר בגלל החגים: התחנה מתרוקנת (ביקוש פי 0.8)".
  - The overload decision "הקמפיין הצליח מדי" showed non-zero previews: temp "+₪60 בחודש × 3", "ברווח העסק ב־3 חודשים: +₪179", price10 +₪1,138. The default was "לתת להם לחכות". I resolved it from the inbox, logged as `Q`.
- **Car chain:**
  - s1 showed signed chips: bus "+₪540 בחודש" in green, lease "−₪300 בחודש × 36" in red.
  - It showed 12/24-month totals and "🎲 במשחק: 1 מתוך 2", plus "שלב 1 מתוך 2", "טרייד־אוף — אין כאן תשובה אחת" and "🛟 יש לך … חודשי כרית".
  - I chose `bus`. Four months later the inbox item s2bus opened by itself before the landing card.
  - **Its memory line said "💭 כבר 4 חודשים בלי רכב — חסכת ₪0."** (D1, `h_w1_story1.png`).
  - The default line read "אם לא תחליט עד שתי משכורות מעכשיו: ככה זה טוב לי".
- **Manage card** (`h_w1_manage*.png`):
  - L1: מחזור ₪19,778 · רווח +₪6,308 · קופה +₪6,641, plus the sentence.
  - "פרטים" (L2): groups, then "מהרווח לקופה", then the 12-bar season strip "חלשים: ספטמבר, אוקטובר", then the settings.
  - "דוח מלא" (L3) is there too. It reads well and is not an accounting wall.
  - The badge says **"אתה עובד בו"** to a female player (D4).
- **"🏪 undefined:"** appeared 3 times (D2).

### w3, phone 390×844: exporter (male), 22 turns, month 1 → 16

- **Business:** a hooked K offer gave the laundromat. The 3 setups showed capital and 3-month profit and cash; I took std.
- **Monthly toasts:** the sentence was correct in season ("החורף (ביקוש פי 1.15)").
- **Inbox decisions:**
  - "הספקים העלו מחירים" with previews price5 +₪494 and night +₪192;
  - "לקוח גדול — אבל משלם בשוטף+60" with odds "🎲 במשחק: בערך 1 מכל 4 … ו־1 מכל 12 לא משלם בכלל" and "6 מכל 10 מסכימים למקדמה";
  - both listed first on the manage card (`h_w3_phone_manage.png`).
- **L2 on the phone** (`h_w3_phone_manage_l2.png`): groups, cash bridge, season strip "חזקים: ינואר, פברואר, דצמבר", signature "ניצולת מכונות: 71% מהקיבולת". Easy to read.
- **Car chain:** I chose `new` (lease). At month 15 the inbox item s2lease appeared: "💭 לפני שנה לקחת ליסינג ב־₪1,970 בחודש.", step 2 of 3, totals −₪7,920 / +₪41,370 / +₪13,160.
- **"🏪 undefined:"** appeared 4 times (D2).
- **Calendar chip:** unreachable in months 1–4, because it is CSS-hidden and the row did not overflow, so there was no "⋯" (D6). Later, once the row overflowed, it was reachable through "⋯".
- **An earlier attempt with another random path:** a natural crisis c1 "כותרות: מיתון — המדד ירד 16% מהשיא" appeared while the HUD gauge read "צמיחה ↗", and only one option was enabled (D9).
- **The phone toast** wraps into about 11 lines in a bubble about 190 px wide (`h_w3_phone_toast_t12.png`; nit).

### Cross-checks on every life and story card in both sessions and both e2e runs

- The chip sign always matched its colour. `SIGN_JS` found 0 mismatches on life and story cards.
- Odds were always labelled "במשחק".
- The default is marked on the option and announced: "אם לא תחליט…" with `aria-describedby="evDflt"`.
- The HUD 📬 chip gets `urg` when the item is due this payday.
- The inbox list says "אין שעון…".

### Save / load mid-chain

| case | result |
|---|---|
| w1, a scheduled step (`car: wait → s2bus @7`) | reload + "המשך": month, `story` and `rng` are byte-equal |
| w3 phone, a scheduled step + an open business item (`breakdown`, due 5) | equal; the 📬 chip is back |
| `reload_mid.py` w2: an open **L chain card** | the same card, the same `pending` / `story` / `rng`; resolving it works |
| `reload_mid.py` w2: an open **chain inbox item** (s2lease) | the same item and chip; resolved as `['Q', 1, 'downsize']`; memory "עברת לרכב קטן יותר" |
| engine level | U10 passes and catches a mutation (M9-4); `big300` replays 2,400 games |

My in-browser `replay` of the hooked game threw `replay_mismatch at 0`. That is expected, because the hooks edit the save outside the action log, so it is not a finding.

## 5. Criteria (§12)

| # | criterion | verdict | evidence |
|---|---|---|---|
| 1 | `STREAMS` + `story` only | PASS | t3 §12.1 (index 14; T6's `rival` and `listing` before it) |
| 2 | pre-existing streams identical on/off | PASS | `streams300`: 1,200 seeds, 0 differences; t3 §12.2 |
| 3 | story draws = 2 × paydays; business = 2 × months | PASS | t3 §12.3 (mutation-sensitive); `big300` 2,400/2,400 |
| 4 | replay byte-identical, with and without `Q` (300 per world each) | PASS | `big300`: 2,400 games, 0 mismatches |
| 5 | `Q` in CODES; an unknown id → `replay_mismatch`; pin | PASS | t3 §12.5; verify 10/10; `--check` ✓ |
| 6 | v3, T2 and `L.friend` saves migrate | PASS | t3 §12.6 / U11 |
| 7 | mid-chain round trip, every state type | PASS | U10 (mutation-sensitive) + 4 browser reloads (§4) |
| 8 | C1, 300 per world | PASS | `big300`: 0 / 0 (358 bus games) |
| 9 | C2, 300 per world | PASS | `big300`: 0 / 0 (1,800 mortgage games) |
| 10 | C3 cooldowns, vacation, 0 repeats | PASS | t3 §12.10; sim repeats = 0 (1,200 core games) |
| 11 | C4 | PASS | U3; `big300` 0 |
| 12 | C5/C6 flow, salary, chip colour | PASS | U4; browser sign check (bus +green, lease −red) |
| 13 | no sealed or future reads | PASS | U12, U12+ scramble |
| 14 | every step reachable | PASS | U6 forced walk |
| 15 | natural frequency bands | PASS | sim, 300 per world (M8 row); w4 crisis 84 % sits at the 85 % edge |
| 16 | pacing | **FAIL** (one part) | **Chain items per 12 months: median 0.97–1.20, target 2–3** (D11).<br>p90 1.5–1.76 ≤ 5 ✓; business items median 2.4–3.0, p90 ≤ 3.93 ✓; open ≤ 3 ✓; chains ≤ 2 ✓. |
| 17 | no illogical repeats | PASS | t3 §12.10 / §12.17 |
| 18 | odds "במשחק" before the decision; > 1 S announced | PASS | t3 §12.18; browser |
| 19 | personal 100/50, never primary; course / health ≥ 60 | PASS | U9; M3 probe |
| 20 | `total24` = `storyMoney(24)` | PASS | U9; the browser fix total −₪1,300 = −1,000 + ½ × −600 |
| 21 | why bridges, integers | PASS | `bridges300`: 48,158 months, 0 failures |
| 22 | seasons and season prep `leadTime + 1` ahead | PASS | U14; seasons seen live (holidays 0.8, winter 1.15) |
| 23 | the 7 events → ≥ 2 enabled choices; previews ±₪1 | PASS | U15; live previews non-zero (overload, costSpike, lateClient) |
| 24 | lateClient +2 / +3 / bad; 25 % / 8 % | PASS | U18 (mutation-sensitive) |
| 25 | hysteresis; stage 3 in 5–50 % | **PARTIAL** | Hysteresis ✓ (0 jumps over 48,158 months).<br>Stage 3: 31.5 % pooled under the test's expand + manager policy (U17 asserts only ≥ 1).<br>Per type with a passive owner (`bridges300`): coffee, laundromat and toyshop 0/300, pizza 5/300, app 161/300 (54 %).<br>In sim games, 0–4 businesses per world end at stage 3. |
| 26 | setups; the old `start` works | PASS | §12.26; browser coffee (start / strong) and laundromat (lean / std / strong) |
| 27 | side graduation types; default coffee | PASS | §12.27 |
| 28 | balance vs the T2 baseline (±5 pp) | NOT VERIFIED | Needs the T2-baseline matrix; I did not re-run it. The balance report shows A1 not met in w2 and w4. |
| 29 | determinism; no pow / exp / log | PASS | determinism 2/2 (`chains.js` scanned) |
| 30 | lengths; every string through `gz()` | **FAIL** (minor) | Lengths: U13 ✓.<br>Gender: the UI strings "אם לא תחליט…" (×5) and "אתה עובד בו" (×4) are not genderised; "שאת קיים"; f1 "שתחתום"; run-2 "הפעם זו דני" (D4, D5). |

## 6. UI requirements

| # | verdict | evidence |
|---|---|---|
| UI-1 | PASS | Every life and story chip renders `flow` and `salary`, with sign and colour agreeing (0 mismatches). |
| UI-2 | PASS (gender D4) | On the screen: the 💭 memory line, chips, 12/24-month totals, the 🎲 odds, the 🛟 cushion line, "שלב X מתוך Y", the default tag and line, "החלטה אישית — אין כאן תשובה נכונה אחת" (baby card), and "טרייד־אוף". Screenshots: `e2e_t3_chain_card*.png`, `e2e_t3_inbox_card*.png`. |
| UI-3 | PASS | The item opens on its own before the landing card (e2e, and s2bus in w1); 📬 badge plus list; `urg` when due; "אחר כך"; no timers. |
| UI-4 | **PARTIAL** | The toast shows the 3 numbers, the sentence and "פרטים" → L2, plus "יש החלטה בעסק · לפתוח". But **"🏪 undefined:"** appears after every decision result or expiry (D2), and the sentence has the D3 problems. |
| UI-5 | PASS | L1 (3 numbers + sentence + signature), open items first, פרטים (L2), דוח מלא (L3), revenue shown. |
| UI-6 | PASS | Setups with capital, 3-month profit and **cash**, 12 season bars, and `EVENTS_TEXT` in the details. |
| UI-7 | **PARTIAL** | Desktop ✓ ("ספטמבר · החגים: התחנה מתרוקנת"). At ≤ 430 px the chip is unreachable whenever the life row does not overflow (D6). |
| UI-8 | PASS | U13 lengths |
| UI-9 | **PARTIAL** | `bizPulse` ≤ 1 per business per payday ✓; `bizStage` ✓. `cityModels()` has no `stage` or `activity` (D8); the scene was not checked visually. |
| UI-10 | PASS | Real `<button>`s; the default in `aria-describedby`; chips carry signs and words. |

## 7. Defects

| id | severity | defect | repro |
|---|---|---|---|
| **D1** | **Major** | The memory lines quote a saving of **₪0**: "כבר 4 חודשים בלי רכב — **חסכת ₪0**" (s2bus); "ויתרת על הרכב וחסכת מאז ₪0" (carBack); "עברת לפריפריה **וחסכת ₪0** בשכירות" (m3commute). Each shows while the s1 / m1 chip promised +₪540 to +₪3,000 a month.<br>Cause for the car: `goBus` (`engine.js:3666-3669`) sums `carLines(st)` *after* `applyCarCut` has already retagged them `transport`, so `savedPerMonth = 0`. m3commute's `{saved}` has the same kind of hole. | `node /tmp/v3/probes/bus_saved.mjs` (4 worlds: always ₪0); `remember_real.mjs`; browser `h_w1_story1.png` |
| **D2** | **Major** | **"🏪 undefined:"** toast after every business-item resolution and every expiry (default), and the outcome text is lost.<br>The engine pushes `{kind:'business', assetId, text}` with no `name` or `why` (`engine.js:4109`, `4147`). `game.js:1218-1220` then renders `` `🏪 ${n.name}: ${n.headline}` ``. | w1 session: 3 times in 22 turns; w3 phone: 4 times (`/tmp/v3/logs/human_*.jsonl`, `kind: toast`) |
| **D3** | **Major** (M6 residue) | The monthly why sentence is wrong or misleading in 27 % of months (numbers in §3, M6): "הקופה עלתה ב־₪0"; "כמעט לא זז, אבל … בערך כמו הרווח"; "ירדה … יותר מהרווח" in loss months; "כי פחת — …" / "כי ציוד חדש ב־…"; reasons with the opposite sign ("פחות לקוחות שלא קיבלו שירות" given as the reason for a *drop*). | `node /tmp/v3/probes/m6_calm.mjs` with `CALM=1` |
| D4 | Minor | Gender: these strings are not genderised for the 8 female characters.<br>• The UI's "אם לא תחליט…" (`ui.js:1087, 1091, 1547, 1549, 2202`).<br>• "אתה עובד בו" (`ui.js:618, 1402, 1424, 1524`; `engine.js:630`).<br>• The toyshop offer "אף אחד לא יודע **שאת קיים**" (`business.js:88` after `gz`).<br>• f1 "או לפחות **שתחתום** לו ערבות". | w1 teacher / w2 lawyer screenshots; `dump_texts.mjs f` |
| D5 | Minor | M2 residue: "זוכר מה קרה עם יוסי? **הפעם זו דני**." (`engine.js:3602`). | `dump_texts.mjs` (friend f1, run 2) |
| D6 | Minor | Phones ≤ 430 px: the 🗓️ chip is `display:none` and listed in "⋯" only when the row overflows. When the row fits, the calendar cannot be reached (`ui.js:438-441`, `game.css:1032`). | w3 phone, months 1–4: `cal_unreachable` ×4 |
| D7 | Minor | The permanent raise chip (`grossMult`) uses the uncut base while a temporary cut is active: +1,631 shown vs +1,469 real (w2). | `m1_paycut.mjs` (`promoChip` / `promoReal`) |
| D8 | Minor | `cityModels()` business entries lack `stage` and `activity` (spec §6.8 / §10.2). | `ui9.mjs` |
| D9 | Minor | Crisis c1 with no index units and no standing order is a one-option card ("מה עושים עם ההשקעות?": only "ממשיכים כרגיל" is enabled). Its title is "כותרות: מיתון" even when an index drop triggered it while the gauge says "צמיחה". | `c1empty.mjs`; earlier w3 run |
| D10 | Nit | Several small copy issues:<br>• "אינפלציה בשנה שעברה: **2.51**%";<br>• w1 "תיבת הילוכים, ₪1,000" (review n4);<br>• "החודש הראשון: משכת לכיס." / "החודש הראשון: פחת — הוצאה בלי כסף שיצא.";<br>• "פחת וזריקות" (waste) next to "פחת" (depreciation);<br>• the phone toast is about 11 lines in a ~190 px bubble. | logs |
| D11 | Open (known) | Criterion 16: chain items per 12 months, median 0.97–1.20 (target 2–3). The implementation notes already list this as needing a director decision. | sim |
| D12 | Note | Criterion 25 per type (see §5). Under real play almost no business reaches stage 3. | `bridges300.mjs`; sim `stageDist` |

## 8. Commands

```
git archive HEAD | tar -x -C /tmp/v3/wt
SRC=/tmp/v3/wt COPY_DIR=/tmp/v3 PORT_BASE=8920 bash /tmp/v3/wt/tests/serve_copies.sh
cd /tmp/v3/wt && node tests/t3.test.mjs && node tests/business.test.mjs && node tests/verify.test.mjs && node tests/determinism.test.mjs && node tests/engine.test.mjs 300 && node tools/build-edge.mjs --check
python3 tests/game_e2e.py --t3 --nov32 --noplay --base=http://localhost:8920/index.html --shots=/tmp/v3/shots --prefix=e2e_ [--phone]
cd /tmp/v3/sim && node tools/sim.mjs --stories 100 w1   # … w4
cd /tmp/v3/probes && node big300.mjs 300; node streams300.mjs; node bridges300.mjs; node m1_paycut.mjs; node m3_side.mjs; node m4_burn.mjs; node m5_order.mjs; node m6_sentence.mjs; CALM=1 node m6_calm.mjs; node m7_guide.mjs; node bus_saved.mjs; node remember_real.mjs; node dump_texts.mjs f; node ui9.mjs; node c1empty.mjs
cd /tmp/v3/browser && PLAN='{"2":"biz","5":"chain","15":"manage"}' python3 human.py w1 0 22
PLAN='{"2":"biz","5":"chain","14":"manage"}' python3 human.py w3 1 22 --phone; python3 reload_mid.py
```
