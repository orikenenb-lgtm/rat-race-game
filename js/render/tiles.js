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
  // w5 עיר התיירות — tile N (js/worlds/mech/season.js tiles.N). Number-free until prepareWorldText() built the text from the module's
  // real constants (MODULE_TEXT below).
  allot: { short: 'הקצאה', desc: 'מפעיל תיירות רוצה חלק מהחדרים של המלון שלך לכמה חודשים בהנחה, ומשלם חלק מראש. אפשר לקבל, להציע הנחה קטנה יותר, או לוותר.' },
  // w6 אזור התעשייה — tile C (js/worlds/mech/plant.js tiles.C). Number-free until prepareWorldText() built it from CONTRACT.
  contract: { short: 'חוזה', desc: 'לקוח גדול מציע חוזה אספקה ארוך על חלק מהקיבולת של קו, במחיר נמוך ממחיר השוק. אפשר לחתום, לבקש הנחה קטנה יותר, או לוותר.' },
  // w7 רשתות המסחר — tile R (js/worlds/mech/chain.js tiles.R); w8 מטרופולין הנדל"ן — tile Q (projects.js tiles.Q). Number-free until
  // prepareWorldText() built them from the modules' constants (MODULE_TEXT below).
  site: { short: 'מיקום', desc: 'מיקום לסניף חדש: שיפוץ, ואז חודשים של הרצה עד מכירות מלאות. אפשר לעשות סקר מיקום, לפתוח סניף משלך, לתת לזכיין, או לוותר.' },
  land: { short: 'קרקע', desc: 'קרקע לפרויקט: קודם הון עצמי, והבנק מצטרף רק אחרי מכירות מוקדמות. אפשר לבדוק את התב"ע, לקנות עם קבלן אמין או זול, או לוותר.' },
  // w9 מדבר האנרגיה — tile V (energy.js tiles.V); w10 מרכז הפיננסים — tiles W (market.js tiles.W) and Y (portfolio.js tiles.Y). Number-free
  // until prepareWorldText() built them from the modules' constants (MODULE_TEXT below).
  powerSite: { short: 'אתר אנרגיה', desc: 'אתר לתחנת כוח: ייזום, היתרים והון עצמי — והבנק מממן את הבנייה רק לפרויקט עם חיבור לרשת. אפשר לעשות סקר משאבים, לייזם לבד או עם שותף, או לוותר.' },
  exchange: { short: 'הבורסה', desc: 'חדר המסחר: מצב השוק, המדד והחדשות, ומבט חינם על החברה שבחדשות. המסחר עצמו — בלוח "הבורסה והתיק" בין הטלות.' },
  // w13 אצטדיון הכוכבים — tile H (auction.js tiles.H, wired by w13.js world.auction). Number-free until prepareWorldText() built it from
  // the module's constants (MODULE_TEXT below).
  transfer: { short: 'שוק העברות', desc: 'שחקן במכירה מול מועדונים אחרים: ההערכה ציבורית, כל מועדון מעריך בעצמו. מציעים, מעלים או מוותרים — מי שמעריך הכי ביוקר זוכה.' },
  // w11 התאגיד הבינלאומי — tile Z (multinational.js tiles.Z); w15 מגדלי הענן — tile H (platform.js tiles.H). Number-free until
  // prepareWorldText() built them from the modules' constants (MODULE_TEXT below).
  acquisition: { short: 'הצעת רכישה', desc: 'חברה־בת בחו"ל למכירה, עם המנהל שכבר יושב שם: הרווח שלה הוא טווח, והמנהל — לא ידוע. אפשר לבדוק קודם, לקנות או לוותר.' },
  investors: { short: 'משקיעים', desc: 'פגישה עם משקיעים: הצעת השקעה תמורת חלק מהחברה, או ענקית שרוצה לקנות את כולה. אפשר לקבל או לסרב.' },
  // w12 האימפריה — tile Z (holding.js tiles.Z); w16 ארץ השדות — tile H (adapters/harvest.js tiles.H). Number-free until prepareWorldText()
  // built them from the modules' constants (MODULE_TEXT below).
  division: { short: 'חטיבה', desc: 'חטיבה למכירה: הרווח שלה הוא טווח, והמוכר יודע יותר ממך. אפשר לבדוק קודם, לקנות בערבות המטה או מגודרת, או לוותר.' },
  produce: { short: 'בורסה', desc: 'בורסת התוצרת: חוזה ייצוא על חלק מהיבול של שדה בגידול, או זכויות מים לשנות בצורת. אפשר לקבל או לסרב.' },
  privateDeal: { short: 'עסקה פרטית', desc: 'השקעה פרטית: נעולה לשנים, בלי מחיר יומי, ואי אפשר ללוות כנגדה. אפשר לבדוק את המנהל, להשקיע הכל או חצי, או לוותר.' },
});

