// Sim policies for the `capture` adapter (w22 העיר החדשה) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's actions with their `suggested` flags), the described 'W' card and static world data. Module actions through
// E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the panel's suggested plan: services when they lag the city, else the amenity that lifts the held land most per
//                         shekel; bonds while the cover allows; sell plots in zones whose amenities are open (keeping ~30 %); repay bonds
//                         when the cover gets thin; refinance when the rate falls.
//   naive                 sells every plot it can at once, builds nothing, takes every W offer.
//   sellAllEarly          sells everything in the first months, then follows the plan (W22-sequence) · holdAll: the plan, but never sells
//                         a plot (W22-sequence) · noServices: the plan without schools or hospitals (W22-services) · bondMax: the plan + every
//                         bond it can issue (ablation).
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const acts = (st) => E.worldActions(st);
  const SERV = ['school', 'hospital'];
  function manage(st, v) {
    if (st.over) return;
    if (v.sellAll && st.month <= 6) for (const a of acts(st).filter((x) => x.id === 'sell' && x.enabled)) { if (st.over) break; Z(st, a.id, a.param); }
    if (v.dump) { for (const a of acts(st).filter((x) => x.id === 'sell' && x.enabled)) { if (st.over) break; Z(st, a.id, a.param); } }
    else for (let g = 0; g < 12 && !st.over; g++) {
      let a = acts(st).find((x) => x.enabled && x.suggested && !(v.hold && ['sell', 'bundle'].includes(x.id)) && !(v.noServ && x.id === 'build' && SERV.includes(x.amenity)));
      if (!a || Z(st, a.id, a.param).ok === false) break;
    }
    if (v.bondMax) { let k = 0; while (!st.over && k++ < 20) { const a = acts(st).find((x) => x.id === 'bond' && x.enabled); if (!a || Z(st, 'bond', null).ok === false) break; } }
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (v.takeAll) { const t = ev.options.find((o) => o.id === 'take' && o.enabled); return [t ? 'take' : 'pass']; } const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass']; }
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        const pr = ev.options.find((o) => o.primary && o.enabled); if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st) { if (st.over) return; const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work'); manage(st, v); },
    };
  }
  const tap = (st) => { for (let g = 0; g < 12 && !st.over; g++) { const a = acts(st).find((x) => x.suggested && x.enabled); if (!a || Z(st, a.id, a.param).ok === false) break; } };
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    sellAllEarly: smartLike({ sellAll: true }), holdAll: smartLike({ hold: true }), noServices: smartLike({ noServ: true }), bondMax: smartLike({ bondMax: true }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, dump: true, takeAll: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { hold: true, noServ: true }, founder: { sellAll: true }, diversified: {}, gambler: { bondMax: true, takeAll: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  P.__gates = {
    policies: ['sellAllEarly', 'holdAll', 'noServices', 'bondMax'],
    ablations: ['bondMax'],
    gates: [
      (of, S, Pc) => { const sm = S(of('smart')); const a = S(of('sellAllEarly')); const h = S(of('holdAll'));
        return { id: 'W22-sequence', what: 'sellAllEarly and holdAll both lose to smart by ≥ 10 pp in time', status: sm.inTime - a.inTime >= 0.1 && sm.inTime - h.inTime >= 0.1 ? 'met' : 'NOT met', text: `smart ${Pc(sm.inTime)} · sellAllEarly ${Pc(a.inTime)} · holdAll ${Pc(h.inTime)}` }; },
      (of, S, Pc) => { const ns = of('noServices'); const miss = ns.filter((r) => !(r[14] & 1)).length / Math.max(1, ns.length); const left = ns.filter((r) => r[13] > 0).length / Math.max(1, ns.length);
        return { id: 'W22-services', what: 'noServices misses the residents part of the goal at the month limit in ≥ 50 % of games', status: miss >= 0.5 ? 'met' : 'NOT met', text: `noServices residents missed ${Pc(miss)} · months with people leaving in ${Pc(left)} of games` }; },
    ],
  };
  return P;
}
