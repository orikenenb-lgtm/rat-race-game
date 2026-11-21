// T6 personal end summary (spec docs/next-level/specs/T6-rivals-summary.md §5, §6, §7.5, §14).
// Two halves:
//   1. PURE helpers (no DOM, no storage at import — also imported by js/ghost-worker.js and the Node tests):
//      the per-payday timeline (engine st.tl when the engine has it, else the UI-side fallback S.ui.tl with the same shape),
//      the five success dimensions (engine result.recap.dims when present, else a fallback built only from engine output:
//      checkEnd() / metrics() numbers + the timeline), and the ghost comparison order (raw facts, never a composite score).
//   2. HTML builders (strings): the money graph (inline SVG from integers) + its accessible table, the top block (#endTop) and the
//      collapsed "more" sections. lobby.js / main.js / ui.js put them on screen and wire them with wireSummary(root).
// Every sentence is a §14 string filled with engine numbers; the UI formats (fmtM) and orders, it computes no finance.
import { fmtM, sgn, starThresholds } from './engine.js';

/* ============================================================ small helpers (no ui.js: it touches the DOM at import) */
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** a number / money token isolated for RTL (AC-24 reads every <bdi>) */
export const bdi = (t, cls = '') => `<bdi dir="ltr" class="num${cls ? ' ' + cls : ''}">${esc(t)}</bdi>`;
const MONEY_RE = /[−+-]?[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s?(?:מיליון|אלף))?/g;
/** escape + isolate every money token inside a text */
export const isoT = (t) => esc(t).replace(MONEY_RE, (m) => `<bdi dir="ltr" class="num">${m}</bdi>`);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const int = (v, d = 0) => { const n = Math.round(+v); return Number.isFinite(n) ? n : d; };
const pct = (x) => Math.max(0, Math.min(100, Math.floor((+x || 0) * 100)));

/* ============================================================ timeline (§4.1) */
export const TL_COLS = ['m', 'nw', 'liq', 'debt', 'pas', 'exp', 'pg', 'hap', 'en'];
export const TL_CAP = 240;
export function tlNew(from = 1) { const t = { v: 1, step: 1, from, ui: 1 }; for (const c of TL_COLS) t[c] = []; return t; }
/** One timeline row from metrics() — the same columns as the engine's st.tl (integers; money in ₪100 units). */
export function tlRowOf(m) {
  const L = m.life || {};
  const parts = m.goalParts || [];
  const prog = parts.length ? Math.min(...parts.map((p) => +p.progress || 0)) : (+m.goalProgress || 0);
  return [int(m.month), int((m.netWorth || 0) / 100), int(((m.cash || 0) + (m.savings || 0)) / 100), int((m.totalLiabilities ?? ((m.loans || 0) + (m.credit || 0))) / 100),
    int(m.passive), int(m.expenses), int(Math.max(0, Math.min(1, prog)) * 1000), int(L.happiness ?? 0), int(L.energy ?? 0)];
}
/** Append a row (one per month; a row for an already-recorded month replaces it). Cap 240: keep every 2nd row (the first always). */
export function tlPush(tl, row) {
  const n = tl.m.length;
  if (n && tl.m[n - 1] === row[0]) { TL_COLS.forEach((c, i) => { tl[c][n - 1] = row[i]; }); return tl; }
  if (n && row[0] < tl.m[n - 1]) return tl;                     // months never go back (a branch starts its own timeline)
  tl.seen = (tl.seen || 0) + 1;
  if ((tl.step || 1) > 1 && tl.seen % tl.step !== 0) return tl;
  TL_COLS.forEach((c, i) => tl[c].push(row[i]));
  if (tl.m.length >= TL_CAP) { for (const c of TL_COLS) tl[c] = tl[c].filter((_, i) => i % 2 === 0); tl.step = (tl.step || 1) * 2; }
  return tl;
}
const isTl = (t) => !!(t && Array.isArray(t.m) && Array.isArray(t.nw));
/** The game's timeline: the engine's st.tl (exact, every payday) or the UI fallback S.ui.tl. null when neither exists. */
export function tlOf(st) { if (!st) return null; if (isTl(st.tl)) return st.tl; if (st.ui && isTl(st.ui.tl)) return st.ui.tl; return null; }
/** rows as arrays [m, nw, liq, debt, pas, exp, pg, hap, en] */
export function tlRows(tl) { if (!isTl(tl)) return []; return tl.m.map((_, i) => TL_COLS.map((c) => int(tl[c][i]))); }
/** a copy holding only the rows with m ≤ month (R3: nothing after the player's month) */
export function tlUpTo(tl, month) {
  if (!isTl(tl)) return null;
  const out = { v: 1, step: tl.step || 1, from: tl.from || 1 }; const keep = tl.m.map((m) => m <= month);
  for (const c of TL_COLS) out[c] = (tl[c] || []).filter((_, i) => keep[i]);
  return out;
}
export function tlFromRows(rows, from) { const t = tlNew(from ?? (rows[0] ? rows[0][0] : 1)); for (const r of rows) TL_COLS.forEach((c, i) => t[c].push(r[i])); return t; }
const cushionOf = (liq, exp) => (exp > 0 ? (liq * 100) / exp : 99);

