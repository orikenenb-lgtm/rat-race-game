// Sim policies for the `portfolio` mechanic (w10 מרכז הפיננסים: `market` + `portfolio`) — a tools/sim.mjs plug-in (I8). Decisions from the
// PUBLIC view only: E.metrics (worldIndicators.market / .portfolio / .panel), the described event and static world data. Module actions go
// through E.worldAction (action code Z: trade, research, margin, redeem, sellNow, secondary, hedge), exactly like a player's panel taps.
//
//   smart        the reference (w10 spec): research the listed companies; a core in the index fund; stocks of high-quality companies spread
//                over sectors (≤ 2 per sector, ≤ 7 % of net worth each); sells a low band or rising distress; funds through the deal tile's
//                highlighted option (monthly class ≤ 35 %), private deals ≤ 15 % of net worth after due diligence; margin up to 60 % of
//                capacity in calm regimes and ≤ 30 % in a recession / high volatility; a put overlay in a recession; cash ≥ 6 months +
//                half the unfunded commitments; the heir sells the block down over time.
//   guideTapper  taps the highlighted option and the panel's suggested (badged) actions; buys the index fund with spare cash.
//   naive        buys whatever moved up last month, never researches, borrows to the maximum when cash runs out, never hedges.
//   ablations    maxMargin (smart with the maximum margin always, no regime brake, no hedge) · allCash (never invests) · privateHeavy
//                (commits to every private deal in full) · oneSector (all equity in the biggest sector, no index) ·
//   M-dom        holdIndex (all in the index fund, no margin) · momentum (last month's top 3) · buyDip (last month's worst 3) · allCash.

