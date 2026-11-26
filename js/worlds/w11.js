// World 11 — התאגיד הבינלאומי ("החברה שלך פועלת בחמש מדינות, בחמישה מטבעות"). Goal: consolidated net worth ≥ ₪800M (subsidiaries at 36 ×
// their trailing profit, local cash at today's FX), hold 2. CATALOG-25 §1.1 / §1.2 (w11), docs/full-upgrade/worlds/w11-multinational.md: the
// new module `multinational` (js/worlds/mech/multinational.js) — delegation under hidden information (managers' competence and integrity are
// sealed; audits and results reveal them), 3 attention slots for self-run subsidiaries, a supply graph with disruptions and dual sourcing,
// 5 currencies (w3's drift / revert model × 5) with per-currency hedges, withholding tax on profits sent home — and the acquisition tile 'Z'
// (הצעת רכישה: a subsidiary for sale with an incumbent manager; due diligence narrows the ranges). Every number is TUNE (gates-w11.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w11')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import multinational from './mech/multinational.js';

const board = ring(['OZOD?LMZL', 'OMZLXO?OD', 'OZOMEODZL', 'OXMZTO?MD']); // 40 tiles, paydays on the corners, 6 × 'Z' (הצעת רכישה)
const SUB = (i) => ({ k: 'sub', n: 'חברה־בת', d: 'חברה־בת בחו"ל.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'sub', start: i } });
const ASSET = (k, n, cost, down, cf, d) => ({ k, n, d, cost, down, value: cost, cf });

export default {
  id: 'w11', order: 11, name: 'התאגיד הבינלאומי', mechanic: 'multinational', modules: ['multinational'], minRules: 7, mech: [multinational],
  tagline: 'חמש מדינות, חמישה מטבעות וספקים בשלוש יבשות. אתה לא יכול להיות בכל מקום — השאלה את מי אתה שם שם, ואיך אתה יודע שהוא עושה עבודה טובה.',
  goalLabel: 'שווי נקי מאוחד של ₪800 מיליון (בשקלים, לפי השער של היום)',
  lesson: 'מי שגדל מעבר לכוחות שלו חייב לסמוך על אחרים — וגם לבדוק אותם. ופיזור בין מדינות עוזר רק אם הספקים שלך לא עוברים כולם באותו נמל.',
  story: 'הקבוצה שלך פועלת בחמש מדינות. בכל חברה־בת יש מנהל שאתה לא באמת מכיר — אולי מצוין, אולי גונב. שתי חברות אתה יכול לנהל בעצמך; את השאר אתה מוסר למנהלים, ובודק אותם בביקורות שעולות כסף. כל חברה קונה מספק במדינה אחרת, וכל רווח שחוזר הביתה משלם מס במקור. המטרה: שווי נקי של ₪800 מיליון.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w11 (render lane)
    sky: ['#020617', '#1e1b4b'], fog: '#0f172a', board: '#134e4a', boardEdge: '#115e59', center: '#0f766e', accent: '#f59e0b',
    light: { hemiSky: '#c7d2fe', hemiGround: '#134e4a', sun: '#fde68a' }, decor: 'globe',
  },
  board,
  tiles: tilesFor(board, { Z: { type: 'acquisition', name: 'הצעת רכישה', color: '#f59e0b', ink: '#3a2400', icon: 'globe' }, O: { name: 'עסקה בחו"ל' }, M: { name: 'חדשות מהעולם' }, X: { name: 'משבר בקבוצה' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'nw', target: 800000000, hold: 2 },
  maxMonths: 84,
  stars: { t2: 68, t3: 56 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 2000000, autoUnit: 1000000, ddMinFee: 500000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [30000000, 400000000], monthly: [-3000000, 8000000] } },
  lessonDefs: [
    { id: 'trust_verify', cat: 'world', title: 'לסמוך ולבדוק', text: 'מי שגדל מעבר לכוחות שלו חייב למסור סמכויות. אבל מנהל שאף אחד לא בודק הוא סיכון שלא רואים — עד היום שבו הוא קורה. ביקורת עולה כסף; היא קונה מידע.' },
    { id: 'supply_chain', cat: 'world', title: 'נמל אחד, הרבה חברות', text: 'פיזור בין מדינות עוזר רק אם הסיכונים לא קשורים. כשכל החברות שלך קונות מאותו ספק, שיבוש אחד פוגע בכולן ביחד. ספק שני עולה כל חודש — ומשתלם בחודש הרע.' },
    { id: 'trapped_cash', cat: 'world', title: 'כסף כלוא בחו"ל', text: 'רווח שנשאר בחו"ל לא משלם מס במקור, אבל הוא חשוף לשער ולא עומד לרשותך בבית. רווח שחוזר הביתה משלם מס — ואפשר להשתמש בו. השאלה היא איפה תצטרך את הכסף.' },
  ],
  systems: {
    cycle: { amp: 0.8 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 500000,
      pool: [['books', 'הדוחות "לפי ההנהלה המקומית"'], ['permit', 'הרישיון המקומי מתחדש בשנה הבאה'], ['client', 'לקוח אחד הוא 40% מהמכירות'], ['ccy', 'החוב של החברה בדולרים'], ['owner', 'המנהל הוא גם בעל המניות של הספק'], ['court', 'יש תביעה פתוחה נגד החברה']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { sub: 'regional_office', office: 'glass_tower', warehouse: 'warehouse', building: 'glass_tower', stake: 'regional_office', side: 'warehouse', biz: 'warehouse' },
  kinds: {
    sub: { label: 'חברה־בת', debtLabel: 'הלוואה' }, office: { label: 'משרדים', debtLabel: 'משכנתא' }, warehouse: { label: 'מחסן', debtLabel: 'משכנתא' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'ceo', gender: 'f', age: 49, family: { partner: 'married', kids: 2 }, name: 'מנכ"לית', icon: 'briefcase', maxMonths: 84, stars: { t2: 68, t3: 56 },
      desc: 'תמר מנהלת בעצמה שלוש חברות־בנות, בשלוש מדינות. היא יודעת בדיוק מה קורה בכל אחת — אבל אין לה עוד שעות ביום.',
      pros: ['קשב לשלוש חברות במקום שתיים', 'שלוש חברות שהיא מנהלת בעצמה'], cons: ['מנהלת הכל בעצמה: מעל שתי חברות — הכוח יורד כל חודש', 'מעט מזומן'],
      salary: 90000, cash: 40000000,
      expenses: [['משכנתא', 22000], ['רכב', 6000], ['אוכל ושוטף', 14000], ['ילדים', 9000], ['ביטוחים ושוטף', 7000]],
      start: { subs: [{ t: 2, size: 0.55, self: true }, { t: 1, size: 0.65, self: true }, { t: 6, size: 0.5, self: true }] }, assets: [SUB(0), SUB(1), SUB(2)] },
    { id: 'oldExporter', gender: 'm', age: 58, family: { partner: 'married', kids: 3 }, name: 'יצואן ותיק', icon: 'ship', maxMonths: 84, stars: { t2: 68, t3: 56 },
      desc: 'יואב מוכר באירופה ובארה״ב כבר שלושים שנה, עם שני מנהלים שהוא מכיר מהיום הראשון. כל הסחורה שלו מגיעה מספק אחד בווייטנאם.',
      pros: ['שני מנהלים שהוא מכיר היטב', 'קשרים עם ספקים: שיבוש פוגע בו בחצי'], cons: ['כל הסחורה מספק אחד'],
      salary: 60000, cash: 60000000,
      expenses: [['דירה', 16000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 5000], ['ביטוחים ושוטף', 6000]],
      start: { subs: [{ t: 1, size: 0.9, known: true, comp: 0.62, integ: 0.9 }, { t: 7, size: 0.8, known: true, comp: 0.55, integ: 0.8 }] }, assets: [SUB(0), SUB(1)] },
    { id: 'pe', gender: 'f', age: 41, family: { partner: 'single', kids: 0 }, name: 'מנהלת קרן רכישות', icon: 'chart', maxMonths: 84, stars: { t2: 68, t3: 56 },
      desc: 'נטע מנהלת קרן עם ₪200 מיליון במזומן ואף חברה. היא קונה בזול ובודקת בחצי מחיר — אבל כל חברה שהיא קונה מגיעה עם מנהל שאיש לא מכיר.',
      pros: ['רכישות ב־10% פחות', 'ביקורת בחצי מחיר', 'הרבה מזומן'], cons: ['אין אף חברה בהתחלה', 'כל מנהל — לא מוכר'],
      salary: 70000, cash: 200000000,
      expenses: [['דירה', 14000], ['רכב', 5000], ['אוכל ושוטף', 9000], ['ביטוחים ושוטף', 5000]],
      start: { subs: [] }, assets: [] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    ASSET('office', 'בניין משרדים בעיר הבירה', 40000000, 12000000, 220000, 'קומות משרדים מושכרות לחברות בינלאומיות.'),
    ASSET('warehouse', 'מחסן לוגיסטי ליד הנמל', 25000000, 8000000, 150000, 'מחסן מושכר לחברת שילוח.'),
    ASSET('office', 'מגדל משרדים בפרבר', 60000000, 18000000, 300000, 'בניין חדש, חצי מושכר.'),
    ASSET('warehouse', 'מרכז הפצה', 35000000, 10000000, 190000, 'מרכז הפצה עם שוכר לעשר שנים.'),
  ],
  goldenChance: 1 / 30,
  golden: [ASSET('office', 'בניין מטה במחיר הזדמנות', 30000000, 9000000, 330000, 'קבוצה בקשיים מוכרת את בניין המטה שלה בהנחה.')],

  doodads: [
    { n: 'מטוס פרטי לביקורים', aMult: 1.4, inst: true, q: 'מטוס — או ביקורת בכל חברה במשך שנה?' },
    { n: 'כנס מנהלים בחו"ל', aMult: 0.4, q: 'כנס יפה. מה למדת על המנהלים שלא ידעת?' },
    { n: 'קנס מכס', aMult: 0.25, need: true, d: 'משלוח נתקע במכס בגלל טופס חסר.', q: 'הוצאות שלא תכננת — בשבילן שומרים כרית.' },
    { n: 'יועצי מס בינלאומי', aMult: 0.3, need: true, inst: true, d: 'הדוחות של חמש מדינות.', q: 'הוצאה קבועה של מי שפועל בכמה מדינות.' },
    { n: 'דירת יוקרה בעיר זרה', aMult: 0.6, inst: true, q: 'דירה יפה. כמה חודשי שכר של מנהל היא עולה?' },
    { n: 'תביעה של עובד לשעבר', aMult: 0.25, need: true, d: 'עובד בחו"ל תובע על פיטורים.', q: 'בכל מדינה חוקים אחרים.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'שעון בחמישה אזורי זמן. עדיין 24 שעות ביום.' },
  ],

  market: [
    { mk: 'port', n: 'נמל נסגר', d: 'שביתה בנמל: חודשיים של עיכובים לכל מי שקונה מספק במדינה הזו.', q: 'כמה מהחברות שלך עוברות דרך הנמל הזה?' },
    { mk: 'fxcrisis', n: 'משבר מטבע', d: 'המטבע שעלה הכי הרבה צונח ב־25% בלילה אחד.', q: 'מטבע שעלה הרבה יכול גם ליפול הרבה. גידרת?' },
    { mk: 'tariff', n: 'מכסים חדשים', d: 'מכס חדש על סחורה ממדינה אחת: חצי שנה של רווח נמוך ב־15% לכל מי שקונה ממנה.', q: 'ספק שני עולה כסף. גם מכס.' },
    { mk: 'election', n: 'בחירות', d: 'ממשלה חדשה במדינה אחת: המחזור הכלכלי שם מתהפך.', q: 'מדינות לא זזות ביחד — זה היתרון של פיזור.' },
    { mk: 'shipping', n: 'מחירי ההובלה מזנקים', d: 'מחיר מכולה הוכפל: שלושה חודשים של רווח נמוך ב־8% בכל החברות.', q: 'סיכון שפוגע בכולם יחד — את זה פיזור לא פותר.' },
    { mk: 'boom', n: 'פריחה כלכלית', d: 'מדינה אחת בפריחה: חצי שנה של רווח גבוה ב־12% לחברות שם.' },
    { mk: 'poach', n: 'מנהל כוכב נחטף', d: 'מתחרה לקח את המנהל הכי טוב שלך. החברה בלי מנהל עד שתמנה חדש או תנהל אותה בעצמך.', q: 'אנשים טובים הם נכס — ומתחרים יודעים את זה.' },
  ],

  crises: [
    { mk: 'fine', n: 'ביקורת של רגולטור', d: 'הרגולטור בודק את החברות־הבנות. חברה שהמנהל שלה עגל פינות משלמת קנס של חודשיים רווח.', q: 'מנהל ישר שווה כסף — גם כשלא רואים.' },
    { mk: 'strike', n: 'שביתה כללית', d: 'שביתה כללית במדינה אחת: חודשיים של רווח נמוך ב־30% בחברות שם.' },
    { n: 'תביעה ייצוגית', d: 'לקוחות בחו"ל תובעים על מוצר פגום. עורכי דין עולים כסף.', cash: -2500000, cashLabel: 'פשרה בתביעה' },
    { n: 'פריצת סייבר', d: 'פורצים חדרו למערכות של הקבוצה. תיקון ושחזור.', cash: -1800000, cashLabel: 'תיקון המערכות' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון דחה את המשכורת שלך החודש.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 2000000, title: 'החזר מס מחו"ל', text: 'רשות מס זרה החזירה מס ששולם פעמיים: ₪2,000,000.', after: 'אמנות מס בין מדינות שוות כסף — למי שקורא אותן.' },
    { w: 6, kind: 'cash', amount: -1200000, title: 'קנס על דיווח מאוחר', text: 'דוח שנתי במדינה אחת הוגש באיחור: ₪1,200,000.', after: 'בכל מדינה חוקים אחרים, ומועדים אחרים.' },
    { w: 3, kind: 'golden', title: 'טלפון מקבוצה בקשיים' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מנהל בחו"ל מביא תוצאות מצוינות כבר שנה. אף אחד לא בדק אותו. מה הכי נכון?', answers: ['להעלות לו שכר ולא לגעת', 'ביקורת — דווקא כשהכל טוב', 'לפטר, ליתר ביטחון'], correct: 1, reward: 'lesson', lesson: 'trust_verify', explain: 'תוצאות טובות מאוד בלי בדיקה הן בדיוק המקום שבו הונאה מסתתרת. ביקורת קונה מידע — לא חשד.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'יש לך חברות בחמש מדינות, וכולן קונות מאותו ספק. כמה אתה מפוזר?', answers: ['מאוד — חמש מדינות', 'כמעט לא — שיבוש אחד פוגע בכולן', 'תלוי במטבע'], correct: 1, reward: 'lesson', lesson: 'supply_chain', explain: 'פיזור עובד רק כשהסיכונים לא קשורים. ספק אחד לכולן הוא סיכון אחד.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'רווח של ₪10 מיליון בהודו. אם תעביר הביתה — 15% מס במקור. אם תשאיר — אין מס, אבל הרופי יכול לרדת. מה לעשות?', answers: ['תמיד להשאיר', 'תמיד להעביר', 'תלוי איפה תצטרך את הכסף'], correct: 2, reward: 'lesson', lesson: 'trapped_cash', explain: 'כסף שתשקיע שוב באותה מדינה — חבל לשלם עליו מס. כסף שתצטרך בבית — עדיף להעביר לפני שהמטבע נופל.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כאן הכסף עובד במדינות שאתה לא נמצא בהן. השאלה היא לא רק כמה החברות מרוויחות — אלא מי מנהל אותן, ומה אתה באמת יודע עליו.',
    dealAsk: ['כמה מזה תלוי בשער?', 'מי ינהל את זה בשבילך?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    acqAsk: 'טווח רחב: אף אחד לא יודע כמה החברה באמת מרוויחה, ומי המנהל שמגיע איתה. בדיקה עולה כסף — ניחוש עולה יותר.',
    acqDd: 'הבדיקה צמצמה את הטווח. עכשיו השאלה פשוטה: המחיר מתחת לשווי — או לא?',
    fraud: 'נמצאה הונאה ב{name}: {amount} נעלמו. מנהל שאף אחד לא בדק.',
    disrupted: 'שיבוש בשרשרת האספקה ב{c}: חודשיים של עיכובים בנמל.',
    audited: 'הביקורת ב{name} הסתיימה. עכשיו אתה יודע קצת יותר — וזה מה שקנית.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם מנהלים שבדקת, ספקים שלא נופלים ביחד ומטבעות שגידרת.',
    won: '₪800 מיליון בחמש מדינות. קבוצה שעובדת גם כשאתה לא שם.',
  },
};