/* ============================================================ the five dimensions (§5.1, §14.5) */
export const DIMS = [
  { id: 'speed', icon: '⏱️', title: 'מהירות', order: 'מסודר לפי: מי יצא קודם, ואחר כך מי התקדם יותר' },
  { id: 'resilience', icon: '🛡️', title: 'חוסן', order: 'מסודר לפי: פחות הלוואות כפויות, ואחר כך כרית נמוכה פחות' },
  { id: 'decisions', icon: '🧠', title: 'החלטות', order: 'מסודר לפי: חלק ההחלטות החלשות (פחות זה טוב)' },
  { id: 'happiness', icon: '😊', title: 'אושר', order: 'מסודר לפי: אושר ממוצע' },
  { id: 'business', icon: '🏪', title: 'עסק', order: 'מסודר לפי: חלק החודשים הרווחיים' },
];
const oneDec = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
/** Fallback dims while the engine has no result.recap (T6 ENGINE part pending): facts read from checkEnd()/metrics() output and the
 *  timeline only; headlines are the §14.5 templates. {end, m (metrics at the end), tl, worldId, charId}. */
export function dimsFallback({ end = {}, m = null, tl = null, worldId, charId, summary = null } = {}) {
  const rows = tlRows(tl);
  const st = end.stats || (summary && summary.stats) || {};
  const won = end.status === 'won' || end.status === 'retired';
  const months = int(end.months ?? (m && m.month));
  const progress = +(end.progress ?? (m && m.goalProgress) ?? 0);
  let th = null; try { th = worldId && worldId !== 'h' ? starThresholds(worldId, charId) : null; } catch (e) { th = null; }
  const speed = { facts: { won, months, stars: int(end.stars), thresholds: th ? [th.t3, th.t2, th.maxMonths] : null, progress, maxMonths: th ? th.maxMonths : null } };
  speed.headline = won ? (th ? fill('יצאת בחודש {m} (★★ עד חודש {m2})', { m: months, m2: th.t2 }) : fill('יצאת בחודש {m}', { m: months })) : fill('הגעת ל־{p}% מהדרך לחופש', { p: pct(progress) });
  speed.short = won ? `חודש ${months}` : `${pct(progress)}% מהדרך`;
  // resilience: counters from stats; the lowest cushion from the timeline (cash + savings over expenses, as §5.1 defines it)
  let minC = null, minM = null, under1 = 0;
  for (const r of rows) { const c = cushionOf(r[2], r[5]); if (c < 1) under1++; if (minC == null || c < minC) { minC = c; minM = r[0]; } }
  const forced = int(st.autoLoans);
  const resilience = { facts: { crises: int(st.crises), crisisNoLoan: int(st.crisisNoLoan), forcedLoans: forced, forcedTotal: int(st.forcedLoans), negMonths: int(st.negMonths), minCushion: minC == null ? null : Math.round(minC * 10) / 10, minCushionM: minM, monthsUnder1: under1, bailout: !!(end.bailoutUsed) } };
  const low = minC == null ? '' : fill(' הכרית הכי נמוכה: {x} חודשים (חודש {m}).', { x: oneDec(Math.max(0, minC)), m: minM });
  resilience.headline = (int(st.crises) ? fill('עברת {c} משברים — {n} בלי הלוואה כפויה.', { c: int(st.crises), n: int(st.crisisNoLoan) }) : 'לא היו משברים.') + low;
  resilience.short = `${forced} הלוואות כפויות`;
  // decisions: the engine's verdict counts (learning.verdicts)
  const L = end.learning || (summary && summary.learning) || {}; const V = L.verdicts || {};
  const s = int(V.strong), o = int(V.ok) + int(V.mixed), w = int(V.costly) + int(V.risky), n = int(L.decisions ?? (s + o + w));
  const decisions = { facts: { strong: s, ok: o, weak: w, n, hints: int(L.hints) }, headline: fill('{s} החלטות חזקות · {o} סבירות · {w} חלשות', { s, o, w }), short: `${s} חזקות · ${w} חלשות` };
  // happiness: start / end / min from the timeline, the engine's average when it gave one, else the timeline's
  const hs = rows.map((r) => r[7]);
  const ls = end.lifeSummary || {};
  const hEnd = int(end.happiness ?? ls.happiness ?? (hs.length ? hs[hs.length - 1] : 0));
  const avg = ls.avgHappiness != null ? int(ls.avgHappiness) : hs.length ? int(hs.reduce((a, b) => a + b, 0) / hs.length) : hEnd;
  let hMin = null, hMinM = null; rows.forEach((r) => { if (hMin == null || r[7] < hMin) { hMin = r[7]; hMinM = r[0]; } });
  const burn = int(ls.burnouts ?? (summary && summary.life && summary.life.burnouts));
  const happiness = { facts: { start: hs.length ? hs[0] : hEnd, end: hEnd, avg, min: hMin, minM: hMinM, burnouts: burn, lowEnergyMonths: rows.filter((r) => r[8] < 25).length } };
  happiness.headline = fill('התחלת ב־{s} וסיימת ב־{e} · ממוצע {a} · {b}', { s: happiness.facts.start, e: hEnd, a: avg, b: burn ? `${burn} שחיקות` : 'בלי שחיקות' });
  happiness.short = `ממוצע ${avg}`;
  // business: metrics().businesses (totals.profitMonths when the engine has it, else the kept history)
  const bs = (m && m.businesses) || [];
  let business;
  if (bs.length) {
    let t = 0, p = 0, worst = null, worstM = null; let stage = '';
    for (const b of bs) {
      const T = b.totals || {};
      if (T.profitMonths != null) { p += int(T.profitMonths); t += int(T.months); }
      else { const H = b.hist || []; t += H.length; p += H.filter((x) => x.np > 0).length; }
      for (const x of b.hist || []) if (worst == null || x.np < worst) { worst = x.np; worstM = x.m; }
      if (b.stageName && !stage) stage = b.stageName;
    }
    business = { facts: { had: true, months: t, profitMonths: p, lossMonths: t - p, worstNp: worst, worstM, stage } };
    business.headline = stage ? fill('העסק הרוויח ב־{p} מתוך {t} חודשים · שלב "{stage}"', { p, t, stage }) : fill('העסק הרוויח ב־{p} מתוך {t} חודשים', { p, t });
    business.short = `${p} מתוך ${t} רווחיים`;
  } else business = { facts: { had: false }, headline: 'לא ניהלת עסק במשחק הזה', short: '—' };
  return { speed, resilience, decisions, happiness, business, fallback: true };
}
/** The dims for a result: the engine's recap.dims, else the fallback. */
export function dimsOf(end, extra = {}) {
  if (end && end.recap && end.recap.dims) return end.recap.dims;
  return dimsFallback({ end: end || {}, ...extra });
}
/** order key (§5.1): negative when a is better than b, 0 = tie */
export function cmpDim(id, a, b) {
  const A = (a && a.facts) || {}, B = (b && b.facts) || {};
  const d = (x, y) => (x === y ? 0 : x < y ? -1 : 1);
  switch (id) {
    case 'speed': return d(B.won ? 1 : 0, A.won ? 1 : 0) || (A.won ? d(A.months, B.months) : 0) || d(B.progress || 0, A.progress || 0);
    case 'resilience': return d(A.forcedLoans || 0, B.forcedLoans || 0) || d(B.minCushion ?? 0, A.minCushion ?? 0);
    case 'decisions': { const r = (F) => (F.n ? F.weak / F.n : 0), s = (F) => (F.n ? F.strong / F.n : 0); return d(r(A), r(B)) || d(s(B), s(A)); }
    case 'happiness': return d(B.avg || 0, A.avg || 0);
    case 'business': { if (!A.had || !B.had) return d(B.had ? 1 : 0, A.had ? 1 : 0); const r = (F) => (F.months ? F.profitMonths / F.months : 0); return d(r(B), r(A)); }
    default: return 0;
  }
}
/** Place of `me` among me + the finished ghosts (ties share a place). → {r, of, tie, best:{who, dim}|null} */
export function placeOf(id, me, ghosts) {
  const list = ghosts.filter((g) => g && g.dims && g.dims[id]);
  const of = list.length + 1;
  const better = list.filter((g) => cmpDim(id, g.dims[id], me) < 0).length;
  const tie = list.some((g) => cmpDim(id, g.dims[id], me) === 0);
  const sorted = list.slice().sort((a, b) => cmpDim(id, a.dims[id], b.dims[id]));
  const r = better + 1;
  const best = r === 1 ? sorted.find((g) => cmpDim(id, g.dims[id], me) >= 0) || null : sorted[0] || null;
  return { r, of, tie, best };
}

