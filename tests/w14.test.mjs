#!/usr/bin/env node
// w14 רובע הבנקים (engine side): lazy registration, the module `credit` (fixed draws on stream `world`: 0 at init, 7 per payday — one default
// draw per segment, one confidence draw, one draw of the credit cycle everyone shares — and 3 per 'J' landing), the binding capital ratio, the
// inherited book, adverse selection on price (new-loan volume AND quality, and the good floating-rate borrowers refinancing away from a bank
// priced above the market), the credit crunch nobody can price away, the regulator (→ the goal's noDefault 'regulator' part), confidence and
// runs (the central-bank window first, then a fire sale), the 'J' offer (a credit committee narrows the sealed quality; a purchase discount is
// a credit mark, not a day-one gain; a failed rival's deposits run hot), Z actions replayed and verified, saves, fuzz, the public view, the pack.
// Run: node tests/w14.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, SEGS, SEG, SEL, CRUNCH, REG, LEGACY, capRatio, ownerEquity, loans, rwa, pdNewOf, volOf, pdBand } from '../js/worlds/mech/credit.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w14 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 8, 1 of w9/w10); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w14'), false); assert.throws(() => E.getWorld('w14'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'adverse_selection'), false);
  const w = await E.ensureWorld('w14'); assert.equal(w.id, 'w14'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'credit'); assert.deepEqual(w.modules, ['credit']);
  for (const id of ['bank_run', 'adverse_selection', 'maturity_mismatch']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w14');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 8); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w9', 'w10'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w14', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1 }), true); assert.equal(isUnlockedBy('w14', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w13: 1 }), false);
});

const W = E.getWorld('w14'); const CH = W.characters.map((c) => c.id);
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
const toJ = (st, kind) => { for (let g = 0; g < 900 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech' && st.pending.offer && (!kind || st.pending.offer.kind === kind)) return ev; settle(st, ev); } return null; };

await test('start: rules 7; your stake ₪150–250M in a bank whose capital binds (ratio 9–15 %); the inherited book; the goal is equity ₪700M + capital ratio 10 % + 12 paydays without the regulator, hold 3', () => {
  assert.equal(E.createGame({ worldId: 'w14', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => g.type + ':' + (g.key || '')), ['modValue:equity', 'modValue:capRatio', 'noDefault:regulator']); assert.equal(W.goal.hold, 3); assert.equal(W.goal.of[0].target, 700e6);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w14', charId: ch, seed: 9 }); const m = E.metrics(st); const B = st.world.cr;
    assert.ok(ownerEquity(st) >= 150e6 && ownerEquity(st) <= 250e6, ch + ' equity ' + ownerEquity(st)); const cr = capRatio(st); assert.ok(cr >= 0.085 && cr <= 0.15, ch + ' ratio ' + cr);
    assert.equal(m.worldIndicators.panel.id, 'credit'); assert.deepEqual(m.goalParts.map((p) => p.key), ['equity', 'capRatio', 'noDefault:regulator']);
    for (const k of SEGS) { assert.equal(B.seg[k].leg, B.seg[k].book); assert.equal(B.seg[k].delta, 1.5); } assert.equal(B.liq, 'low');
    assert.equal(loans(st) - B.prov + B.liqA, B.ret + B.wh + B.eq + B.cbw, 'the balance sheet balances'); }
});

await test('fixed draws on stream `world`: 0 at init, exactly 7 per payday + 3 per J landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, J: DRAWS.landing.J }, { init: 0, month: 7, J: 3 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w14', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w14', charId: ch, seed: 77 }); let jA = 0;
    for (let t = 0; t < 110 && !A.over && !B.over; t++) {
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); const b = E.landing(B); if (A.pending && A.pending.type === 'mech') jA++;
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'buy') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, b); for (const x of E.worldActions(A).filter((q) => q.enabled && ['price', 'liq', 'tighten'].includes(q.id) && q.suggested)) { if (A.over) break; E.worldAction(A, x.id, x.param); }
      assert.deepEqual(A.rng, B.rng, `${ch} turn ${t}`);
    }
    assert.ok(jA > 0);
  }
});

