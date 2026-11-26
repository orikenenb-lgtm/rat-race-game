// w14 רובע הבנקים / w17 גבעת המעבדות / w18 חוף הסערות / w19 פעמון הבורסה / w20 רחוב הקרנות — the in-game HTML of the five worlds (the
// tile cards, the market-news blocks, the panels' bodies, the HUD chip, the sheet box, the words of a two-tap action). PURE: strings only, no
// DOM, no engine import, no arithmetic beyond formatting the engine's own numbers (ev.data, worldIndicators.credit / trials / insure / bell /
// funds, panel.gauges / rows / actions). ui.js passes its formatters in H = { esc, escI, num, mS, mSg, pctI, row, grid, cls, iso, sgn }.
//
// w14 — the offer card (tile J: a loan book's size, its price and discount — booked as a credit provision, not a gain —, the borrowers'
//   quality as a RANGE that a credit committee narrows in place, the capital ratio now → after, the depositors' flight risk in words) and
//   the bank panel "הבנק" (equity, the capital ratio against 8 % / 10 %, the depositors' confidence against a run at 30, the month's
//   interest / costs / provisions / losses, the policy rate; an accessible table of the five segments; a price group per segment, stop
//   lending, sell a quarter of the book (two taps); liquidity, raise capital (two taps: the dilution), dividend).
// w17 — the candidate card (tile V: the printed odds of every stage left, the sealed quality as a band that due diligence narrows, the
//   chance to reach the shelf, the cost still to pay, peak sales and the patent) and the lab panel "המעבדה" (a row per slot: the stage, its
//   odds, what was spent — "sunk, it does not change the choice" —, the cost left, the value of going on; go / license / partner / stop,
//   a royalty sale; the plant and discovery). Stop, license, partner and a royalty sale need a second tap.
// w18 — the policy-book card (tile Z: premium, price from the insurer's capital, the loss ratio as a band, the year's underwriting result,
//   solvency now → after, the storm exposure in words) and the insurer panel "חברת הביטוח" (solvency against 120 % / 100 %, the 12-month
//   combined ratio against 100 %, the month's result; a table of the five lines; a price group + run-off per line; XoL layers with their
//   cost, the quota share, a cat bond (two taps), the float's risk; raise (two taps), dividend).
// w19 — the bolt-on card (tile W: EBITDA, the price and its multiple vs the sector's, cash and debt vs new shares, net debt ÷ EBITDA after,
//   the quality band) and the company panel "החברה בבורסה" (listed or not, the price vs the peers, your stake at the market, net debt ÷
//   EBITDA, credibility, the quarter's guidance vs the consensus so far; the two divisions with grow / sell (two taps); IPO floats (two
//   taps), guidance, buyback, dividend, a secondary (two taps), repay).
// w20 — the mandate card (tile W: the amount, the fee share, the lock's deeper cut, the patience in words — the true one is sealed) and the
//   fund panel "הקרן" (money managed, net worth, the 12-month return vs the index, gross exposure; an accessible table of the twelve
//   positions — weight, beta, short crowding, the research band, last month; long / short / close per company (a sale and a close need a
//   second tap — a short "has no loss limit"); hug the index, de-risk, the redemption gate (two taps: reputation and ★★★), the index
//   product, your own money in / out).
import { SEG_HE, SEG_IDS, LINE_HE, LINE_EMOJI, STAGE_HE17, DIVB_HE } from './vocab.js';

const pct = (x) => `${Math.round((+x || 0) * 100)}%`;
const pct1 = (x) => `${Math.round((+x || 0) * 1000) / 10}%`;
const pp = (x) => `${(+x > 0 ? '+' : +x < 0 ? '−' : '')}${Math.round(Math.abs(+x || 0) * 10) / 10} נק׳`;
const x2 = (v) => (Math.round((+v || 0) * 100) / 100).toFixed(2);
const nf = (n) => Math.round(+n || 0).toLocaleString('en-US');
const sgnPct1 = (x) => `${Math.abs(+x || 0) < 0.0005 ? '' : +x > 0 ? '+' : '−'}${pct1(Math.abs(+x || 0))}`;
/** a [lo, hi] band on a 0–1 track (words carry the numbers) */
const rangeBar = (lo, hi, cls = '') => `<span class="rbar ${cls}" aria-hidden="true"><i style="inset-inline-start:${Math.round(Math.max(0, Math.min(1, lo)) * 100)}%;width:${Math.max(2, Math.round((Math.min(1, hi) - Math.max(0, lo)) * 100))}%"></i></span>`;
/** a gauge row: label, the value (an isolated run), a bar with a reference mark, a small line */
const gauge = (H, id, label, valHtml, frac, ref, small, low = false) => `<div class="wp-g${low ? ' low' : ''}" data-g="${H.esc(id)}"><div class="wp-gl"><span>${H.esc(label)}</span><b>${valHtml}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></i>${ref != null ? `<s style="inset-inline-start:${Math.round(Math.max(0, Math.min(1, ref)) * 100)}%"></s>` : ''}</div>${small ? `<small>${small}</small>` : ''}</div>`;
const sec = (title, body, note = '') => `<section class="wp-sec"><h3>${title}</h3>${body}${note ? `<p class="note">${note}</p>` : ''}</section>`;
const grp = (H, label, items, btn) => (items.length ? `<div class="wp-seg" role="group" aria-label="${H.esc(label)}"><span class="wp-segl">${H.esc(label.split(':').pop().trim())}</span>${items.map(([a, i, l, s]) => btn(a, i, a.current ? `✓ ${l}` : l, a.current ? 'עכשיו' : s)).join('')}</div>` : '');
const acts = (items, btn) => (items.length ? `<div class="wp-acts pr-acts">${items.map(([a, i, l, s]) => btn(a, i, l, s)).join('')}</div>` : '');
/** panel.actions with their index (the panel's one handler reads data-wact) */
const idx = (P) => (P.actions || []).map((a, i) => [a, i]);
const short = (o) => String(o.label || '').replace(/\s*\([^()]*\)\s*$/, '');