/** Per-world name overrides from the world data (js/worlds/w*.js tilesFor(...)) → their own short name / description. */
const BY_NAME = Object.freeze({
  'פיטורים': { short: 'פיטורים', desc: 'פיטורים או הוצאה גדולה: חודש בלי משכורת או חור בתקציב. קרן חירום עוזרת לעבור את זה בלי הלוואה.' },
  'סגנון חיים': { short: 'סגנון חיים', desc: 'פיתוי של סגנון חיים יקר, או הוצאה שאי אפשר לדחות. כסף שיוצא ולא חוזר.' },
  'משבר עולמי': { short: 'משבר עולמי', desc: 'משבר עולמי פוגע בסחר ובמחירים. קרן חירום עוזרת לעבור אותו בלי הלוואה.' },
  'חורף': { short: 'חורף', desc: '"חורף" בהייטק: הכסף מתייבש והשווי יורד. מי שיש לו כרית עובר אותו בשקט.' },
  'פיתוי': { short: 'פיתוי', desc: 'משהו נוצץ לקנות, או הוצאה שאי אפשר לדחות. כסף שיוצא ולא חוזר.' },
  'כותרות': { short: 'כותרות', desc: 'כותרת אמיתית מהתקופה, ואפשר לקנות או למכור קרן מחקה מדד במחיר של אז.' },
  // w5: the crisis tile (w5.crises: a regional slump on the beach, an operation, a city-wide outage)
  // w6: the crisis tile (w6.crises: the big customer goes bankrupt, a fire in the raw-material store, an operation)
  // w7 / w8: the crisis tiles (w7.crises: a franchise scandal, a break-in at the warehouse, an operation; w8.crises: the cheap contractor
  // goes bust, a tenants' lawsuit, an operation)
  'משבר בקמעונאות': { short: 'משבר', desc: 'משבר בקמעונאות: זכיין שעושה בושות, פריצה למחסן או חודש בלי משכורת. קופה של כמה חודשי עלויות קבועות עוזרת לעבור אותו.' },
  'משבר בבנייה': { short: 'משבר', desc: 'משבר בבנייה: קבלן זול שפושט רגל, תביעה של דיירים או חודש בלי משכורת. הון עצמי בצד עוזר לעבור אותו בלי לעצור פרויקט.' },
  'משבר בתעשייה': { short: 'משבר', desc: 'משבר בתעשייה: לקוח גדול קורס, שריפה במחסן או חודש בלי משכורת. כרית מזומן ולקוחות מפוזרים עוזרים לעבור אותו.' },
  // w9: the crisis tile (w9.crises: a transformer burns, the neighbours sue, an operation)
  'תקלה ברשת': { short: 'תקלה ברשת', desc: 'תקלה ברשת: שנאי שנשרף ומשבית תחנה, תביעה של שכנים או חודש בלי משכורת. תחנות שמכסות את החוב שלהן בנוח עוברות את זה בלי הלוואה.' },
  // w13: the crisis tile (w13.crises: the FFP audit, a sponsor scandal, a fan protest, the stand roof, a lawsuit, a month without salary)
  'משבר במועדון': { short: 'משבר', desc: 'משבר במועדון: ביקורת על השכר, שערוריית נותן חסות, מחאת אוהדים או חודש בלי משכורת. שכר שלא אוכל את ההכנסות ומזומן בצד עוזרים לעבור אותו.' },
  // w11 / w15: the crisis tiles (w11.crises: a regulator, a general strike, a class action, a cyber break-in · w15.crises: an outage, a churn wave, a patent suit)
  'משבר בקבוצה': { short: 'משבר', desc: 'משבר בקבוצה: רגולטור שבודק את המנהלים, שביתה כללית במדינה אחת, תביעה או חודש בלי משכורת. מנהלים שנבדקו ומזומן בצד עוזרים לעבור אותו.' },
  'משבר בחברה': { short: 'משבר', desc: 'משבר בחברה: השרתים נופלים, גל נטישה, תביעת פטנט או חודש בלי משכורת. כמה חודשי מזומן ביד עוזרים לעבור אותו בלי לגייס בכל מחיר.' },
  // w16: the crisis tile (w16.crises: hail on one growing field, a broken combine, a fire at the field's edge, a month without a draw)
  'פגע בשדה': { short: 'פגע בשדה', desc: 'פגע בשדה: ברד שמוריד 30% מהיבול של שדה אחד, קומביין שהתקלקל, שריפה או חודש בלי משיכה. בגלל זה נועלים רק את הקצה הנמוך של הטווח.' },
  'שפל בתיירות': { short: 'שפל', desc: 'שפל בתיירות: חודשים שבהם התיירים לא מגיעים, וכל הנכסים על החוף נפגעים יחד. כרית לחורף ונכסים לכמה עונות עוזרים לעבור אותו.' },
});
/** Per-world name overrides where two worlds share a tile name (w12's crisis tile is also "משבר בקבוצה", with other cards than w11's). */
const BY_NAME_W = Object.freeze({ w12: Object.freeze({ 'משבר בקבוצה': Object.freeze({ short: 'משבר', desc: 'משבר בקבוצה: מאבק ירושה שמעלה את הדיבידנד, מתקפת סייבר על המטה, תביעה ייצוגית או חודש בלי משכורת. מזומן במטה עוזר לעבור אותו בלי לגעת בחטיבות.' }) }) });
/* ---------- worlds wave 1: module tiles get their text from the module's own constants (no copied numbers that drift) */
const pctW = (x) => `${Math.round(x * 100)}%`;
const partW = (x) => (x === 0.5 ? 'חצי מהכסף' : x === 0.25 ? 'רבע מהכסף' : `${pctW(x)} מהכסף`);
/** mechanic id → (its module namespace) → { tile type: {short, desc} } */
const MODULE_TEXT = {
  // w12 (holding.js HD.down, HD.fee / minFee, SLOTS): a division for sale — the down payment from HQ, due diligence, the cap on divisions
  holding: (M) => (M && M.HD && M.SLOTS ? { division: { short: 'חטיבה', desc: `חטיבה למכירה: הרווח שלה הוא טווח. ${pctW(M.HD.down)} מהמטה והשאר חוב על החטיבה — בערבות המטה (ריבית זולה) או מגודרת. בדיקה מצמצמת את הטווח. עד ${M.SLOTS} חטיבות. אפשר לוותר.` } } : {}),
  // w16 (adapters/harvest.js HV.water): an export contract on part of a growing field's crop, or water rights for drought years
  harvest: (M) => (M && M.HV && M.HV.water ? { produce: { short: 'בורסה', desc: `בורסת התוצרת: חוזה ייצוא על חלק מהיבול של שדה בגידול — מחיר טוב, בלי ביטחונות, אבל אם היבול לא יספיק קונים את החסר ביוקר. או זכויות מים: עוד ${pctW(M.HV.water)} במכסה בבצורת. אפשר לסרב.` } } : {}),
  // w11 (multinational.js MN.down, MN.auditFee, SLOTS): the acquisition card — the down payment, the due-diligence fee, the cap on subsidiaries
  multinational: (M) => (M && M.MN && M.SLOTS ? { acquisition: { short: 'הצעת רכישה', desc: `חברה־בת בחו"ל למכירה, עם המנהל שלה: הרווח הוא טווח והמנהל לא ידוע. ${pctW(M.MN.down)} מקדמה, השאר הלוואה על החברה. בדיקה (${Math.round(M.MN.auditFee / 1000)} אלף ₪) מצמצמת את הטווח. עד ${M.SLOTS} חברות. אפשר לוותר.` } } : {}),
  // w15 (platform.js PF.raise): a term sheet (a share of the company for cash) or a giant's buyout
  platform: (M) => (M && M.PF && M.PF.raise ? { investors: { short: 'משקיעים', desc: `פגישה עם משקיעים: כסף תמורת חלק מהחברה במחיר קרוב לשווי לפי השוק היום (לא לפי הסבב הקודם), או ענקית שקונה את כולה במזומן. אפשר לקבל או לסרב.` } } : {}),
  // w13 (auction.js ROUNDS, STEP): the transfer market's rounds and bid steps
  auction: (M) => (M && M.ROUNDS && M.STEP ? { transfer: { short: 'שוק העברות', desc: `שחקן במכירה מול 1–3 מועדונים: ההערכה ציבורית, ההערכות שלהם סודיות. עד ${M.ROUNDS} סבבים — להשוות, להעלות ב־${pctW(M.STEP.raise - 1)} או לקפוץ ב־${pctW(M.STEP.jump - 1)}. לוותר תמיד אפשר.` } } : {}),
  // w9 / w10 (energy.js SLOT, PPA; portfolio.js PE, STAKE, FIRE)
  energy: (M) => (M && M.SLOT && M.PPA ? { powerSite: { short: 'אתר אנרגיה', desc: `אתר לתחנת כוח: ייזום, היתרים והון עצמי — והבנק מממן את הבנייה רק לפרויקט עם חיבור לרשת (מהתור: ${M.SLOT.wait} חודשים). בסיום: חוזה PPA (${pctW(M.PPA.share)} מהמחיר הממוצע) או שוק חופשי. אפשר לעשות סקר משאבים, לייזם לבד או עם שותף, או לוותר.` } } : {}),
  portfolio: (M) => (M && M.PE && M.STAKE && M.FIRE ? { privateDeal: { short: 'עסקה פרטית', desc: `השקעה פרטית: קרן שקוראת לכסף ב־${M.PE.calls} שלבים, או אחזקה נעולה ${M.STAKE.lockMin}–${M.STAKE.lockMin + M.STAKE.lockSpan - 1} חודשים. אין מחיר יומי ואי אפשר ללוות כנגדה; מכירה מוקדמת עולה ${pctW(M.FIRE.secondary)}. אפשר לבדוק את המנהל, להשקיע הכל או חצי, או לוותר.` } } : {}),
  chain: (M) => (M && M.RAMP && M.ROYALTY ? { site: { short: 'מיקום', desc: `מיקום לסניף חדש: חודשיים של שיפוץ, ואז חצי שנה של הרצה — בחודש הראשון רק ${pctW(M.RAMP[0])} מהמכירות. אפשר לעשות סקר מיקום, לפתוח סניף משלך, לתת לזכיין (${pctW(M.ROYALTY.pct)} מהמכירות), או לוותר.` } } : {}),
  projects: (M) => (M && M.PRESALE && M.CONTRACTOR && M.LAND_LTV ? { land: { short: 'קרקע', desc: `קרקע לפרויקט: הבנק מממן ${pctW(M.LAND_LTV)} מהקרקע, ואת הבנייה רק אחרי ${pctW(M.PRESALE.req)} מכירות על הנייר. אפשר לבדוק את התב"ע, לקנות עם קבלן אמין (+${pctW(M.CONTRACTOR.reliable.cost - 1)} עלות) או זול (חריגה עד ${pctW(M.CONTRACTOR.cheap.over)}), או לוותר.` } } : {}),
  plant: (M) => (M && M.CONTRACT ? { contract: { short: 'חוזה', desc: `לקוח מציע חוזה ל־${M.CONTRACT.months} חודשים על ${pctW(M.CONTRACT.volMin)}–${pctW(M.CONTRACT.volMin + M.CONTRACT.volSpan)} מהקיבולת של קו, ב־${pctW(1 - M.CONTRACT.price)} פחות ממחיר השוק. אפשר לחתום, לבקש רק ${pctW(1 - M.CONTRACT.counterPrice)} הנחה, או לוותר.` } } : {}),
  season: (M) => (M && M.ALLOT ? { allot: { short: 'הקצאה', desc: `מפעיל תיירות רוצה חלק מהחדרים של המלון שלך ל־${M.ALLOT.months} חודשים, ב־${pctW(M.ALLOT.disc)} הנחה, ו${partW(M.ALLOT.upfront)} מראש. אפשר לקבל, להציע ${pctW(M.ALLOT.counterDisc)} הנחה במקום, או לוותר.` } } : {}),
};
const MOD_TYPE = {};
const ADAPTER_IDS = new Set(['harvest']);   // MODULE_TEXT ids that are rule adapters (js/worlds/adapters/), not mech modules   // tile type → {short, desc}, filled by prepareWorldText
/**
 * Build the module tile texts of a loaded world from its mechanic modules' exported constants. The module file is already in the
 * browser's module map (the world file imports it), so this costs no request. Idempotent; resolves to the types it filled.
 */
