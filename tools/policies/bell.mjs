// Sim policies for the `bell` adapter (w19 פעמון הבורסה) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's actions with their `suggested` flags), the described 'W' card and static world data. Module actions through
// E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the panel's suggested actions (IPO 30 % unless the market is bearish early; realistic guidance, ambitious only when a
//                         growth investment lands inside the quarter; growth capex while net debt stays ≤ 2.6×; buyback in a bear market when
//                         the price is under its peers; a secondary in a bull market when it is over them; repay debt with spare cash).
//   naive                 IPOs at once at 49 %, guides high every quarter, buys back every payday it can, never invests in growth.
//   sandbag / overpromise smart, but guidance always low / always high (W19-guide) · buybackAtTop: smart, plus a buyback every payday in a
//                         bull market (W19-buyback) · issueAlways: smart, plus a secondary every payday.
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  function manage(st, v) {
    const I = (E.metrics(st).worldIndicators || {}).bell || {};
    const has = (id, param) => E.worldActions(st).find((x) => x.id === id && (param === undefined || x.param === param) && x.enabled);
    if (v.ipo && !I.listed && has('ipo', v.ipo)) Z(st, 'ipo', v.ipo);
    if (v.guide && I.listed && I.guide !== v.guide && has('guide', v.guide)) Z(st, 'guide', v.guide);
    if (v.buyTop && I.sector === 'bull' && has('buyback')) Z(st, 'buyback', null);
    if (v.buyAll && has('buyback')) Z(st, 'buyback', null);
    if (v.issue && has('secondary')) Z(st, 'secondary', null);
    for (const a of E.worldActions(st).filter((x) => x.enabled && x.suggested)) {
      if (st.over) break;
      if (v.noMod) break;
      if (v.guide && a.id === 'guide') continue; if (v.ipo && a.id === 'ipo') continue;
      if (v.noGrow && a.id === 'grow') continue;
      Z(st, a.id, a.param);
    }
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (v.buyAllDeals) { const b = ev.options.find((o) => o.id === 'cash' && o.enabled) || ev.options.find((o) => o.id === 'shares' && o.enabled); return [b ? b.id : 'pass']; } const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass']; }
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        const pr = ev.options.find((o) => o.primary && o.enabled); if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st) { if (st.over) return; const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work'); manage(st, v); },
    };
  }
  const tap = (st) => { for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) { if (st.over) break; Z(st, a.id, a.param); } };
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    sandbag: smartLike({ guide: 'low' }), overpromise: smartLike({ guide: 'high' }), buybackAtTop: smartLike({ buyTop: true }), issueAlways: smartLike({ issue: true }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, ipo: '0.49', guide: 'high', buyAll: true, noGrow: true, noMod: true, buyAllDeals: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
    guideTapper: {
      mentor: 'guide', story: 'tapper',
      decide(st, ev, ctx) {
        if (ev.type === 'trade') return ['done'];
        const en = ev.options.filter((x) => x.enabled);
        if ((ev.type === 'payday' || ev.type === 'edu') && ctx.n === 0) { if (ev.data.focus && !ev.data.focus.locked) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); } tap(st); }
        const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)]; return [o.id, o.needsQty ? { qty: 1 } : undefined];
      },
      between(st) { if (!st.over) tap(st); },
    },
  };
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  const ARCH = { saver: { noGrow: true }, founder: { guide: 'high' }, diversified: {}, gambler: { buyAllDeals: true, issue: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['sandbag', 'overpromise', 'buybackAtTop', 'issueAlways'],
    ablations: ['issueAlways'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')); const a = inT(S, of('sandbag')), b = inT(S, of('overpromise'));
        return { id: 'W19-guide', what: 'sandbag and overpromise both lose to smart by ≥ 5 pp in time', status: a <= sm - 0.05 && b <= sm - 0.05 ? 'met' : 'NOT met', text: `sandbag ${Pc(a)} · overpromise ${Pc(b)} vs smart ${Pc(sm)}` }; },
      (of, S, Pc) => { const sm = inT(S, of('smart')); const a = inT(S, of('buybackAtTop'));
        return { id: 'W19-buyback', what: 'buybackAtTop loses to smart by ≥ 5 pp in time', status: a <= sm - 0.05 ? 'met' : 'NOT met', text: `buybackAtTop ${Pc(a)} vs smart ${Pc(sm)}` }; },
    ],
  };
  return P;
}
