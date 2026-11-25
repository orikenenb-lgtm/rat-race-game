// Rule adapter `lbo` — w21 בית ההשקעות הפרטי (CATALOG-25 §1.4 w21, §2.2; docs/full-upgrade/worlds/w21-lbo.md). You run a buyout fund: LPs
// committed the capital, you buy companies in sealed-bid auctions against 2–4 rival funds (the `auction` idea: the rivals' bids follow each
// target's sealed potential, so the highest bid tends to win the worst surprises — the winner's curse; the 100-day plan narrows the band),
// fund each buy with LBO debt (the `credit` idea: ≤ 5 × EBITDA, a covenant on debt ÷ trailing EBITDA; a breach is cured with equity or the
// lender takes the company), fix the company over 18 months (`holding`-style light formulas: one EBITDA line, a cash sweep) and sell it
// (`market`: the exit multiple follows the regime) — trade sale, IPO, a secondary at −15 %, half now, or a dividend recap. The distinct rule —
// deadline-driven exits: only cash returned counts (DPI = distributions ÷ paid-in capital; marks count 0), and at the fund's end whatever is left
// is sold in whatever regime comes, at a forced-sale discount. You earn a share of the management fee and 20 % carry on every shekel past 1×.
//
// Contract (DESIGN §4.2): a mech-contract object, all state in st.world.lbo (V-adapter); pure, deterministic, no engine import; only + − × ÷
// and Math.round / min / max / floor / abs. Fixed 'world' draws: init 2 (the regime · a seed), every payday 8 (the regime · one EBITDA draw per
// slot, used or not · an event target), 'W' landing 4 (the sealed potential · the rivals · size and sector · the plan's jitter).
export const ID = 'lbo';
export const SLOTS = 6;
export const DRAWS = Object.freeze({ init: 2, month: SLOTS + 2, landing: Object.freeze({ W: 4 }) });
export const REG = Object.freeze({ bull: Object.freeze({ label: 'שוק שורי', mult: 10.5, e: 1.02, buy: 9 }), normal: Object.freeze({ label: 'שוק רגיל', mult: 9, e: 1, buy: 8 }),
  bear: Object.freeze({ label: 'שוק דובי', mult: 7, e: 0.94, buy: 6.5 }), crash: Object.freeze({ label: 'קריסה', mult: 5.5, e: 0.86, buy: 5.5 }) });
