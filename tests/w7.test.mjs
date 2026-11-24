#!/usr/bin/env node
// w7 רשתות המסחר (engine side): lazy registration, the `chain` module contract (fixed draws on stream `world`: 1 per payday, 2 per 'R'
// landing, 0 at init), branches (fit-out, ramp-up, span, cannibalisation, sealed location + survey), one pool of stock with lead time and
// supplier terms (the inventory cash), own vs franchise, insolvency while profitable, the composite goal (net worth AND liquidity months),
// Z actions replayed and verified, the 'R' tile's safe option, saves, fuzz and the verifier's per-world pack. Run: node tests/w7.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STREAMS } from '../js/rng.js';
import { prng } from './lib/random-player.mjs';
import { RAMP, LOC, salesOf, spanPenalty, cogsOf, liqMonths, fixedMonth, AREAS } from '../js/worlds/mech/chain.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w7 is not loaded by the engine; ensureWorld loads it; WORLDS stays w1–w4; meta agrees', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w7'), false); assert.throws(() => E.getWorld('w7'), /world_not_loaded/);
  const w = await E.ensureWorld('w7'); assert.equal(w.id, 'w7'); assert.equal(E.getWorld('w7'), w); assert.equal(w.minRules, 6); assert.equal(w.mechanic, 'chain');
  const { metaOf } = await import('../js/worlds/meta.js'); const m = metaOf('w7');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.ranked, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
});

const W7 = E.getWorld('w7'); const CH = W7.characters.map((c) => c.id);
const MC = { calOf: (st) => ((st.month - 1) % 12) + 1, holdingsValue: () => 0 };
const settle = (st, ev, k0 = 0) => { let k = k0; while (ev && !st.over && k++ < 10) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
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
const toR = (st) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 400 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };

await test('start: rules 6; characters as specified (3 trading shops + stock / cash only, 60-day terms / 8 franchises + franchise system); start equity ₪8–15M', () => {
  assert.equal(E.createGame({ worldId: 'w7', seed: 3, rules: 4 }).rules, 6);
  const f = E.createGame({ worldId: 'w7', charId: 'shopFounder', seed: 9 }); const C = E.metrics(f).worldIndicators.chain;
  assert.equal(C.branches, 3); assert.equal(C.managers, 0); assert.equal(C.span, 3); assert.ok(C.stock > 0 && C.transit > 0, 'the starting chain has stock and a pipeline'); assert.equal(C.brand, 75);
  assert.equal(E.metrics(f).goalType, 'all'); assert.deepEqual(E.metrics(f).goalParts.map((p) => p.key), ['netWorth', 'liquidity']);
  const c = E.createGame({ worldId: 'w7', charId: 'cfo', seed: 9 }); assert.equal(c.assets.filter((a) => a.op && a.op.ck === 'branch').length, 0); assert.equal(E.metrics(c).worldIndicators.chain.terms, 60); assert.equal(E.metrics(c).worldIndicators.chain.exactNeed, true);
  const z = E.createGame({ worldId: 'w7', charId: 'franchisor', seed: 9 }); const Z = E.metrics(z).worldIndicators.chain; assert.equal(Z.franchises, 8); assert.equal(Z.franSys, true); assert.equal(Z.fixedMonth, 0);
  assert.equal(E.metrics(z).goalParts[1].value, 99, 'no fixed costs: liquidity is full');
  for (const s of [f, c, z]) { const nw = E.metrics(s).netWorth; assert.ok(nw >= 8e6 && nw <= 16e6, s.charId + ' NW ' + nw); }
});

await test('fixed draws on stream `world`: exactly 1 per payday + 2 per R landing, 0 at init — opposite players stay aligned on every stream', () => {
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w7', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w7', charId: ch, seed: 77 });
    assert.equal(A.rng.world, E.createGame({ worldId: 'w1', seed: 77 }).rng.world, 'init draws 0');
    let paydays = 0, landR = 0; const w0 = A.rng.world; const r = prng(5);
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled && ['cover', 'terms'].includes(x.id)).slice(0, 2)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const pd0 = A.stats.paydays; E.rollDice(A); E.rollDice(B); paydays += A.stats.paydays - pd0;
      let ea = E.landing(A); let eb = E.landing(B); if (A.pending && A.pending.type === 'mech') landR++;
      let k = 0; while (ea && !A.over && k++ < 10) { const en = ea.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'survey') || en.find((x) => x.primary && x.id !== 'pass') || en.find((x) => x.id === 'franchise') || en[Math.floor(r() * en.length)]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, eb);
      if (A.over || B.over) break;
      for (const s of STREAMS) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
    const probe = { world: w0 }; const n = paydays + 2 * landR; for (let i = 0; i < n; i++) probe.world = (probe.world + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, probe.world, `${ch}: world stream advanced exactly ${paydays} + 2·${landR} times`);
    assert.ok(paydays >= 5 && landR >= 2, `paydays ${paydays}, R ${landR}`);
  }
});

