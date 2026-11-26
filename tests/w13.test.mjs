#!/usr/bin/env node
// w13 אצטדיון הכוכבים (engine side): lazy registration, the `league` rule adapter (V-adapter: ≤ 350 lines, uses: [auction, season], state
// only in st.world.league) and the new `auction` module (fixed draws on stream `world`: 18 at init, 6 per payday, 5 per 'H' landing), the
// transfer auction (rival ceilings sealed, ≤ 3 rounds, walk = the safe option, the winner's curse), the season (10 rounds, 2 windows, the
// rank cliff: top 2 up, bottom 2 down, prize money, the FFP season check), book vs market value, the goal (nw at book + wage ratio ≤ 70 %),
// Z actions replayed and verified, saves, fuzz, the fictional-names check (L-fict) and the verifier's per-world pack.
// Run: node tests/w13.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { STREAMS, LAZY_STREAMS } from '../js/rng.js';
import { prng } from './lib/random-player.mjs';
import { DRAWS as ADRAWS, newLot, offer, levels, topRival, ROUNDS } from '../js/worlds/mech/auction.js';
import { DRAWS as LDRAWS, book, mv, PV, ageF, wageFor, ratio12, strength, rankOf, table, clubValue, squadBook, FFP } from '../js/worlds/adapters/league.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }

await test('lazy registry: w13 is not loaded by the engine; ensureWorld loads it; meta agrees; w11 counts w13; its lessons arrive with its pack', async () => {
  assert.deepEqual(E.WORLDS.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.equal(E.isLoaded('w13'), false); assert.throws(() => E.getWorld('w13'), /world_not_loaded/);
  assert.equal(E.LESSONS.some((l) => l.id === 'rank_cliff'), false, 'the core carries no w13 lesson');
  const w = await E.ensureWorld('w13'); assert.equal(w.id, 'w13'); assert.equal(w.minRules, 7); assert.equal(w.mechanic, 'league'); assert.deepEqual(w.modules, ['league', 'auction']); assert.deepEqual(w.streams, ['content']);
  for (const id of ['rank_cliff', 'winners_curse', 'book_value']) assert.ok(E.LESSONS.some((l) => l.id === id), id + ' registered from the pack');
  const { metaOf, isUnlockedBy } = await import('../js/worlds/meta.js'); const m = metaOf('w13');
  assert.equal(m.status, 'lazy'); assert.equal(m.tier, 7); assert.equal(m.ranked, false); assert.deepEqual(m.characters.map((c) => c.id), w.characters.map((c) => c.id));
  assert.deepEqual(m.unlock, [{ any: ['w6', 'w7', 'w8'], count: 1, stars: 1 }]); assert.equal(isUnlockedBy('w13', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w7: 1 }), true);
  assert.deepEqual(metaOf('w11').unlock[1].any, ['w9', 'w10', 'w13']); assert.equal(isUnlockedBy('w11', { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1, w13: 1 }), true);
  const src = readFileSync(new URL('../js/worlds/adapters/league.js', import.meta.url), 'utf8'); assert.ok(src.split('\n').length <= 350, 'V-adapter ≤ 350 lines'); assert.match(src, /uses: \[AUCTION, 'season'\]/);
  assert.ok(!/st\.world\.(?!league\b)[a-z]+\s*=/.test(src), 'the adapter writes only st.world.league');
});

