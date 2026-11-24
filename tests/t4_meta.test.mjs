// T4 lobby-lane unit tests (spec §16 T-M1…T-M6 + practice data AC-P4). Run: node tests/t4_meta.test.mjs
// Engine-lane checks (T-E*) live in tests/t4_engine.test.mjs; here they are reported as PENDING when the engine part has not landed
// yet (feature detection, never a failure). The library reachability sweep (AC-B3) runs here, against the engine's own lesson list.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, n = 0; const pend = [];
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const pending = (m) => { pend.push(m); console.log('PENDING', m); };

const E = await import('../js/engine.js');
const P = await import('../js/progress.js');
const LIB = await import('../js/library.js');
const EN = await import('../js/energy.js');
const { LESSON_META, CATS, catName } = await import('../js/data/lessons-meta.js');
const { CHAR_META } = await import('../js/data/characters-meta.js');
const PR = await import('../js/practice.js');

/* ---------------- T-M1 progress.js */
store['rr2-progress'] = JSON.stringify({ v: 1, stars: { w1: 2 }, gamesPlayed: 4, wins: 2, tutorialDone: true, achievements: ['first_asset'], custom: 'kept' });
P._reset(JSON.parse(store['rr2-progress']));
let p = P.getProgress();
eq([p.learnGames, p.dream, p.dreams, p.tutorialReplay, p.lastMode, p.mentorPref, p.gamesPlayed, p.stars.w1, p.custom], [0, null, {}, false, 'normal', null, 4, 2, 'kept'], 'T-M1 old rr2-progress reads with T4 defaults, nothing dropped');
// review m-7: start from tutorialDone:false; snapshot AFTER the in-game achievement so a leaked end-payload achievement is caught
P._reset({ ...JSON.parse(store['rr2-progress']), tutorialDone: false });
P.beginSession(); P.addAchievements(['golden']);
const before = P.getProgress();
const r = P.recordLearnGame({ worldId: 'w1', charId: 'driver', status: 'won', stars: 3, months: 30, seed: 5, netWorth: 1000, achievements: ['no_trap'], end: { achievements: ['first_win'] } });
const after = P.getProgress();
const changed = Object.keys(after).filter((k) => k !== 'dirty' && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
eq(changed.sort(), ['cleared', 'endSigs', 'lastChar', 'learnGames', 'tutorialDone'].sort(), 'T-M1 recordLearnGame changes only learnGames / tutorialDone / lastChar / cleared (P0: a practice escape finishes the world)');
ok(!after.achievements.includes('no_trap') && !after.achievements.includes('first_win'), 'T-M1 a learning game\'s end-payload achievements are never recorded');
eq([r.learn, r.wouldStars, r.worldId, r.gained, r.unlockedWorld, r.newAchievements.length], [true, 3, 'w1', 0, null, 0], 'T-M1 recordLearnGame result');
eq(P.recordLearnGame({ worldId: 'w1', charId: 'driver', status: 'won', stars: 3, months: 30, seed: 5, netWorth: 1000 }).learnGames, 1, 'same learning game twice is counted once');
P.requestTutorialReplay(); eq([P.consumeTutorialReplay(), P.consumeTutorialReplay()], [true, false], 'T-M1 tutorial replay is consumed once');
eq([P.setDream('stable'), P.setDream('nope'), P.getProgress().dream], ['stable', null, null], 'T-M1 setDream validates');
eq([P.setLastMode('learn'), P.setLastMode('x')], ['learn', 'normal'], 'setLastMode');
eq([P.setMentorPref('hint'), P.setMentorPref('boss')], ['hint', null], 'setMentorPref');
// review M-3: a server profile with finished games marks the tutorial done (a restore on a new device is not re-onboarded)
P._reset({ tutorialDone: false, gamesPlayed: 0 });
eq(P.firstEverGame(), true, 'M-2 brand-new player: first-ever game');
P.mergeProfile({ stars: {}, achievements: [], meta: { games: 12, wins: 4, best: {} } });
eq([P.getProgress().tutorialDone, P.getProgress().gamesPlayed, P.firstEverGame()], [true, 12, false], 'M-3 mergeProfile(meta.games > 0) → tutorialDone, and no free tutorial rolls');
P._reset({ tutorialDone: false, learnGames: 1 }); eq(P.firstEverGame(), false, 'M-2 a learning game already played → not the first-ever game');
P._reset({ tutorialDone: true, gamesPlayed: 3, tutorialReplay: true }); eq(P.firstEverGame(), false, 'M-2 a replayed tutorial is not the first-ever game');
P._reset({ ...JSON.parse(store['rr2-progress']), dream: 'someday', dreams: { someday: { done: ['x_1'], games: 1 } } });
eq([P.getProgress().dream, P.getProgress().dreams.someday.done], ['someday', ['x_1']], 'nit 9: an unknown (future engine) dream id is kept on load');
P.setDream(null);
const dEnd = { mode: 'free', worldId: 'w1', charId: 'teacher', seed: 9, status: 'lost', months: 52, dream: { id: 'biz', missions: [{ id: 'biz_seed', done: true }, { id: 'biz_own', done: false }] } };
P.recordDream(dEnd);
eq(P.recordDream({ ...dEnd }), null, 'm-9 the same game:end twice is recorded once');
P.recordDream({ mode: 'free', learn: true, dream: { id: 'biz', missions: [{ id: 'biz_own', done: true }] } });
eq(P.getProgress().dreams.biz, { done: ['biz_seed'], games: 1 }, 'recordDream: normal games only, merged badges, counted once');
const synced = JSON.stringify(Object.keys((await import('../js/progress.js')).getProgress()));
ok(!/learnGames|mentorPref/.test(readFileSync(join(ROOT, 'js/progress.js'), 'utf8').match(/const profileMeta = [^\n]*/)[0]), 'T4 fields are not in profileMeta() (never synced; was metaOf before worlds wave 0)'); void synced;

/* ---------------- T-M2 lessons-meta.js */
const ids = E.LESSONS.map((l) => l.id);
const missing = ids.filter((id) => !LESSON_META[id] || !LESSON_META[id].teaser || !LESSON_META[id].hint);
eq(missing, [], `T-M2 every engine lesson (${ids.length}) has teaser + hint`);
// review M-1: meta written ahead of an engine lane (T3 lessons) is PENDING until that engine work is committed — not a failure
for (const id of Object.keys(LESSON_META).filter((x) => !ids.includes(x))) pending(`T-M2 lessons-meta has '${id}'; the engine has no such lesson yet (engine lane, T3)`);
const trig = [...new Set(PR.PRACTICE.flatMap((x) => x.after))];
eq(trig.filter((id) => !(LESSON_META[id] && LESSON_META[id].example)), [], 'T-M2 / AC-B5 every practice-trigger lesson has a worked example');
eq(trig.filter((id) => !ids.includes(id)), [], 'practice triggers are real lesson ids');
const cats = [...new Set(E.LESSONS.map((l) => l.cat))];
eq(cats.filter((c) => !CATS[c] || /[A-Za-z]/.test(CATS[c])), [], 'T-M2 / AC-B1 CATS cover every category, Hebrew only');
eq([catName('business'), catName('zzz')], ['🏪 עסקים', '📚 שיעורים'], 'business name + fallback never the raw key');
ok(Object.values(LESSON_META).every((m) => [m.teaser, m.hint, m.example, m.sim].filter(Boolean).every((t) => !/אנרגי/.test(t))), 'no "אנרגיה" in lesson meta');

/* ---------------- T-M3 library.js */
store['rr2-library'] = JSON.stringify({ ids: ['cashflow', 'gross_net'], read: ['gross_net'] });
LIB._reset(); store['rr2-library'] = JSON.stringify({ ids: ['cashflow', 'gross_net'], read: ['gross_net'], extra: 1 });
// re-import to read the v1 value from storage
const LIB2 = await import('../js/library.js?v1');
eq([LIB2.isUnlocked('cashflow'), LIB2.isNew('cashflow'), LIB2.isNew('gross_net'), LIB2.contextOf('cashflow')], [true, true, false, null], 'T-M3 v1 → v2 read');
LIB2.unlock(['inflation'], [{ id: 'inflation', ctx: { month: 13, worldId: 'w1', event: 'סוף שנה', num: { label: 'אינפלציה השנה', value: 3.1 } } }]);
LIB2.unlock(['inflation'], [{ id: 'inflation', ctx: { month: 30, worldId: 'w2', event: 'x', num: null } }]);
const c = LIB2.contextOf('inflation');
eq([c.m, c.w, c.ev, c.num], [13, 'w1', 'סוף שנה', { label: 'אינפלציה השנה', value: 3.1 }], 'T-M3 unlock(ids, list) stores the FIRST ctx');
LIB2.unlock(['cashflow'], [{ id: 'cashflow', ctx: { month: 4, worldId: 'w1', event: 'יום המשכורת', num: null } }]);
eq(LIB2.contextOf('cashflow').m, 4, 'ctx added for an already unlocked lesson that had none');
LIB2.markPracticed('budget', true); LIB2.markPracticed('budget', false); LIB2.markPracticed('BAD id', true);
eq([LIB2.practiceStats(), LIB2.practiceTotals()], [{ budget: { n: 2, right: 1 } }, { n: 2, right: 1 }], 'T-M3 markPracticed / practiceStats');
const saved = JSON.parse(store['rr2-library']);
eq([saved.v, saved.extra, saved.read, saved.ids.includes('gross_net')], [2, 1, ['gross_net'], true], 'AC-R4 written back additively (v2, unknown keys kept)');
eq(LIB2.meta('cashflow').teaser, 'המספר שקובע הכל', 'meta(id)');

/* ---------------- T-M4 characters-meta.js: every ₪ figure matches the engine (rounded to ₪100; millions to 2 decimals) */
const parseNis = (t) => [...t.matchAll(/[+−-]?₪([\d,.]+)( מיליון)?/g)].map((m) => ({ txt: m[0], v: parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1e6 : 1) }));
for (const [key, m] of Object.entries(CHAR_META)) {
  const [wid, cid] = key.split(':'); const w = E.getWorld(wid); const ch = w.characters.find((x) => x.id === cid);
  ok(!!ch, `T-M4 ${key} exists`); if (!ch) continue;
  const cc = E.characterCard(w, ch); const st = E.createGame({ worldId: wid, charId: cid, seed: 1 }); const met = E.metrics(st);
  const known = [cc.cash, cc.expenses, Math.abs(cc.surplus), Math.abs(met.cashflow), cc.salary, ...st.assets.map((a) => E.assetCf(st, a)), ...(ch.assets || []).map((a) => a.cf)]
    .map((x) => Math.abs(Math.round(x || 0)));   // asset cf: live and nominal (the card's figure; FX moves the live one)
  for (const f of [...parseNis(m.strength), ...parseNis(m.weakness)]) {
    const hit = known.some((k) => (f.v >= 1e6 ? Math.abs(k - f.v) <= 0.005e6 : Math.round(k / 100) * 100 === f.v));
    ok(hit, `T-M4 ${key}: ${f.txt} matches an engine figure (${known.join(', ')})`);
  }
}
// review M-5 (T-M4b): every comparative claim ("הכי …") is re-derived from the world data. An unknown phrasing fails, so a new
// claim must be added here with its rule.
const SUPER = [
  [/הכי הרבה זמן/, 'maxMonths', 'max'], [/קו הסיום הכי קצר/, 'maxMonths', 'min'], [/המשכורת הכי גבוהה/, 'salary', 'max'],
  [/ההוצאות הכי גבוהות/, 'expenses', 'max'], [/הכי הרבה (הון|כסף)/, 'cash', 'max'], [/הכי מעט כסף/, 'cash', 'min'],
];
for (const [key, m] of Object.entries(CHAR_META)) {
  const [wid, cid] = key.split(':'); const w = E.getWorld(wid);
  const val = (c, f) => { const cc = E.characterCard(w, c); return f === 'maxMonths' ? E.starThresholds(w, c.id).maxMonths : f === 'salary' ? (cc.salaryUsd ? cc.salaryUsd * 3.6 : cc.salary) : cc[f]; };
  for (const line of [m.strength, m.weakness]) {
    if (!/הכי/.test(line)) continue;
    const rule = SUPER.find(([re]) => re.test(line));
    ok(!!rule, `T-M4b ${key}: unclassified comparative claim "${line}" — add its rule to SUPER`);
    if (!rule) continue;
    const [, f, dir] = rule; const mine = val(w.characters.find((c) => c.id === cid), f);
    const all = w.characters.map((c) => val(c, f));
    ok(dir === 'max' ? mine === Math.max(...all) : mine === Math.min(...all), `T-M4b ${key}: "${line}" — ${f} ${mine} is the ${dir} of ${JSON.stringify(all)}`);
  }
}
ok(/64 חודשים/.test(CHAR_META['w1:driver'].strength) && (E.getWorld('w1').characters.find((c) => c.id === 'driver').maxMonths ?? E.getWorld('w1').maxMonths) === 64, 'T-M4 driver 64 months');

