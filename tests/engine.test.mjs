#!/usr/bin/env node
// Engine tests — run: node tests/engine.test.mjs [gamesPerWorld=2000]
// Plain asserts, no dependencies.
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { ACHIEVEMENTS, checkMetaAchievements, titleFor } from '../js/achievements.js';
import { readFileSync } from 'node:fs';

const GAMES = +(process.argv[2] || 2000);
await E.loadRealData(); // history mode data is lazy (js/data/real.js)
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
  // the K tile shows YOUR business (decision-dependent text, same draws); T3: a life card may be substituted / a car repair swapped
  // by a pure function of YOUR state (rules 4) — the DRAWN card is what must be identical for everyone
  const p = st.pending || {};
  const drawn = ev.type === 'life' ? (p.drawn || p.sub || p.eventId) : ev.type === 'doodad' && p.card && p.card.swapped ? p.card.swapped : ev.title;
  const sig = `${roll.die}|${ev.type}|${ev.type === 'business' ? '' : drawn}`;
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
const EVENT_TYPES = new Set(['payday', 'deal', 'trade', 'doodad', 'market', 'crisis', 'mystery', 'bank', 'upgrade', 'fx', 'shipping', 'pitch', 'giving', 'life', 'edu', 'tax', 'business']);
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
  if (st.mentor !== 'guide') assert.equal(nPrim, 0, where + ' T2: no highlighted option at hint/pro');
  else if (ev.type === 'mystery' && ev.data.kind === 'quiz') assert.equal(nPrim, 0, where + ' quiz must not highlight an answer');
  else if (ev.type === 'life' && ev.data.chain) assert.ok(nPrim <= 1, where + ' T3 chain card: at most the guide pick (car / transport, financial steps)');
  else if (ev.type === 'life' && ev.data.values) assert.equal(nPrim, 1, where + ' director (T2 A1): a lifestyle trade-off highlights the cheapest reasonable option at guide');
  else if (ev.type === 'life' && ev.data.personal) assert.equal(nPrim, 0, where + ' a personal life choice has no highlighted answer');
  else assert.equal(nPrim, 1, where + ' exactly one primary');
  for (const o of ev.options) assert.equal(typeof o.primary, 'boolean', where + ' primary must be boolean');
  if (ev.auto) { assert.equal(ev.options.length, 1, where + ' auto card must have one option'); assert.ok(ev.toastText && ev.toastText.length > 0, where + ' auto card needs toastText'); }
  for (const o of ev.options.filter((x) => x.kind === 'buy' && ev.type === 'deal')) { assert.ok(Number.isFinite(o.net) && typeof o.netLabel === 'string', where + ' buy option needs net/netLabel'); }
  if (ev.type === 'deal' && !ev.auto && st.mentor === 'guide') { const pr = ev.options.find((o) => o.primary); if (pr.kind === 'buy') { const all = E.scoreOptions(st, ev); const sc = all.find((x) => x.id === pr.id); assert.ok(sc && sc.U >= Math.max(...all.map((x) => x.U)) - 0.1 - 1e-9, where + ' a primary buy must be the evaluator\'s top option (T2 §5.2, 0.1 tie band)'); } }
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
      const st = E.createGame({ worldId: w.id, charId: ch.id, seed: 50000 + g * 13, mode: g % 2 ? 'challenge' : 'free', tutorial: g % 7 === 0, mentor: ['guide', 'hint', 'pro'][Math.floor(g / 2) % 3] });
      const r = prng(g + 1);
      const deep = g < 40; // full option-by-option check on the first games, fast path afterwards
      for (let t = 0; t < 140 && !st.over; t++) {
        if (r() < 0.05) E.takeLoan(st);
        if (r() < 0.05 && st.loans) E.repayLoan(st);
        if (!st.over && r() < 0.05 && st.credit) E.payCredit(st);
        if (st.over) break;
        const roll = E.rollDice(st);
        assert.ok(roll.die >= 2 && roll.die <= 12 && roll.dice.length === 2 && roll.dice[0] + roll.dice[1] === roll.die && roll.dice.every((d) => d >= 1 && d <= 6));
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
    const t = w.tiles[ch].type === 'index' ? 'trade' : w.tiles[ch].type; // the index tile opens a trade window on IDX
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
    const corners = r.steps.filter((i) => i % 10 === 0).length;
    assert.equal(r.paydays.length, corners);
    assert.equal(st.month, m0 + corners);
    if (corners === 1) assert.equal(st.cash, c0 + cf0);
  }
});

