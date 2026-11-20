// מירוץ העכברים 2.0 — pure game engine.
// No DOM, no THREE, no Math.random, no Date. Same seed + same decisions ⇒ same game, in the browser and in Node.
// Every random draw comes from a named seeded stream in state.rng and is consumed by *where the pawn lands*, never by
// *what the player decides* — so in a seeded challenge everyone sees the same dice and the same cards.
// See ENGINE.md for the full API contract.

import { next, int, shuffle, weighted, makeStreams, STREAMS } from './rng.js';
import * as BK from './finance/bank.js';
import * as IV from './finance/invest.js';
import { WORLDS, getWorld } from './worlds/index.js';
import { checkAchievements, achievementById } from './achievements.js';
import * as BIZ from './finance/business.js';
import { TAX, slip, grossFromNet, marginalRate, PLANS, PLAN_IDS, LIFE_CFG, LIFE_EVENTS, LESSONS as LIFE_LESSONS, creditBand } from './life.js';
import { registerRealData, loadRealData, scenarioList as histScenarios, scenarioById, seriesAt, addYm, ymText, normYm, hasRealData, inflate } from './history.js';

/** The lessons library: life lessons + the business module's lessons (ids biz_…). */
export const LESSONS = LIFE_LESSONS.concat(BIZ.BIZ_LESSONS);
const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
export function lessonsList() { return LESSONS.map((l) => ({ ...l })); }
export { inflate, registerRealData, loadRealData };

export const SAVE_VERSION = 3;
export { WORLDS, getWorld, PLANS, slip as payslipFor };
/** Scenarios for מכונת הזמן ([] until js/data/real.js is available). */
export function scenarioList() { return histScenarios(); }
/** ⚡ cost of one roll: ranked modes are free (the lobby lead's js/energy.js owns the real-time limit). */
export function rollCost(st) { return ['daily', 'weekly', 'challenge'].includes(st && st.mode) ? 0 : 1; }

/* ============================================================ formatting (exported for the UI) */
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** ₪1,234 / −₪1,234 (v1 style, U+2212 minus). */
export function fmt(n) { const r = Math.round(n); return (r < 0 ? '−' : '') + '₪' + groups(Math.abs(r)); }
/** Like fmt but ≥ ₪1M becomes "₪1.25 מיליון". */
export function fmtM(n) {
  const a = Math.abs(n);
  if (a < 1e6) return fmt(n);
  const v = a / 1e6;
  const s = (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return (n < 0 ? '−' : '') + '₪' + s + ' מיליון';
}
/** +₪700 / −₪900 */
export function sgn(n) { return (Math.round(n) > 0 ? '+' : '') + fmtM(n); }
/** Share prices: ₪0.05 / ₪15 / ₪1,234.5 */
export function fmtP(n) { return '₪' + (n < 1 ? n.toFixed(2) : groups(+n.toFixed(2))); }
const P10 = [1, 10, 100, 1000];
const pct = (x, d = 0) => (Math.round(x * P10[d]) / P10[d]) + '%';
const r10 = (x) => Math.round(x / 10) * 10;
const r100 = (x) => Math.round(x / 100) * 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** Fill {placeholders}. Numbers must be pre-formatted by the caller. */
export function tpl(s, vars = {}) { return String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)); }
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ============================================================ create / save */
/**
 * Create a new game.
 * @param {object} o {worldId, charId, seed, mode:'free'|'daily'|'weekly'|'challenge', maxMonths?, tutorial?}
 */
export function createGame(o = {}) {
  const history = o.mode === 'history' || o.worldId === 'h';
  const w = getWorld(history ? 'h' : (o.worldId || 'w1'));
  const ch = w.characters.find((c) => c.id === o.charId) || w.characters[0];
  const seed = ((o.seed ?? 1) >>> 0) || 1;
  let scen = null;
  if (history) { if (!hasRealData()) throw new Error('history data not loaded'); scen = scenarioById(o.scenarioId); }
  const st = {
    v: SAVE_VERSION, worldId: w.id, charId: ch.id, charName: ch.name, seed, mode: history ? 'history' : (o.mode || 'free'),
    maxMonths: history ? scen.months : (o.maxMonths ?? ch.maxMonths ?? w.maxMonths),
    tutorial: !!o.tutorial && (o.mode || 'free') === 'free', bailout: !!o.bailout,
    rng: makeStreams(seed),
    phase: 'roll', pos: 0, month: 1, turn: 0, nextId: 1, nextEventId: 1,
    cash: ch.cash, salary: ch.salary || 0, salaryUsd: ch.salaryUsd || 0,
    expenses: ch.expenses.map(([label, amount, trim], i) => ({ id: 'e' + i, label, amount, trim: !!trim, cut: false })),
    subs: [], pledges: [], loans: 0, credit: 0, savings: 0, bizRng: {},
    assets: [], holdings: {}, prices: {}, angels: [],
    world: clone(w.start || {}),
    decks: {}, pending: null, lastRoll: null, lastPayday: null,
    stats: {
      deals: 0, bad: 0, doodad: 0, autoLoan: 0, autoLoans: 0, sold: 0, soldProfit: 0, golden: 0, crises: 0,
      crisisNoLoan: 0, tradeProfit: 0, upgrades: 0, trims: 0, hedges: 0, hedgeSaved: 0, angels: 0, exits: 0,
      bigExits: 0, given: 0, quizRight: 0, quizWrong: 0, maxLoans: 0, negMonths: 0, paydays: 0, loansTaken: 0,
      interestPaid: 0, forcedLoans: 0, toysSpent: 0, toysResisted: 0, resisted: 0, badAssets: 0, badAssetLoss: 0, needsSpent: 0, subsPaid: 0, crisisPaid: 0,
    },
    ach: [], flags: {}, log: [], actions: [], over: null, result: null,
  };
  for (const [tk, t] of Object.entries(w.tickers || {})) {
    st.holdings[tk] = { qty: 0, basis: 0, lowBuy: null };
    st.prices[tk] = t.start;
  }
  if (w.mechanic === 'rate') { st.world.rateHist = [st.world.rate]; }
  if (w.mechanic === 'fx') { st.world.usdHist = [st.world.usd]; }
  if (w.mechanic === 'angel') { st.world.impact = st.world.impact || 0; }
  if (ch.impact) st.world.impact = ch.impact;
  updateDerivedPrices(st);
  for (const a of ch.assets || []) addAsset(st, a, { start: true, fixed: a.fixedRate != null });
  for (const [tk, q] of Object.entries(ch.holdings || {})) {
    st.holdings[tk].qty = q; st.holdings[tk].basis = Math.round(q * st.prices[tk]);
  }
  if (w.crypto) launchCoin(st, next(st.rng, 'deal'), true);
  initLife(st, ch);
  if (history) initHistory(st, scen);
  return st;
}

/* ============================================================ v3 life state */
function kidsOf(ch) { return (ch.family && ch.family.kids) || 0; }
function initLife(st, ch) {
  const w = W(st); const C = LIFE_CFG;
  const fam = { partner: (ch.family && ch.family.partner) || 'none', wedding: null, kids: kidsOf(ch) };
  const points = TAX.points + fam.kids * TAX.kidPoints;
  const L = st.life = {
    age: ch.age || 30, startAge: ch.age || 30, energy: C.startEnergy, happiness: C.startHappiness, glow: [],
    plan: 'work', planMonths: { work: 0, overtime: 0, study: 0, side: 0, rest: 0 },
    study: { months: 0, need: C.studyNeed, done: false }, side: { months: 0, level: 0, total: 0 },
    family: fam, kidsBorn: [], workLoad: 0,
    creditScore: C.creditStart, forcedFlag: false,
    gross: 0, grossUsd: 0, gross0: 0,
    pension: 0, severance: 0, pensionIn: 0,
    cpi: 1, cpiAdj: 1, inflationYear: 0, infl: [],
    burnouts: 0, raises: 0, raiseAsks: 0, lastRaise: 0, raiseR: 1, jobless: null,
    events: [], autoInvest: 0, friend: null, taxRefund: 0, sideTaxDue: 0, lossCarry: 0,
    hapSum: 0, hapN: 0, peek: false, idxPeak: 0, lastCrash: -99, idxSold: 0, idxSoldLoss: 0, idxBuys: 0, idxSince: null, negWins: 0, negLosses: 0, negSaved: 0,
  };
  if (st.salaryUsd) { L.grossUsd = Math.round(grossFromNet(st.salaryUsd * st.world.usd, points) / st.world.usd / 10) * 10; L.gross = 0; }
  else L.gross = grossFromNet(st.salary, points);
  L.gross0 = grossBase(st);
  st.salary = baseNet(st); // legacy field: base take-home pay
  st.lessons = [];
  st.taxes = { income: 0, bl: 0, capGains: 0, rental: 0, betterment: 0, side: 0, savings: 0, business: 0 };
  if (st.savings == null) st.savings = 0;
  if (!st.bizRng) st.bizRng = {};
  L.goalStreak = 0;
  const p = st.prices.IDX; if (p != null) { L.idxPeak = p; L.idxHist = [p]; }
  newInflationYear(st);
}
/** Yearly inflation for the coming 12 months — pre-drawn from the life stream (2 draws, always). */
function newInflationYear(st) {
  const C = LIFE_CFG; const L = st.life;
  const rs = next(st.rng, 'life'), rl = next(st.rng, 'life');
  if (st.history) return;
  L.inflationYear = rs < C.inflSpikeChance ? round2(C.inflSpike[0] + rl * (C.inflSpike[1] - C.inflSpike[0])) : round2(C.inflMin + rl * (C.inflMax - C.inflMin));
}
function initHistory(st, scen) {
  const w = W(st);
  const ix = scen.index || 'sp500';
  st.history = { scenarioId: scen.id, name: scen.name, index: ix, startYm: scen.start, ym: scen.start, months: scen.months,
    base: { index: seriesAt(ix, scen.start) || 1, cpi: seriesAt('cpiIL', scen.start) || 1, home: seriesAt('homeIL', scen.start) || 1, usd: seriesAt('usdIls', scen.start) || 3.6 },
    bench: { units: 0, saved: 0 }, headline: null, idxHist: [100] };
  st.world.rate = round2(seriesAt('boiRate', scen.start) ?? w.start.rate);
  st.world.rateHist = [st.world.rate];
  st.prices.IDX = 100; st.life.idxPeak = 100;
  st.history.bench.units = st.cash / 100; // the benchmark investor puts all the starting cash into the index fund
  st.history.startCash = st.cash; st.history.startNW = st.cash;
  st.history.bench.save = Math.max(0, baseNet(st) - st.expenses.reduce((a, x) => a + x.amount, 0));
  const first = (scen.headlines || []).find((h) => h.ym === scen.start);
  if (first) st.history.headline = first;
}

/* ============================================================ crypto (w1): every coin has a hidden fate sealed at launch */
function launchCoin(st, r, first = false) {
  const C = W(st).crypto; const tk = C.tk; const h = st.holdings[tk];
  const prev = st.world.coin;
  const wiped = !first && h.qty > 0 ? { qty: h.qty, value: Math.round(h.qty * st.prices[tk]), oldName: prev.name } : null;
  h.qty = 0; h.basis = 0; h.lowBuy = null;
  const tot = C.fates.reduce((a, f) => a + f.w, 0); let acc = 0; let fate = C.fates[C.fates.length - 1];
  for (const f of C.fates) { acc += f.w / tot; if (r < acc) { fate = f; break; } }
  const gen = first ? 0 : prev.gen + 1;
  st.world.coin = { gen, name: C.names[gen % C.names.length], path: fate.path.slice(), step: 0, alive: true };
  st.prices[tk] = C.launchPrice;
  return wiped;
}
function coinName(st, tk) { const C = W(st).crypto; return C && C.tk === tk && st.world.coin ? st.world.coin.name : null; }
/** A crypto card. launch: new coin if the old one is dead (else just the current price); news: next step of the coin's fate. */
function cryptoPending(st, card, stream, source) {
  const w = W(st); const C = w.crypto; const tk = C.tk;
  const r = card.crypto === 'launch' ? next(st.rng, stream) : null; // always consumed for a launch card
  const coin = st.world.coin;
  const T = (x, extra = {}) => ({ type: 'trade', tk, title: tpl(x.n, { coin: st.world.coin.name, p: fmtP(st.prices[tk]), ...extra }), text: tpl(x.d, { coin: st.world.coin.name, ...extra }), source, golden: false });
  if (card.crypto === 'launch') {
    if (!coin.alive) { const wiped = launchCoin(st, r); const p = T(C.texts.launch); p.wiped = wiped; return p; }
    return T(C.texts.still);
  }
  if (!coin.alive) return { type: 'market', card: { k: 'quiet', n: tpl(C.texts.dead.n, { coin: coin.name }), d: tpl(C.texts.dead.d, { coin: coin.name }) }, source };
  const price = coin.path[coin.step]; coin.step++;
  st.prices[tk] = price;
  if (coin.step >= coin.path.length) { coin.alive = false; return T(C.texts.crash); }
  return T(C.texts.up[Math.min(coin.step - 1, C.texts.up.length - 1)]);
}

function logDecision(st, card, option, v = 0) {
  const e = { t: st.turn, c: String(card).slice(0, 24), o: String(option).slice(0, 24) };
  if (v) e.v = Math.round(v);
  st.log.push(e);
  if (st.log.length > 80) st.log.shift();
}
/** ₪ size of a decision (for "your biggest decisions"): cash moved + 24 months of the monthly change. */
function decisionValue(st, p, o, out, cash0) {
  let v = st.cash - cash0;
  if (o.kind === 'buy' && o.net != null) v += o.net * 24;
  if (o.effects && o.effects.monthly) v -= o.effects.monthly * (o.effects.months || 24);
  if (o.effects && o.effects.salary) v += o.effects.salary * (o.effects.months || 24);
  if (out.negotiation && out.negotiation.saved) v += out.negotiation.saved;
  if (out.raise && out.raise.accepted) v += Math.round(baseNet(st) * 0.06 * 24);
  return v;
}
/** v3 replay log: every state-changing call, in order (see replay()). */
function act(st, a) { (st.actions ||= []).push(a); }

/** JSON save. The state is already plain data; this is just a stable helper. */
export function serialize(st) { return JSON.stringify(st); }
/** Resume from JSON (string or object). v1/v2 saves (st.v = 1) are migrated to v3; anything else throws 'save_incompatible'. */
export function deserialize(json) {
  const st = typeof json === 'string' ? JSON.parse(json) : clone(json);
  if (!st || typeof st !== 'object') throw new Error('save_incompatible');
  if (st.v === 1) migrateV2(st);
  if (st.v !== SAVE_VERSION) throw new Error('save_incompatible');
  getWorld(st.worldId);
  return st;
}
/** v2 → v3: 24-tile board → 40 tiles, new RNG streams, life/tax/index defaults. Money, assets and decks are kept. */
function migrateV2(st) {
  try {
    const w = getWorld(st.worldId);
    const ch = w.characters.find((c) => c.id === st.charId) || w.characters[0];
    if (st.phase === 'roll' || !st.pending) {
      let pos = Math.round((st.pos || 0) * w.board.length / 24) % w.board.length;
      if (w.tiles[w.board[pos]].type === 'payday') pos = (pos + 1) % w.board.length;
      st.pos = pos;
      if (st.phase === 'land' && !st.pending) st.phase = 'roll';
    } else st.pos = Math.min(w.board.length - 1, Math.round((st.pos || 0) * w.board.length / 24));
    const fresh = makeStreams(st.seed);
    for (const k of STREAMS) if (st.rng[k] == null) st.rng[k] = fresh[k];
    for (const [tk, t] of Object.entries(w.tickers || {})) if (!st.holdings[tk]) { st.holdings[tk] = { qty: 0, basis: 0, lowBuy: null }; st.prices[tk] = t.start; }
    const net0 = st.salaryUsd ? st.salaryUsd * (st.world.usd || 3.6) : st.salary;
    initLife(st, ch);
    if (st.salaryUsd) st.life.grossUsd = Math.round(grossFromNet(net0, TAX.points + st.life.family.kids * TAX.kidPoints) / st.world.usd / 10) * 10;
    st.salary = baseNet(st);
    st.life.age = (ch.age || 30) + (st.month - 1) / 12;
    st.v = SAVE_VERSION;
  } catch (e) { throw new Error('save_incompatible'); }
}

/* ============================================================ economy core */
const W = (st) => getWorld(st.worldId);
const loanUnit = (st) => W(st).loan.unit;
const autoUnit = (st) => W(st).loan.autoUnit || W(st).loan.unit;
/** Monthly cost of bank loans in % of the balance. w2: base + rateMult × current interest rate. */
export function loanPct(st) { const L = W(st).loan; return round2(Math.max(0.1, L.pct + (L.rateLinked ? st.world.rate * (L.rateMult ?? 1) : 0) + bandAdj(st))); }
/** Credit-score rate add-on in monthly percentage points = bank.js creditSpread (annual) ÷ 12; refusal band ⇒ +0.125 (forced loans only). */
function bandAdj(st) { const sp = BK.creditSpread(st.life ? st.life.creditScore : LIFE_CFG.creditStart); return sp === null ? 0.125 : sp * 100 / 12; }
/** The bank lends (voluntarily) up to cap × monthly income (salary + passive) — "הבנק בודק שתוכל להחזיר". v3: × credit-score band. */
export function loanCap(st) { const L = W(st).loan; return L.cap ? Math.max(0, Math.floor(L.cap * bandOf(st).capMult * Math.max(salaryNow(st) + Math.max(0, passiveOf(st)), 0) / 1000) * 1000) : Infinity; }
const bandOf = (st) => { const sc = st.life ? st.life.creditScore : LIFE_CFG.creditStart; const b = creditBand(sc); return BK.creditSpread(sc) === null ? { ...b, capMult: 0 } : b; };
const CAP_REASON_BASE = 'הבנק בודק שתוכל להחזיר — ההכנסה שלך לא מספיקה להלוואה כזו';
let CAP_REASON = CAP_REASON_BASE;
const capReason = (st) => (bandOf(st).capMult < 1 ? `דירוג האשראי שלך ${bandOf(st).label} (${st.life.creditScore}) — הבנק מגביל הלוואות חדשות` : CAP_REASON_BASE);
/** Payment preview for any "you must pay X now" card. */
function shortfallInfo(st, pay) {
  pay = Math.max(0, Math.round(pay));
  const shortfall = Math.max(0, pay - st.cash);
  const loanAmount = shortfall ? Math.ceil(shortfall / autoUnit(st)) * autoUnit(st) : 0;
  return { pay, shortfall, loanAmount, loanMonthly: Math.round(loanAmount * loanPct(st) / 100) };
}
/** Monthly interest on an interest-only credit line (the game's bank loan / card debt) — bank.js checkingMonth (מסגרת). */
const lineInterest = (balance, monthlyPct) => (balance > 0 ? BK.checkingMonth({ balance: -balance, limit: balance, annualRate: monthlyPct * 12 / 100, fee: 0 }).interest : 0);
const loanPay = (st) => lineInterest(st.loans, loanPct(st));
const creditPay = (st) => lineInterest(st.credit, W(st).creditPct);

/* ---------------------------------------------------------------- v3 payslip: salary is GROSS, cashflow uses NET */
const taxPoints = (st) => TAX.points + st.life.family.kids * TAX.kidPoints + (st.life.study.done ? TAX.degreePoints : 0);
/** Base gross (no plan effects). */
function grossBase(st) { return st.salaryUsd ? r10(st.life.grossUsd * st.world.usd) : st.life.gross; }
/** Take-home pay of the base gross (the "normal month"). */
function baseNet(st) { return slip(grossBase(st), taxPoints(st)).net; }
/** Expected side-hustle income this month (actual is pre-drawn at the payday: ×0.6..1.4). */
function sideExpected(st) { const L = st.life; return L.plan === 'side' ? r10(LIFE_CFG.sideBase * Math.max(1, sideLevel(L)) * Math.max(baseNet(st), 3000)) : 0; }
const sideLevel = (L) => Math.min(3, 1 + Math.floor(L.side.months / LIFE_CFG.sideLevelEvery));
const studyCost = (st) => (st.life.plan === 'study' && !st.life.study.done ? r10(LIFE_CFG.studyCost * Math.max(baseNet(st), 3000)) : 0);
/** Full payslip for a plan (default: the current plan). */
function payslipOf(st, planId) {
  const L = st.life; const P = PLANS[planId || L.plan] || PLANS.work;
  const g0 = grossBase(st);
  if (L.jobless && L.jobless.until >= st.month) {
    const ben = r10(baseNet(st) * 0.6);
    return { gross: 0, overtime: 0, incomeTax: 0, bl: 0, pensionEmployee: 0, net: ben, employerPension: 0, severanceDeposit: 0, pensionDeposit: 0, effectiveTaxRate: 0, marginalRate: 0, jobless: true,
      sideIncome: 0, studyCost: 0, lines: [{ label: 'דמי אבטלה (60% מהנטו)', amount: ben }] };
  }
  const gross = r10(g0 * P.grossMult);
  const s = slip(gross, taxPoints(st));
  const side = planId && planId !== L.plan ? (planId === 'side' ? r10(LIFE_CFG.sideBase * Math.max(1, sideLevel(L)) * Math.max(baseNet(st), 3000)) : 0) : sideExpected(st);
  const tuition = (planId || L.plan) === 'study' && !L.study.done ? r10(LIFE_CFG.studyCost * Math.max(baseNet(st), 3000)) : 0;
  const lines = [{ label: 'ברוטו', amount: g0 }];
  if (gross !== g0) lines.push({ label: gross > g0 ? 'שעות נוספות' : 'פחות שעות (מנוחה)', amount: gross - g0 });
  lines.push({ label: 'מס הכנסה', amount: -s.incomeTax }, { label: 'ביטוח לאומי ומס בריאות', amount: -s.bl }, { label: 'פנסיה (6%)', amount: -s.pensionEmployee }, { label: 'נטו', amount: s.net });
  return { ...s, base: g0, overtime: gross - g0, pensionDeposit: s.pensionEmployee + s.employerPension + s.severanceDeposit, sideIncome: side, studyCost: tuition, lines };
}
/** Take-home pay this month (plan-adjusted, net). */
function salaryNow(st) { return payslipOf(st).net; }

/** Effective USD rate for an asset (hedged assets use their locked rate). */
function usdFor(st, a) {
  if (a.hedge && a.hedge.until >= st.month) return a.hedge.rate;
  return st.world.usd;
}

/** Current monthly net cashflow of one asset (after its mortgage). */
export function assetCf(st, a) { return a.biz ? (a.bizDraw || 0) : assetCfRaw(st, a); }
/** Owner-run managed businesses: last month's draw (net) — active income, not passive. */
function activeBizOf(st) { let x = 0; for (const a of st.assets) if (a.biz && !a.biz.manager) x += a.bizDraw || 0; return x; }
const managedOf = (st) => st.assets.filter((a) => a.biz && !a.biz.closed);
const isRent = (st, a) => !!(a.k && (W(st).kinds[a.k] || {}).rent);
/** Deal-card yield chip: gross vs net yield (invest.js realEstateYield — "תשואה נטו ולא רק שכירות"). */
function reYield(st, c, proto) {
  const y = IV.realEstateYield({ price: c.cost, monthlyRent: grossRent(st, proto), rentalExemptUpTo: TAX.rentExempt });
  return { grossYield: y.grossYield, netYield: y.netYield, capRate: y.capRate, lines: y.lines.filter((l) => l.amount), note: 'הערכה: שכירות, חודש בלי שוכר, תחזוקה, ביטוח ומס' };
}
/**
 * Rental-income tax for the whole portfolio (simplified Israeli rule): residential rent up to TAX.rentExempt a month
 * is tax-free; above it, the 10% track on the excess. Charged at every payday, shown as an income line.
 */
function rentTaxOf(st, extra = 0) {
  let rent = extra;
  for (const a of st.assets) if (isRent(st, a)) rent += grossRent(st, a);
  if (rent <= 0) return 0;
  // invest.js: residential rent ≤ ₪5,654/month is exempt; above it the 10% track on the GROSS (collected) rent
  const y = IV.realEstateYield({ price: 1, monthlyRent: rent, vacancyMonths: 0, maintenancePct: 0, insuranceYear: 0, closingPct: 0, rentalExemptUpTo: TAX.rentExempt });
  return Math.round(y.tax / 12);
}
/** Gross monthly rent of a rental asset: stored on the card (`rent`), else cashflow + mortgage interest (cf assets) or NOI / 0.8 (NOI assets). */
function grossRent(st, a) {
  if (a.rent != null) return a.rent;
  if (a.noi != null) return Math.max(0, Math.round(a.noi / 0.8));
  return Math.max(0, Math.round((a.cf || 0) + (a.debt || 0) * BK.BANK.mortgage.fixedRate / 12));
}
function assetCfRaw(st, a) {
  let cf;
  if (a.noi != null) {
    const r = a.fixedRate ?? st.world.rate;
    cf = a.noi - (a.debt * r) / 1200;
  } else cf = a.cf;
  if (a.sens) cf = cf * (1 + a.sens * (usdFor(st, a) / a.ref - 1));
  if (a.idle && a.idle >= st.month) cf = Math.min(cf, 0); // temporarily closed (crisis)
  return r10(cf);
}

/** Market value of an asset in ₪ (before debt). */
export function assetValue(st, a) {
  let v = a.value;
  if (a.usdLinked) v = (v * usdFor(st, a)) / a.ref;
  else if (a.sens) v = v * (1 + a.sens * W(st).fx.valueSens * (usdFor(st, a) / a.ref - 1)); // FX hits profits → hits value
  return Math.round(v);
}

function tickerDiv(st, tk) {
  const t = W(st).tickers[tk];
  if (t.kind === 'index') return st.prices[tk] * (W(st).historyDiv ?? LIFE_CFG.idx.div) * (1 - IV.INVEST.dividendTax);
  return t.div || 0;
}

function passiveOf(st) {
  let p = -rentTaxOf(st);
  for (const a of st.assets) { if (a.biz) { if (a.biz.manager) p += a.bizDraw || 0; continue; } p += assetCf(st, a); } // an owner-run business is a job, not passive income
  for (const tk of Object.keys(st.holdings)) p += st.holdings[tk].qty * tickerDiv(st, tk);
  return Math.round(p);
}
function expensesOf(st) {
  let e = studyCost(st);
  for (const x of st.expenses) if (!x.until || x.until >= st.month) e += x.amount;
  for (const x of st.subs) e += x.amount;
  for (const x of st.pledges) e += x.amount;
  return e + loanPay(st) + creditPay(st);
}
function holdingsValue(st) {
  let v = 0;
  for (const tk of Object.keys(st.holdings)) v += st.holdings[tk].qty * st.prices[tk];
  return v;
}
function angelPaper(st) { return st.angels.filter((x) => x.status === 'active').reduce((s, x) => s + x.paper, 0); }
function netWorthOf(st) {
  let nw = st.cash + (st.savings || 0) - st.loans - st.credit + holdingsValue(st) + angelPaper(st);
  for (const a of st.assets) nw += assetValue(st, a) - a.debt;
  return Math.round(nw);
}

