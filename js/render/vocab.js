// T5 §10.1 — the shared visual vocabulary of both renderers (3D scene.js, 2D board2d.js) and the in-game UI.
// Pure data + pure helpers: no DOM, no three, no engine import (Node-importable; tests/render_vocab.test.mjs).
// Every visual concept that both renderers draw goes through here, so 3D and 2D cannot disagree (R-2).

/** Motion tokens in ms (= the CSS --dur-* vars). Only MOTION_EXCEPTIONS may exceed tmax (A-8). */
export const MOTION = Object.freeze({ t1: 120, t2: 200, t3: 350, t4: 480, tmax: 600, dice: 1200, hop: 160, hopSquash: 90, celebrate: 1200, confetti: 2400,
  spawn: 480, despawn: 300, dust: 400, label: 600, sparkle: 600, bump: 450, pulse: 300, shake: 300, pipFill: 200, kitPop: 120, badge: 600, intro: 600 });
export const MOTION_EXCEPTIONS = Object.freeze(['dice', 'celebrate', 'confetti']);

/** Float-label colours on the #fffaf0 pill — every one ≥ 4.5:1 (T5 §2.1). Single source for 3D and 2D. */
export const LABEL_COLORS = Object.freeze({ green: '#13744a', red: '#b8322a', blue: '#2459b8', gold: '#8a5a00', pink: '#be185d' });
/** Old raw colours that callers still pass → their contrast-safe replacement. */
export const LABEL_ALIASES = Object.freeze({ '#db2777': '#be185d', '#178a55': '#13744a', '#d23b30': '#b8322a', '#2f6fdb': '#2459b8', '#a8740a': '#8a5a00' });
export function labelColor(c) {
  if (!c) return LABEL_COLORS.green;
  const k = String(c).toLowerCase();
  return LABEL_COLORS[k] || LABEL_ALIASES[k] || c;
}

/**
 * World identity (T5 §3): sky, board, edge, centre, decor, accent fill, text-safe accent ink [light, dark], plinth rim,
 * 2D motif and centre caption. The board/sky values are the themes in js/worlds/*.js (h = the sepia HISTORY_THEME).
 */
export const WORLD_STYLE = Object.freeze({
  w1: { name: 'השכונה', mood: 'late afternoon', sky: ['#ffd9a0', '#ff9f7a'], board: '#f6efe2', edge: '#6b4430', center: '#efe3cb', decor: 'trees', accent: '#f2b632', accentInk: ['#8a5a00', '#f2b632'], rim: '#f2b632', rimGlow: false, motif: 'dots', caption: 'התיק שלך' },
  w2: { name: 'העיר הגדולה', mood: 'dusk neon', sky: ['#1e2a4a', '#ff7e67'], board: '#3b4252', edge: '#1f2433', center: '#2e3440', decor: 'skyline', accent: '#ff4fd8', accent2: '#22d3ee', accentInk: ['#9d1784', '#ff4fd8'], rim: '#ff4fd8', rimGlow: true, motif: 'neon', caption: 'העיר שלך' },
  w3: { name: 'הנמל הגלובלי', mood: 'noon by the sea', sky: ['#7dd3fc', '#e0f2fe'], board: '#e9d5a8', edge: '#8b5e34', center: '#f3e3bf', decor: 'sea', accent: '#0ea5e9', accentInk: ['#0b5f78', '#38bdf8'], rim: '#0ea5e9', rimGlow: false, motif: 'waves', caption: 'הנמל שלך' },
  w4: { name: 'עמק העתיד', mood: 'night aurora', sky: ['#050816', '#1b1f4b'], board: '#e8f1ff', edge: '#94a3b8', center: '#dbeafe', decor: 'stars', accent: '#22d3ee', accent2: '#a78bfa', accentInk: ['#6d28d9', '#22d3ee'], rim: '#22d3ee', rimGlow: true, motif: 'stars', caption: 'העמק שלך' },
  // T5 verify A-36 / D7: the history board is aged newsprint #daceb8 (was #efe4c8): ΔE76 12.7 to w1 and w3 (was 8.9 / 11.0), 23.3 to w4
  h: { name: 'מכונת הזמן', mood: 'sepia newspaper', sky: ['#efe2c4', '#c9b089'], board: '#daceb8', edge: '#5b4127', center: '#e6d6b0', decor: 'history', accent: '#c8a24a', accentInk: ['#7a5520', '#c8a24a'], rim: '#c8a24a', rimGlow: false, motif: 'news', caption: 'התיק שלך' },
});
/** world object or id → its WORLD_STYLE entry (history mode → h; unknown → w1). */
export function worldStyle(w) {
  const id = w && typeof w === 'object' ? (w.mechanic === 'history' ? 'h' : w.id) : w;
  return WORLD_STYLE[id] || WORLD_STYLE.w1;
}

