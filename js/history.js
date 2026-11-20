// "מכונת הזמן" — access to real historical data (js/data/real.js, written by the data lead).
// Contract of real.js: TAX_IL, SERIES{sp500,ta125,boiRate,cpiIL,homeIL,usdIls} = {start:'YYYY-MM', unit, values[], fidelity},
// SCENARIOS[{id,name,start,months,blurb,lesson,headlines[{ym,text}], index?}], seriesAt(name, ym), monthlyChange(name, ym).
// The engine never needs real.js for the 4 worlds: it is loaded lazily (loadRealData). Pure: no DOM / Math.random / Date.

let REAL = null;
let loading = null;
/**
 * Lazy-load js/data/real.js (36 KB of market series) — only history mode needs it (ARCHITECTURE A5).
 * Resolves to true when the data is available. Call (and await) before createGame({mode:'history'}).
 */
export function loadRealData() {
  if (REAL) return Promise.resolve(true);
  if (!loading) loading = import('./data/real.js').then((m) => { REAL = REAL || m; return true; }).catch(() => { loading = null; return false; });
  return loading;
}

/** Tests / tools: inject a real-data module (or a stub with the same shape). */
export function registerRealData(mod) { REAL = mod || null; }
export function realData() { return REAL; }
export function hasRealData() { return !!(REAL && scenariosRaw().length); }

function scenariosRaw() {
  if (!REAL) return [];
  const S = REAL.SCENARIOS || (REAL.default && REAL.default.SCENARIOS) || [];
  return Array.isArray(S) ? S : Object.entries(S).map(([id, v]) => ({ id, ...v }));
}
export function scenarioList() {
  if (!REAL) { loadRealData(); return []; } // starts the lazy load; the lobby can retry / await loadRealData()
  return scenariosRaw().map((s) => ({ id: s.id, name: s.name || s.title || s.id, start: normYm(s.start), months: s.months, blurb: s.blurb || '', lesson: s.lesson || '', index: s.index || 'sp500' }));
}
export function scenarioById(id) {
  const all = scenariosRaw();
  const s = all.find((x) => x.id === id) || all[0];
  return s ? { ...s, start: normYm(s.start), headlines: (s.headlines || []).map((h) => ({ ym: normYm(h.ym), text: h.text })) } : null;
}

/* ---------------------------------------------------------------- year-month helpers ('YYYY-MM') */
export function normYm(ym) {
  const m = String(ym || '').match(/^(\d{4})-?(\d{1,2})/);
  return m ? `${m[1]}-${String(+m[2]).padStart(2, '0')}` : String(ym || '');
}
export function addYm(ym, k) {
  const [y, m] = normYm(ym).split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function ymDiff(a, b) { const [ya, ma] = normYm(a).split('-').map(Number); const [yb, mb] = normYm(b).split('-').map(Number); return (yb * 12 + mb) - (ya * 12 + ma); }
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export function ymText(ym) { const [y, m] = normYm(ym).split('-').map(Number); return `${HE_MONTHS[m - 1]} ${y}`; }

/** Value of a monthly series at ym (clamped to the series range). Exact month index into SERIES — no Date, no interpolation. */
export function seriesAt(name, ym) {
  if (!REAL) return null;
  ym = normYm(ym);
  const S = REAL.SERIES && REAL.SERIES[name];
  if (S && S.values && S.values.length) {
    const i = Math.max(0, Math.min(S.values.length - 1, ymDiff(S.start, ym)));
    return +S.values[i];
  }
  if (typeof REAL.seriesAt === 'function') { const v = REAL.seriesAt(name, ym); if (v != null && Number.isFinite(+v)) return +v; }
  return null;
}
/** ₪amount at fromYm expressed in toYm prices (Israeli CPI), whole ₪. */
export function inflate(amount, fromYm, toYm) {
  const a = seriesAt('cpiIL', fromYm), b = seriesAt('cpiIL', toYm);
  return a && b ? Math.round(amount * b / a) : null;
}
