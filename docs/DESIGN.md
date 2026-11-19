# מירוץ העכברים 2.0 — מסמך עיצוב (חוזה לכל הסוכנים)

Live today: https://orikenenb-lgtm.github.io/rat-race-game/ (single-file v1 = `/home/claude/rr2/index.html`, read it first).
Repo on the user's Windows PC: `C:\rat-race-game` (git, GitHub Pages from `main`, root folder). Deploy = copy files there + git push.
Backend: Supabase project `xvqaxphyfqdzkddmoosu` (schema `game`, only `public.rr_*` RPCs are callable from the browser).
All UI text is Hebrew, RTL, natural Israeli Hebrew, short sentences. Player-facing numbers in ₪.

## 1. The goal
The user (אורי, builds products, wants this to spread among friends/teens) said: "I don't want this to be just another game."
v1 is a single board ("השכונה") — fun once, nothing pulls you back. v2 must make people **come back tomorrow** and **send it to friends**,
while still teaching real money lessons (that is the soul of the game — every mechanic teaches one concept).

## 2. What brings a player back (design pillars — every feature must serve one)
1. **Always a next goal on screen** — freedom meter in-game; stars + next locked world on the map.
2. **Short sessions** — one game ≈ 5–8 minutes. Turns must be fast (no modal for routine payday, turbo option).
3. **Visible growth** — your city literally grows on the board (3D models rise when you buy). Each world = a bigger, more impressive city.
4. **Mastery** — 1–3 stars per world. You replay to get ★★★ because you understand money better now. The mentor makes you feel smarter.
5. **Variable reward** — rare golden deals (עסקת זהב), mystery tile, market crashes/booms. Not every turn is the same.
6. **Collection & status** — achievements, unlockable pawns, titles by total stars (עכבר → חוסך → משקיע → טייקון → מיליונר → אגדה) shown next to your name in every leaderboard.
7. **Daily habit** — daily challenge (same seed for everyone, rotates through ALL worlds, so it is also a teaser of locked worlds) + 🔥 streak.
8. **Social** — groups, group challenges (already built), weekly challenge, one-tap WhatsApp share of your result with a link.
9. **Fair losses** — near-miss messaging ("היית רק ₪800 מהחופש"), one-tap "עוד פעם". Never punish, never pay-to-win, no ads.

## 3. Worlds (progression)
Escape a world (≥1★) → next world unlocks. Each world is its own complete game (needed for seeded fair challenges), with its own
start characters, decks, tile layout, theme, 3D models and ONE new mechanic that teaches ONE concept.

| # | id | שם | Goal to escape | New mechanic | Lesson |
|---|----|----|----|----|----|
| 1 | `w1` | השכונה | passive income ≥ monthly expenses | (v1 as is) assets vs liabilities, loans, doodads | נכס מול התחייבות, תזרים |
| 2 | `w2` | העיר הגדולה | passive ≥ expenses, but you start with lifestyle inflation (big expenses) and goal passive is high | **Interest rate** (ריבית) shown on HUD, moves with "בנק" tiles/events; leveraged assets' cashflow and bank-loan cost depend on it. **Upgrade** tile: renovate/upgrade an owned asset for +cashflow | מינוף: חוב טוב מול חוב רע, אינפלציית סגנון חיים |
| 3 | `w3` | הנמל הגלובלי | net worth ≥ target (e.g. ₪10M) — different goal type on purpose | **Dollar rate** (שער הדולר) moves; import businesses' cashflow scales with it; option to **hedge** (pay a fee, freeze effect). **Gold** rises in crises | פיזור סיכונים, מטבע, גידור |
| 4 | `w4` | עמק העתיד | net worth ≥ big target AND impact ≥ target | **Angel investing**: put money in startups, outcome hidden until an "exit" event months later (most fail, few 10x–100x = power law). **Giving** tile: donate → impact points | חוק החזקה, סבלנות, נתינה |

Stars per world: ★ escaped within the world's month limit; ★★ escaped by T2 months; ★★★ escaped by T3 months (T2/T3 set by simulation so ★★★ needs genuinely good play).
Month limit (MAXM) per world in ranked modes; free mode has no limit but stars still use months.

### Tile types
Common: `P` payday, `O` opportunity (deal), `D` doodad (tempting expense), `M` market event, `X` crisis (layoff etc.), `?` mystery (rare reward or surprise).
World-specific: w2 `B` bank (rate moves / refinance offer), `U` upgrade an owned asset; w3 `F` FX move, `S` shipping event; w4 `A` startup pitch (angel invest), `G` giving.
Board = 24 tiles ring, paydays on the 4 corners (indices 0,6,12,18), as v1.

