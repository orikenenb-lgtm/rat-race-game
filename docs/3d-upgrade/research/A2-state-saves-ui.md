# A2 — State, saves, connections and the economic UI (team א, research worker 2)

- **Branch read:** `feature/3d-world-upgrade` (read-only; nothing edited except this file; no git writes; no network; no MCP).
- **Date:** 2026-11-23.
- **Inputs:** `docs/3d-upgrade/BRIEF.md` §2, 7, 10, 11, 14, 15, 16, 18, 19, 20; `docs/ARCHITECTURE.md`; `docs/next-level/TASK_BOARD.md`, `FINAL_REPORT.md`, `verification/*.md`; the code under `js/`, `css/`, `index.html`, `supabase/functions/verify-result/engine_pin.js` (file names only).
- **Tests I ran (Node, offline, read-only; `git status` unchanged before and after):** `saves` 105/0 · `render_api` 231/0 · `flags` 16/0 · `energy` 26/26 · `progress` 41/41 · `library` 6/6. I ran no browser tests.

---

## 0. Three constraints the upgrade has to respect (read these first)

1. **The worlds files are part of the pinned server engine.** `supabase/functions/verify-result/engine_pin.js` pins the SHA-256 of 27 files. They include `engine.js`, `worlds/index.js`, `worlds/common.js`, `worlds/h.js`, `worlds/w1.js`–`w4.js`, `systems/*`, `life.js`, `practice.js`, `achievements.js`, `rng.js`, `history.js`, `data/real.js`, `data/tax.js` and `finance/*`. The world themes (`theme: {sky, fog, board, light, decor…}`, e.g. `js/worlds/w1.js:12-15`, `w4.js:24`) and the model-name maps (`w.models`, read by `engine.js:764 modelFor`) live **inside** those pinned files.
   - **Consequence:** any edit to a theme, a model name or a label in `js/worlds/*` (or to `engine.js` / `metrics()`) changes the pin. Ranked results then fail server verification until `verify-result` is redeployed with the new lock, and that is a production action that needs the owner's approval (TASK_BOARD "רשומות משותפות"; FINAL_REPORT §4 "שוליים טכניים": the engine bundle is already close to the size limit).
   - **Rule for this upgrade:** put visual config (per-world 3D theme, building styles, model aliases) on the **render side**, extending `js/render/vocab.js` `worldStyle()` (`vocab.js:33`) or a new render-side file. Never put it in `js/worlds/*` or `engine.js`.
2. **The engine graph must not import any UI or render code.** The "T-graph" check in `tests/render_api.test.mjs` enforces this, and `flags.js:1` and `saves.js:2` restate the rule. Render code may import the engine; the engine may never import render code.
3. **`S.ui` travels inside the saved state and to the server.** Every slot stores `state.ui` (`game.js:591`, `saves.js:366-380 normalizeUi`). Ranked checkpoints send the whole `S` to `rr_checkpoint` (`game.js:151-156`, limit ≤300 KB per ARCHITECTURE §7). Do not add display data to `S.ui`.

---

## 1. System map

### 1.1 Who owns what

| Concern (brief §7) | Owner module(s) | Evidence |
|---|---|---|
| **Economic state and rules** (cash, assets, debts, income, goal, stars, end) | `js/engine.js` (pure, deterministic), with data and formulas in `js/worlds/*`, `js/life.js`, `js/finance/{bank,invest,business}.js` (called only by the engine), `js/systems/*` (mentor, focus, dd, cycle, rules, chains, rivals, dreams, recap), `js/rng.js` | `engine.js:104 createGame`, `:581 metrics`, `:850 rollDice`, `:1410 landing`, `:2366 choose`, `:4867 checkEnd`, `:4795 replay`; ARCHITECTURE §1.2 |
| **Read model for the UI** | `E.metrics(st)` (the HUD and the sheet), `E.currentEvent/describe` (cards), `E.cityModels(st)` (the city), `E.impactFor` (the decision preview), `E.starThresholds` | `engine.js:581-702`, `:768-780`; `game.js:1149-1152` |
| **Turn state** | Engine fields `st.phase` (`roll`/`land`/`event`), `st.pending`, `st.turn`, `st.month`. Controller flags `busy`, `rolling`, `stuck`, `gen`, `flows`, `flowTick`, and `card` in `js/game.js` | `game.js:40-43`, `:1022-1088`, `:1099-1135`, `:1137-1189` |
| **Saves** | `js/saves.js` (classify, back up, quarantine, quota, sweep). `game.js` decides slot keys (`saveKeyFor`), `persist()` and ranked `checkpoint()`. Branches: `js/rewind.js` | `saves.js:246-320`; `game.js:117-135`, `:151-175` |
| **3D view** | `js/scene.js` (three@0.170 from the jsDelivr importmap) + `js/render/kit3d.js`, `quality.js`, `flatten.js`, `assetinfo.js` | `index.html` importmap; `scene.js:13-38` |
| **2D view (מצב קל)** | `js/render/board2d.js` (DOM), `css/stability.css` | `board2d.js:21-27`, `:112-140`, `:246` |
| **Renderer choice and fallback** | `js/render/select.js`: probe, then 3D, then 2D, then `null.js` | `select.js:9-71` |
| **Animations** | Inside each renderer (scene tweens `scene.js:186-200`; board2d `anims`), DOM HUD tweens in `ui.js:297-308`, feedback queue `ui.js:2098-2130` | — |
| **Audio** | `js/audio.js` (WebAudio synthesis, no files); TTS in `ui.js:699-737` | `audio.js:1-3`, `:141-154` |
| **UI components** | `js/ui.js` (HUD, sheet, cards, toasts, mentor, impact panel, verdict), `js/render/overlay.js` (loading stages, recover bar), `js/onboard.js` (coaches, gradual reveal), `js/summary.js` (end recap) | `ui.js` exports list (`:26-2286`) |
| **Lobby / meta** | `js/lobby.js` (views: welcome, home, world, daily, weekly, groups, group, profile, library, history, duel, end), `js/progress.js` (stars, titles, pawns, streak), `js/energy.js` (⚡), `js/library.js` | `lobby.js:252-261`, `:2172-2229` |
| **Net** | `js/net.js` → Supabase REST RPC (schema `game`) + the `verify-result` Edge Function | `net.js:3`, `:44`, `:104` |
| **Flags** | `js/flags.js` (`board2d`, `recover`, `rivals`, `rewind`, `recap2`, `afterwin`; `rr2-flags` / `?ff=`) | `flags.js:6-7` |
| **Motion** | `js/motion.js` (`rr2-settings.motion`: auto/reduce/full → `<html data-motion>` + bus `motion:change`) | `motion.js:8-58` |
| **Boot** | `js/main.js` (save sweep before anything reads, lazy game graph, built-in fallback picker, one-shot resume after 2D→3D reload) | `main.js:19-22`, `:80-95` |

