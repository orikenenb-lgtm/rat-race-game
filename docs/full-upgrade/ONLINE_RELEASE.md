# ONLINE_RELEASE — האם "חדר חי" (2–4 שחקנים אונליין) מוכן לייצור

## סיכום בעברית

### עדכון 2026-11-26: כלי מנהל + צ'אט בחדרים

פירוט מלא נמצא ב-`ADMIN_CHAT.md`.

**שורה תחתונה:** מוכן כטיוטה. זה שחרור נפרד, והוא בא **אחרי** שחרור החדרים, באישור נפרד שלך.

**מה נבנה:** מיגרציה חדשה `20261126_admin_mod_chat.sql`. היא טיוטה ולא הופעלה בשום מקום חוץ מבמכונה.
- **רק אתה, כמנהל:**
  - פותח את כל המפות.
  - משעה שחקן (עם סיבה ומשך) ומבטל השעיה.
  - מעיף שחקן מחדר: בחדר המתנה, או באמצע משחק, ואז השאר ממשיכים לשחק.
  - סוגר חדר.
  - מוציא שחקן מקבוצה.
  - רואה דיווחים מהצ'אט, מסתיר הודעות ומשעה את מי ששלח אותן.
  - רואה יומן פעולות שאי אפשר למחוק.
- **כל פעולה הורסת דורשת לחיצה שנייה.**
- **השרת בודק שאתה המנהל בכל פעולה.**
- **צ'אט בחדר:**
  - רק שחקני החדר.
  - עד 120 תווים.
  - השרת חוסם קישורים, טלפונים, מיילים, @שמות וקללות, בעברית ובאנגלית.
  - עד 5 הודעות ב-10 שניות ועד 60 בשעה.
  - משפטים מהירים, השתקה ו"דווח".
  - נשמר 7 ימים.
  - לא נוגע במשחק.

**בדיקות** (מספרים אמיתיים, על `git archive` של `fcd614b`, 0 כישלונות):
- **אופליין:** 939 מתוך 939.
  - 452 בדיקות החדרים, כמו קודם.
  - 195 בדיקות חדשות למנהל ולצ'אט.
  - 292 בדיקות של הלובי, הקבוצות, p0b, p1_touch ו-admin_e2e.
- **על ה-staging המקומי האמיתי:** 295 מתוך 295.
  - 147 בדיקות החדרים, כמו קודם.
  - 148 בדיקות חדשות: חוזה 75, צ'אט בדפדפן 35, מנהל בדפדפן 38.

**מה דורש את האישור שלך:** ראה §7, סעיפים 7–10.

---

**שורה תחתונה: מוכן לשחרור לייצור, אחרי האישורים שלך. החוסם הגדול (B1) נבדק עכשיו על שרת אמיתי מקומי, ונמצא ותוקן בו באג שהיה שובר כל חדר.**

**מה עשיתי:**
- בניתי "staging" מקומי וחינמי בתוך המכונה, בלי שום פרויקט בענן: PostgreSQL 17 אמיתי, PgBouncer (כמו ה-pooler של Supabase), PostgREST (בדקתי 3 גרסאות), ו-Deno שמריץ את פונקציית השרת `room` עצמה, כמו ש-Supabase מריץ אותה. הכול ב-`tools/staging/`.
- ההרצה האמיתית הראשונה של הפונקציה מצאה באג חמור: postgres.js קידד פעמיים כל ערך JSON. בייצור, **כל** לחיצה על "להתחיל משחק" הייתה נכשלת בשגיאת שרת (500). PGlite לא הראה את זה. תיקנתי, וזה נבדק עכשיו על השרת האמיתי.
- תיקנתי את S1–S6 (ובנוסף S7 חלקית ו-N4):
  - **S1:** חדר שנתקע אחרי עדכון מנוע נסגר עכשיו לבד אחרי 2 דקות, בלי דירוג, עם הודעה ברורה בעברית.
  - **S2:** חדרי המתנה נטושים פגים ב-SQL, בלי cron. הם לא נספרים במגבלת 3 החדרים, ואי אפשר להצטרף אליהם.
  - **S3:** קישור ההזמנה מוסיף `&ff=rooms` בתקופת הניסיון.
  - **S4:** הודעות נכונות על "יותר מדי ניסיונות" ועל "המשחק התעדכן", כולל מה לעשות.
  - **S5:** פחות כתיבות למסד: רק השחקן שזז נכתב, ובדיקת מצב (poll) לא כותבת כלום אם לא עברו 15 שניות.
  - **S6:** פונקציית ניקוי `game.room_purge(30)` שמוחקת חדרים שהסתיימו לפני יותר מ-30 יום. מריצים אותה ידנית, היא לא מתוזמנת.

