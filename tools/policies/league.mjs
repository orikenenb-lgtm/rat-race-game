// Sim policies for the `league` adapter + `auction` module (w13 אצטדיון הכוכבים) — a tools/sim.mjs plug-in (I8). Decisions from the
// PUBLIC view only: E.metrics (worldIndicators.league + panel rows / table / actions), the described event (the transfer card's public
// estimate, levels, budget) and static world data. Module actions go through E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the reference: the panel's suggested actions (renew the core, sell older players above book in a window, the
//                         stadium / training ground / academy when cash allows, naming rights for a share) and the transfer card's guide
//                         pick (the highest level within min(public estimate, budget) — budget = a starter who keeps the wage ratio ≤ 72 %
//                         at today's revenue, or ≤ 62 % at the next tier's revenue in a promotion push).
//   naive                 believes the seller: buys every deal with a claimed net > 0, bids +15 % on every lot it can pay for, never sells,
//                         renews nobody.
//   allInPromotion        the cliff bet: bids the +35 % jump on every lot (loans to the cap), owner loans whenever cash is short, never sells.
//   neverSpend            walks away from every lot and builds nothing (renews and sells like smart).
//   buyYoungSellPeak      bids only on young / prospect lots (up to the estimate, ignoring the wage rule) and sells every player ≥ 24 whose
//                         market value is ≥ 1.5 × book in a window.
//   ablations             starsOnly (only star lots, up to 1.1 × the estimate) · bidMaxAlways (the jump on every lot) · maxDebt.
export function make({ E, POLICIES }) {
  const LI = (m) => (m.worldIndicators && m.worldIndicators.league) || {};
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const tapSuggested = (st, skip = new Set()) => { for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && !skip.has(x.id))) { if (st.over) break; Z(st, a.id, a.param); } };
  function lotPick(ev, v) {
    const d = ev.data || {}; const en = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (!d.levels) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (v.lot === 'never') return ['walk'];
    if (v.lot === 'jump') return [en('jump') ? 'jump' : en('raise') ? 'raise' : 'walk'];
    if (v.lot === 'raise') return [en('raise') && !(en('raise').loanAmount) ? 'raise' : 'walk'];
    let cap = Math.min(d.value, d.budget);
    if (v.lot === 'young') cap = ['young', 'prospect'].includes(d.band) ? d.value : 0;
    if (v.lot === 'stars') cap = d.band === 'star' ? Math.round(d.value * 1.1) : 0;
    if (v.lot === 'eager') cap = Math.round(d.value * 1.1);
    const pick = ['jump', 'raise', 'bid'].find((id) => { const o = en(id); return o && o.amount <= cap && !o.loanAmount; });
    return [pick || 'walk'];
  }
  function manage(st, v) {
    if (v.noTouch) return;
    const skip = new Set(v.noBuild ? ['expand', 'train', 'academy'] : []); if (v.noSell) skip.add('sell'); if (v.sellPeak) skip.add('sell');
    tapSuggested(st, skip);
    if (v.sellPeak && !st.over) { const m = E.metrics(st); const L = LI(m); if (L.window) for (const r of (m.worldIndicators.panel.rows || [])) { if (st.over) break; if (r.age >= 24 && r.book > 0 && r.mv >= 1.5 * r.book) Z(st, 'sell', r.pid); } }
    if (v.ownerAlways && st.cash < 0 && !st.over) Z(st, 'ownerLoan');
    const m = E.metrics(st);
    if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!v.noRepay && !st.over && st.loans > 0 && st.cash - m.loanUnit >= 2 * ((LI(m).wages || 0) + 4000000) && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return lotPick(ev, v);
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
    allInPromotion: smartLike({ lot: 'jump', ownerAlways: true, maxDebt: true, noSell: true }),
    neverSpend: smartLike({ lot: 'never', noBuild: true }),
    buyYoungSellPeak: smartLike({ lot: 'young', sellPeak: true }),
    starsOnly: smartLike({ lot: 'stars' }),
    bidMaxAlways: smartLike({ lot: 'jump' }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, lot: 'raise', noTouch: true, noRepay: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
    guideTapper: {
      mentor: 'guide', story: 'tapper',
      decide(st, ev, ctx) {
        if (ev.type === 'trade') return ['done'];
        const en = ev.options.filter((x) => x.enabled);
        if ((ev.type === 'payday' || ev.type === 'edu') && ctx.n === 0) {
          if (ev.data.focus && !ev.data.focus.locked) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); }
          tapSuggested(st);
        }
        const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)];
        return [o.id, o.needsQty ? { qty: 1 } : undefined];
      },
      between(st) { if (!st.over) tapSuggested(st); },
    },
  };
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  const ARCH_LOT = { saver: 'never', founder: 'eager', diversified: 'guide', gambler: 'jump' };
  for (const a of ['saver', 'founder', 'diversified', 'gambler']) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return lotPick(ev, { lot: ARCH_LOT[a] }); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; tapSuggested(st, a === 'saver' ? new Set(['expand', 'train']) : new Set()); } };
  }
  const inT = (S, rs) => S(rs).inTime;
  const TRADE = ['smart', 'buyYoungSellPeak', 'starsOnly', 'saver', 'founder', 'diversified', 'gambler'];
  P.__gates = {
    policies: ['allInPromotion', 'neverSpend', 'buyYoungSellPeak', 'starsOnly', 'bidMaxAlways'],
    ablations: ['starsOnly', 'bidMaxAlways'],
    gates: [
      (of, S, Pc) => { const rs = of('allInPromotion'); const f = rs.length ? rs.filter((r) => r[9] || (r[13] || 0) > 0).length / rs.length : 0; const ns = inT(S, of('neverSpend')); const sm = inT(S, of('smart'));
        return { id: 'W13-cliff', what: 'allInPromotion fails (bankrupt or an FFP fine) ≥ 20 %; neverSpend in time ≤ smart − 10 pp', status: f >= 0.2 && ns <= sm - 0.1 ? 'met' : 'NOT met', text: `allInPromotion bankrupt/FFP ${Pc(f)} (in time ${Pc(inT(S, rs))}) · neverSpend ${Pc(ns)} vs smart ${Pc(sm)}` }; },
      (of, S, Pc, recs) => { const chars = [...new Set(recs.map((r) => r[1]))]; const bks = [...new Set(recs.map((r) => r[3]))]; let cells = 0, top = 0;
        for (const c of chars) for (const b of bks) { const xs = TRADE.map((p) => ({ p, s: S(of(p, (r) => r[1] === c && r[3] === b)) })).filter((x) => x.s.n >= 8); if (xs.length < 2) continue; cells++;
          const best = Math.max(...xs.map((x) => x.s.inTime)); const tops = xs.filter((x) => x.s.inTime === best); if (tops.some((x) => x.p === 'buyYoungSellPeak')) top += 1 / tops.length; }
        const sh = cells ? top / cells : 0; return { id: 'W13-trade', what: 'buyYoungSellPeak is the best policy in ≤ 60 % of cells (character × cycle bucket)', status: sh <= 0.6 ? 'met' : 'NOT met', text: `buyYoungSellPeak top in ${Pc(sh)} of ${cells} cells · in time ${Pc(inT(S, of('buyYoungSellPeak')))} vs smart ${Pc(inT(S, of('smart')))}` }; },
    ],
  };
  return P;
}
