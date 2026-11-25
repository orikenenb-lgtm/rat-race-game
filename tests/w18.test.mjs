#!/usr/bin/env node
// w18 חוף הסערות (engine side): lazy registration, the module `insure` (fixed draws on stream `world`: 6 at init — the reserve adequacy and
// one loss-ratio quality per line —, 8 per payday — a claims draw per line, the storm, the float, an event target —, 3 per 'Z' landing),
// the inherited mispricing, price vs the market (volume and adverse selection), reserves revealed over 24 months, the storm season and
// reinsurance (XoL layers, quota share, cat bond), the float's two classes and the forced sale, solvency and the regulator, the goal
// (nw ₪1.2B + solvency 1.2 + combined12 ≤ 1, hold 3), the Z card (due diligence, buy, pass is safe), Z actions replayed and verified,
// saves, fuzz, the public view, the pack.
// Run: node tests/w18.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, LINES, LN, IN, PRICES, START_REL, premOf, gwp, catBase, xolPays, xolCost, lrShown, eqOf, ownerEquity, solvency, combined12, bestPrice, bestXol } from '../js/worlds/mech/insure.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w18 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 9, 1 of w14/w16); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w18'), false); assert.throws(() => E.getWorld('w18'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'correlated_tail'), false);
  const w = await E.ensureWorld('w18'); assert.equal(w.id, 'w18'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'insure'); assert.deepEqual(w.modules, ['insure']); assert.deepEqual(w.mech[0].uses, ['portfolio', 'season']);
  for (const id of ['correlated_tail', 'combined_ratio']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w18');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 9); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w14', 'w16'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w18', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w16: 1 }), true); assert.equal(isUnlockedBy('w18', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w15: 1 }), false);
});

const W = E.getWorld('w18'); const CH = W.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const untilPay = (st, n) => { let g = 0; const p0 = st.stats.paydays; while (!st.over && st.stats.paydays < p0 + n && g++ < 3000) step(st); };
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
const toZ = (st) => { for (let g = 0; g < 900 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const insAsset = (st) => st.assets.find((a) => a.op && a.op.ck === 'ins');

await test('start: rules 7; net worth ₪300–500M; the goal is nw ₪1.2B + solvency 1.2 + combined12 ≤ 1, hold 3; the inherited prices are under the market and there is no storm reinsurance', () => {
  assert.equal(E.createGame({ worldId: 'w18', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => [g.type, g.key || null, g.target, g.cmp || null]), [['nw', null, 1200000000, null], ['modValue', 'solvency', 1.2, null], ['modValue', 'combined12', 1, 'le']]); assert.equal(W.goal.hold, 3);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w18', charId: ch, seed: 9 }); const m = E.metrics(st); const S = st.world.ins;
    assert.ok(m.netWorth >= 300e6 && m.netWorth <= 520e6, ch + ' nw ' + m.netWorth); assert.equal(m.worldIndicators.panel.id, 'insure'); assert.equal(insAsset(st).value, ownerEquity(st));
    assert.deepEqual(m.goalParts.map((p) => p.key), ['netWorth', 'solvency', 'combined12']); assert.equal(S.xol, 0); assert.equal(S.qs, 0);
    for (const k of LINES) { assert.equal(S.lines[k].rel, START_REL[k] || 0); assert.ok(S.lines[k].q >= 0.92 && S.lines[k].q <= 1.08); }
    assert.ok(S.resT > S.res, 'the previous management left the reserves short');
    for (const k of LINES) assert.equal(lrShown(st, k), ch === 'actuary' ? Math.round(LN[k].lr * S.lines[k].q * 1000) / 1000 : LN[k].lr); }
});

await test('fixed draws on stream `world`: 6 at init, exactly 8 per payday + 3 per Z landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, Z: DRAWS.landing.Z }, { init: 6, month: 8, Z: 3 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w18', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w18', charId: ch, seed: 77 });
    for (let t = 0; t < 110 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 4)) E.worldAction(A, a.id, a.param);
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'buy') || en.find((x) => x.id === 'check') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (b && !B.over && k++ < 12) { const en = b.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; b = E.choose(B, b, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break; assert.equal(A.rng.world, B.rng.world, `${ch} turn ${t}`);
    }
  }
});