/* ============================================================ personas (display only; the engine owns them as E.RIVALS when T6 lands) */
export const PERSONAS_FALLBACK = {
  saver: { id: 'saver', icon: '🐢', name: 'רותם', label: 'חוסכת זהירה', g: 'f', rule: 'שומרת כרית של 6 חודשים. קונה רק נכס שמכניס כסף כל חודש, בלי הלוואה. בודקת כל עסקה עם סימן אזהרה. 20% מהעודף לקרן מדד.', strong: 'במשברים, במיתון ובריבית גבוהה', weak: 'כשהכלכלה צומחת והאשראי זול — היא יוצאת לאט' },
  founder: { id: 'founder', icon: '🚀', name: 'עומר', label: 'יזם', g: 'm', rule: 'מעדיף עסקים. לוקח הלוואה כשהעסקה מכניסה יותר מהריבית. מנהל את העסק בעצמו.', strong: 'כשיש עסקים טובים על הלוח ובתקופת צמיחה', weak: 'בשחיקה, במיתון, וכשכל הכסף בעסק אחד' },
  diversified: { id: 'diversified', icon: '🧺', name: 'מאיה', label: 'משקיעה מפוזרת', g: 'f', rule: '40% מהעודף לקרן מדד, נכס אחד מכל סוג, כרית של 3 חודשים.', strong: 'במשחקים ארוכים ובמחזורים מעורבים', weak: 'במרוץ קצר' },
  gambler: { id: 'gambler', icon: '🎲', name: 'רועי', label: 'חובב סיכון', g: 'm', rule: "מינוף מקסימלי, קריפטו וצ'קים גדולים לסטארט־אפים. אף פעם לא בודק עסקה, ותמיד מנסה להוריד מחיר.", strong: 'כשיש מזל ובתקופת צמיחה', weak: 'כמעט בכל השאר — מורה טוב לכך שמזל הוא לא שיקול דעת' },
};
export const ARCH_IDS = ['saver', 'founder', 'diversified', 'gambler'];
export const escapedVerb = (p) => (p && p.g === 'f' ? 'יצאה' : 'יצא');

