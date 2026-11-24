#!/usr/bin/env node
// w9 מדבר האנרגיה (engine side): lazy registration, the `energy` module contract (fixed draws on stream `world`: 8 at init, 10 per payday,
// 4 per 'V' landing), the shared staged-build core reused with this world's loan gate (a grid slot), the V tile (study / develop / with a
// partner / pass = the safe option), completion into an operating plant (term loan, PPA or merchant), the power market (spot, capture,
// storage spread), DCF value and refinancing, the passiveTarget goal (run-rate operating income after debt service), LP pressure, the
// debt-service squeeze, Z actions replayed and verified, saves, fuzz and the verifier's per-world pack.
// Run: node tests/w9.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { STREAMS } from '../js/rng.js';
import { prng } from './lib/random-player.mjs';
import { equityGap } from '../js/worlds/mech/stages.js';
import { PPA, LTV, TERM, DRAWS, annuity, payment, captureOf, spreadOf, dcfOf, refiRoom, runRate, opIncome } from '../js/worlds/mech/energy.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w9 is not loaded by the engine; ensureWorld loads it; WORLDS stays w1–w4; meta agrees', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w9'), false); assert.throws(() => E.getWorld('w9'), /world_not_loaded/);
  const w = await E.ensureWorld('w9'); assert.equal(w.id, 'w9'); assert.equal(E.getWorld('w9'), w); assert.equal(w.minRules, 6); assert.equal(w.mechanic, 'energy');
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w9');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.ranked, false); assert.equal(m.roomOk, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w6', 'w7', 'w8'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w9', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w8: 1 }), true);
  assert.deepEqual(w.stars, { t2: 68, t3: 56 }); assert.equal(w.maxMonths, 84); assert.deepEqual(w.goal, { type: 'passiveTarget', key: 'opIncome', target: 3500000, hold: 3, label: 'הכנסה תפעולית אחרי החזר חוב' });
  assert.match(readFileSync(new URL('../js/worlds/mech/energy.js', import.meta.url), 'utf8'), /from '\.\/stages\.js'/, 'the build is the shared staged-build core');
});

const W9 = E.getWorld('w9'); const CH = W9.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 10) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const untilMonth = (st, m) => { let g = 0; while (!st.over && st.month < m && g++ < 2000) step(st); };
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
const toV = (st) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 400 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const proj = (st) => st.assets.find((a) => a.op && a.op.ck === 'proj');
const plant = (st) => st.assets.find((a) => a.op && a.op.ck === 'plant');
/** gridEng's starting field (a grid slot already attached), played on until it is an operating plant. */
function withPlant(seed = 21) { const st = E.createGame({ worldId: 'w9', charId: 'gridEng', seed }); st.cash += 40e6; let g = 0; while (!st.over && !plant(st) && g++ < 600) step(st); return st; }

await test('start: rules 6; characters as specified (a 30 MW field with its slot / ₪60M cash / 2 kibbutz parcels and ₪10M); start equity ₪25–60M; goal passiveTarget', () => {
  assert.equal(E.createGame({ worldId: 'w9', seed: 3, rules: 4 }).rules, 6);
  const g = E.createGame({ worldId: 'w9', charId: 'gridEng', seed: 9 }); const r = E.metrics(g).worldIndicators.panel.rows[0];
  assert.equal(g.cash, 25e6); assert.equal(r.tech, 'solar'); assert.equal(r.mw, 30); assert.equal(r.slot, true); assert.equal(r.phase, 'permit'); assert.ok(r.permit.lo >= 1, 'only the public permit range'); { const pa = g.assets.find((a) => a.op && a.op.ck === 'proj'); const wait = pa.op.sb.permitAt - r.permit.from; assert.ok(r.permit.hi - r.permit.lo <= 12 && wait >= r.permit.lo && wait <= r.permit.hi, 'an honest range around the sealed wait, not derived from it'); assert.ok(r.permit.hi - 99 !== wait && r.permit.lo + 99 !== wait); }
  const f = E.createGame({ worldId: 'w9', charId: 'infraFund', seed: 9 }); assert.equal(f.cash, 60e6); assert.equal(f.assets.length, 0);
  const k = E.createGame({ worldId: 'w9', charId: 'kibbutz', seed: 9 }); assert.equal(k.cash, 10e6); assert.equal(E.metrics(k).worldIndicators.energy.sites.length, 2);
  for (const s of [g, f, k]) { const nw = E.metrics(s).netWorth; assert.ok(nw >= 25e6 && nw <= 60e6, s.charId + ' NW ' + nw); }
  const m = E.metrics(f); assert.equal(m.goalType, 'passiveTarget'); assert.equal(m.goalParts[0].key, 'opIncome'); assert.equal(m.goalParts[0].target, 3500000);
});

