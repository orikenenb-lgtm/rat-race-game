// World mechanic `energy` — w9 מדבר האנרגיה (docs/full-upgrade/worlds/w9-energy.md). Build, refinance, repeat: infrastructure costs a
// fortune today and pays it back slowly for twenty years; an operating plant's long, steady income can be borrowed against to build the next.
//
// Contract (DESIGN §4.2): one object of optional hooks; pure and deterministic; NO engine import (helpers arrive in ctx); only + − × ÷ and
// Math.round / min / max / floor (powers by repeated squaring). Draws come ONLY from the `world` stream through ctx.draw, with FIXED counts
// declared in `draws` (tests/w9.test.mjs asserts them): 8 at init (the sealed fate of up to 2 starting projects, 4 each — every character
// draws 8), 10 per payday (spot-price noise, the spike draw, and one capacity-factor draw per plant slot 0–7, empty slots included),
// 4 per 'V' (power site) landing (permit months, overrun, build delay + its stage, the site's resource quality / community vote).
//
// The build is the shared staged-build core (mech/stages.js, written for w8): equity first, then a construction loan whose gate is this
// world's rule — the bank lends only to a project that holds a GRID SLOT (a connection to the grid). Slots come from 'O' cards (contested by
// the existing rival draws: a slot is a deal a rival can close first) or from the grid operator's queue (Z:applySlot, a fixed public wait);
// a slot is consumed when construction starts. At completion a project becomes an operating plant: the construction loan converts into a
// floating-rate term loan, and the plant sells its power under a PPA (a fixed ₪/MWh for the rest of the game, 85 % of the average spot) or
// merchant (the spot index st.world.en.px, mean-reverting with spikes; solar is cannibalised: the more solar exists — rivals' included —
// the less a merchant solar MWh earns at noon). Storage earns on the spread, which widens as solar grows (a natural hedge).
// Value (net worth, refinancing): the DCF of the plant's expected operating income over its remaining life at the current rate + a
// premium (merchant: a bigger premium and a lender's haircut). Refinancing (Z:refi) re-borrows LTV × DCF − debt as cash: more equity for
// the next project, a bigger debt service — and the goal is operating income AFTER debt service.
import { newBuild, buildMonth, monthCost, equityGap, costToComplete, pctDone, valueAtCost } from './stages.js';

export const ID = 'energy';
export const SLOTS = 8; // plant slots: one sealed capacity-factor draw each per payday; at most 8 operating plants
export const DRAWS = Object.freeze({ init: 8, month: 2 + SLOTS, landing: Object.freeze({ V: 4 }) });

/** Technologies (TUNE): capacity factor, opex ₪/MW/month, build stages, sealed permit months [min, span]. */
export const TECH = Object.freeze({
  solar: Object.freeze({ label: 'שדה סולארי', cf: 0.24, opexMW: 6000, stages: 4, stageMonths: 2, permit: [2, 4], season: 'solar' }),
  wind: Object.freeze({ label: 'חוות רוח', cf: 0.33, opexMW: 13000, stages: 6, stageMonths: 2, permit: [3, 5], season: 'wind' }),
  storage: Object.freeze({ label: 'אגירת סוללות', cf: 0, opexMW: 4000, stages: 3, stageMonths: 2, permit: [1, 3], season: null }),
  hybrid: Object.freeze({ label: 'סולארי עם אגירה', cf: 0.24, opexMW: 8500, stages: 5, stageMonths: 2, permit: [2, 4], season: 'solar' }),
  line: Object.freeze({ label: 'קו הולכה', cf: 0, opexMW: 0, stages: 0, stageMonths: 0, permit: [0, 0], season: null }),
});
const SEASON = Object.freeze({ // calendar month 1–12 (Israel): solar peaks in summer, wind in winter; each averages 1
  solar: Object.freeze([0.86, 0.9, 0.98, 1.04, 1.09, 1.12, 1.12, 1.1, 1.04, 0.97, 0.9, 0.88]),
  wind: Object.freeze([1.1, 1.08, 1.05, 1.0, 0.95, 0.92, 0.92, 0.93, 0.96, 1.0, 1.05, 1.04]),
});
export const SPOT = Object.freeze({ start: 355, revert: 0.18, noise: 26, spikeP: 0.07, spike: 0.4, min: 140, max: 760 });
const DEM = Object.freeze({ exp: 1.06, slow: 1.0, rec: 0.9, recov: 0.96 }); // power demand by cycle phase → the spot's long-run mean
export const CANN = Object.freeze({ mkt0: 2600, grow: 15, own: 2, k: 0.26, ref: 4000, min: 0.55 }); // market solar MW (rivals) + own × 2
const WIND_CAPTURE = 0.97;
export const STORE = Object.freeze({ mwh: 360, base: 0.12, cann: 0.8, spike: 0.25, vol: 0.5 }); // storage: ₪/MW/month = 360 × px × spread
export const PPA = Object.freeze({ share: 0.85, switchCut: 0.9 });
export const RATE = Object.freeze({ start: 4.5, min: 1.5, max: 9, build: 2.5, term: 1.5, revert: 0.03, noise: 0.15 }); // annual %: construction = rate + 2.5, term = rate + 1.5; the policy rate drifts back toward 4.5 % (3 % of the gap a month)
export const DISC = Object.freeze({ ppa: 2.0, merchant: 3.5, line: 1.5, hair: 0.9 }); // DCF premium over the rate; merchant price haircut
export const LTV = Object.freeze({ ppa: 0.75, merchant: 0.6, line: 0.8, fund: 0.05 });
export const TERM = Object.freeze({ tenor: 228, long: 60, life: 240, fee: 0.01 });
const DEV = Object.freeze({ fee: 0.05, eqReq: 0.25, overrun: 0.15, delayMax: 3, checkFee: 250000, qLo: 0.88, qSpan: 0.24, qBand: 0.03, engBand: 0.06 });
export const SLOT = Object.freeze({ queueFee: 1000000, wait: 9, queueMax: 2, freeMax: 2, resale: 1.1, engCut: 0.75 });
const STAKE = Object.freeze({ share: 0.49, cut: 0.95 });
const BANK = Object.freeze({ runs: 3, rival: 0.7, standby: 0.05 });
const CHAR = Object.freeze({ kibPermit: 0.8, kibVote: 3, kibInKind: 0.2, lp: 0.06, lpEvery: 12 });
export const MAX_OPEN = 4; // projects under construction at once
export const SELL_PLANT = 0.95;
const SQUEEZE = Object.freeze({ paydays: 3, window: 6 }); // 3 paydays in breach within the last 6 → the lenders call the loans
/** The guide's refinancing trigger: room > 15 % of the plant's debt (as tuned; the spec's "headroom > 30 %" measured on the debt left plants idle). */
export const REFI_HEAD = 0.15;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r10 = (x) => Math.round(x / 10) * 10;
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const frac = (x) => x - Math.floor(x);
/** x^n for an integer n ≥ 0 (repeated squaring — exact IEEE products, identical in every engine). */
function powi(x, n) { let r = 1, b = x, e = Math.max(0, Math.floor(n)); while (e > 0) { if (e - 2 * Math.floor(e / 2) === 1) r *= b; b *= b; e = Math.floor(e / 2); } return r; }
/** Present value of 1 a month for n months at a monthly rate rm. */
export function annuity(rm, n) { if (n <= 0) return 0; if (rm <= 0) return n; return (1 - 1 / powi(1 + rm, n)) / rm; }
/** The level monthly payment that repays `debt` over n months at rm (interest + principal). */
export function payment(debt, rm, n) { if (debt <= 0) return 0; if (n <= 0) return debt; return rm <= 0 ? debt / n : debt * rm / (1 - 1 / powi(1 + rm, n)); }

const W = (st) => st.world;
const EN = (st) => st.world.en;
const opsOf = (st, ck) => st.assets.filter((a) => a.op && (!ck || a.op.ck === ck));
const projs = (st) => opsOf(st, 'proj');
const plants = (st) => st.assets.filter((a) => a.op && (a.op.ck === 'plant' || a.op.ck === 'line'));
const freeSlots = (st) => opsOf(st, 'slot');
const phaseOf = (st) => (st.econ && st.econ.phase) || 'slow';
const isEng = (st) => st.charId === 'gridEng';
const isFund = (st) => st.charId === 'infraFund';
const isKib = (st) => st.charId === 'kibbutz';
const findA = (st, id, cks) => { const n = +String(id || '').replace(/^a/, ''); return st.assets.find((x) => x.id === n && x.op && (!cks || cks.includes(x.op.ck))) || null; };
function fail(out, msg) { out.ok = false; out.error = msg; return false; }