function updateDerivedPrices(st) {
  const w = W(st);
  for (const [tk, t] of Object.entries(w.tickers || {})) {
    if (t.kind === 'bond') st.prices[tk] = Math.round(100 * (1 + (t.duration * (t.r0 - st.world.rate)) / 100) * 100) / 100;
    if (t.kind === 'usd') st.prices[tk] = Math.round(st.world.usd * 1000);
    if (t.kind === 'gold') st.prices[tk] = Math.round(st.world.goldUsd * st.world.usd);
  }
}

/* ---------------------------------------------------------------- v3 helpers: goal hold, savings, real-world rates */
export const GOAL_HOLD = 3;
/** Is the world goal met right now (before the 3-payday hold)? */
function goalMet(st) {
  const g = W(st).goal; if (g.type === 'benchmark') return false;
  if (g.type === 'passive') { const p = passiveOf(st); return p > 0 && p >= expensesOf(st); }
  const nw = netWorthOf(st);
  if (g.type === 'netWorth') return nw >= g.target;
  return nw >= g.target && Math.floor(st.world.impact || 0) >= g.impact;
}
/** Today's Bank of Israel rate (%): the world rate in w2/history, else the 2026 rate. */
const realBoi = (st) => (st.history || W(st).mechanic === 'rate' ? st.world.rate : LIFE_CFG.realBoi);
const savingsRate = (st) => Math.max(0, Math.min(BK.BANK.savingsRate, (realBoi(st) - 1.25) / 100));
/** The game's rates are deliberately inflated (so you feel them); here is what the same product costs in the real world. */
function realWorldRates(st) {
  const boi = realBoi(st) / 100; const score = st.life.creditScore;
  const offer = BK.loanOffer({ principal: 50000, months: 60, track: 'prime', boiRate: boi, creditScore: score });
  const od = BK.overdraftRate(boi, score);
  return {
    boi: round2(boi * 100),
    bankLoan: { gamePerYear: round2(loanPct(st) * 12), realPerYear: offer.ok ? round2(offer.annualRate * 100) : null, effectivePct: offer.ok ? offer.effectivePct : null, text: offer.ok ? `בעולם האמיתי ≈ ${round2(offer.annualRate * 100)}% בשנה` : offer.reason },
    credit: { gamePerYear: round2(W(st).creditPct * 12), realPerYear: od == null ? null : round2(od * 100), text: od == null ? 'בעולם האמיתי: אין מסגרת בדירוג כזה' : `בעולם האמיתי ≈ ${round2(od * 100)}% בשנה (מסגרת בעו״ש)` },
    mortgage: { realPerYear: round2(BK.BANK.mortgage.fixedRate * 100), text: `משכנתא בעולם האמיתי ≈ ${round2(BK.BANK.mortgage.fixedRate * 100)}% בשנה` },
    savings: { realPerYear: round2(savingsRate(st) * 100) },
  };
}

/* ============================================================ metrics (UI read model) */
/**
 * Everything the HUD / statement sheet needs. Pure.
 */
export function metrics(st) {
  const w = W(st);
  const ps = payslipOf(st); const L0 = st.life;
  const salary = ps.net;
  const sideIncome = ps.sideIncome;
  const passive = passiveOf(st);
  const expenses = expensesOf(st);
  const activeBiz = activeBizOf(st);
  const cashflow = salary + sideIncome + activeBiz + passive - expenses;
  const netWorth = netWorthOf(st);
  const g = w.goal;
  let goalProgress, goalText, goalParts;
  const holdCap = (x) => (x >= 1 && (L0.goalStreak || 0) < GOAL_HOLD ? 0.99 + 0.003 * (L0.goalStreak || 0) : x); // 1 only once the goal held
  if (g.type === 'benchmark') {
    const bench = benchNW(st);
    goalProgress = bench > 0 ? clamp(netWorth / bench, 0, 1) * 0.999 : 0;
    goalText = `השווי שלך ${fmtM(netWorth)} מול "קנה והחזק" ${fmtM(bench)}`;
    goalParts = [{ key: 'benchmark', label: 'שווי מול משקיע פסיבי', value: netWorth, target: bench, progress: bench > 0 ? clamp(netWorth / bench, 0, 1) : 0 }];
  } else if (g.type === 'passive') {
    // ranking-safe: strictly increasing, 1 only when passive ≥ expenses (negative passive still ranks)
    goalProgress = expenses > 0 ? (passive >= expenses ? 1 : clamp(0.05 + 0.95 * passive / expenses, 0, 0.999)) : 0;
    goalText = `הכנסה פסיבית ${fmtM(passive)} מתוך ${fmtM(expenses)}`;
    goalParts = [{ key: 'passive', label: 'הכנסה פסיבית מול הוצאות', value: passive, target: expenses, progress: expenses > 0 ? clamp(passive / expenses, 0, 1) : 0 }];
  } else {
    const nwp = netWorth >= g.target ? 1 : clamp(0.1 + 0.9 * netWorth / g.target, 0, 0.999);
    goalParts = [{ key: 'netWorth', label: 'שווי נקי', value: netWorth, target: g.target, progress: clamp(netWorth / g.target, 0, 1) }];
    goalText = `שווי נקי ${fmtM(netWorth)} מתוך ${fmtM(g.target)}`;
    goalProgress = nwp;
    if (g.type === 'netWorthImpact') {
      const imp = Math.floor(st.world.impact || 0);
      const ip = clamp(imp / g.impact, 0, 1);
      goalParts.push({ key: 'impact', label: 'נקודות השפעה', value: imp, target: g.impact, progress: ip });
      goalText += ` · השפעה ${imp}/${g.impact}`;
      goalProgress = (Math.min(nwp, ip) + (nwp + ip) / 2) / 2; // 1 only when both goals are met; still ranks partial progress
    }
  }
  goalProgress = holdCap(goalProgress);
  const incomeLines = [{ label: ps.jobless ? 'דמי אבטלה' : st.salaryUsd ? `משכורת נטו (ברוטו $${groups(Math.round(st.life.grossUsd * PLANS[st.life.plan].grossMult))})` : 'משכורת נטו', amount: salary, id: 'salary' }];
  if (sideIncome) incomeLines.push({ label: 'עסק צדדי (משוער)', amount: sideIncome, id: 'side' });
  for (const a of managedOf(st)) if (!a.biz.manager) incomeLines.push({ label: `${a.n} (אתה עובד בו — לא פסיבי)`, amount: a.bizDraw || 0, id: 'biz:a' + a.id, active: true });
  for (const a of st.assets) if (!a.biz || a.biz.manager) incomeLines.push({ label: a.biz ? `${a.n} (עם מנהל — פסיבי)` : a.n, amount: assetCf(st, a), assetId: 'a' + a.id });
  const rtax = rentTaxOf(st); if (rtax) incomeLines.push({ label: `מס על שכר דירה (10% מעל ${fmtM(TAX.rentExempt)} פטור)`, amount: -rtax, id: 'rentTax' });
  for (const tk of Object.keys(st.holdings)) {
    const h = st.holdings[tk]; const d = tickerDiv(st, tk);
    if (h.qty && d) incomeLines.push({ label: `${w.tickers[tk].divLabel || 'דיבידנד'} ${tk}`, amount: Math.round(h.qty * d) });
  }
  const expenseLines = st.expenses.filter((x) => !x.until || x.until >= st.month).map((x) => ({ label: x.label + (x.until ? ` (עד חודש ${x.until})` : ''), amount: x.amount, id: x.id }));
  if (ps.studyCost) expenseLines.push({ label: 'שכר לימוד', amount: ps.studyCost, id: 'study' });
  for (const x of st.subs) expenseLines.push({ label: x.label + ' (מנוי)', amount: x.amount, id: x.id });
  for (const x of st.pledges) expenseLines.push({ label: x.label + ' (תרומה חודשית)', amount: x.amount, id: x.id });
  if (st.loans) expenseLines.push({ label: `ריבית על הלוואה בנקאית (${pct(loanPct(st), 2)} בחודש)`, amount: loanPay(st), id: 'loan' });
  if (st.credit) expenseLines.push({ label: `חוב אשראי (${W(st).creditPct}% בחודש)`, amount: creditPay(st), id: 'credit' });

  const assets = st.assets.map((a) => {
    const v = assetValue(st, a);
    return {
      id: 'a' + a.id, assetId: a.id, kind: a.k, kindLabel: (w.kinds[a.k] || {}).label || a.k, name: a.n, model: w.models[a.k] || null,
      cost: a.cost, down: a.down, value: v, debt: a.debt, equity: v - a.debt, cf: assetCf(st, a),
      fixedRate: a.fixedRate ?? null, variable: a.noi != null && a.debt > 0 && a.fixedRate == null,
      sens: a.sens || 0, hedgedUntil: a.hedge && a.hedge.until >= st.month ? a.hedge.until : null, hedgeRate: a.hedge ? a.hedge.rate : null,
      impact: a.impact || 0, upgrades: a.ups || 0, golden: !!a.golden, grow: a.grow || 0,
      business: a.biz ? { type: a.biz.type, manager: a.biz.manager, draw: a.biz.draw, ownerEnergy: BIZ.ownerEnergy(a.biz), incomeKind: BIZ.incomeKind(a.biz), lastNet: a.bizNet || 0, headline: a.bizHeadline || '', cash: a.biz.cash } : null,
    };
  });
  const liabilities = st.assets.filter((a) => a.debt > 0).map((a) => ({ label: `${(w.kinds[a.k] || {}).debtLabel || 'משכנתא'} · ${a.n}`, amount: a.debt, assetId: 'a' + a.id }));
  { const rw = realWorldRates(st);
    for (const l of liabilities) { l.realWorldRate = rw.mortgage.realPerYear; }
    if (st.loans) liabilities.push({ label: 'הלוואה בנקאית', amount: st.loans, id: 'loan', gameRate: rw.bankLoan.gamePerYear, realWorldRate: rw.bankLoan.realPerYear, realText: rw.bankLoan.text });
    if (st.credit) liabilities.push({ label: 'חוב כרטיס אשראי', amount: st.credit, id: 'credit', gameRate: rw.credit.gamePerYear, realWorldRate: rw.credit.realPerYear, realText: rw.credit.text }); }
  const holdings = Object.keys(st.holdings).filter((tk) => st.holdings[tk].qty > 0).map((tk) => {
    const h = st.holdings[tk]; const t = w.tickers[tk];
    return { ticker: tk, name: t.name, unit: t.unit || 'מניות', qty: h.qty, price: st.prices[tk], value: Math.round(h.qty * st.prices[tk]), basis: Math.round(h.basis), avg: h.qty ? h.basis / h.qty : 0, div: t.div || 0, model: t.model || null };
  });
  const angels = st.angels.map((x) => ({ id: 'v' + x.id, name: x.n, amount: x.amount, paper: x.status === 'active' ? x.paper : 0, status: x.status, result: x.status === 'active' ? null : x.cashOut, mult: x.status === 'active' ? null : x.mult, revealAt: x.revealAt, news: x.news || null }));
  const wi = {};
  if (w.mechanic === 'rate') { wi.rate = st.world.rate; wi.rateHist = st.world.rateHist.slice(-12); wi.loanPct = loanPct(st); wi.fixedPremium = w.rate.fixedPremium; }
  if (w.mechanic === 'fx') { wi.usd = st.world.usd; wi.usdHist = st.world.usdHist.slice(-12); wi.usdRef = w.fx.ref; wi.gold = st.prices.GOLD; wi.insuredUntil = st.world.insuredUntil || 0; wi.exposure = fxExposure(st); }
  if (w.mechanic === 'angel') { wi.impact = Math.floor(st.world.impact || 0); wi.impactPending = Math.round((st.world.vesting || []).reduce((s, v) => s + v.left, 0)); wi.impactPerMonth = round2(st.pledges.reduce((s, p) => s + p.impact, 0) + st.assets.reduce((s, a) => s + (a.impact || 0), 0) + (st.world.vesting || []).reduce((s, v) => s + Math.min(v.left, v.perMonth), 0)); wi.impactTarget = w.goal.impact; wi.angelsActive = st.angels.filter((x) => x.status === 'active').length; wi.angelPaper = angelPaper(st); }
  if (w.mechanic === 'history' && st.history) { const H = st.history; Object.assign(wi, { ym: H.ym, ymText: ymText(H.ym), index: st.prices.IDX, indexHist: H.idxHist.slice(-24), rate: st.world.rate, rateHist: st.world.rateHist.slice(-12), cpi: round2(st.life.cpi), home: round2(homeRatio(st)), usd: round2(seriesAt('usdIls', H.ym) || 0), headline: H.headline, benchmark: benchNW(st), scenario: H.name }); }
  const L = st.life; const band = bandOf(st); const idxH = st.holdings.IDX;
  const life = {
    age: round2(L.age), ageText: ageText(L.age), energy: Math.round(L.energy), happiness: Math.round(happyNow(st)), happinessBase: Math.round(L.happiness),
    plan: L.plan, planLabel: PLANS[L.plan].label, plans: PLAN_IDS.map((id) => ({ id, label: PLANS[id].label, desc: PLANS[id].desc, enabled: planAllowed(st, id), current: id === L.plan })),
    creditScore: Math.round(L.creditScore), creditBand: band.label, creditBandId: band.id, loanPctAdj: round2(bandAdj(st)),
    pension: Math.round(L.pension), severance: Math.round(L.severance), cpi: round2(L.cpi), inflationYear: L.inflationYear,
    realCash: Math.round(st.cash / L.cpi), realNetWorth: Math.round(netWorth / L.cpi),
    studyProgress: L.study.done ? 1 : round2(L.study.months / L.study.need), studyDone: L.study.done, sideLevel: L.plan === 'side' || L.side.months ? sideLevel(L) : 0, sideMonths: L.side.months,
    family: { ...L.family, text: familyText(L.family) }, freeTimeMonths: L.planMonths.rest, burnouts: L.burnouts, jobless: !!(L.jobless && L.jobless.until >= st.month),
    burnoutRisk: L.energy < LIFE_CFG.burnoutBelow ? round2(burnoutChance(L.energy)) : 0, autoInvest: L.autoInvest,
    raiseEligible: raiseEligible(st), raiseChance: raiseEligible(st) ? round2(raiseChance(st)) : 0,
  };
  const index = { ticker: 'IDX', price: st.prices.IDX, qty: idxH ? idxH.qty : 0, value: idxH ? Math.round(idxH.qty * st.prices.IDX) : 0, avg: idxH && idxH.qty ? round2(idxH.basis / idxH.qty) : 0,
    history: (L.idxHist || []).slice(-24), autoInvest: L.autoInvest, divPerUnit: round2(tickerDiv(st, 'IDX')) };
  return {
    month: st.month, maxMonths: st.maxMonths, turn: st.turn, mode: st.mode,
    life, payslip: ps, taxes: { ...st.taxes }, index, sideIncome, netWorthTotal: netWorth + Math.round(L.pension), pension: Math.round(L.pension),
    savings: st.savings, emergency: emergencyOf(st, expenses), realWorldRates: realWorldRates(st),
    goalHold: { streak: L.goalStreak || 0, need: GOAL_HOLD, met: goalMet(st) },
    activeBizIncome: activeBiz, businesses: managedOf(st).map((a) => ({ assetId: 'a' + a.id, ...BIZ.summary(a.biz) })),
    totalAssets: totalAssetsOf(st), totalLiabilities: st.loans + st.credit + st.assets.reduce((x, a) => x + a.debt, 0),
    cash: st.cash, salary, passive, expenses, cashflow, netWorth, loans: st.loans, credit: st.credit,
    goalProgress, goalText, goalParts, goalType: g.type,
    incomeLines, expenseLines, assets, liabilities, holdings, angels, worldIndicators: wi,
    canRepay: st.loans > 0 && st.cash >= Math.min(loanUnit(st), st.loans), canPayCredit: st.credit > 0 && st.cash >= st.credit,
    loanUnit: loanUnit(st), loanUnitCost: Math.round((loanUnit(st) * loanPct(st)) / 100),
    loanPct: loanPct(st), creditPct: W(st).creditPct, loanCap: Number.isFinite(loanCap(st)) ? loanCap(st) : null,
    loanRoom: Number.isFinite(loanCap(st)) ? Math.max(0, loanCap(st) - st.loans) : null, canBorrow: st.loans + loanUnit(st) <= loanCap(st),
  };
}

/** קרן חירום: the savings account measured in months of expenses (target 3). */
function emergencyOf(st, expenses) {
  const months = expenses > 0 ? Math.round((st.savings / expenses) * 10) / 10 : 0;
  return { balance: st.savings, months, target: 3, covered: months >= 3, rate: round2(savingsRate(st) * 100), text: `קרן חירום: ${months} חודשי הוצאות` };
}
function totalAssetsOf(st) { return Math.round(st.cash + (st.savings || 0) + holdingsValue(st) + angelPaper(st) + st.assets.reduce((x, a) => x + assetValue(st, a), 0)); }
/** ₪ change in monthly cashflow if the dollar moves +10% (unhedged assets + USD salary). Used by the w3 HUD. */
function fxExposure(st) {
  const w = W(st); let cf = 0, value = 0;
  for (const a of st.assets) if (a.sens && !(a.hedge && a.hedge.until >= st.month)) {
    const base = a.noi != null ? a.noi : a.cf; cf += base * a.sens * 0.1 * (st.world.usd / a.ref);
    value += a.usdLinked ? a.value * 0.1 * (st.world.usd / a.ref) : a.value * a.sens * w.fx.valueSens * 0.1 * (st.world.usd / a.ref);
  }
  if (st.salaryUsd) cf += st.salaryUsd * st.world.usd * 0.1;
  for (const tk of Object.keys(st.holdings)) { const t = w.tickers[tk]; if (t.kind === 'usd' || t.kind === 'gold') value += st.holdings[tk].qty * st.prices[tk] * 0.1; }
  return { cf: r10(cf), value: r100(value) };
}

/* ============================================================ assets */
function addAsset(st, card, o = {}) {
  const w = W(st);
  const a = {
    id: st.nextId++, k: card.k, n: card.n, cost: card.cost, down: card.down, debt: card.cost - card.down,
    value: card.value ?? card.cost, month: st.month, ups: 0,
  };
  if (card.noi != null) { a.noi = card.noi; if (o.fixed) a.fixedRate = round2(st.world.rate + w.rate.fixedPremium); if (card.fixedRate != null) a.fixedRate = card.fixedRate; }
  else a.cf = card.cf;
  if (card.sens) { a.sens = card.sens; a.ref = st.world.usd; }
  if (card.usdLinked) { a.usdLinked = true; a.ref = st.world.usd; }
  if (card.impact) a.impact = card.impact;
  if (card.grow) a.grow = card.grow;
  if (o.golden) a.golden = true;
  if (o.hedge) a.hedge = { rate: st.world.usd, until: st.month + w.fx.hedgeMonths - 1 };
  st.assets.push(a);
  return a;
}
const round2 = (x) => Math.round(x * 100) / 100;
function modelFor(st, k) { return W(st).models[k] || null; }

/* ============================================================ city (3D reconciliation) */
/** All 3D objects the board city should show right now: [{key, model, label, kind}] — use on resume. */
export function cityModels(st) {
  const w = W(st); const out = [];
  for (const a of st.assets) out.push({ key: 'a' + a.id, assetId: 'a' + a.id, model: modelFor(st, a.k), label: a.n, kind: a.k, golden: !!a.golden });
  const groupsSeen = new Set();
  for (const tk of Object.keys(st.holdings)) {
    const t = w.tickers[tk];
    if (st.holdings[tk].qty > 0 && t.model && !groupsSeen.has(t.model)) { groupsSeen.add(t.model); out.push({ key: 'h:' + t.model, assetId: 'h:' + t.model, model: t.model, label: t.modelLabel || t.name, kind: 'holding' }); }
  }
  for (const x of st.angels) if (x.status === 'active') out.push({ key: 'v' + x.id, assetId: 'v' + x.id, model: w.models.angel, label: x.n, kind: 'angel' });
  if (w.mechanic === 'angel' && (st.stats.given > 0 || st.pledges.length)) out.push({ key: 'f', assetId: 'f', model: w.models.giving, label: 'הקרן שלך', kind: 'foundation' });
  return out.filter((m) => m.model);
}
function holdingModelDiff(st, before, out) {
  const after = new Set(cityModels(st).filter((m) => m.kind === 'holding').map((m) => m.key));
  for (const k of after) if (!before.has(k)) { const m = cityModels(st).find((x) => x.key === k); out.spawn.push({ assetId: k, key: k, model: m.model, label: m.label, color: 'blue' }); }
  for (const k of before) if (!after.has(k)) out.despawn.push(k);
}
const holdingKeys = (st) => new Set(cityModels(st).filter((m) => m.kind === 'holding').map((m) => m.key));

/* ============================================================ result helpers */
function newOut() { return { ok: true, effects: [], mentor: null, toast: null, spawn: [], despawn: [], achievements: [], news: [] }; }
const sound = (out, name) => out.effects.push({ type: 'sound', name });
function cashFx(out, amount, label, at = 'pawn') { if (Math.round(amount)) out.effects.push({ type: 'cash', amount: Math.round(amount), label: label || sgn(amount), at }); }
function ach(st, out, type, payload = {}) {
  const got = checkAchievements(st, type, { ...payload, m: metrics(st), world: W(st) });
  for (const a of got) {
    if (st.ach.includes(a.id)) continue;
    st.ach.push(a.id); out.achievements.push(a);
    out.effects.push({ type: 'achievement', id: a.id, name: a.name }); sound(out, 'achievement');
  }
}
function mentorLine(st, key, vars) {
  const w = W(st); const m = w.mentor[key];
  if (m == null) return null;
  return tpl(Array.isArray(m) ? m[(st.turn + st.month) % m.length] : m, vars);
}

/** Force a bank loan when cash < 0 (v1 rule). Returns the loan amount. */
function ensureCash(st, out, why = '') {
  if (st.cash >= 0) return 0;
  if (st.savings > 0) { // the emergency fund pays first — no forced loan, no credit-score hit
    const take = Math.min(st.savings, -st.cash); st.savings -= take; st.cash += take;
    out.effects.push({ type: 'savings', amount: -take }); out.news.push({ kind: 'savings', text: `קרן החירום כיסתה ${fmtM(take)}. בשביל זה היא קיימת.`, amount: -take });
    lesson(st, out, 'emergency_fund');
    if (st.cash >= 0) return 0;
  }
  const unit = autoUnit(st);
  const need = Math.ceil(-st.cash / unit) * unit;
  st.loans += need; st.cash += need; st.stats.autoLoan += need; st.stats.forcedLoans += need; st.stats.autoLoans++;
  if (st.life) { creditScore(st, BK.CREDIT_DELTAS.forcedLoan); st.life.forcedFlag = true; lesson(st, out, 'forced_loan'); }
  st.stats.maxLoans = Math.max(st.stats.maxLoans, st.loans);
  if (why === 'crisis') st.flags.crisisLoan = true;
  out.effects.push({ type: 'loan', amount: need, auto: true }); sound(out, 'loss');
  out.toast = 'הבנק נתן לך הלוואה של ' + fmtM(need);
  out.mentor = mentorLine(st, 'autoLoan', { amount: fmtM(need), cost: fmtM(Math.round(need * loanPct(st) / 100)) });
  ach(st, out, 'autoLoan', { amount: need });
  return need;
}

/** Bankruptcy: cashflow still negative and debts exceed everything you own by more than N months of living costs. */
function bankruptLimit(st) { const w = W(st); return w.loan.bankrupt * Math.max(expensesOf(st) - loanPay(st) - creditPay(st), salaryNow(st) * 0.5, 1); }

/* ============================================================ turn: dice + paydays */
/**
 * Roll the die and move. Applies every payday the pawn touches (passing or landing), advances months,
 * forces bank loans if cash < 0, runs world "monthly" mechanics (FX drift, startup exits, impact growth…).
 * @returns {{die, from, to, steps:number[], paydays:[{tile, step, amount, month, landed}], news:[], effects:[], achievements:[], mentor, toast}}
 */
export function rollDice(st) {
  if (st.over) throw new Error('game over');
  if (st.phase !== 'roll') throw new Error('cannot roll now (phase ' + st.phase + ') — resolve the event first');
  const w = W(st);
  const out = newOut();
  act(st, ['r']);
  // v3: two dice, both always drawn (determinism)
  let a = 1 + Math.floor(next(st.rng, 'dice') * 6), b = 1 + Math.floor(next(st.rng, 'dice') * 6);
  if (st.tutorial && st.turn === 0) { // tutorial: the very first roll lands on a deal tile (the seeded draws are still consumed)
    const ok = []; for (let d = 2; d <= 12; d++) if (w.tiles[w.board[(st.pos + d) % w.board.length]].type === 'deal') ok.push(d);
    if (ok.length) { const sum = ok[(a + b) % ok.length]; a = Math.max(1, sum - 6); b = sum - a; }
  }
  const die = a + b; const dbl = a === b;
  sound(out, 'roll');
  const from = st.pos; const steps = []; out.paydays = [];
  for (let s = 0; s < die; s++) {
    st.pos = (st.pos + 1) % w.board.length;
    steps.push(st.pos);
    if (w.tiles[w.board[st.pos]].type === 'payday') payday(st, out, s, s === die - 1);
  }
  st.turn++;
  st.phase = 'land';
  out.double = null;
  if (dbl && !st.over) {
    const L = st.life;
    if (a % 2) { L.energy = clamp(L.energy + 8, 0, 100); L.happiness = clamp(L.happiness + 2, 0, 100); out.double = { kind: 'energy', text: mentorLine(st, 'doubleEnergy', {}) || 'דאבל! +8 🔋 כוח' }; }
    else { L.peek = true; out.double = { kind: 'peek', text: mentorLine(st, 'doublePeek', {}) || 'דאבל! יותר סיכוי במשא ומתן הבא' }; }
    out.news.push({ kind: 'double', bonus: out.double.kind, text: out.double.text }); sound(out, 'coin');
  }
  st.lastRoll = { die, dice: [a, b], double: dbl, from, to: st.pos, steps };
  Object.assign(out, { die, dice: [a, b], from, to: st.pos, steps });
  if (out.bailout === undefined) out.bailout = null;
  if (out.burnout === undefined) out.burnout = null;
  return out;
}

