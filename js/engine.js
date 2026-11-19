// מירוץ העכברים 2.0 — pure game engine.
// No DOM, no THREE, no Math.random, no Date. Same seed + same decisions ⇒ same game, in the browser and in Node.
// Every random draw comes from a named seeded stream in state.rng and is consumed by *where the pawn lands*, never by
// *what the player decides* — so in a seeded challenge everyone sees the same dice and the same cards.
// See ENGINE.md for the full API contract.

import { next, int, shuffle, weighted, makeStreams } from './rng.js';
import { WORLDS, getWorld } from './worlds/index.js';
import { checkAchievements, achievementById } from './achievements.js';

export const SAVE_VERSION = 1;
export { WORLDS, getWorld };

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
const pct = (x, d = 0) => (Math.round(x * 10 ** d) / 10 ** d) + '%';
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
  const w = getWorld(o.worldId || 'w1');
  const ch = w.characters.find((c) => c.id === o.charId) || w.characters[0];
  const seed = ((o.seed ?? 1) >>> 0) || 1;
  const st = {
    v: SAVE_VERSION, worldId: w.id, charId: ch.id, charName: ch.name, seed, mode: o.mode || 'free',
    maxMonths: o.maxMonths ?? ch.maxMonths ?? w.maxMonths,
    tutorial: !!o.tutorial && (o.mode || 'free') === 'free', bailout: !!o.bailout,
    rng: makeStreams(seed),
    phase: 'roll', pos: 0, month: 1, turn: 0, nextId: 1, nextEventId: 1,
    cash: ch.cash, salary: ch.salary || 0, salaryUsd: ch.salaryUsd || 0,
    expenses: ch.expenses.map(([label, amount, trim], i) => ({ id: 'e' + i, label, amount, trim: !!trim, cut: false })),
    subs: [], pledges: [], loans: 0, credit: 0,
    assets: [], holdings: {}, prices: {}, angels: [],
    world: clone(w.start || {}),
    decks: {}, pending: null, lastRoll: null, lastPayday: null,
    stats: {
      deals: 0, bad: 0, doodad: 0, autoLoan: 0, autoLoans: 0, sold: 0, soldProfit: 0, golden: 0, crises: 0,
      crisisNoLoan: 0, tradeProfit: 0, upgrades: 0, trims: 0, hedges: 0, hedgeSaved: 0, angels: 0, exits: 0,
      bigExits: 0, given: 0, quizRight: 0, quizWrong: 0, maxLoans: 0, negMonths: 0, paydays: 0, loansTaken: 0,
      interestPaid: 0, forcedLoans: 0, toysSpent: 0, toysResisted: 0, resisted: 0, badAssets: 0, badAssetLoss: 0, needsSpent: 0, subsPaid: 0, crisisPaid: 0,
    },
    ach: [], flags: {}, log: [], over: null, result: null,
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
    st.holdings[tk].qty = q; st.holdings[tk].basis = q * st.prices[tk];
  }
  if (w.crypto) launchCoin(st, next(st.rng, 'deal'), true);
  return st;
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

function logDecision(st, card, option) {
  st.log.push({ t: st.turn, c: String(card).slice(0, 24), o: String(option).slice(0, 24) });
  if (st.log.length > 80) st.log.shift();
}

/** JSON save. The state is already plain data; this is just a stable helper. */
export function serialize(st) { return JSON.stringify(st); }
/** Resume from JSON (string or object). Throws on an unknown save version. */
export function deserialize(json) {
  const st = typeof json === 'string' ? JSON.parse(json) : clone(json);
  if (st.v !== SAVE_VERSION) throw new Error('save version ' + st.v + ' not supported');
  getWorld(st.worldId);
  return st;
}

