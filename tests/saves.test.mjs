// Unit tests for js/saves.js (Node, no browser). Run: node tests/saves.test.mjs
// Every version is relative to E.SAVE_VERSION, so this suite keeps passing after the engine moves to v4.
import * as E from '../js/engine.js';
import * as SV from '../js/saves.js';

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

/** in-memory Storage: length, key(i), byte limit (throws QuotaExceededError), call log, optional per-key thrower */
function mkStore({ limit = Infinity, throwFor = null } = {}) {
  const m = new Map(); const log = [];
  const size = () => { let s = 0; for (const [k, v] of m) s += k.length + v.length; return s; };
  return {
    m, log,
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { log.push(['get', k]); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      v = String(v); log.push(['set', k]);
      if (throwFor && throwFor(k)) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      const prev = m.get(k); m.set(k, v);
      if (size() > limit) { if (prev == null) m.delete(k); else m.set(k, prev); const e = new Error('full'); e.name = 'QuotaExceededError'; e.code = 22; throw e; }
    },
    removeItem(k) { log.push(['del', k]); m.delete(k); },
  };
}
const V = E.SAVE_VERSION;
const game = (seed = 7, extra = {}) => { const st = E.createGame({ worldId: 'w1', seed }); Object.assign(st, extra); st.ui = { seq: 0, coach: {}, firstPayday: false }; return st; };
const wrap = (st, v = 3, cfg = { worldId: 'w1', mode: 'free', seed: st.seed }) => JSON.stringify(v == null ? { cfg, state: st, savedAt: 1 } : { v, cfg, state: st, savedAt: 1 });
const K = 'rr2-save-free-w1';
/** v1 fixture built from the live engine: v:1, no life, without the last 3 RNG streams */
function v1Raw(seed = 7) {
  const st = game(seed); st.v = 1; delete st.life;
  const ks = Object.keys(st.rng); for (const k of ks.slice(-3)) delete st.rng[k];
  return wrap(st, 2);
}
const bakOf = (s, k = K) => JSON.parse(s.m.get(SV.BAK + k) || 'null');

/* ---------- classify */
{
  eq(SV.classify(null).status, 'empty', 'null → empty');
  eq(SV.classify('{"v":2,"cfg":{"worldId":"w1"').status, 'corrupt', 'truncated → corrupt');
  eq(SV.classify('[1,2]').status, 'corrupt', 'array → corrupt');
  eq(SV.classify('{"v":3,"cfg":{}}').status, 'corrupt', 'no state → corrupt');
  eq(SV.classify(wrap(game())).status, 'current', 'wrapper v3 current');
  eq(SV.classify(wrap(game(), null)).status, 'current', 'legacy wrapper (no v) current');
  eq(SV.classify(wrap(game(), 2)).status, 'current', 'legacy wrapper v2 current');
  eq(SV.classify(wrap(game(), 4)).status, 'future', 'wrapper v4 → future');
  eq(SV.classify(wrap(game(7, { v: V + 1 }))).status, 'future', 'state.v = SAVE_VERSION+1 → future');
  eq(SV.classify(wrap(game(7, { over: 'won' }))).status, 'over', 'over');
  eq(SV.classify(v1Raw()).status, 'old', 'v1 → old');
  eq(SV.classify(wrap(game(7, { v: 'x' }))).status, 'old', 'non-number v → old');
}

