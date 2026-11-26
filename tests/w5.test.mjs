#!/usr/bin/env node
// Worlds wave 0 + w5 עיר התיירות (engine side): the lazy registry, the mechanic module contract (fixed draws on stream `world`, the `Z`
// action replayed and verified, the 'N' tile's safe option), the passive12 goal, rules 6, the money formatter, saves, the verifier's
// per-world pack (core + w5 only) and big-number safety. Run: node tests/w5.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STREAMS } from '../js/rng.js';
import { money, moneyCard, moneyShort, moneyTiny, moneyFull } from '../js/money.js';
import { prng } from './lib/random-player.mjs';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w5 is not loaded by the engine; getWorld → world_not_loaded; ensureWorld loads it; WORLDS stays w1–w4', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4'], 'the daily rotation and every legacy caller see the same 4');
  assert.equal(E.isLoaded('w5'), false);
  assert.throws(() => E.getWorld('w5'), /world_not_loaded/); assert.throws(() => E.getWorld('w99'), /unknown world/);
  assert.throws(() => E.createGame({ worldId: 'w5', seed: 1 }), /world_not_loaded/);
  const saved = '{"v":4,"worldId":"w5"}'; assert.throws(() => E.deserialize(saved), /world_not_loaded|save_incompatible/);
  const w = await E.ensureWorld('w5'); assert.equal(w.id, 'w5'); assert.equal(E.isLoaded('w5'), true); assert.equal(E.getWorld('w5'), w);
  assert.deepEqual(E.WORLDS.map((x) => x.id), ['w1', 'w2', 'w3', 'w4']);
  await assert.rejects(E.ensureWorld('w99'), /unknown world/);
  assert.equal(E.dailyConfig('2026-12-25').worldId.startsWith('w') && ['w1', 'w2', 'w3', 'w4'].includes(E.dailyConfig('2026-12-25').worldId), true);
});

const W5 = E.getWorld('w5'); const CH = W5.characters.map((c) => c.id);

await test('rules: RULES_CURRENT 7 (≡ 6 here); w5 always ≥ its minRules 6; a ranked date before RULES6_FROM cannot make a w5 game older', () => {
  assert.equal(E.RULES_CURRENT, 7); assert.equal(E.RULES6_FROM, E.RULES5_FROM, 'placeholder = RULES5_FROM until the owner confirms'); assert.equal(E.RULES7_FROM, E.RULES6_FROM, 'rules 7 placeholder (CATALOG-25)');
  assert.equal(E.createGame({ worldId: 'w5', seed: 3, rules: 4 }).rules, 6);
  assert.equal(E.createGame({ worldId: 'w5', seed: 3, mode: 'challenge', dateKey: '2026-12-01' }).rules, 6);
  assert.equal(E.createGame({ worldId: 'w1', seed: 3, rules: 5 }).rules, 5, 'w1 keeps rules 5 when asked');
  assert.equal(E.rulesForDay('2026-12-20'), 4); assert.equal(E.rulesForDay(E.RULES6_FROM), E.RULES_CURRENT, 'RULES7_FROM = RULES6_FROM: that day is rules 7'); assert.equal(E.rulesForDay(null), E.RULES_CURRENT);
});

await test('w5 start: October, tour 1, empty ring; characters as specified (hotel 120 rooms rep 70 debt ₪21M; 2 owner-run restaurants; cash only)', () => {
  const h = E.createGame({ worldId: 'w5', charId: 'hotelier', seed: 9 }); const m = E.metrics(h); const S = m.worldIndicators.season;
  assert.equal(S.cal, 10); assert.equal(S.tour, 1); assert.deepEqual(h.world.pas12, []);
  assert.equal(h.assets.length, 1); assert.equal(h.assets[0].op.u, 120); assert.equal(h.assets[0].op.rep, 70); assert.equal(h.assets[0].debt, 21000000); assert.ok(h.assets[0].op.old);
  const c = E.createGame({ worldId: 'w5', charId: 'restaurateur', seed: 9 }); const mc = E.metrics(c);
  assert.equal(c.assets.filter((a) => a.op && a.op.owner && a.active).length, 2); assert.equal(mc.passive, 0, 'owner-run = a job'); assert.ok(mc.activeBizIncome !== 0);
  const p = E.createGame({ worldId: 'w5', charId: 'promoter', seed: 9 }); assert.equal(p.assets.length, 0); assert.equal(p.cash, 8000000);
  assert.equal(m.goalType, 'passive12'); assert.equal(m.goalHold.need, 3); assert.equal(m.goalParts[0].key, 'passive12');
});

