// Rule adapter `funds` — w20 רחוב הקרנות (CATALOG-25 §1.4 w20, §2.2; docs/full-upgrade/worlds/w20-funds.md). You manage other people's
// money: a fund of 12 fictional listed companies (the `market` pool's names; betas, a sealed alpha each, a public research signal, short
// interest), long and short books with no margin (longs ≤ 100 % of the fund, shorts ≤ 50 %), and the clients' money flowing in and out by
// your trailing 12-month return vs the index (the `portfolio` options `flows` + `short`, re-implemented here). The distinct rule — asymmetric
// fees vs flow risk: 1.5 % a year on assets + 20 % of the return ABOVE THE INDEX past the high-water mark, so hugging the benchmark keeps
// clients but earns only the management fee; active bets earn the performance fee or bring redemptions — paid a month after notice, by
// selling into the lows (a liquidity cost that grows with the regime and your gross exposure). Shorts pay a borrow fee by crowdedness,
// lose without limit in a squeeze, and are banned (forced cover) in a crash. A gate caps redemptions at 10 % a month (reputation −; ★★★ none).
//
// Contract (DESIGN §4.2): a mech-contract object, all state in st.world.funds (V-adapter); pure, deterministic, no engine import; only + − × ÷
// and Math.round / min / max / floor / abs. Fixed 'world' draws: init 26 (2 per company · the regime · the anchor client's month), every
// payday 16 (the regime · the index noise · one idiosyncratic draw per company · the client flows · an event target), 'W' landing 3.
import { COMPANIES } from '../data/companies.js';

export const ID = 'funds';
export const KEYS = Object.freeze(['shgl', 'rbng', 'orfn', 'btsh', 'rhgl', 'mygr', 'slbt', 'ofyf', 'mral', 'gnmk', 'knym', 'pldz']);
export const N = KEYS.length;
export const DRAWS = Object.freeze({ init: 2 * N + 2, month: N + 4, landing: Object.freeze({ W: 3 }) });
export const REG = Object.freeze({
  bull: Object.freeze({ label: 'שוק שורי', idx: 0.016, flow: 0.002, liq: 0.02 }), normal: Object.freeze({ label: 'שוק רגיל', idx: 0.007, flow: 0, liq: 0.03 }),
  bear: Object.freeze({ label: 'שוק דובי', idx: -0.014, flow: -0.006, liq: 0.06 }), crash: Object.freeze({ label: 'קריסה', idx: -0.07, flow: -0.02, liq: 0.15 }) });
/** TUNE: book limits and step, fees, cash rate, borrow fee, flow sensitivities, redemption gate, the index product, squeeze / fraud odds. */
export const FL = Object.freeze({ step: 0.05, coCap: 0.3, longCap: 1, shortCap: 0.5, mgmt: 0.015, perf: 0.2, cash: 0.003, borrow: 0.01, borrowK: 0.15, aMax: 0.013,
  flowK: 0.06, ddCut: -0.08, ddFlow: -0.02, fMin: -0.15, fMax: 0.06, gate: 0.1, gateM: 3, gateRep: 0.15, repLow: 0.6, repHigh: 1.2,
  idxFee: 0.003, idxIn: 0.005, idxCost: 5000000, idxStart: 0.05, seed: 10000000, squeeze: 0.05, fraud: 0.03, crowdSq: 0.55, anchorCut: 0.3 });
