#!/usr/bin/env node
// w17 גבעת המעבדות (engine side): lazy registration, the rule adapter `trials` (fixed draws on stream `world`: 8 at init — one per slot —,
// 10 per payday — one per slot, the biotech sector, an event target —, 3 per 'V' landing), the four public stages on the `stages` lib's build
// record (paid from cash month by month; no cash → the stage stalls), printed odds with a sealed quality whose shown band always contains it
// and narrows with due diligence and every passed readout (the scientist sees hers exactly), continue / abandon / license / partner at a
// readout (a real option: the value of paying for the next stage counts the option to stop later), the ramp to peak sales and the patent
// cliff, the pipeline at cost and a drug at 5× its trailing annual profit capped by the years to the cliff, the goal (nw ₪1.2B + 2 products
// earning), the V card (due diligence, purchase, pass is safe), Z actions replayed and verified, saves, fuzz, the public view, the pack.
// Run: node tests/w17.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS, SLOTS, PH, TEMPLATES, TR, bandOf, oddsOf, rnpv, pLaunch, licTerms, drugValue, valueOf } from '../js/worlds/adapters/trials.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w17 is not loaded by the engine; ensureWorld loads it; meta agrees (tier 9, 1 of w11/w15); its lessons arrive with its pack', async () => {
  assert.equal(E.isLoaded('w17'), false); assert.throws(() => E.getWorld('w17'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'real_option'), false);
  const w = await E.ensureWorld('w17'); assert.equal(w.id, 'w17'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'trials'); assert.deepEqual(w.modules, ['trials']); assert.deepEqual(w.mech[0].uses, ['stages', 'market', 'dd']);
  for (const id of ['real_option', 'patent_cliff', 'sunk_cost']) assert.ok(E.LESSONS.some((l) => l.id === id), id);
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w17');
  assert.equal(m.status, 'lazy'); assert.equal(m.playable, true); assert.equal(m.tier, 9); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w11', 'w15'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w17', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w15: 1 }), true); assert.equal(isUnlockedBy('w17', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w10: 1, w14: 1 }), false);
});

const W = E.getWorld('w17'); const CH = W.characters.map((c) => c.id);
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
const toV = (st) => { for (let g = 0; g < 900 && !st.over; g++) { st.pending = null; st.phase = 'roll'; E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };

await test('start: rules 7; net worth ₪200–400M; the goal is nw ₪1.2B + 2 products earning, hold 2; the scientist sees her molecules exactly, the others see the ±10 pp prior', () => {
  assert.equal(E.createGame({ worldId: 'w17', seed: 3, rules: 4 }).rules, 7);
  assert.deepEqual(W.goal, { type: 'all', hold: 2, of: [{ type: 'nw', target: 1200000000 }, { type: 'modValue', key: 'productsEarning', target: 2, label: 'תרופות שמרוויחות' }] });
  for (const ch of CH) { const st = E.createGame({ worldId: 'w17', charId: ch, seed: 9 }); const m = E.metrics(st); const L = st.world.trials;
    assert.ok(m.netWorth >= 200e6 && m.netWorth <= 400e6, ch + ' nw ' + m.netWorth); assert.equal(m.worldIndicators.panel.id, 'trials'); assert.equal(L.slots.length, SLOTS);
    assert.deepEqual(m.goalParts.map((p) => p.key), ['netWorth', 'productsEarning']);
    for (const c of L.slots.filter((x) => x && x.s === 'dec')) { const b = bandOf(st, c); if (ch === 'scientist') assert.deepEqual(b, { lo: c.q, hi: c.q }); else assert.deepEqual(b, { lo: -TR.band, hi: TR.band }); assert.ok(c.q >= -0.1 && c.q <= 0.1); } }
  assert.equal(E.createGame({ worldId: 'w17', charId: 'bioInvestor', seed: 9 }).world.trials.slots.filter(Boolean).length, 0);
  const v = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed: 9 }); assert.equal(E.metrics(v).worldIndicators.trials.earning, 1);
});