/** Character colours (T5 §3.1): portrait token fill and the pawn ring / 2D token border. Distinct within each world. */
export const CHAR_STYLE = Object.freeze({
  teacher: '#d9485f', driver: '#3a7bd5', dev: '#7b5cd6', doctor: '#1f9d8a',
  lawyer: '#4b5563', chef: '#e8833a', pm: '#2a9df4',
  importer: '#c2410c', exporter: '#4d7c0f', captain: '#0e7490',
  founder: '#db2777', engineer: '#64748b', social: '#16a34a',
});
export const CHAR_FALLBACK = '#a8763e';

/** Business growth stages (= T3 §6.8). */
export const STAGE_LABELS = Object.freeze(['התחלה', 'יציב', 'צומח', 'מותג']);
/** Business archetype → icon-atlas cell (3D sign) and emoji (2D corner). */
export const ARCHETYPE_ICON = Object.freeze({ coffee: 'cup', laundromat: 'washer', toyshop: 'box', pizza: 'pizza', app: 'phone' });
export const ARCHETYPE_EMOJI = Object.freeze({ coffee: '☕', laundromat: '🧺', toyshop: '📦', pizza: '🍕', app: '📱' });
/** Activity → icon-atlas cell (3D badge), emoji (2D badge) and text (modal / accessible name, T5-A1…A5). */
export const ACTIVITY_ICON = Object.freeze({ busy: 'people', competitor: 'rival', breakdown: 'wrench', stockout: 'emptybox', season: 'garland', trouble: 'alert' });
export const ACTIVITY_EMOJI = Object.freeze({ busy: '👥', competitor: '🏪', breakdown: '🔧', stockout: '📭', season: '🎉', trouble: '⚠' });
export const ACTIVITY_TEXT = Object.freeze({ busy: 'יש תור', competitor: 'מתחרה חדש בסביבה', breakdown: 'תקלה בציוד', stockout: 'המלאי אזל', season: 'עונה חמה', trouble: 'העסק בבעיה' });
/** Trouble beats activity: the order in which one badge is chosen (T5 §5.2 "at most one badge per item"). */
export const ACTIVITY_ORDER = Object.freeze(['trouble', 'breakdown', 'stockout', 'competitor', 'busy', 'season', 'event']);

/** City model name → 2D emoji (moved unchanged from board2d.js CITY_ICON, T1§2.4). Keys may carry 'dir/'. */
export const CITY_EMOJI = Object.freeze({ apartment: '🏢', business: '🏪', stock: '📈', crypto: '🪙', bank: '🏦', tower: '🏙️', mall: '🛍️', hotel: '🏨', ship: '🚢', warehouse: '📦',
  factory: '🏭', gold: '🥇', campus: '🏫', datacenter: '🖥️', rocket: '🚀', foundation: '💗', home_family: '🏡', wedding: '💍', university: '🎓', pension: '🏝️',
  index_fund: '📊', side_hustle: '🛠️', hospital: '🏥', skyline: '🏙️', crane: '🏗️', turbine: '🌬️', time_machine: '🕰️', ticker_board: '📊' });
export function cityEmoji(model) { const name = String(model || '').split('/').pop(); return CITY_EMOJI[name] || '🏠'; }

/** Kind labels for city entries that are not world `kinds` (holdings, angels, the foundation, life items). */
export const KIND_FALLBACK = Object.freeze({ holding: 'השקעה', angel: 'השקעת אנג׳ל', foundation: 'קרן', life: 'חיים' });

/** Hints by stage (T5-H0…H3) and for upgrades (T5-HU). */
const HINTS = ['כדי להתייצב: רווח ממוצע חיובי לאורך 3 חודשים.', 'כדי לצמוח: להרחיב, לגייס עובדים או להגדיל את המכירות.',
  'כדי להפוך למותג: שנה של פעילות, מנהל או שווי גבוה, והרחבה.', 'זה השלב הכי גבוה. העסק מכניס גם כשאתה לא שם.'];
const HINT_UP = 'אפשר לשדרג במשבצת "שדרוג" בלוח.';