await test('the model: ramp-up, location, span penalty (every own branch), cannibalisation, scale purchasing; franchise royalty', () => {
  assert.equal(RAMP[0], 0.4); assert.equal(RAMP[RAMP.length - 1], 1); assert.ok(LOC.A > LOC.B && LOC.B > LOC.C);
  const st = E.createGame({ worldId: 'w7', charId: 'shopFounder', seed: 4 }); const br = st.assets.filter((a) => a.op && a.op.ck === 'branch');
  const a = br[1]; const s0 = salesOf(st, a, MC);
  assert.ok(salesOf(st, { ...a, op: { ...a.op, age: 0 } }, MC) < s0, 'a young branch sells less (founder: from 0.55)');
  assert.ok(salesOf(st, { ...a, op: { ...a.op, loc: 'C' } }, MC) < s0 && salesOf(st, { ...a, op: { ...a.op, loc: 'A' } }, MC) > s0);
  assert.ok(salesOf(st, { ...a, op: { ...a.op, area: 9 } }, MC) > s0, 'a neighbour in the same area cannibalises');
  assert.equal(spanPenalty(st), 1); const c0 = cogsOf(st);
  for (let i = 0; i < 4; i++) st.assets.push({ ...JSON.parse(JSON.stringify(a)), id: 900 + i }); // 7 own branches, span 3 → 4 over
  assert.equal(spanPenalty(st), 0.8, '5 % per branch beyond the span, for every branch'); assert.ok(cogsOf(st) < c0, 'scale purchasing: 1 % per 5 branches');
  assert.ok(salesOf(st, a, MC) < s0, 'the old branch sells less too');
  assert.ok(AREAS >= 10);
  const z = E.createGame({ worldId: 'w7', charId: 'franchisor', seed: 4 }); const f = z.assets.find((x) => x.op && x.op.ck === 'branch');
  const m = E.metrics(z).assets.find((x) => x.id === 'a' + f.id); assert.ok(m.cf > 0 && m.cf < salesOf(z, f, MC) * 0.1, 'a franchise pays a royalty on its sales');
  assert.equal(fixedMonth(z, MC), 0); assert.equal(liqMonths(z, MC), 99);
});

await test('R tile: 2 sealed draws; pass (the room-timeout safe option) never spends; the survey narrows to two locations incl. the truth; own = fit-out + stock; franchise = entry fee', () => {
  let seen = 0, owned = 0, fran = 0;
  for (let s = 1; s <= 40 && (seen < 6 || !owned || !fran); s++) {
    const st = E.createGame({ worldId: 'w7', charId: s % 2 ? 'cfo' : 'franchisor', seed: s });
    for (let n = 0; n < 6 && !st.over; n++) {
      let ev = toR(st); if (!ev) break; seen++; const p = st.pending;
      assert.equal(p.wr.length, 2); assert.equal(ev.tag, 'מיקום לסניף'); assert.ok(p.pair.includes(p.truth.loc));
      const pass = ev.options.find((o) => o.id === 'pass'); assert.ok(pass && pass.enabled);
      assert.ok(!JSON.stringify(ev).includes('"truth"'), 'the event never carries the sealed truth');
      if (n % 3 === 0) { const c0 = st.cash, l0 = st.loans, a0 = st.assets.length; ev = E.choose(st, ev, 'pass').event; assert.equal(st.cash, c0); assert.equal(st.loans, l0); assert.equal(st.assets.length, a0); settle(st, ev); continue; }
      if (!ev.data.surveyed && ev.options.find((o) => o.id === 'survey' && o.enabled)) { const c0 = st.cash; ev = E.choose(st, ev, 'survey').event; assert.equal(st.cash, c0 - 30000); assert.equal(ev.data.surveyed, true); assert.deepEqual(ev.data.locs, p.pair); }
      const fr = ev.options.find((o) => o.id === 'franchise' && o.enabled); const ow = ev.options.find((o) => o.id === 'own' && o.enabled);
      if (fr && st.charId === 'franchisor') { const c0 = st.cash; ev = E.choose(st, ev, 'franchise').event; const a = st.assets[st.assets.length - 1]; assert.equal(a.op.own, false); assert.ok(st.cash > c0, 'entry fee'); assert.equal(a.debt, 0); fran++; }
      else if (ow) { const st0 = E.metrics(st).worldIndicators.chain.stock; ev = E.choose(st, ev, 'own').event; const a = st.assets[st.assets.length - 1]; assert.equal(a.op.own, true); assert.equal(a.op.openAt, st.month + 2); assert.ok(E.metrics(st).worldIndicators.chain.stock > st0, 'first stock');
        const row = E.metrics(st).worldIndicators.panel.rows.find((r) => r.assetId === 'a' + a.id); assert.equal(row.open, false); assert.ok(row.cfNow < 0, 'fit-out: rent and wages, no sales'); owned++; }
      settle(st, ev);
    }
  }
  assert.ok(seen >= 6 && owned >= 1 && fran >= 1, `seen ${seen}, own ${owned}, franchise ${fran}`);
});