**בדיקות (מספרים אמיתיים, 0 כישלונות בבדיקות החדרים):**
- אופליין: 452 מתוך 452, ב-10 סוויטות.
- על ה-staging המקומי האמיתי: 147 מתוך 147.
  - פירוט: חוזה ה-API של החדרים 43, smoke של שחרור 27, בדיקת שרת חדשה 22, ו-55 בדיקות דפדפן אמיתיות מול השרת האמיתי.
  - עברו גם עם PostgREST 12.2.3, 13.0.4 ו-14.2, וגם בחיבור ישיר למסד וגם דרך pooler.

**מה רק Supabase אמיתי יכול להוכיח (סיכונים שנשארו):**
1. **זמן עלייה קר:** טעינת המנוע לקחה כאן 1.3–1.7 שניות CPU, והמגבלה של Supabase היא 2 שניות. המרווח צר, וצריך לעקוב בלוגים.
2. **הפריסה:** לפרוס **רק** עם `--no-verify-jwt` (B2).
3. **אותו קומיט:** האתר, `room` ו-`verify-result` חייבים לצאת מאותו קומיט (B3).
4. **מהירות:** האזור והמהירות ברשת אמיתית.
5. **החיבור למסד:** סוג החיבור (`SUPABASE_DB_URL`). כאן נבדקו שני הסוגים ושניהם עבדו.

**מה דורש את האישור שלך:**
1. הרצת המיגרציה בייצור.
2. פריסת הפונקציה `room` עם `--no-verify-jwt`, יחד עם האתר ו-`verify-result`.
3. בדיקת smoke בייצור. היא יוצרת 2 שחקני טסט וחדר מבוטל אחד.
4. הדלקת הדגל.
5. מדיניות המחיקה: מתי להריץ את `room_purge`.

פרויקט staging בענן כבר לא נדרש. הוא אופציונלי, ויכול לתת ודאות נוספת לגבי ה-CPU והאזור.

**ממצאים בשבילם של סוכנים אחרים (לא תיקנתי, כי אלה לא הקבצים שלי):**
- בקובץ `production_baseline.sql` חסרות הפונקציות `rr_sync_progress2`, `rr_weekly` ו-`rr_admin_*`, והלובי קורא להן.
- הטקסט של `rate_limited` ב-`net.js` עדיין שגוי מחוץ למסכי החדר.

---

## 1. Verdict

| area | state |
|---|---|
| Room logic (`room_core.js`), redaction, fairness, idempotency, timeouts | **ready**: room_core 22/22; server step === client engine byte-for-byte |
| SQL draft `20261124_rooms.sql` | **ready to apply**: additive, atomic, rollback exact (PGlite + real PostgreSQL 17); now with lifecycle without cron |
| Edge Function `index.ts` + `room_store.js` in a real runtime | **verified locally** on Deno 2.9.8 + postgres.js 3.4.5 + PgBouncer / direct + PostgREST 12.2 / 13.0 / 14.2. **One production-breaking bug found and fixed** (§3.1) |
| Client (`rooms.js`, `remote.js`, `net.js`, game.js hook) | **ready behind the flag**: 76/76 browser e2e on the fake, 55/55 (all room checks) against the real local stack |
| Operations | S1 / S2 / S5 / S6 fixed. Remaining: watch the cold-start CPU (§3.3), deploy with `--no-verify-jwt`, one release commit |

**Ready for the production release (steps in §6), with the owner's approvals.** A hosted staging project is no longer a blocker.