function payday(st, out, step, landed) {
  const w = W(st); const L = st.life; const C = LIFE_CFG;
  const m0 = metrics(st);
  const ps = m0.payslip;
  // pre-drawn, always 4 life draws per payday (decision-independent order)
  const rBurn = next(st.rng, 'life'), rRaise = next(st.rng, 'life'), rSide = next(st.rng, 'life'), rSeed = next(st.rng, 'life');
  L.sideSeed = Math.floor(rSeed * 4294967296);
  L.raiseR = rRaise;
  const burnout = L.energy < C.burnoutBelow && rBurn < burnoutChance(L.energy);
  const bizExpected = managedOf(st).reduce((x, a) => x + (a.bizDraw || 0), 0);
  const bizActual = monthlyBusiness(st, out);
  let cf = m0.cashflow - bizExpected + bizActual;
  const sideAct = L.plan === 'side' && !ps.jobless ? r10(ps.sideIncome * (0.6 + 0.8 * rSide)) : 0;
  cf += sideAct - m0.sideIncome;
  let medical = 0;
  if (burnout) { medical = r100(baseNet(st) * C.burnoutCost); cf -= m0.salary + sideAct + medical; }
  // taxes & pension (paid through the payslip)
  if (!burnout) {
    st.taxes.income += ps.incomeTax; st.taxes.bl += ps.bl;
    L.pension += ps.pensionDeposit; L.pensionIn += ps.pensionDeposit; L.severance += ps.severanceDeposit;
    if (sideAct > 0) { const due = Math.round(sideAct * marginalRate(ps.gross || grossBase(st))); L.sideTaxDue += due; L.side.total += sideAct; }
  }
  st.taxes.rental += rentTaxOf(st);
  // annual-reconciliation refunds: a little over-withholding every month; unused credit points in months without salary
  if (!burnout && !ps.jobless) L.taxRefund += Math.round(ps.incomeTax * 0.03);
  else L.taxRefund += Math.round(taxPoints(st) * TAX.creditPoint * 0.5);
  st.stats.interestPaid += loanPay(st) + creditPay(st);
  st.stats.subsPaid += st.subs.reduce((a, x) => a + x.amount, 0);
  for (const a of st.assets) { const c = assetCf(st, a); if (c < 0) st.stats.badAssetLoss -= c; }
  st.cash += cf; st.month++; st.stats.paydays++;
  if (cf < 0) st.stats.negMonths++;
  cashFx(out, cf, null, 'pawn');
  sound(out, cf >= 0 ? 'coin' : 'loss');
  const pd = { tile: st.pos, step, amount: cf, month: st.month, landed, salary: burnout ? 0 : m0.salary, gross: ps.gross, passive: m0.passive, expenses: m0.expenses + medical, sideIncome: sideAct, plan: L.plan, burnout, medical };
  out.paydays.push(pd);
  if (landed) st.lastPayday = pd;
  if (burnout) {
    out.burnout = { medical, text: mentorLine(st, 'burnout', {}) };
    out.news.push({ kind: 'burnout', text: `נשחקת: חודש בלי משכורת והוצאות רפואיות של ${fmtM(medical)}. התוכנית עברה ל"מנוחה ומשפחה".`, cost: medical });
    out.mentor = out.burnout.text;
  }
  monthlyLife(st, out, { burnout, cf });
  monthlyIndex(st, out);
  monthlyWorld(st, out);
  ensureCash(st, out, 'payday');
  if (st.cash > 0 && L.autoInvest > 0 && st.prices.IDX > 0) {
    const amt = Math.min(L.autoInvest, st.cash); const q = Math.floor(amt / st.prices.IDX);
    if (q > 0) { const h = st.holdings.IDX; const before = holdingKeys(st); const cost = Math.round(q * st.prices.IDX); st.cash -= cost; h.qty += q; h.basis += cost; L.idxBuys++; if (L.idxSince == null) L.idxSince = st.month; holdingModelDiff(st, before, out); }
  }
  // emergency fund (bank.js savingsMonth: interest − 15% tax)
  if (st.savings > 0) { const sv = BK.savingsMonth({ balance: st.savings, annualRate: savingsRate(st) }); st.savings = sv.newBalance; st.taxes.savings += sv.tax; }
  // "החופש צריך להחזיק": the goal must hold on 3 consecutive paydays
  const held = goalMet(st);
  L.goalStreak = held ? (L.goalStreak || 0) + 1 : 0;
  if (held && !st.history && L.goalStreak < GOAL_HOLD) out.news.push({ kind: 'goalHold', streak: L.goalStreak, need: GOAL_HOLD, text: `החופש צריך להחזיק: עוד ${GOAL_HOLD - L.goalStreak === 1 ? 'משכורת אחת' : (GOAL_HOLD - L.goalStreak) + ' משכורות'} כשהיעד מתקיים — ויצאת.` });
  // credit score: clean month +2, open credit-card debt −4
  if (st.credit > 0) creditScore(st, BK.CREDIT_DELTAS.cardUnpaid); else if (!L.forcedFlag && cf >= 0) creditScore(st, BK.CREDIT_DELTAS.cleanMonth);
  L.forcedFlag = false;
  if (cf < 0 && !st.flags.negWarned) { st.flags.negWarned = true; out.mentor = mentorLine(st, 'negativeCf', { cf: sgn(cf) }) || out.mentor; }
  // Bankrupt only when the hole is deep AND the money has run out: deep negative net worth with negative cashflow,
  // and cash + remaining bank room can't cover even 3 more months of the deficit (a bad buy alone, with cash in hand, is not game over).
  const room = Number.isFinite(loanCap(st)) ? Math.max(0, loanCap(st) - st.loans) : 0;
  if (cf < 0 && netWorthOf(st) < -bankruptLimit(st) && st.cash + room < -cf * 3) {
    if (st.bailout && !st.flags.bailoutUsed) bailout(st, out);
    else st.flags.bankrupt = true;
  }
  // lessons by experience
  const n = st.stats.paydays;
  if (n === 1) lesson(st, out, 'gross_net');
  if (n === 2) lesson(st, out, 'bituah_leumi');
  if (n === 3) lesson(st, out, 'pension_match');
  if (n === 5) lesson(st, out, 'tax_brackets');
  if (m0.passive > 0) lesson(st, out, 'cashflow');
  if (m0.expenses > 0 && m0.passive >= m0.expenses * 0.5) lesson(st, out, 'passive_income');
  if (L.pension >= Math.max(12 * baseNet(st), 1) && n >= 12) lesson(st, out, 'compound_interest');
  if (L.creditScore < 650) lesson(st, out, 'credit_score');
  if (L.creditScore >= 760) lesson(st, out, 'credit_excellent');
  ach(st, out, 'payday', { cf });
}

/* ---------------------------------------------------------------- v3 monthly life update (inside payday, after cash) */
function burnoutChance(energy) { const C = LIFE_CFG; return energy >= C.burnoutBelow ? 0 : clamp(C.burnoutBase + (C.burnoutBelow - energy) * C.burnoutSlope, 0, 0.95); }
function creditScore(st, d) { const L = st.life; L.creditScore = clamp(Math.round(L.creditScore + d), 300, 850); }
function happyNow(st) { const L = st.life; return clamp(L.happiness + L.glow.reduce((s, g) => s + g.amt, 0), 0, 100); }
function addGlow(st, amt) { if (amt > 0) st.life.glow.push({ amt: round2(amt) }); }
function setpoint(L) { return LIFE_CFG.setpoint + (L.family.partner === 'married' ? 5 : L.family.partner === 'together' ? 2 : 0) + Math.min(L.family.kids, 2) * 3 + (L.study.done ? 2 : 0); }
function planAllowed(st, id) { return id === 'study' ? !st.life.study.done : true; }
function raiseEligible(st) { const L = st.life; return !L.jobless && L.energy >= LIFE_CFG.raiseMin && st.month - L.lastRaise >= LIFE_CFG.raiseEvery; }
function raiseChance(st) { const L = st.life; return clamp(0.3 + (L.energy - LIFE_CFG.raiseMin) / 70 + (L.study.done ? 0.2 : 0) + (st.month - L.lastRaise >= 20 ? 0.1 : 0), 0.1, 0.85); }
function familyText(f) {
  const p = f.partner === 'married' ? 'נשוי/אה' : f.partner === 'together' ? 'בזוגיות' : 'רווק/ה';
  return f.kids ? `${p} + ${f.kids === 1 ? 'ילד/ה' : f.kids + ' ילדים'}` : p;
}
function ageText(age) {
  const y = Math.floor(age + 1e-6); const m = Math.round((age - y) * 12) % 12;
  return m ? `${y} ו${m === 1 ? 'חודש' : m === 2 ? 'חודשיים' : m + ' חודשים'}` : String(y);
}
function setGross(st, mult) {
  const L = st.life;
  if (st.salaryUsd) L.grossUsd = Math.round(L.grossUsd * mult / 10) * 10; else L.gross = r10(L.gross * mult);
  st.salary = baseNet(st);
}
function monthlyLife(st, out, o) {
  const L = st.life; const C = LIFE_CFG; const P = PLANS[L.plan];
  L.age += 1 / 12;
  const young = L.kidsBorn.filter((m) => st.month - m <= 12).length;
  if (o.burnout) {
    L.burnouts++; L.energy = 45; L.happiness = clamp(L.happiness - 15, 0, 100); L.plan = 'rest';
    lesson(st, out, 'burnout');
  } else {
    L.planMonths[L.plan]++;
    const load = (L.plan === 'work' || L.plan === 'overtime') ? L.workLoad * 4 : 0;
    L.energy = clamp(L.energy + P.energy - load - young * 2, 0, 100);
    L.happiness += P.happiness;
    if (L.plan === 'overtime') { lesson(st, out, 'time_scarce'); if (L.planMonths.overtime >= 2) lesson(st, out, 'marginal_overtime'); }
    if (L.plan === 'rest') lesson(st, out, 'rest_value');
    // study → permanent raise
    if (L.plan === 'study' && !L.study.done) {
      L.study.months++;
      if (L.study.months >= L.study.need) studyDone(st, out);
    }
    // side hustle → grows → becomes a real business
    if (L.plan === 'side') {
      L.side.months++; L.side.level = sideLevel(L);
      if (L.side.months === 1) lesson(st, out, 'side_hustle');
      if (L.side.months >= C.sideBizAt) {
        // the evenings grew into a real (managed) business: a coffee cart whose equipment you already paid for with your time
        const a = addBusiness(st, 'coffee', L.sideSeed, { startCapital: BIZ.ARCHETYPES.coffee.equipment + 3000 });
        a.n = 'העסק הצדדי שלך'; a.cost = 0; a.down = 0; a.biz.invested = 0;
        out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, 'biz'), label: a.n, color: 'green' });
        out.news.push({ kind: 'sideBiz', text: mentorLine(st, 'sideBiz', { cf: 'רווח' }), assetId: 'a' + a.id });
        L.side.months = 0; L.side.level = 0; L.plan = 'work';
      }
    }
  }
  // happiness: adaptation toward the set point, stress
  const income = Math.max(baseNet(st) + Math.max(0, passiveOf(st)), 1);
  if (st.loans + st.credit > C.debtStressMult * income) L.happiness -= 2;
  if (o.cf < 0) L.happiness -= 2;
  if (L.energy < 30) L.happiness -= 2;
  L.happiness += (setpoint(L) - L.happiness) * C.adapt;
  L.happiness = clamp(round2(L.happiness), 0, 100);
  for (const g of L.glow) g.amt = round2(g.amt / 2);
  L.glow = L.glow.filter((g) => g.amt >= 0.5);
  L.hapSum += happyNow(st); L.hapN++;
  // temporary expenses end, jobless ends
  st.expenses = st.expenses.filter((x) => !x.until || x.until >= st.month);
  if (L.jobless && L.jobless.until < st.month) { L.jobless = null; out.news.push({ kind: 'lifeNews', text: 'מצאת עבודה חדשה! המשכורת חוזרת מהחודש הבא.' }); }
  // a friend's loan / guarantee resolves
  if (L.friend && st.month >= L.friend.at) {
    const f = L.friend; L.friend = null;
    if (f.kind === 'lend') {
      if (f.ok) { st.cash += f.amount; cashFx(out, f.amount, '+' + fmtM(f.amount)); out.news.push({ kind: 'lifeNews', text: `החבר החזיר את ההלוואה: ${fmtM(f.amount)}. וגם הזמין אותך לפתיחה של העסק.`, cash: f.amount }); }
      else { L.happiness = clamp(L.happiness - 3, 0, 100); out.news.push({ kind: 'lifeNews', text: `העסק של החבר נסגר. את ${fmtM(f.amount)} כנראה לא תראה שוב.`, cash: 0 }); }
    } else if (!f.ok) {
      st.cash -= f.amount; cashFx(out, -f.amount); L.happiness = clamp(L.happiness - 5, 0, 100);
      out.news.push({ kind: 'lifeNews', text: `החבר לא עמד בהלוואה — והבנק גבה ממך, הערב, ${fmtM(f.amount)}.`, cash: -f.amount });
    } else out.news.push({ kind: 'lifeNews', text: 'החבר סגר את ההלוואה בבנק. הערבות שלך שוחררה — פיו.', cash: 0 });
  }
  // inflation: monthly CPI, prices adjust once a year
  if (st.history) {
    const H = st.history; const c = seriesAt('cpiIL', addYm(H.ym, 1));
    if (c) L.cpi = c / H.base.cpi;
  } else L.cpi = L.cpi * BK.dpow(1 + L.inflationYear / 100, 1 / 12); // bank.js dpow: bit-identical in every JS engine (server replay)
  if ((st.month - 1) % 12 === 0 && st.month > 1) yearlyPrices(st, out);
}
/* ---------------------------------------------------------------- managed businesses (js/finance/business.js) */
/** One simulated month for every managed business: owner cash, energy, taxes, lessons, news. Returns the owner's net cash. */
function monthlyBusiness(st, out) {
  let total = 0;
  for (const a of managedOf(st)) {
    const key = 'a' + a.id;
    const res = BIZ.simulate(a.biz, null, () => next(st.bizRng, key)); // exactly 3 draws/month from this business's own sealed stream
    const r = res.report; a.biz = res.business;
    a.bizNet = r.toOwner.net; a.bizDraw = r.toOwner.drawNet; a.bizHeadline = r.headline;
    const v = BIZ.valuation(a.biz); a.value = v.price + v.cash + v.receivables;
    total += r.toOwner.net;
    st.taxes.business += r.corpTax + r.toOwner.divTax;
    st.life.energy = clamp(st.life.energy - r.ownerEnergy, 0, 100);
    for (const id of r.lessons || []) lesson(st, out, id);
    out.news.push({ kind: 'business', assetId: key, name: a.n, headline: r.headline, note: r.notes && r.notes[0] ? r.notes[0].text : null, events: (r.events || []).map((e) => ({ id: e.id, title: e.title, text: e.text })), net: r.toOwner.net, netProfit: r.netProfit, revenue: r.revenue });
  }
  return total;
}
/** Create a managed business asset (paid from cash by the caller). */
function addBusiness(st, typeId, seed, overrides) {
  const A = BIZ.ARCHETYPES[typeId];
  const b = BIZ.create(typeId, { month: st.month, overrides });
  const a = { id: st.nextId++, k: 'biz', n: A.short || A.name, cost: b.purchasePrice, down: b.purchasePrice, debt: 0, value: b.purchasePrice, cf: 0, month: st.month, ups: 0, biz: b, bizNet: 0, bizDraw: 0 };
  st.assets.push(a); st.bizRng['a' + a.id] = seed >>> 0 || 1;
  // start with the module's smart default (draw / marketing / stock)
  const sg = BIZ.suggest(a.biz); if (Object.keys(sg.decisions).length) { const r = BIZ.applyDecisions(a.biz, sg.decisions); if (r.ok && !r.cashNeeded) a.biz = r.business; }
  return a;
}
/** Decision presets for the K tile → business.js applyDecisions input. */
function bizDecision(b, id) {
  const o = BIZ.decisionOptions(b); const p = b.p;
  const step = (list, cur, dir) => { const xs = [...new Set(list)].sort((x, y) => x - y); const i = xs.findIndex((x) => x > cur); return dir > 0 ? (i >= 0 ? xs[i] : null) : ([...xs].reverse().find((x) => x < cur) ?? null); };
  switch (id) {
    case 'suggest': return o.suggest.decisions;
    case 'manager': return { manager: !b.manager };
    case 'price:up': return { price: o.price.steps.find((x) => x.pct === 10).price };
    case 'price:down': return { price: o.price.steps.find((x) => x.pct === -10).price };
    case 'mkt:up': { const v = step(o.marketing.presets, b.marketing, 1); return v == null ? null : { marketing: v }; }
    case 'mkt:down': { const v = step(o.marketing.presets, b.marketing, -1); return v == null ? null : { marketing: v }; }
    case 'hire': return b.staff < p.maxStaff ? { hire: 1 } : null;
    case 'fire': return b.staff > 0 ? { fire: 1 } : null;
    case 'draw:up': { const v = step(o.draw.presets, b.draw, 1); return v == null ? null : { draw: v }; }
    case 'draw:down': { const v = step(o.draw.presets, b.draw, -1); return v == null ? null : { draw: v }; }
    case 'order': return p.stock === 'inventory' ? { order: o.suggest.decisions.order || 200 } : null;
    case 'expand': return o.expand && o.expand.done < o.expand.max ? { expand: 1 } : null;
    default: return null;
  }
}
function createBusinessEvent(st) {
  const w = W(st); const offers = w.bizOffers || ['coffee'];
  const rPick = next(st.rng, 'deal'), seed = Math.floor(next(st.rng, 'deal') * 4294967296); // always 2 draws (ranked-fair)
  const own = managedOf(st).sort((x, y) => (x.biz.lastDecisionMonth ?? -1) - (y.biz.lastDecisionMonth ?? -1))[0];
  if (own) return { type: 'business', mode: 'manage', assetId: own.id };
  return { type: 'business', mode: 'offer', typeId: offers[Math.floor(rPick * offers.length)], seed };
}

function studyDone(st, out) {
  const L = st.life;
  L.study.done = true; setGross(st, 1 + LIFE_CFG.studyRaise); L.happiness = clamp(L.happiness + 6, 0, 100);
  if (L.plan === 'study') L.plan = 'work';
  out.news.push({ kind: 'studyDone', text: mentorLine(st, 'studyDone', { pct: Math.round(LIFE_CFG.studyRaise * 100) + '%' }) });
  lesson(st, out, 'human_capital'); lesson(st, out, 'credit_points');
}
/** Once a year: living costs follow CPI, rents follow at 70%, gross salary gets 80% of it. */
function yearlyPrices(st, out) {
  const L = st.life; const C = LIFE_CFG;
  const ratio = L.cpi / L.cpiAdj; L.cpiAdj = L.cpi;
  const infl = ratio - 1;
  L.infl.push(round2(infl * 100));
  if (Math.abs(infl) > 0.0005) {
    for (const x of st.expenses) x.amount = r10(x.amount * ratio);
    if (st.salaryUsd) L.grossUsd = Math.round(L.grossUsd * (1 + infl * C.salaryCpi) / 10) * 10; else L.gross = r10(L.gross * (1 + infl * C.salaryCpi));
    for (const a of st.assets) {
      if (a.biz) { a.biz = BIZ.applyInflation(a.biz, infl * 100); continue; } // costs rise, prices are the owner's decision
      const k = isRent(st, a) ? C.rentCpi : C.bizCpi;
      if (a.noi != null) { if (a.noi > 0) a.noi = r10(a.noi * (1 + infl * k)); } else if (a.cf > 0) a.cf = r10(a.cf * (1 + infl * k));
    }
    st.salary = baseNet(st);
    out.news.push({ kind: 'inflation', text: mentorLine(st, 'inflationYear', { infl: pct(infl * 100, 1), wage: pct(infl * C.salaryCpi * 100, 1) }), inflation: round2(infl * 100) });
    lesson(st, out, 'inflation'); lesson(st, out, 'wage_lag');
    if (st.cash > 3 * Math.max(1, expensesOf(st))) lesson(st, out, 'real_vs_nominal');
  }
  if (L.sideTaxDue > 0) { // undeclared side income: the tax authority bills it at year end, +10% penalty
    const bill = Math.round(L.sideTaxDue * 1.1); st.cash -= bill; st.taxes.side += bill; L.sideTaxDue = 0; cashFx(out, -bill);
    out.news.push({ kind: 'tax', text: `מס הכנסה: חוב על העסק הצדדי שלא דווח — ${fmtM(bill)} (כולל קנס של 10%).`, tax: bill });
    lesson(st, out, 'side_tax');
  }
  newInflationYear(st);
}
/** Index fund + pension: one pre-drawn monthly return (invest.js: 2 draws, always), or the real series in history mode. */
function monthlyIndex(st, out) {
  const L = st.life; const X = LIFE_CFG.idx;
  // invest.js simulateReturns: exactly 2 draws per month (return + crash check), deterministic math (server replay)
  const r0 = IV.simulateReturns({ months: 1, annualReturn: X.annual, vol: X.vol, crashChance: X.crashChance, crash: X.crash, rand: () => next(st.rng, 'index') })[0];
  const p0 = st.prices.IDX; let r = r0;
  if (st.history) {
    const H = st.history; const ym = addYm(H.ym, 1);
    const v = seriesAt(H.index, ym); const v0 = seriesAt(H.index, H.ym);
    r = v && v0 ? v / v0 - 1 : 0;
  }
  st.prices.IDX = Math.max(1, round2(p0 * (1 + r)));
  (L.idxHist ||= []).push(st.prices.IDX); if (L.idxHist.length > 60) L.idxHist.shift();
  const div = (W(st).historyDiv ?? X.div);
  L.pension = Math.round(L.pension * (1 + r + div));
  L.severance = Math.round(L.severance * (1 + r + div));
  if (r <= -0.08) { L.lastCrash = st.month; out.news.push({ kind: 'indexDrop', text: `המדד צנח ${pct(-r * 100, 1)} החודש. גם הפנסיה שלך ירדה — על הנייר.`, change: round2(r * 100) }); }
  L.idxPeak = Math.max(L.idxPeak || p0, st.prices.IDX);
  if (st.prices.IDX <= L.idxPeak * 0.8) lesson(st, out, 'drawdown');
}
function homeRatio(st) { const H = st.history; if (!H) return 1; const v = seriesAt('homeIL', H.ym); return v ? v / H.base.home : 1; }
function benchNW(st) { const H = st.history; return H ? Math.round(H.bench.units * st.prices.IDX) : 0; }

/** Unlock a library lesson (once per game). */
function lesson(st, out, id) {
  if (!st.lessons || st.lessons.includes(id) || !LESSON_BY_ID[id]) return;
  st.lessons.push(id);
  const l = LESSON_BY_ID[id];
  (out.lessons ||= []).push({ id, title: l.title, text: l.text });
}

/** First-ever bankruptcy with createGame({bailout:true}): the bank restructures instead of ending the game. Once. */
function bailout(st, out) {
  st.flags.bailoutUsed = true;
  if (st.life) creditScore(st, BK.CREDIT_DELTAS.bailout);
  const leaks = leaksOf(st);
  const sold = [];
  for (const a of st.assets.slice()) if (assetCf(st, a) < 0) { st.cash += assetValue(st, a) - a.debt; sold.push(a.n); st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); }
  const creditFolded = st.credit; st.loans += st.credit; st.credit = 0;
  if (st.cash > 0) { const pay = Math.min(st.cash, st.loans); st.loans -= pay; st.cash -= pay; }
  if (st.cash < 0) { st.loans += -st.cash; st.cash = 0; }
  let writtenOff = 0;
  const cf = metrics(st).cashflow;
  if (cf < 0 && st.loans > 0) { writtenOff = Math.min(st.loans, Math.ceil((-cf / (loanPct(st) / 100)) / 1000) * 1000); st.loans -= writtenOff; }
  const top = leaks.find((l) => l.key !== 'forced');
  const why = top ? `הדליפה הכי גדולה שלך: ${top.label} (${fmtM(top.amount)}).` : 'ההוצאות עלו על ההכנסות חודש אחרי חודש.';
  const b = {
    kind: 'bailout', title: 'הבנק עושה לך הסדר חוב — פעם אחת',
    text: `${why} ${sold.length ? `הבנק מכר את ${sold.join(', ')} (נכסים שהפסידו כסף כל חודש). ` : ''}${creditFolded ? `חוב האשראי (${fmtM(creditFolded)}) עבר להלוואה זולה יותר. ` : ''}${writtenOff ? `ומחק ${fmtM(writtenOff)} מההלוואה כדי שהתזרים יהיה חיובי.` : ''}`.trim(),
    mentor: mentorLine(st, 'bailout', {}) || 'כמעט פשטת רגל. הפעם הבנק עזר — בפעם הבאה לא יהיה הסדר. תזרים חיובי קודם, צעצועים אחר כך.',
    leaks, sold, writtenOff, creditFolded,
  };
  out.bailout = b; out.news.push(b); out.mentor = b.mentor; sound(out, 'card');
}

/* ============================================================ end-of-game explanations */
/** Where the money went: [{key, label, amount}] biggest first. 'forced' is listed but never blamed. */
export function leaksOf(st) {
  const s = st.stats; const w = W(st);
  const L = [
    { key: 'interest', label: 'ריבית על הלוואות ואשראי', amount: Math.round(s.interestPaid) },
    { key: 'toys', label: 'פיתויים שקנית', amount: Math.round(s.toysSpent) },
    { key: 'badAssets', label: 'נכסים שהפסידו כסף כל חודש', amount: Math.round(s.badAssetLoss) },
    { key: 'subs', label: 'מנויים חודשיים', amount: Math.round(s.subsPaid) },
    { key: 'forced', label: 'הוצאות חובה ומשברים (לא באשמתך)', amount: Math.round(s.needsSpent + s.crisisPaid) },
    { key: 'business', label: 'כסף שהזרמת לעסק שהפסיד', amount: Math.round(st.assets.reduce((x, a) => x + (a.biz ? a.biz.totals.injected : 0), 0)) },
  ];
  return L.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
}

/* ============================================================ server summary */
/** Compact JSON for the backend (rr_finish): result + stats + leaks + decision log. < 10 KB. */
export function summaryForServer(st) {
  const m = metrics(st); const r = st.result || {};
  const L = st.life;
  return { v: SAVE_VERSION, worldId: st.worldId, charId: st.charId, mode: st.mode, seed: st.seed, months: st.month, turns: st.turn, status: st.over || 'playing', reason: r.reason || null, stars: r.stars || 0,
    netWorth: m.netWorth, passive: m.passive, expenses: m.expenses, impact: Math.floor(st.world.impact || 0), progress: round2(m.goalProgress), stats: { ...st.stats }, leaks: leaksOf(st), log: st.log.slice(-40),
    life: { age: round2(L.age), happiness: Math.round(L.happiness), energy: Math.round(L.energy), creditScore: L.creditScore, pension: Math.round(L.pension), burnouts: L.burnouts, plan: L.plan, planMonths: { ...L.planMonths }, kids: L.family.kids, events: L.events.length },
    scenarioId: st.history ? st.history.scenarioId : null, lessons: st.lessons.slice(),
    config: replayConfig(st), actions: st.actions || [] };
}

