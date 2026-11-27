#!/usr/bin/env node
// Account deletion (supabase/migrations/20261127_delete_account.sql) executed for real in PGlite (PostgreSQL in WASM) on the live
// stack = production_baseline.sql + 20261123_admin.sql + production_supplement.sql. Nothing touches a real Supabase.
//   1. applies alone on the live stack; ADDITIVE (nothing existing changes; existing rows untouched); grants (rr_delete_account for
//      anon + authenticated, never PUBLIC; game.delete_player and the audit table for nobody); atomic; ROLLBACK restores the catalog;
//   2. contract: auth required, wrong confirmation, admin refused, owner transfer to the oldest remaining member, sole-member group
//      deleted, other players' results / memberships / groups untouched (row counts + content), unclaimed gifts kept for receivers,
//      idempotency (second call → unauthorized), no row anywhere keeps his id or his nickname, the audit row has no personal data;
//   3. forward compatibility, BOTH orders: drafts (groups v2 → competitions → rooms → moderation) applied before the deletion migration
//      and after it — groups v2 owner/admin roles, rooms (lobby / playing / finished, host hand-over, results scrubbed), chat, bans;
//   4. a catalog guard: every foreign key to game.players on the full stack is known (a new one must be reviewed for deletion).
//   RR_PGLITE=/path/to/node_modules/@electric-sql/pglite node tests/account_delete_sql.test.mjs     (SKIP without PGlite)
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
if (!PG) { console.log('SKIP account_delete_sql: PGlite not found (set RR_PGLITE=<dir of @electric-sql/pglite>)'); process.exit(0); }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MINE = read('supabase/migrations/20261127_delete_account.sql');
const DRAFTS = ['20261124_groups_v2.sql', '20261124_competitions.sql', '20261124_rooms.sql', '20261126_admin_mod_chat.sql'];
const rollbackOf = (sql) => { const i = sql.indexOf('-- ================================================================== ROLLBACK'); assert.ok(i > 0);
  return sql.slice(i).split('\n').filter((l) => /^-- /.test(l) && !/^-- =+/.test(l)).map((l) => l.slice(3)).join('\n'); };

