// Rule adapter `bell` — w19 פעמון הבורסה (CATALOG-25 §1.4 w19, §2.2; docs/full-upgrade/worlds/w19-bell.md). Your company is listed (or about
// to be): a mature operating group of two divisions — plants and a retail chain, light models of w6 / w7 (EBITDA, growth capex that pays after
// 6 months, a division sale) — and a public share price that reacts to YOU: price = (trailing EBITDA × the sector multiple × your credibility ×
// the market's mood × the guidance premium − net debt) ÷ shares. The distinct rule — capital-markets actions with feedback: quarterly guidance
// (beat → mood and credibility up; miss → down hard; sandbagging is priced at once), buyback vs dividend vs a secondary offering (issue when the
// price is high), the IPO's month and float, an activist when the price lags its peers by 25 %.
//
// Contract (DESIGN §4.2): a mech-contract object, all state in st.world.bell (V-adapter); pure, deterministic, no engine import; only + − × ÷
// and Math.round / min / max / floor / abs. Fixed 'world' draws: init 2 (the sector regime · the first quarter's noise seed), every payday 5
// (one EBITDA draw per division · the sector regime · the market's mood noise · an event target), 'W' landing 3 (the target, its sealed
// quality, the price). `uses`: `market` (the `issuer` idea: your own listed price beside peers; the sector multiple by regime — re-implemented
// here, the market module draws 69 a payday on its own stream), `plant` and `chain` (their `light()` idea: one EBITDA line each, re-implemented).
export const ID = 'bell';
export const DIVS = Object.freeze(['plant', 'chain']);
export const DRAWS = Object.freeze({ init: 2, month: DIVS.length + 3, landing: Object.freeze({ W: 3 }) });
export const SECTOR = Object.freeze({ bull: Object.freeze({ label: 'שוק שורי', mult: 10, exit: 0.12, next: 'normal' }), normal: Object.freeze({ label: 'שוק רגיל', mult: 8, exit: 0.1 }), bear: Object.freeze({ label: 'שוק דובי', mult: 6, exit: 0.14, next: 'normal' }) });
export const GUIDE = Object.freeze({ low: Object.freeze({ k: 0.92, prem: -0.1, n: 'זהירה' }), mid: Object.freeze({ k: 1, prem: 0, n: 'מציאותית' }), high: Object.freeze({ k: 1.08, prem: 0.06, n: 'שאפתנית' }) });
export const FLOATS = Object.freeze([0.2, 0.3, 0.49]);
/** TUNE: division noise, growth capex (cost in months of the division's EBITDA, uplift, lag), maintenance, tax, interest, mood decay, guidance
 *  reactions, buyback / dividend / secondary sizes, IPO discount, activist threshold, credibility bounds. */
