# T6 "Rivals & summary": independent review

- **Reviewer:** independent review agent. I did not write T6.
- **Scope:** a0cf66e (T4 + T6 engine), e1cd638, 24bc21e, 2be931a, 62c1950, d859c69, plus later engine fixes up to **HEAD = 02c0807**.
- **Snapshot:** every line number refers to HEAD, extracted with `git archive HEAD` to `/tmp/t6rev`. Another lane has uncommitted edits in the shared working tree (`js/game.js`, `js/ui.js`, `js/onboard.js`, `css/game.css`, `tests/game_e2e.py`). I did not read or run them.
- **Browser probes:** run on copies built from the snapshot with `SRC=/tmp/t6rev COPY_DIR=/tmp/t6rev-copies PORT_BASE=8880 tests/serve_copies.sh`. They used the fake backend and the guard (`tests/fakebackend.py`). The guard was clean, so nothing left the machine and production Supabase was never called.
- **Suites re-run on the snapshot:**
  - `tests/t6_client.test.mjs`: 94/0.
  - `tests/t6_engine.test.mjs`: 17/0, about 8.5 min.
  - `tests/t6_e2e.py --only=end,live,ranked,deal,perf`: 41/0. All runs used the **real** `js/systems/archetypes.js`; the e2e printed "archetypes: the engine lane module".
  - `tools/build-edge.mjs --check`: the pin `7f5b5ef0…` is current.
- **Own probes:** two scripts in `/tmp/t6rev-scripts/`.
  - `ghostsize.mjs`: 12 full ghost sets (4 worlds × 3 seeds). It measures cache bytes, how many ghosts end "capped" and compute time.
  - `lastsize.mjs`: the size of `rr2-last-game`.

**Verdict:** 0 blockers, 7 majors, 13 minors, 6 nits.

What is solid:
- The deterministic core: 4 fixed draws, sealed fields, hazard calibration, no money creation, buying now always works, the truth is revealed later.
- The ranked client gates (`flagFor`, `rewind_ranked`, V3 prefix rule).
- W and X are refused in ranked; `CODES` has K, W and X.
- The no-look-ahead clamp on both worker and main thread.
- The SHA-256 branch-isolation test is real.

The problems are in four groups:
- **Practice branches:** after a branch ends, the "original" can be silently cleared or replaced by an unrelated game. A live branch is also a free look-ahead tool for free-play rewards.
- **Storage priority:** the ghost cache is 2–3× the spec budget and is never evicted. A practice-branch write evicts the T1 backups of real saves.
- **The ghost comparison:** it compares unlike facts for capped ghosts.
- **Missing deliverables and test gaps:** the server SQL and verify diff are missing, and several acceptance criteria are not verified.

---

## Blockers

None. Ranked integrity holds on the client, and every practice-only feature is behind a flag that defaults to off.

---

## Major

### M1 — After a branch ends, "עוד תרגול 🎓" silently clears the player's original learning game (data safety; DD-4 "the original is never overwritten")
- **Where:**
  - `js/lobby.js:2087`: `case 'end-learn' → startFree(…, { learn: true, noAsk: true })`.
  - `js/lobby.js:265-271`: with `noAsk` there is no confirmation, then `if (sv) g.clearSave(key)`.
- **Evidence:**
  - A branch is a learning game: `cfg.learn = true` (`rewind.js:131`).
  - So its end screen is the T4 learning end screen (`endButtons`, `lobby.js:1894`), and the "עוד תרגול" button uses `noAsk: true`.
  - In T4 that was safe, because the learning slot held the game that had just ended. With branches, the game that ended lives in `rr2-save-branch-<w>`. The learning slot `rr2-save-learn-<w>` holds the player's live original, or any other unfinished learning game.
- **Scenario:**
  1. Play a learning game to month 20.
  2. Open ⏪ רגעי החלטה and branch at month 12.
  3. Play the branch to its end and tap "עוד תרגול 🎓".
  4. The original learning game is cleared with no question. `saves.clear` backs it up in T1 storage, so it is recoverable only through backup restore, and only while that backup survives (M3).