const int = (x, d = 0) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : d);
/** Normalise a level object (T5 §5.1) → a safe copy, or null when it carries nothing to draw. */
export function normLevel(level) {
  if (!level || typeof level !== 'object') return null;
  if (level.kind === 'biz') {
    const n = Math.max(0, Math.min(3, int(level.n, -1)));
    if (!Number.isFinite(Number(level.n))) return null;            // no stage data (A-16): plinth only
    return { kind: 'biz', n, of: 3, label: STAGE_LABELS[n], type: level.type || null, activity: level.activity || null, trouble: !!level.trouble };
  }
  if (level.kind === 'upgrade') {
    const of = Math.max(1, Math.min(6, int(level.of, 2)));
    return { kind: 'upgrade', n: Math.max(0, Math.min(of, int(level.n))), of, activity: null, trouble: false };
  }
  return null;
}
/** T5-L0/L1/L2 */
export function levelText(level) {
  const L = normLevel(level); if (!L) return '';
  if (L.kind === 'upgrade') return `שדרוגים: ${L.n} מתוך ${L.of}`;
  return L.n === 0 ? 'בהתחלה · עוד לא יציב' : `שלב ${L.n} מתוך 3 · ${L.label}`;
}
/** T5-H0…H3 / T5-HU */
export function levelHint(level) {
  const L = normLevel(level); if (!L) return '';
  if (L.kind === 'upgrade') return L.n < L.of ? HINT_UP : '';
  return HINTS[L.n];
}
/** '●●○' — 2D pips (visual only, aria-hidden). */
export function pipsText(level) {
  const L = normLevel(level); if (!L) return '';
  return '●'.repeat(L.n) + '○'.repeat(L.of - L.n);
}
/** The one activity key to show for a level (trouble beats activity), or null. */
export function activityOf(level) {
  const L = normLevel(level); if (!L) return null;
  if (L.trouble) return 'trouble';
  const a = L.activity; if (!a || typeof a !== 'object') return null;
  for (const k of ACTIVITY_ORDER) if (a[k]) return ACTIVITY_ICON[k] ? k : null;
  return null;
}
/** T5-C2 accessible name of a city card: `{label} · {kindLabel}` (+ `, ` level text) (+ `, ` activity text). */
export function cardName(label, kindLabel, level) {
  let s = [label, kindLabel].filter(Boolean).join(' · ');
  const lt = levelText(level); if (lt) s += ', ' + lt;
  const a = activityOf(level); if (a) s += ', ' + ACTIVITY_TEXT[a];
  return s;
}
/** Which procedural stage-kit parts a level shows (T5 §5.2 table) — the 3D renderer and the tests read the same table. */
export function kitParts(level) {
  const L = normLevel(level); const p = { scaffold: false, cone: false, sign: false, annex: false, flag: false, glow: false, band: false, dome: false, people: 0, scale: 1, signBig: false };
  if (!L) return p;
  if (L.kind === 'upgrade') { p.band = L.n >= 1; p.dome = L.n >= 2; return p; }
  const busy = !!(L.activity && L.activity.busy);
  if (L.n === 0) { p.scaffold = true; p.cone = true; p.scale = 0.8; }
  if (L.n >= 1) p.sign = true;
  if (L.n >= 2) { p.annex = true; p.people = busy ? 3 : 0; }
  if (L.n >= 3) { p.flag = true; p.glow = true; p.signBig = true; p.scale = 1.12; p.people = busy ? 5 : 0; }
  return p;
}

/** The `?fx=levels` dev fixture (T5 §13, §8.2 "mixed levels"): items 0–3 businesses at stages 0–3 (two busy), 4–5 upgrades 1/2 and 2/2, rest plain. */
export function fixtureLevels(count = 24) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let level = null;
    if (i < 4) level = { kind: 'biz', n: i, of: 3, label: STAGE_LABELS[i], type: ['coffee', 'laundromat', 'pizza', 'app'][i], activity: i === 2 || i === 3 ? { busy: true } : (i === 1 ? { stockout: true } : null) };
    else if (i < 6) level = { kind: 'upgrade', n: i - 3, of: 2 };
    out.push(level);
  }
  return out;
}

/** kind label of a city entry: world.kinds[kind].label, else KIND_FALLBACK, else by the model name (life/… → חיים). */
export function kindLabelOf(w, kind, model) {
  const ks = (w && w.kinds) || {};
  if (kind && ks[kind]) return ks[kind].label;
  if (kind && KIND_FALLBACK[kind]) return KIND_FALLBACK[kind];
  const m = String(model || '');
  if (m.startsWith('life/')) return KIND_FALLBACK.life;
  const k = Object.entries((w && w.models) || {}).find(([, v]) => v === m.split('/').pop());
  if (k && ks[k[0]]) return ks[k[0]].label;
  if (Object.values((w && w.tickers) || {}).some((t) => t.model === m)) return KIND_FALLBACK.holding;
  return '';
}
/** `?fx=levels[:N]` fixture entries for a world: [{key:'fx<i>', model, label, kind, level}] (same in 3D and 2D). */
export function fixtureCity(w, count = 24) {
  const n = Math.max(1, Math.min(64, count | 0)); const lv = fixtureLevels(n); const M = (w && w.models) || {};
  const biz = M.biz || M.side || 'business';
  const ups = Object.keys((w && w.upgrade && w.upgrade.kinds) || {});
  const plain = [...new Set([...Object.values(M).filter(Boolean), ...Object.values((w && w.tickers) || {}).map((t) => t.model).filter(Boolean)])];
  return lv.map((level, i) => {
    const kind = i < 4 ? (M.biz ? 'biz' : 'side') : (i < 6 && ups[i - 4] ? ups[i - 4] : null);
    const model = kind ? (M[kind] || biz) : plain[i % Math.max(1, plain.length)] || 'business';
    return { key: 'fx' + i, model, label: i < 4 ? ['עגלת קפה', 'מכבסה', 'פיצרייה', 'אפליקציה'][i] : 'נכס ' + (i + 1), kind, level: i < 6 && (i < 4 || ups[i - 4]) ? level : null };
  });
}
/** parse `?fx=levels[:N]` → N or 0 */
export function fixtureCount(search) { const m = /[?&]fx=levels(?::(\d+))?/.exec(search || ''); return m ? Math.max(1, Math.min(64, +(m[1] || 24))) : 0; }