/* ============================================================ copy (§14) */
export const T6 = {
  more: 'עוד פרטים', pending: 'היריבים מסיימים לשחק…', missing: '—',
  sec: { dl: 'החלטות ומזל', crisis: 'המשבר הגדול', rivals: 'מול היריבים', life: 'סיפור החיים', full: 'ניתוח מלא', ach: 'הישגים ושיעורים' },
  place: 'מקום {r} מתוך {of} · הכי טוב: {icon} {name} — {short}', placeFirst: 'מקום 1 מתוך {of} · אחריך: {icon} {name} — {short}', placeTie: 'מקום {r} (שווה) מתוך {of} · הכי טוב: {icon} {name} — {short}',
  sugTitle: '💡 לפעם הבאה', sugCta: '🔁 לנסות את ההחלטה הזו אחרת', sugSub: 'נפתח ענף תרגול. המשחק המקורי נשמר.', gridCta: '🔁 לנסות אחרת',
  lastCta: '🔁 לחזור לרגע מהמשחק', thPlayer: 'שחקן', atMonth: 'בחודש {m}', nwAt: 'שווי נקי {nw}', you: 'אתה',
  noCrisis: 'לא היה משבר גדול במשחק הזה.', lostDeals: 'עסקאות שהלכו ליריבים', strongP: 'חזקים כש:', weakP: 'חלשים כש:',
  tabMoney: '💰 כסף', tabHappy: '😊 אושר וכוח', asTable: 'הצג כטבלה', asGraph: 'הצג כגרף', caption: 'הנתונים של הגרף', allRows: 'להציג את כל החודשים',
  lg: { nw: 'שווי נקי', liq: 'מזומן וחיסכון', low: 'כרית מתחת לחודש', rec: 'מיתון', hap: 'אושר', en: '🔋 כוח', orig: 'המקור', branch: 'הענף' },
  th: ['חודש', 'שווי נקי', 'מזומן וחיסכון', 'חובות', 'הכנסה פסיבית', 'הוצאות', '😊', '🔋'],
  alt: 'שווי נקי: התחלת ב־{a}, שיא {b} בחודש {m}, סיום ב־{c}.',
  afterwinBtn: '🌴 להמשיך לחיות אחרי החופש', afterwinSub: 'בלי כוכבים חדשים — רק לראות אם החופש מחזיק.', afterwinTitle: 'מה החופש נתן לך',
  winPin: 'יצאת מהמירוץ',
  cmpTitle: 'המקור מול הענף', limitsTitle: 'מה אפשר ללמוד מההשוואה',
  limits: ['אותן קוביות ואותם קלפים — רק ההחלטות שלך שונות.', 'לפעמים משבצת נראית אחרת כי המצב שלך שונה (למשל כשיש לך עסק).', 'בענף התרגול אתה כבר יודע מה קרה. ההשוואה מראה מה הייתה עושה ההחלטה בקלפים האלה — לא אם היא הייתה נכונה מראש.', 'אירועי חיים וסיפורים שתלויים במצב שלך יכולים להשתנות בהמשך.', 'ענף תרגול לא נותן כוכבים, הישגים, ⚡ או מקום בטבלה.'],
  grid: { goodWon: '✅ החלטה טובה שגם הצליחה', goodUnlucky: '💪 עשית נכון — הפעם לא הסתדר', luckyWeak: '🍀 הצליח, אבל בזכות מזל — אל תסמוך על זה', weakCostly: '⚠️ החלטה חלשה שגם עלתה ביוקר' },
};

/* ============================================================ the money graph (§6.3 item 2) */
const GW = 340, GH = 180, PADR = 6, PADL = 46, PADT = 10, PADB = 22;
function runs(rows, pred) { const out = []; let cur = null; for (const r of rows) { if (pred(r)) { if (!cur) cur = { from: r[0], to: r[0] }; else cur.to = r[0]; } else if (cur) { out.push(cur); cur = null; } } if (cur) out.push(cur); return out; }
/** recession bands from the engine's revealed cycle path (end.econPath.truth) when recap.graph has none */
export function recessionsOf(end) {
  if (end && end.recap && end.recap.graph && Array.isArray(end.recap.graph.recessions)) return end.recap.graph.recessions;
  const T = end && end.econPath && end.econPath.truth; if (!Array.isArray(T)) return [];
  return runs(T.map((x) => [x.m, x.phase]), (r) => r[1] === 'rec');
}
/** alt text: the engine's recap.graph.alt, else the same §14.6 template filled from the timeline */
export function altOf(tl, end) {
  if (end && end.recap && end.recap.graph && end.recap.graph.alt) return end.recap.graph.alt;
  const rows = tlRows(tl); if (!rows.length) return '';
  let pk = rows[0]; for (const r of rows) if (r[1] > pk[1]) pk = r;
  return fill(T6.alt, { a: fmtM(rows[0][1] * 100), b: fmtM(pk[1] * 100), m: pk[0], c: fmtM(rows[rows.length - 1][1] * 100) });
}
/**
 * Inline SVG (integers only). opts = {series:'money'|'happy', recessions:[{from,to}], lowCushion:[{from,to}]|null, notes:[{m,kind,text}],
 * compareTl, alt, id}. RTL: month 1 on the right.
 */
