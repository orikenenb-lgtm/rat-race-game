// Unit tests for js/progress.js (Node, no browser). Run: node tests/progress.test.mjs
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const P = await import('../js/progress.js');
let fails = 0; let n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

P._reset();
eq(P.unlockedWorlds(), ['w1'], 'fresh: only w1');
eq(P.title(), 'עכבר', 'fresh title');
ok(P.nextGoal().text.includes('השכונה') || P.nextGoal().text.includes('בשכונה'), 'next goal mentions w1');
ok(P.nextGoal().text.includes('העיר הגדולה'), 'next goal mentions w2');
ok(P.pawnUnlocked('classic') && !P.pawnUnlocked('car'), 'pawns at 0★');

// a loss changes nothing but counters + tutorial
P.beginSession();
let r = P.recordGame({ status: 'lost', stars: 0, months: 60, worldId: 'w1', charId: 'teacher', mode: 'free', netWorth: 1000 });
eq([r.newStars, r.unlockedWorld, P.getProgress().gamesPlayed, P.getProgress().tutorialDone], [0, null, 1, true], 'loss');

// hotfix 2026-11-23: an escape slower than the ★ limit (0★ win) still opens the next world (the map says "לפתוח: לצאת מהשכונה")
{ const snap = JSON.stringify(P.getProgress());
  P.beginSession();
  const r0 = P.recordGame({ status: 'won', stars: 0, months: 55, worldId: 'w1', charId: 'teacher', mode: 'free', netWorth: 50000 });
  eq([r0.newStars, r0.unlockedWorld, P.isUnlocked('w2'), P.isUnlocked('w3')], [0, 'w2', true, false], '0★ escape unlocks w2 only');
  P._reset(JSON.parse(snap)); }
eq(P.unlockedWorlds(), ['w1'], 'restored after the 0★ case');
// in-game achievement then a 2★ win in w1 → w2 unlocks, car pawn, title חוסך, achievements reported
P.beginSession();
const fresh = P.addAchievements(['first_asset', 'nope', 'first_asset']);
eq(fresh.map((a) => a.id), ['first_asset'], 'addAchievements dedupes + ignores unknown');
r = P.recordGame({ status: 'won', stars: 2, months: 22, worldId: 'w1', charId: 'teacher', mode: 'free', netWorth: 90000, end: { achievements: ['zero_debt_win'] } });
eq(r.unlockedWorld, 'w2', 'w2 unlocked');
eq(r.newPawns, ['car'], 'car pawn unlocked at 2★');
eq([r.titleBefore, r.titleAfter], ['עכבר', 'חוסך'], 'title up');
eq(r.newAchievements.map((a) => a.id).sort(), ['first_asset', 'zero_debt_win'], 'session achievements');
eq(P.getProgress().best.w1, 22, 'best months');
ok(P.isUnlocked('w2') && !P.isUnlocked('w3'), 'unlock chain');

// same payload twice → recorded once
const before = P.getProgress().gamesPlayed;
P.recordGame({ status: 'won', stars: 2, months: 24, worldId: 'w1', charId: 'teacher', mode: 'free', netWorth: 90000 });
P.recordGame({ status: 'won', stars: 2, months: 24, worldId: 'w1', charId: 'teacher', mode: 'free', netWorth: 90000 });
eq(P.getProgress().gamesPlayed, before + 1, 'idempotent on duplicate game:end');

// faster win → new best; fewer stars never lowers
r = P.recordGame({ status: 'won', stars: 1, months: 19, worldId: 'w1', charId: 'driver', mode: 'free', netWorth: 1 });
eq([r.newStars, r.newBest, r.prevBest, r.best], [2, true, 22, 19], 'stars max + new best');

// daily in a locked world: banked, does not unlock w4 until w3 is reachable
r = P.recordGame({ status: 'won', stars: 3, months: 20, worldId: 'w3', charId: 'importer', mode: 'daily', resultId: 'x1', netWorth: 1e7 });
eq([r.bankedLocked, P.isUnlocked('w3'), P.isUnlocked('w4')], [true, false, false], 'banked stars in locked world');
r = P.recordGame({ status: 'won', stars: 1, months: 50, worldId: 'w2', charId: 'lawyer', mode: 'free', netWorth: 1 });
eq([r.unlockedWorld, P.isUnlocked('w3'), P.isUnlocked('w4')], ['w3', true, true], 'chain opens w3 and the banked w4');
eq(P.totalStars(), 6, 'total 6');
ok(P.getProgress().achievements.includes('stars6'), 'meta achievement stars6');

