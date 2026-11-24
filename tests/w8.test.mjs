#!/usr/bin/env node
// w8 מטרופולין הנדל"ן (engine side): lazy registration, the `projects` module contract (fixed draws on stream `world`: 12 at init, 1 per
// payday, 4 per 'Q' landing), the shared staged-build core (js/worlds/mech/stages.js: equity first, the loan gate, stalls, capitalised
// interest, sealed delay / overrun / contractor failure, value at cost), presales and demand, completion (sell / hold), plots and the
// combination deal, Z actions replayed and verified, the 'Q' tile's safe option, saves, fuzz and the verifier's per-world pack.
// Run: node tests/w8.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STREAMS } from '../js/rng.js';
import { prng } from './lib/random-player.mjs';
import { newBuild, buildMonth, equityGap, valueAtCost, pctDone } from '../js/worlds/mech/stages.js';
import { PRESALE, CONTRACTOR } from '../js/worlds/mech/projects.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w8 is not loaded by the engine; ensureWorld loads it; WORLDS stays w1–w4; meta agrees', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w8'), false); assert.throws(() => E.getWorld('w8'), /world_not_loaded/);
  const w = await E.ensureWorld('w8'); assert.equal(w.id, 'w8'); assert.equal(E.getWorld('w8'), w); assert.equal(w.minRules, 6); assert.equal(w.mechanic, 'projects');
  const { metaOf } = await import('../js/worlds/meta.js'); const m = metaOf('w8');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.ranked, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
});

const W8 = E.getWorld('w8'); const CH = W8.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 10) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
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
const toQ = (st) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 400 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };

await test('the staged-build core: equity first, the loan gate stalls a stage (interest still runs), sealed delay and contractor failure, value at cost', () => {
  const b = newBuild({ now: 1, permitAt: 3, stages: 4, stageMonths: 2, cost: 40e6, land: 10e6, eqReq: 0.3, overrun: 0.1, delayAt: 1, delay: 2, failAt: 2, failCost: 0.15, failMonths: 2 });
  assert.equal(b.phase, 'permit'); assert.equal(equityGap(b), 5e6);
  assert.equal(buildMonth(b, { month: 2, cash: 1e9, rate: 1 }).stalled, 'permit');
  const m1 = buildMonth(b, { month: 3, cash: 1e9, rate: 1 }); assert.ok(m1.permitNow && m1.progressed); assert.equal(m1.equityPaid, 5.5e6 > 5e6 ? 5e6 : 5.5e6); assert.equal(m1.loanDrawn, 5.5e6 - 5e6);
  b.gateOk = false; const m2 = buildMonth(b, { month: 4, cash: 1e9, rate: 1 }); assert.equal(m2.stalled, 'gate'); assert.ok(m2.interest > 0, 'the loan\'s interest runs while the stage waits'); const L = b.loan;
  b.gateOk = true; buildMonth(b, { month: 5, cash: 1e9, rate: 1 }); assert.ok(b.loan > L); assert.equal(b.stage, 1);
  assert.equal(buildMonth(b, { month: 6, cash: 1e9, rate: 1 }).stalled, 'delay'); assert.equal(buildMonth(b, { month: 7, cash: 1e9, rate: 1 }).stalled, 'delay');
  for (let m = 8; m <= 9; m++) buildMonth(b, { month: m, cash: 1e9, rate: 1 }); assert.equal(b.stage, 2);
  assert.equal(buildMonth(b, { month: 10, cash: 1e9, rate: 1 }).failedNow, true); assert.ok(b.failed);
  let k = 11; while (b.phase !== 'done' && k < 40) buildMonth(b, { month: k++, cash: 1e9, rate: 1 });
  assert.equal(b.phase, 'done'); assert.equal(pctDone(b), 1); assert.equal(valueAtCost(b), Math.round((b.land + b.spent) / 1000) * 1000);
  assert.ok(b.spent > 40e6 * 1.1, 'overrun + the failure surcharge are paid');
  const c = newBuild({ now: 1, permitAt: 1, stages: 2, stageMonths: 1, cost: 10e6, land: 0, eqReq: 0.5 }); assert.equal(buildMonth(c, { month: 1, cash: 0, rate: 1 }).stalled, 'equity', 'no cash for the equity call: the stage stalls');
});