const CO = Object.freeze(KEYS.map((k) => COMPANIES.find((c) => c.key === k)));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;
const F = (st) => st.world.funds;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function news(out, t) { out.news.push({ kind: 'funds', text: t }); }
export const fundAum = (st) => Math.round(F(st).ext + F(st).mine);
export const aum = (st) => Math.round(fundAum(st) + (F(st).idxP ? F(st).idxP.aum : 0));
export const longSum = (st) => round3(F(st).cos.reduce((s, c) => s + Math.max(0, c.w), 0));
export const shortSum = (st) => round3(F(st).cos.reduce((s, c) => s + Math.max(0, -c.w), 0));
export const gross = (st) => round3(longSum(st) + shortSum(st));
export const borrowFee = (c) => round4(FL.borrow + FL.borrowK * c.crowd * c.crowd); // a year, on the short's size
const prod = (xs) => xs.reduce((p, x) => p * (1 + x), 1);
/** Trailing 12-month fund return − the index's (0 before any payday). */
export const rel12 = (st) => round4(prod(F(st).ring) - prod(F(st).iring));
export const ret12 = (st) => round4(prod(F(st).ring) - 1);
const dd3 = (st) => prod(F(st).ring.slice(-3)) - 1;
const banned = (st) => F(st).regime === 'crash';
const gateOn = (st) => F(st).gateUntil >= st.month;
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'funds') { a.value = r1000(Math.max(0, F(st).mine)); a.debt = 0; } }
/** An instant move of the book (a market card): every position × its company's shock; the pools and the relative index move with it. */
function shock(st, k, s) { const S = F(st); const R = Math.max(-0.9, S.cos.reduce((t, c, i) => t + c.w * (k == null || k === i ? s : 0), 0)); const I = k == null ? s : s / N;
  S.ext = Math.round(S.ext * (1 + R)); S.mine = Math.round(S.mine * (1 + R)); S.acc = (1 + S.acc) * (1 + R) - 1; S.iacc = (1 + (S.iacc || 0)) * (1 + I) - 1; S.rel = S.rel * (1 + R) / (1 + I); if (k != null) S.cos[k].px = round3(S.cos[k].px * (1 + s)); return R; }
const mostCrowded = (st) => { const S = F(st); let k = 0; for (let i = 1; i < N; i++) if (S.cos[i].crowd > S.cos[k].crowd) k = i; return k; };