test('auto bank loan when cash < 0, in small units, at the bank-loan rate', () => {
  const st = E.createGame({ worldId: 'w1', charId: 'driver', seed: 1 }); st.econ = null; // T2: no cycle add-on on the rate
  st.cash = -7200; st.phase = 'roll';
  // force via a doodad-like path: emulate payday handling through takeLoan/ensure by choosing a doodad
  const w = E.getWorld('w1');
  st.pending = { id: 999, type: 'doodad', tile: 'D', pos: 2, card: { ...w.doodads[0], a: 100 } }; st.phase = 'event';
  const res = E.choose(st, { id: 999 }, 'pay');
  assert.equal(st.loans, 8000, 'forced loans are rounded to ₪1,000, not ₪5,000');
  assert.ok(st.cash >= 0 && st.cash < 1000);
  assert.ok(res.effects.some((e) => e.type === 'loan' && e.auto));
  assert.equal(st.life.creditScore, 680 - 25, 'a forced loan costs 25 credit-score points (bank.js CREDIT_DELTAS)');
  assert.equal(E.loanPct(st), 3.06, '3% a month + bank.js creditSpread 0.75%/yr ÷ 12 for a "fair" score');
  assert.equal(E.metrics(st).expenseLines.find((l) => l.id === 'loan').amount, 245); // 8,000 × 3.0625%
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
        r = E.choose(st, r.event, 'sell', { qty: 3 }); assert.equal(st.holdings[tk].qty, 0); assert.ok(Math.abs(st.cash - cash0) <= 1, 'round trip at the same price (±₪1 rounding)'); assert.ok(Number.isInteger(st.cash));
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
  assert.equal(E.checkEnd(st), null, 'the goal must hold for 3 paydays first');
  st.life.goalStreak = 3;
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
  st.pending = null; st.phase = 'land'; st.pos = w.board.indexOf('M'); // M tile
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
      if (key === 'lesson' && path.includes('.mystery[')) return; // a lesson id, not text
      if (TEXT_KEYS.has(key) || path.includes('.mentor.') || path.includes('.answers[')) {
        if (path.includes('.answers[')) { assert.ok(s.trim().length > 0, 'empty answer at ' + path); count++; return; }
        assert.ok(s.trim().length > 0, 'empty string at ' + path);
        if (!/\.(name|unit)$/.test(path) || path.includes('characters')) assert.ok(HEB.test(s) || /^[A-Z]/.test(s), 'not Hebrew at ' + path + ': ' + s);
        count++;
      }
    });
    for (const [k, v] of Object.entries(w.mentor)) if (v !== null) { const arr = Array.isArray(v) ? v : [v]; for (const x of arr) { assert.ok(HEB.test(x), `${w.id}.mentor.${k}`); assert.ok(x.split(/\s+/).length <= 32, `${w.id}.mentor.${k} too long (${x.split(/\s+/).length} words)`); } }
    for (const q of w.mystery.filter((m) => m.kind === 'quiz')) { assert.ok(q.correct >= 0 && q.correct < q.answers.length); assert.equal(q.reward, 'lesson', 'quizzes reward understanding, not money'); assert.ok(!q.lesson || E.LESSONS.some((l) => l.id === q.lesson), 'quiz lesson ' + q.lesson); }
    assert.equal(w.board.length, 40); for (const i of [0, 10, 20, 30]) assert.equal(w.board[i], 'P');
    assert.equal([...w.board].filter((c) => c === 'P').length, 4, 'paydays only on the corners');
    for (const t of ['L', 'E', 'T', 'I', 'K']) assert.ok(w.board.includes(t), `${w.id} board has a ${t} tile`);
    assert.ok(w.deals.length >= 15 && w.deals.length <= 25, `${w.id} deals ${w.deals.length}`);
    assert.ok(w.doodads.length >= 7 && w.market.length >= 9, `${w.id} doodads/market`);
    for (const d of w.deals) if (!d.tk && !d.crypto) assert.ok(w.models[d.k], `${w.id} deal kind ${d.k} has no model`);
  }
  for (const a of ACHIEVEMENTS) { assert.ok(HEB.test(a.name) && HEB.test(a.desc)); count++; }
  assert.ok(count > 600, 'expected lots of strings, got ' + count);
});

