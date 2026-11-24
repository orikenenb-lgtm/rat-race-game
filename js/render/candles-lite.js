// Light candle view — the VIEW side (CATALOG-25 §3.9): a lightweight SVG Japanese-candlestick chart + its readout, and the
// HTML of the full view / the trade card's compact block. No dependency, no engine import, no randomness: it draws only the
// view model of js/candlelog.js (candles built from the prices the game really had).
//
// Reading the chart (colour is never the only signal): a HOLLOW body = the month closed above its open (▲), a FILLED body =
// it closed below (▼), a flat line = no change (—); a dashed body = the month still open; a dotted one = a month the pawn
// passed in the same roll. ▲ / ▼ markers under / over a candle = your own buys / sells that month.
// Interaction: the chart is ONE focusable role=slider (big touch target, axe target-size safe): tap / hover / drag picks the
// nearest candle; ← → Home End PageUp PageDown move the selection; the readout + aria-valuetext give month · O · H · L · C.
// Time runs left → right (dir=ltr inside the chart, like every price chart); the labels around it are Hebrew RTL and every
// number is an LTR isolate (.num). touch-action: pan-y — vertical scroll still works, no double-tap zoom on the chart.

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** share price as the engine prints it (E.fmtP): ₪0.05 / ₪15 / ₪1,234.5 */
export const fmtP = (n) => '₪' + (n === 0 ? '0' : Math.abs(n) < 1 ? Math.abs(n).toFixed(2) : groups(+Math.abs(n).toFixed(2)));
// a sign before ₪ gets a word joiner (U+2060), like ui.js escI: Chrome otherwise shows "+₪4" as "₪4+" inside the RTL card
const WJ = '\u2060';
const fmtMoney = (n) => { const r = Math.round(n); return (r < 0 ? '−' + WJ : '') + '₪' + groups(Math.abs(r)); };
const sgnP = (n) => (n > 0 ? '+' + WJ : n < 0 ? '−' + WJ : '') + fmtP(n);
const sgnM = (n) => (Math.round(n) > 0 ? '+' + WJ : '') + fmtMoney(n);
const pctS = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.round(Math.abs(x) * 10) / 10) + '%';
const N = (n) => Math.round(n).toLocaleString('en-US');
const num = (s, c = '') => `<span class="num${c ? ' ' + c : ''}">${esc(s)}</span>`;
const dirOf = (c) => (c.c > c.o ? 'up' : c.c < c.o ? 'down' : 'flat');
const ARROW = { up: '▲', down: '▼', flat: '—' };
const WORD = { up: 'עלה', down: 'ירד', flat: 'לא זז' };
const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');

export const EDU = 'סימולציה בלבד: המחירים כאן נוצרים במשחק. נרות מהעבר לא מנבאים את העתיד.';
/** w10's market screen (the owner's brief): one short line, always visible under the chart */
export const SIM_NOTE = 'סימולציה — גרף ותוצאה במשחק אינם מבטיחים תוצאה בעולם האמיתי';
export const FLAT_NOTE = 'המחיר זז רק כשיש חדשות — לכן הרבה נרות שטוחים.';

/** the plain-text line for one candle (readout + aria-valuetext) */
export function candleText(s, c, { html = false } = {}) {
  const d = dirOf(c); const ch = c.c - c.o; const pc = c.o ? (c.c / c.o - 1) * 100 : 0;
  const n = (x, k = '') => (html ? num(x, k) : x);
  const when = c.open ? `חודש ${n(String(c.m))} (עדיין פתוח)` : `חודש ${n(String(c.m))}`;
  const parts = [when, `פתיחה ${n(fmtP(c.o))}`, `גבוה ${n(fmtP(c.h))}`, `נמוך ${n(fmtP(c.l))}`, `${c.open ? 'עכשיו' : 'סגירה'} ${n(fmtP(c.c))}`,
    `${ARROW[d]} ${WORD[d]}${d === 'flat' ? '' : ` ${n(sgnP(ch), cls(ch))} (${n(pctS(pc), cls(ch))})`}`];
  if (c.v != null) parts.push(`מחזור ${n(N(c.v))} מניות${c.n != null ? ` · ${n(N(c.n))} עסקאות` : ''}`);   // w10: volume (engine prints / shares)
  if (c.x) parts.push('חודש שעבר באותה הטלה (שני ימי משכורת בהטלה אחת)');
  if (c.b || c.s) parts.push(`העסקאות שלך: ${c.b ? `קנית ${n(N(c.b))}` : ''}${c.b && c.s ? ' · ' : ''}${c.s ? `מכרת ${n(N(c.s))}` : ''}`);
  const nw = (s.news || []).find((x) => x.m === c.m);
  if (nw) parts.push(`📰 ${html ? esc(nw.text) : nw.text}`);
  return parts.join(' · ');
}

