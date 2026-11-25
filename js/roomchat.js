// In-room chat panel of a live room (js/rooms.js mounts it in the room screen). Contract: draft
// supabase/migrations/20261126_admin_mod_chat.sql (rr_room_chat_send / _list / _report; rr_admin_room_chat / rr_admin_delete_chat /
// rr_admin_ban for the owner), docs/full-upgrade/ADMIN_CHAT.md.
//
// * The SERVER decides everything (members only, 120 chars, links / phones / e-mails / @handles / bad words refused, 5 per 10 s, 60 per
//   hour, bans). This file only shows the server's friendly Hebrew answer (js/net.js ERR) next to the input; it never pre-filters.
// * Chat never touches the game: no engine import, no driver call, its own poll (4 s while the page is visible).
// * One persistent DOM node per room (the room screen repaints itself often): the typed text, the scroll position and the focus survive.
// * Mute is per player seat of this room, on this device only (localStorage). "דווח" sends a report the owner sees in the admin panel.
// * The owner (P.isAdmin — the server checks again) sees every message with "להסתיר" and "להשעות", each needing a second tap.
// * Phones (≤ 600 px): the panel is collapsed behind a "💬 צ'אט" button with an unread badge. A tap within 320 ms of the panel
//   opening / changing is the second half of a double tap and is ignored (the ui.js ghostTap rule).
export const QUICK = Object.freeze(['בהצלחה!', 'מהלך יפה 👏', 'רגע, אני חושב/ת', 'משחק טוב 🤝']);
export const MAX_LEN = 120;
const POLL_MS = 4000;
const GHOST_MS = 320;
const ARM_MS = 4000;
const MUTE_KEY = 'rr2-chat-mute';
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
const hhmm = (ms) => safe(() => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), '');
const narrow = () => safe(() => matchMedia('(max-width: 600px)').matches, false);
/** the second tap of a double tap that landed right after the panel changed under the finger (keyboard: detail 0, never a ghost) */
const ghost = (ev, since) => !!ev && ev.detail > 0 && performance.now() - since < GHOST_MS;

function loadMutes(roomId) { return new Set(safe(() => (JSON.parse(localStorage.getItem(MUTE_KEY) || '{}')[roomId]) || [], [])); }
function saveMutes(roomId, set) {
  safe(() => { const all = JSON.parse(localStorage.getItem(MUTE_KEY) || '{}'); if (set.size) all[roomId] = [...set]; else delete all[roomId];
    const keys = Object.keys(all); if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete all[k]; localStorage.setItem(MUTE_KEY, JSON.stringify(all)); });
}

