// Sim policies for the `multinational` module (w11 התאגיד הבינלאומי) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.metrics (worldIndicators.multinational + the panel's rows / table / actions) and the described acquisition card (ranges, price, fair
// range, budget). Module actions go through E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the reference: the panel's suggested actions (self-run the biggest subsidiaries while attention is free, audit a
//                         manager not audited for 12 months, replace a manager known to be weak or dishonest, a second source where a
//                         supplier country carries ≥ 2 subsidiaries, hedge a currency ≥ 25 % of profit, the ERP / hub / HQ when they pay)
//                         and the acquisition card's guide pick (due diligence first; buy only when the fair value at the LOW end of the
//                         range covers the price, within the budget).
//   naive                 believes the seller: buys every acquisition it can pay for without checking, never audits, never hedges.
//   ablations             selfRunAll (self-runs whenever attention is free, never hires or audits) · delegateAllNoAudit (never self-runs,
//                         never audits; hires the candidate when a subsidiary has no manager) · auditEverything (audits every managed
//                         subsidiary every month) · noHedge (never hedges).
export function make({ E, POLICIES }) {
  const MI = (m) => (m.worldIndicators && m.worldIndicators.multinational) || {};
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const tap = (st, keep) => { for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && keep(x))) { if (st.over) break; Z(st, a.id, a.param); } };
  function acqPick(ev, v) {
    const d = ev.data || {}; const en = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (d.price == null) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (v.acq === 'never') return ['pass'];
    if (v.acq === 'always') return [en('buy') ? 'buy' : 'pass'];
    if (v.acq === 'blind') return [en('buy') && !en('buy').loanAmount && d.price <= d.budget ? 'buy' : 'pass'];
    const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass'];
  }
  function manage(st, v) {
    if (v.noTouch) return;
    const skip = new Set(v.skip || []);
    tap(st, (a) => !skip.has(a.id));
    if (v.selfAll && !st.over) { for (const a of E.worldActions(st).filter((x) => x.id === 'self' && x.enabled)) { if (st.over) break; Z(st, a.id, a.param); } }
    if (v.delegate && !st.over) { const rows = (E.metrics(st).worldIndicators.panel || {}).rows || []; for (const r of rows) if (!r.self && !r.mgr) { const a = E.worldActions(st).find((x) => x.id === 'hire' && x.param === r.sid && x.enabled); if (a) Z(st, a.id, a.param); } }
    if (v.auditAll && !st.over) { for (const a of E.worldActions(st).filter((x) => x.id === 'audit' && x.enabled)) { if (st.over) break; Z(st, a.id, a.param); } }
    const m = E.metrics(st);
    if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; const keep = 3 * ((MI(m).fixedMonth || 0) + 1000000);
    while (!v.noRepay && !st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return acqPick(ev, v);
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        const pr = ev.options.find((o) => o.primary && o.enabled);
        if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st, c) {
        if (st.over) return;
        const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work');
        manage(st, v); void c;
      },
    };
  }
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    selfRunAll: smartLike({ skip: ['hire', 'audit'], selfAll: true }),
    delegateAllNoAudit: smartLike({ skip: ['self', 'audit'], delegate: true }),
    auditEverything: smartLike({ auditAll: true }),
    noHedge: smartLike({ skip: ['hedge'] }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, acq: 'always', noTouch: true, noRepay: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
    guideTapper: {
      mentor: 'guide', story: 'tapper',
      decide(st, ev, ctx) {
        if (ev.type === 'trade') return ['done'];
        const en = ev.options.filter((x) => x.enabled);
        if ((ev.type === 'payday' || ev.type === 'edu') && ctx.n === 0) {
          if (ev.data.focus && !ev.data.focus.locked) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); }
          tap(st, () => true);
        }
        const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)];
        return [o.id, o.needsQty ? { qty: 1 } : undefined];
      },
      between(st) { if (!st.over) tap(st, () => true); },
    },
  };
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  const ARCH = { saver: 'never', founder: 'blind', diversified: 'guide', gambler: 'always' };
  for (const a of Object.keys(ARCH)) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return acqPick(ev, { acq: ARCH[a] }); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; tap(st, (x) => !(a === 'saver' && ['hq', 'hub', 'erp'].includes(x.id)) && !(a === 'gambler' && x.id === 'audit')); } };
  }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['selfRunAll', 'delegateAllNoAudit', 'auditEverything', 'noHedge'],
    ablations: ['selfRunAll', 'delegateAllNoAudit', 'auditEverything', 'noHedge'],
    gates: [
      (of, S, Pc) => { const rs = of('delegateAllNoAudit'); const f = rs.length ? rs.filter((r) => (r[13] || 0) >= 1).length / rs.length : 0; const sm = of('smart'); const fs = sm.length ? sm.filter((r) => (r[13] || 0) >= 1).length / sm.length : 0;
        return { id: 'W11-fraud', what: 'delegateAllNoAudit suffers ≥ 1 fraud in ≥ 40 % of games', status: f >= 0.4 ? 'met' : 'NOT met', text: `delegateAllNoAudit ≥ 1 fraud in ${Pc(f)} (in time ${Pc(inT(S, rs))}) · smart ${Pc(fs)} (in time ${Pc(inT(S, sm))})` }; },
    ],
  };
  return P;
}
