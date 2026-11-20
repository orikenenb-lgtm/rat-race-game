#!/usr/bin/env node
// Balance simulator. Plays thousands of seeded games per world/character/policy and prints a report.
// Usage: node tools/sim.mjs [games=600] [worldId|all] [--md tools/balance-report.md] [--quiet]
import * as E from '../js/engine.js';
import { writeFileSync } from 'node:fs';

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
function bufferOf(st, months) { return E.metrics(st).expenses * months; }

function tradeAction(st, ev, pol, ctx) {
  const d = ev.data; const w = E.getWorld(st.worldId); const t = w.tickers[d.ticker]; const m = E.metrics(st);
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
  const L = st.life; const m = E.metrics(st);
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
    const S = E.metrics(st).salary; const L = st.life;
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

const POLICIES = {
  random: {
    decide(st, ev, ctx) {
      if (ev.type === 'trade') return tradeAction(st, ev, 'random', ctx);
      const en = ev.options.filter((o) => o.enabled && o.id !== 'done');
      if (!en.length) return ['done'];
      if (ctx.n >= 2) return [has(ev, 'done') ? 'done' : en[0].id];
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
        default: return [ev.options.find((o) => o.enabled).id];
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
  // a kid who just taps the highlighted button every time (and never touches the loan buttons)
  tapper: {
    decide(st, ev, ctx) {
      if (ev.type === 'trade') return ['done'];
      const o = ev.options.find((x) => x.primary) || ev.options.find((x) => x.enabled);
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

function betweenCommon(st, bufMonths, smart = false) {
  const m = E.metrics(st);
  // cheap bank loans are worth keeping while cash can buy assets that earn more; repay expensive ones first
  const buf = m.expenses * (smart && m.loanPct <= 3 ? Math.max(bufMonths, 2.5) : bufMonths);
  if (st.credit && st.cash - st.credit >= buf * 0.5) E.payCredit(st);
  let guard = 0;
  while (!st.over && st.loans > 0 && st.cash - m.loanUnit >= buf && guard++ < 50) { const r = E.repayLoan(st); if (!r.ok || st.over) break; }
}

function greedyLike(st, ev, ctx, smart) {
  const d = ev.data; const w = E.getWorld(st.worldId); const m = E.metrics(st);
  const buf = smart ? m.expenses * 1 : m.expenses * 0.3;
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
      if (smart && !ABL.has('noNeg') && ctx.n === 0) { const off = ev.options.find((x) => x.id === 'offer:5' && x.enabled && x.chance >= 0.85); if (off && (ev.options.find((x) => x.id === pick).net || 0) > 0) return [off.id]; }
      const o = ev.options.find((x) => x.id === pick);
      const loanCost = o.loanMonthly || 0; const net = o.net;
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
      const opts = [];
      for (const u of d.upgrades) opts.push({ id: 'up:' + u.assetId.slice(1), cost: u.cost, gain: u.gain });
      for (const t of d.trims) opts.push({ id: 'trim:' + t.expenseId, cost: t.cost, gain: t.cut });
      const ok = opts.filter((o) => has(ev, o.id) && o.gain * 12 / o.cost >= (smart ? 0.45 : 0.3) && (st.cash - o.cost >= (smart ? buf * 0.5 : 0) || (smart && o.gain > o.cost * E.loanPct(st) / 100)));
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
    case 'payday': case 'edu': return [planEventPick(st, ev, smart ? 'smart' : 'greedy')];
    case 'life': return [lifePick(st, ev, smart ? 'smart' : 'greedy')];
    default: return [firstEnabled(ev, ['ok', 'done', 'pass']) || ev.options.find((o) => o.enabled).id];
  }
}

/* ---------- play one game */
const QUIZ_SKILL = { random: 0.33, cautious: 0.8, greedy: 0.7, smart: 0.95, reckless: 0.4, tapper: 0.5 };
export function play(worldId, charId, seed, pol, capMonths, opts = {}) {
  const { log, ...gameOpts } = opts;
  const st = E.createGame({ worldId, charId, seed, mode: 'free', ...gameOpts });
  const P = POLICIES[pol];
  const r = prng(seed * 7919 + pol.length);
  let end = null; let guard = 0;
  while (!end && st.month <= capMonths && guard++ < 5000) {
    P.between(st, { r });
    if (st.over) { end = st.result; break; }
    E.rollDice(st);
    let ev = E.landing(st);
    let n = 0;
    while (ev) {
      let choice;
      if (ev.auto) choice = [ev.options[0].id];
      else if (ev.type === 'mystery' && ev.data.kind === 'quiz') {
        const c = E.getWorld(worldId).mystery.find((x) => x.kind === 'quiz' && x.text === ev.data.question);
        choice = [r() < QUIZ_SKILL[pol] ? 'a' + c.correct : 'a' + ((c.correct + 1) % c.answers.length)];
      } else choice = P.decide(st, ev, { r, n });
      let res = E.choose(st, ev, choice[0], choice[1]);
      if (opts.log) console.log(`m${st.month} t${st.turn} ${ev.type}:${ev.title} -> ${choice[0]}${choice[1] ? JSON.stringify(choice[1]) : ''} | cash ${st.cash} loans ${st.loans} cf ${E.metrics(st).cashflow} nw ${E.metrics(st).netWorth}${res.news && res.news.length ? ' NEWS ' + res.news.map((x) => x.text).join(' / ') : ''}`);
      if (!res.ok) res = E.choose(st, ev, ev.options.find((o) => o.id === 'done' || o.id === 'pass' || o.id === 'ok') ? ev.options.find((o) => ['done', 'pass', 'ok'].includes(o.id)).id : ev.options.find((o) => o.enabled).id);
      n++;
      if (res.end) end = res.end;
      ev = res.event;
      if (n > 40) throw new Error('event loop ' + ev?.type);
    }
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