## 2. Local staging (replaces B1's staging project): `tools/staging/`

It is free and runs inside this machine on 127.0.0.1. No hosted Supabase project is ever contacted.

| piece | what | like Supabase |
|---|---|---|
| PostgreSQL 17.12 (PGDG apt) | initdb with superuser `supabase_admin`; scram over TCP | `postgres` is a non-superuser (createrole, createdb, replication, bypassrls) and owns `public` / `game` / `extensions`. anon / authenticated / service_role are NOLOGIN. `authenticator` (noinherit) is the PostgREST login. pgcrypto lives in `extensions`. Supabase's default privileges are on `public` |
| schema | `production_baseline.sql` (FK-ordered by `baseline.mjs`), then the live `20261123_admin.sql` + the read-only `production_supplement.sql` (= the live public API), then rooms → groups v2 → competitions → the moderation + chat draft `20261126_admin_mod_chat.sql`, each applied **as postgres**, each once (`game.staging_applied`) | the SQL editor / `psql "$DB_URL"` path of the runbook |
| PgBouncer 1.26.1 | transaction pooling | Supavisor :6543 (needs `prepare:false`, which index.ts sets) |
| PostgREST 13.0.4 (default), 12.2.3, 14.2 | `db-schemas=public`, `db-anon-role=anon` | the REST API |
| Deno 2.9.8 + `edge_shim.ts` | runs `supabase/functions/room/index.ts` and `verify-result/index.ts` unchanged: captures their `Deno.serve`, injects `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_DB_URL`, and logs wall + CPU ms per request | the Edge Runtime |
| `gateway.mjs` | `/rest/v1/*` → PostgREST, `/functions/v1/<fn>` → Deno, `apikey` required. `RR_STAGING_VERIFY_JWT=room` emulates a deploy without `--no-verify-jwt` | `<ref>.supabase.co` |

Run it:

```
bash tools/staging/install.sh                                       # once (apt + GitHub releases)
RR_SRC=<export of commit C> bash tools/staging/setup.sh --reset     # DB + roles + baseline + drafts
RR_STAGING_FAKETIME=1 bash tools/staging/start.sh                   # FAKETIME: tests can move the DB clock
bash tools/staging/run_live.sh                                      # contract (rooms) + smoke + online_local + admin_chat_contract
. /tmp/rr-staging/target.env && python3 tests/rooms_e2e.py http://localhost:<site>/ --hook=… --local
RR_POSTGREST=/opt/staging-bin/postgrest-v14.2 RR_EDGE_DB=direct …   # other PostgREST / a direct DB URL (stop.sh postgrest room verify-result first)
bash tools/staging/stop.sh
```

The client is never edited for this. `tests/online_localstack.py` relays the page's calls to the production URL (rest/v1/rpc, functions/v1/room) to the local gateway and fulfils them; `fakebackend.install`'s guard aborts anything else (`assert_clean`). `net.js` needs no hook.

## 3. What the local staging proved (B1), and what only hosted Supabase can prove

### 3.1 Proved on the real stack