export const BIDS = Object.freeze({ low: 0.85, mid: 1, high: 1.15 });
export const SECT = Object.freeze(['מפעל', 'רשת חנויות', 'קבוצת מלונות', 'חברת תוכנה']);
/** TUNE: fees, carry, the fix (months, cash conversion), debt (rate, covenant, freeze cap), exits (forced discount, secondary, IPO), the plan. */
export const LB = Object.freeze({ mgmt: 0.015, mgmtLate: 0.01, invest: 36, share: 0.5, carry: 0.2, fixM: 18, conv: 0.6, noise: 0.06, rate: 0.07, rateBad: 0.02, levPrem: 0.02, cov: 5.5, levCap: 5, freezeCap: 2,
  forced: 0.7, sec: 0.85, ipoUp: 0.5, ipoFee: 0.05, ddFee: 0.004, recap: 5, ext: 12, extFee: 0.5, curse: 0.5, fixedUp: 2 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
const L = (st) => st.world.lbo;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function news(out, t) { out.news.push({ kind: 'lbo', text: t }); }
const ttm = (c) => c.ring.reduce((a, b) => a + b, 0);
export const lev = (c) => (ttm(c) > 0 ? round3(c.debt / ttm(c)) : 99);
/** A trade sale today: trailing EBITDA × the regime multiple (+1 once the fix is done, +1.5 with a strategic buyer) − debt, never below 0. */
export const saleValue = (st, c, k = 1) => { const S = L(st); const m = REG[S.regime].mult + (c.f >= 1 ? LB.fixedUp : 0) + (S.strat && S.strat.id === c.id && S.strat.until >= st.month ? 1.5 : 0); return r1000(Math.max(0, ttm(c) * m * k - c.debt)); };
/** Paid-in capital: everything called from the LPs so far (equity, cures, the 100-day plans, management fees) — never below 1 % of committed. */
export const paidIn = (st) => Math.max(L(st).C * 0.01, L(st).C - L(st).dry);
/** DPI = cash distributed ÷ PAID-IN capital (the industry definition; CATALOG-25 said ÷ committed — deviation, see w21-lbo.md). Marks count 0. */
export const dpi = (st) => round3(L(st).dist / paidIn(st));
export const nav = (st) => L(st).cos.reduce((s, c) => s + saleValue(st, c), 0);
export const fundEnd = (st) => L(st).end;
const covOf = (st, c) => LB.cov + (L(st).covUp >= st.month ? 1 : 0);
const freeze = (st) => L(st).freeze >= st.month;
const findC = (st, p) => L(st).cos.find((c) => String(c.id) === String(p));
/** Distribute exit cash: everything to the LPs' DPI; your carry = 20 % of what has come back past 1 × paid-in, less carry already paid (paid in cash; no clawback). */
function distribute(st, amt, out, ctx, label) { const S = L(st); if (amt <= 0) return; S.dist += amt; const cy = r1000(Math.max(0, (S.dist - paidIn(st)) * LB.carry - S.carryPaid));
  if (cy > 0) { st.cash += cy; S.carryPaid += cy; ctx.cashFx(out, cy, 'דמי הצלחה (קארי)'); } news(out, `${label}: ${ctx.fmtM(amt)} חזרו למשקיעים. הקרן החזירה עד עכשיו פי ${dpi(st)} מהכסף.`); }
function exit(st, c, amt, out, ctx, label) { const S = L(st); S.cos = S.cos.filter((x) => x !== c); S.exits++; S.exitLog.push({ m: st.month, how: label, amt, cost: c.eq }); if (S.exitLog.length > 12) S.exitLog.shift(); distribute(st, amt, out, ctx, label); revalue(st); }
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'lbo') { a.value = 0; a.debt = 0; } } // the fund is the LPs' money: nothing of it is in your net worth until carry is paid

