# T1 verification: Stability, 3D fallback & saves

Verifier: an independent verification agent, 2026-11-22. I did not build or review T1.
Target: committed HEAD `0f601d8` on `feat/rat-race-next-level`. This HEAD also contains the later lanes' work (T2–T6). The main checkout had uncommitted changes from another lane (`css/game.css`, `js/game.js`, `js/onboard.js`, `js/ui.js`, `tests/game_e2e.py`). None of them are in this check.
Verdict: **all 33 acceptance criteria PASS on HEAD.** Review blocker B-1 is fixed (I checked it with my own probe). Minors m-1, m-2, m-3 and m-8 are fixed. I found 2 new minor defects and no blockers.

---

## 1. Setup (what I actually ran)

```
git archive HEAD | tar -x -C /tmp/v1/wt                     # clean export of 0f601d8
SRC=/tmp/v1/wt COPY_DIR=/tmp/v1 PORT_BASE=8890 bash /tmp/v1/wt/tests/serve_copies.sh   # → 8890:200 8891:200 8892:200
```
- Everything ran one after another on 2 shared cores. Load average was 4–9 because of other agents.
- Logs are in `/tmp/v1/logs/`. My probe scripts are in `/tmp/v1/harness/`, outside the repo. I made no code edits and no git writes.
- Screenshots are in `/tmp/v1/shots/`:
  - `t1_*`: the suite's own screenshots.
  - `v_*`: my probes.
  - `v1verify_*`: game_e2e.

**Network isolation (no request left the machine).**
- **The suite.** `stability_e2e.py` is on `guard_lint`'s allowlist (CR-20). It uses its own 503 route for `*.supabase.co` plus an unrouted-request check. I ran it **unchanged** through a wrapper, `/tmp/v1/harness/run_stab.py`. The wrapper imports the module (the `__main__` guard stops it from running on import) and changes only three things:
  - screenshots go to `/tmp/v1/shots`;
  - Chrome also gets `--no-proxy-server --host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`;
  - every non-local request is logged.

  Result:
  - The only non-local requests were to `fonts.googleapis.com`, and the in-browser stub answered all of them.
  - The list of non-local requests that failed was empty.
  - Every scenario passed "no unrouted supabase request".
- **My probes** use the T7 guard: `FB.install(ctx, None)` and `FB.chrome_args('offline', …)`, plus the same resolver rule and the request log.
  - Every probe page: 0 guard-blocked requests, and no non-local request apart from the stubbed fonts.
  - `game_e2e.py` uses `FB.install` and `FB.assert_clean` itself and reported `ERRORS 0`.
- **Production.** No run contacted production Supabase. With the resolver rule and no proxy, nothing except localhost could even be resolved.

## 2. Commands and counts

| Command (cwd `/tmp/v1/wt`) | Result |
|---|---|
| `node tests/saves.test.mjs` | **105 passed, 0 failed** (exit 0) |
| `node tests/flags.test.mjs` | **13 passed, 0 failed** (exit 0) |
| `node tests/render_api.test.mjs` | **231 passed, 0 failed** (exit 0; T-api, T-graph, T-history-keys) |
| `node tools/build-edge.mjs --check` | exit 0, "verify-result pins the current engine e9d0b3c2…" |
| `node tests/{determinism,verify,progress,energy,library,business,finance}.test.mjs` (A-33) | 2/0 · 10/0 · 41 · 26 · 6 · 104 · 37/0. All exit 0 |
| `PORT_BASE=8890 python3 /tmp/v1/harness/run_stab.py --slow` (= `tests/stability_e2e.py --slow`, S0–S12) | **133 passed, 0 failed, 0 unexpected errors**, exit 0. Per-scenario seconds: S0 23 · S1 16 · S2 19 · S3 28 · S4 146 · S5 21 · S6 15 · S7 227 · S8 51 · S9 8 · S10 34 · S11 12 · S12 17 |
| `python3 tests/game_e2e.py w1 8 --base=http://localhost:8890/index.html --prefix=v1verify_` (A-33) | `ERRORS 0`, "w1 done ok 287 s", resume month 6 → 6. Swiftshader args (3D path). That run does not log the renderer kind. |
| `python3 /tmp/v1/harness/probe_b1.py` (B-1, my own) | **22 passed, 0 failed** |
| `python3 /tmp/v1/harness/probe_2d_play.py` (w2 + history in 2D, T2 deal UI) | **32 passed, 0 failed** |
| `python3 /tmp/v1/harness/probe_phone_saves.py` (phone: corrupt + future + quota) | **27 passed, 0 failed** |
| `python3 /tmp/v1/harness/probe_switch.py` (3D→2D→3D, lobby continue) | **16 passed, 0 failed**. The first attempt was cut off when the session restarted. All its checks up to the cut had passed, and the re-run is the full result. |
| `node /tmp/v1/harness/probe_minors.mjs` (m-1/m-2/m-3, Node) | see §4 |
| `python3 /tmp/v1/harness/probe_geom.py` + `probe_frame.py` (2D framing) | 3 "covered tile" FAILs. My elementFromPoint method over-counts them (see D-1). D-1 is confirmed by `probe_frame.py`. |

