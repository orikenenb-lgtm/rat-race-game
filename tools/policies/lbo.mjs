// Sim policies for the `lbo` adapter (w21 בית ההשקעות הפרטי) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's actions with their `suggested` flags), the described 'W' auction card (its band, bids and the guide's pick) and
// static world data. Module actions through E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the 100-day plan first, then the highest bid at or under the guide's value (fixed company × a normal multiple,
//                         less time and risk), 4 × debt, sell a fixed company in a good market (or in the last year in anything but a bear
//                         market / a crash), cure a covenant breach, ask for the extension when the end comes in a bad market.
//   naive                 bids high on every company without the plan, 5 × debt, never cures, sells only when the fund's end forces it.
//   bidMaxAlways          smart, but always the high bid (W21-curse) · holdToEnd: smart, but never sells — the fund's end sells (W21-exit) ·
//                         maxLeverage: smart at 5 × debt (ablation) · recapAlways: smart + a dividend recap whenever allowed (ablation).
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const acts = (st) => E.worldActions(st);
  function manage(st, v) {
    if (st.over) return;
    if (v.lev && acts(st).find((a) => a.id === 'lev' && a.param === String(v.lev) && a.enabled)) Z(st, 'lev', String(v.lev));
    for (let g = 0; g < 20 && !st.over; g++) {
      const a = acts(st).find((x) => x.enabled && x.suggested && !(v.hold && ['sell', 'ipo', 'partial', 'secondary'].includes(x.id)) && !(v.noCure && x.id === 'cure'));
      if (!a || Z(st, a.id, a.param).ok === false) break;
    }
    if (v.recap) for (const a of acts(st).filter((x) => x.id === 'recap' && x.enabled)) { if (st.over) break; Z(st, a.id, a.param); }
    const m = E.metrics(st); if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= m.expenses * 3 && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function card(st, ev, v) {
    const on = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (v.never) return ['pass'];
    if (v.high) { if (!v.noDd && on('dd')) return ['dd']; return [on('bidhigh') ? 'bidhigh' : 'pass']; }
    const pr = ev.options.find((o) => o.primary && o.enabled); if (pr) return [pr.id];
    const d = ev.data || {}; if (on('dd')) return ['dd']; const want = ['high', 'mid', 'low'].find((k) => d.base * { high: 1.15, mid: 1, low: 0.85 }[k] <= d.fair); return [want && on('bid' + want) ? 'bid' + want : 'pass'];
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return card(st, ev, v);
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && v.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        const pr = ev.options.find((o) => o.primary && o.enabled); if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st) { if (st.over) return; const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work'); manage(st, v); },
    };
  }
  const tap = (st) => { for (let g = 0; g < 20 && !st.over; g++) { const a = acts(st).find((x) => x.suggested && x.enabled); if (!a || Z(st, a.id, a.param).ok === false) break; } };
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    bidMaxAlways: smartLike({ high: true }), holdToEnd: smartLike({ hold: true }), maxLeverage: smartLike({ lev: 5 }), recapAlways: smartLike({ recap: true }),
    maxDebt: smartLike({ maxDebt: true }), 'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, high: true, noDd: true, lev: 5, hold: true, noCure: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { never: true }, founder: { high: true, hold: true }, diversified: {}, gambler: { high: true, lev: 5, recap: true } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const S = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return S.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (!st.over) manage(st, ARCH[a]); } }; }
  P.__gates = {
    policies: ['bidMaxAlways', 'holdToEnd', 'maxLeverage', 'recapAlways'],
    ablations: ['maxLeverage', 'recapAlways'],
    gates: [
      (of, S, Pc) => { const b = of('bidMaxAlways'); const low = b.filter((r) => r[14] != null && r[14] < 1.5).length / Math.max(1, b.length);
        return { id: 'W21-curse', what: 'bidMaxAlways ends with DPI < 1.5 in ≥ 40 % of games', status: low >= 0.4 ? 'met' : 'NOT met', text: `bidMaxAlways DPI < 1.5 in ${Pc(low)}` }; },
      (of, S, Pc) => { const h = S(of('holdToEnd')); const sm = S(of('smart')); const hf = of('holdToEnd').filter((r) => r[13] > 0).length / Math.max(1, of('holdToEnd').length);
        return { id: 'W21-exit', what: 'holdToEnd (forced exits at the fund\'s end) loses to smart by ≥ 10 pp in time', status: sm.inTime - h.inTime >= 0.1 ? 'met' : 'NOT met', text: `holdToEnd ${Pc(h.inTime)} (forced exits in ${Pc(hf)}) vs smart ${Pc(sm.inTime)}` }; },
    ],
  };
  return P;
}