/* ---------------------------------------------------------------- prices */
/** The spot's long-run mean now: base × demand (cycle) × carbon. */
export const meanOf = (st) => Math.round(SPOT.start * (DEM[phaseOf(st)] || 1) * EN(st).carbon);
const ownSolar = (st) => st.assets.reduce((s, a) => s + (a.op && a.op.ck === 'plant' && (a.op.tech === 'solar' || a.op.tech === 'hybrid') ? a.op.mw : 0), 0);
/** Solar capture rate 0.55–1: a merchant solar MWh earns spot × capture (noon cannibalisation by all the solar on the grid). */
export function captureOf(st, month = st.month) {
  const P = EN(st); const mw = CANN.mkt0 + CANN.grow * Math.max(0, month - 1) + CANN.own * ownSolar(st) + (P.mktAdd || 0);
  return round3(clamp(1 - CANN.k * mw / CANN.ref, CANN.min, 1));
}
const techCapture = (st, tech) => (tech === 'wind' ? WIND_CAPTURE : tech === 'hybrid' ? Math.min(1, captureOf(st) + 0.15) : captureOf(st));
/** Storage spread share: wider as solar cannibalises noon prices, wider in a spike month. */
export function spreadOf(st, now = true) { const P = EN(st); return round3(STORE.base + STORE.cann * (1 - captureOf(st)) + (now ? (P.spike ? STORE.spike : 0) + STORE.vol * (P.vol || 0) : 0)); }
const termRm = (st) => (EN(st).rate + RATE.term) / 1200;
/** Construction-loan rate (% a month, capitalised). */
export const buildRate = (st) => round3((EN(st).rate + RATE.build) / 12);

/* ---------------------------------------------------------------- plant economics */
/** Expected monthly output (MWh) at an average month: mw × 730 h × CF × the site's quality. */
const expMWh = (o) => o.mw * 730 * (TECH[o.tech].cf || 0) * (o.q || 1);
/** Expected revenue a month — the bank's view (merchant at the mean, haircut). */
function expRev(st, o, forBank = true) {
  const P = EN(st); const mean = meanOf(st); const h = forBank ? DISC.hair : 1;
  if (o.tech === 'line') return o.reg;
  if (o.tech === 'storage') return o.offtake === 'ppa' ? o.ppa * o.mw : Math.round(o.mw * STORE.mwh * mean * spreadOf(st, false) * h);
  if (o.offtake === 'ppa') return Math.round(expMWh(o) * o.ppa);
  void P; return Math.round(expMWh(o) * mean * techCapture(st, o.tech) * h);
}
export const expEbitda = (st, o, forBank = true) => Math.round(expRev(st, o, forBank) - o.opex);
const premOf = (o) => (o.tech === 'line' ? DISC.line : o.offtake === 'ppa' ? DISC.ppa : DISC.merchant);
/** DCF value of the whole plant (100 %, before the stake) at today's rate. */
export function dcfOf(st, o) { const rm = (EN(st).rate + premOf(o)) / 1200; return r1000(Math.max(0, expEbitda(st, o)) * annuity(rm, o.life)); }
const ltvOf = (st, o) => (o.tech === 'line' ? LTV.line : o.offtake === 'ppa' ? LTV.ppa : LTV.merchant) + (isFund(st) ? LTV.fund : 0);
/** Refinancing room (100 %): LTV × DCF − debt. */
export const refiRoom = (st, o) => Math.max(0, r1000(ltvOf(st, o) * dcfOf(st, o) - o.debt));
/** The PPA price a plant would sign today (₪/MWh; storage: ₪/MW/month tolling). */
export function ppaNow(st, tech) {
  const P = EN(st);
  if (tech === 'storage') return Math.round(PPA.share * STORE.mwh * P.avg * spreadOf(st, false) * P.ppaCut);
  return Math.round(PPA.share * P.avg * (tech === 'wind' ? WIND_CAPTURE : 1) * P.ppaCut);
}
/** One month of a plant from this month's draws: {mwh, price, rev, opex, pay, interest, principal, cf}. */
function plantMonth(st, a, ctx) {
  const o = a.op; const P = EN(st); const rm = termRm(st);
  const interest = Math.round(o.debt * rm); const pay = Math.round(payment(o.debt, rm, o.tenor)); const principal = Math.max(0, Math.min(o.debt, pay - interest));
  let mwh = 0, price = 0, rev = 0;
  const off = (P.shocks || []).some((s) => s.t === 'off' && s.id === a.id && s.from <= st.month && s.until >= st.month);
  if (o.tech === 'line') rev = o.reg;
  else if (!off) {
    const r = P.cfr[o.slot] ?? 0.5; const T = TECH[o.tech];
    let cap = 1; for (const s of P.shocks || []) if (s.t === 'curtail' && s.from <= st.month && s.until >= st.month) cap = Math.min(cap, s.v);
    if (o.tech === 'storage') { price = o.offtake === 'ppa' ? o.ppa : Math.round(STORE.mwh * P.px * spreadOf(st)); rev = Math.round(o.mw * price * cap); }
    else {
      const sz = T.season ? SEASON[T.season][(ctx.calOf(st) || 1) - 1] : 1;
      let sh = 1; for (const s of P.shocks || []) if (s.t === 'sand' && s.from <= st.month && s.until >= st.month && T.season === 'solar') sh *= s.v;
      mwh = Math.round(o.mw * 730 * T.cf * sz * (0.9 + 0.2 * r) * (o.q || 1) * sh * cap);
      price = o.offtake === 'ppa' ? o.ppa : Math.round(P.px * techCapture(st, o.tech)); rev = Math.round(mwh * price);
    }
  }
  const cf = r10((rev - o.opex - pay) * (o.stake ?? 1));
  return { mwh, price, rev, opex: o.opex, pay, interest, principal, cf, off };
}
function revalue(st, a) {
  const o = a.op; const s = o.stake ?? 1;
  if (o.ck === 'proj') { a.value = r1000(valueAtCost(o.sb) * s); a.debt = Math.round(o.sb.loan * s); }
  else if (o.ck === 'plant' || o.ck === 'line') { a.value = r1000(dcfOf(st, o) * s); a.debt = Math.round(o.debt * s); }
  else if (o.ck === 'slot') { a.value = o.fee; a.debt = 0; }
  else if (o.ck === 'site') { a.value = o.land || 0; a.debt = 0; }
  else if (o.ck === 'h2') { a.value = o.done ? (o.hit ? o.payoff : 0) : o.cost0; a.debt = 0; }
}
const revalueAll = (st) => { for (const a of st.assets) if (a.op) revalue(st, a); };

/* ---------------------------------------------------------------- sealed fate (4 draws → a project) */
function fateFrom(st, rs, site) {
  const T = TECH[site.tech]; let permit = T.permit[0] + Math.floor(frac(rs[0] * 31) * (T.permit[1] + 1));
  if (isKib(st)) permit = Math.max(1, Math.round(permit * CHAR.kibPermit)) + 1 + Math.floor(frac(rs[3] * 613) * CHAR.kibVote); // land support (−20 %), then the community vote (1–3 months)
  return { permit: permit + (site.permitAdd || 0), over: round3(rs[1] * DEV.overrun), delay: Math.floor(rs[2] * (DEV.delayMax + 1)), delayAt: Math.min(T.stages - 1, Math.floor(frac(rs[2] * 977) * T.stages)),
    q: round3(DEV.qLo + DEV.qSpan * rs[3]) };
}
/** The project's planned cost (all-in capex) now: the site × the panel-price shock (and the kibbutz's free land). */
const capexOf = (st, site) => r1000(site.capex * EN(st).capexMult);
function makeProject(st, site, fate, extra = {}) {
  const T = TECH[site.tech]; const capex = capexOf(st, site); const dev = site.freeLand ? 0 : r1000(capex * DEV.fee);
  const inKind = site.freeLand ? r1000(capex * CHAR.kibInKind) : 0; // the kibbutz's land counts as part of its equity
  const sb = newBuild({ now: st.month, permitAt: st.month + fate.permit, stages: T.stages, stageMonths: T.stageMonths, cost: capex - dev, land: dev + inKind, eqReq: DEV.eqReq,
    overrun: fate.over, delayAt: fate.delayAt, delay: fate.delay, failAt: -1, equity: dev + inKind });
  return { ck: 'proj', tech: site.tech, mw: site.mw, capex, sb, slot: false, q: fate.q, offtake: site.tech === 'solar' ? 'ppa' : 'merchant', stake: 1,
    qShown: qRange(st, fate.q, !!extra.checked), permitShown: { ...permitRange(st, site), from: st.month }, inKind, ...extra.op };
}
/** The CF-quality range a player sees: wide, narrower for the grid engineer, ± 3 % after a resource study. */
function qRange(st, q, checked) { if (checked) return { lo: round2(Math.max(DEV.qLo, q - DEV.qBand)), hi: round2(Math.min(DEV.qLo + DEV.qSpan, q + DEV.qBand)) }; if (isEng(st)) return { lo: round2(Math.max(DEV.qLo, q - DEV.engBand)), hi: round2(Math.min(DEV.qLo + DEV.qSpan, q + DEV.engBand)) }; return { lo: DEV.qLo, hi: round2(DEV.qLo + DEV.qSpan) }; }
const permitRange = (st, site) => { const T = TECH[site.tech]; let lo = T.permit[0], hi = T.permit[0] + T.permit[1]; if (isKib(st)) { lo = Math.max(1, Math.round(lo * CHAR.kibPermit)) + 1; hi = Math.max(1, Math.round(hi * CHAR.kibPermit)) + CHAR.kibVote; } return { lo: lo + (site.permitAdd || 0), hi: hi + (site.permitAdd || 0) }; };

