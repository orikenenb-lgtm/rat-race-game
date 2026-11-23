// 3D upgrade wave 2 (team ד) — the "יעד העולם" panel model and the new-debt chip (js/hudgoal.js), checked against the engine.
// Node, no browser:  node tests/hud_goal.test.mjs [-v]
// Every number the panel shows must be an engine output (E.metrics, E.starThresholds) or the difference of two engine outputs;
// the star / gate ticks must agree with the engine's own end result (buildEnd via checkEnd) for real played games.
import * as E from '../js/engine.js';
import { goalPanelModel, newDebt, debtSnap, debtMonthly } from '../js/hudgoal.js';
import { prng } from './lib/random-player.mjs';

const VERBOSE = process.argv.includes('-v');
let n = 0, fails = 0;
const ok = (c, msg, extra) => { n++; if (!c) { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } else if (VERBOSE) console.log('ok  ', msg); };
const W = (id) => E.getWorld(id);
const model = (st, m = E.metrics(st), learn = false) => goalPanelModel(m, { thresholds: E.starThresholds(W(st.worldId), st.charId, m.rules), learn, impactPending: (m.worldIndicators || {}).impactPending || 0 });

/** invariants of one state: the panel says exactly what the engine says */
function check(st, tag) {
  const m = E.metrics(st); const M = model(st, m); const w = W(st.worldId); const th = E.starThresholds(w, st.charId, m.rules);
  ok(M.goalType === w.goal.type, `${tag} goal type = world goal (${M.goalType})`);
  ok(M.parts.length === m.goalParts.length, `${tag} one panel part per engine goal part`);
  M.parts.forEach((p, i) => {
    const g = m.goalParts[i];
    ok(p.key === g.key && p.value === g.value && p.target === g.target, `${tag} part ${p.key}: value / target are the engine's`, { p, g });
    ok(p.gap === Math.max(0, g.target - g.value), `${tag} part ${p.key}: gap = target − value (${p.gap})`);
  });
  if (w.goal.type === 'passive') {
    ok(m.goalParts[0].value === m.passive && m.goalParts[0].target === m.expenses, `${tag} passive part = metrics passive / expenses`);
    const gap = m.expenses - m.passive;
    if (gap > 0) ok(M.gaps[0] === `חסרה ${E.fmtM(gap)} הכנסה פסיבית לכיסוי ההוצאות`, `${tag} w1/w2 line "חסרה ₪X הכנסה פסיבית לכיסוי ההוצאות"`, M.gaps);
    else ok(!M.gaps.length, `${tag} no gap line once passive covers expenses`, M.gaps);
  }
  if (w.goal.type === 'netWorth' || w.goal.type === 'netWorthImpact') {
    const nw = M.parts.find((p) => p.key === 'netWorth');
    ok(nw && nw.value === m.netWorth && nw.target === w.goal.target, `${tag} net-worth part = metrics.netWorth vs the world target ${w.goal.target}`);
    if (m.netWorth < w.goal.target) ok(M.gaps.includes(`חסרים ${E.fmtM(w.goal.target - m.netWorth)} לשווי נקי של ${E.fmtM(w.goal.target)}`), `${tag} net-worth gap line`, M.gaps);
  }
  if (w.goal.type === 'netWorthImpact') {
    const im = M.parts.find((p) => p.key === 'impact');
    ok(im && im.target === w.goal.impact && im.value === m.worldIndicators.impact, `${tag} impact part = metrics impact vs ${w.goal.impact}`);
  }
  // the hold rule (GOAL_HOLD paydays) and the engine's own goal-met flag
  ok(M.hold.need === m.goalHold.need && M.hold.streak === Math.min(m.goalHold.streak, m.goalHold.need), `${tag} hold ${M.hold.streak}/${M.hold.need} = engine goalHold (the engine's own need, per world if it ever differs)`);
  ok(M.met === m.goalHold.met, `${tag} "goal met" agrees with the engine (${M.met} vs ${m.goalHold.met})`);
  // stars: month limits from starThresholds / st.maxMonths; ★★★ gates
  ok(M.stars[0].limit === st.maxMonths && M.stars[1].limit === th.t2 && M.stars[2].limit === th.t3, `${tag} ★/★★/★★★ months = maxMonths ${st.maxMonths} / t2 ${th.t2} / t3 ${th.t3}`);
  M.stars.forEach((s) => ok(s.ok === (st.month <= s.limit), `${tag} ★×${s.n} tick = month ${st.month} ≤ ${s.limit}`));
  const fund = M.stars[2].gates.find((g) => g.key === 'fund'), happy = M.stars[2].gates.find((g) => g.key === 'happy');
  ok(fund && fund.ok === (m.emergency.months >= th.fundMonths), `${tag} fund gate = emergency.months ${m.emergency.months} ≥ ${th.fundMonths}`);
  ok(happy && happy.ok === (Math.round(st.life.happiness) >= th.happy), `${tag} happiness gate = round(st.life.happiness) ${Math.round(st.life.happiness)} ≥ ${th.happy} (what buildEnd reads)`);
  ok(M.totals.assets === m.totalAssets && M.totals.liabilities === m.totalLiabilities && M.totals.netWorth === m.netWorth, `${tag} totals = metrics totalAssets / totalLiabilities / netWorth`);
  return { m, M };
}