export const funds = {
  id: ID, draws: DRAWS, uses: ['market', 'portfolio'],
  lessons: ['other_money', 'short_squeeze'],
  mentorKeys: ['regime', 'outflow', 'inflow', 'squeeze', 'fraud', 'ban', 'anchor', 'offerAsk', 'offerTake', 'offerPass'],
  sealed: ['world.funds.cos[].a', 'world.funds.anchor.m', 'world.funds.hot', 'pending.wr', 'pending.item.h'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 26 'world' draws at init, whoever plays
    const S0 = (ch && ch.start) || {}; const sg = S0.sigma || 0.008;
    const cos = CO.map((c, i) => { const u1 = rs[2 * i], u2 = rs[2 * i + 1]; const a = round4(-FL.aMax + 2 * FL.aMax * u1);
      return { k: c.key, a, sig: round4(a + (u2 - 0.5) * 2 * sg), beta: round3(c.beta[0] + (c.beta[1] - c.beta[0]) * frac(u1 * 7.31)), vol: round3((c.vol[0] + c.vol[1]) / 2),
        crowd: round3(clamp(0.5 - a / FL.aMax * 0.35 + (frac(u2 * 13.7) - 0.5) * 0.5, 0, 1)), w: 1 / N, px: 100, last: 0 }; });
    const ext = S0.aum || 1000000000; const mine = S0.mine || 80000000;
    st.world.funds = { cos, sigma: sg, react: S0.react || 1, rep: S0.rep || 1, ext, mine, peak: ext + mine, start: ext + mine, regime: rs[2 * N] < 0.15 ? 'bear' : rs[2 * N] > 0.85 ? 'bull' : 'normal',
      rel: 1, hwm: 1, ring: [], iring: [], acc: 0, iacc: 0, pend: 0, gateUntil: -1, gates: 0, bans: 0, squeezes: 0, sqHit: 0, sqBlow: 0, sqNow: false, frauds: 0, spirals: 0, inSpiral: false, feeK: 1, hot: 0, hotLock: 0,
      idxP: null, anchor: S0.anchor ? { frac: S0.anchor, m: 6 + Math.floor(rs[2 * N + 1] * 48), done: false } : null, fees: 0, feeM: 0, perfM: 0, last: null, evR: 0, worstM: 0 };
  },
  defaults(st) { const S = F(st); if (!S) return; if (!Array.isArray(S.ring)) S.ring = []; if (!Array.isArray(S.iring)) S.iring = []; },

  monthly(st, out, ctx) {
    const S = F(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 16 'world' draws every payday
    const m = st.month; const u = rs[0]; const old = S.regime; S.evR = rs[N + 3];
    // 1. the regime: bull ↔ normal ↔ bear → crash (a crash lasts one or two months, then a bear market)
    S.regime = old === 'bull' ? (u < 0.08 ? 'normal' : 'bull') : old === 'normal' ? (u < 0.07 ? 'bull' : u > 0.93 ? 'bear' : 'normal') : old === 'bear' ? (u < 0.12 ? 'normal' : u > 0.94 ? 'crash' : 'bear') : (u < 0.5 ? 'bear' : 'crash');
    if (S.regime !== old) news(out, ctx.mentorLine(st, 'regime', { label: REG[S.regime].label }) || `השוק: ${REG[S.regime].label}. הלקוחות מסתכלים על התשואה שלך מול המדד.`);
    const RG = REG[S.regime]; const mkt = round4(RG.idx + (rs[1] - 0.5) * 0.04);
    // 2. the companies: beta × the market + the sealed alpha + noise (one draw each); a squeeze or a fraud (the event target). The index =
    //    the 12 companies equally weighted, so hugging it (1/12 each) returns exactly the index
    const r = S.cos.map((c, i) => round4(c.beta * mkt + c.a + (rs[2 + i] - 0.5) * 2 * c.vol * 1.7));
    const ev = rs[N + 3];
    if (ev < FL.squeeze) { const k = mostCrowded(st); if (S.cos[k].crowd >= FL.crowdSq) { const j = round3(0.3 + 0.5 * frac(ev * 97)); r[k] = round4(r[k] + j); S.squeezes++; if (S.cos[k].w < 0) { S.sqHit++; S.sqNow = true; ctx.lesson(st, out, 'short_squeeze'); }
      news(out, ctx.mentorLine(st, 'squeeze', {}) || `סחיטת שורט ב${CO[k].name}: המניה קפצה ${Math.round(j * 100)}%. מי שמכר בחסר נאלץ לקנות בחזרה ביוקר.`); S.cos[k].crowd = round3(S.cos[k].crowd * 0.5); } }
    else if (ev < FL.squeeze + FL.fraud) { const k = Math.floor(frac(ev * 53) * N); const c = S.cos[k]; r[k] = round4(r[k] - 0.5); c.a = -0.015; c.sig = -0.015; c.crowd = 0; S.frauds++;
      news(out, ctx.mentorLine(st, 'fraud', {}) || `נחשפה הונאה ב${CO[k].name}: המניה נפלה בחצי. מי שהחזיק אותה בחסר — הרוויח.`); }
    S.cos.forEach((c, i) => { c.last = r[i]; c.px = round3(c.px * (1 + r[i])); }); const idx = r.reduce((a, b) => a + b / N, 0); // unrounded: a hugging book (1/12 each) tracks it to the last bit
    // 3. the fund's month: the book × the returns − borrow fees on shorts + the cash rate on what is not invested long
    let R = S.cos.reduce((t, c, i) => t + c.w * r[i] - (c.w < 0 ? -c.w * borrowFee(c) / 12 : 0), 0) + Math.max(0, 1 - longSum(st)) * FL.cash; R = Math.max(-0.9, R);
    S.ext = Math.round(S.ext * (1 + R)); S.mine = Math.round(S.mine * (1 + R)); S.rel = S.rel * (1 + R) / (1 + idx);
    if (banned(st) && S.cos.some((c) => c.w < 0)) { for (const c of S.cos) if (c.w < 0) c.w = 0; S.bans++; news(out, ctx.mentorLine(st, 'ban', {}) || 'הרגולטור אסר על מכירה בחסר בזמן הקריסה: כל השורטים נסגרו בכוח, במחיר של היום.'); }
    // 4. redemptions noticed last month are paid now — by selling into the market (a liquidity cost that grows with the regime and gross)
    let paid = 0; if (S.pend > 0) { paid = Math.min(S.pend, S.ext, gateOn(st) ? Math.round(FL.gate * S.ext) : S.pend); const cost = Math.round(paid * RG.liq * Math.max(0.2, gross(st)));
      S.ext = Math.max(0, S.ext - paid); S.pend = Math.max(0, S.pend - paid); const k = (S.ext + S.mine) > 0 ? cost / (S.ext + S.mine) : 0; S.ext = Math.round(S.ext * (1 - k)); S.mine = Math.round(S.mine * (1 - k)); R = (1 + R) * (1 - k) - 1; S.rel = S.rel * (1 - k);
      if (paid > 0.05 * (S.ext + paid)) news(out, ctx.mentorLine(st, 'outflow', {}) || `לקוחות משכו ${ctx.fmtM(paid)}. כדי לשלם, הקרן מכרה מניות — גם במחיר הנמוך של היום.`); }
    const Rm = (1 + R) * (1 + S.acc) - 1; const Im = (1 + idx) * (1 + (S.iacc || 0)) - 1; if (S.sqNow && Rm <= -0.15) S.sqBlow++; S.sqNow = false; S.acc = 0; S.iacc = 0; S.ring.push(Rm); S.iring.push(Im); while (S.ring.length > 12) S.ring.shift(); while (S.iring.length > 12) S.iring.shift();
    // 5. fees: management on the clients' money; performance = 20 % of the return above the index past the high-water mark
    const mg = Math.round(S.ext * FL.mgmt / 12 * S.feeK); let pf = 0; if (S.rel > S.hwm) { pf = Math.round(FL.perf * (S.rel / S.hwm - 1) * S.ext * S.feeK); S.hwm = S.rel; }
    const ix = S.idxP ? Math.round(S.idxP.aum * FL.idxFee / 12) : 0; const fee = r1000(mg + pf + ix); S.ext = Math.max(0, S.ext - mg - pf); S.fees += fee; S.feeM = r1000(mg + ix); S.perfM = r1000(pf);
    if (fee > 0) { st.cash += fee; ctx.cashFx(out, fee, 'דמי ניהול והצלחה'); }
    // 6. the clients: flows by the trailing 12-month return vs the index, the regime and a drawdown (one draw); outflows are a NOTICE
    const rl = rel12(st); let f = S.react * (RG.flow + FL.flowK * rl + (dd3(st) < FL.ddCut ? FL.ddFlow : 0) + (rs[N + 2] - 0.5) * 0.01); if (f > 0) f *= S.rep; f = clamp(round4(f), FL.fMin, FL.fMax);
    if (f > 0) { const add = Math.round(S.ext * f); S.ext += add; if (add > 0.02 * S.ext) news(out, ctx.mentorLine(st, 'inflow', {}) || `לקוחות חדשים: ${ctx.fmtM(add)} נכנסו לקרן.`); }
    else if (f < 0) S.pend += Math.round(S.ext * -f);
    if (S.hot > 0 && dd3(st) < -0.05 && S.hotLock < m) { S.pend += Math.min(S.hot, S.ext); news(out, `משקיע שנכנס לאחרונה ביקש את כל כספו בחזרה אחרי שלושה חודשים רעים: ${ctx.fmtM(Math.min(S.hot, S.ext))}.`); S.hot = 0; }
    if (S.anchor && !S.anchor.done && m >= S.anchor.m) { const amt = Math.round(S.ext * S.anchor.frac * FL.anchorCut); S.pend += amt; S.anchor.done = true; ctx.lesson(st, out, 'other_money'); news(out, ctx.mentorLine(st, 'anchor', {}) || `הלקוח הגדול שלך הודיע: הוא מושך ${ctx.fmtM(amt)} בחודש הבא. זה לא קשור אלייך — הוא צריך את הכסף.`); }
    if (S.pend > 0.08 * S.ext) ctx.lesson(st, out, 'other_money');
    // 7. reputation, the spiral record, the index product
    if (rl > 0.05) S.rep = clamp(round3(S.rep + 0.01), FL.repLow, FL.repHigh); else if (rl < -0.1) S.rep = clamp(round3(S.rep - 0.01), FL.repLow, FL.repHigh);
    const A = S.ext + S.mine; if (A > S.peak) S.peak = A; const sp = A < 0.5 * S.peak; if (sp && !S.inSpiral) S.spirals++; S.inSpiral = sp; if (Rm < S.worstM) S.worstM = Rm;
    if (S.idxP) S.idxP.aum = Math.round(S.idxP.aum * (1 + idx + (S.regime === 'bear' || S.regime === 'crash' ? -0.005 : FL.idxIn)));
    S.last = { R: Rm, idx, paid, f, fee: fee }; if (m === st.maxMonths) S.aumLim = aum(st); revalue(st);
  },
  asset: { create(st, a, card) { a.op = JSON.parse(JSON.stringify(card.op)); if (a.op.ck === 'funds') { a.value = r1000(F(st).mine); a.debt = 0; } }, cf() { return 0; } },
  market: {
    create(st, p, ctx) { const c = p.card; const S = F(st); const k = Math.floor(frac(S.evR * 31) * N);
      if (c.mk === 'squeeze') { const q = mostCrowded(st); if (S.cos[q].w < 0) { S.sqHit++; S.sqNow = true; } S.squeezes++; p.hit = round3(shock(st, q, c.jump || 0.4)); p.co = CO[q].name; S.cos[q].crowd = round3(S.cos[q].crowd * 0.5); }
      if (c.mk === 'fraud') { const x = S.cos[k]; p.hit = round3(shock(st, k, -0.45)); x.a = -0.015; x.sig = -0.015; x.crowd = 0; S.frauds++; p.co = CO[k].name; }
      if (c.mk === 'unwind') { let R = 0; S.cos.forEach((x, i) => { if (x.crowd >= 0.6) R += shock(st, i, 0.15); }); p.hit = round3(R); }
      if (c.mk === 'ban' && (S.regime === 'bear' || S.regime === 'crash')) { for (const x of S.cos) if (x.w < 0) x.w = 0; S.bans++; }
      if (c.mk === 'conference') S.pend = Math.max(0, S.pend - Math.round(S.ext * 0.02 * S.rep));
      if (c.mk === 'analyst') S.rep = clamp(round3(S.rep - 0.05), FL.repLow, FL.repHigh);
      revalue(st); },
    describe(st, p, ev) { const S = F(st); ev.data.funds = { mk: p.card.mk, regime: S.regime, hit: p.hit ?? null, co: p.co || null }; },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const S = F(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'funds') continue;
    m.aum = aum(st); m.peak = S.peak; m.pending = S.pend; m.gate = gateOn(st); m.book = S.cos.map((c) => ({ co: c.k, w: c.w })); m.idxProduct = !!S.idxP; } },
  recapHint(st) { const S = F(st); if (!S) return null; if (S.sqHit) return 'בפעם הבאה: שורט על מניה שכולם מוכרים בחסר הוא הימור שאין לו תקרה. כשהיא קופצת — כולם קונים בחזרה ביחד.'; if (S.spirals) return 'בפעם הבאה: הלקוחות בורחים בדיוק בתחתית. סיכון קטן יותר לפני משבר שומר את הכסף שלהם — ואת שלך.'; if (gross(st) < 1.05 && Math.abs(rel12(st)) < 0.01) return 'בפעם הבאה: מי שמחקה את המדד שומר על הלקוחות, אבל לא מרוויח את דמי ההצלחה.'; return null; },
  goalValue(st, key) { if (key === 'aum') return aum(st); if (key === 'rel12') return rel12(st); return 0; },
  starGates(st) { return [{ id: 'noGate', stars: 3, ok: F(st).gates === 0, label: 'בלי לנעול פדיונות אף פעם' }]; },
};

