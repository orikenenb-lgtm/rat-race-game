#!/usr/bin/env node
// w22 העיר החדשה (engine side): lazy registration, the rule adapter `capture` (fixed draws on stream `world`: 6 at init — the cycle, one
// sealed spill per amenity kind —, 3 per payday — the cycle, the clearing factor, an event target —, 3 per 'W' landing), 20 plots in 5 zones,
// amenities built month by month that raise the prices of their zone and the next zones (the planner sees the sealed spill), residents
// after a lag on sold plots, property tax, bonds with a spread on DSCR, the services ratio and satisfaction (under 50 people leave), the
// developer bundle, the goal (NW with the held land at the zone's last clearing price + 60k residents + DSCR 1.5, hold 3), the W offers
// (PPP / campus; pass is safe), Z actions replayed and verified, saves, fuzz, the public view, the pack. Run: node tests/w22.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, ZONES, PER, AM, CP, CYC, zoneFactor, residents, plotPrice, landValue, services, satisfaction, dscr } from '../js/worlds/adapters/capture.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w22 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 10, 1 of w12/w18/w19); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w22'), false); assert.throws(() => E.getWorld('w22'), /world_not_loaded/); assert.equal(E.LESSONS.some((l) => l.id === 'land_capture'), false);
  const w = await E.ensureWorld('w22'); assert.equal(w.mechanic, 'capture'); assert.equal(w.minRules, 7); assert.deepEqual(w.mech[0].uses, ['projects', 'stages', 'public', 'rate']);
  for (const id of ['land_capture', 'build_order']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w22'); assert.equal(m.status, 'lazy'); assert.equal(m.tier, 10); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.equal(m.maxMonths, w.maxMonths); assert.deepEqual(m.stars, w.stars);
  const base = Object.fromEntries(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w13', 'w14', 'w15', 'w16'].map((k) => [k, 1]));
  for (const k of ['w12', 'w18', 'w19']) assert.equal(isUnlockedBy('w22', { ...base, [k]: 1 }), true, k); assert.equal(isUnlockedBy('w22', { ...base, w17: 1, w20: 1 }), false);
});

const W = E.getWorld('w22'); const CH = W.characters.map((c) => c.id);
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
const C = (st) => st.world.capture;
const land = (st) => st.assets.find((a) => a.op && a.op.ck === 'capture');
const finish = (st, k, z) => { C(st).am.push({ k, z, left: 0, pm: 0, hold: 0 }); };

await test('start: rules 7; the goal (NW ₪3B + 60k residents + DSCR 1.5, hold 3); 20 plots in 5 zones; the land asset = the held plots at the zone\'s clearing price, the bonds its debt', () => {
  assert.equal(E.createGame({ worldId: 'w22', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => [g.type, g.key || null, g.target]), [['nw', null, 3000000000], ['modValue', 'residents', 60000], ['modValue', 'dscr', 1.5]]); assert.equal(W.goal.hold, 3); assert.equal(W.maxMonths, 84);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w22', charId: ch, seed: 9 }); const S = C(st); const m = E.metrics(st);
    assert.equal(S.plots.length, ZONES.length * PER); assert.equal(m.worldIndicators.panel.id, 'capture'); assert.equal(land(st).value, landValue(st)); assert.equal(land(st).debt, 0); assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
    assert.ok(landValue(st) >= 1e9 && landValue(st) <= 2.1e9, ch + ' ' + landValue(st)); assert.equal(residents(st), 0); assert.equal(dscr(st), 99); }
  assert.equal(C(E.createGame({ worldId: 'w22', charId: 'plotMagnate', seed: 9 })).plots.filter((p) => p.own).length, 20);
  assert.equal(C(E.createGame({ worldId: 'w22', charId: 'cityPlanner', seed: 9 })).plots.filter((p) => p.own).length, 16); assert.equal(C(E.createGame({ worldId: 'w22', charId: 'cityPlanner', seed: 9 })).see, true);
  assert.equal(C(E.createGame({ worldId: 'w22', charId: 'transitEngineer', seed: 9 })).costK, 0.85);
});

await test('fixed draws on stream `world`: 6 at init, exactly 3 per payday + 3 per W landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, W: DRAWS.landing.W }, { init: 6, month: 3, W: 3 });
  for (const ch of CH) { const A = E.createGame({ worldId: 'w22', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w22', charId: ch, seed: 77 });
    for (let t = 0; t < 110 && !A.over && !B.over; t++) { for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 4)) E.worldAction(A, a.id, a.param);
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'take') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (b && !B.over && k++ < 12) { const en = b.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; b = E.choose(B, b, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break; assert.equal(A.rng.world, B.rng.world, `${ch} turn ${t}`); } }
});

