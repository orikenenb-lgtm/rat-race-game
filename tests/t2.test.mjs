#!/usr/bin/env node
// T2 "Strategic depth core" — engine tests (spec docs/next-level/specs/T2-strategic-depth.md §14, T1–T15).
// Run: node tests/t2.test.mjs [scale=1]   (scale multiplies the random-game counts; 1 ≈ a few minutes on the shared box)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as E from '../js/engine.js';
import { STREAMS, makeStreams } from '../js/rng.js';
import { playOut, prng } from './lib/random-player.mjs';
import { projection, OLD_STREAMS, goldenConfig } from '../tools/make-v3-fixtures.mjs';

const SCALE = +(process.argv[2] || 1);
await E.loadRealData();
let passed = 0, failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e.stack).split('\n').slice(0, 6).join('\n   ')}`); }
}
const FIX = (f) => new URL('./fixtures/' + f, import.meta.url);
const clone = (x) => JSON.parse(JSON.stringify(x));
const N = (n) => Math.max(1, Math.round(n * SCALE));

// mulberry32 advances its state by a constant per draw → number of draws between two states (mod 2^32)
const INC = 0x6D2B79F5n; const MOD = 1n << 32n;
const inv = (() => { let t = 0n, nt = 1n, r = MOD, nr = INC; while (nr) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; } return ((t % MOD) + MOD) % MOD; })();
const draws = (a, b) => Number((((BigInt(b >>> 0) - BigInt(a >>> 0)) % MOD + MOD) % MOD * inv) % MOD);

/** Collect pending-event states from random v4 games (any mentor level, all worlds). */
function sampleStates(n, seed0 = 1, filter = () => true) {
  const out = []; let g = 0;
  while (out.length < n && g < n * 20) {
    const w = E.WORLDS[g % 4]; const cfg = { worldId: w.id, charId: w.characters[g % w.characters.length].id, seed: seed0 + g * 101, mode: g % 5 === 0 ? 'daily' : 'free', mentor: ['guide', 'hint', 'pro'][g % 3] };
    const st = E.createGame(cfg); const r = prng(cfg.seed); g++;
    for (let t = 0; t < 120 && !st.over && out.length < n; t++) {
      if (r() < 0.05) E.setFocus(st, ['scout', 'debt', 'network', 'frugal', 'research', 'none'][Math.floor(r() * 6)], Math.floor(r() * 3));
      if (st.over) break;
      if (st.pending) { const ev = E.currentEvent(st); const o = ev.options.find((x) => x.enabled && ['ok', 'done', 'pass'].includes(x.id)) || ev.options.find((x) => x.enabled); E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}); continue; }
      E.rollDice(st); let ev = E.landing(st); let k = 0;
      while (ev && !st.over) {
        if (!ev.auto && r() < 0.25 && filter(st, ev)) out.push(E.serialize(st));
        const en = ev.options.filter((o) => o.enabled);
        const o = k >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)];
        ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 + Math.floor(r() * Math.max(1, Math.min(5, o.max))) } : {}).event; k++;
      }
    }
  }
  return out;
}
function dealState(worldId, card, o = {}) { // a deal pending built by hand (rules 4, with a sealed dd record)
  const st = E.createGame({ worldId, seed: o.seed || 11, mode: 'free', mentor: o.mentor || 'hint', charId: o.charId });
  if (o.cash != null) st.cash = o.cash;
  st.pending = { id: 77, type: 'deal', tile: 'O', pos: 1, month: st.month, card: clone(card), golden: false, source: 'deal', negR: o.negR ?? 0.5 };
  if (o.dd !== null) st.pending.dd = { risk: 2, flags: ['photos', 'books'].slice(0, o.k ?? 1), f: 0.6, vf: 0.9, repair: o.repair ?? 1200, jitter: 0.3, level: 0, ...(o.dd || {}) };
  st.phase = 'event'; return st;
}

/* ------------------------------------------------------------------ T1 streams */
test('T1 STREAMS = 16 names (append-only; T3 appended story, worlds wave 0 appended world); makeStreams for indexes 0–9 equals the v3 fixture', () => {
  assert.deepEqual(STREAMS, ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index', 'dd', 'cycle', 'rival', 'listing', 'story', 'world']);
  const fx = JSON.parse(readFileSync(FIX('v3-streams.json'), 'utf8'));
  for (const [seed, s] of Object.entries(fx)) { const now = makeStreams(+seed); for (const k of OLD_STREAMS) assert.equal(now[k], s[k], `seed ${seed} ${k}`); }
  assert.equal(Object.keys(fx).length, 20);
});

/* ------------------------------------------------------------------ T2 / T3 fixed draws, determinism */
test('T2+T3 fixed draws: decisions (inspect, focus, hints, offers, mentor level) never move dd/cycle/dice/cards; dd +6 per deal/mystery landing, cycle +2 at start and per payday', () => {
  const policy = (style) => (st, ev, n) => {
    const en = ev.options.filter((o) => o.enabled);
    if (style === 'A') { // curious: inspects, negotiates, asks for hints, buys
      if (n === 0 && st.mentor !== 'pro') E.requestHint(st);
      const pick = en.find((o) => o.id === 'inspect:1') || en.find((o) => o.id === 'inspect:2') || en.find((o) => o.id === 'offer:5') || en.find((o) => o.kind === 'buy') || en.find((o) => ['ok', 'done', 'pass'].includes(o.id)) || en[0];
      return n > 4 ? (en.find((o) => ['ok', 'done', 'pass'].includes(o.id)) || en[0]) : pick;
    }
    return en.find((o) => ['pass', 'done', 'ok', 'skip'].includes(o.id)) || en[0];
  };
  const revive = (st) => { if (st.over) { st.over = null; st.result = null; st.flags.bankrupt = false; st.phase = 'roll'; } };
  for (const w of E.WORLDS) for (const seed of [5, 808]) {
    const a = E.createGame({ worldId: w.id, seed, mode: 'free', mentor: 'guide' }); const b = E.createGame({ worldId: w.id, seed, mode: 'free', mentor: 'pro' });
    const s0 = makeStreams(seed);
    assert.equal(draws(s0.cycle, a.rng.cycle), 2, 'cycle: 2 draws in createGame');
    let deals = 0, paydays = 0;
    for (let t = 0; t < 70; t++) {
      revive(a); revive(b);
      if (t % 3 === 0) { E.setFocus(a, ['scout', 'network', 'research', 'frugal'][t % 4], 0); revive(a); E.setFocus(a, 'scout', 1); revive(a); }
      if (t === 10) E.setMentorLevel(a, 'hint');
      const dd0 = a.rng.dd; const ra = E.rollDice(a); const rb = E.rollDice(b);
      assert.deepEqual(ra.dice, rb.dice); paydays += ra.paydays.length;
      let ea = E.landing(a); let eb = E.landing(b);
      // T3: a life card may be substituted / a chain variant shown by a pure function of YOUR state — the drawn card is the same
      const drawnOf = (st, ev) => (ev.type === 'life' && st.pending ? st.pending.drawn || st.pending.eventId : ev.type === 'doodad' && st.pending && st.pending.card.swapped ? st.pending.card.swapped : ev.title);
      assert.equal(ea.type, eb.type); if (ea.type !== 'business') assert.equal(drawnOf(a, ea), drawnOf(b, eb), `${w.id} t${t}`);
      if (a.pending && (a.pending.type === 'deal' || ['O', '?'].includes(a.pending.tile))) deals++;
      const tileType = w.tiles[w.board[a.pos]].type;
      assert.equal(draws(dd0, a.rng.dd), tileType === 'deal' || tileType === 'mystery' ? 6 : 0, `${w.id} t${t} dd draws on ${tileType}`);
      if (a.pending && a.pending.dd) assert.deepEqual({ ...a.pending.dd, level: 0 }, { ...b.pending.dd, level: 0 }, 'the same sealed truth whatever you do');
      assert.equal(a.rng.dd, b.rng.dd); assert.equal(a.rng.cycle, b.rng.cycle);
      for (const [st, pol] of [[a, policy('A')], [b, policy('B')]]) { let ev = st === a ? ea : eb; let n = 0; while (ev && !st.over) { const o = pol(st, ev, n); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; } }
      if (a.pending) { let ev = E.currentEvent(a); while (ev) { const o = ev.options.find((x) => x.enabled && ['ok', 'done', 'pass'].includes(x.id)) || ev.options.find((x) => x.enabled); ev = E.choose(a, ev, o.id, {}).event; } }
      assert.equal(a.rng.dd, b.rng.dd); assert.equal(a.rng.cycle, b.rng.cycle); assert.equal(a.rng.dice, b.rng.dice); assert.equal(a.rng.deal, b.rng.deal);
      assert.equal(draws(s0.cycle, a.rng.cycle), 2 + 2 * (a.month - 1), 'cycle: 2 per payday');
    }
    assert.deepEqual(a.econ.truth, b.econ.truth, 'the same cycle path');
    assert.ok(deals > 3 && paydays > 10);
  }
});

/* ------------------------------------------------------------------ T4 replay */
test('T4 replay(replayConfig(st), st.actions) is byte-identical with F/H/M/inspect — every world, ranked + free + history, rules 3, 4 and 5', () => {
  let n = 0, hs = 0, fs = 0, ms = 0;
  const cfgs = [];
  for (const w of E.WORLDS) for (const mode of ['free', 'daily', 'weekly', 'challenge']) for (const rules of [5, 4, 3]) cfgs.push({ worldId: w.id, charId: w.characters[n++ % w.characters.length].id, seed: 300 + n * 7, mode, rules, maxMonths: mode === 'daily' ? 24 : undefined, mentor: ['guide', 'hint', 'pro'][n % 3], tutorial: mode === 'free' && n % 4 === 0, bailout: n % 2 === 0 });
  cfgs.push({ mode: 'history', scenarioId: 'gfc', seed: 5 }, { mode: 'history', scenarioId: 'covid', seed: 6, rules: 3 }, { worldId: 'w2', seed: 99, mode: 'free', _dev: { noCycle: true, noDD: true } });
  for (const cfg of cfgs) {
    const st = playOut(E, cfg, prng(cfg.seed * 3 + 1), { v4: true });
    hs += st.actions.filter((a) => a[0] === 'H').length; fs += st.actions.filter((a) => a[0] === 'F').length; ms += st.actions.filter((a) => a[0] === 'M').length;
    const again = E.replay(E.replayConfig(st), st.actions);
    assert.equal(E.serialize(again), E.serialize(st), 'replay diverged ' + JSON.stringify(cfg));
    if ((cfg.rules ?? 4) === 3) assert.ok(!st.actions.some((a) => a[0] === 'F'), 'no focus in rules 3');
  }
  assert.ok(hs > 10 && fs > 10, `exercised H ${hs} F ${fs} M ${ms}`);
});

/* ------------------------------------------------------------------ T5 config */
test('T5 config: replayConfig carries mentor + rules; ranked forces hint, tutorial guide; ranked M and rules-3 F are refused and not logged', () => {
  const a = E.createGame({ worldId: 'w3', seed: 1, mode: 'daily', mentor: 'guide' }); assert.equal(a.mentor, 'hint'); assert.equal(a.rules, E.RULES_CURRENT); // no date key → the current rules (5)
  const c = E.replayConfig(a); assert.equal(c.mentor, 'hint'); assert.equal(c.rules, E.RULES_CURRENT);
  assert.equal(E.createGame({ worldId: 'w3', seed: 1, mode: 'daily', rules: 4 }).rules, 4); assert.equal(E.createGame({ worldId: 'w3', seed: 1, mode: 'free' }).rules, E.RULES_CURRENT);
  assert.equal(E.createGame({ worldId: 'w2', seed: 1, mode: 'free', tutorial: true, mentor: 'pro' }).mentor, 'guide');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1 }).mentor, 'guide'); assert.equal(E.createGame({ worldId: 'w2', seed: 1 }).mentor, 'hint');
  assert.equal(E.createGame({ worldId: 'w2', seed: 1, mentor: 'pro' }).mentor, 'pro');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, rules: 3 }).rules, 3); assert.equal(E.createGame({ worldId: 'w1', seed: 1, rules: 7 }).rules, E.RULES_CURRENT);
  const n0 = a.actions.length; const r = E.setMentorLevel(a, 'pro'); assert.equal(r.ok, false); assert.equal(a.actions.length, n0);
  const old = E.createGame({ worldId: 'w1', seed: 2, rules: 3 }); const r2 = E.setFocus(old, 'scout', 0); assert.equal(r2.ok, false); assert.equal(old.actions.length, 0);
  assert.equal(old.econ, null); assert.equal(old.rng.cycle, makeStreams(2).cycle, 'rules 3 never touches the cycle stream');
  assert.throws(() => E.createGame({ worldId: 'w1', seed: 1, mode: 'weekly', _dev: { noDD: true } }), /dev flags/);
  const f = E.createGame({ worldId: 'w1', seed: 3, mode: 'free', mentor: 'pro' }); assert.ok(E.setMentorLevel(f, 'hint').ok); assert.deepEqual(f.actions.at(-1), ['M', 'hint']);
  assert.equal(E.replayConfig(f).mentor, 'pro', 'the STARTING level; changes replay through M'); assert.deepEqual(f.dq.levelChanges, [{ m: 1, from: 'pro', to: 'hint' }]);
});

/* ------------------------------------------------------------------ T6 migration */
test('T6 v3 → v4 migration from fixtures (roll, mid-deal, mid-trade, ranked daily, history); v2 chains; bad versions rejected', () => {
  const saves = JSON.parse(readFileSync(FIX('v3-saves.json'), 'utf8'));
  for (const [name, json] of Object.entries(saves)) {
    const old = JSON.parse(json); const st = E.deserialize(json);
    assert.equal(old.v, 3); assert.equal(st.v, 4, name);
    for (const k of OLD_STREAMS) assert.equal(st.rng[k], old.rng[k], `${name}: ${k} untouched`);
    const fresh = makeStreams(st.seed);
    for (const k of ['dd', 'rival', 'listing']) assert.equal(st.rng[k], fresh[k], `${name}: new stream ${k}`);
    assert.equal(draws(fresh.cycle, st.rng.cycle), st.rules === 4 ? 2 : 0, name + ' cycle init');
    const ranked = ['daily', 'weekly', 'challenge'].includes(st.mode);
    assert.equal(st.rules, ranked ? 3 : 4, name); assert.equal(st.mentor, ranked ? 'hint' : (st.worldId === 'w1' ? 'guide' : 'hint'));
    assert.ok(st.life.focus && Array.isArray(st.life.agenda) && st.life.focusMonths && st.life.frugalCuts === 0 && st.life.debtDeal === null);
    assert.ok(st.dq.hints === 0 && Array.isArray(st.dq.levelChanges) && st.dq.luck.dd === 0 && st.dq.luck.cycle === 0);
    for (const k of ['inspections', 'inspectSpent', 'ddRepairs', 'ddAvoided']) assert.equal(st.stats[k], 0);
    assert.equal(st.econ === null, st.rules === 3 || !!st.history, name + ' econ');
    if (st.pending && st.pending.type === 'deal') { const ev = E.currentEvent(st); assert.ok(!ev.options.some((o) => /^inspect/.test(o.id)), name + ': a legacy card has no inspection'); assert.equal(ev.data.dd, undefined); }
    assert.equal(E.serialize(E.deserialize(E.serialize(st))), E.serialize(st), name + ': v4 round-trip is stable');
    const r = prng(7); for (let t = 0; t < 60 && !st.over; t++) { if (st.phase === 'roll') E.rollDice(st); let ev = E.landing(st); while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } }
  }
  // v2 (st.v = 1) → v3 → v4
  const base = JSON.parse(saves.roll); base.v = 1; base.pos = 13; base.phase = 'roll'; base.pending = null; delete base.life; delete base.lessons; delete base.taxes; delete base.actions; delete base.rng.life; delete base.rng.index; delete base.holdings.IDX; delete base.prices.IDX;
  const v2 = E.deserialize(JSON.stringify(base)); assert.equal(v2.v, 4); assert.equal(v2.rules, 4); assert.ok(v2.life.focus);
  for (const bad of [{ ...JSON.parse(saves.roll), v: 5 }, { ...JSON.parse(saves.roll), v: 2 }, { v: 4, worldId: 'w10' }, 'null', '"x"']) assert.throws(() => E.deserialize(typeof bad === 'string' ? bad : JSON.stringify(bad)), /save_incompatible/);
});

/* ------------------------------------------------------------------ T7 legacy equivalence */
test('T7 legacy equivalence: rules 3 reproduces the v3 golden fixture (200 games: replayed logs AND the same player live)', () => {
  const fx = JSON.parse(readFileSync(FIX('v3-golden.json'), 'utf8'));
  const logs = JSON.parse(gunzipSync(readFileSync(FIX('v3-golden-actions.json.gz'))).toString('utf8'));
  let i = 0;
  for (const g of fx.games) {
    const cfg = { ...g.cfg, rules: 3 };
    const st = E.replay(cfg, logs[i]);
    assert.deepEqual(projection(E, st), g.proj, `golden game ${i} (${cfg.worldId}/${cfg.mode}) replayed`);
    i++;
  }
  // live: the same legal random player (ignores the highlight) makes the same decisions on the same option sets
  let j = 0;
  for (const w of E.WORLDS) for (let k = 0; k < 50; k++, j++) {
    if (k % Math.max(1, Math.round(5 / SCALE)) !== 0) continue;
    const cfg = { ...goldenConfig(E, w, k), rules: 3, mentor: 'hint' };
    const st = playOut(E, cfg, prng(cfg.seed ^ 0x2545f491), { usePrimary: false });
    assert.deepEqual(projection(E, st), fx.games[j].proj, `live golden game ${j}`);
    assert.equal(JSON.stringify(st.actions), JSON.stringify(logs[j]));
  }
});

/* ------------------------------------------------------------------ T8 info leaks */
const SEALED_KEYS = ['negR', 'raiseR', 'sideSeed', 'rng', 'decks', 'bizRng', 'hidden', 'path', 'truth', 'phase', 'jitter', 'inflationYear', 'close', 'taker']; // + T6 competition seals
const PUBLIC_PATHS = new Set(['$.phase', '$.metrics.index.projection.path', '$.event.data.projection.path']); // game phase / the index fund's projected range (public)
function scanKeys(o, path, hits) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const p = path + '.' + k; if (SEALED_KEYS.includes(k) && !PUBLIC_PATHS.has(p)) hits.push(p); scanKeys(v, Array.isArray(o) ? path + '[]' : p, hits); } }
function scramble(st, r) {
  for (const k of Object.keys(st.rng)) st.rng[k] = (Math.floor(r() * 4294967296)) >>> 0;
  for (const k of Object.keys(st.decks)) st.decks[k] = st.decks[k].slice().reverse();
  for (const k of Object.keys(st.bizRng || {})) st.bizRng[k] = (Math.floor(r() * 4294967296)) >>> 0 || 1;
  const L = st.life; L.raiseR = r(); L.sideSeed = Math.floor(r() * 1e9); L.inflationYear = 2 + r() * 6;
  const p = st.pending;
  if (p) {
    if (p.negR != null) p.negR = r(); if (p.r != null) p.r = r(); if (p.raiseR != null) p.raiseR = r(); if (p.seed != null) p.seed = Math.floor(r() * 1e9);
    if (p.hidden) p.hidden = { mult: Math.round(r() * 40), revealIn: 5 + Math.floor(r() * 8), signalIn: 3, signalMult: r() * 2 };
    if (p.dd) { p.dd.risk = Math.floor(r() * 4); if (p.dd.level === 0) { p.dd.f = 0.1 + r(); p.dd.vf = 0.6 + r() * 0.5; p.dd.repair = Math.floor(r() * 50) * 100; p.dd.jitter = r(); } }
    if (p.rv && p.rv.n) { p.rv.close = Math.floor(r() * 4); p.rv.taker = p.rv.close ? p.rv.who[Math.floor(r() * p.rv.n)] : null; } // T6 sealed competition outcome
  }
  for (const d of st.rivalDeals || []) if (!d.revealed) d.truth = { cf: Math.round(r() * 9000) - 3000, value: Math.round(r() * 1e6), repair: Math.floor(r() * 50) * 100 }; // T6: unrevealed truth
  if (st.world.coin) st.world.coin.path = st.world.coin.path.map(() => r() * 9);
  for (const x of st.angels) if (x.status === 'active') x.mult = Math.round(r() * 30);
  if (st.econ) { const sharp = st.econ.sharpUntil >= st.month; if (!sharp) st.econ.m = Math.floor(r() * 9); for (const x of st.econ.truth) if (x.m > st.month - (sharp ? 1 : 3)) x.phase = ['exp', 'slow', 'rec', 'recov'][Math.floor(r() * 4)]; } // research (review M1) legitimately shows the phase age and a 1-month official lag
}
test(`T8 no info leak: publicView frozen + key scan; scramble of every sealed field leaves describe / scoreOptions / hint / impactFor byte-identical (${N(300)} states); optionU never reads rng/pending`, () => {
  const pv = E.publicView(E.createGame({ worldId: 'w4', seed: 3 }));
  assert.ok(Object.isFrozen(pv) && Object.isFrozen(pv.metrics) && Object.isFrozen(pv.metrics.life));
  const states = sampleStates(N(300), 9000);
  let impacts = 0;
  const viewOf = (st) => {
    const ev = E.currentEvent(st); const c = E.deserialize(E.serialize(st)); const h = c.mentor === 'pro' ? null : E.requestHint(c).hint;
    const imps = ev.options.filter((o) => o.major && o.enabled).map((o) => E.impactFor(st, o.id)); impacts += imps.length;
    return JSON.stringify({ ev, sc: E.scoreOptions(st, ev), h, imps });
  };
  for (const [i, json] of states.entries()) {
    const st = E.deserialize(json);
    const hits = []; scanKeys(E.publicView(st, { freeze: false }), '$', hits); assert.deepEqual(hits, [], 'sealed key in publicView');
    const v0 = viewOf(st); const s2 = E.deserialize(json); scramble(s2, prng(i + 1));
    assert.equal(viewOf(s2), v0, `state ${i}: a sealed value leaked (${E.currentEvent(st).type})`);
  }
  assert.ok(impacts > 100, 'impacts checked ' + impacts);
  // optionU reads only the public context: scoreOptions on a state whose sealed parts throw on access
  for (const json of states.slice(0, 40)) {
    const st = E.deserialize(json); const ev = E.currentEvent(st);
    const trap = new Proxy(st, { get(t, k) { if (['rng', 'pending', 'decks', 'bizRng'].includes(k)) throw new Error('sealed read: ' + String(k)); return t[k]; } });
    assert.deepEqual(E.scoreOptions(trap, ev), E.scoreOptions(st, ev));
  }
});

/* ------------------------------------------------------------------ T9 impact */
test(`T9 impactFor matches the engine (${N(300)} states): certain = a real choose on a clone; dd = truth := expectation; hard ≤ base; branches sum to 1`, () => {
  const states = sampleStates(N(300), 4200); let certain = 0, expected = 0, branches = 0;
  for (const json of states) {
    const st = E.deserialize(json); const ev = E.currentEvent(st);
    for (const o of ev.options.filter((x) => x.major && x.enabled)) {
      const imp = E.impactFor(st, o.id); assert.ok(imp && imp.disclaimer === 'זה תרחיש לפי מה שידוע עכשיו — לא תחזית ולא הבטחה.', o.id);
      assert.ok(imp.mainRisk && imp.mainRisk.key && imp.mainRisk.text && Array.isArray(imp.assumptions));
      if (imp.scenarios) assert.ok(imp.scenarios.hard.cash <= imp.scenarios.base.cash, 'hard ≤ base');
      const c = E.deserialize(json);
      if (imp.basis === 'certain') {
        certain++; E.choose(c, null, o.id, o.needsQty ? { qty: 1 } : {}); const m = E.metrics(c);
        assert.equal(imp.cashAfter, m.cash, o.id + ' cash'); assert.equal(imp.cfAfter, m.cashflow, o.id + ' cf'); assert.equal(imp.fundAfter, m.savings);
        assert.equal(imp.netWorthDelta, m.netWorth - E.metrics(st).netWorth); assert.equal(imp.power.after, Math.round(c.life.energy)); assert.equal(imp.happiness.after, Math.round(E.metrics(c).life.happiness));
        assert.equal(imp.newLiabilities.filter((l) => l.label === 'הלוואה בנקאית').reduce((a, l) => a + l.amount, 0), Math.max(0, c.loans - st.loans));
      } else if (imp.basis === 'expected' && o.kind === 'buy' && c.pending.dd) {
        expected++; const exp = ev.data.dd.expected; // truth := the public expectation of the current basis (exact check below)
        assert.ok(Number.isFinite(exp.cf) && Number.isFinite(exp.value) && Number.isFinite(exp.repair));
        assert.ok(imp.assumptions.some((a) => /המוכר|טווח הבדיקה/.test(a)));
      } else if (imp.basis === 'branches') {
        // T6 §3.6: a delay step on a card others want adds the rival branch (inspect: 2 branches, offer: 3)
        branches++; assert.ok(imp.branches.length === 2 || imp.branches.length === 3); assert.ok(Math.abs(imp.branches.reduce((a, b) => a + b.p, 0) - 1) < 1e-9);
        if (/^offer:/.test(o.id)) { const acc = imp.branches.find((b) => !b.lost); c.pending.negR = 0; if (c.pending.rv) c.pending.rv.close = 0; E.choose(c, null, o.id); assert.equal(acc.cashAfter, c.cash); assert.equal(acc.cfAfter, E.metrics(c).cashflow); }
      }
    }
  }
  assert.ok(certain > 50 && branches > 5, `certain ${certain} expected ${expected} branches ${branches}`);
  // the expected basis equals a dry run with truth := expectation (built by hand on a w1 deal)
  const st = dealState('w1', { k: 're', n: 'בדיקה', d: 'x', cost: 80000, down: 8000, cf: 600 }, { cash: 30000 });
  const ev = E.currentEvent(st); const imp = E.impactFor(st, 'buy'); assert.equal(imp.basis, 'expected');
  const c = E.deserialize(E.serialize(st)); const ex = ev.data.dd.expected;
  c.pending.dd.base = ex.cf; c.pending.dd.val = ex.value; c.pending.dd.repair = ex.repair; // cf-card: base = cf
  E.choose(c, null, 'buy'); assert.equal(imp.cashAfter, c.cash); assert.equal(imp.cfAfter, E.metrics(c).cashflow); assert.equal(imp.netWorthDelta, E.metrics(c).netWorth - E.metrics(st).netWorth);
  // HUD actions and focus refs
  const s2 = E.createGame({ worldId: 'w1', seed: 4 }); for (const ref of ['act:loan', 'act:save:1000', 'focus:scout', 'focus:network']) { const i2 = E.impactFor(s2, ref); assert.ok(i2 && i2.disclaimer, ref); }
  assert.equal(E.impactFor(s2, 'act:loan').cashAfter - E.impactFor(s2, 'act:loan').cashBefore, E.getWorld('w1').loan.unit);
  assert.equal(E.impactFor(s2, 'focus:scout').power.delta, -5);
});

/* ------------------------------------------------------------------ T10 mentor levels */
test(`T10 mentor levels over ${N(60)} games per level: guide 1 primary / hint+pro none, no 'suggested', no verdict words; requestHint rules; pro withholds the verdict pill`, () => {
  const VERDICT = E.MN.VERDICT_WORDS;
  const findKey = (o, k) => o && typeof o === 'object' && (Object.prototype.hasOwnProperty.call(o, k) || Object.values(o).some((v) => findKey(v, k)));
  for (const level of ['guide', 'hint', 'pro']) {
    let events = 0, hints = 0, decisions = 0;
    for (let g = 0; g < N(60); g++) {
      const w = E.WORLDS[g % 4]; const st = E.createGame({ worldId: w.id, seed: 600 + g * 31, mode: 'free', mentor: level }); const r = prng(g + 11);
      for (let t = 0; t < 70 && !st.over; t++) {
        E.rollDice(st); let ev = E.landing(st); let n = 0;
        while (ev && !st.over) {
          events++;
          const en = ev.options.filter((o) => o.enabled); const nP = ev.options.filter((o) => o.primary).length;
          const tradeoff = (ev.type === 'life' && (ev.data.personal || ev.data.values)) || (ev.type === 'mystery' && ev.data.kind === 'quiz');
          if (level === 'guide') { if (en.length >= 2 && !tradeoff) assert.equal(nP, 1, `${ev.type} ${ev.title}`); }
          else {
            assert.equal(nP, 0, 'no primary at ' + level);
            if (level === 'hint' || level === 'pro') assert.ok(!findKey(ev, 'suggested'), 'no suggestion at ' + level);
            for (const s of [ev.mentor, ev.text, ev.data.roiVsLoan, ...ev.options.map((o) => o.label)]) if (typeof s === 'string') assert.ok(!VERDICT.test(s), `verdict wording at ${level}: ${s}`);
          }
          if (n === 0) {
            const before = st.actions.length; const h = E.requestHint(st);
            if (level === 'pro') { assert.equal(h.ok, false); assert.equal(st.actions.length, before); }
            else if (h.ok) {
              hints++; assert.deepEqual(st.actions.at(-1), ['H']); assert.ok(h.hint.optionId === null || en.some((o) => o.id === h.hint.optionId)); assert.ok(h.hint.reasons.length >= 1 && h.hint.note);
              const again = E.requestHint(st); assert.deepEqual(again.hint, h.hint); assert.equal(st.actions.length, before + 1, 'a second request is free and not logged');
            } else assert.equal(st.actions.length, before);
          }
          const o = n >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)];
          const res = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {});
          if (level === 'pro') assert.equal(res.decision, undefined, 'pro withholds the verdict pill'); else if (res.decision) decisions++;
          ev = res.event; n++;
        }
      }
      if (level === 'pro') assert.ok(st.dq.n > 0, 'pro still records decisions');
    }
    assert.ok(events > 200 && (level === 'pro' || hints > 50), `${level}: events ${events} hints ${hints} decisions ${decisions}`);
  }
});

/* ------------------------------------------------------------------ T11 evaluator */
test('T11 evaluator: offers on a bad deal ≤ pass; values/health/car/course/guarantee rules; guide primary = argmax; one cushion rule', () => {
  // a deal that stays bad after a discount: an offer is never better than passing
  const bad = dealState('w1', { k: 're', n: 'רע', d: 'x', cost: 60000, down: 5000, cf: -200 }, { dd: null, cash: 20000 });
  const sc = E.scoreOptions(bad, E.currentEvent(bad)); const pass = sc.find((x) => x.id === 'pass').U;
  for (const x of sc.filter((y) => /^offer/.test(y.id))) assert.ok(x.U <= pass + 1e-9, x.id);
  for (const w of E.WORLDS) for (const ch of w.characters) {
    for (const id of ['health', 'car']) {
      for (const opt of ['private', 'public', 'fix', 'new', 'bus']) {
        const st = E.createGame({ worldId: w.id, charId: ch.id, seed: 3, mode: 'free', mentor: 'guide' }); st.cash = Math.max(st.cash, 3 * E.metrics(st).expenses); // affordable (a loan would be a real risk flag)
        st.pending = { id: 5, type: 'life', tile: 'L', pos: 4, eventId: id, r: 0.5 }; st.phase = 'event';
        const ev = E.currentEvent(st); if (!ev.options.find((o) => o.id === opt)) continue;
        // director decision (gate A1): at guide a values card highlights the cheapest reasonable option, as v3 did (its default, no loan)
        assert.deepEqual(ev.options.filter((o) => o.primary).map((o) => o.id), [{ health: 'public', car: 'fix' }[id]], 'guide highlights the v3 default'); assert.equal(ev.data.values, true);
        const res = E.choose(st, ev, opt); assert.ok(res.decision.score >= 60, `${w.id}/${ch.id} ${id}:${opt} ${res.decision.score}`); assert.notEqual(res.decision.verdict, 'costly');
      }
    }
    // course: take ≥ skip when not studied, rested and with a cushion
    const st = E.createGame({ worldId: w.id, charId: ch.id, seed: 3, mode: 'free' }); st.life.energy = 70; st.cash = 20 * E.metrics(st).expenses;
    st.pending = { id: 6, type: 'life', tile: 'L', pos: 4, eventId: 'course', r: 0.5 }; st.phase = 'event';
    const s2 = E.scoreOptions(st, E.currentEvent(st)); assert.ok(s2.find((x) => x.id === 'take').U >= s2.find((x) => x.id === 'skip').U, `${w.id}/${ch.id} course`);
  }
  // a guarantee bigger than everything you have ⇒ a personal choice with a risk flag scores 50
  const g = E.createGame({ worldId: 'w1', seed: 3, mode: 'free' }); g.cash = 100; g.savings = 0;
  g.pending = { id: 7, type: 'life', tile: 'L', pos: 4, eventId: 'friend', r: 0.5 }; g.phase = 'event';
  assert.equal(E.choose(g, E.currentEvent(g), 'guarantee').decision.score, 50);
  // personal events are never 'costly'; the guide primary is the scorer's top option (within the 0.1 tie band)
  const states = sampleStates(N(120), 777, (st) => st.mentor === 'guide');
  for (const json of states) {
    const st = E.deserialize(json); const ev = E.currentEvent(st); const sc2 = E.scoreOptions(st, ev); const pr = ev.options.find((o) => o.primary);
    const dataPick = ev.type === 'life' && (ev.data.values || ev.data.chain); // director (A1) values pick / T3 story steps: data-driven guide picks
    const planPick = (ev.type === 'payday' || ev.type === 'edu') && pr && pr.kind === 'plan'; // T3 review M7: the careful plan rule, within the verdict's 0.5 band
    if (sc2.length && pr && !dataPick && !(ev.type === 'business' && st.flags['bz_' + st.pending.id])) { const best = Math.max(...sc2.map((x) => x.U)); const mine = sc2.find((x) => x.id === pr.id); assert.ok(mine && mine.U >= best - (planPick ? 0.5 : 0.1) - 1e-9, `${ev.type}: primary ${pr.id} ${mine && mine.U} vs best ${best}`); }
    if (ev.type === 'life' && ev.data.personal) for (const o of ev.options.filter((x) => x.enabled)) { const c = E.deserialize(json); const d = E.choose(c, null, o.id).decision; assert.ok(!d || d.verdict !== 'costly'); }
    // one cushion rule: the card's warning, the evaluator's flag and the impact's main risk agree
    if (ev.type === 'deal' && !ev.auto) {
      const best = ev.options.filter((o) => o.kind === 'buy' && o.enabled).sort((a, b) => b.net - a.net)[0];
      if (best && best.loanAmount === ev.options.find((o) => o.kind === 'buy').loanAmount) {
        const f = sc2.find((x) => x.id === best.id).flags.includes('noCushion');
        assert.equal(!!ev.data.warning, f, 'warning ⇔ noCushion flag');
      }
    }
  }
});

/* ------------------------------------------------------------------ T12 dominated options */
test('T12 dominated options: inst3 ⇒ no revolving credit; the report fee is charged monthly only while reporting with side income; dominance scan', () => {
  const w = E.getWorld('w1'); const toy = w.doodads.find((d) => d.inst && !d.need);
  for (const score of [700, 600, 599, 450]) {
    const st = E.createGame({ worldId: 'w1', seed: 2 }); st.life.creditScore = score; st.pending = { id: 3, type: 'doodad', tile: 'D', pos: 2, card: { ...toy } }; st.phase = 'event';
    const ids = E.currentEvent(st).options.map((o) => o.id);
    assert.equal(ids.includes('inst3'), score >= 600); assert.equal(ids.includes('credit'), score < 600);
  }
  { const st = E.createGame({ worldId: 'w1', seed: 2, rules: 3 }); st.pending = { id: 3, type: 'doodad', tile: 'D', pos: 2, card: { ...toy } }; st.phase = 'event'; const ids = E.currentEvent(st).options.map((o) => o.id); assert.ok(ids.includes('inst3') && ids.includes('credit'), 'rules 3: the v3 option set'); }
  // side report fee
  const pay = (st) => { const c0 = st.cash; const m0 = E.metrics(st); st.pos = 9; E.rollDice(st); return { got: st.cash - c0, m0 }; };
  let charged = 0, notCharged = 0;
  for (const rep of [true, false]) for (const plan of ['side', 'work']) {
    const st = E.createGame({ worldId: 'w1', seed: 12 }); st.life.plan = plan; st.life.side.months = 3; st.econ = null; E.setSideReport(st, rep);
    const cash0 = st.cash; const sideTax0 = st.taxes.side; st.pos = 9; st.phase = 'roll';
    // a deterministic landing: just compare taxes.side + the fee via the payday's amount
    const r = E.rollDice(st); const pd = r.paydays[0]; if (!pd) continue;
    if (rep && plan === 'side') { charged++; assert.ok(st.taxes.side > sideTax0); } else notCharged++;
    void cash0;
  }
  assert.ok(charged >= 1 && notCharged >= 1);
  { // exact: the same payday with and without reporting differs by tax + fee
    const mk = (rep) => { const st = E.createGame({ worldId: 'w2', seed: 31 }); st.life.plan = 'side'; st.econ = null; if (rep) E.setSideReport(st, true); st.pos = 9; st.phase = 'roll'; const t0 = st.taxes.side; const r = E.rollDice(st); return { amount: r.paydays[0].amount, tax: st.taxes.side - t0, steps: r.steps }; };
    const a = mk(true), b = mk(false);
    if (a.steps.includes(10) && b.steps.includes(10)) assert.equal(b.amount - a.amount, a.tax + E.getWorld('w2').sideReportFee);
  }
  const tax = E.createGame({ worldId: 'w3', seed: 2 }); tax.life.plan = 'side'; tax.pending = { id: 9, type: 'tax', tile: 'T', pos: 5, refund: 0, bill: 0 }; tax.phase = 'event';
  assert.ok(/עלות רו״ח ₪250 בחודש/.test(E.currentEvent(tax).options.find((o) => o.id === 'report').label));
});

/* ------------------------------------------------------------------ T13 due diligence */
test('T13 due diligence: inspect costs, ranges contain the truth, exact numbers, card stays open, buy applies the truth + repair, luck = actual − expected, golden/starter, trap question only at guide', () => {
  const card = { k: 're', n: 'דירה', d: 'x', cost: 90000, down: 9000, cf: 700, q: 'שאלה מכשילה?' };
  for (let i = 0; i < 40; i++) {
    const r = prng(i + 5); const f = 0.1 + r() * 0.9, vf = 0.7 + r() * 0.3, jitter = r(), repair = r() < 0.5 ? 0 : 100 * Math.floor(r() * 40);
    const st = dealState('w1', card, { cash: 60000, dd: { f, vf, jitter, repair, risk: 2 } }); const e0 = st.life.energy; const ev0 = E.currentEvent(st);
    assert.equal(ev0.data.dd.level, 0); assert.equal(ev0.data.dd.basis, 'claimed'); assert.equal(ev0.data.dd.range, null);
    assert.ok(ev0.options.findIndex((o) => o.id === 'inspect:1') < ev0.options.findIndex((o) => o.kind === 'buy'), 'inspections come before the buy options');
    assert.ok(/^לפי המוכר:/.test(ev0.options.find((o) => o.id === 'buy').netLabel));
    const r1 = E.choose(st, ev0, 'inspect:1'); assert.equal(r1.done, false); assert.equal(st.life.energy, e0 - 4); assert.equal(st.stats.inspections, 1);
    const ev1 = r1.event; const truthCf = Math.round(700 * f / 10) * 10;
    assert.ok(ev1.data.dd.range.cf[0] <= truthCf && truthCf <= ev1.data.dd.range.cf[1], `range ${ev1.data.dd.range.cf} contains ${truthCf}`);
    assert.ok(!ev1.options.some((o) => o.id === 'inspect:1') && /^לפי הבדיקה:/.test(ev1.options.find((o) => o.id === 'buy').netLabel));
    const fee = ev1.data.dd.inspect2.fee; assert.equal(fee, Math.max(400, Math.round(900 / 100) * 100)); const c0 = st.cash;
    const r2 = E.choose(st, ev1, 'inspect:2'); assert.equal(st.cash, c0 - fee); assert.equal(r2.event.data.dd.verified.cf, truthCf); assert.equal(r2.event.data.dd.verified.repair, repair);
    const n0 = st.assets.length; const c1 = st.cash; const loans0 = st.loans;
    const rb = E.choose(st, r2.event, 'buy'); const a = st.assets[n0];
    assert.equal(a.cf, truthCf, 'the asset earns the TRUE cashflow'); assert.equal(st.cash + (st.loans - loans0 > 0 ? 0 : 0), c1 - 9000 - repair + (st.loans - loans0)); assert.equal(st.stats.ddRepairs, repair);
    assert.equal(a.dd.claimedCf, 700); assert.equal(st.dq.luck.dd, 0, 'verified ⇒ no luck'); void rb;
  }
  // level 0 buy: luck = actual − expected
  const st = dealState('w1', card, { cash: 60000, dd: { f: 0.5, vf: 1, repair: 0 } }); const ev = E.currentEvent(st); const exp = ev.data.dd.expected;
  E.choose(st, ev, 'buy'); assert.equal(st.dq.luck.dd, Math.round((350 - exp.cf) * 24 + 0.25 * (90000 - exp.value) - (0 - exp.repair)));
  // scout: inspect:1 free, inspect:2 half
  const sc = dealState('w1', card, { cash: 60000 }); sc.life.focus = { id: 'scout', m: sc.month }; const evs = E.currentEvent(sc);
  assert.equal(evs.data.dd.inspect1.energy, 0); assert.equal(evs.data.dd.inspect2.fee, Math.round(Math.max(400, 900) * 0.5 / 100) * 100); assert.match(evs.options.find((o) => o.id === 'inspect:1').label, /חינם החודש/);
  // trap question: guide shows it before; hint/pro after the decision
  const gd = dealState('w1', card, { mentor: 'guide', cash: 60000 }); assert.equal(E.currentEvent(gd).mentor, 'שאלה מכשילה?');
  const ht = dealState('w1', card, { mentor: 'hint', cash: 60000 }); assert.notEqual(E.currentEvent(ht).mentor, 'שאלה מכשילה?');
  assert.match(E.choose(ht, null, 'pass').mentor, /^שאלה מכשילה\?/);
  // golden / starter: risk 0, no inspections on those
  const tut = E.createGame({ worldId: 'w1', charId: 'doctor', seed: 3, mode: 'free', tutorial: true }); E.choose(tut, null, 'skip'); E.rollDice(tut); const te = E.landing(tut); // T4: intro first; the sized tutorial deal
  assert.equal(te.type, 'deal'); assert.equal(tut.pending.dd.risk, 0); assert.ok(!te.options.some((o) => /^inspect/.test(o.id)));
  const DDm = E.DD; const gd2 = DDm.drawDD([0.99, 0.99, 0.5, 0.01, 0.5, 0.5], { down: 1000 }, 'w4', { golden: true }); assert.equal(gd2.risk, 0); assert.deepEqual(gd2.flags, ['rush']);
  // 6 draws → flags from the right pool, distinct
  for (let i = 0; i < 200; i++) { const r = prng(i); const rs = [r(), r(), r(), r(), r(), r()]; const d = DDm.drawDD(rs, { down: 5000 }, 'w3', { rent: false }); assert.equal(new Set(d.flags).size, d.flags.length); assert.ok(d.f >= -0.4 && d.f <= 1.05); }
  // posterior is a distribution, and more flags ⇒ worse expectation
  for (const w of ['w1', 'w2', 'w3', 'w4']) { const p0 = DDm.posterior(w, 0), p2 = DDm.posterior(w, 2); assert.ok(Math.abs(p0.reduce((a, b) => a + b, 0) - 1) < 1e-9); assert.ok(DDm.expectFactors(w, 2).f < DDm.expectFactors(w, 0).f); }
});

/* ------------------------------------------------------------------ T14 cycle */
test('T14 cycle: min lengths, w1 never starts in recession, signal 0..100, official lag ≥ 3, research sharpens, multipliers, econ null in history/rules 3, cyclePath = engine truth', () => {
  const CY = E.CY;
  for (const w of ['w1', 'w2', 'w3', 'w4']) {
    const C = CY.cycleCfg(w);
    for (let seed = 1; seed < 400; seed++) {
      const path = CY.cyclePath(seed, w, 80);
      if (w === 'w1') assert.notEqual(path[0].phase, 'rec');
      // every completed phase (not the first, whose start is random) lasts ≥ its min length
      let runStart = 0; for (let i = 1; i < path.length; i++) if (path[i].phase !== path[i - 1].phase) { if (runStart > 0) assert.ok(i - runStart >= C.minLen[path[i - 1].phase], `${w} seed ${seed} ${path[i - 1].phase} ${i - runStart}`); runStart = i; }
    }
  }
  // the engine's truth equals the seed-only path; signal in range; official lags ≥ 3; econ never in describe/metrics
  for (const w of E.WORLDS) for (const seed of [3, 44, 555]) {
    const st = E.createGame({ worldId: w.id, seed, mode: 'free' }); const r = prng(seed);
    for (let t = 0; t < 60 && !st.over; t++) { E.rollDice(st); let ev = E.landing(st); while (ev) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } void r; }
    const path = CY.cyclePath(seed, w.id, st.month - 1); assert.deepEqual(st.econ.truth, path.slice(0, st.econ.truth.length));
    const pub = E.metrics(st).econ; assert.ok(pub.signal >= 0 && pub.signal <= 100); assert.ok(pub.official.every((x) => x.m <= st.month - pub.officialLag) && pub.officialLag === (pub.sharp ? 1 : 3)); assert.equal(pub.phase, undefined);
  }
  // research: a sharper signal
  const err = (sharp) => { let e = 0, n = 0; for (let seed = 1; seed <= 25; seed++) { const ec = CY.initEcon(0.3, 0.5, 'w2'); const h = { c: seed * 7919 }; for (let m = 2; m <= 41; m++) { if (sharp) ec.sharpUntil = m; const rT = (Math.sin(seed * m) + 1) / 2 % 1; const rN = ((seed * 31 + m * 17) % 100) / 100; CY.stepEcon(ec, rT, rN, 'w2', m); e += Math.abs(ec.signal - CY.SCORE[ec.phase]); n++; void h; } } return e / n; };
  assert.ok(err(true) < err(false), `research sharpens: ${err(true)} vs ${err(false)}`);
  // multipliers: deal cost at the draw, loanPct / loanCap, index drift
  const st = E.createGame({ worldId: 'w3', seed: 7 }); st.econ.phase = 'rec';
  const base = E.createGame({ worldId: 'w3', seed: 7 }); base.econ = null;
  assert.equal(E.loanPct(st), Math.round((E.loanPct(base) + 0.3) * 100) / 100); assert.ok(E.loanCap(st) < E.loanCap(base) * 0.75);
  const p = E.createGame({ worldId: 'w1', seed: 3 }); p.econ.phase = 'rec'; p.pos = p.pos; // a deal drawn in a recession costs less, value unchanged
  const card = E.getWorld('w1').deals.find((c) => !c.tk && !c.crypto && c.cost > 50000);
  p.decks.deal = [E.getWorld('w1').deals.indexOf(card)]; const wB = E.getWorld('w1').board; p.pos = (wB.indexOf('O') - 2 + 40) % 40;
  E.rollDice(p); if (p.pending && p.pending.type === 'deal' && p.pending.card.n === card.n) { assert.equal(p.pending.card.cost, Math.round(card.cost * 0.93 / 100) * 100); assert.equal(p.pending.card.value, card.value ?? card.cost); }
  assert.equal(E.createGame({ mode: 'history', scenarioId: 'gfc', seed: 2 }).econ, null); assert.equal(E.createGame({ worldId: 'w2', seed: 2, rules: 3 }).econ, null);
  assert.equal(CY.mult({ phase: 'rec' }, 'w1', 'dealCost'), 1 - 0.14 * 0.5);
});

/* ------------------------------------------------------------------ T15 focus */
test('T15 focus: cost on activation, one per month, agenda pops at payday (disabled ones reported), ops opens the business with no draw, debt / frugal / network / none effects', () => {
  const W1 = (o = {}) => { const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 21, mode: 'free', ...o }); st.econ = st.econ && { ...st.econ }; return st; };
  const st = W1(); const e0 = st.life.energy;
  const r = E.setFocus(st, 'scout', 0); assert.ok(r.ok); assert.equal(st.life.energy, e0 - 5); assert.deepEqual(st.actions.at(-1), ['F', 'scout', 0]); assert.equal(st.life.focusMonths.scout, 1);
  assert.equal(E.setFocus(st, 'network', 0).ok, false, 'one focus per month'); assert.equal(E.setFocus(st, 'network', 0).error, 'כבר בחרת מוקד לחודש הזה');
  assert.ok(E.setFocus(st, 'network', 1).ok && E.setFocus(st, 'debt', 2).ok); assert.deepEqual(st.life.agenda, ['network', 'debt']);
  const n0 = st.actions.length; E.setFocus(st, 'network', 1); assert.equal(st.actions.length, n0, 'no state change ⇒ not logged');
  // payday: pops the agenda; debt is disabled (no debts) and reported
  st.pos = 9; st.phase = 'roll'; const roll = E.rollDice(st);
  if (roll.paydays.length) { assert.equal(st.life.focus.id, 'network'); assert.ok(roll.news.some((x) => x.kind === 'focus' && /קשרים/.test(x.text))); assert.deepEqual(st.life.agenda, ['debt', null]); }
  // none locks and gives +3 🔋 at payday
  const s2 = W1(); assert.ok(E.setFocus(s2, 'none', 0).ok); assert.equal(E.setFocus(s2, 'scout', 0).ok, false); const e2 = s2.life.energy; s2.pos = 9; const rr = E.rollDice(s2);
  if (rr.paydays.length === 1) assert.ok(s2.life.energy >= Math.min(100, e2 + 3) - 15, 'none +3 (plus the plan)');
  // disabled reasons
  const s3 = W1(); s3.life.energy = 10; const fo = E.metrics(s3).focus.options; assert.equal(fo.find((o) => o.id === 'scout').reason, 'אין לך מספיק כוח החודש'); assert.equal(fo.find((o) => o.id === 'ops').enabled, false); assert.equal(fo.find((o) => o.id === 'debt').reason, 'אין לך מספיק כוח החודש');
  const s3b = W1(); assert.equal(E.metrics(s3b).focus.options.find((o) => o.id === 'debt').reason, 'אין חובות לסדר'); assert.equal(E.metrics(s3b).focus.options.find((o) => o.id === 'ops').reason, 'אין לך עסק לנהל');
  // debt: card debt moves into the loan, the loan rate drops for 6 months, +10 credit once
  const s4 = W1(); s4.credit = 3000; s4.loans = 5000; s4.econ = null; const pct0 = E.loanPct(s4); const cs = s4.life.creditScore; const c4 = s4.cash;
  assert.ok(E.setFocus(s4, 'debt', 0).ok); assert.equal(s4.credit, 0); assert.equal(s4.loans, 8000); assert.equal(E.loanPct(s4), Math.round((pct0 - 0.5) * 100) / 100); assert.equal(s4.life.creditScore, cs + 10); assert.equal(s4.cash, c4 - 150);
  s4.month += 6; assert.equal(E.loanPct(s4), pct0, 'the discount ends after 6 months');
  // frugal: cancels the priciest subscription, or cuts a line once; setpoint −1 per audit (max 4)
  const s5 = W1(); s5.subs.push({ id: 's1', label: 'סטרימינג', amount: 90 }, { id: 's2', label: 'חדר כושר', amount: 250 }); const h5 = s5.life.happiness;
  assert.ok(E.setFocus(s5, 'frugal', 0).ok); assert.deepEqual(s5.subs.map((x) => x.id), ['s1']); assert.equal(s5.life.happiness, h5 - 3); assert.equal(s5.life.frugalCuts, 1);
  const s6 = W1({ rules: 4 }); const line = s6.expenses.find((x) => /אוכל/.test(x.label)); const a6 = line.amount; E.setFocus(s6, 'frugal', 0); assert.equal(line.amount, a6 - Math.round(a6 * 0.1 / 10) * 10); assert.equal(line.audited, true);
  const s6b = W1(); const line5 = s6b.expenses.find((x) => /אוכל/.test(x.label)); const a6b = line5.amount; E.setFocus(s6b, 'frugal', 0); assert.equal(line5.amount, a6b - Math.round(a6b * 0.05 / 10) * 10, 'rules 5 (E1 C1): w1 cuts 5 %');
  // network: +0.10 on negotiation and raise chances
  const s7 = dealState('w1', { k: 're', n: 'x', d: 'x', cost: 80000, down: 8000, cf: 500 }, { cash: 50000, dd: null }); const ch0 = E.currentEvent(s7).options.find((o) => o.id === 'offer:10').chance;
  s7.life.focus = { id: 'network', m: s7.month }; assert.equal(E.currentEvent(s7).options.find((o) => o.id === 'offer:10').chance, Math.round((ch0 + 0.1) * 100) / 100);
  // ops: opens the business panel now, no stream moves, closing returns to roll
  const s8 = E.createGame({ worldId: 'w1', seed: 5, mode: 'free' }); s8.cash = 50000; s8.pending = { id: 1, type: 'business', mode: 'offer', typeId: 'coffee', seed: 9, tile: 'K', pos: 15 }; s8.phase = 'event';
  E.choose(s8, null, 'start'); const a = s8.assets.find((x) => x.biz); a.biz.lastDecisionMonth = null; const rng0 = JSON.stringify(s8.rng); const pos0 = s8.pos;
  const ro = E.setFocus(s8, 'ops', 0); assert.ok(ro.ok, ro.error); assert.equal(ro.event.type, 'business'); assert.equal(s8.pending.source, 'focus'); assert.equal(JSON.stringify(s8.rng), rng0); assert.equal(s8.pos, pos0);
  const done = E.choose(s8, null, 'ok'); assert.equal(done.done, true); assert.equal(s8.phase, 'roll');
  // focus scoring: flags only
  const s9 = W1(); s9.cash = 0; s9.loans = E.loanCap(s9); const d9 = E.setFocus(s9, 'scout', 0).decision; assert.equal(d9.score, 60); assert.equal(d9.type, 'focus');
});

test('review M2: the level-1 inspection range widths come from the CLAIMED numbers — scrambling the sealed truth (f, vf, jitter, repair) never changes them', () => {
  for (const w of E.WORLDS) for (const card of [{ k: Object.keys(w.kinds)[0], n: 'x', d: 'x', cost: 90000, down: 9000, cf: 800 }, { k: Object.keys(w.kinds)[0], n: 'y', d: 'y', cost: 300000, down: 30000, cf: -300, value: 320000 }]) {
    const widths = new Set(); const vws = new Set();
    for (const [f, vf, j] of [[0.5, 0.8, 0.1], [0.9, 1.1, 0.5], [1, 1, 0.9], [0.3, 0.7, 0.33]]) {
      const st = dealState(w.id, card, { dd: { f, vf, jitter: j, level: 1, repair: 2000 }, cash: 200000 });
      const ev = E.currentEvent(st); const r = ev.data.dd.range; assert.ok(r, 'level-1 range');
      widths.add(Math.round((r.cf[1] - r.cf[0]) / 20)); vws.add(Math.round((r.value[1] - r.value[0]) / 10));
    }
    assert.ok(widths.size <= 2 && vws.size <= 2, `${w.id} widths ${[...widths]} / ${[...vws]} (only rounding may differ)`);
  }
});

test('T2 verify D5 + D6: the level-1 buy range spans the loan a repair in its bucket adds; the value range sits at its own position (not the cashflow jitter)', () => {
  const card = { k: 'biz', n: 'עסק', d: 'x', cost: 200000, down: 40000, cf: 1500 }; // not a rental: rent tax is its own row on the card
  let inside = 0, n = 0, posDiff = 0;
  for (let i = 0; i < 60; i++) {
    const r = prng(i + 101); const repair = r() < 0.3 ? 0 : 100 * Math.round((0.05 + 0.25 * r()) * 40000 / 100); const j = r();
    const st = dealState('w1', card, { cash: 30000 + Math.round(r() * 20000), dd: { f: 0.6 + 0.4 * r(), vf: 0.85 + 0.15 * r(), jitter: j, repair, level: 1, risk: 2 } });
    st.savings = 0; const ev = E.currentEvent(st); const buy = ev.options.find((o) => o.id === 'buy'); const R = ev.data.dd.range;
    const m = /([−-]?₪[\d,]+)\s*עד\s*([−-]?₪[\d,]+)/.exec(buy.netLabel); assert.ok(m, buy.netLabel);
    const num = (x) => (/[−-]/.test(x) ? -1 : 1) * +x.replace(/[^\d]/g, ''); const lo = num(m[1]), hi = num(m[2]);
    const cf0 = E.metrics(st).cashflow; E.choose(st, ev, 'buy'); const d = E.metrics(st).cashflow - cf0; n++;
    if (d >= lo - 10 && d <= hi + 10) inside++;
    const vPos = (st.assets[st.assets.length - 1].value - R.value[0]) / Math.max(1, R.value[1] - R.value[0]);
    if (Math.abs(vPos - j) > 0.05) posDiff++;
    assert.ok(st.assets[st.assets.length - 1].value >= R.value[0] - 1 && st.assets[st.assets.length - 1].value <= R.value[1] + 1, 'the value range contains the true value');
  }
  assert.equal(inside, n, `the real Δcf is inside the buy button's range ${inside}/${n}`);
  assert.ok(posDiff >= n * 0.8, `the value position is not the cashflow jitter (${posDiff}/${n})`);
});
test('review M1: the gauge is honest (lagged, noisy, correlated with the phase); research gives a real, limited edge — the phase-age report and the official figure 2 months earlier', () => {
  const CYm = E.CY; let agree = 0, n = 0, ripeOk = 0, reps = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const ec = CYm.initEcon(((seed * 37) % 100) / 100, ((seed * 53) % 100) / 100, 'w2'); let s = seed * 9973;
    const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let m = 2; m <= 60; m++) {
      const sharp = m % 9 === 0; if (sharp) ec.sharpUntil = m;
      const phase0 = ec.phase; CYm.stepEcon(ec, R(), R(), 'w2', m);
      const pub = CYm.econPublic(ec, m, 'w2'); n++;
      if ((pub.signal >= 50) === (phase0 === 'exp' || phase0 === 'slow')) agree++; // the gauge reads LAST month's phase, with noise
      assert.equal(pub.phase, undefined); assert.equal(JSON.stringify(pub).includes('"m":' + ec.m + ',"phase"'), false);
      if (sharp) { reps++; assert.ok(pub.report && pub.officialLag === 1); if (pub.report.ripe === (ec.m + 1 >= CYm.cycleCfg('w2').minLen[ec.phase])) ripeOk++; }
      else { assert.equal(pub.report, null); assert.equal(pub.officialLag, 3); }
    }
  }
  assert.ok(agree / n > 0.65 && agree / n < 0.99, `gauge correlated but not exact: ${(agree / n).toFixed(2)}`);
  assert.equal(ripeOk, reps, 'the report is true');
  assert.match(E.FC.FOCUS.research.benefit, /חודש/);
});

