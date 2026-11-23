#!/usr/bin/env node
// Rules 5 (full upgrade, team ב economy lane) — engine tests for docs/full-upgrade/research/E1-economy.md B1 / B2 / A1 / C2 / C3,
// J1 §4 E3 / E7, and the RULES5_FROM gate. Rules 3 / 4 keep their old behaviour (each fix is checked under both rule sets).
// Run: node tests/rules5.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as BIZ from '../js/finance/business.js';
import { RULES4_FROM as R4c, RULES5_FROM as R5c, rulesFor, verifyGame, inCutoverWeek } from '../supabase/functions/verify-result/verify_core.js';
import { POLICIES } from '../tools/sim.mjs';
import { playOut, prng } from './lib/random-player.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e.stack).split('\n').slice(0, 6).join('\n   ')}`); }
}
const safe = (ev) => (ev.options.find((o) => o.enabled && ['pass', 'skip', 'ok', 'done'].includes(o.id)) || ev.options.find((o) => o.enabled)).id;
/** Roll until the next payday has passed, taking the safe option on every card. */
function toNextPayday(st) {
  const m0 = st.month; let g = 0;
  while (st.month === m0 && !st.over && g++ < 20) {
    if (st.pending) { E.choose(st, E.currentEvent(st), safe(E.currentEvent(st))); continue; }
    E.rollDice(st); let ev = E.landing(st); while (ev) ev = E.choose(st, ev, safe(ev)).event;
  }
}

/* ------------------------------------------------------------------ gate */
// worlds wave 0: rules 6 (≡ rules 5 in w1–w4) starts on RULES6_FROM — a placeholder equal to RULES5_FROM, so a date ≥ RULES5_FROM gives 6 then.
const R5D = E.RULES6_FROM === E.RULES5_FROM ? 6 : 5; // the rule set of a ranked day ≥ RULES5_FROM
test('gate: RULES5_FROM is one Monday in the client and the verifier; free → current; ranked by date (3 / 4 / 5|6); no date → current', () => {
  assert.equal(E.RULES5_FROM, R5c); assert.equal(E.RULES4_FROM, R4c);
  const [y, m, d] = R5c.split('-').map(Number); assert.equal(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), 1, 'Monday');
  assert.ok(R5c > R4c);
  assert.equal(E.createGame({ worldId: 'w1', seed: 1 }).rules, E.RULES_CURRENT, 'free');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, learn: true }).rules, E.RULES_CURRENT, 'learning');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, mode: 'free', dateKey: '2026-12-01' }).rules, E.RULES_CURRENT, 'a free game ignores date keys');
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, rules: 5 }).rules, 5);
  assert.equal(E.createGame({ worldId: 'w1', seed: 1, rules: 4 }).rules, 4); assert.equal(E.createGame({ worldId: 'w1', seed: 1, rules: 3 }).rules, 3);
  const day = (k) => E.rulesForDay(k);
  assert.equal(day('2026-12-06'), 3); assert.equal(day('2026-12-07'), 4); assert.equal(day('2026-12-20'), 4); assert.equal(day(R5c), R5D); assert.equal(day('2027-01-04'), R5D); assert.equal(day(null), E.RULES_CURRENT);
  assert.equal(day('2026-W51'), 4, 'the week of Mon 14.12'); assert.equal(day('2026-W52'), R5D, 'RULES5_FROM is the Monday of W52');
  for (const k of ['2026-12-06', '2026-12-07', '2026-12-20', '2026-12-21', '20261221', '2026-W51', '2026-W52', null, 'junk']) {
    assert.equal(day(k), rulesFor({ daily_key: k }), 'client ≡ verifier ' + k);
  }
  assert.equal(rulesFor({ weekly_start: '2026-12-14' }), 4); assert.equal(rulesFor({ challenge_day: '2026-12-22' }), R5D); assert.equal(rulesFor({}), E.RULES_CURRENT);
  for (const [mode, key] of [['daily', '2026-12-20'], ['daily', '2026-12-21'], ['weekly', '2026-W52'], ['challenge', '2026-12-08']]) {
    assert.equal(E.createGame({ worldId: 'w2', seed: 3, mode, dateKey: key }).rules, E.rulesForDay(key), mode + ' ' + key);
  }
  assert.equal(E.dailyConfig('2026-12-20').rules, 4); assert.equal(E.dailyConfig('2026-12-21').rules, R5D);
});

