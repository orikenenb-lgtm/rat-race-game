// מירוץ העכברים 2.0 — DOM layer: HUD, statement sheet, event cards (incl. the v1.1 trade window), mentor, dice,
// toasts, achievement toast, coach marks, flying coins. Generic helpers (toast/modal/confirmBox/achievementToast)
// are also used by the lobby.
import { fmt, fmtM, sgn, fmtP } from './engine.js';
import { sfx } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Wrap signed ₪ amounts / percentages inside Hebrew sentences in LTR isolates (LRI…PDI) so "(+₪4,830)" stays readable. */
const NUMRE = /[+−-]?(?:[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?[KM]?|\d+(?:\.\d+)?%(?:[–-]\d+(?:\.\d+)?%)?)|[+−]\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
export const iso = (t) => String(t ?? '').replace(/→/g, '←').replace(NUMRE, (m) => '\u2066' + m.replace(/^([+−-])(?=[₪$])/, '$1\u2060') + '\u2069');
/** "≥" mirrors in RTL and confuses readers — say it in words. */
export const goalWords = (t) => String(t ?? '').replace(/הכנסה פסיבית\s*≥\s*הוצאות/g, 'הכנסה פסיבית שמכסה את ההוצאות').replace(/\s*≥\s*/g, ' של לפחות ');
const escI = (t) => iso(esc(t));
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
  const icon = a.icon && String(a.icon).length <= 4 ? `<span class="emo" aria-hidden="true">${esc(a.icon)}</span>` : ICON.medal;
  box.innerHTML = `<div class="ach" role="status"><div class="medal">${icon}</div><div><small>${esc(a.label || 'הישג חדש!')}</small><b>${escI(a.name || '')}</b>${a.desc ? `<p>${escI(a.desc)}</p>` : ''}</div></div>`;
  const card = box.firstElementChild;
  sfx(a.sound || 'achievement'); vibrate([12, 40, 18]);
  requestAnimationFrame(() => card.classList.add('in'));
  setTimeout(() => { card.classList.remove('in'); card.classList.add('out'); setTimeout(() => { box.innerHTML = ''; nextAch(); }, 380); }, 3300);
}

/* ============================================================ generic modal (shared with the lobby) */
/**
 * modal({tag, color, title, html, actions:[{label, cls, v, fn, dis}], onExtra, onOpen, dismissable}) → Promise<v>
 * fn() returning false keeps the modal open. Clicks on non-action elements go to onExtra(e).
 */
