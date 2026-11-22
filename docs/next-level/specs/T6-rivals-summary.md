# T6: Rivals & deal competition, success metrics, personal end summary, practice rewind, continue-after-win (spec)

Status: ready to implement, in four parts (ENGINE, RIVALS/SHELL, IN-GAME UI, LOBBY) plus one **server part that is NOT applied** (awaiting the owner's approval) · Branch `feat/rat-race-next-level` · Owner brief §15, §16, plus "continue after win" (deferred from T4 D-11).

Inputs:
- `research/rivals-summary.md` (cited **RS§n**): ghost players, measured costs, the info-limit rule, end-summary data gaps, rewind measurements, the ranked hardening SQL draft (`/tmp/research-t6/sql/t6_append_only.sql`), continue-after-win.
- `research/gameplay.md` (**GP§n**): §5 fairness and replay rules, §7d archetypes.
- `specs/T2-strategic-depth.md` (**T2§n**): streams `rival` (12) and `listing` (13) reserved, due diligence (DD), `publicView`, evaluator, archetype sim policies, acceptance matrix.
- `specs/T3-stories-business.md` (**T3§n**): story inbox, action `'Q'`, stream `story`, business totals.
- `specs/T4-opening-modes-library.md` (**T4§n**): `learn:true` practice mode, its own `'Q'` (conflict, resolved in §11), A11Y-13 (no timed dismissal).
- `TASK_BOARD.md` (lanes, director decisions).

Line numbers refer to the working tree on 2026-11-21 and **will drift**. Every touch point names the function; search for it.
Priority tags: **P0** must ship · **P1** should ship in the same session · **P2** may be cut and must then be listed as cut.

Contents:
- §0 Scope, binding decisions, lanes, hard rules
- §1 Personas (the four rivals)
- §2 Layer A: ghost players (same seed, same engine, Web Worker)
- §3 Layer B: deal competition on the player's own deal cards (stream `rival`)
- §4 Engine logging data (`st.tl`, `st.marks`, `dq.luckLog`, decision `k`/`k0`)
- §5 Success metrics (raw facts per dimension, compared with the ghosts)
- §6 Personal end summary
- §7 Practice rewind (`js/rewind.js`)
- §8 Ranked hardening (client gate + server proposal, NOT applied)
- §9 Continue after win (`'W'`, `'X'`)
- §10 Save v4, replay, verifier, engine touch-point list
- §11 Action-code registry and cross-spec notes
- §12 UI requirements (in-game)
- §13 Lobby requirements
- §14 Hebrew copy table (exact strings)
- §15 Acceptance criteria (numbered, testable)
- §16 Sim gates
- §17 Risks
- §18 Rollout and work order

---

## 0. Scope, binding decisions, lanes, hard rules

### 0.1 Director decisions (binding, restated)

| # | Decision | Where |
|---|---|---|
| DD-1 | The owner chose the experience "3 investors want this warehouse". Rivals must be felt **during play**, not only after the game. T6 therefore has two layers: **(A) ghost players** (RS R1: four archetypes play the same seed through the unchanged engine from `publicView` only, are shown only up to the player's current month during play, run in a Web Worker with a cache) and **(B) deal competition** on the player's own deal cards (stream `rival`, a fixed number of draws per card, a public interest signal, a hidden outcome that matters only if the player delays). **No timer.** | §2, §3 |
| DD-2 | Success metrics are raw facts per dimension (speed, resilience, decision quality, happiness, business stability) compared with the ghosts. **No composite score.** The logging-only engine data (`st.tl`, `st.marks`, per-event luck log, decision index `k`) rides the same v4 save bump as T2/T3, filled in the shared `v4Defaults`. | §4, §5 |
| DD-3 | The end summary is personal and data-based only (no invented explanations), about 1.5 phone screens by default with "more" sections. The life-story overlay no longer auto-closes. | §6 |
| DD-4 | Practice rewind exists only in free and learn games. Branches live in their own slots and the original is never overwritten. The UI explains the comparison limits. Ranked gets a client gate and, separately and only with the owner's approval, an append-only checkpoint trigger plus a verify prefix check. The client module is `js/rewind.js`. | §7, §8 |
| DD-5 | T3 keeps `'Q'`. Continue-after-win uses `'W'` (keep playing) and `'X'` (retire), free/learn only. T4 picks another letter. | §9, §11 |
| DD-6 | Ghosts never appear on public boards. They appear only in the player's own summary and, as optional reference lines, in group challenges. | §13.3 |

### 0.2 Parts and lanes

| Part | Lane | Files | When |
|---|---|---|---|
| **ENGINE** (§3, §4, §5.1, §9, §10) | engine lane | `js/engine.js`, new `js/systems/rivals.js`, `js/finance/business.js` (business totals, coordinated with T3, §11.3), `tools/sim.mjs`, new `tools/policies.mjs` (re-export only), `supabase/functions/verify-result/verify_core.js` (`CODES` only) + re-pin | **after T3's engine work**, in the same `SAVE_VERSION = 4` release (Path A, §10.4). The deal-competition UI (§12.1) must ship in the **same** release because it shows engine information that changes outcomes. |
| **POLICIES** (§2.3) | engine lane | new `js/rivals/policies.js` (pure, no DOM; imported by `tools/sim.mjs` **and** by the worker) | with the ENGINE part (sim gates need it) |
| **RIVALS / SHELL** (§2.4–2.6, §7, §8.1) | shell lane | new `js/rivals/worker.js`, new `js/rivals/ghosts.js`, new `js/rewind.js`, `js/game.js`, `js/saves.js` (sweep keys), `js/flags.js` | after ENGINE |
| **IN-GAME UI** (§12) | in-game UI lane | `js/ui.js`, `css/game.css` | §12.1 with ENGINE; the rest behind flags |
| **LOBBY** (§6, §13) | lobby lane | `js/lobby.js`, `css/lobby.css`, new `js/recap.js` (end-summary renderer + SVG graph), `js/net.js` (one error string) | behind flags |
| **SERVER** (§8.2, §8.3) | engine lane (edge) + owner | new migration file, `verify-result/index.ts`, `verify_core.js` | **NOT applied. Awaiting the owner's approval.** TASK_BOARD: no writes to Supabase in this wave. |

### 0.3 Hard rules
1. **Fixed draws.** The `rival` stream draws exactly `RIVAL_DRAWS = 4` values on every deal-tile landing and every mystery-tile landing under rules 4, whatever the card turns out to be and whatever the player does. No other T6 feature draws randomness. `listing` (13) stays at 0 draws.
2. **Rivals never see sealed info.** Ghost policies decide only from `E.publicView(ghostSt)` plus static world and `js/systems/*` tables. Deal-competition interest is a pure function of the card's **public** data. Sealed fields (T2§12.1 plus T6's `p.rv.close`, `p.rv.taker`, unrevealed `st.rivalDeals[i].truth`) are never output by `describe`, `metrics`, `publicView`, hints or `impactFor`.
3. **No look-ahead.** During play, no ghost number from a month later than the player's last payday is shown, cached on the main thread or posted by the worker (§2.5).
4. **No hidden money creation.** Ghosts run the real engine. Deal-competition rivals have no balance sheet; losing a deal changes the player's state only by the cost of the step the player chose (§3.5).
5. **No pressure clock.** Competition is counted in *steps the player chooses to take* (inspect, lower offer), never in seconds or turns waited.
6. **Deterministic from the action log.** A lost deal replays identically. Ghost results are deterministic from (cfg, archetype, policy version, engine revision).
7. **No composite score** anywhere in T6. Every comparison is one named raw fact.
8. **All numbers come from the engine.** The UI formats (`fmtM`, `sgn`) and orders; it does no finance math.
9. **No test talks to production Supabase.** Every browser test routes `**/*.supabase.co/**` (T1 rule 5).
10. **Text style:** Hebrew, masculine singular second person through `E.genderize`/`gz()` as the current UI does, numbers in `<bdi>`, no English on screen.

---

## 1. Personas (the four rivals)

The same four personas appear in both layers: as ghost players (§2) and as the interested investors on deal cards (§3). The table lives in the engine (`js/systems/rivals.js`, export `ARCH`) because the engine owns all card text. The UI reads `E.RIVALS` (= `ARCH`).

The names avoid the names already used for other characters and products around the project.

| id | icon | name · label (`name`, `label`) | gender | rule card (`rule`, shown to the player) | strong when (`strong`) | weak when (`weak`) |
|---|---|---|---|---|---|---|
| `saver` | 🐢 | רותם · חוסכת זהירה | f | שומרת כרית של 6 חודשים. קונה רק נכס שמכניס כסף כל חודש, בלי הלוואה. בודקת כל עסקה עם סימן אזהרה. 20% מהעודף לקרן מדד. | במשברים, במיתון ובריבית גבוהה | כשהכלכלה צומחת והאשראי זול — היא יוצאת לאט |
| `founder` | 🚀 | עומר · יזם | m | מעדיף עסקים. לוקח הלוואה כשהעסקה מכניסה יותר מהריבית. מנהל את העסק בעצמו. | כשיש עסקים טובים על הלוח ובתקופת צמיחה | בשחיקה, במיתון, וכשכל הכסף בעסק אחד |
| `diversified` | 🧺 | מאיה · משקיעה מפוזרת | f | 40% מהעודף לקרן מדד, נכס אחד מכל סוג, כרית של 3 חודשים. | במשחקים ארוכים ובמחזורים מעורבים | במרוץ קצר |
| `gambler` | 🎲 | רועי · חובב סיכון | m | מינוף מקסימלי, קריפטו וצ'קים גדולים לסטארט־אפים. אף פעם לא בודק עסקה, ותמיד מנסה להוריד מחיר. | כשיש מזל ובתקופת צמיחה | כמעט בכל השאר — מורה טוב לכך שמזל הוא לא שיקול דעת |

`ARCH[id] = { id, icon, name, label, g: 'f'|'m', rule, strong, weak, verbClose: 'סגרה'|'סגר', from: 'מרותם'|'מעומר'|'ממאיה'|'מרועי', toHim: 'לה'|'לו' }`.

**The rule cards must stay literally true.** Test §15 AC-30 checks each sentence against 100 policy games. If tuning changes a policy, the sentence changes too.

---

## 2. Layer A: ghost players

### 2.1 What a ghost is
A ghost is a **complete engine game** with the player's own configuration (world, character, seed, mode, rules, `maxMonths`, `tutorial`, `bailout`, history scenario, `dream`), driven by an archetype policy. Same dice, same tiles, same cards, same sealed outcomes; only the decisions differ. That is the pedagogical promise: **"same luck, different decisions"**.

```js
ghostCfg(playerSt, arch) = { ...E.replayConfig(playerSt), mentor: 'hint', learn: false, self: arch }
```
- `mentor: 'hint'` is presentation only (no outcome change). `learn: false` changes only `rollCost` (no outcome).
- `self: arch` (new, outcome-neutral cfg, §3.3): in the ghost's own game, the persona slot that equals the ghost is renamed `other` (`משקיע אחר`), so Omer is never "competing against himself". The competition outcome is identical to the player's game for the same decisions.
- History mode: ghosts run too (real data, deterministic).
- Tutorial games: ghosts get the same starter deal (same cfg). On the T4 intro card a ghost picks `skip` (no money effect).

### 2.2 Information limit (rule R3, binding)
- **During play** a ghost row is visible only if `row.m ≤ lastPaydayMonth(S)`; a ghost mark only if `mark.m < S.month`. Rows are recorded at payday (§4.1), so a row never contains anything from a card the player has not yet resolved in that month.
- Ghost data never contains per-card decisions for the player's pending event.
- **After the player's game ends** (`S.over`), the full ghost games (to their own end, §2.6) are shown.
- One accessor enforces this on the main thread: `ghosts.view(month)` clamps every series; the worker also never posts beyond the requested `upTo` (§2.5). Both are tested (AC-17).
- **Accepted, documented residual:** an aggregate ghost row can reflect the true cash flow of a deal the player already passed (e.g. a ghost bought it last month). The deal is gone, deal truths are drawn independently per card, and only aggregates are shown, so it cannot be exploited. The same holds inside a practice branch, where the player is told that they already know what happened (§7.6).

### 2.3 Archetype policies (`js/rivals/policies.js`, pure)

Contract (shared with the T2 sim, T2§13.2; `tools/policies.mjs` re-exports this file, and T2's archetype policies are **moved here**, not duplicated):

```js
export const ARCH_V = 2;                          // bump on any behaviour change (cache key, §2.6) — 2: balance-pass amendment below
export const ARCHETYPES = { saver, founder, diversified, gambler };
// each archetype:
{ id, mentor: 'hint',
  decide(pv, ctx) → { id: optionId, params? },    // pending event; pv = E.publicView(st, {freeze:false})
  between(pv, ctx) → [action]                     // between rolls: ['loan', n] | ['repay', n] | ['plan', id] | ['focus', id, slot] | ['save', n] | ['auto', n] | ['invest', side, qty] | ['payCredit']
}
// ctx = { rnd: mulberry32(mix32(seed ^ ARCH_SALT[id])), n: <non-closing steps on this card>, tables: { dd: DD, cycle: CY, focus: FC, rivals: RV } }
```
- `ctx.rnd` is the archetype's own tie-break PRNG. It never touches `st.rng`.
- A policy may read **only** `pv` and `ctx.tables`. It must not import `js/engine.js` internals. The driver (worker / sim) applies the returned actions through the public API (`E.choose`, `E.takeLoan`, …).
- Loop guard (T2§13.1): at `ctx.n ≥ 3` non-closing steps on one card, pick the first of `['done','pass','ok']`.
- T3 story inbox items: P0 ghosts leave them to their declared defaults (T3 D2 guarantees defaults work).

Behaviour (parameters are [TUNE] for §16; the rule card must stay true):

| | saver | founder | diversified | gambler |
|---|---|---|---|---|
| cushion target (cash + savings) | 6 × E | 1.5 × E | 3 × E | 0.5 × E |
| deal buy rule (expected net from `expectedNet(pv, ev)`) | net > 0, **no loan**, cash after buy ≥ cushion | prefers non-rent kinds (a rent asset only after a non-rent one **and when it adds ≥ 0.2 E**); net after loan cost > 0 | one asset per kind not yet owned (a second of a kind only if **net ≥ 0.05 E**), net > 0, loan only if **net ≥ 0.08 E** | any claimed net > 0, maximum loan |
| DD (inspect) | `inspect:1` when ≥ 1 warn flag; `inspect:2` when the range straddles 0 | `inspect:1` when ≥ 2 warn flags | `inspect:1` when ≥ 1 warn flag **and** the shown rival risk < 30% | never |
| lower offer (`offer:k`) | never | `offer:5` when no rival is interested | **`offer:5`** when no rival is interested and net > 0.3 E | **`offer:5`** whenever offered |
| index fund | 20% of the monthly surplus (auto-invest) | none | 40% of the monthly surplus | none |
| plan / focus | `work`; focus `adaptiveFocus` (T2§13.3) | `side` when 🔋 ≥ 60; focus `ops` when a business can decide | `work`; focus `adaptiveFocus` | `overtime` **while 🔋 ≥ 70 (kept while ≥ 45), `rest` below 30**; focus `scout` |
| crypto / angels | never | angels ≤ 10% of net worth | ≤ 5% | maximum allowed |
| business manage panel | — | `BIZ.suggest` option | `BIZ.suggest` option | the highest-revenue option |
| life events | cheapest option | cheapest option | cheapest option | the option with the highest cash now |

**Balance-pass amendment (2026-11-22, engine lane, T6 verify D1; `ARCH_V` 2).** The bold cells above replace the first-wave values: gambler
`offer:15` → `offer:5` (sellers refused 70 % of his 15 % offers, which closed the card) and overtime only while there is energy for it
(at > 35 🔋 he burned out 8–29 times a game); founder's rent bar 0.1 E → 0.2 E; diversified's second-of-a-kind bar 0.1 E → 0.05 E, loan bar
0.15 E → 0.08 E, `offer:10` → `offer:5`. The rule cards (§1, `js/systems/rivals.js`) are unchanged and still literally true (AC-30: the gambler
"always tries to lower the price" — any lower offer, not 15 %). Results: `tools/balance-report.md` (G1–G9).

### 2.4 Running ghosts: Web Worker (`js/rivals/worker.js`) and client (`js/rivals/ghosts.js`)
- **Worker:** a module worker, `new Worker(new URL('./rivals/worker.js', import.meta.url), { type: 'module' })`. It imports `../engine.js` (no DOM, RS§2.4) and `./policies.js`. It holds the four ghost states in memory and advances them one ghost-month at a time, yielding to its message loop between months (so `drop` and newer `advance` messages are handled promptly).
- **Client** (`ghosts.js`, main thread): starts the worker lazily the first time the `rivals` flag is on and a game starts; owns the cache; exposes `ghosts.view(month)` and events on the `bus`.
- **No Worker available** (old browser, CSP, construction throws): no ghost computation during play. The rival panel says `היריבים יופיעו בסוף המשחק.` After the game ends, ghosts are computed on the main thread with `requestIdleCallback`, one ghost-month per callback, only when `deadline.timeRemaining() > 20`, and only while the end screen is visible.
- **Cost (RS§2.4, measured):** 4 ghosts ≈ 16–170 ms of CPU per player-month at phone-class speed, i.e. 1–10 s for a full 60-month game. All of it in the worker.

### 2.5 Worker protocol (v1)

Main → worker:

| message | when | effect |
|---|---|---|
| `{t:'init', v:1, key, cfg, archs:['saver','founder','diversified','gambler']}` | game start or resume | create 4 ghost games (`E.createGame(ghostCfg)`), reset state for `key` |
| `{t:'advance', key, upTo}` | after every player payday (`upTo = S.month` after the payday), and once after `init` on resume | advance each ghost while `ghost.month < upTo && !ghost.over`. `upTo` is monotonic per key; a lower value is ignored. |
| `{t:'finish', key, cap}` | only after the player's game is over | advance each ghost to its own end or to `cap` (§2.6) |
| `{t:'drop', key}` | game closed / new game | free memory |

Worker → main:

| message | content | rule |
|---|---|---|
| `{t:'rows', key, arch, at, rows, marks}` | `rows` = new `st.tl` rows (§4.1) as arrays `[m, nw, liq, debt, pas, exp, pg, hap, en]`; `marks` = new marks with `m < at`; `at = upTo` | **never** a row with `m > upTo` or a mark with `m ≥ upTo`, unless a `finish` was received |
| `{t:'done', key, arch, end}` | after `finish`: `end = { status, months, reason, stars, tl, marks, recap: { dims } }` (engine `checkEnd` output, trimmed) | only after `finish` |
| `{t:'error', key, arch, code}` | a ghost threw | the client hides that ghost (`—`) and logs once |

Messages carry only integers and short strings (≈ 100 bytes per row). The main thread never receives a ghost state.

### 2.6 Ghost end, cap and cache
- **Cap** for `finish`: `cap = max(playerEndMonth, ceil(1.6 × maxMonths))` in free/learn (no time limit; the sim uses the same 1.6×), the mode's limit otherwise.
- The comparison also uses each ghost's **state at the player's final month** (`tl` row at that month), so "if you all stopped when you did" is available (§5.2).
- **Cache** (main thread, `localStorage['rr2-ghosts']`): LRU of 8 entries, each `{key, at, ghosts: {arch: end}}` (≈ 10 KB per entry, ≤ 80 KB total). Only **finished** ghost games are cached. During play, ghost progress is kept in worker memory only; on resume, the worker re-plays the ghosts up to `upTo` (background).
- **Key:** `[worldId, charId, seed, mode, maxMonths, scenarioId, rules, tutorial, bailout, dream, E.SAVE_VERSION, E.OUTCOME_REV, ARCH_V].join('|')`.
  - `E.OUTCOME_REV` (new engine export, integer) is bumped with every outcome-changing engine release. It is added to the re-pin release checklist.
- A daily/weekly/challenge ghost set is therefore computed once per device. A practice branch reuses the original's ghosts (same key).
- `rr2-ghosts` is added to `saves.js SWEEP_KEYS` as evictable (it is **not** under `rr2-save-`, so T1 may evict it under quota pressure).

---

## 3. Layer B: deal competition on the player's own deal cards

### 3.1 The experience
A deal card can say **"👥 2 משקיעים מתעניינים: 🚀 עומר · 🧺 מאיה"**. Buying now always succeeds. Every **delay step** the player chooses (inspect yourself, a professional inspection, a lower offer) carries a public risk that one of them closes first. The player weighs due diligence and negotiation (T2) against losing the deal. There is no clock: nothing happens while the player thinks.

If a rival closes first, the card says who took it, the player has paid only for the step they chose, and a few months later the player hears, truthfully, how the deal turned out for that rival.

### 3.2 Draws (stream `rival`, index 12)
- `createDeal` and `createMystery`: right after `ddDraws(st)`, `const rv = rivalDraws(st)` → when `R4(st)`, exactly 4 draws `[nR, pickR, closeR, takerR]` from `'rival'`; under rules 3, none.
- The draws happen whatever the card turns out to be (asset deal, stock, crypto, golden, quiz, non-deal mystery). They are used only when the pending is an asset `deal` with `p.dd` and `!p.dd.starter` (`attachRival(st, p, rv)`).
- Kill switches that keep the draw count: `rivalCfg(worldId).enabled === false`, or `st._dev.noRival` (sim ablation; rejected in ranked like the other `_dev` flags). Then `p.rv = null`.

### 3.3 Public interest (pure, public data only) — `js/systems/rivals.js`

```js
export const RIVAL_DRAWS = 4;
export const RIVAL_REVEAL = 6;                       // paydays until the player hears how a lost deal went
export function rivalCfg(worldId) → { enabled, roiCuts:[lo, hi], pN:{weak, mid, strong, golden}, close:{1:[p1,p2,p3,pNever], 2:[…], 3:[…]} }
export function tierOf(pub, worldId) → 'weak'|'mid'|'strong'|'golden'
export function eligibleOf(pub) → [archId]           // ordered saver, founder, diversified, gambler
export function drawRival(rs, pub, worldId, self) → { n, who:[archId|'other'], close: 0|1|2|3, taker: archId|'other'|null, steps: 0 }
export function hazard(worldId, n, step) → number    // P(close = step | close ≥ step), 0 when n = 0 or step > 3
```

`pub` is built **only** from public card data (the same numbers `describe` prints), never from player state, so every player landing on the same card gets the same interest:
```js
pub = { kind: c.k, rent: !!kinds[c.k].rent, golden: !!p.golden,
        cfClaim: <the card's claimed monthly cf as printed (ev.data.dd.claimed.cf)>,
        down: c.down, warn: <number of dd flags with kind 'warn'> }
```
If the printed claimed cf contains any player-specific term, the engine lane uses the card's raw `cf` (or `noi` minus the card's own debt service) instead. AC-6 tests the invariant.

**Tier:**
1. `golden` → `golden`.
2. `roi = down > 0 ? cfClaim × 12 / down × 100 : (cfClaim > 0 ? Infinity : 0)` (% per year). `cfClaim ≤ 0` → `weak`; `roi < lo` → `weak`; `roi < hi` → `mid`; else `strong`.
3. Each warn flag moves the tier one step down (minimum `weak`). Warn flags scare investors off, so DD on a flagged deal is relatively safe. That matches T2§7.6 ("inspect is NOT best on a clearly great deal with 0 flags").

**Eligible personas (from their rule cards, public data only):**
- `saver`: `cfClaim > 0 && warn === 0 && tier ∈ {mid, strong, golden}`
- `founder`: `(!rent || golden) && warn ≤ 1`
- `diversified`: `warn ≤ 1 && tier ∈ {mid, strong, golden}`
- `gambler`: `tier ∈ {mid, strong, golden}` (ignores flags)

**Draw use:**
- `n0 = invCDF(pN[tier], nR)` ∈ {0,1,2,3}; `n = min(n0, eligible.length)`.
- `who` = `eligible` rotated by `floor(pickR × eligible.length)`, first `n`. If `self` is set (ghost game) the entry equal to `self` is replaced by `'other'`.
- `close = n === 0 ? 0 : invCDF(close[n], closeR)` mapped to `1|2|3|0 (never)`.
- `taker = close ? who[floor(takerR × n)] : null`.

**Initial tables [TUNE, §16]:**

| param | w1 (gentle) | w2 / w3 / w4 |
|---|---|---|
| `roiCuts` (% per year) | [8, 16] | w2 [5, 9] · w3 [10, 20] · w4 [10, 20] |
| `pN.weak` P(n=0..3) | .85 .15 0 0 | .70 .25 .05 0 |
| `pN.mid` | .55 .35 .10 0 | .35 .40 .20 .05 |
| `pN.strong` | .30 .45 .20 .05 | .15 .35 .35 .15 |
| `pN.golden` | .15 .40 .35 .10 | .05 .25 .40 .30 |
| `close[1]` P(close at step 1, 2, 3, never) | .10 .10 .10 .70 | .20 .20 .15 .45 |
| `close[2]` | .20 .15 .10 .55 | .35 .25 .15 .25 |
| `close[3]` | .30 .20 .10 .40 | .50 .25 .15 .10 |

The module uses only + − × ÷ (determinism scan, T2§1.1).

### 3.4 State, sealed fields, public block
```js
p.rv = { n, who: ['founder','diversified'], steps: 0,      // public
         close: 2, taker: 'founder' }                      // SEALED
st.rivalDeals = [ { m, k0, name, by, how: 'inspect'|'offer', claimedCf, claimedValue, level,   // public once lost
                    truth: { cf, value, repair },          // SEALED until revealed
                    revealAt, revealed: false } ]          // ≤ 12, oldest dropped
st.stats.rivalLost = 0
```
`ev.data.rivals` (in `DESCRIBE.deal`, only when `p.rv`):
```js
{ n, who: [{ id, icon, name, label }], steps, hazardNext: round2(hazard(worldId, n, steps + 1)),
  text: <§14.3 interest line>, note: <§14.3 explain line> | null }
```
Every delay option (`inspect:1`, `inspect:2`, `offer:*`) gets `o.rivalRisk = hazardNext` when `n ≥ 1`. Labels do not change (tests and the impact panel keep their refs); the UI draws the chip from `o.rivalRisk`.

### 3.5 Resolution (in `CHOOSE.deal`, deterministic from the log)
A **delay step** is `inspect:1`, `inspect:2` or `offer:k`. Buying (`buy*`) and `pass` are never delay steps. At most 3 delay steps fit on one card (inspect 1, inspect 2, one offer), which is why `close ∈ {1,2,3}`.

```js
// inspect:1 / inspect:2
inspect(st, p, o, out);                         // T2: cost paid (🔋 or ₪), level raised, info revealed
if (p.rv) { p.rv.steps++; if (p.rv.close && p.rv.steps >= p.rv.close) { loseToRival(st, p, out, 'inspect', o); return true; } }
return false;                                   // card stays open (T2)

// offer:k
if (p.rv) { p.rv.steps++; if (p.rv.close && p.rv.steps >= p.rv.close) { loseToRival(st, p, out, 'offer', o); return true; } }
// otherwise T2/v3 negotiate() as today (accepted → card stays open; refused → card closes)
```
- An inspection that ends in a loss is still paid for and its result is still shown (the inspector did the work). The player learns what they would have bought.
- A lower offer that ends in a loss is **not** evaluated: the seller took a full-price offer instead. `negR` stays unused, and no negotiation luck is booked.

`loseToRival(st, p, out, how, o)`:
1. `st.stats.rivalLost++`.
2. Truth: `t = ddTruthOf(c, p.dd)` (golden / no-dd → the claimed numbers are the truth). Push `st.rivalDeals` `{m: st.month, k0: p.k0, name: c.n, by: p.rv.taker, how, claimedCf, claimedValue, level: p.dd.level, truth: {cf, value, repair}, revealAt: st.month + RIVAL_REVEAL, revealed: false}`.
3. Mark `rivalLost` (§4.2), luck `rival` (§3.7).
4. `out.rival = { lost: true, by: ARCH[taker] fields, how, text, sub }` (§14.3) and `out.news.push({kind: 'rival', text})`. Sound `loss`. `st.pending = null`, the card closes (return `true`).
5. **Money:** nothing else changes. No cash, asset, loan or happiness effect beyond the step the player paid. The rival has no balance sheet in this layer.

**Reveal ("how it turned out for them"):** in `payday()` after the focus rollover, for each `rivalDeals` entry with `!revealed && st.month ≥ revealAt`: set `revealed = true` and push `news {kind: 'rival', text: <reveal line §14.3>}` and a mark `rivalReveal`. At game end, every unrevealed entry is revealed in `recap.rivalDeals` (§6). The reveal uses only the truth of a card that is no longer available; deal truths are independent per card, so it gives no information about any future card.

### 3.6 Evaluator, hints, impact (T2§10.4, §10.1, §9 extended; outcome-neutral)
With `h = hazard(worldId, n, steps + 1)` (public):
```js
U(inspect:j) = (1 − h) × (max(0, U_buy) + EVI_j) − stepCost          // the step cost is paid either way
U(offer:k)   = (1 − h) × chance × max(0, buyDisc)                    // + h × 0 (lost) ; refused ⇒ 0 as in T2
U(buy*), U(pass): unchanged
```
With `n = 0` (h = 0) the T2 formulas are unchanged. A new reason key (T2§10.8):

| key | text |
|---|---|
| `rival` | `{n} משקיעים מתעניינים — עיכוב יכול לעלות לך בעסקה ({p}% בשלב הבא)` |

- `impactFor(delayRef)` adds `branches` when `n ≥ 1`: `[{p: 1 − h, label: 'העסקה עדיין פתוחה אחרי השלב הזה'}, {p: h, label: 'משקיע אחר סוגר לפניך — שילמת רק על השלב'}]`. For `offer:k` three branches: rival (h), accepted ((1−h)·chance), refused ((1−h)·(1−chance)). `p` sums to 1.
- `shadowOf` (T2§9.2) replaces `p.rv.close` with `0` (never) and adds a run with `close = steps + 1` for the rival branch; `taker` is replaced by `who[0]`.
- Guide primary: unchanged mechanism (argmax of `scoreOptions`), so it now accounts for competition.

### 3.7 Luck
`addLuck(st, 'rival', amount)` at every delay step with `n ≥ 1`, where `V = max(0, U_after) × E` (₪, the public value of continuing, from the same `scoreOptions` call):
- survived: `+h × V`; lost: `−(1 − h) × V`. The expected value is 0.
- `dq.luckLog` gets an entry only for a loss, or when `|amount| ≥ 0.25 E` (§4.3).
- `learning.luck.parts.rival` is shown with the other luck parts.

### 3.8 Achievements, stats
- No achievement for losing or winning a competition (no incentive to farm delays).
- `metrics().rivals = { lost: st.stats.rivalLost, deals: rivalDeals.filter(revealed).map(public fields) }` (truth only when revealed).

---

## 4. Engine logging data (outcome-neutral)

All four structures are filled by the engine during play, are deterministic, and are rebuilt byte-for-byte by `replay()`. Added size ≈ 4–5 KB per 60-month save (RS§3.3).

### 4.1 `st.tl` — one row per payday
```js
st.tl = { v: 1, step: 1, from: 1,                 // from = first month recorded (migration month for migrated saves)
          m: [], nw: [], liq: [], debt: [], pas: [], exp: [], pg: [], hap: [], en: [] }
```
| column | value (integers) |
|---|---|
| `m` | `st.month` after the payday |
| `nw` | `round(metrics.netWorth / 100)` (₪100 units) |
| `liq` | `round((st.cash + st.savings) / 100)` |
| `debt` | `round((st.loans + st.credit + other liabilities in metrics) / 100)` |
| `pas` | `round(metrics.passive)` |
| `exp` | `round(metrics.expenses)` |
| `pg` | `round(metrics.progress × 1000)` (goal progress, permille) |
| `hap`, `en` | `round(L.happiness)`, `round(L.energy)` |

- Pushed by `tlPush(st)` at the **very end** of `payday()` (after `ensureCash`, auto-invest, savings, focus rollover, story draws). One `metrics()` call (13–45 µs measured) or the cheaper helpers already used in `payday`.
- **Cap 240 rows.** On reaching 240: keep every 2nd row (always keep the first), `step *= 2`, and from then on push only when `st.stats.paydays % step === 0`.
- `finalize()` appends the final state as a last row if its month differs from the last row (so the graph ends where the game ended).
- `summaryForServer` does **not** include `tl` (keep payloads small, RS§3.3 item 5).

### 4.2 `st.marks` — notable events
`[m, kind, amount, k, label]` (label ≤ 24 characters, Hebrew, or `''`). Cap 40. When full, evict the entry with the smallest `|amount|` among kinds `buy, sell, story, recession, crash, rivalReveal`; if none of these exists, evict the oldest entry.

| kind | where | amount | label |
|---|---|---|---|
| `crisis` | crisis card paid | − paid | card title |
| `forced` | `ensureCash` forced/auto loan | loan amount | `why` |
| `burnout` | payday burnout | − medical | `''` |
| `jobless` | life `jobless` starts | 0 | `''` |
| `crash` | `monthlyIndex` crash | index value change ₪ of holdings | `''` |
| `bailout` | `bailout()` | amount | `''` |
| `buy` | `buyAsset` | down payment | asset name |
| `sell` | asset / business sale | proceeds | asset name |
| `recession` | the **public** cycle label changes to `מיתון` (never the sealed phase) | 0 | `''` |
| `story` | T3 `resolveStory` (or default) with `|v| ≥ 1 E` | v | chain title |
| `rivalLost` | §3.5 | claimed value of the deal | deal name |
| `rivalReveal` | §3.5 reveal | (truth cf − claimed cf) × 12 | deal name |
| `win` | the goal is first met (game won) | net worth | `''` |
| `afterWin` | `'W'` | 0 | `''` |

`k` is the action index of the related decision when there is one (§4.4), else `-1`.

### 4.3 `st.dq.luckLog` — per-event luck
`[m, part, amount, k]`, cap 40 (evict the smallest `|amount|`). Appended inside `addLuck` for the event parts `negotiation, raise, angels, crypto, friend, dd, story, rival`. The ambient parts (`index`, `cycle`) stay aggregate only.
`k` links the luck to its decision:
- negotiation, dd, rival: the `c` action that caused it (the offer, the buy, the delay step);
- raise: the raise request;
- friend / story: stored on the chain item when the decision was taken (T3 chain record gets `k`);
- angels / crypto: stored on the investment record (`x.k`) at investment time, used at reveal.

### 4.4 Decision records: `k`, `k0`, `a`
`decisionRecord` adds:
- `k` = the index in `st.actions` of the action that records this decision (`'c'`, `'F'`, `'Q'`, …);
- `k0` = the **card start**: the smallest prefix length `L` such that `replay(cfg, actions.slice(0, L))` has this same event (same `pending.id`) pending with no option chosen yet. Stored on the pending at creation as `p.k0` (the engine lane computes it from `st.actions.length` after the creating action is logged; AC-12 verifies the definition). Between-roll decisions (`F`, loans) have `k0 = k`.
- `a` = asset id for buys.

New export `E.decisionPoints(st)` → `[{k0, k, m, t, c, o, v}]` from `dq.decisions` (newest last, ≤ 120), for the rewind sheet (§7). For saves without `k0` (migrated mid-game), it falls back to the log scan of RS§4.1 (replay step by step, note each pending non-auto event with ≥ 2 enabled options before a `c`).

### 4.5 Recap builder
`checkEnd` → when the game ends, `result.recap = recapOf(st, result)` (§5.1, §6.2). It is built only at the end (never per turn) and is pure engine output: every string is an engine template filled with engine numbers.

---

## 5. Success metrics (raw facts, compared with the ghosts)

### 5.1 `result.recap.dims` (engine)
Five dimensions. Each has raw `facts`, an engine `headline` (one line for the player), a `short` value (≤ 22 characters, used in comparisons) and an `order` key (the single raw fact used to place the five players). No weights, no combined number.

| id | icon · title | facts | headline (template §14.5) | short | order key (better first) |
|---|---|---|---|---|---|
| `speed` | ⏱️ מהירות | `won, months, stars, thresholds:[m3,m2,m1], progress, maxMonths` | won: `יצאת בחודש {m} (★★ עד חודש {m2})` · not won: `הגעת ל־{p}% מהדרך לחופש` | won: `חודש {m}` · else `{p}% מהדרך` | won before not won; then `months` asc; then `progress` desc |
| `resilience` | 🛡️ חוסן | `crises, crisisNoLoan, forcedLoans, forcedTotal, negMonths, minCushion, minCushionM, monthsUnder1, recoveryMonths, bailout` | `עברת {c} משברים — {n} בלי הלוואה כפויה. הכרית הכי נמוכה: {x} חודשים (חודש {m}).` | `{f} הלוואות כפויות` | `forcedLoans` asc; then `minCushion` desc |
| `decisions` | 🧠 החלטות | `strong, ok, weak (= costly + risky), n, hints` (from `learning.verdicts`) | `{s} החלטות חזקות · {o} סבירות · {w} חלשות` | `{s} חזקות · {w} חלשות` | `weak / n` asc; then `strong / n` desc |
| `happiness` | 😊 אושר | `start, end, avg, min, minM, burnouts, lowEnergyMonths (en < 25)` | `התחלת ב־{s} וסיימת ב־{e} · ממוצע {a} · {b} שחיקות` | `ממוצע {a}` | `avg` desc |
| `business` | 🏪 עסק | `had, months, profitMonths, lossMonths, worstNp, worstM, stage` | had: `העסק הרוויח ב־{p} מתוך {t} חודשים · שלב "{stage}"` · none: `לא ניהלת עסק במשחק הזה` | had: `{p} מתוך {t} רווחיים` · none: `—` | players with a business first, by `profitMonths / months` desc; players without one last |

Sources: `minCushion` = min over `tl` of `liq × 100 / exp`; `monthsUnder1` = rows with that ratio < 1; `recoveryMonths` = from the trough of the largest net-worth drawdown (§6.2 crisis) back to the pre-drop peak, or `null`. Business totals need `b.totals.profitMonths`, `lossMonths`, `worst {np, m}` over the business's whole life (business.js, §11.3).

### 5.2 Comparison with the ghosts (UI orders, the engine supplies everything)
For each dimension the UI has the player's `dims[id]` and each finished ghost's `end.recap.dims[id]` (computed by the same engine in the worker). It sorts the five by the documented `order` key, with ties sharing a place:
- top view line (§6.3): `מקום {r} מתוך 5 · הכי טוב: {icon} {name} — {short}`; when the player is first: `מקום 1 מתוך 5 · אחריך: {icon} {name} — {short}`;
- full table in "מול היריבים" (§6.4): one row per player, the `short` per dimension, plus the state at the player's final month (`בחודש {m}: שווי נקי {nw}`), plus `מסודר לפי: {orderText}` under each column header (§14.5).
- A missing ghost (error or not finished yet) shows `—` and does not take a place.

The existing 0–100 decision score and the `tanh` luck bar stay available inside "החלטות ומזל" (details), never as a headline (RS§2.5).

---

## 6. Personal end summary

### 6.1 Principles
- **Data only.** Every sentence is an engine template filled with engine numbers or names. Nothing guesses *why* something happened. The only "advice" is the one rule-based suggestion (§6.2 `suggestion`), which quotes the engine's existing `why` texts.
- **Short by default:** the top block is at most 1.5 phone screens (390 × 844). Everything else is in collapsed sections.
- **The life-story overlay no longer auto-closes** (T4 A11Y-13). With `recap2` on, the overlay is not shown at all; its content is the "סיפור החיים" section. With `recap2` off, `ui.js lifeStory` loses its `setTimeout(close, …)` and gets a `להמשיך` button.

### 6.2 `result.recap` (engine) — full shape
```js
recap = {
  v: 1,
  dims: { speed, resilience, decisions, happiness, business },          // §5.1
  graph: { tl,                                                          // copy of st.tl
           recessions: [{ from, to }],                                  // from econPath (T2, revealed at the end); [] when no cycle
           lowCushion: [{ from, to }],                                  // runs of rows with liq×100/exp < 1
           notes: [{ m, kind, text }],                                  // ≤ 3, see rule below
           alt: 'שווי נקי: התחלת ב־{a}, שיא {b} בחודש {m}, סיום ב־{c}.' },
  grid: { goodWon, goodUnlucky, luckyWeak, weakCostly },                // §6.2.1, each null | {m, c, o, luck, k0, why}
  crisis: null | { from, to, trough: { m, cushion, nw }, depth, recoveredAt: m|null, responses: [{ m, text }] },   // §6.2.2
  suggestion: { rule: 1|2|3|4, text, k0: n|null },                     // §6.2.3
  decisions: [{ m, c, o, v, verdict, luck, k0 }],                       // ≤ 3 meaningful decisions (lifeSummary.topDecisions + linked luck)
  rivalDeals: [{ m, name, by, how, claimedCf, cf, repair }],           // all lost deals, truth revealed
  happiness: { start, end, min, minM, burnouts },                      // same as dims.happiness facts (for the graph tab)
}
```
`notes` rule: from `st.marks` pick ≤ 3 with the largest `|amount| / E`, among kinds `buy, sell, forced, crisis, rivalLost, win`, at least 3 months apart. Text per kind (§14.6).

#### 6.2.1 Judgment vs luck (2×2, no formula)
For each scored decision with linked luck (`luckLog` entries whose `k` equals the decision's `k`; for buys also the dd luck), sum the linked luck `L`. "Good" = verdict strong/ok; "weak" = costly/risky. A cell needs `|L| ≥ 0.5 E` (the threshold `learnHtml` already uses). Pick the largest `|L|` per cell; empty cells are `null` and hidden.

| | luck helped (`L > 0`) | luck hurt (`L < 0`) |
|---|---|---|
| good decision | `goodWon`: `✅ החלטה טובה שגם הצליחה` | `goodUnlucky`: `💪 עשית נכון — הפעם לא הסתדר` |
| weak decision | `luckyWeak`: `🍀 הצליח, אבל בזכות מזל — אל תסמוך על זה` | `weakCostly`: `⚠️ החלטה חלשה שגם עלתה ביוקר` |

#### 6.2.2 The main crisis
- Window = the largest peak-to-trough drop of `tl.nw`. If that drop is < 1 E and there is no `crisis`/`forced`/`burnout` mark, `crisis = null`.
- `from` = the peak month, `to` = the trough month, `trough` = the row with the lowest `liq×100/exp` inside `[from, to]`, `depth` = drop in ₪.
- `recoveredAt` = the first month after `to` where `nw ≥ nw[from]`, or `null`.
- `responses` (≤ 4, factual, ordered by month) = the marks and decisions inside `[from, to + 2]`: forced loans, sales, loans taken (`L`), repayments, plan changes (`P`), focus `frugal`/`debt`, story choices. Text templates §14.7. **No "because".**

#### 6.2.3 One focused suggestion (rule order, RS§3.5)
1. A weak decision with linked luck ≤ −1 E (or a `costly`/`risky` decision with `|v| ≥ 1 E`): `בפעם הבאה: {why}`, `k0` = that decision's card start.
2. Else the biggest **chosen** leak ≥ 0.5 E (`tipFor` logic): its existing tip text, `k0 = null`.
3. Else the weakest principle with ≥ 3 decisions and mastery < 0.6: `כדאי לחזק: {principleName} — {principleTip}`, `k0 = null`.
4. Else the world-mechanic tip (`tipFor`), `k0 = null`.

### 6.3 Layout: top block (`#endTop`, mobile first, 390 px)
In this order, with nothing else above the fold:
1. **Header:** the existing result title (T4 learn titles S-L1/S-L2 in learn mode), stars row (or S-L3/S-L4), near-miss line (one line, existing).
2. **Money graph** (`js/recap.js`, inline SVG, ~180 px high, built from integers):
   - tabs `💰 כסף` (default) and `😊 אושר וכוח`;
   - כסף: net worth line (`nw`), the "מזומן וחיסכון" band (`liq`), red shading for `lowCushion`, grey bands for `recessions` (label `מיתון`), ≤ 3 `notes` as small numbered pins with text below the graph;
   - אושר וכוח: `hap` and `en` lines on 0–100;
   - x axis months (numbers in `dir="ltr"` `<bdi>`), y axis ₪ via `fmtM`; RTL layout, month 1 on the right;
   - `role="img"` with `aria-label = recap.graph.alt`; toggle button `הצג כטבלה` / `הצג כגרף` (keyboard reachable) shows an accessible `<table>` (§12.4);
   - in a practice branch, a second, dashed line `המקור` (§7.5).
3. **Five dimension rows:** icon + title + headline (one line), and under it the comparison line (§5.2), or `היריבים מסיימים לשחק…` while ghosts are pending, or nothing when the `rivals` flag is off.
4. **Suggestion card:** `💡 לפעם הבאה` + text. If `k0 != null` and rewind is allowed (§7.1): button `🔁 לנסות את ההחלטה הזו אחרת` with the subline `נפתח ענף תרגול. המשחק המקורי נשמר.`
5. **Continue after win** (free/learn win, flag `afterwin`): secondary button (§9.3).
6. **Sticky primary buttons** (existing `endButtons`).

**Budget:** `#endTop.scrollHeight ≤ 1.5 × innerHeight` at 390 × 844 in every world, won and lost, with every flag on (AC-23).

### 6.4 "More" sections (collapsed `<details>`, in this order)
Toggle `עוד פרטים` reveals the list; each section is its own `<details>`:
1. **החלטות ומזל:** the 2×2 (only non-empty cells, each with `🔁 לנסות אחרת` when rewind is allowed and `k0` exists), `recap.decisions`, then the existing `learnHtml` bars (decision score, luck parts including `dd`, `cycle`, `rival`).
2. **המשבר הגדול:** `crisis` (§14.7), or `לא היה משבר גדול במשחק הזה.`
3. **מול היריבים:** the full table (§5.2), each persona's rule card with strong/weak lines, and `עסקאות שהלכו ליריבים` (`recap.rivalDeals`, §14.3 reveal lines).
4. **סיפור החיים:** the existing `lifeHtml` (absorbs the overlay) plus T3 `lifeSummary.stories`.
5. **ניתוח מלא** (T2§15.9): `learning.review`, "עם רמז / בלי רמז", `econPath` timeline, `ddRecap`.
6. **הישגים ושיעורים:** achievements, lessons, unlocks, ⚡ news (existing `newsHtml`, world lesson).

### 6.5 Inputs the end screen needs (no other data path)
`e.end` (engine result incl. `recap`, `learning`, `lifeSummary`, `econPath`, `ddRecap`), the ghost ends from `ghosts.js` (`bus` event `ghosts:done`), and for branches the original's `recap` (§7.5).

---

## 7. Practice rewind (`js/rewind.js`, shell lane)

### 7.1 Who may rewind
`rewind.allowed(cfg) = flagFor('rewind', cfg) && cfg.mode === 'free' && !RANKED.has(cfg.mode) && !cfg.resultId` (free includes learn). Never daily/weekly/challenge/history. `flagFor` (new in `flags.js`, §8.1) forces `false` for ranked configs whatever `?ff=` says.

### 7.2 Storage (the original is never written)
| key | content | size |
|---|---|---|
| `rr2-save-free-<w>` / `rr2-save-learn-<w>` | the original live game (existing, T4) | 15–50 KB |
| `rr2-last-game` | `{cfg, actions, tl, endLite, ghostsKey, at}` of the **last finished** free/learn game (one per device, replaced by the next one) | 4–6 KB |
| `rr2-save-branch-<w>` | the branch, a full save like any other (one per world) | 15–50 KB |
| `rr2-branches` | `[{w, origin: 'live'|'last', originKey, k0, month, label, at}]`, ≤ 4 | < 1 KB |

- `rr2-save-branch-*` sits under the `rr2-save-` prefix, so T1's `saves.js` classifies it, backs it up and never evicts it.
- `rr2-branches` and `rr2-last-game` are added to `SWEEP_KEYS`.
- `endLite` = `{status, months, stars, recap: {dims, graph: {tl}}}` (what the comparison needs).
- **No code path in `rewind.js` writes an origin key.** AC-26 hashes the origin keys before and after every branch operation.

### 7.3 Creating a branch
```js
rewind.createBranch({ origin: 'live'|'last', w, k0 }) →
  1. read the origin (live save, or rr2-last-game)
  2. cfg2 = { ...origin.cfg, learn: true }            // T4 E-9: replayConfig carries learn; rollCost never affects outcomes
  3. S2 = E.replay(cfg2, origin.actions.slice(0, k0)) // overlay "מחזירים את הזמן…" (§14.8)
  4. S2.ui = { ...S2.ui, branch: { k0, originKey, origin, at: Date.now() } }
  5. if a branch for w exists → confirm dialog (§14.8), then replace it
  6. write rr2-save-branch-<w> + rr2-branches; on quota error → toast (§14.8), nothing else changes
  7. startGame({ ...cfg2, slot: 'branch', resume: true })
```
- A branch **is a T4 learning game**: no stars, achievements, ⚡, boards, duels, group feed; lessons still unlock (T4§7.1). No new mode string.
- From a live game: `game.js` persists the live game first, then creates the branch. The original resumes from the lobby (`להמשיך`) or from the banner's `חזרה למקור`.
- Branching from a branch replaces the branch; `originKey` keeps pointing to the original.
- Timing (RS§4.3, measured): prefix replay ≈ 0.1–0.4 s at phone-class speed (w3 up to ~1 s under load). No snapshot cache in P0. P2: an in-memory state every 12 months plus `E.replayFrom(state, actions)`.

### 7.4 Entry points
1. End screen: the suggestion and each 2×2 example (`k0`), only when `rewind.allowed`.
2. In-game (free/learn): HUD menu item `רגעי החלטה` → sheet from `E.decisionPoints(S)`: `חודש {m} · {title} · בחרת: {chose}` + `🔁 לחזור לכאן`.
3. Lobby world card: `🔁 לחזור לרגע מהמשחק האחרון` (from `rr2-last-game`) opens the same sheet built from a replay of the stored log (P1).
4. Lobby world card for an existing branch: `🧪 ענף תרגול: חודש {m} — להמשיך` + `למחוק ענף` (delete removes only the branch key and its meta entry, after a confirm).

### 7.5 In-branch UI and comparison
- Banner (always visible in a branch): `🧪 ענף תרגול — המשחק המקורי שמור` with buttons `חזרה למקור` and `השוואה`.
- `השוואה` sheet: the money graph with both lines (original dashed, label `המקור`; branch solid, label `הענף`) over the same months; the five dimension facts side by side **only for months both have played** (the original's `tl` up to the branch's month, or its end); the limits text (§7.6).
- The branch's end screen is the normal end screen (learn titles) with the original's line on the graph and a `המקור מול הענף` table.

### 7.6 Comparison limits (always shown in `השוואה`, collapsed `<details>` on the end screen)
Exact strings in §14.8 (from RS§4.2, measured: dice, tiles and all streams identical in 4,257/4,257 rolls after a different choice; cards identical in 4,254/4,257, the 3 differences being state-dependent presentation).

---

## 8. Ranked hardening

### 8.1 Client gate (P0, shell lane; no approval needed)
1. `flags.js`: `DEFAULTS` gains `rivals: false, rewind: false, recap2: false, afterwin: false` and the same keys in `ALLOWED` (`[true, false]`). New `export const PRACTICE_ONLY = new Set(['rewind', 'afterwin'])` and `export function flagFor(name, cfg)` → `false` when `PRACTICE_ONLY.has(name)` and `cfg` is ranked (`['daily','weekly','challenge'].includes(cfg.mode) || cfg.resultId`), else `flag(name)`.
2. `rewind.js` throws `Error('rewind_ranked')` from every entry point for a ranked cfg (defence in depth; the UI never shows the entry).
3. **V3 fix** (RS§5.1), `game.js` ranked resume (the line `st = local && local.seed === srv.seed && … seq …`): prefer the local save only if it **extends** the server log:
   ```js
   const isPrefix = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length <= b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
   st = local && local.seed === srv.seed && seqOf(local) > seqOf(srv) && isPrefix(srv.actions || [], local.actions || []) ? local : srv;
   ```
4. `net.js` `ERR.diverged_checkpoint = 'המשחק הזה המשיך במכשיר אחר — טוענים את השמירה מהשרת'`; `game.js pumpCheckpoint` treats that code like a resume from the server (reload the server state). Harmless before the trigger exists.
5. V2 (silent restart on checkpoint load failure) is already fixed by T1 (`rankedFail`); T6 adds its test (AC-29).

### 8.2 Server migration — **NOT applied — awaiting owner approval**
File to add (do **not** run `apply_migration`): `supabase/migrations/<YYYYMMDD>_t6_append_only_checkpoint.sql`. Tested on a local PostgreSQL 16 mock (RS§5.2, 9 cases, `test_out.txt`).

```sql
-- T6 — NOT APPLIED — AWAITING OWNER APPROVAL.
-- Ranked action log becomes append-only on the server. STRICTLY ADDITIVE:
-- 2 new tables, 1 new trigger function, 1 new trigger. No rr_* signature or body changes, no column changes.
-- Rollout: mode 'log' (observe only) → 'enforce' after a clean week → 'off' is the kill switch (no redeploy).
create table if not exists game.t6_settings (k text primary key, v text not null);
insert into game.t6_settings (k, v) values ('append_only', 'log') on conflict (k) do nothing;
create table if not exists game.checkpoint_audit (
  id bigserial primary key, result_id uuid not null, at timestamptz not null default now(),
  kind text not null, old_len int, new_len int, old_turn int, new_turn int);
revoke all on game.t6_settings, game.checkpoint_audit from public;

create or replace function game.tg_checkpoint_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o jsonb; n jsonb; ol int; nl int; m text; ok boolean;
begin
  if new.checkpoint is not distinct from old.checkpoint then return new; end if;
  select v into m from game.t6_settings where k = 'append_only';
  if m is null or m = 'off' then return new; end if;
  o := case when jsonb_typeof(old.checkpoint -> 'actions') = 'array' then old.checkpoint -> 'actions' end;
  if o is null or jsonb_array_length(o) = 0 then return new; end if;          -- first checkpoint / legacy state without a log
  ol := jsonb_array_length(o);
  n := case when jsonb_typeof(new.checkpoint -> 'actions') = 'array' then new.checkpoint -> 'actions' end;
  nl := coalesce(jsonb_array_length(n), -1);
  ok := nl >= ol and jsonb_path_query_array(n, ('$[0 to ' || (ol - 1) || ']')::jsonpath) = o;
  if ok then return new; end if;
  if m = 'enforce' then raise exception 'diverged_checkpoint'; end if;
  insert into game.checkpoint_audit (result_id, kind, old_len, new_len, old_turn, new_turn)
    values (new.id, 'diverged', ol, nl, old.checkpoint_turn, new.checkpoint_turn);
  return new;
end $$;

drop trigger if exists t6_checkpoint_append_only on game.results;
create trigger t6_checkpoint_append_only before update of checkpoint on game.results
  for each row execute function game.tg_checkpoint_append_only();

-- SWITCH TO ENFORCE (separate, after one clean week of checkpoint_audit):
--   update game.t6_settings set v = 'enforce' where k = 'append_only';
-- KILL SWITCH: update game.t6_settings set v = 'off' where k = 'append_only';
-- ROLLBACK: drop trigger t6_checkpoint_append_only on game.results; drop function game.tg_checkpoint_append_only();
--           drop table game.checkpoint_audit; drop table game.t6_settings;
```
- Backward compatible: honest v3/v4 clients only append; the T2 migration does not touch `actions`; a checkpoint without `actions` is accepted only while the stored one has none.
- Accepted case (by design): a branch that starts exactly **at** the stored end is indistinguishable from honest play, and is fine, because the stored state precedes that choice.
- Cost: ≈ 1 ms per checkpoint for typical games (≤ 700 actions); 8–10 ms at 6,000 actions (measured).

### 8.3 verify-result diff — **NOT applied (Edge Function deploy) — awaiting owner approval**
`verify_core.js` is not part of the engine pin, so this needs no engine re-pin.

```diff
--- a/supabase/functions/verify-result/index.ts
+++ b/supabase/functions/verify-result/index.ts
@@ const ROW = (tx: any, q: any) => tx`select r.status, r.world, r.profession, r.months, r.passive, r.expenses, r.net_worth,
     case when jsonb_typeof(r.stats->'actions') = 'array' then r.stats->'actions' end as stats_actions,
+    case when jsonb_typeof(r.checkpoint->'actions') = 'array' then r.checkpoint->'actions' end as ck_actions,
```
```diff
--- a/supabase/functions/verify-result/verify_core.js
+++ b/supabase/functions/verify-result/verify_core.js
+/** a is a prefix of b (element-wise JSON equality). Used to reject a final log that rewrites a stored checkpoint. */
+export function isPrefix(a, b) {
+  if (!Array.isArray(a) || !Array.isArray(b) || a.length > b.length) return false;
+  for (let i = 0; i < a.length; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
+  return true;
+}
@@ export function verifyGame(E, row, actions) {
   const cfg = configFor(E, row);
+  if (Array.isArray(row.ck_actions) && row.ck_actions.length && !isPrefix(row.ck_actions, actions))
+    return { ok: false, error: 'rewind:checkpoint_prefix', result: null, diff: null, cfg };
   let st;
```
The row is then stored as `verified = false` (sorted last by migration t15b). Tests to add in `tests/verify.test.mjs`: prefix pass, prefix fail (diverged), missing `ck_actions` (pass), shorter final log (fail). Measured: 4/4 real logs pass after a jsonb round trip (RS§5.3).

### 8.4 Residual (documented, not fixable client-side)
Offline look-ahead in ranked (the seed and the public engine allow simulating an open daily) remains (RS§5.1 R). Optional later: audit log jumps `new_len − old_len > 60` for review only, never auto-reject.

---

## 9. Continue after win (`'W'`, `'X'`; free and learn only)

### 9.1 Engine
```js
export function continueAfterWin(st)   // → {ok, error?, event:null, effects, mentor}
// allowed: st.over === 'won' && st.mode === 'free' && !st.history && !st.afterWin
// effect:  st.afterWin = { m: st.month, months: st.result.months, stars: st.result.stars,
//                          nw0, pas0, exp0, hap0 }            // from metrics at the win
//          st.over = null; st.result = null; st.phase = 'roll'; mark 'afterWin'; act(st, ['W'])
export function retire(st)             // → {ok, end}
// allowed: st.afterWin && st.phase === 'roll' && !st.pending && !st.over
// effect:  act(st, ['X']); finalize(st, checkEnd-like result with status 'retired', reason 'retired')
```
- `checkEnd` with `st.afterWin`: the goal **no longer ends** the game. It ends on bankruptcy (existing rule, `status: 'lost'`, `reason: 'afterWinBroke'`), on `retire` (`status: 'retired'`), or at `st.month ≥ afterWin.m + 120` (`status: 'retired'`, `reason: 'cap'`).
- The second result carries `afterWin: { winMonths, winStars, months: st.month − m, nwDelta, passiveDelta, happinessDelta, stillFree: passive ≥ expenses, reason }` and `stars = afterWin.stars` (never more).
- While `st.afterWin`: `ach()` grants nothing (no ⚡ farming), the tutorial and dream logic do not re-trigger, `rollDice` works as normal, mentor lines unchanged.
- `metrics().afterWin = { m, sinceMonths }` for the HUD chip.
- `replay`: `case 'W': r = continueAfterWin(st); break; case 'X': r = retire(st); break;`. In a ranked log either returns `ok:false` → `replay_mismatch` (correct rejection).

### 9.2 Shell (`game.js`)
- On a free/learn win with `flagFor('afterwin', cfg)`: `endGame` keeps the save until the player decides (does not clear it). `bus` event `game:afterwin` when the player taps the button: `E.continueAfterWin(S)`, persist, close the end screen, resume play in the same slot.
- A `🏁 לפרוש עכשיו` item in the HUD menu while `metrics().afterWin`: confirm dialog, then `E.retire(S)` → normal `endGame`.

### 9.3 Lobby
- Win end screen (free/learn, flag on): secondary button `🌴 להמשיך לחיות אחרי החופש` + subline `בלי כוכבים חדשים — רק לראות אם החופש מחזיק.`
- The free save is cleared only when the player leaves the end screen by another button (today's behaviour) or the continuation ends.
- The continuation's end (`e.end.afterWin`) **does not** call `P.recordGame`, achievements, milestones or the group feed (stars, best months and unlocks were recorded at the win).
- Its end screen title `מה החופש נתן לך` and the lines of §14.9; the money graph starts at `afterWin.m` with a pin `יצאת מהמירוץ`.

---

## 10. Save v4, replay, verifier, engine touch points

### 10.1 `v4Defaults` additions (idempotent, no randomness; runs on create, migrate and every load)
```js
if (!st.tl) st.tl = { v: 1, step: 1, from: st.month, m: [], nw: [], liq: [], debt: [], pas: [], exp: [], pg: [], hap: [], en: [] };
if (!Array.isArray(st.marks)) st.marks = [];
if (!Array.isArray(st.dq.luckLog)) st.dq.luckLog = [];
if (st.dq.luck.rival == null) st.dq.luck.rival = 0;       // add 'rival' to the luck key list
if (!Array.isArray(st.rivalDeals)) st.rivalDeals = [];
if (st.stats.rivalLost == null) st.stats.rivalLost = 0;
if (st.afterWin === undefined) st.afterWin = null;
if (st.self === undefined) st.self = null;
// a pending deal without p.rv stays a legacy card for competition (no interest, no loss) — never draw for an already-drawn card
```
Migrated mid-game saves start their timeline at the migration month (`tl.from`). P1: the end screen may backfill the earlier months once by replay (≤ 0.4 s at phone-class speed) and label that part `שוחזר`.

### 10.2 `createGame` / `replayConfig`
- `createGame` accepts `self` (one of the archetype ids; outcome-neutral, §2.1) and `_dev.noRival` (sim only; rejected in ranked).
- `replayConfig` carries `self` and `_dev` when set (T4 E-9 already adds `learn`, `dream`).

### 10.3 Verifier (engine lane, part of the normal re-pin)
`CODES` becomes the full registry (§11.1): `['r','l','c','L','R','C','P','A','I','S','T','F','H','M','Q','K','W','X']`. `W`, `X`, `K` in a ranked log fail replay. Deal competition needs no new code (delay steps are `c`). Re-pin with `node tools/build-edge.mjs` (now also bundling `js/systems/rivals.js`), `--check` in the release checklist, synchronised site + function deploy, release at a day and week boundary (T2§3.3).

### 10.4 Rules path
- **Path A (preferred, plan of record):** T6's engine part ships in the same release as T2/T3 (v4). Competition is simply part of rules 4; `RULES4_FROM` already separates in-flight ranked games.
- **Path B (only if T6 misses that release):** competition becomes `rules: 5` (`R5(st)`), `createGame` default 5, migrated ranked saves keep their rules, verifier `RULES5_FROM` + `rulesFor` returning 5, and `SAVE_VERSION` 5 with `migrateV4` = the §10.1 defaults. The logging data (§4) can still ship in v4 without a rules change, because it is outcome-neutral.

### 10.5 Engine touch-point list (engine lane implements after T3)
| # | Where (function) | Change |
|---|---|---|
| E1 | new `js/systems/rivals.js` | §3.3 (`ARCH`, `RIVAL_DRAWS`, `RIVAL_REVEAL`, `rivalCfg`, `tierOf`, `eligibleOf`, `drawRival`, `hazard`, text templates) |
| E2 | `createDeal`, `createMystery` | `rivalDraws` after `ddDraws`; `attachRival` after `attachDD`; `p.k0` |
| E3 | `DESCRIBE.deal` | `ev.data.rivals`, `o.rivalRisk` on delay options |
| E4 | `CHOOSE.deal`, new `loseToRival` | §3.5 |
| E5 | `optionU` / `scoreOptions` / reasons / `impactFor` / `shadowOf` | §3.6 |
| E6 | `payday()` | `tlPush` (end), rival reveal (after focus rollover), `recession` mark on public label change |
| E7 | `ensureCash`, crisis pay, burnout, jobless, `monthlyIndex` crash, `bailout`, `buyAsset`, sales, T3 `resolveStory`, win | marks (§4.2) |
| E8 | `addLuck` | `luckLog` (§4.3); `k` stored on chain items, angels, crypto at decision time |
| E9 | `decisionRecord`, pending creation | `k`, `k0`, `a`; export `decisionPoints` |
| E10 | `checkEnd`, `finalize`, new `recapOf` | `recap` (§5.1, §6.2), final `tl` row, `afterWin` handling |
| E11 | new exports `continueAfterWin`, `retire`; `replay` cases `W`, `X` | §9.1 |
| E12 | `createGame`, `replayConfig`, `v4Defaults` | §10.1, §10.2 |
| E13 | `publicView`, `metrics` | `metrics().rivals`, `metrics().afterWin`; sealed fields excluded |
| E14 | new export `OUTCOME_REV` | integer, bumped every outcome-changing release |
| E15 | `js/finance/business.js` | `b.totals.profitMonths`, `lossMonths`, `worst {np, m}` (coordinated with T3, §11.3) |
| E16 | `tools/sim.mjs`, `tools/policies.mjs`, `js/rivals/policies.js` | archetypes moved to `js/rivals/policies.js`; `--matrix` ablation `_dev.noRival`; `--rivals` report (§16) |
| E17 | `verify_core.js` | `CODES` (§10.3) and re-pin |

---

## 11. Action-code registry and cross-spec notes

### 11.1 Final registry (engine `replay()` cases = verifier `CODES`)
| code | owner | export | allowed in ranked |
|---|---|---|---|
| `r` | v3 | roll | yes |
| `l` | v3 | landing | yes |
| `c` | v3 | choose (also T2 inspect options, T6 delay steps) | yes |
| `L` | v3 | takeLoan | yes |
| `R` | v3 | repayLoan | yes |
| `C` | v3 | payCredit | yes |
| `P` | v3 | setPlan | yes |
| `A` | v3 | setAutoInvest | yes |
| `I` | v3 | invest | yes |
| `S` | v3 | moveSavings | yes |
| `T` | v3 | setSideReport | yes |
| `F` | T2 | setFocus | yes |
| `H` | T2 | requestHint | yes |
| `M` | T2 | setMentorLevel | **no** (`ok:false`) |
| `Q` | T3 | resolveStory | yes |
| `K` | **T4 (changed from `Q`)** | answerPractice | **no** |
| `W` | T6 | continueAfterWin | **no** |
| `X` | T6 | retire | **no** |
| `B` | reserved (rivals variant M, shared listings, P2) | — | — |

### 11.2 Cross-spec notes (each owner must apply)
1. **T4 (action code):** T4 E-10 must stop using `'Q'` (T3 owns it, TASK_BOARD). T6 proposes **`'K'`** (free today): `answerPractice` logs `['K', qid, idx]`, `replay()` `case 'K'`, `CODES` gains `'K'`. Everything else in T4 E-10 is unchanged.
2. **T4 (module name):** T4 owns `js/practice.js` (practice questions). The rewind controller is `js/rewind.js`.
3. **T4 (replay config):** branches depend on T4 E-9 (`replayConfig` carries `learn`). T6 also relies on T4 §7.1 learn rules for branches.
4. **T3 (stream index):** T2 reserves `rival` = 12 and `listing` = 13 (and `js/rng.js` already says "Next free index: 14"). T3's `story` stream is therefore index **14**, not 12 as T3 §0.2 assumed. T3 already states "append after whatever T2 adds last"; this note makes the number explicit.
5. **T3 (business totals and k):** `business.js` adds `b.totals.profitMonths`, `lossMonths`, `worst {np, m}` over the whole business life (beyond `HIST_MAX = 24`). Story chain items record the decision index `k` for the luck log; `resolveStory` with `|v| ≥ 1 E` adds a `story` mark.
6. **T2 (policies):** the four archetype policies live in `js/rivals/policies.js`; `tools/policies.mjs` re-exports them (and keeps the other T2 helpers). The T2 A4 matrix uses the same code.
7. **T2 (evaluator, impact, leak tests):** §3.6 extends T2§10.4 / §10.1 (hazard factor), §10.8 (reason `rival`), §9 (branches), §9.2 (`shadowOf`), and T2 T8 (scramble list adds `p.rv.close`, `p.rv.taker`, unrevealed `rivalDeals[].truth`; publicView key scan adds `close`, `taker`, `truth`).
8. **T1 (saves):** `SWEEP_KEYS` adds `rr2-branches`, `rr2-last-game`, `rr2-ghosts`; branch saves use the `rr2-save-branch-<w>` slot under the existing prefix.
9. **T5:** no change. (A later P2 could show the four personas as figures in the city; not in T6.)
10. **T7:** perf budgets of §15 AC-19…22 join the T7 suite; the fake backend is needed for the group-challenge reference-line test (AC-21).

---

## 12. UI requirements (in-game, `js/ui.js`, `css/game.css`)

### 12.1 Deal card: rival presence (P0, ships with the ENGINE part, **not** behind a flag)
In `BODY.deal`, right under the DD flag chips (T2§15.3), when `ev.data.rivals` exists:
- **Interest row:** `ev.data.rivals.text` with persona chips (icon + name). Tapping a chip opens a small popover with the persona's `rule`, `strong`, `weak` (from `E.RIVALS`).
- When `n ≥ 1`, the explain line `ev.data.rivals.note` (one line, muted).
- **Delay options** (`inspect:*`, `offer:*`) with `o.rivalRisk > 0`: a chip `👥 {p}% שיקדימו אותך` on the button (icon + text, never colour only). Buy and pass buttons get no chip.
- After a step that survives, the card re-renders (`ctl.update`, as for inspections); the chip shows the new `hazardNext`.
- **Lost:** when `out.rival.lost`, the card switches to an outcome panel: title `out.rival.text`, body `out.rival.sub` (§14.3), the inspection result (if any) as the normal DD block, and one button `הבנתי`. `aria-live="polite"`. No timed dismissal.
- **Reveal news** (`news.kind === 'rival'`): a toast that stays until tapped or until the next roll (not timed), and the line is also listed in the rival panel.
- No `⏳`/clock icon anywhere in this feature.

### 12.2 Rival panel (P0 behind flag `rivals`)
- HUD chip `👥 יריבים` (aria-label `יריבים על אותו לוח`) next to the focus chip; it opens a bottom sheet.
- Sheet title `היריבים על אותו לוח`, subline `אותן קוביות ואותם קלפים — כל אחד מחליט אחרת. רואים רק עד החודש שלך.`
- Five rows (you first, then the four ghosts in persona order — **not** sorted by any score): icon, `name · label`, `שווי נקי {nw} · הכנסה פסיבית {pas}`, a progress bar from `pg` with `{p}% מהדרך לחופש`; an escaped ghost shows `יצא/ה מהמירוץ בחודש {m}` (gendered per persona). Values from `ghosts.view(S.month)` only.
- Each ghost row expands to its rule card and its last ≤ 3 visible marks (`mark.m < S.month`).
- Footer `מה יקרה להם הלאה — בסוף המשחק.`
- States: computing → `היריבים משחקים…`; no worker → `היריבים יופיעו בסוף המשחק.`; ghost error → that row shows `—`.
- Section `עסקאות שהלכו ליריבים` (from `metrics().rivals`): lost deals, with their reveal line once revealed, else `נשמע איך זה הלך בעוד {n} חודשים`.

### 12.3 Practice and after-win chrome (behind `rewind` / `afterwin`)
- Branch banner (§7.5), `רגעי החלטה` HUD menu item and sheet (§7.4).
- After-win HUD chip `🌴 אחרי החופש · {n} חודשים` and the `🏁 לפרוש עכשיו` menu item (§9.2).

### 12.4 Accessibility
- Every chip is icon + text; risk percentages are also in the button's accessible name.
- Sheets are dialogs with focus trap and Escape (T4 overlay queue).
- The SVG graph (§6.3) has `role="img"` + `aria-label`; the table alternative has `<caption>` `הנתונים של הגרף`, header cells, months as row headers, and is reachable by keyboard.
- Nothing in T6 auto-dismisses (A11Y-13).

---

## 13. Lobby requirements (`js/lobby.js`, `css/lobby.css`, new `js/recap.js`)

### 13.1 End screen (flag `recap2`; the old `renderEnd` stays as the fallback)
- `renderEnd` builds `#endTop` (§6.3) and the "more" sections (§6.4) via `recap.js`:
  ```js
  export function renderTop(e, ctx)      // ctx = { ghosts, branchOrigin, rewindAllowed, afterwinAllowed, learn }
  export function renderMore(e, ctx)
  export function graphSvg(tl, opts)     // integers only; opts = { series, recessions, lowCushion, notes, compareTl }
  export function graphTable(tl, opts)
  ```
- Ghost comparisons fill in when `bus` emits `ghosts:done` (re-render the dimension lines only).
- `onGameEnd`: free/learn → write `rr2-last-game` (§7.2) **before** clearing the free save; after-win rules (§9.3); branch end → no `recordGame`, no achievements (T4 learn rules).

### 13.2 World view cards
- Existing free game card unchanged. New: branch card (§7.4 item 4) and `🔁 לחזור לרגע מהמשחק האחרון` (P1).

### 13.3 Group challenges: optional reference lines (P1, flag `rivals`)
- In the group challenge board view only (never daily/weekly/public boards): a toggle `להציג את יריבי המחשב (לא בדירוג)`, default **off**, remembered in `rr2-settings`.
- Shown only after the player has finished that challenge on this device (R3) and only if the device has the challenge seed (from its own `rr_begin`). No new seed exposure, no server call.
- When on: 4 rows appended after the human rows, styled apart (dashed border, `🤖` prefix), **unnumbered**, `🤖 {name} · {short}` (speed `short`), plus the note `יריבי המחשב לא נכנסים לדירוג.`
- Ghost data is never sent to the server (`net.*` spy test, AC-21).
- Daily/weekly boards and duel screens: no ghost lines (DD-6).

---

## 14. Hebrew copy table (exact strings)

Placeholders in `{}`. Player-addressed strings go through `gz()`; persona strings use the persona's gender fields.

### 14.1 Personas
See §1 (name, label, rule, strong, weak). Extra fields: `verbClose` רותם `סגרה` · עומר `סגר` · מאיה `סגרה` · רועי `סגר`; `from` `מרותם` · `מעומר` · `ממאיה` · `מרועי`; `toHim` `לה` · `לו` · `לה` · `לו`; escaped verb `יצאה` / `יצא`. `other`: `👤 משקיע אחר` (ghost games only).

### 14.2 Rival panel
- chip: `👥 יריבים` · aria: `יריבים על אותו לוח`
- title: `היריבים על אותו לוח`
- subline: `אותן קוביות ואותם קלפים — כל אחד מחליט אחרת. רואים רק עד החודש שלך.`
- row: `שווי נקי {nw} · הכנסה פסיבית {pas}` · `{p}% מהדרך לחופש` · `{יצא|יצאה} מהמירוץ בחודש {m}`
- you row name: `אתה`
- footer: `מה יקרה להם הלאה — בסוף המשחק.`
- computing: `היריבים משחקים…` · no worker: `היריבים יופיעו בסוף המשחק.`
- rule link: `הכללים של {name}` · `חזק/ה כש…` → use `strong`/`weak` lines with prefixes `חזקים כש:` / `חלשים כש:`
- lost deals header: `עסקאות שהלכו ליריבים` · pending reveal: `נשמע איך זה הלך בעוד {n} חודשים`

### 14.3 Deal competition (engine strings)
- interest, n = 0: `👥 אף משקיע אחר לא מתעניין כרגע — אפשר לבדוק בנחת.`
- interest, n = 1: `👥 משקיע אחד מתעניין: {icon} {name}`
- interest, n ≥ 2: `👥 {n} משקיעים מתעניינים: {icon1} {name1} · {icon2} {name2}[ · {icon3} {name3}]`
- explain (n ≥ 1): `קנייה עכשיו — העסקה שלך. כל בדיקה או הצעה נמוכה יותר נותנת להם הזדמנות לסגור לפניך.`
- delay chip: `👥 {p}% שיקדימו אותך`
- lost title: `{icon} {name} {verbClose} את העסקה לפניך`
- lost body, how = inspect: `בזמן שבדקת, {name} {הציע|הציעה} למוכר את המחיר המלא. על הבדיקה כבר שילמת — לפחות עכשיו אתה יודע מה היה שם.`
- lost body, how = offer: `בזמן שניסית להוריד את המחיר, {name} {הציע|הציעה} למוכר את המחיר המלא.`
- lost footer: `בעוד כמה חודשים נשמע איך זה הלך {toHim}.`
- lost button: `הבנתי`
- reveal, worse than claimed: `שמעת {from}: {deal} מכניס {cf} בחודש — הוצהר {claimed}.`
- reveal, repair addition (when repair > 0): ` התיקונים עלו {repair}.`
- reveal, as claimed (|cf − claimed| < ₪10 and no repair): `שמעת {from}: {deal} מכניס בדיוק כמו שהוצהר — {cf} בחודש.`
- reveal, better than claimed: `שמעת {from}: {deal} מכניס {cf} בחודש — יותר מה־{claimed} שהוצהרו.`
- mentor line `rivalLost` (common.js): `בעסקה טובה יש תחרות. לפעמים בדיקה שווה את הסיכון, ולפעמים לא — זה תלוי בכמה סימני אזהרה יש ובכמה אנשים מחכים.`
- evaluator reason `rival`: `{n} משקיעים מתעניינים — עיכוב יכול לעלות לך בעסקה ({p}% בשלב הבא)`
- impact branches: `העסקה עדיין פתוחה אחרי השלב הזה` · `משקיע אחר סוגר לפניך — שילמת רק על השלב`

### 14.4 End summary: frame
- more toggle: `עוד פרטים`
- section titles: `החלטות ומזל` · `המשבר הגדול` · `מול היריבים` · `סיפור החיים` · `ניתוח מלא` · `הישגים ושיעורים`
- ghosts pending: `היריבים מסיימים לשחק…`
- comparison: `מקום {r} מתוך 5 · הכי טוב: {icon} {name} — {short}` · first: `מקום 1 מתוך 5 · אחריך: {icon} {name} — {short}` · tie: `מקום {r} (שווה) מתוך 5 · …`
- suggestion title: `💡 לפעם הבאה` · CTA: `🔁 לנסות את ההחלטה הזו אחרת` · sub: `נפתח ענף תרגול. המשחק המקורי נשמר.`
- 2×2 CTA: `🔁 לנסות אחרת`
- table header (מול היריבים): `שחקן` · `⏱️ מהירות` · `🛡️ חוסן` · `🧠 החלטות` · `😊 אושר` · `🏪 עסק` · `בחודש {m}` (state at the player's final month: `שווי נקי {nw}`)
- missing ghost: `—`

### 14.5 Dimensions (engine templates)
| id | title | headline | short | `orderText` |
|---|---|---|---|---|
| speed | `⏱️ מהירות` | won `יצאת בחודש {m} (★★ עד חודש {m2})` · else `הגעת ל־{p}% מהדרך לחופש` | `חודש {m}` / `{p}% מהדרך` | `מסודר לפי: מי יצא קודם, ואחר כך מי התקדם יותר` |
| resilience | `🛡️ חוסן` | `עברת {c} משברים — {n} בלי הלוואה כפויה. הכרית הכי נמוכה: {x} חודשים (חודש {m}).` · no crises: `לא היו משברים. הכרית הכי נמוכה: {x} חודשים (חודש {m}).` | `{f} הלוואות כפויות` | `מסודר לפי: פחות הלוואות כפויות, ואחר כך כרית נמוכה פחות` |
| decisions | `🧠 החלטות` | `{s} החלטות חזקות · {o} סבירות · {w} חלשות` | `{s} חזקות · {w} חלשות` | `מסודר לפי: חלק ההחלטות החלשות (פחות זה טוב)` |
| happiness | `😊 אושר` | `התחלת ב־{s} וסיימת ב־{e} · ממוצע {a} · {b} שחיקות` (b = 0 → `בלי שחיקות`) | `ממוצע {a}` | `מסודר לפי: אושר ממוצע` |
| business | `🏪 עסק` | `העסק הרוויח ב־{p} מתוך {t} חודשים · שלב "{stage}"` · none `לא ניהלת עסק במשחק הזה` | `{p} מתוך {t} רווחיים` / `—` | `מסודר לפי: חלק החודשים הרווחיים` |

### 14.6 Graph
- tabs: `💰 כסף` · `😊 אושר וכוח`
- legend: `שווי נקי` · `מזומן וחיסכון` · `כרית מתחת לחודש` · `מיתון` · `אושר` · `🔋 כוח` · `המקור` · `הענף`
- toggle: `הצג כטבלה` / `הצג כגרף`
- table caption: `הנתונים של הגרף` · headers: `חודש` · `שווי נקי` · `מזומן וחיסכון` · `חובות` · `הכנסה פסיבית` · `הוצאות` · `😊` · `🔋` · more rows: `להציג את כל החודשים`
- alt (engine): `שווי נקי: התחלת ב־{a}, שיא {b} בחודש {m}, סיום ב־{c}.`
- notes: `buy` `קנית: {label}` · `sell` `מכרת: {label}` · `forced` `הלוואה כפויה {amount}` · `crisis` `משבר: {label}` · `rivalLost` `{name} לקח/ה: {label}` (gendered) · `win` `יצאת מהמירוץ`
- migrated part label: `שוחזר`

### 14.7 Crisis section (engine templates)
- title: `המשבר הגדול: חודשים {from}–{to}`
- trough: `השווי הנקי ירד ב־{depth}. הכרית הכי נמוכה: {x} חודשים (חודש {m}).`
- responses header: `מה עשית:`
- response lines: `חודש {m}: הבנק נתן הלוואה כפויה של {x}` · `חודש {m}: מכרת את {name} ב־{x}` · `חודש {m}: לקחת הלוואה של {x}` · `חודש {m}: החזרת {x} מההלוואה` · `חודש {m}: עברת לתוכנית "{plan}"` · `חודש {m}: מוקד החודש — {focus}` · `חודש {m}: {chainTitle} — {choice}`
- outcome: `חזרת לשווי שלפני המשבר אחרי {n} חודשים.` · `עד סוף המשחק לא חזרת לשווי שלפני המשבר.`
- none: `לא היה משבר גדול במשחק הזה.`

### 14.8 Practice rewind
- banner: `🧪 ענף תרגול — המשחק המקורי שמור` · buttons: `חזרה למקור` · `השוואה`
- sheet title: `רגעי החלטה` · row: `חודש {m} · {title} · בחרת: {chose}` · CTA: `🔁 לחזור לכאן`
- overlay: `מחזירים את הזמן…`
- replace confirm: `יש כבר ענף תרגול בעולם הזה. להחליף אותו? המשחק המקורי לא ייפגע.` · `להחליף` · `ביטול`
- delete confirm: `למחוק את ענף התרגול? המשחק המקורי לא ייפגע.` · `למחוק` · `ביטול`
- errors: `לא הצלחנו לחזור לרגע הזה. המשחק המקורי לא נפגע.` · `אין מספיק מקום לענף תרגול. אפשר למחוק ענף ישן.`
- lobby: `🧪 ענף תרגול: חודש {m} — להמשיך` · `למחוק ענף` · `🔁 לחזור לרגע מהמשחק האחרון`
- compare title: `המקור מול הענף` · limits title: `מה אפשר ללמוד מההשוואה`
- limits (5 lines):
  1. `אותן קוביות ואותם קלפים — רק ההחלטות שלך שונות.`
  2. `לפעמים משבצת נראית אחרת כי המצב שלך שונה (למשל כשיש לך עסק).`
  3. `בענף התרגול אתה כבר יודע מה קרה. ההשוואה מראה מה הייתה עושה ההחלטה בקלפים האלה — לא אם היא הייתה נכונה מראש.`
  4. `אירועי חיים וסיפורים שתלויים במצב שלך יכולים להשתנות בהמשך.`
  5. `ענף תרגול לא נותן כוכבים, הישגים, ⚡ או מקום בטבלה.`
- ranked note (none: the entry is hidden).

### 14.9 Continue after win
- end button: `🌴 להמשיך לחיות אחרי החופש` · sub: `בלי כוכבים חדשים — רק לראות אם החופש מחזיק.`
- HUD chip: `🌴 אחרי החופש · {n} חודשים`
- retire item: `🏁 לפרוש עכשיו` · confirm: `לסיים כאן ולראות מה החופש נתן לך?` · `לסיים` · `להמשיך לשחק`
- end title: `מה החופש נתן לך`
- lines (engine): `{n} חודשים אחרי היציאה` · `שווי נקי {sgn} מאז היציאה` · `הכנסה פסיבית {sgn} מאז היציאה` · `אושר {a} → {b}` · `ההכנסה הפסיבית עדיין מכסה את ההוצאות` / `ההכנסה הפסיבית כבר לא מכסה את ההוצאות`
- cap: `עברו 10 שנים מאז שיצאת מהמירוץ — כאן עוצרים.`
- broke after win: `החופש לא החזיק: בחודש {m} נגמר הכסף.`

### 14.10 Group challenges and errors
- toggle: `להציג את יריבי המחשב (לא בדירוג)` · row: `🤖 {name} · {short}` · note: `יריבי המחשב לא נכנסים לדירוג.`
- `ERR.diverged_checkpoint`: `המשחק הזה המשיך במכשיר אחר — טוענים את השמירה מהשרת`

---

## 15. Acceptance criteria (numbered, testable)

**Fairness, determinism, deal competition (engine; new `tests/t6.test.mjs` + extensions)**
1. **AC-1 Streams.** `STREAMS` order unchanged (T2's 14 names, then T3 `story` at 14). Under rules 4 the `rival` stream advances by exactly 4 on every deal or mystery landing and by 0 elsewhere; under rules 3 it never advances; `listing` never advances.
2. **AC-2 Fixed draws.** Two runs of the same seed with different decisions (buy now / inspect / offer / pass / delay until lost / `_dev.noRival`) have identical states of **all** streams after every landing and payday (200 seeds × 4 worlds).
3. **AC-3 Replay.** `replay(replayConfig(st), st.actions)` is byte-identical to the live state (including `tl`, `marks`, `dq.luckLog`, `rivalDeals`, `afterWin`) for 300 games per world with the random player extended with delay steps and `W`/`X` (free only).
4. **AC-4 Sealed.** T2 T8 scramble test extended: scrambling `p.rv.close`, `p.rv.taker` and unrevealed `rivalDeals[].truth` leaves `describe`, `scoreOptions`, `requestHint().hint`, `impactFor` and `publicView` byte-identical (300 states). The `publicView` key scan finds no `close`, `taker` or `truth` (except revealed entries).
5. **AC-5 No money creation.** Over 2,000 lost-deal cards: the change of the player's cash + savings + net worth across the card equals exactly minus the chosen step's cost (fee in ₪; 🔋 for inspect:1), and no asset, loan or happiness change happens.
6. **AC-6 Interest is public and player-independent.** (a) Scrambling the dd truth (`risk, f, vf, repair, jitter`) never changes `p.rv.n` or `p.rv.who` (1,000 cards). (b) For 200 seeds × 2 decision scripts, every deal card both runs land on (same turn) has identical `p.rv` (n, who, close, taker).
7. **AC-7 Buy now never loses.** On every card with `close ≥ 1`, choosing a buy option as the first action buys the asset.
8. **AC-8 Calibration.** Over 20,000 cards per world, the empirical rate of "rival closes at step k given it had not closed before" is within ±2 percentage points of the public `hazard(worldId, n, k)` for every n and k with ≥ 500 samples.
9. **AC-9 Reveal.** A lost deal's reveal news appears at the first payday with `month ≥ m + 6` (or in `recap.rivalDeals` if the game ends first); its numbers equal the sealed truth; before that, `metrics().rivals` omits the truth.
10. **AC-10 Evaluator.** With `n = 0`, `scoreOptions` equals T2's values exactly. With `n ≥ 1`, `U(inspect:j)` and `U(offer:k)` equal the §3.6 formulas; `impactFor` branch probabilities sum to 1.

**Logging data**
11. **AC-11 Timeline.** One `tl` row per payday until the cap; each row equals `metrics()` at the end of that payday (100 games); halving at 240 keeps the first row; the final row equals the end state; ≤ 3 KB JSON at 60 months.
12. **AC-12 k / k0.** For 300 random decisions: `replay(cfg, actions.slice(0, k0))` has the same `pending.id` pending with no option chosen; `actions[k]` is the action that recorded the decision. `marks` ≤ 40 and `luckLog` ≤ 40 with the eviction rules of §4.2–4.3.
13. **AC-13 Saves.** v3 fixtures, T2 v4 saves and T3 v4 saves load through `deserialize`, get every §10.1 default, play 60 more turns, and keep loading after a round trip; `tl.from` = the load month for saves without `tl`. Total save growth ≤ 5 KB at 60 months.

**Continue after win**
14. **AC-14** `continueAfterWin` returns `ok:false` (nothing logged) unless `over === 'won'` in `mode:'free'` (incl. learn) and not history; after `W` the game rolls, the goal no longer ends it, `X` ends it with `status:'retired'`, the cap ends it at `afterWin.m + 120`; the second result has `afterWin` and the same stars; `ach()` grants nothing while `afterWin`; a ranked log containing `W` or `X` fails replay; `CODES` contains the full registry of §11.1.
15. **AC-15** Lobby: a continuation's end calls neither `P.recordGame` nor `addAchievements` nor milestones (spies); the free save is kept until the player decides.

**Ghosts**
16. **AC-16 Policies see only public data.** `js/rivals/policies.js` imports nothing from `js/engine.js` (static import scan) and is called with a deep-frozen `publicView` (one test run) and with a Proxy sentinel that throws on access to `rng`, `pending`, `decks`, `negR`, `dd` truth fields; 50 games per archetype per world complete.
17. **AC-17 No look-ahead.** Instrumented over 50 games: while `!S.over`, no `rows` message has a row with `m > upTo`, no mark with `m ≥ upTo`; `ghosts.view(S.month)` never returns a row with `m > lastPaydayMonth(S)` or a mark with `m ≥ S.month`; the main-thread cache holds no unfinished ghost data; after `finish`, full data arrives.
18. **AC-18 Ghost determinism.** For one key, ghost timelines and ends are identical in two Node runs and in a browser worker run.

**Performance (CDP CPU throttling 4×, headless Chrome, 390 × 844; Node numbers on the CI box)**
19. **AC-19 Main thread.** Over a scripted w3 60-month game with all flags on: T6 main-thread time per payday (ghost message handling + panel update if open) p95 ≤ 4 ms; no long task > 50 ms attributable to T6 modules; without a Worker, zero ghost computation during play.
20. **AC-20 Worker and branch.** The worker finishes 4 ghosts × 60 months in ≤ 20 s; incremental advance per player payday ≤ 400 ms worker time (p95); `createBranch` at mid-game ≤ 1.0 s (w1, w2, w4) and ≤ 2.0 s (w3), p95 of 5 runs.
21. **AC-21 Boards and network.** Daily and weekly boards and duel screens contain no ghost rows in the DOM; a group challenge shows the 4 unnumbered reference rows only when the toggle is on and the player has finished; no `net.*` call payload ever contains ghost data (spies, fake backend).
22. **AC-22 Engine overhead (Node).** Median added payday cost (tl + marks + reveal check) ≤ 30 µs; sim games/sec ≥ 90% of the pre-T6 number (same N, same machine).

**End summary**
23. **AC-23 Length.** `#endTop.scrollHeight ≤ 1.5 × innerHeight` at 390 × 844 for each world × {won, lost} × learn on/off, all flags on.
24. **AC-24 Data only.** Rendering fixture results: every number in `#endTop` and the sections (all `<bdi>` contents) appears in the input data (`e.end`, ghost ends) after formatting; no string outside the §14 tables (UI) or engine templates appears (snapshot test).
25. **AC-25 Accessibility.** The graph table holds exactly the `tl` values shown by the graph; both toggles work by keyboard; the SVG has `role="img"` and the engine `alt`; the life story never closes by itself (wait 10 s); axe finds no new violations.
26. **AC-26 2×2 and suggestion.** Cells use only decisions with linked luck ≥ 0.5 E, at most one per cell, empty cells hidden; the suggestion follows the 4-rule order (one fixture per rule).

**Practice rewind and ranked**
27. **AC-27 Branch isolation.** SHA-256 of `rr2-save-free-<w>`, `rr2-save-learn-<w>` and `rr2-last-game` is unchanged after create / play 20 turns / replace / delete branch; the branch has `learn:true`; no stars, achievements, ⚡, board, duel or feed call happens in a branch (spies).
28. **AC-28 Branch fidelity.** The branch state right after creation equals `replay(cfg+learn, actions.slice(0, k0))` (minus `ui`, `learn`); after a different choice, dice, tiles and all stream states equal the original's for the next 30 rolls (20 games, re-running the RS§4.1 harness).
29. **AC-29 Ranked rewind impossible client-side.** In daily/weekly/challenge: no rewind or after-win UI in the DOM; `flagFor('rewind', rankedCfg)` is false even with `?ff=rewind`; `rewind.createBranch(rankedCfg)` throws `rewind_ranked`; the ranked resume prefers a local save with a higher `seq` **only** if the server log is its prefix (crafted saves: diverged local → server state used); a checkpoint load failure never restarts the game from turn 0 (T1 `rankedFail`).
30. **AC-30 Rule cards are true.** Over 100 games per archetype per world: saver never takes a loan to buy and always inspects a deal with ≥ 1 warn flag it considers; gambler never inspects and always offers 15% when offers exist; diversified's auto-invest ≥ 40% of surplus when surplus > 0; founder's first purchase is a non-rent kind when one is offered and affordable.
31. **AC-31 Server (only when approved).** The SQL suite (RS§5.2 cases 1–9, local PostgreSQL) passes against the migration file; `tests/verify.test.mjs` prefix cases pass. Until approval, a test asserts the migration file header contains `NOT APPLIED`.

---

## 16. Sim gates (`tools/sim.mjs`, N = 100 seeds per cell unless noted; cells = world × character × cycle bucket with ≥ 15 games, as T2§13.5)

| # | Gate | Threshold |
|---|---|---|
| G1 | No archetype (saver, founder, diversified, gambler) is the best of the four (highest in-time %, tie-break median months) in > 60% of cells | each ≤ 60% |
| G2 | Each archetype is the best of the four in ≥ 1 cycle bucket (pooled over characters) in ≥ 1 world | all 4 |
| G3 | T2 A4 (all policies incl. archetypes) still holds with competition on | ≤ 60% each |
| G4 | **DD not always right or wrong under competition:** `dd:flagged` beats `dd:never` **and** `dd:always` on in-time % and median months, pooled and in ≥ 3 of 4 worlds (T2 A6, re-run with competition) | holds |
| G5 | `--dominance` with competition: on cards with `n ≥ 1`, neither `inspect:1` nor the best immediate `buy*` is top-U in > 85% or < 10% of its appearances, separately for 0 warn flags and ≥ 1 warn flag | holds |
| G6 | Competition is felt but not punishing: median deals lost per 60-month game for `smart` in [0.3, 2.5]; `dd:always` loses ≥ 1.5× as many as `smart`; a policy that never takes a delay step (`naive`) loses 0 | holds |
| G7 | Ablation `_dev.noRival`: `smart` in-time % changes by ≤ 5 points in every world | holds (if broken, tune `pN` / `close` before anything else) |
| G8 | T2 A1 (guideTapper ≥ 65%) and A3 (smart, adaptive 55–75%) still hold with competition on | holds |
| G9 | Calibration report: empirical hazard vs table (AC-8) per world | report |

**Director decisions after the balance pass (2026-11-22).** G5 is accepted as a known limit of the evaluator (no `optionU` change in T6);
follow-up: score `inspect:1` against `inspect:2` using the level-1 range. G6 is measured as "felt competition" on `dd:always`: mean deals
lost per 60 months in [0.3, 2.5] (a player who reads the 👥 chip — `smart` — rarely delays a contested deal; both numbers are reported).

**Tuning knobs, in this order:** `close` tables → `pN` tables → `roiCuts` → archetype parameters (§2.3; rule cards must stay true) → never `optionU` weights for T6's sake. Record final numbers in `tools/balance-t6.md` and in ENGINE.md "Changes v4".

New sim switches: `--rivals` (report G6, G9 and lost-deal breakdown by tier and flags), `--matrix` gains the `_dev.noRival` ablation column.

---

## 17. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Competition makes DD feel pointless or punishing | the T2 lesson breaks | Warn flags lower interest (§3.3), so DD stays safe where it matters; gates G4–G7; w1 gentle tables; tune `close` first |
| Competition feels like a hidden penalty | frustration | Interest and per-step risk are public and on the button; buying now always works; the loss text names the rival and the cost; the truth is revealed later |
| Ghost look-ahead through a future UI change | ranked unfairness | One accessor (`ghosts.view`), worker-side clamp, AC-17 on both sides |
| Ghost cost on low-end phones | jank, battery | Worker only; no main-thread ghosts during play; cache; flag `rivals` off until measured on a real mid-range Android (T7) |
| Archetypes dominate or look silly | wrong lessons | G1, G2, rule-card truth test AC-30 |
| Persona in deal competition vs the same persona's ghost do different things on the same card | confusion ("Omer took it but his ghost passed") | The end screen never claims a ghost bought a specific card; deal-competition text speaks of the persona as an investor, ghost text speaks of results; documented in this spec (§2.1, §3.1). P2 could align them. |
| Engine work misses the v4 release | second save bump, rules 5 | Path B (§10.4); logging data can still ship in v4 |
| Branch farming of rewards | free stars | Branch = T4 learn rules; AC-27 spies |
| localStorage pressure (branches + ghosts + T1 backups) | save failures | ≤ 4 branches (one per world), ghosts cache evictable and ≤ 80 KB, T1 quota toast |
| Append-only trigger rejects a legitimate two-device game | confused player | `log` mode first for a week, clear Hebrew message, client reloads the server state |
| Production DB / function changes | outage | Additive, mode switch = kill switch, **owner approval required**, not applied in this wave |
| Code-letter clash (`Q`) and module-name clash (`practice.js`) | broken replay / merge clash | §11.2 notes 1–2 |
| T3 assumed `story` = 12 | stream seed mismatch | §11.2 note 4; T3 AC-1 already checks "after T2's streams" |

---

## 18. Rollout and work order

### 18.1 Work order (each step leaves all tests green)
| step | lane | work | tests |
|---|---|---|---|
| S1 | engine | `js/systems/rivals.js`, rival draws + `p.rv` + resolution + luck + evaluator/impact hooks, `v4Defaults`, replay config (`self`, `_dev.noRival`) | AC-1…10 |
| S2 | engine | `tl`, `marks`, `luckLog`, `k`/`k0`, `decisionPoints`, `recapOf`, business totals (with T3) | AC-11…13, AC-26 (engine part) |
| S3 | engine | `W`/`X`, `CODES` registry, `OUTCOME_REV` | AC-14 |
| S4 | engine | `js/rivals/policies.js`, `tools/policies.mjs`, sim switches, tuning to §16 | G1–G9, AC-30 |
| S5 | in-game UI | §12.1 deal-card competition UI (**required for the release that contains S1**) | e2e on a seeded card with n ≥ 1 |
| S6 | shell | worker + `ghosts.js` + cache, flags, `flagFor`, V3 fix, `diverged_checkpoint` handling | AC-16…20, AC-29 |
| S7 | in-game UI | rival panel (flag `rivals`) | AC-19 |
| S8 | lobby | `recap.js`, new end screen (flag `recap2`), life story without timer | AC-23…26 |
| S9 | shell + lobby | `rewind.js`, branches, compare, lobby cards (flag `rewind`) | AC-27, AC-28 |
| S10 | shell + lobby | continue-after-win UI (flag `afterwin`) | AC-15 |
| S11 | lobby | group-challenge reference lines (P1) | AC-21 |
| S12 | release | re-pin (`build-edge.mjs`, `--check`), synchronised deploy at a day/week boundary — **only with the director's and the owner's approval** (TASK_BOARD: merge to main only with the owner's explicit approval) | full suites |
| S13 | server | migration file + verify diff stay in the repo as **NOT applied**; apply only after the owner approves: `log` mode one week (watch `game.checkpoint_audit`) → `enforce`; verify prefix deploy | AC-31 |

### 18.2 Flags and defaults
| flag | default | turns on when |
|---|---|---|
| (none) deal competition | always on with the engine (it changes outcomes, so its UI cannot be hidden) | the release that contains S1 + S5 |
| `recap2` | false | AC-23…26 pass on phone e2e |
| `rivals` | false | AC-17…20 pass, and a real mid-range Android measurement in T7 |
| `rewind` | false | AC-27…29 pass |
| `afterwin` | false | AC-14, AC-15 pass |

### 18.3 Rollback
1. Competition: `rivalCfg(worldId).enabled = false` (draws still consumed, no interest, no losses) + re-pin; or Path A soft rollback of T2 (`rules: 3`) turns it off with everything else.
2. UI features: flags off (remote via `rr2-flags` default change in a site deploy).
3. Server: `update game.t6_settings set v = 'off'`; full rollback statements in the migration file.

### 18.4 P0 / P1 / P2
- **P0:** S1–S8 (deal competition + its UI, logging data, recap, ghosts in summary and panel), S9 rewind core (end-screen and in-game entry points), S10, the V3 client fix.
- **P1:** S11 group reference lines; lobby "last game" rewind entry; timeline backfill for migrated saves; the passed-deals recap.
- **P2:** rivals variant M (shared listings, stream `listing`, action `B`); personas in the 3D city; `replayFrom` snapshot cache; practising a closed daily (RS§5.1 V5); aligning deal-competition personas with their ghosts.

## Implementation notes — ENGINE part (engine lane, 2026-11-22)
Files: `js/engine.js`, new `js/systems/rivals.js`, `js/systems/recap.js`, `js/systems/archetypes.js` (the director moved the policies
here instead of `js/rivals/policies.js` so the browser worker can import them from the engine lane's folder), `js/finance/business.js`
(totals), `tools/policies.mjs` (re-export + `archPolicy`), `tools/sim.mjs` (archetypes via the adapter), `verify_core.js` (`CODES` += K, W, X,
exported), re-pin. Tests: new `tests/t6_engine.test.mjs` (AC-1…14, 16, 30, recap, ghost worker with the real module); `tests/t2.test.mjs`
T8 scramble / key scan extended (`close`, `taker`, unrevealed `truth`), T9 accepts the rival branch.
1. **Path A**: competition is part of rules 4 (save 4). Draws: 4 per deal / mystery landing (also history), none under rules 3; the
   tutorial deal and starter cards get no `p.rv`. `pub.cfClaim` = the claimed cf exactly as printed (`assetCf` of the card at the world's
   public rate / dollar / cycle — no player term), so AC-6 holds.
2. **Interest line for n = 0** is shown too (`data.rivals` exists on every competed card); `data.rivals.chip` is the §14.3 chip text.
   `o.rivalRisk` only when n ≥ 1. The lost panel data is `out.rival = {lost, by:{id, icon, name, label, g}, how, text, sub, button}`.
3. **Evaluator**: the hazard multiplies the whole T2 offer formula (incl. its refusal term), so n = 0 is T2 exactly; inspect =
   `(1 − h)(base + EVI) − stepCost`. `impactFor` branches carry `lost: true` on the rival branch; offers: `[rival, accepted, refused]`.
4. **Luck** `rival`: logged in `luckLog` on a loss or when |amount| ≥ 0.25 E (spec §3.7). `luckLog` k: the deciding action (CUR_K);
   friend / angel luck links to the stored decision index.
5. **Timeline**: a start row at month 1 (so the graph and `alt` have a start), then one row per payday; at the end the final state
   replaces the row of the same month (or is appended). Halving keeps the first row. Migrated saves: empty `tl` from the load month.
6. **Recap** in `js/systems/recap.js` (pure). Business facts include sold businesses (`st.bizPast`). Crisis responses use forced-loan /
   sale marks, plan and frugal/debt focus decisions and the story memory lines (loans taken / repaid are not logged with a month, so they
   are not listed). Suggestion rule 1 uses `gap ≥ 1` (months of expenses) as the "|v| ≥ 1 E" size of a weak decision.
7. **W / X**: `retire` builds the result directly (`buildEnd`), `continueAfterWin` clears `over/result/pending`. The after-win result's
   `afterWin.lines` are the §14.9 engine lines (+ cap / broke line).
8. **Archetypes**: ARCH_API 2. They do not set `quiz` (the worker would then route quizzes to `decide`); the drivers answer quizzes with
   `quizSkill` (saver 0.8, founder / diversified 0.95, gambler 0.4). Rule-card truths enforced by construction: saver never buys with a
   loan nor a flagged deal uninspected (passes when it cannot inspect); gambler never inspects and offers 15 % first; diversified's
   auto-invest = ceil100(40 % of the surplus it sees); founder buys a rent asset only after a non-rent asset / business. Ghost stories
   are left to their defaults (as P0 says), and the sim adapter does the same.
9. Not done here (other lanes / later): `--rivals` sim report and the G1–G9 gates (only lost-deal counts were spot-checked: ~1.4 per
   game for smart-like random play), `tools/balance-t6.md`.