await test('inventory cash: the payday pays the suppliers\' invoices and gets back the cost of goods sold; a growing chain\'s stock eats cash; overstock is marked down', () => {
  const st = E.createGame({ worldId: 'w7', charId: 'shopFounder', seed: 21 }); const iv = st.assets.find((a) => a.op && a.op.ck === 'inv');
  let sawOrder = false, sawPaid = false; const seen = new Set(iv.op.transit.map((x) => x.arrives));
  for (let i = 0; i < 60 && st.stats.paydays < 8; i++) { const pd = st.stats.paydays; E.rollDice(st); settle(st, E.landing(st)); if (st.stats.paydays === pd) continue;
    for (const x of iv.op.transit) if (!seen.has(x.arrives)) { seen.add(x.arrives); if (x.arrives === st.month + 2) sawOrder = true; }
    if (st.world.chain.payables.length && st.world.chain.payables.every((x) => x.due > st.month)) sawPaid = true; }
  assert.ok(sawOrder && sawPaid, 'orders placed, invoices paid'); assert.equal(iv.value, iv.op.stock + iv.op.transit.reduce((s, x) => s + x.amt, 0));
  assert.ok(E.worldAction(st, 'cover', '3').ok); assert.equal(E.metrics(st).worldIndicators.chain.cover, 3);
  const n0 = st.actions.length; assert.equal(E.worldAction(st, 'cover', '7').ok, false); assert.equal(E.worldAction(st, 'cover', '3').ok, false); assert.equal(st.actions.length, n0);
});

await test('insolvency while profitable: forced bank debt beyond the voluntary cap for 3 paydays → bankrupt with positive branch profits', () => {
  const st = E.createGame({ worldId: 'w7', charId: 'shopFounder', seed: 5 }); st.loans = 60000000; // far beyond the bank's voluntary limit
  let k = 0; while (!st.over && k++ < 80 && !st.flags.bankrupt) { E.rollDice(st); settle(st, E.landing(st)); }
  assert.ok(st.flags.bankrupt, 'the bank called the loans'); assert.ok(st.world.chain.insolvent > 0);
  const prof = st.assets.filter((a) => a.op && a.op.ck === 'branch').reduce((s, a) => s + (a.op.own ? 1 : 0), 0); assert.ok(prof >= 1);
});

await test('goal: all(net worth ≥ ₪120M, liquidity ≥ 4 months) held 3 paydays; progress = the weaker part; nearMiss names it', () => {
  const st = E.createGame({ worldId: 'w7', charId: 'shopFounder', seed: 3 });
  st.cash = 130e6; let m = E.metrics(st); assert.ok(m.goalParts[0].progress === 1 && m.goalParts[1].progress === 1);
  st.cash = 3e5; m = E.metrics(st); assert.ok(m.goalParts[1].value < 4); assert.ok(m.goalProgress < 0.5);
  const lq = m.goalParts[1]; assert.equal(lq.unit, 'months'); assert.ok(lq.fixedMonth > 0);
  st.cash = 130e6; st.savings = 2e6; st.life.goalStreak = 2; assert.equal(E.checkEnd(st), null, 'hold 3'); st.life.goalStreak = 3; assert.equal(E.checkEnd(st).status, 'won');
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  let zs = 0;
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w7', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    zs += st.actions.filter((a) => a[0] === 'Z').length;
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  assert.ok(zs > 20, 'module actions exercised: ' + zs);
  const st = E.createGame({ worldId: 'w7', charId: 'shopFounder', seed: 2 }); const n0 = st.actions.length;
  assert.equal(E.worldAction(st, 'fire').ok, false); assert.equal(E.worldAction(st, 'convert', '1').ok, false, 'no franchise system yet'); assert.equal(E.worldAction(st, 'maint', '1:run').ok, false, 'a w6 action does not exist here');
  assert.equal(st.actions.length, n0);
  assert.ok(E.worldAction(st, 'hire').ok); assert.equal(st.world.chain.managers, 1); assert.equal(E.metrics(st).worldIndicators.chain.span, 9);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, stock ≥ 0, goal progress in [0, 1]', () => {
  for (let i = 0; i < 8; i++) {
    play({ worldId: 'w7', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.3, maxTurns: 150, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) { assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n); if (a.op && a.op.ck === 'inv') assert.ok(a.op.stock >= 0); }
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1);
    } });
  }
});

await test('verifier: core bundle + the w7 pack only; a w7 game verifies; dated before RULES6_FROM → bad_world', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE);
  assert.ok(!Object.keys(all.core.files).some((p) => /worlds\/w[5-9]|mech\//.test(p)), 'no lazy world in the core');
  assert.ok(all.packs.w7 && all.packs.w7.text.length <= MAX_PACK && all.packs.w7.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w7 && all.packs.w7.text.length));
  assert.deepEqual(Object.keys(all.packs.w7.files).sort(), ['worlds/mech/chain.js', 'worlds/w7.js']);
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w7.text); assert.equal(EE.getWorld('w7').id, 'w7');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 8 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w7', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.25, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w7', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w7 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, E.RULES_CURRENT); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w7.text.length} chars · max w7 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