await test('start: rules 6; characters as specified (a tower at stage 3/6 with presales and a loan / 3 plots, no debt / cash only); start equity ₪20–46M', () => {
  assert.equal(E.createGame({ worldId: 'w8', seed: 3, rules: 4 }).rules, 6);
  const d = E.createGame({ worldId: 'w8', charId: 'developer', seed: 9 }); const r = E.metrics(d).worldIndicators.panel.rows[0];
  assert.equal(r.stage, 3); assert.equal(r.stages, 6); assert.equal(r.presold, 30); assert.ok(r.gate); assert.ok(r.loan > 0); assert.equal(r.permit, null, 'the sealed permit month is never in the panel once built');
  const o = E.createGame({ worldId: 'w8', charId: 'landowner', seed: 9 }); assert.equal(E.metrics(o).worldIndicators.proj.plots.length, 3); assert.equal(o.loans, 0);
  const c = E.createGame({ worldId: 'w8', charId: 'contractor', seed: 9 }); assert.equal(c.cash, 40000000);
  for (const s of [d, o, c]) { const nw = E.metrics(s).netWorth; assert.ok(nw >= 20e6 && nw <= 46e6, s.charId + ' NW ' + nw); }
  assert.equal(E.metrics(d).goalType, 'netWorth');
});

await test('fixed draws on stream `world`: 12 at init, exactly 1 per payday + 4 per Q landing — opposite players stay aligned on every stream', () => {
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w8', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w8', charId: ch, seed: 77 });
    const w1 = E.createGame({ worldId: 'w1', seed: 77 }).rng.world; const p0 = { world: w1 }; for (let i = 0; i < 12; i++) p0.world = (p0.world + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, p0.world, 'init draws 12');
    let paydays = 0, landQ = 0; const w0 = A.rng.world; const r = prng(5);
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled && !['sellProj', 'sellPlot', 'sellRent'].includes(x.id)).slice(0, 2)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const pd0 = A.stats.paydays; E.rollDice(A); E.rollDice(B); paydays += A.stats.paydays - pd0;
      let ea = E.landing(A); const eb = E.landing(B); if (A.pending && A.pending.type === 'mech') landQ++;
      let k = 0; while (ea && !A.over && k++ < 10) { const en = ea.options.filter((o) => o.enabled); const o = en.find((x) => x.kind === 'buy' || ['check', 'reliable', 'cheap'].includes(x.id)) || en[Math.floor(r() * en.length)]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, eb);
      if (A.over || B.over) break;
      for (const s of STREAMS) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
    const probe = { world: w0 }; const n = paydays + 4 * landQ; for (let i = 0; i < n; i++) probe.world = (probe.world + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, probe.world, `${ch}: world stream advanced exactly ${paydays} + 4·${landQ} times`);
    assert.ok(paydays >= 5 && landQ >= 2, `paydays ${paydays}, Q ${landQ}`);
  }
});

await test('Q tile: 4 sealed draws; pass (the room-timeout safe option) never spends; the permit check narrows the range; buying pays half the land as equity (the bank lends the other half with the project)', () => {
  let seen = 0, bought = 0;
  for (let s = 1; s <= 30 && (seen < 6 || bought < 2); s++) {
    const st = E.createGame({ worldId: 'w8', charId: 'contractor', seed: s }); st.cash = 120e6;
    for (let n = 0; n < 4 && !st.over; n++) {
      let ev = toQ(st); if (!ev) break; seen++; const p = st.pending;
      assert.equal(p.wr.length, 4); assert.equal(ev.tag, 'קרקע לפרויקט'); assert.ok(!JSON.stringify(ev).includes('"wr"'), 'the event never carries the sealed draws');
      const pass = ev.options.find((o) => o.id === 'pass'); assert.ok(pass && pass.enabled);
      if (n % 2 === 0) { const c0 = st.cash, l0 = st.loans, a0 = st.assets.length; ev = E.choose(st, ev, 'pass').event; assert.equal(st.cash, c0); assert.equal(st.loans, l0); assert.equal(st.assets.length, a0); settle(st, ev); continue; }
      const w0 = ev.data.permit.hi - ev.data.permit.lo;
      if (ev.options.find((o) => o.id === 'check' && o.enabled)) { ev = E.choose(st, ev, 'check').event; assert.equal(ev.data.checked, true); assert.ok(ev.data.permit.hi - ev.data.permit.lo < w0); }
      const c0 = st.cash; const land = ev.data.land; const down = ev.data.down; assert.equal(down + ev.data.landLoan, land); ev = E.choose(st, ev, 'reliable').event; const a = st.assets[st.assets.length - 1];
      assert.equal(a.op.ck, 'proj'); assert.equal(st.cash, c0 - down, 'half the land is the owner\'s equity'); assert.equal(a.value, land); assert.equal(a.op.sb.loan, land - down, 'the other half is the project\'s land loan'); assert.equal(a.op.tier, 'reliable'); assert.ok(a.op.sb.overrun <= CONTRACTOR.reliable.over * 0.5 + 1e-9, 'the contractor: overrun halved');
      bought++; settle(st, ev);
    }
  }
  assert.ok(seen >= 6 && bought >= 2, `seen ${seen}, bought ${bought}`);
});

