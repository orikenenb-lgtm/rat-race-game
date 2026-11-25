#!/usr/bin/env node
// Balance simulator. Plays thousands of seeded games per world/character/policy and prints a report.
// Usage: node tools/sim.mjs [games=600] [worldId|all] [--md tools/balance-report.md] [--quiet]
//        node tools/sim.mjs --matrix [N=100] [w1..w4]   T2 acceptance matrix (writes tools/balance-t2-<w>.json; --md to merge)
//        node tools/sim.mjs --dominance [N=40] [w]      option-dominance scan (E.scoreOptions on every scored event)
//        node tools/sim.mjs --perf [w]                  describe / impactFor p95 and games/sec
// Policies carry a mentor level (default 'hint'); the T2 policies decide from E.publicView only (tools/policies.mjs).
import * as E from '../js/engine.js';
import '../js/worlds/all.js'; // worlds wave 0 (I8): every lazy world registered (w5 …)
import { seedFrom } from '../js/rng.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { facade, claimedNet, adaptiveFocus, runFocus, ddRule, medianDown, archPolicy } from './policies.mjs';
import { collect, bundleText, sha256 } from './build-edge.mjs';
import * as RVM from '../js/systems/rivals.js';
/** T7 CR-21: every sim JSON names the exact engine it measured. */
export const ENGINE_SHA = sha256(bundleText(collect()));

const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 600);
const ONLY = args.find((a) => /^w\d+$/.test(a)); // I8: w10–w12 too (was /^w\d$/)
const MD = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
const QUIET = args.includes('--quiet');
// ablation switches for the smart policy (for checking that each mechanic's decisions matter): ABL=noHedge,alwaysVar,...
const ABL = new Set((process.env.ABL || '').split(',').filter(Boolean));
/** SIM_RULES=3|4|5 plays every sim game under that rule set (before/after comparisons); unset = the engine's current rules (5). */
const SIM_RULES = E.RULE_SETS.includes(+process.env.SIM_RULES) ? +process.env.SIM_RULES : undefined;
/** I8: the per-world seed base. w1–w4 keep the legacy formula (their reports stay identical); later worlds hash their id
 *  ('w10'.charCodeAt(1) collided with w1, w11, w12). */
