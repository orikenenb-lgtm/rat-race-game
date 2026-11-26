// T2 — deal due diligence: data + pure helpers. No engine imports, no DOM, no Math.random, no approximated math.
// Every deal/mystery landing (rules 4) draws exactly DD_DRAWS numbers from the appended 'dd' stream, in the order
// [riskR, flagR, cfR, repairR, valueR, jitterR], whatever the card turns out to be. The truth (risk, factors, repair) is
// SEALED; the public part is the flags (and the range / exact numbers after an inspection). All Bayes tables are
// precomputed here at module load with + − × ÷ only (tests/determinism.test.mjs scans this file).

export const DD_DRAWS = 6;
const RISKS = [0, 1, 2, 3];

const LIKE = [[0.75, 0.22, 0.03], [0.45, 0.45, 0.10], [0.15, 0.50, 0.35], [0.05, 0.30, 0.65]]; // P(k flags | r), shared
const CF_GENTLE = [[0.95, 1.05], [0.82, 1.04], [0.50, 1.00], [0.10, 0.80]];
const CF_W1 = [[0.95, 1.05], [0.80, 1.04], [0.30, 0.95], [-0.60, 0.50]]; // review M4: believing the seller must not beat smart in w1 (balance pass: was [.82,1.04] [.40,1] [−.30,.65])
const CF_HARD = [[0.95, 1.05], [0.82, 1.04], [0.50, 1.00], [-0.40, 0.80]];
const CF_W4 = [[0.95, 1.05], [0.80, 1.03], [0.40, 0.95], [-0.60, 0.70]]; // review M4: harder w4 (owner)
const CF_W2 = [[0.95, 1.05], [0.80, 1.04], [0.40, 0.95], [-0.60, 0.70]]; // balance pass: w2 traps cost enough that checking a flagged deal pays (G4)
const NOI_W2 = [[0.97, 1.03], [0.88, 1.03], [0.62, 0.98], [0.30, 0.85]]; // balance pass: was [.90,1.03] [.75,1] [.55,.95]
const VF = [[0.97, 1.03], [0.92, 1.02], [0.82, 1.00], [0.65, 0.95]];
const VF_HARD = [[0.97, 1.03], [0.90, 1.02], [0.72, 0.97], [0.45, 0.85]]; // balance pass: in the net-worth worlds a hidden problem costs real value (DD must be able to flip a buy)
const REPAIR = [0.05, 0.20, 0.45, 0.75];
// repair = down × (REP_MIN + REP_SPAN·u) when it happens (tuned, T2 §13.5 knob 1: spec 0.1 + 0.4u made big-down worlds punitive)
const REP_MIN = 0.05, REP_SPAN = 0.25, REP_MEAN = REP_MIN + REP_SPAN / 2;
const CFG = {
  w1: { prior: [0.40, 0.30, 0.18, 0.12], cf: CF_W1, minFee: 400 }, // tuned (T2 §13.5 knob 1): believing the seller must cost something even in w1
  w2: { prior: [0.27, 0.31, 0.26, 0.16], cf: CF_W2, noi: NOI_W2, minFee: 1500 }, // balance pass: a few more problem deals (was .30 .33 .24 .13)
  w3: { prior: [0.30, 0.32, 0.24, 0.14], cf: CF_HARD, vf: VF_HARD, minFee: 3000 },
  w4: { prior: [0.20, 0.28, 0.30, 0.22], cf: CF_W4, vf: VF_HARD, minFee: 3000 },
  h: { prior: [0.50, 0.33, 0.13, 0.04], cf: CF_GENTLE, minFee: 400 },
};

/** Public per-world config (priors, likelihoods, factor ranges, repair chances, inspect:2 minimum fee). */
export function ddCfg(worldId) {
  const c = CFG[worldId] || CFG.w1;
  return { prior: c.prior, like: LIKE, cf: c.cf, noi: c.noi || null, vf: c.vf || VF, repair: REPAIR, minFee: c.minFee, inspect1Energy: 4, inspect1Min: 10, inspect2Pct: 0.01 };
}

/** Flag pools (spec §17). `rush` cuts both ways: +0.10 negotiation chance. */
export const FLAG_POOLS = Object.freeze({
  re: Object.freeze([['rush', 'המוכר ממהר למכור'], ['photos', 'יש רק תמונות מבחוץ'], ['noLease', 'השכירות "צפויה" — אין חוזה חתום'], ['build', 'השכנים מדברים על בנייה ליד'], ['old', 'בניין ישן, ועד בית לא פעיל'], ['empty', 'הדירה עמדה ריקה חצי שנה']]),
  biz: Object.freeze([['rush', 'המוכר ממהר למכור'], ['books', 'הספרים "אצל רואה החשבון"'], ['cash', 'רוב העסקאות במזומן'], ['oneClient', 'לקוח אחד מביא חצי מההכנסות'], ['staff', 'העובד הוותיק עוזב עם המוכר'], ['lease', 'חוזה השכירות נגמר בעוד שנה']]),
  trade: Object.freeze([['freight', 'חוזה ההובלה עוד לא חתום'], ['supplier', 'הספק בחו״ל החליף בעלים']]),
});
export const GOLDEN_FLAG = Object.freeze({ id: 'rush', text: 'היורשים רוצים לסגור מהר — המחיר נמוך', kind: 'good' });
const FLAG_TEXT = Object.fromEntries([...FLAG_POOLS.re, ...FLAG_POOLS.biz, ...FLAG_POOLS.trade]);
export function flagText(id) { return FLAG_TEXT[id] || id; }

