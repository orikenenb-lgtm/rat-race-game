#!/usr/bin/env node
// Worlds wave 0 (I9): the NOT-APPLIED draft supabase/migrations/20261125_worlds.sql, executed for real on the production baseline in
// PGlite (PostgreSQL in WASM). Nothing touches a real Supabase. Without PGlite the suite prints SKIP and exits 0.
//   RR_PGLITE=/path/to/node_modules/@electric-sql/pglite node tests/worlds_db_draft.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

async function pglite() {
  for (const t of [process.env.RR_PGLITE, '@electric-sql/pglite', '/tmp/pgl/node_modules/@electric-sql/pglite'].filter(Boolean)) {
    try {
      const base = t.startsWith('/') ? pathToFileURL(t.replace(/\/$/, '') + '/dist/index.js').href : t;
      const crypto = t.startsWith('/') ? pathToFileURL(t.replace(/\/$/, '') + '/dist/contrib/pgcrypto.js').href : t + '/contrib/pgcrypto';
      const { PGlite } = await import(base); const { pgcrypto } = await import(crypto);
      return new PGlite({ extensions: { pgcrypto } });
    } catch (e) { /* next */ }
  }
  return null;
}
const db = await pglite();
if (!db) { console.log('SKIP worlds_db_draft: PGlite not found (set RR_PGLITE=<dir of @electric-sql/pglite>)'); process.exit(0); }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await db.exec(`create schema game; create schema extensions; create extension pgcrypto with schema extensions;
  create role anon; create role authenticated; create sequence game.events_id_seq;`);
{
  const sql = read('supabase/schema/production_baseline.sql');
  const blocks = sql.split(/\n(?=create table |CREATE OR REPLACE FUNCTION )/);
  const tables = {}; const funcs = [];
  for (const b of blocks) { const m = /^create table game\.(\w+)/.exec(b); if (m) tables[m[1]] = b; else if (b.startsWith('CREATE OR REPLACE FUNCTION')) funcs.push(b.replace(/\n--[^\n]*/g, '')); }
  for (const t of ['players', 'groups', 'group_members', 'challenges', 'results', 'events', 'energy_gifts', 'admins', 'admin_setup']) await db.exec(tables[t]);
  for (const f of funcs) await db.exec(f.trim().replace(/;?\s*$/, ';'));
  await db.exec(`grant execute on all functions in schema public to anon, authenticated;`);
}
async function rpc(fn, args) {
  const keys = Object.keys(args); const ph = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const vals = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  try { const r = await db.query(`select public.${fn}(${ph}) as r`, vals); return { ok: true, body: r.rows[0].r }; } catch (e) { return { code: e.message }; }
}
const one = async (text, params = []) => (await db.query(text, params)).rows[0];
const reg = async (n) => (await rpc('rr_register2', { p_nickname: n, p_ref: null })).body;
const au = (p) => ({ p_id: p.id, p_secret: p.secret });

// the rotation before the migration (game.day / game.week of the baseline), to compare after it
const dayBefore = (await one('select game.day()::json as d')).d; const weekBefore = (await one('select game.week()::json as w')).w;

await test('draft 20261125_worlds.sql applies on the production baseline', async () => { await db.exec(read('supabase/migrations/20261125_worlds.sql')); });