export const lbo = {
  id: ID, draws: DRAWS, uses: ['auction', 'credit', 'holding', 'market'],
  lessons: ['winners_curse', 'exit_deadline'],
  mentorKeys: ['regime', 'breach', 'taken', 'forced', 'freeze', 'offerAsk', 'offerBuy', 'offerLost', 'offerPass'],
  sealed: ['pending.wr', 'pending.item.u', 'pending.item.rv', 'world.lbo.cos[].u'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 2 'world' draws at init, whoever plays
    const S0 = (ch && ch.start) || {}; const C = S0.fund || 3000000000;
    st.world.lbo = { C, dry: C, dist: 0, carryPaid: 0, fees: 0, cos: [], nextId: 1, regime: rs[0] < 0.15 ? 'bear' : rs[0] > 0.85 ? 'bull' : 'normal', lev: 4, end: S0.end || 72, ext: false, noExt: !!S0.noExt,
      fix: S0.fix || 1, up: S0.up || 1, edge: S0.edge || 1, freeze: -1, covUp: -1, hot: -1, strat: null, exits: 0, forced: 0, taken: 0, breaches: 0, recaps: 0, cures: 0, bought: 0, lostBids: 0, exitLog: [], evR: round3(rs[1]), last: null };
  },
  defaults(st) { const S = L(st); if (!S) return; if (!Array.isArray(S.cos)) S.cos = []; if (!Array.isArray(S.exitLog)) S.exitLog = []; },

  monthly(st, out, ctx) {
    const S = L(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 8 'world' draws every payday
    const m = st.month; const u = rs[0]; const old = S.regime; S.evR = round3(rs[SLOTS + 1]);
    S.regime = old === 'bull' ? (u < 0.08 ? 'normal' : 'bull') : old === 'normal' ? (u < 0.07 ? 'bull' : u > 0.93 ? 'bear' : 'normal') : old === 'bear' ? (u < 0.12 ? 'normal' : u > 0.94 ? 'crash' : 'bear') : (u < 0.5 ? 'bear' : 'crash');
    if (S.regime !== old) news(out, ctx.mentorLine(st, 'regime', { label: REG[S.regime].label }) || `השוק: ${REG[S.regime].label}. מכפיל המכירה של החברות זז.`);
    const R = REG[S.regime]; const rate = LB.rate + (S.regime === 'bear' || S.regime === 'crash' || freeze(st) ? LB.rateBad : 0);
    // 1. the companies: the fix progresses; EBITDA (one draw per slot); a cash sweep pays the debt down; the covenant
    for (let i = 0; i < SLOTS; i++) { const c = S.cos[i]; if (!c) continue; c.f = Math.min(1, round3(c.f + S.fix / LB.fixM));
      const em = Math.round(c.E / 12 * (1 + c.u * S.up * c.f) * R.e * (1 - LB.noise + 2 * LB.noise * rs[1 + i])); c.ring.push(em); while (c.ring.length > 12) c.ring.shift();
      const fcf = Math.round(em * LB.conv - c.debt * (rate + (c.prem || 0)) / 12); c.debt = Math.max(0, c.debt - fcf); c.held++; }
    for (const c of S.cos.slice()) { const cv = covOf(st, c); if (lev(c) <= cv) { c.breach = false; continue; }
      if (c.breach) { S.taken++; S.cos = S.cos.filter((x) => x !== c); ctx.lesson(st, out, 'exit_deadline'); news(out, ctx.mentorLine(st, 'taken', {}) || `${c.n}: החוב עבר את התנאי פעמיים ברצף. הבנק לקח את החברה — ההשקעה (${ctx.fmtM(c.eq)}) אבדה.`); continue; }
      c.breach = true; S.breaches++; news(out, ctx.mentorLine(st, 'breach', {}) || `${c.n}: החוב גבוה מפי ${cv} מהרווח. עד היום הבא של המשכורת צריך להזרים הון — או שהבנק ייקח את החברה.`); }
    // 2. fees: 1.5 % a year on committed for the investment period, then 1 % on the cost still invested (half after an extension); your share in cash
    const base = m <= LB.invest ? S.C : S.cos.reduce((s, c) => s + c.eq, 0); const fee = Math.round(base * (m <= LB.invest ? LB.mgmt : LB.mgmtLate) / 12 * (S.ext ? LB.extFee : 1));
    const fromDry = Math.min(S.dry, fee); S.dry -= fromDry; S.fees += fee; const mine = r1000(fee * LB.share); if (mine > 0) { st.cash += mine; ctx.cashFx(out, mine, 'דמי ניהול'); }
    // 3. the fund's end: whatever is left is sold now, in this regime, at a forced-sale discount
    if (m >= S.end && S.cos.length) { let tot = 0; for (const c of S.cos.slice()) { const v = saleValue(st, c, LB.forced); tot += v; S.forced++; exit(st, c, v, out, ctx, `מכירה כפויה של ${c.n}`); }
      ctx.lesson(st, out, 'exit_deadline'); news(out, ctx.mentorLine(st, 'forced', {}) || `הקרן הגיעה לסוף חייה: כל מה שנשאר נמכר עכשיו, ב${REG[S.regime].label}, בהנחה — ${ctx.fmtM(tot)}.`); }
    S.last = { regime: S.regime, fee, nav: nav(st) }; revalue(st);
  },
  asset: { create(st, a, card) { a.op = JSON.parse(JSON.stringify(card.op)); a.value = 0; a.debt = 0; }, cf() { return 0; } },
  market: {
    create(st, p, ctx) { const c = p.card; const S = L(st); const k = S.cos.length ? S.cos[Math.floor(S.evR * S.cos.length) % S.cos.length] : null;
      if (c.mk === 'freeze') S.freeze = st.month + 6;
      if (c.mk === 'strategic' && k) S.strat = { id: k.id, until: st.month + 3 };
      if (c.mk === 'quits' && k) { k.f = round3(Math.max(0, k.f - 0.3)); p.co = k.n; }
      if (c.mk === 'covreset') S.covUp = st.month + 12;
      if (c.mk === 'outbid') S.hot = st.month + 3;
      if (c.mk === 'window' && S.regime !== 'crash') S.regime = 'bull';
      p.co = p.co || (k ? k.n : null); revalue(st); },
    describe(st, p, ev) { const S = L(st); ev.data.lbo = { mk: p.card.mk, regime: S.regime, co: p.co || null }; },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const S = L(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'lbo') continue;
    m.dpi = dpi(st); m.end = S.end; m.month = st.month; m.companies = S.cos.map((c) => ({ id: c.id, kind: c.kind, fixed: c.f, lev: lev(c), breach: !!c.breach })); } },
  recapHint(st) { const S = L(st); if (!S) return null; if (S.forced) return 'בפעם הבאה: לקרן יש תאריך סיום. מי שמחכה לשיא מוכר בסוף במחיר של היום — בהנחה.'; if (S.taken) return 'בפעם הבאה: חוב גבוה על חברה במשבר מסתיים אצל הבנק. מינוף נמוך יותר קונה זמן.'; if (S.bought && S.lostBids === 0) return 'בפעם הבאה: מי שזוכה בכל מכרז כנראה משלם יותר מדי. קללת המנצח.'; return null; },
  goalValue(st, key) { if (key === 'dpi') return dpi(st); if (key === 'nav') return nav(st); return 0; },
};