export function graphSvg(tl, opts = {}) {
  const rows = tlRows(tl); const cmp = tlRows(opts.compareTl);
  if (rows.length < 1) return '';
  const happy = opts.series === 'happy';
  const all = rows.concat(cmp);
  const m0 = Math.min(...all.map((r) => r[0])), m1 = Math.max(...all.map((r) => r[0]), m0 + 1);
  const W2 = GW - PADL - PADR, H2 = GH - PADT - PADB;
  const x = (m) => (PADL + W2 - ((m - m0) / (m1 - m0)) * W2).toFixed(1);   // month 1 on the RIGHT
  let lo = 0, hi = 100;
  if (!happy) { const vs = all.flatMap((r) => [r[1], r[2]]); lo = Math.min(0, ...vs); hi = Math.max(1, ...vs); if (hi === lo) hi = lo + 1; }
  const y = (v) => (PADT + H2 - ((v - lo) / (hi - lo)) * H2).toFixed(1);
  const line = (rs, col, cls) => (rs.length === 1 ? `<circle cx="${x(rs[0][0])}" cy="${y(rs[0][col])}" r="2.5" class="${cls}"/>` : `<polyline class="${cls}" points="${rs.map((r) => `${x(r[0])},${y(r[col])}`).join(' ')}"/>`);
  const band = (b, cls) => { const xa = +x(Math.max(m0, b.from)), xb = +x(Math.min(m1, b.to)); const l = Math.min(xa, xb) - 2, w = Math.max(4, Math.abs(xa - xb) + 4); return `<rect class="${cls}" x="${l.toFixed(1)}" y="${PADT}" width="${w.toFixed(1)}" height="${H2}"/>`; };
  const parts = [];
  if (!happy) {
    for (const b of opts.recessions || []) parts.push(band(b, 'g-rec'));
    for (const b of opts.lowCushion || runs(rows, (r) => r[5] > 0 && r[2] * 100 < r[5])) parts.push(band(b, 'g-low'));
  }
  // axes: zero line, y labels (lo / hi), x labels (first / last month)
  const yl = happy ? [0, 50, 100] : [lo, hi];
  parts.push(...yl.map((v) => `<line class="g-grid" x1="${PADL}" x2="${GW - PADR}" y1="${y(v)}" y2="${y(v)}"/><text class="g-ax" x="${PADL - 4}" y="${(+y(v) + 4).toFixed(1)}" text-anchor="end">${esc(happy ? String(v) : fmtM(v * 100))}</text>`));
  if (!happy && lo < 0) parts.push(`<line class="g-zero" x1="${PADL}" x2="${GW - PADR}" y1="${y(0)}" y2="${y(0)}"/>`);
  parts.push(`<text class="g-ax" x="${GW - PADR}" y="${GH - 6}" text-anchor="end">${esc('חודש ' + m0)}</text><text class="g-ax" x="${PADL}" y="${GH - 6}" text-anchor="start">${esc('חודש ' + m1)}</text>`);
  if (happy) { parts.push(line(rows, 7, 'g-hap'), line(rows, 8, 'g-en')); if (cmp.length) parts.push(line(cmp, 7, 'g-cmp')); }
  else {
    if (rows.length > 1) parts.push(`<polygon class="g-liq" points="${rows.map((r) => `${x(r[0])},${y(r[2])}`).join(' ')} ${x(rows[rows.length - 1][0])},${y(Math.max(lo, 0))} ${x(rows[0][0])},${y(Math.max(lo, 0))}"/>`);
    if (cmp.length) parts.push(line(cmp, 1, 'g-cmp'));
    parts.push(line(rows, 1, 'g-nw'));
    (opts.notes || []).slice(0, 3).forEach((n, i) => { const r = rows.find((q) => q[0] >= n.m) || rows[rows.length - 1]; parts.push(`<g class="g-pin"><circle cx="${x(r[0])}" cy="${y(r[1])}" r="7"/><text x="${x(r[0])}" y="${(+y(r[1]) + 3.5).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`); });
  }
  return `<svg class="t6-graph" viewBox="0 0 ${GW} ${GH}" width="100%" role="img" aria-label="${esc(opts.alt || '')}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
/** The accessible alternative: exactly the timeline values (AC-25). opts.limit rows (the rest behind a button), opts.all */
export function graphTable(tl, opts = {}) {
  const rows = tlRows(tl); if (!rows.length) return '';
  const lim = opts.all ? rows.length : (opts.limit || 12);
  const show = rows.length > lim ? rows.slice(0, lim) : rows;
  const td = (v, money = true) => `<td>${bdi(money ? fmtM(v * 100) : String(v))}</td>`;
  return `<table class="t6-table"><caption>${esc(T6.caption)}</caption><thead><tr>${T6.th.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${show.map((r) => `<tr><th scope="row">${bdi(String(r[0]))}</th>${td(r[1])}${td(r[2])}${td(r[3])}<td>${bdi(fmtM(r[4]))}</td><td>${bdi(fmtM(r[5]))}</td>${td(r[7], false)}${td(r[8], false)}</tr>`).join('')}</tbody></table>
    ${rows.length > lim ? `<button type="button" class="chip t6-allrows" data-t6="rows">${esc(T6.allRows)}</button>` : ''}`;
}
/** graph block with tabs (money / happiness) and the table toggle. Its state lives in data-* (wireSummary re-renders it). */
export function graphBlock(tl, opts = {}) {
  const rows = tlRows(tl); if (!rows.length) return '';
  const id = opts.id || 'g' + Math.random().toString(36).slice(2, 7);
  const series = opts.series || 'money'; const table = !!opts.table;
  const alt = opts.alt || '';
  const notes = (opts.notes || []).slice(0, 3);
  const lg = series === 'happy' ? [['hap', T6.lg.hap], ['en', T6.lg.en]] : [['nw', T6.lg.nw], ['liq', T6.lg.liq], ['low', T6.lg.low], ...((opts.recessions || []).length ? [['rec', T6.lg.rec]] : [])];
  if (opts.compareTl) lg.push(['cmp', opts.compareLabel || T6.lg.orig]);
  const tabs = `<div class="t6-tabs" role="tablist"><button type="button" role="tab" aria-selected="${series === 'money'}" data-t6="tab" data-s="money">${esc(T6.tabMoney)}</button><button type="button" role="tab" aria-selected="${series === 'happy'}" data-t6="tab" data-s="happy">${esc(T6.tabHappy)}</button>
    <button type="button" class="t6-tog" data-t6="table" aria-pressed="${table}">${esc(table ? T6.asGraph : T6.asTable)}</button></div>`;
  const body = table ? graphTable(tl, { all: opts.all }) : graphSvg(tl, { ...opts, series, alt }) + `<p class="t6-legend" aria-hidden="true">${lg.map(([k, t]) => `<span><i class="lg-${k}"></i>${esc(t)}</span>`).join('')}</p>`
    + (notes.length && series === 'money' ? `<ol class="t6-notes">${notes.map((n) => `<li>${bdi('חודש ' + n.m)} ${isoT(n.text)}</li>`).join('')}</ol>` : '');
  return `<section class="t6-graphbox" data-t6g="${esc(id)}" data-series="${series}" data-table="${table ? 1 : 0}">${tabs}${body}</section>`;
}
/** Wire graph tabs / table toggles inside root (call after every render). `get(id)` returns {tl, opts} for a graph id. */
export function wireSummary(root, get) {
  if (!root) return; root.__t6get = get;
  if (root.__t6wired) return; root.__t6wired = true;
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t6]'); if (!b || !root.contains(b)) return;
    const box = b.closest('[data-t6g]'); if (!box) return;
    const src = root.__t6get && root.__t6get(box.dataset.t6g); if (!src) return;
    const st = { series: box.dataset.series, table: box.dataset.table === '1', all: false };
    if (b.dataset.t6 === 'tab') st.series = b.dataset.s;
    if (b.dataset.t6 === 'table') st.table = !st.table;
    if (b.dataset.t6 === 'rows') { st.table = true; st.all = true; }
    box.outerHTML = graphBlock(src.tl, { ...src.opts, id: box.dataset.t6g, ...st });
    const nb = root.querySelector(`[data-t6g="${CSS.escape(box.dataset.t6g)}"]`);
    const f = nb && (b.dataset.t6 === 'rows' ? nb.querySelector('tbody tr:last-child th') : nb.querySelector(b.dataset.t6 === 'tab' ? `[data-s="${st.series}"]` : '[data-t6="table"]'));
    if (f) { if (!f.matches('button')) f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
  });
}

/* ============================================================ the end summary (§6.3 top block, §6.4 more sections) */
/** ghost entries for the comparison: [{id, p (persona), dims, end, atMonth}] from {arch: end} */
export function ghostList(ghosts, personas = PERSONAS_FALLBACK) {
  return ARCH_IDS.map((id) => { const end = ghosts && ghosts[id]; const p = personas[id] || PERSONAS_FALLBACK[id]; return end && !end.error ? { id, p, end, dims: end.recap && end.recap.dims } : { id, p, end: null, dims: null }; });
}
/** the one comparison line under a dimension (§5.2) */
export function compareLine(id, me, gl) {
  const ready = gl.filter((g) => g.dims && g.dims[id]);
  if (!ready.length) return '';
  if (id === 'business' && !(me.facts && me.facts.had) && !ready.some((g) => g.dims.business.facts && g.dims.business.facts.had)) return '';   // nobody ran a business: no place
  const pl = placeOf(id, me, ready);
  if (!pl.best) return '';
  const tieWith = pl.tie ? ready.find((g) => cmpDim(id, g.dims[id], me) === 0) : null;
  const ref = pl.r === 1 && tieWith ? tieWith : pl.best;
  const v = { r: pl.r, of: pl.of, icon: ref.p.icon, name: ref.p.name, short: ref.dims[id].short };
  const t = pl.tie ? fill(T6.placeTie, v) : pl.r === 1 ? fill(T6.placeFirst, v) : fill(T6.place, v);
  return `<small class="t6-cmp">${isoT(t).replace(/מקום (\d+)/, (m0, d) => `מקום ${bdi(d)}`).replace(/מתוך (\d+)/, (m0, d) => `מתוך ${bdi(d)}`)}</small>`;
}
/**
 * #endTop (without the header / stars / sticky buttons, which renderEnd keeps).
 * e = the game:end payload (e.end = engine result, e.t6 = {tl, dims} from game.js). ctx = {ghosts: {arch:end}|null, rivals: 'off'|'pending'|'done'|'none',
 *  personas, rewindAllowed, afterwinAllowed, branchTl, graphId}
 */
export function renderTop(e, ctx = {}) {
  const end = e.end || {}; const t6 = e.t6 || {};
  const tl = (end.recap && end.recap.graph && end.recap.graph.tl) || t6.tl || null;
  const dims = (end.recap && end.recap.dims) || t6.dims || null;
  const out = [];
  if (tl && tlRows(tl).length) {
    const notes = (end.recap && end.recap.graph && end.recap.graph.notes) || [];
    if (end.afterWin && !notes.some((n) => n.kind === 'win')) notes.unshift({ m: end.afterWin.winMonths, kind: 'win', text: T6.winPin });
    out.push(graphBlock(tl, { id: ctx.graphId || 'end', alt: altOf(tl, end), recessions: recessionsOf(end), lowCushion: end.recap && end.recap.graph ? end.recap.graph.lowCushion : null, notes, compareTl: ctx.branchTl || null, compareLabel: T6.lg.orig }));
  }
  if (dims) out.push(dimRowsHtml(dims, ctx));
  const sug = suggestionOf(end);
  if (sug) {
    const cta = ctx.rewindAllowed && sug.k0 != null ? `<button type="button" class="t6-rw" data-act="t6-rewind" data-k0="${int(sug.k0)}">${esc(T6.sugCta)}</button><small class="t6-rwsub">${esc(T6.sugSub)}</small>` : '';
    out.push(`<section class="t6-sug"><b>${esc(T6.sugTitle)}</b><p>${isoT(sug.text)}</p>${cta}</section>`);
  }
  if (ctx.rewindAllowed && ctx.lastGame && !(sug && sug.k0 != null)) out.push(`<button type="button" class="t6-rw t6-rwlast" data-act="t6-moments">${esc(T6.lastCta)}</button><small class="t6-rwsub">${esc(T6.sugSub)}</small>`);
  if (ctx.afterwinAllowed) out.push(`<section class="t6-aw"><button type="button" class="t6-awbtn" data-act="t6-afterwin">${esc(T6.afterwinBtn)}</button><small>${esc(T6.afterwinSub)}</small></section>`);
  return `<div class="t6-top">${out.join('')}</div>`;
}
/** the five rows (re-rendered alone when ghosts finish: bus 'ghosts:done') */
export function dimRowsHtml(dims, ctx = {}) {
  const gl = ghostList(ctx.ghosts, ctx.personas);
  return `<ul class="t6-dims" id="t6Dims">${DIMS.map((d) => {
    const me = dims[d.id]; if (!me) return '';
    const cmp = ctx.rivals === 'done' ? compareLine(d.id, me, gl) : ctx.rivals === 'pending' ? `<small class="t6-cmp pend">${esc(T6.pending)}</small>` : '';
    return `<li class="t6-dim" data-dim="${d.id}"><span class="t6-di" aria-hidden="true">${d.icon}</span><div><b>${esc(d.title)}</b><span class="t6-dh">${isoT(me.headline || '')}</span>${cmp}</div></li>`;
  }).join('')}</ul>`;
}
/** §6.2.3 — the engine's recap.suggestion; until it exists, the engine's own tip (tipFor) with no rewind point */
export function suggestionOf(end) {
  if (end && end.recap && end.recap.suggestion && end.recap.suggestion.text) return end.recap.suggestion;
  if (end && end.tip) return { rule: 4, text: end.tip, k0: null };
  return null;
}
/** "מול היריבים" — the full table (§5.2) + each persona's rule card + lost deals */
export function rivalsSection(e, ctx = {}) {
  const end = e.end || {}; const t6 = e.t6 || {};
  const dims = (end.recap && end.recap.dims) || t6.dims; if (!dims) return '';
  const gl = ghostList(ctx.ghosts, ctx.personas);
  const myM = int(end.months ?? e.months);
  const myTl = (end.recap && end.recap.graph && end.recap.graph.tl) || t6.tl;
  const nwAt = (tl) => { const rows = tlRows(tl); const r = rows.filter((x) => x[0] <= myM).pop(); return r ? fmtM(r[1] * 100) : null; };
  const head = `<tr><th scope="col">${esc(T6.thPlayer)}</th>${DIMS.map((d) => `<th scope="col">${d.icon} ${esc(d.title)}<small>${esc(d.order)}</small></th>`).join('')}<th scope="col">${esc(fill(T6.atMonth, { m: myM }))}</th></tr>`;
  const cell = (dm) => `<td>${dm ? isoT(dm.short) : esc(T6.missing)}</td>`;
  const meRow = `<tr class="me"><th scope="row">${esc(T6.you)}</th>${DIMS.map((d) => cell(dims[d.id])).join('')}<td>${nwAt(myTl) ? bdi(nwAt(myTl)) : esc(T6.missing)}</td></tr>`;
  const gRows = gl.map((g) => `<tr><th scope="row">${g.p.icon} ${esc(g.p.name)}</th>${DIMS.map((d) => cell(g.dims && g.dims[d.id])).join('')}<td>${g.end && g.end.tl && nwAt(g.end.tl) ? bdi(nwAt(g.end.tl)) : esc(T6.missing)}</td></tr>`).join('');
  const cards = gl.map((g) => `<details class="t6-rule"><summary>${g.p.icon} ${esc(g.p.name)} · ${esc(g.p.label)}</summary><p>${esc(g.p.rule)}</p><p><b>${esc(T6.strongP)}</b> ${esc(g.p.strong)}</p><p><b>${esc(T6.weakP)}</b> ${esc(g.p.weak)}</p></details>`).join('');
  const lost = (end.recap && end.recap.rivalDeals) || [];
  const lostHtml = lost.length ? `<h4>${esc(T6.lostDeals)}</h4><ul class="t6-lost">${lost.map((x) => `<li>${bdi('חודש ' + x.m)} ${esc(x.name)} · ${isoT(sgn(x.claimedCf))} ← ${isoT(sgn(x.cf))}</li>`).join('')}</ul>` : '';
  const pend = ctx.rivals === 'pending' ? `<p class="t6-note">${esc(T6.pending)}</p>` : '';
  return `${pend}<div class="t6-scroll"><table class="t6-vs">${head}${meRow}${gRows}</table></div>${cards}${lostHtml}`;
}
const det = (title, body, open = false) => (body ? `<details class="t6-sec" ${open ? 'open' : ''}><summary>${esc(title)}</summary><div class="t6-secb">${body}</div></details>` : '');
/**
 * The collapsed "more" sections (§6.4). ctx adds the existing blocks the lobby already renders:
 * {learnHtml, lifeHtml, analysisHtml, newsHtml, lessonHtml, extraHtml}
 */
export function renderMore(e, ctx = {}) {
  const end = e.end || {}; const R = end.recap || null;
  const gridHtml = R && R.grid ? Object.entries(T6.grid).map(([k, t]) => { const c = R.grid[k]; if (!c) return ''; return `<div class="t6-cell ${k}"><b>${esc(t)}</b><p>${bdi('חודש ' + c.m)} ${esc(c.c || '')}${c.why ? ' — ' + isoT(c.why) : ''}</p>${ctx.rewindAllowed && c.k0 != null ? `<button type="button" class="chip" data-act="t6-rewind" data-k0="${int(c.k0)}">${esc(T6.gridCta)}</button>` : ''}</div>`; }).join('') : '';
  const decs = R && Array.isArray(R.decisions) && R.decisions.length ? `<ol class="t6-decs">${R.decisions.map((d) => `<li>${bdi('חודש ' + d.m)} ${esc(d.c || '')}${d.o ? ' ← ' + esc(d.o) : ''}</li>`).join('')}</ol>` : '';
  const dl = (gridHtml ? `<div class="t6-grid">${gridHtml}</div>` : '') + decs + (ctx.learnHtml || '');
  let crisis = '';
  if (R && 'crisis' in R) {
    const C = R.crisis;
    crisis = !C ? `<p>${esc(T6.noCrisis)}</p>` : `<p><b>${esc(fill('המשבר הגדול: חודשים {from}–{to}', C))}</b></p><p>${isoT(fill('השווי הנקי ירד ב־{depth}. הכרית הכי נמוכה: {x} חודשים (חודש {m}).', { depth: fmtM(C.depth), x: C.trough ? C.trough.cushion : '', m: C.trough ? C.trough.m : '' }))}</p>${(C.responses || []).length ? `<p>מה עשית:</p><ul>${C.responses.map((r) => `<li>${isoT(r.text)}</li>`).join('')}</ul>` : ''}<p>${esc(C.recoveredAt != null ? fill('חזרת לשווי שלפני המשבר אחרי {n} חודשים.', { n: C.recoveredAt - C.to }) : 'עד סוף המשחק לא חזרת לשווי שלפני המשבר.')}</p>`;
  }
  const rivals = ctx.rivals && ctx.rivals !== 'off' ? rivalsSection(e, ctx) : '';
  const secs = [det(T6.sec.dl, dl), det(T6.sec.crisis, crisis), det(T6.sec.rivals, rivals), det(T6.sec.life, ctx.lifeHtml || ''), det(T6.sec.full, ctx.analysisHtml || ''), det(T6.sec.ach, (ctx.newsHtml || '') + (ctx.lessonHtml || ''), !!ctx.achOpen)].filter(Boolean).join('');
  return secs ? `<details class="t6-more" id="t6More"><summary>${esc(T6.more)}</summary>${secs}</details>${ctx.extraHtml || ''}` : (ctx.extraHtml || '');
}
/** §7.6 limits (always shown in the compare sheet; collapsed on the end screen) */
export function limitsHtml(open = false) { return `<details class="t6-limits" ${open ? 'open' : ''}><summary>${esc(T6.limitsTitle)}</summary><ol>${T6.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`; }
/** compact end data kept with rr2-last-game and branch comparisons (§7.2 endLite) */
export function endLite(end, t6 = {}) {
  const e = end || {};
  return { status: e.status, months: e.months, stars: e.stars || 0, recap: { dims: (e.recap && e.recap.dims) || t6.dims || null, graph: { tl: (e.recap && e.recap.graph && e.recap.graph.tl) || t6.tl || null } } };
}