test('engine & worlds use no Math.random / Date / DOM', () => {
  for (const f of ['../js/engine.js', '../js/rng.js', '../js/achievements.js', '../js/life.js', '../js/history.js', '../js/worlds/common.js', '../js/worlds/w1.js', '../js/worlds/w2.js', '../js/worlds/w3.js', '../js/worlds/w4.js', '../js/worlds/h.js', '../js/worlds/index.js']) {
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

/* ------------------------------------------------------------------ v3: money precision (known expected results) */
import * as LIFE from '../js/life.js';
import * as REAL from '../js/data/real.js';
import * as TAXJS from '../js/data/tax.js';
import * as BIZ from '../js/finance/business.js';
const W1 = (o = {}) => E.createGame({ worldId: 'w1', charId: 'teacher', seed: 21, ...o });
function playOut(st, r, maxTurns = 200) { for (let t = 0; t < maxTurns && !st.over; t++) turn(st, (ev, n) => randomChoice(ev, r, n)); return st; }

test('payslip: ₪15,000 gross → ₪11,312 net (2026 TAX_IL), lines add up, gross↔net inverse', () => {
  const s = LIFE.slip(15000);
  assert.equal(s.net, 11312);
  assert.equal(s.gross - s.incomeTax - s.bl - s.pensionEmployee, s.net, 'lines add up exactly');
  assert.equal(s.bituahLeumi + s.health, s.bl);
  assert.equal(s.pensionEmployee, 900); assert.equal(s.employerPension, 975); assert.equal(s.severanceDeposit, 900);
  assert.equal(LIFE.slip(5000).incomeTax, 0, 'credit points wipe out the tax on a low salary');
  for (const net of [5000, 9000, 22000, 55000]) { const g = LIFE.grossFromNet(net); assert.ok(LIFE.slip(g).net >= net && LIFE.slip(g - 10).net < net, 'grossFromNet ' + net); }
  assert.ok(LIFE.marginalRate(15000) === 0.2 && LIFE.marginalRate(70000) === 0.5);
  // the engine uses the same table: take-home of every character equals its v2 salary (±₪10 rounding of the gross)
  assert.deepEqual(TAXJS.TAX_IL, REAL.TAX_IL, 'js/data/tax.js is the same table as js/data/real.js');
  for (const w of E.WORLDS) for (const ch of w.characters) if (ch.salary) { const st = E.createGame({ worldId: w.id, charId: ch.id, seed: 1 }); const m = E.metrics(st); assert.ok(Math.abs(m.salary - ch.salary) <= 10, `${w.id}/${ch.id} net ${m.salary} vs ${ch.salary}`); assert.ok(m.payslip.gross > m.salary); }
});

test('compound interest, bank-loan cost and inflation have exact known values', () => {
  assert.equal(LIFE.compound(10000, 0.005, 12), 10617); // 10,000 × 1.005^12 = 10,616.78
  assert.equal(LIFE.compound(100000, 0.07 / 12, 120), 200966); // 7%/yr monthly for 10 years
  // the game's bank loan is interest-only: ₪5,000 at 3% a month costs ₪150 every month until repaid
  const st = W1(); st.econ = null; E.takeLoan(st); assert.equal(E.metrics(st).expenseLines.find((l) => l.id === 'loan').amount, 150); // T2: no cycle add-on
  // Israeli CPI: ₪10,000 of June 2021 in June 2023 prices (real data, exact month index)
  const cpi = REAL.SERIES.cpiIL; const i0 = (2021 - +cpi.start.slice(0, 4)) * 12 + (6 - +cpi.start.slice(5, 7)); const i1 = i0 + 24;
  assert.equal(E.inflate(10000, '2021-06', '2023-06'), Math.round(10000 * cpi.values[i1] / cpi.values[i0]));
  assert.ok(E.inflate(10000, '2021-06', '2023-06') > 10700, 'prices rose ~8% in 2021–2023');
});

test('money stays in whole shekels (cash, debts, basis, pension, taxes) through random games', () => {
  for (const w of E.WORLDS) for (let g = 0; g < 25; g++) {
    const st = E.createGame({ worldId: w.id, seed: 7000 + g }); const r = prng(g + 3);
    for (let t = 0; t < 120 && !st.over; t++) {
      if (r() < 0.05) E.takeLoan(st); if (!st.over && r() < 0.05 && st.loans) E.repayLoan(st);
      if (!st.over && r() < 0.05) E.invest(st, r() < 0.6 ? 'buy' : 'sell', 1 + Math.floor(r() * 20));
      if (st.over) break;
      turn(st, (ev, n) => randomChoice(ev, r, n));
      for (const k of ['cash', 'loans', 'credit']) assert.ok(Number.isInteger(st[k]), `${w.id}/g${g} ${k}=${st[k]}`);
      for (const [tk, h] of Object.entries(st.holdings)) assert.ok(Number.isInteger(Math.round(h.basis * 1000) / 1000) || Math.abs(h.basis - Math.round(h.basis)) < 1e-6, `${w.id} basis ${tk} ${h.basis}`);
      assert.ok(Number.isInteger(st.life.pension), 'pension ' + st.life.pension);
      for (const v of Object.values(st.taxes)) assert.ok(Number.isInteger(v), 'taxes ' + JSON.stringify(st.taxes));
      for (const a of st.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), 'asset money');
    }
  }
});

/* ------------------------------------------------------------------ v3: replay (server = source of truth) */
test('replay(config, actions) rebuilds the exact final state — every world, ranked + free + history', () => {
  const cfgs = [];
  for (const w of E.WORLDS) { cfgs.push({ worldId: w.id, seed: 4242, mode: 'daily', maxMonths: 24 }); cfgs.push({ worldId: w.id, charId: w.characters[1].id, seed: 99, mode: 'free', tutorial: true, bailout: true }); }
  cfgs.push({ mode: 'history', scenarioId: 'gfc', seed: 5 });
  for (const cfg of cfgs) {
    const st = E.createGame(cfg); const r = prng(cfg.seed);
    for (let t = 0; t < 90 && !st.over; t++) {
      if (r() < 0.06) E.setPlan(st, ['work', 'overtime', 'rest', 'side', 'study'][Math.floor(r() * 5)]);
      if (!st.over && r() < 0.04) E.takeLoan(st);
      if (!st.over && r() < 0.04 && st.loans) E.repayLoan(st);
      if (!st.over && r() < 0.03) E.setAutoInvest(st, 500);
      if (!st.over && r() < 0.04) E.invest(st, 'buy', 3);
      if (st.over) break;
      turn(st, (ev, n) => randomChoice(ev, r, n));
    }
    const again = E.replay(E.replayConfig(st), st.actions);
    assert.equal(E.serialize(again), E.serialize(st), 'replay diverged for ' + JSON.stringify(cfg));
    const sum = E.summaryForServer(st); assert.deepEqual(sum.config, E.replayConfig(st)); assert.equal(sum.actions.length, st.actions.length);
    assert.ok(JSON.stringify(sum).length < 12000, 'summary size ' + JSON.stringify(sum).length);
  }
  // a tampered log is rejected
  const st = E.createGame({ worldId: 'w1', seed: 3 }); E.rollDice(st); E.landing(st);
  assert.throws(() => E.replay(E.replayConfig(st), [['r'], ['r']]), /replay_mismatch/);
});

/* ------------------------------------------------------------------ v3: saves */
test('v2 saves (st.v = 1, 24-tile board) migrate to v3 with defaults; junk is rejected as save_incompatible', () => {
  for (const w of E.WORLDS) {
    const st = playOut(E.createGame({ worldId: w.id, seed: 17 }), prng(1), 6);
    // make it look like a v2 save
    const old = JSON.parse(E.serialize(st));
    old.v = 1; old.pos = 13; old.phase = 'roll'; old.pending = null; delete old.life; delete old.lessons; delete old.taxes; delete old.actions;
    delete old.rng.life; delete old.rng.index; delete old.holdings.IDX; delete old.prices.IDX;
    const mig = E.deserialize(JSON.stringify(old));
    assert.equal(mig.v, 4); assert.ok(mig.pos >= 0 && mig.pos < 40 && w.board[mig.pos] !== 'P');
    assert.ok(mig.life && mig.life.energy > 0 && Array.isArray(mig.lessons) && mig.holdings.IDX && mig.prices.IDX === 100);
    assert.ok(Math.abs(E.metrics(mig).salary - E.metrics(st).salary) <= 20, 'take-home preserved');
    playOut(mig, prng(2), 15); // and it plays on
  }
  assert.throws(() => E.deserialize({ v: 2, worldId: 'w1' }), /save_incompatible/);
  assert.throws(() => E.deserialize({ v: 999 }), /save_incompatible/);
  assert.throws(() => E.deserialize('null'), /save_incompatible/);
});

/* ------------------------------------------------------------------ v3: dice & board */
test('two dice: both drawn every roll (also in the tutorial), doubles give a small deterministic bonus', () => {
  let doubles = 0;
  for (let seed = 1; seed < 300; seed++) {
    const st = E.createGame({ worldId: 'w1', seed }); const e0 = st.life.energy;
    const r = E.rollDice(st);
    assert.ok(r.dice[0] >= 1 && r.dice[0] <= 6 && r.dice[1] >= 1 && r.dice[1] <= 6 && r.die === r.dice[0] + r.dice[1]);
    assert.deepEqual(st.lastRoll.dice, r.dice);
    if (r.dice[0] === r.dice[1]) { doubles++; assert.ok(r.double && r.news.some((n) => n.kind === 'double')); if (r.double.kind === 'energy') assert.ok(st.life.energy >= Math.min(100, e0)); else assert.equal(st.life.peek, true); } else assert.equal(r.double, null);
    const t = E.createGame({ worldId: 'w1', seed, tutorial: true }); E.rollDice(t); assert.equal(t.rng.dice, st.rng.dice, 'tutorial consumes both dice');
  }
  assert.ok(doubles > 25 && doubles < 80, 'about 1 in 6 rolls is a double: ' + doubles);
  for (const w of E.WORLDS) { const b = E.boardInfo(w.id); assert.equal(b.length, 40); assert.deepEqual(b.corners, [0, 10, 20, 30]); assert.ok(b.every((t) => t.type && t.color && t.icon && t.name)); }
  assert.equal(E.rollCost(E.createGame({ worldId: 'w1', mode: 'daily', seed: 1 })), 0); assert.equal(E.rollCost(W1()), 1);
});

/* ------------------------------------------------------------------ v3: negotiation is fair in ranked play */
test('negotiation: the seller\'s answer is sealed with the card; offering never shifts the RNG', () => {
  let tried = 0, acc = 0;
  for (let seed = 1; seed < 400 && tried < 60; seed++) {
    const a = E.createGame({ worldId: 'w2', seed, mode: 'challenge' }); const b = E.createGame({ worldId: 'w2', seed, mode: 'challenge' });
    for (let t = 0; t < 12; t++) {
      E.rollDice(a); E.rollDice(b); let ea = E.landing(a); let eb = E.landing(b);
      const off = ea.type === 'deal' && ea.options.find((o) => o.id === 'offer:10');
      if (off) {
        tried++;
        const res = E.choose(a, ea, 'offer:10');
        assert.equal(res.negotiation.accepted, a.pending ? true : false);
        if (res.negotiation.accepted) { acc++; assert.ok(res.event && !res.event.options.some((o) => o.kind === 'offer') && res.event.data.negotiated.pct === 10); assert.ok(res.event.data.cost < eb.data.cost); ea = res.event; } else ea = null;
        assert.equal(res.negotiation.accepted, b.pending.negR < off.chance, 'same answer for everyone with this card');
      }
      for (const [st, ev0] of [[a, ea], [b, eb]]) { let ev = ev0; while (ev) { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled && x.kind !== 'offer'); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined).event; } }
      for (const k of ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index']) assert.equal(a.rng[k], b.rng[k], 'stream ' + k + ' shifted');
    }
  }
  assert.ok(tried >= 20 && acc > 0 && acc < tried, `tried ${tried} accepted ${acc}`);
});

/* ------------------------------------------------------------------ v3: plans, burnout, study, raise */
test('plans: overtime pays less than +25% net (marginal tax), burnout is deterministic, study gives a permanent raise', () => {
  const st = W1({ charId: 'doctor' }); const m = E.metrics(st);
  const ot = m.life.plans.find((p) => p.id === 'overtime'); assert.ok(ot);
  E.setPlan(st, 'overtime'); const m2 = E.metrics(st);
  assert.ok(m2.salary > m.salary && m2.salary - m.salary < (m2.payslip.gross - m.payslip.gross) * 0.75, 'extra hours are taxed at the top bracket');
  // constant overtime → burnout, identical for the same seed
  const burn = (seed) => { const s = E.createGame({ worldId: 'w1', seed, mode: 'challenge' }); E.setPlan(s, 'overtime'); let at = null; for (let t = 0; t < 80 && !s.over && at == null; t++) { if (s.life.plan !== 'overtime' && s.life.burnouts === 0) E.setPlan(s, 'overtime'); const r = turn(s, (ev) => [(ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id, { qty: 1 }]); if (s.life.burnouts) at = s.turn; } return at; };
  const b1 = burn(5); assert.ok(b1 != null, 'constant overtime ends in a burnout'); assert.equal(burn(5), b1);
  // study: 8 months on the study plan ⇒ +20% gross, for good
  const s = W1(); const g0 = E.metrics(s).payslip.gross; E.setPlan(s, 'study');
  for (let t = 0; t < 60 && !s.life.study.done && !s.over; t++) turn(s, (ev) => [(ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id, { qty: 1 }]);
  assert.ok(s.life.study.done && s.lessons.includes('human_capital'));
  assert.ok(s.life.gross >= Math.round(g0 * 1.2) - 10, 'permanent +20% gross');
  assert.equal(E.setPlan(s, 'study').ok, false, 'cannot study twice');
});

test('credit score: forced loans hurt, repaying helps, a poor score blocks voluntary loans', () => {
  const st = W1(); st.econ = null; // T2: the cycle's loan add-on is tested in t2.test.mjs
  st.life.creditScore = 800; const lowPct = E.loanPct(st);
  st.life.creditScore = 500; assert.ok(E.loanPct(st) > lowPct); assert.equal(E.loanCap(st), 0);
  const r = E.takeLoan(st); assert.equal(r.ok, false); assert.ok(/דירוג האשראי/.test(r.error));
  const rw = E.metrics(st).realWorldRates; assert.equal(rw.bankLoan.realPerYear, null, 'no real-world loan offer for a poor score');
  st.life.creditScore = 700; const rw2 = E.metrics(st).realWorldRates; assert.ok(rw2.bankLoan.gamePerYear === 36 && rw2.bankLoan.realPerYear > 5 && rw2.bankLoan.realPerYear < 12, JSON.stringify(rw2.bankLoan));
  st.life.creditScore = 680; E.takeLoan(st); const s0 = st.life.creditScore; E.repayLoan(st); assert.equal(st.life.creditScore, s0 + 6);
  assert.equal(E.metrics(st).life.creditBand, 'טוב');
});

test('★★★ needs money AND happiness; checkEnd carries "סיפור החיים שלך"', () => {
  const mk = (h) => { const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 5, mode: 'challenge' }); st.assets.push({ id: 900, k: 'biz', n: 'בדיקה', cost: 1, down: 1, debt: 0, value: 1, cf: 99999, month: 1, ups: 0 }); st.life.happiness = h; st.life.goalStreak = 3; return E.checkEnd(st); };
  const mkF = (h) => { const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 5, mode: 'challenge' }); st.assets.push({ id: 900, k: 'biz', n: 'בדיקה', cost: 1, down: 1, debt: 0, value: 1, cf: 99999, month: 1, ups: 0 }); st.life.happiness = h; st.life.goalStreak = 3; st.savings = 50000; return E.checkEnd(st); };
  const sad = mkF(40), happy = mkF(75), noFund = mk(75);
  assert.equal(noFund.stars, 2); assert.equal(noFund.starsBlockedByFund, true, '★★★ also needs an emergency fund of 3 months');
  assert.equal(happy.stars, 3); assert.equal(sad.stars, 2); assert.equal(sad.starsBlockedByHappiness, true); assert.equal(happy.starsBlockedByHappiness, false);
  const L = happy.lifeSummary;
  for (const k of ['age', 'ageText', 'headline', 'freeTimeMonths', 'family', 'happiness', 'avgHappiness', 'topDecisions', 'sentence', 'pension', 'realNetWorth', 'taxesPaid']) assert.ok(L[k] !== undefined, 'lifeSummary.' + k);
  assert.ok(/בגיל \d+ יצאת מהמירוץ/.test(L.headline) && /[֐-׿]/.test(L.sentence));
  assert.ok(E.starThresholds('w1', 'teacher').happy === 60);
});

