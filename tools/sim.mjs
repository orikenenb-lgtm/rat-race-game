#!/usr/bin/env node
// Balance simulator. Plays thousands of seeded games per world/character/policy and prints a report.
// Usage: node tools/sim.mjs [games=600] [worldId|all] [--md tools/balance-report.md] [--quiet]
//        node tools/sim.mjs --matrix [N=100] [w1..w4]   T2 acceptance matrix (writes tools/balance-t2-<w>.json; --md to merge)
//        node tools/sim.mjs --dominance [N=40] [w]      option-dominance scan (E.scoreOptions on every scored event)
//        node tools/sim.mjs --perf [w]                  describe / impactFor p95 and games/sec
// Policies carry a mentor level (default 'hint'); the T2 policies decide from E.publicView only (tools/policies.mjs).
import * as E from '../js/engine.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { facade, claimedNet, adaptiveFocus, runFocus, ddRule, medianDown } from './policies.mjs';

const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 600);
const ONLY = args.find((a) => /^w\d$/.test(a));
const MD = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
const QUIET = args.includes('--quiet');
// ablation switches for the smart policy (for checking that each mechanic's decisions matter): ABL=noHedge,alwaysVar,...
const ABL = new Set((process.env.ABL || '').split(',').filter(Boolean));

/* ---------- tiny local PRNG for the random policy (never touches game RNG) */
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const has = (ev, id) => ev.options.find((o) => o.id === id && o.enabled);
const firstEnabled = (ev, ids) => ids.find((id) => has(ev, id));

/* ---------- policies */
// Each policy: decide(st, ev, ctx) → [optionId, params] ; between(st, ctx) runs before each roll (loans/credit).
// `st` in a decide() may be a public facade (tools/policies.mjs facade) — read it only through M(st) and its public fields.
const M = (st) => st._m || E.metrics(st);
function bufferOf(st, months) { return M(st).expenses * months; }

function tradeAction(st, ev, pol, ctx) {
  const d = ev.data; const w = E.getWorld(st.worldId); const t = w.tickers[d.ticker]; const m = M(st);
  const start = t.start || d.price;
  if (pol === 'random') {
    if (ctx.n >= 2) return ['done'];
    const r = ctx.r();
    if (r < 0.35 && d.maxBuy > 0) return ['buy', { qty: 1 + Math.floor(ctx.r() * d.maxBuy) }];
    if (r < 0.55 && d.maxSell > 0) return ['sell', { qty: 1 + Math.floor(ctx.r() * d.maxSell) }];
    return ['done'];
  }
  if (ctx.n >= 2) return ['done'];
  const spare = (frac) => Math.floor(Math.max(0, st.cash - bufferOf(st, frac)) / d.price);
  if (pol === 'reckless') {
    if (d.qty && d.price >= d.avg * 4) return ['sell', { qty: d.qty }];
    if ((t.kind === 'crypto' || d.price >= start) && d.maxBuy > 0 && ctx.n === 0) return ['buy', { qty: d.maxBuy }];
    return ['done'];
  }
  if (pol === 'cautious') {
    if (d.div > 0 && d.price <= start && spare(3) > 0 && !t.kind) return ['buy', { qty: Math.floor(spare(3) / 2) || 1 }];
    if (t.kind === 'gold' && d.qty === 0 && spare(3) > 0 && ctx.n === 0) return ['buy', { qty: Math.max(1, Math.floor(spare(3) / 4)) }];
    return ['done'];
  }
  // greedy & smart: buy low, sell high
  const cheap = t.kind === 'bond' ? st.world.rate >= 6 : t.kind === 'usd' ? d.price <= 3300 : t.kind === 'gold' ? false : d.price <= start * 0.55;
  const rich = t.kind === 'bond' ? st.world.rate <= 3 : t.kind === 'usd' ? d.price >= 4000 : t.kind === 'gold' ? d.price >= d.avg * 1.3 : d.price >= Math.max(d.avg * 2.5, start * 1.5);
  if (d.qty > 0 && rich) return ['sell', { qty: d.qty }];
  if (pol === 'smart' && st.worldId === 'w4' && d.div > 0 && ctx.n === 0) {
    if (d.qty > 0 && d.price >= 125) return ['sell', { qty: d.qty }];
    const idle = st.cash - bufferOf(st, 3) - 600000;
    if (d.price <= 100 && idle > d.price * 10) return ['buy', { qty: Math.floor(idle * 0.5 / d.price) }];
    return ['done'];
  }
  if (pol === 'smart' && t.kind === 'gold' && ABL.has('noGold')) return ['done'];
  if (pol === 'smart' && t.kind === 'gold' && st.worldId === 'w3' && d.qty === 0 && ctx.n === 0) { const q = Math.floor(m.netWorth * 0.1 / d.price); if (q > 0 && q <= d.maxBuy) return ['buy', { qty: q }]; }
  if (pol === 'smart' && ABL.has('noTrade')) return ['done'];
  if (cheap && t.kind !== 'crypto' && ctx.n === 0) { const q = spare(pol === 'smart' ? 2 : 0.5); const qq = Math.floor(q * (pol === 'smart' ? 0.5 : 1)); if (qq > 0) return ['buy', { qty: qq }]; }
  return ['done'];
}

function dealScore(st, d) {
  const w = E.getWorld(st.worldId);
  if (w.goal.type === 'passive') return d.cf;
  // net-worth worlds: instant equity + ~24 months of cashflow
  return (d.discount || 0) * 1.5 + d.cf * 24 + (d.grow || 0) * d.value * 24 + (d.impact || 0) * 20000;
}

/* ---------- v3: monthly plan (time & energy) per policy, life dilemmas, negotiation */
function planFor(st, pol) {
  const L = st.life; const m = M(st);
  if (pol === 'reckless') return L.energy > 15 ? 'overtime' : 'work';
  if (pol === 'greedy') return L.energy >= 30 ? 'overtime' : 'work';
  if (pol === 'cautious') return L.energy < 40 || (L.plan === 'rest' && L.energy < 70) ? 'rest' : 'work';
  // smart: study early, rest when tired or unhappy, a little overtime when fresh
  if (L.energy < 35 || (L.plan === 'rest' && (L.energy < 75 || L.happiness < 62))) return 'rest';
  if (L.happiness < 57 && st.month > 6) return 'rest';
  if (!L.study.done && st.month <= 20 && L.energy >= 45) return 'study';
  if (L.energy >= 80 && m.cashflow > 0) return 'overtime';
  if (L.plan === 'overtime' && L.energy >= 50) return 'overtime';
  return 'work';
}
function lifePick(st, ev, pol) {
  const en = ev.options.filter((o) => o.enabled);
  const val = (o) => (o.effects.cash || 0) - (o.effects.monthly || 0) * (o.effects.months || 24) + (o.effects.salary || 0) * (o.effects.months || 24);
  if (pol === 'cautious') return en.slice().sort((a, b) => val(b) - val(a))[0].id;
  if (pol === 'reckless') return en.slice().sort((a, b) => val(a) - val(b))[0].id;
  if (pol === 'smart') { // money + happiness: one happiness point ≈ 4% of a month's salary
    const S = M(st).salary; const L = st.life;
    const score = (o) => val(o) + (o.effects.happiness || 0) * S * (L.happiness < 62 ? 0.6 : 0.25) + (o.effects.energy || 0) * S * (L.energy < 40 ? 0.05 : 0.01) - (o.loanAmount ? o.loanAmount * 0.2 : 0);
    return en.slice().sort((a, b) => score(b) - score(a))[0].id;
  }
  return (en.find((o) => o.primary) || en[0]).id;
}
function planEventPick(st, ev, pol) {
  const want = planFor(st, pol);
  if (pol === 'smart' && ev.options.find((o) => o.id === 'raise' && o.enabled) && ev.options.find((o) => o.id === 'raise').chance >= 0.45) return 'raise';
  const o = ev.options.find((x) => x.enabled && x.plan === want);
  return o ? o.id : 'ok';
}

