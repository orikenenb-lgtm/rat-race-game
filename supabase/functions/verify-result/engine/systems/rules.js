// js/systems/rules.js — which rule set (3 = exact v3, 4 = Next Level) a ranked game is played with, from its date key.
// Pure: no Date, no clock. The SAME logic runs in the client (createGame for daily/weekly/challenge) and in the verifier
// (supabase/functions/verify-result/verify_core.js rulesFor — a byte-for-byte duplicate, tested equal in tests/verify.test.mjs).
//
// THE RULE (CR-29): a ranked game's era is decided by ONE Israel calendar date, compared with RULES4_FROM:
//   daily     → the daily key (Israel date, 'YYYY-MM-DD')
//   weekly    → the Monday of the ISO week of the weekly key ('YYYY-Www'), as index.ts weekly_start = to_date(key,'IYYY-"W"IW')
//   challenge → the Israel date the challenge was created (index.ts challenge_day = created_at AT TIME ZONE 'Asia/Jerusalem')
// day < RULES4_FROM → rules 3, otherwise rules 4. A missing / unreadable key → rules 4 (the current game).

/** Israel date (YYYY-MM-DD) of the first day the v4 engine is live. Set at release (and in verify_core.js — tested equal). */
export const RULES4_FROM = '2026-12-07'; // a Monday: daily and weekly eras flip together (review B1)

/** Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant). */
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400); const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468; const era = Math.floor(z / 146097); const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400; const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); const d = doy - Math.floor((153 * mp + 2) / 5) + 1; const m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
}
const p2 = (n) => String(n).padStart(2, '0');
/** Monday of ISO week `w` of ISO year `y` → 'YYYY-MM-DD'. */
export function isoWeekStart(y, w) {
  const jan4 = daysFromCivil(y, 1, 4); const dow = ((jan4 + 3) % 7 + 7) % 7; // 0 = Monday (1970-01-01 was a Thursday)
  const [Y, M, D] = civilFromDays(jan4 - dow + (w - 1) * 7);
  return `${Y}-${p2(M)}-${p2(D)}`;
}
/** A date key → 'YYYY-MM-DD' or null. Accepts 'YYYY-MM-DD', 'YYYYMMDD', 'YYYY-Www' (ISO week → its Monday). */
export function dayOf(key) {
  if (key == null) return null;
  const s = String(key);
  const w = /^(\d{4})-?W(\d{1,2})$/i.exec(s.trim());
  if (w) { const wk = +w[2]; return wk >= 1 && wk <= 53 ? isoWeekStart(+w[1], wk) : null; }
  const m = /(\d{4})-?(\d{2})-?(\d{2})/.exec(s); return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** The rule set for a ranked game whose date key is `key` (see THE RULE above). */
export function rulesForDay(key) { const d = dayOf(key); return d && d < RULES4_FROM ? 3 : 4; }
