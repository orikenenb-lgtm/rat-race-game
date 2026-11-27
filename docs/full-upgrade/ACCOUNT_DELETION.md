# ACCOUNT_DELETION — מחיקת חשבון (Google Play)

## סיכום בעברית (לבעל המשחק)

Google Play דורש שני דברים: (1) אפשר למחוק את החשבון **מתוך המשחק**, (2) יש **קישור באינטרנט** שבו אפשר לבקש מחיקה גם בלי האפליקציה. שניהם מוכנים. שום דבר עוד לא הופעל בייצור.

- **במשחק:** פרופיל (לוחצים על הכינוי במסך הראשי) ← גוללים לסוף ← „מחיקת החשבון” ← מקלידים את הכינוי ← „המשך” ← „כן, למחוק לצמיתות”.
  - יש תיבה „למחוק גם את ההתקדמות במכשיר הזה” (מסומנת מראש).
  - בלי אינטרנט מופיעה הודעה ברורה, ושום דבר לא נמחק.
- **הקישור ל־Google:** https://orikenenb-lgtm.github.io/rat-race-game/delete-account.html
  - אם שיחקו בדפדפן הזה, אפשר למחוק ישר מהעמוד.
  - עם קוד שחזור אפשר למחוק מכל דפדפן.
  - בכל מקרה אפשר לשלוח מייל. מבטיחים לטפל בבקשה תוך 30 יום.
  - כינויים גלויים לכולם, ולכן במייל מוחקים רק אחרי הוכחה שהחשבון של השולח. עונים לו עם מילה חד־פעמית, והוא משנה את הכינוי במשחק למילה הזו.
- **הקבוצות:** קבוצה שהשחקן מנהל עוברת לחבר הוותיק ביותר. קבוצה שהוא החבר היחיד בה נמחקת.
- **מה צריך ממך, לפי הסדר:**
  1. לאשר את הפעלת המיגרציה בשרת.
  2. למזג את האתר.
  3. למלא שתי תשובות ב־Play Console (§2 למטה).
- **בקשה במייל:** קודם אימות במילה חד־פעמית, אחר כך שאילתה אחת (§4).

## 1. What was built

| piece | file |
|---|---|
| RPC + internal function + audit table (one transaction, additive) | `supabase/migrations/20261127_delete_account.sql` |
| in-app flow (profile card, 2-step confirmation, local cleanup) | `js/account.js`, `js/lobby.js` (profile), `js/net.js` (`net.deleteAccount`), `css/lobby.css` |
| public page (Hebrew RTL + English, no analytics) | `delete-account.html`, `js/delete-page.js` |
| privacy policy: deletion section links the page (he + en), mentions in-app deletion | `privacy.html` |
| tests | `tests/account_delete_sql.test.mjs` (PGlite), `tests/account_local.test.mjs`, `tests/account_delete_e2e.py`, `tests/fakebackend.py` (+ `fakebackend_test.py`) |

Client behaviour worth knowing:
- **Nickname changed on another device:** opening the box asks the server for the current nickname (`net.refreshNickname`). A server `confirm_mismatch` does the same, then returns to step 1 with the new name.
- **Server answers `unauthorized`:** the account was already deleted elsewhere. This device forgets the identity too, so no dead account is left behind.
- **HTTP 404 PGRST202** (site released before the migration): the message is "המחיקה עוד לא זמינה…" with the e-mail address.
- **Other open tabs of the game:** they reload as soon as `rr-player` disappears, so they cannot save the old progress back.
- **The admin:** sees a short note instead of the card. The server refuses an admin anyway.

### RPC contract

