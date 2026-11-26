// World 5 — עיר התיירות ("מפרץ השמש"). Goal: the average of the last 12 paydays of owner income from the assets ≥ ₪300k a month.
// Mechanic module `season` (js/worlds/mech/season.js): seasons and occupancy, a price plan per asset (premium in high season, budget in
// low season), core vs seasonal staff (cheaper winters vs a reputation that compounds), tour-operator allotments on the new 'N' tile,
// a seasonal credit line, closing a wing, converting a beach hotel to conferences, the promoter's festival (a public good).
// Spec: docs/full-upgrade/worlds/w5-tourism.md. Every number is TUNE (tools/sim.mjs --matrix N w5, tools/balance-data/w5-*.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w5')); NOT in WORLDS (no daily rotation); not ranked until the DB migration (meta.ranked).
// minRules 6. Visuals live render-side (WORLD_STYLE.w5 in js/render/vocab.js); `theme` here only keeps legacy render code working.
import { MENTOR, tilesFor, ring, INDEX_TICKER, STAKE_KIND } from './common.js';
import season, { priceCard } from './mech/season.js';

const board = ring(['ONODLOMOI', 'OMNOXL?OD', 'NOMOEODLO', 'OXMNTO?MD']); // 40 tiles, paydays on the corners, 4 × 'N' (מפעיל תיירות)

// op = the module's asset model: u units (rooms / daily covers), adr (₪ per unit-night at the regular price), base demand, fixed (₪ a month),
// var (share of revenue), prof (season profile), rate (% a month on the asset's own debt), rep (start reputation). cf = the honest 12-month
// average at the regular price plan (priceCard) — what the card shows and what due diligence is measured against.
const H = (n, d, cost, down, op, extra = {}) => priceCard({ k: extra.k || 'hotel', n, d, cost, down, value: extra.value ?? cost, grow: extra.grow ?? 0.003, op, ...extra });
const beach = { prof: 'beach', base: 0.9, var: 0.25 };
const winter = { prof: 'winterSun', base: 0.95, var: 0.25 };
const flat = { prof: 'flat', base: 0.8, var: 0.35 };
const park = { prof: 'waterpark', base: 0.9, var: 0.2, kind: 'seat' };

