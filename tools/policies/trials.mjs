// Sim policies for the `trials` adapter (w17 גבעת המעבדות) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's actions with their `suggested` flags and public EVs), the described 'V' card and static world data. Module
// actions through E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the panel's suggested actions (at a readout: continue / license / stop by the public risk-adjusted value; discover
//                         while the pipeline is thin; a plant with ≥ 2 own drugs; sell a royalty only when cash is negative); the V card's
//                         guide pick (due diligence first, buy when the value after the check beats the price).
//   naive                 buys every candidate it can pay for and continues every program (never stops, never licenses).
//   neverAbandon          smart, but at every readout it continues (W17-stop) · abandonAll: stops every program at its readout ·
//   licenseAll            licenses every program at its readout · noPipeline: smart without new candidates (no discovery, no purchases; W17-cliff).
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  function manage(st, v) {
    const acts = E.worldActions(st).filter((x) => x.enabled);
    const at = new Set();
    for (const a of acts) {
      if (st.over) break; if (a.param != null && at.has(a.param) && ['go', 'license', 'stop', 'partner'].includes(a.id)) continue;
      if (v.mode && ['go', 'license', 'stop'].includes(a.id)) { if (a.id === v.mode) { Z(st, a.id, a.param); at.add(a.param); } continue; }
      if (v.noNew && a.id === 'discover') continue;
      if (v.safe && a.id === 'go' && a.suggested && a.ev < a.cost * 0.5) { const l = acts.find((x) => x.id === 'license' && x.param === a.param && x.enabled); if (l) { Z(st, 'license', a.param); at.add(a.param); continue; } }
      if (a.suggested || (v.goAll && a.id === 'go') || (v.disc && a.id === 'discover')) { if (v.goAll && ['license', 'stop'].includes(a.id)) continue; Z(st, a.id, a.param); if (a.param != null) at.add(a.param); }
    }
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (v.noNew) return ['pass']; if (v.buyAll) { const b = ev.options.find((o) => o.id === 'buy' && o.enabled); return [b ? 'buy' : 'pass']; } const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass']; }
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
    neverAbandon: smartLike({ mode: 'go' }), abandonAll: smartLike({ mode: 'stop' }), licenseAll: smartLike({ mode: 'license' }), noPipeline: smartLike({ noNew: true }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, mode: 'go', buyAll: true, disc: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { safe: true }, founder: { goAll: true }, diversified: {}, gambler: { goAll: true, buyAll: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['neverAbandon', 'abandonAll', 'licenseAll', 'noPipeline'],
    ablations: ['neverAbandon', 'licenseAll'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')); const na = inT(S, of('neverAbandon')), ab = inT(S, of('abandonAll')), li = inT(S, of('licenseAll'));
        const ok = na <= sm - 0.08 && ab <= sm - 0.05 && li <= sm - 0.05; return { id: 'W17-stop', what: 'neverAbandon loses ≥ 8 pp; abandonAll and licenseAll lose ≥ 5 pp', status: ok ? 'met' : 'NOT met', text: `smart ${Pc(sm)} · neverAbandon ${Pc(na)} · abandonAll ${Pc(ab)} · licenseAll ${Pc(li)}` }; },
      (of, S, Pc) => { const w = of('noPipeline').filter((r) => r[4] && r[10] != null); const fail = w.length ? w.filter((r) => !r[10]).length / w.length : NaN; const sw = of('smart').filter((r) => r[4] && r[10] != null); const sf = sw.length ? sw.filter((r) => !r[10]).length / sw.length : NaN;
        return { id: 'W17-cliff', what: 'noPipeline winners fail the goal 24 months later (G-durable) in ≥ 40 %', status: fail >= 0.4 ? 'met' : 'NOT met', text: `noPipeline winners ${w.length}: ${Pc(fail)} fail 24 months on · smart winners ${Pc(sf)} fail · noPipeline in time ${Pc(inT(S, of('noPipeline')))}` }; },
    ],
  };
  return P;
}
