#!/usr/bin/env node
// Online-release check of the rooms migration draft (supabase/migrations/20261124_rooms.sql) against the production baseline
// (supabase/schema/production_baseline.sql), executed for real in PGlite (PostgreSQL in WASM). Nothing touches a real Supabase.
// What it proves (docs/full-upgrade/ONLINE_RELEASE.md §3):
//   1. rooms.sql applies ALONE on the baseline (groups v2 / competitions / worlds are NOT prerequisites);
//   2. it is ADDITIVE: every pre-existing table, column, constraint, index, function (definition, volatility, ACL), RLS flag and policy
//      is byte-identical afterwards, and existing rows are untouched;
//   3. every new object is a room object (game.room*, game.ms, public.rr_room_*, public.rr_my_rooms), RLS on, no policies, no table
//      grants; only the 10 public RPCs are EXECUTE for anon/authenticated;
//   4. RPCs that write are VOLATILE (PostgREST runs STABLE functions in a read-only transaction);
//   5. a second apply fails as a whole and changes nothing (not idempotent, but atomic: begin … commit);
//   6. the ROLLBACK block at the bottom of the file restores the baseline catalog exactly and keeps existing data; re-apply works;
//   7. order independence: rooms first, then groups v2 + competitions still apply.
//   8. lifecycle without a cron (ONLINE_RELEASE.md S1/S2/S5/S6): stale lobbies expire in SQL and cannot be joined, the cap ignores
//      idle rooms, polls do not rewrite the seat, game.room_purge(days) deletes only ended rooms (the old GAP probes, now checks).
//   RR_PGLITE=/path/to/node_modules/@electric-sql/pglite node tests/online_migration.test.mjs     (SKIP without PGlite)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

async function pglite() {
  const tries = [process.env.RR_PGLITE, '@electric-sql/pglite', '/tmp/pgl/node_modules/@electric-sql/pglite'].filter(Boolean);
  for (const t of tries) {
    try {
      const base = t.startsWith('/') ? pathToFileURL(t.replace(/\/$/, '') + '/dist/index.js').href : t;
      const crypto = t.startsWith('/') ? pathToFileURL(t.replace(/\/$/, '') + '/dist/contrib/pgcrypto.js').href : t + '/contrib/pgcrypto';
      const { PGlite } = await import(base); const { pgcrypto } = await import(crypto);
      return { PGlite, pgcrypto };
    } catch (e) { /* next */ }
  }
  return null;
}
const PG = await pglite();
if (!PG) { console.log('SKIP online_migration: PGlite not found (set RR_PGLITE=<dir of @electric-sql/pglite>)'); process.exit(0); }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ROOMS = read('supabase/migrations/20261124_rooms.sql');
const ROLLBACK = (() => {
  const i = ROOMS.indexOf('-- ================================================================== ROLLBACK');
  assert.ok(i > 0, 'rooms.sql has a ROLLBACK block');
  return ROOMS.slice(i).split('\n').filter((l) => /^-- /.test(l) && !/^-- =+/.test(l)).map((l) => l.slice(3)).join('\n');
})();

let passed = 0, failed = 0; const gaps = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); }
}
const gap = (id, text) => { gaps.push(id); console.log(`   GAP ${id}: ${text}`); };