export default {
  id: 'w5', order: 5, name: 'עיר התיירות', mechanic: 'season', minRules: 6, mech: [season],
  tagline: 'מפרץ השמש: בקיץ אין חדר פנוי, ובנובמבר הטיילת ריקה. כאן מנצחים לפי שנה, לא לפי חודש.',
  goalLabel: 'ממוצע 12 חודשים של הכנסה מהנכסים: ₪300 אלף בחודש',
  lesson: 'עסק עונתי מודדים לפי שנה, לא לפי חודש. הקיץ משלם את החורף, אבל רק אם שמרת ממנו. מחיר גבוה כשאין חדר פנוי, מחיר נמוך כשהחדר ריק. ונכסים לכמה עונות מאזנים זה את זה.',
  story: 'יצאת מהמירוץ. עכשיו המשחק גדול יותר: עיר חוף בדרום שחיה מעונות. בפסח ובקיץ אין חדר פנוי, ובנובמבר הטיילת ריקה. מלון לא נסגר בחורף: המשכורות, החשמל והריבית ממשיכים. המטרה: הכנסה שנתית יציבה מהנכסים, לא חודש קיץ מוצלח.',
  theme: { // legacy render fields only (scene.js reads theme.decor / colours); the real look is WORLD_STYLE.w5 (render lane)
    sky: ['#ffd6a5', '#48cae4'], fog: '#ffe8c7', board: '#f3e2c0', boardEdge: '#9a3412', center: '#fbe9c9', accent: '#ff7a59',
    light: { hemiSky: '#fff4dc', hemiGround: '#b08968', sun: '#ffe0a3' }, decor: 'palms',
  },
  board,
  tiles: tilesFor(board, { N: { name: 'מפעיל תיירות' }, X: { name: 'שפל בתיירות' }, M: { name: 'העונה' } }),
  calendar: { startMonth: 10 },  // the game starts in October: winter is ahead
  // bank loans: 1.6% a month (+ credit band + cycle), up to 10 × monthly income; the goal counts owner income AFTER the interest on bank debt beyond a 2-month working-capital allowance (season.goalAccrual), so borrowing to the cap does not pay — above the planned yield, so borrowing to the cap does not pay; forced loans in ₪50k steps. Hotel mortgages are on the assets (op.rate).
  loan: { unit: 100000, autoUnit: 50000, pct: 1.6, cap: 10, bankrupt: 10 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'passive12', target: 300000, window: 12, hold: 3 }, // hold 3 (TUNE): a 12-month average that held 3 paydays in a row — G-durable
  maxMonths: 72,
  stars: { t2: 58, t3: 46 },
  start: {},
  doodadWealth: 0.004,
  tipDoodad: 1500000,
  /** Central money config (DESIGN §4.1): every ₪-absolute constant of this world, and the bands the validator checks the cards against. */
  econ: { loanUnit: 100000, autoUnit: 50000, ddMinFee: 15000, sideReportFee: 400, tipDoodad: 1500000, doodadWealth: 0.004, band: { deal: [400000, 60000000], monthly: [-60000, 300000] } },
  /** Per-world system tables (I4): the cycle moves demand (cfOther multiplies `tour`), hotels hide hotel problems, competition is hard. */
  systems: {
    cycle: { amp: 0.4 },   // the cycle moves demand (× cfOther); hotels run on thin margins, so amp 1 turned every recession into a wipe-out
    rivals: { preset: 'HARD', roiCuts: [12, 22] },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 15000,
      pool: [['rush', 'המוכר ממהר למכור'], ['reviews', 'הביקורות ברשת ישנות — או נמחקו'], ['roof', 'הגג והמיזוג לא שופצו 15 שנה'], ['license', 'רישיון המטבח בתהליך חידוש'], ['staff', 'מנהל המלון עוזב עם המוכר'], ['books', 'התפוסה "לפי הערכה" — אין דוחות']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] }, // every life chain runs here too (life is unchanged)
  models: { hotel: 'hotel_beach', resort: 'resort', spa: 'spa', conference: 'conference', waterpark: 'waterpark', apts: 'apartments', restaurant: 'restaurant', dive: 'dive_center', housing: 'staff_housing', stake: 'hotel_beach', side: 'restaurant', biz: 'restaurant' },
  kinds: {
    hotel: { label: 'מלון', debtLabel: 'משכנתא' }, resort: { label: 'ריזורט', debtLabel: 'משכנתא' }, spa: { label: 'ספא במדבר', debtLabel: 'משכנתא' },
    conference: { label: 'מרכז כנסים', debtLabel: 'משכנתא' }, waterpark: { label: 'פארק מים', debtLabel: 'הלוואה' }, apts: { label: 'דירות נופש', debtLabel: 'משכנתא' },
    restaurant: { label: 'מסעדה', debtLabel: 'הלוואה' }, dive: { label: 'מרכז צלילה', debtLabel: 'הלוואה' }, housing: { label: 'מגורי עובדים', debtLabel: 'משכנתא', rent: true },
    side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: STAKE_KIND,
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'hotelier', gender: 'f', age: 41, family: { partner: 'married', kids: 2 }, name: 'מלונאית דור שני', icon: 'hotel', maxMonths: 66, stars: { t2: 57, t3: 39 },
      desc: 'מלון חוף של 120 חדרים, מוניטין חזק — וגם עלויות קבועות ענקיות. החורף הראשון מגיע בחודש השני.',
      pros: ['רואה את קצב ההזמנות טוב יותר (תחזית צרה פי 2)', 'מוניטין 70: מחיר יוקרה עובד מהיום הראשון'],
      cons: ['עלויות קבועות של כ־₪830 אלף בחודש', 'בניין ישן: +8% עלויות עד שיפוץ (₪6 מיליון)', 'החורף מתחיל בחודש השני'],
      salary: 45000, cash: 1800000,
      expenses: [['משכנתא על הבית', 14000], ['רכב', 4500], ['אוכל ובילויים', 12000], ['ילדים וחוגים', 9000], ['ביטוחים ושוטף', 15500]],
      assets: [H('מלון החוף של המשפחה', 'מלון חוף ותיק, 120 חדרים. אורחים קבועים — ובניין שצריך שיפוץ.', 30000000, 9000000, { ...beach, kind: 'room', u: 120, adr: 470, fixed: 832000, rate: 0.5, rep: 70, old: true }, { grow: 0.002 })] },
    { id: 'restaurateur', gender: 'm', age: 38, family: { partner: 'married', kids: 1 }, name: 'שף ובעל מסעדות חוף', icon: 'chef', maxMonths: 80, stars: { t2: 74, t3: 48 },
      desc: 'שתי מסעדות על הטיילת שאתה מנהל בעצמך. ההכנסה שלך היא עבודה — עד שתגייס מנהלים.',
      pros: ['גיוס מנהל בחצי מחיר', 'צוות עונתי לא פוגע במוניטין של המסעדות', 'עלויות גמישות: המסעדות שורדות חורף'],
      cons: ['ההכנסה מהמסעדות נחשבת עבודה, לא ליעד', 'קנה מידה קטן: צריך לקנות חדרים'],
      salary: 18000, cash: 4500000,
      expenses: [['משכנתא', 11000], ['רכב', 3500], ['אוכל ושוטף', 9000], ['ילד ומשפחה', 6500], ['ביטוחים', 4000], ['עזרה להורים', 14000]],
      assets: [
        H('מסעדת הדגים על הטיילת', 'שולחנות על החול. בקיץ תור, בחורף שקט.', 2000000, 2000000, { ...beach, base: 0.85, var: 0.38, kind: 'seat', u: 110, adr: 110, fixed: 139000, rate: 0.55, owner: true, mgrWage: 25000 }, { k: 'restaurant', grow: 0.002 }),
        H('הביסטרו של המרינה', 'ביסטרו קטן ליד המרינה. סועדים קבועים מהיאכטות.', 2000000, 2000000, { ...beach, base: 0.85, var: 0.38, kind: 'seat', u: 110, adr: 110, fixed: 139000, rate: 0.55, owner: true, mgrWage: 25000 }, { k: 'restaurant', grow: 0.002 }),
      ] },
    { id: 'promoter', gender: 'f', age: 35, family: { partner: 'together', kids: 0 }, name: 'מפיקת פסטיבלים', icon: 'music', maxMonths: 80, stars: { t2: 62, t3: 40 },
      desc: 'הרבה מזומן ואפס נכסים. יודעת למלא עיר בחורף — אבל פסטיבל עוזר גם למתחרים.',
      pros: ['יכולה להפיק פסטיבל בחודש חלש (₪300 אלף; ביקוש +0.3 לכל העיר)', 'יותר סיכוי במשא ומתן מול מפעילי תיירות'],
      cons: ['אין הכנסה מנכסים בכלל בהתחלה', 'הכל נקנה במחיר שוק', 'פסטיבל ממלא גם את המלונות של המתחרים'],
      salary: 25000, cash: 8000000,
      expenses: [['שכירות', 12000], ['רכב', 4000], ['אוכל ובילויים', 14000], ['נסיעות עבודה', 12000], ['ביטוחים ושוטף', 20000]] },
  ],

  starterDeal: H('בית הארחה קטן', 'עשרה חדרים מול הים. בעלים מבוגרים רוצים לנוח.', 2500000, 750000, { ...beach, kind: 'room', u: 12, adr: 420, fixed: 75000, rate: 0.55 }),

  deals: [
    H('מלון בוטיק 40 חדרים', 'קרוב לחוף, עיצוב יפה, אורחים מאירופה בקיץ.', 9000000, 2700000, { ...beach, kind: 'room', u: 40, adr: 420, fixed: 246000, rate: 0.55 }),
    H('מלון בוטיק על הצוק', '30 חדרים עם נוף למפרץ. מוניטין טוב מההתחלה.', 7000000, 2100000, { ...beach, kind: 'room', u: 30, adr: 450, fixed: 202000, rate: 0.55, rep: 75 }),
    H('ריזורט 200 חדרים', 'הכל כלול, שלוש בריכות. בקיץ מכונת כסף — ובחורף מכונה שאוכלת כסף.', 60000000, 18000000, { ...beach, kind: 'room', u: 200, adr: 600, fixed: 1807000, rate: 0.5 }, { k: 'resort', q: 'הממוצע השנתי יפה. עכשיו תסתכל על ינואר: כמה הוא מפסיד בחודש, וכמה חודשים כאלה יש לך כרית?' }),
    H('ריזורט משפחות 120 חדרים', 'מועדון ילדים ובריכת גלים. משפחות בחגים ובקיץ.', 30000000, 9000000, { ...beach, kind: 'room', u: 120, adr: 520, var: 0.28, fixed: 901000, rate: 0.5 }, { k: 'resort' }),
    H('מלון משפחות 80 חדרים', 'בלי הפתעות: מלא בקיץ, חצי ריק בחורף.', 16000000, 4800000, { ...beach, kind: 'room', u: 80, adr: 430, fixed: 520000, rate: 0.55 }),
    H('ספא במדבר 60 חדרים', 'מעיינות חמים בין ההרים. מלא בחורף, ריק באוגוסט.', 14000000, 4200000, { ...winter, kind: 'room', u: 60, adr: 500, fixed: 459000, rate: 0.55 }, { k: 'spa', q: 'הנכס הזה מרוויח דווקא כשהחוף ריק. מה זה עושה לממוצע השנתי שלך?' }),
    H('לודג\' מדברי 24 חדרים', 'בקתות אבן, שמיים מלאי כוכבים, טיולי ג\'יפים בחורף.', 6000000, 1800000, { ...winter, kind: 'room', u: 24, adr: 480, fixed: 172000, rate: 0.55 }, { k: 'spa' }),
    H('חניון אוהלי יוקרה', '20 אוהלים מעוצבים במדבר. קטן, זול להחזקה.', 4000000, 1200000, { ...winter, kind: 'room', u: 20, adr: 380, var: 0.2, fixed: 123000, rate: 0.55 }, { k: 'spa' }),
    H('מרכז כנסים', 'אולם ל־800 איש ו־80 חדרים. חברות מגיעות בחורף, כשהטיסות זולות.', 22000000, 6600000, { ...winter, kind: 'room', u: 80, adr: 780, var: 0.3, fixed: 926000, rate: 0.55 }, { k: 'conference', q: 'כנסים בחורף, חוף בקיץ. מה קורה לתזרים של כל השנה כשיש לך את שניהם?' }),
    H('מלון כנסים וחוף', 'חצי מלון חוף, חצי אולמות. אף חודש לא מבריק — אף חודש לא ריק.', 18000000, 5400000, { prof: 'mixed', base: 0.95, var: 0.27, kind: 'room', u: 70, adr: 520, fixed: 596000, rate: 0.55 }, { k: 'conference' }),
    H('פארק מים', 'מגלשות, בריכת גלים, אלף מבקרים ביום בקיץ. סגור מנובמבר עד פברואר.', 25000000, 7500000, { ...park, u: 1000, adr: 75, fixed: 1167000, rate: 0.55 }, { k: 'waterpark', q: 'ארבעה חודשים בשנה הוא סגור — ועדיין משלם עובדים, ביטוח וריבית. כמה כרית צריך לחורף?' }),
    H('פארק שפריץ לילדים', 'פארק מים קטן ליד הטיילת.', 9000000, 2700000, { ...park, u: 400, adr: 70, fixed: 438000, rate: 0.55 }, { k: 'waterpark' }),
    H('6 דירות נופש', 'דירות בבניין אחד, מושכרות דרך אתר. עמלת הפלטפורמה 15%.', 7000000, 2100000, { ...flat, kind: 'room', u: 6, adr: 1100, fixed: 60000, rate: 0.5 }, { k: 'apts', grow: 0.004 }),
    H('10 דירות נופש בקומפלקס', 'קומפלקס עם בריכה. משפחות מכל הארץ, כל השנה.', 11000000, 3300000, { ...flat, kind: 'room', u: 10, adr: 1050, fixed: 97000, rate: 0.5 }, { k: 'apts', grow: 0.004 }),
    { k: 'housing', n: 'בניין מגורים לעובדים', d: '40 דירות קטנות לעובדי המלונות. העובדים שלך גרים קרוב — וזה חוסך 5% מהעלויות הקבועות של החדרים שלך.', cost: 5000000, down: 1500000, cf: 12000, value: 5000000, grow: 0.003,
      q: 'הוא מכניס מעט — אבל חוסך בכל מלון שלך. כמה הוא שווה לך באמת?' },
    H('מסעדה על החוף', 'מאה ועשרים מקומות על החול. אתה עומד במטבח — או מגייס מנהל.', 3000000, 1000000, { ...beach, base: 0.85, var: 0.38, kind: 'seat', u: 120, adr: 110, fixed: 146000, rate: 0.55, owner: true, mgrWage: 25000 }, { k: 'restaurant', q: 'כל עוד אתה עובד בה — זו משכורת, לא הכנסה פסיבית. כמה תישאר לך אחרי שכר מנהל?' }),
    H('בר חוף', 'מוזיקה, שקיעות, ומשקאות יקרים. רק בקיץ באמת.', 2000000, 700000, { ...beach, base: 0.85, var: 0.36, kind: 'seat', u: 90, adr: 95, fixed: 98000, rate: 0.55, owner: true, mgrWage: 18000 }, { k: 'restaurant' }),
    H('מרכז צלילה', 'שוניות אלמוגים, מדריכים מנוסים, סירה אחת.', 1500000, 500000, { ...beach, base: 0.85, var: 0.3, kind: 'seat', u: 40, adr: 220, fixed: 121000, rate: 0.55, owner: true, mgrWage: 12000 }, { k: 'dive' }),
    H('מלון חוף במחיר מציאה', '60 חדרים צמוד לים, חצי מהשוק. הביקורות... פחות.', 6000000, 1800000, { ...beach, kind: 'room', u: 60, adr: 420, fixed: 387000, rate: 0.55, rep: 30 }, { value: 6500000, q: 'מחיר מציאה, מיקום מעולה. אז למה המוכר ממהר? תבדוק את המוניטין — ומה קורה למחיר יוקרה כשהאורחים לא מאמינים לו.' }),
    H('פארק מים שנבנה עד חצי', 'הבונה פשט רגל. השלד מוכן, עוד 8 חודשים עבודה — ועד אז רק הוצאות.', 15000000, 4500000, { ...park, u: 700, adr: 72, fixed: 798000, rate: 0.55 }, { k: 'waterpark', closedFor: 8, value: 16000000, q: 'הממוצע על הכרטיס הוא אחרי הפתיחה. כמה חודשים של הוצאות בלי הכנסה צריך לשרוד עד אז?' }),
    H('מלון של רשת בחוזה ניהול', '100 חדרים. הרשת מנהלת לעשר שנים וקובעת את המחירים — אתה רק מקבל את הרווח.', 20000000, 6000000, { ...beach, kind: 'room', u: 100, adr: 470, fixed: 734000, rate: 0.5, lock: true }, { q: 'תזרים יציב — אבל אי אפשר לשנות מחירים לפי העונה. כמה זה שווה לך?' }),
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'פיזור רחב, בלי חדרים ובלי עונות.' },
  ],
  goldenChance: 1 / 30,
  golden: [
    H('מלון בכינוס נכסים', '120 חדרים על החוף. הבנק רוצה לסגור מהר — בהנחה של 40%.', 18000000, 5400000, { ...beach, kind: 'room', u: 120, adr: 470, fixed: 832000, rate: 0.5 }, { value: 30000000 }),
    H('ספא במכרז', 'הבעלים נפרדו, הספא נמכר במכרז מהיר.', 8000000, 2400000, { ...winter, kind: 'room', u: 60, adr: 500, fixed: 459000, rate: 0.55 }, { k: 'spa', value: 14000000 }),
    H('דירות נופש מעיזבון', 'שש דירות מעיזבון. היורשים רוצים מזומן.', 4500000, 1350000, { ...flat, kind: 'room', u: 6, adr: 1100, fixed: 60000, rate: 0.5 }, { k: 'apts', value: 7000000 }),
  ],

  doodads: [
    { n: 'יאכטה במרינה', aMult: 1.5, inst: true, q: 'יאכטה במרינה ליד המלון. כמה חודשי חורף היא עולה?' },
    { n: 'מסיבת סוף עונה לכל העיר', aMult: 0.4, q: 'כולם יבואו. השאלה מה נשאר לחורף.' },
    { n: 'רכב שטח חשמלי', aMult: 0.6, inst: true, q: 'הוא שקט ויפה. גם החוב — שקט.' },
    { n: 'וילה על הצוק', aMult: 2.0, inst: true, q: 'נוף מטורף, משכנתא מטורפת. מה היא מכניסה?' },
    { n: 'חופשה באיים', aMult: 0.3, q: 'בעל מלון שיוצא לחופשה בחודש הכי עמוס?' },
    { n: 'תיקון מערכת מיזוג בבית', aMult: 0.25, need: true, d: 'קיץ של 45 מעלות. אין ויכוח.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'ביטוח מפני שיטפונות', aMult: 0.3, need: true, inst: true, d: 'חובה לכל מי שגר ליד הוואדי.', q: 'יש הוצאות שאי אפשר לדלג עליהן.' },
    { n: 'שעון צלילה מזהב', aMult: 0.15, q: 'עמיד למים. לא עמיד להוצאות.' },
  ],

  market: [
    { mk: 'tour', dT: 0.25, months: 1, k: 'tourism', n: 'פסטיבל ג\'אז חורפי', d: 'מוזיקאים מכל העולם. החודש העיר מלאה גם בחורף.' },
    { mk: 'tour', dT: -0.2, months: 2, k: 'tourism', n: 'חברות תעופה זרות מבטלות טיסות', d: 'חודשיים עם פחות טיסות מאירופה. התפוסה יורדת בכל העיר.', q: 'כשכל המלונות בעיר תלויים באותם מטוסים — כולם נופלים יחד. מה מחזיק אותך?' },
    { mk: 'anchor', dT: 0.08, k: 'tourism', n: 'קו טיסות ישיר מאירופה', d: 'קו חדש, כל יום, לכל השנה. הביקוש בעיר עולה לתמיד.' },
    { mk: 'tour2', months: 1, k: 'tourism', parts: [{ dT: -0.1, prof: ['beach', 'waterpark'] }, { dT: -0.05, prof: ['winterSun'] }], n: 'גל חום', d: 'חודש של 46 מעלות. פחות אנשים על החוף, קצת פחות גם במדבר.' },
    { mk: 'storm', amt: 300000, k: 'tourism', n: 'סערה מציפה את הטיילת', d: 'גלים מעל הטיילת. כל נכס על החוף צריך תיקון של ₪300 אלף.' },
    { mk: 'rival', cut: 0.05, prof: ['beach'], k: 'tourism', n: 'מגה־ריזורט חדש נפתח', d: 'אלף חדרים חדשים על החוף. הביקוש לכל מלון חוף קטן ב־5% — לתמיד.' },
    { mk: 'tour', dT: -0.15, months: 1, k: 'tourism', n: 'שביתה בשדה התעופה', d: 'חודש בלי טיסות פנים. מי שהזמין — מבטל.' },
    { k: 'sell', type: ['hotel', 'resort'], mult: 1.15, n: 'רשת בינלאומית קונה מלונות', d: 'מציעים פי 1.15 מהשווי על כל מלון וריזורט שלך.' },
    { k: 'sell', type: ['apts', 'spa'], mult: 1.1, n: 'קרן נדל"ן קונה נכסי נופש', d: 'פי 1.1 מהשווי על דירות נופש וספא.' },
    { k: 'reval', kind: 'hotel', mult: 1.08, n: 'שמאי: מלונות בעיר שווים יותר', d: 'כל מלון שלך שווה 8% יותר.' },
    { k: 'price', tk: 'IDX', p: 115, n: 'הבורסה בשיא', d: 'קרן המדד עלתה ל־115.' },
  ],

  crises: [
    { mk: 'slump', dT: -0.3, months: 2, prof: ['beach', 'waterpark'], n: 'שפל תיירות אזורי', d: 'חודשיים שבהם תיירי החוף לא מגיעים. כל נכס על החוף נפגע — יחד. הספא והכנסים במדבר כמעט לא מרגישים.', q: 'סיכון שפוגע בכל הנכסים בבת אחת לא מפזרים עם עוד נכס חוף. מה כן מחזיק?' },
    { mk: 'slump', dT: -0.15, months: 2, noSalary: true, n: 'מבצע צבאי באזור', d: 'חודש בלי משכורת, וחודשיים של ביטולים.' },
    { n: 'תקלת מערכות בכל העיר', d: 'החשמל והאינטרנט נפלו לשבוע. החזרים לאורחים.', cash: -250000, cashLabel: 'החזרים לאורחים' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 400000, title: 'מענק משרד התיירות', text: 'מענק לשיפוץ חדרים: ₪400,000.', after: 'מענק הוא רגע לחשוב: כרית לחורף, חוב לסגור, או חדרים חדשים?' },
    { w: 6, kind: 'cash', amount: -250000, title: 'תביעה של אורח', text: 'אורח החליק בבריכה. עורכי דין עולים כסף.', after: 'גם במלון מצליח יש הוצאות לא צפויות. כרית — תמיד.' },
    { w: 3, kind: 'golden', title: 'טלפון מהבנק' },
    { w: 3, kind: 'raise', amount: 6000, title: 'הרצאות לחברות', text: 'הזמינו אותך להרצות. המשכורת עולה ב־₪6,000 בחודש.', after: 'עוד מזומן כל חודש = עוד כרית לחורף.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'אוגוסט, המלון מלא ויש תור להזמנות. מה הכי חכם לעשות עם המחיר?', answers: ['להוריד מחיר כדי למשוך עוד אורחים', 'להעלות מחיר — החדרים יימכרו בכל מקרה', 'להשאיר כמו בחורף'], correct: 1, reward: 'lesson', lesson: 'capacity_pricing', explain: 'כשאין חדר פנוי, מחיר נמוך לא מביא עוד אורחים — אין לאן. מחיר גבוה מוכר את אותם חדרים ביותר כסף.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'המלון הרוויח ₪500 אלף ביולי. כמה מזה מותר להוציא?', answers: ['הכל — זה רווח', 'מה שנשאר אחרי שמכסים את חודשי החורף שבדרך', 'כלום, אף פעם'], correct: 1, reward: 'lesson', lesson: 'seasonal_year', explain: 'בעסק עונתי הקיץ משלם את החורף. רווח של חודש טוב הוא חלק מהממוצע של השנה — לא בונוס.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מפעיל תיירות מציע לקנות חצי מהחדרים לחודשים ינואר–יוני בהנחה של 22%, ומשלם חצי מראש. מתי זה כדאי?', answers: ['תמיד, כסף מראש זה הכי טוב', 'כשהחודשים האלה חלשים, והחדרים היו נשארים ריקים', 'אף פעם, הנחה זה הפסד'], correct: 1, reward: 'lesson', lesson: 'allotment', explain: 'הנחה על חדר שהיה נשאר ריק היא רווח. הנחה על חדר שהיה נמכר במחיר מלא היא הפסד. מה שקובע זה הביקוש בחודשים האלה.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד גדול יותר: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'עוד אין לך נכסים שמכניסים. בעיר הזאת ההכנסה מגיעה מחדרים מלאים — לא מהמשכורת.',
    paydayN: ['הנכסים הכניסו החודש {pct} מההוצאות האישיות שלך. אבל היעד נמדד בממוצע של שנה — חודש אחד לא קובע.', 'עוד חודש בממוצע השנתי. בקיץ שומרים לחורף.'],
    dealAsk: ['ממוצע שנתי הוא רק חצי מהסיפור. תסתכל על החודש הכי חלש: כמה כרית צריך בשבילו?', 'באיזו עונה הנכס הזה מרוויח — ומה כבר יש לך בעונה הזאת?'],
    buyGood: 'בממוצע: {cf} בחודש, {roi} בשנה על ההון. אבל לא כל חודש — בחורף הוא יכול להפסיד. תבנה תוכנית מחירים ושמור כרית.',
    allotAsk: ['כסף עכשיו בהנחה, או לחכות לאורחים שמשלמים מחיר מלא? תסתכל על החודשים שבדרך.', 'מפעיל שקונה חדרים מראש מוריד לך סיכון. השאלה אם החדרים האלה היו נמכרים ממילא.'],
    allotYes: 'קיבלת {amount} מראש. חלק מהחדרים מכורים לחצי שנה — גם בחודשים חלשים, וגם בחזקים.',
    allotNo: 'ויתרת. החדרים נשארים בשוק — במחיר מלא, ובסיכון מלא.',
    allotLost: 'המפעיל הלך למלון של המתחרים. משא ומתן הוא סיכון.',
    allotWon: 'המפעיל הסכים ל־12% הנחה. עכשיו להחליט: לקבל או לוותר.',
    winterBurn: 'חודש חלש: הנכסים שלך מפסידים החודש. בשביל זה שומרים מהקיץ — ומכינים תוכנית מחירים לחורף.',
    linePaid: 'סגרת את הקו העונתי. ככה משתמשים בו: לוקחים בחורף, מחזירים כשהקיץ מגיע.',
    lineConverted: 'הקו העונתי ({amount}) לא נסגר עד אוגוסט — הוא הפך להלוואה רגילה, ועוד עמלה של {fee}.',
    sellAsk: 'מכירה בשיא העונה נראית מצוין. רק תזכור: אתה מוכר גם את הקיצים הבאים.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. בעיר הזאת מנצחים בממוצע של שנה: תמחור לפי עונה, כרית לחורף, ונכסים לכמה עונות.',
    won: 'שנה שלמה של הכנסה יציבה מהנכסים — קיץ וחורף. זה כבר לא מזל של עונה, זו מערכת.',
  },
};
