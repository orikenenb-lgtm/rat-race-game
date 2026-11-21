# T4 independent review — lobby/meta + shell part

Reviewer: independent review agent (did not write T4). Date: 2026-11-21.
Scope: commits `cc9ac14 … f9ba6f8` (20 commits) in `js/lobby.js`, `css/lobby.css`, `js/progress.js`, `js/library.js`, `js/energy.js`, `js/net.js`, `js/main.js`, `js/game.js` (IR-T4-1…9 only; the three T1 review-fix hunks in `c3d8256` were not judged), `js/onboard.js`, `js/practice.js`, `js/data/lessons-meta.js`, `js/data/characters-meta.js`, `tests/t4_meta.test.mjs`, `tests/t4_lobby.py`, and the T4 edits to `tests/lobby_v3.py`, `tests/lobby_v3b.py`, `tests/stubs/js/game.js`.
Spec: `docs/next-level/specs/T4-opening-modes-library.md`.

**Method.** Code read against the spec. The committed tree was exported with `git archive f9ba6f8` to `/tmp/t4rev/src`. That avoids the uncommitted engine, T3 and UI-lane edits now in the working tree. Private copies were served with `COPY_DIR=/tmp/t4rev PORT_BASE=8850 bash tests/serve_copies.sh`. Every browser context used the fakebackend guard (offline mode), and every run ended with "guard clean". No production Supabase was contacted. Line numbers below are for `f9ba6f8`. The working tree has moved since: other lanes are editing `lobby.js`, `game.js` and `onboard.js` without committing.

**Runs (at `f9ba6f8`)**
| Suite | Result |
|---|---|
| `node tests/t4_meta.test.mjs` | **103/104, 1 FAIL** (see M-1). It passes 104/104 only in the dirty working tree. |
| `python3 tests/t4_lobby.py` (stub :8851 + real :8852) | 84/84, 6 pending (engine part), guard clean, no page errors |
| `python3 tests/lobby_v3.py` (offline fake) | 30/30 |
| `python3 tests/lobby_v3b.py` (offline fake) | 59/59 |
| `progress`, `library`, `energy`, `saves`, `contrast` node suites | all pass |
| Review probes `/tmp/t4rev/probe.py` (real copy, guard) | results quoted in M-2, M-3, M-4 and the a11y section |

## Summary
| Severity | Count |
|---|---|
| Blocker | 0 |
| Major | 5 |
| Minor | 10 |
| Nit | 10 |

No blocker was found. No path resets ⚡, gifts, streaks, stars or achievements. A learning game cannot grant ⚡, stars, achievements, board entries, feed events or verified results. The ranked configs are unchanged.

---

## Major

### M-1 `t4_meta.test.mjs` is red at the committed HEAD (it depends on uncommitted T3 engine work)
- **Where:** `js/data/lessons-meta.js:95-99` (`total_cost`, `housing_share`, `sunk_cost`, `biz_seasonality`, `biz_terms`) and `tests/t4_meta.test.mjs:49`.
- **Evidence:** on the clean export, `E.LESSONS.length === 77` and `LESSON_META` has 82 keys. The test prints `FAIL T-M2 no meta for unknown lessons: got ["total_cost","housing_share","sunk_cost","biz_seasonality","biz_terms"]` and `1/104 FAILED`. It passes in the working tree only because uncommitted T3 engine edits add those 5 lessons.
- **Scenario:** CI, or anyone who checks out `f9ba6f8`, gets a red T4 suite. If T3 renames or drops any of those ids, the suite stays red. The 5 hints also describe story chains and business events that are not in the committed engine.
- **Fix:** either (a) move the 5 T3 entries into the T3 commit, or (b) relax T-M2 to "every meta id is an engine lesson **or** is listed in a `PENDING_T3` allow-list". With (b), report those ids as PENDING the way the engine-part checks are reported.