await test('capture: a finished amenity raises its own zone by the table and the next zones by the spill (table for most, sealed exact for the planner\'s view); it is paid month by month; your held land and NW rise (lesson land_capture)', () => {
  const st = E.createGame({ worldId: 'w22', charId: 'plotMagnate', seed: 5 }); const S = C(st); S.cyc = 'normal'; const p2 = plotPrice(st, 8), p1 = plotPrice(st, 4), p0 = plotPrice(st, 0); const lv0 = landValue(st);
  assert.ok(E.worldAction(st, 'build', 'rail:2').ok); assert.equal(E.worldAction(st, 'build', 'rail:2').ok, false); const c0 = st.cash; untilPay(st, 1); assert.ok(st.cash < c0 + 5000000, 'a build month was paid');
  const a = S.am[0]; a.left = 1; untilPay(st, 1); S.cyc = 'normal'; assert.equal(a.left, 0); assert.ok(st.lessons.includes('land_capture'));
  assert.ok(Math.abs(zoneFactor(S, 2) - AM.rail.own) < 1e-9); assert.ok(Math.abs(zoneFactor(S, 1) - (1 + (AM.rail.adj - 1) * S.sp.rail)) < 1e-3); assert.equal(zoneFactor(S, 0), 1);
  assert.ok(plotPrice(st, 8) > p2 * 1.4 && plotPrice(st, 4) > p1 && plotPrice(st, 0) === p0, `${plotPrice(st, 8)} ${p2}`); assert.ok(landValue(st) > lv0);
  const pl = E.createGame({ worldId: 'w22', charId: 'cityPlanner', seed: 5 }); const ot = E.createGame({ worldId: 'w22', charId: 'transitEngineer', seed: 5 });
  const bp = E.worldActions(pl).find((x) => x.id === 'build' && x.param === 'rail:2'); const bo = E.worldActions(ot).find((x) => x.id === 'build' && x.param === 'rail:2');
  assert.equal(bo.adj, AM.rail.adj); assert.ok(Math.abs(bp.adj - (1 + (AM.rail.adj - 1) * C(pl).sp.rail)) < 1e-3); assert.equal(bo.cost, Math.round(AM.rail.cost * 0.85 / 1000) * 1000);
});

await test('residents: a sold plot fills after its lag toward a target set by the nearby amenities; property tax flows in; the services ratio drives satisfaction and under 50 residents leave (lesson build_order)', () => {
  const st = E.createGame({ worldId: 'w22', charId: 'plotMagnate', seed: 7 }); const S = C(st); S.cyc = 'normal'; S.clr = 1;
  const c0 = st.cash; assert.ok(E.worldAction(st, 'sell', '8').ok); assert.equal(S.plots[8].own, false); assert.ok(st.cash > c0); assert.ok(S.plots[8].lag >= 3 && S.plots[8].lag <= 9);
  assert.equal(E.worldAction(st, 'sell', '8').ok, false); untilPay(st, 12); assert.ok(S.plots[8].res > 0 && S.plots[8].res <= CP.resBase, 'no amenity: base target ' + S.plots[8].res);
  finish(st, 'park', 2); finish(st, 'school', 2); untilPay(st, 4); assert.ok(S.plots[8].tgt > CP.resBase); assert.equal(services(st), 0.5, "seats cover, no beds yet"); assert.ok(satisfaction(st) >= CP.satLow);
  const x = E.createGame({ worldId: 'w22', charId: 'plotMagnate', seed: 7 }); const X = C(x); for (let i = 0; i < 12; i++) { X.plots[i].own = false; X.plots[i].lag = -1; X.plots[i].res = 3000; X.plots[i].tgt = 3000; }
  assert.equal(services(x), 0); assert.ok(satisfaction(x) < CP.satLow); const r0 = residents(x); untilPay(x, 2); assert.ok(residents(x) < r0, 'people leave'); assert.ok(X.leaveM >= 1); assert.ok(x.lessons.includes('build_order'));
});

await test('bonds: ₪100M a step up to the cap; the coupon = the rate + a spread on DSCR; DSCR = (tax − running costs) ÷ (interest + principal); repay; refinance only when cheaper; NW counts the bonds', () => {
  const st = E.createGame({ worldId: 'w22', charId: 'plotMagnate', seed: 4 }); const S = C(st); const nw0 = E.metrics(st).netWorth;
  assert.ok(E.worldAction(st, 'bond', null).ok); assert.equal(S.bonds, CP.bondUnit); assert.equal(S.cpn, Math.round((S.base + 0.01) * 1000) / 1000); assert.equal(land(st).debt, CP.bondUnit); assert.equal(E.metrics(st).netWorth, nw0);
  assert.ok(dscr(st) <= 0, 'an empty city cannot cover its debt'); assert.ok(E.worldAction(st, 'bond', null).ok); assert.ok(S.cpn > S.base + 0.01, 'the second step pays the wider spread');
  for (let i = 0; i < 30; i++) E.worldAction(st, 'bond', null); assert.ok(S.bonds <= CP.bondCap); assert.equal(E.worldAction(st, 'bond', null).ok, false);
  const b0 = S.bonds; assert.ok(E.worldAction(st, 'repay', null).ok); assert.equal(S.bonds, b0 - CP.bondUnit); assert.equal(E.worldAction(st, 'refi', null).ok, false, 'not cheaper');
  for (let i = 0; i < 16; i++) { S.plots[i].own = false; S.plots[i].lag = -1; S.plots[i].res = 4000; } finish(st, 'school', 1); finish(st, 'school', 2); finish(st, 'school', 3); finish(st, 'school', 4); finish(st, 'hospital', 2); finish(st, 'hospital', 3);
  S.bonds = 150000000; S.cpn = 0.07; assert.ok(dscr(st) >= 1.5, 'a full city covers ' + dscr(st)); assert.ok(E.worldAction(st, 'refi', null).ok); assert.ok(S.cpn < 0.07);
});