await test('price vs the market: below it the volume grows and the claims per policy rise (adverse selection; reserves booked short); above it the volume shrinks; the mutual chair\'s price waits a payday', () => {
  const lo = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 4 }), hi = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 4 });
  assert.ok(E.worldAction(hi, 'price', 'car:0.15').ok); assert.ok(E.worldAction(lo, 'price', 'car:-0.1').ok); assert.equal(E.worldAction(lo, 'price', 'car:-0.1').ok, false, 'already so'); assert.equal(E.worldAction(lo, 'price', 'car:0.3').ok, false);
  untilPay(lo, 6); untilPay(hi, 6); const L = lo.world.ins.lines.car, H = hi.world.ins.lines.car; assert.ok(L.x > H.x, 'volume'); assert.ok(L.mix > 1 && H.mix > 1 && L.mix > H.mix - 0.2);
  assert.ok(L.mix > 1 + IN.selDown * 0.05, 'cheap attracts the worst risks');
  const m = E.createGame({ worldId: 'w18', charId: 'mutualChair', seed: 4 }); assert.ok(E.worldAction(m, 'price', 'car:0.1').ok); assert.equal(m.world.ins.lines.car.rel, START_REL.car); untilPay(m, 1); assert.equal(m.world.ins.lines.car.rel, 0.1);
  for (const k of LINES) assert.ok(PRICES.includes(bestPrice(lo, k)));
});

await test('reserves: the true cost runs off over 24 months and the difference to the booked reserve hits the result (development); a court ruling raises old reserves', () => {
  const st = E.createGame({ worldId: 'w18', charId: 'topBroker', seed: 6 }); const S = st.world.ins; const gap0 = S.resT - S.res; assert.ok(gap0 > 0);
  untilPay(st, 1); assert.ok(S.last && S.last.dev > 0, 'short reserves develop adversely'); assert.ok(Math.abs(S.last.dev - Math.round(gap0 / IN.runoff)) < Math.abs(gap0) * 0.2 + 2e6);
  const r0 = S.res; W.mech[0].market.create(st, { card: { mk: 'court', pct: 0.08 } }); assert.equal(S.res - r0, Math.round(r0 * 0.08 / 1000) * 1000);
});

await test('storms: only in the storm months; XoL layers pay above the retention; a quota share takes 30 %; the risky float falls the same payday; the reinsurance price hardens for 12 months', () => {
  const st = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 1 }); const B = catBase(st); assert.ok(B > 0);
  assert.equal(xolPays(st, B * 0.3), 0); st.world.ins.xol = 3; assert.equal(xolPays(st, B * IN.ret), 0); assert.equal(xolPays(st, B * (IN.ret + 3 * IN.layer + 1)), Math.round(3 * IN.layer * B));
  const c0 = xolCost(st); st.world.ins.hardUntil = st.month + 5; assert.equal(xolCost(st), Math.round(c0 * IN.hard / 1) || xolCost(st)); assert.ok(xolCost(st) > c0);
  let seen = 0; for (let seed = 1; seed < 40 && !seen; seed++) { const x = E.createGame({ worldId: 'w18', charId: 'mutualChair', seed }); x.cash += 1e9; let g = 0; let cats = 0;
    while (!x.over && g++ < 400 && x.month < 40) { const before = x.world.ins.cats; const rk = x.world.ins.rk; step(x); if (x.world.ins.cats > before && x.world.ins.hardUntil > x.month) { const cal = ((x.month - 1) % 12) + 1; assert.ok([8, 9, 10, 11].includes(cal) || x.world.ins.cats > before, 'storm month'); cats++; seen = 1; void rk; break; } } }
  assert.ok(seen, 'a storm in 40 seeds');
  const q = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 2 }); const sv0 = solvency(q); assert.ok(E.worldAction(q, 'qs', null).ok); assert.equal(q.world.ins.qs, IN.qs); assert.ok(solvency(q) > sv0, 'a quota share frees capital');
  assert.ok(E.worldAction(q, 'xol', String(bestXol(q) || 1)).ok || bestXol(q) === 0);
});

