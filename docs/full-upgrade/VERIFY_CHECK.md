# VERIFY_CHECK — האם verify-result החדש מקבל משחק כן של שחקן אמיתי מול פונקציות ה-DB החיות?

תאריך: 2026-11-25 · נתיב: מנוע (engine lane) · קומיט הבדיקה: ראה `git log -- docs/full-upgrade/VERIFY_CHECK.md`

## בעברית — השורה התחתונה

**כן. אין באג אמיתי.** הדחייה שנמצאה בהרצת ה-staging המקומי (`replay_mismatch … inspect:2`) הייתה **באג בבדיקה**, לא במנוע ולא ב-verify-result:

- הבדיקה `tests/backend_contract.mjs` קבעה את גרסת החוקים של משחק האתגר לפי `starts_at` שחוזר מ-`rr_create_challenge2`. הפונקציה החיה **לא מחזירה** `starts_at` (רק `{id}`), אז הבדיקה קיבלה "אין תאריך" ⇒ חוקים 7 (המשחק החדש, עם בדיקת נאותות `inspect`).
- השרת קבע בצדק את היום לפי `created_at` של האתגר בשעון ישראל (היום, 2026-11-25) ⇒ לפני `RULES4_FROM` ⇒ חוקים 3 (v3 המדויק, שאין בו `inspect`). המשחק שוחזר בחוקים אחרים ונדחה.
- **הלקוח האמיתי לא עושה את זה:** `js/lobby.js rankedDateKey` לוקח את היום מ-`starts_at` של האתגר ברשימת הקבוצה (`rr_group` החי כן מחזיר אותו, ושווה ל-`created_at`), ואם אין — את התאריך של היום בישראל. כך הלקוח והשרת תמיד מגיעים לאותו יום ולאותם חוקים.

**ההוכחה (staging מקומי, PostgreSQL 17 + PgBouncer + PostgREST + Deno, עם `production_baseline.sql` + `20261123_admin.sql` + `production_supplement.sql` = ה-API החי):**
בדיקה חדשה `tests/verify_staging.mjs` משחקת משחקים מדורגים בדיוק כמו הלקוח הנוכחי, בשלושה "עידנים" של שעון ה-DB ובמעבר עצמו — **94/94 עברו**:
- יומי / שבועי / אתגר כנים — **מתקבלים** (verified:true) ב-2026-11-25 (חוקים 3), ביום המעבר 2026-12-07 (חוקים 4), ב-2026-12-15 (חוקים 4) וב-2026-12-23 (חוקים 7); כולל 7 משחקים **שנוצחו** עם כוכבים (הכוכבים נבדקים).
- אתגר שנוצר ערב לפני המעבר ושוחק ביום המעבר — מתקבל (חוקים 3, כמו שהלקוח בונה).
- מזויפים — **נדחים**: תוצאה מזויפת עם לוג אמיתי ⇒ `claim_mismatch`; לוג קטוע ⇒ `replay`; לוג שנבנה בחוקים של יום אחר ⇒ נדחה (חוץ משבוע המעבר, שבו לוג שהוא משחק חוקי בחוקים הבאים מתקבל — זה התכנון, ועכשיו גם נבדק מול ה-verify_core המקומי); תוצאה של מישהו אחר ⇒ 404.
- `backend_contract.mjs --live --local` אחרי תיקון הבדיקה: כל 11 בדיקות ה-verify עוברות (כולל "honest result → verified:true"). 16 הכשלים שנותרו הם הבדלי צורה בין ה-fake לבין ה-baseline החי (`rr_finish` מחזיר `{ok:true}` ולא `null`, `rr_create_challenge2` לא בודק `p_char`, ועוד) — לא קשורים ל-verify, שייכים לנתיב ה-rooms/contract.

**מה הבעלים חייב לקבוע בשחרור:** את התאריכים האמיתיים `RULES4_FROM` / `RULES5_FROM` / `RULES6_FROM` / `RULES7_FROM` — ב**שני** הקבצים (`js/systems/rules.js` ו-`supabase/functions/verify-result/verify_core.js`, בדיקה מוודאת שווים), כל אחד **יום שני**, ו**לא לפני יום השחרור** (האתר + verify-result מאותו קומיט). אחרי שינוי: `node tools/build-edge.mjs` (pin חדש) ופריסה של האתר ו-verify-result יחד. פירוט בהמשך.

