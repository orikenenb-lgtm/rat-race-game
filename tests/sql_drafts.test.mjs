#!/usr/bin/env node
// The NOT-APPLIED migration drafts, executed for real: PGlite (PostgreSQL in WASM, npm @electric-sql/pglite + its pgcrypto) loads
// supabase/schema/production_baseline.sql, then 20261124_groups_v2.sql → 20261124_competitions.sql → 20261124_rooms.sql, and the
// RPCs are called like PostgREST would (SECURITY DEFINER functions, raised codes). It also drives the Edge Function's write path
// (supabase/functions/room/room_store.js + room_core.js + the pinned engine) against these tables. Nothing touches a real Supabase.
//   RR_PGLITE=/path/to/node_modules/@electric-sql/pglite node tests/sql_drafts.test.mjs
// Without PGlite the suite prints SKIP and exits 0 (it is not vendored; install the package @electric-sql/pglite anywhere).
// What this does NOT prove (live-only): PostgREST mapping, grants as seen by the anon key, response.status commit semantics,
// real concurrency of FOR UPDATE under load, Supabase's actual extension schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { collect, bundleText } from '../tools/build-edge.mjs';
import { loadEngine } from '../supabase/functions/verify-result/engine_loader.js';
import { ENGINE_SHA256 } from '../supabase/functions/verify-result/engine_pin.js';
import * as C from '../supabase/functions/room/room_core.js';
import { loadRoom, saveRoom, priorAction, recentRate } from '../supabase/functions/room/room_store.js';
import { botIntent, prng } from './lib/room_bot.mjs';

async function pglite() {
  const tries = [process.env.RR_PGLITE, '@electric-sql/pglite', '/tmp/pgl/node_modules/@electric-sql/pglite'].filter(Boolean);
  for (const t of tries) {
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
if (!db) { console.log('SKIP sql_drafts: PGlite not found (set RR_PGLITE=<dir of @electric-sql/pglite>)'); process.exit(0); }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const E = await loadEngine(bundleText(collect())); const E0 = E;      // the engine the Edge Function runs
let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); }
}

/* ------------------------------------------------ the baseline (a catalog dump: tables in FK order, then functions) */
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
for (const f of ['20261124_groups_v2.sql', '20261124_competitions.sql', '20261124_rooms.sql']) {
  await test(`draft ${f} applies on the production baseline`, async () => { await db.exec(read('supabase/migrations/' + f)); });
}

/* ------------------------------------------------ helpers: RPC like PostgREST (raise → error code) */
async function rpc(fn, args) {
  const keys = Object.keys(args); const ph = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const vals = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  try { const r = await db.query(`select public.${fn}(${ph}) as r`, vals); const out = r.rows[0].r; return out && out.code === 'P0001' && out.message ? { code: out.message, committed: true } : { ok: true, body: out }; }
  catch (e) { return { code: e.message }; }
}
const reg = async (n) => (await rpc('rr_register2', { p_nickname: n, p_ref: null })).body;
const au = (p) => ({ p_id: p.id, p_secret: p.secret });
const one = async (text, params = []) => (await db.query(text, params)).rows[0];

const [A, B, Cc, D, X] = [await reg('טסט־א'), await reg('טסט־ב'), await reg('טסט־ג'), await reg('טסט־ד'), await reg('טסט־זר')];

