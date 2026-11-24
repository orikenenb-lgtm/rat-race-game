// Sim policies for the `credit` module (w14 רובע הבנקים) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.metrics (worldIndicators.credit + the panel rows / actions), the described 'J' offer and static world data. Module actions through
// E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the panel's suggested actions: the market price (+0.5 only to rebuild capital below 10.5 %), stop lending to
//                         developers in a property slump, high liquidity when confidence is under 50, raise capital / sell a risky book
//                         near 8 %, a dividend when capital is ≥ 12.5 % and personal cash is short; the J card's guide pick (a credit
//                         committee first, then buy only with ≥ 11.5 % capital after the purchase and a fair price).
//   naive                 prices 1 pp below the market everywhere (the book grows fast), takes every offer, liquidity low, never raises.
//   priceLow / priceHigh  every segment at −1 / +1.5 pp (W14-select) · maxMismatch (liquidity low, only mortgages grow: the rest +1.5)
//   noDividendEver        smart without dividends (ablation).
export function make({ E, POLICIES }) {
  const SEGS = ['mort', 'sme', 'dev', 'cons', 'corp'];
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const tap = (st, skip = new Set()) => { for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && !skip.has(x.id))) { if (st.over) break; Z(st, a.id, a.param); } };
  function manage(st, v) {
    if (v.price != null) { for (const k of SEGS) Z(st, 'price', `${k}:${v.price === 'mm' ? (k === 'mort' ? -1 : 1.5) : v.price}`); }
    if (v.liq) Z(st, 'liq', v.liq);
    if (!v.noTouch) { const skip = new Set(v.price != null ? ['price'] : []); if (v.liq) skip.add('liq'); if (v.noDiv) skip.add('dividend'); tap(st, skip); }
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (v.naive || v.takeAll) { const b = ev.options.find((o) => o.id === 'buy' && o.enabled); return [b ? 'buy' : 'pass']; } const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass']; }
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        const pr = ev.options.find((o) => o.primary && o.enabled); if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st) { if (st.over) return; const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work'); manage(st, v); },
    };
  }
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    priceLow: smartLike({ price: -1 }), priceHigh: smartLike({ price: 1.5 }), maxMismatch: smartLike({ price: 'mm', liq: 'low' }), noDividendEver: smartLike({ noDiv: true }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, price: -1, liq: 'low', noTouch: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { price: 0.5, liq: 'high' }, founder: { price: -0.5 }, diversified: {}, gambler: { price: -1, liq: 'low', takeAll: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  const inT = (S, rs) => S(rs).inTime; const share = (rs, f) => (rs.length ? rs.filter(f).length / rs.length : 0);
  P.__gates = {
    policies: ['priceLow', 'priceHigh', 'maxMismatch', 'noDividendEver'],
    ablations: ['maxMismatch', 'noDividendEver'],
    gates: [
      (of, S, Pc) => { const lo = of('priceLow'), hi = of('priceHigh'), sm = of('smart'); const pdHi = hi.length ? hi.reduce((s, r) => s + (r[14] || 1), 0) / hi.length : 1; const pdSm = sm.length ? sm.reduce((s, r) => s + (r[14] || 1), 0) / sm.length : 1;
        const ok = inT(S, lo) <= inT(S, sm) - 0.05 && pdHi >= pdSm * 1.2; return { id: 'W14-select', what: 'priceLow loses to smart by ≥ 5 pp; priceHigh new-loan PD ≥ +20 % vs smart', status: ok ? 'met' : 'NOT met', text: `priceLow ${Pc(inT(S, lo))} vs smart ${Pc(inT(S, sm))} · new-loan PD × ${pdHi.toFixed(2)} (priceHigh) vs × ${pdSm.toFixed(2)} (smart) · priceHigh in time ${Pc(inT(S, hi))}` }; },
      (of, S, Pc) => { const nv = share(of('naive'), (r) => (r[13] || 0) > 0); const sm = share(of('smart'), (r) => (r[13] || 0) > 0); return { id: 'W14-run', what: 'a deposit run in ≥ 5 % of naive games and ≤ 2 % of smart games', status: nv >= 0.05 && sm <= 0.02 ? 'met' : 'NOT met', text: `runs: naive ${Pc(nv)} · smart ${Pc(sm)}` }; },
    ],
  };
  return P;
}
