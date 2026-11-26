// The owner's moderation panel inside the lobby's profile screen (loaded on demand by js/lobby.js, only for an admin — and the server
// checks game.is_admin on EVERY call: a non-admin who opens this file gets not_admin from every RPC). Contract: draft
// supabase/migrations/20261126_admin_mod_chat.sql, docs/full-upgrade/ADMIN_CHAT.md.
//   players (search lives in lobby.js) → a player card: ban (reason + duration) / unban, their groups (remove), their open rooms (kick)
//   tabs: ⛔ bans · 🎲 live rooms (kick a seat, close the room, read its chat: hide / ban) · 🚩 chat reports (hide / ban) · 📜 mod log
// Every destructive action needs a SECOND tap on the same button within 4 s (the first one arms it); a tap within 320 ms of arming is a
// double tap and is ignored (the ui.js ghostTap rule). All user text goes through esc().
const ARM_MS = 4000;
const GHOST_MS = 320;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
const when = (ms) => (ms == null ? '' : safe(() => new Date(ms).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }), ''));
const day = (ms) => (ms == null ? 'לצמיתות' : `עד ${safe(() => new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }), '')}`);
const $ = (s, r = document) => r.querySelector(s);
export const DURATIONS = Object.freeze([[1, 'יום אחד'], [3, '3 ימים'], [7, 'שבוע'], [30, 'חודש'], [0, 'לצמיתות']]);
const ACT = { claim: 'קיבל הרשאת מנהל', give: 'נתן ⚡', ban: 'השעה', unban: 'ביטל השעיה', kick_room: 'הוציא מחדר', close_room: 'סגר חדר', remove_group: 'הסיר מקבוצה', hide_chat: 'הסתיר הודעה' };
const WHY = { chat_link: 'קישורים', chat_phone: 'טלפונים', chat_email: 'מיילים', chat_handle: 'שמות משתמש / רשתות', chat_bad_word: 'מילים לא יפות', chat_too_long: 'ארוך מדי', chat_empty: 'ריק' };
const ST = { lobby: 'מחכים', playing: 'משחקים', joined: 'בחדר', ready: 'מוכן', away: 'לא מגיב', finished: 'סיים', forfeit: 'פרש', left: 'יצא' };

let A = null; let tab = 'rooms'; let armed = null; let installed = false; let logBefore = null;

/** Fill #pfMod (the lobby renders the container for an admin only). api = {net, toast, sfx}. */
export async function mount(api) {
  A = api; install();
  const box = $('#pfMod'); if (!box) return;
  box.innerHTML = `<div class="pf-mod">
    <div id="pfModPlayer" class="pf-mod-player" aria-live="polite"></div>
    <div class="pf-mod-tabs" role="tablist" aria-label="כלי ניהול">${[['rooms', '🎲 חדרים חיים'], ['reports', '🚩 דיווחים בצ\'אט'], ['bans', '⛔ השעיות'], ['log', '📜 יומן פעולות']]
      .map(([k, t]) => `<button type="button" role="tab" class="chip" data-aact="tab" data-k="${k}" aria-selected="${k === tab}" aria-controls="pfModPane">${t}</button>`).join('')}</div>
    <div id="pfModPane" class="pf-mod-pane" role="tabpanel" aria-live="polite"></div></div>`;
  return showTab(tab);
}
function install() {
  if (installed) return; installed = true;
  document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-aact]'); if (!b || b.disabled || !b.closest('.pf-admin')) return; ev.preventDefault(); onAct(b, ev).catch((e) => fail(e)); });
  document.addEventListener('submit', (ev) => { const f = ev.target.closest('form[data-aform]'); if (!f || !f.closest('.pf-admin')) return; ev.preventDefault(); onForm(f, ev).catch((e) => fail(e, f)); });
}
function fail(e, f) { const m = (e && e.message) || 'לא הצלחנו. נסה שוב.'; const el = f && f.querySelector('.err'); if (el) el.textContent = m; A.toast(m); }
/** the second-tap rule → true when this tap may act */
function confirmTap(b, ev) {
  if (b.dataset.two !== '1') return true;
  const now = performance.now();
  if (armed && armed.el === b && now - armed.at < ARM_MS) { if (ev && ev.detail > 0 && now - armed.at < GHOST_MS) return false; disarm(); return true; }
  disarm();
  armed = { el: b, at: now, label: b.innerHTML };
  b.classList.add('armed'); b.textContent = `לחץ שוב לאישור — ${b.dataset.what || b.textContent}`; b.setAttribute('aria-live', 'assertive');
  setTimeout(() => { if (armed && armed.el === b) disarm(); }, ARM_MS);
  return false;
}
function disarm() { if (armed && armed.el.isConnected) { armed.el.innerHTML = armed.label; armed.el.classList.remove('armed'); armed.el.removeAttribute('aria-live'); } armed = null; }
const two = (what) => `data-two="1" data-what="${esc(what)}"`;