/** a fresh PGlite with the production baseline (same loader as tests/sql_drafts.test.mjs) + a few rows of existing data */
async function baseline() {
  const db = new PG.PGlite({ extensions: { pgcrypto: PG.pgcrypto } });
  await db.exec(`create schema game; create schema extensions; create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create sequence game.events_id_seq;`);
  const sql = read('supabase/schema/production_baseline.sql');
  const blocks = sql.split(/\n(?=create table |CREATE OR REPLACE FUNCTION )/);
  const tables = {}; const funcs = [];
  for (const b of blocks) { const m = /^create table game\.(\w+)/.exec(b); if (m) tables[m[1]] = b; else if (b.startsWith('CREATE OR REPLACE FUNCTION')) funcs.push(b.replace(/\n--[^\n]*/g, '')); }
  for (const t of ['players', 'groups', 'group_members', 'challenges', 'results', 'events', 'energy_gifts', 'admins', 'admin_setup']) await db.exec(tables[t]);
  for (const f of funcs) await db.exec(f.trim().replace(/;?\s*$/, ';'));
  await db.exec(`grant execute on all functions in schema public to anon, authenticated;`);
  db.players = [];
  for (const n of ['טסט־א', 'טסט־ב', 'טסט־ג']) db.players.push((await db.query(`select public.rr_register2(p_nickname => $1, p_ref => null) as r`, [n])).rows[0].r);
  const p = db.players[0];
  await db.query(`select public.rr_create_group(p_id => $1, p_secret => $2, p_name => 'טסט קבוצה')`, [p.id, p.secret]);
  return db;
}
const rows = async (db, text, params = []) => (await db.query(text, params)).rows;

