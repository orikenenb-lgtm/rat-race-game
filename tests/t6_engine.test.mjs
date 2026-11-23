// T6 engine part (spec docs/next-level/specs/T6-rivals-summary.md §3, §4, §5.1, §6.2, §9, §10): deal competition (stream 'rival'),
// timeline / marks / luck log / k0, recap, continue after win (W / X), archetype policies (js/systems/archetypes.js).
//   node tests/t6_engine.test.mjs [scale]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import * as RV from '../js/systems/rivals.js';
import * as AR from '../js/systems/archetypes.js';
import { STREAMS, next } from '../js/rng.js';
import { CODES } from '../supabase/functions/verify-result/verify_core.js';
import { prng, playOut } from './lib/random-player.mjs';

await E.loadRealData();
const SCALE = +(process.argv[2] || 1);
const N = (n) => Math.max(1, Math.round(n * SCALE));
let passed = 0, failed = 0;
function test(name, fn) { const t0 = Date.now(); try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n  ${e.stack.split('\n').slice(0, 5).join('\n  ')}`); } }
const clone = (x) => JSON.parse(JSON.stringify(x));
const INC = 0x6D2B79F5n; const MOD = 1n << 32n;
const inv = (() => { let t = 0n, nt = 1n, r = MOD, nr = INC; while (nr) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; } return ((t % MOD) + MOD) % MOD; })();
const draws = (a, b) => Number((((BigInt(b >>> 0) - BigInt(a >>> 0)) % MOD + MOD) % MOD * inv) % MOD);
const WORLDS = ['w1', 'w2', 'w3', 'w4'];
const charOf = (w, i) => { const cs = E.getWorld(w).characters; return cs[i % cs.length].id; };

/** resolve the open card with a chooser f(ev, n) → option (default: the first safe option) */
function resolve(st, f) { let ev = E.currentEvent(st); let n = 0; while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = (n >= 4 ? null : f && f(ev, n, en)) || en.find((x) => ['ok', 'done', 'pass', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; if (n > 40) throw new Error('loop'); } }
/** a random player that also takes delay steps (inspect / offer) and may continue after a win (free) and retire */
function randomGame(cfg, r, { maxRolls = 900, afterWin = true } = {}) {
  const st = E.createGame(cfg);
  for (let i = 0; i < maxRolls; i++) {
    if (st.over) { if (afterWin && st.over === 'won' && st.mode === 'free' && !st.afterWin && r() < 0.7) { E.continueAfterWin(st); continue; } break; }
    if (st.afterWin && r() < 0.03 && !st.pending) { E.retire(st); break; }
    if (r() < 0.03) E.takeLoan(st); if (st.over) continue;
    if (st.pending) { resolve(st, (ev, n, en) => en[Math.floor(r() * en.length)]); continue; }
    E.rollDice(st); E.landing(st);
    resolve(st, (ev, n, en) => { const delay = en.filter((o) => o.kind === 'inspect' || o.kind === 'offer'); if (delay.length && r() < 0.5) return delay[Math.floor(r() * delay.length)]; if (r() < 0.3) return en.find((o) => o.primary); return en[Math.floor(r() * en.length)]; });
  }
  return st;
}

test('AC-1 streams: order unchanged; rival +4 on every deal / mystery landing (rules 4), 0 elsewhere; rules 3 never; listing never', () => {
  assert.deepEqual(STREAMS, ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index', 'dd', 'cycle', 'rival', 'listing', 'story', 'world']);
  let deals = 0;
  for (const rules of [4, 3]) for (const w of WORLDS) {
    const st = E.createGame({ worldId: w, seed: 77, rules }); const l0 = st.rng.listing; const r = prng(5);
    for (let i = 0; i < 160 && !st.over; i++) {
      if (st.pending) { resolve(st); continue; }
      E.rollDice(st); const before = st.rng.rival; const tile = E.getWorld(w).tiles[E.getWorld(w).board[st.pos]].type; E.landing(st);
      const d = draws(before, st.rng.rival);
      if (rules === 4 && (tile === 'deal' || tile === 'mystery')) { assert.equal(d, 4, `${w} ${tile}`); deals++; } else assert.equal(d, 0, `${w} rules ${rules} ${tile}`);
      resolve(st, (ev, n, en) => en[Math.floor(r() * en.length)]);
    }
    assert.equal(st.rng.listing, l0, 'listing never drawn');
  }
  assert.ok(deals > 40);
});

test(`AC-2/AC-6b fixed draws: buy now / delay / pass / noRival leave every stream identical after every landing; same cards ⇒ same interest (${N(40)} seeds × 4 worlds)`, () => {
  const SCRIPTS = {
    buy: (ev, n, en) => en.find((o) => o.kind === 'buy'),
    delay: (ev, n, en) => en.find((o) => o.kind === 'inspect') || en.find((o) => o.kind === 'offer') || en.find((o) => o.kind === 'buy'),
    pass: () => null,
  };
  let compared = 0, cards = 0;
  for (const w of WORLDS) for (let s = 0; s < N(40); s++) {
    const games = Object.entries(SCRIPTS).map(([k, f]) => ({ k, f, st: E.createGame({ worldId: w, charId: charOf(w, s), seed: 9000 + s }) }));
    games.push({ k: 'noRival', f: SCRIPTS.delay, st: E.createGame({ worldId: w, charId: charOf(w, s), seed: 9000 + s, _dev: { noRival: true } }) });
    for (let t = 0; t < 50; t++) {
      for (const g of games) { if (g.st.over || g.st.pending) continue; E.rollDice(g.st); E.landing(g.st); }
      const live = games.filter((g) => !g.st.over);
      if (live.length < 2) break;
      const ref = live[0].st;
      for (const g of live.slice(1)) { for (const k of STREAMS) if (!['story'].includes(k)) assert.equal(g.st.rng[k], ref.rng[k], `${w}/${s} t${t} ${g.k}: stream ${k}`); compared++; }
      const rvs = live.filter((g) => g.k !== 'noRival' && g.st.pending && g.st.pending.rv).map((g) => JSON.stringify(g.st.pending.rv));
      if (rvs.length > 1) { assert.ok(rvs.every((x) => x === rvs[0]), 'same card ⇒ same p.rv'); cards++; }
      for (const g of live) resolve(g.st, g.f);
    }
  }
  assert.ok(compared > 500 && cards > 50, `compared ${compared}, cards ${cards}`);
});

test(`AC-3 replay is byte-identical (tl, marks, luckLog, rivalDeals, afterWin) with delay steps and W / X (${N(60)} games per world)`, () => {
  let w_ = 0, x_ = 0, lost = 0;
  for (const w of WORLDS) for (let g = 0; g < N(60); g++) {
    const st = randomGame({ worldId: w, charId: charOf(w, g), seed: 400 + g * 17, mode: g % 6 === 5 ? 'weekly' : 'free' }, prng(g * 3 + 1));
    w_ += st.actions.filter((a) => a[0] === 'W').length; x_ += st.actions.filter((a) => a[0] === 'X').length; lost += st.stats.rivalLost || 0;
    const r = E.replay(E.replayConfig(st), st.actions);
    assert.equal(E.serialize(r), E.serialize(st), `${w}/${g}`);
  }
  assert.ok(lost > 10, 'deals were lost to rivals: ' + lost);
  console.log(`   (W ${w_}, X ${x_}, lost deals ${lost})`);
});

/** deal states with interest (n ≥ 1), collected from random games */
function rivalStates(n, seed0) {
  const out = []; let g = 0;
  while (out.length < n && g < n * 10) {
    const w = WORLDS[g % 4]; const st = E.createGame({ worldId: w, charId: charOf(w, g), seed: seed0 + g * 31, mentor: ['guide', 'hint', 'pro'][g % 3] }); const r = prng(seed0 + g); g++;
    for (let t = 0; t < 140 && !st.over && out.length < n; t++) {
      if (st.pending) { resolve(st, (ev, k, en) => en[Math.floor(r() * en.length)]); continue; }
      E.rollDice(st); E.landing(st);
      if (st.pending && st.pending.rv && st.pending.rv.n >= 1 && !E.currentEvent(st).auto) out.push(E.serialize(st));
      resolve(st, (ev, k, en) => { const d = en.filter((o) => o.kind === 'inspect' || o.kind === 'offer'); return d.length && r() < 0.6 ? d[0] : en[Math.floor(r() * en.length)]; });
    }
  }
  return out;
}
const SEALED = ['close', 'taker', 'truth', 'rng', 'decks', 'negR'];
function scan(o, path, hits) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const p = path + '.' + k; if (SEALED.includes(k)) hits.push(p); scan(v, p, hits); } }

test(`AC-4 sealed: scrambling p.rv.close / taker and unrevealed rivalDeals[].truth leaves describe, scoreOptions, hint, impactFor, publicView byte-identical (${N(150)} states)`, () => {
  const states = rivalStates(N(150), 700);
  // states with unrevealed lost deals too
  let unrevealed = 0;
  for (const json of states) {
    const st = E.deserialize(json);
    if (st.rivalDeals.some((d) => !d.revealed)) unrevealed++;
    const view = (s) => { const ev = E.currentEvent(s); const c = E.deserialize(E.serialize(s)); const h = c.mentor === 'pro' ? null : E.requestHint(c).hint;
      const imps = ev.options.filter((o) => o.enabled && (o.major || o.kind === 'inspect' || o.kind === 'offer')).map((o) => E.impactFor(s, o.id));
      const pv = E.publicView(s, { freeze: false }); return JSON.stringify({ ev, sc: E.scoreOptions(s, ev), h, imps, pv }); };
    const hits = []; scan(E.publicView(st, { freeze: false }), '$', hits); assert.deepEqual(hits, [], 'sealed key in publicView');
    const v0 = view(st);
    for (let k = 0; k < 2; k++) {
      const s2 = E.deserialize(json); const r = prng(k + 7);
      s2.pending.rv.close = Math.floor(r() * 4); s2.pending.rv.taker = s2.pending.rv.close ? s2.pending.rv.who[Math.floor(r() * s2.pending.rv.n)] : null;
      for (const d of s2.rivalDeals) if (!d.revealed) d.truth = { cf: Math.round(r() * 5000) - 2000, value: Math.round(r() * 1e6), repair: 100 * Math.floor(r() * 40) };
      assert.equal(view(s2), v0, 'a competition seal leaked');
    }
  }
  assert.ok(states.length >= N(150) * 0.8 && unrevealed > 0, `states ${states.length} unrevealed ${unrevealed}`);
});

test(`AC-5 / AC-7 no money creation on a lost card (${N(600)} cards); buying first never loses`, () => {
  const states = rivalStates(N(300), 1300); let losses = 0, buys = 0;
  for (const json of states) for (const how of ['inspect:1', 'inspect:2', 'offer:5', 'offer:10', 'buy']) {
    const st = E.deserialize(json); const ev = E.currentEvent(st); const o = ev.options.find((x) => (how === 'buy' ? x.kind === 'buy' : x.id === how) && x.enabled); if (!o) continue;
    if (how === 'buy') { st.pending.rv.close = 1; const n0 = st.assets.length; E.choose(st, ev, o.id); assert.equal(st.assets.length, n0 + 1, 'buy now always succeeds'); buys++; continue; }
    st.pending.rv.close = st.pending.rv.steps + 1; st.pending.rv.taker = st.pending.rv.who[0];
    const m0 = E.metrics(st); const a0 = clone(st.assets); const L0 = st.loans, H0 = st.life.happiness, en0 = st.life.energy, cash0 = st.cash, sav0 = st.savings;
    const fee = how === 'inspect:2' ? ev.data.dd.inspect2.fee : 0; const enCost = how === 'inspect:1' ? ev.data.dd.inspect1.energy : 0;
    const res = E.choose(st, ev, o.id);
    assert.ok(res.rival && res.rival.lost && res.done, 'lost'); losses++;
    assert.equal(st.cash + st.savings, cash0 + sav0 - fee, 'cash + savings change = − the step fee');
    assert.equal(E.metrics(st).netWorth, m0.netWorth - fee, 'net worth change = − the step fee');
    assert.deepEqual(st.assets, a0); assert.equal(st.loans, L0); assert.equal(st.life.happiness, H0); assert.equal(st.life.energy, Math.max(0, en0 - enCost));
    assert.equal(st.pending, null); const d = st.rivalDeals[st.rivalDeals.length - 1]; assert.equal(d.revealed, false); assert.ok(d.by && d.truth);
    assert.match(res.rival.text, /את העסקה לפניך/); assert.ok(res.news.some((x) => x.kind === 'rival'));
  }
  assert.ok(losses >= N(300) && buys > 20, `losses ${losses} buys ${buys}`);
});

test('AC-6a interest = f(public card data, the 4 seals): p.rv equals drawRival(rs, pub from the described card)', () => {
  let n = 0;
  for (const w of WORLDS) for (let s = 0; s < 40; s++) {
    const st = E.createGame({ worldId: w, charId: charOf(w, s), seed: 3000 + s }); const r = prng(s);
    for (let t = 0; t < 80 && !st.over; t++) {
      if (st.pending) { resolve(st); continue; }
      E.rollDice(st); const h = { rng: clone(st.rng.rival) }; E.landing(st);
      const p = st.pending;
      if (p && p.rv) {
        const rs = [0, 0, 0, 0].map(() => next(h, 'rng')); const ev = E.currentEvent(st); const d = ev.data;
        const pub = { kind: d.kind, rent: !!(E.getWorld(w).kinds[d.kind] || {}).rent, golden: !!d.golden, cfClaim: d.dd.claimed.cf, down: d.down, warn: d.dd.flags.filter((f) => f.kind === 'warn').length };
        const x = RV.drawRival(rs, pub, w, null);
        assert.deepEqual({ n: p.rv.n, who: p.rv.who, close: p.rv.close, taker: p.rv.taker }, { n: x.n, who: x.who, close: x.close, taker: x.taker }); n++;
        assert.equal(d.rivals.n, p.rv.n); assert.equal(d.rivals.hazardNext, RV.round2(RV.hazard(w, p.rv.n, 1)));
        for (const o of ev.options) if (o.kind === 'inspect' || o.kind === 'offer') assert.equal(o.rivalRisk, p.rv.n ? d.rivals.hazardNext : undefined);
        for (const o of ev.options) if (o.kind === 'buy' || o.id === 'pass') assert.equal(o.rivalRisk, undefined);
      }
      resolve(st, (ev, k, en) => en[Math.floor(r() * en.length)]);
    }
  }
  assert.ok(n > 100, 'cards ' + n);
  // the ghost slot: a persona equal to `self` becomes "another investor"
  const x = RV.drawRival([0.99, 0, 0.01, 0], { cfClaim: 900, down: 5000, warn: 0, golden: true, rent: false }, 'w2', 'saver'); assert.ok(!x.who.includes('saver') && x.who.includes('other'));
});

test('AC-8 calibration: empirical P(close at step k | not before) within ±2 pp of hazard(world, n, k) (300,000 cards per world, cells ≥ 5,000)', () => {
  for (const w of WORLDS) {
    const cards = E.getWorld(w).deals.filter((c) => c.down != null && !c.tk && !c.crypto); const r = prng(w.charCodeAt(1));
    const cnt = {}; // n → [reached k, closed at k]
    for (let i = 0; i < 300000; i++) {
      const c = cards[Math.floor(r() * cards.length)]; const pub = { kind: c.k, rent: !!(E.getWorld(w).kinds[c.k] || {}).rent, golden: r() < 0.05, cfClaim: c.cf ?? 500, down: c.down, warn: Math.floor(r() * 3) };
      const x = RV.drawRival([r(), r(), r(), r()], pub, w, null); if (!x.n) continue;
      const a = cnt[x.n] ||= [[0, 0], [0, 0], [0, 0]];
      for (let k = 1; k <= 3; k++) { a[k - 1][0]++; if (x.close === k) { a[k - 1][1]++; break; } }
    }
    for (const [n, a] of Object.entries(cnt)) for (let k = 1; k <= 3; k++) { const [reach, hit] = a[k - 1]; if (reach < 5000) continue; /* ±2 pp is ≥ 3σ only from ~5,000 samples (the function itself is exact) */ assert.ok(Math.abs(hit / reach - RV.hazard(w, +n, k)) <= 0.02, `${w} n${n} k${k}: ${(hit / reach).toFixed(3)} vs ${RV.hazard(w, +n, k).toFixed(3)}`); }
  }
});

test('AC-9 reveal: first payday with month ≥ m + 6, numbers = the sealed truth; metrics().rivals omits the truth before', () => {
  const states = rivalStates(20, 2100); let checked = 0;
  for (const json of states) {
    const st = E.deserialize(json); const ev = E.currentEvent(st); const o = ev.options.find((x) => x.kind === 'inspect' && x.enabled) || ev.options.find((x) => x.kind === 'offer' && x.enabled); if (!o) continue;
    st.pending.rv.close = st.pending.rv.steps + 1; E.choose(st, ev, o.id);
    const d = st.rivalDeals[st.rivalDeals.length - 1]; const pub = () => E.metrics(st).rivals.deals.find((x) => x.m === d.m && x.name === d.name);
    if (st.rivalDeals.some((x) => x !== d && x.name === d.name && !x.revealed)) continue; // an earlier lost card of the same name would reveal first (the news is matched by name)
    assert.ok(pub() && !('cf' in pub()) && !('truth' in pub()) && pub().revealed === false);
    let revealedAt = null;
    for (let i = 0; i < 80 && !st.over && revealedAt == null; i++) {
      if (st.pending) { resolve(st); continue; }
      const r = E.rollDice(st); if ((r.news || []).some((x) => x.kind === 'rival' && x.name === d.name)) revealedAt = st.month;
      E.landing(st); resolve(st);
      if (revealedAt == null) assert.ok(!pub() || !('cf' in pub()));
    }
    if (st.over && revealedAt == null) { const rd = st.result.recap.rivalDeals.find((x) => x.name === d.name && x.m === d.m); assert.ok(rd && rd.cf === d.truth.cf); checked++; continue; }
    assert.ok(revealedAt >= d.m + RV.RIVAL_REVEAL && revealedAt <= d.m + RV.RIVAL_REVEAL + 2, `revealed at ${revealedAt} (lost ${d.m})`);
    assert.equal(pub().cf, d.truth.cf); assert.equal(pub().repair, d.truth.repair); checked++;
  }
  assert.ok(checked >= 10, 'checked ' + checked);
});

test('AC-10 evaluator: no interest ⇒ T2 values exactly; with interest U(offer) = (1 − h)·U₀, U(inspect) ≤ U₀ and a "rival" reason', () => {
  const states = rivalStates(60, 5100); let n = 0;
  for (const json of states) {
    const st = E.deserialize(json); const ev = E.currentEvent(st); const h = ev.data.rivals.hazardNext;
    const s0 = E.deserialize(json); s0.pending.rv = null; const ev0 = E.currentEvent(s0);
    const sc = E.scoreOptions(st, ev); const sc0 = E.scoreOptions(s0, ev0);
    for (const x of sc) {
      const y = sc0.find((z) => z.id === x.id); if (!y) continue;
      if (/^offer:/.test(x.id)) { assert.ok(Math.abs(x.U - (1 - h) * y.U) < 1e-9, x.id); assert.ok(x.reasons.some((r) => r.key === 'rival')); n++; }
      else if (/^inspect:/.test(x.id)) { assert.ok(x.U <= y.U + 1e-9, x.id); assert.ok(x.reasons.some((r) => r.key === 'rival')); n++; }
      else assert.ok(Math.abs(x.U - y.U) < 1e-9, x.id + ' unchanged');
    }
    const imp = ev.options.filter((o) => (o.kind === 'inspect' || o.kind === 'offer') && o.enabled).map((o) => E.impactFor(st, o.id));
    for (const i of imp) { assert.equal(i.basis, 'branches'); assert.ok(Math.abs(i.branches.reduce((a, b) => a + b.p, 0) - 1) < 1e-9); assert.ok(i.branches.some((b) => b.lost && Math.abs(b.p - h) < 1e-9)); }
  }
  assert.ok(n > 30, 'compared ' + n);
});

test(`AC-11 timeline: start row + one row per payday = metrics() at its end; halving at 240 keeps the first row; final row = end state; size`, () => {
  for (const w of WORLDS) {
    const st = E.createGame({ worldId: w, charId: charOf(w, 1), seed: 61 }); const r = prng(2); let checked = 0;
    assert.equal(st.tl.m.length, 1); assert.equal(st.tl.m[0], 1);
    for (let i = 0; i < 120 && !st.over; i++) {
      if (st.pending) { resolve(st); continue; }
      const p0 = st.stats.paydays; const res = E.rollDice(st);
      if (st.stats.paydays > p0 && !res.double && res.paydays[res.paydays.length - 1]) {
        const m = E.metrics(st); const n = st.tl.m.length - 1;
        const row = ['m', 'nw', 'liq', 'debt', 'pas', 'exp', 'pg', 'hap', 'en'].map((c) => st.tl[c][n]);
        assert.deepEqual(row, [m.month, Math.round(m.netWorth / 100), Math.round((m.cash + m.savings) / 100), Math.round(m.totalLiabilities / 100), Math.round(m.passive), Math.round(m.expenses), Math.round(m.goalProgress * 1000), m.life.happiness, m.life.energy]);
        checked++;
      }
      E.landing(st); resolve(st, (ev, k, en) => en.find((o) => o.primary) || en[Math.floor(r() * en.length)]);
    }
    assert.equal(st.tl.m.length, 1 + st.stats.paydays, `${w}: start + one row per payday`); assert.ok(checked > 20);
    if (w === 'w1') assert.ok(JSON.stringify(st.tl).length <= 3500, 'tl JSON ' + JSON.stringify(st.tl).length);
  }
  // halving
  const st = E.createGame({ worldId: 'w1', seed: 3 }); const t = st.tl;
  for (let m = 2; m <= 239; m++) for (const c of ['m', 'nw', 'liq', 'debt', 'pas', 'exp', 'pg', 'hap', 'en']) t[c].push(c === 'm' ? m : 0);
  st.month = 239;
  for (let i = 0; i < 40 && t.step === 1; i++) { if (st.pending) { resolve(st); continue; } E.rollDice(st); E.landing(st); resolve(st); }
  assert.equal(t.step, 2); assert.equal(t.m[0], 1); assert.ok(t.m.length <= 121);
  // the final row = the end state
  const g = randomGame({ worldId: 'w2', seed: 99 }, prng(4), { afterWin: false });
  if (g.over) { const last = g.tl.m.length - 1; assert.equal(g.tl.m[last], g.month); assert.equal(g.tl.nw[last], Math.round(E.metrics(g).netWorth / 100)); assert.ok(!('tl' in E.summaryForServer(g)), 'no tl in the server summary'); }
});

test(`AC-12 k / k0: replay(actions.slice(0, k0)) has the same card open with nothing chosen; actions[k] recorded it; caps (${N(300)} decisions)`, () => {
  let n = 0;
  for (let g = 0; n < N(300) && g < 80; g++) {
    const w = WORLDS[g % 4]; const st = randomGame({ worldId: w, charId: charOf(w, g), seed: 6000 + g }, prng(g), { maxRolls: 200, afterWin: false });
    assert.ok(st.marks.length <= 40 && st.dq.luckLog.length <= 40);
    const cfg = E.replayConfig(st); const pts = E.decisionPoints(st);
    for (const p of pts.filter((_, i) => i % 3 === 0)) {
      const a = st.actions[p.k]; assert.ok(a, 'actions[k] exists');
      if (a[0] === 'c') assert.equal(a[1], p.o); else assert.ok(['Q', 'F'].includes(a[0]));
      if (a[0] !== 'c') { assert.equal(p.k0, p.k); continue; }
      const s2 = E.replay(cfg, st.actions.slice(0, p.k0)); const s3 = E.replay(cfg, st.actions.slice(0, p.k));
      assert.ok(s2.pending && s3.pending && s2.pending.id === s3.pending.id, 'same card open at k0 and at k');
      if (s2.pending.dd) assert.equal(s2.pending.dd.level, 0, 'nothing chosen at k0');
      if (s2.pending.rv) assert.equal(s2.pending.rv.steps, 0);
      n++;
    }
  }
  assert.ok(n >= N(300) * 0.5, 'checked ' + n);
});

test('AC-13 saves: v3 fixtures and pre-T6 v4 saves (mid-chain) get every §10.1 default, play on, round-trip; tl.from = load month', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/v3-saves.json', import.meta.url), 'utf8'));
  for (const [k, raw] of Object.entries(fx)) {
    const st = E.deserialize(raw);
    assert.ok(st.tl && st.tl.from === st.month && Array.isArray(st.marks) && Array.isArray(st.dq.luckLog) && st.dq.luck.rival === 0 && Array.isArray(st.rivalDeals) && st.stats.rivalLost === 0 && st.afterWin === null && st.self === null, k);
    if (st.pending && st.pending.type === 'deal') assert.ok(!st.pending.rv, 'a v3 pending deal stays a legacy card');
    for (let i = 0; i < 60 && !st.over; i++) { if (st.pending) { resolve(st); continue; } E.rollDice(st); E.landing(st); resolve(st); }
    assert.equal(E.serialize(E.deserialize(E.serialize(st))), E.serialize(st), k + ' round trip');
  }
  // a T3-era v4 save in the middle of a story chain (no T4/T6 fields)
  let st = null;
  for (let s = 0; s < 60 && !st; s++) { const g = E.createGame({ worldId: 'w2', seed: 900 + s }); for (let i = 0; i < 120 && !g.over; i++) { if (g.pending) { resolve(g); continue; } E.rollDice(g); E.landing(g); resolve(g); if (g.story && g.story.inbox.some((x) => x.kind === 'chain')) { st = g; break; } } }
  assert.ok(st, 'a mid-chain state');
  const old = clone(st); for (const key of ['tl', 'marks', 'rivalDeals', 'afterWin', 'self', 'bizPast', 'learn', 'dream', 'intro', 'practice', 'lessonCtx', 'tutorialFree']) delete old[key]; delete old.dq.luckLog; delete old.dq.luck.rival; delete old.stats.rivalLost;
  const back = E.deserialize(JSON.stringify(old)); assert.equal(back.tl.from, back.month); assert.equal(back.tl.m.length, 0);
  for (let i = 0; i < 60 && !back.over; i++) { if (back.pending) { resolve(back); continue; } E.rollDice(back); E.landing(back); resolve(back); }
  assert.ok(back.tl.m.length > 10, 'the timeline starts at the load month');
});

test('AC-14 continue after win: W only after a free win, the goal no longer ends it, X retires, cap at +120, same stars, no achievements, ranked W/X fail, CODES', () => {
  let won = null;
  for (let s = 0; s < 40 && !won; s++) { const st = randomGame({ worldId: 'w1', charId: 'teacher', seed: 50 + s }, prng(s), { afterWin: false }); if (st.over === 'won') won = st; }
  assert.ok(won, 'a won game');
  const fresh = E.createGame({ worldId: 'w1', seed: 1 }); const n0 = fresh.actions.length;
  assert.equal(E.continueAfterWin(fresh).ok, false); assert.equal(fresh.actions.length, n0, 'nothing logged');
  const st = E.deserialize(E.serialize(won)); const stars = st.result.stars; const nA = st.actions.length;
  const r = E.continueAfterWin(st); assert.equal(r.ok, true); assert.deepEqual(st.actions[nA], ['W']); assert.equal(st.over, null); assert.equal(st.phase, 'roll');
  assert.equal(E.metrics(st).afterWin.m, st.month); assert.equal(E.continueAfterWin(st).ok, false, 'once');
  const ach0 = st.ach.slice();
  for (let i = 0; i < 30 && !st.over; i++) { if (st.pending) { resolve(st); continue; } E.rollDice(st); E.landing(st); resolve(st); }
  assert.deepEqual(st.ach, ach0, 'no achievements after the win');
  if (!st.over) { const x = E.retire(st); assert.equal(x.ok !== false, true); assert.equal(st.result.status, 'retired'); assert.equal(st.result.reason, 'retired'); assert.equal(st.result.stars, stars); assert.ok(st.result.afterWin && st.result.afterWin.lines.length >= 5); assert.ok(st.result.recap); }
  assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay with W/X');
  // the cap
  const c = E.deserialize(E.serialize(won)); E.continueAfterWin(c); c.afterWin.m -= 119;
  for (let i = 0; i < 20 && !c.over; i++) { if (c.pending) { resolve(c); continue; } E.rollDice(c); E.landing(c); resolve(c); }
  assert.equal(c.result.status, 'retired'); assert.equal(c.result.reason, 'cap');
  // ranked
  const d = E.createGame({ worldId: 'w1', seed: 2, mode: 'daily' }); E.rollDice(d);
  assert.throws(() => E.replay(E.replayConfig(d), [...d.actions, ['W']]), /replay_mismatch/); assert.throws(() => E.replay(E.replayConfig(d), [...d.actions, ['X']]), /replay_mismatch/);
  assert.deepEqual([...CODES].sort(), ['r', 'l', 'c', 'L', 'R', 'C', 'P', 'A', 'I', 'S', 'T', 'F', 'H', 'M', 'Q', 'K', 'W', 'X', 'Z'].sort()); // worlds wave 0: Z = a world module action
  assert.equal(typeof E.OUTCOME_REV, 'number'); assert.equal(E.RIVALS.saver.name, 'רותם');
});

test('recap: five dims (facts / headline / short), graph, grid cells ≥ 0.5 E linked luck, suggestion rule, no composite score', () => {
  let n = 0, rules = new Set(), grid = 0;
  for (let g = 0; g < 24; g++) {
    const w = WORLDS[g % 4]; const st = randomGame({ worldId: w, charId: charOf(w, g), seed: 7100 + g }, prng(g), { afterWin: false });
    if (!st.over) continue; const R = st.result.recap; n++;
    assert.deepEqual(Object.keys(R.dims), ['speed', 'resilience', 'decisions', 'happiness', 'business']);
    for (const d of Object.values(R.dims)) { assert.ok(d.facts && typeof d.headline === 'string' && d.headline && typeof d.short === 'string' && d.short.length <= 30, JSON.stringify(d)); assert.ok(!/score|ציון/.test(JSON.stringify(d))); }
    assert.equal(R.graph.tl.m[R.graph.tl.m.length - 1], st.month); assert.ok(R.graph.notes.length <= 3); assert.ok(typeof R.graph.alt === 'string');
    const E0 = st.result.expenses; const LK = new Map(); for (const [, , a, k] of st.dq.luckLog) LK.set(k, (LK.get(k) || 0) + a);
    for (const c of Object.values(R.grid)) if (c) { grid++; assert.ok(Math.abs(c.luck) >= 0.5 * Math.max(1, E0) - 1); }
    rules.add(R.suggestion.rule); assert.ok(R.suggestion.text);
    assert.ok(R.decisions.length <= 3); assert.ok(Array.isArray(R.rivalDeals));
  }
  assert.ok(n >= 10, 'ended games ' + n); console.log(`   (suggestion rules seen ${[...rules].join(',')}, grid cells ${grid})`);
});

/* ---------------------------------------------------------------- archetypes (§2.3) */
const SENTINEL = ['rng', 'pending', 'decks', 'negR', 'bizRng', 'hidden', 'truth', 'close', 'taker'];
function trap(o) { return o && typeof o === 'object' ? new Proxy(o, { get(t, k) { if (SENTINEL.includes(k)) throw new Error('sealed read ' + String(k)); return trap(t[k]); } }) : o; }
function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }
/** drive an archetype like the ghost worker (API 2), recording what it did */
function drive(arch, cfg, { frozen = false, trapped = false, rolls = 700 } = {}) {
  const A = AR.ARCHETYPES[arch]; const st = E.createGame({ ...cfg, mentor: 'hint', self: arch }); const rnd = prng(cfg.seed ^ 0x51A7E001);
  const rec = { loanBuys: 0, flaggedSeen: 0, flaggedInspected: 0, inspects: 0, offerOpp: 0, offer15: 0, autoOk: 0, autoChecks: 0, firstBuyRent: null, firstNonRentOffered: false };
  const T = { dd: E.DD, cycle: E.CY, focus: E.FC, rivals: E.RIVALS };
  const view = (ev) => { let pv = E.publicView(st, { freeze: false, event: ev }); if (frozen) pv = deepFreeze(JSON.parse(JSON.stringify(pv))); if (trapped) pv = trap(pv); return pv; };
  for (let i = 0; i < rolls && !st.over; i++) {
    const cf0 = E.metrics(st).cashflow; // the surplus the policy sees
    for (const a of A.between(view(), { rnd, n: 0, tables: T }) || []) {
      switch (a[0]) { case 'repay': E.repayLoan(st, a[1] || undefined); break; case 'payCredit': E.payCredit(st); break; case 'plan': E.setPlan(st, a[1]); break; case 'focus': E.setFocus(st, a[1], a[2] ?? 0); break; case 'save': E.moveSavings(st, a[1]); break; case 'auto': E.setAutoInvest(st, a[1]); break; case 'invest': E.invest(st, a[1], a[2]); break; case 'loan': E.takeLoan(st, a[1] || undefined); break; default: break; }
      if (st.over) break;
    }
    if (st.over) break;
    if (arch === 'diversified' && cf0 > 0) { rec.autoChecks++; if (st.life.autoInvest >= Math.floor(0.4 * cf0)) rec.autoOk++; }
    if (!st.pending) { E.rollDice(st); E.landing(st); }
    let ev = E.currentEvent(st); let n = 0;
    while (ev && !st.over) {
      let id, params;
      if (ev.auto) id = ev.options[0].id;
      else if (ev.type === 'mystery' && ev.data.kind === 'quiz') id = ev.options.find((o) => o.enabled).id;
      else if (n >= 6) id = (ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id;
      else { const r = A.decide(view(ev), { rnd, n, tables: T }); id = r.id; params = r.params; }
      const o = ev.options.find((x) => x.id === id);
      if (ev.type === 'deal' && n === 0) {
        const warn = ev.data.dd ? ev.data.dd.flags.filter((f) => f.kind === 'warn').length : 0;
        if (hasOffer(ev)) { rec.offerOpp++; if (/^offer:/.test(id)) rec.offer15++; }
        if (warn >= 1 && ev.data.dd && ev.data.dd.level === 0) { rec.flaggedSeen++; if (/^inspect:/.test(id)) rec.flaggedInspected++; else if (o && o.kind === 'buy') rec.flaggedBoughtUninspected = (rec.flaggedBoughtUninspected || 0) + 1; }
        if (rec.firstBuyRent == null && ev.options.some((x) => x.kind === 'buy' && x.enabled && x.net > 0) && !AR.RENT_KINDS.has(ev.data.kind)) rec.firstNonRentOffered = true;
      }
      if (/^inspect:/.test(id)) rec.inspects++;
      if (o && o.kind === 'buy' && ev.type === 'deal') { if (o.loanAmount) rec.loanBuys++; if (rec.firstBuyRent == null) rec.firstBuyRent = AR.RENT_KINDS.has(ev.data.kind); }
      let res = E.choose(st, ev, id, params || {});
      if (!res.ok) { const f = ev.options.find((x) => x.enabled && ['done', 'pass', 'ok'].includes(x.id)) || ev.options.find((x) => x.enabled); res = E.choose(st, ev, f.id, f.needsQty ? { qty: 1 } : {}); }
      ev = res.event; n++;
    }
  }
  return { st, rec };
}
const hasOffer = (ev) => ev.options.some((o) => /^offer:/.test(o.id) && o.enabled); // rule card: "תמיד מנסה להוריד מחיר" (balance pass: the step is offer:5)

test('AC-16 policies see only public data: no engine import (static scan), deep-frozen and trapped views, games complete', () => {
  const src = readFileSync(new URL('../js/systems/archetypes.js', import.meta.url), 'utf8');
  assert.ok(!/\bimport\b/.test(src.replace(/\/\/.*$/gm, '')), 'archetypes.js imports nothing');
  assert.equal(AR.ARCH_API, 2); assert.deepEqual(Object.keys(AR.ARCHETYPES), ['saver', 'founder', 'diversified', 'gambler']);
  for (const arch of AR.ARCH_IDS) for (const w of WORLDS) { const { st } = drive(arch, { worldId: w, seed: 11 }, { frozen: true, rolls: 120 }); assert.ok(st.turn > 50 || st.over); }
  for (const arch of AR.ARCH_IDS) for (const w of WORLDS) { const { st } = drive(arch, { worldId: w, seed: 12 }, { trapped: true, rolls: 120 }); assert.ok(st.turn > 50 || st.over); }
});

test(`AC-30 rule cards are true (${N(25)} games per archetype per world)`, () => {
  const tot = { saver: { loanBuys: 0, flaggedSeen: 0, unins: 0 }, gambler: { inspects: 0, offerOpp: 0, offer15: 0 }, diversified: { ok: 0, checks: 0 }, founder: { games: 0, firstRentWhenNonRent: 0 } };
  for (const w of WORLDS) for (let g = 0; g < N(25); g++) {
    const cfg = { worldId: w, charId: charOf(w, g), seed: 8000 + g * 7 };
    const s = drive('saver', cfg).rec; tot.saver.loanBuys += s.loanBuys; tot.saver.flaggedSeen += s.flaggedSeen; tot.saver.unins += s.flaggedBoughtUninspected || 0;
    const b = drive('gambler', cfg).rec; tot.gambler.inspects += b.inspects; tot.gambler.offerOpp += b.offerOpp; tot.gambler.offer15 += b.offer15;
    const d = drive('diversified', cfg).rec; tot.diversified.ok += d.autoOk; tot.diversified.checks += d.autoChecks;
    const f = drive('founder', cfg).rec; tot.founder.games++; if (f.firstBuyRent === true && f.firstNonRentOffered) tot.founder.firstRentWhenNonRent++;
  }
  assert.equal(tot.saver.loanBuys, 0, 'saver never takes a loan to buy'); assert.equal(tot.saver.unins, 0, 'saver never buys a flagged deal uninspected');
  assert.equal(tot.gambler.inspects, 0, 'gambler never inspects'); assert.equal(tot.gambler.offer15, tot.gambler.offerOpp, 'gambler always tries a lower price');
  assert.ok(tot.diversified.checks > 0 && tot.diversified.ok === tot.diversified.checks, `diversified auto-invest ≥ 40% of the surplus it saw (${tot.diversified.ok}/${tot.diversified.checks})`);
  assert.equal(tot.founder.firstRentWhenNonRent, 0, "founder's first purchase is never a rent asset while a business-kind deal is offered");
  console.log('   ' + JSON.stringify(tot));
});

test('client CRs: endNow (a capped game has recap dims), decisionPoints labels, out.rival.dd after a lost inspection, after-win hap0 / hap1 / brokeM, learn in replayConfig', () => {
  const g = E.createGame({ worldId: 'w3', seed: 41 }); for (let i = 0; i < 30; i++) { if (g.pending) { resolve(g); continue; } E.rollDice(g); E.landing(g); resolve(g); }
  assert.equal(E.checkEnd(g), null); const e = E.endNow(g); assert.equal(e.status, 'capped'); assert.deepEqual(Object.keys(e.recap.dims), ['speed', 'resilience', 'decisions', 'happiness', 'business']);
  assert.equal(E.checkEnd(g), null, 'endNow does not end the game');
  assert.ok(E.decisionPoints(g).every((p) => typeof p.label === 'string' && p.label.length > 0));
  const st = E.deserialize(rivalStates(3, 4400)[0]); const ev = E.currentEvent(st); const o = ev.options.find((x) => x.kind === 'inspect' && x.enabled);
  if (o) { st.pending.rv.close = st.pending.rv.steps + 1; const r = E.choose(st, ev, o.id); assert.ok(r.rival.lost && typeof r.rival.dd === 'string' && r.rival.dd.length > 5); }
  assert.ok(E.metrics(st).rivals.deals.every((d) => Number.isInteger(d.revealAt)));
  assert.equal(E.replayConfig(E.createGame({ worldId: 'w1', seed: 1, learn: true })).learn, true);
  let won = null; for (let s = 0; s < 40 && !won; s++) { const x = randomGame({ worldId: 'w1', charId: 'teacher', seed: 50 + s }, prng(s), { afterWin: false }); if (x.over === 'won') won = x; }
  E.continueAfterWin(won); E.retire(won); const A = won.result.afterWin;
  assert.ok(Number.isInteger(A.hap0) && Number.isInteger(A.hap1) && A.happinessDelta === A.hap1 - A.hap0 && A.brokeM === null && A.m0 > 0);
});
const GW = await import('../js/ghost-worker.js');
test('the ghost worker runs the archetype module (API 2): rows never ahead of upTo, done with the engine timeline and recap dims', () => {
  GW.setPolicies(AR);
  const msgs = []; const cfg = E.replayConfig(E.createGame({ worldId: 'w1', charId: 'teacher', seed: 5 }));
  const set = new GW.GhostSet({ key: 'k', cfg, post: (m) => msgs.push(m) });
  set.advance(12); let g = 0; while (set.step() && g++ < 5000);
  assert.ok(msgs.filter((m) => m.t === 'rows').every((m) => m.rows.every((r) => r[0] <= 12) && m.marks.every((k) => k[0] < 12)));
  assert.ok(!msgs.some((m) => m.t === 'error'), JSON.stringify(msgs.filter((m) => m.t === 'error')));
  set.finish(90); g = 0; while (set.step() && g++ < 20000);
  const done = msgs.filter((m) => m.t === 'done'); assert.equal(done.length, 4);
  assert.ok(done.every((d) => d.end.recap && d.end.recap.dims && d.end.tl.m.length > 5));
});

test('review m8: crypto luck links to the buy that opened the position (not the sale), and replays byte-identically', () => {
  let n = 0;
  for (let i = 0; i < N(12); i++) {
    const cfg = { worldId: 'w1', seed: 1031 + i * 7, mode: 'free', rules: 4 };
    const st = playOut(E, cfg, prng(8 + i), { v4: true, stories: true });
    for (const [, part, , k] of st.dq.luckLog) if (part === 'crypto') { n++; const a = st.actions[k]; assert.ok(a && a[0] === 'c' && a[1] === 'buy', `crypto luck k=${k} → ${JSON.stringify(a)}`); }
    assert.equal(E.serialize(E.replay(cfg, st.actions)), E.serialize(st));
  }
  assert.ok(n > 0, 'some crypto luck was booked');
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
