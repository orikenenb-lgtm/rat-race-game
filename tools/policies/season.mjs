// Sim policies for the `season` mechanic (w5 עיר התיירות) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.publicView / E.metrics (worldIndicators.season + panel), the described event and static world data. Module actions go through
// E.worldAction (action code Z), exactly like a player's panel taps.
//
//   smart            the reference: price plan per season (premium in high season only with rep ≥ 60, budget in low season), core staff,
//                    managers for owner-run places, deals by the expected net AND a winter runway, a winter asset once beach > 70 %,
//                    allotments by the card's own expected difference (or a short runway), the seasonal line in winter and repaid by July.
//   guideTapper      taps the highlighted option and the panel's suggested actions (the guide's price plan) — never the loan buttons.
//   naive            believes the seller's average, buys whenever it can pay, never touches the plan, the line or the staff.
//   ablations of smart (DESIGN §5.3 G-dom, w5 spec): standardAlways · premiumAlways · seasonalStaffAlways · allotAlways · allotNever ·
//                    beachOnly · noLine · noRunway · maxDebt (borrow to the cap between rolls).

export function make({ E, POLICIES, ddRule, facade, firstEnabled, ABL }) {
  const PV = (st, event) => E.publicView(st, { freeze: false, event });
  const SI = (m) => (m.worldIndicators && m.worldIndicators.season) || {};
  const panel = (m) => (m.worldIndicators && m.worldIndicators.panel) || { actions: [], rows: [] };
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const fixedOf = (m) => SI(m).fixedMonth || 0;
  /** The public 12-month strip: the cash the coming weak months will burn (sum of negative months, next k) and the worst month. */
  const burnNext = (m, k = 6) => { const xs = (panel(m).strip || { months: [] }).months.slice(0, k); return xs.reduce((s, x) => s + Math.max(0, -x.cf), 0); };
  const worstMonth = (m) => Math.min(0, ...((panel(m).strip || { months: [] }).months.map((x) => x.cf)));
  const smartBase = POLICIES.smart;

  /** Price plans, staff, managers, renovation, the line, loans — everything a careful hotelier does between rolls. */
  function manage(st, v) {
    let m = E.metrics(st); const rows = panel(m).rows; const S = SI(m);
    for (const r of rows) {
      if (r.locked) continue;
      const id = r.assetId.slice(1);
      let want = { peak: r.rep >= 60 ? 'premium' : 'standard', off: r.profile === 'flat' ? 'standard' : 'budget' };
      if (v.plan === 'standard') want = { peak: 'standard', off: 'standard' };
      if (v.plan === 'premium') want = { peak: 'premium', off: 'premium' };
      if (r.peak !== want.peak || r.off !== want.off) Z(st, 'pricePlan', `${id}:${want.peak}:${want.off}`);
      const staffWant = v.staff === 'seasonal' ? 'seasonal' : 'core';
      if (r.staff !== staffWant) Z(st, 'staff', `${id}:${staffWant}`);
    }
    m = E.metrics(st);
    const fixed = fixedOf(m); const E0 = m.expenses; const burn = burnNext(m);
    // managers (an owner-run place becomes passive income), the renovation, the seasonal line: the panel's own public rules (its suggestions)
    for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && x.id !== 'pricePlan' && x.id !== 'staff')) { if (v.noLine && a.id === 'line') continue; Z(st, a.id, a.param); }
    // bank loans: keep a winter runway (fixed costs) before repaying; borrow to the cap (maxDebt)
    m = E.metrics(st);
    const keep = v.noRunway ? E0 * 1.5 : E0 * 4 + burn * 1.5 + 1000000; // a bank loan (≈ 14 %/yr) is cheaper than a missed season: repay only from real surplus
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 60) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (st.credit && st.cash > st.credit + E0) E.payCredit(st);
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 60) { const r = E.takeLoan(st); if (r.ok === false) break; } }
    // ★★★ needs a 3-month personal fund at the end: build it once the goal is in sight
    m = E.metrics(st);
    if (m.goalProgress >= 0.8) { const want = Math.round(m.expenses * 3.1) - st.savings; if (want > 500 && st.cash - want > burn + m.expenses) E.moveSavings(st, want); }
  }

  /** A deal for an op-asset (or the staff housing) at the public basis: expected net > 0 AND a winter runway after the down payment. */
  function dealPick(st, ev, ctx, v) { const r = dealPick0(st, ev, ctx, v); if (process.env.SEASON_DEBUG) console.log('  pick', ev.title, r[0], dealPick.why || ''); dealPick.why = ''; return r; }
  const why = (w) => { dealPick.why = w; };
  function dealPick0(st, ev, ctx, v) {
    const d = ev.data; const m = E.metrics(st); const fixed = fixedOf(m);
    const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0];
    if (!o) return ['pass'];
    if (ctx.n < 3 && !v.naive) { const ins = ddRule('flagged', PV(st, ev), ev, o.id); const hz = d.rivals && d.rivals.n ? d.rivals.hazardNext || 0 : 0; if (ins && hz < 0.3) return [ins]; }
    const op = d.op || null;
    const beachShare = (() => { const rows = panel(m).rows; const tot = rows.length; return tot ? rows.filter((r) => r.profile === 'beach' || r.profile === 'waterpark').length / tot : 0; })();
    if (v.naive) { const net = o.net + (d.dd && d.dd.level === 0 ? d.dd.claimed.cf - d.dd.expected.cf : 0); return [net > 0 ? o.id : 'pass']; }
    if (o.net <= 0) { why('net'); return ['pass']; }
    if (!v.beachOnly && !v.noRunway && !v.rule) { // the reference: the evaluator's best option on the public numbers (= the hint), plus smart's own flagged-check
      const sc = E.scoreOptions(st, ev).filter((x) => !/^offer:/.test(x.id)).sort((a, b) => b.U - a.U)[0];
      if (sc) { why('U ' + sc.U.toFixed(1)); return [sc.id]; }
    }
    if (v.beachOnly && op && !['beach', 'waterpark'].includes(op.profile)) return ['pass'];
    if (op && op.rep < 50 && !v.beachOnly) { why('rep'); return ['pass']; }                      // premium will not work and guests do not come back
    if (op && op.owner && !v.beachOnly && st.charId !== 'restaurateur') return ['pass']; // an owner-run place is a job, not the goal
    const after = st.cash + (st.savings || 0) - d.down - (d.dd && d.dd.verified ? d.dd.verified.repair || 0 : 0) + (o.loanAmount || 0);
    const runway = v.noRunway ? m.expenses : (d.runwayNeed ?? m.expenses * 2) * 0.8;   // the card's public winter-runway figure
    if (after < runway) { why('runway ' + after + '<' + runway); return ['pass']; }
    // diversification: once most rooms are beach rooms, prefer winter assets (a beach card must be clearly better to pass this)
    if (!v.beachOnly && op && beachShare > 0.7 && ['beach', 'waterpark'].includes(op.profile) && o.net * 12 < d.down * 0.22) { why('beach'); return ['pass']; }
    if (ctx.n === 0 && !ABL.has('noNeg')) { const off = ev.options.find((x) => x.id === 'offer:5' && x.enabled && x.chance >= 0.85); const hz = d.rivals && d.rivals.n ? d.rivals.hazardNext || 0 : 0; if (off && hz < 0.15) return [off.id]; }
    return [o.id];
  }
  function allotPick(st, ev, v) {
    if (v.allot === 'always') return [firstEnabled(ev, ['accept', 'decline'])];
    if (v.allot === 'never') return ['decline'];
    const d = ev.data || {}; if (!d.counter) return [ev.options.find((o) => o.enabled).id];
    if (!d.countered && d.counter.chance >= 0.6 && d.counter.delta > 0 && ev.options.find((o) => o.id === 'counter')) return ['counter'];
    return [d.delta > 0 || (d.runway != null && d.runway < 2.5) ? 'accept' : 'decline'];
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart', // smart reads the evaluator's pick (the guide highlight = the public-data best option) and adds its own management
      decide(st, ev, ctx) {
        if (ev.type === 'mech' && (v.allot || v.naive)) return allotPick(st, ev, v);
        if (ev.type === 'deal' && v.beachOnly && ev.data.op && !['beach', 'waterpark'].includes(ev.data.op.profile)) return ['pass'];
        if (ev.type === 'deal' && (v.noRunway || v.naive)) return dealPick(st, ev, ctx, v);
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'market' && ev.options.some((o) => o.kind === 'sell')) return ['done']; // keep the income (the goal is a year's average)
        const pr = ev.options.find((o) => o.primary && o.enabled);
        if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st, c) {
        if (st.over) return;
        const pv = PV(st); E.setPlan(st, planOf(pv));
        manage(st, v);
        if (!st.over) { const f = PV(st).metrics.focus; if (f && !f.locked) { const want = v.focus || (PV(st).metrics.life.energy >= 50 && (PV(st).metrics.cash + (PV(st).metrics.loanRoom || 0)) > 1500000 ? 'scout' : 'none'); const o = f.options.find((x) => x.id === want); if (o && o.enabled && want !== 'none') E.setFocus(st, want, 0); } }
        void c;
      },
    };
  }
  function planOf(pv) { const L = pv.metrics.life; if (L.energy < 35 || (L.plan === 'rest' && L.energy < 70)) return 'rest'; if (L.happinessBase < 57 && pv.month > 6) return 'rest'; return 'work'; }

  const P = {
    smart: smartLike(),
    adaptive: smartLike(),
    standardAlways: smartLike({ plan: 'standard' }),
    premiumAlways: smartLike({ plan: 'premium' }),
    seasonalStaffAlways: smartLike({ staff: 'seasonal' }),
    allotAlways: smartLike({ allot: 'always' }),
    allotNever: smartLike({ allot: 'never' }),
    beachOnly: smartLike({ beachOnly: true }),
    noLine: smartLike({ noLine: true }),
    noRunway: smartLike({ noRunway: true }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike({ focus: 'frugal' }), 'f:research': smartLike({ focus: 'research' }), 'f:none': smartLike({ focus: 'none' }),
    'beachOnly+maxDebt': smartLike({ beachOnly: true, maxDebt: true, noRunway: true }),
    naive: { ...smartLike({ naive: true, plan: 'standard', noLine: true }), mentor: 'hint', quiz: 'tapper', story: undefined,
      between(st) { if (st.over) return; const pv = PV(st); if (pv.metrics.life.plan !== 'work') E.setPlan(st, 'work'); manage(st, { plan: 'standard', noLine: true, noRunway: true }); } },
    guideTapper: {
      mentor: 'guide', story: 'tapper',
      decide(st, ev, ctx) {
        if (ev.type === 'trade') return ['done'];
        const en = ev.options.filter((x) => x.enabled);
        if ((ev.type === 'payday' || ev.type === 'edu') && ctx.n === 0) {
          if (ev.data.focus && !ev.data.focus.locked) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); }
          for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) E.worldAction(st, a.id, a.param); // the panel's highlighted actions
        }
        const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)];
        return [o.id, o.needsQty ? { qty: 1 } : undefined];
      },
      between() {},
    },
  };
  // A4 archetypes in a module world: the generic archetype (js/systems/archetypes.js via POLICIES) PLUS the panel's public suggestions
  // between rolls (what any player who opens the panel sees highlighted) — without it every archetype ignores the world's core lever and
  // A4 only measures noise among four equally blind players.
  for (const a of ['saver', 'founder', 'diversified', 'gambler']) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base, between(st, c) { if (base.between) base.between(st, c); if (st.over) return; for (const x of E.worldActions(st).filter((y) => y.suggested && y.enabled && y.id !== 'line')) { if (st.over) break; E.worldAction(st, x.id, x.param); } } };
  }
  void facade;
  // the world's own gate extras (w5 spec "Sim policies" + DESIGN §5.3 G-dom ablations)
  P.__gates = {
    policies: ['standardAlways', 'premiumAlways', 'seasonalStaffAlways', 'allotAlways', 'allotNever', 'beachOnly', 'beachOnly+maxDebt', 'noLine'],
    ablations: ['standardAlways', 'allotAlways', 'allotNever'],
    gates: [
      (of, S, P) => { const sm = S(of('smart')).inTime, sa = S(of('standardAlways')).inTime; return { id: 'W5-plan', what: 'smart ≥ standardAlways + 8 pp (the price plan matters)', status: sm >= sa + 0.08 ? 'met' : 'NOT met', text: `smart ${P(sm)} · standardAlways ${P(sa)}` }; },
      (of, S, P) => { const sm = S(of('smart')).inTime; const a = S(of('allotAlways')).inTime, n = S(of('allotNever')).inTime; return { id: 'W5-allot', what: 'neither allotment extreme beats smart', status: a <= sm && n <= sm ? 'met' : 'NOT met', text: `smart ${P(sm)} · allotAlways ${P(a)} · allotNever ${P(n)}` }; },
      (of, S, P) => { const rs = of('beachOnly+maxDebt'); const b = rs.length ? rs.filter((r) => r[9]).length / rs.length : NaN; const lose = rs.length ? rs.filter((r) => !r[5]).length / rs.length : NaN; return { id: 'W5-corr', what: 'beachOnly + maxDebt bankrupt in ≥ 10 % of games (a real correlated-risk loss)', status: b >= 0.10 ? 'met' : 'NOT met', text: `bankrupt ${P(b)} · not in time ${P(lose)}` }; },
    ],
  };
  return P;
}