| B1 item | result |
|---|---|
| postgres.js parameter binding | **Bug found + fixed.** With `prepare:false`, postgres.js still describes the statement. For `$n::jsonb` / `$n::json` it then JSON-encodes the JSON text **again**. `start` failed the settings CHECK (500 `server_error`), and every json column would have held a string. Fixed in `room_store.js`: `$n::text::jsonb` / `$n::text::json` (byte-faithful on both drivers). Now proved: jsonb/json columns hold objects/arrays; the stored state text === `JSON.stringify` and `E.replay(actions)` reproduces it; `$2::smallint[]` arrays work; bigint arrives as a string and the `Number()` conversions are right; `to_timestamp(ms)` works |
| JSON import attribute, pinned bundle | `import bundle … with { type: 'json' }` works in Deno 2.9.8; health answers the checkout's pin |
| `SUPABASE_DB_URL` connection type + pool | all suites pass through **PgBouncer transaction mode** and **direct**. Pool `max:3`: 40 concurrent mixed calls → no 5xx. Two parallel rolls of one seat → one 200, one 409, the seat advanced exactly once (row lock + one transaction per call) |
| PostgREST error mapping | `raise exception 'x'` → HTTP 400 `{code:'P0001', message:'x'}` on 12.2.3 / 13.0.4 / 14.2. `game.auth`'s `unauthorized` (errcode 28000) → **HTTP 403**. That is harmless: `net.js` reads only `.message`. The Edge Function maps it to 401 itself |
| commit-on-400 (`rooms.sql` `game.room_fail`, `response.status`) | **committed** on all three PostgREST versions: 20 failed codes are kept, and the 21st → `rate_limited` |
| STABLE / read-only transactions | `rr_my_rooms` now sweeps, so it is VOLATILE. It works under PostgREST, and the sweep is committed |
| grants through the API | tables are not reachable through REST; schema `game` is not exposed; `game.*` (incl. `room_purge`) is not callable |
| cold start | engine load (first call past `game.auth`) **1.30–1.71 s CPU** over 6 cold starts (Deno on a 2-core box, load average ≈ 6). Warm Edge calls: median 19 ms; p95 242 ms during bursts |
| the whole client | `rooms_e2e.py --local`: 55/55. Real lobby UI, 2–5 browser identities, double click, duplicate delivery, lost answer + resend, two tabs, timeout autopilot (DB clock moved by libfaketime), disconnect / back, host leaves, finish once, the 3D game screen |

### 3.2 S1–S6 end to end on the stack (`tests/online_local.test.mjs`)

- **S1:** a room whose `engine_sha` is not the function's pin → 409 `version_changed {closes_in}`, and `pin_mismatch_at` is stored even on that error answer. After the grace, the tick → 200 `applied:1`: cancelled, `version_changed`, unranked, seed revealed.
- **S2:** a lobby idle 3 h is swept by another player's `rr_my_rooms`; its code → `room_not_found`.
- **S5:** an act rewrites only the acting seat's row (xmin unchanged for the others); 6 fresh polls write nothing.
- **S6:** `room_purge(30)` deletes a room that ended 45 days ago, with its seats and events.

### 3.3 Only hosted Supabase can prove

1. The Edge Runtime's own CPU accounting, its 2 s limit, and how often isolates start cold. 1.3–1.7 s here leaves a thin margin; the core is 98.4 % of `MAX_BUNDLE`.
2. Which `SUPABASE_DB_URL` the project injects (direct / Supavisor; IPv6). Both modes pass here.
3. The real gateway: `verify_jwt` (B2), body limits, CORS pass-through, the publishable-key → anon mapping.
4. Region placement and per-intent latency (S7). Locally an act is ≈ 20 ms, with no network.
5. Supabase-managed defaults in schema `game` (modelled here; N4 now revokes explicitly).
6. The project's exact PostgREST version (12.2 / 13.0 / 14.2 all pass).
7. Phones on real networks.

## 4. Real test results (this run)

Commit `a179c4f` (plus the `start.sh` FAKETIME-restart fix committed with this document). Offline: a `git archive HEAD` export with private copies on ports 11700–11702, one suite at a time. room_core ran on a byte-identical export (`diff -r` empty).

| suite | offline (fake / PGlite) | live-local (real stack) |
|---|---|---|
| `node tests/room_core.test.mjs` | **22 / 22** (5,982 intents, 25.4 ms/intent; parity 3,333/3,333 metrics, 2,927 events, 0 differ) | — |
| `node tests/room_net.test.mjs` | **70 / 70** (+14: S1 pin change with grace / overlap, S2 sweep) | — |
| `node tests/remote_driver.test.mjs` | **29 / 29** | — |
| `node tests/fairness.test.mjs` | **3 / 3** | — |
| `node tests/flags.test.mjs` | **16 / 16** | — |
| `RR_PGLITE=… node tests/sql_drafts.test.mjs` | **14 / 14** | (the drafts apply as postgres on PG 17: setup.sh) |
| `RR_PGLITE=… node tests/online_migration.test.mjs` | **12 / 12** (the 4 GAP probes are now S2 / S1 / S5 / S6 checks) | — |
| `node tests/backend_contract.mjs` | **185 / 185** (fake) | `--live --local --only=rooms`: **43 passed**, 0 failed, 1 DIFF-ASSUMED (legacy `rr_register` exists in the baseline), 1 skip |
| `node tests/online_smoke.mjs` | **25 / 25** (1 SKIP: no GET on the fake) | `--live --local`: **27 / 27** (health pin, CORS, create → … → cancel vote) |
| `node tests/online_local.test.mjs` | SKIP without the stack | **22 / 22** |
| `python3 tests/rooms_e2e.py … --hook=…` | **76 / 76** | `--local`: **55 / 55** (the 21 groups v2 / competitions checks are skipped: not rooms) |
| **total** | **452 passed, 0 failed** (10 suites) | **147 passed, 0 failed** |