test('gate: the verifier replays rules 5 by date, falls back 4 → 5 only in the RULES5_FROM week, never 5 → 4', () => {
  const Local = E; const w = E.getWorld('w1');
  const charId = w.daily.chars[2 % w.daily.chars.length];
  const st = playOut(Local, { worldId: 'w1', charId, seed: 5151, mode: 'daily', maxMonths: 24, tutorial: false, bailout: false, rules: 5 }, prng(9));
  assert.equal(st.rules, 5); assert.ok(st.over);
  const end = st.result;
  const row = { mode: 'daily', world: 'w1', profession: 'idx:2', seed: 5151, max_months: 24, status: end.status, months: Math.max(1, Math.min(200, Math.round(end.months))), passive: Math.round(end.passive),
    expenses: Math.max(0, Math.round(end.expenses)), net_worth: Math.round(end.netWorth), claim_stars: end.stars || 0, claim_progress: end.progress };
  const ok5 = verifyGame(Local, { ...row, daily_key: '2026-12-22' }, st.actions); assert.ok(ok5.ok, ok5.error); assert.equal(ok5.cfg.rules, R5D, 'replayed with rules 6 when RULES6_FROM = RULES5_FROM — the same outcome in w1'); assert.ok(!ok5.rulesFallback);
  // dated rules 4 (the day before), finished in the cut-over week → one retry with 5
  const fb = verifyGame(Local, { ...row, daily_key: '2026-12-20', finished_day: R5c }, st.actions);
  const same4 = E.replay({ worldId: 'w1', charId, seed: 5151, mode: 'daily', maxMonths: 24, tutorial: false, bailout: false, mentor: 'hint', rules: 4 }, st.actions);
  const differs = !same4.result || same4.result.netWorth !== end.netWorth || same4.result.passive !== end.passive || same4.result.months !== end.months || same4.result.status !== end.status;
  if (differs) { assert.ok(fb.ok, fb.error); assert.equal(fb.rulesFallback, true); }
  // outside the cut-over week: no retry
  const late = verifyGame(Local, { ...row, daily_key: '2026-12-20', finished_day: '2027-01-05' }, st.actions);
  if (differs) assert.equal(late.ok, false);
  assert.ok(inCutoverWeek('2026-12-27', R5c)); assert.ok(!inCutoverWeek('2026-12-28', R5c)); assert.ok(inCutoverWeek('2026-12-07'), 'the RULES4 week (default)');
});

/* ------------------------------------------------------------------ B1 */
test('B1: take → repay no longer farms the credit score (rules 5); rules 4 keeps the old behaviour; principal held over a payday still earns the bonus', () => {
  for (const w of ['w1', 'w2', 'w3']) {
    const farm = (rules) => { const st = E.createGame({ worldId: w, seed: 7, mode: 'free', rules }); for (let i = 0; i < 29; i++) { if (E.takeLoan(st).ok === false) break; if (E.repayLoan(st).ok === false) break; } return st; };
    const a4 = farm(4), a5 = farm(5);
    assert.equal(a4.life.creditScore, 850, w + ' rules 4: the documented repro (680 → 850)');
    assert.equal(a5.life.creditScore, 680, w + ' rules 5: closed');
    assert.ok(E.loanPct(a5) > E.loanPct(a4), w + ' the farmed rate discount is gone');
  }
  const st = E.createGame({ worldId: 'w1', seed: 7, mode: 'free' }); E.takeLoan(st); E.takeLoan(st);
  const unit = E.metrics(st).loanUnit; assert.equal(st.loans, 2 * unit);
  toNextPayday(st); const s1 = st.life.creditScore; assert.equal(st.life.repayOk, 2 * unit, 'owed at the payday');
  E.repayLoan(st); assert.equal(st.life.creditScore, s1 + 6, 'one unit of old principal → +6');
  E.takeLoan(st); E.repayLoan(st); E.repayLoan(st);
  assert.equal(st.life.creditScore, s1 + 12, 'only the second old unit counts, the new loan does not'); assert.equal(st.life.repayOk, 0);
});

