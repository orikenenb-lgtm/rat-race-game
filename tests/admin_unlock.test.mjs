// Owner-only "open every map" with the 6-world grouping (js/worlds-groups.js) — and NO non-admin path to it.
// Run: node tests/admin_unlock.test.mjs
//   * setAdmin(true) (= a server-confirmed rr_admin_status in lobby.js checkAdmin) opens every BUILT map of all 6 worlds, every pawn,
//     never a planned ("בקרוב") map; setAdmin(false) → back to the linear rule
//   * a saved / imported / hand-edited progress with unlockAll: true opens nothing (dropped on load, never written)
//   * unlockAll (memory only) is not persisted by save(); a reload is back to the linear rule
//   * the only callers in the app: setAdmin from lobby.js after rr_admin_status / rr_admin_claim (server answers); setUnlockAll has none
import { readFileSync, readdirSync } from 'node:fs';
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
// a hand-edited save (a non-admin trying the old override) BEFORE the module loads
store['rr2-progress'] = JSON.stringify({ v: 1, stars: { w1: 1 }, best: { w1: 30 }, unlockAll: true, groupsV: 1, kept: [] });
const GR = await import('../js/worlds-groups.js');
const { playableMeta } = await import('../js/worlds/meta.js');
const P = await import('../js/progress.js');
let fails = 0; let n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const BUILT = playableMeta().map((m) => m.id);
const KEY = Object.keys(store).find((k) => k.includes('progress')) || 'rr2-progress';

ok(!P.isAdmin(), 'a fresh page is not admin');
ok(!P.getProgress().unlockAll, 'a stored unlockAll: true is dropped on load (no non-admin path)');
const open0 = P.unlockedWorlds();
ok(open0.length < BUILT.length && open0.includes('w1') && open0.includes('w2') && !open0.includes('w4'), `the hand-edited save opens only the linear maps (${open0.join(',')})`);
ok(BUILT.filter((w) => !open0.includes(w)).every((w) => !P.isUnlocked(w)), 'every other built map stays locked for a non-admin');
P.setAdmin(true);
ok(BUILT.every((w) => P.isUnlocked(w)), `admin: every built map is open (${BUILT.length} maps)`);
const wm = P.worldMap();
ok(wm.filter((m) => m.playable).every((m) => m.unlocked) && wm.filter((m) => !m.playable).every((m) => !m.unlocked), 'admin: worldMap — all playable maps unlocked, planned ("בקרוב") maps stay locked');
const groups = P.mapGroups();
ok(groups.length === 6 && groups.every((g) => g.maps.filter((m) => m.playable).every((m) => m.unlocked)), 'admin: all 6 worlds of the grouping have every built map open');
ok(GR.WORLD_GROUPS.every((g) => g.maps.every((id) => !BUILT.includes(id) || P.unlockedWorlds().includes(id))), 'admin: unlockedWorlds covers every built map of every world');
ok(P.PAWNS.every((x) => P.pawnUnlocked(x.id)), 'admin: every pawn');
ok(!JSON.parse(store[KEY] || '{}').unlockAll && JSON.parse(store[KEY] || '{}').admin === undefined, 'admin is never written to storage');
P.setAdmin(false);
ok(JSON.stringify(P.unlockedWorlds()) === JSON.stringify(open0), 'setAdmin(false): back to exactly the linear maps');
P.setUnlockAll(true);
ok(BUILT.every((w) => P.isUnlocked(w)), 'setUnlockAll(true) (memory only) opens every built map in this session');
ok(!('unlockAll' in JSON.parse(store[KEY])), 'setUnlockAll is never persisted by save()');
P.setUnlockAll(false);
ok(JSON.stringify(P.unlockedWorlds()) === JSON.stringify(open0), 'setUnlockAll(false): back');
// the app's callers
const js = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
const src = Object.fromEntries(js.map((f) => [f, readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')]));
const callers = (re) => js.filter((f) => f !== 'progress.js' && re.test(src[f]));
ok(callers(/setUnlockAll\(/).length === 0, 'no app file calls setUnlockAll (only tests do)');
ok(JSON.stringify(callers(/\bsetAdmin\(/)) === JSON.stringify(['lobby.js']), 'only lobby.js calls setAdmin');
const lb = src['lobby.js'];
const sets = [...lb.matchAll(/P\.setAdmin\(([^)]*)\)/g)].map((m) => m[1]);
ok(sets.every((a) => ['false', 'on', 'true'].includes(a.trim())), `lobby.js setAdmin arguments: ${sets.join(' | ')}`);
ok(/const r = await net\.adminStatus\(\); const on = !!\(r && r\.admin\)[^\n]*\n\s*P\.setAdmin\(on\)/.test(lb), 'setAdmin(on) takes the server answer of rr_admin_status');
ok(/await net\.adminClaim\(code\);[\s\S]{0,300}P\.setAdmin\(true\); await checkAdmin\(\)/.test(lb), 'setAdmin(true) only after the server accepted the one-time code (then re-checked with rr_admin_status)');
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