Note: the expected wording "N passed" from the spec now reads 105 / 13 / 231. The suites grew after the implementation notes (90 / 10 / 176) with the review fixes and later lanes.

## 3. Acceptance criteria

Legend: the S-ids are scenarios of `tests/stability_e2e.py` in the run above. "probe" means my own scripts in `/tmp/v1/harness/`.

| # | Criterion (short) | Result | Evidence |
|---|---|---|---|
| A-1 | No WebGL → 2D board with 40 tiles, S-N1, 3 turns, 0 page errors | **PASS** | S1, all checks pass. Also probe `X-w2-2d` (w2: 40 tiles, S-N1) and `X-hist-2d`. Shot `t1_nowebgl_2d_board.png`, `v_w2_2d_board.png` |
| A-2 | No `/three/` and no `.glb` request; no "Error creating WebGL context" | **PASS** | S1. Probes w2 and history: "no three / .glb request" |
| A-3 | three blocked → real lobby works, 2D + S-N2, no "המשחק עוד נטען…" | **PASS** | S2 |
| A-4 (P1) | three hangs → 2D within 30 s, S-L6 shown | **PASS** | S3 (`--slow`) |
| A-5 | GLB 404 → 3D, S-N6, 3 turns; a hanging GLB still starts within 25 s | **PASS** | S4 and S4b. Shot `t1_glb404_3d.png` |
| A-6 | A failed GLB is requested again at the next start | **PASS** | S4: "A-6 failed GLB requested again" |
| A-7 (P1) | `?ff=board2d:on` → 2D with no three; `#liteBtn` 3D→2D in place with the same HUD, S-N4 | **PASS** | S8 and S8b. Probe `X-switch`: same month/cash/turn `('2','₪5,155',2)`, canvas hidden, S-N4. Shot `v_switch_to_2d.png` |
| A-8 (P1) | board2d.js 404 → renderer `none`, S-N5, 3 turns | **PASS** | S9. Probe `B1-none` also played turns in `none`. Shot `t1_no_renderer.png` |
| A-9 | The 2D action log replays to the saved cash/month/pos/turn | **PASS** | S1. Also probes w2 `[7172,4,32,5]` = saved and history `[109297,4,36,5]` = saved |
| A-10 (P1) | 360×740, 4× CPU: board inside `freeRect`, tiles ≥ 26 px, 3 turns | **PASS** | S8. Also probe `G-w1-phone`: board `[4,160,356,512]` inside `y0 132 … y1 554`. On **desktop** the 2D board does not fit `freeRect` until a resize. That is outside A-10's viewport, see **D-1** |
| A-11 | The 3D overlay lists the stages; models N = GLB requests | **PASS** | S4: "N = GLB requests in that stage", "stage list shown" |
| A-12 | No `%` in `#loading`; the bar never decreases; it stays flat while a GLB is held | **PASS** | Every scenario checks it (S1–S4b). S4b: a flat stretch of at least 2 s |
| A-13 | No error text flashes at boot; `#loading` hidden while the lobby is open | **PASS** | S1 |
| A-14 (P1) | main.js blocked → S-L7 and the reload button after 20 s | **PASS** | S0. Shot `t1_boot_slow.png` |
| A-15 | Mid-turn exception → S-R1 within 2.5 s; recovery keeps the same dice, turn +1, ⚡ spent once, exactly 1 page error, 2 more turns | **PASS** | S7. Shot `t1_recover_bar.png` |
| A-16 | The save is already post-roll right after the error | **PASS** | S7 |
| A-17 (P1) | 3rd stuck within 2 min → S-R2 with "להמשיך במצב קל" → 2D | **PASS** | S7-17 (3D → 2D). The B-1 variant in 2D: S7-17-2d **and my own probe** (§4). Shots `t1_recover_r2_2d.png`, `v_b1_*_r2.png` |
| A-18 | Stuck → lobby → resume-active recovers without a reload | **PASS** | S7-18. Probe B1: the same works from a 4th stuck in 2D and in `none` |
| A-19 (P1) | Errors from extension-origin or lobby-origin scripts → no `#recover` | **PASS** | S7-19 with the roll button disabled. The positive control (same error from a `/js/game.js` frame) does show the bar, so the origin filter is what decides. This answers the review's test-quality remark. |
| A-20 (P1) | `?ff=-recover` → S-R4 toast, no bar | **PASS** | S7-20 |
| A-21 (P2) | Context lost → S-R3 → מצב קל at the same month/turn | **PASS** | S12 (`--slow`) |
| A-22 | Corrupt slot → no continue, backup byte-identical (reason corrupt), S-S4 once, new game | **PASS** | S5 |
| A-23 | Corrupt progress / pending → quarantine byte-identical, S-S8 / S-S10, item split `[5,"x"]` | **PASS** | S5 and S5b. Probe `X-phone-future`: S-S8 on the phone, raw `{bad` kept, not repeated after a reload |
| A-24 | Future save → continue offered → S-S1; slot byte-identical; nothing written | **PASS** | S6. Probe `X-phone-future`: the modal fits 360×740 (card `[12,223,348,517]`, buttons 44 px high, no horizontal scroll). The slot is still identical after "רענון הדף". Shot `v_phone_future_modal.png` |
| A-25 | A new game over a future save → raw moved to rr2-bak (reason future) | **PASS** | S6. Probe `X-phone-future` |
| A-26 | Old (v1) save → continues, S-S2, backup reason migrate, `state.v` = SAVE_VERSION | **PASS** | S6b. As the review noted, the v1 fixture is synthetic (`make_saves.mjs`) |
| A-27 | Ranked resume with a corrupt checkpoint → `false`, no createGame, S-S5 | **PASS** | S5, through the page-level `startGame` call |
| A-28 | History: "▶ להמשיך" on the scenario card; finishing clears the key | **PASS** | S11 (`rr2-save-history-dotcom`). Shot `t1_history_continue.png` |
| A-29 | Quota → the game continues, S-S7 exactly once, 0 page errors | **PASS** | S10. Probe phone, synthetic quota: once. Probe phone, **real quota** (localStorage filled to 5,242,696 chars, the next `setItem` throws `QuotaExceededError`): the game starts, 3 turns, S-S7 exactly once, 0 page errors, console clean, no recover bar. After freeing space, the next turn is saved. Shot `v_phone_quota_real.png` |
| A-30 | Backup caps: ≤ 2 per slot, ≤ 8 in total, oldest evicted first, a future item survives | **PASS** | `saves.test.mjs` (105/0) |
| A-31 | Engine import graph has no flags/saves/render; `build-edge --check` passes | **PASS** | `render_api.test.mjs` T-graph. `build-edge --check` exit 0 |
| A-32 | Every `scene.*` call is in SCENE_API; board2d and null export all of them | **PASS** | `render_api.test.mjs` T-api |
| A-33 | Existing Node suites pass; `game_e2e.py w1 8` passes on 3D | **PASS** | §2. The game_e2e run used swiftshader args (the 3D path), but that run did not assert the renderer kind |