export function modal({ tag = '', color = '#2f6fdb', title = '', html = '', actions = [{ label: 'סגירה', cls: 'primary' }], onExtra, onOpen, dismissable = false, wide = false } = {}) {
  const m = $('#gm'), c = $('#gmCard');
  c.className = 'card' + (wide ? ' wide' : '');
  c.innerHTML = `${tag ? `<span class="tag" style="--c:${esc(color)}">${esc(tag)}</span>` : ''}${title ? `<h2 id="gmTitle">${esc(title)}</h2>` : ''}${html}<div class="acts">${actions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}" ${a.dis ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
  if (title) c.setAttribute('aria-labelledby', 'gmTitle'); else c.removeAttribute('aria-labelledby');
  const prevFocus = document.activeElement;
  m.hidden = false; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  if (onOpen) try { onOpen(c); } catch (e) { console.error(e); }
  setTimeout(() => (c.querySelector('.acts button.primary:not(:disabled)') || c.querySelector('.acts button:not(:disabled)'))?.focus(), 40);
  return new Promise((res) => {
    const close = (v) => { m.hidden = true; c.onclick = null; m.onkeydown = null; try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { /* ignore */ } res(v); };
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
  g.setAttribute('aria-label', `${label}: ${pc}%`);
  g.classList.toggle('done', pc >= 100);
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
  const infl = L.inflationYear != null ? Math.round(L.inflationYear * 10) / 10 : null;
  box.innerHTML = `<button class="lc age" data-life="age" title="גיל"><span>🎂</span><b class="num">${Math.floor(L.age)}</b></button>
    <button class="lc en ${enc}" data-life="energy" title="כוח (${en}/100)"><span>🔋</span><i class="mb"><i style="width:${Math.max(3, en)}%"></i></i><b class="num">${en}</b></button>
    <button class="lc hp" data-life="happy" title="אושר (${hp}/100)"><span>${hpe}</span><b class="num">${hp}</b></button>
    <button class="lc cr ${BAND_CLS[L.creditBand] ?? ''}" data-life="credit" title="דירוג אשראי: ${esc(L.creditBand || '')}"><span>🏦</span><b class="num">${L.creditScore ?? '—'}</b></button>
    ${infl != null ? `<button class="lc cpi" data-life="cpi" title="אינפלציה שנתית"><span>🛒</span><b class="num">${infl}%</b></button>` : ''}
    ${m.emergency ? `<button class="lc fund ${m.emergency.covered ? 'pos' : ''}" data-life="fund" title="קרן חירום: ${m.emergency.months} חודשי הוצאות"><span>🛟</span><b class="num">${m.emergency.months}</b></button>` : ''}
    <button class="lc plan" data-life="plan" title="התוכנית החודשית — לשנות"><span>${PLAN_ICON[L.plan] || '📅'}</span><b>${esc(L.planLabel || '')}</b></button>`;
}
/** Details popover for a life chip (tap). */
export function lifeDetails(kind, m, extra = {}) {
  const L = m.life || {}; const p = m.payslip || {}; const e = m.emergency || {};
  const T = {
    age: ['הגיל שלך', `${esc(L.ageText || Math.floor(L.age))}. כל חודש במשחק הוא חודש בחיים.${L.freeTimeMonths ? ` עד עכשיו היו לך ${L.freeTimeMonths} חודשים של זמן חופשי.` : ''}`],
    energy: ['🔋 כוח', `${Math.round(L.energy)}/100 (זה לא ⚡ — ⚡ היא אנרגיה להטלות). שעות נוספות, לימודים ועסק צדדי שוחקים; מנוחה ומשפחה ממלאות. מתחת ל־25 — סכנת שחיקה: חודש בלי משכורת.`],
    happy: ['אושר', `${Math.round(L.happiness)}/100${L.happinessBase != null && Math.round(L.happinessBase) !== Math.round(L.happiness) ? ` (מתוכם ${Math.round(L.happiness - L.happinessBase)} מ"צעצועים" — וזה דועך)` : ''}. ל־★★★ צריך גם לצאת מהר וגם אושר של לפחות 60.`],
    credit: ['דירוג אשראי', `${L.creditScore} — ${esc(L.creditBand || '')}. הלוואות כפויות ואשראי לא משולם מורידים; החזר בזמן מעלה. הדירוג קובע את הריבית שלך${L.loanPctAdj ? ` (כרגע ${iso((L.loanPctAdj > 0 ? '+' : '') + L.loanPctAdj + '%')})` : ''}.`],
    cpi: ['אינפלציה', `השנה המחירים עולים ב־${iso(L.inflationYear + '%')}. המזומן שלך שווה היום ${iso(fmtM(L.realCash ?? m.cash))} במחירים של תחילת המשחק. כסף שלא עובד — מתכווץ.${extra.inflReality ? `<br><span class="reality">${escI(extra.inflReality)}</span>` : ''}`],
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
    ${L.realCash != null ? `<div class="wbox"><div class="wl"><span>🛒 אינפלציה ${iso((L.inflationYear ?? 0) + '%')} בשנה</span><b class="num">מדד ${(L.cpi ?? 1).toFixed(3)}</b></div>
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
export function toggleSheet(force) {
  const s = $('#sheet'), b = $('#sheetBack'); const open = force ?? !s.classList.contains('open');
  s.classList.toggle('open', open); b.classList.toggle('on', open);
  $('#sheetBtn')?.setAttribute('aria-expanded', String(open));
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
export function flyCoins(from, n = 7) {
  const tgt = $('#hCash'); if (!tgt || !from) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) n = Math.min(n, 2);
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
    el.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; const v = b.dataset.c; hideCoach(v); };
    setTimeout(() => el.querySelector('[data-c="next"]')?.focus({ preventScroll: true }), 60);
  });
}
export function hideCoach(v = 'next') {
  const el = $('#coach'); if (el) { el.hidden = true; el.innerHTML = ''; el._place = null; }
  if (coachRes) { const r = coachRes; coachRes = null; r(v); }
}
addEventListener('resize', () => { const el = $('#coach'); if (el && !el.hidden && el._place) el._place(); });

