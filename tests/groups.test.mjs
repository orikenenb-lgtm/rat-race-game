// 2026-11-25 (owner: "תחלק את המפות לעולמות — כל עולם 4 עד 5 מפות מקסימום") — js/worlds-groups.js + the linear unlock rule in js/progress.js.
// Run: node tests/groups.test.mjs
//   order    6 worlds in the owner's exact order, 4–5 maps each, every map w1…w25 exactly once; names from meta (built) or PLANNED
//   linear   finishing a map opens the next BUILT map (same world, or the next world's first map); unbuilt maps are skipped, never a wall;
//            every built map is reachable from a fresh save; stars banked in a locked map count once the chain reaches it
//   keep     a save from before the split keeps every map its old meta.unlock graph had open (incl. w5 + w9 open), once, across reloads
//   admin    setAdmin / setUnlockAll open every built map and never a planned one
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const GR = await import('../js/worlds-groups.js');
const { WORLD_META, metaOf, playableMeta, isUnlockedBy } = await import('../js/worlds/meta.js');
const P = await import('../js/progress.js');
let fails = 0; let n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const BUILT = playableMeta().map((m) => m.id);
const win = (w, extra = {}) => P.recordGame({ worldId: w, charId: (metaOf(w).characters[0] || {}).id, mode: 'free', status: 'won', stars: 1, months: 50, netWorth: 1, seed: 1000 + (+w.slice(1)), ...extra });

/* ---------- order */
eq(GR.WORLD_GROUPS.map((g) => g.name), ['הצעדים הראשונים', 'עולם העסקים', 'הכסף הגדול', 'הענקים', 'השווקים', 'הפסגה'], 'the 6 worlds, in order');
eq(GR.WORLD_GROUPS.map((g) => g.maps), [['w1', 'w2', 'w3', 'w4'], ['w5', 'w6', 'w7', 'w8', 'w9'], ['w10', 'w15', 'w13', 'w16'], ['w11', 'w17', 'w14', 'w12'], ['w18', 'w19', 'w20', 'w21'], ['w22', 'w23', 'w24', 'w25']], 'the maps of each world, in the owner\'s order');
ok(GR.WORLD_GROUPS.every((g) => g.maps.length >= 4 && g.maps.length <= 5), 'every world has 4 to 5 maps');
eq([...GR.ORDER].sort((a, b) => +a.slice(1) - +b.slice(1)), Array.from({ length: 25 }, (_, i) => 'w' + (i + 1)), 'every map w1…w25 exactly once');
ok(GR.WORLD_GROUPS.every((g, i) => g.n === i + 1 && g.id === 'g' + (i + 1) && g.learn && g.learn.length > 10 && g.icon), 'every world: number, id, a line of what you learn, an icon');
ok(BUILT.every((id) => GR.ORDER.includes(id)), `every built map is in a world (${BUILT.join(',')})`);
ok(GR.ORDER.every((id) => metaOf(id) || GR.PLANNED[id]), 'every map has a name: meta (built / registered) or PLANNED');
ok(GR.ORDER.filter((id) => !metaOf(id)).every((id) => GR.PLANNED[id].name && GR.PLANNED[id].tagline && GR.PLANNED[id].diff), 'every map not in meta yet has a planned name, line and difficulty');
eq([GR.mapLabel('w1'), GR.mapLabel('w15'), GR.mapLabel('w9'), GR.mapLabel('w25'), GR.mapLabel('h')], ['מפה 1 · הצעדים הראשונים', 'מפה 2 · הכסף הגדול', 'מפה 5 · עולם העסקים', 'מפה 4 · הפסגה', ''], 'mapLabel');
eq([GR.mapIndex('w15'), GR.mapNo('w12'), GR.groupOf('w13').name, GR.groupOf('x')], [11, 4, 'הכסף הגדול', null], 'mapIndex / mapNo / groupOf');
eq([GR.crossesWorld('w4', 'w5'), GR.crossesWorld('w5', 'w6'), GR.crossesWorld('w9', 'w10'), GR.crossesWorld('w16', 'w11')], [true, false, true, true], 'crossesWorld');
ok(!/[א-ת]{2,} (תבחר|תלחץ|תשחק)\b/.test(JSON.stringify(GR.WORLD_GROUPS) + JSON.stringify(GR.PLANNED)), 'world / planned lines use no gendered 2nd-person verbs');

