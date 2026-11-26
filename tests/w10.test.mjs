#!/usr/bin/env node
// w10 מרכז הפיננסים (engine side): lazy registration, the two modules (`market` on the lazy stream `exch`, `portfolio` on `world`), the
// content pools on the deal tile, the characters' starts (a diversified family / a 70 % block / cash with cheaper trading), fixed draws on
// every stream (opposite players stay aligned), the 'W' and 'Y' tiles (the safe option spends nothing), margin (capacity by liquidity
// class, the call, the forced liquidation, ★★★ without one), funds (factor NAVs, the trapped note, stale marks, redemption, the freeze),
// private deals (due diligence, capital calls, distributions, the secondary sale), the put overlay, the heir's block and the allocator's
// mandate, Z actions replayed and verified, saves, fuzz (G-big) and the verifier's per-world pack.
// Run: node tests/w10.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STREAMS, LAZY_STREAMS } from '../js/rng.js';
import { prng } from './lib/random-player.mjs';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w10 is not loaded by the engine; ensureWorld loads it with both modules; WORLDS stays w1–w4; meta agrees', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w10'), false); assert.throws(() => E.getWorld('w10'), /world_not_loaded/);
  const w = await E.ensureWorld('w10'); assert.equal(w.id, 'w10'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'portfolio'); assert.deepEqual(w.mech.map((M) => M.id), ['market', 'portfolio']); assert.deepEqual(w.streams, ['exch', 'content']);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w10');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.ranked, false); assert.equal(m.roomOk, false); assert.equal(m.tier, 7); assert.deepEqual(m.modules, ['market', 'portfolio']);
  assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id)); assert.deepEqual(m.unlock, [{ any: ['w6', 'w7', 'w8'], count: 1, stars: 1 }]);
  assert.equal(isUnlockedBy('w10', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w7: 1 }), true); assert.equal(isUnlockedBy('w10', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1 }), false);
  assert.deepEqual(w.goal, { type: 'nw', target: 400000000, hold: 3 }); assert.deepEqual(w.stars, m.stars); assert.equal(w.maxMonths, m.maxMonths);
});

const MKT = await import('../js/worlds/mech/market.js'); const PFM = await import('../js/worlds/mech/portfolio.js');
const W10 = E.getWorld('w10'); const CH = W10.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 10) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
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
const toTile = (st, mt) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 600 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech' && st.pending.mt === mt) return ev; settle(st, ev); } return null; };
const WI = (st) => E.metrics(st).worldIndicators;

await test('start: rules 7 (never older); the lazy streams exist only here; characters as specified; NW ₪100–150M; goal ₪400M', () => {
  assert.equal(E.createGame({ worldId: 'w10', seed: 3, rules: 4 }).rules, 7); assert.equal(E.createGame({ worldId: 'w10', seed: 3, mode: 'challenge', dateKey: '2026-12-01' }).rules, 7);
  const a = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 5 }); const h = E.createGame({ worldId: 'w10', charId: 'blockHeir', seed: 5 }); const t = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 5 });
  for (const st of [a, h, t]) { assert.deepEqual(Object.keys(st.rng), [...STREAMS, ...LAZY_STREAMS]); const nw = E.metrics(st).netWorth; assert.ok(nw >= 100e6 && nw <= 155e6, st.charId + ' NW ' + nw); assert.equal(Object.keys(st.mkt.cos).length, 12); }
  assert.ok(a.mkt.held.IDX && Object.keys(a.mkt.held).length === 5 && a.mkt.mandate.sector === 0.3 && a.mkt.freeResearch, 'allocator: index + 4 stocks, mandate, free research');
  assert.ok(a.assets.some((x) => x.op.ck === 'fund') && a.assets.some((x) => x.op.ck === 'private' && x.op.type === 'pe' && x.op.commit === 12e6 && x.op.called === 3e6), 'a bond fund and a year-old PE commitment');
  assert.ok(MKT.liveCos(a).every((c) => c.seen), 'the allocator sees every quality band');
  const bk = h.mkt.block; assert.ok(bk && h.mkt.cos[bk.coId].size === 'large'); const v = h.mkt.held[bk.coId]; assert.ok(Math.abs(v.qty * h.mkt.cos[bk.coId].px / 100 - 105e6) < 2e6, 'the block is 70 % of ₪150M'); assert.ok(v.basis < 0.35 * 105e6, 'low basis');
  assert.equal(t.cash, 100e6); assert.deepEqual(t.mkt.feeMult, { spread: 0.7, comm: 0.5 }); assert.deepEqual(Object.keys(t.mkt.held), []);
  assert.ok(Math.abs(PFM.marginRate(t) - PFM.marginRate(a) - 1) < 1e-9, 'the trader pays +1 % on margin'); assert.ok(PFM.ltvRates(t).daily - PFM.ltvRates(a).daily > 0.099);
});