/* ---------------------------------------------------------------- 'W' — an allocator offers a mandate */
const HOT = ['קרן פנסיה', 'משרד משפחתי', 'קרן של קרנות'];
funds.tiles.W = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 3 'world' draws on every W landing
    const h = round3(rs[2]); const label = clamp(Math.floor((h + (rs[0] - 0.5) * 0.4) * 3), 0, 2);
    return { wr: rs, item: { amt: r1000(fundAum(st) * (0.05 + 0.1 * rs[0])), fee: round3(0.6 + 0.4 * rs[1]), h, label } }; },
  describe(st, p, ev, ctx) {
    const it = p.item; ev.tag = 'משקיע חדש'; ev.title = `${HOT[it.label]} רוצה להשקיע אצלך`;
    ev.text = `${ctx.fmtM(it.amt)} לקרן, בתנאי שתגבה ממנו רק ${Math.round(it.fee * 100)}% מדמי הניהול וההצלחה. ${it.label === 2 ? 'כסף כזה נוטה לברוח בחודש רע.' : it.label === 0 ? 'כסף כזה נוטה להישאר.' : 'קשה לדעת כמה הוא סבלני.'}`;
    ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'כסף חדש מגדיל את הקרן — אבל אם הוא יברח בחודש רע, תמכור בתחתית בשבילו.';
    ev.data = { kind: 'mandate', amount: it.amt, feeShare: it.fee, type: HOT[it.label], patience: ['high', 'mixed', 'low'][it.label], lockFee: round3(it.fee * 0.8) };
    ev.options = [ctx.opt('take', `לקבל (${ctx.fmtM(it.amt)})`, true, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 0, risk: 'sealed:h' }, note: 'הכסף יכול לברוח בחודש רע' }),
      ctx.opt('lock', `לקבל עם נעילה לשנה (רק ${Math.round(it.fee * 80)}% מהדמים)`, true, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 0, risk: null }, note: 'לא יכול למשוך שנה' }),
      ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
    ev.forcePrimary = it.label === 2 ? 'lock' : 'take';
  },
  choose(st, p, o, params, out, ctx) {
    const S = F(st); const it = p.item;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'offerPass', {}) || null; ctx.logDecision(st, 'משקיע חדש', 'ויתר'); return true; }
    const k = o.id === 'lock' ? round3(it.fee * 0.8) : it.fee; S.feeK = round4((S.feeK * S.ext + k * it.amt) / Math.max(1, S.ext + it.amt)); S.ext += it.amt;
    if (o.id === 'lock') S.hotLock = Math.max(S.hotLock, st.month + 12); S.hot += Math.round(it.amt * it.h);
    revalue(st); ctx.lesson(st, out, 'other_money'); out.mentor = ctx.mentorLine(st, 'offerTake', {}) || null; ctx.logDecision(st, 'משקיע חדש', o.id === 'lock' ? 'קיבל עם נעילה' : 'קיבל', it.amt); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
