// Supabase RPC client for מירוץ העכברים. All calls go to public.rr_* functions (security definer, checked by player id+secret).
// Identity lives in localStorage ('rr-player' = {id, secret, nickname}). No Supabase auth session is used.
const SB = 'https://xvqaxphyfqdzkddmoosu.supabase.co';
const SBK = 'sb_publishable_w3ubvawN4BnqOul66NSaLg_KM6yTJhc';
const KEY = 'rr-player';
const FN_VERIFY = `${SB}/functions/v1/verify-result`;
const FN_ROOM = `${SB}/functions/v1/room`;     // live rooms (NOT deployed; only called when the `rooms` flag is on)
import { metaOf } from './worlds/meta.js';
/** worlds wave 0: a world whose meta says ranked:false (w5 … until the DB migration) is free play / private rooms only. */
export const unrankedWorld = (id) => !!id && (metaOf(id) || {}).ranked === false;

const ERR = {
  unauthorized: 'החשבון שלך לא מזוהה בשרת.',
  group_not_found: 'לא מצאנו קבוצה עם הקוד הזה',
  group_full: 'הקבוצה מלאה (50 שחקנים)',
  not_member: 'אתה לא חבר בקבוצה הזו',
  too_many_groups: 'הגעת למקסימום של 20 קבוצות',
  bad_nickname: 'כינוי צריך להיות 2–20 תווים',
  bad_name: 'שם קבוצה צריך להיות 2–40 תווים',
  bad_title: 'שם אתגר צריך להיות 2–50 תווים',
  bad_world: 'המפה לא קיימת',
  bad_profession: 'דמות לא קיימת',
  bad_days: 'משך אתגר: 1–30 ימים',
  too_many_challenges: 'יש כבר 5 אתגרים פעילים בקבוצה',
  challenge_closed: 'האתגר הזה כבר נסגר',
  challenge_not_found: 'האתגר לא נמצא',
  already_finished: 'כבר סיימת את המשחק הזה',
  result_not_found: 'המשחק לא נמצא בשרת',
  already_sent_today: 'כבר שלחת לו זריקות היום',
  player_not_found: 'השחקן לא נמצא בקבוצה',
  rate_limited: 'יותר מדי עדכונים היום',
  no_actions: 'אין יומן מהלכים למשחק הזה',
  not_finished: 'המשחק עוד לא נשלח לשרת',
  engine_unavailable: 'השרת מתעדכן — ננסה שוב בעוד רגע',
  stale_checkpoint: 'יש שמירה חדשה יותר בשרת',
  diverged_checkpoint: 'המשחק הזה המשיך במכשיר אחר — טוענים את השמירה מהשרת',   // T6 §8.1 (server trigger: NOT applied, awaiting the owner)
  state_too_big: 'השמירה גדולה מדי',
  // live rooms (draft rooms.sql + Edge `room`, behind the `rooms` flag) — docs/full-upgrade/ONLINE.md §3–§4
  room_not_found: 'לא מצאנו חדר פתוח עם הקוד הזה. אולי הוא כבר התחיל, נסגר, או שהקוד שגוי.',
  room_full: 'החדר מלא',
  too_many_rooms: 'יש לך כבר 3 חדרים פתוחים. סיים או צא מאחד מהם קודם.',
  bad_settings: 'אחת ההגדרות לא תקינה',
  not_in_room: 'אתה לא נמצא בחדר הזה',
  not_host: 'רק מי שפתח את החדר יכול לעשות את זה',
  room_started: 'המשחק בחדר כבר התחיל',
  room_not_playing: 'המשחק בחדר כבר לא פעיל',
  bad_char: 'הדמות הזו לא קיימת במפה הזו',
  bad_seat: 'השחקן כבר לא בחדר',
  not_ready: 'עוד לא כולם מוכנים',
  not_enough_players: 'צריך עוד שחקנים כדי להתחיל',
  seat_finished: 'המשחק שלך בחדר כבר נגמר',
  not_your_roll: 'כבר הטלת בסבב הזה — מחכים ליריבים',
  stale: 'המצב התעדכן — רואים עכשיו את המצב האחרון',
  illegal_action: 'אי אפשר לעשות את זה עכשיו',
  action_id_reused: 'הפעולה כבר נשלחה',
  version_mismatch: 'יש גרסה חדשה של המשחק — רענן את הדף',
  version_changed: 'השרת עודכן באמצע המשחק בחדר',
  bad_reaction: 'תגובה לא מוכרת',
  bad_action: 'פעולה לא תקינה',
  too_big: 'הבקשה גדולה מדי',
  too_many_actions: 'יותר מדי פעולות במשחק הזה',
  server_error: 'משהו השתבש בשרת. נסה שוב.',
  offline: 'אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.',
  // groups v2 + competitions (draft groups_v2.sql / competitions.sql)
  bad_description: 'תיאור: עד 200 תווים, בלי תווים מיוחדים',
  bad_role: 'תפקיד לא מוכר',
  member_not_found: 'החבר כבר לא בקבוצה',
  not_allowed: 'אין לך הרשאה לעשות את זה בקבוצה',
  bad_window: 'חלון זמן לא תקין: לפחות שעה ועד 30 יום',
  bad_rules: 'כללי התחרות לא תקינים',
  already_cancelled: 'התחרות כבר בוטלה',
  challenge_cancelled: 'התחרות הזו בוטלה',
  not_started: 'התחרות עוד לא התחילה',
  late_join: 'ההצטרפות לתחרות הזו כבר נסגרה',
  attempt_open: 'יש לך ניסיון פתוח — סיים אותו קודם',
  attempts_used: 'ניצלת את כל הניסיונות בתחרות הזו',
  bad_before: 'בקשה לא תקינה',
  // moderation + in-room chat (draft 20261126_admin_mod_chat.sql; docs/full-upgrade/ADMIN_CHAT.md)
  banned: 'החשבון שלך הושעה על ידי מנהל המשחק: בינתיים אי אפשר להיכנס לחדרים, לכתוב בצ\'אט או להצטרף לקבוצות. אפשר להמשיך לשחק לבד.',
  chat_empty: 'ההודעה ריקה',
  chat_too_long: 'עד 120 תווים בהודעה',
  chat_link: 'אי אפשר לשלוח קישורים בצ\'אט 🙂',
  chat_phone: 'אסור לשתף מספרי טלפון בצ\'אט — שומרים על עצמנו 🙂',
  chat_email: 'אסור לשתף כתובות מייל בצ\'אט — שומרים על עצמנו 🙂',
  chat_handle: 'בלי שמות משתמש ורשתות חברתיות בצ\'אט — משחקים כאן 🙂',
  chat_bad_word: 'בואו נשמור על שפה נעימה 🙂 ההודעה לא נשלחה',
  chat_closed: 'הצ\'אט של החדר הזה כבר נסגר',
  msg_not_found: 'ההודעה כבר לא קיימת',
  cannot_report_self: 'אי אפשר לדווח על הודעה שלך',
  not_admin: 'רק מנהל המשחק יכול לעשות את זה',
  cannot_ban_self: 'אי אפשר להשעות את עצמך',
  cannot_kick_self: 'אי אפשר להוציא את עצמך',
  not_banned: 'השחקן לא מושעה',
  bad_reason: 'סיבה: 2–200 תווים',
  room_not_open: 'החדר כבר לא פתוח',
  player_not_in_room: 'השחקן כבר לא בחדר',
  // account deletion (20261127_delete_account.sql; docs/full-upgrade/ACCOUNT_DELETION.md)
  confirm_mismatch: 'הכינוי שהקלדת לא תואם לכינוי של החשבון',
  admin_cannot_delete: 'את החשבון של מנהל המשחק אי אפשר למחוק מכאן. כתבו לנו במייל.',
  missing_rpc: 'האפשרות הזו עוד לא זמינה בשרת. נסו שוב מאוחר יותר.',
};

