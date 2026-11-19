// מירוץ העכברים 2.0 — DOM layer: HUD, statement sheet, event cards (incl. the v1.1 trade window), mentor, dice,
// toasts, achievement toast, coach marks, flying coins. Generic helpers (toast/modal/confirmBox/achievementToast)
// are also used by the lobby.
import { fmt, fmtM, sgn, fmtP } from './engine.js';
import { sfx } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Wrap signed ₪ amounts / percentages inside Hebrew sentences in LTR isolates (LRI…PDI) so "(+₪4,830)" stays readable. */
const NUMRE = /[+−-]?(?:[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?%(?:[–-]\d+(?:\.\d+)?%)?)|[+−]\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
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
const money = (n) => (compact() ? fmtC(n) : fmtM(n));
const moneyS = (n) => (Math.round(n) > 0 ? '+' : '') + money(n);

/* ============================================================ icons */
export const ICON = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.2H9.2V21H4a1 1 0 0 1-1-1z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m16 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
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
  const T = w.theme, r = document.documentElement.style;
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
  if (w.mechanic === 'rate') { key = 'rate'; v = wi.rate; text = `ריבית ${num(pctTxt(wi.rate))}`; goodUp = -1; }
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
  // goal meter (updated in place so the bars animate)
  const g = $('#hGoal');
  const label = m.goalType === 'passive' ? 'מד החופש' : m.goalType === 'netWorth' ? 'שווי נקי' : 'יעד העולם';
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
  g.querySelector('.gsub').textContent = parts.map((p) => p.key === 'impact' ? `${N(p.value)}/${N(p.target)}${wi.impactPending ? ` (+${wi.impactPending} בדרך)` : ''}` : `${money(p.value)} / ${money(p.target)}`).join(' · ');
  g.setAttribute('aria-label', `${label}: ${pc}%`);
  g.classList.toggle('done', pc >= 100);
}

/** % shown to the player = the weakest goal part (goalProgress itself carries a ranking offset since v2.1). */
function shownPct(m) {
  const parts = m.goalParts || [];
  const p = parts.length ? Math.min(...parts.map((x) => x.progress)) : (m.goalProgress || 0);
  return Math.max(0, Math.min(100, Math.floor(p * 100)));
}

