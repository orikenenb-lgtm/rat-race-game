# ONLINE_RELEASE — האם "חדר חי" (2–4 שחקנים אונליין) מוכן לייצור

## סיכום בעברית

**שורה תחתונה: הקוד מוכן ל-staging. הוא עוד לא מוכן להדלקה בייצור.**
כל הבדיקות האופליין עוברות: 434 בדיקות ב-10 סוויטות, 0 נכשלו (כולל 76 בדיקות בדפדפן עם 2–5 שחקנים נפרדים, ושחקן שמשחק על מסך התלת-ממד).
אבל פונקציית השרת (Edge Function `room`) לא רצה אף פעם על Supabase אמיתי: לא Deno, לא postgres.js ולא PostgREST.
לכן הצעד הבא הוא staging, ולא הדלקת הדגל.

**3 חוסמים:**
1. אין staging. צריך להריץ פעם אחת את כל המסלול על פרויקט Supabase נפרד: מיגרציה, פריסת פונקציה, ושתי בדיקות שמוכנות כבר (`backend_contract --live`, `online_smoke --live`).
2. לפרוס את הפונקציה **רק** עם `--no-verify-jwt`. אין `supabase/config.toml` בריפו. בלי הדגל הזה כל קריאה לחדר תיכשל ב-401.
3. הפונקציה, האתר ו-verify-result חייבים לצאת מאותו קומיט, ו-`build-edge --check` צריך לעבור עליו. כרגע יש שינויי מנוע לא מקומטים (w18) בעבודה של סוכנים אחרים.

**המיגרציה בטוחה:** היא רק מוסיפה (5 טבלאות + 10 פונקציות, 0 שינויים באובייקטים קיימים, 0 שינויים בנתונים), אטומית, וה-ROLLBACK שבתוכה נבדק. בדקתי את כל זה בפועל ב-PGlite. היא לא אידמפוטנטית: הרצה שנייה נכשלת ולא משנה כלום.

**דברים שכדאי לתקן (לא חוסמים):**
- חדרים נטושים לא נסגרים לבד כי אין cron. הם נספרים במגבלת 3 החדרים הפתוחים.
- אחרי כל עדכון מנוע, חדרים שהיו באמצע משחק "נתקעים" (409). צריך שאילתת ניקוי בכל שחרור, והיא מופיעה למטה.
- קישור ההזמנה לא מעביר את `?ff=rooms`, כך שבתקופת ניסיון החבר לא יראה את החדר.
- ההודעה על `rate_limited` בחדרים שגויה ("יותר מדי עדכונים היום").
- במסך התלת-ממד אין טיימר לסבב.

**מה דורש את האישור שלך:** פרויקט staging, הרצת המיגרציה בייצור, פריסת הפונקציה, בדיקת smoke בייצור (יוצרת 2 שחקני טסט וחדר מבוטל אחד), הדלקת הדגל, ניקוי חדרים בכל שחרור, ומדיניות מחיקה של חדרים ישנים.

---

## 1. Verdict

| area | state |
|---|---|
| Room logic (`room_core.js`), redaction, fairness, idempotency, timeouts | **ready**: 22/22 heavy tests, server step === client engine byte-for-byte |
| SQL draft `20261124_rooms.sql` | **safe to apply**: additive, atomic, rollback verified (new `tests/online_migration.test.mjs`) |
| Client (`rooms.js`, `remote.js`, `net.js`, game.js hook) | **ready behind the flag**: 76/76 browser e2e incl. phone 390 px, dark mode, XSS nickname, 3D game screen |
| Edge Function `index.ts` in a real Supabase runtime | **unverified**: never executed (no Deno here, no staging). Logic is exercised through `room_store.js` on PGlite, but not postgres.js parameter binding, CPU budget, connections or PostgREST |
| Operations (cleanup, pin changes, monitoring) | **gaps**: lazy-only lifecycle, no sweeper, orphaned rooms after a pin change |

**Ready for staging now. Production flip only after staging steps 1–3 below pass.**

## 2. Real test results (this run, export of HEAD `db892c2`, private copies on ports 11600–11602, one suite at a time)

