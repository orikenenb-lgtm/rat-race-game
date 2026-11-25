#!/usr/bin/env node
// w21 בית ההשקעות הפרטי (engine side): lazy registration, the rule adapter `lbo` (fixed draws on stream `world`: 2 at init — the regime, a
// seed —, 8 per payday — the regime, one EBITDA draw per slot used or not, an event target —, 4 per 'W' landing), the sealed-bid auction
// against 2–4 rival funds (a bid wins only above every rival; the rivals follow the sealed potential — the winner's curse; the 100-day plan
// narrows the band), LBO debt with a covenant (a breach, then the lender takes the company unless an equity cure), the 18-month fix and the
// cash sweep (a leverage premium above 3 ×), exits by regime (sale, IPO, secondary, half, dividend recap), DPI = distributions ÷ PAID-IN, carry
// 20 % past 1 × paid-in, the fund's end (a forced sale at a discount), the extension (not for the first-time GP), the goal (DPI 2 + personal
// NW ₪400M, hold 2), Z actions replayed and verified, saves, fuzz, the public view, the pack. Run: node tests/w21.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, SLOTS, LB, REG, BIDS, dpi, paidIn, saleValue, lev, nav } from '../js/worlds/adapters/lbo.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w21 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 10, 1 of w12/w17/w19); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w21'), false); assert.throws(() => E.getWorld('w21'), /world_not_loaded/); assert.equal(E.LESSONS.some((l) => l.id === 'exit_deadline'), false);
  const w = await E.ensureWorld('w21'); assert.equal(w.mechanic, 'lbo'); assert.equal(w.minRules, 7); assert.deepEqual(w.mech[0].uses, ['auction', 'credit', 'holding', 'market']);
  for (const id of ['winners_curse', 'exit_deadline']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const w13 = (await import('../js/worlds/w13.js')).default; assert.deepEqual(w.lessonDefs.find((l) => l.id === 'winners_curse'), w13.lessonDefs.find((l) => l.id === 'winners_curse'), 'the shared lesson (w13 + w21) has one text, whichever pack loads first');
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w21'); assert.equal(m.status, 'lazy'); assert.equal(m.tier, 10); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.equal(m.maxMonths, w.maxMonths); assert.deepEqual(m.stars, w.stars);
  const base = Object.fromEntries(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w13', 'w14', 'w15', 'w16'].map((k) => [k, 1]));
  for (const k of ['w12', 'w17', 'w19']) assert.equal(isUnlockedBy('w21', { ...base, [k]: 1 }), true, k); assert.equal(isUnlockedBy('w21', { ...base, w18: 1, w20: 1 }), false);
});

const W = E.getWorld('w21'); const CH = W.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const untilPay = (st, n) => { let g = 0; const p0 = st.stats.paydays; while (!st.over && st.stats.paydays < p0 + n && g++ < 3000) step(st); };
const play = (cfg, r, { zRate = 0.25, maxTurns = 300, onTurn } = {}) => {
  const st = E.createGame(cfg);
  for (let t = 0; t < maxTurns && !st.over; t++) {
    if (r() < zRate) { const acts = E.worldActions(st).filter((a) => a.enabled); for (let j = 0; j < 3 && acts.length; j++) { const a = acts[Math.floor(r() * acts.length)]; E.worldAction(st, a.id, a.param); } }
    if (st.over) break;
    if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 20 && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } if (st.over) break; }
    E.rollDice(st); let ev = E.landing(st); let k = 0;
    while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = k > 3 ? (en.find((x) => ['ok', 'done', 'pass', 'decline'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; k++; }
    if (onTurn) onTurn(st, t);
  }
  return st;
};
const toW = (st) => { for (let g = 0; g < 900 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const F = (st) => st.world.lbo;
/** Put a company straight into the fund (as a won auction would), for the mechanics tests. */
const addCo = (st, { E: e = 100000000, u = 0.3, debt = 400000000, eq = 400000000, f = 0 } = {}) => { const S = F(st); const c = { id: S.nextId++, n: 'מפעל ' + (S.nextId - 1), kind: 0, E: e, u, f, eq, cost: eq + debt, debt, ring: Array(12).fill(Math.round(e / 12)), held: 0, breach: false, recapAt: -99, half: false, prem: 0.02 }; S.cos.push(c); S.dry -= eq; return c; };

await test('start: rules 7; the goal (DPI 2 + NW ₪400M, hold 2); the fund is the LPs\' money (worth 0 in your NW); the first-time GP has ₪1.5B and no extension', () => {
  assert.equal(E.createGame({ worldId: 'w21', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal.of.map((g) => [g.type, g.key || null, g.target]), [['modValue', 'dpi', 2], ['nw', null, 400000000]]); assert.equal(W.goal.hold, 2); assert.equal(W.maxMonths, 84);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w21', charId: ch, seed: 9 }); const S = F(st); const m = E.metrics(st);
    assert.equal(S.dry, S.C); assert.equal(S.cos.length, 0); assert.equal(S.end, 72); assert.equal(m.worldIndicators.panel.id, 'lbo'); assert.equal(dpi(st), 0);
    const fund = st.assets.find((a) => a.op && a.op.ck === 'lbo'); assert.equal(fund.value, 0); assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); }
  const g = F(E.createGame({ worldId: 'w21', charId: 'firstTimeGP', seed: 9 })); assert.equal(g.C, 1500000000); assert.equal(g.noExt, true);
  const o = F(E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 9 })); assert.equal(o.C, 3000000000); assert.equal(o.up, 1.2);
});

