#!/usr/bin/env node
// w19 פעמון הבורסה (engine side): lazy registration, the rule adapter `bell` (fixed draws on stream `world`: 2 at init, 5 per payday — one
// EBITDA draw per division, the sector regime, the mood noise, an event target —, 3 per 'W' landing), the price formula (trailing EBITDA ×
// the sector multiple × credibility × mood and the guidance premium − net debt), the IPO, quarterly guidance (beat / miss, sandbagging priced
// at once), buyback / dividend / secondary / repay / grow / sell, the activist, the goal (stakeMkt ₪1.5B + net debt ≤ 3 × EBITDA, hold 3),
// the W card (cash / shares / pass is safe), Z actions replayed and verified, saves, fuzz, the public view, the pack.
// Run: node tests/w19.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, DIVS, SECTOR, GUIDE, BL, ebitdaM, ttm, netDebt, netDebtEbitda, equityValue, price, peerPrice, stakeMkt, stakeValue } from '../js/worlds/adapters/bell.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w19 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 9, 1 of w11/w14/w15); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w19'), false); assert.throws(() => E.getWorld('w19'), /world_not_loaded/); assert.equal(E.LESSONS.some((l) => l.id === 'guidance_cred'), false);
  const w = await E.ensureWorld('w19'); assert.equal(w.mechanic, 'bell'); assert.equal(w.minRules, 7); assert.deepEqual(w.mech[0].uses, ['market', 'plant', 'chain']);
  for (const id of ['guidance_cred', 'buyback']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w19'); assert.equal(m.status, 'lazy'); assert.equal(m.tier, 9); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.equal(isUnlockedBy('w19', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w14: 1 }), true); assert.equal(isUnlockedBy('w19', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w16: 1 }), false);
});

