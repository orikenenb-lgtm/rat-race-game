// World mechanic `season` — w5 עיר התיירות (docs/full-upgrade/worlds/w5-tourism.md). Seasons, occupancy pricing, allotments.
//
// Contract (DESIGN §4.2): one object of optional hooks; pure and deterministic; NO engine import (helpers arrive in ctx); only + − × ÷ and
// Math.round / min / max / floor (bit-identical in browser, Node and Deno). Draws come ONLY from the `world` stream through ctx.draw, with
// FIXED counts declared in `draws` (tests/w5.test.mjs asserts them): 2 per payday, 2 per 'N' landing, 0 at init — whatever the player does.
//
// The model. An "op-asset" (hotel, resort, spa, conference centre, water park, apartments, restaurant, dive centre) is a normal engine asset
// with `a.op` = {u units, adr, base demand, fixed, var, prof season profile, rate %/month on its own debt, rep, peak/off price tier, staff …}.
// Every month:  demand D = base × season[cal] × tour × cycle × quality × repFactor;  occupancy = min(cap, D × tierDemand[tier]);
//   revenue = units × 30 × adr × tierPrice[tier] × occupancy (+ allotted rooms at the operator's price);  cf = revenue − variable − fixed − debt.
// The cap (98%) is the lesson: in peak months a hotel is capacity-bound, so a higher price is pure gain; off-peak it is demand-bound, so a
// lower price fills rooms that would only cost fixed money. The goal (passive12) averages 12 paydays: summer must fund winter.

export const ID = 'season';
export const DRAWS = Object.freeze({ init: 0, month: 2, landing: Object.freeze({ N: 2 }) });

/** Demand multiplier by calendar month (Jan → Dec). */
export const PROFILES = Object.freeze({
  beach: Object.freeze([0.55, 0.60, 0.80, 1.05, 0.90, 1.15, 1.35, 1.40, 1.05, 1.00, 0.70, 0.75]),
  winterSun: Object.freeze([1.20, 1.25, 1.10, 0.90, 0.80, 0.60, 0.50, 0.50, 0.80, 1.00, 1.15, 1.20]),
  flat: Object.freeze([0.95, 0.95, 1.00, 1.00, 1.00, 1.05, 1.10, 1.10, 1.00, 1.00, 0.95, 0.95]),
  waterpark: Object.freeze([0.55, 0.60, 0.80, 1.05, 0.90, 1.15, 1.35, 1.40, 1.05, 1.00, 0.70, 0.75]),
  mixed: Object.freeze([0.875, 0.925, 0.95, 0.975, 0.85, 0.875, 0.925, 0.95, 0.925, 1.00, 0.925, 0.975]), // ½ beach + ½ winterSun (a converted beach hotel)
});
export const PROFILE_LABEL = Object.freeze({ beach: 'חוף (קיץ)', winterSun: 'שמש חורף', flat: 'כל השנה', waterpark: 'פארק מים (סגור בחורף)', mixed: 'חוף + כנסים' });
const CLOSED = Object.freeze({ waterpark: Object.freeze([1, 2, 11, 12]) }); // months with no revenue (fixed × CLOSED_FIXED)
const CLOSED_FIXED = 0.4;
export const TIERS = Object.freeze(['budget', 'standard', 'premium']);
export const TIER_LABEL = Object.freeze({ budget: 'זול', standard: 'רגיל', premium: 'יוקרה' });
const T_PRICE = Object.freeze({ budget: 0.9, standard: 1, premium: 1.1 });
const T_DEMAND = Object.freeze({ budget: 1.235, standard: 1, premium: 0.826 }); // demand × price^−2: off-peak budget fills rooms, peak premium sells the same rooms dearer
const PREMIUM_LOW_REP = 0.6;   // premium with rep < 60: guests do not believe the price
const REP_PREMIUM = 60;
const CAP = 0.98;
const STAFF_FIXED = Object.freeze({ core: Object.freeze({ peak: 1, mid: 1, off: 1 }), seasonal: Object.freeze({ peak: 1.04, mid: 1, off: 0.9 }) });
/** Season bands by the profile's demand multiplier: 'peak' (≥ 1.15: the price plan's high-season tier), 'off' (≤ 0.80: its low-season
 *  tier), 'mid' (between: the regular price). */
export const BAND = Object.freeze({ peak: 1.15, off: 0.8 });
export function bandOf(prof, cal) { const m = PROFILES[prof][cal - 1]; return m >= BAND.peak ? 'peak' : m <= BAND.off ? 'off' : 'mid'; }
const WING_FIXED = 0.7, WING_CAP = 0.6;
const OLD_FIXED = 1.08;        // the hotelier's old building until renovated
const HOUSING_CUT = 0.95;      // own staff housing: −5% staffing (fixed) on your rooms
export const ALLOT = Object.freeze({ months: 6, disc: 0.22, counterDisc: 0.12, upfront: 0.5, shareMin: 0.3, shareSpan: 0.3, counterP: 0.5, promoterBonus: 0.25, overlap: 0.4 });
const TOUR = Object.freeze({ min: 0.6, max: 1.3, noise: 0.04, revert: 0.1, reviewP: 0.1, review: 8 });
const LINE = Object.freeze({ fixedMonths: 2, discountPp: 1, convertFee: 0.01, dueCal: 8 });
const FESTIVAL = Object.freeze({ cost: 300000, bump: 0.3 });
const CONVERT = Object.freeze({ cost: 3000000 });
const RENOVATE = Object.freeze({ cost: 6000000, rep: 15 });
const MANAGER = Object.freeze({ wage: 28000, hire: 60000 });
const APT_SELL = 0.92;
const INFL_PASS = 0.8;         // share of the yearly CPI that room rates and fixed costs follow
/** Forecast band of the booking pace (± tour) per who is looking. */
const FORECAST = Object.freeze({ base: 0.12, hotelier: 0.06, research: 0.04, both: 0.03 });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r10 = (x) => Math.round(x / 10) * 10;
const r100 = (x) => Math.round(x / 100) * 100;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const isPeak = (prof, cal) => bandOf(prof, cal) === 'peak';
const isOff = (prof, cal) => bandOf(prof, cal) === 'off';
const calAt = (startMonth, month) => ((month - 1 + startMonth - 1) % 12 + 12) % 12 + 1;

/* ---------------------------------------------------------------- the pure monthly model (also used to price cards at load) */
/**
 * One month of an op-asset. o = a.op, debt = the asset's debt, env = {cal, tour, cyc, housing, month}. Returns the money lines (integers).
 * The same function prices the deal cards (opAverage) and the live assets (assetCf) — so a card's cf is what the asset really averages.
 */