/* ------------------------------------------------ groups v2 */
let G;
await test('groups v2: create → owner role; members carry role + opaque handle; old keys intact', async () => {
  G = (await rpc('rr_create_group', { ...au(A), p_name: 'טסט קבוצה' })).body;
  assert.ok(G.id && /^[A-Z2-9]{6}$/.test(G.code));
  for (const p of [B, Cc, D]) assert.ok((await rpc('rr_join_group', { ...au(p), p_code: G.code.toLowerCase() })).ok);
  const g = (await rpc('rr_group', { ...au(A), p_group: G.id })).body;
  for (const k of ['id', 'code', 'name', 'is_owner', 'members', 'challenges', 'description', 'my_role', 'invite_open', 'member_challenges']) assert.ok(k in g, k);
  assert.equal(g.my_role, 'owner'); assert.equal(g.members.length, 4);
  assert.ok(g.members.every((m) => ['owner', 'admin', 'member'].includes(m.role) && /^[0-9a-f-]{36}$/.test(m.handle) && 'owner' in m && 'stars' in m));
  assert.ok(!JSON.stringify(g).includes(B.id), 'no player id of another member');
  const mine = (await rpc('rr_my_groups', au(B))).body; assert.deepEqual(Object.keys(mine[0]).slice(0, 6), ['id', 'code', 'name', 'is_owner', 'members', 'active']);
});
const handle = async (who, nick) => (await rpc('rr_group', { ...au(who), p_group: G.id })).body.members.find((m) => m.nickname === nick).handle;
await test('groups v2: permissions — set role (owner only), remove (owner any / admin members only), transfer, update, settings', async () => {
  const hB = await handle(A, B.nickname), hC = await handle(A, Cc.nickname), hD = await handle(A, D.nickname), hA = await handle(A, A.nickname);
  assert.equal((await rpc('rr_group_set_role', { ...au(B), p_group: G.id, p_member: hC, p_role: 'admin' })).code, 'not_allowed');
  assert.equal((await rpc('rr_group_set_role', { ...au(X), p_group: G.id, p_member: hC, p_role: 'admin' })).code, 'not_member');
  assert.equal((await rpc('rr_group_set_role', { ...au(A), p_group: G.id, p_member: hB, p_role: 'boss' })).code, 'bad_role');
  assert.equal((await rpc('rr_group_set_role', { ...au(A), p_group: G.id, p_member: '00000000-0000-4000-8000-000000000000', p_role: 'admin' })).code, 'member_not_found');
  assert.ok((await rpc('rr_group_set_role', { ...au(A), p_group: G.id, p_member: hB, p_role: 'admin' })).ok);
  assert.equal((await rpc('rr_group_remove', { ...au(B), p_group: G.id, p_member: hA })).code, 'not_allowed', 'admin cannot remove the owner');
  assert.equal((await rpc('rr_group_remove', { ...au(Cc), p_group: G.id, p_member: hD })).code, 'not_allowed', 'member cannot remove');
  assert.ok((await rpc('rr_group_remove', { ...au(B), p_group: G.id, p_member: hD })).ok, 'admin removes a member');
  const rj = await rpc('rr_join_group', { ...au(D), p_code: G.code });
  assert.equal(rj.code, 'group_not_found'); assert.equal(rj.committed, true, 'answered like a raise, but the throttle row is kept');
  assert.equal(Number((await one('select count(*) n from game.join_fails where player_id = $1', [D.id])).n), 1);
  assert.equal((await rpc('rr_group_update', { ...au(Cc), p_group: G.id, p_name: 'xx', p_description: null })).code, 'not_allowed');
  assert.equal((await rpc('rr_group_update', { ...au(B), p_group: G.id, p_name: 'טסט', p_description: 'x'.repeat(201) })).code, 'bad_description');
  assert.equal((await rpc('rr_group_update', { ...au(B), p_group: G.id, p_name: 'טסט', p_description: 'a\u0001b' })).code, 'bad_description');
  const u = (await rpc('rr_group_update', { ...au(B), p_group: G.id, p_name: 'טסט חדש', p_description: '<b>תיאור</b>' })).body;
  assert.equal(u.description, '<b>תיאור</b>', 'stored verbatim — clients escape');
  const rot = (await rpc('rr_group_rotate_code', { ...au(B), p_group: G.id })).body; assert.notEqual(rot.code, G.code);
  assert.equal((await rpc('rr_join_group', { ...au(X), p_code: G.code })).code, 'group_not_found', 'revoked code');
  assert.ok((await rpc('rr_join_group', { ...au(D), p_code: rot.code })).ok, 'removed member may rejoin with the NEW code');
  G.code = rot.code;
  assert.ok((await rpc('rr_group_settings', { ...au(A), p_group: G.id, p_invite_open: false, p_member_challenges: false })).ok);
  assert.equal((await rpc('rr_join_group', { ...au(X), p_code: G.code })).code, 'group_not_found', 'closed invite = unknown code');
  assert.equal((await rpc('rr_create_challenge2', { ...au(Cc), p_group: G.id, p_title: 'טסט', p_world: 'w1', p_char: 'teacher', p_days: 1 })).code, 'not_allowed');
  assert.ok((await rpc('rr_create_challenge2', { ...au(B), p_group: G.id, p_title: 'טסט', p_world: 'w1', p_char: 'teacher', p_days: 1 })).ok, 'admin may');
  await rpc('rr_group_settings', { ...au(A), p_group: G.id, p_invite_open: true, p_member_challenges: true });
  assert.equal((await rpc('rr_group_transfer', { ...au(B), p_group: G.id, p_member: hC })).code, 'not_allowed');
  const t = (await rpc('rr_group_transfer', { ...au(A), p_group: G.id, p_member: hC })).body; assert.equal(t.my_role, 'admin', 'old owner stays admin');
  assert.equal((await one('select owner_id from game.groups where id = $1', [G.id])).owner_id, Cc.id, 'owner_id in sync');
  assert.ok((await rpc('rr_leave_group', { ...au(Cc), p_group: G.id })).ok);
  const owner = await one(`select player_id from game.group_members where group_id = $1 and role = 'owner'`, [G.id]);
  assert.ok([A.id, B.id].includes(owner.player_id), 'owner leaves → the oldest admin becomes owner');
  assert.equal(Number((await one(`select count(*) n from game.group_members where group_id = $1 and role = 'owner'`, [G.id])).n), 1, 'exactly one owner');
  const h = (await rpc('rr_group_history', { ...au(A), p_group: G.id, p_before: null })).body;
  assert.ok(h.log.some((x) => x.kind === 'removed') && h.log.some((x) => x.kind === 'owner') && h.log.some((x) => x.kind === 'code_rotated'));
  assert.equal((await rpc('rr_group_history', { ...au(X), p_group: G.id, p_before: null })).code, 'not_member');
});
await test('groups v2: join throttle — the 21st failed code within an hour → rate_limited', async () => {
  for (let i = 0; i < 20; i++) await rpc('rr_join_group', { ...au(X), p_code: 'ZZZZZ' + (i % 8 + 2) });
  assert.equal((await rpc('rr_join_group', { ...au(X), p_code: G.code })).code, 'rate_limited');
});