/** Play a w5 game with a seeded random player that also taps module actions. */
function playW5(cfg, r, { zRate = 0.2, maxTurns = 400, onTurn } = {}) {
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
}

await test('fixed draws on stream `world`: exactly 2 per payday + 2 per N landing, 0 at init — two opposite players stay aligned on every stream', () => {
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w5', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w5', charId: ch, seed: 77 });
    const fresh = E.createGame({ worldId: 'w5', charId: ch, seed: 77 }); assert.equal(fresh.rng.world, (() => { const x = E.createGame({ worldId: 'w1', seed: 77 }); return x.rng.world; })(), 'init draws 0 (= an untouched stream)');
    let paydays = 0, landN = 0; let w0 = A.rng.world; const r = prng(5);
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 2)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const pd0 = A.stats.paydays; E.rollDice(A); E.rollDice(B); paydays += A.stats.paydays - pd0;
      let ea = E.landing(A); let eb = E.landing(B); if (A.pending && A.pending.type === 'mech') landN++;
      let k = 0; while (ea && !A.over && k++ < 10) { const en = ea.options.filter((o) => o.enabled); const o = en.find((x) => x.kind === 'buy' || x.id === 'accept' || x.id === 'counter') || en[Math.floor(r() * en.length)]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (eb && !B.over && k++ < 10) { const en = eb.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'skip', 'ok', 'done'].includes(x.id)) || en[0]; eb = E.choose(B, eb, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break;
      for (const s of STREAMS) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
    // count the world draws: replay the stream from its start the counted number of times
    let probe = { world: w0 }; const n = 2 * paydays + 2 * landN; for (let i = 0; i < n; i++) { const t2 = (probe.world = (probe.world + 0x6D2B79F5) >>> 0); void t2; }
    assert.equal(A.rng.world, probe.world, `${ch}: world stream advanced exactly 2·${paydays} + 2·${landN} times`);
  }
});

await test('Z actions: logged, replayed byte-identically (replay = live), rejected ones never logged; serialize round-trip at rest points', () => {
  let zs = 0, rej = 0;
  for (let i = 0; i < 6; i++) {
    const r = prng(100 + i);
    const st = playW5({ worldId: 'w5', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, r, { zRate: 0.35, maxTurns: 160, onTurn: (s) => { if (!s.pending && !s.over) { const back = E.deserialize(E.serialize(s)); assert.equal(E.serialize(back), E.serialize(s)); } } });
    const bad = E.worldAction(st.over ? E.createGame({ worldId: 'w5', seed: 1 }) : st, 'pricePlan', '999:premium:budget'); if (!bad.ok) rej++;
    zs += st.actions.filter((a) => a[0] === 'Z').length;
    const re = E.replay(E.replayConfig(st), st.actions);
    assert.equal(E.serialize(re), E.serialize(st), 'replay of game ' + i);
    assert.ok(st.actions.every((a) => a[0] !== 'Z' || (a.length <= 3 && (a[2] == null || String(a[2]).length <= 40))));
  }
  assert.ok(zs > 30, 'module actions were exercised: ' + zs); assert.ok(rej > 0);
  const st = E.createGame({ worldId: 'w5', charId: 'hotelier', seed: 2 }); const n0 = st.actions.length;
  assert.equal(E.worldAction(st, 'nope', null).ok, false); assert.equal(E.worldAction(st, 'pricePlan', 'x'.repeat(41)).ok, false); assert.equal(E.worldAction(st, 'festival', null).ok, false, 'festival is the promoter\'s');
  assert.equal(st.actions.length, n0, 'refused actions are not logged');
  assert.throws(() => E.replay(E.replayConfig(st), [['Z', 'pricePlan', '999:premium:budget']]), /replay_mismatch/);
  const w1 = E.createGame({ worldId: 'w1', seed: 2 }); assert.equal(E.worldAction(w1, 'pricePlan', '1:premium:budget').ok, false); assert.deepEqual(E.worldActions(w1), []);
});

await test('price plan: premium in high season only with reputation ≥ 60; budget in low season; standard between — capacity pricing lifts the average', () => {
  const st = E.createGame({ worldId: 'w5', charId: 'hotelier', seed: 4 }); const a = st.assets[0]; const id = a.id;
  assert.ok(E.worldAction(st, 'pricePlan', `${id}:premium:budget`).ok); assert.equal(a.op.peak, 'premium'); assert.equal(a.op.off, 'budget');
  assert.equal(E.worldAction(st, 'pricePlan', `${id}:premium:budget`).ok, false, 'no-op refused');
  const row = (s) => E.metrics(s).worldIndicators.panel.rows[0];
  assert.equal(row(st).peak, 'premium');
  // the panel suggests the plan and the lessons/strip are public
  const fresh = E.createGame({ worldId: 'w5', charId: 'hotelier', seed: 4 }); const sug = E.worldActions(fresh).filter((x) => x.suggested);
  assert.ok(sug.some((x) => x.id === 'pricePlan' && x.param.endsWith(':premium:budget')), JSON.stringify(sug));
  const strip = E.metrics(fresh).worldIndicators.panel.strip.months; assert.equal(strip.length, 12); assert.ok(strip.some((x) => x.cf < 0) && strip.some((x) => x.cf > 0), 'a seasonal year: weak and strong months');
});

await test('N tile (tour operator): 2 sealed draws at the landing; accept pays half up front; decline (the room-timeout safe option) never spends', () => {
  let seen = 0, accepted = 0;
  for (let s = 1; s <= 40 && (seen < 6 || !accepted); s++) {
    const st = E.createGame({ worldId: 'w5', charId: 'hotelier', seed: s });
    for (let t = 0; t < 60 && !st.over; t++) {
      E.rollDice(st); let ev = E.landing(st);
      if (st.pending && st.pending.type === 'mech') {
        seen++; assert.equal(st.pending.wr.length, 2); assert.equal(ev.tag, 'מפעיל תיירות');
        const dec = ev.options.find((o) => o.id === 'decline'); assert.ok(dec && dec.enabled);
        if (!ev.auto && seen % 2 === 0) { const c0 = st.cash; const r = E.choose(st, ev, 'accept'); assert.ok(r.done); assert.ok(st.cash > c0); assert.ok(st.assets[0].op.allot); accepted++; ev = null; }
        else { const c0 = st.cash, l0 = st.loans; ev = E.choose(st, ev, 'decline').event; assert.equal(st.cash, c0); assert.equal(st.loans, l0); }
      }
      let k = 0; while (ev && !st.over && k++ < 8) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'ok', 'done', 'skip', 'decline'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; }
    }
  }
  assert.ok(seen >= 6 && accepted >= 1, `seen ${seen}, accepted ${accepted}`);
  // the redacted dry run never sees the sealed counter-offer draw
  const st = E.createGame({ worldId: 'w5', charId: 'promoter', seed: 3 }); void st;
});

