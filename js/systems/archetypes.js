// T6 §2.3: the four archetype policies (rivals / ghost players and the T2 sim archetypes — ONE copy, moved here from tools/sim.mjs).
// PURE and engine-free: a policy reads only the public view `pv` (E.publicView(st, {freeze:false}) — metrics + the described event)
// and ctx = { rnd (its own tie-break PRNG, never st.rng), n (non-closing steps already taken on this card), tables }.
// It never imports js/engine.js (AC-16, tested by a static scan) and never mutates pv (it is deep-frozen in a test).
// Contract (ARCH_API 2): decide(pv, ctx) → {id, params?} for the pending event; between(pv, ctx) → [action] between rolls:
//   ['loan', n] | ['repay', n] | ['plan', id] | ['focus', id, slot] | ['save', n] | ['auto', n] | ['invest', side, qty] | ['payCredit']
// The driver (ghost worker, sim) applies them through the public engine API. Quizzes are answered by the driver (quizSkill).
// The persona rule cards (js/systems/rivals.js ARCH[id].rule) must stay literally true — tests/t6_engine.test.mjs checks them (AC-30).

export const ARCH_API = 2;
export const ARCH_V = 2;            // bump on any behaviour change (ghost cache key) — 2: balance pass (gambler overtime guard + offer:5, founder's rent bar, diversified's bars + offer:5)
export const ARCH_IDS = ['saver', 'founder', 'diversified', 'gambler'];

const en = (ev) => ev.options.filter((o) => o.enabled);
const has = (ev, id) => ev.options.find((o) => o.id === id && o.enabled);
const first = (ev, ids) => ids.find((id) => has(ev, id)) || null;
const any = (ev) => (first(ev, ['ok', 'done', 'pass', 'skip']) || (en(ev)[0] || ev.options[0]).id);
const pick = (id, params) => (params ? { id, params } : { id });
const warnOf = (ev) => (ev.data && ev.data.dd ? ev.data.dd.flags.filter((f) => f.kind === 'warn').length : 0);
/** What the seller CLAIMS an option nets per month (level 0); the inspected / verified number afterwards. */
export function claimedNet(ev, o) { const dd = ev.data && ev.data.dd; if (!dd || dd.level > 0) return o.net; return o.net + (dd.claimed.cf - dd.expected.cf); }
const lifeMoney = (o) => { const e = o.effects || {}; return e.total24 != null ? e.total24 : (e.cash || 0) - (e.monthly || 0) * (e.months || 24) + (e.salary || 0) * (e.months || 24); };
/** Rent kinds of the static world tables (re w1/h, tower + mall w2, campus w4). */
export const RENT_KINDS = new Set(['re', 'tower', 'mall', 'campus']);
const isRentDeal = (ev) => !!(ev.data && RENT_KINDS.has(ev.data.kind));
const rivalsOf = (ev) => (ev.data && ev.data.rivals) || { n: 0 };
const ctxN = (ctx) => (ctx && ctx.n) || 0;

/** §13.2 "flagged" DD rule on the buy option the policy is about to take → an inspect option id or null. */
function ddFlagged(ev, o, minWarn = 1) {
  const dd = ev.data && ev.data.dd; if (!dd) return null;
  if (dd.level === 0 && has(ev, 'inspect:1') && warnOf(ev) >= minWarn && claimedNet(ev, o) > 0) return 'inspect:1';
  const straddle = dd.level === 1 && dd.range && (dd.range.cf[0] - (o.loanMonthly || 0)) < 0 && (dd.range.cf[1] - (o.loanMonthly || 0)) > 0;
  if (straddle && has(ev, 'inspect:2')) return 'inspect:2';
  return null;
}
/** T2 §13.3 adaptive focus from public data (a public proxy replaces the static median down payment). */
export function adaptiveFocus(pv) {
  const m = pv.metrics; const f = m.focus; if (!f || f.locked) return null;
  const ok = (id) => (f.options.find((o) => o.id === id) || {}).enabled;
  const energy = m.life.energy; const left = pv.maxMonths - pv.month;
  if (energy < 45) return 'none';
  if (m.credit > 0 && ok('debt')) return 'debt';
  if ((m.businesses || []).some((b) => b.canDecide) && ok('ops')) return 'ops';
  if (ok('frugal') && ((m.expenseLines || []).some((l) => /\(מנוי\)/.test(l.label)) || (m.life.happinessBase >= 64 && left >= 18))) return 'frugal';
  if (m.cash + (m.loanRoom || 0) >= 3 * m.expenses && ok('scout')) return 'scout';
  if (m.econ && m.econ.labelChangedAt != null && pv.month - m.econ.labelChangedAt <= 2 && ok('research')) return 'research';
  return 'none';
}
function focusAct(pv, id) {
  const f = pv.metrics.focus; if (!f || f.locked || !id || id === 'none') return [];
  if (f.current && f.current.id && f.current.id !== 'none') return [];
  const o = f.options.find((x) => x.id === id); return o && o.enabled ? [['focus', id, 0]] : [];
}

