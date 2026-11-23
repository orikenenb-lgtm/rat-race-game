// One money formatter for the whole game (worlds wave 0, DESIGN §4.6). Pure, no imports, part of the pinned engine.
//
//   money(n, 'full')   ₪1,234,567,890            sheets, details, receipts (every agora rounded to a whole ₪)
//   money(n, 'card')   ₪850,000 / ₪1.25 מיליון / ₪1.25 מיליארד   = the engine's fmtM (byte-identical below ₪999.5M) + מיליארד
//   money(n, 'short')  ₪850 / ₪850 אלף / ₪12.5 מיליון / ₪1.2 מיליארד   3 significant digits (HUD, lists, map)   alias 'dense'
//   money(n, 'tiny')   ₪850 / ₪850K / ₪12.5M / ₪1.25B                 ≤ 6 characters for n ≥ 0 (3D float labels)   alias 'chip'
//   opts.iso = true    wraps the result in a first-strong isolate (U+2068 … U+2069) for RTL text
// Negative numbers use U+2212 (−) everywhere. Money in state is integer ₪; nothing here changes a stored value.

const MINUS = '−';
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** "1.50" → "1.5", "2.00" → "2", "12.0" → "12" (the fmtM trimming rule). */
const trim = (s) => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const sign = (n) => (n < 0 ? MINUS : '');

/** ₪1,234 / −₪1,234 (whole shekels). */
export function moneyFull(n) { const r = Math.round(n); return (r < 0 ? MINUS : '') + '₪' + groups(Math.abs(r)); }

/** The card form: below ₪1M = full; ₪1M–₪999.5M = "₪x מיליון" (fmtM rule: 2 decimals < 10, 1 < 100, 0 ≥ 100); above = "₪x מיליארד". */
export function moneyCard(n) {
  const a = Math.abs(n);
  if (a < 1e6) return moneyFull(n);
  const big = a >= 999.5e6;   // fmtM would have printed "₪1000 מיליון" from here on
  const v = big ? a / 1e9 : a / 1e6;
  const s = trim(v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  return sign(n) + '₪' + s + (big ? ' מיליארד' : ' מיליון');
}

const TIERS = [[1e9, ' מיליארד', 'B'], [1e6, ' מיליון', 'M'], [1e3, ' אלף', 'K']];
/** 3 significant digits of v (1 ≤ v < 1000), as a trimmed string; may round up to "1000". */
function sig3(v) { return trim(v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)); }
function tiered(n, word) {
  const a = Math.abs(Math.round(n));
  if (a < 1000) return sign(n) + '₪' + a;
  for (let i = 0; i < TIERS.length; i++) {
    const [unit, he, en] = TIERS[i];
    if (a < unit) continue;
    let s = sig3(a / unit);
    if (s === '1000' && i > 0) { s = '1'; return sign(n) + '₪' + s + (word ? TIERS[i - 1][1] : TIERS[i - 1][2]); } // 999,999 → ₪1 מיליון
    return sign(n) + '₪' + s + (word ? he : en);
  }
  return sign(n) + '₪' + a;
}
/** Dense: 3 significant digits with a Hebrew unit word. */
export function moneyShort(n) { return tiered(n, true); }
/** Chip: ≤ 6 characters (non-negative) — K / M / B. */
export function moneyTiny(n) { return tiered(n, false); }

/** money(n, form = 'card', {iso}) — see the header. Unknown forms fall back to 'card'. Non-finite → '₪—'. */
export function money(n, form = 'card', opts = null) {
  let s;
  if (typeof n !== 'number' || !Number.isFinite(n)) s = '₪—';
  else if (form === 'full') s = moneyFull(n);
  else if (form === 'short' || form === 'dense') s = moneyShort(n);
  else if (form === 'tiny' || form === 'chip') s = moneyTiny(n);
  else s = moneyCard(n);
  return opts && opts.iso ? '⁨' + s + '⁩' : s;
}
/** Signed card form: +₪700 / −₪900 (the engine's sgn). */
export function moneySigned(n, form = 'card') { return (Math.round(n) > 0 ? '+' : '') + money(n, form); }
export const MONEY_FORMS = ['full', 'card', 'short', 'tiny'];