/** Completion: the construction loan becomes a floating-rate term loan; the plant takes a free CF slot and signs its offtake. */
function complete(st, a, out, ctx) {
  const o = a.op; const P = EN(st); const used = new Set(plants(st).map((x) => x.op.slot));
  let slot = 0; while (used.has(slot) && slot < SLOTS) slot++;
  const debt = o.sb.loan; delete o.sb; o.ck = 'plant'; o.slot = Math.min(SLOTS - 1, slot); o.debt = debt; o.tenor = TERM.tenor; o.life = TERM.life; o.opex = Math.round(TECH[o.tech].opexMW * o.mw); o.since = st.month;
  o.ppa = o.offtake === 'ppa' ? ppaNow(st, o.tech) : 0; P.built++;
  const m = plantMonth(st, a, ctx); o.last = m; o.cf = m.cf; revalue(st, a);
  out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'completed', { name: a.n, offtake: o.offtake === 'ppa' ? 'בחוזה PPA' : 'בשוק החופשי' }) || `${a.n} מחובר לרשת ומוכר חשמל ${o.offtake === 'ppa' ? 'בחוזה PPA' : 'בשוק החופשי'}.`, assetId: 'a' + a.id });
  ctx.sound(out, 'coin'); ctx.lesson(st, out, 'dcf_value');
}