/* ------------------------------------------------------------------ v3: lessons + life events */
test('lessons: 40+ unique Hebrew lessons; unlocked by experience and reported in results', () => {
  assert.ok(E.LESSONS.length >= 70, 'life + business lessons'); const ids = E.LESSONS.map((l) => l.id); assert.equal(new Set(ids).size, ids.length);
  for (const l of E.LESSONS) assert.ok(HEB.test(l.title) && HEB.test(l.text) && l.cat, l.id);
  const st = W1(); let got = [];
  for (let t = 0; t < 60 && !st.over; t++) { const r = E.rollDice(st); got = got.concat(r.lessons || []); let ev = E.landing(st); while (ev) { const o = ev.options.find((x) => x.primary) || ev.options.find((x) => x.enabled); const res = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined); got = got.concat(res.lessons || []); ev = res.event; } }
  assert.ok(got.length >= 6 && got.every((l) => l.id && l.title && l.text));
  assert.deepEqual([...new Set(got.map((l) => l.id))].sort(), [...st.lessons].sort());
  assert.ok(st.lessons.includes('gross_net'));
});

test('life events: every option of every dilemma is choosable and shows money + happiness/energy effects', () => {
  for (const w of E.WORLDS) for (const E0 of LIFE.LIFE_EVENTS) for (const o0 of E0.options) {
    const st = E.createGame({ worldId: w.id, seed: 3 });
    st.pending = { id: 1, type: 'life', tile: 'L', pos: w.board.indexOf('L'), eventId: E0.id, r: 0.5 }; st.phase = 'event';
    const ev = E.currentEvent(st); assert.equal(ev.options.filter((o) => o.primary).length, st.mentor !== 'guide' || (E0.personal && E0.options.length > 1) ? 0 : 1); // values cards: the director's guide pick (A1)
    const o = ev.options.find((x) => x.id === o0.id);
    for (const k of ['cash', 'monthly', 'months', 'happiness', 'energy']) assert.ok(Number.isFinite(o.effects[k]), `${E0.id}/${o.id}.${k}`);
    const res = E.choose(st, ev, o.id); assert.ok(res.ok && res.done, `${E0.id}/${o.id}`);
    assert.ok(Number.isInteger(st.cash));
  }
  // friend loan / guarantee resolves 6 months later (pre-drawn)
  const st = W1(); st.pending = { id: 1, type: 'life', tile: 'L', pos: 4, eventId: 'friend', r: 0.9 }; st.phase = 'event';
  E.choose(st, E.currentEvent(st), 'guarantee'); assert.equal(st.life.friend.ok, true);
});

