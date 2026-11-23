#!/usr/bin/env node
// w6 אזור התעשייה (engine side): lazy registration, the `plant` module contract (fixed draws on stream `world`: 6 per payday, 3 per 'C'
// landing, 0 at init), breakdown hazard and wear, maintenance / shift / recovery `Z` actions replayed and verified, the 'C' tile's safe
// option, contracts and penalties, ordered lines delivered after 6 months, valuation (profit × multiple × condition), saves, fuzz and the
// verifier's per-world pack (core + w6 only). Run: node tests/w6.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STREAMS } from '../js/rng.js';
import { prng } from './lib/random-player.mjs';
import { hazardOf, lineMonth, lineValue, MULT, SLOTS } from '../js/worlds/mech/plant.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w6 is not loaded by the engine; ensureWorld loads it; WORLDS stays w1–w4; meta agrees', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w6'), false); assert.throws(() => E.getWorld('w6'), /world_not_loaded/);
  const w = await E.ensureWorld('w6'); assert.equal(w.id, 'w6'); assert.equal(E.getWorld('w6'), w); assert.equal(w.minRules, 6); assert.equal(w.mechanic, 'plant');
  const { metaOf } = await import('../js/worlds/meta.js'); const m = metaOf('w6');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.ranked, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
});

const W6 = E.getWorld('w6'); const CH = W6.characters.map((c) => c.id);
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

await test('start: rules 6; characters as specified (CNC cond 90 / food plant cond 45 + union + contract + 12-month lock / cash only); start equity ₪10–20M', () => {
  assert.equal(E.createGame({ worldId: 'w6', seed: 3, rules: 4 }).rules, 6);
  const o = E.createGame({ worldId: 'w6', charId: 'opseng', seed: 9 }); const ao = o.assets[0];
  assert.equal(ao.op.lk, 'cnc'); assert.equal(ao.op.cond, 90); assert.equal(ao.debt, 3000000); assert.equal(E.metrics(o).goalType, 'netWorth');
  assert.equal(E.metrics(o).worldIndicators.panel.rows[0].hazard, hazardOf(90), 'the operations engineer sees the exact hazard');
  const h = E.createGame({ worldId: 'w6', charId: 'heir', seed: 9 }); const ah = h.assets[0];
  assert.equal(ah.op.cond, 45); assert.ok(ah.op.union); assert.ok(ah.op.contract && ah.op.contract.until === h.month + 17); assert.equal(ah.op.lockUntil, h.month + 12);
  assert.equal(E.metrics(h).worldIndicators.panel.rows[0].hazard, null, 'others see a band only'); assert.ok(['low', 'mid', 'high'].includes(E.metrics(h).worldIndicators.panel.rows[0].hazardBand));
  assert.equal(E.worldAction(h, 'mothball', `${ah.id}:on`).ok, false, 'union lock'); assert.equal(E.worldAction(h, 'sellLine', String(ah.id)).ok, false);
  const t = E.createGame({ worldId: 'w6', charId: 'trader', seed: 9 }); assert.equal(t.assets.length, 0); assert.equal(t.cash, 15000000);
  for (const s of [o, h, t]) { const nw = E.metrics(s).netWorth; assert.ok(nw >= 10e6 && nw <= 25e6, s.charId + ' NW ' + nw); }
});

await test('fixed draws on stream `world`: exactly 6 per payday + 3 per C landing, 0 at init — opposite players stay aligned on every stream', () => {
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w6', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w6', charId: ch, seed: 77 });
    assert.equal(A.rng.world, E.createGame({ worldId: 'w1', seed: 77 }).rng.world, 'init draws 0');
    let paydays = 0, landC = 0; const w0 = A.rng.world; const r = prng(5);
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 2)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const pd0 = A.stats.paydays; E.rollDice(A); E.rollDice(B); paydays += A.stats.paydays - pd0;
      let ea = E.landing(A); let eb = E.landing(B); if (A.pending && A.pending.type === 'mech') landC++;
      let k = 0; while (ea && !A.over && k++ < 10) { const en = ea.options.filter((o) => o.enabled); const o = en.find((x) => x.kind === 'buy' || x.id === 'accept' || x.id === 'counter') || en[Math.floor(r() * en.length)]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (eb && !B.over && k++ < 10) { const en = eb.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'skip', 'ok', 'done'].includes(x.id)) || en[0]; eb = E.choose(B, eb, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break;
      for (const s of STREAMS) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
    const probe = { world: w0 }; const n = SLOTS * paydays + 3 * landC; for (let i = 0; i < n; i++) probe.world = (probe.world + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, probe.world, `${ch}: world stream advanced exactly 6·${paydays} + 3·${landC} times`);
    assert.ok(paydays >= 5, 'paydays ' + paydays);
  }
});

