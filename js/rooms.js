// Live rooms + groups v2 + competitions — the lobby screens of wave 3b (behind the `rooms` flag, default OFF).
// Loaded on demand by js/lobby.js (dynamic import: not on the lobby's boot graph). Contract: docs/full-upgrade/ONLINE.md.
//
// * Every permission decision is the server's: buttons are shown by role/host only as a convenience; a refusal from the server
//   is shown as-is (Hebrew text from net.js ERR). A nickname is never used to address anyone (members → opaque `handle`,
//   seats → seat number of the room the server put us in).
// * All user text (nicknames, group names / descriptions, competition titles) goes through esc().
// * The room game itself is driven by js/remote.js (RemoteDriver): this screen can play a whole room on its own (roll / choose /
//   tools); when game.js carries the wave-3b hook (`setDriver`), "למסך המשחק" plays the same room on the 3D game screen.
// * No free chat: reactions are ids from a fixed list (room_core.REACTIONS).
import { RemoteDriver, REACTIONS } from './remote.js';
import { fmtM, metrics } from './engine.js';
import { DEFAULTS as FLAG_DEFAULTS } from './flags.js';
/** Worlds a live room / competition can use = the server's room_core WORLDS (supabase/functions/room/room_core.js; tests/remote_driver
 *  checks they agree). Meta roomOk (w5) is not enough: the room server does not load lazy worlds yet. Unlocked ∩ this list. */
export const ROOM_WORLDS = Object.freeze(['w1', 'w2', 'w3', 'w4']);

let A = null;                       // the lobby's helper object (lobby.js roomsApi())
let DRV = null;                     // the driver of the room on screen (kept while that room's game screen is open)
let tmr = null;                     // 1 s timer for the countdown
let lastKey = '';
let installed = false;
let busyUi = false;
const groupsCache = { list: null };

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (t) => `<bdi dir="ltr" class="lb-num">${esc(t)}</bdi>`;
const money = (v) => num(safe(() => fmtM(+v || 0), String(Math.round(+v || 0))));
const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
const pct = (x) => Math.round(Math.max(0, Math.min(1, +x || 0)) * 100);
const $ = (s, r = document) => r.querySelector(s);

/* ============================================================ words (Hebrew, one place) */
const H = {
  title: 'חדר חי',
  intro: '2–4 שחקנים באותו חדר: אותן קוביות ואותם קלפים לכולם. כל אחד מנהל את הכסף שלו, וכולם מתקדמים יחד בסבבים.',
  mode: { ranked: 'תחרותי', casual: 'ידידותי' },
  modeSub: { ranked: 'כללי תחרות, רמז בלבד', casual: 'בוחרים רמת עזרה' },
  help: { guide: 'ליווי צמוד', hint: 'רמזים', pro: 'בלי עזרה' },
  disc: { autopilot: 'טייס זהיר: מי שמתנתק — המחשב מבצע עבורו רק פעולות בטוחות', strict: 'קפדני: 3 סבבים בלי תגובה = פרישה' },
  end: { first_win: 'נגמר כשמישהו יוצא מהמירוץ', all: 'משחקים עד שכולם מסיימים' },
  privacy: { code: 'כל מי שיש לו את הקוד', group: 'רק חברי קבוצה' },
  seat: { joined: 'עוד לא מוכן', ready: 'מוכן ✓', playing: 'משחק', away: 'לא מגיב — טייס זהיר', finished: 'סיים', forfeit: 'פרש', left: 'יצא' },
  reason: { first_win: 'מישהו יצא מהמירוץ', all_done: 'כולם סיימו', max_rounds: 'הגענו לסבב האחרון', abandoned: 'החדר ננטש', host: 'המארח ביטל', vote: 'בוטל בהצבעה', empty: 'כולם יצאו', expired: 'החדר חיכה יותר מדי זמן',
    version_changed: 'המשחק התעדכן לגרסה חדשה באמצע החדר, ואי אפשר להמשיך משחק ישן בגרסה חדשה. אפשר לפתוח חדר חדש' },
  ev: {
    created: '🏠 החדר נפתח', joined: '👋 {n} הצטרף', ready: '✅ {n} מוכן', unready: '⏸️ {n} עוד לא מוכן', left: '🚪 {n} יצא', host: '👑 {n} מארח עכשיו',
    kicked: '🚫 שחקן הוצא מהחדר', started: '🎲 המשחק התחיל', round: '🔔 סבב {r} נסגר', autopilot: '🤖 הטייס הזהיר שיחק עבור {n}', away: '📵 {n} לא מגיב',
    back: '📶 {n} חזר', forfeit: '🏳️ {n} פרש', seat_over: '🏁 {n} סיים את המשחק', cancel_vote: '🗳️ הצבעה לביטול ({v}/{of})', cancelled: '✖️ החדר בוטל', finished: '🏆 המשחק הסתיים',
  },
  news: { bought: '🏠 קנה נכס', sold: '💸 מכר נכס', bankrupt: '⚠️ פשט רגל', escaped: '🎉 יצא מהמירוץ!' },
  role: { owner: 'בעלים', admin: 'מנהל', member: 'חבר' },
  compStatus: { scheduled: 'מתוזמנת', open: 'פתוחה', closed: 'נסגרה', cancelled: 'בוטלה' },
  flag: { ok: '', playing: 'משחק עכשיו', unfinished: 'לא סיים', late: 'סיים אחרי המועד', disqualified: 'נפסל באימות' },
  metric: { escape: 'יציאה מהמירוץ (פחות חודשים)', networth: 'שווי נקי' },
  tiebreak: { ratio: 'יחס הכנסה פסיבית להוצאות', networth: 'שווי נקי' },
  join: { members: 'כל חברי הקבוצה', members_before_start: 'רק מי שהיה בקבוצה לפני ההתחלה' },
};
const evText = (e, seats) => {
  const t = H.ev[e.kind]; if (!t) return null;
  const s = seats.find((x) => x.seat === (e.data || {}).seat);
  return t.replace('{n}', s ? esc(s.nickname) : 'שחקן').replace('{r}', esc(e.round)).replace('{v}', esc((e.data || {}).votes)).replace('{of}', esc((e.data || {}).of));
};
const worldName = (id) => safe(() => A.worldOf(id).name, id);
const charName = (w, c) => safe(() => (A.worldOf(w).characters.find((x) => x.id === c) || {}).name, c) || '';

