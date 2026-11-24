// Goal registry (worlds wave 0, DESIGN §4.3). Pure; no engine import (the engine passes ctx).
//
// The four legacy goal types (passive, netWorth, netWorthImpact, benchmark) are still evaluated by engine.js exactly as before
// (byte-identical w1–w4 / h); every NEW goal type lives here as {onPayday?, met, progress, parts, text}. The engine calls
// GOALS[type] only when the world's goal type is registered here.
//
// ctx = { goalPassive(st) → ₪ this month's goal-counted passive income, netWorth(st) → ₪, fmt(n) → card money text, mod(st, key) → a module value }

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** passive12 — the average of the last `window` (12) payday values of goal-passive income ≥ target. Missing months count as 0,
 *  so the goal needs at least `window` paydays of history: one summer cannot win (and an emptied till cannot either, E1 B2). */
const passive12 = {
  ring(st) { const W = st.world || (st.world = {}); if (!Array.isArray(W.pas12)) W.pas12 = []; return W.pas12; },
  onPayday(st, g, value) {
    const r = passive12.ring(st); r.push(Math.round(value));
    const n = g.window || 12; while (r.length > n) r.shift();
  },
  avg(st, g) { const r = passive12.ring(st); const n = g.window || 12; let s = 0; for (const x of r) s += x; return Math.round(s / n); },
  met(st, g) { return passive12.avg(st, g) >= g.target; },
  progress(st, g) { const a = passive12.avg(st, g); return a >= g.target ? 1 : clamp(0.05 + 0.95 * a / g.target, 0, 0.999); },
  parts(st, g, ctx) {
    const a = passive12.avg(st, g); const r = passive12.ring(st); const n = g.window || 12;
    const now = ctx.goalPassive(st);
    return [{ key: 'passive12', label: `ממוצע ${n} החודשים האחרונים: הכנסה מהנכסים`, value: a, target: g.target, progress: clamp(a / g.target, 0, 1),
      months: r.length, window: n, now, ring: r.slice(),
      note: r.length < n ? `נספרו ${r.length} מתוך ${n} חודשים — חודש שעוד לא היה נספר כאפס` : null }];
  },
  text(st, g, ctx) { return `ממוצע ${g.window || 12} חודשים ${ctx.fmt(passive12.avg(st, g))} מתוך ${ctx.fmt(g.target)} בחודש`; },
};

/** modValue — a world module's own number (operating income, liquidity months …) ≥ target. g = {type, key, target, label}. */
const modValue = {
  met(st, g, ctx) { return ctx.mod(st, g.key) >= g.target; },
  progress(st, g, ctx) { const v = ctx.mod(st, g.key); return v >= g.target ? 1 : clamp(0.05 + 0.95 * v / g.target, 0, 0.999); },
  parts(st, g, ctx) { const v = ctx.mod(st, g.key); return [{ key: g.key, label: g.label || g.key, value: v, target: g.target, progress: clamp(v / g.target, 0, 1) }]; },
  text(st, g, ctx) { return `${g.label || g.key} ${ctx.fmt(ctx.mod(st, g.key))} מתוך ${ctx.fmt(g.target)}`; },
};

/** passiveTarget — the module's operating income (goalValue(st, g.key), default 'opIncome': w9's plant income after debt service) ≥ target.
 *  g = {type, key?, target, label?}. */
const passiveTarget = {
  key: (g) => g.key || 'opIncome',
  met(st, g, ctx) { return ctx.mod(st, passiveTarget.key(g)) >= g.target; },
  progress(st, g, ctx) { const v = ctx.mod(st, passiveTarget.key(g)); return v >= g.target ? 1 : clamp(0.05 + 0.95 * v / g.target, 0, 0.999); },
  parts(st, g, ctx) { const v = ctx.mod(st, passiveTarget.key(g)); return [{ key: passiveTarget.key(g), label: g.label || 'הכנסה תפעולית אחרי החזר חוב', value: v, target: g.target, progress: clamp(v / g.target, 0, 1) }]; },
  text(st, g, ctx) { return `${g.label || 'הכנסה תפעולית'} ${ctx.fmt(ctx.mod(st, passiveTarget.key(g)))} מתוך ${ctx.fmt(g.target)} בחודש`; },
};

/** nw — net worth ≥ target (a registered twin of the legacy netWorth type, for composite goals; module goalValue assets count as the engine
 *  values them). g = {type:'nw', target}. */
const nw = {
  met(st, g, ctx) { return ctx.netWorth(st) >= g.target; },
  progress(st, g, ctx) { const v = ctx.netWorth(st); return v >= g.target ? 1 : clamp(0.1 + 0.9 * v / g.target, 0, 0.999); },
  parts(st, g, ctx) { const v = ctx.netWorth(st); return [{ key: 'netWorth', label: 'שווי נקי', value: v, target: g.target, progress: clamp(v / g.target, 0, 1) }]; },
  text(st, g, ctx) { return `שווי נקי ${ctx.fmt(ctx.netWorth(st))} מתוך ${ctx.fmt(g.target)}`; },
};
/** liquidity — (cash + savings + liquid holdings) ÷ the module's monthly fixed costs ≥ months. The module reports the months as
 *  goalValue(st, 'liqMonths') (2 decimals; 99 when there are no fixed costs). g = {type:'liquidity', months, label?}. */
const liquidity = {
  met(st, g, ctx) { return ctx.mod(st, 'liqMonths') >= g.months; },
  progress(st, g, ctx) { const v = ctx.mod(st, 'liqMonths'); return v >= g.months ? 1 : clamp(0.05 + 0.95 * v / g.months, 0, 0.999); },
  parts(st, g, ctx) { const v = ctx.mod(st, 'liqMonths'); return [{ key: 'liquidity', unit: 'months', label: g.label || 'נזילות (חודשי עלויות קבועות)', value: Math.min(v, 99), target: g.months, progress: clamp(v / g.months, 0, 1), liquid: ctx.mod(st, 'liquid'), fixedMonth: ctx.mod(st, 'fixedMonth') }]; },
  text(st, g, ctx) { const v = ctx.mod(st, 'liqMonths'); return `נזילות ${v >= 99 ? 'מלאה' : (Math.floor(v * 10) / 10) + ' חודשים'} מתוך ${g.months}`; },
};

/** all — every sub-goal met; progress = the minimum part (composite goals of later worlds). Sub-goals must be registered types. */
const all = {
  onPayday(st, g, value, ctx) { for (const s of g.of) { const T = GOALS[s.type]; if (T && T.onPayday) T.onPayday(st, s, value, ctx); } },
  met(st, g, ctx) { return g.of.every((s) => GOALS[s.type].met(st, s, ctx)); },
  progress(st, g, ctx) { return Math.min(...g.of.map((s) => GOALS[s.type].progress(st, s, ctx))); },
  parts(st, g, ctx) { return g.of.flatMap((s) => GOALS[s.type].parts(st, s, ctx)); },
  text(st, g, ctx) { return g.of.map((s) => GOALS[s.type].text(st, s, ctx)).join(' · '); },
};

export const GOALS = { passive12, modValue, passiveTarget, nw, liquidity, all };
/** Legacy types the engine evaluates itself (kept for the validator). */
export const LEGACY_GOALS = ['passive', 'netWorth', 'netWorthImpact', 'benchmark'];
export function goalType(g) { return g && GOALS[g.type] ? GOALS[g.type] : null; }