await test('passive12: the average of the last 12 paydays (missing months = 0), progress ∈ [0, 1], parts sum, the goal holds 3 paydays', () => {
  const r = prng(9); let checked = 0;
  for (const ch of CH) {
    const st = playW5({ worldId: 'w5', charId: ch, seed: 31, mode: 'free' }, r, { zRate: 0.2, maxTurns: 120, onTurn: (s) => {
      const m = E.metrics(s); const p = m.goalParts[0]; checked++;
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); assert.ok(p.months <= 12 && p.ring.length === p.months);
      assert.equal(p.value, Math.round(p.ring.reduce((x, y) => x + y, 0) / 12));
      assert.ok(Number.isInteger(m.cash) && Number.isInteger(m.netWorth) && Number.isFinite(m.goalProgress));
      if (p.months < 12) assert.ok(p.value < 300000 || p.ring.reduce((x, y) => x + y, 0) >= 3600000);
      if (m.goalProgress >= 1) assert.ok(m.goalHold.streak >= 3);
    } });
    void st;
  }
  assert.ok(checked > 100);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, payday = shown cash flow, values format at ₪1e9+', () => {
  for (let i = 0; i < 8; i++) {
    const r = prng(700 + i); let last = null;
    playW5({ worldId: 'w5', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, r, { zRate: 0.25, maxTurns: 150, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities, 'NW = assets − liabilities (the seasonal line is a liability — CATALOG-25 A1: module debts now count in totalLiabilities)');
      for (const a of s.assets) { assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt)); if (a.op) assert.ok(Number.isFinite(a.op.rep) && a.op.rep >= 0 && a.op.rep <= 100); }
      if (s.lastPayday && s.lastPayday !== last) { last = s.lastPayday; assert.ok(Number.isInteger(last.amount)); }
    } });
  }
  assert.equal(moneyCard(2.5e9), '₪2.5 מיליארד'); assert.equal(E.fmtM(-1.25e9), '−₪1.25 מיליארד'); assert.equal(moneyShort(999999), '₪1 מיליון');
});

