// World mechanic `holding` — w12 האימפריה (docs/full-upgrade/worlds/w12-empire.md; CATALOG-25 §1.1 / §1.2 / §2.1). A private group of up
// to 8 divisions, each a LIGHT model of an earlier world's driver (re-implemented here, so the packs of w5–w11 stay byte-identical):
// hotels = w5's season curve, industry = w6's condition × utilisation, retail = w7's growth knob, real estate = w8's project pipeline and
// rates, energy = w9's PPA share, finance = w10's factor mix, global = w11's FX basket. The decision is the STRUCTURE between them: a
// division is guaranteed by HQ (cheap debt, but its default moves its debt to HQ, cuts the group rating and raises every guaranteed rate)
// or ring-fenced (+1.5 pp, 30 % of its surplus swept to its lenders, and they can only take the division). Storms are multi-factor shocks
// (growth, rates, energy, FX) with fixed betas per kind. A division's negative month asks HQ for support (it pays the gap, or the gap is added
// to the division's debt); two negative paydays in a row break its covenant: a guaranteed division's lenders call 60 % of its debt from HQ —
// unpaid (no cash, or support declined) it is a GROUP DEFAULT: the debt + 25 % moves to HQ, the rating drops a notch, every other guaranteed
// division in deficit breaches at once (cross-default). A ring-fenced one's lenders ask a 30 % cure; unpaid, they take the division.
//
// Contract (DESIGN §4.2): pure, deterministic, no engine import, only + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws:
// init 16 (per division slot: quality, beta jitter — whoever plays), payday 10 (8 division noises, one per slot, empty slots too · 2 storm:
// start / type, severity), 'Z' landing 4 (template / size · quality · price · health). A division's GROSS value = 100 × its trailing
// 12-month operating profit (the public estimate fills months not yet seen); net worth counts gross − debt, floored at 0 for a ring-fenced one.
export const ID = 'holding';
export const SLOTS = 8;
export const DRAWS = Object.freeze({ init: SLOTS * 2, month: SLOTS + 2, landing: Object.freeze({ Z: 4 }) });
/** Factor order of the betas and storm shocks: growth (G), rates (R), energy price (N), FX (X). */
export const FACTORS = Object.freeze(['G', 'R', 'N', 'X']);
/** Division kinds: home world, base operating profit ₪/month at size 1, factor betas, noise, operating leverage, organic growth a month. */
export const KINDS = Object.freeze({
  tour: Object.freeze({ n: 'מלונות ותיירות', home: 'w5', base: 2000000, beta: [1.2, 0.2, -0.3, 0.4], vol: 0.10, fs: 0.8, g: 0.008, amp: 0.35, drv: 'עונה: הקיץ משלם את החורף' }),
  ind: Object.freeze({ n: 'תעשייה', home: 'w6', base: 2400000, beta: [0.9, 0.3, -1.2, 0.2], vol: 0.06, fs: 1.0, g: 0.007, decay: 0.8, drv: 'מצב המכונות × ניצולת' }),
  ret: Object.freeze({ n: 'קמעונאות', home: 'w7', base: 1800000, beta: [0.8, 0.4, -0.2, 0.3], vol: 0.05, fs: 0.6, g: 0.010, drv: 'צמיחה: עוד סניפים' }),
  re: Object.freeze({ n: 'נדל"ן', home: 'w8', base: 1600000, beta: [0.3, 1.3, 0, 0], vol: 0.02, fs: 0.2, g: 0.006, pipe: 0.05, drv: 'פרויקט בכל שנתיים, רגיש לריבית' }),
  en: Object.freeze({ n: 'אנרגיה', home: 'w9', base: 2200000, beta: [0.2, 0.6, 1.0, 0], vol: 0.04, fs: 0.4, g: 0.007, drv: '70% בחוזה קבוע (PPA), השאר במחיר השוק' }),
  fin: Object.freeze({ n: 'פיננסים', home: 'w10', base: 2000000, beta: [1.6, 0.8, 0, 0.3], vol: 0.14, fs: 0.3, g: 0.009, drv: 'תיק השקעות: זז עם השוק' }),
  glo: Object.freeze({ n: 'סחר בינלאומי', home: 'w11', base: 2200000, beta: [0.7, 0.2, -0.2, 1.2], vol: 0.07, fs: 0.5, g: 0.009, drv: 'סל מטבעות' }),
  trophy: Object.freeze({ n: 'חטיבת יוקרה', home: 'w12', base: 1800000, beta: [1.1, 0.5, 0, 0.3], vol: 0.08, fs: 1.3, g: 0, drv: 'מעמד, לא רווח' }),
});
/** Division templates (fictional names; tools/validate-worlds.mjs H-fict): kind + a one-line description. */
export const TEMPLATES = Object.freeze([
  Object.freeze({ n: 'מלונות חוף הזהב', kind: 'tour', d: 'רשת מלונות על החוף. הקיץ מלא, החורף ריק.' }), Object.freeze({ n: 'נופש הר הצפון', kind: 'tour', d: 'אתרי נופש בהרים. עונה כפולה: קיץ וחורף.' }),
  Object.freeze({ n: 'יציקות עמק הברזל', kind: 'ind', d: 'מפעל יציקה ותיק. המכונות צריכות טיפול.' }), Object.freeze({ n: 'פולימר הדרום', kind: 'ind', d: 'מפעל פלסטיק. אנרגיה היא שליש מהעלות.' }),
  Object.freeze({ n: 'רשת בית־ושוק', kind: 'ret', d: 'רשת חנויות לבית בערים בינוניות.' }), Object.freeze({ n: 'אופנת קו־ישר', kind: 'ret', d: 'רשת אופנה שגדלה מהר.' }),
  Object.freeze({ n: 'נכסי מגדלור', kind: 're', d: 'בנייני משרדים מושכרים ופרויקט בבנייה.' }), Object.freeze({ n: 'קריית אבן־שושן', kind: 're', d: 'שכונת מגורים להשכרה.' }),
  Object.freeze({ n: 'אנרגיה ירוקה נגב', kind: 'en', d: 'שדות סולאריים, רובם בחוזה ארוך.' }), Object.freeze({ n: 'רוח הגבעות', kind: 'en', d: 'טורבינות רוח ומאגר סוללות.' }),
  Object.freeze({ n: 'בית השקעות צפירה', kind: 'fin', d: 'בית השקעות קטן. מרוויח כשהשוק עולה.' }), Object.freeze({ n: 'אשראי לעסקים תבור', kind: 'fin', d: 'הלוואות לעסקים קטנים.' }),
  Object.freeze({ n: 'סחר ימי אלמוג', kind: 'glo', d: 'יבוא ויצוא בחמישה מטבעות.' }), Object.freeze({ n: 'גלובוס לוגיסטיקה', kind: 'glo', d: 'שילוח ומחסנים בשלוש יבשות.' }),
  Object.freeze({ n: 'מועדון הכתר', kind: 'trophy', d: 'מלון יוקרה בבירה עם שם מפורסם. מעמד גדול — רווח קטן.' }), Object.freeze({ n: 'רשת עיתוני השחר', kind: 'trophy', d: 'קבוצת עיתונים ותיקה עם השפעה. ההכנסות יורדות.' })]);