await test('adverse selection: above the market fewer and worse new borrowers (volume × (1 − 0.45 δ), PD × (1 + δ)), and the good floating-rate borrowers refinance away; at the market the stock keeps its quality', () => {
  assert.equal(volOf(1), 0.55); assert.equal(volOf(-1), 1.45); assert.equal(pdNewOf(1.5), 2.5); assert.equal(pdNewOf(-1), 1);
  const hi = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 4 }); const mk = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 4 });
  for (const k of SEGS) assert.ok(E.worldAction(mk, 'price', `${k}:0`).ok);
  untilPay(hi, 6); untilPay(mk, 6);
  for (const k of ['sme', 'cons']) { assert.ok(hi.world.cr.seg[k].pdMix > mk.world.cr.seg[k].pdMix, k + ' pdMix'); assert.ok(hi.world.cr.seg[k].book < mk.world.cr.seg[k].book, k + ' book'); }
  assert.ok(hi.world.cr.seg.sme.newVol < mk.world.cr.seg.sme.newVol); assert.equal(SEL.prepay, 1); assert.equal(LEGACY.run, 2);
  const b = pdBand(mk, 'sme'); assert.equal(b.lo, b.hi, 'the risk chief sees the true PD'); const o = E.createGame({ worldId: 'w14', charId: 'fintechFounder', seed: 4 }); const b2 = pdBand(o, 'sme'); assert.ok(b2.hi > b2.lo);
});

await test('credit crunch (the shared cycle draw > 0.98): 9 paydays of PD × 3.5 (developers × 4.5), demand × 0.6 and a confidence shock — for every bank, whatever its prices', () => {
  assert.deepEqual({ at: CRUNCH.at, months: CRUNCH.months, pd: CRUNCH.pd, dev: CRUNCH.dev }, { at: 0.98, months: 9, pd: 3.5, dev: 4.5 });
  let seen = 0;
  for (let seed = 1; seed < 40 && seen < 2; seed++) {
    const st = E.createGame({ worldId: 'w14', charId: 'familyBanker', seed }); let g = 0;
    while (!st.over && !(st.world.cr.crunches > 0) && st.month < 80 && g++ < 900) step(st);
    if (!(st.world.cr.crunches > 0)) continue; seen++;
    const B = st.world.cr; const ci = E.metrics(st).worldIndicators.credit; assert.equal(ci.crunch, true); assert.equal(ci.crunchUntil, B.crunch); assert.ok(B.crunch - st.stats.paydays <= CRUNCH.months && B.crunch - st.stats.paydays >= CRUNCH.months - 1);
    assert.ok(B.shocks.some((x) => x.d === -CRUNCH.conf));
  }
  assert.ok(seen >= 1, 'a crunch within 80 months in some of 40 seeds');
});

await test('regulator and resolution: under 8 % the regulator steps in (no dividend, no risky lending for 12 paydays; the goal\'s noDefault part restarts); under 5 % the bank is resolved', () => {
  const st = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 11 }); const B = st.world.cr; B.eq = Math.round(rwa(st) * 0.07); untilPay(st, 1);
  assert.ok(B.regs >= 1); assert.equal(B.regAt, st.stats.paydays); assert.equal(B.ban, st.stats.paydays + REG.ban); assert.equal(E.worldAction(st, 'dividend', null).ok, false);
  assert.equal(E.metrics(st).goalParts.find((p) => p.key === 'noDefault:regulator').value, 0);
  untilPay(st, 1); if (capRatio(st) < REG.min) assert.equal(B.seg.sme.newVol, 0, 'no risky lending under the ban');
  const r = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 11 }); r.world.cr.eq = Math.round(rwa(r) * 0.03); untilPay(r, 1); assert.equal(r.over && r.result.reason, 'bankrupt');
});

await test('confidence and runs: under 30 depositors run (the fintech\'s hot money 3× faster); the central-bank window first (once in 12 paydays, 2 % fee), then loans at 85 %', () => {
  const st = E.createGame({ worldId: 'w14', charId: 'fintechFounder', seed: 13 }); const B = st.world.cr; B.conf = 5; B.shocks.push({ d: -90, until: st.month + 40 }); const r0 = B.ret; const e0 = B.eq; untilPay(st, 1);
  assert.ok(B.runs >= 1); assert.ok(B.ret < r0); if (B.cbw > 0) { assert.equal(B.cbwLast, B.runAt); assert.ok(B.eq < e0 + Math.abs(B.last.profit) + 1); }
  const s2 = E.createGame({ worldId: 'w14', charId: 'fintechFounder', seed: 13 }); const C = s2.world.cr; C.conf = 5; C.shocks.push({ d: -90, until: s2.month + 40 }); C.cbwLast = s2.stats.paydays; C.liq = 'low';
  untilPay(s2, 1); assert.ok(C.runs >= 1); assert.ok(C.sold >= 1 || C.liqA > 0, 'a fire sale when the window is used up');
});

