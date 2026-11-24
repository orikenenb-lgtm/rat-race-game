#!/usr/bin/env node
// w15 מגדלי הענן (engine side): lazy registration, the new `platform` module (fixed draws on stream `world`: 4 at init, 4 per payday, 2 per
// 'H' landing; the `market` module's regime table reused), cohorts with a sealed retention revealed month by month, channels with saturation,
// the team's capacity, the network effect, valuation = the regime multiple × ARR, rounds that sell % at today's multiple (bubble premium,
// winter discount, the ratchet), the emergency round, venture debt and its covenant, the investor card (term sheet / a giant's buyout = the
// proceeds count as your stake value), the goal (stake value + runway), Z actions replayed and verified, saves, fuzz, the public view, the pack.
// Run: node tests/w15.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, MULT, PF, LEVELS, CHANNELS, usersOf, mrrOf, evOf, stakeValue, runwayOf, cacOf, capOf, retEst, cfOf } from '../js/worlds/mech/platform.js';
import { REGIMES } from '../js/worlds/mech/market.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w15 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 8, 1 of w10/w13); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w15'), false); assert.throws(() => E.getWorld('w15'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'ltv_cac'), false);
  const w = await E.ensureWorld('w15'); assert.equal(w.id, 'w15'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'platform'); assert.deepEqual(w.modules, ['platform']); assert.deepEqual(w.mech[0].uses, ['market']);
  for (const id of ['ltv_cac', 'dilution']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w15');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 8); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w10', 'w13'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w15', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w13: 1 }), true);
  assert.deepEqual(Object.keys(MULT).sort(), Object.keys(REGIMES).sort(), 'a multiple for every market regime');
});

const W = E.getWorld('w15'); const CH = W.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['decline', 'pass', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const untilMonth = (st, m) => { let g = 0; while (!st.over && st.month < m && g++ < 3000) step(st); };
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
const toH = (st, kind) => { for (let g = 0; g < 600 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech' && (!kind || (st.pending.item && st.pending.item.kind === kind))) return ev; settle(st, ev); } return null; };

await test('start: rules 7; your stake ≈ ₪95–250M at the growth multiple; the goal is stake value ₪800M + 12 months of runway, hold 3; solo 70 %, big tech 45 %, the bootstrapper 100 % and profitable', () => {
  assert.equal(E.createGame({ worldId: 'w15', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal, { type: 'all', hold: 3, of: [{ type: 'modValue', key: 'stakeValue', target: 800000000, label: 'שווי החלק שלך בחברה' }, { type: 'liquidity', months: 12, label: 'חודשי מזומן (או רווח)' }] });
  const stakes = { soloFounder: 0.7, bigTechExec: 0.45, bootstrapper: 1 };
  for (const ch of CH) { const st = E.createGame({ worldId: 'w15', charId: ch, seed: 9 }); const m = E.metrics(st); const F = st.world.pf; const sv = Math.round(F.stake * (MULT.growth * 12 * mrrOf(st) + st.cash)); // at the growth multiple (the start regime is drawn)
    assert.equal(F.stake, stakes[ch]); assert.ok(sv >= 90e6 && sv <= 250e6, ch + ' stake value ' + sv); assert.equal(m.worldIndicators.panel.id, 'platform');
    assert.deepEqual(m.goalParts.map((p) => p.key), ['stakeValue', 'liquidity']); assert.equal(evOf(st), Math.round(MULT[st.world.pf.regime] * 12 * mrrOf(st) / 1000) * 1000); }
  const b = E.createGame({ worldId: 'w15', charId: 'bootstrapper', seed: 9 }); assert.ok(cfOf(b) > 0 && runwayOf(b) === 99);
  const s = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 9 }); assert.ok(cfOf(s) < 0 && runwayOf(s) > 6 && runwayOf(s) < 40);
});

await test('fixed draws on stream `world`: 4 at init, exactly 4 per payday + 2 per H landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, H: DRAWS.landing.H }, { init: 4, month: 4, H: 2 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w15', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w15', charId: ch, seed: 77 }); let hA = 0;
    for (let t = 0; t < 120 && !A.over && !B.over; t++) {
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); const b = E.landing(B); if (A.pending && A.pending.type === 'mech') hA++;
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'accept') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, b); for (const x of E.worldActions(A).filter((q) => q.enabled && q.id !== 'pivot')) E.worldAction(A, x.id, x.param);
      assert.deepEqual(A.rng, B.rng, `${ch} turn ${t}`);
    }
    assert.ok(hA > 0);
  }
});

await test('cohorts: a sealed retention per cohort; the shown range contains it and narrows with every month of data; the guide plans with the low end', () => {
  const st = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 12 }); untilMonth(st, 10); const F = st.world.pf;
  const rows = E.metrics(st).worldIndicators.panel.rows; assert.ok(rows.length >= 8);
  for (const r of rows) { const c = F.coh.find((x) => x.m === r.m); assert.ok(r.lo <= c.ret + 1e-9 && c.ret <= r.hi + 1e-9, `cohort ${r.m}`); }
  const young = rows[rows.length - 1], old = rows.find((r) => r.months >= 6); assert.ok(old.hi - old.lo < young.hi - young.lo, 'older cohorts are known better');
  assert.ok(retEst(st) <= Math.max(...F.coh.slice(-4).map((c) => c.ret)));
  assert.ok(!JSON.stringify(E.metrics(st).worldIndicators).includes('"ret"'), 'the truth is not shown');
});

