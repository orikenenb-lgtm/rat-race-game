// מירוץ העכברים 2.0 — DOM layer: HUD, statement sheet, event cards (incl. the v1.1 trade window), mentor, dice,
// toasts, achievement toast, coach marks, flying coins. Generic helpers (toast/modal/confirmBox/achievementToast)
// are also used by the lobby.
import { fmt, fmtM, sgn, fmtP } from './engine.js';
import { sfx } from './audio.js';
import { reducedMotion } from './motion.js';
import { bus } from './bus.js';

const $ = (s, r = document) => r.querySelector(s);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Wrap signed ₪ amounts / percentages inside Hebrew sentences in LTR isolates (LRI…PDI) so "(+₪4,830)" stays readable. */
const NUMRE = /[+−-]?(?:[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?[KM]?|\d+(?:\.\d+)?%(?:[–-]\d+(?:\.\d+)?%)?)|[+−]\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
export const iso = (t) => String(t ?? '').replace(/→/g, '←').replace(NUMRE, (m) => '\u2066' + m.replace(/^([+−-])(?=[₪$])/, '$1\u2060') + '\u2069');
/** "≥" mirrors in RTL and confuses readers — say it in words. */
export const goalWords = (t) => String(t ?? '').replace(/הכנסה פסיבית\s*≥\s*הוצאות/g, 'הכנסה פסיבית שמכסה את ההוצאות').replace(/\s*≥\s*/g, ' של לפחות ');
/** HTML text: amounts become <span class="num"> (Rubik, LTR isolate) — T5 CR-U1 (₪ never in Secular One). Text-only callers keep iso(). */
const escI = (t) => String(esc(t)).replace(/→/g, '←').replace(NUMRE, (m) => '<span class="num">' + m.replace(/^([+−-])(?=[₪$])/, '$1⁠') + '</span>');
const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const N = (n) => Math.round(n).toLocaleString('en-US');
const HEB = /[\u0590-\u05FF]/;
/** Isolated number span; text that also contains Hebrew words is isolated RTL so it still reads right. */
const num = (s, c = '') => (HEB.test(String(s)) ? `<span class="num rtl ${c}">${iso(s)}</span>` : `<span class="num ${c}">${s}</span>`);
const pctTxt = (x) => `${Math.round(x * 100) / 100}%`;
const usdTxt = (u) => `₪${Number(u).toFixed(2)}`;
let speed = 1;
export function setSpeed(f) { speed = f; }
const vibrate = (p = 12) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };
export { vibrate };

/** Compact money for tight spots: ₪950K / ₪3.25M (exact below ₪100,000). */
export function fmtC(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) { const v = a / 1e6; return s + '₪' + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.?0+$/, '') + 'M'; }
  if (a >= 1e5) return s + '₪' + Math.round(a / 1e3) + 'K';
  if (a >= 1e4) return s + '₪' + (Math.round(a / 100) / 10) + 'K';
  return fmt(n);
}
const compact = () => innerWidth < 600;
const tiny = () => innerWidth < 420;
/** HUD money: exact on desktop, ₪16.6K on phones (₪1.6K on the narrowest ones). */
const money = (n) => (tiny() && Math.abs(n) >= 1000 ? (n < 0 ? '−' : '') + '₪' + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : (Math.round(Math.abs(n) / 100) / 10) + 'K') : compact() ? fmtC(n) : fmtM(n));
const moneyS = (n) => (Math.round(n) > 0 ? '+' : '') + money(n);

/* ============================================================ icons */
export const ICON = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.2H9.2V21H4a1 1 0 0 1-1-1z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m16 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 14h6.5L9 22l11-13h-7z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z" opacity=".25"/><path d="M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8M9 8h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  medal: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 2h8l4 12h-8zM34 2h-8l-4 12h8z" fill="#2f6fdb"/><circle cx="24" cy="30" r="15" fill="#f2b632" stroke="#c98a12" stroke-width="3"/><path d="m24 21 2.8 5.7 6.2.9-4.5 4.4 1 6.2L24 35.3 18.5 38.2l1-6.2L15 27.6l6.2-.9z" fill="#fff6d5"/></svg>',
  up: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2 11 9H1z"/></svg>',
  down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10 1 3h10z"/></svg>',
  voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

/* ============================================================ toasts */
const tq = []; let tBusy = false;
/** Short message pill under the HUD (queued). kind: ''|'gold'|'bad' */
export function toast(text, opts = {}) {
  if (!text) return;
  tq.push({ text: String(text), kind: opts.kind || '', ms: opts.ms || 0, action: opts.action || null });
  if (tq.length > 4) tq.splice(0, tq.length - 4);
  if (!tBusy) nextToast();
}
function nextToast() {
  const el = $('#toast'); if (!el) return;
  const t = tq.shift(); if (!t) { tBusy = false; return; }
  tBusy = true;
  el.textContent = iso(t.text); el.className = 'on ' + t.kind + (t.action ? ' act' : '');
  if (t.action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.textContent = t.action.label;
    b.onclick = () => { try { t.action.fn(); } catch (e) { console.error(e); } el.className = t.kind; };
    el.appendChild(b);
  }
  const ms = t.ms || Math.max(1300, Math.min(3200, 900 + t.text.length * 38)) * (tq.length ? 0.75 : 1) * (t.action ? 2.4 : 1);
  setTimeout(() => { el.className = t.kind; setTimeout(nextToast, 260); }, ms);
}

/* ============================================================ phone overlay queue (T5 / T4 §4.7, UX§4 fix 2)
   On phones (≤ 600 px) at most ONE of coach / achievement / lesson / rumour (newspaper) / verdict floats above the board.
   A coach bubble holds everything; the rest is released one by one by priority. Desktop shows them as before. */
const OVP = { achievement: 3, dream: 4, lesson: 5, rumour: 5, verdict: 6 };
const ovq = []; let ovBusy = null, ovT = 0;
const phoneQ = () => innerWidth <= 600;
const coachOpen = () => { const c = $('#coach'); return !!c && !c.hidden; };
/** show(done): paint the overlay and call done() once it is gone. Verdicts replace a queued verdict (only the newest matters). */
function overlay(kind, show) {
  if (!phoneQ()) { show(() => {}); return; }
  if (kind === 'verdict') { const i = ovq.findIndex((x) => x.kind === 'verdict'); if (i >= 0) ovq.splice(i, 1); }
  ovq.push({ kind, show, p: OVP[kind] || 9, t: performance.now() });
  ovq.sort((a, b) => a.p - b.p || a.t - b.t);
  if (ovq.length > 6) { const i = ovq.map((x) => x.kind).lastIndexOf('verdict'); ovq.splice(i >= 0 ? i : ovq.length - 1, 1); }
  pumpOv();
}
function pumpOv() {
  clearTimeout(ovT);
  if (ovBusy || !ovq.length) return;
  if (coachOpen() || (ovq[0].kind === 'verdict' && toastOn())) { ovT = setTimeout(pumpOv, 400); return; }
  const it = ovq.shift(); ovBusy = it.kind;
  let fin = false;
  const done = () => { if (fin) return; fin = true; ovBusy = null; ovT = setTimeout(pumpOv, 220); };
  try { it.show(done); } catch (e) { console.error(e); done(); }
}
const toastOn = () => { const t = $('#toast'); return !!t && t.className.includes('on'); };

const aq = []; let aBusy = false;
/** Celebratory slide-in card with sound (used for achievements and unlocks). */
export function achievementToast(a = {}) {
  aq.push(a);
  if (!aBusy) nextAch();
}
function nextAch() {
  const box = $('#achv'); if (!box) return;
  const a = aq.shift(); if (!a) { aBusy = false; return; }
  aBusy = true;
  overlay('achievement', (done) => {
    const icon = a.icon && String(a.icon).length <= 4 ? `<span class="emo" aria-hidden="true">${esc(a.icon)}</span>` : ICON.medal;
    box.innerHTML = `<div class="ach" role="status"><div class="medal">${icon}</div><div><small>${esc(a.label || 'הישג חדש!')}</small><b>${escI(a.name || '')}</b>${a.desc ? `<p>${escI(a.desc)}</p>` : ''}</div></div>`;
    const card = box.firstElementChild;
    sfx(a.sound || 'achievement'); vibrate([12, 40, 18]);
    requestAnimationFrame(() => card.classList.add('in'));
    setTimeout(() => { card.classList.remove('in'); card.classList.add('out'); setTimeout(() => { box.innerHTML = ''; done(); nextAch(); }, 380); }, 3300);
  });
}

/* ============================================================ focus trap (T4 A11Y-1/2) */
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
/** Tab / Shift+Tab cycle inside `root` while it is open. Returns release(). */
const traps = [];   // stack: only the topmost open dialog traps Tab
export function trapFocus(root) {
  if (!root) return () => {};
  traps.push(root);
  return () => { const i = traps.lastIndexOf(root); if (i >= 0) traps.splice(i, 1); };
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !traps.length) return;
  const root = traps[traps.length - 1];
  if (!root.isConnected || !root.getClientRects().length) return;
  const els = [...root.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length && !x.closest('[hidden],[inert]'));
  if (!els.length) { e.preventDefault(); return; }
  const first = els[0], last = els[els.length - 1], a = document.activeElement;
  if (!root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && (a === first || !els.includes(a) && (a.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}, true);
/** T4 A11Y-2: Escape on the topmost thing — a coach bubble = "הבנתי". (Modals handle their own Escape when dismissable.) */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (coachOpen()) { e.preventDefault(); e.stopPropagation(); hideCoach('next'); }
}, true);

/* ============================================================ generic modal (shared with the lobby) */
/**
 * modal({tag, color, title, html, actions:[{label, cls, v, fn, dis}], onExtra, onOpen, dismissable}) → Promise<v>
 * fn() returning false keeps the modal open. Clicks on non-action elements go to onExtra(e).
 */
