#!/usr/bin/env node
// verify-result against the LIVE database functions (docs/full-upgrade/VERIFY_CHECK.md): the LOCAL staging stack (tools/staging)
// loaded with supabase/schema/production_baseline.sql + supabase/migrations/20261123_admin.sql + supabase/schema/production_supplement.sql
// (= the live public rr_* API), the real verify-result Edge Function under Deno. Plays ranked games EXACTLY as the current client
// builds them (js/lobby.js playRanked / rankedDateKey + js/game.js startGame → E.createGame with the day key the client derives from
// what the live RPCs return, never a starts_at that rr_begin / rr_create_challenge2 do not send) and checks:
//   honest daily / weekly / challenge → verified:true · forged claim → claim_mismatch · truncated log → replay · a log built under
//   another rule set → replay · someone else's result → 404 — in three DB-clock eras (now = rules 3, after RULES4_FROM = rules 4,
//   after RULES7_FROM = rules 7) and across the RULES4_FROM cut-over (a challenge created the day before, played on the day).
//   . /tmp/rr-staging/target.env && node tests/verify_staging.mjs      (the stack started with RR_STAGING_FAKETIME=1 to move the clock)
// Refuses anything but 127.0.0.1 / localhost. The DB clock is moved with the libfaketime offset file and reset at the end.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const URL0 = process.env.RR_LOCAL_URL || ''; const KEY = process.env.RR_LOCAL_ANON; const CLOCK = process.env.RR_LOCAL_CLOCK || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/?$/.test(URL0) || !KEY) { console.error('REFUSED: needs RR_LOCAL_URL=http://127.0.0.1:<port> + RR_LOCAL_ANON (. <staging>/target.env)'); process.exit(2); }
const TARGET = URL0.replace(/\/$/, '');
const E = await import(join(ROOT, 'js', 'engine.js'));
const VC = await import(join(ROOT, 'supabase', 'functions', 'verify-result', 'verify_core.js'));
const { playOut, prng } = await import(join(HERE, 'lib', 'random-player.mjs'));
const SIM = await import(join(ROOT, 'tools', 'sim.mjs'));   // the sim's skilled policy, to get honest WON games (stars) too

const out = { pass: 0, fail: 0, skip: 0 };
function check(name, ok, ev) { ok ? out.pass++ : out.fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(ev).slice(0, 400)}`); }
const skip = (name, why) => { out.skip++; console.log(`SKIP  ${name} (${why})`); };
async function rpc(fn, args = {}) {
  const r = await fetch(`${TARGET}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null); return { ok: r.ok, body: j, code: r.ok ? null : j?.message ?? j?.code };
}
async function verify(body) {
  const r = await fetch(`${TARGET}/functions/v1/verify-result`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const auth = (p) => ({ p_id: p.id, p_secret: p.secret });
const tag = Math.floor(Math.random() * 9000 + 1000); let nreg = 0;
const reg = async () => { const r = await rpc('rr_register2', { p_nickname: `טסט-${tag}-${++nreg}`.slice(0, 20), p_ref: null }); if (!r.ok) throw new Error('register ' + JSON.stringify(r)); return r.body; };

// ---- the client's clock = real time + the DB clock offset (both move together, like a player on that day)
let offset = 0;
const readOff = () => (CLOCK ? parseInt(readFileSync(CLOCK, 'utf8').trim() || '+0', 10) || 0 : 0);
async function setClock(isoUtc) { // move the DB clock so that now() ≈ isoUtc
  if (!CLOCK) return false;
  offset = Math.round((Date.parse(isoUtc) - Date.now()) / 1000); writeFileSync(CLOCK, `${offset >= 0 ? '+' : ''}${offset}\n`); await sleep(1500); return true;
}
const clientNow = () => new Date(Date.now() + offset * 1000);
const israelDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); // = js/progress.js israelDate
function isoWeekKey(today) { // = js/lobby.js rankedDateKey weekly fallback
  const [y, m, d] = today.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow + 3); const wy = t.getUTCFullYear(); const w1 = new Date(Date.UTC(wy, 0, 4));
  const wk = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7); return `${wy}-W${String(wk).padStart(2, '0')}`;
}
function dailyChar(w, i) { const list = (w.daily && w.daily.chars) || w.characters.map((c) => c.id); const id = list[(((+i || 0) % list.length) + list.length) % list.length]; return w.characters.find((c) => c.id === id) || w.characters[0]; }

