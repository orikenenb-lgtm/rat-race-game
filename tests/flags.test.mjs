// Unit tests for js/flags.js (Node). Run: node tests/flags.test.mjs
import * as F from '../js/flags.js';
let fails = 0, n = 0;
const eq = (a, b, msg) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', msg, JSON.stringify(a), '≠', JSON.stringify(b)); } };
const store = (raw) => ({ getItem: (k) => (k === 'rr2-flags' ? raw : null) });

F._resetForTests({ search: '', storage: store(null) });
eq(F.allFlags(), { board2d: 'auto', recover: true }, 'defaults');
F._resetForTests({ search: '', storage: store('{"board2d":"on","recover":false}') });
eq([F.flag('board2d'), F.flag('recover')], ['on', false], 'storage override');
F._resetForTests({ search: '?ff=board2d:on,-recover', storage: store(null) });
eq([F.flag('board2d'), F.flag('recover')], ['on', false], '?ff=board2d:on,-recover');
F._resetForTests({ search: '?ff=board2d:off', storage: store('{"board2d":"on"}') });
eq(F.flag('board2d'), 'off', 'URL beats storage');
F._resetForTests({ search: '?ff=recover', storage: store('{"recover":false}') });
eq(F.flag('recover'), true, 'bare name = true');
F._resetForTests({ search: '?ff=board2d:maybe,board2d,-board2d,nope:1', storage: store('{"board2d":"sometimes","recover":"x"}') });
eq(F.allFlags(), { board2d: 'auto', recover: true }, 'invalid values ignored');
F._resetForTests({ search: '', storage: store('{bad json') });
eq(F.allFlags(), { board2d: 'auto', recover: true }, 'corrupt rr2-flags ignored');
F._resetForTests({ search: '', storage: store('[1,2]') });
eq(F.flag('board2d'), 'auto', 'non-object rr2-flags ignored');
F._resetForTests({ search: '', storage: '{"board2d":"on"}' });
eq(F.flag('board2d'), 'on', 'raw JSON string as storage');
F._resetForTests({ search: '', storage: store(null) });
const a = F.allFlags(); a.board2d = 'on'; eq(F.flag('board2d'), 'auto', 'allFlags returns a copy');
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