- **PostgREST / DB matrix:** the 3 live-local HTTP suites (92 checks) pass identically with 12.2.3 + pooler, 13.0.4 + pooler, 14.2 + pooler, and 13.0.4 + direct.
- **`node tools/build-edge.mjs --check`:** ✓ pin `f0f3bace…`; core 885,667 chars.
- **`python3 tests/guard_lint.py`:** only the pre-existing `sql_drafts.test.mjs:7` note.
- **Full contract (all sections, `RR_DRAFTS=1`):** 162 passed, 19 failed, 3 DIFF-ASSUMED. All 19 failures are in the pre-draft sections: the fake's model of older RPCs differs from `production_baseline.sql` (missing `rr_sync_progress2` / `rr_weekly`, `{ok:true}` vs `null` answers). Every groups v2 + competitions + rooms case passes on real PostgreSQL. This is for the backend owners (§5, F1).

### 4.1 Moderation + chat (draft `20261126_admin_mod_chat.sql`) — run of 2026-11-26 on a `git archive` export of `fcd614b`

Setup:
- Private copies: `COPY_DIR=/tmp/admchat PORT_BASE=12000`.
- A private stack: `RR_STAGING_DIR=/tmp/rr-staging-adm RR_STAGING_PORT=55421`, `setup.sh --reset` then `RR_STAGING_FAKETIME=1 start.sh`.
- One suite at a time.

| suite | offline (fake / PGlite) | live-local (real stack) |
|---|---|---|
| the §4 room regression (room_core 22, room_net 70, remote_driver 29, fairness 3, flags 16, sql_drafts 14, online_migration 12, backend_contract 185, online_smoke 25, rooms_e2e 76) | **452 / 452** | contract-rooms 43 (+1 DIFF-ASSUMED, 1 skip), smoke 27, online_local 22, rooms_e2e 55: **147 / 147** |
| `node tests/admin_chat_sql.test.mjs` (PGlite: additive, only `game.board` + `game.room_purge` replaced, rollback exact, 84 filter cases in SQL, every rule) | **22 / 22** | (the draft applies as postgres on PG 17: `setup.sh`) |
| `node tests/chat_rules.test.mjs` | **7 / 7** | — |
| `node tests/admin_unlock.test.mjs` | **19 / 19** | — |
| `node tests/admin_chat_contract.mjs` | **74 / 74** (fake) | `--live --local`: **75 / 75** |
| `python3 tests/chat_e2e.py` | **35 / 35** | `--local`: **35 / 35** |
| `python3 tests/admin_mod_e2e.py` | **38 / 38** | `--local`: **38 / 38** |
| lobby_e2e 46, groups_e2e 54, p0b 21, p1_touch 13, admin_e2e 18, fakebackend_test 20, groups.test 120 | **292 / 292** | — |
| **total** | **939 passed, 0 failed** | **295 passed, 0 failed** |

Findings of this run:
- **libfaketime on the stack:** a moved DB clock reaches each pooled PostgreSQL backend on its own schedule. About 10 calls on the old time were seen. So short windows (the 10 s chat limit) use real time in `--local`; minutes / hours still use the clock.
- **The client's room screen used to scroll to the top on every poll repaint.** It now keeps the reading position (chat, opponents).
- **A focused, half-typed chat message holds a poll repaint for ≤ 8 s.** This is so the phone keyboard stays open.