export const POLICIES = {
  random: {
    decide(st, ev, ctx) {
      if (ev.type === 'trade') return tradeAction(st, ev, 'random', ctx);
      const en = ev.options.filter((o) => o.enabled && o.id !== 'done');
      if (!en.length) return ['done'];
      if (ctx.n >= 2) return [firstEnabled(ev, ['done', 'ok', 'pass']) || en[0].id];
      return [en[Math.floor(ctx.r() * en.length)].id];
    },
    between() {},
  },
  cautious: {
    decide(st, ev, ctx) {
      const d = ev.data; const w = E.getWorld(st.worldId);
      switch (ev.type) {
        case 'deal': {
          const ok = dealScore(st, d) > 0 && d.cf >= 0 && !d.loanNeeded && st.cash - d.down >= bufferOf(st, 0.5);
          if (!ok) return ['pass'];
          return [firstEnabled(ev, ['buyFix', 'buyHedge', 'buy']) || 'pass'];
        }
        case 'trade': return tradeAction(st, ev, 'cautious', ctx);
        case 'doodad': return [!d.need ? 'skip' : 'pay'];
        case 'market': return [ev.options.find((o) => o.id.startsWith('give:') && o.enabled && st.cash > bufferOf(st, 4)) ? 'give:0' : (has(ev, 'done') ? 'done' : 'ok')];
        case 'crisis': return ['ok'];
        case 'bank': return [has(ev, 'refi') && st.cash > d.refiFee + bufferOf(st, 1) ? 'refi' : 'ok'];
        case 'upgrade': { const t = ev.options.find((o) => o.id.startsWith('trim:') && o.enabled); return [t && st.cash > d.trims[0].cost + bufferOf(st, 2) ? t.id : 'pass']; }
        case 'fx': return [firstEnabled(ev, ['hedgeImp', 'hedgeExp']) || 'ok'];
        case 'shipping': return [has(ev, 'insure') && st.cash > d.fee + bufferOf(st, 1) ? 'insure' : 'ok'];
        case 'pitch': return [st.cash > d.checks[0] + bufferOf(st, 3) && d.team + d.traction >= 5 ? 'inv:0' : 'pass'];
        case 'giving': return [st.cash > d.levels[0].amount + bufferOf(st, 3) ? 'give:0' : 'pass'];
        case 'payday': case 'edu': return [planEventPick(st, ev, 'cautious')];
        case 'life': return [lifePick(st, ev, 'cautious')];
        case 'business': return [firstEnabled(ev, ['pass', 'ok'])];
        default: return [firstEnabled(ev, ['ok', 'done', 'pass']) || ev.options.find((o) => o.enabled).id];
      }
    },
    between(st) { betweenCommon(st, 1.5); if (!st.over) E.setPlan(st, planFor(st, 'cautious')); },
  },
  greedy: {
    decide(st, ev, ctx) { return greedyLike(st, ev, ctx, false); },
    between(st) { betweenCommon(st, 0.5); if (!st.over) E.setPlan(st, planFor(st, 'greedy')); },
  },
  smart: {
    decide(st, ev, ctx) { return greedyLike(st, ev, ctx, true); },
    between(st) { betweenCommon(st, 0.6, true); if (!st.over && !ABL.has('noPlan')) E.setPlan(st, planFor(st, 'smart')); },
  },
  // a kid who just taps the highlighted button every time (and never touches the loan buttons) — mentor level guide
  guideTapper: {
    mentor: 'guide',
    decide(st, ev, ctx) {
      if (ev.type === 'trade') return ['done'];
      const en = ev.options.filter((x) => x.enabled);
      if ((ev.type === 'payday' || ev.type === 'edu') && ev.data.focus && !ev.data.focus.locked && ctx.n === 0) { const s = ev.data.focus.options.find((x) => x.suggested && x.enabled); if (s && s.id !== 'none') E.setFocus(st, s.id, 0); }
      // no highlighted answer (personal life choices, lifestyle trade-offs): a kid picks one of the options at random
      const o = ev.options.find((x) => x.primary) || en[Math.floor(ctx.r() * en.length)];
      return [o.id, o.needsQty ? { qty: 1 } : undefined];
    },
    between() {},
  },
  reckless: {
    decide(st, ev, ctx) {
      const d = ev.data;
      switch (ev.type) {
        case 'deal': return [firstEnabled(ev, ['buyVar', 'buy']) || 'pass'];
        case 'trade': return tradeAction(st, ev, 'reckless', ctx);
        case 'doodad': return [firstEnabled(ev, ['sub', 'credit', 'pay'])];
        case 'market': if (ev.options.some((o) => o.id.startsWith('sell:'))) return [ctx.n === 0 ? ev.options[0].id : 'done']; return [has(ev, 'done') ? 'done' : 'ok'];
        case 'pitch': return [firstEnabled(ev, ['inv:2', 'inv:1', 'inv:0']) || 'pass'];
        case 'giving': return ['pass'];
        case 'upgrade': { const u = ev.options.find((o) => o.id.startsWith('up:') && o.enabled); return [u ? u.id : 'pass']; }
        case 'payday': case 'edu': return [planEventPick(st, ev, 'reckless')];
        case 'life': return [lifePick(st, ev, 'reckless')];
        default: return [firstEnabled(ev, ['ok', 'done', 'pass']) || ev.options.find((o) => o.enabled).id];
      }
    },
    between(st) { E.setPlan(st, planFor(st, 'reckless')); },
  },
};

/* ---------- T2 policies (decide from E.publicView only; tools/policies.mjs) */
const PV = (st, event) => E.publicView(st, { freeze: false, event }); // event: the card already described (no second describe)
const lifeValue = (o) => (o.effects.cash || 0) - (o.effects.monthly || 0) * (o.effects.months || 24) + (o.effects.salary || 0) * (o.effects.months || 24);
/** smart and its variants: greedyLike(smart) + a DD rule + a focus rule (+ the cycle signal for adaptive). */
function smartLike(v = {}) {
  const dd = v.dd || 'flagged'; const focus = v.focus || 'adaptive';
  const mods = (pv) => {
    const o2 = { dd };
    if (v.adaptive && pv.metrics.econ) { const lb = pv.metrics.econ.label; if (lb === 'מיתון' || lb === 'האטה') { o2.buf = 2; o2.noLoan = true; } else if (lb === 'צמיחה') o2.buf = 0.6; }
    return o2;
  };
  return {
    mentor: 'hint', quiz: 'smart',
    decide(st, ev, ctx) { const pv = PV(st, ev); return greedyLike(facade(pv), ev, ctx, true, mods(pv)); },
    between(st) {
      const pv = PV(st); const lb = pv.metrics.econ ? pv.metrics.econ.label : null;
      betweenCommon(st, v.adaptive && (lb === 'מיתון' || lb === 'האטה') ? 2 : 0.6, true);
      if (!st.over && !ABL.has('noPlan')) E.setPlan(st, planFor(facade(PV(st)), 'smart'));
      if (st.over || focus === 'none') return;
      if (v.adaptive && pv.metrics.econ && pv.metrics.econ.signal >= 35 && pv.metrics.econ.signal <= 60 && !(pv.metrics.econ.sharp)) { const f = PV(st).metrics.focus; if (f && !f.locked && f.options.find((o) => o.id === 'research' && o.enabled) && PV(st).metrics.life.energy >= 45) { E.setFocus(st, 'research', 0); return; } }
      runFocus(st, focus);
    },
  };
}
Object.assign(POLICIES, {
  smart: smartLike(),
  adaptive: smartLike({ adaptive: true }),
  // the literal highlight-free tapper: uniform random among enabled options, never asks for hints, no between-roll actions
  blindTapper: {
    mentor: 'hint', quiz: 'tapper',
    decide(st, ev, ctx) {
      if (ev.type === 'trade') return ['done'];
      const en = ev.options.filter((x) => x.enabled);
      if (ctx.n >= 3) return [firstEnabled(ev, ['done', 'pass', 'ok']) || en[0].id];
      const o = en[Math.floor(ctx.r() * en.length)];
      return [o.id, o.needsQty ? { qty: 1 } : undefined];
    },
    between() {},
  },
  // believes the seller: buys whenever the claimed net > 0 and it can pay or borrow; no inspections, no offers, no fund, no focus
  naive: {
    mentor: 'hint', quiz: 'tapper',
    decide(st, ev, ctx) {
      switch (ev.type) {
        case 'deal': { const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => claimedNet(ev, y) - claimedNet(ev, x))[0]; return [b && claimedNet(ev, b) > 0 ? b.id : 'pass']; }
        case 'doodad': return [has(ev, 'skip') ? 'skip' : 'pay'];
        case 'trade': return ['done'];
        case 'payday': case 'edu': { const w = ev.options.find((o) => o.enabled && o.kind === 'plan' && o.plan === 'work'); return [w ? w.id : 'ok']; }
        case 'life': return [ev.options.filter((o) => o.enabled).sort((a, b) => lifeValue(b) - lifeValue(a))[0].id];
        case 'market': return [has(ev, 'done') ? 'done' : 'ok'];
        case 'business': return [firstEnabled(ev, ['pass', 'ok'])];
        default: return [firstEnabled(ev, ['ok', 'pass', 'done', 'skip']) || ev.options.find((o) => o.enabled).id];
      }
    },
    between(st) { if (PV(st).metrics.life.plan !== 'work') E.setPlan(st, 'work'); },
  },
  // archetypes (gameplay.md §7d), played as the player — the same code T6 rivals will reuse
  saver: {
    mentor: 'hint', quiz: 'cautious',
    decide(st, ev, ctx) {
      const pv = PV(st, ev); const f = facade(pv); const m = pv.metrics; const d = ev.data;
      if (ev.type === 'deal') { const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled && !o.loanAmount).sort((x, y) => y.net - x.net)[0]; if (!b || b.net <= 0) return ['pass']; const ins = ddRule('flagged', pv, ev, b.id); if (ins && ctx.n < 2) return [ins]; return [m.cash + m.savings - d.down >= 6 * m.expenses ? b.id : 'pass']; }
      if (ev.type === 'doodad') return [has(ev, 'skip') ? 'skip' : (has(ev, 'inst3') ? 'inst3' : 'pay')];
      if (ev.type === 'trade') return ['done'];
      return POLICIES.cautious.decide(f, ev, ctx);
    },
    between(st) {
      const m = PV(st).metrics; const want = Math.round(m.expenses * 3.1) - m.savings;
      if (want > 300 && m.cash - want > m.expenses) E.moveSavings(st, want);
      const dca = Math.max(0, Math.round(Math.max(0, m.cashflow) * 0.2 / 100) * 100); if (Math.abs(dca - (m.life.autoInvest || 0)) > Math.max(300, dca * 0.3)) E.setAutoInvest(st, dca);
      if (m.credit && m.cash >= m.credit) E.payCredit(st);
      if (!st.over) E.setPlan(st, planFor(facade(PV(st)), 'cautious'));
    },
  },
  founder: {
    mentor: 'hint', quiz: 'smart',
    decide(st, ev, ctx) {
      const pv = PV(st, ev); const f = facade(pv); const w = E.getWorld(pv.worldId); const d = ev.data;
      if (ev.type === 'business') { if (d.mode === 'offer') return [has(ev, 'start') ? 'start' : 'pass']; return [ctx.n === 0 && has(ev, 'biz:suggest') ? 'biz:suggest' : 'ok']; }
      if (ev.type === 'deal' && !(w.kinds[d.kind] || {}).rent) { const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => y.net - x.net)[0]; if (b && b.net > 0) { const ins = ddRule('flagged', pv, ev, b.id); return [ins && ctx.n < 2 ? ins : b.id]; } return ['pass']; }
      return greedyLike(f, ev, ctx, true, { dd: 'flagged' });
    },
    between(st) { betweenCommon(st, 0.8, true); if (!st.over) E.setPlan(st, planFor(facade(PV(st)), 'smart')); if (!st.over) runFocus(st, (PV(st).metrics.focus || { options: [] }).options.find((o) => o.id === 'ops' && o.enabled) ? 'ops' : 'adaptive'); },
  },
  diversified: {
    mentor: 'hint', quiz: 'smart',
    decide(st, ev, ctx) {
      const pv = PV(st, ev); const f = facade(pv); const m = pv.metrics; const d = ev.data;
      if (ev.type === 'deal') { const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => y.net - x.net)[0]; if (!b || b.net <= 0) return ['pass']; const ins = ddRule('flagged', pv, ev, b.id); if (ins && ctx.n < 2) return [ins]; const haveKind = m.assets.some((a) => a.kind === d.kind); if (b.loanAmount > 2 * Math.max(0, m.cashflow) * 4) return ['pass']; return [(!haveKind || b.net >= 0.1 * m.expenses) ? b.id : 'pass']; }
      return greedyLike(f, ev, ctx, true, { dd: 'flagged' });
    },
    between(st) {
      const m = PV(st).metrics; const want = Math.round(m.expenses * 3.1) - m.savings;
      if (want > 300 && m.cash - want > m.expenses * 0.5) E.moveSavings(st, want);
      const m2 = PV(st).metrics; const spare = m2.cash - 2 * m2.expenses; const px = m2.index.price;
      if (spare > 0 && px > 0) { const qn = Math.floor(spare * 0.4 / px); if (qn > 0) E.invest(st, 'buy', qn); }
      if (m2.credit && m2.cash >= m2.credit) E.payCredit(st);
      if (!st.over) E.setPlan(st, planFor(facade(PV(st)), 'smart'));
    },
  },
  gambler: {
    mentor: 'hint', quiz: 'reckless',
    decide(st, ev, ctx) {
      const pv = PV(st, ev); const f = facade(pv); const d = ev.data;
      switch (ev.type) {
        case 'deal': { const b = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((x, y) => claimedNet(ev, y) - claimedNet(ev, x))[0]; return [b && claimedNet(ev, b) > -0.05 * pv.metrics.expenses ? b.id : 'pass']; }
        case 'trade': if (ctx.n === 0 && d.maxBuy > 0 && (d.kind === 'crypto' || d.kind === 'stock')) return ['buy', { qty: d.maxBuy }]; if (d.qty > 0 && d.avg && d.price >= d.avg * 2) return ['sell', { qty: d.qty }]; return ['done'];
        case 'pitch': return [firstEnabled(ev, ['inv:2', 'inv:1', 'inv:0']) || 'pass'];
        case 'doodad': return [firstEnabled(ev, ['credit', 'inst3', 'pay'])];
        case 'business': if (d.mode === 'offer') return [has(ev, 'start') ? 'start' : 'pass']; return ['ok'];
        default: return greedyLike(f, ev, ctx, false);
      }
    },
    between(st) { const L = PV(st).metrics.life; E.setPlan(st, L.energy > 35 ? 'overtime' : 'work'); },
  },
});
// focus variants (smart with the focus rule replaced) and DD variants (smart with the inspect rule replaced)
for (const id of ['none', 'scout', 'debt', 'ops', 'frugal', 'network', 'research', 'adaptive']) POLICIES['f:' + id] = smartLike({ focus: id });
for (const id of ['never', 'always', 'flagged', 'borderline']) POLICIES['dd:' + id] = smartLike({ dd: id });
POLICIES.tapper = POLICIES.guideTapper; // v3 name
const has2 = has; void has2;