export function opMonth(o, debt, env, plan = null) {
  const cal = env.cal; const prof = o.prof; const sm = PROFILES[prof][cal - 1];
  const band = bandOf(prof, cal); const peak = band === 'peak';
  const P = plan || o;
  const tier = o.lock || band === 'mid' ? 'standard' : (band === 'peak' ? P.peak : P.off) || 'standard';
  const staff = STAFF_FIXED[o.staff || 'core'][band];
  let fixed = o.fixed * staff * (o.wing ? WING_FIXED : 1) * (o.old ? OLD_FIXED : 1) * (env.housing && o.kind === 'room' ? HOUSING_CUT : 1) + (o.leak || 0) + (o.owner === false && o.mgr ? o.mgr : 0);
  const interest = debt * (o.rate || 0) / 100;
  const closed = (CLOSED[prof] && CLOSED[prof].includes(cal)) || (o.closedUntil && env.month != null && env.month <= o.closedUntil);
  if (closed) { fixed = o.fixed * CLOSED_FIXED + (o.leak || 0); return { cal, peak, tier, occ: 0, allotOcc: 0, rev: 0, varc: 0, fixed: Math.round(fixed), interest: Math.round(interest), cf: r10(-fixed - interest), closed: true }; }
  const repF = 0.7 + 0.45 * (o.rep ?? 70) / 100;
  const D = o.base * sm * (env.tour ?? 1) * (env.cyc ?? 1) * (o.q ?? 1) * repF;
  const tdem = T_DEMAND[tier] * (tier === 'premium' && (o.rep ?? 70) < REP_PREMIUM ? PREMIUM_LOW_REP : 1);
  const cap = CAP * (o.wing ? WING_CAP : 1);
  const al = o.allot && env.month != null && env.month >= o.allot.from && env.month <= o.allot.until ? o.allot : null;
  const s = al ? Math.min(al.s, cap) : 0;
  const occ = Math.min(cap - s, D * tdem * (1 - ALLOT.overlap * s)); // part of the operator's guests would have come anyway: walk-ins shrink with the share
  const full = o.u * 30 * o.adr;
  const revMkt = full * T_PRICE[tier] * occ;
  const revAl = al ? full * (1 - al.disc) * s * (1 - ALLOT.upfront) : 0; // half was paid up front at the landing
  const varc = full * (o.var || 0) * (occ + s);
  const rev = revMkt + revAl;
  return { cal, peak, tier, occ: round3(occ + s), allotOcc: round3(s), rev: Math.round(rev), varc: Math.round(varc), fixed: Math.round(fixed), interest: Math.round(interest), cf: r10(rev - varc - fixed - interest), closed: false };
}
/** The 12-month average cash flow of an op-asset on the standard plan, core staff, tour 1, no cycle (card pricing; dd calibration). */
export function opAverage(o, debt, plan = null) {
  let s = 0; const months = [];
  for (let cal = 1; cal <= 12; cal++) { const m = opMonth({ ...o, allot: null, closedUntil: 0 }, debt, { cal, tour: 1, cyc: 1 }, plan); s += m.cf; months.push(m.cf); }
  return { avg: r10(s / 12), months };
}
/** Card helper for the world data: fills card.cf (the honest 12-month average) from card.op. */
export function priceCard(card) {
  const debt = card.cost - card.down;
  const op = { rep: 70, peak: 'standard', off: 'standard', staff: 'core', ...card.op };
  card.cf = opAverage(op, debt).avg; card.cf0 = card.cf; // cf0 = the honest claim (due diligence may replace cf with the sealed truth)
  return card;
}
/** The demand quality q (and a cost leak if needed) that makes the standard 12-month average equal `target` (due diligence truth). */
function calibrate(op, debt, target) {
  const at = (q) => opAverage({ ...op, q, leak: 0 }, debt).avg;
  let lo = 0.5, hi = 1.25;
  if (at(hi) <= target) return { q: hi, leak: 0 };
  if (at(lo) >= target) { const leak = at(lo) - target; return { q: lo, leak: Math.max(0, Math.round(leak)) }; }
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (at(m) < target) lo = m; else hi = m; }
  return { q: round3(hi), leak: 0 };
}

/* ---------------------------------------------------------------- state */
const W = (st) => st.world;
function tourOf(st, prof) {
  const w = W(st); let t = w.tour ?? 1;
  if (w.fest === st.month) t += FESTIVAL.bump;
  for (const s of w.shocks || []) if (s.until >= st.month && (!s.prof || s.prof.includes(prof))) t += s.d;
  return Math.max(0.2, t);
}
const opAssets = (st) => st.assets.filter((a) => a.op);
const rooms = (st) => opAssets(st).filter((a) => a.op.kind === 'room');
const hasHousing = (st) => st.assets.some((a) => a.k === 'housing');
/** Per-state month context (calendar, cycle, staff housing, tour per profile), cached on the state object for the current month — metrics()
 *  prices every op-asset several times per call. The signature covers everything it depends on. */
const ENV = new WeakMap();
function baseEnv(st, ctx) {
  const w = W(st); const ec = st.econ; const nS = (w.shocks || []).length;
  const c = ENV.get(st);
  if (c && c.month === st.month && c.tour === w.tour && c.fest === w.fest && c.nS === nS && c.nA === st.assets.length && c.ph === (ec ? ec.phase : null) && c.em === (ec ? ec.m : null)) return c;
  const sm = (ctx.world(st).calendar || {}).startMonth || 1;
  const e = { month: st.month, tour: w.tour, fest: w.fest, nS, nA: st.assets.length, ph: ec ? ec.phase : null, em: ec ? ec.m : null, sm, cal: calAt(sm, st.month), cyc: ctx.econMult(st, 'cfOther'), housing: hasHousing(st), tours: {} };
  for (const p of Object.keys(PROFILES)) e.tours[p] = tourOf(st, p);
  ENV.set(st, e); return e;
}
function envOf(st, ctx, a, neutral = false, monthDelta = 0) {
  const b = baseEnv(st, ctx);
  if (!monthDelta) return { cal: b.cal, month: st.month, tour: b.tours[a.op.prof], cyc: neutral ? 1 : b.cyc, housing: b.housing };
  const month = st.month + monthDelta;
  return { cal: calAt(b.sm, month), month, tour: tourOf(st, a.op.prof), cyc: neutral ? 1 : b.cyc, housing: b.housing };
}
const isHotelier = (st) => st.charId === 'hotelier';
const isPromoter = (st) => st.charId === 'promoter';
const isChef = (st) => st.charId === 'restaurateur';