/* ============================================================ event cards */
let evState = null;
export function isEventOpen() { return !!evState; }

/**
 * Open an engine event as a card. onChoose(optionId, params) is called on every decision; the game calls
 * ctl.update(nextEvent) for multi-step events (trade, sell list) and ctl.close() when done.
 */
export function openEvent(ev, ctx, onChoose) {
  const m = $('#evm'), c = $('#evCard');
  evState = { ev, ctx, onChoose, q: 0, roi: false };
  renderEvent(true);
  m.hidden = false;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  c.scrollTop = 0;
  c.onclick = onCardClick;
  c.oninput = (e) => { if (e.target.id === 'qs') { evState.q = +e.target.value; tradeUpd(); } };
  setTimeout(() => focusPrimary(), 60);
  return {
    update(nev) { if (!evState) return; evState.ev = nev; const keep = c.scrollTop; renderEvent(false); c.scrollTop = keep; },
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
  evState = null;
}
const lobbyOpen = () => { const st = $('#start'); return !!st && !st.hidden; };
function focusPrimary() {
  const c = $('#evCard'); if (!c || !evState || lobbyOpen()) return;
  (c.querySelector('.acts button.primary:not(:disabled)') || c.querySelector('.acts button:not(:disabled)'))?.focus({ preventScroll: true });
}
function onCardClick(e) {
  if (!evState) return;
  const sb = e.target.closest('[data-say]');
  if (sb) { const o = !sb.classList.contains('open'); sb.classList.toggle('open', o); sb.setAttribute('aria-expanded', String(o)); return; }
  const roi = e.target.closest('[data-roi]');
  if (roi) { evState.roi = true; const b = $('#roiBox'); if (b) b.hidden = false; roi.setAttribute('aria-expanded', 'true'); sfx('click'); hideCoach(); return; }
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
  const personal = !ev.options.some((o) => o.primary);
  return (personal && ev.type === 'life' ? '<p class="chipline"><em class="b">החלטה אישית — אין כאן תשובה נכונה אחת</em></p>' : '') + `<div class="choices">${ev.options.map((o, i) => `<div class="opt"><button class="choice ${o.primary ? 'primary' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}>
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
  return `<button type="button" class="say" data-say aria-expanded="false" aria-label="אבא עשיר אומר"><span class="av sm" aria-hidden="true">אע</span><span class="st" id="evSay">${escI(text)}</span></button>`;
}
function head(ev) {
  return `${say(ev.mentor)}<span class="tag" style="--c:${esc(ev.color || '#2f6fdb')};--ink:${esc(ev.ink || '#fff')}">${esc(ev.tag || '')}</span><h2 id="evTitle">${escI(ev.title)}</h2>${ev.text ? `<p class="d">${escI(ev.text)}</p>` : ''}`;
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
  const actions = ev.type === 'mystery' && ev.data.kind === 'quiz' ? optButtons(quizView(ev), () => true, 'quiz')
    : ev.type === 'market' && ev.data.kind === 'sell' && ev.data.offers.length ? optButtons(ev, (o) => o.kind !== 'sell') // sales are buttons inside the list
    : ev.type === 'business' && ev.data.mode === 'manage' ? bizActions(ev)
    : hasPlans ? planPicker(ev)
    : hasEffects ? effectChoices(ev)
    : (offers.length ? offerRow(offers) : '') + optButtons(ev, (o) => !/^offer:/.test(o.id), '', ev.type === 'doodad' || ev.type === 'tax');
  const bizM = ev.type === 'business' && ev.data.mode === 'manage';
  c.innerHTML = head(ev) + (bizM ? '' : vlineHtml(evState.verdict)) + body + shortfallLine(ev.data) + realityLine(ev.data) + '<p class="err" role="alert"></p>' + actions;
  if (first) c.scrollTop = 0;
}

/* ---------- per-type bodies */
const BODY = {
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
    if (d.cfVar != null) {
      rows.push(`<div class="row"><span>תזרים בריבית משתנה (${num(pctTxt(d.rate))})</span>${big(d.cfVar)}</div>`);
      rows.push(`<div class="row"><span>תזרים בריבית קבועה (${num(pctTxt(d.fixedRate))})</span><b class="num ${cls(d.cfFix)}">${sgn(d.cfFix)}</b></div>`);
    } else rows.push(`<div class="row"><span>תזרים חודשי נטו</span>${big(d.cf)}</div>`);
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
    return neg + grid(rows) + extra + roiBtn + cash;
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
  let el = $('#verdict');
  if (!el) { el = document.createElement('div'); el.id = 'verdict'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.onclick = () => { el.className = ''; };
  const v = verdictParts(d);
  el.innerHTML = `<b class="vs num">${Math.round(d.score)}</b><div><small>${esc(v.label)}${v.pr ? ` · ${esc(v.pr)}` : ''}</small><span>${escI(v.why)}</span></div>`;
  const bar = $('#bar')?.getBoundingClientRect();
  if (bar) { el.style.bottom = Math.round(innerHeight - bar.top + 8) + 'px'; el.style.left = Math.round(bar.left + bar.width / 2) + 'px'; }
  el.className = 'on ' + v.c;
  clearTimeout(vdT);
  vdT = setTimeout(() => { el.className = v.c; }, Math.min(6000, 2600 + v.why.length * 35) * Math.max(0.7, speed));
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
    <div class="qty" dir="ltr"><button data-q="${-s2}" aria-label="פחות ${s2}">−${N(s2)}</button><button data-q="${-s1}" aria-label="פחות ${s1}">−${N(s1)}</button><output id="qv" aria-live="polite">0</output><button data-q="${s1}" aria-label="עוד ${s1}">+${N(s1)}</button><button data-q="${s2}" aria-label="עוד ${s2}">+${N(s2)}</button></div>
    <div class="qty chips"><button class="chip" data-q="max">מקסימום לקנייה</button><button class="chip" data-q="all">כל ה${u} שלי</button><button class="chip" data-q="zero">איפוס</button></div>
    <p class="note c" id="qinfo"></p><p class="err" role="alert" id="qerr"></p>
    <div class="acts trade">${(() => { const P = (id) => (ev.options || []).some((o) => o.id === id && o.primary); const pb = P('buy'), ps = P('sell'), pd = P('done') || (!pb && !ps);
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
  b.title = `⚡ ${g.value}/${g.max} — כל הטלה עולה ⚡ אחת`;
}

/* ============================================================ v3: lessons unlocked */
export function lessonToast(list, onOpen) {
  (list || []).forEach((l, i) => setTimeout(() => toast(`📚 שיעור חדש בספרייה: ${l.title}`, { kind: 'gold', action: onOpen ? { label: 'לקרוא', fn: () => onOpen(l) } : null }), i * 1400));
}
/** One lesson as a reading card (in-game). */
export function lessonCard(l) {
  return modal({ tag: 'ספריית השיעורים', color: '#7c3aed', title: l.title, html: `<p class="lesson">${escI(l.text || '')}</p>`, actions: [{ label: 'הבנתי', cls: 'primary' }], dismissable: true });
}

/* ============================================================ v3: history mode — newspaper + market strip */
let paperT = 0;
export function newspaper(item) {
  const el = $('#paper'); if (!el || !item) return;
  clearTimeout(paperT);
  el.innerHTML = `<div class="np"><div class="np-h"><b>העיתון</b><small>${esc(item.ymText || item.ym || '')}</small></div><p>${escI(item.text)}</p></div>`;
  const c = el.firstElementChild; requestAnimationFrame(() => c.classList.add('in'));
  paperT = setTimeout(() => { c.classList.remove('in'); c.classList.add('out'); }, Math.max(2600, 1400 + item.text.length * 40) * Math.max(0.6, speed));
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
    const ty = setInterval(() => { i += 2; if (sEl) sEl.textContent = sent.slice(0, i); if (i >= sent.length) clearInterval(ty); }, 28);
    let done = false;
    const close = () => { if (done) return; done = true; clearInterval(ty); el.classList.remove('in'); setTimeout(() => { el.hidden = true; res(); }, 350); };
    $('#stGo').onclick = close;
    setTimeout(close, Math.max(4200, 1600 + sent.length * 45) * Math.max(0.7, speed));
    void yrs;
  });
}
