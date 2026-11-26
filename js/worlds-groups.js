// The 6 worlds (עולמות) of מירוץ העכברים and the maps (מפות) inside them — the ONE source of truth for the map's chapters and the unlock order.
// Owner request 2026-11-25: "תחלק את המפות לעולמות — כל עולם 4 עד 5 מפות מקסימום". Every level (w1…w25) is now a מפה; the maps are grouped
// into 6 עולמות in this exact order. js/progress.js computes unlocks from ORDER (linear: finishing a map opens the next BUILT map in order —
// the next map of the same world, or the first map of the next world); js/lobby.js draws the chapters; js/ui.js names a map "מפה N · <world>".
// Pure module (no imports, no DOM): the client's unlock rule replaces js/worlds/meta.js `unlock` (that graph stays for the engine lane's
// validator / tests until it is aligned — see docs/full-upgrade/GROUPS.md). Names of built maps come from meta.js; PLANNED holds the
// names / lines of the maps that are not in meta.js yet (shown as "בקרוב", never playable, skipped by the unlock rule).

export const WORLD_GROUPS = Object.freeze([
  { id: 'g1', n: 1, name: 'הצעדים הראשונים', icon: '🌱', learn: 'היסודות: נכס מול התחייבות, ריבית, דולר וסבלנות.', maps: ['w1', 'w2', 'w3', 'w4'] },
  { id: 'g2', n: 2, name: 'עולם העסקים', icon: '🏭', learn: 'לנהל עסק: עונות, מכונות, סניפים, בנייה בשלבים ותשתית.', maps: ['w5', 'w6', 'w7', 'w8', 'w9'] },
  { id: 'g3', n: 3, name: 'הכסף הגדול', icon: '💰', learn: 'תיק השקעות, גיוס הון, מכירות פומביות וגידור.', maps: ['w10', 'w15', 'w13', 'w16'] },
  { id: 'g4', n: 4, name: 'הענקים', icon: '🏛️', learn: 'תאגידים: חברות־בנות בחו״ל, פטנטים, בנק וערבויות בקבוצה.', maps: ['w11', 'w17', 'w14', 'w12'] },
  { id: 'g5', n: 5, name: 'השווקים', icon: '📈', learn: 'ביטוח, הנפקה בבורסה, קרנות ורכישות במינוף.', maps: ['w18', 'w19', 'w20', 'w21'] },
  { id: 'g6', n: 6, name: 'הפסגה', icon: '🏔️', learn: 'עיר חדשה, מסחר עולמי, תקציב של מדינה וקונגלומרט.', maps: ['w22', 'w23', 'w24', 'w25'] },
].map((g) => Object.freeze({ ...g, maps: Object.freeze(g.maps.slice()) })));

/** Every map in the one order of the game (w1 … w25 as the owner grouped them). */
export const ORDER = Object.freeze(WORLD_GROUPS.flatMap((g) => g.maps));

/** Maps that are not in js/worlds/meta.js yet (CATALOG-25 names): a "בקרוב" pin with a name, a line and a difficulty. When the engine
 *  lane registers one in meta.js, meta's entry wins (name, tagline, playable). */
export const PLANNED = Object.freeze({
  w18: { name: 'חוף הסערות', tagline: 'ביטוח: הכסף נכנס עכשיו, והסערה מגיעה אחר כך.', diff: 4 },
  w19: { name: 'פעמון הבורסה', tagline: 'החברה שלך נסחרת בבורסה — ומחיר המניה מגיב לכל צעד.', diff: 4 },
  w20: { name: 'רחוב הקרנות', tagline: 'כסף של לקוחות, מכירה בחסר, וכסף שנכנס ויוצא בדיוק ברגע הלא נכון.', diff: 5 },
  w21: { name: 'בית ההשקעות הפרטי', tagline: 'לקנות חברה בהלוואה, לשפר אותה ולמכור לפני שהקרן נסגרת.', diff: 5 },
  w22: { name: 'העיר החדשה', tagline: 'כל כביש ובית ספר שבונים מייקרים את כל הקרקע שלך.', diff: 4 },
  w23: { name: 'בית המסחר העולמי', tagline: 'פער בין היום למחר: ריבית, צד שני לעסקה, ומטבע — בעסקה אחת.', diff: 5 },
  w24: { name: 'אוצר המדינה', tagline: 'מדינת אי: ריבית מול צמיחה, ואמון שקשה לבנות וקל לאבד.', diff: 5 },
  w25: { name: 'מגדל העולם', tagline: 'קבוצה רשומה בבורסה: שליטה, מניות בערבון, וכל הכלים ביחד.', diff: 5 },
});

const GROUP_OF = Object.freeze(Object.fromEntries(WORLD_GROUPS.flatMap((g) => g.maps.map((id) => [id, g]))));
/** The world (group) of a map, or null for an unknown id. */
export const groupOf = (id) => GROUP_OF[id] || null;
export const groupById = (gid) => WORLD_GROUPS.find((g) => g.id === gid) || null;
/** Is this id one of the 25 maps? */
export const isMapId = (id) => !!GROUP_OF[id];
/** 1-based position of a map inside its world (w15 → 2 in "הכסף הגדול"), 0 for an unknown id. */
export const mapNo = (id) => { const g = GROUP_OF[id]; return g ? g.maps.indexOf(id) + 1 : 0; };
/** 1-based position of a map in the whole order (w15 → 11), 0 for an unknown id. */
export const mapIndex = (id) => ORDER.indexOf(id) + 1;
/** "מפה 2 · הכסף הגדול" — the title of a map in the picker / world view / in-game banner ('' for an unknown id). */
export const mapLabel = (id) => { const g = GROUP_OF[id]; return g ? `מפה ${mapNo(id)} · ${g.name}` : ''; };
/** "עולם 3 · הכסף הגדול" — the kicker of a world. */
export const groupLabel = (g) => (g ? `עולם ${g.n} · ${g.name}` : '');

/** The next / previous BUILT map in the order (an unbuilt map is skipped: the player is never blocked by a map that is not there yet). */
export function nextMap(id, built = () => true) {
  const i = ORDER.indexOf(id); if (i < 0) return null;
  for (let k = i + 1; k < ORDER.length; k++) if (built(ORDER[k])) return ORDER[k];
  return null;
}
export function prevMap(id, built = () => true) {
  const i = ORDER.indexOf(id); if (i < 0) return null;
  for (let k = i - 1; k >= 0; k--) if (built(ORDER[k])) return ORDER[k];
  return null;
}
/** Does the step from map a to map b cross into a new world? */
export const crossesWorld = (a, b) => !!(GROUP_OF[a] && GROUP_OF[b] && GROUP_OF[a] !== GROUP_OF[b]);

/**
 * The open maps under the linear rule: the first built map is always open; every later BUILT map is open when the built map before it is
 * open AND finished; a map in `kept` (opened earlier, e.g. under the old unlock graph) is open whatever came before it, and the chain goes on
 * from it. An unbuilt map is never open. Returns the open ids in ORDER.
 *   opts.finished(id) → bool · opts.built(id) → bool · opts.kept: iterable of ids
 */
export function openMaps({ finished = () => false, built = () => true, kept = [] } = {}) {
  const K = new Set(kept || []);
  const out = []; let prevOpen = null; let prevDone = false; let first = true;
  for (const id of ORDER) {
    if (!built(id)) continue;
    const open = first || K.has(id) || (prevOpen && prevDone);
    first = false;
    if (open) out.push(id);
    prevOpen = open; prevDone = open && !!finished(id);
  }
  return out;
}
