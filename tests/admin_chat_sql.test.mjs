#!/usr/bin/env node
// The moderation + chat draft (supabase/migrations/20261126_admin_mod_chat.sql) executed for real in PGlite (PostgreSQL in WASM) on
// the production baseline + 20261123_admin.sql + production_supplement.sql + the rooms draft. Nothing touches a real Supabase.
//   1. applies on that stack; ADDITIVE: the only changed objects are the two documented replacements (game.board, game.room_purge);
//      existing rows untouched; every new object is a moderation / chat object; RLS on, no policies, no table grants;
//   2. EXECUTE only for the public RPCs; writers VOLATILE; atomic (a second apply fails and changes nothing);
//   3. rules: non-admin denied on every admin RPC; ban / unban (never yourself, reason, duration, expiry); a banned player cannot create
//      or join rooms or groups, cannot chat, is off every game.board board, gets rr_ban_status; ban sweeps open rooms; admin kick (lobby /
//      mid-game forfeit) and close; host kick in the lobby only; chat members only, kicked players out, rate limits 5 / 10 s and 60 / h
//      (refusals count), 7-day sweep; reports; hide; mod log (append-only, also claim / give); remove from a group (baseline + groups v2);
//   4. the filter: every row of tests/chat_cases.mjs through game.chat_check === expected (Hebrew + English, evasions);
//   5. ROLLBACK restores the catalog (incl. triggers) exactly and keeps existing data; re-apply works; order with groups v2 / competitions.
//   RR_PGLITE=/path/to/node_modules/@electric-sql/pglite node tests/admin_chat_sql.test.mjs     (SKIP without PGlite)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CASES } from './chat_cases.mjs';

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
if (!PG) { console.log('SKIP admin_chat_sql: PGlite not found (set RR_PGLITE=<dir of @electric-sql/pglite>)'); process.exit(0); }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MINE = read('supabase/migrations/20261126_admin_mod_chat.sql');
const ROOMS = read('supabase/migrations/20261124_rooms.sql');
const rollbackOf = (sql) => { const i = sql.indexOf('-- ================================================================== ROLLBACK'); assert.ok(i > 0);
  return sql.slice(i).split('\n').filter((l) => /^-- /.test(l) && !/^-- =+/.test(l)).map((l) => l.slice(3)).join('\n'); };
const ROLLBACK = rollbackOf(MINE);

