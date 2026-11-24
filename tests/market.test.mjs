#!/usr/bin/env node
// The `market` module (CATALOG-25 §3, gates §6.4): M-candle (invariants over many seeds and months), M-seed, M-draws (37 at init, 69 per
// payday on `exch`, 8 per payday on `content`), M-id (ids monotone, never reused, no pool entry listed twice per game), M-bk (bankruptcy →
// claim paid at +3, the loss in `closed`, the history kept, a relisting with a NEW id ≥ 6 months later), M-spread (no company / slot takes
// > 15 % of the fraud events over 500 seeds), M-target (event picks identical under opposite holdings), M-freq (per-regime event rates
// within ±20 % of the table), M-roundtrip, M-size (st.mkt ≤ 40 KB at month 200), no future information in the public view, the light
// trading API (preview before confirming, fees, tax, P&L) and long-game numeric safety.
// Run: node tests/market.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import '../js/worlds/all.js';
import { next } from '../js/rng.js';
import * as MKT from '../js/worlds/mech/market.js';
import { COMPANIES } from '../js/worlds/data/companies.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }
const W10 = E.getWorld('w10');
const ctxFor = (w = W10) => ({ drawX: (st, n) => next(st.rng, n), world: () => w, cashFx() {}, fmtM: (n) => String(n), lesson() {}, fireTrigger() {}, netWorth: () => 1e9, sound() {}, logDecision() {}, mentorLine: () => null, opt: (id, label, enabled, x) => ({ id, label, enabled, ...(x || {}) }) });
const CTX = ctxFor();
const OUT = () => ({ news: [], effects: [], spawn: [], despawn: [] });
/** A fresh w10 state, its market stepped `months` paydays by the module alone (fast; the engine's payday does exactly this plus the rest). */
function stepped(seed, months, ch = 'floorTrader', each) {
  const st = E.createGame({ worldId: 'w10', charId: ch, seed });
  for (let m = 0; m < months; m++) { st.month++; st.stats.paydays++; MKT.marketMonth(st, OUT(), CTX); if (each) each(st, m); }
  return st;
}
/** Every number in a value that is not finite (NaN would serialize as null — so walk the object, not its JSON). */
function nonFinite(x, path = '', out = []) { if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(path); } else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) nonFinite(v, path + '.' + k, out); return out; }
function candleErrors(st) {
  const errs = []; const M = st.mkt;
  const chk = (id, cand) => { for (let i = 0; i < cand.length; i++) { const [m, o, h, l, c, n, v] = cand[i];
    if (!(l <= Math.min(o, c) && Math.max(o, c) <= h)) errs.push(`${id} m${m} l≤o,c≤h`); if (l < 1) errs.push(`${id} m${m} below 1 agora`);
    if (![m, o, h, l, c, n, v].every(Number.isInteger)) errs.push(`${id} m${m} integers`);
    if (i && cand[i - 1][0] === m - 1 && o !== cand[i - 1][4]) errs.push(`${id} m${m} open ≠ previous close`); } };
  for (const c of Object.values(M.cos)) { chk(c.id, c.cand); if (c.cand.length > MKT.RING.cand) errs.push(c.id + ' ring');
    if ((c.status === 'listed' || c.status === 'halted') && (c.open.c !== c.px || c.px < 1 || c.open.l > c.open.h)) errs.push(c.id + ' open candle ≠ trading price'); }
  for (const g of M.grave) { chk('grave:' + g.id, g.cand); if (g.cand.length > MKT.RING.graveCand) errs.push('grave ring'); }
  chk('IDX', M.idx.cand); if (M.idx.cand.length > MKT.RING.idx) errs.push('idx ring'); if (M.idx.open.c !== M.idx.px) errs.push('idx open');
  for (const k of ['news', 'closed', 'grave']) if (M[k].length > MKT.RING[k]) errs.push(k + ' ring');
  return errs;
}

await test('M-draws: exactly 1 + 3 × 12 = 37 `exch` draws at init and 69 every payday (+ 8 `content` draws) — whatever is listed, halted or bankrupt', () => {
  assert.deepEqual(MKT.DRAWS, { init: 37, month: 69 }); assert.deepEqual(MKT.drawsFor(12), MKT.DRAWS); assert.equal(MKT.market.streams.content.month, 8);
  const st = E.createGame({ worldId: 'w10', seed: 3 }); const pos = (s) => { const x = { exch: s.rng.exch, content: s.rng.content }; return x; };
  // replay the init draws by hand from a fresh seed: the stream after init is exactly 37 steps in
  const h = { exch: E.createGame({ worldId: 'w10', seed: 3 }).rng.exch }; void h;
  for (let m = 0; m < 150; m++) {
    const a = pos(st); st.month++; st.stats.paydays++; let ne = 0, nc = 0; const ctx = { ...CTX, drawX: (s, n) => { if (n === 'exch') ne++; else nc++; return next(s.rng, n); } };
    MKT.marketMonth(st, OUT(), ctx); assert.equal(ne, 69, 'exch per payday'); assert.equal(nc, 8, 'content per payday'); assert.notEqual(st.rng.exch, a.exch);
  }
  let n = 0; const s2 = { rng: { exch: 1, content: 1 }, month: 1, stats: { paydays: 0 } };
  MKT.market.init(s2, W10, W10.characters[0], { ...CTX, drawX: (s, nm) => { n++; return next(s.rng, nm); } }); assert.equal(n, 37);
});

