#!/usr/bin/env node
// w16 ארץ השדות (engine side): lazy registration, the rule adapter `harvest` (fixed draws on stream `world`: 10 at init, 12 per payday, 2 per
// 'H' landing), the crop calendar, a sealed yield per field shown as a range that contains it and narrows to harvest, commodity prices and
// the harvest future (settles at the fair price; the crop sells at the local price with the harvest dip), hedges with initial / maintenance
// margin, calls and forced liquidation (→ the goal's noDefault 'margin' part), the over-hedge buy-back in a drought, the silo, land / lease /
// mortgage, the produce-exchange card (an export contract / water rights; decline is safe), the goal (passive12 of farm income incl. hedge
// P&L and silo sales, less bank-loan interest), Z actions replayed and verified, saves, fuzz, the public view, the pack.
// Run: node tests/w16.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, CROPS, HV, REG, LEVELS, rangeOf, futOf, fairOf, spotOf, costOf, landValue, worthOf } from '../js/worlds/adapters/harvest.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w16 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 8, 1 of w9/w10); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w16'), false); assert.throws(() => E.getWorld('w16'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'qty_hedge'), false);
  const w = await E.ensureWorld('w16'); assert.equal(w.id, 'w16'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'harvest'); assert.deepEqual(w.modules, ['harvest']); assert.deepEqual(w.mech[0].uses, ['season', 'market', 'portfolio']);
  for (const id of ['qty_hedge', 'hedge_margin']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w16');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 8); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w9', 'w10'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w16', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w9: 1 }), true); assert.equal(isUnlockedBy('w16', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w13: 1 }), false);
});

const W = E.getWorld('w16'); const CH = W.characters.map((c) => c.id);

const cal = (m) => ((m - 1 + 8) % 12) + 1; // the world starts in September
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
const wheatSlot = (st) => st.world.harvest.slots.findIndex((s) => s && s.crop === 'wheat' && s.ph === 'grow');

await test('start: rules 7; equity ₪100–250M; the goal is passive12 ₪5M + 12 paydays without a forced margin liquidation, hold 2; the calendar starts in September; cotton a month from harvest, wheat sown in November', () => {
  assert.equal(E.createGame({ worldId: 'w16', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal, { type: 'all', hold: 2, of: [{ type: 'passive12', target: 5000000, window: 12 }, { type: 'noDefault', months: 12, key: 'margin', label: 'חודשים בלי סגירה בכוח של גידור' }] });
  for (const ch of CH) { const st = E.createGame({ worldId: 'w16', charId: ch, seed: 9 }); const m = E.metrics(st); const F = st.world.harvest;
    assert.ok(m.netWorth >= 100e6 && m.netWorth <= 250e6, ch + ' equity ' + m.netWorth); assert.equal(m.worldIndicators.panel.id, 'harvest');
    assert.deepEqual(m.goalParts.map((p) => p.key), ['passive12', 'noDefault:margin']);
    const cot = F.slots.find((s) => s && s.crop === 'cotton'); assert.equal(cot.ph, 'grow'); assert.equal(cot.harvM, 2); assert.equal(cal(cot.harvM), 10);
    const wh = F.slots.find((s) => s && s.crop === 'wheat'); assert.equal(wh.ph, 'idle'); untilMonth(st, 4); assert.equal(wh.ph, 'grow'); assert.equal(cal(wh.sowM), CROPS.wheat.sow); assert.equal(wh.harvM - wh.sowM, CROPS.wheat.grow); }
  assert.equal(E.createGame({ worldId: 'w16', charId: 'moshavFarmer', seed: 9 }).world.harvest.quota, 0.85); assert.equal(E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 9 }).world.harvest.slots[0].own, 0);
});

await test('fixed draws on stream `world`: 10 at init, exactly 12 per payday + 2 per H landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, H: DRAWS.landing.H }, { init: 10, month: 12, H: 2 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w16', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w16', charId: ch, seed: 77 }); let hA = 0;
    for (let t = 0; t < 120 && !A.over && !B.over; t++) {
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); const b = E.landing(B); if (A.pending && A.pending.type === 'mech') hA++;
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'accept') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, b); for (const x of E.worldActions(A).filter((q) => q.enabled && q.id !== 'sellLand')) { if (A.over) break; E.worldAction(A, x.id, x.param); }
      assert.deepEqual(A.rng, B.rng, `${ch} turn ${t}`);
    }
    assert.ok(hA > 0);
  }
});

