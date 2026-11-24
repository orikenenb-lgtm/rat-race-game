#!/usr/bin/env node
// w11 התאגיד הבינלאומי (engine side): lazy registration, the new `multinational` module (fixed draws on stream `world`: 18 at init, 14 per
// payday, 4 per 'Z' landing), the acquisition card (ranges that contain the sealed truth, due diligence narrows them and keeps the card open,
// 35 % down + an acquisition loan on the sub, pass = the safe option), delegation (attention slots, severance, the month's candidate, audits,
// fraud from sealed integrity), the supply graph (disruption 60 % / dual source 90 % / the exporter 80 %), 5 currencies with rolling hedges,
// withholding tax and cash kept abroad, the value (32 × the trailing profit), Z actions replayed and verified, saves, fuzz, the public view,
// N-fict and the verifier's per-world pack.
// Run: node tests/w11.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, MN, COUNTRIES, CIDS, TEMPLATES, SLOTS, slotsOf, selfCount, subValue, rateOf } from '../js/worlds/mech/multinational.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w11 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 8, 2 of w6–w8 + 1 of w9/w10/w13); its lessons arrive with its pack', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w11'), false); assert.throws(() => E.getWorld('w11'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'trust_verify'), false, 'the core carries no w11 lesson');
  const w = await E.ensureWorld('w11'); assert.equal(w.id, 'w11'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'multinational'); assert.deepEqual(w.modules, ['multinational']); assert.equal(w.streams, undefined);
  for (const id of ['trust_verify', 'supply_chain', 'trapped_cash']) assert.ok(E.LESSONS.some((l) => l.id === id), id + ' registered from the pack');
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w11');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 8); assert.equal(m.ranked, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w6', 'w7', 'w8'], count: 2, stars: 1 }, { any: ['w9', 'w10', 'w13'], count: 1, stars: 1 }]);
  assert.equal(isUnlockedBy('w11', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1, w13: 1 }), true); assert.equal(isUnlockedBy('w11', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w13: 1 }), false);
});

const W = E.getWorld('w11'); const CH = W.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
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
const toZ = (st) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 400 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const MI = (st) => E.metrics(st).worldIndicators.multinational;

await test('start: rules 7; start equity ₪120–200M; the goal is nw ₪800M hold 2; ceo runs 3 subs herself (3 slots), the exporter has 2 known managers, the fund has cash only', () => {
  assert.equal(E.createGame({ worldId: 'w11', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal, { type: 'nw', target: 800000000, hold: 2 });
  for (const ch of CH) { const st = E.createGame({ worldId: 'w11', charId: ch, seed: 9 }); const m = E.metrics(st);
    assert.ok(m.netWorth >= 120e6 && m.netWorth <= 200e6, ch + ' NW ' + m.netWorth); assert.equal(m.worldIndicators.panel.id, 'multinational'); assert.equal(m.worldIndicators.panel.table.length, 5);
    assert.equal(m.netWorth, st.cash - st.loans + st.assets.reduce((x, a) => x + a.value - a.debt, 0)); assert.ok(m.passive >= 0); }
  const c = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 9 }); assert.equal(slotsOf(c), 3); assert.equal(selfCount(c), 3); assert.equal(c.world.mn.subs.length, 3); assert.ok(E.metrics(c).passive > 2e6, 'profits from the first month');
  const x = E.createGame({ worldId: 'w11', charId: 'oldExporter', seed: 9 }); assert.equal(slotsOf(x), 2); assert.ok(x.world.mn.subs.every((s) => s.mgr && s.mgr.known && s.mgr.cLo === s.mgr.cHi && s.mgr.iLo === s.mgr.iHi && s.sup === 'vn'));
  const p = E.createGame({ worldId: 'w11', charId: 'pe', seed: 9 }); assert.equal(p.world.mn.subs.length, 0); assert.equal(p.assets.length, 0);
});

await test('fixed draws on stream `world`: 18 at init, exactly 14 per payday + 4 per Z landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, Z: DRAWS.landing.Z }, { init: 18, month: 14, Z: 4 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w11', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w11', charId: ch, seed: 77 });
    assert.deepEqual(A.rng, B.rng);
    let zA = 0, zB = 0;
    for (let t = 0; t < 120 && !A.over && !B.over; t++) {
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      if (A.pending && A.pending.type === 'mech') zA++; if (B.pending && B.pending.type === 'mech') zB++;
      // A buys / checks whatever it can and pulls every lever; B passes everything — the streams stay aligned
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => ['buy', 'dd'].includes(x.id)) || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, b); for (const x of E.worldActions(A).filter((q) => q.enabled && q.id !== 'sell')) E.worldAction(A, x.id, x.param);
      assert.deepEqual(A.rng, B.rng, `${ch} turn ${t}`);
    }
    assert.ok(zA > 0 && zA === zB);
  }
});