/**
 * The SVG of the last `n` candles of a series view (s.cand, oldest → newest). W/H in CSS px (the viewBox is 1:1, so 12px
 * labels stay 12px). sel = index into the shown candles. → {svg, shown, slot, x0}
 */
export function svgFor(s, { W = 340, H = 150, n = 36, sel = null, compact = false } = {}) {
  const shown = (s.cand || []).slice(-n);
  let hi = -Infinity, lo = Infinity;
  for (const c of shown) { if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; }
  if (!shown.length) { hi = 1; lo = 0; }
  if (hi === lo) { const d = Math.max(Math.abs(hi) * 0.05, 0.01); hi += d; lo -= d; }
  const pad = (hi - lo) * 0.08; hi += pad; lo = Math.max(0, lo - pad);
  const tickTxt = (t) => fmtP(t >= 100 ? Math.round(t) : Math.round(t * 100) / 100);
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  const padL = 6, padR = Math.max(compact ? 44 : 50, 10 + 7.2 * Math.max(...ticks.map((t) => tickTxt(t).length))), padT = 10, padB = compact ? 18 : 22;
  const plotW = Math.max(40, W - padL - padR), plotH = Math.max(30, H - padT - padB);
  const slot = plotW / Math.max(shown.length, compact ? 12 : 18);
  const x0 = padL + plotW - shown.length * slot;   // the newest candle sits next to the price axis (right); a short history starts further in
  const y = (p) => padT + ((hi - p) / (hi - lo)) * plotH;
  const bw = Math.max(2, Math.min(18, slot * 0.62));
  const f = (v) => Math.round(v * 10) / 10;
  const out = [];
  // grid + price labels (right edge, LTR numbers)
  for (const t of ticks) out.push(`<line class="cdl-grid" x1="${padL}" x2="${f(padL + plotW)}" y1="${f(y(t))}" y2="${f(y(t))}"/><text class="cdl-ax" x="${f(padL + plotW + 4)}" y="${f(y(t) + 4)}">${esc(tickTxt(t))}</text>`);
  // selection band (moved by the binder)
  const si = sel == null ? shown.length - 1 : sel;
  out.push(`<rect class="cdl-sel" x="${f(x0 + si * slot)}" y="${padT - 4}" width="${f(slot)}" height="${f(plotH + 8)}" rx="3"/>`);
  shown.forEach((c, i) => {
    const cx = f(x0 + i * slot + slot / 2); const d = dirOf(c);
    const k = ['cdl-c', 'cdl-' + d, c.open ? 'cdl-open' : '', c.x ? 'cdl-skip' : ''].filter(Boolean).join(' ');
    const yo = y(c.o), yc = y(c.c);
    let g = `<g class="${k}"><line class="cdl-wick" x1="${cx}" x2="${cx}" y1="${f(y(c.h))}" y2="${f(y(c.l))}"/>`;
    if (d === 'flat') g += `<line class="cdl-doji" x1="${f(cx - bw / 2)}" x2="${f(cx + bw / 2)}" y1="${f(yo)}" y2="${f(yo)}"/>`;
    else g += `<rect class="cdl-body" x="${f(cx - bw / 2)}" y="${f(Math.min(yo, yc))}" width="${f(bw)}" height="${f(Math.max(1.5, Math.abs(yc - yo)))}"/>`;
    if (c.b) g += `<path class="cdl-buy" d="M${cx} ${f(y(c.l) + 4)} l4 7 h-8z"/>`;
    if (c.s) g += `<path class="cdl-sell" d="M${cx} ${f(y(c.h) - 4)} l4 -7 h-8z"/>`;
    out.push(g + '</g>');
  });
  // w10: volume bars along the bottom of the plot (engine volume per month; low, behind nothing — the readout / table carry the number)
  const vmax = Math.max(0, ...shown.map((c) => +c.v || 0));
  if (vmax > 0) shown.forEach((c, i) => { const hh = Math.max(1, ((+c.v || 0) / vmax) * plotH * 0.18); out.push(`<rect class="cdl-vol" x="${f(x0 + i * slot + slot / 2 - bw / 2)}" y="${f(padT + plotH - hh)}" width="${f(bw)}" height="${f(hh)}"/>`); });
  // month labels: first, middle, last (numbers only; the caption under the chart says "חודשי משחק")
  const lab = shown.length ? [...new Set([0, Math.floor((shown.length - 1) / 2), shown.length - 1])] : [];
  for (const i of lab) out.push(`<text class="cdl-ax cdl-mx" x="${f(x0 + i * slot + slot / 2)}" y="${f(H - 5)}" text-anchor="middle">${shown[i].m}</text>`);
  const svg = `<svg class="cdl-svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}" aria-hidden="true" focusable="false">${out.join('')}</svg>`;
  return { svg, shown, slot, x0 };
}