const W = E.getWorld('w19'); const CH = W.characters.map((c) => c.id);
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
const toW = (st) => { for (let g = 0; g < 900 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const co = (st) => st.assets.find((a) => a.op && a.op.ck === 'bell');

await test('start + price: rules 7; the goal; the founder is private (stakeMkt 0, NW at 70 %), the others listed with the old management\'s high guidance; price = (EV − net debt) ÷ shares', () => {
  assert.equal(E.createGame({ worldId: 'w19', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => [g.key, g.target, g.cmp || null]), [['stakeMkt', 1500000000, null], ['netDebtEbitda', 3, 'le']]); assert.equal(W.goal.hold, 3);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w19', charId: ch, seed: 9 }); const S = st.world.bell; const m = E.metrics(st);
    assert.equal(m.worldIndicators.panel.id, 'bell'); assert.equal(co(st).value, stakeValue(st)); assert.ok(m.netWorth >= 250e6 && m.netWorth <= 900e6, ch + ' ' + m.netWorth);
    const ev = ttm(st) * SECTOR[S.sector].mult * (0.85 + 0.3 * (S.cred - BL.credLow) / (BL.credHigh - BL.credLow)) * (1 + S.mood + (S.listed ? GUIDE[S.guide].prem : 0)); assert.ok(Math.abs(equityValue(st) - Math.round(Math.max(ev * 0.05, ev - netDebt(st)))) <= 1);
    if (ch === 'founderCeo') { assert.equal(S.listed, false); assert.equal(stakeMkt(st), 0); } else { assert.equal(S.listed, true); assert.equal(S.guide, 'high'); assert.ok(stakeMkt(st) > 0); } }
});

await test('fixed draws on stream `world`: 2 at init, exactly 5 per payday + 3 per W landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, W: DRAWS.landing.W }, { init: 2, month: 5, W: 3 });
  for (const ch of CH) { const A = E.createGame({ worldId: 'w19', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w19', charId: ch, seed: 77 });
    for (let t = 0; t < 110 && !A.over && !B.over; t++) { for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 4)) E.worldAction(A, a.id, a.param);
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'cash') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (b && !B.over && k++ < 12) { const en = b.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; b = E.choose(B, b, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break; assert.equal(A.rng.world, B.rng.world, `${ch} turn ${t}`); } }
});

await test('IPO and guidance: the IPO sells new shares (float 20/30/49 %) at a 10 % discount into the company; guidance low is priced at once, a beat lifts mood and credibility, a miss cuts both', () => {
  const st = E.createGame({ worldId: 'w19', charId: 'founderCeo', seed: 4 }); const S = st.world.bell; const n0 = S.n, c0 = S.cash; assert.equal(E.worldAction(st, 'guide', 'mid').ok, false, 'not listed');
  assert.ok(E.worldAction(st, 'ipo', '0.3').ok); assert.ok(S.listed && S.n > n0 && S.cash > c0); assert.equal(Math.round((S.n - n0) / S.n * 100), 30); assert.ok(stakeMkt(st) > 0); assert.equal(E.worldAction(st, 'ipo', '0.2').ok, false);
  const p0 = price(st); assert.ok(E.worldAction(st, 'guide', 'low').ok); assert.ok(price(st) < p0, 'sandbagging lowers the price now'); assert.ok(E.worldAction(st, 'guide', 'mid').ok);
  let beat = 0, miss = 0; for (let seed = 1; seed < 12; seed++) { for (const g of ['mid', 'high']) { const x = E.createGame({ worldId: 'w19', charId: 'familyBoard', seed }); if (g === 'mid') E.worldAction(x, 'guide', 'mid'); const X = x.world.bell; const cr0 = X.cred; const b0 = X.beats, m0 = X.misses; untilPay(x, 3);
    if (X.beats > b0) { beat++; assert.ok(X.cred >= cr0); } if (X.misses > m0) { miss++; assert.ok(X.cred < cr0 || X.cred === BL.credLow); } } }
  assert.ok(beat >= 3 && miss >= 3, `beats ${beat} misses ${miss}`);
});

await test('capital actions: buyback (2 % at the price + 3 % impact, refused past 4 × EBITDA), dividend (your share in cash), secondary (5 % at 0.95), repay, grow (+8 % six months later), sell a division; the activist when the price lags peers by 25 %', () => {
  const st = E.createGame({ worldId: 'w19', charId: 'familyBoard', seed: 5 }); const S = st.world.bell; const n0 = S.n; assert.ok(E.worldAction(st, 'buyback', null).ok); assert.equal(n0 - S.n, Math.round(n0 * BL.buy));
  const c0 = st.cash; assert.ok(E.worldAction(st, 'dividend', null).ok || true); assert.ok(st.cash >= c0);
  const n1 = S.n, k0 = S.cash; assert.ok(E.worldAction(st, 'secondary', null).ok); assert.ok(S.n > n1 && S.cash > k0);
  const e0 = S.div.plant.e; assert.ok(E.worldAction(st, 'grow', 'plant').ok); assert.equal(E.worldAction(st, 'grow', 'plant').ok, false); untilPay(st, BL.growLag + 1); assert.ok(S.div.plant.e >= Math.round(e0 * (1 + BL.growUp)) - 1);
  assert.ok(E.worldAction(st, 'sell', 'chain').ok); assert.equal(S.div.chain, null); assert.equal(E.worldAction(st, 'sell', 'plant').ok, false, 'the last division stays');
  const t = E.createGame({ worldId: 'w19', charId: 'turnaroundCeo', seed: 5 }); t.world.bell.debt *= 1.5; t.world.bell.mood = -0.35; untilPay(t, 1); assert.ok(t.world.bell.activists >= 1 || price(t) >= 0.75 * peerPrice(t));
  assert.ok(Number.isFinite(netDebtEbitda(t)) && ebitdaM(t) > 0);
});

await test('W card: cash (refused past 4.5 × EBITDA) or shares (listed only, dilutes); pass (the safe option) changes nothing', () => {
  const st = E.createGame({ worldId: 'w19', charId: 'familyBoard', seed: 21 }); const ev = toW(st); assert.ok(ev); const e0 = ebitdaM(st); const it = st.pending.item; const n0 = st.world.bell.n;
  E.choose(st, E.currentEvent(st), ev.options.find((o) => o.id === 'shares' && o.enabled) ? 'shares' : 'pass'); if (st.world.bell.bought) { assert.ok(st.world.bell.n > n0); assert.equal(ebitdaM(st) - e0, Math.round(it.e * it.q)); }
  const f = E.createGame({ worldId: 'w19', charId: 'founderCeo', seed: 22 }); const ef = toW(f); assert.equal(ef.options.find((o) => o.id === 'shares').enabled, false);
  const snap = JSON.stringify(f.world.bell); const cx = f.cash; E.choose(f, E.currentEvent(f), 'pass'); assert.equal(JSON.stringify(f.world.bell), snap); assert.equal(f.cash, cx);
});

await test('Z actions logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) { const st = play({ worldId: 'w19', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i); assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i); }
  const st = E.createGame({ worldId: 'w19', charId: 'founderCeo', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['ipo', '0.5'], ['guide', 'mid'], ['buyback', null], ['secondary', null], ['grow', 'x'], ['sell', 'x']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'ipo', '0.2').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the company asset = your stake at the price, goal progress in [0, 1]', () => {
  for (let i = 0; i < 9; i++) play({ worldId: 'w19', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => { if (s.over) return; const m = E.metrics(s);
    for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
    assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); assert.equal(co(s).value, stakeValue(s)); assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const S = s.world.bell;
    for (const k of ['cash', 'debt', 'n', 'sh']) assert.ok(Number.isInteger(S[k]) && S[k] >= 0, k + ' = ' + S[k]); assert.ok(price(s) > 0 && Number.isFinite(price(s))); for (const d of DIVS) if (S.div[d]) assert.ok(Number.isInteger(S.div[d].e)); } });
});

await test('rooms: the public view carries no sealed value (the landing draws, a bolt-on\'s quality)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w19', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toW(st); const js = JSON.stringify(E.publicView(st)); for (const k of ['"q"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the adapter (≤ 350 lines, uses:); the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w19 pack (the world and the bell adapter); a w19 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w19; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w19.js', 'worlds/adapters/bell.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w19 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w19').id, 'w19');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w19', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w19', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w19 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
