// T2 sim helpers shared by tools/sim.mjs (and, later, T6 rivals): decisions from the PUBLIC view only.
// A policy never reads st.* directly: it reads E.publicView(st) (metrics + the described event) plus static world data and the
// js/systems tables. Actions (setFocus, moveSavings, takeLoan…) are applied to the real state by the caller.
import * as E from '../js/engine.js';

const has = (ev, id) => ev.options.find((o) => o.id === id && o.enabled);
export const firstEnabled = (ev, ids) => ids.find((id) => has(ev, id));

/** A read-only, st-shaped facade over a public view, for the legacy heuristics (no sealed field exists on it). */
export function facade(pv) {
  const m = pv.metrics; const wi = m.worldIndicators || {}; const L = m.life;
  return { _m: m, _pv: pv, worldId: pv.worldId, mode: pv.mode, month: pv.month, maxMonths: pv.maxMonths, turn: pv.turn, over: false,
    cash: m.cash, loans: m.loans, credit: m.credit, savings: m.savings,
    world: { rate: wi.rate, usd: wi.usd }, pledges: (m.expenseLines || []).filter((l) => /תרומה חודשית/.test(l.label)),
    life: { energy: L.energy, happiness: L.happinessBase, plan: L.plan, study: { done: L.studyDone } } };
}

/** Expected monthly net of a buy option at the public basis (the engine already prices it so). */
export const expectedNet = (pv, ev, o) => o.net;
/** What the seller CLAIMS the option nets per month (level 0); the inspected / verified number afterwards. */
export function claimedNet(ev, o) {
  const dd = ev.data && ev.data.dd; if (!dd || dd.level > 0) return o.net;
  return o.net + (dd.claimed.cf - dd.expected.cf);
}
const warnFlags = (ev) => (ev.data && ev.data.dd ? ev.data.dd.flags.filter((f) => f.kind === 'warn').length : 0);

/** Median down payment of a world's deals (static data). */
const MED = new Map();
export function medianDown(worldId) {
  if (!MED.has(worldId)) { const xs = (E.getWorld(worldId).deals || []).filter((c) => c.down != null && !c.tk && !c.crypto).map((c) => c.down).sort((a, b) => a - b); MED.set(worldId, xs.length ? xs[Math.floor(xs.length / 2)] : 0); }
  return MED.get(worldId);
}
/** §13.3 adaptiveFocus — the order the spec fixes. */
export function adaptiveFocus(pv, energy = pv.metrics.life.energy) {
  const m = pv.metrics; const f = m.focus; if (!f) return 'none';
  const ok = (id) => (f.options.find((o) => o.id === id) || {}).enabled;
  const left = pv.maxMonths - pv.month;
  if (energy < 45) return 'none';
  if (m.credit > 0 && ok('debt')) return 'debt';
  if ((m.businesses || []).some((b) => b.canDecide) && ok('ops')) return 'ops';
  if (ok('frugal') && ((m.expenseLines || []).some((l) => /\(מנוי\)/.test(l.label)) || (m.life.happinessBase >= 64 && left >= 18))) return 'frugal';
  if (m.cash + (m.loanRoom || 0) >= medianDown(pv.worldId) && ok('scout')) return 'scout';
  if (m.econ && m.econ.labelChangedAt != null && pv.month - m.econ.labelChangedAt <= 2 && ok('research')) return 'research';
  return 'none';
}
/** Apply a focus rule between rolls: activate this month if still open, keep the 2-slot agenda filled. */
export function runFocus(st, rule) {
  const pv = E.publicView(st, { freeze: false }); const f = pv.metrics.focus; if (!f) return;
  const pick = (energy) => (rule === 'adaptive' ? adaptiveFocus(pv, energy) : rule);
  if (!f.locked) { const id = pick(pv.metrics.life.energy); const o = f.options.find((x) => x.id === id); if (o && o.enabled) E.setFocus(st, id, 0); else if (rule !== 'adaptive' && rule !== 'none') { /* fixed rule unavailable: leave the month open */ } }
  if (st.over) return;
  const proj = Math.min(100, pv.metrics.life.energy + 4);
  for (const slot of [1, 2]) { const id = pick(proj); if ((f.agenda[slot - 1] || {}).id !== (id === 'none' ? null : id)) E.setFocus(st, id, slot); }
}

/** §13.2 DD rules. → an inspect option id to take now, or null. buyId = the buy option the policy is about to take. */
export function ddRule(rule, pv, ev, buyId) {
  const dd = ev.data && ev.data.dd; if (!dd || rule === 'never') return null;
  const o = ev.options.find((x) => x.id === buyId) || ev.options.find((x) => x.kind === 'buy' && x.enabled); if (!o) return null;
  const E0 = Math.max(1, pv.metrics.expenses);
  const i1 = has(ev, 'inspect:1'), i2 = has(ev, 'inspect:2');
  if (rule === 'always') return i1 ? 'inspect:1' : i2 ? 'inspect:2' : null;
  const straddle = dd.level === 1 && dd.range && (dd.range.cf[0] - o.loanMonthly) < 0 && (dd.range.cf[1] - o.loanMonthly) > 0;
  if (rule === 'flagged') {
    if (dd.level === 0 && i1 && warnFlags(ev) >= 1 && claimedNet(ev, o) > 0) return 'inspect:1';
    if (straddle && i2) return 'inspect:2';
    return null;
  }
  if (rule === 'borderline') {
    if (dd.level === 0 && i1 && o.net > 0 && o.net < 0.3 * E0) return 'inspect:1';
    if (straddle && i2) return 'inspect:2';
  }
  return null;
}