export function modal({ tag = '', color = '#2f6fdb', title = '', html = '', actions = [{ label: 'סגירה', cls: 'primary' }], onExtra, onOpen, dismissable = false, wide = false, cls = '' } = {}) {
  const m = $('#gm'), c = $('#gmCard');
  c.className = 'card' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '');
  c.innerHTML = `${tag ? `<span class="tag" style="--c:${esc(color)}">${esc(tag)}</span>` : ''}${title ? `<h2 id="gmTitle">${escI(title)}</h2>` : ''}${html}<div class="acts">${actions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}" ${a.dis ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
  // T7 CR-31: every dialog has a name — the title, else the tag, else the first line of text
  if (title) { c.setAttribute('aria-labelledby', 'gmTitle'); c.removeAttribute('aria-label'); }
  else { c.removeAttribute('aria-labelledby'); c.setAttribute('aria-label', tag || (c.querySelector('.d') || {}).textContent?.slice(0, 80) || 'הודעה'); }
  const prevFocus = document.activeElement;
  const vd = $('#verdict'); if (vd && /\bon\b/.test(vd.className)) vd.className = vd.className.replace(/\bon\b/, '').trim(); // a dialog on top: the pill steps aside
  m.hidden = false; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  if (onOpen) try { onOpen(c); } catch (e) { console.error(e); }
  setTimeout(() => (c.querySelector('.acts button.primary:not(:disabled)') || c.querySelector('.acts button:not(:disabled)'))?.focus(), 40);
  const release = trapFocus(c);
  return new Promise((res) => {
    const close = (v) => { release(); m.hidden = true; c.onclick = null; m.onkeydown = null; try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { /* ignore */ } res(v); };
    c.onclick = (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) { if (onExtra) onExtra(e); return; }
      const a = actions[+b.dataset.i];
      sfx('click');
      if (a.fn && a.fn() === false) return;
      close(a.v);
    };
    m.onkeydown = (e) => { if (e.key === 'Escape' && dismissable) close(undefined); };
  });
}
/** Yes/no question → Promise<boolean>. */
export async function confirmBox(text, { yes = 'כן', no = 'ביטול', title = '' } = {}) {
  const v = await modal({ title, html: `<p class="d">${esc(text)}</p>`, actions: [{ label: yes, cls: 'primary', v: true }, { label: no, v: false }], dismissable: true });
  return !!v;
}

/* ============================================================ loading + theme + banner */
export function showLoading(text, p = null) {
  const el = $('#loading'); if (!el) return;
  el.hidden = false;
  const t = $('#loadText'); if (t && text != null) t.textContent = text;
  const bar = $('#loadBar'); if (bar && p != null) bar.style.width = Math.round(p * 100) + '%';
}
export function hideLoading() { const el = $('#loading'); if (el) el.hidden = true; }

/** Paint the page for a world: sky, accents, data-world. */
export function applyTheme(w) {
  const T = w.mechanic === 'history' ? { ...w.theme, sky: ['#efe2c4', '#c9b089'], accent: '#a8763e' } : w.theme, r = document.documentElement.style;
  r.setProperty('--sky1', T.sky[0]); r.setProperty('--sky2', T.sky[1]);
  r.setProperty('--accent', T.accent || '#f2b632'); r.setProperty('--accent2', T.accent2 || T.accent || '#f2b632');
  document.body.dataset.world = w.id;
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = T.sky[0];
  const n = $('#hWorldName'); if (n) n.textContent = w.name;
}
export function worldBanner(w, sub = '') {
  const el = $('#banner'); if (!el) return;
  el.innerHTML = `<small>עולם ${w.order}</small><b>${esc(w.name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  el.className = 'banner'; void el.offsetWidth; el.className = 'banner in';
  clearTimeout(el._t); el._t = setTimeout(() => { el.className = 'banner out'; }, 2300);
}

/* ============================================================ HUD */
let shownCash = null, cashRaf = 0, shownMonth = null;
const ind = { key: null, v: null, dir: 0, good: 0, t: 0 };

export function setCash(v, animate = true) {
  const el = $('#hCash'); if (!el) return;
  const from = shownCash == null ? v : shownCash; shownCash = v;
  cancelAnimationFrame(cashRaf);
  const st = el.closest('.stat');
  if (animate && from !== v) {
    st.classList.remove('up', 'down'); void st.offsetWidth; st.classList.add(v > from ? 'up' : 'down');
    const t0 = performance.now(), dur = 650 * speed;
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = money(from + (v - from) * e); if (p < 1) cashRaf = requestAnimationFrame(step); };
    cashRaf = requestAnimationFrame(step);
  } else el.textContent = money(v);
}
export function resetHud() { shownCash = null; shownMonth = null; ind.key = null; ind.v = null; ind.dir = 0; }
export function setMonth(month, max) {
  const el = $('#hMonth'); if (!el) return;
  el.innerHTML = max ? `${month}<small>/${max}</small>` : String(month);
  if (shownMonth != null && month !== shownMonth) { const st = el.closest('.stat'); st.classList.remove('tick'); void st.offsetWidth; st.classList.add('tick'); }
  shownMonth = month;
}
export function bumpCash() { const st = $('#hCash')?.closest('.stat'); if (!st) return; st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump'); }

/** ctx: {world, st} */
export function renderHUD(m, ctx, { animate = true } = {}) {
  const w = ctx.world;
  setCash(m.cash, animate);
  const cf = $('#hCf'); cf.textContent = moneyS(m.cashflow); cf.className = 'num ' + cls(m.cashflow);
  setMonth(m.month, m.mode === 'free' ? 0 : m.maxMonths);
  // world indicator
  const wi = m.worldIndicators || {}; const box = $('#hInd');
  let key = null, v = null, text = '', goodUp = 0, extra = '';
  if (wi.ymText) { key = 'ym'; v = wi.index; text = `🗞️ ${esc(wi.ymText)}${wi.index != null ? ` · מדד ${num(Math.round(wi.index))}` : ''}`; goodUp = 1; }
  else if (w.mechanic === 'rate') { key = 'rate'; v = wi.rate; text = `ריבית ${num(pctTxt(wi.rate))}`; goodUp = -1; }
  else if (w.mechanic === 'fx') {
    key = 'usd'; v = wi.usd; text = `דולר ${num(usdTxt(wi.usd))}`;
    goodUp = (wi.exposure && wi.exposure.cf) ? Math.sign(wi.exposure.cf) : 0;
    const hedged = (m.assets || []).some((a) => a.hedgedUntil);
    const insured = (wi.insuredUntil || 0) >= m.month;
    if (hedged || insured) extra = `<span class="hedge" title="${hedged ? 'יש נכסים מגודרים' : 'המשלוחים מבוטחים'}">${ICON.shield}${hedged ? 'מגודר' : 'מבוטח'}</span>`;
  } else if (w.mechanic === 'angel') { key = 'impact'; v = wi.impact; text = `השפעה ${num(`${wi.impact}/${wi.impactTarget}`)}`; goodUp = 1; }
  if (key) {
    if (ind.key === key && ind.v != null && v !== ind.v) { ind.dir = Math.sign(v - ind.v); ind.good = goodUp ? ind.dir * goodUp : 0; ind.t = performance.now(); }
    if (ind.key !== key) { ind.dir = 0; }
    ind.key = key; ind.v = v;
    const fresh = ind.dir && performance.now() - ind.t < 8000;
    const arrow = fresh ? `<i class="arr ${ind.good > 0 ? 'pos' : ind.good < 0 ? 'neg' : 'neu'}" aria-label="${ind.dir > 0 ? 'עלייה' : 'ירידה'}">${ind.dir > 0 ? ICON.up : ICON.down}</i>` : '';
    box.innerHTML = `${text}${arrow}${extra}`;
    box.hidden = false;
  } else { box.innerHTML = ''; box.hidden = true; }
  $('#hWorld').classList.toggle('noind', !key);
  renderLife(m, ctx);
  // goal meter (updated in place so the bars animate)
  const g = $('#hGoal');
  const label = m.goalType === 'passive' ? 'מד החופש' : m.goalType === 'netWorth' ? 'שווי נקי' : m.goalType === 'benchmark' ? 'מול "קנה והחזק"' : 'יעד העולם';
  const parts = m.goalParts || [];
  const pc = shownPct(m);
  const sig = m.goalType + parts.length;
  if (g.dataset.sig !== sig) {
    g.dataset.sig = sig;
    g.innerHTML = `<div class="gl"><span>${label}</span><b class="num"></b></div>` +
      parts.map((p) => `<div class="gbar" title="${esc(p.label)}"><s></s><i></i>${parts.length > 1 ? `<em>${p.key === 'impact' ? 'השפעה' : 'שווי'}</em>` : ''}</div>`).join('') +
      '<div class="gsub num"></div>';
  }
  g.querySelector('.gl b').textContent = pc + '%';
  const bars = g.querySelectorAll('.gbar');
  parts.forEach((p, i) => {
    const b = bars[i]; if (!b) return;
    b.querySelector('i').style.width = Math.max(2, Math.round(p.progress * 100)) + '%';
    const pend = p.key === 'impact' && wi.impactPending ? Math.min(100, ((p.value + wi.impactPending) / Math.max(1, p.target)) * 100) : 0;
    b.querySelector('s').style.width = pend + '%';
  });
  const gh = m.goalHold && m.goalType !== 'benchmark' && m.goalHold.streak > 0 && m.goalHold.streak < m.goalHold.need ? ` · ⏳ מחזיק ${m.goalHold.streak}/${m.goalHold.need}` : '';
  g.querySelector('.gsub').textContent = parts.map((p) => p.key === 'impact' ? `${N(p.value)}/${N(p.target)}${wi.impactPending ? ` (+${wi.impactPending} בדרך)` : ''}` : `${money(p.value)} / ${money(p.target)}`).join(' · ') + gh;
  g.setAttribute('aria-label', label);
  // T7 CR-01: a role=meter needs its value
  g.setAttribute('aria-valuemin', '0'); g.setAttribute('aria-valuemax', '100'); g.setAttribute('aria-valuenow', String(pc));
  g.setAttribute('aria-valuetext', `${pc}%${parts.length > 1 ? ' (הפס החלש מבין השניים)' : ''}`);
  g.classList.toggle('done', pc >= 100);
  // the mentor's level next to its name (T2 §15.1 "show metrics().mentor.label")
  const mb = $('#mentor .mt>b');
  if (mb && m.mentor) { const t = `אבא עשיר · ${m.mentor.label}`; if (mb.dataset.t !== t) { mb.dataset.t = t; mb.innerHTML = `אבא עשיר <small class="mlv">· ${esc(m.mentor.label)}</small>`; } }
  // T4 §4.3 gradual reveal (ctx.isRevealed = onboard.isRevealed; true for every key outside a tutorial game)
  const rev = ctx && ctx.isRevealed;
  if (rev) {
    const set = (k, el) => { if (!el) return; el.hidden = !rev(k); revealPulse(k, el); };
    set('cf', $('#hCf')?.closest('.stat')); set('goal', g); set('sheet', $('#sheetBtn'));
    set('tools', $('#turboBtn')); if ($('#camBtn')?.dataset.kind === '3d') set('tools', $('#camBtn'));
  }
  injectHelp();
}
/** T4 CR-U-T4-4 (F4): the ❓ button — first child of .htools; game.js + onboard.help() answer bus 'onboard:help'. */
let helpDone = false;
function injectHelp() {
  if (helpDone) return; const tools = $('.htools'); if (!tools) return; helpDone = true;
  if ($('#helpBtn')) return;
  const b = document.createElement('button'); b.id = 'helpBtn'; b.className = 'ibtn'; b.type = 'button'; b.setAttribute('aria-label', 'איך משחקים'); b.title = 'איך משחקים · רמת המנטור'; b.textContent = '❓';
  b.onclick = () => { sfx('click'); bus.emit('onboard:help'); };
  tools.insertBefore(b, tools.firstChild);
  // phones: the same button in the mentor bar (the HUD's first row has no room for a 4th tool next to the money stats)
  const vb = $('#voiceBtn');
  if (vb && !$('#helpBtnM')) { const b2 = b.cloneNode(true); b2.id = 'helpBtnM'; b2.className = 'ibtn sm'; b2.onclick = b.onclick; vb.insertAdjacentElement('beforebegin', b2); }
}

/** % shown to the player = the weakest goal part (goalProgress itself carries a ranking offset since v2.1). */
function shownPct(m) {
  const parts = m.goalParts || [];
  const p = parts.length ? Math.min(...parts.map((x) => x.progress)) : (m.goalProgress || 0);
  return Math.max(0, Math.min(100, Math.floor(p * 100)));
}

/* ============================================================ v3 life row (age · energy · happiness · credit · inflation) */
const BAND_CLS = { 'מצוין': 'pos', 'טוב': 'pos', 'בינוני': '', 'חלש': 'neg', 'גרוע': 'neg' };
function renderLife(m, ctx) {
  const box = $('#hLife'); if (!box) return;
  const L = m.life;
  if (!L) { box.hidden = true; document.body.classList.remove('has-life'); return; }
  box.hidden = false; document.body.classList.add('has-life');
  const en = Math.round(L.energy ?? 0), hp = Math.round(L.happiness ?? 0);
  const enc = en < 25 ? 'neg' : en < 50 ? 'warn' : 'pos';
  const hpe = hp >= 75 ? '😄' : hp >= 60 ? '🙂' : hp >= 40 ? '😐' : hp >= 25 ? '🙁' : '😣';
  // inflation: the engine's figure is LAST year's (or the long-run expectation in year one) — never a pre-drawn future value
  const infl = L.inflationYear != null ? Math.round(L.inflationYear * 10) / 10 : null;
  const F = m.focus, X = m.econ;
  const fIcon = F ? (F.opsOpen ? '🏪' : FOCUS_ICON[F.current.id] || '🎯') : '';
  box.innerHTML = `<button class="lc age" data-life="age" title="גיל"><span>🎂</span><b class="num">${Math.floor(L.age)}</b></button>
    <button class="lc en ${enc}" data-life="energy" title="כוח (${en}/100)"><span>🔋</span><i class="mb"><i style="width:${Math.max(3, en)}%"></i></i><b class="num">${en}</b></button>
    <button class="lc hp" data-life="happy" title="אושר (${hp}/100)"><span>${hpe}</span><b class="num">${hp}</b></button>
    <button class="lc cr ${BAND_CLS[L.creditBand] ?? ''}" data-life="credit" title="דירוג אשראי: ${esc(L.creditBand || '')}"><span>🏦</span><b class="num">${L.creditScore ?? '—'}</b></button>
    ${infl != null ? `<button class="lc cpi" data-life="cpi" title="${L.inflationLastYear != null ? 'אינפלציה בשנה שעברה' : 'אינפלציה צפויה'}"><span>🛒</span><b class="num">${infl}%</b></button>` : ''}
    ${m.emergency ? `<button class="lc fund ${m.emergency.covered ? 'pos' : ''}" data-life="fund" title="קרן חירום: ${m.emergency.months} חודשי הוצאות"><span>🛟</span><b class="num">${m.emergency.months}</b></button>` : ''}
    <button class="lc plan" data-life="plan" title="התוכנית החודשית — לשנות"><span>${PLAN_ICON[L.plan] || '📅'}</span><b>${esc(L.planLabel || '')}</b></button>
    ${F ? `<button class="lc focus ${F.opsOpen ? 'ops' : ''} ${F.current.id !== 'none' ? 'on' : ''}" data-life="focus" aria-label="${F.opsOpen ? 'לפתוח את לוח העסק' : `מוקד החודש: ${esc(F.current.label)}`}" title="מוקד החודש"><span aria-hidden="true">${fIcon}</span><b>${esc(F.opsOpen ? 'לוח העסק' : F.current.id === 'none' ? 'מוקד' : F.current.label)}</b></button>` : ''}
    ${X ? `<button class="lc econ t${X.trend > 0 ? 'u' : X.trend < 0 ? 'd' : 'f'}" data-life="econ" aria-label="מד הכלכלה: ${esc(X.label)}, ${X.signal} מתוך 100" title="${esc(X.text || 'מד הכלכלה')}">${gaugeSvg(X.signal, 26)}<b>${esc(X.label)}</b><i class="tr" aria-hidden="true">${X.trend > 0 ? '↗' : X.trend < 0 ? '↘' : '→'}</i>${X.sharp ? '<i class="sh" aria-hidden="true">🔬</i>' : ''}</button>` : ''}`;
  const rev = ctx && ctx.isRevealed;
  if (rev) for (const [k, sel] of [['age', '.lc.age'], ['energy', '.lc.en'], ['happy', '.lc.hp'], ['credit', '.lc.cr'], ['cpi', '.lc.cpi'], ['fund', '.lc.fund'], ['plan', '.lc.plan'], ['focus', '.lc.focus'], ['focus', '.lc.econ']]) {
    const el = box.querySelector(sel); if (el) { el.hidden = !rev(k); revealPulse(k, el); }
  }
}
const FOCUS_ICON = { scout: '🔍', debt: '🏦', ops: '🏪', frugal: '✂️', network: '🤝', research: '📊', none: '🎯' };
const FOCUS_ICON_ID = { search: '🔍', bank: '🏦', shop: '🏪', scissors: '✂️', people: '🤝', gauge: '📊', calendar: '📅' };
/** Semicircle gauge 0–100 with a needle at `signal` (decorative: the label next to it carries the meaning). */
function gaugeSvg(signal, w = 26) {
  const s = Math.max(0, Math.min(100, +signal || 0)); const a = Math.PI * (1 - s / 100);
  const cx = 20, cy = 20, r = 16, nx = cx + Math.cos(a) * (r - 3), ny = cy - Math.sin(a) * (r - 3);
  const arc = (from, to, c) => { const p0 = Math.PI * (1 - from / 100), p1 = Math.PI * (1 - to / 100); return `<path d="M${cx + Math.cos(p0) * r} ${cy - Math.sin(p0) * r}A${r} ${r} 0 0 1 ${cx + Math.cos(p1) * r} ${cy - Math.sin(p1) * r}" stroke="${c}" stroke-width="5" fill="none"/>`; };
  return `<svg class="gauge" viewBox="0 0 40 23" width="${w}" height="${Math.round(w * 23 / 40)}" aria-hidden="true">${arc(0, 33, 'var(--red)')}${arc(33, 62, '#d6a01e')}${arc(62, 100, 'var(--green)')}<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.6" fill="var(--ink)"/></svg>`;
}
/* T4 §4.3: a HUD part that becomes visible pulses once (.t4-new) and is announced in #a11yLive (S-R0) */
const REVEAL_NAME = { cf: 'תזרים חודשי', energy: '🔋 כוח', goal: 'מד החופש', plan: 'התוכנית החודשית', sheet: 'הדוח שלי', fund: '🛟 קרן חירום', happy: '😊 אושר', credit: '🏦 דירוג אשראי', age: '🎂 גיל', cpi: '🛒 אינפלציה', zr: '⚡ זריקות', tools: 'כלים', focus: 'מוקד החודש', next: 'המטרה הבאה' };
const revealState = new Map();
function revealPulse(key, el) {
  const was = revealState.get(key), now = !el.hidden;
  revealState.set(key, now);
  if (was === false && now) {
    if (!reduced()) { el.classList.remove('t4-new'); void el.offsetWidth; el.classList.add('t4-new'); setTimeout(() => el.classList.remove('t4-new'), 700); }
    if (REVEAL_NAME[key]) announce(`נוסף לתצוגה: ${REVEAL_NAME[key]}`);
  }
}
/* T4 A11Y-8: one visually hidden live region; at most one message per 2 s (queued) */
const liveQ = []; let liveT = 0;
export function announce(text) {
  if (!text) return;
  let el = $('#a11yLive');
  if (!el) { el = document.createElement('div'); el.id = 'a11yLive'; el.className = 'sr'; el.setAttribute('aria-live', 'polite'); el.setAttribute('role', 'status'); document.body.appendChild(el); }
  liveQ.push(String(text)); if (!liveT) pumpLive();
}
function pumpLive() { const el = $('#a11yLive'); const t = liveQ.shift(); if (!el || t == null) { liveT = 0; return; } el.textContent = t; liveT = setTimeout(pumpLive, 2000); }
/** Details popover for a life chip (tap). */
export function lifeDetails(kind, m, extra = {}) {
  const L = m.life || {}; const p = m.payslip || {}; const e = m.emergency || {};
  const T = {
    age: ['הגיל שלך', `${esc(L.ageText || Math.floor(L.age))}. כל חודש במשחק הוא חודש בחיים.${L.freeTimeMonths ? ` עד עכשיו היו לך ${L.freeTimeMonths} חודשים של זמן חופשי.` : ''}`],
    energy: ['🔋 כוח', `🔋 כוח: ${Math.round(L.energy)} מתוך 100. זה הכוח של הדמות בסיפור — לא ⚡ זריקות. שעות נוספות, לימודים ועסק צדדי שוחקים; מנוחה ומשפחה ממלאות. מתחת ל־25 — סכנת שחיקה: חודש בלי משכורת.`],
    happy: ['אושר', `${Math.round(L.happiness)}/100${L.happinessBase != null && Math.round(L.happinessBase) !== Math.round(L.happiness) ? ` (מתוכם ${Math.round(L.happiness - L.happinessBase)} מ"צעצועים" — וזה דועך)` : ''}. ל־★★★ צריך גם לצאת מהר וגם אושר של לפחות 60.`],
    credit: ['דירוג אשראי', `${L.creditScore} — ${esc(L.creditBand || '')}. הלוואות כפויות ואשראי לא משולם מורידים; החזר בזמן מעלה. הדירוג קובע את הריבית שלך${L.loanPctAdj ? ` (כרגע ${iso((L.loanPctAdj > 0 ? '+' : '') + L.loanPctAdj + '%')})` : ''}.`],
    cpi: ['אינפלציה', `${L.inflationLastYear != null ? `בשנה שעברה המחירים עלו ב־${iso(L.inflationLastYear + '%')}.` : `בשנה הראשונה עוד אין נתון: הצפי הוא בערך ${iso(L.inflationYear + '%')} בשנה.`} המזומן שלך שווה היום ${iso(fmtM(L.realCash ?? m.cash))} במחירים של תחילת המשחק. כסף שלא עובד — מתכווץ.${extra.inflReality ? `<br><span class="reality">${escI(extra.inflReality)}</span>` : ''}`],
    fund: ['🛟 קרן חירום', `${esc(e.text || '')} (${iso(fmtM(e.balance || 0))}). כשנגמר המזומן, הקרן משלמת לפני שהבנק נותן הלוואה כפויה — ומשבר שמכוסה לא פוגע באושר. ל־★★★ צריך לפחות ${e.target || 3} חודשים. להפקיד: ביום המשכורת, או ב"הדוח שלי".`],
  }[kind];
  return T;
}

/* ============================================================ statement sheet */
function payslipHtml(m, ctx) {
  const p = m.payslip; if (!p || !p.gross) return '';
  const L = m.life || {};
  const hist = (ctx.st && ctx.st.ui && ctx.st.ui.pensionHist) || [];
  const pctU = (x) => (x == null ? null : x > 1 ? x / 100 : x);
  const eff = pctU(p.effectiveTaxRate), marg = pctU(p.marginalRate);
  const lines = (p.lines && p.lines.length ? p.lines.filter((x) => !/^נטו/.test(x.label)) : [
    { label: 'ברוטו', amount: p.gross }, p.overtime ? { label: 'שעות נוספות', amount: p.overtime } : null,
    { label: 'מס הכנסה', amount: -p.incomeTax }, { label: 'ביטוח לאומי ובריאות', amount: -p.bl }, { label: 'פנסיה (6% שלך)', amount: -p.pensionEmployee },
  ].filter(Boolean));
  return `<details class="slip" open><summary><span>🧾 התלוש שלך</span><b class="num">${fmtM(p.net)} נטו</b></summary>
    <div class="slipb">${lines.map((x) => row(escI(x.label), (x.amount > 0 && x !== lines[0] ? '+' : '') + fmtM(x.amount), x.amount < 0 ? 'neg' : '')).join('')}
    <div class="row net"><b>נטו לחשבון</b><b class="num pos">${fmtM(p.net)}</b></div>
    ${eff != null ? `<p class="note">מס אפקטיבי ${iso(Math.round(eff * 1000) / 10 + '%')} · מדרגת המס שלך ${iso(Math.round((marg || 0) * 100) + '%')} — מכל שקל נוסף בברוטו, זה החלק שהולך למס הכנסה (ועוד ביטוח לאומי ופנסיה).</p>` : ''}
    ${p.employerPension ? `<p class="note">המעסיק מפקיד עוד ${num(fmtM(p.employerPension))} לפנסיה${p.severanceDeposit ? ` ו־${num(fmtM(p.severanceDeposit))} לפיצויים` : ''} — זה הכסף שלך, גם אם לא רואים אותו בעו"ש.</p>` : ''}
    ${realityLine(p)}</div></details>
    ${L.pension != null ? `<div class="wbox pens"><div class="wl"><span>🏝️ קרן הפנסיה שלך</span><b class="num">${fmtM(L.pension)}</b></div>${hist.length > 1 ? spark(hist, { color: 'var(--green)', w: 300, h: 34 }) : ''}<p class="note">גדלה כל חודש מהפקדות ומהתשואה — ריבית דריבית. לא מזומן, אבל נספרת בשווי הנקי.</p></div>` : ''}
    ${L.realCash != null ? `<div class="wbox"><div class="wl"><span>🛒 ${L.inflationLastYear != null ? `אינפלציה בשנה שעברה: ${iso(L.inflationLastYear + '%')}` : `אינפלציה צפויה: ${iso((L.inflationYear ?? 0) + '%')} בשנה`}</span><b class="num">מדד ${(L.cpi ?? 1).toFixed(3)}</b></div>
      ${row('מזומן (נומינלי)', fmtM(m.cash))}${row('מזומן בכסף של היום הראשון (ריאלי)', fmtM(L.realCash), L.realCash < m.cash ? 'neg' : '')}${L.realNetWorth != null ? row('שווי נקי ריאלי', fmtM(L.realNetWorth)) : ''}</div>` : ''}`;
}
/** 🛟 emergency fund (m.emergency — engine numbers only) + move money in / out (E.moveSavings via data-act) */
function fundHtml(m) {
  const e = m.emergency; if (!e) return '';
  const tgt = e.target || 3; const p = Math.min(100, (e.months / tgt) * 100);
  return `<div class="wbox fund ${e.covered ? 'ok' : ''}"><div class="wl"><span>🛟 קרן חירום</span><b class="num">${num(String(e.months))} <small>מתוך ${tgt} חודשי הוצאות</small></b></div>
    <div class="track"><i style="width:${Math.max(1, p)}%"></i></div>
    <p class="note">${fmtM(e.balance || 0)} בצד${e.rate ? ` · ריבית ${iso(e.rate + '%')} בשנה` : ''}. כשנגמר המזומן — הקרן משלמת לפני שהבנק נותן הלוואה כפויה. ${e.covered ? 'יש לך כרית — ★★★ אפשרי.' : `ל־★★★ צריך לפחות ${tgt} חודשי הוצאות בצד.`}</p>
    <div class="loans"><button data-act="save" ${m.cash > 0 ? '' : 'disabled'}>להפקיד לקרן</button><button data-act="unsave" ${e.balance > 0 ? '' : 'disabled'}>למשוך מהקרן</button></div></div>`;
}
/** side hustle: reported to the tax authority? (st.life.sideReport, read-only) */
function sideHtml(m, st) {
  const L = st && st.life; if (!L || !(L.plan === 'side' || (L.side && L.side.total > 0))) return '';
  if (L.sideReport) return '<p class="note">🧾 העסק הצדדי מדווח: מקדמות מס יורדות כל חודש, בלי קנס בסוף השנה.</p>';
  return `<div class="wbox"><div class="wl"><span>🧾 העסק הצדדי לא מדווח</span></div><p class="note">המס מצטבר לסוף השנה${L.sideTaxDue ? ` (כרגע ${iso(fmtM(L.sideTaxDue))})` : ''}, ואם לא מסדרים במשבצת מס הכנסה — עוד 10% קנס.</p><div class="loans"><button data-act="report">לפתוח תיק ולשלם מקדמות</button></div></div>`;
}
/** compact projection range (m.index.projection): never a promised return */
function projLine(P) {
  if (!P || !P.p50) return '';
  return `<p class="note">${num(fmtM(P.monthly))} בחודש למשך ${P.years} שנה: בין ${num(fmtC(P.p10))} ל־${num(fmtC(P.p90))} (באמצע ${num(fmtC(P.p50))}; שמת ${num(fmtC(P.contributed))}). ${escI(P.note || '')}</p>`;
}
/** "freedom must hold": goal met on GOAL_HOLD consecutive paydays (m.goalHold) */
function holdLine(m) {
  const g = m.goalHold; if (!g || !g.need) return '';
  if (g.streak > 0 && g.streak < g.need) return `<p class="hold">⏳ היעד מתקיים! הוא צריך להחזיק ${g.need} ימי משכורת ברצף: ${g.streak}/${g.need}</p>`;
  return '';
}
function spark(hist, { color = 'currentColor', w = 120, h = 30 } = {}) {
  if (!hist || hist.length < 2) return '';
  const mn = Math.min(...hist), mx = Math.max(...hist), span = mx - mn || 1;
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * (w - 4) + 2},${h - 3 - ((v - mn) / span) * (h - 6)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
const row = (a, b, c = '') => `<div class="row"><span>${a}</span>${num(b, c)}</div>`;

/** ctx: {world, st, busy} */
export function renderSheet(m, ctx) {
  const el = $('#sheet'); if (!el) return;
  const w = ctx.world, st = ctx.st, wi = m.worldIndicators || {};
  const top = el.scrollTop;
  const goalTitle = m.goalType === 'passive' ? 'מד החופש' : 'יעד העולם';
  const hold = m.goalType !== 'benchmark' && m.goalHold && m.goalHold.need > 1 ? ` היעד צריך להחזיק ${m.goalHold.need} ימי משכורת ברצף.` : '';
  const goalHelp = (m.goalType === 'benchmark' ? `היעד: ${escI(goalWords(w.goalLabel))}. בסוף התקופה משווים לשווי של משקיע שקנה מדד והחזיק.` : m.goalType === 'passive' ? 'הכנסה פסיבית מול הוצאות. כשהפס מתמלא — יצאת מהמירוץ.' : m.goalType === 'netWorth' ? `היעד: ${escI(goalWords(w.goalLabel))}. שווי נקי = כל מה שיש לך פחות כל מה שאתה חייב.` : `היעד: ${escI(goalWords(w.goalLabel))}. צריך את שניהם.`) + hold;
  let world = '';
  if (w.mechanic === 'rate') {
    world = `<div class="wbox"><div class="wl"><span>ריבית במשק</span><b class="num">${pctTxt(wi.rate)}</b></div>${spark(wi.rateHist, { color: 'var(--accent)' })}
      <p class="note">הלוואה בנקאית עולה ${num(pctTxt(wi.loanPct))} בחודש. משכנתא משתנה זזה עם הריבית; קבועה ננעלת על הריבית ועוד ${num(pctTxt(wi.fixedPremium))}.</p></div>`;
  } else if (w.mechanic === 'fx') {
    const ex = wi.exposure || { cf: 0, value: 0 };
    world = `<div class="wbox"><div class="wl"><span>שער הדולר</span><b class="num">${usdTxt(wi.usd)}</b></div>${spark(wi.usdHist, { color: 'var(--accent)' })}
      <p class="note">אם הדולר יעלה ב־10%: תזרים ${num(sgn(ex.cf), cls(ex.cf))} בחודש, שווי ${num(sgn(ex.value), cls(ex.value))}.${(wi.insuredUntil || 0) >= m.month ? ` המשלוחים מבוטחים עד חודש ${wi.insuredUntil}.` : ''}</p>
      ${wi.gold ? `<div class="row"><span>מחיר זהב (אונקייה)</span>${num(fmtM(wi.gold))}</div>` : ''}</div>`;
  } else if (w.mechanic === 'angel') {
    world = `<div class="wbox"><div class="wl"><span>נקודות השפעה</span><b class="num">${wi.impact}/${wi.impactTarget}</b></div>
      <div class="track"><i style="width:${Math.min(100, (wi.impact / Math.max(1, wi.impactTarget)) * 100)}%"></i></div>
      <p class="note">${wi.impactPerMonth ? `+${wi.impactPerMonth} בחודש` : 'עוד אין השפעה חודשית'}${wi.impactPending ? ` · עוד ${wi.impactPending} בדרך` : ''}. ${wi.angelsActive ? `${wi.angelsActive} סטארט־אפים פעילים, שווי על הנייר ${fmtM(wi.angelPaper)}.` : 'עוד לא השקעת בסטארט־אפים.'}</p></div>`;
  }
  else if (wi.ymText) {
    world = `<div class="wbox"><div class="wl"><span>🗞️ ${esc(wi.ymText)}</span>${wi.index != null ? `<b class="num">מדד ${Math.round(wi.index)}</b>` : ''}</div>${spark(wi.indexHist, { color: 'var(--accent)' })}
      ${wi.benchmark != null ? row('המשקיע שקנה מדד והחזיק', fmtM(wi.benchmark)) : ''}${wi.rate != null ? row('ריבית בנק ישראל', iso(wi.rate + '%')) : ''}
      ${wi.reality ? `<p class="reality">${escI(wi.reality)}</p>` : ''}</div>`;
  }
  const assetRows = m.assets.map((a) => {
    const badges = [];
    if (a.golden) badges.push('<em class="b gold">זהב</em>');
    if (a.fixedRate != null && a.debt > 0) badges.push(`<em class="b">קבועה ${num(pctTxt(a.fixedRate))}</em>`);
    else if (a.variable) badges.push('<em class="b warn">משתנה</em>');
    if (a.hedgedUntil) badges.push(`<em class="b ok">מגודר עד ${a.hedgedUntil}</em>`);
    if (a.upgrades) badges.push(`<em class="b">שודרג ×${a.upgrades}</em>`);
    if (a.impact) badges.push(`<em class="b pink">+${a.impact} השפעה</em>`);
    if (a.business) badges.push(a.business.manager || a.business.incomeKind === 'passive' ? '<em class="b ok">עם מנהל · פסיבי</em>' : '<em class="b warn">אתה עובד בו · אקטיבי</em>');
    return `<div class="arow"><div><span>${esc(a.name)}</span>${badges.join('')}</div><div class="av2">${num(fmtM(a.value))}<small class="${cls(a.cf)}">${num(sgn(a.cf))} לחודש</small></div></div>`;
  }).join('');
  const holdRows = m.holdings.map((h) => `<div class="arow"><div><span>${N(h.qty)} ${esc(h.unit)} ${esc(h.ticker)}</span><small class="note">${fmtP(h.price)} ליחידה</small></div><div class="av2">${num(fmtM(h.value))}${h.div ? `<small class="pos">${num(sgn(h.qty * h.div))} לחודש</small>` : ''}</div></div>`).join('');
  const angelRows = m.angels.filter((x) => x.status === 'active').map((x) => `<div class="arow"><div><span>${esc(x.name)}</span><small class="note">${x.news ? escI(x.news) : `תוצאה עד חודש ${x.revealAt}`}</small></div><div class="av2">${num(fmtM(x.paper))}<small>על הנייר</small></div></div>`).join('');
  const totA = m.totalAssets ?? null, totL = m.totalLiabilities ?? null; // engine sums (audit D3) — the UI only displays
  const done = m.angels.filter((x) => x.status !== 'active');
  const angelDone = done.length ? `<p class="note">${done.length} השקעות נסגרו: ${done.map((x) => `${esc(x.name)} ${x.mult ? '×' + x.mult : '✗'}`).join(' · ')}</p>` : '';
  el.innerHTML = `<div class="sh-head"><div><h2>הדוח הכספי</h2><p class="sub">${esc(st.charName)} · ${esc(w.name)} · חודש ${m.month}${m.mode !== 'free' ? '/' + m.maxMonths : ''}</p></div><button class="ibtn sh-close" data-act="close" aria-label="סגירת הדוח">${ICON.close}</button></div>
  <div class="freedom"><div class="fl"><span>${esc(goalTitle)}</span><span class="num">${shownPct(m)}%</span></div>
   ${m.goalParts.map((p) => `<div class="track" title="${esc(p.label)}"><i style="width:${Math.max(1, p.progress * 100)}%"></i></div><p class="gpl"><span>${esc(p.label)}</span>${num(p.key === 'impact' ? `${N(p.value)} / ${N(p.target)}` : `${fmtM(p.value)} / ${fmtM(p.target)}`)}</p>`).join('')}
   ${holdLine(m)}<p>${goalHelp}</p></div>
  ${world}
  ${m.econ ? `<div class="wbox econbox"><div class="wl"><span>📊 מד הכלכלה</span></div>${econBlockHtml(m.econ)}</div>` : ''}
  ${payslipHtml(m, ctx)}
  ${m.index ? `<div class="wbox idx"><div class="wl"><span>📈 קרן מחקה מדד</span><b class="num">${fmtM(m.index.value || 0)}</b></div>
    ${m.index.history && m.index.history.length > 1 ? spark(m.index.history, { color: 'var(--green)', w: 300, h: 30 }) : ''}
    <p class="note">${m.index.qty ? `${N(m.index.qty)} יחידות · ${iso(fmtP(m.index.price))} ליחידה` : 'עוד לא השקעת. משעמם, זול, ועובד לאורך זמן.'}${m.index.autoInvest ? ` · הוראת קבע ${iso(fmtM(m.index.autoInvest))} בחודש` : ''}${m.index.maxBuy ? ` · אפשר לקנות עד ${N(m.index.maxBuy)} יחידות` : ''}</p>
    ${projLine(m.index.projection)}
    <div class="loans"><button data-act="invest">להשקיע / למכור</button></div></div>` : ''}
  ${fundHtml(m)}
  ${m.taxes && m.taxes.total ? (() => { const t = m.taxes; return `<details class="slip"><summary><span>🏛️ מסים ששילמת עד עכשיו</span><b class="num">${fmtM(t.total)}</b></summary><div class="slipb">${t.income ? row('מס הכנסה', fmtM(t.income)) : ''}${t.bl ? row('ביטוח לאומי ובריאות', fmtM(t.bl)) : ''}${t.capGains ? row('מס רווחי הון', fmtM(t.capGains)) : ''}${t.rental ? row('מס על שכירות', fmtM(t.rental)) : ''}${t.betterment ? row('מס שבח', fmtM(t.betterment)) : ''}${t.side ? row('מס על העסק הצדדי', fmtM(t.side)) : ''}${t.business ? row('מס חברות ודיבידנד מהעסק', fmtM(t.business)) : ''}${t.savings ? row('מס על ריבית החיסכון', fmtM(t.savings)) : ''}</div></details>`; })() : ''}
  ${sideHtml(m, st)}
  <h3>הכנסות בחודש</h3>${m.incomeLines.map((x) => row(escI(x.label), sgn(x.amount), cls(x.amount))).join('')}
  <h3>הוצאות בחודש</h3>${m.expenseLines.map((x) => row(escI(x.label), fmtM(x.amount))).join('')}
  <div class="total"><span>תזרים חודשי</span>${num(sgn(m.cashflow), cls(m.cashflow))}</div>
  <h3>נכסים</h3><div class="arow cashrow"><div><span>מזומן</span></div><div class="av2">${num(fmtM(m.cash))}</div></div>${m.savings ? `<div class="arow cashrow"><div><span>🛟 קרן חירום (חיסכון)</span>${m.emergency ? `<small class="note">${num(String(m.emergency.months))} חודשי הוצאות${m.emergency.rate ? ` · ${num(m.emergency.rate + '%')} בשנה` : ''}</small>` : ''}</div><div class="av2">${num(fmtM(m.savings))}</div></div>` : ''}${assetRows + holdRows + angelRows}${assetRows || holdRows || angelRows ? '' : '<p class="empty">עוד אין נכסים שמכניסים כסף. נכס = משהו שמכניס כסף לכיס שלך.</p>'}${angelDone}
  ${totA != null ? row('<b>סה"כ נכסים</b>', fmtM(totA)) : ''}
  <h3>התחייבויות</h3>${m.liabilities.length ? m.liabilities.map(liabRow).join('') + (totL != null ? row('<b>סה"כ התחייבויות</b>', fmtM(totL)) : '') : '<p class="empty">אין חובות.</p>'}
  <div class="total nw"><span>שווי נקי</span>${num(fmtM(m.netWorth), cls(m.netWorth))}</div>
  ${m.netWorthTotal != null && m.netWorthTotal !== m.netWorth ? `<div class="row nwt"><span>כולל קרן הפנסיה (לא נספרת ליעד — אי אפשר למשוך אותה עכשיו)</span>${num(fmtM(m.netWorthTotal))}</div>` : ''}
  <div class="loans"><button data-act="loan" ${m.canBorrow === false ? 'disabled title="הבנק בודק שתוכל להחזיר — כרגע הוא לא ילווה לך עוד"' : ''}>לקחת הלוואה ${fmtM(m.loanUnit)}</button><button data-act="repay" ${m.canRepay ? '' : 'disabled'}>להחזיר ${fmtM(m.loanUnit)}</button>${m.credit ? `<button data-act="credit" ${m.canPayCredit ? '' : 'disabled'}>לסגור חוב אשראי</button>` : ''}</div>
  <p class="note">כל ${num(fmtM(m.loanUnit))} הלוואה עולים ${num(fmtM(m.loanUnitCost))} בחודש${m.creditPct != null ? ` · חוב אשראי: ${iso(m.creditPct + '%')} בחודש` : ''}.${m.loanRoom != null ? (m.canBorrow === false ? ' הבנק בודק שתוכל להחזיר — כרגע הוא לא ילווה לך עוד.' : ` הבנק ילווה לך עוד עד ${num(fmtM(m.loanRoom))}.`) : ''}</p>
  ${m.realWorldRates && m.realWorldRates.bankLoan && m.realWorldRates.bankLoan.text ? `<p class="reality">${m.liabilities.some((x) => x.realText || x.realWorldRate != null) ? '' : `🌍 הלוואה: ${escI(m.realWorldRates.bankLoan.text)}. `}⚠ הריביות במשחק מוגזמות בכוונה — כדי שתרגיש אותן.</p>` : ''}
  <p class="disclaimer">סימולציה חינוכית — לא ייעוץ השקעות. המספרים מפושטים; לפני החלטה בכסף אמיתי בודקים מקורות רשמיים ומתייעצים עם בעל רישיון.</p>`;
  el.scrollTop = top;
}
let sheetRelease = null;
export function toggleSheet(force) {
  const s = $('#sheet'), b = $('#sheetBack'); const open = force ?? !s.classList.contains('open');
  s.classList.toggle('open', open); b.classList.toggle('on', open);
  $('#sheetBtn')?.setAttribute('aria-expanded', String(open));
  if (sheetRelease) { sheetRelease(); sheetRelease = null; }
  if (open && innerWidth <= 820) sheetRelease = trapFocus(s);   // the bottom sheet is a dialog on phones / tablets (K-8)
  if (open) setTimeout(() => s.querySelector('.sh-close')?.focus(), 30);
}

/* ============================================================ mentor */
let typeTimer = 0, voiceOn = false, heVoice = null;
export function setVoice(on) {
  voiceOn = !!on;
  const b = $('#voiceBtn'); if (b) { b.setAttribute('aria-pressed', String(voiceOn)); b.title = voiceOn ? 'הקראה: פועלת' : 'הקראה: כבויה'; }
  if (!voiceOn) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}
export function voiceAvailable() {
  if (!('speechSynthesis' in window)) return false;
  heVoice = (speechSynthesis.getVoices() || []).find((v) => /^(he|iw)/i.test(v.lang)) || null;
  return !!heVoice;
}
if ('speechSynthesis' in window) { try { voiceAvailable(); speechSynthesis.onvoiceschanged = voiceAvailable; } catch (e) { /* ignore */ } }
function speak(t) {
  if (!voiceOn || !heVoice) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.voice = heVoice; u.lang = heVoice.lang; u.rate = 1.04; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
}
let lastMentor = '';
export function mentor(text) {
  if (!text) return;
  text = iso(String(text)); lastMentor = text;
  const el = $('#mText'), sr = $('#mSr'), box = $('#mentor');
  clearInterval(typeTimer);
  if (sr) sr.textContent = text;
  box.classList.remove('talk'); void box.offsetWidth; box.classList.add('talk');
  const t0 = performance.now(), dur = Math.min(1400, 300 + text.length * 12) * Math.max(0.6, speed);
  el.textContent = '';
  box.classList.remove('open', 'more');
  typeTimer = setInterval(() => { const n = Math.ceil(text.length * Math.min(1, (performance.now() - t0) / dur)); el.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(typeTimer); markMore(); } }, 24);
  speak(text);
}
function markMore() { const el = $('#mText'), box = $('#mentor'); if (el && box) box.classList.toggle('more', el.scrollHeight > el.clientHeight + 2); }
/** Tap on the mentor bar: finish typing, then toggle the full text (phones clamp it). */
export function finishMentor() {
  const box = $('#mentor'), el = $('#mText');
  if (el.textContent !== lastMentor) { clearInterval(typeTimer); el.textContent = lastMentor; markMore(); return; }
  const o = !box.classList.contains('open'); box.classList.toggle('open', o); box.setAttribute('aria-expanded', String(o));
  if (!o) markMore();
}
export function speakLast() { speak(lastMentor); }

/* ============================================================ dice */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function showDice(faces) {
  faces = (Array.isArray(faces) ? faces : [faces || 1]).filter(Boolean);
  const box = $('#dice'); if (!box) return;
  [...box.querySelectorAll('.die')].forEach((d, k) => {
    const n = faces[k]; d.hidden = !n; if (!n) return;
    d.querySelectorAll('i').forEach((el, i) => { el.style.visibility = PIPS[n].includes(i) ? 'visible' : 'hidden'; });
  });
  const tot = faces.reduce((a, b) => a + b, 0);
  box.setAttribute('aria-label', faces.length > 1 ? `יצא ${faces.join(' ו־')} — סה"כ ${tot}` : 'יצא ' + tot);
  box.classList.toggle('double', faces.length === 2 && faces[0] === faces[1]);
}
export const showDie = (n) => showDice([n]);
/** DOM dice after the 3D throw settled. */
export function landDice(faces) {
  const box = $('#dice'); showDice(faces);
  box.classList.remove('land'); void box.offsetWidth; box.classList.add('land');
  const tot = faces.reduce((a, b) => a + b, 0);
  $('#dieSr').textContent = (faces.length > 1 ? `יצא ${faces.join(' ו־')}, סה"כ ${tot}` : 'יצא ' + tot) + (faces.length === 2 && faces[0] === faces[1] ? ' — דאבל!' : '');
}
export function shakeDomDice(on) { const box = $('#dice'); if (box) box.classList.toggle('shaking', !!on); }
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function setRollEnabled(b) { const r = $('#roll'); if (r) { r.disabled = !b; r.classList.toggle('ready', !!b); } }
export function focusRoll() { const r = $('#roll'); if (r && !r.disabled && $('#evm').hidden && $('#gm').hidden && !lobbyOpen()) r.focus({ preventScroll: true }); }

/* ============================================================ flying coins */
let motionReduced = null;
/** game.js (T5 CR-S1) tells the UI the effective motion preference. */
export function setMotion(r) { motionReduced = !!r; }
const reduced = () => (motionReduced == null ? reducedMotion() : motionReduced);
export function flyCoins(from, n = 7) {
  const tgt = $('#hCash'); if (!tgt || !from) return;
  if (reduced()) { // T5 CR-U2 / A-23: no flyers — a 120 ms outline pulse on the cash number instead
    tgt.classList.remove('pulse'); void tgt.offsetWidth; tgt.classList.add('pulse'); setTimeout(() => tgt.classList.remove('pulse'), 160); return;
  }
  const r = tgt.getBoundingClientRect(); const tx = r.left + r.width / 2 - 11, ty = r.top + r.height / 2 - 11;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'coin'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
    const fx = from.x - 11, fy = from.y - 11;
    const dx = (Math.random() - 0.5) * 90, dy = -50 - Math.random() * 60;
    const anim = c.animate([
      { transform: `translate(${fx}px,${fy}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${fx + dx}px,${fy + dy}px) scale(1.05)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${tx}px,${ty}px) scale(.55)`, opacity: 0.95 },
    ], { duration: (680 + i * 35) * Math.max(0.6, speed), delay: i * 55 * speed, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
    anim.onfinish = () => { c.remove(); if (i === 0) bumpCash(); };
  }
}

/* ============================================================ coach marks */
let coachRes = null;
/** Spotlight a target and explain it. Resolves 'next' | 'skip'. The target stays clickable. */
export function coach({ target, title, text, step, total, label = 'הדרכה', skipLabel = 'דלג על ההדרכה' }) {
  hideCoach();
  return new Promise((res) => {
    const el = $('#coach'); const t = typeof target === 'string' ? $(target) : target;
    if (!el || !t || !t.getClientRects().length) { res('next'); return; }
    coachRes = res;
    const card = t.closest('#evCard');
    try { t.scrollIntoView({ block: card ? 'center' : 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ }
    const place = () => {
      const r = t.getBoundingClientRect();
      const bw = Math.min(330, innerWidth - 24);
      let pos;
      if (card) {
        // never cover the card's numbers: beside the card on wide screens, pinned to the top (over the HUD) on phones
        const cr = card.getBoundingClientRect();
        if (cr.left - 24 >= bw) pos = `top:${Math.round(Math.max(12, Math.min(innerHeight - 260, r.top - 40)))}px;left:${Math.round(cr.left - bw - 18)}px`;
        else if (innerWidth - cr.right - 24 >= bw) pos = `top:${Math.round(Math.max(12, Math.min(innerHeight - 260, r.top - 40)))}px;left:${Math.round(cr.right + 18)}px`;
        else pos = `top:8px;left:${Math.round((innerWidth - bw) / 2)}px`;
      } else {
        const below = r.top < innerHeight / 2;
        pos = `${below ? `top:${r.bottom + 14}px` : `bottom:${innerHeight - r.top + 14}px`};left:${Math.round(Math.min(innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2)))}px`;
      }
      el.innerHTML = `<div class="ring" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
        <div class="bubble" role="dialog" aria-label="${esc(title)}" style="${pos};width:${bw}px">
        <small>${esc(label)} ${step}/${total}</small><b>${esc(title)}</b><p>${escI(text)}</p>
        <div class="acts"><button class="primary" data-c="next">הבנתי</button><button class="chip" data-c="skip">${esc(skipLabel)}</button></div></div>`;
    };
    place(); el.hidden = false; el._place = place;
    if (phoneQ()) { const vd = $('#verdict'); if (vd && vd.className.includes('on')) vd.className = vd.className.replace(/\bon\b/, '').trim(); } // one overlay at a time on phones
    el.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; const v = b.dataset.c; hideCoach(v); };
    setTimeout(() => el.querySelector('[data-c="next"]')?.focus({ preventScroll: true }), 60);
  });
}
export function hideCoach(v = 'next') {
  const el = $('#coach'); if (el) { el.hidden = true; el.innerHTML = ''; el._place = null; }
  if (coachRes) { const r = coachRes; coachRes = null; r(v); }
  pumpOv();
}
addEventListener('resize', () => { const el = $('#coach'); if (el && !el.hidden && el._place) el._place(); });

/* ============================================================ event cards */
let evState = null, evRelease = null;
export function isEventOpen() { return !!evState; }
const ddLevel = (ev) => (ev && ev.data && ev.data.dd ? ev.data.dd.level : -1);

/**
 * Open an engine event as a card. onChoose(optionId, params) is called on every decision; the game calls
 * ctl.update(nextEvent) for multi-step events (trade, sell list, inspections) and ctl.close() when done.
 * ctx.api (optional, game.js): {mentor() → metrics().mentor, hint() → E.requestHint result (counted + saved by the game),
 *   impact(ref) → E.impactFor, focus() → open the focus picker from a payday / education card}. The UI computes no money.
 */
export function openEvent(ev, ctx, onChoose) {
  const m = $('#evm'), c = $('#evCard');
  evState = { ev, ctx, onChoose, q: 0, roi: false, hint: null, imp: { open: null, ref: null, cache: new Map() } };
  if (phoneQ()) { const vd = $('#verdict'); if (vd && /\bon\b/.test(vd.className)) vd.className = vd.className.replace(/\bon\b/, '').trim(); } // phones: the new card wins
  renderEvent(true);
  m.hidden = false;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  c.scrollTop = 0;
  c.onclick = onCardClick;
  c.oninput = (e) => { if (e.target.id === 'qs') { evState.q = +e.target.value; tradeUpd(); } };
  if (evRelease) evRelease(); evRelease = trapFocus(c);
  setTimeout(() => focusPrimary(), 60);
  return {
    update(nev) {
      if (!evState) return;
      const prev = evState.ev; evState.ev = nev; evState.imp.cache.clear();
      // a hint belongs to what was known when it was asked: an inspection (new facts) or a new card clears it
      if (evState.hint && (evState.hint.id !== nev.id || evState.hint.dd !== ddLevel(nev))) evState.hint = null;
      if (prev && prev.id !== nev.id) evState.imp.open = null;
      const keep = c.scrollTop; renderEvent(false); c.scrollTop = keep;
    },
    error(msg) { const e = c.querySelector('.err'); if (e) e.textContent = msg || ''; },
    busy(b) { c.classList.toggle('working', !!b); },
    close() { closeEvent(); },
    el: c,
  };
}
export function closeEvent() {
  const m = $('#evm'), c = $('#evCard');
  if (m) m.hidden = true;
  if (c) { c.onclick = null; c.oninput = null; }
  if (evRelease) { evRelease(); evRelease = null; }
  evState = null;
}
const lobbyOpen = () => { const st = $('#start'); return !!st && !st.hidden; };
/** Keyboard focus on open: the highlighted option at guide; with nothing highlighted (hint / pro, personal cards) the TITLE —
 *  so Enter never picks an option the player did not choose (T2 §15.2). */
function focusPrimary() {
  const c = $('#evCard'); if (!c || !evState || lobbyOpen()) return;
  const p = c.querySelector('.acts button.primary:not(:disabled), .plans button.primary:not(:disabled), .choices button.primary:not(:disabled)');
  if (p) { p.focus({ preventScroll: true }); return; }
  const t = c.querySelector('#evTitle');
  if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
  else c.querySelector('.acts button:not(:disabled)')?.focus({ preventScroll: true });
}
function onCardClick(e) {
  if (!evState) return;
  const sb = e.target.closest('[data-say]');
  if (sb) { const o = !sb.classList.contains('open'); sb.classList.toggle('open', o); sb.setAttribute('aria-expanded', String(o)); return; }
  const roi = e.target.closest('[data-roi]');
  if (roi) { evState.roi = true; const b = $('#roiBox'); if (b) b.hidden = false; roi.setAttribute('aria-expanded', 'true'); sfx('click'); hideCoach(); return; }
  if (e.target.closest('[data-hint]')) { askHint(); return; }
  const it = e.target.closest('[data-imp]');
  if (it) { evState.imp.ref = it.dataset.imp; sfx('click'); paintImpact(); return; }
  if (e.target.closest('[data-focus-open]')) { sfx('click'); evState.ctx.api && evState.ctx.api.focus && evState.ctx.api.focus(); return; }
  const q = e.target.closest('[data-q]');
  if (q) { const d = evState.ev.data; const s = q.dataset.q; evState.q = s === 'max' ? d.maxBuy : s === 'all' ? d.maxSell : s === 'zero' ? 0 : evState.q + +s; sfx('click'); tradeUpd(); return; }
  const b = e.target.closest('button[data-o]');
  if (!b || b.disabled) return;
  const id = b.dataset.o;
  const opt = evState.ev.options.find((o) => o.id === id);
  sfx('click');
  if (opt && opt.needsQty) { const q2 = evState.q; if (!q2) return; evState.onChoose(id, { qty: q2 }); return; }
  evState.onChoose(id, {});
}

/* ---------- T2: mentor hint (guide / hint levels; counted by the engine, saved by the game) */
const mentorOf = () => { try { return (evState && evState.ctx.api && evState.ctx.api.mentor && evState.ctx.api.mentor()) || null; } catch (e) { return null; } };
function hintable(ev, M) {
  if (!M || M.level === 'pro' || !evState.ctx.api || !evState.ctx.api.hint) return false;
  if (ev.auto || ev.type === 'trade' || ev.type === 'intro' || (ev.type === 'mystery' && ev.data && ev.data.kind === 'quiz')) return false;
  return !!M.canHint;
}
function askHint() {
  const st = evState; if (!st) return;
  let r = null;
  try { r = st.ctx.api.hint(); } catch (e) { console.error(e); }
  if (!r || r.ok === false || !r.hint) { const e = $('#evCard .err'); if (e) e.textContent = (r && r.error) || 'אין כאן רמז'; return; }
  st.hint = { id: st.ev.id, dd: ddLevel(st.ev), res: r };
  sfx('click');
  const c = $('#evCard'); const keep = c.scrollTop; renderEvent(false); c.scrollTop = keep;
  const p = $('#hintP'); if (p) { try { p.scrollIntoView({ block: 'nearest' }); } catch (x) { /* ignore */ } }
  $('#evCard [data-hint]')?.focus({ preventScroll: true });
}
function hintBtnHtml(ev, M) {
  if (!hintable(ev, M)) return '';
  const used = M.hintsUsed || 0; const open = !!(evState.hint && evState.hint.id === ev.id);
  return `<button type="button" class="chip hintbtn ${open ? 'on' : ''}" data-hint aria-controls="hintP" aria-expanded="${open}">💡 רמז <small class="num">רמזים: ${used}</small></button>`;
}
function hintPanelHtml(ev) {
  const H = evState.hint; if (!H || H.id !== ev.id) return '<div id="hintP" class="hintp" aria-live="polite" hidden></div>';
  const h = H.res.hint; const o = h.optionId ? ev.options.find((x) => x.id === h.optionId) : null;
  return `<div id="hintP" class="hintp" aria-live="polite" tabindex="-1">
    <p class="hh"><b>💡 רמז</b>${o ? ` <span>${escI(shortLabel(o))}</span>` : ' <span>טרייד־אוף — אין כאן תשובה אחת</span>'}</p>
    <ul>${(h.reasons || []).map((t) => `<li>${escI(t)}</li>`).join('')}</ul>
    <p class="note">${escI(h.note || 'רמז לפי מה שידוע עכשיו — לא הבטחה')}</p></div>`;
}
/** after render: outline the hinted option with a dashed "רמז" badge — never the primary class */
function markHint(c, ev) {
  const H = evState.hint; if (!H || H.id !== ev.id || !H.res.hint.optionId) return;
  const b = c.querySelector(`button[data-o="${CSS.escape(H.res.hint.optionId)}"]`); if (!b) return;
  b.classList.add('hinted'); b.insertAdjacentHTML('beforeend', '<small class="hbadge" aria-hidden="true">רמז</small>');
  b.setAttribute('aria-describedby', 'hintP');
}
/** "ריבית משתנה 1% (לפי המוכר: …)" → "ריבית משתנה 1%" */
const shortLabel = (o) => String(o.label || '').replace(/\s*\([^()]*\)\s*$/, '').replace(/\s*·\s*סיכוי.*$/, '').trim() || o.label;

/* ---------- T2: impact panel ("מה זה עושה לי?") — data from E.impactFor only, cached per option for this card state */
const MAJ_ORDER = (o) => (o.kind === 'buy' || o.id === 'start' ? 0 : /^offer:/.test(o.id) ? 2 : o.kind === 'inspect' ? 3 : 1);
function majors(ev) { return ev.options.filter((o) => o.major && o.enabled).sort((a, b) => MAJ_ORDER(a) - MAJ_ORDER(b)); }
function impactPanelHtml(ev, M) {
  if (!evState.ctx.api || !evState.ctx.api.impact) return '';
  const ms = majors(ev); if (!ms.length) return '';
  const I = evState.imp;
  if (!I.ref || !ms.some((o) => o.id === I.ref)) {
    const pr = ms.find((o) => o.primary);
    I.ref = (pr || ms.find((o) => o.kind === 'buy') || ms.find((o) => o.id === 'start') || ms[0]).id;
  }
  if (I.open == null) I.open = !!(M && M.level === 'guide' && ms.some((o) => o.primary)); // guide: open for the highlighted option
  const tabs = ms.length > 1 ? `<div class="imp-tabs" role="group" aria-label="איזו אפשרות?">${ms.map((o) => `<button type="button" class="chip" data-imp="${esc(o.id)}" aria-pressed="${o.id === I.ref}">${escI(shortLabel(o))}</button>`).join('')}</div>` : '';
  return `<details class="imp" id="impP" ${I.open ? 'open' : ''}><summary><span>📊 מה זה עושה לי?</span><small>${escI(ms.length > 1 ? 'לפני שבוחרים' : shortLabel(ms[0]))}</small></summary>${tabs}<div class="imp-body" aria-live="polite">${I.open ? impactBodyFor(I.ref) : ''}</div></details>`;
}
function impactBodyFor(ref) {
  const I = evState.imp;
  if (!I.cache.has(ref)) { let v = null; try { v = evState.ctx.api.impact(ref); } catch (e) { console.error(e); } I.cache.set(ref, v); }
  return impactHtml(I.cache.get(ref));
}
function paintImpact() {
  const d = $('#impP'); if (!d || !evState) return;
  d.querySelectorAll('[data-imp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.imp === evState.imp.ref)));
  const body = d.querySelector('.imp-body'); if (body && d.open) body.innerHTML = impactBodyFor(evState.imp.ref);
}
const mo1 = (x) => (x == null || !Number.isFinite(+x) ? '—' : String(Math.round(+x * 10) / 10));
const BASIS = { expected: 'לפי הצפי — לא בטוח', branches: 'שתי אפשרויות' };
/** The impact layout (T2 §15.7): before → after summary, the main risk, then "פרטים" (fund, assumptions, two scenarios). Always the disclaimer. */
export function impactHtml(I) {
  if (!I) return '<p class="note">אין כאן נתונים להצגה כרגע.</p>';
  const tr = (label, a, b, c = '') => `<tr><th scope="row">${label}</th><td>${num(a)}</td><td>${num(b, c)}</td></tr>`;
  const rows = [tr('מזומן', fmtM(I.cashBefore), fmtM(I.cashAfter), cls(I.cashAfter - I.cashBefore)),
    tr('תזרים חודשי', sgn(I.cfBefore), sgn(I.cfAfter), cls(I.cfAfter - I.cfBefore)),
    tr('כרית (חודשים)', mo1(I.cushionMonthsBefore), mo1(I.cushionMonthsAfter), cls(I.cushionMonthsAfter - I.cushionMonthsBefore))];
  if (I.fundBefore !== I.fundAfter) rows.push(tr('קרן חירום', fmtM(I.fundBefore), fmtM(I.fundAfter), cls(I.fundAfter - I.fundBefore)));
  const P = I.power || {}, Hh = I.happiness || {};
  if (P.delta || P.perMonth) rows.push(tr('🔋 כוח', String(P.before), String(P.after) + (P.perMonth ? ` (${P.perMonth > 0 ? '+' : '−'}${Math.abs(P.perMonth)} בחודש)` : ''), cls(P.delta || P.perMonth)));
  if (Hh.delta) rows.push(tr('😊 אושר', String(Hh.before), String(Hh.after), cls(Hh.delta)));
  const liab = (I.newLiabilities || []).length ? `<p class="mh">חובות חדשים</p><ul class="liab">${I.newLiabilities.map((l) => `<li><span>${escI(l.label)}</span>${num(fmtM(l.amount))}${l.monthly ? ` <small>${num(fmtM(l.monthly))} בחודש</small>` : ''}</li>`).join('')}</ul>` : '';
  const risk = I.mainRisk ? `<p class="risk ${I.mainRisk.key === 'none' ? 'calm' : ''}">${I.mainRisk.key === 'none' ? '✓' : '⚠'} <b>הסיכון העיקרי:</b> ${escI(I.mainRisk.text)}</p>` : '';
  const br = I.branches ? `<div class="branches">${I.branches.map((x) => `<div class="brow"><div class="bl"><b class="num">${Math.round(x.p * 100)}%</b><span>${escI(x.label)}</span></div><i class="chbar"><i style="width:${Math.round(x.p * 100)}%"></i></i><small>מזומן ${num(fmtM(x.cashAfter))} · תזרים ${num(sgn(x.cfAfter))}${x.buyNet != null ? ` · אם קונים: ${num(sgn(x.buyNet))} בחודש` : ''}</small></div>`).join('')}</div>` : '';
  const S = I.scenarios;
  const col = (t, x, what) => `<div class="scol"><b>${t}</b>${row('מזומן', fmtM(x.cash))}${row('תזרים חודשי', sgn(x.cf), cls(x.cf))}${row('כרית (חודשים)', mo1(x.cushionMonths))}${x.forcedLoan > 0 ? `<p class="warn">הבנק ייתן הלוואה של ${num(fmtM(x.forcedLoan))}</p>` : ''}${what && what.length ? `<ul>${what.map((w) => `<li>${escI(w)}</li>`).join('')}</ul>` : ''}</div>`;
  const scen = S ? `<div class="scen">${col('תרחיש רגיל', S.base)}${col('תרחיש קשה (6 חודשים)', S.hard, S.hard.what)}</div>` : '';
  const assum = (I.assumptions || []).length ? `<p class="mh">הנחות</p><ul>${I.assumptions.map((a) => `<li>${escI(a)}</li>`).join('')}</ul>` : '';
  const time = I.time && I.time.note ? `<p class="note">🎓 ${escI(I.time.note)}${I.time.studyMonths ? ` (${num(String(I.time.studyMonths))} חודשים)` : ''}</p>` : '';
  const more = scen || assum || time ? `<details class="more"><summary>פרטים</summary>${time}${scen}${assum}</details>` : '';
  return `${BASIS[I.basis] ? `<p class="chipline"><em class="b">${BASIS[I.basis]}</em></p>` : ''}
    <table class="ba"><thead><tr><td></td><th scope="col">לפני</th><th scope="col">אחרי</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    ${liab}${risk}${br}${more}<p class="disc">${escI(I.disclaimer || 'זה תרחיש לפי מה שידוע עכשיו — לא תחזית ולא הבטחה.')}</p>`;
}
document.addEventListener('toggle', (e) => {   // the impact <details> opens: load the selected option's numbers (on demand only)
  if (!evState || !e.target || e.target.id !== 'impP') return;
  evState.imp.open = e.target.open;
  if (e.target.open) paintImpact();
}, true);

const PAREN_MONEY = /\s*\((?:[+−-]\u2060?)?[₪$][\d,.]+(?:\s*מיליון)?\)\s*$/;
/** "label (long explanation)" → the label on the button and the explanation as a small second line (doodad credit, tax). */
const SPLIT_PAREN = /^(.{4,}?)\s*\(([^()]{12,})\)\s*$/;
function optLabel(o, split = false) {
  if (split && !o.netLabel) { const m = SPLIT_PAREN.exec(o.label); if (m) return `<span>${escI(m[1])}</span><small class="net sub">${escI(m[2])}</small>`; }
  const base = o.netLabel ? o.label.replace(` (${o.netLabel})`, '').replace(`(${o.netLabel})`, '').replace(PAREN_MONEY, '').trim() : o.label;
  const net = o.netLabel ? `<small class="net ${cls(o.net)}">${escI(o.netLabel)}</small>` : '';
  return `<span>${escI(base)}</span>${net}`;
}
function optButtons(ev, filter = () => true, extraCls = '', split = false) {
  const opts = ev.options.filter(filter);
  const long = opts.some((o) => o.label.length > 26 || o.netLabel) || opts.length > 3;
  return `<div class="acts ${long ? 'col' : ''} ${extraCls}">${opts.map((o, i) => { const sp = split && SPLIT_PAREN.test(o.label); return `<div class="opt"><button data-o="${esc(o.id)}" class="${o.primary ? 'primary' : ''} ${o.kind === 'sell' ? 'sell' : ''} ${o.netLabel || sp ? 'hasnet' : ''}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}>${optLabel(o, split)}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${escI(o.reason)}</small>` : ''}</div>`; }).join('')}</div>`;
}
const PLAN_ICON = { work: '💼', overtime: '⏱️', study: '🎓', side: '🛠️', rest: '🌿' };
/** Effect chips: ₪ now · ₪/month × months · 😊 · 🔋 */
function effectChips(e = {}) {
  const c = [];
  if (e.cash) c.push(`<em class="fx ${cls(e.cash)}">${iso(sgn(e.cash))}</em>`);
  if (e.net != null && e.net !== 0) c.push(`<em class="fx ${cls(e.net)}">${iso(sgn(e.net))} בחודש</em>`);
  if (e.monthly) c.push(`<em class="fx ${cls(e.monthly)}">${iso(sgn(e.monthly))} בחודש${e.months ? ` × ${e.months}` : ''}</em>`);
  if (e.happiness) c.push(`<em class="fx ${cls(e.happiness)}">😊 ${iso((e.happiness > 0 ? '+' : '−') + Math.abs(Math.round(e.happiness)))}</em>`);
  if (e.glow) c.push(`<em class="fx pos">✨ ${iso('+' + Math.round(e.glow))} זמני</em>`);
  if (e.risk) c.push(`<em class="fx neg">סיכון ${iso(fmtM(e.risk))}</em>`);
  if (e.energy) c.push(`<em class="fx ${cls(e.energy)}">🔋 ${iso((e.energy > 0 ? '+' : '−') + Math.abs(Math.round(e.energy)))}</em>`);
  return c.join('');
}
/** Monthly plan picker (payday): one tap per plan, current one marked, trade-offs on every tile. */
function planPicker(ev) {
  const cur = ev.options.find((o) => o.id === 'ok');
  const plans = ev.options.filter((o) => o.id.startsWith('plan:') || o.id === 'ok');
  const raise = ev.options.find((o) => o.id === 'raise');
  const save = ev.options.find((o) => o.id === 'save');
  const rest = ev.options.filter((o) => !o.id.startsWith('plan:') && o.id !== 'ok' && o.id !== 'raise' && o.id !== 'save');
  const tile = (o) => {
    const id = o.plan || (o.id === 'ok' ? (ev.data.plan || 'current') : o.id.slice(5));
    const lbl = o.id === 'ok' ? (ev.data.planLabel || o.label.replace(/^להמשיך:?\s*/, '')) : o.label;
    const e0 = o.effects || {}; const e = { ...e0, net: e0.netDelta != null ? (e0.netDelta || null) : e0.net };
    return `<button class="plan ${o.id === 'ok' ? 'cur' : ''} ${o.primary ? 'rec' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : 'disabled'}>
      <span class="pi" aria-hidden="true">${PLAN_ICON[id] || '📅'}</span><b>${escI(lbl)}</b>${o.id === 'ok' ? '<small class="tagc">התוכנית שלך</small>' : o.primary ? '<small class="tagc rec">מתאים לכוח שלך עכשיו</small>' : ''}
      <span class="fxs">${effectChips(e)}</span>${e.note ? `<small class="pn">${escI(e.note)}</small>` : ''}</button>`;
  };
  return `<div class="plans">${plans.map(tile).join('')}</div>` +
    (save ? `<button class="raise save ${save.primary ? 'primary' : ''}" data-o="save" ${save.enabled ? '' : 'disabled'}><span>🛟 ${escI(save.label)}</span><small>${save.effects && save.effects.months != null ? `אחרי זה: ${iso(String(save.effects.months))} חודשי הוצאות בצד (היעד: 3) · ` : ''}התוכנית נשארת ${escI(ev.data.planLabel || '')}</small></button>` : '') +
    (raise ? `<button class="raise ${raise.primary ? 'primary' : ''}" data-o="raise" ${raise.enabled ? '' : 'disabled'}>📈 ${escI(raise.label)}${raise.chance != null ? ` <small>סיכוי ${iso(Math.round(raise.chance * 100) + '%')}</small>` : ''}</button>` : '') +
    (rest.length ? optButtons({ ...ev, options: rest }) : '') + (cur ? '' : '');
}
/** Life-event dilemmas: each option is a card with its money / energy / happiness consequences. */
function effectChoices(ev) {
  const d = ev.data || {};
  const chip = ev.type !== 'life' ? '' : d.personal ? '<p class="chipline"><em class="b">החלטה אישית — אין כאן תשובה נכונה אחת</em></p>'
    : d.values ? '<p class="chipline"><em class="b">טרייד־אוף — אין כאן תשובה אחת</em></p>' : '';
  return chip + `<div class="choices">${ev.options.map((o, i) => `<div class="opt"><button class="choice ${o.primary ? 'primary' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}>
    <b>${escI(o.label)}</b>${o.primary && ev.options.length > 1 ? '<small class="tagc rec">הבחירה של המנטור</small>' : ''}<span class="fxs">${effectChips(o.effects)}</span>${o.effects && o.effects.note ? `<small class="pn">${escI(o.effects.note)}</small>` : ''}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${escI(o.reason)}</small>` : ''}</div>`).join('')}</div>`;
}
/** Negotiation: offer −5/−10/−15% with the acceptance chance (and the risk of losing the deal). */
function offerRow(offers) {
  return `<div class="nego"><p class="mh">🤝 להציע מחיר נמוך יותר? <small>אם המוכר יסרב — העסקה נסגרת.</small></p><div class="nrow">${offers.map((o) => {
    const pct = +o.id.split(':')[1]; const ch = o.chance != null ? Math.round(o.chance * 100) : null;
    return `<button class="noff" data-o="${esc(o.id)}" ${o.enabled ? '' : 'disabled'}><b>${iso('−' + pct + '%')}</b>${ch != null ? `<small class="${ch >= 60 ? 'pos' : ch >= 35 ? '' : 'neg'}">סיכוי ${iso(ch + '%')}</small><i class="chbar"><i style="width:${ch}%"></i></i>` : ''}</button>`;
  }).join('')}</div></div>`;
}

/** "חסרים ₪X — הבנק ייתן הלוואה של ₪Y (עולה ₪Z בחודש)" — any card that makes you pay more than you have. */
function shortfallLine(d) {
  if (!d || !(d.shortfall > 0)) return '';
  const loan = d.loanAmount || 0;
  return `<p class="warn" role="note"><b>חסרים ${num(fmtM(d.shortfall))}</b>${loan ? ` — הבנק ייתן הלוואה של ${num(fmtM(loan))}${d.loanMonthly ? ` (עולה ${num(fmtM(d.loanMonthly))} בחודש)` : ''}` : ''}</p>`;
}
/** Quiz answers: no pre-highlighted answer, shuffled visually (stable per event; ids unchanged). */
function quizView(ev) {
  const h = (x) => { let k = 2166136261 ^ ev.id; for (const ch of x) k = Math.imul(k ^ ch.charCodeAt(0), 16777619); return k >>> 0; };
  return { ...ev, options: ev.options.map((o) => ({ ...o, primary: false })).sort((a, b) => h(a.id) - h(b.id)) };
}
 /** The mentor's question as a speech bubble at the top of the card (2 lines; tap to read all). */
function say(text) {
  if (!text) return '';
  return `<button type="button" class="say" data-say aria-expanded="false"><span class="av sm" aria-hidden="true">אע</span><span class="sr">אבא עשיר אומר: </span><span class="st" id="evSay">${escI(text)}</span></button>`;
}
function head(ev, M = null) {
  const hb = M ? hintBtnHtml(ev, M) : '';
  return `${say(ev.mentor)}<div class="taghead"><span class="tag" style="--c:${esc(ev.color || '#2f6fdb')};--ink:${esc(ev.ink || '#fff')}">${esc(ev.tag || '')}</span>${hb}</div><h2 id="evTitle" tabindex="-1">${escI(ev.title)}</h2>${ev.text ? `<p class="d">${escI(ev.text)}</p>` : ''}${flagsHtml(ev)}`;
}
/** T2 due diligence: the deal's public flags under the title — icon + text, never colour alone */
function flagsHtml(ev) {
  const F = ev.data && ev.data.dd && ev.data.dd.flags; if (!F || !F.length) return '';
  return `<p class="chipline ddflags">${F.map((f) => `<em class="b ${f.kind === 'good' ? 'ok' : 'warn'}"><span aria-hidden="true">${f.kind === 'good' ? '✓' : '⚠'}</span> ${escI(f.text)}</em>`).join('')}</p>`;
}
/** ROI equation as an LTR math line (words outside it): ₪450 × 12 ÷ ₪5,000 = 108% בשנה */
function roiEq(d) {
  const roi = d.roi ?? 0; // the engine owns the number (audit D4)
  return `<bdi dir="ltr" class="eq"><span class="${cls(d.cf)}">${fmtM(d.cf)}</span> × 12 ÷ ${fmtM(d.down)} = <b class="${cls(roi)}">${roi}%</b></bdi> בשנה`;
}
/** "⚠ במשחק / 🌍 במציאות" — the engine's honesty line (data.reality); the UI only shows it. */
function realityLine(d) { return d && d.reality ? `<p class="reality">${escI(d.reality)}</p>` : ''; }
/** a liability row + the real-world rate next to it (engine: realWorldRate / realText) */
function liabRow(x) {
  const rw = x.realText ? x.realText : x.realWorldRate != null ? `בעולם האמיתי ≈ ${x.realWorldRate}% בשנה` : '';
  return `<div class="row"><span>${escI(x.label)}${rw ? `<small class="rw">${x.gameRate != null ? `במשחק ${iso(Math.round(x.gameRate * 10) / 10 + '%')} בשנה · ` : ''}${escI(rw)}</small>` : ''}</span><span class="num">${fmtM(x.amount)}</span></div>`;
}
const grid = (rows) => `<div class="grid">${rows.filter(Boolean).join('')}</div>`;
const big = (n, c) => `<b class="big num ${c ?? cls(n)}">${sgn(n)}</b>`;

function renderEvent(first) {
  const { ev, ctx } = evState; const c = $('#evCard');
  c.className = 'card ev-' + ev.type + (ev.golden ? ' golden' : '') + (first ? '' : ' pop-off');
  if (ev.type === 'trade') { if (first || !c.querySelector('#qs')) { c.innerHTML = tradeHtml(ev); } tradeUpd(true); return; }
  const fn = BODY[ev.type] || (() => '');
  let body = '';
  try { body = fn(ev, ctx) || ''; } catch (e) { console.error('card body', e); }
  const hasPlans = ev.options.some((o) => o.id.startsWith('plan:'));
  const hasEffects = ev.options.some((o) => o.effects && !o.id.startsWith('plan:'));
  const offers = ev.options.filter((o) => /^offer:/.test(o.id));
  const M = mentorOf();
  const inDd = (o) => o.kind === 'inspect' && !!(ev.data && ev.data.dd); // inspections live in the due-diligence box
  const actions = ev.type === 'intro' ? introActions(ev)
    : ev.type === 'mystery' && ev.data.kind === 'quiz' ? optButtons(quizView(ev), () => true, 'quiz')
    : ev.type === 'market' && ev.data.kind === 'sell' && ev.data.offers.length ? optButtons(ev, (o) => o.kind !== 'sell') // sales are buttons inside the list
    : ev.type === 'business' && ev.data.mode === 'manage' ? bizActions(ev)
    : hasPlans ? planPicker(ev)
    : hasEffects ? effectChoices(ev)
    : (offers.length ? offerRow(offers) : '') + optButtons(ev, (o) => !/^offer:/.test(o.id) && !inDd(o), '', ev.type === 'doodad' || ev.type === 'tax');
  const bizM = ev.type === 'business' && ev.data.mode === 'manage';
  const focus = (ev.type === 'payday' || ev.type === 'edu') && ev.data && ev.data.focus ? focusSection(ev.data.focus, M) : '';
  c.innerHTML = head(ev, M) + (bizM ? '' : vlineHtml(evState.verdict)) + body + shortfallLine(ev.data) + realityLine(ev.data) + hintPanelHtml(ev) + impactPanelHtml(ev, M) + '<p class="err" role="alert"></p>' + actions + focus;
  markHint(c, ev);
  if (first) c.scrollTop = 0;
}

/* ---------- T2 due diligence: claimed vs range vs verified + the two inspections (card stays open, ctl.update) */
const REPAIR = { none: 'אין', small: 'קטנים', big: 'גדולים' };
function ddBox(ev) {
  const d = ev.data, D = d.dd; if (!D) return '';
  const ins = ev.options.filter((o) => o.kind === 'inspect'); if (!ins.length) return ''; // golden / starter / verified: nothing to inspect
  const insBtn = (o, i) => {
    const i1 = o.id === 'inspect:1';
    const base = i1 ? 'לבדוק בעצמי' : shortLabel(o);
    const cost = i1 ? (D.inspect1.free ? 'חינם החודש' : `−${D.inspect1.energy} 🔋`) : `${fmtM(D.inspect2.fee)}${D.inspect2.half ? ' · ½ מחיר' : ''}`;
    return `<div class="opt"><button class="insp" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="dwhy${i}"`}><span><span aria-hidden="true">${i1 ? '🔍' : '🧾'}</span> ${esc(base)}</span><small class="net ${(i1 && D.inspect1.free) || (!i1 && D.inspect2.half) ? 'pos' : ''}">${iso(cost)}</small></button>${!o.enabled && o.reason ? `<small class="why" id="dwhy${i}">${escI(o.reason)}</small>` : ''}</div>`;
  };
  return `<div class="ddbox lv${D.level}"><p class="mh">🔎 ${D.level === 0 ? 'לבדוק לפני שקונים?' : 'בדיקה מקצועית — מספרים מדויקים'}</p><div class="acts ddins">${ins.map(insBtn).join('')}</div></div>`;
}
/* ---------- T2 monthly focus on the payday / education card: status + agenda, the picker opens on top (same as the HUD chip) */
function focusSection(F, M) {
  const sug = F.options.find((o) => o.suggested);
  const ag = F.agenda || [];
  const slot = (n) => { const a = ag.find((x) => x.slot === n); return a && a.label ? esc(a.label) : 'ללא'; };
  return `<div class="fsec"><div class="fh"><span class="fi" aria-hidden="true">${F.opsOpen ? '🏪' : FOCUS_ICON[F.current.id] || '🎯'}</span><div><b>🎯 מוקד החודש: ${esc(F.current.label)}</b>
    <small>בחודש הבא: ${slot(1)} · בעוד חודשיים: ${slot(2)}</small></div>
    <button type="button" class="chip" data-focus-open>${F.locked ? 'לתכנן' : 'לבחור מוקד'}</button></div>
    ${F.text ? `<p class="note">${escI(F.text)}</p>` : ''}${sug && M && M.level === 'guide' ? `<p class="note"><b class="tagc rec">המנטור ממליץ:</b> ${esc(sug.label)}</p>` : ''}</div>`;
}

/* ---------- T4 §4.2 intro card (engine type 'intro', feature-detected: shown only once the engine creates it) */
/** Chips with explicit sign semantics: a cost is shown as a red minus (CT§2.5 — effectChips() is not reused here). */
function introChips(e = {}) {
  const c = [];
  const neg = (t) => `<em class="fx neg">${t}</em>`;
  if (e.cash) c.push(e.cash < 0 ? neg(`מזומן ${iso('−' + fmtM(Math.abs(e.cash)))}`) : `<em class="fx pos">מזומן ${iso('+' + fmtM(e.cash))}</em>`);
  if (e.monthly) c.push(neg(`${iso('−' + fmtM(Math.abs(e.monthly)))} בחודש${e.months ? ` × ${e.months}` : ''}`));
  if (e.fee) c.push(neg(`עולה ${iso(fmtM(e.fee))} יותר`));
  if (e.energy) c.push(e.energy < 0 ? neg(`🔋 ${iso('−' + Math.abs(e.energy))} כוח`) : `<em class="fx pos">🔋 ${iso('+' + e.energy)} כוח</em>`);
  return c.join('');
}
function introActions(ev) {
  const d = ev.data || {};
  const main = ev.options.filter((o) => o.id !== 'skip'); const skip = ev.options.find((o) => o.id === 'skip');
  const btn = (o) => d.step === 'glitch'
    ? `<div class="opt"><button class="choice" data-o="${esc(o.id)}" data-intro-opt="${esc(o.id)}" ${o.enabled === false ? 'disabled' : ''}><b>${escI(o.label)}</b><span class="fxs">${introChips(o.effects)}</span></button></div>`
    : `<div class="opt"><button class="${o.primary || main.length === 1 ? 'primary' : ''}" data-o="${esc(o.id)}" data-intro-opt="${esc(o.id)}" ${o.enabled === false ? 'disabled' : ''}>${escI(o.label)}</button></div>`;
  return `<div class="${d.step === 'glitch' ? 'choices' : 'acts col'}">${main.map(btn).join('')}</div>${d.step === 'glitch' ? '<p class="note">אין כאן תשובה נכונה אחת. כל דרך עולה משהו אחר.</p>' : ''}${skip ? `<button class="linkbtn" data-o="skip" data-intro-opt="skip">${escI(skip.label)}</button>` : ''}`;
}

/* ---------- per-type bodies */
const BODY = {
  intro(ev) {
    const d = ev.data || {};
    if (d.step === 'salary') return grid([row('נטו לחשבון', fmtM(d.net ?? 0)), row('הוצאות קבועות', fmtM(-(d.expenses ?? 0)), 'neg'), `<div class="row"><b>נשאר בסוף החודש</b>${big(d.cashflow ?? 0)}</div>`]) + (d.cash != null ? `<p class="note">בקופה עכשיו: ${num(fmtM(d.cash))}</p>` : '');
    if (d.step === 'result') {
      const ch = Array.isArray(d.changes) ? d.changes : [];
      const g = d.goal || null;
      return (ch.length ? grid(ch.map((x) => row(escI(x.label), `${x.fmt === 'n' ? x.from : fmtM(x.from)} ← ${x.fmt === 'n' ? x.to : fmtM(x.to)}${x.note ? ' ' + x.note : ''}`))) : '') +
        (g ? `<div class="nextgoal"><b>🎯 המטרה הבאה</b><p>${escI(g.text || '')}</p>${g.target ? `<div class="track"><i style="width:${Math.max(2, Math.min(100, (g.now / g.target) * 100))}%"></i></div><small class="num">${fmtM(g.now || 0)} / ${fmtM(g.target)}</small>` : ''}</div>` : '');
    }
    return '';
  },
  payday(ev) {
    const d = { ...ev.data }; const plans = ev.options.some((o) => o.id.startsWith('plan:'));
    if (d.payslip) { d.gross = d.payslip.gross; d.net = d.payslip.net; }
    const ps = d.payslip;
    const rows = [d.gross ? row('ברוטו', sgn(d.gross)) : null, ps && ps.incomeTax ? row('מס הכנסה', fmtM(-ps.incomeTax), 'neg') : null, ps && ps.bl ? row('ביטוח לאומי ובריאות', fmtM(-ps.bl), 'neg') : null, ps && ps.pensionEmployee ? row('פנסיה (שלך)', fmtM(-ps.pensionEmployee), 'neg') : null,
      row(d.gross ? 'משכורת נטו' : 'משכורת', sgn(d.net ?? d.salary), 'pos'), row('הכנסה פסיבית', sgn(d.passive), cls(d.passive)), row('הוצאות', fmtM(-d.expenses), 'neg'), `<div class="row"><b>נכנס לכיס</b>${big(d.cashflow ?? d.amount)}</div>`];
    return grid(rows) + (plans ? '<h3 class="ph">איך תעביר את החודש הבא?</h3>' : '<p class="note">מעכשיו ימי משכורת יקרו לבד, בלי לעצור את המשחק — המטבעות יעופו ישר לקופה.</p>');
  },
  life(ev) {
    const d = ev.data || {};
    return d.text ? `<p class="d">${escI(d.text)}</p>` : '';
  },
  deal(ev, ctx) {
    const d = ev.data; const w = ctx.world;
    const rows = [row('מחיר', fmtM(d.cost))];
    if (d.value !== d.cost) rows.push(`<div class="row"><span>שווי בשוק</span><span class="num rtl">${fmtM(d.value)} <small class="${d.discount > 0 ? 'pos' : 'neg'}">(${d.discount > 0 ? 'מציאה: ' : 'מעל השווי: '}${iso(sgn(d.discount))})</small></span></div>`);
    rows.push(`<div class="row"><span>הון עצמי (משלמים עכשיו)</span><b class="num">${fmtM(d.down)}</b></div>`);
    if (d.debt > 0) rows.push(row(`${esc(d.debtLabel)} (חוב)`, fmtM(d.debt)));
    if (d.grow) rows.push(row(d.grow > 0 ? 'עליית ערך' : 'ירידת ערך', iso(`${d.grow > 0 ? '+' : '−'}${Math.round(Math.abs(d.grow) * 1000) / 10}%`) + ' בחודש', d.grow > 0 ? 'pos' : 'neg'));
    if (d.impact) rows.push(row('השפעה', `+${d.impact} בחודש`, 'pos'));
    // T2 due diligence lives IN the grid: the cash-flow row says whose number it is (seller / range / verified)
    const D = d.dd, lv = D ? D.level : -1;
    const badge = D && (lv > 0 || ev.options.some((o) => o.kind === 'inspect')) ? (lv === 2 ? ' <em class="b ok">נבדק ✓</em>' : lv === 1 ? ' <em class="b">טווח מהבדיקה</em>' : ` <em class="b warn">${esc(D.claimed.label || 'לפי המוכר')} · לא נבדק</em>`) : '';
    if (d.cfVar != null) {
      rows.push(`<div class="row"><span>תזרים בריבית משתנה (${num(pctTxt(d.rate))})${badge}</span>${big(d.cfVar)}</div>`);
      rows.push(`<div class="row"><span>תזרים בריבית קבועה (${num(pctTxt(d.fixedRate))})</span><b class="num ${cls(d.cfFix)}">${sgn(d.cfFix)}</b></div>`);
    } else rows.push(`<div class="row"><span>תזרים חודשי נטו${badge}</span>${big(d.cf)}</div>`);
    if (D && lv >= 1 && D.range) rows.push(row('🔍 לפי הבדיקה', `${fmtM(D.range.cf[0])} עד ${fmtM(D.range.cf[1])} בחודש`));
    if (D && lv === 2) rows.push(row('המוכר אמר', `${sgn(D.claimed.cf)} בחודש`, 'mut'));
    if (D && lv >= 1 && ctx.world.goal.type !== 'passive') rows.push(lv === 2 && D.verified ? row('שווי שנבדק', fmtM(D.verified.value)) : D.range ? row('שווי לפי הבדיקה', `${fmtM(D.range.value[0])} עד ${fmtM(D.range.value[1])}`) : '');
    if (D && lv >= 1) rows.push(lv === 2 && D.verified ? row('🔧 תיקונים', D.verified.repair ? fmtM(D.verified.repair) : 'אין', D.verified.repair ? 'neg' : '') : D.range ? row('🔧 תיקונים צפויים', esc(REPAIR[D.range.repair] || D.range.repair)) : '');
    let extra = '';
    if (d.cfAt) {
      extra += `<div class="mini"><p class="mh">כמה הנכס מכניס בכל ריבית?</p><div class="mt">${d.cfAt.map((x) => `<div class="${Math.abs(x.rate - d.rate) < 1 ? 'cur' : ''}"><small>${pctTxt(x.rate)}</small><b class="num ${cls(x.cf)}">${sgn(x.cf)}</b></div>`).join('')}</div>
        <p class="note">משתנה = התזרים זז עם הריבית. קבועה = נעול, בלי הפתעות, אבל קצת יקר יותר היום.</p></div>`;
    }
    if (d.cfAtUsd) {
      const imp = d.sens < 0;
      extra += `<div class="mini"><p class="mh">${d.usdLinked ? 'השווי צמוד לדולר.' : imp ? 'יבואן: משלם לספקים בדולרים — דולר חזק פוגע.' : 'יצואן: מוכר בדולרים — דולר חזק עוזר.'}</p><div class="mt">${d.cfAtUsd.map((x, i) => `<div class="${i === 1 ? 'cur' : ''}"><small>דולר ${usdTxt(x.usd)}</small><b class="num ${cls(x.cf)}">${sgn(x.cf)}</b><small>שווי ${fmtC(x.value)}</small></div>`).join('')}</div>
        <p class="note">גידור: ${fmtM(d.hedgeFee)} נועלים את השער הנוכחי ל־${d.hedgeMonths} חודשים.</p></div>`;
    }
    const short = Math.max(0, d.down - d.cash);
    const roiBtn = d.down ? `<button class="chip" data-roi aria-expanded="${evState.roi}" aria-controls="roiBox">תראה לי את החישוב</button>
      <div class="roi" id="roiBox" ${evState.roi ? '' : 'hidden'}>תשואה על ההון = תזרים שנתי ÷ הון עצמי<br>${roiEq(d)}<br><span class="note">התזרים כבר כולל את תשלומי ה${esc(d.debtLabel)}.${d.roiFix != null ? ` בריבית קבועה: ${iso(d.roiFix + '%')} בשנה.` : ''}</span>${d.roiVsLoan ? `<p class="vs">${escI(d.roiVsLoan)}</p>` : ''}</div>` : '';
    const cash = `<p class="note">יש לך ${num(fmtM(d.cash))} במזומן.${short ? ` חסרים ${num(fmtM(short))}${d.loanNeeded ? ` — הבנק ילווה ${num(fmtM(d.loanNeeded))} (עולה ${num(fmtM(d.loanMonthly))} בחודש)` : ''}.` : ''}</p>`;
    const neg = d.negotiated ? `<p class="okmsg">🤝 המוכר הסכים: ${iso('−' + d.negotiated.pct + '%')} — חסכת ${num(fmtM(d.negotiated.saved), 'pos')}</p>` : '';
    return neg + grid(rows) + ddBox(ev) + extra + roiBtn + cash;
  },
  doodad(ev) {
    const d = ev.data; const canSkip = ev.options.some((o) => o.id === 'skip');
    const kind = d.need === true ? '<p class="chipline"><em class="b warn">הוצאה הכרחית — אי אפשר לוותר</em></p>' : canSkip ? '<p class="chipline"><em class="b ok">פיתוי — מותר לוותר</em></p>' : '';
    return kind + grid([`<div class="row"><span>מחיר</span><b class="big num neg">${fmtM(d.amount)}</b></div>`,
      d.installments3 ? (() => { const a = d.installments3.amounts || []; return row('3 תשלומים בלי ריבית', a.every((x) => x === a[0]) ? `${a.length} × ${fmtM(a[0])}` : a.map((x) => fmtM(x)).join(' + ')); })() : '',
      d.installment ? `<div class="row"><span>באשראי מתגלגל<small class="rw">עד שתסגור את כל החוב — החוב עצמו לא קטן</small></span>${num(`${fmtM(d.installment)} ריבית בחודש`, 'neg')}</div>` : '',
      d.sub ? `<div class="row"><span>כמנוי<small class="rw">כל עוד הוא פעיל (במשחק אי אפשר לבטל)</small></span>${num(`${fmtM(d.sub)} בחודש`, 'neg')}</div>` : '']) +
      `<p class="note">יש לך ${num(fmtM(d.cash))} במזומן.${d.shortfall == null && d.amount > d.cash ? ' אין מספיק — אם תשלם, הבנק ייתן הלוואה.' : ''}</p>`;
  },
  market(ev) {
    const d = ev.data;
    if (d.kind === 'sell') {
      if (!d.offers.length) return '<p class="empty">אין לך נכסים מהסוג הזה.</p>';
      return `<div class="sells">${d.offers.map((o) => `<div class="sellrow"><div><b>${esc(o.name)}</b><p class="note">הצעה ${num(fmtM(o.offer))}${o.debt ? ` · סוגרים חוב ${num(fmtM(o.debt))}` : ''} · נכנס לך <b class="num pos">${fmtM(o.netAfterTax ?? o.net)}</b>${o.tax ? ` <small>(אחרי מס ${num(fmtM(o.tax))})</small>` : ''}<br>רווח על ההון: ${num(sgn(o.profit), cls(o.profit))} · מוותר על ${num(sgn(o.cf), cls(o.cf))} בחודש</p></div><button data-o="sell:${esc(o.assetId.slice(1))}" class="sell">למכור</button></div>`).join('')}</div>`;
    }
    if (d.kind === 'rate' || d.kind === 'fx') return fromTo(d.from, d.to, d.kind === 'rate' ? pctTxt : usdTxt, d.kind === 'rate' ? 'הריבית' : 'הדולר', d.kind === 'rate' ? -1 : 0);
    if (d.kind === 'reval') return d.changed.length ? grid([row('השינוי בשווי הנכסים שלך', sgn(d.valueChange), cls(d.valueChange))]) + '<p class="note">זה משנה את השווי הנקי, לא את המזומן.</p>' : '<p class="empty">אין לך נכסים מהסוג הזה.</p>';
    if (d.kind === 'exitwave') return `<p class="note">${d.pulled.length ? `${d.pulled.length} מהסטארט־אפים שלך יגיעו לתוצאה עכשיו.` : 'אין לך סטארט־אפים שמגיעים לאקזיט עכשיו.'}</p>`;
    if (d.kind === 'markdown') return `<p class="note">${d.marked.length ? `השווי על הנייר של ${d.marked.length} סטארט־אפים ירד. זה עוד לא הפסד אמיתי.` : 'אין לך סטארט־אפים — זה לא נוגע בך.'}</p>`;
    if (d.kind === 'match') return grid([row('כל שקל שתתרום', 'מוכפל!', 'pos')]);
    if (d.amount != null) return d.amount ? grid([`<div class="row"><span>${d.kind === 'repair' ? `${d.count} נכסים לתיקון` : d.kind === 'div' ? `דיבידנד על ${esc(d.ticker)}` : 'השפעה על המזומן'}</span>${big(d.amount)}</div>`]) : '<p class="empty">הפעם זה לא נוגע אליך.</p>';
    return '';
  },
  crisis(ev) {
    const d = ev.data;
    return grid([...d.lines.map((l) => row(esc(l.label), sgn(l.amount), cls(l.amount))), `<div class="row"><b>סה"כ</b>${big(d.amount)}</div>`]) +
      (d.passive > 0 ? `<p class="note">הנכסים שלך ממשיכים לעבוד: ${num(sgn(d.passive), 'pos')} בחודש גם עכשיו.</p>` : '<p class="note">הנכסים ממשיכים לעבוד גם כשאתה לא.</p>') +
      (d.gold ? `<p class="note">בזמן משבר הזהב קופץ ב־${num(d.gold + '%')}${d.goldAfter ? ` — אונקייה תהיה שווה ${num(fmtM(d.goldAfter))}` : ''}.</p>` : '');
  },
  mystery(ev) {
    const d = ev.data;
    if (d.kind === 'quiz') return `<div class="quizq"><b>${escI(d.question)}</b><p class="note">${typeof d.reward === 'number' ? `תשובה נכונה = ${num(fmtM(d.reward), 'pos')}` : 'תשובה נכונה = שיעור חדש בספרייה + ⚡1. אין פרס כספי — רק הבנה.'}</p></div>`;
    if (d.kind === 'cash') return grid([`<div class="row"><span>${d.amount >= 0 ? 'נכנס לך' : 'יוצא לך'}</span>${big(d.amount)}</div>`]);
    if (d.kind === 'raise') return grid([row('המשכורת עולה', `${sgn(d.amount)} בחודש`, 'pos')]);
    if (d.kind === 'expense') return grid([row('ההוצאות משתנות', `${sgn(d.amount)} בחודש`, d.amount > 0 ? 'neg' : 'pos')]);
    if (d.kind === 'boost') return d.assetName ? grid([row(esc(d.assetName), `${sgn(d.amount)} בחודש`, 'pos')]) : '';
    if (d.kind === 'shares') return grid([row(`${N(d.qty)} יחידות ${esc(d.ticker)}`, fmtM(d.value), 'pos')]);
    if (d.kind === 'impact') return grid([row('נקודות השפעה', `+${d.impact}`, 'pos')]);
    if (d.kind === 'usd') return grid([row('שער הדולר זז', `${d.delta > 0 ? '+' : '−'}₪${Math.abs(d.delta).toFixed(2)}`)]);
    return '';
  },
  bank(ev) {
    const d = ev.data;
    return fromTo(d.from, d.to, pctTxt, 'הריבית', -1) + grid([
      d.variableCount ? row(`${d.variableCount} משכנתאות בריבית משתנה`, fmtM(d.variableDebt)) : row('משכנתאות בריבית משתנה', 'אין'),
      `<div class="row"><span>השפעה על התזרים החודשי</span>${big(d.monthlyImpact)}</div>`,
      d.variableCount ? row(`אם תקבע עכשיו (${num(pctTxt(d.fixedRate))})`, iso(`${sgn(d.cfIfFixed)} במקום ${sgn(d.cfNow)}`), cls(d.cfIfFixed - d.cfNow)) : '',
      d.variableCount ? row('עמלת קיבוע', fmtM(d.refiFee)) : '',
    ]);
  },
  upgrade(ev) {
    const d = ev.data;
    const ups = d.upgrades.map((u) => `<div class="uprow"><b>${esc(u.name)}</b><span class="note">${esc(u.label)} · ${num(fmtM(u.cost))} ← ${num(sgn(u.gain), 'pos')} בחודש · ${num(u.roi + '%')} בשנה · שווי ${num(sgn(u.valueUp), 'pos')}</span></div>`).join('');
    const trims = d.trims.map((t) => `<div class="uprow"><b>לקצץ: ${esc(t.label)}</b><span class="note">עולה פעם אחת ${num(fmtM(t.cost))} · חוסך ${num(fmtM(t.cut), 'pos')} כל חודש — לתמיד</span></div>`).join('');
    return (ups || trims) ? `<div class="ups">${ups}${trims}</div>` : '<p class="empty">אין לך עכשיו מה לשדרג.</p>';
  },
  fx(ev) {
    const d = ev.data; const ex = d.exposure || { cf: 0, value: 0 };
    return fromTo(d.from, d.to, usdTxt, 'הדולר', 0) + grid([
      d.exposureText ? row('נכסים שמושפעים', escI(d.exposureText)) : row('נכסים שמושפעים', [cnt(d.importers, 'יבואן', 'יבואנים'), cnt(d.exporters, 'יצואן', 'יצואנים')].join(' · ')),
      row('אם הדולר יעלה עוד 10%', `${sgn(ex.cf)} בחודש`, cls(ex.cf)),
      d.importers ? row('גידור היבוא', `${fmtM(d.hedgeFeeImporters)} ל־${d.hedgeMonths} חודשים`) : '',
      d.exporters ? row('גידור היצוא', `${fmtM(d.hedgeFeeExporters)} ל־${d.hedgeMonths} חודשים`) : '',
    ]) + '<p class="note">גידור = ביטוח על השער. קונים אותו כשהשער נוח לך, לא באמצע סערה.</p>';
  },
  shipping(ev) {
    const d = ev.data;
    if (d.fee != null) return grid([row('ביטוח משלוחים', `${fmtM(d.fee)} ל־${d.months} חודשים`), row('מצב היום', d.insured ? `מבוטח עד חודש ${d.insuredUntil}` : 'לא מבוטח', d.insured ? 'pos' : '')]);
    return grid([`<div class="row"><span>${d.insured && d.amount === 0 ? 'הביטוח כיסה את הנזק' : 'השפעה על המזומן'}</span>${d.amount ? big(d.amount) : '<b class="num pos">₪0</b>'}</div>`]);
  },
  pitch(ev) {
    const d = ev.data;
    const dots = (n, lbl, warn) => `<div class="meter"><span>${lbl}</span><i>${[1, 2, 3].map((k) => `<b class="${k <= n ? (warn ? 'on warn' : 'on') : ''}"></b>`).join('')}</i></div>`;
    return `<p class="chipline"><em class="b">${esc(d.sector)}</em></p><div class="meters">${dots(d.team, 'צוות')}${dots(d.traction, 'מכירות')}${dots(d.hype, 'הייפ', true)}</div>
      <div class="odds"><b>האמת על סטארט־אפים</b><p>${escI(d.odds)}</p><p class="note">הייפ גבוה = משלמים יותר על אותו סיכוי. התוצאה תתגלה בעוד ${esc(d.revealHint)}. ${d.active ? `כבר יש לך ${d.active} השקעות פעילות.` : ''}</p></div>`;
  },
  giving(ev) {
    const d = ev.data;
    return `<div class="wbox"><div class="wl"><span>ההשפעה שלך</span><b class="num">${d.impact}/${d.impactTarget}</b></div><div class="track"><i style="width:${Math.min(100, (d.impact / Math.max(1, d.impactTarget)) * 100)}%"></i></div></div>` +
      grid([row('יעילות המטרה', `×${d.eff}`, d.eff >= 1 ? 'pos' : 'neg')]) +
      `<p class="note">${d.eff < 1 ? 'שים לב: חלק גדול מהכסף לא מגיע למטרה עצמה.' : 'תרומה נותנת קצת השפעה עכשיו, והשאר מגיע לאורך החודשים הבאים — וממשיך לגדול.'}${d.pledge ? ` הוראת קבע: ${num(fmtM(d.pledge.amount))} בחודש ← ${num('+' + d.pledge.impact)} השפעה כל חודש.` : ''}</p>`;
  },
  /* v3.1 K tile: a managed business (offer → manage). Owner-run = active income; with a manager = passive. */
  business(ev) {
    const d = ev.data || {};
    if (d.mode === 'offer') {
      const L = (d.forecast3 && d.forecast3.lines) || []; const ln = (k) => L.find((x) => x.k === k);
      const rev = ln('revenue'), gp = ln('gp'), np = ln('np');
      const A = d.archetype || {};
      return `<p class="chipline"><em class="b">${BIZ_ICON[A.icon] || '🏪'} ${esc(A.short || A.name || 'עסק')}</em>${A.price ? `<em class="b">מחיר ל${esc(unitOne(A.unit))}: ${num(fmtP(A.price))}</em>` : ''}</p>` +
        grid([`<div class="row"><span>הון לפתיחה</span><b class="num">${fmtM(d.startCapital)}</b></div>`,
          rev ? row('הכנסות ב־3 החודשים הראשונים (בלי מע"מ)', fmtM(rev.amount)) : '',
          gp ? row(`רווח גולמי${gp.pct != null ? ` (${gp.pct}%)` : ''}`, fmtM(gp.amount), cls(gp.amount)) : '',
          np ? `<div class="row"><span>רווח נקי צפוי ב־3 חודשים</span>${big(np.amount)}</div>` : '']) +
        (d.breakEven && d.breakEven.text ? `<p class="note">⚖️ ${escI(d.breakEven.text)}</p>` : '') +
        `<div class="bizkind"><p><b>אתה עובד בו</b> = הכנסה <b>אקטיבית</b> (משרה נוספת) · 🔋 ${nrg(-(d.ownerEnergy || 0))} בחודש.</p><p><b>עם מנהל</b> = הכנסה <b>פסיבית</b> שנספרת ליעד · 🔋 ${nrg(-(d.managerEnergy || 0))} — אבל משלמים לו משכורת.</p></div>` +
        '<p class="note">תחזית בלבד: לקוחות, מחירים והפתעות משנים את התוצאה כל חודש.</p>';
    }
    const s = d.summary || {}; const h = s.hist || []; const last = h[h.length - 1];
    const passive = s.incomeKind === 'passive' || s.manager;
    return `<p class="chipline"><em class="b ${passive ? 'ok' : 'warn'}">${passive ? 'עם מנהל — הכנסה פסיבית (נספרת ליעד)' : 'אתה עובד בו — הכנסה אקטיבית (לא נספרת ליעד)'}</em><em class="b">🔋 ${nrg(-(s.ownerEnergy || 0))} בחודש</em></p>` +
      grid([last ? `<div class="row"><span>רווח נקי בחודש האחרון</span>${big(last.np)}</div>` : '',
        row('מחיר', fmtP(s.price ?? 0)), row('עובדים', String(s.staff ?? 0) + (s.manager ? ' + מנהל' : '')),
        row('שיווק בחודש', fmtM(s.marketing || 0)), row('משיכה לכיס שלך בחודש', fmtM(s.draw || 0)),
        row('בקופת העסק', fmtM(s.cash || 0), cls(s.cash || 0)),
        s.valuation ? row('שווי אם תמכור', fmtM(s.valuation.price || 0)) : '']) +
      (h.length > 1 ? `<div class="mini"><p class="mh">רווח נקי לפי חודש</p>${spark(h.map((x) => x.np), { color: (last && last.np >= 0) ? 'var(--green)' : 'var(--red)', w: 300, h: 34 })}</div>` : '') +
      (s.breakEven && s.breakEven.text ? `<p class="note">⚖️ ${escI(s.breakEven.text)}</p>` : '') +
      (d.forecast3 != null ? `<p class="note">אם לא משנים כלום — תחזית ל־3 חודשים: ${num(sgn(d.forecast3), cls(d.forecast3))} רווח נקי.</p>` : '');
  },
  tax(ev) {
    const d = ev.data || {};
    const canReport = ev.options.some((o) => o.id === 'report');
    return grid([d.refund ? row('החזר מס (שילמת יותר מדי במשכורת)', sgn(d.refund), 'pos') : '',
      d.bill ? row('מס על העסק הצדדי שלא דווח', fmtM(-d.bill), 'neg') : '',
      (d.refund && d.bill) ? `<div class="row"><b>סה"כ</b>${big(d.net)}</div>` : '',
      d.paidTotal ? row('מס הכנסה וביטוח לאומי ששילמת עד עכשיו', fmtM(d.paidTotal)) : '',
      d.effectiveRate ? row('מס אפקטיבי מהברוטו', iso(d.effectiveRate + '%')) : '']) +
      (canReport ? '<p class="note">🧾 עסק צדדי בלי תיק = חוב מס שמחכה לסוף השנה, ואם לא מגיעים לכאן — עוד 10% קנס. פתיחת תיק = מקדמות קטנות כל חודש, בלי הפתעות.</p>' : '');
  },
  edu(ev) {
    const d = ev.data || {}; const p = Math.round((d.studyProgress || 0) * 100);
    return `<div class="wbox"><div class="wl"><span>🎓 התקדמות בלימודים</span><b class="num">${p}%</b></div><div class="track"><i style="width:${Math.max(1, p)}%"></i></div>
      <p class="note">${p >= 100 ? 'סיימת ללמוד — ההעלאה כבר בתלוש.' : 'בסוף הלימודים: העלאה קבועה בברוטו. עד אז — שכר לימוד ופחות כוח.'}</p></div>`;
  },
};
/** signed small number as an LTR isolate (−12 / +4) */
const nrg = (n) => `<span class="num">${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}</span>`;
const BIZ_ICON = { coffee: '☕', washer: '🧺', pizza: '🍕', rocket: '📱', box: '📦' };
const unitOne = (u) => ({ 'כוסות': 'כוס', 'כביסות': 'כביסה', 'פיצות': 'פיצה', 'הזמנות': 'הזמנה', 'מנויים': 'מנוי' }[u] || 'יחידה');
const BIZ_DONE = { 'biz:suggest': 'ההמלצה בוצעה', 'biz:manager': 'עדכנת את המנהל', 'biz:price:up': 'המחיר עלה', 'biz:price:down': 'המחיר ירד', 'biz:mkt:up': 'יותר שיווק', 'biz:mkt:down': 'פחות שיווק', 'biz:hire': 'גייסת עובד', 'biz:fire': 'פיטרת עובד', 'biz:draw:up': 'תמשוך יותר לכיס', 'biz:draw:down': 'תמשוך פחות', 'biz:order': 'הזמנת מלאי', 'biz:expand': 'העסק מתרחב' };
/** Business decisions: each one with its 3-month effect on net profit, 🔋 cost and cash you must inject. Stays open until "המשך". */
function bizActions(ev) {
  const biz = ev.options.filter((o) => o.kind === 'biz');
  const sell = ev.options.find((o) => o.id === 'biz:sell');
  const rest = ev.options.filter((o) => o.kind !== 'biz' && o.id !== 'biz:sell');
  const tile = (o, i) => {
    const e = o.effects || {}; const dl = e.delta3 || 0;
    const chips = [o.enabled ? `<em class="fx ${cls(dl)}">${dl ? `${iso(sgn(dl))} ב־3 חודשים` : 'בלי שינוי ברווח'}</em>` : '',
      o.enabled && e.energy ? `<em class="fx">🔋 ${nrg(-Math.abs(e.energy))} בחודש</em>` : '',
      o.cashNeeded > 0 ? `<em class="fx neg">הזרמה מכיסך ${iso(fmtM(o.cashNeeded))}</em>` : ''].join('');
    return `<div class="opt"><button class="choice biz ${o.primary ? 'primary' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="bwhy${i}"`}><b>${escI(o.label)}</b><span class="fxs">${chips}</span></button>${!o.enabled && o.reason ? `<small class="why" id="bwhy${i}">${escI(o.reason)}</small>` : ''}</div>`;
  };
  const sl = sell && sell.sale ? `<div class="sellrow biz"><div><b>למכור את העסק</b><p class="note">נכנס לך <b class="num pos">${fmtM(sell.sale.net)}</b>${sell.sale.tax ? ` <small>(אחרי מס ${num(fmtM(sell.sale.tax))})</small>` : ''}${sell.sale.text ? `<br>${escI(sell.sale.text)}` : ''}</p></div><button data-o="biz:sell" class="sell" ${sell.enabled ? '' : 'disabled'}>למכור</button></div>` : '';
  const lr = ev.data && ev.data.lastResult;
  const done = lr ? `<p class="okmsg">✔ ${escI(BIZ_DONE[lr.action] || 'ההחלטה נקלטה')} — נכנס לתוקף מהחודש הבא.</p>` : '';
  return `${done}${vlineHtml(evState && evState.verdict)}<h3 class="ph">מה עושים החודש?</h3><div class="choices bizgrid">${biz.map(tile).join('')}</div>${sl}` + optButtons({ ...ev, options: rest });
}

/* ============================================================ v3.2: decision verdict (choose().decision) */
const VERDICT = { strong: ['החלטה חזקה', 'pos'], ok: ['החלטה סבירה', 'ok'], mixed: ['יש מה לשפר', 'mid'], risky: ['החלטה מסוכנת', 'neg'], costly: ['החלטה יקרה', 'neg'] };
export const PRINCIPLE = { cashflow: 'תזרים', cushion: 'כרית ביטחון', debt_cost: 'מחיר החוב', leverage: 'מינוף', rate_risk: 'סיכון ריבית', diversification: 'פיזור', time_in_market: 'זמן בשוק', opportunity_cost: 'מחיר הוויתור', risk_size: 'גודל הסיכון', fees_tax: 'מסים ועמלות', time: 'זמן וכוח', knowledge: 'ידע' };
function verdictParts(d) {
  const [label, c] = VERDICT[d.verdict] || ['ההחלטה שלך', 'mid'];
  let why = String(d.why || '');
  if (d.score >= 85 && /^היה עדיף:/.test(why)) why = why.replace(/^היה עדיף:\s*/, 'קרוב מאוד לטוב ביותר. טיפה עדיף: ');
  const pr = (d.principles || []).map((p) => PRINCIPLE[p]).filter(Boolean)[0];
  return { label, c, why, pr };
}
/** a one-line verdict inside an open card (trade window / business decisions) */
function vlineHtml(d) {
  if (!d) return '';
  const v = verdictParts(d);
  return `<p class="vline ${v.c}" role="status"><b class="num">${Math.round(d.score)}</b><span><b>${esc(v.label)}</b> · ${escI(v.why)}</span></p>`;
}
let vdT = 0;
/** Small, non-blocking verdict pill above the mentor bar after a decision (tap to hide). */
export function verdict(d, { inCard = false } = {}) {
  if (!d || d.score == null) return;
  if (inCard && evState) {
    evState.verdict = d;
    const c = $('#evCard'); if (!c) return;
    c.querySelector('.vline')?.remove();
    const ph = c.querySelector('.bizgrid') && c.querySelector('h3.ph');
    if (ph) ph.insertAdjacentHTML('beforebegin', vlineHtml(d)); else { const h = c.querySelector('#evTitle'); if (h) h.insertAdjacentHTML('afterend', vlineHtml(d)); }
    return;
  }
  overlay('verdict', (done) => {
    let el = $('#verdict');
    if (!el) { el = document.createElement('div'); el.id = 'verdict'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    const v = verdictParts(d);
    const hide = () => { clearTimeout(vdT); el.className = v.c; done(); };
    el.onclick = hide;
    el.innerHTML = `<b class="vs num">${Math.round(d.score)}</b><div><small>${esc(v.label)}${v.pr ? ` · ${esc(v.pr)}` : ''}</small><span>${escI(v.why)}</span></div>`;
    const bar = $('#bar')?.getBoundingClientRect();
    if (bar) { el.style.bottom = Math.round(innerHeight - bar.top + 8) + 'px'; el.style.left = Math.round(bar.left + bar.width / 2) + 'px'; }
    el.className = 'on ' + v.c;
    clearTimeout(vdT);
    vdT = setTimeout(hide, Math.min(6000, 2600 + v.why.length * 35) * Math.max(0.7, speed) * (phoneQ() ? 0.8 : 1));
  });
}
const cnt = (n, one, many) => (n === 0 ? `אין ${many}` : n === 1 ? `${one} אחד` : `${n} ${many}`);
const FEM = new Set(['הריבית', 'ההשפעה']);
/** "X עלה/ירד/לא זז" with gender agreement (הריבית עלתה, הדולר עלה). */
const moved = (what, dir) => { const f = FEM.has(what); return dir === 0 ? `${what} ${f ? 'לא זזה' : 'לא זז'}` : `${what} ${dir > 0 ? (f ? 'עלתה' : 'עלה') : (f ? 'ירדה' : 'ירד')}`; };
function fromTo(a, b, f, what, goodDir) {
  const dir = Math.sign(b - a); const good = goodDir ? dir * goodDir : 0;
  return `<div class="fromto"><span class="num">${f(a)}</span><i class="${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${dir > 0 ? ICON.up : dir < 0 ? ICON.down : '='}</i><b class="num ${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${f(b)}</b><small>${moved(what, dir)}</small></div>`;
}

/** Index fund: price path so far + the engine's projection RANGE (p10/p50/p90, invest.js projectRange) — never a promised return. */
/** the compounding box for any index-fund view (game.js index modal) — engine data only */
export function indexBox(ix) { return ix && ix.projection ? compoundBox(ix) : ''; }
function compoundBox(d) {
  const hist = (d.history && d.history.length > 1 ? d.history : null);
  const P = d.projection;
  let range = '';
  if (P && P.p50) {
    const mx = Math.max(P.p90 || 0, 1);
    const bar = (lbl, v, c) => `<div><i class="${c}" style="height:${Math.max(6, (v / mx) * 70)}px"><s style="height:${Math.min(100, (P.contributed / Math.max(1, v)) * 100)}%"></s></i><small>${lbl}</small><b class="num">${fmtC(v)}</b></div>`;
    range = `<p class="note c">${num(fmtM(P.monthly))} בחודש במשך ${P.years} שנה (שמת ${num(fmtC(P.contributed))}) — לאן זה יכול להגיע:</p>
      <div class="cbars">${bar('תרחיש רע', P.p10, 'lo')}${bar('תרחיש אמצעי', P.p50, 'mid')}${bar('תרחיש טוב', P.p90, 'hi')}</div>
      ${P.lossChance != null ? `<p class="note c">סיכוי לסיים מתחת למה ששמת: ${num(Math.round(P.lossChance * 100) + '%')}</p>` : ''}
      <p class="note">${escI(P.text || P.note || '')} החלק הכהה = מה ששמת; השאר = תשואה על תשואה.</p>`;
  }
  return `<div class="comp"><p class="mh">📈 קרן מחקה מדד — ריבית דריבית (בלי הבטחות)</p>${hist ? spark(hist, { color: 'var(--green)', w: 300, h: 40 }) : ''}${range}</div>`;
}

/* ---------- trade window (v1.1: slider dir=ltr, clamp, ±steps, max/all/reset, repeated buy/sell, 'סיום') */
function tradeHtml(ev) {
  const d = ev.data; const [s1, s2] = d.step || [10, 100]; const u = esc(d.unit);
  return `${head(ev)}${vlineHtml(evState && evState.verdict)}<div class="grid"><div class="row"><span>${esc(d.name)}</span><b class="big num" id="qprice">${fmtP(d.price)}</b></div>
    <div class="row"><span>יש לך</span><span class="num rtl" id="qhold"></span></div><div class="row" id="qgainRow" hidden><span>אם תמכור הכל עכשיו</span><b class="num" id="qgain"></b></div><div class="row"><span>מזומן</span><span class="num" id="qcash"></span></div>
    ${d.div ? `<div class="row"><span>תשלום חודשי ליחידה</span><span class="num pos">${fmtP(d.div)}</span></div>` : ''}</div>
    ${d.ticker === 'IDX' || d.kind === 'index' || d.index ? compoundBox(d) : ''}${realityLine(d)}
    ${d.wiped && d.wiped.qty ? `<p class="warn">המטבע הקודם (${esc(d.wiped.oldName)}) מת: ${N(d.wiped.qty)} יחידות ששוות היו ${num(fmtM(d.wiped.value))} — נמחקו.</p>` : ''}
    <label class="sr" for="qs">כמות ${u}</label><input type="range" id="qs" dir="ltr" min="0" step="1" value="0">
    <div class="qty" dir="ltr"><button data-q="${-s2}">−${N(s2)}<span class="sr"> ${u}</span></button><button data-q="${-s1}">−${N(s1)}<span class="sr"> ${u}</span></button><output id="qv" aria-live="polite">0</output><button data-q="${s1}">+${N(s1)}<span class="sr"> ${u}</span></button><button data-q="${s2}">+${N(s2)}<span class="sr"> ${u}</span></button></div>
    <div class="qty chips"><button class="chip" data-q="max">מקסימום לקנייה</button><button class="chip" data-q="all">כל ה${u} שלי</button><button class="chip" data-q="zero">איפוס</button></div>
    <p class="note c" id="qinfo"></p><p class="err" role="alert" id="qerr"></p>
    <div class="acts trade">${(() => { const P = (id) => (ev.options || []).some((o) => o.id === id && o.primary); const M = mentorOf(); const guide = !M || M.level === 'guide';
      const pb = P('buy'), ps = P('sell'), pd = P('done') || (guide && !pb && !ps); // hint / pro: no highlighted button at all
      return `<button data-o="buy" class="${pb ? 'primary' : ''}">לקנות</button><button data-o="sell" class="sell${ps ? ' primary' : ''}">למכור</button><button data-o="done" class="${pd ? 'primary' : ''}">סיום</button>`; })()}</div>
    <p class="note c">אפשר לקנות ולמכור כמה פעמים. טעית? אפשר למכור באותו מחיר. כשמסיימים — "סיום".</p>`;
}
function tradeUpd(fromEvent = false) {
  if (!evState || evState.ev.type !== 'trade') return;
  const d = evState.ev.data; const c = $('#evCard');
  const s1 = (d.step || [10])[0];
  // first tap must do something: start from one step (what you can afford; else what you can sell)
  if (fromEvent) evState.q = d.maxBuy > 0 ? Math.min(s1, d.maxBuy) : d.maxSell > 0 ? Math.min(s1, d.maxSell) : 0;
  const sayEl = $('#evSay'); if (sayEl && evState.ev.mentor) sayEl.innerHTML = escI(evState.ev.mentor);
  const lim = Math.max(d.maxBuy, d.maxSell);
  let q = Math.max(0, Math.min(Math.round(evState.q) || 0, lim)); evState.q = q;
  $('#qv').value = N(q); $('#qv').textContent = N(q);
  const sl = $('#qs'); sl.max = String(lim); sl.value = String(q); sl.disabled = !lim; sl.setAttribute('aria-valuetext', `${N(q)} ${d.unit}`);
  $('#qprice').textContent = fmtP(d.price);
  $('#qhold').textContent = `${N(d.qty)} ${d.unit} · ${fmtM(d.holdingValue)}${d.qty ? ` · קנית בממוצע ${fmtP(d.avg)}` : ''}`;
  $('#qcash').textContent = fmtM(d.cash);
  $('#qgainRow').hidden = !d.qty;
  if (d.qty) {
    const g = $('#qgain'); const ug = d.unrealizedGain ?? 0; // engine numbers only (audit D3/D4)
    const taxTxt = ug > 0 && d.unrealizedTax ? ` <small class="mut">(מס רווחי הון: ${fmtM(-d.unrealizedTax)})</small>` : ug > 0 && d.taxRate ? ` <small class="mut">(על הרווח משלמים מס רווחי הון ${Math.round(d.taxRate * 100)}%)</small>` : '';
    g.innerHTML = `${(ug > 0 ? '+' : '') + fmtM(ug)}${taxTxt}`; g.className = 'num rtl ' + cls(ug);
  }
  const lr = d.lastResult;
  const last = lr && fromEvent ? `${lr.action === 'buy' ? 'קנית' : 'מכרת'} ${N(lr.qty)} ב־${iso(fmtP(lr.price))}. ` : '';
  $('#qinfo').innerHTML = q ? `${last}עסקה של <b class="num">${fmtM(q * d.price)}</b>${d.div ? ` · ${num(sgn(q * d.div), 'pos')} בחודש` : ''}` : last ? `${last}אפשר להמשיך או לסיים.` : 'בחר כמות עם הסרגל או הכפתורים';
  $('#qerr').textContent = '';
  const bb = c.querySelector('[data-o="buy"]'), sb = c.querySelector('[data-o="sell"]');
  bb.disabled = !q || q > d.maxBuy; sb.disabled = !q || q > d.maxSell;
  bb.textContent = q && q <= d.maxBuy ? `לקנות ${N(q)}` : 'לקנות';
  sb.textContent = q && q <= d.maxSell ? `למכור ${N(q)}` : 'למכור';
  bb.title = !d.maxBuy ? 'אין מספיק מזומן' : ''; sb.title = !d.maxSell ? 'אין לך מה למכור' : '';
  c.querySelector('[data-q="max"]').disabled = !d.maxBuy; c.querySelector('[data-q="all"]').disabled = !d.maxSell;
}

/* ============================================================ free screen area for the camera */
export function freeRect() {
  const W = innerWidth, H = innerHeight;
  const hud = $('#hud')?.getBoundingClientRect(); const bar = $('#bar')?.getBoundingClientRect(); const sh = $('#sheet');
  let x0 = 0, x1 = W, y0 = hud ? hud.bottom + 4 : 0, y1 = bar ? bar.top - 4 : H;
  if (sh && getComputedStyle(sh).position === 'fixed' && W > 820) {
    const r = sh.getBoundingClientRect();
    if (r.width && r.left > W / 2) x1 = r.left - 6; else if (r.width) x0 = r.right + 6;
  }
  if (y1 - y0 < 200) { y0 = Math.max(0, y1 - 200); }
  return { x0, y0, x1, y1 };
}


/* ============================================================ v3: ⚡ roll-energy chip */
export function renderRollEnergy(g, msNext) {
  const b = $('#hEnergy'); if (!b) return;
  const re = $('#rollEn');
  if (!g) { b.hidden = true; if (re) re.hidden = true; return; }
  if (re) { re.hidden = false; re.textContent = `⚡${g.value}`; re.className = g.value <= 3 ? 'low' : ''; }
  b.hidden = false;
  $('#hEnVal').textContent = `${g.value}`;
  b.classList.toggle('low', g.value <= 3); b.classList.toggle('empty', g.value <= 0);
  const t = $('#hEnT');
  if (g.value < g.max && msNext > 0) { const s = Math.ceil(msNext / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } else t.textContent = '';
  b.title = `⚡ ${g.value}/${g.max} זריקות — כל הטלה עולה זריקה אחת`;   // T4 N15
  b.setAttribute('aria-label', `זריקות: ${g.value} מתוך ${g.max}${t.textContent ? ` · הבאה בעוד ${t.textContent}` : ''}`);
}

/* ============================================================ v3: lessons unlocked */
export function lessonToast(list, onOpen) {
  (list || []).forEach((l, i) => {
    const text = `📚 שיעור חדש בספרייה: ${l.title}`; const action = onOpen ? { label: 'לקרוא', fn: () => onOpen(l) } : null;
    if (!phoneQ()) { setTimeout(() => toast(text, { kind: 'gold', action }), i * 1400); return; }
    // phones: one floating thing at a time (the lesson waits for a coach / achievement / verdict to clear)
    const ms = Math.round(Math.max(1300, Math.min(3200, 900 + text.length * 38)) * (action ? 2.4 : 1));
    overlay('lesson', (done) => { toast(text, { kind: 'gold', action, ms }); setTimeout(done, ms + 300); });
  });
}
/** One lesson as a reading card (in-game). */
/** One lesson as a reading card (in-game). T4 CR-U-T4-10: S-B2 (long text → עוד ▾), S-B3 example, S-B4 where you learned it,
 *  S-B5 the game's simplification, S-B6 practice — from library.js (lobby lane; loaded lazily, every line optional). */
export async function lessonCard(l) {
  let LIB = null, PR = null;
  try { [LIB, PR] = await Promise.all([import('./library.js'), import('./practice.js').catch(() => null)]); } catch (e) { LIB = null; }
  const m = (LIB && LIB.meta && LIB.meta(l.id)) || {}; const ctx = l.ctx || (LIB && LIB.contextOf && LIB.contextOf(l.id)) || null;
  const t = String(l.text || '');
  const text = t.length > 160 ? `<p class="lesson">${escI(t.slice(0, 150).replace(/\s+\S*$/, ''))}…</p><details class="lmore"><summary>עוד ▾</summary><p class="lesson">${escI(t)}</p></details>` : `<p class="lesson">${escI(t)}</p>`;
  const lines = [];
  if (m.example) lines.push(`<p class="ls-line">🔢 דוגמה: ${escI(m.example)}</p>`);
  if (ctx && ctx.m != null) lines.push(`<p class="ls-line">📍 למדת את זה בחודש ${num(String(ctx.m))}${ctx.ev ? ` — "${escI(ctx.ev)}"` : ''}${ctx.num && ctx.num.label && ctx.num.value != null ? ` · ${escI(ctx.num.label)} ${escI(typeof ctx.num.value === 'number' ? fmtM(ctx.num.value) : String(ctx.num.value))}` : ''}</p>`);
  if (m.sim) lines.push(`<p class="ls-line">🎲 פישוט של המשחק: ${escI(m.sim)}</p>`);
  try {
    const st = LIB && LIB.practiceStats ? LIB.practiceStats() : {}; let n = 0, r = 0;
    const topics = PR && PR.PRACTICE ? [...new Set(PR.PRACTICE.filter((x) => (x.after || []).includes(l.id)).map((x) => x.topic))] : [];
    for (const tp of topics) if (st[tp]) { n += st[tp].n || 0; r += st[tp].right || 0; }
    if (n) lines.push(`<p class="ls-line">💡 תרגלת: ${r} מתוך ${n} נכונות</p>`);
  } catch (e) { /* optional */ }
  return modal({ tag: 'ספריית השיעורים', color: '#7c3aed', title: l.title, html: text + lines.join(''), actions: [{ label: 'הבנתי', cls: 'primary' }], dismissable: true });
}

/* ============================================================ T2: monthly focus picker (HUD chip + payday / education card) */
/** focusPicker(block, {level}) → Promise<{id, slot}|null>. block = metrics().focus (engine). Tiles: icon, label, cost chips,
 *  one benefit line, one "לא כדאי כש…" line, disabled reason; guide only: the suggested tile. Agenda slots are free. */
export function focusPicker(F, { level = 'hint', slot: slot0 = null } = {}) {
  if (!F) return Promise.resolve(null);
  let slot = slot0 != null ? slot0 : F.locked ? 1 : 0, sel = null;
  const ag = (n) => (F.agenda || []).find((x) => x.slot === n) || { id: null, label: null };
  const costChips = (o) => {
    const c = [], k = o.cost || {};
    if (k.energy) c.push(`<em class="fx neg">🔋 ${iso('−' + k.energy)}</em>`);
    if (k.happiness) c.push(`<em class="fx ${k.happiness > 0 ? 'neg' : 'pos'}">😊 ${iso((k.happiness > 0 ? '−' : '+') + Math.abs(k.happiness))}</em>`);
    if (k.cash) c.push(`<em class="fx neg">${iso('−' + fmtM(k.cash))}</em>`);
    return c.join('') || '<em class="fx">חינם</em>';
  };
  const tile = (o) => {
    const curM = slot === 0 && F.current.id === o.id && o.id !== 'none';
    const off = slot === 0 ? (!o.enabled || F.locked) : false;
    const now = slot !== 0 && !o.enabled && o.reason ? `<small class="why">כרגע: ${escI(o.reason)}</small>` : '';
    return `<button type="button" class="ftile ${sel === o.id ? 'sel' : ''} ${curM ? 'cur' : ''}" data-fid="${esc(o.id)}" aria-pressed="${sel === o.id}" ${off ? 'disabled' : ''}>
      <span class="fhd"><span class="fi" aria-hidden="true">${FOCUS_ICON_ID[o.icon] || FOCUS_ICON[o.id] || '🎯'}</span><b>${esc(o.label)}</b>${curM ? '<small class="tagc">נבחר לחודש הזה</small>' : o.suggested && level === 'guide' ? '<small class="tagc rec">המנטור ממליץ</small>' : ''}</span>
      <span class="fxs">${costChips(o)}</span><small class="fb">${escI(o.benefit || '')}</small>${o.notBest && o.notBest !== '—' ? `<small class="fn">${escI(o.notBest)}</small>` : ''}
      ${slot === 0 && !o.enabled && o.reason ? `<small class="why">${escI(o.reason)}</small>` : now}</button>`;
  };
  const slots = () => `<div class="fslots" role="group" aria-label="לאיזה חודש?">${[[0, 'החודש', F.current.id === 'none' ? (F.locked ? 'חודש רגיל' : 'עוד לא נבחר') : F.current.label], [1, 'בחודש הבא', ag(1).label || 'ללא'], [2, 'בעוד חודשיים', ag(2).label || 'ללא']]
    .map(([n, t, v]) => `<button type="button" class="fslot" data-slot="${n}" aria-pressed="${slot === n}"><b>${t}</b><small>${esc(v)}</small></button>`).join('')}</div>`;
  const body = () => `${slots()}
    ${slot === 0 && F.locked ? `<p class="note">כבר בחרת מוקד לחודש הזה (${esc(F.current.label)}). אפשר לתכנן את החודשים הבאים — זה בחינם.</p>` : slot ? '<p class="note">תכנון לחודש שיבוא: בלי תשלום עכשיו. ביום המשכורת המוקד נכנס לתוקף ומשלמים עליו.</p>' : '<p class="note">משלמים עכשיו, והמוקד פועל עד יום המשכורת. מוקד אחד בחודש.</p>'}
    <div class="ftiles">${F.options.filter((o) => slot === 0 || o.id !== 'none').map(tile).join('')}</div>
    ${slot ? `<button type="button" class="chip fnone" data-fid="none">ללא</button>` : ''}`;
  let root = null;
  const paint = (keep) => { if (!root) return; root.querySelector('.fbody').innerHTML = body(); if (keep) root.querySelector(keep)?.focus({ preventScroll: true }); const go = root.querySelector('.acts button[data-i="0"]'); if (go) { go.disabled = !sel; go.textContent = sel ? `לבחור: ${(F.options.find((o) => o.id === sel) || { label: 'ללא' }).label}` : 'לבחור'; } };
  return modal({ tag: 'מוקד החודש', color: '#0e7490', title: 'על מה תשים את הראש החודש?', wide: true, cls: 'fpick', dismissable: true,
    html: `<div class="fbody">${body()}</div>`,
    actions: [{ label: 'לבחור', cls: 'primary', v: 'go', dis: true }, { label: 'סגירה', v: null }],
    onOpen: (c) => { root = c; },
    onExtra: (e) => {
      const sl = e.target.closest('[data-slot]'); if (sl) { slot = +sl.dataset.slot; sel = null; sfx('click'); paint(`[data-slot="${slot}"]`); return; }
      const t = e.target.closest('[data-fid]'); if (!t || t.disabled) return;
      sel = t.dataset.fid; sfx('click'); paint(`[data-fid="${sel}"]`);
      if (sel === 'none' && slot) root.querySelector('.acts button[data-i="0"]')?.click(); // "ללא" clears the slot at once
    } }).then((v) => (v === 'go' && sel ? { id: sel, slot } : null));
}

/* ============================================================ T2: mentor level (free / history; the engine refuses elsewhere) */
export async function mentorPicker(M, { locked = false, levels = null } = {}) {
  const L = levels || {};
  if (locked) {
    await modal({ tag: 'רמת המנטור', color: '#7c3aed', title: `המנטור: ${M ? M.label : ''}`, html: '<p class="d">בדירוג כולם משחקים באותה רמה. מספר הרמזים מופיע בטבלה.</p>', actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
    return null;
  }
  let pick = null;
  const ids = ['guide', 'hint', 'pro'].filter((id) => L[id]);
  const v = await modal({ tag: 'רמת המנטור', color: '#7c3aed', title: 'כמה עזרה תרצה?', dismissable: true, cls: 'mpick',
    html: `<div class="mlevels">${ids.map((id) => `<button type="button" class="mlevel ${M && M.level === id ? 'cur' : ''}" data-lv="${id}" ${M && M.level === id ? 'aria-current="true"' : ''}><b>${esc(L[id].label)}</b>${M && M.level === id ? '<small class="tagc">עכשיו</small>' : ''}<small>${esc(L[id].desc || '')}</small></button>`).join('')}</div>
      ${M ? `<p class="note">רמזים עד עכשיו: ${num(String(M.hintsUsed || 0))}. השינוי נרשם בניתוח שבסוף.</p>` : ''}`,
    actions: [{ label: 'סגירה', cls: 'primary', v: null }],
    onExtra: (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; pick = b.dataset.lv; $('#gm .acts button')?.click(); } });
  void v;
  if (!pick || (M && pick === M.level)) return null;
  const ok = await confirmBox(`לעבור לרמה "${L[pick].label}"? ${L[pick].desc || ''}`, { yes: 'כן, לעבור', no: 'ביטול', title: 'רמת המנטור' });
  return ok ? pick : null;
}

/* ============================================================ T2: economy gauge — HUD chip → modal, and a sheet box */
function econBlockHtml(X, big = false) {
  const off = X.official && X.official.length ? X.official[X.official.length - 1] : null;
  const hist = (X.hist || []).map((h) => h.s);
  const w = 280, h = 44;
  const line = hist.length > 1 ? `<svg class="espark" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${h - 0.33 * h}" y2="${h - 0.33 * h}" class="g1"/><line x1="0" x2="${w}" y1="${h - 0.62 * h}" y2="${h - 0.62 * h}" class="g2"/><polyline points="${hist.map((v, i) => `${(i / (hist.length - 1)) * (w - 4) + 2},${(h - 2 - (v / 100) * (h - 4)).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/></svg>` : '';
  const tr = X.trend > 0 ? '↗' : X.trend < 0 ? '↘' : '→';
  return `<div class="econ ${big ? 'big' : ''}" role="img" aria-label="מד הכלכלה: ${esc(X.label)}, ${X.signal} מתוך 100">${gaugeSvg(X.signal, big ? 120 : 64)}<div><b>${esc(X.label)} <span aria-hidden="true">${tr}</span></b><small class="num">${X.signal}/100</small></div></div>
    ${X.sharp ? `<p class="chipline"><em class="b ok">🔬 מדויק יותר עד חודש ${X.sharpUntil}</em></p>` : ''}
    ${line}<p class="note">נתון רשמי (לפני 3 חודשים): <b>${off ? esc(off.label) : 'עוד לא פורסם'}</b></p><p class="note">${escI(X.text || '')}</p>`;
}
export function econModal(X) {
  if (!X) return Promise.resolve();
  return modal({ tag: 'מד הכלכלה', color: '#2459b8', title: 'מה קורה בכלכלה?', html: econBlockHtml(X, true), actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
}

/* ============================================================ T2 §15.9: the end-of-game analysis (inserted into the end screen) */
const VERD_L = { strong: 'חזקה', ok: 'סבירה', mixed: 'יש מה לשפר', risky: 'מסוכנת', costly: 'יקרה' };
/** what you chose, in words: the decision record keeps the option id; ids that read as words stay, the rest get a name */
const OPT_NAME = { 'inspect:1': 'בדיקה בסיסית', 'inspect:2': 'בדיקה מקצועית', pass: 'ויתור', buy: 'קנייה', buyVar: 'קנייה בריבית משתנה', buyFix: 'קנייה בריבית קבועה', buyHedge: 'קנייה עם גידור', pay: 'תשלום', inst3: '3 תשלומים', credit: 'אשראי', sub: 'מנוי', skip: 'ויתור', ok: 'להמשיך', save: 'הפקדה לקרן', raise: 'בקשת העלאה', start: 'פתיחת העסק', refi: 'קיבוע ריבית', report: 'פתיחת תיק' };
const optName = (r) => { const o = String(r.o ?? ''); if (!o) return ''; if (OPT_NAME[o]) return OPT_NAME[o]; const m = /^offer:(\d+)/.exec(o); if (m) return `הצעה ${m[1]}% פחות`; if (r.type === 'focus' && FOCUS_LABEL[o]) return FOCUS_LABEL[o]; return /^[a-z][\w:.-]*$/i.test(o) ? '' : o; };
const FOCUS_LABEL = { scout: 'חיפוש עסקאות', debt: 'סדר בחובות', ops: 'יום עבודה על העסק', frugal: 'ביקורת הוצאות', network: 'קשרים', research: 'מעקב אחרי הכלכלה', none: 'חודש רגיל' };
const LUCK_L = { dd: 'הפתעות בעסקאות', cycle: 'מצב הכלכלה' };
export function endAnalysisHtml(end) {
  if (!end) return '';
  const L = end.learning || null; const R = end.ddRecap || null; const P = end.econPath || null;
  if (!L && !(R && R.length) && !P) return '';
  const pro = L && L.mentor === 'pro';
  const out = [];
  if (L) {
    const bh = L.byHint || {}; const w = bh.withHint || {}, wo = bh.without || {};
    const hints = L.mentor !== 'pro' || L.hints ? `<p class="ea-l">💡 רמזים: <b class="num">${L.hints || 0}</b>${w.n ? ` · עם רמז ${num(String(w.avg))} (${w.n}) · בלי רמז ${num(String(wo.avg ?? '—'))} (${wo.n || 0})` : ''}</p>` : '';
    const lc = (L.levelChanges || []).length ? `<p class="ea-l">🧭 החלפת רמה: ${L.levelChanges.map((x) => `חודש ${x.m}`).join(', ')}</p>` : '';
    const parts = L.luck && L.luck.parts ? Object.entries(L.luck.parts).filter(([k, v]) => LUCK_L[k] && v) : [];
    const luck = parts.length ? `<p class="ea-l">🎲 מזל: ${parts.map(([k, v]) => `${LUCK_L[k]} ${num(sgn(v), cls(v))}`).join(' · ')}</p>` : '';
    const rv = (L.review || []).slice(); const list = pro ? rv : rv.slice().sort((a, b) => (a.score ?? 100) - (b.score ?? 100)).slice(0, 5);
    const items = list.map((r) => `<li class="${(r.score ?? 100) < 60 ? 'low' : ''}"><span class="sc num">${Math.round(r.score ?? 0)}</span><span><b>${escI(r.c || '')}</b>${optName(r) ? ` · ${escI(optName(r))}` : ''}${r.hinted ? ' <em class="b">רמז</em>' : ''}<small>${VERD_L[r.verdict] ? esc(VERD_L[r.verdict]) + ' · ' : ''}${escI(r.why || '')}${r.best && (r.score ?? 100) < 85 ? ` · הכי טוב היה: ${escI(r.best)}` : ''}</small></span></li>`).join('');
    out.push(`${hints}${lc}${luck}${items ? `<h4>${pro ? 'כל ההחלטות' : '5 ההחלטות ששווה לחשוב עליהן'}</h4><ol class="ea-rev">${items}</ol>` : ''}`);
  }
  if (R && R.length) {
    out.push(`<h4>🔎 מוצהר מול בפועל</h4><table class="ea-dd"><thead><tr><th scope="col">נכס</th><th scope="col">מוצהר</th><th scope="col">בפועל</th></tr></thead><tbody>${R.map((x) => `<tr><th scope="row">${escI(x.name)}${x.level ? ` <small>${x.level === 2 ? 'נבדק' : 'בדיקה בסיסית'}</small>` : ''}</th><td>${num(sgn(x.claimedCf))}</td><td>${num(sgn(x.cf), cls(x.cf - x.claimedCf))}${x.repair ? `<small> · תיקונים ${num(fmtM(x.repair))}</small>` : ''}</td></tr>`).join('')}</tbody></table>${end.ddPassed ? `<p class="note">ויתרת על ${end.ddPassed} עסקאות אחרי בדיקה.</p>` : ''}`);
  }
  if (P && P.truth && P.truth.length > 1) {
    const T = P.truth, S = P.signal || [], n = T.length, w = 300, h = 60;
    const PH = { exp: 'var(--green)', slow: '#d6a01e', rec: 'var(--red)', recov: 'var(--blue)' };
    const bw = w / n;
    const bands = T.map((x, i) => `<rect x="${(i * bw).toFixed(1)}" y="${h - 12}" width="${(bw + 0.5).toFixed(1)}" height="12" fill="${PH[x.phase] || 'var(--mut)'}"/>`).join('');
    const pts = S.map((x) => `${(((x.m - 1) / Math.max(1, n - 1)) * (w - 4) + 2).toFixed(1)},${(h - 16 - (x.s / 100) * (h - 20)).toFixed(1)}`).join(' ');
    const seen = [...new Set(T.map((x) => x.label))];
    out.push(`<h4>📊 ${escI(P.text || 'עכשיו אפשר לראות מה באמת היה')}</h4><svg class="ea-econ" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="מצב הכלכלה לאורך המשחק: ${esc(seen.join(', '))}">${bands}<polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="1.6"/></svg>
      <p class="ea-legend">${seen.map((lb) => { const ph = (T.find((x) => x.label === lb) || {}).phase; return `<span><i style="background:${PH[ph] || 'var(--mut)'}"></i>${esc(lb)}</span>`; }).join('')}<span><i class="ln"></i>מה שהמד הראה</span></p>`);
  }
  return `<details class="end-analysis" ${pro ? 'open' : ''}><summary><span>🔎 ניתוח</span><small>${pro ? 'כל ההחלטות שלך' : 'החלטות, מזל ומה באמת היה'}</small></summary>${out.join('')}</details>`;
}

/* ============================================================ T4: practice chip (§10.1, feature-detected: onboard.js calls it when the engine has E.practiceDue) */
let practiceEl = null;
export function practiceChip(q, onAnswer) {
  hidePractice();
  const ctrls = $('#bar .ctrls'); if (!ctrls || !q) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip practice'; b.id = 'practiceChip';
  b.setAttribute('aria-label', 'שאלת תרגול קצרה, לא חובה — 💡 שאלת רגע'); b.textContent = '💡 שאלת רגע';
  ctrls.insertBefore(b, $('#sheetBtn')); practiceEl = b;
  announce('יש שאלת תרגול קצרה ליד כפתור ההטלה, לא חובה');
  b.onclick = async () => {
    hidePractice();
    let done = false;
    const html = `<p class="lesson">${escI(q.q || '')}</p><div class="pans">${(q.answers || []).map((a, i) => `<button type="button" data-pa="${i}">${escI(a)}</button>`).join('')}</div><p class="note">לא משפיע על הכסף במשחק.</p><div class="pres" aria-live="polite"></div>`;
    await modal({ tag: `💡 שאלת רגע${q.topicName ? ' · ' + q.topicName : ''}`, color: '#0e7490', html, dismissable: true, cls: 'practice',
      actions: [{ label: 'דלג', v: null }],
      onExtra: async (e) => {
        const a = e.target.closest('[data-pa]'); if (!a || done) return;
        done = true; const idx = +a.dataset.pa; let r = null;
        try { r = await onAnswer(idx); } catch (x) { console.error(x); }
        const card = $('#gmCard'); card.querySelectorAll('[data-pa]').forEach((x) => { x.disabled = true; });
        if (r && r.ok) {
          const right = card.querySelector(`[data-pa="${r.correct}"]`); if (right) right.insertAdjacentHTML('afterbegin', '✓ ');
          card.querySelector('.pres').innerHTML = `<p class="${r.right ? 'pos' : 'neg'}"><b>${r.right ? '✓ נכון!' : '✗ לא בדיוק.'}</b> ${escI(r.why || '')}</p>${r.sim ? `<p class="note">🎲 מספרים של משחק: ${escI(r.sim)}</p>` : ''}`;
          announce(r.right ? 'נכון!' : 'לא בדיוק');
        }
        const btn = card.querySelector('.acts button'); if (btn) { btn.textContent = 'ממשיכים'; btn.classList.add('primary'); btn.focus(); }
      } });
  };
}
export function hidePractice() { if (practiceEl) { practiceEl.remove(); practiceEl = null; } const o = $('#practiceChip'); if (o) o.remove(); }

/* ============================================================ T4: dream (E-7, feature-detected: game.js calls these when the engine sends dreams) */
export function dreamToast(list) {
  for (const d of list || []) overlay('dream', (done) => { toast(`${d.icon || '🎯'} משימה הושלמה: ${d.title || ''}`, { kind: 'gold' }); setTimeout(done, 2600); });
}
export function renderDream(dream) {
  let el = $('#hDream'); const g = $('#hGoal');
  if (!dream || !dream.missions || !g) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('button'); el.id = 'hDream'; el.type = 'button'; el.className = 'hcard hdream'; g.insertAdjacentElement('afterend', el); el.onclick = () => dreamModal(dream); }
  const done = dream.missions.filter((x) => x && x.done).length;
  el.hidden = false; el.innerHTML = `<span aria-hidden="true">${esc(dream.icon || '🎯')}</span><b class="num">${done}/${dream.missions.length}</b>`;
  el.setAttribute('aria-label', `החלום: ${dream.name || ''}, ${done} מתוך ${dream.missions.length} משימות`);
  el.onclick = () => dreamModal(dream);
}
export function dreamModal(dream) {
  if (!dream) return Promise.resolve();
  const ms = dream.missions || []; const done = ms.filter((x) => x && x.done).length;
  return modal({ tag: 'החלום שלך', color: '#be185d', title: `${dream.icon || ''} ${dream.name || ''}`,
    html: `<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${ms.length}" aria-valuenow="${done}" aria-label="משימות"><i style="width:${ms.length ? Math.round((done / ms.length) * 100) : 0}%"></i></div>
      <ul class="dms">${ms.map((x) => `<li class="${x.done ? 'ok' : ''}">${x.done ? '✓' : '○'} ${escI(x.title || '')}${x.done && x.m ? ` <small>חודש ${x.m}</small>` : ''}</li>`).join('')}</ul>
      <p class="note">החלום לא משנה את הכוכבים ואת הניצחון. הוא מראה לך את הדרך שלך.</p>`,
    actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
}
/** T4 S-M7: learning-mode tag on the HUD world card. */
export function worldTag(learn) {
  const w = $('#hWorld'); if (!w) return;
  let t = $('#hLearn');
  if (!learn) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('em'); t.id = 'hLearn'; t.className = 'b learn'; t.textContent = '🎓 תרגול'; $('#hWorldName')?.insertAdjacentElement('afterend', t); }
}

/* ============================================================ v3: history mode — newspaper + market strip */
let paperT = 0;
export function newspaper(item) {
  const el = $('#paper'); if (!el || !item) return;
  overlay('rumour', (done) => {
    clearTimeout(paperT);
    el.innerHTML = `<div class="np"><div class="np-h"><b>${esc(item.head || 'העיתון')}</b><small>${esc(item.ymText || item.ym || '')}</small></div><p>${escI(item.text)}</p></div>`;
    const c = el.firstElementChild; requestAnimationFrame(() => c.classList.add('in'));
    paperT = setTimeout(() => { c.classList.remove('in'); c.classList.add('out'); setTimeout(done, 300); }, Math.max(2600, 1400 + item.text.length * 40) * Math.max(0.6, speed));
  });
}
export function historyStrip(hist, wi) {
  const el = $('#hist'); if (!el) return;
  if (!wi || !wi.ymText) { el.hidden = true; return; }
  el.hidden = false;
  const vals = (hist || []).map((x) => x.index).filter((x) => x != null);
  const first = vals[0], last = vals[vals.length - 1];
  const chg = first ? Math.round((last / first - 1) * 1000) / 10 : 0;
  el.innerHTML = `<div class="hh"><b>${esc(wi.ymText)}</b><span class="num ${cls(chg)}">${iso((chg > 0 ? '+' : '') + chg + '%')}</span></div>${vals.length > 1 ? spark(vals, { color: chg >= 0 ? 'var(--green)' : 'var(--red)', w: 220, h: 38 }) : '<p class="note">המדד יתחיל להתקדם בתשלום הראשון</p>'}
    <div class="hv">${wi.rate != null ? `<span>ריבית ${iso(wi.rate + '%')}</span>` : ''}${wi.cpi != null ? `<span>מדד מחירים ${(+wi.cpi).toFixed(1)}</span>` : ''}${wi.usd != null ? `<span>$ ${(+wi.usd).toFixed(2)}</span>` : ''}</div>`;
}

/* ============================================================ v3: the story of your life (before the end screen) */
export function lifeStory(sum, { won = false } = {}) {
  const el = $('#story'); if (!el || !sum) return Promise.resolve();
  return new Promise((res) => {
    const yrs = Math.round((sum.years ?? ((sum.age || 0) - (sum.startAge || 0))) * 10) / 10;
    el.innerHTML = `<div class="st-card">
      <small>סיפור החיים שלך</small>
      <div class="st-age"><b class="num" id="stAge">${Math.floor(sum.startAge || sum.age || 0)}</b><span>שנים</span></div>
      <div class="st-row">
        ${sum.family ? `<span>👨‍👩‍👧 ${esc(sum.family)}</span>` : ''}
        ${sum.happiness != null ? `<span>😊 אושר ${Math.round(sum.happiness)}</span>` : ''}
        ${sum.freeTimeMonths != null ? `<span>🌿 ${sum.freeTimeMonths} חודשים חופשיים</span>` : ''}
        ${sum.pension != null ? `<span>🏝️ פנסיה ${iso(fmtC(sum.pension))}</span>` : ''}
      </div>
      <p class="st-s" id="stS"></p>
      <button class="primary" id="stGo">לסיכום המלא</button></div>`;
    el.hidden = false; el.className = 'story ' + (won ? 'won' : 'lost');
    requestAnimationFrame(() => el.classList.add('in'));
    const a0 = sum.startAge || sum.age || 0, a1 = sum.age || a0;
    const t0 = performance.now(), dur = 1300 * Math.max(0.6, speed);
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3); const n = $('#stAge'); if (n) n.textContent = Math.floor(a0 + (a1 - a0) * e); if (p < 1) requestAnimationFrame(step); else { sfx('tick'); } };
    requestAnimationFrame(step);
    const sent = String(sum.sentence || ''); let i = 0; const sEl = $('#stS');
    const calm = reduced();
    let ty = 0;
    if (calm) { if (sEl) sEl.textContent = sent; } // T5 CR-U2: the whole sentence at once, no auto-close
    else ty = setInterval(() => { i += 2; if (sEl) sEl.textContent = sent.slice(0, i); if (i >= sent.length) clearInterval(ty); }, 28);
    let done = false;
    const release = trapFocus(el);
    const close = () => { if (done) return; done = true; clearInterval(ty); release(); el.classList.remove('in'); setTimeout(() => { el.hidden = true; res(); }, calm ? 0 : 350); };
    $('#stGo').onclick = close;
    setTimeout(() => $('#stGo')?.focus({ preventScroll: true }), 60); // UX§2.5: focus moves to the button
    if (!calm) setTimeout(close, Math.max(4200, 1600 + sent.length * 45) * Math.max(0.7, speed));
    void yrs;
  });
}
