// w11 התאגיד הבינלאומי / w15 מגדלי הענן — the in-game HTML of the two worlds (cards, the panels' bodies, the HUD chip text). PURE: strings
// only, no DOM, no engine import, no arithmetic beyond formatting the engine's own numbers (ev.data, worldIndicators.multinational /
// .platform, panel.gauges / table / rows / actions). ui.js passes its formatters in H = { esc, escI, num, mS, mSg, pctI, row, grid, cls, iso }.
//
// w11: the acquisition card (tile Z: a subsidiary for sale — the profit RANGE that contains the truth, the price vs the fair range, 35 % down +
// the acquisition loan, the incumbent manager's competence / integrity as ranges, due diligence keeps the card open and narrows them — the
// engine re-describes the same card: ctl.update), the world-news block (ev.data.mn), the map panel "המפה והחברות־הבנות" (gauges, an accessible
// country table — rates, hedges, cash kept abroad, withholding tax, disruptions in words —, every subsidiary with its country band, who runs it,
// the manager as a token with a trust ring + the ranges in words, and its own actions; the countries' and the group's actions).
// w15: the investor-meeting card (tile H: a term sheet with the dilution BEFORE the tap, or a giant's buyout with your share in cash), the
// tech-news block (ev.data.pf), the app panel "האפליקציה והגיוסים" (gauges in months / × / % / users, the channels table with spend levels,
// the last 12 cohorts as a small retention chart + a table, rounds with "your stake: a% → b%" on the button and a second tap that confirms).
import { COUNTRY_BAND, COUNTRY_HE, SUB_KIND_HE, REGIME_HE } from './vocab.js';

const pct = (x) => `${Math.round((+x || 0) * 100)}%`;
const pct1 = (x) => `${Math.round((+x || 0) * 1000) / 10}%`;
export const bandStyle = (c) => { const [a, b] = COUNTRY_BAND[c] || COUNTRY_BAND.eu; return `--c1:${a};--c2:${b}`; };
/** a country chip: the fictional colour band + the name in words (never colour alone) */
export const countryChip = (H, c, name) => `<span class="cchip" style="${bandStyle(c)}"><i class="cband" aria-hidden="true"></i>${H.esc(name || COUNTRY_HE[c] || '')}</span>`;
/** a [lo, hi] range on a 0–1 track (the shown range, the truth inside it); words carry the numbers */
const rangeBar = (lo, hi, { mark = null, cls = '' } = {}) => `<span class="rbar ${cls}" aria-hidden="true"><i style="inset-inline-start:${Math.round(Math.max(0, Math.min(1, lo)) * 100)}%;width:${Math.max(2, Math.round((Math.min(1, hi) - Math.max(0, lo)) * 100))}%"></i>${mark != null ? `<s style="inset-inline-start:${Math.round(Math.max(0, Math.min(1, mark)) * 100)}%"></s>` : ''}</span>`;
/** the manager token: a ring whose filled arc = the middle of the shown integrity range; the ranges in words beside it */
export function mgrToken(H, g, { size = '' } = {}) {
  if (!g) return '';
  const t = (g.iLo + g.iHi) / 2;
  return `<span class="mtok ${size}${g.audited ? ' aud' : ''}" style="--t:${Math.round(t * 100)}" role="img" aria-label="${H.esc(`מנהל: יכולת ${pct(g.cLo)}–${pct(g.cHi)}, יושרה ${pct(g.iLo)}–${pct(g.iHi)}${g.audited ? ', נבדק' : ', לא נבדק'}${g.known ? ', מוכר היטב' : ''}`)}"><b>${g.audited || g.known ? '✓' : '?'}</b></span>`;
}
const mgrWords = (H, g) => `יכולת ${H.num(`${pct(g.cLo)}–${pct(g.cHi)}`)} · יושרה ${H.num(`${pct(g.iLo)}–${pct(g.iHi)}`)}`;