/* ------------------------------------------------------------------ B2 */
/** E1 B2 repro (owner policy, w1, first toyshop): hire a manager + draw ₪20,000 (the two legal business choices), then play safe. */
function drain(ch, seed, rules) {
  const P = POLICIES.owner;
  const st = E.createGame({ worldId: 'w1', charId: ch, seed, mode: 'free', mentor: 'hint', rules });
  let s0 = seed; const r = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
  const resolve = (ev) => { let n = 0; while (ev) { const c = ev.auto ? [ev.options[0].id] : n >= 6 ? [safe(ev)] : P.decide(st, ev, { r, n }); let res = E.choose(st, ev, c[0], c[1]); if (!res.ok) res = E.choose(st, ev, safe(ev)); n++; ev = res.event; } };
  let g = 0;
  while (!st.over && g++ < 300 && !st.assets.some((a) => a.biz && a.biz.type === 'toyshop' && a.biz.month >= 2)) { P.between(st, { r }); if (st.over) break; if (st.pending) resolve(E.currentEvent(st)); if (st.over) break; E.rollDice(st); resolve(E.landing(st)); }
  const a = st.assets.find((x) => x.biz && x.biz.type === 'toyshop'); assert.ok(a && !st.over, 'the repro reaches a toyshop');
  const rr = BIZ.applyDecisions(a.biz, { manager: true, draw: 20000 }); assert.ok(rr.ok); a.biz = rr.business;
  const rows = [];
  for (let k = 0; k < 6 && !st.over; k++) { toNextPayday(st); const m = E.metrics(st); rows.push(m); }
  return { st, rows };
}
test('B2: draining a managed business no longer wins the passive goal (rules 5); rules 4 still does (repro); cash mechanics unchanged', () => {
  for (const [ch, seed, wonAt] of [['teacher', 5, 26], ['dev', 4, 50]]) {
    const r4 = drain(ch, seed, 4), r5 = drain(ch, seed, 5);
    assert.equal(r4.st.result && r4.st.result.status, 'won', `${ch} ${seed}: rules 4 repro`); assert.equal(r4.st.result.months, wonAt);
    assert.ok(!(r5.st.result && r5.st.result.status === 'won'), `${ch} ${seed}: rules 5 does not win`);
    const m = r5.rows[0];
    assert.ok(m.passive > m.expenses, 'the draw is still paid out (cash mechanics kept): passive in the cash flow ≥ expenses');
    assert.ok(m.goalPassive < m.passive && m.goalPassive < m.expenses, 'the goal counts the sustainable draw');
    assert.ok(m.goalParts[0].bizCapped > 0 && /לא נספרת/.test(m.goalParts[0].note));
    assert.equal(m.goalParts[0].value, m.goalPassive);
  }
});
test('B2: normal paths unchanged — no business: goal passive = passive; a draw within profit counts in full; sustainableDraw math', () => {
  const st = playOut(E, { worldId: 'w1', seed: 77, mode: 'free' }, prng(3));
  const m = E.metrics(st); if (!st.assets.some((a) => a.biz)) assert.equal(m.goalPassive, m.passive);
  const b = BIZ.newBusiness ? null : null; void b;
  const fake = { closed: false, manager: true, p: { managerWage: 3000 }, cpi: 1, hist: [{ ebt: 10000, one: 0 }, { ebt: 12000, one: 1000 }, { ebt: 8000, one: 0 }] };
  assert.equal(BIZ.sustainableDraw(fake), Math.round(31000 / 3 * 0.77 * 0.7));
  assert.equal(BIZ.sustainableDraw({ ...fake, manager: false }), Math.round((31000 / 3 - 3000) * 0.77 * 0.7), 'no manager: a buyer would pay one');
  assert.equal(BIZ.sustainableDraw({ ...fake, hist: [{ ebt: -500, one: 0 }] }), 0);
  assert.equal(BIZ.sustainableDraw({ ...fake, closed: true }), 0);
});