/** Storms (CATALOG §1.4 w12 events): shocks per factor at severity 1, months. */
export const STORMS = Object.freeze([
  Object.freeze({ id: 'recession', n: 'מיתון רב־מדינתי', sh: [-0.36, -0.08, 0, -0.08], len: 5 }), Object.freeze({ id: 'rates', n: 'זינוק בריבית', sh: [-0.06, -0.26, 0, 0], len: 4 }),
  Object.freeze({ id: 'energy', n: 'משבר אנרגיה', sh: [-0.05, 0, 0.3, 0], len: 3 }), Object.freeze({ id: 'fx', n: 'משבר מטבע', sh: [-0.04, 0, 0, -0.3], len: 3 }),
  Object.freeze({ id: 'boom', n: 'פריחה', sh: [0.12, 0.04, 0, 0.04], len: 4 }), Object.freeze({ id: 'credit', n: 'משבר אשראי עולמי', sh: [-0.3, -0.2, 0, -0.1], len: 4 })]);
/** Group credit rating: the annual rate of guaranteed debt per notch (ring-fenced debt pays + rfPrem). */
export const RATINGS = Object.freeze(['AA', 'A', 'BBB', 'BB', 'B', 'CCC']);
export const RATES = Object.freeze([0.045, 0.05, 0.055, 0.06, 0.07, 0.085]);
export const HD = Object.freeze({ mult: 100, rfPrem: 0.015, amort: 0.003, hqFixed: 800000, structFee: 0.005, sellAt: 0.92, forced: 0.85, growCost: 0.05, growUp: 0.08, growEvery: 6, fixCost: 0.02, fixUp: 25, fixEvery: 6,
  svcCost: 60000000, svcUp: 0.03, insPrem: 0.00015, insCover: 0.35, bond: 100000000, bondCap: 3, bondSpread: -0.005, bondMonths: 60, covenant: 1.2, breach: 0.01, stormP: 0.10, down: 0.4,
  hqSpread: 0.02, hqAmort: 0.01, callG: 0.6, callR: 0.3, penalty: 0.25, gHealth: 60, gBeta: 1.3, sweep: 0.3, cut: 0.4, divMin: 0.03, divHigh: 0.03, fee: 0.004, minFee: 1000000, maxSize: [0.6, 1.4] });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const r100k = (x) => Math.round(x / 100000) * 100000;
const round2 = (x) => Math.round(x * 100) / 100;
const HS = (st) => st.world.hd;
const KO = (k) => KINDS[k] || KINDS.ret;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function range(x, w, u, a, b) { const lo = clamp(round2(x - w * u), a, b); return { lo, hi: clamp(round2(lo + 2 * w), a, b) }; }
/** Triangle wave in [−1, 1], period 12, peak in mid-summer (the w5 season curve, light). */
const season = (m) => 1 - 4 * Math.abs(frac((m + 4) / 12) - 0.5);
const effOf = (d) => (d.kind === 'ind' ? 0.4 + 0.6 * d.health / 100 : 0.6 + 0.4 * d.health / 100);
export const divOf = (st, p) => HS(st).divs.find((d) => d.sid === +String(p || '').replace(/^d/, '')) || null;
const divAsset = (st, d) => st.assets.find((a) => a.id === d.sid) || null;
const debtOf = (st, d) => { const a = divAsset(st, d); return a ? a.debt || 0 : 0; };
export const rateOf = (st, d) => RATES[HS(st).rating] + (d.struct === 'r' ? HD.rfPrem : 0);
const avgOp = (d) => { const n = d.h.length; let x = 0; for (const v of d.h) x += v; return (x + (12 - n) * d.est) / 12; };
export const grossOf = (st, d) => r100k(HD.mult * Math.max(0, avgOp(d)));
/** One month of a division's debt service at today's rate: interest + 0.3 % of the debt. */
const serviceOf = (st, d) => { const D = debtOf(st, d); return Math.round(D * rateOf(st, d) / 12 + D * HD.amort); };
/** The storm's shock vector this month (decays linearly over its months). */
function shockOf(st) { const M = HS(st); const s = M.storm; if (!s || s.left <= 0) return [0, 0, 0, 0]; const S = STORMS[s.i]; const k = s.sev * s.left / S.len; return S.sh.map((x) => x * k); }
/** The light model of the division's home world × the storm (× its betas) — the month's demand multiplier before noise. */
function lightOf(st, d, sh) { const K = KO(d.kind); let L = 1;
  if (d.kind === 'tour') L = 1 + K.amp * season(st.month);
  let b = 1; for (let i = 0; i < 4; i++) b += d.beta[i] * sh[i];
  return clamp(L * b, 0.1, 1.8); }
const opFrom = (st, d, dem) => { const K = KO(d.kind); return d.base * effOf(d) * ((1 + K.fs) * dem - K.fs) * (HS(st).svc ? 1 + HD.svcUp : 1); };
/** Group service a month: guaranteed divisions + HQ debt + bonds (the coverage denominator). */
export function groupService(st) { const M = HS(st); let s = 0; for (const d of M.divs) if (d.struct === 'g') s += serviceOf(st, d);
  s += Math.round(M.hqDebt * ((RATES[M.rating] + HD.hqSpread) / 12 + HD.hqAmort)); for (const b of M.bonds) s += Math.round(b.amt * (b.rate + (M.breach ? HD.breach : 0)) / 12); return s; }
/** Liquidity coverage in months of group service (12 = coverage 1.0: HQ cash ÷ the next 12 months' guaranteed debt service). */
export function covMonths(st) { const s = groupService(st); return s > 0 ? Math.min(99, round2(Math.max(0, st.cash) / s)) : 99; }
const hqMonthly = (st) => { const M = HS(st); let x = HD.hqFixed + Math.round(M.hqDebt * ((RATES[M.rating] + HD.hqSpread) / 12 + HD.hqAmort)); for (const b of M.bonds) x += Math.round(b.amt * (b.rate + (M.breach ? HD.breach : 0)) / 12);
  if (M.ins) x += Math.round(HD.insPrem * M.divs.reduce((y, d) => y + grossOf(st, d), 0)); return x; };
const reserveOf = (st) => 15 * groupService(st) + 10000000;
function revalue(st) { for (const d of HS(st).divs) { const a = divAsset(st, d); if (a) a.value = grossOf(st, d); } }
function newDiv(st, spec) { const M = HS(st); const used = new Set(M.divs.map((d) => d.slot)); let slot = 0; while (used.has(slot)) slot++;
  const t = TEMPLATES[spec.t]; const K = KO(t.kind); const j = spec.j || 0;
  return { sid: 0, slot, t: spec.t, kind: t.kind, n: t.n, est: spec.est, base: spec.base, lo: spec.lo, hi: spec.hi, h: [], struct: spec.struct || 'g', sup: true, health: spec.health,
    beta: K.beta.map((b, i) => round2(b * (0.85 + 0.3 * frac(j * (7 + 6 * i))))), miss: 0, grew: -99, fixed: -99, at: st.month, paid: spec.paid || 0, debt0: spec.debt || 0, last: null }; }