/* ---------- load */
{
  const s = mkStore(); SV._setStorage(s);
  eq(SV.load(K).status, 'empty', 'load empty');
  const raw = wrap(game(11)); s.m.set(K, raw);
  const r = SV.load(K); eq(r.status, 'ok', 'load current ok'); eq(r.state.seed, 11, 'load returns state'); eq(r.cfg.worldId, 'w1', 'load returns cfg');
  ok(!s.m.has(SV.BAK + K), 'no backup for a current load');
}
{ // old: backup is written BEFORE deserialize, raw byte-identical, slot untouched until the next write
  const s = mkStore(); SV._setStorage(s);
  const raw = v1Raw(); s.m.set(K, raw);
  const r = SV.load(K);
  eq(r.status, 'migrated', 'v1 → migrated'); eq(r.state.v, V, 'migrated state has SAVE_VERSION');
  const b = bakOf(s); eq(b.items[0].reason, 'migrate', 'backup reason migrate'); ok(b.items[0].raw === raw, 'backup raw identical');
  ok(s.m.get(K) === raw, 'slot untouched by load');
  const iBak = s.log.findIndex((x) => x[0] === 'set' && x[1] === SV.BAK + K);
  ok(iBak >= 0 && s.log.slice(0, iBak).filter((x) => x[0] === 'set').length === 0, 'backup is the first write');
  // deserialize happens after the backup: a backup failure → backup_failed and no deserialize
  const s2 = mkStore({ throwFor: (k) => k.startsWith(SV.BAK) }); SV._setStorage(s2); s2.m.set(K, raw);
  eq(SV.load(K).status, 'backup_failed', 'backup failure → backup_failed');
  eq(SV.load(K, { allowNoBackup: true }).status, 'migrated', 'allowNoBackup → migrated');
}
{ // future: no writes at all
  const s = mkStore(); SV._setStorage(s);
  const raw = wrap(game(7, { v: V + 1, month: 10 })); s.m.set(K, raw);
  const r = SV.load(K); eq(r.status, 'future', 'load future');
  eq(s.log.filter((x) => x[0] !== 'get').length, 0, 'future load: no writes/removes');
  ok(s.m.get(K) === raw, 'future slot identical');
  // write() over a future slot backs it up first (never overwrites without a backup)
  const w = SV.write(K, { worldId: 'w1' }, game(8)); ok(w.ok, 'write ok');
  eq(bakOf(s).items[0].reason, 'future', 'write over future → backup future'); ok(bakOf(s).items[0].raw === raw, 'future backup raw identical');
}
{ // truncated JSON → corrupt + backup + removed
  const s = mkStore(); SV._setStorage(s);
  const raw = '{"v":2,"cfg":{"worldId":"w1"'; s.m.set(K, raw);
  eq(SV.load(K).status, 'corrupt', 'load truncated → corrupt'); ok(!s.m.has(K), 'corrupt slot removed');
  eq(bakOf(s).items[0].reason, 'corrupt', 'corrupt backup reason'); ok(bakOf(s).items[0].raw === raw, 'corrupt raw identical');
}
{ // unknown world → corrupt/incompatible + backup
  const s = mkStore(); SV._setStorage(s);
  const raw = wrap(game(7, { worldId: 'w9' })); s.m.set(K, raw);
  const r = SV.load(K); ok(r.status === 'corrupt' || r.status === 'incompatible', 'w9 → corrupt/incompatible (' + r.status + ')');
  ok(!s.m.has(K), 'w9 slot removed'); ok(bakOf(s).items[0].raw === raw, 'w9 backup raw identical');
}

/* ---------- clear / claimSlot */
{
  const s = mkStore(); SV._setStorage(s);
  s.m.set(K, wrap(game(7, { over: 'lost' }))); ok(SV.clear(K), 'clear over'); ok(!s.m.has(SV.BAK + K), 'clear over: no backup'); ok(!s.m.has(K), 'clear over removed');
  const raw = wrap(game(3)); s.m.set(K, raw); SV.clear(K); eq(bakOf(s).items[0].reason, 'clear', 'clear unfinished → backup clear'); ok(!s.m.has(K), 'cleared');
  const fr = wrap(game(7, { v: V + 1 })); s.m.set(K, fr); SV.clear(K); eq(bakOf(s).items[0].reason, 'future', 'clear future → backup future'); ok(bakOf(s).items[0].raw === fr, 'future raw kept');
}
{
  const s = mkStore(); SV._setStorage(s);
  const fr = wrap(game(7, { v: V + 1 })); s.m.set(K, fr);
  const c1 = SV.claimSlot(K, 99); ok(c1.ok && c1.reason === 'future', 'claim over future → backup future'); ok(bakOf(s).items[0].raw === fr, 'claim future raw identical');
  s.m.set(K, wrap(game(5))); SV.claimSlot(K, 6); eq(bakOf(s).items[0].reason, 'overwrite', 'claim over a different seed → overwrite');
  const before = JSON.stringify(bakOf(s)); s.m.set(K, wrap(game(6))); SV.claimSlot(K, 6); eq(JSON.stringify(bakOf(s)), before, 'claim same seed → no backup');
  const s2 = mkStore({ throwFor: (k) => k.startsWith(SV.BAK) }); SV._setStorage(s2); s2.m.set(K, fr);
  const c2 = SV.claimSlot(K, 1); ok(!c2.ok && c2.future, 'claim future with no room → not ok');
}