- **Fix:** in `startFree`, ignore `noAsk` when `endCtx.e.branch`, or when the slot's seed differs from the game that just ended. Better: from a branch end, offer "חזרה למקור" or "ענף חדש" instead of "עוד תרגול".

### M2 — "השוואה" and the branch end screen can present an unrelated game as "המקור" (summary correctness)
- **Where:** `js/rewind.js:90-98` (`originOf`) and `147-153` (`compareData`). `S.ui.branch = {k0, originKey, origin, at}` (`rewind.js:128`) stores no identity of the origin.
- **Evidence:**
  - `originOf` reads whatever is in `rr2-last-game`, or in the live slot, **now**.
  - Neither path checks the seed, world, character or `at` against the branch.
- **Scenario A (origin `last`):**
  1. Finish game A in w1 and branch from its end screen.
  2. Go to the lobby and finish game B in w2. `rr2-last-game` is now B.
  3. Resume the w1 branch and tap השוואה. B's timeline, from another world and seed, is drawn as "המקור", and the facts table compares against it.
  4. The branch's own end screen (`game.js:1366` → `branchTl`) does the same.
- **Scenario B (origin `live`):** the original finishes (its slot is cleared) or is replaced by a new free game. The compare then shows the new game.
- **Fix:**
  - Store `{seed, worldId, charId, at}` of the origin in `ui.branch` and in the `rr2-branches` entry.
  - Have `originOf` / `compareData` return `null` when they do not match. The UI already shows "אין נתונים של המקור להשוואה".
  - Optionally copy the origin's `tl` up to `k0` into the branch at creation. It is small, and it makes the comparison self-contained.

### M3 — Storage priority is inverted: the cosmetic ghost cache is 2–3× budget and never evicted, while branch writes evict the T1 backups of real saves
- **Where:**
  - `js/ghosts.js:33-39` (cache write).
  - `js/saves.js:12-14`: the comment says "rr2-ghosts is evictable", but `SWEEP_KEYS` is only used to quarantine corrupt JSON in `sweep()`.
  - `js/saves.js:120-131`: `evictionList` contains only backups and quarantine.
  - `js/saves.js:238-245` (`write` under quota).
  - `js/rewind.js:133` (`saves.write(branchKey…)`).
- **Evidence (probe `ghostsize.mjs`):**
  - One `rr2-ghosts` entry (4 finished ghosts, cap 1.6 × maxMonths) is **15.5–27.1 KB**. The spec budget (§2.6) is about 10 KB per entry and at most 80 KB in total.
  - 8 entries add up to about **120–215 KB**.
  - Nothing ever evicts this key under quota.
  - A practice branch write (at creation and on every `persist()` in the branch) goes through `saves.write`. Under quota that write drops T1 backups and quarantined data — the copies T1 keeps of the player's real saves — until it fits.
  - Spec §7.3 step 6 says "on quota error → toast, nothing else changes".
- **Scenario:** storage is near the quota. Creating or playing a branch silently deletes the backups of `rr2-save-free-*`, while about 200 KB of re-computable ghost results stay.
- **Fix:**
  - Make `saves.write` evict `rr2-ghosts` (then `rr2-last-game`) before any backup.
  - Give branch writes a "no eviction" mode: quota → `{ok:false, quota:true}` → the existing toast.
  - Shrink the cache: store the ghost `tl` only up to the player's end month plus a short tail, or drop `marks` and the columns that are not shown. Alternatively, cap the cache by bytes (≤ 80 KB) instead of 8 entries.

### M4 — A live branch is a free look-ahead tool for the original free game, which still earns stars, achievements, ⚡ and the friends' "escaped" feed event (fairness, non-ranked)
- **Where:**
  - `js/game.js:1302-1316` (`branchFrom` origin `live`), `1325-1330` (`backToOrigin`).
  - `js/rewind.js:103-138`.
