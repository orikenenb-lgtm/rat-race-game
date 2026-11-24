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
  // worlds wave 1 — w5 עיר התיירות (docs/full-upgrade/worlds/w5-tourism.md "Visual language"): golden-hour beach, sky #ffd6a5 → #48cae4,
  // coral accent #ff7a59, ink #9a3412, palms, 🌴. The doc's sand #f3e2c0 is ΔE76 7.6 from w3's sand and 9.6 from h (rule: ≥ 10), so
  // the board is the warmer peach sand #fdd5b8 (ΔE 11.1 to w3, 12.6 to h, 17.1 to w1); the engine theme's #f3e2c0 is legacy only.
  w5: { name: 'עיר התיירות', mood: 'golden hour beach', sky: ['#ffd6a5', '#48cae4'], board: '#fdd5b8', edge: '#9a3412', center: '#fbe9c9', decor: 'palms', accent: '#ff7a59', accent2: '#48cae4', accentInk: ['#9a3412', '#ff9f7f'], rim: '#ff7a59', rimGlow: false, motif: 'palms', caption: 'המפרץ שלך', sea: '#2ec4d6' },
  // worlds wave 2 — w6 אזור התעשייה (docs/full-upgrade/worlds/w6-industry.md "Visual language"): industrial morning haze, sky #cfd8dc →
  // #f5f0e6, steel edge #4b5563, safety orange #f97316, ink #9a3412, chimneys (decor 'stacks'), 🏭. The doc's concrete #d6d3cd is ΔE76 9.2
  // from h's newsprint (rule: ≥ 10), so the board is a cooler concrete #c9cbcc (ΔE 13.3 to h, 15.0 to w4, 15.3 to w1, 23.6 to w5); the
  // engine theme's #d6d3cd is legacy only. The dark accent ink is #fb923c (w5 already owns #ff9f7f).
  w6: { name: 'אזור התעשייה', mood: 'industrial morning haze', sky: ['#cfd8dc', '#f5f0e6'], board: '#c9cbcc', edge: '#4b5563', center: '#e7e5e4', decor: 'stacks', accent: '#f97316', accent2: '#fbbf24', accentInk: ['#9a3412', '#fb923c'], rim: '#f97316', rimGlow: false, motif: 'gears', caption: 'המפעל שלך' },
  // worlds wave 3 — w7 רשתות המסחר (docs/full-upgrade/worlds/w7-retail.md "Visual language"): a shopping street in the evening, sky
  // #2b2d42 → #ef8354, red / white awnings #e63946, ink #9b1c24, decor 'storefronts', 🛍️. The doc's paving #efe6dd is ΔE76 3.6 from w1's
  // board (rule: ≥ 10), so the board is a blush paving #f1d5d0 (ΔE 11.4 to w1 and h, 13.0 to w6, 13.6 to w5); the engine theme's #efe6dd
  // is legacy only. The UI fill (css body[data-world=w7] --accent) is the lighter #ec5562 so --ink on it stays ≥ 4.5; 3D keeps #e63946.
  w7: { name: 'רשתות המסחר', mood: 'shopping street at dusk', sky: ['#2b2d42', '#ef8354'], board: '#f1d5d0', edge: '#9b1c24', center: '#f9e8e4', decor: 'storefronts', accent: '#e63946', accent2: '#ffd166', accentInk: ['#9b1c24', '#ff8a93'], rim: '#e63946', rimGlow: false, motif: 'bags', caption: 'הרשת שלך' },
  // w8 מטרופולין הנדל"ן (docs/full-upgrade/worlds/w8-metropolis.md): a building site under a clear sky, sky #fde68a → #93c5fd, caution
  // yellow #eab308, ink #854d0e, decor 'cranes' (w3's crane.glb in the background, procedural cranes on every project), 🏗️. The doc's
  // concrete #e5e7eb is ΔE76 6.5 from w4's board, so the board is a cool concrete #d6d1e6 (ΔE 11.3 to w6, 11.9 to w4, 16.3 to w7).
  w8: { name: 'מטרופולין הנדל"ן', mood: 'building site, clear sky', sky: ['#fde68a', '#93c5fd'], board: '#d6d1e6', edge: '#854d0e', center: '#ebe8f3', decor: 'cranes', accent: '#eab308', accent2: '#93c5fd', accentInk: ['#854d0e', '#facc15'], rim: '#eab308', rimGlow: false, motif: 'cranes', caption: 'הפרויקטים שלך' },
  // worlds wave 4 — w9 מדבר האנרגיה (docs/full-upgrade/worlds/w9-energy.md "Visual language"): desert noon, sky #fef3c7 → #fbbf24 haze,
  // ochre dunes #e9c46a (ΔE76 ≥ 25 from every world), the deep-blue panels #1e3a8a, electric cyan #06b6d4 (ink #155e75 / dark #67e8f9 —
  // w4 owns #22d3ee), decor 'solar' (panel rows, w4's turbine.glb on the ridge, pylons with current pulses ∝ output), ☀️⚡.
  w9: { name: 'מדבר האנרגיה', mood: 'desert noon', sky: ['#fef3c7', '#fbbf24'], board: '#e9c46a', edge: '#92400e', center: '#f6e7b8', decor: 'solar', accent: '#06b6d4', accent2: '#1e3a8a', accentInk: ['#155e75', '#67e8f9'], rim: '#06b6d4', rimGlow: false, motif: 'solar', caption: 'התחנות שלך', panels: '#1e3a8a' },
  // w10 מרכז הפיננסים (docs/full-upgrade/worlds/w10-finance.md): a glass tower at blue hour, sky #0f172a → #3b82f6, a navy board #1e293b
  // (ΔE76 11.8 to w2's slate, ≥ 66 to the rest), gold #d4af37 (ink #7a5a0a / dark #facc15 — the doc's #a16207 is 3.8 on --paper3), decor 'towers' with a ticker ribbon that
  // flashes red on a margin call (still under reduced motion), 🏦📊.
  w10: { name: 'מרכז הפיננסים', mood: 'glass towers at blue hour', sky: ['#0f172a', '#3b82f6'], board: '#1e293b', edge: '#0f172a', center: '#334155', decor: 'towers', accent: '#d4af37', accent2: '#3b82f6', accentInk: ['#7a5a0a', '#facc15'], rim: '#d4af37', rimGlow: true, motif: 'ticker', caption: 'המשרד שלך' },
  // w13 אצטדיון הכוכבים (docs/full-upgrade/worlds/w13-stadium.md): a night match under floodlights, sky #0b1020 → #1e3a8a, the pitch board
  // #166534 (ΔE76 ≥ 49 from every world), edge #14532d, the club red #dc2626 (ink #7f1d1d / dark #fca5a5; the UI fill is the lighter #f05252 so
  // --ink on it stays ≥ 4.5), decor 'floodlights' (four masts with lamp heads, still — nothing moves, also under reduced motion), ⚽🏟️.
  w13: { name: 'אצטדיון הכוכבים', mood: 'night match under floodlights', sky: ['#0b1020', '#1e3a8a'], board: '#166534', edge: '#14532d', center: '#15803d', decor: 'floodlights', accent: '#dc2626', accent2: '#f8fafc', accentInk: ['#7f1d1d', '#fca5a5'], rim: '#dc2626', rimGlow: true, motif: 'pitch', caption: 'המועדון שלך' },
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
  hotelier: '#0e7490', restaurateur: '#e8833a', promoter: '#c026d3',   // w5
  opseng: '#0f766e', heir: '#b45309', trader: '#475569',                // w6
  shopFounder: '#be123c', cfo: '#1d4ed8', franchisor: '#7c3aed',        // w7
  developer: '#ca8a04', landowner: '#4d7c0f', contractor: '#ea580c',    // w8
  gridEng: '#0891b2', infraFund: '#1e3a8a', kibbutz: '#65a30d',         // w9
  allocator: '#a16207', blockHeir: '#7c2d12', floorTrader: '#be123c',   // w10
  coachOwner: '#15803d', localTycoon: '#b91c1c', academyDirector: '#65a30d',   // w13
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
  index_fund: '📊', side_hustle: '🛠️', hospital: '🏥', skyline: '🏙️', crane: '🏗️', turbine: '🌬️', time_machine: '🕰️', ticker_board: '📊',
  // w5 model keys (procedural stand-ins in 3D, js/render/kit3d.js RESORT_KIT; no .glb files)
  hotel_beach: '🏨', resort: '🏝️', spa: '♨️', conference: '🏛️', waterpark: '🌊', apartments: '🏘️', restaurant: '🍽️', dive_center: '🤿', staff_housing: '🏢',
  // w6 model keys (procedural stand-ins in 3D, js/render/standins3d.js; no .glb files). warehouse keeps its 📦.
  factory_cnc: '⚙️', factory_plastic: '🧴', factory_food: '🥫', factory_recycle: '♻️', factory_metal: '🔩', factory_pack: '📦',
  // w7 / w8 model keys (procedural stand-ins in 3D, js/render/standins3d.js; no .glb files). w7's warehouse (the DC) keeps its 📦.
  store_street: '🏪', store_mall: '🛍️', store_outlet: '🏷️', store_airport: '✈️', stock_pallets: '📦', ecom_hub: '🌐', regional_office: '🏢',
  tower_build: '🏗️', logistics_build: '🚚', office_build: '🏢', plot_fence: '🚧', tower_done: '🏙️',
  // w9 / w10 model keys (procedural stand-ins in 3D, js/render/standins910.js; no .glb files)
  solar_field: '☀️', wind_farm: '🌬️', battery_yard: '🔋', solar_storage: '🔆', pylon_line: '🗼', h2_pilot: '🧪', grid_slot: '🔌', desert_plot: '🏜️',
  stone_block: '🧱', vault: '🔒', glass_tower: '🏦',
  // w13 model keys (procedural stand-ins in 3D, js/render/standins13.js; no .glb files)
  stadium: '🏟️', billboard: '📣', club_shop: '🧣' });