/* ------------------------------------------------------------------ A1 */
test('A1: tuition while unemployed is an expense line (rules 5: lines sum to expenses); rules 4 keeps the old lines', () => {
  for (const rules of [4, 5]) {
    const st = E.createGame({ worldId: 'w3', charId: 'exporter', seed: 447151, mode: 'free', rules });
    E.setPlan(st, 'study'); st.life.jobless = { until: st.month + 6 };
    const m = E.metrics(st); const lines = m.expenseLines.reduce((a, l) => a + l.amount, 0);
    const tuition = (m.expenseLines.find((l) => l.id === 'study') || {}).amount || 0;
    if (rules === 5) { assert.equal(lines, m.expenses, 'every shekel charged is shown'); assert.ok(tuition > 0); }
    else { assert.equal(tuition, 0, 'rules 4: the old (hidden) line, replay-identical'); assert.ok(m.expenses - lines > 0); }
    assert.equal(m.incomeLines.reduce((a, l) => a + l.amount, 0) - m.expenses, m.cashflow);
  }
});

/* ------------------------------------------------------------------ E3 */
test('E3: the focused end lesson names the month, the card and the choice, as a sentence', () => {
  let found = null;
  for (let s = 1; s < 60 && !found; s++) {
    const st = E.createGame({ worldId: ['w1', 'w2', 'w4'][s % 3], seed: 900 + s, mode: 'free', mentor: 'hint' }); const P = POLICIES.reckless; const r = prng(s);
    let g = 0; while (!st.over && st.month < 70 && g++ < 900) { P.between(st, { r }); if (st.over) break; E.rollDice(st); let ev = E.landing(st); let k = 0; while (ev) { const c = k++ > 5 ? [safe(ev)] : P.decide(st, ev, { r, n: k }); let res = E.choose(st, ev, c[0], c[1]); if (!res.ok) res = E.choose(st, ev, safe(ev)); ev = res.event; } }
    const res = st.result || E.endNow(st); const sg = res.recap && res.recap.suggestion;
    if (sg && sg.rule === 1) found = sg;
  }
  assert.ok(found, 'a game with a rule-1 lesson');
  assert.match(found.text, /^בחודש \d+, בכרטיס "[^"]+"( בחרת "[^"]+")?: .+\. זה הלקח לפעם הבאה\.$/);
  assert.ok(!/השאיר אותך/.test(found.text) && !/: היה עדיף:/.test(found.text), found.text);
  assert.ok(found.m >= 1 && found.card);
});

/* ------------------------------------------------------------------ C2 / C3 */
test('C2: low mood raises the burnout threshold and halves the raise chance (rules 5 only); C3 not adopted: the hold stays 2', () => {
  for (const rules of [4, 5]) {
    const st = E.createGame({ worldId: 'w1', seed: 11, mode: 'free', rules }); st.life.energy = 27; st.life.lastRaise = -20;
    st.life.happiness = 60; st.life.glow = []; const m1 = E.metrics(st);
    st.life.happiness = 20; const m2 = E.metrics(st);
    assert.equal(m1.life.burnoutRisk, 0);
    if (rules === 5) { assert.ok(m2.life.burnoutRisk > 0, 'below 30 🔋 when unhappy'); assert.ok(m2.life.mood && m2.life.mood.low); }
    else { assert.equal(m2.life.burnoutRisk, 0); assert.equal(m2.life.mood, null); }
    st.life.energy = 90; st.life.happiness = 60; const c1 = E.metrics(st).life.raiseChance; st.life.happiness = 20; const c2 = E.metrics(st).life.raiseChance;
    if (rules === 5) assert.equal(c2, Math.round(c1 * 50) / 100); else assert.equal(c2, c1);
  }
  // C3 (a 3-payday hold in w2) was measured and NOT adopted (guide −5 pp in w2): every world keeps the 2-payday hold
  for (const w of ['w1', 'w2', 'w3', 'w4']) for (const rules of [4, 5]) assert.equal(E.metrics(E.createGame({ worldId: w, seed: 1, rules })).goalHold.need, E.GOAL_HOLD);
});