/* ---------------------------------------------------------------- the module */
export const energy = {
  id: ID, draws: DRAWS,
  lessons: ['dcf_value', 'refinance', 'ppa_merchant', 'cannibalisation', 'debt_service'],
  mentorKeys: ['siteAsk', 'siteBuy', 'sitePass', 'checked', 'permitIn', 'stalledEquity', 'stalledSlot', 'slotIn', 'delayed', 'completed', 'refied', 'lpPaid'],
  sealed: ['pending.wr', 'world.en.fates', 'world.en.cfr', 'assets[].op.q', 'assets[].op.sb.permitAt', 'assets[].op.sb.overrun', 'assets[].op.sb.delay', 'assets[].op.sb.delayAt'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 8 'world' draws at init, whoever plays
    W(st).en = { spot: SPOT.start, px: SPOT.start, avg: SPOT.start, vol: 0, spike: 0, rate: RATE.start, rateAvg: RATE.start, carbon: 1, ppaCut: 1, capexMult: 1, mktAdd: 0,
      cfr: Array.from({ length: SLOTS }, () => 0.5), shocks: [], queue: [], fates: rs, built: 0, refis: 0, refiCash: 0, stalls: 0, stallMonths: 0, forced: 0, squeeze: 0, squeezes: 0, breach: [], lpPaid: 0, lpNext: CHAR.lpEvery, start: ch && ch.cash || 0 };
  },
  defaults(st) { const P = EN(st); if (!P) return; if (!Array.isArray(P.shocks)) P.shocks = []; if (!Array.isArray(P.queue)) P.queue = []; },

  monthly(st, out, ctx) {
    const P = EN(st); const r0 = ctx.draw(st), r1 = ctx.draw(st); // exactly 2 + 8 'world' draws every payday, whatever the player owns
    for (let i = 0; i < SLOTS; i++) P.cfr[i] = round3(ctx.draw(st));
    // 1. settle the month just paid: each plant's principal (its cf already paid the whole debt service)
    for (const a of plants(st)) { const o = a.op; if (o.last) { o.debt = Math.max(0, o.debt - o.last.principal); } o.tenor = Math.max(1, o.tenor - 1); o.life = Math.max(1, o.life - 1); }
    // 2. the power market: a mean-reverting spot (cycle demand × carbon), a spike month (r1), heatwave shocks; storage's volatility
    const mean = meanOf(st); const prev = P.px;
    P.spot = Math.round(clamp(P.spot + SPOT.revert * (mean - P.spot) + (r0 - 0.5) * 2 * SPOT.noise, SPOT.min, SPOT.max));
    P.spike = r1 < SPOT.spikeP ? 1 : 0; let px = P.spot * (P.spike ? 1 + SPOT.spike : 1);
    for (const s of P.shocks) if (s.t === 'heat' && s.from <= st.month && s.until >= st.month) { px *= s.v; P.spike = 1; }
    P.px = Math.round(clamp(px, SPOT.min, SPOT.max * 1.5)); P.vol = round3(Math.min(0.5, Math.abs(P.px - prev) / Math.max(1, mean)));
    P.rate = round2(clamp(P.rate + (RATE.start - P.rate) * RATE.revert + (frac(r0 * 7919) - 0.5) * 2 * RATE.noise, RATE.min, RATE.max)); // the policy rate wanders (± noise, from the same draw) and reverts
    P.avg = Math.round(P.avg + (P.spot - P.avg) / 12); P.rateAvg = round2(P.rateAvg + (P.rate - P.rateAvg) / 12);
    if (P.spike) out.news.push({ kind: 'energy', text: `קפיצה במחיר החשמל: ${P.px} ₪ למגה־ואט שעה. מי שמוכר בשוק החופשי — ומי שאוגר — מרוויח החודש.` });
    // 3. the grid operator's queue: a slot arrives after its public wait
    for (const q of P.queue.slice()) if (q.at <= st.month) { P.queue.splice(P.queue.indexOf(q), 1); addSlot(st, out, ctx, q.fee, 'חיבור מהתור של מנהל הרשת'); }
    // 4. builds: a slot is consumed when construction starts (the oldest waiting project takes it); the loan draws only with a slot
    for (const a of projs(st).slice()) {
      const o = a.op; const b = o.sb;
      if (!o.slot && st.month >= b.permitAt) { const s = freeSlots(st)[0]; if (s) { o.slot = true; st.assets = st.assets.filter((x) => x !== s); out.despawn.push('a' + s.id); out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'slotIn', { name: a.n }) || `${a.n} קיבל חיבור לרשת. הבנק מוכן לממן את הבנייה.`, assetId: 'a' + a.id }); } }
      b.gateOk = !!o.slot; b.selfFund = false;
      const share = o.stake ?? 1;
      const m = buildMonth(b, { month: st.month, cash: Math.max(0, st.cash) / share, rate: buildRate(st) });
      if (m.permitNow) { o.permitShown = null;
        out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'permitIn', { name: a.n }) || `${a.n}: ההיתרים הגיעו. מתחילים לבנות.`, assetId: 'a' + a.id }); }
      if (m.equityPaid) { const pay = Math.round(m.equityPaid * share); st.cash -= pay; ctx.cashFx(out, -pay, `הון עצמי ל${a.n} ${ctx.fmtM(pay)}`); }
      if (m.stalled === 'equity') { P.stalls++; out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'stalledEquity', { name: a.n }) || `${a.n} עומד: אין מזומן להון העצמי. הריבית ממשיכה לרוץ.`, assetId: 'a' + a.id }); }
      if (m.stalled === 'gate') { P.stalls++; out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'stalledSlot', { name: a.n }) || `${a.n} עומד: בלי חיבור לרשת הבנק לא מממן את הבנייה.`, assetId: 'a' + a.id }); }
      if (m.stalled && m.stalled !== 'permit') P.stallMonths++;
      if (m.delayNow) out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'delayed', { name: a.n, months: String(b.delay) }) || `${a.n}: עיכוב של ${b.delay} חודשים באתר.`, assetId: 'a' + a.id });
      const hold = (m.stalled === 'equity' || m.stalled === 'gate' || m.stalled === 'paused') ? Math.round(monthCost(b) * BANK.standby * share) : 0;
      if (hold > 0) { st.cash -= hold; ctx.cashFx(out, -hold, `דמי המתנה לקבלן ${ctx.fmtM(hold)}`); }
      if (m.stalled === 'equity') o.stallRun = (o.stallRun || 0) + 1; else if (m.progressed) o.stallRun = 0;
      if ((o.stallRun || 0) >= BANK.runs) { revalue(st, a); const offer = r1000(a.value * BANK.rival); const net = offer - a.debt; st.cash += net; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); P.forced++;
        ctx.cashFx(out, net, ctx.sgn(net)); out.news.push({ kind: 'energy', text: `הבנק קרא להלוואה של ${a.n}: ${BANK.runs} חודשים בלי הון עצמי. יזם מתחרה קנה אותו ב־${ctx.fmtM(offer)} — ${ctx.fmtM(net)} אחרי החובות.` }); continue; }
      if (m.completed) complete(st, a, out, ctx);
    }
    // 5. plants: this month's output and money (paid at the next payday through the asset cash flow)
    for (const a of plants(st)) { const m = plantMonth(st, a, ctx); a.op.last = m; a.op.cf = m.cf; if (a.op.offtake === 'merchant' && (a.op.tech === 'solar' || a.op.tech === 'hybrid') && captureOf(st) < 0.8) ctx.lesson(st, out, 'cannibalisation'); }
    // 6. the hydrogen pilot: revealed after its months, from this month's spike draw (no extra draw)
    for (const a of opsOf(st, 'h2')) { const o = a.op; if (!o.done && st.month >= o.revealAt) { o.done = true; o.hit = r1 > 1 - o.p; revalue(st, a);
      out.news.push({ kind: 'energy', text: o.hit ? `פיילוט המימן הירוק הצליח: משקיע מאירופה מעריך אותו ב־${ctx.fmtM(o.payoff)}.` : 'פיילוט המימן הירוק נסגר. הטכנולוגיה לא הבשילה בזמן — ההשקעה נמחקה.', assetId: 'a' + a.id }); } }
    // 7. the fund's LP pressure: every 12 paydays it must distribute 6 % of its equity (a forced cash outflow)
    if (isFund(st) && st.stats.paydays >= P.lpNext) { P.lpNext += CHAR.lpEvery; const amt = r1000(CHAR.lp * Math.max(P.start, ctx.netWorth(st))); st.cash -= amt; P.lpPaid += amt;
      ctx.cashFx(out, -amt, `חלוקה למשקיעי הקרן ${ctx.fmtM(amt)}`); out.news.push({ kind: 'energy', text: ctx.mentorLine(st, 'lpPaid', { amount: ctx.fmtM(amt) }) || `המשקיעים בקרן קיבלו את החלוקה השנתית: ${ctx.fmtM(amt)}.` }); }
    P.shocks = P.shocks.filter((s) => s.until >= st.month);
    if (st.cash < 0) ctx.ensureCash(st, out, 'energy');
    revalueAll(st);
    // 8. a debt-service squeeze: the plants' month is negative — their debt service above what they earn — while the bank debt is past the
    //    voluntary cap by more than the month's gap (forced loans pay the lenders): 3 such paydays within 6 and the lenders call every loan —
    //    bankruptcy, whatever the plants are worth on paper (the lesson of over-refinancing into a rate shock)
    { let pc = 0; for (const a of plants(st)) pc += a.op.cf || 0;
      const bad = plants(st).length > 0 && pc < 0 && st.loans > ctx.loanCap(st) + Math.max(1000000, -pc);
      if (!Array.isArray(P.breach)) P.breach = []; P.breach.push(bad ? 1 : 0); while (P.breach.length > SQUEEZE.window) P.breach.shift();
      P.squeeze = P.breach.reduce((x, y) => x + y, 0);
      if (bad) { P.squeezes = (P.squeezes || 0) + 1;
        if (P.squeeze >= SQUEEZE.paydays) { st.flags.bankrupt = true; out.news.push({ kind: 'energy', text: 'הבנקים קראו להלוואות: התחנות לא מכסות את החזרי החוב, והבנק כבר לא מלווה. החוב אכל את ההכנסה.' }); }
        else out.news.push({ kind: 'energy', text: `אזהרה: התחנות לא מכסות את החזרי החוב שלהן (${ctx.fmtM(-pc)} בחודש), והבנק מממן את החוסר בהלוואות כפויות. עוד ${SQUEEZE.paydays - P.squeeze} ${SQUEEZE.paydays - P.squeeze === 1 ? 'משכורת' : 'משכורות'} כאלה בחצי השנה הקרובה — והבנקים יקראו להלוואות.` }); } }
    if (plants(st).some((a) => a.op.debt > 0) && st.stats.paydays >= 3) ctx.lesson(st, out, 'debt_service');
  },

  asset: {
    create(st, a, card, ctx) {
      const op = JSON.parse(JSON.stringify(card.op)); a.op = op; a.cf = 0; const P = EN(st);
      if (op.ck === 'proj' && !op.sb) { // a starting project: its fate is its 4 init draws (fateIdx)
        const rs = op.fateIdx != null && P ? P.fates.slice(op.fateIdx * 4, op.fateIdx * 4 + 4) : [0.5, 0, 0, 0.5];
        const pr = makeProject(st, op.site, fateFrom(st, rs, op.site), {}); if (op.slotNow) pr.slot = true; delete op.site; delete op.fateIdx; delete op.slotNow; Object.assign(op, pr);
      }
      if (op.ck === 'plant' || op.ck === 'line') { // a plant bought on an 'O' card: the card's loan is its term debt
        op.debt = a.debt; op.life = op.life || TERM.life; op.tenor = op.tenor || Math.max(24, Math.min(TERM.tenor, op.life - 12)); op.stake = 1; op.since = st.month;
        if (op.opex == null) op.opex = Math.round((TECH[op.tech].opexMW || 0) * op.mw); if (op.slot == null) op.slot = -1;
        if (op.tech !== 'line') { const used = new Set(plants(st).map((x) => x.op.slot)); let s = 0; while (used.has(s) && s < SLOTS) s++; op.slot = Math.min(SLOTS - 1, s); }
        const m = plantMonth(st, a, ctx); op.last = m; op.cf = m.cf;
      }
      if (op.ck === 'h2') { op.revealAt = st.month + op.months; op.done = false; op.cost0 = Math.round(card.cost || card.value || 0); }
      if (op.ck === 'site' && op.fateIdx != null && P) { op.fate = P.fates.slice(op.fateIdx * 4, op.fateIdx * 4 + 4); delete op.fateIdx; }
      revalue(st, a);
    },
    cf(st, a) {
      const o = a.op;
      if (o.ck === 'plant' || o.ck === 'line') return r10(o.cf || 0);
      if (o.ck === 'h2') return o.done ? 0 : -o.burn;
      return 0; // a project pays nothing until it is connected; its interest is capitalised into the loan
    },
  },
  deal: {
    describe(st, p, ev, ctx) {
      const c = p.card; if (!c.op) return; const d = ev.data;
      if (c.op.ck === 'slot') {
        const waiting = projs(st).filter((a) => !a.op.slot).length; const free = freeSlots(st).length;
        d.slot = { fee: c.op.fee, waiting, free, queued: EN(st).queue.length, queueWait: SLOT.wait, note: 'חיבור לרשת: בלעדיו הבנק לא מממן את הבנייה. החיבור נצרך כשהבנייה מתחילה. אפשר גם למכור אותו ליזם אחר.' };
        const buy = ev.options.find((o) => o.kind === 'buy' && o.enabled);
        if (free >= SLOT.freeMax) { for (const o of ev.options) if (o.kind === 'buy') { o.enabled = false; o.reason = 'כבר יש לך שני חיבורים פנויים'; } }
        else if (buy && waiting + (projs(st).length < 2 ? 1 : 0) > free + EN(st).queue.length && st.cash >= c.down + ctx.expenses(st) * 2) ev.forcePrimary = buy.id;
      }
      if (c.op.ck === 'plant' || c.op.ck === 'line') { const o = { ...c.op, debt: c.cost - c.down, life: c.op.life || TERM.life, opex: c.op.opex ?? Math.round((TECH[c.op.tech].opexMW || 0) * c.op.mw) };
        const pay = Math.round(payment(o.debt, termRm(st), TERM.tenor)); const net = expEbitda(st, o, false) - pay; let calls = 0; for (const x of projs(st)) calls += equityGap(x.op.sb) * (x.op.stake ?? 1);
        d.plant = { tech: o.tech, mw: o.mw || 0, offtake: o.offtake || 'line', ppa: o.ppa || 0, ebitda: expEbitda(st, o), debtService: pay, net, dcf: dcfOf(st, o), ltv: ltvOf(st, o), life: o.life, refiRoom: refiRoom(st, o), note: o.tech === 'line' ? 'קו הולכה: תשואה מפוקחת וקבועה. בלי מזג אוויר ובלי מחיר שוק.' : 'תחנה שכבר עובדת: התפוקה ידועה, המחיר גבוה.' };
        // the guide buys an operating asset only when it recycles: a refinancing right after the purchase returns ≥ half the down payment
        // (a bargain), its equity still earns ≥ 12 % a year after debt service, and the open equity calls stay covered
        const buy = ev.options.find((x) => x.kind === 'buy' && x.enabled); const pass = ev.options.find((x) => x.id === 'pass' && x.enabled);
        if (buy && d.plant.refiRoom >= 0.5 * c.down && net * 12 >= 0.12 * c.down && st.cash - c.down >= calls + ctx.expenses(st) * 3) ev.forcePrimary = buy.id; else if (pass) ev.forcePrimary = pass.id; }
      if (c.op.ck === 'h2') { const pass = ev.options.find((x) => x.id === 'pass' && x.enabled); if (pass) ev.forcePrimary = pass.id; }
      if (c.op.ck === 'h2') d.h2 = { burn: c.op.burn, months: c.op.months, payoff: c.op.payoff, p: c.op.p, note: 'פיילוט: שורף מזומן כל חודש. אחרי התקופה — או שמישהו קונה אותו ביוקר, או שהוא נמחק.' };
    },
  },
  market: {
    create(st, p) {
      const c = p.card; const P = EN(st); const m = st.month;
      if (c.mk === 'rate') P.rate = round2(clamp(P.rate + c.dr, RATE.min, RATE.max));
      if (c.mk === 'feedin') P.ppaCut = round3(P.ppaCut * (1 - c.cut));
      if (c.mk === 'heat') P.shocks.push({ t: 'heat', v: 1 + c.add, from: m, until: m + (c.months || 1) - 1 });
      if (c.mk === 'sand') P.shocks.push({ t: 'sand', v: 1 - c.cut, from: m, until: m });
      if (c.mk === 'curtail') P.shocks.push({ t: 'curtail', v: c.cap, from: m, until: m + c.months - 1 });
      if (c.mk === 'panels') { P.capexMult = round3(P.capexMult * (1 - c.cut)); for (const a of projs(st)) if (a.op.sb.phase === 'permit') { a.op.sb.cost = Math.round(a.op.sb.cost * (1 - c.cut)); a.op.capex = r1000(a.op.capex * (1 - c.cut)); } }
      if (c.mk === 'carbon') P.carbon = round3(P.carbon * (1 + c.add));
      if (c.mk === 'boom') P.mktAdd = (P.mktAdd || 0) + c.mw;
    },
    describe(st, p, ev) { const c = p.card; const P = EN(st); ev.data.energy = { mk: c.mk, rate: P.rate, spot: P.spot, avg: P.avg, capture: captureOf(st), ppaCut: P.ppaCut, capexMult: P.capexMult, months: c.months || null };
      if (!plants(st).length && !projs(st).length && c.mk !== 'rate' && c.mk !== 'panels' && c.mk !== 'feedin' && c.mk !== 'carbon') { ev.auto = true; ev.toastText = c.n; } },
  },
  crisis: {
    create(st, p) {
      const c = p.card;
      if (c.mk === 'transformer') { const a = plants(st).filter((x) => x.op.tech !== 'line').sort((x, y) => y.op.mw - x.op.mw || x.id - y.id)[0]; if (a) { EN(st).shocks.push({ t: 'off', id: a.id, from: st.month, until: st.month + 1 }); p.hit = [a.id]; } }
    },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) {
    const P = EN(st);
    for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op) continue; const o = a.op;
      m.tech = o.tech || o.ck;
      if (o.ck === 'proj') { const b = o.sb; const pc = pctDone(b); m.pct = round2(pc); m.stage = b.phase === 'permit' ? 0 : pc < 0.34 ? 1 : pc < 0.67 ? 2 : 3; m.unconnected = !o.slot; m.stalled = !!(b.paused || b.delayLeft > 0 || (o.stallRun || 0) > 0);
        m.units = Math.max(1, Math.round(o.mw / 10)); m.craneOn = b.phase === 'build' && !m.stalled; }
      if (o.ck === 'plant' || o.ck === 'line') { m.stage = 4; const exp = o.tech === 'line' ? 1 : Math.max(1, expMWh(o)); m.output = o.tech === 'line' || o.tech === 'storage' ? round2(o.last && !o.last.off ? 1 : 0) : round2(clamp((o.last ? o.last.mwh : 0) / exp, 0, 1.5)); m.pulse = m.output;
        m.units = Math.max(1, Math.round((o.mw || 10) / 10)); m.offtake = o.offtake || 'line'; m.stake = o.stake ?? 1; m.down = !!(o.last && o.last.off); m.spike = !!P.spike; }
      if (o.ck === 'slot') { m.stage = 0; m.unconnected = true; m.slot = true; }
      if (o.ck === 'site') { m.stage = 0; m.fence = true; }
      if (o.ck === 'h2') { m.stage = o.done ? (o.hit ? 4 : 5) : 2; } }
  },
  recapHint(st) {
    const P = EN(st); if (!P) return null;
    if (!plants(st).length && !projs(st).length) return 'בפעם הבאה: פרויקט ראשון וחיבור לרשת. במדבר ההכנסה מגיעה רק מתחנות שעובדות.';
    if (P.built >= 1 && !P.refis) return 'בפעם הבאה: מימון מחדש. תחנה שעובדת שווה יותר ממה שעלתה — אפשר ללוות כנגדה ולבנות את הבאה.';
    if (P.stallMonths >= 6) return 'בפעם הבאה: חיבור לרשת והון עצמי לפני שמתחילים לבנות. פרויקט שעומד — הריבית שלו רצה.';
    return null;
  },
  goalValue(st, key, ctx) {
    if (key === 'opIncome') return opIncome(st, ctx);
    if (key === 'stallMonths') return EN(st).stallMonths || 0;
    return 0;
  },
};
/** A plant's run-rate operating income after debt service (your share): its expected month (an average month of output at the site's
 *  quality; merchant power at the 12-month average spot × today's capture; a PPA at its price) − opex − today's debt service. The goal
 *  counts this normalised month, not the month's weather or a one-month price spike (the cash flow itself is the real month). */