await test('fixed draws: world 2 at init + 3 per payday + 4 per Y; exch 37 + 69 per payday; content per pool — opposite players stay aligned on EVERY stream', () => {
  assert.deepEqual(PFM.DRAWS, { init: 2, month: 3, landing: { Y: 4 } }); assert.deepEqual(MKT.market.draws.landing, { W: 0 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w10', charId: ch, seed: 321 }); const B = E.createGame({ worldId: 'w10', charId: ch, seed: 321 });
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 4)) E.worldAction(A, a.id, a.param); // A acts on everything it can; B never acts
      if (A.over) break;
      E.rollDice(A); E.rollDice(B); let ea = E.landing(A); let eb = E.landing(B); let k = 0;
      while (ea && !A.over && k++ < 12) { const en = ea.options.filter((x) => x.enabled); const o = en.find((x) => ['commit', 'half', 'dd', 'peek'].includes(x.id) || x.kind === 'buy') || en.find((x) => ['ok', 'done', 'pass'].includes(x.id)) || en[0]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, eb); if (A.over || B.over) break;
      for (const s of [...STREAMS, ...LAZY_STREAMS]) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
  }
});

await test('W tile: 0 draws; `done` (the safe option) spends nothing; the free look reveals a quality band, never the number', () => {
  const st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 11 }); const ev = toTile(st, 'W'); assert.ok(ev, 'reached a W tile');
  assert.equal(MKT.market.tiles.W.safe, 'done'); assert.ok(ev.data.market.regime && ev.data.market.idx); assert.ok(!JSON.stringify(ev).includes('"q":'));
  const c0 = st.cash, l0 = st.loans; const r0 = { ...st.rng }; const peek = ev.options.find((o) => o.id === 'peek');
  if (peek) { const id = st.pending.focusCo; E.choose(st, ev, 'peek'); assert.ok(['low', 'mid', 'high'].includes(st.mkt.cos[id].seen.band)); } else E.choose(st, ev, 'done');
  assert.equal(st.cash, c0); assert.equal(st.loans, l0); assert.deepEqual({ ...st.rng }, r0, 'no draw at the W tile');
});

await test('Y tile: 4 sealed draws; pass spends nothing; due diligence narrows the multiple band; a PE commitment calls capital on schedule and distributes; a stake pays now', () => {
  let pe = null, stake = null;
  for (let s = 0; s < 40 && (!pe || !stake); s++) {
    const st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 40 + s }); const ev = toTile(st, 'Y'); if (!ev) continue;
    assert.equal(st.pending.wr.length, 4); assert.ok(!JSON.stringify(ev).includes('"wr"') && !JSON.stringify(ev).includes('moic"'), 'no sealed value in the event');
    const d = ev.data.private; const c0 = st.cash; const band0 = { ...d.band };
    if (s % 2) { E.choose(st, ev, 'pass'); assert.equal(st.cash, c0); continue; }
    let e2 = E.choose(st, ev, 'dd').event; assert.equal(st.cash, c0 - d.ddFee); const b = e2.data.private.band; assert.ok(b.hi - b.lo <= 0.6 + 1e-9 && b.lo >= band0.lo && b.hi <= band0.hi);
    e2 = E.choose(st, e2, 'commit').event; settle(st, e2); const a = st.assets.find((x) => x.op && x.op.ck === 'private' && x.op.since === st.month);
    if (!a) continue;
    if (a.op.type === 'pe' && !pe) { pe = { st, a }; assert.equal(a.op.called, 0); assert.equal(a.op.sched.length, PFM.PE.calls); assert.equal(st.cash, c0 - d.ddFee, 'a commitment pays nothing now'); }
    if (a.op.type === 'stake' && !stake) { stake = { st, a }; assert.equal(st.cash, c0 - d.ddFee - a.op.cost, 'a stake pays now'); assert.ok(a.op.lockUntil - st.month >= PFM.STAKE.lockMin); }
  }
  assert.ok(pe && stake, 'found both kinds');
  const { st, a } = pe; st.cash += 100e6; /* enough for every call, far from the ₪400M goal */ const o = a.op; const calls = o.sched.slice(); untilMonth(st, calls[0]); const x = st.assets.find((y) => y.id === a.id); assert.ok(x.op.called >= Math.round(o.commit / PFM.PE.calls) - 1, 'the first call came');
  untilMonth(st, o.dist[o.dist.length - 1] + 1); assert.ok(!st.over || st.month > o.dist[o.dist.length - 1], 'the game lasted past the last distribution'); assert.ok(!st.assets.some((y) => y.id === a.id), 'fully distributed: the commitment left the books'); assert.ok(st.world.pf.distGot > 0 && st.world.pf.callsPaid >= o.commit - 1);
});