export const BL = Object.freeze({ noise: 0.12, growCost: 5, growUp: 0.08, growLag: 6, growEvery: 4, maint: 0.2, tax: 0.2, rate: 0.06, decay: 0.2, moodMax: 0.35,
  beat: 0.02, beatK: 0.5, miss: 0.05, missK: 0.8, credUp: 0.02, credDown: 0.08, credLow: 0.6, credHigh: 1.2, buy: 0.02, div: 0.02, sec: 0.05, secDisc: 0.95, ipoDisc: 0.9, activist: 0.75,
  flowBuy: 0, impact: 1.03, flowSec: -0.05, sellK: 0.9, oh: 2000000 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
const B = (st) => st.world.bell;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
export const ebitdaM = (st) => DIVS.reduce((s, k) => s + (B(st).div[k] ? B(st).div[k].e : 0), 0);
export const ttm = (st) => { const r = B(st).ring; return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 12) : ebitdaM(st) * 12; };
export const netDebt = (st) => B(st).debt - B(st).cash;
export const netDebtEbitda = (st) => { const e = ttm(st); return e > 0 ? round3(netDebt(st) / e) : 99; };
const credK = (st) => 0.85 + 0.3 * (B(st).cred - BL.credLow) / (BL.credHigh - BL.credLow);
/** Equity value: trailing EBITDA × the regime's multiple × credibility × (1 + mood + the guidance premium) − net debt (never below 5 % of EV). */
export function equityValue(st, mood = B(st).mood) { const S = B(st); const ev = ttm(st) * SECTOR[S.sector].mult * credK(st) * (1 + mood + (S.listed && S.guide ? GUIDE[S.guide].prem : 0)); return Math.round(Math.max(ev * 0.05, ev - netDebt(st))); }
export const price = (st) => round3(equityValue(st) / B(st).n);
/** What peers trade at: the same EBITDA at the regime multiple, neutral credibility and mood. */
export const peerPrice = (st) => round3(Math.max(ttm(st) * SECTOR[B(st).sector].mult * 0.05, ttm(st) * SECTOR[B(st).sector].mult - netDebt(st)) / B(st).n);
/** The market value of your stake (0 before the IPO: a private stake has no market price). */
export const stakeMkt = (st) => (B(st).listed ? r1000(B(st).sh * price(st)) : 0);
/** Your stake at a private multiple (in net worth before the IPO: 70 % of the listed value — no buyer at the market price). */
export const stakeValue = (st) => r1000(B(st).sh * price(st) * (B(st).listed ? 1 : 0.7));
/** The quarter's consensus: 3 months of today's EBITDA × 0.97 (analysts shade it; a realistic guide beats it most quarters). */
const expectQ = (st) => Math.round(ebitdaM(st) * 3 * 0.97);
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'bell') { a.value = stakeValue(st); a.debt = 0; } }
function news(out, t) { out.news.push({ kind: 'bell', text: t }); }

