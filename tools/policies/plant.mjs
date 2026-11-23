// Sim policies for the `plant` mechanic (w6 אזור התעשייה) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.metrics (worldIndicators.plant + panel: rows, suggestions; the public econ gauge), the described event and static world data. Module
// actions go through E.worldAction (action code Z), exactly like a player's panel taps.
//
//   smart            the reference (w6 spec): preventive maintenance on lines with utilisation > 70 % (or a worn line), basic otherwise; a
//                    second shift only when the panel suggests it (a boom / a contract that fills the line); contracts only up to 60 % of
//                    capacity and only when the card's own boom/normal/recession numbers favour them; overhaul a worn line, automation /
//                    solar when they pay back in 3 years; deals by the evaluator's pick; a fixed-cost cushion before repaying bank loans.
//   guideTapper      taps the highlighted option and the panel's suggested (badged) actions between rolls — never the loan buttons.
//   naive            believes the seller, buys whenever it can pay, signs every contract, never touches maintenance or shifts.
//   ablations (DESIGN §5.3 G-dom, w6 spec): runToFailure · preventiveAlways · contractAll · spotOnly · shift3Always · maxDebt.

export function make({ E, POLICIES, ddRule, firstEnabled, ABL }) {
  const PI = (m) => (m.worldIndicators && m.worldIndicators.plant) || {};
  const panel = (m) => (m.worldIndicators && m.worldIndicators.panel) || { actions: [], rows: [] };
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  void ddRule; void ABL;

  function manage(st, v) {
    let m = E.metrics(st); const rows = panel(m).rows;
    const acts = E.worldActions(st);
    for (const r of rows) {
      if (r.pending) continue; const id = r.assetId.slice(1);
      const sm = acts.find((x) => x.id === 'maint' && x.assetId === r.assetId && x.suggested); let maint = sm ? sm.param.split(':')[1] : r.maint === 'run' ? 'basic' : r.maint; // the panel's band rule (preventive once worn or loaded)
      if (v.maint) maint = v.maint;
      if (!v.noTouch && r.maint !== maint) Z(st, 'maint', `${id}:${maint}`);
      if (v.noTouch || r.mothball) continue;
      let shift = r.shift;
      if (v.shift3) shift = 3; else { const s = acts.find((x) => x.id === 'shift' && x.assetId === r.assetId && x.suggested); shift = s ? +s.param.split(':')[1] : r.shift; }
      if (shift !== r.shift) Z(st, 'shift', `${id}:${shift}`);
    }
    if (!v.noTouch) for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && ['overhaul', 'automate', 'solar', 'renegotiate'].includes(x.id))) { if (v.maint === 'run' && a.id === 'overhaul') continue; Z(st, a.id, a.param); }
    m = E.metrics(st); const P = PI(m); const E0 = m.expenses;
    const keep = v.noRunway ? E0 * 2 : E0 * 4 + (P.fixedMonth || 0) * 1.5;
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (st.credit && st.cash > st.credit + E0) E.payCredit(st);
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
    m = E.metrics(st);
    if (m.goalProgress >= 0.85) { const want = Math.round(m.expenses * 3.1) - st.savings; if (want > 500 && st.cash - want > (P.fixedMonth || 0) + m.expenses) E.moveSavings(st, want); }
  }
  function contractPick(st, ev, v) {
    const d = ev.data || {}; if (!d.delta) return [ev.options.find((o) => o.enabled).id];
    if (v.contract === 'all') return [firstEnabled(ev, ['accept', 'decline'])];
    if (v.contract === 'none') return ['decline'];
    const pr = ev.options.find((o) => o.primary && o.enabled);
    if (pr && pr.id === 'accept' && !d.countered && d.counter && d.counter.chance >= 0.6 && ev.options.find((o) => o.id === 'counter')) return ['counter'];
    return [pr ? pr.id : 'decline'];
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return contractPick(st, ev, v);
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; const d = ev.data; const net = o ? o.net + (d.dd && d.dd.level === 0 ? d.dd.claimed.cf - d.dd.expected.cf : 0) : 0; return [o && net > 0 ? o.id : 'pass']; }
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
    runToFailure: smartLike({ maint: 'run' }),
    preventiveAlways: smartLike({ maint: 'preventive' }),
    contractAll: smartLike({ contract: 'all' }),
    spotOnly: smartLike({ contract: 'none' }),
    shift3Always: smartLike({ shift3: true }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, contract: 'all', noTouch: true, noRunway: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
      // the plant panel badges its highlighted actions between rolls (a worn line, a boom shift): the guide player taps them when they appear
      between(st) { if (st.over) return; for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) { if (st.over) break; E.worldAction(st, a.id, a.param); } },
    },
  };
  // f:frugal / f:none keep their focus (sim's focus wrappers read the name); archetypes + the panel's public suggestions (as in w5)
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  for (const a of ['saver', 'founder', 'diversified', 'gambler']) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base, between(st, c) { if (base.between) base.between(st, c); if (st.over) return; for (const x of E.worldActions(st).filter((y) => y.suggested && y.enabled)) { if (st.over) break; E.worldAction(st, x.id, x.param); } } };
  }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['runToFailure', 'preventiveAlways', 'contractAll', 'spotOnly', 'shift3Always'],
    ablations: ['runToFailure', 'preventiveAlways', 'contractAll', 'spotOnly', 'shift3Always'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')), r = inT(S, of('runToFailure')); return { id: 'W6-maint', what: 'runToFailure loses to smart by ≥ 5 pp in time (the lesson is visible in the data)', status: sm - r >= 0.05 ? 'met' : 'NOT met', text: `smart ${Pc(sm)} · runToFailure ${Pc(r)}` }; },
      (of, S, Pc) => { const sm = inT(S, of('smart')); const a = inT(S, of('contractAll')), n = inT(S, of('spotOnly')); return { id: 'W6-contract', what: 'neither contract extreme beats smart', status: a <= sm && n <= sm ? 'met' : 'NOT met', text: `smart ${Pc(sm)} · contractAll ${Pc(a)} · spotOnly ${Pc(n)}` }; },
    ],
  };
  return P;
}
