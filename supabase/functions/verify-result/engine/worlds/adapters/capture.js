// Rule adapter `capture` — w22 העיר החדשה (CATALOG-25 §1.4 w22, §2.2; docs/full-upgrade/worlds/w22-capture.md). You are the master developer
// of a new city: 20 plots in 5 zones on bare hills. Amenities (rail station, school, park, hospital, mall) are built in stages (the `stages`
// idea: the cost paid month by month over the build) and each raises the plot prices of its own zone and the next zones by public, fixed
// factors (the planner also sees the exact spill; the others see the table). Sold plots are built by their buyers and fill with residents
// after a 6–18-month lag; residents pay property tax. Municipal bonds fund the plan (the `rate` idea + a spread on DSCR), and the `public`
// light() idea: seats and beds per resident drive satisfaction — under 50 people leave. The distinct rule — the sequencing externality:
// an amenity built first raises every plot you still hold, but interest runs on an empty city; selling early funds the plan at low prices.
// Net worth counts the land you hold at the zone's last clearing price (price × the zone's last clearing factor), less the bonds.
//
// Contract (DESIGN §4.2): a mech-contract object, all state in st.world.capture (V-adapter); pure, deterministic, no engine import; only
// + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws: init 6 (the cycle · one sealed spill per amenity kind), every payday
// 3 (the cycle · the clearing factor · an event target), 'W' landing 3 (the kind · the zone · the terms).
export const ID = 'capture';
export const ZONES = Object.freeze(['גבעת האורנים', 'עמק הנחל', 'מרכז העיר', 'רכס המזרח', 'שכונת הדרום']);
export const PER = 4; // plots per zone
export const DRAWS = Object.freeze({ init: 6, month: 3, landing: Object.freeze({ W: 3 }) });
/** The amenities (TUNE): cost, build months, own-zone / next-zone price factor, residents' demand, running cost a month, capacity. */
export const AM = Object.freeze({
  rail: Object.freeze({ n: 'תחנת רכבת', cost: 260000000, m: 18, own: 1.5, adj: 1.2, dem: 0.35, run: 500000 }),
  school: Object.freeze({ n: 'בית ספר', cost: 90000000, m: 10, own: 1.12, adj: 1.05, dem: 0.2, run: 800000, seats: 15000 }),
  park: Object.freeze({ n: 'פארק', cost: 40000000, m: 6, own: 1.15, adj: 1.05, dem: 0.15, run: 200000 }),
  hospital: Object.freeze({ n: 'בית חולים', cost: 200000000, m: 16, own: 1.08, adj: 1.04, dem: 0.12, run: 1500000, beds: 30000 }),
  mall: Object.freeze({ n: 'קניון', cost: 120000000, m: 12, own: 1.25, adj: 1.08, dem: 0.15, run: -1000000 }),
});
export const KINDS = Object.freeze(Object.keys(AM));
export const CYC = Object.freeze({ boom: Object.freeze({ label: 'שוק חם', k: 1.1 }), normal: Object.freeze({ label: 'שוק רגיל', k: 1 }), slow: Object.freeze({ label: 'שוק איטי', k: 0.88 }) });
/** TUNE: residents per plot, the move-in pace, the tax, bonds (unit, cap, term, the spread on DSCR), the developer bundle, the growth factor. */
export const CP = Object.freeze({ resBase: 2000, resCap: 5000, pace: 0.3, tax: 150, bondUnit: 100000000, bondCap: 1500000000, termM: 240, rate: 0.045, bundle: 0.8,
  grow: 1.0, full: 60000, satLow: 50, leave: 0.03, k0: 0.9, ppp: 0.2, pppM: 120, campus: 0.25, delay: 4 });
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
const L = (st) => st.world.capture;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function news(out, t) { out.news.push({ kind: 'capture', text: t }); }
const zoneOf = (i) => Math.floor(i / PER);
const built = (S, z, k) => S.am.some((a) => a.z === z && a.k === k && a.left <= 0);
const done = (S) => S.am.filter((a) => a.left <= 0);
/** The spill of kind k onto the next zones: the table's factor for everybody but the planner, who sees the sealed exact one. */
const spill = (S, k) => round3(1 + (AM[k].adj - 1) * S.sp[k]);
/** The price factor of zone z from the finished amenities (own zone × table, next zones × the sealed spill). */
export const zoneFactor = (S, z) => done(S).reduce((f, a) => f * (a.z === z ? AM[a.k].own : Math.abs(a.z - z) === 1 ? spill(S, a.k) : 1), 1);
export const residents = (st) => Math.round(L(st).plots.reduce((s, p) => s + p.res, 0));
const growth = (st) => 1 + CP.grow * Math.min(1, residents(st) / CP.full);
export const plotPrice = (st, i) => { const S = L(st); return r1000(S.plots[i].base * zoneFactor(S, zoneOf(i)) * CYC[S.cyc].k * growth(st)); };
/** Land held, at the zone's last clearing price (the price today × the zone's last clearing factor). */
export const landValue = (st) => L(st).plots.reduce((s, p, i) => s + (p.own ? r1000(plotPrice(st, i) * L(st).zk[zoneOf(i)]) : 0), 0);
const capOf = (S, key) => done(S).reduce((s, a) => s + (AM[a.k][key] || 0), 0);
/** Services ratio (the `public.light` idea): seats and beds per resident, each capped at 1, averaged. */
export const services = (st) => { const S = L(st); const r = residents(st); if (r <= 0) return 1; return round3((Math.min(1, capOf(S, 'seats') / r) + Math.min(1, capOf(S, 'beds') / r)) / 2); };
export const satisfaction = (st) => { const S = L(st); const extra = Math.min(15, done(S).filter((a) => a.k === 'park' || a.k === 'mall').length * 5); return Math.max(0, Math.min(100, Math.round(10 + 70 * services(st) + extra - (S.strike >= st.month ? 15 : 0)))); };
const spread = (d) => (d >= 2 ? 0.01 : d >= 1.5 ? 0.02 : d >= 1 ? 0.035 : 0.06);
const taxM = (st) => Math.round(residents(st) * CP.tax);
const runM = (S) => done(S).reduce((s, a) => s + AM[a.k].run, 0);
const pppM = (st) => { const S = L(st); return S.pp.reduce((s, p) => s + (p.until >= st.month ? Math.round(S.plots.filter((x, i) => zoneOf(i) === p.z).reduce((a, x) => a + x.res, 0) * CP.tax * CP.ppp) : 0), 0); };
const svcM = (S) => Math.round(S.bonds * S.cpn / 12 + S.bonds / CP.termM);
/** DSCR = (tax − running costs − the PPP shares) ÷ (interest + principal). No bonds: 99. */
export const dscr = (st) => { const S = L(st); const ds = svcM(S); if (ds <= 0) return 99; return round3((taxM(st) - runM(S) - pppM(st)) / ds); };
const costOf = (S, k) => r1000(AM[k].cost * S.costK);
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'capture') { a.value = landValue(st); a.debt = L(st).bonds; } }