| suite | result | notes |
|---|---|---|
| `node tests/room_core.test.mjs` | **22 / 22** | 4 m 46 s; 5,982 intents, 15.7 ms/intent; metrics parity 3,333/3,333; event parity 2,927 equal / 0 differ / 1 documented dd-level-1 skip; 18 seats replay === stored; 4 ranked seats pass `verifyGame`; 36,941 cards safe-default fuzz |
| `node tests/room_net.test.mjs` | **56 / 56** | 5 identities over HTTP against the fake |
| `node tests/remote_driver.test.mjs` | **29 / 29** | RemoteDriver: resend same id, stale adopt, finish once |
| `node tests/fairness.test.mjs` | **3 / 3** | same dice/tiles/streams per round |
| `node tests/flags.test.mjs` | **16 / 16** | `rooms` default OFF |
| `RR_PGLITE=… node tests/sql_drafts.test.mjs` | **14 / 14** | all 3 drafts on the baseline; Edge write path via `room_store.js` (168 intents) |
| `node tests/backend_contract.mjs --target=<own fake :11690>` | **184 / 184** | incl. the rooms RPC + Edge status-code cases |
| `python3 tests/rooms_e2e.py http://localhost:11601/ --hook=http://localhost:11602/` | **76 / 76** | real lobby UI, 2–5 browser identities, roll on the 3D game screen, `assert_clean` (no request left the machine) |
| **NEW** `RR_PGLITE=… node tests/online_migration.test.mjs` | **9 / 9** + 4 GAP probes | additive / atomic / rollback / grants / volatility / order independence |
| **NEW** `node tests/online_smoke.mjs` (fake) | **25 / 25** (1 SKIP: health has no GET on the fake) | the release smoke script, run here on the fake only |
| `node tools/build-edge.mjs --check` | ✓ | pin `f0f3bace…` = HEAD engine (core 885,667 chars = 98.4 % of `MAX_BUNDLE`) |
| `python3 tests/guard_lint.py` | 1 violation | pre-existing in another file: `sql_drafts.test.mjs:7` says "npm i" in a comment. The new files are clean |

Total: **434 passed, 0 failed**. Not run because they are not available here: `deno check`, any live/staging run. No production or network service was contacted. `online_smoke --live` refuses the production ref unless `RR_SMOKE_CONFIRM=production` is set.

## 3. Migration review: `supabase/migrations/20261124_rooms.sql` vs `supabase/schema/production_baseline.sql`

Proved by `tests/online_migration.test.mjs` (PGlite = PostgreSQL in WASM, baseline + sample rows):

