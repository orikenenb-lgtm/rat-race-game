// wave 3a (docs/full-upgrade/ONLINE.md §13): a ranked checkpoint survives Postgres jsonb (keys re-ordered) and resumes to the
// identical game. Run: node tests/ckpt_roundtrip.test.mjs
//  C-1 the v2 payload (js/ckcodec.js packCheckpoint) round-tripped through jsonb key re-ordering → unpack → E.deserialize resumes
//      to a state that plays on byte-identically to the uninterrupted game (same final serialize, same E.replay result).
//  C-2 the old form (a bare state object, or its JSON text) is still read.
//  C-3 the wrapper keeps what readers of the raw payload use: ui.seq (lobby "which is newer"), actions (draft append-only trigger).
//  C-4 (report) how many old-form resumes diverge — the bug the v2 form removes.
import * as E from '../js/engine.js';
import { packCheckpoint, unpackCheckpoint, isPacked } from '../js/ckcodec.js';
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
/** what Postgres jsonb does to an object: keys sorted shorter-first, then bytewise (recursively); numbers re-printed */
function jsonbReorder(v) {
  if (Array.isArray(v)) return v.map(jsonbReorder);
  if (!v || typeof v !== 'object') return v;
  const b = (k) => Buffer.from(k, 'utf8');
  const keys = Object.keys(v).sort((x, y) => { const X = b(x), Y = b(y); return X.length - Y.length || Buffer.compare(X, Y); });
  const o = {}; for (const k of keys) o[k] = jsonbReorder(v[k]); return o;
}
const throughJsonb = (payload) => JSON.stringify(jsonbReorder(JSON.parse(JSON.stringify(payload))));   // what rr_begin hands back
/** one roll + every card of that landing, with a deterministic but varied choice (depends only on the state) */
function step(st) {
  if (st.phase === 'roll' && !st.over) E.rollDice(st);
  let ev = st.phase === 'roll' ? null : E.landing(st) || E.currentEvent(st); let g = 0;
  while (ev && !st.over && g++ < 60) {
    const opts = (ev.options || []).filter((o) => o.enabled !== false); if (!opts.length) break;
    const k = (st.turn * 7 + g * 3 + (ev.id || 0)) % opts.length;
    let r = null;
    for (let j = 0; j < opts.length; j++) { const o = opts[(k + j) % opts.length]; r = E.choose(st, ev, o.id, { qty: 1 }); if (!r || r.ok !== false) break; }
    ev = (r && r.event) || E.currentEvent(st);
  }
}
function play(st, rolls) { for (let i = 0; i < rolls && !st.over; i++) step(st); return st; }
const fin = (st) => JSON.stringify({ month: st.month, cash: st.cash, over: st.over || null, result: st.result || null, actions: st.actions });
let diverged = 0, cases = 0;
for (const worldId of ['w1', 'w2', 'w3', 'w4']) {
  for (const seed of [11, 202, 3003, 40004, 7]) {
    for (const at of [6, 17]) {
      const cfg = { worldId, seed, mode: 'challenge' };
      const live = play(E.createGame(cfg), at);
      if (live.over) continue;
      live.ui = { seq: at };
      cases++;
      const wire = throughJsonb(packCheckpoint(live));                          // client → rr_checkpoint (jsonb) → rr_begin
      const raw = JSON.parse(wire);
      ok(isPacked(raw), `${worldId}/${seed}@${at}: the payload stays a v2 wrapper through jsonb`);
      ok(raw.ui && raw.ui.seq === at && Array.isArray(raw.actions) && raw.actions.length === live.actions.length, `${worldId}/${seed}@${at}: ui.seq + actions mirrored`);
      const resumed = E.deserialize(unpackCheckpoint(raw));
      ok(E.serialize(resumed) === E.serialize(live), `${worldId}/${seed}@${at}: v2 restore is byte-identical`);
      const a = play(E.deserialize(E.serialize(live)), 40), b = play(resumed, 40);   // uninterrupted vs resumed
      ok(fin(a) === fin(b), `${worldId}/${seed}@${at}: the resumed game plays on identically`);
      const rp = E.replay(E.replayConfig(b), b.actions);
      ok(E.serialize({ ...rp, ui: null }) === E.serialize({ ...a, ui: null }) || fin(rp) === fin(a), `${worldId}/${seed}@${at}: E.replay of the resumed log = the uninterrupted game`);
      // C-2 old forms still read (object and text)
      const oldObj = JSON.parse(throughJsonb(live));
      ok(unpackCheckpoint(oldObj) === oldObj && unpackCheckpoint(JSON.stringify(live)).seed === live.seed, `${worldId}/${seed}@${at}: old bare-state form still read`);
      // C-4 report: does the old (re-ordered) form diverge?
      try { const c = play(E.deserialize(oldObj), 40); if (fin(c) !== fin(a)) diverged++; } catch (e) { diverged++; }
    }
  }
}
ok(cases >= 30, `enough resume cases (${cases})`);
ok(unpackCheckpoint(null) === null && unpackCheckpoint('not json') === null && unpackCheckpoint({ ck: 2, json: '{bad' }) === null, 'bad payloads → null (game.js shows the ranked-fail toast)');
console.log(`C-4 report: old jsonb form diverged in ${diverged}/${cases} resumes (v2: 0)`);
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
