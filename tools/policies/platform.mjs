// Sim policies for the `platform` module (w15 מגדלי הענן) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only: E.metrics
// (worldIndicators.platform + the panel's channels / cohorts / actions) and the described investor card (amount, %, the multiple, runway).
//
//   smart / guideTapper   the reference: the panel's suggested actions (each channel at the highest spend whose CAC is ≤ ⅓ of the LTV
//                         planned with the LOW end of the shown retention, while runway ≥ 12; raise a medium round when runway < 12 outside a
//                         winter, a small one in a winter below 9, a medium one in a bubble below 30; cut / bridge when runway < 4–6) and the
//                         investor card's pick (a term sheet when runway < 18 at ≥ 0.95 × market; the buyout only when your part ≥ ₪800M
//                         or in a winter with < 4 months of runway).
//   naive                 believes the growth story: every channel at the top level, takes every term sheet, never cuts.
//   ablations             blitzGrowth (top spend everywhere, never cuts, never raises — burns until the emergency round) · raiseEveryRound (the large round whenever allowed)
//                         · neverRaise (no rounds, no term sheets) · acceptFirstOffer (sells to the first buyout offer).
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const acts = (st) => E.worldActions(st);
  const tap = (st, keep) => { for (const a of acts(st).filter((x) => x.suggested && x.enabled && keep(x))) { if (st.over) break; Z(st, a.id, a.param); } };
  function cardPick(ev, v) {
    const d = ev.data || {}; if (!d.kind) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (d.kind === 'buyout') { if (v.firstOffer) return ['accept']; if (v.noBuyout) return ['decline']; }
    if (d.kind === 'term') { if (v.noRaise) return ['decline']; if (v.allTerms) return ['accept']; }
    const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'decline'];
  }
  function manage(st, v) {
    if (v.noTouch) return;
    const skip = new Set(v.skip || []); if (v.blitz || v.topSpend) skip.add('spend'); if (v.blitz) { skip.add('raise'); skip.add('cut'); skip.add('bridge'); skip.add('debt'); } if (v.noRaise) { skip.add('raise'); skip.add('bridge'); } if (v.raiseL) skip.add('raise');
    tap(st, (a) => !skip.has(a.id));
    if (v.blitz || v.topSpend) for (const a of acts(st).filter((x) => x.id === 'spend' && x.enabled && !acts(st).some((y) => y.id === 'spend' && y.enabled && y.param.split(':')[0] === x.param.split(':')[0] && +y.param.split(':')[1] > +x.param.split(':')[1]))) Z(st, a.id, a.param);

    if (v.raiseL) { const a = acts(st).find((x) => x.id === 'raise' && x.param === 'l' && x.enabled); if (a) Z(st, a.id, a.param); }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return cardPick(ev, v);
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
    blitzGrowth: smartLike({ blitz: true, noRaise: true }),
    raiseEveryRound: smartLike({ raiseL: true, allTerms: true }),
    neverRaise: smartLike({ noRaise: true }),
    acceptFirstOffer: smartLike({ firstOffer: true }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, topSpend: true, allTerms: true, noBuyout: true, skip: ['cut', 'bridge', 'raise'] }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { noRaise: true, noBuyout: true }, founder: { topSpend: true }, diversified: {}, gambler: { blitz: true, allTerms: true } };
  for (const a of Object.keys(ARCH)) {
    const base = POLICIES[a]; if (!base) continue; const v = ARCH[a];
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return cardPick(ev, v); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; manage(st, v); } };
  }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['blitzGrowth', 'raiseEveryRound', 'neverRaise', 'acceptFirstOffer'],
    ablations: ['neverRaise', 'acceptFirstOffer'],
    gates: [
      (of, S, Pc) => { const rs = of('blitzGrowth'); const f = rs.length ? rs.filter((r) => r[9] || (r[13] || 0) > 0).length / rs.length : 0;
        return { id: 'W15-runway', what: 'blitzGrowth runs out of runway (an emergency round or bankrupt) in ≥ 25 % of games', status: f >= 0.25 ? 'met' : 'NOT met', text: `blitzGrowth out of runway ${Pc(f)} (in time ${Pc(inT(S, rs))}) · smart ${Pc(of('smart').filter((r) => (r[13] || 0) > 0).length / Math.max(1, of('smart').length))}` }; },
      (of, S, Pc) => { const rs = of('raiseEveryRound'); const sm = inT(S, of('smart')); const x = inT(S, rs); const st = rs.map((r) => r[14]).filter((v) => v != null); const sst = of('smart').map((r) => r[14]).filter((v) => v != null); const med = (a) => (a.length ? a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)] : null);
        return { id: 'W15-dilute', what: 'raiseEveryRound loses to smart (in time ≥ 5 pp lower) with a smaller final stake', status: x <= sm - 0.05 && (med(st) ?? 1) < (med(sst) ?? 0) ? 'met' : 'NOT met', text: `raiseEveryRound ${Pc(x)} vs smart ${Pc(sm)} · median final stake ${Pc(med(st))} vs ${Pc(med(sst))}` }; },
    ],
  };
  return P;
}