/* ============================================================ statement sheet */
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
  const goalHelp = m.goalType === 'passive' ? 'הכנסה פסיבית מול הוצאות. כשהפס מתמלא — יצאת מהמירוץ.' : m.goalType === 'netWorth' ? `היעד: ${escI(goalWords(w.goalLabel))}. שווי נקי = כל מה שיש לך פחות כל מה שאתה חייב.` : `היעד: ${escI(goalWords(w.goalLabel))}. צריך את שניהם.`;
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
  const assetRows = m.assets.map((a) => {
    const badges = [];
    if (a.golden) badges.push('<em class="b gold">זהב</em>');
    if (a.fixedRate != null && a.debt > 0) badges.push(`<em class="b">קבועה ${num(pctTxt(a.fixedRate))}</em>`);
    else if (a.variable) badges.push('<em class="b warn">משתנה</em>');
    if (a.hedgedUntil) badges.push(`<em class="b ok">מגודר עד ${a.hedgedUntil}</em>`);
    if (a.upgrades) badges.push(`<em class="b">שודרג ×${a.upgrades}</em>`);
    if (a.impact) badges.push(`<em class="b pink">+${a.impact} השפעה</em>`);
    return `<div class="arow"><div><span>${esc(a.name)}</span>${badges.join('')}</div><div class="av2">${num(fmtM(a.value))}<small class="${cls(a.cf)}">${num(sgn(a.cf))} לחודש</small></div></div>`;
  }).join('');
  const holdRows = m.holdings.map((h) => `<div class="arow"><div><span>${N(h.qty)} ${esc(h.unit)} ${esc(h.ticker)}</span><small class="note">${fmtP(h.price)} ליחידה</small></div><div class="av2">${num(fmtM(h.value))}${h.div ? `<small class="pos">${num(sgn(h.qty * h.div))} לחודש</small>` : ''}</div></div>`).join('');
  const angelRows = m.angels.filter((x) => x.status === 'active').map((x) => `<div class="arow"><div><span>${esc(x.name)}</span><small class="note">${x.news ? escI(x.news) : `תוצאה עד חודש ${x.revealAt}`}</small></div><div class="av2">${num(fmtM(x.paper))}<small>על הנייר</small></div></div>`).join('');
  const totA = m.cash + m.assets.reduce((t, a) => t + a.value, 0) + m.holdings.reduce((t, h) => t + h.value, 0) + m.angels.filter((x) => x.status === 'active').reduce((t, x) => t + x.paper, 0);
  const totL = m.liabilities.reduce((t, x) => t + x.amount, 0);
  const done = m.angels.filter((x) => x.status !== 'active');
  const angelDone = done.length ? `<p class="note">${done.length} השקעות נסגרו: ${done.map((x) => `${esc(x.name)} ${x.mult ? '×' + x.mult : '✗'}`).join(' · ')}</p>` : '';
  el.innerHTML = `<div class="sh-head"><div><h2>הדוח הכספי</h2><p class="sub">${esc(st.charName)} · ${esc(w.name)} · חודש ${m.month}${m.mode !== 'free' ? '/' + m.maxMonths : ''}</p></div><button class="ibtn sh-close" data-act="close" aria-label="סגירת הדוח">${ICON.close}</button></div>
  <div class="freedom"><div class="fl"><span>${esc(goalTitle)}</span><span class="num">${shownPct(m)}%</span></div>
   ${m.goalParts.map((p) => `<div class="track" title="${esc(p.label)}"><i style="width:${Math.max(1, p.progress * 100)}%"></i></div><p class="gpl"><span>${esc(p.label)}</span>${num(p.key === 'impact' ? `${N(p.value)} / ${N(p.target)}` : `${fmtM(p.value)} / ${fmtM(p.target)}`)}</p>`).join('')}
   <p>${goalHelp}</p></div>
  ${world}
  <h3>הכנסות בחודש</h3>${m.incomeLines.map((x) => row(escI(x.label), sgn(x.amount), cls(x.amount))).join('')}
  <h3>הוצאות בחודש</h3>${m.expenseLines.map((x) => row(escI(x.label), fmtM(x.amount))).join('')}
  <div class="total"><span>תזרים חודשי</span>${num(sgn(m.cashflow), cls(m.cashflow))}</div>
  <h3>נכסים</h3><div class="arow cashrow"><div><span>מזומן</span></div><div class="av2">${num(fmtM(m.cash))}</div></div>${assetRows + holdRows + angelRows}${assetRows || holdRows || angelRows ? '' : '<p class="empty">עוד אין נכסים שמכניסים כסף. נכס = משהו שמכניס כסף לכיס שלך.</p>'}${angelDone}
  ${row('<b>סה"כ נכסים</b>', fmtM(totA))}
  <h3>התחייבויות</h3>${m.liabilities.length ? m.liabilities.map((x) => row(escI(x.label), fmtM(x.amount))).join('') + row('<b>סה"כ התחייבויות</b>', fmtM(totL)) : '<p class="empty">אין חובות.</p>'}
  <div class="total nw"><span>שווי נקי</span>${num(fmtM(m.netWorth), cls(m.netWorth))}</div>
  <div class="loans"><button data-act="loan" ${m.canBorrow === false ? 'disabled title="הבנק בודק שתוכל להחזיר — כרגע הוא לא ילווה לך עוד"' : ''}>לקחת הלוואה ${fmtM(m.loanUnit)}</button><button data-act="repay" ${m.canRepay ? '' : 'disabled'}>להחזיר ${fmtM(m.loanUnit)}</button>${m.credit ? `<button data-act="credit" ${m.canPayCredit ? '' : 'disabled'}>לסגור חוב אשראי</button>` : ''}</div>
  <p class="note">כל ${num(fmtM(m.loanUnit))} הלוואה עולים ${num(fmtM(m.loanUnitCost))} בחודש${m.creditPct != null ? ` · חוב אשראי: ${iso(m.creditPct + '%')} בחודש` : ''}.${m.loanRoom != null ? (m.canBorrow === false ? ' הבנק בודק שתוכל להחזיר — כרגע הוא לא ילווה לך עוד.' : ` הבנק ילווה לך עוד עד ${num(fmtM(m.loanRoom))}.`) : ''}</p>`;
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
export function showDie(n) {
  const d = $('#die'); if (!d) return;
  d.querySelectorAll('i').forEach((el, i) => { el.style.visibility = PIPS[n].includes(i) ? 'visible' : 'hidden'; });
  d.setAttribute('aria-label', 'יצא ' + n);
}
export async function rollDie(n) {
  const d = $('#die');
  d.classList.remove('spin', 'land'); void d.offsetWidth; d.classList.add('spin');
  const k = speed < 1 ? 4 : 7;
  for (let i = 0; i < k; i++) { showDie(1 + Math.floor(Math.random() * 6)); await wait(60); }
  showDie(n); d.classList.remove('spin'); void d.offsetWidth; d.classList.add('land');
  $('#dieSr').textContent = 'יצא ' + n;
}
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
function optLabel(o) {
  const base = o.netLabel ? o.label.replace(` (${o.netLabel})`, '').replace(`(${o.netLabel})`, '').replace(PAREN_MONEY, '').trim() : o.label;
  const net = o.netLabel ? `<small class="net ${cls(o.net)}">${escI(o.netLabel)}</small>` : '';
  return `<span>${escI(base)}</span>${net}`;
}
function optButtons(ev, filter = () => true, extraCls = '') {
  const opts = ev.options.filter(filter);
  const long = opts.some((o) => o.label.length > 26 || o.netLabel) || opts.length > 3;
  return `<div class="acts ${long ? 'col' : ''} ${extraCls}">${opts.map((o, i) => `<div class="opt"><button data-o="${esc(o.id)}" class="${o.primary ? 'primary' : ''} ${o.kind === 'sell' ? 'sell' : ''} ${o.netLabel ? 'hasnet' : ''}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}>${optLabel(o)}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${escI(o.reason)}</small>` : ''}</div>`).join('')}</div>`;
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
  const roi = d.down ? Math.round((d.cf * 12 / d.down) * 100) : 0;
  return `<bdi dir="ltr" class="eq"><span class="${cls(d.cf)}">${fmtM(d.cf)}</span> × 12 ÷ ${fmtM(d.down)} = <b class="${cls(roi)}">${roi}%</b></bdi> בשנה`;
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
  const actions = ev.type === 'mystery' && ev.data.kind === 'quiz' ? optButtons(quizView(ev), () => true, 'quiz')
    : ev.type === 'market' && ev.data.kind === 'sell' && ev.data.offers.length ? optButtons(ev, (o) => o.kind !== 'sell') // sales are buttons inside the list
    : optButtons(ev);
  c.innerHTML = head(ev) + body + shortfallLine(ev.data) + '<p class="err" role="alert"></p>' + actions;
  if (first) c.scrollTop = 0;
}

