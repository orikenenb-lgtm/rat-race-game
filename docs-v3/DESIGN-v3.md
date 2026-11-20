# מירוץ העכברים v3 — "החיים האמיתיים" (מסמך עיצוב + חוזה צוות)

Live v2: https://orikenenb-lgtm.github.io/rat-race-game/ · working copy `/home/claude/rr2` · git checkout `/home/claude/rat-race-game` (orchestrator deploys).
Read first: `/home/claude/rr2/DESIGN.md` (v2 vision), `/home/claude/rr2/ENGINE.md` (engine API incl. "Changes v2.1"), `/home/claude/qa/REPORT.md` (what players felt).
Owner's brief (אורי): "more realistic, much more interesting, even harder; players must not be able to roll every second — add a limit; think like someone with years in the field; the real goal is that people LEARN money and get hooked."

**Golden rule: do not break v2.** Ranked determinism (same seed ⇒ same dice + cards for everyone, regardless of decisions), server checkpoints, saves, groups, daily/weekly, duels, achievements must keep working. Old saves: add `st.v = 3`; a v2 free save must still load (migrate with sensible defaults) or be discarded with a friendly message — never crash.

## 1. The big idea: from "money calculator" to "life simulator"
Every month of the game is a month of a life. You are not only buying assets — you are spending your **time**, your **energy**, and living **life events**, while **inflation**, **taxes** and the **bank** behave like the real Israeli ones (simplified, but directionally true). The end is not just "escaped / not escaped" but **the story of your life**: money, free time, family, happiness.

