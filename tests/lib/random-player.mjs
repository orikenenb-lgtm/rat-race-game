// Shared by tests/verify.test.mjs and tests/determinism.test.mjs: a seeded, legal random player (no game RNG is touched).
export function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A legal random player (decisions + any-time actions), like a human clicking around. */
export function playOut(E, cfg, r) {
  const st = E.createGame(cfg);
  for (let guard = 0; !st.over && guard < 3000; guard++) {
    if (r() < 0.05 && E.setPlan) E.setPlan(st, ['work', 'overtime', 'rest', 'side', 'study'][Math.floor(r() * 5)]);
    if (!st.over && r() < 0.04) E.takeLoan(st);
    if (!st.over && r() < 0.04 && st.loans) E.repayLoan(st);
    if (!st.over && r() < 0.02 && E.setAutoInvest) E.setAutoInvest(st, r() < 0.5 ? 0 : 500);
    if (!st.over && r() < 0.03 && E.invest) E.invest(st, 'buy', 1 + Math.floor(r() * 5));
    if (st.over) break;
    E.rollDice(st);
    let ev = E.landing(st); let n = 0;
    while (ev && !st.over) {
      const en = ev.options.filter((o) => o.enabled);
      let o = n >= 3 ? (en.find((x) => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(r() * en.length)];
      if (r() < 0.3) o = en.find((x) => x.primary) || o;
      const res = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 + Math.floor(r() * Math.max(1, o.max)) } : {});
      ev = res.event; n++;
      if (n > 60) throw new Error('event loop');
    }
  }
  return st;
}