await test('fixed draws on stream `world`: 2 at init, exactly 8 per payday + 4 per W landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, W: DRAWS.landing.W }, { init: 2, month: 8, W: 4 }); assert.equal(DRAWS.month, SLOTS + 2);
  for (const ch of CH) { const A = E.createGame({ worldId: 'w21', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w21', charId: ch, seed: 77 });
    for (let t = 0; t < 110 && !A.over && !B.over; t++) { for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 4)) E.worldAction(A, a.id, a.param);
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); let b = E.landing(B);
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'bidhigh') || en.find((x) => x.id === 'dd') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (b && !B.over && k++ < 12) { const en = b.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; b = E.choose(B, b, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      if (A.over || B.over) break; assert.equal(A.rng.world, B.rng.world, `${ch} turn ${t}`); } }
});

await test('the auction: a bid wins only above every rival (the dealMaker\'s 5 % edge counts); the rivals follow the sealed potential (winner\'s curse); the 100-day plan narrows the band and costs fund money', () => {
  const st = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 31 }); const ev = toW(st); assert.ok(ev); assert.deepEqual(ev.options.map((o) => o.id), ['dd', 'bidlow', 'bidmid', 'bidhigh', 'pass']);
  const it = st.pending.item; const w0 = ev.data.band.hi - ev.data.band.lo; const dry0 = F(st).dry; let e2 = E.choose(st, E.currentEvent(st), 'dd').event; assert.ok(e2 && e2.data.dd); assert.ok(e2.data.band.hi - e2.data.band.lo < w0); assert.ok(F(st).dry < dry0);
  it.rv = [0.9, 0.95]; e2 = E.choose(st, E.currentEvent(st), 'bidmid').event; assert.equal(F(st).cos.length, 1, 'mid beats rivals at 0.95'); assert.equal(F(st).bought, 1);
  const c = F(st).cos[0]; assert.equal(c.debt, Math.round(it.E * 4 / 1000) * 1000); assert.equal(c.eq, Math.round(it.E * REG[F(st).regime].buy / 1000) * 1000 - c.debt);
  const x = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 31 }); toW(x); x.pending.item.rv = [1.05]; E.choose(x, E.currentEvent(x), 'bidmid'); assert.equal(F(x).cos.length, 0); assert.equal(F(x).lostBids, 1);
  const d = E.createGame({ worldId: 'w21', charId: 'dealMaker', seed: 31 }); toW(d); d.pending.item.rv = [1.03]; E.choose(d, E.currentEvent(d), 'bidmid'); assert.equal(F(d).cos.length, 1, 'the 5 % edge wins at 1.03');
  // the curse, statistically: the rivals' bids rise with the sealed potential, so the targets a mid bid wins have a lower potential on average
  let all = 0, nAll = 0, won = 0, nWon = 0; for (let s = 1; s < 200; s++) { const g = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: s }); const e = toW(g); if (!e) continue; const u = g.pending.item.u; all += u; nAll++;
    if (Math.max(...g.pending.item.rv) < BIDS.mid) { won += u; nWon++; } }
  assert.ok(nWon > 10 && won / nWon < all / nAll - 0.05, `won ${won / nWon} vs all ${all / nAll}`);
  const p = E.createGame({ worldId: 'w21', charId: 'firstTimeGP', seed: 22 }); toW(p); const snap = JSON.stringify(p.world.lbo); const cx = p.cash; E.choose(p, E.currentEvent(p), 'pass'); assert.equal(JSON.stringify(p.world.lbo), snap); assert.equal(p.cash, cx);
});

