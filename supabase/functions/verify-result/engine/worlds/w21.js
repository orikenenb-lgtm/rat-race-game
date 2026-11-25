// World 21 — בית ההשקעות הפרטי ("קונים, מתקנים, מוכרים — לפני סוף הקרן"). Goal (all, hold 2): DPI (cash returned ÷ paid-in) ≥ 2.0 AND
// personal net worth (fees + carry) ≥ ₪400M. CATALOG-25 §1.4 w21 / §2.2: the rule adapter `lbo` (js/worlds/adapters/lbo.js: sealed-bid
// auctions against rival funds with the winner's curse, the 100-day plan, LBO debt with a covenant (equity cure or the lender takes it), an
// 18-month fix, exits by regime — sale, IPO, secondary, half, dividend recap — and the fund's end: what is left is sold at a discount) + the
// tile 'W' (חברה למכירה). Spec + as built: docs/full-upgrade/worlds/w21-lbo.md. Every number is TUNE (gates-w21.json). Fictional only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w21')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import lbo from './adapters/lbo.js';

const board = ring(['OWOD?LMWL', 'OMWLXOWOD', 'OWOMEODWL', 'OXMWTO?MD']); // 40 tiles, paydays on the corners, 7 × 'W' (חברה למכירה)
const FUND = { k: 'lbo', n: 'הקרן', d: 'הכסף של המשקיעים: לא חלק מהשווי שלך. לך מגיעים דמי ניהול, ו־20% מכל שקל שחוזר מעבר לכסף שהם השקיעו.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'lbo' } };
const HOME = (n, cost, down, cf, d) => ({ k: 'building', n, d, cost, down, value: cost, cf });

export default {
  id: 'w21', order: 21, name: 'בית ההשקעות הפרטי', mechanic: 'lbo', modules: ['lbo'], minRules: 7, mech: [lbo],
  tagline: 'קונים חברה בהלוואה, מתקנים ומוכרים. לקרן יש תאריך סיום — והקונים לא תמיד מגיעים בזמן.',
  goalLabel: 'להחזיר למשקיעים פי 2 מהכסף שלהם, ו־₪400 מיליון לך',
  lesson: 'מי שזוכה בכל מכרז כנראה שילם יותר מדי. ובקרן רק כסף שחזר נחשב — אז מוכרים כשיש חלון, לא מחכים לשיא שאולי לא יגיע לפני הסוף.',
  story: 'משקיעים נתנו לך קרן. אתה קונה חברות במכרז מול קרנות אחרות, בחלק גדול בהלוואה, מתקן אותן במשך שנה וחצי ומוכר. כל שקל שחוזר למשקיעים נספר; שווי על הנייר לא נספר. לך מגיעים דמי ניהול ו־20% מכל מה שחוזר מעבר לכסף שהם שמו. בסוף חיי הקרן — כל מה שלא מכרת נמכר בכוח, במחיר של אותו יום. המטרה: להחזיר להם פי 2, ו־₪400 מיליון לך.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w21 (render lane)
    sky: ['#fef3c7', '#78350f'], fog: '#fde68a', board: '#78350f', boardEdge: '#15803d', center: '#92400e', accent: '#15803d',
    light: { hemiSky: '#fef3c7', hemiGround: '#451a03', sun: '#fde68a' }, decor: 'boardroom',
  },
  board,
  tiles: tilesFor(board, { W: { type: 'auction', name: 'חברה למכירה', color: '#15803d', ink: '#ffffff', icon: 'briefcase' }, O: { name: 'הזדמנות' }, M: { name: 'השוק' }, X: { name: 'תקלה בקרן' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 2, of: [{ type: 'modValue', key: 'dpi', target: 2, label: 'כסף שחזר למשקיעים (פי)' }, { type: 'nw', target: 400000000 }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 62 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [3000000, 40000000], monthly: [-2000000, 3000000] } },
  lessonDefs: [
    { id: 'winners_curse', cat: 'world', title: 'קללת המנצח', text: 'במכירה פומבית כל אחד מעריך את אותו דבר אחרת. מי שזוכה הוא לרוב מי שהעריך הכי ביוקר — כלומר מי שטעה הכי הרבה כלפי מעלה. קובעים מחיר מקסימלי לפני שמתחילים, ולא רודפים אחרי המתחרה.' }, // shared with w13 (CATALOG-25: both libraries list "קללת המנצח") — the same text, so the library reads the same whichever pack loads first
    { id: 'exit_deadline', cat: 'world', title: 'תאריך יציאה', text: 'בקרן השקעות רק כסף שחזר למשקיעים נחשב. שווי על הנייר לא משלם להם כלום. ולקרן יש תאריך סיום: מה שלא נמכר עד אז נמכר בכוח, במחיר של אותו יום — גם אם זה שוק רע.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['tenant', 'השוכר הגדול חתם רק לשנה'], ['roof', 'הגג לא שופץ עשרים שנה'], ['books', 'הדוחות "לפי ההנהלה"'], ['permit', 'יש חריגת בנייה'], ['lien', 'יש שעבוד ישן'], ['area', 'האזור מתרוקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { lbo: 'boardroom_table', building: 'stone_block', stake: 'stone_block', side: 'stone_block', biz: 'stone_block' },
  kinds: { lbo: { label: 'הקרן', debtLabel: 'הלוואה' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'operatingPartner', gender: 'm', age: 51, family: { partner: 'married', kids: 3 }, name: 'שותף תפעולי', icon: 'gear', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'אהרון ניהל מפעלים עשרים שנה לפני שעבר לקרן. הוא מתקן חברות מהר יותר ומוציא מהן יותר — אבל משלם במכרז כמו כולם.',
      pros: ['תיקון מהיר יותר', 'השיפור ברווח גדול ב־20%'], cons: ['בלי יתרון במכרזים'],
      salary: 70000, cash: 8000000,
      expenses: [['משכנתא', 12000], ['רכב', 5000], ['אוכל ושוטף', 11000], ['ילדים', 8000], ['ביטוחים ושוטף', 5000]],
      start: { fund: 3000000000, fix: 1.2, up: 1.2, edge: 1, end: 72 }, assets: [FUND] },
    { id: 'dealMaker', gender: 'f', age: 44, family: { partner: 'married', kids: 1 }, name: 'סוגרת עסקאות', icon: 'briefcase', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'מאיה מכירה כל מוכר וכל בנק. היא זוכה במכרזים בהצעה נמוכה ב־5% — אבל אחרי הקנייה, התיקון אצלה איטי יותר.',
      pros: ['זוכה במכרז בהצעה נמוכה ב־5%'], cons: ['תיקון איטי יותר', 'השיפור ברווח קטן ב־10%'],
      salary: 70000, cash: 8000000,
      expenses: [['דירה', 13000], ['רכב', 5000], ['אוכל ושוטף', 10000], ['ילדים', 4000], ['ביטוחים ושוטף', 5000]],
      start: { fund: 3000000000, fix: 0.8, up: 0.9, edge: 1.05, end: 72 }, assets: [FUND] },
    { id: 'firstTimeGP', gender: 'm', age: 39, family: { partner: 'single', kids: 0 }, name: 'מנהל קרן ראשונה', icon: 'rocket', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'תומר גייס קרן ראשונה של ₪1.5 מיליארד. המשקיעים קפדנים: לא תהיה הארכה. הוא שם בקרן את כל החיסכון שלו, ויש לו מעט זמן לטעות.',
      pros: ['חיסכון אישי גדול יותר'], cons: ['קרן קטנה (₪1.5 מיליארד)', 'אין הארכה לקרן'],
      salary: 45000, cash: 60000000,
      expenses: [['שכירות', 9000], ['רכב', 3000], ['אוכל ושוטף', 7000], ['ביטוחים ושוטף', 3000]],
      start: { fund: 1500000000, fix: 1, up: 1, edge: 1, end: 72, noExt: true }, assets: [FUND] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    HOME('דירת יוקרה להשכרה', 12000000, 5000000, 25000, 'דירה במגדל ליד הבורסה.'),
    HOME('בניין משרדים קטן', 30000000, 12000000, 60000, 'בניין עם שוכרים ותיקים.'),
    HOME('חנות ברחוב ראשי', 8000000, 3500000, 18000, 'חנות עם שוכר רשת.'),
  ],
  goldenChance: 1 / 30,
  golden: [HOME('בניין מפירוק במחיר מציאה', 20000000, 8000000, 75000, 'המפרק מוכר בניין מניב ב־30% הנחה.')],

  doodads: [
    { n: 'שולחן ישיבות מעץ אגוז', aMult: 0.4, q: 'יפה. המשקיעים מסתכלים על הכסף שחזר, לא על השולחן.' },
    { n: 'כנס משקיעים בחו"ל', aMult: 0.3, need: true, d: 'המשקיעים רוצים לשמוע ממך.', q: 'הוצאה שבאה עם התפקיד.' },
    { n: 'רכב יוקרה', aMult: 0.5, inst: true, q: 'כמה דמי ניהול הוא עולה?' },
    { n: 'ארוחת ערב עם מנהלי החברות', aMult: 0.25, need: true, d: 'המנכ"לים רוצים לראות אותך.', q: 'יש הוצאות שבאות עם התפקיד.' },
    { n: 'יאכטה לשבוע', aMult: 0.3, q: 'הקרן לא מחזירה כסף מהים.' },
  ],

  market: [
    { mk: 'freeze', n: 'שוק האשראי נסגר', d: 'הבנקים מפסיקים לממן רכישות: חצי שנה — חוב של עד פי 2 בלבד, ובלי מימון מחדש.', q: 'בלי חוב זול, כל רכישה צריכה יותר הון.' },
    { mk: 'strategic', n: 'קונה אסטרטגי מתעניין', d: 'חברה גדולה מהענף רוצה לקנות את אחת החברות שלך — במכפיל גבוה ב־1.5, לשלושה חודשים.', q: 'קונה אסטרטגי משלם על סינרגיה. חלון כזה לא נשאר פתוח.' },
    { mk: 'quits', n: 'המנכ"ל עזב', d: 'המנכ"ל של אחת החברות התפטר: תוכנית התיקון חוזרת אחורה.', q: 'חברה היא קודם כל אנשים.' },
    { mk: 'covreset', n: 'הבנקים מקלים בתנאים', d: 'לשנה: החוב יכול להגיע לפי 7 מהרווח לפני הפרה.', q: 'הקלה בתנאים קונה זמן — לא פותרת חוב.' },
    { mk: 'outbid', n: 'קרן גדולה נכנסה לשוק', d: 'קרן ענקית מחפשת עסקאות: שלושה חודשים, הצעות המתחרים גבוהות ב־10%.', q: 'כשיש הרבה כסף שמחפש עסקאות, המחירים עולים.' },
    { mk: 'window', n: 'חלון יציאה', d: 'הבורסה פתוחה והקונים חזרו: השוק עובר לשוק שורי.', q: 'חלון יציאה הוא הזמן למכור — לא לחכות לעוד.' },
  ],
  crises: [
    { n: 'תביעה של משקיע', d: 'משקיע תובע על דיווח. פשרה עולה כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { n: 'תקלה במשרד', d: 'פריצה למערכות של בית ההשקעות. התיקון עולה כסף.', cash: -800000, cashLabel: 'תיקון מערכות' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'השותפים הקפיאו את המשכורת שלך החודש.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'בונוס מהשותפים', text: 'השותפים חילקו בונוס: ₪1,500,000.', after: 'בונוס הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -800000, title: 'קנס מהרגולטור', text: 'הרגולטור קנס על דיווח מאוחר: ₪800,000 מהכיס שלך.', after: 'דיווח בזמן הוא חלק מהאמון.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'חמש קרנות מעריכות חברה. מי בדרך כלל זוכה במכרז?', answers: ['מי שהעריך הכי נכון', 'מי שהעריך הכי ביוקר — ולכן לרוב שילם יותר מדי', 'מי שהגיש ראשון'], correct: 1, reward: 'lesson', lesson: 'winners_curse', explain: 'הזוכה הוא מי שהציע הכי הרבה. כשכולם מנחשים, זה לרוב מי שהגזים: קללת המנצח.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'חברה בקרן שווה על הנייר פי 3 ממה ששילמת, אבל עוד לא נמכרה. כמה החזרת למשקיעים?', answers: ['פי 3', 'כלום — רק כסף שחזר נספר', 'פי 1.5'], correct: 1, reward: 'lesson', lesson: 'exit_deadline', explain: 'שווי על הנייר לא משלם למשקיעים. רק מכירה מחזירה כסף.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'רק כסף שחזר למשקיעים נספר. ולקרן יש תאריך סיום.',
    dealAsk: ['כמה מזה שלך, וכמה של המשקיעים?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    regime: 'השוק: {label}. מכפיל המכירה של החברות זז.',
    breach: 'החוב של החברה עבר את התנאי. עד היום הבא של המשכורת: להזרים הון — או שהבנק ייקח אותה.',
    taken: 'הבנק לקח את החברה. ההון שהשקעת בה אבד.',
    forced: 'הקרן הגיעה לסוף חייה: כל מה שנשאר נמכר עכשיו, במחיר של היום, בהנחה.',
    freeze: 'שוק האשראי סגור: רכישות רק עם מעט חוב.',
    offerAsk: 'כמה החברה שווה לך — לא למתחרים? מי שמציע הכי הרבה זוכה, וגם מגלה ראשון שהגזים.',
    offerBuy: 'זכית במכרז. עכשיו מתקנים — ובודקים כמה באמת קנית.',
    offerLost: 'קרן מתחרה הציעה יותר. לפעמים להפסיד מכרז זה לחסוך כסף.',
    offerPass: 'ויתרת. העסקה הטובה ביותר היא לפעמים זו שלא עשית.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם הצעות שלא מגזימות, חוב שמחזיק משבר, ומכירה בחלון — לפני סוף הקרן.',
    won: 'החזרת למשקיעים פי 2, ו־₪400 מיליון לך. מכרת בזמן.',
  },
};