/* ---------------------------------------------------------------- shared card handling (non-deal) */
function planWant(pv, arch) {
  const L = pv.metrics.life;
  if (arch === 'gambler') return L.energy >= 70 || (L.plan === 'overtime' && L.energy >= 45) ? 'overtime' : L.energy < 30 ? 'rest' : 'work'; // balance pass: overtime while there is energy for it (was > 35 🔋: 8–29 burnouts a game)
  if (L.energy < (arch === 'saver' ? 40 : 35) || (L.plan === 'rest' && L.energy < 70)) return 'rest';
  if (arch === 'founder') return L.energy >= 60 ? 'side' : 'work';
  if (arch === 'diversified' && !L.studyDone && pv.month <= 20 && L.energy >= 45) return 'study';
  return 'work';
}
function giving(pv, ev, arch) {
  if (arch === 'gambler') return 'pass';
  const m = pv.metrics; const d = ev.data; const E = m.expenses;
  const imp = m.goalParts.find((x) => x.key === 'impact'); const nw = m.goalParts.find((x) => x.key === 'netWorth');
  if (!imp || !nw) return has(ev, 'give:0') && m.cash > d.levels[0].amount + 3 * E ? 'give:0' : 'pass';
  const pledged = (m.expenseLines || []).some((l) => /תרומה חודשית/.test(l.label));
  if (!pledged && has(ev, 'pledge') && m.cashflow > d.pledge.amount * 3) return 'pledge';
  const committed = imp.value + ((m.worldIndicators || {}).impactPending || 0);
  const want = imp.target * Math.max(0, Math.min(1, (nw.progress - 0.2) / 0.6));
  const gap = want - committed; const buf = E * (arch === 'saver' ? 3 : 1);
  if (gap > 3 && (d.eff >= 1 || (gap > 30 && d.eff >= 0.9))) {
    const k = [0, 1, 2].find((j) => d.levels[j] && d.levels[j].impact >= gap * 0.8 && has(ev, 'give:' + j) && m.cash - d.levels[j].amount > buf)
      ?? [2, 1, 0].find((j) => d.levels[j] && d.levels[j].impact < gap && has(ev, 'give:' + j) && m.cash - d.levels[j].amount > buf * 2);
    return k != null ? 'give:' + k : 'pass';
  }
  return 'pass';
}
function common(pv, ev, ctx, arch) {
  const m = pv.metrics; const d = ev.data || {}; const E = Math.max(1, m.expenses); const n = ctxN(ctx);
  switch (ev.type) {
    case 'intro': return pick(has(ev, 'skip') ? 'skip' : any(ev)); // a ghost skips the tutorial intro (no money effect)
    case 'trade':
      if (arch === 'gambler' && n === 0 && d.maxBuy > 0 && (d.kind === 'crypto' || d.kind === 'stock')) return pick('buy', { qty: d.maxBuy });
      if (arch === 'gambler' && d.qty > 0 && d.avg && d.price >= d.avg * 2) return pick('sell', { qty: d.qty });
      return pick('done');
    case 'doodad':
      if (arch === 'gambler') return pick(first(ev, ['credit', 'inst3', 'pay']) || any(ev));
      if (!d.need && has(ev, 'skip')) return pick('skip');
      return pick(arch === 'saver' && has(ev, 'inst3') ? 'inst3' : first(ev, ['pay', 'inst3', 'credit']) || any(ev));
    case 'market': {
      const sells = ev.options.filter((o) => o.id.startsWith('sell:') && o.enabled);
      if (sells.length && arch !== 'gambler') {
        for (const o of sells) {
          const off = (d.offers || []).find((x) => 'sell:' + x.assetId.slice(1) === o.id); if (!off) continue;
          const grow = (m.assets.find((a) => a.id === off.assetId) || {}).grow || 0;
          if (m.goalType === 'passive' ? off.net > off.cf * 80 && off.profit > 0 : grow <= 0.006 || (off.profit > 0 && off.net > off.cf * 24)) return pick(o.id);
        }
        return pick('done');
      }
      if (d.match) { const g = giving(pv, ev, arch); return pick(g !== 'pass' && has(ev, g) ? g : (has(ev, 'done') ? 'done' : any(ev))); }
      return pick(has(ev, 'done') ? 'done' : any(ev));
    }
    case 'crisis': return pick(any(ev));
    case 'bank':
      if (arch !== 'gambler' && has(ev, 'refi') && d.to <= 4.5 && m.cash > (d.refiFee || 0) + E) return pick('refi');
      return pick(any(ev));
    case 'upgrade': {
      if (arch === 'gambler') { const u = ev.options.find((o) => o.id.startsWith('up:') && o.enabled); return pick(u ? u.id : 'pass'); }
      const minRoi = arch === 'saver' ? 0.6 : 0.45; const keep = arch === 'saver' ? 3 * E : E;
      const opts = [...(d.upgrades || []).map((u) => ({ id: 'up:' + u.assetId.slice(1), cost: u.cost, gain: u.gain })), ...(d.trims || []).map((t) => ({ id: 'trim:' + t.expenseId, cost: t.cost, gain: t.cut }))]
        .filter((o) => has(ev, o.id) && !(ev.options.find((x) => x.id === o.id) || {}).loanAmount && o.gain * 12 / Math.max(1, o.cost) >= minRoi && m.cash - o.cost >= keep)
        .sort((a, b) => b.gain / b.cost - a.gain / a.cost);
      return pick(opts.length ? opts[0].id : 'pass');
    }
    case 'fx': return pick(arch === 'saver' ? first(ev, ['hedgeImp', 'hedgeExp']) || any(ev) : any(ev));
    case 'shipping': return pick(arch === 'saver' && has(ev, 'insure') && m.cash > (d.fee || 0) + E ? 'insure' : any(ev));
    case 'pitch': {
      if (arch === 'saver') return pick('pass');
      if (arch === 'gambler') return pick(first(ev, ['inv:2', 'inv:1', 'inv:0']) || 'pass');
      const cap = (arch === 'founder' ? 0.10 : 0.05) * Math.max(0, m.netWorth); const q = d.team + d.traction;
      const i = [1, 0].find((k) => has(ev, 'inv:' + k) && d.checks[k] <= cap && !(ev.options.find((o) => o.id === 'inv:' + k) || {}).loanAmount && m.cash - d.checks[k] > 2 * E);
      return pick(i != null && q >= 4 && d.hype < 3 ? 'inv:' + i : 'pass');
    }
    case 'giving': return pick(giving(pv, ev, arch));
    case 'payday': case 'edu': {
      if (arch !== 'saver' && arch !== 'gambler' && has(ev, 'raise') && (ev.options.find((o) => o.id === 'raise').chance || 0) >= 0.45) return pick('raise');
      const want = planWant(pv, arch); const o = ev.options.find((x) => x.enabled && x.plan === want);
      return pick(o ? o.id : first(ev, ['ok']) || any(ev));
    }
    case 'life': {
      const opts = en(ev); if (!opts.length) return pick(any(ev));
      if (arch === 'gambler') return pick(opts.slice().sort((a, b) => ((b.effects || {}).cash || 0) - ((a.effects || {}).cash || 0))[0].id);
      return pick(opts.slice().sort((a, b) => lifeMoney(b) - lifeMoney(a))[0].id);
    }
    case 'business': {
      if (d.mode === 'offer') {
        const starts = ev.options.filter((o) => o.kind === 'buy' && o.enabled);
        if (arch === 'gambler') return pick(starts.length ? starts.sort((a, b) => (b.startCapital || d.startCapital) - (a.startCapital || d.startCapital))[0].id : 'pass');
        if (arch === 'founder') { const o = starts.find((x) => x.id === 'start') || starts[0]; return pick(o && (o.net || 0) > 0 ? o.id : 'pass'); }
        const o = has(ev, 'start'); const keep = arch === 'saver' ? 6 : 3;
        return pick(o && !o.loanAmount && d.forecast3 && d.forecast3.netProfit > 0 && m.cash - d.startCapital >= keep * E ? 'start' : 'pass');
      }
      if (arch === 'saver') return pick(first(ev, ['ok', 'pass']) || any(ev));
      if (arch === 'gambler') { if (n > 0) return pick(first(ev, ['ok']) || any(ev)); const b = ev.options.filter((o) => o.kind === 'biz' && o.enabled && o.effects).sort((a, x) => (x.effects.delta3 || 0) - (a.effects.delta3 || 0))[0]; return pick(b ? b.id : first(ev, ['ok']) || any(ev)); }
      return pick(n === 0 && has(ev, 'biz:suggest') && !d.lastResult ? 'biz:suggest' : first(ev, ['ok', 'pass']) || any(ev));
    }
    default: return pick(any(ev));
  }
}