function betweenCommon(st, bufMonths, smart = false) {
  const m = E.metrics(st);
  // smart: a small emergency fund early; 3 months of expenses once freedom is in sight (★★★ needs it)
  if (smart && !ABL.has('noFund') && !st.over) { const near = m.goalProgress >= 0.75; const want = Math.round(m.expenses * (near ? 3.1 : 1.5)) - st.savings; if (want > 500 && st.cash - want > m.expenses * (near ? 0.5 : 2)) E.moveSavings(st, want); }
  // cheap bank loans are worth keeping while cash can buy assets that earn more; repay expensive ones first
  const buf = m.expenses * (smart && m.loanPct <= 3 ? Math.max(bufMonths, 2.5) : bufMonths);
  if (st.credit && st.cash - st.credit >= buf * 0.5) E.payCredit(st);
  let guard = 0;
  while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= buf && guard++ < 50) { const r = E.repayLoan(st); if (!r.ok || st.over) break; }
}

function greedyLike(st, ev, ctx, smart, o2 = {}) {
  const d = ev.data; const w = E.getWorld(st.worldId); const m = M(st);
  const buf = m.expenses * (o2.buf ?? (smart ? 1 : 0.3));
  switch (ev.type) {
    case 'deal': {
      const score = dealScore(st, d);
      let cf = d.cf; let pick = firstEnabled(ev, ['buy', 'buyVar']);
      if (w.mechanic === 'rate' && d.cfFix != null) {
        // smart: lock low rates, float high ones (they tend to come back down)
        if (smart && !ABL.has('alwaysVar') && (ABL.has('alwaysFix') || st.world.rate <= 4.25) && d.cfFix > 0) { pick = 'buyFix'; cf = d.cfFix; } else { pick = 'buyVar'; cf = d.cfVar; }
      }
      if (w.mechanic === 'fx' && d.sens && smart) {
        const usd = st.world.usd; const ref = w.fx.ref;
        if (!ABL.has('noHedge') && (ABL.has('hedgeAll') || (d.sens < 0 && usd < ref - 0.05) || (d.sens > 0 && usd > ref + 0.05))) pick = 'buyHedge';
      }
      if (!has(ev, pick)) return ['pass'];
      if (smart && ABL.has('onlyImporters') && !(d.sens < 0)) return ['pass'];
      if (smart && o2.dd && ctx.n < 3) { const ins = ddRule(o2.dd, st._pv, ev, pick); if (ins) return [ins]; }
      if (smart && !ABL.has('noNeg') && ctx.n === 0) { const off = ev.options.find((x) => x.id === 'offer:5' && x.enabled && x.chance >= 0.85); if (off && (ev.options.find((x) => x.id === pick).net || 0) > 0) return [off.id]; }
      const o = ev.options.find((x) => x.id === pick);
      const loanCost = o.loanMonthly || 0; const net = smart ? o.net : claimedNet(ev, o);
      if (d.dd) cf = smart ? o.net + loanCost : claimedNet(ev, o) + loanCost; // T2: smart values the basis, greedy believes the seller
      if (o2.noLoan && o.loanAmount) return ['pass'];
      if (w.goal.type === 'passive') {
        if (cf <= 0) return ['pass'];
        if (smart && net <= 0) return ['pass'];
        if (!smart && o.loanAmount && cf <= loanCost * 0.4) return ['pass'];
        if (smart && o.loanAmount && m.cashflow + net < 0) return ['pass'];
        return [pick];
      }
      if (score <= 0 || (cf < 0 && smart)) return ['pass'];
      if (smart && (d.discount || 0) < 0 && cf * 24 < -d.discount * 2) return ['pass'];
      if (o.loanAmount && smart && o.loanAmount > (d.discount > d.cost * 0.15 ? 8 : 4) * Math.max(m.cashflow, 0)) return ['pass'];
      return [pick];
    }
    case 'trade': return tradeAction(st, ev, smart ? 'smart' : 'greedy', ctx);
    case 'doodad': if (!d.need && (smart || st.cash < d.amount)) return [has(ev, 'skip') ? 'skip' : 'pay'];
      return [smart || st.cash >= d.amount ? 'pay' : firstEnabled(ev, ['credit', 'pay'])];
    case 'market': {
      const sells = ev.options.filter((o) => o.id.startsWith('sell:') && o.enabled);
      if (sells.length && smart && ABL.has('noSell')) return ['done'];
      if (sells.length) {
        for (const o of sells) {
          const off = d.offers.find((x) => 'sell:' + x.assetId.slice(1) === o.id);
          const k = smart ? 80 : 24;
          const grow = (m.assets.find((a) => a.id === off.assetId) || {}).grow || 0;
          if (w.goal.type === 'passive' ? off.net > off.cf * k && off.profit > 0 : (smart && grow <= 0.006) || (off.profit > 0 && off.net > off.cf * (smart ? 24 : 30))) return [o.id];
        }
        return ['done'];
      }
      if (d.match) { const imp = m.goalParts.find((x) => x.key === 'impact'); const ok = smart && imp && imp.progress < 1; const k = ok ? [1, 0].find((j) => has(ev, 'give:' + j) && st.cash - d.levels[j].amount > buf) : null; return [k != null ? 'give:' + k : 'done']; }
      return [has(ev, 'done') ? 'done' : 'ok'];
    }
    case 'crisis': return [smart && has(ev, 'okSellGold') ? 'okSellGold' : 'ok'];
    case 'bank': {
      if (smart && !ABL.has('alwaysVar') && has(ev, 'refi') && d.to <= 4.5 && st.cash > d.refiFee + buf) return ['refi'];
      if (smart && has(ev, 'prepay') && d.to >= 7 && st.cash > buf * 3) return ['prepay'];
      return ['ok'];
    }
    case 'upgrade': {
      if (smart && ABL.has('noUpgrade')) return ['pass'];
      const loanPct = m.loanPct;
      const opts = [];
      for (const u of d.upgrades) opts.push({ id: 'up:' + u.assetId.slice(1), cost: u.cost, gain: u.gain });
      for (const t of d.trims) opts.push({ id: 'trim:' + t.expenseId, cost: t.cost, gain: t.cut });
      const ok = opts.filter((o) => has(ev, o.id) && o.gain * 12 / o.cost >= (smart ? 0.45 : 0.3) && (st.cash - o.cost >= (smart ? buf * 0.5 : 0) || (smart && o.gain > o.cost * loanPct / 100)));
      ok.sort((a, b) => b.gain / b.cost - a.gain / a.cost);
      return [ok.length ? ok[0].id : 'pass'];
    }
    case 'fx': {
      if (!smart || ABL.has('noHedge')) return ['ok'];
      const ref = w.fx.ref;
      if (ABL.has('hedgeAll')) return [firstEnabled(ev, ['hedgeImp', 'hedgeExp']) || 'ok'];
      if (has(ev, 'hedgeImp') && d.to < ref - 0.05 && st.cash > d.hedgeFeeImporters) return ['hedgeImp'];
      if (has(ev, 'hedgeExp') && d.to > ref + 0.05 && st.cash > d.hedgeFeeExporters) return ['hedgeExp'];
      return ['ok'];
    }
    case 'shipping': return [smart && has(ev, 'insure') && d.fee < st.cash * 0.1 ? 'insure' : 'ok'];
    case 'pitch': {
      const q = d.team + d.traction;
      if (!smart) return [has(ev, 'inv:1') && st.cash > d.checks[1] ? 'inv:1' : 'pass'];
      if (ABL.has('noAngel')) return ['pass'];
      if (ABL.has('bigChecks')) return [has(ev, 'inv:2') && st.cash - d.checks[2] > buf * 0.5 ? 'inv:2' : has(ev, 'inv:1') && st.cash - d.checks[1] > buf * 0.5 ? 'inv:1' : 'pass'];
      if (d.hype >= 3 || q <= 2) return ['pass'];
      // bigger checks for the best pitches, but never more than ~15% of liquid cash (diversify!)
      const cap = Math.max(d.checks[0], st.cash * 0.25);
      const want = q >= 5 && d.hype === 1 ? 2 : q >= 4 ? 1 : 0;
      const i = [want, 1, 0].find((k) => k <= want && d.checks[k] <= cap && has(ev, 'inv:' + k) && st.cash - d.checks[k] > buf * 0.5);
      return [i != null ? 'inv:' + i : 'pass'];
    }
    case 'giving': {
      const imp = m.goalParts.find((x) => x.key === 'impact');
      const nw = m.goalParts.find((x) => x.key === 'netWorth');
      if (!smart) { // greedy gives only once rich
        if (nw.progress >= 0.8 && imp.progress < 1) { const i = [2, 1, 0].find((k) => has(ev, 'give:' + k) && st.cash > d.levels[k].amount); return [i != null ? 'give:' + i : 'pass']; }
        return ['pass'];
      }
      if (ABL.has('giveLate')) { if (nw.progress >= 0.85 && imp.progress < 1) { const i = [2, 1, 0].find((k) => has(ev, 'give:' + k) && st.cash > d.levels[k].amount); return [i != null ? 'give:' + i : 'pass']; } return ['pass']; }
      if (!st.pledges.length && has(ev, 'pledge') && m.cashflow > d.pledge.amount * 3) return ['pledge'];
      // keep committed impact (realised + still vesting) on a schedule that is complete a bit before net worth is
      const committed = imp.value + (m.worldIndicators.impactPending || 0);
      const want = imp.target * Math.max(0, Math.min(1, (nw.progress - 0.2) / 0.6));
      const gap = want - committed;
      if (gap > 3 && (d.eff >= 1 || (gap > 30 && d.eff >= 0.9))) {
        const k = [0, 1, 2].find((j) => d.levels[j].impact >= gap * 0.8 && has(ev, 'give:' + j) && st.cash - d.levels[j].amount > buf) ?? [2, 1, 0].find((j) => d.levels[j].impact < gap && has(ev, 'give:' + j) && st.cash - d.levels[j].amount > buf * 2);
        return [k != null ? 'give:' + k : 'pass'];
      }
      return ['pass'];
    }
    case 'mystery': return [ev.options.find((o) => o.enabled).id];
    case 'business': if (!smart) return [firstEnabled(ev, ['pass', 'ok'])]; return [(ev.options.find((x) => x.primary && x.enabled) || ev.options.find((x) => ['ok', 'pass'].includes(x.id))).id];
    case 'payday': case 'edu': return [planEventPick(st, ev, smart ? 'smart' : 'greedy')];
    case 'life': return [lifePick(st, ev, smart ? 'smart' : 'greedy')];
    default: return [firstEnabled(ev, ['ok', 'done', 'pass']) || ev.options.find((o) => o.enabled).id];
  }
}