/** an option's / action's risk key in words (never colour alone) */
export const RISK_W = Object.freeze({
  'sealed:pd': 'איכות הלווים נחשפת רק עם הזמן — הטווח למטה', flight: 'כסף זול שבורח מהר כשהאמון יורד',
  'sealed:odds': 'הסיכוי האמיתי יכול להיות נמוך מהמודפס (בטווח שבכרטיס)', 'sealed:lr': 'יחס התביעות האמיתי מתגלה רק עם הזמן (בטווח שבכרטיס)',
  'sealed:q': 'הרווח האמיתי יכול להיות 80%–120% ממה שמוצהר', 'sealed:h': 'אם הכסף חם — הוא יברח בחודש רע, והקרן תמכור בתחתית כדי לשלם',
});
/** the card's buttons: each with its money now (or "מקופת החברה"), its months and its risk in words; pass = safe */
export function cardActions(H, ev) {
  const who = cardKind(ev) === 'credit' ? 'מההון של הבנק' : 'עכשיו';   // w14: the credit committee and the purchase come out of the bank's balance sheet, not your cash
  const b = (o, i) => { const P = o.preview || {}; const free = o.id === 'pass';
    const sub = free ? 'בלי לשלם כלום' : [P.cash ? `${H.sgn(P.cash)} ${who}` : '', o.note ? o.note : '', P.months && o.id !== 'check' ? `${P.months} חודשים` : '', o.id === 'check' ? 'הכרטיס נשאר פתוח' : ''].filter(Boolean).join(' · ');
    const rk = P.risk && RISK_W[P.risk] ? `<small class="net sub rk-w">⚠️ ${H.esc(RISK_W[P.risk])}</small>` : '';
    return `<div class="opt"><button data-o="${H.esc(o.id)}" class="${o.primary ? 'primary' : ''} hasnet rk-b${P.risk ? ' rk-on' : ''}" data-risk="${H.esc(P.risk || '')}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}><span>${H.escI((P.cash ? short(o) : '') || o.label)}</span>${sub ? `<small class="net sub">${H.escI(sub)}</small>` : ''}${rk}${o.primary ? '<small class="tagc rec">המנטור</small>' : ''}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${H.escI(o.reason)}</small>` : ''}</div>`; };
  return `<div class="acts col rk-acts">${ev.options.map(b).join('')}</div>`;
}
/** which of the five cards an event is (null = not one of them) */
export function cardKind(ev) {
  const d = (ev && ev.type === 'mech' && ev.data) || {};
  if ((d.kind === 'book' || d.kind === 'deposits') && d.pdMult && d.capRatioAfter != null) return 'credit';   // w14 J
  if (d.kind === 'candidate' && Array.isArray(d.odds) && d.shift) return 'trials';                            // w17 V
  if (d.kind === 'book' && d.line && d.lrMult) return 'insure';                                                // w18 Z
  if (d.kind === 'boltOn' && d.ebitda != null && d.sectorMult != null) return 'bell';                          // w19 W
  if (d.kind === 'mandate' && d.amount != null && d.feeShare != null) return 'funds';                          // w20 W
  return null;
}
const head = (H, chips) => `<div class="div-h">${chips.filter(Boolean).map(([t, c]) => `<span class="b${c ? ' ' + c : ''}">${H.esc(t)}</span>`).join('')}</div>`;

/* ============================================================ the five cards */
function creditCard(H, ev) {
  const d = ev.data; const dep = d.kind === 'deposits'; const B = d.pdMult || {};
  const chips = [[dep ? '🏦 מפקידים של בנק שקרס' : `📚 תיק ${SEG_HE[d.seg] || ''}`], dep ? null : d.checked ? ['🔍 נבדק בוועדת אשראי', 'ok'] : ['❔ לא נבדק', 'warn']];
  const after = d.capRatioAfter; const bad = after < 0.08;
  const rows = [H.row('היקף', H.mS(d.size)),
    dep ? H.row('מה מקבלים', 'פיקדונות: כסף זול לבנק — שבורח מהר כשהאמון יורד', 'wrap') : H.row('המחיר', `${H.mS(d.price)} (${pct(d.price / Math.max(1, d.size))} מהערך)`, 'wrap'),
    dep ? '' : H.row('ההנחה', `${H.mS(d.size - d.price)} — נרשמת כהפרשה להפסדי אשראי, לא כרווח`, 'wrap'),
    dep ? '' : H.row(`איכות הלווים — ${d.checked ? 'אחרי ועדת האשראי' : 'לפני בדיקה'}`, `שיעור הכשל פי ${ltr(`${x2(B.lo)}–${x2(B.hi)}`)} מהממוצע`, 'wrap'),
    dep ? '' : `<div class="row acq-r"><span>האמת בתוך הטווח (פי 0.5 עד 1.6)</span>${rangeBar((B.lo - 0.5) / 1.1, (B.hi - 0.5) / 1.1, d.checked ? 'narrow' : '')}</div>`,
    H.row('יחס ההון', `${pct1(d.capRatio)} ← אחרי: ${pct1(after)}${bad ? ' — מתחת ל־8%: אסור' : after < 0.1 ? ' — מתחת ליעד של 10%' : ''}`, bad ? 'neg wrap' : 'wrap'),
    H.row('מי משלם', 'הבנק, מהמאזן שלו — לא המזומן שלך', 'wrap')];
  return head(H, chips) + H.grid(rows) + (d.note ? `<p class="note">${H.escI(d.note)}</p>` : '') + (dep || d.checked ? '' : `<p class="note">ועדת אשראי (${H.esc(H.mS(d.checkFee))}) מצמצמת את הטווח — והכרטיס נשאר פתוח.</p>`);
}
function trialsCard(H, ev) {
  const d = ev.data; const S = d.shift || {}; const st = d.stage | 0;
  const left = (d.odds || []).map((o, k) => (k >= st ? `${STAGE_HE17[k]} ${pct(o)}` : null)).filter(Boolean).join(' · ');
  const chips = [[`🧪 ${AREA_HE[d.area] || ''}`], [`לפני ${STAGE_HE17[st] || ''}`], d.checked ? ['🔍 נבדקה', 'ok'] : ['❔ לא נבדקה', 'warn']];
  const rows = [H.row('הסיכויים המודפסים לכל שלב שנשאר', left, 'wrap'),
    H.row(`האיכות הסודית — ${d.checked ? 'אחרי בדיקה' : 'לפני בדיקה'}`, `${pp((S.lo || 0) * 100)} עד ${pp((S.hi || 0) * 100)} לכל שלב`, 'wrap'),
    `<div class="row acq-r"><span>האמת בתוך הטווח (−10 עד +10 נקודות)</span>${rangeBar(((S.lo || 0) + 0.1) / 0.2, ((S.hi || 0) + 0.1) / 0.2, d.checked ? 'narrow' : '')}</div>`,
    H.row('הסיכוי להגיע למדף (לפי מה שידוע)', pct(d.pLaunch)), H.row('עלות השלבים שנשארו', H.mS(d.costLeft)),
    H.row('מכירות בשיא', `${H.mS(d.peak)} בחודש`), H.row('פטנט', `${nf(d.life)} חודשים מהאישור — אחר כך המכירות צונחות ב־80%`, 'wrap'),
    H.row('המחיר', H.mS(d.price)), H.row('מקום במעבדה', d.slot >= 0 ? `תא ${d.slot + 1} פנוי` : 'אין מקום — כל 8 התאים תפוסים', d.slot >= 0 ? '' : 'neg')];
  return head(H, chips) + H.grid(rows) + `<p class="note">מה שתשלם עכשיו לא חוזר אם המולקולה נכשלת. בכל תוצאה שואלים רק: כמה עוד עולה להמשיך, ומה הסיכוי מכאן.${d.checked ? '' : ` בדיקה (${H.esc(H.mS(d.checkFee))}) מצמצמת את הטווח ל־±3 נקודות.`}</p>`;
}
function insureCard(H, ev) {
  const d = ev.data; const B = d.lrMult || {}; const after = d.solvencyAfter;
  const chips = [[`${LINE_EMOJI[d.line] || '☂️'} ${LINE_HE[d.line] || ''}`], d.storm > 0 ? [`🌀 חשוף לסערות (${pct(d.storm)} מהפרמיה בסערה רגילה)`, 'warn'] : ['☀️ לא חשוף לסערות'], d.checked ? ['🔍 נבדק', 'ok'] : ['❔ לא נבדק', 'warn']];
  const rows = [H.row('פרמיה שנתית', H.mS(d.size)), H.row('המחיר', `${H.mS(d.price)} — מקופת החברה (ההון)`, 'wrap'),
    H.row('יחס התביעות המשוער', `${pct(d.lr)} מהפרמיה`), H.row(`הטווח — ${d.checked ? 'אחרי בדיקה' : 'לפני בדיקה'}`, `פי ${ltr(`${x2(B.lo)}–${x2(B.hi)}`)} מיחס התביעות של השוק`, 'wrap'),
    `<div class="row acq-r"><span>האמת בתוך הטווח (פי 0.8 עד 1.25)</span>${rangeBar((B.lo - 0.8) / 0.45, (B.hi - 0.8) / 0.45, d.checked ? 'narrow' : '')}</div>`,
    H.row('רווח חיתום משוער בשנה', H.mSg(d.yearProfit), H.cls(d.yearProfit)),
    H.row('כושר הפירעון', `${pct(d.solvency)} ← אחרי: ${pct(after)}${after < 1 ? ' — מתחת ל־100%: המפקח ייכנס' : after < 1.2 ? ' — מתחת ליעד של 120%' : ''}`, after < 1.2 ? 'neg wrap' : 'wrap')];
  return head(H, chips) + H.grid(rows) + `<p class="note">פרמיה נכנסת לפני התביעות — לכן צמיחה מרגישה רווחית. התביעות של התיק מגיעות אחר כך${d.storm > 0 ? ', וסערה פוגעת בכל החוף ביחד' : ''}.${d.checked ? '' : ` בדיקה (${H.esc(H.mS(d.checkFee))}) מצמצמת את הטווח.`}</p>`;
}
function bellCard(H, ev) {
  const d = ev.data; const cheap = d.mult < d.sectorMult;
  const chips = [[d.div === 'plant' ? '🏭 מפעל' : '🏪 רשת חנויות'], [`מכפיל הענף ${nf(d.sectorMult)}`], d.listed ? ['🔔 החברה רשומה', 'ok'] : ['🏢 עוד לא רשומה', 'warn']];
  const rows = [H.row('רווח תפעולי (EBITDA) בחודש', H.mS(d.ebitda)), H.row('המחיר', H.mS(d.price)),
    H.row('המכפיל', `${x2(d.mult)} פעמים הרווח השנתי — ${cheap ? 'זול ממכפיל הענף' : 'יקר ממכפיל הענף'} (${nf(d.sectorMult)})`, cheap ? 'pos wrap' : 'neg wrap'),
    H.row('במזומן ובחוב', `חוב נטו אחרי: ×${x2(d.ndAfter)} הרווח השנתי${d.ndAfter > 4.5 ? ' — מעל ×4.5: הבנק לא יממן' : d.ndAfter > 3 ? ' — מעל היעד ×3' : ''}`, d.ndAfter > 3 ? 'neg wrap' : 'wrap'),
    H.row('במניות', d.listed ? `${nf(d.shares)} מניות חדשות — החלק שלך בחברה קטן` : 'רק לחברה רשומה', 'wrap'),
    H.row('האיכות האמיתית', `${pct((d.quality || {}).lo)}–${pct((d.quality || {}).hi)} מהרווח המוצהר`, 'wrap')];
  return head(H, chips) + H.grid(rows) + '<p class="note">מניות זולות לשלם בהן כשהמחיר שלך גבוה מהמתחרים; מזומן וחוב — כשהמניה זולה. כל רכישה מעלה את החוב או מקטינה את החלק שלך.</p>';
}
const PAT = { high: ['🐢 כסף סבלני — נוטה להישאר', 'ok'], mixed: ['❔ קשה לדעת כמה הוא סבלני', 'warn'], low: ['🔥 כסף חם — נוטה לברוח בחודש רע', 'warn'] };
function fundsCard(H, ev) {
  const d = ev.data;
  const rows = [H.row('הסכום', H.mS(d.amount)), H.row('הדמים שתגבה ממנו', `${pct(d.feeShare)} מדמי הניהול וההצלחה הרגילים`, 'wrap'),
    H.row('עם נעילה לשנה', `${pct(d.lockFee)} מהדמים — אבל הוא לא יכול למשוך 12 חודשים`, 'wrap'),
    H.row('הסבלנות', `${(PAT[d.patience] || PAT.mixed)[0].slice(2)} — הסבלנות האמיתית סודית`, 'wrap')];
  return head(H, [[`💼 ${d.type || ''}`], PAT[d.patience] || PAT.mixed]) + H.grid(rows) + '<p class="note">כסף חדש מגדיל את הקרן ואת דמי הניהול. אבל לקוח שבורח בחודש רע מכריח למכור מניות במחיר הנמוך של היום — גם על חשבון כל השאר.</p>';
}
export function cardHtml(H, ev) {
  const k = cardKind(ev);
  return k === 'credit' ? creditCard(H, ev) : k === 'trials' ? trialsCard(H, ev) : k === 'insure' ? insureCard(H, ev) : k === 'bell' ? bellCard(H, ev) : k === 'funds' ? fundsCard(H, ev) : '';
}

/* ============================================================ market-news blocks (ev.data.credit / trials / insure / bell / funds) */
const AREA_HE = { onc: 'אונקולוגיה', rare: 'מחלות נדירות', neuro: 'מוח ועצבים', cardio: 'לב', anti: 'אנטיביוטיקה', derm: 'עור', immu: 'חיסון', metab: 'מטבוליזם' };
const SECTOR17 = { bull: 'בועת ביוטק', normal: 'שוק רגיל', winter: 'חורף בביוטק' };
const SECTOR19 = { bull: 'שוק שורי', normal: 'שוק רגיל', bear: 'שוק דובי' };
const REG20 = { bull: 'שוק שורי', normal: 'שוק רגיל', bear: 'שוק דובי', crash: 'קריסה' };
const MK14 = { rate: 'הריבית זזה: הפיקדונות מתייקרים או מתוזלים מיד, וההלוואות בריבית קבועה לא זזות', slump: 'יזמי הנדל"ן מפסיקים לשלם פי 2 בחודשים הקרובים', rumor: 'האמון של המפקידים יורד לחודשיים', calm: 'האמון של המפקידים עולה לשלושה חודשים' };
const MK17 = { compete: 'התרופות שלך בתחום מוכרות 40% פחות', safety: 'הסיכוי של המולקולות בתחום יורד ב־8 נקודות', fast: 'הניסויים בתחום מתקצרים בחודשיים', generic: 'הפטנטים בתחום נגמרים שנה מוקדם יותר', pricing: 'מחירי כל התרופות יורדים ב־15%', bull: 'רישוי ומולקולות למכירה מתייקרים', winter: 'שותפים משלמים פחות על רישוי' };
const MK18 = { court: 'העתודות לתביעות הישנות עולות', spike: 'ביטוח משנה לסערות יקר פי 1.6 לשנה', rule: 'דרישת ההון עולה לשנתיים', crash: 'החלק המסוכן של כספי הפוליסות יורד', grow: 'הביקוש לענף אחד עולה ב־10%' };
const MK19 = { mood: 'מצב הרוח בשוק זז — וכך גם מחיר המניה', lockup: 'מי שקנה לפני ההנפקה יכול למכור: המניה יורדת', rotate: 'מכפיל הענף זז' };
const MK20 = { squeeze: 'המניה הכי מוכרת בחסר קופצת — שורטים נאלצים לקנות ביוקר', fraud: 'מניה אחת נופלת בחצי — מי שמכר אותה בחסר הרוויח', unwind: 'כל המניות הצפופות עולות 15%', ban: 'בזמן קריסה כל השורטים נסגרים בכוח', conference: 'חלק מהלקוחות שרצו למשוך — נשארים', analyst: 'הלקוחות פחות סבלניים' };
export function newsHtml(H, d) {
  if (!d) return '';
  if (d.credit && d.credit.mk) { const X = d.credit; return H.grid([H.row('מה זה עושה', MK14[X.mk] || '', 'wrap'), H.row('ריבית בנק ישראל עכשיו', `${X.rate}%`), H.row('אמון המפקידים', `${nf(X.conf)} מתוך 100 (מתחת ל־30: בריחה)`, X.conf < 42 ? 'neg wrap' : 'wrap'), H.row('יחס ההון', pct1(X.capRatio), X.capRatio < 0.1 ? 'neg' : '')]); }
  if (d.trials && d.trials.mk) { const X = d.trials; return H.grid([H.row('מה זה עושה', `${MK17[X.mk] || ''}${X.area ? ` (${AREA_HE[X.area] || ''})` : ''}`, 'wrap'), H.row('שוק הביוטק', SECTOR17[X.sector] || ''), H.row('רמת מחירי התרופות', pct(X.price))]); }
  if (d.insure && d.insure.mk) { const X = d.insure; return H.grid([H.row('מה זה עושה', `${MK18[X.mk] || ''}${X.line ? ` (${LINE_HE[X.line] || ''})` : ''}`, 'wrap'), H.row('כושר הפירעון עכשיו', pct(X.solvency), X.solvency < 1.2 ? 'neg' : ''), H.row('ביטוח משנה', X.hard ? 'יקר עכשיו (שוק קשה)' : 'במחיר רגיל', X.hard ? 'neg' : '')]); }
  if (d.bell && d.bell.mk) { const X = d.bell; return H.grid([H.row('מה זה עושה', MK19[X.mk] || '', 'wrap'), H.row('הענף', SECTOR19[X.sector] || ''), H.row('המניה', X.listed ? `₪${x2(X.price)}` : 'עוד לא רשומה — אין מחיר', 'wrap')]); }
  if (d.funds && d.funds.mk) { const X = d.funds; return H.grid([H.row('מה זה עושה', MK20[X.mk] || '', 'wrap'), H.row('השוק', REG20[X.regime] || ''), X.co ? H.row('החברה', X.co) : '', X.hit != null ? H.row('מה זה עשה לקרן', sgnPct1(X.hit), H.cls(X.hit)) : '']); }
  return '';
}

/* ============================================================ w14 panel "הבנק" */
/** a signed number on a button: an explicit LTR isolate (LRI … PDI), so "−1" never reads "1−" inside the RTL label */
const ltr = (t) => `\u2066${t}\u2069`;
const PRICE_L = (v) => (v === 0 ? 'שוק' : ltr(`${v > 0 ? '+' : '−'}${Math.abs(v)}`));
function crPanel(H, P, X, btn) {
  const A = idx(P); const L = (X && X.last) || {};
  const line = X ? `<p class="wp-now">🏦 ההון שלך ${H.num(H.mS(X.equity))}${X.stake < 1 ? ` (${H.num(pct(X.stake))} מהבנק)` : ''} · ספר הלוואות ${H.num(H.mS(X.loans))} · פיקדונות ${H.num(H.mS(X.retail))}${X.wholesale ? ` · כסף סיטונאי ${H.num(H.mS(X.wholesale))}` : ''} · נזילות ${H.num(H.mS(X.liquid))}${X.cbWindow ? ` · <b class="neg">חלון הבנק המרכזי ${H.num(H.mS(X.cbWindow))}</b>` : ''} · ריבית ${H.num(`${X.rate}%`)} (פיקדונות ${H.num(`${X.retailRate}%`)}, סיטונאי ${H.num(`${X.wholesaleRate}%`)})
    · החודש: ריבית נטו ${H.num(H.mSg(L.nii))}, הוצאות ${H.num(H.mS(L.opex))}, הפרשות ${H.num(H.mS(L.el))}, הפסדי אשראי ${H.num(H.mS(L.loss))}, רווח ${H.num(H.mSg(L.profit), H.cls(L.profit))} · רווח 12 חודשים ${H.num(H.mSg(X.profit12), H.cls(X.profit12))}${X.crunch ? ' · <b class="neg">⚠️ משבר אשראי במשק</b>' : ''}${X.slump ? ' · <b class="neg">משבר בנדל"ן</b>' : ''}${X.runs ? ` · <b class="neg">${H.num(String(X.runs))} בריחות מפקידים</b>` : ''}${X.regs ? ` · <b class="neg">המפקח נכנס ${H.num(String(X.regs))} פעמים</b>` : ''}</p>` : '';
  const g = (P.gauges || []).map((x) => {
    if (x.id === 'capRatio') return gauge(H, 'capRatio', x.label, H.num(pct1(x.value)), x.value / (x.max || 0.2), (x.ref || 0.1) / (x.max || 0.2), `היעד: לפחות ${H.esc(pct1(x.ref))} · מתחת ל־8% המפקח נכנס, מתחת ל־5% הבנק נלקח${x.value < 0.1 ? ' · נמוך' : ''}`, x.value < 0.1);
    if (x.id === 'conf') return gauge(H, 'conf', x.label, H.num(`${nf(x.value)} מתוך 100`), x.value / 100, (x.ref || 30) / 100, `מתחת ל־${nf(x.ref)}: המפקידים עומדים בתור${x.value < (x.ref || 30) + 12 ? ' · ⚠️ קרוב' : ''}`, x.value < (x.ref || 30) + 12);
    if (x.id === 'equity') return gauge(H, 'equity', x.label, H.num(H.mS(x.value)), x.ref ? x.value / x.ref : 0, null, `היעד: ${H.esc(H.mS(x.ref))}`, x.value < x.ref);
    return gauge(H, x.id, 'ריבית בנק ישראל', H.num(`${x.value}%`), x.value / 9, (x.ref || 4) / 9, `ממוצע לאורך זמן: ${H.esc(String(x.ref))}%`);
  }).join('');
  const rows = P.rows || [];
  const table = `<div class="tblwrap"><table class="hvtbl crtbl"><caption class="sr">ספר ההלוואות לפי סוג לווה: גודל, חלק בריבית קבועה, התשואה, המחיר מול השוק, שיעור הכשל השנתי (טווח), הלוואות חדשות החודש והפסד האשראי החודש.</caption>
    <thead><tr><th scope="col">סוג לווה</th><th scope="col">ספר</th><th scope="col">קבועה</th><th scope="col">תשואה</th><th scope="col">מחיר מול השוק</th><th scope="col">כשל בשנה</th><th scope="col">חדשות החודש</th><th scope="col">הפסד החודש</th></tr></thead><tbody>${rows.map((r) => `<tr data-seg="${H.esc(r.seg)}"><th scope="row">${H.esc(r.name)}${r.stop ? ' <small>(לא נותנים חדשות)</small>' : ''}</th><td>${H.num(H.mS(r.book))}</td><td>${H.num(pct(r.fixShare))}</td><td>${H.num(`${r.yieldPct}%`)}</td><td>${H.num(r.delta ? pp(r.delta) : 'שוק')}</td><td>${H.num(r.pd.lo === r.pd.hi ? pct1(r.pd.lo) : `${pct1(r.pd.lo)}–${pct1(r.pd.hi)}`)}</td><td>${H.num(H.mS(r.newVol))}${r.newPdMult > 1.05 ? ` <small>(כשל ×${H.esc(x2(r.newPdMult))})</small>` : ''}</td><td>${H.num(H.mS(r.lastLoss))}</td></tr>`).join('')}</tbody></table></div>`;
  const segRows = rows.map((r) => { const mine = A.filter(([a]) => a.seg === r.seg || (a.param === r.seg && (a.id === 'tighten' || a.id === 'sellBook')));
    const prices = mine.filter(([a]) => a.id === 'price').map(([a, i]) => [a, i, PRICE_L(a.delta), a.delta === 0 ? 'מחיר שוק' : a.delta > 0 ? 'פחות לווים, מסוכנים יותר' : 'יותר לווים, מרווח דק']);
    const other = mine.filter(([a]) => a.id !== 'price').map(([a, i]) => [a, i, a.id === 'tighten' ? (r.stop ? 'לחזור לתת אשראי' : 'להפסיק אשראי חדש') : 'למכור רבע מהספר', a.id === 'sellBook' ? `${H.mS(Math.round(r.book / 4))} · ב־85%–95%` : '']);
    return `<li class="wp-row crow" data-seg="${H.esc(r.seg)}" data-light="${r.stop ? 'off' : r.delta > 0.5 ? 'amber' : 'green'}"><div class="wp-rh"><b>${H.esc(r.name)}</b><small>${H.num(H.mS(r.book))} · ${H.num(r.delta ? pp(r.delta) : 'מחיר שוק')} מול השוק${r.stop ? ' · לא נותנים הלוואות חדשות' : ''}</small></div>
      ${grp(H, `${r.name}: מחיר מול השוק (נק׳)`, prices, btn)}${acts(other, btn)}</li>`; }).join('');
  const liq = A.filter(([a]) => a.id === 'liq').map(([a, i]) => [a, i, short(a).replace('נזילות ', ''), 'מהפיקדונות']);
  const bank = A.filter(([a]) => a.id === 'raise' || a.id === 'dividend').map(([a, i]) => [a, i, a.id === 'raise' ? 'גיוס הון (דילול)' : 'דיבידנד', a.id === 'raise' ? (/: (₪[^ ]+(?: [א-ת]+)?)/.exec(a.label) || [])[1] || '' : (/\((.*)\)/.exec(a.label) || [])[1] || '']);
  return `${line}<div class="wp-gauges cr-g">${g}</div>${sec('ספר ההלוואות', table, 'מחיר מעל השוק מבריח את הלווים הטובים — מי שנשאר מסוכן יותר (ברירה שלילית). מחיר מתחת לשוק מגדיל את הספר על מרווח דק.')}
    ${sec('המחיר לכל סוג לווה', `<ul class="wp-rows crs">${segRows}</ul>`, 'מכירה של רבע מהספר מבקשת לחיצה שנייה: היא מורידה סיכון — ומוכרת בהפסד.')}
    ${sec('נזילות, הון ודיבידנד', `${grp(H, 'נזילות: כמה מהפיקדונות במזומן', liq, btn)}${acts(bank, btn)}`, '💡 = מה שהמנטור היה בוחר עכשיו. נזילות גבוהה מרגיעה את המפקידים ומרוויחה פחות. גיוס הון מבקש לחיצה שנייה: הוא מקטין את החלק שלך.')}`;
}

/* ============================================================ w17 panel "המעבדה" */
const ST17 = { dec: ['⏸ מחכה להחלטה', 'warn'], run: ['🧪 בניסוי', ''], drug: ['💊 תרופה בשוק', 'ok'], lab: ['🔬 מחקר', ''], dead: ['✖ נכשלה', 'warn'] };
function trPanel(H, P, X, btn, D) {
  const A = idx(P); const month = (D && D.month) || 0;
  const line = X ? `<p class="wp-now">🧪 שווי המעבדה ${H.num(H.mS(X.value))} · ${H.esc(X.sectorLabel)} · רמת המחירים ${H.num(pct(X.price))} · רווח המעבדה החודש ${H.num(H.mSg(X.inc), H.cls(X.inc))}${X.plant ? ' · 🏭 מפעל ייצור' : ''} · אושרו ${H.num(String(X.approved))} · נכשלו ${H.num(String(X.fails))} · נעצרו ${H.num(String(X.stops))} · ברישוי ${H.num(String(X.lics))}${X.lost ? ` · הוצא על מולקולות שנכשלו ${H.num(H.mS(X.lost))}` : ''}${X.cliffs ? ` · <b class="neg">${H.num(String(X.cliffs))} פטנטים פגו</b>` : ''}</p>` : '';
  const g = (P.gauges || []).map((x) => (x.id === 'earning' ? gauge(H, 'earning', x.label, H.num(`${nf(x.value)} מתוך ${nf(x.ref)}`), x.value / Math.max(1, x.ref), null, 'תרופה מאושרת שמכניסה כסף כל חודש', x.value < x.ref)
    : x.id === 'inc' ? gauge(H, 'inc', x.label, H.num(H.mSg(x.value), H.cls(x.value)), x.value > 0 ? 1 : 0, null, x.value < 0 ? 'החודש רק הוצאות: תקורה, מפעל וניסויים' : 'רווח מתרופות פחות תקורה', x.value < 0)
      : gauge(H, x.id, x.label, H.num(H.mS(x.value)), x.ref ? x.value / x.ref : 0, null, `היעד: ${H.esc(H.mS(x.ref))}`, x.value < x.ref))).join('');
  const rows = (P.rows || []).map((r) => {
    if (r.empty) return `<li class="wp-row trow empty" data-slot="${r.slot}" data-light="off"><div class="wp-rh"><b>תא ${r.slot + 1}</b><em class="b">פנוי — מחקר או מולקולה למכירה</em></div></li>`;
    if (r.state === 'lab') return `<li class="wp-row trow" data-slot="${r.slot}" data-state="lab" data-light="amber"><div class="wp-rh"><b>תא ${r.slot + 1} · מחקר</b><em class="b">🔬 מולקולה חדשה בחודש ${H.num(String(r.readyM))}</em></div><div class="wp-rm"><span>הוצא ${H.num(H.mS(r.spent))}</span></div></li>`;
    const [stT, stC] = ST17[r.state] || ST17.dec; const S = r.shift || {};
    const left = r.state === 'drug' ? '' : (r.odds || []).map((o, k) => (k >= r.stage ? `${STAGE_HE17[k]} ${pct(o)}` : null)).filter(Boolean).join(' · ');
    const mine = A.filter(([a]) => String(a.param) === String(r.slot));
    const LB = { go: 'להמשיך', license: 'להעביר לשותף', partner: 'שותף לחצי', stop: 'לעצור', royalty: 'למכור 30% מהרווח' };
    const items = mine.map(([a, i]) => [a, i, LB[a.id] || a.label, a.id === 'go' ? `${H.mS(a.cost)} · ${a.months} חודשים${a.ev != null ? ` · ערך ההמשך ${H.mSg(a.ev)}` : ''}` : a.id === 'license' ? ((/\((.*)\)/.exec(a.label) || [])[1] || '') + (a.ev != null ? ` · שווה ${H.mS(a.ev)}` : '') : a.id === 'stop' ? ((/\((.*)\)/.exec(a.label) || [])[1] || 'מה שהוצא לא חוזר') : a.id === 'royalty' ? ((/\((.*)\)/.exec(a.label) || [])[1] || '') : 'חצי מהעלויות וחצי מהרווח']);
    const cliffIn = r.cliffM ? r.cliffM - month : null;
    return `<li class="wp-row trow" data-slot="${r.slot}" data-state="${H.esc(r.state)}" data-light="${r.state === 'drug' ? 'green' : r.state === 'dec' ? 'amber' : r.stalled ? 'red' : 'green'}"><div class="wp-rh"><span class="dk" aria-hidden="true">${r.state === 'drug' ? '💊' : '🧪'}</span><div class="pr-n"><b>תא ${r.slot + 1} · ${H.esc(r.name)}</b><small>${H.esc(r.areaName)} · ${H.esc(r.state === 'drug' ? 'בשוק' : r.stageName)}</small></div><em class="b${stC ? ' ' + stC : ''}">${H.esc(stT)}</em>${r.lic ? `<em class="b">🤝 ברישוי · תמלוג ${H.esc(pct(r.lic))}</em>` : ''}${r.co ? '<em class="b">🤝 שותף לחצי</em>' : ''}${r.stalled ? `<em class="b warn">⛔ עמד ${H.esc(String(r.stalled))} חודשים בלי מזומן</em>` : ''}</div>
      <div class="wp-rm">${left ? `<span>סיכויים ${H.num(left)}</span>` : ''}${r.state !== 'drug' ? `<span>איכות סודית ${H.num(S.lo === S.hi ? pp(S.lo * 100) : `${pp(S.lo * 100)} עד ${pp(S.hi * 100)}`)}</span><span>סיכוי למדף ${H.num(pct(r.pLaunch))}</span>` : ''}
        <span>כבר הוצא ${H.num(H.mS(r.spent))} <small>— לא חוזר, ולא משנה את ההחלטה</small></span>${r.costLeft != null ? `<span>עד סוף השלב ${H.num(H.mS(r.costLeft))} · ${H.num(pct(r.done))}</span>` : ''}
        ${r.state === 'drug' ? `<span>רווח החודש ${H.num(H.mSg(r.monthly), H.cls(r.monthly))}</span><span>שווי ${H.num(H.mS(r.value))}</span>${cliffIn != null ? `<span class="${cliffIn <= 12 ? 'neg' : ''}">${cliffIn > 0 ? `הפטנט פג בעוד ${H.num(`${cliffIn} חודשים`)}` : 'הפטנט פג — מכירות ×0.2'}</span>` : ''}${r.roySold ? `<span>נמכרו ${H.num(pct(r.roySold))} מהרווח</span>` : ''}` : ''}</div>
      ${acts(items, btn)}</li>`; }).join('');
  const lab = A.filter(([a]) => a.id === 'plant' || a.id === 'discover').map(([a, i]) => [a, i, a.id === 'plant' ? (X && X.plant ? 'למכור את המפעל' : 'מפעל ייצור') : 'מחקר: מולקולה חדשה', (/\((.*)\)/.exec(a.label) || [])[1] || '']);
  return `${line}<div class="wp-gauges tr-g">${g}</div>${sec('המולקולות (8 תאים)', `<ul class="wp-rows trs">${rows}</ul>`, 'ערך ההמשך = כמה שווה לשלם על השלב הבא, לפי הסיכויים ולפי מה שעוד צריך לשלם — מה שכבר הוצא לא נכנס לחשבון. עצירה, רישוי, שותף ומכירת תמלוגים מבקשים לחיצה שנייה.')}
    ${sec('המעבדה', acts(lab, btn), '💡 = מה שהמנטור היה בוחר עכשיו. כל פעולה נכנסת לחודש הזה מיד.')}`;
}

/* ============================================================ w18 panel "חברת הביטוח" */
const RISK18 = { low: 'סולידי', mid: 'מאוזן', high: 'מסוכן' };
function insPanel(H, P, X, btn) {
  const A = idx(P); const L = (X && X.last) || {};
  const line = X ? `<p class="wp-now">☂️ ההון שלך ${H.num(H.mS(X.equity))}${X.stake < 1 ? ` (${H.num(pct(X.stake))} מהחברה)` : ''} · פרמיות בשנה ${H.num(H.mS(X.gwp))} · כספי הפוליסות ${H.num(H.mS(X.float))} (מסוכן ${H.num(H.mS(X.risky))}) · עתודות לתביעות ${H.num(H.mS(X.reserves))} · הון נדרש ${H.num(H.mS(X.required))}
    · החודש: פרמיות ${H.num(H.mS(L.np))}, תביעות ששולמו ${H.num(H.mS(L.paid))}, עתודות חדשות ${H.num(H.mS(L.booked))}, תיקון עתודות ישנות ${H.num(H.mSg(-(L.dev || 0)), H.cls(-(L.dev || 0)))}${L.cat ? `, <b class="neg">סערה ${H.num(H.mS(L.cat))}</b>` : ''}, הוצאות ${H.num(H.mS(L.exp))}${L.reins ? `, ביטוח משנה ${H.num(H.mS(L.reins))}` : ''}, תשואה ${H.num(H.mSg(L.ret), H.cls(L.ret))}, רווח ${H.num(H.mSg(L.profit), H.cls(L.profit))}
    ${X.stormSeason ? ' · <b class="neg">🌀 עונת הסערות (אוגוסט–אוקטובר)</b>' : ''}${X.hard ? ' · ביטוח משנה יקר עכשיו' : ''}${X.cats ? ` · ${H.num(String(X.cats))} סערות (${H.num(H.mS(X.catLoss))})` : ''}${X.ban ? ' · <b class="neg">המפקח: בלי דיבידנד ובלי צמיחה</b>' : ''}${X.forced ? ` · ${H.num(String(X.forced))} מכירות כפויות` : ''}</p>` : '';
  const g = (P.gauges || []).map((x) => (x.id === 'solvency' ? gauge(H, 'solvency', x.label, H.num(pct(x.value)), x.value / (x.max || 3), (x.ref || 1.2) / (x.max || 3), `היעד: לפחות ${H.esc(pct(x.ref))} · מתחת ל־100% המפקח נכנס, מתחת ל־80% מכריח ביטוח משנה${x.value < x.ref ? ' · נמוך' : ''}`, x.value < x.ref)
    : x.id === 'combined' ? gauge(H, 'combined', x.label, H.num(pct(x.value)), (x.value - (x.min || 0.6)) / ((x.max || 1.4) - (x.min || 0.6)), ((x.ref || 1) - (x.min || 0.6)) / ((x.max || 1.4) - (x.min || 0.6)), `היעד: עד ${H.esc(pct(x.ref))} — תביעות והוצאות מול הפרמיות${x.value > x.ref ? ' · הביטוח עצמו מפסיד' : ''}`, x.value > x.ref)
      : gauge(H, x.id, x.label, H.num(H.mS(x.value)), x.ref ? x.value / x.ref : 0, null, `היעד: ${H.esc(H.mS(x.ref))}`, x.value < x.ref))).join('');
  const rows = P.rows || [];
  const table = `<div class="tblwrap"><table class="hvtbl instbl"><caption class="sr">הענפים: פרמיה שנתית, המחיר מול השוק, יחס התביעות הידוע מול השוק, זנב ארוך, חשיפה לסערה, תביעות החודש והמחיר שהמנטור היה בוחר.</caption>
    <thead><tr><th scope="col">ענף</th><th scope="col">פרמיה בשנה</th><th scope="col">מחיר מול השוק</th><th scope="col">יחס תביעות</th><th scope="col">זנב ארוך</th><th scope="col">סערה</th><th scope="col">תביעות החודש</th></tr></thead><tbody>${rows.map((r) => `<tr data-line="${H.esc(r.line)}"><th scope="row">${H.esc(LINE_EMOJI[r.line] || '')} ${H.esc(r.name)}${r.stop ? ' <small>(בסגירה)</small>' : ''}</th><td>${H.num(H.mS(r.prem))}</td><td>${H.num(`${r.rel > 0 ? '+' : r.rel < 0 ? '−' : ''}${pct(Math.abs(r.rel))}`)}${r.next !== r.rel ? ` <small>(מהחודש הבא ${H.esc(`${r.next > 0 ? '+' : ''}${pct(r.next)}`)})</small>` : ''}</td><td>${H.num(pct(r.lr))} <small>(שוק ${H.esc(pct(r.lrMarket))})</small></td><td>${H.num(pct(r.tail))}</td><td>${H.num(r.storm ? pct(r.storm) : '—')}</td><td>${H.num(H.mS(r.claims))}</td></tr>`).join('')}</tbody></table></div>`;
  const lineRows = rows.map((r) => { const mine = A.filter(([a]) => a.line === r.line || (a.id === 'runoff' && a.param === r.line));
    const prices = mine.filter(([a]) => a.id === 'price').map(([a, i]) => [a, i, a.rel ? ltr(`${a.rel > 0 ? '+' : '−'}${pct(Math.abs(a.rel))}`) : 'שוק', a.rel < 0 ? 'יותר לקוחות, תביעות גבוהות' : a.rel > 0 ? 'פחות לקוחות, טובים יותר' : 'מחיר שוק']);
    const run = mine.filter(([a]) => a.id === 'runoff').map(([a, i]) => [a, i, r.stop ? 'לחזור למכור' : 'להפסיק לחדש', r.stop ? '' : 'התיק נסגר בהדרגה']);
    return `<li class="wp-row irow" data-line="${H.esc(r.line)}" data-light="${r.stop ? 'off' : r.rel < 0 ? 'amber' : 'green'}"><div class="wp-rh"><span class="dk" aria-hidden="true">${H.esc(LINE_EMOJI[r.line] || '☂️')}</span><div class="pr-n"><b>${H.esc(r.name)}</b><small>מחיר עכשיו ${H.num(`${r.rel > 0 ? '+' : r.rel < 0 ? '−' : ''}${pct(Math.abs(r.rel))}`)} מול השוק · יחס תביעות ${H.num(pct(r.lr))}</small></div>${r.rel < 0 ? '<em class="b warn">מתחת לשוק: תביעות גבוהות יותר</em>' : ''}${r.storm >= 0.3 ? '<em class="b warn">🌀 חשוף לסערות</em>' : ''}</div>
      ${grp(H, `${r.name}: מחיר מול השוק`, prices, btn)}${acts(run, btn)}</li>`; }).join('');
  const xol = A.filter(([a]) => a.id === 'xol').map(([a, i]) => [a, i, a.layers ? `${a.layers} שכבות` : 'בלי', a.layers ? `${H.mS(a.cost)} בשנה` : 'כל סערה עלייך']);
  const reins = A.filter(([a]) => a.id === 'qs' || a.id === 'catbond').map(([a, i]) => [a, i, a.id === 'qs' ? short(a) : 'אג"ח קטסטרופה', a.id === 'catbond' ? `3 שנים · ${(/, (₪[^)]*)\)/.exec(a.label) || [])[1] || ''}` : '30% מהפרמיות ומהתביעות']);
  const risk = A.filter(([a]) => a.id === 'risk').map(([a, i]) => [a, i, RISK18[a.param] || a.param, (/: (\d+%)/.exec(a.label) || [])[1] ? `${(/: (\d+%)/.exec(a.label) || [])[1]} מסוכן` : '']);
  const cap = A.filter(([a]) => a.id === 'raise' || a.id === 'dividend').map(([a, i]) => [a, i, a.id === 'raise' ? 'גיוס הון' : 'דיבידנד', (/\((.*)\)/.exec(a.label) || [])[1] || '']);
  return `${line}<div class="wp-gauges ins-g">${g}</div>${sec('הענפים', table, 'פרמיה נכנסת לפני התביעות. מחיר מתחת לשוק מביא לקוחות שמגישים יותר תביעות — והעתודות עליהם עלולות להיות חסרות.')}
    ${sec('המחיר לכל ענף', `<ul class="wp-rows ins">${lineRows}</ul>`)}
    ${sec('ביטוח משנה והשקעות', `${grp(H, 'ביטוח משנה לסערות: שכבות', xol, btn)}${acts(reins, btn)}${grp(H, 'כספי הפוליסות: כמה בהשקעות מסוכנות', risk, btn)}`, 'סערה פוגעת בכל החוף ביחד — ובאותו חודש גם החלק המסוכן של ההשקעות יורד. ביטוח משנה קונים לפני עונת הסערות, כשהוא זול. אג"ח קטסטרופה מבקש לחיצה שנייה.')}
    ${sec('הון', acts(cap, btn), '💡 = מה שהמנטור היה בוחר עכשיו. גיוס הון מבקש לחיצה שנייה.')}`;
}

/* ============================================================ w19 panel "החברה בבורסה" */
const GUIDE_HE = { low: 'זהירה', mid: 'מציאותית', high: 'שאפתנית' };
function blPanel(H, P, X, btn, D) {
  const A = idx(P); const month = (D && D.month) || 0;
  const line = X ? `<p class="wp-now">🔔 ${X.listed ? `רשומה · מניה ${H.num(`₪${x2(X.price)}`)} מול ${H.num(`₪${x2(X.peer)}`)} אצל המתחרים` : 'עוד לא רשומה בבורסה — אין מחיר שוק'} · החלק שלך ${H.num(pct(X.mine / Math.max(1, X.shares)))} (${H.num(nf(X.mine))} מתוך ${H.num(nf(X.shares))} מניות) · רווח תפעולי ${H.num(H.mS(X.ebitdaM))} בחודש (${H.num(H.mS(X.ttm))} ב־12 חודשים) · חוב ${H.num(H.mS(X.debt))} · מזומן בחברה ${H.num(H.mS(X.cash))}
    · ${H.esc(X.sectorLabel)} (מכפיל ${H.num(String(X.mult))}) · אמינות ההנהלה ${H.num(x2(X.cred))} · מצב הרוח ${H.num(sgnPct1(X.mood))}${X.beats || X.misses ? ` · עמדת בהדרכה ${H.num(String(X.beats))} · פספסת ${H.num(String(X.misses))}` : ''}${X.activists ? ` · <b class="neg">${H.num(String(X.activists))} אקטיביסטים</b>` : ''}</p>` : '';
  const g = (P.gauges || []).map((x) => (x.id === 'stake' ? gauge(H, 'stake', x.label, X && !X.listed ? 'אין מחיר — עוד לא הנפקת' : H.num(H.mS(x.value)), x.ref ? x.value / x.ref : 0, null, `היעד: ${H.esc(H.mS(x.ref))} במחיר הבורסה`, x.value < x.ref)
    : x.id === 'nde' ? gauge(H, 'nde', x.label, H.num(x.value >= 99 ? 'אין רווח תפעולי' : `×${x2(x.value)}`), x.value / (x.max || 6), (x.ref || 3) / (x.max || 6), `היעד: עד ×${H.esc(String(x.ref))} · מעל ×4 אין קנייה עצמית, מעל ×4.5 אין רכישות בחוב${x.value > x.ref ? ' · גבוה' : ''}`, x.value > x.ref)
      : gauge(H, 'cred', x.label, H.num(x2(x.value)), (x.value - (x.min || 0.6)) / ((x.max || 1.2) - (x.min || 0.6)), ((x.ref || 1) - (x.min || 0.6)) / ((x.max || 1.2) - (x.min || 0.6)), 'עולה כשעומדים בהדרכה, יורד חזק כשמפספסים — והמחיר זז איתה', x.value < (x.ref || 1)))).join('');
  const q = X && X.listed && X.guide ? `<p class="wp-now">📣 הדרכה ${H.esc(GUIDE_HE[X.guide] || '')} לרבעון: ${H.num(H.mS(X.guideQ))} · עד עכשיו ${H.num(H.mS(X.quarterSoFar))} · הרבעון נסגר בחודש ${H.num(String(X.quarterEnd))}${X.quarterEnd ? ` (עוד ${H.num(`${Math.max(0, X.quarterEnd - month)} חודשים`)})` : ''}</p>` : '';
  const divRows = (P.rows || []).map((r) => { const mine = A.filter(([a]) => a.div === r.div || ((a.id === 'grow' || a.id === 'sell') && a.param === r.div));
    const items = mine.map(([a, i]) => [a, i, a.id === 'grow' ? 'השקעה בצמיחה' : 'למכור את החטיבה', a.id === 'grow' ? `${H.mS(a.cost)} · +8% בעוד 6 חודשים` : (/\((.*)\)/.exec(a.label) || [])[1] || '']);
    return `<li class="wp-row brow" data-div="${H.esc(r.div)}" data-light="${r.growing && r.growing.length ? 'amber' : 'green'}"><div class="wp-rh"><span class="dk" aria-hidden="true">${r.div === 'plant' ? '🏭' : '🏪'}</span><div class="pr-n"><b>${H.esc(r.name || DIVB_HE[r.div] || '')}</b><small>רווח תפעולי ${H.num(H.mS(r.ebitda))} בחודש · החודש ${H.num(H.mS(r.last))}</small></div>${(r.growing || []).length ? `<em class="b">🏗️ צמיחה נכנסת בחודש ${H.esc(r.growing.join(', '))}</em>` : ''}</div>${acts(items, btn)}</li>`; }).join('');
  const ipo = A.filter(([a]) => a.id === 'ipo').map(([a, i]) => [a, i, `${pct(a.float)} לציבור`, (/\((.*)\)/.exec(a.label) || [])[1] || '']);
  const guide = A.filter(([a]) => a.id === 'guide').map(([a, i]) => [a, i, GUIDE_HE[a.param] || a.param, (/\((.*)\)/.exec(a.label) || [])[1] || '']);
  const cap = A.filter(([a]) => ['buyback', 'dividend', 'secondary', 'repay'].includes(a.id)).map(([a, i]) => [a, i, { buyback: 'קנייה עצמית 2%', dividend: 'דיבידנד', secondary: 'הנפקה משנית 5%', repay: 'להחזיר חוב' }[a.id], (/\((.*)\)/.exec(a.label) || [])[1] || '']);
  return `${line}${q}<div class="wp-gauges bl-g">${g}</div>${sec('החטיבות', `<ul class="wp-rows bls">${divRows}</ul>`, 'השקעה בצמיחה עולה 5 חודשי רווח ומוסיפה 8% אחרי חצי שנה. מכירת חטיבה מבקשת לחיצה שנייה.')}
    ${ipo.length ? sec('ההנפקה', grp(H, 'הנפקה: כמה מהחברה לציבור', ipo, btn), 'בלי הנפקה אין מחיר שוק — והיעד נמדד בבורסה. הנפקה מבקשת לחיצה שנייה: אי אפשר לבטל אותה.') : ''}
    ${guide.length ? sec('ההדרכה לרבעון', grp(H, 'הדרכה: מה מבטיחים לשוק', guide, btn), 'הדרכה זהירה מתומחרת מיד; שאפתנית בדרך כלל מפספסת. מי שמבטיח יותר ממה שהוא יודע — משלם כשהרבעון מגיע.') : ''}
    ${sec('כסף לבעלי המניות', acts(cap, btn), '💡 = מה שהמנטור היה בוחר עכשיו. קנייה עצמית בשוק שורי קונה ביוקר; הנפקה משנית בשוק כזה מוכרת ביוקר (לחיצה שנייה).')}`;
}

/* ============================================================ w20 panel "הקרן" */
function fdPanel(H, P, X, btn) {
  const A = idx(P); const L = (X && X.last) || {};
  const line = X ? `<p class="wp-now">📈 בניהול ${H.num(H.mS(X.aum))} (הקרן ${H.num(H.mS(X.fund))}${X.indexProduct ? `, קרן המדד ${H.num(H.mS(X.indexProduct))}` : ''}) · של הלקוחות ${H.num(H.mS(X.clients))} · שלך ${H.num(H.mS(X.mine))} · ${H.esc(X.regimeLabel)}
    · תשואה 12 חודשים ${H.num(sgnPct1(X.ret12))} · מול המדד ${H.num(sgnPct1(X.rel12))} · לונג ${H.num(pct(X.long))} · שורט ${H.num(pct(X.short))} · החודש: הקרן ${H.num(sgnPct1(L.R))}, המדד ${H.num(sgnPct1(L.idx))}, דמי ניהול ${H.num(H.mS(X.feeMonth))}${X.perfMonth ? `, דמי הצלחה ${H.num(H.mS(X.perfMonth))}` : ''}
    ${X.pending ? ` · <b class="neg">בקשות פדיון ${H.num(H.mS(X.pending))} — משולמות ביום המשכורת הבא</b>` : ''}${X.gate ? ` · <b class="neg">🚧 פדיונות נעולים עד חודש ${H.num(String(X.gateUntil))}</b>` : ''}${X.shortBan ? ' · <b class="neg">איסור שורט</b>' : ''}${X.squeezeHits ? ` · ${H.num(String(X.squeezeHits))} סחיטות שורט פגעו בך` : ''}${X.gates ? ` · ${H.num(String(X.gates))} נעילות (בלי ★★★)` : ''}</p>` : '';
  const g = (P.gauges || []).map((x) => (x.id === 'rel' ? gauge(H, 'rel', x.label, H.num(sgnPct1(x.value), H.cls(x.value)), (x.value - (x.min || -0.3)) / ((x.max || 0.3) - (x.min || -0.3)), 0.5, 'מעל המדד: לקוחות נכנסים ודמי הצלחה. מתחת: לקוחות יוצאים', x.value < 0)
    : x.id === 'gross' ? gauge(H, 'gross', x.label, H.num(pct(x.value)), x.value / (x.max || 1.5), (x.ref || 1) / (x.max || 1.5), 'לונג ועוד שורט, כאחוז מהקרן — ככל שגבוה, מכירה בכפייה עולה יותר', x.value > 1.2)
      : gauge(H, x.id, x.label, H.num(H.mS(x.value)), x.ref ? x.value / x.ref : 0, null, `היעד: ${H.esc(H.mS(x.ref))}`, x.value < x.ref))).join('');
  const rows = P.rows || []; const info = (k) => (A.find(([a]) => a.co === k) || [{}])[0];
  const table = `<div class="tblwrap"><table class="hvtbl fdtbl"><caption class="sr">התיק: לכל חברה המשקל בקרן (לונג או שורט), הבטא, הצפיפות של השורטים, טווח אות המחקר לחודש, התשואה בחודש שעבר ועמלת ההשאלה לשורט.</caption>
    <thead><tr><th scope="col">חברה</th><th scope="col">משקל</th><th scope="col">בטא</th><th scope="col">צפיפות שורט</th><th scope="col">אות מחקר בחודש</th><th scope="col">חודש שעבר</th><th scope="col">השאלה בשנה</th></tr></thead><tbody>${rows.map((r) => { const I = info(r.co) || {}; return `<tr data-co="${H.esc(r.co)}"><th scope="row">${H.esc(r.name)}</th><td>${H.num(r.w > 0.001 ? `לונג ${pct(r.w)}` : r.w < -0.001 ? `שורט ${pct(-r.w)}` : '—')}</td><td>${H.num(x2(r.beta))}</td><td>${H.num(pct(r.crowd))}</td><td>${H.num(`${sgnPct1(r.signal.lo)} עד ${sgnPct1(r.signal.hi)}`)}</td><td>${H.num(sgnPct1(r.last))}</td><td>${H.num(I.borrowFee != null ? pct1(I.borrowFee) : '—')}</td></tr>`; }).join('')}</tbody></table></div>`;
  const coRows = rows.map((r) => { const mine = A.filter(([a]) => a.co === r.co);
    const items = mine.map(([a, i]) => [a, i, a.id === 'buy' ? (r.w < 0 ? 'לכסות 5%' : 'לקנות 5%') : a.id === 'sell' ? (r.w > 0 ? 'למכור 5%' : 'שורט 5%') : 'לסגור', a.id === 'sell' && r.w <= 0 ? 'בלי תקרת הפסד' : a.id === 'close' ? (r.w > 0 ? 'מכירה של הכל' : 'קנייה בחזרה') : '']);
    const t = mine.length ? mine[0][0].target : null;
    return `<li class="wp-row frow2" data-co="${H.esc(r.co)}" data-light="${r.w > 0.001 ? 'green' : r.w < -0.001 ? 'red' : 'off'}"><div class="wp-rh"><b>${H.esc(r.name)}</b><small>${H.num(r.w > 0.001 ? `לונג ${pct(r.w)}` : r.w < -0.001 ? `שורט ${pct(-r.w)}` : 'אין פוזיציה')}${t != null && Math.abs(t - r.w) > 0.001 ? ` · המנטור: ${H.num(t > 0 ? `לונג ${pct(t)}` : t < 0 ? `שורט ${pct(-t)}` : 'בלי')}` : ''}${r.crowd >= 0.55 ? ' · ⚠️ שורט צפוף' : ''}</small></div>${acts(items, btn)}</li>`; }).join('');
  const fund = A.filter(([a]) => !a.co).map(([a, i]) => [a, i, { hug: 'לחקות את המדד', derisk: 'להקטין סיכון בחצי', gate: 'לנעול פדיונות', launch: 'להשיק קרן מדד', seed: 'להשקיע מהכסף שלי', draw: 'למשוך מהקרן' }[a.id] || a.label, a.id === 'hug' ? 'בלי דמי הצלחה' : a.id === 'gate' ? 'עד 10% בחודש · בלי ★★★' : (/\((.*)\)/.exec(a.label) || [])[1] || (/(₪[^ ]+(?: [א-ת]+)?)/.exec(a.label) || [])[1] || '']);
  return `${line}<div class="wp-gauges fd-g">${g}</div>${sec('התיק', table, 'אות המחקר = טווח: האמת בתוכו. שורט על מניה צפופה מסוכן — כשהיא קופצת כולם קונים בחזרה ביחד.')}
    ${sec('לונג ושורט', `<ul class="wp-rows fds">${coRows}</ul>`, 'עד 30% במניה אחת, עד 100% בלונג, עד 50% בשורט — בלי מינוף. מכירה, שורט וסגירה מבקשים לחיצה שנייה.')}
    ${sec('הקרן', acts(fund, btn), '💡 = מה שהמנטור היה בוחר עכשיו. נעילת פדיונות מבקשת לחיצה שנייה: הלקוחות זוכרים, ואין ★★★.')}`;
}
/** panel body by its id (null = not one of the five) */
export function panelHtml(H, P, D, btn) {
  if (!P) return null; const d = D || {};
  if (P.id === 'credit') return crPanel(H, P, d.credit, btn);
  if (P.id === 'trials') return trPanel(H, P, d.trials, btn, d);
  if (P.id === 'insure') return insPanel(H, P, d.insure, btn);
  if (P.id === 'bell') return blPanel(H, P, d.bell, btn, d);
  if (P.id === 'funds') return fdPanel(H, P, d.funds, btn);
  return null;
}
export const PANEL_COLOR = Object.freeze({ credit: '#334155', trials: '#115e59', insure: '#3730a3', bell: '#7c2d12', funds: '#155e75' });

/* ============================================================ two-tap actions: the words before the confirming tap */
/** does this action need a second tap (beyond ui.js WP_CONFIRM: sell, raise, secondary, close)? */
export const needsArm = (a) => !!a && (a.id === 'sellBook' || a.id === 'ipo' || a.id === 'stop' || a.id === 'license' || a.id === 'partner' || a.id === 'royalty' || a.id === 'catbond' || a.id === 'gate'
  || (a.id === 'plant' && /למכור/.test(a.label || '')));
export function armText(a, D = {}, H = null) {
  const m = H ? H.mS : (x) => String(x); const lab = (a && a.label) || ''; const par = (/\((.*)\)/.exec(lab) || [])[1] || '';
  if (D.credit) {
    if (a.id === 'sellBook') return `${lab}: הספר קטן ברבע, במחיר של 85%–95% מהערך — ההפרש יורד מההון. פחות סיכון, פחות הכנסה. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'raise') return `${lab}: המשקיע קונה מניות חדשות ב־15% הנחה — ההון גדל, והחלק שלך בבנק קטן (היום ${Math.round((D.credit.stake || 1) * 100)}%). אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  }
  if (D.trials) {
    if (a.id === 'stop') return `${lab}: הניסוי נעצר. רק 5% ממה שהוצא חוזרים — והשאר לא היה חוזר גם אם היית ממשיך. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'license') return `${lab}: השותף משלם את כל השלבים מכאן ומשלם לך תמלוג אם התרופה תאושר — אבל לוקח את רוב האפסייד. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'partner') return `${lab}: שותף ישלם חצי מכל שלב מכאן — וייקח חצי מהרווח של התרופה. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'royalty') return `${lab}: כסף עכשיו, ו־30% מהרווח של התרופה עוברים לקונה עד הסוף. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'plant') return `${lab}: המפעל נמכר ב־70% מהעלות, והתרופות שלך מרוויחות 8% פחות. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  }
  if (D.insure) {
    if (a.id === 'catbond') return `${lab}: כיסוי לסערות לשלוש שנים במחיר קבוע — הכסף יוצא מההון עכשיו, גם אם לא תבוא סערה. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'raise') return `${lab}: ההון גדל וכושר הפירעון עולה — ${/בהנחה/.test(lab) ? 'אבל המשקיעים קונים בהנחה, והחלק שלך קטן' : 'הכסף מגיע מבעלי הפוליסות'}. גיוס אחד לחצי שנה. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  }
  if (D.bell) {
    if (a.id === 'ipo') return `הנפקה: ${pct(a.float)} מהחברה לציבור, במחיר של 90% מהשווי${par ? ` — נכנסים לקופת החברה ${par}` : ''}. מעכשיו יש מחיר בכל חודש, הדרכה כל רבעון ואקטיביסטים. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'secondary') return `${lab}: מניות חדשות ב־95% מהמחיר — כסף לקופה, והחלק שלך בחברה קטן. השוק לא אוהב את זה. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
    if (a.id === 'sell') return `${lab}: הכסף נכנס לקופת החברה, והרווח של החטיבה יוצא מהרווח התפעולי — וגם מהמחיר. אי אפשר לבטל. לחיצה נוספת מאשרת.`;
  }
  if (D.funds) {
    if (a.id === 'gate') return 'נעילת פדיונות: שלושה חודשים, עד 10% בחודש. הלקוחות לא יוכלו לצאת מהר — והם יזכרו: המוניטין יורד, ואין ★★★ במשחק הזה. אי אפשר לבטל. לחיצה נוספת מאשרת.';
    if (a.id === 'sell') return `${lab}${a.w <= 0 ? ' — שורט: אם המניה עולה, ההפסד לא מוגבל; על מניה צפופה סחיטה יכולה להקפיץ אותה ב־30%–80%' : ''}. לחיצה נוספת מאשרת.`;
    if (a.id === 'close') return `${lab}: כל הפוזיציה נסגרת במחיר של היום. לחיצה נוספת מאשרת.`;
  }
  return null;
}

