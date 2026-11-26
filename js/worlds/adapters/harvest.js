// Rule adapter `harvest` — w16 ארץ השדות (CATALOG-25 §1.4 w16, §2.2; docs/full-upgrade/worlds/w16-fields.md). A farm of 6 field slots:
// the crop calendar (sowing → growth → harvest per crop), commodity prices in supply regimes (normal / bumper / drought / a global glut), a
// harvest FUTURE per crop (the expected fair price at harvest; it settles at the fair price, while the crop itself sells at the local
// price — with the harvest-month dip — or waits in the silo) and margin on it. The distinct rule — hedge under QUANTITY uncertainty: a
// field's yield is sealed at sowing and shown as a range that narrows every month; you lock X % of the yield you EXPECT. In a drought the
// crop is small and the price high, so an over-hedged farmer buys the shortfall back at a loss on top of a small crop; unhedged, a price
// collapse and the harvest-month dip hit in full; margin calls arrive months before the harvest pays. A silo keeps wheat / cotton (1.5 %
// a month spoils) so the unhedged part can wait out the harvest dip.
//
// Contract (DESIGN §4.2): a mech-contract object, all state in st.world.harvest (V-adapter); pure, deterministic, no engine import, only
// + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws: init 10 (the regime · 3 prices · one per field slot), every payday
// 12 (the regime · 3 prices · the dollar · one per field slot — used if that slot sows this month — · the hail target), 'H' landing 2.
// `uses`: the catalog composes season (calendar) + market (commodity regimes) + portfolio (margin); the w5 `season` module is hotel-specific,
// `market` lists equities on its own stream and `portfolio` margins a loan, so the three ideas are re-implemented here (see the world doc).
// Cash: farm sales and costs are booked by monthly() and paid as the farm asset's cash flow at the next payday; variation margin moves cash
// at once (deposits / calls / release); hedge P&L and between-roll silo sales enter the goal's income through goalAccrual (never twice).
export const ID = 'harvest';
export const SLOTS = 6;
export const DRAWS = Object.freeze({ init: 4 + SLOTS, month: 6 + SLOTS, landing: Object.freeze({ H: 2 }) });
/** Crops (TUNE): sowing calendar month, months of growth, base yield (t), anchor price (₪/t; avocado in $/t × the dollar), monthly cost
 *  while growing, water need, storable, monthly σ, the regime's price multiplier. */