await test('fixed draws on stream `world`: 8 at init, exactly 10 per payday + 3 per V landing — opposite players stay aligned', () => {
  assert.deepEqual({ init: DRAWS.init, month: DRAWS.month, V: DRAWS.landing.V }, { init: 8, month: 10, V: 3 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w17', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w17', charId: ch, seed: 77 }); let vA = 0;
    for (let t = 0; t < 110 && !A.over && !B.over; t++) {
      E.rollDice(A); E.rollDice(B); let a = E.landing(A); const b = E.landing(B); if (A.pending && A.pending.type === 'mech') vA++;
      let k = 0; while (a && !A.over && k++ < 12) { const en = a.options.filter((o) => o.enabled); const o = en.find((x) => x.id === 'buy') || en.find((x) => x.id === 'check') || en[0]; a = E.choose(A, a, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, b); for (const x of E.worldActions(A).filter((q) => q.enabled && ['go', 'discover', 'license'].includes(q.id))) { if (A.over) break; E.worldAction(A, x.id, x.param); }
      assert.deepEqual(A.rng, B.rng, `${ch} turn ${t}`);
    }
    assert.ok(vA > 0);
  }
});

await test('stages: go pays the stage month by month from cash (the stages build record), no cash → it stalls; a readout uses the slot\'s draw at the true odds; a pass narrows the band, a failure cracks the flask and frees the slot a payday later', () => {
  const st = E.createGame({ worldId: 'w17', charId: 'scientist', seed: 5 }); const L = st.world.trials; const i = L.slots.findIndex((c) => c && c.s === 'dec'); const c = L.slots[i];
  const cost = Math.round(PH[c.ph].cost * TEMPLATES[c.t].cm); const s0 = c.spent; assert.ok(E.worldAction(st, 'go', String(i)).ok); assert.equal(c.s, 'run'); assert.equal(c.b.stageMonths, PH[c.ph].m);
  const c0 = st.cash; untilPay(st, 1); assert.ok(c.spent - s0 === Math.round(cost / PH[c.ph].m) || c.s !== 'run', 'one month of the stage'); assert.ok(st.cash < c0 + Math.abs(E.metrics(st).cashflow) + 1);
  const b = E.createGame({ worldId: 'w17', charId: 'scientist', seed: 5 }); const j = b.world.trials.slots.findIndex((x) => x && x.s === 'dec'); E.worldAction(b, 'go', String(j)); b.cash = 0; untilPay(b, 1); assert.ok(b.world.trials.slots[j].stalled >= 1, 'stalls without cash');
  let pass = 0, fail = 0;
  for (let seed = 1; seed < 30 && (pass < 1 || fail < 1); seed++) { const x = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed }); const X = x.world.trials; const k = X.slots.findIndex((q) => q && q.s === 'dec'); const q = X.slots[k]; const ph0 = q.ph; E.worldAction(x, 'go', String(k)); x.cash += 500e6;
    let g = 0; while (!x.over && X.slots[k] === q && q.s === 'run' && g++ < 400) step(x);
    if (q.s === 'dec' && q.ph === ph0 + 1) { pass++; assert.equal(q.rev, 1); const w = bandOf(x, q); assert.ok(w.lo <= q.q + 1e-9 && q.q <= w.hi + 1e-9 && w.hi - w.lo <= TR.band + 1e-9); }
    if (q.s === 'dead') { fail++; untilPay(x, 1); assert.equal(X.slots[k], null, 'the slot is free a payday later'); } }
  assert.ok(pass >= 1 && fail >= 1, `pass ${pass} fail ${fail}`);
});

await test('real options: the value of the next stage counts the option to stop later (≥ the commit-to-all value); license terms grow with the stage; sunk cost is not in the decision', () => {
  const st = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed: 7 }); const c = st.world.trials.slots.find((x) => x && x.s === 'dec');
  let p = 1, cost = 0; for (let k = c.ph; k < 4; k++) { cost += p * Math.round(PH[k].cost * TEMPLATES[c.t].cm); p *= oddsOf(st, c, k); }
  const commit = p * TEMPLATES[c.t].peak * 12 * TR.margin * Math.min(TR.mult, TEMPLATES[c.t].life / 12) * 0.75 - cost; assert.ok(rnpv(st, c) >= Math.round(commit) - 1, `${rnpv(st, c)} ≥ ${Math.round(commit)}`);
  const v0 = rnpv(st, c); const s0 = c.spent; c.spent += 50e6; assert.equal(rnpv(st, c), v0, 'what was spent does not change the value of going on'); c.spent = s0;
  const early = { ...c, ph: 0 }, late = { ...c, ph: 2 }; assert.ok(licTerms(st, late).roy > licTerms(st, early).roy); assert.ok(pLaunch(st, late) > pLaunch(st, early));
  const vet = licTerms(st, c).up; const sc = E.createGame({ worldId: 'w17', charId: 'bioInvestor', seed: 7 }); sc.world.trials.slots[0] = { ...c }; assert.ok(vet > licTerms(sc, sc.world.trials.slots[0]).up, 'the pharma veteran gets 20 % better terms');
});