/* ============================================================ install (own delegation: data-ract / data-rform) */
function install() {
  if (installed) return; installed = true;
  document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ract]'); if (b && !b.disabled) { if (b.tagName !== 'INPUT') ev.preventDefault(); onAct(b).catch((e) => showErr(e)); } });
  document.addEventListener('submit', (ev) => { const f = ev.target.closest('form[data-rform]'); if (f) { ev.preventDefault(); onForm(f).catch((e) => showErr(e, f)); } });
  document.addEventListener('change', (ev) => {
    const s = ev.target; const f = s.closest('form[data-rform]'); if (!f) return;
    if (s.name === 'world' && f.char) f.char.innerHTML = charOpts(s.value);
    if (s.name === 'mode' && f.help) { const casual = s.value === 'casual'; f.help.disabled = !casual; if (!casual) f.help.value = 'hint'; }
    if (s.name === 'char_policy' && f.char) f.char.disabled = s.value === 'choose';
    if (s.name === 'privacy' && f.group) f.group.disabled = s.value !== 'group';
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DRV) DRV.pollOnce().catch(() => {}); });
}
/** S4: room-specific Hebrew for server codes whose generic text (net.js ERR) is wrong or says nothing about what to do. */
const ROOM_ERR = {
  rate_limited: {
    rcreate: 'פתחת הרבה חדרים היום (עד 10 ביום). אפשר להצטרף לחדר של חבר עם קוד, או לפתוח חדר חדש מחר.',
    rjoin: 'יותר מדי קודים שגויים בשעה האחרונה. חכה כמה דקות, בדוק את הקוד ונסה שוב.',
    act: 'לאט לאט — יותר מדי פעולות בדקה. חכה רגע ונסה שוב.',
    react: 'רגע — תגובה אחת כל כמה שניות',
    any: 'יותר מדי ניסיונות. חכה כמה דקות ונסה שוב.',
  },
  version_changed: 'המשחק התעדכן לגרסה חדשה באמצע החדר, ולכן אי אפשר להמשיך אותו. החדר ייסגר תוך כמה דקות בלי דירוג. אפשר לצאת עכשיו, להצביע על ביטול, או לפתוח חדר חדש.',
  version_closed: 'החדר נסגר כי המשחק התעדכן לגרסה חדשה. אף אחד לא דורג. אפשר לפתוח חדר חדש.',
};
function roomMsg(e, where = 'any') {
  const c = e && e.code;
  if (c === 'rate_limited') return ROOM_ERR.rate_limited[where] || ROOM_ERR.rate_limited.any;
  if (c === 'version_changed') return e.body && e.body.closed ? ROOM_ERR.version_closed : ROOM_ERR.version_changed;
  return (e && e.message) || 'משהו השתבש';
}
/** S3: during the canary the `rooms` flag is off by default — an invite link must turn it on for the friend who opens it. */
const roomLink = (code) => `${A.baseUrl()}?room=${code}${FLAG_DEFAULTS.rooms ? '' : '&ff=rooms'}`;
function showErr(e, form) {
  const msg = roomMsg(e, form ? form.dataset.rform : 'any');
  const el = form ? form.querySelector('.err') : null;
  if (el) el.textContent = msg;
  A.toast(msg);
}

