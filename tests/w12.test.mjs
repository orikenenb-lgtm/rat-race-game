#!/usr/bin/env node
// w12 האימפריה (engine side): lazy registration, the new `holding` module (fixed draws on stream `world`: 16 at init, 10 per payday, 4 per
// 'Z' landing), the division-sale card (a range that contains the sealed profit, due diligence narrows it and keeps the card open, 40 % down
// + debt on the division, guaranteed or ring-fenced, pass = the safe option), structure (ring-fenced = +1.5 pp, a 0.5 % switch fee, refused
// for a guaranteed division in deficit), the covenant breach (2 negative paydays: a guarantee call of 60 % paid by HQ, else a group default
// — debt + 25 % to HQ, rating −1, cross-default; a ring-fenced one's 30 % cure or its loss, never below zero in net worth), coverage, the
// annual dividend and rating review, the restructuring star gate, Z actions replayed and verified, saves, fuzz, the public view, H-fict and
// the verifier's per-world pack.
// Run: node tests/w12.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, HD, RATES, RATINGS, TEMPLATES, KINDS, SLOTS, grossOf, rateOf, covMonths, groupService, divOf } from '../js/worlds/mech/holding.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w12 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 9, ★ in w11); its lessons arrive with its pack', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w12'), false); assert.throws(() => E.getWorld('w12'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'contagion'), false, 'the core carries no w12 lesson');
  const w = await E.ensureWorld('w12'); assert.equal(w.id, 'w12'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'holding'); assert.deepEqual(w.modules, ['holding']); assert.equal(w.streams, undefined);
  for (const id of ['contagion', 'ring_fence', 'stable_group']) assert.ok(E.LESSONS.some((l) => l.id === id), id + ' registered from the pack');
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w12');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 9); assert.equal(m.ranked, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w11'], count: 1, stars: 1 }]);
});

const W = E.getWorld('w12'); const CH = W.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const payday = (st) => { const p = st.stats.paydays; let g = 0; while (!st.over && st.stats.paydays === p && g++ < 60) step(st); };
const play = (cfg, r, { zRate = 0.25, maxTurns = 300, onTurn } = {}) => {
  const st = E.createGame(cfg);
  for (let t = 0; t < maxTurns && !st.over; t++) {
    if (r() < zRate) { const acts = E.worldActions(st).filter((a) => a.enabled); if (acts.length) { const a = acts[Math.floor(r() * acts.length)]; E.worldAction(st, a.id, a.param); } }
    if (st.over) break;
    if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 20 && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } if (st.over) break; }
    E.rollDice(st); let ev = E.landing(st); let k = 0;
    while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = k > 3 ? (en.find((x) => ['ok', 'done', 'pass', 'decline'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; k++; }
    if (onTurn) onTurn(st, t);
  }
  return st;
};
const toZ = (st) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 400 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const HI = (st) => E.metrics(st).worldIndicators.holding;
const asset = (st, d) => st.assets.find((a) => a.id === d.sid);

await test('start: rules 7; NW ₪500–700M; the goal is all(nw ₪2B, noDefault 24, liquidity 12 months) hold 3; the three starts as specified', () => {
  assert.equal(E.createGame({ worldId: 'w12', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => g.type), ['nw', 'noDefault', 'liquidity']); assert.equal(W.goal.hold, 3); assert.equal(W.goal.of[0].target, 2e9); assert.equal(W.goal.of[1].months, 24); assert.equal(W.goal.of[2].months, 12);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w12', charId: ch, seed: 9 }); const m = E.metrics(st);
    assert.ok(m.netWorth >= 500e6 && m.netWorth <= 700e6, ch + ' NW ' + m.netWorth); assert.equal(m.worldIndicators.panel.id, 'holding');
    assert.equal(m.netWorth, st.cash - st.loans - HI(st).hqDebt + st.assets.reduce((x, a) => x + a.value - a.debt, 0)); assert.ok(m.passive > 0, ch + ' passive'); }
  const c = E.createGame({ worldId: 'w12', charId: 'chair', seed: 9 }); const M = c.world.hd;
  assert.equal(M.divs.length, 6); assert.equal(M.divs.filter((d) => d.struct === 'g').length, 3); assert.equal(RATINGS[M.rating], 'A');
  const weak = M.divs.find((d) => d.kind === 'ind'); assert.equal(weak.health, 40); assert.equal(weak.struct, 'g'); assert.ok(HI(c).gross >= 1.1e9 && HI(c).gross <= 1.3e9, 'gross ≈ ₪1.2B');
  const a = E.createGame({ worldId: 'w12', charId: 'activist', seed: 9 }); assert.equal(a.world.hd.divs.length, 4); assert.ok(a.world.hd.divs.every((d) => d.struct === 'r')); assert.equal(a.cash, 120e6); assert.equal(a.world.hd.divMin, 0.06); assert.equal(covMonths(a), 99);
  const t = E.createGame({ worldId: 'w12', charId: 'thirdGen', seed: 9 }); assert.equal(t.cash, 25e6); assert.ok(covMonths(t) < 12, 'coverage below 1 at the start: ' + covMonths(t)); assert.equal(t.world.hd.growF, 1.1);
});

