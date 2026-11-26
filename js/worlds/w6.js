// World 6 — אזור התעשייה ("פארק התעשייה בנגב"). Goal: net worth ₪80M, where every production line is valued on its sustainable profit ×
// the cycle's multiple × its condition (js/worlds/mech/plant.js lineValue) — deferred maintenance is lost value on the day that counts.
// Mechanic module `plant`: lines with capacity, condition and a maintenance policy; one sealed breakdown draw per line slot per payday;
// shifts (capacity vs wear); 24-month supply contracts on the new 'C' tile (fixed volume, lower price, penalties) vs spot orders that follow
// the cycle; new lines ordered with a deposit and delivered after 6 months; mothball / sell / leaseback / factoring as recovery.
// Spec: docs/full-upgrade/worlds/w6-industry.md. Every number is TUNE (tools/sim.mjs --world-gates N w6, tools/balance-data/gates-w6.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w6')); NOT in WORLDS (no daily rotation); not ranked until the DB migration (meta.ranked).
// minRules 6. Visuals live render-side (WORLD_STYLE.w6 in js/render/vocab.js); `theme` here only keeps legacy render code working.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import plant, { lineCard } from './mech/plant.js';

const board = ring(['OCODLOMOI', 'OMCOXL?OD', 'OOMOEODLO', 'OXMCTO?MD']); // 40 tiles, paydays on the corners, 3 × 'C' (חוזה אספקה)

// lineCard: y = EBITDA yield on cost a year in a normal month, fk = fixed costs ÷ EBITDA (operating leverage), cm = contribution margin,
// spot = base spot demand (share of one-shift capacity), cond = condition, order = a new line (30 % deposit, delivered after 6 months).
const L = (o) => lineCard(o);