export const bell = {
  id: ID, draws: DRAWS, uses: ['market', 'plant', 'chain'],
  lessons: ['guidance_cred', 'buyback'],
  mentorKeys: ['beat', 'miss', 'activist', 'ipo', 'sector', 'offerAsk', 'offerBuy', 'offerPass'],
  sealed: ['pending.wr', 'pending.item.q'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 2 'world' draws at init, whoever plays
    const S0 = (ch && ch.start) || {}; const e = S0.ebitda || 10000000;
    st.world.bell = { div: { plant: { e: Math.round(e * 0.55), grow: [] , at: -99 }, chain: { e: Math.round(e * 0.45), grow: [], at: -99 } }, ring: [], cash: S0.cash || 50000000, debt: S0.debt || 300000000, n: 100000000, sh: Math.round(100000000 * (S0.stake || 0.8)),
      listed: !!S0.listed, ipoM: S0.listed ? -24 : 0, sector: rs[0] < 0.2 ? 'bear' : rs[0] > 0.8 ? 'bull' : 'normal', cred: S0.cred || 1, mood: 0, guide: S0.listed ? 'high' : null, gq: 0, qAct: 0, qM: 0, beats: 0, misses: 0, buys: 0, divs: 0, secs: 0, activists: 0, actAt: -99, divAt: S0.divAt ?? -99,
      family: !!S0.family, seed: round3(rs[1]), evR: 0, last: null, bought: 0, sold: 0 };
    const S = B(st); for (let i = 0; i < 12; i++) S.ring.push(e);
    if (S.listed) { S.gq = Math.round(expectQ(st) * GUIDE.high.k); S.qM = st.month + 3; } // the previous management promised too much
  },
  defaults(st) { const S = B(st); if (!S) return; if (!Array.isArray(S.ring)) S.ring = []; },

  monthly(st, out, ctx) {
    const S = B(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 5 'world' draws every payday
    const m = st.month; S.evR = rs[DIVS.length + 2];
    const R = SECTOR[S.sector]; if (rs[DIVS.length] < R.exit) { const old = S.sector; S.sector = R.next || (frac(rs[DIVS.length] * 17) < 0.5 ? 'bull' : 'bear'); if (old !== S.sector) news(out, ctx.mentorLine(st, 'sector', { label: SECTOR[S.sector].label }) || `הבורסה: ${SECTOR[S.sector].label}. המכפיל של הענף זז — וכך גם המחיר שלך.`); }
    // 1. the divisions: EBITDA with noise (one draw each); a growth investment lifts it 8 % six months after it was paid
    let e = 0; DIVS.forEach((k, i) => { const d = S.div[k]; if (!d) return; for (const g of d.grow) if (g.m === m) d.e = Math.round(d.e * (1 + BL.growUp)); d.grow = d.grow.filter((g) => g.m > m); d.cur = Math.round(d.e * (1 - BL.noise + 2 * BL.noise * rs[i])); e += d.cur; });
    S.ring.push(e); while (S.ring.length > 12) S.ring.shift();
    // 2. cash: EBITDA − maintenance − interest − tax − head office; the company's own cash pays down nothing by itself (the player chooses)
    const int = Math.round(S.debt * BL.rate / 12); const tax = Math.round(Math.max(0, e - int) * BL.tax); const fcf = Math.round(e * (1 - BL.maint) - int - tax - BL.oh); S.cash += fcf;
    if (S.cash < 0) { S.debt += -S.cash; S.cash = 0; } // a revolving facility covers a shortfall
    S.last = { ebitda: e, fcf, int, tax };
    // 3. the quarter: actual vs guidance (listed only)
    if (S.listed) { S.qAct += e;
      if (m >= S.qM) { const g = Math.max(1, S.gq); const r = S.qAct / g;
        if (r >= 1) { S.mood += BL.beat + BL.beatK * Math.min(0.2, r - 1) * (S.guide === 'low' ? 0.3 : 1); S.cred = clamp(S.cred + BL.credUp * (S.guide === 'low' ? 0.3 : 1), BL.credLow, BL.credHigh); S.beats++; news(out, ctx.mentorLine(st, 'beat', {}) || `הרבעון: ${ctx.fmtM(S.qAct)} מול הדרכה של ${ctx.fmtM(g)}. עמדת ביעד — והשוק מאמין לך יותר.`); }
        else { S.mood -= BL.miss + BL.missK * (1 - r); S.cred = clamp(S.cred - BL.credDown, BL.credLow, BL.credHigh); S.misses++; ctx.lesson(st, out, 'guidance_cred'); news(out, ctx.mentorLine(st, 'miss', {}) || `הרבעון: ${ctx.fmtM(S.qAct)} מול הדרכה של ${ctx.fmtM(g)}. פספסת — המניה נופלת, והאמון יורד.`); }
        S.qAct = 0; S.qM = m + 3; S.gq = Math.round(expectQ(st) * GUIDE[S.guide || 'mid'].k); } }
    // 4. the mood decays toward 0 with noise (1 draw); an activist when the price lags peers by 25 % (once a year); the family wants a dividend
    S.mood = round3(clamp(S.mood * (1 - BL.decay) + (rs[DIVS.length + 1] - 0.5) * 0.04, -BL.moodMax, BL.moodMax));
    if (S.listed && m - S.actAt >= 12 && price(st) < BL.activist * peerPrice(st)) { S.actAt = m; S.activists++; S.cred = clamp(S.cred - 0.05, BL.credLow, BL.credHigh); const amt = r1000(equityValue(st) * 0.03); payDiv(st, amt, out, ctx); news(out, ctx.mentorLine(st, 'activist', {}) || `קרן אקטיביסטית קנתה מניות: המחיר שלך נמוך ב־25% מהמתחרים. היא כפתה דיבידנד של ${ctx.fmtM(amt)} — והאמון בהנהלה ירד.`); }
    if (S.family && S.listed && m - S.divAt >= 12) { S.cred = clamp(S.cred - 0.02, BL.credLow, BL.credHigh); }
    revalue(st);
  },
  asset: {
    create(st, a, card) { a.op = JSON.parse(JSON.stringify(card.op)); if (a.op.ck === 'bell') { a.value = stakeValue(st); a.debt = 0; } },
    cf() { return 0; }, // the company keeps its cash; dividends are paid by Z:dividend
  },
  market: {
    create(st, p) { const c = p.card; const S = B(st);
      if (c.mk === 'mood') S.mood = round3(clamp(S.mood + (c.dm || 0), -BL.moodMax, BL.moodMax));
      if (c.mk === 'rotate') S.sector = c.to || 'normal';
      if (c.mk === 'lockup' && S.listed && st.month - S.ipoM <= 12) S.mood = round3(clamp(S.mood - 0.06, -BL.moodMax, BL.moodMax));
      revalue(st); },
    describe(st, p, ev) { const S = B(st); ev.data.bell = { mk: p.card.mk, price: price(st), sector: S.sector, listed: S.listed }; },
  },
  crisis: { create(st, p) { const c = p.card; const S = B(st); if (c.mk === 'outage') { const k = DIVS[Math.floor(S.evR * DIVS.length) % DIVS.length]; const d = S.div[k]; if (d) { const amt = r1000(d.e * (c.months || 1)); S.cash -= amt; if (S.cash < 0) { S.debt -= S.cash; S.cash = 0; } p.hit = amt; p.div = k; } } revalue(st); } },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const S = B(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'bell') continue;
    m.listed = S.listed; m.price = price(st); m.peer = peerPrice(st); m.candle = S.ring.slice(-6); m.divisions = DIVS.filter((k) => S.div[k]).map((k) => ({ div: k, ebitda: S.div[k].e, growing: S.div[k].grow.length })); m.activist = S.actAt === st.month; } },
  recapHint(st) { const S = B(st); if (!S) return null; if (S.misses >= 2) return 'בפעם הבאה: הדרכה היא הבטחה. מי שמבטיח יותר ממה שהוא יודע — משלם כשהרבעון מגיע.'; if (S.buys && S.sector === 'bull') return 'בפעם הבאה: קנייה עצמית בשוק שורי קונה מניות ביוקר. בשוק כזה מנפיקים, לא קונים.'; if (!S.listed) return 'בפעם הבאה: בלי הנפקה אין מחיר שוק — והיעד הוא שווי בבורסה.'; return null; },
  goalValue(st, key) { if (key === 'stakeMkt') return stakeMkt(st); if (key === 'netDebtEbitda') return netDebtEbitda(st); if (key === 'price') return price(st); return 0; },
};
function payDiv(st, amt, out, ctx) { const S = B(st); const pay = Math.min(amt, S.cash + 0); S.cash -= pay; if (S.cash < 0) { S.debt -= S.cash; S.cash = 0; } const mine = r1000(pay * S.sh / S.n); st.cash += mine; ctx.cashFx(out, mine, 'דיבידנד'); S.divs++; S.divAt = st.month; }

