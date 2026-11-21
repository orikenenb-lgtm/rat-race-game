// T2 — the economic cycle: a 4-phase Markov chain driven by the appended 'cycle' stream (rules 4).
// 2 draws in createGame, then exactly 2 draws per payday ([rT transition, rN signal noise]) in every mode — history and the
// _dev.noCycle ablation included, where the values are ignored. Effects are multipliers only (no extra draws).
// The true phase is SEALED: the public signal is lagged one month and noisy; the "official" figure arrives 3 months late.
// Pure data + helpers; no engine imports, no DOM, no Math.random, no approximated math.
import { next, makeStreams } from '../rng.js';

export const CYCLE_DRAWS_INIT = 2;
export const CYCLE_DRAWS_MONTH = 2;
export const PHASES = ['exp', 'slow', 'rec', 'recov'];
export const PHASE_LABEL = Object.freeze({ exp: 'צמיחה', slow: 'האטה', rec: 'מיתון', recov: 'התאוששות' });
const NEXT = { exp: 'slow', slow: 'rec', rec: 'recov', recov: 'exp' };
export const SCORE = Object.freeze({ exp: 80, slow: 52, rec: 20, recov: 42 });

const GENTLE = { minLen: { exp: 12, slow: 3, rec: 3, recov: 3 }, pAdv: { exp: 0.07, slow: 0.30, rec: 0.40, recov: 0.35 }, soft: 0.60, init: [0.70, 0.20, 0, 0.10], amp: 0.5, swaps: false }; // (amp 0.7 was tried in tuning: no measurable effect)
const NORMAL = { minLen: { exp: 8, slow: 3, rec: 4, recov: 3 }, pAdv: { exp: 0.10, slow: 0.30, rec: 0.30, recov: 0.35 }, soft: 0.35, init: [0.55, 0.20, 0.10, 0.15], amp: 1.0, swaps: true };
const CFG = { w1: GENTLE, w2: NORMAL, w3: NORMAL, w4: { ...NORMAL, amp: 1.1 }, h: NORMAL };

/** Multipliers at amp = 1 (spec §8.5). Every deviation from the base is scaled by the world's amp. */
export const MULT = Object.freeze({
  dealCost: { exp: 1.08, slow: 1.00, rec: 0.86, recov: 0.94 },
  cfRent: { exp: 1.02, slow: 1.00, rec: 0.97, recov: 0.99 },
  cfOther: { exp: 1.05, slow: 0.98, rec: 0.90, recov: 0.97 },
  loanAdd: { exp: -0.10, slow: 0.10, rec: 0.30, recov: 0 },         // pp/month (base 0; not w2, whose rate cards drive it)
  loanCap: { exp: 1.10, slow: 1.00, rec: 0.70, recov: 0.90 },
  idxAnnual: { exp: 0.09, slow: 0.00, rec: -0.14, recov: 0.16 },   // base 0.04 (LIFE_CFG.idx.annual)
  idxCrash: { exp: 1, slow: 2, rec: 1.5, recov: 1 },
  bizShock: { rec: 0.12, exp: 0.06 },
});
const BASE = { dealCost: 1, cfRent: 1, cfOther: 1, loanAdd: 0, loanCap: 1, idxAnnual: 0.04, idxCrash: 1 };

export function cycleCfg(worldId) { return CFG[worldId] || NORMAL; }