/* ---------- the pure rule (any built set): skipping unbuilt maps */
const all = () => true;
eq(GR.nextMap('w10', (id) => id !== 'w15'), 'w13', 'an unbuilt next map is skipped (w10 → w13 when w15 is not built)');
eq(GR.nextMap('w8', (id) => id !== 'w9'), 'w10', 'an unbuilt LAST map of a world is skipped: w8 → the next world\'s first map');
eq(GR.nextMap('w12', (id) => +id.slice(1) <= 17), null, 'after the last built map: nothing');
eq(GR.prevMap('w10', all), 'w9', 'prevMap');
eq(GR.openMaps({ finished: () => false }), ['w1'], 'fresh: only the first map');
eq(GR.openMaps({ finished: (id) => ['w1', 'w2', 'w3', 'w4'].includes(id) }), ['w1', 'w2', 'w3', 'w4', 'w5'], 'w1–w4 finished → w5');
eq(GR.openMaps({ finished: (id) => id === 'w10', built: (id) => id !== 'w15', kept: ['w10'] }), ['w1', 'w10', 'w13'], 'a kept map is open and the chain goes on from it, skipping unbuilt');
eq(GR.openMaps({ finished: (id) => id === 'w3' }), ['w1'], 'a finished map that is not open opens nothing (banked)');
ok(GR.openMaps({ finished: all, built: (id) => id !== 'w19' }).every((id) => id !== 'w19'), 'an unbuilt map is never open');

