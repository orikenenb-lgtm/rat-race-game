// Room test bots (tests/room_core.test.mjs, tests/fakeroom.mjs self-test, tests/room_net.test.mjs).
// A bot sees ONLY what a client sees: its own redacted view + the server's event (view.event) + "rolled this round".
// It returns the next intent {code, args} or null (waiting for the round to close / game over).
import { prng } from './random-player.mjs';
export { prng };

const SAFE = ['pass', 'skip', 'ok', 'done'];
/** policy: 'pass' | 'greedy' | 'random'. me = {view, rolled, done}. */
export function botIntent(me, policy, r) {
  const v = me.view; if (!v || !v.state || v.state.over) return null;
  const ev = v.event; const st = v.state;
  if (st.pending && ev) {
    const en = ev.options.filter((o) => o.enabled); if (!en.length) return null;
    let o;
    if (policy === 'pass') o = en.find((x) => SAFE.includes(x.id)) || en[0];
    else if (policy === 'greedy') o = en.find((x) => x.kind === 'buy' || /^(buy|start|inv:|up:)/.test(x.id)) || en.find((x) => SAFE.includes(x.id)) || en[0];
    else o = en[Math.floor(r() * en.length)];
    return { code: 'c', args: o.needsQty ? [o.id, 1 + Math.floor(r() * Math.max(1, Math.min(5, o.max || 1)))] : [o.id] };
  }
  if (me.rolled) return null;
  if (policy === 'greedy' && r() < 0.06) return { code: 'L', args: [] };
  if (policy === 'random') {
    const x = r();
    if (x < 0.04) return { code: 'L', args: [] };
    if (x < 0.07 && st.loans) return { code: 'R', args: [] };
    if (x < 0.09) return { code: 'P', args: [['work', 'overtime', 'rest', 'side', 'study'][Math.floor(r() * 5)]] };
    if (x < 0.11) return { code: 'F', args: [['scout', 'debt', 'ops', 'frugal', 'none'][Math.floor(r() * 5)], 0] };
    if (x < 0.12) return { code: 'H', args: [] };
  }
  return { code: 'r', args: [] };
}
let n = 0;
export const actionId = (tag = 'a') => `${tag}-${Date.now().toString(36)}-${(++n).toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`.slice(0, 64);