/* ---------------- T-M5 energy.js labels */
eq([EN.NAME, EN.ONE, EN.ICON, EN.label(1), EN.label(3), EN.label(25)], ['זריקות', 'זריקה', '⚡', 'זריקה אחת', '3 זריקות', '25 זריקות'], 'T-M5 energy labels');

/* ---------------- T-M6 naming lint: string literals in js/** and index.html */
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
walk(join(ROOT, 'js')); files.push(join(ROOT, 'index.html'));
// allow-list: real-world energy industry (w4 pitch sector, the 2022 history headline). Other lanes' strings are PENDING, not failures.
const ALLOW = [/מחירי האנרגיה/, /סקטור.{0,20}אנרגיה|אנרגיה.{0,6}(סולארית|ירוקה|מתחדשת)/, /\bsector:\s*'אנרגיה'/];   // w4 pitch sector definition only
const OTHER_LANE = { 'js/ui.js': 'in-game UI lane (N14)', 'index.html': 'in-game UI lane (N15, set at runtime by ui.js)', 'js/finance/business.js': 'engine lane (N18)' };
const MINE = ['js/lobby.js', 'js/progress.js', 'js/energy.js', 'js/library.js', 'js/net.js', 'js/game.js', 'js/main.js', 'js/onboard.js', 'js/practice.js', 'js/data/lessons-meta.js', 'js/data/characters-meta.js'];
for (const f of files) {
  const rel = f.slice(ROOT.length + 1); const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (!/אנרגי/.test(line) || /^\s*\/\//.test(line) || ALLOW.some((a) => a.test(line))) return;
    if (MINE.includes(rel)) ok(false, `T-M6 ${rel}:${i + 1} user-facing "אנרגיה": ${line.trim().slice(0, 100)}`);
    else pending(`T-M6 ${rel}:${i + 1} "אנרגיה" — ${OTHER_LANE[rel] || 'other lane'}`);
  });
  if (MINE.includes(rel)) {
    const bad = src.split('\n').map((l, i) => [l, i + 1]).filter(([l]) => /⚡.{0,12}כוח|כוח.{0,12}⚡/.test(l) && !/לא ⚡|— לא ⚡|≠ ⚡|לא ⚡ זריקות/.test(l) && !/^\s*\/\//.test(l));
    eq(bad.map(([, i]) => `${rel}:${i}`), [], `T-M6 ${rel}: ⚡ never next to כוח as one meaning`);
  }
}
eq(MINE.filter((f) => /אנרגי/.test(readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))), [], 'AC-N1 no "אנרגיה" in any T4 file');

