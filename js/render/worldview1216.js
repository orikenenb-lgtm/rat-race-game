// w12 האימפריה / w16 ארץ השדות — the in-game HTML of the two worlds (cards, the panels' bodies, the HUD chip, the sheet box, the arm text of
// a two-tap action). PURE: strings only, no DOM, no engine import, no arithmetic beyond formatting the engine's own numbers (ev.data,
// worldIndicators.holding / .harvest, panel.gauges / table / rows / actions / storm). ui.js passes its formatters in
// H = { esc, escI, num, mS, mSg, pctI, row, grid, cls, iso, sgn }.
//
// w12: the division card (tile Z: the profit RANGE that contains the truth, the price vs the fair range, 40 % from HQ + the division's own debt,
// the rate guaranteed vs ring-fenced, the storm betas in words, due diligence keeps the card open and narrows the range — the engine
// re-describes the same card: ctl.update), the options with their cash / month / risk in WORDS (contagion, unknown), the market-news block
// (ev.data.hd), the group panel "מפת הקבוצה והערבויות" (coverage in months and ×, the rating in letters and words, months without a default,
// the storm's shocks per factor, a row per division — 🔗 guaranteed / 🚧 ring-fenced, health, the month, value, debt, its own actions — and the
// group's actions; a sale and the restructuring need a second tap, and the restructuring says "at most ★" before it).
// w16: the produce-exchange card (tile H: an export contract on a growing field — the yield range, what is already locked, the quantity risk
// in words — or water rights), the market-news block (ev.data.hv), the farm panel "השדות והגידור" (income vs ₪5M, cash vs the margin a call
// would need, the drought quota, the silo; an accessible price table; a row per field with its yield range narrowing to harvest, crop, phase,
// the hedge and the margin posted, and its actions — a hedge that adds tonnes shows the deposit and the call rule BEFORE the confirming tap).
import { DIV_KIND_HE, DIV_HOME_EMOJI, CROP_HE, CROP_EMOJI, PHASE_HE, FIELD_REGIME_HE } from './vocab.js';

const pct = (x) => `${Math.round((+x || 0) * 100)}%`;
const pct1 = (x) => `${Math.round((+x || 0) * 1000) / 10}%`;
const tons = (n) => `${Math.round(+n || 0).toLocaleString('en-US')} טון`;
const x2 = (v) => (Math.round((+v || 0) * 100) / 100).toFixed(2);
const mo = (v) => `${Math.round((+v || 0) * 10) / 10}`;
/** a [lo, hi] range on a 0–1 track; words carry the numbers */
const rangeBar = (lo, hi, cls = '') => `<span class="rbar ${cls}" aria-hidden="true"><i style="inset-inline-start:${Math.round(Math.max(0, Math.min(1, lo)) * 100)}%;width:${Math.max(2, Math.round((Math.min(1, hi) - Math.max(0, lo)) * 100))}%"></i></span>`;
const FACTOR_HE = ['צמיחה', 'ריבית', 'אנרגיה', 'מטבע'];
export const RATING_WORDS = Object.freeze({ AA: 'מצוין', A: 'טוב', BBB: 'סביר', BB: 'חלש', B: 'חלש מאוד', CCC: 'על סף חדלות פירעון' });
/** an option's / action's preview.risk in words (never a colour or an icon alone) */
export const RISK_HE = Object.freeze({
  contagion: 'סיכון הדבקה: אם היא נופלת, החוב שלה עובר למטה והדירוג יורד', unknown: 'הרווח האמיתי עוד לא נבדק',
  default: 'בלי תמיכה: שני חודשי גירעון = חדלות פירעון של הקבוצה', loss: 'בלי תמיכה: שני חודשי גירעון = הבנקים לוקחים את החטיבה',
  board: 'הדירקטוריון ילחץ: הדיבידנד המינימלי עולה בשנה הבאה', stars: 'המשחק ייגמר לכל היותר בכוכב אחד (★)',
  quantity: 'אם היבול לא יספיק — קונים את החסר בשוק, ועוד 10%', margin: 'ביטחונות: אם המחיר עולה, יבקשו עוד מזומן', debt: 'משכנתא על השדה',
});
const riskLine = (r) => (r && RISK_HE[r] ? `⚠️ ${RISK_HE[r]}` : '');
const betaWords = (b) => (b || []).map((x, i) => `${FACTOR_HE[i]} ×${(Math.round(x * 100) / 100).toString()}`).join(' · ');

