// Staged-build core — shared by w8 מטרופולין הנדל"ן (mech/projects.js) and, later, w9 מדבר האנרגיה (energy). A pure library, NOT a module
// object: no draws, no hooks, no engine import. A world module owns its projects (engine assets with a.op.sb = the build record below), calls
// buildMonth() once per payday per project and decides what a finished project becomes (sold units, a rental, a power plant …).
//
// The build record (all ₪ integers):
//   {phase 'permit'|'build'|'done', permitAt (month the permit arrives — SEALED until revealed), stages N, stage (stages completed),
//    stageMonths (months a stage takes), prog (months spent on the current stage), cost (planned construction cost, all stages),
//    overrun (SEALED share added to every stage), delayAt (SEALED stage index where a delay starts), delay (SEALED months), delayLeft,
//    failAt (SEALED stage index where the contractor fails, or −1), failCost (share added after a failure), failMonths,
//    land (₪ paid for the land), spent (₪ paid into stages so far: equity + loan), equity (₪ the owner put in, land included),
//    eqReq (share of land + planned cost the owner must put in before the loan draws), loan (construction loan balance, interest capitalised),
//    escrow (buyers' deposits held for the build: they pay the non-equity part of a stage before the loan draws),
//    gateOk (the world's own loan gate, e.g. w8's presale threshold — set by the module before buildMonth), selfFund (pay a gated stage
//    from equity), external (someone else builds and pays: only time passes), paused}
// One month (buildMonth): permit → build; in build, the month's stage cost = stage cost ÷ stageMonths; it is paid from equity while
// equity < eqReq × (land + cost), then from the loan if the gate is open; if neither can pay (no cash for the equity call, or the gate is
// closed), the stage STALLS — no progress, the loan's interest still runs. A sealed delay stalls the stage it starts in; a contractor failure
// adds failCost to the remaining stages and failMonths of stall. Interest on the loan is capitalised every month (added to the loan).
// Valuation at cost: land + spent (work in progress, never the projected sale value) — the w8 lesson "paper value of an unfinished building
// is not value".

const r1000 = (x) => Math.round(x / 1000) * 1000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** A new build record. o = {stages, stageMonths, cost, land, eqReq, permitAt, overrun, delayAt, delay, failAt, failCost, failMonths}. */
export function newBuild(o) {
  return { phase: o.permitAt > (o.now ?? 0) ? 'permit' : 'build', permitAt: o.permitAt, stages: o.stages, stage: o.stage || 0, stageMonths: o.stageMonths, prog: 0,
    cost: Math.round(o.cost), overrun: o.overrun || 0, delayAt: o.delayAt ?? -1, delay: o.delay || 0, delayLeft: 0, delayDone: false,
    failAt: o.failAt ?? -1, failCost: o.failCost || 0, failMonths: o.failMonths || 0, failed: false,
    land: Math.round(o.land || 0), spent: Math.round(o.spent || 0), equity: Math.round(o.equity ?? o.land ?? 0), eqReq: o.eqReq, loan: Math.round(o.loan || 0),
    escrow: Math.round(o.escrow || 0), gateOk: true, paused: false, stalls: 0, stallMonths: 0, interest: 0 };
}
/** Cost of one stage now (planned ÷ N × (1 + overrun) × (1 + failCost once failed)). */
export function stageCost(b) { return Math.round(b.cost / b.stages * (1 + b.overrun) * (b.failed ? 1 + b.failCost : 1)); }
/** The month's cost of the current stage. */
export const monthCost = (b) => Math.round(stageCost(b) / b.stageMonths);
/** Equity still owed before the loan may draw. */
export function equityGap(b) { return Math.max(0, Math.round(b.eqReq * (b.land + b.cost) - b.equity)); }
/** Expected remaining cost (stages left at the public plan — no sealed overrun): the "cost to complete" a player can know. */
export function costToComplete(b, withOverrun = false) {
  const left = b.stages - b.stage - (b.prog / b.stageMonths);
  return Math.max(0, Math.round(left * b.cost / b.stages * (withOverrun ? (1 + b.overrun) * (b.failed ? 1 + b.failCost : 1) : 1)));
}
/** Share complete 0–1 (stages + the current one's months). */
export const pctDone = (b) => clamp((b.stage + b.prog / b.stageMonths) / b.stages, 0, 1);
/** Value at cost: what has been paid in (the asset's value; the loan is its debt). */
export const valueAtCost = (b) => r1000(b.land + b.spent);

/**
 * One payday of a build. env = {month, cash (₪ the owner can put in now), rate (% a month on the loan, all-in)}.
 * → {equityPaid, loanDrawn, interest, progressed, stalled: null|'permit'|'equity'|'gate'|'delay'|'fail'|'paused', completed, failedNow, delayNow, permitNow}
 * The caller takes equityPaid out of the owner's cash. Mutates b.
 */
export function buildMonth(b, env) {
  const out = { equityPaid: 0, loanDrawn: 0, interest: 0, progressed: false, stalled: null, completed: false, failedNow: false, delayNow: false, permitNow: false };
  if (b.loan > 0) { const i = Math.round(b.loan * env.rate / 100); b.loan += i; b.interest += i; out.interest = i; } // capitalised
  if (b.phase === 'done') return out;
  if (b.phase === 'permit') { if (env.month >= b.permitAt) { b.phase = 'build'; out.permitNow = true; } else { out.stalled = 'permit'; return out; } }
  if (b.paused) { out.stalled = 'paused'; b.stallMonths++; return out; }
  if (b.delayLeft > 0) { b.delayLeft--; out.stalled = 'delay'; b.stallMonths++; return out; }
  if (!b.delayDone && b.delay > 0 && b.stage === b.delayAt && b.prog === 0) { b.delayDone = true; b.delayLeft = b.delay - 1; out.delayNow = true; out.stalled = 'delay'; b.stallMonths++; return out; }
  if (!b.failed && b.failAt >= 0 && b.stage === b.failAt && b.prog === 0) { b.failed = true; b.delayLeft = Math.max(0, b.failMonths - 1); out.failedNow = true; out.stalled = 'fail'; b.stallMonths++; return out; }
  const need = monthCost(b); const gap = equityGap(b);
  let eq = 0, ln = 0;
  if (gap > 0) { eq = Math.min(need, gap); if (env.cash < eq) { out.stalled = 'equity'; b.stalls++; b.stallMonths++; return out; } }
  ln = need - eq;
  let esc = 0; if (ln > 0 && (b.escrow || 0) > 0) { esc = Math.min(b.escrow, ln); ln -= esc; } // buyers' deposits (escrow) pay before the bank does
  if (b.external) { b.spent += 0; out.progressed = true; } // built and paid by someone else (w8's combination deal): time passes, no money
  else if (ln > 0 && !b.gateOk) { // the loan may not draw: the owner may fund the whole stage himself (selfFund), else it stalls
    if (b.selfFund && env.cash >= need) { eq = need; ln = 0; } else { out.stalled = 'gate'; b.stalls++; b.stallMonths++; return out; } }
  if (b.external) { eq = 0; ln = 0; }
  if (!b.external) { b.equity += eq; b.spent += need; b.loan += ln; b.escrow = (b.escrow || 0) - esc; out.escrowUsed = esc; } out.equityPaid = eq; out.loanDrawn = ln; out.progressed = true;
  b.prog++;
  if (b.prog >= b.stageMonths) { b.prog = 0; b.stage++; if (b.stage >= b.stages) { b.phase = 'done'; out.completed = true; } }
  return out;
}