await test('acquisition card: shown ranges contain the sealed truth; due diligence narrows them and keeps the card open; buy = 35 % down + a loan on the sub; pass spends nothing; no sealed value in the card', () => {
  let bought = 0, checked = 0;
  for (let i = 0; i < 30 && bought < 4; i++) {
    const st = E.createGame({ worldId: 'w11', charId: 'pe', seed: 40 + i }); untilMonth(st, 3); const ev = toZ(st); if (!ev) continue;
    const it = st.pending.item; const d = ev.data; assert.ok(it.lo <= it.sealed.base && it.sealed.base <= it.hi, 'base range'); assert.equal(d.price, it.price); assert.ok(d.price >= 30e6 * 0.5);
    assert.ok(!JSON.stringify(ev).includes('sealed') && !JSON.stringify(ev.data).includes('"base"'), 'the card carries no sealed value');
    assert.ok(ev.options.find((o) => o.id === 'buy').preview && ev.options.find((o) => o.id === 'pass').preview.cash === 0);
    const c0 = st.cash; const w0 = (st.lastWidth = it.hi - it.lo);
    const r1 = E.choose(st, ev, 'dd'); checked++; assert.ok(st.cash < c0, 'the check costs'); assert.ok(r1.event && st.pending, 'the card stays open');
    const it2 = st.pending.item; assert.ok(it2.dd && it2.hi - it2.lo < w0 && it2.lo <= it2.sealed.base && it2.sealed.base <= it2.hi); assert.ok(it2.cLo <= it2.sealed.comp && it2.sealed.comp <= it2.cHi && it2.iLo <= it2.sealed.integ && it2.sealed.integ <= it2.iHi);
    assert.equal(r1.event.options.find((o) => o.id === 'dd').enabled, false);
    const n0 = st.assets.length; const cash1 = st.cash; const down = Math.round(it2.price * MN.down / 100000) * 100000;
    if (!r1.event.options.find((o) => o.id === 'buy').enabled) { E.choose(st, r1.event, 'pass'); assert.equal(st.cash, cash1); continue; }
    E.choose(st, r1.event, 'buy'); bought++;
    const a = st.assets[n0]; assert.equal(st.assets.length, n0 + 1); assert.equal(a.k, 'sub'); assert.equal(a.debt, it2.price - down); assert.equal(cash1 - st.cash, down);
    const s = st.world.mn.subs.find((x) => x.sid === a.id); assert.ok(s && s.mgr && !s.self && s.mgr.comp === it2.sealed.comp && s.base === it2.sealed.base); assert.equal(a.value, subValue(st, s));
    assert.ok(!JSON.stringify(a).includes('integ'), 'the asset carries no sealed trait');
  }
  assert.ok(bought >= 2 && checked >= 3, `bought ${bought} checked ${checked}`);
  const st = E.createGame({ worldId: 'w11', charId: 'pe', seed: 5 }); const ev = toZ(st); const c = st.cash; E.choose(st, ev, 'pass'); assert.equal(st.cash, c); assert.equal(st.assets.length, 0);
});