- **Additive.** It applies **alone** on the baseline; groups v2, competitions and worlds are not prerequisites. Before vs after catalog: 0 changed, 0 removed; 196 objects added (5 tables). Every pre-existing table, column, constraint, index, function definition/volatility/ACL, RLS flag and policy is identical. Existing rows are unchanged (md5 per table).
- **Names.** New objects are only `game.rooms`, `game.room_seats`, `game.room_actions`, `game.room_events`, `game.room_join_fails`, `game.ms`, 9 `game.room_*` helpers, 9 `public.rr_room_*` and `public.rr_my_rooms`. `game.ms` does not exist in the baseline, so there is no collision.
- **Security.** All new tables have RLS on, no policies and no table grants. The 10 public RPCs are EXECUTE for anon/authenticated. The 10 `game.*` helpers are not. Every public RPC starts with `game.auth`.
- **PostgREST.** Every RPC that writes is VOLATILE (`rr_room_state` and `rr_room_heartbeat` write `last_seen`). Only `rr_my_rooms` is STABLE, and it calls `game.auth`, which is STABLE and read-only in the baseline. That is safe under PostgREST's read-only transaction for STABLE functions.
- **Idempotency.** Not idempotent: `create table` without `if not exists`. A second apply fails with `relation "rooms" already exists` and changes nothing, because it is one `begin … commit`. The runbook therefore checks `to_regclass('game.rooms') is null` first.
- **Rollback.** The ROLLBACK block at the bottom (lines 456–465, commented) restores the baseline catalog exactly, with a live room present (FK drop order OK), and keeps existing data. Re-apply after rollback gives the identical catalog. Rollback deletes every room, so export first if any matter.
- **Dependencies.** `extensions.gen_random_bytes` (pgcrypto in `extensions`, already used by the baseline's `rr_register2`), `gen_random_uuid()`, `game.players`, `game.groups`, `game.group_members`, `game.challenges` (FK only).
- **Order.** Rooms first, then groups v2 → competitions still apply.
- **Not covered offline:** Supabase default privileges on schema `game`, if any exist live. The migration only revokes from PUBLIC. RLS deny-all makes table grants harmless, and `game` is not an exposed schema (`backend_contract` checks this on staging).

## 4. Gap list (ranked)

### Blockers

| # | gap | where | fix |
|---|---|---|---|
| B1 | **The Edge Function has never run in a real Supabase runtime.** Unverified: postgres.js `tx.unsafe` binding of arrays/bigint/json (`room_store.js:57-86`, e.g. `$2::smallint[]`); `SUPABASE_DB_URL` connection type and pool (`index.ts:39`, `max:3` per isolate); cold-start CPU (engine ≈ 1.9 s CPU measured locally against Supabase's 2 s CPU limit; the core grew to 98.4 % of `MAX_BUNDLE`); JSON import attribute (`index.ts:21`); PostgREST error mapping and `response.status` commit (`rooms.sql:206`) | `supabase/functions/room/index.ts`, `room_store.js` | staging run: release steps 1–3 below. CR-22: no staging exists yet |
| B2 | **`verify_jwt` must be false.** There is no `supabase/config.toml` in the repo. With the default `verify_jwt = true`, every call fails 401, because players send only the publishable `apikey` (`js/net.js:206`). | deploy command | always `supabase functions deploy room --no-verify-jwt` (or add `[functions.room] verify_jwt = false` to a `supabase/config.toml`) |
| B3 | **Pin coupling.** `room` imports the verify-result pin and bundle (`index.ts:19-21`) and refuses rooms started under another pin (`index.ts:87`, 409 `version_changed`). It must ship from the same commit as the site and verify-result. Right now the shared tree has uncommitted engine work (`js/worlds/w18.js`, `all.js`) that will move the pin. | release process | release from one tagged commit where `node tools/build-edge.mjs --check` passes; deploy room, verify-result and the site in one window |

### Should fix (before or soon after the flip)

| # | gap | where | fix |
|---|---|---|---|
| S1 | **G-PIN-ORPHAN.** After any deploy that changes the engine pin, every `playing` room answers 409 `version_changed` to start/act/tick. No deploy ever abandons it, so it ends only by a cancel vote or by every player leaving. It also counts toward the 3-open-rooms cap. | `index.ts:87-89` | release step 9 (cleanup SQL); later: let `tick` of a foreign-pin room end it as `abandoned` without the engine |
| S2 | **G-STALE-LOBBY / G-LAZY-EXPIRY / G-JOIN-EXPIRED.** Lifecycle is lazy-only: lobby expiry (2 h) and abandonment (2 h) run only inside an Edge `tick` that a client triggers. Idle lobbies stay `lobby`, stay joinable and count toward the cap. Reproduced by the probe in `online_migration.test.mjs`. | `rooms.sql:190-194`, `:223`, `:251` | count only `last_activity > now() - 2 h` lobbies in the cap (SQL change), and/or a pg_cron sweeper (owner approval); meanwhile run the step 9 SQL |
| S3 | **Canary invite links.** The share link is `origin + pathname + ?room=CODE` (`lobby.js:91`, `rooms.js:237`). It drops `?ff=rooms`, and `?room=` is ignored while the flag is off (`lobby.js:299`, `:2514`). During a canary, a recipient lands on the plain home screen. | `js/lobby.js` | `?ff` applies per page load only, so canary links must carry `&ff=rooms` (add it by hand), or the link builder could append the active `ff`; moot after the flip |
| S4 | **Wrong Hebrew for room `rate_limited`.** `net.js:31` says "יותר מדי עדכונים היום" for create (10/day), join (20 failed codes/hour) and reactions. `rooms.js:382` fixes it only for in-game acts. `version_changed` (`net.js:57`) does not say what to do. | `js/net.js`, `js/rooms.js` | e.g. "יותר מדי ניסיונות — נסה שוב בעוד כמה דקות"; for version_changed: "…אפשר לצאת מהחדר או להצביע על ביטול" |
| S5 | **Write amplification.** Every Edge save rewrites `state` + `view` of **every** seat (`room_store.js:57`; `state` capped at 400 KB). Every poll of `rr_room_state` / heartbeat takes `FOR UPDATE` on the room and writes `last_seen` (`rooms.sql:400`): about 1 write/s per 4-player room. | `room_store.js`, `rooms.sql` | write only changed seats; skip the `last_seen` update when < 10 s old. Watch DB IO on the free tier |
| S6 | **No retention.** Finished rooms keep full engine states (up to 4 × 400 KB) forever. | — | owner decision (e.g. delete finished > 30 days; cascade) |
| S7 | **Region / latency.** One act ≈ 10 SQL round trips inside one transaction (load 3 + save 1 + seats + actions + events). The function runs at the edge nearest the caller, not next to the DB. No `x-region` header is sent, and CORS allow-headers do not list it (`index.ts:30`). | `index.ts`, `net.js:206` | measure on staging (`online_smoke` prints latencies); if > 1 s, pin the region and add `x-region` to CORS |
| S8 | **Throttle is per isolate** (`index.ts:57`). Real protection is the DB limit of 120 intents/seat/min plus the SQL caps. | — | acceptable; watch logs |

### Nice to have

| # | gap | where |
|---|---|---|
| N1 | The client never sends `engine` in `act` (`remote.js:179`), so the 426 `version_mismatch` path cannot fire. A stale cached client renders server views with old read-only engine code. | `js/remote.js` |
| N2 | 3D game screen in a room: no round timer, no opponents panel (the "👥 יריבים" chip is empty), in-card 💡 hidden (`ROOMS_GAME_HOOK.md` known gaps). The room screen has all of it. | `js/game.js` |
| N3 | Polling stops while the tab is hidden (`remote.js:157`). On a phone, switching to WhatsApp to share the code marks you "מנותק" after 45 s. That is harmless in the lobby; during play the autopilot covers it. | `js/remote.js` |
| N4 | Explicit `revoke all on game.room* from anon, authenticated` (defence in depth if schema `game` ever gets default grants). | `rooms.sql` |
| N5 | No Realtime: polling only (3 s lobby/waiting, 8 s playing, heartbeat 15 s). Fine for 2–4 players. | — |
| N6 | Room suites are not in `tests/run_all.sh`. | `tests/run_all.sh` |
| N7 | The `rooms` flag also gates the groups v2 / competitions UI. Those UI paths activate only when the server returns `my_role` (v2 migration), so flipping `rooms` with only `rooms.sql` applied leaves group screens unchanged (`lobby.js:210`, `:1522`, `:1536`). | `js/lobby.js` |

**Checked and OK:**
- Flag gating reaches every entry point: `renderRooms` (`lobby.js:206`), the `?room=` deep link (`:299`, `:2514`), the "חדר חי" entry (`:1245`), and the game screen only through `playRoom → setDriver`.
- CORS answers OPTIONS 204 with allow `apikey, content-type`.
- PostgREST error shape: raised codes arrive as `{message}` and are mapped by `net.js:91`.
- 409 `stale` / duplicate `action_id` handling, both on the fake and in `online_smoke`.
- Two tabs (primary connection), reconnect with the same `action_id`, host leaves, cancel vote, finish exactly once.
- Mobile 390 px waiting, round and results screens (screenshots reviewed).
- Hebrew RTL layout, XSS nickname escaped.
- Rooms are limited to w1–w4 on both sides (`rooms.js:15`, `room_core.js:16`, `game.room_chars`).
- Room results never touch `game.results` or the boards.

## 5. Release steps (in order)

**0. Preconditions.**
- Release commit `C` is merged and tagged, with a clean tree.
- On `C`, `node tools/build-edge.mjs --check` passes.
- On `C`, the offline suites of §2 pass.
- Pick a quiet hour (S1).

**1. Staging (owner approval: a second Supabase project or a branch).**
- Load the baseline schema, then apply `20261124_rooms.sql`.
- Run `supabase functions deploy room --no-verify-jwt --project-ref <staging>` from `C`.
- Run:
  - `RR_LIVE=1 RR_DRAFTS=1 RR_SB_URL=https://<staging>.supabase.co RR_SB_ANON=<key> node tests/backend_contract.mjs --live`
  - `RR_SMOKE_URL=https://<staging>.supabase.co RR_SMOKE_ANON=<key> node tests/online_smoke.mjs --live`
- Check that the cold `Edge start` stays under 2 s CPU with no 503s.
- Play one real 2-phone game to the end.

**2. Production pre-check (SQL editor, read-only):**
```sql
select to_regclass('game.rooms') is null as fresh;                                  -- must be true
select extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';    -- must be extensions
```

**3. Apply the migration (owner approval).**
- Paste `supabase/migrations/20261124_rooms.sql` into the SQL editor, or run `psql "$DB_URL" -f supabase/migrations/20261124_rooms.sql`. It is one transaction.
- Then run `notify pgrst, 'reload schema';` and check:
```sql
select proname, has_function_privilege('anon', oid, 'execute') from pg_proc where proname like 'rr_room_%' or proname = 'rr_my_rooms';  -- 10 rows, all true
select relname, relrowsecurity from pg_class where relnamespace = 'game'::regnamespace and relname like 'room%';                   -- all true
```

**4. Deploy the function (owner approval), from commit `C`.**
- `supabase functions deploy room --no-verify-jwt --project-ref <prod-ref>`.
- The CLI bundles `room/*` plus `../verify-result/engine_pin.js`, `engine_loader.js` and `engine.bundle.json` (≈ 1 MB).
- **Env: none to set.** It uses only `SUPABASE_DB_URL`, which Supabase injects. No other secret is read.
- Check: `curl -s https://<prod-ref>.supabase.co/functions/v1/room -H "apikey: <publishable>"` returns `{ok:true, engine:<pin of C>, core:1}`.

**5. Site + verify-result.** Deploy the site from `C`. If the pin differs from the deployed verify-result, redeploy verify-result in the same window (`docs/VERIFY_INTEGRATION.md` §4).

**6. Canary (flag still OFF).**
- Run the production smoke with approval: `RR_SMOKE_URL=https://<prod-ref>.supabase.co RR_SMOKE_ANON=<publishable> RR_SMOKE_CONFIRM=production node tests/online_smoke.mjs --live`. It registers 2 `טסט-חדר-*` players and leaves 1 cancelled room. To reuse test players instead, set `RR_SMOKE_P1` / `RR_SMOKE_P2`.
- The owner and friends play through `<site>/?ff=rooms`. Invite links need `&ff=rooms` added by hand (S3).

**7. Flag flip (owner approval).**
- In `js/flags.js:7`, set `rooms: true`, commit, and deploy the site.
- This is a UI-only file, so the engine pin is unchanged and verify-result is not affected.

**8. Watch** (first days):
- Function logs: one JSON line per request with `status`/`error`; alert on 500 `server_error` and 503 `engine_unavailable`.
- SQL:
```sql
select status, end_reason, count(*) from game.rooms group by 1, 2;
select count(*) from game.rooms where status in ('lobby','playing') and last_activity < now() - interval '2 hours';
```

**9. Every later release that changes the pin, and daily until S2 is fixed (owner approval as a standing task):**
```sql
-- rooms orphaned by a new pin (they can never continue) and lobbies nobody ticked
update game.rooms set status = 'cancelled', end_reason = 'expired', finished_at = now(), deadline = null, version = version + 1
 where (status = 'playing' and engine_sha is distinct from '<NEW_PIN>')
    or (status = 'lobby' and last_activity < now() - interval '2 hours');
```

### Rollback (least to most drastic)

| level | action | effect |
|---|---|---|
| R1 UI | `js/flags.js` `rooms: false` → deploy site | entry points disappear; players with `rr2-flags {rooms:true}` in localStorage or `?ff=rooms` still see them |
| R2 stop new rooms (instant, server) | `revoke execute on function public.rr_room_create(uuid,text,jsonb,uuid), public.rr_room_join(uuid,text,text) from anon, authenticated;` | running rooms finish normally; undo with `grant` |
| R3 stop play | `supabase functions delete room` (or deploy a stub answering 503) | rooms freeze; RPCs still answer (leave/cancel work) |
| R4 remove everything | export if needed, then run the ROLLBACK block of `rooms.sql` (lines 457–465 uncommented) | all room data dropped; catalog = baseline (proved by `online_migration.test.mjs`) |

## 6. Needs the owner's explicit approval

1. Creating a staging Supabase project or branch (step 1).
2. Applying `20261124_rooms.sql` to production (step 3).
3. Deploying the Edge Function `room` with `verify_jwt = false` (step 4), in lockstep with the site and verify-result (step 5).
4. Running `online_smoke.mjs --live` against production (step 6): it creates 2 test players and 1 cancelled room.
5. Flipping `rooms` to default ON (step 7).
6. The cleanup SQL at each pin change, or a pg_cron sweeper (step 9 / S2).
7. A retention policy for finished rooms (S6).
8. Any later SQL fixes for S2 / S5, which change the draft before it is applied.

Groups v2, competitions and worlds drafts are **not** part of this release. They have their own approvals: `ONLINE.md` §12 and `20261125_worlds.sql`.