await test('M-candle: 200 seeds × 120 months — l ≤ o, c ≤ h, ≥ 1 agora, integers, open = previous close, the open candle is the trading price, rings bounded', () => {
  let months = 0; const errs = [];
  for (let s = 0; s < 200; s++) { const st = stepped(1000 + s, 120, 'floorTrader', (x) => { if (x.month % 30 === 0) errs.push(...candleErrors(x)); }); months += 120; errs.push(...candleErrors(st)); }
  assert.deepEqual(errs.slice(0, 5), []); assert.equal(months, 24000);
});

await test('M-seed: the same seed and the same actions → the same st.mkt (also through a full engine replay); another seed differs', () => {
  const a = stepped(42, 60), b = stepped(42, 60), c = stepped(43, 60);
  assert.equal(JSON.stringify(a.mkt), JSON.stringify(b.mkt)); assert.notEqual(JSON.stringify(a.mkt), JSON.stringify(c.mkt));
  const st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 9 }); let g = 0;
  while (!st.over && st.month < 30 && g++ < 400) { if (st.month % 3 === 0) { const c0 = MKT.liveCos(st)[0]; if (c0) E.worldAction(st, 'trade', `${c0.id}:B:2000000`); } E.rollDice(st); let ev = E.landing(st); let k = 0; while (ev && k++ < 12) { const o = ev.options.find((x) => x.enabled && x.primary) || ev.options.find((x) => x.enabled); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } }
  const r = E.replay(E.replayConfig(st), st.actions); assert.equal(JSON.stringify(r.mkt), JSON.stringify(st.mkt)); assert.equal(E.serialize(r), E.serialize(st));
});

await test('M-id: ids monotone and never reused; a pool entry is listed at most once per game; holdings / claims / closed key on the id', () => {
  for (let s = 0; s < 60; s++) { const seen = new Set(); let last = 0;
    const st = stepped(2000 + s, 200, 'floorTrader', (x) => { for (const id of Object.keys(x.mkt.cos)) if (!seen.has(id)) { const n = +id.slice(1); assert.ok(n > last, 'monotone'); last = n; seen.add(id); } });
    const keys = st.mkt.usedKeys; assert.equal(new Set(keys).size, keys.length, 'no key twice'); assert.ok(keys.length <= COMPANIES.length);
    for (const g of st.mkt.grave) assert.ok(!st.mkt.cos[g.id], 'a dead id is not live again'); }
});

await test('M-bk: a bankruptcy turns the holding into a claim paid at +3 months, books the loss in `closed`, keeps the history; the slot relists a NEW company ≥ 6 months later', () => {
  let checked = 0;
  for (let s = 0; s < 400 && checked < 6; s++) {
    const st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 3000 + s }); st.cash = 5e9;
    for (const c of MKT.liveCos(st)) MKT.trade(st, c.id, 'b', 1000, OUT(), CTX);
    let bk = null; let bkM = 0; let cash0 = 0; let claim = null; const tracked = {};
    for (let m = 0; m < 160; m++) { st.month++; st.stats.paydays++;
      const before = Object.fromEntries(Object.values(st.mkt.cos).map((c) => [c.id, c.status]));
      if (bk && st.month === bkM + 3) cash0 = st.cash;
      MKT.marketMonth(st, OUT(), CTX);
      if (!bk) for (const c of Object.values(st.mkt.cos)) if (c.status === 'bankrupt' && before[c.id] !== 'bankrupt' && st.mkt.claims.some((x) => x.coId === c.id)) { bk = c; bkM = st.month; claim = st.mkt.claims.find((x) => x.coId === c.id); tracked.slot = c.slot; }
      if (bk && st.month === bkM) { const cl = st.mkt.closed.find((x) => x.coId === bk.id && x.reason === 'bankrupt'); assert.ok(cl && cl.pnl < 0, 'loss booked'); assert.equal(claim.payM, bkM + 3); assert.ok(!st.mkt.held[bk.id], 'the holding became a claim');
        const last = bk.cand[bk.cand.length - 1]; assert.equal(last[4], bk.endPx, 'last candle closes at the recovery price'); }
      if (bk && st.month === bkM + 3) { assert.ok(!st.mkt.claims.some((x) => x.coId === bk.id), 'claim paid'); assert.ok(st.cash - cash0 >= claim.amount - 1e9, 'cash in'); assert.ok(st.mkt.grave.some((g) => g.id === bk.id), 'history kept in the grave'); }
      if (bk && st.mkt.slots[tracked.slot] && st.mkt.slots[tracked.slot] !== bk.id) { const nid = st.mkt.slots[tracked.slot]; assert.notEqual(nid, bk.id); assert.ok(+nid.slice(1) > +bk.id.slice(1), 'a NEW id');
        assert.ok(st.month - bkM >= MKT.BK.relistAfter, 'relisted ≥ 6 months after the bankruptcy'); assert.ok(st.month >= bkM + MKT.BK.claimMonths, 'not before the claims paid'); assert.notEqual(st.mkt.cos[nid].key, bk.key, 'not the same pool entry'); checked++; break; }
    }
  }
  assert.ok(checked >= 3, 'found bankruptcies with a later relisting: ' + checked);
});