await test('margin: borrowing stops at 95 % of the capacity (daily 60 %, monthly 40 %, locked 0 %); LTV > 1 at a payday → a call; unpaid at the next payday → a forced sale; > 125 % → at once; ★★★ needs none', () => {
  const st = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 8 }); const C = PFM.classes(st); const cap = PFM.capacity(st);
  assert.equal(cap, Math.round(C.daily * 0.6 + C.monthly * 0.4)); assert.equal(C.locked > 0, true);
  assert.equal(E.worldAction(st, 'margin', 'b:1').ok, false, 'tiny loans refused'); const n0 = st.actions.length;
  assert.ok(E.worldAction(st, 'margin', 'b:max').ok); assert.equal(st.world.pf.debt, Math.round(cap * PFM.LTV.borrowMax)); assert.equal(st.actions.length, n0 + 1);
  assert.equal(E.worldAction(st, 'margin', 'b:max').ok, false, 'no more room');
  // a crash: prices fall 30 % → LTV > 1 → a call at the payday; still > 1 at the next → forced
  MKT.shock(st, { idx: -0.3 }); for (const c of Object.values(st.mkt.cos)) { c.px = Math.max(1, Math.round(c.px * 0.75)); c.open.c = c.px; c.open.l = Math.min(c.open.l, c.px); }
  st.cash = 0; const m1 = st.month; untilMonth(st, m1 + 1); const P = st.world.pf;
  assert.ok(P.call || P.forcedEvents > 0, 'a call (or, past 125 %, a forced sale)');
  if (P.call) { untilMonth(st, P.call.due + 1); }
  assert.ok(P.forcedEvents >= 1, 'forced'); assert.ok(PFM.ltvOf(st) <= 1, 'after the forced sale the loan fits');
  assert.ok(st.mkt.closed.some((x) => x.reason === 'forced'), 'booked as forced'); assert.ok(W10.mech[1].starGates(st)[0].ok === false, '★★★ blocked');
  const s2 = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 8 }); E.worldAction(s2, 'margin', 'b:20000000'); assert.ok(E.worldAction(s2, 'margin', 'r:all').ok); assert.equal(s2.world.pf.debt, 0); assert.equal(E.worldAction(s2, 'margin', 'r:all').ok, false);
  assert.ok(E.metrics(s2).expenses >= 0); E.worldAction(s2, 'margin', 'b:10000000'); assert.equal(E.metrics(s2).totalLiabilities >= 10e6, true, 'the margin loan is a liability');
});