/** js/lobby.js rankedDateKey against what the LIVE RPCs return (rr_begin has no date_key; rr_daily key 'D…'; rr_group starts_at). */
function rankedDateKey(mode, r, cache, challengeId) {
  if (r && r.date_key) return String(r.date_key);
  const today = israelDate(clientNow());
  if (mode === 'daily') return cache.daily && cache.daily.key === today ? cache.daily.key : today;
  if (mode === 'weekly') return cache.weekly && /^\d{4}-W\d{1,2}$/.test(cache.weekly.key || '') ? cache.weekly.key : isoWeekKey(today);
  if (mode === 'challenge') { const c = cache.group && (cache.group.challenges || []).find((x) => x.id === challengeId); const at = c && (c.created_at || c.starts_at); return at ? israelDate(new Date(at)) : today; }
  return null;
}
/** js/lobby.js playRanked → js/game.js startGame → E.createGame (the cfg the client really plays). */
function clientCfg(mode, r, cache, challengeId) {
  const w = E.getWorld(r.world);
  const charId = (r.char && w.characters.some((c) => c.id === r.char)) ? r.char : dailyChar(w, r.char_index).id;
  const cfg = { worldId: w.id, charId, seed: Number(r.seed), mode, tutorial: false, bailout: false, mentor: undefined };
  if (mode === 'daily' && r.max_months != null) cfg.maxMonths = +r.max_months;
  const dk = rankedDateKey(mode, r, cache, challengeId); if (dk) cfg.dateKey = dk;
  return cfg;
}
const claimOf = (st) => ({ p_status: st.result.status, p_months: Math.max(1, Math.min(200, Math.round(st.result.months))), p_passive: Math.round(st.result.passive),
  p_expenses: Math.max(0, Math.round(st.result.expenses)), p_net_worth: Math.round(st.result.netWorth),
  p_stats: { progress: st.result.progress ?? null, stars: st.result.stars || 0, world: st.worldId, char: st.charId } });
const play = (cfg, s) => { const st0 = E.createGame(cfg); const v4 = st0.rules >= 4; return playOut(E, cfg, prng(s), { v4, stories: st0.rules >= 5 }); };
const FIN = (p, rid, c) => rpc('rr_finish', { ...auth(p), p_result: rid, ...c });