/** Per-month world mechanics, all decision-independent draws come from the 'drift' stream. */
function monthlyWorld(st, out) {
  const w = W(st);
  if (st.history) historyMonth(st, out);
  for (const a of st.assets) { const g = a.grow ?? (w.appreciation ? w.appreciation[a.k] || 0 : 0); if (g) a.value = Math.round(a.value * (1 + g)); }
  if (w.mechanic === 'fx') {
    // small monthly drift, slightly mean-reverting toward the reference rate
    const r = next(st.rng, 'drift');
    const u0 = st.world.usd;
    const drift = (r - 0.5) * 2 * w.fx.drift + (w.fx.ref - u0) * w.fx.revert;
    setUsd(st, u0 + drift);
    st.world.goldUsd = Math.round(st.world.goldUsd * (1 + w.fx.goldDrift));
    updateDerivedPrices(st);
    for (const a of st.assets) if (a.hedge && a.hedge.until === st.month - 1) {
      out.news.push({ kind: 'hedgeExpired', assetId: 'a' + a.id, text: `הגידור על ${a.n} הסתיים. מעכשיו הוא חשוף שוב לדולר.` });
    }
  }
  if (w.mechanic === 'angel') {
    // impact ripples: every point of impact you created keeps growing
    st.world.impact = (st.world.impact || 0) * (1 + w.giving.ripple);
    // gifts turn into impact gradually (scholarships graduate, programs grow) — so giving late means waiting
    const vest = st.world.vesting || [];
    for (const v of vest) { const x = Math.min(v.left, v.perMonth); st.world.impact += x; v.left = round2(v.left - x); }
    st.world.vesting = vest.filter((v) => v.left > 0.001);
    for (const p of st.pledges) st.world.impact += p.impact;
    for (const a of st.assets) if (a.impact) st.world.impact += a.impact;
    for (const x of st.angels) {
      if (x.status !== 'active') continue;
      if (!x.signalDone && st.month >= x.signalAt) {
        x.signalDone = true; x.paper = Math.round(x.amount * x.signalMult);
        x.news = x.signalMult >= 1 ? `${x.n}: ${x.signalMult >= 2 ? 'גייסו סבב בשווי כפול!' : 'גייסו סבב קטן, שווי קצת עלה.'}` : `${x.n}: קשיים — פיטרו חצי מהצוות.`;
        out.news.push({ kind: 'signal', angelId: 'v' + x.id, text: x.news, paper: x.paper });
      }
      if (st.month >= x.revealAt) revealAngel(st, x, out);
    }
  }
}
/** מכונת הזמן: one real month passes — rate, home prices, dollar, headlines, the benchmark investor. */
function historyMonth(st, out) {
  const H = st.history; const w = W(st);
  H.ym = addYm(H.ym, 1);
  H.idxHist.push(st.prices.IDX); if (H.idxHist.length > 60) H.idxHist.shift();
  const r = seriesAt('boiRate', H.ym); if (r != null) setRate(st, r);
  const hr = homeRatio(st);
  for (const a of st.assets) if (a.k === 're') { if (a.value0 == null) { a.value0 = a.value; a.home0 = hr; } a.value = Math.round(a.value0 * hr / a.home0); }
  // benchmark: dividends reinvested (after tax) + the same monthly saving
  const B = H.bench; const div = (w.historyDiv || 0) * (1 - IV.INVEST.dividendTax);
  B.units = B.units * (1 + div) + (B.save || 0) * (st.life.cpi || 1) / st.prices.IDX;
  B.saved = (B.saved || 0) + Math.round((B.save || 0) * (st.life.cpi || 1));
  for (const h of (scenarioById(H.scenarioId) || { headlines: [] }).headlines) if (h.ym === H.ym) { H.headline = h; out.news.push({ kind: 'headline', ym: h.ym, ymText: ymText(h.ym), text: h.text }); }
}
function setUsd(st, u) {
  const w = W(st);
  st.world.usd = round2(clamp(u, w.fx.min, w.fx.max));
  st.world.usdHist.push(st.world.usd);
  if (st.world.usdHist.length > 40) st.world.usdHist.shift();
}
function setRate(st, r) {
  const w = W(st);
  st.world.rate = round2(clamp(r, w.rate.min, w.rate.max));
  st.world.rateHist.push(st.world.rate);
  if (st.world.rateHist.length > 40) st.world.rateHist.shift();
  updateDerivedPrices(st);
}

function revealAngel(st, x, out) {
  const cash = Math.round(x.amount * x.mult);
  x.status = x.mult > 0 ? 'exited' : 'failed'; x.cashOut = cash; x.paper = 0;
  st.cash += cash;
  out.despawn.push('v' + x.id);
  const big = x.mult >= 10;
  if (x.mult > 0) st.stats.exits++;
  if (big) st.stats.bigExits++;
  const text = x.mult === 0 ? `${x.n} נסגר. ההשקעה של ${fmtM(x.amount)} ירדה לאפס.`
    : x.mult < 1 ? `${x.n} נמכר בזול. קיבלת ${fmtM(cash)} מתוך ${fmtM(x.amount)}.`
    : `אקזיט! ${x.n} נמכר — פי ${x.mult}. נכנסו לך ${fmtM(cash)}.`;
  out.news.push({ kind: 'exit', angelId: 'v' + x.id, name: x.n, amount: x.amount, mult: x.mult, cash, big, text });
  out.effects.push({ type: 'exit', angelId: 'v' + x.id, mult: x.mult, cash });
  if (cash) cashFx(out, cash, '+' + fmtM(cash), 'v' + x.id);
  sound(out, big ? 'golden' : x.mult >= 1 ? 'coin' : 'loss');
  if (big) out.effects.push({ type: 'sparkle', at: 'v' + x.id });
  out.mentor = x.mult === 0 ? mentorLine(st, 'angelFail', {}) : big ? mentorLine(st, 'angelBig', { mult: x.mult }) : mentorLine(st, 'angelSmall', {});
  lesson(st, out, 'power_law');
  if (x.mult > 1) { const t = gainTax(st, cash - x.amount, out); st.cash -= t; if (t) out.news.push({ kind: 'tax', text: `מס רווח הון על האקזיט: ${fmtM(t)}.`, tax: t }); }
  else if (x.mult < 1) gainTax(st, cash - x.amount, out); // a loss carries forward
  ach(st, out, 'exit', { mult: x.mult, cash });
}

/* ============================================================ landing: draw the card */
function drawCard(st, deckName, cards, stream) {
  if (!st.decks[deckName] || !st.decks[deckName].length) st.decks[deckName] = shuffle(st.rng, stream, cards.map((_, i) => i));
  return cards[st.decks[deckName].pop()];
}

/**
 * Event for the tile the pawn is on. First call after rollDice draws the card (seeded) and stores it in
 * state.pending; later calls (e.g. after resume, or after takeLoan) return the same event, re-described with
 * fresh numbers/enabled flags. Returns null if there is nothing to resolve (phase 'roll').
 */
export function landing(st) {
  if (st.pending) return describe(st);
  if (st.phase !== 'land') return null;
  act(st, ['l']);
  const w = W(st);
  const ch = w.board[st.pos];
  const tile = w.tiles[ch];
  let p;
  switch (tile.type) {
    case 'payday': p = { type: 'payday', pd: st.lastPayday, raiseR: st.life.raiseR }; break;
    case 'deal': p = createDeal(st); break;
    case 'doodad': p = { type: 'doodad', card: resolveDoodad(st, clone(drawCard(st, 'doodad', w.doodads, 'doodad'))) }; break;
    case 'market': p = w.mechanic === 'history' ? historyMarket(st) : createMarket(st); break;
    case 'crisis': p = { type: 'crisis', card: clone(drawCard(st, 'crisis', w.crises, 'crisis')) }; if (st.tutorial && st.turn <= 3) p.skipped = true;
      if (!st.history && !p.skipped) { const X = LIFE_CFG.idx; st.prices.IDX = Math.max(1, round2(st.prices.IDX * (1 + X.crisisHit))); st.life.lastCrash = st.month; p.indexHit = X.crisisHit; } break;
    case 'mystery': p = createMystery(st); break;
    case 'bank': p = createBank(st); break;
    case 'upgrade': p = { type: 'upgrade', card: clone(drawCard(st, 'upgrade', w.upgrades, 'special')) }; break;
    case 'fx': p = createFx(st); break;
    case 'shipping': p = { type: 'shipping', card: clone(drawCard(st, 'shipping', w.shipping, 'special')) }; break;
    case 'pitch': p = createPitch(st); break;
    case 'giving': p = { type: 'giving', card: clone(drawCard(st, 'giving', w.causes, 'special')) }; break;
    case 'life': p = createLife(st); break;
    case 'business': p = createBusinessEvent(st); break;
    case 'edu': p = { type: 'edu' }; break;
    case 'tax': p = { type: 'tax', refund: st.life.taxRefund, bill: st.life.sideTaxDue }; break;
    case 'index': p = tradePending(st, 'IDX', null, 'קרן מחקה מדד ופנסיה', 'קונים קצת מכל השוק. המחיר זז כל חודש — לפעמים חזק. כאן אפשר גם להגדיר הוראת קבע.', 'index'); break;
    default: throw new Error('unknown tile type ' + tile.type);
  }
  p.id = st.nextEventId++; p.tile = ch; p.pos = st.pos; p.month = st.month;
  st.pending = p; st.phase = 'event';
  return describe(st);
}
/** Current pending event (re-described), or null. */
export function currentEvent(st) { return st.pending ? describe(st) : null; }

function createDeal(st, forceGolden = null) {
  const w = W(st);
  const base = drawCard(st, 'deal', w.deals, 'deal');
  const gRoll = next(st.rng, 'deal');
  const gIdx = w.golden && w.golden.length ? int(st.rng, 'deal', 0, w.golden.length - 1) : (next(st.rng, 'deal'), 0);
  const negR = next(st.rng, 'deal'); // v3: the seller's answer to a lower offer is sealed with the card
  let card = base; let golden = false;
  if (st.tutorial && !st.flags.tutorialDone && w.starterDeal) {
    card = clone(w.starterDeal); st.flags.tutorialDone = true;
    if (st.cash < card.down) card.down = Math.max(0, Math.floor(st.cash / 100) * 100); // never needs a loan
  }
  else if (forceGolden || (w.golden && w.golden.length && gRoll < w.goldenChance)) { card = w.golden[gIdx]; golden = true; }
  const p = dealPending(st, card, golden, 'deal'); p.negR = negR;
  return p;
}
/** Tile L: a life dilemma. Deck from the life stream + one outcome draw (always). Ineligible cards swap to their alt. */
function createLife(st) {
  let card = drawCard(st, 'life', LIFE_EVENTS, 'life');
  const r = next(st.rng, 'life');
  if (card.when && !card.when(st.life)) card = LIFE_EVENTS.find((e) => e.id === card.alt) || LIFE_EVENTS.find((e) => e.id === 'vacation');
  return { type: 'life', eventId: card.id, r };
}
/** History-mode market tile: the latest real headline + a trade window on the index fund at the real price. */
function historyMarket(st) {
  const H = st.history; const h = H.headline;
  return tradePending(st, 'IDX', null, h ? h.text : `${ymText(H.ym)} בשוק`, h ? `${ymText(h.ym)} · המדד עומד על ${fmtP(st.prices.IDX)} (100 = תחילת התקופה).` : `המדד עומד על ${fmtP(st.prices.IDX)} (100 = תחילת התקופה).`, 'market');
}
function dealPending(st, card, golden, source) {
  if (card.crypto) return cryptoPending(st, card, source === 'mystery' ? 'mystery' : 'deal', source);
  if (card.tk) return tradePending(st, card.tk, card.p, card.n, card.d, source, golden);
  return { type: 'deal', card: clone(card), golden, source };
}
function tradePending(st, tk, price, title, text, source, golden = false) {
  const w = W(st); const t = w.tickers[tk];
  if (t.kind === 'gold' && price != null) { st.world.goldUsd = Math.round(price / st.world.usd); updateDerivedPrices(st); }
  else if (price != null && !['bond', 'gold', 'usd'].includes(t.kind)) st.prices[tk] = price; // derived prices (bond/gold/usd) are computed, card prices apply to everything else (incl. crypto)
  return { type: 'trade', tk, title, text, source, golden };
}
/** Lifestyle cards may be priced relative to the salary (aMult/subMult) — fixed once, when drawn. */
function resolveDoodad(st, c) {
  const w = W(st);
  const sal = Math.max(salaryNow(st), w.doodadWealth ? netWorthOf(st) * w.doodadWealth : 0, 1);
  if (c.aMult) c.a = Math.max(100, r100(sal * c.aMult));
  if (c.subMult) c.sub = Math.max(50, r10(sal * c.subMult));
  return c;
}
function createMarket(st) {
  const w = W(st);
  const card = clone(drawCard(st, 'market', w.market, 'market'));
  // unconditional "news" is applied once, right here (never in choose) so it cannot depend on decisions
  if (card.crypto) return cryptoPending(st, card, 'market', 'market');
  if (card.k === 'price') return tradePending(st, card.tk, card.p, card.n, card.d, 'market');
  if (card.k === 'gold') { st.world.goldUsd = Math.round(st.world.goldUsd * (1 + card.pct / 100)); updateDerivedPrices(st); return tradePending(st, 'GOLD', null, card.n, card.d, 'market'); }
  const p = { type: 'market', card };
  if (card.k === 'rate') { p.from = st.world.rate; setRate(st, st.world.rate + card.delta); p.to = st.world.rate; }
  if (card.k === 'fx') { p.from = st.world.usd; setUsd(st, st.world.usd + card.delta); updateDerivedPrices(st); p.to = st.world.usd; }
  if (card.k === 'reval') { p.changed = []; for (const a of st.assets) if (!card.kind || a.k === card.kind) { const v0 = a.value; a.value = Math.round(a.value * card.mult); p.changed.push({ id: a.id, from: v0, to: a.value }); } }
  if (card.k === 'exitwave') { p.pulled = st.angels.filter((x) => x.status === 'active' && x.revealAt <= st.month + card.months).map((x) => x.id); }
  if (card.k === 'markdown') { p.marked = []; for (const x of st.angels) if (x.status === 'active') { x.paper = Math.round(x.paper * card.mult); p.marked.push(x.id); } }
  return p;
}
function createMystery(st) {
  const w = W(st);
  const card = clone(weighted(st.rng, 'mystery', w.mystery));
  const gIdx = int(st.rng, 'mystery', 0, Math.max(0, (w.golden || []).length - 1));
  const negR = next(st.rng, 'mystery');
  if (card.kind === 'golden' && w.golden && w.golden.length) { const p = dealPending(st, w.golden[gIdx], true, 'mystery'); p.mysteryTitle = card.title; p.negR = negR; return p; }
  return { type: 'mystery', card };
}
function createBank(st) {
  const w = W(st);
  const card = clone(drawCard(st, 'bank', w.bank, 'special'));
  const from = st.world.rate;
  setRate(st, from + card.delta);
  return { type: 'bank', card, from, to: st.world.rate };
}
function createFx(st) {
  const w = W(st);
  const card = clone(drawCard(st, 'fx', w.fxCards, 'special'));
  const from = st.world.usd;
  let to = from + (card.delta || 0);
  if (card.revert) to = from + (w.fx.ref - from) * card.revert;
  setUsd(st, to); updateDerivedPrices(st);
  if (card.gold) { st.world.goldUsd = Math.round(st.world.goldUsd * (1 + card.gold / 100)); updateDerivedPrices(st); }
  return { type: 'fx', card, from, to: st.world.usd };
}
function createPitch(st) {
  const w = W(st);
  const card = clone(drawCard(st, 'pitch', w.pitches, 'special'));
  // the startup's fate is sealed NOW (3 draws, always), whether or not anyone invests
  const rOut = next(st.rng, 'special'), rTime = next(st.rng, 'special'), rSig = next(st.rng, 'special');
  const A = w.angel;
  const q = card.team + card.traction; // 2..6
  const table = A.outcomes.map((o) => ({ m: o.m, w: Math.max(0.001, o.w + (o.q || 0) * (q - 4) + (o.h || 0) * (card.hype - 2)) }));
  const tot = table.reduce((s, o) => s + o.w, 0);
  let acc = 0, mult = table[table.length - 1].m;
  for (const o of table) { acc += o.w / tot; if (rOut < acc) { mult = o.m; break; } }
  mult = round2(mult * A.hypeMult[card.hype - 1]);
  const revealIn = A.revealMin + Math.floor(rTime * (A.revealMax - A.revealMin + 1));
  const signalMult = mult >= 5 ? 2 : mult >= 1.5 ? 1.25 : mult > 0 ? 0.7 : rSig < A.fakeHype ? 1.5 : 0.5;
  return { type: 'pitch', card, hidden: { mult, revealIn, signalIn: Math.ceil(revealIn / 2), signalMult } };
}

/* ============================================================ describe: pending → UI event */
function baseEvent(st, p) {
  const w = W(st); const t = w.tiles[p.tile] || {};
  return { id: p.id, type: p.type, tile: p.tile, tag: t.name, color: t.color, ink: t.ink, title: '', text: '', mentor: '', options: [], data: {}, golden: !!p.golden, sound: 'card' };
}
const opt = (id, label, enabled = true, extra = {}) => ({ id, label, enabled: !!enabled, ...extra });

function describe(st) {
  const p = st.pending; if (!p) return null;
  CAP_REASON = capReason(st);
  const ev = baseEvent(st, p);
  const fn = DESCRIBE[p.type];
  fn(st, p, ev);
  if (ev.golden) { ev.sound = 'golden'; ev.tag = (p.source === 'mystery' ? 'הפתעה · ' : '') + 'עסקת זהב'; ev.color = '#d4a017'; }
  ev.auto = !!ev.auto;
  if (ev.auto) { // irrelevant card: one closing option, the UI shows toastText and closes it
    const keep = ev.options.find((o) => SAFE_IDS.includes(o.id)) || ev.options[ev.options.length - 1];
    ev.options = [{ ...keep, enabled: true, reason: undefined }];
    ev.toastText = ev.toastText || ev.title;
    delete ev.options[0].reason;
  }
  // exactly one primary option (the smart default); quiz answers get none so Enter can't leak the answer
  const marked = ev.options.filter((o) => o.primary && o.enabled);
  const pick = ev.noPrimary ? null : marked[0] || ev.options.find((o) => o.enabled && SAFE_IDS.includes(o.id)) || ev.options.find((o) => o.enabled) || null;
  for (const o of ev.options) o.primary = o === pick;
  delete ev.noPrimary;
  return ev;
}
const SAFE_IDS = ['ok', 'done', 'pass', 'skip'];
const netLabel = (n) => (n > 0 ? `${sgn(n)} בחודש` : `בסוף החודש: ${fmtM(n)}`);

/** Loan needed to pay `amount` now, and whether the bank allows it. */
function loanFor(st, amount) {
  const short = Math.max(0, amount - st.cash);
  const unit = autoUnit(st);
  const need = Math.ceil(short / unit) * unit;
  return { need, ok: need === 0 || st.loans + need <= loanCap(st), monthly: Math.round((need * loanPct(st)) / 100) };
}

/* ---------------------------------------------------------------- v3 describe helpers */
const lifeS = (st) => Math.max(baseNet(st), 3000);
/** How much to move into the emergency fund now: up to 3 months of expenses, keeping 1 month of expenses in cash. */
function saveSuggestion(st) { const e = expensesOf(st); const want = 3 * e - st.savings; const free = st.cash - e; return want > 0 && free > 0 ? r100(Math.min(want, free)) : 0; }
/** Plan options for the payday / education cards: ok = keep the current plan; plan:<id> for the others. */
function planOptions(st) {
  const L = st.life; const sug = suggestPlan(st);
  const o = [opt('ok', `להמשיך: ${PLANS[L.plan].label}`, true, { kind: 'plan', plan: L.plan, effects: planEffects(st, L.plan), primary: sug === L.plan })];
  for (const id of PLAN_IDS) if (id !== L.plan && planAllowed(st, id)) o.push(opt('plan:' + id, PLANS[id].label, true, { kind: 'plan', plan: id, effects: planEffects(st, id), primary: sug === id }));
  return o;
}
/** This month's preview for a plan: take-home (net + side − tuition), energy and happiness change. */
function planEffects(st, id) {
  const L = st.life; const P = PLANS[id];
  const ps = payslipOf(st, id); const cur = payslipOf(st);
  const take = ps.net + ps.sideIncome - ps.studyCost; const take0 = cur.net + cur.sideIncome - cur.studyCost;
  const load = (id === 'work' || id === 'overtime') ? L.workLoad * 4 : 0;
  return { net: take, netDelta: take - take0, gross: ps.gross, incomeTax: ps.incomeTax, energy: P.energy - load, happiness: P.happiness, note: P.desc };
}
/** The smart default: rest when tired, study early, otherwise normal work (never overtime/side — those are the player's call). */
function suggestPlan(st) {
  const L = st.life;
  if (L.energy < 40) return 'rest';
  if (L.plan === 'rest' && L.energy < 70) return 'rest';
  if (!L.study.done && L.energy >= 55 && st.month <= Math.min(24, st.maxMonths / 2) && !st.history) return 'study';
  return L.plan === 'study' && !L.study.done ? 'study' : 'work';
}
function negChance(st, p, k) {
  const base = { 5: 0.8, 10: 0.55, 15: 0.3 }[k] || 0.3;
  return clamp(base * (p.golden ? 0.4 : 1) + (st.life.peek ? 0.1 : 0), 0.05, 0.95);
}
function autoAmount(st) { const m = metrics(st); return Math.max(0, r100(Math.min(m.cashflow, m.salary * 0.1))); }
function carLine(st) { return st.expenses.find((x) => /רכב|ליסינג|טנדר/.test(x.label)); }
function rentLine(st) { return st.expenses.find((x) => /שכירות|משכנתא/.test(x.label)) || st.expenses.slice().sort((a, b) => b.amount - a.amount)[0]; }
/** ₪ / happiness / energy consequences of one life-event option (previewed on the card). */
function lifeEffects(st, E, o) {
  const S = lifeS(st); const L = st.life;
  const e = { cash: o.cash ? r100(o.cash * S) : 0, monthly: o.monthly ? r10(o.monthly * S) : 0, months: o.months ?? 0, happiness: (o.happiness || 0) + (o.glow ? o.glow : 0), energy: o.energy || 0, glow: o.glow || 0, note: o.note || '' };
  if (o.carCut) { const c = carLine(st); e.monthly = c ? -r10(c.amount * o.carCut) : 0; e.months = 0; if (!c) e.note = 'אין לך רכב בתקציב — אז אין מה לחסוך.'; }
  if (o.grossMult) { const g0 = grossBase(st); e.salary = slip(r10(g0 * o.grossMult), taxPoints(st)).net - baseNet(st); }
  if (o.jobless) { e.months = o.jobless; e.salary = -r10(baseNet(st) * 0.4); }
  if (o.severance === 'withdraw') e.cash += Math.round(L.severance);
  if (o.friend === 'guarantee') e.risk = r100(1.5 * S);
  if (o.study) e.study = o.study;
  return e;
}