function dropDiv(st, d, out) { const M = HS(st); const a = divAsset(st, d); M.divs.splice(M.divs.indexOf(d), 1); if (a) { st.assets.splice(st.assets.indexOf(a), 1); out.despawn.push('a' + a.id); } }
function defaultOf(st, d, out, ctx) { const M = HS(st); const a = divAsset(st, d); const D = a ? a.debt : 0;
  if (d.struct === 'r') { M.lost++; dropDiv(st, d, out); ctx.lesson(st, out, 'ring_fence');
    out.news.push({ kind: 'hd', text: ctx.mentorLine(st, 'lost', { name: d.n }) || `${d.n} קרסה. היא הייתה מגודרת: הבנקים לקחו את החטיבה ואת החוב שלה — ולא נגעו בשאר הקבוצה.` }); return; }
  const pen = r100k(D * HD.penalty); M.hqDebt += D + pen; M.penalties += pen; if (a) a.debt = 0; M.rating = Math.min(RATINGS.length - 1, M.rating + 1); M.defaults++; M.lastDef = st.stats.paydays; d.miss = 0; d.health = Math.min(d.health, 30); d.sup = true;
  if (st.life) st.life.happiness = clamp(st.life.happiness - 6, 0, 100); ctx.lesson(st, out, 'contagion');
  for (const x of M.divs.slice()) if (x !== d && x.struct === 'g' && x.miss > 0) breachOf(st, x, out, ctx); // cross-default: every guaranteed division already in deficit breaches now
  out.news.push({ kind: 'hd', text: ctx.mentorLine(st, 'default', { name: d.n, amount: ctx.fmtM(D), rating: RATINGS[M.rating] }) || `${d.n} לא עמדה בחוב, והמטה ערב לה: ${ctx.fmtM(D)} עברו למטה, ועוד ${ctx.fmtM(pen)} קנסות פירעון מוקדם. הדירוג ירד ל־${RATINGS[M.rating]} — וכל חוב בערבות מתייקר.` }); }

/** A storm starts (a payday draw, a market card or a crisis card). out = null from a card (its text says it). */
function startStorm(st, i, sev, out, ctx) { const M = HS(st); const S = STORMS[i]; M.storm = { i, sev: round2(sev), left: S.len, at: st.month }; M.storms++; if (!out) return;
  const hit = M.divs.filter((d) => d.beta.reduce((x, b, k) => x + b * S.sh[k], 0) < -0.05).length;
  out.news.push({ kind: 'hd', text: ctx.mentorLine(st, 'storm', { name: S.n, n: hit }) || `${S.n}: ${S.len} חודשים. ${hit ? hit + ' חטיבות שלך חשופות.' : 'החטיבות שלך לא חשופות במיוחד.'}` }); if (hit >= 2) ctx.lesson(st, out, 'stable_group'); }
/** Every 12 paydays: the board's dividend and the rating review. */
function annual(st, out, ctx) { const M = HS(st); const nw = Math.max(0, ctx.netWorth(st)); const min = M.divMin + 0.01 * M.pressure;
  const pct = M.divPol === 'skip' ? 0 : M.divPol === 'high' ? min + HD.divHigh : min; const due = r100k(nw * pct); const pay = Math.min(due, r100k(Math.max(0, st.cash)));
  if (pay > 0) { st.cash -= pay; M.divPaid += pay; ctx.cashFx(out, -pay, `דיבידנד לדירקטוריון ${ctx.fmtM(pay)}`); }
  if (pay >= r100k(nw * min)) { if (M.pressure > 0) M.pressure--; }
  else { M.pressure++; if (st.life) st.life.happiness = clamp(st.life.happiness - 8, 0, 100); out.news.push({ kind: 'hd', text: `הדירקטוריון קיבל פחות מהמינימום השנה. הלחץ עולה: בשנה הבאה המינימום ${Math.round((min + 0.01) * 100)}%.` }); }
  review(st, out); }
function review(st, out) { const M = HS(st); const c = covMonths(st) / 12; const was = M.rating;
  if (c < 1) M.rating = Math.min(RATINGS.length - 1, M.rating + 1); else if (c >= 1.5 && st.stats.paydays - (M.lastDef || -99) >= 12 && M.rating > 0) M.rating--;
  if (M.rating !== was && out) out.news.push({ kind: 'hd', text: `סוכנות הדירוג: ${RATINGS[was]} → ${RATINGS[M.rating]} (כיסוי נזילות ${round2(c)}).` }); }

/** Two negative paydays in a row break the division's covenant: the lenders of a guaranteed one call 60 % of its debt from HQ (or the
 *  group defaults); a ring-fenced one's lenders ask a 30 % cure — HQ may pay it (support on, cash enough) or they take the division. */
function breachOf(st, d, out, ctx) { const M = HS(st); const a = divAsset(st, d); const cure = r100k((a ? a.debt : 0) * (d.struct === 'g' ? HD.callG : HD.callR)); d.miss = 0;
  if (d.sup && st.cash >= cure) { st.cash -= cure; if (a) a.debt -= cure; M.calls++; M.cured += cure; ctx.cashFx(out, -cure, `${d.struct === 'g' ? 'הערבות הופעלה' : 'ריפוי הפרה'}: ${ctx.fmtM(cure)}`);
    out.news.push({ kind: 'hd', text: d.struct === 'g' ? `${d.n} הפרה את התנאים של הבנקים, והם הפעילו את ערבות המטה: ${ctx.fmtM(cure)} מהקופה של המטה.` : `${d.n} הפרה את התנאים. המטה שילם ${ctx.fmtM(cure)} כדי שהבנקים לא ייקחו אותה.` }); return; }
  defaultOf(st, d, out, ctx); }
