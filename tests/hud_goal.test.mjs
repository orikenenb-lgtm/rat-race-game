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
/* 8. worlds wave 3 — w7 (goal: net worth ₪120M AND liquidity ≥ 4 months of the chain's fixed costs, unit 'months', 99 = no fixed costs yet) and
   w8 (net worth ₪250M with WIP at cost): two parts with their own words (never ₪ for months), the rule, the gaps, the ladder, the 💼 row */
{
  const { moneyHubModel, milestoneLadder, monthsText, NO_FIXED } = await import('../js/hudgoal.js');
  const play = (wid, ch, months) => { const st = E.createGame({ worldId: wid, charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 160 && st.month < months && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    } return st; };
  await E.ensureWorld('w7'); await E.ensureWorld('w8');
  ok(monthsText(NO_FIXED) === 'אין עלויות קבועות' && monthsText(3.04) === '3 חודשים' && monthsText(7.69) === '7.7 חודשים', 'monthsText: 99 = no fixed costs, else months (1 decimal)');
  for (const ch of ['shopFounder', 'cfo', 'franchisor']) {
    const st = play('w7', ch, 5); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w7'), st.charId, m.rules) });
    const nw = M.parts.find((p) => p.key === 'netWorth'), lq = M.parts.find((p) => p.key === 'liquidity'); const eq = (m.goalParts || []).find((p) => p.key === 'liquidity');
    ok(m.goalType === 'all' && M.parts.length === 2 && nw && nw.target === 120000000 && nw.targetText === E.fmtM(120000000), `w7/${ch}: two parts, net worth ₪120M`, M.parts);
    ok(lq && lq.unit === 'months' && lq.target === 4 && lq.targetText === '4 חודשים' && lq.valueText === monthsText(eq.value) && !/₪/.test(lq.valueText + lq.targetText), `w7/${ch}: liquidity in months (${lq && lq.valueText}), never ₪`, lq);
    ok(M.rule.includes('שני יעדים יחד') && M.rule.includes(nw.targetText) && M.rule.includes('4 חודשים'), `w7/${ch}: the rule names both targets`, M.rule);
    ok(lq.met === (eq.value >= 4) && (lq.met || M.gaps.some((g) => g.includes('צריך 4 חודשים'))), `w7/${ch}: the liquidity gap appears exactly when it is short`, M.gaps);
    const L = milestoneLadder(m); ok(L.some((x) => x.id === 'liquidity' && x.unit === 'mo' && x.target === 4) && !L.some((x) => /שווי נקי של/.test(x.title) && x.id.startsWith('liquidity')), `w7/${ch}: one liquidity rung in months, net-worth rungs in ₪`);
    const H = moneyHubModel(m); const wr = H.rows.find((r) => r.id === 'world'); const C = m.worldIndicators.chain;
    ok(wr && wr.icon === '🛍️' && wr.title === m.worldIndicators.panel.title && wr.value.startsWith(`${C.branches} סניפים`) && wr.value.includes(`ניהול ${C.branches}/${C.span}`) && wr.value.includes(monthsText(C.liqMonths)) && wr.acts[0].act === 'world', `w7/${ch}: 💼 "הרשת" row from the engine (branches, span, liquidity)`, wr);
  }
  for (const ch of ['developer', 'landowner', 'contractor']) {
    const st = play('w8', ch, 4); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w8'), st.charId, m.rules) });
    const p = M.parts[0] || {};
    ok(m.goalType === 'netWorth' && M.parts.length === 1 && p.target === 250000000 && M.rule.includes(p.targetText), `w8/${ch}: one net-worth part, ₪250M, the rule`, p);
    ok(M.met || (M.gaps[0] && M.gaps[0].includes(E.fmtM(p.target - p.value))), `w8/${ch}: the gap = target − value`, M.gaps);
    const H = moneyHubModel(m); const wr = H.rows.find((r) => r.id === 'world'); const PJ = m.worldIndicators.proj;
    ok(wr && wr.icon === '🏗️' && wr.title === m.worldIndicators.panel.title && wr.value.includes(`ריבית ${PJ.rate}%`) && wr.value.startsWith(String(PJ.open)) && wr.acts[0].act === 'world', `w8/${ch}: 💼 "הפרויקטים" row from the engine (open, rate)`, wr);
  }
}
/* 9. worlds wave 4 — w9 (goal passiveTarget: run-rate operating income after debt service ≥ ₪3.5M a month, hold 3) and w10 (net worth ₪400M,
   ★★★ also without a forced sale): the rule, the gap, the ladder, the ★★★ gate, the 💼 rows (engine values only) */
{
  const { moneyHubModel, milestoneLadder } = await import('../js/hudgoal.js');
  const play = (wid, ch, months) => { const st = E.createGame({ worldId: wid, charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 160 && st.month < months && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    } return st; };
  await E.ensureWorld('w9'); await E.ensureWorld('w10');
  for (const ch of ['gridEng', 'infraFund', 'kibbutz']) {
    const st = play('w9', ch, 5); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w9'), st.charId, m.rules) });
    const p = M.parts[0] || {};
    ok(m.goalType === 'passiveTarget' && M.parts.length === 1 && p.key === 'opIncome' && p.target === 3500000 && p.label === 'הכנסה תפעולית אחרי החזר חוב', `w9/${ch}: one part, operating income after debt service ₪3.5M`, p);
    ok(M.rule.includes(p.targetText) && M.rule.includes('אחרי החזר החוב') && M.rule.includes('חודש שמשי'), `w9/${ch}: the rule (run-rate, after debt service, no sunny month)`, M.rule);
    ok(M.met || (M.gaps[0] && M.gaps[0].includes(E.fmtM(p.target - p.value)) && M.gaps[0].includes('בחודש')), `w9/${ch}: the gap = target − value, a month`, M.gaps);
    const L = milestoneLadder(m); ok(L.filter((x) => x.id.startsWith('opIncome')).length === 3 && L.some((x) => /הכנסה תפעולית של/.test(x.title)), `w9/${ch}: the ladder has the ¼ / ½ / ¾ operating-income rungs`, L.map((x) => x.title));
    const H = moneyHubModel(m); const wr = H.rows.find((r) => r.id === 'world'); const EN = m.worldIndicators.energy;
    ok(wr && wr.icon === '☀️' && wr.title === m.worldIndicators.panel.title && wr.value.includes(E.fmtM(EN.income)) && wr.value.includes(`ריבית ${EN.rate}%`) && wr.acts[0].act === 'world', `w9/${ch}: 💼 "התחנות והפרויקטים" row from the engine (income, target, rate)`, wr);
  }
  for (const ch of ['allocator', 'blockHeir', 'floorTrader']) {
    const st = play('w10', ch, 4); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w10'), st.charId, m.rules) });
    const p = M.parts[0] || {};
    ok(M.parts.length === 1 && p.key === 'netWorth' && p.target === 400000000 && M.rule.includes(p.targetText) && M.rule.includes('שווי נקי'), `w10/${ch}: one net-worth part, ₪400M, the rule`, { goalType: m.goalType, rule: M.rule });
    const g3 = (M.stars[2].gates || []).find((g) => g.key === 'noForced'); const F = m.worldIndicators.portfolio.forced;
    ok(g3 && g3.text === 'בלי אף מכירה כפויה' && g3.ok === !F, `w10/${ch}: the ★★★ gate "בלי אף מכירה כפויה" = the engine's forced count (${F})`, g3);
    const H = moneyHubModel(m); const wr = H.rows.find((r) => r.id === 'world'); const PF = m.worldIndicators.portfolio;
    ok(wr && wr.icon === '📊' && wr.title === 'הבורסה והתיק' && wr.value.includes(E.fmtM(PF.nw)) && wr.value.includes(`מינוף ${Math.round(PF.ltv * 100)}%`) && wr.acts[0].act === 'world', `w10/${ch}: 💼 "הבורסה והתיק" row from the engine (net worth, LTV)`, wr);
  }
}
/* 10. w13 (goal all: nw ₪450M at book AND wageRatio12 ≤ 0.70, cmp 'le'): the ratio part in %, never ₪; met when at most the target; the gap
   above it in points; the rule (the squad at book, both bars); one ⚖️ ladder rung (no quarters); the 💼 "המועדון והטבלה" row */
{
  const { moneyHubModel, milestoneLadder, nextMilestone } = await import('../js/hudgoal.js');
  await E.ensureWorld('w13');
  const play = (ch, months) => { const st = E.createGame({ worldId: 'w13', charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 200 && st.month < months && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.id === 'walk') || os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    } return st; };
  for (const ch of ['coachOwner', 'localTycoon', 'academyDirector']) {
    for (const months of [1, 8]) {
      const st = play(ch, months); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w13'), st.charId, m.rules) });
      const nw = M.parts.find((x) => x.key === 'netWorth'), wr = M.parts.find((x) => x.key === 'wageRatio12'); const raw = m.goalParts.find((x) => x.key === 'wageRatio12');
      ok(m.goalType === 'all' && nw && wr && nw.target === 450000000 && wr.target === 0.7 && wr.cmp === 'le' && wr.label === 'שכר מול הכנסות (12 חודשים)', `w13/${ch}/m${months}: two parts, ₪450M and wages ≤ 0.70 (cmp le)`, M.parts);
      ok(wr.valueText === `${Math.round(raw.value * 100)}%` && wr.targetText === 'עד 70%' && !/₪/.test(wr.valueText + wr.targetText), `w13/${ch}/m${months}: the ratio in % ("${wr.valueText}" / "${wr.targetText}"), never ₪`, wr);
      ok(wr.met === (raw.value <= 0.7) && Math.abs(wr.gap - Math.max(0, raw.value - 0.7)) < 1e-9, `w13/${ch}/m${months}: met = value ≤ target, gap = value − target`, wr);
      ok(M.rule.includes(nw.targetText) && M.rule.includes('עד 70%') && M.rule.includes('הספרים') && M.rule.includes('שני הפסים'), `w13/${ch}/m${months}: the rule (net worth at book AND wages ≤ 70 %)`, M.rule);
      ok(wr.met || M.gaps.some((g) => g.includes(`${Math.round(raw.value * 100)}%`) && g.includes('70%') && !/₪/.test(g)), `w13/${ch}/m${months}: the wage gap in %, never ₪`, M.gaps);
      const L = milestoneLadder(m); const rung = L.filter((x) => x.id.startsWith('wageRatio12'));
      ok(rung.length === 1 && rung[0].unit === '%' && rung[0].met === (raw.value <= 0.7) && L.filter((x) => /^netWorth/.test(x.id)).length === 3, `w13/${ch}/m${months}: one ⚖️ wage rung (%), the ¼ ½ ¾ net-worth rungs`, L.map((x) => [x.id, x.unit]));
      const nx = nextMilestone(m); ok(!nx || !/₪0\.7|₪1$/.test(nx.valText), `w13/${ch}/m${months}: the next rung never shows a ratio as ₪`, nx);
      const H = moneyHubModel(m); const row = H.rows.find((r) => r.id === 'world'); const LG = m.worldIndicators.league;
      ok(row && row.icon === '🏟️' && row.title === 'המועדון והטבלה' && row.value.includes(`מקום ${LG.rank}`) && row.value.includes(LG.divName) && row.value.includes(`מחזור ${LG.round}/${LG.rounds}`) && row.acts[0].act === 'world', `w13/${ch}/m${months}: 💼 "המועדון והטבלה" row from the engine (rank, tier, round)`, row);
    }
  }
}
/* 11. w11 (goal nw ₪800M, hold 2) and w15 (goal all: stakeValue ₪800M AND liquidity = the app's runway ≥ 12 months, 99 = profitable): the
   stake part in ₪ with its own label / gap / rung titles; the runway reads "רווחית" (never "אין עלויות קבועות"); the rule; the 💼 rows */
{
  const { moneyHubModel, milestoneLadder } = await import('../js/hudgoal.js');
  const play = (wid, ch, months) => { const st = E.createGame({ worldId: wid, charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 200 && st.month < months && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.id === 'pass' || x.id === 'decline') || os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    } return st; };
  await E.ensureWorld('w11'); await E.ensureWorld('w15');
  for (const ch of ['ceo', 'oldExporter', 'pe']) { const st = play('w11', ch, 6); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w11'), st.charId, m.rules) });
    ok(m.goalType === 'nw' && M.parts.length === 1 && M.parts[0].targetText === E.fmtM(800000000) && M.rule.includes(E.fmtM(800000000)), `w11/${ch}: one ₪800M net-worth part and its rule`, M.parts);
    const X = m.worldIndicators.multinational; const row = moneyHubModel(m).rows.find((r) => r.id === 'world');
    ok(row && row.icon === '🌍' && row.title === 'המפה והחברות־הבנות' && row.value.includes(`קשב ${X.used}/${X.slots}`) && row.value.includes(`${X.subs} חברות־בנות`), `w11/${ch}: 💼 row from the engine`, row); }
  for (const ch of ['soloFounder', 'bigTechExec', 'bootstrapper']) for (const months of [1, 7]) {
    const st = play('w15', ch, months); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w15'), st.charId, m.rules) });
    const sv = M.parts.find((p) => p.key === 'stakeValue'), lq = M.parts.find((p) => p.key === 'liquidity'); const raw = m.goalParts.find((p) => p.key === 'liquidity');
    ok(m.goalType === 'all' && sv && lq && sv.label === 'שווי החלק שלך בחברה' && sv.targetText === E.fmtM(800000000) && lq.runway === true, `w15/${ch}/m${months}: stake (₪) + runway parts`, M.parts);
    ok(raw.value >= 99 ? lq.valueText === 'רווחית — המזומן לא נגמר' : lq.valueText === `${Math.round(raw.value * 10) / 10} חודשים`, `w15/${ch}/m${months}: runway "${lq.valueText}" (99 = profitable)`);
    ok(M.rule.includes('החלק שלך בחברה') && M.rule.includes('לא לפי הסבב האחרון') && !/עלויות קבועות/.test(M.rule + M.gaps.join(' ')), `w15/${ch}/m${months}: the rule (stake at the market AND cash months), never "fixed costs"`, M.rule);
    ok(sv.met || M.gaps.some((g) => g.startsWith('החלק שלך בחברה שווה')), `w15/${ch}/m${months}: the stake gap`, M.gaps);
    const L = milestoneLadder(m); ok(L.filter((x) => /^stakeValue/.test(x.id)).every((x) => x.title.startsWith('החלק שלך בחברה שווה')) && L.some((x) => x.id === 'liquidity' && x.title.startsWith('מזומן ל־12')), `w15/${ch}/m${months}: the rungs read the stake / the runway`, L.map((x) => x.title));
    const row = moneyHubModel(m).rows.find((r) => r.id === 'world'); ok(row && row.icon === '☁️' && row.title === 'האפליקציה והגיוסים' && row.acts[0].act === 'world', `w15/${ch}/m${months}: 💼 row`, row);
  }
}
/* 12. w12 (goal all: nw ₪2B + noDefault 24 'default' + liquidity 12 months = coverage 1.0, hold 3) and w16 (all: passive12 ₪5M of farm income +
   noDefault 12 'margin', hold 2): the streak parts read months ("ברצף"), the coverage in months and ×, never ₪ or "fixed costs"; the rules;
   the gaps; the rungs; the 💼 rows */
{
  const { moneyHubModel, milestoneLadder, partTag, meterLabel } = await import('../js/hudgoal.js');
  const play = (wid, ch, months) => { const st = E.createGame({ worldId: wid, charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 300 && st.month < months && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.id === 'pass' || x.id === 'decline') || os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    } return st; };
  await E.ensureWorld('w12'); await E.ensureWorld('w16');
  for (const ch of ['chair', 'activist', 'thirdGen']) for (const months of [1, 13]) {
    const st = play('w12', ch, months); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w12'), st.charId, m.rules) });
    const nw = M.parts.find((p) => p.key === 'netWorth'), nd = M.parts.find((p) => p.key === 'noDefault:default'), lq = M.parts.find((p) => p.key === 'liquidity'); const raw = m.goalParts.find((p) => p.key === 'liquidity');
    ok(m.goalType === 'all' && M.parts.length === 3 && nw && nw.targetText === E.fmtM(2e9) && nd && nd.streak && lq && lq.coverage && !lq.runway, `w12/${ch}/m${months}: three parts (₪2B, the streak, the coverage)`, M.parts);
    ok(nd.valueText === `${Math.round(nd.value)} חודשים` && nd.targetText === '24 חודשים' && !/₪|עלויות קבועות/.test(nd.valueText + nd.targetText + lq.valueText + lq.targetText), `w12/${ch}/m${months}: months, never ₪ / "fixed costs" (${nd.valueText} · ${lq.valueText})`);
    ok(raw.value >= 99 ? lq.valueText === 'אין חוב בערבות — כיסוי מלא' : lq.valueText.includes(`${Math.round(raw.value * 10) / 10} חודשים`) && lq.valueText.includes('כיסוי ×') && lq.targetText === '12 חודשים (כיסוי ×1.00)', `w12/${ch}/m${months}: coverage "${lq.valueText}"`);
    ok(M.rule.startsWith('שלושה יעדים יחד') && M.rule.includes('בלי חדלות פירעון') && M.rule.includes('כיסוי נזילות של ×1') && !/עלויות קבועות/.test(M.rule + M.gaps.join(' ')), `w12/${ch}/m${months}: the rule`, M.rule);
    ok((nd.met || M.gaps.some((g) => g.includes('בלי חדלות פירעון בקבוצה — עוד'))) && (lq.met || M.gaps.some((g) => g.startsWith('כיסוי הנזילות ×'))), `w12/${ch}/m${months}: the gaps`, M.gaps);
    const L = milestoneLadder(m); ok(L.some((x) => x.id === 'noDefault:default' && x.title === '24 חודשים בלי חדלות פירעון בקבוצה' && x.icon === '🛡️') && L.some((x) => x.id === 'liquidity' && x.title.startsWith('כיסוי נזילות ×1')), `w12/${ch}/m${months}: the rungs`, L.map((x) => x.title));
    ok(partTag(m.goalParts[1]) === 'רצף' && partTag(m.goalParts[2]) === 'קופה' && meterLabel(m) === 'יעד הקבוצה', `w12/${ch}: HUD tags / meter label`);
    const X = m.worldIndicators.holding; const row = moneyHubModel(m).rows.find((r) => r.id === 'world');
    ok(row && row.icon === '👑' && row.title === 'מפת הקבוצה והערבויות' && row.value.includes(`דירוג ${X.rating}`) && row.value.includes(`${X.divs} חטיבות`) && row.acts[0].act === 'world', `w12/${ch}/m${months}: 💼 row`, row);
  }
  for (const ch of ['agronomist', 'moshavFarmer', 'agriFund']) for (const months of [1, 9]) {
    const st = play('w16', ch, months); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld('w16'), st.charId, m.rules) });
    const p12 = M.parts.find((p) => p.key === 'passive12'), nd = M.parts.find((p) => p.key === 'noDefault:margin');
    ok(m.goalType === 'all' && M.parts.length === 2 && p12 && p12.label === 'ממוצע 12 חודשים: הכנסת המשק' && p12.targetText === E.fmtM(5e6) && nd && nd.streak && nd.targetText === '12 חודשים', `w16/${ch}/m${months}: the farm income + the margin streak`, M.parts);
    ok(M.rule.includes('הכנסת המשק') && M.rule.includes('בלי שהברוקר סגר גידור בכוח') && !/עלויות קבועות/.test(M.rule + M.gaps.join(' ')), `w16/${ch}/m${months}: the rule`, M.rule);
    ok(nd.met || M.gaps.some((g) => g.includes('בלי שהברוקר סגר גידור בכוח — עוד')), `w16/${ch}/m${months}: the streak gap`, M.gaps);
    const L = milestoneLadder(m); ok(L.filter((x) => /^passive12/.test(x.id)).every((x) => x.title.endsWith('בחודש מהמשק')) && L.some((x) => x.id === 'noDefault:margin' && x.title === '12 חודשים בלי סגירה בכוח של גידור'), `w16/${ch}/m${months}: the rungs`, L.map((x) => x.title));
    ok(partTag(m.goalParts[0]) === 'הכנסה' && partTag(m.goalParts[1]) === 'רצף' && meterLabel(m) === 'הכנסה ורצף', `w16/${ch}: HUD tags / meter label`);
    const row = moneyHubModel(m).rows.find((r) => r.id === 'world'); ok(row && row.icon === '🌾' && row.title === 'השדות והגידור' && row.value.startsWith(m.worldIndicators.harvest.regimeLabel), `w16/${ch}/m${months}: 💼 row`, row);
  }
}
/* 13. w14 / w17 / w18 / w19 / w20: their modValue parts in their own units — w14 equity ₪ + capital ratio % + 12 months without the regulator;
   w17 net worth + drugs that earn (a count); w18 net worth + solvency % + the 12-month combined ratio % (at most); w19 your stake at the market ₪ +
   net debt ÷ EBITDA × (at most); w20 net worth + money managed ₪ — never ₪ for a ratio / multiple / count, never "fixed costs"; the rules, gaps,
   rungs, tags, meter labels, 💼 rows; w20's ★★★ gate (no redemption gate) */
{
  const { moneyHubModel, milestoneLadder, partTag, meterLabel, nextMilestone } = await import('../js/hudgoal.js');
  const play = (wid, ch, months) => { const st = E.createGame({ worldId: wid, charId: ch, seed: 7, mode: 'free' });
    for (let k = 0; k < 300 && st.month < months && !st.over; k++) {
      if (st.phase === 'roll') E.rollDice(st);
      let ev = E.landing(st) || E.currentEvent(st); let g = 0;
      while (ev && !st.over && g++ < 30) { const os = ev.options.filter((o) => o.enabled !== false); const o = os.find((x) => x.id === 'pass' || x.id === 'decline') || os.find((x) => x.primary) || os[0]; if (!o) break; const r = E.choose(st, ev, o.id, { qty: 1 }); ev = (r && r.event) || E.currentEvent(st); }
    } return st; };
  const SP = {
    w14: { chars: ['riskChief', 'familyBanker', 'fintechFounder'], keys: 'equity,capRatio,noDefault:regulator', tags: 'הון,הון,רצף', meter: 'יעד הבנק', rule: ['שלושה יעדים יחד', 'יחס הון לפחות 10%', 'בלי התערבות המפקח'], hub: ['🏦', 'הבנק', 'יחס הון'],
      fmt: (P) => /%$/.test(P[1].valueText) && P[1].targetText === 'לפחות 10%' && P[2].valueText.endsWith('חודשים') && P[2].targetText === '12 חודשים' && P[0].targetText === E.fmtM(7e8), rungs: ['יחס הון של 10% לפחות', '12 חודשים בלי התערבות המפקח'] },
    w17: { chars: ['scientist', 'pharmaVet', 'bioInvestor'], keys: 'netWorth,productsEarning', tags: 'שווי,תרופות', meter: 'שווי ותרופות', rule: ['שני יעדים יחד', '2 תרופות שמרוויחות'], hub: ['🧪', 'המעבדה', 'מרוויחות'],
      fmt: (P) => /תרופות|תרופה אחת/.test(P[1].valueText) && P[1].targetText === '2 תרופות' && !/₪/.test(P[1].valueText + P[1].targetText), rungs: ['תרופה ראשונה שמרוויחה', '2 תרופות שמרוויחות'] },
    w18: { chars: ['actuary', 'topBroker', 'mutualChair'], keys: 'netWorth,solvency,combined12', tags: 'שווי,פירעון,משולב', meter: 'יעד חברת הביטוח', rule: ['שלושה יעדים יחד', 'כושר פירעון לפחות 120%', 'יחס משולב עד 100%'], hub: ['☂️', 'חברת הביטוח', 'כושר פירעון'],
      fmt: (P) => /%$/.test(P[1].valueText) && P[1].targetText === 'לפחות 120%' && /%$/.test(P[2].valueText) && P[2].targetText === 'עד 100%' && P[2].cmp === 'le', rungs: ['כושר פירעון של 120% לפחות', 'יחס משולב של 100% לכל היותר'] },
    w19: { chars: ['founderCeo', 'familyBoard', 'turnaroundCeo'], keys: 'stakeMkt,netDebtEbitda', tags: 'בורסה,חוב', meter: 'בורסה וחוב', rule: ['שני יעדים יחד', 'במחיר הבורסה', 'חוב נטו עד ×3'], hub: ['🔔', 'החברה בבורסה', 'חוב נטו'],
      fmt: (P) => /^(×\d+\.\d\d|אין רווח תפעולי)$/.test(P[1].valueText) && P[1].targetText === 'עד ×3' && P[1].cmp === 'le' && P[0].targetText === E.fmtM(1.5e9), rungs: ['הנפקה בבורסה: הפעמון מצלצל', 'חוב נטו של ×3 לכל היותר מהרווח התפעולי'] },
    w20: { chars: ['quantAnalyst', 'starPicker', 'endowmentPm'], keys: 'netWorth,aum', tags: 'שווי,בניהול', meter: 'שווי וכסף בניהול', rule: ['שני יעדים יחד', 'כסף בניהול'], hub: ['📈', 'הקרן', 'בניהול'],
      fmt: (P) => P[1].targetText === E.fmtM(4e9) && P[1].valueText.startsWith('₪'), rungs: [`${E.fmtM(1e9)} בניהול`] },
  };
  for (const [wid, X] of Object.entries(SP)) { await E.ensureWorld(wid);
    for (const ch of X.chars) for (const months of [1, 9]) {
      const st = play(wid, ch, months); const m = E.metrics(st); const M = goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld(wid), st.charId, m.rules) });
      ok(m.goalType === 'all' && M.parts.map((p) => p.key).join() === X.keys && X.fmt(M.parts), `${wid}/${ch}/m${months}: the parts in their units (${M.parts.map((p) => `${p.valueText} / ${p.targetText}`).join(' ; ')})`, M.parts);
      ok(X.rule.every((w) => M.rule.includes(w)) && !/עלויות קבועות/.test(M.rule + M.gaps.join(' ')), `${wid}/${ch}/m${months}: the rule`, M.rule);
      ok(M.gaps.every((g) => g && !/^חסרים ₪0/.test(g)) && M.parts.every((p) => p.met || M.gaps.length > 0), `${wid}/${ch}/m${months}: the gaps`, M.gaps);
      const L = milestoneLadder(m); ok(X.rungs.every((t) => L.some((x) => x.title === t)), `${wid}/${ch}/m${months}: the rungs`, L.map((x) => x.title));
      const nx = nextMilestone(m); ok(!nx || (nx.valText && !/NaN|undefined/.test(nx.valText)), `${wid}/${ch}/m${months}: the next rung reads (${nx && nx.valText})`);
      ok(m.goalParts.map((p) => partTag(p)).join() === X.tags && meterLabel(m) === X.meter, `${wid}/${ch}: HUD tags / meter label`);
      const row = moneyHubModel(m).rows.find((r) => r.id === 'world'); ok(row && row.icon === X.hub[0] && row.title === X.hub[1] && row.value.includes(X.hub[2]) && row.acts[0].act === 'world' && !/NaN|undefined/.test(row.value), `${wid}/${ch}/m${months}: 💼 row "${row && row.value}"`, row);
      if (wid === 'w20') ok(M.stars[2].gates.some((g) => g.key === 'noGate' && g.ok === !m.worldIndicators.funds.gates), 'w20: ★★★ needs no redemption gate (funds.js starGates)', M.stars[2].gates);
    }
  }
}
console.log(`hud_goal: ${n - fails}/${n} passed (${checks} mid-game checks, ${wins} won games, ${agree} star predictions = engine, ${debts} debt chips)`);
process.exit(fails ? 1 : 0);