## 5. Gaps (status)

| # | gap | status |
|---|---|---|
| B1 | Edge Function never ran in a real runtime | **done locally** (§3.1). The bug found is fixed. Hosted-only items: §3.3 |
| B2 | `verify_jwt` must be false | **open (deploy flag):** `supabase functions deploy room --no-verify-jwt` |
| B3 | pin coupling: one release commit | **open (process):** release from one tagged commit where `build-edge --check` passes. S1 now cleans up rooms the deploy interrupts |
| S1 | stuck rooms after a pin change | **fixed** (`room_core.pinGate`, `rooms.pin_mismatch_at`). 409 `version_changed {closes_in}` for 2 minutes. A server with the room's own pin clears it: deploy overlap, or a rollback inside the window. Then the next start/act/tick cancels the room (`version_changed`, unranked). Hebrew: "המשחק התעדכן לגרסה חדשה… החדר ייסגר תוך כמה דקות בלי דירוג. אפשר לצאת עכשיו, להצביע על ביטול, או לפתוח חדר חדש." Games in progress at deploy time are therefore lost: deploy at quiet hours |
| S2 | lobby expiry / abandon only in a client tick | **fixed** in SQL. `game.room_sweep()` (≤ 50 rows, `SKIP LOCKED`) runs at the start of `rr_room_create` / `rr_room_join` / `rr_my_rooms`. The cap counts lobbies + playing rooms active in the last 2 h. An idle *playing* room is still ranked as `abandoned` by the next Edge tick (that needs the engine) |
| S3 | canary invite links lose `?ff=rooms` | **fixed** (`rooms.js` `roomLink`: adds `&ff=rooms` while `DEFAULTS.rooms` is false; nothing after the flip) |
| S4 | Hebrew for `rate_limited` / `version_changed` | **fixed on the room screens** (`rooms.js` `roomMsg`: create 10/day, join 20 codes/hour, acts, reactions; version_changed with what to do, shown once). `net.js` `ERR.rate_limited` ("יותר מדי עדכונים היום") is still generic for other screens. Owner of `net.js`: e.g. "יותר מדי ניסיונות — נסה שוב בעוד כמה דקות" |
| S5 | write amplification | **fixed:** `saveRoom` writes only changed seats (state/view only when replaced); `rr_room_state` takes no lock and writes nothing while `last_seen` < 15 s (heartbeat 15 s keeps "connected"). Proved by row versions on the stack |
| S6 | no retention | **fixed (callable):** `game.room_purge(p_days default 30)`. Owner-run; not granted to the API roles; never touches lobby/playing rooms. When to run it is the owner's decision |
| S7 | region / latency | **partly:** `x-region` is allowed by CORS now. Measure on the first hosted calls (`online_smoke` prints latencies); `net.js` does not send it |
| S8 | per-isolate throttle | acceptable (unchanged) |
| N1 | client never sends `engine` | open |
| N2 | 3D screen: no round timer / opponents | open (`game.js`, not this lane) |
| N3 | polling stops in a hidden tab | open (harmless) |
| N4 | explicit revoke on room tables | **done** |
| N5–N7 | Realtime, run_all, `rooms` gating v2 UI | open, as before |

**New findings (for other lanes):**
- **F1.** `production_baseline.sql` has no `rr_sync_progress2`, `rr_weekly` or `rr_admin_*`, but the lobby calls them (404 on the local stack), and its older RPCs answer differently from the fake. Either the snapshot is incomplete or production differs: re-snapshot before the next migration review.
- **F2.** The baseline's `game.auth` raises `unauthorized` with errcode 28000, which PostgREST serves as HTTP **403**, not 400. Clients must keep reading `.message` (they do).
- **F3.** The local stack starts `verify-result` too. On the baseline, the contract's honest-game case is rejected (`replay_mismatch … inspect:2`). This is most likely a test artifact: the baseline `rr_create_challenge2` returns no `starts_at`, so the contract builds the game in another rules era. It is for the verify owner to confirm.

## 6. Release steps (in order)