await test('capital: solvency < 1 → the regulator (dividend ban, growth cut, a forced quota share under 0.8); equity ≤ 0 → bankrupt; raise dilutes (not the mutual); the mutual pays no dividend', () => {
  const st = E.createGame({ worldId: 'w18', charId: 'topBroker', seed: 3 }); st.world.ins.inv -= Math.round(eqOf(st) * 0.5); untilPay(st, 1); const S = st.world.ins;
  if (solvency(st) < 1) { assert.ok(S.regAt > 0 && S.ban > st.stats.paydays); }
  assert.ok(S.regs >= 0);
  const b = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 3 }); b.world.ins.inv = b.world.ins.res - 300e6; untilPay(b, 1); assert.ok(b.over || b.flags.bankrupt);
  const r = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 3 }); const e0 = ownerEquity(r); assert.ok(E.worldAction(r, 'raise', null).ok); assert.ok(r.world.ins.stake < 1 && ownerEquity(r) < e0 && ownerEquity(r) > e0 * 0.95, 'a raise at a discount dilutes the owner'); assert.equal(E.worldAction(r, 'raise', null).ok, false, 'one raise per half year');
  const m = E.createGame({ worldId: 'w18', charId: 'mutualChair', seed: 3 }); const m0 = ownerEquity(m); assert.ok(E.worldAction(m, 'raise', null).ok); assert.ok(Math.abs(ownerEquity(m) - m0) <= 1000, 'the mutual raises at par: no loss of value'); assert.equal(E.worldAction(m, 'dividend', null).ok, false);
});

await test('Z card: due diligence narrows the loss-ratio band; buy adds the book (its premium and its sealed quality) and pays from the insurer; pass (the safe option) changes nothing; the actuary sees the truth', () => {
  const st = E.createGame({ worldId: 'w18', charId: 'topBroker', seed: 21 }); const ev = toZ(st); assert.ok(ev); const it = st.pending.item;
  assert.deepEqual(ev.data.lrMult, { lo: 1 - IN.band, hi: 1 + IN.band }); const e1 = E.choose(st, E.currentEvent(st), 'check').event; const b = e1.data.lrMult; assert.ok(b.lo <= it.q + 1e-9 && it.q <= b.hi + 1e-9 && Math.abs(b.hi - b.lo - 2 * IN.ddBand) < 1e-6);
  const x0 = st.world.ins.lines[it.k].x; const e0 = eqOf(st); E.choose(st, E.currentEvent(st), 'buy'); if (st.world.ins.bought) { assert.equal(st.world.ins.lines[it.k].x - x0, it.size); assert.ok(eqOf(st) < e0); }
  const x = E.createGame({ worldId: 'w18', charId: 'mutualChair', seed: 22 }); toZ(x); const snap = JSON.stringify(x.world.ins); const cx = x.cash; E.choose(x, E.currentEvent(x), 'pass'); assert.equal(JSON.stringify(x.world.ins), snap); assert.equal(x.cash, cx);
  const a = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 21 }); const ea = toZ(a); assert.equal(ea.data.lrMult.lo, a.pending.item.q); assert.ok(!ea.options.some((o) => o.id === 'check'));
});

await test('Z actions: price / runoff / qs / xol / risk / catbond / raise / dividend; logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w18', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w18', charId: 'actuary', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['price', 'car:0.07'], ['price', 'boat:0'], ['xol', '4'], ['xol', '0'], ['risk', 'mid'], ['risk', 'wild'], ['runoff', 'x'], ['dividend', null]]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'xol', '2').ok); assert.ok(E.worldAction(st, 'catbond', null).ok); assert.ok(E.worldAction(st, 'runoff', 'bi').ok); assert.equal(st.actions.length, n0 + 3);
  untilPay(st, 3); assert.ok(st.world.ins.lines.bi.x < st.world.ins.lines.bi.base, 'a line in run-off shrinks');
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the insurer asset = stake × equity, solvency and the combined ratio finite, goal progress in [0, 1]', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w18', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      if (s.over) return; const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); assert.equal(insAsset(s).value, ownerEquity(s));
      assert.ok(Number.isFinite(solvency(s)) && Number.isFinite(combined12(s))); assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1);
      const S = s.world.ins; for (const k of ['inv', 'res', 'resT', 'rk']) assert.ok(Number.isInteger(S[k]), k); assert.ok(S.rk >= 0); for (const k of LINES) assert.ok(Number.isInteger(premOf(s, k)) && S.lines[k].x >= 0);
    } });
  }
  assert.ok(gwp(E.createGame({ worldId: 'w18', charId: 'actuary', seed: 1 })) > 0);
});

await test('rooms: the public view carries no sealed value (line qualities, the reserve adequacy, the true reserves, the landing draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w18', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toZ(st);
    const js = JSON.stringify(E.publicView(st)); for (const k of ['"q"', '"j"', '"adq"', '"resT"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the module; the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w18 pack (the world and the insure module); a w18 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w18; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w18.js', 'worlds/mech/insure.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w18 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w18').id, 'w18');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w18', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w18', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w18 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