export async function prepareWorldText(world) {
  const done = [];
  for (const m of (world && world.mech) || []) {
    const id = m && m.id; if (!id || !MODULE_TEXT[id]) continue;
    let M = null; try { M = await import(ADAPTER_IDS.has(id) ? `../worlds/adapters/${id}.js` : `../worlds/mech/${id}.js`); } catch (e) { M = null; }   // w16: a rule adapter lives in adapters/
    const t = MODULE_TEXT[id](M); Object.assign(MOD_TYPE, t); done.push(...Object.keys(t));
  }
  return done;
}
/** A tile name that is already short is shown as-is. */
export const SHORT_MAX = 10;

/** Board icon key (world data `icon`) → emoji (the 2D board and the tile sheet). */
const TILE_ICON = [
  [/^coin$/, '💰'], [/^trend$/, '📈'], [/^bag$/, '👜'], [/^bars$/, '📊'], [/^question$/, '❓'], [/^bank$/, '🏦'], [/^hammer$/, '🔨'],
  [/^dollar$/, '💵'], [/^ship$/, '🚢'], [/^rocket$/, '🚀'], [/^heart$/, '❤️'], [/^(life|family)$/, '🏠'], [/^(edu|school|cap|study)$/, '🎓'],
  [/^(tax|receipt)$/, '🧾'], [/^piggy$/, '🐷'], [/^(index|fund|pension|chart)$/, '📊'], [/^(shop|store|business)$/, '🏪'],
  [/^(news|newspaper)$/, '📰'], [/^x$/, '✖️'], [/^plane$/, '✈️'], [/^doc$/, '📝'], [/^crane$/, '🏗️'], [/^bolt$/, '⚡'], [/^lock$/, '🔒'], [/^ball$/, '⚽'], [/^globe$/, '🌍'], [/^crown$/, '👑'],
];
export function tileEmoji(icon) { const s = String(icon || ''); for (const [re, e] of TILE_ICON) if (re.test(s)) return e; return '⭐'; }