let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 8).join('\n   ')}`); }
}
const rows = async (db, text, params = []) => (await db.query(text, params)).rows;

/** the live stack; then `order` = list of 'DEL' | draft file names, applied in that order */
async function stack(order = []) {
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
  for (const o of order) await db.exec(o === 'DEL' ? MINE : read('supabase/migrations/' + o));
  db.has = { v2: order.includes('20261124_groups_v2.sql'), rooms: order.includes('20261124_rooms.sql'), mod: order.includes('20261126_admin_mod_chat.sql') };
  return db;
}
const callOn = (d) => async (fn, args) => {
  const ks = Object.keys(args); const ph = ks.map((k, i) => `${k} => $${i + 1}`).join(', ');
  try { const r = (await d.query(`select public.${fn}(${ph}) as r`, ks.map((k) => (args[k] && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])))).rows[0].r;
    return { ok: true, body: r }; } catch (e) { return { code: e.message }; }
};
const au = (p) => ({ p_id: p.id, p_secret: p.secret });
const reg = async (d, n) => (await d.query(`select public.rr_register2(p_nickname => $1, p_ref => null) as r`, [n])).rows[0].r;

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
const diff = (a, b) => {
  const changed = [], added = [], removed = [];
  for (const [k, v] of a) { if (!b.has(k)) removed.push(k); else if (b.get(k) !== v) changed.push(k); }
  for (const k of b.keys()) if (!a.has(k)) added.push(k);
  return { changed, added, removed };
};
const gameTables = async (d) => (await rows(d, `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'game' and c.relkind = 'r' order by 1`)).map((r) => r.t);
async function dataHash(db, skip = []) {
  const h = {};
  for (const t of await gameTables(db)) if (!skip.includes(t)) h[t] = (await rows(db, `select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h from game.${t} x`))[0];
  return JSON.stringify(h);
}
/** every row of every game table whose text form contains `needle` (uuid or nickname) → ['table: n'] */
async function where(db, needle) {
  const out = [];
  for (const t of await gameTables(db)) { const [r] = await rows(db, `select count(*)::int as n from game.${t} x where strpos(x::text, $1) > 0`, [needle]); if (r.n) out.push(`${t}: ${r.n}`); }
  return out;
}
const NEW_OBJ = /^(rel game\.account_deletions(_pkey|_id_seq)?|col game\.account_deletions\.\w+|con game\.account_deletions:\w+|idx game\.account_deletions_pkey|fn game\.delete_player\(p_id uuid, p_via text\)|fn public\.rr_delete_account\(p_id uuid, p_secret text, p_confirm text\))$/;

/* ================================================================== 1. the migration itself on the live stack */
const db = await stack();
const before = await catalog(db);
for (const n of ['טסט־קיים־א', 'טסט־קיים־ב']) await reg(db, n);
const data0 = await dataHash(db);
let after;
await test('applies alone on baseline + 20261123_admin.sql + production_supplement.sql (the live schema)', async () => { await db.exec(MINE); after = await catalog(db); });
await test('additive: nothing existing changed or removed; only account_deletions + delete_player + rr_delete_account added; rows untouched', async () => {
  const d = diff(before, after);
  assert.deepEqual(d.removed, []); assert.deepEqual(d.changed, [], 'changed: ' + d.changed.join(', '));
  assert.deepEqual(d.added.filter((k) => !NEW_OBJ.test(k)), []);
  assert.ok(d.added.includes('fn public.rr_delete_account(p_id uuid, p_secret text, p_confirm text)') && d.added.includes('fn game.delete_player(p_id uuid, p_via text)'));
  assert.equal(await dataHash(db, ['account_deletions']), data0);
  console.log(`   ${d.added.length} objects added, 0 changed, 0 removed`);
});
await test('grants: rr_delete_account EXECUTE for anon + authenticated, not PUBLIC; delete_player + the audit table for nobody; security definer, search_path empty, VOLATILE', async () => {
  const fns = await rows(db, `select p.proname as f, p.prosecdef as sd, p.proconfig as cfg, p.provolatile::text as v, coalesce(p.proacl::text, '') as acl,
      has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname, p.proname) in (('public', 'rr_delete_account'), ('game', 'delete_player'))`);
  const pub = fns.find((x) => x.f === 'rr_delete_account'); const help = fns.find((x) => x.f === 'delete_player');
  assert.ok(pub.anon && pub.auth && pub.sd && help.sd); assert.ok(!help.anon && !help.auth);
  assert.ok(!/(^|[{,])=X/.test(pub.acl), 'PUBLIC has EXECUTE: ' + pub.acl); assert.ok(!/(^|[{,])=X/.test(help.acl), help.acl);
  for (const f of fns) { assert.deepEqual(f.cfg, ['search_path=""']); assert.equal(f.v, 'v'); }
  const [t] = await rows(db, `select has_table_privilege('anon', 'game.account_deletions', 'select') as a, has_table_privilege('authenticated', 'game.account_deletions', 'insert') as b,
      c.relrowsecurity as rls from pg_class c where c.oid = 'game.account_deletions'::regclass`);
  assert.deepEqual(t, { a: false, b: false, rls: true });
  const cols = (await rows(db, `select attname, format_type(atttypid, atttypmod) as t from pg_attribute where attrelid = 'game.account_deletions'::regclass and attnum > 0`));
  assert.ok(!cols.some((c) => c.t === 'uuid' || /nick|player|name/.test(c.attname)), 'the audit table has no personal column: ' + JSON.stringify(cols));
});
await test('as the API role: anon can call rr_delete_account (→ unauthorized for a fake id) but not game.delete_player', async () => {
  await db.exec(`grant usage on schema public to anon;`);
  await db.exec('set role anon');
  try {
    let e1 = null; try { await db.query(`select public.rr_delete_account('00000000-0000-0000-0000-000000000000', 'x', 'x')`); } catch (e) { e1 = e.message; }
    assert.equal(e1, 'unauthorized');
    let e2 = null; try { await db.query(`select game.delete_player('00000000-0000-0000-0000-000000000000', 'app')`); } catch (e) { e2 = e.message; }
    assert.match(e2, /permission denied/);
  } finally { await db.exec('reset role'); }
});
await test('second apply fails as a whole and changes nothing (begin … commit)', async () => {
  let err = null; try { await db.exec(MINE); } catch (e) { err = e; } assert.ok(err);
  await db.exec('rollback').catch(() => {});
  const d = diff(after, await catalog(db)); assert.deepEqual([d.changed, d.added, d.removed], [[], [], []]);
});
await test('ROLLBACK restores the catalog exactly and keeps existing data; re-apply works', async () => {
  await db.exec(rollbackOf(MINE));
  const d = diff(before, await catalog(db)); assert.deepEqual([d.changed, d.added, d.removed], [[], [], []]);
  assert.equal(await dataHash(db), data0);
  await db.exec(MINE); const d2 = diff(after, await catalog(db)); assert.deepEqual([d2.changed, d2.added, d2.removed], [[], [], []]);
});

/* ================================================================== 2. the contract (scenario run on every stack) */
/** players: A (deletes himself), B, C, D, ADM (admin). Groups: G1 A-owned (A, then B, then C), G2 A-only, G3 B-owned with A + C,
 *  G4 A-owned where D played a challenge and then left (A is the only member). Results, challenges, gifts, events, referral. */
async function world(d) {
  const call = callOn(d);
  const ADM = await reg(d, 'טסט־מנהל'); const A = await reg(d, 'טסט־מוחק'); const B = await reg(d, 'טסט־בני');
  const C = (await call('rr_register2', { p_nickname: 'טסט־כרמל', p_ref: A.id })).body; const D = await reg(d, 'טסט־דנה');
  await d.query(`insert into game.admins (player_id) values ($1)`, [ADM.id]);
  const g = async (p, name) => (await call('rr_create_group', { ...au(p), p_name: name })).body;
  const join = async (p, grp) => { const r = await call('rr_join_group', { ...au(p), p_code: grp.code }); assert.ok(r.ok, r.code); };
  const G1 = await g(A, 'טסט קבוצה אחת'); await d.query(`update game.group_members set joined_at = now() - interval '3 days' where group_id = $1`, [G1.id]);
  await join(B, G1); await d.query(`update game.group_members set joined_at = now() - interval '2 days' where group_id = $1 and player_id = $2`, [G1.id, B.id]);
  await join(C, G1); await d.query(`update game.group_members set joined_at = now() - interval '1 days' where group_id = $1 and player_id = $2`, [G1.id, C.id]);
  const G2 = await g(A, 'טסט קבוצה לבד');
  const G3 = await g(B, 'טסט קבוצה של בני'); await join(A, G3); await join(C, G3);
  const G4 = await g(A, 'טסט קבוצה עזובה'); await join(D, G4);
  const ch = async (p, grp, t) => (await call('rr_create_challenge2', { ...au(p), p_group: grp.id, p_title: t, p_world: 'w1', p_char: 'teacher', p_days: 3 })).body.id;
  const C1 = await ch(A, G1, 'טסט אתגר של מוחק'); const C3 = await ch(A, G3, 'טסט אתגר בקבוצה של בני'); const C3b = await ch(B, G3, 'טסט אתגר של בני'); const C4 = await ch(A, G4, 'טסט אתגר עזוב');
  const play = async (p, mode, chal = null, status = 'won') => {
    const r = (await call('rr_begin', { ...au(p), p_mode: mode, p_challenge: chal })); assert.ok(r.ok, mode + ' ' + r.code);
    await call('rr_checkpoint', { ...au(p), p_result: r.body.result_id, p_turn: 3, p_state: { v: 3, t: 3 } });
    if (status) await call('rr_finish', { ...au(p), p_result: r.body.result_id, p_status: status, p_months: 20, p_passive: 100, p_expenses: 50, p_net_worth: 999, p_stats: { progress: 1 } });
    return r.body.result_id;
  };
  for (const p of [A, B, C]) { await play(p, 'daily'); await play(p, 'weekly', null, null); }
  await play(A, 'challenge', C1); await play(B, 'challenge', C1); await play(C, 'challenge', C1, 'lost');
  await play(A, 'challenge', C3); await play(B, 'challenge', C3); await play(C, 'challenge', C3b);
  await play(D, 'challenge', C4); await call('rr_leave_group', { ...au(D), p_group: G4.id });
  // gifts: A→B unclaimed (kept for B), A→C claimed (history goes), B→A (his inbox goes), C's referral bonus to A (his inbox goes)
  assert.ok((await call('rr_send_energy', { ...au(A), p_group: G3.id, p_nickname: B.nickname })).ok);
  assert.ok((await call('rr_send_energy', { ...au(A), p_group: G3.id, p_nickname: C.nickname })).ok); await call('rr_claim_energy', au(C));
  assert.ok((await call('rr_send_energy', { ...au(B), p_group: G3.id, p_nickname: A.nickname })).ok);
  for (const p of [A, B]) assert.ok((await call('rr_log_event', { ...au(p), p_kind: 'escaped', p_data: { world: 'w1', months: 20 } })).ok);
  await call('rr_sync_progress2', { ...au(A), p_stars: { w1: 3 }, p_achievements: ['first_win'], p_pawn: 'car', p_meta: { games: 4, wins: 2 } });
  return { call, ADM, A, B, C, D, G1, G2, G3, G4, C1, C3, C3b, C4 };
}
/** everything that belongs to the others: results (all columns), memberships (without the v2 role), groups (without owner), their players rows */
async function others(d, ids) {
  const q = async (sql) => JSON.stringify(await rows(d, sql, [ids]));
  return {
    results: await q(`select r.* from game.results r where r.player_id = any($1) order by r.id`),
    members: await q(`select group_id, player_id, joined_at from game.group_members where player_id = any($1) order by 1, 2`),
    groups: await q(`select g.id, g.code, g.name, g.created_at from game.groups g where exists (select 1 from game.group_members m where m.group_id = g.id and m.player_id = any($1)) order by 1`),
    players: await q(`select id, nickname, secret_hash, stars, total_stars, achievements, pawn, daily_streak, best_streak, last_daily, meta from game.players where id = any($1) order by 1`),
    events: await q(`select * from game.events where player_id = any($1) order by id`),
    gifts_to: await q(`select id, to_id, kind, amount, day, claimed_at from game.energy_gifts where to_id = any($1) and (from_id is null or from_id = any($1)) order by id`),
  };
}
async function contract(label, order) {
  const d = await stack(order); const w = await world(d); const { call, ADM, A, B, C, D, G1, G2, G3, G4, C1, C3 } = w;
  const n = async (sql, p = []) => (await rows(d, sql, p))[0].n;
  const all0 = await dataHash(d);
  await test(`${label}: auth required — wrong secret / unknown id / nulls → unauthorized, nothing changes`, async () => {
    for (const args of [{ p_id: A.id, p_secret: 'nope', p_confirm: A.nickname }, { p_id: '00000000-0000-0000-0000-000000000000', p_secret: A.secret, p_confirm: A.nickname },
      { p_id: null, p_secret: null, p_confirm: A.nickname }, { p_id: B.id, p_secret: A.secret, p_confirm: B.nickname }])
      assert.equal((await call('rr_delete_account', args)).code, 'unauthorized', JSON.stringify(args));
    assert.equal(await dataHash(d), all0);
  });
  await test(`${label}: wrong confirmation (another nickname, empty, null, a prefix) → confirm_mismatch, nothing changes`, async () => {
    for (const c of [B.nickname, '', null, A.nickname.slice(0, 4), A.nickname + 'x'])
      assert.equal((await call('rr_delete_account', { ...au(A), p_confirm: c })).code, 'confirm_mismatch', String(c));
    assert.equal(await dataHash(d), all0);
  });
  await test(`${label}: the admin is refused (admin_cannot_delete), also through game.delete_player; nothing changes`, async () => {
    assert.equal((await call('rr_delete_account', { ...au(ADM), p_confirm: ADM.nickname })).code, 'admin_cannot_delete');
    let e = null; try { await d.query(`select game.delete_player($1, 'manual')`, [ADM.id]); } catch (x) { e = x.message; } assert.equal(e, 'admin_cannot_delete');
    assert.equal(await dataHash(d), all0);
  });
  const ids = [B.id, C.id, D.id, ADM.id];
  const o0 = await others(d, ids);
  const g1members = await rows(d, `select player_id from game.group_members where group_id = $1 and player_id <> $2 order by joined_at`, [G1.id, A.id]);
  const unclaimedAB = await n(`select count(*)::int as n from game.energy_gifts where from_id = $1 and to_id = $2 and claimed_at is null`, [A.id, B.id]);
  const resOthers = await n(`select count(*)::int as n from game.results where player_id <> $1`, [A.id]);
  const resD4 = await n(`select count(*)::int as n from game.results where player_id = $1 and challenge_id = $2`, [D.id, w.C4]);
  let res;
  await test(`${label}: delete (confirm = nickname, spaces trimmed) → exactly {deleted:true, groups_transferred:1, groups_deleted:2}`, async () => {
    const r = await call('rr_delete_account', { ...au(A), p_confirm: '  ' + A.nickname + ' ' });
    assert.ok(r.ok, r.code); res = r.body;
    // G1 handed over; G2 (alone) and G4 (alone after D left) deleted
    assert.deepEqual(res, { deleted: true, groups_transferred: 1, groups_deleted: 2 });
  });
  await test(`${label}: G1 → the oldest remaining member (B), every other member and the group itself unchanged; G2 + G4 gone; G3 keeps B as owner`, async () => {
    const [g1] = await rows(d, `select owner_id from game.groups where id = $1`, [G1.id]);
    assert.equal(g1.owner_id, g1members[0].player_id); assert.equal(g1.owner_id, B.id);
    assert.deepEqual((await rows(d, `select player_id from game.group_members where group_id = $1 order by joined_at`, [G1.id])).map((r) => r.player_id), [B.id, C.id]);
    assert.equal(await n(`select count(*)::int as n from game.groups where id = any($1)`, [[G2.id, G4.id]]), 0);
    assert.equal((await rows(d, `select owner_id from game.groups where id = $1`, [G3.id]))[0].owner_id, B.id);
    const gv = (await call('rr_group', { ...au(B), p_group: G1.id })).body; assert.equal(gv.is_owner, true); assert.equal(gv.members.length, 2);
    assert.equal((await call('rr_group', { ...au(C), p_group: G1.id })).body.is_owner, false);
    if (d.has.v2) {
      const roles = await rows(d, `select player_id, role from game.group_members where group_id = $1 order by joined_at`, [G1.id]);
      assert.deepEqual(roles.map((r) => r.role), ['owner', 'member']);
      const [lg] = await rows(d, `select actor, target, data from game.group_log where group_id = $1 and kind = 'owner' order by id desc limit 1`, [G1.id]);
      assert.deepEqual(lg, { actor: null, target: B.id, data: { auto: true, why: 'account_deleted' } });
    }
  });
  await test(`${label}: other players' results, memberships, groups, profiles and events are untouched (content), counts as expected`, async () => {
    const o1 = await others(d, ids);
    // D's result on G4's challenge goes with G4 (documented: the same as rr_leave_group of the last member); everything else identical
    const keep = (s) => JSON.parse(s).filter((r) => r.challenge_id !== w.C4);
    assert.deepEqual(JSON.parse(o1.results), keep(o0.results));
    assert.equal(await n(`select count(*)::int as n from game.results where player_id <> $1`, [A.id]), resOthers - resD4);
    assert.equal(o1.members, o0.members); assert.equal(o1.players, o0.players); assert.equal(o1.events, o0.events);
    assert.deepEqual(JSON.parse(o1.groups), JSON.parse(o0.groups).filter((g) => g.id !== G4.id));
    assert.equal(await n(`select count(*)::int as n from game.challenges where id = any($1)`, [[C1, C3, w.C3b]]), 3, 'challenges in surviving groups stay');
    assert.equal((await rows(d, `select created_by from game.challenges where id = $1`, [C3]))[0].created_by, null);
    assert.equal((await rows(d, `select created_by from game.challenges where id = $1`, [w.C3b]))[0].created_by, B.id);
    assert.equal(await n(`select count(*)::int as n from game.results where challenge_id = $1`, [C1]), 2, 'B + C results on A\'s challenge stay');
    const board = (await call('rr_group', { ...au(B), p_group: G1.id })).body.challenges[0].board;
    assert.deepEqual(board.map((r) => r.nickname).sort(), [B.nickname, C.nickname].sort());
  });
  await test(`${label}: B keeps the unclaimed ⚡ A sent (from = null, "a friend"); A's inbox and claimed history are gone; C.referred_by → null`, async () => {
    assert.equal(unclaimedAB, 1);
    assert.equal(await n(`select count(*)::int as n from game.energy_gifts where from_id is null and to_id = $1 and claimed_at is null`, [B.id]), 1);
    const cl = (await call('rr_claim_energy', au(B))).body; assert.equal(cl.total, 3); assert.equal(cl.from[0].nickname, null);
    assert.equal((await rows(d, `select referred_by from game.players where id = $1`, [C.id]))[0].referred_by, null);
  });
  await test(`${label}: no row anywhere keeps his id or his nickname; the audit row has none either`, async () => {
    assert.deepEqual(await where(d, A.id), []);
    assert.deepEqual(await where(d, A.nickname), []);
    const au0 = await rows(d, `select via, groups_transferred, groups_deleted from game.account_deletions`);
    assert.deepEqual(au0, [{ via: 'app', groups_transferred: 1, groups_deleted: 2 }]);
  });
  await test(`${label}: idempotent — a second call answers unauthorized, the profile is gone, nothing else changes`, async () => {
    const h = await dataHash(d);
    assert.equal((await call('rr_delete_account', { ...au(A), p_confirm: A.nickname })).code, 'unauthorized');
    assert.equal((await call('rr_profile', au(A))).code, 'unauthorized');
    assert.equal(await dataHash(d), h);
  });
  await test(`${label}: a fresh player with nothing deletes cleanly (0 / 0); the owner's manual path (game.delete_player 'manual') works`, async () => {
    const E = await reg(d, 'טסט־ריק'); assert.deepEqual((await call('rr_delete_account', { ...au(E), p_confirm: E.nickname })).body, { deleted: true, groups_transferred: 0, groups_deleted: 0 });
    const F = await reg(d, 'טסט־במייל'); await call('rr_create_group', { ...au(F), p_name: 'טסט של מייל' }); await call('rr_join_group', { ...au(D), p_code: (await call('rr_my_groups', au(F))).body[0].code });
    const [r] = await rows(d, `select game.delete_player($1, 'manual') as r`, [F.id]); assert.deepEqual(r.r, { deleted: true, groups_transferred: 1, groups_deleted: 0 });
    assert.deepEqual(await where(d, F.nickname), []);
    assert.deepEqual((await rows(d, `select via from game.account_deletions order by id`)).map((x) => x.via), ['app', 'app', 'manual']);
  });
  return { d, w };
}

