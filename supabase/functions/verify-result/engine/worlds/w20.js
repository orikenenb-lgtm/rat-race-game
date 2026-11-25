// World 20 — רחוב הקרנות ("הכסף לא שלך"). Goal (all, hold 3): personal net worth ≥ ₪800M AND money under management ≥ ₪4B; ★★★ also
// needs that no gate was ever used. CATALOG-25 §1.4 w20 / §2.2: the rule adapter `funds` (js/worlds/adapters/funds.js: a long / short book of
// 12 fictional companies without margin, client flows by the return vs the index, fees above the high-water mark, redemptions paid by selling
// into the lows, shorts with borrow fees, squeezes and a crash-time ban, the gate, an index product) + the tile 'W' (משקיע חדש: a mandate).
// Spec + as built: docs/full-upgrade/worlds/w20-funds.md. Every number is TUNE (gates-w20.json). Fictional only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w20')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import funds from './adapters/funds.js';

const board = ring(['OWOD?LMWL', 'OMWLXO?OD', 'OWOMEODWL', 'OXMWTO?MD']); // 40 tiles, paydays on the corners, 6 × 'W' (משקיע חדש)
const FUND = { k: 'funds', n: 'החלק שלך בקרן', d: 'הכסף שלך בתוך הקרן: עולה ויורד עם התשואה, כמו הכסף של הלקוחות.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'funds' } };
const HOME = (n, cost, down, cf, d) => ({ k: 'building', n, d, cost, down, value: cost, cf });

export default {
  id: 'w20', order: 20, name: 'רחוב הקרנות', mechanic: 'funds', modules: ['funds'], minRules: 7, mech: [funds],
  tagline: 'הכסף לא שלך. הלקוחות נשארים כשמרוויחים — ובורחים בדיוק בתחתית, כשאתה הכי צריך אותם.',
  goalLabel: 'שווי אישי של ₪800 מיליון ו־₪4 מיליארד בניהול',
  lesson: 'מי שמנהל כסף של אחרים מנהל גם את הפחד שלהם. דמי הצלחה מגיעים רק ממה שמעל המדד, ולקוחות בורחים בתחתית — אז שומרים על סיכון שאפשר לעמוד בו.',
  story: 'יש לך קרן גידור: כסף של לקוחות, וגם קצת שלך. אפשר לקנות מניות של 12 חברות ולמכור בחסר (שורט), אבל בלי הלוואות. דמי ניהול קטנים על כל הכסף, ודמי הצלחה רק על מה שהרווחת מעל המדד. כשהתשואה טובה — לקוחות מגיעים. כשהיא רעה — הם מושכים, ואתה מוכר מניות כדי לשלם להם, גם בתחתית. המטרה: ₪800 מיליון לך, ו־₪4 מיליארד בניהול.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w20 (render lane)
    sky: ['#0b1020', '#020617'], fog: '#0f172a', board: '#0b1020', boardEdge: '#22d3ee', center: '#111827', accent: '#22d3ee',
    light: { hemiSky: '#e0f2fe', hemiGround: '#020617', sun: '#a5f3fc' }, decor: 'screens',
  },
  board,
  tiles: tilesFor(board, { W: { type: 'mandate', name: 'משקיע חדש', color: '#0e7490', ink: '#ffffff', icon: 'chart' }, O: { name: 'הזדמנות' }, M: { name: 'השוק' }, X: { name: 'תקלה בקרן' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'nw', target: 800000000 }, { type: 'modValue', key: 'aum', target: 4000000000, label: 'כסף בניהול' }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 62 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [3000000, 40000000], monthly: [-2000000, 3000000] } },
  lessonDefs: [
    { id: 'other_money', cat: 'world', title: 'כסף של אחרים', text: 'מנהל קרן מרוויח מכסף של לקוחות — אבל הלקוחות מחליטים מתי לצאת. הם מגיעים אחרי שנה טובה, ובורחים אחרי חודשים רעים, בדיוק כשהמחירים נמוכים. כדי לשלם להם הקרן מוכרת בתחתית, וזה פוגע גם במי שנשאר.' },
    { id: 'short_squeeze', cat: 'world', title: 'שורט וסחיטה', text: 'במכירה בחסר מרוויחים כשהמניה יורדת. אבל מניה יכולה לעלות בלי גבול — ולכן גם ההפסד. כשהרבה מוכרים בחסר את אותה מניה וקורה משהו טוב, כולם נאלצים לקנות בחזרה ביחד, והמחיר מזנק.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['tenant', 'השוכר הגדול חתם רק לשנה'], ['roof', 'הגג לא שופץ עשרים שנה'], ['books', 'הדוחות "לפי ההנהלה"'], ['permit', 'יש חריגת בנייה'], ['lien', 'יש שעבוד ישן'], ['area', 'האזור מתרוקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { funds: 'trading_floor', building: 'stone_block', stake: 'stone_block', side: 'stone_block', biz: 'stone_block' },
  kinds: { funds: { label: 'הקרן', debtLabel: 'הלוואה' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'quantAnalyst', gender: 'f', age: 34, family: { partner: 'single', kids: 0 }, name: 'אנליסטית כמותית', icon: 'chart', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'שירה בנתה מודלים בבנק השקעות, ועכשיו יש לה קרן קטנה. המחקר שלה מדויק במיוחד — אבל הלקוחות עוד לא מכירים אותה, ובורחים מהר.',
      pros: ['המחקר הכי מדויק', 'הוצאות נמוכות'], cons: ['קרן קטנה (₪1 מיליארד)', 'לקוחות חסרי סבלנות (פי 1.5)'],
      salary: 45000, cash: 3000000,
      expenses: [['שכירות', 9000], ['רכב', 3000], ['אוכל ושוטף', 7000], ['ביטוחים ושוטף', 3000]],
      start: { aum: 900000000, mine: 80000000, sigma: 0.003, react: 1.5, rep: 0.9 }, assets: [FUND] },
    { id: 'starPicker', gender: 'm', age: 45, family: { partner: 'married', kids: 2 }, name: 'מנהל קרנות כוכב', icon: 'star', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'יואב מופיע בכל כנס ובכל עיתון. הלקוחות סומכים עליו ומביאים הרבה כסף — ובשנה רעה ימשכו פי שניים מהר.',
      pros: ['הכי הרבה כסף משלו (₪150 מיליון)', 'אמון גבוה של הלקוחות'], cons: ['הלקוחות מגיבים פי 2 לכל כיוון'],
      salary: 80000, cash: 6000000,
      expenses: [['משכנתא', 14000], ['רכב', 6000], ['אוכל ושוטף', 12000], ['ילדים', 7000], ['ביטוחים ושוטף', 6000]],
      start: { aum: 1450000000, mine: 150000000, sigma: 0.008, react: 2, rep: 1.15 }, assets: [FUND] },
    { id: 'endowmentPm', gender: 'f', age: 52, family: { partner: 'married', kids: 3 }, name: 'מנהלת תיק מוסדי', icon: 'shield', maxMonths: 84, stars: { t2: 72, t3: 62 },
      desc: 'רחל מנהלת קרן שהלקוח הגדול שלה — קרן של אוניברסיטה — מחזיק 40% ממנה. הוא סבלני, אבל באחד החודשים ימשוך שליש מהכסף שלו בבת אחת.',
      pros: ['הקרן הגדולה (₪2 מיליארד)', 'לקוחות סבלניים'], cons: ['לקוח אחד מחזיק 40% מהקרן', 'מעט כסף משלה (₪50 מיליון)'],
      salary: 60000, cash: 4000000,
      expenses: [['משכנתא', 12000], ['רכב', 4000], ['אוכל ושוטף', 11000], ['ילדים', 8000], ['ביטוחים ושוטף', 5000]],
      start: { aum: 1950000000, mine: 50000000, sigma: 0.008, react: 1, rep: 1, anchor: 0.4 }, assets: [FUND] },
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
    { n: 'מסכים חדשים לחדר המסחר', aMult: 0.4, need: true, d: 'בלי נתונים בזמן — אין מסחר.', q: 'הוצאה הכרחית.' },
    { n: 'כנס משקיעים בחו"ל', aMult: 0.3, q: 'נסיעה נעימה. מי שומר על התיק בזמן הזה?' },
    { n: 'רכב יוקרה', aMult: 0.5, inst: true, q: 'כמה דמי ניהול הוא עולה?' },
    { n: 'ארוחת ערב ללקוחות', aMult: 0.25, need: true, d: 'הלקוחות רוצים לראות אותך.', q: 'יש הוצאות שבאות עם התפקיד.' },
    { n: 'שעון יוקרה', aMult: 0.3, q: 'הלקוחות מסתכלים על התשואה, לא על השעון.' },
  ],

  market: [
    { mk: 'squeeze', jump: 0.45, n: 'סחיטת שורט', d: 'המניה שהכי הרבה מוכרים בחסר קיבלה חדשות טובות וקפצה 45%.', q: 'שורט על מניה צפופה: כולם יוצאים מאותה דלת.' },
    { mk: 'fraud', n: 'הונאה נחשפה', d: 'באחת החברות נחשפה הונאה בדוחות: המניה נפלה 45%.', q: 'מי שמכר אותה בחסר — הרוויח. מי שהחזיק — הפסיד.' },
    { mk: 'unwind', n: 'פירוק עסקה צפופה', d: 'קרן גדולה סוגרת את כל השורטים שלה: כל המניות הצפופות עלו 15%.', q: 'כשכולם באותה עסקה, היציאה צרה.' },
    { mk: 'ban', n: 'איסור על מכירה בחסר', d: 'בשוק יורד הרגולטור אוסר על שורטים: כל השורטים נסגרים.', q: 'בשוק רגיל — האיסור לא חל.' },
    { mk: 'conference', n: 'כנס משקיעים', d: 'הצגת את הקרן בכנס: חלק מהלקוחות שרצו למשוך — נשארו.', q: 'אמון של לקוחות שווה כסף.' },
    { mk: 'analyst', n: 'אנליסט בכיר עזב', d: 'האנליסט הכי טוב שלך עבר למתחרה. הלקוחות שמו לב.', q: 'לקוחות קונים גם אנשים, לא רק מספרים.' },
  ],
  crises: [
    { n: 'תקלה במערכת המסחר', d: 'המערכת נפלה ליום שלם. התיקון עולה כסף.', cash: -1000000, cashLabel: 'תיקון מערכת' },
    { n: 'תביעה של לקוח', d: 'לקוח תובע שלא הסברת לו את הסיכון. פשרה עולה כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'חברת הניהול הקפיאה את המשכורת שלך החודש.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'בונוס מחברת הניהול', text: 'חברת הניהול חילקה בונוס: ₪1,500,000.', after: 'בונוס הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -800000, title: 'קנס מרשות ניירות ערך', text: 'הרשות קנסה על דיווח מאוחר: ₪800,000 מהכיס שלך.', after: 'דיווח בזמן הוא חלק מהאמון.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הקרן עלתה 8% השנה, והמדד עלה 10%. כמה דמי הצלחה תקבל?', answers: ['20% מה־8%', 'כלום — לא היכית את המדד', '20% מה־10%'], correct: 1, reward: 'lesson', lesson: 'other_money', explain: 'כאן דמי ההצלחה הם רק על מה שמעל המדד. מי שמחקה את המדד מקבל רק דמי ניהול.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מכרת בחסר מניה ב־100. כמה אפשר להפסיד?', answers: ['עד 100', 'בלי גבול — המניה יכולה לעלות כמה שתרצה', 'כלום'], correct: 1, reward: 'lesson', lesson: 'short_squeeze', explain: 'מניה יכולה לרדת רק עד אפס, אבל לעלות בלי תקרה. לכן בשורט ההפסד לא מוגבל.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'דמי ההצלחה מגיעים רק ממה שמעל המדד. והלקוחות? הם מסתכלים על 12 החודשים האחרונים.',
    dealAsk: ['כמה מזה שלך, וכמה של הלקוחות?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    regime: 'השוק: {label}. הלקוחות מסתכלים על התשואה שלך מול המדד.',
    outflow: 'לקוחות משכו כסף. כדי לשלם, הקרן מכרה מניות — גם במחיר הנמוך של היום.',
    inflow: 'לקוחות חדשים נכנסו. תשואה טובה מושכת כסף.',
    squeeze: 'סחיטת שורט: המניה שכולם מכרו בחסר קפצה. מי שהיה בשורט נאלץ לקנות בחזרה ביוקר.',
    fraud: 'נחשפה הונאה: המניה נפלה בחצי. מי שמכר אותה בחסר — הרוויח.',
    ban: 'הרגולטור אסר על מכירה בחסר בזמן הקריסה: כל השורטים נסגרו בכוח.',
    anchor: 'הלקוח הגדול שלך מושך שליש מהכסף שלו בחודש הבא. זה לא קשור לתשואה — הוא צריך את הכסף.',
    offerAsk: 'כסף חדש מגדיל את הקרן — אבל אם הוא יברח בחודש רע, תמכור בתחתית בשבילו.',
    offerTake: 'הכסף נכנס. עכשיו הוא מסתכל עליך כל חודש.',
    offerPass: 'ויתרת. לא כל כסף שווה את הסיכון שהוא יברח.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם תשואה מעל המדד, סיכון שהלקוחות יכולים לעמוד בו, ושורטים רק על מניות לא צפופות.',
    won: '₪800 מיליון לך ו־₪4 מיליארד בניהול. הלקוחות נשארו גם בחודשים הרעים.',
  },
};
