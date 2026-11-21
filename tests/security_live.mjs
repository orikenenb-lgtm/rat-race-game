#!/usr/bin/env node
// LIVE-ONLY security tests (T-15 / docs/SECURITY_REVIEW.md) — since T7 they run only against a STAGING project:
//   RR_LIVE=1 RR_SB_URL=https://<staging-ref>.supabase.co RR_SB_ANON=<anon key> node tests/security_live.mjs [--skip-referral]
// Without that env (or with RR_SB_URL = production) it prints SKIPPED and exits 0 before any request. The same cases run offline
// against the fake backend in tests/backend_contract.mjs.
// Only creates players whose nickname starts with "טסט", one private test group ("טסט אבטחה") and one challenge in it.
// Never touches daily/weekly boards, never deletes anything. Prints a JSON evidence log.
import { readFileSync } from 'node:fs';
import { loadEngine } from '../supabase/functions/verify-result/engine_loader.js';
import { playOut, prng } from './lib/random-player.mjs';

const PROD_REF = 'xvqaxphyfqdzkddmoosu';             // T7 env guard: never production
const LIVE = /^https:\/\/([a-z0-9]{8,40})\.supabase\.co\/?$/.exec(process.env.RR_SB_URL || '');
if (process.env.RR_LIVE !== '1' || !LIVE || LIVE[1] === PROD_REF || !process.env.RR_SB_ANON) {
  console.log('SKIPPED (live-only; set RR_LIVE=1 and RR_SB_URL=<staging>, RR_SB_ANON=<staging anon key>; production is refused)');
  process.exit(0);
}
const SB = process.env.RR_SB_URL.replace(/\/$/, '');
const SBK = process.env.RR_SB_ANON;
const FN = `${SB}/functions/v1/verify-result`;
const BUNDLE = readFileSync(new URL('../supabase/functions/verify-result/engine.bundle.json', import.meta.url), 'utf8');
const E = await loadEngine(BUNDLE); // play with the exact pinned engine (js/ may be ahead of the deployed pin)
const tag = Math.floor(Math.random() * 9000 + 1000);
const log = [];
let pass = 0, fail = 0;
function info(name, evidence) { log.push({ test: name, ok: null, evidence }); console.log(`ℹ ${name}  ${JSON.stringify(evidence).slice(0, 220)}`); }
function check(name, ok, evidence) { (ok ? pass++ : fail++); log.push({ test: name, ok, evidence }); console.log(`${ok ? '✔' : '✘'} ${name}  ${JSON.stringify(evidence).slice(0, 220)}`); }

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, body: j, code: r.ok ? null : j?.message };
}
async function verify(body, withEngine = true) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'rr-security-test' }, body: JSON.stringify(withEngine ? { ...body, engine_bundle: BUNDLE } : body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const auth = (p) => ({ p_id: p.id, p_secret: p.secret });

// ---------------------------------------------------------------- setup: test players, group, challenge
const A = (await rpc('rr_register2', { p_nickname: `טסט-A-${tag}`, p_ref: null })).body;
const B = (await rpc('rr_register2', { p_nickname: `טסט-B-${tag}`, p_ref: null })).body;
check('register test players', !!(A?.id && B?.id), { A: A?.nickname, B: B?.nickname });
const grp = (await rpc('rr_create_group', { ...auth(A), p_name: `טסט אבטחה ${tag}` })).body;
await rpc('rr_join_group', { ...auth(B), p_code: grp.code });
const ch = (await rpc('rr_create_challenge2', { ...auth(A), p_group: grp.id, p_title: `טסט ${tag}`, p_world: 'w1', p_char: E.getWorld('w1').characters[0].id, p_days: 1 })).body;
const bA = (await rpc('rr_begin', { ...auth(A), p_mode: 'challenge', p_challenge: ch.id })).body;
const bB = (await rpc('rr_begin', { ...auth(B), p_mode: 'challenge', p_challenge: ch.id })).body;
check('begin challenge (both get the same seed — S3: seed known before playing)', bA.seed === bB.seed && !!bA.result_id, { seed: bA.seed, world: bA.world, char: bA.char });

// ---------------------------------------------------------------- 1. auth / ownership on existing RPCs
let r = await rpc('rr_finish', { ...auth(B), p_result: bA.result_id, p_status: 'won', p_months: 1, p_passive: 1, p_expenses: 0, p_net_worth: 1, p_stats: {} });
check("B cannot finish A's result (rr_finish)", r.code === 'result_not_found', r);
r = await rpc('rr_checkpoint', { ...auth(B), p_result: bA.result_id, p_turn: 99, p_state: { x: 1 } });
check("B cannot overwrite A's checkpoint", r.code === 'result_not_found', r);
r = await rpc('rr_finish', { p_id: A.id, p_secret: 'wrong-secret-0000', p_result: bA.result_id, p_status: 'won', p_months: 1, p_passive: 1, p_expenses: 0, p_net_worth: 1, p_stats: {} });
check('wrong secret is rejected', r.code === 'unauthorized', r);
r = await rpc('rr_group', { ...auth(B), p_group: '00000000-0000-0000-0000-000000000000' });
check('non-member cannot read a group', r.code === 'not_member', r);

// ---------------------------------------------------------------- 2. checkpoint abuse
r = await rpc('rr_checkpoint', { ...auth(A), p_result: bA.result_id, p_turn: 10, p_state: { forged: true, cash: 99999999 } });
check('checkpoint accepts an arbitrary (forged) state — S2, harmless once results are verified by replay', r.ok, r.body);
r = await rpc('rr_checkpoint', { ...auth(A), p_result: bA.result_id, p_turn: 5, p_state: { x: 1 } });
check('checkpoint rewind is rejected', r.code === 'stale_checkpoint', r);
r = await rpc('rr_checkpoint', { ...auth(A), p_result: bA.result_id, p_turn: 11, p_state: { pad: 'x'.repeat(320000) } });
check('oversized checkpoint is rejected', r.code === 'state_too_big', { status: r.status, code: r.code });

// ---------------------------------------------------------------- 3. verify-result: before finish / auth
r = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: [['r']] });
check('verify before finish → not_finished', r.status === 409 && r.body.error === 'not_finished', r.body);