export function runRate(st, o) {
  const P = EN(st); let rev;
  if (o.tech === 'line') rev = o.reg;
  else if (o.tech === 'storage') rev = o.offtake === 'ppa' ? o.ppa * o.mw : Math.round(o.mw * STORE.mwh * P.avg * spreadOf(st, false));
  else rev = Math.round(expMWh(o) * (o.offtake === 'ppa' ? o.ppa : P.avg * techCapture(st, o.tech)));
  const pay = Math.round(payment(o.debt, termRm(st), o.tenor));
  return r10((rev - o.opex - pay) * (o.stake ?? 1));
}
/** The goal: operating income AFTER debt service — every plant's run-rate month (its own term loan paid, your share) minus the interest
 *  on bank loans (equity borrowed from the bank is debt too) and the hydrogen pilot's burn. LP distributions and salary do not count. */
export function opIncome(st, ctx) {
  let s = 0; for (const a of plants(st)) s += runRate(st, a.op);
  for (const a of opsOf(st, 'h2')) if (!a.op.done) s -= a.op.burn;
  return Math.round(s - (st.loans > 0 ? st.loans * ctx.loanPct(st) / 100 : 0));
}
function addSlot(st, out, ctx, fee, n) {
  const a = ctx.buy(st, { k: 'slot', n, cost: 0, down: 0, value: fee, cf: 0, op: { ck: 'slot', fee } }, out, { label: 'חיבור לרשת', noLoan: true });
  if (a) out.news.push({ kind: 'energy', text: `${n}: יש לך חיבור פנוי לרשת.`, assetId: 'a' + a.id });
}