- **Evidence:**
  - The branch replays the same seed. RS§4.2 and AC-28 guarantee that dice, tiles, cards and every sealed draw are identical after a different choice.
  - So the player can branch at the latest decision, play forward (see the next landings and inspect deals to learn their sealed truth), then tap "חזרה למקור".
  - They then play the **normal** free game with perfect knowledge. Its end calls `P.recordGame` (stars, unlocks, titles), `logMilestones` (group feed `escaped`, `stars3`) and the in-game ⚡.
- **Baseline:** "↻ אותו לוח שוב" already allows replaying a free seed from month 1. That costs a whole replay and restarts the game. The live branch makes mid-game peeking free and repeatable. The spec's risk table (§17, "Branch farming") considers rewards inside the branch, not the oracle effect on the original.
- **Fix (one of):**
  - When a branch is created from a live game, mark the original as practised: `S.ui.peeked = true`, written by game.js's own `persist()` before branching, which already writes the origin. At its end, record it like a learning game (no stars, ⚡ or feed).
  - Or offer live branches only from learning games. Free games would rewind only from `rr2-last-game` after they end.
- Either way, document the residual in the spec.

### M5 — The server hardening deliverables are missing from the repo (S13, AC-31)
- **Where:**
  - §8.2: no `supabase/migrations/<date>_t6_append_only_checkpoint.sql`. The SQL exists only in `/tmp/research-t6/sql/t6_append_only.sql`.
  - §8.3: no `isPrefix` or `ck_actions` in `verify_core.js` or `index.ts`, not even as a NOT-APPLIED patch file.
  - AC-31: no test asserting the migration header says `NOT APPLIED`.
- **Impact:**
  - Nothing is applied, which is correct; this is about what is in the repo. The owner has no reviewed package to approve.
  - Until the trigger and the prefix check exist, a ranked log that rewrites an earlier checkpointed prefix passes verify, as long as it replays consistently.
  - The client gate and V3 cover only honest clients. The documented offline residual (§8.4) is broader, but this is the cheap half that the spec promised to stage.
- **Fix:** commit the SQL from the research directory with the `-- T6 — NOT APPLIED — AWAITING OWNER APPROVAL` header. Add the verify diff as a `.patch`, or behind a constant that defaults to off and is excluded from the pin. Add the AC-31 header test.

### M6 — The ghost comparison mixes two definitions of the same facts: capped ghosts use the UI fallback dims, everyone else uses the engine recap
- **Where:**
  - `js/ghost-worker.js:110-116` (`result()`): `end = st.result || E.checkEnd(st)`. When the ghost has not ended, it builds a synthetic `{status:'capped'}` → `dimsOf()` → `summary.js dimsFallback` (`summary.js:72-121`).
- **Evidence (probe `ghostsize.mjs`):**
  - **9 of 12** full ghost sets had at least one capped ghost: saver in w1, gambler in w3/w4, all three non-gamblers in w2/3003.
- **Where the definitions differ:**
  - Happiness `avg`: the fallback takes the mean of the timeline rows (halved timelines are under-sampled). The engine uses `L.hapSum / L.hapN`.
  - Business: the fallback reads only `metrics().businesses`, so sold businesses (`bizPast`) are dropped. Without totals it uses `hist`, which keeps at most 24 entries. The engine includes sold businesses.
  - Decisions: the fallback takes `n` from `summaryForServer`, the engine from `D.n`.
- **Result:** "מקום r מתוך 5" can place the player against facts measured differently. That breaks §5.2 (one named raw fact per dimension).
- **Fix:** have the engine build the recap for a non-ended state. For example, export `recapNow(st)`, or let `buildEnd(st, {capped:true})` return `recap.dims`, and use it in `result()`. Then delete the fallback path for ghosts.

### M7 — Several acceptance criteria are unverified or verified with stand-ins
These run without tests or in weaker form than the spec states:
- **AC deal UI (§12.1, S5):** `t6_e2e.py t_deal` injects **synthetic** `ev.data.rivals` and `rivalRisk`. Its comment says "the engine part is pending", which is no longer true.
  - No browser test lands on a real competed card or verifies the real interest row or chip values.
  - No browser test reaches the **lost** outcome panel (`ui.rivalLost`) or the sticky reveal news.