const coOf = (st, p) => F(st).cos.find((c) => c.k === p);
/** One 5 % step up or down, snapped to the 5 % grid (a hugging 8.3 % → 10 % or 5 %). */
const stepTo = (w, d) => round3((d > 0 ? Math.floor(w / FL.step + 1e-6) + 1 : Math.ceil(w / FL.step - 1e-6) - 1) * FL.step);
funds.act = {
  buy(st, p, out) { const c = coOf(st, p); if (!c) return fail(out, 'bad_param'); const nw = stepTo(c.w, FL.step); if (nw > FL.coCap + 1e-9) return fail(out, 'יותר מדי במניה אחת');
    if (nw > 0 && longSum(st) + Math.max(0, nw) - Math.max(0, c.w) > FL.longCap + 1e-9) return fail(out, 'בלי מינוף: עד 100% מהקרן'); c.w = nw; out.toast = c.w < 0 ? 'כיסית חלק מהשורט.' : `${Math.round(c.w * 100)}% מהקרן במניה.`; return true; },
  sell(st, p, out) { const c = coOf(st, p); if (!c) return fail(out, 'bad_param'); const nw = stepTo(c.w, -FL.step); if (nw < -FL.coCap - 1e-9) return fail(out, 'יותר מדי במניה אחת');
    if (nw < 0 && banned(st)) return fail(out, 'מכירה בחסר אסורה בזמן קריסה'); if (nw < 0 && shortSum(st) + Math.max(0, -nw) - Math.max(0, -c.w) > FL.shortCap + 1e-9) return fail(out, 'עד 50% מהקרן בשורט');
    c.w = nw; out.toast = c.w < 0 ? `שורט של ${Math.round(-c.w * 100)}% מהקרן. אין לזה תקרת הפסד.` : 'מכרת חלק.'; return true; },
  close(st, p, out) { const c = coOf(st, p); if (!c || !c.w) return fail(out, 'bad_param'); c.w = 0; out.toast = 'הפוזיציה נסגרה.'; return true; },
  hug(st, p, out) { const S = F(st); if (S.cos.every((c) => c.w === 1 / N)) return fail(out, 'כבר כך'); for (const c of S.cos) c.w = 1 / N; out.toast = 'התיק מחקה את המדד: בלי שורט, בלי הימורים.'; return true; },
  derisk(st, p, out) { const S = F(st); if (gross(st) < 0.1) return fail(out, 'אין מה להקטין'); for (const c of S.cos) c.w = round3(Math.round(c.w / 2 / 0.001) * 0.001); out.toast = 'הקטנת את כל הפוזיציות בחצי.'; return true; },
  gate(st, p, out) { const S = F(st); if (gateOn(st)) return fail(out, 'כבר נעול'); if (S.pend <= 0) return fail(out, 'אין בקשות פדיון'); S.gateUntil = st.month + FL.gateM - 1; S.gates++; S.rep = clamp(round3(S.rep - FL.gateRep), FL.repLow, FL.repHigh);
    out.toast = 'נעלת פדיונות לשלושה חודשים: עד 10% בחודש. הלקוחות יזכרו את זה.'; return true; },
  launch(st, p, out, ctx) { const S = F(st); if (S.idxP) return fail(out, 'כבר קיימת'); if (st.cash < FL.idxCost) return fail(out, 'אין מספיק מזומן'); st.cash -= FL.idxCost; S.idxP = { aum: r1000(S.ext * FL.idxStart), m: st.month };
    out.toast = `השקת קרן מדד: ${ctx.fmtM(S.idxP.aum)} ממשקיעים שרוצים משהו יציב. דמי ניהול נמוכים — אבל הכסף נשאר.`; ctx.cashFx(out, -FL.idxCost, 'השקת קרן מדד'); return true; },
  seed(st, p, out, ctx) { const S = F(st); if (st.cash < FL.seed) return fail(out, 'אין מספיק מזומן'); st.cash -= FL.seed; S.mine += FL.seed; revalue(st); ctx.cashFx(out, -FL.seed, 'כסף שלך לקרן'); out.toast = `${ctx.fmtM(FL.seed)} מהכסף שלך נכנסו לקרן.`; return true; },
  draw(st, p, out, ctx) { const S = F(st); if (S.mine < FL.seed) return fail(out, 'אין מספיק בקרן'); S.mine -= FL.seed; st.cash += FL.seed; revalue(st); ctx.cashFx(out, FL.seed, 'משיכה מהקרן'); out.toast = `משכת ${ctx.fmtM(FL.seed)} מהקרן.`; return true; },
};
/** The guide's book: long the 5 best research signals, short the 2 worst that are not crowded; smaller in a bear market, no shorts in a crash. */
export function targetBook(st) {
  const S = F(st); const reg = S.regime; const lw = reg === 'bear' ? 0.1 : reg === 'crash' ? 0.05 : 0.2; const sw = reg === 'crash' ? 0 : reg === 'bear' ? 0.15 : 0.1;
  const order = S.cos.map((c, i) => i).sort((a, b) => S.cos[b].sig - S.cos[a].sig || a - b);
  const t = S.cos.map(() => 0); for (const i of order.slice(0, 5)) if (S.cos[i].sig > 0.001) t[i] = lw;
  let n = 0; for (const i of order.slice().reverse()) { if (n >= 2) break; const c = S.cos[i]; if (c.sig < -0.003 && c.crowd < 0.6 && t[i] === 0) { t[i] = -sw; n++; } }
  return t;
}
function actionList(st, ctx) {
  const S = F(st); const out = []; const t = targetBook(st); const ban = banned(st);
  S.cos.forEach((c, i) => { const name = CO[i].name; const lo = round4(c.sig - S.sigma), hi = round4(c.sig + S.sigma); const info = { co: c.k, name, w: c.w, target: t[i], beta: c.beta, crowd: c.crowd, borrowFee: borrowFee(c), signal: { lo, hi }, last: c.last };
    out.push({ id: 'buy', param: c.k, label: c.w < 0 ? `${name}: לכסות 5% מהשורט` : `${name}: לקנות 5% מהקרן`, enabled: stepTo(c.w, FL.step) <= FL.coCap + 1e-9 && (stepTo(c.w, FL.step) <= 0 || longSum(st) + Math.max(0, stepTo(c.w, FL.step)) - Math.max(0, c.w) <= FL.longCap + 1e-9), suggested: c.w < t[i] - 0.001 && (t[i] > 0 || c.w < 0), ...info });
    const sw = stepTo(c.w, -FL.step); out.push({ id: 'sell', param: c.k, label: c.w > 0 ? `${name}: למכור 5%` : `${name}: שורט של 5% (עמלת השאלה ${round3(borrowFee(c) * 100)}% בשנה)`, enabled: sw >= -FL.coCap - 1e-9 && (sw >= 0 || (!ban && shortSum(st) + Math.max(0, -sw) - Math.max(0, -c.w) <= FL.shortCap + 1e-9)), suggested: c.w > t[i] + 0.001 && (c.w > 0 || t[i] < 0), ...info });
    if (c.w) out.push({ id: 'close', param: c.k, label: `${name}: לסגור`, enabled: true, suggested: false, ...info }); });
  out.push({ id: 'hug', param: null, label: 'לחקות את המדד (בלי הימורים, בלי דמי הצלחה)', enabled: !S.cos.every((c) => c.w === 1 / N), suggested: false });
  out.push({ id: 'derisk', param: null, label: `להקטין את כל הסיכון בחצי (היום ${Math.round(gross(st) * 100)}%)`, enabled: gross(st) >= 0.1, suggested: false });
  out.push({ id: 'gate', param: null, label: 'לנעול פדיונות (עד 10% בחודש, שלושה חודשים)', enabled: !gateOn(st) && S.pend > 0, suggested: false });
  if (!S.idxP) out.push({ id: 'launch', param: null, label: `להשיק קרן מדד יציבה (${ctx.fmtM(FL.idxCost)})`, enabled: st.cash >= FL.idxCost, suggested: st.cash >= FL.idxCost + 3 * ctx.expenses(st) && st.month >= 3 });
  out.push({ id: 'seed', param: null, label: `להשקיע ${ctx.fmtM(FL.seed)} שלך בקרן`, enabled: st.cash >= FL.seed, suggested: st.cash >= FL.seed + 6 * ctx.expenses(st) + (S.idxP ? 0 : FL.idxCost) && S.regime !== 'crash' });
  out.push({ id: 'draw', param: null, label: `למשוך ${ctx.fmtM(FL.seed)} מהקרן`, enabled: S.mine >= FL.seed, suggested: false });
  return out;
}
function indicatorsOf(st, ctx) {
  const S = F(st); const nw = ctx.netWorth(st); const goal = ((ctx.world(st).goal || {}).of || []); const gA = goal.find((g) => g.key === 'aum') || {}; const gN = goal.find((g) => g.type === 'nw') || {};
  return {
    funds: { aum: aum(st), fund: fundAum(st), clients: Math.round(S.ext), mine: Math.round(S.mine), indexProduct: S.idxP ? S.idxP.aum : 0, aumTarget: gA.target || 0, netWorth: nw, nwTarget: gN.target || 0,
      regime: S.regime, regimeLabel: REG[S.regime].label, ret12: ret12(st), rel12: rel12(st), hwm: round4(S.hwm), rel: round4(S.rel), long: longSum(st), short: shortSum(st), gross: gross(st), net: round3(longSum(st) - shortSum(st)),
      pending: S.pend, gate: gateOn(st), gateUntil: S.gateUntil, gates: S.gates, rep: S.rep, react: S.react, feesTotal: S.fees, feeMonth: S.feeM, perfMonth: S.perfM, shortBan: banned(st), bans: S.bans, squeezes: S.squeezes, squeezeHits: S.sqHit, squeezeBlowups: S.sqBlow, frauds: S.frauds, spirals: S.spirals, worstMonth: S.worstM, aumAtLimit: S.aumLim ?? null, anchor: S.anchor ? { frac: S.anchor.frac, done: S.anchor.done } : null, last: S.last },
    panel: { id: 'funds', title: 'הקרן', gauges: [{ id: 'aum', label: 'כסף בניהול', value: aum(st), ref: gA.target || 0, unit: '₪' }, { id: 'nw', label: 'השווי שלך', value: nw, ref: gN.target || 0, unit: '₪' }, { id: 'rel', label: 'תשואה מול המדד (12 חודשים)', value: rel12(st), ref: 0, min: -0.3, max: 0.3 }, { id: 'gross', label: 'חשיפה ברוטו', value: gross(st), ref: 1, min: 0, max: 1.5 }],
      rows: S.cos.map((c, i) => ({ co: c.k, name: CO[i].name, w: c.w, beta: c.beta, crowd: c.crowd, signal: { lo: round4(c.sig - S.sigma), hi: round4(c.sig + S.sigma) }, last: c.last, px: c.px })), actions: actionList(st, ctx) },
  };
}
export default funds;