/* ------------------------------------------------------------------ v3: history mode */
function stubReal() {
  const n = 40; const mk = (f) => Array.from({ length: n }, (_, i) => +f(i).toFixed(2));
  return { SERIES: { sp500: { start: '2001-01', values: mk((i) => 100 * (i < 12 ? 1 - i * 0.03 : 0.67 + (i - 12) * 0.02)) }, ta125: { start: '2001-01', values: mk(() => 100) }, boiRate: { start: '2001-01', values: mk((i) => 5 - i * 0.05) }, cpiIL: { start: '2001-01', values: mk((i) => 100 + i * 0.25) }, homeIL: { start: '2001-01', values: mk((i) => 100 + i) }, usdIls: { start: '2001-01', values: mk(() => 4.2) } },
    SCENARIOS: [{ id: 'test', name: 'מבחן', start: '2001-01', months: 24, blurb: 'תרחיש בדיקה', lesson: 'שיעור', headlines: [{ ym: '2001-06', text: 'כותרת בדיקה' }] }], TAX_IL: REAL.TAX_IL };
}
test('history mode (stub data): deterministic, real-data driven, ends against the buy-and-hold benchmark', () => {
  E.registerRealData(stubReal());
  try {
    assert.deepEqual(E.scenarioList().map((s) => s.id), ['test']);
    const run = (buy) => { const st = E.createGame({ mode: 'history', scenarioId: 'test', seed: 9, mentor: 'guide' }); const r = prng(4); let heads = 0;
      for (let t = 0; t < 200 && !st.over; t++) { const roll = E.rollDice(st); heads += roll.news.filter((x) => x.kind === 'headline').length; let ev = E.landing(st); while (ev) { let id = (ev.options.find((o) => o.primary) || ev.options.find((o) => o.enabled)).id; let p; if (buy && ev.type === 'trade' && ev.data.maxBuy > 0 && !ev.data.lastResult) { id = 'buy'; p = { qty: ev.data.maxBuy }; } const res = E.choose(st, ev, id, p); ev = res.event; } }
      return { st, heads }; };
    const a = run(true), b = run(true);
    assert.equal(E.serialize(a.st), E.serialize(b.st));
    assert.equal(a.st.worldId, 'h'); assert.equal(a.st.month, 25); assert.ok(a.st.over);
    assert.equal(a.st.history.ym, '2003-01'); assert.equal(a.heads, 1);
    const res = a.st.result; assert.ok(res.benchmark && res.benchmark.whatIf.length >= 3 && res.benchmark.netWorth > 0);
    assert.equal(a.st.prices.IDX, Math.round(100 * (0.67 + 12 * 0.02) * 100) / 100 || a.st.prices.IDX);
    assert.equal(a.st.world.rate, +(5 - 24 * 0.05).toFixed(2));
    const m = E.metrics(a.st); assert.equal(m.worldIndicators.ym, '2003-01'); assert.ok(m.goalType === 'benchmark');
    assert.deepEqual(E.replay(E.replayConfig(a.st), a.st.actions).result, a.st.result);
  } finally { E.registerRealData(REAL); }
  assert.ok(E.scenarioList().length >= 5, 'real scenarios are back');
});