export const capture = {
  id: ID, draws: DRAWS, uses: ['projects', 'stages', 'public', 'rate'],
  lessons: ['land_capture', 'build_order'],
  mentorKeys: ['cycle', 'built', 'leave', 'freeze', 'offerAsk'],
  sealed: ['pending.wr', 'world.capture.sp'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 6 'world' draws at init, whoever plays
    const S0 = (ch && ch.start) || {}; const sold = S0.sold || [];
    const plots = []; for (let i = 0; i < ZONES.length * PER; i++) { const z = zoneOf(i); const base = r1000((S0.base || 60000000) * [0.85, 0.95, 1.25, 0.95, 0.8][z] * (1 + 0.06 * ((i % PER) - 1.5)));
      plots.push({ base, own: !sold.includes(i), lag: sold.includes(i) ? 4 + (i % 3) * 3 : -1, res: 0, tgt: 0 }); }
    const sp = {}; KINDS.forEach((k, j) => { sp[k] = round3(0.5 + rs[1 + j]); });
    st.world.capture = { plots, am: [], pp: [], sp, see: !!S0.see, costK: S0.costK || 1, cyc: rs[0] < 0.2 ? 'slow' : rs[0] > 0.85 ? 'boom' : 'normal', clr: 1, zk: ZONES.map(() => CP.k0), bonds: 0, cpn: 0, base: CP.rate,
      evR: 0.5, freeze: -1, strike: -1, leaveM: 0, ms: { m: -1, n: 0 }, sales: 0, saleCash: 0, bundles: 0, built: 0, issued: 0, peakRes: 0, last: null };
  },
  defaults(st) { const S = L(st); if (!S) return; if (!Array.isArray(S.am)) S.am = []; if (!Array.isArray(S.pp)) S.pp = []; },

  monthly(st, out, ctx) {
    const S = L(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 3 'world' draws every payday
    const old = S.cyc; const u = rs[0];
    S.cyc = old === 'boom' ? (u < 0.12 ? 'normal' : 'boom') : old === 'normal' ? (u < 0.08 ? 'boom' : u > 0.92 ? 'slow' : 'normal') : (u < 0.12 ? 'normal' : 'slow');
    if (S.cyc !== old) news(out, ctx.mentorLine(st, 'cycle', { label: CYC[S.cyc].label }) || `שוק הקרקעות: ${CYC[S.cyc].label}.`);
    S.clr = round3(0.86 + 0.24 * rs[1]); S.evR = round3(rs[2]);
    // 1. building: the cost is paid month by month; a finished amenity lifts its zone and the next ones at once
    let pay = 0; for (const a of S.am) { if (a.left <= 0) continue; if (a.hold > 0) { a.hold--; continue; } pay += a.pm; a.left--; if (a.left <= 0) { S.built++; ctx.lesson(st, out, 'land_capture'); news(out, ctx.mentorLine(st, 'built', { n: AM[a.k].n }) || `${AM[a.k].n} ב${ZONES[a.z]} נפתח/ה: מחירי הקרקע באזור ובאזורים הסמוכים עלו.`); } }
    // 2. residents: sold plots fill after their lag; the target follows the demand of the zone's (and the next zones') amenities
    const sat = satisfaction(st); const leaving = sat < CP.satLow;
    for (let i = 0; i < S.plots.length; i++) { const p = S.plots[i]; if (p.own) continue; if (p.lag > 0) { p.lag--; continue; } const z = zoneOf(i);
      const dem = done(S).reduce((s, a) => s + (a.z === z ? AM[a.k].dem : Math.abs(a.z - z) === 1 ? AM[a.k].dem / 2 : 0), 0) + (p.campus ? CP.campus : 0);
      p.tgt = Math.round(Math.min(CP.resCap, CP.resBase * (1 + dem)));
      if (leaving) p.res = Math.round(p.res * (1 - CP.leave)); else if (p.res < p.tgt) p.res = Math.min(p.tgt, Math.round(p.res + p.tgt * CP.pace)); }
    if (leaving && residents(st) > 0) { S.leaveM++; ctx.lesson(st, out, 'build_order'); news(out, ctx.mentorLine(st, 'leave', {}) || 'אין מספיק מקומות בבתי הספר ובבתי החולים: תושבים עוזבים את העיר.'); }
    S.peakRes = Math.max(S.peakRes, residents(st));
    // 3. the city's cash: tax − running costs − the PPP shares − interest and principal − the build payments
    const tax = taxM(st); const run = runM(S); const ppp = pppM(st); const svc = svcM(S); const prin = Math.round(S.bonds / CP.termM); S.bonds = Math.max(0, S.bonds - prin);
    const net = tax - run - ppp - svc - pay; if (net !== 0) ctx.cashFx(out, net, net >= 0 ? 'מס ארנונה פחות הוצאות העיר' : 'בנייה, ריבית והוצאות העיר');
    st.cash += net; S.last = { tax, run, ppp, svc, pay, dscr: dscr(st), sat }; revalue(st);
  },
  asset: { create(st, a, card) { a.op = JSON.parse(JSON.stringify(card.op)); a.value = landValue(st); a.debt = L(st).bonds; }, cf() { return 0; } },
  market: {
    create(st, p) { const c = p.card; const S = L(st); const z = Math.floor(S.evR * ZONES.length) % ZONES.length; p.z = z;
      if (c.mk === 'rail') { if (!S.am.some((a) => a.k === 'rail' && a.z === z) && S.evR < 0.5) { S.am.push({ k: 'rail', z, left: 1, pm: 0, hold: 0, free: true }); p.free = true; } }
      if (c.mk === 'recession') { S.freeze = st.month + 6; S.cyc = 'slow'; }
      if (c.mk === 'employer') { const i = S.plots.findIndex((x, j) => zoneOf(j) === z && !x.own && !x.campus); if (i >= 0) S.plots[i].campus = true; }
      if (c.mk === 'strike') S.strike = st.month + 3;
      if (c.mk === 'petition') { const a = S.am.find((x) => x.left > 0); if (a) { a.hold += CP.delay; p.n = AM[a.k].n; } }
      if (c.mk === 'rateUp') S.base = round3(Math.min(0.08, S.base + 0.01));
      if (c.mk === 'rateDown') S.base = round3(Math.max(0.025, S.base - 0.01));
      revalue(st); },
    describe(st, p, ev) { ev.data.capture = { mk: p.card.mk, zone: ZONES[p.z], free: !!p.free, n: p.n || null }; },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const S = L(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'capture') continue;
    m.residents = residents(st); m.zones = ZONES.map((n, z) => ({ z, n, factor: round3(zoneFactor(S, z)), amenities: S.am.filter((x) => x.z === z).map((x) => ({ k: x.k, done: x.left <= 0 })) })); m.plots = S.plots.map((p, i) => ({ i, z: zoneOf(i), own: p.own, res: p.res })); } },
  recapHint(st) { const S = L(st); if (!S) return null; if (S.leaveM) return 'בפעם הבאה: תושבים בלי בית ספר ובית חולים עוזבים. השירותים צריכים לגדול יחד עם העיר.';
    if (S.sales >= 14 && S.built <= 1) return 'בפעם הבאה: מי שמוכר הכול לפני שבנה משהו מוכר בזול. תחנה או פארק קודם מייקרים כל מגרש שעוד אצלך.'; if (S.sales <= 3) return 'בפעם הבאה: עיר בלי תושבים לא משלמת ארנונה, והריבית רצה. צריך למכור מגרשים כדי שיבנו בהם.'; return null; },
  goalValue(st, key) { if (key === 'residents') return residents(st); if (key === 'dscr') return dscr(st); if (key === 'land') return landValue(st); return 0; },
};