await test('funds: the deal tile draws from the content pool; NAV moves with the rate × duration; the "guaranteed" note collapses in a spread blowout; stale marks jump; redeem at the next payday, sell now −5 %, the freeze blocks', () => {
  let st = null; let ev = null;
  for (let s = 0; s < 30 && !ev; s++) { st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 600 + s }); for (let g = 0; g < 200 && !st.over; g++) { E.rollDice(st); const e = E.landing(st); if (st.pending && st.pending.type === 'deal' && st.pending.card.op && st.pending.card.op.ck === 'fund') { ev = e; break; } settle(st, e); } }
  assert.ok(ev && st.pending.card.cid && st.pending.card.iid, 'a content-pool fund'); assert.ok(ev.data.fund && ev.data.fund.cls === 'monthly');
  const buy = ev.options.find((o) => o.kind === 'buy' && o.enabled); E.choose(st, ev, buy.id); const a = st.assets.find((x) => x.op && x.op.ck === 'fund'); assert.ok(a);
  // the rate card: a +1 % rate moves a fund by about −duration %
  const nav0 = a.op.nav; const dur = a.op.dur; W10.mech[1].market.create(st, { card: { mk: 'rate', dr: 1 } }, null); const ret = a.op.nav / nav0 - 1;
  assert.ok(Math.abs(ret + dur / 100 - (a.op.beq * 0) ) < 0.02 + Math.abs(a.op.beq) * 0.05, `rate move ${ret} vs duration ${dur}`);
  // redemption at the next payday; sell now at −5 %; a freeze blocks both
  W10.mech[1].market.create(st, { card: { mk: 'freeze', months: 2 } }, null); assert.equal(E.worldAction(st, 'redeem', String(a.id)).ok, false); assert.equal(E.worldAction(st, 'sellNow', String(a.id)).ok, false);
  st.world.pf.freezeUntil = 0; assert.ok(E.worldAction(st, 'redeem', String(a.id)).ok); const m0 = st.month; const nav1 = a.op.nav; untilMonth(st, m0 + 1); assert.ok(!st.assets.includes(a), 'paid out at the payday'); void nav1;
  // the trap: a note with 3× hidden credit beta defaults when spreads blow out
  const s3 = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 5 });
  const note = { k: 'fund', n: 'פיקדון מובנה', d: '', cost: 20e6, down: 20e6, value: 20e6, cf: 200000, op: { ck: 'fund', kind: 'note', dur: 1, beq: 0, bcr: 1, bpr: 0 } };
  const stale = { k: 'fund', n: 'קרן לא סחירה', d: '', cost: 20e6, down: 20e6, value: 20e6, cf: 70000, op: { ck: 'fund', kind: 'stale', dur: 0, beq: 0, bcr: 0, bpr: 1 } };
  s3.cash += 50e6; const X = s3.assets.length; const mctx = { buy: null }; void mctx;
  for (const c of [note, stale]) { const pend = { type: 'deal', card: c }; void pend; }
  // add through the module's asset hook exactly as a bought card would be
  const add = (c) => { const aa = { id: s3.nextId++, k: c.k, n: c.n, cost: c.cost, down: c.down, value: c.value, debt: 0, cf: c.cf }; s3.assets.push(aa); W10.mech[1].asset.create(s3, aa, c, null); return aa; };
  const an = add(note), as = add(stale); assert.equal(s3.assets.length, X + 2); assert.equal(an.op.hid, 3); assert.equal(as.op.hidP, 1.6);
  W10.mech[1].market.create(s3, { card: { mk: 'spread', ds: 3 } }, null); assert.ok(an.op.dflt, 'the note defaulted'); assert.ok(an.op.nav < 0.5 * 20e6); assert.equal(W10.mech[1].asset.cf(s3, an), 0, 'the coupon stopped');
  W10.mech[1].market.create(s3, { card: { mk: 'prop', pr: -0.08 } }, null); assert.equal(as.value, 20e6, 'a stale fund keeps its old mark'); assert.ok(as.op.nav < 20e6 * 0.9, 'its true NAV fell (1.6× hidden beta)');
  s3.month = as.op.markAt; W10.mech[1].asset.create; untilMonth(s3, as.op.markAt + 1); assert.ok(as.value < 20e6 * 0.92 || !s3.assets.includes(as), 'the mark jumped at the revaluation');
});

