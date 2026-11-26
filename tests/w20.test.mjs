#!/usr/bin/env node
// w20 רחוב הקרנות (engine side): lazy registration, the rule adapter `funds` (fixed draws on stream `world`: 26 at init — 2 per company, the
// regime, the anchor client's month —, 16 per payday — the regime, the market noise, one draw per company, the client flows, an event target —,
// 3 per 'W' landing), the index = the 12 companies equally weighted (hugging returns exactly the index), the book (5 % steps, no margin:
// longs ≤ 100 %, shorts ≤ 50 %, 30 % per company), fees (management + 20 % of the return above the index past the high-water mark), client
// flows and the one-month redemption notice paid by selling into the market, the gate (★★★ blocked), squeezes and the crash-time short ban,
// the index product, own money in / out, the goal (personal NW ₪800M + money under management ₪4B, hold 3), the W mandate (take / lock /
// pass is safe), Z actions replayed and verified, saves, fuzz, the public view, the pack. Run: node tests/w20.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, N, KEYS, FL, REG, aum, fundAum, longSum, shortSum, gross, rel12, borrowFee, targetBook } from '../js/worlds/adapters/funds.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w20 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 10, 1 of w18/w19); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w20'), false); assert.throws(() => E.getWorld('w20'), /world_not_loaded/); assert.equal(E.LESSONS.some((l) => l.id === 'other_money'), false);
  const w = await E.ensureWorld('w20'); assert.equal(w.mechanic, 'funds'); assert.equal(w.minRules, 7); assert.deepEqual(w.mech[0].uses, ['market', 'portfolio']);
  for (const id of ['other_money', 'short_squeeze']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w20'); assert.equal(m.status, 'lazy'); assert.equal(m.tier, 10); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.equal(m.maxMonths, w.maxMonths); assert.deepEqual(m.stars, w.stars);
  const base = { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w14: 1 }; assert.equal(isUnlockedBy('w20', { ...base, w19: 1 }), true); assert.equal(isUnlockedBy('w20', { ...base, w17: 1 }), false);
});

