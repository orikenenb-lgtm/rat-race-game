// 3D upgrade wave 1 (team ג, B1 G5 / A2 G-05): display text for the board tiles — a short name that fits a tile (≤ 10 chars,
// never cut with "…") and one line on what happens there. Render-side only: the tile types, names and colours stay in the
// engine's world data (js/worlds/*, pinned by the server verifier) — this file only maps them to words. The descriptions follow
// what engine.landing() / describe() actually do for each tile type (no new rules). Pure: no DOM, no three, no engine import.

/** type → { short, desc } (the default world wording). */
export const TILE_TEXT = Object.freeze({
  payday: { short: 'משכורת', desc: 'בכל מעבר כאן, וגם בנחיתה, מגיעה משכורת: ההכנסה מהעבודה ומהנכסים פחות ההוצאות. בנחיתה בוחרים גם איך לנצל את החודשים הבאים.' },
  deal: { short: 'הזדמנות', desc: 'עסקה לקנייה: דירה, עסק, מניה או משהו אחר. בודקים כמה זה עולה וכמה זה מכניס כל חודש, ואפשר גם לוותר.' },
  doodad: { short: 'הוצאה', desc: 'משהו מפתה לקנות, או הוצאה שאי אפשר לדחות. כסף שיוצא ולא חוזר.' },
  market: { short: 'שוק', desc: 'חדשות מהשוק: מחירים, ריבית, הדולר או שווי הנכסים זזים. לפעמים אפשר לקנות או למכור.' },
  crisis: { short: 'משבר', desc: 'משבר: הוצאה גדולה או חודש קשה. קרן חירום עוזרת לעבור אותו בלי הלוואה.' },
  mystery: { short: 'הפתעה', desc: 'קלף הפתעה: יכול להיות טוב או רע, ולפעמים מסתתרת בו עסקת זהב.' },
  bank: { short: 'בנק', desc: 'הבנק משנה את הריבית. מי שיש לו הלוואות בריבית משתנה מרגיש את זה.' },
  upgrade: { short: 'שדרוג', desc: 'הזדמנות לשדרג נכס שיש לך, או לקצץ הוצאה, כדי שיישאר יותר כסף כל חודש.' },
  fx: { short: 'דולר', desc: 'שער הדולר זז. מי שמרוויח או משלם בדולרים מרגיש את זה.' },
  shipping: { short: 'משלוח', desc: 'אירוע בים: משלוח שמגיע, מתעכב או צריך ביטוח. משפיע על עסקי היבוא והיצוא.' },
  pitch: { short: 'פיץ\'', desc: 'יזמים מציגים סטארט־אפ. אפשר להשקיע, והתוצאה מתגלה רק אחרי כמה חודשים.' },
  giving: { short: 'נתינה', desc: 'אפשר לתרום למטרה. בודקים כמה השפעה יוצאת מכל שקל.' },
  life: { short: 'החיים', desc: 'דילמה מהחיים: עבודה, משפחה, חופשה. משפיעה על הכסף, על הכוח ועל האושר.' },
  edu: { short: 'לימודים', desc: 'בוחרים איך להשקיע את הזמן בחודשים הקרובים: עבודה, לימודים, עסק צדדי או קורס קצר.' },
  tax: { short: 'מס הכנסה', desc: 'פעם בשנה עושים סדר עם מס הכנסה: לפעמים מקבלים החזר, ולפעמים משלמים מס על הכנסה נוספת.' },
  index: { short: 'קרן מדד', desc: 'קונים או מוכרים קרן מחקה מדד (קצת מכל השוק). אפשר גם להגדיר הוראת קבע.' },
  business: { short: 'העסק שלך', desc: 'אירוע בעסק שלך, או הצעה לפתוח עסק אם עוד אין לך.' },
});