**RPC names the client calls** (names only, all in `net.js`): `rr_register2`, `rr_profile`, `rr_rename`, `rr_sync_progress2`, `rr_create_group`, `rr_join_group`, `rr_leave_group`, `rr_my_groups`, `rr_group`, `rr_create_challenge2`, `rr_daily`, `rr_weekly`, `rr_begin`, `rr_checkpoint`, `rr_finish`, `rr_send_energy`, `rr_claim_energy`, `rr_log_event`, `rr_group_feed`, plus the `verify-result` function. The publishable key is a client constant in `net.js` (value not reproduced). Supabase is **production**: no staging exists (FINAL_REPORT §4 / CR-22/23).

### 1.2 Data flow

The engine flow is unchanged from ARCHITECTURE §3:
1. `turn()` gates ⚡ (`game.js:1033-1041`, `E.rollCost`).
2. `E.rollDice` runs, then `persist()` saves before any animation (`:1043-1044`).
3. The scene animates dice and hops. Payday floats show a local running cash value (`:1067-1068`).
4. `applyOut(out)` maps `out.effects` / `spawn` / `despawn` / `news` to scene, UI and audio (`:1193-1269`).
5. `render()` calls `E.metrics` → `ui.renderHUD` + `ui.renderSheet` (`:724-743`).
6. `landing` → card → `E.choose` → `checkpoint()` + `persist()` (`:1105-1185`).

### 1.3 Does the view layer keep its own copy of balances, ownership or results? (brief §7 forbids this)

