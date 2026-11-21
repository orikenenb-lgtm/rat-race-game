// Helper (not a test): JSON {current, v1, future} save wrappers (raw strings) for w1 at month 10, built from the live
// engine at run time (no committed fixtures). Node: `node tests/fixtures/make_saves.mjs` prints them. Browser: the
// stability e2e imports it from the served copy and calls makeSaves(), so the fixtures always match the served engine.
import * as E from '../../js/engine.js';
function at10(seed) {
  const st = E.createGame({ worldId: 'w1', seed, mode: 'free' });
  for (let guard = 0; st.month < 10 && guard < 400 && !st.over; guard++) {
    let ev = st.pending ? E.currentEvent(st) : null;
    if (!ev && st.phase === 'roll') { E.rollDice(st); ev = E.landing(st) || E.currentEvent(st); }
    for (let k = 0; ev && k < 12; k++) {
      const opt = (ev.options.find((o) => /^(ok|pass|skip|no|done|decline)/.test(o.id)) || ev.options[ev.options.length - 1]).id;
      const r = E.choose(st, ev, opt); ev = r && r.event;
    }
  }
  st.ui = { seq: 0, coach: {}, firstPayday: true };
  return st;
}
export function makeSaves() {
const cfg = (st) => ({ worldId: 'w1', charId: st.charId, seed: st.seed, mode: 'free', pawn: 'classic', pawnColor: '#e2483d', tutorial: false, resume: false });
const cur = at10(4242);
const wrap = (st, v = 3) => JSON.stringify({ v, cfg: cfg(st), state: st, savedAt: Date.now() });
const fut = JSON.parse(JSON.stringify(cur)); fut.v = E.SAVE_VERSION + 1;
const v1 = JSON.parse(JSON.stringify(at10(777))); v1.v = 1; delete v1.life; for (const k of Object.keys(v1.rng).slice(-3)) delete v1.rng[k]; v1.pos = Math.min(v1.pos, 23);
return { current: wrap(cur), future: wrap(fut), v1: JSON.stringify({ v: 2, cfg: cfg(v1), state: v1, savedAt: Date.now() }), month: cur.month, v1month: v1.month, saveVersion: E.SAVE_VERSION };
}
if (typeof process !== 'undefined' && process.argv && /make_saves\.mjs$/.test(process.argv[1] || '')) process.stdout.write(JSON.stringify(makeSaves()));