export const LEGACY_SEED_WORLDS = ['w1', 'w2', 'w3', 'w4', 'h'];
export const worldSeed = (wid) => (LEGACY_SEED_WORLDS.includes(wid) ? wid.charCodeAt(1) * 100003 : (seedFrom('sim:' + wid) % 42000) * 100003); // < 2³² (createGame keeps uint32 seeds)
/** I8: the worlds a sweep covers — the core four (unchanged reports) unless one is named. */
const SWEEP = () => E.WORLDS.map((w) => w.id);

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
    mentor: 'guide', story: 'tapper',
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
    mentor: 'hint', quiz: 'smart', story: 'smart',
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
    mentor: 'hint', quiz: 'tapper', story: 'random',
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
});
// archetypes (gameplay.md §7d, T6 §2.3) — the ONE copy lives in js/systems/archetypes.js (also the ghost players' policies)
Object.assign(POLICIES, { saver: archPolicy('saver', 'cautious'), founder: archPolicy('founder', 'smart'), diversified: archPolicy('diversified', 'smart'), gambler: archPolicy('gambler', 'reckless') });
// review M4 (c): smart with a fixed money habit on personal / values life cards — the escape-rate gap between them measures the
// cards' money swing (target ≤ 10 pp in w1). cheap = the option with the most money over 24 months, dear = the least.
const lifeMoney = (o) => (o.effects.total24 != null ? o.effects.total24 : lifeValue(o));
for (const [k, dir] of [['life:cheap', 1], ['life:dear', -1]]) {
  POLICIES[k] = { ...smartLike(), decide(st, ev, ctx) {
    if (ev.type === 'life' && (ev.data.personal || ev.data.values || ev.data.chain)) { const en = ev.options.filter((o) => o.enabled); return [en.slice().sort((a, b) => dir * (lifeMoney(b) - lifeMoney(a)))[0].id]; }
    return POLICIES.smart.decide(st, ev, ctx);
  } };
}
// T3 sim policies: sideHustler (smart + the side plan until the side business graduates) and owner (smart + starts every offered business)
POLICIES.sideHustler = { ...smartLike(), between(st) { POLICIES.smart.between(st); if (st.over) return; const pv = PV(st); const L = pv.metrics.life; if (!pv.metrics.businesses.some((b) => b.name === 'העסק הצדדי שלך') && L.energy >= 30 && L.plan !== 'side') E.setPlan(st, 'side'); } };
POLICIES.owner = { ...smartLike(), decide(st, ev, ctx) { if (ev.type === 'business' && ev.data.mode === 'offer') { const o = ev.options.filter((x) => x.kind === 'buy' && x.enabled).sort((a, b) => (a.startCapital || ev.data.startCapital) - (b.startCapital || ev.data.startCapital))[0]; return [o ? o.id : 'pass']; } return POLICIES.smart.decide(st, ev, ctx); } };
// focus variants (smart with the focus rule replaced) and DD variants (smart with the inspect rule replaced)
for (const id of ['none', 'scout', 'debt', 'ops', 'frugal', 'network', 'research', 'adaptive']) POLICIES['f:' + id] = smartLike({ focus: id });
for (const id of ['never', 'always', 'flagged', 'borderline']) POLICIES['dd:' + id] = smartLike({ dd: id });
POLICIES.tapper = POLICIES.guideTapper; // v3 name
/* ---------- E1 strategy set (docs/full-upgrade/research/E1-economy.md §3; BRIEF §13 "no choice that always wins"): wrappers on smart */
const safeId = (ev) => (ev.options.find((o) => o.enabled && ['pass', 'skip', 'done', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id;
const S1 = () => POLICIES.smart;
function borrowToCap(st) { let g = 0; while (!st.over && g++ < 40) { const r = E.takeLoan(st); if (r.ok === false) break; } }
const forcePlan = (plan) => ({ ...smartLike(), between(st, c) { S1().between(st, c); if (!st.over) E.setPlan(st, plan); },
  decide(st, ev, ctx) { if (ev.type === 'payday' || ev.type === 'edu') { const o = ev.options.find((x) => x.enabled && x.plan === plan); if (o) return [o.id]; } return S1().decide(st, ev, ctx); } });
Object.assign(POLICIES, {
  // max debt: smart decisions, but every between-roll window borrows up to the bank's cap
  'e1:maxDebt': { ...smartLike(), between(st, c) { S1().between(st, c); if (!st.over) borrowToCap(st); } },
  // no debt: smart, but never a deal / business that needs a loan, and repays every loan it can
  'e1:noDebt': { ...smartLike(), decide(st, ev, ctx) { if ((ev.type === 'deal' || ev.type === 'business') && ctx.n === 0) { const d = S1().decide(st, ev, ctx); const o = ev.options.find((x) => x.id === d[0]); if (o && o.loanAmount) return [safeId(ev)]; return d; } return S1().decide(st, ev, ctx); },
    between(st, c) { S1().between(st, c); let g = 0; while (!st.over && st.loans > 0 && g++ < 40) { const r = E.repayLoan(st); if (r.ok === false) break; } } },
  // buy everything: the first enabled buy on every deal / business offer / pitch, otherwise smart
  'e1:buyAll': { ...smartLike(), decide(st, ev, ctx) { if (['deal', 'business', 'pitch'].includes(ev.type) && (ev.type !== 'business' || ev.data.mode === 'offer')) { const b = ev.options.find((o) => (o.kind === 'buy' || /^inv:/.test(o.id)) && o.enabled); if (b) return [b.id]; } return S1().decide(st, ev, ctx); } },
  'e1:sideAlways': forcePlan('side'), 'e1:overtimeAlways': forcePlan('overtime'),
  // save only: never invests, skips wants, cheapest life option, all cash above 1 month of expenses → the emergency fund
  'e1:saveOnly': { mentor: 'hint', quiz: 'smart', decide(st, ev) {
      if (ev.type === 'life') { const en = ev.options.filter((o) => o.enabled); return [en.slice().sort((a, b) => lifeMoney(b) - lifeMoney(a))[0].id]; }
      if (ev.type === 'payday' || ev.type === 'edu') { const w = ev.options.find((o) => o.enabled && o.plan === 'work'); return [w ? w.id : safeId(ev)]; }
      if (ev.type === 'doodad') return [has(ev, 'skip') ? 'skip' : 'pay'];
      if (ev.type === 'upgrade') { const t = ev.options.find((o) => o.id.startsWith('trim:') && o.enabled); return [t ? t.id : safeId(ev)]; }
      return [safeId(ev)];
    }, between(st) { if (st.over) return; const m = E.metrics(st); if (st.credit && st.cash >= st.credit) E.payCredit(st); const spare = st.cash - Math.round(m.expenses); if (spare > 500) E.moveSavings(st, spare); if (st.life.plan !== 'work') E.setPlan(st, 'work'); } },
  // career: study first, then work (ask for raises), 15 % of salary auto-invested in the index fund, a 3-month fund; buys nothing else
  'e1:career': { mentor: 'hint', quiz: 'smart', decide(st, ev, ctx) {
      if (ev.type === 'payday' || ev.type === 'edu') { if (has(ev, 'raise')) return ['raise']; const want = st.life.study.done ? 'work' : 'study'; const o = ev.options.find((x) => x.enabled && x.plan === want) || ev.options.find((x) => x.enabled && x.plan === 'work'); return [o ? o.id : safeId(ev)]; }
      return POLICIES['e1:saveOnly'].decide(st, ev, ctx);
    }, between(st) { if (st.over) return; const m = E.metrics(st); if (st.credit && st.cash >= st.credit) E.payCredit(st); const want = st.life.study.done ? 'work' : 'study'; if (st.life.plan !== want && !(want === 'study' && st.life.energy < 35)) E.setPlan(st, st.life.energy < 30 ? 'rest' : want);
      const auto = Math.round(m.salary * 0.15 / 100) * 100; if (st.life.autoInvest !== auto) E.setAutoInvest(st, auto); const want3 = Math.round(m.expenses * 3) - st.savings; if (want3 > 500 && st.cash - want3 > m.expenses) E.moveSavings(st, want3); } },
});
/** The E1 strategy table's policy set (BRIEF §12–§13, §29): references + every "always X" strategy. */
export const E1_SET = ['smart', 'guideTapper', 'f:frugal', 'e1:maxDebt', 'e1:noDebt', 'e1:buyAll', 'e1:sideAlways', 'e1:overtimeAlways', 'e1:saveOnly', 'e1:career', 'diversified', 'saver', 'founder'];
const has2 = has; void has2;
/* ---------- I8: per-mechanic policy plug-ins (tools/policies/<mechanic>.mjs). A plug-in exports make(ctx) → {policyName: policy}; those
   names override / extend POLICIES for the worlds of that mechanic only (w1–w4 never load one, so their reports are unchanged). */
const PLUGINS = {};
for (const mech of ['season', 'plant', 'chain', 'projects', 'energy', 'portfolio', 'league', 'credit', 'multinational', 'platform', 'harvest', 'holding', 'trials', 'insure', 'bell', 'funds', 'lbo']) {
  const mod = await import(`./policies/${mech}.mjs`);
  PLUGINS[mech] = mod.make({ E, POLICIES, ddRule, facade, claimedNet, runFocus, firstEnabled, ABL });
}
/** The policy object a world plays `pol` with (a plug-in's version first). */
export function policyFor(wid, pol) { const w = E.getWorld(wid); const pl = PLUGINS[w.mechanic]; return (pl && pl[pol]) || POLICIES[pol]; }
/** Every policy name a world can play (base + its plug-in's extras). */
export function policyNames(wid) { const w = E.getWorld(wid); const pl = PLUGINS[w.mechanic]; return [...new Set([...Object.keys(POLICIES), ...Object.keys(pl || {})])]; }

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
      // T6: smart reads the public 👥 chip — it checks a flagged deal unless others may close first (≥ 30 %, the guide's own rule) and makes
      // a lower offer only while the risk of losing the deal is small (< 15 %); dd:always keeps inspecting whatever the risk (balance pass, G7)
      const hz = d.rivals && d.rivals.n ? d.rivals.hazardNext || 0 : 0;
      if (smart && o2.dd && ctx.n < 3) { const ins = ddRule(o2.dd, st._pv, ev, pick); if (ins && !(o2.dd !== 'always' && hz >= 0.3)) return [ins]; }
      if (smart && !ABL.has('noNeg') && ctx.n === 0 && hz < 0.15) { const off = ev.options.find((x) => x.id === 'offer:5' && x.enabled && x.chance >= 0.85); if (off && (ev.options.find((x) => x.id === pick).net || 0) > 0) return [off.id]; }
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
      // net-worth worlds: smart values the deal at the public basis (value × expected value factor − expected repair), not the seller's claim
      if (smart && o.basis) { const bs = o.basis; const v0 = d.value ?? d.cost; const s2 = (v0 * (bs.vf ?? 1) - d.cost - (bs.rep || 0)) * 1.5 + (o.net + loanCost) * 24 + (d.grow || 0) * v0 * 24 + (d.impact || 0) * 20000; if (s2 <= 0) return ['pass']; }
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
    case 'business': {
      if (!smart) return [firstEnabled(ev, ['pass', 'ok'])];
      // v3's business rule, from public data only (T2 gate A5: smart at hint level has no highlight to follow, so it never opened a business)
      if (d.mode === 'offer') { const o = has(ev, 'start'); return [o && !o.loanAmount && d.forecast3 && d.forecast3.netProfit > 0 && m.cash - d.startCapital >= 3 * m.expenses ? 'start' : 'pass']; }
      return [ctx.n === 0 && has(ev, 'biz:suggest') && !(d.lastResult) ? 'biz:suggest' : firstEnabled(ev, ['ok', 'pass'])];
    }
    case 'payday': case 'edu': return [planEventPick(st, ev, smart ? 'smart' : 'greedy')];
    case 'life': return [lifePick(st, ev, smart ? 'smart' : 'greedy')];
    default: return [firstEnabled(ev, ['ok', 'done', 'pass']) || ev.options.find((o) => o.enabled).id];
  }
}

/* ---------- play one game */
const QUIZ_SKILL = { random: 0.33, cautious: 0.8, greedy: 0.7, smart: 0.95, reckless: 0.4, tapper: 0.5 };
export function play(worldId, charId, seed, pol, capMonths, opts = {}) {
  const { log, onRoll, onLanding, ...gameOpts } = opts;
  const P = policyFor(worldId, pol);
  const st = E.createGame({ worldId, charId, seed, mode: 'free', mentor: P.mentor || 'hint', ...(SIM_RULES ? { rules: SIM_RULES } : {}), ...gameOpts });
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
    if (P.story && !st.over) storyStep(st, P.story, r);
    if (st.over) { end = st.result; break; }
    P.between(st, { r });
    if (st.over) { end = st.result; break; }
    if (st.pending) { resolve(E.currentEvent(st)); if (end || st.over) { end = end || st.result; break; } } // e.g. the ops focus opened the business panel
    E.rollDice(st);
    if (onRoll) onRoll(st);
    { const ev0 = E.landing(st); if (onLanding) onLanding(st, ev0); resolve(ev0); }
  }
  return { st, end };
}

/* ---------- T3: the story inbox (public cards only). tapper = the highlighted option, else wait for the default;
   smart = the evaluator's best option on financial / mixed items, the default on personal ones; random = 50%: a random option */