/** One honest ranked game of `mode` + its tampered twins. → {rules} */
async function ranked(label, mode, { group, expectRules, seedOff = 0 } = {}) {
  const A = await reg(); const B = await reg(); const C = await reg(); const D = await reg();
  let challengeId = null; const cache = {};
  if (mode === 'challenge') {
    for (const p of [A, B, C, D]) await rpc('rr_join_group', { ...auth(p), p_code: group.code });
    challengeId = group.challengeId;
    cache.group = (await rpc('rr_group', { ...auth(A), p_group: group.id })).body;
  } else if (mode === 'daily') cache.daily = (await rpc('rr_daily', auth(A))).body;
  else cache.weekly = (await rpc('rr_weekly', auth(A))).body;
  const begin = async (p) => { const b = await rpc('rr_begin', { ...auth(p), p_mode: mode, p_challenge: challengeId }); if (!b.ok) throw new Error(`${label}: rr_begin ${JSON.stringify(b)}`); return b.body; };
  const rA = await begin(A); const rB = await begin(B); const rC = await begin(C);
  const cfg = clientCfg(mode, rA, cache, challengeId);
  const stA = play(cfg, tag + seedOff); const stB = play(clientCfg(mode, rB, cache, challengeId), tag + seedOff + 1);
  const stC = play(clientCfg(mode, rC, cache, challengeId), tag + seedOff + 2);
  const rules = stA.rules;
  check(`${label}: the client plays rules ${rules} (dateKey ${cfg.dateKey})`, expectRules == null || rules === expectRules, { rules, expectRules, cfg });
  let r = await FIN(A, rA.result_id, claimOf(stA)); check(`${label}: rr_finish honest`, r.ok, r);
  let v = await verify({ id: A.id, secret: A.secret, result_id: rA.result_id, actions: stA.actions });
  check(`${label}: honest ${mode} → verified:true (${stA.actions.length} actions, ${stA.result.status} m${stA.result.months})`, v.status === 200 && v.body?.verified === true && v.body.result?.months === claimOf(stA).p_months && v.body.result?.netWorth === claimOf(stA).p_net_worth, v.body);
  // forged claim (the real log) → claim_mismatch
  r = await FIN(B, rB.result_id, { ...claimOf(stB), p_status: 'won', p_months: 3, p_net_worth: 50000000, p_stats: { progress: 1, stars: 3 } });
  v = await verify({ id: B.id, secret: B.secret, result_id: rB.result_id, actions: stB.actions });
  check(`${label}: forged claim + real log → verified:false claim_mismatch`, v.status === 200 && v.body?.verified === false && v.body.error === 'claim_mismatch', v.body);
  v = await verify({ id: B.id, secret: B.secret, result_id: rB.result_id, actions: stB.actions.slice(0, Math.floor(stB.actions.length * 0.6)) });
  check(`${label}: forged claim + truncated log → verified:false replay`, v.status === 200 && v.body?.verified === false && v.body.error === 'replay', v.body);
  // a log played under another rule set (claim consistent with it): accepted only if it IS a legal game under a rule set verify
  // allows for this row (its day's, or in a cut-over week the next one — verify_core.verifyGame); the local verify_core is the oracle
  const other = rules === 3 ? 7 : 3;
  const { dateKey, ...noKey } = clientCfg(mode, rC, cache, challengeId); const stX = playOut(E, { ...noKey, rules: other }, prng(tag + seedOff + 3), { v4: other >= 4, stories: other >= 5 });
  r = await FIN(C, rC.result_id, claimOf(stX));
  const cX = claimOf(stX);
  const row = { mode, world: rC.world, profession: mode === 'challenge' ? rC.char : 'idx:' + rC.char_index, seed: rC.seed, max_months: mode === 'daily' ? 24 : null,
    daily_key: mode === 'daily' ? cache.daily.key : null, weekly_start: mode === 'weekly' ? VC.isoDay(cache.weekly.key) : null,
    challenge_day: mode === 'challenge' ? rankedDateKey('challenge', null, cache, challengeId) : null, finished_day: israelDate(clientNow()),
    status: cX.p_status, months: cX.p_months, passive: cX.p_passive, expenses: cX.p_expenses, net_worth: cX.p_net_worth, claim_stars: cX.p_stats.stars, claim_progress: cX.p_stats.progress };
  const local = VC.verifyGame(E, row, stX.actions);
  v = await verify({ id: C.id, secret: C.secret, result_id: rC.result_id, actions: stX.actions });
  const cut = VC.inCutoverWeek(row.finished_day, (VC.nextCutover(rules) || {}).from || '9999-01-01');
  check(`${label}: a rules-${other} log on a rules-${rules} day → ${local.ok ? `accepted as a legal rules-${local.cfg.rules} game (cut-over week fallback)` : 'verified:false'} — server = local verify_core`,
    v.status === 200 && v.body?.verified === local.ok && (cut || !local.ok), { server: v.body, local: { ok: local.ok, error: local.error, rules: local.cfg && local.cfg.rules }, cut });
  v = await verify({ id: C.id, secret: C.secret, result_id: rA.result_id, actions: stA.actions });
  check(`${label}: someone else's result → 404`, v.status === 404, v.body);
  // a skilled honest game (the sim's `smart` policy through the same public API, client cfg) — usually WON, with stars
  const rD = await begin(D); const cD = clientCfg(mode, rD, cache, challengeId);
  const { st: stD } = SIM.play(cD.worldId, cD.charId, cD.seed, 'smart', 999, { mode, maxMonths: cD.maxMonths, tutorial: false, bailout: false, mentor: undefined, dateKey: cD.dateKey });
  if (!stD.over) { const ev = E.currentEvent(stD); void ev; }
  if (stD.over) {
    r = await FIN(D, rD.result_id, claimOf(stD));
    v = await verify({ id: D.id, secret: D.secret, result_id: rD.result_id, actions: stD.actions });
    check(`${label}: skilled honest ${mode} → verified:true (${stD.result.status}, m${stD.result.months}, ★${stD.result.stars || 0}, rules ${stD.rules})`, v.status === 200 && v.body?.verified === true && v.body.result?.stars === (stD.result.stars || 0) && stD.rules === rules, v.body);
    if (stD.result.status === 'won') won.push(`${label} ★${stD.result.stars}`);
  } else skip(`${label}: skilled game`, 'did not end');
  void stC;
  return { rules };
}
async function newGroup(days = 3) {
  const O = await reg(); const g = (await rpc('rr_create_group', { ...auth(O), p_name: `טסט ${tag}` })).body;
  const w1 = E.getWorld('w1');
  const c = await rpc('rr_create_challenge2', { ...auth(O), p_group: g.id, p_title: `טסט ${tag}`, p_world: 'w1', p_char: w1.characters[1 % w1.characters.length].id, p_days: days });
  check('rr_create_challenge2 (live: returns {id} only — no starts_at)', c.ok && typeof c.body.id === 'string', c.body);
  return { id: g.id, code: g.code, challengeId: c.body.id, owner: O };
}