/* ---------- progress: linear along ORDER, every built map reachable */
P._reset({});
eq(P.unlockedWorlds(), ['w1'], 'fresh save: w1 only');
eq(P.getProgress().groupsV, 1, 'a fresh save is on the new rule (groupsV 1)');
const chain = [];
for (let k = 0; k < 40; k++) {
  const cur = P.unlockedWorlds().find((w) => !P.worldFinished(w)); if (!cur) break;
  const before = P.unlockedWorlds(); const r = win(cur); const now = P.unlockedWorlds().filter((w) => !before.includes(w));
  chain.push([cur, r.unlockedWorld, r.unlockedGroup]);
  ok(now.length <= 1, `finishing ${cur} opens at most one map (${now})`);
}
const builtInOrder = GR.ORDER.filter((id) => BUILT.includes(id));
eq(chain.map((c) => c[0]), builtInOrder, 'played in order, every built map is reached (each finished map opens the next)');
eq(P.unlockedWorlds(), builtInOrder, 'all built maps open at the end, in the order of the game');
for (const [from, to, g] of chain) if (to) {
  eq(to, GR.nextMap(from, (id) => BUILT.includes(id)), `${from} opens the next built map`);
  eq(g, GR.crossesWorld(from, to) ? GR.groupOf(to).id : null, `${from} → ${to}: unlockedGroup only when it crosses into a new world`);
}
eq(chain.find((c) => c[0] === 'w4').slice(1), ['w5', 'g2'], 'w4 (last map of world 1) opens w5 and world 2');
eq(chain.find((c) => c[0] === 'w5').slice(1), ['w6', null], 'w5 opens w6 only (no fork to w7 / w8 any more)');
eq(chain.find((c) => c[0] === 'w9').slice(1), ['w10', 'g3'], 'w9 opens w10 and world 3');
eq(chain.find((c) => c[0] === 'w10').slice(1), ['w15', null], 'w10 opens w15 (the order inside world 3)');
eq(chain.find((c) => c[0] === 'w16').slice(1), ['w11', 'g4'], 'w16 (last of world 3) opens w11 and world 4');
// a practice escape and a 0★ escape finish a map too
P._reset({});
for (const w of ['w1', 'w2', 'w3']) win(w);
eq(P.recordLearnGame({ worldId: 'w4', charId: 'founder', status: 'won', stars: 3, months: 50, seed: 44, netWorth: 1 }).unlockedGroup, 'g2', 'a practice escape from w4 opens world 2 (unlockedGroup)');
eq([P.isUnlocked('w5'), P.getProgress().stars.w4], [true, 0], 'practice: w5 open, no stars');
const r0 = win('w5', { stars: 0, months: 99 });
eq([r0.unlockedWorld, r0.unlockedGroup, P.isUnlocked('w7')], ['w6', null, false], 'a 0★ escape from w5 opens w6 only');
// banked (daily) stars in a locked map count once the chain reaches it
P._reset({});
win('w1'); const rb = P.recordGame({ worldId: 'w3', charId: 'importer', mode: 'daily', resultId: 'd3', status: 'won', stars: 3, months: 20, netWorth: 1, seed: 3 });
eq([rb.bankedLocked, P.isUnlocked('w3'), P.isUnlocked('w4')], [true, false, false], 'banked ★ in a locked map opens nothing');
eq(win('w2').unlockedWorld, 'w3', 'the chain reaches w3 …'); ok(P.isUnlocked('w4'), '… and the banked w3 ★ opens w4 at once');
// worldMap / mapGroups / nextGoal
P._reset({ groupsV: 1, stars: { w1: 1, w2: 1, w3: 1, w4: 1 } });
const W = P.worldMap();
eq(W.map((x) => x.id), GR.ORDER, 'worldMap is in the order of the game (every map, planned ones too)');
ok(W.every((x) => x.group && x.group.name === GR.groupOf(x.id).name && x.mapNo === GR.mapNo(x.id) && x.order === GR.mapIndex(x.id)), 'worldMap entries carry their world, number in the world and position');
ok(W.filter((x) => !x.playable).every((x) => !x.unlocked && x.status === 'planned' && /^תיפתח אחרי /.test(x.lockText)), 'planned maps: never open, "תיפתח אחרי …"');
eq(W.find((x) => x.id === 'w6').lockText, 'לצאת מעיר התיירות', 'a locked built map: "לצאת מ<the map before it>"');
eq(W.find((x) => x.id === 'w5').unlocked, true, 'w5 open after w1–w4');
const G6 = P.mapGroups();
eq(G6.map((g) => [g.done, g.total, g.open]), [[4, 4, true], [0, 5, true], [0, 4, false], [0, 4, false], [0, 4, G6[4].open], [0, 4, false]], 'mapGroups: done / total / open');
ok(G6[5].soon && !G6[0].soon, 'a world with no built map is "בקרוב"');
eq(P.nextGoal().text, 'לצאת מהמירוץ בעיר התיירות כדי לפתוח את המפה הבאה: אזור התעשייה', 'nextGoal inside a world');
P._reset({ groupsV: 1, stars: { w1: 1, w2: 1, w3: 1 } });
eq(P.nextGoal().text, 'לצאת מהמירוץ בעמק העתיד כדי לפתוח עולם חדש: עולם העסקים', 'nextGoal across worlds');