await test('the covenant: debt ÷ trailing EBITDA above the covenant is a breach; a second breach in a row and the lender takes the company; an equity cure from the fund restores it', () => {
  const st = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 5 }); const S = F(st); const c = addCo(st, { E: 100000000, debt: 700000000 });
  assert.ok(lev(c) > LB.cov); untilPay(st, 1); assert.equal(c.breach, true); assert.equal(S.breaches, 1);
  const cure = E.worldActions(st).find((a) => a.id === 'cure' && a.param === String(c.id)); assert.ok(cure && cure.enabled && cure.suggested); const d0 = S.dry; assert.ok(E.worldAction(st, 'cure', String(c.id)).ok);
  assert.equal(c.breach, false); assert.ok(lev(c) <= LB.cov - 1 + 0.01); assert.ok(S.dry < d0); assert.equal(S.cures, 1);
  const x = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 5 }); addCo(x, { E: 100000000, debt: 800000000 }); untilPay(x, 2); assert.equal(F(x).cos.length, 0); assert.equal(F(x).taken, 1); assert.equal(F(x).dist, 0);
});

await test('the fix and the sweep: EBITDA grows with the sealed potential as the fix completes (operating partner × 1.2); free cash pays the debt down; above 3 × debt pays a premium', () => {
  const a = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 7 }); const b = E.createGame({ worldId: 'w21', charId: 'dealMaker', seed: 7 });
  const ca = addCo(a, { u: 0.5, debt: 300000000 }); const cb = addCo(b, { u: 0.5, debt: 300000000 }); F(a).regime = F(b).regime = 'normal';
  untilPay(a, 20); untilPay(b, 20); assert.equal(ca.f, 1); assert.ok(cb.f < 1); assert.ok(ca.debt < 300000000, 'swept ' + ca.debt);
  assert.ok(ca.ring.reduce((x, y) => x + y, 0) > 100000000 * 1.3, 'grew ' + ca.ring.reduce((x, y) => x + y, 0));
  const s = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 31 }); assert.ok(E.worldAction(s, 'lev', '5').ok); assert.equal(E.worldAction(s, 'lev', '5').ok, false); assert.equal(E.worldAction(s, 'lev', '6').ok, false);
  toW(s); s.pending.item.rv = [0.5]; const e = E.currentEvent(s); if (e.options.find((o) => o.id === 'bidlow' && o.enabled)) { E.choose(s, e, 'bidlow'); assert.equal(F(s).cos[0].prem, 0.04); }
});

await test('exits: a sale = trailing EBITDA × the regime multiple (+2 fixed) − debt, none in a crash; IPO only in bull / normal; secondary at −15 %; half; the dividend recap once a year; all cash goes to DPI', () => {
  const st = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 9 }); const S = F(st); S.regime = 'normal'; const c = addCo(st, { f: 1 });
  const ttm = c.ring.reduce((x, y) => x + y, 0); assert.equal(saleValue(st, c), Math.round(Math.max(0, ttm * (REG.normal.mult + LB.fixedUp) - c.debt) / 1000) * 1000); assert.equal(nav(st), saleValue(st, c));
  S.regime = 'crash'; assert.equal(E.worldAction(st, 'sell', String(c.id)).ok, false); assert.equal(E.worldAction(st, 'ipo', String(c.id)).ok, false); S.regime = 'bear'; assert.equal(E.worldAction(st, 'ipo', String(c.id)).ok, false);
  S.regime = 'normal'; const add = Math.round((ttm * LB.recap - c.debt) / 1000) * 1000; assert.ok(E.worldAction(st, 'recap', String(c.id)).ok); assert.equal(S.dist, add); assert.equal(E.worldAction(st, 'recap', String(c.id)).ok, false, 'once a year');
  assert.ok(E.worldAction(st, 'partial', String(c.id)).ok); assert.equal(c.half, true); assert.equal(E.worldAction(st, 'partial', String(c.id)).ok, false);
  const v = Math.round(saleValue(st, c) * LB.sec / 1000) * 1000; const d0 = S.dist; assert.ok(E.worldAction(st, 'secondary', String(c.id)).ok); assert.equal(S.dist, d0 + v); assert.equal(S.cos.length, 0); assert.equal(S.exits, 1);
  const i = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 9 }); F(i).regime = 'bull'; const ci = addCo(i, { f: 1 }); assert.ok(E.worldAction(i, 'ipo', String(ci.id)).ok); assert.ok(F(i).dist > 0);
});