## 4. Review fixes (066df0e and the hunks in c3d8256)

- **B-1: FIXED.** I checked it myself with `probe_b1.py` (T7 guard, my own script, not the suite).
  - **No WebGL, 2D:** three `#dieSr` injections.
    - The 3rd bar shows S-R2 with the 2D body "זה קורה שוב. אפשר להמשיך מהשמירה, או לחזור ללובי." Its buttons are `["להמשיך מהשמירה" (primary), "חזרה ללובי"]`, so no מצב קל is offered.
    - The primary button gives a playable game (card open), bar hidden, `isStuck()` false, still 2D.
    - A full turn can then be played.
    - A 4th stuck in the same window shows the 2D R2 text again. "חזרה ללובי", then `#start` hidden (as `resume-active` does) gives a playable game, and one more turn plays.
    - 4 page errors, one per injection. 0 console errors.
  - **Renderer `none`** (`?ff=board2d:on`, board2d.js 404): the same sequence, the same results.
  - **Code at HEAD:** `recover()` takes the lite branch only when `scene.kind === '3d'`. `showRecoverBar('R2')` uses `STR.R2b2d` when the renderer is not 3D (`js/game.js:79,89-94`).
- **m-1: FIXED.** `probe_minors.mjs` repeats the review's scenario: a w2 future backup, a quarantined `rr-player`, then a w1 overwrite backup bigger than 291 KB. Backups afterwards: `[w2 future, w1 overwrite]`, and `rr2-quarantine:rr-player` is kept.
- **m-2: FIXED.**
  - Storage whose getter throws `SecurityError`: `sweep()` no longer throws and returns an empty result. `write()` returns `{ok:false, quota:false}`.
  - `persist()` now toasts S-S7b on any failed write that isn't a refused future-save write (`js/game.js:133`).
  - I checked the S-S7b toast only in the code, not in a browser.