/* ------------------------------------------------ competitions */
await test('competitions: create (rules frozen), validation, begin + attempts (seed k), board2 shared rank / unfinished / late / disqualified, cancel', async () => {
  await rpc('rr_join_group', { ...au(D), p_code: G.code });
  const now = Date.now();
  const mk = (p, over = {}) => rpc('rr_create_competition', { ...au(p), p_group: G.id, p_title: 'טסט תחרות', p_world: 'w2', p_char: 'chef', p_starts_at: new Date(now).toISOString(), p_ends_at: new Date(now + 4 * 3600e3).toISOString(), p_rules: { attempts: 2 }, ...over });
  for (const [over, code] of [[{ p_rules: { attempts: 4 } }, 'bad_rules'], [{ p_rules: { evil: 1 } }, 'bad_rules'], [{ p_rules: { metric: 'speed' } }, 'bad_rules'], [{ p_ends_at: new Date(now + 1800e3).toISOString() }, 'bad_window'], [{ p_world: 'w9' }, 'bad_world'], [{ p_title: 'x' }, 'bad_title']]) {
    assert.equal((await mk(A, over)).code, code, JSON.stringify(over));
  }
  assert.equal((await mk(X)).code, 'not_member');
  const c = (await mk(A)).body;
  assert.equal(c.status, 'open'); assert.equal(c.rules.attempts, 2); assert.equal(c.rules.metric, 'escape'); assert.ok([3, 4].includes(c.engine_rules));
  const seed1 = Number((await one('select seed from game.challenges where id = $1', [c.id])).seed);
  const b1 = (await rpc('rr_begin', { ...au(D), p_mode: 'challenge', p_challenge: c.id })).body;
  assert.equal(Number(b1.seed), seed1); assert.equal(b1.attempt, 1); assert.equal(b1.attempts, 2);
  assert.equal((await rpc('rr_begin_attempt', { ...au(D), p_challenge: c.id })).code, 'attempt_open');
  await rpc('rr_finish', { ...au(D), p_result: b1.result_id, p_status: 'lost', p_months: 30, p_passive: 100, p_expenses: 1000, p_net_worth: 5000, p_stats: { progress: 0.4 } });
  const b2 = (await rpc('rr_begin_attempt', { ...au(D), p_challenge: c.id })).body;
  assert.equal(b2.attempt, 2); assert.notEqual(Number(b2.seed), seed1);
  assert.equal(Number(b2.seed), Number((await one('select game.attempt_seed($1, 2) s', [seed1])).s), 'attempt k seed = the same for everyone');
  assert.equal((await rpc('rr_begin', { ...au(D), p_mode: 'challenge', p_challenge: c.id })).body.attempt, 2, 'rr_begin resumes the latest attempt');
  await rpc('rr_finish', { ...au(D), p_result: b2.result_id, p_status: 'won', p_months: 40, p_passive: 2000, p_expenses: 1000, p_net_worth: 9000, p_stats: { progress: 1 } });
  assert.equal((await rpc('rr_begin_attempt', { ...au(D), p_challenge: c.id })).code, 'attempts_used');
  // two more players: A ties with D (same metric tuple), B disqualified
  for (const [p, st, m, pas, nw, ver] of [[A, 'won', 40, 2000, 9000, null], [B, 'won', 20, 1, 1, false]]) {
    const b = (await rpc('rr_begin', { ...au(p), p_mode: 'challenge', p_challenge: c.id })).body;
    await rpc('rr_finish', { ...au(p), p_result: b.result_id, p_status: st, p_months: m, p_passive: pas, p_expenses: 1000, p_net_worth: nw, p_stats: { progress: 1 } });
    if (ver === false) await db.query('update game.results set verified = false where id = $1', [b.result_id]);
  }
  let board = (await rpc('rr_competition', { ...au(A), p_challenge: c.id })).body.board;
  const row = (n) => board.find((x) => x.nickname === n);
  assert.equal(row(D.nickname).rank, 1); assert.equal(row(A.nickname).rank, 1, 'equal keys → shared rank (no time key)');
  assert.equal(row(D.nickname).attempt, 2); assert.equal(row(D.nickname).attempts, 2, 'best attempt counts');
  assert.equal(row(B.nickname).flag, 'disqualified'); assert.equal(row(B.nickname).rank, null);
  // Cc starts but does not finish; the competition closes; then a late finish
  await rpc('rr_join_group', { ...au(Cc), p_code: G.code });
  const bc = (await rpc('rr_begin', { ...au(Cc), p_mode: 'challenge', p_challenge: c.id })).body;
  await db.query(`update game.challenges set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 hour' where id = $1`, [c.id]);
  board = (await rpc('rr_competition', { ...au(A), p_challenge: c.id })).body.board;
  assert.equal(row(Cc.nickname).flag, 'unfinished'); assert.equal(row(Cc.nickname).rank, null);
  await rpc('rr_finish', { ...au(Cc), p_result: bc.result_id, p_status: 'won', p_months: 10, p_passive: 9e3, p_expenses: 1000, p_net_worth: 1e6, p_stats: { progress: 1 } });
  await db.query(`update game.results set finished_at = now() where id = $1`, [bc.result_id]);
  await db.query(`update game.challenges set ends_at = now() - interval '3 hours', starts_at = now() - interval '9 hours' where id = $1`, [c.id]);
  board = (await rpc('rr_competition', { ...au(A), p_challenge: c.id })).body.board;
  assert.equal(row(Cc.nickname).flag, 'late', 'finished after ends_at + grace → not ranked');
  assert.equal((await rpc('rr_begin', { ...au(X), p_mode: 'challenge', p_challenge: c.id })).code, 'not_member');
  assert.equal((await rpc('rr_begin', { ...au(A), p_mode: 'challenge', p_challenge: c.id })).code, 'challenge_closed');
  const g = (await rpc('rr_group', { ...au(D), p_group: G.id })).body; assert.equal(g.challenges.find((x) => x.id === c.id).my_status, 'won', 'rr_group with attempts (no multi-row error)');
  // scheduled + cancel
  const s = (await mk(A, { p_starts_at: new Date(now + 3600e3).toISOString(), p_ends_at: new Date(now + 5 * 3600e3).toISOString(), p_rules: { join_policy: 'members_before_start' } })).body;
  assert.equal(s.status, 'scheduled'); assert.equal((await rpc('rr_begin', { ...au(D), p_mode: 'challenge', p_challenge: s.id })).code, 'not_started');
  assert.equal((await rpc('rr_cancel_competition', { ...au(D), p_challenge: s.id })).code, 'not_allowed');
  assert.equal((await rpc('rr_cancel_competition', { ...au(A), p_challenge: s.id })).body.status, 'cancelled');
  assert.equal((await rpc('rr_begin', { ...au(D), p_mode: 'challenge', p_challenge: s.id })).code, 'challenge_cancelled');
  assert.equal((await rpc('rr_cancel_competition', { ...au(A), p_challenge: s.id })).code, 'already_cancelled');
});
await test('old challenge path unchanged: rr_create_challenge2 → rr_begin (attempt 1, challenges.seed) → rr_finish → game.board', async () => {
  const c = (await rpc('rr_create_challenge2', { ...au(A), p_group: G.id, p_title: 'טסט ישן', p_world: 'w1', p_char: 'teacher', p_days: 1 })).body;
  const b = (await rpc('rr_begin', { ...au(B), p_mode: 'challenge', p_challenge: c.id })).body;
  assert.equal(Number(b.seed), Number((await one('select seed from game.challenges where id = $1', [c.id])).seed));
  assert.equal((await rpc('rr_begin', { ...au(B), p_mode: 'challenge', p_challenge: c.id })).body.result_id, b.result_id, 'idempotent');
  assert.ok((await rpc('rr_finish', { ...au(B), p_result: b.result_id, p_status: 'lost', p_months: 12, p_passive: 1, p_expenses: 2, p_net_worth: 3, p_stats: {} })).ok);
  const brd = (await rpc('rr_group', { ...au(A), p_group: G.id })).body.challenges.find((x) => x.id === c.id).board;
  assert.deepEqual(Object.keys(brd[0]).sort(), ['expenses', 'me', 'months', 'net_worth', 'nickname', 'passive', 'pawn', 'progress', 'stars', 'status', 'verified'].sort());
  const d = (await rpc('rr_begin', { ...au(B), p_mode: 'daily', p_challenge: null })).body; assert.ok(d.result_id && typeof d.streak === 'number', 'daily still works');
});