/* ---------------------------------------------------------------- 'W' — a company for sale, by auction */
lbo.tiles.W = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st), ctx.draw(st)]; const S = L(st); // exactly 4 'world' draws on every W landing
    const u = round3(-0.3 + 1.2 * rs[0]); const n = 2 + Math.floor(rs[1] * 3); const kind = Math.floor(rs[2] * SECT.length) % SECT.length; const E = r1000(S.C * (0.02 + 0.045 * frac(rs[2] * 7.7)));
    const rv = []; for (let j = 0; j < n; j++) rv.push(round3((1 + LB.curse * u) * (0.72 + 0.28 * frac(rs[1] * (13 + 7 * j))) * (S.hot >= st.month ? 1.1 : 1)));
    return { wr: rs, item: { u, rv, n, kind, E, c0: round3(u + (rs[3] - 0.5) * 0.5), c1: round3(u + (rs[3] - 0.5) * 0.12), dd: false } }; },
  describe(st, p, ev, ctx) {
    const it = p.item; const S = L(st); const base = REG[S.regime].buy; const c = it.dd ? it.c1 : it.c0; const w = it.dd ? 0.06 : 0.25; const lv = freeze(st) ? Math.min(LB.freezeCap, S.lev) : S.lev;
    const bid = (k) => r1000(it.E * base * BIDS[k]); const eq = (k) => Math.max(0, bid(k) - r1000(it.E * lv));
    ev.tag = 'חברה למכירה'; ev.title = `${SECT[it.kind]} למכירה במכרז`;
    ev.text = `רווח תפעולי (EBITDA) של ${ctx.fmtM(it.E)} בשנה. ${it.n} קרנות מתחרות מגישות הצעות. אחרי התיקון הרווח צפוי לגדול ב־${Math.round((c - w) * 100)}% עד ${Math.round((c + w) * 100)}%. מחיר שוק היום: פי ${base} מהרווח.`;
    ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'כמה החברה שווה לך — לא למתחרים? מי שמציע הכי הרבה זוכה, וגם מגלה ראשון שהגזים.';
    const fair = (REG.normal.mult + LB.fixedUp) * (1 + c) * 0.8; /* a fixed company at a normal market's multiple, less time, interest and risk */ const want = ['high', 'mid', 'low'].find((k) => base * BIDS[k] <= fair);
    ev.data = { kind: 'auction', sector: SECT[it.kind], ebitda: it.E, rivals: it.n, band: { lo: round3(c - w), hi: round3(c + w) }, dd: it.dd, ddFee: r1000(it.E * base * LB.ddFee), base, lev: lv, bids: Object.fromEntries(Object.keys(BIDS).map((k) => [k, { price: bid(k), equity: eq(k) }])), fair: round3(fair) };
    const opts = []; if (!it.dd) opts.push(ctx.opt('dd', `תוכנית 100 הימים (${ctx.fmtM(r1000(it.E * base * LB.ddFee))} מהקרן)`, S.dry >= r1000(it.E * base * LB.ddFee), { kind: 'inspect', preview: { cash: 0, monthly: 0, months: 0, risk: null } }));
    for (const k of Object.keys(BIDS)) opts.push(ctx.opt('bid' + k, `להציע פי ${round3(base * BIDS[k])} (${ctx.fmtM(bid(k))}; הון ${ctx.fmtM(eq(k))})`, S.cos.length < SLOTS && eq(k) <= S.dry && st.month < S.end - 12, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 0, risk: 'sealed:auction' }, reason: S.cos.length >= SLOTS ? 'עד 6 חברות' : st.month >= S.end - 12 ? 'הקרן קרובה לסוף' : eq(k) > S.dry ? 'אין מספיק הון בקרן' : undefined }));
    opts.push(ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })); ev.options = opts;
    ev.forcePrimary = !it.dd && S.dry >= r1000(it.E * base * LB.ddFee) ? 'dd' : want && ev.options.find((o) => o.id === 'bid' + want && o.enabled) ? 'bid' + want : 'pass';
  },
  choose(st, p, o, params, out, ctx) {
    const S = L(st); const it = p.item; const base = REG[S.regime].buy;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'offerPass', {}) || null; ctx.logDecision(st, 'חברה למכירה', 'ויתר'); return true; }
    if (o.id === 'dd') { const fee = r1000(it.E * base * LB.ddFee); if (it.dd || S.dry < fee) return true; S.dry -= fee; it.dd = true; ctx.logDecision(st, 'חברה למכירה', 'תוכנית 100 ימים', fee); return false; } // the card stays open
    const k = o.id.slice(3); if (!BIDS[k] || S.cos.length >= SLOTS || st.month >= S.end - 12) return true; const lv = freeze(st) ? Math.min(LB.freezeCap, S.lev) : S.lev;
    const price = r1000(it.E * base * BIDS[k]); const debt = r1000(it.E * lv); const eq = Math.max(0, price - debt); if (eq > S.dry) return true;
    const top = Math.max(...it.rv) * base; if (BIDS[k] * base * S.edge <= top) { S.lostBids++; out.mentor = ctx.mentorLine(st, 'offerLost', {}) || `קרן מתחרה הציעה יותר (פי ${round3(top)}). לפעמים להפסיד מכרז זה לחסוך כסף.`; ctx.logDecision(st, 'חברה למכירה', 'הפסיד במכרז', price); return true; }
    S.dry -= eq; S.bought++; const c = { id: S.nextId++, n: `${SECT[it.kind]} ${S.nextId - 1}`, kind: it.kind, E: it.E, u: it.u, f: 0, eq, cost: price, debt, ring: [], held: 0, breach: false, recapAt: -99, half: false, prem: round3(LB.levPrem * Math.max(0, lv - 3)) };
    for (let i = 0; i < 12; i++) c.ring.push(Math.round(it.E / 12)); S.cos.push(c); ctx.lesson(st, out, 'winners_curse');
    out.mentor = ctx.mentorLine(st, 'offerBuy', {}) || `זכית במכרז: ${ctx.fmtM(price)} (חוב ${ctx.fmtM(debt)}). עכשיו מתקנים — ובודקים כמה באמת קנית.`; ctx.logDecision(st, 'חברה למכירה', 'זכה במכרז', price); revalue(st); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
