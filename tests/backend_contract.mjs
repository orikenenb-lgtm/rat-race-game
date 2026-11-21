#!/usr/bin/env node
// Backend contract test (T7 §2.8, FB-6): every rr_* RPC of the §2.4 table (happy path + response shape), every listed error
// code, every limit at its boundary, rr_begin idempotency, stale_checkpoint, the verify-result status codes, and the cases of
// security_live.mjs (auth, cross-player access, no table access through REST).
//   node tests/backend_contract.mjs                     → starts the fake in HTTP mode (python3 tests/fakebackend.py --serve 8779)
//   node tests/backend_contract.mjs --target=http://127.0.0.1:8779     (an already running fake)
//   RR_LIVE=1 RR_SB_URL=https://<staging>.supabase.co RR_SB_ANON=… node tests/backend_contract.mjs --live   (staging only)
// Output: one line per case PASS / FAIL / DIFF-ASSUMED (staging differs on an assumed S-row of T7 §2.6) / SKIP (fake-only helper).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const LIVE = process.argv.includes('--live');
const PROD_REF = 'xvqaxphyfqdzkddmoosu';
let TARGET = arg('target', null), KEY = 'fake-anon', child = null;
if (LIVE) {
  const m = /^https:\/\/([a-z0-9]{8,40})\.supabase\.co\/?$/.exec(process.env.RR_SB_URL || '');
  if (process.env.RR_LIVE !== '1' || !m || m[1] === PROD_REF || !process.env.RR_SB_ANON) {
    console.error('REFUSED --live: needs RR_LIVE=1, RR_SB_URL=<non-production staging URL>, RR_SB_ANON (CR-22: no staging exists yet).'); process.exit(2);
  }
  TARGET = process.env.RR_SB_URL.replace(/\/$/, ''); KEY = process.env.RR_SB_ANON;
}
if (!TARGET) {
  const port = +arg('port', '8779');
  child = spawn('python3', [join(HERE, 'fakebackend.py'), '--serve', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  TARGET = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(TARGET + '/__fake/health')).ok) break; } catch (e) { /* not up yet */ } await sleep(100); }
  process.on('exit', () => child && child.kill());
}
const FAKE = !LIVE;
const out = { pass: 0, fail: 0, diff: 0, skip: 0 };
const line = (tag, name, ev) => { console.log(`${tag.padEnd(12)} ${name}${ev === undefined ? '' : '  ' + JSON.stringify(ev).slice(0, 200)}`); };
function check(name, ok, ev) { ok ? out.pass++ : out.fail++; line(ok ? 'PASS' : 'FAIL', name, ok ? undefined : ev); }
function assumed(sRow, name, ok, ev) { if (ok) { out.pass++; line('PASS', `${name} [${sRow}]`); } else if (LIVE) { out.diff++; line('DIFF-ASSUMED', `${name} [${sRow}]`, ev); } else { out.fail++; line('FAIL', `${name} [${sRow}]`, ev); } }
const skip = (name, why) => { out.skip++; line('SKIP', `${name} (${why})`); };