/**
 * Mount an interactive chart into `host` (an empty element in the page). → {select(i), destroy()}.
 * opts: {n, H, compact, label, onSelect(c, i)}
 */
export function mountChart(host, s, opts = {}) {
  if (!host) return null;
  const n = opts.n || (opts.compact ? 12 : 36); const H = opts.H || (opts.compact ? 104 : 168);
  const W = Math.max(220, Math.round(host.clientWidth || host.getBoundingClientRect().width || 320));
  const { svg, shown, slot, x0 } = svgFor(s, { W, H, n, compact: !!opts.compact });
  let sel = shown.length - 1;
  host.innerHTML = `<div class="cdl-chart" role="slider" tabindex="0" dir="ltr" aria-label="${esc(opts.label || `נרות חודשיים של ${s.symbol}`)}. חיצים ימינה ושמאלה לבחירת חודש"
    aria-valuemin="1" aria-valuemax="${Math.max(1, shown.length)}" aria-valuenow="${Math.max(1, sel + 1)}">${svg}</div><p class="cdl-ro"></p>`;
  const ch = host.querySelector('.cdl-chart'); const ro = host.querySelector('.cdl-ro'); const band = host.querySelector('.cdl-sel');
  const select = (i) => {
    if (!shown.length) { ro.textContent = 'אין עדיין נרות.'; ch.setAttribute('aria-valuetext', 'אין עדיין נרות'); return; }
    sel = Math.max(0, Math.min(shown.length - 1, i | 0)); const c = shown[sel];
    band.setAttribute('x', String(Math.round((x0 + sel * slot) * 10) / 10));
    ch.setAttribute('aria-valuenow', String(sel + 1)); ch.setAttribute('aria-valuetext', candleText(s, c));
    ro.innerHTML = candleText(s, c, { html: true }); ro.dataset.m = String(c.m); ro.dataset.ohlc = [c.o, c.h, c.l, c.c].join(','); if (c.v != null) ro.dataset.v = String(c.v);
    host.querySelectorAll('.cdl-c.on').forEach((g) => g.classList.remove('on'));
    const g = host.querySelectorAll('.cdl-c')[sel]; if (g) g.classList.add('on');
    if (opts.onSelect) try { opts.onSelect(c, sel); } catch (e) { /* ignore */ }
  };
  const at = (ev) => { const r = ch.querySelector('svg').getBoundingClientRect(); const sx = (ev.clientX - r.left) * (W / Math.max(1, r.width)); return Math.floor((sx - x0) / slot); };
  let drag = false;
  const onDown = (ev) => { drag = true; select(at(ev)); };
  const onMove = (ev) => { if (ev.pointerType === 'mouse' || drag) select(at(ev)); };
  const onUp = () => { drag = false; };
  const onKey = (ev) => {
    const k = ev.key; let i = sel;
    if (k === 'ArrowRight' || k === 'ArrowUp') i++; else if (k === 'ArrowLeft' || k === 'ArrowDown') i--; else if (k === 'Home') i = 0; else if (k === 'End') i = shown.length - 1;
    else if (k === 'PageUp') i += 6; else if (k === 'PageDown') i -= 6; else return;
    ev.preventDefault(); ev.stopPropagation(); select(i);
  };
  ch.addEventListener('pointerdown', onDown); ch.addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  ch.addEventListener('keydown', onKey);
  select(sel);
  return { select, get sel() { return sel; }, shown, destroy() { removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); } };
}