await test('presales: the target sells units on paper (20 % deposit now, a liability until completion), unlocks the loan at 30 %; completion pays the rest', () => {
  const st = E.createGame({ worldId: 'w8', charId: 'developer', seed: 12 }); const a = st.assets.find((x) => x.op && x.op.ck === 'proj');
  const nw0 = E.metrics(st).netWorth; const d0 = a.op.deposits;
  assert.ok(E.worldAction(st, 'presale', `${a.id}:60`).ok);
  let g = 0; while (st.assets.includes(a) && a.op.presold < 0.5 * a.op.units && g++ < 60) { E.rollDice(st); settle(st, E.landing(st)); }
  assert.ok(a.op.deposits > d0, 'deposits collected'); assert.ok(a.op.presold / a.op.units >= PRESALE.req);
  assert.ok(Math.abs(E.metrics(st).netWorth - nw0) < 30e6, 'presale deposits do not inflate net worth (they are owed units)');
  let cash0 = st.cash; g = 0; while (st.assets.includes(a) && g++ < 120) { cash0 = st.cash; E.rollDice(st); settle(st, E.landing(st)); }
  assert.ok(!st.assets.includes(a), 'completed and handed over'); assert.ok(st.world.proj.completed >= 1);
  const n0 = st.actions.length; assert.equal(E.worldAction(st, 'presale', `${a.id}:40`).ok, false); assert.equal(st.actions.length, n0); void cash0;
});

await test('plots: develop (permit, equity = the plot), the combination deal (landowner only: a developer builds and keeps 70 % of the units), sell fast −20 %', () => {
  const st = E.createGame({ worldId: 'w8', charId: 'landowner', seed: 5 }); const pl = st.assets.filter((x) => x.op && x.op.ck === 'plot');
  assert.ok(E.worldAction(st, 'develop', `${pl[0].id}:combo`).ok); assert.equal(pl[0].op.ck, 'proj'); assert.equal(pl[0].op.combo, 0.7); assert.ok(pl[0].op.sb.external);
  assert.ok(E.worldAction(st, 'develop', `${pl[1].id}:reliable`).ok); assert.equal(pl[1].op.sb.equity, pl[1].op.sb.land);
  const c0 = st.cash; const v = pl[2].value; assert.ok(E.worldAction(st, 'sellPlot', String(pl[2].id)).ok); assert.equal(st.cash, c0 + Math.round(v * 0.8 / 1000) * 1000);
  const c = E.createGame({ worldId: 'w8', charId: 'contractor', seed: 5 }); assert.equal(E.worldAction(c, 'develop', '1:combo').ok, false);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  let zs = 0;
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w8', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    zs += st.actions.filter((a) => a[0] === 'Z').length;
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  assert.ok(zs > 20, 'module actions exercised: ' + zs);
  const st = E.createGame({ worldId: 'w8', charId: 'developer', seed: 2 }); const n0 = st.actions.length; const id = st.assets[0].id;
  assert.equal(E.worldAction(st, 'presale', `${id}:55`).ok, false); assert.equal(E.worldAction(st, 'presale', `${id}:40`).ok, false, 'already 40 %'); assert.equal(E.worldAction(st, 'hire').ok, false, 'a w7 action does not exist here');
  assert.equal(st.actions.length, n0);
  assert.ok(E.worldAction(st, 'plan', `${id}:hold`).ok); assert.equal(st.assets[0].op.plan, 'hold');
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1]', () => {
  for (let i = 0; i < 8; i++) {
    play({ worldId: 'w8', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.3, maxTurns: 150, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1);
    } });
  }
});

await test('verifier: core bundle + the w8 pack only (projects + the shared stages core); a w8 game verifies; dated before RULES6_FROM → bad_world', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE);
  assert.ok(all.packs.w8 && all.packs.w8.text.length <= MAX_PACK && all.packs.w8.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w8 && all.packs.w8.text.length));
  assert.deepEqual(Object.keys(all.packs.w8.files).sort(), ['worlds/mech/projects.js', 'worlds/mech/stages.js', 'worlds/w8.js']);
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w8.text); assert.equal(EE.getWorld('w8').id, 'w8');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 8 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w8', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.25, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w8', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w8 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, 6); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w8.text.length} chars · max w8 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