/* ---------- play one game */
const QUIZ_SKILL = { random: 0.33, cautious: 0.8, greedy: 0.7, smart: 0.95, reckless: 0.4, tapper: 0.5 };
export function play(worldId, charId, seed, pol, capMonths, opts = {}) {
  const { log, ...gameOpts } = opts;
  const P = POLICIES[pol];
  const st = E.createGame({ worldId, charId, seed, mode: 'free', mentor: P.mentor || 'hint', ...gameOpts });
  const r = prng(seed * 7919 + pol.length);
  const skill = QUIZ_SKILL[P.quiz || pol] ?? 0.7;
  let end = null; let guard = 0;
  const resolve = (ev0) => { // one event until it closes (non-closing options count against ctx.n; n ≥ 3 → done/pass/ok)
    let ev = ev0; let n = 0;
    while (ev) {
      let choice;
      if (ev.auto) choice = [ev.options[0].id];
      else if (ev.type === 'mystery' && ev.data.kind === 'quiz') {
        const c = E.getWorld(worldId).mystery.find((x) => x.kind === 'quiz' && x.text === ev.data.question);
        choice = [r() < skill ? 'a' + c.correct : 'a' + ((c.correct + 1) % c.answers.length)];
      } else if (n >= 6) choice = [(ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id];
      else choice = P.decide(st, ev, { r, n });
      let res = E.choose(st, ev, choice[0], choice[1]);
      if (opts.log) console.log(`m${st.month} t${st.turn} ${ev.type}:${ev.title} -> ${choice[0]}${choice[1] ? JSON.stringify(choice[1]) : ''} | cash ${st.cash} loans ${st.loans} cf ${E.metrics(st).cashflow} nw ${E.metrics(st).netWorth}${res.news && res.news.length ? ' NEWS ' + res.news.map((x) => x.text).join(' / ') : ''}`);
      if (!res.ok) res = E.choose(st, ev, ev.options.find((o) => o.id === 'done' || o.id === 'pass' || o.id === 'ok') ? ev.options.find((o) => ['done', 'pass', 'ok'].includes(o.id)).id : ev.options.find((o) => o.enabled).id);
      n++;
      if (res.end) end = res.end;
      ev = res.event;
      if (n > 40) throw new Error('event loop ' + ev?.type);
    }
  };
  while (!end && st.month <= capMonths && guard++ < 5000) {
    P.between(st, { r });
    if (st.over) { end = st.result; break; }
    if (st.pending) { resolve(E.currentEvent(st)); if (end || st.over) { end = end || st.result; break; } } // e.g. the ops focus opened the business panel
    E.rollDice(st);
    resolve(E.landing(st));
  }
  return { st, end };
}

/* ---------- statistics */
const q = (xs, p) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1) + 0.5)))]; };
const pctS = (x) => (x * 100).toFixed(0) + '%';

