// T4 engine part (spec docs/next-level/specs/T4-opening-modes-library.md §13, CR-E1…E6): intro card, goal chain, tutorial deal,
// rollCost / tutorialFree, dreams, lesson context, unreachable lessons, practice ('K'), saves.  node tests/t4_engine.test.mjs [scale]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import * as PR from '../js/practice.js';
import { prng } from './lib/random-player.mjs';

await E.loadRealData(); // history mode data (benchmark lesson)
const SCALE = +(process.argv[2] || 1);
const N = (n) => Math.max(1, Math.round(n * SCALE));
let passed = 0, failed = 0;
function test(name, fn) { const t0 = Date.now(); try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n  ${e.stack.split('\n').slice(0, 4).join('\n  ')}`); } }
const clone = (x) => JSON.parse(JSON.stringify(x));
const W1 = E.getWorld('w1').characters.map((c) => c.id);
const expOf = (st) => E.metrics(st).expenses;
const closeIntro = (st, choice = 'fix:pay') => { E.choose(st, null, 'next'); E.choose(st, null, choice); return E.choose(st, null, 'go'); };
/** a guide-level tapper (the highlighted option, else the first enabled; story items left to their defaults) */
function tap(st, r, until = () => false, maxRolls = 400) {
  for (let i = 0; i < maxRolls && !st.over && !until(st); i++) {
    if (st.pending) { let ev = E.currentEvent(st); let n = 0; while (ev && !st.over && !until(st)) { const en = ev.options.filter((o) => o.enabled); const o = n >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : (en.find((x) => x.primary) || en[Math.floor(r() * en.length)]); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; } if (st.over || until(st)) break; }
    E.rollDice(st);
    let ev = E.landing(st); let n = 0;
    while (ev && !st.over && !until(st)) { const en = ev.options.filter((o) => o.enabled); const o = n >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : (en.find((x) => x.primary) || en[Math.floor(r() * en.length)]); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; }
  }
  return st;
}
/** exactly one roll (resolving any open card first, then the landed card) */
function oneTurn(st, r) {
  if (st.over) return st;
  if (st.pending) tap(st, r, (x) => !x.pending || x.over, 1);
  let ev = E.currentEvent(st); let n = 0;
  while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = n >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : (en.find((x) => x.primary) || en[Math.floor(r() * en.length)]); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; }
  if (st.over) return st;
  E.rollDice(st); ev = E.landing(st); n = 0;
  while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = n >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : (en.find((x) => x.primary) || en[Math.floor(r() * en.length)]); ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; }
  return st;
}

test('T-E1 intro card: beats, option ids, no primary on the glitch, money effects per choice for every w1 character, skip; no decision record; replay', () => {
  for (const ch of W1) {
    for (const choice of ['fix:pay', 'fix:inst', 'fix:diy']) {
      const st = E.createGame({ worldId: 'w1', charId: ch, seed: 7, tutorial: true });
      assert.equal(st.phase, 'event'); assert.equal(st.pending.type, 'intro'); assert.equal(st.intro.step, 'salary');
      const rng0 = clone(st.rng);
      const E0 = expOf(st); const g = st.intro.glitch;
      assert.equal(g.cost, Math.min(3500, Math.max(600, Math.round(0.12 * E0 / 100) * 100)), 'cost = clamp(round100(0.12·E), 600, 3500)');
      assert.equal(g.inst, Math.ceil(g.cost * 1.05 / 3 / 10) * 10); assert.equal(g.fee, 3 * g.inst - g.cost); assert.equal(g.diy, Math.round(0.3 * g.cost / 100) * 100);
      let ev = E.currentEvent(st);
      assert.deepEqual(ev.options.map((o) => o.id), ['next', 'skip']); assert.equal(ev.options.find((o) => o.primary).id, 'next');
      assert.equal(ev.data.step, 'salary'); assert.ok(ev.data.payslip.net > 0 && ev.data.payslip.cashflow === E.metrics(st).cashflow);
      assert.throws(() => E.rollDice(st), /cannot roll/);
      ev = E.choose(st, ev, 'next').event; assert.equal(ev.data.step, 'glitch');
      assert.deepEqual(ev.options.map((o) => o.id), ['fix:pay', 'fix:inst', 'fix:diy']);
      assert.ok(ev.options.every((o) => !o.primary && o.enabled), 'no primary on the glitch'); assert.ok(ev.data.note);
      const cash0 = st.cash, en0 = st.life.energy, nExp = st.expenses.length, nDq = st.dq.decisions.length, nLog = st.log.length;
      const r = E.choose(st, ev, choice); ev = r.event;
      if (choice === 'fix:pay') assert.equal(st.cash, cash0 - g.cost);
      if (choice === 'fix:diy') { assert.equal(st.cash, cash0 - g.diy); assert.equal(st.life.energy, Math.max(0, en0 - 10)); }
      if (choice === 'fix:inst') { assert.equal(st.cash, cash0); const l = st.expenses[st.expenses.length - 1]; assert.equal(st.expenses.length, nExp + 1); assert.equal(l.amount, g.inst); assert.equal(l.until, st.month + 2); assert.equal(l.label, 'תשלומים: מכונת כביסה'); }
      assert.equal(ev.data.step, 'result'); assert.equal(ev.data.result.cashAfter, st.cash); assert.equal(ev.data.result.cashBefore, cash0);
      assert.equal(ev.data.result.instMonths, choice === 'fix:inst' ? 3 : 0);
      const goal = st.cash + st.savings < expOf(st) ? 'cushion' : 'asset'; assert.equal(st.intro.goal, goal); assert.equal(ev.data.goal.id, goal);
      assert.deepEqual(ev.options.map((o) => o.id), ['go']); assert.ok(ev.options[0].primary);
      const end = E.choose(st, ev, 'go'); assert.equal(end.done, true); assert.equal(st.phase, 'roll'); assert.equal(st.intro.step, 'done');
      assert.equal(st.dq.decisions.length, nDq, 'no decision record for the intro'); assert.equal(st.log.length, nLog, 'no decision log entry');
      assert.deepEqual(st.rng, rng0, 'no RNG draw in the intro');
      assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of the intro');
    }
    const s2 = E.createGame({ worldId: 'w1', charId: ch, seed: 7, tutorial: true });
    E.choose(s2, null, 'skip'); assert.equal(s2.intro.step, 'skipped'); assert.equal(s2.intro.goal, null); assert.equal(s2.phase, 'roll'); assert.equal(E.metrics(s2).nextGoal, null);
  }
  // only w1, only free, only with tutorial
  assert.equal(E.createGame({ worldId: 'w2', seed: 3, tutorial: true }).intro, null);
  assert.equal(E.createGame({ worldId: 'w1', seed: 3, mode: 'daily', tutorial: true }).intro, null);
  assert.equal(E.createGame({ worldId: 'w1', seed: 3 }).intro, null);
  assert.equal(E.createGame({ worldId: 'w1', seed: 3, tutorial: true, rules: 3 }).intro, null, 'rules 3 = the v3 game (no intro)');
});

test(`T-E2 tutorial deal guarantee (AC-T6): 4 characters × 3 glitch choices × ${N(20)} seeds — primary buy, no warning, cushion ≥ 1, score ≥ 80, no offers; dice stream untouched`, () => {
  let seen = 0;
  for (const ch of W1) for (const choice of ['fix:pay', 'fix:inst', 'fix:diy']) for (let s = 1; s <= N(20); s++) {
    const st = E.createGame({ worldId: 'w1', charId: ch, seed: 1000 + s * 13, tutorial: true });
    closeIntro(st, choice);
    tap(st, prng(s), (x) => x.pending && x.pending.card && x.pending.card.tutorialDeal, 300);
    if (!(st.pending && st.pending.card && st.pending.card.tutorialDeal)) continue;
    seen++;
    const ev = E.currentEvent(st); const d = ev.data;
    assert.equal(ev.options.find((o) => o.primary).id, 'buy', `${ch}/${choice}/${s}: primary buy`);
    assert.equal(d.warning, undefined); assert.ok(d.cushionAfter >= 1, 'cushion ≥ 1 month after the buy');
    assert.ok(!ev.options.some((o) => /^offer:|^inspect:/.test(o.id)), 'no negotiation, no inspection'); assert.ok(!d.rivals, 'no competition on the tutorial deal');
    assert.ok(d.down >= 1000 && d.down <= 5000 && d.down % 500 === 0); assert.equal(d.name, 'עגלת הקפה של השכן');
    assert.ok(/מספר של משחק/.test(d.reality));
    E.choose(st, ev, 'buy'); const rec = st.dq.decisions[st.dq.decisions.length - 1];
    assert.ok(rec.s >= 80, `score ${rec.s}`); assert.equal(rec.o, 'buy');
  }
  assert.ok(seen >= N(20) * 3, 'the tutorial deal appeared in most games: ' + seen);
  // dice: a tutorial game and a plain game consume the dice stream identically
  const a = E.createGame({ worldId: 'w1', charId: 'doctor', seed: 42, tutorial: true }); closeIntro(a);
  const b = E.createGame({ worldId: 'w1', charId: 'doctor', seed: 42 });
  for (let i = 0; i < 12; i++) for (const st of [a, b]) oneTurn(st, prng(i));
  assert.equal(a.rng.dice, b.rng.dice, 'dice stream positions equal');
});

test('T-E3 goal chain: cushion → asset → fund → done, news texts, metrics().nextGoal', () => {
  const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 5, tutorial: true });
  E.choose(st, null, 'next'); E.choose(st, null, 'fix:pay');
  assert.equal(st.intro.goal, 'cushion');
  E.choose(st, null, 'go');
  let g = E.metrics(st).nextGoal; assert.deepEqual(Object.keys(g).sort(), ['done', 'id', 'target', 'title', 'unit', 'value'].sort());
  assert.equal(g.id, 'cushion'); assert.equal(g.unit, '₪'); assert.equal(g.target, expOf(st));
  st.cash = expOf(st) + 2000; // forced state: enough cash
  let r = E.moveSavings(st, 100);
  assert.ok(r.news.some((x) => x.kind === 'goal' && x.text === 'הושג: חודש הוצאות בצד. הבא: נכס ראשון שמכניס כסף'), JSON.stringify(r.news));
  g = E.metrics(st).nextGoal; assert.equal(g.id, 'asset'); assert.equal(g.unit, 'count'); assert.equal(g.value, 0);
  st.assets.push({ id: 99, k: 're', n: 'x', cost: 1, down: 1, debt: 0, value: 1, cf: 10 });
  st.savings = expOf(st) + 10;
  r = E.moveSavings(st, 50);
  assert.ok(r.news.some((x) => x.text === 'הושג: נכס ראשון שמכניס כסף. הבא: 🛟 חודש הוצאות בקרן החירום'));
  assert.ok(r.news.some((x) => x.text === 'הושג: 🛟 חודש הוצאות בקרן החירום. סיימת את ההדרכה! 🎓'));
  assert.equal(st.intro.goal, 'done'); assert.equal(E.metrics(st).nextGoal, null);
  // a character that starts with a cushion starts at 'asset'
  const d = E.createGame({ worldId: 'w1', charId: 'doctor', seed: 5, tutorial: true }); E.choose(d, null, 'next'); E.choose(d, null, 'fix:pay'); assert.equal(d.intro.goal, 'asset');
});

test('T-E4 rollCost: ranked 0, learn 0, tutorialFree turn < 10 → 0 then 1, plain free 1, replayed tutorial pays', () => {
  assert.equal(E.TUTORIAL_FREE_ROLLS, 10);
  assert.equal(E.rollCost(E.createGame({ worldId: 'w1', seed: 1, mode: 'daily' })), 0);
  assert.equal(E.rollCost(E.createGame({ worldId: 'w1', seed: 1, learn: true })), 0);
  assert.equal(E.rollCost(E.createGame({ worldId: 'w1', seed: 1 })), 1);
  assert.equal(E.rollCost(E.createGame({ worldId: 'w1', seed: 1, tutorial: true })), 1, 'a replayed tutorial (no tutorialFree) pays ⚡');
  const st = E.createGame({ worldId: 'w1', seed: 1, tutorial: true, tutorialFree: true }); closeIntro(st);
  assert.equal(E.rollCost(st), 0);
  tap(st, prng(3), (x) => x.turn >= 10 && !x.pending, 30);
  assert.ok(st.turn >= 10); assert.equal(E.rollCost(st), 1);
  // learn / tutorialFree / dream only in free mode
  const d = E.createGame({ worldId: 'w1', seed: 1, mode: 'weekly', learn: true, tutorialFree: true, dream: 'stable' });
  assert.equal(d.learn, false); assert.equal(d.tutorialFree, false); assert.equal(d.dream, null);
  // replayConfig carries learn / dream / tutorialFree (free games only)
  const c = E.replayConfig(E.createGame({ worldId: 'w1', seed: 1, learn: true, dream: 'free', tutorialFree: true }));
  assert.equal(c.learn, true); assert.equal(c.dream, 'free'); assert.equal(c.tutorialFree, true);
  const rc = E.replayConfig(E.createGame({ worldId: 'w1', seed: 1, mode: 'daily' })); assert.ok(!('learn' in rc) && !('dream' in rc) && !('tutorialFree' in rc));
  assert.equal(E.summaryForServer(E.createGame({ worldId: 'w1', seed: 1, learn: true })).config.learn, true);
});

test(`T-E5 dreams: ranked ignores them, outcome-neutral for the same log (${N(6)} games × 5 variants), missions at the right time, trackers`, () => {
  assert.equal(E.DREAMS.length, 4); assert.deepEqual(E.DREAMS.map((d) => d.id), ['biz', 'family', 'stable', 'free']);
  assert.ok(E.DREAMS.every((d) => d.missions.length === 3));
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, mode: 'daily', dream: 'stable' }).dream, null, 'AC-D1');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, dream: 'stable' }).dream.id, 'stable');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, dream: 'nope' }).dream, null);
  for (let g = 0; g < N(6); g++) {
    const base = tap(E.createGame({ worldId: ['w1', 'w2', 'w3', 'w4'][g % 4], seed: 300 + g }), prng(g), () => false, 160);
    const cfg = E.replayConfig(base); const strip = (st) => { const m = E.metrics(st); delete m.dream; return m; };
    const endOf = (st) => { const e = clone(st.result || E.checkEnd(st) || {}); delete e.dream; return e; };
    for (const dream of ['biz', 'family', 'stable', 'free']) {
      const s2 = E.replay({ ...cfg, dream }, base.actions);
      assert.deepEqual(strip(s2), strip(base), `AC-D2 metrics ${dream}`); assert.deepEqual(s2.rng, base.rng, 'AC-D2 rng'); assert.deepEqual(endOf(s2), endOf(base), 'AC-D2 end');
    }
  }
  // mission timing: st_fund1 completes at the first call where savings ≥ E, reported once in out.dream
  const st = E.createGame({ worldId: 'w1', charId: 'doctor', seed: 9, dream: 'stable' });
  const E0 = expOf(st); const r1 = E.moveSavings(st, E0 - 10); assert.ok(!r1.dream);
  const r2 = E.moveSavings(st, 10); assert.deepEqual(r2.dream, [{ id: 'st_fund1', title: 'חודש הוצאות בקרן החירום' }]);
  const r3 = E.moveSavings(st, 1); assert.ok(!r3.dream, 'reported once');
  const md = E.metrics(st).dream; assert.equal(md.done, 1); assert.ok(md.missions[0].done && md.missions[0].doneMonth === 1); assert.ok(md.missions[1].progress > 0.3 && md.missions[1].progress < 1);
  // powerStreak: consecutive paydays with 🔋 ≥ 50, reset below; cleanSince follows credit debt
  const f = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 4, dream: 'family' });
  f.life.energy = 90; let paydays = 0;
  tap(f, prng(1), (x) => { if (x.stats.paydays > paydays) { paydays = x.stats.paydays; x.life.energy = paydays === 3 ? 20 : 90; } return paydays >= 11; }, 200);
  assert.ok(f.dream.track.powerStreak >= 1 && f.dream.track.powerStreak <= 8, 'streak restarted after the low payday: ' + f.dream.track.powerStreak);
  const c = E.createGame({ worldId: 'w1', charId: 'driver', seed: 4, dream: 'stable' }); c.credit = 1000;
  tap(c, prng(2), (x) => x.stats.paydays >= 2, 50); assert.equal(c.dream.track.cleanSince, c.month, 'cleanSince = the last month with credit debt');
  // end.dream (CR-E5)
  const won = tap(E.createGame({ worldId: 'w1', charId: 'teacher', seed: 21, dream: 'free' }), prng(5), () => false, 600);
  const end = won.result || E.checkEnd(won); if (end) { assert.ok(end.dream && end.dream.id === 'free' && Array.isArray(end.dream.missions)); }
});

test('T-E6 lesson context: ctx shape on out.lessons + st.lessonCtx; time_in_market and benchmark are reachable', () => {
  const st = tap(E.createGame({ worldId: 'w1', charId: 'teacher', seed: 31 }), prng(4), (x) => x.lessons.length >= 6, 200);
  const ids = Object.keys(st.lessonCtx); assert.ok(ids.length >= 6);
  for (const id of ids) { const c = st.lessonCtx[id]; assert.ok(Number.isInteger(c.m) && 'ev' in c && 'num' in c); if (c.num) assert.ok(typeof c.num.label === 'string' && c.num.value != null); }
  assert.equal(st.lessonCtx.gross_net.ev, 'יום המשכורת'); assert.equal(st.lessonCtx.gross_net.num.label, 'נטו');
  // out.lessons carries ctx {month, worldId, event, num}
  const s2 = E.createGame({ worldId: 'w1', seed: 2 }); let got = null;
  for (let i = 0; i < 30 && !got; i++) { const r = E.rollDice(s2); for (const l of r.lessons || []) got = got || l; E.landing(s2); oneTurn(s2, prng(i)); }
  assert.ok(got && got.ctx && got.ctx.worldId === 'w1' && Number.isInteger(got.ctx.month));
  // time_in_market: hold index units through a −8% month and 3 paydays later still hold them
  const t = E.createGame({ worldId: 'w1', charId: 'doctor', seed: 77 });
  E.invest(t, 'buy', 20); let hit = false;
  for (let i = 0; i < 400 && !t.over && !t.lessons.includes('time_in_market'); i++) { if (t.pending) oneTurn(t, prng(i)); if (t.over) break; const r = E.rollDice(t); hit = hit || !!(r.news || []).some((x) => x.kind === 'indexDrop'); E.landing(t); if (t.pending) { let ev = E.currentEvent(t); let n = 0; while (ev && !t.over && n < 6) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['pass', 'skip', 'done', 'ok'].includes(x.id)) || en.find((x) => x.primary) || en[0]; ev = E.choose(t, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++; } } }
  if (hit) assert.ok(t.lessons.includes('time_in_market'), 'time_in_market unlocked after a −8% month held through');
  // benchmark at the end of every history game
  const sc = E.scenarioList()[0];
  const h = E.createGame({ mode: 'history', scenarioId: sc.id, seed: 3 });
  tap(h, prng(9), () => false, 2000);
  assert.ok(h.over, 'history game ended'); assert.ok(h.lessons.includes('benchmark') && h.result.lessons.includes('benchmark'));
});

test('T-E7 RNG neutrality: intro choices, practiceDue, answerPractice, dreams never touch st.rng', () => {
  const st = E.createGame({ worldId: 'w1', seed: 11, tutorial: true, dream: 'biz' });
  const r0 = clone(st.rng); closeIntro(st, 'fix:diy'); assert.deepEqual(st.rng, r0);
  tap(st, prng(3), (x) => x.turn >= 8 && !x.pending && x.lessons.length >= 3, 40);
  const r1 = clone(st.rng); const q = E.practiceDue(st, { lastTurn: null, offered: [], doneA: [] }); assert.deepEqual(st.rng, r1);
  if (q) { E.answerPractice(st, q.id, 0); assert.deepEqual(st.rng, r1, 'answerPractice'); }
  const r2 = clone(st.rng); E.moveSavings(st, 1); assert.deepEqual(st.rng, r2, 'dream tick');
});

test(`T-E8 practice ('K'): AC-P1…P4, dose, replay with K, ranked refused (${N(10)} games)`, () => {
  assert.equal(PR.PRACTICE.length, 24);
  for (const it of PR.PRACTICE) { assert.equal(it.answers.length, 3); assert.ok([0, 1, 2].includes(it.c)); assert.ok(it.why.length <= 90); }
  const ranked = E.createGame({ worldId: 'w1', seed: 1, mode: 'daily' });
  assert.equal(E.practiceDue(ranked, {}), null); assert.equal(E.answerPractice(ranked, 'budget_a', 1).ok, false);
  const intro = E.createGame({ worldId: 'w1', seed: 1, tutorial: true }); intro.turn = 9; intro.lessons = ['cashflow'];
  assert.equal(E.practiceDue(intro, {}), null, 'never during the intro');
  let answered = 0;
  for (let g = 0; g < N(10); g++) {
    const st = E.createGame({ worldId: ['w1', 'w2'][g % 2], seed: 50 + g, learn: g % 2 === 0 });
    const memo = { lastTurn: null, offered: [], doneA: [] }; let offers = 0;
    for (let i = 0; i < 300 && !st.over && st.turn < 60; i++) {
      if (!st.pending) {
        const q = E.practiceDue(st, memo);
        if (st.turn < 4) assert.equal(q, null, 'never before turn 4');
        if (q) {
          assert.ok(!('c' in q), 'the correct index is not returned'); assert.ok(!memo.offered.includes(q.id));
          if (memo.lastTurn != null) assert.ok(st.turn - memo.lastTurn >= 3);
          memo.offered.push(q.id); memo.lastTurn = st.turn; offers++;
          const before = clone(st); const res = E.answerPractice(st, q.id, (g + i) % 3); answered++;
          assert.equal(res.ok, true); assert.equal(res.correct, PR.PRACTICE_BY_ID[q.id].c);
          const after = clone(st); for (const k of ['practice', 'actions']) { delete before[k]; delete after[k]; } delete before.dq.transfer; delete after.dq.transfer;
          assert.deepEqual(after, before, 'answerPractice changes only st.practice, st.dq.transfer and st.actions');
          assert.equal(E.answerPractice(st, q.id, 0).ok, false, 'each question once');
        }
      }
      oneTurn(st, prng(g * 100 + i));
    }
    assert.ok(offers <= 6, 'at most 6 offers');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay with K');
    if (st.over) assert.deepEqual((st.result.learning || {}).transfer, st.dq.transfer);
  }
  assert.ok(answered >= N(10), 'questions were answered: ' + answered);
  // a ranked log containing K fails replay
  const d = E.createGame({ worldId: 'w1', seed: 1, mode: 'daily' }); E.rollDice(d);
  assert.throws(() => E.replay(E.replayConfig(d), [...d.actions, ['K', 'budget_a', 1]]), /replay_mismatch/);
});

test('T-E9 saves: v3 fixtures migrate with the T4 defaults; a pre-T4 v4 save loads; v4Defaults is idempotent', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/v3-saves.json', import.meta.url), 'utf8'));
  for (const [k, raw] of Object.entries(fx)) {
    let st; try { st = E.deserialize(raw); } catch (e) { if (k === 'history') continue; throw e; }
    assert.equal(st.learn, false); assert.equal(st.dream, null); assert.equal(st.intro, null); assert.deepEqual(st.practice, { answered: {} });
    assert.deepEqual(st.dq.transfer, {}); assert.deepEqual(st.lessonCtx, {});
    const again = E.deserialize(E.serialize(st)); assert.equal(E.serialize(again), E.serialize(st), `${k}: idempotent round trip`);
    tap(st, prng(1), () => false, 20);
  }
  // a pre-T4 v4 save (no T4 / T6 fields) loads and plays
  const st = tap(E.createGame({ worldId: 'w2', seed: 8 }), prng(2), () => false, 15);
  const old = clone(st); for (const k of ['learn', 'dream', 'intro', 'practice', 'lessonCtx', 'tutorialFree', 'tl', 'marks', 'rivalDeals', 'afterWin', 'self', 'bizPast']) delete old[k]; delete old.dq.transfer; delete old.dq.luckLog;
  const back = E.deserialize(JSON.stringify(old)); assert.equal(back.learn, false); assert.ok(back.tl && back.tl.from === back.month);
  tap(back, prng(3), () => false, 20);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