### Themes + 3D models (asset paths are a contract between the Blender agent and the game)
All models: Blender Z-up exported as glTF (Y-up), footprint ≈2×2 units, origin at base-centre on the floor, front faces −Y in Blender (= +Z in glTF), low-poly stylized, Principled BSDF colors (+ emission for glow), one joined mesh per asset, bevel applied.
- w1 השכונה (golden hour, cream board, trees): `assets/w1/apartment.glb business.glb stock.glb crypto.glb` (exist).
- w2 העיר הגדולה (dusk: navy→coral sky, slate board, neon accents, skyline in distance): `assets/w2/tower.glb mall.glb hotel.glb bank.glb skyline.glb`(decor)
- w3 הנמל הגלובלי (bright sea: sky blue, sand/wood-plank board, water around the board): `assets/w3/ship.glb warehouse.glb factory.glb gold.glb crane.glb`(decor)
- w4 עמק העתיד (night, stars + aurora, white/glass board, cyan neon): `assets/w4/campus.glb datacenter.glb rocket.glb foundation.glb turbine.glb`(decor)
- Pawns (cosmetic unlocks, material named `PawnColor` so the game can tint it): `assets/pawns/classic.glb car.glb tophat.glb rocket.glb crown.glb diamond.glb` (same scale as v1 pawn: radius ≤0.25, height ≈0.7).

## 4. Retention features (UI agent)
- **World map** (lobby home): 4 world cards/islands with stars, lock state, "next goal" line, best months. Locked world shows silhouette + "לפתוח: לצאת מ<world>".
- **Daily challenge**: seed per Israel date, world rotates daily through all 4 (locked worlds playable only via daily = teaser), max 40 months, 🔥 streak, one attempt/day.
- **Weekly challenge + groups/challenges** (exist) — add world choice to group challenges.
- **Achievements** (~25) with toast + collection screen. **Pawns** unlocked by total stars/achievements. **Titles** by total stars.
- **Juice**: WebAudio-synth sounds (dice rattle, hop tick, coin gain, loss thud, purchase ka-ching, unlock fanfare) with mute toggle; `navigator.vibrate` on mobile; animated HUD counters; coins flying to cash on payday; camera shake on crash; dust puff when a model lands; gold sparkles on golden deals; turbo (2x) toggle.
- **Fast flow**: payday = toast + floating number (modal only the first time), card choices one tap, Space/Enter rolls.
- **Onboarding**: first game ever = 3 coach marks (roll, freedom meter, ROI button) and a guaranteed small good first deal.
- **End screen**: stars earned (animated), near-miss line, lesson of the world, unlocks, `שתף בוואטסאפ` (https://wa.me/?text=…), `עוד פעם`, `לעולם הבא`.
- **Recovery code**: profile shows a code (id+secret) to move your player to another device.
- Trade window (stocks): keep the v1.1 behaviour (slider, clamp, reset, repeated buy/sell, "סיום").

## 5. Architecture (v2 file layout — ES modules, no build step, served by GitHub Pages)
```
index.html            shell + importmap (three@0.170.0 from cdn.jsdelivr.net)
css/game.css
js/rng.js             seeded PRNG (mulberry32) — state is an int stored in game state
js/engine.js          PURE game logic, no DOM/THREE. Deterministic given seed + decisions.
js/worlds/w1.js … w4.js, js/worlds/index.js   data: theme, characters, tiles, decks, events, mentor lines, goal, stars, maxMonths, mechanics config
js/achievements.js    definitions + check(state, event)
js/scene.js           three.js: board per world theme, model loading per world, pawn, animations, decor
js/ui.js              HUD, statement sheet, cards, trade window, mentor, toasts
js/lobby.js           world map, daily/weekly, groups/challenges, profile, achievements, pawns
js/progress.js        local progression (stars, unlocks, achievements, streak, pawn) + sync via net.js
js/net.js             Supabase RPC wrapper (owned by the orchestrator)
js/audio.js           WebAudio synth sounds
js/main.js            boot + wiring
tools/sim.mjs         Node simulation & balance report (imports engine + worlds)
```
Determinism rule: everything that affects game outcome uses the seeded RNG from game state, consumed in a fixed order that does not depend on the
player's decisions (so all players in a seeded challenge see the same dice and the same card sequence). Visual randomness uses Math.random.

## 6. Backend contract (js/net.js, owned by orchestrator)
Existing: rr_register, rr_rename, rr_create_group, rr_join_group, rr_leave_group, rr_my_groups, rr_group, rr_create_challenge, rr_weekly, rr_start, rr_finish.
v2 additions: `world` on challenges/results; `rr_daily` (+ streak); `rr_start(p_mode 'daily'|'weekly'|'challenge')`; `rr_sync_progress` (stars per world, achievements, pawn → server keeps total stars so leaderboards can show titles); boards include `stars` per row.
