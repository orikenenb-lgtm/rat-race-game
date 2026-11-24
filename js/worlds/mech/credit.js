// World mechanic `credit` — w14 רובע הבנקים (CATALOG-25 §1.4 w14, §2.4; docs/full-upgrade/worlds/w14-banks.md). You are the bank: a loan
// book in 5 segments funded by sticky retail deposits and flighty wholesale money, a capital ratio the regulator watches, and confidence that
// can empty the vault. The distinct rule (adverse selection): your price vs the market moves BOTH the volume and the quality of new
// borrowers — price above the market and the good borrowers leave (new-loan PD ↑); price below and the book grows on a thin margin.
// Long fixed-rate loans on short deposits squeeze the margin when the policy rate rises.
//
// Contract (DESIGN §4.2): pure, deterministic, no engine import; only + − × ÷ round / min / max / floor. Draws: 0 at init, exactly 6 'world'
// draws every payday (one default draw per segment + one confidence draw), 3 per 'J' landing (the offer, its sealed quality, the rival).
// The bank is one engine asset ('bank': value = your stake × the bank's equity); its balance sheet lives in st.world.cr.
export const ID = 'credit';
export const SEGS = Object.freeze(['mort', 'sme', 'dev', 'cons', 'corp']);
export const DRAWS = Object.freeze({ init: 0, month: SEGS.length + 1, landing: Object.freeze({ J: 3 }) });
/** Segments (annual PD, LGD, risk weight, maturity months, fixed-rate share of new loans, the market spread over the policy rate in pp). */
export const SEG = Object.freeze({
  mort: Object.freeze({ n: 'משכנתאות', pd: 0.01, lgd: 0.25, rw: 0.5, mat: 120, fix: 0.6, sp: 1.8 }),
  sme: Object.freeze({ n: 'עסקים קטנים', pd: 0.04, lgd: 0.45, rw: 1.0, mat: 36, fix: 0.2, sp: 3.6 }),
  dev: Object.freeze({ n: 'יזמי נדל"ן', pd: 0.05, lgd: 0.4, rw: 1.5, mat: 24, fix: 0, sp: 4.6 }),
  cons: Object.freeze({ n: 'אשראי צרכני', pd: 0.07, lgd: 0.7, rw: 1.0, mat: 24, fix: 0.5, sp: 7.0 }),
  corp: Object.freeze({ n: 'חברות גדולות', pd: 0.02, lgd: 0.4, rw: 1.0, mat: 48, fix: 0.3, sp: 2.2 }),
});
export const PRICES = Object.freeze([-1, -0.5, 0, 0.5, 1, 1.5]);
/** Adverse selection: volume × (1 − 0.45 × delta), new-loan PD × (1 + 0.6 × delta) above the market. */
export const SEL = Object.freeze({ vol: 0.45, pd: 0.6, volMin: 0.25, volMax: 1.6 });
const CYC = Object.freeze({ exp: 0.8, slow: 1.1, rec: 1.8, recov: 1.0 });
const DEM = Object.freeze({ exp: 1.15, slow: 1.0, rec: 0.7, recov: 0.95 });
export const REG = Object.freeze({ min: 0.08, target: 0.1, resolve: 0.05, ban: 12 });
export const FUND = Object.freeze({ retailSpread: 2.0, whSpread: 0.6, liq: Object.freeze({ low: 0.1, mid: 0.15, high: 0.25 }), opex: 0.0009, opexVar: 0.0003, tax: 0.25, window: 0.02, windowEvery: 12 });
export const CONF = Object.freeze({ start: 70, run: 30, revert: 0.25, noise: 3, outR: 0.1, outW: 0.35 });
export const RAISE = Object.freeze({ share: 0.2, disc: 0.15 });
const LIQCONF = Object.freeze({ low: -10, mid: 0, high: 10 });
const RATE = Object.freeze({ start: 4, min: 0.25, max: 9, revert: 0.02 });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;
const CR = (st) => st.world.cr;
const phaseOf = (st) => (st.econ && st.econ.phase) || 'slow';
const isChief = (st) => st.charId === 'riskChief';
const isFin = (st) => st.charId === 'fintechFounder';
const isFam = (st) => st.charId === 'familyBanker';
function fail(out, msg) { out.ok = false; out.error = msg; return false; }