## Technical

### 1. Reproduction

Local staging (tools/staging, run, not edited) on a `git archive HEAD` export: `RR_STAGING_DIR=/tmp/rr-stg-eng RR_STAGING_PORT=55321 RR_STAGING_MIGRATIONS=20261123_admin.sql tools/staging/setup.sh --reset`, then `psql -f supabase/schema/production_supplement.sql` as `postgres`, then `RR_STAGING_FAKETIME=1 tools/staging/start.sh`.

`node tests/backend_contract.mjs --live --local` (before the fix):

```
FAIL honest result → 200 verified:true (server replay)
  {"verified":false,"error":"replay","detail":"replay:replay_mismatch at 23 ([\"c\",\"inspect:1\"]): unknown option inspect:1 for deal"}
FAIL forged claim + real log → verified:false claim_mismatch   (… inspect:2 …)
```

### 2. Root cause (test artifact)

`tests/backend_contract.mjs` built the challenge game with `rules: VC.rulesFor({ challenge_day: String(CH.starts_at || '').slice(0, 10) })`.

- The live `rr_create_challenge2` returns `{id}` only. So `challenge_day = ''`, which means no day and rules 7. (The `.slice(0, 10)` of a UTC timestamp would also have been the UTC day, not the Israel day.)
- `verify-result` (index.ts `ROW`) dates the row by `to_char(c.created_at at time zone 'Asia/Jerusalem', 'YYYY-MM-DD')`. That is 2026-11-25, before `RULES4_FROM`, so it uses rules 3. Rules 3 has no due diligence, so the first `inspect:*` action is an impossible option and the replay is rejected. The rules-4 retry is not allowed, because 2026-11-25 is not in the `RULES4_FROM` cut-over week.

The client does not have this problem. `js/lobby.js rankedDateKey` (challenge) uses `rr_begin.date_key` (not sent live), then the group listing's `starts_at` (`rr_group` live returns it; `game.challenges.starts_at` and `created_at` both default to the same `now()` of the insert), then today's Israel date. Daily mode uses today's Israel date, and the live `daily_key` is `D<Israel date>`, which `isoDay` reads. Weekly mode uses the `rr_weekly` key `IYYY-Www`, and the server's `to_date(key, 'IYYY-"W"IW')` gives the same Monday. `js/game.js startGame` passes that `dateKey` to `E.createGame`, which uses `rulesForDay`. `verify_core.rulesFor` is the same function (tested equal).

**Fix (test fixture only, no engine or verify change):** `tests/backend_contract.mjs` now derives the challenge day the way the client does: `date_key`, else the Israel date of `rr_group`'s `starts_at`, else today in Israel.

### 3. Proof: `tests/verify_staging.mjs` (new)

It plays ranked games through the live RPCs exactly as the current client builds them:

- `rr_daily` / `rr_weekly` / `rr_group`, then `rr_begin`
- then the client cfg: `dailyChar(char_index)` or the challenge char, the `rr_begin` seed, `max_months`, and the `rankedDateKey` replica on the client clock (real time + the DB clock offset)
- then `E.createGame` / play, then `rr_finish` with the `net.finish` normalisation, then `verify-result`

It moves the DB clock with the libfaketime offset file and resets it afterwards. It refuses any target that is not 127.0.0.1. The oracle for the other-rules log is the local `verify_core.verifyGame` on the same row, and the server must answer the same.

| era (Israel day of the DB clock) | rules | daily | weekly | challenge | won games |
|---|---|---|---|---|---|
| 2026-11-25 (today) | 3 | ✔ | ✔ | ✔ | 1 |
| 2026-12-07 (RULES4_FROM): challenge created 2026-12-06 21:00 IL | 3 (as created) | | | ✔ | 1 |
| 2026-12-07 | 4 | ✔ | | | |
| 2026-12-15 | 4 | ✔ | ✔ | ✔ | 2 |
| 2026-12-23 (after RULES7_FROM) | 7 | ✔ | ✔ | ✔ | 3 |