/** catalog fingerprint: one line per object of schemas game + public (functions: full definition, volatility, ACL) */
async function catalog(db) {
  const out = new Map();
  for (const r of await rows(db, `select n.nspname || '.' || c.relname as k, c.relkind::text as kind, c.relrowsecurity as rls, coalesce(c.relacl::text, '') as acl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('game', 'public') and c.relkind in ('r', 'v', 'm', 'S', 'i')`))
    out.set(`rel ${r.k}`, `${r.kind} rls=${r.rls} acl=${r.acl}`);
  for (const r of await rows(db, `select n.nspname || '.' || c.relname || '.' || a.attname as k, format_type(a.atttypid, a.atttypmod) as t, a.attnotnull as nn,
      coalesce(pg_get_expr(d.adbin, d.adrelid), '') as def from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname in ('game', 'public') and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`))
    out.set(`col ${r.k}`, `${r.t} nn=${r.nn} def=${r.def}`);
  for (const r of await rows(db, `select n.nspname || '.' || c.relname || ':' || o.conname as k, pg_get_constraintdef(o.oid) as d
      from pg_constraint o join pg_class c on c.oid = o.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('game', 'public')`))
    out.set(`con ${r.k}`, r.d);
  for (const r of await rows(db, `select schemaname || '.' || indexname as k, indexdef from pg_indexes where schemaname in ('game', 'public')`))
    out.set(`idx ${r.k}`, r.indexdef);
  for (const r of await rows(db, `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
      md5(pg_get_functiondef(p.oid)) as h, p.provolatile::text as v, p.prosecdef as sd, coalesce(p.proacl::text, '') as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('game', 'public')`))
    out.set(`fn ${r.k}`, `${r.h} vol=${r.v} secdef=${r.sd} acl=${r.acl}`);
  for (const r of await rows(db, `select schemaname || '.' || tablename || ':' || policyname as k, coalesce(qual, '') as q from pg_policies where schemaname in ('game', 'public')`))
    out.set(`pol ${r.k}`, r.q);
  return out;
}
async function dataHash(db) {
  const h = {};
  for (const t of ['players', 'groups', 'group_members', 'challenges', 'results', 'events', 'energy_gifts', 'admins', 'admin_setup'])
    h[t] = (await rows(db, `select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h from game.${t} x`))[0];
  return JSON.stringify(h);
}
const diff = (a, b) => {
  const changed = [], added = [], removed = [];
  for (const [k, v] of a) { if (!b.has(k)) removed.push(k); else if (b.get(k) !== v) changed.push(`${k}: ${v} → ${b.get(k)}`); }
  for (const k of b.keys()) if (!a.has(k)) added.push(k);
  return { changed, added, removed };
};
const ROOM_OBJ = /^(rel|col|con|idx|fn|pol) (game\.(room_|rooms|ms\(|room\b)|public\.(rr_room_|rr_my_rooms\(|room)|game\.(rooms|room_\w+)[:.])/;

const db = await baseline();
const before = await catalog(db); const data0 = await dataHash(db);
let after;

await test('rooms.sql applies ALONE on the production baseline (no groups v2 / competitions / worlds needed)', async () => {
  await db.exec(ROOMS);
  after = await catalog(db);
});

await test('additive: no pre-existing object changed or removed; existing rows untouched', async () => {
  const d = diff(before, after);
  assert.deepEqual(d.removed, [], 'removed: ' + d.removed.join(', '));
  assert.deepEqual(d.changed, [], 'changed: ' + d.changed.join('\n'));
  assert.equal(await dataHash(db), data0, 'existing data changed');
});

await test('every new object is a room object; new tables RLS on, no policies, no table grants', async () => {
  const { added } = diff(before, after);
  const foreign = added.filter((k) => !ROOM_OBJ.test(k));
  assert.deepEqual(foreign, [], 'non-room objects added: ' + foreign.join(', '));
  const tabs = added.filter((k) => /^rel game\./.test(k) && after.get(k).startsWith('r '));
  assert.deepEqual(tabs.map((k) => k.slice(4)).sort(), ['game.room_actions', 'game.room_events', 'game.room_join_fails', 'game.room_seats', 'game.rooms']);
  // acl: empty, or only the owner's own entry (the explicit `revoke … from anon, authenticated` materialises the default ACL, N4)
  for (const k of tabs) { assert.match(after.get(k), /rls=true/, k); const acl = after.get(k).split('acl=')[1]; assert.ok(acl === '' || !/(anon|authenticated|service_role)=|[{,]=/.test(acl), k + ' has table grants: ' + acl); }
  assert.ok(![...after.keys()].some((k) => /^pol game\.room/.test(k)), 'a room table has a policy');
  console.log(`   ${added.length} objects added (${tabs.length} tables), 0 changed, 0 removed`);
});

await test('EXECUTE: only the 10 public RPCs for anon/authenticated; the 12 game.* room helpers (incl. room_sweep, room_purge) for nobody but the owner', async () => {
  const fns = await rows(db, `select n.nspname as s, p.proname as f, has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and (p.proname like 'rr_room_%' or p.proname = 'rr_my_rooms')) or (n.nspname = 'game' and (p.proname like 'room_%' or p.proname = 'ms'))`);
  const pub = fns.filter((x) => x.s === 'public'); const helpers = fns.filter((x) => x.s === 'game');
  assert.equal(pub.length, 10); assert.ok(pub.every((x) => x.anon && x.auth), 'a public room RPC is not executable by the API roles');
  assert.equal(helpers.length, 12); assert.ok(helpers.every((x) => !x.anon && !x.auth), 'a game.* room helper is executable by anon/authenticated');
});

await test('PostgREST transaction mode: every room RPC that writes is VOLATILE (STABLE → read-only transaction → write fails)', async () => {
  const fns = await rows(db, `select p.proname as f, p.provolatile::text as v, pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'rr_room_%' or p.proname = 'rr_my_rooms')`);
  const writes = (d) => /\b(insert into|update game\.|delete from)\b/i.test(d) || /game\.room_(lock|event|touch|back|fail|sweep)\(/.test(d);
  for (const f of fns) if (writes(f.d)) assert.equal(f.v, 'v', `${f.f} writes but is not VOLATILE`);
  const ro = fns.filter((f) => !writes(f.d)).map((f) => f.f);
  assert.deepEqual(ro, [], 'read-only RPCs (rr_my_rooms sweeps stale lobbies since S2, so it is VOLATILE too)');
  assert.ok(fns.every((f) => f.v === 'v'), 'every room RPC is VOLATILE');
  // game.auth (baseline) is STABLE and read-only
  const [a] = await rows(db, `select provolatile::text as v, pg_get_functiondef(oid) as d from pg_proc where proname = 'auth' and pronamespace = 'game'::regnamespace`);
  assert.equal(a.v, 's'); assert.ok(!/\b(insert|update|delete)\b/i.test(a.d.replace(/--[^\n]*/g, '')), 'game.auth writes');
});

await test('second apply: fails as a whole (not idempotent) and changes nothing (begin … commit is atomic)', async () => {
  let err = null; try { await db.exec(ROOMS); } catch (e) { err = e; }
  assert.ok(err, 'a second apply succeeded (unexpected: create table is not "if not exists")');
  await db.exec('rollback').catch(() => {});
  const d = diff(after, await catalog(db));
  assert.deepEqual([d.changed, d.added, d.removed], [[], [], []]);
  console.log(`   second apply → "${String(err.message).slice(0, 60)}" (expected; the runbook checks before applying)`);
});

await test('ROLLBACK block: restores the baseline catalog exactly, keeps existing data; re-apply after rollback works', async () => {
  // a room with seats/actions/events, so the drop order (FKs) is exercised with data present
  const p = db.players[0];
  const [c] = await rows(db, `select public.rr_room_create(p_id => $1, p_secret => $2, p_settings => '{}'::jsonb, p_group => null) as r`, [p.id, p.secret]);
  assert.ok(c.r.code);
  await db.exec(ROLLBACK);
  const d = diff(before, await catalog(db));
  assert.deepEqual([d.changed, d.added, d.removed], [[], [], []], JSON.stringify(d));
  assert.equal(await dataHash(db), data0, 'rollback changed existing data');
  await db.exec(ROOMS);
  const d2 = diff(after, await catalog(db));
  assert.deepEqual([d2.changed, d2.added, d2.removed], [[], [], []], 'catalog after re-apply ≠ first apply');
});

await test('order independence: rooms first, then groups v2 → competitions still apply', async () => {
  const d = await baseline();
  await d.exec(ROOMS);
  await d.exec(read('supabase/migrations/20261124_groups_v2.sql'));
  await d.exec(read('supabase/migrations/20261124_competitions.sql'));
  const n = (await rows(d, `select count(*)::int as n from pg_proc where proname like 'rr_room_%'`))[0].n;
  assert.equal(n, 9);
});

/* ------------------------------------------------ lifecycle without a cron (S1 / S2 / S5 / S6 — were GAP probes before the fixes) */
const callOn = (d) => async (fn, args) => {
  const ks = Object.keys(args); const ph = ks.map((k, i) => `${k} => $${i + 1}`).join(', ');
  try { const r = (await d.query(`select public.${fn}(${ph}) as r`, ks.map((k) => (args[k] && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])))).rows[0].r;
    return r && r.code === 'P0001' ? { code: r.message } : { ok: true, body: r }; } catch (e) { return { code: e.message }; }
};
await test('S2: idle lobbies expire in SQL (create / join / my_rooms sweep), never count toward the cap, cannot be joined', async () => {
  const d = await baseline(); await d.exec(ROOMS); const call = callOn(d); const ps = d.players;
  const A = { p_id: ps[0].id, p_secret: ps[0].secret }, B = { p_id: ps[1].id, p_secret: ps[1].secret };
  const made = [];
  for (let i = 0; i < 3; i++) made.push((await call('rr_room_create', { ...A, p_settings: {} })).body);
  assert.equal((await call('rr_room_create', { ...A, p_settings: {} })).code, 'too_many_rooms', 'the cap still holds for live lobbies');
  // the host closes the tab: nobody heartbeats, nobody ever calls the Edge tick
  await d.query(`update game.rooms set last_activity = now() - interval '3 hours', created_at = now() - interval '3 hours'`);
  const fourth = await call('rr_room_create', { ...A, p_settings: {} });
  assert.ok(fourth.ok, 'G-STALE-LOBBY fixed: a 4th room can be created: ' + JSON.stringify(fourth));
  const st = await rows(d, `select status, end_reason, finished_at is not null as fin, version from game.rooms where id = any($1::uuid[]) order by created_at`, [made.map((m) => m.room_id)]);
  assert.ok(st.every((x) => x.status === 'cancelled' && x.end_reason === 'expired' && x.fin && Number(x.version) === 2), JSON.stringify(st));
  const ev = await rows(d, `select kind, data from game.room_events where room_id = $1 order by seq desc limit 1`, [made[0].room_id]);
  assert.deepEqual([ev[0].kind, ev[0].data], ['cancelled', { why: 'expired' }], 'the expiry event of room_core');
  const j = await call('rr_room_join', { ...B, p_code: made[0].code });
  assert.equal(j.code, 'room_not_found', 'G-JOIN-EXPIRED fixed');
  // a lobby idle 3 h that nobody sweeps yet: the next rr_my_rooms / rr_room_join of ANY player expires it
  await d.query(`update game.rooms set last_activity = now() - interval '3 hours' where id = $1`, [fourth.body.room_id]);
  const mine = (await call('rr_my_rooms', B)).body;
  assert.ok(Array.isArray(mine));
  assert.equal((await rows(d, `select status from game.rooms where id = $1`, [fourth.body.room_id]))[0].status, 'cancelled', 'swept by another player\'s rr_my_rooms');
  // a fresh lobby is untouched by the sweep
  const fresh = (await call('rr_room_create', { ...B, p_settings: {} })).body;
  await call('rr_my_rooms', A);
  assert.equal((await rows(d, `select status from game.rooms where id = $1`, [fresh.room_id]))[0].status, 'lobby');
});
await test('S2/S1: a playing room idle > 2 h (e.g. left behind by a pin change) no longer counts toward the cap; leaving still works', async () => {
  const d = await baseline(); await d.exec(ROOMS); const call = callOn(d); const ps = d.players;
  const A = { p_id: ps[0].id, p_secret: ps[0].secret };
  const made = [];
  for (let i = 0; i < 3; i++) made.push((await call('rr_room_create', { ...A, p_settings: {} })).body.room_id);
  await d.query(`update game.rooms set status = 'playing', engine_sha = repeat('a', 64), round = 1, started_at = now() - interval '3 hours', last_activity = now() - interval '3 hours'`);
  await d.query(`update game.room_seats set status = 'playing'`);
  const c = await call('rr_room_create', { ...A, p_settings: {} });
  assert.ok(c.ok, 'idle playing rooms are outside the cap: ' + JSON.stringify(c));
  assert.equal((await rows(d, `select count(*)::int as n from game.rooms where status = 'playing'`))[0].n, 3, 'the SQL never ends a playing room (ranking needs the engine: the Edge Function does it)');
  const left = await call('rr_room_leave', { ...A, p_room: made[1] });
  assert.ok(left.ok && left.body.forfeit, 'leaving a playing room is SQL-only (forfeit) and works whatever the pin');
  const col = await rows(d, `select data_type from information_schema.columns where table_schema = 'game' and table_name = 'rooms' and column_name = 'pin_mismatch_at'`);
  assert.equal(col[0].data_type, 'timestamp with time zone', 'rooms.pin_mismatch_at (the Edge Function closes a foreign-pin room after a 2-minute grace)');
});
await test('S5: a poll takes no lock and writes nothing while last_seen is fresh (< 15 s); stale → one write; away → comes back', async () => {
  const d = await baseline(); await d.exec(ROOMS); const call = callOn(d); const ps = d.players;
  const A = { p_id: ps[0].id, p_secret: ps[0].secret };
  const room = (await call('rr_room_create', { ...A, p_settings: {} })).body.room_id;
  const seen = async () => (await rows(d, `select last_seen::text as t, xmin::text as x from game.room_seats where room_id = $1 and seat = 0`, [room]))[0];
  await d.query(`update game.room_seats set last_seen = now() - interval '5 seconds' where room_id = $1`, [room]);
  const s0 = await seen();
  for (let i = 0; i < 5; i++) assert.ok((await call('rr_room_state', { ...A, p_room: room, p_since: null })).ok);
  const s1 = await seen();
  assert.deepEqual(s1, s0, 'five polls with a fresh last_seen: the seat row was not rewritten (same xmin, same last_seen)');
  const u = await call('rr_room_state', { ...A, p_room: room, p_since: 999 }); assert.ok(u.body.unchanged, 'the unchanged path');
  await d.query(`update game.room_seats set last_seen = now() - interval '20 seconds' where room_id = $1`, [room]);
  const s2 = await seen(); await call('rr_room_state', { ...A, p_room: room, p_since: null }); const s3 = await seen();
  assert.notEqual(s3.t, s2.t, 'a stale last_seen is refreshed by the poll');
  const bad = await call('rr_room_state', { p_id: ps[1].id, p_secret: ps[1].secret, p_room: room, p_since: null });
  assert.equal(bad.code, 'not_in_room', 'a stranger still gets not_in_room');
  const none = await call('rr_room_state', { ...A, p_room: '00000000-0000-4000-8000-000000000000', p_since: null });
  assert.equal(none.code, 'room_not_found', 'an unknown room still gets room_not_found');
});
await test('S6: game.room_purge(days) deletes only rooms that ENDED more than N days ago (cascade), never lobby/playing; not callable by the API roles', async () => {
  const d = await baseline(); await d.exec(ROOMS); const call = callOn(d); const ps = d.players;
  const A = { p_id: ps[0].id, p_secret: ps[0].secret }, B = { p_id: ps[1].id, p_secret: ps[1].secret };
  const r1 = (await call('rr_room_create', { ...A, p_settings: {} })).body; await call('rr_room_join', { ...B, p_code: r1.code });
  await call('rr_room_cancel', { ...A, p_room: r1.room_id });                                     // ended
  const r2 = (await call('rr_room_create', { ...A, p_settings: {} })).body;                         // lobby
  const r3 = (await call('rr_room_create', { ...B, p_settings: {} })).body;                         // ended recently
  await call('rr_room_cancel', { ...B, p_room: r3.room_id });
  await call('rr_room_join', { ...B, p_code: 'ZZZZZ2' });                                             // a failed-join row
  await d.query(`update game.rooms set finished_at = now() - interval '40 days', last_activity = now() - interval '40 days' where id = $1`, [r1.room_id]);
  await d.query(`update game.rooms set last_activity = now() - interval '40 days', created_at = now() - interval '40 days' where id = $1`, [r2.room_id]);
  await d.query(`update game.room_join_fails set at = now() - interval '2 days'`);
  let err = null; try { await d.query(`select game.room_purge(0)`); } catch (e) { err = e.message; } assert.equal(err, 'bad_days');
  const out = (await rows(d, `select game.room_purge(30) as r`))[0].r;
  assert.deepEqual(out, { rooms: 1, join_fails: 1, older_than_days: 30 });
  const left = await rows(d, `select id, status from game.rooms order by created_at`);
  assert.deepEqual(left.map((x) => x.id).sort(), [r2.room_id, r3.room_id].sort(), 'the lobby (even 40 days idle) and the recently ended room stay');
  assert.equal((await rows(d, `select count(*)::int as n from game.room_seats where room_id = $1`, [r1.room_id]))[0].n, 0, 'seats cascade');
  assert.equal((await rows(d, `select count(*)::int as n from game.room_events where room_id = $1`, [r1.room_id]))[0].n, 0, 'events cascade');
  const [g] = await rows(d, `select has_function_privilege('anon', 'game.room_purge(int)', 'execute') as a, has_function_privilege('authenticated', 'game.room_purge(int)', 'execute') as b`);
  assert.deepEqual([g.a, g.b], [false, false]);
});

console.log(`\n${passed} passed, ${failed} failed${gaps.length ? ` · ${gaps.length} GAP probes: ${gaps.join(' ')}` : ''}`);
process.exit(failed ? 1 : 0);
