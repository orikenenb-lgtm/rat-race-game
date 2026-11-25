// Sim policies for the `holding` module (w12 האימפריה) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only: E.worldActions
// (the panel's suggested actions) and the described division-sale card (range, price, fair range, budget, health, betas). Module actions go
// through E.worldAction (action code Z), like a player's panel taps.
//
//   smart / guideTapper   the reference: every suggested action — guarantee only divisions with health ≥ 60 and a growth beta < 1.3 (ring-fence
//                         the rest), keep HQ support on (let a bleeding ring-fenced division go when its equity is small), the dividend at the
//                         board's minimum, grow one healthy division a year while coverage ≥ 1.3 after a 15-month reserve, fix a division
//                         under health 60, a group bond when coverage < 1.05, the insurance arm with ≥ 3 growth-exposed divisions, shared
//                         services, sell a guaranteed division in deficit before its call when HQ cannot pay it — and the card's pick (dd first; buy
//                         when the fair value at the LOW end covers 95 % of the price within the budget; guaranteed only if healthy).
//   naive                 buys every division it can pay for (guaranteed, no dd), never restructures, never sells, dividend high.
//   ablations             guaranteeAll (every division guaranteed, always supported) · ringFenceAll (every division ring-fenced)
//                         · maxDividend (the high dividend every year) · neverSell (never sells a division).
export function make({ E, POLICIES }) {
  const HI = (m) => (m.worldIndicators && m.worldIndicators.holding) || {};
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const acts = (st) => E.worldActions(st);
  const tap = (st, keep) => { for (const a of acts(st).filter((x) => x.suggested && x.enabled && keep(x))) { if (st.over) break; Z(st, a.id, a.param); } };
  function cardPick(ev, v) {
    const d = ev.data || {}; const en = (id) => ev.options.find((o) => o.id === id && o.enabled);
    if (d.price == null) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (v.acq === 'never') return ['pass'];
    if (v.acq === 'always') return [en('buy') ? 'buy' : 'pass'];
    if (v.acq === 'blind') return [en('buy') && !en('buy').loanAmount && d.down <= d.budget ? 'buy' : 'pass'];
    const pr = ev.options.find((o) => o.primary && o.enabled); let id = pr ? pr.id : 'pass';
    if (v.allG && id === 'buyRf') id = 'buy'; if (v.allR && id === 'buy') id = 'buyRf';
    return [id];
  }
  function manage(st, v) {
    if (v.noTouch) { if (v.divHigh) { const a = acts(st).find((x) => x.id === 'dividend' && x.param === 'high' && x.enabled); if (a) Z(st, a.id, a.param); } return; }
    const skip = new Set(v.skip || []);
    tap(st, (a) => !skip.has(a.id));
    if (v.allG || v.allR) { const want = v.allG ? 'g' : 'r'; const rows = (E.metrics(st).worldIndicators.panel || {}).rows || [];
      for (const r of rows) { if (st.over) break; if (r.struct !== want) Z(st, 'structure', r.did); if (v.allG && !r.support) Z(st, 'support', r.did); } }
    if (v.divHigh && !st.over) { const a = acts(st).find((x) => x.id === 'dividend' && x.param === 'high' && x.enabled); if (a) Z(st, a.id, a.param); }
    const m = E.metrics(st);
    if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
    let g = 0; const keep = 15 * ((HI(m).service || 0)) + 10000000;
    while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 80) { const r = E.repayLoan(st); if (!r.ok) break; }
    if (v.maxDebt) { let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } }
  }
  function smartLike(v = {}) {
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') return cardPick(ev, v);
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
    guaranteeAll: smartLike({ skip: ['structure', 'support'], allG: true }),
    ringFenceAll: smartLike({ skip: ['structure'], allR: true }),
    maxDividend: smartLike({ skip: ['dividend'], divHigh: true }),
    neverSell: smartLike({ skip: ['sell'] }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, acq: 'always', noTouch: true, divHigh: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
    guideTapper: {
      mentor: 'guide', story: 'tapper',
      decide(st, ev, ctx) {
        if (ev.type === 'trade') return ['done'];
        const en = ev.options.filter((x) => x.enabled);
        if ((ev.type === 'payday' || ev.type === 'edu') && ctx.n === 0) {
          if (ev.data.focus && !ev.data.focus.locked) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); }
          tap(st, () => true);
        }
        const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)];
        return [o.id, o.needsQty ? { qty: 1 } : undefined];
      },
      between(st) { if (!st.over) tap(st, () => true); },
    },
  };
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  const ARCH = { saver: 'never', founder: 'blind', diversified: 'guide', gambler: 'always' };
  for (const a of Object.keys(ARCH)) {
    const base = POLICIES[a]; if (!base) continue;
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return cardPick(ev, { acq: ARCH[a] }); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; tap(st, (x) => !(a === 'saver' && ['grow', 'services'].includes(x.id)) && !(a === 'gambler' && ['structure', 'bond', 'insure'].includes(x.id))); } };
  }
  const med = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : Infinity; };
  P.__gates = {
    policies: ['guaranteeAll', 'ringFenceAll', 'maxDividend', 'neverSell'],
    ablations: ['guaranteeAll', 'ringFenceAll', 'maxDividend', 'neverSell'],
    gates: [
      (of, S, Pc) => { const rs = of('guaranteeAll'); const f = rs.length ? rs.filter((r) => (r[13] || 0) >= 1).length / rs.length : 0; const sm = of('smart'); const fs = sm.length ? sm.filter((r) => (r[13] || 0) >= 1).length / sm.length : 0;
        return { id: 'W12-contagion', what: 'guaranteeAll defaults (debt moved to HQ, rating cut) in ≥ 20 % of games', status: f >= 0.2 ? 'met' : 'NOT met', text: `guaranteeAll ≥ 1 group default in ${Pc(f)} (in time ${Pc(S(rs).inTime)}) · smart ${Pc(fs)} (in time ${Pc(S(sm).inTime)})` }; },
      (of, S, Pc) => { const mr = med(of('ringFenceAll').map((r) => (r[4] ? r[6] : null))); const ms = med(of('smart').map((r) => (r[4] ? r[6] : null)));
        return { id: 'W12-fence', what: 'ringFenceAll is slower than smart by ≥ 6 median won months', status: mr - ms >= 6 ? 'met' : 'NOT met', text: `ringFenceAll median ${Number.isFinite(mr) ? mr : '—'} · smart ${Number.isFinite(ms) ? ms : '—'} (Δ ${Number.isFinite(mr - ms) ? mr - ms : '—'})` }; },
    ],
  };
  return P;
}