/* ============================================================ w12: the division card (tile Z) */
export function divisionHtml(H, ev) {
  const d = ev.data || {};
  const fairMid = (d.fairLo + d.fairHi) / 2;
  const verdict = d.fairHi < d.price ? { t: 'המחיר מעל כל הטווח ההוגן', c: 'neg' } : d.fairLo >= d.price ? { t: 'המחיר מתחת לכל הטווח ההוגן', c: 'pos' } : { t: fairMid >= d.price ? 'המחיר בתוך הטווח — מתחת לאמצע' : 'המחיר בתוך הטווח — מעל האמצע', c: fairMid >= d.price ? '' : 'neg' };
  const head = `<div class="div-h"><span class="b">${H.esc(DIV_HOME_EMOJI[d.kind] || '🏢')} ${H.esc(d.kindName || DIV_KIND_HE[d.kind] || '')}</span><span class="b">${H.esc(d.driver || '')}</span>${d.dd ? '<span class="b ok">🔍 נבדק</span>' : '<span class="b warn">❔ לא נבדק</span>'}${d.trophy ? '<span class="b warn">👑 חטיבת יוקרה: מעמד, לא רווח</span>' : ''}</div>`;
  const rows = [
    H.row('רווח תפעולי בחודש', `${H.mS(d.lo)}–${H.mS(d.hi)}`, 'wrap'),
    `<div class="row acq-r"><span>${d.dd ? 'הטווח אחרי הבדיקה (±6%)' : 'הטווח לפני בדיקה (±22%)'} — הרווח האמיתי בתוכו</span>${rangeBar((d.lo / d.est) / 2, (d.hi / d.est) / 2, d.dd ? 'narrow' : '')}</div>`,
    H.row('המחיר', H.mS(d.price)), H.row('עכשיו מקופת המטה (40%)', H.mS(d.down)), H.row('חוב על החטיבה', H.mS(d.debt)),
    H.row('ריבית על החוב', `בערבות המטה ${pct1(d.rateG)} · מגודרת ${pct1(d.rateR)}`, 'wrap'),
    H.row('שווי הוגן (100 חודשי רווח)', `${H.mS(d.fairLo)}–${H.mS(d.fairHi)}`, 'wrap'), H.row('המחיר מול השווי', verdict.t, `${verdict.c} wrap`),
    H.row('בריאות', `${d.health} מתוך 100${d.health < 60 ? ' — חלשה: הבנקים יחשבו פעמיים' : ''}`, d.health < 60 ? 'neg wrap' : 'wrap'),
    H.row('חשיפה לסערות (ככל שגבוה — נפגעת יותר)', betaWords(d.beta), 'wrap'),
    H.row('מקום לעוד חטיבות', d.slotsFree > 0 ? `${d.slotsFree} מתוך 8` : 'אין — 8 חטיבות', d.slotsFree > 0 ? '' : 'neg'),
    H.row('התקציב שהמנטור רואה (מעל רזרבה של 15 חודשים)', H.mS(d.budget), 'wrap'),
  ];
  const dd = `<p class="note">"בחודש" על כפתור קנייה = אמצע הטווח פחות החזר החוב של החטיבה. ${d.dd ? 'הבדיקה צמצמה את הטווח ל־±6%. האמת בתוכו.' : `בדיקה (${H.esc(H.mS(d.fee))}) מצמצמת את הטווח ל־±6% — והכרטיס נשאר פתוח.`} 🔗 בערבות המטה = ריבית זולה, אבל נפילה שלה עוברת לכולם. 🚧 מגודרת = ריבית גבוהה ו־30% מהעודף לבנקים, אבל אם היא קורסת הם לוקחים רק אותה.</p>`;
  return head + H.grid(rows) + dd + (d.note ? `<p class="note">${H.escI(d.note)}</p>` : '');
}
/** the card's buttons: each with its cash now, its month (profit − the debt service) and its risk in words; pass = safe */
export function riskActions(H, ev) {
  const short = (o) => String(o.label || '').replace(/\s*\([^()]*\)\s*$/, '');   // the money moves to the line below (the engine's label keeps them in its parenthesis)
  const b = (o, i) => { const P = o.preview || {};
    const rate = /ריבית ([\d.]+%)/.exec(o.label || ''); const free = o.id === 'pass' || o.id === 'decline';
    const sub = free ? 'בלי לשלם כלום' : [P.cash ? `${H.sgn(P.cash)} עכשיו` : '', rate ? `ריבית ${rate[1]}` : '', P.monthly ? `${H.sgn(P.monthly)} בחודש` : '', P.months && o.id === 'accept' ? `עד הקציר: ${P.months} חודשים` : '', o.loanAmount ? `הלוואה ${H.mS(o.loanAmount)}` : ''].filter(Boolean).join(' · ');
    const rk = P.risk && RISK_HE[P.risk] ? `<small class="net sub rk-w">⚠️ ${H.esc(RISK_HE[P.risk])}</small>` : '';
    return `<div class="opt"><button data-o="${H.esc(o.id)}" class="${o.primary ? 'primary' : ''} hasnet rk-b${P.risk ? ' rk-on' : ''}" data-risk="${H.esc(P.risk || '')}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}><span>${H.escI(short(o) || o.label)}</span><small class="net sub">${H.escI(sub)}</small>${rk}${o.primary ? '<small class="tagc rec">המנטור</small>' : ''}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${H.escI(o.reason)}</small>` : ''}</div>`; };
  return `<div class="acts col rk-acts">${ev.options.map(b).join('')}</div>`;
}
/* ============================================================ w16: the produce-exchange card (tile H) */
export function produceHtml(H, ev) {
  const d = ev.data || {};
  if (d.kind === 'water') return `<div class="div-h"><span class="b">💧 זכויות מים</span></div>${H.grid([H.row('המחיר', H.mS(d.price)), H.row('מכסת המים שלך בבצורת היום', pct(d.quota)), H.row('אחרי הקנייה', 'עוד 10% מהמכסה בכל בצורת', 'wrap')])}${d.note ? `<p class="note">${H.escI(d.note)}</p>` : ''}`;
  const R = d.range || {}; const E = R.mid || 1;
  const rows = [H.row('השדה', `שדה ${(+d.slot || 0) + 1}`), H.row('הכמות בחוזה', tons(d.q)), H.row('המחיר', `₪${(+d.px || 0).toLocaleString('en-US')} לטון (פי ${d.k} מהחוזה העתידי)`, 'wrap'),
    H.row(`טווח היבול — עוד ${R.months || 0} חודשים לקציר`, `${tons(R.lo)}–${tons(R.hi)}`, 'wrap'),
    `<div class="row acq-r"><span>הטווח מצטמצם עד הקציר — היבול האמיתי בתוכו</span>${rangeBar((R.lo / E - 0.5), (R.hi / E - 0.5))}</div>`,
    H.row('כבר נעול בשדה הזה', tons(d.hedged)), H.row('הקצה הנמוך של הטווח', tons(R.lo)),
    H.row('ביטחונות', 'בלי — זה חוזה עם קונה, לא בבורסה', 'wrap')];
  return `<div class="div-h"><span class="b">🚢 חוזה ייצוא</span><span class="b warn">⚠️ ${H.esc(RISK_HE.quantity)}</span></div>${H.grid(rows)}${d.note ? `<p class="note">${H.escI(d.note)}</p>` : ''}`;
}
/* ============================================================ news blocks */
const HD_MK = { recession: 'ארבעה–חמישה חודשים של פחות קונים בכל החטיבות הרגישות לצמיחה', energy: 'האנרגיה מרוויחה, המפעלים משלמים', review: 'סוכנות הדירוג בודקת את כיסוי הנזילות', antitrust: 'החטיבה הגדולה נמכרת ב־85% מהשווי (בקבוצה של 6 ומעלה)', boom: 'ארבעה חודשים של יותר קונים' };
export function hdNewsHtml(H, X) {
  if (!X || !X.mk) return '';
  return H.grid([H.row('מה זה עושה', HD_MK[X.mk] || '', 'wrap'), X.was && X.was !== X.rating ? H.row('הדירוג', `${X.was} ← ${X.rating}`, 'wrap') : H.row('הדירוג עכשיו', `${X.rating} — ${RATING_WORDS[X.rating] || ''}`, 'wrap'),
    X.mk === 'antitrust' ? H.row('איזו חטיבה', X.hit ? `${X.hit} · נכנסו ${H.mS(X.amount)}` : 'הקבוצה קטנה מ־6 חטיבות — לא קרה כלום', X.hit ? 'wrap' : 'wrap') : '']);
}
const HV_MK = { drought: 'מכסת המים נחתכת, היבול יקטן — והמחירים עולים', ban: 'מחיר החיטה קופץ ב־35% לארבעה חודשים', glut: 'מחיר הכותנה יורד ב־20% לחמישה חודשים', usdUp: 'האבוקדו לייצוא שווה יותר בשקלים', usdDown: 'האבוקדו לייצוא שווה פחות בשקלים', subsidy: 'חצי שנה: השקיה בטפטוף בחצי מחיר', pest: 'היבול הצפוי בשדות הכותנה יורד ב־15%' };
export function hvNewsHtml(H, X) {
  if (!X || !X.mk) return '';
  return H.grid([H.row('מה זה עושה', HV_MK[X.mk] || '', 'wrap'), H.row('העונה', FIELD_REGIME_HE[X.regime] || ''), H.row('הדולר', `₪${(Math.round((+X.usd || 0) * 100) / 100).toFixed(2)}`),
    H.row('המחירים בשוק', (X.px || []).map((p) => `${CROP_HE[p.c] || p.c} ₪${(+p.px || 0).toLocaleString('en-US')}`).join(' · '), 'wrap')]);
}

/* ============================================================ w12 panel "מפת הקבוצה והערבויות" */
export const covText = (v, months) => `×${x2(v)}${months != null ? ` · ${mo(months)} חודשים` : ''}`;
function hdGauge(H, g, X) {
  const v = +g.value || 0;
  if (g.id === 'coverage') { const bad = v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="coverage"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(covText(v, X ? X.covMonths : null))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, (v / g.max) * 100)}%"></i><s style="inset-inline-start:${(g.ref / g.max) * 100}%"></s></div><small>היעד: ×1 = מזומן במטה ל־12 חודשים של החזרי חוב בערבות${bad ? ' · נמוך' : ''}${X && X.breach ? ' · ⚠️ מתחת ל־1.2: הפרת תנאי האג"ח' : ''}</small></div>`; }
  if (g.id === 'rating') { const t = g.text || ''; const bad = v < 3;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="rating"><div class="wp-gl"><span>${H.esc(g.label)}</span><b>${H.esc(`${t} — ${RATING_WORDS[t] || ''}`)}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.round((v / g.max) * 100)}%"></i></div><small>${X ? `ריבית על חוב בערבות ${pct1(X.rateG)}` : ''} · AA הכי טוב, CCC הכי גרוע</small></div>`; }
  if (g.id === 'noDefault') { const bad = v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="noDefault"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(`${v} מתוך ${g.ref}`)}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.round((v / g.max) * 100)}%"></i></div><small>${X && X.defaults ? `${X.defaults === 1 ? 'חדלות פירעון אחת' : `${X.defaults} חדלויות פירעון`} עד עכשיו — השעון התחיל מחדש` : 'אף חדלות פירעון עד עכשיו'}</small></div>`; }
  return `<div class="wp-g" data-g="${H.esc(g.id)}"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(`${v} מתוך ${g.max}`)}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.round((v / g.max) * 100)}%"></i></div><small>כל ערבות = עוד חוט שסערה יכולה למשוך</small></div>`;
}
function hdLine(H, X) {
  if (!X) return '';
  const dp = { min: 'במינימום', high: 'גבוה', skip: 'בלי' }[X.divPol] || '';
  return `<p class="wp-now">👑 <b>${H.num(`${X.divs}/${X.maxDivs}`)}</b> חטיבות · דירוג <b>${H.esc(X.rating)}</b> (${H.esc(RATING_WORDS[X.rating] || '')}) · כיסוי ${H.num(covText(X.coverage, X.covMonths))} · החזרי חוב בערבות ${H.num(H.mS(X.service))} בחודש · שווי ברוטו ${H.num(H.mS(X.gross))} · חוב ${H.num(H.mS(X.debt))}${X.hqDebt ? ` · <b class="neg">חוב המטה ${H.num(H.mS(X.hqDebt))}</b>` : ''}${(X.bonds || []).length ? ` · ${H.num(String(X.bonds.length))} סדרות אג"ח` : ''} · דיבידנד ${H.esc(dp)} (מינימום ${H.num(pct(X.divMin))} מהשווי)${X.pressure ? ` · לחץ דירקטוריון ${H.num(String(X.pressure))}` : ''}${X.ins ? ' · 🛡️ זרוע ביטוח' : ''}${X.svc ? ' · 🏢 שירותים משותפים' : ''}${X.defaults ? ` · <b class="neg">${X.defaults === 1 ? 'חדלות פירעון אחת' : `${H.num(String(X.defaults))} חדלויות פירעון`}</b>` : ''}${X.lost ? ` · ${H.num(String(X.lost))} חטיבות אבדו` : ''}${X.restructured ? ' · <b class="neg">הסדר חוב: לכל היותר ★</b>' : ''}</p>`;
}
function stormHtml(H, S) {
  if (!S) return '<p class="wp-now storm-none">☀️ אין סערה עכשיו.</p>';
  const sh = (S.shocks || []).map((x, i) => [FACTOR_HE[i], x]).filter(([, x]) => Math.abs(x) >= 0.005);
  return `<p class="wp-now storm-on" role="note">${S.id === 'boom' ? '📈 גל חיובי בשווקים' : '🌩️ סערה'}: <b>${H.esc(S.name)}</b> · עוד ${H.num(String(S.left))} חודשים · ${sh.map(([n, x]) => `${H.esc(n)} ${x < 0 ? '▼' : '▲'} ${H.num(pct(Math.abs(x)))}`).join(' · ') || 'נחלשת'}. כל חטיבה נפגעת לפי החשיפה שלה.</p>`;
}
const HD_ACT = { grow: 'לצמוח', fix: 'לתקן', sell: 'למכור' };
function divRowsHtml(H, P, acts, btn) {
  const rows = P.rows || []; if (!rows.length) return '<section class="wp-sec"><h3>החטיבות</h3><p class="note">אין חטיבות. חטיבות למכירה מגיעות במשבצת 👑.</p></section>';
  const by = new Map(); acts.forEach((a, i) => { if (a.param && /^d\d+$/.test(a.param)) { if (!by.has(a.param)) by.set(a.param, []); by.get(a.param).push([a, i]); } });
  const lab = (a, r) => (a.id === 'structure' ? (r.struct === 'g' ? '🚧 לגדר' : '🔗 ערבות המטה') : a.id === 'support' ? (r.support ? 'להפסיק תמיכה' : 'לחזור לתמוך') : HD_ACT[a.id] || a.label);
  const sub = (a) => { const P2 = a.preview || {}; if (a.id === 'sell') return `נכנס ${H.mSg(P2.cash)}`; if (a.id === 'support') return riskLine(P2.risk) ? RISK_HE[P2.risk] : '';
    if (a.id === 'structure') { const rt = /ריבית ([+−-][\d.]+%)/.exec(a.label || ''); return `${H.mS(-P2.cash || 0)}${rt ? ` · ריבית ${rt[1]}` : ''}${P2.risk ? ` · ${RISK_HE[P2.risk]}` : ''}`; } return P2.cash ? H.mS(-P2.cash) : ''; };
  return `<section class="wp-sec"><h3>החטיבות (${rows.length}) · 🔗 בערבות המטה · 🚧 מגודרת</h3><ul class="wp-rows divs">${rows.map((r) => {
    const tag = r.struct === 'g' ? '<em class="b">🔗 בערבות המטה</em>' : '<em class="b ok">🚧 מגודרת</em>';
    const hb = `<span class="hbar" role="img" aria-label="${H.esc(`בריאות ${r.health} מתוך 100`)}"><i style="width:${r.health}%"></i></span>`;
    return `<li class="wp-row drow" data-did="${H.esc(r.did)}" data-struct="${H.esc(r.struct)}" data-light="${r.miss > 0 ? 'red' : r.health < 60 ? 'amber' : 'green'}"><div class="wp-rh"><span class="dk" aria-hidden="true">${H.esc(DIV_HOME_EMOJI[r.kind] || '🏢')}</span><div class="pr-n"><b>${H.esc(r.name)}</b><small>${H.esc(r.kindName)} · ${H.esc(r.driver)}</small></div>${tag}${r.miss > 0 ? `<em class="b warn">⚠️ ${r.miss === 1 ? 'חודש גירעון אחד' : `${r.miss} חודשי גירעון`}</em>` : ''}${r.support ? '' : '<em class="b warn">בלי תמיכת המטה</em>'}</div>
      <div class="wp-rm"><span>בריאות ${H.num(String(r.health))} ${hb}</span><span>רווח תפעולי ${H.num(H.mS(r.op))}</span><span>אחרי החוב ${H.num(H.mSg(r.net), H.cls(r.net))}</span><span>שווי ${H.num(H.mS(r.gross))}</span><span>חוב ${H.num(H.mS(r.debt))} · ריבית ${H.num(pct1(r.rate))}</span><span>הון ${H.num(H.mSg(r.equity), H.cls(r.equity))}</span><span>טווח ${H.num(`${H.mS(r.lo)}–${H.mS(r.hi)}`)}</span></div>
      <p class="sr-w">חשיפה לסערות: ${H.esc(betaWords(r.beta))}</p>
      ${(by.get(r.did) || []).length ? `<div class="wp-acts pr-acts">${by.get(r.did).map(([a, i]) => btn(a, i, lab(a, r), sub(a))).join('')}</div>` : ''}</li>`; }).join('')}</ul>
    <p class="note">ערבות = ריבית זולה וחוט אל המטה: חטיבה בערבות שנופלת מעבירה את החוב שלה (ועוד 25%) למטה, מורידה את הדירוג ומפילה איתה כל חטיבה אחרת בערבות שבגירעון. מגודרת = רק היא. מכירה מבקשת לחיצה שנייה.</p></section>`;
}
export function hdPanelHtml(H, P, X, btn) {
  const acts = P.actions || [];
  const div = acts.map((a, i) => [a, i]).filter(([a]) => a.id === 'dividend');
  const grp = acts.map((a, i) => [a, i]).filter(([a]) => !(a.param && /^d\d+$/.test(a.param)) && a.id !== 'dividend');
  const gsub = (a) => { const P2 = a.preview || {}; if (a.id === 'restructure') return RISK_HE.stars; if (a.id === 'bond') return `+${H.mS(P2.cash)} · ${H.mSg(P2.monthly)} בחודש × ${P2.months}`; if (a.id === 'insure') return P2.monthly ? `${H.mSg(P2.monthly)} בחודש` : ''; return P2.cash ? `${H.mSg(P2.cash)}` : ''; };
  return `${hdLine(H, X)}${stormHtml(H, P.storm)}<div class="wp-gauges hd-g">${(P.gauges || []).map((g) => hdGauge(H, g, X)).join('')}</div>${divRowsHtml(H, P, acts, btn)}
    ${div.length ? `<section class="wp-sec"><h3>הדיבידנד השנתי לדירקטוריון</h3><div class="wp-seg" role="group" aria-label="הדיבידנד השנתי"><span class="wp-segl">השנה</span>${div.map(([a, i]) => btn(a, i, a.label, a.preview && a.preview.risk ? RISK_HE[a.preview.risk] : '')).join('')}</div><p class="note">כל 12 משכורות המטה משלם דיבידנד מהקופה. פחות מהמינימום — לחץ, והמינימום עולה בשנה הבאה.</p></section>` : ''}
    ${grp.length ? `<section class="wp-sec"><h3>המטה</h3><div class="wp-acts">${grp.map(([a, i]) => btn(a, i, a.label, gsub(a))).join('')}</div><p class="note">💡 = מה שהמנטור היה בוחר עכשיו. כל פעולה נכנסת לחודש הזה מיד. הסדר חוב מבקש לחיצה שנייה.</p></section>` : ''}`;
}

