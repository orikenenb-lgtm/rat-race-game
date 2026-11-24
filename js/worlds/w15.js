// World 15 — מגדלי הענן ("אפליקציה עם מיליון משתמשים ואפס רווח"). Goal (all, hold 3): your stake's value ≥ ₪800M AND runway ≥ 12 months (or
// cash flow ≥ 0). CATALOG-25 §1.4 w15 / §2.2 / §2.4: the new module `platform` (js/worlds/mech/platform.js: users by channel with saturation,
// cohorts with a sealed retention revealed month by month, ARPU, burn, runway, a network-effect threshold, a rival's share, valuation =
// the market regime's tech multiple × ARR — the `market` module's regimes reused) + the investor-meeting tile 'H' (term sheets and a giant's
// buyout offer). Spec + as built: docs/full-upgrade/worlds/w15-cloud.md. Every number is TUNE (gates-w15.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w15')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import platform from './mech/platform.js';

const board = ring(['OHOD?LMHL', 'OMHLXO?OD', 'OHOMEODHL', 'OXMHTO?MD']); // 40 tiles, paydays on the corners, 6 × 'H' (פגישה עם משקיעים)
const APP = { k: 'app', n: 'האפליקציה', d: 'החברה שלך: המשתמשים, הצוות והקוד. בשווי: החלק שלך × מכפיל השוק × ההכנסה השנתית.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'app' } };
const ASSET = (k, n, cost, down, cf, d) => ({ k, n, d, cost, down, value: cost, cf });

export default {
  id: 'w15', order: 15, name: 'מגדלי הענן', mechanic: 'platform', modules: ['platform'], minRules: 7, mech: [platform],
  tagline: 'אפליקציה עם מיליון משתמשים ואפס רווח. כל סבב גיוס קונה עוד זמן — ומוכר עוד חתיכה ממך.',
  goalLabel: 'החלק שלך בחברה שווה ₪800 מיליון, עם שנה של מזומן (או רווח)',
  lesson: 'צמיחה עולה כסף, וכסף עולה חתיכה מהחברה. מי שמגייס בזמן הנכון ורק כמה שצריך — נשאר עם חלק גדול ממשהו גדול.',
  story: 'בנית אפליקציה שאנשים אוהבים. עכשיו צריך עוד משתמשים — וכל משתמש עולה כסף בפרסום. כמה זמן הוא יישאר? את זה יודעים רק אחרי כמה חודשים. כשנגמר הכסף מגייסים: בבועה בזול, בחורף ביוקר. השווי נקבע לפי השוק — לא לפי הסבב האחרון. המטרה: החלק שלך שווה ₪800 מיליון, עם שנה של מזומן.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w15 (render lane)
    sky: ['#1e1b4b', '#4c1d95'], fog: '#312e81', board: '#e2e8f0', boardEdge: '#cbd5e1', center: '#f1f5f9', accent: '#7c3aed',
    light: { hemiSky: '#ede9fe', hemiGround: '#475569', sun: '#f5f3ff' }, decor: 'servers',
  },
  board,
  tiles: tilesFor(board, { H: { type: 'investors', name: 'פגישה עם משקיעים', color: '#7c3aed', ink: '#ffffff', icon: 'rocket' }, O: { name: 'הזדמנות בעמק' }, M: { name: 'חדשות הטכנולוגיה' }, X: { name: 'משבר בחברה' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.2, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'modValue', key: 'stakeValue', target: 800000000, label: 'שווי החלק שלך בחברה' }, { type: 'liquidity', months: 12, label: 'חודשי מזומן (או רווח)' }] },
  maxMonths: 84,
  stars: { t2: 70, t3: 58 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 3000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 250000, sideReportFee: 400, tipDoodad: 3000000, doodadWealth: 0.0015, band: { deal: [2000000, 60000000], monthly: [-8000000, 8000000] } },
  lessonDefs: [
    { id: 'ltv_cac', cat: 'world', title: 'LTV מול CAC', text: 'כמה שווה משתמש? הכנסה בחודש כפול כמה חודשים הוא יישאר. כמה הוא עולה? הפרסום חלקי המשתמשים שהגיעו. כל עוד הראשון גדול פי שלושה מהשני — הפרסום מרוויח. ואת "כמה זמן יישאר" יודעים רק אחרי כמה חודשים.' },
    { id: 'dilution', cat: 'world', title: 'דילול', text: 'כל סבב גיוס מוכר חתיכה מהחברה. 10% בבועה עולים מעט; 10% בחורף עולים הרבה — ולפעמים המשקיעים הקודמים מקבלים פיצוי מהחלק שלך. מגייסים כשאפשר, לא כשחייבים.' },
  ],
  systems: {
    cycle: { amp: 0.8 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 250000,
      pool: [['churn', 'המשתמשים נשארים פחות ממה שנראה בהתחלה'], ['ip', 'הקוד לא רשום על שם החברה'], ['team', 'המייסד השני עוזב'], ['client', 'לקוח אחד הוא חצי מההכנסות'], ['cloud', 'חשבון הענן לא שולם שלושה חודשים'], ['court', 'יש תביעה על פטנט']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { app: 'glass_tower', office: 'glass_tower', lab: 'regional_office', building: 'glass_tower', stake: 'glass_tower', side: 'regional_office', biz: 'regional_office' },
  kinds: {
    app: { label: 'האפליקציה', debtLabel: 'הלוואה' }, office: { label: 'משרדים', debtLabel: 'משכנתא' }, lab: { label: 'מעבדה', debtLabel: 'הלוואה' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'soloFounder', gender: 'f', age: 31, family: { partner: 'single', kids: 0 }, name: 'מייסדת יחידה', icon: 'rocket', maxMonths: 84, stars: { t2: 70, t3: 58 },
      desc: 'דנה כתבה את השורה הראשונה של הקוד לבד. 70% מהחברה שלה, ₪20 מיליון בבנק — ושנה וקצת עד שהכסף נגמר.',
      pros: ['70% מהחברה'], cons: ['מעט מזומן: שנה של מסלול'],
      salary: 30000, cash: 20000000,
      expenses: [['שכירות', 7000], ['רכב', 2000], ['אוכל ושוטף', 6000], ['ביטוחים ושוטף', 3000]],
      start: { stake: 0.7, users: 400000, arpu: 6, opex: 2500000, lvl: 1, lastPost: 120000000 }, assets: [APP] },
    { id: 'bigTechExec', gender: 'm', age: 44, family: { partner: 'married', kids: 2 }, name: 'בכיר לשעבר מענקית', icon: 'briefcase', maxMonths: 84, stars: { t2: 70, t3: 58 },
      desc: 'עמית עזב חברת ענק עם צוות, שמות של משקיעים ו־₪80 מיליון שגייס בקלות. אבל רק 45% מהחברה נשארו שלו.',
      pros: ['הרבה מזומן', 'גיוס משתמשים זול ב־15% (צוות מנוסה)'], cons: ['רק 45% מהחברה', 'צוות יקר'],
      salary: 60000, cash: 80000000,
      expenses: [['משכנתא', 15000], ['רכב', 5000], ['אוכל ושוטף', 11000], ['ילדים', 7000], ['ביטוחים ושוטף', 5000]],
      start: { stake: 0.45, users: 600000, arpu: 6, opex: 4000000, lvl: 1, lastPost: 330000000 }, assets: [APP] },
    { id: 'bootstrapper', gender: 'm', age: 38, family: { partner: 'married', kids: 1 }, name: 'עצמאי בלי משקיעים', icon: 'sprout', maxMonths: 84, stars: { t2: 70, t3: 58 },
      desc: 'יוסי בנה מוצר קטן ורווחי בלי שקל של משקיעים. 100% שלו, מרוויח כל חודש — וגדל לאט.',
      pros: ['100% מהחברה', 'רווחי מהיום הראשון'], cons: ['מוצר קטן', 'בלי פרסום בהתחלה', 'מעט מזומן'],
      salary: 25000, cash: 8000000,
      expenses: [['משכנתא', 8000], ['רכב', 2500], ['אוכל ושוטף', 7000], ['ילד', 3000], ['ביטוחים ושוטף', 3000]],
      start: { stake: 1, users: 150000, arpu: 7, opex: 700000, lvl: 0 }, assets: [APP] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    ASSET('office', 'קומת משרדים במגדל', 30000000, 9000000, 160000, 'קומה במגדל משרדים, מושכרת לחברת סטארט־אפ.'),
    ASSET('lab', 'חדר שרתים להשכרה', 12000000, 4000000, 90000, 'חוות שרתים קטנה עם שוכרים.'),
    ASSET('office', 'בניין משרדים קטן', 20000000, 6000000, 115000, 'בניין עם שלושה שוכרים.'),
  ],
  goldenChance: 1 / 30,
  golden: [ASSET('office', 'משרדים של חברה שנסגרה', 15000000, 4500000, 160000, 'חברה שנסגרה מוכרת את המשרדים שלה בהנחה.')],

  doodads: [
    { n: 'מסיבת השקה ענקית', aMult: 1.2, q: 'מסיבה — או חודש של פרסום?' },
    { n: 'כנס טכנולוגיה בחו"ל', aMult: 0.4, q: 'כנס יפה. כמה משתמשים הוא הביא?' },
    { n: 'קנס על פרטיות', aMult: 0.3, need: true, d: 'הרגולטור קנס על שמירת מידע.', q: 'הוצאות שלא תכננת — בשבילן שומרים כרית.' },
    { n: 'שדרוג השרתים', aMult: 0.3, need: true, inst: true, d: 'יותר משתמשים, יותר שרתים.', q: 'הוצאה הכרחית של מי שגדל.' },
    { n: 'רכב חשמלי יוקרתי', aMult: 0.5, inst: true, q: 'רכב יפה. כמה חודשי מסלול הוא עולה?' },
    { n: 'עיצוב מחדש של המשרד', aMult: 0.6, q: 'משרד יפה לא מחזיק משתמשים.' },
  ],

  market: [
    { mk: 'appstore', n: 'שינוי במדיניות חנות האפליקציות', d: 'חנות האפליקציות שינתה כללים: כל משתמש חדש עולה 20% יותר לחצי שנה.', q: 'כשמישהו אחר שולט בערוץ — הוא שולט גם במחיר.' },
    { mk: 'viral', n: 'חודש ויראלי', d: 'סרטון על האפליקציה שלך התפוצץ: משתמשים חדשים בחינם. אבל האם הם יישארו?', q: 'משתמשים בחינם נשארים פחות. בדוק את הקבוצה הזו בעוד חודשיים.' },
    { mk: 'breach', n: 'פריצת מידע', d: 'פורצים חשפו מידע של משתמשים. 10% עזבו מיד.', q: 'אמון נבנה לאט ונשבר מהר.' },
    { mk: 'rivalRound', n: 'המתחרה גייס סבב ענק', d: 'האפליקציה המתחרה גייסה מיליארד ושורפת אותו על פרסום: כל משתמש עולה לך יותר.', q: 'מתחרה עם יותר כסף מעלה את המחיר לכולם.' },
    { mk: 'pop', n: 'הבועה התפוצצה', d: 'מניות הטכנולוגיה צונחות. המכפילים נחתכים, ומשקיעים נעלמים.', q: 'מי שגייס בבועה — יכול לחכות. מי שלא — מגייס עכשיו ביוקר.' },
    { mk: 'copy', n: 'ענקית העתיקה את הפיצ׳ר', d: 'חברת ענק הוסיפה את הפיצ׳ר שלך למוצר שלה. חצי שנה של נטישה גבוהה יותר.', q: 'מה יש לך שאי אפשר להעתיק?' },
    { mk: 'engineer', n: 'מהנדסת מפתח עזבה', d: 'המהנדסת הכי טובה שלך עברה למתחרה. המוצר משתפר לאט יותר לשלושה חודשים.' },
  ],

  crises: [
    { mk: 'outage', n: 'נפילת שרתים', d: 'האפליקציה נפלה ליום שלם: פיצויים ללקוחות ושעות נוספות.', q: 'תשתית היא לא הוצאה — היא ביטוח.' },
    { mk: 'churn', n: 'גל נטישה', d: 'עדכון גרוע: חודש של נטישה גבוהה ב־2%.' },
    { n: 'תביעת פטנט', d: 'חברה טוענת שהקוד שלך מפר פטנט. עורכי דין עולים כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'כדי לחסוך מסלול, ויתרת על המשכורת שלך החודש.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'מענק חדשנות', text: 'רשות החדשנות אישרה מענק: ₪1,500,000.', after: 'כסף שלא מדלל — הכי טוב שיש.' },
    { w: 6, kind: 'cash', amount: -900000, title: 'חשבון ענן מפתיע', text: 'חשבון הענן החודש כפול: ₪900,000.', after: 'הוצאות שגדלות עם המשתמשים — צריך לראות אותן מראש.' },
    { w: 3, kind: 'golden', title: 'טלפון מחברה בקשיים' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'משתמש מכניס ₪6 בחודש ונשאר בממוצע 12 חודשים. הפרסום עולה ₪40 למשתמש. משתלם?', answers: ['כן, יש הכנסה', 'בקושי: 72 מול 40 — פחות מפי שלושה', 'לא, אף פעם'], correct: 1, reward: 'lesson', lesson: 'ltv_cac', explain: 'שווי לקוח (72) מול עלות גיוס (40): פחות מפי שלושה. אחרי עלויות השרתים והצוות — כמעט לא נשאר כלום.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'בבועה מציעים לך ₪50 מיליון תמורת 10%. בחורף — אותו סכום תמורת 30%. מתי לגייס?', answers: ['בחורף, כשצריך', 'בבועה, גם אם עוד לא צריך', 'אף פעם'], correct: 1, reward: 'lesson', lesson: 'dilution', explain: 'מגייסים כשהכסף זול — לא כשנגמר. מי שנשאר בלי מסלול בחורף, מוכר חתיכה גדולה בזול.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כאן הכסף נשרף כדי לגדול. השאלה היא לא רק כמה משתמשים הבאת — אלא כמה הם עלו, כמה זמן הם נשארים, וכמה זמן נשאר לך.',
    dealAsk: ['כמה חודשי מסלול זה עולה?', 'זה מקרב משתמשים — או רק מוציא כסף?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    raised: 'גייסת. עכשיו יש זמן — ופחות חברה. השתמש בזמן כדי להוכיח שהמשתמשים נשארים.',
    crunch: 'נגמר הכסף. המשקיעים הקיימים הכניסו כסף חירום — במחיר נמוך, ועם עוד חתיכה ממך.',
    netOn: 'עברת שני מיליון משתמשים: אפקט הרשת. גיוס משתמשים זול ב־20%, והם נשארים יותר.',
    offer: 'מכרת ב־{amount}. מחיר קבוע עכשיו — בלי סיכון, ובלי עלייה.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם פרסום שמחזיר את עצמו, גיוס בזמן הנכון ושנה של מזומן ביד.',
    won: '₪800 מיליון שהם שלך, ושנה של מזומן. חברה שגדלה בלי למכור את עצמה.',
  },
};