/* ---------------------------------------------------------------- hooks */
export const season = {
  id: ID, draws: DRAWS,
  /** Lessons and mentor keys this module uses (the validator checks they exist). */
  lessons: ['seasonal_year', 'capacity_pricing', 'allotment', 'working_capital'], mentorKeys: ['allotAsk', 'allotYes', 'allotNo', 'allotLost', 'allotWon', 'winterBurn', 'linePaid', 'lineConverted'],
  /** Sealed paths a redacted room view must neutralise (O1 §0.3). */
  sealed: ['pending.wr'],

  init(st) { const w = W(st); w.tour = 1; w.anchor = 1; w.pas12 = []; w.shocks = []; w.fest = 0; w.line = 0; w.lineMax = 0; w.festUsed = 0; w.reviews = []; w.allots = 0; w.inflSeen = 0; },
  defaults(st) { const w = W(st); if (w.tour == null) w.tour = 1; if (w.anchor == null) w.anchor = 1; if (!Array.isArray(w.pas12)) w.pas12 = []; if (!Array.isArray(w.shocks)) w.shocks = []; if (w.line == null) w.line = 0; if (w.fest == null) w.fest = 0; if (!Array.isArray(w.reviews)) w.reviews = []; if (w.inflSeen == null) w.inflSeen = st.life && Array.isArray(st.life.infl) ? st.life.infl.length : 0; },

  /** Payday (after the month's cash): reputation, the tour index (2 draws, always), shocks expire, the line's August rule. */
  monthly(st, out, ctx) {
    const w = W(st);
    const r1 = ctx.draw(st), r2 = ctx.draw(st); // exactly 2 'world' draws every payday
    const sm = (ctx.world(st).calendar || {}).startMonth || 1;
    const calPaid = calAt(sm, st.month - 1); // the month that was just paid
    // reputation of the month just run
    for (const a of opAssets(st)) {
      const o = a.op; const band = bandOf(o.prof, calPaid); const tier = o.lock || band === 'mid' ? 'standard' : band === 'peak' ? o.peak : o.off;
      let d = 0;
      if (o.staff === 'seasonal') { if (band === 'off' && !(isChef(st) && o.kind === 'seat')) d -= 3; else if (band === 'peak' && (o.rep ?? 70) < 85) d += 1; } // seasonal crews: winters cost reputation, summers rebuild a little
      else if ((o.rep ?? 70) < 85) d += 1;                                                                                                                   // a core team compounds
      if (tier === 'premium' && (o.rep ?? 70) < REP_PREMIUM) d -= 2;
      if (tier === 'budget') d -= 1;
      o.rep = clamp((o.rep ?? 70) + d, 0, 100);
    }
    // a viral review (p = reviewP): ±8 reputation to one op-asset picked by the same draw
    const ops = opAssets(st);
    if (r2 < TOUR.reviewP && ops.length) {
      const a = ops[Math.floor(r2 * 1000) % ops.length]; const up = r2 < TOUR.reviewP / 2;
      a.op.rep = clamp(a.op.rep + (up ? TOUR.review : -TOUR.review), 0, 100);
      w.reviews.push({ m: st.month, a: a.id, d: up ? TOUR.review : -TOUR.review }); if (w.reviews.length > 12) w.reviews.shift();
      out.news.push({ kind: 'season', text: up ? `ביקורת ויראלית מהללת את ${a.n}: המוניטין עלה ל־${a.op.rep}.` : `ביקורת רעה על ${a.n} הסתובבה ברשת: המוניטין ירד ל־${a.op.rep}.`, assetId: 'a' + a.id });
    }
    // the city's demand index: noise ± 0.04 and a pull of 10% back to its anchor
    w.tour = round3(clamp(w.tour + (r1 - 0.5) * 2 * TOUR.noise + (w.anchor - w.tour) * TOUR.revert, TOUR.min, TOUR.max));
    w.shocks = w.shocks.filter((s) => s.until >= st.month);
    for (const a of ops) if (a.op.allot && a.op.allot.until < st.month) { a.op.allot = null; out.news.push({ kind: 'season', text: `ההקצאה של ${a.n} למפעיל הסתיימה. מעכשיו כל החדרים שוב בשוק.`, assetId: 'a' + a.id }); }
    // the seasonal credit line must be repaid by the August payday, else it turns into a bank loan (+1% fee)
    if (calPaid === LINE.dueCal && w.line > 0) {
      const amt = w.line; const fee = r100(amt * LINE.convertFee);
      st.loans += amt; w.line = 0; st.cash -= fee; ctx.cashFx(out, -fee, `עמלת המרה ${ctx.fmtM(fee)}`);
      out.news.push({ kind: 'season', text: ctx.mentorLine(st, 'lineConverted', { amount: ctx.fmtM(amt), fee: ctx.fmtM(fee) }) || `קו האשראי העונתי (${ctx.fmtM(amt)}) לא נסגר עד אוגוסט — הוא הפך להלוואה בנקאית רגילה, ועוד עמלה של ${ctx.fmtM(fee)}.` });
    }
    // prices follow inflation once a year (the engine's yearly CPI step ran earlier in this payday): room rates and costs × (1 + 80 % of it)
    const infl = st.life && Array.isArray(st.life.infl) ? st.life.infl : [];
    if (infl.length > (w.inflSeen || 0)) { const k = 1 + infl[infl.length - 1] / 100 * INFL_PASS; for (const a of ops) { const o = a.op; o.adr = round2(o.adr * k); o.fixed = Math.round(o.fixed * k); if (o.mgr) o.mgr = Math.round(o.mgr * k); } w.inflSeen = infl.length; }
    // lessons by experience
    if (st.stats.paydays >= 3 && ops.length) ctx.lesson(st, out, 'seasonal_year');
    const cal = calAt(sm, st.month);
    if (ops.some((a) => a.op.kind === 'room' && isOff(a.op.prof, cal)) && ops.reduce((s, a) => s + ctx.assetCf(st, a), 0) < 0) out.news.push({ kind: 'season', text: ctx.mentorLine(st, 'winterBurn', {}) || 'חודש חלש: הנכסים שלך מפסידים החודש. בשביל זה שומרים מהקיץ.' });
  },

  /** Module-owned asset kind (op-assets). */
  asset: {
    create(st, a, card, ctx) {
      const op = { rep: 70, peak: 'standard', off: 'standard', staff: 'core', q: 1, leak: 0, wing: false, allot: null, ...JSON.parse(JSON.stringify(card.op)) };
      // the due-diligence truth (card.cf was replaced by the sealed base at buyAsset): demand quality so that the standard average = it
      const claimed = card.cf0 ?? null;
      if (claimed != null && card.cf !== claimed) { const c = calibrate(op, a.debt, card.cf); op.q = c.q; op.leak = c.leak; }
      if (card.closedFor) op.closedUntil = st.month + card.closedFor;
      a.op = op; a.cf = card.cf;
      if (op.owner) a.active = true;
    },
    cf(st, a, ctx, neutral) { return opMonth(a.op, a.debt, envOf(st, ctx, a, neutral)).cf; },
  },
  /** Seasonal line interest (an expense line) and balance (a liability). */
  expense(st, ctx) { const l = W(st).line || 0; return l > 0 ? Math.round(l * Math.max(0.1, ctx.loanPct(st) - LINE.discountPp) / 100) : 0; },
  liability(st) { return W(st).line || 0; },

  /** Deal card extras for an op card: the 12-month strip and the peak / off numbers. */
  deal: {
    describe(st, p, ev, ctx) {
      const c = p.card; if (!c.op) return;
      const debt = c.cost - c.down; const op = { rep: 70, peak: 'standard', off: 'standard', staff: 'core', ...c.op };
      const std = opAverage(op, debt); const smart = opAverage(op, debt, { peak: (op.rep ?? 70) >= REP_PREMIUM ? 'premium' : 'standard', off: 'budget' });
      // the next 12 months by calendar (a half-built park stays closed for its first months)
      const sm = (ctx.world(st).calendar || {}).startMonth || 1;
      const next12 = []; for (let k = 0; k < 12; k++) { const cal = calAt(sm, st.month + k); const closed = c.closedFor && k < c.closedFor; next12.push({ cal, cf: closed ? r10(-(op.fixed * CLOSED_FIXED) - debt * (op.rate || 0) / 100) : std.months[cal - 1], band: bandOf(op.prof, cal) }); }
      ev.data.op = { kind: op.kind, units: op.u, profile: op.prof, profileLabel: PROFILE_LABEL[op.prof], rep: op.rep ?? 70, months: std.months, next12, avg: std.avg, best: Math.max(...std.months), worst: Math.min(...next12.map((x) => x.cf)),
        planned: smart.avg, locked: !!op.lock, owner: !!op.owner, closedFor: c.closedFor || 0, note: 'ממוצע שנתי בתוכנית מחירים רגילה. החודשים הטובים והחלשים מופיעים בפס.' };
      // the winter runway (public): the portfolio's weakest month with this asset × 1.5, + 2 months of personal expenses must stay in cash
      const strip = stripOf(st, ctx); let worst = 0;
      for (let k = 0; k < 12; k++) worst = Math.min(worst, strip[k].cf + next12[k].cf);
      ev.data.runwayNeed = Math.round(-worst * 1.5 + 2 * ctx.expenses(st));
      const left = st.cash + (st.savings || 0) - c.down;
      ev.data.runwayAfter = left;
      if (left < ev.data.runwayNeed && !ev.data.warning) ev.data.warning = `אחרי הקנייה יישארו ${ctx.fmtM(Math.max(0, left))}, והחודשים החלשים של השנה צריכים בערך ${ctx.fmtM(ev.data.runwayNeed)}. בלי כרית — הבנק יחליט בשבילך.`;
    },
  },

  /** Market cards with `mk` (applied at the landing; decision-independent). */
  market: {
    create(st, p) {
      const c = p.card; const w = W(st);
      if (c.mk === 'tour') w.shocks.push({ d: c.dT, until: st.month + (c.months || 1) - 1, prof: c.prof || null, n: c.n });
      if (c.mk === 'tour2') for (const x of c.parts) w.shocks.push({ d: x.dT, until: st.month + (c.months || 1) - 1, prof: x.prof || null, n: c.n });
      if (c.mk === 'anchor') { w.anchor = round3(clamp(w.anchor + c.dT, 0.8, 1.2)); }
      if (c.mk === 'rival') { p.hit = []; for (const a of opAssets(st)) if ((c.prof || ['beach']).includes(a.op.prof)) { a.op.base = round3(a.op.base * (1 - c.cut)); p.hit.push(a.id); } }
      if (c.mk === 'storm') p.hit = opAssets(st).filter((a) => ['beach', 'waterpark'].includes(a.op.prof)).map((a) => a.id);
    },
    describe(st, p, ev, ctx) {
      const c = p.card; const d = ev.data;
      d.season = { mk: c.mk, dT: c.dT ?? null, months: c.months || null, tour: W(st).tour, anchor: W(st).anchor };
      if (c.mk === 'storm') { const n = (p.hit || []).length; d.amount = -n * c.amt; d.count = n; ev.options = [ctx.opt('ok', n ? `לשלם ${ctx.fmtM(n * c.amt)}` : 'המשך', true, { primary: true })]; if (!n) { ev.auto = true; ev.toastText = `${c.n} — אין לך נכסים על החוף הפעם.`; } }
      else if (c.mk === 'rival') { const n = (p.hit || []).length; d.count = n; if (!n) { ev.auto = true; ev.toastText = `${c.n} — הביקוש על החוף יורד, והפעם זה לא נוגע אליך.`; } }
      else if (!opAssets(st).length) { ev.auto = true; ev.toastText = c.n; }
    },
  },
  crisis: {
    create(st, p) { const c = p.card; const w = W(st); if (c.mk === 'slump') w.shocks.push({ d: c.dT, until: st.month + (c.months || 3) - 1, prof: c.prof || null, n: c.n }); },
  },

  /** 'N' — a tour operator offers an allotment. */
  tiles: {
    N: {
      safe: 'decline',
      create(st, ctx) {
        const r1 = ctx.draw(st), r2 = ctx.draw(st); // exactly 2 'world' draws on every N landing, whatever the card turns out to be
        const cands = rooms(st).filter((a) => !a.op.lock && !a.op.allot && !(a.op.closedUntil && a.op.closedUntil >= st.month) && !CLOSED[a.op.prof]);
        cands.sort((x, y) => y.op.u - x.op.u || x.id - y.id);
        const a = cands[0] || null;
        return { wr: [r1, r2], assetId: a ? a.id : null, share: round2(ALLOT.shareMin + ALLOT.shareSpan * r1), countered: false };
      },
      describe(st, p, ev, ctx) {
        const a = p.assetId != null ? st.assets.find((x) => x.id === p.assetId) : null;
        ev.tag = 'מפעיל תיירות'; ev.title = 'מפעיל תיירות מציע הקצאה';
        if (!a || !a.op) { ev.text = 'מפעיל תיירות מחפש חדרים לעונה הבאה — אבל אין לך מלון שאפשר להקצות ממנו.'; ev.options = [ctx.opt('decline', 'המשך', true, { primary: true })]; ev.auto = true; ev.toastText = 'מפעיל תיירות חיפש חדרים — אין לך מלון פנוי להקצאה.'; return; }
        const info = allotInfo(st, p, a, ctx);
        ev.text = `"${a.n}": המפעיל רוצה ${Math.round(p.share * 100)}% מהחדרים ל־${ALLOT.months} החודשים הבאים, ב־${Math.round(info.disc * 100)}% פחות מהמחיר, ומשלם חצי מראש: ${ctx.fmtM(info.upfront)} עכשיו.`;
        ev.mentor = ctx.mentorLine(st, 'allotAsk', {}) || 'כסף עכשיו בהנחה, או לחכות לאורחים שמשלמים מחיר מלא? תסתכל על החודשים שבדרך.';
        ev.data = { assetId: 'a' + a.id, name: a.n, share: p.share, months: ALLOT.months, disc: info.disc, upfront: info.upfront, forecast: info.forecast, delta: info.delta, deltaMonths: info.deltaMonths,
          counter: { chance: info.chance, disc: ALLOT.counterDisc, upfront: info.upfrontC, delta: info.deltaC }, runway: info.runway, countered: !!p.countered,
          note: 'ההערכה לפי קצב ההזמנות הידוע עכשיו (תחזית, לא הבטחה). החדרים שהמפעיל לוקח לא תלויים בעונה — אבל הם גם לא נמכרים במחיר מלא כשיש ביקוש.' };
        ev.options = [
          ctx.opt('accept', `לקבל: ${ctx.fmtM(info.upfront)} עכשיו (הערכה לחצי שנה: ${ctx.sgn(info.delta)})`, true, { kind: 'allot', net: info.delta }),
          ...(p.countered ? [] : [ctx.opt('counter', `להציע ${Math.round(ALLOT.counterDisc * 100)}% הנחה במקום ${Math.round(ALLOT.disc * 100)}% · סיכוי ${Math.round(info.chance * 100)}%`, true, { kind: 'offer', chance: info.chance })]),
          ctx.opt('decline', 'לוותר — החדרים נשארים בשוק', true),
        ];
        const pick = info.delta > 0 || info.runway < 3 ? 'accept' : 'decline';
        ev.options.find((o) => o.id === pick).primary = true;
      },
      choose(st, p, o, params, out, ctx) {
        const a = st.assets.find((x) => x.id === p.assetId);
        if (o.id === 'decline' || !a) { out.mentor = ctx.mentorLine(st, 'allotNo', {}) || null; ctx.logDecision(st, 'מפעיל תיירות', 'ויתר'); return true; }
        if (o.id === 'counter') {
          p.countered = true;
          const ch = counterChance(st);
          if (p.wr[1] < ch) { p.disc = ALLOT.counterDisc; out.mentor = ctx.mentorLine(st, 'allotWon', {}) || `המפעיל הסכים ל־${Math.round(ALLOT.counterDisc * 100)}%. עכשיו להחליט: לקבל או לוותר.`; ctx.addLuck(st, 'negotiation', 0); return false; }
          out.mentor = ctx.mentorLine(st, 'allotLost', {}) || 'המפעיל הלך למלון של המתחרים. משא ומתן הוא סיכון.';
          ctx.lesson(st, out, 'allotment'); ctx.logDecision(st, 'מפעיל תיירות', 'הציע נגדית ונכשל');
          return true;
        }
        const info = allotInfo(st, p, a, ctx);
        a.op.allot = { s: p.share, disc: info.disc, from: st.month, until: st.month + ALLOT.months - 1 };
        st.cash += info.upfront; ctx.cashFx(out, info.upfront, '+' + ctx.fmtM(info.upfront)); ctx.sound(out, 'coin');
        W(st).allots = (W(st).allots || 0) + 1;
        out.mentor = ctx.mentorLine(st, 'allotYes', { amount: ctx.fmtM(info.upfront) }) || `קיבלת ${ctx.fmtM(info.upfront)} מראש. חלק מהחדרים מכורים לחצי שנה — גם בחודשים חלשים, וגם בחודשים חזקים.`;
        ctx.lesson(st, out, 'allotment'); ctx.lesson(st, out, 'working_capital');
        ctx.logDecision(st, 'מפעיל תיירות', 'קיבל הקצאה', info.upfront);
        return true;
      },
      /** Option utilities (months of expenses) from public numbers only: the expected 6-month difference, + liquidity when the runway is short. */
      score(st, ev, ctx) {
        const d = ev.data || {}; const E = Math.max(1, ctx.expenses(st)); const short = (d.runway ?? 9) < 3;
        return ev.options.filter((o) => o.enabled).map((o) => {
          let U = 0;
          if (o.id === 'accept') U = (d.delta || 0) / E + (short ? Math.min(3, (d.upfront || 0) / E) * 0.5 : 0);
          if (o.id === 'counter') U = (d.counter.chance * Math.max(d.counter.delta || 0, 0)) / E;
          return { id: o.id, U: round2(U), flags: [], reasons: [] };
        });
      },
    },
  },

  /** Between-roll actions (`Z`). Each returns false (and sets out.error) when it does not apply. */
  act: {
    pricePlan(st, p, out, ctx) { const [id, pk, of] = String(p || '').split(':'); const a = findOp(st, id); if (!a || !TIERS.includes(pk) || !TIERS.includes(of)) return fail(out, 'bad_param'); if (a.op.lock) return fail(out, 'החוזה עם רשת המלונות קובע את המחירים');
      if (a.op.peak === pk && a.op.off === of) return fail(out, 'זו כבר התוכנית'); a.op.peak = pk; a.op.off = of; ctx.lesson(st, out, 'capacity_pricing'); out.toast = `${a.n}: עונה ${TIER_LABEL[pk]} · שפל ${TIER_LABEL[of]}`; return true; },
    staff(st, p, out) { const [id, s] = String(p || '').split(':'); const a = findOp(st, id); if (!a || !['core', 'seasonal'].includes(s)) return fail(out, 'bad_param'); if (a.op.staff === s) return fail(out, 'כבר כך'); a.op.staff = s; out.toast = `${a.n}: ${s === 'core' ? 'צוות קבוע' : 'צוות עונתי'}`; return true; },
    line(st, p, out, ctx) {
      const w = W(st); const [op, v] = String(p || '').split(':'); const max = lineMax(st);
      if (op === 'draw') { const amt = Math.min(Math.max(0, Math.round(+v || 0)), max - w.line); if (amt < 10000) return fail(out, 'אין מקום בקו העונתי'); w.line += amt; st.cash += amt; ctx.cashFx(out, amt, `קו עונתי ${ctx.fmtM(amt)}`); ctx.lesson(st, out, 'working_capital'); return true; }
      if (op === 'repay') { const amt = Math.min(w.line, v === 'all' ? w.line : Math.max(0, Math.round(+v || 0)), Math.max(0, st.cash)); if (amt <= 0) return fail(out, 'אין מה להחזיר'); w.line -= amt; st.cash -= amt; ctx.cashFx(out, -amt, `החזר קו ${ctx.fmtM(amt)}`); out.mentor = ctx.mentorLine(st, 'linePaid', {}) || null; return true; }
      return fail(out, 'bad_param');
    },
    wing(st, p, out, ctx) { const [id, s] = String(p || '').split(':'); const a = findOp(st, id); if (!a || a.op.kind !== 'room' || a.op.u < 60 || !['close', 'open'].includes(s)) return fail(out, 'bad_param'); const close = s === 'close'; if (a.op.wing === close) return fail(out, 'כבר כך');
      a.op.wing = close; if (close) a.op.rep = clamp(a.op.rep - 3, 0, 100); out.toast = close ? `${a.n}: אגף נסגר (−30% עלויות קבועות, −40% חדרים)` : `${a.n}: האגף נפתח מחדש`; void ctx; return true; },
    festival(st, p, out, ctx) { const w = W(st); if (!isPromoter(st)) return fail(out, 'רק מפיקת הפסטיבלים יודעת להרים פסטיבל'); const sm = (ctx.world(st).calendar || {}).startMonth || 1; const cal = calAt(sm, st.month);
      if (!isOff('beach', cal)) return fail(out, 'פסטיבל עושים בחודש חלש'); if (w.fest === st.month) return fail(out, 'כבר יש פסטיבל החודש'); if (st.cash < FESTIVAL.cost) return fail(out, 'אין מספיק מזומן');
      st.cash -= FESTIVAL.cost; w.fest = st.month; w.festUsed = (w.festUsed || 0) + 1; ctx.cashFx(out, -FESTIVAL.cost, `פסטיבל ${ctx.fmtM(FESTIVAL.cost)}`); out.toast = 'הפסטיבל ממלא את העיר החודש — את כל המלונות, גם של המתחרים.'; return true; },
    convert(st, p, out, ctx) { const a = findOp(st, p); if (!a || a.op.kind !== 'room' || a.op.prof !== 'beach' || a.op.lock) return fail(out, 'אפשר להסב רק מלון חוף'); if (st.cash < CONVERT.cost) return fail(out, 'אין מספיק מזומן');
      st.cash -= CONVERT.cost; a.op.prof = 'mixed'; a.value += Math.round(CONVERT.cost * 0.5); ctx.cashFx(out, -CONVERT.cost, `הסבה לכנסים ${ctx.fmtM(CONVERT.cost)}`); out.toast = `${a.n} מקבל עכשיו גם כנסים בחורף.`; ctx.lesson(st, out, 'seasonal_year'); return true; },
    sellApt(st, p, out, ctx) { const a = findOp(st, p); if (!a || a.k !== 'apts') return fail(out, 'מכירה מהירה רק לדירות הנופש'); const offer = Math.round(ctx.assetValue(st, a) * APT_SELL); const net = offer - a.debt;
      st.cash += net; st.stats.sold++; st.stats.soldProfit += net - a.down; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, '+' + ctx.fmtM(net)); ctx.ensureCash(st, out, 'sell'); out.toast = `מכרת את ${a.n} מהר: ${ctx.fmtM(net)} אחרי החוב.`; return true; },
    manager(st, p, out, ctx) { const a = findOp(st, p); if (!a || !a.op.owner) return fail(out, 'אין פה עסק שאתה מנהל בעצמך'); const hire = isChef(st) ? MANAGER.hire / 2 : MANAGER.hire; if (st.cash < hire) return fail(out, 'אין מספיק מזומן');
      st.cash -= hire; a.op.owner = false; a.op.mgr = a.op.mgrWage || MANAGER.wage; a.active = false; delete a.active; ctx.cashFx(out, -hire, `גיוס מנהל ${ctx.fmtM(hire)}`); out.toast = `${a.n}: יש מנהל. מעכשיו זו הכנסה פסיבית (אחרי שכר המנהל).`; return true; },
    renovate(st, p, out, ctx) { const a = findOp(st, p); if (!a || !a.op.old) return fail(out, 'אין מה לשפץ'); if (st.cash < RENOVATE.cost) return fail(out, 'אין מספיק מזומן');
      st.cash -= RENOVATE.cost; a.op.old = false; a.op.rep = clamp(a.op.rep + RENOVATE.rep, 0, 100); a.value += Math.round(RENOVATE.cost * 0.6); ctx.cashFx(out, -RENOVATE.cost, `שיפוץ ${ctx.fmtM(RENOVATE.cost)}`); out.toast = `${a.n} שופץ: מוניטין ${a.op.rep}, ועלויות קבועות נמוכות יותר.`; return true; },
  },

  /** The panel's action list (ids, labels, enabled + reason, suggested = the guide's highlight). */
  actions(st, ctx) { return actionList(st, ctx); },

  /** HUD chips + the generic panel descriptor (rendered by ui.js without world-specific code). */
  indicators(st, ctx) {
    const w = W(st); const sm = (ctx.world(st).calendar || {}).startMonth || 1; const cal = calAt(sm, st.month);
    const ops = opAssets(st);
    const strip = stripOf(st, ctx); // the next 12 months of expected cash flow from all op-assets (public: today's plans, the anchor-reverting tour)
    const fixedMonth = ops.reduce((s, a) => s + Math.round(a.op.fixed), 0);
    const runway = fixedMonth ? round2((st.cash + (st.savings || 0)) / fixedMonth) : null;
    const assets = ops.map((a) => { const m = opMonth(a.op, a.debt, envOf(st, ctx, a)); return { assetId: 'a' + a.id, name: a.n, kind: a.op.kind, units: a.op.u, profile: a.op.prof, rep: a.op.rep, peak: a.op.peak, off: a.op.off, staff: a.op.staff, wing: !!a.op.wing, locked: !!a.op.lock, owner: !!a.op.owner, occ: m.occ, tier: m.tier, cfNow: m.cf, closed: m.closed, allot: a.op.allot ? { share: a.op.allot.s, until: a.op.allot.until } : null, occDecile: Math.round(m.occ * 10) }; });
    const ring = (w.pas12 || []).slice();
    return {
      season: { cal, band: bandOf('beach', cal), tour: w.tour, anchor: w.anchor, festival: w.fest === st.month, line: w.line || 0, lineMax: lineMax(st), runway, fixedMonth, shocks: (w.shocks || []).map((s) => ({ d: s.d, until: s.until, n: s.n || '' })) },
      panel: {
        id: 'season', title: 'עונות ותפוסה',
        gauges: [{ id: 'tour', label: 'ביקוש בעיר', value: w.tour, min: TOUR.min, max: TOUR.max, ref: 1 }, { id: 'runway', label: 'כרית לחורף (חודשי עלויות קבועות)', value: runway, ref: 3 }],
        strip: { label: '12 החודשים הבאים: תזרים צפוי מהנכסים', months: strip },
        ring: { label: 'ממוצע 12 החודשים (היעד)', values: ring, window: 12 },
        rows: assets,
        actions: actionList(st, ctx, strip),
      },
    };
  },

  /** Render hints: occupancy per op-asset (window pips = decile) on the existing per-asset pieces; nothing new is spawned. */
  cityModels(st, out, ctx) { for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (a && a.op) { const r = opMonth(a.op, a.debt, envOf(st, ctx, a)); m.occ = r.occ; m.occDecile = Math.round(r.occ * 10); m.closed = r.closed; } } },

  recapHint(st) {
    const ops = opAssets(st); if (!ops.length) return 'בפעם הבאה: נכסים קודם. בעיר התיירות ההכנסה מגיעה מחדרים מלאים, לא מהמשכורת.';
    if (ops.every((a) => a.op.peak === 'standard' && a.op.off === 'standard')) return 'בפעם הבאה: תוכנית מחירים לפי עונה. בקיץ המלון מלא — אפשר לגבות יותר; בחורף הוא ריק — מחיר נמוך ממלא חדרים.';
    if (ops.every((a) => a.op.prof === 'beach' || a.op.prof === 'waterpark')) return 'בפעם הבאה: גם נכס של חורף (ספא, כנסים). כשכל הנכסים של הקיץ — כל חורף הוא חור.';
    return null;
  },

  goalValue(st, key) { return key === 'tour' ? W(st).tour : 0; },
  /** The goal counts income in the month it is earned: an allotment paid half up front still earns its rooms each month (accrual). */
  goalAccrual(st, ctx) {
    // rules-6 balance pass: owner income is AFTER the interest on bank debt beyond a working-capital allowance (2 months of the assets' fixed
    // costs — what a winter may force you to borrow): borrowing to the cap to buy rooms is not income, a winter's forced loan is not punished.
    const allow = LINE.fixedMonths * opAssets(st).reduce((s, a) => s + Math.round(a.op.fixed), 0);
    let x = -Math.round(Math.max(0, st.loans - allow) * ctx.loanPct(st) / 100);
    for (const a of opAssets(st)) { const al = a.op.allot; if (!al || st.month < al.from || st.month > al.until) continue; const m = opMonth(a.op, a.debt, envOf(st, ctx, a)); if (!m.closed) x += Math.round(a.op.u * 30 * a.op.adr * (1 - al.disc) * m.allotOcc * ALLOT.upfront); }
    return x;
  },
};