/* ---------------- practice data (AC-P4) + selector (AC-P1/P2, pure part) */
eq(PR.PRACTICE.length, 24, '24 items');
for (const it of PR.PRACTICE) {
  ok(it.answers.length === 3 && [0, 1, 2].includes(it.c) && it.why.length <= 90 && PR.TOPICS[it.topic], `AC-P4 ${it.id} shape (why ${it.why.length})`);
}
const num = (s) => parseFloat(String(s).replace(/[₪,]/g, ''));
const A = Object.fromEntries(PR.PRACTICE.map((x) => [x.id, num(x.answers[x.c])]));
eq([A.budget_a, A.budget_b, A.debt_b, A.cmp_a, A.tax_a, A.tax_b, A.risk_a, A.prof_a], [8000 - 6500 - 250, 12000 - 11400 - 200, 12 * 330 - 3600, 1000 * 1.05 * 1.05, 59 * 18 / 118, 1000 * 0.69, 0.5 * 250, 60000 - 20000 - 35000], 'AC-P4 numeric answers recomputed');
const st0 = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 7 });
const rng0 = JSON.stringify(st0.rng);
st0.lessons = ['gross_net', 'emergency_fund']; st0.turn = 2;
eq(PR.pickPractice(st0, {}, 7300), null, 'no offer before turn 4');
st0.turn = 5;
const q = PR.pickPractice(st0, {}, 7300);
eq([q.id, q.answers[1], 'c' in q], ['fund_a', '₪21,900', false], 'newest lesson first; {3E} filled; correct index not returned');
eq(PR.pickPractice(st0, { lastTurn: 4, offered: ['fund_a'] }, 7300), null, '≥ 3 turns apart');
eq(PR.pickPractice(st0, { lastTurn: 1, offered: ['fund_a'] }, 7300).id, 'liq_a', 'offered a → the next topic of the same (newest) lesson');
eq(PR.pickPractice(st0, { lastTurn: 1, offered: ['fund_a', 'liq_a'] }, 7300).id, 'budget_a', '… then the older lesson');
eq(PR.pickPractice(st0, { offered: ['a', 'b', 'c', 'd', 'e', 'f'] }, 7300), null, '≤ 6 per game');
for (const lid of ['marginal_overtime', 'side_tax', 'time_scarce', 'rest_value', 'biz_receivables', 'biz_inventory']) {
  const q2 = PR.pickPractice({ ...st0, lessons: [lid], practice: { answered: {} } }, {}, 7300);
  ok(q2 && q2.kind === 'a', `m-2 lesson ${lid} (listed only under a 'b' item) offers its topic's 'a' item (${q2 && q2.id})`);
}
eq(PR.pickPractice({ ...st0, mode: 'daily' }, {}, 7300), null, 'AC-P1 never in ranked');
eq(PR.pickPractice({ ...st0, intro: { step: 'glitch' } }, {}, 7300), null, 'AC-P1 never during the intro');
const ra = PR.recordAnswer(st0, 'fund_a', 1, 5);
eq([ra.ok, ra.right, st0.practice.answered.fund_a, st0.dq.transfer.cushion], [true, true, 1, { n: 1, right: 1 }], 'recordAnswer updates practice + dq.transfer');
eq(PR.recordAnswer(st0, 'fund_a', 0).ok, false, 'answered once only');
st0.turn = 13;
eq(PR.pickPractice(st0, {}, 7300).id, 'fund_b', 'far transfer b after ≥ 8 turns');
eq([JSON.stringify(st0.rng) === rng0, st0.cash], [true, E.createGame({ worldId: 'w1', charId: 'teacher', seed: 7 }).cash], 'AC-P1 no RNG draw, no money effect');

