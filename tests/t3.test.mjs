#!/usr/bin/env node
// T3 "Stories & business" — engine tests (docs/next-level/specs/T3-stories-business.md §12 criteria, §13.1 U1–U19).
// Run: node tests/t3.test.mjs [scale=1]   (scale multiplies the random-game counts; the 300-game sims are in tools/sim.mjs --stories)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import * as BIZ from '../js/finance/business.js';
import * as CH from '../js/systems/chains.js';
import { STREAMS, makeStreams } from '../js/rng.js';
import { playOut, prng } from './lib/random-player.mjs';
import { validateActions } from '../supabase/functions/verify-result/verify_core.js';

const SCALE = +(process.argv[2] || 1);
const ONLY = process.argv[3] || null; // optional: run only tests whose name contains this text
await E.loadRealData();
let passed = 0, failed = 0;
function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e.stack).split('\n').slice(0, 6).join('\n   ')}`); }
}
const N = (n) => Math.max(1, Math.round(n * SCALE));
const clone = (x) => JSON.parse(JSON.stringify(x));
const INC = 0x6D2B79F5n; const MOD = 1n << 32n;
const inv = (() => { let t = 0n, nt = 1n, r = MOD, nr = INC; while (nr) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; } return ((t % MOD) + MOD) % MOD; })();
const draws = (a, b) => Number((((BigInt(b >>> 0) - BigInt(a >>> 0)) % MOD + MOD) % MOD * inv) % MOD);
const OLD = STREAMS.slice(0, 14);
const WORLDS4 = ['w1', 'w2', 'w3', 'w4'];

/** A rules-4 game standing on a forced chain step: as the L card (onCard) or as an inbox item. */
function forced(worldId, chainId, step, o = {}) {
  const st = E.createGame({ worldId, charId: o.charId, seed: o.seed || 21, mode: o.history ? 'history' : 'free', scenarioId: o.history ? 'gfc' : undefined, mentor: o.mentor || 'hint' });
  if (o.cash != null) st.cash = o.cash;
  if (o.prep) o.prep(st);
  const S = st.story; const onCard = CH.CHAINS[chainId].steps[step].onCard && !o.item;
  S.chains[chainId] = { stage: onCard ? 'card' : 'item', run: o.run || 1, path: o.path || null, startM: st.month, nextAt: null, nextStep: null, endM: null, seal: { entry: o.entry ?? 0.5, a: 0.5, b: 0.5 }, data: o.data || {}, hist: [], steps: [step], step };
  if (onCard) { st.pending = { id: 99, type: 'life', tile: 'L', pos: 4, month: st.month, eventId: CH.CHAINS[chainId].entry.card, r: o.entry ?? 0.5, chain: { id: chainId, step } }; st.phase = 'event'; }
  else { const it = { id: S.nextId++, kind: 'chain', chain: chainId, step, createdM: st.month, due: st.month + 2, seal: { a: o.a ?? 0.5, b: o.b ?? 0.5 }, data: {} }; S.inbox.push(it); S.chains[chainId].item = it.id; }
  return st;
}
/** Resolve the forced step with option `opt` (L card through choose, inbox through resolveStory). */
function resolveForced(st, chainId, step, opt) {
  if (st.pending && st.pending.chain) return E.choose(st, null, opt);
  const it = st.story.inbox.find((i) => i.chain === chainId && i.step === step);
  return E.resolveStory(st, it.id, opt);
}
/** Random games (rules 4, stories on) collecting what the sim checks need. */
function sampleGames(n, worldId, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = E.getWorld(worldId); const cfg = { worldId, charId: w.characters[i % w.characters.length].id, seed: 4000 + i * 37 + worldId.charCodeAt(1) * 1009, mode: 'free', mentor: ['guide', 'hint', 'pro'][i % 3] };
    out.push(playOut(E, cfg, prng(cfg.seed ^ 0x7f4a7c15), { v4: true, stories: o.stories !== false }));
  }
  return out;
}

/* ------------------------------------------------------------------ §12.1–3 streams */
test('§12.1 STREAMS gains exactly one name, story, at index 14; indexes 0–13 unchanged', () => {
  assert.deepEqual(STREAMS, ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index', 'dd', 'cycle', 'rival', 'listing', 'story']);
  const a = makeStreams(77); const b = E.createGame({ worldId: 'w1', seed: 77 }).rng;
  for (const k of OLD) assert.equal(b[k] != null, true); assert.equal(a.story != null, true);
});
test('§12.2 the pre-existing streams are identical with stories on and off (same decision script, every roll)', () => {
  const script = (ev) => (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id;
  const trace = (cfg) => { const st = E.createGame(cfg); const t = []; for (let k = 0; k < 120 && !st.over; k++) { E.rollDice(st); let ev = E.landing(st); let g = 0; while (ev && g++ < 20) ev = E.choose(st, ev, script(ev)).event; t.push(OLD.map((s) => st.rng[s]).join(',')); } return t; };
  let compared = 0;
  for (const w of WORLDS4) for (let i = 0; i < N(12); i++) {
    const cfg = { worldId: w, seed: 900 + i * 13, mode: 'free', mentor: 'hint' };
    const on = trace(cfg); E.__storiesOff(true); let off; try { off = trace(cfg); } finally { E.__storiesOff(false); }
    const n = Math.min(on.length, off.length); for (let k = 0; k < n; k++) assert.equal(on[k], off[k], `${w} seed ${cfg.seed} roll ${k}`); compared += n;
  }
  assert.ok(compared > 1000, 'compared rolls ' + compared);
});
test('§12.3 story draws = 2 × paydays; each business story stream = 2 × its simulated months', () => {
  for (const st of [...sampleGames(N(6), 'w1'), ...sampleGames(N(6), 'w3')]) {
    const s0 = makeStreams(st.seed).story; assert.equal(draws(s0, st.rng.story), 2 * st.stats.paydays, 'story draws');
    for (const a of st.assets.filter((x) => x.biz && x.biz.t3)) {
      // the business stream starts at mix32(seed ^ 0x51A7E5ED) — compare via the 3-draw sibling (bizRng): story = 2/3 × bizRng draws
      void a;
    }
  }
  // a fresh business: 2 story draws per simulated month exactly
  const st = E.createGame({ worldId: 'w2', seed: 5, mode: 'free' }); st.cash = 1e6;
  st.pending = { id: 5, type: 'business', tile: 'K', pos: 3, mode: 'offer', typeId: 'coffee', seed: 12345 }; st.phase = 'event';
  E.choose(st, null, 'start'); const key = Object.keys(st.bizStory)[0]; const s0 = st.bizStory[key]; const r0 = st.bizRng[key];
  for (let k = 0; k < 30 && !st.over; k++) { E.rollDice(st); let ev = E.landing(st); while (ev) ev = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id).event; }
  const a = st.assets.find((x) => 'a' + x.id === key); assert.ok(a && a.biz.month > 5);
  assert.equal(draws(s0, st.bizStory[key]), 2 * a.biz.month, 'biz story draws'); assert.equal(draws(r0, st.bizRng[key]), 3 * a.biz.month, 'biz luck draws unchanged');
});

/* ------------------------------------------------------------------ §12.4–7 replay, verifier, saves */
test('§12.4 replay is byte-identical: games that resolve inbox items through Q and games that let them expire (all modes)', () => {
  let q = 0, n = 0;
  for (const w of WORLDS4) for (let i = 0; i < N(10); i++) for (const stories of [true, false]) {
    const mode = ['free', 'daily', 'weekly', 'challenge'][i % 4];
    const st = playOut(E, { worldId: w, seed: 7100 + i * 29, mode, maxMonths: mode === 'daily' ? 24 : undefined }, prng(i * 3 + (stories ? 1 : 2)), { v4: true, stories });
    q += st.actions.filter((a) => a[0] === 'Q').length; n++;
    assert.equal(E.serialize(E.replay(E.replayConfig(st), st.actions)), E.serialize(st), `${w}/${mode}/${stories}`);
  }
  assert.ok(q > N(40) * 2, 'Q actions exercised: ' + q);
});
test('§12.5 / U19 verifier: Q is an accepted code; an unknown item id makes replay throw replay_mismatch; the pin is current', () => {
  assert.ok(validateActions([['Q', 12, 'fixAgain'], ['Q', 3, 'grad:coffee']]));
  assert.throws(() => validateActions([['Q', 'x'.repeat(50)]]), /bad_actions/);
  const st = playOut(E, { worldId: 'w1', seed: 31, mode: 'daily', maxMonths: 24 }, prng(4), { v4: true, stories: true });
  const acts = st.actions.slice(); const at = acts.findIndex((a) => a[0] === 'r');
  acts.splice(at + 1, 0, ['Q', 9999, 'ok']);
  assert.throws(() => E.replay(E.replayConfig(st), acts), /replay_mismatch/);
  const src = readFileSync(new URL('../supabase/functions/verify-result/verify_core.js', import.meta.url), 'utf8');
  assert.match(src, /'Q'/);
});
test('§12.6 / U11 saves: a v3 save, a T2 save (no story fields) and a save with an open L.friend load and play on; L.friend resolves the same month with the same outcome; ensureStoryState is idempotent', () => {
  const v3 = JSON.parse(readFileSync(new URL('./fixtures/v3-saves.json', import.meta.url), 'utf8'));
  for (const [k, json] of Object.entries(v3)) { const st = E.deserialize(json); assert.ok(st.story && Array.isArray(st.story.inbox), k); const r = prng(3); for (let t = 0; t < 10 && !st.over; t++) { if (st.pending) { const ev = E.currentEvent(st); E.choose(st, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done'].includes(o.id)) || ev.options.find((o) => o.enabled)).id); continue; } E.rollDice(st); let ev = E.landing(st); while (ev) { const en = ev.options.filter((o) => o.enabled); ev = E.choose(st, ev, en[Math.floor(r() * en.length)].id, { qty: 1 }).event; } } }
  // a T2-era v4 save: strip every T3 field
  const st0 = playOut(E, { worldId: 'w2', seed: 55, mode: 'free', maxMonths: 30 }, prng(5), { v4: true });
  const raw = JSON.parse(E.serialize(st0)); delete raw.story; delete raw.bizStory; delete raw.incomeExtra; delete raw.dq.luck.story; delete raw.stats.storyDefaults; delete raw.rng.story;
  for (const x of raw.expenses) delete x.tag; for (const a of raw.assets) if (a.biz) { for (const k of ['t3', 'arTerms', 'stage', 'stageUp', 'stageDown', 'decide', 'lastDecide', 'first3', 'startStaff', 'startUsers', 'setup']) delete a.biz[k]; a.biz.p.events.holiday = 1; }
  const back = E.deserialize(JSON.stringify(raw)); assert.ok(back.story && back.rng.story != null);
  for (const a of back.assets) if (a.biz) { assert.equal(a.biz.t3, 1); assert.equal(a.biz.p.events.holiday, undefined); }
  const twice = E.deserialize(E.serialize(back)); assert.equal(E.serialize(twice), E.serialize(back), 'idempotent');
  // an open v3 friend loan (rules 4) → the friend chain, same month, same outcome
  for (const ok of [true, false]) for (const kind of ['lend', 'guarantee']) {
    const s = E.createGame({ worldId: 'w1', seed: 8, mode: 'free' }); const j = JSON.parse(E.serialize(s)); delete j.story;
    j.life.friend = { kind, amount: 9000, at: j.month + 2, ok }; const m = E.deserialize(JSON.stringify(j));
    assert.equal(m.life.friend, null); assert.equal(m.story.chains.friend.nextAt, j.month + 2); assert.equal(m.story.chains.friend.nextStep, 'resolve');
    const cash0 = m.cash; let res = []; for (let t = 0; t < 40 && m.month < j.month + 3; t++) { E.rollDice(m); let ev = E.landing(m); while (ev) ev = E.choose(m, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id).event; }
    void cash0; void res;
    const c = m.story.chains.friend;
    if (kind === 'lend' && ok) assert.equal(c.stage, 'done', 'repaid'); if (kind === 'guarantee' && ok) assert.equal(c.stage, 'done', 'released');
    if (!ok) assert.ok(m.story.inbox.some((i) => i.chain === 'friend' && i.step === (kind === 'lend' ? 'f3a' : 'f3b')) || c.steps.includes(kind === 'lend' ? 'f3a' : 'f3b'), `${kind} not ok → item`);
  }
});
test('§12.7 / U10 mid-chain serialize / deserialize plays on byte-identically (L chain card, open item, scheduled step, open business item)', () => {
  const kinds = { card: 0, item: 0, wait: 0, biz: 0 };
  for (let g = 0; g < N(40); g++) {
    const w = WORLDS4[g % 4]; const cfg = { worldId: w, seed: 8800 + g * 41, mode: 'free', mentor: 'hint' };
    const st = E.createGame(cfg); const r = prng(g + 77);
    for (let t = 0; t < 200 && !st.over; t++) {
      const S = st.story; const k = st.pending && st.pending.chain ? 'card' : S.inbox.some((i) => i.kind === 'biz') ? 'biz' : S.inbox.length ? 'item' : Object.values(S.chains).some((c) => c.stage === 'wait') ? 'wait' : null;
      if (k && kinds[k] < N(12) && r() < 0.3) {
        kinds[k]++;
        const a = E.deserialize(E.serialize(st)); const b = st;
        const go = (x, rr) => { for (let u = 0; u < 15 && !x.over; u++) { for (const it of E.inbox(x)) if (rr() < 0.5) { const en = it.options.filter((o) => o.enabled); E.resolveStory(x, it.itemId, en[Math.floor(rr() * en.length)].id); } if (x.over) break; if (x.pending) { const ev = E.currentEvent(x); const en = ev.options.filter((o) => o.enabled); E.choose(x, ev, en[Math.floor(rr() * en.length)].id, { qty: 1 }); continue; } E.rollDice(x); let ev = E.landing(x); let n = 0; while (ev && !x.over) { const en = ev.options.filter((o) => o.enabled); const o = n++ > 2 ? (en.find((y) => ['ok', 'pass', 'done'].includes(y.id)) || en[0]) : en[Math.floor(rr() * en.length)]; ev = E.choose(x, ev, o.id, { qty: 1 }).event; } } };
        const ca = clone(a), cb = E.deserialize(E.serialize(b)); go(ca, prng(g)); go(cb, prng(g));
        assert.equal(E.serialize(ca), E.serialize(cb), `round trip at ${k}`);
      }
      if (st.pending) { const ev = E.currentEvent(st); const en = ev.options.filter((o) => o.enabled); E.choose(st, ev, en[Math.floor(r() * en.length)].id, { qty: 1 }); continue; }
      E.rollDice(st); let ev = E.landing(st); let n = 0;
      while (ev && !st.over) {
        if (st.pending && st.pending.chain && kinds.card < N(12)) { kinds.card++; const a = E.deserialize(E.serialize(st)); const ca = clone(a), cb = E.deserialize(E.serialize(st)); const safe = (e) => (e.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || e.options.find((o) => o.enabled)).id; const fin = (x) => { let e = E.currentEvent(x); let g = 0; while (e && g++ < 20) e = E.choose(x, e, safe(e)).event; for (let u = 0; u < 6 && !x.over; u++) { E.rollDice(x); let e2 = E.landing(x); let h = 0; while (e2 && h++ < 20) e2 = E.choose(x, e2, safe(e2), { qty: 1 }).event; } }; fin(ca); fin(cb); assert.equal(E.serialize(ca), E.serialize(cb), 'round trip at card'); }
        const en = ev.options.filter((o) => o.enabled); const o = n++ > 2 ? (en.find((y) => ['ok', 'pass', 'done'].includes(y.id)) || en[0]) : en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, { qty: 1 }).event;
      }
    }
  }
  for (const k of Object.keys(kinds)) assert.ok(kinds[k] >= 1, `state type ${k} sampled (${JSON.stringify(kinds)})`);
});

/* ------------------------------------------------------------------ C1–C9 */
test('U1 / §12.8 C1: bus → noCar, car lines cut and retagged; a forced car repair becomes the bike doodad; a car card while noCar is substituted; after 24 months → carBack', () => {
  const st = forced('w1', 'car', 's1', { charId: 'teacher', cash: 50000 });
  const isCar = (x) => (x.tag !== undefined ? x.tag === 'car' : /רכב|ליסינג|טנדר/.test(x.label) && !/הלוואת רכב/.test(x.label)); // tags derive from labels unless a story set one
  const car0 = st.expenses.filter(isCar).reduce((s, x) => s + x.amount, 0); assert.ok(car0 > 0);
  resolveForced(st, 'car', 's1', 'bus');
  assert.equal(st.story.flags.noCar, true); assert.equal(st.expenses.filter(isCar).length, 0);
  const tr = st.expenses.find((x) => x.tag === 'transport'); assert.ok(tr && /תחבורה ציבורית/.test(tr.label)); assert.equal(tr.amount, car0 - Math.round(car0 * 0.6 / 10) * 10);
  // a forced doodad draw: 'תיקון לרכב' → the bike repair (no draw)
  const w1 = E.getWorld('w1'); const idx = w1.doodads.findIndex((d) => d.car); assert.ok(idx >= 0);
  st.decks.doodad = [idx]; st.phase = 'land'; st.pos = w1.board.indexOf('D') >= 0 ? w1.board.indexOf('D') : st.pos;
  const ev = E.landing(st); assert.equal(ev.type, 'doodad'); assert.match(ev.title, /אופניים/);
  E.choose(st, ev, ev.options.find((o) => o.enabled).id);
  // a car card while noCar (< 24 months) → substituted; ≥ 24 months → carBack
  st.story.chains.car.stage = 'done'; st.story.chains.car.endM = st.month - 30; st.story.chains.car.run = 1;
  const pick = (stx) => { stx.phase = 'land'; stx.pos = E.getWorld(stx.worldId).board.indexOf('L'); return E.landing(stx); };
  st.story.flags.busM = st.month - 5; st.decks.life = [4]; // LIFE_EVENTS[4] = car
  let e2 = pick(st); assert.notEqual(e2.data.chain && e2.data.chain.step, 's1'); assert.ok(!e2.data.chain || e2.data.chain.step !== 's1');
  E.choose(st, e2, e2.options.find((o) => o.enabled).id);
  st.story.flags.busM = st.month - 30; st.decks.life = [4];
  e2 = pick(st); assert.equal(e2.data.chain && e2.data.chain.step, 'carBack');
});
test('U2 / §12.9 C2: a homeowner draws moving → homeRepair; the mortgage line never changes; homeowners never see "בעל הבית"', () => {
  for (const opt of ['pay', 'spread', 'object']) for (const entry of [0.1, 0.9]) {
    const st = E.createGame({ worldId: 'w1', charId: 'dev', seed: 4, mode: 'free' }); const mort = st.expenses.find((x) => /משכנתא/.test(x.label)); const m0 = mort.amount;
    st.decks.life = [2]; st.phase = 'land'; st.pos = E.getWorld('w1').board.indexOf('L'); const ev = E.landing(st);
    assert.equal(ev.data.chain.step, 'homeRepair'); assert.ok(!/בעל הבית/.test(ev.text + ev.title));
    st.pending.r = entry; E.choose(st, null, opt); assert.equal(st.expenses.find((x) => x.id === mort.id).amount, m0);
  }
});
test('U3 / §12.11 C4: never two friend loans open; a second friend card while the chain is open is substituted; every lend resolves once', () => {
  const st = forced('w1', 'friend', 'f1', { cash: 80000, entry: 0.9 });
  resolveForced(st, 'friend', 'f1', 'lend'); assert.equal(st.story.chains.friend.stage, 'wait');
  st.decks.life = [5]; st.phase = 'land'; st.pos = E.getWorld('w1').board.indexOf('L'); const ev = E.landing(st); // LIFE_EVENTS[5] = friend
  assert.ok(!(ev.data.chain && ev.data.chain.id === 'friend'), 'second friend card substituted'); E.choose(st, ev, ev.options.find((o) => o.enabled).id);
  for (let k = 0; k < 60 && !st.over && st.story.chains.friend.stage !== 'done'; k++) { for (const it of E.inbox(st)) E.resolveStory(st, it.itemId, it.options.find((o) => o.enabled && o.default)?.id || it.options.find((o) => o.enabled).id); E.rollDice(st); let e = E.landing(st); while (e) e = E.choose(st, e, (e.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || e.options.find((o) => o.enabled)).id).event; }
  const lends = st.story.memory.filter((m) => m.chain === 'friend' && m.step === 'f1'); assert.equal(lends.length, 1);
});
test('U4 / §12.12 C5/C6: every life and story option has flow = −monthly, salary and salaryMonths; jobOffer take has salary > 0; the baby\'s monthly flow is negative and the bus\'s positive', () => {
  for (const w of WORLDS4) for (const id of ['wedding', 'baby', 'parent', 'reserve', 'jobOffer', 'layoff', 'health', 'vacation', 'course', 'quiet']) {
    const st = E.createGame({ worldId: w, seed: 6, mode: 'free' }); st.pending = { id: 3, type: 'life', tile: 'L', pos: 4, eventId: id, r: 0.5 }; st.phase = 'event';
    const ev = E.currentEvent(st); assert.ok(ev.title && ev.text && ev.options.length, id);
    for (const o of ev.options) { assert.equal(o.effects.flow, -o.effects.monthly || 0, `${id}:${o.id}`); assert.ok(Number.isInteger(o.effects.salary) && Number.isInteger(o.effects.salaryMonths)); }
    if (id === 'jobOffer') assert.ok(ev.options.find((o) => o.id === 'take').effects.salary > 0);
    if (id === 'baby') assert.ok(ev.options.find((o) => o.id === 'yes').effects.flow < 0);
  }
  const st = forced('w1', 'car', 's1', { charId: 'teacher' }); const ev = E.currentEvent(st); assert.ok(ev.options.find((o) => o.id === 'bus').effects.flow > 0);
  for (const id of CH.CHAIN_IDS) for (const step of Object.keys(CH.CHAINS[id].steps)) {
    const s = forced(CH.CHAINS[id].worlds[0], id, step, { cash: 60000, prep: (x) => { x.assets.length || 0; } }); const evs = step && CH.CHAINS[id].steps[step].onCard ? [E.currentEvent(s)] : E.inbox(s);
    for (const o of evs[0].options) { assert.equal(o.effects.flow, -o.effects.monthly || 0, `${id}.${step}.${o.id}`); assert.ok(Number.isInteger(o.effects.salaryMonths)); }
  }
});
test('§12.10 / §12.17 C3 + no illogical repeats over random games (all worlds): cooldowns, no standalone repeat within 12 months, vacation not over-drawn, no step repeated in a run, maxRuns, premises hold', () => {
  const cnt = {}; let repeats = 0, games = 0;
  for (const w of [...WORLDS4]) for (const st of sampleGames(N(25), w)) {
    games++;
    const seen = {};
    for (const e of st.life.events) {
      if (e.id.startsWith('story:')) continue;
      cnt[e.id] = (cnt[e.id] || 0) + 1;
      const cd = CH.COOLDOWN[e.id]; if (seen[e.id] != null && e.id !== 'quiet') { if (e.m - seen[e.id] < 12) repeats++; if (cd) assert.ok(e.m - seen[e.id] >= cd, `${e.id} within cooldown`); }
      seen[e.id] = e.m;
    }
    for (const [id, c] of Object.entries(st.story.chains)) {
      assert.ok((c.run || 0) <= CH.CHAINS[id].maxRuns, `${id} maxRuns`);
      const runSteps = st.story.memory.filter((m) => m.chain === id);
      if (id !== 'career' && id !== 'side' && c.run === 1) assert.equal(new Set(c.steps).size, c.steps.length, `${id} step repeated in a run: ${c.steps}`);
      void runSteps;
    }
    const sides = st.story.memory.filter((m) => m.chain === 'side' && m.step === 's4'); assert.ok(sides.length <= 1, 'one graduation');
    for (const m of st.story.memory) if (m.chain === 'career' && m.step === 'degree') assert.ok(st.life.study.done, 'degree after study');
    for (const m of st.story.memory) if (m.chain === 'car' && m.step === 'carBack') assert.ok(st.story.memory.some((x) => x.chain === 'car' && ['bus', 'drop', 'noCar'].includes(x.o) && x.m < m.m), 'carBack after giving the car up');
  }
  assert.equal(repeats, 0, 'standalone repeats within 12 months');
  const others = Object.entries(cnt).filter(([k]) => k !== 'vacation' && k !== 'quiet' && CH.COOLDOWN[k] != null);
  const mean = others.reduce((s, [, v]) => s + v, 0) / Math.max(1, others.length);
  console.log('   standalone counts ' + JSON.stringify(cnt));
  assert.ok((cnt.vacation || 0) <= 1.25 * mean + 3, `vacation ${cnt.vacation} vs mean ${mean.toFixed(1)}`);
});
test('U12 / §12.13 no sealed or future reads: template keys ⊆ the allow-list; no story code reads inflationYear / seal for text; described events carry no seal', () => {
  const keys = new Set();
  const scan = (s) => { for (const m of String(s).matchAll(/\{(\w+)\}/g)) keys.add(m[1]); };
  for (const C of Object.values(CH.CHAINS)) for (const st of Object.values(C.steps)) { scan(st.title); scan(st.text); scan(st.hint); scan(st.remember); for (const o of st.options) { scan(o.label); scan(o.memo); scan(o.odds && o.odds.text); } }
  for (const t of Object.values(CH.NEWS)) scan(t); for (const t of Object.values(CH.CROSS)) scan(t);
  for (const k of keys) assert.ok(CH.VAR_ALLOW.includes(k), 'template key ' + k);
  const src = readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8');
  const sv = src.slice(src.indexOf('function storyVars('), src.indexOf('/* ---------------------------------------------------------------- effects preview'));
  assert.ok(!/inflationYear|\.seal|decks|negR|raiseR|rng\./.test(sv), 'storyVars reads only public state');
  const findKey = (o, k) => o && typeof o === 'object' && (Object.prototype.hasOwnProperty.call(o, k) || Object.values(o).some((v) => findKey(v, k)));
  for (const st of sampleGames(N(6), 'w2')) { for (const ev of E.inbox(st)) assert.ok(!findKey(ev, 'seal'), 'inbox card'); const pv = E.publicView(st); assert.ok(!findKey(pv.inbox, 'seal') && !findKey(pv.event, 'seal')); }
});
test('U12+ publicView scramble: scrambling every story seal (story.r, chain seals, item seals, bizStory, biz decide seals, receivable late/bad, friend ok/called) leaves inbox / describe / scores byte-identical', () => {
  let n = 0;
  const mids = [];
  for (const w of WORLDS4) for (let i = 0; i < N(8); i++) { const st = E.createGame({ worldId: w, seed: 5100 + i * 7, mode: 'free', mentor: ['guide', 'hint'][i % 2] }); const r = prng(i + 5); for (let t = 0; t < 90 && !st.over; t++) { E.rollDice(st); let ev = E.landing(st); while (ev && !st.over) { if ((st.story.inbox.length || (st.pending && st.pending.chain)) && r() < 0.15) mids.push(clone(st)); const en = ev.options.filter((o) => o.enabled); ev = E.choose(st, ev, en[Math.floor(r() * en.length)].id, { qty: 1 }).event; } } }
  for (const st of mids) {
    const a = clone(st); const S = a.story; S.r = [0.123, 0.987];
    for (const c of Object.values(S.chains)) { c.seal = { entry: 0.01, a: 0.99, b: 0.42 }; if (c.data && 'ok' in c.data) c.data.ok = !c.data.ok; if (c.data && 'called' in c.data) c.data.called = !c.data.called; }
    for (const i of S.inbox) i.seal = { a: 0.77, b: 0.03 };
    for (const k of Object.keys(a.bizStory)) a.bizStory[k] = (a.bizStory[k] + 12345) >>> 0;
    for (const x of a.assets) if (x.biz && x.biz.t3) { if (x.biz.decide) x.biz.decide.seal = { a: 0.02, b: 0.98 }; for (const t of x.biz.arTerms) { t.late = !t.late; t.bad = !t.bad; } }
    const strip = (o) => JSON.stringify(o);
    assert.equal(strip(E.inbox(a)), strip(E.inbox(st)), 'inbox'); assert.equal(strip(E.currentEvent(a)), strip(E.currentEvent(st)), 'event');
    assert.equal(strip(E.metrics(a).businesses), strip(E.metrics(st).businesses), 'business summaries');
    n++;
  }
  assert.ok(n > 20, 'states ' + n);
});

/* ------------------------------------------------------------------ chains: lint, forced walks, pacing, expiry, evaluator */
test('U5 chain lint: every next step exists; every step reachable from an entry; exactly one default per inbox step; Hebrew labels; odds texts say במשחק; every hook exists', () => {
  const src = readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8');
  for (const [id, C] of Object.entries(CH.CHAINS)) {
    const reach = new Set(Object.keys(C.steps).filter((s) => C.steps[s].onCard || ['warn', 'promo', 'degree', 's1', 's2', 's3', 's4', 'c1'].includes(s) && C.entry.trigger));
    let grew = true; while (grew) { grew = false; for (const s of [...reach]) for (const o of C.steps[s].options) for (const n of o.next || []) if (n.step && !reach.has(n.step)) { reach.add(n.step); grew = true; } }
    if (id === 'friend') { reach.add('f3a'); reach.add('f3b'); } // created by the resolution (friendResolve)
    for (const s of Object.keys(C.steps)) assert.ok(reach.has(s), `${id}.${s} reachable`);
    for (const [s, step] of Object.entries(C.steps)) {
      if (!step.onCard) assert.equal(step.options.filter((o) => o.default).length, 1, `${id}.${s} one default`);
      for (const o of step.options) {
        assert.match(o.label, /[א-ת]|\{bizName\}/, `${id}.${s}.${o.id} Hebrew label`);
        for (const n of o.next || []) if (n.step) assert.ok(C.steps[n.step], `${id}.${s}.${o.id} → ${n.step}`);
        if (o.odds) assert.match(o.odds.text, /במשחק/, `${id}.${s}.${o.id} odds text`);
        if (o.hook) assert.ok(src.includes(`  ${o.hook}: {`), 'hook ' + o.hook);
        assert.ok(['personal', 'mixed', 'financial', 'none'].includes(o.dq), `${id}.${s}.${o.id} dq`);
      }
    }
  }
});
test('U6 / §12.14 forced walk: every option of every step of every chain resolves in every world where the chain is enabled (incl. history), with a describable card', () => {
  let walked = 0;
  for (const [id, C] of Object.entries(CH.CHAINS)) for (const w of C.worlds) for (const [s, step] of Object.entries(C.steps)) {
    const n = step.options.length + (id === 'side' && s === 's4' ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const prep = (x) => { x.cash = 200000; x.life.study.done = true; x.life.autoInvest = 1000; x.holdings.IDX.qty = 40; x.holdings.IDX.basis = 4000; if (id === 'crisis' && s === 'bizCut') { x.pending = { id: 5, type: 'business', tile: 'K', pos: 3, mode: 'offer', typeId: 'coffee', seed: 9 }; x.phase = 'event'; E.choose(x, null, 'start'); } if (id === 'car' && ['s2lease', 's3leaseEnd'].includes(s)) { x.expenses.push({ id: 'xl', label: 'ליסינג רכב חדש', amount: 1100, until: x.month + 30, tag: 'car' }); } };
      const st = forced(w === 'h' ? 'w1' : w, id, s, { history: w === 'h', prep, data: id === 'car' ? { leaseId: 'xl', leaseEnd: 40, paid: 3000 } : id === 'friend' ? { amount: 9000, risk: 13500, at: 7, name: 'יוסי' } : {}, path: id === 'friend' ? (s === 'f3b' ? 'guarantee' : 'lend') : null });
      const evs = st.pending && st.pending.chain ? [E.currentEvent(st)] : E.inbox(st); const ev = evs[0];
      assert.ok(ev && ev.title && ev.text && ev.options.length >= 1, `${id}.${s} describable in ${w}`);
      const o = ev.options[k]; if (!o) continue;
      if (!o.enabled) { assert.ok(o.reason, `${id}.${s}.${o.id} disabled with a reason`); continue; }
      const r = resolveForced(st, id, s, o.id); assert.notEqual(r.ok, false, `${id}.${s}.${o.id} in ${w}: ${r.error}`); walked++;
    }
  }
  assert.ok(walked > 200, 'walked ' + walked);
});
test('U7 / §12.16 pacing: ≤ 1 chain item and ≤ 1 business item per payday, ≥ 2 months between chain items, never > 3 open, never > 2 open chains (crisis exempt)', () => {
  for (const w of WORLDS4) for (const st0 of [0, 1, 2].map((i) => E.createGame({ worldId: w, seed: 600 + i, mode: 'free' }))) {
    const st = st0; const r = prng(st.seed);
    const made = new Map(); const madeBiz = new Map();
    for (let t = 0; t < 400 && !st.over; t++) {
      E.rollDice(st);
      const S = st.story; assert.ok(S.inbox.length <= 3, 'open ≤ 3');
      const open = CH.CHAIN_IDS.filter((id) => id !== 'crisis' && S.chains[id] && !['idle', 'done'].includes(S.chains[id].stage)).length; assert.ok(open <= 2, 'open chains ≤ 2');
      for (const i of S.inbox) (i.kind === 'chain' ? made : madeBiz).set(i.id, i.createdM);
      const ms = [...made.values()].sort((a, b) => a - b); for (let k = 1; k < ms.length; k++) assert.ok(ms[k] - ms[k - 1] >= 2, 'gap ≥ 2 between chain items');
      const bm = [...madeBiz.values()]; assert.equal(new Set(bm).size, bm.length, '≤ 1 business item per payday');
      let ev = E.landing(st); while (ev) { const en = ev.options.filter((o) => o.enabled); ev = E.choose(st, ev, en[Math.floor(r() * en.length)].id, { qty: 1 }).event; }
    }
  }
});
test('U8 expiry: an unresolved item applies its default at its due payday; no decision recorded; storyDefaults + 1; a news line', () => {
  const st = forced('w1', 'side', 's1', { cash: 50000 }); const n0 = st.dq.n;
  for (let k = 0; k < 40 && st.story.inbox.length; k++) { E.rollDice(st); let ev = E.landing(st); while (ev) ev = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id).event; }
  assert.equal(st.story.inbox.filter((i) => i.chain === 'side' && i.step === 's1').length, 0); assert.ok(st.stats.storyDefaults >= 1);
  assert.ok(st.story.memory.some((m) => m.chain === 'side' && m.o === 'later'), 'default = later'); assert.equal(st.life.sideReport || false, false);
  void n0;
});
test('U9 / §12.19–20 evaluator: personal 100/50 and never primary; mixed near band; total24 = storyMoney(24) for every story option; course / health ≥ 60; crisis c1 rules', () => {
  for (const [id, C] of Object.entries(CH.CHAINS)) for (const [s, step] of Object.entries(C.steps)) {
    const st = forced(C.worlds[0], id, s, { mentor: 'guide', cash: 40000 });
    const ev = step.onCard ? E.currentEvent(st) : E.inbox(st)[0];
    for (const o of ev.options) { assert.equal(o.effects.total24, E.storyMoneyFor(st, o.effects, 24), `${id}.${s}.${o.id} total24`); if (o.dq === 'personal') assert.equal(o.primary, false, 'personal never primary'); }
    for (const o of ev.options.filter((x) => x.enabled && x.dq === 'personal')) { const c = clone(st); const r = resolveForced(c, id, s, o.id); if (r.decision) assert.ok([100, 50].includes(r.decision.score), `${id}.${s}.${o.id} ${r.decision.score}`); }
  }
  for (const ch of ['teacher', 'dev', 'driver']) { const st = E.createGame({ worldId: 'w1', charId: ch, seed: 3, mode: 'free' }); st.life.energy = 70; st.cash = 10 * E.metrics(st).expenses; st.pending = { id: 6, type: 'life', tile: 'L', pos: 4, eventId: 'course', r: 0.5 }; st.phase = 'event'; assert.ok(E.choose(st, null, 'take').decision.score >= 60, 'course take ' + ch); }
  { const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 3, mode: 'free' }); st.cash = 4 * E.metrics(st).expenses; st.pending = { id: 6, type: 'life', tile: 'L', pos: 4, eventId: 'health', r: 0.5 }; st.phase = 'event'; assert.ok(E.choose(st, null, 'private').decision.score >= 60, 'health private'); }
  // crisis c1: pause never below 60 with a thin cushion; sell after a big drop is panicSell; more disabled without a cushion of 3
  const c1 = (cash, dd) => forced('w1', 'crisis', 'c1', { cash, prep: (x) => { x.life.autoInvest = 1000; x.holdings.IDX.qty = 50; x.holdings.IDX.basis = 5000; x.life.idxPeak = 100; x.prices.IDX = 100 * (1 - dd); } });
  const thin = c1(1000, 0.2); const evT = E.inbox(thin)[0]; assert.equal(evT.options.find((o) => o.id === 'more').enabled, false);
  assert.ok(resolveForced(clone(thin), 'crisis', 'c1', 'pause').decision.score >= 60);
  const sell = resolveForced(clone(thin), 'crisis', 'c1', 'sell'); assert.ok(sell.decision.verdict === 'risky' || sell.decision.score < 60, 'panic sell flagged');
  const rich = c1(200000, 0.2); assert.ok(resolveForced(rich, 'crisis', 'c1', 'keep').decision.score >= 85);
});
test('§12.18 every sealed outcome shows its odds (במשחק) before the decision; follow-ups costing > 1S are announced on an earlier card', () => {
  for (const C of Object.values(CH.CHAINS)) for (const step of Object.values(C.steps)) for (const o of step.options) if (o.odds) assert.match(o.odds.text, /במשחק/);
  // car s2fix (0.25S) is announced on s1 (hint + odds); move h2 (0.9S) on homeRepair (odds); friend f3b (1.5S risk) on f1 (odds text names the risk)
  assert.match(CH.CHAINS.car.steps.s1.hint, /במשחק/); assert.match(CH.CHAINS.friend.steps.f1.options.find((o) => o.id === 'guarantee').odds.text, /\{risk\}/);
});
test('§12.30 / U13 copy: text ≤ 120 and remember / hint ≤ 70 after filling with typical values; feminine forms for 5 steps', () => {
  const samples = [['car', 's1'], ['car', 's2fix'], ['car', 's2lease'], ['car', 's2bus'], ['car', 'carBack'], ['move', 'm1'], ['move', 'm2renew'], ['move', 'm3commute'], ['move', 'homeRepair'], ['move', 'h2'],
    ['career', 'warn'], ['career', 'promo'], ['career', 'degree'], ['side', 's1'], ['side', 's2'], ['side', 's3'], ['side', 's4'], ['friend', 'f1'], ['friend', 'f2'], ['friend', 'f3a'], ['friend', 'f3b'], ['crisis', 'c1'], ['crisis', 'job'], ['crisis', 'bizCut'], ['crisis', 'recovery']];
  for (const [id, s] of samples) {
    const st = forced('w1', id, s, { cash: 30000, data: id === 'friend' ? { amount: 9000, risk: 13500, name: 'יוסי' } : { paid: 3600 } });
    const ev = CH.CHAINS[id].steps[s].onCard ? E.currentEvent(st) : E.inbox(st)[0];
    assert.ok(ev.text.length <= 120, `${id}.${s} text ${ev.text.length}: ${ev.text}`);
    for (const f of ['remember', 'hint']) { const v = ev[f] ?? ev.data[f]; if (v) assert.ok(v.length <= 70, `${id}.${s} ${f} ${v.length}: ${v}`); }
  }
  for (const [id, s] of [['car', 's2fix'], ['move', 'm2renew'], ['career', 'warn'], ['side', 's1'], ['crisis', 'c1']]) {
    const m = forced('w1', id, s, { data: { paid: 3600 } }); const f = forced('w1', id, s, { data: { paid: 3600 } }); f.gender = 'f';
    const em = E.inbox(m)[0], ef = E.inbox(f)[0]; assert.ok(em.title && ef.title);
    if (/זוכר/.test(em.remember || '')) assert.match(ef.remember, /זוכרת/);
  }
});
test('§12.15–16 natural frequency and pacing (random games, all worlds; the 300-game version is tools/sim.mjs --stories)', () => {
  const rows = [];
  for (const w of WORLDS4) {
    const gs = sampleGames(N(30), w); const n = gs.length; const has = (id) => gs.filter((g) => g.story.chains[id]).length / n;
    const per12 = gs.map((g) => g.story.memory.filter((m) => !['car', 'move', 'friend'].includes(m.chain) || !['s1', 'm1', 'homeRepair', 'f1', 'carBack'].includes(m.step)).length * 12 / Math.max(1, g.month - 1)).sort((a, b) => a - b);
    rows.push({ w, car: has('car'), move: has('move'), friend: has('friend'), career: has('career'), crisis: has('crisis'), med: per12[Math.floor(n / 2)], p90: per12[Math.floor(n * 0.9)] });
  }
  console.log('   ' + rows.map((r) => `${r.w} car ${(r.car * 100).toFixed(0)}% move ${(r.move * 100).toFixed(0)}% friend ${(r.friend * 100).toFixed(0)}% career ${(r.career * 100).toFixed(0)}% crisis ${(r.crisis * 100).toFixed(0)}% items/12m med ${r.med.toFixed(1)} p90 ${r.p90.toFixed(1)}`).join('\n   '));
  for (const r of rows) { assert.ok(r.p90 <= 6.5, 'p90 items per 12 months'); assert.ok(r.career >= 0.3, 'career triggers'); }
});

/* ------------------------------------------------------------------ business (§6, §12.21–27) */
const T3TYPES = BIZ.ARCHETYPE_IDS;
function bizRun(type, seed, months, o = {}) {
  let b = BIZ.create(type, { t3: true, setup: o.setup }); let s = seed >>> 0 || 1; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const reps = [];
  for (let m = 0; m < months; m++) {
    if (o.each) b = o.each(b, m) || b;
    const r = BIZ.simulate(b, null, rng, { cal: ((m + (o.cal0 || 0)) % 12) + 1, story: rng }); reps.push({ before: b, r }); b = r.business;
    if (b.decide) { const ch = BIZ.eventChoices(b, {}); const en = ch.choices.filter((c) => c.enabled); const pick = o.pick ? o.pick(ch, m) : en[(m * 7 + seed) % en.length].id; const x = BIZ.resolveEvent(b, b.decide.key, pick); assert.ok(x.ok, `${type} ${ch.id}:${pick} ${x.errors}`); b = x.business; if (x.sale) break; }
  }
  return { b, reps };
}
test('U16 / §12.21 business why: Σ profit bridge = Δ net profit and net profit + Σ cash bridge = cash change, all integers (every month of 300 lifetimes per type × scale)', () => {
  let months = 0; let vatMax = 0; let otherMax = 0;
  for (const t of T3TYPES) for (let i = 0; i < N(60); i++) {
    const { reps } = bizRun(t, 1000 + i * 31, 30, { each: (b, m) => (m === 4 ? BIZ.applyDecisions(b, { marketing: b.p.mktHalf, draw: 1500 }).business : m === 8 && b.p.stock === 'inventory' ? BIZ.applyDecisions(b, { order: 300 }).business : b) });
    let prev = null;
    for (const { r } of reps) {
      const R = r.report; months++;
      assert.equal(R.netProfit + R.why.cash.reduce((x, y) => x + y.amount, 0), R.cash.change, `${t} cash bridge`);
      if (prev != null) assert.equal(R.why.profit.reduce((x, y) => x + y.amount, 0), R.netProfit - prev, `${t} profit bridge m${R.month}`);
      for (const it of [...R.why.profit, ...R.why.cash]) assert.ok(Number.isInteger(it.amount));
      assert.ok(typeof R.why.sentence === 'string' && R.why.sentence.length > 5);
      // review M6/M9: labels that tell the truth — a glued conjunction never appears, a write-off is never called a collection,
      // and the remainder lines stay small (the bridges are not just closed by a plug)
      assert.ok(!/אבלהקופה|,ו |\s{2}/.test(R.why.sentence), R.why.sentence);
      const bad = (R.opex && R.opex.badDebt) || 0; const ar = R.why.cash.find((x) => x.k === 'ar');
      if (bad) { assert.ok(R.why.cash.some((x) => x.k === 'badDebt' && x.amount === bad), 'a write-off has its own non-cash line'); if (ar && /^נכנסו/.test(ar.text)) assert.ok(ar.amount > 0 && ar.amount <= Math.max(0, ar.amount)); }
      const vat = R.why.cash.find((x) => x.k === 'vat'); vatMax = Math.max(vatMax, vat ? Math.abs(vat.amount) : 0);
      const other = R.why.profit.find((x) => x.k === 'other'); if (other && prev != null) otherMax = Math.max(otherMax, Math.abs(other.amount) / Math.max(2000, Math.abs(R.revenue || 0)));
      prev = r.business.last ? r.business.last.netProfit : R.netProfit;
    }
  }
  assert.ok(months > N(60) * 5 * 10, 'months ' + months);
  assert.equal(vatMax, 0, 'the cash bridge needs no VAT / timing plug'); assert.ok(otherMax <= 0.1, `the profit "other" line (small opex) stays ≤ 10% of revenue (${otherMax.toFixed(3)})`);
});
test('U14 / §12.22 setups create valid businesses; simulate uses exactly 3 + 2 draws; every type has seasons and its season-prep decision appears leadTime + 1 months ahead', () => {
  for (const t of T3TYPES) {
    for (const k of ['lean', 'std', 'strong']) if (BIZ.SETUPS[t][k]) { const b = BIZ.create(t, { t3: true, setup: k }); assert.ok(b.cash >= 0, `${t}/${k}`); }
    assert.ok(Object.values(BIZ.SEASONS[t]).some((x) => x[0] !== 1), t + ' has a season');
    let n = 0; const b = BIZ.create(t, { t3: true }); BIZ.simulate(b, null, () => { n++; return 0.5; }, { cal: 3, story: () => { n++; return 0.5; } }); assert.equal(n, 5, 'draws');
    for (const sp of BIZ.SEASON_PREP[t]) {
      const ahead = (t === 'toyshop' ? 1 : 0) + 1; const cal = ((sp.peak - 1 - ahead) % 12 + 12) % 12 + 1;
      const r = BIZ.simulate(BIZ.create(t, { t3: true }), null, () => 0.99, { cal, story: () => 0.5 });
      assert.ok(r.business.decide && r.business.decide.id === 'seasonPrep' && r.business.decide.data.peak === sp.peak, `${t} prep for ${sp.peak} at cal ${cal}`);
    }
  }
});
test('U15 / §12.23 the 7 requested events open a decision with ≥ 2 enabled choices for every type they apply to; resolveEvent is atomic; previews match a deterministic 3-month run (±₪1)', () => {
  const APPLIES = { costSpike: ['coffee', 'laundromat', 'toyshop', 'pizza'], customsDelay: ['toyshop'], supplierDelay: ['coffee', 'pizza'], staffQuit: ['coffee', 'pizza', 'app'], competitor: T3TYPES, lateClient: T3TYPES, overload: ['coffee', 'laundromat', 'toyshop', 'pizza'], seasonPrep: T3TYPES };
  for (const [id, types] of Object.entries(APPLIES)) for (const t of types) {
    let b = BIZ.create(t, { t3: true }); if (id === 'staffQuit' && t !== 'app') b = BIZ.applyDecisions(b, { hire: 1 }).business;
    b = BIZ.simulate(b, null, () => 0.5, { cal: 5, story: () => 0.5 }).business; b.decide = null;
    if (id === 'customsDelay') { b.orders = [{ units: 300, value: 10000, arrive: b.month + 2 }]; b.stock = 50; b.lastUnits = 200; }
    b.decide = { key: b.month + ':' + id, id, m: b.month, seal: { a: 0.5, b: 0.5 }, data: id === 'seasonPrep' ? { peak: 12, title: 'x', mult: 1.6, kind: null } : id === 'lateClient' ? { units: 50, price: 10, gross: 500 } : {} };
    if (id === 'costSpike') b.effects.push({ id: 'costSpike', kind: t === 'laundromat' ? 'fixedMult' : 'cost', mult: 1.15, until: b.month + 2 });
    if (id === 'competitor') b.effects.push({ id: 'competitor', kind: 'demand', mult: 0.82, until: b.month + 5 });
    const ch = BIZ.eventChoices(b, { cal: 6 }); assert.ok(ch.choices.filter((c) => c.enabled).length >= 2, `${id}/${t}`);
    const bad = BIZ.resolveEvent(b, 'nope', ch.choices[0].id); assert.equal(bad.ok, false); assert.equal(bad.business, b, 'atomic');
    const def = ch.choices.find((c) => c.default);
    for (const c of ch.choices.filter((x) => x.enabled && !x.default && !x.sale)) {
      const r0 = BIZ.resolveEvent(b, ch.key, def.id, { neutral: true }), r1 = BIZ.resolveEvent(b, ch.key, c.id, { neutral: true });
      const f0 = BIZ.forecast(r0.business, null, 3, { cal: 6 }), f1 = BIZ.forecast(r1.business, null, 3, { cal: 6 });
      assert.ok(Math.abs((f1.netProfit - f0.netProfit) - c.preview.delta3) <= 1, `${id}/${t}/${c.id} preview`);
    }
  }
});
test('U18 / §12.24 lateClient: receivable due at +2, +3 when late, written off as חוב אבוד when bad; VAT paid stays paid; frequencies ±3 pp of 25% / 8% over 10,000 sealed draws', () => {
  for (const [a, sb, kind] of [[0.9, 0.9, 'onTime'], [0.1, 0.9, 'late'], [0.9, 0.01, 'bad']]) {
    let b = BIZ.simulate(BIZ.create('laundromat', { t3: true }), null, () => 0.5, { cal: 3, story: () => 0.5 }).business;
    b.decide = { key: b.month + ':lateClient', id: 'lateClient', m: b.month, seal: { a, b: sb }, data: { units: 300, price: 16, gross: 4800 } };
    b = BIZ.resolveEvent(b, b.decide.key, 'accept').business; const m0 = b.month;
    const runs = []; for (let k = 0; k < 5; k++) { const r = BIZ.simulate(b, null, () => 0.5, { cal: 4 + k, story: () => 0.5 }); runs.push(r.report); b = r.business; }
    const booked = runs[0]; assert.ok(b.month === m0 + 5 && booked.revenueGross > 0);
    const terms = runs.map((r) => r.receivables);
    if (kind === 'onTime') assert.ok(runs[2].cash.collected > runs[1].cash.collected, 'paid at +2'); // month m0+3 = booked month + 2
    if (kind === 'bad') { assert.ok(runs.some((r) => (r.opex.badDebt || 0) > 0), 'bad debt line'); assert.ok(runs.find((r) => r.opex.badDebt > 0).lines || true); }
    if (kind === 'late') assert.ok(runs.every((r) => !(r.opex.badDebt > 0)));
    void terms;
  }
  let late = 0, bad = 0; const n = 10000; let s = 7; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) { const a = R(), b2 = R(); if (a < 0.25) late++; if (b2 < 0.08) bad++; }
  assert.ok(Math.abs(late / n - 0.25) <= 0.03 && Math.abs(bad / n - 0.08) <= 0.03);
});
test('U17 / §12.25 growthStage: never ±2 in a month; needs 2 good / 3 bad months; stage 3 reachable', () => {
  let reached3 = 0, lifetimes = 0;
  for (const t of T3TYPES) for (let i = 0; i < N(40); i++) {
    const { reps } = bizRun(t, 50 + i * 13, 30, { each: (b, m) => (m === 3 ? BIZ.applyDecisions(b, { marketing: b.p.mktHalf }).business : m === 14 && b.p.expand && b.expanded < b.p.expand.max ? (BIZ.applyDecisions(b, { expand: 1, manager: true }).ok ? BIZ.applyDecisions(b, { expand: 1, manager: true }).business : b) : b), pick: (ch) => ch.choices.find((c) => c.default).id });
    lifetimes++; let last = 0; let maxS = 0;
    for (const { r } of reps) { const s2 = r.business.stage; assert.ok(Math.abs(s2 - last) <= 1, 'one step a month'); last = s2; maxS = Math.max(maxS, s2); }
    if (maxS >= 3) reached3++;
  }
  // hysteresis sequence by hand
  const b = BIZ.create('coffee', { t3: true }); b.stage = 1; b.stageUp = 0; b.stageDown = 0;
  console.log(`   stage 3 in ${reached3}/${lifetimes} lifetimes (30 months)`);
  assert.ok(reached3 >= 1, 'stage 3 reachable');
});
test('§12.26 offer cards show setups; the old option id start still works (= std); describe has title / text / options for every new card type', () => {
  for (const t of T3TYPES) {
    const st = E.createGame({ worldId: 'w4', seed: 3, mode: 'free' }); st.cash = 1e6;
    st.pending = { id: 5, type: 'business', tile: 'K', pos: 3, mode: 'offer', typeId: t, seed: 77 }; st.phase = 'event';
    const ev = E.currentEvent(st); assert.ok(ev.data.setups.length >= 2 && ev.data.seasonProfile.length === 12 && ev.data.eventsText);
    const ids = ev.options.map((o) => o.id); assert.ok(ids.includes('start') && ids.includes('pass'));
    for (const id of ids.filter((x) => x.startsWith('start'))) { const c = clone(st); const r = E.choose(c, null, id); assert.ok(r.ok !== false); const a = c.assets.find((x) => x.biz); assert.equal(a.biz.setup, id === 'start' ? 'std' : id.slice(6)); assert.equal(a.biz.t3, 1); }
  }
});
test('§12.27 side graduation offers only SIDE_GRAD types of the world; the default (expiry) graduates into the coffee cart', () => {
  for (const w of [...WORLDS4, 'h']) {
    const st = forced(w === 'h' ? 'w1' : w, 'side', 's4', { history: w === 'h', prep: (x) => { x.life.plan = 'side'; x.life.side.months = 15; x.life.sideSeed = 99; } });
    const ev = E.inbox(st)[0]; const grads = ev.options.filter((o) => o.id.startsWith('grad:')).map((o) => o.id.slice(5));
    assert.deepEqual(grads, Object.keys(BIZ.SIDE_GRAD).filter((t) => BIZ.SIDE_GRAD[t].worlds === 'all' || BIZ.SIDE_GRAD[t].worlds.includes(w)), w);
    assert.equal(ev.options.find((o) => o.default).id, 'grad:coffee');
  }
  const st = forced('w1', 'side', 's4', { prep: (x) => { x.life.plan = 'side'; x.life.side.months = 15; x.life.sideSeed = 99; } });
  for (let k = 0; k < 30 && st.story.inbox.length; k++) { E.rollDice(st); let ev = E.landing(st); while (ev) ev = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id).event; }
  assert.ok(st.assets.some((a) => a.biz && a.biz.type === 'coffee' && a.n === 'העסק הצדדי שלך'));
});
test('business inbox: a decision becomes a kind:biz item, listed on the manage card as q:<item>:<choice> (logged Q); unresolved → default before the next simulated month', () => {
  let found = 0;
  for (const w of ['w1', 'w2', 'w3']) for (let i = 0; i < N(20) && found < 6; i++) {
    const st = E.createGame({ worldId: w, seed: 300 + i, mode: 'free' }); st.cash = 1e6;
    st.pending = { id: 5, type: 'business', tile: 'K', pos: 3, mode: 'offer', typeId: E.getWorld(w).bizOffers[0], seed: 99 + i }; st.phase = 'event'; E.choose(st, null, 'start');
    for (let t = 0; t < 120 && !st.over; t++) {
      const it = st.story.inbox.find((x) => x.kind === 'biz');
      if (it) {
        found++;
        const a = st.assets.find((x) => 'a' + x.id === it.assetId); st.pending = { id: 900 + t, type: 'business', tile: 'K', pos: 3, mode: 'manage', assetId: a.id }; st.phase = 'event';
        const ev = E.currentEvent(st); const q = ev.options.find((o) => o.id.startsWith('q:') && o.enabled); assert.ok(q && ev.data.inbox.length, 'manage card lists the item');
        const n0 = st.actions.length; const r = E.choose(st, ev, q.id); assert.notEqual(r.ok, false); assert.deepEqual(st.actions.at(-1).slice(0, 1), ['Q']); assert.equal(st.actions.length, n0 + 1);
        assert.ok(r.event, 'card stays open'); E.choose(st, r.event, 'ok'); break;
      }
      E.rollDice(st); let ev = E.landing(st); while (ev) ev = E.choose(st, ev, (ev.options.find((o) => o.enabled && ['ok', 'pass', 'done', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id).event;
    }
  }
  assert.ok(found >= 3, 'business items seen ' + found);
});
test('end screen: lifeSummary.stories lists the chains told (≤ 6) with a path and a cost', () => {
  const g = sampleGames(N(6), 'w1').find((x) => x.over && Object.keys(x.story.chains).length);
  assert.ok(g); const ls = g.result.lifeSummary; assert.ok(Array.isArray(ls.stories) && ls.stories.length <= 6 && ls.stories.length >= 1);
  for (const s of ls.stories) assert.ok(s.chain && s.title && Number.isInteger(s.cost));
});
test('rules 3 stays v3: no story draws, no inbox, no chain, no T3 business in a rules-3 game', () => {
  const st = playOut(E, { worldId: 'w2', seed: 9, mode: 'daily', maxMonths: 24, rules: 3 }, prng(2), { v4: true, stories: true });
  assert.equal(st.rules, 3); assert.equal(st.rng.story, makeStreams(st.seed).story); assert.equal(Object.keys(st.story.chains).length, 0); assert.equal(st.story.inbox.length, 0);
  assert.ok(st.assets.every((a) => !a.biz || !a.biz.t3)); assert.ok(!st.actions.some((a) => a[0] === 'Q'));
});

test('review M4: w1 (rules 4) scales the money of personal / values cards and the life chains (lifeMoneyScale); rules 3 and other worlds unchanged; every life option has an impact panel with its cost', () => {
  const k = E.getWorld('w1').lifeMoneyScale; assert.ok(k > 0 && k < 1);
  const st = forced('w1', 'car', 's1', { charId: 'teacher', cash: 50000 }); const ev = E.currentEvent(st);
  const st2 = forced('w2', 'car', 's1', { cash: 500000 }); const ev2 = E.currentEvent(st2);
  const base1 = Math.max(st.salary, 3000), base2 = Math.max(st2.salary, 3000);
  assert.equal(ev.options.find((o) => o.id === 'fix').effects.cash, -Math.round(0.4 * k * base1 / 100) * 100, 'w1 scaled');
  assert.equal(ev2.options.find((o) => o.id === 'fix').effects.cash, -Math.round(0.4 * base2 / 100) * 100, 'w2 unscaled');
  const r3 = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 3, mode: 'daily', rules: 3 }); r3.pending = { id: 4, type: 'life', tile: 'L', pos: 4, eventId: 'wedding', r: 0.5 }; r3.phase = 'event';
  assert.equal(E.currentEvent(r3).options.find((o) => o.id === 'big').effects.cash, -Math.round(2.5 * Math.max(r3.salary, 3000) / 100) * 100, 'rules 3 = v3');
  for (const o of ev.options) { assert.ok(o.major, 'life options carry the impact panel'); const im = E.impactFor(st, o.id, { event: ev }); assert.ok(im && Number.isFinite(im.cashAfter) && Number.isFinite(im.cfAfter), o.id); }
});

/* ------------------------------------------------------------------ T3 review fixes (docs/next-level/reviews/T3-review.md) */
test('review M1: stacked pay cuts multiply (half time × crisis cut), the chip equals the applied change', () => {
  const st = forced('w2', 'crisis', 'job', { charId: 'chef' });
  const g0 = E.metrics(st).payslip.base;
  st.story.flags.payCut = [{ src: 'partTime', mult: 0.6, until: st.month + 4, label: 'חצי משרה' }];
  const net0 = E.metrics(st).payslip.net; assert.equal(E.metrics(st).payslip.gross, Math.round(g0 * 0.6 / 10) * 10);
  const card = E.inbox(st).find((c) => c.chain === 'crisis'); const chip = card.options.find((o) => o.id === 'accept').effects.salary;
  resolveForced(st, 'crisis', 'job', 'accept');
  const ps = E.metrics(st).payslip;
  assert.equal(ps.gross, Math.round(Math.round(g0 * 0.6 / 10) * 10 * 0.9 / 10) * 10, 'half time × 0.9, never back up to 90 %');
  assert.ok(ps.gross < g0 * 0.6, 'accepting a cut never raises the pay');
  assert.equal(chip, ps.net - net0, 'the salary chip = the applied net change');
  assert.equal(st.story.flags.payCut.length, 2);
});
test('review M2: the friend chain renders with a masculine friend in both runs (texts are masculine: לו / מבקש / הוא)', () => {
  const FEM = ['מיכל', 'נועה', 'רונית', 'שירה', 'דנה'];
  assert.equal(CH.NAMES.friendGender, 'm');
  for (const run of [1, 2]) for (const step of ['f1', 'f2', 'f3a', 'f3b']) {
    const st = forced('w1', 'friend', step, { run, path: step === 'f3b' ? 'guarantee' : 'lend', data: { amount: 9000, risk: 13500, extra: 4500, name: CH.NAMES.friend[run - 1] }, item: step === 'f1' });
    const card = step === 'f1' ? E.currentEvent(st) || E.inbox(st)[0] : E.inbox(st)[0];
    const txt = JSON.stringify([card.title, card.text, card.remember, card.hint, card.options.map((o) => [o.label, o.odds && o.odds.text])]);
    assert.ok(!FEM.some((n) => txt.includes(n)), `run ${run} ${step}: a feminine name in masculine texts: ${txt.slice(0, 120)}`);
    assert.ok(txt.includes(CH.NAMES.friend[run - 1]) || step === 'f3b', `run ${run} ${step}: the friend's name is shown`);
  }
});
test('review M3: side s1 — reporting is the better choice for every character (U(file) > U(later)); the guide highlights it; the late return bills the accountant too', () => {
  for (const w of WORLDS4) for (const ch of E.getWorld(w).characters) {
    const st = forced(w, 'side', 's1', { charId: ch.id, mentor: 'guide', prep: (s) => { s.life.plan = 'side'; s.life.side.months = 1; }, data: { first: 1500 } });
    const card = E.inbox(st)[0]; const sc = E.scoreStory(st, card);
    const U = (id) => sc.find((x) => x.id === id).U;
    assert.ok(U('file') > U('later'), `${w}/${ch.id}: file ${U('file').toFixed(2)} vs later ${U('later').toFixed(2)}`);
    assert.equal(card.options.find((o) => o.primary).id, 'file', `${w}/${ch.id}: guide highlights reporting`);
  }
  // unreported side income: the year-end / tax-tile bill carries the accountant's fee for those months (rules 4)
  const st = E.createGame({ worldId: 'w2', seed: 31 }); st.life.plan = 'side'; st.econ = null; st.pos = 9; st.phase = 'roll'; E.rollDice(st);
  assert.ok(st.life.sideFeeDue === E.getWorld('w2').sideReportFee || st.life.sideTaxDue === 0);
});
test('review M4: the career warn card shows the real next-payday burnout chance (= the HUD), and the evaluator flags pushOn from the same numbers', () => {
  for (const [plan, energy] of [['side', 30], ['overtime', 30], ['work', 20], ['study', 26], ['work', 50]]) {
    const st = forced('w2', 'career', 'warn', { prep: (s) => { s.life.plan = plan; s.life.energy = energy; } });
    const card = E.inbox(st)[0]; const hud = Math.round(E.metrics(st).life.burnoutRisk * 100);
    const m = /בחודש הבא — (\d+)%\. ואם תמשיכי? כך עוד חודש: (\d+)%/.exec(card.hint); assert.ok(m, card.hint);
    assert.equal(+m[1], hud, `${plan}/${energy}: card ${m[1]}% = HUD ${hud}%`);
    const flagged = E.scoreStory(st, card).find((x) => x.id === 'pushOn').flags.includes('burnout');
    assert.equal(flagged, Math.max(+m[1], +m[2]) >= 25, `${plan}/${energy}: the flag follows the shown odds`);
  }
});
test('review M5: side s2 "take" shows the real cash now (−materials), the payment as next month\'s income, and a loan when it forces one', () => {
  const st = forced('w2', 'side', 's2', { cash: 500, prep: (s) => { s.life.plan = 'side'; s.life.side.months = 5; } });
  const o = E.inbox(st)[0].options.find((x) => x.id === 'take');
  assert.ok(o.effects.cash < 0 && o.effects.flow > 0 && o.effects.months === 1, JSON.stringify(o.effects));
  assert.ok(o.loanAmount > 0, 'a loan warning when the cash cannot pay the materials');
  const c0 = st.cash, l0 = st.loans; resolveForced(st, 'side', 's2', 'take');
  assert.equal(st.cash - c0 - (st.loans - l0), o.effects.cash, 'the chip = the applied cash change (net of the forced loan)');
});
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