/* ============================================================ economy core */
const W = (st) => getWorld(st.worldId);
const loanUnit = (st) => W(st).loan.unit;
const autoUnit = (st) => W(st).loan.autoUnit || W(st).loan.unit;
/** Monthly cost of bank loans in % of the balance. w2: base + rateMult × current interest rate. */
export function loanPct(st) { const L = W(st).loan; return round2(L.pct + (L.rateLinked ? st.world.rate * (L.rateMult ?? 1) : 0)); }
/** The bank lends (voluntarily) up to cap × monthly income (salary + passive) — "הבנק בודק שתוכל להחזיר". */
export function loanCap(st) { const L = W(st).loan; return L.cap ? Math.max(0, Math.floor(L.cap * Math.max(salaryNow(st) + Math.max(0, passiveOf(st)), 0) / 1000) * 1000) : Infinity; }
const CAP_REASON = 'הבנק בודק שתוכל להחזיר — ההכנסה שלך לא מספיקה להלוואה כזו';
/** Payment preview for any "you must pay X now" card. */
function shortfallInfo(st, pay) {
  pay = Math.max(0, Math.round(pay));
  const shortfall = Math.max(0, pay - st.cash);
  const loanAmount = shortfall ? Math.ceil(shortfall / autoUnit(st)) * autoUnit(st) : 0;
  return { pay, shortfall, loanAmount, loanMonthly: Math.round(loanAmount * loanPct(st) / 100) };
}
const loanPay = (st) => Math.round((st.loans * loanPct(st)) / 100);
const creditPay = (st) => Math.round(st.credit * W(st).creditPct / 100);

function salaryNow(st) {
  if (st.salaryUsd) return r10(st.salaryUsd * st.world.usd);
  return st.salary;
}

/** Effective USD rate for an asset (hedged assets use their locked rate). */
function usdFor(st, a) {
  if (a.hedge && a.hedge.until >= st.month) return a.hedge.rate;
  return st.world.usd;
}

/** Current monthly net cashflow of one asset (after its mortgage). */
export function assetCf(st, a) {
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
  return t.div || 0;
}