/* ------------------------------------------------ rooms: lobby RPCs (= room_core semantics) */
let R;
await test('rooms: create / join / ready / kick / leave / cancel — the SQL answers like room_core', async () => {
  assert.equal((await rpc('rr_room_create', { ...au(A), p_settings: { world: 'w9' }, p_group: null })).code, 'bad_settings');
  for (const bad of [{ help: 'guide' }, { turn_secs: '90' }, { max_rounds: 121 }, { evil: 1 }, { max_seats: 2, min_seats: 3 }, { char: 'lawyer' }]) {
    const sqlCode = (await rpc('rr_room_create', { ...au(A), p_settings: bad, p_group: null })).code;
    let core = null; try { C.normalizeSettings(E0, bad); } catch (e) { core = e.code; }
    assert.equal(sqlCode, core, JSON.stringify(bad));
  }
  const ok = await rpc('rr_room_create', { ...au(A), p_settings: { world: 'w2', char_policy: 'choose', max_rounds: 10, end: 'all', max_seats: 3 }, p_group: null });
  R = ok.body; assert.ok(R.room_id && /^[A-HJ-NP-Z2-9]{6}$/.test(R.code));
  const st = await one('select settings from game.rooms where id = $1', [R.room_id]);
  assert.deepEqual(st.settings, C.normalizeSettings(E0, { world: 'w2', char_policy: 'choose', max_rounds: 10, end: 'all', max_seats: 3 }), 'normalised settings = room_core');
  assert.equal((await rpc('rr_room_create', { ...au(A), p_settings: { privacy: 'group' }, p_group: null })).code, 'bad_settings');
  assert.equal((await rpc('rr_room_create', { ...au(X), p_settings: { privacy: 'group' }, p_group: G.id })).code, 'not_member');
  const nf = await rpc('rr_room_join', { ...au(B), p_code: 'ZZZZZ9' }); assert.equal(nf.code, 'room_not_found'); assert.ok(nf.committed);
  assert.equal((await rpc('rr_room_join', { ...au(B), p_code: R.code.toLowerCase() })).body.seat, 1);
  assert.equal((await rpc('rr_room_join', { ...au(B), p_code: R.code })).body.rejoined, true);
  assert.equal((await rpc('rr_room_join', { ...au(Cc), p_code: R.code })).body.seat, 2);
  assert.equal((await rpc('rr_room_join', { ...au(D), p_code: R.code })).code, 'room_full');
  assert.equal((await rpc('rr_room_ready', { ...au(B), p_room: R.room_id, p_ready: true, p_char: null })).code, 'bad_char');
  assert.equal((await rpc('rr_room_ready', { ...au(B), p_room: R.room_id, p_ready: true, p_char: 'teacher' })).code, 'bad_char');
  assert.equal((await rpc('rr_room_ready', { ...au(X), p_room: R.room_id, p_ready: true, p_char: 'chef' })).code, 'not_in_room');
  assert.equal((await rpc('rr_room_kick', { ...au(B), p_room: R.room_id, p_seat: 2 })).code, 'not_host');
  assert.ok((await rpc('rr_room_kick', { ...au(A), p_room: R.room_id, p_seat: 2 })).ok);
  assert.equal((await rpc('rr_room_join', { ...au(Cc), p_code: R.code })).code, 'room_not_found', 'kicked');
  assert.equal((await rpc('rr_room_react', { ...au(B), p_room: R.room_id, p_kind: 'clap' })).ok, true);
  assert.equal((await rpc('rr_room_react', { ...au(B), p_room: R.room_id, p_kind: 'clap' })).code, 'rate_limited');
  assert.equal((await rpc('rr_room_react', { ...au(A), p_room: R.room_id, p_kind: '<x>' })).code, 'bad_reaction');
  for (const [p, c] of [[A, 'lawyer'], [B, 'chef']]) assert.ok((await rpc('rr_room_ready', { ...au(p), p_room: R.room_id, p_ready: true, p_char: c })).ok);
  const hb = (await rpc('rr_room_heartbeat', { ...au(B), p_room: R.room_id, p_conn: 'tab-aaaa-0001' })).body; assert.equal(hb.primary, true);
  await rpc('rr_room_heartbeat', { ...au(B), p_room: R.room_id, p_conn: 'tab-bbbb-0002' });
  assert.equal((await rpc('rr_room_heartbeat', { ...au(B), p_room: R.room_id, p_conn: 'tab-aaaa-0001' })).body.primary, false);
  const s = (await rpc('rr_room_state', { ...au(B), p_room: R.room_id, p_since: null })).body;
  assert.equal(s.room.status, 'lobby'); assert.equal(s.room.seed, null); assert.equal(s.me.seat, 1); assert.equal(s.seats.length, 2);
  assert.equal((await rpc('rr_room_state', { ...au(B), p_room: R.room_id, p_since: s.room.version })).body.unchanged, true);
  assert.equal((await rpc('rr_room_state', { ...au(X), p_room: R.room_id, p_since: null })).code, 'not_in_room');
  const mine = (await rpc('rr_my_rooms', au(B))).body; assert.equal(mine[0].id, R.room_id); assert.equal(mine[0].seat, 1);
  // host leaves the lobby → host moves; a second room is cancelled by its host
  const R2 = (await rpc('rr_room_create', { ...au(D), p_settings: {}, p_group: null })).body;
  await rpc('rr_room_join', { ...au(X), p_code: R2.code });
  assert.ok((await rpc('rr_room_leave', { ...au(D), p_room: R2.room_id })).ok);
  assert.equal((await one('select host_id from game.rooms where id = $1', [R2.room_id])).host_id, X.id);
  assert.equal((await rpc('rr_room_cancel', { ...au(X), p_room: R2.room_id })).body.status, 'cancelled');
});
await test('rooms: limits — 3 open rooms per player, 10 rooms per day', async () => {
  const P = await reg('טסט־לימיט');
  for (let i = 0; i < 3; i++) assert.ok((await rpc('rr_room_create', { ...au(P), p_settings: {}, p_group: null })).ok);
  assert.equal((await rpc('rr_room_create', { ...au(P), p_settings: {}, p_group: null })).code, 'too_many_rooms');
  await db.query(`update game.rooms set status = 'cancelled' where host_id = $1`, [P.id]);
  for (let i = 0; i < 7; i++) { await rpc('rr_room_create', { ...au(P), p_settings: {}, p_group: null }); await db.query(`update game.rooms set status = 'cancelled' where host_id = $1`, [P.id]); }
  assert.equal((await rpc('rr_room_create', { ...au(P), p_settings: {}, p_group: null })).code, 'rate_limited');
});