/* ------------------------------------------------------------------ C1 */
test('C1: cuts have a price in rules 5 — the frugal audit costs 4 🔋 and cuts less; a w2 trim costs 8 months of the cut and −3 😊 (set point too)', () => {
  for (const rules of [4, 5]) {
    const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 4, mode: 'free', rules }); st.life.energy = 60;
    const line = st.expenses.filter((x) => x.amount > 0 && !/שכירות|משכנתא|הלוואה|החזר|תשלומים|ליסינג/.test(x.label)).sort((a, b) => b.amount - a.amount)[0]; const a0 = line.amount;
    const f = E.metrics(st).focus.options.find((o) => o.id === 'frugal'); assert.equal(f.cost.energy, rules === 5 ? 4 : 1);
    E.setFocus(st, 'frugal', 0);
    assert.equal(st.life.energy, 60 - (rules === 5 ? 4 : 1));
    if (!st.subs.length) assert.equal(a0 - line.amount, Math.round(a0 * (rules === 5 ? 0.05 : 0.10) / 10) * 10);
  }
  for (const rules of [4, 5]) {
    const st = E.createGame({ worldId: 'w2', seed: 8, mode: 'free', rules }); st.cash = 500000;
    st.pending = { id: 901, type: 'upgrade', tile: 'U', pos: st.pos, month: st.month, card: { n: 'קבלן' } }; st.phase = 'event';
    const ev = E.currentEvent(st); const t = ev.data.trims[0]; if (!t) continue;
    assert.equal(t.cost, Math.round(t.cut * (rules === 5 ? 8 : 5) / 100) * 100);
    const h0 = st.life.happiness; const c0 = st.life.frugalCuts || 0;
    const res = E.choose(st, ev, 'trim:' + t.expenseId); assert.ok(res.ok !== false);
    assert.equal(st.life.happiness, rules === 5 ? Math.max(0, h0 - 3) : h0);
    assert.equal(st.life.frugalCuts || 0, rules === 5 ? c0 + 1 : c0);
  }
});

/* ------------------------------------------------------------------ E7 */
test('E7: study is scored on the after-tax raise inside the next 24 months — not the top plan when tired, still top when fresh; rules 4 unchanged', () => {
  const top = (rules, energy, month = 3) => {
    const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 21, mode: 'free', rules }); st.life.energy = energy; st.month = month;
    st.pending = { id: 900, type: 'payday', tile: 'P', pos: st.pos, month: st.month }; st.phase = 'event';
    const ev = E.currentEvent(st); const sc = E.scoreOptions(st, ev).filter((x) => /plan|^ok$/.test(x.id) || ev.options.find((o) => o.id === x.id && o.kind === 'plan'));
    const best = sc.slice().sort((a, b) => b.U - a.U)[0]; return (ev.options.find((o) => o.id === best.id) || {}).plan || best.id;
  };
  assert.equal(top(4, 50), 'study', 'rules 4: study wins even half-tired (the A7 finding)');
  assert.notEqual(top(5, 50), 'study', 'rules 5: tired → not study');
  assert.equal(top(5, 85), 'study', 'rules 5: fresh, early → study');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