export function runWorld(worldId, n = N, pols = Object.keys(POLICIES)) {
  const w = E.getWorld(worldId);
  const rows = [];
  for (const ch of w.characters) for (const pol of pols) {
    const lim = ch.maxMonths || w.maxMonths; const cap = Math.round(lim * 1.6);
    const happy = []; let burn = 0, blocked = 0;
    const months = [], turnsWin = [], turnsAll = []; let wins = 0, winsLim = 0, auto = 0, bankrupt = 0, bad = 0, stars = [0, 0, 0, 0], loanMax = [];
    for (let i = 0; i < n; i++) {
      const seed = 1000 + i * 7 + worldId.charCodeAt(1) * 100003;
      const { st, end } = play(worldId, ch.id, seed, pol, cap);
      turnsAll.push(st.turn);
      if (st.stats.autoLoans > 0) auto++;
      if (st.stats.bad > 0) bad++;
      loanMax.push(st.stats.maxLoans);
      if (end && end.reason === 'bankrupt') bankrupt++;
      happy.push(Math.round(st.life.happiness)); burn += st.life.burnouts ? 1 : 0;
      if (end && end.status === 'won') { wins++; months.push(end.months); turnsWin.push(st.turn); if (end.months <= lim) winsLim++; stars[end.stars]++; if (end.starsBlockedByHappiness) blocked++; }
      else stars[0]++;
    }
    rows.push({ world: worldId, char: ch.id, pol, n, winLim: winsLim / n, win: wins / n, med: q(months, 0.5), p10: q(months, 0.1), p90: q(months, 0.9), months, turnsMed: q(turnsWin, 0.5), turnsAll: q(turnsAll, 0.5), auto: auto / n, bankrupt: bankrupt / n, bad: bad / n, stars, loanMed: q(loanMax, 0.5), happy: q(happy, 0.5), burn: burn / n, blocked: blocked / n });
  }
  return rows;
}

function table(rows) {
  const head = '| דמות | מדיניות | ניצחון בזמן | חציון חודשים | p10 | p90 | תורות (חציון) | הלוואת חירום | פשט רגל | עסקה רעה | אושר (חציון) | נשחקו | ★★★ נחסם באושר | ★0/1/2/3 |';
  const sep = '|' + '---|'.repeat(14);
  const lines = rows.map((r) => `| ${r.char} | ${r.pol} | ${pctS(r.winLim)} | ${isNaN(r.med) ? '—' : r.med} | ${isNaN(r.p10) ? '—' : r.p10} | ${isNaN(r.p90) ? '—' : r.p90} | ${isNaN(r.turnsMed) ? '—' : r.turnsMed} | ${pctS(r.auto)} | ${pctS(r.bankrupt)} | ${pctS(r.bad)} | ${r.happy} | ${pctS(r.burn)} | ${pctS(r.blocked)} | ${r.stars.map((x) => Math.round(x / r.n * 100)).join('/')} |`);
  return [head, sep, ...lines].join('\n');
}

function summary(worldId, rows) {
  const w = E.getWorld(worldId);
  const by = (pol) => rows.filter((r) => r.pol === pol);
  const all = (pol) => by(pol).flatMap((r) => r.months);
  const good = all('smart');
  const winLim = (pol) => by(pol).reduce((s, r) => s + r.winLim, 0) / by(pol).length;
  const turns = by('smart').map((r) => r.turnsMed);
  return {
    world: worldId, name: w.name, maxMonths: w.maxMonths, t2: w.stars.t2, t3: w.stars.t3,
    smartMed: q(good, 0.5), smartP10: q(good, 0.1), smartP12: q(good, 0.12), smartP90: q(good, 0.9), greedyMed: q(all('greedy'), 0.5), cautiousMed: q(all('cautious'), 0.5),
    winSmart: winLim('smart'), winGreedy: winLim('greedy'), winCautious: winLim('cautious'), winRandom: winLim('random'), winReckless: winLim('reckless'),
    bankruptReckless: by('reckless').reduce((s, r) => s + r.bankrupt, 0) / by('reckless').length,
    autoReckless: by('reckless').reduce((s, r) => s + r.auto, 0) / by('reckless').length,
    smart3: by('smart').reduce((s, r) => s + r.stars[3], 0) / Math.max(1, by('smart').reduce((s, r) => s + r.n, 0)),
    smart2: by('smart').reduce((s, r) => s + r.stars[2] + r.stars[3], 0) / Math.max(1, by('smart').reduce((s, r) => s + r.n, 0)),
    greedy3: by('greedy').reduce((s, r) => s + r.stars[3], 0) / Math.max(1, by('greedy').reduce((s, r) => s + r.n, 0)),
    winTapper: winLim('tapper'), tapper3: by('tapper').reduce((s, r) => s + r.stars[3], 0) / Math.max(1, by('tapper').reduce((s, r) => s + r.n, 0)),
    tapperMed: q(all('tapper'), 0.5), tapperTurns: q(by('tapper').map((r) => r.turnsMed), 0.5), turnsAll: q(rows.filter((r) => r.pol === 'smart' || r.pol === 'tapper').map((r) => r.turnsMed), 0.5), turnsDefault: by('smart')[0].turnsMed, defaultChar: by('smart')[0].char,
    turnsSmart: q(turns, 0.5),
  };
}