/* ---------- per-type bodies */
const BODY = {
  payday(ev) {
    const d = ev.data;
    return grid([row('משכורת', sgn(d.salary), 'pos'), row('הכנסה פסיבית', sgn(d.passive), cls(d.passive)), row('הוצאות', fmtM(-d.expenses), 'neg'), `<div class="row"><b>נכנס לכיס</b>${big(d.cashflow)}</div>`]) +
      '<p class="note">מעכשיו ימי משכורת יקרו לבד, בלי לעצור את המשחק — המטבעות יעופו ישר לקופה.</p>';
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
    return grid(rows) + extra + roiBtn + cash;
  },
  doodad(ev) {
    const d = ev.data; const canSkip = ev.options.some((o) => o.id === 'skip');
    const kind = d.need === true ? '<p class="chipline"><em class="b warn">הוצאה הכרחית — אי אפשר לוותר</em></p>' : canSkip ? '<p class="chipline"><em class="b ok">פיתוי — מותר לוותר</em></p>' : '';
    return kind + grid([`<div class="row"><span>מחיר</span><b class="big num neg">${fmtM(d.amount)}</b></div>`,
      d.installment ? row('בתשלומים', `${fmtM(d.installment)} בחודש, עד שתסגור`, 'neg') : '',
      d.sub ? row('כמנוי', `${fmtM(d.sub)} בחודש — לתמיד`, 'neg') : '']) +
      `<p class="note">יש לך ${num(fmtM(d.cash))} במזומן.${d.shortfall == null && d.amount > d.cash ? ' אין מספיק — אם תשלם, הבנק ייתן הלוואה.' : ''}</p>`;
  },
  market(ev) {
    const d = ev.data;
    if (d.kind === 'sell') {
      if (!d.offers.length) return '<p class="empty">אין לך נכסים מהסוג הזה.</p>';
      return `<div class="sells">${d.offers.map((o) => `<div class="sellrow"><div><b>${esc(o.name)}</b><p class="note">הצעה ${num(fmtM(o.offer))}${o.debt ? ` · סוגרים חוב ${num(fmtM(o.debt))}` : ''} · נכנס לך <b class="num pos">${fmtM(o.net)}</b><br>רווח על ההון: ${num(sgn(o.profit), cls(o.profit))} · מוותר על ${num(sgn(o.cf), cls(o.cf))} בחודש</p></div><button data-o="sell:${esc(o.assetId.slice(1))}" class="sell">למכור</button></div>`).join('')}</div>`;
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
    if (d.kind === 'quiz') return `<div class="quizq"><b>${escI(d.question)}</b><p class="note">תשובה נכונה = ${num(fmtM(d.reward), 'pos')}</p></div>`;
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
};
const cnt = (n, one, many) => (n === 0 ? `אין ${many}` : n === 1 ? `${one} אחד` : `${n} ${many}`);
const FEM = new Set(['הריבית', 'ההשפעה']);
/** "X עלה/ירד/לא זז" with gender agreement (הריבית עלתה, הדולר עלה). */
const moved = (what, dir) => { const f = FEM.has(what); return dir === 0 ? `${what} ${f ? 'לא זזה' : 'לא זז'}` : `${what} ${dir > 0 ? (f ? 'עלתה' : 'עלה') : (f ? 'ירדה' : 'ירד')}`; };
function fromTo(a, b, f, what, goodDir) {
  const dir = Math.sign(b - a); const good = goodDir ? dir * goodDir : 0;
  return `<div class="fromto"><span class="num">${f(a)}</span><i class="${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${dir > 0 ? ICON.up : dir < 0 ? ICON.down : '='}</i><b class="num ${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${f(b)}</b><small>${moved(what, dir)}</small></div>`;
}

/* ---------- trade window (v1.1: slider dir=ltr, clamp, ±steps, max/all/reset, repeated buy/sell, 'סיום') */
function tradeHtml(ev) {
  const d = ev.data; const [s1, s2] = d.step || [10, 100]; const u = esc(d.unit);
  return `${head(ev)}<div class="grid"><div class="row"><span>${esc(d.name)}</span><b class="big num" id="qprice">${fmtP(d.price)}</b></div>
    <div class="row"><span>יש לך</span><span class="num rtl" id="qhold"></span></div><div class="row" id="qgainRow" hidden><span>אם תמכור הכל עכשיו</span><b class="num" id="qgain"></b></div><div class="row"><span>מזומן</span><span class="num" id="qcash"></span></div>
    ${d.div ? `<div class="row"><span>תשלום חודשי ליחידה</span><span class="num pos">${fmtP(d.div)}</span></div>` : ''}</div>
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
  const gain = d.qty ? Math.round((d.price - d.avg) * d.qty) : 0;
  $('#qgainRow').hidden = !d.qty;
  if (d.qty) { const g = $('#qgain'); g.textContent = (gain > 0 ? '+' : '') + fmtM(gain); g.className = 'num ' + cls(gain); }
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