/* ============================================================ the HUD chip, the sheet box (engine values only) */
/** which of the five worlds this worldIndicators block belongs to */
export const worldKey = (wi) => (!wi || !wi.panel ? null : wi.credit ? 'credit' : wi.trials ? 'trials' : wi.insure ? 'insure' : wi.bell ? 'bell' : wi.funds ? 'funds' : null);
/** { key, v, goodUp, al, html, extra } for ui.js renderHUD */
export function chip(H, wi) {
  const k = worldKey(wi); if (!k) return null; const X = wi[k]; const P = wi.panel; const T = P.title || '';
  if (k === 'credit') return { key: 'capRatio', v: X.capRatio, goodUp: 1, al: `${T}: יחס הון ${pct1(X.capRatio)}, אמון המפקידים ${nf(X.conf)} מתוך 100, ההון שלך ${H.mS(X.equity)}${X.crunch ? ', משבר אשראי' : ''}`,
    html: `🏦 <span class="hb-mf">יחס הון </span>${H.num(pct1(X.capRatio))}<span class="hb-b"> · אמון ${H.num(nf(X.conf))}</span>${X.conf < X.runAt + 12 ? ' ⚠️' : ''}`, extra: X.crunch ? '<span class="hedge" title="משבר אשראי במשק">🌩️</span>' : '' };
  if (k === 'trials') { const live = (P.rows || []).filter((r) => r.state === 'run' || r.state === 'dec').length; const dec = (P.rows || []).filter((r) => r.state === 'dec').length;
    return { key: 'earning', v: X.earning, goodUp: 1, al: `${T}: ${X.earning} תרופות מרוויחות מתוך 2, ${live} מולקולות בצינור${dec ? `, ${dec} מחכות להחלטה` : ''}, ${X.sectorLabel}`,
      html: `🧪 ${H.num(`${X.earning}/2`)}<span class="hb-mf"> תרופות</span><span class="hb-b"> · ${H.num(`${live} בצינור`)}</span>${dec ? ` ⏸${H.num(String(dec))}` : ''}`, extra: X.sector !== 'normal' ? `<span class="hedge" title="${H.esc(X.sectorLabel)}">${X.sector === 'bull' ? '🫧' : '❄️'}</span>` : '' }; }
  if (k === 'insure') return { key: 'solvency', v: X.solvency, goodUp: 1, al: `${T}: כושר פירעון ${pct(X.solvency)}, יחס משולב ${pct(X.combined12)} ב־12 חודשים, ${X.xol ? `${X.xol} שכבות ביטוח משנה` : 'בלי ביטוח משנה לסערות'}${X.stormSeason ? ', עונת הסערות' : ''}`,
    html: `☂️ <span class="hb-mf">פירעון </span>${H.num(pct(X.solvency))}<span class="hb-b"> · משולב ${H.num(pct(X.combined12))}</span>${X.stormSeason ? ' 🌀' : ''}`, extra: X.xol ? `<span class="hedge" title="שכבות ביטוח משנה">🛡️${H.num(String(X.xol))}</span>` : '' };
  if (k === 'bell') return { key: 'stakeMkt', v: X.stakeMkt, goodUp: 1, al: `${T}: ${X.listed ? `מניה ₪${x2(X.price)} מול ₪${x2(X.peer)} אצל המתחרים, החלק שלך שווה ${H.mS(X.stakeMkt)}` : 'עוד לא רשומה בבורסה'}, חוב נטו ${X.netDebtEbitda >= 99 ? 'בלי רווח' : `×${x2(X.netDebtEbitda)}`} מהרווח, ${X.sectorLabel}`,
    html: `🔔 ${X.listed ? `${H.num(`₪${x2(X.price)}`)}${X.price >= X.peer ? ' ▲' : ' ▼'}` : 'פרטית'}<span class="hb-b"> · חוב ${H.num(X.netDebtEbitda >= 99 ? '—' : `×${x2(X.netDebtEbitda)}`)}</span>`, extra: X.activists ? '<span class="hedge" title="אקטיביסט">🚩</span>' : '' };
  return { key: 'aum', v: X.aum, goodUp: 1, al: `${T}: ${H.mS(X.aum)} בניהול, מול המדד ${sgnPct1(X.rel12)} ב־12 חודשים${X.pending ? `, בקשות פדיון ${H.mS(X.pending)}` : ''}${X.gate ? ', פדיונות נעולים' : ''}`,
    html: `📈 ${H.num(H.tiny ? H.tiny(X.aum) : H.mS(X.aum))}<span class="hb-mf"> בניהול</span><span class="hb-b"> · ${H.num(sgnPct1(X.rel12))}</span>${X.pending ? ' 🏃' : ''}`, extra: X.gate ? '<span class="hedge" title="פדיונות נעולים">🚧</span>' : '' };
}
export function box(H, wi) {
  const k = worldKey(wi); if (!k) return null; const X = wi[k]; const T = H.esc(wi.panel.title || 'לוח המפה');
  const btn = (ic) => `<div class="loans"><button data-act="world">${ic} ${T}</button></div>`;
  if (k === 'credit') return `<div class="wbox"><div class="wl"><span>🏦 ${T}</span><b>יחס הון ${H.num(pct1(X.capRatio))}</b></div><p class="note">ההון שלך ${H.num(H.mS(X.equity))} · אמון המפקידים ${H.num(`${nf(X.conf)} מתוך 100`)} · ספר ${H.num(H.mS(X.loans))} · ריבית ${H.num(`${X.rate}%`)}${X.crunch ? ' · <b class="neg">משבר אשראי</b>' : ''}${X.regs ? ` · <b class="neg">המפקח נכנס ${H.num(String(X.regs))} פעמים</b>` : ''}.</p>${btn('🏦')}</div>`;
  if (k === 'trials') return `<div class="wbox"><div class="wl"><span>🧪 ${T} · ${H.esc(X.sectorLabel)}</span><b>${H.num(`${X.earning}/2 תרופות`)}</b></div><p class="note">שווי המעבדה ${H.num(H.mS(X.value))} · רווח החודש ${H.num(H.mSg(X.inc), H.cls(X.inc))} · אושרו ${H.num(String(X.approved))} · נכשלו ${H.num(String(X.fails))}${X.plant ? ' · 🏭 מפעל' : ''}.</p>${btn('🧪')}</div>`;
  if (k === 'insure') return `<div class="wbox"><div class="wl"><span>☂️ ${T}</span><b>פירעון ${H.num(pct(X.solvency))}</b></div><p class="note">יחס משולב ${H.num(pct(X.combined12))} ב־12 חודשים · פרמיות ${H.num(H.mS(X.gwp))} בשנה · ${X.xol ? `${H.num(String(X.xol))} שכבות ביטוח משנה` : 'בלי ביטוח משנה לסערות'}${X.stormSeason ? ' · 🌀 עונת הסערות' : ''}${X.cats ? ` · ${H.num(String(X.cats))} סערות` : ''}.</p>${btn('☂️')}</div>`;
  if (k === 'bell') return `<div class="wbox"><div class="wl"><span>🔔 ${T} · ${H.esc(X.sectorLabel)}</span><b>${X.listed ? H.num(`₪${x2(X.price)}`) : 'פרטית'}</b></div><p class="note">${X.listed ? `החלק שלך שווה ${H.num(H.mS(X.stakeMkt))} · המתחרים ${H.num(`₪${x2(X.peer)}`)}` : 'עוד לא רשומה: אין מחיר שוק'} · חוב נטו ${H.num(X.netDebtEbitda >= 99 ? 'בלי רווח' : `×${x2(X.netDebtEbitda)}`)} מהרווח · רווח תפעולי ${H.num(H.mS(X.ebitdaM))} בחודש.</p>${btn('🔔')}</div>`;
  return `<div class="wbox"><div class="wl"><span>📈 ${T} · ${H.esc(X.regimeLabel)}</span><b>${H.num(H.mS(X.aum))}</b></div><p class="note">מול המדד ${H.num(sgnPct1(X.rel12))} ב־12 חודשים · לונג ${H.num(pct(X.long))} · שורט ${H.num(pct(X.short))} · שלך בקרן ${H.num(H.mS(X.mine))}${X.pending ? ` · <b class="neg">בקשות פדיון ${H.num(H.mS(X.pending))}</b>` : ''}${X.gate ? ' · <b class="neg">פדיונות נעולים</b>' : ''}.</p>${btn('📈')}</div>`;
}
/** the news kinds of the five worlds: icon, "bad" and "keep" (important: its own toast that stays) */
export const NEWS = Object.freeze({
  credit: { ic: '🏦', bad: /תור|מפקח|משבר|מכירה בכפייה|חלון|יירד|ניהול חיצוני|שמועות/, keep: /תור בסניפים|המפקח נכנס|משבר אשראי|ניהול חיצוני|בכפייה/ },
  tr: { ic: '🧪', bad: /נכשלה|פג|עומד|חורף|אין מזומן/, keep: /נכשלה|אושרה|פג/ , gold: /אושרה|הצליח|מולקולה חדשה/ },
  ins: { ic: '☂️', bad: /נזק|המפקח|קריסה|נמחק|התייקר/, keep: /נזק|המפקח נכנס|נמחק/ },
  bell: { ic: '🔔', bad: /פספסת|אקטיביסט|דובי/, keep: /פספסת|אקטיביסט|הפעמון/, gold: /עמדת|שורי|הפעמון/ },
  funds: { ic: '📈', bad: /משכו|סחיטת|נסגרו בכוח|מושך|ביקש את כל|קריסה|דובי/, keep: /סחיטת|נסגרו בכוח|מושך|ביקש את כל/, gold: /חדשים|הרוויח/ },
});
export { SEG_IDS };