/* ============================================================ w11: the acquisition card (tile Z) */
export function acquisitionHtml(H, ev) {
  const d = ev.data || {}; const g = d.mgr || {};
  const fairMid = (d.fairLo + d.fairHi) / 2;
  const verdict = d.fairHi < d.price ? { t: 'המחיר מעל כל הטווח ההוגן', c: 'neg' } : d.fairLo >= d.price ? { t: 'המחיר מתחת לכל הטווח ההוגן', c: 'pos' } : { t: fairMid >= d.price ? 'המחיר בתוך הטווח — מתחת לאמצע' : 'המחיר בתוך הטווח — מעל האמצע', c: fairMid >= d.price ? '' : 'neg' };
  const head = `<div class="acq-h">${countryChip(H, d.country, d.countryName)}<span class="b">${H.esc(SUB_KIND_HE[d.kind] || '')}</span><span class="b">ספק מ${H.esc(d.supplierName || '')}</span>${d.dd ? '<span class="b ok">🔍 נבדק</span>' : '<span class="b warn">❔ לא נבדק</span>'}</div>`;
  const rows = [
    H.row('רווח בחודש (לפני שכר המנהל)', `${H.mS(d.loNis)}–${H.mS(d.hiNis)}`, 'wrap'),
    `<div class="row acq-r"><span>${d.dd ? 'הטווח אחרי הבדיקה (±6%)' : 'הטווח לפני בדיקה (±25%)'} — הרווח האמיתי בתוכו</span>${rangeBar((d.lo / d.est) / 2, (d.hi / d.est) / 2, { cls: d.dd ? 'narrow' : '' })}</div>`,
    H.row('המחיר', H.mS(d.price)), H.row('עכשיו מהקופה (35%)', H.mS(d.down)), H.row('הלוואת רכישה על החברה', `${H.mS(d.acqLoan)} · ${H.mS(d.loanMonthly)} בחודש מהרווח שלה`, 'wrap'),
    H.row('שווי הוגן (32 חודשי רווח, אחרי שכר המנהל)', `${H.mS(d.fairLo)}–${H.mS(d.fairHi)}`, 'wrap'), H.row('המחיר מול השווי', verdict.t, `${verdict.c} wrap`),
    H.row(`ה${d.ccy || 'מטבע'} היום`, `${Math.round((+d.fx || 0) * 100)}% מהממוצע${d.fx >= 1.1 ? ' — גבוה: אם ייפול, השווי ייפול איתו' : d.fx <= 0.9 ? ' — נמוך' : ''}`, d.fx >= 1.1 ? 'neg wrap' : 'wrap'),
    H.row('מס במקור על רווח שחוזר הביתה', pct(d.wht)),
    d.localCash ? H.row(`מזומן שלך ב${d.countryName}`, `${H.mS(d.localCash)} (נכנס למקדמה)`) : '',
    H.row('מקום לעוד חברות', d.slotsFree > 0 ? `${d.slotsFree} מתוך 6` : 'אין — 6 חברות־בנות', d.slotsFree > 0 ? '' : 'neg'),
    H.row('התקציב שהמנטור רואה', H.mS(d.budget)),
  ];
  const mg = `<div class="mini acqmini"><p class="mh">👤 המנהל שמגיע עם החברה · שכר ${H.num(H.mS(g.wage))} בחודש</p>
    <div class="acq-m">${mgrToken(H, { ...g, audited: d.dd }, { size: 'lg' })}<div class="acq-mr">
      <p><span>יכולת ${H.num(`${pct(g.cLo)}–${pct(g.cHi)}`)}</span>${rangeBar(g.cLo, g.cHi, { cls: d.dd ? 'narrow' : '' })}</p>
      <p><span>יושרה ${H.num(`${pct(g.iLo)}–${pct(g.iHi)}`)}</span>${rangeBar(g.iLo, g.iHi, { cls: d.dd ? 'narrow' : g.iLo < 0.5 ? 'risk' : '' })}</p></div></div>
    <p class="note">${d.dd ? 'הבדיקה צמצמה את הטווחים: יכולת ±10%, יושרה ±15%. האמת בתוכם.' : `בדיקה (${H.esc(H.mS(d.fee))}) מצמצמת את טווח הרווח ל־±6% ואת המנהל ל־±10% / ±15% — והכרטיס נשאר פתוח.`}${g.iLo < 0.5 ? ' ⚠️ יושרה נמוכה אפשרית: מנהל כזה יכול לגנוב.' : ''}</p></div>`;
  return head + H.grid(rows) + mg + (d.note ? `<p class="note">${H.escI(d.note)}</p>` : '');
}
/* ============================================================ w15: the investor-meeting card (tile H) */
export function investorsHtml(H, ev) {
  const d = ev.data || {}; const rg = `${REGIME_HE[d.regime] || d.regime || ''} · מכפיל ${d.mult}× מההכנסה השנתית`;
  if (d.kind === 'buyout') {
    const rows = [H.row('המחיר לכל החברה', `${H.mS(d.price)} (פי ${d.k} מהשווי היום)`, 'wrap'), H.row('השווי לפי השוק היום', H.mS(d.ev)), H.row('החלק שלך', pct(d.stake)),
      `<div class="row"><b>נכנס לך במזומן</b><b class="big num pos">${H.esc(H.mS(d.mine))}</b></div>`, H.row('החלק שלך שווה היום (לפי השוק)', H.mS(d.stakeValue)), H.row('מצב השוק', rg, 'wrap')];
    return `<div class="pf-h"><span class="b">🏢 הצעת רכישה</span><span class="b">${H.esc(REGIME_HE[d.regime] || '')}</span></div>${H.grid(rows)}<p class="note">אחרי מכירה: המחיר קבוע — בלי סיכון ובלי עלייה, והמשחק ממשיך עם המזומן.</p>${d.note ? `<p class="note">${H.escI(d.note)}</p>` : ''}`;
  }
  const dil = `<div class="mini pfmini"><p class="mh">✂️ הדילול — לפני שמחליטים · החלק שלך</p><div class="dil" role="img" aria-label="${H.esc(`החלק שלך יורד מ־${pct1(d.stake)} ל־${pct1(d.stakeAfter)}`)}"><span class="dil-b" style="--a:${Math.round(d.stake * 100)}%;--b:${Math.round(d.stakeAfter * 100)}%"><i></i><s></s></span><span class="num rtl">${H.esc(pct1(d.stake))} ← ${H.esc(pct1(d.stakeAfter))}</span></div>
    <small class="dil-n">${d.k < 1 ? `המחיר ${H.num(pct(1 - d.k))} מתחת לשווי לפי השוק` : d.k > 1 ? `המחיר ${H.num(pct(d.k - 1))} מעל השווי לפי השוק` : 'המחיר = השווי לפי השוק'} · ${H.esc(REGIME_HE[d.regime] || '')}, מכפיל ${d.mult}×</small></div>`;
  const rows = [`<div class="row"><b>נכנס לחברה · תמורת ${H.num(`${pct(d.pct)}`)} מהחברה</b><b class="big num pos">${H.esc(H.mS(d.amount))}</b></div>`, H.row('שווי לפני הכסף', `${H.mS(d.pre)} (פי ${d.k} מהשווי לפי השוק)`, 'wrap'),
    H.row('חודשי מזומן עכשיו', +d.runway >= 99 ? 'רווחית — המזומן לא נגמר' : `${Math.round(d.runway * 10) / 10} חודשים`, +d.runway < 6 ? 'neg' : '')];
  return `<div class="pf-h"><span class="b">💼 הצעת השקעה</span><span class="b">${H.esc(REGIME_HE[d.regime] || '')}</span></div>${H.grid(rows)}${dil}`;   // the engine's note repeats the mentor's question: the term sheet stays short enough to sit below the HUD on a desk
}
/* ============================================================ news blocks */
const MN_MK = { port: 'הנמל סגור לחודשיים — כל חברה שהספק שלה משם עובדת חלש', fxcrisis: 'המטבע צנח ב־25%', tariff: 'חצי שנה של רווח נמוך ב־15% למי שקונה משם', election: 'המחזור הכלכלי שם התהפך', shipping: 'שלושה חודשים: רווח נמוך ב־8% בכל החברות', boom: 'חצי שנה: רווח גבוה ב־12% לחברות שם', poach: 'החברה בלי מנהל עד מינוי חדש או ניהול עצמי' };
export function mnNewsHtml(H, X) {
  if (!X || !X.mk) return '';
  return H.grid([X.countryName ? `<div class="row"><span>המדינה</span>${countryChip(H, X.country, X.countryName)}</div>` : '', H.row('מה זה עושה', MN_MK[X.mk] || '', 'wrap'), X.mk === 'poach' ? H.row('איפה', X.hit || 'לאף חברה שלך אין מנהל — לא קרה כלום', X.hit ? 'neg wrap' : 'wrap') : '']);
}
const PF_MK = { appstore: 'חצי שנה: כל משתמש חדש עולה 20% יותר', viral: 'משתמשים חדשים בחינם — שנשארים פחות', breach: '10% מהמשתמשים עזבו', rivalRound: 'המתחרה לוקח יותר מהשוק: הגיוס יקר יותר', pop: 'המכפילים נחתכים — מיתון', copy: 'חצי שנה של נטישה גבוהה יותר', engineer: 'שלושה חודשים: המוצר משתפר לאט יותר' };
export function pfNewsHtml(H, X) {
  if (!X || !X.mk) return '';
  return H.grid([H.row('מה זה עושה', PF_MK[X.mk] || '', 'wrap'), X.newUsers ? H.row('משתמשים חדשים', X.newUsers.toLocaleString('en-US'), 'pos') : '', H.row('משתמשים עכשיו', (+X.users || 0).toLocaleString('en-US')), H.row('מצב השוק', `${REGIME_HE[X.regime] || ''} · מכפיל ${X.mult}×`)]);
}

