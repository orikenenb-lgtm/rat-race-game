// World 16 — ארץ השדות ("את היבול רואים רק בקציר, ואת המחיר אפשר לנעול כבר בזריעה"). Goal (all, hold 2): the 12-month average farm
// income ≥ ₪5M a month AND no forced margin liquidation in the last 12 paydays. CATALOG-25 §1.4 w16 / §2.2: the rule adapter `harvest`
// (js/worlds/adapters/harvest.js: 6 field slots, a crop calendar, commodity prices in supply regimes, a harvest future per crop with
// margin, a sealed yield per field shown as a narrowing range, the water quota, a silo, crop insurance) + the produce-exchange tile 'H'
// (an export contract on a growing field, or water rights). Spec + as built: docs/full-upgrade/worlds/w16-fields.md. Every number is TUNE
// (gates-w16.json). Fictional names only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w16')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import harvest from './adapters/harvest.js';

const board = ring(['OHOD?LMHL', 'OMHLXO?OD', 'OHOMEODHL', 'OXMHTO?MD']); // 40 tiles, paydays on the corners, 6 × 'H' (בורסת התוצרת)
const FARM = { k: 'farm', n: 'המשק', d: 'השדות, הציוד והמטעים. ההכנסה: מכירות היבול פחות עלויות הגידול, המשק והמשכנתא.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'farm' } };
const ASSET = (k, n, cost, down, cf, d) => ({ k, n, d, cost, down, value: cost, cf });
const F = (crop, own, left, irr) => ({ crop, own, left, irr });

export default {
  id: 'w16', order: 16, name: 'ארץ השדות', mechanic: 'harvest', modules: ['harvest'], minRules: 7, mech: [harvest],
  tagline: 'שדות ומים בעמק. את היבול רואים רק בקציר, ואת המחיר אפשר לנעול כבר בזריעה. כמה לנעול, כשאתה לא יודע כמה תקצור?',
  goalLabel: 'הכנסה של ₪5 מיליון בחודש מהמשק (ממוצע 12 חודשים), בלי סגירה בכוח של גידור',
  lesson: 'מגדרים את מה שבטוח יגיע — לא את מה שמקווים. גידור שעובד עדיין דורש מזומן לביטחונות, וחודשים לפני שהקציר משלם.',
  story: 'ירשת משק בעמק: שדות חיטה וכותנה, מים ומחסן. את היבול רואים רק בקציר, אבל את המחיר אפשר לנעול כבר בזריעה בחוזה עתידי. בבצורת היבול קטן והמחיר גבוה — ומי שנעל יותר ממה שקצר, קונה את החסר ביוקר. ובינתיים, כל ירידה בחוזה דורשת עוד ביטחונות במזומן. המטרה: הכנסה של ₪5 מיליון בחודש בממוצע שנתי, בלי שהברוקר יסגור לך גידור בכוח.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w16 (render lane)
    sky: ['#fde68a', '#93c5fd'], fog: '#fef3c7', board: '#eab308', boardEdge: '#a16207', center: '#84cc16', accent: '#0284c7',
    light: { hemiSky: '#fef9c3', hemiGround: '#3f6212', sun: '#fff7ed' }, decor: 'silos',
  },
  board,
  tiles: tilesFor(board, { H: { type: 'produce', name: 'בורסת התוצרת', color: '#0284c7', ink: '#ffffff', icon: 'bars' }, O: { name: 'הזדמנות במושב' }, M: { name: 'מחירי התוצרת' }, X: { name: 'פגע בשדה' } }),
  calendar: { startMonth: 9 }, // September: the cotton is a month from harvest, the wheat is sown in November
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 2, of: [{ type: 'passive12', target: 5000000, window: 12 }, { type: 'noDefault', months: 12, key: 'margin', label: 'חודשים בלי סגירה בכוח של גידור' }] },
  maxMonths: 54,
  stars: { t2: 46, t3: 38 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 2000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 250000, sideReportFee: 400, tipDoodad: 2000000, doodadWealth: 0.0015, band: { deal: [2000000, 60000000], monthly: [-8000000, 30000000] } },
  lessonDefs: [
    { id: 'qty_hedge', cat: 'world', title: 'גידור כמות', text: 'אפשר לנעול מחיר, אבל לא כמות. מי שנעל את כל הצפי ונפגע מבצורת קונה את החסר בשוק — כשהמחיר הכי גבוה. לכן נועלים את הקצה הנמוך של הטווח, ומוסיפים ככל שהיבול מתברר.' },
    { id: 'hedge_margin', cat: 'world', title: 'קריאת מרווח של גידור', text: 'גידור שעובד עדיין עולה מזומן: כשהמחיר עולה, החוזה מפסיד על הנייר ומבקשים עוד ביטחונות — חודשים לפני שהקציר משלם. מי שאין לו מזומן, הגידור שלו נסגר בכוח בהפסד.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 250000,
      pool: [['soil', 'הקרקע מלוחה בחלק מהשדה'], ['water', 'זכויות המים במחלוקת'], ['lease', 'חוזה החכירה נגמר בעוד שנה'], ['roof', 'הגג לא יחזיק פאנלים'], ['road', 'אין גישה לכביש בחורף'], ['permit', 'אין היתר לשימוש הזה']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { farm: 'warehouse', solar: 'factory_pack', side: 'business', building: 'warehouse', stake: 'warehouse', biz: 'business' },
  kinds: {
    farm: { label: 'המשק', debtLabel: 'משכנתא' }, solar: { label: 'גג סולארי', debtLabel: 'הלוואה' }, side: { label: 'עסק במשק', debtLabel: 'הלוואה' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'agronomist', gender: 'f', age: 39, family: { partner: 'married', kids: 2 }, name: 'אגרונומית', icon: 'sprout', maxMonths: 54, stars: { t2: 46, t3: 38 },
      desc: 'מיכל למדה קרקע ומים עשר שנים. שלושה שדות, ₪40 מיליון בבנק — והיא רואה את היבול מוקדם יותר מכולם.',
      pros: ['טווח היבול צר ב־30% (רואה מוקדם)'], cons: ['משכנתא על השדות'],
      salary: 30000, cash: 40000000,
      expenses: [['משכנתא על הבית', 8000], ['רכב', 3000], ['אוכל ושוטף', 8000], ['ילדים', 5000], ['ביטוחים ושוטף', 3000]],
      start: { debt: 20000000, fields: [F('cotton', 1, 1), F('cotton', 1, 1), F('wheat', 1)] }, assets: [FARM] },
    { id: 'moshavFarmer', gender: 'm', age: 52, family: { partner: 'married', kids: 3 }, name: 'חקלאי ותיק מהמושב', icon: 'house', maxMonths: 54, stars: { t2: 46, t3: 38 },
      desc: 'אבנר עובד את האדמה של סבא שלו. מטע אבוקדו, זכויות מים ותיקות — וטרקטורים שראו ימים טובים יותר.',
      pros: ['זכויות מים ותיקות: 85% מהמכסה בבצורת', 'מטע אבוקדו מניב'], cons: ['ציוד ישן: יבול נמוך ב־10% עד שמחליפים', 'מעט מזומן'],
      salary: 20000, cash: 14000000,
      expenses: [['רכב', 2500], ['אוכל ושוטף', 7000], ['ילדים', 4000], ['ביטוחים ושוטף', 3000]],
      start: { debt: 10000000, quota: 0.85, oldEquip: true, fields: [F('cotton', 1, 1), F('wheat', 1), F('avo', 1, 3)] }, assets: [FARM] },
    { id: 'agriFund', gender: 'm', age: 45, family: { partner: 'married', kids: 1 }, name: 'קרן חקלאות', icon: 'briefcase', maxMonths: 54, stars: { t2: 46, t3: 38 },
      desc: 'אורן מנהל קרן עם הרבה מזומן ובלי אדמה משלו: שני שדות חכורים, ובלי ותק במים.',
      pros: ['הרבה מזומן'], cons: ['שדות חכורים (תשלום כל חודש)', 'מכסת מים נמוכה: 55% בבצורת'],
      salary: 45000, cash: 170000000,
      expenses: [['משכנתא', 12000], ['רכב', 4000], ['אוכל ושוטף', 9000], ['ילד', 3000], ['ביטוחים ושוטף', 4000]],
      start: { quota: 0.55, fields: [F('cotton', 0, 1), F('wheat', 0)] }, assets: [FARM] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    ASSET('solar', 'גג סולארי על הרפת', 9000000, 3000000, 70000, 'פאנלים על גג הרפת, החשמל נמכר לרשת.'),
    ASSET('side', 'חנות מהמשק', 4000000, 1500000, 35000, 'חנות ליד הכביש: ירקות, גבינות ומיץ.'),
    ASSET('side', 'צימרים בקצה המשק', 12000000, 4000000, 85000, 'שלושה צימרים עם נוף לשדות.'),
    ASSET('solar', 'שדה סולארי בשולי המשק', 20000000, 6000000, 150000, 'חלקה שלא מגדלים בה כלום — עכשיו היא מייצרת חשמל.'),
  ],
  goldenChance: 1 / 30,
  golden: [ASSET('solar', 'גג סולארי של משק שנסגר', 8000000, 2500000, 110000, 'משק שכן נסגר ומוכר את מערכת החשמל שלו בהנחה.')],

  doodads: [
    { n: 'טרקטור חדש ומבריק', aMult: 1.0, q: 'טרקטור יפה. כמה טון הוא יוסיף?' },
    { n: 'חתונה גדולה בחצר המשק', aMult: 0.6, q: 'חגיגה יפה — או ביטחונות לגידור?' },
    { n: 'תיקון משאבת מים', aMult: 0.3, need: true, d: 'המשאבה הראשית נשרפה באמצע העונה.', q: 'הוצאות שלא תכננת — בשבילן שומרים כרית.' },
    { n: 'קנס על שאיבת יתר', aMult: 0.3, need: true, inst: true, d: 'שאבת יותר מהמכסה בחודש חם.', q: 'מים הם הכסף של המשק.' },
    { n: 'טיול משפחתי לחו"ל', aMult: 0.4, q: 'חופשה — או חודש של עלויות גידול?' },
    { n: 'שיפוץ בית האבן', aMult: 0.5, inst: true, q: 'בית יפה לא מגדל חיטה.' },
  ],

  market: [
    { mk: 'drought', n: 'בצורת בעמק', d: 'החורף יבש: מכסת המים נחתכת, היבול בשדות ייפגע — והמחירים בשוק עולים.', q: 'בבצורת היבול קטן והמחיר גבוה. כמה מהיבול נעלת?' },
    { mk: 'ban', n: 'איסור ייצוא בחו"ל', d: 'מדינה גדולה אסרה על ייצוא חיטה: מחיר החיטה קופץ ב־35% לארבעה חודשים.', q: 'מי שנעל מחיר — לא נהנה מהקפיצה. זה המחיר של ודאות.' },
    { mk: 'glut', n: 'יבול שיא בעולם', d: 'יבול כותנה ענק בעולם: המחיר יורד ב־20% לחמישה חודשים.', q: 'כאן הגידור מרוויח. מי שלא נעל — סופג הכל.' },
    { mk: 'usdUp', n: 'הדולר מתחזק', d: 'הדולר עלה ב־8%: האבוקדו לייצוא שווה יותר בשקלים.' },
    { mk: 'usdDown', n: 'הדולר נחלש', d: 'הדולר ירד ב־8%: כל ארגז אבוקדו שווה פחות בשקלים.', q: 'יבול לייצוא חשוף גם למחיר וגם לדולר.' },
    { mk: 'subsidy', n: 'מענק השקיה', d: 'משרד החקלאות מממן חצי מהשקיה בטפטוף לחצי שנה.', q: 'השקיה היא ביטוח נגד בצורת.' },
    { mk: 'pest', n: 'מזיק בשדות הכותנה', d: 'מזיק תקף את הכותנה בעמק: היבול הצפוי יורד ב־15%.' },
  ],

  crises: [
    { mk: 'hail', n: 'ברד', d: 'סופת ברד פגעה בשדה אחד: 30% מהיבול שלו אבד.', q: 'בגלל זה נועלים רק את הקצה הנמוך של הטווח.' },
    { n: 'תקלה בקומביין', d: 'הקומביין התקלקל באמצע העונה: תיקון דחוף.', cash: -1200000, cashLabel: 'תיקון הקומביין' },
    { n: 'שריפה בשולי השדה', d: 'שריפה כילתה ציוד ליד השדה.', cash: -800000, cashLabel: 'ציוד שנשרף' },
    { noSalary: true, n: 'חודש בלי משיכה', d: 'כדי לשמור מזומן למשק, ויתרת על המשיכה שלך החודש.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 1200000, title: 'מענק למשק צעיר', text: 'המועצה האזורית אישרה מענק: ₪1,200,000.', after: 'כסף שנכנס בלי חוב — שומרים לביטחונות.' },
    { w: 6, kind: 'cash', amount: -700000, title: 'חשבון מים מפתיע', text: 'חשבון המים של הקיץ: ₪700,000.', after: 'הוצאות שגדלות בחום — צריך לראות אותן מראש.' },
    { w: 3, kind: 'golden', title: 'טלפון ממשק שנסגר' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הצפי לשדה: 9,000–11,000 טון. כמה כדאי לנעול עכשיו בחוזה?', answers: ['11,000 — את כל הטווח', 'בערך 8,000 — מתחת לקצה הנמוך', 'כלום'], correct: 1, reward: 'lesson', lesson: 'qty_hedge', explain: 'נועלים את מה שבטוח יגיע. אם תנעל 11,000 ותקצור 9,000 בבצורת — תקנה 2,000 טון במחיר הגבוה של הבצורת.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'נעלת מחיר, והמחיר בשוק עלה. הברוקר מבקש עוד ביטחונות. מה זה אומר?', answers: ['הגידור נכשל', 'הגידור עובד — אבל עולה מזומן עד הקציר', 'אפשר להתעלם'], correct: 1, reward: 'lesson', lesson: 'hedge_margin', explain: 'החוזה מפסיד על הנייר, והיבול שבשדה שווה יותר. אבל את ההפרש משלמים עכשיו, ואת היבול מוכרים רק בקציר. בלי מזומן — הגידור נסגר בכוח.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'במשק ההכנסה מגיעה בקציר, וההוצאות כל חודש. השאלה היא לא רק כמה תקצור — אלא כמה לנעול מראש, וכמה מזומן להשאיר לביטחונות.',
    dealAsk: ['כמה חודשים של עלויות גידול זה עולה?', 'זה מוסיף הכנסה לשנה כולה — או רק לחודש אחד?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    marginCall: 'קריאת מרווח: הפקדת {amount}. הגידור עובד — אבל עולה מזומן עד הקציר.',
    forced: 'לא היה מזומן לביטחונות, והברוקר סגר את הגידור בכוח ({amount}). שנה שלמה עד שזה יישכח.',
    harvestDone: 'קציר ה{crop}: {qty} טון.',
    drought: 'בצורת: מכסת המים נחתכת, היבול יקטן — והמחיר יעלה. מי שנעל יותר ממה שיקצור ישלם על החסר.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם שדות שמגדלים כל שנה, גידור על הקצה הנמוך ומזומן לביטחונות.',
    won: '₪5 מיליון בחודש, שנה שלמה, בלי שגידור נסגר בכוח. משק שיודע מה הוא לא יודע.',
  },
};