const W = E.getWorld('w20'); const CH = W.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const untilPay = (st, n) => { let g = 0; const p0 = st.stats.paydays; while (!st.over && st.stats.paydays < p0 + n && g++ < 3000) step(st); };
const play = (cfg, r, { zRate = 0.25, maxTurns = 300, onTurn } = {}) => {
  const st = E.createGame(cfg);
  for (let t = 0; t < maxTurns && !st.over; t++) {
    if (r() < zRate) { const acts = E.worldActions(st).filter((a) => a.enabled); for (let j = 0; j < 3 && acts.length; j++) { const a = acts[Math.floor(r() * acts.length)]; E.worldAction(st, a.id, a.param); } }
    if (st.over) break;
    if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 20 && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } if (st.over) break; }
    E.rollDice(st); let ev = E.landing(st); let k = 0;
    while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = k > 3 ? (en.find((x) => ['ok', 'done', 'pass', 'decline'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; k++; }
    if (onTurn) onTurn(st, t);
  }
  return st;
};
const toW = (st) => { for (let g = 0; g < 900 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const stake = (st) => st.assets.find((a) => a.op && a.op.ck === 'funds');
const F = (st) => st.world.funds;

await test('start: rules 7; the goal; the inherited book hugs the index; personal NW = cash + the stake; 12 fictional companies from the market pool', () => {
  assert.equal(E.createGame({ worldId: 'w20', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => [g.type, g.key || null, g.target]), [['nw', null, 800000000], ['modValue', 'aum', 4000000000]]); assert.equal(W.goal.hold, 3);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w20', charId: ch, seed: 9 }); const S = F(st); const m = E.metrics(st);
    assert.equal(S.cos.length, N); assert.deepEqual(S.cos.map((c) => c.k), [...KEYS]); assert.ok(S.cos.every((c) => c.w === 1 / N)); assert.equal(shortSum(st), 0);
    assert.equal(m.worldIndicators.panel.id, 'funds'); assert.equal(stake(st).value, Math.round(S.mine / 1000) * 1000); assert.equal(m.netWorth, st.cash + stake(st).value);
    assert.equal(aum(st), fundAum(st)); assert.ok(aum(st) >= 0.8e9 && aum(st) <= 2.1e9, ch + ' ' + aum(st)); }
  const q = F(E.createGame({ worldId: 'w20', charId: 'quantAnalyst', seed: 9 })); const s = F(E.createGame({ worldId: 'w20', charId: 'starPicker', seed: 9 }));
  assert.ok(q.sigma < s.sigma, 'the quant\'s research is tighter'); assert.equal(s.react, 2); assert.ok(F(E.createGame({ worldId: 'w20', charId: 'endowmentPm', seed: 9 })).anchor.frac === 0.4);
});

await test('fixed draws on stream `world`: 26 at init, exactly 16 per payday + 3 per W landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, W: DRAWS.landing.W }, { init: 26, month: 16, W: 3 });
  for (const ch of CH) { const A = E.createGame({ worldId: 'w20', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w20', charId: ch, seed: 77 });
    for (let t = 0; t < 110 && !A.over && !B.over; t++) { for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 5)) E.worldAction(A, a.id, a.param);
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'take') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (b && !B.over && k++ < 12) { const en = b.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; b = E.choose(B, b, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break; assert.equal(A.rng.world, B.rng.world, `${ch} turn ${t}`); } }
});

await test('the index and fees: a hugging book returns exactly the index (no performance fee, only management); an active book above the index pays 20 % of the excess past the high-water mark', () => {
  const st = E.createGame({ worldId: 'w20', charId: 'starPicker', seed: 11 }); const S = F(st); S.react = 0; S.anchor = null; let perf = 0, mg = 0; // no client flows: nothing is sold to pay redemptions
  for (let p = 0; p < 10; p++) { untilPay(st, 1); if (!S.last) continue; assert.ok(Math.abs(S.rel - 1) < 1e-9, 'hug rel ' + S.rel); perf += S.perfM; mg += S.feeM; }
  assert.equal(perf, 0); assert.ok(mg > 0); assert.ok(Math.abs(rel12(st)) < 0.002, 'rel12 ' + rel12(st));
  let paid = 0; for (let seed = 1; seed < 8 && !paid; seed++) { const x = E.createGame({ worldId: 'w20', charId: 'quantAnalyst', seed }); const X = F(x); const t = targetBook(x);
    for (const c of X.cos) c.w = 0; X.cos.forEach((c, i) => { c.w = t[i]; }); for (let p = 0; p < 12 && !paid; p++) { const h0 = X.hwm; untilPay(x, 1); if (X.perfM > 0) { assert.ok(X.hwm > h0); paid = X.perfM; } } }
  assert.ok(paid > 0, 'an active book earned a performance fee');
});

await test('the book: 5 % steps on the grid, 30 % per company, longs ≤ 100 % (no margin), shorts ≤ 50 %; borrow fee by crowding; a crash bans shorts (forced cover); hug / derisk / close', () => {
  const st = E.createGame({ worldId: 'w20', charId: 'quantAnalyst', seed: 5 }); const S = F(st); const k0 = KEYS[0], k1 = KEYS[1]; S.cos[0].w = 0.05;
  for (const c of S.cos.slice(1)) c.w = 0;
  assert.ok(E.worldAction(st, 'buy', k0).ok); assert.equal(S.cos[0].w, 0.1); assert.ok(E.worldAction(st, 'sell', k0).ok); assert.equal(S.cos[0].w, 0.05); assert.ok(E.worldAction(st, 'sell', k0).ok); assert.equal(S.cos[0].w, 0); assert.ok(E.worldAction(st, 'sell', k0).ok); assert.equal(S.cos[0].w, -0.05);
  for (let i = 0; i < 10; i++) E.worldAction(st, 'sell', k0); assert.equal(S.cos[0].w, -FL.coCap);
  for (let i = 0; i < 10; i++) E.worldAction(st, 'buy', k1); assert.equal(S.cos[1].w, FL.coCap); assert.ok(longSum(st) <= FL.longCap + 1e-9);
  for (const k of KEYS.slice(2)) for (let i = 0; i < 6; i++) E.worldAction(st, 'buy', k); assert.ok(longSum(st) <= FL.longCap + 1e-9 && longSum(st) >= 0.95, 'long ' + longSum(st));
  for (const k of KEYS.slice(2, 6)) { E.worldAction(st, 'close', k); for (let i = 0; i < 6; i++) E.worldAction(st, 'sell', k); } assert.ok(shortSum(st) <= FL.shortCap + 1e-9 && shortSum(st) >= 0.45, 'short ' + shortSum(st));
  assert.ok(borrowFee({ crowd: 0.9 }) > borrowFee({ crowd: 0.1 }));
  assert.ok(E.worldAction(st, 'derisk', null).ok); assert.ok(gross(st) < 1); assert.ok(E.worldAction(st, 'hug', null).ok); assert.equal(shortSum(st), 0); assert.equal(E.worldAction(st, 'hug', null).ok, false);
  S.regime = 'crash'; for (const k of KEYS) E.worldAction(st, 'close', k); assert.ok(E.worldAction(st, 'buy', k0).ok); assert.equal(E.worldAction(st, 'sell', k0).ok, true, 'selling a long is fine'); assert.equal(E.worldAction(st, 'sell', k0).ok, false, 'no new shorts in a crash');
  const b = E.createGame({ worldId: 'w20', charId: 'starPicker', seed: 6 }); const B = F(b); E.worldAction(b, 'sell', k0); E.worldAction(b, 'sell', k0); E.worldAction(b, 'sell', k0); assert.ok(B.cos[0].w < 0); B.regime = 'crash'; B.regime = 'crash';
  untilPay(b, 1); if (B.regime === 'crash') { assert.ok(B.cos.every((c) => c.w >= 0)); assert.ok(B.bans >= 1); }
});

await test('clients: outflows are a notice paid next payday by selling (a liquidity cost × gross); the gate caps them at 10 % for three paydays (reputation −, ★★★ blocked); the anchor client leaves once', () => {
  const st = E.createGame({ worldId: 'w20', charId: 'starPicker', seed: 8 }); const S = F(st); assert.equal(E.worldAction(st, 'gate', null).ok, false, 'nothing to gate');
  S.pend = Math.round(S.ext * 0.3); const ext0 = S.ext; assert.ok(E.worldAction(st, 'gate', null).ok); assert.equal(S.gates, 1); assert.ok(S.rep < 1.15); untilPay(st, 1);
  assert.ok(S.last.paid <= Math.round(FL.gate * ext0 * 1.2) + 1, 'gated ' + S.last.paid); assert.ok(S.pend > 0, 'the rest waits');
  const sg = E.metrics(st); void sg; assert.deepEqual(W.mech[0].starGates(st).map((g) => [g.id, g.stars, g.ok]), [['noGate', 3, false]]);
  const x = E.createGame({ worldId: 'w20', charId: 'starPicker', seed: 8 }); const X = F(x); X.pend = Math.round(X.ext * 0.3); const tot0 = X.ext + X.mine; const want = X.pend; untilPay(x, 1);
  assert.ok(X.last.paid >= Math.min(want, 1) && X.last.paid <= want, 'paid ' + X.last.paid); assert.ok(X.ext + X.mine < tot0 - X.last.paid * 0.5);
  const e = E.createGame({ worldId: 'w20', charId: 'endowmentPm', seed: 8 }); const A = F(e).anchor; assert.ok(A.m >= 6 && A.m <= 54); untilPay(e, A.m + 1); assert.equal(F(e).anchor.done, true);
});

await test('side actions: the index product (once, ₪5M, stable money under management with a low fee), own money in / out of the fund', () => {
  const st = E.createGame({ worldId: 'w20', charId: 'starPicker', seed: 12 }); const S = F(st); const c0 = st.cash; const a0 = aum(st);
  assert.ok(E.worldAction(st, 'launch', null).ok); assert.equal(st.cash, c0 - FL.idxCost); assert.ok(S.idxP.aum > 0 && aum(st) > a0); assert.equal(E.worldAction(st, 'launch', null).ok, false);
  const m0 = S.mine; st.cash += FL.seed; assert.ok(E.worldAction(st, 'seed', null).ok); assert.equal(S.mine, m0 + FL.seed); assert.equal(stake(st).value, Math.round(S.mine / 1000) * 1000);
  assert.ok(E.worldAction(st, 'draw', null).ok); assert.equal(S.mine, m0);
});

await test('W card: take (fee share, hot money may leave in a bad quarter), lock (a deeper fee cut, no exit for 12 months), pass (the safe option) changes nothing', () => {
  const st = E.createGame({ worldId: 'w20', charId: 'endowmentPm', seed: 21 }); const ev = toW(st); assert.ok(ev); assert.deepEqual(ev.options.map((o) => o.id), ['take', 'lock', 'pass']);
  const it = st.pending.item; const e0 = F(st).ext; E.choose(st, E.currentEvent(st), 'lock'); assert.equal(F(st).ext, e0 + it.amt); assert.ok(F(st).feeK < 1); assert.equal(F(st).hotLock, st.month + 12);
  const f = E.createGame({ worldId: 'w20', charId: 'quantAnalyst', seed: 22 }); toW(f); const snap = JSON.stringify(f.world.funds); const cx = f.cash; E.choose(f, E.currentEvent(f), 'pass'); assert.equal(JSON.stringify(f.world.funds), snap); assert.equal(f.cash, cx);
});

await test('Z actions logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) { const st = play({ worldId: 'w20', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i); assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i); }
  const st = E.createGame({ worldId: 'w20', charId: 'quantAnalyst', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['buy', 'nope'], ['sell', 'x'], ['close', 'x'], ['gate', null], ['draw', null]]) { if (a === 'draw') F(st).mine = 0; assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p); }
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'sell', KEYS[3]).ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the stake asset = your money in the fund, weights within limits, goal progress in [0, 1]', () => {
  for (let i = 0; i < 9; i++) play({ worldId: 'w20', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.4, maxTurns: 160, onTurn: (s) => { if (s.over) return; const m = E.metrics(s);
    for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
    assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); assert.equal(stake(s).value, Math.round(Math.max(0, F(s).mine) / 1000) * 1000); assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const S = F(s);
    for (const k of ['ext', 'mine', 'pend']) assert.ok(Number.isInteger(S[k]) && S[k] >= 0, k + ' = ' + S[k]); assert.ok(longSum(s) <= FL.longCap + 1e-9 && shortSum(s) <= FL.shortCap + 1e-9); assert.ok(S.cos.every((c) => Math.abs(c.w) <= FL.coCap + 1e-9 && Number.isFinite(c.px)));
    assert.ok(Object.keys(REG).includes(S.regime)); } });
});

await test('rooms: the public view carries no sealed value (the alphas, the anchor\'s month, a mandate\'s patience, the landing draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w20', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toW(st); const pv = E.publicView(st); const js = JSON.stringify(pv);
    const mod = JSON.stringify(pv.metrics.worldIndicators) + JSON.stringify(pv.event || null); // the module's own public surface (the engine's focus / life records carry their own "m" keys)
    for (const k of ['"wr"', '"hot"', '"sig"']) assert.ok(!js.includes(k), ch + ' ' + k); for (const k of ['"a":', '"h":', '"m":', '"anchorMonth"']) assert.ok(!mod.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the adapter (≤ 350 lines, uses:); the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w20 pack (the world, the funds adapter, the companies data); a w20 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w20; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w20.js', 'worlds/adapters/funds.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w20 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w20').id, 'w20');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w20', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w20', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w20 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