/* ---------------- engine part (pending until it lands) */
if (typeof E.practiceDue !== 'function') pending('E-10 engine practiceDue / answerPractice / replay K');
if (!Array.isArray(E.DREAMS)) pending('E-7 DREAMS / dreamTick / metrics().dream');
if (typeof E.TUTORIAL_FREE_ROLLS !== 'number') pending('E-2 TUTORIAL_FREE_ROLLS (client fallback in game.js usesEnergy is active)');
if (E.rollCost({ mode: 'free', learn: true }) !== 0) pending('E-2 rollCost(st.learn) → 0 (client gate in game.js usesEnergy is active)');
{ const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 1, tutorial: true }); if (!st.intro) pending('E-1/E-3 intro card (createGame({tutorial}) → st.intro)'); }
{ const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 1, mode: 'free', learn: true }); if (st.learn !== true) pending('E-1 createGame({learn:true}) → st.learn'); if (!('learn' in E.replayConfig(st))) pending('E-9 replayConfig().learn'); }

/* ---------------- AC-B3 / §9.2 (T4 verify D5): every engine lesson is reachable in play — a real sweep, not a pending entry.
   Seeded sim games (tools/sim.mjs policies, every world and character), the history scenarios, then a targeted business / story
   pass for the lessons only a managed business or a "more" story choice opens. Stops as soon as every lesson was seen.
   The lesson count comes from the engine (82 today), never a constant. */
{
  const t0 = Date.now();
  const { play, POLICIES } = await import('../tools/sim.mjs');
  await import('../js/worlds/all.js');   // worlds wave 0: the lazy worlds (w5 …) — their lessons are reachable only in their own games
  const WS = (typeof E.loadedWorlds === 'function' ? E.loadedWorlds() : E.WORLDS).map((w) => w.id);
  if (typeof E.loadRealData === 'function') { try { await E.loadRealData(); } catch (e) { /* history scenarios may stay empty offline */ } }
  const all = new Set(E.LESSONS.map((l) => l.id)); const got = new Map();
  const note = (st, tag) => { for (const id of st.lessons || []) if (all.has(id) && !got.has(id)) got.set(id, tag); };
  const done = () => got.size >= all.size;
  const pols = ['random', 'smart', 'reckless', 'cautious', 'greedy', 'guideTapper', 'blindTapper', 'naive'].filter((x) => POLICIES[x]);
  const rnd = (seed) => { let x = seed >>> 0 || 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
  // a game played with random choices (story "more" / partner / lend first, businesses opened and grown): the paths the sim avoids
  const roam = (st, r, bizFirst) => {
    const pick = (ev, k) => {
      const en = ev.options.filter((o) => o.enabled);
      if (k > 4) return en.find((o) => ['ok', 'done', 'pass', 'skip', 'close'].includes(o.id)) || en[0];
      if (bizFirst && ev.type === 'business') return en.find((o) => /open|buy|start|mkt|marketing|grow/.test(o.id)) || en[Math.floor(r() * en.length)];
      return en[Math.floor(r() * en.length)];
    };
    const resolve = (ev) => { let k = 0; while (ev && k++ < 10 && !st.over) { const o = pick(ev, k); if (!o) break; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
    for (let g = 0; g < 400 && !st.over; g++) {
      if (typeof E.inbox === 'function') for (const it of E.inbox(st)) { const en = (it.options || []).filter((o) => o.enabled); const o = en.find((x) => ['more', 'partner', 'lend'].includes(x.id)) || en[Math.floor(r() * en.length)]; if (o) E.resolveStory(st, it.itemId, o.id); if (st.over) break; }
      if (st.pending) resolve(E.currentEvent(st));
      if (st.over) break;
      E.rollDice(st); resolve(E.landing(st));
    }
    return st;
  };
  const stages = [
    ['sim seed 1', function* () { for (const w of WS) for (const ch of E.getWorld(w).characters) for (const pol of pols) yield () => play(w, ch.id, 1000 + pol.length, pol, 120).st; }],
    ['history', function* () { for (const sc of E.scenarioList()) yield () => roam(E.createGame({ mode: 'history', scenarioId: sc.id, seed: 7 }), rnd(8), false); }],
    ['business / story', function* () { for (let s = 0; s < 120; s++) for (const ch of ['founder', 'engineer', 'social', 'teacher', 'dev']) { const w = ['founder', 'engineer', 'social'].includes(ch) ? 'w4' : 'w1'; yield () => roam(E.createGame({ worldId: w, charId: ch, seed: 300 + s, mode: 'free' }), rnd(s + 11), true); } }],
    ['sim seeds 2–3', function* () { for (let k = 1; k <= 2; k++) for (const w of WS) for (const ch of E.getWorld(w).characters) for (const pol of pols) yield () => play(w, ch.id, 1000 + k * 31 + pol.length, pol, 120).st; }],
  ];
  const games = {};
  for (const [name, gen] of stages) {
    if (done()) break;
    games[name] = 0;
    for (const g of gen()) { if (done()) break; let st = null; try { st = g(); } catch (e) { /* a crashing game is the engine suites' business */ } games[name]++; if (st) note(st, name); }
  }
  const miss = [...all].filter((x) => !got.has(x));
  ok(all.size >= 75, `AC-B3 the engine has ≥ 75 lessons (${all.size})`);
  ok(!miss.length, `AC-B3 every lesson is reachable in play: ${got.size}/${all.size} reached; missing ${JSON.stringify(miss)}`);
  console.log(`AC-B3 sweep: ${got.size}/${all.size} lessons reached in ${((Date.now() - t0) / 1000).toFixed(0)} s (${Object.entries(games).map(([k, v]) => `${k}: ${v} games`).join(', ')})`);
}

console.log(fails ? `${fails}/${n} FAILED` : `all ${n} t4_meta tests passed`, pend.length ? `· ${pend.length} pending (other lanes)` : '');
process.exit(fails ? 1 : 0);