// pawns + colours
ok(P.setPawn('rocket'), 'rocket at 6★'); ok(!P.setPawn('crown'), 'crown locked at 6★');
ok(P.setPawnColor('#3b82f6') && !P.setPawnColor('#123456'), 'colour whitelist');

// server merge: max per world + union
P.mergeProfile({ stars: { w1: 3, w2: 0 }, achievements: ['golden', 'bogus'], pawn: 'car', daily_streak: 4, best_streak: 9, last_daily: P.israelDate() });
const pp = P.getProgress();
eq([pp.stars.w1, pp.stars.w2, pp.pawn], [3, 1, 'rocket'], 'merge keeps max + local pawn choice');
ok(pp.achievements.includes('golden') && !pp.achievements.includes('bogus'), 'merge achievements');
eq(P.streakInfo(), { streak: 4, best: 9, playedToday: true, alive: true }, 'streak today');
P.setDaily({ last: '2020-01-01' });
eq(P.streakInfo().streak, 0, 'old streak is broken');

// server meta (games/wins/best) merges as max/max/min
P.mergeProfile({ meta: { games: 99, wins: 40, best: { w1: 12, w2: 80, w3: 30 } } });
const mp = P.getProgress();
eq([mp.gamesPlayed, mp.wins, mp.best.w1, mp.best.w2, mp.best.w3], [99, 40, 12, 50, 20], 'meta merge (max games/wins, min best)');
// bankruptcy → no more bail-out
ok(P.bailoutAvailable(), 'bail-out available before any bankruptcy');
P.recordGame({ status: 'lost', stars: 0, months: 20, worldId: 'w1', charId: 'driver', mode: 'free', netWorth: -79790, end: { reason: 'bankrupt' } });
ok(!P.bailoutAvailable() && P.getProgress().hadBankruptcy, 'bankruptcy recorded');

// Hebrew helpers
eq([P.inW('השכונה'), P.inW('עמק העתיד'), P.fromW('השכונה')], ['בשכונה', 'בעמק העתיד', 'מהשכונה'], 'hebrew prepositions');

// persistence
const saved = JSON.parse(store['rr2-progress']);
eq(saved.stars.w1, 3, 'persisted to localStorage');
// "מה למדתי" — learning across games (engine end.learning, v3.2 shape)
P._reset();
eq(P.recordLearning(null), null, 'learning: missing block → null');
eq(P.recordLearning({ decisionQuality: null, principles: {} }), null, 'learning: empty block → null');
let L1 = P.recordLearning({ decisionQuality: 72, decisions: 10, principles: { cashflow: { mastery: 0.8, n: 4, shown: true }, cushion: { mastery: 0.4, n: 3, shown: true } }, luck: { total: -5000, parts: {} } }, 'g1');
eq([L1.improved, L1.missed && L1.missed.id, L1.strongest && L1.strongest.id], [null, 'cushion', 'cashflow'], 'learning: first game → strongest + missed, nothing improved');
eq(P.recordLearning({ decisionQuality: 72, principles: { cashflow: 0.1 } }, 'g1'), L1, 'learning: same game twice is counted once');
const L2 = P.recordLearning({ decisionQuality: 84, principles: { cushion: 0.75, '<img>': 1, cashflow: { mastery: 'x' } } }, 'g2');
eq([L2.improved && L2.improved.id, L2.improved && L2.improved.from, L2.missed], ['cushion', 0.4, null], 'learning: improvement vs the stored mastery; bad ids / values ignored');
const LS = P.learningSummary();
eq([LS.games, LS.dqAvg, LS.dqLast, LS.dqTrend, LS.principles.map((x) => x.id)], [2, 78, 84, 12, ['cashflow', 'cushion']], 'learning summary');
ok(Math.abs(LS.principles[1].mastery - (0.4 * 3 + 0.75) / 4) < 0.002, 'learning: mastery is decision-weighted');
for (let i = 0; i < 30; i++) P.recordLearning({ decisionQuality: 50 + i, principles: { time: 0.5 } }, 'x' + i);
eq(P.learningSummary().dqHistory.length, 20, 'learning: decision-quality history capped at 20 games');
const stored = JSON.parse(store['rr2-progress']).learn;
ok(stored && stored.principles.time && stored.games === 32, 'learning persisted');
store['rr2-progress'] = JSON.stringify({ learn: { games: 'x', dq: [50, 'y', 900], principles: { ok_id: { m: 2, n: 3 }, 'bad id': { m: 0.5 } } } });
const P2 = await import('../js/progress.js?reload=' + Date.now());
const S2 = P2.learningSummary();
eq([S2.games, S2.dqHistory, S2.principles.map((x) => [x.id, x.mastery])], [0, [50], [['ok_id', 1]]], 'learning: corrupt storage is cleaned on load');


