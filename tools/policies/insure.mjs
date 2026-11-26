// Sim policies for the `insure` module (w18 חוף הסערות) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's actions with their `suggested` flags), the described 'Z' card and static world data. Module actions through
// E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the panel's suggested actions (each line at the guide's price, XoL layers so the biggest storm costs ≤ 35 % of
//                         equity, quota share when solvency is thin, the float's risky share lower before the storm season, a cat bond when
//                         reinsurance is dear, raise capital under 105 %); the Z card's guide pick (due diligence first, buy when it pays).
//   naive                 chases premium: every line 10 % under the market, buys every book, never touches reinsurance or the float.
//   underprice            smart, but every line 10 % under the market (W18-price) · noReinsurance: smart without XoL / quota share / cat
//                         bonds (W18-cat) · maxReinsurance: smart with all 3 XoL layers and the quota share always · coastHeavy: smart, but
//                         the coastal line 10 % under the market.
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const LINES = ['car', 'coast', 'inland', 'health', 'bi'];
  function manage(st, v) {
    const I = (E.metrics(st).worldIndicators || {}).insure || {};
    const want = (id, param) => { const a = E.worldActions(st).find((x) => x.id === id && x.param === param && x.enabled); if (a) Z(st, id, param); };
    if (v.price != null) for (const k of LINES) { if (v.coastOnly && k !== 'coast') continue; want('price', `${k}:${v.price}`); }
    if (v.noRe) { if (I.xol !== 0) want('xol', '0'); if (I.qs) want('qs', null); }
    if (v.maxRe) { if (I.xol !== 3) want('xol', '3'); if (!I.qs) want('qs', null); }
    if (v.risk && I.risk !== v.risk) want('risk', v.risk);
    for (const a of E.worldActions(st).filter((x) => x.enabled && x.suggested)) {
      if (st.over) break;
      if (a.id === 'price' && (v.price != null && (!v.coastOnly || a.line === 'coast'))) continue;
      if ((v.noRe || v.maxRe) && ['xol', 'qs', 'catbond'].includes(a.id)) continue;
      if (v.risk && a.id === 'risk') continue;
      if (v.noMod) continue;
      Z(st, a.id, a.param);
    }
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (v.buyAll) { const b = ev.options.find((o) => o.id === 'buy' && o.enabled); return [b ? 'buy' : 'pass']; } const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'pass']; }
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
    underprice: smartLike({ price: -0.1 }), noReinsurance: smartLike({ noRe: true }), maxReinsurance: smartLike({ maxRe: true }), coastHeavy: smartLike({ price: -0.1, coastOnly: true }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, price: -0.1, noMod: true, buyAll: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { risk: 'low', maxRe: true }, founder: { price: -0.05 }, diversified: {}, gambler: { risk: 'high', noRe: true, buyAll: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['underprice', 'noReinsurance', 'maxReinsurance', 'coastHeavy'],
    ablations: ['maxReinsurance', 'coastHeavy'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')); const u = inT(S, of('underprice')); const rs = of('underprice'); const f = rs.length ? rs.filter((r) => (r[13] || 0) > 0).length / rs.length : 0; const fs = of('smart').filter((r) => (r[13] || 0) > 0).length / Math.max(1, of('smart').length);
        return { id: 'W18-price', what: 'underprice fails solvency (the regulator steps in) in ≥ 20 % of games and loses to smart by ≥ 5 pp in time', status: f >= 0.2 && u <= sm - 0.05 ? 'met' : 'NOT met', text: `underprice ${Pc(u)} vs smart ${Pc(sm)} · solvency failures: underprice ${Pc(f)} · smart ${Pc(fs)}` }; },
      (of, S, Pc) => { const rs = of('noReinsurance').filter((r) => r[14] != null); const f = rs.length ? rs.filter((r) => r[9] || r[14] > 0).length / rs.length : 0; const ss = of('smart').filter((r) => r[14] != null); const fs = ss.length ? ss.filter((r) => r[9] || r[14] > 0).length / ss.length : 0;
        return { id: 'W18-cat', what: 'noReinsurance bankrupt or insolvent in ≥ 15 % of the games with a storm', status: f >= 0.15 ? 'met' : 'NOT met', text: `noReinsurance: ${Pc(f)} of ${rs.length} storm games (in time ${Pc(inT(S, of('noReinsurance')))}) · smart ${Pc(fs)} of ${ss.length}` }; },
    ],
  };
  return P;
}
