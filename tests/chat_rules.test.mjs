#!/usr/bin/env node
// The JS mirror of the chat rules (supabase/functions/room/chat_rules.js, used by the offline fake) against the SQL draft
// (supabase/migrations/20261126_admin_mod_chat.sql): the word lists are the same JSON, every row of tests/chat_cases.mjs gives the
// expected code, the quick phrases pass, and the limits match the SQL text. (The same cases run through the SQL itself in
// tests/admin_chat_sql.test.mjs on PGlite, and over HTTP in tests/admin_chat_contract.mjs on the fake and the local stack.)
//   node tests/chat_rules.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../supabase/functions/room/chat_rules.js';
import { CASES } from './chat_cases.mjs';

const SQL = readFileSync(new URL('../supabase/migrations/20261126_admin_mod_chat.sql', import.meta.url), 'utf8');
let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`✔ ${name}`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } };

test('LISTS === the JSON between CHAT_LISTS_BEGIN / CHAT_LISTS_END in the SQL', () => {
  const m = /-- CHAT_LISTS_BEGIN\n'(.*)'::jsonb\n-- CHAT_LISTS_END/s.exec(SQL); assert.ok(m, 'markers');
  assert.deepEqual(JSON.parse(m[1]), JSON.parse(JSON.stringify(R.LISTS)));
});
test(`every row of tests/chat_cases.mjs (${CASES.length}) → the expected code`, () => {
  const bad = CASES.filter(([t, want]) => R.check(R.clean(t)) !== want).map(([t, want]) => `${JSON.stringify(t)} → ${R.check(R.clean(t))} (want ${want})`);
  assert.deepEqual(bad, []);
});
test('the quick phrases pass the filter and are gender-neutral (no ה/ת/ית suffix-only forms)', () => {
  for (const q of R.QUICK) assert.equal(R.check(q), null, q);
  assert.deepEqual([...R.QUICK], ['בהצלחה!', 'מהלך יפה 👏', 'רגע, אני חושב/ת', 'משחק טוב 🤝']);
});
test('limits in the SQL text = CHAT (120 chars, 5 / 10 s, 60 / hour, 7 days, 30 min after the end, 40 per list, 100 hidden window, 20 reports / h)', () => {
  assert.match(SQL, /char_length\(text\) between 1 and 120/); assert.match(SQL, /> 120 then return 'chat_too_long'/);
  assert.match(SQL, /interval '10 seconds'\)\s*>= 5/); assert.match(SQL, /interval '1 hour'\)\s*>= 60/);
  assert.equal((SQL.match(/interval '7 days'/g) || []).length >= 4, true); assert.match(SQL, /interval '30 minutes'/);
  assert.match(SQL, /order by id desc limit 40/); assert.match(SQL, /order by id desc limit 100\) x where x.hidden/); assert.match(SQL, /\)\s*>= 20 then raise exception 'rate_limited'/);
  assert.deepEqual([R.CHAT.maxLen, R.CHAT.burst, R.CHAT.burstMs, R.CHAT.hourly, R.CHAT.keepMs, R.CHAT.afterEndMs, R.CHAT.listMax, R.CHAT.hiddenWindow, R.CHAT.reportsPerHour],
    [120, 5, 10e3, 60, 7 * 86400e3, 30 * 60e3, 40, 100, 20]);
});
test('clean(): control characters → one space, spaces trimmed (= btrim), nothing else changes', () => {
  assert.equal(R.clean('  שלום\n\nלכולם  '), 'שלום לכולם'); assert.equal(R.clean('\tא'), 'א'); assert.equal(R.clean(' 👏 '), '👏');
});
test('norm / fold: NFKC, invisible marks, niqqud, Arabic-Indic digits, finals, leet, repeats', () => {
  assert.equal(R.norm('ＡＢＣ'), 'abc'); assert.equal(R.norm('a​b'), 'ab'); assert.equal(R.norm('מְטוּמְטָם'), 'מטומטם'); assert.equal(R.norm('٠٥٤'), '054');
  assert.equal(R.fold('sh1t'), 'shit'); assert.equal(R.fold('b!tch'), 'bitch'); assert.equal(R.fold('זיין'), 'זינ'); assert.equal(R.fold('fuuuck you'), 'fuck you');
});
test('every refusal code has Hebrew text in js/net.js ERR', () => {
  const net = readFileSync(new URL('../js/net.js', import.meta.url), 'utf8');
  for (const c of [...R.REFUSALS, 'banned', 'chat_closed', 'not_admin', 'cannot_ban_self', 'cannot_kick_self', 'not_banned', 'bad_reason', 'msg_not_found', 'cannot_report_self',
    'room_not_open', 'player_not_in_room']) assert.match(net, new RegExp(`\\b${c}: '[^']*[\\u05D0-\\u05EA]`), c);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