/* ---------- wave 3a (review MAJOR-2): the market / deal tile text of a world is built from that world's own card decks
 * (world.market[].k, world.deals[] k / tk / crypto — the same arrays engine createMarket() / createDeal() draw from). Every effect
 * named in the text maps to a card kind that exists in that world's deck (tests/board_ux.test.mjs T-deck checks it per world). */
/** deal card → its group word ("דירות", "ספינות", "זהב"…). Unknown kinds fall back to a neutral word (never a false promise). */
export const DEAL_WORDS = Object.freeze({
  re: 'דירות', biz: 'עסקים קטנים', tower: 'דירות ובניינים', mall: 'חנויות ומרכזים מסחריים', hotel: 'מלונות וצימרים',
  ship: 'ספינות', warehouse: 'יבואנים ומחסנים', factory: 'מפעלים', datacenter: 'חוות שרתים', campus: 'קמפוסים ומשרדים',
  cnc: 'קווי CNC', plastic: 'מכונות הזרקה', food: 'מפעלי מזון', recycle: 'מפעלי מיחזור', metal: 'מסגריות', pack: 'קווי אריזה',   // w6
  // w7 / w8 module deal cards carry op.ck (chain.js branch / dc / ecom, projects.js proj / plot) — dealKind names them 'ck:<ck>'
  'ck:branch': 'סניפים ורשת מתחרה', 'ck:dc': 'מרכז הפצה', 'ck:ecom': 'אתר מכירות', 'ck:proj': 'פרויקט תקוע באמצע', 'ck:plot': 'מגרשים', building: 'בניין מושכר',
  office: 'בנייני משרדים', lab: 'חדרי שרתים',   // w11 / w15 legacy deal kinds
  'ck:sponsor': 'חסויות', 'ck:facility': 'מתקנים של המועדון', 'ck:club': 'המועדון',   // w13
  'ck:slot': 'חיבור לרשת', 'ck:plant': 'תחנה שכבר עובדת', 'ck:line': 'חלק בקו הולכה', 'ck:h2': 'פיילוט מימן', 'ck:fund': 'קרנות אג"ח, ריט ואשראי',   // w9 / w10
  resort: 'ריזורטים', spa: 'ספא', conference: 'כנסים', waterpark: 'פארקי מים', apts: 'דירות נופש', housing: 'מגורי עובדים', restaurant: 'מסעדות', dive: 'צלילה',   // w5
  'tk:GOLD': 'זהב', 'tk:USD': 'דולרים', 'tk:MADAD': 'קרן מדד', 'tk:INDX': 'מדד החדשנות', 'tk:IDX': 'קרן מדד', 'tk:AGAH': 'אג"ח ממשלתי', stock: 'מניות', crypto: 'קריפטו',
});
/** market card kind → what it does (short phrase). `trade` marks kinds where the card lets you buy or sell. */
export const MARKET_WORDS = Object.freeze({
  sell: { t: 'הצעה לקנות נכס שלך', trade: true }, price: { t: 'מחירים בבורסה זזים', trade: true }, crypto: { t: 'קריפטו קופץ או צונח', trade: true },
  repair: { t: 'תיקון יקר' }, bonus: { t: 'בונוס של חודש טוב' }, div: { t: 'דיבידנד' }, rate: { t: 'שינוי בריבית' },
  loss: { t: 'חודש של הפסדים' }, reval: { t: 'שווי הנכסים משתנה' }, fx: { t: 'הדולר זז' }, gold: { t: 'מחיר הזהב זז', trade: true },
  exitwave: { t: 'גל אקזיטים' }, markdown: { t: 'ירידת שווי לסטארט־אפים' }, match: { t: 'קרן שמכפילה השקעה' },
  tourism: { t: 'התיירים באים יותר או פחות' },   // w5: demand shocks, a new flight line, a storm, a mega-resort
  // w6 module market cards (plant.js market: c.mk): shocks to the lines' costs, staff, demand and supply
  'mk:tariff': { t: 'חשמל יקר' }, 'mk:workers': { t: 'מחסור בעובדים' }, 'mk:export': { t: 'הזמנת יצוא' }, 'mk:raw': { t: 'מחסור בחומרי גלם' },
  'mk:inspect': { t: 'ביקורת בטיחות' }, 'mk:grant': { t: 'מענק אוטומציה' },
  // w7 (chain.js market: c.mk)
  'mk:supplier': { t: 'ספק מעלה מחירים' }, 'mk:ship': { t: 'משלוח שמתעכב' }, 'mk:viral': { t: 'מוצר ויראלי' }, 'mk:mall': { t: 'הקניונים מתרוקנים' },
  'mk:wage': { t: 'שכר המינימום עולה' }, 'mk:credit': { t: 'הבנק מקשיח אשראי' }, 'mk:rival': { t: 'רשת מתחרה נפתחת ליד' },
  // w8 (projects.js market: c.mk)
  'mk:rate': { t: 'הריבית במשק זזה' }, 'mk:freeze': { t: 'הקפאת היתרים' }, 'mk:steel': { t: 'הפלדה מתייקרת' }, 'mk:crane': { t: 'תאונת עגורן' },
  'mk:foreign': { t: 'גל קונים מחו"ל' }, 'mk:lottery': { t: 'דירות בהנחה מהמדינה' }, 'mk:strike': { t: 'שביתה במפעל הבטון' },
  // w9 (energy.js market: c.mk)
  'mk:feedin': { t: 'קיצוץ בתעריף' }, 'mk:heat': { t: 'גל חום' }, 'mk:sand': { t: 'סופת חול' }, 'mk:curtail': { t: 'הגבלת רשת' },
  'mk:panels': { t: 'פאנלים זולים' }, 'mk:carbon': { t: 'מס פחמן' }, 'mk:boom': { t: 'עוד שדות סולאריים' },
  // w10 (portfolio.js market: c.mk)
  // w13 (league.js market: c.mk)
  'mk:tv': { t: 'חוזה טלוויזיה' }, 'mk:fees': { t: 'שוק ההעברות רותח' }, 'mk:coach': { t: 'מאמן הנוער נחטף' }, 'mk:cup': { t: 'ריצה בגביע' }, 'mk:derby': { t: 'דרבי מקומי' }, 'mk:star': { t: 'הכוכב רוצה העלאה' },
  // w11 (multinational.js market: c.mk; 'tariff' / 'boom' mean something else here: MARKET_WORDS_W.w11)
  'mk:port': { t: 'נמל נסגר' }, 'mk:fxcrisis': { t: 'משבר מטבע' }, 'mk:election': { t: 'בחירות במדינה אחת' }, 'mk:shipping': { t: 'מחירי ההובלה מזנקים' }, 'mk:poach': { t: 'מנהל כוכב נחטף' },
  // w15 (platform.js market: c.mk)
  'mk:appstore': { t: 'חנות האפליקציות מעלה מחיר' }, 'mk:breach': { t: 'פריצת מידע' }, 'mk:rivalRound': { t: 'המתחרה גייס סבב ענק' }, 'mk:pop': { t: 'הבועה מתפוצצת' }, 'mk:copy': { t: 'ענקית מעתיקה פיצ׳ר' }, 'mk:engineer': { t: 'מהנדסת מפתח עוזבת' },
  // w12 (holding.js market: c.mk; 'boom' / 'energy' read in w12's words: MARKET_WORDS_W.w12)
  'mk:recession': { t: 'מיתון רב־מדינתי' }, 'mk:review': { t: 'סוכנות הדירוג בודקת' }, 'mk:antitrust': { t: 'בדיקת הגבלים עסקיים' },
  // w16 (adapters/harvest.js market: c.mk)
  'mk:drought': { t: 'בצורת בעמק' }, 'mk:ban': { t: 'איסור ייצוא בחו"ל' }, 'mk:glut': { t: 'יבול שיא בעולם' }, 'mk:usdUp': { t: 'הדולר מתחזק' }, 'mk:usdDown': { t: 'הדולר נחלש' }, 'mk:subsidy': { t: 'מענק השקיה' }, 'mk:pest': { t: 'מזיק בכותנה' },
  'mk:shock': { t: 'הבורסה זזה בחדות' }, 'mk:spread': { t: 'מרווחי האשראי מתפוצצים' }, 'mk:prop': { t: 'מחירי הנדל"ן זזים' }, 'mk:flash': { t: 'קריסה בזק' }, 'mk:gate': { t: 'קרן נועלת פדיונות' },
});
/** Per-world market words where a kind means something else in that world (w10's 'freeze' is a liquidity freeze, not a permit freeze). */
export const MARKET_WORDS_W = Object.freeze({ w10: Object.freeze({ 'mk:freeze': Object.freeze({ t: 'הקפאת נזילות' }) }),
  w11: Object.freeze({ 'mk:tariff': Object.freeze({ t: 'מכסים חדשים' }), 'mk:boom': Object.freeze({ t: 'פריחה במדינה אחת' }) }), w15: Object.freeze({ 'mk:viral': Object.freeze({ t: 'חודש ויראלי' }) }),
  w12: Object.freeze({ 'mk:energy': Object.freeze({ t: 'משבר אנרגיה' }), 'mk:boom': Object.freeze({ t: 'השווקים עולים' }) }) });