const r100 = (x) => Math.round(x / 100) * 100;
const round2 = (x) => Math.round(x * 100) / 100;
const invCdf = (ps, r) => { let acc = 0; for (let i = 0; i < ps.length; i++) { acc += ps[i]; if (r < acc) return i; } return ps.length - 1; };

/** The pool for a card: rented kinds → re; everything else → biz (w3 adds the trade flags). */
export function poolFor(worldId, rent) { const c = CFG[worldId]; if (c && c.pool) return rent && c.poolRent ? c.poolRent : c.pool; return rent ? FLAG_POOLS.re : worldId === 'w3' ? FLAG_POOLS.biz.concat(FLAG_POOLS.trade) : FLAG_POOLS.biz; }

/**
 * Build the sealed due-diligence record of an asset deal from the 6 draws.
 * opts: {worldId, rent, noi (card has NOI), golden, starter, down}
 * → {risk, flags:[ids], f, vf, repair, jitter, level:0, noi?:true, golden?:true, starter?:true}
 */
export function drawDD(rs, card, worldId, opts = {}) {
  const C = ddCfg(worldId);
  if (opts.starter) return { risk: 0, flags: [], f: 1, vf: 1, repair: 0, jitter: 0.5, level: 0, starter: true };
  const [riskR, flagR, cfR, repairR, valueR, jitterR] = rs;
  let risk = invCdf(C.prior, riskR);
  if (card && card.dd && card.dd.risk != null) risk = card.dd.risk;
  if (opts.golden) risk = 0;
  const pool = poolFor(worldId, opts.rent);
  let flags = [];
  if (opts.golden) flags = ['rush'];
  else {
    const k = invCdf(LIKE[risk], flagR);
    const base = Math.floor(flagR * 997);
    for (let i = 0; flags.length < k && i < pool.length * 2; i++) { const id = pool[(base + i * 7) % pool.length][0]; if (!flags.includes(id)) flags.push(id); }
  }
  const rng = opts.noi && C.noi ? C.noi[risk] : C.cf[risk];
  const f = round2(rng[0] + (rng[1] - rng[0]) * cfR);
  const V = C.vf; const vf = round2(V[risk][0] + (V[risk][1] - V[risk][0]) * valueR);
  const ch = REPAIR[risk]; const down = Math.max(0, opts.down ?? (card ? card.down : 0) ?? 0);
  const repair = repairR < ch ? r100(down * (REP_MIN + REP_SPAN * repairR / ch)) : 0;
  const dd = { risk, flags, f, vf, repair, jitter: jitterR, level: 0 };
  if (opts.noi) dd.noi = true;
  if (opts.golden) dd.golden = true;
  return dd;
}

/* ---------------------------------------------------------------- public expectations (precomputed tables) */
const POST = {}; const EXP = {}; const P10 = {};
const kOf = (k) => Math.max(0, Math.min(2, k | 0));
function post(worldId, k) {
  const C = CFG[worldId] || CFG.w1; const w = RISKS.map((r) => C.prior[r] * LIKE[r][k]);
  const t = w.reduce((a, b) => a + b, 0); return w.map((x) => x / t);
}
/** 10th percentile of a mixture of uniforms (bisection on the CDF; exact arithmetic only). */
function p10Of(ps, ranges) {
  const cdf = (x) => ps.reduce((a, p, i) => { const [lo, hi] = ranges[i]; return a + p * (x <= lo ? 0 : x >= hi ? 1 : (x - lo) / (hi - lo)); }, 0);
  let lo = -1, hi = 2; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (cdf(m) < 0.1) lo = m; else hi = m; }
  return round2(hi);
}
function tables(wid) { for (let k = 0; k <= 2; k++) {
  const C = CFG[wid]; const p = post(wid, k); const key = wid + ':' + k;
  POST[key] = p;
  const mean = (tab) => p.reduce((a, pr, r) => a + pr * (tab[r][0] + tab[r][1]) / 2, 0);
  EXP[key] = { f: mean(C.cf), fNoi: C.noi ? mean(C.noi) : mean(C.cf), vf: mean(C.vf || VF), rep: p.reduce((a, pr, r) => a + pr * REPAIR[r] * REP_MEAN, 0),
    byRisk: RISKS.map((r) => ({ r, p: p[r], f: (C.cf[r][0] + C.cf[r][1]) / 2, fNoi: C.noi ? (C.noi[r][0] + C.noi[r][1]) / 2 : (C.cf[r][0] + C.cf[r][1]) / 2, vf: ((C.vf || VF)[r][0] + (C.vf || VF)[r][1]) / 2, rep: REPAIR[r] * REP_MEAN })) };
  P10[key] = { f: p10Of(p, C.cf), fNoi: p10Of(p, C.noi || C.cf) };
} }
for (const wid of Object.keys(CFG)) tables(wid);
/** Worlds wave 0 (I4): a later world's due-diligence table — the id of an existing table to copy ('w3') or {prior, cf, vf, noi, minFee, pool}
 *  over w3's (the "hard" defaults). Precomputes the same posterior / expectation tables. w1–w4 / h are never overwritten. */
