// chat_rules.js — the in-room chat rules, 1:1 with the SQL draft supabase/migrations/20261126_admin_mod_chat.sql (game.chat_lists,
// game.chat_norm, game.chat_fold, game.chat_check, rr_room_chat_send). The SQL is the authority in production; this file is the same
// rules for the offline fake (tests/fakeroom.mjs) and the tests (tests/chat_rules.test.mjs runs every case through BOTH and checks that
// LISTS equals the JSON between CHAT_LISTS_BEGIN / CHAT_LISTS_END in the SQL). Pure: no I/O, no clock.
// Not imported by index.ts (chat is SQL-only); safe to ship next to it.

export const CHAT = Object.freeze({
  maxLen: 120, burst: 5, burstMs: 10e3, hourly: 60, hourMs: 3600e3, keepMs: 7 * 86400e3, afterEndMs: 30 * 60e3,
  listMax: 40, hiddenWindow: 100, reportsPerHour: 20,
});
/** Quick phrases (gender-neutral) — always offered by the client; they pass the filter like any message. */
export const QUICK = Object.freeze(['בהצלחה!', 'מהלך יפה 👏', 'רגע, אני חושב/ת', 'משחק טוב 🤝']);
export const REFUSALS = Object.freeze(['chat_empty', 'chat_too_long', 'chat_email', 'chat_link', 'chat_phone', 'chat_handle', 'chat_bad_word']);

export const LISTS = Object.freeze({
  exact: ['ass', 'dick', 'cock', 'fag', 'sex', 'sexy', 'kys', 'stfu', 'wtf', 'idiot', 'stupid', 'moron', 'loser', 'dumb', 'porn', 'nude', 'nudes',
    'זין', 'זיין', 'חרא', 'תמות', 'טיפש', 'טיפשה', 'סתום', 'סתומה', 'מניאק', 'מניאקית', 'כוסית', 'זונות'],
  part: ['fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'dickhead', 'motherf',
    'pussy', 'wank', 'porno', 'שרמוט', 'זונה', 'כוסאמ', 'כוסעמ', 'כוסאחת', 'מזדיינ', 'לזיינ', 'זיינת', 'מטומטמ', 'דביל', 'מפגר', 'אידיוט', 'תתאבד',
    'בנזונה', 'חתיכתחרא'],
  phrase: ['kill yourself', 'kill urself', 'go die', 'shut up', 'לך תמות', 'תלך תמות', 'סתום את הפה', 'סתום תפה', 'בן זונה', 'כוס אמא', 'כוס אמק', 'כוס אמך',
    'יא חרא', 'יא זבל', 'יא מפגר'],
  platform: ['instagram', 'insta', 'snapchat', 'snap', 'tiktok', 'tik tok', 'telegram', 'whatsapp', 'whats app', 'discord', 'facebook', 'אינסטגרם', 'אינסטה',
    'סנאפצט', 'סנאפ', 'סנפצט', 'טיקטוק', 'טלגרם', 'וואטסאפ', 'ווטסאפ', 'וואצאפ', 'ווצאפ', 'ווטצאפ', 'דיסקורד', 'פייסבוק'],
});

const tr = (s, from, to) => { const a = [...from], b = [...to]; const m = new Map(a.map((c, i) => [c, b[i]])); return [...s].map((c) => (m.has(c) ? m.get(c) : c)).join(''); };
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const LO = 'abcdefghijklmnopqrstuvwxyz01234567890123456789';
/** = game.chat_norm */
export function norm(p) {
  return tr(String(p ?? '').normalize('NFKC').replace(/[­֑-ׇ​-‏‪-‮⁠-⁩﻿]/g, '').replace(/[\u0001-\u001F\u007F]/g, ' '), UP, LO);
}
/** = game.chat_fold */
export function fold(p) {
  return tr(p, '0134578@$!|ךםןףץ', 'oieastbasiiכמנפצ').replace(/[^a-zא-ת]+/g, ' ').replace(/([a-zא-ת])\1+/g, '$1').trim();
}
const F = (x) => fold(norm(x));
let folded = null;
const lists = () => (folded ||= { exact: LISTS.exact.map(F), part: LISTS.part.map(F), phrase: LISTS.phrase.map(F), platform: LISTS.platform.map(F) });
// PostgreSQL ARE `\s` = [[:space:]]; JS `\s` is wider (U+FEFF, U+2028 …). Use the ASCII + NFKC-surviving whitespace both agree on.
const S = '[ \\t\\n\\r\\f\\v\\u1680\\u2000-\\u200a\\u2028\\u2029\\u205f\\u3000\\u0085]';
const RE = {
  email: /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/,
  scheme: /(https?:|www\.|:\/\/)/,
  domain: new RegExp(`[a-z0-9-]${S}*(\\.|\\(dot\\)|\\[dot\\]|${S}dot${S})${S}*(com|net|org|il|co|io|me|gg|ly|app|xyz|info|biz|tv|ru|us|uk|de|fr|link|site|online|club|top|to|cc|be|ws|live|gl|ai|so|sh)([^a-z0-9]|$)`),
  sep: new RegExp(`(${S}|[().\\-_/*#])`, 'g'),
  handle: new RegExp(`@${S}*[^ \\t\\n\\r\\f\\v]`),
};
/** = game.chat_check → null (ok) or the refusal code. */
export function check(text) {
  const raw = String(text ?? '');
  if (btrim(raw) === '') return 'chat_empty';
  if ([...btrim(raw)].length > CHAT.maxLen) return 'chat_too_long';
  const t = norm(raw);
  if (btrim(t) === '') return 'chat_empty';
  if (RE.email.test(t)) return 'chat_email';
  if (RE.scheme.test(t) || RE.domain.test(t)) return 'chat_link';
  // a phone number, not an amount: Israeli 0… (9+ digits, also 00… abroad), 972… (11+), or + and 8+ digits; separators between the digits
  // do not help. Plain amounts (1500000, 1 500 000, 3000000000) pass.
  { const d = t.replace(RE.sep, ''); if (/\+[0-9]{8,}/.test(d) || /(^|[^0-9])(0|972)[0-9]{8,}/.test(d)) return 'chat_phone'; }
  if (RE.handle.test(t)) return 'chat_handle';
  const w = fold(t); const L = lists(); const sp = ` ${w} `; const squash = w.replace(/ /g, '');
  if (L.platform.some((p) => sp.includes(` ${p} `) || ([...p].length >= 5 && squash.includes(p)))) return 'chat_handle';
  if (L.phrase.some((p) => sp.includes(` ${p} `))) return 'chat_bad_word';
  const toks = w === '' ? [] : w.split(' ');
  let run = '';
  for (const tok of [...toks, '']) {
    if ([...tok].length === 1) { run += tok; continue; }
    for (const x of [run.replace(/([a-z\u05D0-\u05EA])\1+/g, '$1'), tok]) if (x !== '' && (L.exact.includes(x) || L.part.some((q) => x.includes(q)))) return 'chat_bad_word';
    run = '';
  }
  return null;
}
/** PostgreSQL btrim(x): spaces only. */
const btrim = (x) => x.replace(/^ +| +$/g, '');
/** The text that is checked and stored (= rr_room_chat_send v_t: control characters → one space, then btrim). */
export const clean = (text) => btrim(String(text ?? '').replace(/[\u0001-\u001F\u007F]+/g, ' '));