/* ---------------------------------------------------------------- 'W' — an offer to the city (a PPP partner or an employer's campus) */
capture.tiles.W = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 3 'world' draws on every W landing
    const kind = rs[0] < 0.55 ? 'ppp' : 'campus'; const z = Math.floor(rs[1] * ZONES.length) % ZONES.length; const k = ['school', 'park', 'hospital', 'mall'][Math.floor(rs[2] * 4) % 4];
    return { wr: rs, item: { kind, z, k, disc: round3(0.6 + 0.2 * rs[2]) } }; },
  describe(st, p, ev, ctx) {
    const it = p.item; const S = L(st); ev.tag = 'הצעה לעיר'; ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'מה זה עושה לכל שאר הקרקע שלך?';
    const opts = [];
    if (it.kind === 'ppp') { const has = S.am.some((a) => a.z === it.z && a.k === it.k); ev.title = `שותף פרטי יבנה ${AM[it.k].n} ב${ZONES[it.z]}`;
      ev.text = `השותף בונה ומממן (${ctx.fmtM(costOf(S, it.k))}). בתמורה: ${Math.round(CP.ppp * 100)}% מהארנונה של האזור ל־${CP.pppM / 12} שנים.`;
      opts.push(ctx.opt('take', 'לקבל את השותף', !has, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 0, risk: null }, reason: has ? 'כבר יש כזה באזור' : undefined }));
      ev.data = { kind: 'ppp', zone: it.z, zoneName: ZONES[it.z], amenity: it.k, cost: costOf(S, it.k), share: CP.ppp, months: CP.pppM, own: AM[it.k].own, adj: S.see ? spill(S, it.k) : AM[it.k].adj };
    } else { const i = S.plots.findIndex((x, j) => zoneOf(j) === it.z && x.own); const pr = i >= 0 ? r1000(plotPrice(st, i) * it.disc) : 0; ev.title = `חברה גדולה רוצה קמפוס ב${ZONES[it.z]}`;
      ev.text = `החברה קונה מגרש ב־${Math.round(it.disc * 100)}% מהמחיר (${ctx.fmtM(pr)}). העובדים שלה ירצו לגור קרוב: ביקוש גבוה יותר באזור.`;
      opts.push(ctx.opt('take', `למכור לה מגרש (${ctx.fmtM(pr)})`, i >= 0, { kind: 'buy', preview: { cash: pr, monthly: 0, months: 0, risk: null }, reason: i < 0 ? 'אין לך מגרש באזור' : undefined }));
      ev.data = { kind: 'campus', zone: it.z, zoneName: ZONES[it.z], plot: i, price: pr, disc: it.disc, demand: CP.campus }; }
    opts.push(ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })); ev.options = opts;
    ev.forcePrimary = opts[0].enabled && it.kind === 'ppp' && it.k !== 'mall' ? 'take' : 'pass';
  },
  choose(st, p, o, params, out, ctx) {
    const S = L(st); const it = p.item;
    if (o.id === 'pass') { ctx.logDecision(st, 'הצעה לעיר', 'ויתר'); return true; }
    if (it.kind === 'ppp') { if (S.am.some((a) => a.z === it.z && a.k === it.k)) return true; S.am.push({ k: it.k, z: it.z, left: AM[it.k].m, pm: 0, hold: 0, ppp: true }); S.pp.push({ z: it.z, until: st.month + AM[it.k].m + CP.pppM });
      ctx.logDecision(st, 'הצעה לעיר', 'שותף פרטי', 0); revalue(st); return true; }
    const i = S.plots.findIndex((x, j) => zoneOf(j) === it.z && x.own); if (i < 0) return true; const pr = r1000(plotPrice(st, i) * it.disc);
    sellPlot(st, i, pr, out, ctx, it.disc); S.plots[i].campus = true; ctx.logDecision(st, 'הצעה לעיר', 'קמפוס', pr); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};
