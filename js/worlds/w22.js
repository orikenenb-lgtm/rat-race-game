// World 22 — העיר החדשה ("כל תשתית מייקרת את כל הקרקע שלך"). Goal (all, hold 3): net worth ≥ ₪3B (the land you hold at the zone's last
// clearing price) AND ≥ 60,000 residents AND a debt-service cover (DSCR) ≥ 1.5. CATALOG-25 §1.4 w22 / §2.2: the rule adapter `capture`
// (js/worlds/adapters/capture.js: 20 plots in 5 zones, amenities built in stages that raise the plot prices of their zone and the next ones,
// residents after a lag on the plots you sold, property tax, municipal bonds with a spread on DSCR, the services ratio and satisfaction)
// + the tile 'W' (הצעה לעיר: a PPP partner or an employer's campus). Spec + as built: docs/full-upgrade/worlds/w22-capture.md. Every number
// is TUNE (gates-w22.json). Fictional only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w22')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import capture from './adapters/capture.js';

const board = ring(['OWOD?LMWL', 'OMWLXO?OD', 'OWOMEODWL', 'OXMWTO?MD']); // 40 tiles, paydays on the corners, 6 × 'W' (הצעה לעיר)
const LAND = { k: 'capture', n: 'הקרקע שלך', d: 'המגרשים שעוד אצלך, לפי מחיר המכירה האחרון באזור, פחות האג"ח של העיר.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'capture' } };
const HOME = (n, cost, down, cf, d) => ({ k: 'building', n, d, cost, down, value: cost, cf });

export default {
  id: 'w22', order: 22, name: 'העיר החדשה', mechanic: 'capture', modules: ['capture'], minRules: 7, mech: [capture],
  tagline: 'גבעות ריקות ותוכנית מתאר. כל רכבת, בית ספר ופארק מייקרים את כל הקרקע שעוד אצלך — אבל הריבית רצה גם על עיר ריקה.',
  goalLabel: 'שווי של ₪3 מיליארד, 60 אלף תושבים, וארנונה שמכסה את החוב פי 1.5',
  lesson: 'מה שאתה בונה מייקר את כל מה שעוד שלך. בונים קודם את מה שמרים את המחיר, מוכרים אחר כך — ולא מחכים יותר מדי, כי רק מגרש שנמכר מביא תושבים, והשירותים צריכים לגדול יחד איתם.',
  story: 'קיבלת גבעות ריקות ותוכנית מתאר לעיר חדשה. אתה יכול לבנות תחנת רכבת, בתי ספר, פארקים, בית חולים וקניון — וכל אחד מהם מייקר את המגרשים באזור שלו ובאזורים שליד. מגרש שמכרת נבנה על ידי יזם, ואחרי חצי שנה עד שנה וחצי מגיעים אליו תושבים שמשלמים ארנונה. את הבנייה מממנים במכירת מגרשים או באג"ח עירוני — והריבית רצה גם כשהעיר עוד ריקה. בלי מספיק בתי ספר ובתי חולים, תושבים עוזבים.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w22 (render lane)
    sky: ['#e0f2fe', '#2563eb'], fog: '#d6c7a1', board: '#d6c7a1', boardEdge: '#2563eb', center: '#a8956a', accent: '#2563eb',
    light: { hemiSky: '#e0f2fe', hemiGround: '#78716c', sun: '#fde68a' }, decor: 'masterplan',
  },
  board,
  tiles: tilesFor(board, { W: { type: 'cityOffer', name: 'הצעה לעיר', color: '#2563eb', ink: '#ffffff', icon: 'crane' }, O: { name: 'הזדמנות' }, M: { name: 'השוק' }, X: { name: 'תקלה בעירייה' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'nw', target: 3000000000 }, { type: 'modValue', key: 'residents', target: 60000, label: 'תושבים' }, { type: 'modValue', key: 'dscr', target: 1.5, label: 'כיסוי החוב (פי)' }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 62 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [3000000, 40000000], monthly: [-2000000, 3000000] } },
  lessonDefs: [
    { id: 'land_capture', cat: 'world', title: 'לכידת ערך קרקע', text: 'תחנת רכבת, בית ספר או פארק מייקרים את כל הקרקע סביבם. מי שמחזיק את הקרקע ליד — מרוויח מהעלייה, גם בלי למכור כלום. לכן בונים קודם את מה שמייקר, ומוכרים אחר כך.' },
    { id: 'build_order', cat: 'world', title: 'סדר בנייה', text: 'בעיר חדשה הסדר קובע: למכור הכול מוקדם זה למכור בזול; לחכות עם הכול זה לשלם ריבית על עיר ריקה. ותושבים בלי בתי ספר ובתי חולים עוזבים — השירותים צריכים לגדול יחד עם העיר.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['tenant', 'השוכר הגדול חתם רק לשנה'], ['roof', 'הגג לא שופץ עשרים שנה'], ['books', 'הדוחות "לפי ההנהלה"'], ['permit', 'יש חריגת בנייה'], ['lien', 'יש שעבוד ישן'], ['area', 'האזור מתרוקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { capture: 'masterplan_hill', building: 'stone_block', stake: 'stone_block', side: 'stone_block', biz: 'stone_block' },
  kinds: { capture: { label: 'הקרקע', debtLabel: 'אג"ח עירוני' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'cityPlanner', gender: 'f', age: 46, family: { partner: 'married', kids: 2 }, name: 'מתכננת ערים', icon: 'map', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'דנה כתבה את תוכנית המתאר בעצמה. היא יודעת בדיוק כמה כל תחנה ופארק מייקרים גם את האזורים שליד — אבל ארבעה מגרשים כבר נמכרו לפני שהגיעה.',
      pros: ['רואה בדיוק כמה כל מבנה מייקר את האזורים הסמוכים'], cons: ['16 מגרשים מתוך 20'],
      salary: 60000, cash: 150000000,
      expenses: [['משכנתא', 11000], ['רכב', 4000], ['אוכל ושוטף', 10000], ['ילדים', 6000], ['ביטוחים ושוטף', 4000]],
      start: { see: true, sold: [3, 7, 11, 15], base: 115000000 }, assets: [LAND] },
    { id: 'plotMagnate', gender: 'm', age: 58, family: { partner: 'married', kids: 4 }, name: 'בעל הקרקעות', icon: 'crown', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'שמעון קנה את כל הגבעות לפני עשרים שנה. כל המגרשים שלו — אבל כמעט אין לו מזומן, ועיר צריכה כסף כדי להתחיל.',
      pros: ['כל 20 המגרשים'], cons: ['מעט מזומן'],
      salary: 40000, cash: 40000000,
      expenses: [['בית', 14000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 8000], ['ביטוחים ושוטף', 5000]],
      start: { sold: [], base: 100000000 }, assets: [LAND] },
    { id: 'transitEngineer', gender: 'f', age: 41, family: { partner: 'single', kids: 0 }, name: 'מהנדסת תחבורה', icon: 'train', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'רותם בנתה קווי רכבת בשלוש מדינות. אצלה כל מבנה עולה 15% פחות — אבל ארבעה מגרשים כבר נמכרו, ואת האזורים היא מכירה פחות.',
      pros: ['כל מבנה זול ב־15%'], cons: ['16 מגרשים מתוך 20'],
      salary: 55000, cash: 100000000,
      expenses: [['שכירות', 8000], ['רכב', 3000], ['אוכל ושוטף', 7000], ['ביטוחים ושוטף', 3000]],
      start: { costK: 0.85, sold: [1, 6, 13, 18], base: 115000000 }, assets: [LAND] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    HOME('דירה להשכרה במרכז הישן', 6000000, 2500000, 14000, 'דירה בעיר הוותיקה שליד.'),
    HOME('בניין משרדים קטן', 25000000, 10000000, 50000, 'בניין עם שוכרים ותיקים.'),
    HOME('חנות ברחוב ראשי', 8000000, 3500000, 18000, 'חנות עם שוכר רשת.'),
  ],
  goldenChance: 1 / 30,
  golden: [HOME('בניין מפירוק במחיר מציאה', 20000000, 8000000, 75000, 'המפרק מוכר בניין מניב ב־30% הנחה.')],

  doodads: [
    { n: 'טקס חנוכת שכונה', aMult: 0.3, need: true, d: 'התושבים מחכים לטקס.', q: 'הוצאה שבאה עם התפקיד.' },
    { n: 'מודל תלת־ממדי של העיר', aMult: 0.4, q: 'יפה. התושבים מסתכלים על בתי הספר, לא על המודל.' },
    { n: 'רכב יוקרה', aMult: 0.5, inst: true, q: 'כמה ארנונה הוא עולה?' },
    { n: 'כנס ערים בחו"ל', aMult: 0.3, q: 'רעיונות טובים — וכרטיס טיסה יקר.' },
    { n: 'ארוחת ערב עם היזמים', aMult: 0.25, need: true, d: 'היזמים רוצים לשמוע את התוכנית.', q: 'יש הוצאות שבאות עם התפקיד.' },
  ],

  market: [
    { mk: 'rail', n: 'תוכנית הרכבת הארצית', d: 'הממשלה מחליטה על קו רכבת. אם תחנה נופלת באזור שלך — היא בחינם.', q: 'תשתית שמישהו אחר מממן מייקרת את הקרקע שלך כמו זו שאתה בונה.' },
    { mk: 'recession', n: 'מיתון', d: 'היזמים עוצרים: חצי שנה בלי מכירות מגרשים (רק ליזם בהנחה), והשוק איטי.', q: 'מי שבנה הכול על מכירות עתידיות מגלה שהשוק לא תמיד שם.' },
    { mk: 'employer', n: 'מעסיק גדול מגיע', d: 'חברה גדולה פותחת משרדים באחד האזורים: יותר אנשים רוצים לגור שם.', q: 'מקומות עבודה מביאים תושבים.' },
    { mk: 'strike', n: 'שביתה בבתי הספר', d: 'שלושה חודשים: שביעות הרצון של התושבים יורדת.', q: 'שירותים הם חלק מהסיבה שאנשים נשארים.' },
    { mk: 'petition', n: 'עתירה סביבתית', d: 'עתירה עוצרת את הבנייה הבאה בתור לארבעה חודשים.', q: 'כל עיכוב בבנייה הוא עוד חודשים של ריבית.' },
    { mk: 'rateUp', n: 'הריבית עולה', d: 'בנק ישראל מעלה ריבית: אג"ח חדש יקר יותר.', q: 'הריבית רצה גם על עיר ריקה.' },
    { mk: 'rateDown', n: 'הריבית יורדת', d: 'בנק ישראל מוריד ריבית: אפשר לממן מחדש בזול.', q: 'ריבית נמוכה היא הזדמנות למחזר חוב.' },
  ],
  crises: [
    { n: 'תביעה של קבלן', d: 'קבלן תובע על עיכוב בתשלום. פשרה עולה כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { n: 'תקלה במשרד', d: 'פריצה למערכות של העירייה. התיקון עולה כסף.', cash: -800000, cashLabel: 'תיקון מערכות' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון הקפיא את המשכורת שלך החודש.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'מענק מהמדינה', text: 'המדינה נתנה מענק לעיר חדשה: ₪1,500,000.', after: 'מענק הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -800000, title: 'קנס מהמשרד להגנת הסביבה', text: 'קנס על אבק מאתר בנייה: ₪800,000.', after: 'גם בנייה צריכה לשמור על השכנים.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'בנית תחנת רכבת ליד חמישה מגרשים שעוד שלך. מה קרה לשווי שלך?', answers: ['כלום — עוד לא מכרת', 'עלה: התחנה מייקרת את כל המגרשים שעוד אצלך', 'ירד, כי שילמת על התחנה'], correct: 1, reward: 'lesson', lesson: 'land_capture', explain: 'תשתית מייקרת את הקרקע סביבה. מי שמחזיק את הקרקע ליד לוכד את העלייה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'עיר חדשה עם 20 מגרשים. מה הסדר הטוב?', answers: ['למכור הכול מהר, ואז לבנות', 'לבנות קודם מה שמייקר, למכור בהדרגה, ולהוסיף שירותים לפי התושבים', 'לחכות עם הכול עד שהמחירים יעלו'], correct: 1, reward: 'lesson', lesson: 'build_order', explain: 'מכירה מוקדמת היא מכירה בזול, והמתנה ארוכה היא ריבית על עיר ריקה. הסדר קובע.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כל מה שתבנה מייקר את המגרשים שעוד אצלך. אבל הריבית רצה גם על עיר ריקה.',
    dealAsk: ['מה זה עושה לכל שאר הקרקע שלך?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    cycle: 'שוק הקרקעות: {label}.',
    built: '{n} נפתח: מחירי הקרקע באזור ובאזורים הסמוכים עלו.',
    leave: 'אין מספיק בתי ספר ובתי חולים: תושבים עוזבים.',
    freeze: 'השוק קפוא: מכירה רק ליזם, בהנחה.',
    offerAsk: 'מה זה עושה לכל שאר הקרקע שלך?',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים כשבונים קודם את מה שמייקר, מוכרים בהדרגה, ומוסיפים בתי ספר ובתי חולים לפי התושבים.',
    won: 'עיר חיה: 60 אלף תושבים, ארנונה שמכסה את החוב, ו־₪3 מיליארד שווי.',
  },
};
