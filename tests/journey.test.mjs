// wave 3a (J1 P0 / P1, game screen) — Node checks of the pure display models. Run: node tests/journey.test.mjs
//  J-ms   : the near-goal ladder (hudgoal milestoneLadder / nextMilestone) is built from E.metrics values only — every rung's value is
//           the engine's own number, `met` is the plain comparison, the next rung is the first unmet one; for every world over seeded
//           games (states every few rolls); null for the benchmark race.
//  J-hub  : the money hub model (moneyHubModel): rows fund → loans → index → plan → focus, values = engine metrics, actions enabled
//           exactly as the engine flags say, every act id is one game.js dispatches to an existing engine call.
//  J-les  : the 13 misleading lesson titles / texts (J1 §2.4) are overridden for display; every override id is a real engine lesson;
//           nothing else changes; no absolute wording left in those texts.
//  J-sum  : the focused end lesson (summary.js focusedLesson) names the month and the card instead of "בפעם הבאה: השאיר אותך בלי כרית".
//  J-pin  : no pinned file changed for this (build-edge --check) and SAVE_VERSION is still 4.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const E = await import('../js/engine.js');
const H = await import('../js/hudgoal.js');
const LM = await import('../js/data/lessons-meta.js');
const SUM = await import('../js/summary.js');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };

/* J-ms */
function step(st, k) {
  if (st.phase === 'roll') E.rollDice(st);
  let ev = E.landing(st) || E.currentEvent(st); let g = 0;
  while (ev && !st.over && g++ < 50) {
    const os = ev.options.filter((o) => o.enabled !== false); if (!os.length) break;
    let r = null; for (let j = 0; j < os.length; j++) { r = E.choose(st, ev, os[(k + g + j) % os.length].id, { qty: 1 }); if (!r || r.ok !== false) break; }
    ev = (r && r.event) || E.currentEvent(st);
  }
}
let states = 0, seenIds = new Set();
for (const w of ['w1', 'w2', 'w3', 'w4']) {
  for (const seed of [3, 44, 555]) {
    const st = E.createGame({ worldId: w, seed, mode: 'free' });
    for (let k = 0; k < 90 && !st.over; k++) {
      step(st, k);
      if (k % 6) continue;
      const m = E.metrics(st); const L = H.milestoneLadder(m); const nx = H.nextMilestone(m); states++;
      const part = (key) => (m.goalParts || []).find((p) => p.key === key);
      for (const x of L) {
        seenIds.add(w + ':' + x.id);
        if (x.id.startsWith('fund')) ok(x.value === Math.round(m.emergency.months * 10) / 10 && x.met === (m.emergency.months >= x.target), `${w}/${seed}@${k} ${x.id} = metrics.emergency.months`);
        else if (x.id === 'asset1') ok(x.met === (m.assets || []).some((a) => a.cf > 0), `${w}/${seed}@${k} asset1 = an asset with cf > 0`);
        else if (/^(passive|netWorth|impact)\d+$/.test(x.id)) { const p = part(x.id.replace(/\d+$/, '')); const f = +x.id.match(/\d+$/)[0] / 100;
          ok(p && x.value === p.value && x.met === (p.value >= p.target * f && (p.key !== 'passive' || p.value > 0)), `${w}/${seed}@${k} ${x.id} = goalParts value vs ${f} × target`); }
        else if (x.id === 'hold') ok(x.met === ((m.goalHold.streak || 0) >= m.goalHold.need), `${w}/${seed}@${k} hold = goalHold`);
      }
      const i = L.findIndex((x) => !x.met);
      ok(i < 0 ? nx === null : nx && nx.id === 'ms:' + L[i].id && nx.step === i + 1 && nx.of === L.length, `${w}/${seed}@${k} next = the first unmet rung`);
      ok(!nx || (nx.title && nx.valText && nx.valText.length < 40), `${w}/${seed}@${k} the HUD line is short`);
    }
  }
}
ok(states > 100, `ladder checked on ${states} states`);
for (const id of ['w1:passive25', 'w3:netWorth50', 'w4:impact25', 'w2:fund3']) ok(seenIds.has(id), 'rung seen: ' + id);
ok(H.nextMilestone({ goalType: 'benchmark', goalParts: [{ key: 'benchmark', value: 1, target: 2 }] }) === null, 'benchmark race: no ladder');