export const CROPS = Object.freeze({
  wheat: Object.freeze({ n: 'חיטה', sow: 11, grow: 6, base: 8500, px: 2000, cost: 500000, water: 0.5, store: 1, vol: 0.08, reg: Object.freeze({ normal: 1, bumper: 0.88, drought: 1.15, glut: 0.7 }) }),
  cotton: Object.freeze({ n: 'כותנה', sow: 4, grow: 6, base: 3600, px: 5600, cost: 1000000, water: 1, store: 1, vol: 0.09, pack: 1, reg: Object.freeze({ normal: 1, bumper: 0.9, drought: 1.12, glut: 0.7 }) }),
  avo: Object.freeze({ n: 'אבוקדו לייצוא', sow: 1, grow: 12, base: 3000, px: 2450, usd: 1, cost: 550000, water: 0.8, store: 0, vol: 0.07, pack: 1, young: 24, plant: 8000000, reg: Object.freeze({ normal: 1, bumper: 0.95, drought: 1.05, glut: 0.8 }) }),
});
export const CROP_IDS = Object.freeze(Object.keys(CROPS));
export const REG = Object.freeze({
  normal: Object.freeze({ label: 'עונה רגילה', min: 3, exit: 0.25, next: Object.freeze({ bumper: 30, drought: 45, glut: 25 }), y: 1 }),
  bumper: Object.freeze({ label: 'שנת שפע', min: 2, exit: 0.45, next: Object.freeze({ normal: 70, glut: 30 }), y: 1.025 }),
  drought: Object.freeze({ label: 'בצורת', min: 3, exit: 0.35, next: Object.freeze({ normal: 80, bumper: 20 }), y: 1 }),
  glut: Object.freeze({ label: 'עודף עולמי', min: 3, exit: 0.3, next: Object.freeze({ normal: 75, drought: 25 }), y: 1 }),
});
export const LEVELS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
export const HV = Object.freeze({ im: 0.08, mm: 0.05, revert: 0.15, fut: 0.8, persist: 0.85, dip: 0.85, dip2: 0.93, spoil: 0.015, siloMax: 6, quota: 0.65, drought: 0.17, irrY: 1.12, packUp: 0.1,
  ins: 0.03, insAt: 0.8, insWin: 2, land: 60000000, landUp: 5000000, down: 0.4, rate: 0.004, lease: 330000, leaseEvery: 30, buyEvery: 15, irr: 8000000,
  pack: 30000000, equip: 12000000, oh: 1000000, perField: 100000, young: 300000, usd0: 3.6, old: 0.9, expPen: 1.1, water: 0.1 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const H = (st) => st.world.harvest;
const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); // 12,345 (no locale: identical in every runtime)
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function wpick(entries, v) { const tot = entries.reduce((s, [, w]) => s + w, 0); let acc = 0; for (const [k, w] of entries) { acc += w / tot; if (v < acc) return k; } return entries[entries.length - 1][0]; }
const powN = (b, n) => { let x = 1; for (let i = 0; i < n; i++) x *= b; return x; };
/** The anchor (₪/t; avocado $/t) the price reverts to: the crop's anchor × the regime × a running event (an export ban, a glut). */
const evtOf = (st, c, m) => { const e = H(st).evt[c]; return e && e.until >= m ? e.m : 1; };
const target = (st, c) => CROPS[c].px * CROPS[c].reg[H(st).regime] * evtOf(st, c, st.month);
const toIls = (st, c, p) => Math.round(CROPS[c].usd ? p * H(st).usd : p);
/** Fair price now (₪/t). */
export const fairOf = (st, c) => toIls(st, c, H(st).px[c]);
/** The harvest future (₪/t) h months ahead: the expected fair price at harvest: today's price reverts to the regime's anchor, and the regime itself fades toward the long-run anchor (persistence 0.85 a month) — no free edge for either side. */
export const futOf = (st, c, h) => { const n = Math.max(0, h); const A = CROPS[c].px * evtOf(st, c, st.month + n); const T = target(st, c); return toIls(st, c, A + (T - A) * powN(HV.persist, n) + (H(st).px[c] - T) * powN(HV.fut, n)); };
/** What a buyer pays for the crop today: the fair price, less the harvest-month dip (and half of it the month after). */
export function spotOf(st, c, ctx) { const cal = ctx.calOf(st); const hc = (CROPS[c].sow - 1 + CROPS[c].grow) % 12 + 1; const k = cal === hc ? HV.dip : cal === (hc % 12) + 1 ? HV.dip2 : 1; return Math.round(fairOf(st, c) * k); }
const packM = (st, c) => (H(st).pack && CROPS[c].pack ? 1 + HV.packUp : 1);
const quotaOf = (st) => clamp(H(st).quota, 0.3, 0.95);
const leftOf = (st, s) => Math.max(0, s.harvM - st.month);
/** The yield range shown for a growing field (t): E × weather so far × [lo, hi] of the sealed factor; the band narrows to harvest. */
export function rangeOf(st, s) { const w = (0.12 * leftOf(st, s) / CROPS[s.crop].grow + 0.01) * (st.charId === 'agronomist' ? 0.7 : 1); const lo = clamp(s.u - 2 * w * s.j, 0.5, 1.5); const hi = lo + 2 * w;
  const base = s.E * s.wf; return { lo: Math.round(base * lo), hi: Math.round(base * hi), mid: Math.round(base * (lo + hi) / 2), months: leftOf(st, s) }; }
export const growing = (s) => s && s.ph === 'grow';
const slotFut = (st, s) => futOf(st, s.crop, leftOf(st, s));
const hedgeQ = (s) => (s.h ? s.h.q : 0) + (s.exp ? s.exp.q : 0);
/** Margin balance of every hedge + the silo stock at today's spot (module-held value outside st.assets). */
export function worthOf(st, ctx) { const F = H(st); let v = 0; for (const s of F.slots) if (s && s.h) v += s.h.M; for (const b of F.silo) v += Math.round(b.t * fairOf(st, b.c) * HV.dip2); void ctx; return Math.round(v); }
export function landValue(st) { const F = H(st); let v = (F.pack ? 20000000 : 0) + (F.equip ? 6000000 : 3000000); for (const s of F.slots) if (s && s.own) v += HV.land + (s.irr ? 4000000 : 0) + (s.crop === 'avo' ? (s.ph === 'young' ? 6000000 : 14000000) : 0); return r1000(v); }
const fieldsN = (st) => H(st).slots.filter(Boolean).length;
/** Monthly farm costs (₪): growing fields, young orchards, overhead, leases, the land mortgage's interest. */
export function costOf(st) { const F = H(st); let c = HV.oh + HV.perField * fieldsN(st) + Math.round(F.debt * HV.rate); for (const s of F.slots) { if (!s) continue; if (s.ph === 'grow') c += CROPS[s.crop].cost; if (s.ph === 'young') c += HV.young; if (!s.own) c += HV.lease; } return Math.round(c); }
const lockedOf = (st) => H(st).slots.reduce((x, s) => x + (s && s.h ? s.h.q * s.h.mk : 0), 0);
const bufferOf = (st) => Math.round(4 * costOf(st) + HV.im * lockedOf(st) + 5000000);
function mark(st, s) { const f = slotFut(st, s); s.h.M += (s.h.mk - f) * s.h.q; s.h.mk = f; s.h.M = Math.round(s.h.M); }
function closeHedge(st, s, q, out, ctx) { const h = s.h; mark(st, s); const part = q / h.q; const rel = Math.round(h.M * part); const v = Math.round((h.lock - h.mk) * q); st.cash += rel; ctx.cashFx(out, rel, null);
  H(st).accNext += v; H(st).hpl = (H(st).hpl || 0) + v; h.M -= rel; h.D = Math.round(h.D * (1 - part)); h.q -= q; if (h.q <= 0) s.h = null; return v; }
function sow(st, s, r, m) { const C = CROPS[s.crop]; const F = H(st); s.ph = 'grow'; s.sowM = m; s.harvM = m + C.grow; s.u = round3(0.88 + 0.24 * r); s.j = round3(frac(r * 7.13 + 0.17)); s.wf = 1; s.ins = null; s.exp = null;
  s.E = Math.round(C.base * (s.irr ? HV.irrY : 1) * (F.equip ? 1 : HV.old)); }
function newSlot(crop, own) { return { crop, own: own ? 1 : 0, irr: 0, ph: 'idle', sowM: 0, harvM: 0, u: 1, j: 0.5, wf: 1, E: 0, h: null, ins: null, exp: null, young: 0, store: 1 }; }

export const harvest = {
  id: ID, draws: DRAWS, uses: ['season', 'market', 'portfolio'],
  lessons: ['qty_hedge', 'hedge_margin'],
  mentorKeys: ['marginCall', 'forced', 'harvestDone', 'drought'],
  sealed: ['world.harvest.slots[].u', 'world.harvest.slots[].j', 'world.harvest.inits', 'pending.wr'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 10 'world' draws at init, whoever plays
    const S = (ch && ch.start) || {}; const regime = wpick([['normal', 60], ['bumper', 15], ['drought', 15], ['glut', 10]], rs[0]);
    const px = {}; CROP_IDS.forEach((c, i) => { px[c] = Math.round(CROPS[c].px * (0.92 + 0.16 * rs[1 + i])); });
    st.world.harvest = { regime, rMin: REG[regime].min, px, usd: HV.usd0, evt: {}, slots: [], silo: [], quota: S.quota ?? HV.quota, pack: 0, equip: S.oldEquip ? 0 : 1, debt: S.debt || 0, bought: 0, lastBuy: -99, lastLease: -99,
      inc: 0, acc: 0, accNext: 0, hpl: 0, calls: 0, forced: 0, lastMargin: 0, buyLoss: 0, droughtHarv: 0, overDrought: 0, harvests: 0, insPaid: 0, subUntil: 0, hitR: 0, inits: rs, hist: [] };
    const F = st.world.harvest;
    for (let i = 0; i < SLOTS; i++) { const d = (S.fields || [])[i]; if (!d) { F.slots.push(null); continue; } const s = newSlot(d.crop, d.own); s.irr = d.irr ? 1 : 0; F.slots.push(s);
      if (d.left != null) { sow(st, s, rs[4 + i], st.month); s.harvM = st.month + d.left; s.sowM = s.harvM - CROPS[d.crop].grow; } }
  },
  defaults(st) { const F = H(st); if (!F) return; for (const k of ['slots', 'silo', 'hist']) if (!Array.isArray(F[k])) F[k] = []; if (!F.evt) F.evt = {}; },

  monthly(st, out, ctx) {
    const F = H(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 12 'world' draws every payday
    const m = st.month; const cal = ctx.calOf(st); const old = F.regime; const T = REG[F.regime];
    if (F.rMin > 0) F.rMin--; else if (rs[0] < T.exit) { F.regime = wpick(Object.entries(T.next), rs[0] / T.exit); F.rMin = REG[F.regime].min; }
    if (F.regime !== old) out.news.push({ kind: 'hv', text: F.regime === 'drought' ? (ctx.mentorLine(st, 'drought', {}) || 'בצורת: מכסת המים נחתכת, היבול יקטן — והמחירים עולים.') : `מצב העונה השתנה: ${REG[F.regime].label}.` });
    F.usd = round3(clamp(F.usd + (HV.usd0 - F.usd) * 0.1 + 0.16 * (rs[4] - 0.5), 2.8, 4.6));
    CROP_IDS.forEach((c, i) => { const p = F.px[c]; const t = target(st, c); F.px[c] = Math.round(clamp(p + (t - p) * HV.revert + p * CROPS[c].vol * 2 * (rs[1 + i] - 0.5), CROPS[c].px * 0.4, CROPS[c].px * 2.5)); });
    F.hitR = rs[11];
    let rev = 0, ins = 0; F.acc = F.accNext; F.accNext = 0;
    for (const s of F.slots) { if (!growing(s)) continue; const C = CROPS[s.crop];
      if (F.regime === 'drought') s.wf = round3(s.wf * (1 - HV.drought * C.water * (1 - quotaOf(st)) * (s.irr ? 0.5 : 1))); else s.wf = round3(s.wf * REG[F.regime].y); }
    // margin: mark every hedge to today's future; below maintenance → a call up to the initial margin, or the broker closes it
    if (st.cash < 0 && F.slots.some((s) => s && s.h)) ctx.ensureCash(st, out, 'harvest'); // the payday's own cover (the engine would lend it later this payday) comes before the broker looks
    for (const s of F.slots) { if (!s || !s.h) continue; mark(st, s); const need = HV.mm * s.h.q * s.h.mk;
      if (s.h.M < need && leftOf(st, s) > 0) { const top = Math.round(HV.im * s.h.q * s.h.mk - s.h.M);
        if (st.cash >= top) { st.cash -= top; s.h.M += top; s.h.D += top; F.calls++; ctx.cashFx(out, -top, 'קריאת מרווח'); ctx.lesson(st, out, 'hedge_margin'); out.news.push({ kind: 'hv', text: ctx.mentorLine(st, 'marginCall', { amount: ctx.fmtM(top) }) || `קריאת מרווח: הגידור על ה${C_(s)} הפסיד על הנייר. הפקדת ${ctx.fmtM(top)} — כסף שיחזור רק בקציר.` }); }
        else { F.lastForced = { m, need: top, cash: Math.round(st.cash), crop: s.crop }; const v = closeHedge(st, s, s.h.q, out, ctx); F.acc += F.accNext; F.accNext = 0; F.forced++; F.lastMargin = st.stats.paydays; out.news.push({ kind: 'hv', text: ctx.mentorLine(st, 'forced', { amount: ctx.fmtM(-v) }) || `לא היה מזומן לקריאת המרווח: הברוקר סגר את הגידור בכוח (${ctx.fmtM(v)}).` }); } } }
    // harvests
    for (let i = 0; i < SLOTS; i++) { const s = F.slots[i]; if (!growing(s) || s.harvM !== m) continue; const c = s.crop; const C = CROPS[c]; const fair = fairOf(st, c); const Q = Math.round(s.E * s.u * s.wf); let left = Q; F.harvests++;
      if (s.h) { const q = s.h.q; if (Q < q && fair > s.h.lock) { F.buyLoss += Math.round((q - Q) * (fair - s.h.lock)); if (F.regime === 'drought' || s.wf < 0.85) F.overDrought++; } closeHedge(st, s, q, out, ctx); F.acc += F.accNext; F.accNext = 0; }
      if (s.exp) { const del = Math.min(left, s.exp.q); rev += Math.round(del * s.exp.px * packM(st, c)) - Math.round((s.exp.q - del) * fair * HV.expPen) + Math.round((s.exp.q - del) * s.exp.px); left -= del; s.exp = null; }
      if (F.regime === 'drought' || s.wf < 0.85) F.droughtHarv++;
      if (s.ins && Q < HV.insAt * s.E) { const p = Math.round((HV.insAt * s.E - Q) * s.ins.px); ins += p; F.insPaid += p; }
      if (left > 0) { if (C.store && s.store) F.silo.push({ c, t: left, m }); else rev += Math.round(left * spotOf(st, c, ctx) * packM(st, c)); }
      out.news.push({ kind: 'hv', text: ctx.mentorLine(st, 'harvestDone', { crop: C.n, qty: num(Q) }) || `קציר ה${C.n}: ${num(Q)} טון (צפי בזריעה ${num(s.E)}).` });
      s.ph = 'idle'; s.ins = null; if (c === 'avo') sow(st, s, rs[5 + i], m); }
    // sowing (one fixed draw per slot was drawn above, used only by a slot that sows now), young orchards coming of age
    for (let i = 0; i < SLOTS; i++) { const s = F.slots[i]; if (!s || !s.crop) continue; if (s.ph === 'young' && m >= s.young) { s.ph = 'idle'; }
      if (s.ph === 'idle' && cal === CROPS[s.crop].sow) sow(st, s, rs[5 + i], m); }
    // the silo: spoilage; the oldest lots are sold at today's price after 6 months
    for (const b of F.silo) b.t = Math.round(b.t * (1 - HV.spoil));
    for (const b of F.silo.filter((x) => m - x.m >= HV.siloMax)) rev += Math.round(b.t * spotOf(st, b.c, ctx) * packM(st, b.c)); F.silo = F.silo.filter((x) => m - x.m < HV.siloMax && x.t > 0);
    F.inc = Math.round(rev + ins - costOf(st));
    F.hist.push({ m, inc: F.inc + F.acc, regime: F.regime }); while (F.hist.length > 24) F.hist.shift();
    revalue(st);
  },
  asset: {
    create(st, a) { a.op = { ck: 'farm' }; a.debt = 0; a.value = landValue(st); },
    cf(st, a) { return a.op && a.op.ck === 'farm' ? Math.round(H(st).inc / 10) * 10 : Math.round((a.cf || 0) / 10) * 10; },
  },
  liability(st) { return H(st).debt || 0; },
  worth(st, ctx) { return worthOf(st, ctx); },
  goalAccrual(st, ctx) { return (H(st).acc || 0) - Math.round(st.loans * ctx.loanPct(st) / 100); }, // the goal counts farm income after the interest on bank loans too
  market: {
    create(st, p) { const c = p.card; const F = H(st); const m = st.month;
      if (c.mk === 'drought') { F.regime = 'drought'; F.rMin = REG.drought.min; }
      if (c.mk === 'ban') F.evt.wheat = { m: 1.35, until: m + 4 };
      if (c.mk === 'glut') F.evt.cotton = { m: 0.8, until: m + 5 };
      if (c.mk === 'usdUp') F.usd = round3(clamp(F.usd * 1.08, 2.8, 4.6));
      if (c.mk === 'usdDown') F.usd = round3(clamp(F.usd * 0.92, 2.8, 4.6));
      if (c.mk === 'subsidy') F.subUntil = m + 6;
      if (c.mk === 'pest') for (const s of F.slots) if (growing(s) && s.crop === 'cotton') s.wf = round3(s.wf * 0.85);
    },
    describe(st, p, ev) { const F = H(st); ev.data.hv = { mk: p.card.mk, regime: F.regime, usd: F.usd, px: CROP_IDS.map((c) => ({ c, px: fairOf(st, c) })) }; },
  },
  crisis: { create(st, p) { const c = p.card; const F = H(st); if (c.mk !== 'hail') return; const g = F.slots.map((s, i) => [s, i]).filter(([s]) => growing(s)); if (!g.length) return; const [s, i] = g[Math.floor(F.hitR * g.length) % g.length]; s.wf = round3(s.wf * 0.7); p.slot = i; } },
  tiles: {
    H: {
      safe: 'decline',
      create(st, ctx) {
        const rs = []; for (let i = 0; i < DRAWS.landing.H; i++) rs.push(ctx.draw(st)); // exactly 2 'world' draws on every landing
        const F = H(st); const cand = F.slots.map((s, i) => [s, i]).filter(([s]) => growing(s) && CROPS[s.crop].pack && !s.exp && leftOf(st, s) >= 1);
        if (rs[0] < 0.6 && cand.length) { const [s, i] = cand[Math.floor(frac(rs[0] * 37) * cand.length)]; return { wr: rs, item: { kind: 'export', slot: i, k: round2(1.04 + 0.12 * rs[1]), q: Math.round(0.3 * rangeOf(st, s).mid) } }; }
        return { wr: rs, item: { kind: 'water', price: r1000(14000000 + 8000000 * rs[1]) } };
      },
      describe(st, p, ev, ctx) {
        const F = H(st); const it = p.item; ev.tag = 'בורסת התוצרת';
        if (it.kind === 'export') { const s = F.slots[it.slot]; const ok = s && growing(s) && !s.exp && leftOf(st, s) >= 1; const px = ok ? Math.round(slotFut(st, s) * it.k) : 0; const R = ok ? rangeOf(st, s) : { lo: 0, hi: 0, mid: 0 };
          ev.title = 'חוזה ייצוא'; ev.text = ok ? `יבואן מחו"ל מציע לקנות ${num(it.q)} טון ${CROPS[s.crop].n} מהקציר הבא ב־₪${num(px)} לטון (פי ${it.k} מהחוזה העתידי). בלי מרווח — אבל אם היבול לא יספיק, תקנה את החסר בשוק ועוד 10%.` : 'ההצעה כבר לא רלוונטית.';
          ev.data = { kind: 'export', slot: it.slot, q: it.q, px, k: it.k, range: R, hedged: ok ? hedgeQ(s) : 0, note: 'מחיר טוב על כמות שאתה עוד לא יודע. כמה מהיבול כבר נעול?' };
          const room = ok && hedgeQ(s) + it.q <= R.lo * 0.9; ev.options = [ctx.opt('accept', `לחתום על ${num(it.q)} טון`, ok, { kind: 'contract', preview: { cash: 0, monthly: 0, months: ok ? leftOf(st, s) : 0, risk: 'quantity' } }), ctx.opt('decline', 'לסרב', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
          const pick = room && it.k >= 1.07 ? 'accept' : 'decline'; ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick; return; }
        ev.title = 'זכויות מים'; ev.text = `מושב שכן מוכר זכויות מים: ${ctx.fmtM(it.price)} תמורת עוד 10% במכסה בשנות בצורת (היום ${Math.round(quotaOf(st) * 100)}%).`;
        ev.data = { kind: 'water', price: it.price, quota: quotaOf(st), note: 'מים הם ביטוח ליבול. שווה כשיש שדות שצריכים הרבה מים.' };
        const can = st.cash >= it.price; ev.options = [ctx.opt('accept', `לקנות ב־${ctx.fmtM(it.price)}`, can, { kind: 'buy', preview: { cash: -it.price, monthly: 0, months: 0, risk: null } }), ctx.opt('decline', 'לסרב', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
        const thirsty = F.slots.filter((s) => s && CROPS[s.crop] && CROPS[s.crop].water >= 0.8).length; const pick = can && st.cash >= it.price + bufferOf(st) && quotaOf(st) < 0.75 && thirsty >= 2 ? 'accept' : 'decline'; ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick;
      },
      choose(st, p, o, params, out, ctx) {
        const F = H(st); const it = p.item; if (o.id === 'decline') { ctx.logDecision(st, 'בורסת התוצרת', 'סירב'); return true; }
        if (it.kind === 'export') { const s = F.slots[it.slot]; if (!s || !growing(s) || s.exp) return fail(out, 'ההצעה כבר לא רלוונטית'); s.exp = { q: it.q, px: Math.round(slotFut(st, s) * it.k) }; ctx.lesson(st, out, 'qty_hedge'); ctx.logDecision(st, 'בורסת התוצרת', 'חוזה ייצוא', it.q); return true; }
        if (st.cash < it.price) return fail(out, 'אין מספיק מזומן'); st.cash -= it.price; ctx.cashFx(out, -it.price, null); F.quota = round2(Math.min(0.95, F.quota + HV.water)); ctx.logDecision(st, 'בורסת התוצרת', 'זכויות מים', it.price); return true;
      },
    },
  },
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const F = H(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'farm') continue;
    m.fields = F.slots.map((s) => (s ? { crop: s.crop, ph: s.ph, hedged: growing(s) ? round2(hedgeQ(s) / Math.max(1, rangeOf(st, s).mid)) : 0, irr: s.irr } : null)); m.silo = F.silo.reduce((x, b) => x + b.t, 0); m.regime = F.regime; } },
  recapHint(st) { const F = H(st); if (!F) return null; if (F.forced) return 'בפעם הבאה: להשאיר מזומן לקריאות מרווח. גידור שנסגר בכוח הוא הפסד בלי הגנה.'; if (F.overDrought) return 'בפעם הבאה: לגדר רק את מה שבטוח יגיע — את הקצה הנמוך של הטווח, לא את הצפי.'; return null; },
  goalValue(st, key) { const F = H(st); if (key === 'lastEvent:margin') return F.lastMargin || 0; if (key === 'farmIncome') return F.inc + F.acc; return 0; },
};
const C_ = (s) => CROPS[s.crop].n;
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'farm') { a.value = landValue(st); a.debt = 0; } }
const slotOf = (st, p) => { const i = Math.floor(+p); return i >= 0 && i < SLOTS && Math.floor(+p) === +p ? i : -1; };

harvest.act = {
  crop(st, p, out) { const F = H(st); const [a, c] = String(p || '').split(':'); const i = slotOf(st, a); const s = F.slots[i]; if (i < 0 || !s || !CROPS[c]) return fail(out, 'bad_param'); if (s.ph !== 'idle') return fail(out, 'השדה עוד בגידול'); if (s.crop === c) return fail(out, 'זה כבר הגידול');
    if (c === 'avo') { const cost = CROPS.avo.plant; if (st.cash < cost) return fail(out, 'אין מספיק מזומן לנטיעה'); st.cash -= cost; s.ph = 'young'; s.young = st.month + CROPS.avo.young; }
    s.crop = c; out.toast = c === 'avo' ? 'נטעת מטע אבוקדו: קציר ראשון בעוד שנתיים.' : `בשדה הזה יגדל ${CROPS[c].n} — הזריעה בעונה.`; return true; },
  hedge(st, p, out, ctx) { const F = H(st); const [a, l] = String(p || '').split(':'); const i = slotOf(st, a); const s = F.slots[i]; const lv = +l; if (i < 0 || !growing(s) || !LEVELS.includes(lv)) return fail(out, 'bad_param'); if (leftOf(st, s) < 1) return fail(out, 'השדה בקציר');
    const want = Math.round(lv * rangeOf(st, s).mid); const cur = s.h ? s.h.q : 0; if (want === cur) return fail(out, 'כבר שם');
    if (want < cur) { const v = closeHedge(st, s, cur - want, out, ctx); out.toast = `סגרת חלק מהגידור (${ctx.fmtM(v)}).`; return true; }
    const f = slotFut(st, s); const dq = want - cur; const dep = Math.round(HV.im * dq * f); if (st.cash < dep) return fail(out, 'אין מספיק מזומן לביטחונות');
    st.cash -= dep; ctx.cashFx(out, -dep, 'ביטחונות לגידור'); if (s.h) { mark(st, s); s.h.lock = Math.round((s.h.lock * s.h.q + f * dq) / want); s.h.q = want; s.h.M += dep; s.h.D += dep; } else s.h = { q: want, lock: f, mk: f, M: dep, D: dep };
    ctx.lesson(st, out, 'qty_hedge'); out.toast = `נעלת ${num(want)} טון ${C_(s)} ב־₪${num(s.h.lock)} לטון. הפקדת ${ctx.fmtM(dep)} ביטחונות.`; return true; },
  store(st, p, out) { const F = H(st); const [a, v] = String(p || '').split(':'); const i = slotOf(st, a); const s = F.slots[i]; if (i < 0 || !s || !['0', '1'].includes(v)) return fail(out, 'bad_param'); s.store = +v; out.toast = +v ? 'היבול שלא נעול ייכנס לממגורה.' : 'היבול יימכר מיד בקציר.'; return true; },
  sell(st, p, out, ctx) { const F = H(st); const c = String(p || ''); const lots = F.silo.filter((b) => b.c === c); if (!CROPS[c] || !lots.length) return fail(out, 'אין מלאי'); const t = lots.reduce((x, b) => x + b.t, 0); const v = Math.round(t * spotOf(st, c, ctx) * packM(st, c));
    F.silo = F.silo.filter((b) => b.c !== c); st.cash += v; F.accNext += v; ctx.cashFx(out, v, '+' + ctx.fmtM(v)); out.toast = `מכרת ${num(t)} טון ${CROPS[c].n} מהממגורה.`; return true; },
  insure(st, p, out, ctx) { const F = H(st); const i = slotOf(st, p); const s = F.slots[i]; if (i < 0 || !growing(s) || s.ins || st.month - s.sowM > HV.insWin) return fail(out, 'ביטוח רק בתחילת העונה'); const f = slotFut(st, s); const prem = Math.round(HV.ins * s.E * f);
    if (st.cash < prem) return fail(out, 'אין מספיק מזומן'); st.cash -= prem; F.accNext -= prem; ctx.cashFx(out, -prem, 'ביטוח יבול'); s.ins = { px: f }; out.toast = `ביטחת את ה${C_(s)}: אם היבול ירד מתחת ל־80% מהצפי, הביטוח משלם.`; return true; },
  buyLand(st, p, out, ctx) { const F = H(st); const i = F.slots.indexOf(null); if (i < 0) return fail(out, 'אין מקום לשדה נוסף'); if (st.month - F.lastBuy < HV.buyEvery) return fail(out, 'הבנק מממן קרקע אחת בחצי שנה'); const price = HV.land + HV.landUp * F.bought; const down = Math.round(price * HV.down);
    const c = CROP_IDS.includes(p) && p !== 'avo' ? p : 'wheat'; if (st.cash < down) return fail(out, 'אין מספיק מזומן להון העצמי'); st.cash -= down; F.debt += price - down; F.bought++; F.lastBuy = st.month; F.slots[i] = newSlot(c, 1); ctx.cashFx(out, -down, null); revalue(st);
    out.toast = `קנית שדה ב־${ctx.fmtM(price)}: ${ctx.fmtM(down)} הון עצמי ומשכנתא על השאר.`; return true; },
  lease(st, p, out) { const F = H(st); const i = F.slots.indexOf(null); if (i < 0) return fail(out, 'אין מקום לשדה נוסף'); if (st.month - F.lastLease < HV.leaseEvery) return fail(out, 'רשות הקרקעות מחכירה שדה אחד בשנה'); const c = CROP_IDS.includes(p) && p !== 'avo' ? p : 'wheat';
    F.slots[i] = newSlot(c, 0); F.lastLease = st.month; out.toast = 'חכרת שדה: בלי הון עצמי, ₪330 אלף בחודש.'; return true; },
  sellLand(st, p, out, ctx) { const F = H(st); const i = slotOf(st, p); const s = F.slots[i]; if (i < 0 || !s || s.ph === 'grow') return fail(out, 'אפשר רק שדה בלי גידול'); if (s.h) return fail(out, 'יש גידור פתוח');
    if (s.own) { const v = Math.round(HV.land * 0.9 + (s.irr ? 2000000 : 0)); const pay = Math.min(F.debt, Math.round(HV.land * (1 - HV.down))); F.debt -= pay; st.cash += v - pay; ctx.cashFx(out, v - pay, '+' + ctx.fmtM(v - pay)); }
    F.slots[i] = null; revalue(st); out.toast = s.own ? 'מכרת את השדה.' : 'החזרת את השדה החכור.'; return true; },
  irrigate(st, p, out, ctx) { const F = H(st); const i = slotOf(st, p); const s = F.slots[i]; if (i < 0 || !s || s.irr) return fail(out, 'bad_param'); const cost = F.subUntil >= st.month ? HV.irr / 2 : HV.irr; if (st.cash < cost) return fail(out, 'אין מספיק מזומן');
    st.cash -= cost; s.irr = 1; ctx.cashFx(out, -cost, null); revalue(st); out.toast = 'השקיה בטפטוף: +12% יבול מהזריעה הבאה, וחצי מהנזק בבצורת.'; return true; },
  pack(st, p, out, ctx) { const F = H(st); if (F.pack) return fail(out, 'כבר יש בית אריזה'); if (st.cash < HV.pack) return fail(out, 'אין מספיק מזומן'); st.cash -= HV.pack; F.pack = 1; ctx.cashFx(out, -HV.pack, null); revalue(st); out.toast = 'בית אריזה: +10% במחיר הכותנה והאבוקדו.'; return true; },
  equip(st, p, out, ctx) { const F = H(st); if (F.equip) return fail(out, 'הציוד חדש'); if (st.cash < HV.equip) return fail(out, 'אין מספיק מזומן'); st.cash -= HV.equip; F.equip = 1; ctx.cashFx(out, -HV.equip, null); revalue(st); out.toast = 'ציוד חדש: היבול חוזר למלא מהזריעה הבאה.'; return true; },
  repay(st, p, out, ctx) { const F = H(st); const amt = Math.min(F.debt, 10000000); if (!amt || st.cash < amt) return fail(out, 'אין מה להחזיר'); st.cash -= amt; F.debt -= amt; ctx.cashFx(out, -amt, null); return true; },
};
function actionList(st, ctx) {
  const F = H(st); const out = []; const buf = bufferOf(st); const spare = st.cash - buf; const drought = F.regime === 'drought'; const lockedN = lockedOf(st); const thin = st.cash + Math.min(0, ctx.cashflow(st)) < 1.5 * HV.im * lockedN; // next payday's costs come before the broker's next look
  const pv = (cash, monthly, months, risk) => ({ cash, monthly, months, risk });
  const cnt = (c) => F.slots.filter((s) => s && s.crop === c).length; const nF = fieldsN(st); const swap = F.slots.findIndex((s) => s && s.ph === 'idle' && s.crop === 'wheat' && (s.irr || quotaOf(st) >= 0.7)); // one switch at a time: cotton on at most half the fields
  F.slots.forEach((s, i) => { if (!s) return; const C = CROPS[s.crop];
    if (s.ph === 'idle') for (const c of CROP_IDS) if (c !== s.crop) { const sug = c === 'cotton' && i === swap && cnt('cotton') + 1 <= Math.ceil(nF / 2);
      out.push({ id: 'crop', param: `${i}:${c}`, label: `שדה ${i + 1}: לעבור ל${CROPS[c].n}${c === 'avo' ? ` (נטיעה ${ctx.fmtM(CROPS.avo.plant)}, קציר בעוד שנתיים)` : ''}`, enabled: c !== 'avo' || st.cash >= CROPS.avo.plant, suggested: sug, preview: pv(c === 'avo' ? -CROPS.avo.plant : 0, 0, c === 'avo' ? CROPS.avo.young : 0, null) }); }
    if (growing(s) && leftOf(st, s) >= 1) { const R = rangeOf(st, s); const cur = s.h ? s.h.q : 0; const f = slotFut(st, s);
      const cap = (drought ? 0.75 : 0.9) * R.lo - (s.exp ? s.exp.q : 0); let best = 0; for (const L of LEVELS) if (L * R.mid <= cap) best = L;
      const curL = LEVELS.reduce((b, L) => (Math.abs(L * R.mid - cur) < Math.abs(b * R.mid - cur) ? L : b), 0); const over = cur > R.lo;
      for (const L of LEVELS) { const q = Math.round(L * R.mid); if (q === cur) continue; const dep = Math.max(0, Math.round(HV.im * (q - cur) * f));
        out.push({ id: 'hedge', param: `${i}:${L}`, label: `שדה ${i + 1} (${C.n}): לנעול ${Math.round(L * 100)}% מהצפי (${num(q)} טון ב־₪${num(f)})`, enabled: st.cash >= dep, qty: q, fut: f,
          suggested: (L === best && L > curL && st.cash >= 3 * costOf(st) + dep + 2 * HV.im * (lockedN + Math.max(0, q - cur) * f) && leftOf(st, s) >= 2) || ((over || thin) && L < curL && L === (thin ? Math.min(best, LEVELS[Math.max(0, LEVELS.indexOf(curL) - 1)]) : best)), preview: pv(-dep, 0, leftOf(st, s), 'margin') }); }
      if (!s.ins && st.month - s.sowM <= HV.insWin) { const prem = Math.round(HV.ins * s.E * f); out.push({ id: 'insure', param: String(i), label: `שדה ${i + 1}: ביטוח יבול (${ctx.fmtM(prem)})`, enabled: st.cash >= prem, suggested: drought && C.water >= 0.8 && !s.irr && spare >= prem, preview: pv(-prem, 0, leftOf(st, s), null) }); } }
    if (C.store) out.push({ id: 'store', param: `${i}:${s.store ? 0 : 1}`, label: `שדה ${i + 1}: ${s.store ? 'למכור מיד בקציר' : 'לאחסן בממגורה'}`, enabled: true, suggested: !s.store, preview: pv(0, 0, 0, null) });
    if (!s.irr) { const cost = F.subUntil >= st.month ? HV.irr / 2 : HV.irr; out.push({ id: 'irrigate', param: String(i), label: `שדה ${i + 1}: השקיה בטפטוף (${ctx.fmtM(cost)})`, enabled: st.cash >= cost, suggested: spare >= cost && (C.water >= 0.8 || !F.slots.some((x) => x && !x.irr && CROPS[x.crop].water >= 0.8)), preview: pv(-cost, 0, 0, null) }); }
    if (s.ph !== 'grow' && !s.h) out.push({ id: 'sellLand', param: String(i), label: s.own ? `שדה ${i + 1}: למכור (${ctx.fmtM(Math.round(HV.land * 0.9))})` : `שדה ${i + 1}: להחזיר את החכירה`, enabled: true, suggested: false, preview: pv(s.own ? Math.round(HV.land * 0.9) : 0, 0, 0, null) }); });
  for (const c of CROP_IDS) { const lots = F.silo.filter((b) => b.c === c); if (!lots.length) continue; const t = lots.reduce((x, b) => x + b.t, 0); const v = Math.round(t * spotOf(st, c, ctx) * packM(st, c)); const age = st.month - Math.min(...lots.map((b) => b.m));
    out.push({ id: 'sell', param: c, label: `למכור ${num(t)} טון ${CROPS[c].n} מהממגורה (${ctx.fmtM(v)})`, enabled: true, suggested: age >= 2 || st.cash < costOf(st), preview: pv(v, 0, 0, null) }); }
  const free = F.slots.indexOf(null) >= 0; const price = HV.land + HV.landUp * F.bought; const down = Math.round(price * HV.down);
  if (free) { out.push({ id: 'buyLand', param: 'wheat', label: `לקנות שדה (${ctx.fmtM(price)}, הון עצמי ${ctx.fmtM(down)})`, enabled: st.month - F.lastBuy >= HV.buyEvery && st.cash >= down, suggested: st.month - F.lastBuy >= HV.buyEvery && spare >= down, preview: pv(-down, -Math.round((price - down) * HV.rate), 0, 'debt') });
    out.push({ id: 'lease', param: 'wheat', label: 'לחכור שדה (₪330 אלף בחודש)', enabled: st.month - F.lastLease >= HV.leaseEvery, suggested: st.month - F.lastLease >= HV.leaseEvery && spare >= 0, preview: pv(0, -HV.lease, 12, null) }); }
  const thirsty = F.slots.filter((s) => s && CROPS[s.crop].pack).length;
  if (!F.pack) out.push({ id: 'pack', param: null, label: `בית אריזה (${ctx.fmtM(HV.pack)}): +10% בכותנה ובאבוקדו`, enabled: st.cash >= HV.pack, suggested: thirsty >= 2 && spare >= HV.pack, preview: pv(-HV.pack, 0, 0, null) });
  if (!F.equip) out.push({ id: 'equip', param: null, label: `ציוד חדש (${ctx.fmtM(HV.equip)}): היבול חוזר ל־100%`, enabled: st.cash >= HV.equip, suggested: spare >= HV.equip, preview: pv(-HV.equip, 0, 0, null) });
  if (F.debt) out.push({ id: 'repay', param: null, label: `להחזיר ${ctx.fmtM(Math.min(F.debt, 10000000))} מהמשכנתא`, enabled: st.cash >= Math.min(F.debt, 10000000), suggested: spare >= 60000000, preview: pv(-Math.min(F.debt, 10000000), Math.round(Math.min(F.debt, 10000000) * HV.rate), 0, null) });
  return out;
}
function indicatorsOf(st, ctx) {
  const F = H(st); const rows = F.slots.map((s, i) => { if (!s) return { slot: i, empty: true }; const g = growing(s); const R = g ? rangeOf(st, s) : null;
    return { slot: i, crop: s.crop, name: CROPS[s.crop].n, own: !!s.own, irr: !!s.irr, phase: s.ph, harvestIn: g ? leftOf(st, s) : null, range: R, expected: g ? s.E : null, hedgeQ: s.h ? s.h.q : 0, lock: s.h ? s.h.lock : null, margin: s.h ? s.h.M : 0,
      export: s.exp ? { ...s.exp } : null, hedgedShare: g ? round2(hedgeQ(s) / Math.max(1, R.mid)) : 0, insured: !!s.ins, store: !!s.store, fut: g ? slotFut(st, s) : null }; });
  const px = CROP_IDS.map((c) => ({ id: c, name: CROPS[c].n, fair: fairOf(st, c), spot: spotOf(st, c, ctx), anchor: toIls(st, c, CROPS[c].px) }));
  const marginTot = F.slots.reduce((x, s) => x + (s && s.h ? s.h.M : 0), 0); const lockedTot = F.slots.reduce((x, s) => x + (s && s.h ? Math.round(s.h.q * s.h.mk) : 0), 0);
  return {
    harvest: { regime: F.regime, regimeLabel: REG[F.regime].label, usd: F.usd, quota: quotaOf(st), px, slots: rows, silo: F.silo.map((b) => ({ ...b })), debt: F.debt, cost: costOf(st), inc: F.inc, acc: F.acc, income: F.inc + F.acc,
      margin: marginTot, locked: lockedTot, calls: F.calls, forced: F.forced, lastMargin: F.lastMargin, buyLoss: F.buyLoss, droughtHarv: F.droughtHarv, overDrought: F.overDrought, harvests: F.harvests, insPaid: F.insPaid, hedgePnl: F.hpl || 0, lastForced: F.lastForced ? { ...F.lastForced } : null, pack: !!F.pack, equip: !!F.equip, land: landValue(st), hist: F.hist.slice(-12) },
    panel: {
      id: 'harvest', title: 'השדות והגידור',
      gauges: [{ id: 'income', label: 'הכנסת המשק החודש', value: F.inc + F.acc, ref: 5000000, max: 15000000 }, { id: 'margin', label: 'ביטחונות מול מזומן לקריאות', value: round2(st.cash / Math.max(1, HV.im * lockedTot)), ref: 1, max: 4 },
        { id: 'quota', label: 'מכסת מים בבצורת', value: quotaOf(st), ref: 0.65, max: 1 }, { id: 'silo', label: 'טון בממגורה', value: F.silo.reduce((x, b) => x + b.t, 0), ref: 0, max: 30000 }],
      table: px, rows, actions: actionList(st, ctx),
    },
  };
}
export default harvest;