await test('stop / license / partner: abandon returns 5 % of the cost so far; a licensed program runs at the partner\'s cost and pays a royalty if approved; a partner pays half the stage and takes half the profit', () => {
  const st = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed: 11 }); const L = st.world.trials; const i = L.slots.findIndex((c) => c && c.s === 'dec'); const c = L.slots[i];
  const c0 = st.cash; const sal = Math.round(c.spent * TR.salvage / 1000) * 1000; assert.ok(E.worldAction(st, 'stop', String(i)).ok); assert.equal(st.cash - c0, sal); assert.equal(L.slots[i], null); assert.ok(L.lost > 0);
  const b = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed: 11 }); const j = b.world.trials.slots.findIndex((x) => x && x.s === 'dec'); const q = b.world.trials.slots[j]; const t = licTerms(b, q); const c1 = b.cash;
  assert.ok(E.worldAction(b, 'license', String(j)).ok); assert.equal(b.cash - c1, t.up); assert.equal(q.lic, t.roy); assert.equal(q.s, 'run'); const sp = q.spent; untilPay(b, 2); assert.equal(q.spent, sp, 'the partner pays');
  const d = E.createGame({ worldId: 'w17', charId: 'scientist', seed: 11 }); const k = d.world.trials.slots.findIndex((x) => x && x.s === 'dec'); const r = d.world.trials.slots[k]; assert.ok(E.worldAction(d, 'partner', String(k)).ok); assert.equal(r.co, 0.5); assert.ok(E.worldAction(d, 'go', String(k)).ok);
  const s0 = r.spent; untilPay(d, 1); if (r.s === 'run') assert.equal(r.spent - s0, Math.round(Math.round(PH[r.ph].cost * TEMPLATES[r.t].cm * 0.5) / PH[r.ph].m));
});

await test('drugs: ramp to peak over 9 months, value = 5 × trailing annual profit capped by the years to the cliff (its cost until 6 months of sales); at the cliff sales fall 80 %; a royalty sale pays cash now', () => {
  const st = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed: 13 }); const L = st.world.trials; const d = L.slots.find((c) => c && c.s === 'drug'); assert.ok(d);
  const yrs = Math.min(TR.mult, Math.max(1, (d.cliffM - st.month) / 12)); const tr = d.ring.reduce((a, b) => a + b, 0) / d.ring.length * 12; assert.equal(drugValue(st, d), Math.round(Math.round(tr * yrs) / 1000) * 1000);
  const last0 = d.last; let g = 0; while (!st.over && st.month < d.cliffM + 1 && g++ < 400) step(st); assert.ok(d.cliffed); assert.ok(d.last <= Math.round(last0 * TR.cliff) + 1, `${d.last} vs ${last0}`); assert.ok(L.cliffs >= 1);
  const b = E.createGame({ worldId: 'w17', charId: 'pharmaVet', seed: 13 }); const i = b.world.trials.slots.findIndex((c) => c && c.s === 'drug'); const c1 = b.cash; const v = drugValue(b, b.world.trials.slots[i]);
  assert.ok(E.worldAction(b, 'royalty', String(i)).ok); assert.equal(b.cash - c1, Math.round(v * TR.roySale * TR.royPx / 1000) * 1000); assert.equal(E.worldAction(b, 'royalty', String(i)).ok, false);
  assert.equal(valueOf(b), b.assets.find((a) => a.op && a.op.ck === 'lab').value);
});