/* ------------------------------------------------ the Edge write path on these tables */
async function edge(player, op, extra = {}) {    // = index.ts handle() after auth/engine, inside one transaction
  return db.transaction(async (tx) => {
    const q = (t, p = []) => tx.query(t, p).then((r) => r.rows);
    const [{ now }] = await q('select game.ms(now()) as now');
    const r = await loadRoom(q, extra.room, { lock: true }); if (!r) return { status: 403, body: { error: 'not_in_room' }, actions: [] };
    const me = r.seats.find((s) => s.player_id === player.id); if (!me) return { status: 403, body: { error: 'not_in_room' }, actions: [] };
    const ctx = { engine_sha: ENGINE_SHA256 }; const intent = op === 'act' ? extra.intent : {};
    if (op === 'act') { ctx.prior = await priorAction(q, extra.room, me.seat, intent.action_id); me.rate = await recentRate(q, extra.room, me.seat, Number(now)); }
    const v0 = r.version; const before = { next_event: r.next_event };
    const res = C.dispatch(E, r, op, { id: player.id, nickname: me.nickname, pawn: me.pawn }, intent, Number(now), ctx);
    if (r.version !== v0 || res.actions.length) await saveRoom(q, r, before, res.actions);
    return res;
  });
}
await test('rooms: Edge write path (room_store) — start, intents, idempotency, stale, state via rr_room_state, finish; nothing secret through the RPC', async () => {
  let r = await edge(B, 'start', { room: R.room_id }); assert.equal(r.body.error, 'not_host');
  r = await edge(A, 'start', { room: R.room_id }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await one('select status, engine_sha, rules, round from game.rooms where id = $1', [R.room_id]);
  assert.equal(row.status, 'playing'); assert.equal(row.engine_sha, ENGINE_SHA256); assert.equal(row.round, 1);
  const snap = async (p) => (await rpc('rr_room_state', { ...au(p), p_room: R.room_id, p_since: null })).body;
  let s = await snap(A); const seed = Number((await one('select seed from game.rooms where id = $1', [R.room_id])).seed);
  assert.equal(s.room.seed, null); assert.ok(!JSON.stringify(s).includes(String(seed)) && !JSON.stringify(s).includes('"rng"'));
  assert.ok(s.me.view && s.me.view.state && s.me.view.state.redacted === C.CORE_VERSION);
  const id = 'pg-act-00000001';
  r = await edge(A, 'act', { room: R.room_id, intent: { action_id: id, state_version: s.me.state_version, code: 'r', args: [] } }); assert.equal(r.status, 200);
  const again = await edge(A, 'act', { room: R.room_id, intent: { action_id: id, state_version: s.me.state_version, code: 'r', args: [] } });
  assert.equal(again.body.replayed, true, 'prior read from game.room_actions');
  const stale = await edge(A, 'act', { room: R.room_id, intent: { action_id: 'pg-act-00000002', state_version: s.me.state_version, code: 'L', args: [] } });
  assert.equal(stale.body.error, 'stale');
  assert.equal(Number((await one('select count(*) n from game.room_actions where room_id = $1', [R.room_id])).n), 1);
  // play the room out with bots through the store (deadline handled by moving the room's deadline into the past)
  const players = [A, B]; const rnd = prng(4); let n = 0;
  for (let guard = 0; guard < 3000; guard++) {
    s = await snap(A); if (s.room.status !== 'playing') break;
    let moved = false;
    for (const p of players) {
      const me = (await snap(p)).me; const it = botIntent(me, p === A ? 'random' : 'greedy', rnd); if (!it) continue;
      r = await edge(p, 'act', { room: R.room_id, intent: { action_id: `pg-${(++n).toString(36).padStart(8, '0')}`, state_version: me.state_version, ...it } });
      if (r.status === 422 && it.code !== 'c') r = await edge(p, 'act', { room: R.room_id, intent: { action_id: `pg-${(++n).toString(36).padStart(8, '0')}`, state_version: me.state_version, code: 'r', args: [] } });
      if (r.status === 429) await db.query(`update game.room_actions set at = at - interval '2 minutes' where room_id = $1`, [R.room_id]);
      moved = true;
    }
    if (!moved) { await db.query(`update game.rooms set deadline = now() - interval '1 second' where id = $1`, [R.room_id]); await edge(A, 'tick', { room: R.room_id }); }
  }
  s = await snap(B);
  assert.equal(s.room.status, 'finished'); assert.equal(s.room.seed, seed, 'seed revealed after the finish');
  assert.equal(s.room.results.length, 2); assert.ok(s.seats.every((x) => x.result && Number.isInteger(x.result.rank)));
  // stored state replays: E.replay(seatConfig, actions) === the jsonb state
  const seats = (await db.query('select seat, char_id, state from game.room_seats where room_id = $1 order by seat', [R.room_id])).rows;
  const room = await loadRoom((t, p) => db.query(t, p).then((x) => x.rows), R.room_id, { lock: false });
  for (const x of seats) assert.equal(E.serialize(E.replay(C.seatConfig(room, x.char_id), x.state.actions)), JSON.stringify(x.state));
  const before = JSON.stringify(s.room.results); await edge(A, 'tick', { room: R.room_id });
  assert.equal(JSON.stringify((await snap(A)).room.results), before, 'finish exactly once');
  console.log(`   ${n} intents through room_store; ${(await one('select count(*) n from game.room_actions where room_id = $1', [R.room_id])).n} action rows; ${(await one('select count(*) n from game.room_events where room_id = $1', [R.room_id])).n} events`);
});
await test('rooms: leave during play = forfeit + needs_tick; the next Edge tick closes the round', async () => {
  const R3 = (await rpc('rr_room_create', { ...au(B), p_settings: { end: 'all', max_rounds: 10 }, p_group: null })).body;
  await rpc('rr_room_join', { ...au(D), p_code: R3.code }); await rpc('rr_room_join', { ...au(X), p_code: R3.code });
  for (const p of [B, D, X]) await rpc('rr_room_ready', { ...au(p), p_room: R3.room_id, p_ready: true, p_char: null });
  assert.equal((await edge(B, 'start', { room: R3.room_id })).status, 200);
  assert.equal((await rpc('rr_room_leave', { ...au(B), p_room: R3.room_id })).body.forfeit, true);
  let s = (await rpc('rr_room_state', { ...au(D), p_room: R3.room_id, p_since: null })).body;
  assert.equal(s.room.needs_tick, true); assert.equal(s.seats.find((x) => x.seat === 0).status, 'forfeit');
  assert.equal((await rpc('rr_room_cancel', { ...au(D), p_room: R3.room_id })).body.status, 'playing', '1 of 2 active seats');
  assert.equal((await rpc('rr_room_cancel', { ...au(B), p_room: R3.room_id })).code, 'seat_finished');
  assert.equal((await rpc('rr_room_cancel', { ...au(X), p_room: R3.room_id })).body.status, 'cancelled', 'majority of active seats');
});

/* ------------------------------------------------ the deny-all model + the static engine import of index.ts */
await test('grants: anon/authenticated execute every rr_* draft RPC and no game.* function; every new table has RLS and no policy', async () => {
  const fns = (await db.query(`select p.proname, n.nspname, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'rr_%') or (n.nspname = 'game' and (p.proname like 'room%' or p.proname like 'group%' or p.proname like 'comp%' or p.proname in ('board2', 'attempt_seed', 'fail_committed', 'ms')))`)).rows;
  for (const f of fns) assert.equal(f.anon, f.nspname === 'public', `${f.nspname}.${f.proname}`);
  const t = (await db.query(`select c.relname, c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid) as pol,
      has_table_privilege('anon', c.oid, 'select') as anon from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'game' and c.relkind = 'r'`)).rows;
  for (const x of t) { assert.ok(x.relrowsecurity, x.relname + ' RLS'); assert.equal(Number(x.pol), 0, x.relname); assert.equal(x.anon, false, x.relname); }
  assert.ok(t.some((x) => x.relname === 'room_actions') && t.some((x) => x.relname === 'group_log'));
});
await test('index.ts engine import: JSON.stringify(JSON.parse(engine.bundle.json)) hashes to the pin (static import is byte-faithful)', async () => {
  const text = read('supabase/functions/verify-result/engine.bundle.json');
  assert.equal(createHash('sha256').update(JSON.stringify(JSON.parse(text))).digest('hex'), ENGINE_SHA256);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