- **AC-15:** the lobby after-win flow has no test at all: save kept, no `recordGame`, achievements or milestones on the continuation's end. The `afterwin` flag is never on in any e2e except the ranked negative check.
- **AC-18:** browser-worker vs Node determinism is not compared.
- **AC-20:** worker time is not measured under throttling. CDP `Emulation.setCPUThrottlingRate` applies to the page, not to dedicated workers, so "4×" says nothing about the worker. `createBranch` was measured for w1 only; the spec has a separate w3 budget.
- **AC-19:** long tasks are not attributed. The probe reports 35 long tasks, max 430 ms, from all sources. "None > 50 ms from T6 modules" is not shown.
- **AC-23:** measured once (w1, learning, won: 1042 px ≤ 1266). There is no lost, no-learning, other-world, after-win or ranked case. In ranked, `#endTop` also holds the 5-row board (`lobby.js:1653-1658` → `rankHtml`), so it is the likeliest case to exceed the budget.
- **AC-26:** the engine test printed "suggestion rules seen 1". There is no fixture for rules 2–4.
- **Stand-in risk:** the browser ghost tests were written against `tests/fixtures/t6_archetypes.mjs`, a sim-contract (API-1) stand-in. At HEAD the e2e uses the real module, and my runs passed with it, so that risk is retired for the current tree. The worker still runs API-1 modules, though; see m2.
- **Fix:** add the missing cases. Most are small Node fixtures. The deal and lost-panel checks can open a real competed card found by seed scan, the way `t6_engine` AC-7 does.

---

## Minor

- **m1 — An ARCH_V bump never invalidates cached ghosts.**
  - `js/ghosts.js:74-76`: `scanCache` accepts any entry whose key starts with `base + '|'`, whatever ARCH_V it has. A hit sets `mode = 'cache'` and nothing is recomputed, so the stale entry is never replaced.
  - After a policy change, already-cached seeds keep showing the old behaviour, which may no longer match the rule cards.
  - Fix: match `base + '|' + ARCH_V` (load the ARCH_V once on the main thread), or drop entries with another suffix.
- **m2 — The production worker still hands API-1 policies the full engine state.**
  - `js/ghost-worker.js:13-14, 31-37, 85, 95`: `decide(st, ev, …)` and `between(st, …)` receive the live state, including sealed `p.dd`, `negR`, `p.rv.close` and `econ`.
  - Today only `archetypes.js` (API 2) is shipped. But the loader also tries `./rivals/policies.js`, and the test stand-in is API 1.
  - Fix: refuse `ARCH_API !== 2` in the worker. Post `no_policies` instead, and keep API 1 in the sim only.
- **m3 — ⚡ farming during the after-win continuation.**
  - Engine `js/engine.js:3159` still emits `out.reward` for quizzes while `st.afterWin`, and `lobby.js:673-679` credits +1 ⚡ per right answer in free (non-learning) games.
  - Spec §9.1 says "no ⚡ farming". Gate `onQuizReward` on `metrics().afterWin`, or suppress the reward in the engine.
- **m4 — The after-win end lines are recomposed in the lobby from fields the engine does not send.**
  - `lobby.js:1639-1641` uses `A.hap0/A.hap1/A.brokeM`. The engine result (`engine.js:4835`) has `happinessDelta` and `lines`.
  - Effects: the "החופש לא החזיק: בחודש {m} נגמר הכסף." line never shows for `afterWinBroke`, and the happiness line is not the §14.9 `אושר {a} → {b}`.
  - Fix: render `end.afterWin.lines`.
- **m5 — The finished, won save is never cleared when the player declines to continue.**
  - When after-win is offered, `onGameEnd` keeps the save (`lobby.js:1553`). Nothing clears it when the player leaves by another button, which spec §9.3 requires.
  - It is harmless (status `over`, not listed), but it lingers until the slot is reused.