await test('M-spread: over 500 seeds no pool company and no slot takes > 15 % of all fraud events (the event is the payday process\'s, never a tile\'s)', () => {
  const byKey = {}, bySlot = {}; let tot = 0;
  for (let s = 0; s < 500; s++) { const st = stepped(5000 + s, 84); for (const [k, n] of Object.entries(st.mkt.stats.fraudKeys)) { byKey[k] = (byKey[k] || 0) + n; tot += n; } for (const [k, n] of Object.entries(st.mkt.stats.bySlot)) bySlot[k] = (bySlot[k] || 0) + n; }
  const mk = Math.max(...Object.values(byKey)) / tot; const ms = Math.max(...Object.values(bySlot)) / tot;
  assert.ok(tot >= 200, 'enough fraud events: ' + tot); assert.ok(mk <= 0.15, 'per company ' + mk); assert.ok(ms <= 0.15, 'per slot ' + ms);
});

await test('M-target: opposite holdings (everything in one company vs nothing) → identical events, prices and news', () => {
  for (let s = 0; s < 20; s++) {
    const A = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 700 + s }); const B = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 700 + s });
    const c = MKT.liveCos(A)[s % 12]; MKT.trade(A, c.id, 'b', MKT.qtyFor(A, c.id, A.cash * 0.95), OUT(), CTX);
    for (let m = 0; m < 72; m++) { for (const X of [A, B]) { X.month++; X.stats.paydays++; MKT.marketMonth(X, OUT(), CTX); } }
    const ev = (X) => JSON.stringify(Object.values(X.mkt.cos).map((y) => [y.id, y.ev, y.px]).concat(X.mkt.grave.map((g) => [g.id, g.endPx])));
    assert.equal(ev(A), ev(B)); assert.deepEqual(A.mkt.news.map((n) => n.text), B.mkt.news.map((n) => n.text)); assert.equal(A.rng.exch, B.rng.exch); assert.equal(A.rng.content, B.rng.content);
  }
});

await test('M-freq: per regime the slot fire rate and the event-type shares are within ±20 % of the table (2,000 runs)', () => {
  const agg = {}; for (let s = 0; s < 2000; s++) { const st = stepped(9000 + s, 30); for (const [r, a] of Object.entries(st.mkt.stats.reg)) { const x = agg[r] || (agg[r] = a.map(() => 0)); a.forEach((v, i) => { x[i] += v; }); } }
  for (const [r, a] of Object.entries(agg)) { const T = MKT.REGIMES[r]; const rate = a[1] / a[0]; assert.ok(Math.abs(rate / T.p - 1) <= 0.2, `${r} fire rate ${rate} vs ${T.p}`);
    const wsum = MKT.EVENT_IDS.reduce((x, t) => x + MKT.EVENTS[t].w[r], 0);
    MKT.EVENT_IDS.forEach((t, i) => { const exp = MKT.EVENTS[t].w[r] / wsum; const got = a[2 + i] / a[1]; if (exp * a[1] >= 100) assert.ok(Math.abs(got / exp - 1) <= 0.2, `${r}/${t} ${got} vs ${exp}`); }); }
  assert.ok(Object.keys(agg).length >= 5, 'regimes visited: ' + Object.keys(agg));
});