// ---------------------------------------------------------------- play two honest games (A and B, same seed)
const cfg = { worldId: bA.world, charId: bA.char, seed: Number(bA.seed), mode: 'challenge', tutorial: false, bailout: false };
const stA = playOut(E, cfg, prng(tag)); const stB = playOut(E, cfg, prng(tag + 1));
const claim = (st) => ({ status: st.result.status, months: Math.max(1, Math.min(200, Math.round(st.result.months))), passive: Math.round(st.result.passive),
  expenses: Math.max(0, Math.round(st.result.expenses)), netWorth: Math.round(st.result.netWorth) });
const cA = claim(stA); const cB = claim(stB);
r = await rpc('rr_finish', { ...auth(A), p_result: bA.result_id, p_status: cA.status, p_months: cA.months, p_passive: cA.passive, p_expenses: cA.expenses, p_net_worth: cA.netWorth,
  p_stats: { progress: stA.result.progress, stars: stA.result.stars || 0, world: 'w1', char: cfg.charId } });
check('A finishes honestly', r.ok, { claim: cA });
r = await rpc('rr_finish', { ...auth(A), p_result: bA.result_id, p_status: 'won', p_months: 1, p_passive: 1, p_expenses: 0, p_net_worth: 1, p_stats: {} });
check('duplicate finish is rejected', r.code === 'already_finished', r);
// B forges: claims a 3-month escape with ₪50M (S1: rr_finish itself still believes the client)
r = await rpc('rr_finish', { ...auth(B), p_result: bB.result_id, p_status: 'won', p_months: 3, p_passive: 99999, p_expenses: cB.expenses, p_net_worth: 50000000,
  p_stats: { progress: 1, stars: 3, world: 'w1', char: cfg.charId } });
check('rr_finish still stores a forged claim (S1 — this is what verify-result catches)', r.ok, { forged: { status: 'won', months: 3, netWorth: 50000000 }, real: cB });

// ---------------------------------------------------------------- 4. verify-result on the live backend
r = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: stA.actions });
check('honest result → verified:true (replayed on the server)', r.status === 200 && r.body.verified === true && r.body.result.months === cA.months, r.body);
r = await verify({ id: B.id, secret: B.secret, result_id: bB.result_id, actions: stB.actions });
check('forged claim + real action log → verified:false claim_mismatch', r.status === 200 && r.body.verified === false && r.body.error === 'claim_mismatch', r.body);
const fake = stB.actions.slice(0, Math.floor(stB.actions.length * 0.6));
r = await verify({ id: B.id, secret: B.secret, result_id: bB.result_id, actions: fake });
check('forged claim + truncated/fabricated log → verified:false replay', r.status === 200 && r.body.verified === false && r.body.error === 'replay', r.body);
const edited = stB.actions.map((a) => (a[0] === 'c' && a[1] === 'pass' ? ['c', 'buy'] : a));
r = await verify({ id: B.id, secret: B.secret, result_id: bB.result_id, actions: edited });
check('edited decisions (pass→buy) → rejected', r.status === 200 && r.body.verified === false, r.body);
r = await verify({ id: B.id, secret: B.secret, result_id: bA.result_id, actions: stA.actions });
check("B cannot verify (or read) A's result", r.status === 404 && r.body.error === 'result_not_found', r.body);
r = await verify({ id: A.id, secret: 'not-the-secret-123', result_id: bA.result_id, actions: stA.actions });
check('verify with a wrong secret → 401', r.status === 401, r.body);
r = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: [['r', { $gt: 1 }]] }, false);
check('malformed action log → 400 bad_actions', r.status === 400 && r.body.error === 'bad_actions', r.body);
r = await verify({ id: A.id, secret: A.secret, result_id: "1' or '1'='1", actions: stA.actions }, false);
check('SQL-ish result id → 404 (uuid validated, queries parameterised)', r.status === 404, r.body);
const big = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(1050000) });
info('oversized body (1.05 MB): 413 from the function, or 504/413 from the platform/proxy before it', { status: big.status });
const statuses = [];
for (let i = 0; i < 14; i++) { const x = await verify({ id: A.id, secret: A.secret, result_id: bA.result_id, actions: stA.actions }); statuses.push(x.status); }
// per-isolate limit (10/min/player) is best effort — requests are spread over isolates; the durable cap is verify_attempts (migration A)
info('verify spam (dry-run mode: per-isolate 10/min/player)', { statuses });

