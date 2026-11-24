// Sim policies for the `harvest` rule adapter (w16 ארץ השדות) — a tools/sim.mjs plug-in (I8). Decisions from the PUBLIC view only:
// E.worldActions (the panel's suggested actions: crops, hedge levels from the LOW end of the shown yield range, insurance, the silo, land,
// irrigation, the packing house) and the described produce-exchange card (an export contract / water rights).
//
//   smart / guideTapper   the reference: every suggested action (hedge up to ≈ 90 % of the range's low end — 75 % in a drought — while 6 months
//                         of costs + ₪5M stay in cash for margin calls; store the unhedged wheat / cotton and sell it 2 months after the
//                         harvest; insure in a drought; buy a field every 6 months and lease one a year while the buffer allows; irrigate
//                         thirsty fields; the packing house) and the card's pick.
//   naive                 sells everything at harvest, never hedges, never insures, buys land whenever the bank allows, takes every contract.
//   ablations             hedge100 (locks 100 % of the expected yield as soon as a field grows) · hedge0 (never hedges, no contracts)
//                         · monoCrop (every field cotton) · neverStore (sells the whole crop in the harvest month).
export function make({ E, POLICIES }) {
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const acts = (st) => E.worldActions(st);
  const tap = (st, keep) => { for (const a of acts(st).filter((x) => x.suggested && x.enabled && keep(x))) { if (st.over) break; Z(st, a.id, a.param); } };
  function cardPick(ev, v) {
    const d = ev.data || {}; if (!d.kind) return [(ev.options.find((o) => o.enabled) || ev.options[0]).id];
    if (d.kind === 'export') { if (v.noHedge) return ['decline']; if (v.allExport && ev.options.find((o) => o.id === 'accept' && o.enabled)) return ['accept']; }
    if (d.kind === 'water' && v.saver) return ['decline'];
    const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : 'decline'];
  }
  const slotOf = (a) => +String(a.param).split(':')[0];
  function manage(st, v) {
    const skip = new Set(v.skip || []);
    if (v.noHedge || v.h100) { skip.add('hedge'); skip.add('insure'); }
    if (v.mono) skip.add('crop'); if (v.noStore) { skip.add('store'); skip.add('sell'); } if (v.buyAll || v.saver) { skip.add('buyLand'); skip.add('lease'); }
    tap(st, (a) => !skip.has(a.id));
    if (v.h100) { const done = new Set(); for (const a of acts(st).filter((x) => x.id === 'hedge' && x.enabled && x.param.endsWith(':1'))) { if (done.has(slotOf(a))) continue; done.add(slotOf(a)); Z(st, a.id, a.param); } }
    if (v.mono) for (const a of acts(st).filter((x) => x.id === 'crop' && x.enabled && x.param.endsWith(':cotton'))) Z(st, a.id, a.param);
    if (v.noStore) for (const a of acts(st).filter((x) => x.id === 'store' && x.param.endsWith(':0'))) Z(st, a.id, a.param);
    if (v.buyAll) for (const id of ['buyLand', 'lease']) { const a = acts(st).find((x) => x.id === id && x.enabled); if (a) Z(st, a.id, a.param); }
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
    hedge100: smartLike({ h100: true }), hedge0: smartLike({ noHedge: true }), monoCrop: smartLike({ mono: true }), neverStore: smartLike({ noStore: true }),
    maxDebt: smartLike({ maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ naive: true, noHedge: true, noStore: true, buyAll: true, allExport: true }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
  const ARCH = { saver: { saver: true, noHedge: true }, founder: { buyAll: true, h100: true }, diversified: {}, gambler: { noHedge: true, buyAll: true, noStore: true } };
  for (const a of Object.keys(ARCH)) {
    const base = POLICIES[a]; if (!base) continue; const v = ARCH[a];
    P[a] = { ...base,
      decide(st, ev, ctx) { if (ev.type === 'mech') return cardPick(ev, v); return base.decide(st, ev, ctx); },
      between(st, c) { if (base.between) base.between(st, c); if (st.over) return; manage(st, v); } };
  }
  const inT = (S, rs) => S(rs).inTime;
  P.__gates = {
    policies: ['hedge100', 'hedge0', 'monoCrop', 'neverStore'],
    ablations: ['monoCrop', 'neverStore'],
    gates: [
      (of, S, Pc) => { const sm = inT(S, of('smart')); const a = inT(S, of('hedge100')), b = inT(S, of('hedge0')); const rs = of('hedge100').filter((r) => r[14] != null); const f = rs.length ? rs.filter((r) => r[14] > 0).length / rs.length : 0;
        return { id: 'W16-hedge', what: 'hedge100 and hedge0 both lose to smart by ≥ 5 pp in time; over-hedge buy-back losses in ≥ 60 % of hedge100 games with a drought-hit harvest', status: a <= sm - 0.05 && b <= sm - 0.05 && f >= 0.6 ? 'met' : 'NOT met',
          text: `hedge100 ${Pc(a)} · hedge0 ${Pc(b)} vs smart ${Pc(sm)} · buy-back losses in ${Pc(f)} of ${rs.length} hedge100 drought games · forced liquidations: hedge100 ${Pc(of('hedge100').filter((r) => (r[13] || 0) > 0).length / Math.max(1, of('hedge100').length))} smart ${Pc(of('smart').filter((r) => (r[13] || 0) > 0).length / Math.max(1, of('smart').length))}` }; },
    ],
  };
  return P;
}