/* ============================================================ w11 panel "המפה והחברות־הבנות" */
function mnGauge(H, g, nm = 1) {
  const v = +g.value || 0;
  if (g.id === 'trust' && !nm) return `<div class="wp-g" data-g="trust"><div class="wp-gl"><span>${H.esc(g.label)}</span><b>אין מנהלים</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:0%"></i></div><small>כל החברות בניהול שלך — אין את מי לבדוק</small></div>`;
  if (g.id === 'attention') { const full = v >= g.ref;
    return `<div class="wp-g${full ? ' low' : ''}" data-g="attention"><div class="wp-gl"><span>${H.esc(g.label)}</span><b>${H.num(`${v} מתוך ${g.ref}`)}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${g.ref ? Math.round((v / g.ref) * 100) : 0}%"></i></div><small>${full ? 'כל הקשב תפוס — עוד חברה בניהול עצמי רק עם מטה אזורי' : `${g.ref - v} פנוי`}</small></div>`; }
  if (g.id === 'frauds') return `<div class="wp-g${v > 0 ? ' low' : ''}" data-g="frauds"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${v}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, (v / (g.max || 6)) * 100)}%"></i></div><small>${v ? 'פחות זה טוב — ביקורת מורידה את הסיכון ל־40% לשנה' : 'אף הונאה עד עכשיו'}</small></div>`;
  const bad = v < g.ref;
  return `<div class="wp-g${bad ? ' low' : ''}" data-g="${H.esc(g.id)}"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(pct(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, v * 100)}%"></i><s style="inset-inline-start:${g.ref * 100}%"></s></div><small>יעד: ${H.esc(pct(g.ref))}${bad ? ' · נמוך' : ''}</small></div>`;
}
function mnLine(H, X) {
  if (!X) return '';
  const c = X.cand;
  return `<p class="wp-now">🌍 <b>${H.num(`${X.subs}/${X.maxSubs}`)}</b> חברות־בנות · קשב ${H.num(`${X.used}/${X.slots}`)} · קבועות ${H.num(H.mS(X.fixedMonth))} בחודש${X.localCash ? ` · מזומן בחו"ל ${H.num(H.mS(X.localCash))}` : ''}${X.frauds ? ` · <b class="neg">${H.num(String(X.frauds))} הונאות (${H.num(H.mS(X.fraudLoss))})</b>` : ''} · ${H.num(String(X.audits))} ביקורות · ${H.num(String(X.disruptions))} שיבושים${X.sold ? ` · נמכרו ${H.num(String(X.sold))}` : ''}${X.hq ? ' · 🏛️ מטה' : ''}${X.erp ? ' · 🧾 ERP' : ''}${X.hub ? ' · 🚚 מרכז לוגיסטי' : ''}</p>
    ${c ? `<p class="wp-now mcand">👤 מועמד החודש: ${mgrToken(H, { ...c, audited: false })} ${mgrWords(H, c)} · שכר ${H.num(H.mS(c.wage))} · מינוי = חודשיים של חפיפה</p>` : '<p class="wp-now mcand">👤 אין מועמד החודש — מועמד חדש בכל משכורת.</p>'}`;
}
function countryTable(H, T) {
  if (!T || !T.length) return '';
  const chg = (x) => (x > 0.005 ? `▲ ${pct(x)}` : x < -0.005 ? `▼ ${pct(-x)}` : 'בלי שינוי');
  return `<section class="wp-sec"><h3>המדינות והמטבעות</h3><div class="tblwrap"><table class="mntbl"><caption class="sr">המדינות: מטבע, שער מול הבסיס, גידור, רווח שנשאר שם, מס במקור, החברות שלך שם, כמה חברות קונות מספק משם, ושיבוש בנמל.</caption>
    <thead><tr><th scope="col">מדינה</th><th scope="col">שער</th><th scope="col">גידור</th><th scope="col">נשאר שם</th><th scope="col">מס במקור</th><th scope="col">חברות</th><th scope="col">ספק ל־</th><th scope="col">נמל</th></tr></thead><tbody>${T.map((c) => `<tr data-c="${H.esc(c.id)}"${c.disrupted ? ' class="dis"' : ''}>
      <th scope="row">${countryChip(H, c.id, c.name)}<small>${H.esc(c.ccy)}</small></th><td class="num">${Math.round(c.fx * 100)}% <small>${H.esc(chg(c.fxChg))}</small></td><td>${c.hedged != null ? `🛡️ ${Math.round(c.hedged * 100)}%` : 'לא'}</td>
      <td>${c.keep ? `📌 ${H.esc(H.mS(c.local))}` : c.local ? H.esc(H.mS(c.local)) : '—'}</td><td class="num">${pct(c.wht)}</td><td class="num">${c.subs}</td><td class="num">${c.links}</td><td>${c.disrupted ? '<b class="neg">⚠️ משובש</b>' : 'פתוח'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">השער = כמה המטבע שווה היום מול הבסיס (100%). 🛡️ = מגודר: הרווח נספר בשער שזז לאט. 📌 = הרווח נשאר שם בלי מס במקור, חשוף לשער.</p></section>`;
}
const MN_ACT = { self: 'לנהל בעצמך', hire: 'למנות את המועמד', audit: 'ביקורת', dual: 'ספק שני', grow: 'להשקיע בצמיחה', sell: 'למכור' };
function subsHtml(H, P, acts, btn) {
  const rows = P.rows || []; if (!rows.length) return '<section class="wp-sec"><h3>החברות־הבנות</h3><p class="note">עוד אין חברות־בנות. הצעות רכישה מגיעות במשבצת 🌍.</p></section>';
  const by = new Map(); acts.forEach((a, i) => { if (a.param && /^s\d+$/.test(a.param)) { if (!by.has(a.param)) by.set(a.param, []); by.get(a.param).push([a, i]); } });
  return `<section class="wp-sec"><h3>החברות־הבנות (${rows.length})</h3><ul class="wp-rows subs">${rows.map((r) => { const g = r.mgr;
    const who = r.self ? '<em class="b ok">★ בניהול שלך</em>' : g ? `${mgrToken(H, g)}<span class="sr-w">${mgrWords(H, g)}${g.gap ? ' · בחפיפה' : ''}</span>` : '<em class="b warn">∅ בלי מנהל</em>';
    return `<li class="wp-row srow" data-sid="${H.esc(r.sid)}" data-light="${r.disrupted ? 'red' : r.self ? 'green' : 'off'}"><div class="wp-rh">${countryChip(H, r.country, COUNTRY_HE[r.country])}<div class="pr-n"><b>${H.esc(r.name)}</b><small>${H.esc(SUB_KIND_HE[r.kind] || '')} · ספק מ${H.esc(COUNTRY_HE[r.supplier] || '')}${r.disrupted ? ' · ⚠️ הנמל של הספק משובש' : ''}${r.dual ? ' · ספק שני' : ''}</small></div>${who}</div>
      <div class="wp-rm"><span>רווח החודש ${H.num(H.mSg(r.cf), H.cls(r.cf))}</span>${r.eff != null ? `<span>יעילות ${H.num(pct(r.eff))}</span>` : ''}<span>שווי ${H.num(H.mS(r.value))}</span><span>שולם ${H.num(H.mS(r.paid))}</span>${r.frauds ? `<span class="neg">${H.num(String(r.frauds))} הונאות</span>` : ''}${g && !g.audited && !g.known ? '<span class="neg">❔ לא נבדק</span>' : ''}</div>
      ${(by.get(r.sid) || []).length ? `<div class="wp-acts pr-acts">${by.get(r.sid).map(([a, i]) => btn(a, i, MN_ACT[a.id] || a.label, a.id === 'sell' && a.preview ? H.mS(a.preview.cash) : a.id === 'audit' || a.id === 'grow' ? H.mS(-(a.preview || {}).cash || 0) : '')).join('')}</div>` : ''}</li>`; }).join('')}</ul>
    <p class="note">הטבעת סביב המנהל = האמון (אמצע טווח היושרה), רק לפי מה שנבדק. ✓ = נבדק או מוכר, ? = לא נבדק. מכירה מבקשת לחיצה שנייה.</p></section>`;
}
export function mnPanelHtml(H, P, X, btn) {
  const acts = P.actions || []; const nm = (P.rows || []).filter((r) => r.mgr).length;
  const cty = acts.map((a, i) => [a, i]).filter(([a]) => ['hedge', 'keep', 'repat'].includes(a.id));
  const grp = acts.map((a, i) => [a, i]).filter(([a]) => !a.param || ['hq', 'erp', 'hub'].includes(a.id)).filter(([a]) => !['hedge', 'keep', 'repat'].includes(a.id));
  const byC = new Map(); for (const x of cty) { const k = x[0].param; if (!byC.has(k)) byC.set(k, []); byC.get(k).push(x); }
  return `${mnLine(H, X)}<div class="wp-gauges">${(P.gauges || []).map((g) => mnGauge(H, g, nm)).join('')}</div>${countryTable(H, P.table)}${subsHtml(H, P, acts, btn)}
    ${byC.size ? `<section class="wp-sec"><h3>מטבעות ומזומן בחו"ל</h3>${[...byC].map(([c, xs]) => `<div class="wp-seg" role="group" aria-label="${H.esc(COUNTRY_HE[c] || c)}"><span class="wp-segl">${countryChip(H, c, COUNTRY_HE[c])}</span>${xs.map(([a, i]) => btn(a, i, a.label, '')).join('')}</div>`).join('')}</section>` : ''}
    ${grp.length ? `<section class="wp-sec"><h3>הקבוצה</h3><div class="wp-acts">${grp.map(([a, i]) => btn(a, i, a.label, '')).join('')}</div><p class="note">💡 = מה שהמנטור היה בוחר עכשיו. כל פעולה נכנסת לחודש הזה מיד.</p></section>` : ''}`;
}

/* ============================================================ w15 panel "האפליקציה והגיוסים" */
export const rwText = (v) => (+v >= 99 ? 'רווחית' : `${Math.round((+v || 0) * 10) / 10} חודשים`);
function pfGauge(H, g, X) {
  const v = +g.value || 0;
  if (g.id === 'runway') { const prof = X && +X.runway >= 99; const bad = !prof && v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="runway"><div class="wp-gl"><span>${H.esc(g.label)}</span><b>${H.num(prof ? 'רווחית' : rwText(X ? X.runway : v))}</b></div><div class="wp-gbar fuse" aria-hidden="true"><i style="width:${prof ? 100 : Math.round(Math.min(v, g.max) / g.max * 100)}%"></i><s style="inset-inline-start:${(g.ref / g.max) * 100}%"></s></div><small>${prof ? 'החברה מרוויחה — המזומן לא נגמר' : `היעד: ${g.ref} חודשים לפחות${v < 6 ? ' · ⚠️ פחות מחצי שנה' : ''}`}</small></div>`; }
  if (g.id === 'ltvCac') { const bad = v < g.ref;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="ltvCac"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">×${H.esc(String(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, v / g.max * 100)}%"></i><s style="inset-inline-start:${(g.ref / g.max) * 100}%"></s></div><small>מעל ×${g.ref} הפרסום מרוויח${X ? ` · משתמש שווה ₪${X.ltv}` : ''}${bad ? ' · נמוך' : ''}</small></div>`; }
  if (g.id === 'users') { const on = v >= g.ref;
    return `<div class="wp-g" data-g="users"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${v.toLocaleString('en-US')}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, v / g.max * 100)}%"></i><s style="inset-inline-start:${(g.ref / g.max) * 100}%"></s></div><small>${on ? '🌐 אפקט רשת פעיל: גיוס זול ב־20%' : `סף אפקט הרשת: ${g.ref.toLocaleString('en-US')}`}</small></div>`; }
  const bad = v < g.ref;
  return `<div class="wp-g${bad ? ' low' : ''}" data-g="${H.esc(g.id)}"><div class="wp-gl"><span>${H.esc(g.label)}</span><b class="num">${H.esc(pct1(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, v * 100)}%"></i><s style="inset-inline-start:${g.ref * 100}%"></s></div><small>${bad ? 'פחות מחצי — המשקיעים שולטים' : 'יותר מחצי — השליטה שלך'}</small></div>`;
}
function pfLine(H, X) {
  if (!X) return '';
  if (X.sold) return `<p class="wp-now">☁️ <b>החברה נמכרה</b> · נכנסו לך ${H.num(H.mS(X.proceeds))} · זה השווי שנספר ליעד.</p>`;
  return `<p class="wp-now">☁️ <b>${H.num((+X.users || 0).toLocaleString('en-US'))}</b> משתמשים · הכנסה ${H.num(H.mS(X.mrr))} בחודש (${H.num(H.mS(X.arr))} בשנה, ₪${X.arpu.toFixed ? X.arpu.toFixed(2) : X.arpu} למשתמש) · הוצאות ${H.num(H.mS(X.cost))} · ${X.cf >= 0 ? 'רווח' : 'שריפה'} ${H.num(H.mSg(X.cf), H.cls(X.cf))} בחודש
    · שוק: <b>${H.esc(X.regimeLabel || REGIME_HE[X.regime] || '')}</b> (מכפיל ${X.mult}×) · שווי החברה ${H.num(H.mS(X.ev))} · החלק שלך ${H.num(pct1(X.stake))} = ${H.num(H.mS(X.stakeValue))}${X.debt ? ` · הלוואת מיזם ${H.num(H.mS(X.debt))}` : ''} · גויסו ${H.num(H.mS(X.raised))}${X.ratchets ? ` · ${H.num(String(X.ratchets))} פיצויי מחיר למשקיעים` : ''}${X.crunches ? ` · <b class="neg">${H.num(String(X.crunches))} גיוסי חירום</b>` : ''}${X.breaches ? ` · <b class="neg">${H.num(String(X.breaches))} הפרות תנאי</b>` : ''} · המתחרה ${H.num(pct(X.rival))} מהשוק · צוות השיווק עד רמה ${X.cap}</p>`;
}
function channelsHtml(H, T, acts, btn, X) {
  if (!T || !T.length) return '';
  // a level the team could run (≤ cap) but the engine refuses = the emergency round's investors froze all marketing (platform.js spend: frozen)
  const cap = X && X.cap != null ? +X.cap : 3; const lvOf = (a) => +String(a.param).split(':')[1] || 0;
  const frozen = acts.some((a) => a.id === 'spend' && lvOf(a) > 0 && lvOf(a) <= cap && !a.enabled);
  const why = (a) => (a.enabled || a.reason ? a : { ...a, reason: lvOf(a) > cap ? 'צוות השיווק עוד קטן מדי לתקציב כזה' : frozen ? 'הפרסום מוקפא אחרי גיוס החירום' : undefined });
  const by = new Map(); acts.forEach((a, i) => { if (a.id === 'spend') { const ch = String(a.param).split(':')[0]; if (!by.has(ch)) by.set(ch, []); by.get(ch).push([why(a), i]); } });
  return `<section class="wp-sec"><h3>ערוצי הפרסום</h3>${frozen ? '<p class="wp-now pf-frozen" role="note"><b class="neg">❄️ הפרסום מוקפא:</b> המשקיעים של גיוס החירום עצרו את כל הערוצים לשלושה חודשים. אפשר רק לעצור — לא להוסיף תקציב.</p>' : ''}<div class="tblwrap"><table class="pftbl"><caption class="sr">ערוצי הפרסום: רמת התקציב (0–3), ההוצאה בחודש ועלות משתמש חדש. עלות המשתמש עולה עם התקציב ועם גודל האפליקציה.</caption>
    <thead><tr><th scope="col">ערוץ</th><th scope="col">רמה</th><th scope="col">בחודש</th><th scope="col">עלות למשתמש</th></tr></thead><tbody>${T.map((c) => `<tr><th scope="row">${H.esc(c.name)}</th><td class="num">${'▮'.repeat(c.level)}${'▯'.repeat(3 - c.level)} ${c.level}</td><td class="num">${c.spend ? H.esc(H.mS(c.spend)) : '—'}</td><td class="num">₪${Math.round(c.cac)}</td></tr>`).join('')}</tbody></table></div>
    ${T.map((c) => (by.get(c.id) || []).length ? `<div class="wp-seg" role="group" aria-label="${H.esc(c.name)}: תקציב"><span class="wp-segl">${H.esc(c.name)}</span>${by.get(c.id).map(([a, i]) => btn(a, i, `רמה ${String(a.param).split(':')[1]}`, a.cac ? `₪${Math.round(a.cac)} למשתמש` : 'לעצור')).join('')}</div>` : '').join('')}</section>`;
}
/** the last 12 cohorts: a small chart (bar = the share still here, whisker = the shown monthly retention range) + the same as a table */
function cohortsHtml(H, R) {
  if (!R || !R.length) return '';
  const W = 300, Hh = 96, bw = W / R.length;
  const y = (f) => Math.round((1 - f) * (Hh - 14)) + 4;
  const bars = R.map((c, i) => { const f = c.size ? Math.min(1, c.users / c.size) : 0; const x = Math.round(i * bw + bw * 0.18); const w = Math.max(3, Math.round(bw * 0.64));
    const rl = (c.lo - 0.8) / 0.2, rh = (c.hi - 0.8) / 0.2;   // the retention range on a 80–100 % scale (right axis)
    return `<rect x="${x}" y="${y(f)}" width="${w}" height="${Hh - 10 - y(f)}" rx="2" class="cb"/><line x1="${x + w / 2}" x2="${x + w / 2}" y1="${y(Math.max(0, Math.min(1, rh)))}" y2="${y(Math.max(0, Math.min(1, rl))) + 1}" class="cr"/>`; }).join('');
  const al = `קבוצות המשתמשים לפי חודש ההצטרפות: ${R.map((c) => `חודש ${c.m}: נשארו ${c.size ? Math.round(c.users / c.size * 100) : 0}%, שימור ${pct1(c.lo)}–${pct1(c.hi)} בחודש`).join('; ')}`;
  return `<section class="wp-sec"><h3>קבוצות המשתמשים (12 האחרונות)</h3><figure class="cohort"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${H.esc(al)}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${Hh - 10}" y2="${Hh - 10}" class="ax"/>${bars}</svg>
    <figcaption class="note">עמודה = כמה מהקבוצה עוד כאן. קו = טווח השימור החודשי שרואים עכשיו: רחב בקבוצה חדשה, צר אחרי כמה חודשים. האמת בתוכו.</figcaption></figure>
    <details class="cohort-t"><summary>הטבלה</summary><div class="tblwrap"><table class="pftbl"><caption class="sr">קבוצות המשתמשים: חודש הצטרפות, כמה הצטרפו, כמה נשארו, טווח השימור החודשי וחודשי נתונים.</caption><thead><tr><th scope="col">חודש</th><th scope="col">הצטרפו</th><th scope="col">נשארו</th><th scope="col">שימור בחודש</th><th scope="col">חודשי נתונים</th></tr></thead>
    <tbody>${R.map((c) => `<tr><th scope="row" class="num">${c.m}</th><td class="num">${c.size.toLocaleString('en-US')}</td><td class="num">${c.users.toLocaleString('en-US')}</td><td class="num">${pct1(c.lo)}–${pct1(c.hi)}</td><td class="num">${c.months}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}