await test('J offer: a credit committee narrows the sealed quality to ±0.1; a purchase discount is a credit mark (no day-one gain); a failed rival\'s deposits run hot; pass (the safe option) changes nothing', () => {
  const st = E.createGame({ worldId: 'w14', charId: 'familyBanker', seed: 21 }); const ev = toJ(st, 'book'); assert.ok(ev); const p = st.pending; const q = p.offer.q;
  assert.deepEqual(ev.data.pdMult, { lo: 0.7, hi: 1.5 }); assert.ok(q >= 0.7 && q <= 1.5);
  const e1 = E.choose(st, E.currentEvent(st), 'check').event; assert.deepEqual(e1.data.pdMult, { lo: Math.round((q - 0.1) * 100) / 100, hi: Math.round((q + 0.1) * 100) / 100 });
  const B = st.world.cr; const eq0 = B.eq; const pv0 = B.prov; const seg = p.offer.seg; const b0 = B.seg[seg].book; const size = e1.data.size;
  E.choose(st, E.currentEvent(st), 'buy'); assert.equal(B.seg[seg].book, b0 + size); assert.ok(B.eq <= eq0, 'no day-one gain'); assert.ok(B.prov >= pv0 + size - e1.data.price);
  const d = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 21 }); const ed = toJ(d, 'deposits'); if (ed) { const h0 = d.world.cr.hot; const r0 = d.world.cr.ret; E.choose(d, E.currentEvent(d), 'buy'); assert.ok(d.world.cr.hot > h0); assert.ok(d.world.cr.ret > r0); }
  const x = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 22 }); toJ(x); const snap = JSON.stringify(x.world.cr); const c0 = x.cash; E.choose(x, E.currentEvent(x), 'pass'); assert.equal(JSON.stringify(x.world.cr), snap); assert.equal(x.cash, c0);
});

await test('Z actions: price / tighten / liq / raise (dilution) / sellBook / dividend; logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w14', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w14', charId: 'riskChief', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['price', 'mort:2'], ['price', 'gold:0'], ['price', 'mort:1.5'], ['liq', 'low'], ['liq', 'huge'], ['tighten', 'x'], ['sellBook', 'x'], ['dividend', null]]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0);
  const s0 = st.world.cr.stake; const e0 = st.world.cr.eq; assert.ok(E.worldAction(st, 'raise', null).ok); assert.ok(st.world.cr.stake < s0); assert.equal(st.world.cr.eq, e0 + Math.round(e0 * 0.2 / 1000) * 1000);
  assert.ok(E.worldAction(st, 'price', 'sme:0').ok); assert.ok(E.worldAction(st, 'sellBook', 'cons').ok); assert.equal(st.actions.length, n0 + 3);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the bank asset = your stake × equity, goal progress in [0, 1], the balance sheet balances', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w14', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      if (s.over) return; const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); const bank = s.assets.find((a) => a.op && a.op.ck === 'bank'); assert.equal(bank.value, ownerEquity(s));
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const B = s.world.cr; assert.ok(Number.isFinite(capRatio(s)) && B.conf >= 0 && B.conf <= 100);
      for (const k of SEGS) assert.ok(B.seg[k].book >= 0 && B.seg[k].fixBook <= B.seg[k].book && Number.isFinite(B.seg[k].pdMix), k);
    } });
  }
});

await test('rooms: the public view carries no sealed value (the landing draws, the offer\'s quality)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w14', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toJ(st);
    const js = JSON.stringify(E.publicView(st)); for (const k of ['"wr"', '"q"']) assert.ok(!js.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the module; the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.validate().errors, []);
  for (const k of SEGS) assert.ok(SEG[k].sp > 0 && SEG[k].lgd > 0 && SEG[k].rw > 0);
});

await test('verifier: core bundle + the w14 pack (the world and its module); a w14 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w14; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w14.js', 'worlds/mech/credit.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w14 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w14').id, 'w14');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w14', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w14', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w14 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