test('history mode (real data): every scenario plays to the end; panic selling loses to holding', () => {
  for (const sc of E.scenarioList()) {
    const res = {};
    for (const strat of ['hold', 'panic']) {
      const st = E.createGame({ mode: 'history', scenarioId: sc.id, seed: 7, mentor: 'guide' });
      for (let t = 0; t < 400 && !st.over; t++) { E.rollDice(st); let ev = E.landing(st); while (ev) { let id = (ev.options.find((o) => o.primary) || ev.options.find((o) => o.enabled)).id; let p; if (ev.type === 'deal') id = 'pass'; if (ev.type === 'business') id = ev.options.find((o) => ['pass', 'ok'].includes(o.id)).id;
        if (ev.type === 'trade' && !ev.data.lastResult) { if (strat === 'hold' && ev.data.maxBuy > 0) { id = 'buy'; p = { qty: Math.max(1, Math.floor(ev.data.maxBuy * 0.8)) }; } if (strat === 'panic' && st.prices.IDX < 80 && ev.data.maxSell > 0) { id = 'sell'; p = { qty: ev.data.maxSell }; } if (strat === 'panic' && st.prices.IDX >= 95 && ev.data.maxBuy > 0) { id = 'buy'; p = { qty: Math.max(1, Math.floor(ev.data.maxBuy * 0.8)) }; } }
        ev = E.choose(st, ev, id, p).event; } }
      assert.ok(st.over && st.month === sc.months + 1, sc.id + ' ended at ' + st.month);
      res[strat] = E.metrics(st).netWorth;
    }
    assert.ok(res.hold >= res.panic, `${sc.id}: hold ${res.hold} < panic ${res.panic}`);
  }
});

/* ------------------------------------------------------------------ v3.1: one economic engine (finance modules) */
test('rent tax is 10% of GROSS rent above the ₪5,654 exemption (invest.js rule); deal cards show gross vs net yield', () => {
  const st = W1();
  const add = (rent) => st.assets.push({ id: st.nextId++, k: 're', n: 'דירה', cost: 500000, down: 100000, debt: 400000, value: 500000, cf: 1000, rent, month: 1, ups: 0 });
  add(3000); assert.equal(E.metrics(st).incomeLines.find((l) => l.id === 'rentTax'), undefined, 'exempt below the ceiling');
  add(3000); assert.equal(E.metrics(st).incomeLines.find((l) => l.id === 'rentTax').amount, -600, '10% of ₪6,000 gross');
  for (let t = 0; t < 400; t++) { const s2 = E.createGame({ worldId: 'w1', seed: t }); E.rollDice(s2); const ev = E.landing(s2); if (ev.type === 'deal' && ev.data.kind === 're' && ev.data.yield) { assert.ok(ev.data.yield.grossYield > ev.data.yield.netYield); return; } }
  assert.fail('no real-estate deal');
});