await test('yield: sealed at sowing, the shown range contains it and narrows every month to harvest (the agronomist sees 30 % narrower); the truth is not shown', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 12 }); untilMonth(st, 4); const i = wheatSlot(st); const s = st.world.harvest.slots[i]; let w0 = Infinity;
  for (let m = 4; m < s.harvM && !st.over; m++) { untilMonth(st, m); const R = rangeOf(st, s); const truth = s.E * s.wf * s.u; assert.ok(R.lo <= truth + 1 && truth <= R.hi + 1, `month ${m}: ${R.lo} ≤ ${truth} ≤ ${R.hi}`); const w = (R.hi - R.lo) / (s.E * s.wf); assert.ok(w <= w0 + 1e-9); w0 = w; }
  const a = E.createGame({ worldId: 'w16', charId: 'agronomist', seed: 12 }); const sa = a.world.harvest.slots[0]; const sb = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 12 }); const sf = sb.world.harvest.slots[0];
  for (const x of [sa, sf]) { x.u = 1; x.j = 0.5; x.harvM = x.sowM + 6; } const wa = rangeOf(a, sa), wf = rangeOf(sb, sf); assert.ok(Math.abs((wa.hi - wa.lo) / sa.E - 0.7 * (wf.hi - wf.lo) / sf.E) < 0.002);
  const js = JSON.stringify(E.metrics(st).worldIndicators); assert.ok(!js.includes('"u"') && !js.includes('"j"'), 'no sealed factor in the indicators');
});

await test('prices: the harvest future at 0 months = the fair price; the crop sells at the fair price less the harvest dip (−15 % in the harvest month, −7 % the month after); a drought cuts thirsty yields and lifts prices', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agronomist', seed: 5 });
  for (const c of Object.keys(CROPS)) { assert.equal(futOf(st, c, 0), fairOf(st, c)); assert.ok(Number.isInteger(futOf(st, c, 6))); }
  const hc = (c) => (CROPS[c].sow - 1 + CROPS[c].grow) % 12 + 1;
  assert.equal(spotOf(st, 'cotton', { calOf: () => hc('cotton') }), Math.round(fairOf(st, 'cotton') * HV.dip)); assert.equal(spotOf(st, 'cotton', { calOf: () => hc('cotton') % 12 + 1 }), Math.round(fairOf(st, 'cotton') * HV.dip2)); assert.equal(spotOf(st, 'cotton', { calOf: () => 1 }), fairOf(st, 'cotton'));
  const F = st.world.harvest; F.regime = 'drought'; F.rMin = 9; const s = F.slots[0]; const w0 = s.wf; const p0 = F.px.cotton; F.px.cotton = CROPS.cotton.px; untilMonth(st, 2);
  assert.ok(s.wf < w0 || s.ph !== 'grow'); assert.ok(F.px.cotton !== p0); assert.ok(REG.drought && CROPS.cotton.reg.drought > 1);
});

await test('hedge: lock a level of the expected yield at the future, post 8 % initial margin; marked monthly; under 5 % a call tops it up; without cash the broker closes it (forced) → the goal\'s noDefault part restarts', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 21 }); untilMonth(st, 4); const F = st.world.harvest; const i = wheatSlot(st); const s = F.slots[i]; const R = rangeOf(st, s);
  const f = futOf(st, 'wheat', s.harvM - st.month); const c0 = st.cash; assert.ok(E.worldAction(st, 'hedge', `${i}:0.5`).ok);
  const q = Math.round(0.5 * R.mid); assert.equal(s.h.q, q); assert.equal(s.h.lock, f); assert.equal(c0 - st.cash, Math.round(HV.im * q * f)); assert.equal(E.worldAction(st, 'hedge', `${i}:0.3`).ok, false);
  F.px.wheat = Math.round(F.px.wheat * 1.6); const calls0 = F.calls; untilMonth(st, st.month + 1); assert.ok(F.calls > calls0, 'a margin call'); assert.equal(F.forced, 0);
  F.px.wheat = Math.round(F.px.wheat * 1.8); st.cash = 0; untilMonth(st, st.month + 1); assert.equal(F.forced, 1); assert.equal(s.h, null); assert.equal(F.lastMargin, st.stats.paydays);
  const part = E.metrics(st).goalParts.find((p) => p.key === 'noDefault:margin'); assert.equal(part.value, 0);
});

await test('harvest: the hedge settles at the fair price into the month\'s income (goal accrual); an over-hedge in a drought buys the shortfall back at a loss; the crop sells at the local price or goes to the silo', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 31 }); untilMonth(st, 4); const F = st.world.harvest; const i = wheatSlot(st); const s = F.slots[i];
  st.cash += 50000000; assert.ok(E.worldAction(st, 'hedge', `${i}:1`).ok); F.regime = 'drought'; F.rMin = 20; s.wf = 0.6; untilMonth(st, s.harvM - 1); assert.ok(s.h);
  const q = s.h.q, lock = s.h.lock; untilMonth(st, s.harvM); const fair = fairOf(st, 'wheat');
  assert.equal(s.h, null); assert.ok(F.harvests >= 1); assert.equal(F.acc, Math.round((lock - fair) * q)); if (fair > lock) { assert.ok(F.buyLoss > 0); assert.ok(F.overDrought >= 1); }
  assert.ok(F.silo.some((b) => b.c === 'wheat' && b.m === st.month), 'the wheat waits in the silo'); assert.equal(E.metrics(st).goalPassive - E.metrics(st).passive, F.acc - Math.round(st.loans * E.loanPct(st) / 100));
});