## 2. New systems (engine) — each must create real decisions AND teach one real lesson
1. **Life clock** — character has an age (starts 22–35 by character). Every month = age +1/12. End summary at the end of the game ("בגיל 41 יצאת מהמירוץ").
2. **Time & energy (the monthly plan)** — at each payday the player picks a monthly plan (one tap, remembered, can change any payday): `עבודה רגילה` / `שעות נוספות` (+income, −energy) / `לימודים` (cost now, permanent salary raise after N months — human capital) / `עסק צדדי` (small variable income, may grow into a business) / `מנוחה ומשפחה` (+energy, +happiness). **Energy** 0–100: low energy ⇒ burnout risk (a month without salary + medical cost). Lesson: time is the scarcest asset; rich people buy time.
3. **Happiness / life satisfaction** 0–100: rest, family events, experiences raise it; burnout, debt stress, crises lower it; toys give a short spike that fades (hedonic adaptation!). ★★★ requires escaping fast AND happiness ≥ threshold (money isn't everything).
4. **Real payslip** — salary is GROSS; net = gross − income tax (Israeli progressive brackets, simplified) − Bituah Leumi/health − pension (employee 6%, employer 6.5% + severance 6% go to a pension account you own). The statement sheet shows a payslip ("תלוש") view. Lesson: ברוטו ≠ נטו; pension is your money.
5. **Inflation** — yearly CPI (2–4% normal years, scenario-driven spikes): living expenses and prices rise; rents follow slowly; cash loses real value (show "ערך ריאלי"). Lesson: cash under the mattress shrinks.
6. **Index fund & pension** — "קרן מחקה מדד" tradeable in every world: boring, ~7%/yr long-run with realistic drawdowns; the pension account compounds automatically. Lesson: compound interest + time in the market beats timing the market. Show a compounding visual.
7. **Taxes on investments** — capital-gains tax 25% on realised profit (stocks/crypto/index sale), simplified betterment tax on property sale; rental income simplified 10% track. Lesson: after-tax return is what matters; holding vs flipping.
8. **Credit score (דירוג אשראי)** 300–850-like scale: late/forced loans, maxed credit lower it; repaying raises it; it changes loan rates and whether the bank approves. Lesson: your reputation with the bank has a price.
9. **Life events with real dilemmas** (no single right answer): wedding (modest / big / none), baby (expenses + happiness + time), moving apartment, helping a parent, car breaks (fix vs replace vs bus), friend asks for a loan / guarantee, army reserve month (מילואים — income compensation), job offer with higher pay but more hours, layoff + severance from your pension fund. Each event shows money AND happiness/energy consequences.
10. **Negotiation** — on property/business deals: "להציע מחיר נמוך יותר" (−5/−10/−15%) with deterministic acceptance probability (uses the deal's own pre-drawn random so fairness holds); salary-raise request when your energy/performance is high. Lesson: everything is negotiable, but greed can lose the deal.
11. **Historical scenarios — "מכונת הזמן"** (a new game mode, separate from the 4 worlds): replay REAL monthly market paths (S&P 500 / TA-125, Bank of Israel rate, CPI, Israeli home-price index, USD/ILS) for: הדוט-קום 2000, המשבר הגדול 2008, הקורונה 2020, האינפלציה של 2022, הדיור בישראל 2008–2021. Real data drives prices/rates; cards are themed to the era with real headlines (paraphrased). End screen: "מה היה קורה אם…" comparison with a buy-and-hold index investor. Lesson: history doesn't repeat but it rhymes; panic selling is the most expensive decision.
12. **End-of-life summary ("סיפור החיים שלך")** — age, money, passive income, free time, family, happiness, biggest decisions (from st.log), leaks, and one sentence the mentor writes about your life. Shareable.

## 3. The limit (owner asked explicitly): ENERGY ⚡ — "you can't roll every second"
- Real-time **⚡ energy for free play and story worlds**: max 25, each roll costs 1, refills 1 every 6 minutes (full in 2.5 h), stored per device (and synced). When empty: "נגמרה האנרגיה — חזור בעוד X דק'" + options that ARE allowed while empty: read the lesson library, review your statement, play the daily (if not played), send ⚡ to friends.
- **Ranked modes (daily/weekly/challenge) do not cost ⚡** — they are already limited (one attempt) and must stay fair.
- **Bonuses** (habit loop, never pay-to-win, never money): +10⚡ for playing the daily, +5⚡ per friend who joins via your link (server), friends in a group can **send 3⚡ to each other once a day**, streak bonus at 3/7/30 days, achievements give ⚡.
- **In-game pacing**: the monthly plan decision at each payday and life-event dilemmas naturally slow the tap-tap-tap; the "thinking" is the game.

## 4. Other hooks (retention + learning)
- **ספריית השיעורים** — every lesson the mentor teaches is unlocked into a library (collection, 40+ short cards) — the "learning" is a visible collection.
- **Weekly "פיננסי של השבוע"** — the weekly challenge uses this week's real Bank of Israel rate & USD/ILS as its starting values (from a small JSON the orchestrator updates; fallback to defaults).
- **Friend gifting & feed** in groups: "דנה יצאה מהמירוץ בגיל 34 🎉", send ⚡.
- **Harder by design**: ★★★ needs money + happiness; inflation and taxes make sloppy play fail; but `primary`-follower must still usually escape (fair losses).

## 5. Ownership (each lead owns files; never edit another lead's files — ask the orchestrator)
| Lead | Owns |
|---|---|
| Data research | `js/data/real.js` (+ `docs-v3/sources.md`) — real monthly series + Israeli tax/BL/pension parameters, with sources |
| Engine lead | `js/engine.js`, `js/worlds/*`, `js/achievements.js`, new `js/life.js`, `js/history.js`, `tools/sim.mjs`, `tests/engine.test.mjs`, `ENGINE.md` (section "Changes v3") |
| 3D lead | `assets/life/*`, `assets/history/*`, `blender/*` (bpy runs in the container: `python3 -c "import bpy"`) |
| In-game UI lead | `index.html`, `css/game.css`, `js/main.js`, `js/game.js`, `js/scene.js`, `js/ui.js`, `js/audio.js` |
| Meta/lobby lead | `js/lobby.js`, `js/progress.js`, `css/lobby.css`, new `js/energy.js`, `js/library.js` |
| Orchestrator | backend (Supabase), `js/net.js`, `js/bus.js`, deploy, final QA |
Contracts between leads are written in ENGINE.md "Changes v3" (engine → UI/lobby) and in this file. Tests and screenshots are mandatory for every lead; use nicknames starting with `טסט` on the live server.
