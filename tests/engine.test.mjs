#!/usr/bin/env node
// Engine tests — run: node tests/engine.test.mjs [gamesPerWorld=2000]
// Plain asserts, no dependencies.
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { ACHIEVEMENTS, checkMetaAchievements, titleFor } from '../js/achievements.js';
import { readFileSync } from 'node:fs';

const GAMES = +(process.argv[2] || 2000);
let passed = 0, failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${e.stack.split('\n').slice(0, 4).join('\n   ')}`); }
}
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Random-but-legal decision for an event (used by several tests). */
function randomChoice(ev, r, n) {
  const en = ev.options.filter((o) => o.enabled);
  if (n >= 3) { const c = en.find((o) => ['done', 'ok', 'pass'].includes(o.id)); if (c) return [c.id]; }
  const o = en[Math.floor(r() * en.length)];
  if (o.needsQty) return [o.id, { qty: 1 + Math.floor(r() * o.max) }];
  return [o.id];
}
/** Play one turn with a decision function. Returns {sig, end}. */
function turn(st, decide) {
  const roll = E.rollDice(st);
  let ev = E.landing(st);
  const sig = `${roll.die}|${ev.type}|${ev.title}`;
  let n = 0, end = null;
  while (ev) {
    const [id, params] = decide(ev, n);
    const res = E.choose(st, ev, id, params);
    if (res.end) end = res.end;
    ev = res.event; n++;
    if (n > 60) throw new Error('event never closes: ' + sig);
  }
  return { sig, end, roll };
}

/* ------------------------------------------------------------------ determinism */
test('determinism: same seed + different decisions ⇒ identical dice & cards (60 turns, every world/character)', () => {
  for (const w of E.WORLDS) for (const ch of w.characters) for (const seed of [11, 4242, 98765]) {
    const a = E.createGame({ worldId: w.id, charId: ch.id, seed, mode: 'free' });
    const b = E.createGame({ worldId: w.id, charId: ch.id, seed, mode: 'free' });
    const ra = prng(seed * 3 + 1);
    // A: never buys anything (passes / done / ok / cheapest legal option). B: random legal decisions.
    const passive = (ev) => { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok'].includes(x.id)) || ev.options.find((x) => x.enabled); return [o.id, o.needsQty ? { qty: 1 } : undefined]; };
    let same = 0;
    // keep playing past a win/bankruptcy so we can compare a full 60 turns (we only test the RNG here)
    const revive = (st) => { if (st.over) { st.over = null; st.result = null; st.flags.bankrupt = false; st.phase = 'roll'; } };
    for (let t = 0; t < 60; t++) {
      revive(a); revive(b);
      const sa = turn(a, passive).sig;
      const sb = turn(b, (ev, n) => randomChoice(ev, ra, n)).sig;
      assert.equal(sa, sb, `${w.id}/${ch.id}/seed ${seed} turn ${t}: ${sa} ≠ ${sb}`);
      same++;
    }
    assert.equal(same, 60);
  }
});

test('determinism: two identical runs produce byte-identical states', () => {
  for (const w of E.WORLDS) {
    const run = () => { const st = E.createGame({ worldId: w.id, seed: 777, mode: 'challenge' }); const r = prng(5); for (let t = 0; t < 80 && !st.over; t++) turn(st, (ev, n) => randomChoice(ev, r, n)); return E.serialize(st); };
    assert.equal(run(), run());
  }
});

/* ------------------------------------------------------------------ save / resume */
test('JSON round-trip: saving & resuming every step (incl. mid-event) equals continuous play', () => {
  for (const w of E.WORLDS) for (const seed of [3, 31337]) {
    const cont = E.createGame({ worldId: w.id, seed, mode: 'weekly' });
    let saved = E.createGame({ worldId: w.id, seed, mode: 'weekly' });
    const r1 = prng(seed), r2 = prng(seed);
    for (let t = 0; t < 70 && !cont.over; t++) {
      turn(cont, (ev, n) => randomChoice(ev, r1, n));
      // same decisions, but serialize/deserialize between every call
      saved = E.deserialize(E.serialize(saved));
      E.rollDice(saved);
      saved = E.deserialize(JSON.parse(JSON.stringify(saved)));
      let ev = E.landing(saved); let n = 0;
      while (ev) {
        saved = E.deserialize(E.serialize(saved));
        const again = E.landing(saved); // resume shows the very same event
        assert.deepEqual(again, ev);
        const [id, p] = randomChoice(again, r2, n);
        const res = E.choose(saved, again, id, p);
        ev = res.event; n++;
      }
      assert.equal(E.serialize(saved), E.serialize(cont), `${w.id} seed ${seed} diverged at turn ${t}`);
    }
  }
});

test('deserialize rejects unknown save versions', () => {
  const st = E.createGame({ worldId: 'w1', seed: 1 });
  assert.throws(() => E.deserialize({ ...st, v: 999 }));
});

/* ------------------------------------------------------------------ event validity + no NaN (big random run) */
function scanNumbers(obj, path, bad) {
  if (typeof obj === 'number') { if (!Number.isFinite(obj)) bad.push(path); return; }
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) scanNumbers(v, path + '.' + k, bad);
}
const SOUNDS = new Set(['roll', 'hop', 'coin', 'loss', 'buy', 'sell', 'card', 'win', 'lose', 'unlock', 'achievement', 'golden']);
const EVENT_TYPES = new Set(['payday', 'deal', 'trade', 'doodad', 'market', 'crisis', 'mystery', 'bank', 'upgrade', 'fx', 'shipping', 'pitch', 'giving']);
const typesSeen = {};
const achSeen = new Set();
let endings = { won: 0, lost: 0, bankrupt: 0 };

function checkEvent(st, ev, where) {
  assert.ok(EVENT_TYPES.has(ev.type), where + ' bad type ' + ev.type);
  assert.ok(typeof ev.title === 'string' && ev.title.length > 0, where + ' empty title');
  assert.ok(typeof ev.tag === 'string' && ev.tag.length > 0, where + ' empty tag');
  assert.ok(typeof ev.color === 'string' && ev.color.startsWith('#'), where + ' bad color');
  assert.ok(typeof ev.mentor === 'string' && ev.mentor.trim().length > 0, where + ' empty mentor for ' + ev.type + ' ' + ev.title);
  assert.ok(SOUNDS.has(ev.sound), where + ' bad sound ' + ev.sound);
  assert.ok(Array.isArray(ev.options) && ev.options.length > 0, where + ' no options');
  const ids = ev.options.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, where + ' duplicate option ids ' + ids);
  assert.ok(ev.options.some((o) => o.enabled), where + ' no enabled option');
  const nPrim = ev.options.filter((o) => o.primary).length;
  if (ev.type === 'mystery' && ev.data.kind === 'quiz') assert.equal(nPrim, 0, where + ' quiz must not highlight an answer');
  else assert.equal(nPrim, 1, where + ' exactly one primary');
  for (const o of ev.options) assert.equal(typeof o.primary, 'boolean', where + ' primary must be boolean');
  if (ev.auto) { assert.equal(ev.options.length, 1, where + ' auto card must have one option'); assert.ok(ev.toastText && ev.toastText.length > 0, where + ' auto card needs toastText'); }
  for (const o of ev.options.filter((x) => x.kind === 'buy' && ev.type === 'deal')) { assert.ok(Number.isFinite(o.net) && typeof o.netLabel === 'string', where + ' buy option needs net/netLabel'); }
  if (ev.type === 'deal' && !ev.auto) { const pr = ev.options.find((o) => o.primary); if (pr.kind === 'buy') assert.ok(pr.net > 0, where + ' primary buy must add money every month'); }
  if (['doodad', 'crisis'].includes(ev.type) && !ev.auto) { for (const k of ['pay', 'shortfall', 'loanAmount', 'loanMonthly']) assert.ok(Number.isFinite(ev.data[k]), where + ' missing ' + k); if (ev.data.shortfall > 0) assert.ok(ev.data.loanAmount >= ev.data.shortfall); }
  if (ev.type === 'doodad') assert.equal(!!ev.options.find((o) => o.id === 'skip'), !ev.data.need, where + ' wants (only) can be refused');
  for (const o of ev.options) {
    assert.ok(typeof o.label === 'string' && o.label.trim().length > 0, where + ' empty label');
    assert.equal(typeof o.enabled, 'boolean');
    if (!o.enabled) assert.ok(typeof o.reason === 'string' || o.reason === undefined);
    if (o.needsQty) assert.ok(Number.isInteger(o.max) && o.max >= 0);
  }
  const bad = []; scanNumbers(ev.data, 'data', bad);
  assert.equal(bad.length, 0, where + ' NaN in event data ' + bad.join(','));
  // every enabled option must be choosable (try it on a copy)
  for (const o of ev.options.filter((x) => x.enabled)) {
    const copy = E.deserialize(E.serialize(st));
    const res = E.choose(copy, ev, o.id, o.needsQty ? { qty: Math.max(1, Math.min(o.max, 2)) } : undefined);
    assert.ok(res.ok, `${where} option ${o.id} rejected: ${res.error}`);
    for (const fx of res.effects) if (fx.type === 'sound') assert.ok(SOUNDS.has(fx.name), 'unknown sound ' + fx.name);
  }
}

for (const w of E.WORLDS) {
  test(`${w.id}: ${GAMES} random games — valid events, every option choosable, no NaN in metrics`, () => {
    for (let g = 0; g < GAMES; g++) {
      const ch = w.characters[g % w.characters.length];
      const st = E.createGame({ worldId: w.id, charId: ch.id, seed: 50000 + g * 13, mode: g % 2 ? 'challenge' : 'free', tutorial: g % 7 === 0 });
      const r = prng(g + 1);
      const deep = g < 40; // full option-by-option check on the first games, fast path afterwards
      for (let t = 0; t < 140 && !st.over; t++) {
        if (r() < 0.05) E.takeLoan(st);
        if (r() < 0.05 && st.loans) E.repayLoan(st);
        if (!st.over && r() < 0.05 && st.credit) E.payCredit(st);
        if (st.over) break;
        const roll = E.rollDice(st);
        assert.ok(roll.die >= 1 && roll.die <= 6);
        assert.equal(roll.steps.length, roll.die);
        let ev = E.landing(st); let n = 0;
        while (ev) {
          typesSeen[ev.type] = (typesSeen[ev.type] || 0) + 1;
          if (deep) checkEvent(st, ev, `${w.id}/g${g}/t${t}`);
          else { assert.ok(ev.mentor && ev.title && ev.options.some((o) => o.enabled), `${w.id}/g${g}/t${t} bad event`); }
          const [id, p] = randomChoice(ev, r, n);
          const res = E.choose(st, ev, id, p);
          assert.ok(res.ok, `${w.id}/g${g} ${ev.type}:${id} → ${res.error}`);
          for (const a of res.achievements) achSeen.add(a.id);
          if (res.end) { endings[res.end.reason === 'bankrupt' ? 'bankrupt' : res.end.status]++; }
          ev = res.event; n++;
        }
        const m = E.metrics(st);
        const bad = []; scanNumbers(m, 'm', bad);
        assert.equal(bad.length, 0, `${w.id}/g${g}/t${t} NaN in metrics: ${bad.slice(0, 5).join(', ')}`);
        assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1);
        for (const x of E.cityModels(st)) assert.ok(typeof x.model === 'string' && x.key, 'bad city model');
      }
      for (const a of st.ach) achSeen.add(a);
    }
  });
}

test('every event type of every world appeared in the random run', () => {
  for (const w of E.WORLDS) for (const ch of new Set(w.board)) {
    const t = w.tiles[ch].type;
    assert.ok(typesSeen[t] > 0, 'never saw ' + t);
  }
  assert.ok(endings.won > 0 && endings.lost > 0, 'expected both wins and losses ' + JSON.stringify(endings));
});

/* ------------------------------------------------------------------ rules & API behaviour */
test('flow guards: cannot roll with a pending event; stale/unknown options throw; landing is idempotent', () => {
  const st = E.createGame({ worldId: 'w1', seed: 9 });
  assert.equal(E.landing(st), null);
  E.rollDice(st);
  assert.throws(() => E.rollDice(st));
  const ev = E.landing(st);
  assert.deepEqual(E.landing(st), ev);
  assert.throws(() => E.choose(st, { id: ev.id + 99 }, ev.options[0].id));
  assert.throws(() => E.choose(st, ev, 'no-such-option'));
});

test('payday on corners incl. passing; months advance only on paydays (v1 rule)', () => {
  for (let seed = 1; seed < 200; seed++) {
    const st = E.createGame({ worldId: 'w1', seed });
    const m0 = st.month; const c0 = st.cash; const cf0 = E.metrics(st).cashflow;
    const r = E.rollDice(st);
    const corners = r.steps.filter((i) => i % 6 === 0).length;
    assert.equal(r.paydays.length, corners);
    assert.equal(st.month, m0 + corners);
    if (corners) assert.equal(st.cash, c0 + cf0 * corners);
  }
});

test('auto bank loan when cash < 0, in small units, at the bank-loan rate', () => {
  const st = E.createGame({ worldId: 'w1', charId: 'driver', seed: 1 });
  st.cash = -7200; st.phase = 'roll';
  // force via a doodad-like path: emulate payday handling through takeLoan/ensure by choosing a doodad
  const w = E.getWorld('w1');
  st.pending = { id: 999, type: 'doodad', tile: 'D', pos: 2, card: { ...w.doodads[0], a: 100 } }; st.phase = 'event';
  const res = E.choose(st, { id: 999 }, 'pay');
  assert.equal(st.loans, 8000, 'forced loans are rounded to ₪1,000, not ₪5,000');
  assert.ok(st.cash >= 0 && st.cash < 1000);
  assert.ok(res.effects.some((e) => e.type === 'loan' && e.auto));
  assert.equal(E.metrics(st).expenseLines.find((l) => l.id === 'loan').amount, 240, '3% a month');
  assert.equal(st.stats.forcedLoans, 8000);
});

test('player loan actions: take / repay / pay credit', () => {
  const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 2 });
  const c = st.cash;
  assert.ok(E.takeLoan(st).ok); assert.equal(st.loans, 5000); assert.equal(st.cash, c + 5000);
  assert.ok(E.repayLoan(st).ok); assert.equal(st.loans, 0); assert.equal(st.cash, c);
  assert.equal(E.repayLoan(st).ok, false);
  st.credit = 1000; assert.equal(E.metrics(st).expenseLines.find((l) => l.id === 'credit').amount, 50);
  assert.ok(E.payCredit(st).ok); assert.equal(st.credit, 0);
  const st2 = E.createGame({ worldId: 'w3', seed: 1 });
  let refused = false; for (let i = 0; i < 200; i++) { if (!E.takeLoan(st2).ok) { refused = true; break; } }
  assert.ok(refused, 'w3 bank must refuse voluntary loans past the cap');
});

test('trade window: repeated buy & sell inside one event, then done', () => {
  for (let seed = 1; seed < 400; seed++) {
    const st = E.createGame({ worldId: 'w1', charId: 'doctor', seed });
    for (let t = 0; t < 30; t++) {
      E.rollDice(st); let ev = E.landing(st);
      if (ev.type === 'trade' && ev.data.maxBuy >= 3) {
        const tk = ev.data.ticker; const price = ev.data.price; const cash0 = st.cash;
        let r = E.choose(st, ev, 'buy', { qty: 2 }); assert.ok(r.ok && !r.done); assert.equal(st.holdings[tk].qty, 2);
        r = E.choose(st, r.event, 'buy', { qty: 1 }); assert.equal(st.holdings[tk].qty, 3);
        r = E.choose(st, r.event, 'sell', { qty: 3 }); assert.equal(st.holdings[tk].qty, 0); assert.equal(st.cash, cash0);
        const bad = E.choose(st, r.event, 'sell', { qty: 1 }); assert.equal(bad.ok, false);
        const over = E.choose(st, r.event, 'buy', { qty: r.event.data.maxBuy + 1 }); assert.equal(over.ok, false);
        r = E.choose(st, r.event, 'done'); assert.ok(r.done && r.event === null);
        assert.ok(price > 0);
        return;
      }
      while (ev) { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok'].includes(x.id)) || ev.options.find((x) => x.enabled); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined).event; }
    }
  }
  assert.fail('no trade event found');
});

test('checkEnd: stars monotonic in months, 0 beyond the limit, thresholds sane', () => {
  for (const w of E.WORLDS) for (const ch of w.characters) {
    const T = E.starThresholds(w, ch.id);
    assert.ok(T.t3 < T.t2 && T.t2 <= T.maxMonths, `${w.id}/${ch.id} thresholds ${JSON.stringify(T)}`);
    let prev = 3;
    for (let m = 1; m <= T.maxMonths + 10; m++) {
      const s = E.starsFor(w, m, T.maxMonths, ch.id);
      assert.ok(s <= prev && s >= 0 && s <= 3, `${w.id}/${ch.id} month ${m}: ${s} after ${prev}`);
      prev = s;
    }
    assert.equal(E.starsFor(w, 1, T.maxMonths, ch.id), 3);
    assert.equal(E.starsFor(w, T.maxMonths + 1, T.maxMonths, ch.id), 0);
  }
});

test('checkEnd: win / time-out / bankrupt results are complete', () => {
  // win by construction: give a w1 teacher enough passive income
  const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 5, mode: 'challenge' });
  st.assets.push({ id: 900, k: 're', n: 'בדיקה', cost: 1, down: 1, debt: 0, value: 1, cf: 99999, month: 1, ups: 0 });
  const end = E.checkEnd(st);
  assert.equal(end.status, 'won'); assert.ok(end.stars >= 1 && end.lesson && end.nearMiss.text);
  const st2 = E.createGame({ worldId: 'w3', seed: 5, mode: 'daily', maxMonths: 40 }); st2.month = 41;
  const e2 = E.checkEnd(st2); assert.equal(e2.status, 'lost'); assert.equal(e2.reason, 'time'); assert.ok(/חסרו/.test(e2.nearMiss.text));
  const st3 = E.createGame({ worldId: 'w1', seed: 5, mode: 'free' }); st3.month = 500;
  assert.equal(E.checkEnd(st3), null, 'free mode never times out');
  assert.ok(endings.bankrupt > 0, 'bankruptcy should be reachable by random play');
});

test('tutorial (free only): first roll lands on a deal = the starter deal (no loan needed), no crisis in 3 turns, RNG not shifted', () => {
  for (const w of E.WORLDS) for (const ch of w.characters) for (const seed of [1234, 77, 9001]) {
    const a = E.createGame({ worldId: w.id, charId: ch.id, seed, tutorial: true });
    const b = E.createGame({ worldId: w.id, charId: ch.id, seed });
    const ra = E.rollDice(a); E.rollDice(b);
    const ev = E.landing(a);
    assert.equal(ev.type, 'deal', `${w.id}/${ch.id}: tutorial first card is ${ev.type}`);
    assert.equal(ev.title, w.starterDeal.n);
    assert.ok(ev.options.find((o) => o.kind === 'buy').loanAmount === 0, 'starter deal never needs a loan');
    assert.deepEqual(a.rng.dice, b.rng.dice, 'dice stream consumed identically');
    E.choose(a, ev, ev.options.find((o) => o.kind === 'buy').id); assert.ok(a.assets.length >= 1);
    E.landing(b); // keep b aligned
    let ev2 = E.landing(b); while (ev2) { const o = ev2.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || ev2.options.find((x) => x.enabled); ev2 = E.choose(b, ev2, o.id, o.needsQty ? { qty: 1 } : undefined).event; }
    for (let t = 0; t < 2; t++) { const r1 = E.rollDice(a); const r2 = E.rollDice(b); assert.equal(r1.die, r2.die); let e = E.landing(a); if (e.type === 'crisis') assert.ok(e.auto && e.data.skipped, 'no crisis in the first 3 tutorial turns'); while (e) { const o = e.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || e.options.find((x) => x.enabled); e = E.choose(a, e, o.id, o.needsQty ? { qty: 1 } : undefined).event; } let f = E.landing(b); while (f) { const o = f.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || f.options.find((x) => x.enabled); f = E.choose(b, f, o.id, o.needsQty ? { qty: 1 } : undefined).event; } }
  }
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, tutorial: true, mode: 'daily' }).tutorial, false, 'tutorial is ignored outside free mode');
});

test('w4 startup outcome is sealed at the pitch (same for investors and non-investors)', () => {
  for (let seed = 1; seed < 60; seed++) {
    const a = E.createGame({ worldId: 'w4', seed }); const b = E.createGame({ worldId: 'w4', seed });
    for (let t = 0; t < 25; t++) {
      E.rollDice(a); E.rollDice(b); const ea = E.landing(a); const eb = E.landing(b);
      if (ea.type === 'pitch') assert.deepEqual(a.pending.hidden, b.pending.hidden);
      for (const [st, ev0, inv] of [[a, ea, true], [b, eb, false]]) { let ev = ev0; while (ev) { const pick = inv && ev.type === 'pitch' ? ev.options.find((o) => o.enabled && o.id.startsWith('inv')) : null; const o = pick || ev.options.find((x) => x.enabled && ['pass', 'done', 'ok'].includes(x.id)) || ev.options.find((x) => x.enabled); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined).event; } }
    }
  }
});

test('mechanics move the world indicators (rate / usd / impact) and react', () => {
  const st2 = E.createGame({ worldId: 'w2', charId: 'chef', seed: 3 });
  const a = st2.assets[0]; const cf4 = E.assetCf(st2, a);
  st2.world.rate = 7; assert.ok(E.assetCf(st2, a) < cf4, 'variable mortgage cashflow must fall when rate rises');
  a.fixedRate = 5; const cfF = E.assetCf(st2, a); st2.world.rate = 9; assert.equal(E.assetCf(st2, a), cfF, 'fixed rate is immune');
  assert.ok(E.loanPct(st2) > E.loanPct(E.createGame({ worldId: 'w2', seed: 3 })), 'bank loans follow the rate');
  const st3 = E.createGame({ worldId: 'w3', charId: 'importer', seed: 3 });
  const imp = st3.assets[0]; const c0 = E.assetCf(st3, imp); const v0 = E.assetValue(st3, imp);
  st3.world.usd = 4.0; assert.ok(E.assetCf(st3, imp) < c0 && E.assetValue(st3, imp) < v0, 'strong dollar hurts importers');
  imp.hedge = { rate: 3.6, until: 99 }; assert.equal(E.assetCf(st3, imp), c0, 'hedge freezes the rate');
  const m3 = E.metrics(st3); assert.ok(m3.worldIndicators.usd === 4 && m3.goalType === 'netWorth');
  const st4 = E.createGame({ worldId: 'w4', charId: 'social', seed: 3 });
  assert.equal(E.metrics(st4).worldIndicators.impact, 20);
  assert.equal(E.metrics(st4).goalParts.length, 2);
});

/* ------------------------------------------------------------------ v2.1 rules */
test('debt order: mortgage < bank loan < credit card, in every world (w2 even at the max rate)', () => {
  for (const w of E.WORLDS) {
    const st = E.createGame({ worldId: w.id, seed: 1 });
    if (w.mechanic === 'rate') st.world.rate = w.rate.max;
    const loan = E.loanPct(st);
    assert.ok(w.creditPct > loan, `${w.id}: credit ${w.creditPct}% must cost more than a bank loan ${loan}%`);
    if (w.mechanic === 'rate') assert.ok(w.rate.max / 12 < loan, 'a mortgage is cheaper than a bank loan');
    const m = E.metrics(st); assert.ok(m.loanCap > 0 && Number.isFinite(m.loanCap), `${w.id}: the bank lends against income (cap)`);
    let refused = false; for (let i = 0; i < 400; i++) { const r = E.takeLoan(st); if (!r.ok) { refused = true; assert.ok(/הבנק בודק/.test(r.error)); break; } }
    assert.ok(refused, `${w.id}: bank must refuse past the cap`);
  }
});

test('wants can be refused (stats + achievement), needs cannot', () => {
  const st = E.createGame({ worldId: 'w1', seed: 2 });
  const w = E.getWorld('w1');
  const want = w.doodads.find((d) => !d.need); const need = w.doodads.find((d) => d.need);
  let got = [];
  for (let i = 0; i < 4; i++) {
    st.pending = { id: 500 + i, type: 'doodad', tile: 'D', pos: 2, card: { ...want } }; st.phase = 'event';
    const ev = E.currentEvent(st); assert.ok(ev.options.find((o) => o.id === 'skip').primary);
    const r = E.choose(st, ev, 'skip'); got = got.concat(r.achievements.map((a) => a.id));
  }
  assert.equal(st.stats.resisted, 4); assert.equal(st.stats.toysResisted, want.a * 4); assert.ok(got.includes('strong_will'));
  st.pending = { id: 600, type: 'doodad', tile: 'D', pos: 2, card: { ...need } }; st.phase = 'event';
  const ev = E.currentEvent(st); assert.ok(!ev.options.find((o) => o.id === 'skip')); assert.ok(ev.options.find((o) => o.id === 'pay').primary);
});

test('crypto: expected value < 1, a dead coin cannot be bought, a new launch wipes the dead coin', () => {
  const w = E.getWorld('w1'); const C = w.crypto;
  const tot = C.fates.reduce((a, f) => a + f.w, 0);
  // best strategy = sell at the first price above launch; EV of ₪1 invested
  const ev = C.fates.reduce((a, f) => a + (f.w / tot) * (f.path.find((p) => p > C.launchPrice) || f.path[f.path.length - 1]) / C.launchPrice, 0);
  assert.ok(ev < 1, 'crypto EV must be < 1, got ' + ev);
  const st = E.createGame({ worldId: 'w1', seed: 3 });
  st.world.coin.path = [0.05]; st.world.coin.step = 0; st.holdings.MOON.qty = 1000; st.holdings.MOON.basis = 1000;
  st.pending = null; st.phase = 'land'; st.pos = 4; // M tile
  st.decks.market = [E.getWorld('w1').market.findIndex((c) => c.crypto === 'news')];
  let e = E.landing(st); assert.equal(e.type, 'trade'); assert.equal(st.world.coin.alive, false); assert.equal(e.options.find((o) => o.id === 'buy').enabled, false);
  E.choose(st, e, 'done');
  st.phase = 'land'; st.decks.market = [E.getWorld('w1').market.findIndex((c) => c.crypto === 'launch')];
  e = E.landing(st); assert.equal(e.data.wiped.qty, 1000); assert.equal(st.holdings.MOON.qty, 0); assert.notEqual(e.data.name, 'MOON · קריפטו'); assert.equal(st.world.coin.alive, true);
});

test('bail-out: the first bankruptcy is restructured once (createGame bailout:true), the second ends the game', () => {
  const st = E.createGame({ worldId: 'w1', charId: 'driver', seed: 4, bailout: true });
  const crash = () => { st.loans = 200000; st.credit = 20000; st.cash = 0; st.assets.push({ id: 99 + st.month, k: 're', n: 'פנטהאוז', cost: 320000, down: 40000, debt: 280000, value: 320000, cf: -900, month: 1, ups: 0 }); };
  crash();
  let r; let guard = 0;
  do { r = E.rollDice(st); let ev = E.landing(st); while (ev) { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined).event; } } while (!r.bailout && guard++ < 20 && !st.over);
  assert.ok(r.bailout, 'bail-out happened'); assert.ok(r.news.some((n) => n.kind === 'bailout'));
  assert.ok(r.bailout.text.length > 10 && Array.isArray(r.bailout.leaks));
  assert.equal(st.over, null); assert.equal(st.credit, 0); assert.ok(E.metrics(st).cashflow >= 0, 'cashflow is non-negative after the restructuring');
  assert.ok(st.flags.bailoutUsed);
  crash(); guard = 0;
  while (!st.over && guard++ < 40) { E.rollDice(st); let ev = E.landing(st); while (ev) { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled); const res = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined); ev = res.event; } }
  assert.equal(st.result.reason, 'bankrupt');
});

test('leaks, tip, decision log and server summary', () => {
  const st = E.createGame({ worldId: 'w1', seed: 8 }); const r = prng(8);
  for (let t = 0; t < 120 && !st.over; t++) turn(st, (ev, n) => randomChoice(ev, r, n));
  assert.ok(st.log.length > 0 && st.log.length <= 80);
  for (const x of st.log) assert.ok(Number.isInteger(x.t) && typeof x.c === 'string' && typeof x.o === 'string' && x.c.length <= 24 && x.o.length <= 24);
  const L = E.leaksOf(st); for (let i = 1; i < L.length; i++) assert.ok(L[i - 1].amount >= L[i].amount);
  const sum = E.summaryForServer(st); assert.ok(JSON.stringify(sum).length < 10000, 'summary must be < 10KB');
  for (const k of ['interestPaid', 'forcedLoans', 'toysSpent', 'toysResisted', 'badAssets', 'badAssetLoss']) assert.ok(Number.isFinite(sum.stats[k]), 'stat ' + k);
  if (st.result) { assert.ok(Array.isArray(st.result.leaks)); assert.ok(!/חובה|משבר/.test(st.result.tip)); }
});

test('goalProgress is ranking-safe: 0..1, equals 1 only when the goal is met', () => {
  for (const w of E.WORLDS) for (let g = 0; g < 40; g++) {
    const st = E.createGame({ worldId: w.id, seed: 900 + g, mode: 'free' }); const r = prng(g);
    for (let t = 0; t < 80 && !st.over; t++) {
      turn(st, (ev, n) => randomChoice(ev, r, n));
      const m = E.metrics(st);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1);
      if (m.goalProgress >= 1) assert.ok(st.over === 'won' || E.checkEnd(st)?.status === 'won' || st.pending, `${w.id}: progress 1 without a win`);
    }
  }
});

test('market buy-out never pays a premium for a money-losing asset', () => {
  const st = E.createGame({ worldId: 'w1', seed: 5 });
  st.assets.push({ id: 77, k: 're', n: 'פנטהאוז', cost: 320000, down: 40000, debt: 280000, value: 320000, cf: -900, month: 1, ups: 0 });
  st.pending = { id: 1, type: 'market', tile: 'M', pos: 4, card: E.getWorld('w1').market.find((c) => c.k === 'sell' && c.type === 're') }; st.phase = 'event';
  const ev = E.currentEvent(st); const off = ev.data.offers.find((o) => o.assetId === 'a77');
  assert.ok(off.offer <= 320000 * 0.85 + 1, 'offer ' + off.offer);
});

/* ------------------------------------------------------------------ content */
const HEB = /[֐-׿]/;
function walkStrings(obj, path, fn) {
  if (typeof obj === 'string') return fn(obj, path);
  if (Array.isArray(obj)) return obj.forEach((x, i) => walkStrings(x, path + '[' + i + ']', fn));
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) walkStrings(v, path + '.' + k, fn);
}
const TEXT_KEYS = new Set(['n', 'd', 'q', 'name', 'desc', 'title', 'text', 'tagline', 'lesson', 'goalLabel', 'after', 'explain', 'none', 'label', 'subLabel', 'short', 'sector', 'oddsText', 'modelLabel', 'divLabel', 'unit', 'cashLabel']);
test('all Hebrew strings are non-empty (world data, mentor lines, achievements)', () => {
  let count = 0;
  for (const w of E.WORLDS) {
    walkStrings(w, w.id, (s, path) => {
      const key = path.split('.').pop().replace(/\[\d+\]$/, '');
      if (TEXT_KEYS.has(key) || path.includes('.mentor.') || path.includes('.answers[')) {
        if (path.includes('.answers[')) { assert.ok(s.trim().length > 0, 'empty answer at ' + path); count++; return; }
        assert.ok(s.trim().length > 0, 'empty string at ' + path);
        if (!/\.(name|unit)$/.test(path) || path.includes('characters')) assert.ok(HEB.test(s) || /^[A-Z]/.test(s), 'not Hebrew at ' + path + ': ' + s);
        count++;
      }
    });
    for (const [k, v] of Object.entries(w.mentor)) if (v !== null) { const arr = Array.isArray(v) ? v : [v]; for (const x of arr) { assert.ok(HEB.test(x), `${w.id}.mentor.${k}`); assert.ok(x.split(/\s+/).length <= 32, `${w.id}.mentor.${k} too long (${x.split(/\s+/).length} words)`); } }
    for (const q of w.mystery.filter((m) => m.kind === 'quiz')) { assert.ok(q.correct >= 0 && q.correct < q.answers.length); assert.ok(q.reward > 0); }
    assert.equal(w.board.length, 24); for (const i of [0, 6, 12, 18]) assert.equal(w.board[i], 'P');
    assert.ok(w.deals.length >= 15 && w.deals.length <= 25, `${w.id} deals ${w.deals.length}`);
    assert.ok(w.doodads.length >= 7 && w.market.length >= 9, `${w.id} doodads/market`);
    for (const d of w.deals) if (!d.tk && !d.crypto) assert.ok(w.models[d.k], `${w.id} deal kind ${d.k} has no model`);
  }
  for (const a of ACHIEVEMENTS) { assert.ok(HEB.test(a.name) && HEB.test(a.desc)); count++; }
  assert.ok(count > 600, 'expected lots of strings, got ' + count);
});

test('engine & worlds use no Math.random / Date / DOM', () => {
  for (const f of ['../js/engine.js', '../js/rng.js', '../js/achievements.js', '../js/worlds/common.js', '../js/worlds/w1.js', '../js/worlds/w2.js', '../js/worlds/w3.js', '../js/worlds/w4.js', '../js/worlds/index.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random|new Date|Date\.|document\.|window\.|THREE/.test(src), f + ' uses a forbidden API');
  }
});

test('achievements: ~25+ defined, unique ids, many earned in random play, meta checks work', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 25);
  assert.ok(achSeen.size >= 12, 'only earned ' + [...achSeen].join(','));
  const meta = checkMetaAchievements({ stars: { w1: 3, w2: 3, w3: 3, w4: 3 }, achievements: [] }).map((a) => a.id);
  assert.deepEqual(meta.sort(), ['explorer', 'legend', 'stars6']);
  assert.equal(checkMetaAchievements({ stars: { w1: 1 }, achievements: [] }).length, 0);
  assert.equal(titleFor(0), 'עכבר'); assert.equal(titleFor(12), 'אגדה');
});

test('dailyConfig is pure & rotates worlds', () => {
  const a = E.dailyConfig('2026-11-19'), b = E.dailyConfig('2026-11-19'), c = E.dailyConfig('2026-11-20');
  assert.equal(a.maxMonths, 24, 'daily is a 24-month sprint');
  assert.deepEqual(a, b); assert.notEqual(a.worldId, c.worldId); assert.notEqual(a.seed, c.seed);
  const worlds = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].map((d) => E.dailyConfig(d).worldId));
  assert.equal(worlds.size, 4);
});

console.log(`\n${passed} passed, ${failed} failed · event types seen: ${JSON.stringify(typesSeen)} · endings ${JSON.stringify(endings)} · achievements seen ${achSeen.size}/${ACHIEVEMENTS.length}`);
process.exit(failed ? 1 : 0);