/* ---------------------------------------------------------------- 'V' — a site for a power project */
energy.tiles.V = {
  safe: 'pass',
  create(st, ctx) {
    const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 4 'world' draws on every V landing, whatever is chosen
    const sites = ctx.world(st).sites || []; const s = sites[Math.min(sites.length - 1, Math.floor(frac(rs[0] * 7919) * sites.length))];
    return { wr: rs, site: JSON.parse(JSON.stringify(s)), checked: false };
  },
  describe(st, p, ev, ctx) {
    const s = p.site; const I = siteInfo(st, p, ctx); const T = TECH[s.tech];
    ev.tag = 'אתר לפרויקט אנרגיה'; ev.title = s.n;
    ev.text = `${s.d} ${T.label}, ${s.mw} מגה־ואט. עלות הקמה ${ctx.fmtM(I.capex)} ב־${T.stages} שלבים. ייזום ${ctx.fmtM(I.dev)} עכשיו, ו־${Math.round(DEV.eqReq * 100)}% הון עצמי לפני שהבנק נכנס. היתרים: ${I.permit.lo}–${I.permit.hi} חודשים.`;
    ev.mentor = ctx.mentorLine(st, 'siteAsk', {}) || 'תשתית היא כסף של היום תמורת כסף של מחר. כמה הון עצמי תצטרך, ומאיפה יגיע החיבור לרשת?';
    ev.data = { tech: s.tech, mw: s.mw, capex: I.capex, dev: I.dev, eqReq: DEV.eqReq, equityNeed: I.eqNeed, stages: T.stages, stageMonths: T.stageMonths, permit: I.permit, checked: !!p.checked, q: I.q, checkFee: DEV.checkFee,
      ebitda: I.ebitda, dcf: I.dcf, refiRoom: I.refiRoom, yieldPct: I.yieldPct, months: I.months, rate: EN(st).rate, spot: EN(st).spot, avg: EN(st).avg, capture: captureOf(st), ppa: ppaNow(st, s.tech),
      slots: { free: freeSlots(st).length, waiting: projs(st).filter((a) => !a.op.slot).length, queued: EN(st).queue.length }, active: projs(st).length, cashAfter: I.cashAfter, nextCalls: I.calls,
      partner: { share: STAKE.share, dev: I.devHalf, cashAfter: I.cashAfterHalf, nextCalls: I.callsHalf },
      note: `קודם ייזום והון עצמי (${Math.round(DEV.eqReq * 100)}%), ורק אז הבנק — ורק אם יש לפרויקט חיבור לרשת. כשהתחנה נגמרת: חוזה PPA קבוע או מכירה בשוק החופשי, ואפשר למחזר את ההון במימון מחדש.` };
    if (I.cashAfter < I.calls) ev.data.warning = `אחרי הייזום יישארו ${ctx.fmtM(Math.max(0, I.cashAfter))}, וההון העצמי של הפרויקטים הפתוחים הוא בערך ${ctx.fmtM(I.calls)}.`;
    const full = projs(st).length >= MAX_OPEN || projs(st).length + plants(st).filter((a) => a.op.tech !== 'line').length >= SLOTS; const L = ctx.loanFor(st, I.dev); const LH = ctx.loanFor(st, I.devHalf);
    ev.options = [
      ...(p.checked ? [] : [ctx.opt('check', `סקר משאבים (${ctx.fmtM(DEV.checkFee)}): מקדם הקיבולת ±${Math.round(DEV.qBand * 100)}%`, st.cash >= DEV.checkFee, { kind: 'inspect', reason: st.cash >= DEV.checkFee ? undefined : 'אין מספיק מזומן' })]),
      ctx.opt('build', `לייזם את הפרויקט (${ctx.fmtM(I.dev)} עכשיו)`, !full && L.ok, { kind: 'site', net: I.ebitda, loanAmount: L.need, reason: full ? 'יותר מדי פרויקטים פתוחים' : !L.ok ? 'הבנק לא נותן הלוואה כזו' : undefined }),
      ctx.opt('partner', `לייזם עם שותף: הוא שם ${Math.round(STAKE.share * 100)}% מההון ומקבל ${Math.round(STAKE.share * 100)}% מהתחנה (${ctx.fmtM(I.devHalf)} עכשיו)`, !full && LH.ok, { kind: 'site', net: Math.round(I.ebitda * (1 - STAKE.share)), loanAmount: LH.need, reason: full ? 'יותר מדי פרויקטים פתוחים' : !LH.ok ? 'הבנק לא נותן הלוואה כזו' : undefined }),
      ctx.opt('pass', 'לוותר', true),
    ];
    // the guide (w9 spec, as tuned): a resource study first; at most 2 open projects; cash for 60 % of every open equity call (alone, or with a
    // 49 % partner when the cash covers only the smaller share); a yield above the build rate
    let pick = 'pass'; const open = projs(st).length;
    const base = !full && open < 2 && I.yieldPct > (EN(st).rate + RATE.build);
    const ok = base && L.need === 0 && I.cashAfter >= I.calls * 0.6; const okH = base && LH.need === 0 && I.cashAfterHalf >= I.callsHalf * 0.6;
    if ((ok || okH) && !p.checked && st.cash >= DEV.checkFee + I.devHalf + I.callsHalf * 0.6) pick = 'check'; else if (ok) pick = 'build'; else if (okH) pick = 'partner';
    const po = ev.options.find((o) => o.id === pick && o.enabled) || ev.options.find((o) => o.id === 'pass'); po.primary = true; ev.forcePrimary = po.id;
  },
  choose(st, p, o, params, out, ctx) {
    const s = p.site;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'sitePass', {}) || null; ctx.logDecision(st, 'אתר אנרגיה', 'ויתר'); return true; }
    if (o.id === 'check') { if (st.cash < DEV.checkFee) return true; st.cash -= DEV.checkFee; ctx.cashFx(out, -DEV.checkFee, `סקר משאבים ${ctx.fmtM(DEV.checkFee)}`); p.checked = true; const I = siteInfo(st, p, ctx);
      out.mentor = ctx.mentorLine(st, 'checked', { lo: String(Math.round(I.q.lo * 100)), hi: String(Math.round(I.q.hi * 100)) }) || `סקר המשאבים: האתר מפיק ${Math.round(I.q.lo * 100)}–${Math.round(I.q.hi * 100)}% מהממוצע.`; ctx.logDecision(st, 'אתר אנרגיה', 'סקר משאבים'); return false; }
    const fate = fateFrom(st, p.wr, s); const op = makeProject(st, s, fate, { checked: !!p.checked });
    if (o.id === 'partner') op.stake = round2(1 - STAKE.share); // the partner pays 49 % of the development and of every equity call, and owns 49 %
    const pay = Math.round(op.sb.land * op.stake);
    const a = ctx.buy(st, { k: s.tech, n: s.name || s.n, cost: pay, down: pay, value: pay, op }, out, { label: 'פרויקט חדש' });
    if (!a) { out.mentor = 'הבנק לא נתן הלוואה לייזום.'; return true; }
    revalue(st, a);
    out.mentor = ctx.mentorLine(st, 'siteBuy', {}) || 'ייזמת פרויקט. עכשיו: היתרים, הון עצמי — וחיבור לרשת, בלעדיו הבנק לא נכנס.';
    ctx.lesson(st, out, 'dcf_value'); ctx.logDecision(st, 'אתר אנרגיה', o.id === 'partner' ? 'ייזום עם שותף' : 'ייזום', pay);
    return true;
  },
  score(st, ev, ctx) {
    const d = ev.data || {}; const E = Math.max(1, ctx.expenses(st));
    return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: round2(o.id === 'check' ? 0.5 : o.id === 'build' ? ((d.ebitda || 0) * 0.3 - ((d.cashAfter ?? 0) < (d.nextCalls ?? 0) ? 4 * E : 0)) / E : o.id === 'partner' ? ((d.ebitda || 0) * 0.15 - ((d.partner || {}).cashAfter < (d.partner || {}).nextCalls ? 4 * E : 0)) / E : 0), flags: [], reasons: [] }));
  },
};
/** The site card's public numbers (no sealed field: the quality range, never the quality). */
function siteInfo(st, p, ctx) {
  const s = p.site; const capex = capexOf(st, s); const dev = s.freeLand ? 0 : r1000(capex * DEV.fee);
  const qs = p.checked ? qRange(st, round3(DEV.qLo + DEV.qSpan * p.wr[3]), true) : qRange(st, round3(DEV.qLo + DEV.qSpan * p.wr[3]), false);
  const qMid = round3((qs.lo + qs.hi) / 2); const off = s.tech === 'solar' ? 'ppa' : 'merchant';
  const o = { tech: s.tech, mw: s.mw, q: qMid, offtake: off, ppa: ppaNow(st, s.tech), opex: Math.round(TECH[s.tech].opexMW * s.mw), life: TERM.life, debt: Math.round(capex * (1 - DEV.eqReq)) };
  const ebitda = expEbitda(st, o); const dcf = dcfOf(st, o);
  const permit = permitRange(st, s); const T = TECH[s.tech];
  const eqNeed = Math.max(0, Math.round(DEV.eqReq * capex - dev - (s.freeLand ? r1000(capex * CHAR.kibInKind) : 0)));
  let other = 0; for (const a of projs(st)) other += Math.round(equityGap(a.op.sb) * (a.op.stake ?? 1)); const calls = eqNeed + other; const keep = 1 - STAKE.share;
  const devHalf = Math.round(dev * keep);
  void ctx; return { devHalf, callsHalf: Math.round(eqNeed * keep) + other, cashAfterHalf: Math.round(st.cash - devHalf), capex, dev, q: qs, ebitda, dcf, refiRoom: Math.max(0, r1000(ltvOf(st, o) * dcf - o.debt)), yieldPct: round2(ebitda * 12 / Math.max(1, capex) * 100), permit, months: Math.round((permit.lo + permit.hi) / 2) + T.stages * T.stageMonths, eqNeed, calls, cashAfter: Math.round(st.cash - dev) };
}