/* -------- rooms + moderation (only on stacks that have them) */
async function roomsCase(label, order) {
  const d = await stack(order); const call = callOn(d);
  const [A, B, C, ADM] = [await reg(d, 'טסט־חדר־מוחק'), await reg(d, 'טסט־חדר־ב'), await reg(d, 'טסט־חדר־ג'), await reg(d, 'טסט־חדר־מנהל')];
  await d.query(`insert into game.admins (player_id) values ($1)`, [ADM.id]);
  if (d.has.mod) {                                                                                                 // mod_log rows about him
    assert.ok((await call('rr_admin_ban', { ...au(ADM), p_target: A.id, p_reason: 'טסט סיבה', p_days: 1 })).ok);
    assert.ok((await call('rr_admin_unban', { ...au(ADM), p_target: A.id })).ok);
  }
  const mk = async (host) => { const r = await call('rr_room_create', { ...au(host), p_settings: {} }); assert.ok(r.ok, 'create ' + r.code); return r.body; };
  const join = async (p, r) => { const x = await call('rr_room_join', { ...au(p), p_code: r.code }); assert.ok(x.ok, 'join ' + x.code); };
  // playing rooms first, idle for 3 h so they leave the 3-open-rooms cap (the deletion does not care about activity)
  const P1 = await mk(B); await join(A, P1); await join(C, P1);                                                  // playing, B hosts
  const P2 = await mk(C); await join(A, P2); await join(B, P2);                                                  // playing, A hosts (set below)
  await d.query(`update game.rooms set host_id = $2 where id = $1`, [P2.room_id, A.id]);
  for (const r of [P1, P2]) {
    await d.query(`update game.rooms set status = 'playing', round = 2, started_at = now(), last_activity = now() - interval '3 hours' where id = $1`, [r.room_id]);
    await d.query(`update game.room_seats set status = 'playing' where room_id = $1`, [r.room_id]);
  }
  const L1 = await mk(A); await join(B, L1);                                                                     // lobby, A hosts, B seated
  const L2 = await mk(A);                                                                                        // lobby, A alone
  // finished room hosted by A with B; its ranking holds both nicknames (= room_core finish())
  const F1 = await mk(B); await join(A, F1); await d.query(`update game.rooms set host_id = $2 where id = $1`, [F1.room_id, A.id]);
  const seat = async (r, p) => (await rows(d, `select seat from game.room_seats where room_id = $1 and player_id = $2`, [r, p]))[0].seat;
  const sA = await seat(F1.room_id, A.id), sB = await seat(F1.room_id, B.id);
  const results = [{ seat: sB, nickname: B.nickname, rank: 1, months: 20 }, { seat: sA, nickname: A.nickname, rank: 2, months: 30 }];
  await d.query(`update game.rooms set status = 'finished', finished_at = now(), results = $2::jsonb where id = $1`, [F1.room_id, JSON.stringify(results)]);
  await d.query(`update game.room_seats set status = 'finished', result = $3::jsonb where room_id = $1 and player_id = $2`, [F1.room_id, B.id, JSON.stringify(results[0])]);
  let chatB = null;
  if (d.has.mod) {
    const c1 = await call('rr_room_chat_send', { ...au(A), p_room: L1.room_id, p_text: 'שלום מהמוחק' }); assert.ok(c1.ok, c1.code);
    chatB = (await call('rr_room_chat_send', { ...au(B), p_room: L1.room_id, p_text: 'שלום מבני' })).body.id;
    assert.ok((await call('rr_room_chat_report', { ...au(A), p_msg: chatB })).ok);
    assert.ok((await call('rr_room_chat_report', { ...au(B), p_msg: c1.body.id })).ok);
    // banned right now (row only — rr_admin_ban would also sweep him out of the rooms): a banned player may still delete his account
    await d.query(`insert into game.bans (player_id, reason, by_id, until) values ($1, 'טסט סיבה', $2, now() + interval '1 day')`, [A.id, ADM.id]);
  }
  const seatsP1 = await rows(d, `select seat, player_id, status from game.room_seats where room_id = $1 and player_id <> $2 order by seat`, [P1.room_id, A.id]);
  await test(`${label}: rooms — delete succeeds while he sits in lobby / playing / finished rooms${d.has.mod ? ' and is banned' : ''}`, async () => {
    const r = await call('rr_delete_account', { ...au(A), p_confirm: A.nickname }); assert.ok(r.ok, r.code);
    assert.deepEqual(r.body, { deleted: true, groups_transferred: 0, groups_deleted: 0 });
  });
  await test(`${label}: rooms — lobby: host → the next seat, his seat freed; his solo lobby is gone; playing: his host role passes, the others keep playing, needs_tick`, async () => {
    const [l1] = await rows(d, `select host_id, status from game.rooms where id = $1`, [L1.room_id]); assert.equal(l1.host_id, B.id); assert.equal(l1.status, 'lobby');
    assert.deepEqual((await rows(d, `select player_id from game.room_seats where room_id = $1`, [L1.room_id])).map((x) => x.player_id), [B.id]);
    const [l2] = await rows(d, `select count(*)::int as n from game.rooms where id = $1`, [L2.room_id]); assert.equal(l2.n, 0);
    const [p1] = await rows(d, `select host_id, status, needs_tick from game.rooms where id = $1`, [P1.room_id]); assert.deepEqual(p1, { host_id: B.id, status: 'playing', needs_tick: true });
    assert.deepEqual(await rows(d, `select seat, player_id, status from game.room_seats where room_id = $1 order by seat`, [P1.room_id]), seatsP1);
    const [p2] = await rows(d, `select host_id, status from game.rooms where id = $1`, [P2.room_id]); assert.equal(p2.status, 'playing'); assert.ok([B.id, C.id].includes(p2.host_id));
    assert.equal((await rows(d, `select count(*)::int as n from game.room_events where room_id = $1 and kind = 'forfeit'`, [P1.room_id]))[0].n >= 1, true);
    const st = (await call('rr_room_state', { ...au(B), p_room: P1.room_id, p_since: null })); assert.ok(st.ok, st.code);
  });
  await test(`${label}: rooms — finished room: host passes to B, B's history stays, his nickname in results → 'שחקן לשעבר'`, async () => {
    const [f] = await rows(d, `select host_id, results from game.rooms where id = $1`, [F1.room_id]);
    assert.equal(f.host_id, B.id);
    assert.deepEqual(f.results, [results[0], { ...results[1], nickname: 'שחקן לשעבר' }]);
    assert.deepEqual((await rows(d, `select result from game.room_seats where room_id = $1 and player_id = $2`, [F1.room_id, B.id]))[0].result, results[0]);
  });
  if (d.has.mod) await test(`${label}: moderation — his chat, reports and ban are gone, B's message stays; mod_log keeps no nickname`, async () => {
    assert.equal((await rows(d, `select count(*)::int as n from game.room_chat where id = $1`, [chatB]))[0].n, 1);
    assert.equal((await rows(d, `select count(*)::int as n from game.chat_reports`))[0].n, 0, 'his report and the report on his message');
    assert.equal((await rows(d, `select count(*)::int as n from game.bans`))[0].n, 0);
  });
  await test(`${label}: rooms — nothing anywhere keeps his nickname; only the append-only mod_log may keep his random id`, async () => {
    assert.deepEqual(await where(d, A.nickname), []);
    assert.deepEqual((await where(d, A.id)).filter((x) => !/^mod_log:/.test(x)), []);
  });
}