await test('fixed draws on stream `world`: 16 at init, exactly 10 per payday + 4 per Z landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, Z: DRAWS.landing.Z }, { init: 16, month: 10, Z: 4 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w12', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w12', charId: ch, seed: 77 });
    assert.deepEqual(A.rng, B.rng); let zA = 0, zB = 0;
    for (let t = 0; t < 120 && !A.over && !B.over; t++) {
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      if (A.pending && A.pending.type === 'mech') zA++; if (B.pending && B.pending.type === 'mech') zB++;
      // A buys / checks whatever it can and pulls every lever; B passes everything — the streams stay aligned
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => ['buy', 'dd'].includes(x.id)) || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, b); for (const x of E.worldActions(A).filter((q) => q.enabled && !['sell', 'restructure'].includes(q.id))) E.worldAction(A, x.id, x.param);
      assert.deepEqual(A.rng, B.rng, `${ch} turn ${t}`);
    }
    assert.ok(zA > 0 && zA === zB);
  }
});

await test('division card: the shown range contains the sealed profit; dd narrows it and keeps the card open; buy = 40 % down + debt on the division (guaranteed / ring-fenced); pass spends nothing; no sealed value in the card', () => {
  let bought = 0, checked = 0;
  for (let i = 0; i < 40 && bought < 4; i++) {
    const st = E.createGame({ worldId: 'w12', charId: CH[i % 3], seed: 40 + i }); st.cash += 400e6; const ev = toZ(st); if (!ev) continue;
    const it = st.pending.item; const truth = it.sealed.q * it.est; assert.ok(truth >= it.lo - 1000 && truth <= it.hi + 1000, `range ${it.lo}–${it.hi} vs ${truth}`);
    assert.ok(!JSON.stringify(ev).includes('"sealed"') && !JSON.stringify(ev.data).includes(String(it.sealed.base)), 'no sealed value in the event');
    for (const o of ev.options) assert.ok(o.preview && 'cash' in o.preview, o.id + ' preview');
    const c0 = st.cash, n0 = st.assets.length; const w0 = it.hi - it.lo;
    if (i % 3 === 0) { E.choose(st, ev, 'pass'); assert.equal(st.cash, c0); assert.equal(st.assets.length, n0); continue; }
    const r = E.choose(st, ev, 'dd'); assert.ok(r.event && st.pending, 'the card stays open after dd'); checked++;
    assert.ok(it.hi - it.lo < w0, 'dd narrows'); assert.ok(truth >= it.lo - 1000 && truth <= it.hi + 1000, 'still contains the truth');
    const rf = i % 2 === 0; const ev2 = E.currentEvent(st); const cash1 = st.cash; const loans1 = st.loans; const down = Math.round(it.price * HD.down / 100000) * 100000;
    E.choose(st, ev2, rf ? 'buyRf' : 'buy'); const d = st.world.hd.divs[st.world.hd.divs.length - 1]; const a = asset(st, d);
    assert.equal(cash1 - st.cash + (st.loans - loans1), down); assert.equal(a.debt, it.price - down); assert.equal(d.struct, rf ? 'r' : 'g'); assert.equal(a.k, 'd_' + d.kind); bought++;
  }
  assert.ok(bought >= 3 && checked >= 3, `bought ${bought} checked ${checked}`);
});

await test('structure: ring-fenced pays +1.5 pp; the switch costs 0.5 % of the debt; a guaranteed division in deficit cannot be ring-fenced', () => {
  const st = E.createGame({ worldId: 'w12', charId: 'chair', seed: 5 }); const M = st.world.hd; const d = M.divs.find((x) => x.struct === 'g');
  assert.equal(rateOf(st, d), RATES[M.rating]); const D = asset(st, d).debt; const c0 = st.cash;
  assert.ok(E.worldAction(st, 'structure', 'd' + d.sid).ok); assert.equal(d.struct, 'r'); assert.equal(c0 - st.cash, Math.round(D * HD.structFee / 100000) * 100000); assert.equal(rateOf(st, d), RATES[M.rating] + HD.rfPrem);
  assert.ok(E.worldAction(st, 'structure', 'd' + d.sid).ok); assert.equal(d.struct, 'g'); d.miss = 1; assert.equal(E.worldAction(st, 'structure', 'd' + d.sid).ok, false);
});