/* ---------- keep: nothing that was open is locked again */
// a save from before the split (no groupsV): w1–w5 + w8 ★ → the old graph had w6 / w7 / w8, w9 / w10 / w13 open (w5 + w9 open)
const OLD = { stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w8: 1 }, best: {}, gamesPlayed: 6, wins: 6 };
const oldOpen = BUILT.filter((w) => isUnlockedBy(w, OLD.stars, {}));
ok(oldOpen.includes('w5') && oldOpen.includes('w9'), `the fixture has w5 + w9 open under the old graph (${oldOpen})`);
P._reset(JSON.parse(JSON.stringify(OLD)));
ok(oldOpen.every((w) => P.isUnlocked(w)), `every map the old graph opened stays open (${oldOpen.filter((w) => !P.isUnlocked(w))})`);
eq(P.getProgress().kept, oldOpen.filter((w) => w !== 'w1'), 'kept = the old-graph maps (once, groupsV 1)');
P._reset(P.getProgress());   // = a reload
ok(oldOpen.every((w) => P.isUnlocked(w)), 'still open after a reload');
// the old graph does not keep opening maps after the migration: w6 + w7 ★ and w9 ★ would open w11 under the old graph, not under the new rule
win('w6'); win('w7'); win('w9');
ok(isUnlockedBy('w11', P.getProgress().stars, {}) && !P.isUnlocked('w11'), 'after the migration the old graph opens nothing new (w11 stays closed)');
eq(win('w10').unlockedWorld, 'w15', 'finishing a kept map (w10) opens the next map in the order (w15)');
// load-time migration (a real old localStorage save, a fresh module instance)
store['rr2-progress'] = JSON.stringify(OLD);
const P2 = await import('../js/progress.js?groups=' + Date.now());
ok(oldOpen.every((w) => P2.isUnlocked(w)), 'load(): an old save keeps its open maps');
eq(P2.getProgress().groupsV, 1, 'load(): migrated');
// a practice-cleared map and a 0★ best from an old save count as finished for the old graph (exactly as before the split)
P._reset({ stars: { w1: 1, w2: 1, w3: 1, w4: 0 }, best: { w4: 66 }, cleared: { w5: true } });
ok(P.isUnlocked('w5') && P.isUnlocked('w6') && P.isUnlocked('w7') && P.isUnlocked('w8'), 'old save: a 0★ escape (best) and a practice escape (cleared) kept their old opens');
// a new-design save is never "migrated" by the old graph
P._reset({ groupsV: 1, stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w8: 1 } });
eq([P.isUnlocked('w6'), P.isUnlocked('w7'), P.isUnlocked('w9')], [true, false, false], 'a groupsV save follows the linear rule only');
// kept is cleaned (unknown / planned ids dropped)
P._reset({ groupsV: 1, kept: ['w13', 'w99', 7, 'w25'] });
eq(P.getProgress().kept, ['w13'], 'kept keeps only playable map ids');

/* ---------- admin / unlock-all */
P._reset({ groupsV: 1 });
P.setAdmin(true);
eq(P.unlockedWorlds(), builtInOrder, 'admin: every built map open');
ok(P.worldMap().filter((x) => !x.playable).every((x) => !x.unlocked), 'admin: planned maps stay closed');
P.setAdmin(false);
eq(P.unlockedWorlds(), ['w1'], 'admin off: back to w1');
P.setUnlockAll(true); ok(BUILT.every((w) => P.isUnlocked(w)), 'setUnlockAll(true) opens every built map');
P.setUnlockAll(false); eq(P.unlockedWorlds(), ['w1'], 'setUnlockAll(false): back');
// a duplicate end opens nothing (and reports no new world)
P._reset({ groupsV: 1, stars: { w1: 1, w2: 1, w3: 1 } });
const g4 = { worldId: 'w4', charId: 'founder', mode: 'free', status: 'won', stars: 1, months: 60, netWorth: 1, seed: 404 };
const a1 = P.recordGame(g4); P._reset(P.getProgress()); const a2 = P.recordGame(g4);
eq([a1.unlockedWorld, a1.unlockedGroup, a2.duplicate, a2.unlockedWorld, a2.unlockedGroup], ['w5', 'g2', true, null, null], 'a duplicate end after a reload reports no new map or world');

console.log(fails ? `${fails}/${n} FAILED` : `all ${n} groups tests passed`);
process.exit(fails ? 1 : 0);