/* J-hub */
{
  const st = E.createGame({ worldId: 'w1', seed: 9, mode: 'free' }); for (let k = 0; k < 12; k++) step(st, k);
  if (st.phase === 'roll') E.takeLoan(st);
  const m = E.metrics(st); const M = H.moneyHubModel(m);
  ok(M.rows.map((r) => r.id).join() === 'fund,loans,index,plan,focus', 'hub rows in order: ' + M.rows.map((r) => r.id).join());
  const acts = new Set(M.rows.flatMap((r) => r.acts.map((a) => a.act)));
  for (const a of acts) ok(['save', 'unsave', 'loan', 'repay', 'credit', 'invest', 'plan', 'focus'].includes(a), 'hub act is an existing game.js flow: ' + a);
  const A = (id) => M.rows.flatMap((r) => r.acts).find((a) => a.act === id);
  ok(A('save').on === m.cash > 0 && A('unsave').on === m.emergency.balance > 0 && A('loan').on === (m.canBorrow !== false) && A('repay').on === !!m.canRepay, 'hub enable flags = engine flags');
  ok(M.rows[1].value.includes(E.fmtM(m.loans)) || !m.loans, 'loans row shows metrics.loans');
  ok(M.rows[2].value.includes(String(m.index.qty)), 'index row shows the units');
  ok(M.rows[3].value === m.life.plans.find((p) => p.id === m.life.plan).label, 'plan row = the current plan label');
}

/* J-les */
const ids = new Set(E.LESSONS.map((l) => l.id));
const D = LM.LESSON_DISPLAY;
ok(Object.keys(D).length === 11, 'display overrides: 11 ids (13 J1 items, 2 of them are sim lines)');
for (const id of Object.keys(D)) ok(ids.has(id), 'override id is an engine lesson: ' + id);
for (const l of E.LESSONS) { const d = LM.displayLesson(l); ok(D[l.id] ? (d.title === (D[l.id].title || l.title) && d.text === (D[l.id].text || l.text)) : d === l, 'displayLesson ' + l.id); }
const T = (id) => LM.displayLesson(E.LESSONS.find((l) => l.id === id));
ok(T('good_debt').title === 'מתי הלוואה משתלמת?' && T('buy_the_dip').title === 'ירידה: הזדמנות או מלכודת?' && T('giving').title === 'נתינה והשפעה לאורך זמן', 'the three retitled lessons');
ok(!/מפספס את העלייה שבאה/.test(T('panic_selling').text) && /עשוי/.test(T('tax_refund').text) && /פחות סביר/.test(T('diversification').text) && /ולפעמים/.test(T('power_law').text)
  && /עלולה/.test(T('emergency_fund').text) && /לפעמים אומרים לא/.test(T('ask_raise').text) && /קשה מאוד/.test(T('time_in_market').text) && /יכולה להחזיר/.test(T('human_capital').text), 'absolute wordings softened');
for (const id of ['human_capital', 'asset_liability', 'passive_income']) ok(LM.LESSON_META[id].sim, 'game-vs-reality line: ' + id);

/* J-sum */
{
  const recap = { suggestion: { rule: 1, text: 'בפעם הבאה: השאיר אותך בלי כרית', k0: 17 }, decisions: [{ m: 23, c: 'מכונית חדשה', o: 'loan', k0: 17 }], grid: {} };
  const s = SUM.suggestionOf({ recap });
  ok(s.text === 'בחודש 23, בכרטיס "מכונית חדשה": כמעט לא נשארה לך כרית ביטחון. זה הלקח לפעם הבאה.', 'old engine text → month + card + clause: ' + s.text);
  ok(s.k0 === 17, 'the rewind point is kept');
  const s2 = SUM.suggestionOf({ recap: { suggestion: { rule: 1, text: 'בפעם הבאה: היה עדיף: לוותר', k0: null }, decisions: [] } });
  ok(s2.text === 'הלקח לפעם הבאה: היה עדיף "לוותר".', 'no decision found → still a sentence: ' + s2.text);
  const fresh = { rule: 1, text: 'בחודש 5, בכרטיס "x": y. זה הלקח לפעם הבאה.', k0: 1 };
  ok(SUM.suggestionOf({ recap: { suggestion: fresh } }) === fresh, 'a newer engine text passes unchanged');
}

/* J-pin */
let pin = ''; try { pin = execFileSync('node', [resolve(ROOT, 'tools/build-edge.mjs'), '--check'], { encoding: 'utf8' }); } catch (e) { pin = 'ERR ' + (e.stdout || '') + (e.stderr || ''); }
ok(/✓ verify-result pins the current engine/.test(pin), 'build-edge --check: ' + pin.trim().slice(0, 100));
ok(E.SAVE_VERSION === 4, 'SAVE_VERSION unchanged (4)');
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