await test('channels: CAC rises with spend (saturation), the users (market size) and the rival; the team caps the level (1, +1 every 18 months; +1 for big tech); network effect at 2M users', () => {
  const st = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 5 });
  for (const C of CHANNELS) assert.ok(cacOf(st, C.id, LEVELS[1]) < cacOf(st, C.id, LEVELS[3]));
  assert.equal(capOf(st), 1); assert.equal(E.worldAction(st, 'spend', 'search:3').ok, false); assert.ok(E.worldAction(st, 'spend', 'search:1').ok); assert.equal(E.worldAction(st, 'spend', 'bogus:1').ok, false);
  assert.equal(capOf(E.createGame({ worldId: 'w15', charId: 'bigTechExec', seed: 5 })), 2); untilMonth(st, 19); assert.equal(capOf(st), 2);
  const c0 = cacOf(st, 'search', LEVELS[1]); st.world.pf.rival += 0.2; assert.ok(cacOf(st, 'search', LEVELS[1]) > c0);
  assert.equal(PF.net, 2000000);
});

await test('rounds: sell % at today\'s multiple (bubble ×1.15, winter ×0.7), one in 6 months; a down round triggers the ratchet; cash < 0 → an emergency round at 60 %', () => {
  const st = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 21 }); const F = st.world.pf; untilMonth(st, 3);
  F.regime = 'growth'; const pre = evOf(st) + st.cash - F.debt; const c0 = st.cash; assert.ok(E.worldAction(st, 'raise', 'm').ok);
  assert.equal(st.cash - c0, Math.round(pre * PF.raise.m / (1 - PF.raise.m) / 1000) * 1000); assert.equal(F.stake, Math.round(0.7 * 0.85 * 10000) / 10000); assert.equal(E.worldAction(st, 'raise', 's').ok, false);
  const b = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 21 }); untilMonth(b, 3); b.world.pf.regime = 'bubble'; const pb = evOf(b) + b.cash; const cb = b.cash; E.worldAction(b, 'raise', 's'); assert.equal(b.cash - cb, Math.round(pb * 1.15 * 0.08 / 0.92 / 1000) * 1000);
  const w = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 21 }); untilMonth(w, 3); w.world.pf.regime = 'recession'; w.world.pf.lastPost = 10e9; const s0 = w.world.pf.stake; E.worldAction(w, 'raise', 's');
  assert.ok(w.world.pf.stake < s0 * 0.92 - 1e-6 && w.world.pf.ratchets === 1, 'the ratchet takes more than the round');
  const e = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 21 }); untilMonth(e, 2); e.cash = -1000000; const s1 = e.world.pf.stake; untilMonth(e, e.month + 1); assert.equal(e.world.pf.crunches, 1); assert.ok(e.world.pf.stake < s1);
});

await test('venture debt: ₪20M at 1 % a month while runway ≥ 6; below the covenant the lender takes 3 % a month; it counts as a liability', () => {
  const st = E.createGame({ worldId: 'w15', charId: 'bigTechExec', seed: 31 }); const F = st.world.pf; const nw = E.metrics(st).netWorth;
  assert.ok(E.worldAction(st, 'debt').ok); assert.equal(F.debt, PF.debt); assert.ok(Math.abs(E.metrics(st).netWorth - nw) <= 1000, 'cash in, liability in'); assert.equal(E.worldAction(st, 'debt').ok, false);
  st.cash = 1000000; const s0 = F.stake; untilMonth(st, st.month + 1); assert.ok(F.breaches >= 1 && F.stake < s0);
});

await test('investor card: a term sheet sells % at k × the market; a giant\'s buyout pays your part in cash and that is your stake value from then on; decline (the safe option) spends nothing', () => {
  const st = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 41 }); const ev = toH(st, 'term'); assert.ok(ev);
  const d = ev.data; assert.equal(d.kind, 'term'); const c0 = st.cash; const s0 = st.world.pf.stake; E.choose(st, ev, 'accept'); assert.equal(st.cash - c0, d.amount); assert.equal(st.world.pf.stake, Math.round(s0 * (1 - d.pct) * 10000) / 10000);
  const b = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 43 }); const eb = toH(b, 'buyout'); assert.ok(eb); const mine = eb.data.mine;
  const cd = b.cash; E.choose(b, E.currentEvent(b), 'decline'); assert.equal(b.cash, cd);
  const b2 = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 43 }); const e2 = toH(b2, 'buyout'); E.choose(b2, e2, 'accept'); assert.equal(b2.cash, e2.data.mine); assert.equal(stakeValue(b2), e2.data.mine); assert.equal(runwayOf(b2), 99); void mine;
  assert.equal(E.worldActions(b2).length, 0, 'no company, no levers'); const m = b2.month; untilMonth(b2, m + 2); assert.equal(stakeValue(b2), e2.data.mine);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w15', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w15', charId: 'soloFounder', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['spend', 'tv:9'], ['raise', 'xl'], ['repayDebt', null], ['spend', 'social:3']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'spend', 'tv:1').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1], stake in (0, 1], users ≥ 0', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w15', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const F = s.world.pf; assert.ok(F.stake > 0 && F.stake <= 1 && usersOf(s) >= 0 && Number.isInteger(stakeValue(s)) && Number.isFinite(runwayOf(s)));
    } });
  }
});

await test('rooms: the public view carries no sealed value (product quality, cohort retention, jitters, init draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w15', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 });
    const js = JSON.stringify(E.publicView(st)); for (const k of ['"q"', '"ret"', '"j"', '"inits"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the module; the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w15 pack (the world, its module and the market regimes it reuses); a w15 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w15; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w15.js', 'worlds/mech/platform.js', 'worlds/mech/market.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w15 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w15').id, 'w15');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w15', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w15', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w15 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