await test('V card: due diligence narrows the band to ±3 pp around the truth; buy (into a free slot, cost basis = the price); pass (the safe option) changes nothing; the investor buys 30 % cheaper', () => {
  const st = E.createGame({ worldId: 'w17', charId: 'bioInvestor', seed: 21 }); const ev = toV(st); assert.ok(ev); const it = st.pending.item;
  assert.deepEqual(ev.data.shift, { lo: -TR.band, hi: TR.band }); const e1 = E.choose(st, E.currentEvent(st), 'check').event; const b = e1.data.shift; assert.ok(b.lo <= it.q + 1e-9 && it.q <= b.hi + 1e-9 && Math.abs(b.hi - b.lo - 2 * TR.ddBand) < 1e-6);
  const price = e1.data.price; st.cash += 500e6; const c0 = st.cash; E.choose(st, E.currentEvent(st), 'buy'); assert.equal(c0 - st.cash, price); const c = st.world.trials.slots.find((x) => x && x.spent === price); assert.ok(c && c.dd === 1);
  const x = E.createGame({ worldId: 'w17', charId: 'scientist', seed: 22 }); toV(x); const snap = JSON.stringify(x.world.trials); const cx = x.cash; E.choose(x, E.currentEvent(x), 'pass'); assert.equal(JSON.stringify(x.world.trials), snap); assert.equal(x.cash, cx);
});

await test('Z actions: go / stop / license / partner / discover / royalty / plant; logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w17', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w17', charId: 'bioInvestor', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['go', '0'], ['go', '9'], ['stop', 'x'], ['license', '0'], ['royalty', '0'], ['partner', '3']]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'discover', null).ok); assert.ok(E.worldAction(st, 'plant', null).ok); assert.equal(st.actions.length, n0 + 2);
  untilPay(st, TR.discM + 1); assert.ok(st.world.trials.slots[0] && st.world.trials.slots[0].s === 'dec', 'the lab found a molecule');
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, the lab asset = the pipeline at cost + the drugs + the plant, goal progress in [0, 1]', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w17', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      if (s.over) return; const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities); assert.equal(s.assets.find((a) => a.op && a.op.ck === 'lab').value, valueOf(s));
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); for (const c of s.world.trials.slots) if (c && c.s !== 'lab') { assert.ok(Number.isInteger(c.spent) && c.spent >= 0); const b = bandOf(s, c); assert.ok(b.lo <= c.q + 1e-9 && c.q <= b.hi + 1e-9); }
    } });
  }
});

await test('rooms: the public view carries no sealed value (qualities, jitters, init draws, the landing draws)', () => {
  for (const ch of CH) { const st = play({ worldId: 'w17', charId: ch, seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 }); toV(st);
    const js = JSON.stringify(E.publicView(st)); for (const k of ['"q"', '"j"', '"inits"', '"wr"']) assert.ok(!js.includes(k), ch + ' ' + k); }
});

await test('lint + validator: exact arithmetic in the adapter (≤ 350 lines, uses:); fictional molecule names; the validator is clean', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.lintModules(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.checkTrials(), []); assert.deepEqual(V.validate().errors, []);
});

await test('verifier: core bundle + the w17 pack (the world, its adapter and the stages lib); a w17 game verifies; a tampered result fails', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE); const pk = all.packs.w17; assert.ok(pk && pk.text.length <= MAX_PACK && pk.text.length <= V.MAX_PACK, 'pack ' + (pk && pk.text.length));
  assert.ok(['worlds/w17.js', 'worlds/adapters/trials.js', 'worlds/mech/stages.js'].every((f) => f in pk.files), Object.keys(pk.files).join(','));
  const pin = readFileSync(new URL('../supabase/functions/verify-result/engine_pin.js', import.meta.url), 'utf8'); assert.ok(pin.includes(pk.hash), 'the w17 pack is pinned');
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, pk.text); assert.equal(EE.getWorld('w17').id, 'w17');
  let ok = 0;
  for (let i = 0; i < 12 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w17', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w17', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const out = V.verifyGame(EE, row, st.actions); assert.ok(out.ok, `w17 game ${i} should verify: ${out.error}`); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok); console.log(`   pack ${pk.text.length} chars · core ${all.core.text.length} chars`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