await test('the model: hazard rises as condition falls; maintenance costs now and saves wear; shifts add capacity, wear and fixed costs; operating leverage', () => {
  assert.ok(hazardOf(100) < hazardOf(80) && hazardOf(80) < hazardOf(50) && hazardOf(50) < hazardOf(20)); assert.equal(hazardOf(100), 0.003);
  const st = E.createGame({ worldId: 'w6', charId: 'opseng', seed: 4 }); const a = st.assets[0]; const o = a.op;
  const env = (phase, extra = {}) => ({ month: st.month, phase, ...extra });
  const base = lineMonth(o, a.debt, env('slow'));
  assert.ok(lineMonth({ ...o, maint: 'preventive' }, a.debt, env('slow')).cf < base.cf && lineMonth({ ...o, maint: 'run' }, a.debt, env('slow')).cf > base.cf);
  const s2 = lineMonth({ ...o, shift: 2 }, a.debt, env('exp')); const s1 = lineMonth(o, a.debt, env('exp'));
  assert.ok(s2.util > s1.util && s2.fixed > s1.fixed, 'a boom: a second shift sells more, at higher fixed costs');
  assert.ok(s2.cf > s1.cf, 'and pays in a boom');
  assert.ok(lineMonth({ ...o, shift: 2 }, a.debt, env('rec')).cf < lineMonth(o, a.debt, env('rec')).cf, '… but not in a recession');
  const rec = lineMonth(o, a.debt, env('rec')); const revDrop = 1 - rec.rev / base.rev; const cfDrop = 1 - rec.cf / base.cf;
  assert.ok(cfDrop > revDrop * 2, `operating leverage: revenue −${(revDrop * 100).toFixed(0)}% → cash flow −${(cfDrop * 100).toFixed(0)}%`);
  // valuation: condition and the cycle multiple
  assert.ok(lineValue({ ...o, cond: 90 }, 'slow') > lineValue({ ...o, cond: 40 }, 'slow')); assert.ok(lineValue(o, 'exp') > lineValue(o, 'rec')); assert.ok(MULT.exp > MULT.rec);
  // wear per payday follows the policy
  const mk = (m) => { const s = E.createGame({ worldId: 'w6', charId: 'opseng', seed: 4 }); E.worldAction(s, 'maint', `${s.assets[0].id}:${m}`); for (let i = 0; i < 40 && s.stats.paydays < 6; i++) { E.rollDice(s); let ev = E.landing(s); let k = 0; while (ev && k++ < 8) { const en = ev.options.filter((x) => x.enabled); const x = en.find((y) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(y.id)) || en[0]; ev = E.choose(s, ev, x.id, x.needsQty ? { qty: 1 } : {}).event; } } return s.assets[0].op.cond; };
  const cp = mk('preventive'), cr = mk('run'); assert.ok(cp > cr, `preventive ${cp} > run ${cr}`);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  let zs = 0;
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w6', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    zs += st.actions.filter((a) => a[0] === 'Z').length;
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  assert.ok(zs > 20, 'module actions exercised: ' + zs);
  const st = E.createGame({ worldId: 'w6', charId: 'opseng', seed: 2 }); const n0 = st.actions.length; const id = st.assets[0].id;
  assert.equal(E.worldAction(st, 'maint', `${id}:basic`).ok, false, 'no-op refused'); assert.equal(E.worldAction(st, 'shift', `${id}:4`).ok, false); assert.equal(E.worldAction(st, 'maint', '999:run').ok, false);
  assert.equal(E.worldAction(st, 'pricePlan', '1:premium:budget').ok, false, 'a w5 action does not exist here'); assert.equal(st.actions.length, n0);
  assert.ok(E.worldAction(st, 'shift', `${id}:2`).ok); assert.equal(st.assets[0].op.shift, 2);
  assert.ok(E.worldAction(st, 'leaseback', String(id)).ok); assert.ok(st.assets[0].op.lease > 0); assert.equal(E.worldAction(st, 'leaseback', String(id)).ok, false);
});