/* ---------------------------------------------------------------- between-roll actions (`Z`) */
energy.act = {
  offtake(st, p, out, ctx) { const [id, v] = String(p || '').split(':'); const a = findA(st, id, ['proj', 'plant']); if (!a || !['ppa', 'merchant'].includes(v) || a.op.tech === 'line') return fail(out, 'bad_param');
    const o = a.op; if (o.offtake === v) return fail(out, 'כבר כך');
    if (o.ck === 'plant') { if (v === 'merchant') return fail(out, 'חוזה PPA לא מבטלים באמצע'); o.offtake = 'ppa'; o.ppa = Math.round(ppaNow(st, o.tech) * PPA.switchCut); revalue(st, a); ctx.lesson(st, out, 'ppa_merchant'); out.toast = `${a.n}: עבר לחוזה PPA במחיר מוזל (${o.tech === 'storage' ? ctx.fmtM(o.ppa) + ' למגה־ואט בחודש' : o.ppa + ' ₪ למגה־ואט שעה'}).`; return true; }
    o.offtake = v; ctx.lesson(st, out, 'ppa_merchant'); out.toast = v === 'ppa' ? `${a.n}: ימכור בחוזה PPA קבוע כשיתחבר` : `${a.n}: ימכור בשוק החופשי כשיתחבר`; return true; },
  refi(st, p, out, ctx) { const [id, t] = String(p || '').split(':'); const a = findA(st, id, ['plant', 'line']); if (!a || (t && t !== 'long')) return fail(out, 'bad_param');
    const o = a.op; const room = refiRoom(st, o); if (room < 1000000) return fail(out, 'אין מרווח למימון מחדש');
    const newDebt = o.debt + room; const fee = r1000(newDebt * TERM.fee); const share = o.stake ?? 1; const cash = Math.round((room - fee) * share);
    o.debt = newDebt; o.tenor = Math.max(24, Math.min(o.life - 12, TERM.tenor + (t === 'long' ? TERM.long : 0))); const m = plantMonth(st, a, ctx); o.last = m; o.cf = m.cf;
    st.cash += cash; const P = EN(st); P.refis++; P.refiCash += cash; revalue(st, a); ctx.cashFx(out, cash, '+' + ctx.fmtM(cash)); ctx.lesson(st, out, 'refinance'); ctx.logDecision(st, 'מימון מחדש', t === 'long' ? 'פריסה ארוכה' : 'רגיל', cash);
    out.toast = ctx.mentorLine(st, 'refied', { name: a.n, cash: ctx.fmtM(cash), pay: ctx.fmtM(Math.round(m.pay * share)) }) || `מימון מחדש ל${a.n}: ${ctx.fmtM(cash)} במזומן. ההחזר החודשי עכשיו ${ctx.fmtM(Math.round(m.pay * share))}.`; return true; },
  sellStake(st, p, out, ctx) { const a = findA(st, p, ['plant', 'proj']); if (!a || (a.op.stake ?? 1) < 1) return fail(out, a ? 'כבר מכרת חלק' : 'bad_param');
    const o = a.op; const eq = Math.max(0, a.value - a.debt); const cash = r1000(eq * STAKE.share * STAKE.cut); if (cash <= 0) return fail(out, 'אין שווי למכור');
    o.stake = round2(1 - STAKE.share); st.cash += cash; if (o.ck === 'plant') { const m = plantMonth(st, a, ctx); o.cf = m.cf; o.last = m; } revalue(st, a); ctx.cashFx(out, cash, '+' + ctx.fmtM(cash)); ctx.ensureCash(st, out, 'sell');
    out.toast = `מכרת ${Math.round(STAKE.share * 100)}% מ${a.n} לקרן תשתיות: ${ctx.fmtM(cash)} עכשיו — ומעכשיו ${Math.round(STAKE.share * 100)}% מההכנסה שלו שלה.`; return true; },
  pause(st, p, out) { const a = findA(st, p, ['proj']); if (!a || a.op.sb.phase === 'done') return fail(out, 'bad_param'); a.op.sb.paused = !a.op.sb.paused; out.toast = a.op.sb.paused ? `${a.n}: הבנייה הושהתה — הריבית ממשיכה לרוץ.` : `${a.n}: הבנייה חוזרת.`; return true; },
  applySlot(st, p, out, ctx) { const P = EN(st); if (P.queue.length >= SLOT.queueMax) return fail(out, 'כבר יש שתי בקשות בתור'); const fee = r1000(SLOT.queueFee * (isEng(st) ? SLOT.engCut : 1)); if (st.cash < fee) return fail(out, 'אין מספיק מזומן');
    st.cash -= fee; P.queue.push({ at: st.month + SLOT.wait, fee }); ctx.cashFx(out, -fee, `בקשת חיבור ${ctx.fmtM(fee)}`); out.toast = `נכנסת לתור של מנהל הרשת: חיבור בעוד ${SLOT.wait} חודשים.`; return true; },
  sellSlot(st, p, out, ctx) { const a = findA(st, p, ['slot']); if (!a) return fail(out, 'bad_param'); const cash = r1000(a.op.fee * SLOT.resale); st.cash += cash; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, cash, '+' + ctx.fmtM(cash));
    out.toast = `מכרת את החיבור לרשת ליזם אחר: ${ctx.fmtM(cash)}.`; return true; },
  develop(st, p, out, ctx) { const [id, t] = String(p || '').split(':'); const a = findA(st, id, ['site']); if (!a || (t && t !== 'partner')) return fail(out, 'bad_param'); if (projs(st).length >= MAX_OPEN) return fail(out, 'יותר מדי פרויקטים פתוחים');
    const s = a.op.site; const op = makeProject(st, { ...s, freeLand: true }, fateFrom(st, a.op.fate, s), {}); if (t === 'partner') op.stake = round2(1 - STAKE.share); a.op = op; a.k = s.tech; revalue(st, a); ctx.lesson(st, out, 'dcf_value');
    out.toast = t === 'partner' ? `${a.n}: מתחילים בהיתרים עם שותף — הוא שם ${Math.round(STAKE.share * 100)}% מההון ומקבל ${Math.round(STAKE.share * 100)}% מהתחנה.` : `${a.n}: מתחילים בהיתרים. הקרקע של הקיבוץ נספרת כחלק מההון העצמי.`; return true; },
  sellPlant(st, p, out, ctx) { const a = findA(st, p, ['plant', 'line', 'proj']); if (!a) return fail(out, 'bad_param'); const net = r1000(a.value * (a.op.ck === 'proj' ? BANK.rival : SELL_PLANT)) - a.debt;
    st.cash += net; st.stats.sold++; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell');
    out.toast = `מכרת את ${a.n}: ${ctx.fmtM(net)} אחרי החוב.`; return true; },
};

/** Is now a good moment to refinance this plant (the guide's rule: room > 30 % of the debt, the rate at or below its average, and the cash
 *  is needed — an open equity call or a free slot waiting for a project)? */