const DESCRIBE = {
  payday(st, p, ev) {
    const pd = p.pd || { amount: 0, salary: 0, passive: 0, expenses: 0, month: st.month };
    const w = W(st);
    ev.title = 'קיבלת משכורת';
    ev.text = `משכורת ${fmtM(pd.salary)}, הכנסה פסיבית ${sgn(pd.passive)}, הוצאות ${fmtM(-pd.expenses)}.`;
    ev.data = { ...pd, cashflow: pd.amount };
    const ratio = pd.expenses ? pd.passive / pd.expenses : 0;
    ev.mentor = w.goal.type === 'passive'
      ? (pd.passive <= 0 ? mentorLine(st, 'payday0', {}) : mentorLine(st, 'paydayN', { pct: Math.round(ratio * 100) + '%' }))
      : mentorLine(st, 'paydayNW', { nw: fmtM(netWorthOf(st)), target: fmtM(w.goal.target) });
    // v3: the monthly plan (time & energy) + a raise request
    const L = st.life;
    ev.text += pd.burnout ? ` נשחקת החודש: בלי משכורת, והוצאות רפואיות של ${fmtM(pd.medical)}.` : '';
    Object.assign(ev.data, { plan: L.plan, planLabel: PLANS[L.plan].label, payslip: payslipOf(st), energy: Math.round(L.energy), happiness: Math.round(happyNow(st)), burnout: !!pd.burnout, creditScore: L.creditScore });
    ev.options = planOptions(st);
    const save = saveSuggestion(st);
    if (save > 0) ev.options.push(opt('save', `להעביר ${fmtM(save)} לקרן החירום`, true, { kind: 'save', amount: save, effects: { months: round2(emergencyOf(st, expensesOf(st)).months + save / Math.max(1, expensesOf(st))) } }));
    if (raiseEligible(st)) { const ch = raiseChance(st); ev.options.push(opt('raise', `לבקש העלאה (סיכוי ${Math.round(ch * 100)}%)`, true, { kind: 'raise', chance: round2(ch) })); ev.data.raiseChance = round2(ch); }
    if (pd.burnout) ev.mentor = mentorLine(st, 'burnout', {}) || ev.mentor;
    else if (L.energy < 35 || st.stats.paydays % 3 === 1) ev.mentor = mentorLine(st, 'planAsk', {}) || ev.mentor;
    ev.sound = pd.burnout ? 'loss' : 'coin';
  },

  edu(st, p, ev) {
    const L = st.life; const S = lifeS(st);
    ev.title = 'לימודים וקריירה'; ev.text = 'איך תשקיע את הזמן שלך בחודשים הקרובים? אפשר גם קורס קצר שמקרב את ההעלאה.';
    ev.mentor = mentorLine(st, 'planAsk', {});
    const cost = r100(0.5 * S);
    ev.data = { plan: L.plan, energy: Math.round(L.energy), studyProgress: L.study.done ? 1 : round2(L.study.months / L.study.need), courseCost: cost, ...shortfallInfo(st, cost) };
    ev.options = planOptions(st);
    if (!L.study.done) ev.options.splice(ev.options.length, 0, opt('course', `קורס ערב קצר: ${fmtM(cost)} (+2 חודשי לימוד)`, true, { kind: 'course', effects: { cash: -cost, energy: -4, happiness: 0, note: 'מקרב את סוף הלימודים בלי לשנות תוכנית.' } }));
  },

  tax(st, p, ev) {
    const L = st.life; const T = st.taxes;
    const refund = Math.round(L.taxRefund), bill = Math.round(L.sideTaxDue);
    const paid = T.income + T.bl; const grossIn = Math.max(1, (st.stats.paydays || 1) * grossBase(st));
    ev.title = 'מס הכנסה — תיאום שנתי'; ev.text = 'פעם בשנה עושים סדר: מקבלים בחזרה מס ששולם ביותר, ומשלמים על הכנסות שלא דווחו.';
    ev.mentor = mentorLine(st, 'taxAsk', {});
    ev.data = { refund, bill, net: refund - bill, taxes: { ...T }, paidTotal: Math.round(paid), effectiveRate: round2(paid / grossIn * 100), ...shortfallInfo(st, Math.max(0, bill - refund)) };
    const label = refund && bill ? `לקבל החזר ${fmtM(refund)} ולשלם ${fmtM(bill)}` : refund ? `לקבל החזר ${fmtM(refund)}` : bill ? `לשלם ${fmtM(bill)}` : 'המשך';
    ev.options = [opt('ok', label, true, { primary: true })];
    if (!refund && !bill) { ev.auto = true; ev.toastText = mentorLine(st, 'taxNone', { paid: fmtM(paid), rate: pct(ev.data.effectiveRate, 1) }) || 'אין חוב ואין החזר מס.'; }
  },

  business(st, p, ev) {
    if (p.mode === 'offer') {
      const A = BIZ.ARCHETYPES[p.typeId]; const b = BIZ.create(p.typeId, { month: st.month });
      const f = BIZ.forecast(b, BIZ.suggest(b).decisions, 3); const be = BIZ.breakEven(b);
      const L = loanFor(st, A.startCapital); const monthly = Math.round(f.netProfit / 3);
      ev.title = A.name; ev.text = A.desc; ev.mentor = A.lesson;
      ev.data = { mode: 'offer', typeId: p.typeId, startCapital: A.startCapital, breakEven: be, forecast3: { netProfit: f.netProfit, cashChange: f.cashChange, lines: f.reports[0].lines }, ownerEnergy: A.ownerEnergy, managerEnergy: A.managerEnergy, model: A.model, archetype: { name: A.name, short: A.short, icon: A.icon, unit: A.unit, mode: A.mode, price: A.price }, ...shortfallInfo(st, A.startCapital) };
      ev.options = [opt('start', L.need ? `לפתוח (${fmtM(A.startCapital)}, הלוואה ${fmtM(L.need)})` : `לפתוח ב־${fmtM(A.startCapital)}`, L.ok, { kind: 'buy', net: monthly - L.monthly, netLabel: `רווח צפוי בעסק: ${sgn(monthly)} בחודש`, loanAmount: L.need, loanMonthly: L.monthly, reason: L.ok ? undefined : CAP_REASON }), opt('pass', 'לא עכשיו')];
      const buyOk = L.ok && !L.need && f.netProfit > 0 && st.cash - A.startCapital >= expensesOf(st) * 3;
      (buyOk ? ev.options[0] : ev.options[1]).primary = true;
      if (!L.ok) { ev.auto = true; ev.toastText = `${A.short}: עוד אין לך ${fmtM(A.startCapital)} לפתוח עסק כזה.`; }
      return;
    }
    const a = st.assets.find((x) => x.id === p.assetId); const b = a.biz;
    const o = BIZ.decisionOptions(b); const sm = BIZ.summary(b);
    ev.title = `העסק שלך: ${a.n}`; ev.text = a.bizHeadline || 'זמן להחליט: מחיר, עובדים, שיווק, משיכה — או למכור.'; ev.mentor = o.suggest.why[0];
    const base3 = BIZ.forecast(b, null, 3).netProfit;
    ev.data = { mode: 'manage', assetId: 'a' + a.id, summary: sm, options: { ...o, suggest: undefined }, why: o.suggest.why, forecast3: base3, lastResult: st.flags['bz_' + p.id] || null };
    const mk = (id, label) => { const d = bizDecision(b, id); if (!d || !Object.keys(d).length) return null; const r = BIZ.applyDecisions(b, d); if (!r.ok) return opt('biz:' + id, label, false, { kind: 'biz', reason: r.errors[0] }); const f = BIZ.forecast(r.business, null, 3).netProfit; return opt('biz:' + id, label, true, { kind: 'biz', decisions: d, cashNeeded: r.cashNeeded, effects: { netProfit3: f, delta3: f - base3, energy: -BIZ.ownerEnergy(r.business), note: '' } }); };
    const wage = fmtM(o.manager.wage);
    ev.options = [
      mk('suggest', `ההמלצה: ${o.suggest.why[0]}`),
      mk('manager', b.manager ? 'לפטר את המנהל ולחזור לעבוד בעסק' : `לשכור מנהל (${wage} בחודש) — העסק הופך לפסיבי`),
      mk('price:up', `להעלות מחיר ל־${fmtP(o.price.steps.find((x) => x.pct === 10).price)}`), mk('price:down', `להוריד מחיר ל־${fmtP(o.price.steps.find((x) => x.pct === -10).price)}`),
      mk('mkt:up', 'יותר שיווק'), mk('mkt:down', 'פחות שיווק'), mk('hire', `לגייס עובד (${fmtM(o.staff.wage)} בחודש)`), mk('fire', 'לפטר עובד'),
      mk('draw:up', 'למשוך יותר לכיס'), mk('draw:down', 'למשוך פחות (להשאיר כרית בעסק)'), mk('order', 'להזמין מלאי'), mk('expand', o.expand ? `${o.expand.label} (${fmtM(o.expand.cost)})` : ''),
      opt('biz:sell', `למכור את העסק: ${fmtM(o.sell.net)} אחרי מס`, true, { kind: 'sell', sale: { price: o.sell.price, net: o.sell.net, tax: o.sell.tax, text: o.sell.text } }),
      opt('ok', 'המשך', true),
    ].filter(Boolean);
    const sgo = !st.flags['bz_' + p.id] && ev.options.find((x) => x.id === 'biz:suggest' && x.enabled); // one suggestion per visit, then "המשך"
    (sgo || ev.options.find((x) => x.id === 'ok')).primary = true;
  },

  life(st, p, ev) {
    const E = LIFE_EVENTS.find((e) => e.id === p.eventId);
    ev.title = E.title; ev.text = E.text; ev.mentor = mentorLine(st, 'lifeAsk', {});
    ev.data = { eventId: E.id, kind: E.id, cash: st.cash };
    ev.options = E.options.map((o) => {
      const eff = lifeEffects(st, E, o);
      const L = loanFor(st, Math.max(0, -eff.cash));
      return opt(o.id, o.label, true, { kind: 'life', effects: eff, loanAmount: L.need, loanMonthly: L.monthly, chance: o.chance });
    });
    let pick = ev.options.find((o) => o.id === E.primary);
    if (pick && pick.loanAmount) pick = ev.options.filter((o) => !o.loanAmount).sort((a, b) => b.effects.cash - a.effects.cash)[0] || pick;
    if (pick) pick.primary = true;
    ev.sound = 'card';
  },

  deal(st, p, ev) {
    const w = W(st); const c = p.card; const kind = w.kinds[c.k] || {};
    const debt = c.cost - c.down; const value = c.value ?? c.cost;
    const proto = { k: c.k, noi: c.noi, cf: c.cf, debt, sens: c.sens, ref: st.world.usd };
    const cf = assetCf(st, proto);
    const roi = c.down ? (cf * 12 / c.down) * 100 : 0;
    ev.tag = 'הזדמנות · ' + (kind.label || '');
    ev.title = c.n; ev.text = c.d;
    ev.mentor = c.q || mentorLine(st, 'dealAsk', {});
    const loanYearlyPct = Math.round(loanPct(st) * 12);
    const d = ev.data = {
      kind: c.k, kindLabel: kind.label, debtLabel: kind.debtLabel || 'משכנתא', model: modelFor(st, c.k),
      name: c.n, cost: c.cost, down: c.down, debt, value, discount: value - c.cost, cf, roi: Math.round(roi), cash: st.cash,
      roiText: c.down ? `${fmtM(cf)} × 12 ÷ ${fmtM(c.down)} = ${Math.round(roi)}% בשנה` : '',
      impact: c.impact || 0, golden: !!p.golden, grow: c.grow || 0, loanYearlyPct,
      rentTax: isRent(st, proto) ? rentTaxOf(st, grossRent(st, proto)) - rentTaxOf(st) : 0, negotiated: p.negotiated || null,
      yield: isRent(st, proto) && c.cost > 0 ? reYield(st, c, proto) : null,
    };
    // a buy option: label + the ONE number that matters (cashflow after the cost of any loan it needs)
    const buyOpt = (id, text, amount, optCf) => {
      const L = loanFor(st, amount); const net = optCf - L.monthly;
      const label = L.need ? `הלוואה ${fmtM(L.need)} ו${text}` : (id === 'buy' && w.mechanic !== 'fx' ? `לקנות ב־${fmtM(amount)}` : `${text} ב־${fmtM(amount)}`);
      return opt(id, label, L.ok, { kind: 'buy', net, netLabel: netLabel(net), loanAmount: L.need, loanMonthly: L.monthly, reason: L.ok ? undefined : CAP_REASON });
    };
    if (w.mechanic === 'rate' && c.noi != null && debt > 0) {
      const fr = round2(st.world.rate + w.rate.fixedPremium);
      const cfFix = assetCf(st, { ...proto, fixedRate: fr });
      Object.assign(d, { rate: st.world.rate, fixedRate: fr, cfVar: cf, cfFix, cfAt: [2, 4, 6, 8].map((r) => ({ rate: r, cf: assetCf(st, { ...proto, fixedRate: r }) })), roiFix: Math.round((cfFix * 12 / c.down) * 100) });
      const ov = buyOpt('buyVar', `ריבית משתנה ${pct(st.world.rate, 2)}`, c.down, cf);
      const of = buyOpt('buyFix', `ריבית קבועה ${pct(fr, 2)}`, c.down, cfFix);
      ov.label = `${ov.loanAmount ? 'הלוואה ' + fmtM(ov.loanAmount) + ' + ' : ''}ריבית משתנה ${pct(st.world.rate, 2)} (${ov.netLabel})`;
      of.label = `${of.loanAmount ? 'הלוואה ' + fmtM(of.loanAmount) + ' + ' : ''}ריבית קבועה ${pct(fr, 2)} (${of.netLabel})`;
      d.netVar = ov.net; d.netFix = of.net;
      ev.options = [ov, of, opt('pass', 'לוותר')];
    } else if (w.mechanic === 'fx' && c.sens) {
      const fee = hedgeFee(st, { value: c.value ?? c.cost, sens: c.sens });
      const val = c.value ?? c.cost;
      Object.assign(d, { sens: c.sens, usd: st.world.usd, hedgeFee: fee, hedgeMonths: w.fx.hedgeMonths, usdLinked: !!c.usdLinked,
        cfAtUsd: [-0.5, 0, 0.5].map((dx) => ({ usd: round2(st.world.usd + dx), cf: r10(cf * (1 + c.sens * (dx / st.world.usd))), value: Math.round(c.usdLinked ? val * (st.world.usd + dx) / st.world.usd : val * (1 + c.sens * w.fx.valueSens * dx / st.world.usd)) })) });
      const ob = buyOpt('buy', 'קנייה', c.down, cf); const oh = buyOpt('buyHedge', 'קנייה עם גידור', c.down + fee, cf);
      oh.label += ` (גידור ${fmtM(fee)})`;
      ev.options = [ob, oh, opt('pass', 'לוותר')];
    } else {
      ev.options = [buyOpt('buy', 'קנייה', c.down, cf), opt('pass', 'לוותר')];
    }
    const best = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((a, b) => b.net - a.net)[0];
    const first = ev.options.find((o) => o.kind === 'buy');
    d.loanNeeded = first.loanAmount; d.loanMonthly = first.loanMonthly; d.net = first.net; d.netLabel = first.netLabel;
    d.roiVsLoan = first.loanAmount
      ? `תשואה ${Math.round(roi)}% בשנה מול הלוואה שעולה ${loanYearlyPct}% בשנה — ${roi > loanYearlyPct ? 'ההלוואה משתלמת' : 'ההלוואה עולה יותר ממה שהנכס מכניס'}`
      : `תשואה ${Math.round(roi)}% בשנה, בלי הלוואה`;
    // smart default: buy only when it adds money every month (and, in net-worth worlds, is not overpriced / declining)
    const nwOk = w.goal.type === 'passive' || ((value - c.cost) + (c.grow || 0) * value * 24 >= 0 && (value >= c.cost || cf * 24 >= c.cost - value));
    if (best && best.net > 0 && nwOk) {
      let pick = best;
      if (w.mechanic === 'fx' && c.sens) { const hedgeNow = (c.sens < 0 && st.world.usd <= w.fx.ref) || (c.sens > 0 && st.world.usd >= w.fx.ref); const oh = ev.options.find((o) => o.id === 'buyHedge'); if (hedgeNow && oh.enabled && oh.net > 0) pick = oh; else pick = ev.options.find((o) => o.id === 'buy' && o.enabled) || best; }
      pick.primary = true;
    } else ev.options.find((o) => o.id === 'pass').primary = true;
    if (!best) { ev.auto = true; ev.toastText = `${c.n}: עוד אין לך מספיק הון, והבנק לא מממן עסקה כזו.`; }
    // v3 negotiation: offer less; the seller's answer was sealed when the card was drawn (p.negR)
    if (best && !p.negotiated && p.negR != null && c.cost > 0) {
      const offers = [5, 10, 15].map((k) => { const ch = negChance(st, p, k); const saved = r100(c.cost * k / 100); return opt('offer:' + k, `להציע ${k}% פחות (${fmtM(saved)}) · סיכוי ${Math.round(ch * 100)}%`, true, { kind: 'offer', chance: round2(ch), saved }); });
      ev.options.splice(ev.options.length - 1, 0, ...offers);
    }
    if (c.usdLinked) d.usdLinked = true;
    ev.sound = p.golden ? 'golden' : 'card';
  },

  trade(st, p, ev) {
    const w = W(st); const t = w.tickers[p.tk]; const h = st.holdings[p.tk]; const price = st.prices[p.tk];
    const maxBuy = price > 0 ? Math.floor(st.cash / price) : 0;
    ev.tag = p.source === 'market' ? (w.tiles.M ? w.tiles.M.name : 'שוק') : 'הזדמנות';
    if (p.source === 'market') { ev.color = w.tiles.M.color; ev.ink = w.tiles.M.ink; }
    ev.title = p.title; ev.text = p.text;
    ev.mentor = st.flags['tm_' + p.id] || mentorLine(st, 'trade_' + p.tk, { div: fmtP(t.div || 0) }) || mentorLine(st, 'tradeAsk', {});
    const cn = coinName(st, p.tk); const dead = cn && !st.world.coin.alive;
    ev.data = {
      ticker: p.tk, name: cn ? `${cn} · קריפטו` : t.name, unit: t.unit || 'מניות', kind: t.kind || 'stock', price, qty: h.qty, holdingValue: Math.round(h.qty * price),
      avg: h.qty ? h.basis / h.qty : 0, cash: st.cash, maxBuy: dead ? 0 : maxBuy, maxSell: h.qty, div: t.div || 0, step: t.step || [10, 100],
      model: t.model || null, lastResult: st.flags['tr_' + p.id] || null,
      taxRate: TAX.capGains, unrealizedGain: Math.round(h.qty * price - h.basis), lossCarry: Math.round(st.life.lossCarry),
    };
    if (p.tk === 'IDX') Object.assign(ev.data, { pension: Math.round(st.life.pension), autoInvest: st.life.autoInvest, history: (st.life.idxHist || []).slice(-24), index: true });
    if (cn) { ev.data.coinAlive = !dead; if (p.wiped) ev.data.wiped = p.wiped; }
    if (cn && p.wiped && !st.flags['tm_' + p.id]) ev.mentor = tpl(W(st).crypto.texts.wipedMentor, { qty: groups(p.wiped.qty), old: p.wiped.oldName, coin: cn });
    else if (dead && !st.flags['tm_' + p.id]) ev.mentor = mentorLine(st, 'cryptoDead', {}) || ev.mentor;
    ev.options = [
      opt('buy', 'לקנות', !dead && maxBuy > 0, { needsQty: true, max: dead ? 0 : maxBuy, reason: dead ? 'המטבע מת — אי אפשר לקנות' : maxBuy > 0 ? undefined : 'אין מספיק מזומן' }),
      opt('sell', 'למכור', h.qty > 0, { needsQty: true, max: h.qty, reason: h.qty > 0 ? undefined : 'אין לך מה למכור' }),
      opt('done', 'סיום', true, { primary: true }),
    ];
    if (p.tk === 'IDX') {
      const amt = autoAmount(st);
      if (!st.life.autoInvest) ev.options.splice(2, 0, opt('auto:on', `הוראת קבע לקרן: ${fmtM(amt)} בחודש`, amt > 0, { kind: 'auto', amount: amt, reason: amt > 0 ? undefined : 'אין כרגע תזרים פנוי' }));
      else ev.options.splice(2, 0, opt('auto:off', `לבטל את הוראת הקבע (${fmtM(st.life.autoInvest)} בחודש)`, true, { kind: 'auto', amount: 0 }));
      if (p.source === 'index') ev.mentor = st.flags['tm_' + p.id] || mentorLine(st, 'indexAsk', {}) || ev.mentor;
    }
  },

  doodad(st, p, ev) {
    const c = p.card; const w = W(st);
    const need = !!c.need;
    ev.tag = need ? (w.needTag || 'הוצאה הכרחית') : ev.tag;
    ev.title = c.n; ev.text = c.d || (need ? 'אין ברירה — את זה חייבים לשלם.' : 'אף אחד לא מכריח אותך.'); ev.mentor = c.q || mentorLine(st, need ? 'needAsk' : 'doodadAsk', {});
    ev.data = { amount: c.a, need, cash: st.cash, installment: c.inst ? Math.round(c.a * w.creditPct / 100) : null, sub: c.sub || null, ...shortfallInfo(st, c.a) };
    ev.options = [opt('pay', ev.data.shortfall ? `לשלם ${fmtM(c.a)} (הלוואה ${fmtM(ev.data.loanAmount)})` : `לשלם ${fmtM(c.a)}`, true, { primary: need })];
    if (c.inst) ev.options.push(opt('credit', `בתשלומים (${fmtM(ev.data.installment)} בחודש, ${w.creditPct}% ריבית)`));
    if (c.sub) ev.options.push(opt('sub', `מנוי: ${fmtM(c.sub)} בחודש, לתמיד`));
    if (!need) ev.options.push(opt('skip', 'לוותר', true, { primary: true }));
    ev.sound = need ? 'loss' : 'card';
  },

  market(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d; ev.options = [opt('ok', 'המשך', true, { primary: true })];
    const d = ev.data = { kind: c.k };
    if (c.k === 'sell') {
      const own = st.assets.filter((a) => (Array.isArray(c.type) ? c.type.includes(a.k) : a.k === c.type));
      // offers follow today's value and cashflow: a money-losing asset never gets a premium
      d.offers = own.map((a) => { if (a.biz) { const v = BIZ.valuation(a.biz); const offer = Math.round(v.price * c.mult) + v.cash + v.receivables; const tax = IV.capitalGainsTax({ cost: a.biz.invested, proceeds: offer, mode: 'nominal' }).tax; return { assetId: 'a' + a.id, name: a.n, offer, debt: 0, tax, netAfterTax: offer - tax, net: offer - tax, profit: offer - tax - a.biz.invested, cf: a.bizDraw || 0, managed: true }; }
        const acf = assetCf(st, a); const offer = Math.round(assetValue(st, a) * (acf > 0 ? c.mult : Math.min(c.mult, 1) * 0.85)); const tax = IV.capitalGainsTax({ cost: a.cost, proceeds: offer, mode: 'nominal' }).tax; return { assetId: 'a' + a.id, name: a.n, offer, debt: a.debt, tax, netAfterTax: offer - a.debt - tax, net: offer - a.debt - tax, profit: offer - a.debt - tax - a.down, cf: acf }; });
      ev.options = [...d.offers.map((o) => opt('sell:' + o.assetId.slice(1), `למכור את ${o.name} · ${sgn(o.net)}`, o.net >= 0 || st.cash + o.net >= 0, { kind: 'sell', reason: o.net >= 0 || st.cash + o.net >= 0 ? undefined : 'החוב גדול מההצעה' })), opt('done', 'סיום', true, { primary: true })];
      ev.mentor = own.length ? mentorLine(st, 'sellAsk', {}) : mentorLine(st, 'sellNone', {});
      if (!own.length) { ev.auto = true; ev.toastText = `${c.n} — אין לך נכסים מהסוג הזה למכור.`; }
    } else if (c.k === 'repair') {
      const n = st.assets.filter((a) => a.k === c.type).length; d.count = n; d.amount = -n * c.amt; Object.assign(d, shortfallInfo(st, n * c.amt));
      ev.mentor = n ? mentorLine(st, 'repair', {}) : mentorLine(st, st.assets.length ? 'repairNoneOwn' : 'repairNone', {});
      ev.options = [opt('ok', n ? `לשלם ${fmtM(n * c.amt)}` : 'המשך', true, { primary: true })];
      if (!n) { ev.auto = true; ev.toastText = `${c.n} — לא נוגע אליך הפעם.`; }
    } else if (c.k === 'bonus') {
      d.amount = Math.round(st.assets.filter((a) => !a.biz && (!c.type || (Array.isArray(c.type) ? c.type.includes(a.k) : a.k === c.type))).reduce((s, a) => s + Math.max(0, assetCf(st, a)), 0) * (c.months || 1));
      d.boosted = st.assets.filter((a) => a.biz && (!c.type || (Array.isArray(c.type) ? c.type.includes(a.k) : a.k === c.type))).map((a) => 'a' + a.id);
      if (!d.amount && d.boosted.length) { d.amount = 0; ev.auto = false; }
      ev.mentor = d.amount ? mentorLine(st, 'bonus', {}) : mentorLine(st, 'bonusNone', {});
      if (!d.amount && !d.boosted.length) { ev.auto = true; ev.toastText = `${c.n} — הבונוס הולך לבעלי נכסים אחרים.`; }
    } else if (c.k === 'loss') {
      d.amount = -Math.round(st.assets.filter((a) => (Array.isArray(c.type) ? c.type.includes(a.k) : a.k === c.type)).reduce((s, a) => s + Math.max(0, assetCf(st, a)), 0) * (c.months || 1));
      ev.mentor = d.amount ? (c.q || mentorLine(st, 'lossKind', {})) : mentorLine(st, 'lossNone', {});
      Object.assign(d, shortfallInfo(st, -d.amount));
      if (!d.amount) { ev.auto = true; ev.toastText = `${c.n} — לא נוגע אליך הפעם.`; }
    } else if (c.k === 'div') {
      d.amount = Math.round(st.holdings[c.tk].qty * c.amt); d.ticker = c.tk;
      ev.mentor = d.amount ? mentorLine(st, 'div', {}) : mentorLine(st, 'divNone', { tk: c.tk });
      if (!d.amount) { ev.auto = true; ev.toastText = `${c.n} — אין לך ${c.tk}, הפעם זה לא בשבילך.`; }
    } else if (c.k === 'rate') {
      Object.assign(d, { from: p.from, to: p.to });
      ev.mentor = c.q || mentorLine(st, p.to > p.from ? 'rateUp' : 'rateDown', { rate: pct(p.to, 2) });
      ev.sound = p.to > p.from ? 'loss' : 'coin';
      if (!rateExposed(st)) { ev.auto = true; ev.toastText = `${c.n}: הריבית ${p.to > p.from ? 'עלתה' : 'ירדה'} ל־${pct(p.to, 2)}.`; }
    } else if (c.k === 'fx') {
      Object.assign(d, { from: p.from, to: p.to });
      ev.mentor = c.q || mentorLine(st, p.to > p.from ? 'usdUp' : 'usdDown', {});
      if (!usdExposed(st)) { ev.auto = true; ev.toastText = `${c.n}: הדולר ${p.to > p.from ? 'עלה' : 'ירד'} ל־${fmtP(p.to)}.`; }
    } else if (c.k === 'reval') {
      d.changed = (p.changed || []).map((x) => ({ assetId: 'a' + x.id, from: x.from, to: x.to }));
      d.valueChange = d.changed.reduce((s, x) => s + x.to - x.from, 0); // net-worth change only, no cash
      ev.mentor = c.q || mentorLine(st, d.changed.length ? (c.mult >= 1 ? 'revalUp' : 'revalDown') : 'revalNone', {});
      ev.sound = c.mult >= 1 ? 'coin' : 'loss';
      if (!d.changed.length) { ev.auto = true; ev.toastText = `${c.n} — לא נוגע אליך הפעם.`; }
    } else if (c.k === 'exitwave') {
      d.pulled = (p.pulled || []).map((id) => 'v' + id);
      ev.mentor = c.q || mentorLine(st, d.pulled.length ? 'exitwave' : 'exitwaveNone', {});
      if (!d.pulled.length) { ev.auto = true; ev.toastText = `${c.n} — אף סטארט־אפ שלך לא מבשיל עכשיו.`; }
    } else if (c.k === 'markdown') {
      d.marked = (p.marked || []).map((id) => 'v' + id);
      ev.mentor = c.q || mentorLine(st, d.marked.length ? 'markdown' : 'markdownNone', {});
      ev.sound = 'loss';
      if (!d.marked.length) { ev.auto = true; ev.toastText = `${c.n} — אין לך סטארט־אפים, הפעם זה עובר לידך.`; }
    } else if (c.k === 'match') {
      const opts = givingOptions(st, { ...c, eff: c.eff * 2, matched: true });
      d.match = true; d.eff = c.eff * 2; d.levels = opts.levels;
      ev.options = [...opts.options, opt('done', 'לא הפעם')];
      ev.mentor = c.q || mentorLine(st, 'match', {});
      const g0 = ev.options.find((o) => o.id === 'give:0'); if (g0 && g0.enabled && st.cash - opts.levels[0].amount >= expensesOf(st) * 2) g0.primary = true;
    } else if (c.k === 'cash') {
      d.amount = c.amount; ev.mentor = c.q || null;
    } else if (c.k === 'quiet') {
      ev.mentor = mentorLine(st, 'cryptoDead', {}); ev.auto = true; ev.toastText = c.n;
    }
  },

  crisis(st, p, ev) {
    const c = p.card; const w = W(st); const m = metrics(st);
    ev.title = c.n; ev.text = c.d;
    let amount = 0; const lines = [];
    if (c.noSalary) { amount += m.passive - m.expenses; lines.push({ label: 'החודש בלי משכורת: הוצאות פחות פסיבי', amount: m.passive - m.expenses }); }
    if (c.kindLoss) { const L = -st.assets.filter((a) => c.kindLoss.kinds.includes(a.k)).reduce((s, a) => s + Math.max(0, assetCf(st, a)), 0) * c.kindLoss.months; if (L) { amount += L; lines.push({ label: c.kindLoss.label, amount: L }); } }
    if (c.cash) { amount += c.cash; lines.push({ label: c.cashLabel || 'הוצאה', amount: c.cash }); }
    ev.data = { savings: st.savings, fundCovers: st.cash + st.savings + Math.round(amount) >= 0, amount: Math.round(amount), lines, expenses: m.expenses, passive: m.passive, gold: c.gold || 0, usd: c.usd || 0, angelMark: c.angelMark || null, ...shortfallInfo(st, -Math.round(amount)) };
    ev.mentor = c.q || mentorLine(st, 'crisisAsk', {});
    if (p.skipped) { ev.data = { amount: 0, lines: [], skipped: true, pay: 0, shortfall: 0, loanAmount: 0, loanMonthly: 0 }; ev.options = [opt('ok', 'פיו!', true)]; ev.auto = true; ev.toastText = `${c.n}? הפעם זה עבר לידך.`; ev.mentor = mentorLine(st, 'crisisSkipped', {}) || ev.mentor; return; }
    ev.options = [opt('ok', amount < 0 ? `לשלם ${fmtM(-amount)} ולהמשיך` : 'להמשיך', true, { primary: true })];
    if (c.gold && st.holdings.GOLD && st.holdings.GOLD.qty > 0) {
      const newPrice = Math.round(st.prices.GOLD * (1 + c.gold / 100));
      ev.data.goldAfter = newPrice;
      ev.options.push(opt('okSellGold', `לשלם ולמכור את כל הזהב ב־${fmtP(newPrice)}`, true));
    }
    ev.sound = 'loss';
  },

  mystery(st, p, ev) {
    const c = p.card; const w = W(st);
    ev.title = c.title; ev.text = c.text; ev.data = { kind: c.kind };
    ev.mentor = c.q || mentorLine(st, 'mysteryAsk', {});
    ev.options = [opt('ok', 'המשך', true, { primary: true })];
    if (c.kind === 'cash') { ev.data.amount = mysteryCash(st, c); Object.assign(ev.data, shortfallInfo(st, -ev.data.amount)); ev.sound = ev.data.amount >= 0 ? 'coin' : 'loss'; ev.options[0].label = ev.data.amount >= 0 ? `לקחת ${fmtM(ev.data.amount)}` : `לשלם ${fmtM(-ev.data.amount)}`; }
    if (c.kind === 'quiz') {
      ev.tag = 'שאלת אבא עשיר'; ev.data.reward = c.reward; ev.data.question = c.text;
      ev.options = c.answers.map((a, i) => opt('a' + i, a)); ev.noPrimary = true;
      ev.mentor = c.q || 'תחשוב רגע לפני שאתה עונה. התשובה הנכונה שווה כסף.';
    }
    if (c.kind === 'raise') { ev.data.amount = c.amount; ev.sound = 'coin'; }
    if (c.kind === 'expense') { ev.data.amount = c.amount; ev.sound = c.amount > 0 ? 'loss' : 'coin'; }
    if (c.kind === 'boost') { const a = bestAsset(st, c.kinds); ev.data.assetId = a ? 'a' + a.id : null; ev.data.amount = a ? c.cf : 0; ev.data.assetName = a ? a.n : null; if (!a) { ev.text = c.none; ev.auto = true; ev.toastText = c.none; } }
    if (c.kind === 'shares') { ev.data.ticker = c.tk; ev.data.qty = c.qty; ev.data.value = Math.round(c.qty * st.prices[c.tk]); }
    if (c.kind === 'impact') { ev.data.impact = c.impact; }
    if (c.kind === 'usd') { ev.data.delta = c.delta; }
  },

  bank(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d;
    const vars = st.assets.filter((a) => a.noi != null && a.debt > 0 && a.fixedRate == null);
    const fr = round2(st.world.rate + w.rate.fixedPremium);
    const debtVar = vars.reduce((s, a) => s + a.debt, 0);
    const fee = Math.round(debtVar * w.rate.refiFee / 100);
    const cfNow = vars.reduce((s, a) => s + assetCf(st, a), 0);
    const cfFix = vars.reduce((s, a) => s + assetCf(st, { ...a, fixedRate: fr }), 0);
    const loanDelta = Math.round(st.loans * (p.to - p.from) / 100);
    ev.data = { from: p.from, to: p.to, delta: round2(p.to - p.from), variableCount: vars.length, variableDebt: debtVar, fixedRate: fr, refiFee: fee, cfNow, cfIfFixed: cfFix, loanMonthlyDelta: loanDelta,
      monthlyImpact: r10(-debtVar * (p.to - p.from) / 1200) - loanDelta };
    ev.mentor = c.q || mentorLine(st, p.to > p.from ? 'rateUp' : p.to < p.from ? 'rateDown' : 'rateSame', { rate: pct(p.to, 2) });
    const L = loanFor(st, fee);
    ev.options = [opt('ok', 'המשך', true)];
    if (vars.length) ev.options.unshift(opt('refi', `לקבע ריבית ${pct(fr, 2)} לכל המשכנתאות (עמלה ${fmtM(fee)})`, L.ok, { reason: L.ok ? undefined : CAP_REASON }));
    const prepay = prepayTarget(st);
    if (prepay) ev.options.splice(ev.options.length - 1, 0, opt('prepay', `להקטין משכנתא ב־${fmtM(prepay.amount)} (${prepay.a.n})`, st.cash >= prepay.amount, { reason: st.cash >= prepay.amount ? undefined : 'אין מספיק מזומן' }));
    // smart default: lock when the rate is at/below its usual level and the fee is affordable from cash
    const refi = ev.options.find((o) => o.id === 'refi');
    if (refi && refi.enabled && p.to <= w.rate.lockBelow && st.cash >= fee) refi.primary = true;
    if (!vars.length && !prepay && !st.loans) { ev.auto = true; ev.toastText = `${c.n}: הריבית ${p.to > p.from ? 'עלתה' : p.to < p.from ? 'ירדה' : 'נשארה'} ${p.to === p.from ? '' : 'ל־'}${pct(p.to, 2)}.`; }
    ev.sound = p.to > p.from ? 'loss' : p.to < p.from ? 'coin' : 'card';
  },

  upgrade(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d; ev.mentor = c.q || mentorLine(st, 'upgradeAsk', {});
    const ups = upgradeOffers(st, c);
    const trims = trimOffers(st);
    ev.data = { contractor: c.n, upgrades: ups, trims };
    ev.options = [
      ...ups.map((u) => { const L = loanFor(st, u.cost); const net = u.gain - L.monthly; return opt('up:' + u.assetId.slice(1), `לשדרג ${u.name}: ${fmtM(u.cost)} → ${sgn(u.gain)} בחודש`, L.ok, { kind: 'buy', net, netLabel: netLabel(net), loanAmount: L.need, loanMonthly: L.monthly, payback: Math.ceil(u.cost / Math.max(1, u.gain)), reason: L.ok ? undefined : CAP_REASON }); }),
      ...trims.map((t) => { const L = loanFor(st, t.cost); const net = t.cut - L.monthly; return opt('trim:' + t.expenseId, `לקצץ "${t.label}": ${fmtM(t.cost)} → ${fmtM(-t.cut)} בחודש`, L.ok, { kind: 'buy', net, netLabel: netLabel(net), loanAmount: L.need, loanMonthly: L.monthly, payback: Math.ceil(t.cost / Math.max(1, t.cut)), reason: L.ok ? undefined : CAP_REASON }); }),
      opt('pass', 'לא עכשיו'),
    ];
    if (!ups.length) ev.mentor = mentorLine(st, 'upgradeNone', {});
    const bestUp = ev.options.filter((o) => o.kind === 'buy' && o.enabled && !o.loanAmount && o.payback <= 24).sort((a, b) => a.payback - b.payback)[0];
    if (bestUp) bestUp.primary = true;
    if (ev.options.length === 1) { ev.auto = true; ev.toastText = `${c.n} — אין מה לשדרג או לקצץ הפעם.`; }
  },

  fx(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d;
    const imp = st.assets.filter((a) => a.sens < 0 && !(a.hedge && a.hedge.until >= st.month));
    const exp = st.assets.filter((a) => a.sens > 0 && !(a.hedge && a.hedge.until >= st.month));
    const feeI = imp.reduce((s, a) => s + hedgeFee(st, a), 0), feeE = exp.reduce((s, a) => s + hedgeFee(st, a), 0);
    ev.data = { from: p.from, to: p.to, delta: round2(p.to - p.from), importers: imp.length, exporters: exp.length, hedgeFeeImporters: feeI, hedgeFeeExporters: feeE, hedgeMonths: w.fx.hedgeMonths, exposure: fxExposure(st), gold: st.prices.GOLD,
      exposureText: `${heCount(imp.length, 'יבואן', 'יבואנים')} לא מגודר${imp.length > 1 ? 'ים' : ''} · ${heCount(exp.length, 'יצואן', 'יצואנים')} לא מגודר${exp.length > 1 ? 'ים' : ''}` };
    const up = p.to > p.from;
    ev.mentor = c.q || mentorLine(st, p.to === p.from ? 'usdSame' : up ? 'usdUp' : 'usdDown', { usd: fmtP(p.to) });
    ev.options = [];
    if (imp.length) ev.options.push(opt('hedgeImp', `לגדר את היבוא על ${fmtP(p.to)} ל־${w.fx.hedgeMonths} חודשים (${fmtM(feeI)})`, loanFor(st, feeI).ok, { reason: loanFor(st, feeI).ok ? undefined : CAP_REASON }));
    if (exp.length) ev.options.push(opt('hedgeExp', `לגדר את היצוא על ${fmtP(p.to)} ל־${w.fx.hedgeMonths} חודשים (${fmtM(feeE)})`, loanFor(st, feeE).ok, { reason: loanFor(st, feeE).ok ? undefined : CAP_REASON }));
    ev.options.push(opt('ok', 'בלי גידור', true));
    // smart default: hedge the side that is exposed when the dollar sits on its good side (lock the good rate), paid from cash
    const hi = ev.options.find((o) => o.id === 'hedgeImp'), he = ev.options.find((o) => o.id === 'hedgeExp');
    if (hi && st.world.usd <= w.fx.ref && st.cash >= feeI) hi.primary = true;
    else if (he && st.world.usd >= w.fx.ref && st.cash >= feeE) he.primary = true;
    if (!imp.length && !exp.length && !usdExposed(st)) { ev.auto = true; ev.toastText = `${c.n}: הדולר ${p.to > p.from ? 'עלה' : p.to < p.from ? 'ירד' : 'נשאר'} ${p.to === p.from ? 'במקום' : 'ל־' + fmtP(p.to)}.`; }
    ev.sound = 'card';
  },

  shipping(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d; ev.mentor = c.q || mentorLine(st, 'shippingAsk', {});
    const insured = (st.world.insuredUntil || 0) >= st.month;
    const amt = shippingAmount(st, c, insured);
    ev.data = { kind: c.k, amount: amt, insured, insuredUntil: st.world.insuredUntil || 0, ...shortfallInfo(st, -amt) };
    const exposed = st.assets.some((a) => a.sens);
    if (c.k === 'insure') {
      const fee = insuranceFee(st, c);
      ev.data.fee = fee; ev.data.months = c.months;
      ev.options = [opt('insure', `לבטח את המשלוחים ל־${c.months} חודשים (${fmtM(fee)})`, loanFor(st, fee).ok, { primary: exposed && !insured && fee <= st.cash * 0.15 }), opt('ok', 'לוותר על ביטוח')];
      if (!exposed) { ev.auto = true; ev.toastText = `${c.n} — אין לך עדיין משלוחים לבטח.`; }
    } else {
      ev.options = [opt('ok', amt < 0 ? `לשלם ${fmtM(-amt)}` : amt > 0 ? `לקחת ${fmtM(amt)}` : 'המשך', true, { primary: true })];
      if (!amt && !(c.k === 'loss' && insured)) { ev.auto = true; ev.toastText = `${c.n} — לא נוגע אליך הפעם.`; }
    }
    ev.sound = amt < 0 ? 'loss' : amt > 0 ? 'coin' : 'card';
  },

  pitch(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d; ev.mentor = c.q || mentorLine(st, 'pitchAsk', {});
    const checks = w.angel.checks.map((x) => r100(x * (c.size || 1)));
    ev.data = { sector: c.sector, team: c.team, traction: c.traction, hype: c.hype, checks, revealHint: `${w.angel.revealMin}–${w.angel.revealMax} חודשים`, active: st.angels.filter((x) => x.status === 'active').length, odds: w.angel.oddsText };
    ev.options = [...checks.map((amt, i) => { const L = loanFor(st, amt); return opt('inv:' + i, `${['צ\'ק קטן', 'צ\'ק בינוני', 'צ\'ק גדול'][i]}: ${fmtM(amt)}${L.need ? ` (הלוואה ${fmtM(L.need)})` : ''}`, L.ok, { kind: 'buy', loanAmount: L.need, loanMonthly: L.monthly, reason: L.ok ? undefined : CAP_REASON }); }), opt('pass', 'לוותר')];
    // smart default: a small check on a quiet, solid team — only from cash you can spare
    const small = ev.options[0];
    if (small.enabled && !small.loanAmount && c.team + c.traction >= 4 && c.hype <= 2 && st.cash - checks[0] >= expensesOf(st) * 2) small.primary = true;
    if (!ev.options.some((o) => o.enabled && o.kind === 'buy')) { ev.auto = true; ev.toastText = `פיץ': ${c.n} — אין לך כרגע כסף להשקיע.`; }
  },

  giving(st, p, ev) {
    const w = W(st); const c = p.card;
    ev.title = c.n; ev.text = c.d; ev.mentor = c.q || mentorLine(st, 'givingAsk', {});
    const g = givingOptions(st, c);
    ev.data = { cause: c.n, eff: c.eff, levels: g.levels, pledge: g.pledge, impact: Math.floor(st.world.impact || 0), impactTarget: w.goal.impact };
    ev.options = [...g.options, opt('pass', 'לא הפעם')];
    const g0 = ev.options.find((o) => o.id === 'give:0');
    if (g0 && g0.enabled && c.eff >= 1 && st.cash - g.levels[0].amount >= expensesOf(st) * 2 && Math.floor(st.world.impact || 0) < w.goal.impact) g0.primary = true;
    if (!ev.options.some((o) => o.enabled && o.id !== 'pass')) { ev.auto = true; ev.toastText = `${c.n} — אין לך כרגע מה לתרום.`; }
  },
};

