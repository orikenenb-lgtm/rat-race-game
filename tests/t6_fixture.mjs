// TEST fixture generator for tests/t6_e2e.py: saved games built by replaying real sim games (no production hook).
//   node tests/t6_fixture.mjs → JSON {nearEnd: {key, raw}, mid: {key, raw}}
// nearEnd = a w1 LEARNING game a few rolls before the goal holds (the e2e plays it to the end through the UI);
// mid = a w1 FREE game at mid-game (used for the in-game "רגעי החלטה" branch and the origin hash).
import * as E from '../js/engine.js';
import { play } from '../tools/sim.mjs';
import { tlNew, tlPush, tlRowOf } from '../js/summary.js';
/** the UI-side timeline the game would have recorded (one row per month, between rolls) — rebuilt by replaying each prefix */
function withTl(st) {
  const cfg = E.replayConfig(st); const A = st.actions; const tl = tlNew(1);
  for (let i = 0; i <= A.length; i++) { if (i < A.length && A[i][0] !== 'r') continue; const s2 = E.replay(cfg, A.slice(0, i)); tlPush(tl, tlRowOf(E.metrics(s2))); }
  st.ui = { ...(st.ui || {}), tl, trackMonth: st.month };
  return st;
}
const wrap = (cfg, state) => JSON.stringify({ v: 3, app: 'nl1', sv: E.SAVE_VERSION, cfg, state, savedAt: 1 });
const ui = () => ({ seq: 0, coach: {}, firstPayday: true });
function nearEnd(worldId, charId, seed) {
  const { st, end } = play(worldId, charId, seed, 'smart', 90);
  if (!end || end.status !== 'won') return null;
  const A = st.actions; const rs = A.map((a, i) => (a[0] === 'r' ? i : -1)).filter((i) => i >= 0);
  for (let back = 2; back <= 6; back++) {
    const cut = rs[rs.length - back]; const s2 = E.replay(E.replayConfig(st), A.slice(0, cut));
    if (!s2.over && !s2.pending && s2.phase === 'roll' && (s2.life.goalStreak || 0) >= 1) { s2.ui = ui(); return withTl(s2); }
  }
  return null;
}
let ne = null;
for (const seed of [101, 202, 303, 404, 505, 606, 707]) { ne = nearEnd('w1', 'teacher', seed); if (ne) break; }
const mid = (() => { const { st } = play('w1', 'teacher', 9090, 'smart', 14); const s2 = E.replay(E.replayConfig(st), st.actions); s2.ui = ui(); return withTl(s2); })();
const cfg = (s, extra) => ({ worldId: s.worldId, charId: s.charId, seed: s.seed, mode: 'free', pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, ...extra });
const midL = (() => { const { st } = play('w1', 'teacher', 7171, 'smart', 14); const s2 = E.replay(E.replayConfig(st), st.actions); s2.ui = ui(); return withTl(s2); })();
console.log(JSON.stringify({
  nearEndFree: ne ? { key: 'rr2-save-free-w1', raw: wrap(cfg(ne, {}), ne), month: ne.month } : null,
  midLearn: { key: 'rr2-save-learn-w1', raw: wrap(cfg(midL, { learn: true }), midL), month: midL.month },
  nearEnd: ne ? { key: 'rr2-save-learn-w1', raw: wrap(cfg(ne, { learn: true }), ne), month: ne.month } : null,
  mid: { key: 'rr2-save-free-w1', raw: wrap(cfg(mid, {}), mid), month: mid.month, over: !!mid.over },
}));
