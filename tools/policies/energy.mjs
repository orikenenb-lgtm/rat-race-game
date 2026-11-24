// Sim policies for the `energy` mechanic (w9 מדבר האנרגיה) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.metrics (worldIndicators.energy + panel: rows, plants, suggestions), the described event and static world data. Module actions go
// through E.worldAction (action code Z), exactly like a player's panel taps.
//
//   smart            the reference (w9 spec): a resource study first; a pipeline of at most 2 open projects; a site only with cash for ≈ 60 % of
//                    the open equity calls; a grid application whenever a project would wait for a slot; solar on a PPA, wind / storage /
//                    hybrid merchant (≈ 60 / 40); refinances a plant when its room is > 30 % of the debt, the rate is at or below its average
//                    and the cash is needed (not near the goal); repays bank loans only above the open equity calls + 3 months of expenses.
//   guideTapper      taps the highlighted option and the panel's suggested (badged) actions between rolls — never the loan buttons.
//   naive            develops every site it can, never studies, never applies for a slot, never refinances, never repays.
//   ablations (DESIGN §5.3 G-dom, w9 spec): allPPA · allMerchant · neverRefi · maxRefi (maximum leverage: every plant re-levered whenever
//                    there is room, at any rate, a pipeline of 4 without a cash cover, bank loans to the cap) · maxDebt.

export function make({ E, POLICIES }) {
  const EI = (m) => (m.worldIndicators && m.worldIndicators.energy) || {};
  const panel = (m) => (m.worldIndicators && m.worldIndicators.panel) || { actions: [], rows: [], plants: [] };
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const want = (r, v) => (v.offtake ? v.offtake : r.tech === 'solar' ? 'ppa' : 'merchant');

  function manage(st, v) {
    let m = E.metrics(st); const pn = panel(m);
    if (!v.noTouch) {
      for (const r of pn.rows || []) { const w = want(r, v); if (r.offtake !== w) Z(st, 'offtake', `${r.assetId.slice(1)}:${w}`); }
      const skip = new Set(['offtake', 'refi']);
      for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && !skip.has(x.id))) { if (st.over) break; if (v.noSlotQueue && a.id === 'applySlot') continue; if (v.noStake && a.id === 'sellStake') continue; Z(st, a.id, a.param); }
      if (v.refi === 'max') { for (const p of (panel(E.metrics(st)).plants || [])) if (p.refiRoom >= 1000000) Z(st, 'refi', p.assetId.slice(1)); }
      else if (v.refi !== 'never') { for (const a of E.worldActions(st).filter((x) => x.id === 'refi' && x.suggested && x.enabled)) { if (st.over) break; Z(st, 'refi', a.param); } }
    }
    m = E.metrics(st); const P = EI(m); const E0 = m.expenses;
    const keep = v.noRunway ? E0 * 2 : E0 * 3 + (P.equityCalls || 0) * 1.1;
    let g = 0; while (!v.noRepay && !st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (st.credit && st.cash > st.credit + E0) E.payCredit(st);
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
    m = E.metrics(st);
    if (!v.noRunway && m.goalProgress >= 0.85) { const w3 = Math.round(m.expenses * 3.1) - st.savings; if (w3 > 500 && st.cash - w3 > (P.equityCalls || 0) + m.expenses) E.moveSavings(st, w3); }
  }
  function sitePick(st, ev, v) {
    const d = ev.data || {}; const en = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (!d.tech) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (v.land === 'never') return ['pass'];
    if (v.land === 'all') return [en('build') ? 'build' : 'pass'];
    const lim = { careful: 1, overlap: 2, bold: 3, wide: 4 }[v.land];
    if (lim) { if (v.land !== 'bold' && en('check') && !d.checked && st.cash >= d.dev + d.checkFee) return ['check']; const cover = { careful: 1, overlap: 0.3, bold: 0.5, wide: 0 }[v.land];
      return [d.active < lim && (d.cashAfter ?? 0) >= cover * (d.nextCalls || 0) && en('build') ? 'build' : 'pass']; }
    const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass'];
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return sitePick(st, ev, v);
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
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
    allPPA: smartLike({ offtake: 'ppa' }),
    allMerchant: smartLike({ offtake: 'merchant' }),
    neverRefi: smartLike({ refi: 'never' }),
    maxRefi: smartLike({ refi: 'max', land: 'wide', maxDebt: true }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, land: 'all', refi: 'never', noTouch: true, noRunway: true, noRepay: true, noSlotQueue: true, noStake: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH_LAND = { saver: 'careful', founder: 'bold', diversified: 'overlap', gambler: 'all' };
  for (const a of ['saver', 'founder', 'diversified', 'gambler']) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return sitePick(st, ev, { land: ARCH_LAND[a] }); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; for (const x of E.worldActions(st).filter((y) => y.suggested && y.enabled)) { if (st.over) break; E.worldAction(st, x.id, x.param); } } };
  }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['allPPA', 'allMerchant', 'neverRefi', 'maxRefi'],
    ablations: ['allPPA', 'allMerchant', 'neverRefi', 'maxRefi'],
    gates: [
      (of, S, Pc) => { const n = inT(S, of('neverRefi')); return { id: 'W9-recycle', what: 'neverRefi reaches the goal in < 40 % (capital recycling is necessary)', status: n < 0.4 ? 'met' : 'NOT met', text: `neverRefi ${Pc(n)} · smart ${Pc(inT(S, of('smart')))}` }; },
      (of, S, Pc) => { const rs = of('maxRefi'); const b = rs.length ? rs.filter((r) => r[9]).length / rs.length : 0; return { id: 'W9-maxRefi', what: 'maxRefi goes bankrupt in ≥ 10 %', status: b >= 0.1 ? 'met' : 'NOT met', text: `maxRefi bankrupt ${Pc(b)} · in time ${Pc(inT(S, rs))}` }; },
    ],
  };
  return P;
}