export function make({ E, POLICIES }) {
  const WI = (st) => E.metrics(st).worldIndicators || {};
  const Z = (st, id, param) => (st.over ? { ok: false } : E.worldAction(st, id, param));
  const smartBase = POLICIES.smart;
  const lastRet = (c) => { const k = c.cand[c.cand.length - 1]; return k ? k[4] / k[1] - 1 : 0; };
  const bandRank = { high: 3, mid: 2, low: 1 };

  function buy(st, id, amount) { if (amount >= 50000 && st.cash >= amount) Z(st, 'trade', `${id}:B:${Math.floor(amount)}`); }
  function cover(st) { // a margin call: repay from cash, then sell daily positions (largest first) until the debt fits
    let w = WI(st); let P = w.portfolio; if (!P || !P.call) return;
    if (st.cash > 0) Z(st, 'margin', 'r:all');
    w = WI(st); P = w.portfolio; let g = 0;
    while (P.call && P.debt > P.capacity * 0.9 && g++ < 12) {
      const pos = [...(w.market.idx.held ? [{ id: 'IDX', v: w.market.idx.held.value, qty: w.market.idx.held.qty }] : []), ...w.market.cos.filter((c) => c.held && c.status === 'listed').map((c) => ({ id: c.id, v: c.held.value, qty: c.held.qty }))].sort((a, b) => b.v - a.v);
      if (!pos.length) break; const p = pos[0]; const want = Math.min(p.qty, Math.ceil(p.qty * Math.min(1, (P.debt - P.capacity * 0.8) / Math.max(1, p.v) * 1.6)));
      Z(st, 'trade', `${p.id}:s:${Math.max(1, want)}`); Z(st, 'margin', 'r:all'); w = WI(st); P = w.portfolio;
    }
  }
  function manage(st, v) {
    if (st.over) return; let w = WI(st); if (!w.market || !w.portfolio) return;
    if (!v.naive) cover(st); w = WI(st); // naive never answers a margin call
    const m = E.metrics(st); const E0 = Math.max(1, m.expenses); const nw = Math.max(1, m.netWorth); const P = w.portfolio; const M = w.market; const reg = M.regime.id;
    const calm = !['recession', 'highVol'].includes(reg);
    // research (the allocator's is free): up to 2 companies a month
    if (v.research) { let k = 0; for (const a of E.worldActions(st).filter((x) => x.id === 'research' && x.enabled)) { if (k >= 2 || st.cash < a.cost + E0 * 6) break; Z(st, 'research', a.param); k++; } }
    w = WI(st);
    const cos = w.market.cos.filter((c) => c.status === 'listed');
    // sells: a low band, rising distress, the heir's block above 25 % of net worth
    for (const c of cos) if (c.held) {
      const badQ = v.research && c.seen && (c.seen.band === 'low' || (c.seen.distress || 0) >= 2);
      if (badQ && !v.oneSector) Z(st, 'trade', `${c.id}:S:all`);
      else if (v.trim !== false && c.held.value > nw * (v.oneSector ? 0.5 : 0.12)) Z(st, 'trade', `${c.id}:s:${Math.ceil(c.held.qty * 0.25)}`);
    }
    if (v.momentum || v.buyDip) { for (const c of cos) if (c.held && (v.momentum ? lastRet(c) < 0 : lastRet(c) > 0.05)) Z(st, 'trade', `${c.id}:S:all`); }
    // margin: borrow toward the target LTV, repay above it
    w = WI(st); const P2 = w.portfolio; const tgt = v.maxMargin ? 0.95 : v.noMargin ? 0 : calm || v.naive ? (v.ltv ?? 0.6) : 0.3; // naive never brakes in a bad market
    if (P2.ltv > tgt + 0.05 && P2.debt > 0) { const x = Math.min(st.cash - E0 * 3, P2.debt - tgt * P2.capacity); if (x > 100000) Z(st, 'margin', `r:${Math.floor(x)}`);
      w = WI(st); if (w.portfolio.ltv > tgt + 0.1) { const big = w.market.cos.filter((c) => c.held && c.status === 'listed').sort((a, b) => b.held.value - a.held.value)[0] || (w.market.idx.held ? { id: 'IDX', held: w.market.idx.held } : null); if (big) { Z(st, 'trade', `${big.id}:s:${Math.ceil(big.held.qty * 0.2)}`); Z(st, 'margin', 'r:all'); } } }
    // cash to deploy: keep 6 months of expenses + half of the unfunded commitments
    w = WI(st); const keep = E0 * 6 + (w.portfolio.unfunded || 0) * 0.5;
    if (!v.allCash) {
      const want = (P3) => Math.max(0, tgt * P3.capacity - P3.debt);
      if (tgt > 0 && st.cash < keep + 5000000 && !w.portfolio.call) { const room = want(w.portfolio); if (room > 1000000) Z(st, 'margin', `b:${Math.floor(Math.min(room, nw * 0.25))}`); }
      w = WI(st); let spare = st.cash - keep;
      if (spare > 200000) {
        const live = w.market.cos.filter((c) => c.status === 'listed');
        let picks;
        if (v.holdIndex) picks = [];
        else if (v.oneSector) { const bySec = {}; for (const c of live) bySec[c.sector] = (bySec[c.sector] || 0) + 1; const s = Object.keys(bySec).sort((a, b) => bySec[b] - bySec[a] || (a < b ? -1 : 1))[0]; picks = live.filter((c) => c.sector === s); }
        else if (v.momentum) picks = live.slice().sort((a, b) => lastRet(b) - lastRet(a)).slice(0, 3);
        else if (v.buyDip) picks = live.slice().sort((a, b) => lastRet(a) - lastRet(b)).slice(0, 3).filter((c) => lastRet(c) < -0.05);
        else if (v.naive) picks = live.filter((c) => lastRet(c) > 0.04).slice(0, 4);
        else { const bySec = {}; picks = live.filter((c) => !v.research || (c.seen && c.seen.band !== 'low' && (c.seen.distress || 0) < 2)).sort((a, b) => (bandRank[(b.seen || {}).band] || 2) - (bandRank[(a.seen || {}).band] || 2) || a.size.localeCompare(b.size) || (a.id < b.id ? -1 : 1))
          .filter((c) => { bySec[c.sector] = (bySec[c.sector] || 0) + 1; return bySec[c.sector] <= 2; }).slice(0, 8); }
        const idxShare = v.holdIndex ? 1 : v.oneSector || v.momentum || v.buyDip || v.naive ? 0 : 0.35;
        if (idxShare > 0) { const x = spare * idxShare; buy(st, 'IDX', x); spare -= x; }
        const cap = nw * (v.oneSector ? 0.5 : 0.08);
        for (const c of picks) { if (spare < 200000) break; const have = c.held ? c.held.value : 0; const x = Math.min(spare / Math.max(1, picks.length) * 1.5, cap - have); if (x > 200000) { buy(st, c.id, x); spare -= x; } }
        if (spare > 200000 && !v.holdIndex && !v.oneSector) buy(st, 'IDX', spare);
      }
    }
    // suggested actions (redeem a risky note, the hedge, the margin-call repay)
    for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled && ['redeem', 'hedge'].includes(x.id))) { if (v.maxMargin && a.id === 'hedge') continue; Z(st, a.id, a.param); }
    if (st.loans > 0 && st.cash - m.loanUnit >= keep) { let g = 0; while (st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; } }
    if (st.credit && st.cash > st.credit + E0) E.payCredit(st);
  }
  /** The guide's plan (the panel's suggested actions: research, sells, margin to its target, buys, the hedge) + a margin-call cover and
   *  bank-loan repayment. Variants: maxMargin (never de-levers, no hedge, borrows to the maximum). */
  function guided(st, v) {
    if (!v.maxMargin) cover(st); if (st.over) return; // maxMargin never answers a margin call (the broker does)
    for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) {
      if (st.over) break; if (v.maxMargin && ((a.id === 'margin' && a.param.startsWith('r:')) || a.id === 'hedge')) continue; if (v.maxMargin && a.id === 'margin') continue;
      Z(st, a.id, a.param);
    }
    if (v.maxMargin && !st.over) { const w = WI(st); if (!w.portfolio.call) { Z(st, 'margin', 'b:max'); const sp = st.cash - Math.max(1, E.metrics(st).expenses) * 3; if (sp > 500000) Z(st, 'trade', `IDX:B:${Math.floor(sp)}`); } }
    const m = E.metrics(st); const keep = Math.max(1, m.expenses) * 8;
    if (!v.maxMargin && !st.over) { const sp = st.cash - Math.max(1, m.expenses) * 8 - ((WI(st).portfolio || {}).unfunded || 0) * 0.5; if (sp > 1000000 && !(WI(st).portfolio || {}).call) Z(st, 'trade', `IDX:B:${Math.floor(sp)}`); } // idle cash beyond the cushion → the index fund
    if (st.loans > 0 && st.cash - m.loanUnit >= keep) { let g = 0; while (st.loans > 0 && st.cash - m.loanUnit >= keep && g++ < 40) { const r = E.repayLoan(st); if (!r.ok) break; } }
    if (st.credit && st.cash > st.credit + m.expenses) E.payCredit(st);
  }
  function smartLike(v = {}) {
    const vv = { research: true, ...v };
    return {
      mentor: 'guide', quiz: 'smart', story: 'smart',
      decide(st, ev, ctx) {
        if (ev.type === 'mech') { if (ev.data && ev.data.private) { if (vv.allCash) return ['pass']; if (vv.privateHeavy) { const o = ev.options.find((x) => x.id === 'commit' && x.enabled) || ev.options.find((x) => x.id === 'half' && x.enabled); return [o ? o.id : 'pass']; } }
          const pr = ev.options.find((o) => o.primary && o.enabled); return [pr ? pr.id : (ev.options.find((o) => o.enabled) || ev.options[0]).id]; }
        if (ev.type === 'trade') return ['done'];
        if (ev.type === 'deal' && vv.allCash) return [ev.options.find((o) => o.id === 'pass' && o.enabled) ? 'pass' : ev.options.find((o) => o.enabled).id];
        if (ev.type === 'deal' && vv.naive) { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => b.net - a.net)[0]; return [o && o.net >= 0 ? o.id : 'pass']; }
        if (ev.type === 'market' && ev.options.some((o) => o.kind === 'sell')) return ['done'];
        const pr = ev.options.find((o) => o.primary && o.enabled);
        if (pr) return [pr.id, pr.needsQty ? { qty: 1 } : undefined];
        return smartBase.decide(st, ev, ctx);
      },
      between(st, c) {
        if (st.over) return;
        const L = E.metrics(st).life; E.setPlan(st, L.energy < 35 || (L.plan === 'rest' && L.energy < 70) || (L.happinessBase < 57 && st.month > 6) ? 'rest' : 'work');
        if (vv.custom) manage(st, vv); else guided(st, vv); void c;
      },
    };
  }
  const P = {
    smart: smartLike(), adaptive: smartLike(),
    maxMargin: smartLike({ maxMargin: true }), allCash: smartLike({ custom: true, allCash: true, research: false, noMargin: true }), privateHeavy: smartLike({ privateHeavy: true }), oneSector: smartLike({ custom: true, oneSector: true, research: false }),
    holdIndex: smartLike({ custom: true, holdIndex: true, research: false, noMargin: true }), momentum: smartLike({ custom: true, momentum: true, research: false, noMargin: true, trim: false }), buyDip: smartLike({ custom: true, buyDip: true, research: false, noMargin: true, trim: false }),
    maxDebt: smartLike({ maxMargin: true, maxDebt: true }),
    'f:frugal': smartLike(), 'f:none': smartLike(),
    naive: { ...smartLike({ custom: true, naive: true, research: false, ltv: 0.95 }), mentor: 'hint', quiz: 'tapper', story: undefined },
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
      between(st) { if (st.over) return; for (const a of E.worldActions(st).filter((x) => x.suggested && x.enabled)) { if (st.over) break; E.worldAction(st, a.id, a.param); }
        const m = E.metrics(st); const spare = st.cash - Math.max(1, m.expenses) * 6; if (spare > 1000000) Z(st, 'trade', `IDX:B:${Math.floor(spare)}`); },
    },
  };
  // maxDebt (G-loss): smart + bank loans to the cap
  { const base = P.maxDebt; P.maxDebt = { ...base, between(st, c) { base.between(st, c); let k = 0; while (!st.over && k++ < 80) { const r = E.takeLoan(st); if (r.ok === false) break; } } }; }
  for (const f of ['frugal', 'none']) { const base = P['f:' + f]; P['f:' + f] = { ...base, between(st, c) { base.between(st, c); if (st.over) return; const fo = E.metrics(st).focus; if (fo && !fo.locked) { const o = fo.options.find((x) => x.id === f); if (o && o.enabled && f !== 'none') E.setFocus(st, f, 0); } } }; }
  const ARCH = { saver: { ltv: 0.2 }, founder: { ltv: 0.75 }, diversified: { ltv: 0.5 }, gambler: { ltv: 0.95, momentum: true, research: false } };
  for (const a of Object.keys(ARCH)) { const base = POLICIES[a]; if (!base) continue; const sm = smartLike(ARCH[a]);
    P[a] = { ...base, decide(st, ev, ctx) { if (ev.type === 'mech') return sm.decide(st, ev, ctx); return base.decide(st, ev, ctx); }, between(st, c) { if (base.between) base.between(st, c); if (st.over) return; manage(st, { research: true, custom: true, ...ARCH[a] }); } }; }
  const inT = (S, rs) => S(rs).inTime;
  const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  P.__gates = {
    policies: ['maxMargin', 'allCash', 'privateHeavy', 'oneSector', 'holdIndex', 'momentum', 'buyDip'],
    ablations: ['maxMargin', 'allCash', 'privateHeavy', 'oneSector'],
    gates: [
      (of, S, Pc, recs) => { const mm = of('maxMargin'), sm = of('smart'); const nwOf = (rs) => rs.map((r) => r[12] ?? 0); const p90m = q(nwOf(mm), 0.9), p90s = q(nwOf(sm), 0.9);
        const best = ['smart', 'maxMargin', 'allCash', 'privateHeavy', 'oneSector'].map((p) => [p, q(nwOf(of(p)), 0.9)]).sort((a, b) => b[1] - a[1])[0];
        const ok = best[0] === 'maxMargin' && inT(S, mm) < inT(S, sm); void recs;
        return { id: 'W10-margin', what: 'maxMargin has the best p90 net worth AND a worse in-time rate than smart (variance is not skill)', status: ok ? 'met' : 'NOT met', text: `p90 NW maxMargin ${Math.round(p90m / 1e6)}M vs smart ${Math.round(p90s / 1e6)}M (best: ${best[0]}) · in time maxMargin ${Pc(inT(S, mm))} vs smart ${Pc(inT(S, sm))}` }; },
      (of, S, Pc) => { const xs = ['holdIndex', 'momentum', 'buyDip', 'allCash'].map((p) => [p, inT(S, of(p))]); const sm = inT(S, of('smart')); const ok = xs.every(([, x]) => x <= sm + 0.05);
        return { id: 'M-dom', what: 'none of holdIndex / momentum / buyDip / allCash beats smart (no fixed rule dominates)', status: ok ? 'met' : 'NOT met', text: xs.map(([p, x]) => `${p} ${Pc(x)}`).join(' · ') + ` · smart ${Pc(sm)}` }; },
      (of, S, Pc) => { const rs = of('maxMargin'); const f = rs.length ? rs.filter((r) => (r[13] || 0) > 0).length / rs.length : 0; const s2 = of('smart'); const fs = s2.length ? s2.filter((r) => (r[13] || 0) > 0).length / s2.length : 0;
        return { id: 'W10-forced', what: 'forced liquidations happen to maxMargin (≥ 20 %) far more than to smart', status: f >= 0.2 && fs < f / 2 ? 'met' : 'NOT met', text: `maxMargin forced ${Pc(f)} · smart ${Pc(fs)}` }; },
    ],
  };
  return P;
}