- **m6 — `rr2-last-game` is 7.3–12.8 KB (spec: 4–6 KB) and is not tied to an engine revision.**
  - The size comes partly from `endLite.recap.graph.tl` duplicating `tl` (`summary.js` `endLite`; `rewind.js:56`).
  - No `OUTCOME_REV` or `SAVE_VERSION` is stored. After an outcome-changing release, `E.replay(L.rcfg, actions)` either throws (errFail toast) or silently plays a different game, so "same luck" no longer holds.
  - Fix: store both and refuse on mismatch; drop the duplicated tl.
- **m7 — `ghosts.view(month)` trusts its argument and is exposed as `window.__rrGhosts.view`.**
  - In cache mode the main thread holds full finished ghost games during play (`ghosts.js:66, 173`). This happens only for seeds already finished on this device (same-board replay, branches, the after-win continuation), so it leaks nothing new.
  - Fix: clamp to `G.upTo` while `!G.over`, so the accessor enforces R3 by itself, as §2.2 says.
- **m8 — Some luck is linked to the wrong decision, so it never lands in the right 2×2 cell.**
  - Crypto luck is booked at the **sale** with `CUR_K` (`engine.js:3048`), not at the investment's `x.k` (§4.3).
  - Story odds luck (`engine.js:3766`) uses `CUR_K`, which is −1 when resolved during a roll or payday, so it is unlinked.
  - Separately, `dims.decisions` counts `mixed` as "סבירות" (`recap.js:77`), while the 2×2 excludes `mixed` and the moments sheet calls it "יש מה לשפר" (`ui.js:1785`).
- **m9 — The lost-deal panel lacks the inspection result block, and its title appears twice.**
  - §12.1 asks for the inspection result as the normal DD block. `ui.rivalLost` reads `r.dd`, which the engine never sets.
  - The lost title is also pushed as `news {kind:'rival'}` (`engine.js:4656`), so it shows twice: as a sticky toast (`game.js:1147`) and as the modal title.
- **m10 — `assertPractice` checks only `cfg`, but the replay uses `rcfg`.**
  - `rewind.js:108, 124`. A crafted `rr2-last-game` with a free `cfg` and a non-free `rcfg` produces a branch state whose `mode` then overrides the branch cfg on resume (`game.js:575`).
  - It has no ranked effect (no `resultId`), but for defence in depth also assert `rcfg.mode === 'free'`.
- **m11 — The graph tabs announce tabs that are not real tabs.** `summary.js:252` uses `role="tab"` without `aria-controls`, a tabpanel or arrow-key handling. Use plain toggle buttons (`aria-pressed`) or complete the tabs pattern.
- **m12 — P1 items are missing and not listed as cut.** These are the group-challenge reference lines (§13.3, AC-21: the toggle, 🤖 rows, net spy) and the timeline backfill for migrated saves (§10.1). §0 requires every cut item to be listed.
- **m13 — The ghost loop guard is looser than the spec.** `ghost-worker.js:79` falls back at `n ≥ 6`; spec §2.3 says `n ≥ 3`. It is harmless, since the policies cap themselves at 3, but it is not the documented contract.

## Nits
- `summary.js:307` mutates the engine's `end.recap.graph.notes` (unshift of the win pin) on every render. Copy it first.
- `rivalsSection` "בחודש {m}: שווי נקי" uses the nearest earlier row of a halved ghost timeline without saying so.
- The crisis "אחרי {n} חודשים" counts from the trough (`recap.js:162`). State it, or count from the peak.
- The `rr2-branches` meta entry outlives its branch after the branch ends (only the slot is cleared).
- `t6_e2e.py` `t_deal` comment "the engine part is pending" is stale.
- `ghosts.js` `scanCache` and `view()` in cache mode re-parse and re-map the whole cache (about 200 KB) on every start and panel update. It is cheap today; memoize if the cache grows.

---

## Verified OK