/** a seeded random game (same legal moves as tests/lib/random-player.mjs), checking every few turns */
function play(cfg, seed, every = 3) {
  const r = prng(seed); const st = E.createGame(cfg); let checks = 0, debtSeen = 0;
  check(st, `${cfg.worldId}/${st.charId} start`);
  for (let guard = 0; !st.over && guard < 3000; guard++) {
    if (r() < 0.06 && !st.pending && !st.over) {   // a bank loan between rolls: the chip numbers are the engine's
      const b = E.metrics(st); const before = debtSnap(b); const out = E.takeLoan(st);
      if (out && out.ok !== false) {
        const a = E.metrics(st); const d = newDebt(before, debtSnap(a));
        if (a.totalLiabilities > b.totalLiabilities) {
          debtSeen++;
          ok(d && d.amount === a.totalLiabilities - b.totalLiabilities, `${cfg.worldId} new debt = Δ totalLiabilities (${d && d.amount})`);
          ok(d && d.monthly === Math.max(0, debtMonthly(a) - debtMonthly(b)), `${cfg.worldId} monthly = Δ of the engine's loan / card interest lines (${d && d.monthly})`);
          ok(d && d.text === `חוב חדש ${E.fmtM(d.amount)}${d.monthly ? ` · ${E.fmtM(d.monthly)} בחודש` : ''}`, `${cfg.worldId} chip text`, d);
        } else ok(d === null, `${cfg.worldId} no chip without new debt`);
      }
    }
    if (r() < 0.04 && st.loans && !st.over) { const b = debtSnap(E.metrics(st)); E.repayLoan(st); ok(newDebt(b, debtSnap(E.metrics(st))) === null, `${cfg.worldId} repaying is not new debt`); }
    if (st.over) break;
    if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = k >= 2 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; if (++k > 60) throw new Error('event loop'); } if (st.over) break; }
    E.rollDice(st);
    let ev = E.landing(st); let k = 0;
    while (ev && !st.over) {
      const en = ev.options.filter((o) => o.enabled);
      let o = k >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)];
      if (r() < 0.45) o = en.find((x) => x.primary) || o;
      const b = debtSnap(E.metrics(st));
      const res = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 + Math.floor(r() * Math.max(1, o.max)) } : {});
      const a = E.metrics(st); const d = newDebt(b, debtSnap(a));
      if (d) { debtSeen++; ok(d.amount === Math.round(a.totalLiabilities - b.total) && d.amount > 0, `${cfg.worldId} decision debt chip = Δ liabilities`); }
      ev = res.event; if (++k > 60) throw new Error('event loop');
    }
    if (!st.over && guard % every === 0) { check(st, `${cfg.worldId}/${st.charId} m${st.month}`); checks++; }
  }
  return { st, checks, debtSeen };
}