/* ---------- caps (A-30): 12 backups across 5 slots → ≤2 per slot, ≤8 total, oldest first, future survives */
{
  const s = mkStore(); SV._setStorage(s);
  const slots = [1, 2, 3, 4, 5].map((i) => `rr2-save-free-x${i}`);
  ok(SV.backup(slots[0], wrap(game(1000)), 'future'), 'first backup (future)');
  const order = [];
  for (let i = 1; i < 12; i++) { const k = slots[i % 5]; SV.backup(k, wrap(game(1000 + i)), 'overwrite'); order.push([k, 1000 + i]); }
  const list = SV.listBackups();
  ok(list.length <= SV.MAX_BAK_TOTAL, 'total ≤ 8 (' + list.length + ')');
  const per = {}; for (const b of list) per[b.key] = (per[b.key] || 0) + 1;
  ok(Object.values(per).every((c) => c <= SV.MAX_BAK_PER_SLOT), 'per slot ≤ 2 ' + JSON.stringify(per));
  ok(list.some((b) => b.reason === 'future'), 'future item survives although older');
  eq(list.filter((b) => b.reason === 'future').length, 1, 'exactly one future item');
  // per slot: x1 {future,1010} x2 {1006,1011} x3 {1002,1007} x4 {1003,1008} x5 {1004,1009} = 10 → the 2 oldest (1002, 1003) go
  const seeds = []; for (const k of slots) { const r = bakOf(s, k); if (r) for (const it of r.items) if (it.reason !== 'future') seeds.push(JSON.parse(it.raw).state.seed); }
  eq(seeds.sort((a, b) => a - b), [1004, 1006, 1007, 1008, 1009, 1010, 1011], 'oldest evicted first');
}
{ // bytes cap
  const s = mkStore(); SV._setStorage(s);
  const big = (i) => { const st = game(i); st.pad = 'x'.repeat(70 * 1024); return wrap(st); };
  for (let i = 0; i < 5; i++) SV.backup('rr2-save-free-b' + i, big(i), 'overwrite');
  let bytes = 0; for (const [k, v] of s.m) if (k.startsWith(SV.BAK)) bytes += k.length + v.length;
  ok(bytes <= SV.BAK_BYTES_SOFT, 'bytes ≤ 256 KB (' + bytes + ')');
}

/* ---------- quota: evict backups (non-future first) then quarantine; never the live keys */
{
  const s = mkStore({ limit: 60000 }); SV._setStorage(s);
  s.m.set('rr2-progress', JSON.stringify({ v: 1, stars: { w1: 3 } })); s.m.set('rr-player', '{"id":"x"}'); s.m.set('rr2-energy', '{"e":5}');
  const pad = (i) => { const st = game(i); st.pad = 'y'.repeat(9000); return wrap(st); };
  SV.backup('rr2-save-free-a', pad(1), 'future');
  SV.backup('rr2-save-free-b', pad(2), 'overwrite');
  SV.backup('rr2-save-free-c', pad(3), 'clear');
  s.m.set(SV.QUAR + 'rr2-library', JSON.stringify({ v: 1, at: 1, raw: 'z'.repeat(8000) }));
  const st = game(50); st.pad = 'w'.repeat(14000);
  const r = SV.write(K, { worldId: 'w1' }, st);
  ok(r.ok, 'write succeeds after eviction ' + JSON.stringify(r));
  ok(s.m.has('rr2-progress') && s.m.has('rr-player') && s.m.has('rr2-energy'), 'never-evict keys kept');
  ok(SV.listBackups().some((b) => b.reason === 'future'), 'future backup kept while others could go');
  const big = game(51); big.pad = 'q'.repeat(80000);
  const r2 = SV.write('rr2-save-free-w2', { worldId: 'w1' }, big);
  ok(!r2.ok && r2.quota, 'impossible write → {ok:false, quota:true}');
  ok(s.m.has(K) && s.m.has('rr2-progress'), 'live saves never evicted');
}