// ---- P0 2026-11-24: finishing a world opens the next one by every route; stuck saves are repaired; rewards once
{
  P._reset({});
  eq(P.unlockedWorlds(), ['w1'], 'P0 fresh: only w1');
  const r = P.recordLearnGame({ worldId: 'w1', charId: 'teacher', status: 'won', stars: 2, months: 40, seed: 7, netWorth: 1 });
  eq([r.unlockedWorld, P.isUnlocked('w2'), P.getProgress().stars.w1, P.getProgress().best.w1 ?? null], ['w2', true, 0, null], 'P0 practice escape opens w2 (no stars, no best)');
  const lost = P.recordLearnGame({ worldId: 'w2', charId: 'teacher', status: 'lost', months: 60, seed: 8, netWorth: 1 });
  eq([lost.unlockedWorld, P.isUnlocked('w3')], [null, false], 'P0 a practice loss opens nothing');
  // every boundary w1→w2→w3→w4 in normal games, 0★ escapes, reward once on a duplicate end
  P._reset({});
  for (const [w, nx] of [['w1', 'w2'], ['w2', 'w3'], ['w3', 'w4']]) {
    const g = { worldId: w, charId: 'x', mode: 'free', status: 'won', stars: 0, months: 99, netWorth: 5 };
    const a = P.recordGame(g); const games = P.getProgress().gamesPlayed; const b = P.recordGame(g);
    eq([a.unlockedWorld, P.isUnlocked(nx), b === a, P.getProgress().gamesPlayed === games], [nx, true, true, true], `P0 ${w} → ${nx} opens, a duplicate end is recorded once`);
  }
  // stuck save from before the fix: a practice escape left only its learning signature
  P._reset({ learn: { games: 1, dq: [70], principles: {}, lastSig: '|learn|w1|123|38|won' } });
  eq([P.isUnlocked('w2'), P.getProgress().cleared], [true, { w1: true }], 'P0 repair: the last practice escape (learning signature) opens w2');
  P._reset({ learn: { games: 1, dq: [70], principles: {}, lastSig: '|learn|w1|123|38|lost' } });
  eq(P.isUnlocked('w2'), false, 'P0 repair: a practice loss is not an escape');
  P._reset({ cleared: { w1: 'yes', w99: true, w2: true } });
  eq(P.getProgress().cleared, { w2: true }, 'P0 cleared keeps only known worlds with a literal true');
  // pre-hotfix 0★ escape (best recorded, 0 stars) is healed by the rule itself
  P._reset({ stars: { w1: 0 }, best: { w1: 61 } });
  eq(P.isUnlocked('w2'), true, 'P0 repair: a 0★ escape from before PR #7 opens w2');
  P._reset({});
}

// ---- P0b 2026-11-24: a game end is recorded once, also across a reload (persistent end signatures)
{
  P._reset({});
  const g = { worldId: 'w1', charId: 'teacher', mode: 'free', status: 'won', stars: 1, months: 50, netWorth: 9, seed: 4242 };
  const a = P.recordGame(g);
  P._reset(P.getProgress());   // = a reload (in-memory dedupe gone)
  const b = P.recordGame(g);
  const p = P.getProgress();
  eq([a.unlockedWorld, b.duplicate, b.unlockedWorld, p.gamesPlayed, p.wins, P.isUnlocked('w2')], ['w2', true, null, 1, 1, true], 'P0b the same win after a reload is not counted twice');
  const c = P.recordGame({ ...g, seed: 4243 });
  eq([c.duplicate || false, P.getProgress().gamesPlayed], [false, 2], 'P0b another game (other seed) counts');
  const l = { worldId: 'w2', charId: 'lawyer', status: 'won', stars: 1, months: 60, netWorth: 9, seed: 77 };
  P.recordLearnGame(l); P._reset(P.getProgress()); const l2 = P.recordLearnGame(l);
  eq([l2.duplicate, P.getProgress().learnGames], [true, 1], 'P0b a practice end after a reload is not counted twice');
  P._reset({ endSigs: [1, 'x'.repeat(300), 'ok', ...Array.from({ length: 50 }, (_, i) => 's' + i)] });
  const s = P.getProgress().endSigs;
  eq([s.length <= 40, s.includes('ok') || s.length === 40, s.every((x) => typeof x === 'string' && x.length < 200)], [true, true, true], 'P0b endSigs is bounded and cleaned');
  P._reset({});
}

console.log(fails ? `${fails}/${n} FAILED` : `all ${n} progress tests passed`);
process.exit(fails ? 1 : 0);