export function pfPanelHtml(H, P, X, btn) {
  const acts = P.actions || [];
  const rest = acts.map((a, i) => [a, i]).filter(([a]) => a.id !== 'spend');
  const sub = (a) => (a.id === 'raise' && a.stakeAfter != null && X ? `החלק שלך ${pct1(X.stake)} ← ${pct1(a.stakeAfter)}` : '');
  return `${pfLine(H, X)}<div class="wp-gauges">${(P.gauges || []).map((g) => pfGauge(H, g, X)).join('')}</div>${channelsHtml(H, P.table, acts, btn, X)}${cohortsHtml(H, P.rows)}
    ${rest.length ? `<section class="wp-sec"><h3>כסף וגיוסים</h3><div class="wp-acts">${rest.map(([a, i]) => btn(a, i, a.label, sub(a))).join('')}</div><p class="note">סבב גיוס מוכר חלק מהחברה במחיר של השוק היום: הלחיצה הראשונה מראה כמה כסף נכנס וכמה מהחברה נשאר שלך, השנייה מאשרת.</p></section>` : ''}`;
}
/** the arm message of a two-tap action (shown in the panel's live line before the confirming tap) */
export function armText(a, X) {
  if (a.id === 'raise' && a.stakeAfter != null && X) return `סבב גיוס: נכנסים ${a.amountText || ''} — החלק שלך יורד מ־${pct1(X.stake)} ל־${pct1(a.stakeAfter)}${a.preview && a.preview.risk === 'dilution' ? ' (או פחות: מחיר מתחת לסבב הקודם מפצה את המשקיעים הקודמים)' : ''}. לחיצה נוספת מאשרת.`;
  if (a.id === 'bridge' && X) return `גישור מהמשקיעים: 8% מהחברה ב־20% פחות מהשווי — החלק שלך יורד מ־${pct1(X.stake)} ל־${pct1(X.stake * 0.92)} או פחות. לחיצה נוספת מאשרת.`;
  if (a.id === 'pivot') return 'שינוי כיוון: 40% מהמשתמשים עוזבים, ואיכות המוצר החדש לא ידועה. אפשר רק פעם אחת. לחיצה נוספת מאשרת.';
  return null;
}
