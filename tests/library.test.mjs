// Lesson library: unlock via bus/end payload, counts, read state, persistence. Run: node tests/library.test.mjs
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const LIB = await import('../js/library.js');
const { bus } = await import('../js/bus.js');
let fails = 0, n = 0;
const eq = (a, b, m) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } };
const L = await LIB.lessons();
eq(L.length >= 40 && L.every((l) => l.id && l.title && l.text), true, `engine lessons loaded (${L.length})`);
LIB._reset();
eq(LIB.counts(), { have: 0, total: L.length, fresh: 0 }, 'empty library');
bus.emit('lesson', { ids: [L[0].id, L[1].id] });
bus.emit('lesson', { id: L[2].id });
eq(LIB.unlock([{ id: L[0].id }, 'not-a-lesson']), ['not-a-lesson'], 'dedupe; unknown ids stored but not counted');
eq(LIB.counts(), { have: 3, total: L.length, fresh: 3 }, 'counts');
LIB.markRead(L[1].id);
eq([LIB.isNew(L[0].id), LIB.isNew(L[1].id), LIB.isUnlocked(L[5].id)], [true, false, false], 'new/read/locked');
eq(JSON.parse(store['rr2-library']).ids.length, 4, 'persisted');
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} library tests passed`); process.exit(fails ? 1 : 0);