- **m-3: FIXED.** A save that classifies as current but can't be deserialized (unknown world `w9`), with no room for a backup:
  - `load` → `incompatible`, and the slot is kept;
  - `claimSlot(key, sameSeed)` → `{ok:false, reason:'incompatible', keep:true}`, so it doesn't overwrite.
- **m-8 / m-6: FIXED** in `css/stability.css`:
  - `.b2d-tn` and `.b2d-cl` use `max(12px, …)`;
  - `.b2d-pawn` has a plain `background: var(--pawn)` before the `color-mix` gradient.
- **Not claimed fixed, still open:**
  - **m-4:** not exercised.
  - **m-5:** confirmed. After the 2D→3D reload with the real lobby, `body.lb-lobby-open` is still set while the game is on screen (probe `X-switch`). The game itself resumes correctly in 3D at the same month/cash/turn, and lobby → resume-active and lobby → continue-free both work afterwards.
  - **m-7:** not checked.
  - **m-9:** checked only in the code. `syncLiteBtn()` still has no `webglAvailable()` check. In the no-WebGL probes `#liteBtn` is visible in 2D, but I did not click it.

## 5. Exploratory results

1. **No WebGL, w2, 2D (5 turns).**
   - The board has 40 tiles, `data-world=w2`, caption "העיר שלך".
   - Turn 1 brought a deal card, "חנות פינתית ברחוב ראשי", with `inspect:1`, `inspect:2`, offers, buy and pass.
   - The **T2 impact panel** ("📊 מה זה עושה לי?") opened with content: the before/after table, new debts and the scenario tabs. It sits inside the card.
   - `inspect:1` kept the card open, and the due-diligence box went from `lv0` to `lv1`. The impact panel re-rendered with the updated numbers, and the second tab renders.
   - Over all 5 turns: 0 page errors, a clean console, no `__rrErrors`, and the replay matches the saved state.
   - Picker → "להמשיך · …, חודש 4" restores the same month, cash and turn, still in 2D, and one more turn plays.
   - Shots: `v_w2_impact_open.png`, `v_w2_after_inspect.png`.
