// Unit tests for js/flags.js (Node). Run: node tests/flags.test.mjs
import * as F from '../js/flags.js';
let fails = 0, n = 0;
const eq = (a, b, msg) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', msg, JSON.stringify(a), '≠', JSON.stringify(b)); } };
const D = { board2d: 'auto', recover: true, rivals: false, rewind: false, recap2: false, afterwin: false }; // T6 adds four practice/summary flags
const store = (raw) => ({ getItem: (k) => (k === 'rr2-flags' ? raw : null) });

F._resetForTests({ search: '', storage: store(null) });
eq(F.allFlags(), D, 'defaults');
F._resetForTests({ search: '', storage: store('{"board2d":"on","recover":false}') });
eq([F.flag('board2d'), F.flag('recover')], ['on', false], 'storage override');
F._resetForTests({ search: '?ff=board2d:on,-recover', storage: store(null) });
eq([F.flag('board2d'), F.flag('recover')], ['on', false], '?ff=board2d:on,-recover');
F._resetForTests({ search: '?ff=board2d:off', storage: store('{"board2d":"on"}') });
eq(F.flag('board2d'), 'off', 'URL beats storage');
F._resetForTests({ search: '?ff=recover', storage: store('{"recover":false}') });
eq(F.flag('recover'), true, 'bare name = true');
F._resetForTests({ search: '?ff=board2d:maybe,board2d,-board2d,nope:1', storage: store('{"board2d":"sometimes","recover":"x"}') });
eq(F.allFlags(), D, 'invalid values ignored');
F._resetForTests({ search: '', storage: store('{bad json') });
eq(F.allFlags(), D, 'corrupt rr2-flags ignored');
F._resetForTests({ search: '', storage: store('[1,2]') });
eq(F.flag('board2d'), 'auto', 'non-object rr2-flags ignored');
F._resetForTests({ search: '', storage: '{"board2d":"on"}' });
eq(F.flag('board2d'), 'on', 'raw JSON string as storage');
F._resetForTests({ search: '', storage: store(null) });
const a = F.allFlags(); a.board2d = 'on'; eq(F.flag('board2d'), 'auto', 'allFlags returns a copy');
// T6 §8.1: PRACTICE_ONLY flags are forced off for ranked configs, whatever ?ff= says
F._resetForTests({ search: '?ff=rewind,afterwin,rivals', storage: store(null) });
eq([F.flagFor('rewind', { mode: 'free' }), F.flagFor('afterwin', { mode: 'free', learn: true })], [true, true], 'flagFor: free / learn follow the flag');
eq(['daily', 'weekly', 'challenge'].map((m) => F.flagFor('rewind', { mode: m })), [false, false, false], 'flagFor rewind: ranked modes forced off');
eq([F.flagFor('afterwin', { mode: 'free', resultId: 'r1' }), F.flagFor('rivals', { mode: 'daily' })], [false, true], 'flagFor: resultId counts as ranked; rivals is not practice-only');
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