test('emergency fund: savings earn bank.js interest, pay a crisis before any forced loan, and show in months of expenses', () => {
  const st = W1(); st.cash = 30000;
  assert.ok(E.moveSavings(st, 20000).ok); assert.equal(st.savings, 20000); assert.equal(st.cash, 10000);
  const m = E.metrics(st); assert.ok(m.emergency.months > 2 && /קרן חירום/.test(m.emergency.text)); assert.equal(m.netWorth, E.metrics(st).netWorth);
  // a payday adds interest (2%/yr − 15% tax)
  const s0 = st.savings; st.cash = 100000; let guard = 0; while (st.stats.paydays === 0 && guard++ < 10) turn(st, (ev) => [(ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id, { qty: 1 }]);
  assert.ok(st.savings > s0 && st.savings - s0 < 40, 'interest ' + (st.savings - s0));
  // cash runs out → the fund pays, no loan, no credit hit
  const st2 = W1(); st2.savings = 50000; st2.cash = -7200; st2.pending = { id: 9, type: 'doodad', tile: 'D', pos: 2, card: { ...E.getWorld('w1').doodads[0], a: 100 } }; st2.phase = 'event';
  E.choose(st2, { id: 9 }, 'pay'); assert.equal(st2.loans, 0); assert.ok(st2.savings < 50000 && st2.cash >= 0); assert.equal(st2.life.creditScore, 680);
  assert.equal(E.moveSavings(st2, 10 ** 9).ok, false);
});

test('freedom must hold: the goal has to be met on 2 consecutive paydays', () => {
  const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 31, mode: 'challenge' });
  st.assets.push({ id: 901, k: 'biz', n: 'מכונה', cost: 1, down: 1, debt: 0, value: 1, cf: 50000, month: 1, ups: 0 });
  let paydays = 0, end = null, holdNews = 0;
  for (let t = 0; t < 40 && !end; t++) { const r = E.rollDice(st); paydays += r.paydays.length; holdNews += r.news.filter((n) => n.kind === 'goalHold').length; let ev = E.landing(st); while (ev) { const res = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled && o.kind !== 'offer')).id, { qty: 1 }); if (res.end) end = res.end; ev = res.event; } }
  assert.ok(end && end.status === 'won' && paydays >= 2 && holdNews >= 1, `won after ${paydays} paydays`);
  assert.equal(E.metrics(st).goalHold.need, 2);
});

test('managed business (business.js): K tile offer → open → monthly P&L, energy, owner-run is active income, a manager makes it passive', () => {
  let done = false;
  for (let seed = 1; seed < 600 && !done; seed++) {
    const st = E.createGame({ worldId: 'w2', charId: 'lawyer', seed, mentor: 'guide' }); st.cash = 600000;
    for (let t = 0; t < 30 && !done; t++) {
      E.rollDice(st); let ev = E.landing(st);
      if (ev.type === 'business' && ev.data.mode === 'offer') {
        const r = E.choose(st, ev, 'start'); assert.ok(r.done); const a = st.assets.find((x) => x.biz); assert.ok(a && st.bizRng['a' + a.id]);
        const m0 = E.metrics(st); assert.ok(m0.businesses.length === 1);
        const e0 = st.life.energy; const pd0 = st.stats.paydays; let k = 0; while (st.stats.paydays < pd0 + 3 && k++ < 20) turn(st, (e) => [(e.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || e.options.find((o) => o.enabled && o.kind !== 'offer')).id, { qty: 1 }]);
        assert.ok(st.taxes.business >= 0 && a.biz.month >= 1, 'simulated');
        assert.equal(E.metrics(st).incomeLines.some((l) => l.active), !a.biz.manager);
        // decisions on the K tile
        st.pending = { id: 7777, type: 'business', tile: 'K', pos: 0, mode: 'manage', assetId: a.id }; st.phase = 'event';
        let ev2 = E.currentEvent(st); assert.equal(ev2.options.filter((o) => o.primary).length, 1);
        const mgr = ev2.options.find((o) => o.id === 'biz:manager'); assert.ok(mgr && mgr.enabled);
        const r2 = E.choose(st, ev2, 'biz:manager'); assert.ok(r2.ok && !r2.done && a.biz.manager);
        assert.ok(!E.metrics(st).incomeLines.some((l) => l.active), 'with a manager it counts as passive');
        const sell = r2.event.options.find((o) => o.id === 'biz:sell'); const c0 = st.cash;
        const r3 = E.choose(st, r2.event, 'biz:sell'); assert.ok(r3.done && !st.assets.includes(a) && st.cash === c0 + sell.sale.net);
        done = true;
      }
      while (ev && st.pending) { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled && x.kind !== 'offer'); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined).event; }
    }
  }
  assert.ok(done, 'no business offer found');
});

test('the engine uses the finance modules (no parallel formulas) and only deterministic math', () => {
  const src = readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(/BK\.checkingMonth/.test(src) && /IV\.capitalGainsTax/.test(src) && /IV\.simulateReturns/.test(src) && /BIZ\.simulate/.test(src) && /BK\.creditSpread/.test(src));
  for (const f of ['../js/engine.js', '../js/life.js', '../js/history.js']) { const s = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); assert.ok(!/Math\.(pow|exp|log|sin|cos)\b|\*\*/.test(s), f + ' uses non-deterministic math'); }
  const lifeSrc = readFileSync(new URL('../js/life.js', import.meta.url), 'utf8'); assert.ok(!/setTaxTable/.test(lifeSrc), 'single tax source, no mutation');
});