export class RoomChat {
  /** @param {{net, roomId:string, isAdmin:()=>boolean, toast:(t:string)=>void, mySeat:()=>number|null, seatName:(seat:number)=>string, sfx?:(n:string)=>void}} o */
  constructor(o) {
    Object.assign(this, { net: o.net, roomId: o.roomId, isAdmin: o.isAdmin || (() => false), toast: o.toast || (() => {}), mySeat: o.mySeat || (() => null),
      seatName: o.seatName || (() => ''), sfx: o.sfx || (() => {}) });
    this.msgs = new Map();          // id → {id, seat, nickname, text, at, me, player_id?, hidden?, reports?}
    this.last = 0; this.unread = 0; this.open = !narrow(); this.closed = null; this.busy = false; this.timer = null; this.changedAt = 0;
    this.mutes = loadMutes(this.roomId); this.reported = new Set(); this.armed = null; this.adminMode = false;
    this.el = document.createElement('section');
    this.el.className = 'rm-chat'; this.el.setAttribute('aria-labelledby', 'rmChatH');
    this.el.innerHTML = this.shell();
    this.el.addEventListener('click', (ev) => this.onClick(ev));
    this.el.addEventListener('submit', (ev) => { ev.preventDefault(); this.sendFrom(); });
    this.el.addEventListener('input', (ev) => { if (ev.target.name === 'msg') this.count(); });
    this.onVis = () => { if (!document.hidden) this.poll(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.paintOpen();
  }
  shell() {
    return `<button type="button" class="rm-chat-tog" data-chat="toggle" aria-expanded="false" aria-controls="rmChatBody"><span aria-hidden="true">💬</span> <span id="rmChatH">צ'אט החדר</span>
        <span class="rm-chat-badge" hidden aria-label="הודעות חדשות"></span></button>
      <div class="rm-chat-body" id="rmChatBody">
        <p class="rm-chat-rules">צ'אט רק לשחקני החדר. בלי קישורים, טלפונים, מיילים ושמות משתמש — ושפה נעימה 🙂</p>
        <ol class="rm-chat-list" role="log" aria-live="polite" aria-relevant="additions" aria-label="הודעות בצ'אט"></ol>
        <div class="rm-chat-quick" role="group" aria-label="משפטים מהירים">${QUICK.map((q, i) => `<button type="button" class="chip rm-chat-q" data-chat="quick" data-i="${i}">${esc(q)}</button>`).join('')}</div>
        <form class="rm-chat-form" autocomplete="off"><label class="sr" for="rmChatIn">הודעה לחדר</label>
          <input id="rmChatIn" name="msg" maxlength="${MAX_LEN}" enterkeyhint="send" placeholder="כתוב הודעה לחדר…" dir="auto">
          <button class="primary rm-chat-send" type="submit">לשלוח</button></form>
        <p class="rm-chat-st" role="status" aria-live="polite"><span class="rm-chat-err"></span><small class="rm-chat-n" aria-hidden="true"></small></p>
      </div>`;
  }
  /* ------------------------------------------------------------------ lifecycle */
  start() { if (this.timer) return; const loop = () => { this.timer = setTimeout(async () => { if (!document.hidden) await this.poll(); if (this.timer) loop(); }, POLL_MS); }; this.poll(); loop(); }
  stop() { clearTimeout(this.timer); this.timer = null; document.removeEventListener('visibilitychange', this.onVis); }
  /** (re)attach to the room screen's slot after a repaint — the node itself never changes */
  mount(slot) { if (slot && this.el.parentNode !== slot) slot.appendChild(this.el); }
  /* ------------------------------------------------------------------ data */
  async poll() {
    if (this.busy || this.closed === 'gone') return;
    this.busy = true;
    try {
      const admin = this.isAdmin() && typeof this.net.adminRoomChat === 'function';
      if (admin) {
        const list = await this.net.adminRoomChat(this.roomId);
        this.adminMode = true; const seen = new Set();
        for (const m of list || []) { seen.add(m.id); const was = this.msgs.get(m.id); this.addMsg({ ...m, me: m.seat === this.mySeat() }, !was); }
        for (const id of [...this.msgs.keys()]) if (!seen.has(id) && id <= this.last) this.msgs.delete(id);
      } else {
        const r = await this.net.roomChatList(this.roomId, this.last || null);
        for (const m of r.msgs || []) this.addMsg(m, true);
        for (const id of r.hidden || []) this.msgs.delete(id);
      }
      if (this.closed === 'error') this.closed = null;
      this.render();
    } catch (e) {
      if (e && (e.code === 'not_in_room' || e.code === 'room_not_found')) { this.closed = 'gone'; this.stop(); this.status('הצ\'אט לא זמין — אתה כבר לא בחדר הזה.'); this.render(); }
      else if (e && e.code === 'not_admin') { this.adminMode = false; }
    } finally { this.busy = false; }
  }
  addMsg(m, fresh) {
    if (!m || !Number.isFinite(+m.id)) return;
    this.msgs.set(+m.id, m); this.last = Math.max(this.last, +m.id);
    if (fresh && !m.me && !m.hidden && !this.mutes.has(m.seat) && (!this.open || document.hidden)) this.unread++;
  }
  async send(text) {
    const t = String(text || '').trim(); if (!t) return false;
    if ([...t].length > MAX_LEN) { this.status(`עד ${MAX_LEN} תווים בהודעה`); return false; }
    if (this.sending) return false; this.sending = true; this.status('');
    try {
      const r = await this.net.roomChatSend(this.roomId, t);
      this.addMsg({ id: r.id, seat: this.mySeat(), nickname: 'אני', text: t, at: r.at, me: true }, false);
      this.sfx('click'); this.render(); this.poll();
      return true;
    } catch (e) {
      const code = e && e.code;
      if (code === 'rate_limited') this.status('רגע, רגע 🙂 יותר מדי הודעות ברצף. חכה כמה שניות ונסה שוב.');
      else if (code === 'chat_closed') { this.closed = 'closed'; this.status(e.message); this.render(); }
      else if (code === 'banned') { this.closed = 'banned'; this.status(e.message); this.render(); }
      else if (code === 'not_in_room') { this.closed = 'gone'; this.status('הצ\'אט לא זמין — אתה כבר לא בחדר הזה.'); this.render(); }
      else this.status((e && e.message) || 'ההודעה לא נשלחה. נסה שוב.');
      return false;
    } finally { this.sending = false; }
  }
  async sendFrom() {
    const inp = this.el.querySelector('input[name="msg"]'); if (!inp || inp.disabled) return;
    if (await this.send(inp.value)) { inp.value = ''; this.count(); if (this.onSent) this.onSent(); }
  }
  /* ------------------------------------------------------------------ view */
  status(t) { const s = this.el.querySelector('.rm-chat-err'); if (s) s.textContent = t || ''; }
  count() { const inp = this.el.querySelector('input[name="msg"]'); const n = this.el.querySelector('.rm-chat-n'); if (inp && n) { const k = [...inp.value].length; n.textContent = k > MAX_LEN - 30 ? `${k}/${MAX_LEN}` : ''; } }
  paintOpen() {
    this.el.classList.toggle('is-open', this.open);
    const t = this.el.querySelector('.rm-chat-tog'); if (t) t.setAttribute('aria-expanded', String(this.open));
    const b = this.el.querySelector('.rm-chat-body'); if (b) b.hidden = !this.open;
    if (this.open) this.unread = 0;
    this.badge();
  }
  badge() { const b = this.el.querySelector('.rm-chat-badge'); if (!b) return; b.hidden = !this.unread; b.textContent = this.unread > 9 ? '9+' : String(this.unread); }
  render() {
    const ol = this.el.querySelector('.rm-chat-list'); if (!ol) return;
    const atEnd = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
    const list = [...this.msgs.values()].sort((a, b) => a.id - b.id).slice(-60);
    const admin = this.adminMode;
    const have = [...ol.children].map((li) => li.dataset.key);
    const want = list.length ? list.map((m) => this.key(m)) : ['empty'];
    if (want.join('|') !== have.join('|')) {
      const grow = have[0] !== 'empty' && have.length < want.length && have.every((k, i) => want[i] === k);
      if (grow) ol.insertAdjacentHTML('beforeend', list.slice(have.length).map((m) => this.msgHtml(m, admin)).join(''));   // the live region announces only the new ones
      else ol.innerHTML = list.length ? list.map((m) => this.msgHtml(m, admin)).join('') : '<li class="rm-chat-empty" data-key="empty">אין עדיין הודעות. אפשר להתחיל במשפט מהיר 👇</li>';
      while (ol.children.length > 60) ol.firstElementChild.remove();
      this.changedAt = performance.now(); if (!grow) this.armed = null;
      if (atEnd || grow) ol.scrollTop = ol.scrollHeight;
    }
    const off = !!this.closed;
    const inp = this.el.querySelector('input[name="msg"]'); if (inp) inp.disabled = off;
    for (const b of this.el.querySelectorAll('.rm-chat-q, .rm-chat-send')) b.disabled = off;
    if (this.open) this.unread = 0;
    this.badge();
  }
  key(m) { return `${m.id}:${m.hidden ? 'h' : ''}:${this.mutes.has(m.seat) ? 'm' : ''}:${this.reported.has(m.id) ? 'r' : ''}:${m.reports || 0}`; }
  msgHtml(m, admin) {
    const muted = !m.me && this.mutes.has(m.seat);
    const who = m.me ? 'אני' : esc(m.nickname || this.seatName(m.seat) || 'שחקן');
    const tools = [];
    if (!m.me) {
      tools.push(`<button type="button" class="rm-chat-a" data-chat="mute" data-seat="${+m.seat}" aria-pressed="${muted}">${muted ? '🔈 לבטל השתקה' : '🔇 להשתיק'}</button>`);
      if (!muted && !m.hidden) tools.push(this.reported.has(m.id) ? '<span class="rm-chat-done">✓ דווח</span>' : `<button type="button" class="rm-chat-a" data-chat="report" data-id="${+m.id}">🚩 דווח</button>`);
    }
    if (admin) {
      if (!m.hidden) tools.push(`<button type="button" class="rm-chat-a adm" data-chat="hide" data-id="${+m.id}" data-two="1">🙈 להסתיר</button>`);
      if (!m.me && m.player_id) tools.push(`<button type="button" class="rm-chat-a adm" data-chat="ban" data-id="${+m.id}" data-pid="${esc(m.player_id)}" data-two="1">⛔ להשעות ל-7 ימים</button>`);
    }
    const body = muted ? '<span class="rm-chat-muted">הודעה של שחקן מושתק</span>' : `<span class="rm-chat-t" dir="auto">${esc(m.text)}</span>`;
    return `<li class="rm-chat-m ${m.me ? 'me' : ''} ${m.hidden ? 'is-hidden' : ''}" data-key="${esc(this.key(m))}" data-id="${+m.id}">
      <span class="rm-chat-who"><b>${who}</b> <small>${esc(hhmm(m.at))}</small>${m.hidden ? ' <small class="rm-chat-hid">(מוסתרת)</small>' : ''}${admin && m.reports ? ` <small class="rm-chat-rep">🚩 ${+m.reports}</small>` : ''}</span>
      ${body}${tools.length ? `<span class="rm-chat-tools">${tools.join('')}</span>` : ''}</li>`;
  }
  /* ------------------------------------------------------------------ actions */
  async onClick(ev) {
    const b = ev.target.closest('[data-chat]'); if (!b || b.disabled) return;
    const k = b.dataset.chat;
    if (k === 'toggle') { this.open = !this.open; this.paintOpen(); this.changedAt = performance.now(); if (this.open) { this.render(); const ol = this.el.querySelector('.rm-chat-list'); if (ol) ol.scrollTop = ol.scrollHeight; } return; }
    if (ghost(ev, this.changedAt)) return;
    if (b.dataset.two === '1' && !this.arm(b)) return;
    try {
      if (k === 'quick') { await this.send(QUICK[+b.dataset.i]); return; }
      if (k === 'mute') { const s = +b.dataset.seat; if (this.mutes.has(s)) this.mutes.delete(s); else this.mutes.add(s); saveMutes(this.roomId, this.mutes); this.render(); return; }
      if (k === 'report') { const id = +b.dataset.id; b.disabled = true; await this.net.roomChatReport(id); this.reported.add(id); this.toast('תודה! הדיווח נשלח למנהל המשחק'); this.render(); return; }
      if (k === 'hide') { await this.net.adminDeleteChat(+b.dataset.id); const m = this.msgs.get(+b.dataset.id); if (m) m.hidden = true; this.toast('ההודעה הוסתרה לכולם'); this.render(); return; }
      if (k === 'ban') {
        const m = this.msgs.get(+b.dataset.id);
        await this.net.adminBan(b.dataset.pid, `צ'אט: ${String(m && m.text || '').slice(0, 150)}`.slice(0, 200), 7);
        this.toast(`השחקן הושעה ל-7 ימים${m ? ` (${m.nickname})` : ''}`); this.poll(); return;
      }
    } catch (e) { this.status((e && e.message) || 'לא הצלחנו. נסה שוב.'); }
  }
  /** every destructive owner action needs a second tap: the first one arms the button (4 s), the second does it */
  arm(b) {
    const now = performance.now();
    if (this.armed && this.armed.el === b && now - this.armed.at < ARM_MS) { if (now - this.armed.at < GHOST_MS) return false; this.armed = null; return true; }
    if (this.armed && this.armed.el.isConnected) { this.armed.el.textContent = this.armed.label; this.armed.el.classList.remove('armed'); }
    this.armed = { el: b, at: now, label: b.textContent };
    b.classList.add('armed'); b.textContent = `לחץ שוב לאישור: ${b.textContent.replace(/^\S+\s/, '')}`;
    setTimeout(() => { if (this.armed && this.armed.el === b) { b.textContent = this.armed.label; b.classList.remove('armed'); this.armed = null; } }, ARM_MS);
    return false;
  }
}
