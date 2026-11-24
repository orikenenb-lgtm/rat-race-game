// w10 מרכז הפיננסים — the market screen (HTML only). The owner's brief: every stock shows company + symbol, sector, price, the change in ₪
// and %, its history, a candlestick chart, OHLC per month, its news, your qty / cost / P&L and the volume; a tap / hover on a candle gives its
// numbers; works on phones and in Hebrew; never colour alone (▲ / ▼ + words); bankrupt companies stay visible in "נסגרו" with their history
// and the claim status; a new listing is a new company; one short line "סימולציה — …"; the costs of a trade (spread, commission, tax) are
// shown BEFORE the confirm button (the engine's own market.preview).
//
// Pure: no DOM, no engine import (ui.js passes the money formatter and the action buttons). Every number comes from the engine's
// worldIndicators.market / .portfolio / panel (prices in integer agorot → ₪ via candles-lite fmtP on agorot / 100). The candles are drawn
// by the ONE chart component (render/candles-lite.js) from candlelog.marketSeries (the engine's own candles, not the replay shadow).
import { fmtP, SIM_NOTE, tableHtml } from './candles-lite.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WJ = '⁠';
const N = (n) => Math.round(+n || 0).toLocaleString('en-US');
const num = (s, c = '') => `<span class="num${c ? ' ' + c : ''}">${esc(s)}</span>`;
const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
export const pxT = (ag) => fmtP(Math.round(+ag || 0) / 100);   // agorot → "₪12.5"
const sgnPx = (ag) => (ag > 0 ? '+' + WJ : ag < 0 ? '−' + WJ : '') + fmtP(Math.abs(Math.round(ag)) / 100);
const pctS = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.round(Math.abs(x) * 10) / 10) + '%';
const ARROW = { up: '▲', down: '▼', flat: '—' };
const WORD = { up: 'עלה', down: 'ירד', flat: 'לא זז' };
const dirOf = (d) => (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
export const SIZE_HE = Object.freeze({ large: 'חברה גדולה', mid: 'חברה בינונית', small: 'חברה קטנה' });
export const STATUS_HE = Object.freeze({ listed: 'נסחרת', halted: 'המסחר מושהה', bankrupt: 'פשטה רגל', merged: 'נרכשה' });
export const CLASS_HE = Object.freeze({ cash: 'מזומן', daily: 'מניות וקרן מדד', monthly: 'קרנות', locked: 'פרטי (נעול)' });
const REASON_HE = { sold: 'נמכר', forced: 'מכירה כפויה', bankrupt: 'פשיטת רגל', merged: 'רכישה' };
const FUND_HE = { gov: 'אג"ח ממשלתי', govLong: 'אג"ח ממשלתי ארוך', linked: 'אג"ח צמוד', corp: 'אג"ח קונצרני', credit: 'אשראי פרטי', reit: 'ריט (נדל"ן)', infra: 'תשתיות', hedge: 'קרן גידור', note: 'פיקדון "מובטח"', stale: 'נדל"ן לא סחיר', distressed: 'אג"ח במצוקה', theme: 'קרן נושא' };
const PRIV_HE = { pe: 'קרן פרייבט אקוויטי', vc: 'הון סיכון מאוחר', stake: 'אחזקה ישירה בחברה פרטית', prop: 'שותפות נדל"ן', credit: 'אשראי פרטי' };

/** the month's change of a company in agorot (price − the previous close; the open candle opens at it) */
export function changeOf(co) {
  const last = (co.cand || [])[co.cand.length - 1]; const prev = co.open && co.open.o != null ? co.open.o : last ? last[4] : co.px;
  const d = Math.round((co.px ?? 0) - (prev ?? 0)); return { d, pct: prev ? ((co.px / prev) - 1) * 100 : 0 };
}
const live = (c) => c.status === 'listed' || c.status === 'halted';
/** A new listing: a company that entered the market after the first month (a relisted slot = a NEW id, its own history). */
export const isNewListing = (c, month) => (c.listedM || 0) > 1 && month - (c.listedM || 0) <= 6;

/** the regime line, the index and the simulation note (always visible) */
export function headHtml(MK, PF, month) {
  const R = MK.regime || {}; const I = MK.idx || {}; const ch = changeOf(I);
  return `<p class="wp-now mk-now">📊 מצב השוק: <b>${esc(R.label || '')}</b>${R.sectorLabel ? ` · ${esc(R.sectorLabel)}` : ''} · מאז חודש ${num(String(R.since ?? month))}
    · ${esc(I.name || 'המדד')} ${num(pxT(I.px))} <span class="${cls(ch.d)}">${ARROW[dirOf(ch.d)]} ${WORD[dirOf(ch.d)]} ${num(pctS(ch.pct))}</span> החודש${PF && PF.call ? ' · <b class="neg">⚠️ קריאת מרווח פתוחה</b>' : ''}${PF && PF.freezeUntil >= month ? ' · ❄️ הנזילות החודשית קפואה' : ''}${PF && PF.hedge ? ' · 🛡️ הגנת אופציות פעילה' : ''}</p>
    <p class="mk-sim" role="note">⚠️ ${esc(SIM_NOTE)}</p>`;
}
/** the liquidity ladder: cash (0 days) → stocks and the index (2) → funds (30) → private (locked) — the engine's rungs */
export function ladderHtml(L, M, PF) {
  if (!L || !L.length) return '';
  const top = Math.max(1, ...L.map((x) => +x.value || 0));
  const owed = PF ? (+PF.debt || 0) + (+PF.unfunded || 0) : 0;
  return `<section class="wp-sec"><h3>סולם הנזילות: תוך כמה זמן זה מזומן</h3><ol class="mk-ladder">${L.map((x) => `<li data-rung="${esc(x.id)}"><span class="ml-n">${esc(x.label)}</span><span class="ml-d">${x.days === 0 ? 'עכשיו' : x.days >= 365 ? 'שנה ויותר' : `תוך ${num(String(x.days))} ימים`}</span><span class="ml-bar" aria-hidden="true"><i class="lq-${esc(x.id)}" style="width:${Math.max(1, Math.round(((+x.value || 0) / top) * 100))}%"></i></span><b class="num">${esc(M.mS(x.value))}</b></li>`).join('')}</ol>
    <p class="note">${owed ? `התחייבויות: הלוואה כנגד התיק ${num(M.mS(PF.debt || 0))}${PF.unfunded ? ` · התחייבויות לקרנות פרטיות ${num(M.mS(PF.unfunded))}` : ''}. ` : ''}מה שבשלב הראשון והשני מכסה את החובות בלי למכור בהנחה.</p></section>`;
}
/** tabs (buttons with aria-pressed: a phone-friendly segmented row) */
export function tabsHtml(tab, counts) {
  const T = [['list', `מניות (${counts.list})`], ['closed', `נסגרו (${counts.closed})`], ['funds', `קרנות ופרטי (${counts.funds})`], ['acts', 'מינוף ופעולות']];
  return `<div class="mk-tabs" role="group" aria-label="חלקי הבורסה והתיק">${T.map(([id, l]) => `<button type="button" class="chip mk-tab" data-mtab="${id}" aria-pressed="${tab === id}">${esc(l)}</button>`).join('')}</div>`;
}
/** one company (or the index) as a row button */
function coRow(c, M, sel, month) {
  const ch = changeOf(c); const d = dirOf(ch.d); const H = c.held;
  const badges = [c.halted ? '<em class="b warn">⏸ מושהה</em>' : '', c.merge ? `<em class="b">🤝 נרכשת ב־${num(pxT(c.merge.px))} בחודש ${num(String(c.merge.at))}</em>` : '', isNewListing(c, month) ? `<em class="b ok">🆕 הנפקה חדשה · חודש ${num(String(c.listedM))}</em>` : '',
    c.seen ? `<em class="b">🔎 איכות ${esc(c.seen.bandLabel || '')}${c.seen.distress ? ` · ${num(String(c.seen.distress))} סימני מצוקה` : ''}</em>` : ''].join('');
  const hold = H && H.qty ? `<span class="mk-hd">יש לך ${num(N(H.qty))} · ${num(M.mS(H.value))} · <span class="${cls(H.pnl)}">${H.pnl > 0 ? 'רווח' : H.pnl < 0 ? 'הפסד' : 'בלי שינוי'} ${num(M.mSg(H.pnl), cls(H.pnl))}</span></span>` : '';
  // the button's name is its visible text (axe label-content-name-mismatch) + hidden words: "סימול", "מחיר", the direction in words
  return `<li class="mk-co${sel ? ' on' : ''}" data-co="${esc(c.id)}"><button type="button" class="mk-row" data-mco="${esc(c.id)}" aria-expanded="${sel}" aria-controls="mkDetail">
    <span class="mk-nm"><b>${esc(c.name)}</b><small><span class="sr">סימול </span>${num(c.tk)} · ${esc(c.sectorLabel || (c.id === 'IDX' ? 'כל השוק' : ''))}</small></span>
    <span class="mk-px"><b class="num"><span class="sr">מחיר </span>${esc(pxT(c.px))}</b><small class="${cls(ch.d)}">${ARROW[d]}<span class="sr"> ${WORD[d]} החודש</span> ${num(sgnPx(ch.d), cls(ch.d))} (${num(pctS(ch.pct), cls(ch.d))})</small></span>${hold}</button>${badges ? `<span class="mk-bd">${badges}</span>` : ''}</li>`;
}
/** the company list: the index fund first, then the listed companies (by sector) */
export function listHtml(MK, M, sel, month) {
  const cos = (MK.cos || []).filter(live).slice().sort((a, b) => (a.sector < b.sector ? -1 : a.sector > b.sector ? 1 : a.slot - b.slot));
  return `<section class="wp-sec"><h3>החברות בבורסה (${num(String(cos.length))})</h3><ul class="mk-list">${coRow(MK.idx, M, sel === 'IDX', month)}${cos.map((c) => coRow(c, M, sel === c.id, month)).join('')}</ul>
    <p class="note">כל החברות בדיוניות. ▲ / ▼ = כיוון המחיר מתחילת החודש. לחיצה על חברה פותחת את הגרף, החדשות והמסחר.</p></section>`;
}
/** the closed companies (bankrupt / bought) — still in the market list for their claim months, then in the grave — and the closed positions */
export function closedHtml(MK, M, sel) {
  const now = (MK.cos || []).filter((c) => !live(c));
  const grave = (MK.grave || []).slice().reverse();
  const claim = (id) => (MK.claims || []).find((x) => x.coId === id);
  const closedPos = (id) => (MK.closed || []).filter((x) => x.coId === id && (x.reason === 'bankrupt' || x.reason === 'merged'));
  const status = (c, reason) => { const cl = claim(c.id); const p = closedPos(c.id)[0];
    if (cl) return `תביעת נושים: ${num(N(cl.qty))} מניות × ${num(pxT(cl.px))} = ${num(M.mS(cl.amount))}, תשולם בחודש ${num(String(cl.payM))}`;
    if (p && reason === 'bankrupt') return `התביעה שולמה: ${num(M.mS(p.proceeds))} (הפסד ${num(M.mSg(p.pnl), cls(p.pnl))})`;
    if (p && reason === 'merged') return `קיבלת ${num(M.mS(p.proceeds))} במזומן`;
    return 'לא החזקת מניות — אין תביעה'; };
  const item = (c, key, reason) => `<li class="mk-co mk-dead${sel === key ? ' on' : ''}" data-co="${esc(key)}"><button type="button" class="mk-row" data-mco="${esc(key)}" aria-expanded="${sel === key}" aria-controls="mkDetail">
    <span class="mk-nm"><b>${esc(c.name)}</b><small>${num(c.tk)} · ${esc(c.sectorLabel || (MK.sectors || {})[c.sector] || '')}</small></span>
    <span class="mk-px"><b class="num">${esc(pxT(c.endPx ?? c.px))}</b><small>${reason === 'bankrupt' ? '✖ פשטה רגל' : '🤝 נרכשה'} בחודש ${num(String(c.endedM ?? ''))}${c.peakPx ? ` · שיא ${num(pxT(c.peakPx))}` : ''}</small></span>
    <span class="mk-hd">${status(c, reason)}</span></button></li>`;
  const rows = [...now.map((c) => item(c, c.id, c.status)), ...grave.map((g, i) => item(g, 'g' + (grave.length - 1 - i), g.reason))];
  const pos = (MK.closed || []).slice().reverse().slice(0, 12);
  return `<section class="wp-sec"><h3>נסגרו: חברות שפשטו רגל או נרכשו</h3>${rows.length ? `<ul class="mk-list">${rows.join('')}</ul>` : '<p class="empty">עוד אף חברה לא נסגרה. חברה שפושטת רגל נשארת כאן עם ההיסטוריה שלה ועם מצב התביעה.</p>'}
    <p class="note">חברה שנסגרה לא חוזרת. כשנפתח מקום בבורסה, נכנסת חברה חדשה — עם שם, סימול והיסטוריה משלה.</p></section>
    ${pos.length ? `<section class="wp-sec"><h3>פוזיציות שנסגרו</h3><ul class="mk-closed">${pos.map((x) => `<li><span>${esc(x.name || '')}</span><small>חודש ${num(String(x.m))} · ${esc(REASON_HE[x.reason] || x.reason || '')} · ${num(N(x.qty))}</small><b class="${cls(x.pnl)}">${num(M.mSg(x.pnl), cls(x.pnl))}</b></li>`).join('')}</ul>
      <p class="note">רווח שמומש ${num(M.mSg(MK.realized || 0), cls(MK.realized || 0))} · עמלות ${num(M.mS(MK.fees || 0))} · מרווח (קנייה ביוקר, מכירה בזול) ${num(M.mS(MK.spreadPaid || 0))} · מס ${num(M.mS(MK.taxPaid || 0))} · דיבידנדים ${num(M.mS(MK.divs || 0))}</p></section>` : ''}`;
}
/** the funds and the private holdings (with their actions from the engine's panel.actions) */
export function fundsHtml(PF, M, acts) {
  const F = (PF && PF.funds) || [], P = (PF && PF.privates) || [];
  const f = F.map((x) => `<li class="wp-row" data-asset="${esc(x.assetId)}" data-light="${x.frozen || x.defaulted ? 'red' : x.redeeming ? 'amber' : 'green'}"><div class="wp-rh"><b>${esc(x.name)}</b><small>${esc(FUND_HE[x.kind] || x.kind || '')} · נזילות חודשית</small>${x.frozen ? '<em class="b warn">❄️ קפוא</em>' : ''}${x.redeeming ? '<em class="b">⏳ בפדיון</em>' : ''}${x.defaulted ? '<em class="b warn">✖ חדלות פירעון</em>' : ''}${x.stale ? '<em class="b warn">שווי מתעדכן פעם בחצי שנה</em>' : ''}</div>
    <div class="wp-rm"><span>שווי ${num(M.mS(x.value))}</span>${x.cost ? `<span>עלות ${num(M.mS(x.cost))}</span>` : ''}<span class="pos">תשואה ${num(String(x.yieldPct) + '%')} בשנה (${num(M.mS(x.cf))} בחודש)</span>${x.dur ? `<span>משך ${num(String(x.dur))} שנים (רגישות לריבית)</span>` : ''}${x.markAt ? `<span>עדכון השווי הבא: חודש ${num(String(x.markAt))}</span>` : ''}</div>${acts((a) => a.assetId === x.assetId)}</li>`).join('');
  const p = P.map((x) => `<li class="wp-row" data-asset="${esc(x.assetId)}" data-light="off"><div class="wp-rh"><b>${esc(x.name)}</b><small>${esc(PRIV_HE[x.type] || x.type || '')} · נעול</small>${x.band ? `<em class="b">מכפיל צפוי ${num(`${x.band.lo}×–${x.band.hi}×`)}</em>` : ''}</div>
    <div class="wp-rm"><span>שווי בדוח ${num(M.mS(x.value))}</span>${x.commit ? `<span>התחייבות ${num(M.mS(x.commit))} · נקרא ${num(M.mS(x.called || 0))}</span>` : ''}${x.unfunded ? `<span class="neg">עוד יקראו ${num(M.mS(x.unfunded))}</span>` : ''}${x.cost ? `<span>השקעה ${num(M.mS(x.cost))}</span>` : ''}${x.lockUntil ? `<span>נעול עד חודש ${num(String(x.lockUntil))}</span>` : ''}${x.paidOut ? `<span class="pos">חולק ${num(M.mS(x.paidOut))}</span>` : ''}</div>${acts((a) => a.assetId === x.assetId)}</li>`).join('');
  return `<section class="wp-sec"><h3>קרנות (נזילות חודשית)</h3>${f ? `<ul class="wp-rows">${f}</ul>` : '<p class="empty">אין לך קרנות. קרנות מגיעות במשבצת "הזדמנות": אג"ח, ריט, אשראי — נזילות חודשית.</p>'}</section>
    <section class="wp-sec"><h3>השקעות פרטיות (נעולות)</h3>${p ? `<ul class="wp-rows">${p}</ul>` : '<p class="empty">אין לך השקעות פרטיות. הן מגיעות במשבצת "השקעה פרטית": נעולות לשנים, ואי אפשר ללוות כנגדן.</p>'}</section>`;
}
/** one company's detail: identity, price and change, your position, the chart host, the month table (OHLC + volume), events + news, the trade */
export function detailHtml(c, s, MK, M, { trade = '', research = '', readOnly = false } = {}) {
  if (!c) return '';
  const ch = changeOf(c); const d = dirOf(ch.d); const H = c.held;
  const since = s ? s.since : 0;
  const idx = c.id === 'IDX';
  const facts = [idx ? 'קרן מדד: קצת מכל השוק' : `${esc(SIZE_HE[c.size] || '')}`, !idx && c.debt != null ? `חוב ${esc(c.debt === 'high' ? 'גבוה' : c.debt === 'low' ? 'נמוך' : 'בינוני')}` : '', c.div ? `דיבידנד ${num(Math.round(c.div * 1000) / 10 + '%')} בשנה` : '',
    c.beta != null ? `רגישות לשוק ×${num(String(Math.round(c.beta * 100) / 100))}` : '', c.hs != null ? `מרווח קנייה/מכירה ${num(Math.round(c.hs * 2 * 10000) / 100 + '%')}` : '', c.status && c.status !== 'listed' ? `<b>${esc(STATUS_HE[c.status] || c.status)}</b>` : ''].filter(Boolean).join(' · ');
  const hold = H && H.qty ? `<div class="cdl-hold"><div class="row"><span>יש לך</span><b class="num">${esc(N(H.qty))} ${idx ? 'יחידות' : 'מניות'}</b></div>
    <div class="row"><span>עלות (כולל עמלות)</span>${num(M.mS(H.basis))}</div><div class="row"><span>מחיר ממוצע</span>${num(pxT(H.qty ? (H.basis * 100) / H.qty : 0))}</div>
    <div class="row"><span>שווי עכשיו</span>${num(M.mS(H.value))}</div><div class="row"><span>רווח / הפסד על הנייר</span><b>${num(M.mSg(H.pnl), cls(H.pnl))} (${num(pctS(H.basis ? (H.value / H.basis - 1) * 100 : 0), cls(H.pnl))})</b></div>
    <div class="row"><span>עמלות ששילמת · דיבידנדים</span>${num(`${M.mS(H.fees || 0)} · ${M.mS(H.divs || 0)}`)}</div>${H.opened ? `<div class="row"><span>מאז</span>${num('חודש ' + H.opened)}</div>` : ''}</div>`
    : readOnly ? '' : `<p class="note">אין לך ${idx ? 'יחידות' : 'מניות'} של ${num(c.tk)} כרגע.</p>`;
  const evs = (c.ev || []).slice().reverse();
  const news = (MK.news || []).filter((x) => x.coId === c.id).slice().reverse().slice(0, 6);
  const evHtml = evs.length || news.length ? `<h4 class="cdl-h3">📰 חדשות ואירועים של ${esc(c.name)}</h4><ul class="cdl-news">${evs.map((e) => `<li><span class="cdl-nm">חודש ${num(String(e.m))}</span> ${esc(e.label)}${e.pct ? ` <span class="cdl-nd">${e.pct > 0 ? '▲' : '▼'} ${num(pctS(e.pct * 100), cls(e.pct))}</span>` : ''}</li>`).join('')}${news.map((x) => `<li${x.type === 'rumor' ? ' class="rumor"' : ''}><span class="cdl-nm">חודש ${num(String(x.m))}</span> ${x.type === 'rumor' ? '🗣️ שמועה: ' : ''}${esc(x.text)}</li>`).join('')}</ul>`
    : '<p class="note">אין חדשות על החברה הזו לאחרונה.</p>';
  return `<section class="wp-sec mk-detail" id="mkDetail" data-co="${esc(c.id)}" aria-label="${esc(`${c.name} (${c.tk})`)}">
    <div class="cdl-head"><div class="cdl-id"><b class="cdl-name">${esc(c.name)}</b><small>סימול ${num(c.tk)} · ${esc(c.sectorLabel || (idx ? 'כל השוק' : ''))}</small><small>${facts}</small></div>
      <div class="cdl-px"><b class="num">${esc(pxT(c.px ?? c.endPx))}</b><small class="${cls(ch.d)}">${readOnly ? 'מחיר אחרון' : `${ARROW[d]} ${WORD[d]} החודש ${num(sgnPx(ch.d), cls(ch.d))} (${num(pctS(ch.pct), cls(ch.d))})`}</small>${s ? `<small>מאז ${s.listedM > 1 ? `ההנפקה (חודש ${num(String(s.listedM))})` : 'תחילת המשחק'}: ${num(sgnPx(Math.round(since * 100)), cls(since))} (${num(pctS(s.sincePct), cls(since))})</small>` : ''}</div></div>
    ${hold}
    <div class="cdl-host mk-chart" data-cdl-key="${esc(c.id)}"></div><p class="cdl-cap">חודשי משחק, משמאל (ישן) לימין (עכשיו) · נר אחד = חודש אחד · עמודות בתחתית = מחזור. נגיעה בנר מראה את המספרים שלו.</p>
    <p class="cdl-leg"><span><i class="lg up" aria-hidden="true"></i> חלול ▲ = עלה בחודש</span><span><i class="lg down" aria-hidden="true"></i> מלא ▼ = ירד</span><span><i class="lg flat" aria-hidden="true"></i> קו — = לא זז</span><span>קווקו = החודש הנוכחי</span></p>
    <p class="mk-sim" role="note">⚠️ ${esc(SIM_NOTE)}</p>
    ${s ? tableHtml(s) : ''}${evHtml}${research}${trade}</section>`;
}
/** the order form: side, unit (₪ / shares), the amount, quick chips; the preview box and the confirm button are filled by previewHtml */
export function tradeFormHtml(c, v, cash, M, block) {
  const idx = c.id === 'IDX'; const H = c.held; const u = idx ? 'יחידות' : 'מניות';
  if (block) return `<div class="mk-trade" id="mkTrade"><p class="warn">${esc(block)}</p></div>`;
  const side = v.side === 's' && H && H.qty ? 's' : 'b'; const unit = side === 's' ? 'qty' : v.unit === 'qty' ? 'qty' : 'cash';
  const chips = side === 'b' ? [[1000000, '₪1M'], [5000000, '₪5M'], [Math.floor(cash * 0.1), '10% מהמזומן'], [Math.floor(cash), 'כל המזומן']].filter(([x]) => x >= 10000)
    : [[Math.ceil(H.qty / 4), 'רבע'], [Math.ceil(H.qty / 2), 'חצי'], [H.qty, 'הכל']];
  return `<div class="mk-trade" id="mkTrade"><h4 class="cdl-h3">💱 מסחר ב־${esc(c.name)}</h4>
    <div class="wp-seg" role="group" aria-label="קנייה או מכירה"><span class="wp-segl">פעולה</span><button type="button" class="chip wp-act${side === 'b' ? ' cur' : ''}" data-mside="b" aria-pressed="${side === 'b'}">קנייה</button><button type="button" class="chip wp-act${side === 's' ? ' cur' : ''}" data-mside="s" aria-pressed="${side === 's'}" ${H && H.qty ? '' : 'disabled'}>מכירה${H && H.qty ? '' : '<small> · אין לך</small>'}</button></div>
    ${side === 'b' ? `<div class="wp-seg" role="group" aria-label="סכום או כמות"><span class="wp-segl">לפי</span><button type="button" class="chip wp-act${unit === 'cash' ? ' cur' : ''}" data-munit="cash" aria-pressed="${unit === 'cash'}">סכום בשקלים</button><button type="button" class="chip wp-act${unit === 'qty' ? ' cur' : ''}" data-munit="qty" aria-pressed="${unit === 'qty'}">מספר ${u}</button></div>` : ''}
    <label class="mk-amt"><span>${side === 'b' ? (unit === 'cash' ? 'כמה שקלים להשקיע' : `כמה ${u} לקנות`) : `כמה ${u} למכור (יש לך ${N(H.qty)})`}</span><input id="mkAmt" type="number" inputmode="numeric" dir="ltr" min="0" step="1" value="${esc(String(v.amount || ''))}" aria-describedby="mkPv"></label>
    <div class="mk-q">${chips.map(([x, l]) => `<button type="button" class="chip" data-mq="${esc(String(x))}">${esc(l)}</button>`).join('')}</div>
    <div class="mk-pv" id="mkPv" aria-live="polite"></div>
    <p class="note">מזומן עכשיו: ${num(M.mS(cash))}. קנייה במזומן בלבד — להלוואה כנגד התיק: "מינוף ופעולות".</p></div>`;
}
/** the preview (market.preview — the engine's own numbers) and the confirm button, BEFORE the tap */
export function previewHtml(pv, c, M, cash) {
  if (!pv || !pv.qty) return `<p class="note">${pv && pv.side === 'b' && !pv.qty ? 'הסכום לא מספיק אפילו למניה אחת.' : 'בוחרים סכום או כמות — העלויות יופיעו כאן לפני האישור.'}</p><button type="button" class="chip wp-act mk-go" data-mgo disabled>לאשר</button>`;
  // exact shekels (M.ex): the costs before the tap are the costs the engine charges
  const b = pv.side === 'b'; const X = M.ex || M.mS; const u = c.id === 'IDX' ? 'יחידות' : 'מניות'; const short = b && pv.total > cash;
  const rows = [['כמות', `${N(pv.qty)} ${u}`], ['מחיר בשוק (אמצע)', pxT(pv.px)], [b ? 'מחיר הקנייה בפועל (עם המרווח)' : 'מחיר המכירה בפועל (עם המרווח)', pxT(pv.fill)],
    ['שווי לפי המחיר', X(b ? pv.amount - pv.spreadCost : pv.amount + pv.spreadCost)],
    ['מרווח (קונים קצת יקר, מוכרים קצת זול)', X(pv.spreadCost)], ['עמלה', X(pv.commission)], ...(b ? [] : [['מס רווח הון (25%)', X(pv.tax)]])];
  return `<div class="grid mk-pvg" data-qty="${pv.qty}" data-total="${pv.total}" data-spread="${pv.spreadCost}" data-comm="${pv.commission}" data-tax="${pv.tax || 0}">${rows.map(([k, x]) => `<div class="row"><span>${esc(k)}</span>${num(x)}</div>`).join('')}
    <div class="row"><b>${b ? 'יוצא מהמזומן' : 'נכנס למזומן'}</b><b class="big num ${b ? 'neg' : 'pos'}">${esc(X(pv.total))}</b></div>
    <div class="row"><span>אחרי העסקה</span>${num(`${N(pv.qtyAfter)} ${u} · ${X(pv.valueAfter)}`)}</div>${pv.qtyAfter ? `<div class="row"><span>אם תמכור הכל מיד אחר כך</span>${num(X(pv.ifSoldNow))}</div>` : ''}</div>
    ${short ? '<p class="warn">אין מספיק מזומן לעסקה הזו.</p>' : ''}<button type="button" class="chip wp-act mk-go${b ? '' : ' risky'}" data-mgo="${esc(`${c.id}:${pv.side}:${pv.qty}`)}" ${short ? 'disabled' : ''}>${b ? `לאשר קנייה: ${N(pv.qty)} ${u} ב־${esc(X(pv.total))}` : `לאשר מכירה: ${N(pv.qty)} ${u}, מקבלים ${esc(X(pv.total))}`}</button>`;
}