The table has 11 ranked rows. Each row holds:

- a random honest game: verified, and the server's months and net worth equal the claim
- a skilled honest game (`tools/sim.mjs` policy `smart`, the client cfg): verified, stars compared, 7 of them won
- forged claim + real log: `claim_mismatch`
- forged + truncated log: `replay`
- a log built under the other rule set: rejected, or in the cut-over week accepted as a legal next-rules game, exactly as the local `verify_core` decides
- someone else's result: 404

**Result: 94 passed, 0 failed.** The slowest replay took 330 ms; the first cold one took 1.7 s, which includes the engine load. On the same stack the `backend_contract` verify block passes 11 of 11 after the fixture fix, and the offline fake suite still passes 185 of 185.

Free (and learning, practice, history) games are not ranked. They never reach `rr_finish`: there is no `result_id`, and a row without a daily, weekly or challenge key gets mode `unknown`, which answers `unsupported_mode`. They are not verified, by design. w5+ are not ranked either: meta `ranked:false`, and the live `rr_create_challenge2` and `game.day()` / `game.week()` only give w1–w4.

### 4. Remaining edge cases (minor, client side, UI lane)

- **Daily at midnight on a cut-over day with a skewed client clock.** `rankedDateKey` compares `cache.daily.key === today`. The live key is `D2026-…`, so the comparison never holds and the client always uses its own Israel date. A client clock that is behind, starting the daily within seconds after midnight of `RULES*_FROM`, would build the older rules. The server would use the newer ones, and the fallback never goes backwards, so the game is rejected. Suggested fix (js/lobby.js): re-fetch `rr_daily` in `playRanked` just before `rr_begin` and return `E.rulesDayOf(cache.daily.key)`, which is the server's own day. On any other day the change has no effect.
- **Weekly with a stale `cache.weekly`.** If a lobby was left open across the Monday midnight of a cut-over, the client uses last week's key, so older rules. The server uses this week's, so newer rules. The game is rejected. Refreshing `rr_weekly` in `playRanked` before `rr_begin` closes it.
- The challenge date has no such gap: `starts_at` equals `created_at`, and the forward fallback covers a client one cut-over ahead in the cut-over week.

All three only matter in the minutes around a cut-over. A rejected result is flagged (`verified=false`, sorted last), never deleted.

### 5. What the owner must set at release

1. **`RULES4_FROM`, `RULES5_FROM`, `RULES6_FROM`, `RULES7_FROM`** in `js/systems/rules.js` **and** `supabase/functions/verify-result/verify_core.js`, with the same values in both (tests/verify.test.mjs checks they are equal). The placeholders now are 2026-12-07 / 2026-12-21 / = 5 / = 6.
   - Each must be an Israel date that is a **Monday**, so daily and weekly eras flip together.
   - None may come before the day the new site and verify-result are live. Ranked games before `RULES4_FROM` are played and replayed as exact v3 (rules 3) by the new client. That is safe, but the new ranked features only start at `RULES4_FROM`.
   - While 6 = 7 = 5, no ranked game is ever dated rules 5 or 6.
   - If ranked should use the full current game right away, set all four to the first Monday on or after the release.
2. After changing them, run `node tools/build-edge.mjs`. `rules.js` is in the engine core, so the pin changes. Then `node tools/build-edge.mjs --check`, `node tools/replay-corpus.mjs`, and `node tests/verify.test.mjs`. Deploy the **site and verify-result from the same commit** (ONLINE_RELEASE.md B3).
3. Re-run on staging before production: `tools/staging/setup.sh --reset` with `RR_STAGING_MIGRATIONS=20261123_admin.sql`, then the supplement, then `RR_STAGING_FAKETIME=1 tools/staging/start.sh`, then `. <dir>/target.env && node tests/verify_staging.mjs`. It reads the four dates from verify_core.js, so the eras it tests follow them.