/* ---------------------------------------------------------------- the four archetypes */
const saver = {
  id: 'saver', mentor: 'hint', quizSkill: 0.8,
  decide(pv, ctx) {
    const ev = pv.event; if (!ev) return null; const m = pv.metrics; const d = ev.data || {};
    if (ev.type === 'deal') {
      // only cashflow, no loan, a 6-month cushion after the buy, every flagged deal inspected first (rule card)
      const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled && !o.loanAmount).sort((x, y) => y.net - x.net)[0];
      if (!b || b.net <= 0 || claimedNet(ev, b) <= 0) return pick('pass');
      if (m.cash + m.savings - d.down < 6 * m.expenses) return pick('pass');
      const dd = d.dd;
      if (dd && dd.level === 0 && warnOf(ev) >= 1) { if (has(ev, 'inspect:1')) return pick('inspect:1'); if (has(ev, 'inspect:2')) return pick('inspect:2'); return pick('pass'); }
      const ins = ddFlagged(ev, b, 1); if (ins && ctxN(ctx) < 3) return pick(ins);
      return pick(b.id);
    }
    return common(pv, ev, ctx, 'saver');
  },
  between(pv) {
    const m = pv.metrics; const E = m.expenses; const acts = [];
    if (m.credit && m.cash >= m.credit) acts.push(['payCredit']);
    const want = Math.round(E * 3.1) - m.savings; if (want > 300 && m.cash - want > E) acts.push(['save', want]);
    const dca = Math.max(0, Math.ceil(Math.max(0, m.cashflow) * 0.2 / 100) * 100); if (Math.abs(dca - (m.life.autoInvest || 0)) > Math.max(300, dca * 0.3)) acts.push(['auto', dca]);
    if (m.loans > 0 && m.cash - m.loanUnit >= 6 * E) acts.push(['repay', 0]);
    if (m.life.plan !== planWant(pv, 'saver')) acts.push(['plan', planWant(pv, 'saver')]);
    acts.push(...focusAct(pv, adaptiveFocus(pv)));
    return acts;
  },
};
const founder = {
  id: 'founder', mentor: 'hint', quizSkill: 0.95,
  decide(pv, ctx) {
    const ev = pv.event; if (!ev) return null; const m = pv.metrics; const d = ev.data || {};
    if (ev.type === 'deal') {
      const rent = isRentDeal(ev);
      const ownsNonRent = m.assets.some((a) => !RENT_KINDS.has(a.kind)) || (m.businesses || []).length > 0;
      const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => y.net - x.net)[0];
      if (!b || b.net <= 0) return pick('pass');
      if (rent && !(ownsNonRent && b.net >= 0.2 * m.expenses)) return pick('pass'); // prefers businesses: a rent asset only after a first non-rent one, and only a strong one (balance pass: 20% of E; was 10%)
      if (b.loanAmount && m.cashflow + b.net < 0) return pick('pass');
      const ins = ddFlagged(ev, b, 2); if (ins && ctxN(ctx) < 3) return pick(ins);
      if (ctxN(ctx) === 0 && !rivalsOf(ev).n && has(ev, 'offer:5') && !d.negotiated) return pick('offer:5');
      return pick(b.id);
    }
    return common(pv, ev, ctx, 'founder');
  },
  between(pv) {
    const m = pv.metrics; const E = m.expenses; const acts = [];
    if (m.credit && m.cash - m.credit >= 0.75 * E) acts.push(['payCredit']);
    const want = Math.round(E * 1.5) - m.savings; if (want > 500 && m.cash - want > 2 * E) acts.push(['save', want]);
    if (m.loans > 0 && m.loanPct > 1 && m.cash - m.loanUnit >= 2.5 * E) acts.push(['repay', 0]);
    if (m.life.plan !== planWant(pv, 'founder')) acts.push(['plan', planWant(pv, 'founder')]);
    const f = m.focus; const ops = f && f.options.find((o) => o.id === 'ops' && o.enabled);
    acts.push(...focusAct(pv, ops ? 'ops' : adaptiveFocus(pv)));
    return acts;
  },
};
const diversified = {
  id: 'diversified', mentor: 'hint', quizSkill: 0.95,
  decide(pv, ctx) {
    const ev = pv.event; if (!ev) return null; const m = pv.metrics; const d = ev.data || {};
    if (ev.type === 'deal') {
      const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => y.net - x.net)[0];
      if (!b || b.net <= 0) return pick('pass');
      const haveKind = m.assets.some((a) => a.kind === d.kind);
      if (haveKind && b.net < 0.05 * m.expenses) return pick('pass');                // one asset of each kind first (balance pass: a second one only if it adds ≥ 5% of E; was 10%)
      if (b.loanAmount && b.net < 0.08 * m.expenses) return pick('pass');             // a loan only for a clearly good deal (balance pass: 8% of E; was 15%)
      if (m.cash + m.savings - d.down < 3 * m.expenses && !b.loanAmount) return pick('pass');
      const insO = ev.options.find((o) => o.id === 'inspect:1');
      if (d.dd && d.dd.level === 0 && warnOf(ev) >= 1 && insO && insO.enabled && (insO.rivalRisk || 0) < 0.3 && claimedNet(ev, b) > 0 && ctxN(ctx) < 3) return pick('inspect:1');
      const ins = ddFlagged(ev, b, 99); if (ins && ctxN(ctx) < 3) return pick(ins);
      if (ctxN(ctx) === 0 && !rivalsOf(ev).n && has(ev, 'offer:5') && b.net > 0.3 * m.expenses && !d.negotiated) return pick('offer:5'); // balance pass: the step a seller usually takes (offer:10 lost 45% of these deals)
      return pick(b.id);
    }
    return common(pv, ev, ctx, 'diversified');
  },
  between(pv) {
    const m = pv.metrics; const E = m.expenses; const acts = [];
    if (m.credit && m.cash >= m.credit) acts.push(['payCredit']);
    const want = Math.round(E * 3.1) - m.savings; if (want > 300 && m.cash - want > 0.5 * E) acts.push(['save', want]);
    const dca = Math.max(0, Math.ceil(Math.max(0, m.cashflow) * 0.4 / 100) * 100); if (dca !== (m.life.autoInvest || 0) && Math.abs(dca - (m.life.autoInvest || 0)) >= 100) acts.push(['auto', dca]);
    if (m.loans > 0 && m.loanPct > 1 && m.cash - m.loanUnit >= 3 * E) acts.push(['repay', 0]);
    if (m.life.plan !== planWant(pv, 'diversified')) acts.push(['plan', planWant(pv, 'diversified')]);
    acts.push(...focusAct(pv, adaptiveFocus(pv)));
    return acts;
  },
};
const gambler = {
  id: 'gambler', mentor: 'hint', quizSkill: 0.4,
  decide(pv, ctx) {
    const ev = pv.event; if (!ev) return null; const m = pv.metrics; const d = ev.data || {};
    if (ev.type === 'deal') {
      // never inspects; always tries a lower offer first; believes the seller; the most leveraged buy
      // balance pass (G2): the lower offer is the smallest step — an offer the seller usually takes (offer:15 closed 70% of his deals)
      if (ctxN(ctx) === 0 && has(ev, 'offer:5') && !d.negotiated) return pick('offer:5');
      const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => (y.loanAmount || 0) - (x.loanAmount || 0) || claimedNet(ev, y) - claimedNet(ev, x))[0];
      return pick(b && claimedNet(ev, b) > -0.05 * m.expenses ? b.id : 'pass');
    }
    return common(pv, ev, ctx, 'gambler');
  },
  between(pv) {
    const m = pv.metrics; const acts = [];
    if (m.life.plan !== planWant(pv, 'gambler')) acts.push(['plan', planWant(pv, 'gambler')]);
    acts.push(...focusAct(pv, 'scout'));
    return acts;
  },
};
export const ARCHETYPES = { saver, founder, diversified, gambler };