await test('game.worlds: w1–w4 ranked with today\'s bounds; w5 unranked with bigger bounds; ids checked', async () => {
  const rows = (await db.query('select id, ranked, nw_max::text, passive_max::text from game.worlds order by ord')).rows;
  assert.deepEqual(rows.map((r) => r.id), ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16', 'w17']);
  assert.ok(rows.slice(0, 4).every((r) => r.ranked && r.nw_max === '2000000000' && r.passive_max === '100000000'));
  assert.equal(rows[4].ranked, false);
  await assert.rejects(db.exec(`insert into game.worlds(id, ord, nw_max, passive_max, expenses_max) values ('w26', 26, 2000000, 20000, 20000)`));
});

await test('rotation from the table: game.day() / game.week() give exactly the baseline world', async () => {
  const d = (await one('select game.day()::json as d')).d; const w = (await one('select game.week()::json as w')).w;
  assert.equal(d.world, dayBefore.world); assert.equal(w.world, weekBefore.world); assert.equal(d.seed, dayBefore.seed);
  const all = (await db.query(`select slot, world from game.world_rotation where kind = 'daily' order by slot`)).rows.map((r) => r.world);
  assert.deepEqual(all, ['w1', 'w2', 'w1', 'w3', 'w1', 'w4', 'w2']);
});

await test('results money columns are bigint: ₪2.5 billion fits; rr_finish2 enforces the world bounds; rr_finish keeps the old limits', async () => {
  const types = (await db.query(`select column_name, data_type from information_schema.columns where table_schema = 'game' and table_name = 'results' and column_name in ('net_worth','passive','expenses') order by 1`)).rows;
  assert.ok(types.every((t) => t.data_type === 'bigint'), JSON.stringify(types));
  const P = await reg('טסט־עולמות');
  let day = 10; const mk = async (world) => (await one(`insert into game.results(player_id, daily_key, profession, world) values ($1, $2, 'idx:0', $3) returning id`, [P.id, 'D2026-12-' + (day++), world])).id;
  // rr_finish2 in a ranked world: inside the bounds ok, outside → bad_values
  const r1 = await mk('w1');
  assert.equal((await rpc('rr_finish2', { ...au(P), p_result: r1, p_status: 'won', p_months: 40, p_passive: 120000000, p_expenses: 50000, p_net_worth: 1000000, p_stats: {} })).code, 'bad_values', 'w1 passive bound');
  assert.ok((await rpc('rr_finish2', { ...au(P), p_result: r1, p_status: 'won', p_months: 40, p_passive: 9000, p_expenses: 8000, p_net_worth: 1999999999, p_stats: {} })).ok);
  // an unranked world cannot finish a ranked row
  const r5 = await mk('w5');
  assert.equal((await rpc('rr_finish2', { ...au(P), p_result: r5, p_status: 'won', p_months: 60, p_passive: 300000, p_expenses: 55000, p_net_worth: 25000000, p_stats: {} })).code, 'bad_world');
  // once w5 is ranked, ₪2.5B (> integer) is stored exactly
  await db.exec(`update game.worlds set ranked = true where id = 'w5'`);
  assert.ok((await rpc('rr_finish2', { ...au(P), p_result: r5, p_status: 'won', p_months: 60, p_passive: 300000, p_expenses: 55000, p_net_worth: 2500000000, p_stats: {} })).ok);
  assert.equal((await one('select net_worth::text as v from game.results where id = $1', [r5])).v, '2500000000');
  await db.exec(`update game.worlds set ranked = false where id = 'w5'`);
  // the old RPC still refuses what the old columns could not hold
  const r2 = await mk('w2');
  const old = await rpc('rr_finish', { ...au(P), p_result: r2, p_status: 'won', p_months: 40, p_passive: 1, p_expenses: 1, p_net_worth: 2000000001, p_stats: {} });
  assert.ok(old.code, 'rr_finish (integer parameters, ±₪2B) refuses ₪2,000,000,001: ' + JSON.stringify(old));
});

await test('challenges: any ranked world by FK (w5 refused while unranked; an unknown id refused by the FK)', async () => {
  const A = await reg('טסט־אתגר'); const g = (await rpc('rr_create_group', { ...au(A), p_name: 'קבוצת עולמות' })).body;
  assert.ok((await rpc('rr_create_challenge2', { ...au(A), p_group: g.id, p_title: 'אתגר', p_world: 'w4', p_char: 'founder', p_days: 3 })).ok);
  assert.equal((await rpc('rr_create_challenge2', { ...au(A), p_group: g.id, p_title: 'אתגר', p_world: 'w5', p_char: 'hotelier', p_days: 3 })).code, 'bad_world');
  await db.exec(`update game.worlds set ranked = true where id = 'w5'`);
  assert.ok((await rpc('rr_create_challenge2', { ...au(A), p_group: g.id, p_title: 'אתגר 5', p_world: 'w5', p_char: 'hotelier', p_days: 3 })).ok);
  await db.exec(`update game.worlds set ranked = false where id = 'w5'`);
  await assert.rejects(db.exec(`insert into game.challenges(group_id, title, profession, world, seed, ends_at) values ('${g.id}', 'xx', 'teacher', 'w26', 5, now() + interval '1 day')`));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