**Fairness / no look-ahead**
- The worker clamps (`flush`: rows `m ≤ upTo`, marks `m < upTo`, nothing until `finish`) and the main thread re-checks and drops violators. Tested in Node with the real policies, and in the browser: 0 violations, `maxRow 17 ≤ upTo 17`.
- `upTo` is monotonic. `finish` happens only from `endGame` (`t6End`). The idle fallback runs only after the end and only while the end screen is visible.
- No Worker → no ghost computation during play (state `noworker`).
- In ranked and in new games no ghost data exists in `rr2-ghosts` before the player's own finish. The cache is written only after `finish`, keyed by seed and mode. Seeds finished earlier only reveal what the player already played.
- The archetypes import no engine code, run against frozen or trapped public views (AC-16), and never touch `st.rng`; they use their own PRNG.
- Deal competition:
  - The `rival` stream takes exactly 4 draws per deal or mystery landing whatever the choice (AC-1, AC-2).
  - Interest is a pure function of the printed card data plus the seals (AC-6a/b).
  - `close` and `taker` are sealed and absent from describe, scoreOptions, hint, impact and publicView (AC-4).
  - The shown % equals the model hazard: ±2 pp over 300k cards per world (AC-8).
  - Buying first never loses (AC-7). A loss costs exactly the step paid, with no asset, loan or happiness change (AC-5).
  - The reveal comes at the first payday ≥ m + 6 with the sealed truth, and metrics omit the truth until then (AC-9).
  - The evaluator equals T2 at n = 0 (AC-10). No clock or timer anywhere: the browser check found no ⏳.

**Ranked integrity**
- `flagFor` forces `rewind` and `afterwin` off for daily, weekly, challenge and any `resultId`, even with `?ff=` (Node and browser).
- `createBranch` throws `rewind_ranked`. `saveLastGame` refuses ranked configs. The branch cfg strips `resultId`, `challengeId`, `groupId` and `duel` and forces `mode:'free', learn:true`, so a branch cannot be submitted as ranked.
- V3: `pickRankedState` uses the local save only if it is newer **and** the server log is its prefix (tested). The `diverged_checkpoint` string and handler are in place.
- `continueAfterWin` and `retire` require `mode:'free'`. In a ranked log, W and X fail replay (AC-14). `verify_core.CODES` contains K, W and X. The engine pin is current.
- A daily game shows no rewind or after-win UI (browser).

**Data safety**
- `rewind.js` writes only through `writeKey` (branch, meta and last-game keys asserted) and `saves.write(branchKey)`.
- The AC-27 SHA-256 test is real: memory storage injected into both `rewind.js` and `saves.js`, hashed after create, 20 turns, replace, delete, branch-from-branch and branch end.
- The browser live-origin hash is unchanged after branch play.
- Branches are capped at one per world (≤ 4). The ghost cache is ≤ 8 entries with a progressive quota fallback. `rr2-branches`, `rr2-last-game` and `rr2-ghosts` are in the sweep.
- v3 and pre-T6 v4 saves migrate (AC-13). A branch save is a normal v4 save under `rr2-save-`, so it is never evicted.

**Summary**
- Every headline, short and alt is an engine template filled with engine numbers (`recap.js`). No composite score: checked in tests and in the page.
- The 2×2 uses linked luck ≥ 0.5 E with one entry per cell, and the cells are ex-ante verdict × ex-post luck, which is sound apart from m8.
- The graph table holds exactly the timeline months (keyboard toggle both ways, caption, row headers). The SVG has `role=img` with the engine alt.
- With `recap2` the life-story overlay is gone; without it there is no auto-close.
- The branch end records a learning game: no stars, achievements, ⚡ or feed. The continuation's end records nothing.

**Performance**
- Ghost message handler p95 0.20 ms, max 2.1 ms at 4× page throttling.
- `createBranch` 148–248 ms at 4× (w1, mid-game).
- A full ghost set (4 × 1.6 × maxMonths) takes 0.3–1.4 s in Node on this box.
- Main-thread memory per game is about one cache entry (≤ 27 KB JSON).