await test('silo: 1.5 % a month spoils; selling between rolls pays cash now and counts in the next payday\'s goal income; avocado is not storable', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agronomist', seed: 41 }); untilMonth(st, 2); const F = st.world.harvest; assert.ok(F.silo.length >= 1); const t0 = F.silo[0].t; untilMonth(st, 3);
  assert.equal(F.silo[0].t, Math.round(t0 * (1 - HV.spoil))); const c0 = st.cash; const t = F.silo.filter((b) => b.c === 'cotton').reduce((x, b) => x + b.t, 0); assert.ok(E.worldAction(st, 'sell', 'cotton').ok);
  assert.ok(st.cash > c0); assert.equal(F.accNext, st.cash - c0); assert.equal(F.silo.length, 0); assert.ok(t > 0); assert.equal(E.worldAction(st, 'sell', 'cotton').ok, false); assert.equal(CROPS.avo.store, 0);
});

await test('land: buy (40 % down, the rest a mortgage = a liability) once in 15 months, lease once in 30; sell an idle owned field; costs and the land value follow', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 51 }); const F = st.world.harvest; const nw0 = E.metrics(st).netWorth; const c0 = costOf(st); const lv0 = landValue(st);
  assert.ok(E.worldAction(st, 'buyLand', 'wheat').ok); assert.equal(F.debt, Math.round(HV.land * (1 - HV.down))); assert.equal(landValue(st) - lv0, HV.land); assert.ok(Math.abs(E.metrics(st).netWorth - nw0) <= 1000, 'cash + land − mortgage');
  assert.equal(E.worldAction(st, 'buyLand', 'wheat').ok, false); assert.ok(E.worldAction(st, 'lease', 'wheat').ok); assert.equal(E.worldAction(st, 'lease', 'wheat').ok, false); assert.ok(costOf(st) > c0);
  const i = F.slots.findIndex((s) => s && s.own && s.ph === 'idle'); const d0 = F.debt; assert.ok(E.worldAction(st, 'sellLand', String(i)).ok); assert.ok(F.debt < d0); assert.equal(F.slots[i], null);
  assert.equal(E.worldAction(st, 'sellLand', '0').ok, false, 'a growing field cannot be sold');
});

await test('produce exchange card: an export contract (a fixed price above the future, no margin; the shortfall is bought at +10 %); water rights (+10 % quota); decline (the safe option) spends nothing', () => {
  const st = E.createGame({ worldId: 'w16', charId: 'agronomist', seed: 61 }); const ev = toH(st, 'water'); assert.ok(ev); const c0 = st.cash; const q0 = st.world.harvest.quota;
  E.choose(st, E.currentEvent(st), 'decline'); assert.equal(st.cash, c0);
  const b = E.createGame({ worldId: 'w16', charId: 'agronomist', seed: 61 }); const e2 = toH(b, 'water'); b.cash += 40000000; const c1 = b.cash; E.choose(b, E.currentEvent(b), 'accept'); assert.equal(c1 - b.cash, e2.data.price); assert.equal(b.world.harvest.quota, Math.round((q0 + HV.water) * 100) / 100);
  const x = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 63 }); const e3 = toH(x, 'export'); if (e3) { const d = e3.data; const cx = x.cash; E.choose(x, E.currentEvent(x), 'accept'); assert.equal(x.cash, cx, 'no margin'); assert.deepEqual(x.world.harvest.slots[d.slot].exp, { q: d.q, px: d.px }); assert.ok(d.k > 1); }
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w16', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w16', charId: 'agriFund', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['hedge', '9:1'], ['hedge', '0:0.33'], ['crop', '0:rice'], ['sell', 'wheat'], ['repay', null], ['insure', '5']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'store', '0:0').ok); assert.equal(st.actions.length, n0 + 1); assert.ok(LEVELS.includes(0.75));
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1], margin balances and silo ≥ 0', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w16', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities', 'goalPassive']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const F = s.world.harvest; assert.ok(Number.isInteger(worthOf(s)) && F.silo.every((b) => b.t >= 0) && Number.isFinite(F.usd));
      for (const x of F.slots) if (x && x.h) assert.ok(Number.isInteger(x.h.M) && x.h.q > 0);
    } });
  }
});

await test('rooms: the public view carries no sealed value (the yield factors, their jitters, init draws, the landing draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w16', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 });
    const js = JSON.stringify(E.publicView(st)); for (const k of ['"u"', '"j"', '"inits"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the adapter (≤ 350 lines, uses:); the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w16 pack (the world and its adapter); a w16 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w16; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w16.js', 'worlds/adapters/harvest.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w16 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w16').id, 'w16');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w16', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w16', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w16 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