await test('breach: two negative paydays → a guarantee call of 60 % paid by HQ; without the cash → a group default (debt + 25 % to HQ, rating −1, the noDefault clock restarts, cross-default)', () => {
  const st = E.createGame({ worldId: 'w12', charId: 'chair', seed: 11 }); const M = st.world.hd; const d = M.divs.find((x) => x.kind === 'ind'); d.base = 1000; d.est = 1000; d.h = [];
  st.cash = 500e6; const D0 = asset(st, d).debt; payday(st); payday(st); payday(st);
  assert.ok(M.calls >= 1, 'a call was paid'); assert.ok(asset(st, d).debt < D0 * 0.5, 'the call cut the debt'); assert.equal(M.defaults, 0);
  const t = E.createGame({ worldId: 'w12', charId: 'chair', seed: 12 }); const T = t.world.hd; const e = T.divs.find((x) => x.kind === 'ind'); e.base = 1000; e.est = 1000; e.h = [];
  const r0 = T.rating; let g = 0; while (!t.over && T.defaults === 0 && g++ < 8) { t.cash = 0; payday(t); }
  assert.equal(T.defaults, 1, 'defaulted'); assert.equal(T.rating, r0 + 1); assert.ok(T.hqDebt > 0 && T.penalties > 0 && Math.abs(T.penalties - Math.round(T.hqDebt / 1.25 * 0.25 / 100000) * 100000) <= 4e6, 'debt + 25 % penalty at HQ');
  assert.equal(asset(t, e).debt, 0); assert.ok(T.lastDef > 0 && T.lastDef <= t.stats.paydays); assert.equal(HI(t).sinceDefault, t.stats.paydays - T.lastDef);
  assert.equal(W.mech[0].goalValue(t, 'lastEvent:default'), T.lastDef);
  // cross-default: a second guaranteed division already in deficit breaches at once when another defaults
  const u = E.createGame({ worldId: 'w12', charId: 'chair', seed: 14 }); const U = u.world.hd; const [x, y] = U.divs.filter((q) => q.struct === 'g'); x.base = 1000; x.est = 1000; x.h = []; x.miss = 1; u.cash = 0;
  y.miss = 1; const yd = asset(u, y).debt; payday(u); assert.ok(U.defaults >= 2, 'the healthy-this-month one defaulted too: ' + U.defaults); assert.equal(asset(u, y).debt, 0); assert.ok(yd > 0);
});

await test('ring-fenced: support off → after 2 negative paydays the lenders take the division; it never counts below zero; no group default, no rating change', () => {
  const st = E.createGame({ worldId: 'w12', charId: 'activist', seed: 13 }); const M = st.world.hd; const d = M.divs[0]; const r0 = M.rating; const n0 = M.divs.length;
  E.worldAction(st, 'support', 'd' + d.sid); assert.equal(d.sup, false); d.base = 1000; d.est = 1000; d.h = [];
  const nw = E.metrics(st).netWorth; assert.ok(nw > 0); assert.ok(E.metrics(st).netWorth >= st.cash - st.loans, 'floored at 0');
  let g = 0; while (!st.over && M.lost === 0 && g++ < 6) payday(st);
  assert.equal(M.lost, 1); assert.equal(M.divs.length, n0 - 1); assert.equal(M.defaults, 0); assert.equal(M.rating, r0); assert.ok(!st.assets.some((a) => a.id === d.sid));
});

await test('coverage = HQ cash ÷ a month of group service (guaranteed divisions + HQ debt + bonds); bonds add cash and service; the goal part reads it', () => {
  const st = E.createGame({ worldId: 'w12', charId: 'thirdGen', seed: 21 }); const s0 = groupService(st); assert.ok(s0 > 0);
  assert.equal(covMonths(st), Math.round(st.cash / s0 * 100) / 100);
  assert.ok(E.worldAction(st, 'bond').ok); assert.equal(st.world.hd.bonds.length, 1); assert.ok(groupService(st) > s0); assert.ok(covMonths(st) > 12 * 1.0, 'a bond lifts coverage above 1: ' + covMonths(st));
  assert.equal(W.mech[0].goalValue(st, 'liqMonths'), covMonths(st));
  assert.equal(E.metrics(st).worldIndicators.holding.coverage, Math.round(covMonths(st) / 12 * 100) / 100);
});

