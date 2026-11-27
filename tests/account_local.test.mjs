#!/usr/bin/env node
// js/account.js — which local keys a successful account deletion removes (node, no browser).
//   * every key js/saves.js sweeps and every literal 'rr…' storage key in js/ is classified: server-linked (always removed),
//     device progress (removed when "למחוק גם את ההתקדמות במכשיר הזה" is on) or a kept preference — a new key must be classified here;
//   * ranked slots (result ids, daily/weekly/challenge) and their backups / quarantined copies are server-linked; free / learning /
//     history / practice-branch slots are device progress; preferences (settings, flags, renderer fallback, chat mute) always stay;
//   * clearLocal() on an injected storage removes exactly that, plus the one-shot resume config in sessionStorage.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as A from '../js/account.js';

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('✔ ' + name); } catch (e) { failed++; console.log('✘ ' + name + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
const mem = (o = {}) => { const m = new Map(Object.entries(o)); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

const classified = (k) => A.isServerKey(k) || A.isDeviceKey(k) || A.KEPT_KEYS.includes(k) || A.SESSION_REMOVED.includes(k) || A.SESSION_KEPT.includes(k);
test('every storage key named in js/ is classified (server-linked / device progress / kept preference)', () => {
  const src = readdirSync(new URL('../js/', import.meta.url), { recursive: true }).filter((f) => f.endsWith('.js') && !f.startsWith('content'))
    .map((f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')).join('\n');
  const keys = new Set([...src.matchAll(/'(rr2?-[a-z][a-z0-9-]*[a-z0-9:-])'/g)].map((m) => m[1]).filter((k) => !/^rr-flat-|^rr2-(save|bak|quarantine)/.test(k)));
  const bad = [...keys].filter((k) => !classified(k));
  assert.deepEqual(bad, [], 'unclassified keys: ' + bad.join(', '));
  assert.ok(keys.size >= 20, 'found ' + keys.size + ' keys');
});
test('js/saves.js SWEEP_KEYS are all classified; rr-player and rr2-pending-finish are server-linked; rr2-progress is device progress', () => {
  const s = readFileSync(new URL('../js/saves.js', import.meta.url), 'utf8');
  const sweep = [...s.slice(s.indexOf('const SWEEP_KEYS'), s.indexOf('/** never evicted')).matchAll(/\['([^']+)'/g)].map((m) => m[1]).map((k) => (k === 'PENDING' ? 'rr2-pending-finish' : k));
  assert.ok(sweep.length >= 12);
  for (const k of sweep) assert.ok(classified(k), k);
  for (const k of ['rr-player', 'rr2-pending-finish', 'rr2-seen-chal', 'rr2-room-last', 'rr2-room-pending']) assert.ok(A.isServerKey(k), k);
  for (const k of ['rr2-progress', 'rr2-energy', 'rr2-library', 'rr2-ghosts', 'rr2-branches', 'rr2-last-game']) { assert.ok(!A.isServerKey(k), k); assert.ok(A.isDeviceKey(k), k); }
  for (const k of A.KEPT_KEYS) { assert.ok(!A.isServerKey(k) && !A.isDeviceKey(k), k); }
});
const SLOTS = { ranked: ['rr2-save-0b9c4a3e-1111-4222-8333-944455556666', 'rr2-save-daily-w1-12345', 'rr2-save-weekly-w2-99', 'rr2-save-challenge-w3-7'],
  device: ['rr2-save-free-w1', 'rr2-save-learn-w2', 'rr2-save-history-covid', 'rr2-save-history-seed-5', 'rr2-save-branch-w1'] };
test('slots: ranked (result id, daily / weekly / challenge) = server-linked incl. backups + quarantine; free / learn / history / branch = device', () => {
  for (const k of SLOTS.ranked) for (const w of [k, 'rr2-bak:' + k, 'rr2-quarantine:' + k]) assert.ok(A.isServerKey(w), w);
  for (const k of SLOTS.device) for (const w of [k, 'rr2-bak:' + k, 'rr2-quarantine:' + k]) { assert.ok(!A.isServerKey(w), w); assert.ok(A.isDeviceKey(w), w); }
  assert.ok(A.isServerKey('rr2-quarantine:rr-player'), 'a quarantined copy of the identity (holds the secret)');
  assert.ok(!A.isServerKey('rr2-quarantine:rr2-progress') && A.isDeviceKey('rr2-quarantine:rr2-progress'));
});
const FULL = () => mem({ 'rr-player': '{"id":"x","secret":"s","nickname":"טסט"}', 'rr2-progress': '{}', 'rr2-pending-finish': '[]', 'rr2-energy': '{}', 'rr2-settings': '{"muted":true}',
  'rr2-flags': '{}', 'rr2-fallback': '{}', 'rr2-chat-mute': '1', 'rr2-onboarded': '1', 'rr2-seen-chal': '{}', 'rr2-room-last': 'r', 'rr2-ref': 'abc',
  [SLOTS.ranked[0]]: '{}', ['rr2-bak:' + SLOTS.ranked[0]]: '{}', [SLOTS.device[0]]: '{}', ['rr2-bak:' + SLOTS.device[0]]: '{}', 'rr2-quarantine:rr-player': '{}',
  'other-site-key': 'keep', 'sb-auth-token': 'keep' });
test('clearLocal({device:false}) removes only the server-linked keys; progress, saves and preferences stay; other apps\' keys stay', () => {
  const st = FULL(), ss = mem({ 'rr2-resume-once': '{}', 'rr2-conn': 'tab-1' });
  const out = A.clearLocal({ device: false, storage: st, session: ss });
  assert.deepEqual(out.sort(), ['rr-player', 'rr2-pending-finish', 'rr2-seen-chal', 'rr2-room-last', SLOTS.ranked[0], 'rr2-bak:' + SLOTS.ranked[0], 'rr2-quarantine:rr-player'].sort());
  for (const k of ['rr2-progress', 'rr2-energy', 'rr2-settings', SLOTS.device[0], 'other-site-key', 'sb-auth-token', 'rr2-onboarded']) assert.ok(st._m.has(k), k);
  assert.ok(!ss._m.has('rr2-resume-once') && ss._m.has('rr2-conn'));
});
test('clearLocal({device:true}) also removes progress, energy, every slot + backup + quarantine; preferences and other apps\' keys stay', () => {
  const st = FULL(); A.clearLocal({ device: true, storage: st, session: mem() });
  assert.deepEqual([...st._m.keys()].sort(), ['other-site-key', 'rr2-chat-mute', 'rr2-fallback', 'rr2-flags', 'rr2-settings', 'sb-auth-token'].sort());
});
test('a storage that throws (blocked site data) does not throw', () => {
  const bad = { get length() { throw new Error('SecurityError'); }, key() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.deepEqual(A.clearLocal({ device: true, storage: bad, session: bad }), []);
});
test('deleteSectionHtml escapes the nickname and has labels for the nickname field and the checkbox (checked by default)', () => {
  const h = A.deleteSectionHtml('<b>"x"</b>', { idp: 't' });
  assert.ok(!h.includes('<b>"x"</b>') && h.includes('&lt;b&gt;&quot;x&quot;&lt;/b&gt;'));
  assert.match(h, /<label for="tNick">/); assert.match(h, /id="tNick"/); assert.match(h, /<input type="checkbox" id="tDev" name="device" checked/);
  assert.ok(h.includes(A.STR.devL) && h.includes(A.STR.h));
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