async function rpc(fn, args = {}) {
  const r = await fetch(`${TARGET}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, body: j, code: r.ok ? null : j?.message ?? j?.code };
}
async function verify(body, raw) {
  const r = await fetch(`${TARGET}/functions/v1/verify-result`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const advance = async (b) => FAKE ? (await fetch(TARGET + '/__fake/advance', { method: 'POST', body: JSON.stringify(b) })).ok : false;
const auth = (p) => ({ p_id: p.id, p_secret: p.secret });
const T = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const shape = (o, spec) => o && typeof o === 'object' && Object.entries(spec).every(([k, t]) => t.split('|').includes(T(o[k])));
const keysEq = (o, ks) => o && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...ks].sort());
const tag = Math.floor(Math.random() * 9000 + 1000);
const reg = async (n, ref = null) => (await rpc('rr_register2', { p_nickname: n, p_ref: ref })).body;
const BOARD_KEYS = ['nickname', 'status', 'months', 'net_worth', 'passive', 'expenses', 'me', 'stars', 'pawn', 'progress', 'verified'];

// engine (honest games for verify): the same code the Edge Function bundles
const E = await import(join(ROOT, 'js', 'engine.js'));
const VC = await import(join(ROOT, 'supabase', 'functions', 'verify-result', 'verify_core.js'));
const { playOut, prng } = await import(join(HERE, 'lib', 'random-player.mjs'));

console.log(`backend contract · target=${FAKE ? 'fake ' + TARGET : 'staging ' + TARGET}`);
// ---------------------------------------------------------------- register / rename / profile / sync
let r = await rpc('rr_register2', { p_nickname: `טסט-A-${tag}`, p_ref: null });
const A = r.body; check('rr_register2 happy + shape {id,secret,nickname}', r.ok && keysEq(A, ['id', 'secret', 'nickname']) && shape(A, { id: 'string', secret: 'string', nickname: 'string' }), r);
const B = await reg(`טסט-B-${tag}`); const C = await reg(`טסט-C-${tag}`);
for (const [n, ok] of [['x', false], ['ab', true], ['x'.repeat(20), true], ['x'.repeat(21), false], ['   ', false]]) {
  r = await rpc('rr_register2', { p_nickname: n === 'ab' ? 'ab' : n, p_ref: null });
  check(`rr_register2 nickname length ${n.trim().length} → ${ok ? 'ok' : 'bad_nickname'}`, ok ? r.ok : r.code === 'bad_nickname', r);
}
r = await rpc('rr_rename', { ...auth(B), p_nickname: `טסט<i>${tag}</i>` }); check('rr_rename stores HTML verbatim → {nickname}', r.ok && r.body.nickname === `טסט<i>${tag}</i>`, r);
r = await rpc('rr_rename', { ...auth(B), p_nickname: 'x' }); check('rr_rename bad_nickname', r.code === 'bad_nickname', r);
r = await rpc('rr_profile', auth(A));
check('rr_profile shape', r.ok && shape(r.body, { id: 'string', nickname: 'string', stars: 'object', total_stars: 'number', achievements: 'array', daily_streak: 'number', best_streak: 'number' }), r);
r = await rpc('rr_profile', { p_id: A.id, p_secret: 'wrong-secret-0000' }); check('wrong secret → unauthorized', r.code === 'unauthorized', r);
r = await rpc('rr_sync_progress2', { ...auth(A), p_stars: { w1: 99, w2: 3, '<x>': 3 }, p_achievements: ['<img src=x>', 'ok_one'], p_pawn: '<svg/onload=1>', p_meta: { games: 3, wins: 1, best: { w1: 20 } } });
check('rr_sync_progress2 caps stars at 3, drops unknown keys / bad ids / bad pawn', r.ok && r.body.stars.w1 === 3 && !JSON.stringify(r.body).includes('<'), r);
r = await rpc('rr_sync_progress2', { ...auth(A), p_stars: { w1: 1 }, p_achievements: [], p_pawn: null, p_meta: { games: 1, wins: 5, best: { w1: 30 } } });
check('rr_sync_progress2 merges: max stars, max games/wins, min best', r.ok && r.body.stars.w1 === 3 && r.body.meta.games === 3 && r.body.meta.wins === 5 && r.body.meta.best.w1 === 20, r.body?.meta);

// ---------------------------------------------------------------- groups
r = await rpc('rr_create_group', { ...auth(A), p_name: `טסט חוזה ${tag}` }); const G = r.body;
check('rr_create_group happy (id, code [A-Z2-9]{6})', r.ok && /^[A-Z2-9]{6}$/.test(G.code) && typeof G.id === 'string', r);
assumed('S-4', 'rr_create_group response = {id, code, name, is_owner, members, active}', keysEq(G, ['id', 'code', 'name', 'is_owner', 'members', 'active']), G);
for (const [n, ok] of [['x', false], ['ab', true], ['x'.repeat(40), true], ['x'.repeat(41), false]]) {
  r = await rpc('rr_create_group', { ...auth(C), p_name: n }); check(`rr_create_group name length ${n.length} → ${ok ? 'ok' : 'bad_name'}`, ok ? r.ok : r.code === 'bad_name', r);
}
for (let i = 0; i < 18; i++) await rpc('rr_create_group', { ...auth(C), p_name: `טסט ${i}` });
r = await rpc('rr_create_group', { ...auth(C), p_name: 'טסט 21' }); check('21st group → too_many_groups (limit 20)', r.code === 'too_many_groups', r);
r = await rpc('rr_join_group', { ...auth(B), p_code: G.code.toLowerCase() });
check('rr_join_group (lower-case code) → {id,code,name,is_owner:false,members:2,active}', r.ok && r.body.members === 2 && r.body.is_owner === false, r);
r = await rpc('rr_join_group', { ...auth(B), p_code: G.code }); check('rr_join_group is idempotent', r.ok && r.body.members === 2, r);
r = await rpc('rr_join_group', { ...auth(B), p_code: 'ZZZZZ9' }); check('rr_join_group group_not_found', r.code === 'group_not_found', r);
r = await rpc('rr_my_groups', auth(B)); check('rr_my_groups → [{id,code,name,is_owner,members,active}]', r.ok && Array.isArray(r.body) && shape(r.body[0], { id: 'string', code: 'string', name: 'string', is_owner: 'boolean', members: 'number', active: 'number' }), r);
r = await rpc('rr_group', { ...auth(A), p_group: G.id });
check('rr_group shape (members[{nickname,owner,me,stars,pawn}], challenges[])', r.ok && Array.isArray(r.body.members) && r.body.members.length === 2 && shape(r.body.members[0], { nickname: 'string', owner: 'boolean', me: 'boolean', stars: 'number' }) && Array.isArray(r.body.challenges), r);
r = await rpc('rr_group', { ...auth(C), p_group: G.id }); check('non-member cannot read a group → not_member', r.code === 'not_member', r);
r = await rpc('rr_group', { ...auth(B), p_group: '00000000-0000-0000-0000-000000000000' }); check('unknown group → not_member', r.code === 'not_member', r);
{ // group_full: 50 members
  const g = (await rpc('rr_create_group', { ...auth(B), p_name: `טסט מלא ${tag}` })).body;
  for (let i = 0; i < 49; i++) { const p = await reg(`טסט-m${i}-${tag}`.slice(0, 20)); await rpc('rr_join_group', { ...auth(p), p_code: g.code }); }
  const late = await reg(`טסט-late-${tag}`); r = await rpc('rr_join_group', { ...auth(late), p_code: g.code });
  check('51st member → group_full (limit 50)', r.code === 'group_full', r);
  const x = await reg(`טסט-x-${tag}`); const g2 = (await rpc('rr_create_group', { ...auth(x), p_name: 'טסט ריק' })).body;
  r = await rpc('rr_leave_group', { ...auth(x), p_group: g2.id }); check('rr_leave_group → null', r.ok && r.body === null, r);
  r = await rpc('rr_leave_group', { ...auth(x), p_group: g2.id }); check('rr_leave_group twice → not_member', r.code === 'not_member', r);
}

// ---------------------------------------------------------------- challenges
const chal = (p, over = {}) => rpc('rr_create_challenge2', { ...auth(p), p_group: G.id, p_title: `טסט ${tag}`, p_world: 'w1', p_char: E.getWorld('w1').characters[0].id, p_days: 1, ...over });
r = await chal(A); const CH = r.body;
check('rr_create_challenge2 → {id,title,world,profession,starts_at,ends_at}', r.ok && keysEq(CH, ['id', 'title', 'world', 'profession', 'starts_at', 'ends_at']), r);
for (const [over, code] of [[{ p_title: 'x' }, 'bad_title'], [{ p_title: 'x'.repeat(51) }, 'bad_title'], [{ p_world: 'w9' }, 'bad_world'], [{ p_char: 'chef' }, 'bad_profession'], [{ p_days: 0 }, 'bad_days'], [{ p_days: 31 }, 'bad_days']]) {
  r = await chal(A, over); check(`rr_create_challenge2 ${JSON.stringify(over).slice(0, 40)} → ${code}`, r.code === code, r);
}
for (const over of [{ p_title: 'xy' }, { p_title: 'x'.repeat(50) }, { p_days: 30 }]) { r = await chal(A, over); check(`rr_create_challenge2 boundary ${JSON.stringify(over).slice(0, 30)} ok`, r.ok, r); }
r = await chal(A); check('5th active challenge ok', r.ok, r);
r = await chal(A); check('6th active challenge → too_many_challenges (limit 5)', r.code === 'too_many_challenges', r);
r = await chal(C); check('non-member creates a challenge → not_member', r.code === 'not_member', r);

// ---------------------------------------------------------------- daily / weekly / begin / checkpoint / finish
r = await rpc('rr_daily', auth(A));
check('rr_daily shape {key,world,char_index,max_months,ends_at,my_status,streak,board[]}', r.ok && shape(r.body, { key: 'string', world: 'string', char_index: 'number', max_months: 'number', ends_at: 'string', streak: 'number', board: 'array' }), r);
const DAY = r.body;
r = await rpc('rr_weekly', auth(A)); check('rr_weekly shape {key,world,char_index,profession,ends_at,my_status,board[]}', r.ok && shape(r.body, { key: 'string', world: 'string', char_index: 'number', ends_at: 'string', board: 'array' }), r);
const bA = (await rpc('rr_begin', { ...auth(A), p_mode: 'challenge', p_challenge: CH.id })).body;
const bB = (await rpc('rr_begin', { ...auth(B), p_mode: 'challenge', p_challenge: CH.id })).body;
check('rr_begin challenge: both players get the same numeric seed + char', bA.seed === bB.seed && typeof bA.seed === 'number' && bA.char === CH.profession && !!bA.result_id, { bA, bB });
r = await rpc('rr_begin', { ...auth(A), p_mode: 'challenge', p_challenge: CH.id }); check('rr_begin is idempotent (same result_id)', r.body?.result_id === bA.result_id, r);
r = await rpc('rr_begin', { ...auth(A), p_mode: 'challenge', p_challenge: '00000000-0000-0000-0000-000000000000' }); check('rr_begin challenge_not_found', r.code === 'challenge_not_found', r);
r = await rpc('rr_begin', { ...auth(C), p_mode: 'challenge', p_challenge: CH.id }); check('rr_begin non-member → not_member', r.code === 'not_member', r);
const dA = (await rpc('rr_begin', { ...auth(A), p_mode: 'daily', p_challenge: null })).body;
check('rr_begin daily shape {result_id,status,seed,world,char_index,max_months,streak,checkpoint_turn,checkpoint}', shape(dA, { result_id: 'string', status: 'string', seed: 'number', world: 'string', char_index: 'number', max_months: 'number', streak: 'number', checkpoint_turn: 'number' }), dA);
r = await rpc('rr_checkpoint', { ...auth(A), p_result: dA.result_id, p_turn: 10, p_state: { forged: true } }); check('rr_checkpoint → null', r.ok && r.body === null, r);
r = await rpc('rr_checkpoint', { ...auth(A), p_result: dA.result_id, p_turn: 10, p_state: { again: true } }); assumed('S-1', 'equal-turn checkpoint accepted', r.ok, r);
r = await rpc('rr_checkpoint', { ...auth(A), p_result: dA.result_id, p_turn: 5, p_state: {} }); check('checkpoint rewind → stale_checkpoint', r.code === 'stale_checkpoint', r);
r = await rpc('rr_checkpoint', { ...auth(A), p_result: dA.result_id, p_turn: 11, p_state: { pad: 'x'.repeat(300000) } }); check('checkpoint > 300 000 chars → state_too_big', r.code === 'state_too_big', { status: r.status, code: r.code });
r = await rpc('rr_checkpoint', { ...auth(A), p_result: dA.result_id, p_turn: 11, p_state: { pad: 'x'.repeat(299000) } }); check('checkpoint ≈ 299 000 chars ok', r.ok, { status: r.status, code: r.code });
r = await rpc('rr_begin', { ...auth(A), p_mode: 'daily', p_challenge: null }); check('rr_begin daily again returns the server checkpoint', r.body?.result_id === dA.result_id && r.body.checkpoint_turn === 11 && !!r.body.checkpoint, { turn: r.body?.checkpoint_turn });
r = await rpc('rr_checkpoint', { ...auth(B), p_result: bA.result_id, p_turn: 99, p_state: {} }); check("B cannot overwrite A's checkpoint → result_not_found", r.code === 'result_not_found', r);
const FIN = (p, rid, over = {}) => rpc('rr_finish', { ...auth(p), p_result: rid, p_status: 'lost', p_months: 24, p_passive: 1, p_expenses: 2, p_net_worth: 3, p_stats: {}, ...over });
r = await FIN(B, bA.result_id); check("B cannot finish A's result → result_not_found", r.code === 'result_not_found', r);
r = await rpc('rr_finish', { p_id: A.id, p_secret: 'wrong-secret-0000', p_result: bA.result_id, p_status: 'won', p_months: 1, p_passive: 1, p_expenses: 0, p_net_worth: 1, p_stats: {} });
check('rr_finish wrong secret → unauthorized', r.code === 'unauthorized', r);

// honest + forged games (engine in Node; rules era from the server's date keys exactly as verify_core.rulesFor sees them)
const era = (row) => (VC.rulesFor ? { rules: VC.rulesFor(row) } : {});
const cfgC = { worldId: bA.world, charId: bA.char, seed: Number(bA.seed), mode: 'challenge', tutorial: false, bailout: false, ...era({ challenge_day: CH.starts_at.slice(0, 10) }) };
const stA = playOut(E, cfgC, prng(tag)); const stB = playOut(E, cfgC, prng(tag + 1));
const claim = (st) => ({ p_status: st.result.status, p_months: Math.max(1, Math.min(200, Math.round(st.result.months))), p_passive: Math.round(st.result.passive),
  p_expenses: Math.max(0, Math.round(st.result.expenses)), p_net_worth: Math.round(st.result.netWorth), p_stats: { progress: st.result.progress ?? null, stars: st.result.stars || 0 } });
r = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: stA.actions }); check('verify before finish → 409 not_finished', r.status === 409 && r.body?.error === 'not_finished', r);
r = await FIN(A, bA.result_id, claim(stA)); check('rr_finish honest → null', r.ok && r.body === null, r);
r = await FIN(A, bA.result_id, claim(stA)); check('duplicate finish → already_finished', r.code === 'already_finished', r);
r = await FIN(B, bB.result_id, { ...claim(stB), p_status: 'won', p_months: 3, p_net_worth: 50000000, p_stats: { progress: 1, stars: 3 } }); check('rr_finish stores a forged claim (S1: verify-result catches it)', r.ok, r);
r = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: stA.actions });
check('honest result → 200 verified:true (server replay)', r.status === 200 && r.body?.verified === true && r.body.result?.months === claim(stA).p_months, r.body);
r = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: stA.actions }); check('verified again → 200 already:true', r.status === 200 && r.body?.already === true, r.body);
r = await verify({ id: B.id, secret: B.secret, result_id: bB.result_id, actions: stB.actions }); check('forged claim + real log → verified:false claim_mismatch', r.status === 200 && r.body?.verified === false && r.body.error === 'claim_mismatch', r.body);
r = await verify({ id: B.id, secret: B.secret, result_id: bB.result_id, actions: stB.actions.slice(0, Math.floor(stB.actions.length * 0.6)) }); check('forged claim + truncated log → verified:false replay', r.status === 200 && r.body?.verified === false && r.body.error === 'replay', r.body);
r = await verify({ id: B.id, secret: B.secret, result_id: bA.result_id, actions: stA.actions }); check("B cannot verify A's result → 404", r.status === 404 && r.body?.error === 'result_not_found', r.body);
r = await verify({ id: A.id, secret: 'not-the-secret-123', result_id: bA.result_id, actions: stA.actions }); check('verify wrong secret → 401', r.status === 401, r.body);
r = await verify({ id: 'not-a-uuid', secret: A.secret, result_id: bA.result_id }); check('verify bad id → 401', r.status === 401, r.body);
r = await verify({ id: C.id, secret: C.secret, result_id: bA.result_id, actions: [['r', { $gt: 1 }]] }); check('malformed action log → 400 bad_actions', r.status === 400 && r.body?.error === 'bad_actions', r.body);
r = await verify({ id: C.id, secret: C.secret, result_id: "1' or '1'='1", actions: [['r']] }); check('SQL-ish result id → 404', r.status === 404, r.body);
r = await verify(null, 'x'.repeat(1000001)); check('body > 1 000 000 chars → 413 too_big', r.status === 413, { status: r.status });
{ // 422 no_actions, 429 attempts > 5, 429 rate limit
  const p = await reg(`טסט-v-${tag}`); const d = (await rpc('rr_begin', { ...auth(p), p_mode: 'daily', p_challenge: null })).body;
  await FIN(p, d.result_id);
  r = await verify({ id: p.id, secret: p.secret, result_id: d.result_id }); check('finished, no actions anywhere → 422 no_actions', r.status === 422 && r.body?.error === 'no_actions', r.body);
  const st = []; for (let i = 0; i < 6; i++) st.push((await verify({ id: p.id, secret: p.secret, result_id: d.result_id, actions: [['r']] })).status);
  check('more than 5 verify attempts on one result → 429', st.slice(0, 5).every((s) => s === 200) && st[5] === 429, st);
  const q = await reg(`טסט-q-${tag}`); const sq = []; for (let i = 0; i < 11; i++) sq.push((await verify({ id: q.id, secret: q.secret, result_id: '00000000-0000-4000-8000-000000000000' })).status);
  check('11th verify in a minute → 429 rate_limited (10/min/player)', sq.slice(0, 10).every((s) => s === 404) && sq[10] === 429, sq);
}
{ // daily board: clamp + stats limit + verified key; feed rows
  const p = await reg(`טסט-f-${tag}`); const d = (await rpc('rr_begin', { ...auth(p), p_mode: 'daily', p_challenge: null })).body;
  await FIN(p, d.result_id, { p_months: 999, p_stats: { progress: 0.5, pad: 'y'.repeat(17000) } });
  const row = (await rpc('rr_daily', auth(p))).body.board.find((x) => x.me);
  check('rr_finish clamps months to 200 and drops stats ≥ 16 KB', row && row.months === 200 && row.progress === null, row);
  check('board rows carry the t15b keys (incl. verified)', keysEq(row, BOARD_KEYS), row && Object.keys(row));
  const feed = (await rpc('rr_group_feed', { ...auth(A), p_group: G.id })).body.feed;
  check('ranked_won/lost feed row for the challenge group', feed.some((f) => f.kind === 'ranked_won' || f.kind === 'ranked_lost'), feed.slice(0, 2));
}
r = await rpc('rr_begin', { ...auth(A), p_mode: 'daily', p_challenge: null }); check('daily streak present on begin', typeof r.body?.streak === 'number' && r.body.streak >= 1, r.body?.streak);
if (FAKE && await advance({ days: 2 })) {
  const late = await reg(`טסט-lt-${tag}`); await rpc('rr_join_group', { ...auth(late), p_code: G.code });
  r = await rpc('rr_begin', { ...auth(late), p_mode: 'challenge', p_challenge: CH.id }); check('ended challenge → challenge_closed', r.code === 'challenge_closed', r);
} else skip('challenge_closed', 'needs the fake clock (/__fake/advance)');

// ---------------------------------------------------------------- energy, events, feed
{
  const R0 = await reg(`טסט-r-${tag}`);
  for (let i = 1; i <= 6; i++) await reg(`טסט-ref-${tag}-${i}`, R0.id);
  r = await rpc('rr_claim_energy', auth(R0)); check('referral bonus capped at 5 per referrer per day (6 sign-ups → 25⚡)', r.ok && r.body.total === 25 && r.body.from.length === 5, r.body);
  const X = await reg(`טסט-ge-${tag}`); const g = (await rpc('rr_create_group', { ...auth(X), p_name: `טסט אנרגיה ${tag}` })).body;
  const Y = await reg(`טסט-gy-${tag}`, X.id); await rpc('rr_join_group', { ...auth(Y), p_code: g.code });
  r = await rpc('rr_send_energy', { ...auth(Y), p_group: g.id, p_nickname: `טסט-ge-${tag}` }); check('rr_send_energy → null', r.ok && r.body === null, r);
  r = await rpc('rr_send_energy', { ...auth(Y), p_group: g.id, p_nickname: `טסט-ge-${tag}` }); check('second gift same day → already_sent_today', r.code === 'already_sent_today', r);
  r = await rpc('rr_send_energy', { ...auth(Y), p_group: g.id, p_nickname: 'אין-כזה' }); check('gift to a non-member nickname → player_not_found', r.code === 'player_not_found', r);
  r = await rpc('rr_send_energy', { ...auth(C), p_group: g.id, p_nickname: `טסט-ge-${tag}` }); check('gift from a non-member → not_member', r.code === 'not_member', r);
  r = await rpc('rr_group_feed', { ...auth(Y), p_group: g.id }); check('rr_group_feed {feed[], gifted_today[]} lists the recipient', r.ok && Array.isArray(r.body.feed) && r.body.gifted_today.includes(`טסט-ge-${tag}`), r.body);
  r = await rpc('rr_claim_energy', auth(X)); check('referral 5⚡ + gift 3⚡ = exactly 8⚡ ({total, from[{nickname,kind,amount}]})', r.ok && r.body.total === 8 && shape(r.body.from[0], { nickname: 'string', kind: 'string', amount: 'number' }), r.body);
  r = await rpc('rr_group_feed', { ...auth(C), p_group: g.id }); check('rr_group_feed non-member → not_member', r.code === 'not_member', r);
  r = await rpc('rr_log_event', { ...auth(X), p_kind: 'escaped', p_data: { world: 'w1', months: '<i>טסט-xss</i>', stars: 2 } }); check('rr_log_event → null', r.ok && r.body === null, r);
  const hit = (await rpc('rr_group_feed', { ...auth(Y), p_group: g.id })).body.feed.find((x) => x.kind === 'escaped');
  check('feed returns attacker-controlled data verbatim to other members (client must escape)', hit && hit.data.months === '<i>טסט-xss</i>' && hit.me === false, hit);
  r = await rpc('rr_log_event', { ...auth(X), p_kind: '<script>', p_data: {} }); check('event kind validated → bad_kind', r.code === 'bad_kind', r);
  r = await rpc('rr_log_event', { ...auth(X), p_kind: 'k', p_data: { p: 'y'.repeat(2030) } }); check('event data just under 2 048 chars ok', r.ok, r);
  r = await rpc('rr_log_event', { ...auth(X), p_kind: 'k', p_data: { p: 'y'.repeat(2050) } }); assumed('2KB', 'event data ≥ 2 048 chars rejected (fake answers bad_data)', !r.ok, r);
  let last; for (let i = 0; i < 48; i++) last = await rpc('rr_log_event', { ...auth(X), p_kind: 'k', p_data: {} });
  check('50th event of the day ok', last.ok, last);
  r = await rpc('rr_log_event', { ...auth(X), p_kind: 'k', p_data: {} }); check('51st event of the day → rate_limited', r.code === 'rate_limited', r);
}

// ---------------------------------------------------------------- protocol + REST surface
r = await rpc('rr_register', { p_nickname: 'טסט' }); check('legacy rr_register → 404', r.status === 404, r);
r = await rpc('rr_profile', { ...auth(A), p_extra: 1 }); check('unknown parameter → 404 (PostgREST signature mismatch)', r.status === 404, r);
let x = await fetch(`${TARGET}/rest/v1/players?select=*`, { headers: { apikey: KEY } }); check('tables are not reachable through REST', !x.ok, { status: x.status });
x = await fetch(`${TARGET}/rest/v1/players?select=*`, { headers: { apikey: KEY, 'Accept-Profile': 'game' } }); check('schema "game" is not exposed', !x.ok, { status: x.status });
x = await fetch(`${TARGET}/rest/v1/rpc/auth`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', 'Content-Profile': 'game' }, body: '{}' }); check('game.* functions are not callable through REST', !x.ok, { status: x.status });

console.log(`\n${out.pass} passed, ${out.fail} failed, ${out.diff} DIFF-ASSUMED, ${out.skip} skipped · target=${FAKE ? 'fake' : 'staging ' + new URL(TARGET).hostname.split('.')[0]}`);
if (child) child.kill();
process.exit(out.fail ? 1 : 0);