function givingOptions(st, c) {
  const w = W(st); const G = w.giving;
  const levels = G.levels.map((amt) => ({ amount: amt, impact: round2((amt / G.unit) * c.eff) }));
  const options = levels.map((l, i) => { const L = loanFor(st, l.amount); return opt('give:' + i, `לתרום ${fmtM(l.amount)} → +${l.impact} השפעה${L.need ? ` (הלוואה ${fmtM(L.need)})` : ''}`, L.ok, { kind: 'give', loanAmount: L.need, loanMonthly: L.monthly, reason: L.ok ? undefined : 'אין מספיק כסף, והבנק לא מממן תרומות כאלה' }); });
  let pledge = null;
  if (!c.matched && G.pledge) {
    pledge = { amount: G.pledge, impact: round2((G.pledge / G.unit) * c.eff * G.pledgeBoost) };
    options.push(opt('pledge', `הוראת קבע ${fmtM(G.pledge)} בחודש → +${pledge.impact} השפעה כל חודש`, true));
  }
  return { levels, options, pledge };
}

function rateExposed(st) { return st.loans > 0 || (st.holdings.AGAH && st.holdings.AGAH.qty > 0) || st.assets.some((a) => a.noi != null && a.debt > 0 && a.fixedRate == null); }
function usdExposed(st) { return !!st.salaryUsd || st.assets.some((a) => a.sens || a.usdLinked) || Object.keys(st.holdings).some((tk) => st.holdings[tk].qty > 0 && ['usd', 'gold'].includes(W(st).tickers[tk].kind)); }
/** Hebrew counting: heCount(1,'יבואן','יבואנים') → 'יבואן אחד'; 3 → '3 יבואנים'; 0 → 'אין יבואנים'. */
export function heCount(n, one, many, zero) { return n === 0 ? (zero || `אין ${many}`) : n === 1 ? `${one} אחד` : `${n} ${many}`; }
/** Hedge price for fx.hedgeMonths: a % of the asset's value per unit of FX sensitivity. */
function hedgeFee(st, a) { const w = W(st); return Math.max(1000, r100((a.value || 0) * Math.abs(a.sens || 0) * w.fx.hedgeCost)); }
function insuranceFee(st, c) { const ex = st.assets.filter((a) => a.sens).reduce((s, a) => s + Math.max(0, a.noi != null ? a.noi : a.cf), 0); return Math.max(c.minFee || 0, r100(ex * c.feeMonths)); }
function shippingAmount(st, c, insured) {
  const sum = (pred) => st.assets.filter(pred).reduce((s, a) => s + Math.max(0, assetCf(st, a)), 0);
  if (c.k === 'freight') return Math.round(sum((a) => a.k === 'ship') * c.shipMonths - sum((a) => a.sens < 0) * c.impMonths);
  if (c.k === 'loss') return insured ? 0 : -Math.round(sum((a) => !!a.sens) * c.months + (c.flat || 0));
  if (c.k === 'bonus') return Math.round(sum((a) => c.kinds.includes(a.k)) * c.months);
  if (c.k === 'cash') return c.amount;
  return 0;
}
function bestAsset(st, kinds) {
  const xs = st.assets.filter((a) => !kinds || kinds.includes(a.k));
  if (!xs.length) return null;
  return xs.reduce((b, a) => (assetCf(st, a) > assetCf(st, b) ? a : b));
}
function mysteryCash(st, c) { return c.amount ?? Math.round(r100(salaryNow(st) * (c.salaryMult || 0))); }
function prepayTarget(st) {
  const w = W(st);
  const xs = st.assets.filter((a) => a.noi != null && a.debt > 0);
  if (!xs.length) return null;
  const a = xs.reduce((b, x) => ((x.fixedRate ?? st.world.rate) > (b.fixedRate ?? st.world.rate) || ((x.fixedRate ?? st.world.rate) === (b.fixedRate ?? st.world.rate) && x.debt > b.debt) ? x : b));
  return { a, amount: Math.min(a.debt, w.rate.prepay) };
}
function upgradeOffers(st, c) {
  const w = W(st);
  return st.assets.filter((a) => (a.ups || 0) < w.upgrade.max && w.upgrade.kinds[a.k])
    .map((a) => { const u = w.upgrade.kinds[a.k]; const base = a.noi != null ? a.noi : Math.max(a.cf, 0); const cost = r100(a.cost * u.costPct * c.costMult); const gain = r10(Math.max(base, a.cost * 0.004) * u.gainPct * c.gainMult); return { assetId: 'a' + a.id, name: a.n, label: u.label, cost, gain, valueUp: Math.round(a.value * u.valuePct), roi: Math.round(gain * 12 / Math.max(cost, 1) * 100) }; })
    .sort((x, y) => y.gain / y.cost - x.gain / x.cost).slice(0, 3);
}
function trimOffers(st) {
  const w = W(st); if (!w.trim) return [];
  return st.expenses.filter((x) => x.trim && !x.cut).sort((a, b) => b.amount - a.amount).slice(0, 1)
    .map((x) => { const cut = r100(x.amount * w.trim.pct); return { expenseId: x.id, label: x.label, cut, cost: r100(cut * w.trim.costMonths) }; });
}

/* ============================================================ choose */
/**
 * Apply the player's decision on the current event.
 * @param event the event object from landing()/currentEvent() (only its id is checked) — may be null
 * @param optionId one of event.options[].id
 * @param params e.g. {qty} for trade buy/sell
 * @returns {ok, effects, mentor, toast, spawn, despawn, achievements, news, event, done, end, error?}
 */
export function choose(st, event, optionId, params = {}) {
  if (st.over) throw new Error('game over');
  const p = st.pending;
  if (!p) throw new Error('no pending event');
  if (event && event.id != null && event.id !== p.id) throw new Error('stale event ' + event.id + ' (pending ' + p.id + ')');
  const ev = describe(st);
  const o = ev.options.find((x) => x.id === optionId);
  if (!o) throw new Error('unknown option ' + optionId + ' for ' + p.type);
  const out = newOut();
  if (!o.enabled) return { ...out, ok: false, error: o.reason || 'האפשרות לא זמינה כרגע', event: ev, done: false, end: null };
  const cash0 = st.cash;
  const close = CHOOSE[p.type](st, p, o, params, out);
  if (out.ok === false) return { ...out, event: describe(st), done: false, end: null };
  act(st, params && params.qty != null ? ['c', optionId, Math.floor(Number(params.qty)) || 0] : ['c', optionId]);
  if (!ev.auto && !(p.type === 'payday' && o.id === 'ok') && !(o.id === 'done' && p.type === 'trade')) {
    logDecision(st, ev.title, p.type === 'trade' ? `${o.id === 'buy' ? 'קנה' : o.id === 'sell' ? 'מכר' : 'הוראת קבע'} ${Math.floor(Number(params.qty)) || ''}`.trim() : o.label.replace(/\s*\(.*\)$/, ''), decisionValue(st, p, o, out, cash0));
  }
  st.stats.maxLoans = Math.max(st.stats.maxLoans, st.loans);
  if (close) {
    st.pending = null; st.phase = 'roll';
    const end = checkEnd(st);
    if (end) finalize(st, end, out);
    return { ...out, event: null, done: true, end: end || null };
  }
  return { ...out, event: describe(st), done: false, end: null };
}

function finalize(st, end, out) {
  st.over = end.status; st.result = end; st.phase = 'over';
  ach(st, out, 'end', { end });
  end.achievements = st.ach.slice();
  sound(out, end.status === 'won' ? 'win' : 'lose');
  if (end.status === 'won') out.effects.push({ type: 'confetti' });
  out.mentor = end.status === 'won' ? mentorLine(st, 'won', {}) : end.reason === 'bankrupt' ? mentorLine(st, 'bankrupt', {}) : mentorLine(st, 'lostTime', { pct: Math.round(end.progress * 100) + '%' });
}

function buyAsset(st, p, out, o) {
  const w = W(st); const c = p.card;
  let fee = 0;
  if (o.id === 'buyHedge') fee = hedgeFee(st, { value: c.value ?? c.cost, sens: c.sens });
  const L = loanFor(st, c.down + fee);
  if (L.need) { st.loans += L.need; st.cash += L.need; st.stats.loansTaken += L.need; }
  st.cash -= c.down + fee;
  const a = addAsset(st, c, { fixed: o.id === 'buyFix', golden: p.golden, hedge: o.id === 'buyHedge' });
  if (fee) st.stats.hedges++;
  st.stats.deals++;
  const cf = assetCf(st, a);
  if (cf < 0) { st.stats.bad++; st.stats.badAssets++; }
  if (p.golden) st.stats.golden++;
  out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, a.k), label: sgn(cf) + ' לחודש', color: cf >= 0 ? 'green' : 'red', golden: !!p.golden });
  sound(out, p.golden ? 'golden' : 'buy');
  if (p.golden) out.effects.push({ type: 'sparkle', at: 'a' + a.id });
  cashFx(out, -(c.down + fee), null);
  const roi = c.down ? Math.round(cf * 12 / c.down * 100) : 0;
  const v = { cf: fmtM(cf), roi: roi + '%', loan: fmtM(L.need), loanCost: fmtM(L.monthly), rate: pct(a.fixedRate ?? st.world.rate ?? 0, 2), gain: fmtM((c.value ?? c.cost) - c.cost) };
  let line;
  if (c.after) line = tpl(c.after, v);
  else if (p.golden) line = mentorLine(st, 'buyGolden', v);
  else if (cf > 0) line = mentorLine(st, 'buyGood', v) + (L.need ? ' ' + mentorLine(st, 'buyWithLoan', v) : '');
  else if (cf < 0) line = mentorLine(st, 'buyBad', v);
  else line = mentorLine(st, 'buyZero', v);
  if (w.mechanic === 'rate' && a.noi != null && a.debt > 0) line = mentorLine(st, o.id === 'buyFix' ? 'buyFixed' : 'buyVariable', v) + ' ' + line;
  if (w.mechanic === 'fx' && c.sens) line = mentorLine(st, o.id === 'buyHedge' ? 'buyHedged' : c.sens < 0 ? 'buyImporter' : 'buyExporter', v);
  if (w.mechanic === 'fx' && (c.value ?? c.cost) > c.cost) line = mentorLine(st, 'buyDiscount', v) + ' ' + line;
  out.mentor = line.trim();
  lesson(st, out, 'asset_liability');
  if (L.need && cf - L.monthly > 0) lesson(st, out, 'good_debt');
  if (a.debt > 3 * Math.max(1, c.down)) lesson(st, out, 'leverage');
  if (isRent(st, a) && cf > 0 && rentTaxOf(st) > 0) lesson(st, out, 'rental_tax');
  if (new Set([...st.assets.map((x) => x.k), ...Object.keys(st.holdings).filter((tk) => st.holdings[tk].qty > 0)]).size >= 3) lesson(st, out, 'diversification');
  if (o.id === 'buyVar') lesson(st, out, 'rate_risk');
  if (c.sens) lesson(st, out, 'fx_risk');
  ach(st, out, 'buy', { asset: a, cf, golden: p.golden, loan: L.need });
}