console.log(`verify-result vs the live RPCs · ${TARGET} · rules cut-overs: 4 ${VC.RULES4_FROM} · 5 ${VC.RULES5_FROM} · 6 ${VC.RULES6_FROM} · 7 ${VC.RULES7_FROM}`);
const health = await fetch(`${TARGET}/functions/v1/verify-result`, { headers: { apikey: KEY } }).then((r) => r.json());
check('verify-result health: the pinned engine = this checkout', health.ok && health.engine === (await import(join(ROOT, 'supabase', 'functions', 'verify-result', 'engine_pin.js'))).ENGINE_SHA256, { health: health.engine });
offset = readOff();
const eraOf = (iso) => VC.rulesFor({ daily_key: iso }); const won = [];
try {
  // era 1: the DB clock as it is (today) — before RULES4_FROM ⇒ rules 3
  const today = israelDate(clientNow());
  const g1 = await newGroup();
  for (const m of ['daily', 'weekly']) await ranked(`[${today}] ${m}`, m, { expectRules: eraOf(today) });
  await ranked(`[${today}] challenge`, 'challenge', { group: g1, expectRules: eraOf(today) });
  if (!CLOCK) skip('eras after the cut-overs + the cut-over day', 'stack started without RR_STAGING_FAKETIME=1');
  else {
    // the RULES4_FROM cut-over: a challenge created the evening before (Israel), played + finished on the cut-over day
    const d4 = VC.RULES4_FROM; const prev = new Date(Date.parse(d4 + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    await setClock(`${prev}T19:00:00Z`);                                   // 21:00 Israel the day before
    const gx = await newGroup(3);
    await setClock(`${d4}T09:00:00Z`);                                     // 11:00 Israel on RULES4_FROM
    await ranked(`[cut-over ${d4}] challenge created ${prev}`, 'challenge', { group: gx, expectRules: eraOf(prev), seedOff: 40 });
    await ranked(`[cut-over ${d4}] daily`, 'daily', { expectRules: eraOf(d4), seedOff: 50 });
    // era 2: a week after RULES4_FROM (rules 4 while RULES5_FROM is later)
    const d4b = new Date(Date.parse(d4 + 'T09:00:00Z') + 8 * 864e5).toISOString().slice(0, 10);
    if (d4b < VC.RULES5_FROM) {
      await setClock(`${d4b}T09:00:00Z`); const g2 = await newGroup();
      for (const m of ['daily', 'weekly']) await ranked(`[${d4b}] ${m}`, m, { expectRules: eraOf(d4b), seedOff: 10 });
      await ranked(`[${d4b}] challenge`, 'challenge', { group: g2, expectRules: eraOf(d4b), seedOff: 15 });
    } else skip(`rules-4 era`, 'RULES5_FROM ≤ RULES4_FROM + 8 days');
    // era 3: after RULES7_FROM ⇒ rules 7
    const d7 = new Date(Date.parse(VC.RULES7_FROM + 'T09:00:00Z') + 2 * 864e5).toISOString().slice(0, 10);
    await setClock(`${d7}T09:00:00Z`); const g3 = await newGroup();
    for (const m of ['daily', 'weekly']) await ranked(`[${d7}] ${m}`, m, { expectRules: eraOf(d7), seedOff: 20 });
    await ranked(`[${d7}] challenge`, 'challenge', { group: g3, expectRules: eraOf(d7), seedOff: 25 });
  }
} finally { if (CLOCK) { writeFileSync(CLOCK, '+0\n'); await sleep(1300); } }
check(`honest WON games verified (stars compared): ${won.length}`, won.length >= 3, won);
console.log(`\n${out.pass} passed, ${out.fail} failed, ${out.skip} skipped · verify-result vs the live RPCs (${TARGET})`);
process.exit(out.fail ? 1 : 0);