/* ------------------------------------------------------------------ the player card */
export async function openPlayer(id, prefill = '') {
  const box = $('#pfModPlayer'); if (!box) return;
  box.innerHTML = '<p class="lb-note">טוען…</p>';
  let p; try { p = await A.net.adminPlayer(id); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  box.innerHTML = `<section class="pf-mod-card" aria-labelledby="pfModPN" data-player="${esc(p.id)}">
    <div class="pf-mod-ph"><h3 id="pfModPN">${esc(p.nickname)}</h3><small>★ ${+p.stars || 0} · מ־${esc(String(p.joined || ''))}${p.admin ? ' · 🛡️ מנהל' : ''}</small>
      <button type="button" class="chip" data-aact="close-player" aria-label="לסגור את כרטיס השחקן">✕</button></div>
    <p class="pf-mod-counts">הודעות שנחסמו ב-24 שעות: <b>${+p.blocked_24h || 0}</b> · דיווחים עליו ב-24 שעות: <b>${+p.reported_24h || 0}</b></p>
    ${p.ban ? `<div class="pf-mod-ban on" role="status"><b>⛔ מושעה ${esc(day(p.ban.until))}</b><span>סיבה: ${esc(p.ban.reason)}</span>
        <button type="button" class="chip" data-aact="unban" data-id="${esc(p.id)}">לבטל את ההשעיה</button></div>` : ''}
    ${p.admin ? '' : `<form class="lb-form pf-mod-banf" data-aform="ban" data-id="${esc(p.id)}">
      <label for="pfBanR">${p.ban ? 'לשנות את ההשעיה — סיבה' : 'להשעות — סיבה (רק המנהל רואה אותה)'}</label>
      <input id="pfBanR" name="reason" maxlength="200" required minlength="2" value="${esc(prefill)}" placeholder="למשל: שיתף מספר טלפון בצ'אט">
      <label for="pfBanD">לכמה זמן</label><select id="pfBanD" name="days">${DURATIONS.map(([d, t]) => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="primary" ${two('השעיה')}>⛔ להשעות</button><p class="err" aria-live="polite"></p>
      <p class="lb-note">מושעה לא יכול לפתוח או להיכנס לחדרים, לכתוב בצ'אט, להצטרף לקבוצות או להופיע בטבלאות. הוא יוצא מכל חדר פתוח ומכל קבוצה. אפשר לבטל בכל רגע (לקבוצות חוזרים עם קוד).</p></form>`}
    <h4>קבוצות</h4>${p.groups.length ? `<ul class="pf-mod-rows">${p.groups.map((g) => `<li><span><b>${esc(g.name)}</b><small>${+g.members} חברים${g.owner ? ' · הבעלים' : ''}</small></span>
        <button type="button" class="chip lb-leave" data-aact="ungroup" data-g="${esc(g.id)}" data-id="${esc(p.id)}" ${two(`להסיר מ־${g.name}`)}>להסיר מהקבוצה</button></li>`).join('')}</ul>` : '<p class="lb-empty">לא בשום קבוצה.</p>'}
    <h4>חדרים פתוחים</h4>${p.rooms.length ? `<ul class="pf-mod-rows">${p.rooms.map((r) => `<li><span><b dir="ltr">${esc(r.code)}</b><small>${esc(ST[r.status] || r.status)} · ${esc(ST[r.seat_status] || r.seat_status)}</small></span>
        ${['finished', 'forfeit', 'left'].includes(r.seat_status) ? '' : `<button type="button" class="chip lb-leave" data-aact="kick" data-room="${esc(r.id)}" data-id="${esc(p.id)}" ${two(`להוציא מ־${r.code}`)}>להוציא מהחדר</button>`}</li>`).join('')}</ul>` : '<p class="lb-empty">לא בשום חדר פתוח.</p>'}
  </section>`;
  safe(() => box.scrollIntoView({ block: 'nearest' }));
}

/* ------------------------------------------------------------------ tabs */
async function showTab(k) {
  tab = k; disarm();
  for (const b of document.querySelectorAll('.pf-mod-tabs [data-aact="tab"]')) b.setAttribute('aria-selected', String(b.dataset.k === k));
  const pane = $('#pfModPane'); if (!pane) return;
  pane.innerHTML = '<p class="lb-note">טוען…</p>';
  try {
    if (k === 'rooms') pane.innerHTML = roomsHtml(await A.net.adminRooms());
    else if (k === 'reports') pane.innerHTML = reportsHtml(await A.net.adminReports());
    else if (k === 'bans') pane.innerHTML = bansHtml(await A.net.adminBans());
    else if (k === 'log') { logBefore = null; pane.innerHTML = logHtml(await A.net.adminModLog(null), false); }
  } catch (e) { pane.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
const refresh = (k = tab) => `<button type="button" class="chip" data-aact="tab" data-k="${k}">↻ רענון</button>`;
function roomsHtml(rooms) {
  if (!rooms.length) return `<p class="lb-empty">אין עכשיו חדרים פתוחים.</p>${refresh('rooms')}`;
  return `${refresh('rooms')}<ul class="pf-mod-rooms">${rooms.map((r) => `<li data-room="${esc(r.id)}"><div class="pf-mod-rh"><b dir="ltr">${esc(r.code)}</b>
      <small>${esc(ST[r.status] || r.status)}${r.status === 'playing' ? ` · סבב ${+r.round}` : ''} · ${+r.seats.length}/${+r.max_seats} · 💬 ${+r.chat}${r.reports ? ` · 🚩 ${+r.reports}` : ''}</small>
      <span class="pf-mod-btns"><button type="button" class="chip" data-aact="room-chat" data-room="${esc(r.id)}" aria-expanded="false">💬 צ'אט</button>
      <button type="button" class="chip lb-leave" data-aact="close-room" data-room="${esc(r.id)}" ${two(`סגירת ${r.code}`)}>לסגור את החדר</button></span></div>
    <ul class="pf-mod-seats">${r.seats.map((s) => `<li><span>${s.host ? '👑 ' : ''}<b>${esc(s.nickname)}</b> <small>${esc(ST[s.status] || s.status)}${s.connected ? '' : ' · מנותק'}</small></span>
      <span class="pf-mod-btns"><button type="button" class="chip" data-aact="player" data-id="${esc(s.player_id)}">ניהול</button>
      ${['finished', 'forfeit', 'left'].includes(s.status) ? '' : `<button type="button" class="chip lb-leave" data-aact="kick" data-room="${esc(r.id)}" data-id="${esc(s.player_id)}" ${two(`להוציא את ${s.nickname}`)}>להוציא</button>`}</span></li>`).join('')}</ul>
    <div class="pf-mod-chat" hidden></div></li>`).join('')}</ul>`;
}
function chatHtml(roomId, msgs) {
  if (!msgs.length) return '<p class="lb-empty">אין הודעות בחדר.</p>';
  return `<ol class="pf-mod-msgs">${msgs.map((m) => `<li class="${m.hidden ? 'is-hidden' : ''}"><span><b>${esc(m.nickname)}</b> <small>${esc(when(m.at))}${m.reports ? ` · 🚩 ${+m.reports}` : ''}${m.hidden ? ' · מוסתרת' : ''}</small></span>
      <span class="pf-mod-text" dir="auto">${esc(m.text)}</span><span class="pf-mod-btns">${m.hidden ? '' : `<button type="button" class="chip" data-aact="hide" data-msg="${+m.id}" data-room="${esc(roomId)}" ${two('הסתרה')}>🙈 להסתיר</button>`}
      <button type="button" class="chip" data-aact="player" data-id="${esc(m.player_id)}" data-pre="${esc(`צ'אט: ${String(m.text).slice(0, 150)}`)}">ניהול השולח</button></span></li>`).join('')}</ol>`;
}
function reportsHtml(r) {
  const reps = r.reports || []; const bl = r.blocked || [];
  return `${refresh('reports')}<h4>הודעות שדווחו (7 ימים)</h4>${reps.length ? `<ul class="pf-mod-rows">${reps.map((x) => `<li class="${x.hidden ? 'is-hidden' : ''}" data-msg="${+x.msg_id}">
      <span class="pf-mod-rep"><span class="pf-mod-text" dir="auto">${esc(x.text)}</span><small>${esc(x.sender)}${x.banned ? ' (מושעה)' : ''} · חדר <bdi dir="ltr">${esc(x.room_code)}</bdi> · 🚩 ${+x.reports} · ${esc(when(x.last_report))}${x.hidden ? ' · מוסתרת' : ''}</small></span>
      <span class="pf-mod-btns">${x.hidden ? '' : `<button type="button" class="chip" data-aact="hide" data-msg="${+x.msg_id}" ${two('הסתרה')}>🙈 להסתיר</button>`}
      ${x.banned ? '' : `<button type="button" class="chip lb-leave" data-aact="quick-ban" data-id="${esc(x.sender_id)}" data-reason="${esc(`דיווח בצ'אט: ${String(x.text).slice(0, 150)}`)}" ${two(`השעיית ${x.sender} לשבוע`)}>⛔ להשעות לשבוע</button>`}
      <button type="button" class="chip" data-aact="player" data-id="${esc(x.sender_id)}" data-pre="${esc(`דיווח בצ'אט: ${String(x.text).slice(0, 150)}`)}">ניהול</button></span></li>`).join('')}</ul>` : '<p class="lb-empty">אין דיווחים. 🎉</p>'}
    <h4>ניסו לשלוח משהו אסור (24 שעות)</h4>${bl.length ? `<ul class="pf-mod-rows">${bl.map((x) => `<li><span><b>${esc(x.nickname)}</b>${x.banned ? ' <small>(מושעה)</small>' : ''}<small>${+x.n} פעמים · ${x.reasons.map((w) => esc(WHY[w] || w)).join(', ')}</small></span>
      <button type="button" class="chip" data-aact="player" data-id="${esc(x.player_id)}" data-pre="${esc(`ניסה לשלוח בצ'אט: ${x.reasons.map((w) => WHY[w] || w).join(', ')}`)}">ניהול</button></li>`).join('')}</ul>` : '<p class="lb-empty">אף אחד.</p>'}`;
}
function bansHtml(rows) {
  return `${refresh('bans')}${rows.length ? `<ul class="pf-mod-rows">${rows.map((b) => `<li><span><b>${esc(b.nickname)}</b><small>${esc(day(b.until))} · ${esc(b.reason)} · ${esc(when(b.at))}</small></span>
      <span class="pf-mod-btns"><button type="button" class="chip" data-aact="unban" data-id="${esc(b.player_id)}">לבטל השעיה</button><button type="button" class="chip" data-aact="player" data-id="${esc(b.player_id)}">ניהול</button></span></li>`).join('')}</ul>` : '<p class="lb-empty">אין השעיות פעילות.</p>'}`;
}
function logHtml(r, more) {
  const rows = (r.log || []).map((x) => `<li><small>${esc(when(x.at))}</small> <b>${esc(ACT[x.action] || x.action)}</b>${x.target ? ` · ${esc(x.target)}` : ''}${logData(x)}</li>`).join('');
  const next = r.next_before ? `<button type="button" class="chip" data-aact="log-more" data-before="${+r.next_before}">עוד</button>` : '';
  if (more) return { rows, next };
  return `${refresh('log')}${rows ? `<ol class="pf-mod-log">${rows}</ol>` : '<p class="lb-empty">עוד אין פעולות.</p>'}<div class="pf-mod-more">${next}</div>`;
}
function logData(x) {
  const d = x.data || {};
  if (x.action === 'ban') return ` · ${esc(d.days ? `${d.days} ימים` : 'לצמיתות')} · ${esc(d.reason || '')}${d.rooms ? ` · יצא מ־${+d.rooms} חדרים` : ''}`;
  if (x.action === 'give') return ` · ${+d.amount} ⚡`;
  if (x.action === 'kick_room') return ` · <bdi dir="ltr">${esc(d.code || '')}</bdi> · ${d.result === 'forfeit' ? 'באמצע משחק' : 'בחדר המתנה'}`;
  if (x.action === 'close_room') return ` · <bdi dir="ltr">${esc(d.code || '')}</bdi>`;
  if (x.action === 'remove_group') return ` · ${esc(d.name || '')}${d.group_deleted ? ' (הקבוצה נמחקה)' : ''}`;
  return '';
}

/* ------------------------------------------------------------------ actions */
async function onAct(b, ev) {
  const k = b.dataset.aact;
  if (k === 'tab') return showTab(b.dataset.k);
  if (k === 'player') return openPlayer(b.dataset.id, b.dataset.pre || '');
  if (k === 'close-player') { const box = $('#pfModPlayer'); if (box) box.innerHTML = ''; return undefined; }
  if (k === 'log-more') {
    const r = await A.net.adminModLog(+b.dataset.before); const { rows, next } = logHtml(r, true);
    const ol = $('.pf-mod-log'); if (ol) ol.insertAdjacentHTML('beforeend', rows); const m = $('.pf-mod-more'); if (m) m.innerHTML = next; return undefined;
  }
  if (k === 'room-chat') {
    const li = b.closest('li[data-room]'); const box = li && li.querySelector('.pf-mod-chat'); if (!box) return undefined;
    if (!box.hidden) { box.hidden = true; b.setAttribute('aria-expanded', 'false'); return undefined; }
    box.hidden = false; b.setAttribute('aria-expanded', 'true'); box.innerHTML = '<p class="lb-note">טוען…</p>';
    box.innerHTML = chatHtml(b.dataset.room, await A.net.adminRoomChat(b.dataset.room)); return undefined;
  }
  if (k === 'unban') { await A.net.adminUnban(b.dataset.id); A.sfx('click'); A.toast('ההשעיה בוטלה'); await reload(b.dataset.id); return undefined; }
  if (!confirmTap(b, ev)) return undefined;
  b.disabled = true;
  try {
    if (k === 'kick') { const r = await A.net.adminKickRoom(b.dataset.room, b.dataset.id); A.toast(r.result === 'forfeit' ? 'השחקן הוצא מהמשחק. שאר השחקנים ממשיכים.' : 'השחקן הוצא מהחדר'); }
    else if (k === 'close-room') { await A.net.adminCloseRoom(b.dataset.room); A.toast('החדר נסגר. אף אחד לא דורג.'); }
    else if (k === 'ungroup') { const r = await A.net.adminRemoveFromGroup(b.dataset.g, b.dataset.id); A.toast(r.group_deleted ? 'השחקן הוסר והקבוצה נמחקה (לא נשארו בה חברים)' : 'השחקן הוסר מהקבוצה'); }
    else if (k === 'hide') { await A.net.adminDeleteChat(+b.dataset.msg); A.toast('ההודעה הוסתרה לכולם'); }
    else if (k === 'quick-ban') { await A.net.adminBan(b.dataset.id, b.dataset.reason, 7); A.toast('השחקן הושעה לשבוע'); }
    A.sfx('click');
  } finally { if (b.isConnected) b.disabled = false; }
  await reload(b.dataset.id, b);
  return undefined;
}
async function onForm(f, ev) {
  if (f.dataset.aform !== 'ban') return;
  const err = f.querySelector('.err'); if (err) err.textContent = '';
  const reason = f.reason.value.trim();
  if (reason.length < 2) throw new Error('כתוב סיבה (לפחות 2 תווים)');
  const btn = f.querySelector('button.primary');
  if (!confirmTap(btn, ev && ev.submitter === btn ? ev : null)) return;
  const days = +f.days.value || null;
  btn.disabled = true;
  try { const r = await A.net.adminBan(f.dataset.id, reason, days); A.sfx('click'); A.toast(`השחקן הושעה ${day(r.until)}${r.rooms ? ` ויצא מ־${r.rooms} חדרים` : ''}`); }
  finally { if (btn.isConnected) btn.disabled = false; }
  await reload(f.dataset.id);
}
/** after an action: the open player card and the current tab show the server's new state */
async function reload(pid, b) {
  const card = $('.pf-mod-card'); const open = card && card.dataset.player;
  const chatBox = b && b.closest('.pf-mod-chat');
  await showTab(tab);
  if (open) await openPlayer(open);
  if (chatBox) { const li = document.querySelector(`.pf-mod-rooms li[data-room="${CSS.escape(b.dataset.room || '')}"]`); const bt = li && li.querySelector('[data-aact="room-chat"]'); if (bt) bt.click(); }
}
export const _debug = { armed: () => armed, ARM_MS, GHOST_MS };
