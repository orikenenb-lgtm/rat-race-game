// ⚡ energy math with a mocked clock. Run: node tests/energy.test.mjs
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let T = Date.UTC(2026, 10, 20, 10, 0, 0);
Date.now = () => T;
const E = await import('../js/energy.js');
const { bus } = await import('../js/bus.js');
let fails = 0, n = 0;
const eq = (a, b, m) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const MIN = 60e3;
const events = []; bus.on('energy:change', (p) => events.push(p));

E._reset();
eq(E.get(), 25, 'fresh = full');
eq(E.msUntilNext(), 0, 'full: nothing to wait for');
for (let i = 0; i < 25; i++) E.spend();
eq([E.get(), E.canRoll(), E.spend()], [0, false, false], 'empty after 25 rolls, cannot roll');
eq(E.msUntilNext(), 6 * MIN, 'next point in 6 min');
eq(E.msUntilFull(), 150 * MIN, 'full in 2.5 h');
T += 5 * MIN + 59e3; eq(E.get(), 0, '5:59 later still 0');
T += 1e3; eq(E.get(), 1, '6:00 later +1');
T += 3 * MIN; eq([E.get(), E.msUntilNext()], [1, 3 * MIN], 'partial progress kept');
T += 3 * MIN + 12 * MIN; eq(E.get(), 4, '+3 more after 15 min');
E.spend(); T += 6 * MIN; eq(E.get(), 4, 'spend does not reset the refill clock');
// reload survives
const saved = store['rr2-energy']; eq(JSON.parse(saved).e >= 3, true, 'persisted');
T += 10 * 60 * MIN; eq(E.get(), 25, 'caps at max after a long break');
T += 60 * MIN; eq(E.get(), 25, 'no refill above max');
// bonuses can overflow; refill stops above max; spending back below restarts the clock
eq(E.add(10, 'daily'), 10, 'daily bonus');
eq(E.get(), 35, 'overflow to 35');
T += 60 * MIN; eq(E.get(), 35, 'no natural refill while above max');
for (let i = 0; i < 11; i++) E.spend();
eq(E.get(), 24, 'back below max');
T += 6 * MIN; eq(E.get(), 25, 'refill restarted when it dropped below max');
// grantOnce
eq(E.grantOnce('daily:2026-11-20', 10, 'daily'), 10, 'grantOnce first');
eq(E.grantOnce('daily:2026-11-20', 10, 'daily'), 0, 'grantOnce dedupes');
eq(E.add(500, 'gift') <= 99 && E.get() === 99, true, 'hard cap 99');
// clock moved back never gives energy
E._reset({ e: 3, at: T });
T -= 120 * MIN; eq(E.get(), 3, 'clock back: no gain');
T += 6 * MIN; eq(E.get(), 4, 'refill continues from the corrected anchor');
eq(E.fmtWait(4 * MIN + 5e3), '4:05', 'fmtWait m:ss'); eq(E.fmtWait(72 * MIN), '1:12 ש׳', 'fmtWait hours');
eq(events.some((e) => e.reason === 'daily' && e.delta === 10), true, 'bus energy:change with reason');
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} energy tests passed`); process.exit(fails ? 1 : 0);