function storyStep(st, mode, r) {
  for (const it of E.inbox(st)) {
    if (st.over) return;
    const en = it.options.filter((o) => o.enabled); if (!en.length) continue;
    let pick = null;
    if (mode === 'tapper') pick = en.find((o) => o.primary) || null;
    else if (mode === 'random') pick = r() < 0.5 ? en[Math.floor(r() * en.length)] : null;
    else if (mode === 'smart') {
      if (en.every((o) => o.dq === 'personal' || o.dq === 'none')) pick = null;
      else { const sc = E.scoreStory(st, it).sort((a, b) => b.U - a.U)[0]; pick = sc ? en.find((o) => o.id === sc.id) : null; }
    }
    if (pick) E.resolveStory(st, it.itemId, pick.id);
  }
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
      const seed = 1000 + i * 7 + worldSeed(worldId);
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


/* ---------- T3: story / business sim checks (spec §13.2) */
const ONCARD = new Set(['s1', 'm1', 'homeRepair', 'f1', 'carBack']);
export function storiesWorld(wid, n, pols = ['blindTapper', 'guideTapper', 'smart', 'sideHustler', 'owner']) {
  const w = E.getWorld(wid); const games = [];
  for (const pol of pols) for (let i = 0; i < n; i++) {
    const ch = w.characters[i % w.characters.length]; const T = E.starThresholds(w, ch.id); const cap = T.maxMonths; // T3 review M8: rates of a time-limited game (the spec's mode), not 1.6× free play
    const seen = new Map(); let maxOpen = 0, maxChains = 0;
    const { st, end } = play(wid, ch.id, 1000 + i * 7 + worldSeed(wid), pol, cap, { onRoll: (x) => {
      for (const it of x.story.inbox) if (!seen.has(it.id)) seen.set(it.id, { kind: it.kind, m: it.createdM, chain: it.chain, step: it.step, assetId: it.assetId });
      maxOpen = Math.max(maxOpen, x.story.inbox.length); maxChains = Math.max(maxChains, Object.entries(x.story.chains).filter(([id, c]) => id !== 'crisis' && !['idle', 'done'].includes(c.stage)).length);
    } });
    const months = Math.max(1, st.month - 1);
    const items = [...seen.values()]; const chainItems = items.filter((x) => x.kind === 'chain'); const bizItems = items.filter((x) => x.kind === 'biz');
    const bizMonths = st.assets.filter((a) => a.biz).reduce((x, a) => x + ((a.biz.totals && a.biz.totals.months) || 0), 0) + (st.bizPast || []).reduce((x, b) => x + (b.months || 0), 0); // T3 review M8: months each business really ran (sold ones included)
    const stand = st.life.events.filter((e) => !e.id.startsWith('story:'));
    let repeats = 0; const last = {}; for (const e of stand) { if (e.id !== 'quiet' && last[e.id] != null && e.m - last[e.id] < 12) repeats++; last[e.id] = e.m; }
    const chains = Object.fromEntries(Object.entries(st.story.chains).map(([id, c]) => [id, { run: c.run, done: c.stage === 'done', steps: c.steps.length }]));
    games.push({ pol, char: ch.id, won: !!(end && end.status === 'won'), inTime: !!(end && end.status === 'won' && end.months <= T.maxMonths), months, chains,
      chainItems12: chainItems.length * 12 / months, bizItemsYear: bizMonths >= 6 ? bizItems.length * 12 / bizMonths : null, defaults: st.stats.storyDefaults, resolved: st.actions.filter((a) => a[0] === 'Q').length,
      subs: stand.length, repeats, maxOpen, maxChains, sidePlan: st.life.planMonths.side, stages: st.assets.filter((a) => a.biz).map((a) => a.biz.stage), quiet: stand.filter((e) => e.id === 'quiet').length });
  }
  return games;
}
function storiesSummary(wid, games) {
  const q2 = (xs, p) => (xs.length ? q(xs, p) : null); const pc = (x) => Math.round(x * 100);
  const by = (pol) => games.filter((g) => g.pol === pol); const core = games.filter((g) => ['blindTapper', 'guideTapper', 'smart'].includes(g.pol));
  const rate = (gs, id) => (gs.length ? gs.filter((g) => g.chains[id]).length / gs.length : 0);
  const ci = core.map((g) => g.chainItems12); const bi = games.filter((g) => g.bizItemsYear != null).map((g) => g.bizItemsYear);
  const sideGames = by('sideHustler').filter((g) => g.sidePlan >= 15);
  const stages = games.flatMap((g) => g.stages); const stDist = [0, 1, 2, 3].map((k) => stages.filter((x) => x === k).length);
  return { world: wid, n: core.length, start: Object.fromEntries(['car', 'move', 'friend', 'career', 'crisis', 'side'].map((id) => [id, pc(rate(core, id))])), side15: sideGames.length ? pc(sideGames.filter((g) => g.chains.side).length / sideGames.length) : null,
    completion: pc(core.flatMap((g) => Object.values(g.chains)).filter((c) => c.done).length / Math.max(1, core.flatMap((g) => Object.values(g.chains)).length)),
    stepsPerRun: +(core.flatMap((g) => Object.values(g.chains)).reduce((x, c) => x + c.steps / Math.max(1, c.run), 0) / Math.max(1, core.flatMap((g) => Object.values(g.chains)).length)).toFixed(2),
    chainItems12: { med: +(q2(ci, 0.5) || 0).toFixed(2), p90: +(q2(ci, 0.9) || 0).toFixed(2) }, bizItemsYear: { med: +(q2(bi, 0.5) || 0).toFixed(2), p90: +(q2(bi, 0.9) || 0).toFixed(2), n: bi.length },
    defaultsShare: pc(core.reduce((x, g) => x + g.defaults, 0) / Math.max(1, core.reduce((x, g) => x + g.defaults + g.resolved, 0))), repeats: games.reduce((x, g) => x + g.repeats, 0), quietShare: pc(core.reduce((x, g) => x + g.quiet, 0) / Math.max(1, core.reduce((x, g) => x + g.subs, 0))),
    maxOpen: Math.max(...games.map((g) => g.maxOpen)), maxChains: Math.max(...games.map((g) => g.maxChains)), stageDist: stDist };
}

/* ---------- T2: acceptance matrix, dominance scan, performance (spec §13) */
const T2_CORE = ['guideTapper', 'blindTapper', 'naive', 'smart', 'adaptive', 'cautious', 'greedy', 'saver', 'founder', 'diversified', 'gambler'];
const T2_FOCUS = ['f:none', 'f:scout', 'f:debt', 'f:ops', 'f:frugal', 'f:network', 'f:research'];
const T2_DD = ['dd:never', 'dd:always', 'dd:borderline'];
const T2_ABL = { 'abl:noCycle': { _dev: { noCycle: true } }, 'abl:noDD': { _dev: { noDD: true } }, 'abl:noRival': { _dev: { noRival: true } } }; // T6 §16 G7: noRival
export const seedOf = (wid, i) => 1000 + i * 7 + worldSeed(wid);
/** One world: every policy × character × N seeds, tagged with the seed's cycle bucket. Compact records. */
export function matrixWorld(wid, n, pols = [...T2_CORE, ...T2_FOCUS, ...T2_DD, ...Object.keys(T2_ABL), 'life:cheap', 'life:dear'], onRow) {
  const w = E.getWorld(wid); const recs = []; const t0 = Date.now();
  for (const ch of w.characters) {
    const T = E.starThresholds(w, ch.id); const lim = T.maxMonths; const cap = Math.round(lim * 1.6);
    const buckets = Array.from({ length: n }, (_, i) => E.CY.cycleBucket(E.cyclePath(seedOf(wid, i), wid, lim), lim));
    for (const pol of pols) {
      const base = T2_ABL[pol] ? 'smart' : pol; const opts = T2_ABL[pol] || {};
      for (let i = 0; i < n; i++) {
        const { st, end } = play(wid, ch.id, seedOf(wid, i), base, cap, opts);
        const won = !!(end && end.status === 'won');
        recs.push([pol, ch.id, i, buckets[i], won ? 1 : 0, won && end.months <= lim ? 1 : 0, won ? end.months : null, end ? end.stars || 0 : 0, st.stats.inspections || 0, st.dq.hints || 0, st.stats.rivalLost || 0, st.month]);
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
    const st = E.createGame({ worldId: wid, charId: ch.id, seed: seedOf(wid, i) + 77, mode: 'free', mentor: 'hint', ...(SIM_RULES ? { rules: SIM_RULES } : {}) }); const P = policyFor(wid, 'smart'); const r = prng(i + 3);
    const lim = Math.round(E.starThresholds(w, ch.id).maxMonths * 1.6);
    for (let g = 0; g < 4000 && !st.over && st.month <= lim; g++) {
      P.between(st, { r }); if (st.over) break;
      if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 8) { const c = P.decide(st, ev, { r, n: k }); const res = E.choose(st, ev, c[0], c[1]); ev = res.ok ? res.event : E.choose(st, ev, ev.options.find((o) => o.enabled && ['ok', 'done', 'pass'].includes(o.id)).id).event; } }
      if (st.over) break;
      E.rollDice(st); let ev = E.landing(st); let k = 0;
      while (ev && !st.over) {
        const sc = E.scoreOptions(st, ev);
        if (sc.length >= 2) { const s2 = sc.slice().sort((a, b) => b.U - a.U); const topId = s2[0].U > s2[1].U + 0.01 ? s2[0].id : null; for (const x of sc) { const key = ev.type + ':' + x.id.replace(/:\d+$/, ':n'); const t = tally[key] || (tally[key] = { n: 0, top: 0, allow: ALLOW(ev.type, x.id, ev) }); t.n++; if (x.id === topId) t.top++; }
          if (ev.type === 'deal' && ev.data.dd && ev.data.rivals && ev.data.rivals.n >= 1) { // T6 §16 G5: competed cards, by warning signs
            const g5 = (k, top) => { const t = tally[k] || (tally[k] = { n: 0, top: 0, allow: true, g5: true }); t.n++; if (top) t.top++; };
            const wb = ev.data.dd.flags.some((f) => f.kind === 'warn') ? 'warn1' : 'warn0'; const on = (id) => ev.options.find((o) => o.id === id && o.enabled);
            if (sc.find((x) => x.id === 'inspect:1') && on('inspect:1')) g5('G5|inspect:1|' + wb, topId === 'inspect:1');
            const bb = sc.filter((x) => /^buy/.test(x.id) && on(x.id)).sort((a, b) => b.U - a.U)[0]; if (bb) g5('G5|bestBuy|' + wb, topId === bb.id);
          } }
        let c; if (ev.auto) c = [ev.options[0].id]; else if (ev.type === 'mystery' && ev.data.kind === 'quiz') c = ['a0']; else c = k >= 6 ? [(ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id] : P.decide(st, ev, { r, n: k });
        let res = E.choose(st, ev, c[0], c[1]); if (!res.ok) res = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id);
        ev = res.event; k++;
      }
    }
  }
  return tally;
}
/**
 * E1 strategy table (BRIEF §12–§13, §29): every E1_SET policy × N seeds per world (characters rotated, seeds 9000 + i·13 + world·100003 as
 * E1), free mode, cap 1.6× the limit, quizzes right. After a win the game goes on 24 months under the same policy (continueAfterWin):
 * does the freedom hold? Records: [pol, char, i, status, reason, months, inTime, stars, burnouts, forcedLoans, happy, credit, pwMet, pwBroke]
 */
export function strategiesWorld(wid, n, pols = E1_SET) {
  const w = E.getWorld(wid); const recs = [];
  for (const pol of pols) for (let i = 0; i < n; i++) {
    const ch = w.characters[i % w.characters.length]; const seed = 9000 + i * 13 + worldSeed(wid); const P = policyFor(wid, pol);
    const st = E.createGame({ worldId: wid, charId: ch.id, seed, mode: 'free', mentor: P.mentor || 'hint', ...(SIM_RULES ? { rules: SIM_RULES } : {}) });
    const r = prng(seed * 7919 + pol.length); const lim = E.starThresholds(w, ch.id, st.rules).maxMonths; const cap = Math.round(lim * 1.6);
    let end = null;
    const resolve = (ev0) => { let ev = ev0, k = 0; while (ev) { let c;
      if (ev.auto) c = [ev.options[0].id];
      else if (ev.type === 'mystery' && ev.data.kind === 'quiz') { const q2 = w.mystery.find((x) => x.kind === 'quiz' && x.text === ev.data.question); c = ['a' + q2.correct]; }
      else if (k >= 6) c = [safeId(ev)]; else c = P.decide(st, ev, { r, n: k });
      let res = E.choose(st, ev, c[0], c[1]); if (!res.ok) res = E.choose(st, ev, safeId(ev)); k++; if (res.end) end = res.end; ev = res.event; if (k > 40) break; } };
    const step = () => { if (P.story && !st.over) storyStep(st, P.story, r); if (st.over) return; P.between(st, { r }); if (st.over) return; if (st.pending) { resolve(E.currentEvent(st)); if (st.over) return; } E.rollDice(st); resolve(E.landing(st)); };
    let g = 0; while (!end && st.month <= cap && g++ < 5000) { step(); if (st.over && !end) end = st.result; }
    const won = !!(end && end.status === 'won');
    let pwMet = null, pwBroke = null;
    if (won && E.continueAfterWin(st).ok !== false) { const m0 = st.month; let gg = 0; while (!st.over && st.month < m0 + 24 && gg++ < 2000) step(); pwMet = E.metrics(st).goalHold.met ? 1 : 0; pwBroke = st.flags.bankrupt ? 1 : 0; }
    recs.push([pol, ch.id, i, end ? end.status : 'open', end ? end.reason : null, won ? end.months : null, won && end.months <= lim ? 1 : 0, end ? end.stars || 0 : 0, st.life.burnouts, st.stats.forcedLoans, Math.round(st.life.happiness), Math.round(st.life.creditScore), pwMet, pwBroke]);
  }
  return recs;
}
/** The strategy table (markdown rows) from strategies-wX.json files. */
export function strategiesTable(byWorld) {
  const L = ['| world | policy | in time | won ≤1.6× | median mo | bankrupt | burnouts/game | final 😊 (med) | goal still met 24 mo after win |', '|---|---|---|---|---|---|---|---|---|'];
  for (const [wid, d] of Object.entries(byWorld)) {
    const pols = [...new Set(d.recs.map((x) => x[0]))];
    for (const p of pols) { const R = d.recs.filter((x) => x[0] === p); const W = R.filter((x) => x[3] === 'won'); const pw = W.filter((x) => x[12] != null);
      L.push(`| ${wid} | ${p} | ${pctS(R.filter((x) => x[6]).length / R.length)} | ${pctS(W.length / R.length)} | ${W.length ? q(W.map((x) => x[5]), 0.5) : '—'} | ${pctS(R.filter((x) => x[4] === 'bankrupt').length / R.length)} | ${(R.reduce((a, x) => a + x[8], 0) / R.length).toFixed(1)} | ${q(R.map((x) => x[10]), 0.5)} | ${pw.length ? pctS(pw.filter((x) => x[12]).length / pw.length) : '—'} |`); }
  }
  return L;
}
/** T6 §16 G9: empirical P(close at step k | not before) of the sealed draws on real competed landings vs the public hazard table. */
export function rivalsCalib(wid, n) {
  const w = E.getWorld(wid); const cnt = {}; let cards = 0;
  for (const ch of w.characters) for (let i = 0; i < n; i++) {
    const lim = Math.round(E.starThresholds(w, ch.id).maxMonths * 1.6);
    play(wid, ch.id, seedOf(wid, i) + 31, 'smart', lim, { onLanding: (st) => { const p = st.pending; if (!p || !p.rv || !(p.rv.n >= 1)) return; cards++;
      const a = cnt[p.rv.n] || (cnt[p.rv.n] = [[0, 0], [0, 0], [0, 0]]); for (let k = 1; k <= 3; k++) { if (p.rv.close && p.rv.close < k) break; a[k - 1][0]++; if (p.rv.close === k) { a[k - 1][1]++; break; } } } });
  }
  const rows = []; for (const [nn, a] of Object.entries(cnt)) for (let k = 1; k <= 3; k++) { const [reach, hit] = a[k - 1]; if (reach) rows.push({ n: +nn, step: k, reach, emp: +(hit / reach).toFixed(3), table: +RVM.hazard(wid, +nn, k).toFixed(3) }); }
  return { cards, rows };
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

if (import.meta.url === `file://${process.argv[1]}` && (args.includes('--world-gates') || args.includes('--strategies') || args.includes('--matrix') || args.includes('--dominance') || args.includes('--perf') || args.includes('--report') || args.includes('--stories') || args.includes('--rivals'))) {
  const nArg = +(args.find((a) => /^\d+$/.test(a)) || 0);
  mkdirSync('tools/balance-data', { recursive: true });
  if (args.includes('--stories')) {
    const wid = ONLY || 'w1'; const n = nArg || 60; const t0 = Date.now();
    const games = storiesWorld(wid, n); const sum = storiesSummary(wid, games);
    writeFileSync(`tools/balance-data/stories-${wid}.json`, JSON.stringify({ world: wid, n, engineSha: ENGINE_SHA, secs: Math.round((Date.now() - t0) / 1000), summary: sum, games: games.length }) + '\n');
    console.log(JSON.stringify(sum));
  }
  if (args.includes('--strategies')) {
    const wid = ONLY || 'w1'; const n = nArg || 36; const t0 = Date.now(); const out = process.env.SIM_OUT || `tools/balance-data/strategies-${wid}.json`;
    const recs = strategiesWorld(wid, n);
    writeFileSync(out, JSON.stringify({ world: wid, n, rules: SIM_RULES || E.RULES_CURRENT, engineSha: ENGINE_SHA, secs: Math.round((Date.now() - t0) / 1000), cols: ['policy', 'char', 'i', 'status', 'reason', 'months', 'inTime', 'stars', 'burnouts', 'forcedLoans', 'happy', 'credit', 'pwMet', 'pwBroke'], recs }) + '\n');
    console.log(strategiesTable({ [wid]: { recs } }).join('\n'));
  }
  if (args.includes('--matrix')) {
    const wid = ONLY || 'w1'; const n = nArg || 100; const t0 = Date.now();
    const recs = matrixWorld(wid, n, undefined, (pol, ch, secs) => { if (!QUIET) console.log(`${wid} ${ch} ${pol} done (${secs}s)`); });
    const file = `tools/balance-data/matrix-${wid}.json`;
    writeFileSync(file, JSON.stringify({ world: wid, n, rules: SIM_RULES || E.RULES_CURRENT, engineSha: ENGINE_SHA, secs: Math.round((Date.now() - t0) / 1000), cols: ['policy', 'char', 'i', 'bucket', 'won', 'inTime', 'months', 'stars', 'inspections', 'hints', 'rivalLost', 'played'], recs }) + '\n');
    console.log(`wrote ${file}: ${recs.length} games in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  if (args.includes('--dominance')) {
    const n = nArg || 40; const out = {};
    for (const wid of ONLY ? [ONLY] : E.WORLDS.map((w) => w.id)) out[wid] = dominance(wid, n);
    writeFileSync(`tools/balance-data/dominance${ONLY ? '-' + ONLY : ''}.json`, JSON.stringify({ engineSha: ENGINE_SHA, ...out }) + '\n');
    for (const [wid, t] of Object.entries(out)) { const flagged = Object.entries(t).filter(([, x]) => !x.allow && x.n >= 20 && x.top / x.n > 0.85); console.log(wid, 'flagged:', flagged.map(([k, x]) => `${k} ${x.top}/${x.n}`).join(', ') || 'none'); }
  }
  if (args.includes('--rivals')) { const out = { engineSha: ENGINE_SHA }; for (const wid of ONLY ? [ONLY] : E.WORLDS.map((w) => w.id)) out[wid] = rivalsCalib(wid, nArg || 20); writeFileSync(`tools/balance-data/rivals${ONLY ? '-' + ONLY : ''}.json`, JSON.stringify(out) + '\n'); console.log(JSON.stringify(out).slice(0, 400)); }
  if (args.includes('--perf')) { const pf = { engineSha: ENGINE_SHA, ...perf(ONLY, nArg || 6) }; writeFileSync('tools/balance-data/perf.json', JSON.stringify(pf) + '\n'); console.log(JSON.stringify(pf)); }
  if (args.includes('--report')) t2Report();
  if (args.includes('--world-gates')) {
    const wid = ONLY || 'w5'; const n = nArg || 36; const t0 = Date.now(); const w = E.getWorld(wid);
    const plug = PLUGINS[w.mechanic] || {}; const spec = plug.__gates || {};
    const recs = worldGatesRun(wid, n, spec.policies || []);
    const gates = worldGates(wid, recs, spec);
    const file = process.env.SIM_OUT || `tools/balance-data/gates-${wid}.json`;
    writeFileSync(file, JSON.stringify({ world: wid, n, rules: SIM_RULES || E.RULES_CURRENT, engineSha: ENGINE_SHA, secs: Math.round((Date.now() - t0) / 1000), cols: ['policy', 'char', 'i', 'bucket', 'won', 'inTime', 'months', 'stars', 'turns', 'bankrupt', 'pwMet', 'forcedLoans', 'nwEnd', 'modForced', 'modStat'], gates, recs }) + '\n');
    const pol = [...new Set(recs.map((r) => r[0]))];
    console.log(`| policy | in time | won | median months | bankrupt |\n|---|---|---|---|---|\n` + pol.map((p) => { const rs = recs.filter((r) => r[0] === p); const c = cellStats(rs); return `| ${p} | ${(c.inTime * 100).toFixed(0)}% | ${(rs.filter((r) => r[4]).length / rs.length * 100).toFixed(0)}% | ${Number.isFinite(c.med) ? c.med : '—'} | ${(rs.filter((r) => r[9]).length / rs.length * 100).toFixed(0)}% |`; }).join('\n'));
    console.log('\n| gate | status | numbers |\n|---|---|---|\n' + gates.map((g) => `| ${g.id} ${g.what} | ${g.status} | ${g.text} |`).join('\n'));
    console.log(`wrote ${file} (${recs.length} games, ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  process.exit(0);
}
/* ---------- worlds wave 0: the per-world balance gates of a module world (DESIGN §5.3) — `node tools/sim.mjs --world-gates N wX`
   Every policy below × character × N seeds (seedOf), free mode, cap 1.6× the limit; a winner plays 24 more months under the same policy
   (continueAfterWin) for G-durable. Records: [pol, char, i, bucket, won, inTime, months, stars, turns, bankrupt, pwMet, forcedLoans, nwEnd (at the end, before any continuation), modForced (a module's forced liquidations, w10; FFP fines, w13; deposit runs, w14; frauds found, w11; emergency rounds, w15; forced margin liquidations, w16; group defaults, w12; paydays under the solvency floor, w18; activist campaigns, w19; outflow spirals — money under management < ½ its peak, w20; forced exits at the fund's end, w21), modStat (w21: the final DPI; w20: 1 if it won in time or money under management ≥ the goal at the month limit + 2 if a squeeze on its short made a month ≤ −15 %; w18: 1 if the insurer was ever insolvent in a game with a storm, 0 if not, null without a storm; w14: the last new-loan PD multiplier; w15: the final stake; w16: 1 if a drought-hit harvest had an over-hedge buy-back loss, 0 if not, null without a drought-hit harvest)]. */
export function worldGatePols() { return ['guideTapper', 'blindTapper', 'naive', 'smart', 'saver', 'founder', 'diversified', 'gambler', 'f:frugal', 'f:none', 'maxDebt']; }
export function worldGatesRun(wid, n, extra = []) {
  const w = E.getWorld(wid); const recs = []; const t0 = Date.now();
  const pols = [...worldGatePols(), ...extra];
  for (const ch of w.characters) {
    const lim = E.starThresholds(w, ch.id, E.RULES_CURRENT).maxMonths; const cap = Math.round(lim * 1.6);
    const buckets = Array.from({ length: n }, (_, i) => E.CY.cycleBucket(E.cyclePath(seedOf(wid, i), wid, lim), lim));
    for (const pol of pols) {
      for (let i = 0; i < n; i++) {
        const { st, end } = play(wid, ch.id, seedOf(wid, i), pol, cap);
        const won = !!(end && end.status === 'won'); let pw = null; const mEnd = E.metrics(st); const nwEnd = Math.round(mEnd.netWorth); const wiE = mEnd.worldIndicators || {}; const modForced = (wiE.portfolio || {}).forced || (wiE.league || {}).ffp || (wiE.credit || {}).runs || (wiE.multinational || {}).frauds || (wiE.platform || {}).crunches || (wiE.harvest || {}).forced || (wiE.holding || {}).defaults || (wiE.insure || {}).regs || (wiE.bell || {}).activists || (wiE.funds || {}).spirals || (wiE.lbo || {}).forced || 0; const modStat = wiE.lbo ? wiE.lbo.dpi : wiE.funds ? ((won && end.months <= lim) || (wiE.funds.aumAtLimit ?? wiE.funds.aum) >= wiE.funds.aumTarget ? 1 : 0) + (wiE.funds.squeezeBlowups ? 2 : 0) : wiE.insure ? (wiE.insure.cats ? (wiE.insure.insolvent ? 1 : 0) : null) : wiE.credit ? wiE.credit.pdNew : wiE.platform ? wiE.platform.stake : wiE.harvest ? (wiE.harvest.droughtHarv ? (wiE.harvest.overDrought > 0 ? 1 : 0) : null) : null;
        if (won && E.continueAfterWin(st).ok !== false) { const P = policyFor(wid, pol); const r = prng(i + 101); const m0 = st.month; let g = 0;
          while (!st.over && st.month < m0 + 24 && g++ < 3000) { P.between(st, { r }); if (st.over) break; if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 12) { const c = k > 6 ? [(ev.options.find((o) => o.enabled && ['done', 'pass', 'ok', 'decline'].includes(o.id)) || ev.options.find((o) => o.enabled)).id] : P.decide(st, ev, { r, n: k }); const res = E.choose(st, ev, c[0], c[1]); ev = res.event; } if (st.over) break; }
            E.rollDice(st); let ev = E.landing(st); let k = 0; while (ev && !st.over) { const c = ev.auto ? [ev.options[0].id] : k > 6 ? [(ev.options.find((o) => o.enabled && ['done', 'pass', 'ok', 'decline'].includes(o.id)) || ev.options.find((o) => o.enabled)).id] : P.decide(st, ev, { r, n: k }); let res = E.choose(st, ev, c[0], c[1]); if (!res.ok) res = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['done', 'pass', 'ok', 'decline'].includes(o.id)) || ev.options.find((o) => o.enabled)).id); ev = res.event; k++; } }
          pw = E.metrics(st).goalHold.met && !st.flags.bankrupt ? 1 : 0; }
        recs.push([pol, ch.id, i, buckets[i], won ? 1 : 0, won && end.months <= lim ? 1 : 0, won ? end.months : null, end ? end.stars || 0 : 0, end ? end.turns : st.turn, end && end.reason === 'bankrupt' ? 1 : 0, pw, st.stats.forcedLoans, nwEnd, modForced, modStat]);
      }
      if (!QUIET) console.log(`${wid} ${ch.id} ${pol} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
  return recs;
}
/** The gate table of a world-gates record set (DESIGN §5.3 + the world's own `gates` extras). → [{id, what, status, text}] */
export function worldGates(wid, recs, extra = {}) {
  const P = (x) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(0) + '%');
  const of = (pol, f = () => true) => recs.filter((r) => r[0] === pol && f(r)); const S = (rs) => cellStats(rs);
  const chars = [...new Set(recs.map((r) => r[1]))]; const pool = (pol) => S(of(pol));
  const G = []; const st = (b) => (b ? 'met' : 'NOT met'); const add = (id, what, ok, text) => G.push({ id, what, status: st(ok), text });
  const gt = pool('guideTapper'); const worstG = Math.min(...chars.map((c) => S(of('guideTapper', (r) => r[1] === c)).inTime));
  add('G-guide', 'guideTapper in time ≥ 60 % pooled, worst character ≥ 50 %', gt.inTime >= 0.6 && worstG >= 0.5, `${P(gt.inTime)} · worst ${P(worstG)} · ${chars.map((c) => `${c} ${P(S(of('guideTapper', (r) => r[1] === c)).inTime)}`).join(' ')}`);
  const bl = pool('blindTapper'); add('G-blind', 'blindTapper in time ≤ 8 %', bl.inTime <= 0.08, P(bl.inTime));
  const sm = pool('smart'), nv = pool('naive'); add('G-smart', 'smart ≥ naive + 5 pp and smart median months < naive', sm.inTime >= nv.inTime + 0.05 && sm.med < nv.med, `smart ${P(sm.inTime)} med ${sm.med} · naive ${P(nv.inTime)} med ${Number.isFinite(nv.med) ? nv.med : '—'}`);
  const reach = chars.map((c) => [c, S(of('smart', (r) => r[1] === c)).inTime]); add('G-reach', 'every character: smart in time ≥ 40 %', reach.every(([, x]) => x >= 0.4), reach.map(([c, x]) => `${c} ${P(x)}`).join(' · '));
  const lossN = of('naive'), lossD = of('maxDebt'); const lossRate = (rs) => (rs.length ? rs.filter((r) => r[9] || !r[5]).length / rs.length : 0); const smLose = of('smart').filter((r) => !r[5]).length / Math.max(1, of('smart').length);
  add('G-loss', 'naive or maxDebt bankrupt / out of time ≥ 15 % AND smart loses ≥ 5 %', Math.max(lossRate(lossN), lossRate(lossD)) >= 0.15 && smLose >= 0.05, `naive ${P(lossRate(lossN))} (bankrupt ${P(lossN.filter((r) => r[9]).length / Math.max(1, lossN.length))}) · maxDebt ${P(lossRate(lossD))} (bankrupt ${P(lossD.filter((r) => r[9]).length / Math.max(1, lossD.length))}) · smart loses ${P(smLose)}`);
  // G-dom: best-policy share over character × cycle-bucket cells (≥ 8 games), the module ablations vs smart
  // A4 (DESIGN §5.3 "best-cell share ≤ 60 % for every archetype"): cells = character × cycle bucket with ≥ 8 games; the share of cells in
  // which each ARCHETYPE (saver / founder / diversified / gambler) is the best of the four. smart is the reference, reported beside it.
  const A4 = ['saver', 'founder', 'diversified', 'gambler'].filter((p) => of(p).length);
  const cells = []; for (const c of chars) for (const b of [...new Set(recs.map((r) => r[3]))]) if (of('saver', (r) => r[1] === c && r[3] === b).length >= 8) cells.push({ c, b });
  const share = Object.fromEntries(A4.map((p) => [p, 0]));
  for (const cell of cells) { const sx = A4.map((p) => ({ p, s: S(of(p, (r) => r[1] === cell.c && r[3] === cell.b)) })); const top = sx.filter((x) => !sx.some((y) => better(y.s, x.s))); for (const t of top) share[t.p] += 1 / top.length; }
  const maxShare = Math.max(...Object.values(share).map((x) => (cells.length ? x / cells.length : 0)));
  const abl = (extra.ablations || []).map((p) => ({ p, s: pool(p) })).filter((x) => x.s.n);
  add('G-dom', 'no archetype best in > 60 % of cells (A4); every module ablation loses to smart by ≥ 5 pp', maxShare <= 0.6 && abl.every((x) => sm.inTime - x.s.inTime >= 0.05), `cells ${cells.length}: ${Object.entries(share).map(([p, x]) => `${p} ${P(cells.length ? x / cells.length : 0)}`).join(' ')} · ablations: ${abl.map((x) => `${x.p} ${P(x.s.inTime)} (Δ ${((sm.inTime - x.s.inTime) * 100).toFixed(0)} pp)`).join(' · ')}`);
  const fr = pool('f:frugal'); add('G-frugal', 'f:frugal is not the best (it does not beat smart by > 5 pp)', fr.inTime <= sm.inTime + 0.05, `f:frugal ${P(fr.inTime)} vs smart ${P(sm.inTime)} · f:none ${P(pool('f:none').inTime)}`);
  const pw = recs.filter((r) => ['smart', 'guideTapper'].includes(r[0]) && r[4] && r[10] != null); add('G-durable', '≥ 85 % of winners (smart, guide) still meet the goal 24 months after the win', pw.length > 0 && pw.filter((r) => r[10]).length / pw.length >= 0.85, `${pw.filter((r) => r[10]).length}/${pw.length} = ${P(pw.length ? pw.filter((r) => r[10]).length / pw.length : NaN)}`);
  const turns = recs.filter((r) => ['smart', 'guideTapper'].includes(r[0]) && r[4]).map((r) => r[8]); const mt = turns.length ? q(turns, 0.5) : NaN;
  add('G-time', 'median won rolls (smart + guide) 60–100', mt >= 60 && mt <= 100, `median ${mt} rolls (p10 ${turns.length ? q(turns, 0.1) : '—'}, p90 ${turns.length ? q(turns, 0.9) : '—'}) · median won months smart ${sm.med} guide ${gt.med}`);
  for (const g of extra.gates || []) { const r = g(of, S, P, recs); G.push(r); }
  return G;
}

/** T6 §16 sim gates G1–G9 from the matrix records (rivalLost / played columns, the abl:noRival ablation), the --dominance G5 tallies and
 *  the --rivals calibration. Cells = world × character × cycle bucket with ≥ 15 games (as A4). → [{id, what, status, text}] where status is
 *  'met' | 'not met' | 'accepted' (a director-accepted known limit, non-blocking) | 'report' | 'not run'. Shared by the report and tests/balance_gates.mjs. */
export function t6GateResults(byWorld, dom = {}, cal = null) {
  const worlds = Object.keys(byWorld).sort(); const ARCH = ['saver', 'founder', 'diversified', 'gambler'];
  const P = (x) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(0) + '%');
  const of = (wid, pol, f = () => true) => byWorld[wid].recs.filter((r) => r[0] === pol && f(r));
  if (!worlds.length || !worlds.every((w) => ARCH.every((a) => of(w, a).length))) return [];
  const st = (b) => (b ? 'met' : 'not met');
  const cells = []; for (const wid of worlds) { const keys = new Set(of(wid, 'smart').map((r) => r[1] + '|' + r[3])); for (const k of keys) { const [c, b] = k.split('|'); if (of(wid, 'smart', (r) => r[1] === c && r[3] === b).length >= 15) cells.push({ wid, c, b }); } }
  const share = Object.fromEntries(ARCH.map((a) => [a, 0]));
  for (const cell of cells) { const sx = ARCH.map((p) => ({ p, s: cellStats(of(cell.wid, p, (r) => r[1] === cell.c && r[3] === cell.b)) })); const top = sx.filter((x) => !sx.some((y) => better(y.s, x.s))); for (const t of top) share[t.p] += 1 / top.length; }
  for (const a of ARCH) share[a] = cells.length ? share[a] / cells.length : 0;
  const g2 = Object.fromEntries(ARCH.map((a) => [a, []]));
  for (const wid of worlds) for (const b of [...new Set(byWorld[wid].recs.map((r) => r[3]))].sort()) { const sx = ARCH.map((p) => ({ p, s: cellStats(of(wid, p, (r) => r[3] === b)) })); if (sx[0].s.n < 15) continue; const top = sx.filter((x) => !sx.some((y) => better(y.s, x.s))); for (const t of top) g2[t.p].push(`${wid}/${b}`); }
  const A4SET = ['guideTapper', 'naive', 'cautious', 'greedy', 'smart', 'adaptive', ...ARCH]; const s3 = Object.fromEntries(A4SET.map((p) => [p, 0]));
  for (const cell of cells) { const sx = A4SET.map((p) => ({ p, s: cellStats(of(cell.wid, p, (r) => r[1] === cell.c && r[3] === cell.b)) })); const top = sx.filter((x) => !sx.some((y) => better(y.s, x.s))); for (const t of top) s3[t.p] += 1 / top.length; }
  const beats = (a, b) => a.inTime >= b.inTime - 1e-9 && a.med <= b.med && (a.inTime > b.inTime + 1e-9 || a.med < b.med);
  const pool = (pol) => cellStats(worlds.flatMap((w) => of(w, pol)));
  const ddW = worlds.map((w) => { const f = cellStats(of(w, 'smart')), nv = cellStats(of(w, 'dd:never')), al = cellStats(of(w, 'dd:always')); return { w, f, nv, al, ok: beats(f, nv) && beats(f, al) }; });
  const g4 = beats(pool('smart'), pool('dd:never')) && beats(pool('smart'), pool('dd:always')) && ddW.filter((x) => x.ok).length >= Math.min(3, worlds.length);
  const per60 = (pol) => worlds.flatMap((w) => of(w, pol)).filter((r) => r.length > 11).map((r) => r[10] * 60 / Math.max(1, r[11]));
  const qq = (xs, p) => (xs.length ? q(xs, p) : NaN); const mean = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : NaN);
  const g6s = qq(per60('smart'), 0.5), g6a = mean(per60('dd:always')), g6m = mean(per60('smart')); const naiveLost = worlds.flatMap((w) => of(w, 'naive')).filter((r) => r[10] > 0).length;
  const g7 = worlds.map((w) => ({ w, d: of(w, 'abl:noRival').length ? (cellStats(of(w, 'smart')).inTime - cellStats(of(w, 'abl:noRival')).inTime) * 100 : NaN }));
  const g8 = worlds.map((w) => { const g = cellStats(of(w, 'guideTapper')); const chars = [...new Set(byWorld[w].recs.map((r) => r[1]))].map((c) => cellStats(of(w, 'guideTapper', (r) => r[1] === c)).inTime); return { w, g: g.inTime, worst: Math.min(...chars), s: cellStats(of(w, 'smart')).inTime, a: cellStats(of(w, 'adaptive')).inTime }; });
  const g5 = ['inspect:1', 'bestBuy'].flatMap((o) => ['warn0', 'warn1'].map((wb) => { let n = 0, top = 0; for (const t of Object.values(dom)) { const x = t && t['G5|' + o + '|' + wb]; if (x) { n += x.n; top += x.top; } } return { o, wb, n, r: n ? top / n : NaN }; }));
  const F1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'); const F2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
  const R = [];
  R.push({ id: 'G1', what: 'no archetype best of the four in > 60% of cells', status: st(Object.values(share).every((x) => x <= 0.6)), text: `${cells.length} cells: ${ARCH.map((a) => `${a} ${P(share[a])}`).join(' · ')}` });
  R.push({ id: 'G2', what: 'each archetype best in ≥ 1 cycle bucket (pooled over characters)', status: st(ARCH.every((a) => g2[a].length)), text: ARCH.map((a) => `${a}: ${g2[a].join(', ') || 'none'}`).join(' · ') });
  R.push({ id: 'G3', what: 'A4 with competition (≤ 60% each)', status: st(Object.values(s3).every((x) => x / Math.max(1, cells.length) <= 0.6)), text: Object.entries(s3).sort((x, y) => y[1] - x[1]).map(([p, x]) => `${p} ${P(x / Math.max(1, cells.length))}`).join(' · ') });
  R.push({ id: 'G4', what: 'dd:flagged beats dd:never and dd:always (pooled and ≥ 3 worlds)', status: st(g4), text: `pooled flagged ${P(pool('smart').inTime)}/${pool('smart').med} · never ${P(pool('dd:never').inTime)}/${pool('dd:never').med} · always ${P(pool('dd:always').inTime)}/${pool('dd:always').med}; ${ddW.map((x) => `${x.w} ${P(x.f.inTime)}/${x.f.med} vs ${P(x.nv.inTime)}/${x.nv.med} vs ${P(x.al.inTime)}/${x.al.med}${x.ok ? ' ✓' : ' ✗'}`).join(' · ')}` });
  const g5in = g5.every((x) => x.n) && g5.every((x) => x.r >= 0.10 && x.r <= 0.85);
  R.push({ id: 'G5', what: 'competed cards: inspect:1 and the best buy top-U in 10–85% (0 / ≥ 1 warn)', status: !g5.every((x) => x.n) ? 'not run' : g5in ? 'met' : 'accepted', text: `${g5.map((x) => `${x.o} ${x.wb} ${P(x.r)} of ${x.n}`).join(' · ')}${g5in ? '' : ' — director: accepted known limit (no evaluator change in T6); follow-up: score inspect:1 vs inspect:2 using the level-1 range'}` });
  R.push({ id: 'G6', what: 'competition felt, not punishing: dd:always mean lost deals / 60 months in [0.3, 2.5] (director, replaces the smart median); naive 0', status: st(g6a >= 0.3 && g6a <= 2.5 && naiveLost === 0), text: `dd:always mean ${F2(g6a)} · smart median ${F2(g6s)} (mean ${F2(g6m)}) · naive games with a loss ${naiveLost}` });
  R.push({ id: 'G7', what: '`_dev.noRival` changes smart in time by ≤ 5 pp', status: st(g7.every((x) => Math.abs(x.d) <= 5 + 1e-9)), text: g7.map((x) => `${x.w} ${F1(x.d)} pp`).join(' · ') });
  R.push({ id: 'G8', what: 'A1 (guideTapper ≥ 65%, every character ≥ 50%) and A3 (smart, adaptive 55–75%)', status: st(g8.every((x) => x.g >= 0.65 && x.worst >= 0.5 && x.s >= 0.55 && x.s <= 0.75 && x.a >= 0.55 && x.a <= 0.75)), text: g8.map((x) => `${x.w} guide ${P(x.g)} (worst ${P(x.worst)}) · smart ${P(x.s)} · adaptive ${P(x.a)}`).join(' | ') });
  R.push({ id: 'G9', what: 'calibration (empirical hazard of the sealed draws vs the table, cells ≥ 500)', status: cal ? 'report' : 'not run', text: cal ? worlds.map((w) => { const rs = (cal[w] || { rows: [] }).rows.filter((x) => x.reach >= 500); return `${w}: ${rs.length ? `max |Δ| ${(Math.max(...rs.map((x) => Math.abs(x.emp - x.table))) * 100).toFixed(1)} pp over ${rs.length} cells (${cal[w].cards} cards)` : 'no cell ≥ 500'}`; }).join(' · ') + ' (the binding check is AC-8, 300,000 cards per world)' : '' });
  return R;
}
function t6Gates(byWorld, dom, P, ok) {
  const cal = existsSync('tools/balance-data/rivals.json') ? JSON.parse(readFileSync('tools/balance-data/rivals.json', 'utf8')) : null;
  const R = t6GateResults(byWorld, dom, cal); if (!R.length) return [];
  const lab = (s) => (s === 'met' ? 'met' : s === 'not met' ? '**NOT met**' : s);
  return ['', '## T6 rivals gates (spec §16; matrix records + `--dominance` + `--rivals`)', '', '| gate | result | numbers |', '|---|---|---|', ...R.map((x) => `| ${x.id} ${x.what} | ${lab(x.status)} | ${x.text} |`)];
}
function t2Report() {
  const byWorld = {}; for (const w of ['w1', 'w2', 'w3', 'w4']) { const f = [`tools/balance-data/matrix-${w}.json`, `tools/balance-t2-${w}.json`].find(existsSync); if (f) byWorld[w] = JSON.parse(readFileSync(f, 'utf8')); }
  const G = gates(byWorld); const P = (x) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(0) + '%'); const Mo = (x) => (Number.isFinite(x) ? x : '—');
  const dom = {}; for (const f of ['tools/balance-data/dominance.json', ...['w1', 'w2', 'w3', 'w4'].map((w) => `tools/balance-data/dominance-${w}.json`)]) if (existsSync(f)) { const j = JSON.parse(readFileSync(f, 'utf8')); delete j.engineSha; Object.assign(dom, j); }
  const perfF = ['tools/balance-data/perf.json', 'tools/balance-t2-perf.json'].find(existsSync) || 'tools/balance-data/perf.json'; const pf = existsSync(perfF) ? JSON.parse(readFileSync(perfF, 'utf8')) : null;
  const L = [];
  const rulesSet = [...new Set(Object.values(byWorld).map((x) => x.rules || (x.engineSha === ENGINE_SHA ? E.RULES_CURRENT : 4)))].join('/');
  L.push(`# דוח איזון — מירוץ העכברים, כללים ${rulesSet} (שדרוג מלא: תיקוני כלכלה E1 + איזון, על בסיס T2/T3/T6)`, '');
  L.push(`Rule set measured: **${rulesSet}** (free games start with the current rules). Never compare these numbers with a run of another rule set as if they were the same game (BRIEF §12).`, '');
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
  // director targets after the T2 review (M4) + T3
  { const pool = (w, pol) => cellStats(byWorld[w].recs.filter((r) => r[0] === pol)); const ws = Object.keys(byWorld); const has = (pol) => ws.every((w) => byWorld[w].recs.some((r) => r[0] === pol));
    L.push('', '## Director targets (T2 review M4, owner wants a harder game)', '', '| target | result | numbers |', '|---|---|---|');
    const rng = (w) => (w === 'w1' ? [0.70, 0.85] : [0.55, 0.72]);
    L.push(`| smart and adaptive: w1 70–85%, w2–w4 55–72% | ${ok(ws.every((w) => ['smart', 'adaptive'].every((p) => { const x = pool(w, p).inTime; return x >= rng(w)[0] && x <= rng(w)[1]; })))} | ${ws.map((w) => `${w} ${P(pool(w, 'smart').inTime)} / ${P(pool(w, 'adaptive').inTime)}`).join(' · ')} |`);
    L.push(`| guideTapper ≥ 60% | ${ok(ws.every((w) => pool(w, 'guideTapper').inTime >= 0.6))} | ${ws.map((w) => `${w} ${P(pool(w, 'guideTapper').inTime)}`).join(' · ')} |`);
    L.push(`| blindTapper ≤ 30% | ${ok(ws.every((w) => pool(w, 'blindTapper').inTime <= 0.3))} | ${ws.map((w) => `${w} ${P(pool(w, 'blindTapper').inTime)}`).join(' · ')} |`);
    L.push(`| smart ≥ naive + 5 pp in every world | ${ok(ws.every((w) => pool(w, 'smart').inTime >= pool(w, 'naive').inTime + 0.05))} | ${ws.map((w) => `${w} smart ${P(pool(w, 'smart').inTime)} vs naive ${P(pool(w, 'naive').inTime)}`).join(' · ')} |`);
    if (has('life:cheap')) L.push(`| w1: cheapest vs most expensive habit on personal / values cards ≤ 10 pp | ${byWorld.w1 ? ok(Math.abs(pool('w1', 'life:cheap').inTime - pool('w1', 'life:dear').inTime) <= 0.10) : '—'} | ${ws.map((w) => `${w} ${P(pool(w, 'life:cheap').inTime)} vs ${P(pool(w, 'life:dear').inTime)}`).join(' · ')} |`);
  }
  L.push(...t6Gates(byWorld, dom, P, ok));
  { const st = {}; for (const w of ['w1', 'w2', 'w3', 'w4']) { const f = `tools/balance-data/stories-${w}.json`; if (existsSync(f)) st[w] = JSON.parse(readFileSync(f, 'utf8')).summary; }
    if (Object.keys(st).length) {
      L.push('', '## T3 stories & business (`node tools/sim.mjs --stories N wX`: blindTapper, guideTapper, smart, sideHustler, owner × N each)', '', '| world | car / move / friend / career / crisis start | side (side-plan ≥ 15 mo) | completion | steps / run | chain items / 12 mo (med · p90) | business items / business-year (med · p90) | defaults share | standalone repeats < 12 mo | max open items / chains | stage distribution (0/1/2/3) |', '|---|---|---|---|---|---|---|---|---|---|---|');
      for (const [w, x] of Object.entries(st)) L.push(`| ${w} | ${x.start.car}% / ${x.start.move}% / ${x.start.friend}% / ${x.start.career}% / ${x.start.crisis}% | ${x.side15 ?? '—'}% | ${x.completion}% | ${x.stepsPerRun} | ${x.chainItems12.med} · ${x.chainItems12.p90} | ${x.bizItemsYear.med} · ${x.bizItemsYear.p90} | ${x.defaultsShare}% | ${x.repeats} | ${x.maxOpen} / ${x.maxChains} | ${x.stageDist.join('/')} |`);
    } }
  { const sd = {}; for (const w of ['w1', 'w2', 'w3', 'w4']) { const f = `tools/balance-data/strategies-${w}.json`; if (existsSync(f)) sd[w] = JSON.parse(readFileSync(f, 'utf8')); }
    if (Object.keys(sd).length) L.push('', `## E1 strategy table (BRIEF §12–§13, §29: \`node tools/sim.mjs --strategies N wX\`, N = ${Object.values(sd).map((x) => `${x.world} ${x.n}`).join(' · ')} per policy, characters rotated, seeds 9000 + i·13 + world·100003; after a win the same policy plays 24 more months)`, '', ...strategiesTable(sd)); }
  L.push('', '## In time by world × policy (all characters pooled)', '', '| policy | ' + Object.keys(byWorld).join(' | ') + ' |', '|---|' + Object.keys(byWorld).map(() => '---|').join(''));
  const pols = [...new Set(Object.values(byWorld).flatMap((x) => x.recs.map((r) => r[0])))];
  for (const pol of pols) L.push(`| ${pol} | ` + Object.keys(byWorld).map((w) => { const s = cellStats(byWorld[w].recs.filter((r) => r[0] === pol)); return `${P(s.inTime)} · med ${Mo(s.med)} · ★★★ ${P(s.star3)}`; }).join(' | ') + ' |');
  L.push('', '## Per character (in time / median months)', '');
  for (const [w, x] of Object.entries(byWorld)) { const chars = [...new Set(x.recs.map((r) => r[1]))]; L.push(`**${w}** — ` + ['guideTapper', 'blindTapper', 'naive', 'smart', 'adaptive'].map((pol) => `${pol}: ` + chars.map((c) => { const s = cellStats(x.recs.filter((r) => r[0] === pol && r[1] === c)); return `${c} ${P(s.inTime)}/${Mo(s.med)}`; }).join(', ')).join(' · '), ''); }
  L.push('## Cycle buckets (smart, in time)', '');
  for (const [w, x] of Object.entries(byWorld)) { const bs = ['B0_calm', 'B1_early', 'B2_late', 'B3_long']; L.push(`**${w}** — ` + bs.map((b) => { const s = cellStats(x.recs.filter((r) => r[0] === 'smart' && r[3] === b)); return `${b} ${s.n ? P(s.inTime) : '—'} (n ${s.n})`; }).join(' · '), ''); }
  if (existsSync('tools/balance-data/notes.md')) L.push('', readFileSync('tools/balance-data/notes.md', 'utf8').trim()); // the hand-written reading of these numbers
  const sha = Object.values(byWorld).map((x) => x.engineSha).filter(Boolean); if (sha.length) L.push('', `Engine measured: ${[...new Set(sha)].map((x) => x.slice(0, 12)).join(', ')} (sha256 of the canonical bundle, tools/build-edge.mjs).`);
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