await test('the put overlay: costs ≈ 0.33 % of the daily class a month and pays the index loss beyond −5 %; the heir\'s block sale moves its price; the allocator\'s 30 % sector mandate', () => {
  const st = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 21 }); assert.ok(E.worldAction(st, 'hedge', 'on').ok); assert.equal(E.worldAction(st, 'hedge', 'on').ok, false);
  st.mkt.idxRet = -0.12; const d = PFM.classes(st).daily; const c0 = st.cash; const out = { news: [], effects: [], spawn: [], despawn: [] };
  const ctx = { draw: (s) => 0.5, ensureCash() {}, cashFx() {}, fmtM: String, lesson() {}, netWorth: () => 1e9, mentorLine: () => null };
  const P = st.world.pf; P.hedgeGot = 0; const sv = { ...st.rng };
  W10.mech[1].monthly(st, out, ctx); assert.ok(P.hedgeGot > 0 && P.hedgeGot < d * 0.08, 'paid the loss beyond −5 %'); assert.ok(P.hedgePaid > 0 && P.hedgePaid <= Math.round(d * 0.0034 + 1)); void c0; void sv;
  const h = E.createGame({ worldId: 'w10', charId: 'blockHeir', seed: 21 }); const id = h.mkt.block.coId; const px0 = h.mkt.cos[id].px; const q = Math.ceil(h.mkt.block.qty0 * 0.25);
  assert.ok(E.worldAction(h, 'trade', `${id}:s:${q}`).ok); assert.ok(h.mkt.cos[id].px <= Math.round(px0 * (1 - 0.2 * 0.25)) + 1, 'selling 25 % of the block moves the price ≈ −5 %'); assert.ok(h.mkt.taxPaid > 0, 'capital-gains tax on the low basis');
  const a = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 21 }); a.cash = 5e8; const c = MKT.liveCos(a)[0]; const r = E.worldAction(a, 'trade', `${c.id}:B:200000000`); assert.equal(r.ok, false); assert.match(r.error, /30%/);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  let zs = 0;
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w10', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.4, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    zs += st.actions.filter((a) => a[0] === 'Z').length;
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  assert.ok(zs > 30, 'module actions exercised: ' + zs);
  const st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 2 }); const n0 = st.actions.length; const c = MKT.liveCos(st)[0];
  for (const [a, p] of [['trade', 'zz:b:5'], ['trade', `${c.id}:x:5`], ['trade', `${c.id}:s:5`], ['margin', 'b:max'], ['redeem', '999'], ['secondary', '1'], ['hedge', 'maybe'], ['refi', '1'], ['research', 'c999']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0);
  assert.ok(E.worldAction(st, 'trade', `${c.id}:B:5000000`).ok); assert.ok(E.worldAction(st, 'research', MKT.liveCos(st)[1].id).ok); assert.equal(st.actions.length, n0 + 2);
  const back = E.deserialize(E.serialize(st)); assert.equal(E.serialize(back), E.serialize(st)); assert.deepEqual(Object.keys(back.rng), Object.keys(st.rng));
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1], the indicators are complete', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w10', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); assert.ok(Number.isInteger(m.goalParts[0].value));
      const wi = m.worldIndicators; assert.ok(wi.market && wi.portfolio && wi.panel && wi.panel.id === 'market'); assert.ok(Number.isFinite(wi.portfolio.ltv));
    } });
  }
});

await test('verifier: core bundle + the w10 pack only (market + portfolio + the content pools + the companies); a w10 game verifies; dated before RULES7_FROM → bad_world', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE, 'core ' + all.core.text.length);
  assert.ok(all.packs.w10 && all.packs.w10.text.length <= MAX_PACK && all.packs.w10.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w10 && all.packs.w10.text.length));
  assert.deepEqual(Object.keys(all.packs.w10.files).sort(), ['content/deals-w10.js', 'content/news.js', 'content/rumor.js', 'worlds/data/companies.js', 'worlds/mech/market.js', 'worlds/mech/portfolio.js', 'worlds/w10.js']);
  assert.ok(all.core.files['systems/content.js'], 'the content system is core (the engine reads pools on the deal tile)');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w10.text); assert.equal(EE.getWorld('w10').id, 'w10');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 10 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w10', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w10', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w10 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, 7); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w10.text.length} chars · core ${all.core.text.length} chars · max w10 replay ${maxMs.toFixed(0)} ms`);
});

await test('rooms: the public view and the event of every tile carry no sealed value (q, recov, the multiple, the schedule, the hidden betas)', () => {
  const st = play({ worldId: 'w10', charId: 'allocator', seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 });
  const js = JSON.stringify(E.publicView(st)); for (const k of ['"q":', '"recov"', '"moic"', '"sched"', '"hid"', '"hidP"', '"fraudBk"']) assert.ok(!js.includes(k), k);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
