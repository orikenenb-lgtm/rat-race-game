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
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} progress tests passed`);
process.exit(fails ? 1 : 0);