export function cityEmoji(model) { const name = String(model || '').split('/').pop(); return CITY_EMOJI[name] || '🏠'; }


/** Kind labels for city entries that are not world `kinds` (holdings, angels, the foundation, life items). */
export const KIND_FALLBACK = Object.freeze({ holding: 'השקעה', angel: 'השקעת אנג׳ל', foundation: 'קרן', life: 'חיים' });

/** Hints by stage (T5-H0…H3) and for upgrades (T5-HU). */
const HINTS = ['כדי להתייצב: רווח ממוצע חיובי לאורך 3 חודשים.', 'כדי לצמוח: להרחיב, לגייס עובדים או להגדיל את המכירות.',
  'כדי להפוך למותג: שנה של פעילות, מנהל או שווי גבוה, והרחבה.', 'זה השלב הכי גבוה. העסק מכניס גם כשאתה לא שם.'];
const HINT_UP = 'אפשר לשדרג במשבצת "שדרוג" בלוח.';

const int = (x, d = 0) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : d);
/** w6 condition light (plant.js cityModels condLight): the words a light stands for (light + pips: never colour alone). */
export const PLANT_LIGHTS = Object.freeze(['green', 'amber', 'red']);
export const PLANT_LIGHT_HE = Object.freeze({ green: 'תקין', amber: 'שחוק', red: 'במצב ירוד' });
export const PLANT_LIGHT_COLOR = Object.freeze({ green: '#22c55e', amber: '#f59e0b', red: '#ef4444', off: '#6b7280' });
/** w7 branch ramp stages (chain.js cityModels stage 0–4: 0 = fit-out, 4 = mature) and w8 build words. */
export const BRANCH_STAGE_HE = Object.freeze(['בשיפוץ', 'נפתח', 'בהרצה', 'כמעט בשל', 'בשל']);
const clampN = (x, a, b, d) => Math.max(a, Math.min(b, int(x, d)));
const frac = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(1, Math.round(Number(x) * 100) / 100)) : 0);
/** w9 energy stages (energy.js cityModels stage: 0 permit / slot / plot, 1–3 build, 4 operating, 5 a failed hydrogen pilot) and techs. */
export const ENERGY_STAGE_HE = Object.freeze(['בהיתרים', 'בבנייה', 'בבנייה', 'בבנייה', 'מחוברת ומייצרת', 'נסגר']);
export const ENERGY_TECH_HE = Object.freeze({ solar: 'שדה סולארי', wind: 'חוות רוח', storage: 'אגירת סוללות', hybrid: 'סולארי עם אגירה', line: 'קו הולכה', h2: 'פיילוט מימן', slot: 'חיבור לרשת', site: 'קרקע לפרויקט' });
export const OFFTAKE_HE = Object.freeze({ ppa: 'חוזה PPA', merchant: 'שוק חופשי', line: 'תעריף מפוקח' });
/** w10 liquidity classes (portfolio.js cityModels cls): the words a block's look stands for (glass / stone / vault — never colour alone). */
export const LIQ_CLASSES = Object.freeze(['daily', 'monthly', 'locked']);
export const LIQ_HE = Object.freeze({ daily: 'נזיל תוך יומיים', monthly: 'נזילות חודשית', locked: 'נעול' });
export const LIQ_COLOR = Object.freeze({ daily: '#7dd3fc', monthly: '#d6c7a1', locked: '#475569' });
/** w13 (league.js cityModels): the club's tier words, the stadium's works (stage 0 none / 1 / 2 of the expansion) and the age bands of a player token. */
export const DIV_HE = Object.freeze(['הדרג השלישי', 'הדרג השני', 'הדרג הראשון']);
export const AGE_BAND = Object.freeze([[21, 'young', 'צעיר'], [24, 'rising', 'עולה'], [28, 'prime', 'בשיא'], [30, 'late', 'אחרי השיא'], [99, 'vet', 'ותיק']]);
/** a player's age → its band {id, he} (the token's age ring; the same bands as the market value's age factor) */
export function ageBand(age) { const a = Number(age) || 0; const b = AGE_BAND.find((x) => a <= x[0]) || AGE_BAND[AGE_BAND.length - 1]; return { id: b[1], he: b[2] }; }
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
  if (level.kind === 'occ') {   // w5: occupancy decile of an op-asset (season.js cityModels), a closed asset, a closed wing
    const closed = !!level.closed;
    const n = closed ? 0 : Math.max(0, Math.min(10, int(level.n, 0)));
    const pct = closed ? 0 : Math.max(0, Math.min(100, Number.isFinite(Number(level.occ)) ? Math.round(Number(level.occ) * 100) : n * 10));
    return { kind: 'occ', n, of: 10, pct, occ: pct / 100, closed, wing: !!level.wing, activity: null, trouble: false };   // occ kept: normLevel(normLevel(x)) = normLevel(x)
  }
  if (level.kind === 'plant') {   // w6: a production line (plant.js cityModels): condition pips 1–3 + light, running / down / ordered / mothballed
    const n = Math.max(1, Math.min(3, int(level.n, 2)));
    const light = PLANT_LIGHTS.includes(level.light) ? level.light : n >= 3 ? 'green' : n === 2 ? 'amber' : 'red';
    const cond = Number.isFinite(Number(level.cond)) ? Math.max(0, Math.min(100, Math.round(Number(level.cond)))) : null;
    const pending = !!level.pending, mothball = !pending && !!level.mothball, down = !pending && !mothball && !!level.down;
    const util = Number.isFinite(Number(level.util)) ? Math.max(0, Math.round(Number(level.util) * 1000) / 1000) : 0;
    const running = !pending && !mothball && !down && level.running !== false && util > 0;
    const shift = Math.max(1, Math.min(3, int(level.shift, 1)));
    const hazard = ['low', 'mid', 'high'].includes(level.hazard) ? level.hazard : null;
    return { kind: 'plant', n, of: 3, light, cond, running, down, pending, mothball, util, shift, hazard, activity: down ? { breakdown: true } : null, trouble: false };
  }
  if (level.kind === 'branch') {   // w7: a branch (chain.js cityModels): ramp stage 0–4 (0 = fit-out), own / franchise, over-span flicker, stock-out
    const fitout = !!level.fitout; const n = fitout ? 0 : clampN(level.n, 1, 4, 1);
    const stockout = !fitout && !!level.stockout && level.own !== false;
    return { kind: 'branch', n, of: 4, own: level.own !== false, fitout, flicker: !fitout && !!level.flicker && level.own !== false, stockout, count: clampN(level.count, 1, 40, 1),
      activity: stockout ? { stockout: true } : null, trouble: false };
  }
  if (level.kind === 'stock') {   // w7: the chain's pooled stock (months of sales on hand → 0–4 pallet stacks)
    const cover = Number.isFinite(Number(level.cover)) ? Math.max(0, Math.round(Number(level.cover) * 100) / 100) : null;
    const n = cover == null ? 0 : Math.max(0, Math.min(4, Math.round(cover * 1.5)));
    return { kind: 'stock', n, of: 4, cover, short: cover != null && cover < 0.6, activity: cover != null && cover < 0.6 ? { stockout: true } : null, trouble: false };
  }
  if (level.kind === 'mgr') return { kind: 'mgr', n: 0, of: 0, links: clampN(level.links, 1, 12, 6), activity: null, trouble: false };   // w7: a regional manager (6 branches)
  if (level.kind === 'build') {   // w8 (projects.js cityModels): a project (permit / stages 1–4, floors, stalled, crane, presold), a rental block, a fenced plot
    const plot = !!level.plot, rental = !plot && !!level.rental;
    const permit = !plot && !rental && !!level.permit;
    const n = plot ? 0 : rental ? 4 : permit ? 0 : clampN(level.n, 1, 4, 1);
    const pct = rental ? 1 : plot || permit ? 0 : frac(level.pct);
    const stalled = !plot && !rental && !!level.stalled;
    return { kind: 'build', n, of: 4, pct, floors: plot ? 0 : clampN(level.floors, 0, 60, Math.round(pct * 20)), stalled, crane: !plot && !rental && !permit && !stalled && level.crane !== false,
      permit, presold: plot || rental ? 0 : frac(level.presold), rental, plot, activity: null, trouble: false };
  }
  if (level.kind === 'energy') {   // w9 (energy.js cityModels): a project (permit 0 / build 1–3), a plant (4), a grid slot, a plot, the hydrogen pilot (5 = failed)
    const tech = Object.prototype.hasOwnProperty.call(ENERGY_TECH_HE, level.tech) ? level.tech : 'solar';
    const slot = tech === 'slot' || !!level.slot, plot = !slot && (tech === 'site' || !!level.fence);
    const n = slot || plot ? 0 : clampN(level.n, 0, 5, 0);
    const op = n === 4; const down = op && !!level.down;
    const out = op ? Math.max(0, Math.min(1.5, Math.round((Number.isFinite(Number(level.output)) ? Number(level.output) : 1) * 100) / 100)) : 0;
    const stalled = !op && !slot && !plot && n < 4 && !!level.stalled;
    return { kind: 'energy', n, of: 4, tech, pct: op ? 1 : slot || plot ? 0 : frac(level.pct), units: clampN(level.units, 1, 12, 3), unconnected: !op && !plot && (slot || !!level.unconnected),
      stalled, crane: !op && !slot && !plot && n >= 1 && n <= 3 && !stalled && level.crane !== false, output: down ? 0 : out, offtake: op ? (OFFTAKE_HE[level.offtake] ? level.offtake : 'merchant') : null,
      stake: Math.max(0.1, Math.min(1, Number.isFinite(Number(level.stake)) ? Math.round(Number(level.stake) * 100) / 100 : 1)), down, spike: op && !!level.spike, slot, plot, failed: tech === 'h2' && n === 5,
      activity: down ? { breakdown: true } : null, trouble: false };
  }
  if (level.kind === 'hold') {   // w10 (portfolio.js cityModels): a block per holding — its liquidity class, value, a margin call (daily), a frozen fund, a lock
    const cls = LIQ_CLASSES.includes(level.cls) ? level.cls : 'daily';
    const value = Number.isFinite(Number(level.value)) ? Math.max(0, Math.round(Number(level.value))) : 0;
    const n = value <= 0 ? 0 : Math.max(1, Math.min(6, Math.round(Math.log10(Math.max(1, value / 1e6)) * 2.2) + 1));   // 1–6 floors: ₪1M → 1 … ₪100M+ → 6
    return { kind: 'hold', n, of: 6, cls, value, call: cls === 'daily' && !!level.call, frozen: cls === 'monthly' && !!level.frozen, lockUntil: cls === 'locked' && Number.isFinite(Number(level.lockUntil)) ? int(level.lockUntil) : null,
      activity: null, trouble: false };   // a margin call is named in the level text (never "העסק בבעיה")
  }
  if (level.kind === 'club') {   // w13 (league.js cityModels): the stadium — seats, the expansion's stage, fill, tier, rank, floodlights, training ground, academy
    const stage = clampN(level.stage, 0, 2, 0);
    return { kind: 'club', n: stage, of: 2, seats: Math.max(0, int(level.seats, 20000)), stage, expanded: clampN(level.expanded, 0, 2, 0), fill: frac(level.fill), div: clampN(level.div, 0, 2, 1),
      rank: clampN(level.rank, 1, 8, 4), floodlights: level.floodlights !== false, training: !!level.training, academy: !!level.academy, activity: null, trouble: false };
  }
  if (level.kind === 'sponsor') return { kind: 'sponsor', n: level.expired ? 0 : 1, of: 1, expired: !!level.expired, activity: null, trouble: false };   // w13: a billboard; an ended contract goes dark
  return null;
}
/** T5-L0/L1/L2 */
export function levelText(level) {
  const L = normLevel(level); if (!L) return '';
  if (L.kind === 'upgrade') return `שדרוגים: ${L.n} מתוך ${L.of}`;
  if (L.kind === 'occ') return L.closed ? 'סגור עכשיו' : `תפוסה ${L.pct}%${L.wing ? ' · אגף סגור' : ''}`;
  if (L.kind === 'plant') {
    if (L.pending) return 'בדרך: הקו עוד לא הגיע';
    const st = `מצב ${L.cond != null ? L.cond + ' · ' : ''}${PLANT_LIGHT_HE[L.light]}`;
    if (L.mothball) return `${st} · מושבת זמנית`;
    if (L.down) return `${st} · בתקלה, לא מייצר`;
    return `${st} · ${L.running ? `ניצולת ${Math.round(L.util * 100)}%` : 'עומד בלי הזמנות'}${L.shift > 1 ? ` · ${L.shift} משמרות` : ''}`;
  }
  if (L.kind === 'branch') {
    if (L.fitout) return 'בשיפוץ: עוד לא נפתח';
    return `שלב ${L.n} מתוך 4 · ${BRANCH_STAGE_HE[L.n]}${L.own ? '' : ' · זכיינות'}${L.count > 1 ? ` · ${L.count} סניפים` : ''}${L.flicker ? ' · מעבר ליכולת הניהול' : ''}`;
  }
  if (L.kind === 'stock') return L.cover == null ? 'מלאי: אין סניפים פתוחים' : `מלאי ל־${Math.round(L.cover * 10) / 10} חודשי מכירות${L.short ? ' · כמעט נגמר' : ''}`;
  if (L.kind === 'mgr') return `מנהל אזור · מחזיק ${L.links} סניפים`;
  if (L.kind === 'build') {
    if (L.plot) return 'מגרש: עוד אין פרויקט';
    if (L.rental) return 'בניין גמור · מושכר';
    if (L.permit) return 'ממתין להיתר בנייה';
    return `בבנייה: ${Math.round(L.pct * 100)}% · שלב ${L.n} מתוך 4${L.stalled ? ' · העבודה עומדת' : ''}${L.presold ? ` · ${Math.round(L.presold * 100)}% נמכרו על הנייר` : ''}`;
  }
  if (L.kind === 'energy') {
    if (L.slot) return 'חיבור פנוי לרשת · מחכה לפרויקט';
    if (L.plot) return 'קרקע לפרויקט · עוד לא התחילו';
    if (L.tech === 'h2') return L.failed ? 'הפיילוט נסגר' : L.n === 4 ? 'הפיילוט הצליח' : 'פיילוט בניסוי';
    if (L.n === 4) return `מחוברת ומייצרת${L.down ? ' · מושבתת החודש' : ` · תפוקה ${Math.round(L.output * 100)}% מהרגיל`}${L.offtake ? ` · ${OFFTAKE_HE[L.offtake]}` : ''}${L.stake < 1 ? ` · ${Math.round(L.stake * 100)}% שלך` : ''}${L.spike ? ' · קפיצת מחיר' : ''}`;
    if (L.n === 0) return `בהיתרים${L.unconnected ? ' · בלי חיבור לרשת' : ''}`;
    return `בבנייה: ${Math.round(L.pct * 100)}% · שלב ${L.n} מתוך 3${L.stalled ? ' · העבודה עומדת' : ''}${L.unconnected ? ' · בלי חיבור לרשת' : ''}`;
  }
  if (L.kind === 'club') return `${DIV_HE[L.div]} · מקום ${L.rank} · ${L.seats.toLocaleString('en-US')} מקומות · תפוסה ${Math.round(L.fill * 100)}%${L.stage ? ` · מרחיבים את היציע: שלב ${L.stage} מתוך 2` : ''}${L.training ? ' · מתחם אימונים' : ''}${L.academy ? ' · אקדמיה' : ''}`;   // w13
  if (L.kind === 'sponsor') return L.expired ? 'החוזה נגמר · השלט כבוי' : 'חוזה חסות פעיל';
  if (L.kind === 'hold') return `${LIQ_HE[L.cls]}${L.call ? ' · קריאת מרווח' : ''}${L.frozen ? ' · קפוא החודש' : ''}${L.lockUntil != null ? ` · נעול עד חודש ${L.lockUntil}` : ''}`;
  return L.n === 0 ? 'בהתחלה · עוד לא יציב' : `שלב ${L.n} מתוך 3 · ${L.label}`;
}
/** T5-H0…H3 / T5-HU */
export function levelHint(level) {
  const L = normLevel(level); if (!L) return '';
  if (L.kind === 'upgrade') return L.n < L.of ? HINT_UP : '';
  if (L.kind === 'occ') return L.closed ? 'סגור החודש: אין הכנסה, אבל חלק מהעלויות הקבועות ממשיכות.' : 'החלונות הדלוקים = התפוסה. בעונה המלון מתמלא; בשפל מחיר נמוך ממלא חדרים.';
  if (L.kind === 'plant') return L.pending ? 'שילמת מקדמה. הקו מגיע אחרי חצי שנה, ורק אז מתחיל לייצר.' : L.mothball ? 'מושבת: משלם רק חלק מהעלויות הקבועות, המצב קפוא. אפשר להפעיל מחדש בלוח קווי הייצור.'
    : L.down ? 'הקו בתקלה: אין ייצור עד שהתיקון נגמר, והעלויות הקבועות ממשיכות.' : 'הנורה והנקודות = מצב הקו. מצב נמוך = יותר תקלות ושווי נמוך יותר. תחזוקה בלוח קווי הייצור.';
  if (L.kind === 'branch') return L.fitout ? 'חודשיים של שיפוץ: שכירות ושכר בלי מכירות. אחר כך חצי שנה של הרצה.' : L.flicker ? 'השלט מהבהב: יש יותר סניפים ממה שהמנהלים מחזיקים, וכל הסניפים מוכרים פחות. מנהל אזור — בלוח הרשת.'
    : L.own ? 'האורות בחזית = שלב ההרצה. סניף בשל (4 מתוך 4) מוכר במלואו.' : 'זכיין: פתח בכסף שלו ומשלם לך חלק מהמכירות. האיכות שלו — והמותג של כולם.';
  if (L.kind === 'stock') return 'משטחי המלאי = כמה חודשי מכירות יש במחסן. סחורה מגיעה אחרי חודשיים; יותר מדי מלאי נמכר בהנחה.';
  if (L.kind === 'mgr') return 'כל מנהל אזור מחזיק 6 סניפים. הקווים המאירים מחברים אותו לסניפים שלו.';
  if (L.kind === 'build') return L.plot ? 'מגרש בלי פרויקט: אפשר להתחיל פרויקט או למכור, בלוח הפרויקטים.' : L.rental ? 'הדירות שלא נמכרו נשארו אצלך להשכרה.'
    : L.permit ? 'עד ההיתר אין בנייה, והקרקע עולה מס ואגרות כל חודש.' : L.stalled ? 'הברזנט = העבודה עומדת (אין הון עצמי, אין מספיק מכירות, או עיכוב). הריבית ממשיכה לרוץ.'
    : 'הקומות והעגורן = ההתקדמות. השווי של בניין שלא נגמר = מה ששולם עליו.';
  if (L.kind === 'energy') return L.slot ? 'חיבור לרשת: בלעדיו הבנק לא מממן את הבנייה. פרויקט שמחכה לוקח אותו כשמתחילים לבנות.' : L.plot ? 'אפשר להתחיל פרויקט על הקרקע הזו בלוח התחנות.'
    : L.n === 4 ? 'הזרם בקווים = התפוקה. תחנה שעובדת אפשר לממן מחדש בלוח התחנות — כסף עכשיו, החזר גבוה יותר כל חודש.'
    : L.unconnected ? 'הכבל המנותק = אין חיבור לרשת. בלי חיבור הבנק לא מממן את הבנייה, והפרויקט נעצר.' : L.stalled ? 'העבודה עומדת: אין הון עצמי, אין חיבור או שהבנייה הושהתה. הריבית ממשיכה לרוץ.'
    : 'הפאנלים מצטרפים שורה אחרי שורה. עד החיבור לרשת אין הכנסה.';
  if (L.kind === 'club') return L.stage ? 'העגורן = מרחיבים את היציע: 15% פחות מקומות בזמן הבנייה, ו־40% יותר בסוף.' : 'הקהל ביציע = התפוסה. מקום גבוה בטבלה ממלא את היציע — ומעלה את ההכנסה.';   // w13
  if (L.kind === 'sponsor') return L.expired ? 'שלט כבוי = החוזה נגמר (או בוטל בשערורייה). אין עוד כסף ממנו.' : 'שלט דולק = החסות משלמת כל חודש עד סוף החוזה.';
  if (L.kind === 'hold') return L.cls === 'daily' ? 'זכוכית = נזיל: מניות וקרן מדד שאפשר למכור תוך יומיים. רצועת המניות מהבהבת באדום בקריאת מרווח.'
    : L.cls === 'monthly' ? 'אבן = נזילות חודשית: קרן שאפשר לפדות רק ביום המשכורת הבא (או מיד, בהנחה).' : 'כספת = נעול: השקעה פרטית שאי אפשר למכור מהר, ואי אפשר ללוות כנגדה.';
  return HINTS[L.n];
}
/** '●●○' — 2D pips (visual only, aria-hidden). */
export function pipsText(level) {
  const L = normLevel(level); if (!L) return '';
  if (L.kind === 'occ') { if (L.closed) return '🔒'; const k = Math.round(L.n / 2); return '▮'.repeat(k) + '▯'.repeat(5 - k); }   // 5 windows, each 2 deciles
  if (L.kind === 'plant' && L.pending) return '⏳';   // w6: an ordered line has no condition to show yet
  if (L.kind === 'branch' && L.fitout) return '🚧';   // w7: a branch in its fit-out
  if (L.kind === 'stock') return '▮'.repeat(L.n) + '▯'.repeat(4 - L.n);
  if (L.kind === 'mgr') return '';
  if (L.kind === 'build') { if (L.plot) return '🚧'; if (L.rental) return '🔑'; if (L.permit) return '📋'; }   // w8
  if (L.kind === 'energy') { if (L.slot) return '🔌'; if (L.plot) return '🏜️'; if (L.tech === 'h2') return L.failed ? '✖' : L.n === 4 ? '✔' : '🧪'; if (L.n === 0) return '📋'; if (L.n === 4) return L.down ? '⛔' : '▮'.repeat(Math.max(1, Math.min(3, Math.round(L.output * 3)))) + '▯'.repeat(3 - Math.max(1, Math.min(3, Math.round(L.output * 3)))); return '●'.repeat(L.n) + '○'.repeat(3 - L.n); }   // w9
  if (L.kind === 'hold') return L.cls === 'daily' ? '▮'.repeat(L.n) : L.cls === 'monthly' ? '▭'.repeat(L.n) : '🔒';   // w10
  if (L.kind === 'club') return L.stage ? '🏗️' : '▮'.repeat(Math.max(1, Math.round(L.fill * 5))) + '▯'.repeat(5 - Math.max(1, Math.round(L.fill * 5)));   // w13: the stands' fill in fifths
  if (L.kind === 'sponsor') return L.expired ? '○' : '●';
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
  if (L.kind === 'occ') { p.windows = L.n; p.closed = L.closed; p.wing = L.wing; return p; }   // drawn on the model itself (standins3d.js)
  if (L.kind === 'plant') { p.light = L.light; p.pips = L.n; p.conveyor = L.running; p.down = L.down; p.pending = L.pending; p.mothball = L.mothball; return p; }   // w6: on the model (standins3d.js paintPlant)
  if (L.kind === 'branch') { p.lights = L.n; p.fitout = L.fitout; p.flicker = L.flicker; p.franchise = !L.own; p.stockout = L.stockout; return p; }   // w7: on the model (paintBranch)
  if (L.kind === 'stock') { p.pallets = L.n; return p; }
  if (L.kind === 'mgr') { p.links = L.links; return p; }
  if (L.kind === 'energy') { p.units = L.units; p.pct = L.pct; p.stage = L.n; p.crane = L.crane; p.stalled = L.stalled; p.cable = L.unconnected; p.output = L.output; p.down = L.down; p.offtake = L.offtake; p.stake = L.stake; p.slot = L.slot; p.fence = L.plot; p.failed = L.failed; return p; }   // w9 (standins910.js paintEnergy)
  if (L.kind === 'hold') { p.cls = L.cls; p.floors = L.n; p.call = L.call; p.frozen = L.frozen; p.lock = L.lockUntil != null; return p; }   // w10 (paintHold)
  if (L.kind === 'club') { p.stage = L.stage; p.expanded = L.expanded; p.fill = L.fill; p.div = L.div; p.rank = L.rank; p.floodlights = L.floodlights; p.training = L.training; p.academy = L.academy; p.crane = L.stage > 0; return p; }   // w13 (standins13.js paintClub)
  if (L.kind === 'sponsor') { p.lit = !L.expired; return p; }   // w13 (paintBillboard)
  if (L.kind === 'build') { p.floors = L.floors; p.pct = L.pct; p.crane = L.crane; p.tarp = L.stalled; p.permit = L.permit; p.presold = L.presold; p.rental = L.rental; p.fence = L.plot; return p; }   // w8 (paintBuild)
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
