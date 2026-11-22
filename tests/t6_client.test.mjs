// T6 client tests (Node): ghost no-look-ahead (worker core + main-thread accessor), ghost determinism, the timeline / dims / graph helpers,
// practice-branch isolation (SHA-256 of the origin keys), and the ranked gates.  Run: node tests/t6_client.test.mjs
// Ghosts are driven by the REAL archetype policies of tools/sim.mjs (sim contract); the browser loads them from the engine lane's module.
import { createHash } from 'node:crypto';
import * as E from '../js/engine.js';
import { POLICIES } from '../tools/sim.mjs';
import * as F from '../js/flags.js';
import { GhostSet, setPolicies, prng } from '../js/ghost-worker.js';
import * as S from '../js/summary.js';

let fails = 0, n = 0;
const ok = (c, msg, extra = '') => { n++; if (!c) { fails++; console.log('FAIL', msg, extra); } else if (process.env.V) console.log('ok  ', msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)?.slice(0, 200)} ≠ ${JSON.stringify(b)?.slice(0, 200)}`);
const sha = (s) => (s == null ? 'ABSENT' : createHash('sha256').update(s).digest('hex'));
const t0 = Date.now();
const lap = (what) => { if (process.env.V) console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)} s] ${what}`); };

/* ---------------------------------------------------------------- a Map-backed localStorage for Node */
function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}
globalThis.localStorage = memStore();
F._resetForTests({ search: '', storage: JSON.stringify({ rivals: true, rewind: true, recap2: true }) });

// the engine lane's js/systems/archetypes.js — the worker accepts only its public-view contract (ARCH_API 2, review m2)
const ARCHMOD = await import('../js/systems/archetypes.js');
const pol = setPolicies(ARCHMOD);
ok(pol && pol.api === 2, 'the archetype module is accepted (ARCH_API 2)');
ok(setPolicies({ ARCHETYPES: { saver: POLICIES.saver }, ARCH_V: 9 }) === null, 'm2: a module without ARCH_API 2 (state-reading policies) is refused');
setPolicies(ARCHMOD);

/** a played game (smart policy) for fixtures: stop after `rolls` rolls */
function playedGame(worldId, seed, rolls, pol0 = 'smart', extra = {}) {
  const P = POLICIES[pol0]; const st = E.createGame({ worldId, seed, mode: 'free', mentor: 'hint', ...extra }); const r = prng(seed);
  for (let i = 0; i < rolls && !st.over; i++) {
    P.between(st, { r }); if (st.over) break;
    E.rollDice(st);
    let ev = E.landing(st); let k = 0;
    while (ev && !st.over && k++ < 40) { const c = ev.auto ? [ev.options[0].id] : (ev.type === 'mystery' && ev.data.kind === 'quiz') ? [ev.options[0].id] : P.decide(st, ev, { r, n: k - 1 }); let res = E.choose(st, ev, c[0], c[1] || {}); if (!res.ok) { const f = ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled); res = E.choose(st, ev, f.id, f.needsQty ? { qty: 1 } : {}); } ev = res.event; }
  }
  return st;
}

/* ================================================================ AC-17 (worker side): no row past upTo, no mark at/after upTo, until finish */
{
  let msgs = 0, bad = 0, rowsSeen = 0;
  for (const w of ['w1', 'w2', 'w3', 'w4']) {
    for (const seed of [11, 4242]) {
      const st = E.createGame({ worldId: w, seed, mode: 'free' });
      const out = [];
      const gs = new GhostSet({ key: 'k', cfg: E.replayConfig(st), pol, post: (m) => out.push(m) });
      const rnd = prng(seed * 31);
      let up = 1;
      while (up < 30) { up += 1 + Math.floor(rnd() * 3); gs.advance(up); if (rnd() < 0.3) gs.advance(up - 2); /* lower upTo ignored */ while (gs.step()); }
      for (const m of out.filter((x) => x.t === 'rows')) { msgs++; rowsSeen += m.rows.length; if (m.rows.some((r) => r[0] > m.at) || m.marks.some((k) => k[0] >= m.at) || m.at > up) bad++; }
      ok(!out.some((m) => m.t === 'done'), `${w}/${seed}: no 'done' before finish`);
      ok(!out.some((m) => m.t === 'error'), `${w}/${seed}: no ghost error`, JSON.stringify(out.filter((m) => m.t === 'error')));
      gs.finish(Math.ceil(1.6 * E.getWorld(w).maxMonths));
      while (gs.step());
      const done = out.filter((m) => m.t === 'done');
      eq(done.map((d) => d.arch).sort(), ['diversified', 'founder', 'gambler', 'saver'], `${w}/${seed}: four 'done' after finish`);
      ok(done.every((d) => d.end.tl.m.length >= 1 && d.end.recap.dims && d.end.recap.dims.speed.headline), `${w}/${seed}: done carries the full timeline + dims`);
      ok(done.every((d) => d.end.tl.m[d.end.tl.m.length - 1] === d.end.months), `${w}/${seed}: the ghost timeline ends at its last month`);
    }
  }
  ok(msgs > 50 && rowsSeen > 200, `rows messages were produced (${msgs} msgs, ${rowsSeen} rows)`);
  eq(bad, 0, 'AC-17 worker: 0 rows messages beyond upTo');
}