/* ---------- T2: acceptance matrix, dominance scan, performance (spec §13) */
const T2_CORE = ['guideTapper', 'blindTapper', 'naive', 'smart', 'adaptive', 'cautious', 'greedy', 'saver', 'founder', 'diversified', 'gambler'];
const T2_FOCUS = ['f:none', 'f:scout', 'f:debt', 'f:ops', 'f:frugal', 'f:network', 'f:research'];
const T2_DD = ['dd:never', 'dd:always', 'dd:borderline'];
const T2_ABL = { 'abl:noCycle': { _dev: { noCycle: true } }, 'abl:noDD': { _dev: { noDD: true } } };
export const seedOf = (wid, i) => 1000 + i * 7 + wid.charCodeAt(1) * 100003;
/** One world: every policy × character × N seeds, tagged with the seed's cycle bucket. Compact records. */
export function matrixWorld(wid, n, pols = [...T2_CORE, ...T2_FOCUS, ...T2_DD, ...Object.keys(T2_ABL)], onRow) {
  const w = E.getWorld(wid); const recs = []; const t0 = Date.now();
  for (const ch of w.characters) {
    const T = E.starThresholds(w, ch.id); const lim = T.maxMonths; const cap = Math.round(lim * 1.6);
    const buckets = Array.from({ length: n }, (_, i) => E.CY.cycleBucket(E.cyclePath(seedOf(wid, i), wid, lim), lim));
    for (const pol of pols) {
      const base = T2_ABL[pol] ? 'smart' : pol; const opts = T2_ABL[pol] || {};
      for (let i = 0; i < n; i++) {
        const { st, end } = play(wid, ch.id, seedOf(wid, i), base, cap, opts);
        const won = !!(end && end.status === 'won');
        recs.push([pol, ch.id, i, buckets[i], won ? 1 : 0, won && end.months <= lim ? 1 : 0, won ? end.months : null, end ? end.stars || 0 : 0, st.stats.inspections || 0, st.dq.hints || 0]);
      }
      if (onRow) onRow(pol, ch.id, ((Date.now() - t0) / 1000).toFixed(0));
    }
  }
  return recs;
}
const med = (xs) => (xs.length ? q(xs, 0.5) : Infinity);
function cellStats(recs) { const n = recs.length; const it = recs.filter((r) => r[5]).length; return { n, inTime: n ? it / n : 0, med: med(recs.filter((r) => r[6] != null).map((r) => r[6])), star3: n ? recs.filter((r) => r[7] >= 3).length / n : 0 }; }
const better = (a, b) => a.inTime > b.inTime + 1e-9 || (Math.abs(a.inTime - b.inTime) < 1e-9 && a.med < b.med);
/** All gates A1–A9 from the per-world record files. */
export function gates(byWorld) {
  const G = {}; const worlds = Object.keys(byWorld).sort();
  const of = (wid, pol, f = () => true) => byWorld[wid].recs.filter((r) => r[0] === pol && f(r));
  const pooled = (wid, pol) => cellStats(of(wid, pol));
  G.A1 = worlds.map((wid) => { const p = pooled(wid, 'guideTapper'); const chars = [...new Set(byWorld[wid].recs.map((r) => r[1]))].map((c) => ({ c, s: cellStats(of(wid, 'guideTapper', (r) => r[1] === c)) })); const worst = chars.sort((a, b) => a.s.inTime - b.s.inTime)[0]; return { wid, inTime: p.inTime, worstChar: worst.c, worstInTime: worst.s.inTime, pass: p.inTime >= 0.65 && worst.s.inTime >= 0.5 }; });
  G.A2 = worlds.map((wid) => { const p = pooled(wid, 'blindTapper'); return { wid, inTime: p.inTime, pass: p.inTime <= 0.30 }; });
  G.A2b = worlds.map((wid) => { const p = pooled(wid, 'naive'); return { wid, inTime: p.inTime, pass: p.inTime <= 0.40 }; });
  G.A3 = worlds.map((wid) => { const s = pooled(wid, 'smart'), a = pooled(wid, 'adaptive'); return { wid, smart: s.inTime, adaptive: a.inTime, smartMed: s.med, adaptiveMed: a.med, pass: [s.inTime, a.inTime].every((x) => x >= 0.55 && x <= 0.75) }; });
  // cells: world × character × bucket with ≥ 15 games
  const cells = [];
  for (const wid of worlds) { const keys = new Set(byWorld[wid].recs.filter((r) => r[0] === 'smart').map((r) => r[1] + '|' + r[3])); for (const k of keys) { const [c, b] = k.split('|'); if (of(wid, 'smart', (r) => r[1] === c && r[3] === b).length >= 15) cells.push({ wid, c, b }); } }
  const A4SET = ['guideTapper', 'naive', 'cautious', 'greedy', 'smart', 'adaptive', 'saver', 'founder', 'diversified', 'gambler'];
  const bestCount = Object.fromEntries(A4SET.map((p) => [p, 0]));
  for (const cell of cells) { const st = A4SET.map((p) => ({ p, s: cellStats(of(cell.wid, p, (r) => r[1] === cell.c && r[3] === cell.b)) })); const top = st.filter((x) => !st.some((y) => better(y.s, x.s))); for (const t of top) bestCount[t.p] += 1 / top.length; }
  G.A4 = { cells: cells.length, share: Object.fromEntries(Object.entries(bestCount).map(([p, k]) => [p, cells.length ? k / cells.length : 0])) }; G.A4.pass = Object.values(G.A4.share).every((x) => x <= 0.6);
  const FV = ['f:none', 'f:scout', 'f:debt', 'f:ops', 'f:frugal', 'f:network', 'f:research'];
  G.A5 = FV.slice(1).map((fp) => { let best = 0, worse = 0; for (const cell of cells) { const S = Object.fromEntries(FV.map((p) => [p, cellStats(of(cell.wid, p, (r) => r[1] === cell.c && r[3] === cell.b))])); if (!FV.some((p) => p !== fp && better(S[p], S[fp]))) best++; if (S['f:none'].inTime - S[fp].inTime >= 0.03 || S[fp].med - S['f:none'].med >= 2) worse++; } return { focus: fp, bestCells: best, worseThanNoneCells: worse, pass: best >= 1 && worse >= 1 }; });
  const beats = (a, b) => a.inTime >= b.inTime - 1e-9 && a.med <= b.med && (a.inTime > b.inTime + 1e-9 || a.med < b.med);
  const ddW = worlds.map((wid) => { const f = pooled(wid, 'smart'), nv = pooled(wid, 'dd:never'), al = pooled(wid, 'dd:always'), bl = pooled(wid, 'dd:borderline'); return { wid, flagged: f, never: nv, always: al, borderline: bl, beats: beats(f, nv) && beats(f, al) }; });
  const pool = (pol) => cellStats(worlds.flatMap((wid) => of(wid, pol)));
  G.A6 = { worlds: ddW, pooled: { flagged: pool('smart'), never: pool('dd:never'), always: pool('dd:always') } };
  G.A6.pass = beats(G.A6.pooled.flagged, G.A6.pooled.never) && beats(G.A6.pooled.flagged, G.A6.pooled.always) && ddW.filter((x) => x.beats).length >= Math.min(3, worlds.length);
  G.A6b = { worlds: ddW.map((x) => ({ wid: x.wid, alwaysWorse: better(x.never, x.always) })), pass: ddW.some((x) => better(x.never, x.always)) };
  const sm = Object.fromEntries(worlds.map((w) => [w, pooled(w, 'smart').inTime])); const gt = Object.fromEntries(worlds.map((w) => [w, pooled(w, 'guideTapper').inTime]));
  G.A8 = { smart: sm, guideTapper: gt, pass: (sm.w2 == null || sm.w3 == null || sm.w2 >= sm.w3 - 0.05) && (sm.w3 == null || sm.w4 == null || sm.w3 >= sm.w4 - 0.05) && (gt.w1 == null || worlds.every((w) => gt.w1 >= gt[w] - 0.05)) };
  G.A9 = ['abl:noCycle', 'abl:noDD', 'f:none'].map((ab) => { const d = worlds.map((wid) => ({ wid, delta: pooled(wid, ab).inTime - pooled(wid, 'smart').inTime, dMed: pooled(wid, ab).med - pooled(wid, 'smart').med })); return { system: ab, deltas: d, pass: d.some((x) => Math.abs(x.delta) >= 0.03) }; });
  return G;
}
/** Option-dominance scan (A7): play smart, record E.scoreOptions on every scored event. */
export function dominance(wid, n) {
  const w = E.getWorld(wid); const tally = {}; const ALLOW = (type, id, ev) => id === 'save' || (type === 'doodad' && id === 'skip');
  for (const ch of w.characters) for (let i = 0; i < n; i++) {
    const st = E.createGame({ worldId: wid, charId: ch.id, seed: seedOf(wid, i) + 77, mode: 'free', mentor: 'hint' }); const P = POLICIES.smart; const r = prng(i + 3);
    const lim = Math.round(E.starThresholds(w, ch.id).maxMonths * 1.6);
    for (let g = 0; g < 4000 && !st.over && st.month <= lim; g++) {
      P.between(st, { r }); if (st.over) break;
      if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 8) { const c = P.decide(st, ev, { r, n: k }); const res = E.choose(st, ev, c[0], c[1]); ev = res.ok ? res.event : E.choose(st, ev, ev.options.find((o) => o.enabled && ['ok', 'done', 'pass'].includes(o.id)).id).event; } }
      if (st.over) break;
      E.rollDice(st); let ev = E.landing(st); let k = 0;
      while (ev && !st.over) {
        const sc = E.scoreOptions(st, ev);
        if (sc.length >= 2) { const s2 = sc.slice().sort((a, b) => b.U - a.U); const topId = s2[0].U > s2[1].U + 0.01 ? s2[0].id : null; for (const x of sc) { const key = ev.type + ':' + x.id.replace(/:\d+$/, ':n'); const t = tally[key] || (tally[key] = { n: 0, top: 0, allow: ALLOW(ev.type, x.id, ev) }); t.n++; if (x.id === topId) t.top++; } }
        let c; if (ev.auto) c = [ev.options[0].id]; else if (ev.type === 'mystery' && ev.data.kind === 'quiz') c = ['a0']; else c = k >= 6 ? [(ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id] : P.decide(st, ev, { r, n: k });
        let res = E.choose(st, ev, c[0], c[1]); if (!res.ok) res = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id);
        ev = res.event; k++;
      }
    }
  }
  return tally;
}
/** A10: describe / impactFor timings on mid-game states (min of 3 runs per call, so a busy box's preemption is not counted) + games/sec. */
export function perf(wid = null, n = 6) {
  const states = []; const worlds = wid ? [wid] : E.WORLDS.map((w) => w.id);
  for (let g = 0; g < 48; g++) { const id = worlds[g % worlds.length]; const st = E.createGame({ worldId: id, seed: 100 + g, mode: 'free', mentor: ['guide', 'hint', 'pro'][g % 3] }); const r = prng(g);
    for (let t = 0; t < 60 && !st.over; t++) { E.rollDice(st); let ev = E.landing(st); let k = 0; while (ev) { if (t > 12 && r() < 0.15) states.push(E.serialize(st)); const en = ev.options.filter((o) => o.enabled); const o = k > 2 ? (en.find((x) => ['ok', 'done', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; k++; } } }
  const sts = states.map((x) => E.deserialize(x)); const ms = (f) => { let b = 1e9; for (let k = 0; k < 3; k++) { const t0 = process.hrtime.bigint(); f(); b = Math.min(b, Number(process.hrtime.bigint() - t0) / 1e6); } return b; };
  const dsc = sts.map((st) => ms(() => E.currentEvent(st))).sort((a, b) => a - b);
  const imp = []; for (const st of sts) { const ev = E.currentEvent(st); for (const o of ev.options.filter((x) => x.major && x.enabled)) imp.push(ms(() => E.impactFor(st, o.id, { event: ev }))); } imp.sort((a, b) => a - b);
  const p = (xs, f) => (xs.length ? +xs[Math.min(xs.length - 1, Math.floor(xs.length * f))].toFixed(3) : null);
  const t0 = Date.now(); let games = 0;
  for (const id of worlds) { const w = E.getWorld(id); for (const ch of w.characters) for (let i = 0; i < n; i++) { play(id, ch.id, seedOf(id, i), 'smart', Math.round((ch.maxMonths || w.maxMonths) * 1.6)); games++; } }
  return { states: sts.length, describe: { p50: p(dsc, 0.5), p95: p(dsc, 0.95) }, impactFor: { n: imp.length, p50: p(imp, 0.5), p95: p(imp, 0.95) }, sim: { games, secs: (Date.now() - t0) / 1000, gamesPerSec: +(games / ((Date.now() - t0) / 1000)).toFixed(2) } };
}

if (import.meta.url === `file://${process.argv[1]}` && (args.includes('--matrix') || args.includes('--dominance') || args.includes('--perf') || args.includes('--report'))) {
  const nArg = +(args.find((a) => /^\d+$/.test(a)) || 0);
  if (args.includes('--matrix')) {
    const wid = ONLY || 'w1'; const n = nArg || 100; const t0 = Date.now();
    const recs = matrixWorld(wid, n, undefined, (pol, ch, secs) => { if (!QUIET) console.log(`${wid} ${ch} ${pol} done (${secs}s)`); });
    const file = `tools/balance-t2-${wid}.json`;
    writeFileSync(file, JSON.stringify({ world: wid, n, secs: Math.round((Date.now() - t0) / 1000), cols: ['policy', 'char', 'i', 'bucket', 'won', 'inTime', 'months', 'stars', 'inspections', 'hints'], recs }) + '\n');
    console.log(`wrote ${file}: ${recs.length} games in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  if (args.includes('--dominance')) {
    const n = nArg || 40; const out = {};
    for (const wid of ONLY ? [ONLY] : E.WORLDS.map((w) => w.id)) out[wid] = dominance(wid, n);
    writeFileSync(`tools/balance-t2-dominance${ONLY ? '-' + ONLY : ''}.json`, JSON.stringify(out) + '\n');
    for (const [wid, t] of Object.entries(out)) { const flagged = Object.entries(t).filter(([, x]) => !x.allow && x.n >= 20 && x.top / x.n > 0.85); console.log(wid, 'flagged:', flagged.map(([k, x]) => `${k} ${x.top}/${x.n}`).join(', ') || 'none'); }
  }
  if (args.includes('--perf')) console.log(JSON.stringify(perf(ONLY, nArg || 6)));
  if (args.includes('--report')) t2Report();
  process.exit(0);
}
function t2Report() {
  const byWorld = {}; for (const w of ['w1', 'w2', 'w3', 'w4']) { const f = `tools/balance-t2-${w}.json`; if (existsSync(f)) byWorld[w] = JSON.parse(readFileSync(f, 'utf8')); }
  const G = gates(byWorld); const P = (x) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(0) + '%'); const Mo = (x) => (Number.isFinite(x) ? x : '—');
  const dom = {}; for (const f of ['tools/balance-t2-dominance.json', ...['w1', 'w2', 'w3', 'w4'].map((w) => `tools/balance-t2-dominance-${w}.json`)]) if (existsSync(f)) Object.assign(dom, JSON.parse(readFileSync(f, 'utf8')));
  const perfF = 'tools/balance-t2-perf.json'; const pf = existsSync(perfF) ? JSON.parse(readFileSync(perfF, 'utf8')) : null;
  const L = [];
  L.push('# דוח איזון — מירוץ העכברים v4 (T2 "עומק אסטרטגי")', '');
  L.push(`Generated by \`node tools/sim.mjs --matrix N wX\` (one process per world) + \`--dominance\` + \`--perf\`, then \`node tools/sim.mjs --report\`. Seeds are fixed (\`1000 + i·7 + world·100003\`), so the numbers are reproducible. N per (world × character × policy): ${Object.values(byWorld).map((x) => `${x.world} ${x.n}`).join(' · ')}. Free mode, capped at 1.6× the character's month limit; "in time" = escaped within the limit. Cells = world × character × cycle bucket (§8.6) with ≥ 15 games.`, '');
  L.push('Policies: **guideTapper** (mentor מתחיל, taps the highlighted option and the suggested focus) · **blindTapper** (מתקדם, uniform random clicks, no hints, no between-roll actions) · **naive** (believes the seller: buys whenever the claimed net > 0, never inspects/negotiates, plan work, no fund/focus) · **smart** (the reference heuristic: expected net at the public basis, DD rule "flagged", adaptiveFocus; ignores the cycle) · **adaptive** (smart + the cycle gauge) · **cautious / greedy** (v3 heuristics; greedy believes the claimed numbers) · archetypes **saver / founder / diversified / gambler** (gameplay.md §7d) · focus variants **f:<id>** (smart with one fixed focus; f:none = never) · DD variants **dd:never / dd:always / dd:borderline** (smart with that inspect rule; dd:flagged = smart) · ablations **abl:noCycle / abl:noDD** (smart, `_dev` switches).', '');
  L.push('## Gates (spec §13.5)', '', '| gate | result | numbers |', '|---|---|---|');
  const ok = (b) => (b ? 'met' : '**NOT met**');
  L.push(`| A1 guideTapper in time ≥ 65%, no character < 50% | ${ok(G.A1.every((x) => x.pass))} | ${G.A1.map((x) => `${x.wid} ${P(x.inTime)} (worst ${x.worstChar} ${P(x.worstInTime)})`).join(' · ')} |`);
  L.push(`| A2 blindTapper in time ≤ 30% | ${ok(G.A2.every((x) => x.pass))} | ${G.A2.map((x) => `${x.wid} ${P(x.inTime)}`).join(' · ')} |`);
  L.push(`| A2b naive in time ≤ 40% (target, not blocking) | ${G.A2b.every((x) => x.pass) ? 'met' : 'not met (reported)'} | ${G.A2b.map((x) => `${x.wid} ${P(x.inTime)}`).join(' · ')} |`);
  L.push(`| A3 smart and adaptive 55–75% | ${ok(G.A3.every((x) => x.pass))} | ${G.A3.map((x) => `${x.wid} smart ${P(x.smart)} (med ${Mo(x.smartMed)}) / adaptive ${P(x.adaptive)} (med ${Mo(x.adaptiveMed)})`).join(' · ')} |`);
  L.push(`| A4 no policy best in > 60% of cells | ${ok(G.A4.pass)} | ${G.A4.cells} cells: ${Object.entries(G.A4.share).sort((a, b) => b[1] - a[1]).map(([p, x]) => `${p} ${P(x)}`).join(' · ')} |`);
  L.push(`| A5 every focus best in ≥ 1 cell and worse than f:none in ≥ 1 | ${ok(G.A5.every((x) => x.pass))} | ${G.A5.map((x) => `${x.focus} best ${x.bestCells} / worse ${x.worseThanNoneCells}`).join(' · ')} |`);
  L.push(`| A6 dd:flagged beats never & always (pooled, ≥ 3 worlds) | ${ok(G.A6.pass)} | pooled: flagged ${P(G.A6.pooled.flagged.inTime)} med ${Mo(G.A6.pooled.flagged.med)} · never ${P(G.A6.pooled.never.inTime)} med ${Mo(G.A6.pooled.never.med)} · always ${P(G.A6.pooled.always.inTime)} med ${Mo(G.A6.pooled.always.med)} · worlds beaten: ${G.A6.worlds.filter((x) => x.beats).map((x) => x.wid).join(',') || 'none'} |`);
  L.push(`| A6b dd:always worse than dd:never in ≥ 1 world (desirable) | ${G.A6b.pass ? 'met' : 'not met'} | ${G.A6b.worlds.map((x) => `${x.wid} ${x.alwaysWorse ? 'yes' : 'no'}`).join(' · ')} |`);
  const domAll = Object.entries(dom).flatMap(([wid, t]) => Object.entries(t).filter(([, x]) => !x.allow && x.n >= 20 && x.top / x.n > 0.85).map(([k, x]) => ({ wid, k, s: `${wid} ${k} ${x.top}/${x.n}` })));
  const domFlag = domAll.filter((x) => !/^(life|mystery):/.test(x.k)).map((x) => x.s); const domLife = domAll.filter((x) => /^(life|mystery):/.test(x.k)).map((x) => x.s);
  L.push(`| A7 no option top in > 85% (allowlist: save, skip on wants; personal/values life cards and quizzes listed separately) | ${Object.keys(dom).length ? ok(!domFlag.length) : 'not run'} | ${domFlag.join(' · ') || 'none flagged'}${domLife.length ? ` — no-answer cards (personal/values life events score 100 for every option; quiz = knowledge): ${domLife.join(' · ')}` : ''} |`);
  L.push(`| A8 ramp | ${ok(G.A8.pass)} | smart ${Object.entries(G.A8.smart).map(([w, x]) => `${w} ${P(x)}`).join(' ')} · guideTapper ${Object.entries(G.A8.guideTapper).map(([w, x]) => `${w} ${P(x)}`).join(' ')} |`);
  L.push(`| A9 ablation changes smart in time by ≥ 3 points in ≥ 1 world | ${ok(G.A9.every((x) => x.pass))} | ${G.A9.map((x) => `${x.system}: ${x.deltas.map((d) => `${d.wid} ${(d.delta * 100).toFixed(0)}pt/${Number.isFinite(d.dMed) ? (d.dMed > 0 ? '+' : '') + d.dMed : '—'}mo`).join(' ')}`).join(' · ')} |`);
  if (pf) L.push(`| A10 performance | ${pf.describe.p95 < 2 && pf.impactFor.p95 < 8 && (!pf.baseline || pf.sim.gamesPerSec >= 0.75 * pf.baseline.gamesPerSec) ? 'met' : '**NOT met**'} | describe p95 ${pf.describe.p95} ms · impactFor p95 ${pf.impactFor.p95} ms (${pf.impactFor.n} calls) · sim ${pf.sim.gamesPerSec} games/s${pf.baseline ? ` vs pre-T2 ${pf.baseline.gamesPerSec} (${(pf.sim.gamesPerSec / pf.baseline.gamesPerSec * 100).toFixed(0)}%)` : ''} |`);
  L.push('', '## In time by world × policy (all characters pooled)', '', '| policy | ' + Object.keys(byWorld).join(' | ') + ' |', '|---|' + Object.keys(byWorld).map(() => '---|').join(''));
  const pols = [...new Set(Object.values(byWorld).flatMap((x) => x.recs.map((r) => r[0])))];
  for (const pol of pols) L.push(`| ${pol} | ` + Object.keys(byWorld).map((w) => { const s = cellStats(byWorld[w].recs.filter((r) => r[0] === pol)); return `${P(s.inTime)} · med ${Mo(s.med)} · ★★★ ${P(s.star3)}`; }).join(' | ') + ' |');
  L.push('', '## Per character (in time / median months)', '');
  for (const [w, x] of Object.entries(byWorld)) { const chars = [...new Set(x.recs.map((r) => r[1]))]; L.push(`**${w}** — ` + ['guideTapper', 'blindTapper', 'naive', 'smart', 'adaptive'].map((pol) => `${pol}: ` + chars.map((c) => { const s = cellStats(x.recs.filter((r) => r[0] === pol && r[1] === c)); return `${c} ${P(s.inTime)}/${Mo(s.med)}`; }).join(', ')).join(' · '), ''); }
  L.push('## Cycle buckets (smart, in time)', '');
  for (const [w, x] of Object.entries(byWorld)) { const bs = ['B0_calm', 'B1_early', 'B2_late', 'B3_long']; L.push(`**${w}** — ` + bs.map((b) => { const s = cellStats(x.recs.filter((r) => r[0] === 'smart' && r[3] === b)); return `${b} ${s.n ? P(s.inTime) : '—'} (n ${s.n})`; }).join(' · '), ''); }
  writeFileSync(MD || 'tools/balance-report.md', L.join('\n') + '\n');
  console.log(L.slice(0, 22).join('\n'));
  console.log('wrote', MD || 'tools/balance-report.md');
}

/* ---------- main */
if (import.meta.url === `file://${process.argv[1]}`) {
  const worlds = ONLY ? [ONLY] : E.WORLDS.map((w) => w.id);
  const out = []; const sums = [];
  const t0 = process.hrtime.bigint();
  for (const wid of worlds) {
    const rows = runWorld(wid, N);
    const s = summary(wid, rows); sums.push(s);
    const w = E.getWorld(wid);
    out.push(`\n## ${wid} · ${w.name}  (goal: ${w.goalLabel} · default maxMonths ${w.maxMonths} · ${N} games per row)\n`);
    out.push(table(rows));
    out.push(`\n**Summary:** smart median ${s.smartMed} months (p12 ${s.smartP12}, p90 ${s.smartP90}), ~${s.turnsSmart} turns · greedy median ${s.greedyMed} · cautious median ${s.cautiousMed} · tapper (follows the highlighted button) median ${s.tapperMed}, in time ${pctS(s.winTapper)}, ★★★ ${pctS(s.tapper3)} · win in time: smart ${pctS(s.winSmart)}, greedy ${pctS(s.winGreedy)}, cautious ${pctS(s.winCautious)}, reckless ${pctS(s.winReckless)}, random ${pctS(s.winRandom)} · reckless bankrupt ${pctS(s.bankruptReckless)}, reckless auto-loans ${pctS(s.autoReckless)} · smart ★★★ ${pctS(s.smart3)}, ★★+ ${pctS(s.smart2)}\n`);
    const sug = rows.filter((r) => r.pol === 'smart').map((r) => `${r.char}: t3≈${q(r.months, 0.13)} t2≈${q(r.months, 0.5)} p90=${q(r.months, 0.9)} inTime=${pctS(r.winLim)} turns=${r.turnsMed}`).join(' | ');
    out.push(`\nSmart per character (suggested ★★★≈p13, ★★≈median): ${sug}\n`);
    out.push(`Configured per character (maxMonths / ★★ / ★★★): ${w.characters.map((c) => { const T = E.starThresholds(w, c.id); return `${c.id} ${T.maxMonths}/${T.t2}/${T.t3}`; }).join(' · ')}\n`);
    if (!QUIET) console.log(out.slice(-5).join('\n'));
    else console.log(sug + '\n' + `${wid}: tapper ${pctS(s.winTapper)} ★★★${pctS(s.tapper3)} med ${s.tapperMed} | default ${s.defaultChar} smart turns ${s.turnsDefault} | smart med ${s.smartMed} p12 ${s.smartP12} p90 ${s.smartP90} turns ${s.turnsSmart} | greedy ${s.greedyMed} cautious ${s.cautiousMed} | win S ${pctS(s.winSmart)} G ${pctS(s.winGreedy)} C ${pctS(s.winCautious)} K ${pctS(s.winReckless)} R ${pctS(s.winRandom)} | bankK ${pctS(s.bankruptReckless)} autoK ${pctS(s.autoReckless)} | ★★★ ${pctS(s.smart3)} ★★ ${pctS(s.smart2)}`);
  }
  // ablations: the same smart player with one mechanic-decision switched off — proves the decisions matter
  const ablOut = [];
  if (args.includes('--ablate')) {
    const VARIANTS = { w2: ['', 'alwaysVar', 'alwaysFix', 'noUpgrade'], w3: ['', 'noHedge', 'hedgeAll', 'noGold'], w4: ['', 'noAngel', 'bigChecks', 'giveLate'] };
    ablOut.push('\n## Mechanic ablations (smart policy, one decision rule changed)\n\n| world | variant | median months | p25 | p90 | win in time | bankrupt |\n|---|---|---|---|---|---|---|');
    for (const wid of worlds) for (const v of VARIANTS[wid] || []) {
      ABL.clear(); for (const x of v.split(',').filter(Boolean)) ABL.add(x);
      const rows = runWorld(wid, Math.max(60, Math.round(N / 3)), ['smart']);
      const ms = rows.flatMap((r) => r.months);
      const line = `| ${wid} | ${v || 'smart (baseline)'} | ${q(ms, 0.5)} | ${q(ms, 0.25)} | ${q(ms, 0.9)} | ${pctS(rows.reduce((s, r) => s + r.winLim, 0) / rows.length)} | ${pctS(rows.reduce((s, r) => s + r.bankrupt, 0) / rows.length)} |`;
      ablOut.push(line); console.log(line);
    }
    ABL.clear();
    ablOut.push('\nReading: w2 — locking when the rate is low beats both «always variable» (cheaper on average but more missed limits: 85% vs 90%) and «always fixed» (slower); skipping upgrades & lifestyle trims costs ~6 months. w3 — hedging when the dollar is on your side beats never hedging and always hedging (hedges cost money); gold is crisis insurance (it lets you pay a crisis without a loan) but does not speed you up. w4 — many small startup checks beat skipping startups (33 vs 35 months) and beat big concentrated checks (41 months, only 59% in time); giving on a schedule ≈ giving late, because impact vests over 10 months.\n');
  }
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  if (MD) {
    const head = `# דוח איזון — מירוץ העכברים v3 ("החיים האמיתיים")\n\nGenerated by \`node tools/sim.mjs ${N} --md ${MD}\` (${secs.toFixed(0)}s). Seeds are fixed, so the report is reproducible.\n\nPolicies: **random** (uniform clicks), **cautious** (never borrows to buy, buys only positive cashflow it can pay for in cash, repays loans first, always fixes/hedges/insures, tiny angel checks), **greedy** (careless: buys any positive cashflow even with expensive loans, tiny buffer, always variable rate, never hedges, gives only at the end), **smart** (good heuristic player — the reference for stars: ROI vs loan cost, buy-low/sell-high, sells on great offers, repays expensive debt, locks low rates, upgrades/trims, hedges when the dollar is favourable, small diversified startup checks, gives on a schedule), **tapper** (a kid who always taps the highlighted \`primary\` button and never touches the loan buttons), **reckless** (buys everything incl. negative cashflow, max leverage, installments/subscriptions, never hedges).\n\n"Months" = the month counter at the moment of escape (as in v1). Games run in free mode up to 1.6× the month limit; "win in time" counts escapes within maxMonths. Stars: ★ = escaped within maxMonths, ★★ ≤ T2, ★★★ ≤ T3 **and final happiness ≥ 60** (T3 calibrated so ★★★ ≈ 12–13% of smart games). v3: two dice on a 40-tile board (≈1.4 rolls per month), Israeli payslip, inflation, index fund, life events, monthly plans; policies choose plans (smart: study early, rest when tired/unhappy, a little overtime when fresh; tapper: the highlighted plan) and life dilemmas. \*T2/T3 in the overview are world defaults; the configured per-character thresholds (used by the engine) are listed under each world.\n\n## Overview\n\n| world | maxMonths | smart median months (turns) | default char turns | smart p90 | tapper median / in time / ★★★ | greedy med | cautious med | win in time: smart / greedy / cautious / reckless / random | smart ★★★ / ★★+ |\n|---|---|---|---|---|---|---|---|---|---|\n` +
      sums.map((s) => `| ${s.world} ${s.name} | ${s.maxMonths} | ${s.smartMed} (${s.turnsSmart}) | ${s.defaultChar} ${s.turnsDefault} | ${s.smartP90} | ${s.tapperMed} / ${pctS(s.winTapper)} / ${pctS(s.tapper3)} | ${s.greedyMed} | ${s.cautiousMed} | ${pctS(s.winSmart)} / ${pctS(s.winGreedy)} / ${pctS(s.winCautious)} / ${pctS(s.winReckless)} / ${pctS(s.winRandom)} | ${pctS(s.smart3)} / ${pctS(s.smart2)} |`).join('\n') + '\n';
    writeFileSync(MD, head + out.join('\n') + '\n' + ablOut.join('\n') + '\n');
    console.log('wrote', MD);
  }
}
