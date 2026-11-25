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
// Plus PROBES (printed as GAP, never failing): behaviours a production release should know about.
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
  for (const k of tabs) { assert.match(after.get(k), /rls=true/, k); assert.match(after.get(k), /acl=$/, k + ' has table grants'); }
  assert.ok(![...after.keys()].some((k) => /^pol game\.room/.test(k)), 'a room table has a policy');
  console.log(`   ${added.length} objects added (${tabs.length} tables), 0 changed, 0 removed`);
});

await test('EXECUTE: only the 10 public RPCs for anon/authenticated; game.* room helpers for nobody but the owner', async () => {
  const fns = await rows(db, `select n.nspname as s, p.proname as f, has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and (p.proname like 'rr_room_%' or p.proname = 'rr_my_rooms')) or (n.nspname = 'game' and (p.proname like 'room_%' or p.proname = 'ms'))`);
  const pub = fns.filter((x) => x.s === 'public'); const helpers = fns.filter((x) => x.s === 'game');
  assert.equal(pub.length, 10); assert.ok(pub.every((x) => x.anon && x.auth), 'a public room RPC is not executable by the API roles');
  assert.equal(helpers.length, 10); assert.ok(helpers.every((x) => !x.anon && !x.auth), 'a game.* room helper is executable by anon/authenticated');
});

await test('PostgREST transaction mode: every room RPC that writes is VOLATILE (STABLE → read-only transaction → write fails)', async () => {
  const fns = await rows(db, `select p.proname as f, p.provolatile::text as v, pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'rr_room_%' or p.proname = 'rr_my_rooms')`);
  const writes = (d) => /\b(insert into|update game\.|delete from)\b/i.test(d) || /game\.room_(lock|event|touch|back|fail)\(/.test(d);
  for (const f of fns) if (writes(f.d)) assert.equal(f.v, 'v', `${f.f} writes but is not VOLATILE`);
  const ro = fns.filter((f) => !writes(f.d)).map((f) => f.f);
  assert.deepEqual(ro, ['rr_my_rooms'], 'read-only RPCs');
  // game.auth (baseline) is STABLE and read-only, so rr_my_rooms STABLE is safe
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

/* ------------------------------------------------ probes: behaviours a release should know about (GAP = documented, never a failure) */
await test('probe: lifecycle without a cron (lazy ticks only)', async () => {
  const d = await baseline(); await d.exec(ROOMS);
  const ps = d.players;
  const call = async (fn, args) => {
    const ks = Object.keys(args); const ph = ks.map((k, i) => `${k} => $${i + 1}`).join(', ');
    try { const r = (await d.query(`select public.${fn}(${ph}) as r`, ks.map((k) => (args[k] && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])))).rows[0].r;
      return r && r.code === 'P0001' ? { code: r.message } : { ok: true, body: r }; } catch (e) { return { code: e.message }; }
  };
  const A = { p_id: ps[0].id, p_secret: ps[0].secret };
  const made = [];
  for (let i = 0; i < 3; i++) made.push((await call('rr_room_create', { ...A, p_settings: {} })).body.room_id);
  // the host closes the tab: nobody heartbeats → nobody calls the Edge tick → the lobby never expires in the DB
  await d.query(`update game.rooms set last_activity = now() - interval '3 days', created_at = now() - interval '3 days'`);
  const fourth = await call('rr_room_create', { ...A, p_settings: {} });
  if (fourth.code === 'too_many_rooms') gap('G-STALE-LOBBY', '3 lobby rooms idle for 3 days still count toward the 3-open-rooms cap (expiry runs only in an Edge tick that nobody triggers) → the player cannot create or join a room until they open each one (the hub lists them) or leave it');
  else assert.ok(fourth.ok, JSON.stringify(fourth));
  const st = (await call('rr_room_state', { ...A, p_room: made[0], p_since: null })).body;
  if (st.room.status === 'lobby' && st.room.needs_tick) gap('G-LAZY-EXPIRY', 'rr_room_state of a 3-day-idle lobby answers status=lobby, needs_tick=true: the room expires only when a client then calls the Edge tick');
  const code = st.room.code; const B = { p_id: ps[1].id, p_secret: ps[1].secret };
  const j = await call('rr_room_join', { ...B, p_code: code });
  if (j.ok) gap('G-JOIN-EXPIRED', 'a lobby idle past its 2 h expiry is still joinable by code until some client ticks it');
  // playing room after a redeploy with another pin: the Edge answers 409 version_changed to every op (tick included), so it is never abandoned
  await d.query(`update game.rooms set status = 'playing', engine_sha = repeat('a', 64), round = 1, started_at = now() - interval '3 days' where id = $1`, [made[1]]);
  await d.query(`update game.room_seats set status = 'playing' where room_id = $1`, [made[1]]);
  const left = await call('rr_room_leave', { ...A, p_room: made[1] });
  assert.ok(left.ok && left.body.forfeit, 'leaving a playing room is SQL-only (forfeit) and works whatever the pin');
  gap('G-PIN-ORPHAN', 'a room that was playing when the engine pin changed answers 409 version_changed to start/act/tick (index.ts:87) — it can only end by a cancel vote or by every player leaving (SQL); no deploy ever abandons it. Release step: cancel playing rooms with engine_sha ≠ the new pin');
});

console.log(`\n${passed} passed, ${failed} failed · ${gaps.length} GAP probes: ${gaps.join(' ')}`);
process.exit(failed ? 1 : 0);