/* ---------------------------------------------------------------- helpers */
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function findOp(st, id) { const n = +String(id || '').replace(/^a/, ''); return st.assets.find((x) => x.id === n && x.op) || null; }
function lineMax(st) { return LINE.fixedMonths * opAssets(st).reduce((s, a) => s + Math.round(a.op.fixed), 0); }
function counterChance(st) { return Math.min(0.95, ALLOT.counterP + (isPromoter(st) ? ALLOT.promoterBonus : 0)); }
/** The public expectation of the tour index k months ahead (anchor reversion, known shocks are added per asset). */
function expectedTour(w, k) { let t = w.tour ?? 1; for (let i = 0; i < k; i++) t = t + ((w.anchor ?? 1) - t) * TOUR.revert; return t; }
function forecastWidth(st, ctx) { const r = ctx.focusOn(st, 'research'); return isHotelier(st) && r ? FORECAST.both : isHotelier(st) ? FORECAST.hotelier : r ? FORECAST.research : FORECAST.base; }
/** The allotment card's public numbers: up-front cash, the 6-month cash-flow difference (with vs without) at the expected booking pace. */
function allotInfo(st, p, a, ctx) {
  const w = W(st); const disc = p.disc ?? ALLOT.disc; const months = ALLOT.months;
  const width = forecastWidth(st, ctx);
  const forecast = []; let delta = 0, deltaC = 0; const deltaMonths = [];
  const full = a.op.u * 30 * a.op.adr;
  for (let k = 0; k < months; k++) {
    const t = expectedTour(w, k); const env = envOf(st, ctx, a, false, k); env.tour = tourOf(st, a.op.prof) - (w.tour ?? 1) + t;
    const base = opMonth({ ...a.op, allot: null }, a.debt, env).cf;
    const withA = (dd) => opMonth({ ...a.op, allot: { s: p.share, disc: dd, from: env.month, until: env.month } }, a.debt, env).cf + Math.round(full * (1 - dd) * Math.min(p.share, CAP) * ALLOT.upfront);
    const d1 = withA(disc) - base; const d2 = withA(ALLOT.counterDisc) - base;
    delta += d1; deltaC += d2; deltaMonths.push(r10(d1));
    forecast.push({ k, cal: env.cal, tour: round2(t), lo: round2(t - width), hi: round2(t + width) });
  }
  const upfront = r100(full * (1 - disc) * Math.min(p.share, CAP) * ALLOT.upfront * months);
  const upfrontC = r100(full * (1 - ALLOT.counterDisc) * Math.min(p.share, CAP) * ALLOT.upfront * months);
  const fixedMonth = opAssets(st).reduce((s, x) => s + Math.round(x.op.fixed), 0);
  return { disc, upfront, upfrontC, delta: r10(delta), deltaC: r10(deltaC), deltaMonths, forecast, chance: round2(counterChance(st)), runway: fixedMonth ? round2((st.cash + (st.savings || 0)) / fixedMonth) : 99 };
}
/** The guide's suggestion per op-asset: premium in peak only with reputation ≥ 60, budget off-peak; core staff on the best asset. */
export function suggestPlan(a) {
  const o = a.op; if (o.lock) return null;
  return { peak: (o.rep ?? 70) >= REP_PREMIUM ? 'premium' : 'standard', off: o.prof === 'flat' ? 'standard' : 'budget' };
}
/** The next 12 months of expected op-asset cash flow (public: today's plans and staff, known shocks, the tour reverting to its anchor). */
const STRIP_MEMO = new Map(); // the strip is a pure function of this signature (metrics() calls it many times per action)
function stripOf(st, ctx) {
  const w = W(st); const ops = opAssets(st);
  let key = `${st.worldId}|${st.month}|${w.tour}|${w.anchor}|${w.fest}|${ctx.econMult(st, 'cfOther')}|${hasHousing(st)}`;
  for (const s2 of w.shocks || []) key += `|s${s2.d},${s2.until},${s2.prof || ''}`;
  for (const a of ops) { const o = a.op; key += `|${a.id},${a.debt},${o.rep},${o.peak},${o.off},${o.staff},${o.wing ? 1 : 0},${o.base},${o.q},${o.leak},${o.prof},${o.old ? 1 : 0},${o.owner ? 1 : 0},${o.mgr || 0},${o.closedUntil || 0},${o.allot ? o.allot.s + ',' + o.allot.disc + ',' + o.allot.until : ''}`; }
  const hit = STRIP_MEMO.get(key); if (hit) return hit;
  const strip = stripCompute(st, ctx, w, ops);
  if (STRIP_MEMO.size > 300) STRIP_MEMO.clear(); STRIP_MEMO.set(key, strip);
  return strip;
}
function stripCompute(st, ctx, w, ops) {
  const sm = (ctx.world(st).calendar || {}).startMonth || 1; const strip = [];
  for (let k = 0; k < 12; k++) {
    let cf = 0; const tour = expectedTour(w, k);
    for (const a of ops) { const e = envOf(st, ctx, a, false, k); e.tour = tourOf(st, a.op.prof) - (w.tour ?? 1) + tour; cf += opMonth(a.op, a.debt, e).cf; }
    strip.push({ cal: calAt(sm, st.month + k), cf: r10(cf), band: bandOf('beach', calAt(sm, st.month + k)) });
  }
  return strip;
}
/** Cash the coming weak months will burn: the sum of the negative months among the next k. */
const burnOf = (strip, k) => strip.slice(0, k).reduce((s, x) => s + Math.max(0, -x.cf), 0);
function actionList(st, ctx, strip0 = null) {
  const out = []; const w = W(st); const sm = (ctx.world(st).calendar || {}).startMonth || 1; const cal = calAt(sm, st.month);
  const strip = strip0 || stripOf(st, ctx); const E0 = ctx.expenses(st); const burn6 = burnOf(strip, 6); const burn3 = burnOf(strip, 3);
  for (const a of opAssets(st)) {
    const sg = suggestPlan(a);
    for (const [pk, of] of [['standard', 'standard'], ['premium', 'budget'], ['premium', 'standard'], ['standard', 'budget']]) {
      const cur = a.op.peak === pk && a.op.off === of;
      out.push({ id: 'pricePlan', param: `${a.id}:${pk}:${of}`, assetId: 'a' + a.id, label: `${a.n}: עונה ${TIER_LABEL[pk]} · שפל ${TIER_LABEL[of]}`, enabled: !a.op.lock && !cur, current: cur, reason: a.op.lock ? 'החוזה עם הרשת קובע את המחירים' : undefined, suggested: !!sg && !cur && sg.peak === pk && sg.off === of });
    }
    out.push({ id: 'staff', param: `${a.id}:${a.op.staff === 'core' ? 'seasonal' : 'core'}`, assetId: 'a' + a.id, label: a.op.staff === 'core' ? `${a.n}: לעבור לצוות עונתי (חורף זול, מוניטין יורד)` : `${a.n}: לחזור לצוות קבוע`, enabled: true, suggested: a.op.staff === 'seasonal' && a.op.rep < 60 });
    if (a.op.kind === 'room' && a.op.u >= 60) out.push({ id: 'wing', param: `${a.id}:${a.op.wing ? 'open' : 'close'}`, assetId: 'a' + a.id, label: a.op.wing ? `${a.n}: לפתוח את האגף` : `${a.n}: לסגור אגף (−30% קבועות, −40% חדרים)`, enabled: true, suggested: false });
    if (a.op.kind === 'room' && a.op.prof === 'beach' && !a.op.lock) out.push({ id: 'convert', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: הסבה גם לכנסים (${ctx.fmtM(CONVERT.cost)})`, enabled: st.cash >= CONVERT.cost, reason: st.cash >= CONVERT.cost ? undefined : 'אין מספיק מזומן', suggested: false });
    if (a.k === 'apts') out.push({ id: 'sellApt', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: מכירה מהירה (${Math.round(APT_SELL * 100)}% מהשווי)`, enabled: true, suggested: false });
    if (a.op.owner) { const hire = isChef(st) ? MANAGER.hire / 2 : MANAGER.hire; out.push({ id: 'manager', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: לגייס מנהל (${ctx.fmtM(hire)} + ${ctx.fmtM(a.op.mgrWage || MANAGER.wage)} בחודש)`, enabled: st.cash >= hire, reason: st.cash >= hire ? undefined : 'אין מספיק מזומן', suggested: st.cash >= hire + burn6 + 2 * E0 }); }
    if (a.op.old) out.push({ id: 'renovate', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: לשפץ את האגף הישן (${ctx.fmtM(RENOVATE.cost)}, מוניטין +${RENOVATE.rep})`, enabled: st.cash >= RENOVATE.cost, reason: st.cash >= RENOVATE.cost ? undefined : 'אין מספיק מזומן', suggested: st.cash >= RENOVATE.cost + burn6 + 3 * E0 });
  }
  const max = lineMax(st);
  if (max > 0) {
    const room = max - (w.line || 0);
    const want = Math.max(0, Math.min(room, Math.round((burn3 + 2 * E0 - st.cash) / 10000) * 10000)); // what the next weak months need beyond cash
    const drawNow = want >= 10000 && strip[0].band !== 'peak' && ![6, 7].includes(cal);
    out.push({ id: 'line', param: `draw:${drawNow ? want : room}`, label: `קו אשראי עונתי: למשוך ${ctx.fmtM(drawNow ? want : room)} (נסגר עד אוגוסט)`, enabled: room >= 10000, reason: room >= 10000 ? undefined : 'הקו מנוצל', suggested: drawNow });
    if (w.line > 0) out.push({ id: 'line', param: 'repay:all', label: `להחזיר את הקו העונתי (${ctx.fmtM(w.line)})`, enabled: st.cash > 0, suggested: st.cash >= w.line + burn3 + E0 || ([5, 6, 7].includes(cal) && st.cash >= w.line + E0) });
  }
  if (isPromoter(st)) {
    // the festival's public value this month: your op-assets' cash flow with the city's demand +0.3, minus without (rivals gain too — not shown)
    let gain = 0; for (const a of opAssets(st)) { const e = envOf(st, ctx, a); const e2 = { ...e, tour: e.tour + FESTIVAL.bump }; gain += opMonth(a.op, a.debt, e2).cf - opMonth(a.op, a.debt, e).cf; }
    const ok = isOff('beach', cal) && w.fest !== st.month && st.cash >= FESTIVAL.cost;
    out.push({ id: 'festival', param: null, gain: r10(gain), label: `להפיק פסטיבל החודש (${ctx.fmtM(FESTIVAL.cost)}; לנכסים שלך בערך ${ctx.sgn(r10(gain))}, וגם לכל העיר)`, enabled: ok, reason: !isOff('beach', cal) ? 'פסטיבל עושים בחודש חלש' : undefined, suggested: ok && gain > FESTIVAL.cost * 1.2 && st.cash >= FESTIVAL.cost + burn3 + E0 });
  }
  return out;
}
export default season;