function passiveOf(st) {
  let p = 0;
  for (const a of st.assets) p += assetCf(st, a);
  for (const tk of Object.keys(st.holdings)) p += st.holdings[tk].qty * tickerDiv(st, tk);
  return Math.round(p);
}
function expensesOf(st) {
  let e = 0;
  for (const x of st.expenses) e += x.amount;
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
  let nw = st.cash - st.loans - st.credit + holdingsValue(st) + angelPaper(st);
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

/* ============================================================ metrics (UI read model) */
/**
 * Everything the HUD / statement sheet needs. Pure.
 */
export function metrics(st) {
  const w = W(st);
  const salary = salaryNow(st);
  const passive = passiveOf(st);
  const expenses = expensesOf(st);
  const cashflow = salary + passive - expenses;
  const netWorth = netWorthOf(st);
  const g = w.goal;
  let goalProgress, goalText, goalParts;
  if (g.type === 'passive') {
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
  const incomeLines = [{ label: st.salaryUsd ? `משכורת ($${groups(st.salaryUsd)})` : 'משכורת', amount: salary }];
  for (const a of st.assets) incomeLines.push({ label: a.n, amount: assetCf(st, a), assetId: 'a' + a.id });
  for (const tk of Object.keys(st.holdings)) {
    const h = st.holdings[tk]; const d = tickerDiv(st, tk);
    if (h.qty && d) incomeLines.push({ label: `${w.tickers[tk].divLabel || 'דיבידנד'} ${tk}`, amount: Math.round(h.qty * d) });
  }
  const expenseLines = st.expenses.map((x) => ({ label: x.label, amount: x.amount, id: x.id }));
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
    };
  });
  const liabilities = st.assets.filter((a) => a.debt > 0).map((a) => ({ label: `${(w.kinds[a.k] || {}).debtLabel || 'משכנתא'} · ${a.n}`, amount: a.debt, assetId: 'a' + a.id }));
  if (st.loans) liabilities.push({ label: 'הלוואה בנקאית', amount: st.loans, id: 'loan' });
  if (st.credit) liabilities.push({ label: 'חוב כרטיס אשראי', amount: st.credit, id: 'credit' });
  const holdings = Object.keys(st.holdings).filter((tk) => st.holdings[tk].qty > 0).map((tk) => {
    const h = st.holdings[tk]; const t = w.tickers[tk];
    return { ticker: tk, name: t.name, unit: t.unit || 'מניות', qty: h.qty, price: st.prices[tk], value: Math.round(h.qty * st.prices[tk]), basis: Math.round(h.basis), avg: h.qty ? h.basis / h.qty : 0, div: t.div || 0, model: t.model || null };
  });
  const angels = st.angels.map((x) => ({ id: 'v' + x.id, name: x.n, amount: x.amount, paper: x.status === 'active' ? x.paper : 0, status: x.status, result: x.status === 'active' ? null : x.cashOut, mult: x.status === 'active' ? null : x.mult, revealAt: x.revealAt, news: x.news || null }));
  const wi = {};
  if (w.mechanic === 'rate') { wi.rate = st.world.rate; wi.rateHist = st.world.rateHist.slice(-12); wi.loanPct = loanPct(st); wi.fixedPremium = w.rate.fixedPremium; }
  if (w.mechanic === 'fx') { wi.usd = st.world.usd; wi.usdHist = st.world.usdHist.slice(-12); wi.usdRef = w.fx.ref; wi.gold = st.prices.GOLD; wi.insuredUntil = st.world.insuredUntil || 0; wi.exposure = fxExposure(st); }
  if (w.mechanic === 'angel') { wi.impact = Math.floor(st.world.impact || 0); wi.impactPending = Math.round((st.world.vesting || []).reduce((s, v) => s + v.left, 0)); wi.impactPerMonth = round2(st.pledges.reduce((s, p) => s + p.impact, 0) + st.assets.reduce((s, a) => s + (a.impact || 0), 0) + (st.world.vesting || []).reduce((s, v) => s + Math.min(v.left, v.perMonth), 0)); wi.impactTarget = w.goal.impact; wi.angelsActive = st.angels.filter((x) => x.status === 'active').length; wi.angelPaper = angelPaper(st); }
  return {
    month: st.month, maxMonths: st.maxMonths, turn: st.turn, mode: st.mode,
    cash: st.cash, salary, passive, expenses, cashflow, netWorth, loans: st.loans, credit: st.credit,
    goalProgress, goalText, goalParts, goalType: g.type,
    incomeLines, expenseLines, assets, liabilities, holdings, angels, worldIndicators: wi,
    canRepay: st.loans > 0 && st.cash >= Math.min(loanUnit(st), st.loans), canPayCredit: st.credit > 0 && st.cash >= st.credit,
    loanUnit: loanUnit(st), loanUnitCost: Math.round((loanUnit(st) * loanPct(st)) / 100),
    loanPct: loanPct(st), creditPct: W(st).creditPct, loanCap: Number.isFinite(loanCap(st)) ? loanCap(st) : null,
    loanRoom: Number.isFinite(loanCap(st)) ? Math.max(0, loanCap(st) - st.loans) : null, canBorrow: st.loans + loanUnit(st) <= loanCap(st),
  };
}

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
  const unit = autoUnit(st);
  const need = Math.ceil(-st.cash / unit) * unit;
  st.loans += need; st.cash += need; st.stats.autoLoan += need; st.stats.forcedLoans += need; st.stats.autoLoans++;
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
  let die = 1 + Math.floor(next(st.rng, 'dice') * 6);
  if (st.tutorial && st.turn === 0) { // tutorial: the very first roll lands on a deal tile (the seeded draw is still consumed)
    const ok = [1, 2, 3, 4, 5, 6].filter((d) => w.tiles[w.board[(st.pos + d) % w.board.length]].type === 'deal');
    if (ok.length) die = ok[(die - 1) % ok.length];
  }
  sound(out, 'roll');
  const from = st.pos; const steps = []; out.paydays = [];
  for (let s = 0; s < die; s++) {
    st.pos = (st.pos + 1) % w.board.length;
    steps.push(st.pos);
    if (w.tiles[w.board[st.pos]].type === 'payday') payday(st, out, s, s === die - 1);
  }
  st.turn++;
  st.phase = 'land';
  st.lastRoll = { die, from, to: st.pos, steps };
  Object.assign(out, { die, from, to: st.pos, steps });
  if (out.bailout === undefined) out.bailout = null;
  return out;
}