**0. Preconditions.**
- Release commit `C` is tagged, with a clean tree.
- `node tools/build-edge.mjs --check` passes on `C`.
- The §4 offline suites pass on `C`.
- Pick a quiet hour (S1 closes the rooms a pin change interrupts).

**1. Local staging run from `C` (no approval needed, free, nothing hosted).**
- `git archive C` to `/tmp/rel`, then from there: `tools/staging/setup.sh --reset` → `RR_STAGING_FAKETIME=1 tools/staging/start.sh` → `tools/staging/run_live.sh` (all `ok`), then `rooms_e2e.py … --local`.
- Check `log/edge-room.log`: the cold engine load must stay ≤ ~1.7 s CPU.
- *Optional, owner approval:* a hosted staging project, for CPU and region certainty (§3.3).

**2. Production pre-check (SQL editor, read-only).**
```sql
select to_regclass('game.rooms') is null as fresh;                                  -- must be true
select extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';    -- must be extensions
```

**3. Apply the migration (owner approval).** Paste `supabase/migrations/20261124_rooms.sql`, or run `psql "$DB_URL" -f …`. It is one transaction. Then:
```sql
notify pgrst, 'reload schema';
select proname, has_function_privilege('anon', oid, 'execute') from pg_proc where proname like 'rr_room_%' or proname = 'rr_my_rooms';   -- 10 rows, all true
select proname, has_function_privilege('anon', oid, 'execute') from pg_proc where proname in ('room_sweep', 'room_purge');               -- 2 rows, false
select relname, relrowsecurity from pg_class where relnamespace = 'game'::regnamespace and relname like 'room%';                          -- all true
```

**3b. Moderation + chat (a SEPARATE release, owner approval; after rooms are live and stable).**
- Pre-check:
```sql
select to_regclass('game.rooms') is not null as rooms_live, to_regclass('game.bans') is null as fresh;   -- both true
select count(*) from game.admins;                                                                       -- 1 (the owner)
```
- Apply: paste `supabase/migrations/20261126_admin_mod_chat.sql` (one transaction). Then run:
```sql
notify pgrst, 'reload schema';
select proname, has_function_privilege('anon', oid, 'execute') from pg_proc where proname like 'rr_admin_%' or proname like 'rr_room_chat_%' or proname = 'rr_ban_status';   -- 20 rows (4 live rr_admin_* + 16 new), all true
select tgname from pg_trigger where tgname in ('room_seats_ban_guard','group_members_ban_guard','admins_mod_log','energy_gifts_mod_log','mod_log_no_change','mod_log_no_truncate');   -- 6 rows
```
- The client (`js/net.js`, `js/rooms.js`, `js/roomchat.js`, `js/admin.js`) ships with the site. Without the migration, the chat cannot send ("משהו השתבש בשרת"), its list stays empty, and the new admin tabs show the error (the old ⚡ tools keep working). So apply the migration **before** deploying a site that has the chat, in the same window.
- Smoke (owner): open a room with a second device, chat, send a phone number (it must be refused), report a message, then in the profile panel hide it, kick, and unban a test player.

**4. Deploy the function from `C` (owner approval).**
- `supabase functions deploy room --no-verify-jwt --project-ref <prod-ref>`.
- Env: none to set (only the injected `SUPABASE_DB_URL`).
- Check: `curl -s https://<prod-ref>.supabase.co/functions/v1/room -H "apikey: <publishable>"` → `{ok:true, engine:<pin of C>, core:1}`.

**5. Site + verify-result** from `C`, in the same window (`docs/VERIFY_INTEGRATION.md` §4).

**6. Canary (flag still OFF; owner approval for the smoke).**
- `RR_SMOKE_URL=https://<prod-ref>.supabase.co RR_SMOKE_ANON=<publishable> RR_SMOKE_CONFIRM=production node tests/online_smoke.mjs --live`. It creates 2 `טסט-חדר-*` players and 1 cancelled room; `RR_SMOKE_P1/P2` reuse test players.
- The owner and friends play through `<site>/?ff=rooms`. Invite links now carry `&ff=rooms` by themselves.