let me = null;
try { me = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { me = null; }
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {} };
const auth = () => { if (!me) throw new Error('צריך לבחור כינוי קודם'); return { p_id: me.id, p_secret: me.secret }; };

async function rpc(fn, args = {}) {
  let r;
  try {
    r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  } catch (e) { const er = new Error('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'); er.code = 'offline'; throw er; }
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(ERR[j?.message] || 'משהו השתבש בשרת. נסה שוב.'); e.code = j?.message;
    if (j?.code === 'PGRST202') { e.code = 'missing_rpc'; e.status = r.status; }   // the function is not on this server (yet)
    throw e;
  }
  return j;
}

export const net = {
  /** current player or null: {id, secret, nickname} */
  me: () => me,
  hasMe: () => !!me,
  /** ref = player id of the friend whose link brought you (?ref=<id>) — they get +5⚡ */
  async register(nickname, ref = null) { me = await rpc('rr_register2', { p_nickname: nickname, p_ref: ref || null }); store(); return me; },
  /** id to put in invite links as ?ref= */
  refId: () => me ? me.id : null,
  /** send 3⚡ to a friend in a shared group (once a day per friend) */
  sendEnergy: (groupId, nickname) => rpc('rr_send_energy', { ...auth(), p_group: groupId, p_nickname: nickname }),
  /** claim waiting gifts + referral bonuses → {total, from:[{nickname, kind:'gift'|'referral', amount}]} */
  claimEnergy: () => rpc('rr_claim_energy', auth()),
  /** owner tools (server checks the admin row; nothing here is trusted by the server) → {admin:bool} */
  adminStatus: () => rpc('rr_admin_status', auth()),
  /** one-time owner code → {admin:true} or throws bad_code */
  adminClaim: (code) => rpc('rr_admin_claim', { ...auth(), p_code: code }),
  /** [{id, nickname, stars, joined}] newest first (max 60), filtered by nickname */
  adminPlayers: (q) => rpc('rr_admin_players', { ...auth(), p_q: q || '' }),
  /** give n⚡ (1–99) to a player — delivered through the gifts inbox (rr_claim_energy) */
  adminGive: (to, n) => rpc('rr_admin_give', { ...auth(), p_to: to, p_amount: n }),
  /** free-play milestones for friends' feeds, e.g. logEvent('escaped', {world:'w1', age:34, months:29}) */
  logEvent: (kind, data) => rpc('rr_log_event', { ...auth(), p_kind: kind, p_data: data || {} }),
  /** {feed:[{nickname, kind, data, at, me}], gifted_today:[nickname]} */
  groupFeed: (groupId) => rpc('rr_group_feed', { ...auth(), p_group: groupId }),
  async rename(nickname) { const r = await rpc('rr_rename', { ...auth(), p_nickname: nickname }); me.nickname = r.nickname; store(); return me; },
  /** {id,nickname,stars:{w1..w4},total_stars,achievements[],pawn,daily_streak,best_streak,last_daily} */
  profile: () => rpc('rr_profile', auth()),
  /** Deletes the account and its data on the server (confirm = the current nickname; the server checks it again). On success the
   *  identity is forgotten here too ('rr-player'); other local keys are js/account.js clearLocal's job.
   *  → {deleted:true, groups_transferred, groups_deleted}; throws code confirm_mismatch / admin_cannot_delete / unauthorized / offline. */
  async deleteAccount(confirm) {
    const r = await rpc('rr_delete_account', { ...auth(), p_confirm: String(confirm ?? '') });
    net.forget();
    return r;
  },
  /** forget the identity on this device only (after a deletion, or when the server no longer knows it) */
  forget() { me = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  /** the nickname may have been changed on another device (rr_rename there): take the server's. → current nickname */
  async refreshNickname() {
    const p = await rpc('rr_profile', auth());
    if (me && p && typeof p.nickname === 'string' && p.nickname && p.nickname !== me.nickname) { me.nickname = p.nickname; store(); }
    return me ? me.nickname : null;
  },
  /** merges on the server (max stars per world, union of achievements); returns profile */
  /** meta = {games, wins, best:{w1:months…}} — server keeps max games/wins and min best months */
  syncProgress: ({ stars, achievements, pawn, meta }) => rpc('rr_sync_progress2', { ...auth(), p_stars: stars || {}, p_achievements: achievements || [], p_pawn: pawn || null, p_meta: meta || null }),

  createGroup: (name) => rpc('rr_create_group', { ...auth(), p_name: name }),
  joinGroup: (code) => rpc('rr_join_group', { ...auth(), p_code: code }),
  leaveGroup: (groupId) => rpc('rr_leave_group', { ...auth(), p_group: groupId }),
  /** [{id,code,name,is_owner,members,active}] */
  myGroups: () => rpc('rr_my_groups', auth()),
  /** {id,code,name,is_owner,members:[{nickname,owner,me,stars,pawn}],challenges:[{id,title,profession(char id),world,starts_at,ends_at,active,my_status,board}]} */
  group: (groupId) => rpc('rr_group', { ...auth(), p_group: groupId }),
  createChallenge: ({ groupId, title, world, charId, days }) => rpc('rr_create_challenge2', { ...auth(), p_group: groupId, p_title: title, p_world: world, p_char: charId, p_days: days }),

  /** {key,world,char_index,profession,ends_at,my_status,board} */
  weekly: () => rpc('rr_weekly', auth()),
  /** {key,world,char_index,max_months,ends_at,my_status,streak,board} */
  daily: () => rpc('rr_daily', auth()),
  /** mode: 'daily'|'weekly'|'challenge'. Returns {result_id,status,seed,world,char (challenge only),char_index (daily/weekly),max_months,title,group_id,streak,
   *  checkpoint_turn, checkpoint} — checkpoint is the last state saved on the server (resume source of truth; null/0 = never played). */
  begin: (mode, challengeId = null) => rpc('rr_begin', { ...auth(), p_mode: mode, p_challenge: challengeId }),
  /** Save a ranked game's state on the server. Call after every landing and every decision. turn must not decrease (server rejects rewinds). */
  checkpoint: (resultId, turn, state) => rpc('rr_checkpoint', { ...auth(), p_result: resultId, p_turn: Math.max(0, Math.floor(turn)), p_state: state }),
  /** stats may include {progress:0..1, stars, ...}; progress is used to rank unfinished/lost games */
  finish: ({ resultId, status, months, passive, expenses, netWorth, stats, worldId }) => (unrankedWorld(worldId || (stats && stats.world))
    ? Promise.reject(Object.assign(new Error('המפה הזו עוד לא בטבלאות'), { code: 'unranked_world' }))   // worlds wave 0: meta ranked:false never reaches rr_finish
    : rpc('rr_finish', {
    ...auth(), p_result: resultId, p_status: status, p_months: Math.max(1, Math.min(200, Math.round(months))),
    p_passive: Math.round(passive), p_expenses: Math.max(0, Math.round(expenses)), p_net_worth: Math.round(netWorth), p_stats: stats || {},
  })),

  /** Server-side replay of a finished ranked game (Edge Function verify-result). actions = engine st.actions. Call AFTER finish().
   *  → {ok, verified, stored, already?, error?, result:{status, months, passive, expenses, netWorth, stars, progress}} */
  async verify(resultId, actions) {
    const { p_id, p_secret } = auth();
    let r;
    try {
      r = await fetch(FN_VERIFY, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p_id, secret: p_secret, result_id: resultId, actions }) });
    } catch (e) { const er = new Error('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'); er.code = 'offline'; throw er; }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(ERR[j?.error] || 'משהו השתבש בשרת. נסה שוב.'); e.code = j?.error || 'http_' + r.status; e.status = r.status; throw e; }
    return j;
  },
  /** Recovery code to move the player to another device (contains the secret — show it only on the profile screen). */
  recoveryCode: () => me ? btoa(unescape(encodeURIComponent(JSON.stringify([me.id, me.secret, me.nickname])))) : null,
  async restore(code) {
    let arr; try { arr = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); } catch (e) { throw new Error('קוד שחזור לא תקין'); }
    const cand = { id: arr[0], secret: arr[1], nickname: arr[2] };
    const prev = me; me = cand;
    try { const p = await rpc('rr_profile', auth()); me.nickname = p.nickname; store(); return p; }
    catch (e) { me = prev; throw new Error('קוד שחזור לא תקין'); }
  },
  /* ---------------- groups v2 (draft 20261124_groups_v2.sql; ONLINE.md §7). Members are addressed by the opaque per-membership
   * `handle` from rr_group — never by nickname or player id. Every permission is decided by the server. */
  groupUpdate: (groupId, name, description) => rpc('rr_group_update', { ...auth(), p_group: groupId, p_name: name, p_description: description ?? null }),
  groupSetRole: (groupId, handle, role) => rpc('rr_group_set_role', { ...auth(), p_group: groupId, p_member: handle, p_role: role }),
  groupTransfer: (groupId, handle) => rpc('rr_group_transfer', { ...auth(), p_group: groupId, p_member: handle }),
  groupRemove: (groupId, handle) => rpc('rr_group_remove', { ...auth(), p_group: groupId, p_member: handle }),
  groupRotateCode: (groupId) => rpc('rr_group_rotate_code', { ...auth(), p_group: groupId }),
  groupSettings: (groupId, inviteOpen, memberChallenges) => rpc('rr_group_settings', { ...auth(), p_group: groupId, p_invite_open: inviteOpen ?? null, p_member_challenges: memberChallenges ?? null }),
  groupHistory: (groupId, before = null) => rpc('rr_group_history', { ...auth(), p_group: groupId, p_before: before }),
  /* ---------------- competitions (draft 20261124_competitions.sql; ONLINE.md §8) */
  createCompetition: ({ groupId, title, world, charId, startsAt, endsAt, rules }) => rpc('rr_create_competition', { ...auth(), p_group: groupId, p_title: title, p_world: world, p_char: charId, p_starts_at: startsAt ?? null, p_ends_at: endsAt, p_rules: rules || null }),
  competition: (challengeId) => rpc('rr_competition', { ...auth(), p_challenge: challengeId }),
  cancelCompetition: (challengeId) => rpc('rr_cancel_competition', { ...auth(), p_challenge: challengeId }),
  beginAttempt: (challengeId) => rpc('rr_begin_attempt', { ...auth(), p_challenge: challengeId }),
  /* ---------------- live rooms (draft 20261124_rooms.sql + Edge Function `room`; ONLINE.md §3–§5). Behind the `rooms` flag. */
  roomCreate: (settings, groupId = null) => rpc('rr_room_create', { ...auth(), p_settings: settings || {}, p_group: groupId || null }),
  roomJoin: (code) => rpc('rr_room_join', { ...auth(), p_code: String(code || '').trim().toUpperCase() }),
  roomReady: (roomId, ready, charId = null) => rpc('rr_room_ready', { ...auth(), p_room: roomId, p_ready: !!ready, p_char: charId || null }),
  roomLeave: (roomId) => rpc('rr_room_leave', { ...auth(), p_room: roomId }),
  roomKick: (roomId, seat) => rpc('rr_room_kick', { ...auth(), p_room: roomId, p_seat: seat }),
  roomCancel: (roomId) => rpc('rr_room_cancel', { ...auth(), p_room: roomId }),
  /** {unchanged, version, state_version, now} when nothing changed since `since`, else {room, seats, me, events} */
  roomState: (roomId, since = null) => rpc('rr_room_state', { ...auth(), p_room: roomId, p_since: since }),
  roomHeartbeat: (roomId, conn) => rpc('rr_room_heartbeat', { ...auth(), p_room: roomId, p_conn: conn || null }),
  roomReact: (roomId, kind) => rpc('rr_room_react', { ...auth(), p_room: roomId, p_kind: kind }),
  myRooms: () => rpc('rr_my_rooms', auth()),
  /* ---------------- moderation + in-room chat (draft 20261126_admin_mod_chat.sql; ADMIN_CHAT.md). Every rule is the server's. */
  /** {banned, until (ms | null), permanent} — my own ban (the reason is for the admin only) */
  banStatus: () => rpc('rr_ban_status', auth()),
  /** → {id, at}; refusals throw (code chat_link / chat_phone / chat_email / chat_handle / chat_bad_word / chat_too_long / rate_limited / banned …) */
  roomChatSend: (roomId, text) => rpc('rr_room_chat_send', { ...auth(), p_room: roomId, p_text: String(text ?? '') }),
  /** {msgs:[{id, seat, nickname, text, at, me}], hidden:[ids], last} — visible messages with id > since (the last 40) */
  roomChatList: (roomId, since = null) => rpc('rr_room_chat_list', { ...auth(), p_room: roomId, p_since: since }),
  roomChatReport: (msgId) => rpc('rr_room_chat_report', { ...auth(), p_msg: msgId }),
  /** owner: days = null → permanent */
  adminBan: (target, reason, days = null) => rpc('rr_admin_ban', { ...auth(), p_target: target, p_reason: reason, p_days: days }),
  adminUnban: (target) => rpc('rr_admin_unban', { ...auth(), p_target: target }),
  adminBans: () => rpc('rr_admin_bans', auth()),
  adminPlayer: (target) => rpc('rr_admin_player', { ...auth(), p_target: target }),
  adminRooms: () => rpc('rr_admin_rooms', auth()),
  adminRoomChat: (roomId) => rpc('rr_admin_room_chat', { ...auth(), p_room: roomId }),
  adminKickRoom: (roomId, target) => rpc('rr_admin_kick_room', { ...auth(), p_room: roomId, p_target: target }),
  adminCloseRoom: (roomId) => rpc('rr_admin_close_room', { ...auth(), p_room: roomId }),
  adminRemoveFromGroup: (groupId, target) => rpc('rr_admin_remove_from_group', { ...auth(), p_group: groupId, p_target: target }),
  adminDeleteChat: (msgId) => rpc('rr_admin_delete_chat', { ...auth(), p_msg: msgId }),
  adminReports: () => rpc('rr_admin_reports', auth()),
  adminModLog: (before = null) => rpc('rr_admin_mod_log', { ...auth(), p_before: before }),
  /** Edge Function `room` {op: start | act | tick}. → body on 200; else throws Error{code, status, body} (409 stale carries the
   *  current {state_version, view}). A network failure throws code 'offline' — an `act` may then be resent with the SAME action_id. */
  async roomFn(op, roomId, extra = {}) {
    const { p_id, p_secret } = auth();
    let r;
    try {
      r = await fetch(FN_ROOM, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...extra, op, id: p_id, secret: p_secret, room: roomId }) });
    } catch (e) { const er = new Error(ERR.offline); er.code = 'offline'; throw er; }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(ERR[j?.error] || ERR.server_error); e.code = j?.error || 'http_' + r.status; e.status = r.status; e.body = j || {}; throw e; }
    return j;
  },
  /** board row helper: title by total stars */
  title(totalStars = 0) { return totalStars >= 12 ? 'אגדה' : totalStars >= 10 ? 'מיליונר' : totalStars >= 7 ? 'טייקון' : totalStars >= 4 ? 'משקיע' : totalStars >= 2 ? 'חוסך' : 'עכבר'; },
};