const invCdf = (ps, r) => { let acc = 0; for (let i = 0; i < ps.length; i++) { acc += ps[i]; if (r < acc) return i; } return ps.length - 1; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Initial econ state from the 2 init draws. */
export function initEcon(r1, r2, worldId) {
  const C = cycleCfg(worldId);
  const phase = PHASES[invCdf(C.init, r1)];
  const m = Math.floor(r2 * C.minLen[phase]);
  const s = SCORE[phase];
  return { phase, m, signal: s, prev: s, label: labelOf(s, 0, null), trend: 0, sharpUntil: 0, hist: [{ m: 1, s }], truth: [{ m: 1, phase }] };
}
function labelOf(signal, trend, prevLabel) {
  return signal >= 62 ? 'צמיחה' : signal <= 32 ? 'מיתון' : trend < 0 ? 'האטה' : trend > 0 ? 'התאוששות' : (prevLabel || 'יציב');
}
/** Phase transition only (the decision-independent part shared with cyclePath). → new phase / m. */
export function transition(phase, m, rT, worldId) {
  const C = cycleCfg(worldId);
  if (m + 1 >= C.minLen[phase] && rT < C.pAdv[phase]) return { phase: phase === 'slow' && rT < C.pAdv.slow * C.soft ? 'exp' : NEXT[phase], m: 0 };
  return { phase, m: m + 1 };
}
/**
 * One payday (month = the new month number). Mutates econ. sharp = research focus active (no lag, ±5 noise instead of ±12).
 * → {changed:boolean, from, to, labelChanged:boolean}
 */
export function stepEcon(econ, rT, rN, worldId, month) {
  const sharp = econ.sharpUntil >= month;
  const from = econ.phase;
  const t = transition(econ.phase, econ.m, rT, worldId);
  econ.phase = t.phase; econ.m = t.m;
  const target = SCORE[sharp ? econ.phase : from];
  const amp = sharp ? 5 : 12;
  const prev = econ.signal; const prevLabel = econ.label;
  econ.prev = prev;
  econ.signal = clamp(Math.round(0.5 * prev + 0.5 * target + (rN - 0.5) * 2 * amp), 0, 100);
  econ.trend = econ.signal - prev > 2 ? 1 : econ.signal - prev < -2 ? -1 : 0;
  econ.label = labelOf(econ.signal, econ.trend, prevLabel);
  if (prevLabel !== econ.label) econ.lc = month; // public: when the gauge's label last changed
  econ.hist.push({ m: month, s: econ.signal }); if (econ.hist.length > 24) econ.hist.shift();
  econ.truth.push({ m: month, phase: econ.phase });
  return { changed: from !== econ.phase, from, to: econ.phase, labelChanged: prevLabel !== econ.label };
}

/** Multiplier `key` for the current (sealed) phase, deviation scaled by the world's amp (econ.amp overrides, e.g. impact's hard scenario). */
export function mult(econ, worldId, key) {
  const base = BASE[key] ?? 1;
  if (!econ) return base;
  const amp = econ.amp ?? cycleCfg(worldId).amp;
  return base + (MULT[key][econ.phase] - base) * amp;
}

export const GAUGE_TEXT = 'מד הכלכלה מתעדכן באיחור ועם רעש. הנתון הרשמי מתפרסם אחרי 3 חודשים.';
/** What a player may see (§8.4). The current phase is never here; the official figure lags ≥ 3 months. */
export function econPublic(econ, month) {
  if (!econ) return null;
  return { signal: econ.signal, label: econ.label, trend: econ.trend, labelChangedAt: econ.lc ?? null, sharp: econ.sharpUntil >= month, sharpUntil: econ.sharpUntil,
    hist: econ.hist.slice(-24).map((x) => ({ m: x.m, s: x.s })),
    official: econ.truth.filter((x) => x.m <= month - 3).slice(-12).map((x) => ({ m: x.m, label: PHASE_LABEL[x.phase] })),
    text: GAUGE_TEXT };
}

/** Headlines (§17), picked deterministically by (label, month % n); no numbers that would reveal the truth. */
export const HEADLINES = Object.freeze({
  'צמיחה': ['«החנויות מלאות, הבנקים מחלקים הלוואות בקלות.»', '«כולם מחפשים עובדים. גם המחירים עולים.»'],
  'האטה': ['«פחות קונים בקניונים. העיתונים מדברים על "האטה".»', '«הבנקים מתחילים לבדוק הלוואות בזכוכית מגדלת.»'],
  'מיתון': ['«פיטורים במפעלים, והבנקים סוגרים את הברז.»', '«מחירי הנכסים יורדים — מי שיש לו מזומן מסתכל סביב.»'],
  'התאוששות': ['«לאט לאט: עוד הזמנות, עוד משרות.»', '«המדד עולה, והאופטימיות חוזרת בזהירות.»'],
  'יציב': ['«שקט בכלכלה. אף אחד לא יודע לאן זה הולך.»', '«חודש רגיל בשוק — בלי כותרות גדולות.»'],
});
export function headline(label, month) { const h = HEADLINES[label] || HEADLINES['יציב']; return h[month % h.length]; }

/**
 * The phase path rebuilt from the seed alone: [{m, phase}] for months 1..months+1. Equals the engine's econ.truth
 * (the cycle stream is consumed only by createGame and payday, 2 draws each, in every rules-4 game).
 */
export function cyclePath(seed, worldId, months) {
  const h = { c: makeStreams(seed).cycle };
  const r1 = next(h, 'c'), r2 = next(h, 'c');
  const e = initEcon(r1, r2, worldId);
  const path = [{ m: 1, phase: e.phase }];
  let phase = e.phase, m = e.m;
  for (let k = 2; k <= months + 1; k++) { const rT = next(h, 'c'); next(h, 'c'); const t = transition(phase, m, rT, worldId); phase = t.phase; m = t.m; path.push({ m: k, phase }); }
  return path;
}
/** Sim/test bucket of a path over the character's month limit (§8.6). */
export function cycleBucket(path, maxMonths) {
  const xs = path.filter((x) => x.m <= maxMonths);
  const recMonths = xs.filter((x) => x.phase === 'rec').length;
  const starts = xs.filter((x, i) => x.phase === 'rec' && (i === 0 || xs[i - 1].phase !== 'rec')).map((x) => x.m);
  if (recMonths >= 10 || starts.length >= 2) return 'B3_long';
  if (starts.length && starts[0] <= 18) return 'B1_early';
  if (starts.length) return 'B2_late';
  return 'B0_calm';
}