const LEGEND = `<p class="cdl-leg"><span><i class="lg up" aria-hidden="true"></i> חלול ▲ = עלה בחודש</span><span><i class="lg down" aria-hidden="true"></i> מלא ▼ = ירד</span><span><i class="lg flat" aria-hidden="true"></i> קו — = לא זז</span><span>קווקו = החודש הנוכחי</span></p>`;
const chgLine = (s, what = 'החודש') => { const d = s.chg > 0 ? 'up' : s.chg < 0 ? 'down' : 'flat'; return `${ARROW[d]} ${d === 'flat' ? `לא זז ${what}` : `${num(sgnP(s.chg), cls(s.chg))} (${num(pctS(s.chgPct), cls(s.chg))}) ${what}`}`; };

/** the compact block inside the trade card (the chart is mounted into .cdl-host afterwards) */
export function miniHtml(s) {
  return `<div class="cdl-mh"><b>📈 נרות חודשיים · ${num(s.symbol)}</b><small>${chgLine(s)}</small></div><div class="cdl-host" data-cdl-key="${esc(s.key)}"></div>
    <p class="note cdl-edu">${esc(EDU)}</p><button type="button" class="chip cdl-more" data-cdl-full="${esc(s.key)}">📈 גרף מלא, חדשות ורווח/הפסד</button>`;
}

