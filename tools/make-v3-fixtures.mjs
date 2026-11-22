#!/usr/bin/env node
// T2 step P0 — golden fixtures of the v3 (rules-3) engine, generated BEFORE any T2 engine edit.
//   node tools/make-v3-fixtures.mjs            writes tests/fixtures/v3-*.json(.gz)
// Contents:
//   v3-streams.json        makeStreams(seed) for 20 seeds (stream indexes 0–9 must never change: T1)
//   v3-golden.json         50 seeds × 4 worlds, a legal random player that ignores `primary` (so its decisions do not depend
//                          on mentor presentation): replay config + final-state projection (T7 legacy equivalence)
//   v3-golden-actions.json.gz   the action logs of those games (gzip, base64-free binary)
//   v3-saves.json          v3 saves for the v3→v4 migration test (T6): roll phase, mid-deal, mid-trade, ranked daily, history
// The projection helper is exported so tests/t2.test.mjs compares exactly the same fields.
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OLD_STREAMS = ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index'];

/** Outcome projection of a finished (or capped) game: everything money/outcome-related that rules 3 must reproduce. */
export function projection(E, st) {
  const end = st.result || E.checkEnd(st) || {};
  const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k] ?? null]));
  return {
    end: pick(end, ['status', 'reason', 'months', 'netWorth', 'passive', 'expenses', 'stars', 'impact']),
    month: st.month, turn: st.turn, pos: st.pos, cash: st.cash, loans: st.loans, credit: st.credit, savings: st.savings,
    assets: st.assets.map((a) => [a.id, a.k, a.n, a.cost, a.down, a.debt, a.value, a.cf ?? null, a.noi ?? null, a.fixedRate ?? null]),
    holdings: Object.fromEntries(Object.entries(st.holdings).map(([k, h]) => [k, [h.qty, Math.round(h.basis)]])),
    prices: st.prices, rng: Object.fromEntries(OLD_STREAMS.map((k) => [k, st.rng[k]])),
    life: pick(st.life, ['energy', 'happiness', 'creditScore', 'pension', 'plan', 'gross', 'grossUsd']),
    stats: pick(st.stats, ['deals', 'autoLoans', 'forcedLoans', 'interestPaid', 'toysSpent', 'crises', 'paydays']),
  };
}
export const GOLDEN_MODES = ['free', 'daily', 'weekly', 'challenge'];
export function goldenConfig(E, w, i) {
  const mode = GOLDEN_MODES[i % 4];
  return { worldId: w.id, charId: w.characters[i % w.characters.length].id, seed: 7000 + i * 131 + w.order * 100003, mode, maxMonths: mode === 'daily' ? 24 : undefined };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const E = await import(join(ROOT, process.argv[2] || 'js', 'engine.js'));
  const { playOut, prng } = await import(join(ROOT, 'tests/lib/random-player.mjs'));
  await E.loadRealData();
  const out = join(ROOT, 'tests', 'fixtures'); mkdirSync(out, { recursive: true });

  // 1. streams
  const streams = {}; const { makeStreams } = await import(join(ROOT, 'js', 'rng.js'));
  for (let i = 0; i < 20; i++) { const seed = (i * 2654435761 + 7) >>> 0 || 1; const s = makeStreams(seed); streams[seed] = Object.fromEntries(OLD_STREAMS.map((k) => [k, s[k]])); }
  writeFileSync(join(out, 'v3-streams.json'), JSON.stringify(streams, null, 0) + '\n');

  // 2. golden games
  const games = []; const logs = [];
  for (const w of E.WORLDS) for (let i = 0; i < 50; i++) {
    const cfg = goldenConfig(E, w, i);
    const st = playOut(E, cfg, prng(cfg.seed ^ 0x2545f491), { usePrimary: false });
    games.push({ cfg: E.replayConfig(st), proj: projection(E, st) });
    logs.push(st.actions);
  }
  writeFileSync(join(out, 'v3-golden.json'), JSON.stringify({ engine: 'v3 @ 27b0fb5 (pre-T2)', player: 'tests/lib/random-player.mjs playOut usePrimary:false, prng(seed ^ 0x2545f491)', games }) + '\n');
  writeFileSync(join(out, 'v3-golden-actions.json.gz'), gzipSync(JSON.stringify(logs), { level: 9 }));

  // 3. saves for the migration test
  const saves = {};
  const until = (cfg, pred, seedR) => { // play turn by turn until pred(st, phase) holds
    const st = E.createGame(cfg); const r = prng(seedR);
    for (let t = 0; t < 400 && !st.over; t++) {
      if (pred(st, 'roll')) return st;
      E.rollDice(st); let ev = E.landing(st); let n = 0;
      while (ev) {
        if (pred(st, 'event', ev)) return st;
        const en = ev.options.filter((o) => o.enabled);
        const o = n >= 2 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)];
        ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; n++;
      }
    }
    throw new Error('fixture condition never met');
  };
  saves.roll = E.serialize(until({ worldId: 'w2', charId: 'lawyer', seed: 4711, mode: 'free' }, (st, ph) => ph === 'roll' && st.month >= 6, 1));
  saves.deal = E.serialize(until({ worldId: 'w1', charId: 'teacher', seed: 99, mode: 'free' }, (st, ph, ev) => ph === 'event' && ev.type === 'deal' && !ev.auto && st.month >= 3, 2));
  saves.trade = E.serialize(until({ worldId: 'w3', seed: 1234, mode: 'free' }, (st, ph, ev) => ph === 'event' && ev.type === 'trade' && !ev.auto, 3));
  saves.daily = E.serialize(until({ ...E.dailyConfig('2026-11-20') }, (st, ph) => ph === 'roll' && st.month >= 5, 4));
  saves.dailyDeal = E.serialize(until({ ...E.dailyConfig('2026-11-21') }, (st, ph, ev) => ph === 'event' && ev.type === 'deal' && !ev.auto, 5));
  saves.history = E.serialize(until({ mode: 'history', scenarioId: 'gfc', seed: 5 }, (st, ph) => ph === 'roll' && st.month >= 8, 6));
  writeFileSync(join(out, 'v3-saves.json'), JSON.stringify(saves) + '\n');
  console.log(`fixtures: ${Object.keys(streams).length} stream seeds, ${games.length} golden games (${logs.reduce((a, l) => a + l.length, 0)} actions), saves: ${Object.keys(saves).join(', ')}`);
}