/** Per-world name overrides from the world data (js/worlds/w*.js tilesFor(...)) → their own short name / description. */
const BY_NAME = Object.freeze({
  'פיטורים': { short: 'פיטורים', desc: 'פיטורים או הוצאה גדולה: חודש בלי משכורת או חור בתקציב. קרן חירום עוזרת לעבור את זה בלי הלוואה.' },
  'סגנון חיים': { short: 'סגנון חיים', desc: 'פיתוי של סגנון חיים יקר, או הוצאה שאי אפשר לדחות. כסף שיוצא ולא חוזר.' },
  'משבר עולמי': { short: 'משבר עולמי', desc: 'משבר עולמי פוגע בסחר ובמחירים. קרן חירום עוזרת לעבור אותו בלי הלוואה.' },
  'חורף': { short: 'חורף', desc: '"חורף" בהייטק: הכסף מתייבש והשווי יורד. מי שיש לו כרית עובר אותו בשקט.' },
  'פיתוי': { short: 'פיתוי', desc: 'משהו נוצץ לקנות, או הוצאה שאי אפשר לדחות. כסף שיוצא ולא חוזר.' },
  'כותרות': { short: 'כותרות', desc: 'כותרת אמיתית מהתקופה, ואפשר לקנות או למכור קרן מחקה מדד במחיר של אז.' },
});
/** A tile name that is already short is shown as-is. */
export const SHORT_MAX = 10;

/** Board icon key (world data `icon`) → emoji (the 2D board and the tile sheet). */
const TILE_ICON = [
  [/^coin$/, '💰'], [/^trend$/, '📈'], [/^bag$/, '👜'], [/^bars$/, '📊'], [/^question$/, '❓'], [/^bank$/, '🏦'], [/^hammer$/, '🔨'],
  [/^dollar$/, '💵'], [/^ship$/, '🚢'], [/^rocket$/, '🚀'], [/^heart$/, '❤️'], [/^(life|family)$/, '🏠'], [/^(edu|school|cap|study)$/, '🎓'],
  [/^(tax|receipt)$/, '🧾'], [/^piggy$/, '🐷'], [/^(index|fund|pension|chart)$/, '📊'], [/^(shop|store|business)$/, '🏪'],
  [/^(news|newspaper)$/, '📰'], [/^x$/, '✖️'],
];
export function tileEmoji(icon) { const s = String(icon || ''); for (const [re, e] of TILE_ICON) if (re.test(s)) return e; return '⭐'; }

/**
 * tile ({type, name, icon} from the world's `tiles` / E.boardInfo) → { type, name (full, from the data), short, desc, emoji }.
 * The short name is the data name when it already fits (≤ SHORT_MAX), else the per-name / per-type short word.
 */
export function tileText(tile) {
  const t = tile || {}; const name = String(t.name || ''); const base = TILE_TEXT[t.type] || { short: name, desc: '' };
  const over = BY_NAME[name];
  const short = over ? over.short : (name && name.length <= SHORT_MAX ? name : base.short) || name;
  const desc = (over && over.desc) || (t.type === 'market' && name === 'כותרות' ? BY_NAME['כותרות'].desc : base.desc);
  return { type: t.type || '', name: name || short, short, desc, emoji: tileEmoji(t.icon) };
}
/** Steps forward from `from` to `to` on a ring of `n` tiles (0 = the same tile). */
export function stepsTo(from, to, n) { n = Math.max(1, n | 0); return (((to - from) % n) + n) % n; }
/** "אתה כאן" / "עוד צעד אחד" / "עוד N צעדים" (the distance in tiles along the direction of play). */
export function whereText(steps) { return steps === 0 ? 'אתה כאן' : steps === 1 ? 'עוד צעד אחד' : `עוד ${steps} צעדים`; }
/** The landing announcement for the live region / turn chip. */
export function landedText(tile) { return `נחתת על ${tileText(tile).short}`; }
/** Everything the tile sheet shows. */
export function tileSheet(tile, index, pos, n) {
  const tx = tileText(tile); const steps = stepsTo(pos, index, n);
  return { ...tx, index, steps, where: whereText(steps), here: steps === 0 };
}