export const loans = (st) => SEGS.reduce((s, k) => s + CR(st).seg[k].book, 0);
export const rwa = (st) => SEGS.reduce((s, k) => s + CR(st).seg[k].book * SEG[k].rw, 0);
export const capRatio = (st) => { const R = rwa(st); return R > 0 ? round4(CR(st).eq / R) : 1; };
export const ownerEquity = (st) => r1000(Math.max(0, CR(st).eq) * CR(st).stake);
const liqTarget = (st) => r1000(CR(st).ret * FUND.liq[CR(st).liq]);
/** Wholesale fills the gap: loans + liquid = retail + wholesale + equity (+ the central bank window). */
function rebalance(st) { const B = CR(st); B.liqA = liqTarget(st); const need = loans(st) - B.prov + B.liqA - B.ret - B.eq - B.cbw; if (need >= 0) B.wh = r1000(need); else { B.wh = 0; B.liqA = r1000(B.liqA - need); } }
const retRate = (st) => CR(st).rr;
const whRate = (st) => round2(CR(st).rate + FUND.whSpread + Math.max(0, (CONF.start - CR(st).conf) / 40));
/** A segment's yield now (% a year) on its floating part. */
const yieldOf = (st, k) => round2(CR(st).rate + SEG[k].sp + CR(st).seg[k].yAdj);
/** The new-loan PD multiplier and volume factor of a price delta (pp vs the market). */
export const pdNewOf = (d) => round3(d > 0 ? 1 + SEL.pd * d : 1);
export const volOf = (d) => round3(clamp(1 - SEL.vol * d, SEL.volMin, SEL.volMax));
/** The public PD band of a segment: the riskChief sees the truth, everyone else ±40 %. */
export function pdBand(st, k) { const s = CR(st).seg[k]; const t = SEG[k].pd * s.pdMix * (CYC[phaseOf(st)] || 1); const w = isChief(st) ? 0 : 0.4; return { lo: round4(t * (1 - w)), hi: round4(t * (1 + w)) }; }
function newSeg(k, book) { return { book, fixBook: Math.round(book * SEG[k].fix), fixY: round2(RATE.start + SEG[k].sp), yAdj: 0, pdMix: 1, delta: 0, stop: false, newVol: 0, pdNew: 1 }; }
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'bank') { a.value = ownerEquity(st); a.debt = 0; } }