function payday(st, out, step, landed) {
  const w = W(st);
  const m0 = metrics(st);
  const cf = m0.cashflow;
  st.stats.interestPaid += loanPay(st) + creditPay(st);
  st.stats.subsPaid += st.subs.reduce((a, x) => a + x.amount, 0);
  for (const a of st.assets) { const c = assetCf(st, a); if (c < 0) st.stats.badAssetLoss -= c; }
  st.cash += cf; st.month++; st.stats.paydays++;
  if (cf < 0) st.stats.negMonths++;
  cashFx(out, cf, null, 'pawn');
  sound(out, cf >= 0 ? 'coin' : 'loss');
  const pd = { tile: st.pos, step, amount: cf, month: st.month, landed, salary: m0.salary, passive: m0.passive, expenses: m0.expenses };
  out.paydays.push(pd);
  if (landed) st.lastPayday = pd;
  monthlyWorld(st, out);
  ensureCash(st, out, 'payday');
  if (cf < 0 && !st.flags.negWarned) { st.flags.negWarned = true; out.mentor = mentorLine(st, 'negativeCf', { cf: sgn(cf) }) || out.mentor; }
  // Bankrupt only when the hole is deep AND the money has run out: deep negative net worth with negative cashflow,
  // and cash + remaining bank room can't cover even 3 more months of the deficit (a bad buy alone, with cash in hand, is not game over).
  const room = Number.isFinite(loanCap(st)) ? Math.max(0, loanCap(st) - st.loans) : 0;
  if (cf < 0 && netWorthOf(st) < -bankruptLimit(st) && st.cash + room < -cf * 3) {
    if (st.bailout && !st.flags.bailoutUsed) bailout(st, out);
    else st.flags.bankrupt = true;
  }
  ach(st, out, 'payday', { cf });
}

/** First-ever bankruptcy with createGame({bailout:true}): the bank restructures instead of ending the game. Once. */
function bailout(st, out) {
  st.flags.bailoutUsed = true;
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
  ];
  return L.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
}

/* ============================================================ server summary */
/** Compact JSON for the backend (rr_finish): result + stats + leaks + decision log. < 10 KB. */
export function summaryForServer(st) {
  const m = metrics(st); const r = st.result || {};
  return { v: SAVE_VERSION, worldId: st.worldId, charId: st.charId, mode: st.mode, seed: st.seed, months: st.month, turns: st.turn, status: st.over || 'playing', reason: r.reason || null, stars: r.stars || 0,
    netWorth: m.netWorth, passive: m.passive, expenses: m.expenses, impact: Math.floor(st.world.impact || 0), progress: round2(m.goalProgress), stats: { ...st.stats }, leaks: leaksOf(st), log: st.log.slice(-80) };
}