/* ---------------------------------------------------------------- v3 choose helpers */
/** 25% capital-gains tax on a realised gain, with loss carry-forward. Returns the tax (whole ₪). */
function gainTax(st, gain, out) {
  const L = st.life;
  const r = IV.capitalGainsTax({ cost: 0, proceeds: gain, mode: 'nominal', lossCarry: L.lossCarry }); // invest.js: 25% + loss carry-forward
  if (gain > 0 && r.lossCarryOut < L.lossCarry) lesson(st, out, 'loss_offset');
  L.lossCarry = r.lossCarryOut;
  if (r.tax > 0) { st.taxes.capGains += r.tax; lesson(st, out, 'capital_gains'); }
  return r.tax;
}
function applyPlan(st, id, out) {
  const L = st.life;
  if (!PLANS[id] || !planAllowed(st, id) || L.plan === id) return false;
  L.plan = id;
  out.mentor = mentorLine(st, 'planSet', { plan: PLANS[id].label });
  out.plan = id;
  return true;
}
function askRaise(st, p, out) {
  const L = st.life; const ch = raiseChance(st);
  L.raiseAsks++; lesson(st, out, 'ask_raise');
  if ((p.raiseR ?? 1) < ch) {
    setGross(st, 1 + LIFE_CFG.raiseMult); L.raises++; L.lastRaise = st.month; L.happiness = clamp(L.happiness + 3, 0, 100);
    out.raise = { accepted: true, gross: grossBase(st) }; sound(out, 'coin');
    out.mentor = mentorLine(st, 'raiseYes', { gross: fmtM(grossBase(st)) });
  } else {
    L.lastRaise = st.month - (LIFE_CFG.raiseEvery - 6); L.happiness = clamp(L.happiness - 3, 0, 100);
    out.raise = { accepted: false }; sound(out, 'loss');
    out.mentor = mentorLine(st, 'raiseNo', {});
  }
}
function negotiate(st, p, k, o, out) {
  const L = st.life; const c = p.card; const accepted = p.negR < o.chance;
  L.peek = false;
  lesson(st, out, 'negotiation');
  if (!accepted) {
    L.negLosses++; out.negotiation = { accepted: false, pct: k };
    out.mentor = mentorLine(st, 'negNo', {}); sound(out, 'loss'); lesson(st, out, 'negotiation_fail');
    return true;
  }
  const f = k / 100; const val = c.value ?? c.cost;
  const downCut = r100(c.down * f); const debtCut = r100((c.cost - c.down) * f);
  c.value = val; c.cost -= downCut + debtCut; c.down -= downCut;
  if (c.cf != null && debtCut) c.cf += r10(debtCut * 0.005); // smaller mortgage ⇒ a bit more cash every month
  p.negotiated = { pct: k, saved: downCut + debtCut };
  L.negWins++; L.negSaved += downCut + debtCut;
  out.negotiation = { accepted: true, pct: k, saved: downCut + debtCut };
  out.mentor = mentorLine(st, 'negYes', { saved: fmtM(downCut + debtCut) }); sound(out, 'coin');
  return false;
}
function setAuto(st, amount, out) {
  st.life.autoInvest = Math.max(0, Math.round(amount || 0));
  out.mentor = st.life.autoInvest ? mentorLine(st, 'autoInvest', { amount: fmtM(st.life.autoInvest) }) : 'הוראת הקבע בוטלה.';
  if (st.life.autoInvest) lesson(st, out, 'dollar_cost');
}
function applyLife(st, p, E, o, eff, out) {
  const L = st.life; const S = lifeS(st);
  if (eff.cash) { st.cash += eff.cash; cashFx(out, eff.cash); sound(out, eff.cash > 0 ? 'coin' : 'loss'); }
  if (eff.monthly && !o.carCut) {
    if (E.id === 'moving') { const r = rentLine(st); if (r) r.amount = Math.max(0, r.amount + eff.monthly); }
    else st.expenses.push({ id: 'x' + st.nextId++, label: o.label2 || E.title, amount: eff.monthly, trim: false, cut: false, until: eff.months ? st.month + eff.months - 1 : null });
  }
  if (o.carCut) { const c = carLine(st); if (c) c.amount = Math.max(0, c.amount + eff.monthly); }
  if (o.happiness) L.happiness = clamp(L.happiness + o.happiness, 0, 100);
  if (o.energy) L.energy = clamp(L.energy + o.energy, 0, 100);
  if (o.glow) addGlow(st, o.glow);
  if (o.kid) { L.family.kids++; L.kidsBorn.push(st.month); lesson(st, out, 'kids_cost'); lesson(st, out, 'credit_points'); }
  if (o.married) { L.family.partner = 'married'; L.family.wedding = o.married; lesson(st, out, 'wedding'); }
  if (o.grossMult && !o.chance) { setGross(st, o.grossMult); L.workLoad += o.workLoad || 0; }
  if (o.chance) {
    if (p.r < o.chance) { setGross(st, o.grossMult); out.news.push({ kind: 'lifeNews', text: `הבוס לא רצה לאבד אותך: +${Math.round((o.grossMult - 1) * 100)}% ברוטו.` }); sound(out, 'coin'); }
    else { L.happiness = clamp(L.happiness - 2, 0, 100); out.news.push({ kind: 'lifeNews', text: 'הבוס אמר "אין תקציב השנה". לפחות עכשיו אתה יודע כמה אתה שווה בשוק.' }); }
  }
  if (E.id === 'jobOffer') lesson(st, out, 'job_offer');
  if (E.id === 'car') lesson(st, out, 'car_cost');
  if (E.id === 'reserve') lesson(st, out, 'reserve_duty');
  if (o.study && !L.study.done) { L.study.months = Math.min(L.study.need, L.study.months + o.study); if (L.study.months >= L.study.need) studyDone(st, out); }
  if (o.jobless) { L.jobless = { until: st.month + o.jobless - 1 }; lesson(st, out, 'unemployment'); }
  if (o.severance === 'withdraw') { const sev = Math.round(L.severance); L.pension = Math.max(0, L.pension - sev); L.severance = 0; }
  if (o.severance) lesson(st, out, 'severance');
  if (o.friend === 'lend') { L.friend = { kind: 'lend', amount: -eff.cash, at: st.month + 6, ok: p.r < 0.6 }; lesson(st, out, 'friend_loan'); }
  if (o.friend === 'guarantee') { L.friend = { kind: 'guarantee', amount: r100(1.5 * S), at: st.month + 6, ok: p.r >= 0.35 }; lesson(st, out, 'guarantor'); }
  L.events.push({ m: st.month, id: E.id, o: o.id });
  out.mentor = o.after || (eff.note ? `${o.label}: ${eff.note}` : null);
  if (eff.cash < 0) ensureCash(st, out, 'life');
}

const CHOOSE = {
  payday(st, p, o, params, out) {
    out.mentor = null;
    if (o.id === 'raise') { askRaise(st, p, out); return true; }
    if (o.id === 'save') { st.cash -= o.amount; st.savings += o.amount; cashFx(out, -o.amount, `${fmtM(o.amount)} לקרן החירום`); lesson(st, out, 'emergency_fund'); out.mentor = mentorLine(st, 'savingsIn', { months: String(emergencyOf(st, expensesOf(st)).months) }); return true; }
    if (o.id.startsWith('plan:')) applyPlan(st, o.id.slice(5), out);
    return true;
  },

  edu(st, p, o, params, out) {
    out.mentor = null;
    if (o.id === 'course') {
      const L = st.life; const cost = -o.effects.cash;
      st.cash -= cost; cashFx(out, -cost); sound(out, 'buy'); L.energy = clamp(L.energy - 4, 0, 100);
      L.study.months = Math.min(L.study.need, L.study.months + 2); out.toast = 'נרשמת לקורס: +2 חודשי לימוד';
      if (L.study.months >= L.study.need && !L.study.done) studyDone(st, out);
      ensureCash(st, out, 'edu');
      return true;
    }
    if (o.id.startsWith('plan:')) applyPlan(st, o.id.slice(5), out);
    return true;
  },

  tax(st, p, o, params, out) {
    const L = st.life; const refund = Math.round(L.taxRefund), bill = Math.round(L.sideTaxDue);
    const net = refund - bill;
    if (net) { st.cash += net; cashFx(out, net); sound(out, net > 0 ? 'coin' : 'loss'); }
    if (bill) st.taxes.side += bill;
    L.taxRefund = 0; L.sideTaxDue = 0;
    out.mentor = refund ? mentorLine(st, 'taxRefund', { amount: fmtM(refund) }) : bill ? mentorLine(st, 'taxBill', { amount: fmtM(bill) }) : null;
    if (refund) lesson(st, out, 'tax_refund');
    if (bill) lesson(st, out, 'side_tax');
    if (net < 0) ensureCash(st, out, 'tax');
    return true;
  },

  business(st, p, o, params, out) {
    if (p.mode === 'offer') {
      if (o.id === 'pass') { out.mentor = null; return true; }
      const A = BIZ.ARCHETYPES[p.typeId];
      const L = loanFor(st, A.startCapital); if (L.need) { st.loans += L.need; st.cash += L.need; st.stats.loansTaken += L.need; }
      st.cash -= A.startCapital;
      const a = addBusiness(st, p.typeId, p.seed);
      st.stats.deals++;
      out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, 'biz'), label: a.n, color: 'green' });
      cashFx(out, -A.startCapital); sound(out, 'buy');
      out.mentor = A.lesson; lesson(st, out, 'biz_owner_job');
      return true;
    }
    if (o.id === 'ok') { out.mentor = null; delete st.flags['bz_' + p.id]; return true; }
    const a = st.assets.find((x) => x.id === p.assetId);
    if (o.id === 'biz:sell') {
      const { sale } = BIZ.sell(a.biz);
      st.cash += sale.net; st.taxes.capGains += sale.tax; st.stats.sold++; st.stats.soldProfit += sale.net - a.biz.invested;
      st.assets = st.assets.filter((x) => x !== a); delete st.bizRng['a' + a.id];
      out.despawn.push('a' + a.id); cashFx(out, sale.net, '+' + fmtM(sale.net)); sound(out, 'sell');
      out.mentor = sale.text; out.tax = sale.tax; lesson(st, out, 'biz_valuation');
      return true;
    }
    let r = BIZ.applyDecisions(a.biz, o.decisions);
    if (!r.ok) { out.ok = false; out.error = r.errors[0]; return false; }
    if (r.cashNeeded > 0) { const inj = r.cashNeeded; r = BIZ.applyDecisions(a.biz, { ...o.decisions, inject: inj }); st.cash -= inj; cashFx(out, -inj, `הזרמה לעסק ${fmtM(inj)}`); ensureCash(st, out, 'business'); }
    a.biz = r.business;
    if (o.decisions.manager === true) lesson(st, out, 'biz_owner_job');
    sound(out, 'buy');
    out.mentor = `${o.label}. תחזית ל־3 חודשים: ${sgn(o.effects.netProfit3)} רווח נקי בעסק.`;
    st.flags['bz_' + p.id] = { action: o.id, changes: r.changes };
    return false;
  },

  life(st, p, o, params, out) {
    const E = LIFE_EVENTS.find((e) => e.id === p.eventId); const def = E.options.find((x) => x.id === o.id);
    applyLife(st, p, E, def, o.effects, out);
    return true;
  },

  deal(st, p, o, params, out) {
    if (o.id.startsWith('offer:')) return negotiate(st, p, +o.id.slice(6), o, out);
    if (o.id === 'pass') {
      const c = p.card; const cf = assetCf(st, { k: c.k, noi: c.noi, cf: c.cf, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd });
      out.mentor = mentorLine(st, cf < 0 ? 'passBad' : cf === 0 ? 'passZero' : 'passGood', {});
      ach(st, out, 'pass', { cf, golden: p.golden });
      return true;
    }
    buyAsset(st, p, out, o);
    return true;
  },

  trade(st, p, o, params, out) {
    const w = W(st); const t = w.tickers[p.tk]; const h = st.holdings[p.tk]; const price = st.prices[p.tk];
    if (o.id === 'done') { out.mentor = st.flags['tm_' + p.id] ? null : mentorLine(st, 'tradeDone', {}); delete st.flags['tm_' + p.id]; delete st.flags['tr_' + p.id]; return true; }
    if (o.id.startsWith('auto:')) { setAuto(st, o.id === 'auto:on' ? o.amount : 0, out); st.flags['tm_' + p.id] = out.mentor; return false; }
    const qty = Math.floor(Number(params.qty));
    const before = holdingKeys(st);
    if (o.id === 'buy') {
      const cost = Math.round(qty * price);
      if (!(qty >= 1) || cost > st.cash) { out.ok = false; out.error = 'כמות לא חוקית'; return false; }
      st.cash -= cost; h.qty += qty; h.basis += cost;
      h.lowBuy = h.lowBuy == null ? price : Math.min(h.lowBuy, price);
      if (p.tk === 'IDX') { const L = st.life; L.idxBuys++; if (L.idxSince == null) L.idxSince = st.month; lesson(st, out, 'index_fund'); if (st.month - L.lastCrash <= 3) lesson(st, out, 'buy_the_dip'); }
      sound(out, 'buy'); cashFx(out, -cost, null);
      out.toast = `קנית ${groups(qty)} ${t.unit || 'מניות'}`;
      out.mentor = mentorLine(st, t.div ? 'tradeBuyDiv' : 'tradeBuy_' + (t.kind || 'stock'), { qty: groups(qty), div: fmtM(qty * (t.div || 0)) }) || mentorLine(st, 'tradeBuy', { qty: groups(qty) });
      ach(st, out, 'tradeBuy', { tk: p.tk, qty, price });
    } else if (o.id === 'sell') {
      if (!(qty >= 1) || qty > h.qty) { out.ok = false; out.error = 'כמות לא חוקית'; return false; }
      const avg = h.basis / h.qty; const proceeds = Math.round(qty * price); const cut = Math.round(avg * qty); const gain = proceeds - cut;
      const tax = gainTax(st, gain, out);
      st.cash += proceeds - tax; h.basis = Math.max(0, h.basis - cut); h.qty -= qty;
      const low = h.lowBuy; if (!h.qty) { h.lowBuy = null; h.basis = 0; }
      st.stats.tradeProfit += gain - tax;
      if (p.tk === 'IDX' && gain < 0) { st.life.idxSold++; st.life.idxSoldLoss += -gain; lesson(st, out, 'panic_selling'); }
      sound(out, gain >= 0 ? 'sell' : 'loss'); cashFx(out, proceeds - tax, null);
      out.tax = tax;
      if (Math.abs(gain) >= 1) out.effects.push({ type: 'float', text: sgn(gain), color: gain >= 0 ? 'green' : 'red', at: 'pawn' });
      out.toast = `מכרת ${groups(qty)} ${t.unit || 'מניות'}`;
      out.mentor = Math.abs(gain) < 1 ? mentorLine(st, 'tradeSellEven', {}) : gain > 0 ? mentorLine(st, 'tradeSellGain', { gain: fmtM(gain - tax) }) + (tax ? ` (אחרי מס רווח הון של ${fmtM(tax)})` : '') : (p.tk === 'IDX' ? mentorLine(st, 'indexSellLoss', {}) : mentorLine(st, 'tradeSellLoss', { loss: fmtM(-gain) }));
      ach(st, out, 'tradeSell', { tk: p.tk, qty, price, gain, lowBuy: low, avg, crypto: t.kind === 'crypto' });
    }
    st.flags['tm_' + p.id] = out.mentor;
    st.flags['tr_' + p.id] = { action: o.id, qty, price, tax: out.tax || 0 };
    holdingModelDiff(st, before, out);
    return false;
  },

  doodad(st, p, o, params, out) {
    const c = p.card; const w = W(st);
    if (o.id === 'skip') {
      st.stats.resisted++; st.stats.toysResisted += c.a; sound(out, 'coin');
      if (st.stats.resisted >= 3) lesson(st, out, 'opportunity_cost');
      out.mentor = mentorLine(st, 'doodadSkip', { amount: fmtM(c.a) });
      out.effects.push({ type: 'float', text: 'ויתרת · ' + fmtM(c.a), color: 'green', at: 'pawn' });
      ach(st, out, 'resist', { amount: c.a });
      return true;
    }
    st.stats.doodad += c.a;
    if (c.need) st.stats.needsSpent += c.a; else { st.stats.toysSpent += c.a; addGlow(st, clamp(c.a / lifeS(st) * 4, 2, 8)); lesson(st, out, 'hedonic'); }
    if (o.id === 'credit') lesson(st, out, 'credit_card_debt');
    if (o.id === 'sub') lesson(st, out, 'lifestyle_creep');
    if (o.id !== 'pay') st.flags.usedCredit = true;
    if (o.id === 'credit') { st.credit += c.a; out.mentor = mentorLine(st, 'doodadCredit', { amount: fmtM(c.a), pay: fmtM(Math.round(c.a * w.creditPct / 100)) }); sound(out, 'card'); }
    else if (o.id === 'sub') { st.subs.push({ id: 's' + st.nextId++, label: c.subLabel || c.n, amount: c.sub }); out.mentor = mentorLine(st, 'doodadSub', { sub: fmtM(c.sub) }); sound(out, 'card'); }
    else { st.cash -= c.a; cashFx(out, -c.a); sound(out, 'loss'); out.mentor = mentorLine(st, c.need ? 'needPaid' : 'doodadPaid', {}); ensureCash(st, out, 'doodad'); }
    ach(st, out, 'doodad', { how: o.id, amount: c.a });
    return true;
  },

  market(st, p, o, params, out) {
    const c = p.card; const ev = describe(st); const d = ev.data;
    if (c.k === 'sell') {
      if (o.id === 'done') { out.mentor = null; return true; }
      const id = +o.id.split(':')[1]; const a = st.assets.find((x) => x.id === id);
      const offer = d.offers.find((x) => x.assetId === 'a' + id);
      st.cash += offer.net; st.stats.sold++; st.stats.soldProfit += offer.profit;
      if (offer.tax) { if (a.biz) st.taxes.capGains += offer.tax; else { st.taxes.betterment += offer.tax; lesson(st, out, 'betterment_tax'); } }
      out.tax = offer.tax;
      st.assets = st.assets.filter((x) => x !== a); if (a.biz) delete st.bizRng['a' + a.id];
      out.despawn.push('a' + id); sound(out, 'sell'); cashFx(out, offer.net, '+' + fmtM(offer.net));
      out.mentor = mentorLine(st, 'sold', { profit: fmtM(offer.profit), cf: fmtM(offer.cf) });
      ensureCash(st, out, 'sell');
      ach(st, out, 'sell', { profit: offer.profit, asset: a });
      return false;
    }
    if (c.k === 'match') {
      if (o.id === 'done') { out.mentor = mentorLine(st, 'givePass', {}); return true; }
      give(st, out, d.levels[+o.id.split(':')[1]], c.n); return true;
    }
    if (c.k === 'bonus') for (const a of managedOf(st)) if (!c.type || (Array.isArray(c.type) ? c.type.includes(a.k) : a.k === c.type)) a.biz = BIZ.applyShock(a.biz, { id: 'holiday', demand: 1.2, months: 1 });
    if (c.k === 'exitwave') for (const id of p.pulled || []) { const x = st.angels.find((y) => y.id === id); if (x && x.status === 'active') revealAngel(st, x, out); }
    const amt = d.amount || 0;
    if (amt) { st.cash += amt; cashFx(out, amt); sound(out, amt > 0 ? 'coin' : 'loss'); }
    if (amt < 0) ensureCash(st, out, 'market');
    ach(st, out, 'market', { card: c, amount: amt });
    return true;
  },

  crisis(st, p, o, params, out) {
    const c = p.card; const ev = describe(st); const d = ev.data; const w = W(st);
    if (p.skipped) { out.mentor = null; return true; }
    st.stats.crises++;
    if (d.amount < 0) st.stats.crisisPaid += -d.amount;
    st.flags.crisisLoan = false;
    if (c.gold) { st.world.goldUsd = Math.round(st.world.goldUsd * (1 + c.gold / 100)); updateDerivedPrices(st); }
    if (c.usd) { setUsd(st, st.world.usd + c.usd); updateDerivedPrices(st); }
    if (c.angelMark) for (const x of st.angels) if (x.status === 'active') x.paper = Math.round(x.paper * c.angelMark);
    if (c.reval) for (const a of st.assets) if (c.reval.kinds.includes(a.k)) a.value = Math.round(a.value * c.reval.mult);
    if (c.rate) setRate(st, st.world.rate + c.rate);
    for (const a of managedOf(st)) a.biz = BIZ.applyShock(a.biz, { id: 'recession', demand: 0.8, months: 3 }); // a crisis hits your customers too
    lesson(st, out, 'emergency_fund');
    const covered = st.cash + (st.savings || 0) + d.amount >= 0; // cash + emergency fund cover it ⇒ no panic
    if (!covered) st.life.happiness = clamp(st.life.happiness - 4, 0, 100);
    st.cash += d.amount; cashFx(out, d.amount); sound(out, 'loss');
    out.effects.push({ type: 'shake' });
    if (o.id === 'okSellGold') {
      const h = st.holdings.GOLD; const before = holdingKeys(st); const price = st.prices.GOLD; const proceeds = Math.round(h.qty * price); const gain = proceeds - Math.round(h.basis);
      const tax = gainTax(st, gain, out);
      st.cash += proceeds - tax; st.stats.tradeProfit += gain - tax; cashFx(out, proceeds - tax, '+' + fmtM(proceeds - tax));
      h.qty = 0; h.basis = 0; h.lowBuy = null; holdingModelDiff(st, before, out); sound(out, 'sell');
      ach(st, out, 'tradeSell', { tk: 'GOLD', gain, crisis: true });
    }
    const loan = ensureCash(st, out, 'crisis');
    if (!loan) st.stats.crisisNoLoan++;
    out.mentor = loan ? mentorLine(st, 'crisisLoan', {}) : (o.id === 'okSellGold' ? mentorLine(st, 'crisisGold', {}) : mentorLine(st, 'crisisOk', {}));
    ach(st, out, 'crisis', { loan });
    return true;
  },

  mystery(st, p, o, params, out) {
    const c = p.card; const ev = describe(st); const d = ev.data;
    if (c.kind === 'quiz') {
      const i = +o.id.slice(1);
      if (i === c.correct) { st.cash += c.reward; st.stats.quizRight++; cashFx(out, c.reward); sound(out, 'coin'); out.mentor = '✔ ' + c.explain; ach(st, out, 'quiz', { right: true }); }
      else { st.stats.quizWrong++; sound(out, 'loss'); out.mentor = 'לא הפעם. ' + c.explain; }
      return true;
    }
    if (c.kind === 'cash') { st.cash += d.amount; cashFx(out, d.amount); sound(out, d.amount >= 0 ? 'coin' : 'loss'); if (d.amount < 0) ensureCash(st, out, 'mystery'); }
    if (c.kind === 'raise') { const n0 = baseNet(st); setGross(st, n0 > 0 ? grossFromNet(n0 + c.amount, taxPoints(st)) / Math.max(1, grossFromNet(n0, taxPoints(st))) : 1); sound(out, 'coin'); }
    if (c.kind === 'expense') { const e = st.expenses.find((x) => x.label === c.label) || st.expenses[0]; e.amount = Math.max(0, e.amount + c.amount); sound(out, c.amount > 0 ? 'loss' : 'coin'); }
    if (c.kind === 'boost' && d.assetId) { const a = st.assets.find((x) => 'a' + x.id === d.assetId); if (a.noi != null) a.noi += c.cf; else a.cf += c.cf; sound(out, 'coin'); }
    if (c.kind === 'shares') { const before = holdingKeys(st); st.holdings[c.tk].qty += c.qty; holdingModelDiff(st, before, out); sound(out, 'coin'); }
    if (c.kind === 'impact') { st.world.impact = (st.world.impact || 0) + c.impact; sound(out, 'coin'); }
    if (c.kind === 'usd') { setUsd(st, st.world.usd + c.delta); updateDerivedPrices(st); }
    out.mentor = c.after || null;
    ach(st, out, 'mystery', { card: c });
    return true;
  },

  bank(st, p, o, params, out) {
    const w = W(st); const ev = describe(st); const d = ev.data;
    if (o.id === 'refi') {
      const L = loanFor(st, d.refiFee); if (L.need) { st.loans += L.need; st.cash += L.need; }
      st.cash -= d.refiFee;
      for (const a of st.assets) if (a.noi != null && a.debt > 0 && a.fixedRate == null) a.fixedRate = d.fixedRate;
      cashFx(out, -d.refiFee); sound(out, 'buy');
      out.mentor = mentorLine(st, 'refi', { rate: pct(d.fixedRate, 2) });
      ach(st, out, 'refi', {});
    } else if (o.id === 'prepay') {
      const t = prepayTarget(st); st.cash -= t.amount; t.a.debt -= t.amount; cashFx(out, -t.amount); sound(out, 'buy');
      out.mentor = mentorLine(st, 'prepay', { save: fmtM(Math.round(t.amount * (t.a.fixedRate ?? st.world.rate) / 1200)) });
    } else out.mentor = null;
    return true;
  },

  upgrade(st, p, o, params, out) {
    if (o.id === 'pass') { out.mentor = null; return true; }
    const ev = describe(st);
    if (o.id.startsWith('up:')) {
      const u = ev.data.upgrades.find((x) => x.assetId === 'a' + o.id.split(':')[1]);
      const a = st.assets.find((x) => 'a' + x.id === u.assetId);
      const L = loanFor(st, u.cost); if (L.need) { st.loans += L.need; st.cash += L.need; }
      st.cash -= u.cost; a.ups = (a.ups || 0) + 1; a.value += u.valueUp;
      if (a.noi != null) a.noi += u.gain; else a.cf += u.gain;
      st.stats.upgrades++;
      cashFx(out, -u.cost); sound(out, 'buy');
      out.effects.push({ type: 'upgrade', assetId: u.assetId });
      out.mentor = mentorLine(st, 'upgraded', { gain: fmtM(u.gain), roi: u.roi + '%' });
      ach(st, out, 'upgrade', { asset: a });
    } else if (o.id.startsWith('trim:')) {
      const t = ev.data.trims.find((x) => x.expenseId === o.id.split(':')[1]);
      const e = st.expenses.find((x) => x.id === t.expenseId);
      const L = loanFor(st, t.cost); if (L.need) { st.loans += L.need; st.cash += L.need; }
      st.cash -= t.cost; e.amount -= t.cut; e.cut = true; st.stats.trims++;
      cashFx(out, -t.cost); sound(out, 'buy');
      out.mentor = mentorLine(st, 'trimmed', { cut: fmtM(t.cut) });
      ach(st, out, 'trim', {});
    }
    return true;
  },

  fx(st, p, o, params, out) {
    const w = W(st);
    if (o.id === 'ok') { out.mentor = null; return true; }
    const pred = o.id === 'hedgeImp' ? (a) => a.sens < 0 : (a) => a.sens > 0;
    const xs = st.assets.filter((a) => pred(a) && !(a.hedge && a.hedge.until >= st.month));
    const fee = xs.reduce((s, a) => s + hedgeFee(st, a), 0);
    const L = loanFor(st, fee); if (L.need) { st.loans += L.need; st.cash += L.need; }
    st.cash -= fee;
    for (const a of xs) a.hedge = { rate: st.world.usd, until: st.month + w.fx.hedgeMonths - 1 };
    st.stats.hedges++;
    cashFx(out, -fee); sound(out, 'buy');
    out.effects.push({ type: 'hedge', assetIds: xs.map((a) => 'a' + a.id) });
    out.mentor = mentorLine(st, 'hedged', { usd: fmtP(st.world.usd), months: w.fx.hedgeMonths });
    ach(st, out, 'hedge', { count: xs.length });
    return true;
  },

  shipping(st, p, o, params, out) {
    const c = p.card; const ev = describe(st); const d = ev.data;
    if (o.id === 'insure') {
      const L = loanFor(st, d.fee); if (L.need) { st.loans += L.need; st.cash += L.need; }
      st.cash -= d.fee; st.world.insuredUntil = st.month + c.months - 1; cashFx(out, -d.fee); sound(out, 'buy');
      out.mentor = mentorLine(st, 'insured', {});
      return true;
    }
    if (d.amount) { st.cash += d.amount; cashFx(out, d.amount); sound(out, d.amount > 0 ? 'coin' : 'loss'); }
    if (c.k === 'loss' && d.insured) { out.mentor = mentorLine(st, 'insurancePaid', {}); ach(st, out, 'insurancePaid', {}); }
    else out.mentor = c.after || null;
    if (d.amount < 0) ensureCash(st, out, 'shipping');
    return true;
  },

  pitch(st, p, o, params, out) {
    const w = W(st); const ev = describe(st);
    if (o.id === 'pass') { out.mentor = mentorLine(st, 'pitchPass', {}); return true; }
    const amt = ev.data.checks[+o.id.split(':')[1]];
    const L = loanFor(st, amt); if (L.need) { st.loans += L.need; st.cash += L.need; }
    st.cash -= amt;
    const h = p.hidden;
    const x = { id: st.nextId++, n: p.card.n, sector: p.card.sector, amount: amt, paper: amt, mult: h.mult, revealAt: st.month + h.revealIn, signalAt: st.month + h.signalIn, signalMult: h.signalMult, status: 'active', month: st.month };
    st.angels.push(x); st.stats.angels++;
    out.spawn.push({ assetId: 'v' + x.id, key: 'v' + x.id, model: w.models.angel, label: x.n, color: 'blue' });
    cashFx(out, -amt); sound(out, 'buy');
    out.mentor = mentorLine(st, 'pitchIn', { n: String(st.angels.filter((y) => y.status === 'active').length) });
    ach(st, out, 'angel', { amount: amt });
    return true;
  },

  giving(st, p, o, params, out) {
    const w = W(st); const ev = describe(st);
    if (o.id === 'pass') { out.mentor = mentorLine(st, 'givePass', {}); return true; }
    if (o.id === 'pledge') {
      const pl = ev.data.pledge; st.pledges.push({ id: 'p' + st.nextId++, label: p.card.short || p.card.n, amount: pl.amount, impact: pl.impact });
      if (!st.stats.given && !st.pledges.slice(0, -1).length) out.spawn.push({ assetId: 'f', key: 'f', model: w.models.giving, label: 'הקרן שלך', color: 'gold' });
      sound(out, 'coin'); out.mentor = mentorLine(st, 'pledged', {});
      ach(st, out, 'give', { pledge: true });
      return true;
    }
    give(st, out, ev.data.levels[+o.id.split(':')[1]], p.card.n);
    return true;
  },
};