let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 8).join('\n   ')}`); }
}
const rows = async (db, text, params = []) => (await db.query(text, params)).rows;

/** baseline + admin.sql + supplement + rooms draft (= the state the draft is reviewed against) + a little existing data */
async function stack({ extra = [] } = {}) {
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
  await db.exec(read('supabase/migrations/20261123_admin.sql'));
  await db.exec(read('supabase/schema/production_supplement.sql'));
  await db.exec(`grant execute on function public.rr_sync_progress2(uuid, text, jsonb, text[], text, jsonb), public.rr_weekly(uuid, text) to anon, authenticated;`);
  await db.exec(ROOMS);
  for (const f of extra) await db.exec(read(f));
  db.players = [];
  for (const n of ['טסט־מנהל', 'טסט־א', 'טסט־ב', 'טסט־ג', 'טסט־ד']) db.players.push((await db.query(`select public.rr_register2(p_nickname => $1, p_ref => null) as r`, [n])).rows[0].r);
  const p = db.players[1];
  await db.query(`select public.rr_create_group(p_id => $1, p_secret => $2, p_name => 'טסט קבוצה')`, [p.id, p.secret]);
  return db;
}
const callOn = (d) => async (fn, args) => {
  const ks = Object.keys(args); const ph = ks.map((k, i) => `${k} => $${i + 1}`).join(', ');
  try { const r = (await d.query(`select public.${fn}(${ph}) as r`, ks.map((k) => (args[k] && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])))).rows[0].r;
    return r && r.code === 'P0001' ? { code: r.message } : { ok: true, body: r }; } catch (e) { return { code: e.message }; }
};
const au = (p) => ({ p_id: p.id, p_secret: p.secret });

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
  for (const r of await rows(db, `select schemaname || '.' || indexname as k, indexdef from pg_indexes where schemaname in ('game', 'public')`)) out.set(`idx ${r.k}`, r.indexdef);
  for (const r of await rows(db, `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
      md5(pg_get_functiondef(p.oid)) as h, p.provolatile::text as v, p.prosecdef as sd, coalesce(p.proacl::text, '') as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('game', 'public')`))
    out.set(`fn ${r.k}`, `${r.h} vol=${r.v} secdef=${r.sd} acl=${r.acl}`);
  for (const r of await rows(db, `select schemaname || '.' || tablename || ':' || policyname as k, coalesce(qual, '') as q from pg_policies where schemaname in ('game', 'public')`)) out.set(`pol ${r.k}`, r.q);
  for (const r of await rows(db, `select n.nspname || '.' || c.relname || ':' || t.tgname as k, pg_get_triggerdef(t.oid) as d from pg_trigger t
      join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('game', 'public')`)) out.set(`trg ${r.k}`, r.d);
  return out;
}
const EXISTING = ['players', 'groups', 'group_members', 'challenges', 'results', 'events', 'energy_gifts', 'admins', 'admin_setup', 'rooms', 'room_seats', 'room_events'];
async function dataHash(db) {
  const h = {};
  for (const t of EXISTING) h[t] = (await rows(db, `select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h from game.${t} x`))[0];
  return JSON.stringify(h);
}
const diff = (a, b) => {
  const changed = [], added = [], removed = [];
  for (const [k, v] of a) { if (!b.has(k)) removed.push(k); else if (b.get(k) !== v) changed.push(k); }
  for (const k of b.keys()) if (!a.has(k)) added.push(k);
  return { changed, added, removed };
};
const NEW_OBJ = /^(rel|col|con|idx|fn|pol|trg) (game\.(bans|mod_log|room_chat|chat_reports|chat_blocked)(_\w+)?([:.]|$)|game\.(is_banned|need_admin|mod|mod_log_guard|ban_guard|mod_log_claim|mod_log_give|chat_\w+|admin_seat_out)\(|public\.(rr_ban_status|rr_room_chat_\w+|rr_admin_(ban|unban|bans|player|rooms|room_chat|kick_room|close_room|remove_from_group|delete_chat|reports|mod_log))\(|game\.(room_seats|group_members|admins|energy_gifts):(room_seats_ban_guard|group_members_ban_guard|admins_mod_log|energy_gifts_mod_log)$)/;
const REPLACED = ['fn game.board(p_challenge uuid, p_weekly text, p_me uuid, p_daily text)', 'fn game.room_purge(p_days integer)'];

const db = await stack();
const before = await catalog(db); const data0 = await dataHash(db);
let after;
await test('applies on baseline + 20261123_admin.sql + production_supplement.sql + the rooms draft', async () => { await db.exec(MINE); after = await catalog(db); });
await test('additive: only the 2 documented replacements change (game.board, game.room_purge); nothing removed; existing rows untouched', async () => {
  const d = diff(before, after);
  assert.deepEqual(d.removed, []); assert.deepEqual(d.changed.sort(), [...REPLACED].sort(), 'changed: ' + d.changed.join(', '));
  assert.equal(await dataHash(db), data0);
  const foreign = d.added.filter((k) => !NEW_OBJ.test(k)); assert.deepEqual(foreign, [], 'non-moderation objects added: ' + foreign.join(', '));
  const tabs = d.added.filter((k) => /^rel game\./.test(k) && after.get(k).startsWith('r '));
  assert.deepEqual(tabs.map((k) => k.slice(4)).sort(), ['game.bans', 'game.chat_blocked', 'game.chat_reports', 'game.mod_log', 'game.room_chat']);
  for (const k of tabs) { assert.match(after.get(k), /rls=true/, k); const acl = after.get(k).split('acl=')[1]; assert.ok(acl === '' || !/(anon|authenticated)=/.test(acl), k + ' ' + acl); }
  assert.ok(![...after.keys()].some((k) => /^pol game\.(bans|mod_log|room_chat|chat_)/.test(k)));
  console.log(`   ${d.added.length} objects added (${tabs.length} tables, ${d.added.filter((k) => k.startsWith('trg ')).length} triggers), 2 replaced, 0 removed`);
});
await test('replaced game.board keeps signature, volatility, security definer and ACL; game.room_purge stays owner-only', async () => {
  for (const k of REPLACED) assert.equal(before.get(k).replace(/^\w+ /, ''), after.get(k).replace(/^\w+ /, ''), k + ' attributes changed');
  const [g] = await rows(db, `select has_function_privilege('anon', 'game.room_purge(int)', 'execute') as a`);
  assert.equal(g.a, false);
});
const PUB = ['rr_ban_status', 'rr_room_chat_send', 'rr_room_chat_list', 'rr_room_chat_report', 'rr_admin_ban', 'rr_admin_unban', 'rr_admin_bans', 'rr_admin_player', 'rr_admin_rooms',
  'rr_admin_room_chat', 'rr_admin_kick_room', 'rr_admin_close_room', 'rr_admin_remove_from_group', 'rr_admin_delete_chat', 'rr_admin_reports', 'rr_admin_mod_log'];
await test(`EXECUTE: the ${PUB.length} public RPCs for anon/authenticated; every new game.* helper for nobody but the owner; writers VOLATILE`, async () => {
  const fns = await rows(db, `select n.nspname as s, p.proname as f, p.provolatile::text as v, has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth, pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname = any($1)) or (n.nspname = 'game' and p.proname in ('is_banned','need_admin','mod','mod_log_guard','ban_guard','mod_log_claim','mod_log_give','chat_lists','chat_norm','chat_fold','chat_check','chat_sweep','chat_member','chat_refuse','admin_seat_out'))`, [PUB]);
  const pub = fns.filter((x) => x.s === 'public'); assert.equal(pub.length, PUB.length); assert.ok(pub.every((x) => x.anon && x.auth));
  const help = fns.filter((x) => x.s === 'game'); assert.equal(help.length, 15); assert.ok(help.every((x) => !x.anon && !x.auth), 'a helper is executable by the API roles');
  const writes = (d) => /\b(insert into|update game\.|delete from)\b/i.test(d) || /game\.(mod|admin_seat_out|chat_refuse|chat_sweep|room_event|room_touch)\(/.test(d);
  for (const f of pub) if (writes(f.d)) assert.equal(f.v, 'v', `${f.f} writes but is not VOLATILE`);
  assert.deepEqual(pub.filter((f) => !writes(f.d)).map((f) => f.f).sort(), ['rr_admin_bans', 'rr_admin_mod_log', 'rr_admin_player', 'rr_admin_reports', 'rr_admin_room_chat', 'rr_admin_rooms', 'rr_ban_status', 'rr_room_chat_list'].sort());
});
await test('second apply fails as a whole and changes nothing (begin … commit)', async () => {
  let err = null; try { await db.exec(MINE); } catch (e) { err = e; } assert.ok(err);
  await db.exec('rollback').catch(() => {});
  const d = diff(after, await catalog(db)); assert.deepEqual([d.changed, d.added, d.removed], [[], [], []]);
});
await test('the filter: every row of tests/chat_cases.mjs through game.chat_check (send-side clean-up first) === expected', async () => {
  const bad = [];
  for (const [t, want] of CASES) {
    const [r] = await rows(db, `select game.chat_check(btrim(regexp_replace($1, '[\\u0001-\\u001F\\u007F]+', ' ', 'g'))) as c`, [t]);
    if (r.c !== want) bad.push(`${JSON.stringify(t)} → ${r.c} (want ${want})`);
  }
  assert.deepEqual(bad, []);
  console.log(`   ${CASES.length} cases`);
});
await test('the word lists in the SQL === supabase/functions/room/chat_rules.js LISTS', async () => {
  const { LISTS } = await import('../supabase/functions/room/chat_rules.js');
  const [r] = await rows(db, `select game.chat_lists() as l`); assert.deepEqual(r.l, JSON.parse(JSON.stringify(LISTS)));
});

/* ------------------------------------------------------------------ rules */
const ADMIN_CALLS = (t, room, grp, msg) => [['rr_admin_ban', { p_target: t, p_reason: 'טסט', p_days: 1 }], ['rr_admin_unban', { p_target: t }], ['rr_admin_bans', {}],
  ['rr_admin_player', { p_target: t }], ['rr_admin_rooms', {}], ['rr_admin_room_chat', { p_room: room }], ['rr_admin_kick_room', { p_room: room, p_target: t }],
  ['rr_admin_close_room', { p_room: room }], ['rr_admin_remove_from_group', { p_group: grp, p_target: t }], ['rr_admin_delete_chat', { p_msg: msg }],
  ['rr_admin_reports', {}], ['rr_admin_mod_log', { p_before: null }]];
async function world(extra) {
  const d = await stack({ extra }); await d.exec(MINE); const call = callOn(d);
  const [ADM, A, B, C, D] = d.players;
  await d.query(`insert into game.admins (player_id) values ($1)`, [ADM.id]);
  return { d, call, ADM, A, B, C, D };
}
await test('non-admin: every admin RPC → not_admin (also a wrong secret → unauthorized); nothing is written', async () => {
  const { d, call, A, B } = await world();
  const room = (await call('rr_room_create', { ...au(B), p_settings: {} })).body.room_id;
  const grp = (await rows(d, `select id from game.groups limit 1`))[0].id;
  const msg = (await call('rr_room_chat_send', { ...au(B), p_room: room, p_text: 'שלום' })).body.id;
  const log0 = (await rows(d, `select count(*)::int as n from game.mod_log`))[0].n;
  for (const [fn, args] of ADMIN_CALLS(B.id, room, grp, msg)) {
    assert.equal((await call(fn, { ...au(A), ...args })).code, 'not_admin', fn);
    assert.equal((await call(fn, { p_id: A.id, p_secret: 'wrong-secret', ...args })).code, 'unauthorized', fn);
  }
  assert.equal((await rows(d, `select count(*)::int as n from game.bans`))[0].n, 0);
  assert.equal((await rows(d, `select count(*)::int as n from game.mod_log`))[0].n, log0);
  assert.equal((await rows(d, `select status from game.rooms where id = $1`, [room]))[0].status, 'lobby');
});
await test('ban: never yourself; reason 2–200; days 1–3650 or permanent; unknown player; re-ban updates; unban (twice → not_banned); expiry', async () => {
  const { d, call, ADM, A } = await world();
  const ban = (args) => call('rr_admin_ban', { ...au(ADM), p_target: A.id, p_reason: 'ניסה לשתף טלפון', p_days: 7, ...args });
  assert.equal((await ban({ p_target: ADM.id })).code, 'cannot_ban_self');
  assert.equal((await ban({ p_reason: 'x' })).code, 'bad_reason'); assert.equal((await ban({ p_reason: 'a'.repeat(201) })).code, 'bad_reason');
  assert.equal((await ban({ p_reason: 'שורה\u0007' })).code, 'bad_reason');
  assert.equal((await ban({ p_days: 0 })).code, 'bad_days'); assert.equal((await ban({ p_days: 3651 })).code, 'bad_days');
  assert.equal((await ban({ p_target: '00000000-0000-4000-8000-000000000000' })).code, 'player_not_found');
  const b = await ban({}); assert.ok(b.ok && b.body.banned && b.body.until > Date.now() + 6.9 * 86400e3, JSON.stringify(b));
  assert.deepEqual((await call('rr_ban_status', au(A))).body.banned, true);
  const p = await ban({ p_days: null }); assert.equal(p.body.until, null, 'permanent');
  const st = (await call('rr_ban_status', au(A))).body; assert.deepEqual([st.banned, st.permanent, st.until], [true, true, null]);
  const list = (await call('rr_admin_bans', au(ADM))).body; assert.equal(list.length, 1); assert.equal(list[0].nickname, 'טסט־א'); assert.equal(list[0].reason, 'ניסה לשתף טלפון');
  assert.deepEqual((await call('rr_admin_unban', { ...au(ADM), p_target: A.id })).body, { banned: false });
  assert.equal((await call('rr_admin_unban', { ...au(ADM), p_target: A.id })).code, 'not_banned');
  assert.equal((await call('rr_ban_status', au(A))).body.banned, false);
  await ban({ p_days: 1 }); await d.query(`update game.bans set until = now() - interval '1 second'`);
  assert.equal((await call('rr_ban_status', au(A))).body.banned, false, 'an expired ban is no ban');
  assert.equal((await call('rr_admin_bans', au(ADM))).body.length, 0);
});
await test('a banned player: no room create / join, no group create / join, no chat, off the boards; a clear code (banned); unban restores all', async () => {
  const { d, call, ADM, A, B } = await world();
  const room = (await call('rr_room_create', { ...au(B), p_settings: {} })).body;
  // a daily result for A on the board
  await call('rr_daily', au(A));
  const begin = (await call('rr_begin', { ...au(A), p_mode: 'daily', p_challenge: null })).body;
  await call('rr_finish', { ...au(A), p_result: begin.result_id, p_status: 'won', p_months: 30, p_passive: 5000, p_expenses: 4000, p_net_worth: 100000, p_stats: {} });
  const board = async () => (await call('rr_daily', au(B))).body.board.map((x) => x.nickname);
  assert.deepEqual(await board(), ['טסט־א']);
  const code = (await call('rr_create_group', { ...au(B), p_name: 'הקבוצה של ב' })).body.code;
  await call('rr_admin_ban', { ...au(ADM), p_target: A.id, p_reason: 'טסט חסימה', p_days: 3 });
  assert.equal((await call('rr_room_create', { ...au(A), p_settings: {} })).code, 'banned');
  assert.equal((await call('rr_room_join', { ...au(A), p_code: room.code })).code, 'banned');
  assert.equal((await call('rr_create_group', { ...au(A), p_name: 'קבוצה חדשה' })).code, 'banned');
  assert.equal((await call('rr_join_group', { ...au(A), p_code: code })).code, 'banned');
  assert.deepEqual(await board(), [], 'off the daily board');
  assert.equal((await call('rr_daily', au(A))).body.board.length, 0, 'also on his own view');
  assert.equal((await rows(d, `select count(*)::int as n from game.rooms where host_id = $1`, [A.id]))[0].n, 0, 'nothing half-created');
  assert.equal((await rows(d, `select count(*)::int as n from game.groups where name = 'קבוצה חדשה'`))[0].n, 0);
  await call('rr_admin_unban', { ...au(ADM), p_target: A.id });
  assert.ok((await call('rr_room_join', { ...au(A), p_code: room.code })).ok);
  assert.ok((await call('rr_join_group', { ...au(A), p_code: code })).ok);
  assert.ok((await call('rr_room_chat_send', { ...au(A), p_room: room.room_id, p_text: 'חזרתי' })).ok);
  assert.deepEqual(await board(), ['טסט־א'], 'back on the board');
});
await test('game.board: the same JSON as the baseline body for a board with no banned player (results, order, keys)', async () => {
  const { d, call, A, B, C } = await world();
  for (const [p, st, m, pas] of [[A, 'won', 40, 5000], [B, 'lost', 50, 3000], [C, 'won', 31, 4200]]) {
    const b = (await call('rr_begin', { ...au(p), p_mode: 'weekly', p_challenge: null })).body;
    await call('rr_finish', { ...au(p), p_result: b.result_id, p_status: st, p_months: m, p_passive: pas, p_expenses: 4000, p_net_worth: 9000, p_stats: { progress: 0.5 } });
  }
  const mine = (await rows(d, `select game.board(null, (game.week()->>'key'), $1)::text as b`, [A.id]))[0].b;
  await d.exec(`create schema ref;`);
  const base = read('supabase/schema/production_baseline.sql'); const src = base.slice(base.indexOf('CREATE OR REPLACE FUNCTION game.board('), base.indexOf('CREATE OR REPLACE FUNCTION game.day('));
  await d.exec(src.replace('game.board(', 'ref.board(').replace(/;?\s*$/, ';'));
  const ref = (await rows(d, `select ref.board(null, (game.week()->>'key'), $1)::text as b`, [A.id]))[0].b;
  assert.equal(mine, ref); assert.equal(JSON.parse(mine).length, 3);
});
await test('ban sweeps open rooms: lobby seat freed (host role moves, no way back by code), playing seat → forfeit + needs_tick; mod log', async () => {
  const { d, call, ADM, A, B, C } = await world();
  const r1 = (await call('rr_room_create', { ...au(A), p_settings: {} })).body; await call('rr_room_join', { ...au(B), p_code: r1.code });
  const r2 = (await call('rr_room_create', { ...au(C), p_settings: {} })).body; await call('rr_room_join', { ...au(A), p_code: r2.code });
  await d.query(`update game.rooms set status = 'playing', round = 1, started_at = now() where id = $1`, [r2.room_id]);
  await d.query(`update game.room_seats set status = 'playing' where room_id = $1`, [r2.room_id]);
  const b = await call('rr_admin_ban', { ...au(ADM), p_target: A.id, p_reason: 'מילים לא יפות', p_days: null });
  assert.equal(b.body.rooms, 2);
  const s1 = await rows(d, `select seat, player_id from game.room_seats where room_id = $1`, [r1.room_id]);
  assert.deepEqual(s1.map((x) => x.player_id), [B.id]);
  assert.equal((await rows(d, `select host_id from game.rooms where id = $1`, [r1.room_id]))[0].host_id, B.id, 'the host role moved');
  const s2 = await rows(d, `select player_id, status from game.room_seats where room_id = $1 order by seat`, [r2.room_id]);
  assert.deepEqual(s2.map((x) => x.status), ['playing', 'forfeit']);
  const [rr] = await rows(d, `select status, needs_tick from game.rooms where id = $1`, [r2.room_id]); assert.deepEqual([rr.status, rr.needs_tick], ['playing', true]);
  const ev = await rows(d, `select kind, data from game.room_events where room_id = $1 order by seq desc limit 1`, [r2.room_id]);
  assert.deepEqual([ev[0].kind, ev[0].data.why], ['forfeit', 'ban']);
  await call('rr_admin_unban', { ...au(ADM), p_target: A.id });
  assert.equal((await call('rr_room_join', { ...au(A), p_code: r1.code })).code, 'room_not_found', 'a swept lobby stays closed to him (kicked), like a host kick');
  const log = (await call('rr_admin_mod_log', { ...au(ADM), p_before: null })).body.log.map((x) => x.action);
  assert.deepEqual(log.slice(0, 2), ['unban', 'ban']);
});
await test('admin kick: lobby (host role moves; empty → cancelled) · mid-game forfeit (the room plays on) · errors · admin close · host kick lobby-only', async () => {
  const { d, call, ADM, A, B, C } = await world();
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body; await call('rr_room_join', { ...au(B), p_code: r.code }); await call('rr_room_join', { ...au(C), p_code: r.code });
  assert.equal((await call('rr_admin_kick_room', { ...au(ADM), p_room: r.room_id, p_target: ADM.id })).code, 'cannot_kick_self');
  assert.equal((await call('rr_admin_kick_room', { ...au(ADM), p_room: r.room_id, p_target: '00000000-0000-4000-8000-000000000000' })).code, 'player_not_in_room');
  assert.equal((await call('rr_admin_kick_room', { ...au(ADM), p_room: '00000000-0000-4000-8000-000000000000', p_target: A.id })).code, 'room_not_found');
  const k = await call('rr_admin_kick_room', { ...au(ADM), p_room: r.room_id, p_target: A.id });
  assert.deepEqual([k.body.result, k.body.status], ['removed', 'lobby']);
  assert.equal((await rows(d, `select host_id from game.rooms where id = $1`, [r.room_id]))[0].host_id, B.id);
  assert.equal((await call('rr_room_join', { ...au(A), p_code: r.code })).code, 'room_not_found', 'cannot come back with the code');
  // the host (B now) kicks C in the lobby → ok; after the start → room_started
  const cs = (await rows(d, `select seat from game.room_seats where room_id = $1 and player_id = $2`, [r.room_id, C.id]))[0].seat;
  assert.ok((await call('rr_room_kick', { ...au(B), p_room: r.room_id, p_seat: cs })).ok);
  const r2 = (await call('rr_room_create', { ...au(B), p_settings: {} })).body; await call('rr_room_join', { ...au(C), p_code: r2.code }); await call('rr_room_join', { ...au(A), p_code: r2.code });
  await d.query(`update game.rooms set status = 'playing', round = 3, started_at = now() where id = $1`, [r2.room_id]);
  await d.query(`update game.room_seats set status = 'playing' where room_id = $1`, [r2.room_id]);
  const seatC = (await rows(d, `select seat from game.room_seats where room_id = $1 and player_id = $2`, [r2.room_id, C.id]))[0].seat;
  assert.equal((await call('rr_room_kick', { ...au(B), p_room: r2.room_id, p_seat: seatC })).code, 'room_started', 'a host cannot kick after the start');
  const m = await call('rr_admin_kick_room', { ...au(ADM), p_room: r2.room_id, p_target: C.id });
  assert.deepEqual([m.body.result, m.body.status, m.body.needs_tick], ['forfeit', 'playing', true]);
  const seats = await rows(d, `select player_id, status, forfeit_round from game.room_seats where room_id = $1 order by seat`, [r2.room_id]);
  assert.deepEqual(seats.map((s) => s.status), ['playing', 'forfeit', 'playing'], 'only that seat; the others play on');
  assert.equal(seats[1].forfeit_round, 3);
  assert.equal((await call('rr_admin_kick_room', { ...au(ADM), p_room: r2.room_id, p_target: C.id })).code, 'seat_finished');
  assert.equal((await call('rr_room_chat_send', { ...au(C), p_room: r2.room_id, p_text: 'היי' })).code, 'not_in_room', 'a kicked player leaves the chat');
  assert.equal((await call('rr_room_chat_list', { ...au(C), p_room: r2.room_id, p_since: null })).code, 'not_in_room');
  const c = await call('rr_admin_close_room', { ...au(ADM), p_room: r2.room_id }); assert.deepEqual(c.body, { status: 'cancelled' });
  const [cl] = await rows(d, `select status, end_reason, deadline, needs_tick from game.rooms where id = $1`, [r2.room_id]);
  assert.deepEqual([cl.status, cl.end_reason, cl.deadline, cl.needs_tick], ['cancelled', 'admin', null, false]);
  assert.equal((await call('rr_admin_close_room', { ...au(ADM), p_room: r2.room_id })).code, 'room_not_open');
  assert.equal((await call('rr_admin_kick_room', { ...au(ADM), p_room: r2.room_id, p_target: A.id })).code, 'room_not_open');
  // kick the last player of a lobby → cancelled 'empty'
  const r3 = (await call('rr_room_create', { ...au(A), p_settings: {} })).body;
  await call('rr_admin_kick_room', { ...au(ADM), p_room: r3.room_id, p_target: A.id });
  const [e3] = await rows(d, `select status, end_reason from game.rooms where id = $1`, [r3.room_id]); assert.deepEqual([e3.status, e3.end_reason], ['cancelled', 'empty']);
  const rooms = (await call('rr_admin_rooms', au(ADM))).body; assert.ok(rooms.every((x) => ['lobby', 'playing'].includes(x.status)));
  assert.ok(rooms.find((x) => x.id === r.room_id).seats.every((s) => s.player_id && s.nickname));
});
await test('chat: members only, ≤ 120 chars, filter refusals are counted but never stored, list since / hidden, after-end window, nickname per message', async () => {
  const { d, call, A, B, D } = await world();
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body; await call('rr_room_join', { ...au(B), p_code: r.code });
  assert.equal((await call('rr_room_chat_send', { ...au(D), p_room: r.room_id, p_text: 'אני זר' })).code, 'not_in_room');
  assert.equal((await call('rr_room_chat_list', { ...au(D), p_room: r.room_id, p_since: null })).code, 'not_in_room');
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: '00000000-0000-4000-8000-000000000000', p_text: 'x' })).code, 'room_not_found');
  const m1 = await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: '  בהצלחה!  ' }); assert.ok(m1.ok && m1.body.id);
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'תתקשר 054-1234567' })).code, 'chat_phone');
  assert.equal((await call('rr_room_chat_send', { ...au(B), p_room: r.room_id, p_text: 'www.x.com' })).code, 'chat_link');
  assert.equal((await call('rr_room_chat_send', { ...au(B), p_room: r.room_id, p_text: 'א'.repeat(121) })).code, 'chat_too_long');
  assert.equal((await rows(d, `select count(*)::int as n from game.room_chat`))[0].n, 1, 'refused messages are not stored');
  const bl = await rows(d, `select reason from game.chat_blocked order by at`); assert.deepEqual(bl.map((x) => x.reason), ['chat_phone', 'chat_link', 'chat_too_long']);
  assert.ok(!(await rows(d, `select * from game.chat_blocked`)).some((x) => JSON.stringify(x).includes('054')), 'never the text');
  const m2 = (await call('rr_room_chat_send', { ...au(B), p_room: r.room_id, p_text: 'משחק טוב 🤝' })).body;
  const l = (await call('rr_room_chat_list', { ...au(B), p_room: r.room_id, p_since: null })).body;
  assert.deepEqual(l.msgs.map((x) => [x.text, x.nickname, x.me]), [['בהצלחה!', 'טסט־א', false], ['משחק טוב 🤝', 'טסט־ב', true]]);
  assert.equal(l.last, m2.id);
  assert.deepEqual((await call('rr_room_chat_list', { ...au(A), p_room: r.room_id, p_since: m2.id })).body.msgs, [], 'since');
  // the room ended 10 min ago → still open; 31 min → chat_closed (reading stays)
  await d.query(`update game.rooms set status = 'finished', finished_at = now() - interval '10 minutes' where id = $1`, [r.room_id]);
  assert.ok((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'משחק טוב 🤝' })).ok);
  await d.query(`update game.rooms set finished_at = now() - interval '31 minutes' where id = $1`, [r.room_id]);
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'עוד אחד' })).code, 'chat_closed');
  assert.equal((await call('rr_room_chat_list', { ...au(A), p_room: r.room_id, p_since: null })).body.msgs.length, 3);
});
await test('chat rate limits: 5 / 10 s (refusals count) and 60 / hour; the window moves on', async () => {
  const { d, call, A, B } = await world();
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body; await call('rr_room_join', { ...au(B), p_code: r.code });
  for (let i = 0; i < 4; i++) assert.ok((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'הודעה ' + i })).ok, 'msg ' + i);
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'www.x.com' })).code, 'chat_link', 'the 5th is a refusal …');
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'שישית' })).code, 'rate_limited', '… and it counts');
  assert.ok((await call('rr_room_chat_send', { ...au(B), p_room: r.room_id, p_text: 'אני בסדר' })).ok, 'per player');
  await d.exec(`update game.room_chat set created_at = created_at - interval '11 seconds'; update game.chat_blocked set at = at - interval '11 seconds'`);
  assert.ok((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'אחרי 10 שניות' })).ok);
  await d.query(`insert into game.room_chat (room_id, seat, player_id, text, created_at) select $1, 0, $2, 'ישן', now() - interval '30 minutes' from generate_series(1, 54)`, [r.room_id, A.id]);
  assert.equal((await rows(d, `select count(*)::int as n from game.room_chat where player_id = $1 and created_at > now() - interval '1 hour'`, [A.id]))[0].n, 59);
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'שעה' })).code, 'rate_limited', '59 + 1 refusal = 60 in the hour');
  await d.query(`update game.room_chat set created_at = now() - interval '61 minutes' where text = 'ישן'`);
  assert.ok((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'שוב אפשר' })).ok);
});
await test('7-day history: chat_sweep on send deletes expired messages (reports go with them); room_purge deletes chat + refusal rows too', async () => {
  const { d, call, A, B } = await world();
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body; await call('rr_room_join', { ...au(B), p_code: r.code });
  const old = (await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'ישן' })).body.id;
  await call('rr_room_chat_report', { ...au(B), p_msg: old });
  await d.query(`update game.room_chat set created_at = now() - interval '8 days' where id = $1`, [old]);
  await call('rr_room_chat_send', { ...au(B), p_room: r.room_id, p_text: 'חדש' });
  assert.equal((await rows(d, `select count(*)::int as n from game.room_chat where id = $1`, [old]))[0].n, 0);
  assert.equal((await rows(d, `select count(*)::int as n from game.chat_reports`))[0].n, 0, 'its report went with it');
  await d.query(`insert into game.room_chat (room_id, seat, player_id, text, created_at) values ($1, 0, $2, 'ישן מאוד', now() - interval '9 days')`, [r.room_id, A.id]);
  await d.query(`insert into game.chat_blocked (player_id, room_id, reason, at) values ($1, $2, 'chat_phone', now() - interval '9 days')`, [A.id, r.room_id]);
  const p = (await rows(d, `select game.room_purge(30) as r`))[0].r;
  assert.deepEqual([p.chat, p.chat_blocked, p.rooms], [1, 1, 0]);
});
await test('reports: members only, not your own, once each, ≤ 20 / hour; admin sees them (+ refusal summary) → hides (gone for players) → bans the sender', async () => {
  const { d, call, ADM, A, B, D } = await world();
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body; await call('rr_room_join', { ...au(B), p_code: r.code });
  const m = (await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'אתה גרוע' })).body.id;
  await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'snap me' });
  assert.equal((await call('rr_room_chat_report', { ...au(A), p_msg: m })).code, 'cannot_report_self');
  assert.equal((await call('rr_room_chat_report', { ...au(D), p_msg: m })).code, 'not_in_room');
  assert.equal((await call('rr_room_chat_report', { ...au(B), p_msg: 999999 })).code, 'msg_not_found');
  assert.deepEqual((await call('rr_room_chat_report', { ...au(B), p_msg: m })).body, { reported: true });
  assert.deepEqual((await call('rr_room_chat_report', { ...au(B), p_msg: m })).body, { reported: true }, 'idempotent');
  assert.equal((await rows(d, `select count(*)::int as n from game.chat_reports`))[0].n, 1);
  const rep = (await call('rr_admin_reports', au(ADM))).body;
  assert.equal(rep.reports.length, 1); assert.deepEqual([rep.reports[0].text, rep.reports[0].sender, rep.reports[0].reports, rep.reports[0].room_code], ['אתה גרוע', 'טסט־א', 1, r.code]);
  assert.deepEqual([rep.blocked[0].nickname, rep.blocked[0].n, rep.blocked[0].reasons], ['טסט־א', 1, ['chat_handle']]);
  const ac = (await call('rr_admin_room_chat', { ...au(ADM), p_room: r.room_id })).body; assert.equal(ac.find((x) => x.id === m).reports, 1);
  assert.deepEqual((await call('rr_admin_delete_chat', { ...au(ADM), p_msg: m })).body, { hidden: true });
  assert.equal((await call('rr_admin_delete_chat', { ...au(ADM), p_msg: 424242 })).code, 'msg_not_found');
  const l = (await call('rr_room_chat_list', { ...au(B), p_room: r.room_id, p_since: null })).body;
  assert.deepEqual([l.msgs.map((x) => x.id), l.hidden], [[], [m]], 'hidden for players, the id tells clients to drop it');
  assert.equal((await call('rr_admin_room_chat', { ...au(ADM), p_room: r.room_id })).body.find((x) => x.id === m).hidden, true, 'kept (flagged) for the admin');
  await call('rr_admin_ban', { ...au(ADM), p_target: A.id, p_reason: 'דווח בצ\'אט', p_days: 1 });
  assert.equal((await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'היי' })).code, 'banned');
  assert.equal((await call('rr_admin_reports', au(ADM))).body.reports[0].banned, true);
  for (let i = 0; i < 20; i++) await d.query(`insert into game.room_chat (room_id, seat, player_id, text) values ($1, 0, $2, 'x')`, [r.room_id, A.id]);
  const ids = (await rows(d, `select id from game.room_chat where text = 'x' order by id`)).map((x) => x.id);
  for (let i = 0; i < 19; i++) assert.ok((await call('rr_room_chat_report', { ...au(B), p_msg: ids[i] })).ok);
  assert.equal((await call('rr_room_chat_report', { ...au(B), p_msg: ids[19] })).code, 'rate_limited', '20 reports in the hour (incl. the first)');
});
await test('mod log: every admin action (claim and give through triggers too); append-only (UPDATE / DELETE / TRUNCATE refused); paging', async () => {
  const { d, call, ADM, A, B } = await world();
  await call('rr_admin_give', { ...au(ADM), p_to: A.id, p_amount: 5 });
  await call('rr_send_energy', { ...au(B), p_group: (await rows(d, `select id from game.groups limit 1`))[0].id, p_nickname: 'x' });   // not admin: never logged
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body;
  const msg = (await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'שלום' })).body.id;
  await call('rr_admin_delete_chat', { ...au(ADM), p_msg: msg });
  await call('rr_admin_ban', { ...au(ADM), p_target: B.id, p_reason: 'טסט', p_days: 2 }); await call('rr_admin_unban', { ...au(ADM), p_target: B.id });
  await call('rr_admin_close_room', { ...au(ADM), p_room: r.room_id });
  const log = (await call('rr_admin_mod_log', { ...au(ADM), p_before: null })).body;
  assert.deepEqual(log.log.map((x) => x.action), ['close_room', 'unban', 'ban', 'hide_chat', 'give', 'claim']);
  assert.ok(log.log.every((x) => x.admin === 'טסט־מנהל'));
  assert.deepEqual([log.log[4].target, log.log[4].data.amount], ['טסט־א', 5]); assert.equal(log.next_before, null);
  for (const q of [`update game.mod_log set action = 'x'`, `delete from game.mod_log`, `truncate game.mod_log`]) {
    let e = null; try { await d.query(q); } catch (x) { e = x.message; } assert.equal(e, 'mod_log_append_only', q);
  }
  for (let i = 0; i < 60; i++) await call('rr_admin_give', { ...au(ADM), p_to: A.id, p_amount: 1 });
  const p1 = (await call('rr_admin_mod_log', { ...au(ADM), p_before: null })).body; assert.equal(p1.log.length, 50); assert.ok(p1.next_before);
  const p2 = (await call('rr_admin_mod_log', { ...au(ADM), p_before: p1.next_before })).body; assert.equal(p2.log.length, 16);
});
await test('remove from group (baseline): a member; the owner → the oldest member owns; the last one → group deleted; admin player view', async () => {
  const { d, call, ADM, A, B, C } = await world();
  const g = (await rows(d, `select id, code from game.groups limit 1`))[0];   // owner A (players[1])
  await call('rr_join_group', { ...au(B), p_code: g.code }); await call('rr_join_group', { ...au(C), p_code: g.code });
  const pv = (await call('rr_admin_player', { ...au(ADM), p_target: B.id })).body; assert.deepEqual(pv.groups.map((x) => [x.name, x.members, x.owner]), [['טסט קבוצה', 3, false]]);
  assert.equal((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: ADM.id })).code, 'member_not_found');
  assert.deepEqual((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: C.id })).body, { removed: true, group_deleted: false });
  assert.deepEqual((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: A.id })).body, { removed: true, group_deleted: false });
  assert.equal((await rows(d, `select owner_id from game.groups where id = $1`, [g.id]))[0].owner_id, B.id);
  assert.deepEqual((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: B.id })).body, { removed: true, group_deleted: true });
  assert.equal((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: B.id })).code, 'group_not_found');
});
await test('remove from group (groups v2 applied before the draft): its own path — ban until the code rotates, the group log, owner role moves', async () => {
  const { d, call, ADM, A, B, C } = await world(['supabase/migrations/20261124_groups_v2.sql', 'supabase/migrations/20261124_competitions.sql']);
  const g = (await rows(d, `select id, code from game.groups limit 1`))[0];
  await call('rr_join_group', { ...au(B), p_code: g.code }); await call('rr_join_group', { ...au(C), p_code: g.code });
  assert.ok((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: C.id })).ok);
  assert.equal((await call('rr_join_group', { ...au(C), p_code: g.code })).code, 'group_not_found', 'v2: removed = banned until the code rotates');
  assert.ok((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: g.id, p_target: A.id })).ok);
  const roles = await rows(d, `select player_id, role from game.group_members where group_id = $1`, [g.id]);
  assert.deepEqual(roles.map((x) => [x.player_id, x.role]), [[B.id, 'owner']]);
  assert.ok((await rows(d, `select count(*)::int as n from game.group_log where kind = 'removed'`))[0].n >= 2);
  await call('rr_admin_ban', { ...au(ADM), p_target: B.id, p_reason: 'טסט', p_days: 1 });
  const code2 = (await call('rr_group_rotate_code', { ...au(B), p_group: g.id })).body;
  assert.ok(code2, 'a banned owner can still manage his existing group (no new members though)');
  const newCode = (await rows(d, `select code from game.groups where id = $1`, [g.id]))[0].code;
  assert.equal((await call('rr_join_group', { ...au(B), p_code: newCode })).ok, true, 'already a member: no insert, no ban error');
  assert.equal((await call('rr_create_group', { ...au(B), p_name: 'עוד קבוצה' })).code, 'banned');
});

/* ------------------------------------------------------------------ rollback */
await test('ROLLBACK: restores the catalog exactly (both replaced functions byte for byte, triggers gone), keeps existing data; re-apply works', async () => {
  const call = callOn(db); const [, A, B] = db.players;
  const r = (await call('rr_room_create', { ...au(A), p_settings: {} })).body;
  await call('rr_room_chat_send', { ...au(A), p_room: r.room_id, p_text: 'שלום' });
  await db.query(`insert into game.admins (player_id) values ($1) on conflict do nothing`, [db.players[0].id]);
  await call('rr_admin_ban', { ...au(db.players[0]), p_target: B.id, p_reason: 'טסט', p_days: 1 });
  const data1 = await dataHash(db);
  await db.exec(ROLLBACK);
  const d = diff(before, await catalog(db));
  assert.deepEqual([d.changed, d.added, d.removed], [[], [], []], JSON.stringify(d));
  assert.equal(await dataHash(db), data1, 'rollback changed existing data');
  await db.exec(MINE);
  const d2 = diff(after, await catalog(db)); assert.deepEqual([d2.changed, d2.added, d2.removed], [[], [], []]);
});
await test('order: rooms → this draft → groups v2 → competitions applies, and the ban guard still holds on group joins', async () => {
  const d = await stack(); await d.exec(MINE);
  await d.exec(read('supabase/migrations/20261124_groups_v2.sql')); await d.exec(read('supabase/migrations/20261124_competitions.sql'));
  const call = callOn(d); const [ADM, A, B] = d.players;
  await d.query(`insert into game.admins (player_id) values ($1)`, [ADM.id]);
  await call('rr_admin_ban', { ...au(ADM), p_target: B.id, p_reason: 'טסט', p_days: 1 });
  const code = (await rows(d, `select code from game.groups limit 1`))[0].code;
  assert.equal((await call('rr_join_group', { ...au(B), p_code: code })).code, 'banned');
  assert.ok((await call('rr_admin_remove_from_group', { ...au(ADM), p_group: (await rows(d, `select id from game.groups limit 1`))[0].id, p_target: A.id })).ok);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