function refiGood(st, a, ctx) {
  const o = a.op; const P = EN(st); const room = refiRoom(st, o); if (room < 1000000) return false;
  if (opIncome(st, ctx) >= ((ctx.world(st).goal || {}).target || 0) * 0.85) return false; // near the goal, every refinancing costs income
  const head = room / Math.max(1, o.debt); let calls = 0; for (const x of projs(st)) calls += equityGap(x.op.sb) * (x.op.stake ?? 1);
  return head > REFI_HEAD && P.rate <= P.rateAvg + 0.5 && (calls > st.cash * 0.5 || projs(st).length < 2);
}
/** The guide's suggestions (public numbers only). */
function actionList(st, ctx) {
  const out = []; const P = EN(st); const E0 = ctx.expenses(st); let calls = 0; for (const x of projs(st)) calls += equityGap(x.op.sb) * (x.op.stake ?? 1);
  for (const a of projs(st)) {
    const o = a.op; const b = o.sb; const want = o.tech === 'solar' ? 'ppa' : 'merchant';
    for (const v of ['ppa', 'merchant']) out.push({ id: 'offtake', param: `${a.id}:${v}`, assetId: 'a' + a.id, label: `${a.n}: ${v === 'ppa' ? 'חוזה PPA קבוע' : 'מכירה בשוק החופשי'} בסיום`, enabled: o.offtake !== v, current: o.offtake === v, suggested: o.offtake !== v && v === want });
    out.push({ id: 'pause', param: String(a.id), assetId: 'a' + a.id, label: b.paused ? `${a.n}: להמשיך לבנות` : `${a.n}: להשהות את הבנייה (הריבית ממשיכה)`, enabled: true, suggested: !!b.paused && st.cash > monthCost(b) * 2 + E0 * 2 });
    if ((o.stake ?? 1) >= 1) out.push({ id: 'sellStake', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור 49% לשותף (${ctx.fmtM(r1000(Math.max(0, a.value - a.debt) * STAKE.share * STAKE.cut))})`, enabled: a.value > a.debt, suggested: b.phase === 'build' && equityGap(b) > 0 && st.cash < monthCost(b) && a.value > a.debt });
    out.push({ id: 'sellPlant', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור את הפרויקט ליזם אחר (${ctx.fmtM(r1000(a.value * BANK.rival) - a.debt)})`, enabled: true, suggested: false });
  }
  for (const a of plants(st)) {
    const o = a.op; const room = refiRoom(st, o); const share = o.stake ?? 1;
    out.push({ id: 'refi', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: מימון מחדש (${ctx.fmtM(Math.round(room * (1 - TERM.fee) * share))} במזומן)`, enabled: room >= 1000000, room, suggested: refiGood(st, a, ctx) });
    out.push({ id: 'refi', param: `${a.id}:long`, assetId: 'a' + a.id, label: `${a.n}: מימון מחדש בפריסה ארוכה (החזר נמוך, יותר ריבית)`, enabled: room >= 1000000, room, suggested: false });
    if (o.offtake === 'merchant' && o.tech !== 'line') { const asPpa = runRate(st, { ...o, offtake: 'ppa', ppa: Math.round(ppaNow(st, o.tech) * PPA.switchCut) });
      out.push({ id: 'offtake', param: `${a.id}:ppa`, assetId: 'a' + a.id, label: `${a.n}: לעבור לחוזה PPA (${Math.round((1 - PPA.switchCut) * 100)}% הנחה)`, enabled: true, ppaRunRate: asPpa, suggested: asPpa > runRate(st, o) * 1.05 + 10000 }); }
    if (share >= 1) out.push({ id: 'sellStake', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור 49% (${ctx.fmtM(r1000(Math.max(0, a.value - a.debt) * STAKE.share * STAKE.cut))})`, enabled: a.value > a.debt, suggested: false });
    out.push({ id: 'sellPlant', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור (${ctx.fmtM(r1000(a.value * SELL_PLANT) - a.debt)} אחרי החוב)`, enabled: true, suggested: false });
  }
  const waiting = projs(st).filter((a) => !a.op.slot).length; const free = freeSlots(st).length; const qFee = r1000(SLOT.queueFee * (isEng(st) ? SLOT.engCut : 1));
  out.push({ id: 'applySlot', param: null, label: `בקשת חיבור לרשת (${ctx.fmtM(qFee)} · בעוד ${SLOT.wait} חודשים)`, enabled: P.queue.length < SLOT.queueMax && st.cash >= qFee, suggested: P.queue.length < SLOT.queueMax && waiting + 1 > free + P.queue.length && st.cash >= qFee + E0 * 3 });
  for (const a of freeSlots(st)) out.push({ id: 'sellSlot', param: String(a.id), assetId: 'a' + a.id, label: `למכור את החיבור לרשת (${ctx.fmtM(r1000(a.op.fee * SLOT.resale))})`, enabled: true, suggested: false });
  let devSug = false; // the guide starts one of its own parcels at a time: alone with cash for 60 % of the calls, else with a 49 % partner
  for (const a of opsOf(st, 'site')) { const s = a.op.site; const need = Math.max(0, Math.round(DEV.eqReq * capexOf(st, s) - r1000(capexOf(st, s) * CHAR.kibInKind))); const half = Math.round(need * (1 - STAKE.share));
    const room = projs(st).length < 2 && !devSug; const solo = room && st.cash >= (need + calls) * 0.6; const duo = room && !solo && st.cash >= (half + calls) * 0.6; if (solo || duo) devSug = true;
    out.push({ id: 'develop', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: להתחיל פרויקט (${TECH[s.tech].label} · הון עצמי בערך ${ctx.fmtM(need)})`, enabled: projs(st).length < MAX_OPEN, need, suggested: solo });
    out.push({ id: 'develop', param: `${a.id}:partner`, assetId: 'a' + a.id, label: `${a.n}: להתחיל עם שותף (${Math.round(STAKE.share * 100)}% · הון עצמי בערך ${ctx.fmtM(half)})`, enabled: projs(st).length < MAX_OPEN, need: half, suggested: duo }); }
  return out;
}
function indicatorsOf(st, ctx) {
  const P = EN(st); const target = (ctx.world(st).goal || {}).target || 0; const inc = opIncome(st, ctx);
  const rows = projs(st).map((a) => { const o = a.op; const b = o.sb;
    return { assetId: 'a' + a.id, name: a.n, tech: o.tech, mw: o.mw, phase: b.phase, stage: b.stage, stages: b.stages, prog: b.prog, stageMonths: b.stageMonths, pct: round2(pctDone(b)), permit: b.phase === 'permit' ? o.permitShown : null,
      slot: !!o.slot, paused: !!b.paused, delayed: b.delayLeft > 0, capex: o.capex, equityGap: Math.round(equityGap(b) * (o.stake ?? 1)), loan: b.loan, interest: b.interest, costToComplete: costToComplete(b), offtake: o.offtake, q: o.qShown, stake: o.stake ?? 1,
      value: a.value, debt: a.debt, stallRun: o.stallRun || 0, callIn: BANK.runs }; });
  const plantRows = plants(st).map((a) => { const o = a.op; const L = o.last || {}; const dcf = dcfOf(st, o); const room = refiRoom(st, o); const share = o.stake ?? 1;
    return { assetId: 'a' + a.id, name: a.n, tech: o.tech, mw: o.mw || 0, offtake: o.tech === 'line' ? 'line' : o.offtake, ppa: o.ppa || 0, mwh: L.mwh || 0, price: L.price || 0, rev: Math.round((L.rev || 0) * share), opex: Math.round((L.opex || 0) * share), debtService: Math.round((L.pay || 0) * share), cf: o.cf || 0,
      dscr: L.pay ? round2(((L.rev || 0) - (L.opex || 0)) / L.pay) : null, value: a.value, dcf: Math.round(dcf * share), debt: a.debt, ltv: dcf ? round2(o.debt / dcf) : null, ltvMax: ltvOf(st, o), refiRoom: Math.round(room * share), headroom: o.debt ? round2(room / o.debt) : null,
      tenor: o.tenor, life: o.life, stake: share, down: !!L.off, runRate: runRate(st, o), suggestedRefi: refiGood(st, a, ctx) }; });
  let calls = 0; for (const r of rows) calls += r.equityGap;
  const calc = rows.filter((r) => r.equityGap > 0).map((r) => ({ assetId: r.assetId, name: r.name, amount: r.equityGap, from: r.phase === 'permit' && r.permit ? st.month + r.permit.lo : st.month }));
  return {
    energy: { income: inc, target, rate: P.rate, rateAvg: P.rateAvg, buildRate: buildRate(st), spot: P.spot, px: P.px, avg: P.avg, mean: meanOf(st), spike: !!P.spike, capture: captureOf(st), spread: spreadOf(st), ppaNow: ppaNow(st, 'solar'), ppaCut: P.ppaCut, capexMult: P.capexMult, carbon: P.carbon,
      slots: { free: freeSlots(st).length, waiting: rows.filter((r) => !r.slot).length, queue: P.queue.map((q) => ({ at: q.at, fee: q.fee })) }, equityCalls: calls, built: P.built, refis: P.refis, refiCash: P.refiCash, stalls: P.stalls, stallMonths: P.stallMonths, forcedSales: P.forced, squeeze: P.squeeze || 0, squeezeLimit: SQUEEZE.paydays, squeezeWindow: SQUEEZE.window, lpPaid: P.lpPaid, lpNext: isFund(st) ? P.lpNext : null,
      sites: opsOf(st, 'site').map((a) => ({ assetId: 'a' + a.id, name: a.n, tech: a.op.site.tech, mw: a.op.site.mw })), h2: opsOf(st, 'h2').map((a) => ({ assetId: 'a' + a.id, name: a.n, burn: a.op.burn, revealAt: a.op.revealAt, done: !!a.op.done, hit: !!a.op.hit })),
      shocks: P.shocks.map((s) => ({ t: s.t, v: s.v, until: s.until })) },
    panel: {
      id: 'energy', title: 'התחנות והפרויקטים',
      gauges: [{ id: 'income', label: 'הכנסה תפעולית אחרי החזר חוב מול היעד', value: inc, ref: target, unit: '₪' }, { id: 'rate', label: 'ריבית במשק (%)', value: P.rate, ref: round2(P.rateAvg) }, { id: 'spot', label: 'מחיר החשמל (₪ למגה־ואט שעה)', value: P.px, ref: P.avg },
        { id: 'capture', label: 'כמה מהמחיר מקבל סולארי בשוק', value: captureOf(st), min: CANN.min, max: 1, ref: 0.85 }],
      gantt: rows.map((r) => ({ assetId: r.assetId, name: r.name, tech: r.tech, phase: r.phase, pct: r.pct, stage: r.stage, stages: r.stages, permit: r.permit, slot: r.slot, paused: r.paused, delayed: r.delayed })),
      calls: calc, rows, plants: plantRows,
      actions: actionList(st, ctx),
    },
  };
}
export default energy;
