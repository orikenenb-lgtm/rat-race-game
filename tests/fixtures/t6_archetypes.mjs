// TEST-ONLY stand-in for the engine lane's archetype module (js/systems/archetypes.js, T6 §2.3 — not landed yet).
// tests/t6_e2e.py copies it into the served test copy so the browser worker pipeline can be exercised end to end.
// It is NOT the real archetypes: trivial, deterministic choices (sim contract: decide(st, ev, ctx) → [id, params]).
export const ARCH_V = 0;
const pick = (ev, ids) => ids.find((id) => ev.options.some((o) => o.id === id && o.enabled));
const mk = (risk) => ({
  quiz: 'smart',
  decide(st, ev) {
    if (ev.type === 'deal') {
      const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled && (risk >= 1 || !o.loanAmount)).sort((x, y) => (y.net || 0) - (x.net || 0))[0];
      return [b && (b.net || 0) > -risk * 200 ? b.id : pick(ev, ['pass', 'ok']) || ev.options.find((o) => o.enabled).id];
    }
    if (ev.type === 'trade') return ['done'];
    const o = ev.options.find((x) => x.primary && x.enabled);
    return [o ? o.id : pick(ev, ['ok', 'done', 'pass', 'skip', 'pay']) || ev.options.find((x) => x.enabled).id];
  },
  between() {},
});
export const ARCHETYPES = { saver: mk(0), founder: mk(1), diversified: mk(0.5), gambler: mk(3) };