export const credit = {
  id: ID, draws: DRAWS,
  lessons: ['bank_run', 'adverse_selection', 'maturity_mismatch'],
  mentorKeys: ['runWarn', 'runHit', 'regulator', 'raised', 'bookSold', 'offerAsk', 'offerBuy', 'offerPass'],
  sealed: ['pending.wr', 'pending.offer.q'],

  init(st, w, ch) {
    const S = (ch && ch.start) || {}; const book = S.book || 1.6e9; const mix = S.mix || { mort: 0.4, sme: 0.2, dev: 0.15, cons: 0.1, corp: 0.15 };
    const seg = {}; for (const k of SEGS) { seg[k] = newSeg(k, r1000(book * (mix[k] || 0))); seg[k].delta = S.delta ?? 1; } // the previous management priced 1 pp above the market
    st.world.cr = { seg, eq: S.equity || 200e6, stake: 1, ret: r1000(book * (S.retail || 0.75)), wh: 0, liqA: 0, cbw: 0, cbwUntil: 0, cbwLast: -99, liq: 'mid', prov: r1000(book * 0.004), rate: RATE.start, rr: RATE.start - FUND.retailSpread,
      conf: CONF.start, hot: S.hot || 1, sticky: S.sticky || 1, demand: S.demand || 1, opex: S.opex || 1, last: null, profit12: [], div: 0, ban: 0, regAt: 0, regs: 0, runs: 0, runAt: 0, raised: 0, sold: 0, shocks: [], newPdSum: 0, newVolSum: 0, slump: 0 };
    rebalance(st);
  },
  defaults(st) { const B = CR(st); if (!B) return; if (B.fixedOpex == null) B.fixedOpex = r1000(loans(st) * FUND.opex); if (!Array.isArray(B.shocks)) B.shocks = []; if (!Array.isArray(B.profit12)) B.profit12 = []; },

  monthly(st, out, ctx) {
    const B = CR(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 6 'world' draws every payday
    const ph = phaseOf(st); const pays = st.stats.paydays;
    // the policy rate drifts back to 4 %; retail deposit rates follow it slowly (sticky), wholesale at once
    B.rate = round2(clamp(B.rate + (RATE.start - B.rate) * RATE.revert, RATE.min, RATE.max)); B.rr = round2(B.rr + (Math.max(0, B.rate - FUND.retailSpread) - B.rr) * 0.3);
    // 1. the month's interest
    let nii = 0; for (const k of SEGS) { const s = B.seg[k]; nii += (s.book - s.fixBook) * yieldOf(st, k) / 1200 + s.fixBook * s.fixY / 1200; }
    nii += B.liqA * Math.max(0, B.rate - 0.5) / 1200 - B.ret * retRate(st) / 1200 - B.wh * whRate(st) / 1200 - B.cbw * (B.rate + 3) / 1200;
    const opex = (B.fixedOpex + loans(st) * FUND.opexVar) * B.opex; // branches and systems are mostly fixed; a bigger book adds a little
    // 2. defaults (one draw per segment; a draw above 0.985 is a big single borrower: 3 % of the segment at once)
    let loss = 0; const hit = {};
    for (let i = 0; i < SEGS.length; i++) { const k = SEGS[i]; const s = B.seg[k]; const slump = k === 'dev' && B.slump >= st.month ? 2 : 1;
      let l = s.book * SEG[k].pd / 12 * s.pdMix * (CYC[ph] || 1) * slump * (0.4 + 1.2 * rs[i]) * SEG[k].lgd; if (rs[i] > 0.985 && (k === 'corp' || k === 'dev')) l += s.book * 0.03 * SEG[k].lgd;
      l = Math.round(l); s.book = Math.max(0, s.book - Math.round(l / SEG[k].lgd)); s.fixBook = Math.min(s.fixBook, s.book); loss += l; hit[k] = l; }
    // 3. runoff + new lending at the player's price (adverse selection), expected loss provisioned at origination
    let el = 0; B.newVolSum = 0; let pdW = 0;
    for (const k of SEGS) { const s = B.seg[k]; const run = Math.round(s.book / SEG[k].mat); const fr = s.book ? s.fixBook / s.book : 0; s.book -= run; s.fixBook = Math.max(0, s.fixBook - Math.round(run * fr));
      const banned = s.stop || (B.ban >= pays && SEG[k].rw >= 0.85);
      const vol = banned ? 0 : r1000(B.base[k] * B.demand * (DEM[ph] || 1) * volOf(s.delta)); const pn = pdNewOf(s.delta);
      if (vol > 0) { s.pdMix = round3((s.pdMix * s.book + pn * vol) / Math.max(1, s.book + vol)); s.yAdj = round3((s.yAdj * s.book + s.delta * vol) / Math.max(1, s.book + vol));
        const fv = Math.round(vol * SEG[k].fix); const y = round2(B.rate + SEG[k].sp + s.delta); s.fixY = s.fixBook + fv ? round2((s.fixY * s.fixBook + y * fv) / (s.fixBook + fv)) : y; s.fixBook += fv; s.book += vol;
        el += vol * SEG[k].pd * pn * SEG[k].lgd; B.newVolSum += vol; pdW += vol * pn; }
      s.newVol = vol; s.pdNew = pn; }
    B.newPdSum = B.newVolSum ? round3(pdW / B.newVolSum) : 1; el = Math.round(el); B.prov += el;
    const use = Math.min(B.prov, loss); B.prov -= use;
    const pre = Math.round(nii - opex - el - (loss - use)); const profit = pre > 0 ? Math.round(pre * (1 - FUND.tax)) : pre;
    B.eq += profit; B.profit12.push(profit); while (B.profit12.length > 12) B.profit12.shift();
    B.last = { nii: Math.round(nii), opex: Math.round(opex), el, loss, profit, hit };
    if (B.cbw && st.month >= B.cbwUntil) B.cbw = 0;
    // 4. capital: below 8 % the regulator steps in (lastEvent 'regulator', a 12-payday ban on dividends and on high-risk lending); below 5 % the bank is resolved
    const cr = capRatio(st);
    if (cr < REG.resolve) { st.flags.bankrupt = true; out.news.push({ kind: 'credit', text: 'יחס ההון ירד מתחת ל־5%. המפקח על הבנקים לקח את הבנק לניהול חיצוני.' }); }
    else if (cr < REG.min) { if (B.regAt !== pays) { B.regs++; } B.regAt = pays; B.ban = pays + REG.ban; out.news.push({ kind: 'credit', text: ctx.mentorLine(st, 'regulator', { pct: String(round2(cr * 100)) }) || `המפקח נכנס: יחס ההון ${round2(cr * 100)}% (מתחת ל־8%). שנה בלי דיבידנד ובלי אשראי מסוכן.` }); ctx.lesson(st, out, 'adverse_selection'); }
    // 5. confidence (1 draw): capital, losses, rumours; a run below 30
    let target = CONF.start + (cr - 0.12) * 300 - (loss > B.eq * 0.02 ? 15 : 0) - 7 * (B.hot - 1) + LIQCONF[B.liq]; // hot money and a thin liquidity buffer make depositors nervous for (const x of B.shocks) if (x.until >= st.month) target += x.d;
    B.conf = Math.round(clamp(B.conf + (clamp(target, 0, 95) - B.conf) * CONF.revert + (rs[5] - 0.5) * 2 * CONF.noise, 0, 100));
    const outR = Math.round(B.ret * 0.004 * B.hot / B.sticky * Math.max(0, (CONF.start - B.conf) / 10)); B.ret -= outR;
    if (B.conf < CONF.run) { B.runs++; B.runAt = pays; const o = Math.round(B.ret * CONF.outR * B.hot / B.sticky); B.ret -= o; out.news.push({ kind: 'credit', text: ctx.mentorLine(st, 'runHit', { amount: ctx.fmtM(o) }) || `תור בסניפים: מפקידים משכו ${ctx.fmtM(o)} בחודש אחד. הכסף הסיטונאי מתייקר.` }); ctx.lesson(st, out, 'bank_run');
      const gap = o - B.liqA; if (gap > 0) fireSale(st, gap, out, ctx); }
    else if (B.conf < CONF.run + 12) out.news.push({ kind: 'credit', text: ctx.mentorLine(st, 'runWarn', {}) || 'שמועות ברשת על הבנק. האמון במפקידים יורד — עוד קצת, ויתחילו למשוך.' });
    // retail deposits grow with the book (a sticky franchise), more slowly for the fintech
    B.ret = r1000(B.ret + B.newVolSum * 0.5 * (isFin(st) ? 0.7 : 1));
    B.shocks = B.shocks.filter((x) => x.until >= st.month);
    if (B.rate > 6 && SEGS.some((k) => B.seg[k].fixBook > B.seg[k].book * 0.4)) ctx.lesson(st, out, 'maturity_mismatch');
    rebalance(st); revalue(st);
  },
  asset: {
    create(st, a, card) { a.op = JSON.parse(JSON.stringify(card.op)); if (a.op.ck === 'bank') { a.value = ownerEquity(st); a.debt = 0; } },
    cf() { return 0; }, // the bank keeps its profit (equity); dividends are paid by Z:dividend
  },
  market: {
    create(st, p) { const c = p.card; const B = CR(st);
      if (c.mk === 'rate') B.rate = round2(clamp(B.rate + c.dr, RATE.min, RATE.max));
      if (c.mk === 'slump') B.slump = st.month + (c.months || 6);
      if (c.mk === 'rumor') B.shocks.push({ d: -(c.hit || 25), until: st.month + (c.months || 2) });
      if (c.mk === 'calm') B.shocks.push({ d: c.hit || 10, until: st.month + (c.months || 3) }); },
    describe(st, p, ev) { const c = p.card; const B = CR(st); ev.data.credit = { mk: c.mk, rate: B.rate, conf: B.conf, capRatio: capRatio(st), months: c.months || null }; },
  },
  crisis: {
    create(st, p) { const c = p.card; const B = CR(st);
      if (c.mk === 'fraud') { const amt = r1000(B.eq * (c.pct || 0.01)); B.eq -= amt; p.hit = amt; revalue(st); }
      if (c.mk === 'stress') { B.shocks.push({ d: capRatio(st) < REG.target ? -20 : 5, until: st.month + 2 }); } },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const B = CR(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'bank') continue;
    m.queue = B.conf < CONF.run + 12 ? Math.round((CONF.run + 12 - B.conf) / 4) : 0; m.conf = B.conf; m.capRatio = capRatio(st); m.segments = SEGS.map((k) => ({ seg: k, book: B.seg[k].book })); m.vault = true; } },
  recapHint(st) { const B = CR(st); if (!B) return null; if (B.runs) return 'בפעם הבאה: אמון. יחס הון גבוה ונזילות בצד — לפני שהשמועה מגיעה.'; if (B.regs) return 'בפעם הבאה: הון קודם. המפקח נכנס כשיחס ההון יורד מתחת ל־8%.'; if (SEGS.some((k) => B.seg[k].delta >= 1)) return 'בפעם הבאה: מחיר גבוה מבריח את הלווים הטובים. מי שנשאר — מסוכן יותר.'; return null; },
  goalValue(st, key) { const B = CR(st); if (key === 'equity') return ownerEquity(st); if (key === 'capRatio') return capRatio(st); if (key === 'lastEvent:regulator') return B.regAt || 0; return 0; },
};
/** A forced sale of loans to cover a liquidity gap: the central bank window first (once per 12 paydays, 2 % fee), else loans at 85 %. */
function fireSale(st, gap, out, ctx) {
  const B = CR(st); const pays = st.stats.paydays;
  if (pays - B.cbwLast >= FUND.windowEvery) { B.cbw += gap; B.cbwUntil = st.month + 6; B.cbwLast = pays; const fee = r1000(gap * FUND.window); B.eq -= fee; out.news.push({ kind: 'credit', text: `חלון הבנק המרכזי: ${ctx.fmtM(gap)} לחצי שנה, בעמלה של ${ctx.fmtM(fee)} ובריבית גבוהה.` }); return; }
  let left = gap; for (const k of ['corp', 'mort', 'sme', 'cons', 'dev']) { if (left <= 0) break; const s = B.seg[k]; const sell = Math.min(s.book, Math.round(left / 0.85)); const fr = s.book ? s.fixBook / s.book : 0; s.book -= sell; s.fixBook = Math.max(0, s.fixBook - Math.round(sell * fr)); B.eq -= Math.round(sell * 0.15); left -= Math.round(sell * 0.85); }
  B.sold++; out.news.push({ kind: 'credit', text: `מכירה בכפייה: הבנק מכר הלוואות ב־85% מהערך כדי לשלם למפקידים.` });
}
// the base new-lending demand per segment (₪ a month): DEMAND × the starting segment book (set once, after init)
const _init = credit.init; credit.init = function (st, w, ch, ctx) { _init(st, w, ch, ctx); const B = CR(st); B.base = {}; for (const k of SEGS) B.base[k] = r1000(Math.max(B.seg[k].book, 50e6) * DEMAND); B.fixedOpex = r1000(loans(st) * FUND.opex); };
/** New-lending demand per segment and month at the market price: 4.5 % of the starting segment book. */
export const DEMAND = 0.045;

