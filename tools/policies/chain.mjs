// Sim policies for the `chain` mechanic (w7 רשתות המסחר) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.metrics (worldIndicators.chain + panel: rows, suggestions), the described event and static world data. Module actions go through
// E.worldAction (action code Z), exactly like a player's panel taps.
//
//   smart            the reference (w7 spec): survey every site before opening; open own branches only with ≥ 6 months of the chain's fixed
//                    costs left after the opening and inside the managers' span (+1); a regional manager when the span is (nearly) full;
//                    1.5 months of stock cover (2 before a holiday); close a mature branch that loses money; repays bank loans only above a
//                    4-month fixed-cost cushion; near the goal it keeps 4.5 months of fixed costs in cash.
//   guideTapper      taps the highlighted option and the panel's suggested (badged) actions between rolls — never the loan buttons.
//   naive            opens every site it can (no survey), never hires, never changes the stock rule, never repays.
//   ablations (DESIGN §5.3 G-dom, w7 spec): openEveryBranch · neverExpand · franchiseAll · noManagers · maxDebt.

export function make({ E, POLICIES }) {
  const CI = (m) => (m.worldIndicators && m.worldIndicators.chain) || {};
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;

  function manage(st, v) {
    let m = E.metrics(st);
    if (!v.noTouch) {
      for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) {
        if (st.over) break;
        if (a.id === 'hire' && v.noManagers) continue;
        if (a.id === 'convert' && v.noConvert) continue;
        Z(st, a.id, a.param);
      }
    }
    m = E.metrics(st); const C = CI(m); const E0 = m.expenses; const F = C.fixedMonth || 0;
    const near = m.goalParts && m.goalParts[0] && m.goalParts[0].progress >= 0.8;
    const keep = v.noRunway ? E0 * 2 : E0 * 3 + F * (near ? 5 : 4);
    let g = 0; while (!v.noRepay && !st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (st.credit && st.cash > st.credit + E0) E.payCredit(st);
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
    if (v.franchiseAll && !C.franSys) { const a = E.worldActions(st).find((x) => x.id === 'franSys' && x.enabled); if (a) Z(st, 'franSys'); }
    m = E.metrics(st);
    if (!v.noRunway && m.goalProgress >= 0.85) { const want = Math.round(m.expenses * 3.1) - st.savings; if (want > 500 && st.cash - want > F * 4.5 + m.expenses) E.moveSavings(st, want); }
  }
  function sitePick(st, ev, v) {
    const d = ev.data || {}; const en = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (!d.site) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (v.site === 'never') return ['pass'];
    if (v.site === 'franchise') return [en('franchise') ? 'franchise' : 'pass'];
    if (v.site === 'all') return [en('own') ? 'own' : 'pass'];
    if (v.site === 'gamble') { if (en('survey') && !d.surveyed && (d.runwayAfter ?? 0) >= 2) return ['survey']; return [en('own') && (d.expected || 0) > 0 && (d.runwayAfter ?? 0) >= 2 ? 'own' : 'pass']; }
    if (v.site === 'careful') { if (en('survey') && !d.surveyed) return ['survey']; return [en('own') && d.worst > 0 && (d.runwayAfter ?? 0) >= 9 && d.spanLeft >= 0 ? 'own' : 'pass']; }
    if (v.site === 'mix') { if (en('survey') && !d.surveyed) return ['survey']; if (en('franchise') && (d.worst || 0) <= 0) return ['franchise']; return [en('own') && (d.expected || 0) > 0 && (d.runwayAfter ?? 0) >= 4 ? 'own' : en('franchise') ? 'franchise' : 'pass']; }
    const pr = ev.options.find((o) => o.primary && o.enabled);
    if (v.noManagers && pr && pr.id === 'own' && d.spanLeft < 0) return ['pass'];
    return [pr ? pr.id : 'pass'];
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return sitePick(st, ev, v);
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net > 0 ? o.id : 'pass']; }
        if (ev.type === 'market' && ev.options.some((o) => o.kind === 'sell')) return ['done'];
        const pr = ev.options.find((o) => o.primary && o.enabled);
        if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st, c) {
        if (st.over) return;
        const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work');
        manage(st, v);
        void c;
      },
    };
  }
  const P = {
    smart: smartLike(),
    adaptive: smartLike(),
    openEveryBranch: smartLike({ site: 'all' }),
    neverExpand: smartLike({ site: 'never' }),
    franchiseAll: smartLike({ site: 'franchise', noConvert: true }),
    noManagers: smartLike({ noManagers: true }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, site: 'all', noTouch: true, noRunway: true, noRepay: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
    guideTapper: {
      mentor: 'guide', story: 'tapper',
      decide(st, ev, ctx) {
        if (ev.type === 'trade') return ['done'];
        const en = ev.options.filter((x) => x.enabled);
        if ((ev.type === 'payday' || ev.type === 'edu') && ctx.n === 0) {
          if (ev.data.focus && !ev.data.focus.locked) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); }
          for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) E.worldAction(st, a.id, a.param);
        }
        const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)];
        return [o.id, o.needsQty ? { qty: 1 } : undefined];
      },
      between(st) { if (st.over) return; for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) { if (st.over) break; E.worldAction(st, a.id, a.param); } },
    },
  };
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  // archetypes: their own style on the site tile (saver careful, founder bold, diversified mixes own and franchise, gambler opens anything
  // that claims a profit) + the panel's public suggestions between rolls (as in w5 / w6)
  const ARCH_SITE = { saver: 'careful', founder: 'gamble', diversified: 'mix', gambler: 'all' };
  for (const a of ['saver', 'founder', 'diversified', 'gambler']) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return sitePick(st, ev, { site: ARCH_SITE[a] }); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; for (const x of E.worldActions(st).filter((y) => y.suggested && y.enabled)) { if (st.over) break; E.worldAction(st, x.id, x.param); } } };
  }
  const inT = (S, rs) => S(rs).inTime;
  const bankruptProfit = (rs) => rs.filter((r) => r[9]).length;
  P.__gates = {
    policies: ['openEveryBranch', 'neverExpand', 'franchiseAll', 'noManagers'],
    ablations: ['openEveryBranch', 'neverExpand', 'franchiseAll', 'noManagers'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')), o = inT(S, of('openEveryBranch')), n = inT(S, of('neverExpand')); return { id: 'W7-growth', what: 'neither growth extreme (openEveryBranch / neverExpand) beats smart', status: o <= sm && n <= sm ? 'met' : 'NOT met', text: `smart ${Pc(sm)} · openEveryBranch ${Pc(o)} · neverExpand ${Pc(n)}` }; },
      (of, S, Pc) => { const rs = of('openEveryBranch'); const b = bankruptProfit(rs) / Math.max(1, rs.length); const nv = of('naive'); const bn = bankruptProfit(nv) / Math.max(1, nv.length); return { id: 'W7-cash', what: 'openEveryBranch (or naive, who also opens everything) goes bankrupt in ≥ 15 % — growth eats cash', status: Math.max(b, bn) >= 0.15 ? 'met' : 'NOT met', text: `openEveryBranch bankrupt ${Pc(b)} · naive bankrupt ${Pc(bn)}` }; },
    ],
  };
  return P;
}