/* ---------- sweep (A-22 / A-23) */
{
  const s = mkStore(); SV._setStorage(s);
  const slotRaw = '{"v":2,"cfg":{"worldId":"w1"';
  s.m.set(K, slotRaw); s.m.set('rr2-save-free-w2', wrap(game(4)));
  s.m.set('rr2-progress', '{bad'); s.m.set('rr-player', '[1]'); s.m.set('rr2-settings', '{oops');
  s.m.set('rr2-pending-finish', '[{"resultId":"r1","status":"won"},5,"x"]');
  s.m.set('rr2-onboarded', '1'); s.m.set('rr2-ref', 'abc');
  const r = SV.sweep();
  eq(r.corruptSlots, 1, 'one corrupt slot'); ok(!s.m.has(K) && s.m.has('rr2-save-free-w2'), 'only the corrupt slot removed');
  ok(bakOf(s).items[0].raw === slotRaw && bakOf(s).items[0].reason === 'corrupt', 'slot backup identical, reason corrupt');
  ok(JSON.parse(s.m.get(SV.QUAR + 'rr2-progress')).raw === '{bad' && !s.m.has('rr2-progress'), 'progress quarantined');
  ok(r.quarantined.includes('rr-player'), 'rr-player (not an object) quarantined');
  ok(r.quarantined.includes('rr2-settings'), 'settings quarantined (silent)');
  eq(JSON.parse(s.m.get('rr2-pending-finish')), [{ resultId: 'r1', status: 'won' }], 'pending keeps the valid item');
  eq(JSON.parse(s.m.get(SV.QUAR + 'rr2-pending-finish')).items, [5, 'x'], 'pending invalid items quarantined');
  eq(r.pendingItems, 2, 'pending item count');
  ok(s.m.get('rr2-onboarded') === '1' && s.m.get('rr2-ref') === 'abc', 'plain-string keys not swept');
  s.m.set('rr2-pending-finish', '[{bad');
  const r2 = SV.sweep(); ok(r2.quarantined.includes('rr2-pending-finish'), 'pending whole raw quarantined');
  const q = JSON.parse(s.m.get(SV.QUAR + 'rr2-pending-finish')); ok(q.raw === '[{bad', 'pending raw identical'); eq(q.items, [5, 'x'], 'earlier items kept');
}

/* ---------- restore / autoRestoreFuture */
{
  const s = mkStore(); SV._setStorage(s);
  const raw = wrap(game(21)); SV.backup(K, raw, 'clear');
  ok(SV.restoreBackup(K, 0), 'restore into empty slot'); ok(s.m.get(K) === raw, 'restored raw identical');
  ok(!SV.restoreBackup(K, 0), 'no restore over an unfinished game');
  s.m.delete(K); const fr = wrap(game(22)); SV.backup(K, fr, 'future'); // a former future save that this engine can now read
  eq(SV.autoRestoreFuture(), 1, 'autoRestoreFuture restores a readable future backup'); ok(s.m.get(K) === fr, 'auto-restored raw identical');
  const s2 = mkStore(); SV._setStorage(s2); SV.backup(K, wrap(game(23, { v: V + 1 })), 'future');
  eq(SV.autoRestoreFuture(), 0, 'still-future backup not restored');
}

/* ---------- normalizeUi / isQuotaError */
{
  eq(SV.normalizeUi(null), { seq: 0, coach: {}, firstPayday: false }, 'normalizeUi(null)');
  const u = SV.normalizeUi({ seq: '4', coach: [], firstPayday: 'yes', hist: new Array(300).fill(1), pensionHist: 'x', trackMonth: 'a', weddingAge: 31, lifeSeen: 1, extra: 'keep' });
  eq([u.seq, u.coach, u.firstPayday, u.hist.length, 'pensionHist' in u, 'trackMonth' in u, u.weddingAge, 'lifeSeen' in u, u.extra], [4, {}, false, 240, false, false, 31, false, 'keep'], 'normalizeUi repairs types');
  eq(SV.normalizeUi({ seq: -2 }).seq, 0, 'negative seq → 0');
  eq(SV.normalizeUi({ seq: 17, coach: { roll: true } }), { seq: 17, coach: { roll: true }, firstPayday: false }, 'valid ui kept');
  ok(SV.isQuotaError({ name: 'QuotaExceededError' }) && SV.isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }) && SV.isQuotaError({ code: 22 }) && SV.isQuotaError({ code: 1014 }), 'isQuotaError variants');
  ok(!SV.isQuotaError(new Error('x')) && !SV.isQuotaError(null), 'isQuotaError negatives');
}
/* ---------- write wrapper */
{
  const s = mkStore(); SV._setStorage(s);
  SV.write(K, { worldId: 'w1' }, game(30));
  const w = JSON.parse(s.m.get(K)); eq([w.v, w.app, w.sv, typeof w.savedAt], [SV.WRAP_V, SV.APP_VERSION, V, 'number'], 'wrapper v3 fields');
  eq(SV.classifyState({ v: V, junk: 1 }).status, 'current', 'classifyState of a junk state = current (deserialize decides)');
  eq(SV.classifyState(JSON.stringify(game(1, { v: V + 1 }))).status, 'future', 'classifyState string future');
}