await test('fixed draws on stream `world`: 8 at init, exactly 10 per payday + 4 per V landing — opposite players stay aligned on every stream', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, V: DRAWS.landing.V }, { init: 8, month: 10, V: 4 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w9', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w9', charId: ch, seed: 77 });
    const w1 = E.createGame({ worldId: 'w1', seed: 77 }).rng.world; const p0 = { world: w1 }; for (let i = 0; i < 8; i++) p0.world = (p0.world + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, p0.world, 'init draws 8');
    let paydays = 0, landV = 0; const w0 = A.rng.world; const r = prng(5);
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled && !['sellPlant', 'sellSlot'].includes(x.id)).slice(0, 2)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const pd0 = A.stats.paydays; E.rollDice(A); E.rollDice(B); paydays += A.stats.paydays - pd0;
      let ea = E.landing(A); const eb = E.landing(B); if (A.pending && A.pending.type === 'mech') landV++;
      let k = 0; while (ea && !A.over && k++ < 10) { const en = ea.options.filter((o) => o.enabled); const o = en.find((x) => x.kind === 'buy' || ['check', 'build', 'partner'].includes(x.id)) || en[Math.floor(r() * en.length)]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, eb);
      if (A.over || B.over) break;
      for (const s of STREAMS) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
    const probe = { world: w0 }; const n = 10 * paydays + 4 * landV; for (let i = 0; i < n; i++) probe.world = (probe.world + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, probe.world, `${ch}: world stream advanced exactly 10·${paydays} + 4·${landV} times`);
    assert.ok(paydays >= 5 && landV >= 2, `paydays ${paydays}, V ${landV}`);
  }
});

await test('V tile: 4 sealed draws; pass (the room-timeout safe option) never spends; the resource study narrows the quality range; develop pays the development fee; a partner pays 49 %', () => {
  let seen = 0, built = 0, duo = 0;
  for (let s = 1; s <= 30 && (seen < 6 || built < 1 || duo < 1); s++) {
    const st = E.createGame({ worldId: 'w9', charId: 'infraFund', seed: s }); st.cash = 300e6;
    for (let n = 0; n < 4 && !st.over; n++) {
      let ev = toV(st); if (!ev) break; seen++; const p = st.pending;
      assert.equal(p.wr.length, 4); assert.equal(ev.tag, 'אתר לפרויקט אנרגיה'); const js = JSON.stringify(ev); assert.ok(!js.includes('"wr"'), 'the event never carries the sealed draws');
      const pass = ev.options.find((o) => o.id === 'pass'); assert.ok(pass && pass.enabled);
      if (n % 3 === 0) { const c0 = st.cash, l0 = st.loans, a0 = st.assets.length; ev = E.choose(st, ev, 'pass').event; assert.equal(st.cash, c0); assert.equal(st.loans, l0); assert.equal(st.assets.length, a0); settle(st, ev); continue; }
      const w0 = ev.data.q.hi - ev.data.q.lo;
      if (ev.options.find((o) => o.id === 'check' && o.enabled)) { const c0 = st.cash; ev = E.choose(st, ev, 'check').event; assert.equal(ev.data.checked, true); assert.ok(ev.data.q.hi - ev.data.q.lo < w0); assert.equal(st.cash, c0 - ev.data.checkFee); }
      const c0 = st.cash; const dev = ev.data.dev; const pick = n % 3 === 1 ? 'build' : 'partner'; ev = E.choose(st, ev, pick).event; const a = st.assets[st.assets.length - 1];
      assert.equal(a.op.ck, 'proj'); assert.equal(a.op.slot, false, 'a new project has no grid slot');
      if (pick === 'build') { assert.equal(st.cash, c0 - dev); assert.equal(a.op.stake, 1); built++; } else { assert.equal(st.cash, c0 - Math.round(dev * 0.51)); assert.equal(a.op.stake, 0.51); duo++; }
      assert.ok(a.op.q >= 0.88 && a.op.q <= 1.12); settle(st, ev);
    }
  }
  assert.ok(seen >= 6 && built >= 1 && duo >= 1, `seen ${seen}, built ${built}, partner ${duo}`);
});