/* 1. every world × character at the start, free and ranked-like daily rules */
for (const wid of ['w1', 'w2', 'w3', 'w4']) {
  for (const ch of W(wid).characters) {
    const st = E.createGame({ worldId: wid, charId: ch.id, seed: 11, mode: 'free' });
    const { M } = check(st, `${wid}/${ch.id} start`);
    ok(M.rule && M.rule.length > 20, `${wid}/${ch.id} has a win-condition sentence`);
    ok(M.starsNote && /חופשי/.test(M.starsNote), `${wid}/${ch.id} free mode says the stars still count months`);
  }
}
/* 2. learning mode: no stars */
{ const st = E.createGame({ worldId: 'w1', seed: 3, mode: 'free', learn: true }); const M = model(st, E.metrics(st), true); ok(M.stars === null && /לימוד/.test(M.starsNote), 'learning game: no star criteria, a note instead'); }
/* 3. played games: invariants along the way + the ticks agree with the engine's final stars */
let wins = 0, agree = 0, debts = 0, checks = 0;
for (const wid of ['w1', 'w2', 'w3', 'w4']) {
  const chars = W(wid).characters;
  for (let i = 0; i < 6; i++) {
    const ch = chars[i % chars.length];
    let res;
    try { res = play({ worldId: wid, charId: ch.id, seed: 1000 + i * 37, mode: i % 2 ? 'free' : 'daily' }, 7 + i); }
    catch (e) { ok(false, `${wid}/${ch.id} game ran: ${e.message}`); continue; }
    checks += res.checks; debts += res.debtSeen;
    const st = res.st; const R = st.result || E.checkEnd(st);
    if (R && R.status === 'won') {
      wins++;
      const M = model(st); const s3 = M.stars[2];
      const predicted = !M.stars[0].ok ? 0 : (1 + (M.stars[1].ok ? 1 : 0) + (s3.ok ? 1 : 0)) - (s3.ok && !s3.gates.every((g) => g.ok) ? 1 : 0);
      ok(predicted === R.stars, `${wid}/${ch.id} won in month ${st.month}: panel ticks → ${predicted}★ = engine ${R.stars}★`, { blockedH: R.starsBlockedByHappiness, blockedF: R.starsBlockedByFund, gates: s3.gates });
      if (predicted === R.stars) agree++;
      if (R.starsBlockedByFund) ok(!s3.gates.find((g) => g.key === 'fund').ok, `${wid} engine blocked ★★★ by the fund → the fund gate shows ✗`);
      if (R.starsBlockedByHappiness) ok(!s3.gates.find((g) => g.key === 'happy').ok, `${wid} engine blocked ★★★ by happiness → the happiness gate shows ✗`);
    }
  }
}
ok(checks > 50, `played states checked (${checks})`);
ok(debts > 0, `new-debt chips seen in play (${debts})`);
/* 4. a controlled ★★★ case: same state, gates flipped by the engine's own fields only through real metrics */
{
  const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 5, mode: 'free' });
  const m = E.metrics(st); const M = model(st, m);
  ok(M.stars[2].gates.length === 2 && M.stars[2].gates.every((g) => typeof g.ok === 'boolean'), 'the ★★★ row carries the fund and happiness gates');
  ok(M.summary === M.gaps[0], 'the toggle summary is the first gap line');
}
/* 5. pure-ness: the model does not touch the state */
{
  const st = E.createGame({ worldId: 'w4', seed: 9, mode: 'free' }); const before = JSON.stringify(st); model(st); debtSnap(E.metrics(st));
  ok(JSON.stringify(st) === before, 'goalPanelModel / debtSnap leave the engine state unchanged');
}
/* 6. worlds wave 1 — w5 (goal type passive12): rule, gap per month, months note, the ladder words and the 💼 world row (engine values only) */
{
  const { moneyHubModel, milestoneLadder } = await import('../js/hudgoal.js');
  await E.ensureWorld('w5');
  const st = E.createGame({ worldId: 'w5', charId: 'hotelier', seed: 7, mode: 'free' });
  for (let k = 0; k < 120 && st.month < 5 && !st.over; k++) {
    if (st.phase === 'roll') E.rollDice(st);
    let ev = E.landing(st) || E.currentEvent(st); let g = 0;
    while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
  }
  const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w5'), st.charId, m.rules) });
  const p = M.parts[0] || {};
  ok(m.goalType === 'passive12' && p.key === 'passive12' && p.label.includes('12'), 'w5: one passive12 part with its own label', p);
  ok(/12 ימי המשכורת/.test(M.rule) && M.rule.includes(p.targetText), 'w5: the rule names the 12-payday average and the target', M.rule);
  ok(M.met || (M.gaps[0] && M.gaps[0].includes('בחודש בממוצע השנתי') && M.gaps[0].includes(E.fmtM(p.target - p.value))), 'w5: the gap is "חסרים X בחודש בממוצע השנתי" = target − value', M.gaps);
  ok(p.months == null || p.months >= 12 || (M.pending && M.pending.includes('נספרו')), 'w5: fewer than 12 counted paydays → the "נספרו N מתוך 12" note', { months: p.months, pending: M.pending });
  ok(milestoneLadder(m).some((x) => /ממוצע שנתי של/.test(x.title)) && !milestoneLadder(m).some((x) => /שווי נקי של/.test(x.title)), 'w5: the ladder speaks of the yearly average, never of net worth');
  const H = moneyHubModel(m); const wr = H.rows.find((r) => r.id === 'world');
  ok(wr && wr.acts[0].act === 'world' && wr.title === m.worldIndicators.panel.title, 'w5: 💼 has the world-panel row (title from the panel descriptor)', wr);
  ok(!moneyHubModel(E.metrics(E.createGame({ worldId: 'w1', charId: 'teacher', seed: 1 }))).rows.some((r) => r.id === 'world'), 'w1: no world-panel row');
}
/* 7. worlds wave 2 — w6 (goal: net worth ₪80M, lines valued by profit and condition): rule, gap, ★★★ module gate when the engine exposes it,
   the 💼 "קווי ייצור" row (engine values only) */
{
  const { moneyHubModel, milestoneLadder } = await import('../js/hudgoal.js');
  await E.ensureWorld('w6');
  for (const ch of ['opseng', 'heir', 'trader']) {
    const st = E.createGame({ worldId: 'w6', charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 120 && st.month < 4 && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    }
    const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w6'), st.charId, m.rules) });
    const p = M.parts[0] || {};
    ok(m.goalType === 'netWorth' && p.key === 'netWorth' && p.target === 80000000 && p.targetText === E.fmtM(80000000), `w6/${ch}: one net-worth part, target ₪80M`, p);
    ok(M.rule.includes(p.targetText) && (M.met || (M.gaps[0] && M.gaps[0].includes(E.fmtM(p.target - p.value)))), `w6/${ch}: the rule names ₪80M and the gap = target − value`, { rule: M.rule, gaps: M.gaps });
    ok(milestoneLadder(m).some((x) => /שווי נקי של/.test(x.title)), `w6/${ch}: the ladder speaks of net worth`);
    const sg = (m.worldIndicators.plant || {}).starGate;
    const g3 = M.stars ? M.stars[2].gates : [];
    ok(sg ? g3.some((x) => x.key === sg.id && x.ok === !!sg.ok && !/^★/.test(x.text)) : g3.every((x) => x.key === 'fund' || x.key === 'happy'), `w6/${ch}: the ★★★ row shows the module gate exactly when the engine exposes it (${sg ? 'exposed' : 'not exposed'})`, g3);
    const H = moneyHubModel(m); const wr = H.rows.find((r) => r.id === 'world');
    const P = m.worldIndicators.plant;
    ok(wr && wr.icon === '🏭' && wr.title === m.worldIndicators.panel.title && wr.value.startsWith(`${P.lines} מתוך ${P.slots} קווים`) && wr.acts[0].act === 'world', `w6/${ch}: 💼 has the "קווי ייצור" row (lines / slots from the engine)`, wr);
  }
}
console.log(`hud_goal: ${n - fails}/${n} passed (${checks} mid-game checks, ${wins} won games, ${agree} star predictions = engine, ${debts} debt chips)`);
process.exit(fails ? 1 : 0);