/* ---------- review fixes */
{ // m-1: the soft caps never evict future backups or quarantined data
  const s = mkStore(); SV._setStorage(s);
  const fr = wrap(game(70, { v: V + 1 })); SV.backup('rr2-save-free-w2', fr, 'future');
  s.m.set(SV.QUAR + 'rr-player', JSON.stringify({ v: 1, at: 1, raw: '{oops' }));
  const st = game(71); st.pad = 'p'.repeat(270 * 1024);
  SV.backup(K, wrap(st), 'overwrite');
  ok(SV.listBackups().some((b) => b.reason === 'future' && b.key === 'rr2-save-free-w2'), 'm-1 byte cap keeps the future backup');
  ok(s.m.has(SV.QUAR + 'rr-player'), 'm-1 byte cap keeps quarantined rr-player');
  const s2 = mkStore(); SV._setStorage(s2);
  for (let i = 0; i < 10; i++) SV.backup('rr2-save-free-f' + i, wrap(game(80 + i)), 'future');
  eq(SV.listBackups().length, 10, 'm-1 item cap never evicts future backups');
  const s3 = mkStore(); SV._setStorage(s3);
  SV.backup(K, wrap(game(90)), 'future'); SV.backup(K, wrap(game(91)), 'future'); SV.backup(K, wrap(game(92)), 'overwrite');
  eq(SV.listBackups(K).filter((b) => b.reason === 'future').length, 2, 'per-slot cap never drops a future item');
}
{ // m-2: storage that throws on access (blocked site data)
  const blocked = new Proxy({}, { get() { const e = new Error('blocked'); e.name = 'SecurityError'; throw e; } });
  SV._setStorage(blocked);
  let threw = false, r = null, w = null;
  try { r = SV.sweep(); w = SV.write(K, { worldId: 'w1' }, game(1)); } catch (e) { threw = true; }
  ok(!threw, 'm-2 sweep/write never throw on blocked storage');
  eq(r, { quarantined: [], corruptSlots: 0, pendingItems: 0 }, 'm-2 sweep result on blocked storage');
  ok(w && w.ok === false && !w.quota && !w.future, 'm-2 write → {ok:false} (not quota, not future)');
  eq(SV.load(K).status, 'empty', 'm-2 load on blocked storage → empty');
}
{ // m-3: an unloadable save is never overwritten without a backup (same seed or not)
  const s = mkStore({ throwFor: (k) => k.startsWith(SV.BAK) }); SV._setStorage(s);
  const raw = wrap(game(7, { worldId: 'w9' })); s.m.set(K, raw);
  eq(SV.load(K).status === 'incompatible' || SV.load(K).status === 'corrupt', true, 'm-3 unloadable save');
  ok(s.m.get(K) === raw, 'm-3 slot kept when its backup fails');
  const c = SV.claimSlot(K, 7);
  ok(!c.ok && c.keep, 'm-3 claimSlot same seed on an unloadable save without room → keep ' + JSON.stringify(c));
  const s2 = mkStore(); SV._setStorage(s2); s2.m.set(K, raw);
  const c2 = SV.claimSlot(K, 7); ok(c2.ok && c2.reason === 'incompatible', 'm-3 claimSlot backs up an unloadable same-seed save ' + JSON.stringify(c2));
  ok(JSON.parse(s2.m.get(SV.BAK + K)).items[0].raw === raw, 'm-3 backup raw identical');
}
{ // write() refuses to overwrite a future save whose backup fails; clear() keeps a slot whose backup fails
  const s = mkStore({ throwFor: (k) => k.startsWith(SV.BAK) }); SV._setStorage(s);
  const fr = wrap(game(7, { v: V + 1 })); s.m.set(K, fr);
  const w = SV.write(K, { worldId: 'w1' }, game(8));
  ok(!w.ok && w.future && s.m.get(K) === fr, 'write refuses over a future save without a backup');
  const s2 = mkStore({ throwFor: (k) => k.startsWith(SV.BAK) }); SV._setStorage(s2);
  const raw = wrap(game(9)); s2.m.set(K, raw);
  ok(SV.clear(K) === false && s2.m.get(K) === raw, 'clear keeps the slot when its backup fails');
}

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
