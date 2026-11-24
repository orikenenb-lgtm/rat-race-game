// Sim policies for the `projects` mechanic (w8 מטרופולין הנדל"ן) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.metrics (worldIndicators.proj + panel: rows, calls, suggestions), the described event and static world data. Module actions go through
// E.worldAction (action code Z), exactly like a player's panel taps.
//
//   smart            the reference (w8 spec): a permit check first; at most 2 open projects; land only with cash for ≈ the equity calls;
//                    the reliable contractor while cash < 1.5 × the next calls; presales to the threshold + 10 % (40 %); partner / pause when
//                    an equity call cannot be met; repays bank loans only above the open equity calls + 3 months of expenses.
//   guideTapper      taps the highlighted option and the panel's suggested (badged) actions between rolls — never the loan buttons.
//   naive            buys every plot it can with the cheap contractor, never presells, never repays.
//   ablations (DESIGN §5.3 G-dom, w8 spec): noPresale · presaleAll · cheapContractorAlways · maxOverlap · maxDebt.

export function make({ E, POLICIES }) {
  const PI = (m) => (m.worldIndicators && m.worldIndicators.proj) || {};
  const panel = (m) => (m.worldIndicators && m.worldIndicators.panel) || { actions: [], rows: [] };
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;

  function manage(st, v) {
    let m = E.metrics(st); const rows = panel(m).rows || [];
    if (!v.noTouch) {
      for (const r of rows) {
        if (r.phase === 'done' || r.noPresale) continue; const id = r.assetId.slice(1);
        const want = v.presale != null ? v.presale : 0.4;
        if (Math.abs(r.target - want) > 1e-9) Z(st, 'presale', `${id}:${Math.round(want * 100)}`);
      }
      for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && x.id !== 'presale')) { if (st.over) break; if (v.noPartner && a.id === 'partner') continue; Z(st, a.id, a.param); }
    }
    m = E.metrics(st); const P = PI(m); const E0 = m.expenses;
    const keep = v.noRunway ? E0 * 2 : E0 * 3 + (P.equityCalls || 0) * 1.2;
    let g = 0; while (!v.noRepay && !st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (st.credit && st.cash > st.credit + E0) E.payCredit(st);
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
    m = E.metrics(st);
    if (!v.noRunway && m.goalProgress >= 0.85) { const want = Math.round(m.expenses * 3.1) - st.savings; if (want > 500 && st.cash - want > (P.equityCalls || 0) + m.expenses) E.moveSavings(st, want); }
  }
  function landPick(st, ev, v) {
    const d = ev.data || {}; const en = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (!d.pk) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (v.land === 'never') return ['pass'];
    if (v.land === 'all') return [en(v.tier || 'cheap') ? (v.tier || 'cheap') : 'pass'];
    if (v.land === 'overlap') { if (en('check') && !d.checked && st.cash >= d.down + d.checkFee) return ['check']; return [(d.margin.reliable > 0 && (d.cashAfter ?? 0) >= 0) ? (en('reliable') ? 'reliable' : 'pass') : 'pass']; }
    if (v.land === 'careful') { if (en('check') && !d.checked) return ['check']; return [d.active < 2 && (d.cashAfter ?? 0) >= 1.0 * (d.nextCalls || 0) && d.margin.reliable > 0 && en('reliable') ? 'reliable' : 'pass']; }
    if (v.land === 'bold') return [d.active < 3 && d.margin.cheap > 0 && (d.cashAfter ?? 0) >= 0.5 * (d.nextCalls || 0) && en('cheap') ? 'cheap' : 'pass'];
    const pr = ev.options.find((o) => o.primary && o.enabled); let id = pr ? pr.id : 'pass';
    if (v.tier && (id === 'reliable' || id === 'cheap') && en(v.tier)) id = v.tier;
    return [id];
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return landPick(st, ev, v);
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
    noPresale: smartLike({ presale: 0 }),
    presaleAll: smartLike({ presale: 1 }),
    cheapContractorAlways: smartLike({ tier: 'cheap' }),
    maxOverlap: smartLike({ land: 'overlap' }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, land: 'all', tier: 'cheap', presale: 0, noTouch: true, noRunway: true, noRepay: true, noPartner: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
      decide(st, ev, ctx) { if (ev.type === 'mech') return landPick(st, ev, { land: ARCH_LAND[a], tier: a === 'gambler' ? 'cheap' : undefined }); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; for (const x of E.worldActions(st).filter((y) => y.suggested && y.enabled)) { if (st.over) break; E.worldAction(st, x.id, x.param); } } };
  }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['noPresale', 'presaleAll', 'cheapContractorAlways', 'maxOverlap'],
    ablations: ['noPresale', 'presaleAll', 'cheapContractorAlways', 'maxOverlap'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')), a = inT(S, of('noPresale')), b = inT(S, of('presaleAll')); return { id: 'W8-presale', what: 'neither presale extreme beats smart', status: a <= sm && b <= sm ? 'met' : 'NOT met', text: `smart ${Pc(sm)} · noPresale ${Pc(a)} · presaleAll ${Pc(b)}` }; },
    ],
  };
  return P;
}