await test('the loan gate is the grid slot: a project without a slot stalls once it builds (no loan, contractor standby), the queued slot arrives and the loan draws', () => {
  const st = E.createGame({ worldId: 'w9', charId: 'kibbutz', seed: 4 }); const site = st.assets.find((a) => a.op.ck === 'site' && a.op.site.tech === 'storage');
  assert.ok(E.worldAction(st, 'develop', String(site.id)).ok); const a = st.assets.find((x) => x.id === site.id); assert.equal(a.op.ck, 'proj'); assert.equal(a.op.sb.equity, a.op.sb.land, 'the kibbutz land counts as equity');
  st.cash = 40e6; const q = E.worldAction(st, 'applySlot'); assert.ok(q.ok); const at = st.world.en.queue[0].at; assert.equal(at, st.month + 9);
  let g = 0; while (!st.over && a.op.sb.phase === 'permit' && g++ < 300) step(st);
  assert.ok(st.month < at, 'the permit came before the slot'); assert.equal(a.op.slot, false);
  const s0 = a.op.sb.stallMonths, c0 = st.cash; step(st); untilMonth(st, st.month + 1);
  assert.equal(a.op.sb.loan, 0, 'no slot → no loan'); assert.ok(a.op.sb.stallMonths > s0, 'the stage stalls on the gate'); assert.ok(st.cash < c0, 'standby costs cash');
  untilMonth(st, at + 1); assert.ok(st.assets.includes(a)); assert.equal(a.op.slot, true, 'the queue slot was consumed by the waiting project'); assert.equal(E.metrics(st).worldIndicators.energy.slots.free, 0);
  untilMonth(st, st.month + 2); assert.ok(a.op.sb.loan > 0, 'with a slot the construction loan draws'); assert.ok(a.op.sb.equity >= a.op.sb.land);
});

await test('completion: the construction loan becomes a floating term loan; PPA at 85 % of the average spot; DCF value; refinancing returns LTV × DCF − debt and raises the debt service', () => {
  const st = withPlant(); const a = plant(st); assert.ok(a, 'a plant'); const o = a.op;
  assert.equal(o.offtake, 'ppa'); assert.equal(o.tenor <= TERM.tenor, true); assert.ok(o.debt > 0); assert.ok(Math.abs(o.ppa - Math.round(PPA.share * st.world.en.avg)) <= 30, `ppa ${o.ppa} vs 0.85 × avg ${st.world.en.avg}`);
  assert.equal(E.metrics(st).worldIndicators.energy.slots.free, 0); assert.ok(!st.assets.some((x) => x.op && x.op.ck === 'slot'), 'the slot was consumed');
  assert.equal(a.value, dcfOf(st, o)); assert.equal(a.debt, o.debt);
  const room = refiRoom(st, o); assert.equal(room, Math.max(0, Math.round((LTV.ppa * dcfOf(st, o) - o.debt) / 1000) * 1000));
  st.world.en.rate = 2.5; // a low rate: the value (and the room) rise
  assert.ok(dcfOf(st, o) > a.value); const room2 = refiRoom(st, o); assert.ok(room2 > room && room2 >= 1e6);
  const rr0 = runRate(st, o), d0 = o.debt, c0 = st.cash; const r = E.worldAction(st, 'refi', String(a.id)); assert.ok(r.ok, r.error);
  assert.equal(st.cash, c0 + room2 - Math.round((d0 + room2) * TERM.fee / 1000) * 1000); assert.equal(o.debt, d0 + room2); assert.ok(runRate(st, o) < rr0, 'more debt → less income after debt service');
  assert.equal(E.worldAction(st, 'refi', String(a.id)).ok, false, 'no room left');
  assert.ok(payment(1e8, 0.005, TERM.tenor + TERM.long) < payment(1e8, 0.005, TERM.tenor), 'a longer tenor lowers the payment'); assert.ok(Math.abs(annuity(0.005, 240) - 139.58) < 0.01);
  assert.equal(E.worldAction(st, 'offtake', `${a.id}:merchant`).ok, false, 'a PPA is never cancelled');
});

await test('the power market: cannibalisation lowers solar capture (rivals\' solar too); storage spread widens; merchant → PPA switch at a 10 % discount', () => {
  const st = withPlant(33); const a = plant(st); const P = st.world.en;
  const c0 = captureOf(st), s0 = spreadOf(st, false); P.mktAdd = (P.mktAdd || 0) + 1500; assert.ok(captureOf(st) < c0, 'more solar on the grid → a lower capture'); assert.ok(spreadOf(st, false) > s0, 'and a wider storage spread');
  a.op.offtake = 'merchant'; a.op.ppa = 0; const mer = runRate(st, a.op);
  assert.ok(E.worldAction(st, 'offtake', `${a.id}:ppa`).ok); assert.equal(a.op.offtake, 'ppa'); assert.ok(Math.abs(a.op.ppa - Math.round(Math.round(PPA.share * P.avg * P.ppaCut) * PPA.switchCut)) <= 1); void mer;
  P.ppaCut = 0.9; assert.ok(E.metrics(st).worldIndicators.energy.ppaNow < Math.round(PPA.share * P.avg), 'the regulator cut lowers new PPAs');
});