### M-2 The tutorial's 10 free rolls can be farmed in normal, star-earning games (spec R4 says "once per player")
- **Where:** `js/game.js:681` (client fallback: `CFG.tutorial && W.id==='w1' && S.turn < 10 → no ⚡`). `js/lobby.js:273` (`tutorial = … (!prog.tutorialDone || P.consumeTutorialReplay())`). `js/lobby.js:1981` and `js/onboard.js:211` (`requestTutorialReplay()`: a free button, unlimited, in the lobby settings and in the in-game ❓).
- **Evidence (probe `replay_farm`):** progress `{tutorialDone:true, tutorialReplay:true, stars:{w1:3}}` and ⚡ = 5. The new normal w1 game has `cfg.tutorial=True, learn=None`. After **8 rolls, ⚡ is still 5 → 5**.
- **Scenario:** a player taps "🔄 הדרכה מלאה במשחק הבא בשכונה" before every new w1 game. Each normal game then gets 10 free rolls and still counts for stars, achievements (+2 ⚡ each), boards and feed events. The engine contract E-2 (`st.tutorial && st.turn < 10 → 0`) will carry the same hole once it lands. The effect is bounded (10 rolls per new w1 game, about 15% of a game), but it breaks the economy rule that the spec explicitly calls "not farmable".
- **Fix:** separate "show the tutorial" from "rolls are free". Pass a `cfg.tutorialFree = !prog.tutorialDone && !prog.learnGames && !prog.gamesPlayed` (first-ever game only). Gate the game.js fallback and E-2 on that flag, not on `cfg.tutorial`. A replayed tutorial then keeps its coaches but costs ⚡.

### M-3 Existing players restored on a new device are re-onboarded (tutorial + free rolls), against §4.6 / AC-T8
- **Where:** `js/lobby.js:273`. The tutorial rule reads only `tutorialDone`. `progress.mergeProfile()` (`js/progress.js:390+`) raises `gamesPlayed` from the server but never sets `tutorialDone`. `revealAfterMerge()` fixes `rr2-reveal` but not the tutorial.
- **Evidence (probe `restored_player`):** local progress `{gamesPlayed:12, wins:4, tutorialDone:false}` (the shape left by a restore code or server merge on a fresh device). Starting w1 gives `cfg.tutorial=True`, while `rr2-reveal.all=True`.
- **Scenario:** a veteran restores on a new phone and gets the roll, meter and ROI tutorial coaches again. Their first w1 game also gets the free rolls of M-2. The old code had the same gap, but T4's spec makes "players with `gamesPlayed > 0` never see the tutorial" a P0 rule, and T4 owns this line.
- **Fix:** `tutorial = worldId==='w1' && !opts.duel && !opts.seed && (P.consumeTutorialReplay() || (!prog.tutorialDone && !completedAny(prog)))`. Also set `tutorialDone = true` in `mergeProfile` when the server's `meta.games > 0`.

### M-4 "יאללה, משחק ראשון" silently replaces an in-progress first game (`noAsk: true`)
- **Where:** `js/lobby.js:2014-2018` (`welcome-go` → `startFree('w1','teacher',{quick:true, noAsk:true})`). The `completedAny()` guard looks at finished games, not at saves.
- **Evidence (probe `welcome_overwrite`):** a new player starts w1 with the developer, rolls 3 times, goes home, then opens Profile → "👋 להציג שוב את מסך הפתיחה" (S-H8) → "יאללה, משחק ראשון". Result: **no confirm dialog**. The developer save was replaced by a new teacher game. Only T1's backup kept it (`rr2-bak:rr2-save-free-w1`).
- **Scenario:** any player who has not finished a game yet and reopens the welcome screen (S-H8 is offered to everybody) loses the visible save. This breaks the lobby invariant "asks before replacing a save" (`startFree` doc comment).
- **Fix:** drop `noAsk: true` (startFree already asks when a save exists). Or, when `g.savedGame(slotKey('w1'))` exists, route `welcome-go` to `continueFree('w1')`.

### M-5 A character card states a false fact: driver is not "הכי הרבה זמן בשכונה"
- **Where:** `js/data/characters-meta.js:7` (`'w1:driver'` strength `הכי הרבה זמן בשכונה: 64 חודשים`). The test is `tests/t4_meta.test.mjs:88`.
- **Evidence:** `starThresholds()` at `f9ba6f8` gives maxMonths teacher 52, **driver 64, dev 66, doctor 76**. So the driver has the second-shortest limit. T-M4 checks only that the driver has 64; it does not check the superlative. The other superlatives were checked and hold (doctor has the highest salary and the highest expenses; engineer 60 is the shortest in w4; social has the least money in w4; founder has the most capital).
- **Scenario:** the first screen a new player reads tells them something wrong when they choose a character.
- **Fix:** reword it, for example `64 חודשים — זמן נוח להתחיל לאט` (or name the real advantage). Extend T-M4 to assert every `הכי` claim against the engine: max/min of maxMonths, salary, expenses and cash in that world.

---

## Minor