await test('sales: at the month\'s clearing factor, frozen in a recession (only the developer bundle at −20 %); the zone\'s mark follows its last clearing factor', () => {
  const st = E.createGame({ worldId: 'w22', charId: 'plotMagnate', seed: 6 }); const S = C(st); S.clr = 1.05; const pr = Math.round(plotPrice(st, 9) * 1.05 / 1000) * 1000; const c0 = st.cash;
  assert.ok(E.worldAction(st, 'sell', '9').ok); assert.equal(st.cash, c0 + pr); assert.equal(S.zk[2], 1.05); assert.equal(land(st).value, landValue(st));
  S.freeze = st.month + 3; assert.equal(E.worldAction(st, 'sell', '10').ok, false); const own0 = S.plots.filter((p) => p.own).length; assert.ok(E.worldAction(st, 'bundle', null).ok); assert.equal(S.plots.filter((p) => p.own).length, own0 - 2); assert.equal(S.bundles, 1);
  assert.ok(Object.values(S.zk).some((k) => k === CP.bundle));
});

await test('W: a PPP partner builds an amenity for a share of the zone\'s tax; a campus buys a plot at a discount and lifts demand; pass (the safe option) changes nothing', () => {
  let ppp = 0, campus = 0;
  for (let s = 1; s < 60 && (!ppp || !campus); s++) { const st = E.createGame({ worldId: 'w22', charId: 'cityPlanner', seed: s }); const ev = toW(st); if (!ev) continue; const it = st.pending.item;
    if (it.kind === 'ppp' && !ppp && ev.options.find((o) => o.id === 'take' && o.enabled)) { E.choose(st, E.currentEvent(st), 'take'); const a = C(st).am.find((x) => x.ppp); assert.ok(a && a.pm === 0); assert.equal(C(st).pp.length, 1); ppp++; }
    else if (it.kind === 'campus' && !campus && ev.options.find((o) => o.id === 'take' && o.enabled)) { const c0 = st.cash; E.choose(st, E.currentEvent(st), 'take'); assert.ok(st.cash > c0); assert.ok(C(st).plots.some((p) => p.campus && !p.own)); campus++; } }
  assert.ok(ppp && campus, `ppp ${ppp} campus ${campus}`);
  const f = E.createGame({ worldId: 'w22', charId: 'transitEngineer', seed: 22 }); toW(f); const snap = JSON.stringify(f.world.capture); const cx = f.cash; E.choose(f, E.currentEvent(f), 'pass'); assert.equal(JSON.stringify(f.world.capture), snap); assert.equal(f.cash, cx);
});

await test('Z actions logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) { const st = play({ worldId: 'w22', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i); assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i); }
  const st = E.createGame({ worldId: 'w22', charId: 'cityPlanner', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['sell', '3'], ['sell', '99'], ['build', 'tower:1'], ['build', 'park:9'], ['repay', null], ['refi', null]]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'build', 'park:0').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the land asset = held land and the bonds, residents ≤ the plots\' cap, satisfaction in [0, 100], goal progress in [0, 1]', () => {
  for (let i = 0; i < 9; i++) play({ worldId: 'w22', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.4, maxTurns: 160, onTurn: (s) => { if (s.over) return; const m = E.metrics(s);
    for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
    assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const S = C(s);
    assert.equal(land(s).value, landValue(s)); assert.equal(land(s).debt, S.bonds); assert.ok(Number.isInteger(S.bonds) && S.bonds >= 0 && S.bonds <= CP.bondCap);
    assert.ok(residents(s) >= 0 && residents(s) <= S.plots.length * CP.resCap); const sat = satisfaction(s); assert.ok(sat >= 0 && sat <= 100); assert.ok(Number.isFinite(dscr(s))); assert.ok(Object.keys(CYC).includes(S.cyc)); } });
});

await test('rooms: the public view carries no sealed value (the spill multipliers, the landing draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w22', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toW(st); const pv = E.publicView(st); const js = JSON.stringify(pv);
    const mod = JSON.stringify(pv.metrics.worldIndicators) + JSON.stringify(pv.event || null);
    assert.ok(!js.includes('"wr"'), ch + ' wr'); assert.ok(!mod.includes('"sp":'), ch + ' sp'); }
});

await test('lint + validator: exact arithmetic in the adapter (≤ 350 lines, uses:); the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w22 pack (the world, the capture adapter); a w22 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w22; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w22.js', 'worlds/adapters/capture.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w22 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w22').id, 'w22');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w22', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w22', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w22 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