await test('delegation: attention slots, severance, the month\'s candidate (consumed on hire, a 2-month handover), audits narrow ranges around the truth', () => {
  const st = E.createGame({ worldId: 'w11', charId: 'oldExporter', seed: 11 }); const [s1, s2] = st.world.mn.subs; untilMonth(st, 2);
  const c0 = st.cash; const w = s1.mgr.wage; assert.ok(E.worldAction(st, 'self', 's' + s1.sid).ok); assert.equal(c0 - st.cash, MN.sever * w); assert.ok(s1.self && !s1.mgr);
  assert.ok(E.worldAction(st, 'self', 's' + s2.sid).ok); assert.equal(selfCount(st), 2); // 2 slots
  assert.ok(st.world.mn.cand); const cand = { ...st.world.mn.cand }; assert.ok(E.worldAction(st, 'hire', 's' + s1.sid).ok); assert.equal(st.world.mn.cand, null);
  assert.ok(!s1.self && s1.mgr.comp === cand.comp && s1.mgr.gap === st.month + MN.gapMonths - 1); assert.equal(E.worldAction(st, 'hire', 's' + s2.sid).ok, false, 'one candidate a month');
  const f0 = st.cash; assert.ok(E.worldAction(st, 'audit', 's' + s1.sid).ok); assert.equal(f0 - st.cash, MN.auditFee); const g = s1.mgr;
  assert.ok(g.cLo <= g.comp && g.comp <= g.cHi && g.iLo <= g.integ && g.integ <= g.iHi && g.cHi - g.cLo <= 0.21 && g.iHi - g.iLo <= 0.31 && g.aud === st.month);
  assert.equal(E.worldAction(st, 'audit', 's' + s2.sid).ok, false, 'a self-run sub has no manager to audit');
  const ceo = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 3 }); const [a] = ceo.world.mn.subs; untilMonth(ceo, 2);
  assert.ok(E.worldAction(ceo, 'hire', 's' + a.sid).ok); assert.equal(selfCount(ceo), 2); assert.ok(E.worldAction(ceo, 'self', 's' + a.sid).ok); assert.equal(E.worldAction(ceo, 'self', 's' + a.sid).ok, false);
});

await test('fraud: a managed sub of low integrity is defrauded (4–8 months of profit, the books show it, integrity capped); an audit cuts the hazard; self-run subs never are', () => {
  let frauds = 0, honest = 0;
  for (let i = 0; i < 6; i++) {
    const st = E.createGame({ worldId: 'w11', charId: 'oldExporter', seed: 200 + i }); for (const s of st.world.mn.subs) { s.mgr.integ = 0.0; s.mgr.iHi = 1; } // a crook (test only)
    const h = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 200 + i });
    untilMonth(st, 40); untilMonth(h, 40); frauds += st.world.mn.frauds; honest += h.world.mn.frauds;
    if (st.world.mn.frauds) { assert.ok(st.world.mn.fraudLoss > 0); assert.ok(st.world.mn.subs.some((s) => s.mgr && s.mgr.iHi <= 0.1)); }
  }
  assert.ok(frauds >= 6, 'frauds ' + frauds); assert.equal(honest, 0, 'self-run subs are never defrauded');
  assert.ok(MN.auditCut < 1 && MN.fraudP > 0);
});

await test('supply: a disrupted supplier runs its subs at 60 % (90 % with a second source, 80 % for the exporter); a second source costs 4 % (2 % with the hub)', () => {
  const st = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 21 }); const M = st.world.mn; untilMonth(st, 2);
  const s = M.subs[0]; const L0 = s.last.local; M.dis[s.sup] = st.month + 5; untilMonth(st, st.month + 1); assert.equal(s.last.supply, MN.disF);
  assert.ok(E.worldAction(st, 'dual', 's' + s.sid).ok); untilMonth(st, st.month + 1); assert.equal(s.last.supply, MN.dualF); void L0;
  const x = E.createGame({ worldId: 'w11', charId: 'oldExporter', seed: 21 }); untilMonth(x, 2); x.world.mn.dis.vn = x.month + 5; untilMonth(x, x.month + 1); assert.ok(x.world.mn.subs.every((q) => q.last.supply === MN.expF));
  assert.deepEqual([MN.dualCost, MN.hubCost], [0.04, 0.02]);
});

await test('FX: 5 currencies drift around a trend; a hedge books the sub at a rate that rolls 1/12 toward spot; cash kept abroad counts at spot and comes home minus the withholding tax', () => {
  const st = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 31 }); const M = st.world.mn; untilMonth(st, 2);
  const c = M.subs[0].c; assert.ok(E.worldAction(st, 'hedge', c).ok); const h0 = M.hedge[c].rate; untilMonth(st, st.month + 1);
  assert.ok(Math.abs(M.hedge[c].rate - Math.round((h0 + (M.fx[c] - h0) / 12) * 1000) / 1000) <= 0.001); assert.equal(rateOf(st, c), M.hedge[c].rate);
  assert.ok(E.worldAction(st, 'keep', c).ok); const m0 = st.month; untilMonth(st, m0 + 3); assert.ok(M.local[c] > 0);
  const nw = E.metrics(st).netWorth; const loc = Math.round(M.local[c] * M.fx[c]); assert.ok(loc > 0);
  const cash = st.cash; assert.ok(E.worldAction(st, 'repat', c).ok); const wht = COUNTRIES.find((x) => x.id === c).wht; assert.ok(Math.abs(st.cash - cash - Math.round(loc * (1 - wht))) <= 1); assert.equal(M.local[c], 0);
  assert.ok(Math.abs(E.metrics(st).netWorth - (nw - (loc - Math.round(loc * (1 - wht))))) <= 2, 'the tax is the only NW change');
  for (const x of CIDS) assert.ok(M.fx[x] >= MN.fxLo && M.fx[x] <= MN.fxHi);
});