await test('annual: at payday 12 the board gets the dividend (min 3 %, the activist 6 %, high +3 pp); none → board pressure (+1 pp next year); the rating review', () => {
  const run = (ch, pol) => { const st = E.createGame({ worldId: 'w12', charId: ch, seed: 31 }); if (pol) E.worldAction(st, 'dividend', pol); let g = 0; while (!st.over && st.stats.paydays < 12 && g++ < 200) { st.cash = Math.max(st.cash, 400e6); payday(st); } return st; };
  const a = run('chair'), b = run('chair', 'high'), c = run('chair', 'skip'), v = run('activist');
  assert.ok(a.world.hd.divPaid > 0 && b.world.hd.divPaid > a.world.hd.divPaid * 1.6, `min ${a.world.hd.divPaid} high ${b.world.hd.divPaid}`);
  assert.equal(c.world.hd.divPaid, 0); assert.equal(c.world.hd.pressure, 1); assert.ok(v.world.hd.divPaid > 0);
  assert.equal(E.worldAction(a, 'dividend', 'nope').ok, false);
});

await test('restructuring: only in distress, once; 40 % off the HQ debt; it restarts the noDefault clock and caps the stars at ★', () => {
  const st = E.createGame({ worldId: 'w12', charId: 'chair', seed: 41 }); const M = st.world.hd;
  assert.equal(E.worldAction(st, 'restructure').ok, false, 'no HQ debt');
  M.hqDebt = 100e6; st.cash = -1; assert.ok(E.worldAction(st, 'restructure').ok); assert.equal(M.hqDebt, 60e6); assert.ok(M.restruct); assert.equal(E.worldAction(st, 'restructure').ok, false, 'once');
  const gates = W.mech[0].starGates(st); assert.deepEqual(gates.map((g) => [g.id, g.stars, g.ok]), [['restructure', 2, false]]);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w12', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w12', charId: 'chair', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['sell', 'd999'], ['structure', 'x'], ['dividend', 'all'], ['repayHq', null], ['repayBond', null], ['restructure', null]]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'insure').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1], ≤ 8 divisions, health in [0, 100], rating in range', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w12', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt) && a.debt >= 0, a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const wi = m.worldIndicators; assert.ok(wi.holding.divs <= SLOTS && wi.panel.rows.length === wi.holding.divs);
      for (const d of s.world.hd.divs) assert.ok(d.health >= 0 && d.health <= 100 && Number.isFinite(grossOf(s, d))); assert.ok(s.world.hd.rating >= 0 && s.world.hd.rating < RATINGS.length);
    } });
  }
});

await test('rooms: the public view carries no sealed value (true division profit, init draws, the card\'s sealed quality)', () => {
  for (const ch of CH) {
    const st = play({ worldId: 'w12', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 });
    const pv = E.publicView(st); const js = JSON.stringify(pv); for (const k of ['"inits"', '"sealed"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k);
    for (const d of st.world.hd.divs) assert.ok(!js.includes(`"base":${d.base}`), ch + ' a division\'s true profit');
  }
});

await test('H-fict + lint: fictional divisions (the denylist is checked), exact arithmetic in the module; the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.checkHolding(), []); assert.deepEqual(V.lintModules(), []);
  assert.ok(V.checkHolding(new Set(['אלמוג'])).some((x) => /סחר ימי אלמוג/.test(x)), 'a denylisted word is caught');
  assert.equal(TEMPLATES.length, 16); assert.ok(TEMPLATES.every((t) => KINDS[t.kind])); assert.ok(Object.keys(KINDS).every((k) => TEMPLATES.filter((t) => t.kind === k).length === 2));
  const r = V.validate(); assert.deepEqual(r.errors, []);
});

await test('verifier: core bundle + the w12 pack only (the world + its module); a w12 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE, 'core ' + all.core.text.length);
  assert.ok(all.packs.w12 && all.packs.w12.text.length <= MAX_PACK && all.packs.w12.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w12 && all.packs.w12.text.length));
  assert.deepEqual(Object.keys(all.packs.w12.files).sort(), ['worlds/mech/holding.js', 'worlds/w12.js']);
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(all.packs.w12.hash), 'the w12 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w12.text); assert.equal(EE.getWorld('w12').id, 'w12');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 10 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w12', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w12', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w12 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, 7); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w12.text.length} chars · core ${all.core.text.length} chars · max w12 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