lap('AC-18 ghost determinism');
/* ================================================================ AC-18 ghost determinism: two runs, same key → identical ends */
{
  const run = () => { const st = E.createGame({ worldId: 'w2', seed: 99, mode: 'free' }); const out = []; const gs = new GhostSet({ key: 'k', cfg: E.replayConfig(st), pol, post: (m) => out.push(m) }); gs.advance(12); while (gs.step()); gs.finish(40); while (gs.step()); return out.filter((m) => m.t === 'done').map((m) => [m.arch, m.end]); };
  eq(run(), run(), 'AC-18: identical ghost ends in two runs (same key)');
}

lap('AC-17 (main thread)');
/* ================================================================ AC-17 (main thread): ghosts.view() clamps; protocol violations are dropped */
{
  const GH = await import('../js/ghosts.js');
  const st = playedGame('w1', 321, 10);
  const g = GH.start(st);
  ok(g && g.state === 'noworker', 'Node has no Worker: no ghost computation during play (state noworker)', g && g.state);
  const key = GH.status().key;
  GH.advance(st);
  const up = GH.status().upTo;
  eq(up, st.month, 'advance: upTo = the player month');
  GH._msg({ t: 'rows', key, arch: 'saver', at: up, rows: [[1, 1, 1, 1, 1, 1, 1, 50, 50], [up, 2, 2, 2, 2, 2, 2, 50, 50]], marks: [[1, 'buy', 100, -1, 'x']] });
  GH._msg({ t: 'rows', key, arch: 'founder', at: up, rows: [[up + 1, 9, 9, 9, 9, 9, 9, 9, 9]], marks: [] });   // a row from the future
  GH._msg({ t: 'rows', key, arch: 'gambler', at: up, rows: [], marks: [[up, 'buy', 1, -1, '']] });          // a mark of this month
  eq(GH.audit().violations, 2, 'main-thread R3 check: two violating messages counted and dropped');
  const v = GH.view(st.month);
  ok(v.ghosts.founder.rows.length === 0 && v.ghosts.gambler.marks.length === 0, 'view(): nothing from the dropped messages');
  eq(v.ghosts.saver.rows.map((r) => r[0]), [1, up], 'view(): the valid rows are visible');
  const v1 = GH.view(1);
  ok(v1.ghosts.saver.rows.every((r) => r[0] <= 1) && v1.ghosts.saver.marks.length === 0, 'view(month): rows m ≤ month, marks m < month');
  ok(GH.ends() === null, 'ends(): nothing while the player plays');
  // a cached FULL ghost game is clamped the same way during play
  const full = { saver: { status: 'won', months: 40, tl: S.tlFromRows(Array.from({ length: 40 }, (_, i) => [i + 1, i, i, 0, i, 10, i * 10, 60, 60])), marks: [[5, 'buy', 1, -1, 'a'], [30, 'sell', 1, -1, 'b']], recap: { dims: {} } } };
  GH.stop();
  await GH.policiesReady();
  const { polTag } = await import('../js/ghost-worker.js');
  const tag = polTag(pol);
  GH.cacheWrite(GH.baseKey(st) + '|a2.0', full);           // an older policy version: never used (m1)
  GH.start(st); ok(GH.status().mode !== 'cache', 'm1: a cached entry of another policy version is not used'); GH.stop();
  GH.cacheWrite(GH.baseKey(st) + '|' + tag, full);
  GH.start(st);
  const vc = GH.view(st.month);
  ok(GH.status().mode === 'cache' && vc.ghosts.saver.rows.length === st.month && vc.ghosts.saver.rows.every((r) => r[0] <= st.month) && vc.ghosts.saver.marks.every((k) => k[0] < st.month) && !vc.ghosts.saver.escaped, `cached full game: view(${st.month}) shows only months ≤ ${st.month}, escape hidden`);
  ok(!GH.view(45).ghosts.saver.escaped, 'm7: view(45) is clamped to the player month (no escape at month 40 yet)');
  const st45 = JSON.parse(JSON.stringify(st)); st45.month = 45; GH.advance(st45);
  ok(GH.view(45).ghosts.saver.escaped && GH.view(45).ghosts.saver.escaped.m === 40, 'cached game: the escape shows once the player passed it');
  // cache: LRU ≤ 8 entries and ≤ 80 KB; a read makes an entry the most recent; entries are shrunk (M3)
  GH.cacheClear();
  for (let i = 0; i < 12; i++) GH.cacheWrite('key' + i, { saver: { months: i } });
  ok(JSON.parse(localStorage.getItem(GH.CACHE_KEY)).length === 8, 'rr2-ghosts keeps ≤ 8 entries');
  GH.cacheRead('key4'); GH.cacheWrite('key12', { saver: { months: 12 } });
  const keys = JSON.parse(localStorage.getItem(GH.CACHE_KEY)).map((x) => x.key);
  ok(keys.includes('key4') && !keys.includes('key5'), 'LRU: the entry just read survives, the least recently used one goes');
  const bigTl = S.tlFromRows(Array.from({ length: 200 }, (_, i) => [i + 1, i, i, i, i, i, i, 50, 50]));
  const fat = Object.fromEntries(['saver', 'founder', 'diversified', 'gambler'].map((a) => [a, { status: 'won', months: 200, tl: bigTl, marks: Array.from({ length: 40 }, (_, i) => [i, 'buy', i, -1, 'x']), recap: { dims: { speed: { short: 'x' } } } }]));
  for (let i = 0; i < 8; i++) GH.cacheWrite('fat' + i, fat, 60);
  const rawC = localStorage.getItem(GH.CACHE_KEY); const allC = JSON.parse(rawC);
  ok(rawC.length <= GH.CACHE_BYTES, `rr2-ghosts ≤ 80 KB (${rawC.length} bytes, ${allC.length} entries)`);
  const one = allC[0].ghosts.saver;
  ok(one.tl.m.length === 60 && !('debt' in one.tl) && !('en' in one.tl) && one.marks.length <= 12, 'shrunk entry: timeline to the player end + tail, panel columns only, ≤ 12 marks');
  ok(JSON.stringify(allC[0]).length < 10 * 1024, `one shrunk 4-ghost entry < 10 KB (${JSON.stringify(allC[0]).length} bytes)`);
  GH.stop();
  F._resetForTests({ search: '', storage: '{"rivals":false}' });   // rivals is ON by default: the rollback switch turns it off
  ok(GH.start(st) === null && GH.view(5).state === 'off', 'flag rivals off → no ghosts at all');
  F._resetForTests({ search: '', storage: JSON.stringify({ rivals: true, rewind: true, recap2: true }) });
}