`public.rr_delete_account(p_id uuid, p_secret text, p_confirm text) returns json`. SECURITY DEFINER, `search_path = ''`, VOLATILE. EXECUTE is granted to anon + authenticated only (service_role also has it through Supabase's default privileges, like every `rr_*`). PUBLIC has no EXECUTE.

| step | failure |
|---|---|
| `game.auth(p_id, p_secret)` | `unauthorized` (SQLSTATE 28000 → HTTP 403 through PostgREST). This includes an account that is already deleted, so a second call is idempotent. |
| lock the `game.players` row `FOR UPDATE` (per-player lock) | A parallel call waits, then answers `unauthorized`. Verified on real PostgreSQL 17: the second call waited 2.4 s. |
| admin? | `admin_cannot_delete` |
| `btrim(p_confirm) = ` the current nickname | `confirm_mismatch` (HTTP 400, P0001) |
| `game.delete_player(p_id, 'app')` | — |

Success returns exactly `{"deleted": true, "groups_transferred": n, "groups_deleted": m}`.

`game.delete_player(p_id uuid, p_via 'app'|'manual')` does the work. No API role can execute it; the owner uses it for e-mail requests.

## 2. Play Console answers

- **Delete account URL** (App content → Data deletion): `https://orikenenb-lgtm.github.io/rat-race-game/delete-account.html`
- **Data safety → "Do you provide a way for users to request that their data is deleted?"** Yes. Users can delete in the app and on the web page; e-mail requests are handled within 30 days.
- **"Is all of the user data collected by your app encrypted in transit?"** Yes (HTTPS only).
- **Account creation:** the app creates an account (nickname + random id, no e-mail or password). In-app deletion is available: Profile → מחיקת החשבון.
- **Data types.** The owner confirms the full form. All of these are deleted on request:
  - Personal info → **Name**: the nickname. It is chosen by the player and need not be a real name, but it is shown to other players, so declare it.
  - Personal info → **User IDs**: the random player id.
  - App activity → *In-app actions* and *Other user-generated content*: results, progress, group memberships and names, feed events.
- **Backup retention: OPEN.** Check the Supabase plan's backup retention before quoting a number anywhere.

### What is deleted

All of it is deleted at once, on the server.

- **The player row:** nickname, secret hash, stars, achievements, game piece, streak, meta.
- **Every result:** daily, weekly and challenge results, including checkpoints and verify data.
- **Group memberships.**
- **Feed events.**
- **Energy gifts to him, and claimed gifts from him.**
- **Drafts, when they are applied:**
  - room seats, actions, chat messages, reports and refused-chat rows;
  - ban row;
  - group bans and join throttles.
- **Groups he owns:**
  - Ownership passes to the oldest remaining member. With groups v2 applied, it passes to the oldest admin first, then the oldest member, which is v2's own rule. Roles and `group_log` stay consistent.
  - A group where he is the only member is deleted together with its challenges.
- **Rooms (draft):**
  - Lobby: his seat is freed. If he is the host, hosting passes to the next seat. An empty lobby is cancelled.
  - Playing: he forfeits, hosting passes to the next seat and `needs_tick` is set. The others keep playing.
  - Finished room he hosted: hosting passes to the next seat, so the others keep their history.
  - His nickname copy in `rooms.results` becomes `שחקן לשעבר`.
- **On the device:**
  - Always: `rr-player`, `rr2-pending-finish`, `rr2-seen-chal`, `rr2-room-last`, `rr2-room-pending`, every ranked slot `rr2-save-<result id | daily|weekly|challenge-…>` plus its `rr2-bak:` / `rr2-quarantine:` copies, `rr2-quarantine:rr-player`, and the session `rr2-resume-once`.
  - With the box checked, also: `rr2-progress`, `rr2-energy`, `rr2-library`, `rr2-quiz-credit`, `rr2-coach`, `rr2-onboarded`, `rr2-reveal`, `rr2-ghosts`, `rr2-branches`, `rr2-last-game`, `rr2-sum-offered`, `rr2-ref`, and every free / learn / history / branch slot with its backups and quarantines.
  - Never touched: `rr2-settings`, `rr2-flags`, `rr2-fallback`, `rr2-chat-mute`. These are preferences, not progress.

### What is retained, and why

| retained | why |
|---|---|
| Names of groups and titles of challenges he created inside groups that continue (`challenges.created_by` → null). | They are shared content that the other members' results hang on. Nothing links them to him any more. |
| Every ⚡ gift or referral bonus he sent (`from_id` → null; the receiver sees "חבר"), claimed or not. | Pending ones belong to the receiver. Every row also keeps counting toward `rr_register2`'s referral cap (5 a day per referrer), so "register with ?ref, delete, repeat" cannot farm ⚡ past the cap (tested). |
| `players.referred_by` of the friends he invited is set to null. | That is the other players' row; only the link goes. |
| `game.account_deletions`: date, `app`/`manual`, and counts of groups transferred, groups deleted and rooms handed over. | Proof that requests are executed. It holds no id and no nickname. |
| Moderation draft only: `game.mod_log` rows about him keep the random player id. | Append-only admin record by design. The nickname is not stored there, and the id matches no account any more. |
| Free text written by the admin: ban reasons (`mod_log.data.reason`) and the groups v2 `group_log` removal reason. | This text is never scrubbed. **Admins must not write nicknames or other personal details there.** |
| Hosting providers' technical logs (IP) and automatic backups. | These are the providers' normal operation. **Open: the owner must check the Supabase plan's backup retention** before quoting a number. |

**Edge case (documented, tested):** results that **former** members left on the challenges of a group that gets deleted are deleted with it, because the group's only remaining member was him. This is the same as the live `rr_leave_group` when the last member leaves. Those former members already could not see the group.

## 3. Production release (owner approval needed for each step)

The migration goes first, then the site. If the site ships first, the button gets HTTP 404 and shows "משהו השתבש בשרת". Nothing is deleted locally in that case, so it is safe but useless.

1. **Pre-check** (read-only, MCP `execute_sql`): run the PRE-CHECK queries from the header of the migration file. Both "absent" flags must be true, and the foreign key list must equal the live list in the header.
2. **Apply** (MCP `apply_migration`, name `20261127_delete_account`, the file's content). It is one transaction: it either applies whole or not at all.
3. **Post-check** (read-only): run the POST-CHECK queries from the header.
   - ACLs: `rr_delete_account` = postgres + anon + authenticated (+ service_role); `delete_player` = postgres only.
   - `select public.rr_delete_account('00000000-0000-0000-0000-000000000000','x','x')` → `unauthorized`.
4. **Merge the site PR** (`work/account-delete`). GitHub Pages deploys it.
5. **Check the live site:**
   - Open `/delete-account.html` and `/privacy.html`; both deletion links resolve.
   - In the game, register a throw-away nickname `טסט־מחיקה`, delete it from the profile, and confirm that `select count(*) from game.account_deletions` grew by one.
6. **Play Console:** fill in the URL and the answers from §2.

**Rollback:**
- The ROLLBACK block at the bottom of the migration drops the two functions and the audit table. Accounts that were already deleted are **not** restored.
- Reverting the site commit removes the card and the page. Google requires them, so do this only together with pulling the store listing.

**Later drafts** (rooms, groups v2, competitions, moderation) need nothing extra, in either order. `tests/account_delete_sql.test.mjs` runs both orders.

A future migration that adds a foreign key to `game.players` must decide between two options:
- CASCADE, for his personal data;
- SET NULL, for shared content.

If it copies a nickname into text or json, it must also extend `game.delete_player`. The test's catalog guard fails on any foreign key it does not know.

## 4. E-mail requests: manual procedure (MCP `execute_sql`, owner)

Nicknames are public, so a nickname alone proves nothing. Delete only after the sender proves control of the account. Reply within 30 days.

1. **Reply with a one-time word.** Example reply: "כדי לוודא שהחשבון שלך, שנה בפרופיל את הכינוי ל־`מחק־4821` (פרופיל ← שינוי כינוי) ותענה למייל הזה. אפשר גם פשוט למחוק מתוך המשחק."
   - Make the word unique each time: a short word plus 4 random digits, within 20 characters.
   - Never ask for the recovery code; it is a secret.
2. **When they answer, find the account by the one-time word** (read-only). Exactly one row means proof of control. Zero rows means: wait, or ask again.

```sql
select p.id, p.nickname, p.created_at, p.total_stars, game.is_admin(p.id) as admin,
       (select string_agg(g.name, ', ' order by g.name) from game.group_members m join game.groups g on g.id = m.group_id where m.player_id = p.id) as groups
  from game.players p where p.nickname = btrim('<the one-time word>');
```

3. **Delete exactly that id.** This is the same logic as the in-app button: groups are handed over or deleted, and everything of his is removed.

```sql
begin;
select game.delete_player('<id from step 2>'::uuid, 'manual');   -- → {"deleted":true,"groups_transferred":n,"groups_deleted":m}
select count(*) from game.players where id = '<id>';              -- → 0
commit;                                                            -- or: rollback;  (nothing changes)
```

4. **Answer the e-mail:** "החשבון נמחק" / "Your account has been deleted". Keep no copy of the nickname or the word in your notes.

**Lost access** (no device, no recovery code, so they cannot rename): this is a judgement call.
- Ask for what only the owner would know, such as the names of their groups or roughly when they joined.
- Compare it with the read-only query by the old nickname: the query from step 2 with `p.nickname = '<old nickname>'`, plus `p.created_at`.
- Delete only when it matches clearly. When in doubt, decline politely and explain why: deleting someone else's account cannot be undone.

**Errors:**
- `admin_cannot_delete`: that is the owner's own account. Remove the `game.admins` row on purpose first.
- `unauthorized`: the id does not exist (already deleted).

## 5. Verification (2026-11-27, worktree `work/account-delete`, after the review fixes)

- `tests/account_delete_sql.test.mjs` (PGlite): **72/72**.
  - Live stack; additive check (23 objects added, 0 changed); grants; anon role; atomic; ROLLBACK.
  - The contract on four stacks: live / drafts before / drafts after / rooms + moderation, including the referral cap after delete-and-repeat.
  - groups v2 admin preference in both orders; rooms + moderation in four orders; foreign-key catalog guard.
- Real PostgreSQL 17 + PostgREST 13 (local `tools/staging`, migration applied before the drafts; this was the first version of the migration):
  - grants: service_role through default privileges;
  - the HTTP error bodies;
  - the lock: a parallel call waits, then `unauthorized`;
  - `game.delete_player` is not reachable through REST (PGRST202).
- `tests/account_local.test.mjs` **7/7**; `tests/fakebackend_test.py --no-browser` **20/20**; `backend_contract.mjs` (fake) **185/185**.
- `tests/account_delete_e2e.py` **81/81**:
  - desk 1300 and phone 390 (with a second open tab), plus a 360 layout pass;
  - nickname renamed on another device;
  - account already deleted elsewhere;
  - RPC missing (404);
  - admin note;
  - the page with and without an identity, plus the verification text;
  - privacy links.
- Regressions:
  - progress 57, saves 105, flags 16, groups 126, ckpt_roundtrip 242, admin_unlock 19: all pass.
  - `build-edge --check`: green.
  - `guard_lint`: 0 violations.
  - `lobby_e2e`: **46/46**.
  - `p0b_unrecorded_win`: **21/21**.
- `tests/run_all.sh` rows: `account_local` (tier 0), `account_delete_sql` (tier 1), `account_delete_e2e` (tier 2).
- Screenshots: `docs/full-upgrade/shots/account-delete/`.