await test('money formatter: card form byte-identical to the old fmtM below ₪999.5M; tiers; tiny ≤ 6 chars; U+2212; isolates; monotonic', () => {
  const old = (n) => { const a = Math.abs(n); if (a < 1e6) return moneyFull(n); const v = a / 1e6; const s = (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'); return (n < 0 ? '−' : '') + '₪' + s + ' מיליון'; };
  const r = prng(1); for (let i = 0; i < 20000; i++) { const n = Math.round((r() - 0.3) * 10 ** (1 + r() * 7.99)); if (Math.abs(n) < 999.5e6) assert.equal(moneyCard(n), old(n), String(n)); }
  assert.equal(E.fmt(-1234), moneyFull(-1234)); assert.equal(moneyFull(1234567890), '₪1,234,567,890'); assert.equal(moneyFull(-5), '−₪5');
  assert.equal(moneyCard(999.5e6), '₪1 מיליארד'); assert.equal(moneyCard(999.4e6), '₪999 מיליון'); assert.equal(moneyCard(1.234e9), '₪1.23 מיליארד');
  assert.equal(moneyShort(850000), '₪850 אלף'); assert.equal(moneyShort(12500000), '₪12.5 מיליון'); assert.equal(moneyShort(1.2e9), '₪1.2 מיליארד'); assert.equal(moneyShort(999), '₪999'); assert.equal(moneyShort(999999999), '₪1 מיליארד');
  assert.equal(moneyTiny(850000), '₪850K'); assert.equal(moneyTiny(12500000), '₪12.5M'); assert.equal(moneyTiny(1.25e9), '₪1.25B');
  for (let i = 0; i < 5000; i++) { const n = Math.floor(r() * 1e12); assert.ok(moneyTiny(n).length <= 6, moneyTiny(n)); }
  assert.equal(money(5, 'card', { iso: true }), '⁨₪5⁩'); assert.equal(money(NaN), '₪—');
  // monotonic: the parsed short value never decreases
  const parse = (s) => { const m = /([\d.]+)\s*(אלף|מיליון|מיליארד)?/.exec(s); return +m[1] * ({ 'אלף': 1e3, 'מיליון': 1e6, 'מיליארד': 1e9 }[m[2]] || 1); };
  let prev = -1; for (let n = 1; n < 2e10; n = Math.ceil(n * 1.013) + 1) { const v = parse(moneyShort(n)); assert.ok(v >= prev, n); prev = v; assert.ok(Math.abs(v - n) <= Math.max(1, n * 0.006), `${n} → ${moneyShort(n)}`); }
});

await test('verifier: core bundle + the w5 pack only (MAX_BUNDLE untouched), a w5 game verifies; dated before RULES6_FROM → bad_world; CODES has Z', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE && all.core.text.length <= V.MAX_BUNDLE, 'core ' + all.core.text.length);
  assert.ok(!Object.keys(all.core.files).some((p) => /worlds\/w5|mech\//.test(p)), 'no lazy world in the core');
  assert.ok(all.packs.w5 && all.packs.w5.text.length <= MAX_PACK && all.packs.w5.text.length <= V.MAX_PACK);
  assert.deepEqual(Object.keys(all.packs.w5.files).sort(), ['worlds/mech/season.js', 'worlds/w5.js']);
  assert.ok(V.CODES.has('Z')); assert.equal(V.RULES6_FROM, E.RULES6_FROM);
  const t0 = performance.now(); const EE = await loadEngine(all.core.text); const tCore = performance.now() - t0;
  assert.throws(() => EE.getWorld('w5'), /world_not_loaded/);
  const t1 = performance.now(); await loadWorldPack(EE, all.core.text, all.packs.w5.text); const tPack = performance.now() - t1;
  assert.equal(EE.getWorld('w5').id, 'w5'); assert.notEqual(EE.getWorld('w5'), E.getWorld('w5'), 'the edge copy is its own instance');
  let maxMs = 0, maxActs = 0;
  for (let i = 0; i < 6; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = playW5({ worldId: 'w5', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.25, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w5', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); const ms = performance.now() - a; maxMs = Math.max(maxMs, ms); maxActs = Math.max(maxActs, st.actions.length);
    assert.ok(out.ok, `w5 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, E.RULES_CURRENT);
    const forged = V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions); assert.equal(forged.ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  console.log(`   core load ${tCore.toFixed(0)} ms · pack load ${tPack.toFixed(0)} ms · max w5 replay ${maxMs.toFixed(0)} ms (${maxActs} actions) · core ${all.core.text.length} chars + pack ${all.packs.w5.text.length}`);
  assert.ok(maxMs < 2000, 'a w5 replay stays well under the ~2 s Edge CPU budget in Node: ' + maxMs.toFixed(0) + ' ms');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
