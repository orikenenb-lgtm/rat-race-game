// wave 3a (docs/full-upgrade/ONLINE.md §13): the ranked server checkpoint must not depend on jsonb key order.
// game.results.checkpoint is jsonb: Postgres stores object keys sorted (shorter first, then bytewise), so a state saved as a jsonb
// object comes back with its keys re-ordered — and the engine iterates some objects in insertion order, so a resumed game could
// play on differently (8/40 measured) and an honest final claim could fail verification.
// New form (v2): the serialized state travels as ONE JSON string inside the jsonb payload, so the restore is byte-identical:
//   { ck: 2, json: "<E.serialize(state)>", ui: { seq }, turn, nextEventId, pending, over, actions }
// The small mirrors (ui.seq / turn / nextEventId / pending / over) keep the lobby's "which is newer" check working on the wrapper,
// and `actions` keeps the draft append-only trigger (docs/next-level/drafts/t6_append_only.sql: checkpoint -> 'actions') working.
// Old form (a bare state object, or its JSON text) is still read. Pure: no DOM, no engine import.
export const CK_V = 2;
/** state → the jsonb payload for rr_checkpoint */
export function packCheckpoint(st) {
  const json = JSON.stringify(st);
  return { ck: CK_V, json, ui: { seq: (st && st.ui && st.ui.seq) || 0 }, turn: (st && st.turn) || 0, nextEventId: (st && st.nextEventId) || 0,
    pending: !!(st && st.pending), over: (st && st.over) || null, actions: Array.isArray(st && st.actions) ? st.actions.slice() : [] };
}
/** is this a v2 wrapper? */
export const isPacked = (x) => !!(x && typeof x === 'object' && x.ck === CK_V && typeof x.json === 'string');
/** the server payload (v2 wrapper, an old bare state object, or JSON text of either) → the state object, or null.
 *  The v2 form is parsed from its string, so key order (and every number) is exactly what the client saved. */
export function unpackCheckpoint(x) {
  try {
    if (x == null) return null;
    if (typeof x === 'string') { const v = JSON.parse(x); return v && typeof v === 'object' ? unpackCheckpoint(v) : null; }
    if (typeof x !== 'object') return null;
    if (isPacked(x)) { const st = JSON.parse(x.json); return st && typeof st === 'object' ? st : null; }
    return x;   // old form: the state itself (keys possibly re-ordered by jsonb)
  } catch (e) { return null; }
}