/* ------------------------------------------------------------------ v3.2: education review */
test('decision quality (§8): primary-follower scores high, risky play scores lower; deterministic; luck is separate', () => {
  const runPol = (pol, seed, w) => { const st = E.createGame({ worldId: w, seed, mode: 'free', mentor: pol === 'primary' ? 'guide' : 'hint' }); const r = prng(seed); // T2: the highlight exists only at guide
    for (let t = 0; t < 70 && !st.over; t++) { E.rollDice(st); let ev = E.landing(st); let n = 0;
      while (ev) { let o; if (pol === 'primary') o = ev.options.find((x) => x.primary) || ev.options.find((x) => x.enabled && ['done', 'ok', 'pass', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled);
        else if (pol === 'reckless') o = n ? ev.options.find((x) => x.enabled && ['done', 'ok', 'pass'].includes(x.id)) || ev.options.find((x) => x.enabled) : (ev.options.find((x) => x.enabled && x.id === 'credit') || ev.options.find((x) => x.enabled && x.kind === 'buy') || ev.options.find((x) => x.enabled && x.id === 'pay') || ev.options.find((x) => x.enabled));
        else { const en = ev.options.filter((x) => x.enabled); o = n >= 2 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; }
        const res = E.choose(st, ev, o.id, o.needsQty ? { qty: Math.max(1, Math.floor(o.max / 2)) } : undefined); ev = res.event; n++; } }
    return st; };
  const avg = (pol) => { let s = 0, k = 0; for (const w of ['w1', 'w2', 'w3', 'w4']) for (let i = 0; i < 12; i++) { const st = runPol(pol, 300 + i, w); if (st.dq.n) { s += st.dq.sum / st.dq.n; k++; } } return s / k; };
  const P = avg('primary'), R = avg('random'), K = avg('reckless');
  assert.ok(P >= 70, 'primary ' + P); assert.ok(R < P - 5 && K < P - 10, `random ${R} reckless ${K} primary ${P}`);
  const a = runPol('random', 9, 'w1'), b = runPol('random', 9, 'w1'); assert.deepEqual(a.dq, b.dq);
  const st = runPol('primary', 5, 'w1'); st.life.goalStreak = 3; const L = E.checkEnd(st) || { learning: null };
  const learn = (st.result || E.checkEnd(st) || {}).learning;
  if (learn) { assert.ok(learn.decisionQuality >= 0 && learn.decisionQuality <= 100 && typeof learn.luck.total === 'number' && learn.principles && learn.sentence); }
});

test('installments: 3 interest-free payments (bank.js) vs revolving credit; real capital-gains tax; side-income reporting', () => {
  const st = W1(); st.cash = 20000; const w = E.getWorld('w1'); const toy = w.doodads.find((d) => d.inst && !d.need);
  st.pending = { id: 41, type: 'doodad', tile: 'D', pos: 2, card: { ...toy } }; st.phase = 'event';
  const ev = E.currentEvent(st); const i3 = ev.options.find((o) => o.id === 'inst3');
  assert.equal(i3.amounts.reduce((a, b) => a + b, 0), toy.a);
  assert.ok(!ev.options.find((o) => o.id === 'credit'), 'T2 §11.1: revolving credit is hidden whenever interest-free installments are offered');
  { const lo = W1(); lo.life.creditScore = 550; lo.pending = { id: 42, type: 'doodad', tile: 'D', pos: 2, card: { ...toy } }; lo.phase = 'event'; const ev2 = E.currentEvent(lo);
    assert.ok(!ev2.options.find((o) => o.id === 'inst3') && /לחודש/.test(ev2.options.find((o) => o.id === 'credit').label), 'a low score: no installments, revolving credit instead'); }
  const c0 = st.cash; E.choose(st, ev, 'inst3'); assert.equal(st.cash, c0 - i3.amounts[0]); assert.equal(st.credit, 0);
  assert.equal(E.metrics(st).expenseLines.filter((l) => /תשלומים/.test(l.label)).length, 1, 'next installment shows as an expense');
  // real capital gains: the inflation part is exempt
  const s2 = W1(); s2.life.cpi = 1.1; s2.holdings.IDX.qty = 100; s2.holdings.IDX.basis = 10000; s2.holdings.IDX.cpi = 1; s2.prices.IDX = 150;
  const r = E.invest(s2, 'sell', 100); assert.equal(r.tax, Math.round((15000 - 10000 - 1000) * 0.25), 'tax on the real gain only');
  // side income: reporting = monthly advances, no year-end penalty
  const s3 = W1(); assert.ok(E.setSideReport(s3, true).ok); assert.equal(s3.life.sideReport, true); assert.deepEqual(s3.actions.at(-1), ['T', 1]);
});

test('Hebrew gender: the mentor addresses her as "את"', () => {
  assert.equal(E.genderize('אתה בטוח? תחשוב רגע ושים לב.', 'f'), 'את בטוח? תחשבי רגע ושימי לב.');
  assert.equal(E.genderize('אתה בטוח?', 'm'), 'אתה בטוח?');
  const st = E.createGame({ worldId: 'w2', charId: 'lawyer', seed: 3 }); assert.equal(st.gender, 'f');
  for (let t = 0; t < 40; t++) { E.rollDice(st); let ev = E.landing(st); while (ev) { assert.ok(!/(^|[^א-ת])אתה(?![א-ת])/.test(ev.mentor || ''), 'masculine mentor for a woman: ' + ev.mentor); const o = ev.options.find((x) => x.enabled && ['ok', 'pass', 'done', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled && x.kind !== 'offer'); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : undefined).event; } if (st.over) break; }
  assert.equal(E.createGame({ worldId: 'w1', charId: 'driver', seed: 1, gender: 'f' }).gender, 'f', 'the player may choose');
});

console.log(`\n${passed} passed, ${failed} failed · event types seen: ${JSON.stringify(typesSeen)} · endings ${JSON.stringify(endings)} · achievements seen ${achSeen.size}/${ACHIEVEMENTS.length}`);
process.exit(failed ? 1 : 0);