export default {
  id: 'w6', order: 6, name: 'אזור התעשייה', mechanic: 'plant', minRules: 6, mech: [plant],
  tagline: 'מפעל משפחתי בנגב. יש הזמנות — השאלה אם המכונות יחזיקו, ומה עושים עם קו שעומד ריק אבל עולה כסף כל חודש.',
  goalLabel: 'שווי נקי של ₪80 מיליון (המפעלים לפי רווח ומצב)',
  lesson: 'קיבולת שלא מנוצלת עולה כסף כל חודש. תחזוקה שנדחית לא נחסכת: היא חוזרת עם ריבית, כתקלה, וכשווי נמוך יותר ביום המכירה. מינוף תפעולי מגדיל רווח בגאות ומכה בשפל.',
  story: 'יצאת מהמירוץ, ועברת לליגה של מפעלים. בפארק התעשייה בנגב יש הזמנות — אבל גם עלויות קבועות שלא עוצרות כשהשוק עוצר. המטרה: חברה ששווה ₪80 מיליון — לפי מה שהיא מרוויחה באמת ובמצב שהמכונות שלה נמצאות בו.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w6 (render lane)
    sky: ['#cfd8dc', '#f5f0e6'], fog: '#e7e2d8', board: '#d6d3cd', boardEdge: '#4b5563', center: '#e7e5e4', accent: '#f97316',
    light: { hemiSky: '#f5f0e6', hemiGround: '#9ca3af', sun: '#fde7c7' }, decor: 'stacks',
  },
  board,
  tiles: tilesFor(board, { C: { name: 'חוזה אספקה' }, X: { name: 'משבר בתעשייה' }, M: { name: 'השוק' } }),
  // bank loans: 1.4 % a month (+ credit band + cycle), up to 6 × monthly income; forced loans in ₪250k steps. Lines carry their own debt (op.rate).
  loan: { unit: 250000, autoUnit: 250000, pct: 1.4, cap: 6, bankrupt: 60 }, // bankrupt: × personal expenses (≈ ₪2.7M of negative net worth) — scaled to a world where one line costs ₪5–45M
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'netWorth', target: 80000000, hold: 2 },
  maxMonths: 72,
  stars: { t2: 58, t3: 46 },
  start: {},
  doodadWealth: 0.002,
  tipDoodad: 3000000,
  bounds: { nwMax: 5000000000, passiveMax: 200000000 },
  econ: { loanUnit: 250000, autoUnit: 250000, ddMinFee: 40000, sideReportFee: 400, tipDoodad: 3000000, doodadWealth: 0.002, band: { deal: [3000000, 80000000], monthly: [-500000, 1500000] } },
  systems: {
    cycle: { amp: 1.0 },
    rivals: { preset: 'NORMAL' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 40000,
      pool: [['bearings', 'המסבים והגירים לא הוחלפו מעולם'], ['hours', 'מונה השעות "אופס" לפני שנתיים'], ['customer', 'רוב ההזמנות מלקוח אחד'], ['spares', 'אין חלקי חילוף — היצרן סגר את הקו'], ['permit', 'היתר הרעלים בתהליך חידוש'], ['books', 'הרווח "לפי ההנהלה" — אין דוחות מבוקרים']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { cnc: 'factory_cnc', plastic: 'factory_plastic', food: 'factory_food', recycle: 'factory_recycle', metal: 'factory_metal', pack: 'factory_pack', warehouse: 'warehouse', stake: 'factory_metal', side: 'warehouse', biz: 'warehouse' },
  kinds: {
    cnc: { label: 'קו CNC', debtLabel: 'הלוואת ציוד' }, plastic: { label: 'הזרקת פלסטיק', debtLabel: 'הלוואת ציוד' }, food: { label: 'מפעל מזון', debtLabel: 'הלוואה' },
    recycle: { label: 'מפעל מיחזור', debtLabel: 'הלוואה' }, metal: { label: 'מסגרייה', debtLabel: 'הלוואת ציוד' }, pack: { label: 'קו אריזה', debtLabel: 'הלוואת ציוד' },
    warehouse: { label: 'מחסן לוגיסטי', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'opseng', gender: 'f', age: 36, family: { partner: 'married', kids: 2 }, name: 'מהנדסת תפעול', icon: 'gear', maxMonths: 80, stars: { t2: 64, t3: 50 },
      desc: 'קו CNC אחד במצב מצוין, חסכונות לצמיחה ועין שרואה כל רעד במכונה. אבל מפעל של קו אחד הוא מפעל קטן.',
      pros: ['רואה את הסיכוי המדויק לתקלה בכל קו', 'תחזוקה מונעת עולה לה 25% פחות'],
      cons: ['קטנה: קו אחד', 'כל קו חדש הוא החלטה גדולה: אין ניסיון עם חוזים ומשמרות'],
      salary: 38000, cash: 13000000,
      expenses: [['משכנתא', 9500], ['רכב', 3500], ['אוכל ושוטף', 9000], ['ילדים וחוגים', 7000], ['ביטוחים', 5000]],
      assets: [L({ k: 'cnc', n: 'קו ה־CNC של נועה', d: 'קו עיבוד שבבי מדויק. מטופל היטב.', cost: 8000000, down: 5000000, cond: 90, fk: 0.8, cm: 0.4, spot: 0.95, y: 0.2 })] },
    { id: 'heir', gender: 'm', age: 44, family: { partner: 'married', kids: 3 }, name: 'יורש מפעל המזון', icon: 'factory', maxMonths: 72, stars: { t2: 60, t3: 46 },
      desc: 'מפעל מזון גדול עם לקוחות קבועים — וקווים ישנים, חוב גדול והסכם עבודה שאי אפשר לגעת בו בשנה הראשונה.',
      pros: ['בסיס גדול: מפעל של ₪45 מיליון', 'חוזה קיים עם רשת שיווק ל־18 חודשים'],
      cons: ['הקווים ישנים: תקלות בקרוב', 'הסכם עם הוועד: עלויות קבועות +15%, ואי אפשר להשבית או למכור 12 חודשים', 'חוב של ₪28 מיליון'],
      salary: 30000, cash: 2500000,
      expenses: [['משכנתא', 12000], ['רכב', 4500], ['אוכל ושוטף', 11000], ['ילדים וחוגים', 9000], ['ביטוחים ושוטף', 7500]],
      assets: [{ ...L({ k: 'food', n: 'מפעל המזון של המשפחה', d: 'שלושה קווי ייצור תחת גג אחד. ותיק, רווחי — ועייף.', cost: 45000000, down: 17000000, cond: 45, fk: 1.3, cm: 0.3, spot: 0.9, y: 0.24, union: true, contract: { vol: 0.5, price: 0.95, months: 18 } }), lockFixed: 12 }] },
    { id: 'trader', gender: 'm', age: 40, family: { partner: 'together', kids: 1 }, name: 'סוחר מתכות', icon: 'box', maxMonths: 76, stars: { t2: 62, t3: 48 },
      desc: 'הרבה מזומן ואפס קווים. יודע לקנות ולמכור — אבל קו חדש לוקח חצי שנה להגיע.',
      pros: ['מוכר בשוק הפתוח ב־5% יותר', 'משא ומתן: יותר סיכוי בכל בקשה'],
      cons: ['אין קיבולת: צריך לקנות או להזמין', 'קו חדש מגיע רק אחרי 6 חודשים'],
      salary: 25000, cash: 15000000,
      expenses: [['שכירות', 11000], ['רכב', 4000], ['אוכל ובילויים', 12000], ['נסיעות', 6000], ['ביטוחים ושוטף', 6000]] },
  ],

  starterDeal: L({ k: 'metal', n: 'מסגרייה קטנה', d: 'מסגרייה עם לקוחות מהאזור. בעלים מבוגר רוצה לפרוש.', cost: 3000000, down: 900000, cond: 80, fk: 0.6, cm: 0.42, spot: 0.9 }),

  deals: [
    L({ k: 'cnc', n: 'קו CNC חדש', d: 'קו עיבוד שבבי חדש מהיצרן. מקדמה עכשיו, מסירה בעוד חצי שנה.', cost: 8000000, down: 2400000, cond: 100, fk: 0.8, cm: 0.4, spot: 0.95, order: true, q: 'חצי שנה בלי הכנסה מהקו — והשוק בעוד חצי שנה יכול להיות אחר. כמה כרית צריך עד אז?' }),
    L({ k: 'cnc', n: 'קו CNC משומש', d: 'קו במצב סביר ממפעל שעבר לחו"ל. זמין מיד.', cost: 5000000, down: 1500000, cond: 60, fk: 0.8, cm: 0.4, spot: 0.95, used: true, q: 'זול ומיידי. אבל כמה שעות עבדה המכונה הזאת — ומי בדק?' }),
    L({ k: 'plastic', n: 'מכונת הזרקת פלסטיק', d: 'מכונה חדשה לחלקים לרכב ולמכשירי חשמל. מסירה בעוד 6 חודשים.', cost: 15000000, down: 4500000, cond: 100, fk: 1.0, cm: 0.35, spot: 0.95, order: true }),
    L({ k: 'plastic', n: 'מכונת הזרקה משומשת', d: 'מכונה מפעל שנסגר. עובדת — לפי המוכר.', cost: 9000000, down: 2700000, cond: 55, fk: 1.0, cm: 0.35, spot: 0.95, used: true }),
    L({ k: 'pack', n: 'קו אריזה אוטומטי', d: 'אורז לכל מפעלי המזון באזור. מסירה בעוד 6 חודשים.', cost: 12000000, down: 3600000, cond: 100, fk: 0.9, cm: 0.38, spot: 0.92, order: true }),
    L({ k: 'food', n: 'מפעל מזון בדימונה', d: 'מפעל עובד עם עובדים ותיקים. עלויות קבועות כבדות — ומכירות יציבות.', cost: 45000000, down: 13500000, cond: 70, fk: 1.3, cm: 0.3, spot: 0.95, y: 0.19, q: 'עלויות קבועות של יותר ממיליון בחודש. מה קורה לו בשנה של מיתון?' }),
    L({ k: 'recycle', n: 'מפעל מיחזור', d: 'ממחזר מתכת ופלסטיק. כשהמשק נחלש, יש יותר גרוטאות — והוא עובד יותר. מסירה בעוד 6 חודשים.', cost: 25000000, down: 7500000, cond: 100, fk: 1.1, cm: 0.33, spot: 0.9, cyc: 'counter', order: true, q: 'כשכל המפעלים שלך נחלשים — הוא מתחזק. מה זה עושה לסיכון של כל החברה?' }),
    L({ k: 'metal', n: 'מסגרייה', d: 'מבנים וקונסטרוקציות לבנייה. זמינה מיד.', cost: 6000000, down: 1800000, cond: 75, fk: 0.7, cm: 0.42, spot: 0.92 }),
    L({ k: 'recycle', n: 'תחנת מיון פסולת', d: 'קטנה, משומשת, עובדת בכל מצב שוק.', cost: 10000000, down: 3000000, cond: 65, fk: 1.0, cm: 0.34, spot: 0.9, cyc: 'counter', used: true }),
    L({ k: 'cnc', n: 'קו "מציאה" מכינוס', d: 'קו CNC במחצית מחיר השוק. "עובד מצוין", אומר הכונס.', cost: 3500000, down: 1050000, cond: 25, fk: 0.8, cm: 0.4, spot: 0.95, y: 0.24, used: true, value: 5000000, q: 'חצי מחיר. אז למה אף אחד לא קנה? תבדוק את המצב — ותחשוב מה תקלה עולה כשיש לך חוזה.' }),
    L({ k: 'food', n: 'מפעל עם לקוח אחד', d: 'מפעל מזון שכל התפוקה שלו הולכת לרשת אחת — במחיר מלא. החוזה מסתיים בעוד חצי שנה.', cost: 30000000, down: 9000000, cond: 75, fk: 1.3, cm: 0.3, spot: 0.7, y: 0.19, contract: { vol: 0.85, price: 1, months: 6 }, q: 'התזרים על הכרטיס הוא של החוזה. מה נשאר אחרי שהוא נגמר, כשהשוק קונה הרבה פחות?' }),
    { k: 'warehouse', n: 'מחסן לוגיסטי', d: 'מושכר לחברת הפצה בחוזה ארוך. בלי מכונות ובלי תקלות.', cost: 10000000, down: 3000000, cf: 70000, value: 10000000, grow: 0.002, q: 'תשואה צנועה, בלי משמרות ובלי תקלות. מתי זה עדיף?' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'פיזור רחב, בלי מכונות.' },
  ],
  goldenChance: 1 / 30,
  golden: [
    L({ k: 'cnc', n: 'קו CNC מבנק שמממש', d: 'קו כמעט חדש. הבנק רוצה לסגור החודש — בחצי מחיר.', cost: 4500000, down: 1350000, cond: 85, fk: 0.8, cm: 0.4, spot: 0.95, value: 8000000 }),
    L({ k: 'plastic', n: 'מכונת הזרקה ממכרז', d: 'מכונה מצוינת ממכרז של משרד הביטחון.', cost: 9000000, down: 2700000, cond: 90, fk: 1.0, cm: 0.35, spot: 0.95, value: 15000000 }),
  ],

  doodads: [
    { n: 'רכב מנהלים', aMult: 0.6, inst: true, q: 'רכב יפה לחניה של המפעל. כמה חודשי תחזוקה של קו הוא עולה?' },
    { n: 'אירוע לכל העובדים', aMult: 0.3, q: 'העובדים מרוצים. השאלה אם הקווים מרוצים.' },
    { n: 'משרד מעוצב בתל אביב', aMult: 1.2, inst: true, q: 'המפעל בנגב. מה המשרד מייצר?' },
    { n: 'יאכטה', aMult: 1.8, inst: true, q: 'מה עדיף: יאכטה, או קו שלא מתקלקל?' },
    { n: 'חופשה משפחתית', aMult: 0.3, q: 'מגיע לך. רק תדאג שמישהו מתחזק את המכונות.' },
    { n: 'תיקון גג בבית', aMult: 0.25, need: true, d: 'חורף ראשון בנגב. אין ויכוח.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'ביטוח אחריות אישית', aMult: 0.3, need: true, inst: true, d: 'חובה לכל דירקטור.', q: 'יש הוצאות שאי אפשר לדלג עליהן.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'מדויק כמו CNC. יקר כמו תקלה.' },
  ],

  market: [
    { mk: 'tariff', pct: 0.12, months: 6, n: 'תעריף החשמל קופץ', d: 'רשות החשמל העלתה את התעריף לתעשייה: העלויות הקבועות של כל קו עולות ב־12% לחצי שנה.', q: 'עלות קבועה שעולה כשההכנסה לא עולה — זה מינוף תפעולי בכיוון הרע.' },
    { mk: 'workers', months: 4, n: 'מחסור בעובדים מקצועיים', d: 'אין עובדים למשמרת לילה. ארבעה חודשים בלי משמרת שלישית.' },
    { mk: 'export', add: 0.35, months: 2, n: 'הזמנת יצוא מגרמניה', d: 'לקוח גרמני קונה כל מה שתייצר — לחודשיים. מי שיש לו קיבולת פנויה מרוויח.', q: 'קיבולת פנויה עולה כסף כל חודש — ופעם בכמה זמן היא שווה זהב. כמה פנויה יש לך?' },
    { mk: 'raw', supply: 0.7, months: 2, n: 'מחסור בחומרי גלם', d: 'הספקים לא מספקים: הייצור בכל הקווים יורד ב־30% לחודשיים.' },
    { mk: 'inspect', n: 'ביקורת בטיחות', d: 'משרד העבודה בודק את כל המפעלים באזור. קו במצב ירוד נעצר לחודש.', q: 'תחזוקה שנדחתה לא נחסכת. היא חוזרת — לפעמים כביקורת.' },
    { mk: 'grant', months: 6, n: 'מענק אוטומציה', d: 'רשות החדשנות מממנת 20% מכל שדרוג אוטומציה בחצי השנה הקרובה.' },
    { k: 'price', tk: 'IDX', p: 115, n: 'הבורסה בשיא', d: 'קרן המדד עלתה ל־115.' },
  ],

  crises: [
    { mk: 'custBust', n: 'הלקוח הגדול פשט רגל', d: 'הלקוח הכי גדול שלך בחוזה קרס. החוב שלו אבד, והחוזה נגמר.', q: 'כשלקוח אחד הוא רוב ההזמנות — הוא גם רוב הסיכון.' },
    { n: 'שריפה במחסן חומרי הגלם', d: 'הביטוח מכסה רק חלק.', cash: -400000, cashLabel: 'הנזק שהביטוח לא מכסה' },
    { noSalary: true, n: 'מבצע צבאי באזור', d: 'חודש בלי משכורת. המפעל עובד, אבל לאט.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 600000, title: 'החזר מס על השקעה', text: 'חוק עידוד השקעות הון: החזר של ₪600,000.', after: 'כסף שנכנס פעם אחת: תחזוקה, חוב או קו חדש?' },
    { w: 6, kind: 'cash', amount: -350000, title: 'תביעה של ספק', text: 'ספק תובע על חשבונית שנויה במחלוקת. עורכי דין עולים כסף.', after: 'גם במפעל מצליח יש הוצאות לא צפויות. כרית — תמיד.' },
    { w: 3, kind: 'golden', title: 'טלפון מהבנק' },
    { w: 3, kind: 'raise', amount: 8000, title: 'דירקטוריון', text: 'מינו אותך לדירקטור במפעל שכן. המשכורת עולה ב־₪8,000 בחודש.', after: 'עוד מזומן כל חודש = עוד כרית לתקלה הבאה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'קו עומד חצי מהזמן בלי הזמנות. העלויות הקבועות שלו ₪200 אלף בחודש. מה העלות של הקיבולת הפנויה?', answers: ['אפס, הוא לא מייצר', 'בערך ₪100 אלף בחודש — חצי מהקבועות על קיבולת שלא נמכרת', 'אי אפשר לדעת'], correct: 1, reward: 'lesson', lesson: 'idle_capacity', explain: 'עלויות קבועות משולמות על כל הקיבולת, גם על החלק שעומד. קיבולת שלא מנוצלת עולה כסף כל חודש.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'דחית תחזוקה בשנה שעברה וחסכת ₪300 אלף. מה קרה לכסף הזה?', answers: ['נחסך', 'עבר לשנה הבאה — עם ריבית: יותר תקלות, ושווי נמוך יותר לקו', 'תלוי במזל'], correct: 1, reward: 'lesson', lesson: 'deferred_maintenance', explain: 'תחזוקה שנדחית לא נחסכת. היא חוזרת כתקלה, כחודשי השבתה וכשווי נמוך יותר ביום המכירה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'לקוח מציע חוזה לשנתיים על 50% מהקיבולת ב־15% פחות ממחיר השוק. מתי זה כדאי?', answers: ['תמיד: ביקוש בטוח', 'כשהשוק עומד להיחלש, או כשיש קיבולת פנויה שלא נמכרת', 'אף פעם: הנחה זה הפסד'], correct: 1, reward: 'lesson', lesson: 'contract_spot', explain: 'חוזה הוא ביטוח: בשפל הוא שומר על הקו מלא, בגאות הוא תופס קיבולת שהייתה נמכרת ביוקר. וכשהקו עומד — הקנס רץ.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'ההכנסות של המפעל ירדו ב־20%. בכמה ירד הרווח?', answers: ['ב־20%', 'ביותר מ־20% — העלויות הקבועות לא ירדו', 'בפחות מ־20%'], correct: 1, reward: 'lesson', lesson: 'operating_leverage', explain: 'כשרוב העלויות קבועות, כל שקל הכנסה שנעלם יוצא ישר מהרווח. זה מינוף תפעולי: מגדיל רווח בגאות, ומכה בשפל.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'עוד אין לך קו שמייצר. באזור התעשייה השווי נבנה ממכונות שעובדות — לא מהמשכורת.',
    paydayNW: 'השווי של החברה: {nw}. היעד: {target}. השווי נקבע לפי הרווח הקבוע — ולפי המצב של המכונות.',
    dealAsk: ['כמה מהעלויות של הקו קבועות? זה מה שקובע מה יקרה לו בשנה רעה.', 'מה מצב המכונה? קו זול במצב רע הוא חוב שעוד לא הגיע.'],
    buyGood: 'בחודש רגיל: {cf} בחודש, {roi} בשנה על ההון. בגאות יותר, בשפל הרבה פחות — העלויות הקבועות לא זזות. ותחזוקה: היא מה ששומר על השווי.',
    contractAsk: ['חוזה מוריד סיכון בשפל ועולה כסף בגאות. ומה קורה אם הקו עומד?', 'כמה קיבולת פנויה יש לך באמת — גם בחודש שהקו בתיקון?'],
    contractYes: 'חתמת. עכשיו יש לך ביקוש קבוע — וגם התחייבות קבועה. כל יחידה שלא תסופק עולה קנס.',
    contractNo: 'ויתרת. הקו נשאר בשוק הפתוח — עם המחיר המלא, ועם כל הסיכון.',
    contractWon: 'הלקוח הסכים להנחה קטנה יותר. עכשיו להחליט: לחתום או לוותר.',
    contractLost: 'הלקוח הלך למפעל אחר. משא ומתן הוא סיכון.',
    breakdown: '{name} התקלקל: {months} חודשים בלי ייצור, ותיקון של {repair}.',
    delivered: '{name} הגיע ומותקן. מהחודש הבא הוא מייצר — ויתרת המחיר ({debt}) הפכה לחוב.',
    inspectionStop: 'ביקורת הבטיחות עצרה קו במצב ירוד. תחזוקה שנדחתה חוזרת.',
    sellAsk: 'מכירה בגאות נראית מצוין. רק תזכור: הקונה משלם לפי הרווח הקבוע ולפי מצב המכונה.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. באזור התעשייה מנצחים עם קווים מלאים, תחזוקה בזמן, וחוזים רק על חלק מהקיבולת.',
    won: 'חברה ששווה ₪80 מיליון — לפי רווח אמיתי ומכונות במצב טוב. זו כבר לא עוד שנה טובה, זו מערכת.',
  },
};