await contract('live stack', ['DEL']);
const FULL_BEFORE = [...DRAFTS, 'DEL'], FULL_AFTER = ['DEL', ...DRAFTS];
await contract('drafts first, then deletion', FULL_BEFORE);
await contract('deletion first, then drafts', FULL_AFTER);
await contract('rooms + moderation only (no groups v2), deletion last', ['20261124_rooms.sql', '20261126_admin_mod_chat.sql', 'DEL']);

/* groups v2: an ADMIN is preferred over an older member (v2's own leave rule) */
for (const [label, order] of [['groups v2 before', FULL_BEFORE], ['groups v2 after', FULL_AFTER]]) {
  await test(`${label}: the owner's group goes to the oldest ADMIN first (v2 rule); one owner row; is_owner / my_role right`, async () => {
    const d = await stack(order); const call = callOn(d);
    const [A, B, C] = [await reg(d, 'טסט־v2־א'), await reg(d, 'טסט־v2־ב'), await reg(d, 'טסט־v2־ג')];
    const G = (await call('rr_create_group', { ...au(A), p_name: 'טסט v2' })).body;
    await call('rr_join_group', { ...au(B), p_code: G.code }); await call('rr_join_group', { ...au(C), p_code: G.code });
    const hC = (await call('rr_group', { ...au(A), p_group: G.id })).body.members.find((m) => m.nickname === C.nickname).handle;
    assert.ok((await call('rr_group_set_role', { ...au(A), p_group: G.id, p_member: hC, p_role: 'admin' })).ok);
    const r = await call('rr_delete_account', { ...au(A), p_confirm: A.nickname }); assert.ok(r.ok, r.code);
    assert.equal(r.body.groups_transferred, 1);
    assert.equal((await rows(d, `select owner_id from game.groups where id = $1`, [G.id]))[0].owner_id, C.id);
    assert.deepEqual(await rows(d, `select player_id, role from game.group_members where group_id = $1 order by player_id`, [G.id]),
      [{ player_id: B.id, role: 'member' }, { player_id: C.id, role: 'owner' }].sort((x, y) => (x.player_id < y.player_id ? -1 : 1)));
    const gc = (await call('rr_group', { ...au(C), p_group: G.id })).body; assert.equal(gc.is_owner, true);
    assert.ok((await call('rr_group_history', { ...au(C), p_group: G.id, p_before: null })).ok);
  });
}