await test('DPI = distributions ÷ PAID-IN (marks count 0); carry = 20 % past 1 × paid-in, paid in cash, never clawed back; management fees in your cash', () => {
  const st = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 9 }); const S = F(st); const c = addCo(st, { f: 1, eq: 500000000 });
  assert.equal(dpi(st), 0, 'a mark is not a distribution'); assert.equal(paidIn(st), S.C - S.dry); assert.equal(paidIn(st), 500000000);
  S.regime = 'bull'; const cash0 = st.cash; const v = saleValue(st, c); assert.ok(v > 500000000); E.worldAction(st, 'sell', String(c.id));
  assert.equal(S.dist, v); assert.equal(dpi(st), Math.round(v / 500000000 * 1000) / 1000); const carry = Math.round((v - 500000000) * LB.carry / 1000) * 1000; assert.equal(S.carryPaid, carry); assert.equal(st.cash, cash0 + carry);
  const k0 = S.carryPaid; addCo(st, { eq: 2000000000 }); assert.ok(dpi(st) < 1); assert.equal(S.carryPaid, k0, 'no clawback');
  const f = E.createGame({ worldId: 'w21', charId: 'dealMaker', seed: 4 }); const c0 = f.cash; untilPay(f, 1); assert.ok(F(f).fees > 0); assert.ok(f.cash > c0, 'fee share in cash'); assert.ok(F(f).dry < F(f).C, 'fees are paid in');
});

await test('the fund\'s end: whatever is left is sold at once at a forced-sale discount in the regime of the day (lesson exit_deadline); no bids in the last year; the extension (last 6 months, half fees; never for the first-time GP)', () => {
  const st = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 9 }); const S = F(st); const c = addCo(st, { f: 1 }); S.end = st.month + 1; const want = saleValue(st, c, LB.forced);
  untilPay(st, 2); assert.equal(S.cos.length, 0); assert.equal(S.forced, 1); assert.ok(S.dist > 0 && S.dist <= Math.max(want * 1.6, 1)); assert.ok(st.lessons.includes('exit_deadline'));
  const b = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 31 }); F(b).end = b.month + 10; toW(b); const ev = E.currentEvent(b); assert.ok(ev.options.filter((o) => o.id.startsWith('bid')).every((o) => !o.enabled));
  const x = E.createGame({ worldId: 'w21', charId: 'dealMaker', seed: 9 }); assert.equal(E.worldAction(x, 'extend', null).ok, false, 'too early'); F(x).end = x.month + 5; assert.ok(E.worldAction(x, 'extend', null).ok); assert.equal(F(x).end, x.month + 5 + LB.ext); assert.equal(E.worldAction(x, 'extend', null).ok, false);
  const g = E.createGame({ worldId: 'w21', charId: 'firstTimeGP', seed: 9 }); F(g).end = g.month + 5; assert.equal(E.worldAction(g, 'extend', null).ok, false); assert.ok(!E.worldActions(g).some((a) => a.id === 'extend'));
});

await test('Z actions logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) { const st = play({ worldId: 'w21', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i); assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i); }
  const st = E.createGame({ worldId: 'w21', charId: 'operatingPartner', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['sell', 'nope'], ['ipo', 'x'], ['cure', '1'], ['lev', '9'], ['extend', null], ['recap', '1']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'lev', '3').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the fund worth 0 to you, dry powder ≥ 0, ≤ 6 companies, DPI = dist ÷ paid-in, goal progress in [0, 1]', () => {
  for (let i = 0; i < 9; i++) play({ worldId: 'w21', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.4, maxTurns: 160, onTurn: (s) => { if (s.over) return; const m = E.metrics(s);
    for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
    assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const S = F(s);
    assert.equal(s.assets.find((a) => a.op && a.op.ck === 'lbo').value, 0); for (const k of ['dry', 'dist', 'carryPaid', 'fees']) assert.ok(Number.isInteger(S[k]) && S[k] >= 0, k + ' = ' + S[k]);
    assert.ok(S.cos.length <= SLOTS); assert.ok(S.cos.every((c) => Number.isFinite(c.debt) && c.debt >= 0 && c.ring.length <= 12)); assert.equal(dpi(s), Math.round(S.dist / paidIn(s) * 1000) / 1000); assert.ok(Object.keys(REG).includes(S.regime)); } });
});

await test('rooms: the public view carries no sealed value (the potential u, the rivals\' bids, the landing draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w21', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toW(st); const pv = E.publicView(st); const js = JSON.stringify(pv);
    const mod = JSON.stringify(pv.metrics.worldIndicators) + JSON.stringify(pv.event || null);
    for (const k of ['"wr"', '"rv"']) assert.ok(!js.includes(k), ch + ' ' + k); for (const k of ['"u":', '"c0":', '"c1":']) assert.ok(!mod.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the adapter (≤ 350 lines, uses:); the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w21 pack (the world, the lbo adapter); a w21 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w21; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w21.js', 'worlds/adapters/lbo.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w21 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w21').id, 'w21');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w21', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w21', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w21 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