lbo.act = {
  sell(st, p, out, ctx) { const c = findC(st, p); if (!c) return fail(out, 'bad_param'); if (L(st).regime === 'crash') return fail(out, 'אין קונים בקריסה'); exit(st, c, saleValue(st, c), out, ctx, `מכירה של ${c.n}`); return true; },
  ipo(st, p, out, ctx) { const c = findC(st, p); if (!c) return fail(out, 'bad_param'); const S = L(st); if (S.regime !== 'bull' && S.regime !== 'normal') return fail(out, 'אין חלון להנפקה');
    const v = r1000(Math.max(0, ttm(c) * (REG[S.regime].mult + LB.ipoUp) - c.debt) * (1 - LB.ipoFee)); exit(st, c, v, out, ctx, `הנפקה של ${c.n}`); return true; },
  secondary(st, p, out, ctx) { const c = findC(st, p); if (!c) return fail(out, 'bad_param'); exit(st, c, r1000(saleValue(st, c) * LB.sec), out, ctx, `מכירה לקרן משנית של ${c.n}`); return true; },
  partial(st, p, out, ctx) { const c = findC(st, p); if (!c || c.half) return fail(out, 'bad_param'); if (L(st).regime === 'crash') return fail(out, 'אין קונים בקריסה'); const v = r1000(saleValue(st, c) / 2);
    c.half = true; c.E = Math.round(c.E / 2); c.ring = c.ring.map((x) => Math.round(x / 2)); c.debt = Math.round(c.debt / 2); c.eq = Math.round(c.eq / 2); distribute(st, v, out, ctx, `מכירה של חצי מ${c.n}`); revalue(st); return true; },
  recap(st, p, out, ctx) { const c = findC(st, p); const S = L(st); if (!c) return fail(out, 'bad_param'); if (freeze(st)) return fail(out, 'שוק האשראי סגור'); if (st.month - c.recapAt < 12) return fail(out, 'פעם בשנה');
    const add = r1000(ttm(c) * LB.recap - c.debt); if (add <= 0) return fail(out, 'אין מקום לחוב'); c.debt += add; c.recapAt = st.month; c.prem = Math.max(c.prem || 0, round3(LB.levPrem * (LB.recap - 3))); S.recaps++; distribute(st, add, out, ctx, `דיבידנד ממימון מחדש של ${c.n}`); revalue(st); return true; },
  cure(st, p, out, ctx) { const c = findC(st, p); const S = L(st); if (!c || !c.breach) return fail(out, 'bad_param'); const need = r1000(Math.max(0, c.debt - (covOf(st, c) - 1) * ttm(c))); if (need > S.dry) return fail(out, 'אין מספיק הון בקרן');
    S.dry -= need; c.debt -= need; c.eq += need; c.breach = false; S.cures++; out.toast = `הזרמת ${ctx.fmtM(need)} הון. החוב חזר לתנאי.`; return true; },
  lev(st, p, out) { const S = L(st); const x = +p; if (![3, 4, 5].includes(x)) return fail(out, 'bad_param'); if (S.lev === x) return fail(out, 'כבר כך'); S.lev = x; out.toast = `מעכשיו: חוב של פי ${x} מהרווח בכל רכישה.`; return true; },
  extend(st, p, out) { const S = L(st); if (S.ext || S.noExt) return fail(out, S.noExt ? 'המשקיעים לא מסכימים' : 'כבר הוארכה'); if (S.end - st.month > 6) return fail(out, 'רק בחצי השנה האחרונה'); S.ext = true; S.end += LB.ext;
    out.toast = 'המשקיעים הסכימו: עוד שנה לקרן, בחצי דמי ניהול.'; return true; },
};
function actionList(st, ctx) {
  const S = L(st); const out = []; const reg = S.regime; const late = S.end - st.month <= 12; const good = reg === 'bull' || (reg === 'normal' && late);
  for (const c of S.cos) { const sv = saleValue(st, c); const info = { co: c.id, name: c.n, value: sv, cost: c.eq, fixed: c.f, lev: lev(c), cov: covOf(st, c), breach: !!c.breach, held: c.held };
    out.push({ id: 'sell', param: String(c.id), label: `${c.n}: למכור (${ctx.fmtM(sv)})`, enabled: reg !== 'crash', suggested: reg !== 'crash' && ((c.f >= 1 && c.held >= 26 && good) || (late && reg !== 'bear') || st.month >= S.end - 2), ...info });
    out.push({ id: 'ipo', param: String(c.id), label: `${c.n}: הנפקה בבורסה`, enabled: reg === 'bull' || reg === 'normal', suggested: false, ...info });
    out.push({ id: 'secondary', param: String(c.id), label: `${c.n}: למכור לקרן משנית (${ctx.fmtM(r1000(sv * LB.sec))})`, enabled: true, suggested: false, ...info });
    if (!c.half) out.push({ id: 'partial', param: String(c.id), label: `${c.n}: למכור חצי (${ctx.fmtM(r1000(sv / 2))})`, enabled: reg !== 'crash', suggested: false, ...info });
    out.push({ id: 'recap', param: String(c.id), label: `${c.n}: דיבידנד במימון מחדש (חוב עד פי ${LB.recap})`, enabled: !freeze(st) && st.month - c.recapAt >= 12 && ttm(c) * LB.recap > c.debt, suggested: false, ...info });
    if (c.breach) out.push({ id: 'cure', param: String(c.id), label: `${c.n}: להזרים הון ולתקן את החוב`, enabled: S.dry >= Math.max(0, c.debt - (covOf(st, c) - 1) * ttm(c)), suggested: true, ...info }); }
  for (const x of [3, 4, 5]) if (x !== S.lev) out.push({ id: 'lev', param: String(x), label: `חוב של פי ${x} מהרווח ברכישות הבאות`, enabled: true, suggested: false });
  if (!S.ext && !S.noExt) out.push({ id: 'extend', param: null, label: 'לבקש מהמשקיעים עוד שנה (בחצי דמי ניהול)', enabled: S.end - st.month <= 6, suggested: S.end - st.month <= 6 && S.cos.length > 0 && (reg === 'bear' || reg === 'crash') });
  return out;
}
function indicatorsOf(st, ctx) {
  const S = L(st); const nw = ctx.netWorth(st); const goal = ((ctx.world(st).goal || {}).of || []); const gD = goal.find((g) => g.key === 'dpi') || {}; const gN = goal.find((g) => g.type === 'nw') || {};
  return {
    lbo: { committed: S.C, dry: S.dry, distributed: S.dist, dpi: dpi(st), dpiTarget: gD.target || 0, nav: nav(st), netWorth: nw, nwTarget: gN.target || 0, carryPaid: S.carryPaid, fees: S.fees, end: S.end, monthsLeft: Math.max(0, S.end - st.month), extended: S.ext, canExtend: !S.ext && !S.noExt,
      regime: S.regime, regimeLabel: REG[S.regime].label, exitMult: REG[S.regime].mult, buyMult: REG[S.regime].buy, lev: S.lev, creditFreeze: freeze(st), covenant: LB.cov + (S.covUp >= st.month ? 1 : 0), companies: S.cos.length, bought: S.bought, lostBids: S.lostBids, exits: S.exits, forced: S.forced, taken: S.taken, breaches: S.breaches, cures: S.cures, recaps: S.recaps, exitLog: S.exitLog.slice(), last: S.last },
    panel: { id: 'lbo', title: 'הקרן', gauges: [{ id: 'dpi', label: 'כסף שחזר למשקיעים (פי)', value: dpi(st), ref: gD.target || 0 }, { id: 'nw', label: 'השווי שלך', value: nw, ref: gN.target || 0, unit: '₪' }, { id: 'time', label: 'חודשים עד סוף הקרן', value: Math.max(0, S.end - st.month), ref: 12, min: 0, max: S.end }],
      rows: S.cos.map((c) => ({ id: c.id, name: c.n, kind: SECT[c.kind], cost: c.eq, price: c.cost, debt: c.debt, ebitda12: ttm(c), fixed: c.f, lev: lev(c), cov: covOf(st, c), breach: !!c.breach, value: saleValue(st, c), held: c.held })), actions: actionList(st, ctx) },
  };
}
export default lbo;