**7. Flag flip (owner approval).** `js/flags.js` `rooms: true`, commit, deploy the site. UI only: the pin is unchanged. Invite links stop adding `&ff=rooms` automatically.

**8. Watch (first days).**
- Function logs: one JSON line per request; alert on 500 `server_error`, 503 `engine_unavailable`, or any CPU-limit / WORKER_LIMIT error (cold start, §3.3).
- SQL:
```sql
select status, end_reason, count(*) from game.rooms group by 1, 2;
select count(*) from game.rooms where status = 'playing' and last_activity < now() - interval '2 hours';   -- idle, waiting for a tick (outside the cap)
```

**9. Every later pin-changing release.** No manual cleanup: S1 closes interrupted rooms within ~2 minutes of their next call. **Retention** (owner policy, e.g. monthly): `select game.room_purge(30);`.

### Rollback (least to most drastic)

| level | action | effect |
|---|---|---|
| R1 UI | `js/flags.js` `rooms: false` → deploy the site | entry points disappear (`rr2-flags` / `?ff=rooms` still show them) |
| R2 stop new rooms (instant) | `revoke execute on function public.rr_room_create(uuid,text,jsonb,uuid), public.rr_room_join(uuid,text,text) from anon, authenticated;` | running rooms finish; undo with `grant` |
| R3 stop play | `supabase functions delete room` (or deploy a stub answering 503) | rooms freeze; RPCs still answer (leave / cancel work) |
| R3b roll the function back | redeploy the previous `room` (+ site + verify-result) | rooms started by the new pin get 409 for 2 min, then close (S1). Roll back inside 2 minutes to keep them |
| R4 remove everything | export if needed, then run the ROLLBACK block at the bottom of `rooms.sql` (now also drops `room_sweep` / `room_purge`) | all room data dropped; catalog = baseline (proved by `online_migration.test.mjs`) |
| R5a stop chat only (instant) | `revoke execute on function public.rr_room_chat_send(uuid,text,uuid,text) from anon, authenticated;` | the panel shows the server's refusal; reading / reports / admin tools keep working; undo with `grant` |
| R5b lift every ban (instant) | `delete from game.bans;` (logged nowhere: do it only on purpose) | everybody is back on boards / rooms / chat |
| R5 remove moderation + chat | export if needed, then run the ROLLBACK block at the bottom of `20261126_admin_mod_chat.sql` **before** R4 | bans, mod log and chat dropped; `game.board` + `game.room_purge` restored byte for byte; triggers gone (proved by `admin_chat_sql.test.mjs`) |

## 7. Needs the owner's explicit approval

1. Applying `20261124_rooms.sql` to production (step 3).
2. Deploying `room` with `--no-verify-jwt`, in lockstep with the site and verify-result (steps 4–5).
3. Running `online_smoke.mjs --live` against production (step 6).
4. Flipping `rooms` to default ON (step 7).
5. The retention policy: when to run `game.room_purge(N)` (step 9).
6. Optional: a hosted staging project (step 1).
7. Applying `20261126_admin_mod_chat.sql` to production (step 3b). It adds triggers on 4 live tables (`room_seats`, `group_members`, `admins`, `energy_gifts`) and **replaces the live `game.board`** with the same body + a "no active ban" filter (same JSON for everyone not banned, proved against the original body).
8. The chat content policy: the word list (`game.chat_lists`), blocking social-app names, phone numbers = 0… with 9+ digits, 972… with 11+, or + and 8+ digits (plain amounts like `1500000` or `3000000000` pass), 120 chars, 5 / 10 s + 60 / h.
9. Data retention: chat and reported messages are deleted after 7 days (also before the owner looked at a report); refused messages keep no text; the mod log is kept forever (append-only).
10. Known gap to decide before the competitions release: `game.board2` (competitions draft) does not filter banned players yet — add the same `not exists (active ban)` filter there when competitions ship.

Groups v2, competitions and worlds drafts are **not** part of this release. On the local stack they apply and their contract cases pass, but they have their own approvals (`ONLINE.md` §12, `20261125_worlds.sql`).