await test('M-roundtrip + trading: preview before confirming; a buy and a sale in the same month always lose ≥ the spread + 2 commissions; tax on gains with loss carry', () => {
  const st = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 4 }); st.cash = 1e9;
  for (const c of MKT.liveCos(st)) for (const amt of [1e5, 3e6, 4e7]) {
    const q = MKT.qtyFor(st, c.id, amt); const pv = MKT.preview(st, c.id, 'b', q); assert.ok(pv.total <= amt && pv.commission >= 5 && pv.spreadCost >= 0);
    for (const k of ['qty', 'px', 'fill', 'spreadCost', 'commission', 'total', 'qtyAfter', 'valueAfter', 'ifSoldNow']) assert.ok(Number.isFinite(pv[k]), k);
    const c0 = st.cash; const r1 = MKT.trade(st, c.id, 'b', q, OUT(), CTX, { noMandate: true }); assert.ok(r1.ok, r1.error); const r2 = MKT.trade(st, c.id, 's', q, OUT(), CTX); assert.ok(r2.ok);
    const lost = c0 - st.cash; assert.ok(lost >= Math.floor(2 * q * c.px * MKT.halfSpread(st, c.id) / 100) + 2 * 5 - 2, `roundtrip ${c.tk} lost ${lost}`); }
  const h = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 4 }); const c = MKT.liveCos(h)[0];
  assert.equal(MKT.trade(h, c.id, 'b', 1e12, OUT(), CTX).ok, false, 'no cash, no buy'); assert.equal(MKT.trade(h, c.id, 's', 1, OUT(), CTX).ok, false, 'no position, no sale');
  c.status = 'halted'; assert.match(MKT.tradeBlock(h, c.id), /מושהה/); c.status = 'listed';
  const q = MKT.qtyFor(h, c.id, 1e7); MKT.trade(h, c.id, 'b', q, OUT(), CTX); c.px = Math.round(c.px * 1.5); c.open.c = c.px; const t = MKT.trade(h, c.id, 's', q, OUT(), CTX); assert.ok(t.tax > 0, 'a gain is taxed 25 %');
  const q2 = MKT.qtyFor(h, c.id, 1e7); MKT.trade(h, c.id, 'b', q2, OUT(), CTX); c.px = Math.round(c.px * 0.5); c.open.c = c.px; const lc0 = h.life.lossCarry; MKT.trade(h, c.id, 's', q2, OUT(), CTX); assert.ok(h.life.lossCarry > lc0, 'a loss is carried');
  const z = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 4 }); const zt = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 4 }); const id = MKT.liveCos(z)[0].id;
  assert.ok(MKT.halfSpread(z, id) < MKT.halfSpread(zt, id), 'the trader\'s spread is smaller');
});

await test('M-size + numeric safety: 120 games × 200 paydays — st.mkt ≤ 40 KB, no NaN / Infinity anywhere, money integers, prices ≥ 1 agora', () => {
  let maxB = 0;
  for (let s = 0; s < 120; s++) { const st = stepped(12000 + s, 200, ['allocator', 'blockHeir', 'floorTrader'][s % 3]);
    const js = JSON.stringify(st.mkt); maxB = Math.max(maxB, Buffer.byteLength(js)); assert.deepEqual(nonFinite(st.mkt), [], 'no NaN / Infinity');
    for (const c of Object.values(st.mkt.cos)) assert.ok(Number.isInteger(c.px) && c.px >= 1); for (const h of Object.values(st.mkt.held)) assert.ok(Number.isInteger(h.qty) && Number.isInteger(h.basis)); }
  assert.ok(maxB <= 40960, 'st.mkt bytes ' + maxB);
});

await test('no future information: the public view, the indicators and every news line never carry q, recov, the fraud follow-up or the regime exit', () => {
  const st = stepped(77, 60); const V = MKT.marketView(st); const js = JSON.stringify(V);
  for (const k of ['"q"', '"recov"', '"fraudBk"', '"poolKeys"', 'exit']) assert.ok(!js.includes(k), k);
  const m = E.metrics(E.createGame({ worldId: 'w10', seed: 77 })); const j2 = JSON.stringify(m.worldIndicators.market); assert.ok(!j2.includes('"q"') && !j2.includes('"recov"'));
  for (const c of V.cos) { assert.ok(c.cand.every((k) => k[0] <= st.month), 'candles only from the past'); assert.equal(c.open.c, c.px); }
  const pv = E.publicView(E.createGame({ worldId: 'w10', seed: 77 })); assert.ok(!JSON.stringify(pv).includes('"recov"'));
});

await test('regimes: every regime is reachable, minimum months hold, sector regimes name a listed sector; the index stays positive', () => {
  const seen = {}; for (let s = 0; s < 200; s++) { const st = stepped(15000 + s, 120);
    for (let i = 1; i < st.mkt.regimes.length; i++) { const [m0, r0] = st.mkt.regimes[i - 1]; const [m1] = st.mkt.regimes[i]; if (i > 1 || m0 > 1) assert.ok(m1 - m0 >= MKT.REGIMES[r0].min, `${r0} lasted ${m1 - m0}`); }
    for (const [, r] of st.mkt.regimes) seen[r] = 1; assert.ok(st.mkt.idx.px >= 1); }
  assert.deepEqual(Object.keys(seen).sort(), [...MKT.REGIME_IDS].sort());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