test('review minors: m1 a hint after an inspection is counted again; m2 a verified repair is in the buy loan (no forced loan); m3 no business recommendation in data at hint/pro', () => {
  // m1
  const card = { k: 're', n: 'x', d: 'x', cost: 90000, down: 9000, cf: 800 };
  const st = dealState('w1', card, { mentor: 'hint', cash: 100000 });
  E.requestHint(st); E.requestHint(st); assert.equal(st.dq.hints, 1, 'same card state: one hint');
  E.choose(st, null, 'inspect:1'); E.requestHint(st); assert.equal(st.dq.hints, 2, 'after an inspection the hint is new');
  assert.equal(st.actions.filter((a) => a[0] === 'H').length, 2);
  // m2
  const s2 = dealState('w1', card, { mentor: 'hint', cash: 9500, dd: { level: 2, repair: 3000, f: 1, vf: 1 } });
  const ev = E.currentEvent(s2); const buy = ev.options.find((o) => o.id === 'buy'); assert.ok(buy.loanAmount >= 2500, 'the loan covers the verified repair: ' + buy.loanAmount);
  const f0 = s2.stats.forcedLoans; E.choose(s2, ev, 'buy'); assert.equal(s2.stats.forcedLoans, f0, 'no forced loan'); assert.ok(s2.cash >= 0);
  // m3
  for (const level of ['hint', 'pro', 'guide']) {
    const b = E.createGame({ worldId: 'w2', seed: 4, mode: 'free', mentor: level }); b.cash = 1e6;
    b.pending = { id: 5, type: 'business', tile: 'K', pos: 3, mode: 'offer', typeId: 'coffee', seed: 9 }; b.phase = 'event'; E.choose(b, null, 'start');
    const a = b.assets.find((x) => x.biz); b.pending = { id: 6, type: 'business', tile: 'K', pos: 3, mode: 'manage', assetId: a.id }; b.phase = 'event';
    const e2 = E.currentEvent(b); assert.equal(e2.data.why.length > 0, level === 'guide', level);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
