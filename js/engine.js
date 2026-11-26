// מירוץ העכברים 2.0 — pure game engine.
// No DOM, no THREE, no Math.random, no Date. Same seed + same decisions ⇒ same game, in the browser and in Node.
// Every random draw comes from a named seeded stream in state.rng and is consumed by *where the pawn lands*, never by
// *what the player decides* — so in a seeded challenge everyone sees the same dice and the same cards.
// See ENGINE.md for the full API contract.

import { next, int, shuffle, weighted, makeStreams, STREAMS, mix32, LAZY_STREAMS, lazyStreamSeed } from './rng.js';
import * as BK from './finance/bank.js';
import * as IV from './finance/invest.js';
import { WORLDS, getWorld, registerWorld, ensureWorld, isLoaded, loadedWorlds, onRegister } from './worlds/index.js';
import { GOALS } from './worlds/goals.js';
import { money, moneyCard, moneyShort, moneyTiny, moneyFull } from './money.js';
import { checkAchievements, achievementById } from './achievements.js';
import * as BIZ from './finance/business.js';
import { TAX, slip, grossFromNet, marginalRate, PLANS, PLAN_IDS, LIFE_CFG, LIFE_EVENTS, LIFE_QUIET, LESSONS as LIFE_LESSONS, creditBand } from './life.js';
const LIFE_EVENT_QUIET = LIFE_QUIET;
import { registerRealData, loadRealData, scenarioList as histScenarios, scenarioById, seriesAt, addYm, ymText, normYm, hasRealData, inflate } from './history.js';
import * as MN from './systems/mentor.js';
import * as FC from './systems/focus.js';
import * as DD from './systems/dd.js';
import * as CY from './systems/cycle.js';
import { RULES4_FROM, RULES5_FROM, RULES6_FROM, RULES7_FROM, rulesForDay, dayOf } from './systems/rules.js';
import * as CT from './systems/content.js';
import * as CH from './systems/chains.js';
import * as RV from './systems/rivals.js';
import * as DR from './systems/dreams.js';
import { recapOf, DIM_META } from './systems/recap.js';
import * as PR from './practice.js';
export { MN, FC, DD, CY, CH, RV, DR };
/** T6 §1: the four rival personas (the UI and the ghost policies read this table). */
export const RIVALS = RV.ARCH;
/** T4 E-7: the four dreams (texts exactly spec §6.1). */
export const DREAMS = DR.DREAMS;
export { DIM_META };
/** T6 §2.6: bumped with every outcome-changing engine release (part of the ghost cache key; add to the re-pin checklist). */
export const OUTCOME_REV = 1;
/** T4 E-2: the first N rolls of a brand-new player's first game cost no ⚡ (st.tutorialFree). */
export const TUTORIAL_FREE_ROLLS = 10;
/** CR-29: the rule set a ranked game is created (and verified) with, from its date key — shared with verify_core.js rulesFor. */
export { RULES4_FROM, RULES5_FROM, RULES6_FROM, RULES7_FROM, rulesForDay, dayOf as rulesDayOf };
/** CATALOG-25 §4: the content-pool system (pure; pools are world data). */
export { CT };
/** Worlds wave 0: the registry (lazy worlds), the map meta and the one money formatter (js/money.js). */
export { registerWorld, ensureWorld, isLoaded, loadedWorlds, money, moneyShort, moneyTiny, moneyFull }; // the map meta: js/worlds/meta.js (via js/progress.js)
export const cyclePath = CY.cyclePath;

/** T2 rules gate: 3 = exact v3 behaviour (in-flight ranked games, rollback), 4 = due diligence, cycle, focus, new option sets. */
const R4 = (st) => (st.rules || 3) >= 4;
/** Full-upgrade rules gate (E1 B1/B2/A1 + balance C1/C2, J1 E7): 5 = new free/learning games and ranked games from RULES5_FROM. Rules 3/4 stay
 *  byte-identical (golden fixtures); no new RNG draws in rules 5 (every stream keeps its fixed draw count). */
const R5 = (st) => (st.rules || 3) >= 5;
/** Worlds wave 0 rules gate: 6 = the world mechanic modules (js/worlds/mech/*), stream `world`, action `Z`, new goal types. For w1–w4 rules 6
 *  is IDENTICAL to rules 5 (no rule reads R6 in a world without a module; tools/replay-corpus.mjs proves it). New worlds have minRules 6. */
const R6 = (st) => (st.rules || 3) >= 6;
void R6;
/** CATALOG-25 rules gate: 7 = the lazy streams `exch` / `content` (created only for a world that declares them), the market module, content
 *  pools on tiles. For every world without them rules 7 is IDENTICAL to rules 6 (no rule reads R7 there; tools/replay-corpus.mjs proves it). */
const R7 = (st) => (st.rules || 3) >= 7;
/** The newest rule set (free and learning games start with it). */
export const RULES_CURRENT = 7;
export const RULE_SETS = [3, 4, 5, 6, 7];
const RANKED_MODES = ['daily', 'weekly', 'challenge'];

/** The lessons library: life lessons + the business module's lessons (ids biz_…). */
export const LESSONS = LIFE_LESSONS.concat(BIZ.BIZ_LESSONS);
const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
export function lessonsList() { return LESSONS.map((l) => ({ ...l })); }
export { inflate, registerRealData, loadRealData };

export const SAVE_VERSION = 4;
export { WORLDS, getWorld, PLANS, slip as payslipFor };
/** Scenarios for מכונת הזמן ([] until js/data/real.js is available). */
export function scenarioList() { return histScenarios(); }
/** ⚡ cost of one roll: ranked modes are free (the lobby lead's js/energy.js owns the real-time limit). */
export function rollCost(st) {
  if (!st) return 1;
  if (['daily', 'weekly', 'challenge'].includes(st.mode)) return 0;
  if (st.learn) return 0;                                                          // T4 learning mode: no ⚡
  if (st.tutorialFree && (st.turn || 0) < TUTORIAL_FREE_ROLLS) return 0;           // T4 review M-2: a new player's first 10 rolls
  return 1;
}

/* ============================================================ formatting (exported for the UI) */
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** ₪1,234 / −₪1,234 (v1 style, U+2212 minus). */
export function fmt(n) { const r = Math.round(n); return (r < 0 ? '−' : '') + '₪' + groups(Math.abs(r)); }
/** Like fmt but ≥ ₪1M becomes "₪1.25 מיליון". */
export function fmtM(n) { return moneyCard(n); } // js/money.js: byte-identical below ₪999.5M, then "₪1 מיליארד" (was "₪1000 מיליון")
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
export function tpl(s, vars = {}) { return heMonthFix(String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))); }
/** Hebrew month counts: 1 → "חודש", 2 → "חודשיים", n → "n חודשים" (integers; decimals stay "1.5 חודשים"). */
export function heMonths(n) { return n === 1 ? 'חודש' : n === 2 ? 'חודשיים' : `${n} חודשים`; }
/** Fix a filled template's "1 חודשים" / "2 חודשים" / "1 חודשי …" (a whole number, not part of 11 / 1.5 / 1,000). */
export function heMonthFix(s) { return String(s).replace(/(^|[^\u05D0-\u05EA])([לב])־1 חודשים/g, '$1$2חודש').replace(/(^|[^\u05D0-\u05EA])([לב])־2 חודשים/g, '$1$2חודשיים').replace(/(^|[^\d.,])1 חודשים/g, '$1חודש').replace(/(^|[^\d.,])2 חודשים/g, '$1חודשיים').replace(/(^|[^\d.,])1 חודשי /g, '$1חודש '); }
/** "סימן אזהרה אחד" / "n סימני אזהרה". */
const warnSigns = (n) => (n === 1 ? 'סימן אזהרה אחד' : `${n} סימני אזהרה`);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ============================================================ create / save */
/**
 * Create a new game.
 * @param {object} o {worldId, charId, seed, mode:'free'|'daily'|'weekly'|'challenge', maxMonths?, tutorial?, rules?, mentor?,
 *   dateKey? — ranked modes: the day key the server stores (daily 'YYYY-MM-DD', weekly 'YYYY-Www', challenge: the Israel date of
 *   its creation); when given it decides st.rules (CR-29, js/systems/rules.js) and wins over `rules`}
 */
export function createGame(o = {}) {
  const history = o.mode === 'history' || o.worldId === 'h';
  const w = getWorld(history ? 'h' : (o.worldId || 'w1'));
  const ch = w.characters.find((c) => c.id === o.charId) || w.characters[0];
  const seed = ((o.seed ?? 1) >>> 0) || 1;
  const mode0 = history ? 'history' : (o.mode || 'free');
  const rules0 = Math.max(RANKED_MODES.includes(mode0) && o.dateKey != null ? rulesForDay(o.dateKey) : (RULE_SETS.includes(o.rules) ? o.rules : RULES_CURRENT), w.minRules || 0); // a module world never runs under older rules
  let scen = null;
  if (history) { if (!hasRealData()) throw new Error('history data not loaded'); scen = scenarioById(o.scenarioId); }
  const st = {
    v: SAVE_VERSION, worldId: w.id, charId: ch.id, charName: ch.name, gender: o.gender === 'f' || o.gender === 'm' ? o.gender : (ch.gender || 'm'), seed, mode: history ? 'history' : (o.mode || 'free'),
    maxMonths: history ? scen.months : (o.maxMonths ?? charMaxMonths(w, ch, rules0)),
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
  if (rules0 >= 7 && Array.isArray(w.streams)) for (const nm of w.streams) if (LAZY_STREAMS.includes(nm)) st.rng[nm] = lazyStreamSeed(seed, nm); // CATALOG §3.8: lazy streams, only here
  if (rules0 >= 7 && w.content && st.rng.content != null) CT.initContent(st, w.content, () => next(st.rng, 'content')); // §4.4: the seeded active packs (1 draw per pool)
  if (mechsOf(w).length) { st.rules = rules0; for (const M of mechsOf(w)) if (M.init) M.init(st, w, ch, MCTX); } // worlds wave 0: module state (0 'world' draws; w1–w4 untouched)
  updateDerivedPrices(st);
  for (const a of ch.assets || []) addAsset(st, a, { start: true, fixed: a.fixedRate != null });
  for (const [tk, q] of Object.entries(ch.holdings || {})) {
    st.holdings[tk].qty = q; st.holdings[tk].basis = Math.round(q * st.prices[tk]);
  }
  if (w.crypto) launchCoin(st, next(st.rng, 'deal'), true);
  initLife(st, ch);
  if (history) initHistory(st, scen);
  // T2: rules gate, mentor level, dev-only ablation switches (sim), the economic cycle (2 'cycle' draws, rules 4 only)
  // CR-29: a ranked game takes its rules from its date key exactly as the verifier will (js/systems/rules.js = verify_core rulesFor)
  st.rules = rules0;
  if (RANKED_MODES.includes(st.mode) && o.dateKey != null) st.dateKey = String(o.dateKey); // kept for migration / replayConfig (review B1)
  st.mentor = MN.defaultLevel({ mode: st.mode, tutorial: st.tutorial, mentor: o.mentor, worldId: st.worldId });
  if (o._dev && (o._dev.noCycle || o._dev.noDD || o._dev.noRival)) {
    if (RANKED_MODES.includes(st.mode)) throw new Error('dev flags are not allowed in ranked modes');
    st._dev = { noCycle: !!o._dev.noCycle, noDD: !!o._dev.noDD };
    if (o._dev.noRival) st._dev.noRival = true;
  }
  // T4 E-1 (outcome-neutral inputs): learning mode, the dream, the free tutorial rolls — free mode only
  const free = st.mode === 'free';
  st.learn = free && !!o.learn;
  st.dream = free && o.dream ? DR.newDream(o.dream) : null;
  st.tutorialFree = free && !!o.tutorialFree;
  // T6 §2.1: a ghost game names its own archetype (the persona slot equal to it becomes "another investor"; outcome-neutral)
  st.self = RV.ARCH[o.self] ? o.self : null;
  st.econ = null;
  if (R4(st)) { const r1 = next(st.rng, 'cycle'), r2 = next(st.rng, 'cycle'); if (!history && !(st._dev && st._dev.noCycle)) st.econ = CY.initEcon(r1, r2, st.worldId); }
  v4Defaults(st);
  if (R5(st)) { st.life.repayOk = st.loans; st.life.repayCr = 0; } // E1 B1 (rules 5 only: rules 3/4 states stay byte-identical)
  // T4 E-3: the tutorial intro card (w1, rules 4, free) is the first pending event — no draw
  if (st.tutorial && st.worldId === 'w1' && R4(st)) {
    const E0 = expensesOf(st); const cost = clamp(r100(0.12 * E0), 600, 3500); const inst = Math.ceil(cost * 1.05 / 3 / 10) * 10;
    st.intro = { step: 'salary', glitch: { cost, inst, fee: 3 * inst - cost, diy: r100(0.3 * cost) }, choice: null, before: null, goal: null };
    st.pending = { id: st.nextEventId++, type: 'intro', tile: null, pos: st.pos, month: st.month, k0: 0 };
    st.phase = 'event';
  }
  tlPush(st, true); // T6 §4.1: the starting row (month 1), then one row per payday
  return st;
}
/** T6 balance decision (a): the time limit of a character — rules 4 may give a character a gentler limit (`maxMonths4`). */
function charMaxMonths(w, ch, rules) { return (rules >= 4 && ch && ch.maxMonths4) || (ch && ch.maxMonths) || w.maxMonths; }

/**
 * Every field a v4 save must have, filled only where missing (idempotent; run by createGame, migrateV3 and every load).
 * Extend THIS function when a later task (T3 …) adds state, so one place keeps old saves loadable.
 */
function v4Defaults(st) {
  const fresh = makeStreams(st.seed);
  for (const k of STREAMS) if (st.rng[k] == null) st.rng[k] = fresh[k];
  { const wd = BY_LOADED(st.worldId); if (wd && (st.rules || 0) >= 7 && Array.isArray(wd.streams)) for (const nm of wd.streams) if (LAZY_STREAMS.includes(nm) && st.rng[nm] == null) st.rng[nm] = lazyStreamSeed(st.seed, nm); } // CATALOG §3.8 (declared worlds only)
  if (st.rules == null) st.rules = 4;
  if (!MN.LEVELS.includes(st.mentor)) st.mentor = MN.defaultLevel({ mode: st.mode, tutorial: st.tutorial, worldId: st.worldId });
  if (st.econ === undefined) st.econ = null;
  const L = st.life;
  if (L) {
    if (!L.focus) L.focus = { id: 'none', m: st.month, opsOpen: false, opsUsed: false };
    if (!Array.isArray(L.agenda)) L.agenda = [null, null];
    if (!L.focusMonths) L.focusMonths = Object.fromEntries(FC.FOCUS_IDS.map((id) => [id, 0]));
    if (L.debtDeal === undefined) L.debtDeal = null;
    if (L.frugalCuts == null) L.frugalCuts = 0;
  }
  const D = st.dq || (st.dq = { decisions: [], sum: 0, n: 0, mastery: {}, luck: {} });
  if (D.hints == null) D.hints = 0;
  if (!Array.isArray(D.levelChanges)) D.levelChanges = [];
  if (!D.luck) D.luck = {};
  for (const k of ['index', 'angels', 'crypto', 'negotiation', 'raise', 'friend', 'dd', 'cycle']) if (D.luck[k] == null) D.luck[k] = 0;
  for (const k of ['inspections', 'inspectSpent', 'ddRepairs', 'ddAvoided', 'ddPassed']) if (st.stats[k] == null) st.stats[k] = 0;
  if (D.luck.story == null) D.luck.story = 0;
  ensureStoryState(st); // T3: story state, expense tags, the v3 friend loan → the friend chain, business T3 upgrade (rules 4)
  // T4 E-11 (no randomness; outcome-neutral unless chosen in createGame)
  if (st.learn === undefined) st.learn = false;
  if (st.dream === undefined) st.dream = null;
  if (st.intro === undefined) st.intro = null;
  if (st.tutorialFree === undefined) st.tutorialFree = false;
  if (!st.practice || typeof st.practice !== 'object') st.practice = { answered: {} };
  if (!st.practice.answered) st.practice.answered = {};
  if (!D.transfer) D.transfer = {};
  if (!st.lessonCtx) st.lessonCtx = {};
  // T6 §10.1
  if (!st.tl) st.tl = { v: 1, step: 1, from: st.month, m: [], nw: [], liq: [], debt: [], pas: [], exp: [], pg: [], hap: [], en: [] };
  if (!Array.isArray(st.marks)) st.marks = [];
  if (!Array.isArray(D.luckLog)) D.luckLog = [];
  if (D.luck.rival == null) D.luck.rival = 0;
  if (!Array.isArray(st.rivalDeals)) st.rivalDeals = [];
  if (st.stats.rivalLost == null) st.stats.rivalLost = 0;
  if (st.afterWin === undefined) st.afterWin = null;
  if (st.self === undefined) st.self = null;
  if (!Array.isArray(st.bizPast)) st.bizPast = [];
  for (const M of mechs(st)) if (M.defaults) M.defaults(st, MCTX); // worlds wave 0: idempotent module fields (save compatibility)
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
  st.dq = { decisions: [], sum: 0, n: 0, mastery: {}, luck: { index: 0, angels: 0, crypto: 0, negotiation: 0, raise: 0, friend: 0 } };
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
  h.qty = 0; h.basis = 0; h.lowBuy = null; delete h.k;
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
  if (st.v === 3) migrateV3(st);
  if (st.v !== SAVE_VERSION) throw new Error('save_incompatible');
  try { getWorld(st.worldId); v4Defaults(st); } catch (e) { if (/^world_not_loaded/.test(e && e.message)) throw new Error("world_not_loaded " + st.worldId); throw new Error("save_incompatible"); } // worlds wave 0: a lazy world's save needs ensureWorld(id) first
  return st;
}
/**
 * v3 → v4 (T2): new streams (deterministic from the seed; old streams untouched), rules (in-flight ranked games keep rules 3
 * so the verifier can replay them; free/history get rules 4), mentor level, focus/agenda, dq/stats keys, econ.
 * A pending deal drawn under v3 stays a legacy card (no dd: no inspect options, claimed = true numbers).
 */
function migrateV3(st) {
  try {
    getWorld(st.worldId);
    const fresh = makeStreams(st.seed);
    for (const k of STREAMS) if (st.rng[k] == null) st.rng[k] = fresh[k];
    const ranked = RANKED_MODES.includes(st.mode);
    st.rules = ranked ? (st.dateKey ? rulesForDay(st.dateKey) : 3) : 4; // review m8: a dated ranked save follows its date
    st.mentor = ranked ? 'hint' : (st.tutorial || st.worldId === 'w1' ? 'guide' : 'hint');
    st.econ = null;
    if (R4(st)) { const r1 = next(st.rng, 'cycle'), r2 = next(st.rng, 'cycle'); if (!st.history) { st.econ = CY.initEcon(r1, r2, st.worldId); st.econ.hist[0].m = st.month; st.econ.truth[0].m = st.month; } }
    if (st.life) st.life.focus = { id: 'none', m: st.month, opsOpen: false, opsUsed: false };
    v4Defaults(st);
    st.v = 4;
  } catch (e) { throw new Error('save_incompatible'); }
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
    st.v = 3; // chains on to migrateV3
  } catch (e) { throw new Error('save_incompatible'); }
}

/* ============================================================ economy core */
const W = (st) => getWorld(st.worldId);
const BY_LOADED = (id) => (isLoaded(id) ? getWorld(id) : null);
/* ---------------------------------------------------------------- worlds wave 0: mechanic modules (js/worlds/mech/*, DESIGN §4.2) */
const NO_MECH = [];
/** The mechanic modules of a world (w.mech: an array of module objects attached by the world file). [] for w1–w4 / h. */
const mechsOf = (w) => (w && Array.isArray(w.mech) ? w.mech : NO_MECH);
const mechs = (st) => mechsOf(W(st));
/** The module that owns a hook (first one that defines it), or null. */
const mechWith = (st, key) => { for (const M of mechs(st)) if (M[key]) return M; return null; };
// Systems config of a registered later world (I4): world data first, then the system's own table, then a named preset.
onRegister((w) => {
  const S = w.systems || {};
  if (S.cycle) CY.registerWorldCfg(w.id, S.cycle);
  if (S.dd) DD.registerWorldCfg(w.id, S.dd);
  if (S.rivals) RV.registerWorldCfg(w.id, S.rivals);
  if (S.focus) FC.registerWorldCfg(w.id, S.focus);
  for (const l of w.lessonDefs || []) if (l && l.id && !LESSON_BY_ID[l.id]) { LESSONS.push(l); LESSON_BY_ID[l.id] = l; } // lazy-world lessons (pack)
});
const loanUnit = (st) => W(st).loan.unit;
const autoUnit = (st) => W(st).loan.autoUnit || W(st).loan.unit;
/** Monthly cost of bank loans in % of the balance. w2: base + rateMult × current interest rate. */
export function loanPct(st) { const L = W(st).loan; return round2(Math.max(0.1, L.pct + (L.rateLinked ? st.world.rate * (L.rateMult ?? 1) : 0) + bandAdj(st) + cycAdd(st) + focusAdj(st))); }
/** T2 §8.5: the cycle's bank-loan add-on (pp/month; not in w2, whose rate cards drive the rate; econ.hard = impact's hard scenario). */
function cycAdd(st) { if (!st.econ || !R4(st) || (W(st).loan.rateLinked && !st.econ.hard)) return 0; return CY.mult(st.econ, st.worldId, 'loanAdd'); }
/** T2 §6: the debt focus lowers the bank-loan rate for 6 months. */
function focusAdj(st) { const d = st.life && st.life.debtDeal; return d && R4(st) && st.month <= d.until ? d.adj : 0; }
/** Credit-score rate add-on in monthly percentage points = bank.js creditSpread (annual) ÷ 12; refusal band ⇒ +0.125 (forced loans only). */
function bandAdj(st) { const sp = BK.creditSpread(st.life ? st.life.creditScore : LIFE_CFG.creditStart); return sp === null ? 0.125 : sp * 100 / 12; }
/** The bank lends (voluntarily) up to cap × monthly income (salary + passive) — "הבנק בודק שתוכל להחזיר". v3: × credit-score band. */
export function loanCap(st) { const L = W(st).loan; return L.cap ? Math.max(0, Math.floor(L.cap * bandOf(st).capMult * (st.econ && R4(st) ? CY.mult(st.econ, st.worldId, 'loanCap') : 1) * Math.max(salaryNow(st) + Math.max(0, passiveOf(st)), 0) / 1000) * 1000) : Infinity; }
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
const taxPoints = (st) => TAX.points + st.life.family.kids * TAX.kidPoints + (st.life.study.done && st.month - (st.life.study.doneMonth ?? st.month) < 36 ? TAX.degreePoints : 0); // degree: 1 point a year, up to 3 years after graduating
/** Base gross (no plan effects). */
function grossBase(st) { return st.salaryUsd ? r10(st.life.grossUsd * st.world.usd) : st.life.gross; }
/** Take-home pay of the base gross (the "normal month"). */
function baseNet(st) { return slip(grossBase(st), taxPoints(st)).net; }
/** Expected side-hustle income this month (actual is pre-drawn at the payday: ×0.6..1.4). */
function sideExpected(st) { const L = st.life; return L.plan === 'side' ? r10(LIFE_CFG.sideBase * Math.max(1, sideLevel(L)) * Math.max(baseNet(st), 3000) * (L.sideBoost != null && L.sideBoost >= st.month ? 2 : 1)) : 0; }
const sideLevel = (L) => Math.min(3, 1 + Math.floor(L.side.months / LIFE_CFG.sideLevelEvery));
const studyCost = (st) => (st.life.plan === 'study' && !st.life.study.done ? r10(LIFE_CFG.studyCost * Math.max(baseNet(st), 3000)) : 0);
/** Full payslip for a plan (default: the current plan). */
function payslipOf(st, planId) {
  const L = st.life; const P = PLANS[planId || L.plan] || PLANS.work;
  const g0 = grossBase(st);
  if (L.jobless && L.jobless.until >= st.month) {
    const ben = r10(baseNet(st) * 0.6);
    return { gross: 0, overtime: 0, incomeTax: 0, bl: 0, pensionEmployee: 0, net: ben, employerPension: 0, severanceDeposit: 0, pensionDeposit: 0, effectiveTaxRate: 0, marginalRate: 0, jobless: true,
      sideIncome: 0, studyCost: 0, lines: [{ label: 'דמי אבטלה (בערך 60%)', amount: ben }], reality: '🌍 במציאות דמי אבטלה מחושבים לפי הברוטו, עם תקרה, אחרי ימי המתנה, ורק למי שעבד מספיק חודשים.' };
  }
  const cut = payCutOf(st); // T3 grossTemp (crisis job cut) and part time — stacked multiplicatively (T3 review M1)
  const gross = cut ? r10(g0 * P.grossMult * cut.mult) : r10(g0 * P.grossMult);
  const s = slip(gross, taxPoints(st));
  const side = planId && planId !== L.plan ? (planId === 'side' ? r10(LIFE_CFG.sideBase * Math.max(1, sideLevel(L)) * Math.max(baseNet(st), 3000)) : 0) : sideExpected(st);
  const tuition = (planId || L.plan) === 'study' && !L.study.done ? r10(LIFE_CFG.studyCost * Math.max(baseNet(st), 3000)) : 0;
  const lines = [{ label: 'ברוטו', amount: g0 }];
  if (cut) { const g1 = r10(g0 * P.grossMult); if (g1 !== g0) lines.push({ label: g1 > g0 ? 'שעות נוספות' : 'פחות שעות (מנוחה)', amount: g1 - g0 }); lines.push({ label: cut.label || 'קיצוץ זמני בשכר', amount: gross - g1 }); }
  else if (gross !== g0) lines.push({ label: gross > g0 ? 'שעות נוספות' : 'פחות שעות (מנוחה)', amount: gross - g0 });
  lines.push({ label: 'מס הכנסה', amount: -s.incomeTax }, { label: 'ביטוח לאומי ומס בריאות', amount: -s.bl }, { label: 'פנסיה (6%)', amount: -s.pensionEmployee }, { label: 'נטו', amount: s.net });
  return { ...s, base: g0, overtime: gross - g0, pensionDeposit: s.pensionEmployee + s.employerPension + s.severanceDeposit, sideIncome: side, studyCost: tuition, lines,
    reality: '🌍 על ההפרשה שלך לפנסיה יש גם זיכוי ממס, אז הנטו האמיתי קצת גבוה יותר. במשחק קרן הפנסיה כולה במניות ובלי דמי ניהול; במציאות יש מסלולים לפי גיל ודמי ניהול, ואת הכסף מקבלים רק בפרישה.' };
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
/** Owner-run managed businesses: last month's draw (net) — active income, not passive. Worlds wave 0: a module asset flagged `active`
 *  (an owner-run operation, e.g. w5 restaurants before a manager) is a job too. */
function activeBizOf(st) { let x = 0; for (const a of st.assets) { if (a.biz && !a.biz.manager) x += a.bizDraw || 0; else if (a.active) x += assetCf(st, a); } return x; }
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
function assetCfRaw(st, a, neutral = false) {
  if (a.op) { const M = mechWith(st, 'asset'); if (M) return M.asset.cf(st, a, MCTX, neutral); } // worlds wave 0: a module-owned asset kind
  let cf;
  const cm = !neutral && st.econ && R4(st) ? CY.mult(st.econ, st.worldId, isRent(st, a) ? 'cfRent' : 'cfOther') : 1; // T2 §8.5 (multiplier only)
  const cyc = (x) => (cm === 1 ? x : x >= 0 ? x * cm : x * (2 - cm)); // a recession never makes a money-losing line better
  if (a.noi != null) {
    const r = a.fixedRate ?? st.world.rate;
    cf = cyc(a.noi) - (a.debt * r) / 1200;
  } else cf = cyc(a.cf);
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
  for (const a of st.assets) { if (a.biz) { if (a.biz.manager) p += a.bizDraw || 0; continue; } if (a.active) continue; p += assetCf(st, a); } // an owner-run business is a job, not passive income
  for (const tk of Object.keys(st.holdings)) p += st.holdings[tk].qty * tickerDiv(st, tk);
  return Math.round(p);
}
/**
 * The passive income the GOAL counts. Rules ≤ 4: passiveOf. Rules 5 (E1 B2): a managed business counts at its sustainable draw —
 * min(this month's draw, the normalised profit after corporate and dividend tax: BIZ.sustainableDraw) — so emptying the till for two
 * paydays is not "freedom". The cash mechanics (cash flow, payday) still use the real draw.
 */
function goalPassiveOf(st) {
  const p = passiveOf(st); if (!R5(st)) return p;
  let over = 0;
  for (const a of st.assets) if (a.biz && a.biz.manager && !a.biz.closed) over += Math.max(0, (a.bizDraw || 0) - BIZ.sustainableDraw(a.biz));
  const M = mechWith(st, 'goalAccrual'); // worlds wave 0: income earned this month but paid earlier (w5: the allotment's up-front half) counts in its own month
  return M ? p - over + M.goalAccrual(st, MCTX) : p - over;
}
/**
 * The goal hold (paydays in a row) — one place for every rule set. E1 C3 (a 3-payday hold in w2) was measured for rules 5 and NOT adopted:
 * it cost the guide player ~5 pp in w2 (below the ≥ 60 % keep line) for a within-noise durability gain (tools/balance-report.md).
 */
function goalHoldOf(st) { const g = W(st).goal; return g.hold ?? GOAL_HOLD; } // worlds wave 0: a goal may set its own hold (w1–w4: none → 2)
function expensesOf(st) {
  let e = studyCost(st);
  for (const x of st.expenses) if ((!x.until || x.until >= st.month) && (!x.from || x.from <= st.month)) e += x.amount;
  for (const x of st.subs) e += x.amount;
  for (const x of st.pledges) e += x.amount;
  const M = mechWith(st, 'expense'); if (M) e += M.expense(st, MCTX); // worlds wave 0: a module's own monthly charge (w5: the seasonal line's interest)
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
  const M = mechWith(st, 'liability'); if (M) nw -= M.liability(st, MCTX); // worlds wave 0: module debts (w5: the seasonal credit line)
  for (const X of mechs(st)) if (X.worth) nw += X.worth(st, MCTX); // CATALOG §3: module-held value outside st.assets (w10: market holdings + claims)
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
export const GOAL_HOLD = 2; // "החופש צריך להחזיק": 2 consecutive paydays (education review §3.2); read through goalHoldOf
/** Is the world goal met right now (before the goal hold)? */
function goalMet(st) {
  const g = W(st).goal; if (g.type === 'benchmark') return false;
  if (GOALS[g.type]) return GOALS[g.type].met(st, g, GCTX); // worlds wave 0: registered goal types (js/worlds/goals.js)
  if (g.type === 'passive') { const p = goalPassiveOf(st); return p > 0 && p >= expensesOf(st); }
  const nw = netWorthOf(st);
  if (g.type === 'netWorth') return nw >= g.target;
  return nw >= g.target && Math.floor(st.world.impact || 0) >= g.impact;
}
/** Today's Bank of Israel rate (%): the world rate in w2/history, else the 2026 rate. */
const realBoi = (st) => (st.history || W(st).mechanic === 'rate' ? st.world.rate : LIFE_CFG.realBoi);
const savingsRate = (st) => Math.max(0, Math.min(BK.BANK.savingsRate, (realBoi(st) - 1.25) / 100));
const OFFER_CACHE = new Map(); // loanOffer depends only on (BoI, credit band)
/** The game's rates are deliberately inflated (so you feel them); here is what the same product costs in the real world. */
function realWorldRates(st) {
  const boi = realBoi(st) / 100; const score = st.life.creditScore;
  const key = boi + '|' + BK.creditSpread(score);
  let offer = OFFER_CACHE.get(key);
  if (!offer) { const o = BK.loanOffer({ principal: 50000, months: 60, track: 'prime', boiRate: boi, creditScore: score }); offer = { ok: o.ok, annualRate: o.annualRate, effectivePct: o.effectivePct, reason: o.reason }; if (OFFER_CACHE.size > 200) OFFER_CACHE.clear(); OFFER_CACHE.set(key, offer); }
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
  const extra = extraIncomeOf(st); // T3: temporary non-salary income (a friend's repayment plan, a big order) — not passive
  const cashflow = salary + sideIncome + activeBiz + passive + extra - expenses;
  const netWorth = netWorthOf(st);
  const g = w.goal;
  const { goalProgress, goalText, goalParts } = goalOf(st, netWorth, R5(st) ? goalPassiveOf(st) : passive, expenses);
  const incomeLines = [{ label: ps.jobless ? 'דמי אבטלה' : st.salaryUsd ? `משכורת נטו (ברוטו $${groups(Math.round(st.life.grossUsd * PLANS[st.life.plan].grossMult))})` : 'משכורת נטו', amount: salary, id: 'salary' }];
  return metricsRest(st, w, g, ps, L0, salary, sideIncome, passive, expenses, activeBiz, cashflow, netWorth, goalProgress, goalText, goalParts, incomeLines);
}
/** Goal progress (ranking-safe), the goal text and parts — shared by metrics() and the timeline. */
function goalOf(st, netWorth, passive, expenses) {
  const w = W(st); const g = w.goal; const L0 = st.life;
  let goalProgress, goalText, goalParts;
  const holdCap = (x) => (x >= 1 && (L0.goalStreak || 0) < goalHoldOf(st) ? 0.99 + 0.003 * (L0.goalStreak || 0) : x); // 1 only once the goal held
  if (GOALS[g.type]) { // worlds wave 0: a registered goal type (passive12, modValue, all …)
    const G = GOALS[g.type];
    return { goalProgress: holdCap(G.progress(st, g, GCTX)), goalText: G.text(st, g, GCTX), goalParts: G.parts(st, g, GCTX) };
  }
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
    if (R5(st)) { const cut = passiveOf(st) - passive; if (cut > 0) { goalParts[0].bizCapped = cut; goalParts[0].note = `משיכה מעל הרווח של העסק (${fmtM(cut)}) לא נספרת ליעד — זה הכסף של העסק, לא הכנסה`; } }
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
  return { goalProgress, goalText, goalParts };
}
function metricsRest(st, w, g, ps, L0, salary, sideIncome, passive, expenses, activeBiz, cashflow, netWorth, goalProgress, goalText, goalParts, incomeLines) {
  if (sideIncome) incomeLines.push({ label: 'עסק צדדי (משוער)', amount: sideIncome, id: 'side' });
  for (const a of managedOf(st)) if (!a.biz.manager) incomeLines.push({ label: `${a.n} (${st.gender === 'f' ? 'את עובדת' : 'אתה עובד'} בו — לא פסיבי)`, amount: a.bizDraw || 0, id: 'biz:a' + a.id, active: true });
  for (const a of st.assets) if (!a.biz || a.biz.manager) incomeLines.push({ label: a.biz ? `${a.n} (עם מנהל — פסיבי)` : a.n, amount: assetCf(st, a), assetId: 'a' + a.id });
  for (const x of st.incomeExtra || []) if ((!x.until || x.until >= st.month) && (!x.from || x.from <= st.month)) incomeLines.push({ label: x.label + (x.until ? ` (עד חודש ${x.until})` : ''), amount: x.amount, id: x.id, extra: true });
  const rtax = rentTaxOf(st); if (rtax) incomeLines.push({ label: `מס על שכר דירה: 10% מכל שכר הדירה (עברת את תקרת הפטור של ${fmtM(TAX.rentExempt)} בחודש)`, amount: -rtax, id: 'rentTax' });
  for (const tk of Object.keys(st.holdings)) {
    const h = st.holdings[tk]; const d = tickerDiv(st, tk);
    if (h.qty && d) incomeLines.push({ label: `${w.tickers[tk].divLabel || 'דיבידנד'} ${tk}`, amount: Math.round(h.qty * d) });
  }
  const expenseLines = st.expenses.filter((x) => (!x.until || x.until >= st.month) && (!x.from || x.from <= st.month)).map((x) => ({ label: x.label + (x.until ? ` (עד חודש ${x.until})` : ''), amount: x.amount, id: x.id }));
  { const sc = R5(st) ? studyCost(st) : ps.studyCost; if (sc) expenseLines.push({ label: 'שכר לימוד', amount: sc, id: 'study' }); } // E1 A1 (rules 5): also while unemployed
  for (const x of st.subs) expenseLines.push({ label: x.label + ' (מנוי)', amount: x.amount, id: x.id });
  for (const x of st.pledges) expenseLines.push({ label: x.label + ' (תרומה חודשית)', amount: x.amount, id: x.id });
  const RW = realWorldRates(st);
  if (st.loans) expenseLines.push({ label: `ריבית על הלוואה בנקאית (${pct(loanPct(st), 2)} בחודש במשחק · ${RW.bankLoan.realPerYear != null ? `בעולם האמיתי ≈ ${RW.bankLoan.realPerYear}% בשנה` : 'בעולם האמיתי: אין הלוואה בדירוג כזה'})`, amount: loanPay(st), id: 'loan', reality: '⚠ במשחק ההלוואה פתוחה עד שתחזיר. 🌍 הלוואה אמיתית נפרעת בתשלומים חודשיים (קרן + ריבית) לתקופה קבועה.' });
  if (st.credit) expenseLines.push({ label: `ריבית על חוב אשראי (${W(st).creditPct}% בחודש במשחק · ${RW.credit.text})`, amount: creditPay(st), id: 'credit' });

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
  if (w.mechanic === 'history' && st.history) { const H = st.history; Object.assign(wi, { ym: H.ym, ymText: ymText(H.ym), index: st.prices.IDX, indexHist: H.idxHist.slice(-24), rate: st.world.rate, rateHist: st.world.rateHist.slice(-12), cpi: round2(st.life.cpi), home: round2(homeRatio(st)), usd: round2(seriesAt('usdIls', H.ym) || 0), headline: H.headline, benchmark: benchNW(st), scenario: H.name, reality: H.index === 'sp500' ? '🌍 המדד האמריקאי נמדד בדולרים; בקרן שקלית גם שער הדולר משנה (למשל 2007–2012: הדולר ירד מ־4.25 ל־3.92).' : null }); }
  for (const M of mechs(st)) if (M.indicators) Object.assign(wi, M.indicators(st, MCTX)); // worlds wave 0: module chips + the generic panel descriptor (every module, in order)
  const L = st.life; const band = bandOf(st); const idxH = st.holdings.IDX;
  const life = {
    age: round2(L.age), ageText: ageText(L.age), energy: Math.round(L.energy), happiness: Math.round(happyNow(st)), happinessBase: Math.round(L.happiness),
    plan: L.plan, planLabel: PLANS[L.plan].label, plans: PLAN_IDS.map((id) => ({ id, label: PLANS[id].label, desc: PLANS[id].desc, enabled: planAllowed(st, id), current: id === L.plan })),
    creditScore: Math.round(L.creditScore), creditBand: band.label, creditBandId: band.id, loanPctAdj: round2(bandAdj(st)),
    pension: Math.round(L.pension), severance: Math.round(L.severance), cpi: round2(L.cpi), inflationYear: inflKnown(st), inflationLastYear: L.infl.length ? L.infl[L.infl.length - 1] : null,
    realCash: Math.round(st.cash / L.cpi), realNetWorth: Math.round(netWorth / L.cpi),
    studyProgress: L.study.done ? 1 : round2(L.study.months / L.study.need), studyDone: L.study.done, sideLevel: L.plan === 'side' || L.side.months ? sideLevel(L) : 0, sideMonths: L.side.months,
    family: { ...L.family, text: familyText(L.family) }, freeTimeMonths: L.planMonths.rest, burnouts: L.burnouts, jobless: !!(L.jobless && L.jobless.until >= st.month),
    burnoutRisk: round2(burnoutOdds(st).next), autoInvest: L.autoInvest,
    mood: unhappy(st) ? { low: true, below: UNHAPPY, burnoutBelow: LIFE_CFG.burnoutBelow + UNHAPPY_BURN, raiseMult: UNHAPPY_RAISE, text: `מצב רוח מתחת ל־${UNHAPPY}: סכנת שחיקה כבר מתחת ל־${LIFE_CFG.burnoutBelow + UNHAPPY_BURN} 🔋, והסיכוי להעלאה יורד בחצי` } : null,
    raiseEligible: raiseEligible(st), raiseChance: raiseEligible(st) ? round2(raiseChance(st)) : 0,
  };
  const index = { projection: indexProjection(st), maxBuy: st.prices.IDX > 0 ? Math.floor(st.cash / st.prices.IDX) : 0, ticker: 'IDX', price: st.prices.IDX, qty: idxH ? idxH.qty : 0, value: idxH ? Math.round(idxH.qty * st.prices.IDX) : 0, avg: idxH && idxH.qty ? round2(idxH.basis / idxH.qty) : 0,
    history: (L.idxHist || []).slice(-24), autoInvest: L.autoInvest, divPerUnit: round2(tickerDiv(st, 'IDX')) };
  return {
    month: st.month, maxMonths: st.maxMonths, turn: st.turn, mode: st.mode,
    life, payslip: ps, taxes: { ...st.taxes, total: Object.values(st.taxes).reduce((a, b) => a + b, 0) }, index, sideIncome, netWorthTotal: netWorth + Math.round(L.pension), pension: Math.round(L.pension),
    savings: st.savings, emergency: emergencyOf(st, expenses), realWorldRates: realWorldRates(st),
    goalHold: { streak: L.goalStreak || 0, need: goalHoldOf(st), met: goalMet(st) }, goalPassive: goalPassiveOf(st),
    activeBizIncome: activeBiz, businesses: managedOf(st).map((a) => ({ assetId: 'a' + a.id, ...BIZ.summary(a.biz, a.bizRep || null) })),
    totalAssets: totalAssetsOf(st), totalLiabilities: st.loans + st.credit + st.assets.reduce((x, a) => x + a.debt, 0) + modLiability(st), // + module debts (w10: the margin loan)
    cash: st.cash, salary, passive, expenses, cashflow, netWorth, loans: st.loans, credit: st.credit,
    goalProgress, goalText, goalParts, goalType: g.type,
    incomeLines, expenseLines, assets, liabilities, holdings, angels, worldIndicators: wi,
    canRepay: st.loans > 0 && st.cash >= Math.min(loanUnit(st), st.loans), canPayCredit: st.credit > 0 && st.cash >= st.credit,
    loanUnit: loanUnit(st), loanUnitCost: Math.round((loanUnit(st) * loanPct(st)) / 100),
    loanPct: loanPct(st), creditPct: W(st).creditPct, loanCap: Number.isFinite(loanCap(st)) ? loanCap(st) : null,
    loanRoom: Number.isFinite(loanCap(st)) ? Math.max(0, loanCap(st) - st.loans) : null, canBorrow: st.loans + loanUnit(st) <= loanCap(st),
    mentor: mentorBlock(st), focus: focusBlock(st), econ: R4(st) ? CY.econPublic(st.econ, st.month, st.worldId) : null, rules: st.rules || 3,
    ...(T3(st) ? { calendar: calendarOf(st), inbox: { open: st.story.inbox.length, urgent: st.story.inbox.filter((i) => i.due <= st.month + 1).length }, story: { noCar: !!st.story.flags.noCar, area: st.story.flags.area, commute: st.story.flags.commute || 0 } } : {}),
    // T4 / T6 (presentation only)
    learn: !!st.learn, nextGoal: nextGoalOf(st), dream: dreamMetrics(st),
    rivals: { lost: (st.stats && st.stats.rivalLost) || 0, deals: (st.rivalDeals || []).map(rivalPublic) },
    afterWin: st.afterWin ? { m: st.afterWin.m, sinceMonths: st.month - st.afterWin.m } : null,
  };
}
/** T3: this month's temporary extra income (st.incomeExtra, with optional from / until). */
function extraIncomeOf(st) { let x = 0; for (const i of st.incomeExtra || []) if ((!i.until || i.until >= st.month) && (!i.from || i.from <= st.month)) x += i.amount; return x; }
/**
 * The yearly inflation a player can know (T2 §12.1 leak fix): last year's published figure, or the long-run expectation in
 * year one — never the coming year's pre-drawn value (which stays inside the engine and drives the CPI).
 */
function inflKnown(st) { const L = st.life; if (L.infl.length) return L.infl[L.infl.length - 1]; if (st.history) return 0; const C = LIFE_CFG; return round2((1 - C.inflSpikeChance) * (C.inflMin + C.inflMax) / 2 + C.inflSpikeChance * (C.inflSpike[0] + C.inflSpike[1]) / 2); }

/** Compounding preview for the UI (C9): invest.js projectRange — a p10/p50/p90 RANGE with the no-guarantee note. */
const PROJ_CACHE = new Map(); // pure function of `monthly` — memoized (projectRange is the hot path of metrics())
function indexProjection(st) {
  const monthly = st.life.autoInvest || 1000;
  if (PROJ_CACHE.has(monthly)) return PROJ_CACHE.get(monthly);
  const r = IV.projectRange({ pv: 0, monthly, years: 20 });
  const out = { monthly, years: 20, p10: r.p10, p50: r.p50, p90: r.p90, contributed: r.contributed, lossChance: r.lossChance, path: r.path, note: r.note,
    text: 'תחזית בלבד — אין תשואה מובטחת. כ־7% בשנה זה בערך הממוצע ההיסטורי של מניות בעולם לאורך עשרות שנים, לפני דמי ניהול ומס; היו גם שנים של ‎−30%‎ ויותר.' };
  if (PROJ_CACHE.size > 50) PROJ_CACHE.clear();
  PROJ_CACHE.set(monthly, out); return out;
}
/** קרן חירום: the savings account measured in months of expenses (target 3). */
function emergencyOf(st, expenses) {
  const months = expenses > 0 ? Math.round((st.savings / expenses) * 10) / 10 : 0;
  return { balance: st.savings, months, target: 3, covered: months >= 3, rate: round2(savingsRate(st) * 100), text: heMonthFix(`קרן חירום: ${months} חודשי הוצאות`) };
}
function totalAssetsOf(st) { let v = st.cash + (st.savings || 0) + holdingsValue(st) + angelPaper(st) + st.assets.reduce((x, a) => x + assetValue(st, a), 0); for (const X of mechs(st)) if (X.worth) v += X.worth(st, MCTX); return Math.round(v); } // + module-held value (w10: market holdings + claims)
/** Module debts in the balance sheet (the same number netWorthOf subtracts). */
function modLiability(st) { const M = mechWith(st, 'liability'); return M ? Math.round(M.liability(st, MCTX)) : 0; }
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
    value: card.value ?? card.cost, month: st.month, ups: 0, cpi: st.life ? round6(st.life.cpi) : 1,
  };
  if (card.noi != null) { a.noi = card.noi; if (o.fixed) a.fixedRate = round2(st.world.rate + w.rate.fixedPremium); if (card.fixedRate != null) a.fixedRate = card.fixedRate; }
  else a.cf = card.cf;
  if (card.sens) { a.sens = card.sens; a.ref = st.world.usd; }
  if (card.usdLinked) { a.usdLinked = true; a.ref = st.world.usd; }
  if (card.impact) a.impact = card.impact;
  if (card.grow) a.grow = card.grow;
  if (o.golden) a.golden = true;
  if (o.hedge) a.hedge = { rate: st.world.usd, until: st.month + w.fx.hedgeMonths - 1 };
  if (card.op) { const M = mechWith(st, 'asset'); if (M) M.asset.create(st, a, card, MCTX); } // worlds wave 0: module asset state (rooms, profile, price plan …)
  st.assets.push(a);
  return a;
}
const round2 = (x) => Math.round(x * 100) / 100;
function modelFor(st, k) { return W(st).models[k] || null; }

/* ============================================================ city (3D reconciliation) */
/** All 3D objects the board city should show right now: [{key, model, label, kind}] — use on resume. */
export function cityModels(st) {
  const w = W(st); const out = [];
  for (const a of st.assets) out.push({ key: 'a' + a.id, assetId: 'a' + a.id, model: modelFor(st, a.k), label: a.n, kind: a.k, golden: !!a.golden,
    ...(a.biz && a.biz.t3 ? { stage: a.biz.stage || 0, activity: (a.bizRep && a.bizRep.activity) || null } : {}) });   // T3 §10.2 / verify D8: growth stage + last month's activity
  const groupsSeen = new Set();
  for (const tk of Object.keys(st.holdings)) {
    const t = w.tickers[tk];
    if (st.holdings[tk].qty > 0 && t.model && !groupsSeen.has(t.model)) { groupsSeen.add(t.model); out.push({ key: 'h:' + t.model, assetId: 'h:' + t.model, model: t.model, label: t.modelLabel || t.name, kind: 'holding' }); }
  }
  for (const x of st.angels) if (x.status === 'active') out.push({ key: 'v' + x.id, assetId: 'v' + x.id, model: w.models.angel, label: x.n, kind: 'angel' });
  if (w.mechanic === 'angel' && (st.stats.given > 0 || st.pledges.length)) out.push({ key: 'f', assetId: 'f', model: w.models.giving, label: 'הקרן שלך', kind: 'foundation' });
  for (const M of mechs(st)) if (M.cityModels) M.cityModels(st, out, MCTX); // worlds wave 0: module pieces (and per-asset render hints, e.g. w5 occupancy)
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
  if (st.afterWin) return; // T6 §9.1: nothing to farm after the win
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
  return gz(st, tpl(Array.isArray(m) ? m[(st.turn + st.month) % m.length] : m, vars));
}
/* ---------------------------------------------------------------- Hebrew gender: the mentor speaks to her as "את" */
const GZ = [['אתה', 'את'], ['שים לב', 'שימי לב'], ['תחשוב', 'תחשבי'], ['תבדוק', 'תבדקי'], ['תמשיך', 'תמשיכי'], ['תזכור', 'תזכרי'], ['תחפש', 'תחפשי'],
  ['תסתכל', 'תסתכלי'], ['תתחיל', 'תתחילי'], ['תנסה', 'תנסי'], ['תמכור', 'תמכרי'], ['תקנה', 'תקני'], ['תבקש', 'תבקשי'], ['תוודא', 'תוודאי'], ['תשאל', 'תשאלי'],
  ['תשאיר', 'תשאירי'], ['תסגור', 'תסגרי'], ['תוכל', 'תוכלי'], ['תגדר', 'תגדרי'], ['תלמד', 'תלמדי'], ['תרגיש', 'תרגישי'], ['מוכן', 'מוכנה'], ['תצא', 'תצאי'], ['נסה', 'נסי'], ['קח', 'קחי'],
  ['זוכר', 'זוכרת'], ['תחליט', 'תחליטי'], ['תעבור', 'תעברי'], ['תשקיע', 'תשקיעי'], ['תעזוב', 'תעזבי'],
  ['תחתום', 'תחתמי'], ['תשלם', 'תשלמי'], ['תשים', 'תשימי'], ['תרצה', 'תרצי'], ['תציץ', 'תציצי']]; // T3 verify D4: f1 'שתחתום', 'תשלם ריבית', the focus 'תשים'
const GZ_RE = GZ.map(([m, f]) => [new RegExp('(^|[^\u05D0-\u05EA])([ושכבלה]?)' + m + '(?![\u05D0-\u05EA])', 'g'), '$1$2' + f]);
/** Address the player in her/his grammatical gender (st.gender 'f' | 'm'). Data is written in the masculine form. */
function gz(st, text) { if (!text || !st || st.gender !== 'f') return text; let t = String(text); for (const [re, f] of GZ_RE) t = t.replace(re, f); return t; }
export function genderize(text, gender) { return gz({ gender }, text); }

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
  if (st.life) { creditScore(st, BK.CREDIT_DELTAS.forcedLoan); st.life.forcedFlag = true; lesson(st, out, 'forced_loan', need); if (T3(st)) st.life.forcedM = st.month; }
  mark(st, 'forced', need, CUR_K, MARK_WHY[why] || '');
  if (st.dream && st.dream.track) st.dream.track.cleanSince = st.month;
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
  if (st.tutorial && (R4(st) ? tutorialDealOk(st) : st.turn === 0)) { // tutorial: the first roll at which the tutorial deal is eligible lands on a deal tile (rules 3: the very first roll); the seeded draws are still consumed
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
  out.mentor = gz(st, out.mentor);
  Object.assign(out, { die, dice: [a, b], from, to: st.pos, steps });
  if (out.bailout === undefined) out.bailout = null;
  if (out.burnout === undefined) out.burnout = null;
  return out;
}

function payday(st, out, step, landed) {
  const ev0 = LESSON_EV; LESSON_EV = 'יום המשכורת';
  try { paydayImpl(st, out, step, landed); } finally { LESSON_EV = ev0; }
}
function paydayImpl(st, out, step, landed) {
  const w = W(st); const L = st.life; const C = LIFE_CFG;
  const m0 = metrics(st);
  const ps = m0.payslip;
  // pre-drawn, always 4 life draws per payday (decision-independent order)
  const rBurn = next(st.rng, 'life'), rRaise = next(st.rng, 'life'), rSide = next(st.rng, 'life'), rSeed = next(st.rng, 'life');
  L.sideSeed = Math.floor(rSeed * 4294967296);
  L.raiseR = rRaise;
  if (R4(st)) storyDraw(st);                 // T3: exactly 2 'story' draws every payday (rules 4)
  if (T3(st)) storyExpire(st, out);          // T3: unresolved inbox items take their default (business items before the next simulated month)
  const burnout = rBurn < burnoutChance(L.energy, st); // 0 at/above the threshold (= the v3 `energy < burnoutBelow` test); rules 5: lower mood raises it
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
    if (sideAct > 0) {
      const due = Math.round(sideAct * marginalRate(ps.gross || grossBase(st))); L.side.total += sideAct;
      if (L.sideReport) { cf -= due; st.taxes.side += due; if (R4(st)) cf -= sideReportFee(st); } // reported: monthly advance payments (מקדמות) + the accountant (T2), no year-end penalty
      else { L.sideTaxDue += due; if (R4(st)) L.sideFeeDue = (L.sideFeeDue || 0) + sideReportFee(st); } // T3 review M3: the accountant's annual return is due either way — later, in one bill
    }
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
    mark(st, 'burnout', -medical, -1, '');
    out.burnout = { medical, text: mentorLine(st, 'burnout', {}) };
    out.news.push({ kind: 'burnout', text: `נשחקת: חודש בלי משכורת והוצאות רפואיות של ${fmtM(medical)}. התוכנית עברה ל"מנוחה ומשפחה".`, cost: medical });
    out.mentor = out.burnout.text;
  }
  monthlyLife(st, out, { burnout, cf });
  monthlyIndex(st, out);
  monthlyWorld(st, out);
  if (R4(st)) { econStep(st, out); focusRollover(st, out); rivalReveal(st, out); } // T2: 2 'cycle' draws every payday (rules 4), then the monthly focus; T6: lost-deal reveals
  if (T3(st)) storyMonth(st, out, { burnout });
  ensureCash(st, out, 'payday');
  if (st.cash > 0 && L.autoInvest > 0 && st.prices.IDX > 0) {
    const amt = Math.min(L.autoInvest, st.cash); const q = Math.floor(amt / st.prices.IDX);
    if (q > 0) { const h = st.holdings.IDX; const before = holdingKeys(st); const cost = Math.round(q * st.prices.IDX); h.cpi = cpiMix(h, cost, st); st.cash -= cost; h.qty += q; h.basis += cost; L.idxBuys++; if (L.idxSince == null) L.idxSince = st.month; holdingModelDiff(st, before, out); }
  }
  // emergency fund (bank.js savingsMonth: interest − 15% tax)
  if (st.savings > 0) { const sv = BK.savingsMonth({ balance: st.savings, annualRate: savingsRate(st) }); st.savings = sv.newBalance; st.taxes.savings += sv.tax; }
  { const g = w.goal; const G = GOALS[g.type]; if (G && G.onPayday) G.onPayday(st, g, m0.goalPassive, GCTX); } // worlds wave 0: e.g. passive12's ring of the month just paid
  // "החופש צריך להחזיק": the goal must hold on goalHoldOf(st) consecutive paydays
  const held = goalMet(st); const HOLD = goalHoldOf(st);
  L.goalStreak = held ? (L.goalStreak || 0) + 1 : 0;
  if (held && !st.history && L.goalStreak < HOLD) out.news.push({ kind: 'goalHold', streak: L.goalStreak, need: HOLD, text: `החופש צריך להחזיק: עוד ${HOLD - L.goalStreak === 1 ? 'משכורת אחת' : (HOLD - L.goalStreak) + ' משכורות'} כשהיעד מתקיים — ויצאת.` });
  // credit score: clean month +2, open credit-card debt −4
  if (st.credit > 0) creditScore(st, BK.CREDIT_DELTAS.cardUnpaid); else if (!L.forcedFlag && cf >= 0) creditScore(st, BK.CREDIT_DELTAS.cleanMonth);
  L.forcedFlag = false;
  if (R5(st)) { L.repayOk = st.loans; L.repayCr = 0; } // E1 B1: only principal owed now (at this payday) earns the repayment bonus later
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
  // T4 E-8: time in the market — held index units through a −8% month and, 3 paydays later, still hold at least as many (no index sale)
  if (L.timHold && st.month >= L.timHold.m + 3) { const h = st.holdings.IDX; if (h && h.qty >= L.timHold.qty && (L.idxSells || 0) === L.timHold.sells) lesson(st, out, 'time_in_market'); L.timHold = null; }
  // T4 presentation-only ticks: the tutorial goal chain, dream missions, the "the neighbour sells a cart" line
  goalTick(st, out); dreamTickSt(st, out, { payday: true, restPayday: pd.plan === 'rest' && cf >= 0 });
  if (st.tutorial && st.turn >= 1 && !st.flags.tdHint && tutorialDealOk(st)) { st.flags.tdHint = true; out.mentor = 'השכן מוכר עגלת קפה — שווה לבדוק בהטלה הבאה.'; }
  ach(st, out, 'payday', { cf });
  tlPush(st); // T6 §4.1: one timeline row at the very end of every payday
}

/* ---------------------------------------------------------------- T2: economic cycle step + monthly focus rollover (inside payday) */
/** Side-income report: the accountant's monthly fee (rules 4; shown in the report option's label). */
function sideReportFee(st) { return W(st).sideReportFee ?? 200; }
/** 2 cycle draws (always, every rules-4 game, history and the noCycle ablation included — values ignored there). */
function econStep(st, out) {
  const rT = next(st.rng, 'cycle'), rN = next(st.rng, 'cycle');
  const e = st.econ; if (!e) return;
  const neutralCf = st.assets.reduce((x, a) => x + (a.biz ? 0 : assetCfRaw(st, a, true)), 0);
  const nowCf = st.assets.reduce((x, a) => x + (a.biz ? 0 : assetCfRaw(st, a)), 0);
  addLuck(st, 'cycle', (nowCf - neutralCf) - cycAdd(st) * st.loans / 100); // last month's cycle effect on your cashflow (the index part is in luck.index)
  const r = CY.stepEcon(e, rT, rN, st.worldId, st.month);
  if (r.changed && (r.to === 'rec' || r.to === 'exp')) {
    const amp = CY.cycleCfg(st.worldId).amp;
    for (const a of managedOf(st)) a.biz = BIZ.applyShock(a.biz, r.to === 'rec' ? { id: 'cycle_rec', demand: 1 - CY.MULT.bizShock.rec * amp, months: CY.MULT.bizShock.recMonths } : { id: 'cycle_exp', demand: 1 + CY.MULT.bizShock.exp * amp, months: CY.MULT.bizShock.expMonths });
  }
  if (r.labelChanged || st.stats.paydays % 3 === 0) out.news.push({ kind: 'econ', text: CY.headline(e.label, st.month), label: e.label, signal: e.signal });
  if (r.labelChanged && e.label === 'מיתון') mark(st, 'recession', 0, -1, ''); // T6 §4.2: the PUBLIC label, never the sealed phase
  if (r.labelChanged && (e.label === 'מיתון' || e.label === 'צמיחה')) lesson(st, out, 'business_cycle');
}
/** The month's focus ends at payday: `none` gives +3 🔋; the agenda pops and its first entry is activated (paid) if possible. */
function focusRollover(st, out) {
  const L = st.life; const C = FC.focusCfg(st.worldId);
  if (L.focus.id === 'none') { L.energy = clamp(L.energy + C.noneEnergy, 0, 100); L.focusMonths.none++; }
  const next1 = L.agenda[0] || null; L.agenda = [L.agenda[1] || null, null];
  L.focus = { id: 'none', m: st.month, opsOpen: false, opsUsed: false };
  if (!next1 || next1 === 'none') return;
  const why = focusDisabled(st, next1, { agenda: true });
  if (why) { out.news.push({ kind: 'focus', id: next1, text: `המוקד שתכננת (${FC.FOCUS[next1].label}) לא יצא לפועל: ${why}` }); return; }
  activateFocus(st, next1, out, { fromAgenda: true });
  out.news.push({ kind: 'focus', id: next1, text: `המוקד לחודש הזה: ${FC.FOCUS[next1].label}` });
}

/* ---------------------------------------------------------------- v3 monthly life update (inside payday, after cash) */
/**
 * T3 review M4: ONE burnout-odds source for the career card, the HUD and the evaluator. next = the real chance at the next payday
 * (the draw uses the energy you have then = now); after = the chance one payday later if you keep this plan (projected energy).
 */
function burnoutOdds(st) { const L = st.life; const proj = Math.max(0, L.energy + PLANS[L.plan].energy - (L.plan === 'work' || L.plan === 'overtime' ? (L.workLoad || 0) * 4 : 0)); return { next: burnoutChance(L.energy, st), after: burnoutChance(proj, st) }; }
/**
 * E1 C2 (rules 5): low mood has a mechanical bite through existing mechanisms — below UNHAPPY 😊 the burnout threshold is +UNHAPPY_BURN
 * 🔋 higher and a raise is half as likely ("קשה להצטיין כשרע לך"). No new meter, no new draw.
 */
const UNHAPPY = 35, UNHAPPY_BURN = 5, UNHAPPY_RAISE = 0.5;
const unhappy = (st) => !!st && R5(st) && !!st.life && happyNow(st) < UNHAPPY;
function burnoutChance(energy, st) { const C = LIFE_CFG; const below = C.burnoutBelow + (unhappy(st) ? UNHAPPY_BURN : 0); return energy >= below ? 0 : clamp(C.burnoutBase + (below - energy) * C.burnoutSlope, 0, 0.95); }
function creditScore(st, d) { const L = st.life; L.creditScore = clamp(Math.round(L.creditScore + d), 300, 850); }
function happyNow(st) { const L = st.life; return clamp(L.happiness + L.glow.reduce((s, g) => s + g.amt, 0), 0, 100); }
function addGlow(st, amt) { if (amt > 0) st.life.glow.push({ amt: round2(amt) }); }
function setpoint(L) { return LIFE_CFG.setpoint + (L.family.partner === 'married' ? 5 : L.family.partner === 'together' ? 2 : 0) + Math.min(L.family.kids, 2) * 3 + (L.study.done ? 2 : 0) - Math.min(4, L.frugalCuts || 0); }
function planAllowed(st, id) { return id === 'study' ? !st.life.study.done : true; }
function raiseEligible(st) { const L = st.life; return !L.jobless && L.energy >= LIFE_CFG.raiseMin && st.month - L.lastRaise >= LIFE_CFG.raiseEvery; }
function raiseChance(st) { const L = st.life; const c = clamp(0.3 + (L.energy - LIFE_CFG.raiseMin) / 70 + (L.study.done ? 0.2 : 0) + (st.month - L.lastRaise >= 20 ? 0.1 : 0), 0.1, 0.85); const c2 = focusOn(st, 'network') ? Math.min(0.95, c + FC.focusCfg(st.worldId).networkRaise) : c; return unhappy(st) ? round2(c2 * UNHAPPY_RAISE) : c2; }
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
    const load = (L.plan === 'work' || L.plan === 'overtime') ? L.workLoad * 4 - (T3(st) ? st.story.flags.commute || 0 : 0) : 0; // T3: the commute costs 🔋 on work months
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
      if (L.side.months >= C.sideBizAt && !T3(st)) { // T3: the side chain's s4 decides the graduation (its default = this coffee cart)
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
    addLuck(st, 'friend', f.kind === 'lend' ? (f.ok ? f.amount * 0.4 : -f.amount * 0.6) : (f.ok ? f.amount * 0.35 : -f.amount * 0.65), f.k ?? -1);
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
  if ((st.month - 1) % 12 === 0 && st.month > 1) { const ev0 = LESSON_EV; LESSON_EV = 'סוף שנה'; try { yearlyPrices(st, out); } finally { LESSON_EV = ev0; } }
}
/* ---------------------------------------------------------------- managed businesses (js/finance/business.js) */
/** One simulated month for every managed business: owner cash, energy, taxes, lessons, news. Returns the owner's net cash. */
function monthlyBusiness(st, out) {
  let total = 0; const t3 = T3(st) || (R4(st) && !!st.story); const reps = [];
  for (const a of managedOf(st)) {
    const key = 'a' + a.id;
    // exactly 3 draws/month from this business's own sealed stream (+ exactly 2 from its sealed story stream in a rules-4 game)
    const opts = R4(st) && a.biz.t3 ? { cal: calOf(st), story: () => next(st.bizStory, key) } : undefined;
    if (opts && st.bizStory[key] == null) st.bizStory[key] = mix32((st.bizRng[key] >>> 0) ^ 0x51A7E5ED) || 1;
    const res = opts ? BIZ.simulate(a.biz, null, () => next(st.bizRng, key), opts) : BIZ.simulate(a.biz, null, () => next(st.bizRng, key));
    const r = res.report; a.biz = res.business;
    if (opts && STORIES_OFF && a.biz.decide) { const d0 = BIZ.resolveEvent(a.biz, a.biz.decide.key, BIZ.defaultChoice(a.biz.decide.id, a.biz)); if (d0.ok) a.biz = d0.business; }
    if (opts) { reps.push({ a, r }); a.bizRep = BIZ.reportCard(r); } // last month's report (manage / inbox cards: L1 + L2 without the session news)
    a.bizNet = r.toOwner.net; a.bizDraw = r.toOwner.drawNet; a.bizHeadline = r.headline;
    const v = BIZ.valuation(a.biz); a.value = v.price + v.cash + v.receivables;
    total += r.toOwner.net;
    st.taxes.business += r.corpTax + r.toOwner.divTax;
    st.life.energy = clamp(st.life.energy - r.ownerEnergy, 0, 100);
    for (const id of r.lessons || []) lesson(st, out, id);
    const nw = { kind: 'business', assetId: key, name: a.n, headline: r.headline, note: r.notes && r.notes[0] ? r.notes[0].text : null, events: (r.events || []).map((e) => ({ id: e.id, title: e.title, text: e.text })), net: r.toOwner.net, netProfit: r.netProfit, revenue: r.revenue };
    if (opts) { // T3 §10.2: three numbers + one sentence (why), stage, activity; `note` is deprecated = why.sentence
      Object.assign(nw, { type: a.biz.type, icon: a.biz.p.icon, month: a.biz.month, cal: r.cal, revenueGross: r.revenueGross, profit: r.netProfit, cashDelta: r.cash.change, toOwner: r.toOwner.net,
        why: r.why, stage: r.stage ? r.stage.stage : 0, stagePrev: r.stage ? r.stage.prev : 0, activity: r.activity, decide: null, note: r.why ? r.why.sentence : nw.note });
      if (r.stage && r.stage.changed) out.effects.push({ type: 'bizStage', at: key, from: r.stage.prev, to: r.stage.stage });
      out.effects.push({ type: 'bizPulse', at: key, kind: r.events && r.events.length ? 'event' : r.netProfit >= 0 ? 'good' : 'bad', amount: r.netProfit });
      r.newsRef = nw;
    }
    out.news.push(nw);
  }
  if (t3 && reps.length && T3(st)) { bizStoryItems(st, out, reps); for (const { r } of reps) if (r.newsRef && r.decideItem) r.newsRef.decide = r.decideItem; }
  return total;
}
/** Create a managed business asset (paid from cash by the caller). */
function addBusiness(st, typeId, seed, overrides, setup) {
  const A = BIZ.ARCHETYPES[typeId];
  const b = BIZ.create(typeId, R4(st) && st.story ? { month: st.month, overrides, t3: true, setup } : { month: st.month, overrides });
  const a = { id: st.nextId++, k: 'biz', n: A.short || A.name, cost: b.purchasePrice, down: b.purchasePrice, debt: 0, value: b.purchasePrice, cf: 0, month: st.month, ups: 0, cpi: round6(st.life.cpi), biz: b, bizNet: 0, bizDraw: 0 };
  st.assets.push(a); st.bizRng['a' + a.id] = seed >>> 0 || 1;
  if (b.t3) st.bizStory['a' + a.id] = mix32((seed >>> 0 || 1) ^ 0x51A7E5ED) || 1; // T3: the business's own sealed story stream
  // start with the module's smart default (draw / marketing / stock)
  const sg = BIZ.suggest(a.biz); if (Object.keys(sg.decisions).length) { const r = BIZ.applyDecisions(a.biz, sg.decisions); if (r.ok && !r.cashNeeded) a.biz = r.business; }
  return a;
}
/** business.js forecasts are pure but slow (3-month simulations): describe() memoizes the numbers it shows, keyed by the business state. */
const BIZ_MEMO = new Map();
function bizMemo(key, f) { let v = BIZ_MEMO.get(key); if (v === undefined) { v = f(); if (BIZ_MEMO.size > 400) BIZ_MEMO.clear(); BIZ_MEMO.set(key, v); } return v; }
/** Decision presets for the K tile → business.js applyDecisions input. */
function bizDecision(b, id, o = BIZ.decisionOptions(b)) {
  const p = b.p;
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
  L.study.done = true; L.study.doneMonth = st.month; setGross(st, 1 + LIFE_CFG.studyRaise); L.happiness = clamp(L.happiness + 6, 0, 100);
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
    out.news.push({ kind: 'inflation', text: mentorLine(st, 'inflationYear', { infl: pct(infl * 100, 1), wage: pct(infl * C.salaryCpi * 100, 1) }), inflation: round2(infl * 100), reality: '⚠ במשחק השכר תמיד מפגר. 🌍 בישראל לאורך שנים השכר הריאלי בממוצע דווקא עלה; בשנים של אינפלציה פתאומית הוא נשחק.' });
    lesson(st, out, 'inflation'); lesson(st, out, 'wage_lag');
    if (st.cash > 3 * Math.max(1, expensesOf(st))) lesson(st, out, 'real_vs_nominal');
  }
  if (L.sideTaxDue > 0) { // side income without advance payments: billed at year end, +10% penalty (+ the late annual return, rules 4)
    const fee = Math.round(L.sideFeeDue || 0); const bill = Math.round(L.sideTaxDue * 1.1) + fee; st.cash -= bill; st.taxes.side += bill - fee; L.sideTaxDue = 0; L.sideFeeDue = 0; cashFx(out, -bill);
    out.news.push({ kind: 'tax', text: `מס הכנסה: חשבון שנתי על העסק הצדדי — ${fmtM(bill)} (כולל קנס של 10%). 🌍 במציאות פותחים תיק ומשלמים מקדמות כל חודש, ואז אין קנס.`, tax: bill });
    lesson(st, out, 'side_tax');
  }
  newInflationYear(st);
}
/** Index fund + pension: one pre-drawn monthly return (invest.js: 2 draws, always), or the real series in history mode. */
function monthlyIndex(st, out) {
  const L = st.life; const X = LIFE_CFG.idx;
  // invest.js simulateReturns: exactly 2 draws per month (return + crash check), deterministic math (server replay)
  const ec = st.econ && R4(st) ? st.econ : null; // T2 §8.5: the month that just passed sets the drift and the crash odds (same 2 draws)
  const annual = ec ? X.annual + (CY.mult(ec, st.worldId, 'idxAnnual') - CY.mult(null, st.worldId, 'idxAnnual')) : X.annual;
  const crashChance = ec ? X.crashChance * CY.mult(ec, st.worldId, 'idxCrash') : X.crashChance;
  const r0 = IV.simulateReturns({ months: 1, annualReturn: annual, vol: X.vol, crashChance, crash: X.crash, rand: () => next(st.rng, 'index') })[0];
  const p0 = st.prices.IDX; let r = r0;
  if (st.history) {
    const H = st.history; const ym = addYm(H.ym, 1);
    const v = seriesAt(H.index, ym); const v0 = seriesAt(H.index, H.ym);
    r = v && v0 ? v / v0 - 1 : 0;
  }
  st.prices.IDX = Math.max(1, round2(p0 * (1 + r)));
  (L.idxHist ||= []).push(st.prices.IDX); if (L.idxHist.length > 60) L.idxHist.shift();
  const div = (W(st).historyDiv ?? X.div);
  { const h = st.holdings.IDX; if (h && h.qty > 0) addLuck(st, 'index', h.qty * p0 * (r - 0.0033)); } // vs the expected monthly price move
  L.pension = Math.round(L.pension * (1 + r + div));
  L.severance = Math.round(L.severance * (1 + r + div));
  if (r <= -0.08) { const hq = st.holdings.IDX ? st.holdings.IDX.qty : 0; if (hq > 0) { mark(st, 'crash', hq * (st.prices.IDX - p0), -1, ''); if (!L.timHold) L.timHold = { m: st.month, qty: hq, sells: L.idxSells || 0 }; } L.lastCrash = st.month; if (st.story) st.story.idxDropM = st.month; out.news.push({ kind: 'indexDrop', text: `המדד צנח ${pct(-r * 100, 1)} החודש. גם הפנסיה שלך ירדה — על הנייר.`, change: round2(r * 100) }); }
  L.idxPeak = Math.max(L.idxPeak || p0, st.prices.IDX);
  if (st.prices.IDX <= L.idxPeak * 0.8) lesson(st, out, 'drawdown');
}
function homeRatio(st) { const H = st.history; if (!H) return 1; const v = seriesAt('homeIL', H.ym); return v ? v / H.base.home : 1; }
function benchNW(st) { const H = st.history; return H ? Math.round(H.bench.units * st.prices.IDX) : 0; }

/** Unlock a library lesson (once per game). */
function lesson(st, out, id, extra) {
  if (!st.lessons || st.lessons.includes(id) || !LESSON_BY_ID[id]) return;
  st.lessons.push(id);
  const l = LESSON_BY_ID[id];
  // T4 E-6: where you learned it (the first context wins) — presentation only. Any trigger change must update js/data/lessons-meta.js hints.
  let num = null; try { num = numFor(st, id, extra); } catch (e) { num = null; }
  const ev = eventTitleOf(st);
  if (st.lessonCtx) st.lessonCtx[id] = { m: st.month, ev, num };
  (out.lessons ||= []).push({ id, title: l.title, text: l.text, ctx: { month: st.month, worldId: st.worldId, event: ev, num } });
}

/** First-ever bankruptcy with createGame({bailout:true}): the bank restructures instead of ending the game. Once. */
function bailout(st, out) {
  st.flags.bailoutUsed = true;
  if (st.life) creditScore(st, BK.CREDIT_DELTAS.bailout);
  const leaks = leaksOf(st);
  const sold = [];
  for (const a of st.assets.slice()) if (assetCf(st, a) < 0) { bizArchive(st, a); st.cash += assetValue(st, a) - a.debt; sold.push(a.n); st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); }
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
  mark(st, 'bailout', writtenOff + creditFolded, -1, '');
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
    scenarioId: st.history ? st.history.scenarioId : null, lessons: st.lessons.slice(), learning: (({ decisionQuality, decisions, luck, verdicts, hints }) => ({ decisionQuality, decisions, luck, verdicts, hints }))(learningOf(st)),
    mentor: startLevel(st), rules: st.rules || 3, hints: (st.dq && st.dq.hints) || 0,
    config: replayConfig(st), actions: st.actions || [] };
}

/** Per-month world mechanics, all decision-independent draws come from the 'drift' stream. */
function monthlyWorld(st, out) {
  const w = W(st);
  if (st.history) historyMonth(st, out);
  const gm = st.econ && R4(st) ? CY.mult(st.econ, st.worldId, 'grow') : 1; // balance pass (rules 4): values rise faster in a boom and fall in a recession
  for (const a of st.assets) { const g0 = a.grow ?? (w.appreciation ? w.appreciation[a.k] || 0 : 0); const g = gm === 1 ? g0 : g0 >= 0 ? g0 * gm : g0 * (2 - gm); if (g) a.value = Math.round(a.value * (1 + g)); }
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
  for (const M of mechsOf(w)) if (M.monthly) M.monthly(st, out, MCTX); // worlds wave 0: the module's month (its declared fixed 'world' draws)
  if (st.content && w.content && st.rng.content != null) CT.paydayContent(st, w.content, () => next(st.rng, 'content'), st.stats.paydays); // §4.4: rotation (1 draw per pool every 12 paydays)
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
  addLuck(st, 'angels', cash - x.amount * (x.ev ?? 1), x.k ?? -1);
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
  if (x.mult > 1) { const t = gainTax(st, x.amount, cash, x.cpi, out); st.cash -= t; if (t) out.news.push({ kind: 'tax', text: `מס רווח הון על האקזיט: ${fmtM(t)}.`, tax: t }); }
  else if (x.mult < 1) gainTax(st, x.amount, cash, x.cpi, out); // a loss carries forward
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
    case 'doodad': p = { type: 'doodad', card: resolveDoodad(st, clone(drawCard(st, 'doodad', w.doodads, 'doodad'))) };
      if (T3(st) && p.card.car && st.story.flags.noCar) p.card = { ...CH.NO_CAR_DOODAD, a: Math.max(300, r100(CH.NO_CAR_DOODAD.a * lifeS(st) / 9000)), swapped: p.card.n }; // C1: no car, no car repair
      break;
    case 'market': p = w.mechanic === 'history' ? historyMarket(st) : createMarket(st); break;
    case 'crisis': p = { type: 'crisis', card: clone(drawCard(st, 'crisis', w.crises, 'crisis')) }; if ((st.tutorial && st.turn <= 3) || (R4(st) && !st.history && st.month < CRISIS_GRACE)) p.skipped = true; // playtest B6: no month-without-pay before there was a month to build a cushion
      if (!st.history && !p.skipped) { const X = LIFE_CFG.idx; st.prices.IDX = Math.max(1, round2(st.prices.IDX * (1 + X.crisisHit))); st.life.lastCrash = st.month; p.indexHit = X.crisisHit; }
      if (p.card.mk && !p.skipped) { const M = mechWith(st, 'crisis'); if (M) M.crisis.create(st, p, MCTX); } break; // worlds wave 0: a module crisis (e.g. w5's regional tourism slump)
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
    default: { // worlds wave 0: a module tile (its create() consumes its declared fixed 'world' draws, whatever the player then does)
      const T = mechTile(st, ch); if (!T) throw new Error('unknown tile type ' + tile.type);
      p = T.create(st, MCTX); p.type = 'mech'; p.mt = ch; break;
    }
  }
  p.id = st.nextEventId++; p.tile = ch; p.pos = st.pos; p.month = st.month;
  p.k0 = st.actions.length; // T6 §4.4: the card start (replay of actions.slice(0, k0) has this card open, nothing chosen)
  st.pending = p; st.phase = 'event';
  return describe(st);
}
/** Current pending event (re-described), or null. */
export function currentEvent(st) { return st.pending ? describe(st) : null; }

function createDeal(st, forceGolden = null) {
  const w = W(st);
  const base = contentDeal(st, w) || drawCard(st, 'deal', w.deals, 'deal'); // CATALOG §4: a world with a deal pool on this tile (rules 7)
  const gRoll = next(st.rng, 'deal');
  const gIdx = w.golden && w.golden.length ? int(st.rng, 'deal', 0, w.golden.length - 1) : (next(st.rng, 'deal'), 0);
  const negR = next(st.rng, 'deal'); // v3: the seller's answer to a lower offer is sealed with the card
  const rs = ddDraws(st); // T2: exactly 6 'dd' draws on every deal landing (rules 4), whatever the card turns out to be
  const rv = rivalDraws(st); // T6: exactly 4 'rival' draws on every deal landing (rules 4), whatever the card turns out to be
  let card = base; let golden = false; let starter = false;
  if (R4(st) && st.tutorial) { // T4 E-5: the tutorial deal sized to the player's cushion (once, when eligible)
    if (tutorialDealOk(st)) { card = tutorialCard(st); st.flags.tutorialDone = true; starter = true; }
    else if (w.golden && w.golden.length && (forceGolden || gRoll < w.goldenChance)) { card = w.golden[gIdx]; golden = true; }
  }
  else if (st.tutorial && !st.flags.tutorialDone && w.starterDeal) {
    card = clone(w.starterDeal); st.flags.tutorialDone = true; starter = true;
    if (st.cash < card.down) card.down = Math.max(0, Math.floor(st.cash / 100) * 100); // never needs a loan
  }
  else if (forceGolden || (w.golden && w.golden.length && gRoll < w.goldenChance)) { card = w.golden[gIdx]; golden = true; }
  const p = dealPending(st, card, golden, 'deal', starter); p.negR = negR;
  attachDD(st, p, rs, { golden, starter });
  attachRival(st, p, rv);
  return p;
}
/** CATALOG §4.3: the deal tile's card from the world's content pool (fixed POOL_D draws on stream `content`), frozen into an engine card;
 *  null when the world has no pool on this tile (w1–w9: never — no draw) or nothing is eligible (the legacy deck is the fallback). */
function contentDeal(st, w) {
  if (!R7(st) || !st.content || !w.content || !w.content.pools || st.rng.content == null) return null;
  const ch = w.board[st.pos]; const pool = w.content.pools[ch]; if (!pool) return null;
  const inst = CT.select(st, w.content, pool, { worldId: w.id, tier: w.tier, tile: ch, regime: st.mkt ? st.mkt.regime.id : null, phase: st.econ ? st.econ.phase : null },
    () => next(st.rng, 'content'), { band: (w.econ && w.econ.band && w.econ.band.deal) || [0, 0], fmt: (n) => fmtM(n) });
  return inst ? CT.dealCard(inst) : null;
}
/** The 6 dd draws (rules 4 only; rules 3 never touches the stream). */
function ddDraws(st) { if (!R4(st)) return null; const rs = []; for (let i = 0; i < DD.DD_DRAWS; i++) rs.push(next(st.rng, 'dd')); return rs; }
/** Seal the due-diligence truth on an asset-deal pending (no-op for trades/crypto, rules 3 and the noDD ablation). */
function attachDD(st, p, rs, o) {
  if (!rs || p.type !== 'deal' || (st._dev && st._dev.noDD)) return;
  const c = p.card; const rent = !!(W(st).kinds[c.k] || {}).rent;
  p.dd = DD.drawDD(rs, c, st.worldId, { rent, noi: c.noi != null, golden: o.golden, starter: o.starter, down: c.down });
}
/** Tile L: a life dilemma. Deck from the life stream + one outcome draw (always). Ineligible cards swap to their alt. */
function createLife(st) {
  let card = drawCard(st, 'life', LIFE_EVENTS, 'life');
  const r = next(st.rng, 'life');
  if (T3(st)) return storyLifeCard(st, card, r); // T3 §3.5: chain entries, cooldowns, caps and substitution — the same 2 draws, no more
  if (card.when && !card.when(st.life)) card = LIFE_EVENTS.find((e) => e.id === card.alt) || LIFE_EVENTS.find((e) => e.id === 'vacation');
  // T2 §8.5: the cycle swaps job news (no draw; off in w1): a boom turns a layoff into an offer, a recession the reverse
  if (st.econ && R4(st) && CY.cycleCfg(st.worldId).swaps) {
    const to = st.econ.phase === 'exp' && card.id === 'layoff' ? 'jobOffer' : st.econ.phase === 'rec' && card.id === 'jobOffer' ? 'layoff' : null;
    const sw = to && LIFE_EVENTS.find((e) => e.id === to); if (sw && (!sw.when || sw.when(st.life))) card = sw;
  }
  return { type: 'life', eventId: card.id, r };
}
/** History-mode market tile: the latest real headline + a trade window on the index fund at the real price. */
function historyMarket(st) {
  const H = st.history; const h = H.headline;
  return tradePending(st, 'IDX', null, h ? h.text : `${ymText(H.ym)} בשוק`, h ? `${ymText(h.ym)} · המדד עומד על ${fmtP(st.prices.IDX)} (100 = תחילת התקופה).` : `המדד עומד על ${fmtP(st.prices.IDX)} (100 = תחילת התקופה).`, 'market');
}
function dealPending(st, card, golden, source, starter = false) {
  if (card.crypto) return cryptoPending(st, card, source === 'mystery' ? 'mystery' : 'deal', source);
  if (card.tk) return tradePending(st, card.tk, card.p, card.n, card.d, source, golden);
  const c = clone(card);
  // T2 §8.5: the cycle moves deal prices at the draw (value keeps its pre-cycle level → buying in a recession is buying below value)
  if (R4(st) && st.econ && !starter) {
    const m = CY.mult(st.econ, st.worldId, 'dealCost');
    if (m !== 1) { c.value = c.value ?? c.cost; const cost = r100(c.cost * m); c.down = c.cost > 0 ? Math.min(cost, r100(c.down * m)) : c.down; c.cost = cost; }
  }
  return { type: 'deal', card: c, golden, source };
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
  if (card.mk) { const M = mechWith(st, 'market'); if (M) M.market.create(st, p, MCTX); } // worlds wave 0: a module market card (applied at the landing, decision-independent)
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
  const rs = ddDraws(st); // T2: 6 'dd' draws on every mystery landing too (used only if it turns into an asset deal)
  const rv = rivalDraws(st); // T6: 4 'rival' draws on every mystery landing too (used only if it turns into an asset deal)
  if (card.kind === 'golden' && w.golden && w.golden.length) { const p = dealPending(st, w.golden[gIdx], true, 'mystery'); p.mysteryTitle = card.title; p.negR = negR; attachDD(st, p, rs, { golden: true }); attachRival(st, p, rv); return p; }
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
  applyMentor(st, p, ev);
  markMajor(st, ev);
  ev.mentor = gz(st, ev.mentor); ev.text = gz(st, ev.text);
  return ev;
}
/**
 * T2 §5 mentor levels (presentation only — both rule sets). guide: exactly one primary = the evaluator's top option for scored
 * decisions (the card's own default for unscored types; none on quiz / personal / values cards). hint & pro: no primary, and
 * no verdict wording before the decision.
 */
function applyMentor(st, p, ev) {
  const level = st.mentor || 'guide';
  if (level === 'guide') {
    let pick = null;
    if (ev.forcePrimary) pick = ev.options.find((o) => o.id === ev.forcePrimary && o.enabled) || null; // a data-driven guide pick (values cards, story steps)
    else if (!ev.noPrimary) {
      if (ev.type === 'business' && ev.data.mode === 'manage' && st.flags['bz_' + p.id]) pick = ev.options.find((o) => o.id === 'ok' && o.enabled) || null; // one decision per visit, then "המשך"
      else { const pool = scorePool(ev, null); if (pool) { const sc = scoreOptions(st, ev); if (sc.length) { const id = primaryFromScores(ev, sc, st); pick = ev.options.find((o) => o.id === id) || null; } } }
      if (!pick) { const marked = ev.options.filter((o) => o.primary && o.enabled); pick = marked[0] || ev.options.find((o) => o.enabled && SAFE_IDS.includes(o.id)) || ev.options.find((o) => o.enabled) || null; }
    }
    for (const o of ev.options) o.primary = o === pick;
  } else {
    for (const o of ev.options) { o.primary = false; o.label = MN.neutralLabel(o.id, o.label, level); }
    ev.mentor = MN.neutralLabel(null, ev.mentor, level); ev.text = MN.neutralLabel(null, ev.text, level);
    if (ev.data && typeof ev.data.roiVsLoan === 'string') ev.data.roiVsLoan = MN.neutralLabel(null, ev.data.roiVsLoan, level);
  }
  delete ev.noPrimary; delete ev.suggested; delete ev.forcePrimary;
}
/** v3's highlight for a lifestyle trade-off: the card's own default, or — when it needs a loan — the no-loan option that costs least now. */
function guideCheapPick(options, defId, cushion = null) {
  let pick = options.find((o) => o.id === defId && o.enabled);
  const thin = (o) => cushion && (o.effects.cash || 0) < 0 && cushion.money + (o.effects.cash || 0) < cushion.E; // T3: it would leave < 1 month of expenses
  if (!pick || pick.loanAmount || thin(pick)) pick = options.filter((o) => o.enabled && !o.loanAmount).sort((a, b) => (b.effects.cash || 0) - (a.effects.cash || 0))[0] || pick;
  return pick || null;
}
const MAJOR_KINDS = new Set(['buy', 'sell', 'give', 'life', 'plan', 'installments']);
const MAJOR_IDS = new Set(['credit', 'sub', 'refi', 'prepay', 'start', 'biz:sell', 'raise', 'report', 'inspect:2']);
/** §9.1: options that get an impact panel (computed on demand by impactFor, never here). */
function markMajor(st, ev) {
  if (ev.auto) return;
  const E = Math.max(1, expensesOf(st));
  for (const o of ev.options) {
    if (MAJOR_KINDS.has(o.kind) || MAJOR_IDS.has(o.id) || /^offer:/.test(o.id) || (o.effects && Math.abs(o.effects.cash || 0) >= 0.5 * E)) o.major = true;
  }
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

/** The monthly cost of buying for `amount` and then paying a repair of `rep`: the buy's loan, then cash, the emergency fund and a forced loan (as ensureCash). */
function loanWithRepair(st, amount, rep) {
  const L = loanFor(st, amount); const left = st.cash + L.need - amount + Math.max(0, st.savings || 0);
  const unit = autoUnit(st); const extra = rep > left ? Math.ceil((rep - left) / unit) * unit : 0;
  return { need: L.need + extra, monthly: Math.round(((L.need + extra) * loanPct(st)) / 100) };
}

/* ---------------------------------------------------------------- v3 describe helpers */
/** "⚠ במשחק / 🌍 במציאות" line for a deal card (the game exaggerates on purpose — label it). */
function dealReality(st, c, d) {
  const w = W(st); const kind = (w.kinds[c.k] || {});
  if (c.tutorialDeal) return '🎲 מספר של משחק: עגלה כזאת במציאות מחזירה את עצמה הרבה יותר לאט.';
  const parts = [];
  if (kind.rent) parts.push(`⚠ מספרי משחק: ${d.roi}% בשנה על ההון. 🌍 בישראל דירה להשקעה מניבה בערך 2.5%–4% בשנה על המחיר לפני הוצאות, משקיע צריך הון עצמי של 50% לפחות ועוד מס רכישה של כ־8%.`);
  else if (c.k === 'biz' || kind.label === 'עסק') parts.push('⚠ במשחק לעסק תזרים קבוע. 🌍 בעסק אמיתי הכנסות ≠ רווח: שכירות, שכר, מע״מ ומלאי — ורוב העסקים הקטנים לא מחזירים את ההשקעה מהר.');
  if (c.noi != null && d.debt > 0) parts.push('⚠ במשחק משלמים רק ריבית והחוב לא קטן. 🌍 במשכנתא אמיתית (שפיצר) משלמים כל חודש גם חלק מהקרן — החוב יורד, וזה בעצם חיסכון.');
  if (d.loanNeeded) parts.push('🌍 במציאות בנק לא מממן את ההון העצמי של משכנתא — אותו חוסכים.');
  return parts.join(' ') || null;
}
const lifeS = (st) => Math.max(baseNet(st), 3000);
/**
 * Review M4 (c), rules 4: in a world with `lifeMoneyScale` (w1) the money of personal / values life cards and of the life chains
 * (car, move, friend) is scaled down, so a choice the game calls "no single right answer" cannot swing the escape odds by much.
 */
const LIFE_CHAINS = new Set(['car', 'move', 'friend']);
function lifeScale(st, key) { const k = R4(st) && st.story ? W(st).lifeMoneyScale : null; return k && (LIFE_CHAINS.has(key) || key === true) ? k : 1; }
const storyS = (st, chainId) => lifeS(st) * lifeScale(st, chainId);
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
  const t2 = (R4(st) && p.dd && !p.dd.golden && p.dd.flags.includes('rush') ? 0.1 : 0) + (focusOn(st, 'network') ? FC.focusCfg(st.worldId).networkNeg : 0); // a seller in a hurry · the network focus
  return clamp(base * (p.golden ? 0.4 : 1) + (st.life.peek ? 0.1 : 0) + t2, 0.05, 0.95);
}
function autoAmount(st) { const m = metrics(st); return Math.max(0, r100(Math.min(m.cashflow, m.salary * 0.1))); }
function carLine(st) { return st.expenses.find((x) => /רכב|ליסינג|טנדר/.test(x.label)); }
function rentLine(st) { return st.expenses.find((x) => /שכירות|משכנתא/.test(x.label)) || st.expenses.slice().sort((a, b) => b.amount - a.amount)[0]; }
/** ₪ / happiness / energy consequences of one life-event option (previewed on the card). */
function lifeEffects(st, E, o) {
  const S = lifeS(st) * lifeScale(st, !!(E.personal || E.values)); const L = st.life;
  const e = { cash: o.cash ? r100(o.cash * S) : 0, monthly: o.monthly ? r10(o.monthly * S) : 0, months: o.months ?? 0, happiness: (o.happiness || 0) + (o.glow ? o.glow : 0), energy: o.energy || 0, glow: o.glow || 0, note: o.note || '' };
  if (o.carCut) { const c = carLine(st); e.monthly = c ? -r10(c.amount * o.carCut) : 0; e.months = 0; if (!c) e.note = 'אין לך רכב בתקציב — אז אין מה לחסוך.'; }
  if (o.grossMult) { const g0 = grossBase(st); e.salary = slip(r10(g0 * o.grossMult), taxPoints(st)).net - baseNet(st); }
  if (o.jobless) { e.months = o.jobless; e.salary = -r10(baseNet(st) * 0.4); }
  if (o.severance === 'withdraw') e.cash += Math.round(L.severance);
  if (o.friend === 'guarantee') e.risk = r100(1.5 * S);
  if (o.study) e.study = o.study;
  // T3 C5/C6: one sign convention for every life card — flow = signed change to YOUR monthly cashflow; salary always shown
  e.flow = e.monthly ? -e.monthly : 0; if (e.salary == null) e.salary = 0; e.salaryMonths = o.jobless ? o.jobless : 0;
  const cx = { study: L.study, baseNet: baseNet(st) };
  e.total12 = storyMoney({ ...e, salaryMonths: e.salaryMonths }, 12, cx); e.total24 = storyMoney({ ...e, salaryMonths: e.salaryMonths }, 24, cx);
  e.dq = CH.LIFE_DQ[E.id] || 'personal';
  return e;
}

/* ---------------------------------------------------------------- T2 due diligence helpers (§7) */
/** The sealed truth of a dd card's income line, value and repair (impact's shadow may pin base/val to the public expectation). */
function ddTruthOf(c, dd) {
  const base0 = c.noi != null ? c.noi : c.cf;
  return { base: dd.base ?? DD.trueBase(base0, dd.f), value: dd.val ?? Math.round((c.value ?? c.cost) * dd.vf), repair: dd.repair };
}
/**
 * What the player knows about a dd card right now (§7.2): the public flags and the basis the buy options are valued at —
 * level 0 the posterior expectation (+ per-risk scenarios), level 1 the range (its midpoint), level 2 the verified truth.
 * Only the range (level ≥ 1) and the verified numbers (level 2) are derived from sealed values. null = legacy card.
 */
function ddBasis(st, p) {
  const dd = p.dd; if (!R4(st) || !dd || dd.starter) return null;
  const c = p.card; const noi = c.noi != null; const base0 = noi ? c.noi : c.cf; const value0 = c.value ?? c.cost; const down = Math.max(0, c.down);
  const flags = dd.golden ? [{ ...DD.GOLDEN_FLAG }] : dd.flags.map((id) => ({ id, text: DD.flagText(id), kind: 'warn' }));
  const B = { level: dd.level, flags, warn: dd.golden ? 0 : dd.flags.length };
  if (dd.level === 0) {
    const ex = DD.expectFactors(st.worldId, B.warn);
    const rs = dd.golden ? [ex.byRisk[0]].map((x) => ({ ...x, p: 1 })) : ex.byRisk;
    B.r = rs.map((x) => ({ p: x.p, base: DD.trueBase(base0, noi ? x.fNoi : x.f), value: Math.round(value0 * x.vf), rep: Math.round(x.rep * down) }));
    B.base = r10(B.r.reduce((a, x) => a + x.p * x.base, 0)); B.value = Math.round(B.r.reduce((a, x) => a + x.p * x.value, 0)); B.rep = Math.round(B.r.reduce((a, x) => a + x.p * x.rep, 0));
    if (dd.golden) delete B.r;
    return B;
  }
  const t = ddTruthOf(c, dd);
  const cfClaimed = assetCf(st, { k: c.k, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd, ...(noi ? { noi: base0 } : { cf: base0 }) });
  // review M2: both widths from the seller's CLAIMED numbers (public), never from the truth; only the position (jitter) is sealed
  B.range = DD.rangeOf(dd, { base: t.base, value: t.value, repair: t.repair, down, width: Math.max(50, Math.abs(cfClaimed) * 0.3), valueWidth: Math.abs(value0) * 0.06 });
  if (dd.level === 1) { B.lo = B.range.base[0]; B.hi = B.range.base[1]; B.base = r10((B.lo + B.hi) / 2); B.value = Math.round((B.range.value[0] + B.range.value[1]) / 2); B.rep = Math.round(DD.BUCKET_REP[B.range.repair] * down); }
  else { B.base = t.base; B.value = t.value; B.rep = t.repair; }
  return B;
}
/** inspect:1 energy and inspect:2 fee (the scout focus makes the first free and the second half price) + the expert's label. */
function inspectInfo(st, p, scout) {
  const C = DD.ddCfg(st.worldId); const c = p.card; const k = c.k;
  const fee0 = Math.max(C.minFee, r100(C.inspect2Pct * c.cost));
  const label = isRent(st, { k }) ? 'בדק בית ושמאי' : k === 'ship' ? 'סוקר ימי בודק' : 'רואה חשבון בודק את הספרים';
  return { energy: scout ? 0 : C.inspect1Energy, fee: scout ? r100(fee0 * 0.5) : fee0, label };
}
const pubCtxLite = (st) => ({ cash: st.cash, savings: st.savings || 0, E: Math.max(1, expensesOf(st)) });
const scoutOn = (st) => !!(R4(st) && st.life.focus && st.life.focus.id === 'scout' && st.life.focus.m === st.month);
const focusOn = (st, id) => !!(R4(st) && st.life && st.life.focus && st.life.focus.id === id);

const DESCRIBE = {
  /** Worlds wave 0: a module tile (js/worlds/mech/*). The module fills title / text / data / options (each option a plain opt()). */
  mech(st, p, ev) { const T = mechTile(st, p.mt); T.describe(st, p, ev, MCTX); },
  payday(st, p, ev) {
    const pd = p.pd || { amount: 0, salary: 0, passive: 0, expenses: 0, month: st.month };
    const w = W(st);
    ev.title = 'קיבלת משכורת';
    ev.text = `משכורת ${fmtM(pd.salary)}, הכנסה פסיבית ${sgn(pd.passive)}, הוצאות ${fmtM(-pd.expenses)}.`;
    ev.data = { ...pd, cashflow: pd.amount };
    const ratio = pd.expenses ? pd.passive / pd.expenses : 0;
    ev.mentor = passiveGoal(w)
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
    if (R4(st)) ev.data.focus = focusBlock(st); // T2: the payday card hosts the focus picker (the UI calls setFocus → action F)
    ev.sound = pd.burnout ? 'loss' : 'coin';
  },

  edu(st, p, ev) {
    const L = st.life; const S = lifeS(st);
    ev.title = 'לימודים וקריירה'; ev.text = 'איך תשקיע את הזמן שלך בחודשים הקרובים? אפשר גם קורס קצר שמקרב את ההעלאה.';
    ev.mentor = mentorLine(st, 'planAsk', {});
    const cost = r100(0.5 * S);
    ev.data = { plan: L.plan, energy: Math.round(L.energy), studyProgress: L.study.done ? 1 : round2(L.study.months / L.study.need), courseCost: cost, ...shortfallInfo(st, cost) };
    ev.options = planOptions(st);
    if (R4(st)) ev.data.focus = focusBlock(st);
    if (!L.study.done) ev.options.splice(ev.options.length, 0, opt('course', `קורס ערב קצר: ${fmtM(cost)} (+2 חודשי לימוד)`, true, { kind: 'course', effects: { cash: -cost, energy: -4, happiness: 0, note: 'מקרב את סוף הלימודים בלי לשנות תוכנית.' } }));
  },

  tax(st, p, ev) {
    const L = st.life; const T = st.taxes;
    const refund = Math.round(L.taxRefund), bill = Math.round(L.sideTaxDue) + Math.round(L.sideFeeDue || 0); // + the late annual return (T3 review M3)
    const paid = T.income + T.bl; const grossIn = Math.max(1, (st.stats.paydays || 1) * grossBase(st));
    ev.title = 'מס הכנסה — תיאום שנתי'; ev.text = 'פעם בשנה עושים סדר: מקבלים בחזרה מס ששולם ביותר, ומשלמים על הכנסות שלא דווחו.';
    ev.mentor = mentorLine(st, 'taxAsk', {});
    ev.data = { refund, bill, net: refund - bill, taxes: { ...T }, paidTotal: Math.round(paid), effectiveRate: round2(paid / grossIn * 100), ...shortfallInfo(st, Math.max(0, bill - refund)) };
    const label = refund && bill ? `לקבל החזר ${fmtM(refund)} ולשלם ${fmtM(bill)}` : refund ? `לקבל החזר ${fmtM(refund)}` : bill ? `לשלם ${fmtM(bill)}` : 'המשך';
    ev.options = [opt('ok', label, true, { primary: true })];
    if (!L.sideReport && (L.plan === 'side' || L.side.total > 0)) {
      const fee = R4(st) ? sideReportFee(st) : 0; // T2 §11.1 #2: reporting has a cost (the accountant), so it is not always better
      const sideM = L.plan === 'side' ? payslipOf(st).sideIncome : Math.round(L.side.total / Math.max(1, L.side.months || 12));
      const saving = Math.round(0.1 * sideM * marginalRate(grossBase(st)) * 12);
      ev.options.push(opt('report', fee ? `לפתוח תיק ולשלם מקדמות על העסק הצדדי (עלות רו״ח ${fmtM(fee)} בחודש)` : 'לפתוח תיק ולשלם מקדמות על העסק הצדדי', true, { kind: 'report', fee, saving, feeEither: R4(st) })); // rules 4: unreported income also pays the accountant (late annual return, T3 review M3)
    }
    if (!refund && !bill && ev.options.length === 1) { ev.auto = true; ev.toastText = mentorLine(st, 'taxNone', { paid: fmtM(paid), rate: pct(ev.data.effectiveRate, 1) }) || 'אין חוב ואין החזר מס.'; }
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
      if (T3(st)) { // T3 §6.2: start setups (lean / std = 'start' / strong), the season strip and the events-frequency line
        const SU = BIZ.SETUPS[p.typeId] || {}; const setups = []; const extra = [];
        for (const k of ['lean', 'std', 'strong']) {
          if (!SU[k]) continue;
          const id = k === 'std' ? 'start' : 'start:' + k;
          const sb = bizMemo(`offer|${p.typeId}|${k}|${st.month}`, () => { const b2 = BIZ.create(p.typeId, { month: st.month, t3: true, setup: k }); const f2 = BIZ.forecast(b2, BIZ.suggest(b2).decisions, 3, { cal: calOf(st) }); return { cap: b2.purchasePrice, np: f2.netProfit, cash: f2.cashChange }; });
          setups.push({ id, label: SU[k].label, startCapital: sb.cap, forecast3: { netProfit: sb.np, cashChange: sb.cash }, note: SU[k].note || '' });
          if (k === 'std') continue;
          const L2 = loanFor(st, sb.cap); const m2 = Math.round(sb.np / 3);
          extra.push([k, opt(id, `${SU[k].label}: ${L2.need ? `${fmtM(sb.cap)}, הלוואה ${fmtM(L2.need)}` : `לפתוח ב־${fmtM(sb.cap)}`}`, L2.ok, { kind: 'buy', net: m2 - L2.monthly, netLabel: `רווח צפוי בעסק: ${sgn(m2)} בחודש`, loanAmount: L2.need, loanMonthly: L2.monthly, startCapital: sb.cap, reason: L2.ok ? undefined : CAP_REASON })]);
        }
        ev.options = [...extra.filter((x) => x[0] === 'lean').map((x) => x[1]), ev.options[0], ...extra.filter((x) => x[0] === 'strong').map((x) => x[1]), ev.options[1]];
        Object.assign(ev.data, { setups, seasonProfile: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, mult: ((BIZ.SEASONS[p.typeId] || {})[i + 1] || [1])[0] })), eventsText: BIZ.EVENTS_TEXT });
        if (!L.ok && ev.options.some((o) => o.enabled && o.kind === 'buy')) { /* a cheaper setup is still open */ } else if (!L.ok) { ev.auto = true; ev.toastText = `${A.short}: עוד אין לך ${fmtM(A.startCapital)} לפתוח עסק כזה.`; }
        return;
      }
      if (!L.ok) { ev.auto = true; ev.toastText = `${A.short}: עוד אין לך ${fmtM(A.startCapital)} לפתוח עסק כזה.`; }
      return;
    }
    const a = st.assets.find((x) => x.id === p.assetId);
    if (!a || !a.biz) { ev.title = 'העסק נמכר'; ev.text = 'העסק כבר לא שלך.'; ev.mentor = 'הכסף מהמכירה כבר אצלך.'; ev.options = [opt('ok', 'המשך', true)]; ev.auto = true; ev.toastText = 'העסק כבר נמכר.'; ev.data = { mode: 'manage', assetId: 'a' + p.assetId, sold: true }; return; } // T3: sold through a buyer's offer while this card was open
    const b = a.biz;
    const bKey = JSON.stringify(b);
    const o = bizMemo(bKey + '|opts', () => BIZ.decisionOptions(b)); const sm = bizMemo(bKey + '|sum', () => BIZ.summary(b, a.bizRep || null));
    ev.title = `העסק שלך: ${a.n}`; ev.text = a.bizHeadline || 'זמן להחליט: מחיר, עובדים, שיווק, משיכה — או למכור.'; ev.mentor = st.mentor === 'guide' ? o.suggest.why[0] : (mentorLine(st, 'bizAsk', {}) || o.suggest.why[0]);
    if (!ev.tag) ev.tag = 'העסק שלך';
    const base3 = bizMemo(bKey + '|base', () => BIZ.forecast(b, null, 3).netProfit);
    ev.data = { mode: 'manage', assetId: 'a' + a.id, summary: clone(sm), options: clone({ ...o, suggest: undefined }), why: st.mentor === 'guide' ? o.suggest.why.slice() : [], forecast3: base3, lastResult: st.flags['bz_' + p.id] || null };
    const mk = (id, label) => { const d = bizDecision(b, id, o); if (!d || !Object.keys(d).length) return null;
      const r = bizMemo(bKey + '|' + JSON.stringify(d), () => { const x = BIZ.applyDecisions(b, d); return x.ok ? { ok: true, cashNeeded: x.cashNeeded, f: BIZ.forecast(x.business, null, 3).netProfit, energy: BIZ.ownerEnergy(x.business) } : { ok: false, error: x.errors[0] }; });
      if (!r.ok) return opt('biz:' + id, label, false, { kind: 'biz', reason: r.error }); return opt('biz:' + id, label, true, { kind: 'biz', decisions: d, cashNeeded: r.cashNeeded, effects: { netProfit3: r.f, delta3: r.f - base3, energy: -r.energy, note: '' } }); };
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
    if (T3(st)) { // T3 §6.9: this business's open inbox items come first (q:<item>:<choice> → resolveStory, logged 'Q')
      const items = st.story.inbox.filter((i) => i.kind === 'biz' && i.assetId === 'a' + a.id).map((i) => bizCard(st, i)).filter(Boolean);
      ev.data.inbox = items;
      const qs = []; for (const it of items) for (const c of it.options) qs.push(opt(`q:${it.itemId}:${c.id}`, `${it.title}: ${c.label}`, c.enabled, { kind: 'story', story: true, reason: c.reason, effects: c.effects, preview: c.preview, odds: c.odds, default: c.default }));
      ev.options = [...qs, ...ev.options];
      const s1 = sm; Object.assign(ev.data, { l1: clone(s1.l1), l2: clone(s1.l2), stage: s1.stage, stageName: s1.stageName, signature: s1.signature, calendar: calendarOf(st) });
      // the structured block (data.l1 / l2) carries last month's numbers: ev.text no longer repeats them (summaryOnly = "the numbers are in l1")
      if (a.bizRep) { ev.text = 'זמן להחליט: מחיר, עובדים, שיווק, משיכה — או למכור.'; ev.data.summaryOnly = true; }
    }
  },

  life(st, p, ev) {
    if (p.chain && st.story) { // T3: a chain step shown as the tile-L card (car / moving / friend entries)
      const sc = storyCard(st, p.chain.id, p.chain.step, null);
      Object.assign(ev, { title: sc.title, text: sc.text, mentor: sc.mentor, chain: p.chain.id, step: p.chain.step, remember: sc.remember, hint: sc.hint });
      ev.options = sc.options.map((o) => ({ ...o, kind: 'life', story: true }));
      ev.data = { eventId: p.eventId, kind: p.eventId, cash: st.cash, chain: sc.data.chain, remember: sc.remember, hint: sc.hint, personal: sc.personal, values: !sc.personal, cushion: sc.data.cushion, defaultId: null };
      const pr = ev.options.find((o) => o.primary); if (pr) ev.forcePrimary = pr.id; else ev.noPrimary = true;
      ev.sound = 'card'; return;
    }
    const E = LIFE_EVENTS.find((e) => e.id === p.eventId) || LIFE_EVENT_QUIET;
    ev.title = E.title; ev.text = E.text; ev.mentor = mentorLine(st, 'lifeAsk', {});
    ev.data = { eventId: E.id, kind: E.id, cash: st.cash };
    ev.options = E.options.map((o) => {
      const eff = lifeEffects(st, E, o);
      const L = loanFor(st, Math.max(0, -eff.cash));
      return opt(o.id, o.label, true, { kind: 'life', effects: eff, loanAmount: L.need, loanMonthly: L.monthly, chance: o.chance });
    });
    if (E.values && st.mentor === 'guide' && ev.options.length > 1) { // director (T2 gate A1): at guide, car / health / transport highlight the cheapest reasonable option, as v3 did
      const pick = guideCheapPick(ev.options, E.primary, T3(st) ? { money: st.cash + (st.savings || 0), E: Math.max(1, expensesOf(st)) } : null); if (pick) ev.forcePrimary = pick.id;
    } else if ((E.personal || E.values) && ev.options.length > 1) ev.noPrimary = true; // a life choice / lifestyle trade-off has no "right answer" button (§6.8, T2 §10.3)
    else {
      let pick = ev.options.find((o) => o.id === E.primary);
      if (pick && pick.loanAmount) pick = ev.options.filter((o) => !o.loanAmount).sort((a, b) => b.effects.cash - a.effects.cash)[0] || pick;
      if (pick) pick.primary = true;
    }
    ev.data.personal = !!E.personal; ev.data.values = !!E.values;
    if (p.sub) ev.data.substituted = true; // T3 §3.5 (the original card is not revealed)
    for (const o of ev.options) o.dq = CH.LIFE_DQ[E.id] || 'personal';
    ev.sound = 'card';
  },

  deal(st, p, ev) {
    const w = W(st); const c = p.card; const kind = w.kinds[c.k] || {};
    const debt = c.cost - c.down; const value = c.value ?? c.cost;
    const proto = { k: c.k, noi: c.noi, cf: c.cf, debt, sens: c.sens, ref: st.world.usd };
    const B = ddBasis(st, p); // T2 due diligence: null on legacy / rules-3 / starter cards (claimed numbers are the truth)
    const atBase = (pr, base) => (B ? assetCf(st, c.noi != null ? { ...pr, noi: base } : { ...pr, cf: base }) : assetCf(st, pr));
    const cf = assetCf(st, proto); // claimed ("לפי המוכר")
    const cfShown = B && B.level === 2 ? atBase(proto, B.base) : cf;
    const roi = c.down ? (cfShown * 12 / c.down) * 100 : 0;
    ev.tag = 'הזדמנות · ' + (kind.label || '');
    ev.title = c.n; ev.text = c.d;
    ev.mentor = (st.mentor === 'guide' && c.q) ? c.q : mentorLine(st, 'dealAsk', {}); // a trap question would leak the answer at hint/pro (§7.5)
    const loanYearlyPct = Math.round(loanPct(st) * 12);
    const d = ev.data = {
      kind: c.k, kindLabel: kind.label, debtLabel: kind.debtLabel || 'משכנתא', model: modelFor(st, c.k),
      name: c.n, cost: c.cost, down: c.down, debt, value, discount: value - c.cost, cf: cfShown, roi: Math.round(roi), cash: st.cash,
      roiText: c.down ? `${fmtM(cfShown)} × 12 ÷ ${fmtM(c.down)} = ${Math.round(roi)}% בשנה` : '',
      impact: c.impact || 0, golden: !!p.golden, grow: c.grow || 0, loanYearlyPct,
      rentTax: isRent(st, proto) ? rentTaxOf(st, grossRent(st, proto)) - rentTaxOf(st) : 0, negotiated: p.negotiated || null,
      yield: isRent(st, proto) && c.cost > 0 ? reYield(st, c, proto) : null,
    };
    const prefix = !B ? '' : B.level === 0 ? 'לפי המוכר: ' : B.level === 1 ? 'לפי הבדיקה: ' : 'נבדק: ';
    // a buy option: label + the ONE number that matters (cashflow after the cost of any loan it needs); o.net = the EXPECTED net
    const buyOpt = (id, text, amount, pr) => {
      const L = loanFor(st, amount + (B && B.level === 2 ? B.rep || 0 : 0)); const cfC = assetCf(st, pr); const cfE = atBase(pr, B ? B.base : null); const net = cfE - L.monthly; // review m2: a verified repair is part of the money you need
      // T2 verify D5: at level 1 the repair is only a bucket, so the range also spans the loan a repair in that bucket would add
      const span = B && B.level === 1 ? DD.BUCKET_SPAN[B.range.repair] || [0, 0] : null;
      const shown = !B ? netLabel(net) : B.level === 0 ? prefix + netLabel(cfC - L.monthly) : B.level === 1 ? `${prefix}${fmtM(atBase(pr, B.lo) - loanWithRepair(st, amount, r100(span[1] * Math.max(0, c.down))).monthly)} עד ${fmtM(atBase(pr, B.hi) - loanWithRepair(st, amount, r100(span[0] * Math.max(0, c.down))).monthly)} בחודש` : prefix + netLabel(net);
      const label = L.need ? `הלוואה ${fmtM(L.need)} ו${text}` : (id === 'buy' && w.mechanic !== 'fx' ? `לקנות ב־${fmtM(amount)}` : `${text} ב־${fmtM(amount)}`);
      const basis = { cf: cfE, vf: B ? B.value / Math.max(1, value) : 1, rep: B ? B.rep : 0 };
      if (B && B.r) basis.r = B.r.map((x) => ({ p: x.p, cf: atBase(pr, x.base), vf: x.value / Math.max(1, value), rep: x.rep }));
      if (B && B.level === 1) { basis.lo = atBase(pr, B.lo); basis.hi = atBase(pr, B.hi); }
      return opt(id, label, L.ok, { kind: 'buy', net, netLabel: shown, loanAmount: L.need, loanMonthly: L.monthly, reason: L.ok ? undefined : CAP_REASON, basis });
    };
    if (w.mechanic === 'rate' && c.noi != null && debt > 0) {
      const fr = round2(st.world.rate + w.rate.fixedPremium);
      const prFix = { ...proto, fixedRate: fr };
      const cfFix = B && B.level === 2 ? atBase(prFix, B.base) : assetCf(st, prFix);
      Object.assign(d, { rate: st.world.rate, fixedRate: fr, cfVar: cfShown, cfFix, cfAt: [2, 4, 6, 8].map((r) => ({ rate: r, cf: atBase({ ...proto, fixedRate: r }, B ? B.base : null) })), roiFix: Math.round((cfFix * 12 / c.down) * 100) });
      const ov = buyOpt('buyVar', `ריבית משתנה ${pct(st.world.rate, 2)}`, c.down, proto);
      const of = buyOpt('buyFix', `ריבית קבועה ${pct(fr, 2)}`, c.down, prFix);
      ov.label = `${ov.loanAmount ? 'הלוואה ' + fmtM(ov.loanAmount) + ' + ' : ''}ריבית משתנה ${pct(st.world.rate, 2)} (${ov.netLabel})`;
      of.label = `${of.loanAmount ? 'הלוואה ' + fmtM(of.loanAmount) + ' + ' : ''}ריבית קבועה ${pct(fr, 2)} (${of.netLabel})`;
      d.netVar = ov.net; d.netFix = of.net;
      ev.options = [ov, of, opt('pass', 'לוותר')];
    } else if (w.mechanic === 'fx' && c.sens) {
      const fee = hedgeFee(st, { value: c.value ?? c.cost, sens: c.sens });
      const val = c.value ?? c.cost;
      Object.assign(d, { sens: c.sens, usd: st.world.usd, hedgeFee: fee, hedgeMonths: w.fx.hedgeMonths, usdLinked: !!c.usdLinked,
        cfAtUsd: [-0.5, 0, 0.5].map((dx) => ({ usd: round2(st.world.usd + dx), cf: r10(cfShown * (1 + c.sens * (dx / st.world.usd))), value: Math.round(c.usdLinked ? val * (st.world.usd + dx) / st.world.usd : val * (1 + c.sens * w.fx.valueSens * dx / st.world.usd)) })) });
      const ob = buyOpt('buy', 'קנייה', c.down, proto); const oh = buyOpt('buyHedge', 'קנייה עם גידור', c.down + fee, proto);
      oh.label += ` (גידור ${fmtM(fee)})`;
      ev.options = [ob, oh, opt('pass', 'לוותר')];
    } else {
      ev.options = [buyOpt('buy', 'קנייה', c.down, proto), opt('pass', 'לוותר')];
    }
    const best = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((a, b) => b.net - a.net)[0];
    const first = ev.options.find((o) => o.kind === 'buy');
    d.loanNeeded = first.loanAmount; d.loanMonthly = first.loanMonthly; d.net = first.net; d.netLabel = first.netLabel;
    const roiE = c.down ? Math.round((first.net + first.loanMonthly) * 12 / c.down * 100) : 0;
    d.roiVsLoan = st.mentor !== 'guide'
      ? (first.loanAmount ? `תשואה ${roiE}% בשנה · הלוואה ${loanYearlyPct}% בשנה` : `תשואה ${roiE}% בשנה, בלי הלוואה`)
      : first.loanAmount
        ? `תשואה ${roiE}% בשנה מול הלוואה שעולה ${loanYearlyPct}% בשנה — ${roiE > loanYearlyPct ? 'ההלוואה משתלמת' : 'ההלוואה עולה יותר ממה שהנכס מכניס'}`
        : `תשואה ${roiE}% בשנה, בלי הלוואה`;
    // the card's own default (the guide primary uses the evaluator; this is its tie-break): buy only when it adds money
    // every month (and, in net-worth worlds, is not overpriced / declining) and the one cushion rule (§10.2) is met
    const nwOk = passiveGoal(w) || ((value - c.cost) + (c.grow || 0) * value * 24 >= 0 && (value >= c.cost || cfShown * 24 >= c.cost - value));
    const cush = cushionCheck(pubCtxLite(st), -c.down, best ? best.loanAmount : 0, best ? best.net : 0);
    d.cushionAfter = round2(cush.after);
    if (best && cush.flagged) d.warning = 'אחרי הקנייה יישאר לך פחות מחודש הוצאות. משבר אחד — והבנק יחליט בשבילך.';
    if (best && best.net > 0 && nwOk && !cush.flagged) {
      let pick = best;
      if (w.mechanic === 'fx' && c.sens) { const hedgeNow = (c.sens < 0 && st.world.usd <= w.fx.ref) || (c.sens > 0 && st.world.usd >= w.fx.ref); const oh = ev.options.find((o) => o.id === 'buyHedge'); if (hedgeNow && oh.enabled && oh.net > 0) pick = oh; else pick = ev.options.find((o) => o.id === 'buy' && o.enabled) || best; }
      pick.primary = true;
    } else ev.options.find((o) => o.id === 'pass').primary = true;
    if (!best) { ev.auto = true; ev.toastText = `${c.n}: עוד אין לך מספיק הון, והבנק לא מממן עסקה כזו.`; }
    // T2 due diligence: the public block + inspection options (non-closing), inserted before the buy options
    if (B) {
      const scout = !!(st.life.focus && st.life.focus.id === 'scout' && st.life.focus.m === st.month);
      const ins = inspectInfo(st, p, scout);
      d.dd = { level: B.level, flags: B.flags, claimed: { cf, value, label: 'לפי המוכר' },
        range: B.level >= 1 ? { cf: [atBase(proto, B.lo ?? B.range.base[0]), atBase(proto, B.hi ?? B.range.base[1])], value: B.range.value.slice(), repair: B.range.repair } : null,
        verified: B.level === 2 ? { cf: atBase(proto, B.base), value: B.value, repair: B.rep } : null,
        basis: ['claimed', 'range', 'verified'][B.level], expected: { cf: first.net + first.loanMonthly, value: B.value, repair: B.rep },
        inspect1: { energy: ins.energy, free: scout }, inspect2: { fee: ins.fee, half: scout } };
      if (best && !p.dd.golden) {
        const io = [];
        if (B.level === 0) io.push(opt('inspect:1', scout ? 'לבדוק בעצמי (חינם החודש)' : `לבדוק בעצמי (−${ins.energy} 🔋)`, st.life.energy >= DD.ddCfg(st.worldId).inspect1Min, { kind: 'inspect', cost: { energy: ins.energy, cash: 0 }, reason: st.life.energy >= DD.ddCfg(st.worldId).inspect1Min ? undefined : 'אין לך כוח לבדוק עכשיו' }));
        if (B.level < 2) io.push(opt('inspect:2', `${ins.label} (${fmtM(ins.fee)})`, st.cash >= ins.fee, { kind: 'inspect', cost: { energy: 0, cash: ins.fee }, reason: st.cash >= ins.fee ? undefined : 'אין מספיק מזומן לבדיקה' }));
        const at = ev.options.findIndex((o) => o.kind === 'buy');
        ev.options.splice(at, 0, ...io);
      }
    }
    // v3 negotiation: offer less; the seller's answer was sealed when the card was drawn (p.negR)
    if (best && !p.negotiated && p.negR != null && c.cost > 0 && !c.tutorialDeal) {
      const offers = [5, 10, 15].map((k) => { const ch = negChance(st, p, k); const saved = r100(c.cost * k / 100); return opt('offer:' + k, `להציע ${k}% פחות (${fmtM(saved)}) · סיכוי ${Math.round(ch * 100)}%`, true, { kind: 'offer', chance: round2(ch), saved }); });
      ev.options.splice(ev.options.length - 1, 0, ...offers);
    }
    // T6 §3.4: who else wants this card (public) and the per-step risk on every delay option
    if (p.rv && R4(st)) {
      const h = RV.round2(RV.hazard(st.worldId, p.rv.n, p.rv.steps + 1));
      d.rivals = { n: p.rv.n, who: p.rv.who.map(personaPub), steps: p.rv.steps, hazardNext: h, text: RV.interestText(p.rv), note: p.rv.n ? RV.TEXT.explain : null, chip: p.rv.n ? RV.tplR(RV.TEXT.chip, { p: Math.round(h * 100) }) : null };
      if (p.rv.n >= 1) for (const o of ev.options) if (o.kind === 'inspect' || o.kind === 'offer') o.rivalRisk = h;
    }
    if (c.usdLinked) d.usdLinked = true;
    if (c.op) { const M = mechWith(st, 'deal'); if (M) M.deal.describe(st, p, ev, MCTX); } // worlds wave 0: a module asset card (w5: the 12-month strip)
    d.reality = dealReality(st, c, d);
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
      unrealizedTax: h.qty ? IV.capitalGainsTax({ cost: Math.round(h.basis), proceeds: Math.round(h.qty * price), cpiBuy: h.cpi || 1, cpiSell: st.life.cpi, mode: 'real', lossCarry: st.life.lossCarry }).tax : 0,
    };
    if (p.tk === 'IDX') Object.assign(ev.data, { pension: Math.round(st.life.pension), autoInvest: st.life.autoInvest, history: (st.life.idxHist || []).slice(-24), index: true, projection: indexProjection(st),
      reality: '⚠ במשחק הקרן מחלקת כסף כל חודש. 🌍 רוב קרנות המדד בישראל צוברות את הדיבידנדים בתוך הקרן; תשואת דיבידנד של מדד רחב היא כ־1.5%–3% בשנה. תחזית בלבד — אין תשואה מובטחת.' });
    else ev.data.reality = t.kind === 'gold' ? '⚠ במשחק זהב תמיד עולה במשבר. 🌍 לרוב הוא מתנהג אחרת ממניות, אבל לא תמיד (ב־2008 הוא צנח בכ־30%).' : '⚠ במשחק אין עמלות קנייה ומכירה. 🌍 בבורסה משלמים עמלה בכל פעולה (כ־0.1%, מינימום כמה שקלים) — מסחר תכוף עולה כסף.';
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
    const inst3 = c.inst ? BK.installments({ price: c.a, count: 3 }) : null;
    ev.data = { amount: c.a, need, cash: st.cash, installment: c.inst ? lineInterest(c.a, w.creditPct) : null, installments3: inst3 ? { amounts: inst3.amounts, total: inst3.total, interest: inst3.interest } : null, sub: c.sub || null, ...shortfallInfo(st, c.a),
      reality: c.inst ? `⚠ "אשראי מתגלגל" במשחק: ${w.creditPct}% לחודש. 🌍 ${realWorldRates(st).credit.text}; עד 3 תשלומים בכרטיס הם בדרך כלל בלי ריבית.` : null };
    ev.options = [opt('pay', ev.data.shortfall ? `לשלם ${fmtM(c.a)} (הלוואה ${fmtM(ev.data.loanAmount)})` : `לשלם ${fmtM(c.a)}`, true, { primary: need })];
    // T2 §11.1 #1: the store checks your score for interest-free installments; revolving credit is the fallback for a low score only
    const inst3ok = !R4(st) || st.life.creditScore >= 600;
    if (c.inst && inst3ok) ev.options.push(opt('inst3', `3 תשלומים בלי ריבית (${fmtM(inst3.amounts[0])} בחודש)`, true, { kind: 'installments', amounts: inst3.amounts }));
    if (c.inst && (!R4(st) || !inst3ok)) ev.options.push(opt('credit', `באשראי מתגלגל (${fmtM(ev.data.installment)} ריבית בחודש · ${w.creditPct}% לחודש — החוב עצמו לא קטן)`));
    if (c.sub) ev.options.push(opt('sub', `מנוי: ${fmtM(c.sub)} בחודש, כל עוד הוא פעיל`));
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
      d.offers = own.map((a) => { if (a.biz) { const v = BIZ.valuation(a.biz); const offer = Math.round(v.price * c.mult) + v.cash + v.receivables; const tax = IV.capitalGainsTax({ cost: a.biz.invested, proceeds: offer, cpiBuy: a.cpi || 1, cpiSell: st.life.cpi, mode: 'real' }).tax; return { assetId: 'a' + a.id, name: a.n, offer, debt: 0, tax, netAfterTax: offer - tax, net: offer - tax, profit: offer - tax - a.biz.invested, cf: a.bizDraw || 0, managed: true, equity: v.price + v.cash + v.receivables }; }
        const acf = assetCf(st, a); const offer = Math.round(assetValue(st, a) * (acf > 0 ? c.mult : Math.min(c.mult, 1) * 0.85)); const tax = IV.capitalGainsTax({ cost: a.cost, proceeds: offer, cpiBuy: a.cpi || 1, cpiSell: st.life.cpi, mode: 'real' }).tax; return { assetId: 'a' + a.id, name: a.n, offer, debt: a.debt, tax, netAfterTax: offer - a.debt - tax, net: offer - a.debt - tax, profit: offer - a.debt - tax - a.down, cf: acf, equity: assetValue(st, a) - a.debt }; });
      ev.options = [...d.offers.map((o) => opt('sell:' + o.assetId.slice(1), `למכור את ${o.name} · ${sgn(o.net)}`, o.net >= 0 || st.cash + o.net >= 0, { kind: 'sell', reason: o.net >= 0 || st.cash + o.net >= 0 ? undefined : 'החוב גדול מההצעה' })), opt('done', 'סיום', true, { primary: true })];
      ev.mentor = own.length ? mentorLine(st, 'sellAsk', {}) : mentorLine(st, 'sellNone', {});
      d.reality = '🌍 מס שבח במציאות: 25% מהרווח הריאלי אחרי הוצאות (שיפוץ, עו״ד, תיווך); דירת מגורים יחידה לרוב פטורה, בתנאים.';
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
    if (c.mk) { const M = mechWith(st, 'market'); if (M) M.market.describe(st, p, ev, MCTX); } // worlds wave 0: a module market card (d.amount is charged by CHOOSE.market)
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
      ev.tag = 'שאלת אבא עשיר'; ev.data.reward = 'lesson'; ev.data.lesson = c.lesson || null; ev.data.question = c.text;
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
      ...trims.map((t) => { const L = loanFor(st, t.cost); const net = t.cut - L.monthly; return opt('trim:' + t.expenseId, `לקצץ "${t.label}": ${fmtM(t.cost)} → ${fmtM(-t.cut)} בחודש${R5(st) ? ` · ${TRIM_HAPPY} 😊` : ''}`, L.ok, { kind: 'buy', net, netLabel: netLabel(net), loanAmount: L.need, loanMonthly: L.monthly, payback: Math.ceil(t.cost / Math.max(1, t.cut)), reason: L.ok ? undefined : CAP_REASON, ...(R5(st) ? { hap: TRIM_HAPPY } : {}) }); }),
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
    ev.data = { sector: c.sector, team: c.team, traction: c.traction, hype: c.hype, checks, revealHint: `${w.angel.revealMin}–${w.angel.revealMax} חודשים במשחק (בעולם האמיתי: 5–10 שנים)`, reality: '🌍 תיקי אנג׳לים מחזירים בממוצע בערך את הכסף עד פי 2–2.5 לאורך שנים, עם פיזור עצום — ואצל רוב המשקיעים הבודדים פחות. רק מכסף שמוכנים להפסיד.', active: st.angels.filter((x) => x.status === 'active').length, odds: w.angel.oddsText };
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
/** E1 C1 (rules 5): a lifestyle cut is felt — 😊 now, and the set point drops like a frugal-focus cut (L.frugalCuts, max 4). */
const TRIM_HAPPY = -3;
function trimOffers(st) {
  const w = W(st); if (!w.trim) return [];
  return st.expenses.filter((x) => x.trim && !x.cut).sort((a, b) => b.amount - a.amount).slice(0, 1)
    .map((x) => { const cut = r100(x.amount * w.trim.pct); return { expenseId: x.id, label: x.label, cut, cost: r100(cut * (R5(st) && w.trim.costMonths5 ? w.trim.costMonths5 : w.trim.costMonths)) }; });
}

/* ============================================================ choose */
/**
 * Apply the player's decision on the current event.
 * @param event the event object from landing()/currentEvent() (only its id is checked) — may be null
 * @param optionId one of event.options[].id
 * @param params e.g. {qty} for trade buy/sell
 * @returns {ok, effects, mentor, toast, spawn, despawn, achievements, news, event, done, end, error?}
 */
export function choose(st, event, optionId, params = {}) { return withK(st, () => chooseImpl(st, event, optionId, params)); }
function chooseImpl(st, event, optionId, params = {}) {
  if (st.over) throw new Error('game over');
  const p = st.pending;
  if (!p) throw new Error('no pending event');
  if (event && event.id != null && event.id !== p.id) throw new Error('stale event ' + event.id + ' (pending ' + p.id + ')');
  if (typeof optionId === 'string' && optionId.startsWith('q:')) { // T3 §6.9: an inbox item listed on the manage card → resolveStory (logged 'Q', the card stays open)
    const [, itemId, choiceId] = optionId.split(':');
    const r = resolveStory(st, +itemId, choiceId);
    return { ...r, event: st.pending ? describe(st) : null, done: false, end: r.end || null };
  }
  const ev = describe(st);
  const o = ev.options.find((x) => x.id === optionId);
  if (!o) throw new Error('unknown option ' + optionId + ' for ' + p.type);
  const out = newOut();
  if (!o.enabled) return { ...out, ok: false, error: o.reason || 'האפשרות לא זמינה כרגע', event: ev, done: false, end: null };
  const cash0 = st.cash; const nA = st.assets.length;
  const dq = decisionRecord(st, ev, o, params);
  const close = CHOOSE[p.type](st, p, o, params, out);
  if (out.ok === false) return { ...out, event: describe(st), done: false, end: null };
  if (dq && o.kind === 'buy' && st.assets.length > nA) dq.a = st.assets[st.assets.length - 1].id; // T6 §4.4: the asset a buy created
  if (dq) recordDecision(st, dq, out);
  goalTick(st, out); dreamTickSt(st, out); // T4 E-4 / E-7 (presentation only)
  out.mentor = gz(st, out.mentor);
  act(st, params && params.qty != null ? ['c', optionId, Math.floor(Number(params.qty)) || 0] : ['c', optionId]);
  if (!ev.auto && p.type !== 'intro' && !(p.type === 'payday' && o.id === 'ok') && !(o.id === 'done' && p.type === 'trade')) {
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
  tlPush(st, true); // T6 §4.1: the final state ends the timeline
  if (end.status === 'won') mark(st, 'win', end.netWorth, -1, '');
  if (st.history) { lesson(st, out, 'benchmark'); end.lessons = st.lessons.slice(); }
  ach(st, out, 'end', { end });
  end.achievements = st.ach.slice();
  sound(out, end.status === 'won' ? 'win' : 'lose');
  if (end.status === 'won') out.effects.push({ type: 'confetti' });
  out.mentor = end.afterWin ? end.afterWin.lines[end.afterWin.lines.length - 1] : end.status === 'won' ? mentorLine(st, 'won', {}) : end.reason === 'bankrupt' ? mentorLine(st, 'bankrupt', {}) : mentorLine(st, 'lostTime', { pct: Math.round(end.progress * 100) + '%' });
}

/** T2 §7.3: an inspection opens more information on the same card (non-closing). No draw: the truth was sealed with the card. */
function inspect(st, p, o, out) {
  const ins = inspectInfo(st, p, scoutOn(st)); const L = st.life;
  if (o.id === 'inspect:1') { L.energy = clamp(L.energy - ins.energy, 0, 100); p.dd.level = 1; }
  else { st.cash -= ins.fee; st.stats.inspectSpent += ins.fee; p.dd.level = 2; cashFx(out, -ins.fee, `בדיקה ${fmtM(ins.fee)}`); }
  st.stats.inspections++;
  const B = ddBasis(st, p); const c = p.card; const pr = { k: c.k, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd, noi: c.noi, cf: c.cf };
  const cfAt = (base) => assetCf(st, c.noi != null ? { ...pr, noi: base } : { ...pr, cf: base });
  const rep = { none: 'אין', small: 'קטנים', big: 'גדולים' };
  out.mentor = B.level === 1 ? `בדקת בעצמך: התזרים כנראה בין ${fmtM(cfAt(B.lo))} ל־${fmtM(cfAt(B.hi))} בחודש. תיקונים צפויים: ${rep[B.range.repair]}.`
    : `הבדיקה המקצועית: ${fmtM(cfAt(B.base))} בחודש, שווי ${fmtM(B.value)}, תיקונים ${B.rep ? fmtM(B.rep) : 'אין'}.`;
  sound(out, 'card'); lesson(st, out, 'due_diligence');
}
function buyAsset(st, p, out, o) {
  const w = W(st); const c = p.card;
  // T2: a dd card is bought at its TRUE numbers (sealed when it was drawn); luck = actual − what the basis expected
  let fee = 0;
  if (o.id === 'buyHedge') fee = hedgeFee(st, { value: c.value ?? c.cost, sens: c.sens });
  const ddOn = R4(st) && p.dd && !p.dd.starter; let ddInfo = null;
  if (ddOn) {
    const B = ddBasis(st, p); const t = ddTruthOf(c, p.dd);
    const pr = { k: c.k, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd, noi: c.noi, cf: c.cf, fixedRate: o.id === 'buyFix' ? round2(st.world.rate + w.rate.fixedPremium) : undefined };
    const cfAt = (base) => assetCf(st, c.noi != null ? { ...pr, noi: base } : { ...pr, cf: base });
    ddInfo = { claimedCf: cfAt(c.noi != null ? c.noi : c.cf), claimedValue: c.value ?? c.cost, cfExp: cfAt(B.base), valueExp: B.value, repExp: B.rep, level: p.dd.level, repair: t.repair };
    if (c.noi != null) c.noi = t.base; else c.cf = t.base;
    c.value = t.value;
  }
  const L = loanFor(st, c.down + fee + (p.dd && p.dd.level === 2 && R4(st) ? p.dd.repair || 0 : 0)); // review m2: the verified repair is borrowed with the buy, not forced later
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
  if (ddInfo) {
    const D = ddInfo; const nwW = passiveGoal(w) ? 0.25 : 1;
    a.dd = { claimedCf: D.claimedCf, claimedValue: D.claimedValue, level: D.level, repair: D.repair };
    if (D.repair) { st.cash -= D.repair; st.stats.ddRepairs += D.repair; cashFx(out, -D.repair, `תיקון ${fmtM(D.repair)}`); out.news.push({ kind: 'dd', text: D.level === 2 ? `התיקון שהבדיקה מצאה: ${fmtM(D.repair)}.` : `הפתעה: ${fmtM(D.repair)} תיקונים שלא ידעת עליהם.`, amount: -D.repair }); }
    addLuck(st, 'dd', (cf - D.cfExp) * 24 + nwW * (a.value - D.valueExp) - (D.repair - D.repExp));
  }
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
  if (ddInfo && Math.abs(ddInfo.claimedCf - cf) >= 10) line += ` מוצהר ${fmtM(ddInfo.claimedCf)} · בפועל ${fmtM(cf)}.`;
  out.mentor = line.trim();
  if (ddInfo) { const m0 = out.mentor; ensureCash(st, out, 'deal'); if (out.mentor !== m0) out.mentor = m0 + ' ' + out.mentor; }
  mark(st, 'buy', c.down + fee, CUR_K, a.n); // T6 §4.2
  lesson(st, out, 'asset_liability', cf);
  if (L.need && cf - L.monthly > 0) lesson(st, out, 'good_debt', cf - L.monthly);
  if (a.debt > 3 * Math.max(1, c.down)) lesson(st, out, 'leverage', a.debt);
  if (isRent(st, a) && cf > 0 && rentTaxOf(st) > 0) lesson(st, out, 'rental_tax');
  if (new Set([...st.assets.map((x) => x.k), ...Object.keys(st.holdings).filter((tk) => st.holdings[tk].qty > 0)]).size >= 3) lesson(st, out, 'diversification');
  if (o.id === 'buyVar') lesson(st, out, 'rate_risk');
  if (c.sens) lesson(st, out, 'fx_risk');
  ach(st, out, 'buy', { asset: a, cf, golden: p.golden, loan: L.need });
}

/* ============================================================ §8 understanding vs luck: decision quality (T2 §10) */
// Every real choice is scored 0–100 from what the player could SEE at that moment (public numbers, odds, cushion, debt),
// never from sealed outcomes: optionU reads only the public context pubCtx(st) and the described event. Options within
// half a month of expenses of the best one all score 100 (no artificial "one right answer"). Luck = what actually happened
// minus what was expected, measured separately. Money is unaffected. The same scorer picks the guide-level primary option
// and answers requestHint (scoreOptions), so the highlight never contradicts the evaluator.
const DQ_PRINC = { deal: ['cashflow'], doodad: ['opportunity_cost'], trade: ['risk_size'], market: ['cashflow'], bank: ['rate_risk'], upgrade: ['cashflow'], fx: ['diversification'],
  pitch: ['risk_size', 'diversification'], giving: [], life: ['cushion', 'opportunity_cost'], payday: ['time'], edu: ['time'], business: ['cashflow', 'risk_size'], mystery: ['knowledge'], tax: ['fees_tax'], shipping: ['cushion'], focus: ['time'] };
const DQ_WHY = { noRunway: 'לא נשאר מספיק מזומן לחודשים החלשים של העסקים', noCushion: 'כמעט לא נשארה לך כרית ביטחון', // J1 E3: a full clause (it was subject-less: 'השאיר אותך בלי כרית'); presentation only, every rule set
  dsr: 'החזרי החובות עברו 40% מההכנסה', gamble: 'הימור עם תוחלת שלילית', panicSell: 'מכירה בהפסד אחרי ירידה', concentrated: 'הרבה כסף במקום אחד', burnout: 'סכנת שחיקה', debt: 'חוב יקר', best: 'הכי משתלם לפי מה שראית', near: 'כמה אפשרויות סבירות — כולן בסדר',
  values: 'טרייד־אוף של סגנון חיים — אין כאן תשובה אחת', noUse: 'המוקד הזה לא ינוצל החודש', inspectFirst: 'היה עדיף: לבדוק קודם' };
function pitchEV(worldId, card) {
  const A = getWorld(worldId).angel; if (!A) return 1;
  const q = card.team + card.traction;
  const t = A.outcomes.map((x) => ({ m: x.m, w: Math.max(0.001, x.w + (x.q || 0) * (q - 4) + (x.h || 0) * (card.hype - 2)) }));
  const tot = t.reduce((a, x) => a + x.w, 0);
  return t.reduce((a, x) => a + x.m * x.w / tot, 0) * A.hypeMult[card.hype - 1];
}
/** The public context of a decision (§10.0): only what the player can see. optionU never touches st. */
function pubCtx(st) {
  const L = st.life; const E = Math.max(1, expensesOf(st)); const g = passiveGoal(W(st)) ? 'passive' : W(st).goal.type; // worlds wave 0: passive12 scores like passive
  return { cash: st.cash, savings: st.savings || 0, E, energy: L.energy, happiness: happyNow(st), happyBase: L.happiness, loans: st.loans, credit: st.credit,
    netWorth: netWorthOf(st), baseNet: baseNet(st), goalType: g, nwWeight: g === 'passive' ? 0.25 : 1,
    study: { done: L.study.done, months: L.study.months, need: L.study.need, raiseNet: R5(st) && !L.study.done ? studyRaiseNet(st) : null, left: st.mode === 'free' ? 999 : st.maxMonths - st.month }, idxPeak: L.idxPeak || st.prices.IDX, idxPrice: st.prices.IDX,
    worldId: st.worldId, econ: CY.econPublic(st.econ, st.month, st.worldId), loanPct: loanPct(st), creditPct: W(st).creditPct, month: st.month, monthsLeft: st.maxMonths - st.month,
    fundMonths: (st.savings || 0) / E };
}
/** E7 (rules 5): the degree's raise in take-home pay (the +20 % is on the GROSS; tax takes its share). Public: the player's own payslip. */
function studyRaiseNet(st) { return Math.max(0, slip(r10(grossBase(st) * (1 + LIFE_CFG.studyRaise)), taxPoints(st)).net - baseNet(st)); }
/**
 * The value credited to ONE month of study (or to a course giving `k` months). Rules ≤ 4: 24 months of +20 % of the NET, spread over the
 * program (it made "study" the top plan on ~98 % of plan cards). Rules 5 (E7, scoring fairness): the AFTER-TAX raise (the +20 % is on the
 * gross) for the raised months that fall inside the next STUDY_H months — the rest of the program comes first, and a ranked game's time
 * limit cuts it (free games run on) — spread over the program. A month of study then competes with rest and overtime on real terms
 * (tired → rest; fresh with time ahead → study), and it is worth less at the start of a long program or near the end of a ranked game.
 */
const STUDY_H = 24;
function studyMonthValue(ctx, k = 1) {
  const S = ctx.study; if (S.done) return 0;
  if (S.raiseNet == null) return LIFE_CFG.studyRaise * ctx.baseNet * 24 / S.need * k;
  const after = Math.max(0, Math.min(STUDY_H, S.left || 0) - Math.max(0, S.need - S.months - k)); // raised months inside the window
  return S.raiseNet * after / S.need * k;
}
/** One cushion rule (§10.2): months of expenses left in cash + fund after an action; a deal that quickly rebuilds it is OK. */
function cushionCheck(ctx, cashDelta, loan, net) {
  const after = (ctx.cash + ctx.savings + cashDelta + (loan || 0)) / ctx.E;
  const flagged = after < 1 && !(net >= 0.15 * ctx.E && after >= 0.5);
  return { after, flagged };
}
/**
 * The value of a 🔋 change, in months of expenses: concave — a point is worth a lot near burnout, little when you are fresh.
 * Marginal value per point: < 30 → 0.035, 30–55 → 0.018, 55–80 → 0.012, ≥ 80 → 0.004.
 */
function energyValue(e0, d) {
  const w = (x) => (x < 30 ? 0.035 : x < 55 ? 0.018 : x < 80 ? 0.012 : 0.004); // ≈ the price of buying 🔋 back with a rest month, steeper near burnout
  const a = clamp(Math.min(e0, e0 + d), 0, 100), b = clamp(Math.max(e0, e0 + d), 0, 100);
  let v = 0; for (const [lo, hi] of [[0, 30], [30, 55], [55, 80], [80, 100]]) { const o = Math.max(0, Math.min(b, hi) - Math.max(a, lo)); v += o * w(lo); }
  return d >= 0 ? v : -v;
}
/** The value of a 😊 change (months of expenses per point): matters most below the ★★★ gate (60), little when already happy. */
function happinessValue(h0, d) {
  const w = (x) => (x < 50 ? 0.06 : x < 65 ? 0.04 : x < 80 ? 0.015 : 0.005);
  const a = clamp(Math.min(h0, h0 + d), 0, 100), b = clamp(Math.max(h0, h0 + d), 0, 100);
  let v = 0; for (const [lo, hi] of [[0, 50], [50, 65], [65, 80], [80, 100]]) { const o = Math.max(0, Math.min(b, hi) - Math.max(a, lo)); v += o * w(lo); }
  return d >= 0 ? v : -v;
}
const enCost = (ctx, energy) => -energyValue(ctx.energy, -energy); // the cost of spending `energy` points now
const R = (key, text, w) => ({ key, text, w });
/**
 * A deal buy option's value (§10.4): ((cf − loan) × 24 + nwWeight × (value − cost) + grow × value × 24 − repair) / E − penalties,
 * at the public basis (claimed → posterior expectation, level-1 midpoint, verified), plus the value of information.
 * cut = negotiated discount in % (0 = as offered).
 */
function dealBuy(ctx, ev, o, cut = 0) {
  const d = ev.data; const b = o.basis || { cf: o.net + (o.loanMonthly || 0) }; const dd = d.dd;
  const k = cut / 100; const downCut = Math.round(d.down * k / 100) * 100; const debtCut = Math.round((d.cost - d.down) * k / 100) * 100;
  const cost = d.cost - downCut - debtCut; const cfAdd = debtCut ? Math.round(debtCut * 0.005 / 10) * 10 : 0;
  const loanM = Math.max(0, (o.loanMonthly || 0) - Math.round(downCut * ctx.loanPct / 100));
  const value0 = d.value ?? d.cost; const grow = (d.grow || 0) * value0 * 24;
  const H = ctx.goalType === 'passive' ? 36 : 24; // in a passive-income world a cashflow asset is the goal itself: a longer horizon
  const money = (cf, vf, rep) => (cf + cfAdd - loanM) * H + ctx.nwWeight * (value0 * vf - cost) + grow - rep;
  const flags = []; const cush = cushionCheck(ctx, -(d.down - downCut), o.loanAmount, o.net + cfAdd);
  if (cush.flagged) flags.push('noCushion');
  let runPen = 0; // worlds wave 0: a module may name the cash a deal needs left over (w5: the winter's fixed costs) — the shortfall in months of expenses
  if (d.runwayNeed != null) { const left = ctx.cash + ctx.savings - (d.down - downCut) + (o.loanAmount || 0); if (left < d.runwayNeed) { flags.push('noRunway'); runPen = Math.min(40, (d.runwayNeed - left) / ctx.E); } }
  if (o.loanAmount) flags.push('debt');
  if ((d.debt || 0) > 3 * Math.max(1, d.down) && o.net <= 0) flags.push('concentrated');
  const pen = flags.reduce((a, f) => a + (DQ_PEN[f] || 0), 0) + runPen;
  const vfE = b.vf ?? 1; const repE = b.rep ?? 0;
  const U = money(b.cf, vfE, repE) / ctx.E - pen;
  let evi2 = 0;
  if (dd && dd.level === 0 && b.r) evi2 = b.r.reduce((a, x) => a + x.p * Math.max(0, money(x.cf, x.vf, x.rep) / ctx.E - pen), 0) - Math.max(0, U);
  else if (dd && dd.level === 1 && b.lo != null) evi2 = 0.5 * Math.max(0, money(b.lo, vfE, repE) / ctx.E - pen) + 0.5 * Math.max(0, money(b.hi, vfE, repE) / ctx.E - pen) - Math.max(0, U);
  const reasons = [R('net', `לפי מה שידוע: בערך ${fmtM(o.net + cfAdd)} בחודש אחרי עלות ההלוואה`, (o.net + cfAdd) * 24 / ctx.E),
    R('cushion', `אחרי זה תישאר כרית של ${round2(Math.max(0, cush.after)).toFixed(1)} חודשים`, cush.flagged ? -4 : cush.after < 2 ? -0.3 : 0.05)];
  if (dd && dd.level === 0 && dd.flags.filter((f) => f.kind === 'warn').length) reasons.push(R('flags', `יש ${warnSigns(dd.flags.filter((f) => f.kind === 'warn').length)} — בדיקה יכולה לשנות את ההחלטה`, Math.max(0.2, evi2)));
  if (value0 !== cost && ctx.nwWeight >= 1) reasons.push(R('price', `המחיר ${value0 > cost ? 'מתחת' : 'מעל'} השווי ב־${fmtM(Math.abs(value0 - cost))}`, ctx.nwWeight * (value0 - cost) / ctx.E));
  if (o.loanAmount) reasons.push(R('debt', `הלוואה ב־${round2(ctx.loanPct)}% בחודש`, -(o.loanMonthly || 0) * 24 / ctx.E));
  if (ctx.econ && (ctx.econ.label === 'מיתון' || ctx.econ.label === 'האטה')) reasons.push(R('signal', `מד הכלכלה מראה ${ctx.econ.label} — כרית גדולה יותר נותנת מרחב`, 0.05));
  return { U, flags, reasons, evi2: Math.max(0, evi2) };
}
const DQ_PEN = { noCushion: 4, dsr: 3, gamble: 3, panicSell: 3, concentrated: 2, burnout: 3, debt: 0, noUse: 0 };
/** Utility of one option in months of expenses (+ risk flags + reasons), from public information only (ctx, ev). */
function optionU(ctx, ev, o, params) {
  const d = ev.data || {}; const flags = []; const reasons = []; let money = 0, hap = 0, hapW = 1; const E = ctx.E;
  const cashAfter = (x) => (ctx.cash + ctx.savings + x) / E;
  switch (ev.type) {
    case 'deal': {
      const buys = ev.options.filter((x) => x.kind === 'buy' && x.enabled);
      if (o.kind === 'buy') { const r = dealBuy(ctx, ev, o); return { U: r.U, flags: r.flags, reasons: r.reasons }; }
      const best = buys.map((x) => dealBuy(ctx, ev, x)).sort((a, b) => b.U - a.U)[0];
      // T6 §3.6: a delay step survives with (1 − h) — h is the public per-step hazard printed on the card (0 without interest: T2 unchanged)
      const h = d.rivals && d.rivals.n ? d.rivals.hazardNext || 0 : 0;
      const rivalR = (base) => (h > 0 ? [R('rival', RV.tplR(RV.TEXT.reason, { n: d.rivals.n, p: Math.round(h * 100) }), -h * Math.max(0, base))] : []);
      if (o.kind === 'offer') {
        const k = +o.id.split(':')[1];
        const disc = buys.map((x) => dealBuy(ctx, ev, x, k)).sort((a, b) => b.U - a.U)[0] || { U: 0 };
        const U = (1 - h) * (o.chance * Math.max(0, disc.U) - (1 - o.chance) * 0.5 * Math.max(0, best ? best.U : 0)); // a refused offer loses a scarce good deal (tuned, knob 5)
        return { U, flags: [], reasons: [R('risk', `סיכוי ${Math.round((1 - o.chance) * 100)}% שהמוכר יסרב — ואז העסקה אבודה`, -(1 - o.chance) * Math.max(0, best ? best.U : 0)), R('price', `אם יסכים: ${fmtM(o.saved)} פחות`, o.chance * Math.max(0, disc.U)), ...rivalR(best ? best.U : 0)] };
      }
      if (o.id === 'inspect:1' || o.id === 'inspect:2') {
        const base = Math.max(0, best ? best.U : 0); const evi2 = best ? best.evi2 : 0;
        let U = o.id === 'inspect:1' ? (1 - h) * (base + 0.7 * evi2) - (o.cost && o.cost.energy ? enCost(ctx, o.cost.energy) : 0) : (1 - h) * (base + evi2) - (o.cost ? o.cost.cash || 0 : 0) / E;
        if (flaggedInspect(ev) === o.id) { // T3 review M7: with warning signs, checking first is the careful choice — also before haggling
          const offU = ev.options.filter((x) => x.kind === 'offer' && x.enabled).reduce((a, x) => Math.max(a, optionU(ctx, ev, x).U), 0);
          U = Math.max(U, base + 0.05, offU + 0.05);
        }
        const k = d.dd ? d.dd.flags.filter((f) => f.kind === 'warn').length : 0;
        reasons.push(R('evi', evi2 > 0.3 ? 'העסקה גבולית: בדיקה שווה יותר ממה שהיא עולה' : 'הבדיקה כנראה לא תשנה את ההחלטה', evi2 - 0.1));
        if (k) reasons.push(R('flags', `יש ${warnSigns(k)} — בדיקה יכולה לשנות את ההחלטה`, 0.2 + evi2));
        reasons.push(...rivalR(base));
        return { U, flags: [], reasons };
      }
      return { U: 0, flags: [], reasons: [R('net', best && best.U > 0 ? 'לוותר זה לוותר גם על התזרים שהעסקה מביאה' : 'העסקה לא מוסיפה כסף לפי מה שידוע — לוותר לא עולה כלום', best && best.U > 0 ? -best.U : 0.3)] };
    }
    case 'doodad':
      if (o.id === 'pay' || o.id === 'inst3') { money = -d.amount; if (!d.need) { hap = Math.min(16, Math.max(4, d.amount / E * 8)); hapW = 0.4; } } // a toy's joy is glow: it fades
      if (o.id === 'credit') { money = -d.amount - (d.installment || 0) * 24; flags.push('debt'); if (!d.need) { hap = Math.min(16, Math.max(4, d.amount / E * 8)); hapW = 0.4; } reasons.push(R('debt', `ריבית ${ctx.creditPct}% בחודש — והחוב עצמו לא קטן`, -(d.installment || 0) * 24 / E)); }
      if (o.id === 'sub') { money = -(d.sub || 0) * 24; hap = 4; reasons.push(R('net', `${fmtM(d.sub || 0)} בחודש, כל עוד המנוי פעיל`, -(d.sub || 0) * 24 / E)); }
      if (o.id === 'skip') reasons.push(R('net', `לוותר שומר ${fmtM(d.amount)} — כסף לנכס הבא`, d.amount / E));
      if (o.id === 'pay' && d.shortfall) flags.push('noCushion');
      if (o.id === 'pay' || o.id === 'inst3') reasons.push(R('cushion', `אחרי זה תישאר כרית של ${round2(Math.max(0, cashAfter(-d.amount))).toFixed(1)} חודשים`, cashAfter(-d.amount) < 1 ? -1 : 0.05));
      break;
    case 'trade': {
      const qty = Math.floor(Number(params && params.qty)) || 0; const cost = qty * (d.price || 0);
      if (o.id === 'buy' && d.kind === 'crypto') { money = -0.124 * cost; flags.push('gamble'); if (cost > 0.1 * Math.max(1, ctx.netWorth)) flags.push('concentrated'); }
      if (o.id === 'buy' && cashAfter(-cost) < 1) flags.push('noCushion');
      if (o.id === 'sell' && d.ticker === 'IDX' && d.avg > d.price && ctx.idxPrice <= (ctx.idxPeak || ctx.idxPrice) * 0.92) flags.push('panicSell');
      if (o.id === 'auto:on') money = 0.5 * E;
      break; }
    case 'market':
      if (o.kind === 'sell') { const off = (d.offers || []).find((x) => 'sell:' + x.assetId.slice(1) === o.id); if (off) money = off.net - (off.equity ?? off.net) - Math.max(0, off.cf) * (ctx.goalType === 'passive' ? 80 : 48); } // in a passive-income world the lost cashflow IS the goal
      break;
    case 'bank': if (o.id === 'refi') money = ((getWorld(ctx.worldId).rate.lockBelow || d.fixedRate) - d.fixedRate) * (d.variableDebt || 0) / 1200 * 24 - (d.refiFee || 0); if (o.id === 'prepay' && cashAfter(-50000) < 1) flags.push('noCushion'); break;
    case 'upgrade': if (o.kind === 'buy') { const cost = o.payback ? o.payback * Math.max(1, o.net) : 0; money = (o.net || 0) * 24 - cost; if (o.hap) hap = o.hap; } break;
    case 'pitch': if (o.id.startsWith('inv:')) { const amt = d.checks[+o.id.split(':')[1]]; const ev1 = pitchEV(ctx.worldId, { team: d.team, traction: d.traction, hype: d.hype }); const nw = Math.max(1, ctx.netWorth); money = amt * (ev1 - 1) - 0.6 * amt * Math.min(1, 5 * amt / nw); if (amt > 0.15 * nw) flags.push('concentrated'); if (ev1 < 1) flags.push('gamble'); } break;
    case 'life': {
      const e = o.effects || {}; const months = e.months || 24;
      money = (e.cash || 0) - (e.monthly || 0) * months + (e.salary || 0) * months - 0.35 * (e.risk || 0);
      money += energyValue(ctx.energy, e.energy || 0) * E;
      if (e.study && !ctx.study.done) money += studyMonthValue(ctx, e.study);
      hap = e.happiness || 0;
      if (o.loanAmount || (e.risk && e.risk > ctx.cash + ctx.savings)) flags.push('noCushion');
      if (d.eventId === 'layoff' && o.id === 'keep' && (ctx.cash + ctx.savings - 2 * Math.max(0, E - 0.6 * ctx.baseNet)) / E < 1) flags.push('noCushion'); // T3 C9: cushion-aware layoff
      if (e.cash || e.monthly) reasons.push(R('net', `${sgn(e.cash || 0)} עכשיו${e.monthly ? ` ו־${sgn(-e.monthly)} בחודש` : ''}`, ((e.cash || 0) - (e.monthly || 0) * months) / E));
      if (e.energy) reasons.push(R('energy', `${e.energy > 0 ? '+' : '−'}${Math.abs(e.energy)} 🔋 — ${ctx.energy < 55 ? 'חשוב' : 'פחות חשוב'} כשאתה ${ctx.energy < 55 ? 'עייף' : 'רענן'}`, energyValue(ctx.energy, e.energy)));
      if (e.study && !ctx.study.done) reasons.push(R('study', 'מקרב את סוף הלימודים (+20% ברוטו בסוף)', 0.5));
      if (e.risk) reasons.push(R('risk', `סיכוי 35% לאבד ${fmtM(e.risk)}`, -0.35 * e.risk / E));
      if (hap) reasons.push(R('happy', `${hap > 0 ? '+' : '−'}${Math.abs(hap)} 😊`, happinessValue(ctx.happyBase ?? ctx.happiness, hap)));
      break; }
    case 'payday': case 'edu':
      if (o.kind === 'plan') {
        const e = o.effects || {}; money = e.netDelta || 0; hap = e.happiness || 0;
        if (ctx.energy + (e.energy || 0) < 25) flags.push('burnout');
        money += energyValue(ctx.energy, e.energy || 0) * E; // energy is worth more when you are tired
        if (o.plan === 'study' && !ctx.study.done) { const sv = studyMonthValue(ctx); money += sv; reasons.push(R('study', 'מקרב את סוף הלימודים (+20% ברוטו בסוף)', sv / E)); }
        if (e.netDelta) reasons.push(R('net', `${sgn(e.netDelta)} בחודש ביד`, e.netDelta / E));
        if (e.energy) reasons.push(R('energy', `${e.energy > 0 ? '+' : '−'}${Math.abs(e.energy)} 🔋 — ${ctx.energy < 55 ? 'חשוב' : 'פחות חשוב'} כשאתה ${ctx.energy < 55 ? 'עייף' : 'רענן'}`, energyValue(ctx.energy, e.energy || 0)));
      }
      if (o.id === 'raise') money = (o.chance || 0) * ctx.baseNet * 0.06 * 24 - (1 - (o.chance || 0)) * 0.15 * E;
      if (o.id === 'save') money = ctx.fundMonths < 3 ? E : 0;
      if (o.id === 'course') money = studyMonthValue(ctx, 2) + ((o.effects && o.effects.cash) || 0) + energyValue(ctx.energy, -4) * E;
      break;
    case 'business':
      if (o.id === 'start' || o.id.startsWith('start:')) { const cap = o.startCapital || d.startCapital; money = (o.net || 0) * 24 - 0.6 * cap * Math.min(1, 5 * cap / Math.max(1, ctx.netWorth)) - cap * 0.004 * 24 - (d.ownerEnergy || 0) * 12 * 0.012 * E; /* T3 review M7: the capital tied up has a price (≈ 5 % a year) */ if (o.loanAmount) flags.push('debt'); /* owner-run: a second job that costs 🔋 every month */ const cu = cushionCheck(ctx, -cap, o.loanAmount, 0); if (cu.flagged) flags.push('noCushion'); }
      else if (o.kind === 'biz' && o.effects) { money = (o.effects.delta3 || 0) * 8; reasons.push(R('net', `תחזית ל־3 חודשים: ${sgn(o.effects.delta3 || 0)} רווח בעסק`, money / E)); }
      break;
    case 'tax': if (o.id === 'report') { const fee12 = o.feeEither ? 0 : (o.fee || 0) * 12; money = (o.saving ?? 0.5 * E) - fee12; reasons.push(R('net', `חוסך קנס של בערך ${fmtM(o.saving || 0)} בשנה${fee12 ? `, עולה ${fmtM(fee12)} בשנה` : o.fee ? ' — את הרו״ח משלמים גם בלי תיק, בדוח המאוחר' : ''}`, money / E)); } break;
    case 'mystery': if (d.kind === 'quiz') money = o.id === 'a' + ((getWorld(ctx.worldId).mystery.find((x) => x.kind === 'quiz' && x.text === d.question) || {}).correct) ? E : 0; break;
    default: break;
  }
  const U = money / E + (hap ? hapW * happinessValue(ctx.happyBase ?? ctx.happiness, hap) : 0) - flags.reduce((a, f) => a + (DQ_PEN[f] || 0), 0);
  if (flags.includes('noCushion') && !reasons.some((r) => r.key === 'cushion')) reasons.push(R('cushion', 'אחרי זה כמעט לא תישאר כרית', -4));
  for (const f of flags) if (['gamble', 'concentrated', 'panicSell', 'burnout', 'dsr'].includes(f)) reasons.push(R('risk', DQ_WHY[f], -(DQ_PEN[f] || 1)));
  if (!reasons.length) reasons.push(R('net', Math.abs(money) < 0.05 * E ? 'בלי השפעה כספית גדולה לפי מה שידוע' : `לפי מה שידוע: ${money > 0 ? 'מוסיף' : 'עולה'} בערך ${fmtM(Math.abs(Math.round(money / 10) * 10))} לאורך שנתיים`, money / E));
  return { U, flags, reasons };
}
/** Which options form the decision pool (null = not a scored decision). o = the chosen option (null: for primary/hints). */
function scorePool(ev, o) {
  if (!ev || ev.auto) return null;
  if (o && /^q:/.test(o.id)) return null; // T3: inbox items on the manage card are scored by resolveStory
  const en = ev.options.filter((x) => x.enabled && !/^q:/.test(x.id));
  if (en.length < 2 || ['crisis', 'giving', 'shipping', 'intro'].includes(ev.type)) return null;
  if (ev.type === 'trade' && (!o || o.id === 'done')) return null;
  if (ev.type === 'business' && o && o.id === 'ok') return null;
  if (ev.type === 'market' && !ev.options.some((x) => x.kind === 'sell')) return null;
  // the monthly plan is compared with the other plans only; saving / asking for a raise / a course are good habits on their own
  if (ev.type === 'payday' || ev.type === 'edu') return (!o || o.kind === 'plan') ? en.filter((x) => x.kind === 'plan') : [o];
  return en;
}
/**
 * Score every option of the decision pool from public information only: [{id, U, flags, reasons}] (U in months of
 * expenses). [] when the event is not a scored decision (trade window, crisis, auto card…). Pure: never mutates st.
 */
export function scoreOptions(st, ev) {
  ev = ev || currentEvent(st);
  if (ev && ev.type === 'mech') { const T = mechTile(st, st.pending && st.pending.mt); return T && T.score && !ev.auto ? T.score(st, ev, MCTX) : []; } // worlds wave 0
  const pool = scorePool(ev, null); if (!pool) return [];
  const ctx = pubCtx(st);
  return pool.map((x) => { const u = optionU(ctx, ev, x, x.needsQty ? { qty: 1 } : undefined); return { id: x.id, U: u.U, flags: u.flags, reasons: u.reasons }; });
}
/** guide-level primary from the scores: argmax; within 0.1 of the top, closing options first, then the card's own default. */
function primaryFromScores(ev, sc, st) {
  // T3 review M7: two guide rules where the scores alone mislead a highlight-tapper (the sims: smart − guide gap)
  const fl = flaggedInspect(ev); if (fl && sc.some((x) => x.id === fl)) return fl;                       // a flagged deal: check it first
  const best = Math.max(...sc.map((x) => x.U));
  if (st && st.life && (ev.type === 'payday' || ev.type === 'edu')) { const want = guidePlan(st); const o = ev.options.find((x) => x.enabled && x.kind === 'plan' && x.plan === want); const u = o && sc.find((x) => x.id === o.id); if (u && u.U >= best - 0.5) return o.id; } // never a highlight the verdict would call weak
  const cand = sc.filter((x) => x.U >= best - 0.1);
  const closing = cand.filter((x) => !NON_CLOSING.test(x.id));
  const set = closing.length ? closing : cand;
  const legacy = set.find((x) => (ev.options.find((y) => y.id === x.id) || {}).primary) || set.find((x) => SAFE_IDS.includes(x.id)); // the card's default, else the safe "continue"
  return (legacy || set.slice().sort((a, b) => b.U - a.U)[0]).id;
}
const NON_CLOSING = /^(inspect:|offer:|biz:(?!sell)|sell:|auto:|report$)/;
/**
 * T3 review M7 (public data only): the inspection to take first on a deal the seller's numbers make worth buying but that shows ≥ 1
 * warning sign (level 0 → inspect:1), or whose checked range straddles zero (level 1 → inspect:2) — unless others may close first (≥ 30 %).
 */
function flaggedInspect(ev) {
  if (!ev || ev.type !== 'deal' || !ev.data || !ev.data.dd) return null;
  const dd = ev.data.dd; const warn = dd.flags.filter((f) => f.kind === 'warn').length;
  const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => y.net - x.net)[0]; if (!b) return null;
  const ok = (id) => { const o = ev.options.find((x) => x.id === id && x.enabled); return o && (o.rivalRisk || 0) < 0.3 ? id : null; };
  if (dd.level === 0 && warn >= 1 && b.net + (dd.claimed.cf - dd.expected.cf) > 0) return ok('inspect:1');
  if (dd.level === 1 && dd.range && dd.range.cf[0] - (b.loanMonthly || 0) < 0 && dd.range.cf[1] - (b.loanMonthly || 0) > 0) return ok('inspect:2');
  return null;
}
/** T3 review M7: the monthly plan a careful player picks (rest only when tired / recovering, study early, overtime when fresh). */
function guidePlan(st) {
  const L = st.life; const cf = cashflowOf(st);
  if (L.energy < 35 || (L.plan === 'rest' && (L.energy < 75 || L.happiness < 62))) return 'rest';
  if (L.happiness < 57 && st.month > 6) return 'rest';
  if (!L.study.done && st.month <= 20 && L.energy >= 45) return 'study';
  if (L.energy >= 80 && cf > 0) return 'overtime';
  if (L.plan === 'overtime' && L.energy >= 50) return 'overtime';
  return 'work';
}
function cashflowOf(st) { return salaryNow(st) + payslipOf(st).sideIncome + activeBizOf(st) + passiveOf(st) + extraIncomeOf(st) - expensesOf(st); }
/** Rules 4: a crisis landing in the first months passes by (the card still draws; nothing is paid). Playtest B6. */
const CRISIS_GRACE = 6;
/** Playtest S6 (careful play scored 42/100): an inspection the information justified is a good decision — warning signs at level 0,
 *  a checked range that straddles zero, or a value of information (evaluator, ×(1 − h)) at least worth its cost. */
function inspectJustified(ctx, ev, o, us) {
  const d = ev.data || {}; const dd = d.dd; if (!dd || !/^inspect:/.test(o.id)) return false;
  const warn = dd.flags.filter((f) => f.kind === 'warn').length;
  if (dd.level === 0 && warn >= 1) return true;
  const buys = ev.options.filter((x) => x.kind === 'buy' && x.enabled);
  if (dd.level === 1 && buys.some((b) => b.basis && b.basis.lo != null && b.basis.lo - (b.loanMonthly || 0) < 0 && b.basis.hi - (b.loanMonthly || 0) > 0)) return true;
  const best = buys.map((b) => dealBuy(ctx, ev, b)).sort((a, b) => b.U - a.U)[0]; if (!best) return false;
  const h = d.rivals && d.rivals.n ? d.rivals.hazardNext || 0 : 0;
  const cost = o.id === 'inspect:1' ? (o.cost && o.cost.energy ? enCost(ctx, o.cost.energy) : 0) : (o.cost ? o.cost.cash || 0 : 0) / ctx.E;
  return (1 - h) * (o.id === 'inspect:1' ? 0.7 : 1) * best.evi2 >= cost + h * Math.max(0, best.U) && best.evi2 >= 0.1;
}
/** A standing plan choice repeated on payday ("keep going") is one decision, not a new one every month (playtest S6: the same
 *  "keep going — study was better" filled the review 5 times and pulled a careful player's score to 42). */
const PLAN_DEDUPE_MONTHS = 6;
function decisionRecord(st, ev, o, params) {
  if (!st.life || ev.type === 'intro') return null; // T4 E-3: the intro card has no verdict, no dq entry, no mastery change
  const k0 = st.pending && st.pending.k0 != null ? st.pending.k0 : -1; // T6 §4.4 card start (-1: unknown → decisionPoints scans the log)
  if (ev.type === 'life' && ev.data && ev.data.chain) { const r = storyDecision(st, { ...ev, chain: ev.data.chain.id, step: ev.data.chain.step, kind: 'chain' }, o); if (r) r.k0 = k0; return r; } // T3 §9 classes
  const pool = scorePool(ev, o); if (!pool) return null;
  const ctx = pubCtx(st);
  const qtyFor = (x) => (x.id === o.id ? params : x.needsQty ? { qty: 1 } : undefined);
  const us = pool.map((x) => ({ id: x.id, ...optionU(ctx, ev, x, qtyFor(x)) }));
  const mine = us.find((x) => x.id === o.id) || { U: 0, flags: [] };
  const best = us.reduce((a, b) => (b.U > a.U ? b : a)); const worst = us.reduce((a, b) => (b.U < a.U ? b : a));
  const cls = ev.type === 'life' ? (o.dq || (ev.data.personal ? 'personal' : ev.data.values ? 'mixed' : 'financial')) : null; // T3 C9 classes
  const personal = cls === 'personal'; // life choices (kids, wedding, family, friends): no "right answer" — only risk flags count
  const values = cls === 'mixed';      // lifestyle trade-offs (car, health, layoff): a wide band
  let score = personal || best.U - worst.U < 0.5 || best.U - mine.U < 0.5 ? 100 : Math.round(100 * clamp((mine.U - worst.U) / (best.U - worst.U), 0, 1));
  if (values) score = best.U - mine.U <= 1.5 ? 100 : mine.flags.length ? score : Math.max(60, score);
  if (personal && mine.flags.length) score = 50;
  if (R4(st) && ev.type === 'deal' && inspectJustified(ctx, ev, o, us)) score = Math.max(score, 85); // the information was worth it
  const planCard = R4(st) && (ev.type === 'payday' || ev.type === 'edu') && (o.id === 'ok' || o.kind === 'plan');
  if (planCard) {
    if (!mine.flags.length) score = best.U - mine.U <= 1.5 ? Math.max(score, 85) : Math.max(60, score); // a plan is a trade-off of time, energy and money: a wide band
    const prev = (dqOf(st).decisions || []).slice().reverse().find((r) => r.type === ev.type);
    if (prev && prev.o === o.id && prev.b === String((ev.options.find((x) => x.id === best.id) || {}).label || best.id).replace(/\s*\(.*\)$/, '').slice(0, 24) && st.month - prev.m < PLAN_DEDUPE_MONTHS) return null;
  }
  const verdict = mine.flags.some((f) => f !== 'debt') ? 'risky' : score >= 85 ? 'strong' : score >= 60 ? 'ok' : score < 40 ? 'costly' : 'mixed';
  const bestOpt = ev.options.find((x) => x.id === best.id) || {};
  const why = mine.flags.find((f) => f !== 'debt') ? DQ_WHY[mine.flags.find((f) => f !== 'debt')] : values ? DQ_WHY.values : best.U - worst.U < 0.5 ? DQ_WHY.near : mine === best || best.U - mine.U < 0.5 ? DQ_WHY.best
    : /^inspect:/.test(best.id) ? DQ_WHY.inspectFirst : `היה עדיף: ${bestOpt.label || ''}`.slice(0, 60);
  const pr = [...(DQ_PRINC[ev.type] || [])];
  if (mine.flags.includes('noCushion')) pr.push('cushion');
  if (mine.flags.includes('debt') || o.loanAmount) pr.push('debt_cost');
  if (mine.flags.includes('panicSell') || (ev.type === 'trade' && ev.data.ticker === 'IDX')) pr.push('time_in_market');
  if (ev.type === 'bank' || o.id === 'buyVar' || o.id === 'buyFix') pr.push('rate_risk');
  if (/^inspect:/.test(o.id) || (ev.data.dd && ev.data.dd.level === 0 && o.kind === 'buy')) pr.push('knowledge');
  const rec = { t: st.turn, m: st.month, k: (st.actions || []).length, k0, l: String(o.label || o.id).replace(/\s*\(.*\)$/, '').slice(0, 24), type: ev.type, c: String(ev.title).slice(0, 24), o: o.id, s: score, v: verdict, f: mine.flags.filter((f) => f !== 'debt'), p: [...new Set(pr)], why, gap: round2(best.U - mine.U), b: String(bestOpt.label || best.id).replace(/\s*\(.*\)$/, '').slice(0, 24) };
  if (st.pending && st.pending.hinted) rec.h = 1;
  return rec;
}
function recordDecision(st, r, out) {
  const D = dqOf(st);
  if (r.k0 == null) r.k0 = r.k; // between-roll decisions (focus, story inbox): the card start is the action itself
  D.decisions.push(r); if (D.decisions.length > 120) D.decisions.shift();
  D.sum += r.s; D.n++;
  for (const p of r.p) { const m = D.mastery[p] || { v: 0.5, n: 0 }; m.v = round2(m.n ? m.v * 0.7 + 0.3 * r.s / 100 : r.s / 100); m.n++; D.mastery[p] = m; }
  if (st.mentor !== 'pro') out.decision = { score: r.s, verdict: r.v, why: r.why, principles: r.p }; // pro: the verdict waits for the end-of-game review
}
const dqOf = (st) => (st.dq ||= { decisions: [], sum: 0, n: 0, mastery: {}, luck: { index: 0, angels: 0, crypto: 0, negotiation: 0, raise: 0, friend: 0, dd: 0, cycle: 0 }, hints: 0, levelChanges: [] });
/**
 * Luck bookkeeping. Event parts also go to dq.luckLog = [[m, part, amount, k]] (T6 §4.3, cap 40, smallest |amount| evicted);
 * k = the action index of the decision that caused it (CUR_K while a choose / resolveStory runs; a stored index for delayed reveals).
 */
function addLuck(st, part, amount, k = CUR_K, log = true) {
  const D = dqOf(st); D.luck[part] = Math.round((D.luck[part] || 0) + amount);
  if (!log || !LUCK_EVENT.has(part) || !Array.isArray(D.luckLog) || !Math.round(amount)) return;
  D.luckLog.push([st.month, part, Math.round(amount), k == null ? -1 : k]);
  if (D.luckLog.length > 40) { let j = 0; for (let i = 1; i < D.luckLog.length; i++) if (Math.abs(D.luckLog[i][2]) < Math.abs(D.luckLog[j][2])) j = i; D.luckLog.splice(j, 1); }
}
const LUCK_EVENT = new Set(['negotiation', 'raise', 'angels', 'crypto', 'friend', 'dd', 'story', 'rival']);
/** The index st.actions will give the action being applied now (choose / resolveStory), else -1 (rolls, paydays). Outcome-neutral. */
let CUR_K = -1;
const withK = (st, f) => { const k0 = CUR_K; CUR_K = (st.actions || []).length; try { return f(); } finally { CUR_K = k0; } };

/* ---------------------------------------------------------------- T6 §4.1–4.2 logging data (outcome-neutral, deterministic) */
const TL_COLS = ['m', 'nw', 'liq', 'debt', 'pas', 'exp', 'pg', 'hap', 'en'];
const TL_CAP = 240;
/** One timeline row = metrics() of this moment, in integers (money in ₪100 units, goal progress in permille). */
function tlRow(st) {
  const nw = netWorthOf(st); const pas = passiveOf(st); const exp = expensesOf(st);
  return [st.month, Math.round(nw / 100), Math.round((st.cash + (st.savings || 0)) / 100), Math.round((st.loans + st.credit + st.assets.reduce((x, a) => x + a.debt, 0)) / 100),
    Math.round(pas), Math.round(exp), Math.round(goalOf(st, nw, R5(st) ? goalPassiveOf(st) : pas, exp).goalProgress * 1000), Math.round(happyNow(st)), Math.round(st.life.energy)];
}
/** Push a row (end of every payday; force = the start row / the final row). Cap 240: keep every 2nd row (the first always), step × 2. */
function tlPush(st, force = false, t = st.tl) {
  if (!t || !st.life) return;
  if (!force && t.step > 1 && st.stats.paydays % t.step !== 0) return;
  const r = tlRow(st); const n = t.m.length;
  if (n && t.m[n - 1] === r[0]) { TL_COLS.forEach((c, i) => { t[c][n - 1] = r[i]; }); return; } // same month (the final row): the latest state
  if (n && r[0] < t.m[n - 1]) return;
  TL_COLS.forEach((c, i) => t[c].push(r[i]));
  if (t.m.length >= TL_CAP) { for (const c of TL_COLS) t[c] = t[c].filter((_, i) => i % 2 === 0); t.step *= 2; }
}
const MARK_EVICT = new Set(['buy', 'sell', 'story', 'recession', 'crash', 'rivalReveal']);
const MARK_WHY = { crisis: 'משבר', payday: 'יום המשכורת', deal: 'קנייה', doodad: 'הוצאה', life: 'אירוע חיים', market: 'שוק', mystery: 'הפתעה', story: 'סיפור', business: 'עסק', sell: 'מכירה', intro: 'הדרכה' };
/** st.marks = [[m, kind, amount, k, label]] (cap 40: evict the smallest |amount| of buy/sell/story/recession/crash/rivalReveal, else the oldest). */
function mark(st, kind, amount, k = CUR_K, label = '') {
  if (!Array.isArray(st.marks)) return;
  st.marks.push([st.month, kind, Math.round(amount || 0), k == null ? -1 : k, String(label || '').slice(0, 24)]);
  if (st.marks.length > 40) {
    let j = -1; for (let i = 0; i < st.marks.length; i++) if (MARK_EVICT.has(st.marks[i][1]) && (j < 0 || Math.abs(st.marks[i][2]) < Math.abs(st.marks[j][2]))) j = i;
    st.marks.splice(j < 0 ? 0 : j, 1);
  }
}
/** A business that leaves the books keeps its record for the end summary (T6 §5.1 business totals). */
function bizArchive(st, a) {
  if (!a || !a.biz || !Array.isArray(st.bizPast)) return;
  const t = a.biz.totals || {}; let stage = ''; try { stage = BIZ.summary(a.biz).stageName || ''; } catch (e) { stage = ''; }
  st.bizPast.push({ name: a.n, months: t.months || 0, profitMonths: t.profitMonths || 0, lossMonths: t.lossMonths || 0, worstNp: t.worst ? t.worst.np : null, worstM: t.worst ? t.worst.m : null, stage });
  if (st.bizPast.length > 8) st.bizPast.shift();
}
/** checkEnd's learning block: decision quality, luck, mastery per principle. */
function learningOf(st) {
  const D = dqOf(st);
  const q = D.n ? Math.round(D.sum / D.n) : null;
  const luck = { total: Object.values(D.luck).reduce((a, b) => a + b, 0), parts: { ...D.luck } };
  const counts = {}; for (const r of D.decisions) counts[r.v] = (counts[r.v] || 0) + 1;
  const principles = {}; for (const [k, m] of Object.entries(D.mastery)) principles[k] = { mastery: m.v, n: m.n, shown: m.n >= 3 };
  const top = D.decisions.slice().sort((a, b) => b.gap - a.gap || a.s - b.s).slice(0, 3).map((r) => ({ c: r.c, o: r.o, score: r.s, verdict: r.v, why: r.why }));
  const sentence = q == null ? null : q >= 75 && luck.total < 0 ? 'ההחלטות שלך היו טובות — המזל פחות. במשחק הבא עם אותן החלטות, סביר שתצא מהר יותר.'
    : q >= 75 ? 'החלטות טובות — וגם המזל לא הפריע. ככה בונים הצלחה שחוזרת על עצמה.'
    : luck.total > 0 ? 'המזל עזר לך יותר מההחלטות. בפעם הבאה: לבדוק תזרים, כרית וחוב לפני כל קנייה.'
    : 'יש מקום לשפר את ההחלטות: תסתכל על הכרית, על עלות החוב ועל מה שכל נכס מכניס באמת.';
  // T2 §5.6: hints, with/without-hint quality, level changes, the decision-by-decision review (all levels; pro shows it by default)
  const grp = (xs) => ({ n: xs.length, avg: xs.length ? Math.round(xs.reduce((a, r) => a + r.s, 0) / xs.length) : null });
  const byHint = { withHint: grp(D.decisions.filter((r) => r.h)), without: grp(D.decisions.filter((r) => !r.h)) };
  const review = D.decisions.slice(-40).map((r) => ({ t: r.t, m: r.m, c: r.c, o: r.o, score: r.s, verdict: r.v, why: r.why, best: r.b || null, hinted: !!r.h, type: r.type }));
  return { decisionQuality: q, decisions: D.n, verdicts: counts, principles, luck, top, sentence: gz(st, sentence),
    mentor: st.mentor || 'guide', hints: D.hints || 0, byHint, levelChanges: (D.levelChanges || []).slice(), review,
    transfer: JSON.parse(JSON.stringify(D.transfer || {})) }; // T4 CR-E3: practice results per principle
}

/* ---------------------------------------------------------------- v3 choose helpers */
/** Money-weighted CPI of a holding's cost basis (for the real capital-gains tax). */
function cpiMix(h, cost, st) { const b = h.basis || 0; const c0 = h.cpi || 1; return b + cost > 0 ? round6((c0 * b + st.life.cpi * cost) / (b + cost)) : st.life.cpi; }
const round6 = (x) => Math.round(x * 1e6) / 1e6;
/** 25% capital-gains tax on a realised gain, with loss carry-forward. Returns the tax (whole ₪). */
function gainTax(st, cost, proceeds, cpiBuy, out) {
  const L = st.life; const gain = proceeds - cost;
  // invest.js: 25% of the REAL gain (the part that only kept up with the CPI is exempt) + loss carry-forward
  const r = IV.capitalGainsTax({ cost, proceeds, cpiBuy: cpiBuy || 1, cpiSell: L.cpi || 1, mode: 'real', lossCarry: L.lossCarry });
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
  { const gainYear = baseNet(st) * LIFE_CFG.raiseMult * 12; addLuck(st, 'raise', (p.raiseR ?? 1) < ch ? gainYear * (1 - ch) : -gainYear * ch); }
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
  addLuck(st, 'negotiation', accepted ? o.saved * (1 - o.chance) : -o.saved * o.chance);
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
  if (o.jobless) { L.jobless = { until: st.month + o.jobless - 1 }; lesson(st, out, 'unemployment'); mark(st, 'jobless', 0, CUR_K, ''); }
  if (o.severance === 'withdraw') { const sev = Math.round(L.severance); L.pension = Math.max(0, L.pension - sev); L.severance = 0; }
  if (o.severance) lesson(st, out, 'severance');
  if (o.friend === 'lend') { L.friend = { kind: 'lend', amount: -eff.cash, at: st.month + 6, ok: p.r < 0.6, k: CUR_K }; lesson(st, out, 'friend_loan'); }
  if (o.friend === 'guarantee') { L.friend = { kind: 'guarantee', k: CUR_K, amount: r100(1.5 * S), at: st.month + 6, ok: p.r >= 0.35 }; lesson(st, out, 'guarantor'); }
  L.events.push({ m: st.month, id: E.id, o: o.id });
  out.mentor = o.after || (eff.note ? `${o.label}: ${eff.note}` : null);
  if (eff.cash < 0) ensureCash(st, out, 'life');
}

const CHOOSE = {
  /** Worlds wave 0: a module tile's choice → close? (the module never draws here: its draws were taken in create()). */
  mech(st, p, o, params, out) { const T = mechTile(st, p.mt); return T.choose(st, p, o, params, out, MCTX); },
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
    if (o.id === 'report') { st.life.sideReport = true; lesson(st, out, 'side_tax'); out.mentor = 'פתחת תיק במס הכנסה: מעכשיו משלמים מקדמות כל חודש, ואין קנס בסוף השנה.'; return false; }
    const L = st.life; const fee = Math.round(L.sideFeeDue || 0); const refund = Math.round(L.taxRefund), bill = Math.round(L.sideTaxDue) + fee;
    const net = refund - bill;
    if (net) { st.cash += net; cashFx(out, net); sound(out, net > 0 ? 'coin' : 'loss'); }
    if (bill) st.taxes.side += bill - fee;
    L.taxRefund = 0; L.sideTaxDue = 0; L.sideFeeDue = 0;
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
      const setup = T3(st) ? (o.id === 'start' ? 'std' : o.id.slice(6)) : undefined; // T3: start:lean / start (= std) / start:strong
      const capital = T3(st) && o.startCapital ? o.startCapital : A.startCapital;
      const L = loanFor(st, capital); if (L.need) { st.loans += L.need; st.cash += L.need; st.stats.loansTaken += L.need; }
      st.cash -= capital;
      const a = addBusiness(st, p.typeId, p.seed, undefined, setup);
      st.stats.deals++;
      out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, 'biz'), label: a.n, color: 'green' });
      cashFx(out, -capital); sound(out, 'buy'); mark(st, 'buy', capital, CUR_K, a.n);
      out.mentor = A.lesson; lesson(st, out, 'biz_owner_job');
      return true;
    }
    if (o.id === 'ok') { out.mentor = null; delete st.flags['bz_' + p.id]; return true; }
    const a = st.assets.find((x) => x.id === p.assetId);
    if (o.id === 'biz:sell') {
      const { sale } = BIZ.sell(a.biz);
      st.cash += sale.net; st.taxes.capGains += sale.tax; st.stats.sold++; st.stats.soldProfit += sale.net - a.biz.invested;
      bizArchive(st, a); mark(st, 'sell', sale.net, CUR_K, a.n);
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
    if (p.chain && st.story) { // T3: resolve the chain's entry step (seal = the card's own draw)
      const def = stepOptions(st, p.chain.id, p.chain.step).find((x) => x.id === o.id);
      applyStoryOption(st, p.chain.id, p.chain.step, def, { seal: { entry: p.r, a: st.story.r[0], b: st.story.r[1] }, item: null }, out);
      if (p.chain.id === 'car') lesson(st, out, 'car_cost');
      return true;
    }
    const E = LIFE_EVENTS.find((e) => e.id === p.eventId) || LIFE_EVENT_QUIET; const def = E.options.find((x) => x.id === o.id);
    applyLife(st, p, E, def, o.effects, out);
    if (T3(st) && (E.id === 'jobOffer' && o.id === 'take' || E.id === 'layoff')) st.story.jobChangeM = st.month;
    return true;
  },

  deal(st, p, o, params, out) {
    const c = p.card; const qAfter = () => { if (st.mentor !== 'guide' && c.q) out.mentor = (c.q + ' ' + (out.mentor || '')).trim(); }; // §7.5: the trap question comes back as reflection
    if (o.id === 'inspect:1' || o.id === 'inspect:2') { // T6 §3.5: a delay step — paid either way; a rival may close first
      const pre = rivalPre(st, p);
      inspect(st, p, o, out);
      if (p.rv) { p.rv.steps++; const lost = !!(p.rv.close && p.rv.steps >= p.rv.close); rivalLuck(st, pre, lost); if (lost) { loseToRival(st, p, out, 'inspect'); qAfter(); return true; } }
      return false;
    }
    if (o.id.startsWith('offer:')) {
      if (p.rv) { const pre = rivalPre(st, p); p.rv.steps++; const lost = !!(p.rv.close && p.rv.steps >= p.rv.close); rivalLuck(st, pre, lost); if (lost) { loseToRival(st, p, out, 'offer'); qAfter(); return true; } }
      const closed = negotiate(st, p, +o.id.slice(6), o, out); if (closed) qAfter(); return closed;
    }
    if (o.id === 'pass') {
      const cf = assetCf(st, { k: c.k, noi: c.noi, cf: c.cf, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd });
      out.mentor = mentorLine(st, cf < 0 ? 'passBad' : cf === 0 ? 'passZero' : 'passGood', {});
      if (R4(st) && p.dd && !p.dd.starter) {
        st.stats.ddPassed++;
        // the truth of a passed deal stays sealed during play; it only feeds the stats (and a possible achievement)
        const first = (describe(st).options || []).find((x) => x.kind === 'buy'); const lm = first ? first.loanMonthly : 0;
        const t = ddTruthOf(c, p.dd); const cfT = assetCf(st, c.noi != null ? { k: c.k, noi: t.base, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd } : { k: c.k, cf: t.base, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd });
        if (p.dd.level >= 1 && cfT - lm <= 0 && cf - lm > 0) st.stats.ddAvoided++;
      }
      ach(st, out, 'pass', { cf, golden: p.golden });
      qAfter();
      return true;
    }
    buyAsset(st, p, out, o);
    qAfter();
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
      if (t.kind === 'crypto' && R4(st) && (!(h.qty > 0) || h.k == null)) h.k = CUR_K; // T6 §4.3 / review m8: the luck of this position links to the buy that opened it
      h.cpi = cpiMix(h, cost, st); st.cash -= cost; h.qty += qty; h.basis += cost;
      h.lowBuy = h.lowBuy == null ? price : Math.min(h.lowBuy, price);
      if (p.tk === 'IDX') { const L = st.life; L.idxBuys++; if (L.idxSince == null) L.idxSince = st.month; lesson(st, out, 'index_fund'); if (st.month - L.lastCrash <= 3) lesson(st, out, 'buy_the_dip'); }
      sound(out, 'buy'); cashFx(out, -cost, null);
      out.toast = `קנית ${groups(qty)} ${t.unit || 'מניות'}`;
      out.mentor = mentorLine(st, t.div ? 'tradeBuyDiv' : 'tradeBuy_' + (t.kind || 'stock'), { qty: groups(qty), div: fmtM(qty * (t.div || 0)) }) || mentorLine(st, 'tradeBuy', { qty: groups(qty) });
      ach(st, out, 'tradeBuy', { tk: p.tk, qty, price });
    } else if (o.id === 'sell') {
      if (!(qty >= 1) || qty > h.qty) { out.ok = false; out.error = 'כמות לא חוקית'; return false; }
      const avg = h.basis / h.qty; const proceeds = Math.round(qty * price); const cut = Math.round(avg * qty); const gain = proceeds - cut;
      const tax = gainTax(st, cut, proceeds, h.cpi, out);
      st.cash += proceeds - tax; h.basis = Math.max(0, h.basis - cut); h.qty -= qty;
      const low = h.lowBuy; if (!h.qty) { h.lowBuy = null; h.basis = 0; delete h.k; }
      st.stats.tradeProfit += gain - tax;
      if (t.kind === 'crypto') addLuck(st, 'crypto', gain + 0.124 * cut, h.k ?? CUR_K);
      if (p.tk === 'IDX') st.life.idxSells = (st.life.idxSells || 0) + 1; // T4 E-8 (time in the market: no index sale in between)
      if (p.tk === 'IDX' && gain < 0) { st.life.idxSold++; st.life.idxSoldLoss += -gain; lesson(st, out, 'panic_selling', -gain); }
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
    if (o.id === 'credit' || o.id === 'sub') st.flags.usedCredit = true;
    if (o.id === 'credit') { st.credit += c.a; out.mentor = mentorLine(st, 'doodadCredit', { amount: fmtM(c.a), pay: fmtM(lineInterest(c.a, w.creditPct)) }); sound(out, 'card'); }
    else if (o.id === 'inst3') { // the price spread over 3 months (first now), no interest
      const am = o.amounts; st.cash -= am[0]; cashFx(out, -am[0]);
      st.expenses.push({ id: 'i' + st.nextId++, label: `תשלומים: ${c.n}`, amount: am[1], trim: false, cut: false, until: st.month, from: st.month });
      st.expenses.push({ id: 'i' + st.nextId++, label: `תשלומים: ${c.n}`, amount: am[2], trim: false, cut: false, until: st.month + 1, from: st.month + 1 });
      out.mentor = mentorLine(st, 'doodadInst', { pay: fmtM(am[1]) }); sound(out, 'card'); ensureCash(st, out, 'doodad');
    }
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
      bizArchive(st, a); mark(st, 'sell', offer.net, CUR_K, a.n);
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
      const tax = gainTax(st, Math.round(h.basis), proceeds, h.cpi, out);
      st.cash += proceeds - tax; st.stats.tradeProfit += gain - tax; cashFx(out, proceeds - tax, '+' + fmtM(proceeds - tax));
      h.qty = 0; h.basis = 0; h.lowBuy = null; holdingModelDiff(st, before, out); sound(out, 'sell');
      ach(st, out, 'tradeSell', { tk: 'GOLD', gain, crisis: true });
    }
    mark(st, 'crisis', d.amount, CUR_K, c.n); // T6 §4.2 (amount = − paid)
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
      // reward = understanding, not money (the lobby may add a small ⚡ for reward:'lesson')
      out.reward = { kind: 'lesson', lesson: c.lesson || null, right: i === c.correct };
      if (c.lesson) lesson(st, out, c.lesson);
      if (i === c.correct) { st.stats.quizRight++; sound(out, 'coin'); out.mentor = '✔ ' + c.explain; ach(st, out, 'quiz', { right: true }); }
      else { st.stats.quizWrong++; sound(out, 'card'); out.mentor = 'כמעט. ' + c.explain; }
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
      if (R5(st)) { const L5 = st.life; L5.happiness = clamp(L5.happiness + TRIM_HAPPY, 0, 100); L5.frugalCuts = Math.min(FC.focusCfg(st.worldId).frugalMaxCuts, (L5.frugalCuts || 0) + 1); } // E1 C1: a cut you live with
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
    const x = { id: st.nextId++, n: p.card.n, sector: p.card.sector, amount: amt, paper: amt, mult: h.mult, revealAt: st.month + h.revealIn, signalAt: st.month + h.signalIn, signalMult: h.signalMult, status: 'active', month: st.month, cpi: st.life.cpi, ev: round2(pitchEV(st.worldId, p.card)) };
    x.k = CUR_K; st.angels.push(x); st.stats.angels++; // T6 §4.3: the angel luck links to this investment
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
  dreamTickSt(st, out); goalTick(st, out);
  return { ...out, event: currentEvent(st), end: null };
}
/** Repay one loan unit (or the whole remainder if smaller, or `amount`). */
export function repayLoan(st, amount) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const unit = loanUnit(st);
  const amt = Math.min(st.loans, amount ? Math.max(1, Math.round(amount)) : unit);
  if (!st.loans || st.cash < amt || amt <= 0) return { ...out, ok: false, error: !st.loans ? 'אין הלוואות' : 'אין מספיק מזומן', event: currentEvent(st) };
  act(st, ['R', amount || 0]);
  st.loans -= amt; st.cash -= amt;
  if (R5(st)) creditScore(st, BK.CREDIT_DELTAS.loanRepaid * repayCredit(st, amt)); else creditScore(st, BK.CREDIT_DELTAS.loanRepaid);
  cashFx(out, -amt); sound(out, 'buy');
  out.mentor = mentorLine(st, 'loanRepaid', { amount: fmtM(amt), cost: fmtM(Math.round(amt * loanPct(st) / 100)) });
  ach(st, out, 'repay', {});
  logDecision(st, 'הלוואה', 'החזרת ' + fmtM(amt));
  return { ...out, event: currentEvent(st), end: endIfIdle(st, out) };
}
/**
 * E1 B1 (rules 5): how many repayment bonuses a repayment of `amt` earns. Only principal that was owed at the previous payday counts
 * (L.repayOk, set at every payday), one bonus per full loan unit of it repaid (+1 for the last partial unit) — a loan taken and
 * repaid between two paydays earns nothing, so the score cannot be farmed. Mutates L.repayOk / L.repayCr.
 */
function repayCredit(st, amt) {
  const L = st.life; if (!L) return 0;
  const elig = Math.max(0, Math.min(amt, L.repayOk || 0)); if (!elig) return 0;
  const u = loanUnit(st); const before = L.repayCr || 0;
  L.repayOk -= elig; L.repayCr = before + elig;
  return Math.floor(L.repayCr / u) - Math.floor(before / u) + (L.repayOk === 0 && L.repayCr % u ? 1 : 0);
}
/** Pay the whole credit-card debt. */
export function payCredit(st) {
  if (st.over) throw new Error('game over');
  const out = newOut();
  if (!st.credit || st.cash < st.credit) return { ...out, ok: false, error: !st.credit ? 'אין חוב אשראי' : 'אין מספיק מזומן', event: currentEvent(st) };
  act(st, ['C']);
  cashFx(out, -st.credit); st.cash -= st.credit; st.credit = 0; sound(out, 'buy'); creditScore(st, BK.CREDIT_DELTAS.loanRepaid);
  out.mentor = mentorLine(st, 'creditPaid', {});
  ach(st, out, 'creditPaid', {}); dreamTickSt(st, out);
  return { ...out, event: currentEvent(st), end: endIfIdle(st, out) };
}
/** v3: choose the monthly plan any time between rolls (applies from the next payday). */
export function setPlan(st, planId) {
  if (st.over) throw new Error('game over');
  const out = newOut();
  if (!PLANS[planId] || !planAllowed(st, planId)) return { ...out, ok: false, error: 'התוכנית לא זמינה', event: currentEvent(st) };
  if (st.life.plan !== planId) { act(st, ['P', planId]); applyPlan(st, planId, out); if (st.story && st.story.flags.planLock) st.story.flags.planLock = null; } // a manual plan change ends a story plan lock
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
  goalTick(st, out); dreamTickSt(st, out); // T4 E-4 / E-7
  return { ...out, event: currentEvent(st), end: null };
}
/** v3: report the side hustle to the tax authority (open a file, pay monthly advances — no year-end penalty). */
export function setSideReport(st, on) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const v = !!on;
  if (st.life.sideReport !== v) { act(st, ['T', v ? 1 : 0]); st.life.sideReport = v; if (v) lesson(st, out, 'side_tax'); }
  out.mentor = v ? 'פתחת תיק במס הכנסה: מעכשיו משלמים מקדמות כל חודש, ואין הפתעות בסוף השנה.' : null;
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
    h.cpi = cpiMix(h, cost, st); st.cash -= cost; h.qty += qty; h.basis += cost; const L = st.life; L.idxBuys++; if (L.idxSince == null) L.idxSince = st.month;
    lesson(st, out, 'index_fund'); if (st.month - L.lastCrash <= 3) lesson(st, out, 'buy_the_dip');
    cashFx(out, -cost); sound(out, 'buy'); logDecision(st, 'קרן מדד', 'קנה ' + qty, 0);
  } else if (side === 'sell') {
    if (!(qty >= 1) || qty > h.qty) return { ...out, ok: false, error: 'כמות לא חוקית', event: null };
    act(st, ['I', 'sell', qty]);
    const avg = h.basis / h.qty; const proceeds = Math.round(qty * price); const cutB = Math.round(avg * qty); const gain = proceeds - cutB;
    const tax = gainTax(st, cutB, proceeds, h.cpi, out);
    st.cash += proceeds - tax; h.basis = Math.max(0, h.basis - cutB); h.qty -= qty; if (!h.qty) { h.basis = 0; h.lowBuy = null; }
    st.stats.tradeProfit += gain - tax; out.tax = tax;
    if (gain < 0) { st.life.idxSold++; st.life.idxSoldLoss += -gain; lesson(st, out, 'panic_selling'); out.mentor = mentorLine(st, 'indexSellLoss', {}); }
    cashFx(out, proceeds - tax); sound(out, gain >= 0 ? 'sell' : 'loss'); logDecision(st, 'קרן מדד', 'מכר ' + qty, gain - tax);
  } else return { ...out, ok: false, error: 'side must be buy|sell', event: null };
  holdingModelDiff(st, before, out);
  return { ...out, event: null, end: endIfIdle(st, out) };
}

/* ============================================================ T3 stories: chains, the story inbox ('Q'), C1–C9 (rules 4) */
// docs/next-level/specs/T3-stories-business.md. Chain DATA lives in js/systems/chains.js; this is the interpreter.
// RNG: exactly 2 'story' draws per payday (storyDraw, every rules-4 game) + 2 per simulated month per business (st.bizStory).
// Nothing here draws from an existing stream; substitutions, variants, doodad swaps and every outcome are pure functions of state.
let STORIES_OFF = false;
/** Tests only (acceptance §12.2): turn the chains / inbox / substitutions off; never stored in a save. */
export function __storiesOff(v = true) { STORIES_OFF = !!v; }
const T3 = (st) => R4(st) && !STORIES_OFF && !!st.story;
const STORY_TAG = '#5b6b8c';
const CHAIN_COLORS = { car: '#4b6584', move: '#8854d0', career: '#2d98da', side: '#20bf6b', friend: '#eb3b5a', crisis: '#a5452f', biz: '#0f766e' };

/** Expense tags (C1/C2): assigned once by regex; code reads tags, never labels. */
function expenseTag(label) {
  if (/הלוואת רכב/.test(label)) return 'carLoan';
  if (/רכב|ליסינג|טנדר/.test(label)) return 'car';
  if (/משכנתא/.test(label)) return 'mortgage';
  if (/שכירות/.test(label)) return 'rent';
  if (/תחבורה ציבורית|רכבת|שיתוף רכב/.test(label)) return 'transport';
  return null;
}
/** A line's tag: stored when set by a story effect, else derived from the label (no tag is written at load: saves round-trip byte-identically). */
const tagOf = (x) => (x.tag !== undefined ? x.tag : expenseTag(x.label));
const carLines = (st) => st.expenses.filter((x) => tagOf(x) === 'car' && (!x.until || x.until >= st.month));
/** C2: the housing line and its kind (rent / mortgage / none). No life or story effect ever changes a mortgage line. */
function housingOf(st) {
  const r = st.expenses.find((x) => tagOf(x) === 'rent'); if (r) return { line: r, kind: 'rent' };
  const m = st.expenses.find((x) => tagOf(x) === 'mortgage'); return m ? { line: m, kind: 'mortgage' } : { line: null, kind: null };
}

/** The idempotent T3 part of v4Defaults (no randomness): story state, expense tags, L.friend → chains.friend, business upgrade. */
function ensureStoryState(st) {
  if (!st.story) {
    st.story = { chains: {}, inbox: [], nextId: 1, seen: {}, shown: {}, memory: [], flags: { noCar: false, commute: 0, area: 'center', payCut: null, carShare: false, planLock: null, busM: null },
      r: [0.5, 0.5], lastChainItemM: -99, lastBizItemM: {}, chainItemsM: -1, bizItemsM: -1, energyLow: 0, energyHigh: 0, offSide: 0, lastEcon: null, crisesSeen: 0, jobChangeM: -99, loadSince: null, defaults: 0 };
    // migration of a pre-T3 rules-4 save: a bus choice made before the chains existed means no car (tags are derived from labels: tagOf)
    if (R4(st) && st.life && st.month > 1) {
      if ((st.expenses || []).some((x) => /תחבורה ציבורית/.test(x.label)) || ((st.life.events || []).some((e) => e.id === 'car' && e.o === 'bus') && !carLines(st).length)) { st.story.flags.noCar = true; st.story.flags.busM = st.month; }
      st.story.crisesSeen = (st.stats && st.stats.crises) || 0;
    }
  }
  const S = st.story;
  for (const k of ['shown', 'lastBizItemM']) if (!S[k]) S[k] = {};
  if (S.flags.planLock === undefined) S.flags.planLock = null;
  if (!st.bizStory) st.bizStory = {};
  if (!Array.isArray(st.incomeExtra)) st.incomeExtra = [];
  if (st.stats && st.stats.storyDefaults == null) st.stats.storyDefaults = 0;
  if (st.dq && st.dq.luck && st.dq.luck.story == null) st.dq.luck.story = 0;
  for (const a of st.assets || []) if (a.biz && !a.biz.closed) {
    const key = 'a' + a.id;
    if (!R4(st)) continue; // rules 3: businesses stay v3 (no story stream, no T3 upgrade)
    if (st.bizStory[key] == null) st.bizStory[key] = mix32(((st.bizRng && st.bizRng[key]) >>> 0) ^ 0x51A7E5ED) || 1;
    if (!a.biz.t3) a.biz = BIZ.upgradeT3(a.biz);
  }
  // C4: an open v3 friend loan becomes the friend chain, resolving at the same month with the same outcome (rules 4 only)
  const L = st.life;
  if (L && L.friend && R4(st) && !S.chains.friend) {
    const f = L.friend;
    S.chains.friend = { stage: 'wait', run: 1, path: f.kind, startM: f.at - 6, nextAt: f.at, nextStep: 'resolve', endM: null, seal: { entry: f.kind === 'lend' ? (f.ok ? 0.99 : 0) : (f.ok ? 0.99 : 0) },
      data: { amount: f.amount, at: f.at, ok: f.kind === 'lend' ? !!f.ok : true, called: f.kind === 'guarantee' ? !f.ok : false, risk: f.kind === 'guarantee' ? f.amount : 0, extra: 0, name: CH.NAMES.friend[0] }, hist: [], steps: ['f1'] };
    L.friend = null;
  }
}

/** Exactly 2 'story' draws every payday of a rules-4 game (also history, also with no chain active). */
function storyDraw(st) { const a = next(st.rng, 'story'), b = next(st.rng, 'story'); if (st.story) st.story.r = [a, b]; }
/** T3 §6.2 calendar: history = the real month; otherwise game month 1 = January. */
function calOf(st) { if (st.history && st.history.ym) { const m = +String(st.history.ym).slice(5, 7); if (m >= 1 && m <= 12) return m; } const c = W(st).calendar; const s0 = (c && c.startMonth) || 1; return ((st.month - 1 + s0 - 1) % 12 + 12) % 12 + 1; } // worlds wave 0: a world may start in another month (w5: October)
function calendarOf(st) {
  const m = calOf(st); const own = managedOf(st);
  const season = own.map((a) => (BIZ.SEASONS[a.biz.type] || {})[m]).find(Boolean);
  return { m, label: BIZ.MONTH_HE[m - 1], season: season ? season[1] : null };
}
function econLabel(st) { return st.econ && R4(st) ? CY.econPublic(st.econ, st.month, st.worldId).label : null; }
const chainOf = (st, id) => st.story.chains[id] || null;
const chainOpen = (c) => !!c && !['idle', 'done'].includes(c.stage);
const openChains = (st) => CH.CHAIN_IDS.filter((id) => id !== 'crisis' && chainOpen(st.story.chains[id])).length;
/** Can chain `id` start a new run now (not open, cooldown over, runs left, ≤ 2 open chains — crisis exempt)? */
function chainCanStart(st, id) {
  const C = CH.CHAINS[id]; const c = chainOf(st, id);
  if (!chainWorldOk(st, C)) return false;
  if (c && chainOpen(c)) return false;
  if (c && (c.run || 0) >= C.maxRuns) return false;
  if (c && c.stage === 'done' && st.month < (c.endM || 0) + C.cooldown) return false;
  if (!C.exempt && openChains(st) >= 2) return false;
  return true;
}
function startChain(st, id, stage) {
  const prev = chainOf(st, id);
  const c = { stage, run: (prev ? prev.run || 0 : 0) + 1, path: null, startM: st.month, nextAt: null, nextStep: null, endM: null, seal: { entry: 0.5, a: 0.5, b: 0.5 }, data: {}, hist: [], steps: [] };
  st.story.chains[id] = c; return c;
}
function endChain(st, id, out, newsKey, vars) {
  const c = chainOf(st, id); if (!c) return;
  c.stage = 'done'; c.endM = st.month; c.nextAt = null; c.nextStep = null;
  if (newsKey && CH.NEWS[newsKey]) out.news.push({ kind: 'story', chain: id, text: gz(st, tpl(CH.NEWS[newsKey], vars || storyVars(st, id))) });
}

/* ---------------------------------------------------------------- C3 / C8: tile-L eligibility, cooldowns, substitution (no draws) */
const crisisAtJob = (st) => { const c = chainOf(st, 'crisis'); return !!c && chainOpen(c) && (c.nextStep === 'job' || (c.stage === 'item' && c.step === 'job')); };
const isJobless = (st) => !!(st.life.jobless && st.life.jobless.until >= st.month);
function lifeEligible(st, id) {
  const L = st.life; const S = st.story;
  const cd = CH.COOLDOWN[id]; if (cd && S.seen[id] != null && st.month - S.seen[id] < cd) return false;
  const cap = CH.CAP[id]; if (cap && (S.shown[id] || 0) >= cap) return false;
  switch (id) {
    case 'wedding': return L.family.partner !== 'married';
    case 'baby': return L.family.kids < 3 && L.family.partner !== 'none';
    case 'parent': return !st.expenses.some((x) => /עזרה להורים/.test(x.label) && (!x.until || x.until >= st.month));
    case 'reserve': return !isJobless(st);
    case 'jobOffer': return !isJobless(st) && !crisisAtJob(st);
    case 'layoff': return !isJobless(st) && !crisisAtJob(st) && st.month - S.jobChangeM >= 6;
    case 'course': return !L.study.done;
    case 'quiet': case 'health': case 'vacation': return true;
    default: return true;
  }
}
/** A chain entry card (car / moving / friend): the step to show, or null when the chain blocks it. */
function chainEntryStep(st, cardId) {
  const S = st.story;
  if (cardId === 'car') {
    if (!chainCanStart(st, 'car')) return null;
    if (S.flags.noCar) return S.flags.busM != null && st.month - S.flags.busM >= 24 ? { chain: 'car', step: 'carBack' } : null;
    return carLines(st).length ? { chain: 'car', step: 's1' } : null;
  }
  if (cardId === 'moving') { if (!chainCanStart(st, 'move')) return null; return { chain: 'move', step: housingOf(st).kind === 'rent' ? 'm1' : 'homeRepair' }; }
  if (cardId === 'friend') return chainCanStart(st, 'friend') ? { chain: 'friend', step: 'f1' } : null;
  return null;
}
/** createLife (rules 4): the drawn card → the card actually shown (entry / variant / substitute). Pure. */
function storyLifeCard(st, card, r) {
  const S = st.story; let id = card.id;
  // T2 §8.5: the cycle swaps job news (no draw; off in w1) — the swapped card must still be eligible (24-month layoff cooldown)
  if (st.econ && CY.cycleCfg(st.worldId).swaps) {
    const to = st.econ.phase === 'exp' && id === 'layoff' ? 'jobOffer' : st.econ.phase === 'rec' && id === 'jobOffer' ? 'layoff' : null;
    if (to && lifeEligible(st, to)) id = to;
  }
  let p = null;
  if (id === 'car' || id === 'moving' || id === 'friend') {
    const gate = ((r * 9973) % 1) < (((CH.TRIGGER.entryWorld[st.worldId] || {})[id]) ?? CH.TRIGGER.entry[id] ?? 1); // T3 review M8 (sealed; never the raw draw the chain's odds use)
    const e = gate ? chainEntryStep(st, id) : null;
    if (e) { const c = startChain(st, e.chain, 'card'); c.step = e.step; c.seal.entry = r; c.steps.push(e.step); p = { type: 'life', eventId: id, r, chain: { id: e.chain, step: e.step } }; }
  } else if (lifeEligible(st, id) && LIFE_EVENTS.some((x) => x.id === id)) p = { type: 'life', eventId: id, r };
  if (!p) {
    const rot = CH.SUBST.slice(0, 4); const k0 = Object.values(S.shown).reduce((a, b) => a + b, 0) % rot.length; // rotate the start (pure: how many L cards were shown) so no card is everyone's fallback
    const order = [...rot.slice(k0), ...rot.slice(0, k0), ...CH.SUBST.slice(4)];
    const sub = order.find((x) => x !== card.id && x !== id && lifeEligible(st, x)) || 'quiet';
    p = { type: 'life', eventId: sub, r, sub: card.id };
  }
  S.seen[p.eventId] = st.month; S.shown[p.eventId] = (S.shown[p.eventId] || 0) + 1;
  p.drawn = card.id; // the deck card itself (identical for every player of a seed; never described)
  return p;
}

/* ---------------------------------------------------------------- story template variables (PUBLIC state only — U12) */
function storyVars(st, chainId, item) {
  const S0 = storyS(st, chainId); const c = chainOf(st, chainId) || { data: {}, startM: st.month }; const d = c.data || {};
  const E = Math.max(1, expensesOf(st)); const L = st.life; const h = housingOf(st);
  const net = Math.max(1, baseNet(st)); const rent = h.kind === 'rent' ? h.line.amount : 0;
  const inflLast = L.infl.length ? L.infl[L.infl.length - 1] : (st.history ? 0 : 3);
  const raisePct = Math.max(3, Math.round(inflLast) + 2);
  const idx = st.holdings.IDX; const idxQty = idx ? idx.qty : 0;
  const peak = L.idxPeak || st.prices.IDX;
  const lease = st.expenses.find((x) => x.id === d.leaseId);
  const own = managedOf(st)[0];
  const fname = d.name || CH.NAMES.friend[Math.min(1, Math.max(0, (c.run || 1) - 1))];
  const v = {
    S: fmtM(S0), fix: fmtM(r100(0.4 * S0)), fix2: fmtM(r100(0.25 * S0)), paid: fmtM(d.paid || 0), paidNow: fmtM(d.paidNow || 0), spent: fmtM(d.spent || d.paid || 0),
    ago: String(Math.max(1, st.month - (d.agoM ?? c.startM))), saved: fmtM(Math.max(0, d.savedPerMonth || 0) * Math.max(1, st.month - (d.agoM ?? c.startM))),
    lease: fmtM(lease ? lease.amount : d.leaseAmt || 0), leaseNew: fmtM(r10(0.12 * S0)), extra: fmtM(chainId === 'friend' ? r100(0.5 * S0) : r10(0.02 * S0)),
    rent: fmtM(rent), raise: fmtM(chainId === 'move' && item && item.step === 'm2renew' ? r10(rent * raisePct / 100) : r10(0.03 * S0)), raisePct: String(raisePct),
    share: String(Math.round((rent || (h.line ? h.line.amount : 0)) / net * 100)), inflLast: String(inflLast),
    energy: String(Math.round(L.energy)), months: String(Math.max(1, L.planMonths.work + L.planMonths.overtime)), pBurn: String(Math.round(burnoutOdds(st).next * 100)), pBurn2: String(Math.round(burnoutOdds(st).after * 100)),
    cushion: (Math.round((st.cash + (st.savings || 0)) / E * 10) / 10).toFixed(1),
    due12: fmtM(r100(sideExpected(st) * marginalRate(grossBase(st)) * 12 * 1.1)), first: fmtM(d.first || sideExpected(st)), avg: fmtM(L.side.months ? r10(L.side.total / Math.max(1, L.side.months)) : sideExpected(st)), cost: fmtM(r100(0.3 * S0)),
    amount: fmtM(d.amount || r100(S0)), risk: fmtM(d.risk || r100(1.5 * S0)), name: fname,
    dd: String(Math.max(0, Math.round((1 - st.prices.IDX / Math.max(1, peak)) * 100))), idxValue: fmtM(Math.round(idxQty * st.prices.IDX)), units: String(idxQty), auto: fmtM(L.autoInvest || d.auto || 0),
    unitsDuring: String(d.unitsDuring || 0), diff: fmtM(Math.round((d.unitsDuring || 0) * st.prices.IDX - (d.spentDuring || 0))), back: String(Math.round(st.prices.IDX / Math.max(1, d.peakAtStart || peak) * 100)),
    repair: fmtM(r100(0.8 * S0)), repair2: fmtM(r100(0.9 * S0)), debtLine: st.loans > 0 ? ' — ויש לך הלוואה בבנק' : '',
    bizName: own ? own.n : '', bizCash: own ? fmtM(own.biz.cash) : '', raiseP: String(Math.round(raiseChance(st) * 100)), cf: fmtM(d.cf || 0), label: '', n: '',
    netUp: fmtM(Math.max(0, baseNet(st) - (d.net0 || baseNet(st)))), energyAvg: String(Math.round(L.energy)),
  };
  const mv = chainOf(st, 'move');
  v.rememberMove = mv && mv.path === 'stay' ? 'בפעם הקודמת נשארת וקיבלת העלאה קטנה.' : mv && mv.path === 'periphery' ? 'עברת לפריפריה כדי לחסוך בשכירות.' : mv && mv.path ? `לפני ${heMonths(Math.max(1, st.month - mv.startM))} עברת דירה.` : '';
  v.rememberFriend = chainId === 'friend' && (c.run || 1) >= 2 ? `זוכר מה קרה עם ${CH.NAMES.friend[0]}? הפעם ${CH.NAMES.friendGender === 'f' ? 'זו' : 'זה'} ${CH.NAMES.friend[1]}.` : '';
  v.rememberF2 = d.path === 'guarantee' || c.path === 'guarantee' ? `חתמת לו ערבות של ${fmtM(d.risk || 0)}.` : `כבר נתת לו ${fmtM(d.amount || 0)}.`;
  v.f2line = c.path === 'guarantee' ? 'הבנק רוצה ממנו עוד ערבות.' : '';
  v.pathLine = !d.choice ? '' : d.choice === 'keep' ? 'המשכת — והיחידות שקנית בירידה שוות היום יותר.' : d.choice === 'pause' ? 'עצרת — ובצדק אם לא הייתה כרית; היחידות שלא נקנו עלו בינתיים.'
    : d.choice === 'sell' ? `מכרת ב־${fmtP(d.sellPrice || 0)}; היום המדד ב־${fmtP(st.prices.IDX)}.` : d.choice === 'start' ? `התחלת לקנות בירידה — ויש לך היום ${idxQty} יחידות.` : `הגדלת — ויש לך היום ${idxQty} יחידות.`;
  // T3 verify D9: the c1 headline follows what started the crisis (the gauge, an index drop or a crisis tile), the drop is never "0%"
  if (chainId !== 'crisis') { v.crisisTitle = v.ddLine = v.c1Ask = ''; return v; }
  const ddN = Math.max(0, Math.round((1 - st.prices.IDX / Math.max(1, peak)) * 100)); const lbl = econLabel(st);
  v.crisisTitle = lbl === 'מיתון' || d.trig === 'signal' ? 'כותרות: מיתון' : d.trig === 'index' || ddN >= 8 ? 'כותרות: המדד צונח' : 'כותרות: משבר בשווקים';
  v.ddLine = ddN > 0 ? `המדד ירד ${ddN}% מהשיא.` : 'המדד עוד מחזיק, אבל הכותרות מפחידות.';
  v.c1Ask = idxQty > 0 || L.autoInvest > 0 || !optionWhen(st, 'crisis', 'start') ? 'מה עושים עם ההשקעות?' : 'אין לך השקעות בקרן המדד — הירידה לא פוגעת בך ישירות.';
  return v;
}

/* ---------------------------------------------------------------- effects preview (signed flow, salary, odds) and money */
/** Monthly net change from a gross multiplier (salary chip). */
const salaryDelta = (st, mult) => slip(r10(grossBase(st) * mult), taxPoints(st)).net - baseNet(st);
/** T3 verify D7: a permanent raise as it lands on THIS month's pay — a running temporary cut shrinks it (= the applied change). */
function salaryDeltaNow(st, mult) { const c = payCutOf(st); if (!c) return salaryDelta(st, mult); const g0 = grossBase(st), tp = taxPoints(st); return slip(r10(r10(g0 * mult) * c.mult), tp).net - slip(r10(g0 * c.mult), tp).net; }
/** T3 review M1: the active temporary pay cuts (st.story.flags.payCut: a legacy single object or a list of {src, mult, until, label}). */
function payCutsOf(st) { const p = st.story && st.story.flags.payCut; return (!p ? [] : Array.isArray(p) ? p : [p]).filter((c) => c && c.until >= st.month); }
/** The combined cut this month → {mult, label} | null (every active cut multiplies; one label per source). */
function payCutOf(st) { const cs = payCutsOf(st); if (!cs.length) return null; return { mult: cs.reduce((m, c) => m * c.mult, 1), label: [...new Set(cs.map((c) => c.label || 'קיצוץ זמני בשכר'))].join(' + ') }; }
/** Add a temporary cut (replacing a running cut of the same source). */
function addPayCut(st, cut) { const F = st.story.flags; const list = (Array.isArray(F.payCut) ? F.payCut : F.payCut ? [{ src: F.payCut.label === 'חצי משרה' ? 'partTime' : 'crisis', ...F.payCut }] : []).filter((c) => c.src !== cut.src && c.until >= st.month); list.push(cut); F.payCut = list; }
/** Drop the cuts of one source (sideGraduate ends only the part time). */
function dropPayCut(st, src) { const F = st.story.flags; if (!F.payCut) return; const list = (Array.isArray(F.payCut) ? F.payCut : [{ src: F.payCut.label === 'חצי משרה' ? 'partTime' : 'crisis', ...F.payCut }]).filter((c) => c.src !== src); F.payCut = list.length ? list : null; }
/** The net change of a temporary cut from the CURRENT effective pay (stacked cuts included) — the chips use this (M1). */
function tempCutDelta(st, mult) { const c = payCutOf(st); const g1 = r10(grossBase(st) * (c ? c.mult : 1)); return slip(r10(g1 * mult), taxPoints(st)).net - slip(g1, taxPoints(st)).net; }
/**
 * ₪ over H months of an effects block — the ONE money function behind the card totals (total12 / total24) and the evaluator (§9.2).
 * Never reads a seal: sealed branches enter at their shown odds.
 */
function storyMoney(e, H, ctx) {
  const span = (m) => Math.min(m || H, H);
  let v = (e.cash || 0) + (e.flow || 0) * span(e.months) + (e.salary || 0) * span(e.salaryMonths);
  if (e.oddsMoney) v += e.oddsMoney.p * e.oddsMoney.hit + (1 - e.oddsMoney.p) * e.oddsMoney.miss;
  if (e.study && ctx && !ctx.study.done) v += LIFE_CFG.studyRaise * ctx.baseNet * 24 / ctx.study.need * e.study;
  return Math.round(v);
}
/** Tests / UI: the money term of a story option's effects over H months (= effects.total24 at H 24; §12.20). */
export function storyMoneyFor(st, effects, H = 24) { return storyMoney(effects, H, { study: st.life.study, baseNet: baseNet(st) }); }
function storyOddsP(st, o) { return o.odds ? (o.odds.p === 'raise' ? round2(raiseChance(st)) : o.odds.p) : null; }
/** Effects of one story option (the card's chips) — generic fx + the hook's preview. */
function storyEffects(st, chainId, stepId, o, item) {
  const S = storyS(st, chainId); const fx = o.fx || {}; const h = housingOf(st);
  const e = { cash: 0, flow: 0, months: 0, salary: 0, salaryMonths: 0, happiness: fx.happiness || 0, energy: fx.energy || 0, glow: fx.glow || 0, study: fx.study || 0, risk: null, note: o.note || '' };
  if (fx.cash) e.cash += r100(fx.cash * S);
  if (fx.line) { e.flow -= r10(fx.line.amt * S); e.months = fx.line.months || 0; }
  if (fx.rentAdd) e.flow -= h.kind === 'rent' ? r10(fx.rentAdd * S) : 0;
  if (fx.rentPct) e.flow -= h.kind === 'rent' ? r10(h.line.amount * fx.rentPct / 100) : 0;
  if (fx.carCut) e.flow += carLines(st).reduce((x, l) => x + r10(l.amount * fx.carCut), 0);
  if (fx.carLinePct) e.flow -= carLines(st).reduce((x, l) => x + r10(l.amount * fx.carLinePct / 100), 0);
  if (fx.grossMult) { e.salary = salaryDeltaNow(st, fx.grossMult); e.salaryMonths = 0; }
  if (fx.grossTemp) { e.salary = tempCutDelta(st, fx.grossTemp.mult); e.salaryMonths = fx.grossTemp.months; }
  if (fx.jobless) { e.salary = -r10(baseNet(st) * 0.4); e.salaryMonths = fx.jobless; }
  if (fx.planLock) { const ps = payslipOf(st, fx.planLock.plan); e.salary = ps.net - payslipOf(st).net; e.salaryMonths = fx.planLock.months; e.energy += PLANS[fx.planLock.plan].energy * fx.planLock.months; e.happiness += PLANS[fx.planLock.plan].happiness * fx.planLock.months; }
  if (fx.sideReport) { e.flow -= sideReportFee(st); e.months = 0; e.oddsMoney = null; }
  const hook = o.hook && STORY_HOOKS[o.hook]; if (hook && hook.preview) hook.preview(st, e, { chainId, stepId, o, item, S });
  if (o.odds && o.oddsS && !e.oddsMoney) e.oddsMoney = { p: storyOddsP(st, o), hit: r100(o.oddsS.hit * S), miss: r100(o.oddsS.miss * S) };
  if (o.odds && !e.oddsMoney) e.oddsMoney = { p: storyOddsP(st, o), hit: 0, miss: 0 };
  return e;
}

/* ---------------------------------------------------------------- hooks: effects with computed amounts (preview + apply) */
// apply(st, ctx) — ctx = {chainId, stepId, o, c (chain), item, hit (the sealed event happened), S, out}
const leaseLine = (st, c) => st.expenses.find((x) => x.id === (c.data || {}).leaseId) || null;
function addLine(st, label, amount, months, tag) {
  const x = { id: 'x' + st.nextId++, label, amount: Math.max(0, Math.round(amount)), trim: false, cut: false, until: months ? st.month + months - 1 : null, tag: tag === undefined ? expenseTag(label) : tag };
  st.expenses.push(x); return x;
}
function addIncome(st, label, amount, months) { st.incomeExtra.push({ id: 'i' + st.nextId++, label, amount: Math.round(amount), until: months ? st.month + months - 1 : null }); }
function goBus(st, c, saved) { // C1: no car — every car-tagged line is cut and becomes public transport
  const S = st.story; S.flags.noCar = true; S.flags.busM = st.month;
  // T3 verify D1: `saved` is the monthly cut the option really applied (applyCarCut's return, measured before the lines were
  // retagged transport) — summing carLines() here, after the cut, always gave ₪0
  if (c) { c.data.savedPerMonth = Math.max(0, Math.round(saved || 0)); c.data.agoM = st.month; }
}
const STORY_HOOKS = {
  carPaid: { apply(st, x) { const amt = r100((x.stepId === 's1' ? 0.4 : 0.25) * x.S); const d = x.c.data; d.paidNow = amt; if (x.stepId === 's1') { d.paid = amt; d.agoM = st.month; } d.spent = (d.spent || 0) + amt; } },
  leaseStart: { apply(st, x) { const l = st.expenses[st.expenses.length - 1]; if (l && /ליסינג/.test(l.label)) { x.c.data.leaseId = l.id; x.c.data.leaseEnd = st.month + 35; x.c.data.leaseAmt = l.amount; } } },
  busStart: { preview(st, e) { void st; void e; }, apply(st, x) { goBus(st, x.c, x.carSaved); } },
  leaseKeep: { preview(st, e, x) { e.flow -= r10(0.02 * x.S); }, apply(st, x) { const l = leaseLine(st, x.c); if (l) l.amount += r10(0.02 * x.S); } },
  leaseExit: { preview(st, e, x) { const c = chainOf(st, 'car'); const l = c && leaseLine(st, c); if (l) { e.cash -= 3 * l.amount; e.flow += l.amount; e.months = Math.max(1, (l.until || st.month) - st.month + 1); } void x; },
    apply(st, x) { const l = leaseLine(st, x.c); if (l) { st.cash -= 3 * l.amount; st.expenses = st.expenses.filter((y) => y !== l); } } },
  leaseDown: { preview(st, e) { const c = chainOf(st, 'car'); const l = c && leaseLine(st, c); if (l) { e.cash -= r100(0.5 * l.amount); e.flow += r10(l.amount * 0.3); e.months = Math.max(1, (l.until || st.month) - st.month + 1); } },
    apply(st, x) { const l = leaseLine(st, x.c); if (l) { st.cash -= r100(0.5 * l.amount); l.amount -= r10(l.amount * 0.3); } } },
  leaseReturn: { preview(st, e) { const c = chainOf(st, 'car'); const l = c && leaseLine(st, c); const base = carLines(st).filter((y) => y !== l); e.flow -= base.reduce((s, y) => s + r10(y.amount * 0.1), 0); },
    apply(st, x) { const l = leaseLine(st, x.c); if (l) st.expenses = st.expenses.filter((y) => y !== l); for (const y of carLines(st)) y.amount += r10(y.amount * 0.1); } },
  leaseBuyout: { apply(st, x) { const l = leaseLine(st, x.c); if (l) st.expenses = st.expenses.filter((y) => y !== l); } },
  leaseNoCar: { preview(st, e) { const c = chainOf(st, 'car'); const l = c && leaseLine(st, c); const lA = l && carLines(st).includes(l) ? l.amount : 0; e.flow += lA + carLines(st).filter((y) => y !== l).reduce((s, y) => s + r10(y.amount * 0.6), 0); }, // a running lease goes whole, the rest is cut 60% (D1: chip = saving)
    apply(st, x) { const l = leaseLine(st, x.c); const lA = l && carLines(st).includes(l) ? l.amount : 0; if (l) st.expenses = st.expenses.filter((y) => y !== l); goBus(st, x.c, lA + applyCarCut(st, 0.6)); } },
  moveAway: { apply(st, x) { x.c.data.savedPerMonth = Math.max(0, x.rentSaved || 0); x.c.data.agoM = st.month; } }, // D1: m3commute's "{saved}" = the rent the move really cut × months since
  renewAccept: { preview(st, e) { const h = housingOf(st); const pct = +storyVars(st, 'move', { step: 'm2renew' }).raisePct; if (h.kind === 'rent') e.flow -= r10(h.line.amount * pct / 100); },
    apply(st) { const h = housingOf(st); const pct = +storyVars(st, 'move', { step: 'm2renew' }).raisePct; if (h.kind === 'rent') h.line.amount += r10(h.line.amount * pct / 100); } },
  renewNegotiate: { preview(st, e) { const h = housingOf(st); const pct = +storyVars(st, 'move', { step: 'm2renew' }).raisePct; const full = h.kind === 'rent' ? r10(h.line.amount * pct / 100) : 0; e.oddsMoney = { p: 0.55, hit: -Math.round(full / 2) * 24, miss: -full * 24 }; e.happinessRisk = -2; },
    apply(st, x) { const h = housingOf(st); const pct = +storyVars(st, 'move', { step: 'm2renew' }).raisePct; if (h.kind !== 'rent') return; const full = r10(h.line.amount * pct / 100);
      if (x.hit) { h.line.amount += r10(full / 2); x.out.news.push({ kind: 'story', chain: 'move', text: `בעל הבית הסכים לחצי: רק ${fmtM(r10(full / 2))} יותר בחודש.` }); }
      else { h.line.amount += full; st.life.happiness = clamp(st.life.happiness - 2, 0, 100); x.out.news.push({ kind: 'story', chain: 'move', text: 'בעל הבית לא זז מהמחיר. ההעלאה המלאה נשארת.' }); } } },
  commuteCar: { preview(st, e, x) { if (st.story.flags.noCar) { e.cash -= r100(1.2 * x.S); e.flow -= r10(0.1 * x.S); } else e.flow -= carLines(st).reduce((s, y) => s + r10(y.amount * 0.15), 0); },
    apply(st, x) { const F = st.story.flags; if (F.noCar) { st.cash -= r100(1.2 * x.S); addLine(st, 'רכב', r10(0.1 * x.S), 0, 'car'); F.noCar = false; } else for (const y of carLines(st)) y.amount += r10(y.amount * 0.15); F.commute = 0; } },
  degreeInterview: { preview(st, e) { const hit = salaryDelta(st, 1.18) * 23, miss = salaryDelta(st, 1.05) * 23; e.oddsMoney = { p: 0.6, hit, miss }; },
    apply(st, x) { setGross(st, x.hit ? 1.18 : 1.05); st.story.jobChangeM = st.month; x.out.news.push({ kind: 'story', chain: 'career', text: x.hit ? 'מצאת משרה שמשלמת על התואר: +18% ברוטו.' : 'מצאת עבודה — פחות ממה שקיווית: +5% ברוטו.' }); } },
  degreeAsk: { preview(st, e) { e.oddsMoney = { p: round2(raiseChance(st)), hit: salaryDelta(st, 1.08) * 24, miss: 0 }; },
    apply(st, x) { if (x.hit) { setGross(st, 1.08); st.life.lastRaise = st.month; st.life.raises++; x.out.news.push({ kind: 'story', chain: 'career', text: 'הבוס הסכים: +8% ברוטו על התואר.' }); } else { st.life.happiness = clamp(st.life.happiness - 3, 0, 100); x.out.news.push({ kind: 'story', chain: 'career', text: 'הבוס אמר "אחר כך". לפחות שאלת.' }); } } },
  sideLater: { preview(st, e) { e.cash -= r100(sideExpected(st) * marginalRate(grossBase(st)) * 12 * 0.1); e.flow -= sideReportFee(st); e.months = 0; } }, // the +10% penalty at year end; the accountant's annual return is due either way (T3 review M3) — the tax itself too
  bigOrder: { preview(st, e, x) { e.cash -= r100(0.3 * x.S); e.flow += r100(0.55 * x.S); e.months = 1; e.note = e.note || 'החומרים עכשיו, התשלום בחודש הבא'; }, // T3 review M5: the real cash now (a loan warning when it needs one), the payment next month
    apply(st, x) { st.cash -= r100(0.3 * x.S); addIncome(st, 'תשלום על הזמנת העוגות', r100(0.55 * x.S), 1); const it = st.incomeExtra[st.incomeExtra.length - 1]; if (x.hit) { it.from = st.month + 2; it.until = st.month + 2; x.out.news.push({ kind: 'story', chain: 'side', text: 'הלקוח מאחר — התשלום יגיע רק בעוד חודשיים.' }); } else { it.from = st.month + 1; it.until = st.month + 1; x.out.news.push({ kind: 'story', chain: 'side', text: `הלקוח אישר: ${fmtM(r100(0.55 * x.S))} יגיעו בחודש הבא, בזמן.` }); } } },
  bigOrderAdvance: { preview(st, e, x) { e.oddsMoney = { p: 0.6, hit: r100(0.55 * x.S) - r100(0.3 * x.S), miss: 0 }; },
    apply(st, x) { if (!x.hit) { x.out.news.push({ kind: 'story', chain: 'side', text: 'בית הקפה לא הסכים למקדמה והזמין ממישהו אחר.' }); return; } x.out.news.push({ kind: 'story', chain: 'side', text: `בית הקפה הסכים: ${fmtM(r100(0.275 * x.S))} מקדמה עכשיו, והשאר בחודש הבא.` }); st.cash += r100(0.275 * x.S) - r100(0.3 * x.S); addIncome(st, 'יתרת התשלום על העוגות', r100(0.275 * x.S), 1); const it = st.incomeExtra[st.incomeExtra.length - 1]; it.from = st.month + 1; it.until = st.month + 1; } },
  sidePartTime: { preview(st, e) { e.salary = tempCutDelta(st, 0.6); e.salaryMonths = 5; e.flow += sideExpected(st); e.months = 5; },
    apply(st, x) { addPayCut(st, { src: 'partTime', mult: 0.6, until: st.month + 4, label: 'חצי משרה' }); x.c.data.partTime = true; x.c.data.gradAt = 12; st.life.sideBoost = st.month + 4; } },
  sideSmall: { apply(st, x) { x.c.data.small = true; } },
  sideGrad: { preview(st, e, x) { const t = x.o.bizType || 'coffee'; const G = BIZ.SIDE_GRAD[t]; const b = BIZ.create(t, { month: st.month, overrides: G.overrides, t3: true }); const f = BIZ.forecast(b, BIZ.suggest(b).decisions, 3); e.flow += Math.round(f.netProfit / 3); e.months = 0; e.energy -= BIZ.ARCHETYPES[t].ownerEnergy; },
    apply(st, x) { sideGraduate(st, x.o.bizType || 'coffee', x.out); } },
  friendLend: { preview(st, e, x) { const amt = r100(x.S); e.oddsMoney = { p: 0.4, hit: -Math.round(amt * 0.5), miss: amt }; },
    apply(st, x) { const d = x.c.data; d.amount = r100(x.S); d.ok = !x.hit; d.at = st.month + 6; d.name = storyVars(st, 'friend').name; } },
  friendGuarantee: { preview(st, e, x) { const risk = r100(1.5 * x.S); e.risk = { amount: risk, p: 0.35, label: 'ערבות' }; e.oddsMoney = { p: 0.35, hit: -risk, miss: 0 }; },
    apply(st, x) { const d = x.c.data; d.risk = r100(1.5 * x.S); d.amount = r100(x.S); d.called = !!x.hit; d.ok = true; d.at = st.month + 6; d.name = storyVars(st, 'friend').name; } },
  friendMore: { preview(st, e, x) { const c = chainOf(st, 'friend'); const ex = r100(0.5 * x.S); if (c && c.path === 'guarantee') { e.risk = { amount: ex, p: 0.35, label: 'עוד ערבות' }; e.oddsMoney = { p: 0.35, hit: -ex, miss: 0 }; } else { e.cash -= ex; e.oddsMoney = { p: 0.4, hit: 0, miss: ex }; } },
    apply(st, x) { const d = x.c.data; const ex = r100(0.5 * x.S); d.extra = ex; if (x.c.path === 'guarantee') d.risk += ex; else { st.cash -= ex; d.amount += ex; } } },
  friendPartner: { preview(st, e, x) { e.cash -= r100(0.5 * x.S); e.oddsMoney = { p: 0.6, hit: r10(0.06 * x.S) * 18, miss: 0 }; },
    apply(st, x) { const d = x.c.data; const ex = r100(0.5 * x.S); st.cash -= ex; d.amount += ex; d.partner = true; } },
  friendPlan: { preview(st, e, x) { e.flow += r10(0.05 * x.S); e.months = 12; }, apply(st, x) { addIncome(st, `החזר מ${x.c.data.name || 'חבר'}`, r10(0.05 * x.S), 12); } },
  friendCourt: { preview(st, e, x) { e.oddsMoney = { p: 0.5, hit: r100(0.5 * x.S), miss: 0 }; },
    apply(st, x) { if (x.hit) { addIncome(st, 'פיצוי מבית המשפט', r100(0.5 * x.S), 1); const it = st.incomeExtra[st.incomeExtra.length - 1]; it.from = st.month + 3; it.until = st.month + 3; x.out.news.push({ kind: 'story', chain: 'friend', text: 'זכית בתביעה: הכסף יגיע בעוד שלושה חודשים.' }); } else x.out.news.push({ kind: 'story', chain: 'friend', text: 'השופט דחה את התביעה.' }); } },
  friendPay: { preview(st, e) { const c = chainOf(st, 'friend'); e.cash -= c ? c.data.risk || 0 : 0; }, apply(st, x) { st.cash -= x.c.data.risk || 0; } },
  friendSpread: { preview(st, e) { const c = chainOf(st, 'friend'); const r = c ? c.data.risk || 0 : 0; e.flow -= Math.round(r * loanPct(st) / 100); e.months = 0; e.loan = r; },
    apply(st, x) { const r = x.c.data.risk || 0; st.loans += r; st.stats.loansTaken += r; st.stats.maxLoans = Math.max(st.stats.maxLoans, st.loans); } },
  crisisPause: { preview(st, e) { void st; void e; }, apply(st, x) { x.c.data.auto = st.life.autoInvest; st.life.autoInvest = 0; } },
  crisisSell: { preview(st, e) { const h = st.holdings.IDX; if (h && h.qty) { const pr = Math.round(h.qty * st.prices.IDX); e.cash += pr - Math.max(0, Math.round((pr - h.basis) * 0.25)); } },
    apply(st, x) { const h = st.holdings.IDX; if (!h || !h.qty) return; x.c.data.sellPrice = st.prices.IDX; idxSellAll(st, x.out); } },
  crisisMore: { preview(st, e) { void st; void e; }, apply(st) { st.life.autoInvest = r100(st.life.autoInvest * 1.5); } },
  crisisStart: { preview(st, e) { void st; void e; }, apply(st) { st.life.autoInvest = autoAmount(st); } }, // D9: the trade screen's suggested amount (index buys at payday)
  crisisRefuse: { preview(st, e) { e.oddsMoney = { p: 0.3, hit: -r10(baseNet(st) * 0.4) * 2, miss: 0 }; },
    apply(st, x) { if (x.hit) { st.life.jobless = { until: st.month + 1 }; st.story.jobChangeM = st.month; lesson(st, x.out, 'unemployment'); x.out.news.push({ kind: 'story', chain: 'crisis', text: 'סירבת — והחברה פיטרה אותך. חודשיים על דמי אבטלה.' }); } else x.out.news.push({ kind: 'story', chain: 'crisis', text: 'סירבת — והפעם זה עבר בשלום.' }); } },
  crisisLook: { preview(st, e) { e.oddsMoney = { p: 0.5, hit: salaryDelta(st, 1.05) * 22, miss: 0 }; },
    apply(st, x) { if (x.hit) { setGross(st, 1.05); st.story.jobChangeM = st.month; x.out.news.push({ kind: 'story', chain: 'crisis', text: 'מצאת מקום עבודה יציב יותר: +5% ברוטו.' }); } else x.out.news.push({ kind: 'story', chain: 'crisis', text: 'עוד לא מצאת. בינתיים נשארת.' }); } },
  bizCutPrice: { preview(st, e) { const a = managedOf(st)[0]; if (a) { const b = a.biz; const r = BIZ.applyDecisions(b, { price: Math.max(b.p.minPrice, Math.round(b.price * 0.95)) }); if (r.ok) e.bizDelta3 = BIZ.forecast(r.business, null, 3).netProfit - BIZ.forecast(b, null, 3).netProfit; e.flow += Math.round((e.bizDelta3 || 0) / 3); e.months = 3; } },
    apply(st) { const a = managedOf(st)[0]; if (!a) return; const r = BIZ.applyDecisions(a.biz, { price: Math.max(a.biz.p.minPrice, Math.round(a.biz.price * 0.95)) }); if (r.ok) a.biz = r.business; } },
  bizCutStaff: { preview(st, e) { const a = managedOf(st)[0]; if (a && a.biz.staff > 0) { const b = a.biz; const r = BIZ.applyDecisions(b, { fire: 1 }); if (r.ok) e.bizDelta3 = BIZ.forecast(r.business, null, 3).netProfit - BIZ.forecast(b, null, 3).netProfit; e.flow += Math.round((e.bizDelta3 || 0) / 3); e.months = 3; } },
    apply(st, x) { const a = managedOf(st)[0]; if (!a || !a.biz.staff) return; let r = BIZ.applyDecisions(a.biz, { fire: 1 }); if (r.ok && r.cashNeeded > 0) { const inj = r.cashNeeded; r = BIZ.applyDecisions(a.biz, { fire: 1, inject: inj }); st.cash -= inj; cashFx(x.out, -inj, `הזרמה לעסק ${fmtM(inj)}`); } if (r.ok) a.biz = r.business; } },
};
/** Cut every car line by k and retag it public transport → the monthly saving (₪, what the lines really dropped by). */
function applyCarCut(st, k) { let saved = 0; for (const l of carLines(st)) { const a0 = l.amount; l.amount = Math.max(0, l.amount - r10(l.amount * k)); saved += a0 - l.amount; l.label = 'תחבורה ציבורית'; l.tag = 'transport'; } return saved; }
/** Sell every index unit at today's price, with the real capital-gains tax (crisis c1 "sell"; part of the 'Q' action, no 'I' logged). */
function idxSellAll(st, out) {
  const h = st.holdings.IDX; const qty = h.qty; const price = st.prices.IDX;
  const avg = h.basis / qty; const proceeds = Math.round(qty * price); const cutB = Math.round(avg * qty); const gain = proceeds - cutB;
  const tax = gainTax(st, cutB, proceeds, h.cpi, out);
  st.cash += proceeds - tax; h.basis = 0; h.qty = 0; h.lowBuy = null; st.stats.tradeProfit += gain - tax;
  if (gain < 0) { st.life.idxSold++; st.life.idxSoldLoss += -gain; lesson(st, out, 'panic_selling'); }
  cashFx(out, proceeds - tax);
}
/** Side-hustle graduation (s4): a real business from SIDE_GRAD (the default is today's coffee cart). */
function sideGraduate(st, typeId, out) {
  const L = st.life; const G = BIZ.SIDE_GRAD[typeId] || BIZ.SIDE_GRAD.coffee;
  const a = addBusiness(st, BIZ.SIDE_GRAD[typeId] ? typeId : 'coffee', L.sideSeed, G.overrides);
  a.n = 'העסק הצדדי שלך'; a.cost = 0; a.down = 0; a.biz.invested = 0;
  out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, 'biz'), label: a.n, color: 'green' });
  out.news.push({ kind: 'sideBiz', text: mentorLine(st, 'sideBiz', { cf: 'רווח' }), assetId: 'a' + a.id });
  L.side.months = 0; L.side.level = 0; L.plan = 'work'; dropPayCut(st, 'partTime'); // M1: a running crisis cut stays
}

/* ---------------------------------------------------------------- applying a story option (L card or inbox item) */
function applyStoryFx(st, fx, x) {
  const L = st.life; const S = x.S; const out = x.out;
  if (fx.cash) { const v = r100(fx.cash * S); st.cash += v; cashFx(out, v); }
  if (fx.line) addLine(st, fx.line.label, r10(fx.line.amt * S), fx.line.months || 0, fx.line.tag);
  const h = housingOf(st);
  if (fx.rentAdd && h.kind === 'rent') h.line.amount = Math.max(0, h.line.amount + r10(fx.rentAdd * S));
  if (fx.rentPct && h.kind === 'rent') { const r0 = h.line.amount; h.line.amount = Math.max(0, h.line.amount + r10(h.line.amount * fx.rentPct / 100)); x.rentSaved = (x.rentSaved || 0) + r0 - h.line.amount; }
  if (fx.carCut) x.carSaved = (x.carSaved || 0) + applyCarCut(st, fx.carCut);
  if (fx.carLinePct) for (const l of carLines(st)) l.amount = Math.max(0, l.amount + r10(l.amount * fx.carLinePct / 100));
  if (fx.happiness) L.happiness = clamp(L.happiness + fx.happiness, 0, 100);
  if (fx.energy) L.energy = clamp(L.energy + fx.energy, 0, 100);
  if (fx.glow) addGlow(st, fx.glow);
  if (fx.grossMult) setGross(st, fx.grossMult);
  if (fx.grossTemp) addPayCut(st, { src: 'crisis', mult: fx.grossTemp.mult, until: st.month + fx.grossTemp.months - 1, label: 'קיצוץ זמני בשכר' });
  if (fx.workLoad) L.workLoad = Math.max(0, L.workLoad + fx.workLoad);
  if (fx.planLock) { st.story.flags.planLock = { prev: L.plan === fx.planLock.plan ? 'work' : L.plan, plan: fx.planLock.plan, until: st.month + fx.planLock.months - 1 }; applyPlan(st, fx.planLock.plan, out); }
  if (fx.jobless) { L.jobless = { until: st.month + fx.jobless - 1 }; st.story.jobChangeM = st.month; lesson(st, out, 'unemployment'); mark(st, 'jobless', 0, CUR_K, ''); }
  if (fx.sideReport && !L.sideReport) { L.sideReport = true; lesson(st, out, 'side_tax'); }
  if (fx.study && !L.study.done) { L.study.months = Math.min(L.study.need, L.study.months + fx.study); if (L.study.months >= L.study.need) studyDone(st, out); }
  if (fx.set) Object.assign(st.story.flags, fx.set);
}
/** Resolve option `o` of chain step `stepId` (from the L card: seal = the card's r; from the inbox: the item's a/b). */
function applyStoryOption(st, chainId, stepId, o, ctx, out) {
  const C = CH.CHAINS[chainId]; const c = chainOf(st, chainId); const S = storyS(st, chainId); const cash0 = st.cash;
  const seal = ctx.seal || { entry: 0.5, a: 0.5, b: 0.5 };
  const pHit = storyOddsP(st, o); const hit = pHit != null ? seal[o.odds.use] < pHit : false;
  const eff = storyEffects(st, chainId, stepId, o, ctx.item);
  const x = { chainId, stepId, o, c, item: ctx.item, hit, S, out };
  if (o.fx) applyStoryFx(st, o.fx, x);
  const n0 = out.news.length;
  const hook = o.hook && STORY_HOOKS[o.hook]; if (hook && hook.apply) hook.apply(st, x);
  if (pHit != null) for (const nw of out.news.slice(n0)) if (nw.kind === 'story') Object.assign(nw, { outcome: true, hit }); // playtest B4: the result of a chance choice is a news item the UI can show as a result card
  // review m8: the odds are decided now, so the luck links to this choice (CUR_K: the 'c' / 'Q' action); an expired default (payday,
  // no decision recorded) has no decision to link to → k −1 by design, never another decision's index
  if (eff.oddsMoney) { const real = hit ? eff.oddsMoney.hit : eff.oddsMoney.miss; addLuck(st, 'story', real - (eff.oddsMoney.p * eff.oddsMoney.hit + (1 - eff.oddsMoney.p) * eff.oddsMoney.miss), ctx.expired ? -1 : CUR_K); }
  if (o.path) c.path = o.path;
  const vars = storyVars(st, chainId, ctx.item);
  const v = Math.round(st.cash - cash0 + (eff.flow || 0) * Math.min(eff.months || 24, 24) + (eff.salary || 0) * Math.min(eff.salaryMonths || 24, 24));
  const t = o.memo ? gz(st, tpl(o.memo, vars)) : `${C.title}: ${o.label}`;
  const S0 = st.story; S0.memory.push({ m: st.month, chain: chainId, step: stepId, o: o.id, v, t }); if (S0.memory.length > 40) S0.memory.shift();
  if (Math.abs(v) >= Math.max(1, expensesOf(st))) mark(st, 'story', v, CUR_K, C.title); // T6 §4.2
  c.hist.push({ m: st.month, step: stepId, o: o.id, v }); if (c.hist.length > 8) c.hist.shift();
  for (const id of o.lesson || []) lesson(st, out, id);
  st.life.events.push({ m: st.month, id: 'story:' + chainId, o: (stepId + ':' + o.id).slice(0, 24) });
  if (chainId === 'career' && stepId === 'promo' && o.id === 'accept') { c.data.net0 = baseNet(st) - (eff.salary || 0); c.data.promo6 = st.month + 6; }
  if (chainId === 'crisis' && stepId === 'c1') { c.data.choice = o.id; }
  if (chainId === 'friend' && stepId === 'f1') { c.data.path = o.id; c.data.k = CUR_K; } // T6 §4.3: the friend luck links to this decision
  scheduleNext(st, chainId, stepId, o, hit, out);
  out.mentor = o.after || (eff.note ? `${o.label}: ${eff.note}` : out.mentor);
  if (st.cash < 0) ensureCash(st, out, 'story');
  return { hit, eff };
}
/** The month before the next yearly price update (12, 24, …), at least 3 months away. */
function renewalMonth(st) { let m = Math.ceil((st.month + 3) / 12) * 12; if (m < st.month + 3) m += 12; return m; }
function scheduleNext(st, chainId, stepId, o, hit, out) {
  const c = chainOf(st, chainId); const nx = (o.next || []).find((n) => !n.if || (n.if === 'win') === hit) || { end: true, in: 0 };
  c.stage = 'wait'; c.item = null;
  if (nx.end) { if (!nx.in) { endChain(st, chainId, out, nx.news); return; } c.nextStep = '__end'; c.nextAt = st.month + nx.in; c.data.endNews = nx.news || null; return; }
  if (nx.resolve) { c.nextStep = 'resolve'; c.nextAt = Math.max(st.month + 1, c.data.at || st.month + 3); return; }
  c.nextStep = nx.step;
  if (nx.at === 'renewal') c.nextAt = renewalMonth(st);
  else if (nx.at === 'leaseEnd') { const end = c.data.leaseEnd || st.month + 24; if (end > st.maxMonths) { c.nextStep = '__end'; c.nextAt = end; } else c.nextAt = end; }
  else if (nx.at === 'recovery') c.nextAt = st.month + 1;
  else c.nextAt = st.month + (nx.in || 1);
}

/* ---------------------------------------------------------------- the inbox: creation, pacing, expiry */
const openItems = (st) => st.story.inbox.length;
function canCreateChainItem(st) { const S = st.story; return S.chainItemsM !== st.month && st.month - S.lastChainItemM >= 2 && openItems(st) < 3; }
function createChainItem(st, chainId, step, out) {
  const S = st.story; const c = chainOf(st, chainId);
  const item = { id: S.nextId++, kind: 'chain', chain: chainId, step, createdM: st.month, due: st.month + 2, seal: { a: S.r[0], b: S.r[1] }, data: {} };
  S.inbox.push(item); c.stage = 'item'; c.step = step; c.item = item.id; c.nextAt = null; c.nextStep = null; c.steps.push(step);
  c.seal.a = S.r[0]; c.seal.b = S.r[1];
  S.lastChainItemM = st.month; S.chainItemsM = st.month;
  (out.story ||= { created: [], expired: [] }).created.push(item.id);
  out.news.push({ kind: 'storyItem', itemId: item.id, chain: chainId, text: gz(st, tpl(CH.CHAINS[chainId].steps[step].title, storyVars(st, chainId, item))) });
  return item;
}
/** Step-level eligibility (§12.17 "no illogical repeats"): skips steps whose premise is gone. */
function stepEligible(st, chainId, step) {
  if (chainId === 'crisis' && step === 'job') return !isJobless(st) && grossBase(st) > 0;
  if (chainId === 'crisis' && step === 'bizCut') return managedOf(st).length > 0;
  if (chainId === 'car' && step === 's2bus') return !!st.story.flags.noCar;
  if (chainId === 'car' && (step === 's2lease' || step === 's3leaseEnd')) return !!leaseLine(st, chainOf(st, 'car'));
  if (chainId === 'move' && step === 'm2renew') return housingOf(st).kind === 'rent';
  return true;
}
function skipStep(st, chainId, step, out) { // follow the default's `next` without applying it
  const o = CH.CHAINS[chainId].steps[step].options.find((x) => x.default) || CH.CHAINS[chainId].steps[step].options[0];
  scheduleNext(st, chainId, step, o, false, out);
}
/** Items whose time is up get their default option (no decision recorded). Business items first: before the next simulated month. */
function storyExpire(st, out) {
  const S = st.story; const due = S.inbox.filter((i) => i.due <= st.month + 1);
  for (const it of due) {
    const ev = describeItem(st, it); const def = ev && (ev.options.find((o) => o.default) || ev.options[0]);
    S.inbox = S.inbox.filter((x) => x !== it);
    if (!def) continue;
    const label = def.label;
    if (it.kind === 'biz') resolveBizItem(st, it, def.id, out, true);
    else { const o = stepOptions(st, it.chain, it.step).find((x) => x.id === def.id); applyStoryOption(st, it.chain, it.step, o, { seal: it.seal, item: it, expired: true }, out); }
    st.stats.storyDefaults++; S.defaults++;
    (out.story ||= { created: [], expired: [] }).expired.push(it.id);
    out.news.push({ kind: 'story', itemId: it.id, text: gz(st, tpl(CH.NEWS.noDecision, { label })) });
  }
}
/** storyMonth (inside payday, after the month's simulation): scheduled steps, triggers, chain endings. */
function storyMonth(st, out, o) {
  const S = st.story; const L = st.life;
  // bookkeeping for triggers (public state only)
  S.energyLow = L.energy < 35 ? S.energyLow + 1 : 0; S.energyHigh = L.energy > 60 ? S.energyHigh + 1 : 0;
  S.offSide = L.plan === 'side' ? 0 : S.offSide + 1;
  if (L.workLoad > 0) { if (S.loadSince == null) S.loadSince = st.month; } else S.loadSince = null;
  const F = S.flags;
  if (F.payCut) { const all = Array.isArray(F.payCut) ? F.payCut : [F.payCut]; const live = all.filter((c) => c.until >= st.month); if (live.length < all.length) { F.payCut = live.length ? (Array.isArray(F.payCut) ? live : live[0]) : null; out.news.push({ kind: 'story', text: live.length ? 'קיצוץ אחד בשכר נגמר.' : 'הקיצוץ בשכר נגמר — המשכורת חוזרת למלואה.' }); } }
  if (F.planLock && F.planLock.until < st.month) { const pl = F.planLock; F.planLock = null; if (L.plan === pl.plan && PLANS[pl.prev]) { applyPlan(st, pl.prev, out); out.news.push({ kind: 'story', text: `המנוחה נגמרה. חוזרים ל"${PLANS[pl.prev].label}".` }); } }
  st.incomeExtra = st.incomeExtra.filter((x) => !x.until || x.until >= st.month);
  // career: promo news at +6 after accept; warn ends early on 2 good paydays or a burnout
  const car = chainOf(st, 'career');
  if (car && car.data.promo6 === st.month) out.news.push({ kind: 'story', chain: 'career', text: gz(st, tpl(CH.NEWS.promo6, storyVars(st, 'career'))) });
  if (o.burnout && car && car.stage === 'item' && car.step === 'warn') { S.inbox = S.inbox.filter((i) => i.id !== car.item); endChain(st, 'career', out, 'burnout'); }
  else if (car && car.stage === 'item' && car.step === 'warn' && S.energyHigh >= 2) { S.inbox = S.inbox.filter((i) => i.id !== car.item); endChain(st, 'career', out); }
  // side: 3 paydays off the plan closes it
  const sd = chainOf(st, 'side');
  if (sd && chainOpen(sd) && S.offSide >= 3) { if (sd.stage === 'item') S.inbox = S.inbox.filter((i) => i.id !== sd.item); sd.stage = 'idle'; out.news.push({ kind: 'story', chain: 'side', text: CH.NEWS.sideAsleep }); }
  // 1. scheduled steps
  for (const id of CH.CHAIN_IDS) {
    const c = S.chains[id]; if (!c || c.stage !== 'wait' || c.nextAt == null || c.nextAt > st.month) continue;
    if (c.nextStep === '__end') { endChain(st, id, out, c.data.endNews); continue; }
    if (c.nextStep === 'resolve') { friendResolve(st, out); continue; }
    if (c.nextStep === 'recovery') {
      const lb = econLabel(st); const ok = lb === 'התאוששות' || lb === 'צמיחה' || st.prices.IDX >= 0.95 * (c.data.peakAtStart || st.prices.IDX) || st.month - c.startM >= 12;
      if (!ok) { c.nextAt = st.month + 1; continue; }
    }
    if (!stepEligible(st, id, c.nextStep)) { skipStep(st, id, c.nextStep, out); continue; }
    if (canCreateChainItem(st)) createChainItem(st, id, c.nextStep, out); else c.nextAt = st.month + 1;
  }
  // crisis tracking (units bought by the standing order while the crisis is open; public prices)
  const cr = chainOf(st, 'crisis');
  if (cr && chainOpen(cr)) { const auto = L.autoInvest || cr.data.auto || 0; if (auto > 0 && st.prices.IDX > 0) { const q = Math.floor(auto / st.prices.IDX); cr.data.unitsDuring = (cr.data.unitsDuring || 0) + q; cr.data.spentDuring = (cr.data.spentDuring || 0) + Math.round(q * st.prices.IDX); } if (st.month - cr.startM >= 18 && cr.stage === 'wait') endChain(st, 'crisis', out); }
  // 2. triggers (at most one item)
  if (canCreateChainItem(st)) storyTriggers(st, out, o);
  S.crisesSeen = st.stats.crises; S.lastEcon = econLabel(st);
}
function storyTriggers(st, out, o) {
  const S = st.story; const L = st.life; const W0 = st.worldId;
  // crisis (w1–w4, not history): recession signal, a crisis tile, or a monthly index drop ≤ −8%
  if (!st.history && chainWorldOk(st, CH.CHAINS.crisis) && chainCanStart(st, 'crisis')) {
    // [TUNE] a crisis tile starts the chain at this payday's sealed story odds: every tile and every −8% month starting it put it in ~97% of games
    const TG = CH.TRIGGER; const lb = econLabel(st); const trig = (lb === 'מיתון' && S.lastEcon !== 'מיתון' && S.lastEcon != null && S.r[0] < TG.crisisSignal) || (st.stats.crises > S.crisesSeen && S.r[0] < TG.crisisTile) || (S.idxDropM === st.month && st.prices.IDX <= 0.85 * (L.idxPeak || st.prices.IDX) && S.r[0] < TG.crisisIndex); // [TUNE] tile 30%; a monthly drop counts once the index is ≥ 15% under its peak // (a crisis tile also marks lastCrash: only the market's own monthly drop counts here)
    if (trig) { const c = startChain(st, 'crisis', 'wait'); c.data.trig = lb === 'מיתון' && S.lastEcon !== 'מיתון' ? 'signal' : S.idxDropM === st.month ? 'index' : 'tile'; c.data.idxAtStart = st.prices.IDX; c.data.peakAtStart = L.idxPeak || st.prices.IDX; createChainItem(st, 'crisis', 'c1', out); return; }
  }
  // career: warn / degree / promo (not jobless, not in a burnout month, not in short history games)
  const longEnough = !st.history || st.maxMonths >= 24;
  if (longEnough && !isJobless(st) && !o.burnout && chainCanStart(st, 'career')) {
    const c0 = chainOf(st, 'career'); const sub = (c0 && c0.data.sub) || {};
    const dm = st.month - (L.study.doneMonth ?? st.month);
    const TG = CH.TRIGGER;
    const pick = !sub.warn && S.energyLow >= 3 && S.r[1] < TG.careerWarn ? 'warn' : !sub.degree && L.study.done && dm >= 1 && dm <= 2 && S.r[1] < TG.careerDegree ? 'degree' // [TUNE] warn: 3 low paydays; degree: within 2 months of graduating, at sealed odds (CH.TRIGGER)
      : !sub.promo && S.r[1] < TG.careerPromo && ((st.month >= TG.promoFrom && st.month % 12 === 6 && L.planMonths.work + L.planMonths.overtime >= 14 && st.month - L.lastRaise >= 12) || (S.loadSince != null && st.month - S.loadSince === 6)) ? 'promo' : null; // [TUNE] promo is reviewed once a year (month 18, 30, …) at sealed 50% odds
    if (pick) { const c = startChain(st, 'career', 'wait'); c.data.sub = { ...sub, [pick]: st.month }; createChainItem(st, 'career', pick, out); return; }
  }
  // side hustle milestones: side months 1 / 5 / 10 / graduation (15, or 12 after part time); reopens at the next unreached one
  if (L.plan === 'side' && !isJobless(st)) {
    let c = chainOf(st, 'side'); const d = (c && c.data) || {}; const reached = d.reached || {};
    const gradAt = d.gradAt || LIFE_CFG.sideBizAt; const m = L.side.months;
    const next1 = !reached.s1 && m >= 1 ? 's1' : !reached.s2 && m >= 5 ? 's2' : !reached.s3 && m >= 10 ? 's3' : !reached.s4 && !d.small && m >= gradAt ? 's4' : null;
    if (next1 && (!c || !chainOpen(c)) && openChains(st) < 2) {
      if (!c) { c = startChain(st, 'side', 'wait'); c.data = { reached: {}, first: sideExpected(st) }; }
      c.data.reached = { ...(c.data.reached || {}), [next1]: st.month }; c.run = 1; createChainItem(st, 'side', next1, out);
    }
  }
}
/** Friend chain: the loan / guarantee resolves 6 months after the entry (news, or an f3a / f3b item). */
function friendResolve(st, out) {
  const c = chainOf(st, 'friend'); const d = c.data; const path = c.path || d.path;
  const vars = storyVars(st, 'friend');
  if (path === 'lend') {
    addLuck(st, 'friend', d.ok ? d.amount * 0.4 : -d.amount * 0.6, d.k ?? -1);
    if (d.partner) {
      if (d.ok) { const cf = r10(0.06 * storyS(st, 'friend')); const a = addAsset(st, { k: 'stake', n: `20% מהעסק של ${d.name || vars.name}`, cost: d.amount, down: d.amount, cf, value: r100(1.2 * d.amount) }, {}); out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, 'stake') || modelFor(st, 'biz'), label: a.n, color: 'green' }); d.cf = cf; endChain(st, 'friend', out, 'partnerOk', { ...vars, cf: fmtM(cf) }); }
      else endChain(st, 'friend', out, 'partnerBad');
      return;
    }
    if (d.ok) { st.cash += d.amount; cashFx(out, d.amount, '+' + fmtM(d.amount)); endChain(st, 'friend', out, 'lendOk', vars); return; }
    if (canCreateChainItem(st)) createChainItem(st, 'friend', 'f3a', out); else c.nextAt = st.month + 1;
    return;
  }
  if (path === 'guarantee') {
    addLuck(st, 'friend', !d.called ? (d.risk || 0) * 0.35 : -(d.risk || 0) * 0.65, d.k ?? -1);
    if (!d.called) { endChain(st, 'friend', out, 'guaranteeOk', vars); return; }
    if (canCreateChainItem(st)) createChainItem(st, 'friend', 'f3b', out); else c.nextAt = st.month + 1;
    return;
  }
  endChain(st, 'friend', out);
}

/* ---------------------------------------------------------------- describing story steps (L card + inbox) — never a seal */
function cushionLine(st) { const E = Math.max(1, expensesOf(st)); const m = Math.round((st.cash + (st.savings || 0)) / E * 10) / 10; return { months: m, text: `יש לך ${m.toFixed(1)} חודשי כרית` }; }
function optionWhen(st, chainId, w) {
  const L = st.life; const c = chainOf(st, chainId) || { data: {} };
  switch (w) {
    case 'single': return L.family.partner === 'none' && L.family.kids === 0 ? null : 'רק למי שגר לבד';
    case 'lent': return (c.path || c.data.path) === 'lend' ? null : 'רק אם הלווית לו כסף';
    case 'auto': return L.autoInvest > 0 ? null : 'אין לך הוראת קבע';
    case 'idx': return st.holdings.IDX && st.holdings.IDX.qty > 0 ? null : 'אין לך יחידות בקרן המדד';
    case 'more': return L.autoInvest > 0 && (st.cash + (st.savings || 0)) / Math.max(1, expensesOf(st)) >= 3 ? null : 'רק עם הוראת קבע וכרית של 3 חודשים לפחות';
    case 'start': return L.autoInvest > 0 ? 'כבר יש לך הוראת קבע' : autoAmount(st) > 0 && (st.cash + (st.savings || 0)) / Math.max(1, expensesOf(st)) >= 3 ? null : 'רק עם תזרים פנוי וכרית של 3 חודשים לפחות';
    case 'staff': { const a = managedOf(st)[0]; return a && a.biz.staff > 0 ? null : 'אין עובדים בעסק'; }
    default: return null;
  }
}
/** Expand s4's `grad` option into one option per SIDE_GRAD type of this world. */
function stepOptions(st, chainId, stepId) {
  const step = CH.CHAINS[chainId].steps[stepId];
  if (chainId === 'side' && stepId === 's4') {
    const out = [];
    for (const t of Object.keys(BIZ.SIDE_GRAD)) { const G = BIZ.SIDE_GRAD[t]; if (G.worlds !== 'all' && !G.worlds.includes(st.worldId)) continue; const A = BIZ.ARCHETYPES[t]; out.push({ ...step.options[0], id: 'grad:' + t, bizType: t, label: A.short, default: t === 'coffee' }); }
    return out.concat(step.options.slice(1));
  }
  return step.options;
}
function storyOptionsOut(st, chainId, stepId, item, guideStep) {
  const ctx = pubCtx(st); const E = Math.max(1, expensesOf(st));
  return stepOptions(st, chainId, stepId).map((o) => {
    const why = o.when ? optionWhen(st, chainId, o.when) : null;
    const e = storyEffects(st, chainId, stepId, o, item);
    const total12 = storyMoney(e, 12, ctx), total24 = storyMoney(e, 24, ctx);
    const pHit = storyOddsP(st, o);
    const L = loanFor(st, Math.max(0, -(e.cash || 0)));
    const effects = { cash: e.cash, flow: e.flow, months: e.months, salary: e.salary, salaryMonths: e.salaryMonths, happiness: e.happiness + (e.glow || 0), energy: e.energy, glow: e.glow, study: e.study,
      risk: e.risk, total12, total24, note: e.note, monthly: e.flow ? -e.flow : 0, oddsMoney: e.oddsMoney || null };
    const odds = o.odds ? { p: pHit, text: gz(st, tpl(o.odds.text, storyVars(st, chainId, item))) } : null;
    return { id: o.id, label: gz(st, tpl(o.label, storyVars(st, chainId, item))), enabled: !why, reason: why || undefined, primary: false, dq: o.dq || 'mixed', kind: 'story', default: !!o.default, guide: !!o.guide && !!guideStep,
      effects, odds, loanAmount: L.need, loanMonthly: L.monthly,
      impact: { now: e.cash, monthly: e.flow, months: e.months, horizon: 24, total: total24, risk: e.risk ? { p: e.risk.p, amount: e.risk.amount, label: e.risk.label } : odds ? { p: pHit, amount: null, label: odds.text } : null, wellbeing: { energy: e.energy, happiness: e.happiness } },
      ...(e.bizDelta3 != null ? { preview: { delta3: e.bizDelta3, cash3: e.bizDelta3 } } : {}), _E: E };
  }).map((x) => { delete x._E; return x; });
}
const remainingSteps = { car: { s1: 2, s2fix: 1, s2lease: 2, s3leaseEnd: 1, s2bus: 1, carBack: 1 }, move: { m1: 2, m2renew: 1, m3commute: 2, homeRepair: 2, h2: 1 }, career: { warn: 1, promo: 1, degree: 1 }, side: { s1: 4, s2: 3, s3: 2, s4: 1 }, friend: { f1: 3, f2: 2, f3a: 1, f3b: 1 }, crisis: { c1: 4, job: 3, bizCut: 2, recovery: 1 } };
/** The story card of a chain step (inbox item, or the L card when `item` is null). */
function storyCard(st, chainId, stepId, item) {
  const C = CH.CHAINS[chainId]; const step = C.steps[stepId]; const c = chainOf(st, chainId) || { steps: [] };
  const vars = storyVars(st, chainId, item);
  const crossBits = [];
  if (chainId === 'car' && st.story.flags.area === 'periphery') crossBits.push(CH.CROSS.periphery);
  if (chainId === 'career' && stepId === 'promo' && (chainOf(st, 'crisis') || { hist: [] }).hist.some((h) => h.step === 'job' && h.o === 'accept')) crossBits.push(CH.CROSS.cut);
  const lastForced = st.life.forcedM; if (lastForced != null && st.month - lastForced <= 3) crossBits.push(tpl(CH.CROSS.forced, { n: String(Math.max(1, st.month - lastForced)) }));
  const rem = [step.remember ? tpl(step.remember, vars) : '', ...crossBits].filter(Boolean)[0] || null;
  const guideStep = st.mentor === 'guide';
  let options = storyOptionsOut(st, chainId, stepId, item, guideStep);
  // T3 verify D9: crisis c1 with nothing to decide (no fund units, no standing order, no room to start one) is an informational card
  const info = chainId === 'crisis' && stepId === 'c1' && options.filter((o) => o.enabled).length < 2;
  if (info) options = options.filter((o) => o.enabled).map((o) => ({ ...o, label: 'הבנתי — ממשיכים כרגיל', dq: 'none' }));   // nothing to score
  const n = (c.steps || []).length || 1; const of = n - 1 + ((remainingSteps[chainId] || {})[stepId] || 1);
  const personal = options.every((o) => o.dq === 'personal');
  const ev = { id: item ? 'q' + item.id : null, itemId: item ? item.id : null, type: 'story', kind: 'chain', chain: chainId, step: stepId,
    tag: C.title, color: CHAIN_COLORS[chainId] || STORY_TAG, ink: '#ffffff', title: gz(st, tpl(step.title, vars)), text: gz(st, tpl(step.text, vars)),
    remember: rem ? gz(st, rem) : null, hint: step.hint ? gz(st, tpl(step.hint, vars)) : null, mentor: personal ? 'החלטה אישית — אין כאן תשובה נכונה אחת' : (mentorLine(st, 'lifeAsk', {}) || ''),
    personal, progress: of > 1 ? { n, of } : null, options,
    data: { cushion: cushionLine(st), due: item ? item.due : null, dueText: item ? (item.due <= st.month + 1 ? 'עד המשכורת הבאה' : 'עד שתי משכורות מעכשיו') : null, defaultId: (options.find((o) => o.default) || {}).id || null, chain: { id: chainId, step: stepId, progress: of > 1 ? { n, of } : null } } };
  storyPrimary(st, ev);
  return ev;
}
/** guide only: financial steps → the evaluator's top option; car / transport steps → the director's cheap pick (option.guide); personal / mixed → none. */
function storyPrimary(st, ev) {
  for (const o of ev.options) o.primary = false;
  if (st.mentor !== 'guide') { for (const o of ev.options) delete o.guide; return; }
  const g = ev.options.find((o) => o.guide && o.enabled);
  let pick = g ? guideCheapPick(ev.options, g.id, { money: st.cash + (st.savings || 0), E: Math.max(1, expensesOf(st)) }) : null;
  if (!pick && ev.options.some((o) => o.dq === 'financial')) { const sc = storyScores(st, ev); const best = sc.slice().sort((a, b) => b.U - a.U)[0]; pick = best ? ev.options.find((o) => o.id === best.id) : null; }
  if (pick) pick.primary = true;
  for (const o of ev.options) delete o.guide;
}
/** A business decision item → the same story card shape (kind 'biz'). */
function bizCard(st, item) {
  const a = st.assets.find((x) => 'a' + x.id === item.assetId); if (!a || !a.biz || !a.biz.decide || a.biz.decide.key !== item.key) return null;
  const ch = BIZ.eventChoices(a.biz, { cal: BIZ.calPlus(calOf(st), 0) }); if (!ch) return null;
  const E = Math.max(1, expensesOf(st));
  const options = ch.choices.map((c) => {
    const money6 = c.preview.delta3 * 2 - (c.risk ? Math.round(c.risk.p * c.risk.amount) : 0);
    return { id: c.id, label: c.label, enabled: c.enabled, reason: c.reason, primary: false, dq: 'financial', kind: 'story', default: c.default,
      effects: { cash: 0, flow: Math.round(c.preview.delta3 / 3) || 0, months: 3, salary: 0, salaryMonths: 0, happiness: 0, energy: 0, glow: 0, study: 0, risk: c.risk, total12: money6, total24: money6, note: c.note, monthly: -Math.round(c.preview.delta3 / 3) || 0 },
      odds: c.odds, preview: c.preview, loanAmount: 0, loanMonthly: 0, sale: c.sale || false,
      impact: { now: 0, monthly: Math.round(c.preview.delta3 / 3), months: 3, horizon: 6, total: money6, risk: c.risk ? { p: c.risk.p, amount: c.risk.amount, label: c.risk.label } : null, wellbeing: { energy: 0, happiness: 0 } } };
  });
  void E;
  const s = BIZ.summary(a.biz, a.bizRep || null);
  const ev = { id: 'q' + item.id, itemId: item.id, type: 'story', kind: 'biz', assetId: item.assetId, tag: `העסק שלך · ${a.n}`, color: CHAIN_COLORS.biz, ink: '#ffffff', title: ch.title, text: ch.text,
    remember: null, hint: null, mentor: mentorLine(st, 'bizAsk', {}) || '', personal: false, progress: null, options,
    data: { cushion: cushionLine(st), due: item.due, dueText: 'עד המשכורת הבאה', defaultId: (options.find((o) => o.default) || {}).id || null, biz: { l1: s.l1, l2: s.l2 || null, stage: s.stage, signature: s.signature, lessons: ch.lessons, data: ch.data } } };
  storyPrimary(st, ev);
  return ev;
}
function describeItem(st, item) { return item.kind === 'biz' ? bizCard(st, item) : storyCard(st, item.chain, item.step, item); }
/** The story inbox as cards (fresh numbers). Never contains a seal. */
export function inbox(st) {
  if (!st.story) return [];
  return st.story.inbox.map((it) => describeItem(st, it)).filter(Boolean);
}

/* ---------------------------------------------------------------- the evaluator for story decisions (§9) */
const STORY_PRINC = { car: ['opportunity_cost', 'cushion'], move: ['cashflow'], career: ['time'], side: ['fees_tax', 'cashflow'], friend: ['risk_size', 'cushion'], crisis: ['time_in_market', 'cushion'], biz: ['cashflow', 'risk_size'] };
/** U per option (months of expenses) + flags, by decision class. Public context only (odds, never seals). */
function storyScores(st, ev) {
  const ctx = pubCtx(st); const E = ctx.E;
  return ev.options.filter((o) => o.enabled && o.dq !== 'none').map((o) => {
    const e = o.effects || {}; const flags = [];
    const after = (ctx.cash + ctx.savings + (e.cash || 0) + (o.loanAmount || 0)) / E;
    if (after < 1 && (e.cash || 0) < 0) flags.push('noCushion');
    if (e.risk && e.risk.amount > ctx.cash + ctx.savings) flags.push('exposure');
    if (ev.chain === 'career' && ev.step === 'warn' && o.id === 'pushOn' && Math.max(burnoutOdds(st).next, burnoutOdds(st).after) >= 0.25) flags.push('burnout'); // the same numbers the card shows (M4)
    if (ev.chain === 'crisis' && ev.step === 'c1' && o.id === 'sell' && ctx.idxPrice < 0.92 * (ctx.idxPeak || ctx.idxPrice)) flags.push('panicSell');
    const money = ev.kind === 'biz' ? (e.total24 || 0) : (e.total24 ?? 0);
    let U;
    if (o.dq === 'mixed') U = money / E + (e.happiness || 0) * 0.05 + energyValue(ctx.energy, e.energy || 0);
    else U = money / E + happinessValue(ctx.happyBase ?? ctx.happiness, e.happiness || 0) + energyValue(ctx.energy, e.energy || 0);
    U -= flags.reduce((a, f) => a + (DQ_PEN[f] || 3), 0);
    return { id: o.id, U, flags, dq: o.dq };
  });
}
/** Sim / T6 rivals: the evaluator's view of a story card (public context only): [{id, U, flags, dq}]. */
export function scoreStory(st, card) { return card ? storyScores(st, card) : []; }
function storyDecision(st, ev, o) {
  if (!o || o.dq === 'none') return null;
  const sc = storyScores(st, ev); const mine = sc.find((x) => x.id === o.id); if (!mine) return null;
  const best = sc.reduce((a, b) => (b.U > a.U ? b : a), mine); const worst = sc.reduce((a, b) => (b.U < a.U ? b : a), mine);
  let s;
  if (o.dq === 'personal') s = mine.flags.length ? 50 : 100;
  else {
    const band = o.dq === 'mixed' ? 1 : 0.5;
    s = best.U - mine.U <= band || best.U - worst.U < band ? 100 : Math.round(100 * clamp((mine.U - worst.U) / (best.U - worst.U), 0, 1));
    if (o.dq === 'mixed' && !mine.flags.length) s = Math.max(60, s);
  }
  const cushion = (st.cash + (st.savings || 0)) / Math.max(1, expensesOf(st));
  if (ev.chain === 'crisis' && ev.step === 'c1') { if (o.id === 'pause' && cushion < 2) s = Math.max(60, s); if ((o.id === 'keep' || o.id === 'more' || o.id === 'start') && cushion >= 2 && !mine.flags.length) s = Math.max(85, s); }
  const verdict = mine.flags.length ? 'risky' : s >= 85 ? 'strong' : s >= 60 ? 'ok' : s < 40 ? 'costly' : 'mixed';
  const bestOpt = ev.options.find((x) => x.id === best.id) || {};
  const why = mine.flags.length ? DQ_WHY[mine.flags[0]] || 'סיכון גבוה' : o.dq === 'personal' ? 'החלטה אישית — אין כאן תשובה נכונה אחת' : best.U - worst.U < 0.5 ? DQ_WHY.near : s >= 85 ? DQ_WHY.best : `היה עדיף: ${bestOpt.label || ''}`.slice(0, 60);
  const pr = [...(STORY_PRINC[ev.kind === 'biz' ? 'biz' : ev.chain] || [])]; if (mine.flags.includes('noCushion')) pr.push('cushion');
  return { t: st.turn, m: st.month, k: (st.actions || []).length, l: String(o.label || o.id).slice(0, 24), type: 'story', c: String(ev.title).slice(0, 24), o: o.id, s, v: verdict, f: mine.flags, p: [...new Set(pr)], why, gap: round2(best.U - mine.U), b: String(bestOpt.label || best.id).slice(0, 24) };
}

/* ---------------------------------------------------------------- resolveStory ('Q') */
function resolveBizItem(st, item, choiceId, out, isDefault = false) {
  const a = st.assets.find((x) => 'a' + x.id === item.assetId);
  if (!a || !a.biz || !a.biz.decide || a.biz.decide.key !== item.key) return { ok: false, error: 'stale' };
  let r = BIZ.resolveEvent(a.biz, item.key, choiceId);
  if (!r.ok) return { ok: false, error: r.errors[0] };
  if (r.cashNeeded > 0) { const inj = r.cashNeeded; const r2 = BIZ.applyDecisions(r.business, { inject: inj }); if (r2.ok) { r = { ...r, business: r2.business }; st.cash -= inj; cashFx(out, -inj, `הזרמה לעסק ${fmtM(inj)}`); } }
  a.biz = r.business;
  for (const id of r.lessons || []) lesson(st, out, id);
  if (r.sale) {
    const { sale } = BIZ.sell(a.biz, { price: r.sale.price });
    st.cash += sale.net; st.taxes.capGains += sale.tax; st.stats.sold++; st.stats.soldProfit += sale.net - a.biz.invested;
    bizArchive(st, a); mark(st, 'sell', sale.net, CUR_K, a.n);
    st.assets = st.assets.filter((x) => x !== a); delete st.bizRng['a' + a.id]; delete st.bizStory['a' + a.id];
    st.story.inbox = st.story.inbox.filter((i) => i.assetId !== 'a' + a.id);
    out.despawn.push('a' + a.id); cashFx(out, sale.net, '+' + fmtM(sale.net)); lesson(st, out, 'biz_valuation');
  }
  // T3 verify D2: a decision's result carries the business name and the outcome on their own fields (decision: true) — not the
  // monthly shape (headline / why), so the UI never renders "🏪 undefined:" and the outcome text reaches the player
  if (!isDefault || r.text) out.news.push({ kind: 'business', decision: true, ...(isDefault ? { expired: true } : {}), assetId: item.assetId, name: a.n, text: r.text || 'ההחלטה נכנסה לתוקף.' });
  if (st.cash < 0) ensureCash(st, out, 'business');
  return { ok: true };
}
/**
 * Resolve a story-inbox item (any time the game is not over, also with a tile card open). Logged as ['Q', itemId, optionId].
 * → {ok, error?, effects, mentor, toast, news, lessons, decision, spawn, despawn, event (the pending tile card or null), inbox, end?}
 */
export function resolveStory(st, itemId, optionId) { return withK(st, () => resolveStoryImpl(st, itemId, optionId)); }
function resolveStoryImpl(st, itemId, optionId) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const S = st.story;
  const item = S && S.inbox.find((i) => i.id === +itemId);
  if (!item) return { ...out, ok: false, error: 'stale', event: currentEvent(st) };
  const ev = describeItem(st, item); const o = ev && ev.options.find((x) => x.id === optionId);
  if (!ev || !o) return { ...out, ok: false, error: ev ? 'unknown' : 'stale', event: currentEvent(st) };
  if (!o.enabled) return { ...out, ok: false, error: o.reason || 'האפשרות לא זמינה כרגע', event: currentEvent(st), story: ev };
  const dq = storyDecision(st, ev, o);
  if (item.kind === 'biz') { const r = resolveBizItem(st, item, optionId, out); if (!r.ok) return { ...out, ok: false, error: r.error, event: currentEvent(st) }; S.inbox = S.inbox.filter((x) => x !== item); }
  else {
    S.inbox = S.inbox.filter((x) => x !== item);
    const def = stepOptions(st, item.chain, item.step).find((x) => x.id === optionId);
    applyStoryOption(st, item.chain, item.step, def, { seal: item.seal, item }, out);
  }
  if (dq) recordDecision(st, dq, out);
  out.mentor = gz(st, out.mentor);
  act(st, ['Q', item.id, optionId]);
  logDecision(st, ev.title, o.label, (o.effects && o.effects.total24) || 0);
  return { ...out, event: currentEvent(st), inbox: inbox(st), end: endIfIdle(st, out) };
}

/* ---------------------------------------------------------------- business glue: decisions → inbox items */
function bizStoryItems(st, out, reports) {
  const S = st.story; let made = 0;
  for (const { a, r } of reports) {
    if (!a.biz.decide || !(r.decide || []).length) continue;
    const key = 'a' + a.id;
    const ok = made === 0 && S.bizItemsM !== st.month + 1 && st.month - (S.lastBizItemM[key] ?? -99) >= (st.worldId === 'w1' ? 3 : 2) && openItems(st) < 3; // T3 review M8: w1 ≤ 4 business items a year
    if (!ok) { const id = a.biz.decide.id; const res = BIZ.resolveEvent(a.biz, a.biz.decide.key, BIZ.defaultChoice(id, a.biz)); if (res.ok) a.biz = res.business; out.news.push({ kind: 'business', decision: true, expired: true, assetId: key, name: a.n, text: `${res.text || 'ההחלטה נכנסה לתוקף.'} (ברירת מחדל — לא היה זמן להחליט)` }); continue; }
    const item = { id: S.nextId++, kind: 'biz', assetId: key, key: a.biz.decide.key, ev: a.biz.decide.id, createdM: st.month + 1, due: st.month + 2, seal: { a: 0.5, b: 0.5 }, data: {} };
    S.inbox.push(item); S.lastBizItemM[key] = st.month; S.bizItemsM = st.month + 1; made++;
    (out.story ||= { created: [], expired: [] }).created.push(item.id);
    r.decideItem = item.id;
  }
}

/* ============================================================ T2: monthly focus, hints, mentor level, public view */
const MEDIAN_DOWN = new Map();
/** Median down payment of a world's deal deck (public static data) — "can you afford a typical deal?". */
function medianDown(worldId) {
  if (MEDIAN_DOWN.has(worldId)) return MEDIAN_DOWN.get(worldId);
  const xs = (getWorld(worldId).deals || []).filter((c) => c.down != null && !c.tk && !c.crypto).map((c) => c.down).sort((a, b) => a - b);
  const v = xs.length ? xs[Math.floor(xs.length / 2)] : 0; MEDIAN_DOWN.set(worldId, v); return v;
}
const loanRoomOf = (st) => { const cap = loanCap(st); return Number.isFinite(cap) ? Math.max(0, cap - st.loans) : 0; };
const frugalTarget = (st) => { const subs = st.subs.slice().sort((a, b) => b.amount - a.amount); if (subs.length) return { sub: subs[0] }; const xs = st.expenses.filter(FC.frugalEligible).sort((a, b) => b.amount - a.amount); return xs.length ? { line: xs[0] } : null; };
/** Why a focus cannot be activated now (null = it can). */
function focusDisabled(st, id) {
  const L = st.life; const F = FC.FOCUS[id];
  if (!F) return 'אין מוקד כזה';
  if (id === 'none') return null;
  if (id === 'research' && (st.history || !st.econ)) return FC.FOCUS_REASON.history;
  if (L.energy < Math.max(F.minEnergy, focusCost(st, id).energy)) return FC.FOCUS_REASON.tired; // (= minEnergy in rules ≤ 4)
  if (id === 'debt' && !st.loans && !st.credit) return FC.FOCUS_REASON.noDebt;
  if (id === 'ops') { const bs = managedOf(st); if (!bs.length) return FC.FOCUS_REASON.noBiz; if (!bs.some((a) => BIZ.canDecide(a.biz))) return FC.FOCUS_REASON.bizRecent; }
  if (id === 'frugal' && !frugalTarget(st)) return FC.FOCUS_REASON.noCut;
  return null;
}
/** Deal / mystery tiles within 2..12 steps (public board geometry). */
function dealTilesAhead(st) { const w = W(st); let n = 0; for (let k = 2; k <= 12; k++) { const t = w.tiles[w.board[(st.pos + k) % w.board.length]].type; if (t === 'deal' || t === 'mystery') n++; } return n; }
/** A focus's price on activation (FOCUS table; rules 5: the frugal audit costs more 🔋 — E1 C1). */
function focusCost(st, id) { const F = FC.FOCUS[id]; return id === 'frugal' && R5(st) ? FC.focusCfg(st.worldId).frugalCost5 : F.cost; }
/** Pay for a focus and apply its immediate part (§6.2). */
function activateFocus(st, id, out, o = {}) {
  const L = st.life; const F = FC.FOCUS[id]; const C = FC.focusCfg(st.worldId);
  const fc = focusCost(st, id); L.energy = clamp(L.energy - fc.energy, 0, 100); L.happiness = clamp(L.happiness - fc.happiness, 0, 100);
  L.focus = { id, m: st.month, opsOpen: false, opsUsed: false };
  L.focusMonths[id] = (L.focusMonths[id] || 0) + 1;
  if (id === 'debt') {
    const fee = FC.debtFee(st.worldId, st.loans, st.credit); st.cash -= fee; cashFx(out, -fee, `עמלת איחוד חובות ${fmtM(fee)}`);
    const room = Number.isFinite(loanCap(st)) ? Math.max(0, loanCap(st) - st.loans) : st.credit;
    const move = Math.min(st.credit, room);
    if (move > 0) { st.credit -= move; st.loans += move; st.stats.maxLoans = Math.max(st.stats.maxLoans, st.loans); }
    L.debtDeal = { until: st.month + C.debtMonths - 1, adj: C.debtAdj };
    if (!L.debtBonus) { L.debtBonus = true; creditScore(st, C.debtCredit); }
    out.news.push({ kind: 'focus', text: `סידרת את החובות: ${move > 0 ? `${fmtM(move)} מחוב האשראי עברו להלוואה, ` : ''}הריבית על ההלוואה יורדת ב־${Math.abs(C.debtAdj)}% בחודש עד חודש ${L.debtDeal.until}.` });
    ensureCash(st, out, 'focus');
  } else if (id === 'frugal') {
    L.frugalCuts = Math.min(C.frugalMaxCuts, (L.frugalCuts || 0) + 1);
    const t = frugalTarget(st);
    if (t && t.sub) { st.subs = st.subs.filter((x) => x !== t.sub); out.news.push({ kind: 'focus', text: `ביטלת את המנוי "${t.sub.label}": ${fmtM(t.sub.amount)} פחות בחודש — לתמיד.` }); }
    else if (t && t.line) { const cut = r10(t.line.amount * (R5(st) ? C.frugalCut5 : C.frugalCut)); t.line.amount -= cut; t.line.audited = true; out.news.push({ kind: 'focus', text: `קיצצת את "${t.line.label}" ב־${fmtM(cut)} בחודש — לתמיד.` }); }
    lesson(st, out, 'lifestyle_creep');
  } else if (id === 'research') {
    if (st.econ) st.econ.sharpUntil = st.month + C.researchMonths - 1;
  } else if (id === 'ops') {
    if (o.fromAgenda || st.pending || st.phase !== 'roll') L.focus.opsOpen = true; else { openOps(st); L.focus.opsUsed = true; }
  }
}
/** ops focus: the business panel opens now, as a pending card with NO draw (the pawn does not move; closing returns to 'roll'). */
function openOps(st) {
  const a = managedOf(st).filter((x) => BIZ.canDecide(x.biz)).sort((x, y) => (x.biz.lastDecisionMonth ?? -1) - (y.biz.lastDecisionMonth ?? -1))[0] || managedOf(st)[0];
  st.pending = { type: 'business', mode: 'manage', assetId: a.id, source: 'focus', id: st.nextEventId++, tile: 'K', pos: st.pos, month: st.month, k0: (st.actions || []).length };
  st.phase = 'event';
}
/** guide only: the focus the mentor would pick (§6.4). */
function focusSuggest(st) {
  const L = st.life; const ok = (id) => !focusDisabled(st, id);
  if (L.energy < 45) return 'none';
  if (st.credit > 0 && ok('debt')) return 'debt';
  if (managedOf(st).some((a) => BIZ.canDecide(a.biz)) && ok('ops')) return 'ops';
  if (st.subs.length && ok('frugal')) return 'frugal';
  if (L.energy >= 60 && dealTilesAhead(st) >= 3 && st.cash + loanRoomOf(st) >= medianDown(st.worldId) && ok('scout')) return 'scout'; // tuning: only with 🔋 to spare and deals in reach
  if (st.econ && st.econ.lc != null && st.month - st.econ.lc <= 2 && ok('research')) return 'research';
  return 'none';
}
/** The focus picker payload (metrics().focus, payday/edu ev.data.focus). null in rules-3 games. */
function focusBlock(st) {
  if (!R4(st) || !st.life || !st.life.focus) return null;
  const L = st.life; const sug = st.mentor === 'guide' ? focusSuggest(st) : null;
  const options = FC.FOCUS_IDS.map((id) => {
    const F = FC.FOCUS[id]; const why = focusDisabled(st, id);
    const fc = focusCost(st, id);
    const o = { id, icon: F.icon, label: F.label, desc: F.desc, cost: { energy: fc.energy, happiness: fc.happiness, cash: id === 'debt' && (st.loans || st.credit) ? FC.debtFee(st.worldId, st.loans, st.credit) : 0 },
      benefit: F.benefit, notBest: F.notBest, enabled: !why, reason: why || undefined };
    if (sug === id) o.suggested = true;
    return o;
  });
  return { current: { id: L.focus.id, label: FC.FOCUS[L.focus.id].label, m: L.focus.m }, locked: L.focus.id !== 'none' || !!L.focus.locked,
    opsOpen: !!(L.focus.opsOpen && !L.focus.opsUsed), agenda: [1, 2].map((slot) => ({ slot, id: L.agenda[slot - 1] || null, label: L.agenda[slot - 1] ? FC.FOCUS[L.agenda[slot - 1]].label : null })),
    options, text: mentorLine(st, 'focusAsk', {}) };
}
/** §10.7 focus scoring: flags only (future cards make precise values fake precision). */
function focusDecision(st, id, energyAfter) {
  const L = st.life; const flags = [];
  if (energyAfter < 25) flags.push('burnout');
  let noUse = false;
  if (id === 'scout') noUse = st.cash + loanRoomOf(st) < medianDown(st.worldId);
  if (id === 'debt') noUse = st.loans + st.credit < 20 * FC.debtFee(st.worldId, st.loans, st.credit);
  if (id === 'network') noUse = !raiseEligible(st) && dealTilesAhead(st) < 2;
  if (id === 'research') noUse = st.maxMonths - st.month < 6;
  if (noUse) flags.push('noUse');
  const s = flags.length ? 60 : 100;
  const rec = { t: st.turn, m: st.month, k: Math.max(0, (st.actions || []).length - 1), type: 'focus', c: 'מוקד החודש', o: id, s, v: flags.length ? 'mixed' : 'strong', f: flags, p: ['time'], why: flags.length ? DQ_WHY[flags[0]] : DQ_WHY.best, gap: flags.length ? 1 : 0, b: FC.FOCUS[id].label };
  return rec;
}
/**
 * Choose the monthly focus. slot 0 = activate for the current month (between rolls, or on the payday / education card),
 * paid now from 🔋 (and ₪ for debt); one per month — `none` locks the month. slot 1/2 = the agenda for the next paydays (free).
 * Logged as ['F', id, slot] whenever it changes state. Rules 4 only.
 */
export function setFocus(st, id, slot = 0) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const fail = (error) => ({ ...out, ok: false, error, event: currentEvent(st), focus: focusBlock(st), end: null });
  if (!R4(st) || !st.life || !st.life.focus) return fail('המוקד החודשי לא זמין במשחק הזה');
  if (!FC.FOCUS[id]) return fail('אין מוקד כזה');
  const L = st.life; slot = Number(slot) || 0;
  if (slot === 1 || slot === 2) {
    const v = id === 'none' ? null : id;
    if (L.agenda[slot - 1] !== v) { act(st, ['F', id, slot]); L.agenda[slot - 1] = v; }
    return { ...out, event: currentEvent(st), focus: focusBlock(st), end: null };
  }
  if (slot !== 0) return fail('אין מוקד כזה');
  if (id === 'ops' && L.focus.id === 'ops' && L.focus.opsOpen && !L.focus.opsUsed) { // an ops focus from the agenda: open the panel once, between rolls
    if (st.pending || st.phase !== 'roll') return fail('אפשר לפתוח את לוח העסק בין התורות');
    if (focusDisabled(st, 'ops')) return fail(focusDisabled(st, 'ops'));
    act(st, ['F', id, 0]); openOps(st); L.focus.opsUsed = true;
    return { ...out, event: currentEvent(st), focus: focusBlock(st), end: null };
  }
  if (L.focus.id !== 'none' || L.focus.locked) return fail(FC.FOCUS_REASON.locked);
  const when = (st.phase === 'roll' && !st.pending) || (st.pending && (st.pending.type === 'payday' || st.pending.type === 'edu'));
  if (!when) return fail('אפשר לבחור מוקד בין התורות או בכרטיס המשכורת');
  const why = focusDisabled(st, id); if (why) return fail(why);
  act(st, ['F', id, 0]);
  if (id === 'none') { L.focus = { id: 'none', m: st.month, opsOpen: false, opsUsed: false, locked: true }; L.focusMonths.none++; }
  else {
    const rec = focusDecision(st, id, L.energy - focusCost(st, id).energy);
    activateFocus(st, id, out, {});
    recordDecision(st, rec, out); if (out.decision) out.decision.type = 'focus';
  }
  out.mentor = gz(st, out.mentor);
  return { ...out, event: currentEvent(st), focus: focusBlock(st), end: endIfIdle(st, out) };
}

/** The hint for the current event: the scorer's top option + its top-2 reasons (null option on personal / values cards). */
function hintFor(st, ev) {
  const sc = scoreOptions(st, ev); if (!sc.length) return null;
  const tradeoff = ev.type === 'life' && (ev.data.personal || ev.data.values);
  const top = sc.slice().sort((a, b) => b.U - a.U || (NON_CLOSING.test(a.id) ? 1 : 0) - (NON_CLOSING.test(b.id) ? 1 : 0))[0];
  const pickId = tradeoff ? null : primaryFromScores(ev, sc, st);
  const pick = tradeoff ? null : sc.find((x) => x.id === pickId) || top;
  let reasons;
  if (pick) reasons = pick.reasons.slice().sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 2).map((r) => r.text);
  else reasons = sc.map((x) => { const o = ev.options.find((y) => y.id === x.id); const r = x.reasons.slice().sort((a, b) => Math.abs(b.w) - Math.abs(a.w))[0]; return `${o.label}: ${r ? r.text : 'בלי השפעה כספית גדולה'}`; }).slice(0, 3);
  if ((ev.type === 'payday') && (st.savings || 0) / Math.max(1, expensesOf(st)) < 3) reasons.push(`שווה לבדוק גם: קרן החירום (${round2((st.savings || 0) / Math.max(1, expensesOf(st))).toFixed(1)}/3 חודשים)`);
  const o = pick && ev.options.find((y) => y.id === pick.id);
  return { optionId: o ? o.id : null, label: o ? gz(st, o.label) : null, reasons: reasons.map((t) => gz(st, t)), note: 'רמז לפי מה שידוע עכשיו — לא הבטחה.' };
}
/** §5.4 ask the mentor (guide/hint levels; counted once per event, logged as ['H']). */
export function requestHint(st) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const p = st.pending;
  const fail = (error) => ({ ...out, ok: false, error, event: currentEvent(st), hintsUsed: (st.dq && st.dq.hints) || 0, end: null });
  if ((st.mentor || 'guide') === 'pro') return fail('ברמת מומחה אין רמזים — הניתוח המלא מחכה בסוף');
  if (!p) return fail('אין כרגע החלטה פתוחה');
  const ev = describe(st);
  if (ev.auto || ev.type === 'trade' || (ev.type === 'mystery' && ev.data.kind === 'quiz') || !scorePool(ev, null)) return fail('אין כאן רמז — זו לא החלטה עם תשובה');
  const hint = hintFor(st, ev); if (!hint) return fail('אין כאן רמז — זו לא החלטה עם תשובה');
  const hk = `${p.dd ? p.dd.level : '-'}|${p.negotiated ? JSON.stringify(p.negotiated) : ''}${p.rv && p.rv.steps ? '|' + p.rv.steps : ''}`; // review m1: after an inspection / offer the hint is new — count it
  if (p.hinted !== hk) { act(st, ['H']); p.hinted = hk; dqOf(st).hints = (dqOf(st).hints || 0) + 1; }
  return { ...out, event: ev, hint, hintsUsed: dqOf(st).hints, end: null };
}
/** §5.5 change the mentor level mid-game (free and history only; presentation only, no money effect). Logged as ['M', level]. */
export function setMentorLevel(st, level) {
  if (st.over) throw new Error('game over');
  const out = newOut(); const fail = (error) => ({ ...out, ok: false, error, event: currentEvent(st), end: null });
  if (!MN.LEVELS.includes(level)) return fail('אין רמה כזו');
  if (!(st.mode === 'free' || st.mode === 'history')) return fail('בדירוג כולם משחקים באותה רמה');
  if (st.tutorial && !st.flags.tutorialDone) return fail('אפשר לשנות רמה אחרי העסקה הראשונה');
  if (st.mentor === level) return fail('זו כבר הרמה שלך');
  act(st, ['M', level]);
  dqOf(st).levelChanges.push({ m: st.month, from: st.mentor, to: level });
  st.mentor = level;
  return { ...out, event: currentEvent(st), mentor: MN.LEVEL_TEXT[level].label, end: null };
}
/** metrics().mentor */
function mentorBlock(st) {
  const lv = st.mentor || 'guide'; const p = st.pending;
  // cheap (metrics() is hot): by card type; requestHint() itself is authoritative and refuses unscored cards
  const canHint = lv !== 'pro' && !!p && !st.over && !['trade', 'crisis', 'giving', 'shipping'].includes(p.type) && !(p.type === 'market' && !(p.card && p.card.k === 'sell'))
    && p.type !== 'mystery' && !(p.type === 'life' && p.eventId === 'reserve') && !(p.type === 'tax' && (st.life.sideReport || !(st.life.plan === 'side' || st.life.side.total > 0)));
  return { level: lv, label: MN.LEVEL_TEXT[lv].label, hintsUsed: (st.dq && st.dq.hints) || 0, canHint };
}
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
/**
 * §12.2 everything a player (or a T6 rival / a sim policy) may see — nothing sealed. Deep-frozen unless freeze:false.
 */
export function publicView(st, { freeze = true, event } = {}) {
  const m = metrics(st); const L = m.life;
  const life = { ...L, inflationLastYear: L.inflationLastYear }; delete life.inflationYear;
  const pv = { v: st.v, worldId: st.worldId, charId: st.charId, mode: st.mode, mentor: st.mentor, rules: st.rules || 3, month: st.month, maxMonths: st.maxMonths, turn: st.turn, phase: st.phase,
    metrics: { ...m, life }, event: event && st.pending && event.id === st.pending.id ? event : currentEvent(st), econ: CY.econPublic(st.econ, st.month, st.worldId), focus: m.focus, hintsUsed: (st.dq && st.dq.hints) || 0,
    inbox: inbox(st) };
  return freeze ? deepFreeze(JSON.parse(JSON.stringify(pv))) : pv;
}

/* ============================================================ T2 §9: impact panel data (computed on demand, never in describe) */
const IMPACT_DISCLAIMER = 'זה תרחיש לפי מה שידוע עכשיו — לא תחזית ולא הבטחה.';
/** A throwaway copy of the state for dry runs: no history, and every sealed value replaced by its public expectation. */
function shadowOf(st, o = {}) {
  const { actions, log, dq, ...rest } = st;
  const sh = JSON.parse(JSON.stringify(rest));
  sh.actions = []; sh.log = []; sh.dq = JSON.parse(JSON.stringify({ ...dq, decisions: [] }));
  const p = sh.pending;
  if (p) {
    if (p.dd && p.type === 'deal' && R4(sh) && !p.dd.starter && p.dd.level < 2) { const B = ddBasis(st, st.pending); p.dd.base = B.base; p.dd.val = B.value; p.dd.repair = B.rep; p.dd.f = 1; p.dd.vf = 1; p.dd.jitter = 0.5; p.dd.risk = 0; }
    if (p.negR != null) p.negR = o.negR ?? 0.5;
    if (p.raiseR != null) p.raiseR = o.raiseR ?? 0.5;
    if (Array.isArray(p.wr)) p.wr = p.wr.map(() => 0.5); // worlds wave 0: a module tile's sealed landing draws never reach a dry run
    if (p.r != null) p.r = o.r ?? 0.5;
    if (p.hidden) p.hidden = { mult: 1, revealIn: 99, signalIn: 99, signalMult: 1 };
    if (p.rv) { p.rv.close = o.rvClose || 0; p.rv.taker = o.rvClose ? (p.rv.who[0] || 'other') : null; } // T6: sealed close / taker never reach a dry run
  }
  if (sh.rivalDeals) sh.rivalDeals = sh.rivalDeals.map((d) => (d.revealed ? d : { ...d, truth: { cf: d.claimedCf, value: d.claimedValue, repair: 0 } }));
  if (sh.life) { sh.life.raiseR = 0.5; sh.life.sideSeed = 1; }
  if (sh.world && sh.world.coin) sh.world.coin.path = sh.world.coin.path.map(() => 1);
  return sh;
}
/** Apply a ref to a shadow. → the action's result (ok:false when the ref does not apply now). */
function applyRef(sh, ref, params = {}) {
  if (ref === 'act:loan') return takeLoan(sh, params.amount);
  if (ref === 'act:repay') return repayLoan(sh, params.amount);
  if (ref === 'act:payCredit') return payCredit(sh);
  if (ref.startsWith('act:save:')) return moveSavings(sh, +ref.slice(9));
  if (ref.startsWith('focus:')) { sh.pending = null; sh.phase = 'roll'; if (sh.life && sh.life.focus) sh.life.focus = { id: 'none', m: sh.month, opsOpen: false, opsUsed: false }; return setFocus(sh, ref.slice(6), 0); }
  if (!sh.pending) return { ok: false };
  try { return choose(sh, null, ref, { qty: Math.max(1, Math.floor(params.qty || 1)) }); } catch (e) { return { ok: false }; }
}
const monthsOf = (cash, savings, E) => round2((cash + savings) / Math.max(1, E));
function forcedLoanOf(st, cash, savings) { const u = autoUnit(st); const x = cash + savings; return x < 0 ? Math.ceil(-x / u) * u : 0; }
/**
 * E.impactFor(st, ref, params?) → Impact | null. ref = an option id of the pending event | 'act:loan' | 'act:repay' |
 * 'act:payCredit' | 'act:save:<₪>' | 'focus:<id>'. Runs the REAL engine on a sealed shadow and compares metrics before/after,
 * so the UI does no finance math. Pure (st is never touched).
 */
export function impactFor(st, ref, params = {}) {
  if (!st || st.over || typeof ref !== 'string') return null;
  const mb = metrics(st); const Lb = st.life;
  const ev = st.pending ? (params.event && params.event.id === st.pending.id ? params.event : currentEvent(st)) : null; const o = ev ? ev.options.find((x) => x.id === ref) : null;
  if (!ref.startsWith('act:') && !ref.startsWith('focus:') && (!o || !o.enabled)) return null;
  const isOffer = /^offer:/.test(ref); const isRaise = ref === 'raise'; const isChance = !!(o && o.kind === 'life' && o.chance);
  const run = (seal) => { const sh = shadowOf(st, seal); const r = applyRef(sh, ref, params); return r && r.ok !== false ? { sh, r } : null; };
  const main = run(isOffer || isRaise || isChance ? { negR: 0, raiseR: 0, r: 0 } : {});
  if (!main) return null;
  const sh = main.sh; const ma = metrics(sh); const La = sh.life;
  const ddB = o && o.kind === 'buy' && ev.type === 'deal' && st.pending.dd && R4(st) && !st.pending.dd.starter ? ddBasis(st, st.pending) : null;
  const bizStart = ref === 'start' && ev && ev.type === 'business';
  let cfAfter = ma.cashflow; let perMonth;
  if (bizStart) { const A = BIZ.ARCHETYPES[st.pending.typeId]; cfAfter += Math.round(BIZ.forecast(BIZ.create(st.pending.typeId, { month: st.month }), BIZ.suggest(BIZ.create(st.pending.typeId, { month: st.month })).decisions, 3).netProfit / 3); perMonth = -A.ownerEnergy; }
  if (o && o.kind === 'plan' && o.effects) perMonth = o.effects.energy;
  if (La.workLoad > Lb.workLoad) perMonth = -(La.workLoad - Lb.workLoad) * 4;
  const E1 = Math.max(1, ma.expenses);
  const newLiabilities = [];
  if (sh.loans > st.loans) newLiabilities.push({ label: 'הלוואה בנקאית', amount: sh.loans - st.loans, monthly: Math.round((sh.loans - st.loans) * loanPct(sh) / 100) });
  if (sh.credit > st.credit) newLiabilities.push({ label: 'חוב כרטיס אשראי', amount: sh.credit - st.credit, monthly: Math.round((sh.credit - st.credit) * W(sh).creditPct / 100) });
  for (const a of sh.assets) if (!st.assets.some((x) => x.id === a.id) && a.debt > 0) newLiabilities.push({ label: `${(W(sh).kinds[a.k] || {}).debtLabel || 'משכנתא'} · ${a.n}`, amount: a.debt, monthly: 0 });
  for (const x of sh.expenses) if (!st.expenses.some((y) => y.id === x.id)) newLiabilities.push({ label: x.label + (x.until ? ` (עד חודש ${x.until})` : ''), amount: x.until ? x.amount * (x.until - Math.max(x.from || sh.month, sh.month) + 1) : x.amount * 12, monthly: x.amount });
  const imp = {
    ref, label: o ? gz(st, o.label) : ref, basis: 'certain',
    cashBefore: mb.cash, cashAfter: ma.cash, fundBefore: mb.savings, fundAfter: ma.savings,
    cushionMonthsBefore: monthsOf(mb.cash, mb.savings, mb.expenses), cushionMonthsAfter: monthsOf(ma.cash, ma.savings, E1), fundMonthsAfter: round2(ma.savings / E1),
    cfBefore: mb.cashflow, cfAfter, cfDelta: cfAfter - mb.cashflow, passiveDelta: ma.passive - mb.passive, expensesDelta: ma.expenses - mb.expenses,
    netWorthDelta: ma.netWorth - mb.netWorth, goalProgressDelta: round2(ma.goalProgress - mb.goalProgress), newLiabilities,
    power: { before: Math.round(Lb.energy), after: Math.round(La.energy), delta: Math.round(La.energy - Lb.energy), ...(perMonth != null ? { perMonth } : {}) },
    happiness: { before: Math.round(happyNow(st)), after: Math.round(happyNow(sh)), delta: Math.round(happyNow(sh) - happyNow(st)) },
    time: {}, mainRisk: null, assumptions: [], scenarios: null, branches: null, disclaimer: IMPACT_DISCLAIMER,
  };
  if (La.study.months !== Lb.study.months || La.study.done !== Lb.study.done) imp.time = { studyMonths: La.study.done && !Lb.study.done ? Lb.study.need - Lb.study.months : La.study.months - Lb.study.months, note: 'מקרב את סוף הלימודים' };
  // assumptions (§9.5)
  if (ddB) imp.assumptions.push(ddB.level === 0 ? 'התזרים לפי מה שהמוכר הצהיר (לא נבדק)' : ddB.level === 1 ? 'לפי טווח הבדיקה' : 'לפי בדיקה מקצועית');
  if (sh.loans > st.loans || st.loans > 0) imp.assumptions.push(`הריבית על ההלוואה נשארת ${round2(loanPct(sh))}% בחודש`);
  imp.assumptions.push('המשכורת והתוכנית החודשית לא משתנות', 'בלי שינוי במצב הכלכלה');
  if (bizStart) imp.assumptions.push('תחזית העסק בלי אירועים מיוחדים');
  // branches (offers, raise, a counter-offer): p sums to 1
  if (isOffer || isRaise || isChance) {
    const ch = isOffer ? o.chance : isRaise ? o.chance : o.chance;
    const alt = run({ negR: 0.9999, raiseR: 0.9999, r: 0.9999 });
    const mAlt = alt ? metrics(alt.sh) : ma;
    const labels = isOffer ? ['המוכר מסכים — אפשר לקנות בזול', 'המוכר מסרב — העסקה מתבטלת'] : isRaise ? ['הבוס מסכים', 'הבוס מסרב (ותחכה חצי שנה)'] : ['הבוס מסכים', 'הבוס מסרב'];
    imp.branches = [{ p: round2(ch), label: labels[0], cashAfter: ma.cash, cfAfter: ma.cashflow, netWorthDelta: ma.netWorth - mb.netWorth },
      { p: round2(1 - round2(ch)), label: labels[1], cashAfter: mAlt.cash, cfAfter: mAlt.cashflow, netWorthDelta: mAlt.netWorth - mb.netWorth }];
    if (isOffer && sh.pending) { const ev2 = describe(sh); const b = ev2.options.filter((x) => x.kind === 'buy' && x.enabled).sort((x, y) => y.net - x.net)[0]; if (b) imp.branches[0].buyNet = b.net; }
    imp.basis = 'branches';
  } else if (ddB && ddB.level < 2) imp.basis = 'expected';
  else if (bizStart) imp.basis = 'expected';
  // T6 §3.6: a delay step on a card others want — the rival branch (paid for the step, no deal); p sums to 1
  const rvP = st.pending && st.pending.rv; const delay = o && (o.kind === 'inspect' || o.kind === 'offer');
  if (delay && rvP && rvP.n >= 1 && R4(st)) {
    const h = RV.round2(RV.hazard(st.worldId, rvP.n, rvP.steps + 1));
    const lostRun = run({ rvClose: rvP.steps + 1, negR: 0, raiseR: 0, r: 0 }); const mL = lostRun ? metrics(lostRun.sh) : ma;
    const lostB = { p: h, label: RV.TEXT.branchLost, cashAfter: mL.cash, cfAfter: mL.cashflow, netWorthDelta: mL.netWorth - mb.netWorth, lost: true };
    if (isOffer && imp.branches) { const [acc, ref] = imp.branches; const pa = RV.round2((1 - h) * acc.p); imp.branches = [{ ...lostB }, { ...acc, p: pa }, { ...ref, p: RV.round2(1 - h - pa) }]; }
    else imp.branches = [{ p: RV.round2(1 - h), label: RV.TEXT.branchOpen, cashAfter: ma.cash, cfAfter: ma.cashflow, netWorthDelta: ma.netWorth - mb.netWorth }, lostB];
    imp.basis = 'branches';
  }
  // scenarios (deals, business start, loans, refinancing, installments): base and hard, 6 months, no draws
  const wantScen = (o && (o.kind === 'buy' && ev.type === 'deal')) || bizStart || ref === 'act:loan' || ref === 'refi' || ref === 'inst3';
  if (wantScen) {
    const base = { months: 6, cash: ma.cash + 6 * cfAfter, cf: cfAfter };
    base.cushionMonths = monthsOf(base.cash, ma.savings, E1); base.forcedLoan = forcedLoanOf(st, base.cash, ma.savings);
    const hs = JSON.parse(JSON.stringify(sh)); hs.rules = 4; hs.econ = { phase: 'rec', amp: Math.max(1, CY.cycleCfg(st.worldId).amp), hard: true, sharpUntil: 0, hist: [], truth: [] };
    const what = ['חודש אחד בלי משכורת'];
    if (ddB && ddB.level < 2) {
      const a = hs.assets.find((x) => !st.assets.some((y) => y.id === x.id));
      if (a) { const c = st.pending.card; const noi = c.noi != null; const base0 = noi ? c.noi : c.cf; const lo = ddB.level === 0 ? DD.trueBase(base0, DD.p10Factor(st.worldId, ddB.warn, noi)) : ddB.lo; if (noi) a.noi = Math.min(a.noi, lo); else a.cf = Math.min(a.cf, lo); }
      what.push('הנכס מכניס פחות ממה שהוצהר');
    }
    what.push('מיתון: שכר דירה −3%, עסקים −10%, ריבית +0.3%');
    let cfHard = metrics(hs).cashflow; if (bizStart) cfHard += Math.round((cfAfter - ma.cashflow) * 0.8);
    cfHard = Math.min(cfHard, cfAfter);
    const hard = { months: 6, cash: ma.cash + 6 * cfHard - ma.salary, cf: cfHard, what };
    hard.cushionMonths = monthsOf(hard.cash, ma.savings, E1); hard.forcedLoan = forcedLoanOf(st, hard.cash, ma.savings);
    imp.scenarios = { base, hard };
  }
  // the main risk (§9.4) — the same checks as the evaluator
  const sc = ev ? (scoreOptions(st, ev).find((x) => x.id === ref) || null) : null;
  const debtPay = ma.expenseLines.filter((l) => l.id === 'loan' || l.id === 'credit').reduce((a, l) => a + l.amount, 0);
  const income = ma.salary + ma.sideIncome + Math.max(0, ma.passive);
  const cushFlag = imp.cushionMonthsAfter < 1 && !(imp.cfDelta >= 0.15 * E1 && imp.cushionMonthsAfter >= 0.5);
  if (cushFlag) imp.mainRisk = { key: 'noCushion', text: `אחרי זה תישאר כרית של ${Math.max(0, imp.cushionMonthsAfter).toFixed(1)} חודשים. הוצאה לא צפויה אחת — והבנק יחליט בשבילך.` };
  else if (ddB && ddB.level === 0 && ddB.warn >= 1) imp.mainRisk = { key: 'unverified', text: `המספרים לא נבדקו, ויש ${warnSigns(ddB.warn)}.` };
  else if (income > 0 && debtPay > 0.4 * income) imp.mainRisk = { key: 'dsr', text: 'החזרי החובות יעברו 40% מההכנסה.' };
  else if (ref === 'buyVar') { const d = ev.data.debt || 0; imp.mainRisk = { key: 'rate', text: `ריבית משתנה: אם הריבית תעלה ב־1%, התזרים יורד ב־${fmtM(r10(d / 1200))}.` }; }
  else if (W(st).mechanic === 'fx' && o && o.kind === 'buy' && ev.data.sens) imp.mainRisk = { key: 'fx', text: `דולר +10% → תזרים ${sgn((ma.worldIndicators.exposure || {}).cf || 0)}.` };
  else if (sc && sc.flags.some((f) => ['concentrated', 'gamble', 'burnout'].includes(f))) { const f = sc.flags.find((x) => ['concentrated', 'gamble', 'burnout'].includes(x)); imp.mainRisk = { key: f, text: DQ_WHY[f] + '.' }; }
  else imp.mainRisk = { key: 'none', text: 'אין סיכון בולט מעבר לרגיל.' };
  imp.mainRisk.text = gz(st, imp.mainRisk.text);
  return imp;
}

/* ============================================================ T4 engine part: intro card, goal chain, dreams, lesson context, practice */
const INTRO_TEXT = {
  tag1: 'חודש 1 · יום המשכורת', title1: 'המשכורת נכנסה 🎉', next: 'ממשיכים ←', skip: 'דלג על ההדרכה',
  mentor1: '{who}, ככה נראה חודש: כסף נכנס, כסף יוצא. מה שנשאר — איתו בונים חופש.',
  tag2: 'תקלה', title2: 'מכונת הכביסה התקלקלה', text2: 'הטכנאי אומר: {cost} לתיקון. איך משלמים?', note2: 'אין כאן תשובה נכונה אחת. כל דרך עולה משהו אחר.',
  mentor2: 'תקלות קורות לכולם. השאלה היא מה הן לוקחות ממך: מזומן, תזרים או זמן.',
  pay: 'לשלם עכשיו {cost}', inst: '3 תשלומים של {inst}', diy: 'לתקן עם חבר לפי סרטון ({diy})',
  tag3: 'מה השתנה', title3: 'ככה זה השפיע', next3: '🎯 המטרה הבאה', go: 'להטיל קובייה ראשונה 🎲',
  goalCushion: 'לשים בצד חודש הוצאות ({E}). ככה התקלה הבאה לא תיקח לך הלוואה.', goalAsset: 'לקנות נכס ראשון שמכניס כסף כל חודש.',
  mentorCushion: 'קודם כרית, אחר כך נכסים. בוא נתחיל לזוז.', mentorAsset: 'יש לך כרית. עכשיו מחפשים נכס שעובד בשבילך.',
  instLine: 'תשלומים: מכונת כביסה',
};
const GOAL_CHAIN = { cushion: { title: 'חודש הוצאות בצד', next: 'asset' }, asset: { title: 'נכס ראשון שמכניס כסף', next: 'fund' }, fund: { title: '🛟 חודש הוצאות בקרן החירום', next: 'done' } };
/** E-4 metrics().nextGoal: {id, title, value, target, unit, done:false} while the tutorial goal chain runs. */
function nextGoalOf(st) {
  const I = st.intro; if (!I || !GOAL_CHAIN[I.goal] || st.afterWin) return null;
  const E0 = Math.max(1, expensesOf(st));
  if (I.goal === 'cushion') return { id: 'cushion', title: GOAL_CHAIN.cushion.title, value: Math.round(st.cash + (st.savings || 0)), target: E0, unit: '₪', done: false };
  if (I.goal === 'asset') return { id: 'asset', title: GOAL_CHAIN.asset.title, value: st.assets.length, target: 1, unit: 'count', done: false };
  return { id: 'fund', title: GOAL_CHAIN.fund.title, value: Math.round(st.savings || 0), target: E0, unit: '₪', done: false };
}
/** E-4 check (end of payday, after choose() / moveSavings()): completed goals → news, next goal. No RNG, no money. */
function goalTick(st, out) {
  const I = st.intro; if (!I || st.afterWin) return;
  for (let guard = 0; guard < 4 && GOAL_CHAIN[I.goal]; guard++) {
    const g = nextGoalOf(st); if (!g || g.value < g.target) return;
    const nx = GOAL_CHAIN[I.goal].next; I.goal = nx;
    out.news.push({ kind: 'goal', id: g.id, text: nx === 'done' ? `הושג: ${g.title}. סיימת את ההדרכה! 🎓` : `הושג: ${g.title}. הבא: ${GOAL_CHAIN[nx].title}` });
  }
}
function introGoalOf(st) {
  const I = st.intro; const E0 = Math.max(1, expensesOf(st));
  if (I.goal === 'cushion') return { id: 'cushion', title: GOAL_CHAIN.cushion.title, text: tpl(INTRO_TEXT.goalCushion, { E: fmtM(E0) }), value: Math.round(st.cash + (st.savings || 0)), target: E0 };
  if (I.goal === 'asset') return { id: 'asset', title: GOAL_CHAIN.asset.title, text: INTRO_TEXT.goalAsset, value: st.assets.length, target: 1 };
  return null;
}
DESCRIBE.intro = function (st, p, ev) {
  const I = st.intro || { step: 'done', glitch: { cost: 0, inst: 0, fee: 0, diy: 0 } }; const g = I.glitch; const m = metrics(st); const E0 = expensesOf(st);
  const fx = (cash = 0, monthly = 0, months = 0, energy = 0) => ({ cash, monthly, months, energy, happy: 0 });
  ev.data = { step: I.step, payslip: { net: m.salary, expenses: E0, cashflow: m.cashflow, cash: st.cash } };
  ev.sound = 'card';
  if (I.step === 'glitch') {
    ev.tag = INTRO_TEXT.tag2; ev.title = INTRO_TEXT.title2; ev.text = tpl(INTRO_TEXT.text2, { cost: fmtM(g.cost) }); ev.mentor = INTRO_TEXT.mentor2;
    ev.data.glitch = { ...g }; ev.data.note = INTRO_TEXT.note2;
    ev.options = [opt('fix:pay', tpl(INTRO_TEXT.pay, { cost: fmtM(g.cost) }), true, { kind: 'intro', effects: fx(-g.cost) }),
      opt('fix:inst', tpl(INTRO_TEXT.inst, { inst: fmtM(g.inst) }), true, { kind: 'intro', effects: { ...fx(0, g.inst, 3), fee: g.fee } }),
      opt('fix:diy', tpl(INTRO_TEXT.diy, { diy: fmtM(g.diy) }), true, { kind: 'intro', effects: fx(-g.diy, 0, 0, -10) })];
    ev.noPrimary = true; return;
  }
  if (I.step === 'result') {
    const b = I.before || { cash: st.cash, cf: m.cashflow, energy: Math.round(st.life.energy) };
    ev.tag = INTRO_TEXT.tag3; ev.title = INTRO_TEXT.title3; ev.mentor = I.goal === 'cushion' ? INTRO_TEXT.mentorCushion : INTRO_TEXT.mentorAsset;
    ev.data.result = { cashBefore: b.cash, cashAfter: st.cash, cfBefore: b.cf, cfAfter: m.cashflow, energyBefore: b.energy, energyAfter: Math.round(st.life.energy), instMonths: I.choice === 'fix:inst' ? 3 : 0, choice: I.choice };
    ev.data.goal = introGoalOf(st); ev.data.goalHeading = INTRO_TEXT.next3;
    ev.options = [opt('go', INTRO_TEXT.go, true, { kind: 'intro', primary: true, effects: fx() })]; ev.forcePrimary = 'go'; return;
  }
  ev.tag = INTRO_TEXT.tag1; ev.title = INTRO_TEXT.title1; ev.text = `בקופה עכשיו: ${fmtM(st.cash)}`; ev.mentor = tpl(INTRO_TEXT.mentor1, { who: st.charName });
  ev.options = [opt('next', INTRO_TEXT.next, true, { kind: 'intro', primary: true, effects: fx() }), opt('skip', INTRO_TEXT.skip, true, { kind: 'intro', link: true, effects: fx() })];
  ev.forcePrimary = 'next';
};
CHOOSE.intro = function (st, p, o, params, out) {
  const I = st.intro; if (!I) return true;
  out.mentor = null;
  if (o.id === 'next') { I.step = 'glitch'; return false; }
  if (o.id === 'skip') { I.step = 'skipped'; I.goal = null; return true; }
  if (o.id === 'go') { I.step = 'done'; return true; }
  const g = I.glitch; const m0 = metrics(st);
  I.before = { cash: st.cash, cf: m0.cashflow, energy: Math.round(st.life.energy) }; I.choice = o.id;
  if (o.id === 'fix:pay') { st.cash -= g.cost; cashFx(out, -g.cost); sound(out, 'loss'); }
  else if (o.id === 'fix:inst') { st.expenses.push({ id: 'x' + st.nextId++, label: INTRO_TEXT.instLine, amount: g.inst, trim: false, cut: false, until: st.month + 2 }); sound(out, 'card'); }
  else if (o.id === 'fix:diy') { st.cash -= g.diy; cashFx(out, -g.diy); st.life.energy = clamp(st.life.energy - 10, 0, 100); sound(out, 'card'); }
  ensureCash(st, out, 'intro');
  I.goal = st.cash + (st.savings || 0) < expensesOf(st) ? 'cushion' : 'asset';
  I.step = 'result';
  return false;
};
/** E-5: the tutorial deal's down payment — floor500(cash + savings − E) in [0, 5000]. */
function tutorialDown(st) { return clamp(Math.floor((st.cash + (st.savings || 0) - expensesOf(st)) / 500) * 500, 0, 5000); }
/** Eligible iff the tutorial deal was not drawn yet and the player can put ≥ ₪1,000 into it while keeping a month of expenses. */
function tutorialDealOk(st) { return !!(st.tutorial && st.worldId === 'w1' && R4(st) && !st.flags.tutorialDone && tutorialDown(st) >= 1000); }
function tutorialCard(st) {
  const down = tutorialDown(st); const cf = r10(down * 0.09);
  return { k: 'biz', n: 'עגלת הקפה של השכן', d: 'השכן עובר דירה ומוכר את העגלה. בלי הלוואה.', cost: down, down, cf, value: down, tutorialDeal: true,
    q: `עסקה ראשונה: ${fmtM(down)} שמכניסים ${fmtM(cf)} כל חודש. כמה חודשים עד שהכסף חוזר אליך?` };
}

/* ---- E-7 dreams (presentation only) */
function dreamView(st, extra = {}) {
  const L = st.life; let bizCf = 0, hasBiz = !!(L && L.side && L.side.months >= 1), posAsset = false;
  for (const a of st.assets) { const cf = assetCf(st, a); if (cf > 0) posAsset = true; if (a.biz || a.k === 'biz' || a.k === 'side' || a.k === 'mall') { hasBiz = true; bizCf += cf; } }
  return { month: st.month, cash: st.cash, savings: st.savings || 0, E: expensesOf(st), passive: passiveOf(st), energy: L ? L.energy : 0, credit: st.credit, bizCf, hasBiz, posAsset, restPayday: !!extra.restPayday };
}
function dreamTickSt(st, out, o = {}) {
  if (!st.dream || st.afterWin || st.over) return;
  const got = DR.dreamTick(st.dream, dreamView(st, o), o);
  if (got.length) { (out.dream ||= []).push(...got); const D = DR.DREAM_BY_ID[st.dream.id]; out.mentor = out.mentor || `${got[0].title} — צעד אמיתי לכיוון ${D.name}.`; }
}
function dreamMetrics(st) { return st.dream ? DR.dreamBlock(st.dream, dreamView(st)) : null; }

/* ---- E-6 lesson context */
let LESSON_EV = null; // the event a payday / yearly roll-over lesson belongs to (set around those calls; outcome-neutral)
function eventTitleOf(st) {
  if (LESSON_EV) return LESSON_EV;
  const p = st.pending; if (!p) return null;
  return (p.card && p.card.n) || p.title || p.mysteryTitle || null;
}
function numFor(st, id, extra) {
  const L = st.life; const N = (label, value) => (value == null || Number.isNaN(value) ? null : { label, value });
  if (extra != null) {
    const lab = { forced_loan: 'הלוואה כפויה', good_debt: 'תזרים אחרי ההלוואה', leverage: 'חוב על הנכס', asset_liability: 'הנכס מכניס', hedonic: 'הוצאת על פיתוי', panic_selling: 'ההפסד במכירה', capital_gains: 'מס ששילמת', burnout: 'עלות השחיקה', side_hustle: 'הכנסה מהצד', biz_revenue_profit: 'רווח נקי החודש' }[id];
    if (lab) return N(lab, Math.round(extra));
  }
  switch (id) {
    case 'gross_net': return N('נטו', baseNet(st));
    case 'bituah_leumi': return N('ביטוח לאומי ומס בריאות', payslipOf(st).bl);
    case 'tax_brackets': case 'marginal_overtime': return N('המדרגה השולית שלך', round2(marginalRate(grossBase(st))));
    case 'cashflow': return N('התזרים שלך', metrics(st).cashflow);
    case 'passive_income': return N('הכנסה פסיבית', passiveOf(st));
    case 'emergency_fund': return N('בקרן החירום', Math.round(st.savings || 0));
    case 'credit_card_debt': return N('חוב באשראי', st.credit);
    case 'compound_interest': return N('בפנסיה', Math.round(L.pension));
    case 'inflation': return L.infl.length ? N('אינפלציה השנה', L.infl[L.infl.length - 1]) : null;
    case 'diversification': return N('סוגי נכסים', new Set([...st.assets.map((x) => x.k), ...Object.keys(st.holdings).filter((tk) => st.holdings[tk].qty > 0)]).size);
    case 'opportunity_cost': return N('ויתרת על פיתויים ב־', st.stats.toysResisted || 0);
    case 'index_fund': return N('יחידות בקרן', st.holdings.IDX ? st.holdings.IDX.qty : 0);
    default: return null;
  }
}

/* ---- E-10 practice ('K'): js/practice.js is pure; the engine guards, logs and records */
/** The next practice offer (no RNG, no state change) or null. memo = {lastTurn, offered:[qid], doneA:[topic]} kept by the UI. */
export function practiceDue(st, memo = {}) { if (!st || st.mode !== 'free' || st.history || st.over) return null; return PR.pickPractice(st, memo, expensesOf(st), fmtM); }
/** Answer a practice question (free / learn only, between rolls). Changes only st.practice, st.dq.transfer and st.actions. */
export function answerPractice(st, qid, idx) {
  const fail = (error) => ({ ok: false, error });
  if (!st || st.over) return fail('המשחק נגמר');
  if (st.mode !== 'free' || st.history) return fail('אין שאלות תרגול במשחק הזה');
  if (!PR.PRACTICE_BY_ID[qid]) return fail('אין שאלה כזו');
  if (st.practice && st.practice.answered && qid in st.practice.answered) return fail('כבר ענית על השאלה הזו');
  if (st.phase !== 'roll' || st.pending) return fail('אפשר לענות בין התורות');
  if (!PR.checkAnswer(qid, idx)) return fail('אין תשובה כזו');
  act(st, ['K', qid, Math.floor(+idx)]);
  return PR.recordAnswer(st, qid, Math.floor(+idx), st.turn);
}

/* ============================================================ T6 engine part: deal competition, decision points, after-win */
/** Exactly RIVAL_DRAWS draws from 'rival' on every deal / mystery landing under rules 4 (none under rules 3). */
function rivalDraws(st) { if (!R4(st)) return null; const rs = []; for (let i = 0; i < RV.RIVAL_DRAWS; i++) rs.push(next(st.rng, 'rival')); return rs; }
/** The card's PUBLIC data the investors see (same for every player who lands on it). */
function rivalPub(st, p) {
  const c = p.card; const kind = W(st).kinds[c.k] || {};
  const cfClaim = assetCf(st, { k: c.k, noi: c.noi, cf: c.cf, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd });
  return { kind: c.k, rent: !!kind.rent, golden: !!p.golden, cfClaim, down: c.down, warn: p.dd && !p.dd.golden ? (p.dd.flags || []).length : 0 };
}
function attachRival(st, p, rs) {
  if (!rs || p.type !== 'deal' || !p.dd || p.dd.starter) return;
  if (!RV.rivalCfg(st.worldId).enabled || (st._dev && st._dev.noRival)) { p.rv = null; return; }
  const r = RV.drawRival(rs, rivalPub(st, p), st.worldId, st.self);
  p.rv = { n: r.n, who: r.who, steps: 0, close: r.close, taker: r.taker };
}
const personaPub = (id) => { const a = RV.persona(id); return { id: a.id, icon: a.icon, name: a.name, label: a.label, g: a.g }; };
/** metrics().rivals.deals entry: public fields; the truth only once revealed. */
function rivalPublic(d) {
  const o = { m: d.m, name: d.name, by: personaPub(d.by), how: d.how, claimedCf: d.claimedCf, claimedValue: d.claimedValue, revealAt: d.revealAt, revealed: !!d.revealed };
  if (d.revealed) { o.cf = d.truth.cf; o.repair = d.truth.repair || 0; o.text = RV.revealText(d, fmtM); }
  return o;
}
/** Before a delay step: the public hazard and the public value of continuing (₪). */
function rivalPre(st, p) {
  if (!p.rv || !p.rv.n) return null;
  const h = RV.hazard(st.worldId, p.rv.n, p.rv.steps + 1);
  const ev = describe(st); const ctx = pubCtx(st);
  const best = ev.options.filter((x) => x.kind === 'buy' && x.enabled).map((x) => dealBuy(ctx, ev, x).U).sort((a, b) => b - a)[0];
  return { h, V: Math.max(0, best || 0) * ctx.E, E: ctx.E };
}
function rivalLuck(st, pre, lost) {
  if (!pre) return;
  const amt = lost ? -(1 - pre.h) * pre.V : pre.h * pre.V;
  addLuck(st, 'rival', amt, CUR_K, lost || Math.abs(amt) >= 0.25 * pre.E);
}
/** §3.5: a rival closed first. The player paid only for the step taken; nothing else changes (no money creation). */
function loseToRival(st, p, out, how) {
  st.stats.rivalLost = (st.stats.rivalLost || 0) + 1;
  const c = p.card; const t = ddTruthOf(c, p.dd); const pr = { k: c.k, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd };
  const cfAt = (base) => assetCf(st, c.noi != null ? { ...pr, noi: base } : { ...pr, cf: base });
  const d = { m: st.month, k0: p.k0 != null ? p.k0 : -1, name: c.n, by: p.rv.taker, how, claimedCf: cfAt(c.noi != null ? c.noi : c.cf), claimedValue: c.value ?? c.cost, level: p.dd.level,
    truth: { cf: cfAt(t.base), value: t.value, repair: t.repair || 0 }, revealAt: st.month + RV.RIVAL_REVEAL, revealed: false };
  st.rivalDeals.push(d); if (st.rivalDeals.length > 12) st.rivalDeals.shift();
  mark(st, 'rivalLost', d.claimedValue, CUR_K, c.n);
  const tx = RV.lostTexts(p.rv.taker, how); const ddLine = how === 'inspect' && out.mentor ? out.mentor : null; // the inspection result the player paid for
  out.rival = { lost: true, by: personaPub(p.rv.taker), how, text: gz(st, tx.text), sub: gz(st, tx.sub), button: RV.TEXT.lostButton, dd: ddLine };
  out.news.push({ kind: 'rival', text: out.rival.text });
  out.mentor = RV.TEXT.mentorLost; sound(out, 'loss');
}
/** payday: "how it turned out for them" — the first payday at or after revealAt. */
function rivalReveal(st, out) {
  for (const d of st.rivalDeals || []) {
    if (d.revealed || st.month < d.revealAt) continue;
    d.revealed = true; const text = gz(st, RV.revealText(d, fmtM));
    out.news.push({ kind: 'rival', text, by: d.by, name: d.name });
    mark(st, 'rivalReveal', (d.truth.cf - d.claimedCf) * 12, -1, d.name);
  }
}

/**
 * T6 §4.4: the decision points of this game for the rewind sheet → [{k0, k, m, t, type, c, o, v}] (newest last, ≤ 120).
 * k0 = the card start (replay(cfg, actions.slice(0, k0)) has the card open, nothing chosen); k = the action that recorded it.
 * Records without k0 (saves migrated mid-game) are completed by one replay of the log.
 */
export function decisionPoints(st) {
  const D = (st.dq && st.dq.decisions) || [];
  let scan = null;
  if (D.some((r) => r.k0 == null || r.k0 < 0)) scan = k0Scan(st);
  return D.map((r) => ({ k0: r.k0 != null && r.k0 >= 0 ? r.k0 : scan && scan.get(r.k) != null ? scan.get(r.k) : r.k, k: r.k, m: r.m, t: r.t, type: r.type, c: r.c, o: r.o, label: r.l || r.o, v: r.v }))
    .filter((x) => x.k0 != null && x.k0 >= 0).slice(-120);
}
/** k → k0 for every action of the log, by one replay (the card a 'c' answers started right after the action that opened it). */
function k0Scan(st) {
  const map = new Map();
  try {
    const s2 = createGame(replayConfig(st)); let open = s2.pending ? 0 : null; let pid = s2.pending ? s2.pending.id : null;
    const A = st.actions || [];
    for (let i = 0; i < A.length; i++) {
      if (s2.pending && s2.pending.id === pid) map.set(i, open);
      else if (A[i][0] === 'Q' || A[i][0] === 'F') map.set(i, i);
      replayStep(s2, A[i], i);
      if (s2.pending && s2.pending.id !== pid) { pid = s2.pending.id; open = i + 1; }
      if (!s2.pending) { pid = null; open = null; }
    }
  } catch (e) { /* a broken log: no scan */ }
  return map;
}

/** §9 continue after the win (free / learn only). Logged as ['W']. */
export function continueAfterWin(st) {
  const out = newOut();
  if (!(st.over === 'won' && st.mode === 'free' && !st.history && !st.afterWin)) return { ...out, ok: false, error: 'אפשר להמשיך רק אחרי ניצחון במשחק חופשי', event: null, end: null };
  const m = metrics(st); const r = st.result || {};
  st.afterWin = { m: st.month, months: r.months ?? st.month, stars: r.stars || 0, nw0: m.netWorth, pas0: m.passive, exp0: m.expenses, hap0: Math.round(st.life.happiness) };
  st.over = null; st.result = null; st.phase = 'roll'; st.pending = null;
  mark(st, 'afterWin', 0, (st.actions || []).length, '');
  act(st, ['W']);
  out.mentor = 'יצאת מהמירוץ. עכשיו נראה אם החופש מחזיק — בלי כוכבים חדשים, רק החיים.';
  return { ...out, event: null, end: null };
}
/** §9 retire (only while continuing after a win, between rolls). Logged as ['X']. */
export function retire(st) {
  const out = newOut();
  if (!(st.afterWin && !st.over && st.phase === 'roll' && !st.pending)) return { ...out, ok: false, error: 'אפשר לפרוש רק אחרי היציאה, בין התורות', end: null };
  act(st, ['X']);
  const end = buildEnd(st, { aw: 'retired' }); finalize(st, end, out);
  return { ...out, end };
}

/**
 * Re-run a game from its config + st.actions (server-side verification of ranked results). Pure & deterministic.
 * cfg = {worldId, charId, seed, mode, maxMonths, scenarioId, bailout, tutorial}. Throws {message:'replay_mismatch …'} on an impossible action.
 */
export function replay(cfg, actions) {
  const st = createGame(cfg);
  (actions || []).forEach((a, i) => replayStep(st, a, i));
  return st;
}
/** Apply one logged action (replay, k0 scan). Throws replay_mismatch on an impossible action. */
function replayStep(st, a, i) {
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
      case 'T': r = setSideReport(st, a[1]); break;
      case 'F': r = setFocus(st, a[1], a[2] ?? 0); break;
      case 'H': r = requestHint(st); break;
      case 'M': r = setMentorLevel(st, a[1]); break;
      case 'Q': r = resolveStory(st, a[1], a[2]); break;
      case 'K': r = answerPractice(st, a[1], a[2]); break;
      case 'W': r = continueAfterWin(st); break;
      case 'X': r = retire(st); break;
      case 'Z': r = worldAction(st, a[1], a.length > 2 ? a[2] : null); break; // worlds wave 0: a module action between rolls
      default: throw new Error('unknown action');
    }
  } catch (e) { throw new Error(`replay_mismatch at ${i} (${JSON.stringify(a)}): ${e.message}`); }
  if (r && r.ok === false) throw new Error(`replay_mismatch at ${i} (${JSON.stringify(a)}): ${r.error}`);
}
/** Config needed by replay() for this game. */
export function replayConfig(st) {
  const cfg = { worldId: st.worldId, charId: st.charId, seed: st.seed, mode: st.mode, maxMonths: st.maxMonths, scenarioId: st.history ? st.history.scenarioId : undefined, bailout: !!st.bailout, tutorial: !!st.tutorial,
    mentor: startLevel(st), rules: st.rules || 3 };
  if (st.dateKey) cfg.dateKey = st.dateKey;
  if (st.gender) cfg.gender = st.gender;
  if (st._dev) cfg._dev = { ...st._dev };
  if (st.learn) cfg.learn = true;                         // T4 E-9 (outcome-neutral; free games only)
  if (st.dream) cfg.dream = st.dream.id;
  if (st.tutorialFree) cfg.tutorialFree = true;
  if (st.self) cfg.self = st.self;                        // T6 §10.2 (ghost games)
  return cfg;
}
/** The mentor level the game STARTED with (mid-game changes are replayed through 'M'). */
function startLevel(st) { const ch = (st.dq && st.dq.levelChanges) || []; return ch.length ? ch[0].from : st.mentor; }

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
export function starThresholds(world, charId, rules = 4) {
  const w = typeof world === 'string' ? getWorld(world) : world;
  const ch = w.characters.find((c) => c.id === charId);
  return { maxMonths: charMaxMonths(w, ch, rules), happy: LIFE_CFG.happyStar, fundMonths: 3, ...w.stars, ...((ch && ch.stars) || {}) };
}

/** null while playing; otherwise the final result (pure — choose()/rollDice also store it in state.result). */
export function checkEnd(st) {
  if (st.result) return st.result;
  if (st.afterWin) { // T6 §9: after the win the goal no longer ends the game — bankruptcy, retire ('X') or the 10-year cap do
    const aw = st.flags.bankrupt ? 'afterWinBroke' : st.month >= st.afterWin.m + 120 ? 'cap' : null;
    return aw ? buildEnd(st, { aw }) : null;
  }
  const w = W(st); const m = metrics(st); const g = w.goal;
  const timeUp = st.mode !== 'free' && st.month > st.maxMonths;
  let won = false;
  if (g.type === 'benchmark') won = timeUp && m.netWorth >= benchNW(st);
  else won = goalMet(st) && (st.life.goalStreak || 0) >= goalHoldOf(st); // the goal must hold on consecutive paydays (goalHoldOf)
  const bankrupt = !!st.flags.bankrupt && !won;
  if (!won && !timeUp && !bankrupt) return null;
  return buildEnd(st, { won, bankrupt, timeUp, m });
}
/**
 * T6 client CR: the result of a game stopped from outside (a ghost at its cap) — checkEnd() when the game ended, else a 'capped'
 * result built the same way (recap dims, graph, learning) without touching the state. Pure.
 */
export function endNow(st) {
  const end = checkEnd(st); if (end) return end;
  const r = buildEnd(st, { won: false, bankrupt: false, timeUp: false });
  return { ...r, status: 'capped', reason: 'cap', stars: 0, nearMiss: null };
}
/** The end result (checkEnd / retire). o = {won, bankrupt, timeUp, m} or {aw: 'retired'|'cap'|'afterWinBroke'} after a win. */
function buildEnd(st, o) {
  const w = W(st); const m = o.m || metrics(st); const g = w.goal;
  const A = st.afterWin; const aw = A ? o.aw : null;
  const won = !!o.won; const bankrupt = !!o.bankrupt;
  const months = st.month;
  const happy = Math.round(st.life.happiness);
  let stars = 0, starsBlockedByHappiness = false, starsBlockedByFund = false, starsBlockedBy = null;
  if (g.type === 'benchmark') {
    if (!bankrupt) stars = (m.life.realNetWorth > st.history.startNW ? 1 : 0) + (won ? 1 : 0) + (won && happy >= LIFE_CFG.happyStar ? 1 : 0);
    starsBlockedByHappiness = won && happy < LIFE_CFG.happyStar;
  } else if (won) {
    stars = starsFor(w, months, st.maxMonths, st.charId);
    if (stars >= 3 && happy < starThresholds(w, st.charId).happy) { stars = 2; starsBlockedByHappiness = true; }
    if (stars >= 3 && m.emergency.months < starThresholds(w, st.charId).fundMonths) { stars = 2; starsBlockedByFund = true; } // freedom that survives a crisis
    { const M = mechWith(st, 'starGates'); if (M) for (const gt of M.starGates(st, MCTX) || []) if (!gt.ok && stars >= gt.stars) { stars = gt.stars - 1; starsBlockedBy = { id: gt.id, label: gt.label }; } } // worlds: a module's extra star rule (w6 ★★★: no safety stop in 12 months)
  }
  const res = { status: won ? 'won' : 'lost', reason: won ? (g.type === 'benchmark' ? 'benchmark' : 'goal') : bankrupt ? 'bankrupt' : 'time', months, turns: st.turn, stars, starsBlockedByHappiness, starsBlockedByFund, netWorth: m.netWorth, passive: m.passive, expenses: m.expenses, cashflow: m.cashflow, impact: Math.floor(st.world.impact || 0), progress: m.goalProgress, stats: { ...st.stats }, lesson: w.lesson, worldId: w.id, charId: st.charId, nearMiss: null, tip: null };
  if (starsBlockedBy) res.starsBlockedBy = starsBlockedBy; // only when a module gate blocked a star (w1–w5 results unchanged)
  if (aw) { // the continuation's result: never more stars than at the win
    res.status = aw === 'afterWinBroke' ? 'lost' : 'retired'; res.reason = aw; res.stars = A.stars; res.starsBlockedByHappiness = false; res.starsBlockedByFund = false;
    const n = st.month - A.m; const still = m.passive >= m.expenses;
    const lines = [`${heMonths(n)} אחרי היציאה`, `שווי נקי ${sgn(m.netWorth - A.nw0)} מאז היציאה`, `הכנסה פסיבית ${sgn(m.passive - A.pas0)} מאז היציאה`, `אושר ${A.hap0} → ${Math.round(st.life.happiness)}`,
      still ? 'ההכנסה הפסיבית עדיין מכסה את ההוצאות' : 'ההכנסה הפסיבית כבר לא מכסה את ההוצאות'];
    if (aw === 'cap') lines.push('עברו 10 שנים מאז שיצאת מהמירוץ — כאן עוצרים.');
    if (aw === 'afterWinBroke') lines.push(`החופש לא החזיק: בחודש ${st.month} נגמר הכסף.`);
    res.afterWin = { winMonths: A.months, winStars: A.stars, m0: A.m, months: n, nwDelta: m.netWorth - A.nw0, passiveDelta: m.passive - A.pas0, hap0: A.hap0, hap1: Math.round(st.life.happiness), happinessDelta: Math.round(st.life.happiness) - A.hap0, brokeM: aw === 'afterWinBroke' ? st.month : null, stillFree: still, reason: aw, title: 'מה החופש נתן לך', lines };
  }
  if (g.type === 'benchmark') res.benchmark = benchmarkResult(st, m);
  res.nearMiss = aw ? null : nearMiss(st, w, m, res);
  res.leaks = leaksOf(st);
  res.tip = tipFor(st, res);
  res.log = st.log.slice(-80);
  res.lifeSummary = lifeSummary(st, m, res);
  res.learning = learningOf(st);
  res.lessons = st.lessons.slice();
  res.happiness = happy;
  if (R4(st)) { // T2: the truth may be shown now — claimed vs actual for the deals you bought, and the real cycle path
    res.ddRecap = st.assets.filter((a) => a.dd).map((a) => ({ name: a.n, claimedCf: a.dd.claimedCf, cf: assetCf(st, a), repair: a.dd.repair, level: a.dd.level }));
    res.ddPassed = st.stats.ddPassed || 0;
    res.econPath = st.econ ? { truth: st.econ.truth.map((x) => ({ m: x.m, phase: x.phase, label: CY.PHASE_LABEL[x.phase] })), signal: st.econ.hist.map((x) => ({ m: x.m, s: x.s })), text: 'עכשיו אפשר לראות מה באמת היה' } : null;
  }
  if (st.dream) res.dream = dreamMetrics(st);                       // T4 CR-E5 (presentation only)
  if (st.learn) res.learn = true;
  if (st.history && !res.lessons.includes('benchmark')) res.lessons.push('benchmark'); // T4 E-8: every history game ends with the benchmark lesson
  try { res.recap = recapFor(st, res, m); } catch (e) { res.recap = null; } // T6 §6.2 (never blocks the end of a game)
  return res;
}
/** T6 §5.1 / §6.2: the input of the end summary (engine data only) → result.recap. */
function recapFor(st, res, m) {
  const tl = JSON.parse(JSON.stringify(st.tl || { v: 1, step: 1, from: st.month, m: [], nw: [], liq: [], debt: [], pas: [], exp: [], pg: [], hap: [], en: [] }));
  tlPush(st, true, tl); // the final state as the last row (finalize() appends the same row to st.tl)
  const D = dqOf(st); const L = st.life; const w = W(st);
  const T = st.worldId !== 'h' ? starThresholds(w, st.charId, st.rules) : null;
  const A = st.afterWin;
  const bizNow = managedOf(st).map((a) => { const t = a.biz.totals || {}; let stage = ''; try { stage = BIZ.summary(a.biz).stageName || ''; } catch (e) { stage = ''; } return { months: t.months || 0, profitMonths: t.profitMonths || 0, lossMonths: t.lossMonths || 0, worstNp: t.worst ? t.worst.np : null, worstM: t.worst ? t.worst.m : null, stage }; });
  const all = [...(st.bizPast || []), ...bizNow];
  let biz = null;
  if (all.length) { biz = { had: true, months: 0, profitMonths: 0, lossMonths: 0, worstNp: null, worstM: null, stage: '' }; for (const b of all) { biz.months += b.months; biz.profitMonths += b.profitMonths; biz.lossMonths += b.lossMonths; if (b.worstNp != null && (biz.worstNp == null || b.worstNp < biz.worstNp)) { biz.worstNp = b.worstNp; biz.worstM = b.worstM; } if (b.stage) biz.stage = b.stage; } }
  const leak = (res.leaks || []).find((l) => l.key !== 'forced' && l.amount >= Math.max(1, m.expenses * 0.5));
  const TIPS = { interest: 'בפעם הבאה: פחות חובות. כל שקל ריבית הוא שקל שלא קנה נכס — ואשראי מתגלגל הוא מהחובות היקרים שיש.', toys: 'בפעם הבאה: לוותר על יותר פיתויים. כל צעצוע מהמשכורת דוחה את היציאה.', badAssets: 'בפעם הבאה: תבדוק את השורה התחתונה. נכס שמוציא כסף כל חודש הוא התחייבות.', subs: 'בפעם הבאה: פחות מנויים. מנוי קטן מזיז את קו הסיום — לתמיד.', business: 'בפעם הבאה: עסק שמפסיד חודש אחרי חודש — לבדוק את המספרים לפני שמזרימים עוד.' };
  const deals = (st.rivalDeals || []).map((d) => ({ ...d, text: RV.revealText(d, fmtM) }));
  const won = A ? true : res.status === 'won';
  return recapOf({ tl, marks: st.marks || [], decisions: D.decisions || [], luckLog: D.luckLog || [], verdicts: (res.learning || learningOf(st)).verdicts, nDecisions: D.n, hints: D.hints || 0,
    stats: st.stats, mastery: D.mastery || {}, won, months: A ? A.months : res.months, stars: res.stars, thresholds: T ? [T.t3, T.t2, st.maxMonths] : [null, null, st.maxMonths], progress: won ? 1 : res.progress, maxMonths: st.maxMonths,
    E: Math.max(1, m.expenses), hapAvg: L.hapN ? Math.round(L.hapSum / L.hapN) : null, burnouts: L.burnouts || 0, bailout: !!st.flags.bailoutUsed,
    econTruth: st.econ ? st.econ.truth.map((x) => ({ m: x.m, phase: x.phase })) : [], endMonth: st.month, biz, rivalDeals: deals,
    top: (res.lifeSummary && res.lifeSummary.topDecisions) || [], memory: st.story ? st.story.memory.slice() : [], leakTip: leak ? (TIPS[leak.key] || null) : null, tip: res.tip,
    planLabels: Object.fromEntries(PLAN_IDS.map((id) => [id, PLANS[id].label])), focusLabels: Object.fromEntries(FC.FOCUS_IDS.map((id) => [id, FC.FOCUS[id].label])), fmt: fmtM, persona: RV.persona });
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
    stories: storiesOf(st), storyDefaults: st.stats.storyDefaults || 0,
  };
}
/** T3 §3.7 end screen: the chains this game told — [{chain, title, path, outcome, cost}] (≤ 6). */
function storiesOf(st) {
  if (!st.story) return [];
  return CH.CHAIN_IDS.filter((id) => st.story.chains[id] && st.story.chains[id].steps.length).slice(0, 6).map((id) => {
    const c = st.story.chains[id]; const mem = st.story.memory.filter((x) => x.chain === id);
    const pathKey = id === 'career' ? Object.keys((c.data && c.data.sub) || {})[0] : id === 'side' ? 'side' : id === 'move' && c.steps[0] === 'homeRepair' ? 'owner' : c.path;
    return { chain: id, title: CH.CHAINS[id].title, path: (CH.PATH_TEXT[id] || {})[pathKey] || null, outcome: mem.length ? mem[mem.length - 1].t : null, cost: mem.reduce((x, m) => x + (m.v || 0), 0), steps: c.steps.slice(), open: chainOpen(c) };
  });
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
  if (GOALS[w.goal.type]) { // worlds wave 0 (+ wave 3: the weakest part of a composite goal; a part in months says months)
    const pt = (m.goalParts || []).reduce((b, x) => (b == null || (x.progress ?? 1) < (b.progress ?? 1) ? x : b), null) || {}; const gap = Math.max(0, (pt.target || 0) - (pt.value || 0));
    if (pt.unit === 'months') return { text: `חסרו לך ${Math.ceil(gap * 10) / 10} חודשים ב${pt.label || 'יעד'}.`, gap, part: pt.key };
    return { text: `חסרו לך ${fmtM(gap)} ב${pt.label || 'יעד'}.`, gap, ...((m.goalParts || []).length > 1 ? { part: pt.key } : {}) };
  }
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
    interest: 'בפעם הבאה: פחות חובות. כל שקל ריבית הוא שקל שלא קנה נכס — ואשראי מתגלגל הוא מהחובות היקרים שיש.',
    toys: 'בפעם הבאה: לוותר על יותר פיתויים. כל צעצוע מהמשכורת דוחה את היציאה.',
    badAssets: 'בפעם הבאה: תבדוק את השורה התחתונה. נכס שמוציא כסף כל חודש הוא התחייבות.',
    subs: 'בפעם הבאה: פחות מנויים. מנוי קטן מזיז את קו הסיום — לתמיד.',
  };
  const leak = (res.leaks || leaksOf(st)).find((l) => l.key !== 'forced' && l.amount >= Math.max(1, metrics(st).expenses * 0.5));
  if (leak && res.status !== 'won') return TIPS[leak.key];
  if (w.mechanic === 'rate' && s.upgrades + s.trims === 0) return 'בפעם הבאה: נסה את משבצות השדרוג — שיפוץ טוב או קיצוץ הוצאה מקצרים את הדרך.';
  if (w.mechanic === 'fx' && !s.hedges) return 'בפעם הבאה: כשאתה חשוף לדולר והשער נוח — תגדר. ביטוח זול כשאין סערה.';
  if (w.mechanic === 'angel' && s.angels < 4) return 'בפעם הבאה: הרבה צ\'קים קטנים. ככה תופסים את הסטארט־אפ האחד שעושה פי 50.';
  { const M = mechWith(st, 'recapHint'); const t = M ? M.recapHint(st, res, MCTX) : null; if (t) return t; } // worlds wave 0
  if (leak) return TIPS[leak.key];
  return res.status === 'won' ? 'משחק נקי. נסה דמות אחרת וראה כמה זה משנה.' : 'בפעם הבאה: תחפש נכסים עם תזרים חיובי מוקדם יותר.';
}

/* ============================================================ intro / daily helpers */
/** Opening mentor line + goal text for a fresh game (or a "welcome back" line on resume). */
export function intro(st, resumed = false) {
  const w = W(st); const m = metrics(st);
  const goal = GOALS[w.goal.type] ? w.goalLabel : w.goal.type === 'passive' ? `הכנסה פסיבית שעוברת את ההוצאות (${fmtM(m.expenses)} בחודש)` : w.goal.type === 'netWorth' ? fmtM(w.goal.target) : `שווי נקי של ${fmtM(w.goal.target)} ו־${w.goal.impact} נקודות השפעה`;
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
  return { worldId: w.id, charId, seed: seedFromString('daily:' + dateStr), mode: 'daily', maxMonths: (w.daily && w.daily.maxMonths) || 24, dateKey: dateStr, rules: rulesForDay(dateStr) };
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

/* ============================================================ worlds wave 0: module plumbing (DESIGN §4.2) */
/** Goal-passive income counts toward a "passive" goal in these goal types (deal defaults, the evaluator's horizon, payday lines). */
function passiveGoal(w) { return w.goal.type === 'passive' || w.goal.type === 'passive12'; }
/** May a life chain run in this world? Its own list (w1–w4, h), or any later world that does not exclude it (w.chains.exclude). */
function chainWorldOk(st, C) { if (C.worlds.includes(st.worldId)) return true; const w = W(st); return !!(w.mech && w.mech.length) && !((w.chains && w.chains.exclude) || []).includes(C.id); }
/** The module tile handler for a board character, or null. */
function mechTile(st, ch) { for (const M of mechs(st)) if (M.tiles && M.tiles[ch]) return M.tiles[ch]; return null; }
/**
 * One module action between rolls (action code `Z`): worldAction(st, name, param?) → out ({ok, error?, effects, news, mentor, end}).
 * param is one short string (≤ 40 chars, e.g. "12:premium:budget"); the module validates it. Logged ['Z', name, param] only when it
 * applied, so a replay re-applies exactly the accepted actions. Allowed at any time the game is not over (like takeLoan). Never applied by
 * a room timeout (O1 safe defaults).
 */
export function worldAction(st, name, param = null) { return withK(st, () => worldActionImpl(st, name, param)); }
function worldActionImpl(st, name, param) {
  if (st.over) throw new Error('game over');
  const out = newOut();
  const M = typeof name === 'string' ? mechs(st).find((x) => x.act && Object.prototype.hasOwnProperty.call(x.act, name)) : null;
  if (!M) return { ...out, ok: false, error: 'unknown_action', end: null };
  const p = param == null || param === '' ? null : String(param);
  if (p != null && p.length > 40) return { ...out, ok: false, error: 'bad_param', end: null };
  const r = M.act[name](st, p, out, MCTX);
  if (r === false || out.ok === false) return { ...out, ok: false, error: out.error || 'not_allowed', end: null };
  act(st, p == null ? ['Z', name] : ['Z', name, p]);
  out.mentor = gz(st, out.mentor);
  dreamTickSt(st, out); goalTick(st, out);
  const end = endIfIdle(st, out);
  return { ...out, event: currentEvent(st), end };
}
/** The module actions available now (ids, labels, enabled + reason) — the panel descriptor lists them; [] in w1–w4. */
export function worldActions(st) { const out = []; for (const M of mechs(st)) if (M.actions) out.push(...M.actions(st, MCTX)); return out; }
/** Engine helpers handed to modules (a module never imports engine.js: no cycle, Node-importable, part of a world's pinned pack). */
const MCTX = Object.freeze({
  draw: (st) => next(st.rng, 'world'),                  // THE module stream (index 15); modules declare their fixed counts (draws)
  drawX: (st, name) => { if (st.rng[name] == null) throw new Error('stream ' + name + ' not declared'); return next(st.rng, name); }, // CATALOG §3.8: a declared lazy stream (exch, content)
  fireTrigger: (st, on) => { const w = W(st); return w.content && st.content ? CT.fireTrigger(st, w.content, on) : []; }, // §4.4 triggered pool entries
  fmtM: (n) => fmtM(n), money: (n, f) => money(n, f), sgn: (n) => sgn(n), pct: (x, d) => pct(x, d), tpl: (t, v) => tpl(t, v), heMonths: (n) => heMonths(n),
  mentorLine: (st, k, v) => mentorLine(st, k, v), gz: (st, t) => gz(st, t), opt: (id, label, enabled, extra) => opt(id, label, enabled, extra),
  cashFx: (out, amount, label, at) => cashFx(out, amount, label, at), sound: (out, name) => sound(out, name),
  lesson: (st, out, id, extra) => lesson(st, out, id, extra), addLuck: (st, part, amount) => addLuck(st, part, amount),
  ensureCash: (st, out, why) => ensureCash(st, out, why), mark: (st, kind, amount, label) => mark(st, kind, amount, CUR_K, label || ''),
  assetCf: (st, a) => assetCf(st, a), assetValue: (st, a) => assetValue(st, a), netWorth: (st) => netWorthOf(st), expenses: (st) => expensesOf(st),
  goalPassive: (st) => goalPassiveOf(st), passive: (st) => passiveOf(st), cashflow: (st) => cashflowOf(st), salary: (st) => salaryNow(st),
  loanPct: (st) => loanPct(st), loanUnit: (st) => loanUnit(st), calOf: (st) => calOf(st), focusOn: (st, id) => focusOn(st, id),
  econMult: (st, key) => (st.econ && R4(st) ? CY.mult(st.econ, st.worldId, key) : 1), econLabel: (st) => econLabel(st),
  R: (st, n) => (st.rules || 3) >= n, clamp, r10, r100, round2, world: (st) => W(st), modelFor: (st, k) => modelFor(st, k),
  buy: (st, card, out, o) => moduleBuy(st, card, out, o || {}), loanFor: (st, amount) => loanFor(st, amount), holdingsValue: (st) => holdingsValue(st), loanCap: (st) => loanCap(st), // worlds wave 3 (w7/w8)
  creditScore: (st, d) => creditScore(st, d), logDecision: (st, card, option, v) => logDecision(st, card, option, v), ach: (st, out, type, payload) => ach(st, out, type, payload),
});
/** worlds wave 3: a module tile buys a card it built (w7 branch openings, w8 land): the buy's bank loan as buyAsset (loanFor), addAsset,
 *  the spawn + cash effect. → the new asset, or null when the bank refuses the loan (o.noLoan: never borrow). */
function moduleBuy(st, card, out, o) {
  const pay = Math.max(0, Math.round(card.down || 0)); const L = loanFor(st, pay);
  if (L.need && (o.noLoan || !L.ok)) return null;
  if (L.need) { st.loans += L.need; st.cash += L.need; st.stats.loansTaken += L.need; }
  st.cash -= pay; const a = addAsset(st, card, { golden: !!o.golden }); st.stats.deals++;
  const cf = assetCf(st, a);
  out.spawn.push({ assetId: 'a' + a.id, key: 'a' + a.id, model: modelFor(st, a.k), label: o.label || (sgn(cf) + ' לחודש'), color: cf >= 0 ? 'green' : 'red', golden: !!o.golden });
  sound(out, 'buy'); if (pay) cashFx(out, -pay, null);
  return a;
}
/** Goal registry context (js/worlds/goals.js). */
const GCTX = Object.freeze({ goalPassive: (st) => goalPassiveOf(st), netWorth: (st) => netWorthOf(st), fmt: (n) => fmtM(n), mod: (st, key) => { const M = mechWith(st, 'goalValue'); return M ? M.goalValue(st, key, MCTX) : 0; } });