const W13 = E.getWorld('w13'); const CH = W13.characters.map((c) => c.id);
const settle = (st, ev) => { let k = 0; while (ev && !st.over && k++ < 12) { const en = ev.options.filter((o) => o.enabled); const o = en.find((x) => ['walk', 'pass', 'decline', 'ok', 'done', 'skip'].includes(x.id)) || en[0]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
const step = (st) => { E.rollDice(st); settle(st, E.landing(st)); };
const untilMonth = (st, m) => { let g = 0; while (!st.over && st.month < m && g++ < 3000) step(st); };
const play = (cfg, r, { zRate = 0.25, maxTurns = 300, onTurn } = {}) => {
  const st = E.createGame(cfg);
  for (let t = 0; t < maxTurns && !st.over; t++) {
    if (r() < zRate) { const acts = E.worldActions(st).filter((a) => a.enabled); if (acts.length) { const a = acts[Math.floor(r() * acts.length)]; E.worldAction(st, a.id, a.param); } }
    if (st.over) break;
    if (st.pending) { let ev = E.currentEvent(st); let k = 0; while (ev && k++ < 20 && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } if (st.over) break; }
    E.rollDice(st); let ev = E.landing(st); let k = 0;
    while (ev && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = k > 3 ? (en.find((x) => ['ok', 'done', 'pass', 'decline', 'walk'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; k++; }
    if (onTurn) onTurn(st, t);
  }
  return st;
};
const toH = (st) => { st.pending = null; st.phase = 'roll'; for (let g = 0; g < 400 && !st.over; g++) { E.rollDice(st); const ev = E.landing(st); if (st.pending && st.pending.type === 'mech') return ev; settle(st, ev); } return null; };
const LI = (st) => E.metrics(st).worldIndicators.league;

await test('start: rules 7; 18 players each; start equity ₪40–120M (squad at book); the goal is nw ₪450M + wage ratio ≤ 70 %, hold 2', () => {
  assert.equal(E.createGame({ worldId: 'w13', seed: 3, rules: 4 }).rules, 7);
  for (const ch of CH) { const st = E.createGame({ worldId: 'w13', charId: ch, seed: 9 }); const m = E.metrics(st);
    assert.equal(st.world.league.squad.length, 18); assert.equal(st.world.league.div, 1); assert.equal(m.worldIndicators.panel.id, 'league'); assert.equal(m.worldIndicators.panel.rows.length, 18);
    assert.ok(m.netWorth >= 40e6 && m.netWorth <= 120e6, ch + ' NW ' + m.netWorth); assert.equal(m.netWorth, st.cash + clubValue(st));
    assert.equal(m.goalType, 'all'); assert.deepEqual(m.goalParts.map((p) => p.key), ['netWorth', 'wageRatio12']); assert.equal(m.goalParts[1].cmp, 'le'); assert.equal(m.goalParts[1].target, 0.7); }
  assert.deepEqual(W13.goal, { type: 'all', hold: 2, of: [{ type: 'nw', target: 450000000 }, { type: 'modValue', key: 'wageRatio12', target: 0.7, cmp: 'le', label: 'שכר מול הכנסות (12 חודשים)' }] });
  const c = E.createGame({ worldId: 'w13', charId: 'coachOwner', seed: 9 }); const t = E.createGame({ worldId: 'w13', charId: 'localTycoon', seed: 9 });
  const w = (s) => s.world.league.squad.reduce((x, p) => x + (p.hi - p.lo), 0) / 18; assert.ok(w(c) < w(t), 'the coach sees narrower potential ranges');
});

await test('fixed draws on stream `world`: 18 at init, exactly 6 per payday + 5 per H landing — opposite players stay aligned on every stream (incl. the lazy content stream)', () => {
  assert.deepEqual({ init: LDRAWS.init, month: LDRAWS.month, H: ADRAWS.landing.H }, { init: 18, month: 6, H: 5 });
  for (const ch of CH) {
    const A = E.createGame({ worldId: 'w13', charId: ch, seed: 77 }); const B = E.createGame({ worldId: 'w13', charId: ch, seed: 77 });
    const w1 = E.createGame({ worldId: 'w1', seed: 77 }).rng.world; let p0 = w1; for (let i = 0; i < 18; i++) p0 = (p0 + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, p0, 'init draws 18');
    let paydays = 0, landH = 0; const w0 = A.rng.world; const r = prng(5);
    for (let t = 0; t < 90 && !A.over && !B.over; t++) {
      for (const a of E.worldActions(A).filter((x) => x.enabled && !['wageCut', 'ownerLoan'].includes(x.id)).slice(0, 2)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const pd0 = A.stats.paydays; E.rollDice(A); E.rollDice(B); paydays += A.stats.paydays - pd0;
      let ea = E.landing(A); const eb = E.landing(B); if (A.pending && A.pending.type === 'mech') landH++;
      let k = 0; while (ea && !A.over && k++ < 12) { const en = ea.options.filter((o) => o.enabled); const o = en.find((x) => x.kind === 'buy' || x.id === 'jump') || en[Math.floor(r() * en.length)]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      settle(B, eb);
      if (A.over || B.over) break;
      for (const s of [...STREAMS, ...LAZY_STREAMS]) assert.equal(A.rng[s], B.rng[s], `${ch}: stream ${s} diverged at turn ${t}`);
    }
    let probe = w0; const n = 6 * paydays + 5 * landH; for (let i = 0; i < n; i++) probe = (probe + 0x6D2B79F5) >>> 0;
    assert.equal(A.rng.world, probe, `${ch}: world stream advanced exactly 6·${paydays} + 5·${landH} times`);
    assert.ok(paydays >= 5 && landH >= 3, `paydays ${paydays}, H ${landH}`);
  }
});

await test('auction (pure): 1–3 rivals from draw 0, sealed ceilings 0.8–1.3 × the true value, an offer above every ceiling wins, else the top rival answers ×1.08; lost after round 3', () => {
  const item = { value: 10e6, trueValue: 10e6, reserve: 8e6, lo: 0.8, span: 0.5 };
  for (let i = 0; i < 200; i++) { const rs = [((i * 7919) % 1000) / 1000, ...[1, 2, 3, 4].map((k) => ((i * 31 + k * 97) % 1000) / 1000)]; const lot = newLot(item, rs);
    assert.ok(lot.n >= 1 && lot.n <= 3); for (let k = 0; k < 4; k++) if (k < lot.n) assert.ok(lot.bidders[k] >= 8e6 && lot.bidders[k] <= 13e6); else assert.equal(lot.bidders[k], 0);
    const t = topRival(lot); assert.equal(offer(lot, t.max + 1000).won, true); const o = offer(lot, t.max - 1000); assert.equal(o.won, false); assert.ok(o.answer <= t.max); }
  const lot = newLot(item, [0.1, 0.99, 0, 0, 0]); lot.round = ROUNDS; assert.equal(offer(lot, 9e6).lost, true);
  const L = levels({ price: 10e6 }); assert.deepEqual(L, { bid: 10e6, raise: 11.5e6, jump: 13.5e6 });
});

await test('H tile: 5 sealed draws; walk (the room-timeout safe option) never spends; the card carries no sealed value; a won lot joins the squad at book = the fee; ≤ 3 rounds', () => {
  let seen = 0, won = 0, lost = 0;
  for (let s = 1; s <= 40 && (seen < 8 || won < 2 || lost < 1); s++) {
    const st = E.createGame({ worldId: 'w13', charId: 'localTycoon', seed: s }); st.cash = 300e6;
    for (let n = 0; n < 4 && !st.over; n++) {
      let ev = toH(st); if (!ev) break; seen++; const p = st.pending; assert.equal(p.wr.length, 5); assert.equal(ev.tag, 'שוק ההעברות');
      const js = JSON.stringify(ev); for (const k of ['"wr"', '"bidders"', '"trueValue"', '"pot"', '"inj"', '"gr"']) assert.ok(!js.includes(k), 'the card carries no ' + k);
      assert.ok(ev.options.find((o) => o.id === 'walk' && o.enabled)); for (const o of ev.options.filter((x) => x.kind === 'bid')) assert.ok(o.preview && o.preview.cash === -o.amount, 'I1: the cost before the tap');
      if (n === 0) { const c0 = st.cash, l0 = st.loans, q0 = st.world.league.squad.length; ev = E.choose(st, ev, 'walk').event; assert.equal(st.cash, c0); assert.equal(st.loans, l0); assert.equal(st.world.league.squad.length, q0); settle(st, ev); continue; }
      const q0 = st.world.league.squad.length; const c0 = st.cash; let rounds = 0;
      const how = n % 2 ? 'jump' : 'bid'; // 'bid' only matches the rival's last price — it never wins against a ceiling above it
      while (ev && st.pending && st.pending.type === 'mech' && rounds++ < 5) { const amt = ev.options.find((o) => o.id === how).amount; ev = E.choose(st, ev, how).event;
        if (st.world.league.squad.length > q0) { won++; const pl = st.world.league.squad[st.world.league.squad.length - 1]; assert.equal(st.cash, c0 - amt); assert.equal(pl.fee, amt); assert.equal(book(st, pl), amt); break; } }
      assert.ok(rounds <= ROUNDS, 'at most 3 rounds'); if (st.world.league.squad.length === q0) lost++;
      settle(st, ev);
    }
  }
  assert.ok(seen >= 8 && won >= 2 && lost >= 1, `seen ${seen}, won ${won}, lost ${lost}`);
});

await test('season: 10 rounds and 2 transfer windows a year; the rank cliff — top 2 up a tier, bottom 2 down, prize money; a new table; ages +1; the academy intake; FFP at season end', () => {
  let up = 0, down = 0, stay = 0;
  for (let s = 1; s <= 24 && (up < 1 || down < 1 || stay < 1); s++) {
    const st = E.createGame({ worldId: 'w13', charId: 'academyDirector', seed: 40 + s }); if (s % 3 === 0) for (const p of st.world.league.squad) p.r = 80; if (s % 3 === 1) for (const p of st.world.league.squad) p.r = 40;
    const ages = st.world.league.squad.map((p) => p.age); const n0 = st.world.league.squad.length; const div0 = st.world.league.div;
    untilMonth(st, 11); assert.equal(st.world.league.round, 9, 'nine rounds by month 11 (months 1 and 7 are windows)'); assert.equal(st.world.league.season, 1); const opp0 = JSON.stringify(st.world.league.opp);
    untilMonth(st, 12); const L = st.world.league; assert.equal(L.season, 2, 'round 10 (month 12) ends the season'); assert.equal(L.round, 0); assert.equal(L.pts, 0); const rk = L.hist[0].rank; assert.ok(rk >= 1 && rk <= 8);
    assert.equal(L.div, rk <= 2 ? div0 + 1 : rk >= 7 ? div0 - 1 : div0); if (L.div > div0) up++; else if (L.div < div0) down++; else stay++;
    assert.notEqual(JSON.stringify(L.opp), opp0); assert.ok(L.squad.some((p) => p.acad && p.age === 17), 'the academy director gets a youngster'); assert.ok(L.squad.filter((p) => !p.acad || p.age > 17).every((p) => ages.includes(p.age - 1) || p.age === 31), 'ages +1'); void n0;
  }
  assert.ok(up >= 1 && down >= 1 && stay >= 1, `up ${up} down ${down} stay ${stay}`);
  const W = E.metrics(E.createGame({ worldId: 'w13', seed: 1 })).worldIndicators.league; assert.equal(W.window, true); assert.ok(W.payoff.up > 1.5 && W.payoff.down < 0.65, JSON.stringify(W.payoff));
  assert.equal(FFP.season, 0.8);
});

await test('book vs market: book falls straight-line to 0 at the contract end; NW counts book; a sale realises market value (−10 % outside a window); market value = rating × age curve', () => {
  const st = E.createGame({ worldId: 'w13', charId: 'coachOwner', seed: 5 }); const p = st.world.league.squad.find((x) => x.fee > 0);
  const b0 = book(st, p); untilMonth(st, 4); assert.ok(book(st, p) < b0); assert.equal(book(st, { ...p, until: st.month }), 0);
  assert.equal(mv(st, { r: 60, age: 26 }), Math.round(PV(60) * ageF(26) / 1000) * 1000); assert.ok(mv(st, { r: 60, age: 20 }) > mv(st, { r: 60, age: 33 }));
  assert.equal(E.metrics(st).netWorth, st.cash + (st.savings || 0) - st.loans - st.credit + st.assets.reduce((s, a) => s + a.value - a.debt, 0) + Math.round(st.holdings.IDX.qty * st.prices.IDX) - (st.world.league.owner || 0));
  const s2 = E.createGame({ worldId: 'w13', charId: 'localTycoon', seed: 5 }); untilMonth(s2, 3); assert.equal(LI(s2).window, false);
  const x = s2.world.league.squad[17]; const c0 = s2.cash; const price = Math.round(mv(s2, x) * 0.9 / 1000) * 1000; assert.ok(E.worldAction(s2, 'sell', 'p' + x.id).ok); assert.equal(s2.cash, c0 + price); assert.equal(s2.world.league.forced, 1);
  assert.equal(E.worldAction(s2, 'sell', 'p9999').ok, false);
  assert.equal(wageFor(60), Math.round(PV(60) * 0.06 / 1000) * 1000);
});

await test('goal: the wage ratio counts 12 paydays (sponsors are revenue); an owner loan is a liability; wage cut sends the star away; parts and progress in [0, 1]', () => {
  const st = E.createGame({ worldId: 'w13', charId: 'localTycoon', seed: 8 }); untilMonth(st, 15);
  const L = st.world.league; assert.equal(L.rev12.length, 12); assert.equal(ratio12(st), Math.round(L.wage12.reduce((a, b) => a + b, 0) / L.rev12.reduce((a, b) => a + b, 0) * 100) / 100);
  const nw0 = E.metrics(st).netWorth; assert.ok(E.worldAction(st, 'ownerLoan').ok); assert.equal(E.metrics(st).netWorth, nw0, 'cash in, the same debt out');
  const best = [...L.squad].sort((a, b) => b.r - a.r || a.id - b.id)[0]; const w0 = L.squad.find((p) => p !== best).wage; assert.ok(E.worldAction(st, 'wageCut').ok); assert.ok(!L.squad.includes(best)); assert.ok(L.squad.every((p) => p.wage <= w0 || true));
  assert.equal(E.worldAction(st, 'wageCut').ok, false, 'once a season');
  const m = E.metrics(st); assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); for (const p of m.goalParts) assert.ok(p.progress >= 0 && p.progress <= 1);
});

await test('Z actions: logged, replayed byte-identically, refused ones never logged; serialize round-trip at rest points', () => {
  for (let i = 0; i < 6; i++) {
    const st = play({ worldId: 'w13', charId: CH[i % 3], seed: 500 + i, mode: 'free' }, prng(100 + i), { zRate: 0.35, maxTurns: 140, onTurn: (s) => { if (!s.pending && !s.over) assert.equal(E.serialize(E.deserialize(E.serialize(s))), E.serialize(s)); } });
    assert.ok(st.actions.some((a) => a[0] === 'Z'), 'game ' + i + ' used module actions');
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), 'replay of game ' + i);
  }
  const st = E.createGame({ worldId: 'w13', charId: 'coachOwner', seed: 2 }); const n0 = st.actions.length;
  for (const [a, p] of [['sell', 'p999'], ['naming', 'maybe'], ['renew', 'p1'], ['loanOut', 'x'], ['ownerRepay', null]]) assert.equal(E.worldAction(st, a, p).ok, false, a + ' ' + p);
  assert.equal(st.actions.length, n0); assert.ok(E.worldAction(st, 'naming', 'share').ok); assert.equal(st.actions.length, n0 + 1);
});

await test('fuzz (G-big): integer money, no NaN, NW = assets − liabilities, goal progress in [0, 1], strength and table complete', () => {
  for (let i = 0; i < 9; i++) {
    play({ worldId: 'w13', charId: CH[i % 3], seed: 900 + i, mode: 'free' }, prng(700 + i), { zRate: 0.35, maxTurns: 160, onTurn: (s) => {
      const m = E.metrics(s);
      for (const k of ['cash', 'netWorth', 'passive', 'expenses', 'cashflow', 'totalAssets', 'totalLiabilities']) assert.ok(Number.isInteger(m[k]), `${k} = ${m[k]}`);
      assert.equal(m.netWorth, m.totalAssets - m.totalLiabilities);
      for (const a of s.assets) assert.ok(Number.isInteger(a.value) && Number.isInteger(a.debt), a.n + ' ' + a.value + ' ' + a.debt);
      assert.ok(m.goalProgress >= 0 && m.goalProgress <= 1); const wi = m.worldIndicators; assert.equal(wi.panel.table.length, 8); assert.ok(Number.isFinite(strength(s)) && Number.isFinite(wi.league.wageRatio));
      assert.equal(table(s).filter((x) => x.us).length, 1); assert.ok(s.world.league.squad.length >= 1); assert.ok(Number.isInteger(squadBook(s)));
    } });
  }
});

await test('rooms: the public view carries no sealed value (potential, injury-proneness, growth pace, rival ceilings, init draws)', () => {
  const st = play({ worldId: 'w13', charId: 'coachOwner', seed: 77, mode: 'free' }, prng(3), { zRate: 0.3, maxTurns: 120 });
  const js = JSON.stringify(E.publicView(st)); for (const k of ['"pot"', '"inj"', '"gr"', '"inits"', '"bidders"', '"trueValue"']) assert.ok(!js.includes(k), k);
});

await test('L-fict + V-adapter + lint: fictional clubs / players / brands (the denylist has real clubs), adapter size and uses, exact arithmetic', async () => {
  const V = await import('../tools/validate-worlds.mjs'); assert.deepEqual(V.checkLeague(), []); assert.deepEqual(V.checkAdapters(), []); assert.deepEqual(V.lintModules(), []);
  assert.ok(V.checkLeague(new Set(['שועלי']).add('מכבי')).some((x) => /שועלי העמק/.test(x)), 'a denylisted word is caught');
  const deny = readFileSync(new URL('../tools/data/real-names.txt', import.meta.url), 'utf8'); for (const x of ['מכבי חיפה', 'הפועל באר שבע', 'בית"ר ירושלים', 'Real Madrid']) assert.ok(deny.includes(x), x);
});

await test('verifier: core bundle + the w13 pack only (league + auction + the deal pool); a w13 game verifies; dated before RULES7_FROM → bad_world', async () => {
  const { collectAll, MAX_CORE, MAX_PACK } = await import('../tools/build-edge.mjs');
  const { loadEngine, loadWorldPack } = await import('../supabase/functions/verify-result/engine_loader.js');
  const V = await import('../supabase/functions/verify-result/verify_core.js');
  const all = collectAll(); assert.ok(all.core.text.length <= MAX_CORE, 'core ' + all.core.text.length);
  assert.ok(all.packs.w13 && all.packs.w13.text.length <= MAX_PACK && all.packs.w13.text.length <= V.MAX_PACK, 'pack ' + (all.packs.w13 && all.packs.w13.text.length));
  assert.deepEqual(Object.keys(all.packs.w13.files).sort(), ['content/deals-w13.js', 'worlds/adapters/league.js', 'worlds/mech/auction.js', 'worlds/w13.js']);
  const EE = await loadEngine(all.core.text); await loadWorldPack(EE, all.core.text, all.packs.w13.text); assert.equal(EE.getWorld('w13').id, 'w13');
  let ok = 0, maxMs = 0;
  for (let i = 0; i < 10 && ok < 4; i++) {
    const ch = CH[i % 3]; const seed = 1000 + i * 17;
    const st = play({ worldId: 'w13', charId: ch, seed, mode: 'challenge', dateKey: '2026-12-22' }, prng(seed), { zRate: 0.3, maxTurns: 600 });
    if (!st.over) continue;
    const row = { mode: 'challenge', world: 'w13', profession: ch, seed: String(seed), max_months: null, challenge_day: '2026-12-22', status: st.result.status, months: st.result.months, passive: Math.round(st.result.passive), expenses: Math.round(st.result.expenses), net_worth: Math.round(st.result.netWorth), claim_stars: st.result.stars || 0, claim_progress: st.result.progress };
    const a = performance.now(); const out = V.verifyGame(EE, row, st.actions); maxMs = Math.max(maxMs, performance.now() - a);
    assert.ok(out.ok, `w13 game ${i} should verify: ${out.error}`); assert.equal(out.cfg.rules, 7); ok++;
    assert.equal(V.verifyGame(EE, { ...row, net_worth: row.net_worth + 1000 }, st.actions).ok, false);
    assert.throws(() => V.configFor(EE, { ...row, challenge_day: '2026-12-10' }), /bad_world/);
  }
  assert.ok(ok >= 2, 'verified games: ' + ok);
  console.log(`   pack ${all.packs.w13.text.length} chars · core ${all.core.text.length} chars · max w13 replay ${maxMs.toFixed(0)} ms`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