const NAMED = { CF_GENTLE, CF_W1, CF_HARD, CF_W4, CF_W2, VF, VF_HARD, NOI_W2 };
export function registerWorldCfg(worldId, spec) {
  if (['w1', 'w2', 'w3', 'w4', 'h'].includes(worldId)) return;
  const base = typeof spec === 'string' ? CFG[spec] || CFG.w3 : { ...CFG.w3, ...(spec || {}) };
  const c = { ...base }; for (const k of ['cf', 'vf', 'noi']) if (typeof c[k] === 'string') c[k] = NAMED[c[k]];
  for (const [id, t] of [...(c.pool || []), ...(c.poolRent || [])]) if (!FLAG_TEXT[id]) FLAG_TEXT[id] = t;
  CFG[worldId] = c; tables(worldId);
}

/** P(r | k flags), r = 0..3 (public: from the world's prior and the shared likelihood). */
export function posterior(worldId, k) { return POST[(CFG[worldId] ? worldId : 'w1') + ':' + kOf(k)].slice(); }
/** E[f|k], E[vf|k], E[repair/down|k] (+ the per-risk breakdown for value-of-information math). */
export function expectFactors(worldId, k) { const e = EXP[(CFG[worldId] ? worldId : 'w1') + ':' + kOf(k)]; return { f: e.f, fNoi: e.fNoi, vf: e.vf, rep: e.rep, byRisk: e.byRisk.map((x) => ({ ...x })) }; }
/** P10 of the cashflow factor given k flags (the "hard" impact scenario for unverified deals). */
export function p10Factor(worldId, k, noi) { const e = P10[(CFG[worldId] ? worldId : 'w1') + ':' + kOf(k)]; return noi ? e.fNoi : e.f; }
/** Expected repair share of the down payment once the level-1 bucket is known (small < 15% of down: u < 0.4). */
export const BUCKET_REP = Object.freeze({ none: 0, small: REP_MIN + REP_SPAN * 0.2, big: REP_MIN + REP_SPAN * 0.7 });
/** The span [min, max] of the repair share of the down payment for a level-1 bucket (public: the bucket rule + the repair formula). */
export const BUCKET_SPAN = Object.freeze({ none: Object.freeze([0, 0]), small: Object.freeze([REP_MIN, 0.15]), big: Object.freeze([0.15, REP_MIN + REP_SPAN]) });

/**
 * Level-1 range around the TRUE value (its position inside the range comes from the sealed jitter draw, so the range
 * always contains the truth but does not centre on it). Widths come from PUBLIC numbers only (review M2): the caller passes
 * width = max(₪50, 30% of the CLAIMED monthly cashflow) and valueWidth = 6% of the CLAIMED value; the fallbacks below are
 * for callers without a claim.
 * → {base:[lo,hi], value:[lo,hi], repair:'none'|'small'|'big'}
 */
export function rangeOf(dd, truth) {
  const r10 = (x) => Math.round(x / 10) * 10; const j = dd.jitter;
  // T2 verify D6: the value range sits at its own position, a scrambled function of the same sealed draw (no extra draw), so the
  // value range says nothing about where the cashflow range sits around its truth (j ↦ frac(7919·j) is ~independent of j).
  const jx = j * 7919; const jv = jx - Math.floor(jx);
  const w = truth.width ?? Math.max(50, Math.abs(truth.claimedBase ?? truth.base) * 0.3);
  const wv = truth.valueWidth ?? Math.abs(truth.claimedValue ?? truth.value) * 0.06;
  const down = Math.max(1, truth.down || 1);
  return {
    base: [r10(truth.base - w * j), r10(truth.base + w * (1 - j))],
    value: [Math.round(truth.value - 2 * wv * jv), Math.round(truth.value + 2 * wv * (1 - jv))],
    repair: !truth.repair ? 'none' : truth.repair < 0.15 * down ? 'small' : 'big',
  };
}

/** Sealed truth of a card's income line (cf or NOI): a hidden problem never makes a money-losing line better. */
export function trueBase(base0, f) { const r10 = (x) => Math.round(x / 10) * 10; return r10(base0 >= 0 ? base0 * f : base0 * (2 - f)); }