/** the month table (OHLC + change; + volume when the series has it — w10); `open` = shown expanded */
export function tableHtml(s, { open = false } = {}) {
  const vol = s.cand.some((c) => c.v != null);
  const rows = s.cand.slice().reverse().map((c) => { const d = dirOf(c); return `<tr data-m="${esc(String(c.m))}"><th scope="row">${num(String(c.m))}${c.open ? ' <small>פתוח</small>' : ''}${c.x ? ' <small>בהטלה</small>' : ''}</th><td>${num(fmtP(c.o))}</td><td>${num(fmtP(c.h))}</td><td>${num(fmtP(c.l))}</td><td>${num(fmtP(c.c))}</td><td class="${cls(c.c - c.o)}">${ARROW[d]} ${d === 'flat' ? '' : num(pctS(c.o ? (c.c / c.o - 1) * 100 : 0))}</td>${vol ? `<td>${num(N(+c.v || 0))}</td>` : ''}</tr>`; }).join('');
  return `<details class="cdl-tbl"${open ? ' open' : ''}><summary>טבלת חודשים: פתיחה · גבוה · נמוך · סגירה${vol ? ' · מחזור' : ''}</summary><div class="cdl-tw"><table><thead><tr><th scope="col">חודש</th><th scope="col">פתיחה</th><th scope="col">גבוה</th><th scope="col">נמוך</th><th scope="col">סגירה</th><th scope="col">שינוי</th>${vol ? '<th scope="col">מחזור (מניות)</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
/** one listing's full body (the chart is mounted into .cdl-host afterwards) */
export function bodyHtml(s, vm) {
  const H = s.hold;
  const hold = H ? (H.qty ? `<div class="cdl-hold"><div class="row"><span>יש לך</span><b class="num">${esc(N(H.qty))} ${esc(s.unit)}</b></div>
      <div class="row"><span>עלות (כמה שילמת)</span>${num(fmtMoney(H.basis))}</div><div class="row"><span>מחיר ממוצע ליחידה</span>${num(fmtP(H.avg))}</div>
      <div class="row"><span>שווי עכשיו</span>${num(fmtMoney(H.value))}</div>
      <div class="row"><span>רווח / הפסד על הנייר</span><b>${num(sgnM(H.pnl), cls(H.pnl))} (${num(pctS(H.pnlPct), cls(H.pnl))})</b></div></div>`
    : `<p class="note">אין לך ${esc(s.unit)} של ${num(s.symbol)} כרגע.</p>`) : '';
  const ended = !s.live ? `<p class="warn">${s.kind === 'crypto' ? `המטבע ${num(s.symbol)} מת${s.endedM ? ` — הושק מטבע חדש בחודש ${num(String(s.endedM))}` : ''}.` : 'הרישום הזה הסתיים.'}${s.wiped && s.wiped.qty ? ` נמחקו ${num(N(s.wiped.qty))} יחידות ששוות היו ${num(fmtMoney(s.wiped.value))}.` : ''} ההיסטוריה נשמרת תחת השם שלו.</p>` : '';
  const dead = s.live && s.dead ? `<p class="warn">המטבע ${num(s.symbol)} קרס ואי אפשר לקנות אותו. אם יושק מטבע חדש — הוא יקבל היסטוריה משלו.</p>` : '';
  const news = (s.news || []).filter((x) => x.p1 !== x.p0 || /נמחקו|הושק/.test(x.text)).slice(0, 8);
  const newsHtml = news.length ? `<h3 class="cdl-h3">📰 מה הזיז את המחיר</h3><ul class="cdl-news">${news.map((x) => { const d = x.p1 > x.p0 ? 'up' : x.p1 < x.p0 ? 'down' : 'flat'; const pc = x.p0 ? (x.p1 / x.p0 - 1) * 100 : 0;
    return `<li><span class="cdl-nm">חודש ${num(String(x.m))}</span> ${esc(x.text)}${d === 'flat' ? '' : ` <span class="cdl-nd">${ARROW[d]} ${num(fmtP(x.p0))} ← ${num(fmtP(x.p1))} (${num(pctS(pc), cls(x.p1 - x.p0))})</span>`}</li>`; }).join('')}</ul>` : '<p class="note">עוד לא היו חדשות שהזיזו את המחיר.</p>';
  const table = tableHtml(s);
  const partial = vm && vm.diverged ? `<p class="note">ההיסטוריה המלאה לא זמינה במשחק הזה — הנרות מתחילים בחודש ${num(String(vm.partialFrom ?? s.listedM))}.</p>` : '';
  return `<div class="cdl-head"><div class="cdl-id"><b class="cdl-name">${esc(s.name)}</b><small>סימול ${num(s.symbol)} · ${esc(s.generic ? `סוג: ${s.sector}` : `ענף: ${s.sector}`)}</small></div>
      <div class="cdl-px"><b class="num">${esc(fmtP(s.price))}</b><small>${s.live ? chgLine(s) : 'מחיר אחרון'}</small><small>${s.live ? `מאז ${s.listedM > 1 ? `ההנפקה (חודש ${num(String(s.listedM))})` : 'תחילת המשחק'}: ${num(sgnP(s.since), cls(s.since))} (${num(pctS(s.sincePct), cls(s.since))})` : ''}</small></div></div>
    ${ended}${dead}${hold}
    <div class="cdl-host" data-cdl-key="${esc(s.key)}"></div><p class="cdl-cap">חודשי משחק, משמאל (ישן) לימין (עכשיו) · נר אחד = חודש אחד</p>${LEGEND}
    ${s.flatShare > 0.5 ? `<p class="note">${esc(FLAT_NOTE)}</p>` : ''}${partial}
    ${newsHtml}${table}<p class="note cdl-edu">🎓 ${esc(EDU)}</p>`;
}

/** the full view: listing buttons + the selected listing's body */
export function fullHtml(vm, key) {
  const all = vm.list.concat(vm.ended);
  const cur = all.find((s) => s.key === key) || vm.list[0];
  const tab = (s) => `<button type="button" class="chip cdl-tab" data-cdl-tab="${esc(s.key)}" aria-pressed="${s.key === cur.key}">${esc(s.symbol)}${s.live ? '' : ' (קודם)'}</button>`;
  return `<div class="cdl-full"><div class="cdl-tabs" role="group" aria-label="בחירת נייר ערך">${vm.list.map(tab).join('')}${vm.ended.length ? `<span class="cdl-old">מטבעות קודמים:</span>${vm.ended.map(tab).join('')}` : ''}</div>
    <div class="cdl-body">${cur ? bodyHtml(cur, vm) : '<p class="note">אין כאן ניירות ערך.</p>'}</div></div>`;
}