### m-1 The learning end screen still talks about earned stars
- **Where:** `js/lobby.js:1563` (`end-near` shows the engine's `nearMiss` unchanged in learning mode) and `:1566` (`happyGateHtml`).
- **Evidence:** screenshot `t4_06_learning_end_phone.png` shows, under S-L3/S-L5, the engine line `משחק מושלם: ★★★. נראה אותך עושה את זה שוב בעולם הבא.` The other win line is `עוד N חודשים פחות ו־★★ היו שלך` (`engine.js:3542-3546`). Both contradict S-L5 ("במצב תרגול לא נאספים כוכבים").
- **Fix:** in learning mode, skip `end-near` when `won`. Prefix the ★★★ gate with "במשחק רגיל…", or hide it.

### m-2 Six practice-trigger lessons can never trigger a practice question
- **Where:** `js/practice.js:91`. Topics are found only through **`kind==='a'`** items, but `tax_b`, `opp_b` and `prof_b` (`:48,:52,:54`) list extra lessons.
- **Evidence:** `marginal_overtime`, `side_tax`, `time_scarce`, `rest_value`, `biz_receivables` and `biz_inventory` never lead to an offer. Spec §10.2 says "offered after any of these lessons". T-M2 nevertheless forced worked examples to be written for them (implementation note 2).
- **Fix:** when a lesson is only in a `b` item's list, offer that topic's `a` first. Do this by building the topic set from all items: `PRACTICE.filter(x => x.after.includes(lid)).map(x => x.topic)`.

### m-3 Mentor levels have two different names, one in the lobby and one in the game
- **Where:** `js/lobby.js:485` (`מדריך / רמזים / מקצוען`) against T2's `MN.LEVEL_TEXT` (`מתחיל / מתקדם / מומחה`), which `game.js:811` (in-game picker) and the engine message `ברמת מומחה אין רמזים` use.
- **Fix:** one vocabulary. Read `ENG.MN.LEVEL_TEXT[lv].label` in `mentorRowHtml`, or change T2's labels. This is an inter-lane decision, so log it as a CR.

### m-4 The phone compaction hides information and touch users cannot reach it
- **Where:** `css/lobby.css:897` (dream one-liners S-D1…D4 hidden ≤ 420 px), `:908` (🏁 "השיא שלך" and "🧠 חדש כאן" hidden ≤ 600 px), `:916` (mentor lock reasons hidden; only `title=` is left, which touch devices never show), `:918` (character story clamped to 1 line; the spec says ≤ 2).
- **Fix:** keep the personal best (it is short). Show the lock reason as a tooltip or toast on tap. Allow the story 2 lines and gain the space elsewhere (for example the hero height).

### m-5 After "שינוי" on the collapsed dream line, focus jumps to the mode radio
- **Where:** `js/lobby.js:1967` (`dream-open` → `rerender()` → `renderWorld` → `focusSoon('input[name="t4mode"]:checked')`).
- **Fix:** after a `dream-open`, focus the checked (or first) `input[name=t4dream]` (A11Y-3: "dream modal → the selected/first option").

### m-6 In-game legend: the ⚡ row has no value
- **Where:** `js/onboard.js:169` (value `''`). Spec §4.5 says "your current value".
- **Fix:** read it from `energy.js` (`EN.get()`/`EN.MAX`), as the lobby chip does.

### m-7 T-M1 cannot detect the central anti-farming property
- **Where:** `tests/t4_meta.test.mjs:28-32`.
- **Evidence:** the test calls `P.addAchievements(['golden'])` itself, passes `achievements:['no_trap']` to `recordLearnGame`, and then **allows `achievements` in the changed set**. A `recordLearnGame` that also added `no_trap` would still pass. `tutorialDone` starts as `true`, so the "sets tutorialDone" path is never exercised.
- **Mitigation:** the browser test `t_learn` (AC-L2) does catch a leaked achievement.
- **Fix:** take the snapshot after the test's own `addAchievements`. Assert `!after.achievements.includes('no_trap')`. Start from `tutorialDone:false` and expect `['learnGames','lastChar','tutorialDone']`.

### m-8 Weak or near-vacuous assertions in `t4_lobby.py`
- `:40` the welcome word budget is `≤ 35 + 12`. The line-42 check is the real one.
- `:81` "first card play button reachable" accepts `y+h ≤ 1160` on a 760 px viewport (the real AC-C3 check is `:148`).
- `:129` "normal save kept" is only printed, never asserted.
- `:319` D-9 passes when `rr2-energy` is `None`, which is also what happens if the roll never happened.
- `:346` AC-L1 accepts `n ≥ 20` rolls (the spec says 40; the run did 33).
- **Fix:** tighten each one. Add regression tests for M-2, M-3 and M-4 (probe logic in `/tmp/t4rev/probe.py` can be lifted).

### m-9 `recordDream` is not deduplicated
- **Where:** `js/progress.js:200`.
- **Evidence:** `onGameEnd` does not drop a repeated `game:end`. `recordGame` and `recordLearnGame` have a signature guard, but `recordDream` adds `games + 1` each time. Badges are protected by the set, the counter is not. `gamesThisSession++` has the same problem.
- **Fix:** reuse the `sigOf(e)` / `lastEndSig` guard at the top of `onGameEnd`, or add a sig in `recordDream`.

### m-10 Cross-lane: naming and learning-mode indicators are still missing in game
- **Evidence:** `ui.js` (N14/N15), `index.html:35` and `business.js` (N18) still show "אנרגיה". There is no in-game S-M7 "🎓 תרגול" tag, and the gradual reveal and intro are absent.
- **Scope:** this is correctly reported as PENDING / CRs and is not a T4-lobby defect. It is listed so nobody reads "⚡/🔋 naming everywhere" or "learning mode visible in game" as done.

---

## Nit
1. `js/onboard.js:145`: tour step 1 targets `#hCash` but is titled "הדוח שלי", and its text is identical to step 5. Use "💰 מזומן ותזרים" for step 1.
2. `js/game.js:919`: `let closedRes` is declared after `onChoose` (defined above it) assigns to it. It is safe today only because `openEvent` never calls back synchronously. A TDZ trap: move the declaration up.
3. `js/lobby.js:493`: S-S1 renders "🔥 1 יום ברצף". Natural Hebrew is "🔥 יום אחד ברצף".
4. Gift toast for 1 ⚡ reads "+זריקה אחת ⚡". The in-game `showNoEnergy` says "האתגר היומי (בלי ⚡)" while the lobby says "(בלי זריקות)". Unify the wording.
5. `recordLearnGame()` returns `learn:true`, which `onGameEnd` immediately overwrites with the `recordLearning` summary (`res.learn = …`). The field name collides; harmless.
6. `dreamsList()` reads the test seam `globalThis.__t4dreams` in production, and engine `icon`s go into `innerHTML` raw (`dreamRowHtml`, `dreamEndHtml`, `dreamsProfileHtml`). This is not an untrusted source (same origin), but escape `icon` anyway and gate the seam.
7. `tests/t4_meta.test.mjs:82`: the `.map(abs∘round)` sits inside the `//` comment, so it is dead code. Harmless today because the comparison rounds.
8. `tests/t4_meta.test.mjs:98`: the T-M6 allow-list `'אנרגיה'` exempts **any** line that has the quoted literal. Narrow it to the w4 sector definition.
9. `cleanT4` drops a stored `dream` or a `dreams[id]` whose id is not in the hard-coded `DREAM_IDS`. A future engine dream would be wiped on load. Prefer keeping unknown ids.
10. The lesson sheet has `aria-modal` and a Tab trap, but the rest of the lobby is not `inert` behind it. A screen-reader virtual cursor can still leave it.

---

## Verified OK
**Data safety / migrations**
- `rr2-progress`: `load()` spreads the raw object, so unknown keys are kept. T4 fields are defaulted by `cleanT4`. None of them is in `metaOf()` or `syncProgress` (checked in the source and by T-M1).
- `rr2-library` v1 → v2: `ids`/`read` are kept and deduplicated; unknown keys are kept (`saved.extra`). The first `ctx` wins. A ctx is added for an already-unlocked lesson. `practiced` keys are validated.
- `rr2-energy`: `energy.js` has label exports only; MAX, CAP, refill, gifts, daily +10, streak, achievement +2 and quiz +1 logic are unchanged.
- `rr2-coach` keeps its key and format. Saves are backed up by T1 on `clear`.
- `migrateReveal` marks players with `gamesPlayed + learnGames > 0` as `all`. Re-checked after a server merge.

**Learning mode (no farming)**
- Own slot `rr2-save-learn-<w>`: `game.js saveKeyFor` plus the lobby fallback and stub. The slot is cleared at the end, and the normal slot coexists.
- `continueFree` restores `learn` from `sv.cfg`.
- `isLearnEnd` takes `e.learn` (IR-T4-5) first, then `summary.config`, then `activeConfig`. Never with a `resultId`.
- `recordLearnGame` touches only `learnGames`, `tutorialDone` and `lastChar`, and resets the achievement session.
- Gated: bus `achievement` (`:2105`), live quiz `onQuizReward` (`:644`), `creditQuizAtEnd` (`:648`), `logMilestones` (`:574`), `markBankruptcy`/`bailoutUsed`, `recordDream`. Duel/share/same-board are hidden. `learn` is forced off for duels.
- No referral/verify/ranked path exists for a free learning game.
- The UI offers no path that turns a learning save into a normal or ranked one ("לנסות במשחק רגיל" starts a new game and asks before replacing a normal save).
- Real engine, 33 learning rolls: ⚡ 5 → 5; `#hEnergy`/`#rollEn` hidden.

**Ranked integrity**
- `createGame` gets `learn` only when `mode==='free'` and `dream` only in free mode (`game.js:526`).
- `mentor` is passed through, but T2's `MN.defaultLevel` returns `'hint'` for daily/weekly/challenge before reading `o.mentor`.
- `playRanked`/`launchCfg` add no T4 keys. Verifier `configFor` is untouched.
- Practice: `onboard.practice.offer` is free-only, and `pickPractice` requires `st.mode==='free'`.
- `usesEnergy` is unchanged for ranked, and `recordGame` is unchanged for normal games.

**Practice data:** all 24 items were recomputed by hand and are correct, including the non-numeric answers.
- budget_a 1,250 · budget_b 400
- debt_a 1%/month = ₪100 = the payment · debt_b 360
- fund_a 3E · fund_b 2 months
- cfnw_a NW +₪0.5M with negative cash flow · cfnw_b 900 vs 0
- liq_a/b
- div_a/b
- cmp_a 1,102.50 · cmp_b
- inf_a ≈ −1.9% · inf_b ≈ −1.9%
- tax_a 9 · tax_b 690
- risk_a 125 · risk_b
- opp_a/b
- prof_a 5,000 · prof_b cash −25,000 despite profit

`why` ≤ 59 characters. The correct index is never returned to the UI. No RNG draw, no money effect.

**Library:** counts come from engine `LESSONS` (77 at `f9ba6f8`, 82 with the uncommitted T3). Every committed lesson has a teaser and a hint. Categories are Hebrew only, with `🏪 עסקים` and the `📚 שיעורים` fallback. Locked cards carry the S-B1 aria-label. The lesson context line renders (`📍 … בחודש 13 בשכונה — "סוף שנה" · אינפלציה השנה 3.1%`).

**Character cards:** an `<article>` with sibling buttons (AC-C2). Identity lines are computed without slash forms. The surplus equals `metrics(createGame()).cashflow` (`+₪1,705`, correct LTR). Every ₪ figure matches the engine. At 360 px the first "לשחק" is inside the first viewport. Controls are ≥ 44×44.

**First minute:** F1 is 2 screens (welcome → game) and F2 is 3 (welcome → world → game). Headless: 6.4–8.7 s to an enabled roll on phone and desktop (measured to the roll button until E-3 lands). The welcome is about 22 words with no ⚡/★★★/plan text. Initial focus is on S-W3. A brand-new player always gets normal mode.

**A11y:**
- Lesson and legend sheet: Tab trap, Escape, focus returns to the opener (tested).
- The game DOM is `inert` while `#start` is visible (MutationObserver, whoever toggles it).
- Escape collapses "עוד פרטים".
- Keyboard path (probe): mode radio → mentor radio → per card עוד פרטים → לשחק.
- In-game help and legend use `ui.modal` (trap, Escape, focus return).

**Security:** every new interpolation of untrusted or stored data is escaped. That covers nicknames (`esc`; toasts use `textContent`), save `charName`/`month`, lesson ctx (`iso`), dream names and mission titles, and the legend (`ui.esc`). Server numbers go through `int()`/`EN.label()`.

**Naming in T4 files:** no "אנרגיה" in any T4 file. ⚡ is labelled זריקות/זריקה (N1–N13, N16, N17). The sprint uses ⏱️. The streak copy is neutral (`.wait`, no `warn`).

**lobby_v3 / v3b edits:** these update assertions to the intentional spec changes. The welcome check is inverted (no ⚡/plan text, plus the `welcome-pick` link). The star block is read inside "עוד פרטים". The N11/N12 labels are updated. They were not weakened beyond what the spec changed. The new `welcome-go` path is covered by `t4_lobby.py f1stub`, not by v3. Both suites pass offline (30/30, 59/59).