await test('value: 32 × the trailing 12-month local profit (the estimate fills unseen months) × the booked rate; sell = 80 % of value minus the sub\'s loan; grow = 3 months for +10 %', () => {
  const st = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 41 }); const M = st.world.mn; const s = M.subs[1]; const a = st.assets.find((x) => x.id === s.sid);
  assert.equal(a.value, Math.round(MN.mult * s.est * 1 / 1000) * 1000); untilMonth(st, 4); assert.equal(s.h.length, 3); assert.equal(a.value, subValue(st, s));
  const base = s.base; const gc = Math.round(MN.growCost * s.est * M.fx[s.c] / 100000) * 100000; const c0 = st.cash; assert.ok(E.worldAction(st, 'grow', 's' + s.sid).ok); assert.equal(c0 - st.cash, gc); assert.equal(s.base, Math.round(base * 1.1));
  assert.equal(E.worldAction(st, 'grow', 's' + s.sid).ok, false, 'once in 6 months');
  const v = Math.round(subValue(st, s) * MN.sellAt / 1000) * 1000; const c1 = st.cash; assert.ok(E.worldAction(st, 'sell', 's' + s.sid).ok); assert.equal(st.cash - c1, v - a.debt); assert.equal(st.assets.includes(a), false); assert.equal(M.subs.includes(s), false);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w11', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w11', charId: 'ceo', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['sell', 's999'], ['hedge', 'xx'], ['repat', 'eu'], ['audit', 's1'], ['self', 's1']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'hedge', 'eu').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1], ≤ 6 subs, FX inside its band', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w11', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const wi = m.worldIndicators; assert.ok(wi.multinational.subs <= SLOTS && wi.panel.rows.length === wi.multinational.subs);
      assert.ok(selfCount(s) <= slotsOf(s)); for (const c of CIDS) assert.ok(Number.isFinite(s.world.mn.fx[c]));
    } });
  }
});

await test('rooms: the public view carries no sealed value (true profit, competence, integrity, the candidate\'s traits, init draws)', () => {
  for (const ch of CH) {
    const st = play({ worldId: 'w11', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 });
    const pv = E.publicView(st); const js = JSON.stringify(pv); for (const k of ['"comp"', '"integ"', '"inits"', '"sealed"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k);
    const mn = JSON.stringify((pv.world || {}).mn || {}); assert.ok(!mn.includes('"base"'), ch + ' sub base'); for (const s of st.world.mn.subs) assert.ok(!js.includes(`"base":${s.base}`), ch + ' a sub\'s true profit');
  }
});

await test('N-fict + lint: fictional subsidiaries (the denylist is checked), exact arithmetic in the module; the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.checkMultinational(), []); assert.deepEqual(V.lintModules(), []);
  assert.ok(V.checkMultinational(new Set(['אלפין'])).some((x) => /מתכת אלפין/.test(x)), 'a denylisted word is caught');
  assert.equal(TEMPLATES.length, 8); assert.ok(TEMPLATES.every((t) => CIDS.includes(t.c) && CIDS.includes(t.sup) && t.c !== t.sup));
  const r = V.validate(); assert.deepEqual(r.errors, []);
});

await test('verifier: core bundle + the w11 pack only (the world + its module); a w11 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE, 'core ' + all.core.text.length);
  assert.ok(all.packs.w11 && all.packs.w11.text.length <= MAX_PACK && all.packs.w11.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w11 && all.packs.w11.text.length));
  assert.deepEqual(Object.keys(all.packs.w11.files).sort(), ['worlds/mech/multinational.js', 'worlds/w11.js']);
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(all.packs.w11.hash), 'the w11 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w11.text); assert.equal(EE.getWorld('w11').id, 'w11');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 10 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w11', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w11', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w11 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, 7); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w11.text.length} chars · core ${all.core.text.length} chars · max w11 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