lap('timeline, dims, graph');
/* ================================================================ timeline, dims, graph (AC-11 fallback, AC-25) */
{
  const tl = S.tlNew(1);
  for (let m = 1; m <= 300; m++) S.tlPush(tl, [m, m, m, 0, 0, 1, 0, 50, 50]);
  ok(tl.m[0] === 1 && tl.m.length < 240 && tl.step >= 2, `cap 240: halved (len ${tl.m.length}, step ${tl.step}), first row kept`);
  const st = playedGame('w2', 77, 40);
  const t2 = S.tlNew(st.month); S.tlPush(t2, S.tlRowOf(E.metrics(st)));
  const m = E.metrics(st);
  eq(S.tlRows(t2)[0], [m.month, Math.round(m.netWorth / 100), Math.round((m.cash + m.savings) / 100), Math.round(m.totalLiabilities / 100), Math.round(m.passive), Math.round(m.expenses), Math.round(Math.min(...m.goalParts.map((p) => p.progress)) * 1000), Math.round(m.life.happiness), Math.round(m.life.energy)], 'tl row = metrics() at that moment (₪100 units)');
  const big = S.tlFromRows(Array.from({ length: 30 }, (_, i) => [i + 1, 100 + i * 7, 50 - i, 10, i * 3, 4000, i * 30, 60 - i, 70 - i]));
  const tbl = S.graphTable(big, { all: true });
  const cells = [...tbl.matchAll(/<th scope="row"><bdi dir="ltr" class="num">(\d+)<\/bdi>/g)].map((x) => +x[1]);
  eq(cells, big.m, 'AC-25: the table has exactly one row per timeline row (months as row headers)');
  ok(/<caption>הנתונים של הגרף<\/caption>/.test(tbl) && /<th scope="col">חודש<\/th>/.test(tbl), 'AC-25: caption + column headers');
  const svg = S.graphSvg(big, { alt: S.altOf(big, {}) });
  ok(/role="img"/.test(svg) && /aria-label="שווי נקי: התחלת ב־/.test(svg), 'graph: role=img + the alt template');
  ok(/class="g-low"/.test(svg), 'graph: a run with cash + savings under one month of expenses is shaded');
  const end = { status: 'lost', months: 60, progress: 0.42, stats: { crises: 3, crisisNoLoan: 2, autoLoans: 1, forcedLoans: 5000 }, learning: { decisions: 10, verdicts: { strong: 6, ok: 1, mixed: 1, risky: 1, costly: 1 } }, lifeSummary: { avgHappiness: 61, burnouts: 0 }, happiness: 58 };
  const d = S.dimsFallback({ end, m: null, tl: big, worldId: 'w1', charId: E.getWorld('w1').characters[0].id });
  eq([d.speed.short, d.resilience.short, d.decisions.short, d.happiness.short, d.business.short], ['42% מהדרך', '1 הלוואות כפויות', '6 חזקות · 2 חלשות', 'ממוצע 61', '—'], 'dims fallback: §14.5 shorts from engine numbers');
  ok(d.resilience.headline.startsWith('עברת 3 משברים — 2 בלי הלוואה כפויה.'), 'dims fallback: resilience headline');
  // order: won first, months asc; ties share a place; no composite score anywhere
  const mk = (won, months, progress) => ({ facts: { won, months, progress } });
  const gl = [{ p: { icon: 'a', name: 'A' }, dims: { speed: { ...mk(true, 30, 1), short: 'חודש 30' } } }, { p: { icon: 'b', name: 'B' }, dims: { speed: { ...mk(false, 60, 0.9), short: '90% מהדרך' } } }, { p: { icon: 'c', name: 'C' }, dims: { speed: { ...mk(true, 30, 1), short: 'חודש 30' } } }];
  const pl = S.placeOf('speed', mk(true, 30, 1), gl);
  eq([pl.r, pl.of, pl.tie], [1, 4, true], 'placeOf: a tie shares first place');
  eq(S.placeOf('speed', mk(false, 60, 0.5), gl).r, 4, 'placeOf: not won and less progress → last');
  ok(!/score|ציון/.test(S.dimRowsHtml(d, { rivals: 'off' })), 'no composite score in the dimension rows');
}

lap('AC-27 / AC-28');
/* ================================================================ AC-27 / AC-28 branch isolation + fidelity (rewind.js) */
const RW = await import('../js/rewind.js');
const saves = await import('../js/saves.js');
{
  const store = memStore(); RW._setStorage(store); globalThis.localStorage = store;
  const w = 'w1';
  const live = playedGame(w, 2024, 30);
  const cfgLive = { worldId: w, charId: live.charId, seed: live.seed, mode: 'free', pawn: 'classic', pawnColor: '#e2483d' };
  saves.write('rr2-save-free-' + w, cfgLive, { ...live, ui: saves.normalizeUi({}) });
  const learnSt = playedGame(w, 555, 20);
  saves.write('rr2-save-learn-' + w, { ...cfgLive, seed: learnSt.seed, learn: true }, { ...learnSt, ui: saves.normalizeUi({}) });
  const fin = playedGame(w, 777, 60);
  ok(RW.saveLastGame({ cfg: { ...cfgLive, seed: fin.seed }, state: fin, endLite: { status: 'x' } }), 'rr2-last-game written for a free game');
  const ORIG = ['rr2-save-free-' + w, 'rr2-save-learn-' + w, RW.LAST_KEY];
  const hash = () => ORIG.map((k) => sha(store.getItem(k)));
  const h0 = hash();
  const pts = RW.decisionPoints(live);
  ok(pts.length >= 5 && pts.every((p) => p.k0 <= p.k), `decision points from the log (${pts.length}), k0 ≤ k`);
  // AC-12-like check of the fallback card start: replaying the prefix leaves a card pending with nothing chosen for card decisions
  let pend = 0, cardPts = 0;
  for (const p of pts.filter((x) => live.actions[x.k] && live.actions[x.k][0] === 'c').slice(-12)) { cardPts++; const st = E.replay(E.replayConfig(live), live.actions.slice(0, p.k0)); if (st.pending) pend++; }
  ok(cardPts > 0 && pend === cardPts, `k0 = card start: a card is pending after replaying the prefix (${pend}/${cardPts})`);
  const p = pts[Math.floor(pts.length / 2)];
  // M4: a LIVE free game can not be branched; a live learning game can
  let liveFree = null; try { await RW.createBranch({ origin: 'live', w, k0: p.k0, originKey: 'rr2-save-free-' + w, cfg: cfgLive }); } catch (e) { liveFree = e.message; }
  eq(liveFree, 'rewind_live', 'M4: createBranch from a live FREE game throws rewind_live');
  ok(!RW.allowed(cfgLive) && RW.allowed({ ...cfgLive, learn: true }) && RW.endAllowed(cfgLive), 'M4: live entry points only in learn games; end entry for free games');
  saves.write('rr2-save-learn-' + w, { ...cfgLive, learn: true }, { ...live, ui: saves.normalizeUi({}) });   // the live original is a learning game
  const hL = sha(store.getItem('rr2-save-learn-' + w)); h0[1] = hL;
  const r1 = await RW.createBranch({ origin: 'live', w, k0: p.k0, originKey: 'rr2-save-learn-' + w, cfg: { ...cfgLive, learn: true } });
  ok(r1.ok && r1.cfg.learn === true && r1.cfg.slot === 'branch' && r1.key === RW.branchKey(w), 'createBranch(live): branch slot, learn:true', JSON.stringify(r1).slice(0, 200));
  const b = saves.load(RW.branchKey(w));
  const ref = E.replay(E.replayConfig(live), live.actions.slice(0, p.k0));
  const strip = (x) => { const o = JSON.parse(JSON.stringify(x)); delete o.ui; delete o.learn; return o; };
  eq(strip(b.state), strip(ref), 'AC-28: branch state = replay(cfg, actions.slice(0, k0))');
  ok(b.state.ui.branch && b.state.ui.branch.originKey === 'rr2-save-learn-' + w && b.state.ui.branch.id && b.state.ui.branch.id.seed === live.seed && b.state.ui.branch.id.n === p.k0, 'S.ui.branch records the origin and its identity (seed, world, char, prefix hash)');
  ok(RW.compareData(b.state) && RW.compareData(b.state).originTl, 'M2: compare data while the original is unchanged');
  eq(hash(), h0, 'AC-27: origin keys unchanged after create');
  // play 20 turns in the branch (as game.js would, writing only the branch slot)
  const bs = b.state; const P = POLICIES.smart; const r = prng(5);
  const closeAll = (ev) => { let k = 0; while (ev && !bs.over && k++ < 30) { const o = ev.options.find((x) => x.enabled && ['done', 'pass', 'ok', 'skip'].includes(x.id)) || ev.options.find((x) => x.enabled); const res = E.choose(bs, ev, o.id, o.needsQty ? { qty: 1 } : {}); ev = res.ok ? res.event : null; } };
  for (let i = 0; i < 20 && !bs.over; i++) { P.between(bs, { r }); if (bs.over) break; if (bs.pending) closeAll(E.currentEvent(bs)); if (bs.over) break; E.rollDice(bs); closeAll(E.landing(bs)); saves.write(RW.branchKey(w), b.cfg, bs); }
  eq(hash(), h0, 'AC-27: origin keys unchanged after 20 branch turns');
  let asked = 0;
  const r2 = await RW.createBranch({ origin: 'last', k0: 5 }, { confirmReplace: async () => { asked++; return true; } });
  ok(r2.ok && asked === 1, 'replace: asks once, then replaces (origin last)');
  const meta = RW.branches(); ok(meta.length === 1 && meta[0].origin === 'last' && meta[0].k0 === 5, 'rr2-branches: one entry per world');
  const r3 = await RW.createBranch({ origin: 'last', k0: 6 }, { confirmReplace: async () => false });
  ok(!r3.ok && r3.error === 'cancelled', 'replace refused → nothing changes');
  eq(hash(), h0, 'AC-27: origin keys unchanged after replace');
  RW.deleteBranch(w);
  ok(store.getItem(RW.branchKey(w)) == null && RW.branches().length === 0, 'delete: branch slot + meta entry gone');
  eq(hash(), h0, 'AC-27: origin keys unchanged after delete');
  // branching from a branch replays the branch's own log and keeps the original as origin
  const rA = await RW.createBranch({ origin: 'live', w, k0: p.k0, originKey: 'rr2-save-learn-' + w, cfg: { ...cfgLive, learn: true } });
  const rB = await RW.createBranch({ origin: 'live', w, k0: Math.max(1, p.k0 - 3), originKey: RW.branchKey(w), cfg: rA.cfg }, { confirmReplace: async () => { throw new Error('should not ask when branching from the branch itself'); } });
  ok(rB.ok && RW.branches()[0].originKey === 'rr2-save-learn-' + w && RW.branches()[0].id.seed === live.seed, 'branch from a branch: replaces it, origin (and its identity) stay the original');
  eq(hash(), h0, 'AC-27: origin keys unchanged after branch-from-branch');
  let guard = null; try { RW.saveLastGame({ cfg: { ...cfgLive, slot: 'branch' }, state: fin }); } catch (e) { guard = e; }
  ok(guard === null, 'a branch end never overwrites rr2-last-game');
  eq(hash(), h0, 'AC-27: rr2-last-game unchanged after a branch end');
  // M2: the original slot is taken by another game → no "המקור" any more
  const bB = saves.load(RW.branchKey(w)).state;
  const other = playedGame(w, 999, 12);
  saves.write('rr2-save-learn-' + w, { ...cfgLive, seed: other.seed, learn: true }, { ...other, ui: saves.normalizeUi({}) });
  ok(RW.compareData(bB) === null, 'M2: another game in the original slot → compare data is null (the original is no longer available)');
  // origin "last": replaced by another finished game → null as well
  const rL = await RW.createBranch({ origin: 'last', k0: 8 }, { confirmReplace: async () => true });
  const bL = saves.load(RW.branchKey(w)).state;
  ok(rL.ok && RW.compareData(bL) && RW.compareData(bL).originTl, 'origin last: compare data while rr2-last-game is the same game');
  RW.saveLastGame({ cfg: { ...cfgLive, worldId: 'w2', seed: 4 }, state: playedGame('w2', 4, 10), endLite: null });
  ok(RW.compareData(bL) === null, 'M2: rr2-last-game replaced by an unrelated game → compare data is null');
  // m6: rr2-last-game is tied to the engine version and capped in size
  const lg = JSON.parse(store.getItem(RW.LAST_KEY));
  ok(lg.sv === E.SAVE_VERSION && lg.rev === (E.OUTCOME_REV ?? 0) && store.getItem(RW.LAST_KEY).length <= RW.LAST_MAX_BYTES, `m6: rr2-last-game carries sv/rev, ${store.getItem(RW.LAST_KEY).length} bytes ≤ ${RW.LAST_MAX_BYTES}`);
  const longGame = playedGame('w1', 4321, 140);
  RW.saveLastGame({ cfg: { ...cfgLive, seed: longGame.seed }, state: longGame, endLite: { status: 'x', recap: { dims: {}, graph: { tl: S.tlNew(1) } } } });
  ok(store.getItem(RW.LAST_KEY).length <= RW.LAST_MAX_BYTES || longGame.actions.length > 600, `m6: a long game's record is thinned to ≤ 8 KB (${store.getItem(RW.LAST_KEY).length} bytes, ${longGame.actions.length} actions)`);
  const lr = JSON.parse(store.getItem(RW.LAST_KEY)).endLite.recap || {};
  ok(!(lr.graph && lr.graph.tl), 'm6: the timeline is not duplicated in endLite');
  store.setItem(RW.LAST_KEY, JSON.stringify({ ...JSON.parse(store.getItem(RW.LAST_KEY)), rev: -1 }));
  ok(RW.lastGame() === null, 'm6: a record from another outcome revision is refused');
}

lap('AC-29 ranked');
/* ================================================================ AC-29 ranked gates (client side) */
{
  F._resetForTests({ search: '?ff=rewind,afterwin,recap2', storage: null });
  const ranked = [{ mode: 'daily', worldId: 'w1' }, { mode: 'weekly', worldId: 'w2' }, { mode: 'challenge', worldId: 'w3' }, { mode: 'free', worldId: 'w1', resultId: 'r-1' }];
  ok(ranked.every((c) => F.flagFor('rewind', c) === false && F.flagFor('afterwin', c) === false), 'flagFor(rewind / afterwin, ranked) is false even with ?ff=');
  ok(ranked.every((c) => RW.allowed(c) === false && RW.endAllowed(c) === false) && RW.endAllowed({ mode: 'free', worldId: 'w1' }) && RW.allowed({ mode: 'free', worldId: 'w1', learn: true }) && !RW.allowed({ mode: 'free', worldId: 'w1' }) && !RW.endAllowed({ mode: 'history', worldId: 'h' }), 'rewind gates: end entry free / learn, live entry learn only, never ranked / history');
  let thrown = 0;
  for (const c of ranked) { try { await RW.createBranch({ origin: 'live', w: c.worldId, k0: 1, originKey: 'rr2-save-free-w1', cfg: c }); } catch (e) { if (e.message === 'rewind_ranked') thrown++; } }
  eq(thrown, 4, "createBranch(ranked cfg) throws 'rewind_ranked'");
  let t2 = null; try { RW.assertPractice({ mode: 'daily' }); } catch (e) { t2 = e.message; } eq(t2, 'rewind_ranked', 'assertPractice(daily) throws');
  ok(RW.saveLastGame({ cfg: { mode: 'daily', worldId: 'w1' }, state: E.createGame({ worldId: 'w1', seed: 1, mode: 'daily' }) }) === false, 'rr2-last-game never stores a ranked game');
  // V3: the ranked resume prefers the local save only when the server log is its prefix
  const srv = { seed: 5, ui: { seq: 4 }, actions: [['r'], ['l'], ['c', 'buy']] };
  const ext = { seed: 5, ui: { seq: 9 }, actions: [['r'], ['l'], ['c', 'buy'], ['r']] };
  const div = { seed: 5, ui: { seq: 9 }, actions: [['r'], ['l'], ['c', 'pass'], ['r'], ['l']] };
  const old = { seed: 5, ui: { seq: 2 }, actions: [['r']] };
  ok(RW.pickRankedState(ext, srv) === ext, 'V3: a newer local save that extends the server log is used');
  ok(RW.pickRankedState(div, srv) === srv, 'V3: a newer local save that diverged (crafted rewind) → the server state');
  ok(RW.pickRankedState(old, srv) === srv && RW.pickRankedState({ ...ext, seed: 6 }, srv) === srv && RW.pickRankedState(null, srv) === srv, 'V3: older / other seed / missing local → the server state');
  ok(RW.isPrefix([], [['r']]) && !RW.isPrefix([['r'], ['l']], [['r']]), 'isPrefix basics');
}

lap('static: the policies');
lap('M3 storage priority');
/* ================================================================ M3: under quota the ghost cache and old branches go before any T1 backup */
{
  function quotaStore(limit) {
    const m = new Map(); const size = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { v = String(v); const old = m.get(k); m.set(k, v); if (size() > limit) { if (old == null) m.delete(k); else m.set(k, old); const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
  }
  const st = playedGame('w1', 31, 25); const cfg = { worldId: 'w1', charId: st.charId, seed: st.seed, mode: 'free' };
  const one = JSON.stringify({ v: 3, cfg, state: st }).length + 400;
  const qs = quotaStore(1e9); RW._setStorage(qs);
  let cur = qs; const used = () => [...cur._m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  saves.write('rr2-save-free-w1', cfg, st);
  saves.backup('rr2-save-free-w2', JSON.stringify({ v: 3, cfg, state: st }), 'clear');      // a T1 backup of a real save
  saves.write('rr2-save-branch-w3', { ...cfg, learn: true, slot: 'branch' }, st);            // an older practice branch
  qs.setItem('rr2-ghosts', JSON.stringify(['x'.repeat(one + 1000)]));
  const limit = used() + 1500; const q2 = quotaStore(limit); for (const [k, v] of qs._m) q2._m.set(k, v); RW._setStorage(q2); cur = q2;
  const r = saves.write('rr2-save-free-w4', cfg, st);
  ok(r.ok && q2.getItem('rr2-ghosts') === null && q2.getItem('rr2-save-branch-w3') !== null && q2.getItem('rr2-bak:rr2-save-free-w2') !== null, 'M3: a real save under quota evicts the ghost cache first; the older branch and the T1 backup survive');
  q2._m.set('rr2-branches', JSON.stringify([{ w: 'w3', origin: 'last', k0: 4, month: 3, at: 1 }]));
  saves.takeRemovedBranches();
  const r2 = saves.write('rr2-save-branch-w1', { ...cfg, learn: true, slot: 'branch' }, st);
  ok(r2.ok && q2.getItem('rr2-save-branch-w3') === null && q2.getItem('rr2-bak:rr2-save-free-w2') !== null, 'M3: then an older practice branch (another world) goes; the T1 backup stays');
  eq([r2.removedBranches, saves.takeRemovedBranches(), saves.takeRemovedBranches(), JSON.parse(q2.getItem('rr2-branches'))], [['rr2-save-branch-w3'], ['w3'], [], []],
    'T6 verify D4: a removed branch is reported (write result + takeRemovedBranches once, for the player notice) and its rr2-branches entry is dropped');
  q2.removeItem('rr2-save-branch-w1');
  q2._m.set('rr2-save-branch-w4', JSON.stringify({ v: 3, cfg: { worldId: 'w4', learn: true, slot: 'branch' }, state: { v: 1, month: 2 }, savedAt: 5 }));   // another world's (small) branch: removing it cannot make room
  q2._m.set('rr2-branches', JSON.stringify([{ w: 'w4', origin: 'last', k0: 4, month: 3, at: 5 }]));
  q2._m.set('rr2-ghosts', JSON.stringify(['g'.repeat(500)]));
  const w4raw = q2.getItem('rr2-save-branch-w4'), ghRaw = q2.getItem('rr2-ghosts');
  q2._m.set('rr2-x-filler', 'y'.repeat(Math.max(0, limit - used() - 300)));
  const r3 = saves.write('rr2-save-branch-w2', { ...cfg, learn: true, slot: 'branch' }, st);
  ok(!r3.ok && r3.quota && q2.getItem('rr2-bak:rr2-save-free-w2') !== null, 'M3: a branch write that still does not fit fails with quota (toast) and never evicts a T1 backup');
  ok(q2.getItem('rr2-save-branch-w4') === w4raw && q2.getItem('rr2-ghosts') === ghRaw && JSON.parse(q2.getItem('rr2-branches')).length === 1 && !saves.takeRemovedBranches().length,
    'T6 verify D4 (§7.2): a write that fails anyway leaves the other world\'s branch, its rr2-branches entry and the ghost cache exactly as they were');
  q2.removeItem('rr2-bak:rr2-save-free-w2'); q2.removeItem('rr2-x-filler');   // no T1 backup left to evict either; full again
  q2._m.set('rr2-x-filler', 'y'.repeat(Math.max(0, limit - used() - 300)));
  const r4 = saves.write('rr2-save-free-w3', cfg, st);   // a real save that does not fit even after the soft data
  ok(!r4.ok && r4.quota && q2.getItem('rr2-save-branch-w4') === w4raw && q2.getItem('rr2-ghosts') === ghRaw, 'T6 verify D4: a failing real save puts the soft data back too', JSON.stringify([r4, q2.getItem('rr2-save-branch-w4') === w4raw, q2.getItem('rr2-ghosts') === ghRaw, [...q2._m.keys()]]));
  q2.removeItem('rr2-x-filler');
  const r5 = saves.backup('rr2-save-free-w9', JSON.stringify({ v: 3, cfg, state: { v: 1 } }), 'clear');
  ok(r5 && q2.getItem('rr2-save-branch-w4') === w4raw && !saves.takeRemovedBranches().length, 'a backup that fits without soft eviction removes nothing');
  RW._setStorage(globalThis.localStorage);
}

lap('AC-31 drafts');
/* ================================================================ AC-31 / M5: the server drafts are in the repo and NOT applied */
{
  const fs = await import('node:fs');
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  ok(/^-- T6 §8\.2 — NOT APPLIED — AWAITING OWNER APPROVAL/.test(rd('docs/next-level/drafts/t6_append_only.sql')), 'AC-31: the migration draft header says NOT APPLIED');
  ok(/^# T6 §8\.3 — NOT APPLIED — AWAITING OWNER APPROVAL/.test(rd('docs/next-level/drafts/verify-prefix-check.diff')), 'AC-31: the verify diff header says NOT APPLIED');
  ok(/NOT APPLIED/.test(rd('docs/next-level/drafts/README.md')), 'drafts README present');
  const mig = fs.existsSync(new URL('../supabase/migrations/', import.meta.url)) ? fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)) : [];
  ok(!mig.some((f) => /t6_append_only/.test(f)) && !mig.some((f) => /tg_checkpoint_append_only/.test(rd('supabase/migrations/' + f))), 'AC-31: no T6 trigger under supabase/migrations (nothing applied)');
  ok(!/ck_actions|checkpoint_prefix/.test(rd('supabase/functions/verify-result/verify_core.js')), 'AC-31: verify_core.js unchanged (the prefix check is only a draft)');
}

lap('AC-26 suggestion rules');
/* ================================================================ AC-26: the suggestion of the engine recap, rules 1, 2, 4 from real games (rule 3: fixture) */
{
  const cases = [['w1', 'teacher', 500, 'smart', 1], ['w1', 'teacher', 500, 'guideTapper', 2], ['w1', 'doctor', 539, 'guideTapper', 4]];
  for (const [w, ch, seed, pol0, rule] of cases) {
    const { play } = await import('../tools/sim.mjs');
    const { st, end } = play(w, ch, seed, pol0, 80); const e = end || E.endNow(st);
    const sg = e.recap && e.recap.suggestion;
    ok(sg && sg.rule === rule, `AC-26 rule ${rule}: engine suggestion of a real game (${w}/${ch}/${seed}/${pol0}) → rule ${sg && sg.rule}`);
    const top = S.renderTop({ end: e, t6: {} }, { rivals: 'off', rewindAllowed: true });
    const hasCta = /data-act="t6-rewind"/.test(top);
    ok(top.includes(S.esc(sg.text).slice(0, 20)) && hasCta === (sg.k0 != null), `AC-26 rule ${rule}: the text is shown; rewind CTA only with k0 (${sg.k0})`);
    ok(!/data-act="t6-rewind"/.test(S.renderTop({ end: e, t6: {} }, { rivals: 'off', rewindAllowed: false })), `AC-26 rule ${rule}: no CTA when rewind is not allowed`);
  }
  const fx = { recap: { dims: null, suggestion: { rule: 3, text: 'כדאי לחזק: כרית ביטחון — קודם כרית', k0: null } } };
  const top3 = S.renderTop({ end: fx, t6: {} }, { rivals: 'off', rewindAllowed: true });
  ok(top3.includes('כדאי לחזק') && !/t6-rewind/.test(top3), 'AC-26 rule 3 (fixture — not observed in 168 sim games): text, no CTA');
}

lap('characters-meta');
{
  const { CHAR_META } = await import('../js/data/characters-meta.js');
  ok(CHAR_META['w4:engineer'].weakness.includes(`${E.starThresholds('w4', 'engineer').maxMonths} חודשים`), `characters-meta: the engineer line says ${E.starThresholds('w4', 'engineer').maxMonths} months (engine per-character limit)`);
}

/* ================================================================ static: the policies are never inlined in the client */
{
  const fs = await import('node:fs');
  const src = ['js/ghost-worker.js', 'js/ghosts.js', 'js/summary.js', 'js/rewind.js'].map((f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
  ok(!/greedyLike|betweenCommon|ddRule\(|planFor\(/.test(src), 'no archetype / sim policy logic copied into the client modules');
  ok(!/net\.|fetch\(|supabase/i.test(fs.readFileSync(new URL('../js/ghosts.js', import.meta.url), 'utf8')), 'ghosts.js never talks to the network (DD-6)');
}

console.log(`t6_client: ${n - fails} passed, ${fails} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