/* ---------------------------------------------------------------- 'W' — a bolt-on acquisition */
const tgtPrice = (st, it) => r1000(it.e * 12 * SECTOR[B(st).sector].mult * it.k);
bell.tiles.W = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 3 'world' draws on every W landing
    const div = rs[0] < 0.5 ? 'plant' : 'chain'; return { wr: rs, item: { div, e: r1000(ebitdaM(st) * (0.08 + 0.12 * frac(rs[0] * 7.3))), q: round3(0.8 + 0.4 * rs[1]), k: round3(0.75 + 0.3 * rs[2]) } }; },
  describe(st, p, ev, ctx) {
    const it = p.item; const S = B(st); const pr = tgtPrice(st, it); const shares = Math.round(pr / Math.max(0.001, price(st))); const ndAfter = round3((netDebt(st) + pr) / Math.max(1, ttm(st) + it.e * 12));
    ev.tag = 'רכישה משלימה'; ev.title = it.div === 'plant' ? 'מפעל מתחרה למכירה' : 'רשת חנויות קטנה למכירה';
    ev.text = `רווח תפעולי (EBITDA) של ${ctx.fmtM(it.e)} בחודש, במחיר ${ctx.fmtM(pr)} (${round3(pr / (it.e * 12))} פעמים הרווח השנתי). מכפיל הענף היום: ${SECTOR[S.sector].mult}.`;
    ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'לשלם במזומן ובחוב — או במניות? כמה המניה שלך שווה היום?';
    ev.data = { kind: 'boltOn', div: it.div, ebitda: it.e, price: pr, mult: round3(pr / (it.e * 12)), sectorMult: SECTOR[S.sector].mult, shares, ndAfter, listed: S.listed, quality: { lo: 0.8, hi: 1.2 } };
    ev.options = [ctx.opt('cash', `לקנות במזומן ובחוב (${ctx.fmtM(pr)})`, ndAfter <= 4.5, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 0, risk: 'sealed:q' }, note: 'מקופת החברה', reason: ndAfter <= 4.5 ? undefined : 'החוב יעלה מעל 4.5 פעמים הרווח' }),
      ctx.opt('shares', `לקנות במניות (${String(shares)} מניות חדשות)`, S.listed, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 0, risk: 'sealed:q' }, note: 'מדלל את החלק שלך', reason: S.listed ? undefined : 'רק לחברה רשומה' }),
      ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
    const cheap = pr / (it.e * 12) < SECTOR[S.sector].mult * 0.9; const rich = S.listed && price(st) > peerPrice(st) * 1.05;
    ev.forcePrimary = cheap && rich ? 'shares' : cheap && ndAfter <= 3 ? 'cash' : 'pass';
  },
  choose(st, p, o, params, out, ctx) {
    const S = B(st); const it = p.item;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'offerPass', {}) || null; ctx.logDecision(st, 'רכישה משלימה', 'ויתר'); return true; }
    const pr = tgtPrice(st, it); if (o.id === 'shares') { if (!S.listed) return true; S.n += Math.round(pr / Math.max(0.001, price(st))); S.mood = round3(clamp(S.mood + BL.flowSec / 2, -BL.moodMax, BL.moodMax)); }
    else { const nd = (netDebt(st) + pr) / Math.max(1, ttm(st) + it.e * 12); if (nd > 4.5) return true; const c = Math.min(S.cash, pr); S.cash -= c; S.debt += pr - c; }
    const d = S.div[it.div] || S.div[DIVS.find((k) => S.div[k])]; /* a sold division's bolt-on joins the other */ d.e += Math.round(it.e * it.q); for (let i = 0; i < S.ring.length; i++) S.ring[i] += Math.round(it.e * it.q); S.bought++; revalue(st); ctx.lesson(st, out, 'buyback');
    out.mentor = ctx.mentorLine(st, 'offerBuy', {}) || null; ctx.logDecision(st, 'רכישה משלימה', o.id === 'shares' ? 'במניות' : 'במזומן', pr); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