await test('goal: run-rate operating income after debt service (plants, your share) − bank-loan interest; hold 3; a sale halves a plant\'s share', () => {
  const st = withPlant(44); const a = plant(st); const ctx = { loanPct: E.loanPct };
  assert.equal(opIncome(st, ctx), runRate(st, a.op)); assert.equal(E.metrics(st).goalParts[0].value, opIncome(st, ctx));
  st.loans += 10e6; assert.equal(opIncome(st, ctx), Math.round(runRate(st, a.op) - st.loans * E.loanPct(st) / 100)); st.loans -= 10e6;
  const full = runRate(st, a.op); assert.ok(E.worldAction(st, 'sellStake', String(a.id)).ok); assert.equal(a.op.stake, 0.51); assert.ok(Math.abs(runRate(st, a.op) - Math.round(full * 0.51 / 10) * 10) <= 10);
  assert.equal(E.worldAction(st, 'sellStake', String(a.id)).ok, false, 'one stake sale per asset');
  assert.equal(W9.goal.hold, 3);
});

await test('the fund\'s LP pressure: 6 % of its equity every 12 paydays (a forced outflow)', () => {
  const st = E.createGame({ worldId: 'w9', charId: 'infraFund', seed: 6 }); let g = 0, cash11 = null, nw11 = null;
  while (!st.over && st.stats.paydays < 12 && g++ < 400) { if (st.stats.paydays === 11 && cash11 == null) { cash11 = st.cash; nw11 = E.metrics(st).netWorth; } step(st); }
  assert.ok(st.world.en.lpPaid >= 3.6e6, 'paid ' + st.world.en.lpPaid); assert.equal(st.world.en.lpNext, 24); void cash11; void nw11;
  const k = E.createGame({ worldId: 'w9', charId: 'kibbutz', seed: 6 }); untilMonth(k, 14); assert.equal(k.world.en.lpPaid, 0);
});

await test('the debt-service squeeze: plants below their debt service while forced bank debt is past the cap — 3 paydays within 6 → bankruptcy', () => {
  const st = withPlant(55); const a = plant(st); a.op.debt *= 6; st.loans = 200e6; st.cash = 0; let g = 0;
  while (!st.over && g++ < 200) step(st);
  assert.ok(st.over && st.result.reason === 'bankrupt', 'bankrupt: ' + (st.result && st.result.reason)); assert.ok(st.world.en.squeezes >= 1);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  let zs = 0;
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w9', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    zs += st.actions.filter((a) => a[0] === 'Z').length;
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  assert.ok(zs > 20, 'module actions exercised: ' + zs);
  const st = E.createGame({ worldId: 'w9', charId: 'gridEng', seed: 2 }); const n0 = st.actions.length; const id = st.assets[0].id;
  assert.equal(E.worldAction(st, 'offtake', `${id}:spot`).ok, false); assert.equal(E.worldAction(st, 'offtake', `${id}:ppa`).ok, false, 'already PPA'); assert.equal(E.worldAction(st, 'presale', `${id}:40`).ok, false, 'a w8 action does not exist here');
  assert.equal(E.worldAction(st, 'refi', String(id)).ok, false, 'a project cannot be refinanced'); assert.equal(st.actions.length, n0);
  assert.ok(E.worldAction(st, 'offtake', `${id}:merchant`).ok); assert.equal(st.assets[0].op.offtake, 'merchant'); assert.ok(E.worldAction(st, 'pause', String(id)).ok);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1]', () => {
  for (let i = 0; i < 8; i++) {
    play({ worldId: 'w9', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.3, maxTurns: 150, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); assert.ok(Number.isInteger(m.goalParts[0].value));
    } });
  }
});

await test('verifier: core bundle + the w9 pack only (energy + the shared stages core); a w9 game verifies; dated before RULES6_FROM → bad_world', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE);
  assert.ok(all.packs.w9 && all.packs.w9.text.length <= MAX_PACK && all.packs.w9.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w9 && all.packs.w9.text.length));
  assert.deepEqual(Object.keys(all.packs.w9.files).sort(), ['worlds/mech/energy.js', 'worlds/mech/stages.js', 'worlds/w9.js']);
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w9.text); assert.equal(EE.getWorld('w9').id, 'w9');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 10 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w9', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.25, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w9', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w9 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, E.RULES_CURRENT); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w9.text.length} chars · max w9 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
