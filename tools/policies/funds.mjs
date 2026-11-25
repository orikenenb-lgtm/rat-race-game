// Sim policies for the `funds` adapter (w20 רחוב הקרנות) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's actions with their `suggested` flags and public research bands), the described 'W' card and static world data.
// Module actions through E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the panel's suggested book (long the 5 best research signals, short the 2 worst that are not crowded; smaller in a
//                         bear market, no shorts in a crash), the index product once, own money into the fund, never a gate.
//   naive                 chases last month's winners (long the 5 best last returns), shorts the most crowded names, gates every outflow,
//                         takes every mandate unlocked.
//   benchmarkHug          smart's side actions, but the book always hugs the index (W20-flow) · maxActive: long the 3 best signals at 30 %,
//                         short the 3 worst at 15 % whatever the crowding or the regime (W20-flow) · shortHeavy: smart's longs + 50 % short in
//                         the most crowded weak names (W20-short) · gateEarly: smart + a gate at every redemption notice (ablation).
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const I = (st) => (E.metrics(st).worldIndicators || {}).funds || {};
  const acts = (st) => E.worldActions(st);
  /** Move the book toward target weights t[coKey] (5 % steps; sells first so the long cap never blocks). */
  function toward(st, t) {
    for (let g = 0; g < 60 && !st.over; g++) {
      const L = acts(st); const rows = L.filter((a) => a.id === 'buy' || a.id === 'sell');
      const s = rows.find((a) => a.id === 'sell' && a.enabled && a.w > (t[a.co] ?? 0) + 0.001) || rows.find((a) => a.id === 'buy' && a.enabled && a.w < (t[a.co] ?? 0) - 0.001);
      if (!s || Z(st, s.id, s.param).ok === false) break;
    }
  }
  const book = (st) => { const t = {}; for (const a of acts(st)) if (a.id === 'buy') t[a.co] = a.target; return t; };
  function manage(st, v) {
    if (st.over) return; const fi = I(st);
    if (v.hug) { if (acts(st).find((a) => a.id === 'hug' && a.enabled)) Z(st, 'hug', null); }
    else if (v.book) toward(st, v.book(st)); else toward(st, book(st));
    for (const a of acts(st).filter((x) => x.enabled && x.suggested && !['buy', 'sell', 'close'].includes(x.id))) { if (st.over) break; if (v.noSide) break; Z(st, a.id, a.param); }
    if (v.gate && fi.pending > (v.gateAt || 0) * fi.clients && acts(st).find((a) => a.id === 'gate' && a.enabled)) Z(st, 'gate', null);
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  const sig = (a) => (a.signal.lo + a.signal.hi) / 2;
  const rows = (st) => acts(st).filter((a) => a.id === 'buy');
  const BOOKS = {
    naive(st) { const R = rows(st); const t = {}; R.slice().sort((a, b) => b.last - a.last).slice(0, 5).forEach((a) => { t[a.co] = 0.2; });
      R.filter((a) => !t[a.co]).sort((a, b) => b.crowd - a.crowd).slice(0, 2).forEach((a) => { t[a.co] = I(st).shortBan ? 0 : -0.15; }); return t; },
    maxActive(st) { const R = rows(st).slice().sort((a, b) => sig(b) - sig(a)); const t = {}; R.slice(0, 3).forEach((a) => { t[a.co] = 0.3; }); R.slice(-3).forEach((a) => { t[a.co] = I(st).shortBan ? 0 : -0.15; }); return t; },
    shortHeavy(st) { const t = book(st); for (const k of Object.keys(t)) if (t[k] < 0) t[k] = 0; const R = rows(st).filter((a) => !(t[a.co] > 0)).sort((a, b) => (b.crowd - sig(b) * 30) - (a.crowd - sig(a) * 30));
      let left = 0.5; for (const a of R) { if (left < 0.05 || I(st).shortBan) break; const w = Math.min(0.3, left); t[a.co] = -w; left = Math.round((left - w) * 100) / 100; } return t; },
  };
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (v.takeAll) return ['take']; const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass']; }
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        const pr = ev.options.find((o) => o.primary && o.enabled); if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st) { if (st.over) return; const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work'); manage(st, v); },
    };
  }
  const tap = (st) => { for (let g = 0; g < 60 && !st.over; g++) { const a = acts(st).find((x) => x.suggested && x.enabled); if (!a || Z(st, a.id, a.param).ok === false) break; } };
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    benchmarkHug: smartLike({ hug: true }), maxActive: smartLike({ book: BOOKS.maxActive }), shortHeavy: smartLike({ book: BOOKS.shortHeavy }), gateEarly: smartLike({ gate: true, gateAt: 0 }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, book: BOOKS.naive, gate: true, gateAt: 0.03, takeAll: true, noSide: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { hug: true }, founder: { book: BOOKS.maxActive }, diversified: {}, gambler: { book: BOOKS.shortHeavy, takeAll: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  const of2 = (of, p) => of(p);
  P.__gates = {
    policies: ['benchmarkHug', 'maxActive', 'shortHeavy', 'gateEarly'],
    ablations: ['gateEarly'],
    gates: [
      (of, S, Pc, recs) => { const hug = of2(of, 'benchmarkHug'); const aumFail = hug.filter((r) => !(r[14] & 1)).length / Math.max(1, hug.length); const mx = of2(of, 'maxActive'); const spiral = mx.filter((r) => r[13] > 0).length / Math.max(1, mx.length);
        return { id: 'W20-flow', what: 'benchmarkHug misses the AUM goal in ≥ 60 % of games; maxActive has an outflow spiral (money under management < ½ its peak) in ≥ 20 %', status: aumFail >= 0.6 && spiral >= 0.2 ? 'met' : 'NOT met', text: `benchmarkHug AUM missed ${Pc(aumFail)} · maxActive spiral ${Pc(spiral)}` }; },
      (of, S, Pc) => { const sh = of2(of, 'shortHeavy'); const hit = sh.filter((r) => r[14] & 2).length; const blown = hit / Math.max(1, sh.length);
        return { id: 'W20-short', what: 'shortHeavy is blown up by a squeeze (a squeeze on its short and a month ≤ −15 %) in ≥ 10 % of games', status: blown >= 0.1 ? 'met' : 'NOT met', text: `shortHeavy squeeze blow-ups ${Pc(blown)} (${hit} games)` }; },
    ],
  };
  return P;
}