/* ---------------------------------------------------------------- 'J' — an offer to the bank */
credit.tiles.J = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 3 'world' draws on every J landing
    const offers = (ctx.world(st).offers || []); const o = offers[Math.floor(rs[0] * offers.length)] || null; return { wr: rs, offer: o ? { ...JSON.parse(JSON.stringify(o)), q: round3(0.7 + 0.8 * rs[1]) } : null, checked: false }; },
  describe(st, p, ev, ctx) {
    const o = p.offer; const B = CR(st); ev.tag = 'הצעה לבנק';
    if (!o) { ev.title = 'הצעה לבנק'; ev.text = 'אין הצעה החודש.'; ev.options = [ctx.opt('pass', 'המשך', true, { primary: true })]; ev.auto = true; ev.toastText = ev.text; return; }
    const size = r1000(B.eq * o.size); const price = r1000(size * o.price); const shown = p.checked ? { lo: round2(o.q - 0.1), hi: round2(o.q + 0.1) } : { lo: 0.7, hi: 1.5 };
    const crAfter = o.kind === 'deposits' ? capRatio(st) : round4(B.eq / (rwa(st) + size * SEG[o.seg].rw));
    ev.title = o.n; ev.text = `${o.d} היקף ${ctx.fmtM(size)}${o.kind === 'deposits' ? '' : `, מחיר ${Math.round(o.price * 100)}% מהערך`}.`;
    ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'מה זה עושה ליחס ההון — ומי הלווים האלה באמת?';
    ev.data = { kind: o.kind, seg: o.seg || null, size, price, pdMult: shown, checked: !!p.checked, checkFee: 500000, capRatio: capRatio(st), capRatioAfter: crAfter, note: o.kind === 'deposits' ? 'כסף זול — שבורח מהר כשהאמון יורד.' : 'ספר הלוואות: האיכות האמיתית של הלווים נחשפת רק עם הזמן. בדיקת אשראי מצמצמת את הטווח.' };
    const half = Math.round(price / 2);
    ev.options = [
      ...(p.checked || o.kind === 'deposits' ? [] : [ctx.opt('check', `ועדת אשראי (${ctx.fmtM(500000)})`, st.cash + B.liqA >= 500000, { kind: 'inspect', preview: { cash: -500000, monthly: 0, months: 0, risk: null } })]),
      ctx.opt('buy', o.kind === 'deposits' ? `לקבל את המפקידים (${ctx.fmtM(size)})` : `לקנות (${ctx.fmtM(price)})`, crAfter >= REG.min || o.kind === 'deposits', { kind: 'take', preview: { cash: 0, monthly: 0, months: 0, risk: o.kind === 'deposits' ? 'flight' : 'sealed:pd' }, reason: crAfter >= REG.min || o.kind === 'deposits' ? undefined : 'יחס ההון יירד מתחת ל־8%' }),
      ...(o.kind === 'deposits' ? [] : [ctx.opt('half', `לקנות חצי (${ctx.fmtM(half)})`, true, { kind: 'take', preview: { cash: 0, monthly: 0, months: 0, risk: 'sealed:pd' } })]),
      ctx.opt('pass', 'לוותר', true),
    ];
    const qMid = (shown.lo + shown.hi) / 2; const good = o.kind === 'deposits' ? B.conf >= 55 && B.wh > 0 : crAfter >= REG.target + 0.015 && qMid * (o.price < 0.95 ? 0.95 : 1) <= 1.05;
    const pick = !p.checked && o.kind !== 'deposits' && crAfter >= REG.target + 0.015 ? 'check' : good ? 'buy' : 'pass'; ev.forcePrimary = (ev.options.find((x) => x.id === pick && x.enabled) || ev.options.find((x) => x.id === 'pass')).id;
  },
  choose(st, p, o, params, out, ctx) {
    const B = CR(st); const of = p.offer;
    if (o.id === 'pass' || !of) { out.mentor = ctx.mentorLine(st, 'offerPass', {}) || null; ctx.logDecision(st, 'הצעה לבנק', 'ויתר'); return true; }
    if (o.id === 'check') { B.eq -= 500000; p.checked = true; revalue(st); ctx.logDecision(st, 'הצעה לבנק', 'ועדת אשראי'); return false; }
    const f = o.id === 'half' ? 0.5 : 1; const size = r1000(B.eq * of.size * f);
    if (of.kind === 'deposits') { B.ret += size; B.hot = round2(Math.min(3, B.hot + 0.3)); }
    else { const s = B.seg[of.seg]; const price = r1000(size * of.price); s.pdMix = round3((s.pdMix * s.book + of.q * size) / Math.max(1, s.book + size)); s.book += size; s.fixBook += Math.round(size * SEG[of.seg].fix); B.eq += size - price; B.prov += Math.round(size * SEG[of.seg].pd * SEG[of.seg].lgd); B.eq -= Math.round(size * SEG[of.seg].pd * SEG[of.seg].lgd); }
    rebalance(st); revalue(st); ctx.lesson(st, out, of.kind === 'deposits' ? 'bank_run' : 'adverse_selection');
    out.mentor = ctx.mentorLine(st, 'offerBuy', {}) || null; ctx.logDecision(st, 'הצעה לבנק', o.id === 'half' ? 'חצי' : 'קנה', size); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
credit.act = {
  price(st, p, out) { const [k, d] = String(p || '').split(':'); const v = +d; if (!SEGS.includes(k) || !PRICES.includes(v)) return fail(out, 'bad_param'); const s = CR(st).seg[k]; if (s.delta === v && !s.stop) return fail(out, 'כבר כך'); s.delta = v; s.stop = false; out.toast = `${SEG[k].n}: ${v > 0 ? '+' : ''}${v} נק׳ מעל השוק`; return true; },
  tighten(st, p, out) { if (!SEGS.includes(p)) return fail(out, 'bad_param'); const s = CR(st).seg[p]; s.stop = !s.stop; out.toast = s.stop ? `${SEG[p].n}: הפסקת אשראי חדש` : `${SEG[p].n}: חוזרים לתת אשראי`; return true; },
  liq(st, p, out) { if (!FUND.liq[p]) return fail(out, 'bad_param'); const B = CR(st); if (B.liq === p) return fail(out, 'כבר כך'); B.liq = p; rebalance(st); out.toast = `נזילות: ${Math.round(FUND.liq[p] * 100)}% מהפיקדונות`; return true; },
  raise(st, p, out, ctx) { const B = CR(st); const add = r1000(B.eq * RAISE.share); if (add <= 0) return fail(out, 'אין הון'); const newShares = add / (1 - RAISE.disc); B.stake = round4(B.stake * B.eq / (B.eq + newShares)); B.eq += add; B.raised++; rebalance(st); revalue(st);
    out.toast = ctx.mentorLine(st, 'raised', { amount: ctx.fmtM(add) }) || `גייסת ${ctx.fmtM(add)} מהמשקיע בהנחה של 15%. החלק שלך בבנק ירד ל־${Math.round(B.stake * 100)}%.`; return true; },
  sellBook(st, p, out, ctx) { const B = CR(st); if (!SEGS.includes(p)) return fail(out, 'bad_param'); const s = B.seg[p]; if (s.book < 10e6) return fail(out, 'אין מה למכור');
    const sell = r1000(s.book * 0.25); const px = clamp(1 - SEG[p].pd * s.pdMix * SEG[p].lgd * 3, 0.85, 0.95); const fr = s.book ? s.fixBook / s.book : 0; s.book -= sell; s.fixBook = Math.max(0, s.fixBook - Math.round(sell * fr)); B.eq -= Math.round(sell * (1 - px)); B.sold++; rebalance(st); revalue(st);
    out.toast = ctx.mentorLine(st, 'bookSold', { amount: ctx.fmtM(sell) }) || `מכרת רבע מספר ה${SEG[p].n} (${ctx.fmtM(sell)}) ב־${Math.round(px * 100)}%.`; return true; },
  dividend(st, p, out, ctx) { const B = CR(st); if (B.ban >= st.stats.paydays) return fail(out, 'המפקח אסר דיבידנד'); const p12 = B.profit12.reduce((a, b) => a + b, 0); const amt = r1000(Math.max(0, p12) * 0.25 * B.stake); if (amt < 1e6 || B.div >= st.stats.paydays) return fail(out, 'אין רווח לחלק');
    B.eq -= Math.round(amt / B.stake); st.cash += amt; B.div = st.stats.paydays + 11; B.shocks.push({ d: 6, until: st.month + 6 }); ctx.cashFx(out, amt, '+' + ctx.fmtM(amt)); rebalance(st); revalue(st); out.toast = `דיבידנד: ${ctx.fmtM(amt)} לכיס שלך. השוק אוהב בנק שמחלק — והמפקח סופר כל שקל הון.`; return true; },
};
function actionList(st, ctx) {
  const B = CR(st); const out = []; const cr = capRatio(st); const pays = st.stats.paydays;
  for (const k of SEGS) { const s = B.seg[k]; const want = cr >= 0.17 ? -1 : cr >= 0.135 ? -0.5 : cr >= REG.target + 0.005 ? 0 : 0.5; // the guide: spare capital earns nothing — lend it out below the market; the market price near 10 %; +0.5 only to rebuild capital
    for (const v of PRICES) out.push({ id: 'price', param: `${k}:${v}`, label: `${SEG[k].n}: ${v === 0 ? 'מחיר שוק' : (v > 0 ? '+' : '') + v + ' נק׳'}`, enabled: s.delta !== v, current: s.delta === v, seg: k, delta: v, suggested: s.delta !== v && v === want && !s.stop });
    out.push({ id: 'tighten', param: k, label: s.stop ? `${SEG[k].n}: לחזור לתת אשראי` : `${SEG[k].n}: להפסיק אשראי חדש`, enabled: true, suggested: s.stop ? cr > REG.target + 0.02 : (k === 'dev' && B.slump >= st.month) });
    out.push({ id: 'sellBook', param: k, label: `${SEG[k].n}: למכור רבע מהספר (${ctx.fmtM(r1000(s.book * 0.25))})`, enabled: s.book >= 10e6, suggested: cr < REG.min + 0.005 && SEG[k].rw >= 0.85 && s.book >= 10e6 }); }
  for (const v of ['low', 'mid', 'high']) out.push({ id: 'liq', param: v, label: `נזילות ${Math.round(FUND.liq[v] * 100)}% מהפיקדונות`, enabled: B.liq !== v, suggested: B.liq !== v && v === (B.conf < 50 ? 'high' : 'mid') });
  out.push({ id: 'raise', param: null, label: `גיוס הון: ${ctx.fmtM(r1000(B.eq * RAISE.share))} בהנחה של 15% (דילול)`, enabled: B.eq > 0, suggested: cr < REG.min + 0.01 });
  const p12 = B.profit12.reduce((a, b) => a + b, 0); const amt = r1000(Math.max(0, p12) * 0.25 * B.stake);
  out.push({ id: 'dividend', param: null, label: `דיבידנד (${ctx.fmtM(amt)})`, enabled: B.ban < pays && amt >= 1e6 && B.div < pays, suggested: B.ban < pays && amt >= 1e6 && B.div < pays && cr >= 0.125 && st.cash < ctx.expenses(st) * 6 });
  return out;
}
function indicatorsOf(st, ctx) {
  const B = CR(st); const cr = capRatio(st); const target = ((ctx.world(st).goal || {}).of || []).find((g) => g.key === 'equity') || {};
  const rows = SEGS.map((k) => { const s = B.seg[k]; return { seg: k, name: SEG[k].n, book: s.book, fixShare: s.book ? round2(s.fixBook / s.book) : 0, yieldPct: yieldOf(st, k), fixYield: s.fixY, delta: s.delta, stop: !!s.stop, pd: pdBand(st, k), lgd: SEG[k].lgd, rw: SEG[k].rw, newVol: s.newVol, newPdMult: s.pdNew, lastLoss: B.last ? B.last.hit[k] || 0 : 0 }; });
  return {
    credit: { equity: ownerEquity(st), bankEquity: B.eq, stake: B.stake, target: target.target || 0, capRatio: cr, capMin: REG.min, capTarget: REG.target, rwa: Math.round(rwa(st)), loans: loans(st), retail: B.ret, wholesale: B.wh, liquid: B.liqA, cbWindow: B.cbw, liq: B.liq, rate: B.rate, retailRate: B.rr, wholesaleRate: whRate(st),
      conf: B.conf, runAt: CONF.run, runs: B.runs, regs: B.regs, banUntil: B.ban, last: B.last, profit12: B.profit12.reduce((a, b) => a + b, 0), provisions: B.prov, raised: B.raised, sold: B.sold, pdNew: B.newPdSum, newVol: B.newVolSum, slump: B.slump >= st.month },
    panel: { id: 'credit', title: 'הבנק', gauges: [{ id: 'capRatio', label: 'יחס הון', value: cr, ref: REG.target, min: 0, max: 0.2 }, { id: 'conf', label: 'אמון המפקידים', value: B.conf, ref: CONF.run, min: 0, max: 100 },
      { id: 'equity', label: 'ההון שלך מול היעד', value: ownerEquity(st), ref: target.target || 0, unit: '₪' }, { id: 'rate', label: 'ריבית בנק ישראל (%)', value: B.rate, ref: RATE.start }], rows, actions: actionList(st, ctx) },
  };
}
export default credit;