await test('C tile (supply contract): 3 sealed draws; decline (the room-timeout safe option) never spends; accept binds 24 months; a stopped line pays the penalty', () => {
  let seen = 0, accepted = 0, penalised = false;
  for (let s = 1; s <= 50 && (seen < 6 || !accepted); s++) {
    const st = E.createGame({ worldId: 'w6', charId: 'opseng', seed: s });
    for (let t = 0; t < 50 && !st.over; t++) {
      E.rollDice(st); let ev = E.landing(st);
      if (st.pending && st.pending.type === 'mech') {
        seen++; assert.equal(st.pending.wr.length, 3); assert.equal(ev.tag, 'חוזה אספקה');
        const dec = ev.options.find((o) => o.id === 'decline'); assert.ok(dec && dec.enabled);
        if (!ev.auto && !accepted) { const a = st.assets.find((x) => 'a' + x.id === ev.data.assetId); ev = E.choose(st, ev, 'accept').event; assert.ok(a.op.contract && a.op.contract.until === st.month + 23); accepted++;
          // force a stop: the contract volume is not delivered → a penalty of 3 × margin per unit
          a.op.downUntil = st.month; const m = lineMonth(a.op, a.debt, { month: st.month, phase: 'slow' }); assert.ok(m.pen > 0 && m.util === 0); penalised = true; a.op.downUntil = 0; }
        else { const c0 = st.cash, l0 = st.loans; ev = E.choose(st, ev, 'decline').event; assert.equal(st.cash, c0); assert.equal(st.loans, l0); }
      }
      let k = 0; while (ev && !st.over && k++ < 8) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'ok', 'done', 'skip', 'decline'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; }
    }
  }
  assert.ok(seen >= 6 && accepted >= 1 && penalised, `seen ${seen}, accepted ${accepted}`);
});

await test('ordered lines: 30 % deposit now, value = deposit and no debt until delivery after 6 months; then the rest becomes the line\'s debt', () => {
  const st = E.createGame({ worldId: 'w6', charId: 'trader', seed: 11 });
  const card = W6.deals.find((c) => c.order); const p = { type: 'deal', card: JSON.parse(JSON.stringify(card)) };
  st.pending = { ...p, id: st.nextEventId++, tile: 'O', pos: st.pos, month: st.month, k0: st.actions.length }; st.phase = 'event';
  const ev = E.currentEvent(st); assert.equal(ev.data.plant.order, true); assert.equal(ev.data.plant.readyIn, 6);
  const buy = ev.options.find((o) => o.kind === 'buy' && o.enabled); E.choose(st, ev, buy.id);
  const a = st.assets[st.assets.length - 1]; assert.equal(a.debt, 0); assert.equal(a.value, card.down); assert.equal(a.op.readyAt, st.month + 6);
  assert.equal(E.metrics(st).assets.find((x) => x.id === 'a' + a.id).cf, 0, 'no output while it is being built');
  let g = 0; while (st.month < a.op.readyAt + 1 && g++ < 200 && !st.over) { E.rollDice(st); let e = E.landing(st); let k = 0; while (e && k++ < 8) { const en = e.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; e = E.choose(st, e, o.id, o.needsQty ? { qty: 1 } : {}).event; } }
  if (st.assets.includes(a)) { assert.equal(a.debt, card.cost - card.down); assert.equal(a.op.readyAt, 0); assert.ok(a.value > card.down); }
});

await test('★★★ star gate (module starGates, generic in the engine): a safety-inspection stop in the last 12 months caps the win at ★★', () => {
  const st = E.createGame({ worldId: 'w6', charId: 'trader', seed: 3 }); st.cash = 120e6; st.savings = 2e6; st.life.goalStreak = 5; st.life.happiness = 90; st.life.happinessBase = 90;
  let r = E.checkEnd(st); assert.equal(r.status, 'won'); assert.equal(r.stars, 3); assert.equal(r.starsBlockedBy, undefined);
  assert.equal(E.metrics(st).worldIndicators.plant.starGate.ok, true);
  st.world.insp = [st.month - 3]; r = E.checkEnd(st); assert.equal(r.stars, 2); assert.equal(r.starsBlockedBy.id, 'inspect12'); assert.equal(E.metrics(st).worldIndicators.plant.inspectStop12, true);
  st.world.insp = [st.month - 12]; r = E.checkEnd(st); assert.equal(r.stars, 3, 'a stop 12 months ago no longer counts');
  const w1 = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 3 }); assert.equal(E.checkEnd(w1), null);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, condition in [0, 100], values format', () => {
  for (let i = 0; i < 8; i++) {
    play({ worldId: 'w6', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.3, maxTurns: 150, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities - (s.world.factorDue || 0));
      for (const a of s.assets) { assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n); if (a.op) assert.ok(a.op.cond >= 0 && a.op.cond <= 100 && a.op.slot >= 0 && a.op.slot < SLOTS); }
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1);
    } });
  }
});

await test('verifier: core bundle + the w6 pack only; a w6 game verifies; dated before RULES6_FROM → bad_world', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE);
  assert.ok(!Object.keys(all.core.files).some((p) => /worlds\/w[56]|mech\//.test(p)), 'no lazy world in the core');
  assert.ok(all.packs.w6 && all.packs.w6.text.length <= MAX_PACK && all.packs.w6.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w6 && all.packs.w6.text.length));
  assert.deepEqual(Object.keys(all.packs.w6.files).sort(), ['worlds/mech/plant.js', 'worlds/w6.js']);
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w6.text); assert.equal(EE.getWorld('w6').id, 'w6');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 8 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w6', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.25, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w6', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w6 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, 6); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w6.text.length} chars · max w6 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
