// 3D upgrade wave 1 (team ג, B1 G5 / A2 G-05): display text for the board tiles — a short name that fits a tile (≤ 10 chars,
// never cut with "…") and one line on what happens there. Render-side only: the tile types, names and colours stay in the
// engine's world data (js/worlds/*, pinned by the server verifier) — this file only maps them to words. The descriptions follow
// what engine.landing() / describe() actually do for each tile type (no new rules). Pure: no DOM, no three, no engine import.

/** type → { short, desc } (the default world wording). */
export const TILE_TEXT = Object.freeze({
  payday: { short: 'משכורת', desc: 'בכל מעבר כאן, וגם בנחיתה, מגיעה משכורת: ההכנסה מהעבודה ומהנכסים פחות ההוצאות. בנחיתה בוחרים גם איך לנצל את החודשים הבאים.' },
  deal: { short: 'הזדמנות', desc: 'עסקה לקנייה. בודקים כמה זה עולה וכמה זה מכניס כל חודש, ואפשר גם לוותר.' },
  doodad: { short: 'הוצאה', desc: 'משהו מפתה לקנות, או הוצאה שאי אפשר לדחות. כסף שיוצא ולא חוזר.' },
  market: { short: 'שוק', desc: 'חדשות מהשוק: משהו בכלכלה זז, וזה יכול לגעת בנכסים שלך. לפעמים אפשר לקנות או למכור.' },
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

/* ---------- wave 3a (review MAJOR-2): the market / deal tile text of a world is built from that world's own card decks
 * (world.market[].k, world.deals[] k / tk / crypto — the same arrays engine createMarket() / createDeal() draw from). Every effect
 * named in the text maps to a card kind that exists in that world's deck (tests/board_ux.test.mjs T-deck checks it per world). */
/** deal card → its group word ("דירות", "ספינות", "זהב"…). Unknown kinds fall back to a neutral word (never a false promise). */
export const DEAL_WORDS = Object.freeze({
  re: 'דירות', biz: 'עסקים קטנים', tower: 'דירות ובניינים', mall: 'חנויות ומרכזים מסחריים', hotel: 'מלונות וצימרים',
  ship: 'ספינות', warehouse: 'יבואנים ומחסנים', factory: 'מפעלים', datacenter: 'חוות שרתים', campus: 'קמפוסים ומשרדים',
  'tk:GOLD': 'זהב', 'tk:USD': 'דולרים', 'tk:MADAD': 'קרן מדד', 'tk:INDX': 'מדד החדשנות', 'tk:AGAH': 'אג"ח ממשלתי', stock: 'מניות', crypto: 'קריפטו',
});
/** market card kind → what it does (short phrase). `trade` marks kinds where the card lets you buy or sell. */
export const MARKET_WORDS = Object.freeze({
  sell: { t: 'הצעה לקנות נכס שלך', trade: true }, price: { t: 'מחירים בבורסה זזים', trade: true }, crypto: { t: 'קריפטו קופץ או צונח', trade: true },
  repair: { t: 'תיקון יקר' }, bonus: { t: 'בונוס של חודש טוב' }, div: { t: 'דיבידנד' }, rate: { t: 'שינוי בריבית' },
  loss: { t: 'חודש של הפסדים' }, reval: { t: 'שווי הנכסים משתנה' }, fx: { t: 'הדולר זז' }, gold: { t: 'מחיר הזהב זז', trade: true },
  exitwave: { t: 'גל אקזיטים' }, markdown: { t: 'ירידת שווי לסטארט־אפים' }, match: { t: 'קרן שמכפילה השקעה' },
});
const KNOWN_TK = new Set(['GOLD', 'USD', 'MADAD', 'INDX', 'AGAH']);
/** deal card → DEAL_WORDS key */
export function dealKind(c) { return !c ? '' : c.crypto ? 'crypto' : c.tk ? (KNOWN_TK.has(c.tk) ? 'tk:' + c.tk : 'stock') : c.k || ''; }
/** market card → MARKET_WORDS key */
export function marketKind(c) { return !c ? '' : c.crypto ? 'crypto' : c.k || ''; }
const uniq = (a) => [...new Set(a.filter(Boolean))];
const listHe = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' או ' + xs[xs.length - 1]);
/** the kinds (in deck order) of a world's deal / market deck → { kinds, words } — only kinds with a word are named */
export function deckWords(world, type) {
  const deck = (world && (type === 'deal' ? world.deals : world.market)) || [];
  const kinds = uniq(deck.map(type === 'deal' ? dealKind : marketKind));
  const named = kinds.filter((k) => (type === 'deal' ? DEAL_WORDS[k] : MARKET_WORDS[k]));
  return { kinds, named, words: named.map((k) => (type === 'deal' ? DEAL_WORDS[k] : MARKET_WORDS[k].t)) };
}
/** the per-world description of a deal / market tile (null when the world has no such deck → the shared wording) */
export function deckDesc(world, type) {
  if (type !== 'deal' && type !== 'market') return null;
  const d = deckWords(world, type); if (!d.words.length) return null;
  if (type === 'deal') return `עסקה לקנייה: ${listHe(d.words)}. בודקים כמה זה עולה וכמה זה מכניס, ואפשר לוותר.`;
  const trade = d.named.some((k) => MARKET_WORDS[k].trade);
  const head = `חדשות מהשוק: ${listHe(d.words)}.`;
  return trade ? head + (head.length > 120 ? ' לפעמים קונים או מוכרים.' : ' לפעמים אפשר לקנות או למכור.') : head;
}

/**
 * tile ({type, name, icon} from the world's `tiles` / E.boardInfo) → { type, name (full, from the data), short, desc, emoji }.
 * The short name is the data name when it already fits (≤ SHORT_MAX), else the per-name / per-type short word.
 * world (optional, the world data with its decks): market / deal descriptions name only what that world's cards do.
 */
export function tileText(tile, world = null) {
  const t = tile || {}; const name = String(t.name || ''); const base = TILE_TEXT[t.type] || { short: name, desc: '' };
  const over = BY_NAME[name];
  const short = over ? over.short : (name && name.length <= SHORT_MAX ? name : base.short) || name;
  const desc = (over && over.desc) || (world && deckDesc(world, t.type)) || base.desc;
  return { type: t.type || '', name: name || short, short, desc, emoji: tileEmoji(t.icon) };
}
/** Steps forward from `from` to `to` on a ring of `n` tiles (0 = the same tile). */
export function stepsTo(from, to, n) { n = Math.max(1, n | 0); return (((to - from) % n) + n) % n; }
/** "אתה כאן" / "עוד צעד אחד" / "עוד N צעדים" (the distance in tiles along the direction of play). */
export function whereText(steps) { return steps === 0 ? 'אתה כאן' : steps === 1 ? 'עוד צעד אחד' : `עוד ${steps} צעדים`; }
/** The landing announcement for the live region / turn chip. */
export function landedText(tile) { return `נחתת על ${tileText(tile).short}`; }
/** Everything the tile sheet shows. */
export function tileSheet(tile, index, pos, n, world = null) {
  const tx = tileText(tile, world); const steps = stepsTo(pos, index, n);
  return { ...tx, index, steps, where: whereText(steps), here: steps === 0 };
}