await roomsCase('rooms + moderation, deletion last', ['20261124_rooms.sql', '20261126_admin_mod_chat.sql', 'DEL']);
await roomsCase('rooms + moderation, deletion first', ['DEL', '20261124_rooms.sql', '20261126_admin_mod_chat.sql']);
await roomsCase('rooms only, deletion last', ['20261124_rooms.sql', 'DEL']);
await roomsCase('all drafts, deletion first', FULL_AFTER);

/* ================================================================== 4. catalog guard */
const KNOWN_FK = {
  // live
  'admins.player_id': 'c', 'challenges.created_by': 'n', 'energy_gifts.from_id': 'c', 'energy_gifts.to_id': 'c', 'events.player_id': 'c',
  'group_members.player_id': 'c', 'groups.owner_id': 'c', 'players.referred_by': 'n', 'results.player_id': 'c',
  // drafts: groups v2, competitions, rooms, moderation
  'group_bans.player_id': 'c', 'group_log.actor': 'n', 'group_log.target': 'n', 'join_fails.player_id': 'c', 'challenges.cancelled_by': 'n',
  'rooms.host_id': 'c', 'room_seats.player_id': 'c', 'room_join_fails.player_id': 'c',
  'bans.player_id': 'c', 'bans.by_id': 'n', 'room_chat.player_id': 'c', 'chat_reports.reporter_id': 'c', 'chat_blocked.player_id': 'c',
};
await test('catalog guard: every foreign key to game.players on the full stack is known and reviewed for deletion (groups.owner_id + rooms.host_id handled before the delete)', async () => {
  const d = await stack(FULL_BEFORE);
  const fks = await rows(d, `select c.conrelid::regclass::text as t, a.attname as col, c.confdeltype::text as del from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] where c.contype = 'f' and c.confrelid = 'game.players'::regclass`);
  const got = Object.fromEntries(fks.map((f) => [f.t.replace(/^game\./, '') + '.' + f.col, f.del]));
  assert.deepEqual(got, KNOWN_FK, 'a foreign key to game.players changed — review game.delete_player (cascade = personal data, set null = shared content)');
  const [m] = await rows(d, `select count(*)::int as n from pg_constraint where contype = 'f' and confrelid = 'game.players'::regclass and confdeltype not in ('c', 'n')`);
  assert.equal(m.n, 0, 'a RESTRICT / NO ACTION key would make deletion fail');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