export const holding = {
  id: ID, draws: DRAWS,
  lessons: ['contagion', 'ring_fence', 'stable_group'],
  mentorKeys: ['storm', 'default', 'lost', 'acqAsk', 'acqDd'],
  sealed: ['world.hd.divs[].base', 'world.hd.inits', 'pending.item.sealed', 'pending.wr'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 16 'world' draws at init, whoever plays
    const S = (ch && ch.start) || {};
    st.world.hd = { divs: [], storm: null, rating: S.rating ?? 1, hqDebt: 0, bonds: [], breach: 0, ins: 0, svc: 0, divPol: 'min', divMin: S.divMin || HD.divMin, growF: S.growF || 1, deal: S.deal || 1,
      pressure: 0, defaults: 0, lastDef: 0, lost: 0, calls: 0, cured: 0, penalties: 0, sold: 0, storms: 0, restruct: 0, supported: 0, insPaid: 0, divPaid: 0, inits: rs, start: [] };
    const M = st.world.hd;
    (S.divs || []).forEach((x, i) => { const t = TEMPLATES[x.t]; const est = r1000(KO(t.kind).base * x.size); const q = 0.9 + 0.2 * rs[2 * i]; const h = x.health ?? 80;
      const d = newDiv(st, { t: x.t, est, base: Math.round(est * q / (t.kind === 'ind' ? 0.4 + 0.6 * h / 100 : 0.6 + 0.4 * h / 100)), lo: r1000(est * 0.9), hi: r1000(est * 1.1), struct: x.struct, health: h, j: rs[2 * i + 1], debt: r100k(HD.mult * est * x.debt) });
      M.divs.push(d); M.start.push(d); });
  },
  defaults(st) { const M = HS(st); if (!M) return; if (!Array.isArray(M.bonds)) M.bonds = []; if (!Array.isArray(M.start)) M.start = []; for (const k of ['hqDebt', 'calls', 'cured', 'penalties', 'pressure', 'defaults', 'lastDef', 'lost', 'sold', 'storms', 'restruct', 'supported', 'insPaid', 'divPaid']) if (typeof M[k] !== 'number') M[k] = 0; },

  monthly(st, out, ctx) {
    const M = HS(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 10 'world' draws every payday
    if (M.storm) { M.storm.left--; if (M.storm.left <= 0) M.storm = null; }
    const s0 = rs[SLOTS], s1 = rs[SLOTS + 1];
    if (!M.storm && s0 < HD.stormP) startStorm(st, Math.floor(frac(s0 * 977) * STORMS.length), 0.7 + 0.9 * s1 + (s1 > 0.75 ? 0.8 : 0), out, ctx);
    const sh = shockOf(st); let lossNo = 0;
    for (const d of M.divs.slice()) {
      const K = KO(d.kind); const a = divAsset(st, d); const r = rs[d.slot];
      const noise = 1 + K.vol * (2 * r - 1); const op = Math.round(opFrom(st, d, lightOf(st, d, sh)) * noise); const calm = opFrom(st, d, lightOf(st, d, [0, 0, 0, 0])) * noise;
      if (calm > op) lossNo += calm - op;
      const D = a ? a.debt : 0; const svc = serviceOf(st, d); const prin = Math.min(D, Math.round(D * HD.amort)); const net = Math.round((op - svc) / 10) * 10;
      d.h.push(op); while (d.h.length > 12) d.h.shift(); d.last = { op, net, svc, dem: round2(lightOf(st, d, sh)) };
      if (a) a.debt = D - prin;
      if (net >= 0) { let cf = net; if (d.struct === 'r' && a && a.debt > 0) { const sw = Math.min(a.debt, Math.round(net * HD.sweep / 10) * 10); a.debt -= sw; cf -= sw; } // ring-fenced lenders sweep part of the surplus
        if (a) a.op.cf = cf; d.miss = 0; d.health = clamp(d.health + 0.4 - (K.decay || 0.3), 0, 100); }
      else { if (a) a.op.cf = 0; const gap = -net; d.miss++;
        if (d.sup && st.cash >= gap) { st.cash -= gap; M.supported += gap; d.health = clamp(d.health - 1.5, 0, 100); ctx.cashFx(out, -gap, `תמיכה ב${d.n} ${ctx.fmtM(gap)}`); }
        else { d.health = clamp(d.health - 6, 0, 100); if (a) a.debt += gap; // arrears are added to the division's debt
          out.news.push({ kind: 'hd', text: `${d.n} בגירעון של ${ctx.fmtM(gap)} ${d.sup ? 'והמטה לא יכול לכסות' : 'בלי תמיכה מהמטה'}.` }); }
        if (d.miss >= 2) breachOf(st, d, out, ctx); }
      d.base = Math.round(d.base * (1 + K.g)); d.est = Math.round(d.est * (1 + K.g));
      if (K.pipe && st.month > d.at && (st.month - d.at) % 24 === 0) { d.base = Math.round(d.base * (1 + K.pipe)); d.est = Math.round(d.est * (1 + K.pipe)); }
    }
    if (M.ins && lossNo > 0) { const pay = r1000(lossNo * HD.insCover); st.cash += pay; M.insPaid += pay; ctx.cashFx(out, pay, `ביטוח הקבוצה ${ctx.fmtM(pay)}`); }
    if (M.hqDebt > 0) M.hqDebt = Math.max(0, M.hqDebt - Math.round(M.hqDebt * HD.hqAmort));
    for (const b of M.bonds.slice()) if (st.month >= b.due) { st.cash -= b.amt; M.bonds.splice(M.bonds.indexOf(b), 1); ctx.cashFx(out, -b.amt, `פירעון אג"ח ${ctx.fmtM(b.amt)}`); }
    M.breach = M.bonds.length && covMonths(st) < 12 * HD.covenant ? 1 : 0;
    const pd = st.stats.paydays; if (pd > 0 && pd % 12 === 0) annual(st, out, ctx);
    if (st.cash < 0) ctx.ensureCash(st, out, 'holding');
    revalue(st);
  },
  asset: {
    create(st, a, card) { const op = card.op || {}; const M = HS(st); let d = null;
      if (op.start != null) d = M.start[op.start] || null; else if (op.make) { d = newDiv(st, op.make); M.divs.push(d); }
      a.op = { ck: 'div', cf: 0 }; if (d) { d.sid = a.id; a.n = d.n; a.k = 'd_' + d.kind; a.debt = d.debt0; a.value = grossOf(st, d); a.op.cf = Math.max(0, Math.round((d.est - d.debt0 * (rateOf(st, d) / 12 + HD.amort)) / 10) * 10); } },
    cf(st, a) { return a.op && a.op.ck === 'div' ? a.op.cf || 0 : Math.round((a.cf || 0) / 10) * 10; },
  },
  expense(st) { return hqMonthly(st); },
  liability(st) { const M = HS(st); return M.hqDebt + M.bonds.reduce((x, b) => x + b.amt, 0); },
  /** Limited liability: a ring-fenced division never counts below zero (its lenders can only take the division). */
  worth(st) { let v = 0; for (const d of HS(st).divs) if (d.struct === 'r') v += Math.max(0, debtOf(st, d) - grossOf(st, d)); return v; },
  market: {
    create(st, p) { const c = p.card; const M = HS(st);
      if (c.mk === 'recession') startStorm(st, 0, 1.2, null);
      if (c.mk === 'energy') startStorm(st, 2, 1.1, null);
      if (c.mk === 'boom') startStorm(st, 4, 1, null);
      if (c.mk === 'review') { const was = M.rating; review(st, null); p.was = was; p.now = M.rating; }
      if (c.mk === 'antitrust' && M.divs.length >= 6) { const d = M.divs.slice().sort((x, y) => grossOf(st, y) - grossOf(st, x) || x.slot - y.slot)[0]; const v = r100k(grossOf(st, d) * HD.forced); const D = debtOf(st, d);
        p.hit = d.n; p.amount = v - D; dropDiv(st, d, { despawn: [] }); st.cash += v - D; M.sold++; }
    },
    describe(st, p, ev) { const M = HS(st); ev.data.hd = { mk: p.card.mk, storm: M.storm ? STORMS[M.storm.i].id : null, rating: RATINGS[M.rating], was: p.was != null ? RATINGS[p.was] : null, hit: p.hit || null, amount: p.amount || 0 }; },
  },
  crisis: {
    create(st, p) { const c = p.card; const M = HS(st);
      if (c.mk === 'succession') { M.pressure++; if (st.life) st.life.happiness = clamp(st.life.happiness - 10, 0, 100); }
      if (c.mk === 'cyber') { const x = M.svc ? 6000000 : 2000000; st.cash -= x; p.hit = x; }
    },
  },
  tiles: {
    Z: {
      safe: 'pass',
      create(st, ctx) {
        const rs = []; for (let i = 0; i < DRAWS.landing.Z; i++) rs.push(ctx.draw(st)); // exactly 4 'world' draws on every landing
        const M = HS(st); const ti = Math.floor(frac(rs[0] * 13) * TEMPLATES.length); const t = TEMPLATES[ti]; const K = KO(t.kind);
        const size = (HD.maxSize[0] + (HD.maxSize[1] - HD.maxSize[0]) * frac(rs[0] * 101)) * (1 + st.month / 72); // bigger deals as the years pass (I6)
        const est = r1000(K.base * size); const q = t.kind === 'trophy' ? 0.35 + 0.35 * rs[1] : 0.7 + 0.55 * rs[1]; const health = Math.round(45 + 50 * rs[3]);
        const base = Math.round(est * q / (t.kind === 'ind' ? 0.4 + 0.6 * health / 100 : 0.6 + 0.4 * health / 100));
        const price = r100k(HD.mult * est * M.deal * (0.88 + 0.22 * rs[2])); const br = range(q, 0.22, 2 * frac(rs[1] * 31), 0.2, 1.6);
        return { wr: rs, item: { t: ti, est, price, health, lo: r1000(est * br.lo), hi: r1000(est * br.hi), dd: false, sealed: { base, q: round2(q), j: rs[1] } } };
      },
      describe(st, p, ev, ctx) {
        const M = HS(st); const it = p.item; const t = TEMPLATES[it.t]; const K = KO(t.kind); const down = r100k(it.price * HD.down); const debt = it.price - down;
        const fee = Math.max(HD.minFee, r100k(it.price * HD.fee)); const full = M.divs.length >= SLOTS; const mid = (it.lo + it.hi) / 2;
        const svcG = Math.round(debt * (RATES[M.rating] / 12 + HD.amort)); const svcR = Math.round(debt * ((RATES[M.rating] + HD.rfPrem) / 12 + HD.amort)); const budget = Math.max(0, st.cash - reserveOf(st));
        const fair = (x) => r100k(HD.mult * x);
        ev.tag = 'חטיבה למכירה'; ev.title = `${t.n} · ${K.n}`;
        ev.text = `${t.d} רווח תפעולי של ${ctx.fmtM(it.lo)}–${ctx.fmtM(it.hi)} בחודש. המחיר: ${ctx.fmtM(it.price)} (${Math.round(HD.down * 100)}% מהמטה, השאר חוב על החטיבה).`;
        ev.mentor = it.dd ? ctx.mentorLine(st, 'acqDd', {}) || 'הבדיקה צמצמה את הטווח. עכשיו שתי שאלות: המחיר מתחת לשווי — והאם המטה ערב לחוב שלה?' : ctx.mentorLine(st, 'acqAsk', {}) || 'טווח רחב: המוכר יודע כמה החטיבה באמת מרוויחה, אתה לא. ושאלה שנייה: אם היא תיפול — מי משלם את החוב שלה?';
        ev.data = { kind: t.kind, kindName: K.n, home: K.home, driver: K.drv, beta: K.beta, est: it.est, lo: it.lo, hi: it.hi, price: it.price, down, debt, health: it.health, dd: it.dd, fee, budget, slotsFree: SLOTS - M.divs.length,
          fairLo: fair(it.lo), fairHi: fair(it.hi), rateG: RATES[M.rating], rateR: RATES[M.rating] + HD.rfPrem, trophy: t.kind === 'trophy',
          note: 'השווי בספרים: 100 חודשי רווח לפי מה שהחטיבה תרוויח בפועל — לא לפי המחיר ששילמת. בערבות: ריבית זולה, אבל אם היא נופלת החוב שלה עובר למטה.' };
        const F = ctx.loanFor(st, down);
        ev.options = [ctx.opt('buy', `לקנות בערבות המטה (${ctx.fmtM(down)} עכשיו, ריבית ${Math.round(RATES[M.rating] * 1000) / 10}%)`, !full && F.ok, { kind: 'buy', amount: down, price: it.price, loanAmount: F.need, reason: full ? 'אפשר להחזיק עד 8 חטיבות' : F.ok ? undefined : 'הבנק לא נותן הלוואה כזו',
          preview: { cash: -down, monthly: r1000(mid) - svcG, months: 0, risk: it.dd ? 'contagion' : 'unknown' } }),
          ctx.opt('buyRf', `לקנות מגודרת (${ctx.fmtM(down)} עכשיו, ריבית ${Math.round((RATES[M.rating] + HD.rfPrem) * 1000) / 10}%)`, !full && F.ok, { kind: 'buy', amount: down, price: it.price, loanAmount: F.need, reason: full ? 'אפשר להחזיק עד 8 חטיבות' : F.ok ? undefined : 'הבנק לא נותן הלוואה כזו',
            preview: { cash: -down, monthly: r1000(mid) - svcR, months: 0, risk: it.dd ? null : 'unknown' } }),
          ctx.opt('dd', `לבדוק קודם (${ctx.fmtM(fee)})`, !it.dd && st.cash >= fee, { kind: 'inspect', amount: fee, preview: { cash: -fee, monthly: 0, months: 0, risk: null } }), ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
        const fits = !full && F.ok && !F.need && down <= budget; const safe = it.health >= 70 && K.beta[0] < 1;
        const pick = !fits ? 'pass' : !it.dd ? (st.cash >= fee + reserveOf(st) ? 'dd' : 'pass') : fair(it.lo) >= it.price * 0.95 ? (safe ? 'buy' : 'buyRf') : 'pass';
        ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick;
      },
      choose(st, p, o, params, out, ctx) {
        const M = HS(st); const it = p.item; const t = TEMPLATES[it.t];
        if (o.id === 'pass') { ctx.logDecision(st, 'חטיבה למכירה', 'ויתר'); return true; }
        if (o.id === 'dd') { const fee = Math.max(HD.minFee, r100k(it.price * HD.fee)); if (it.dd || st.cash < fee) return true; st.cash -= fee; ctx.cashFx(out, -fee, `בדיקת נאותות ${ctx.fmtM(fee)}`); it.dd = true;
          const b = range(it.sealed.q, 0.06, 2 * frac(it.sealed.j * 71), 0.2, 1.6); it.lo = r1000(it.est * b.lo); it.hi = r1000(it.est * b.hi); ctx.logDecision(st, 'חטיבה למכירה', 'בדק'); return false; } // the card stays open
        if (M.divs.length >= SLOTS) return true;
        const down = r100k(it.price * HD.down);
        const card = { k: 'd_' + t.kind, n: t.n, d: t.d, cost: it.price, down, value: it.price, cf: 0, op: { ck: 'div', make: { t: it.t, est: it.est, base: it.sealed.base, lo: it.lo, hi: it.hi, health: it.health, j: it.sealed.j, struct: o.id === 'buyRf' ? 'r' : 'g', debt: it.price - down, paid: it.price } } };
        const a = ctx.buy(st, card, out, { label: t.n }); if (!a) { out.mentor = 'הבנק לא נתן הלוואה.'; return true; }
        ctx.logDecision(st, 'חטיבה למכירה', o.id === 'buyRf' ? 'קנה מגודרת' : 'קנה בערבות', it.price); return true;
      },
    },
  },
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const M = HS(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; const d = a ? M.divs.find((x) => x.sid === a.id) : null; if (!d) continue;
    m.kind2 = d.kind; m.home = KO(d.kind).home; m.struct = d.struct; m.cable = d.struct === 'g'; m.fence = d.struct === 'r'; m.health = Math.round(d.health); m.distress = d.miss > 0; m.support = d.sup;
    m.stormHit = !!(M.storm && d.beta.reduce((x, b, k) => x + b * STORMS[M.storm.i].sh[k], 0) < -0.05); } },
  recapHint(st) { const M = HS(st); if (!M) return null; if (M.defaults >= 1) return 'בפעם הבאה: לגדר חטיבה חלשה לפני שהיא נופלת. ערבות זולה עד היום שבו היא עוברת לכולם.'; if (M.divPaid > 0 && M.divPol === 'high') return 'בפעם הבאה: דיבידנד במינימום. כל שקל שיוצא הוא שקל שלא יכסה את הסערה הבאה.';
    if (M.lost >= 2) return 'בפעם הבאה: לתמוך בחטיבה שעוד אפשר להציל — או למכור אותה לפני שהיא קורסת.'; return null; },
  goalValue(st, key) { const M = HS(st); if (key === 'lastEvent:default') return M.lastDef || 0; if (key === 'liqMonths') return covMonths(st); if (key === 'liquid') return Math.max(0, st.cash); if (key === 'fixedMonth') return groupService(st);
    if (key === 'coverage') return round2(covMonths(st) / 12); if (key === 'defaults') return M.defaults; return 0; },
  starGates(st) { const M = HS(st); return M && M.restruct ? [{ id: 'restructure', stars: 2, ok: false, label: 'הסדר חוב עם הבנקים: לכל היותר כוכב אחד' }] : []; },
};

const canGrow = (st, d) => st.month - d.grew >= HD.growEvery;
const canFix = (st, d) => st.month - d.fixed >= HD.fixEvery;
holding.act = {
  structure(st, p, out, ctx) { const d = divOf(st, p); if (!d) return fail(out, 'bad_param'); if (d.miss > 0 && d.struct === 'g') return fail(out, 'הבנקים לא מגדרים חטיבה בגירעון'); const fee = r100k(debtOf(st, d) * HD.structFee);
    if (st.cash < fee) return fail(out, 'אין מספיק מזומן'); st.cash -= fee; if (fee) ctx.cashFx(out, -fee, `שינוי מבנה ${ctx.fmtM(fee)}`); d.struct = d.struct === 'g' ? 'r' : 'g'; ctx.lesson(st, out, 'ring_fence');
    out.toast = d.struct === 'r' ? `${d.n} מגודרת עכשיו: ריבית גבוהה ב־1.5%, אבל אם היא נופלת — היא לא מושכת איתה את הקבוצה.` : `המטה ערב עכשיו לחוב של ${d.n}: ריבית זולה יותר, והסיכון שלה הוא עכשיו של כולם.`; return true; },
  support(st, p, out) { const d = divOf(st, p); if (!d) return fail(out, 'bad_param'); d.sup = !d.sup; out.toast = d.sup ? `המטה יכסה את הגירעונות של ${d.n}.` : `המטה לא יכסה יותר את ${d.n}. שני חודשים בגירעון — והיא ${d.struct === 'r' ? 'הולכת לבנקים' : 'בחדלות פירעון, והחוב שלה עובר למטה'}.`; return true; },
  grow(st, p, out, ctx) { const M = HS(st); const d = divOf(st, p); if (!d) return fail(out, 'bad_param'); if (!canGrow(st, d)) return fail(out, 'השקעה אחת בשנה'); const c = r100k(grossOf(st, d) * HD.growCost);
    if (st.cash < c) return fail(out, 'אין מספיק מזומן'); st.cash -= c; d.grew = st.month; const up = HD.growUp * M.growF; d.base = Math.round(d.base * (1 + up)); d.est = Math.round(d.est * (1 + up)); d.paid += c; ctx.cashFx(out, -c, `השקעה ב${d.n} ${ctx.fmtM(c)}`);
    out.toast = `${ctx.fmtM(c)} הושקעו ב${d.n}: הרווח צפוי לעלות ב־${Math.round(up * 100)}%.`; return true; },
  fix(st, p, out, ctx) { const d = divOf(st, p); if (!d) return fail(out, 'bad_param'); if (!canFix(st, d)) return fail(out, 'תיקון אחד בחצי שנה'); const c = r100k(grossOf(st, d) * HD.fixCost) || 1000000;
    if (st.cash < c) return fail(out, 'אין מספיק מזומן'); st.cash -= c; d.fixed = st.month; d.health = clamp(d.health + HD.fixUp, 0, 100); ctx.cashFx(out, -c, `תיקון ב${d.n} ${ctx.fmtM(c)}`); out.toast = `${d.n}: צוות חדש ותחזוקה. הבריאות עלתה ל־${Math.round(d.health)}.`; return true; },
  sell(st, p, out, ctx) { const M = HS(st); const d = divOf(st, p); if (!d) return fail(out, 'bad_param'); const v = r100k(grossOf(st, d) * HD.sellAt * (M.deal < 1 ? 2 - M.deal : 1)); const D = debtOf(st, d);
    dropDiv(st, d, out); st.cash += v - D; M.sold++; ctx.cashFx(out, v - D, ctx.sgn(v - D)); out.toast = `${d.n} נמכרה ב־${ctx.fmtM(v)}${D ? `; ${ctx.fmtM(D)} החזירו את החוב שלה` : ''}.`; return true; },
  dividend(st, p, out) { if (!['min', 'high', 'skip'].includes(p)) return fail(out, 'bad_param'); HS(st).divPol = p; out.toast = p === 'skip' ? 'השנה בלי דיבידנד. הדירקטוריון לא יאהב את זה.' : p === 'high' ? 'דיבידנד גבוה: הדירקטוריון מרוצה, הקופה קטנה.' : 'דיבידנד במינימום שהדירקטוריון דורש.'; return true; },
  bond(st, p, out, ctx) { const M = HS(st); if (M.bonds.length >= HD.bondCap) return fail(out, 'כבר יש 3 סדרות אג"ח'); if (M.rating >= 4) return fail(out, 'בדירוג הזה אין קונים לאג"ח');
    M.bonds.push({ amt: HD.bond, rate: round2((RATES[M.rating] + HD.bondSpread) * 1000) / 1000, at: st.month, due: st.month + HD.bondMonths }); st.cash += HD.bond; ctx.cashFx(out, HD.bond, '+' + ctx.fmtM(HD.bond));
    out.toast = `אג"ח של הקבוצה: ${ctx.fmtM(HD.bond)} לחמש שנים. תנאי: כיסוי נזילות של 1.2 לפחות, אחרת הריבית עולה ב־1%.`; return true; },
  repayBond(st, p, out, ctx) { const M = HS(st); const b = M.bonds[0]; if (!b) return fail(out, 'אין אג"ח'); const c = r100k(b.amt * 1.01); if (st.cash < c) return fail(out, 'אין מספיק מזומן'); st.cash -= c; M.bonds.shift(); ctx.cashFx(out, -c, null); out.toast = `האג"ח נפרע מוקדם (${ctx.fmtM(c)}).`; return true; },
  repayHq(st, p, out, ctx) { const M = HS(st); if (!(M.hqDebt > 0)) return fail(out, 'אין חוב במטה'); const c = Math.min(M.hqDebt, 25000000); if (st.cash < c) return fail(out, 'אין מספיק מזומן'); st.cash -= c; M.hqDebt -= c; ctx.cashFx(out, -c, null); out.toast = `${ctx.fmtM(c)} מחוב המטה נפרעו.`; return true; },
  insure(st, p, out) { const M = HS(st); M.ins = M.ins ? 0 : st.month || 1; out.toast = M.ins ? 'זרוע ביטוח: פרמיה כל חודש, ובסערה היא מכסה 35% מההפסד של החטיבות.' : 'זרוע הביטוח נסגרה.'; return true; },
  services(st, p, out, ctx) { const M = HS(st); if (M.svc) return fail(out, 'כבר יש מרכז שירותים'); if (st.cash < HD.svcCost) return fail(out, 'אין מספיק מזומן'); st.cash -= HD.svcCost; M.svc = st.month || 1; ctx.cashFx(out, -HD.svcCost, null); out.toast = 'מרכז שירותים משותף: +3% רווח בכל החטיבות.'; return true; },
  restructure(st, p, out, ctx) { const M = HS(st); if (M.restruct) return fail(out, 'הסדר אחד בלבד'); if (!(M.hqDebt > 0) || (st.cash >= 0 && covMonths(st) >= 6)) return fail(out, 'הסדר רק במצוקה');
    const cut = Math.round(M.hqDebt * HD.cut); M.hqDebt -= cut; M.restruct = st.month || 1; M.lastDef = st.stats.paydays; M.defaults++; ctx.lesson(st, out, 'contagion'); out.toast = `הסדר חוב: הבנקים מחקו ${ctx.fmtM(cut)} מחוב המטה. המחיר: לכל היותר כוכב אחד, ושעון "בלי חדלות פירעון" מתחיל מחדש.`; return true; },
};
function actionList(st, ctx) {
  const M = HS(st); const out = []; const res = reserveOf(st); const cov = covMonths(st) / 12; const storm = !!(M.storm && STORMS[M.storm.i].id !== 'boom');
  const weakG = M.divs.filter((d) => d.struct === 'g').sort((x, y) => x.health - y.health || (x.last ? x.last.net : 0) - (y.last ? y.last.net : 0))[0] || null; let growLeft = 2;
  const byRet = M.divs.slice().sort((x, y) => y.health - x.health || x.slot - y.slot);
  for (const d of byRet) {
    const K = KO(d.kind); const D = debtOf(st, d); const fee = r100k(D * HD.structFee); const gross = grossOf(st, d); const want = d.health >= HD.gHealth && d.beta[0] < HD.gBeta && d.kind !== 'trophy' ? 'g' : 'r'; const pr = 'd' + d.sid;
    out.push({ id: 'structure', param: pr, label: d.struct === 'g' ? `לגדר את ${d.n} (${ctx.fmtM(fee)}, ריבית +1.5%)` : `ערבות המטה ל${d.n} (${ctx.fmtM(fee)}, ריבית −1.5%)`, enabled: st.cash >= fee && !(d.struct === 'g' && d.miss > 0), suggested: d.struct !== want && st.cash >= fee + res * 0.5 && !(d.struct === 'g' && d.miss > 0),
      preview: { cash: -fee, monthly: Math.round(D * HD.rfPrem / 12) * (d.struct === 'g' ? -1 : 1), months: 0, risk: d.struct === 'r' ? 'contagion' : null } });
    const bleed = d.last && d.last.net < 0 ? -d.last.net : 0; const letGo = d.struct === 'r' && d.sup && bleed > 0 && (gross - D < 8 * bleed || d.health < 30);
    out.push({ id: 'support', param: pr, label: d.sup ? `להפסיק לתמוך ב${d.n}` : `לחזור לתמוך ב${d.n}`, enabled: true, suggested: letGo || (!d.sup && (d.struct === 'g' || !letGo) && st.cash >= res), preview: { cash: 0, monthly: d.sup ? bleed : -bleed, months: 0, risk: d.sup ? (d.struct === 'g' ? 'default' : 'loss') : null } });
    const gc = r100k(gross * HD.growCost); const sg = canGrow(st, d) && growLeft > 0 && d.health >= 60 && !storm && cov >= 1.3 && st.cash >= gc + res && d.kind !== 'trophy'; if (sg) growLeft--;
    out.push({ id: 'grow', param: pr, label: `להשקיע ${ctx.fmtM(gc)} בצמיחה של ${d.n} (+${Math.round(HD.growUp * M.growF * 100)}% רווח)`, enabled: canGrow(st, d) && st.cash >= gc, suggested: sg, preview: { cash: -gc, monthly: Math.round(d.est * HD.growUp * M.growF), months: 0, risk: null } });
    const fc = r100k(gross * HD.fixCost) || 1000000;
    out.push({ id: 'fix', param: pr, label: `לתקן את ${d.n} (${ctx.fmtM(fc)}, בריאות +25)`, enabled: canFix(st, d) && st.cash >= fc, suggested: canFix(st, d) && d.health < 60 && d.kind !== 'trophy' && st.cash >= fc + res * 0.5, preview: { cash: -fc, monthly: Math.round(d.base * 0.1), months: 0, risk: null } });
    const sv = r100k(gross * HD.sellAt * (M.deal < 1 ? 2 - M.deal : 1));
    const sellNow = (d.kind === 'trophy' && bleed > 0) || (d.struct === 'g' && d.miss > 0 && st.cash < r100k(D * HD.callG) && sv > D) || (d === weakG && M.divs.length > 3 && st.cash < 0);
    out.push({ id: 'sell', param: pr, label: `למכור את ${d.n} (${ctx.fmtM(sv)}, החוב ${ctx.fmtM(D)})`, enabled: true, suggested: sellNow, preview: { cash: sv - D, monthly: -(d.last ? d.last.net : 0), months: 0, risk: null } });
  }
  for (const k of ['min', 'high', 'skip']) out.push({ id: 'dividend', param: k, label: k === 'min' ? 'דיבידנד במינימום' : k === 'high' ? 'דיבידנד גבוה (+3%)' : 'בלי דיבידנד השנה', enabled: M.divPol !== k, suggested: k === 'min' && M.divPol !== 'min', preview: { cash: 0, monthly: 0, months: 0, risk: k === 'skip' ? 'board' : null } });
  out.push({ id: 'bond', param: null, label: `להנפיק אג"ח של הקבוצה (${ctx.fmtM(HD.bond)}, 5 שנים)`, enabled: M.bonds.length < HD.bondCap && M.rating < 4, suggested: M.bonds.length < HD.bondCap && M.rating < 4 && cov < 1.05, preview: { cash: HD.bond, monthly: -Math.round(HD.bond * (RATES[M.rating] + HD.bondSpread) / 12), months: 60, risk: null } });
  if (M.bonds.length) out.push({ id: 'repayBond', param: null, label: `לפרוע אג"ח מוקדם (${ctx.fmtM(r100k(M.bonds[0].amt * 1.01))})`, enabled: st.cash >= M.bonds[0].amt * 1.01, suggested: cov >= 2.5 && st.cash >= M.bonds[0].amt * 1.01 + 2 * res, preview: { cash: -r100k(M.bonds[0].amt * 1.01), monthly: Math.round(M.bonds[0].amt * M.bonds[0].rate / 12), months: 0, risk: null } });
  if (M.hqDebt > 0) out.push({ id: 'repayHq', param: null, label: `לפרוע ${ctx.fmtM(Math.min(M.hqDebt, 25000000))} מחוב המטה`, enabled: st.cash >= Math.min(M.hqDebt, 25000000), suggested: cov >= 1.6 && st.cash >= Math.min(M.hqDebt, 25000000) + res, preview: { cash: -Math.min(M.hqDebt, 25000000), monthly: Math.round(Math.min(M.hqDebt, 25000000) * 0.02), months: 0, risk: null } });
  const exposed = M.divs.filter((d) => d.beta[0] >= 0.9).length;
  out.push({ id: 'insure', param: null, label: M.ins ? 'לסגור את זרוע הביטוח' : 'זרוע ביטוח לקבוצה (פרמיה חודשית, 35% מההפסד בסערה)', enabled: true, suggested: M.ins ? exposed < 2 : exposed >= 3, preview: { cash: 0, monthly: M.ins ? 0 : -Math.round(HD.insPrem * M.divs.reduce((y, d) => y + grossOf(st, d), 0)), months: 0, risk: null } });
  out.push({ id: 'services', param: null, label: `מרכז שירותים משותף (${ctx.fmtM(HD.svcCost)}: +3% רווח בכל החטיבות)`, enabled: !M.svc && st.cash >= HD.svcCost, suggested: !M.svc && M.divs.length >= 5 && cov >= 1.3 && st.cash >= HD.svcCost + res, preview: { cash: -HD.svcCost, monthly: Math.round(M.divs.reduce((y, d) => y + d.est, 0) * HD.svcUp), months: 0, risk: null } });
  if (M.hqDebt > 0 && !M.restruct) out.push({ id: 'restructure', param: null, label: 'הסדר חוב עם הבנקים (מחיקה של 40% מחוב המטה, לכל היותר כוכב אחד)', enabled: st.cash < 0 || covMonths(st) < 6, suggested: false, preview: { cash: 0, monthly: Math.round(M.hqDebt * HD.cut * 0.015), months: 0, risk: 'stars' } });
  return out;
}
function indicatorsOf(st, ctx) {
  const M = HS(st); const cm = covMonths(st); const since = M.lastDef ? st.stats.paydays - M.lastDef : st.stats.paydays; const S = M.storm ? STORMS[M.storm.i] : null;
  const rows = M.divs.slice().sort((a, b) => a.slot - b.slot).map((d) => { const D = debtOf(st, d); const g = grossOf(st, d);
    return { did: 'd' + d.sid, assetId: 'a' + d.sid, name: d.n, kind: d.kind, kindName: KO(d.kind).n, home: KO(d.kind).home, driver: KO(d.kind).drv, struct: d.struct, support: d.sup, health: Math.round(d.health), op: d.last ? d.last.op : d.est, net: d.last ? d.last.net : 0,
      gross: g, debt: D, equity: d.struct === 'r' ? Math.max(0, g - D) : g - D, rate: rateOf(st, d), beta: d.beta, miss: d.miss, lo: d.lo, hi: d.hi, paid: d.paid }; });
  const gross = rows.reduce((x, r) => x + r.gross, 0); const debt = rows.reduce((x, r) => x + r.debt, 0) + M.hqDebt + M.bonds.reduce((x, b) => x + b.amt, 0);
  return {
    holding: { divs: M.divs.length, maxDivs: SLOTS, rating: RATINGS[M.rating], ratingIdx: M.rating, rateG: RATES[M.rating], coverage: round2(cm / 12), covMonths: cm, service: groupService(st), hqFixed: HD.hqFixed, hqDebt: M.hqDebt, bonds: M.bonds.map((b) => ({ amt: b.amt, rate: b.rate, due: b.due })), breach: !!M.breach,
      defaults: M.defaults, penalties: M.penalties, calls: M.calls, cured: M.cured, lost: M.lost, sold: M.sold, storms: M.storms, sinceDefault: since, storm: S ? { id: S.id, name: S.n, left: M.storm.left, sev: M.storm.sev } : null, ins: !!M.ins, svc: !!M.svc, divPol: M.divPol, divMin: round2(M.divMin + 0.01 * M.pressure), pressure: M.pressure,
      supported: M.supported, insPaid: M.insPaid, divPaid: M.divPaid, restructured: !!M.restruct, gross, debt, guaranteed: rows.filter((r) => r.struct === 'g').length },
    panel: {
      id: 'holding', title: 'מפת הקבוצה והערבויות',
      gauges: [{ id: 'coverage', label: 'כיסוי נזילות (מזומן ÷ שנה של החזרי חוב בערבות)', value: round2(cm / 12), ref: 1, min: 0, max: 3 }, { id: 'rating', label: 'דירוג הקבוצה', value: RATINGS.length - 1 - M.rating, ref: 4, min: 0, max: RATINGS.length - 1, text: RATINGS[M.rating] },
        { id: 'noDefault', label: 'חודשים בלי חדלות פירעון', value: Math.min(since, 24), ref: 24, min: 0, max: 24 }, { id: 'guaranteed', label: 'חטיבות בערבות המטה', value: rows.filter((r) => r.struct === 'g').length, ref: null, min: 0, max: SLOTS }],
      rows, storm: S ? { id: S.id, name: S.n, left: M.storm.left, shocks: shockOf(st).map(round2) } : null, actions: actionList(st, ctx),
    },
  };
}
export default holding;