/* ============================================================ w16 panel "השדות והגידור" */
function hvGauge(H, g, X) {
  const v = +g.value || 0;
  if (g.id === 'income') { const bad = v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="income"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(H.mSg(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, (v / g.max) * 100))}%"></i><s style="inset-inline-start:${(g.ref / g.max) * 100}%"></s></div><small>היעד: ${H.esc(H.mS(g.ref))} בחודש בממוצע שנתי · ההכנסה מגיעה בקציר${v < 0 ? ' · החודש רק הוצאות' : ''}</small></div>`; }
  if (g.id === 'margin') { const none = !X || !(+X.locked > 0); const bad = !none && v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="margin"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${none ? 'אין גידור פתוח' : H.esc(`×${x2(v)}`)}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${none ? 0 : Math.min(100, (v / g.max) * 100)}%"></i><s style="inset-inline-start:${(g.ref / g.max) * 100}%"></s></div><small>${none ? 'בלי חוזים עתידיים אין קריאות מרווח' : `המזומן מול 8% מהשווי הנעול (${H.esc(H.mS(X.locked))})${bad ? ' · ⚠️ קריאה תיסגר בכוח' : ''}`}</small></div>`; }
  if (g.id === 'quota') { const bad = v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="quota"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(pct(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, v * 100)}%"></i><s style="inset-inline-start:${g.ref * 100}%"></s></div><small>כמה מהמים נשארים לך בשנת בצורת${bad ? ' · נמוך' : ''}</small></div>`; }
  return `<div class="wp-g" data-g="silo"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(tons(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, (v / (g.max || 30000)) * 100)}%"></i></div><small>1.5% מתקלקל כל חודש · נמכר לבד אחרי חצי שנה</small></div>`;
}
function hvLine(H, X) {
  if (!X) return '';
  const silo = (X.silo || []).reduce((s, b) => s + (+b.t || 0), 0);
  return `<p class="wp-now">🌾 <b>${H.esc(X.regimeLabel || FIELD_REGIME_HE[X.regime] || '')}</b> · הדולר ₪${(Math.round((+X.usd || 0) * 100) / 100).toFixed(2)} · מכסת מים בבצורת ${H.num(pct(X.quota))} · עלויות ${H.num(H.mS(X.cost))} בחודש · הכנסת המשק החודש ${H.num(H.mSg(X.income), H.cls(X.income))}${X.margin ? ` · ביטחונות מופקדים ${H.num(H.mS(X.margin))}` : ''}${X.locked ? ` · נעול ${H.num(H.mS(X.locked))}` : ''}${X.calls ? ` · ${H.num(String(X.calls))} קריאות מרווח` : ''}${X.forced ? ` · <b class="neg">${H.num(String(X.forced))} סגירות בכוח</b>` : ''}${silo ? ` · ממגורה ${H.num(tons(silo))}` : ''} · קרקע ${H.num(H.mS(X.land))}${X.debt ? ` · משכנתא ${H.num(H.mS(X.debt))}` : ''}${X.pack ? ' · 📦 בית אריזה' : ''}${X.equip ? ' · 🚜 ציוד חדש' : ' · 🚜 ציוד ישן'}</p>`;
}
function priceTable(H, T) {
  if (!T || !T.length) return '';
  return `<section class="wp-sec"><h3>המחירים</h3><div class="tblwrap"><table class="hvtbl"><caption class="sr">מחירי התוצרת לטון: המחיר ההוגן היום, המחיר המקומי שמקבלים במכירה (נמוך בחודש הקציר ובחודש שאחריו) והמחיר הממוצע לאורך זמן.</caption>
    <thead><tr><th scope="col">גידול</th><th scope="col">הוגן היום</th><th scope="col">מקומי (במכירה)</th><th scope="col">ממוצע ארוך</th></tr></thead><tbody>${T.map((p) => `<tr data-crop="${H.esc(p.id)}"><th scope="row">${H.esc(CROP_EMOJI[p.id] || '')} ${H.esc(p.name)}</th><td class="num">₪${(+p.fair || 0).toLocaleString('en-US')}</td><td class="num">₪${(+p.spot || 0).toLocaleString('en-US')}${p.spot < p.fair ? ' <small>(שפל הקציר)</small>' : ''}</td><td class="num">₪${(+p.anchor || 0).toLocaleString('en-US')} <small>${p.fair > p.anchor * 1.03 ? '▲ מעל' : p.fair < p.anchor * 0.97 ? '▼ מתחת' : 'בערך'}</small></td></tr>`).join('')}</tbody></table></div>
    <p class="note">חוזה עתידי נסגר במחיר ההוגן; את היבול עצמו מוכרים במחיר המקומי — שיורד בחודש הקציר. ממגורה עוזרת לחכות לו.</p></section>`;
}
const HV_ACT = { insure: 'ביטוח יבול', irrigate: 'השקיה', sellLand: 'למכור / להחזיר' };
function fieldRowsHtml(H, P, acts, btn) {
  const rows = P.rows || [];
  const by = new Map(); acts.forEach((a, i) => { const s = a.param != null && ['crop', 'hedge', 'store', 'insure', 'irrigate', 'sellLand'].includes(a.id) ? String(a.param).split(':')[0] : null; if (s == null) return; if (!by.has(s)) by.set(s, []); by.get(s).push([a, i]); });
  return `<section class="wp-sec"><h3>השדות</h3><ul class="wp-rows fields">${rows.map((r) => {
    if (r.empty) return `<li class="wp-row frow empty" data-slot="${r.slot}" data-light="off"><div class="wp-rh"><b>שדה ${r.slot + 1}</b><em class="b">פנוי — אפשר לקנות או לחכור</em></div></li>`;
    const R = r.range; const E = r.expected || (R ? R.mid : 1) || 1; const xs = by.get(String(r.slot)) || [];
    const crops = xs.filter(([a]) => a.id === 'crop'); const hedges = xs.filter(([a]) => a.id === 'hedge'); const rest = xs.filter(([a]) => !['crop', 'hedge'].includes(a.id));
    const rng = R ? `<div class="frng"><span>טווח היבול ${H.num(`${tons(R.lo)}–${tons(R.hi)}`)} · עוד ${H.num(String(r.harvestIn))} חודשים לקציר${r.harvestIn <= 1 ? ' — כמעט סופי' : ''}</span>${rangeBar(R.lo / E - 0.5, R.hi / E - 0.5, r.harvestIn <= 2 ? 'narrow' : '')}</div>` : '';
    const lock = r.hedgeQ ? `<span>נעול ${H.num(tons(r.hedgeQ))}${r.lock ? ` ב־₪${(+r.lock).toLocaleString('en-US')}` : ''} (${H.num(pct(r.hedgedShare))} מהצפי)${r.margin ? ` · ביטחונות ${H.num(H.mS(r.margin))}` : ''}</span>` : '<span>לא נעול</span>';
    return `<li class="wp-row frow" data-slot="${r.slot}" data-crop="${H.esc(r.crop)}" data-phase="${H.esc(r.phase)}" data-light="${r.phase === 'grow' ? 'green' : r.phase === 'young' ? 'amber' : 'off'}"><div class="wp-rh"><span class="dk" aria-hidden="true">${H.esc(CROP_EMOJI[r.crop] || '')}</span><div class="pr-n"><b>שדה ${r.slot + 1} · ${H.esc(r.name)}</b><small>${H.esc(PHASE_HE[r.phase] || '')} · ${r.own ? 'בבעלות' : 'חכור'}${r.irr ? ' · 💧 השקיה' : ''}${r.store ? ' · לממגורה' : ' · מכירה בקציר'}${r.insured ? ' · 🛡️ מבוטח' : ''}</small></div>${r.export ? `<em class="b">🚢 חוזה ייצוא ${H.esc(tons(r.export.q))}</em>` : ''}</div>
      ${rng}${r.phase === 'grow' ? `<div class="wp-rm">${lock}${r.fut ? `<span>חוזה עתידי לקציר ₪${(+r.fut).toLocaleString('en-US')} לטון</span>` : ''}<span>צפי בזריעה ${H.num(tons(r.expected))}</span></div>` : ''}
      ${crops.length ? `<div class="wp-seg" role="group" aria-label="${H.esc(`שדה ${r.slot + 1}: גידול`)}"><span class="wp-segl">גידול</span>${crops.map(([a, i]) => btn(a, i, CROP_HE[String(a.param).split(':')[1]] || a.label, a.preview && a.preview.cash ? `נטיעה ${H.mS(-a.preview.cash)}` : '')).join('')}</div>` : ''}
      ${hedges.length ? `<div class="wp-seg" role="group" aria-label="${H.esc(`שדה ${r.slot + 1}: כמה לנעול`)}"><span class="wp-segl">לנעול</span>${hedges.map(([a, i]) => btn(a, i, `${Math.round(+String(a.param).split(':')[1] * 100)}%`, a.preview && a.preview.cash < 0 ? `ביטחונות ${H.mS(-a.preview.cash)}` : 'לסגור חלק')).join('')}</div>` : ''}
      ${rest.length ? `<div class="wp-acts pr-acts">${rest.map(([a, i]) => btn(a, i, a.id === 'store' ? (String(a.param).endsWith(':1') ? 'לאחסן בממגורה' : 'למכור בקציר') : HV_ACT[a.id] || a.label, a.preview && a.preview.cash ? H.mSg(a.preview.cash) : '')).join('')}</div>` : ''}</li>`; }).join('')}</ul>
    <p class="note">הטווח = כמה טון יצא, לפי מה שרואים עד עכשיו: רחב בזריעה, צר לפני הקציר — היבול האמיתי בתוכו. נועלים את הקצה הנמוך, לא את הצפי: בבצורת מי שנעל יותר ממה שקצר קונה את החסר ביוקר. נעילה שמוסיפה טון מבקשת לחיצה שנייה — הראשונה מראה את הביטחונות.</p></section>`;
}
export function hvPanelHtml(H, P, X, btn) {
  const acts = P.actions || [];
  const grp = acts.map((a, i) => [a, i]).filter(([a]) => !['crop', 'hedge', 'store', 'insure', 'irrigate', 'sellLand'].includes(a.id));
  return `${hvLine(H, X)}<div class="wp-gauges hv-g">${(P.gauges || []).map((g) => hvGauge(H, g, X)).join('')}</div>${priceTable(H, P.table)}${fieldRowsHtml(H, P, acts, btn)}
    ${grp.length ? `<section class="wp-sec"><h3>הממגורה, הקרקע והמשק</h3><div class="wp-acts">${grp.map(([a, i]) => btn(a, i, a.label, a.preview && a.preview.risk ? RISK_HE[a.preview.risk] : '')).join('')}</div><p class="note">💡 = מה שהמנטור היה בוחר עכשיו. כל פעולה נכנסת לחודש הזה מיד.</p></section>` : ''}`;
}

/* ============================================================ two-tap actions: the words before the confirming tap */
/** does this action need a second tap? (a w12 restructuring; a w16 hedge that adds tonnes — the deposit first; selling an owned field) */
export const needsArm = (a) => !!a && (a.id === 'restructure' || (a.id === 'hedge' && a.preview && a.preview.cash < 0) || (a.id === 'sellLand' && a.preview && a.preview.cash > 0));
export function armText(a, D = {}, H = null) {
  const P = (a && a.preview) || {}; const m = H ? H.mS : (x) => String(x);
  if (a.id === 'restructure') return 'הסדר חוב: הבנקים מוחקים 40% מחוב המטה — אבל זה נספר כחדלות פירעון (שעון ה־24 חודשים מתחיל מחדש), והמשחק ייגמר לכל היותר בכוכב אחד (★). לחיצה נוספת מאשרת.';
  if (a.id === 'sell' && /^d\d+$/.test(String(a.param || ''))) return `${a.label}: נכנס לקופת המטה ${H ? H.mSg(P.cash) : P.cash} אחרי החזר החוב שלה. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  if (a.id === 'hedge' && P.cash < 0) return `${a.label}. עכשיו מפקידים ${m(-P.cash)} ביטחונות (8% מהשווי). אם המחיר עולה — החוזה מפסיד על הנייר ומתחת ל־5% הברוקר מבקש להשלים במזומן; בלי מזומן הוא סוגר בכוח, ושעון "בלי סגירה בכוח" מתחיל מחדש. לחיצה נוספת מאשרת.`;
  if (a.id === 'sellLand') return `${a.label}: השדה יוצא מהמשק${P.cash ? ` (נכנס ${m(P.cash)}, ומשכנתא מוחזרת)` : ''}. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  if (a.id === 'sell' && D && D.harvest) return `${a.label} — במחיר המקומי של היום. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  return null;
}

/* ============================================================ the HUD chip, the sheet box, the 💼 row (engine values only) */
export function hdChip(H, X, P) {
  const miss = ((P && P.rows) || []).filter((r) => r.miss > 0).length;
  const al = `${(P && P.title) || 'הקבוצה'}: ${X.divs} חטיבות, ${X.guaranteed} בערבות המטה, דירוג ${X.rating}, כיסוי נזילות ${covText(X.coverage, X.covMonths)}${X.storm ? `, סערה: ${X.storm.name}` : ''}${miss ? `, ${miss} בגירעון` : ''}`;
  const html = `👑 <span class="hb-mf">כיסוי </span>${H.num(`×${x2(X.coverage)}`)}<span class="hb-b"> · ${H.esc(X.rating)}</span><span class="hb-w"> · ${H.num(`${X.divs}/${X.maxDivs}`)} חטיבות</span>${X.storm ? '<span class="hb-b"> 🌩️</span>' : ''}${miss ? ' ⚠️' : ''}`;
  return { al, html, extra: X.defaults ? `<span class="hedge" title="חדלויות פירעון">💥${H.num(String(X.defaults))}</span>` : '' };
}
export function hvChip(H, X, P) {
  const growing = (X.slots || []).filter((s) => s && s.phase === 'grow').length; const hedged = (X.slots || []).filter((s) => s && s.hedgeQ > 0).length;
  const al = `${(P && P.title) || 'המשק'}: ${X.regimeLabel}, הכנסת המשק החודש ${H.mSg(X.income)}, ${growing} שדות בגידול, ${hedged} מגודרים${X.forced ? `, ${X.forced} סגירות בכוח` : ''}`;
  const inc = H.tiny ? H.tiny(X.income) : H.mSg(X.income);
  const html = `🌾 <span class="hb-w">${H.esc(X.regimeLabel)} · </span>${H.num(inc)}<span class="hb-b"> · ${H.num(`${growing} בגידול`)}</span>${X.regime === 'drought' ? ' 🏜️' : ''}`;
  return { al, html, extra: hedged ? `<span class="hedge" title="שדות מגודרים">🔒${H.num(String(hedged))}</span>` : '' };
}
export function hdBox(H, X, title) {
  return `<div class="wbox"><div class="wl"><span>👑 ${H.num(`${X.divs}/${X.maxDivs}`)} חטיבות · ${H.esc(X.rating)}</span><b class="num">כיסוי ${H.esc(`×${x2(X.coverage)}`)}</b></div>
      <p class="note">כיסוי נזילות: מזומן במטה ל־${H.num(`${mo(X.covMonths)} חודשים`)} של החזרים · ${H.num(String(X.guaranteed))} בערבות המטה · החזרי חוב בערבות ${H.num(H.mS(X.service))} בחודש · שווי ברוטו ${H.num(H.mS(X.gross))} · חוב ${H.num(H.mS(X.debt))}${X.storm ? ` · 🌩️ ${H.esc(X.storm.name)}` : ''}${X.defaults ? ` · <b class="neg">${H.num(String(X.defaults))} חדלויות פירעון</b>` : ''}.</p>
      <div class="loans"><button data-act="world">👑 ${H.esc(title || 'לוח העולם')}</button></div></div>`;
}
export function hvBox(H, X, title) {
  const growing = (X.slots || []).filter((s) => s && s.phase === 'grow').length;
  return `<div class="wbox"><div class="wl"><span>🌾 ${H.esc(title || 'המשק')} · ${H.esc(X.regimeLabel)}</span><b class="num">${H.esc(H.mSg(X.income))}</b></div>
      <p class="note">${H.num(String(growing))} שדות בגידול · עלויות ${H.num(H.mS(X.cost))} בחודש${X.margin ? ` · ביטחונות ${H.num(H.mS(X.margin))}` : ''}${X.forced ? ` · <b class="neg">${H.num(String(X.forced))} סגירות בכוח</b>` : ''} · מכסת מים ${H.num(pct(X.quota))}.</p>
      <div class="loans"><button data-act="world">🌾 ${H.esc(title || 'לוח העולם')}</button></div></div>`;
}