2. **History, 2D (5 turns).**
   - Scenario `dotcom` loads with the `b2d-hist` sepia board and `data-world=h`.
   - A deal card ("דירה ישנה שדורשת שיפוץ") came up. The impact panel and inspection 1 worked the same way, and the second tab renders.
   - The replay matches. 0 errors. The save is under `rr2-save-history-dotcom`.
   - Shots: `v_hist_2d_board.png`, `v_hist_impact_open.png`, `v_hist_after_inspect.png`.
   - Nothing in the 2D game itself broke in either world. The only 2D problem I found is layout (D-1).
3. **Phone, 360×740, DPR 2, no WebGL:** corrupt progress, a future save, synthetic quota and real quota all pass (§3 A-23, A-24, A-29). The one cosmetic issue is D-2.
4. **3D → 2D mid-game and back, with the real lobby.**
   - 3D → 2D happens live with the same HUD.
   - The 2D → 3D reload auto-resumes in 3D at the same month/cash/turn. `rr2-resume-once` is used up and `lite` is false afterwards.
   - Then lobby → "חזרה למשחק" and lobby → world card → `continue-free` both resume the same state, and turns play after each.
   - 0 page errors, clean console. See m-5 for the leftover lobby class.

## 6. Defects found

**D-1 (minor, 2D layout, a new interaction with the T2 HUD row): on desktop the 2D board is framed to an out-of-date `freeRect` and its top row sits under the HUD's second row.**
- **Repro:** 1300×820, no WebGL (or `?ff=board2d:on`), start w1 or w2 from the picker, then measure (`/tmp/v1/harness/probe_frame.py`).
- **Measured:**

  | | `ui.freeRect().y0` | `#hLife` (focus / job / economy chips) | board top |
  |---|---|---|---|
  | At start | 123.5 | y 86–120 | 70 |
  | After 2 turns | 123.5 | y 86–120 | 70 (unchanged) |
  | After `dispatchEvent(new Event('resize'))` | 123.5 | y 86–120 | 128 (fits) |

- **What the player sees:** the "מוקד", "עבודה רגילה" and economy-gauge chips cover the top-row tiles (about 27–30), as seen in `v_geom_G-w1-desk.png` and `v_w2_2d_board.png`. The pawn can be hidden there.
- **Cause:** `game.js` calls `frame()` (`scene.frame(ui.freeRect())`) before the HUD's second row has its final height. After that, `frame()` runs again only on `resize`. 3D tolerates this because of the camera; 2D does not. 360×740 is not affected: board `[4,160,356,512]` with y0 = 132.
- **Suggested fix (T1, game.js):** call `frame()` again after the first `render()` of a start, or use a `ResizeObserver` on `#hud`.
- **Note on the method:** `probe_geom.py`'s elementFromPoint check over-counts covered tiles, because 2D tiles hit-test through to `body` (pointer-events). The real overlap is the `#hLife` and `.lc` entries plus the measured rects above.

**D-2 (minor, cosmetic, phone): long T1 toasts clip in the rounded toast pill at 360 px.**
- S-S7 (and S-S8) wrap to 8–9 lines inside the fully rounded toast. The first and last lines touch or clip at the curve.
- At boot, S-S8 overlaps the tag of the S-S1 modal ("שמירה מגרסה חדשה").
- Shots: `v_phone_quota_real.png`, `v_phone_future_modal.png`.
- Owner: the toast style in `css/game.css`/`ui.js` (not T1-owned). T1 could also shorten S-S7.

No blockers or majors. No page errors or console errors in any of my probe runs apart from the deliberately injected ones.

## 7. Not verified

- m-4 (concurrent tabs) and m-7 (screen-reader re-announcement): not exercised.
- m-9: checked only in the code.
- S-S7b in a browser: checked only in the code plus `saves.test`.
- The renderer kind of the `game_e2e.py` run: not asserted by that run.
- Real low-end hardware: the CPU throttle is emulated.
