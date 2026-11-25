// World 17 — גבעת המעבדות ("מתוך עשר מולקולות, אחת מגיעה למדף"). Goal (all, hold 2): net worth ≥ ₪1.2B — the pipeline at cost, an approved
// drug at 5× its trailing annual profit (never more than the years to its patent cliff) — AND at least 2 products earning. CATALOG-25 §1.4 w17
// / §2.2: the rule adapter `trials` (js/worlds/adapters/trials.js: 6 candidate slots on the 4 public stages of the `stages` lib, printed odds
// with a sealed ±10 pp quality, continue / abandon / license at every readout, ramp to peak sales, the patent cliff, a biotech sector regime)
// + the tile 'V' (מולקולה למכירה: a candidate to buy, due diligence narrows its quality). Spec + as built: docs/full-upgrade/worlds/w17-labs.md.
// Every number is TUNE (gates-w17.json). Fictional molecules and companies only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w17')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import trials from './adapters/trials.js';

const board = ring(['OVOD?LMVL', 'OMVLXO?OD', 'OVOMEODVL', 'OXMVTO?MD']); // 40 tiles, paydays on the corners, 6 × 'V' (מולקולה למכירה)
const LAB = { k: 'lab', n: 'המעבדה', d: 'המולקולות בפיתוח (לפי מה שהושקע בהן), התרופות המאושרות (פי 5 מהרווח השנתי, עד צוק הפטנט) והמפעל.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'lab' } };
const ASSET = (k, n, cost, down, cf, d) => ({ k, n, d, cost, down, value: cost, cf });
const C = (t, ph, spent) => ({ t, ph, spent });

export default {
  id: 'w17', order: 17, name: 'גבעת המעבדות', mechanic: 'trials', modules: ['trials'], minRules: 7, mech: [trials],
  tagline: 'מתוך עשר מולקולות, אחת מגיעה למדף. את הסיכוי של כל שלב כולם יודעים — השאלה היא מתי להפסיק לשלם על חלום.',
  goalLabel: 'שווי נקי של ₪1.2 מיליארד (הפיתוח לפי העלות) ולפחות שתי תרופות שמרוויחות',
  lesson: 'בכל תוצאה של ניסוי שואלים רק: כמה עוד עולה, ומה הסיכוי מכאן. מה שכבר הוצא לא חוזר — וכל פטנט נגמר בתאריך ידוע.',
  story: 'קיבלת מעבדה על גבעה ירוקה. כל מולקולה עוברת ארבעה שלבים — ולכל שלב סיכוי מודפס, מחיר וזמן. בסוף כל שלב מגיעה תוצאה: להמשיך ולשלם על השלב הבא, לעצור, או להעביר לשותף שמשלם עכשיו ולוקח את רוב האפסייד. תרופה שאושרה מרוויחה עד שהפטנט פג — ואז המכירות צונחות. המטרה: שווי של ₪1.2 מיליארד ולפחות שתי תרופות שמרוויחות.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w17 (render lane)
    sky: ['#ccfbf1', '#5eead4'], fog: '#f1f5f9', board: '#f1f5f9', boardEdge: '#0d9488', center: '#a7f3d0', accent: '#0d9488',
    light: { hemiSky: '#f0fdfa', hemiGround: '#365314', sun: '#ffffff' }, decor: 'labs',
  },
  board,
  tiles: tilesFor(board, { V: { type: 'candidate', name: 'מולקולה למכירה', color: '#0d9488', ink: '#ffffff', icon: 'flask' }, O: { name: 'הזדמנות בגבעה' }, M: { name: 'שוק התרופות' }, X: { name: 'תקלה במעבדה' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 2, of: [{ type: 'nw', target: 1200000000 }, { type: 'modValue', key: 'productsEarning', target: 2, label: 'תרופות שמרוויחות' }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 60 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 3000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 250000, sideReportFee: 400, tipDoodad: 3000000, doodadWealth: 0.0015, band: { deal: [3000000, 80000000], monthly: [-20000000, 40000000] } },
  lessonDefs: [
    { id: 'real_option', cat: 'world', title: 'אופציה ריאלית', text: 'כל שלב בפיתוח קונה את הזכות — לא את החובה — לשלם על השלב הבא. בסוף כל שלב מחליטים מחדש: להמשיך, לעצור או להעביר לשותף. הערך הוא בזכות לעצור בזמן.' },
    { id: 'patent_cliff', cat: 'world', title: 'צוק הפטנט', text: 'תרופה מוגנת בפטנט לתקופה ידועה. ביום שהוא פג נכנסות תרופות גנריות, והמכירות צונחות. חברה שלא התחילה לפתח את הדור הבא שנים לפני — נופלת מהצוק.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 250000,
      pool: [['data', 'הנתונים של הניסוי הקודם לא פורסמו'], ['patent', 'יש ערעור על הפטנט'], ['staff', 'החוקרת הראשית עוזבת'], ['lab', 'המעבדה לא עברה ביקורת'], ['supply', 'ספק יחיד לחומר הגלם'], ['lease', 'השכירות נגמרת בעוד שנה']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { lab: 'lab_block', side: 'business', building: 'stone_block', stake: 'stone_block', biz: 'business' },
  kinds: {
    lab: { label: 'המעבדה', debtLabel: 'הלוואה' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'scientist', gender: 'f', age: 44, family: { partner: 'married', kids: 2 }, name: 'מדענית ראשית', icon: 'flask', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'ד"ר יעל גילתה בעצמה את רוב המולקולות במעבדה. היא יודעת כמה כל אחת טובה באמת — אבל אין לה אף תרופה שמוכרת.',
      pros: ['רואה את האיכות האמיתית של המולקולות שלה (הסיכוי האמיתי בכל שלב)'], cons: ['אין תרופה שמרוויחה'],
      salary: 70000, cash: 220000000,
      expenses: [['משכנתא', 10000], ['רכב', 4000], ['אוכל ושוטף', 10000], ['ילדים', 7000], ['ביטוחים ושוטף', 5000]],
      start: { cands: [C(0, 1, 14000000), C(6, 0, 4000000), C(1, 2, 50000000), C(3, 1, 12000000)] }, assets: [LAB] },
    { id: 'pharmaVet', gender: 'm', age: 57, family: { partner: 'married', kids: 3 }, name: 'ותיק תעשיית התרופות', icon: 'briefcase', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'משה ניהל עסקאות רישוי שלושים שנה. יש לו תרופה ללב שמוכרת יפה — והפטנט שלה נגמר בעוד שנה.',
      pros: ['תנאי רישוי טובים ב־20%', 'תרופה מאושרת שמרוויחה'], cons: ['הפטנט של התרופה פג בעוד 12 חודשים', 'מעט מזומן'],
      salary: 60000, cash: 60000000,
      expenses: [['דירה', 14000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 6000], ['ביטוחים ושוטף', 6000]],
      start: { cands: [{ t: 3, ph: 4, spent: 0, drug: 24, cliffIn: 12 }, C(7, 2, 45000000), C(5, 1, 10000000)] }, assets: [LAB] },
    { id: 'bioInvestor', gender: 'f', age: 41, family: { partner: 'single', kids: 0 }, name: 'משקיעת ביוטק', icon: 'chart', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'נטע ניהלה קרן ביוטק, ועכשיו יש לה מעבדה ריקה והרבה מזומן. כל מולקולה תצטרך לקנות או לגלות.',
      pros: ['הרבה מזומן', 'קונה מולקולות ב־40% פחות ומקבלת יותר הצעות בשלבים מתקדמים'], cons: ['אין אף מולקולה בפיתוח'],
      salary: 50000, cash: 380000000,
      expenses: [['שכירות', 12000], ['רכב', 4000], ['אוכל ושוטף', 9000], ['ביטוחים ושוטף', 5000]],
      start: { cands: [] }, assets: [LAB] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    ASSET('building', 'בניין מעבדות להשכרה', 30000000, 12000000, 70000, 'בניין עם חברות ביוטק ששוכרות מעבדות.'),
    ASSET('side', 'חברת שירותי ניסויים קטנה', 12000000, 4000000, 90000, 'חברה שמריצה ניסויים לחברות אחרות.'),
    ASSET('building', 'דירות לחוקרים ליד הגבעה', 18000000, 7000000, 45000, 'דירות שהחוקרים שוכרים.'),
  ],
  goldenChance: 1 / 30,
  golden: [ASSET('side', 'מעבדת אבחון מפירוק', 10000000, 3500000, 120000, 'מעבדת אבחון רווחית נמכרת בחצי מחיר.')],

  doodads: [
    { n: 'כנס מדעי בחו"ל', aMult: 0.4, q: 'נסיעה מעניינת. כמה חודשי ניסוי זה?' },
    { n: 'מיקרוסקופ יוקרתי לחדר שלך', aMult: 0.6, inst: true, q: 'מכשיר יפה לא מקצר את שלב III.' },
    { n: 'ביטוח אחריות לניסויים', aMult: 0.3, need: true, inst: true, d: 'חובה לכל מי שמריץ ניסוי בבני אדם.', q: 'הוצאה הכרחית.' },
    { n: 'רכב חשמלי חדש', aMult: 0.5, inst: true, q: 'כמה מזה היה מממן חודש של ניסוי?' },
    { n: 'ערב התרמה של בית החולים', aMult: 0.25, need: true, d: 'כולם שם.', q: 'יש הוצאות שבאות עם התפקיד.' },
  ],

  market: [
    { mk: 'compete', area: 'onc', n: 'מתחרה אושרה באונקולוגיה', d: 'חברה אחרת קיבלה אישור לתרופה דומה: נתח השוק של תרופות האונקולוגיה שלך יורד ב־40%.', q: 'תרופה מאושרת היא לא מונופול.' },
    { mk: 'compete', area: 'cardio', n: 'מתחרה אושרה ללב', d: 'תרופה חדשה ללב נכנסה לשוק: נתח השוק של תרופות הלב שלך יורד ב־40%.' },
    { mk: 'safety', area: 'neuro', n: 'אות בטיחות במוח ועצבים', d: 'תופעת לוואי נדירה התגלתה בקבוצת תרופות: הסיכוי של מולקולות המוח והעצבים יורד ב־8 נקודות.', q: 'סיכוי מודפס הוא הערכה — לא הבטחה.' },
    { mk: 'safety', area: 'immu', n: 'אות בטיחות בחיסון', d: 'דיווח על תופעות לוואי: הסיכוי של מולקולות החיסון יורד ב־8 נקודות.' },
    { mk: 'fast', area: 'rare', n: 'מסלול מהיר למחלות נדירות', d: 'הרשות מקצרת את הבדיקה: ניסויים במחלות נדירות מתקצרים בחודשיים.' },
    { mk: 'fast', area: 'onc', n: 'מסלול מהיר לאונקולוגיה', d: 'ניסויים באונקולוגיה מתקצרים בחודשיים.' },
    { mk: 'generic', area: 'metab', n: 'ערעור גנרי במטבוליזם', d: 'יצרן גנרי ניצח בבית המשפט: הפטנטים במטבוליזם נגמרים שנה מוקדם יותר.', q: 'צוק הפטנט יכול להתקרב.' },
    { mk: 'generic', area: 'cardio', n: 'ערעור גנרי ללב', d: 'הפטנטים על תרופות הלב נגמרים שנה מוקדם יותר.' },
    { mk: 'pricing', n: 'רפורמת מחירים', d: 'המדינה מורידה את מחירי התרופות ב־15%.', q: 'גם הכנסה מתרופה מאושרת תלויה במישהו אחר.' },
    { mk: 'bull', n: 'בועת ביוטק', d: 'המשקיעים מתלהבים: עסקאות רישוי ומולקולות למכירה מתייקרות ב־30%.' },
    { mk: 'winter', n: 'חורף בביוטק', d: 'הכסף נעלם מהתחום: שותפים משלמים 40% פחות על רישוי — ומולקולות נמכרות בזול.' },
  ],
  crises: [
    { mk: 'cro', n: 'חברת הניסויים קרסה', d: 'החברה שמריצה את אחד הניסויים שלך קרסה: שלושה חודשי עיכוב.', q: 'ניסוי שנעצר עדיין עולה זמן.' },
    { n: 'תביעה על פטנט', d: 'מתחרה תובע על הפטנט. ההגנה עולה כסף.', cash: -3000000, cashLabel: 'עורכי דין' },
    { n: 'ריקול של אצווה', d: 'אצווה פגומה חזרה מבתי המרקחת.', cash: -2000000, cashLabel: 'ריקול' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון הקפיא את המשכורת שלך החודש כדי לשמור מזומן לניסויים.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 2000000, title: 'מענק מחקר', text: 'קרן מחקר אישרה מענק: ₪2,000,000.', after: 'מענק הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -1000000, title: 'ביקורת של הרשות', text: 'הרשות מצאה ליקויים במעבדה. התיקון: ₪1,000,000.', after: 'איכות עולה כסף. ניסוי שנפסל עולה יותר.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'השקעת ₪60 מיליון במולקולה. שלב III יעלה עוד ₪100 מיליון, והסיכוי מכאן ירד ל־20%. מה קובע אם להמשיך?', answers: ['ה־60 מיליון שכבר הושקעו', 'רק ה־100 מיליון שעוד צריך והסיכוי מכאן', 'כמה זמן כבר עבדנו עליה'], correct: 1, reward: 'lesson', lesson: 'sunk_cost', explain: 'מה שהוצא לא חוזר בכל מקרה. משווים רק את מה שעוד צריך לשלם לערך הצפוי מכאן.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'התרופה שלך מרוויחה ₪20 מיליון בחודש, והפטנט נגמר בעוד שנתיים. כמה היא שווה?', answers: ['כמו תרופה עם פטנט ל־10 שנים', 'בערך שנתיים של רווח — ואז הרבה פחות', 'כלום'], correct: 1, reward: 'lesson', lesson: 'patent_cliff', explain: 'הרווח נגמר בתאריך ידוע. תרופה קרובה לצוק שווה פחות — גם אם היא מרוויחה יפה היום.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'למה כדאי לשלם על שלב I גם כשהסיכוי להגיע למדף הוא רק 10%?', answers: ['כי אולי נצליח', 'כי שלב זול קונה מידע — ואפשר לעצור לפני השלב היקר', 'כי כולם עושים את זה'], correct: 1, reward: 'lesson', lesson: 'real_option', explain: 'כל שלב הוא אופציה: משלמים מעט כדי לדעת יותר, ועוצרים לפני שמשלמים הרבה.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כאן הכסף יוצא כל חודש לניסויים, ונכנס רק כשתרופה מאושרת. בכל תוצאה: כמה עוד עולה, ומה הסיכוי מכאן?',
    dealAsk: ['כמה חודשי ניסוי זה עולה?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    approved: '{name} אושרה! המכירות יעלו לשיא תוך שנה — ויימשכו עד שהפטנט יפוג.',
    readoutWin: '{name}: {stage} הצליח. להמשיך, לעצור או להעביר לשותף? מה שכבר הוצא לא משנה את התשובה.',
    readoutFail: '{name} נכשלה ב{stage}. {amount} שהושקעו בה לא יחזרו — וגם לא היו חוזרים אם היית ממשיך.',
    cliff: 'הפטנט של {name} פג: גנריות נכנסות, והמכירות צונחות ב־80%.',
    stall: 'אין מזומן לשלב הבא של {name}: הניסוי עומד, והזמן רץ.',
    offerAsk: 'מה הסיכוי מכאן ועד המדף — וכמה עוד יעלה להגיע לשם?',
    offerBuy: 'קנית את {name}. עכשיו היא שלך — עם כל השלבים שנשארו.',
    offerPass: 'ויתרת. לא כל מולקולה שווה את המחיר.',
    sector: 'שוק הביוטק: {label}. מחירי העסקאות זזים.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם צינור רחב, עצירה בזמן ותרופה חדשה לפני שהפטנט הישן פג.',
    won: '₪1.2 מיליארד ושתי תרופות שמרוויחות. ידעת מתי לשלם על חלום — ומתי להפסיק.',
  },
};