/** Per-month world mechanics, all decision-independent draws come from the 'drift' stream. */
function monthlyWorld(st, out) {
  const w = W(st);
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
  const w = W(st);
  const ch = w.board[st.pos];
  const tile = w.tiles[ch];
  let p;
  switch (tile.type) {
    case 'payday': p = { type: 'payday', pd: st.lastPayday }; break;
    case 'deal': p = createDeal(st); break;
    case 'doodad': p = { type: 'doodad', card: resolveDoodad(st, clone(drawCard(st, 'doodad', w.doodads, 'doodad'))) }; break;
    case 'market': p = createMarket(st); break;
    case 'crisis': p = { type: 'crisis', card: clone(drawCard(st, 'crisis', w.crises, 'crisis')) }; if (st.tutorial && st.turn <= 3) p.skipped = true; break;
    case 'mystery': p = createMystery(st); break;
    case 'bank': p = createBank(st); break;
    case 'upgrade': p = { type: 'upgrade', card: clone(drawCard(st, 'upgrade', w.upgrades, 'special')) }; break;
    case 'fx': p = createFx(st); break;
    case 'shipping': p = { type: 'shipping', card: clone(drawCard(st, 'shipping', w.shipping, 'special')) }; break;
    case 'pitch': p = createPitch(st); break;
    case 'giving': p = { type: 'giving', card: clone(drawCard(st, 'giving', w.causes, 'special')) }; break;
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
  let card = base; let golden = false;
  if (st.tutorial && !st.flags.tutorialDone && w.starterDeal) {
    card = clone(w.starterDeal); st.flags.tutorialDone = true;
    if (st.cash < card.down) card.down = Math.max(0, Math.floor(st.cash / 100) * 100); // never needs a loan
  }
  else if (forceGolden || (w.golden && w.golden.length && gRoll < w.goldenChance)) { card = w.golden[gIdx]; golden = true; }
  return dealPending(st, card, golden, 'deal');
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
  if (card.kind === 'golden' && w.golden && w.golden.length) { const p = dealPending(st, w.golden[gIdx], true, 'mystery'); p.mysteryTitle = card.title; return p; }
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
    ev.options = [opt('ok', 'המשך', true, { primary: true })];
    ev.sound = 'coin';
  },

  deal(st, p, ev) {
    const w = W(st); const c = p.card; const kind = w.kinds[c.k] || {};
    const debt = c.cost - c.down; const value = c.value ?? c.cost;
    const proto = { noi: c.noi, cf: c.cf, debt, sens: c.sens, ref: st.world.usd };
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
    };
    if (cn) { ev.data.coinAlive = !dead; if (p.wiped) ev.data.wiped = p.wiped; }
    if (cn && p.wiped && !st.flags['tm_' + p.id]) ev.mentor = tpl(W(st).crypto.texts.wipedMentor, { qty: groups(p.wiped.qty), old: p.wiped.oldName, coin: cn });
    else if (dead && !st.flags['tm_' + p.id]) ev.mentor = mentorLine(st, 'cryptoDead', {}) || ev.mentor;
    ev.options = [
      opt('buy', 'לקנות', !dead && maxBuy > 0, { needsQty: true, max: dead ? 0 : maxBuy, reason: dead ? 'המטבע מת — אי אפשר לקנות' : maxBuy > 0 ? undefined : 'אין מספיק מזומן' }),
      opt('sell', 'למכור', h.qty > 0, { needsQty: true, max: h.qty, reason: h.qty > 0 ? undefined : 'אין לך מה למכור' }),
      opt('done', 'סיום', true, { primary: true }),
    ];
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
      d.offers = own.map((a) => { const acf = assetCf(st, a); const offer = Math.round(assetValue(st, a) * (acf > 0 ? c.mult : Math.min(c.mult, 1) * 0.85)); return { assetId: 'a' + a.id, name: a.n, offer, debt: a.debt, net: offer - a.debt, profit: offer - a.debt - a.down, cf: acf }; });
      ev.options = [...d.offers.map((o) => opt('sell:' + o.assetId.slice(1), `למכור את ${o.name} · ${sgn(o.net)}`, o.net >= 0 || st.cash + o.net >= 0, { kind: 'sell', reason: o.net >= 0 || st.cash + o.net >= 0 ? undefined : 'החוב גדול מההצעה' })), opt('done', 'סיום', true, { primary: true })];
      ev.mentor = own.length ? mentorLine(st, 'sellAsk', {}) : mentorLine(st, 'sellNone', {});
      if (!own.length) { ev.auto = true; ev.toastText = `${c.n} — אין לך נכסים מהסוג הזה למכור.`; }
    } else if (c.k === 'repair') {
      const n = st.assets.filter((a) => a.k === c.type).length; d.count = n; d.amount = -n * c.amt; Object.assign(d, shortfallInfo(st, n * c.amt));
      ev.mentor = n ? mentorLine(st, 'repair', {}) : mentorLine(st, st.assets.length ? 'repairNoneOwn' : 'repairNone', {});
      ev.options = [opt('ok', n ? `לשלם ${fmtM(n * c.amt)}` : 'המשך', true, { primary: true })];
      if (!n) { ev.auto = true; ev.toastText = `${c.n} — לא נוגע אליך הפעם.`; }
    } else if (c.k === 'bonus') {
      d.amount = Math.round(st.assets.filter((a) => !c.type || (Array.isArray(c.type) ? c.type.includes(a.k) : a.k === c.type)).reduce((s, a) => s + Math.max(0, assetCf(st, a)), 0) * (c.months || 1));
      ev.mentor = d.amount ? mentorLine(st, 'bonus', {}) : mentorLine(st, 'bonusNone', {});
      if (!d.amount) { ev.auto = true; ev.toastText = `${c.n} — הבונוס הולך לבעלי נכסים אחרים.`; }
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
    ev.data = { amount: Math.round(amount), lines, expenses: m.expenses, passive: m.passive, gold: c.gold || 0, usd: c.usd || 0, angelMark: c.angelMark || null, ...shortfallInfo(st, -Math.round(amount)) };
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
  const close = CHOOSE[p.type](st, p, o, params, out);
  if (out.ok === false) return { ...out, event: describe(st), done: false, end: null };
  if (!ev.auto && p.type !== 'payday' && !(o.id === 'done' && p.type === 'trade')) {
    logDecision(st, ev.title, p.type === 'trade' ? `${o.id === 'buy' ? 'קנה' : 'מכר'} ${Math.floor(Number(params.qty)) || ''}`.trim() : o.label.replace(/\s*\(.*\)$/, ''));
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
  ach(st, out, 'buy', { asset: a, cf, golden: p.golden, loan: L.need });
}

const CHOOSE = {
  payday(st, p, o, params, out) { out.mentor = null; return true; },

  deal(st, p, o, params, out) {
    if (o.id === 'pass') {
      const c = p.card; const cf = assetCf(st, { noi: c.noi, cf: c.cf, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd });
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
    const qty = Math.floor(Number(params.qty));
    const before = holdingKeys(st);
    if (o.id === 'buy') {
      if (!(qty >= 1) || qty * price > st.cash + 1e-9) { out.ok = false; out.error = 'כמות לא חוקית'; return false; }
      st.cash -= qty * price; h.qty += qty; h.basis += qty * price;
      h.lowBuy = h.lowBuy == null ? price : Math.min(h.lowBuy, price);
      sound(out, 'buy'); cashFx(out, -qty * price, null);
      out.toast = `קנית ${groups(qty)} ${t.unit || 'מניות'}`;
      out.mentor = mentorLine(st, t.div ? 'tradeBuyDiv' : 'tradeBuy_' + (t.kind || 'stock'), { qty: groups(qty), div: fmtM(qty * (t.div || 0)) }) || mentorLine(st, 'tradeBuy', { qty: groups(qty) });
      ach(st, out, 'tradeBuy', { tk: p.tk, qty, price });
    } else if (o.id === 'sell') {
      if (!(qty >= 1) || qty > h.qty) { out.ok = false; out.error = 'כמות לא חוקית'; return false; }
      const avg = h.basis / h.qty; const gain = (price - avg) * qty;
      st.cash += qty * price; h.basis = Math.max(0, h.basis - avg * qty); h.qty -= qty;
      const low = h.lowBuy; if (!h.qty) { h.lowBuy = null; h.basis = 0; }
      st.stats.tradeProfit += gain;
      sound(out, gain >= 0 ? 'sell' : 'loss'); cashFx(out, qty * price, null);
      if (Math.abs(gain) >= 1) out.effects.push({ type: 'float', text: sgn(gain), color: gain >= 0 ? 'green' : 'red', at: 'pawn' });
      out.toast = `מכרת ${groups(qty)} ${t.unit || 'מניות'}`;
      out.mentor = Math.abs(gain) < 1 ? mentorLine(st, 'tradeSellEven', {}) : gain > 0 ? mentorLine(st, 'tradeSellGain', { gain: fmtM(gain) }) : mentorLine(st, 'tradeSellLoss', { loss: fmtM(-gain) });
      ach(st, out, 'tradeSell', { tk: p.tk, qty, price, gain, lowBuy: low, avg, crypto: t.kind === 'crypto' });
    }
    st.flags['tm_' + p.id] = out.mentor;
    st.flags['tr_' + p.id] = { action: o.id, qty, price };
    holdingModelDiff(st, before, out);
    return false;
  },

  doodad(st, p, o, params, out) {
    const c = p.card; const w = W(st);
    if (o.id === 'skip') {
      st.stats.resisted++; st.stats.toysResisted += c.a; sound(out, 'coin');
      out.mentor = mentorLine(st, 'doodadSkip', { amount: fmtM(c.a) });
      out.effects.push({ type: 'float', text: 'ויתרת · ' + fmtM(c.a), color: 'green', at: 'pawn' });
      ach(st, out, 'resist', { amount: c.a });
      return true;
    }
    st.stats.doodad += c.a;
    if (c.need) st.stats.needsSpent += c.a; else st.stats.toysSpent += c.a;
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
      st.assets = st.assets.filter((x) => x !== a);
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
    st.cash += d.amount; cashFx(out, d.amount); sound(out, 'loss');
    out.effects.push({ type: 'shake' });
    if (o.id === 'okSellGold') {
      const h = st.holdings.GOLD; const before = holdingKeys(st); const price = st.prices.GOLD; const gain = (price - h.basis / h.qty) * h.qty;
      st.cash += h.qty * price; st.stats.tradeProfit += gain; cashFx(out, h.qty * price, '+' + fmtM(h.qty * price));
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
    if (c.kind === 'raise') { st.salary += c.amount; if (st.salaryUsd) st.salaryUsd += Math.round(c.amount / st.world.usd); sound(out, 'coin'); }
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
  if (st.loans + amt > loanCap(st)) return { ...out, ok: false, error: CAP_REASON, event: currentEvent(st) };
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
  st.loans -= amt; st.cash -= amt;
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
  cashFx(out, -st.credit); st.cash -= st.credit; st.credit = 0; sound(out, 'buy');
  out.mentor = mentorLine(st, 'creditPaid', {});
  ach(st, out, 'creditPaid', {});
  return { ...out, event: currentEvent(st), end: endIfIdle(st, out) };
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
  return { maxMonths: (ch && ch.maxMonths) || w.maxMonths, ...w.stars, ...((ch && ch.stars) || {}) };
}

/** null while playing; otherwise the final result (pure — choose()/rollDice also store it in state.result). */
export function checkEnd(st) {
  if (st.result) return st.result;
  const w = W(st); const m = metrics(st); const g = w.goal;
  let won = false;
  if (g.type === 'passive') won = m.passive > 0 && m.passive >= m.expenses;
  else if (g.type === 'netWorth') won = m.netWorth >= g.target;
  else won = m.netWorth >= g.target && Math.floor(st.world.impact || 0) >= g.impact;
  const timeUp = st.mode !== 'free' && st.month > st.maxMonths;
  const bankrupt = !!st.flags.bankrupt && !won;
  if (!won && !timeUp && !bankrupt) return null;
  const months = st.month;
  const stars = won ? starsFor(w, months, st.maxMonths, st.charId) : 0;
  const res = { status: won ? 'won' : 'lost', reason: won ? 'goal' : bankrupt ? 'bankrupt' : 'time', months, turns: st.turn, stars, netWorth: m.netWorth, passive: m.passive, expenses: m.expenses, cashflow: m.cashflow, impact: Math.floor(st.world.impact || 0), progress: m.goalProgress, stats: { ...st.stats }, lesson: w.lesson, worldId: w.id, charId: st.charId, nearMiss: null, tip: null };
  res.nearMiss = nearMiss(st, w, m, res);
  res.leaks = leaksOf(st);
  res.tip = tipFor(st, res);
  res.log = st.log.slice(-80);
  return res;
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
  const w = getWorld(worldId);
  return [...w.board].map((ch, i) => ({ index: i, ch, ...w.tiles[ch] }));
}
/** Lightweight world list for the lobby/map. */
export function worldList() {
  return WORLDS.map((w) => ({ id: w.id, order: w.order, name: w.name, tagline: w.tagline, goal: w.goal, goalLabel: w.goalLabel, maxMonths: w.maxMonths, stars: w.stars, theme: w.theme, mechanic: w.mechanic, characters: w.characters.map((c) => characterCard(w, c)) }));
}
export function characterCard(w, c) {
  const exp = c.expenses.reduce((s, e) => s + e[1], 0);
  return { id: c.id, name: c.name, desc: c.desc, salary: c.salary || 0, salaryUsd: c.salaryUsd || 0, cash: c.cash, expenses: exp, surplus: (c.salary || Math.round((c.salaryUsd || 0) * (w.start.usd || 0))) - exp, perk: c.perk || null, icon: c.icon || null };
}
export { achievementById };
