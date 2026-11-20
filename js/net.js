// Supabase RPC client for מירוץ העכברים. All calls go to public.rr_* functions (security definer, checked by player id+secret).
// Identity lives in localStorage ('rr-player' = {id, secret, nickname}). No Supabase auth session is used.
const SB = 'https://xvqaxphyfqdzkddmoosu.supabase.co';
const SBK = 'sb_publishable_w3ubvawN4BnqOul66NSaLg_KM6yTJhc';
const KEY = 'rr-player';

const ERR = {
  unauthorized: 'החשבון שלך לא מזוהה בשרת.',
  group_not_found: 'לא מצאנו קבוצה עם הקוד הזה',
  group_full: 'הקבוצה מלאה (50 שחקנים)',
  not_member: 'אתה לא חבר בקבוצה הזו',
  too_many_groups: 'הגעת למקסימום של 20 קבוצות',
  bad_nickname: 'כינוי צריך להיות 2–20 תווים',
  bad_name: 'שם קבוצה צריך להיות 2–40 תווים',
  bad_title: 'שם אתגר צריך להיות 2–50 תווים',
  bad_world: 'עולם לא קיים',
  bad_profession: 'דמות לא קיימת',
  bad_days: 'משך אתגר: 1–30 ימים',
  too_many_challenges: 'יש כבר 5 אתגרים פעילים בקבוצה',
  challenge_closed: 'האתגר הזה כבר נסגר',
  challenge_not_found: 'האתגר לא נמצא',
  already_finished: 'כבר סיימת את המשחק הזה',
  result_not_found: 'המשחק לא נמצא בשרת',
  already_sent_today: 'כבר שלחת לו ⚡ היום',
  player_not_found: 'השחקן לא נמצא בקבוצה',
  rate_limited: 'יותר מדי עדכונים היום',
  stale_checkpoint: 'יש שמירה חדשה יותר בשרת',
  state_too_big: 'השמירה גדולה מדי',
};

let me = null;
try { me = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { me = null; }
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {} };
const auth = () => { if (!me) throw new Error('צריך לבחור כינוי קודם'); return { p_id: me.id, p_secret: me.secret }; };

async function rpc(fn, args = {}) {
  let r;
  try {
    r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  } catch (e) { throw new Error('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'); }
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(ERR[j?.message] || 'משהו השתבש בשרת. נסה שוב.'); e.code = j?.message; throw e; }
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
  /** free-play milestones for friends' feeds, e.g. logEvent('escaped', {world:'w1', age:34, months:29}) */
  logEvent: (kind, data) => rpc('rr_log_event', { ...auth(), p_kind: kind, p_data: data || {} }),
  /** {feed:[{nickname, kind, data, at, me}], gifted_today:[nickname]} */
  groupFeed: (groupId) => rpc('rr_group_feed', { ...auth(), p_group: groupId }),
  async rename(nickname) { const r = await rpc('rr_rename', { ...auth(), p_nickname: nickname }); me.nickname = r.nickname; store(); return me; },
  /** {id,nickname,stars:{w1..w4},total_stars,achievements[],pawn,daily_streak,best_streak,last_daily} */
  profile: () => rpc('rr_profile', auth()),
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
  finish: ({ resultId, status, months, passive, expenses, netWorth, stats }) => rpc('rr_finish', {
    ...auth(), p_result: resultId, p_status: status, p_months: Math.max(1, Math.min(200, Math.round(months))),
    p_passive: Math.round(passive), p_expenses: Math.max(0, Math.round(expenses)), p_net_worth: Math.round(netWorth), p_stats: stats || {},
  }),

  /** Recovery code to move the player to another device (contains the secret — show it only on the profile screen). */
  recoveryCode: () => me ? btoa(unescape(encodeURIComponent(JSON.stringify([me.id, me.secret, me.nickname])))) : null,
  async restore(code) {
    let arr; try { arr = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); } catch (e) { throw new Error('קוד שחזור לא תקין'); }
    const cand = { id: arr[0], secret: arr[1], nickname: arr[2] };
    const prev = me; me = cand;
    try { const p = await rpc('rr_profile', auth()); me.nickname = p.nickname; store(); return p; }
    catch (e) { me = prev; throw new Error('קוד שחזור לא תקין'); }
  },
  /** board row helper: title by total stars */
  title(totalStars = 0) { return totalStars >= 12 ? 'אגדה' : totalStars >= 10 ? 'מיליונר' : totalStars >= 7 ? 'טייקון' : totalStars >= 4 ? 'משקיע' : totalStars >= 2 ? 'חוסך' : 'עכבר'; },
};