/* ============================================================ entry points used by lobby.js */
/** The entry button in the groups card of the home screen. */
export function homeEntry() {
  return `<button class="rm-entry" data-act="rooms"><span class="rm-entry-ic" aria-hidden="true">🎲</span><span><b>${H.title}</b><small>לשחק עכשיו עם חברים — 2–4 שחקנים</small></span><span class="lb-chev" aria-hidden="true">‹</span></button>`;
}
/** view {k:'rooms', code?} = hub (code: join it) · {k:'room', id} = one room. */
export async function render(api, v) {
  A = api; install(); ensureCss();
  if (v.k === 'room' && v.id) return openRoom(v.id);
  stopRoom();
  return renderHub(v.code || null);
}
/** Leaving the room views (lobby goRender). The driver keeps running only while that room's game screen is open. */
export function leaveView(keepForGame = false) { if (!keepForGame) stopRoom(); else stopTimer(); }
function ensureCss() {
  if (document.querySelector('link[data-rooms-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../css/rooms.css', import.meta.url).href; l.dataset.roomsCss = '1';
  document.head.appendChild(l);
}

/* ============================================================ HUB: my rooms · join by code · create */
async function renderHub(code) {
  const me = A.net.me();
  if (!me) { A.html(`<div class="lb-shell rm-hub"><div class="lb-bar"><button class="chip" data-act="home">› ללובי</button></div><h1>${H.title}</h1><p class="lb-note">כדי לשחק בחדר צריך כינוי. בחר כינוי במסך הראשי ונחזור לכאן.</p><button class="primary" data-act="focus-nick">לבחור כינוי</button></div>`); return; }
  A.html(hubHtml(null, code));
  if (code) {
    const f = $('form[data-rform="rjoin"]');
    if (f) { f.code.value = code; A.clearRoomParam(); try { await joinRoom(code, f); return; } catch (e) { showErr(e, f); } }
  }
  try { const rs = await A.net.myRooms(); const box = $('#rmMine'); if (box) box.innerHTML = mineHtml(rs || []); }
  catch (e) { const box = $('#rmMine'); if (box) box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  loadGroupsForPrivacy();
}
async function loadGroupsForPrivacy() {
  try { groupsCache.list = await A.net.myGroups(); } catch (e) { groupsCache.list = []; }
  const s = $('form[data-rform="rcreate"] select[name="group"]');
  if (s) s.innerHTML = groupOpts();
}
const groupOpts = () => (groupsCache.list && groupsCache.list.length ? groupsCache.list.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('') : '<option value="">אין לך קבוצות</option>');
function charOpts(wid, sel) { return safe(() => A.worldOf(wid).characters.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join(''), ''); }
function mineHtml(rs) {
  const open = rs.filter((r) => r.status === 'lobby' || r.status === 'playing');
  const done = rs.filter((r) => !(r.status === 'lobby' || r.status === 'playing')).slice(0, 5);
  const row = (r) => `<button class="lb-gitem rm-item" data-ract="open" data-id="${esc(r.id)}"><span class="lb-gav" aria-hidden="true">${r.status === 'playing' ? '▶' : r.status === 'lobby' ? '⏳' : '🏁'}</span><span><b>${esc(worldName(r.world))} · ${num(r.code)}</b><small>${r.status === 'lobby' ? `מחכים לשחקנים · ${num(r.seats + '/' + r.max_seats)}` : r.status === 'playing' ? `סבב ${num(r.round)} · ${num(r.seats)} שחקנים` : r.status === 'finished' ? 'הסתיים — לראות תוצאות' : 'בוטל'}${r.host ? ' · אתה המארח' : ''}</small></span><span class="lb-chev" aria-hidden="true">‹</span></button>`;
  if (!open.length && !done.length) return '<p class="lb-empty">אין לך חדרים פתוחים. פתח חדר או הצטרף בקוד.</p>';
  return `${open.length ? `<div class="lb-glist">${open.map(row).join('')}</div>` : ''}${done.length ? `<h3 class="lb-sub">הסתיימו לאחרונה</h3><div class="lb-glist">${done.map(row).join('')}</div>` : ''}`;
}
function hubHtml(rs, code) {
  const un = (A.unlocked() || ['w1']).filter((w) => ROOM_WORLDS.includes(w));
  const w0 = un[0] || 'w1';
  const sel = (name, opts, def, label, extra = '') => `<label class="rm-f"><span>${label}</span><select name="${name}" ${extra}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  return `<div class="lb-shell rm-hub">
    <div class="lb-bar"><button class="chip" data-act="home">› ללובי</button></div>
    <header class="rm-head"><span class="rm-head-ic" aria-hidden="true">🎲</span><div><h1>${H.title}</h1><p>${H.intro}</p></div></header>
    <section class="lb-card rm-mine"><h2>החדרים שלי</h2><div id="rmMine">${rs ? mineHtml(rs) : '<p class="lb-note">טוען…</p>'}</div></section>
    <section class="lb-card rm-joinc"><h2>להצטרף לחדר</h2>
      <form class="lb-form" data-rform="rjoin"><label for="rmCode">קוד החדר (6 תווים)</label><div class="inl"><input id="rmCode" name="code" maxlength="6" autocomplete="off" autocapitalize="characters" class="lb-code-in" dir="ltr" value="${esc(code || '')}" placeholder="ABC234"><button class="primary">להצטרף</button></div><p class="err" aria-live="polite"></p></form>
    </section>
    <section class="lb-card rm-create"><h2>לפתוח חדר חדש</h2>
      <form data-rform="rcreate" class="rm-form">
        <div class="rm-grid">
          ${sel('world', un.map((w) => [w, worldName(w)]), w0, 'עולם')}
          <fieldset class="rm-radio"><legend>מצב</legend>${['ranked', 'casual'].map((m) => `<label class="t4-opt ${m === 'ranked' ? 'on' : ''}"><input type="radio" name="mode" value="${m}" ${m === 'ranked' ? 'checked' : ''}><span><b>${H.mode[m]}</b><small>${H.modeSub[m]}</small></span></label>`).join('')}</fieldset>
          ${sel('char_policy', [['same', 'כולם עם אותה דמות'], ['choose', 'כל אחד בוחר דמות']], 'same', 'דמויות')}
          <label class="rm-f"><span>הדמות</span><select name="char">${charOpts(w0)}</select></label>
          ${sel('help', [['guide', H.help.guide], ['hint', H.help.hint], ['pro', H.help.pro]], 'hint', 'רמת עזרה', 'disabled')}
          ${sel('turn_secs', [[60, 'דקה'], [90, 'דקה וחצי'], [120, '2 דקות'], [180, '3 דקות'], [300, '5 דקות']], 90, 'זמן לסבב')}
          ${sel('max_seats', [[2, '2'], [3, '3'], [4, '4']], 4, 'עד כמה שחקנים')}
          ${sel('min_seats', [[2, '2'], [3, '3'], [4, '4']], 2, 'מינימום כדי להתחיל')}
          ${sel('end', [['first_win', H.end.first_win], ['all', H.end.all]], 'first_win', 'מתי נגמר')}
          ${sel('max_rounds', [[24, '24 סבבים'], [40, '40 סבבים'], [80, '80 סבבים'], [120, '120 סבבים']], 80, 'אורך מקסימלי')}
          ${sel('disconnect', [['autopilot', 'טייס זהיר'], ['strict', 'קפדני']], 'autopilot', 'מי שמתנתק')}
          ${sel('privacy', [['code', H.privacy.code], ['group', H.privacy.group]], 'code', 'מי יכול להיכנס')}
          <label class="rm-f"><span>קבוצה</span><select name="group" disabled>${groupOpts()}</select></label>
        </div>
        <p class="lb-note rm-rules">אחרי ההתחלה אי אפשר לשנות הגדרות. הדירוג: מי שיוצא מהמירוץ, בפחות חודשים, ואחריו מי שהתקדם הכי רחוק — אף פעם לא לפי מהירות לחיצה.</p>
        <button class="primary lb-wide">לפתוח חדר</button>
        <p class="err" aria-live="polite"></p>
      </form>
    </section>
  </div>`;
}
async function joinRoom(code, form) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(c)) throw new Error('קוד חדר הוא 6 תווים (אותיות באנגלית וספרות)');
  const r = await A.net.roomJoin(c);
  A.clearRoomParam();
  A.sfx('unlock'); if (!r.rejoined) A.toast('נכנסת לחדר 🎲');
  return A.go({ k: 'room', id: r.room_id });
}

/* ============================================================ ONE ROOM */
async function openRoom(id) {
  if (DRV && DRV.roomId !== id) stopRoom();
  if (!DRV) {
    DRV = new RemoteDriver({ net: A.net, roomId: id, conn: tabConn() });
    DRV.on((kind, data) => { if (kind === 'fatal') { A.toast('אתה כבר לא בחדר הזה'); stopRoom(); A.go({ k: 'rooms' }); return; } if (kind === 'change' || kind === 'primary' || kind === 'busy') paint(); if (kind === 'round') A.sfx('card');
      if (kind === 'version' && DRV && !DRV.versionWarned) { DRV.versionWarned = true; A.toast(roomMsg({ code: 'version_changed', body: data })); } });
  }
  lastKey = '';
  A.html(`<div class="lb-shell rm-room"><div class="lb-bar"><button class="chip" data-ract="hub">› לחדרים</button></div><p class="lb-note">מתחברים לחדר…</p></div>`);
  try { await DRV.refresh(true); }
  catch (e) { A.toast(e.message); stopRoom(); return A.go({ k: 'rooms' }); }
  await DRV.heartbeat();
  await DRV.resumePending();
  safe(() => localStorage.setItem('rr2-room-last', id));
  DRV.start(); startTimer();
  paint(true);
}
const tabConn = () => safe(() => { let c = sessionStorage.getItem('rr2-conn'); if (!c) { c = 'tab-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem('rr2-conn', c); } return c; }, undefined);
function stopRoom() { if (DRV) DRV.stop(); DRV = null; stopTimer(); lastPaintRoom = null; }
function startTimer() { stopTimer(); tmr = setInterval(() => { const el = $('#rmTimer'); if (el && DRV) el.innerHTML = timerText(DRV.secondsLeft()); }, 1000); }
function stopTimer() { if (tmr) clearInterval(tmr); tmr = null; }
const timerText = (s) => (s == null ? '' : `⏱ ${num(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'))}`);
const onRoomScreen = () => !!(DRV && document.querySelector(`.rm-room[data-room="${CSS.escape(DRV.roomId)}"]`)) || !!$('.rm-room');

/** Re-render the room view when something visible changed (keeps focus + a typed quantity). */
function paint(force = false) {
  if (!DRV || !DRV.snap || !A.isLobbyVisible() || !onRoomScreen()) return;
  const d = DRV;
  const key = JSON.stringify([d.room.version, d.stateVersion, d.primary, !!d.inflight, d.me && d.me.done, d.me && d.me.rolled, A.hasGameHook()]);
  if (!force && key === lastKey) return;
  lastKey = key;
  const a = document.activeElement; const fk = a && a.dataset ? a.dataset.fk : null; const qty = $('#rmQty') ? $('#rmQty').value : null;
  A.html(roomHtml(d, !lastPaintRoom || lastPaintRoom !== d.roomId));
  lastPaintRoom = d.roomId;
  if (qty != null && $('#rmQty')) $('#rmQty').value = qty;
  if (fk) { const el = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) safe(() => el.focus({ preventScroll: true })); }
}
let lastPaintRoom = null;
function roomHtml(d, anim = true) {
  const r = d.room; const s = r.settings;
  const head = `<div class="lb-bar"><button class="chip" data-ract="hub" data-fk="hub">› לחדרים</button><button class="chip" data-ract="refresh" data-fk="refresh">↻ רענון</button></div>
    <header class="rm-rhead"><div><h1>${H.title} · ${esc(worldName(s.world))}</h1><p class="lb-meta">${H.mode[s.mode] || ''} · ${s.char_policy === 'same' ? esc(charName(s.world, s.char)) : 'כל אחד בוחר דמות'} · ${num(s.turn_secs)} שניות לסבב${s.mode === 'casual' ? ' · ' + esc(H.help[s.help] || '') : ''}</p></div><span class="rm-code" dir="ltr" aria-label="קוד החדר">${esc(r.code)}</span></header>
    ${d.primary ? '' : '<p class="rm-warn" role="status">החדר פתוח גם בלשונית אחרת — כאן רק צופים. <button class="chip" data-ract="takeover" data-fk="takeover">להמשיך לשחק כאן</button></p>'}`;
  let body;
  if (r.status === 'lobby') body = waitingHtml(d);
  else if (r.status === 'playing') body = playingHtml(d);
  else body = resultsHtml(d);
  return `<div class="lb-shell rm-room is-${esc(r.status)} ${anim ? '' : 'rm-still'}" data-room="${esc(r.id)}">${head}${body}${logHtml(d)}</div>`;
}
const pawn = (p) => A.pawnHtml(p || 'classic', null, 'sm');
function seatsLobbyHtml(d) {
  const r = d.room;
  return `<ul class="rm-seats">${d.seats.map((x) => `<li class="${x.me ? 'me' : ''}">${pawn(x.pawn)}<span class="nm">${esc(x.nickname)}${x.me ? ' <small>(אתה)</small>' : ''}${x.seat === r.host_seat ? ' <span class="rm-host" title="מארח" aria-label="מארח">👑</span>' : ''}</span>
      <span class="rm-st ${x.status === 'ready' ? 'ok' : ''}">${esc(H.seat[x.status] || x.status)}</span>
      <span class="rm-conn ${x.connected ? 'on' : 'off'}">${x.connected ? 'מחובר' : 'מנותק'}</span>
      ${d.isHost && !x.me ? `<button class="chip rm-kick" data-ract="kick" data-seat="${+x.seat}" data-fk="kick${+x.seat}" aria-label="להוציא את ${esc(x.nickname)}">להוציא</button>` : ''}</li>`).join('')}
    ${Array.from({ length: Math.max(0, r.settings.max_seats - d.seats.length) }, () => '<li class="rm-empty"><span class="nm">מקום פנוי</span></li>').join('')}</ul>`;
}
function waitingHtml(d) {
  const r = d.room; const s = r.settings; const me = d.mySeat; const ready = me && me.status === 'ready';
  const link = roomLink(r.code);
  const wa = A.waHref(`בוא לשחק איתי במירוץ העכברים בחדר חי 🎲 קוד: ${r.code} — ${link}`);
  const allReady = d.seats.length >= s.min_seats && d.seats.every((x) => x.status === 'ready');
  const why = d.seats.length < s.min_seats ? `צריך לפחות ${s.min_seats} שחקנים` : !allReady ? 'מחכים שכולם יסמנו "מוכן"' : '';
  return `<div class="rm-wait">
    <section class="lb-card rm-inv"><h2>להזמין לחדר</h2><p class="lb-note">שלח את הקוד או את הקישור. ${s.privacy === 'group' ? 'רק חברי הקבוצה יכולים להיכנס.' : 'כל מי שיש לו את הקוד יכול להיכנס עד שהמשחק מתחיל.'}</p>
      <div class="gp-code" dir="ltr">${esc(r.code)}</div>
      <a class="lb-wa" href="${esc(wa)}" target="_blank" rel="noopener">📲 להזמין בוואטסאפ</a>
      <div class="inl gp-link"><input value="${esc(link)}" readonly dir="ltr" aria-label="קישור לחדר"><button data-act="copy" data-text="${esc(link)}">להעתיק</button></div></section>
    <section class="lb-card rm-who"><h2>מי בחדר <small>${num(d.seats.length + '/' + s.max_seats)}</small></h2>${seatsLobbyHtml(d)}
      <div class="rm-me">
        ${s.char_policy === 'choose' ? `<label class="rm-f"><span>הדמות שלי</span><select id="rmChar" data-fk="char" ${ready ? 'disabled' : ''}>${charOpts(s.world, me && me.char)}</select></label>` : ''}
        <button class="${ready ? '' : 'primary'} lb-wide" data-ract="ready" data-v="${ready ? '0' : '1'}" data-fk="ready" aria-pressed="${ready}">${ready ? '✋ לא מוכן עדיין' : '✅ אני מוכן'}</button>
      </div>
      ${d.isHost ? `<div class="rm-hostbox"><button class="primary lb-wide" data-ract="start" data-fk="start" ${allReady ? '' : 'aria-disabled="true"'}>🎲 להתחיל את המשחק</button>${why ? `<p class="lb-note">${esc(why)}</p>` : ''}</div>` : `<p class="lb-note">המארח יתחיל כשכולם מוכנים.</p>`}
    </section>
    <section class="lb-card rm-sets"><h2>הגדרות החדר</h2><ul class="rm-setlist">
      <li><span>עולם</span><b>${esc(worldName(s.world))}</b></li><li><span>מצב</span><b>${H.mode[s.mode]}</b></li>
      <li><span>דמויות</span><b>${s.char_policy === 'same' ? esc(charName(s.world, s.char)) : 'כל אחד בוחר'}</b></li>
      <li><span>עזרה</span><b>${esc(H.help[s.help] || s.help)}</b></li><li><span>זמן לסבב</span><b>${num(s.turn_secs)} שניות</b></li>
      <li><span>מתי נגמר</span><b>${H.end[s.end]} · עד ${num(s.max_rounds)} סבבים</b></li><li><span>ניתוק</span><b>${esc(H.disc[s.disconnect])}</b></li>
      <li><span>כניסה</span><b>${H.privacy[s.privacy]}</b></li><li><span>שחקנים</span><b>${num(s.min_seats + '–' + s.max_seats)}</b></li></ul></section>
    ${reactHtml(d)}
    <p class="rm-foot"><button class="chip lb-leave" data-ract="leave" data-fk="leave">לצאת מהחדר</button>${d.isHost ? '<button class="chip lb-leave" data-ract="cancel" data-fk="cancel">לבטל את החדר</button>' : ''}</p>
  </div>`;
}
function oppHtml(d) {
  const r = d.room;
  return `<ul class="rm-opps" aria-label="ההתקדמות של כולם (נכון לסוף הסבב הקודם)">${d.seats.map((x) => {
    const p = x.pub || {}; const prog = x.status === 'finished' && p.won ? 1 : p.progress;
    const st = x.status === 'playing' ? (x.done ? '✓ סיים את הסבב' : '🎲 משחק') : (H.seat[x.status] || x.status);
    return `<li class="${x.me ? 'me' : ''} st-${esc(x.status)}">
      <div class="rm-o1">${pawn(x.pawn)}<b class="nm">${esc(x.nickname)}${x.me ? ' <small>(אתה)</small>' : ''}</b><span class="rm-conn ${x.connected ? 'on' : 'off'}" title="${x.connected ? 'מחובר' : 'מנותק'}" aria-label="${x.connected ? 'מחובר' : 'מנותק'}"></span></div>
      <div class="rm-prog" role="img" aria-label="התקדמות ${pct(prog)}%"><i style="width:${pct(prog)}%"></i></div>
      <div class="rm-o2"><span>${num(pct(prog) + '%')}</span><span>חודש ${num(p.month ?? 0)}</span><span class="rm-ost">${esc(st)}</span></div>
      ${(p.news || []).length ? `<div class="rm-news">${p.news.map((n) => esc(H.news[n] || '')).join(' ')}</div>` : ''}
    </li>`;
  }).join('')}</ul><p class="rm-pubnote lb-note">היריבים רואים את ההתקדמות שלך רק כשהסבב נסגר.${r.round > 1 ? '' : ''}</p>`;
}
function myPanelHtml(d) {
  const st = d.state; if (!st) return '';
  const m = safe(() => metrics(st), null);
  if (!m) return '';
  return `<div class="rm-mynums"><span><small>חודש</small><b>${num(st.month)}</b></span><span><small>מזומן</small><b>${money(m.cash)}</b></span><span><small>תזרים</small><b>${money(m.cashflow)}</b></span><span><small>הכנסה פסיבית</small><b>${money(m.passive)}</b></span></div>
    <div class="rm-goal"><small>${esc(m.goalText || 'הדרך לחופש')}</small><div class="rm-prog lg"><i style="width:${pct(m.goalProgress)}%"></i></div><b>${num(pct(m.goalProgress) + '%')}</b></div>`;
}
function cardHtml(d) {
  const ev = d.event; if (!ev) return '';
  const off = !d.primary || !!d.inflight;
  const opts = (ev.options || []).map((o) => {
    if (!o.enabled) return `<button class="rm-opt" disabled title="${esc(o.reason || '')}">${esc(o.label)}${o.reason ? `<small>${esc(o.reason)}</small>` : ''}</button>`;
    if (o.needsQty) return `<span class="rm-qty"><label><span class="sr">כמות</span><input id="rmQty" type="number" inputmode="numeric" min="1" max="${+o.max || 1}" value="1" dir="ltr" data-fk="qty"></label><button class="rm-opt" data-ract="opt" data-id="${esc(o.id)}" data-qty="1" data-fk="opt-${esc(o.id)}" ${off ? 'disabled' : ''}>${esc(o.label)}</button></span>`;
    return `<button class="rm-opt ${o.primary ? 'primary' : ''}" data-ract="opt" data-id="${esc(o.id)}" data-fk="opt-${esc(o.id)}" ${off ? 'disabled' : ''}>${esc(o.label)}</button>`;
  }).join('');
  return `<section class="lb-card rm-card" aria-labelledby="rmCardT" style="--cc:${/^#[0-9a-f]{3,8}$/i.test(ev.color || '') ? ev.color : '#2f6fdb'}">
    ${ev.tag ? `<span class="rm-tag">${esc(ev.tag)}</span>` : ''}<h2 id="rmCardT">${esc(ev.title)}</h2>${ev.text ? `<p>${esc(ev.text)}</p>` : ''}
    <div class="rm-opts">${opts}</div></section>`;
}
function playingHtml(d) {
  const r = d.room; const me = d.mySeat; const st = d.state;
  const active = d.active();
  let line;
  if (!active) line = me ? `${esc(H.seat[me.status] || '')} — אפשר לצפות בשאר` : '';
  else if (d.event) line = 'בחר מה לעשות בכרטיס';
  else if (d.canRoll()) line = 'תורך — להטיל קוביות';
  else if (d.waiting()) line = 'סיימת את הסבב — מחכים ליריבים';
  else line = 'רגע…';
  const roll = active ? `<button class="primary lb-big rm-roll" data-ract="roll" data-fk="roll" ${d.canRoll() && d.primary ? '' : 'disabled'}>🎲 להטיל</button>` : '';
  const tools = active && st && !st.over ? `<div class="rm-tools"><button class="chip" data-ract="tool" data-c="L" data-fk="L" ${d.inflight || !d.primary ? 'disabled' : ''}>🏦 הלוואה</button><button class="chip" data-ract="tool" data-c="R" data-fk="R" ${d.inflight || !d.primary ? 'disabled' : ''}>↩️ להחזיר הלוואה</button><button class="chip" data-ract="tool" data-c="H" data-fk="H" ${d.inflight || !d.primary ? 'disabled' : ''}>💡 רמז</button></div>` : '';
  const game = A.hasGameHook() && active ? `<button class="chip rm-3d" data-ract="game" data-fk="game">🎮 לשחק על לוח המשחק</button>` : '';
  return `<div class="rm-play">
    <div class="rm-bar" role="status" aria-live="polite"><span class="rm-round">סבב ${num(r.round)} מתוך ${num(r.settings.max_rounds)}</span><span id="rmTimer" class="rm-timer">${timerText(d.secondsLeft())}</span><span class="rm-line">${esc(line)}</span></div>
    ${oppHtml(d)}
    <section class="lb-card rm-mine2"><h2>המשחק שלי</h2>${myPanelHtml(d)}<div class="rm-acts">${roll}${game}</div>${tools}</section>
    ${cardHtml(d)}
    ${reactHtml(d)}
    <p class="rm-foot">${active ? '<button class="chip lb-leave" data-ract="vote" data-fk="vote">להצביע לביטול החדר</button><button class="chip lb-leave" data-ract="leave" data-fk="leave">לפרוש מהמשחק</button>' : '<button class="chip" data-ract="hub">› לחדרים</button>'}</p>
  </div>`;
}
const STATUS_WORD = { won: '🎉 יצא מהמירוץ', lost: 'לא יצא', capped: 'נגמר הזמן', forfeit: '🏳️ פרש' };
function resultsHtml(d) {
  const r = d.room; const rows = r.results || [];
  if (r.status === 'cancelled') return `<section class="lb-card rm-res"><h2>החדר בוטל</h2><p class="lb-note">${esc(H.reason[r.end_reason] || '')}. אף אחד לא דורג.</p><button class="primary" data-ract="hub">› לחדרים</button></section>`;
  const tie = (x) => rows.filter((y) => y.rank === x.rank).length > 1;
  return `<section class="lb-card rm-res"><h2>🏆 תוצאות</h2><p class="lb-note">${esc(H.reason[r.end_reason] || '')} · הדירוג לפי יציאה מהמירוץ, פחות חודשים והתקדמות — לא לפי זמן או מהירות. שוויון = אותו מקום.</p>
    <ol class="rm-board">${rows.map((x) => { const s = d.seats.find((y) => y.seat === x.seat) || {}; const ratio = (x.passive || 0) / Math.max(1, x.expenses || 0);
      return `<li class="${s.me ? 'me' : ''} ${x.rank <= 3 ? 'top' + x.rank : ''}"><span class="rk">${x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : num(x.rank)}${tie(x) ? '<small>שוויון</small>' : ''}</span>${pawn(s.pawn)}<span class="nm">${esc(x.nickname)}${s.me ? ' <small>(אתה)</small>' : ''}</span>
        <span class="rs"><b>${esc(STATUS_WORD[x.status] || x.status)}</b><small>${x.status === 'won' ? `בחודש ${num(x.months)}` : `${num(pct(x.progress) + '%')} מהדרך`} · פסיבי/הוצאות ${num(Math.round(ratio * 100) + '%')} · שווי ${money(x.netWorth)}</small></span></li>`; }).join('')}</ol>
    ${r.seed ? `<p class="lb-note rm-seed">הזרע של החדר נחשף אחרי הסיום: ${num(r.seed)} — כולם קיבלו אותן קוביות ואותם קלפים.</p>` : ''}
    <div class="lb-acts"><button class="primary" data-ract="hub">› לחדרים</button></div></section>`;
}
function reactHtml(d) {
  if (!['lobby', 'playing'].includes(d.status)) return '';
  const recent = (d.snap.events || []).filter((e) => e.kind === 'react').slice(-4);
  return `<section class="rm-react" aria-label="תגובות"><div class="rm-rbtns">${REACTIONS.map(([k, ic, t]) => `<button class="rm-rb" data-ract="react" data-k="${k}" data-fk="react-${k}" aria-label="${esc(t)}" title="${esc(t)}">${ic}${k === 'bravo' || k === 'again' ? `<small>${esc(t)}</small>` : ''}</button>`).join('')}</div>
    ${recent.length ? `<div class="rm-rlast">${recent.map((e) => { const s = d.seats.find((x) => x.seat === e.data.seat); const R = REACTIONS.find((x) => x[0] === e.data.kind); return R ? `<span>${R[1]} ${esc(s ? s.nickname : '')}</span>` : ''; }).join('')}</div>` : ''}</section>`;
}
function logHtml(d) {
  const items = (d.snap.events || []).filter((e) => e.kind !== 'react').slice(-8).reverse().map((e) => evText(e, d.seats)).filter(Boolean);
  return items.length ? `<details class="rm-log"><summary>מה קרה בחדר</summary><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></details>` : '';
}

/* ============================================================ actions */
async function guard(fn) { if (busyUi) return; busyUi = true; try { return await fn(); } finally { busyUi = false; } }
async function onAct(b) {
  const k = b.dataset.ract;
  switch (k) {
    case 'hub': A.sfx('click'); stopRoom(); return A.go({ k: 'rooms' });
    case 'open': A.sfx('click'); return A.go({ k: 'room', id: b.dataset.id });
    case 'refresh': if (DRV) { await DRV.refresh(true); paint(true); } return;
    case 'takeover': if (DRV) { await DRV.takeOver(); paint(true); } return;
    case 'ready': return guard(async () => { const c = $('#rmChar'); await A.net.roomReady(DRV.roomId, b.dataset.v === '1', c ? c.value : null); A.sfx('click'); await DRV.refresh(); paint(true); });
    case 'kick': return guard(async () => { if (!(await A.confirm('להוציא את השחקן מהחדר? הוא לא יוכל לחזור עם הקוד.', 'להוציא'))) return; await A.net.roomKick(DRV.roomId, +b.dataset.seat); await DRV.refresh(); paint(true); });
    case 'start': return guard(async () => { await A.net.roomFn('start', DRV.roomId); A.sfx('unlock'); await DRV.refresh(true); paint(true); });
    case 'leave': return guard(async () => {
      const playing = DRV.status === 'playing';
      if (!(await A.confirm(playing ? 'לפרוש מהמשחק? תדורג אחרי כולם, ואי אפשר לחזור.' : 'לצאת מהחדר?', playing ? 'לפרוש' : 'לצאת'))) return;
      await A.net.roomLeave(DRV.roomId); if (playing) await A.net.roomFn('tick', DRV.roomId).catch(() => {});
      stopRoom(); A.toast(playing ? 'פרשת מהמשחק' : 'יצאת מהחדר'); return A.go({ k: 'rooms' });
    });
    case 'cancel': return guard(async () => { if (!(await A.confirm('לבטל את החדר לכולם?', 'לבטל'))) return; await A.net.roomCancel(DRV.roomId); await DRV.refresh(true); paint(true); });
    case 'vote': return guard(async () => { if (!(await A.confirm('להצביע לביטול? אם רוב השחקנים יצביעו — החדר מתבטל ואף אחד לא מדורג.', 'להצביע'))) return; const r = await A.net.roomCancel(DRV.roomId); A.toast(r.status === 'cancelled' ? 'החדר בוטל' : `הצבעת לביטול (${r.votes}/${r.of})`); await DRV.refresh(true); paint(true); });
    case 'react': try { await DRV.react(b.dataset.k); A.sfx('click'); await DRV.refresh(); paint(); } catch (e) { A.toast(roomMsg(e, 'react')); } return;
    case 'roll': return act(() => DRV.act('r'), 'roll');
    case 'opt': { const q = b.dataset.qty ? Math.max(1, Math.floor(+($('#rmQty') || {}).value || 1)) : null; return act(() => DRV.act('c', q != null ? [b.dataset.id, q] : [b.dataset.id]), 'card'); }
    case 'tool': return act(() => DRV.act(b.dataset.c, []), 'tool');
    case 'game': return A.playRoom(DRV);
    default:
      if (k.startsWith('g-') || k.startsWith('c-')) return groupAct(b);
  }
  return undefined;
}
async function act(fn, what) {
  if (!DRV) return;
  try {
    const r = await fn(); A.sfx(what === 'roll' ? 'roll' : 'click');
    const h = r && r.out && r.out.hint;
    if (h) A.toast(`💡 ${h.label ? h.label + ' — ' : ''}${(h.reasons || [])[0] || h.note || ''}`);
    else if (r && r.out && typeof r.out.toast === 'string' && what === 'tool') A.toast(r.out.toast);
    if (r && r.end && r.end.status === 'won') A.toast('🎉 יצאת מהמירוץ!');
  }
  catch (e) {
    if (e.code === 'busy') return;
    if (e.code === 'stale') A.toast('המצב התעדכן — זה המצב האחרון');
    else if (e.code === 'not_your_roll') A.toast('כבר הטלת בסבב הזה — מחכים ליריבים');
    else if (e.code === 'rate_limited' || e.code === 'version_changed') A.toast(roomMsg(e, 'act'));
    else if (e.code === 'version_mismatch') A.toast('יש גרסה חדשה של המשחק — רענן את הדף');
    else if (e.code === 'illegal_action') A.toast((e.body && e.body.msg) || 'אי אפשר לעשות את זה עכשיו');
    else A.toast(e.message);
  }
  paint(true);
}
async function onForm(f) {
  const kind = f.dataset.rform; const btn = f.querySelector('button:not([type="button"])'); const errEl = f.querySelector('.err'); if (errEl) errEl.textContent = '';
  if (btn) btn.disabled = true;
  try {
    if (kind === 'rjoin') return await joinRoom(f.code.value, f);
    if (kind === 'rcreate') {
      const st = {
        world: f.world.value, mode: f.mode.value, char_policy: f.char_policy.value, turn_secs: +f.turn_secs.value, disconnect: f.disconnect.value,
        end: f.end.value, max_rounds: +f.max_rounds.value, privacy: f.privacy.value, max_seats: +f.max_seats.value, min_seats: Math.min(+f.min_seats.value, +f.max_seats.value),
      };
      if (st.char_policy === 'same') st.char = f.char.value;
      st.help = st.mode === 'casual' ? f.help.value : 'hint';
      const gid = st.privacy === 'group' ? f.group.value || null : null;
      if (st.privacy === 'group' && !gid) throw new Error('בחר קבוצה לחדר פרטי לקבוצה');
      const r = await A.net.roomCreate(st, gid);
      A.sfx('unlock'); A.toast('החדר נפתח! שלח את הקוד לחברים');
      return A.go({ k: 'room', id: r.room_id });
    }
    if (kind === 'gupdate' || kind === 'newcomp') return await groupForm(f);
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
  return undefined;
}

/* ============================================================ GROUPS v2 + COMPETITIONS (inside the lobby's group page) */
const roleBadge = (role) => (role && role !== 'member' ? `<span class="gp-role r-${esc(role)}">${esc(H.role[role] || role)}</span>` : '');
/** Small role badge next to a member's name (lobby.js membersHtml). */
export function memberBadge(m) { return roleBadge(m && m.role); }
let compCache = {};
/** Fill #gpV2 (management) and #gpComps (competitions) of a group page. Only when the server speaks groups v2 (my_role). */
export async function fillGroup(api, g) {
  A = api; install(); ensureCss();
  if (!g || !g.my_role) return;
  const box = $('#gpV2'); if (box) box.innerHTML = groupV2Html(g);
  const comps = (g.challenges || []).filter((c) => c.status);
  const cb = $('#gpComps'); if (cb) cb.innerHTML = compsHtml(g, comps);
  const need = comps.filter((c) => !compCache[c.id] || compCache[c.id].status !== c.status);
  await Promise.all(need.map(async (c) => { try { compCache[c.id] = await A.net.competition(c.id); } catch (e) { /* shown without details */ } }));
  if (need.length && A.viewIs('group', g.id)) { const cb2 = $('#gpComps'); if (cb2) cb2.innerHTML = compsHtml(g, comps); }
}
function groupV2Html(g) {
  const mgr = g.my_role === 'owner' || g.my_role === 'admin'; const own = g.my_role === 'owner';
  const others = g.members.filter((m) => !m.me);
  return `<section class="lb-card gp-v2" aria-labelledby="gpV2H"><h2 id="gpV2H">הקבוצה</h2>
    <p class="gp-me-role">התפקיד שלך: <b class="gp-role r-${esc(g.my_role)}">${esc(H.role[g.my_role] || g.my_role)}</b> · <span>🔒 קבוצה פרטית — נכנסים רק בהזמנה</span></p>
    ${g.description ? `<p class="gp-desc">${esc(g.description)}</p>` : mgr ? '<p class="lb-note">אין עדיין תיאור לקבוצה.</p>' : ''}
    ${mgr ? `<details class="gp-edit"><summary>✏️ שם ותיאור</summary><form data-rform="gupdate" data-g="${esc(g.id)}" class="gp-form"><label class="rm-f"><span>שם</span><input name="name" maxlength="40" value="${esc(g.name)}"></label><label class="rm-f"><span>תיאור (עד 200 תווים)</span><textarea name="description" maxlength="200" rows="2">${esc(g.description || '')}</textarea></label><button class="primary">לשמור</button><p class="err" aria-live="polite"></p></form></details>` : ''}
    <div class="gp-inv2"><span>הזמנות: <b>${g.invite_open === false ? '⏸️ מושהות — הקוד לא מכניס אף אחד' : '✅ פתוחות'}</b></span>
      ${mgr ? `<button class="chip" data-ract="g-pause" data-g="${esc(g.id)}" data-v="${g.invite_open === false ? '1' : '0'}">${g.invite_open === false ? 'לפתוח הזמנות' : 'להשהות הזמנות'}</button><button class="chip" data-ract="g-rotate" data-g="${esc(g.id)}">🔄 קוד חדש (הקישור הישן יפסיק לעבוד)</button>` : ''}</div>
    ${mgr ? `<label class="gp-tog"><input type="checkbox" data-ract="g-memchal" data-g="${esc(g.id)}" ${g.member_challenges === false ? '' : 'checked'}> כל חבר יכול לפתוח אתגר או תחרות</label>` : ''}
    ${(own || g.my_role === 'admin') && others.length ? `<h3 class="lb-sub">ניהול חברים</h3><ul class="gp-mng">${others.map((m) => {
      const canRemove = own || (g.my_role === 'admin' && m.role === 'member');
      return `<li><span class="nm">${esc(m.nickname)}</span>${roleBadge(m.role)}<span class="gp-mbtns">
        ${own && m.role !== 'owner' ? `<button class="chip" data-ract="g-role" data-g="${esc(g.id)}" data-h="${esc(m.handle)}" data-v="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'להוריד ניהול' : 'למנות למנהל'}</button><button class="chip" data-ract="g-transfer" data-g="${esc(g.id)}" data-h="${esc(m.handle)}" data-n="${esc(m.nickname)}">להעביר בעלות</button>` : ''}
        ${canRemove && m.role !== 'owner' ? `<button class="chip lb-leave" data-ract="g-remove" data-g="${esc(g.id)}" data-h="${esc(m.handle)}" data-n="${esc(m.nickname)}">להסיר</button>` : ''}</span></li>`;
    }).join('')}</ul>` : ''}
    <button class="chip" data-ract="g-history" data-g="${esc(g.id)}" aria-expanded="false" aria-controls="gpHist">📜 היסטוריה</button><div id="gpHist"></div>
  </section>`;
}
const LOGW = { created: 'פתח את הקבוצה', joined: 'הצטרף', left: 'עזב', removed: 'הסיר את {t}', role: 'שינה את התפקיד של {t}', owner: 'העביר בעלות ל{t}', code_rotated: 'החליף את קוד ההזמנה', settings: 'שינה הגדרות', updated: 'עדכן שם/תיאור', competition: 'פתח תחרות', competition_cancelled: 'ביטל תחרות' };
function historyHtml(h) {
  const log = (h.log || []).slice(0, 20); const cs = h.challenges || [];
  const when = (at) => safe(() => new Date(at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }), '');
  return `<div class="gp-hist">${log.length ? `<ul class="gp-hlog">${log.map((x) => `<li><small>${esc(when(x.at))}</small> <b>${esc(x.actor || '—')}</b> ${esc((LOGW[x.kind] || x.kind).replace('{t}', x.target || ''))}${x.data && x.data.title ? ` · ${esc(x.data.title)}` : ''}</li>`).join('')}</ul>` : ''}
    ${cs.length ? `<h4>אתגרים ותחרויות קודמים</h4><ul class="gp-hlog">${cs.map((c) => `<li><b>${esc(c.title)}</b> · ${esc(worldName(c.world))}${c.status ? ' · ' + esc(H.compStatus[c.status] || c.status) : ''}</li>`).join('')}</ul>` : ''}${!log.length && !cs.length ? '<p class="lb-empty">אין עדיין היסטוריה.</p>' : ''}</div>`;
}
function compsHtml(g, comps) {
  const un = (A.unlocked() || ['w1']).filter((w) => ROOM_WORLDS.includes(w));
  const canCreate = g.member_challenges !== false || g.my_role === 'owner' || g.my_role === 'admin';
  const sel = (name, opts, def, label) => `<label class="rm-f"><span>${label}</span><select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  return `<section class="gp-comps2"><h2>תחרויות</h2>
    ${comps.length ? comps.map((c) => compHtml(g, c)).join('') : '<p class="lb-empty">אין עדיין תחרויות. תחרות = חלון זמן, כולם משחקים באותו עולם ובאותן קוביות, עד 3 ניסיונות.</p>'}
    ${canCreate ? `<details class="lb-card gp-newcomp"><summary>🏁 תחרות חדשה</summary><form data-rform="newcomp" data-g="${esc(g.id)}" class="rm-form"><div class="rm-grid">
      <label class="rm-f wide"><span>שם התחרות</span><input name="title" maxlength="50" placeholder="למשל: מי יוצא ראשון השבוע?"></label>
      ${sel('world', un.map((w) => [w, worldName(w)]), un[0] || 'w1', 'עולם')}<label class="rm-f"><span>דמות</span><select name="char">${charOpts(un[0] || 'w1')}</select></label>
      ${sel('start', [[0, 'עכשיו'], [1, 'בעוד שעה'], [24, 'מחר']], 0, 'מתי מתחילה')}${sel('hours', [[2, 'שעתיים'], [6, '6 שעות'], [24, 'יום'], [72, '3 ימים'], [168, 'שבוע']], 72, 'משך')}
      ${sel('attempts', [[1, 'ניסיון אחד'], [2, '2 ניסיונות'], [3, '3 ניסיונות']], 1, 'ניסיונות')}${sel('metric', [['escape', H.metric.escape], ['networth', H.metric.networth]], 'escape', 'דירוג לפי')}
      ${sel('tiebreak', [['ratio', H.tiebreak.ratio], ['networth', H.tiebreak.networth]], 'ratio', 'שובר שוויון')}${sel('join_policy', [['members', H.join.members], ['members_before_start', H.join.members_before_start]], 'members', 'מי יכול להשתתף')}
      </div><p class="lb-note">הכללים ננעלים כשהתחרות נפתחת. אף פעם לא מדרגים לפי זמן משחק.</p><button class="primary lb-wide">לפתוח תחרות</button><p class="err" aria-live="polite"></p></form></details>` : ''}
  </section>`;
}
function compHtml(g, c0) {
  const c = { ...c0, ...(compCache[c0.id] || {}) }; const R = c.rules || null;
  const w = c.world || 'w1'; const mgr = g.my_role === 'owner' || g.my_role === 'admin';
  const used = +c.attempts_used || 0; const max = R ? +R.attempts || 1 : 1;
  const mine = (c.board || []).find((x) => x.me);
  const playing = c.my_status === 'playing';
  let act = '';
  if (c.status === 'open') {
    if (playing) act = `<button class="primary" data-act="chal" data-id="${esc(c.id)}" data-g="${esc(g.id)}" data-t="${esc(c.title)}">▶ להמשיך את הניסיון</button>`;
    else if (!used) act = `<button class="primary" data-act="chal" data-id="${esc(c.id)}" data-g="${esc(g.id)}" data-t="${esc(c.title)}">לשחק</button>`;
    else if (used < max) act = `<button class="primary" data-ract="c-again" data-id="${esc(c.id)}" data-g="${esc(g.id)}" data-t="${esc(c.title)}">ניסיון ${used + 1} מתוך ${max}</button>`;
    else act = '<span class="lb-done sm">✓ ניצלת את כל הניסיונות</span>';
  }
  const cancel = (c.status === 'open' || c.status === 'scheduled') && (c.created_by_me || mgr) ? `<button class="chip lb-leave" data-ract="c-cancel" data-id="${esc(c.id)}" data-g="${esc(g.id)}">לבטל</button>` : '';
  const when = (t) => safe(() => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }), '');
  return `<article class="lb-card gp-comp st-${esc(c.status)}">
    <div class="gp-chal-head"><div><h3>${esc(c.title)} <span class="gp-cst st-${esc(c.status)}">${esc(H.compStatus[c.status] || c.status)}</span></h3>
      <p class="lb-meta">${esc(worldName(w))} · ${esc(charName(w, c.profession))} · ${num(when(c.starts_at))} ← ${num(when(c.ends_at))}</p></div></div>
    ${R ? `<ul class="gp-rules"><li>ניסיונות: <b>${num(max)}</b>${used ? ` (השתמשת ב־${num(used)})` : ''}</li><li>דירוג: <b>${esc(H.metric[R.metric] || R.metric)}</b></li><li>שובר שוויון: <b>${esc(H.tiebreak[R.tiebreak] || R.tiebreak)}</b></li><li>משתתפים: <b>${esc(H.join[R.join_policy] || R.join_policy)}</b></li>${c.engine_rules ? `<li>גרסת חוקים: <b>${num(c.engine_rules)}</b></li>` : ''}</ul>` : ''}
    <div class="gp-chal-acts">${act}${cancel}</div>
    ${boardHtml(c.board || [], R)}
    ${mine && mine.flag && mine.flag !== 'ok' ? `<p class="lb-note">הסטטוס שלך: ${esc(H.flag[mine.flag] || mine.flag)}</p>` : ''}
  </article>`;
}
function boardHtml(rows, R) {
  if (!rows.length) return '<p class="lb-empty">עוד אף אחד לא שיחק.</p>';
  const shared = (x) => x.rank != null && rows.filter((y) => y.rank === x.rank).length > 1;
  return `<ol class="lb-board gp-b2">${rows.slice(0, 20).map((x) => {
    const res = x.flag === 'ok' ? (R && R.metric === 'networth' ? `שווי ${money(x.net_worth)}` : x.status === 'won' ? `יצא בחודש ${num(x.months)}` : `${num(pct(x.progress) + '%')} מהדרך`) : esc(H.flag[x.flag] || x.flag);
    return `<li class="${x.me ? 'me' : ''} fl-${esc(x.flag)}"><span class="rk">${x.rank != null ? num(x.rank) : '·'}${shared(x) ? '<small>שוויון</small>' : ''}</span>${A.pawnHtml(x.pawn || 'classic', null, 'xs')}<span class="nm">${esc(x.nickname)}${x.me ? ' <small>(אתה)</small>' : ''}${x.attempts > 1 ? ` <small>ניסיון ${num(x.attempt)}/${num(x.attempts)}</small>` : ''}</span><span class="rs">${res}</span></li>`;
  }).join('')}</ol>`;
}
async function groupAct(b) {
  const k = b.dataset.ract; const gid = b.dataset.g; const h = b.dataset.h;
  const after = async (msg) => { if (msg) A.toast(msg); A.sfx('click'); await A.reloadGroup(gid); };
  switch (k) {
    case 'g-role': await A.net.groupSetRole(gid, h, b.dataset.v); return after(b.dataset.v === 'admin' ? 'מונה למנהל' : 'חזר להיות חבר');
    case 'g-transfer': if (!(await A.confirm(`להעביר את הבעלות על הקבוצה ל${b.dataset.n}? אתה תישאר מנהל.`, 'להעביר'))) return undefined; await A.net.groupTransfer(gid, h); return after('הבעלות הועברה');
    case 'g-remove': if (!(await A.confirm(`להסיר את ${b.dataset.n} מהקבוצה? הוא לא יוכל לחזור עם הקוד הנוכחי. התוצאות שלו נשארות בטבלאות.`, 'להסיר'))) return undefined; await A.net.groupRemove(gid, h); return after('הוסר מהקבוצה');
    case 'g-rotate': if (!(await A.confirm('להחליף את קוד ההזמנה? הקישורים הישנים יפסיקו לעבוד.', 'להחליף'))) return undefined; await A.net.groupRotateCode(gid); return after('קוד חדש נוצר — הקישורים הישנים בוטלו');
    case 'g-pause': await A.net.groupSettings(gid, b.dataset.v === '1', null); return after(b.dataset.v === '1' ? 'ההזמנות נפתחו' : 'ההזמנות הושהו');
    case 'g-memchal': await A.net.groupSettings(gid, null, !!b.checked); return after(null);
    case 'g-history': {
      const box = $('#gpHist'); if (!box) return undefined;
      if (b.getAttribute('aria-expanded') === 'true') { box.innerHTML = ''; b.setAttribute('aria-expanded', 'false'); return undefined; }
      box.innerHTML = '<p class="lb-note">טוען…</p>'; b.setAttribute('aria-expanded', 'true');
      try { box.innerHTML = historyHtml(await A.net.groupHistory(gid)); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      return undefined;
    }
    case 'c-cancel': if (!(await A.confirm('לבטל את התחרות? הטבלה נשמרת, אבל אי אפשר יותר לשחק בה.', 'לבטל'))) return undefined; await A.net.cancelCompetition(b.dataset.id); delete compCache[b.dataset.id]; return after('התחרות בוטלה');
    case 'c-again': await A.net.beginAttempt(b.dataset.id); delete compCache[b.dataset.id]; return A.playChallenge(b.dataset.id, gid, b.dataset.t);
    default: return undefined;
  }
}
async function groupForm(f) {
  const gid = f.dataset.g;
  if (f.dataset.rform === 'gupdate') { await A.net.groupUpdate(gid, f.name.value.trim(), f.description.value.trim()); A.toast('נשמר'); return A.reloadGroup(gid); }
  const title = f.title.value.trim() || 'מי יוצא ראשון?';
  const now = +f.start.value === 0;                                   // "now" → null: the server's own now() (no clock skew)
  const start = new Date(Date.now() + (+f.start.value) * 3600e3);
  const end = new Date(start.getTime() + (+f.hours.value) * 3600e3 + (now ? 60e3 : 0));
  await A.net.createCompetition({ groupId: gid, title, world: f.world.value, charId: f.char.value, startsAt: now ? null : start.toISOString(), endsAt: end.toISOString(),
    rules: { attempts: +f.attempts.value, metric: f.metric.value, tiebreak: f.tiebreak.value, join_policy: f.join_policy.value } });
  A.sfx('unlock'); A.toast('התחרות נפתחה! שתף אותה בקבוצה');
  return A.reloadGroup(gid);
}
/** test hook */
export const _debug = { driver: () => DRV };