function give(st, out, level, cause) {
  const w = W(st);
  const first = !st.stats.given && !st.pledges.length;
  const L = loanFor(st, level.amount); if (L.need) { st.loans += L.need; st.cash += L.need; }
  st.cash -= level.amount; st.stats.given += level.amount;
  st.life.taxRefund += Math.min(Math.round(level.amount * 0.35), 3 * grossBase(st)); // סעיף 46: 35% credit on donations (capped)
  lesson(st, out, 'giving');
  const now = round2(level.impact * w.giving.immediate);
  st.world.impact = (st.world.impact || 0) + now;
  if (level.impact - now > 0) (st.world.vesting ||= []).push({ left: round2(level.impact - now), perMonth: round2((level.impact - now) / w.giving.vest), cause });
  cashFx(out, -level.amount); sound(out, 'coin');
  out.effects.push({ type: 'impact', amount: level.impact });
  if (first) out.spawn.push({ assetId: 'f', key: 'f', model: w.models.giving, label: 'הקרן שלך', color: 'gold' });
  out.mentor = mentorLine(st, 'gave', { impact: String(level.impact), now: String(Math.round(now)), months: String(w.giving.vest) });
  ach(st, out, 'give', { amount: level.amount });
}

/* ============================================================ player actions any time */
/** Take a bank loan of one unit (w1 ₪5,000). */
export function takeLoan(st, amount) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const unit = loanUnit(st);
  const amt = Math.max(unit, Math.ceil((amount || unit) / unit) * unit);
  if (st.loans + amt > loanCap(st)) return { ...out, ok: false, error: capReason(st), event: currentEvent(st) };
  act(st, ['L', amount || 0]);
  st.loans += amt; st.cash += amt; st.stats.loansTaken += amt; st.stats.maxLoans = Math.max(st.stats.maxLoans, st.loans);
  cashFx(out, amt); sound(out, 'coin');
  out.mentor = mentorLine(st, 'loanTaken', { amount: fmtM(amt), cost: fmtM(Math.round(amt * loanPct(st) / 100)) });
  logDecision(st, 'הלוואה', 'לקחת ' + fmtM(amt));
  return { ...out, event: currentEvent(st), end: null };
}
/** Repay one loan unit (or the whole remainder if smaller, or `amount`). */
export function repayLoan(st, amount) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const unit = loanUnit(st);
  const amt = Math.min(st.loans, amount ? Math.max(1, Math.round(amount)) : unit);
  if (!st.loans || st.cash < amt || amt <= 0) return { ...out, ok: false, error: !st.loans ? 'אין הלוואות' : 'אין מספיק מזומן', event: currentEvent(st) };
  act(st, ['R', amount || 0]);
  st.loans -= amt; st.cash -= amt; creditScore(st, BK.CREDIT_DELTAS.loanRepaid);
  cashFx(out, -amt); sound(out, 'buy');
  out.mentor = mentorLine(st, 'loanRepaid', { amount: fmtM(amt), cost: fmtM(Math.round(amt * loanPct(st) / 100)) });
  ach(st, out, 'repay', {});
  logDecision(st, 'הלוואה', 'החזרת ' + fmtM(amt));
  return { ...out, event: currentEvent(st), end: endIfIdle(st, out) };
}
/** Pay the whole credit-card debt. */
export function payCredit(st) {
  if (st.over) throw new Error('game over');
  const out = newOut();
  if (!st.credit || st.cash < st.credit) return { ...out, ok: false, error: !st.credit ? 'אין חוב אשראי' : 'אין מספיק מזומן', event: currentEvent(st) };
  act(st, ['C']);
  cashFx(out, -st.credit); st.cash -= st.credit; st.credit = 0; sound(out, 'buy'); creditScore(st, BK.CREDIT_DELTAS.loanRepaid);
  out.mentor = mentorLine(st, 'creditPaid', {});
  ach(st, out, 'creditPaid', {});
  return { ...out, event: currentEvent(st), end: endIfIdle(st, out) };
}
/** v3: choose the monthly plan any time between rolls (applies from the next payday). */
export function setPlan(st, planId) {
  if (st.over) throw new Error('game over');
  const out = newOut();
  if (!PLANS[planId] || !planAllowed(st, planId)) return { ...out, ok: false, error: 'התוכנית לא זמינה', event: currentEvent(st) };
  if (st.life.plan !== planId) { act(st, ['P', planId]); applyPlan(st, planId, out); }
  return { ...out, event: currentEvent(st), end: null };
}
/** v3: קרן חירום — move ₪ between cash and the savings account (amount > 0 deposits, < 0 withdraws). */
export function moveSavings(st, amount) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const a = Math.round(Number(amount) || 0);
  if (!a || (a > 0 && a > st.cash) || (a < 0 && -a > st.savings)) return { ...out, ok: false, error: a > 0 ? 'אין מספיק מזומן' : 'אין מספיק בקרן החירום', event: currentEvent(st) };
  act(st, ['S', a]);
  st.cash -= a; st.savings += a;
  cashFx(out, -a, a > 0 ? `${fmtM(a)} לקרן החירום` : `${fmtM(-a)} מקרן החירום`); sound(out, a > 0 ? 'buy' : 'coin');
  if (a > 0) { lesson(st, out, 'emergency_fund'); out.mentor = mentorLine(st, 'savingsIn', { months: String(emergencyOf(st, expensesOf(st)).months) }); }
  return { ...out, event: currentEvent(st), end: null };
}
/** v3: monthly standing order into the index fund (₪ per month, 0 = off). */
export function setAutoInvest(st, amount) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const a = Math.max(0, Math.round(Number(amount) || 0));
  act(st, ['A', a]); setAuto(st, a, out);
  return { ...out, event: currentEvent(st), end: null };
}
/** v3: buy/sell index-fund units any time between events (same rules as the trade window, incl. 25% tax on gains). */
export function invest(st, side, qty) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const h = st.holdings.IDX; const price = st.prices.IDX; qty = Math.floor(Number(qty));
  if (st.pending || !h) return { ...out, ok: false, error: 'אפשר להשקיע בין התורות', event: currentEvent(st) };
  const before = holdingKeys(st);
  if (side === 'buy') {
    const cost = Math.round(qty * price);
    if (!(qty >= 1) || cost > st.cash) return { ...out, ok: false, error: 'כמות לא חוקית', event: null };
    act(st, ['I', 'buy', qty]);
    st.cash -= cost; h.qty += qty; h.basis += cost; const L = st.life; L.idxBuys++; if (L.idxSince == null) L.idxSince = st.month;
    lesson(st, out, 'index_fund'); if (st.month - L.lastCrash <= 3) lesson(st, out, 'buy_the_dip');
    cashFx(out, -cost); sound(out, 'buy'); logDecision(st, 'קרן מדד', 'קנה ' + qty, 0);
  } else if (side === 'sell') {
    if (!(qty >= 1) || qty > h.qty) return { ...out, ok: false, error: 'כמות לא חוקית', event: null };
    act(st, ['I', 'sell', qty]);
    const avg = h.basis / h.qty; const proceeds = Math.round(qty * price); const cutB = Math.round(avg * qty); const gain = proceeds - cutB;
    const tax = gainTax(st, gain, out);
    st.cash += proceeds - tax; h.basis = Math.max(0, h.basis - cutB); h.qty -= qty; if (!h.qty) { h.basis = 0; h.lowBuy = null; }
    st.stats.tradeProfit += gain - tax; out.tax = tax;
    if (gain < 0) { st.life.idxSold++; st.life.idxSoldLoss += -gain; lesson(st, out, 'panic_selling'); out.mentor = mentorLine(st, 'indexSellLoss', {}); }
    cashFx(out, proceeds - tax); sound(out, gain >= 0 ? 'sell' : 'loss'); logDecision(st, 'קרן מדד', 'מכר ' + qty, gain - tax);
  } else return { ...out, ok: false, error: 'side must be buy|sell', event: null };
  holdingModelDiff(st, before, out);
  return { ...out, event: null, end: endIfIdle(st, out) };
}

/**
 * Re-run a game from its config + st.actions (server-side verification of ranked results). Pure & deterministic.
 * cfg = {worldId, charId, seed, mode, maxMonths, scenarioId, bailout, tutorial}. Throws {message:'replay_mismatch …'} on an impossible action.
 */
export function replay(cfg, actions) {
  const st = createGame(cfg);
  (actions || []).forEach((a, i) => {
    let r = null;
    try {
      switch (a[0]) {
        case 'r': rollDice(st); break;
        case 'l': landing(st); break;
        case 'c': r = choose(st, null, a[1], a.length > 2 ? { qty: a[2] } : {}); break;
        case 'L': r = takeLoan(st, a[1] || undefined); break;
        case 'R': r = repayLoan(st, a[1] || undefined); break;
        case 'C': r = payCredit(st); break;
        case 'P': r = setPlan(st, a[1]); break;
        case 'A': r = setAutoInvest(st, a[1]); break;
        case 'I': r = invest(st, a[1], a[2]); break;
        case 'S': r = moveSavings(st, a[1]); break;
        default: throw new Error('unknown action');
      }
    } catch (e) { throw new Error(`replay_mismatch at ${i} (${JSON.stringify(a)}): ${e.message}`); }
    if (r && r.ok === false) throw new Error(`replay_mismatch at ${i} (${JSON.stringify(a)}): ${r.error}`);
  });
  return st;
}
/** Config needed by replay() for this game. */
export function replayConfig(st) {
  return { worldId: st.worldId, charId: st.charId, seed: st.seed, mode: st.mode, maxMonths: st.maxMonths, scenarioId: st.history ? st.history.scenarioId : undefined, bailout: !!st.bailout, tutorial: !!st.tutorial };
}

/** Actions can lower expenses (→ win) — only end the game between events. */
function endIfIdle(st, out) {
  if (st.pending || st.phase !== 'roll') return null;
  const end = checkEnd(st);
  if (end) finalize(st, end, out);
  return end || null;
}

/* ============================================================ end of game */
/** Stars for escaping in `months` (0 if over the limit). Monotonic: fewer months ⇒ ≥ stars. */
export function starsFor(world, months, maxMonths, charId) {
  const w = typeof world === 'string' ? getWorld(world) : world;
  const t = starThresholds(w, charId);
  if (months > (maxMonths ?? t.maxMonths)) return 0;
  return 1 + (months <= t.t2 ? 1 : 0) + (months <= t.t3 ? 1 : 0);
}
/** ★★ / ★★★ month thresholds — per character when the world defines them (characters differ in difficulty). */
export function starThresholds(world, charId) {
  const w = typeof world === 'string' ? getWorld(world) : world;
  const ch = w.characters.find((c) => c.id === charId);
  return { maxMonths: (ch && ch.maxMonths) || w.maxMonths, happy: LIFE_CFG.happyStar, ...w.stars, ...((ch && ch.stars) || {}) };
}

/** null while playing; otherwise the final result (pure — choose()/rollDice also store it in state.result). */
export function checkEnd(st) {
  if (st.result) return st.result;
  const w = W(st); const m = metrics(st); const g = w.goal;
  const timeUp = st.mode !== 'free' && st.month > st.maxMonths;
  let won = false;
  if (g.type === 'benchmark') won = timeUp && m.netWorth >= benchNW(st);
  else won = goalMet(st) && (st.life.goalStreak || 0) >= GOAL_HOLD; // the goal must hold on 3 consecutive paydays
  const bankrupt = !!st.flags.bankrupt && !won;
  if (!won && !timeUp && !bankrupt) return null;
  const months = st.month;
  const happy = Math.round(st.life.happiness);
  let stars = 0, starsBlockedByHappiness = false;
  if (g.type === 'benchmark') {
    if (!bankrupt) stars = (m.life.realNetWorth > st.history.startNW ? 1 : 0) + (won ? 1 : 0) + (won && happy >= LIFE_CFG.happyStar ? 1 : 0);
    starsBlockedByHappiness = won && happy < LIFE_CFG.happyStar;
  } else if (won) {
    stars = starsFor(w, months, st.maxMonths, st.charId);
    if (stars >= 3 && happy < starThresholds(w, st.charId).happy) { stars = 2; starsBlockedByHappiness = true; }
  }
  const res = { status: won ? 'won' : 'lost', reason: won ? (g.type === 'benchmark' ? 'benchmark' : 'goal') : bankrupt ? 'bankrupt' : 'time', months, turns: st.turn, stars, starsBlockedByHappiness, netWorth: m.netWorth, passive: m.passive, expenses: m.expenses, cashflow: m.cashflow, impact: Math.floor(st.world.impact || 0), progress: m.goalProgress, stats: { ...st.stats }, lesson: w.lesson, worldId: w.id, charId: st.charId, nearMiss: null, tip: null };
  if (g.type === 'benchmark') res.benchmark = benchmarkResult(st, m);
  res.nearMiss = nearMiss(st, w, m, res);
  res.leaks = leaksOf(st);
  res.tip = tipFor(st, res);
  res.log = st.log.slice(-80);
  res.lifeSummary = lifeSummary(st, m, res);
  res.lessons = st.lessons.slice();
  res.happiness = happy;
  return res;
}
/** History mode: you vs. the buy-and-hold investor vs. cash under the mattress. */
function benchmarkResult(st, m) {
  const H = st.history; const bench = benchNW(st);
  const cashOnly = Math.round(H.startCash + (H.bench.saved || 0));
  const real = (x) => Math.round(x / (st.life.cpi || 1));
  const you = m.netWorth;
  const text = you >= bench ? `ניצחת את "קנה והחזק": ${fmtM(you)} מול ${fmtM(bench)}.` : `המשקיע הפסיבי סיים עם ${fmtM(bench)} — ${fmtM(bench - you)} יותר ממך.`;
  const whatIf = [
    { key: 'you', label: 'אתה', netWorth: you, real: real(you) },
    { key: 'hold', label: 'קנה והחזק (קרן מדד + הפקדה חודשית)', netWorth: bench, real: real(bench) },
    { key: 'cash', label: 'מזומן בעו״ש (בלי להשקיע)', netWorth: cashOnly, real: real(cashOnly) },
  ];
  if (st.life.idxSoldLoss > 0) whatIf.push({ key: 'panic', label: 'מכרת בהפסד במהלך התקופה', netWorth: -Math.round(st.life.idxSoldLoss), real: null });
  return { netWorth: bench, cashOnly, text, whatIf, scenarioId: H.scenarioId, from: H.startYm, to: H.ym, panicLoss: Math.round(st.life.idxSoldLoss) };
}
/** "סיפור החיים שלך" — the shareable end-of-life summary. */
function lifeSummary(st, m, res) {
  const L = st.life; const happy = Math.round(L.happiness); const avg = L.hapN ? Math.round(L.hapSum / L.hapN) : happy;
  const top = st.log.filter((e) => e.v).slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 5).map((e) => ({ t: e.t, c: e.c, o: e.o, v: e.v }));
  const won = res.status === 'won';
  const ageNow = Math.floor(L.age + 1e-6);
  const sentence = won && happy >= 70 ? 'יצאת מהמירוץ — ונשארו לך גם כוח, משפחה ושמחה. ככה נראה עושר אמיתי.'
    : won && happy >= LIFE_CFG.happyStar ? 'יצאת מהמירוץ בלי לשרוף את עצמך בדרך. מכאן הזמן שלך — שלך.'
    : won ? 'יצאת מהמירוץ, אבל שילמת על זה באושר ובכוח. בפעם הבאה: גם מנוחה היא חלק מהתוכנית.'
    : res.reason === 'bankrupt' ? 'החובות ניצחו הפעם. הלקח: קודם תזרים חיובי וכרית — אחר כך כל השאר.'
    : happy >= 65 ? 'עוד לא יצאת מהמירוץ, אבל בנית חיים טובים. עם עוד כמה נכסים — תגיע.'
    : 'עוד לא יצאת מהמירוץ. תסתכל על הדליפות — ותנסה שוב, עם יותר נכסים ופחות צעצועים.';
  return {
    age: round2(L.age), ageText: ageText(L.age), startAge: L.startAge, years: round2((st.month - 1) / 12),
    headline: won ? `בגיל ${ageNow} יצאת מהמירוץ` : `בגיל ${ageNow} עדיין במירוץ`,
    netWorth: m.netWorth, realNetWorth: m.life.realNetWorth, passive: m.passive, pension: Math.round(L.pension),
    freeTimeMonths: L.planMonths.rest, planMonths: { ...L.planMonths }, family: familyText(L.family), kids: L.family.kids, wedding: L.family.wedding,
    happiness: happy, avgHappiness: avg, energy: Math.round(L.energy), burnouts: L.burnouts, creditScore: L.creditScore,
    taxesPaid: Math.round(st.taxes.income + st.taxes.bl + st.taxes.capGains + st.taxes.rental + st.taxes.betterment + st.taxes.side),
    studied: L.study.done, raises: L.raises, lifeEvents: L.events.length,
    topDecisions: top, leaks: (res.leaks || []).slice(0, 3), sentence,
  };
}

function nearMiss(st, w, m, res) {
  if (res.status === 'won') {
    if (res.stars >= 3) return { text: 'משחק מושלם: ★★★. נראה אותך עושה את זה שוב בעולם הבא.' };
    if (res.stars === 0) return { text: `יצאת בחודש ${res.months} — אחרי מגבלת ${st.maxMonths} החודשים. הפעם בלי כוכבים, אבל יצאת.` };
    const T = starThresholds(w, st.charId);
    const target = res.stars === 1 ? T.t2 : T.t3;
    const d = res.months - target;
    return { text: `עוד ${d} ${d === 1 ? 'חודש' : 'חודשים'} פחות ו${res.stars === 1 ? '־★★' : '־★★★'} היו שלך.`, monthsToNext: d };
  }
  if (res.reason === 'bankrupt') return { text: 'החובות בלעו את התזרים. בפעם הבאה: לא לקנות "נכסים" שמוציאים כסף, ולא להשאיר הלוואות פתוחות.' };
  if (w.goal.type === 'passive') { const gap = m.expenses - m.passive; return { text: `היית רק ${fmtM(gap)} בחודש מהחופש.`, gap }; }
  const gapNW = Math.max(0, w.goal.target - m.netWorth);
  const gapI = w.goal.type === 'netWorthImpact' ? Math.max(0, w.goal.impact - Math.floor(st.world.impact || 0)) : 0;
  if (gapNW && gapI) return { text: `חסרו לך ${fmtM(gapNW)} בשווי ו־${gapI} נקודות השפעה.`, gap: gapNW, gapImpact: gapI };
  if (gapI) return { text: `השווי כבר שם! חסרו רק ${gapI} נקודות השפעה.`, gapImpact: gapI };
  return { text: `חסרו לך רק ${fmtM(gapNW)} לשווי היעד.`, gap: gapNW };
}
function tipFor(st, res) {
  const s = st.stats; const w = W(st);
  // advice comes from the biggest leak that was a CHOICE — forced expenses (needs, crises) are never blamed
  const TIPS = {
    interest: 'בפעם הבאה: פחות חובות. כל שקל ריבית הוא שקל שלא קנה נכס — ואשראי הוא החוב הכי יקר.',
    toys: 'בפעם הבאה: לוותר על יותר פיתויים. כל צעצוע מהמשכורת דוחה את היציאה.',
    badAssets: 'בפעם הבאה: תבדוק את השורה התחתונה. נכס שמוציא כסף כל חודש הוא התחייבות.',
    subs: 'בפעם הבאה: פחות מנויים. מנוי קטן מזיז את קו הסיום — לתמיד.',
  };
  const leak = (res.leaks || leaksOf(st)).find((l) => l.key !== 'forced' && l.amount >= Math.max(1, metrics(st).expenses * 0.5));
  if (leak && res.status !== 'won') return TIPS[leak.key];
  if (w.mechanic === 'rate' && s.upgrades + s.trims === 0) return 'בפעם הבאה: נסה את משבצות השדרוג — שיפוץ טוב או קיצוץ הוצאה מקצרים את הדרך.';
  if (w.mechanic === 'fx' && !s.hedges) return 'בפעם הבאה: כשאתה חשוף לדולר והשער נוח — תגדר. ביטוח זול כשאין סערה.';
  if (w.mechanic === 'angel' && s.angels < 4) return 'בפעם הבאה: הרבה צ\'קים קטנים. ככה תופסים את הסטארט־אפ האחד שעושה פי 50.';
  if (leak) return TIPS[leak.key];
  return res.status === 'won' ? 'משחק נקי. נסה דמות אחרת וראה כמה זה משנה.' : 'בפעם הבאה: תחפש נכסים עם תזרים חיובי מוקדם יותר.';
}

/* ============================================================ intro / daily helpers */
/** Opening mentor line + goal text for a fresh game (or a "welcome back" line on resume). */
export function intro(st, resumed = false) {
  const w = W(st); const m = metrics(st);
  const goal = w.goal.type === 'passive' ? `הכנסה פסיבית שעוברת את ההוצאות (${fmtM(m.expenses)} בחודש)` : w.goal.type === 'netWorth' ? fmtM(w.goal.target) : `שווי נקי של ${fmtM(w.goal.target)} ו־${w.goal.impact} נקודות השפעה`;
  const seeded = st.mode !== 'free';
  const limit = seeded ? ` יש לך ${st.maxMonths} חודשים, וכולם מקבלים אותן קוביות ואותם קלפים — ההחלטות שלך קובעות.` : '';
  const mentor = resumed ? `חזרת לחודש ${st.month}. נמשיך מאיפה שעצרנו.` : tpl(w.mentor.start, { who: st.charName, cf: sgn(m.cashflow), goal }) + limit;
  return { mentor, goalText: m.goalText, goalLabel: w.goalLabel, world: w.name, tagline: w.tagline };
}

/**
 * Daily challenge config for an Israel-date string 'YYYY-MM-DD' (the caller computes the date; the engine has no clock).
 * World rotates w1→w4 by day number; character rotates through the world's daily list; seed = hash(date).
 */
export function dailyConfig(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dayNum = daysFromCivil(y, mo, d);
  const w = WORLDS[((dayNum % WORLDS.length) + WORLDS.length) % WORLDS.length];
  const chars = (w.daily && w.daily.chars) || w.characters.map((c) => c.id);
  const charId = chars[Math.floor(dayNum / WORLDS.length) % chars.length];
  return { worldId: w.id, charId, seed: seedFromString('daily:' + dateStr), mode: 'daily', maxMonths: (w.daily && w.daily.maxMonths) || 24 };
}
/** Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's algorithm) — no Date object needed. */
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400); const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function seedFromString(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return (h >>> 0) || 1; }

/* ============================================================ static info for the UI */
/** Board description for the scene: [{index, ch, type, name, color, ink, icon}] */
export function boardInfo(worldId) {
  const w = getWorld(typeof worldId === 'object' && worldId ? worldId.worldId : worldId);
  const tiles = [...w.board].map((ch, i) => ({ index: i, i, ch, ...w.tiles[ch] }));
  tiles.corners = tiles.filter((t) => t.type === 'payday').map((t) => t.index); // [0, 10, 20, 30]
  tiles.tiles = tiles; tiles.size = tiles.length;
  return tiles;
}
/** Lightweight world list for the lobby/map. */
export function worldList() {
  return WORLDS.map((w) => ({ id: w.id, order: w.order, name: w.name, tagline: w.tagline, goal: w.goal, goalLabel: w.goalLabel, maxMonths: w.maxMonths, stars: w.stars, theme: w.theme, mechanic: w.mechanic, characters: w.characters.map((c) => characterCard(w, c)) }));
}
export function characterCard(w, c) {
  const exp = c.expenses.reduce((s, e) => s + e[1], 0);
  const net = c.salary || Math.round((c.salaryUsd || 0) * (w.start.usd || 0));
  const points = TAX.points + ((c.family && c.family.kids) || 0) * TAX.kidPoints;
  return { id: c.id, name: c.name, desc: c.desc, salary: c.salary || 0, salaryUsd: c.salaryUsd || 0, net, gross: grossFromNet(net, points), cash: c.cash, expenses: exp, surplus: net - exp, perk: c.perk || null, icon: c.icon || null,
    age: c.age || 30, family: c.family ? familyText({ partner: c.family.partner || 'none', kids: c.family.kids || 0 }) : null };
}
export { achievementById };