const marketWord = (k, world) => ((world && MARKET_WORDS_W[world.id]) || {})[k] || MARKET_WORDS[k];
/** Per-world words where a kind means something else in that world (w7's 'warehouse' card is a leased commercial building). */
export const DEAL_WORDS_W = Object.freeze({ w7: Object.freeze({ warehouse: 'מבנה מסחרי מושכר' }), w11: Object.freeze({ warehouse: 'מחסנים ומרכזי הפצה' }),
  w12: Object.freeze({ building: 'מרכזים לוגיסטיים ופארקי תעשייה' }), w16: Object.freeze({ solar: 'גגות ושדות סולאריים', side: 'חנות וצימרים במשק' }) });
const dealWord = (k, world) => ((world && DEAL_WORDS_W[world.id]) || {})[k] || DEAL_WORDS[k];
const KNOWN_TK = new Set(['GOLD', 'USD', 'MADAD', 'INDX', 'AGAH', 'IDX']);
/** deal card → DEAL_WORDS key */
export function dealKind(c) { return !c ? '' : c.crypto ? 'crypto' : c.tk ? (KNOWN_TK.has(c.tk) ? 'tk:' + c.tk : 'stock') : c.op && c.op.ck ? 'ck:' + c.op.ck : c.k || ''; }   // w7 / w8: module cards by op.ck
/** market card → MARKET_WORDS key */
export function marketKind(c) { return !c ? '' : c.crypto ? 'crypto' : c.k || (c.mk ? 'mk:' + c.mk : ''); }   // w6: module cards carry mk (named only when MARKET_WORDS has it)
const uniq = (a) => [...new Set(a.filter(Boolean))];
const listHe = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' או ' + xs[xs.length - 1]);
/** the kinds (in deck order) of a world's deal / market deck → { kinds, words } — only kinds with a word are named */
export function deckWords(world, type) {
  const deck = (world && (type === 'deal' ? world.deals : world.market)) || [];
  const kinds = uniq(deck.map(type === 'deal' ? dealKind : marketKind));
  const named = kinds.filter((k) => (type === 'deal' ? dealWord(k, world) : marketWord(k, world)));
  return { kinds, named, words: named.map((k) => (type === 'deal' ? dealWord(k, world) : marketWord(k, world).t)) };
}
/** the per-world description of a deal / market tile (null when the world has no such deck → the shared wording) */
export function deckDesc(world, type) {
  if (type !== 'deal' && type !== 'market') return null;
  const d = deckWords(world, type); if (!d.words.length) return null;
  if (type === 'deal') return `עסקה לקנייה: ${listHe(d.words)}. בודקים כמה זה עולה וכמה זה מכניס, ואפשר לוותר.`;
  const trade = d.named.some((k) => marketWord(k, world).trade);
  const head = `חדשות מהשוק: ${listHe(d.words)}.`;
  return trade ? head + (head.length > 120 ? ' לפעמים קונים או מוכרים.' : ' לפעמים אפשר לקנות או למכור.') : head;
}

/**
 * tile ({type, name, icon} from the world's `tiles` / E.boardInfo) → { type, name (full, from the data), short, desc, emoji }.
 * The short name is the data name when it already fits (≤ SHORT_MAX), else the per-name / per-type short word.
 * world (optional, the world data with its decks): market / deal descriptions name only what that world's cards do.
 */
export function tileText(tile, world = null) {
  const t = tile || {}; const name = String(t.name || ''); const base = MOD_TYPE[t.type] || TILE_TEXT[t.type] || { short: name, desc: '' };
  const over = ((world && BY_NAME_W[world.id]) || {})[name] || BY_NAME[name];
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