function sellPlot(st, i, amt, out, ctx, k) { const S = L(st); const p = S.plots[i]; if (S.ms.m !== st.month) S.ms = { m: st.month, n: 0 }; S.ms.n++; p.own = false; p.lag = 3 + Math.floor(S.evR * 7); st.cash += amt; ctx.cashFx(out, amt, 'מכירת מגרש'); S.sales++; S.saleCash += amt;
  S.zk[zoneOf(i)] = round3(k); revalue(st); }

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
capture.act = {
  sell(st, p, out, ctx) { const S = L(st); const i = +p; if (!(i >= 0 && i < S.plots.length) || !S.plots[i].own) return fail(out, 'bad_param'); if (S.freeze >= st.month) return fail(out, 'השוק קפוא — רק מכירה ליזם');
    sellPlot(st, i, r1000(plotPrice(st, i) * S.clr), out, ctx, S.clr); return true; },
  bundle(st, p, out, ctx) { const S = L(st); const own = S.plots.map((x, i) => i).filter((i) => S.plots[i].own).sort((a, b) => plotPrice(st, a) - plotPrice(st, b)).slice(0, 2); if (own.length < 2) return fail(out, 'צריך שני מגרשים');
    for (const i of own) sellPlot(st, i, r1000(plotPrice(st, i) * CP.bundle), out, ctx, CP.bundle); S.bundles++; return true; },
  build(st, p, out, ctx) { const S = L(st); const [k, zs] = String(p).split(':'); const z = +zs; if (!AM[k] || !(z >= 0 && z < ZONES.length)) return fail(out, 'bad_param'); if (S.am.some((a) => a.z === z && a.k === k)) return fail(out, 'כבר יש כזה באזור');
    const c = costOf(S, k); S.am.push({ k, z, left: AM[k].m, pm: Math.round(c / AM[k].m), hold: 0 }); out.toast = `מתחילים לבנות ${AM[k].n} ב${ZONES[z]}: ${ctx.fmtM(c)} על פני ${AM[k].m} חודשים.`; return true; },
  bond(st, p, out, ctx) { const S = L(st); if (S.bonds + CP.bondUnit > CP.bondCap) return fail(out, 'הגעת לתקרת האג"ח'); const d = dscr(st); const c = round3(S.base + spread(d));
    S.cpn = S.bonds > 0 ? round3((S.cpn * S.bonds + c * CP.bondUnit) / (S.bonds + CP.bondUnit)) : c; S.bonds += CP.bondUnit; S.issued++; st.cash += CP.bondUnit; ctx.cashFx(out, CP.bondUnit, 'אג"ח עירוני'); revalue(st); return true; },
  repay(st, p, out, ctx) { const S = L(st); const amt = Math.min(S.bonds, CP.bondUnit); if (amt <= 0) return fail(out, 'אין אג"ח'); if (st.cash < amt) return fail(out, 'אין מספיק מזומן'); st.cash -= amt; S.bonds -= amt; ctx.cashFx(out, -amt, 'פדיון אג"ח'); revalue(st); return true; },
  refi(st, p, out) { const S = L(st); if (S.bonds <= 0) return fail(out, 'אין אג"ח'); const c = round3(S.base + spread(dscr(st))); if (c >= S.cpn - 0.004) return fail(out, 'אין חיסכון'); S.cpn = c; out.toast = `מימון מחדש: הריבית על האג"ח ירדה ל־${round3(c * 100)}%.`; return true; },
};
/** The guide's plan (public data only): services first when they lag the city, else the amenity that adds the most to your held land net of its cost (and at least 1.25 × its cost). */
function plan(st) {
  const S = L(st); const r = residents(st); const pend = S.plots.reduce((s, p) => s + (p.own ? 0 : p.res > 0 ? p.tgt : CP.resBase), 0); const want = Math.max(r, pend * 0.9);
  const zres = (z) => S.plots.reduce((s, p, i) => s + (zoneOf(i) === z && !p.own ? Math.max(p.res, CP.resBase) : 0), 0);
  const free = (k) => [0, 1, 2, 3, 4].filter((z) => !S.am.some((a) => a.z === z && a.k === k));
  const cap = (key) => S.am.reduce((s, a) => s + (AM[a.k][key] || 0), 0);
  if (want > 0 && cap('seats') < want * 0.7 && free('school').length) return { k: 'school', z: free('school').sort((a, b) => zres(b) - zres(a) || Math.abs(a - 2) - Math.abs(b - 2))[0] };
  if (want > 12000 && cap('beds') < want * 0.7 && free('hospital').length) return { k: 'hospital', z: free('hospital').sort((a, b) => zres(b) - zres(a) || Math.abs(a - 2) - Math.abs(b - 2))[0] };
  let best = null; if (st.month + 12 > 66) return null; // optional builds stop when they would open too late to be sold into
  for (const k of ['rail', 'park', 'mall']) for (const z of free(k)) { let g = 0; for (let i = 0; i < S.plots.length; i++) if (S.plots[i].own) { const d = Math.abs(zoneOf(i) - z); g += plotPrice(st, i) * (d === 0 ? AM[k].own - 1 : d === 1 ? AM[k].adj - 1 : 0); }
    const c = costOf(S, k); if (g >= c * 1.25 && (!best || g - c > best.net)) best = { k, z, net: g - c }; }
  return best;
}
function actionList(st, ctx) {
  const S = L(st); const out = []; const fr = S.freeze >= st.month; const nB = S.am.filter((a) => a.left > 0 && !a.ppp).length; const own = S.plots.map((p, i) => i).filter((i) => S.plots[i].own);
  const nx = plan(st); const need = nx ? costOf(S, nx.k) : 0; const d = dscr(st); const r = residents(st); const keep = 4; const mSold = S.ms.m === st.month ? S.ms.n : 0;
  const lifted = (i) => done(S).some((a) => Math.abs(a.z - zoneOf(i)) <= 1) && !S.am.some((a) => a.left > 0 && a.z === zoneOf(i));
  const late = st.month >= 45 && r + S.plots.reduce((s, p) => s + (!p.own && p.res === 0 ? CP.resBase : 0), 0) < 60000;
  const pick = own.filter((i) => lifted(i) || late || st.cash < 0).sort((a, b) => plotPrice(st, b) - plotPrice(st, a))[0];
  const pace = Math.min(S.plots.length - keep, 4 + Math.floor(st.month / 4)); const sold = S.plots.length - own.length; // the guide's pace: about one plot every 4 months
  const sellNow = pick != null && own.length > keep && mSold < 1 && (sold < pace || st.cash < 0) && (S.clr >= 0.95 || st.cash < 0 || late) && !fr;
  for (const i of own) { const pr = r1000(plotPrice(st, i) * S.clr);
    out.push({ id: 'sell', param: String(i), label: `מגרש ${i + 1} ב${ZONES[zoneOf(i)]}: למכור (${ctx.fmtM(pr)})`, enabled: !fr, suggested: sellNow && pick === i, plot: i, zone: zoneOf(i), price: pr, mark: r1000(plotPrice(st, i) * S.zk[zoneOf(i)]) }); }
  out.push({ id: 'bundle', param: null, label: `למכור ליזם שני מגרשים ב־${Math.round(CP.bundle * 100)}% מהמחיר`, enabled: own.length >= 2, suggested: fr && st.cash < 0 && own.length > keep + 1 });
  for (const k of KINDS) for (let z = 0; z < ZONES.length; z++) { if (S.am.some((a) => a.z === z && a.k === k)) continue; const c = costOf(S, k);
    out.push({ id: 'build', param: `${k}:${z}`, label: `לבנות ${AM[k].n} ב${ZONES[z]} (${ctx.fmtM(c)}, ${AM[k].m} חודשים)`, enabled: true, suggested: !!nx && nx.k === k && nx.z === z && nB < 2 && st.cash >= c * 0.4, amenity: k, zone: z, cost: c, own: AM[k].own, adj: S.see ? spill(S, k) : AM[k].adj }); }
  const room = S.bonds + CP.bondUnit <= CP.bondCap;
  out.push({ id: 'bond', param: null, label: `להנפיק אג"ח עירוני (${ctx.fmtM(CP.bondUnit)}, ריבית ${round3((S.base + spread(d)) * 100)}%)`, enabled: room, suggested: room && !!nx && st.cash < need * 0.4 && (d >= 1.8 || (r < 6000 && S.bonds < 500000000)) });
  const spare = st.cash - Math.min(S.bonds, CP.bondUnit) - (nx ? need * 0.4 : 0) - 30000000;
  out.push({ id: 'repay', param: null, label: 'לפדות אג"ח (₪100 מיליון)', enabled: S.bonds > 0 && st.cash >= Math.min(S.bonds, CP.bondUnit), suggested: S.bonds > 0 && st.cash >= Math.min(S.bonds, CP.bondUnit) && spare >= 0 && (d < 1.7 || !nx) });
  out.push({ id: 'refi', param: null, label: 'מימון מחדש של האג"ח', enabled: S.bonds > 0 && S.base + spread(d) < S.cpn - 0.004, suggested: S.bonds > 0 && S.base + spread(d) < S.cpn - 0.004 });
  return out;
}
function indicatorsOf(st, ctx) {
  const S = L(st); const nw = ctx.netWorth(st); const goal = ((ctx.world(st).goal || {}).of || []); const g = (k) => (goal.find((x) => x.key === k) || {}).target || 0; const gN = goal.find((x) => x.type === 'nw') || {};
  const r = residents(st);
  return {
    capture: { residents: r, resTarget: g('residents'), dscr: dscr(st), dscrTarget: g('dscr'), land: landValue(st), netWorth: nw, nwTarget: gN.target || 0, bonds: S.bonds, coupon: S.cpn, rate: S.base, satisfaction: satisfaction(st), services: services(st),
      cycle: S.cyc, cycleLabel: CYC[S.cyc].label, clearing: S.clr, salesFrozen: S.freeze >= st.month, plotsHeld: S.plots.filter((p) => p.own).length, sales: S.sales, built: S.built, leaveMonths: S.leaveM, peakRes: S.peakRes, bundles: S.bundles, last: S.last,
      zones: ZONES.map((n, z) => ({ z, n, factor: round3(zoneFactor(S, z)), clearing: S.zk[z], amenities: S.am.filter((a) => a.z === z).map((a) => ({ k: a.k, n: AM[a.k].n, left: a.left, hold: a.hold, ppp: !!a.ppp })) })) },
    panel: { id: 'capture', title: 'העיר', gauges: [{ id: 'nw', label: 'השווי שלך', value: nw, ref: gN.target || 0, unit: '₪' }, { id: 'res', label: 'תושבים', value: r, ref: g('residents') }, { id: 'dscr', label: 'כיסוי החוב', value: Math.min(dscr(st), 9), ref: g('dscr') }, { id: 'sat', label: 'שביעות רצון', value: satisfaction(st), ref: CP.satLow, min: 0, max: 100 }],
      rows: S.plots.map((p, i) => ({ id: i, zone: zoneOf(i), zoneName: ZONES[zoneOf(i)], own: p.own, price: plotPrice(st, i), mark: p.own ? r1000(plotPrice(st, i) * S.zk[zoneOf(i)]) : 0, res: p.res, lag: Math.max(0, p.lag) })), actions: actionList(st, ctx) },
  };
}
export default capture;