// ---------------------------------------------------------------- 5. stars / meta are client-trusted (S4)
r = await rpc('rr_sync_progress2', { ...auth(A), p_stars: { w1: 3, w2: 3, w3: 3, w4: 3 }, p_achievements: ['first_asset'], p_pawn: null, p_meta: { games: 99999, wins: 99999, best: { w1: 1 } } });
check('rr_sync_progress2 believes stars/meta from the client (S4)', r.ok && r.body.total_stars === 12, { total_stars: r.body?.total_stars, meta: r.body?.meta });
r = await rpc('rr_sync_progress2', { ...auth(A), p_stars: { w1: 99, '<x>': 3 }, p_achievements: ['<img src=x>', 'ok_one'], p_pawn: '<svg/onload=1>', p_meta: null });
check('stars capped at 3, unknown keys / bad achievement ids / bad pawn ignored', r.ok && r.body.stars.w1 === 3 && !JSON.stringify(r.body).includes('<'), r.body);

// ---------------------------------------------------------------- 6. stored payloads (XSS surface) — benign markers, test group only
r = await rpc('rr_rename', { ...auth(B), p_nickname: `טסט<i>${tag}</i>` });
check('nickname with HTML is stored verbatim (client must escape — lobby.js does: esc(r.nickname))', r.ok, r.body);
r = await rpc('rr_log_event', { ...auth(A), p_kind: 'escaped', p_data: { world: 'w1', months: '<i>טסט-xss</i>', stars: 2 } });
const feed = (await rpc('rr_group_feed', { ...auth(B), p_group: grp.id })).body;
const hit = (feed?.feed || []).find((x) => x.kind === 'escaped');
check('group feed returns an attacker-controlled data.months string to OTHER members (rendered unescaped at lobby.js:873)', !!hit && hit.data.months === '<i>טסט-xss</i>', hit);
for (let i = 0; i < 3; i++) await rpc('rr_log_event', { ...auth(A), p_kind: 'escaped', p_data: { pad: 'y'.repeat(1990) } });
r = await rpc('rr_log_event', { ...auth(A), p_kind: '<script>', p_data: {} });
check('event kind is validated', r.code === 'bad_kind', r);

// ---------------------------------------------------------------- 7. REST surface
let x = await fetch(`${SB}/rest/v1/players?select=*`, { headers: { apikey: SBK } });
check('tables are not reachable through REST (public has no tables)', !x.ok, { status: x.status, body: (await x.text()).slice(0, 120) });
x = await fetch(`${SB}/rest/v1/players?select=*`, { headers: { apikey: SBK, 'Accept-Profile': 'game' } });
check('schema "game" is not exposed (Accept-Profile: game)', !x.ok, { status: x.status, body: (await x.text()).slice(0, 120) });
x = await fetch(`${SB}/rest/v1/rpc/auth`, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json', 'Content-Profile': 'game' }, body: '{}' });
check('game.* functions cannot be called through REST', !x.ok, { status: x.status });

// ---------------------------------------------------------------- 8. referral farming (5/day per referrer)
if (!process.argv.includes('--skip-referral')) {
  for (let i = 1; i <= 6; i++) await rpc('rr_register2', { p_nickname: `טסט-ref-${tag}-${i}`, p_ref: A.id });
  r = await rpc('rr_claim_energy', auth(A));
  check('referral bonus capped at 5 per referrer per day (6 sign-ups → 25⚡)', r.ok && r.body.total === 25, { total: r.body?.total, n: r.body?.from?.length });
}

// ---------------------------------------------------------------- cleanup (non-destructive): leave the test group
await rpc('rr_leave_group', { ...auth(B), p_group: grp.id });
await rpc('rr_leave_group', { ...auth(A), p_group: grp.id });
console.log(`\n${pass} passed, ${fail} failed`);
console.log('EVIDENCE ' + JSON.stringify({ tag, players: [A.id, B.id], group: grp.code, challenge: ch.id, results: [bA.result_id, bB.result_id], log }));
if (fail) process.exit(1);