| Place | What it holds | Verdict |
|---|---|---|
| `ui.js:294 shownCash` + `setCash` tween | The last cash value it drew, used only to animate the counter | Display tween. `render()` always overwrites it from `metrics().cash`. OK |
| `game.js:1060-1068` payday hop | `let cash = m0.cash; cash += pd.amount` (amounts from the engine's `out.paydays`), shown with `ui.setCash` | Transient. `render()` at `:1074` corrects it. OK, but it is UI arithmetic on money. Keep it transient and never persist it |
| `scene.js:1163 city` Map / `board2d.js:23 city` Map | Spawned objects keyed by the engine's `cityModels` keys (`a<id>`, `h:<model>`, `v<id>`, `f`, `L:*`) | View cache. **Gap:** a full reconcile (`syncCity(E.cityModels(S))`) runs only at game start (`game.js:651`). After that the city changes only through the engine's `out.spawn` / `out.despawn` (`:1229-1232`). There is no per-render reconcile → G-03 |
| `game.js:755-776 syncLifeCity` | Decides life buildings (`L:home`, `L:wedding`, `L:uni`, `L:pension`, `L:index`, `L:side`, `L:hospital`) from `metrics()` **plus `S.ui.weddingAge` / `S.ui.burnSeen` / `S.ui.lifeSeen`** | View-side derivation whose helper state is **saved in the slot** → G-09. `L:pension` / `L:index` reflect real holdings; the others reflect life events, not owned assets |
| `game.js:425-445 prevLevels` | Last business stage / upgrade level drawn, for level-up feedback | View cache, rebuilt from `metrics()` on each start (`prevLevels.clear()` `:506`). OK |
| `ui.js:1008 fundMonthsNow` | `metrics().emergency.months`, used as "before" in the impact table | Copy of an engine value. OK |
| `ui.js:2132 msBase` | The milestone quarter already celebrated (25/50/75 %) | Feedback state, not saved. OK |

**Conclusion:** no view module owns money, ownership or results. Two weak spots: city reconcile only on start (G-03), and life-building helper state stored in `S.ui` (G-09).

---

## 2. Feature inventory vs brief §2 / §19

Legend: **Impl** = code exists · **Active** = reachable by default (flags) · **Backend** = needs Supabase production.

| Feature (brief) | Impl | Active | Backend | Where (evidence) | Notes |
|---|---|---|---|---|---|
| Lobby with progress map | ✅ | ✅ | No (profile sync optional) | `lobby.js` views `:252-261`; `#lbMapH` (T7 K-2) | Map unlocks: `progress.js:8` (wN needs w(N-1) unlocked + ≥1★) |
| 4 worlds (השכונה / העיר הגדולה / הנמל הגלובלי / עמק העתיד) + history `h` | ✅ | ✅ | No | `worlds/w1-w4.js`, `h.js` | Win conditions: §4.1 |
| Characters with different economics | ✅ | ✅ | No | w1 teacher/driver/dev/doctor (`w1.js:54-60`), w2 lawyer/chef/pm, w3 importer/exporter/captain, w4 founder/engineer… | Per-character `maxMonths` / `stars` thresholds |
| Stars, titles, pawns, achievements | ✅ | ✅ | Optional (`rr_sync_progress2`) | `progress.js:1-25`, `:38-43` pawns; `achievements.js`; `engine.js:4861 starThresholds`, `buildEnd` | ★★★ also needs happiness ≥ 60 and a 3-month emergency fund (`buildEnd`) |
| Roll limit ⚡ | ✅ | ✅ (free / history) | Gifts / claims only (`rr_send_energy`, `rr_claim_energy`) | `energy.js:1-25` (max 25, +1 / 6 min, `rr2-energy`); `engine.js:55-61 rollCost` (ranked 0, learn 0, first 10 tutorial rolls 0) | When ⚡ runs out, the game is saved (TASK_BOARD decision) |
| Free practice / learning mode | ✅ | ✅ | No | `learn:true` on free (`engine.js:157`), own slot `rr2-save-learn-<w>` (`game.js:120`); "💡 שאלת רגע" `practice.js` | No stars, ⚡ or feed (`progress.js:182`) |
| Personal dream | ✅ | ✅ | No | `systems/dreams.js`; `engine.js:158`, `:4634`; HUD `ui.renderDream` (`game.js:735`) | Presentation only, no economic effect |
| Help / mentor levels (מתחיל / מתקדם / מומחה) | ✅ | ✅ | No | `systems/mentor.js:5-22`; ❓ `ui.js:391-404`; `game.js:989 mentorMenu` | Ranked always `hint` (`mentor.js:16`) |
| Daily / weekly challenge | ✅ | ✅ | **Yes** (`rr_daily`, `rr_weekly`, `rr_begin`, `rr_checkpoint`, `rr_finish`, verify-result) | `lobby.js:2202-2203 playRanked`; offline finish queue `rr2-pending-finish` (`lobby.js:404-415`) | Testable only with `tests/fakebackend.py` |
| Groups and competition, duels | ✅ | ✅ | **Yes** (groups RPCs, `rr_group_feed`, `rr_log_event`); a duel = free game with a seed from the link | `lobby.js:2204-2205`, `:1282-1289` feed | — |
| Lesson library | ✅ | ✅ | No | `library.js` (`rr2-library` v2) | — |
| Time machine (מכונת הזמן) | ✅ | ✅ | No (lazy `data/real.js`) | `engine.js:104 createGame` history; `game.js:554-559 loadRealData`; slot `rr2-save-history-<scenario>` (`game.js:122`) | — |
| Emergency fund (קרן חירום) | ✅ | ✅ | No | `engine.js:728 emergencyOf` (savings ÷ expenses, target 3); HUD 🛟 chip `ui.js:437`; impact row `ui.js:1017-1019`; ★★★ gate | Revealed at month 4 in tutorial games (`onboard` revealTick) |
| "רגעי החלטה" (decision moments / practice rewind) | ✅ | ✅ (flag `rewind` default on, `flags.js:6`); never in ranked (`flags.js:59-63`) | No | `rewind.js:1-20`; `ui.js:2216 momentsSheet`; lobby `t6-moments` (`lobby.js:2224`) | Live only in learning games or branches; free games only after they end (rewind.js review M4) |
| 3D + light mode (מצב קל) | ✅ | ✅ | No (three from CDN) | `select.js:32-71`; HUD 🪶 `index.html` `#liteBtn`; lobby setting `lobby.js:2189-2194`; `game.js:314-332` | 2D→3D = page reload (§3.4) |
| Rivals / ghosts (T6) | ✅ | ✅ (flag `rivals`) | No (module worker) | `ghosts.js:75`, `ghost-worker.js` | — |
| Mentor TTS (הקראה) and mute | ✅ | ✅ | No | `ui.js:699-737`; `game.js:382-386` (`rr2-settings.voice`); `audio.js:41` (`rr2-settings.muted`) | — |
| Graphics quality tiers | ✅ | ✅ | No | `render/quality.js` (auto/high/mid/low, `rr2-settings.quality`; governor emits `quality:change`) | Brief §17 asks for low / medium / high / auto: the tiers exist, labelled גבוהה / בינונית / חסכונית |

Nothing in the brief §2 list is missing. Every item that needs the backend talks to **production** Supabase: in this upgrade it can be tested only against `tests/fakebackend.py` / `fakeverify.mjs`.

---

## 3. Saves

### 3.1 Keys (localStorage unless noted)

| Key | Owner | Content | Notes |
|---|---|---|---|
| `rr2-save-free-<w>` | game.js | Wrapper `{v:3 (WRAP_V), app:'nl1', sv:<engine v>, cfg, state, savedAt}` | `saves.js:7`, `:272` |
| `rr2-save-learn-<w>` | game.js | Same wrapper (learning game) | `game.js:120` |
| `rr2-save-branch-<w>` | rewind.js / game.js | Practice branch | Evictable first (`saves.js:135-163`) |
| `rr2-save-history-<scenarioId>` / `-seed-<n>` | game.js | Time machine | `game.js:122` |
| `rr2-save-<resultId>` | game.js | Ranked game (+ server checkpoint) | `game.js:123` |
| `rr2-bak:<slot>` | saves.js | ≤2 backups per slot, ≤8 in total, ≤256 KB soft (`{v:1, items:[{at, reason, app, sv, raw}]}`) | `saves.js:8`, `:177-206` |
| `rr2-quarantine:<key>` | saves.js | Corrupt non-slot data | `saves.js:225-239` |
| `rr2-progress` | progress.js | Stars, achievements, pawns, streak, meta | Never evicted |
| `rr-player` | net.js | `{id, secret, nickname}` | Secret = password; never evicted |
| `rr2-energy` | energy.js | ⚡ | — |
| `rr2-library` | library.js | v2 `{ids, read, ctx, practiced}` | — |
| `rr2-pending-finish` | lobby.js | Queue of unsent `rr_finish` calls | — |
| `rr2-settings` | **shared** by audio.js (`muted`), game.js (`turbo`, `voice`, `lite`, `liteOffered`), motion.js (`motion`), quality.js (`quality`), select.js (reads `lite`), main.js (reads `theme`), lobby.js | Read-merge-write by each module | **The 2D/3D preference = `rr2-settings.lite`** |
| `rr2-flags` | flags.js | Feature-flag overrides | — |
| `rr2-coach`, `rr2-reveal`, `rr2-onboarded`, `rr2-seen-chal`, `rr2-ref`, `rr2-quiz-credit`, `rr2-fallback` | onboard / lobby / main | UI flags | — |
| `rr2-ghosts` | ghosts.js | Ghost cache (evictable) | — |
| `rr2-branches`, `rr2-last-game` | rewind.js | Branch metadata, last finished game | — |
| `rr-flat-v2` | render/flatten.js | Flat-shader probe result | — |
| `rr2-resume-once` (**sessionStorage**) | game.js → main.js | The cfg to resume after the 2D→3D reload | `game.js:330`, `main.js:89-95` |

### 3.2 Versions and migrations

- **Engine state:** `SAVE_VERSION = 4` (`engine.js:50`). `deserialize()` (`engine.js:335-343`) runs `v=1` → `migrateV2` (24→40 tiles) → `v=3` → `migrateV3` → `v=4`. Anything else throws `save_incompatible`. `v4Defaults` (`engine.js:183-224`) is idempotent and runs on every load, filling missing fields.
- **Wrapper:** `WRAP_V = 3`. A missing `v` reads as legacy wrapper 2 (`saves.js:89`).
- **Classification** (`saves.js:70-92`): `empty | corrupt | old | current | future | over`.
  - `future` is never overwritten without a backup (`saves.js:266-270`).
  - `old` is backed up before migrating (`:253`).
  - `corrupt` / `incompatible` are backed up, then deleted (`:250`, `:258`).
  - After an upgrade, future backups come back on their own (`autoRestoreFuture` `:351-362`).
- **Boot sweep** (`main.js:21`, `saves.js:324-349`) quarantines unparsable keys before any module reads them.
- **Ranked:** `rewind.pickRankedState(local, srv)` decides between the local save and the server checkpoint (`game.js:582`). `S.ui.seq` is the monotonic checkpoint counter (`:153`).
- **Rules gate:** `st.rules` 3/4 (`engine.js:41`, `:107`, `:355`). Ranked rules follow the date key (CR-29).

### 3.3 Stored vs derived

- **Stored:** the whole engine state (`state`). It is plain data and **includes**:
  - the RNG stream positions and `actions` (the replay log);
  - `tl` (the T6 timeline: nw, liq, debt, pas, exp, pg, hap, en per payday);
  - `log`, `marks`, `dq`;
  - `S.ui`.
- **Derived (never stored):** `metrics()` (cash flow, passive income, expenses, net worth, goal progress, emergency months), the city (`cityModels`), levels, the HUD, the sheet, and impact previews. **None of the 3D or 2D scene state is stored.**
- **Display data that IS stored, in `S.ui`:**
  - `seq` (needed);
  - `coach`, `firstPayday`, `fundWarn` (onboarding);
  - `hist` (≤240, the history-mode index path);
  - `pensionHist` (≤120);
  - `trackMonth`;
  - `weddingAge`, `burnSeen`, `lifeSeen` (life buildings);
  - `inflReality`;
  - `tl` (fallback only when the engine has no `st.tl`).

  Evidence: `saves.js:366-380`, `game.js:745-776`, `:713-717`, `:1254`.
  - Most of this is not derivable from the engine state (`pensionHist` is not in `st.tl`), so it is small legitimate UI history.
  - All of it goes to the server in ranked checkpoints. **Rule:** the 3D upgrade adds nothing here.

### 3.4 What a save restores for the city, and how 2D/3D switching behaves

- On load, `startInner` (`game.js:647-653`) runs `buildWorld(W)`, `placePawn(S.pos)`, `syncCity(E.cityModels(S), {silent:true})`, `syncLevels(false)`, then `render(false)`. `render` → `syncLifeCity` adds the life buildings.
  - The city is therefore rebuilt **entirely from the engine state**: assets `a<id>` (with business `stage` / `activity`), holdings grouped by ticker model `h:<model>`, active angel deals `v<id>`, the w4 foundation `f` (`engine.js:768-780`), and the `L:*` life buildings (`game.js:755-776`).
  - `scene.syncCity` diffs (`scene.js:1280-1288`): it removes keys that are not wanted and spawns missing ones without animation.
- A pending event resumes through `S.phase` / `S.pending` → `handleLanding` (`game.js:674-678`). An open decision survives reloads and renderer swaps because the card is rebuilt from `E.currentEvent`; cards are never cached (ARCHITECTURE §3).
- **3D → 2D** (`setLite(true)`, `game.js:314-326`):
  1. `persist()`;
  2. `gen++` (cancels the running flows);
  3. `closeCard()`, `scene.dispose()`;
  4. `startGame({...CFG, resume:true})` in the same page.

  It consumes no roll (the dice were persisted at roll time, `game.js:1044`), does not change money, and reopens the pending card from the engine. The card's local UI state is lost: qty slider, hint panel, impact tab.
- **2D → 3D** (`reloadInto3D`, `game.js:327-332`): `persist()`, `rr2-settings.lite=false`, `sessionStorage['rr2-resume-once']=CFG`, then `location.reload()`. `main.js:91-95` resumes **only non-ranked** games. A ranked game goes back to the lobby and must re-enter through `rr_begin` (network) → G-06.

---

## 4. Economy HUD and decision card (brief §14)

### 4.1 Win condition per world (engine truth) and what the HUD shows

| World | Goal (engine) | Hold / time | HUD goal meter (`ui.js:351-377`) |
|---|---|---|---|
| w1 השכונה | `goal:{type:'passive'}` (`w1.js:22`): passive ≥ expenses (and passive > 0) (`engine.js:550-556`) | Must hold `GOAL_HOLD = 2` consecutive paydays (`engine.js:548`, `checkEnd`). Free mode never ends on time (`timeUp` only when not free). Stars: months ≤ t3 / t2 / maxMonths per character (`w1.js:25`, `:54-60`) | "מד החופש" %, bar = passive / expenses, sub-line "₪P / ₪E", "⏳ מחזיק n/2" |
| w2 העיר הגדולה | `passive` (`w2.js:32`) | Same; maxMonths 76 | Same + rate indicator "ריבית x%" with an arrow (`ui.js:326`) |
| w3 הנמל הגלובלי | `netWorth` target ₪9,000,000 (`w3.js:35`) | Same hold; maxMonths 60 | "שווי נקי" %, "₪NW / ₪9M" + dollar indicator, shield when hedged (`ui.js:327-332`) |
| w4 עמק העתיד | `netWorthImpact` ₪9,000,000 **and** impact 90 (`w4.js:34`) | Same hold; maxMonths 70 | Two bars (שווי / השפעה); % = the weaker part (`ui.js:404-409 shownPct`); "+n בדרך" for vesting impact |
| h מכונת הזמן | `benchmark` (net worth vs buy-and-hold) | Time-boxed | "מול 'קנה והחזק'" |

### 4.2 Brief §14 fields vs what is on screen today

| Field (§14) | Shown today | Where |
|---|---|---|
| Cash | ✅ primary | `#hCash` `ui.js:321` |
| Monthly cash flow | ✅ primary | `#hCf` `ui.js:322` |
| Passive income | ⚠ only as the goal sub-line in w1/w2 ("₪P / ₪E"); line items in the sheet | `ui.js:375`; `renderSheet` `ui.js:615` |
| Expenses | ⚠ the same (sub-line in w1/w2) and the sheet | — |
| Month | ✅. **In free mode without the limit** (`setMonth(m.month, m.mode==='free'?0:m.maxMonths)` `ui.js:323`) | — |
| Assets and debts | ❌ not in the HUD. Sheet only (`metrics.totalAssets`, `totalLiabilities`, `assets`, `liabilities` exist, `engine.js:688-695`) | — |
| Emergency fund | ✅ 🛟 chip `months/3` with a bar (secondary life row) | `ui.js:437` |
| Current mission goal | ⚠ tutorial chain only (`metrics.nextGoal`: cushion → asset → fund, `engine.js:4551`), then the dream card. The lobby's "המשימה הבאה" (`progress.nextGoal`) is **not** shown in game | `game.js:733-735`; `ui.js:2286` |
| Progress to the world's win condition | ✅ % meter + parts. **Star deadlines (★★ / ★★★ months) are never shown in game**; the ★★★ fund and happiness gates appear only in chip tooltips, a one-time toast (`game.js:713-718`) and the end screen | — |
| w1: how much passive income is missing | ⚠ implicit ("₪P / ₪E"); no explicit "חסרים ₪X" | — |
| Secondary info behind an expander | ✅ life row with a "⋯" overflow (`ui.js:446-470`) + sheet | — |

### 4.3 Decision card (`ui.openEvent` `ui.js:868-905`, impact `ui.js:986-1050`)

| Element (§14) | מתחיל (`guide`) | מתקדם (`hint`) | מומחה (`pro`) |
|---|---|---|---|
| What happened | ✅ title / text / tag from `describe()` | ✅ | ✅ |
| Options | ✅, with one highlighted `primary` | ✅ no highlight. Verdict words stripped (`mentor.js:30-45 neutralLabel`) | ✅ same |
| Immediate cost / monthly effect | ✅ per-option net labels and effect chips; totals on every option (`ui.js:1108-1120`) | Raw amounts. Per-option totals collapsed under "📊 החשבון המלא" (**owner-approved 2026-11-23**, TASK_BOARD:102) | Same as hint |
| Before/after preview ("📊 מה זה עושה לי?") | Auto-open for the highlighted option (`ui.js:993`) | Available, collapsed (on demand) | Available, collapsed |
| Further consequences | Main risk, new debts, two scenarios (normal / hard 6 mo), assumptions, disclaimer (`ui.js:1011-1043`); shortfall warning "חסרים ₪X — הבנק ייתן הלוואה…" (`ui.js:1170-1175`) | Same | Same |
| Hint | — (the highlight is the hint) | 💡 on request, counted (`ui.js:942-978`) | None (`engine.js:4361`) |
| After the decision | Verdict pill: score 0–100 + graded label (חזקה / סבירה / יש מה לשפר / מסוכנת / יקרה) + why + principle (`ui.js:1641-1680`); mentor "after" line; floats / coins / sounds | Same | **No verdict during play** (`engine.js:2786`); full review at the end |

The brief's "don't present decisions simply as good/bad": the verdict is a graded score with a reason and a principle, separated from luck (FINAL_REPORT §1). The scoring rubric is part of game balance, so **it must not change**.

---

## 5. Feedback (brief §15)

| Economic event | Visual | Audio | Evidence |
|---|---|---|---|
| Purchase | Building spawn (drop / dust; golden sparkle), coins on positive cash | `buy` / `card` from the engine's `effects` | `game.js:1232`, `scene.js:1236-1258` |
| Income (payday) | Float "משכורת +₪x" at the pawn, coins to the HUD, cash count-up, month tick | `coin` | `game.js:1090-1096`, `ui.js:297-315` |
| Expense / loss | Red float; shake (≤0.25, skipped when reduced) on market/bank/fx/shipping losses | `loss` | `game.js:1145`, `:1210-1213` |
| New debt | **Only `ui.bumpCash()`** (a CSS bump on the cash stat). Debts appear in the sheet / impact table | — | `game.js:1216` → G-07 |
| Upgrade / business stage | `scene.bump` + "שדרוג!" float; level-up card (B channel); level-down toast | `unlock` / `loss` | `game.js:1220`, `:432-445` |
| Goal milestones | 25/50/75 % toasts once per game; "⏳ מחזיק" toast; tutorial goal toasts | `coin` | `ui.js:2133-2139`, `game.js:1255-1256` |
| Leaving the race (win) | `scene.celebrate`, confetti (0 at low tier / reduced), end screen | `win` | `game.js:1507-1511`, `scene.js:1433-1447` |

- **Reduced motion:**
  - `motion.js` is the single source of truth: in-app `reduce` / `full` wins over the OS, `auto` follows `prefers-reduced-motion`.
  - The CSS rules exist twice, under the media query and under `[data-motion=reduce]` (`game-play.css:250-269`).
  - 3D: `scene.setMotion` (`scene.js:202-208`). Reduced motion removes shake, confetti, particles and the hand; dice snap; hops teleport (`:1142`); spawns get a 120 ms scale (`:1250`).
  - 2D: `board2d` has `motionOverride`.
  - game.js wires `motion:change` (`game.js:221-227`).
- **Mute persistence:** `rr2-settings.muted`, read at import (`audio.js:11`, `:41`).
  - Unlocked on the first gesture (`main.js:25-26`).
  - Suspended when the tab is hidden (`game.js:249`, `audio.js:39-40`).
- **Double-play guard:**
  - The same cue cannot repeat within 40 ms (`audio.js:150-153`).
  - `applyOut` drops sounds already played during hops (`skipSounds`) and the duplicate achievement fanfare (`game.js:1204-1207`).
  - Sounds in one result are staggered 110 ms.
  - No information is carried by sound alone: every cue pairs with a toast, float or live region (`#dieSr` `ui.js:758`, `ui.announce`).
- **Double-action guards (relevant to §13):**
  - `turn()` returns early on `stuck || busy || !S || S.over || ui.isEventOpen() || lobby open` (`game.js:1023`).
  - Cards use `working` + `ctl.busy` (`:1163-1164`).
  - `gen` invalidates stale flows.
  - `persist()` runs right after `rollDice`, so a reload resumes at the landing with the same dice and no extra ⚡.
  - `landing()` is idempotent (ARCHITECTURE §6).
  - Scene tweens resolve only inside the render loop (`scene.js:~125-135`, `:186-193`). The loop stops in a hidden tab (`:157`), so a turn **pauses** there and finishes on return. A dead WebGL context is caught by the R3 stuck handler (`game.js:296-302`). No tween has its own timeout → G-08.

---

## 6. Mobile, RTL and accessibility (brief §16): what earlier verification found

From `docs/next-level/verification/T7-final.md` §3 and `FINAL-verify.md`, all runs in headless Chrome with swiftshader, no real device, no screen reader:

- **axe strict** (`a11y_e2e --strict --strict-allowlist`): HEAD **PASS**, 0 critical / 0 serious on every visited screen. Base had 112.
  - Moderate findings left: `region`, `heading-order`, `landmark-one-main`, `page-has-heading-one` (the last on the 2D board).
  - Screens 10/11/12/14 (forced cards, story inbox, `#gm`, asset info) are **not covered** by the harness; 15 (help) and 18 (learning end) are a harness gap (F-10).
- **Keyboard:** K-1, K-2, K-3 (7 key presses lobby → game), K-4 (roll via Space; 24 Tabs), K-5 (card focus trap), K-7, K-8 (phone sheet trap), K-9 all PASS. K-6 / K-10 not implemented.
- **Targets:** AX-T primary ≥44 px PASS on HEAD.
  - Sheet rows 60×44, modal actions 169–230×44, settings radios 100–144×44 (T5-verify:172-174).
  - Remaining: chips of 38 px and `.rvp` 68×38 (T5-verify:58); world-view radios 18×18 / 22×22 at 360 px (T5 D13).
- **Text size and width:** AX-W (width) / AX-Z2 200 % PASS. A future-save modal at 360×740 has no horizontal scroll (T1-verify A-24). The life row never overflows (the "⋯" chip, `ui.js:446-470`).
- **Safe areas:** top and bottom only (`game-play.css:7`, `:209`; `game.css:58 --safe-b`; `lobby.css:447`). No left/right insets (landscape notch) → G-10.
- **Live regions:**
  - Dice announced (`#dieSr`).
  - **Landing tile name not announced** (CR-27, AX-C REPORT).
  - Board accessible name counts the city's assets (`ui.js:346-347`).
- **Open findings from earlier tasks:**
  - T3 D6: the 🗓️ chip is unreachable on ≤430 px when the row fits.
  - Playtest B2: `[object Object]` in the business report notes (`ui.js:1446`). Check whether it was fixed before relying on it.
- **2D tiles:** names are truncated with an ellipsis (`stability.css:24`). Each tile is `aria-hidden` and carries the full name only in `title` (hover) (`board2d.js:131-134`). This is the "names cut off" finding in brief §12 → G-05.

---

## 7. GitHub Pages and assets (brief §20)

- **Base path:** no build and no absolute paths. A grep for `"/assets`, `"/js`, `"/css` found nothing. Assets resolve relative to the document (`scene.js:321-326` `assets/<dir>/<name>.glb`) or to the module (`lobby.js:24` `new URL('../'+p, import.meta.url)`). This works under `/rat-race-game/`.
  - Routing uses only query parameters (`?ff=`, `?ref=`, `?duel=`, `?hq`, `?fx=`) and `history.replaceState(location.pathname)`, so refreshing or opening a deep link is safe and no 404.html is needed.
- **Workers:** one module worker, `new Worker(new URL('./ghost-worker.js', import.meta.url), {type:'module'})` (`ghosts.js:75`). Subpath-safe.
- **Split JS:** native ES modules, with lazy `import()` for game, ui, scene, board2d, overlay and summary (`main.js:13-17`, `:52-58`; `select.js:24`). `index.html` modulepreloads only the lobby graph, kept in sync by `tests/preload.test.mjs`.
- **Models:** 38 `.glb` in `assets/{w1..w4,life,pawns,history}` (12 MB total), built from `blender/*.py` / `.blend` in the repo. They are loaded lazily per world (CR-B6 / CR-05), with a per-GLB timeout and a failure list (`scene.js:343-368`).
- **Textures:** CanvasTextures only (`scene.js` ×6, `kit3d.js` ×2). No texture files. 7 PNG + 6 WebP lobby card images.
- **Sound:** none as files; all synthesized (`audio.js:1`).
- **Fonts:** Rubik and Secular One from **Google Fonts CDN** (`index.html` `<link>`). three@0.170.0 + addons from **jsDelivr CDN** via the importmap, with no SRI. If either is blocked, three falls back to 2D (`select.js:54`, reasons `three-failed` / `three-timeout`).
- **Licences / attribution:** the only licence file in the repo is `tests/vendor/axe-core/LICENSE`. There is **no** LICENSE / ATTRIBUTION file for three.js (MIT), the Google Fonts (OFL) or the in-house Blender assets → G-11.
- **Secrets:** only the publishable Supabase key and the project URL are in the client (by design). The player secret is in `rr-player` (per device).

---

## 8. Gap list vs the brief

Severity: P0 = must be settled before or while building the 3D vertical slice · P1 = needed to meet the brief · P2 = polish / hygiene.

| ID | Sev | Brief § | Gap (evidence) | Proposed change | Files | Risk |
|---|---|---|---|---|---|---|
| G-01 | **P0** | 7, 11, 19 | World themes and model names live in **pinned engine files** (`worlds/w*.js` theme / models; `engine_pin.js` lists them) | Keep all new 3D visual config render-side (extend `render/vocab.js worldStyle`, a new `render/worlds3d.js`). Map engine model names to new meshes in the renderer. **Do not edit `js/worlds/*` or `engine.js`** for visuals. Add a test that asserts the `engine_pin.js` hashes are unchanged on this branch | `js/render/*`, `js/scene.js` | Low if followed. Breaking it invalidates ranked verification (production redeploy needed) |
| G-02 | **P0** | 18 | `S.ui` is saved in the slot and the server checkpoint. Any display state added there grows saves and checkpoints | Write the rule into the task specs: camera, quality, 2D/3D and similar prefs go to `rr2-settings`. Derived city state is never stored. No `SAVE_VERSION` / `WRAP_V` change for visuals | `js/game.js`, `js/saves.js` (no change) | — |
| G-03 | P1 (a precondition for the §10 city) | 7, 10, 22.6–8 | Full city reconcile only at start (`game.js:651`). Afterwards it is incremental via `out.spawn` / `despawn` (`:1229-1232`). No guarantee that the view equals `cityModels(S)` after each decision | Call the idempotent `scene.syncCity(E.cityModels(S))` (both renderers have it) at the end of `render()` or after `applyOut`, keeping animations for engine spawns. Add a test: after every `choose`, scene keys = `cityModels` keys (+ `L:*`) | `js/game.js`, `js/scene.js:1280`, `js/render/board2d.js:246` | Low. Check the cost on large cities (scene diff is O(n)) |
| G-04 | P1 | 14 | HUD lacks: star deadlines (month limit hidden in free mode, `ui.js:323`); assets/debts totals; explicit "חסרות ₪X הכנסה פסיבית" in w1/w2; ★★★ gates (fund ≥3, happiness ≥60) as visible criteria | Add an expandable "יעד העולם" panel next to `#hGoal`: parts from `metrics.goalParts`, the gap shown as `target − value` of the engine's own goal part (presentation only), ★★/★★★ months from the exported `E.starThresholds(world, charId, rules)`, `metrics.totalAssets/totalLiabilities`, fund and happiness gates. **Do not add fields to `metrics()`** (G-01) | `js/ui.js`, `css/game-play.css`, `js/game.js` (ctx) | Low. Rules unchanged |
| G-05 | P1 | 12, 16 | 2D tile names are truncated and `aria-hidden`, with the full name only in `title` (hover) (`board2d.js:131-134`, `stability.css:24`). The landing tile is not announced (CR-27). The 3D board has no text alternative for tiles | Short name + full description on tap / Enter. Announce "נחתת על {tile}" in the existing live region (`#dieSr` / `ui.announce`). Add an accessible tile list (both renderers) | `js/render/board2d.js`, `js/scene.js`, `js/ui.js` | Low |
| G-06 | P1 | 8, 18 | 2D→3D needs a page reload (`game.js:327-332`). Ranked games are not auto-resumed after it (`main.js:91`): the player lands in the lobby and needs `rr_begin` (network) | Either support re-initialising three in the same page (dispose → `init`), or after the reload route a ranked cfg through the lobby's own `playRanked` resume with a clear message. Test "a decision window is open during the switch" for both directions | `js/game.js`, `js/main.js`, `js/scene.js` | Medium (WebGL lifecycle, double renderers) |
| G-07 | P1 | 15 | New debt only bumps the cash stat (`game.js:1216`) | When `metrics().totalLiabilities` rises between the before/after of a decision, show a short "חוב חדש ₪X · ₪Y בחודש" float or chip (numbers from `metrics.liabilities` / the impact table, not computed) | `js/game.js`, `js/ui.js` | Low |
| G-08 | P1 (team ה) | 13 | Turn animations resolve only inside the render loop. No per-tween timeout. A hidden tab pauses the turn; a dead loop is handled only by the context-lost path | Add a wall-clock fallback (setTimeout = dur + margin) that resolves awaited tweens to their end state, plus a test for background / foreground mid-hop | `js/scene.js`, `js/render/board2d.js` | Low |
| G-09 | P2 | 18 | Life-building helper state in `S.ui` (`weddingAge`, `burnSeen`, `lifeSeen`). Edge case: an old save without `weddingAge` shows both `L:home` and `L:wedding` on the first render (`game.js:758-760` evaluation order) | Freeze: add nothing. If the 3D team rewrites life buildings, derive them from engine life events where possible and keep the existing keys for compatibility. Fix the evaluation order | `js/game.js` | Low |
| G-10 | P2 | 16 | No left/right safe-area insets | Add `env(safe-area-inset-left/right)` to `.hud`, `#bar`, sheet and modals | `css/game-play.css`, `css/stability.css` | Low |
| G-11 | P2 | 20 | three + addons and fonts are hotlinked from CDNs with no SRI. No licence / attribution file | Vendor three@0.170.0 (and the used addons) under the repo, point the importmap there, and self-host the two fonts (OFL). Add `ATTRIBUTION.md` (three MIT, fonts OFL, Blender assets own). Measure PF-6 / PF-8 before and after | `index.html`, new `vendor/`, docs | Medium (bytes and budgets; the cache-busting path) |
| G-12 | P2 | 16 | Small targets left: 38 px chips, `.rvp` 68×38, world-view radios 18–22 px at 360 (T5 D13) | Raise to 44 px in the HUD / card re-layout | `css/*` | Low |
| G-13 | P2 | 19 | Everything backend-dependent (daily, weekly, groups, feed, energy gifts, verify) can be tested only against production | Use `tests/fakebackend.py` + `fakeverify.mjs` with the network guard (`--no-proxy-server`, TASK_BOARD incident 2026-11-21). State explicitly in the final report that these were not run live | tests only | — |
| G-14 | P2 | 7 | `rr2-settings` is written by 6 modules with read-merge-write | Fine single-threaded. A new 3D pref must use the same merge pattern (never `setItem` of a fresh object) | — | Low |

---

## 9. Brief items that would change rules or economy (forbidden unless a proven bug)

- **§14 "show the expected change before confirming":** this is already available at every level as the collapsed "📊 מה זה עושה לי?" panel. Making per-option totals or the panel always open at מתקדם / מומחה would reverse the **owner-approved 2026-11-23** design ("no precomputed amounts at advanced/expert", TASK_BOARD:102; FINAL_REPORT §1). That is not an economy change, but it is a game-design change the owner has already decided. Keep the current behaviour.
- **§14 "how much passive income is missing" / "progress to the win condition":** fine as presentation derived from `metrics.goalParts` and `starThresholds`. Adding fields to `metrics()` or touching `goalOf` changes `engine.js` (pinned, G-01) and the ranking-safe `goalProgress` offsets (`engine.js:599-627`). Do not.
- **§14 "don't present decisions simply as good/bad":** the verdict score and labels come from the engine's evaluator (`engine.js:2786`). Changing labels, thresholds or what is scored would change scoring = forbidden. Wording-only tweaks in `ui.js VERDICT` are allowed but not needed.
- **§10 "a building per real asset", "upgrades only if the game has them", "don't show a share as an apartment":**
  - Upgrades exist: w2 `W.upgrade.kinds` and business stages 0–3 (`game.js:425-431`).
  - Holdings are already grouped per ticker model (`h:<model>`), angels are `v<id>`, the w4 foundation is `f` (`engine.js:768-780`).
  - The 3D layer must map these existing kinds and must not invent new ownership.
  - Decorative scenery must be visually distinct from player assets (the current kit `fixtureItems` is dev-only `?fx=`).
- **§11 world themes:** must not touch `worlds/*` (G-01). Opening conditions, unlocks (`progress.js:8`), stars (`w*.js stars`, per-character `stars`) and economics stay as they are.
- **§17 quality tiers:** these exist already. Changing tier configs is visual only and allowed (`quality.js:13-17`).
- **Proven bugs found during this research:** none in the economy or rules. Only display edge cases (G-09).

---

## 10. Items for the main session's memory (all from this repo, not from user memory)

- The engine pin includes `js/worlds/*`, `systems/*`, `practice.js` and `data/*`. Visual config must stay render-side (`supabase/functions/verify-result/engine_pin.js`).
- The 2D/3D preference is `rr2-settings.lite`; quality is `rr2-settings.quality`; motion is `rr2-settings.motion`; mute is `rr2-settings.muted`.
- 2D→3D is a page reload with a one-shot `sessionStorage['rr2-resume-once']`; ranked games are not auto-resumed.