const mood = (st, d) => { const S = B(st); S.mood = round3(clamp(S.mood + d, -BL.moodMax, BL.moodMax)); };
bell.act = {
  ipo(st, p, out, ctx) { const S = B(st); const f = +p; if (S.listed) return fail(out, 'כבר רשומה'); if (!FLOATS.includes(f)) return fail(out, 'bad_param'); const add = Math.round(S.n * f / (1 - f));
    const cash = r1000(add * price(st) * BL.ipoDisc); S.n += add; S.cash += cash; S.listed = true; S.ipoM = st.month; S.guide = 'mid'; S.qAct = 0; S.qM = st.month + 3; S.gq = Math.round(expectQ(st) * GUIDE.mid.k); revalue(st);
    out.toast = `הנפקה: ${Math.round(f * 100)}% מהחברה לציבור תמורת ${ctx.fmtM(cash)}. מעכשיו יש לך מחיר בכל חודש.`; return true; },
  guide(st, p, out) { const S = B(st); if (!S.listed) return fail(out, 'רק לחברה רשומה'); if (!GUIDE[p]) return fail(out, 'bad_param'); if (S.guide === p) return fail(out, 'כבר כך'); S.guide = p; S.gq = Math.round(expectQ(st) * GUIDE[p].k);
    out.toast = `הדרכה ${GUIDE[p].n} לרבעון: ${Math.round(S.gq / 1e6)} מיליון`; revalue(st); return true; },
  buyback(st, p, out, ctx) { const S = B(st); if (!S.listed) return fail(out, 'רק לחברה רשומה'); const k = Math.round(S.n * BL.buy); const cost = r1000(k * price(st) * BL.impact); /* buying moves the price against you */ if ((netDebt(st) + cost) / Math.max(1, ttm(st)) > 4) return fail(out, 'החוב גבוה מדי');
    const c = Math.min(S.cash, cost); S.cash -= c; S.debt += cost - c; S.n -= k; S.buys++; mood(st, BL.flowBuy); ctx.lesson(st, out, 'buyback'); revalue(st); out.toast = `קנייה עצמית: ${ctx.fmtM(cost)} — 2% מהמניות. החלק שלך גדל.`; return true; },
  dividend(st, p, out, ctx) { const S = B(st); if (!S.listed) return fail(out, 'רק לחברה רשומה'); if (st.month - S.divAt < 6) return fail(out, 'פעם בחצי שנה'); const amt = r1000(equityValue(st) * BL.div); if (amt > S.cash + ttm(st)) return fail(out, 'אין מזומן'); payDiv(st, amt, out, ctx); revalue(st); out.toast = `דיבידנד: ${ctx.fmtM(amt)} לכל בעלי המניות.`; return true; },
  secondary(st, p, out, ctx) { const S = B(st); if (!S.listed) return fail(out, 'רק לחברה רשומה'); const k = Math.round(S.n * BL.sec); const cash = r1000(k * price(st) * BL.secDisc); S.n += k; S.cash += cash; S.secs++; mood(st, BL.flowSec); revalue(st); out.toast = `הנפקה משנית: ${ctx.fmtM(cash)} לקופה. החלק שלך קטן.`; return true; },
  repay(st, p, out, ctx) { const S = B(st); const amt = Math.floor(Math.min(S.cash, S.debt) / 1000) * 1000; if (amt <= 0) return fail(out, 'אין מה להחזיר'); S.cash -= amt; S.debt -= amt; revalue(st); out.toast = `החזרת ${ctx.fmtM(amt)} חוב.`; return true; },
  grow(st, p, out, ctx) { const S = B(st); const d = S.div[p]; if (!d) return fail(out, 'bad_param'); if (st.month - d.at < BL.growEvery) return fail(out, 'השקעה אחת לארבעה חודשים'); const cost = r1000(d.e * BL.growCost);
    const c = Math.min(S.cash, cost); S.cash -= c; S.debt += cost - c; d.at = st.month; d.grow.push({ m: st.month + BL.growLag }); revalue(st); out.toast = `השקעה בצמיחה: ${ctx.fmtM(cost)}. עוד 8% רווח בעוד חצי שנה.`; return true; },
  sell(st, p, out, ctx) { const S = B(st); const d = S.div[p]; if (!d || DIVS.filter((k) => S.div[k]).length < 2) return fail(out, 'bad_param'); const v = r1000(d.e * 12 * SECTOR[S.sector].mult * BL.sellK); S.cash += v; const share = d.e; S.div[p] = null; for (let i = 0; i < S.ring.length; i++) S.ring[i] = Math.max(0, S.ring[i] - share); S.sold++; revalue(st); out.toast = `מכרת את החטיבה ב־${ctx.fmtM(v)}.`; return true; },
};
function actionList(st, ctx) {
  const S = B(st); const out = []; const nd = netDebtEbitda(st); const P = price(st), Pp = peerPrice(st); const sec = S.sector;
  if (!S.listed) for (const f of FLOATS) out.push({ id: 'ipo', param: String(f), label: `הנפקה: ${Math.round(f * 100)}% לציבור (${ctx.fmtM(r1000(S.n * f / (1 - f) * P * BL.ipoDisc))})`, enabled: true, suggested: f === 0.3 && (sec !== 'bear' || st.month >= 18), float: f });
  if (S.listed) { const want = 'mid'; /* realistic: beats most quarters; low is priced at once, high misses */ for (const g of Object.keys(GUIDE)) if (g !== S.guide) out.push({ id: 'guide', param: g, label: `הדרכה ${GUIDE[g].n} (${ctx.fmtM(Math.round(expectQ(st) * GUIDE[g].k))} לרבעון)`, enabled: true, suggested: g === want });
    const k = Math.round(S.n * BL.buy); out.push({ id: 'buyback', param: null, label: `קנייה עצמית של 2% (${ctx.fmtM(r1000(k * P))})`, enabled: (netDebt(st) + k * P) / Math.max(1, ttm(st)) <= 4, suggested: sec === 'bear' && P < Pp && nd < 2 });
    out.push({ id: 'dividend', param: null, label: `דיבידנד (${ctx.fmtM(r1000(equityValue(st) * BL.div))})`, enabled: st.month - S.divAt >= 6, suggested: st.month - S.divAt >= 12 && (S.family || st.cash < 0) && nd < 2.5 });
    out.push({ id: 'secondary', param: null, label: `הנפקה משנית של 5% (${ctx.fmtM(r1000(S.n * BL.sec * P * BL.secDisc))})`, enabled: true, suggested: sec === 'bull' && P > Pp && nd > 2.5 }); }
  for (const k of DIVS) { const d = S.div[k]; if (!d) continue; const cost = r1000(d.e * BL.growCost); out.push({ id: 'grow', param: k, label: `${k === 'plant' ? 'המפעלים' : 'הרשת'}: השקעה בצמיחה (${ctx.fmtM(cost)})`, enabled: st.month - d.at >= BL.growEvery, suggested: st.month - d.at >= BL.growEvery && (netDebt(st) + cost) / Math.max(1, ttm(st)) <= 2.6, div: k, cost });
    out.push({ id: 'sell', param: k, label: `למכור את ${k === 'plant' ? 'המפעלים' : 'הרשת'} (${ctx.fmtM(r1000(d.e * 12 * SECTOR[sec].mult * BL.sellK))})`, enabled: DIVS.filter((x) => S.div[x]).length > 1, suggested: false, div: k }); }
  out.push({ id: 'repay', param: null, label: `להחזיר חוב (${ctx.fmtM(r1000(Math.min(S.cash, S.debt)))})`, enabled: S.cash > 0 && S.debt > 0, suggested: S.cash > 20000000 && S.debt > 0 && !(sec === 'bear' && S.listed && P < Pp && nd < 2) });
  return out;
}
function indicatorsOf(st, ctx) {
  const S = B(st); const nw = ctx.netWorth(st); const goal = ((ctx.world(st).goal || {}).of || []).find((g) => g.key === 'stakeMkt') || {};
  return {
    bell: { listed: S.listed, price: price(st), peer: peerPrice(st), shares: S.n, mine: S.sh, stakeMkt: stakeMkt(st), target: goal.target || 0, netWorth: nw, ebitdaM: ebitdaM(st), ttm: ttm(st), netDebt: netDebt(st), netDebtEbitda: netDebtEbitda(st), cash: S.cash, debt: S.debt,
      sector: S.sector, sectorLabel: SECTOR[S.sector].label, mult: SECTOR[S.sector].mult, cred: round3(S.cred), mood: S.mood, guide: S.guide, guideQ: S.gq, quarterSoFar: S.qAct, quarterEnd: S.qM, beats: S.beats, misses: S.misses, buys: S.buys, divs: S.divs, secs: S.secs, activists: S.activists, bought: S.bought, sold: S.sold, last: S.last },
    panel: { id: 'bell', title: 'החברה בבורסה', gauges: [{ id: 'stake', label: 'שווי החלק שלך בבורסה', value: stakeMkt(st), ref: goal.target || 0, unit: '₪' }, { id: 'nde', label: 'חוב נטו ÷ רווח תפעולי', value: netDebtEbitda(st), ref: 3, min: 0, max: 6, cmp: 'le' }, { id: 'cred', label: 'אמינות ההנהלה', value: round3(S.cred), ref: 1, min: BL.credLow, max: BL.credHigh }],
      rows: DIVS.filter((k) => S.div[k]).map((k) => ({ div: k, name: k === 'plant' ? 'המפעלים' : 'הרשת', ebitda: S.div[k].e, last: S.div[k].cur || 0, growing: S.div[k].grow.map((g) => g.m) })), actions: actionList(st, ctx) },
  };
}
export default bell;
