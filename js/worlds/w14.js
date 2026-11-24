// World 14 — רובע הבנקים ("אתה הבנק"). Goal (all, hold 3): your equity in the bank ≥ ₪700M AND the capital ratio ≥ 10 % AND no regulator
// intervention in the last 12 paydays. CATALOG-25 §1.4 w14 / §2.4: the new module `credit` (js/worlds/mech/credit.js: 5 loan segments with
// sealed default rates, retail and wholesale deposits, the capital ratio, confidence and runs, adverse selection on price) + the `rate` cards
// (market cards mk 'rate') on the new 'J' tile (הצעה לבנק: a loan book to buy, a big loan, a failed rival's deposits).
// Spec + as built: docs/full-upgrade/worlds/w14-banks.md. Every number is TUNE (tools/balance-data/gates-w14.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w14')); not ranked until the DB migration. minRules 7 (CATALOG-25 worlds ≥ w13).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import credit from './mech/credit.js';

const board = ring(['OJOD?JMJL', 'OMJLXOJOD', 'OJOMEODJL', 'OXMJTO?MD']); // 40 tiles, paydays on the corners, 7 × 'J' (הצעה לבנק)
const BANK = { k: 'bank', n: 'הבנק', d: 'הבנק שלך: ספר ההלוואות, הפיקדונות וההון. בשווי הנקי: החלק שלך בהון.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'bank' } };
const HOME = (n, cost, down, cf, d) => ({ k: 'building', n, d, cost, down, value: cost, cf });

export default {
  id: 'w14', order: 14, name: 'רובע הבנקים', mechanic: 'credit', modules: ['credit'], minRules: 7, mech: [credit],
  tagline: 'אתה הבנק. הכסף שלך הוא בעיקר של אחרים: מאזן אחד, עשרות אלפי מפקידים, ושמועה אחת ברשת שיכולה להוציא את כולם לתור.',
  goalLabel: 'הון של ₪700 מיליון, יחס הון של 10% ושנה בלי המפקח',
  lesson: 'בנק מרוויח מהפער בין הריבית שהוא גובה לזו שהוא משלם — ומת מאובדן אמון. מחיר גבוה מבריח את הלווים הטובים, והלוואה ארוכה על פיקדון קצר נשחקת כשהריבית עולה.',
  story: 'קיבלת את המפתחות לבנק. ההנהלה הקודמת תמחרה הלוואות מעל השוק. רוב הכסף בכספת שייך למפקידים, ורוב ההון שלך מושקע בהלוואות. בכל חודש: כמה לגבות מכל סוג לווה, כמה נזילות להחזיק, ומתי לחלק דיבידנד. המפקח דורש יחס הון של 8% לפחות, והמפקידים — שקט. המטרה: הון של ₪700 מיליון, יחס הון של 10% ושנה שלמה בלי המפקח.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w14 (render lane)
    sky: ['#fde68a', '#c2410c'], fog: '#e7d8b5', board: '#e7d8b5', boardEdge: '#a16207', center: '#f5ecd7', accent: '#475569',
    light: { hemiSky: '#fef3c7', hemiGround: '#a8a29e', sun: '#fff7ed' }, decor: 'columns',
  },
  board,
  tiles: tilesFor(board, { J: { type: 'bankOffer', name: 'הצעה לבנק', color: '#475569', ink: '#ffffff', icon: 'bank' }, M: { name: 'הריבית והשוק' }, X: { name: 'משבר בבנק' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'modValue', key: 'equity', target: 700000000, label: 'ההון שלך בבנק' }, { type: 'modValue', key: 'capRatio', target: 0.1, label: 'יחס הון' }, { type: 'noDefault', months: 12, key: 'regulator', label: 'חודשים בלי התערבות המפקח' }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 60 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [3000000, 40000000], monthly: [-2000000, 3000000] } },
  offers: [
    { kind: 'book', seg: 'mort', n: 'תיק משכנתאות של בנק קטן', d: 'בנק קטן מוכר תיק משכנתאות ותיקות.', size: 0.6, price: 0.97 },
    { kind: 'book', seg: 'cons', n: 'תיק אשראי צרכני מחברת כרטיסים', d: 'חברת כרטיסי אשראי מוכרת הלוואות צרכניות.', size: 0.3, price: 0.9 },
    { kind: 'book', seg: 'dev', n: 'הלוואות ליזמים מבנק שנסגר', d: 'המפרק של בנק שנסגר מוכר הלוואות ליזמי נדל"ן בהנחה.', size: 0.4, price: 0.88 },
    { kind: 'book', seg: 'corp', n: 'הלוואה גדולה לחברת תשתיות', d: 'חברת תשתיות מבקשת הלוואה אחת גדולה — הכל אצל לווה אחד.', size: 0.35, price: 1 },
    { kind: 'book', seg: 'sme', n: 'תיק עסקים קטנים מקרן אשראי', d: 'קרן אשראי שנסגרת מוכרת הלוואות לעסקים קטנים.', size: 0.3, price: 0.92 },
    { kind: 'deposits', n: 'מפקידים של בנק מתחרה שקרס', d: 'בנק מתחרה קרס. המפקידים שלו מחפשים בית — כסף זול, שבורח מהר.', size: 0.8 },
  ],
  lessonDefs: [
    { id: 'bank_run', cat: 'world', title: 'בריחת מפקידים', text: 'בנק מחזיק רק חלק קטן מהפיקדונות במזומן — השאר הוא הלוואות. כשכולם רוצים את הכסף באותו יום, גם בנק בריא נאלץ למכור בהפסד. אמון הוא נכס.' },
    { id: 'adverse_selection', cat: 'world', title: 'ברירה שלילית', text: 'כשהריבית שלך גבוהה מהשוק, הלווים הטובים הולכים לבנק אחר. מי שנשאר הוא מי שאף אחד אחר לא רצה — והוא מחזיר פחות.' },
    { id: 'maturity_mismatch', cat: 'world', title: 'ארוך על קצר', text: 'משכנתא קבועה ל־20 שנה ממומנת בפיקדונות שמתחדשים כל כמה חודשים. כשהריבית עולה, הבנק משלם יותר למפקידים ומקבל אותו דבר מהלווים.' },
  ],
  systems: {
    cycle: { amp: 1.0 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['tenant', 'השוכר הגדול חתם רק לשנה'], ['roof', 'הגג לא שופץ עשרים שנה'], ['books', 'הדוחות "לפי ההנהלה"'], ['permit', 'יש חריגת בנייה'], ['lien', 'יש שעבוד ישן'], ['area', 'האזור מתרוקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { bank: 'bank_hall', building: 'stone_block', stake: 'stone_block', side: 'stone_block', biz: 'stone_block' },
  kinds: { bank: { label: 'הבנק', debtLabel: 'הלוואה' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'riskChief', gender: 'f', age: 49, family: { partner: 'married', kids: 2 }, name: 'מנהלת סיכונים', icon: 'shield', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'דנה ניהלה סיכונים עשרים שנה, ועכשיו הבנק שלה. היא יודעת בדיוק כמה לווים יפסיקו לשלם — אבל הבנק שלה גדל לאט.',
      pros: ['רואה את שיעור הכשל האמיתי של כל סוג לווה'], cons: ['ביקוש לאשראי נמוך ב־20%'],
      salary: 60000, cash: 5000000,
      expenses: [['משכנתא', 12000], ['רכב', 5000], ['אוכל ושוטף', 13000], ['ילדים', 8000], ['ביטוחים ושוטף', 7000]],
      start: { equity: 200e6, book: 2.0e9, retail: 0.78, demand: 0.8 }, assets: [BANK] },
    { id: 'familyBanker', gender: 'm', age: 58, family: { partner: 'married', kids: 3 }, name: 'בנקאי ממשפחה ותיקה', icon: 'columns', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'אבנר הוא הדור הרביעי בבנק המשפחתי. המפקידים שלו נאמנים — אבל ספר ההלוואות הישן מרוכז ביזמי נדל"ן.',
      pros: ['מפקידים נאמנים: בורחים בחצי מהקצב'], cons: ['35% מהספר ביזמי נדל"ן'],
      salary: 50000, cash: 6000000,
      expenses: [['דירה', 16000], ['רכב', 6000], ['אוכל ושוטף', 14000], ['ילדים', 9000], ['ביטוחים ושוטף', 8000]],
      start: { equity: 240e6, book: 2.4e9, retail: 0.85, sticky: 2, mix: { mort: 0.3, sme: 0.15, dev: 0.35, cons: 0.05, corp: 0.15 } }, assets: [BANK] },
    { id: 'fintechFounder', gender: 'f', age: 33, family: { partner: 'single', kids: 0 }, name: 'מייסדת בנק דיגיטלי', icon: 'phone', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'שירן בנתה בנק באפליקציה: גדל מהר, עולה מעט — והמפקידים שלה בורחים בלחיצת כפתור.',
      pros: ['ביקוש לאשראי גבוה ב־60%', 'עלויות תפעול נמוכות ב־40%'], cons: ['מפקידים חמים: בורחים פי 3 מהר יותר'],
      salary: 45000, cash: 4000000,
      expenses: [['שכירות', 9000], ['רכב', 3000], ['אוכל ושוטף', 9000], ['ביטוחים ושוטף', 4000]],
      start: { equity: 180e6, book: 1.6e9, retail: 0.7, demand: 1.6, hot: 3, opex: 0.6, mix: { mort: 0.2, sme: 0.25, dev: 0.05, cons: 0.35, corp: 0.15 } }, assets: [BANK] },
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
    { n: 'אולם כניסה משיש לבנק', aMult: 1.2, inst: true, q: 'שיש לא מעלה את יחס ההון.' },
    { n: 'כנס בנקאים בחו"ל', aMult: 0.3, q: 'נסיעה נעימה. הבנק עובד גם בלעדיך?' },
    { n: 'ביטוח אחריות דירקטורים', aMult: 0.3, need: true, inst: true, d: 'חובה למי שמנהל בנק.', q: 'הוצאה הכרחית.' },
    { n: 'רכב יוקרה', aMult: 0.5, inst: true, q: 'כמה חודשי דיבידנד הוא עולה?' },
    { n: 'תרומה לגאלה של הבורסה', aMult: 0.25, need: true, d: 'כולם שם.', q: 'יש הוצאות שבאות עם התפקיד.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'שעון שמראה את השעה — לא את יחס ההון.' },
  ],

  market: [
    { mk: 'rate', dr: 1, n: 'בנק ישראל מעלה את הריבית באחוז', d: 'הריבית עולה: הפיקדונות מתייקרים, וההלוואות הקבועות לא זזות.', q: 'כמה מהספר שלך בריבית קבועה?' },
    { mk: 'rate', dr: 0.5, n: 'העלאת ריבית קטנה', d: 'הריבית עולה בחצי אחוז.' },
    { mk: 'rate', dr: -0.5, n: 'הורדת ריבית', d: 'הריבית יורדת בחצי אחוז: פיקדונות זולים יותר.' },
    { mk: 'rate', dr: -1, n: 'הורדת ריבית חדה', d: 'הריבית יורדת באחוז. ההלוואות הקבועות שלך נראות פתאום טוב.' },
    { mk: 'slump', months: 6, n: 'מחירי הדירות צונחים', d: 'חצי שנה של משבר בנדל"ן: יזמים מפסיקים לשלם פי 2.', q: 'כמה מהספר שלך אצל יזמים?' },
    { mk: 'rumor', hit: 25, months: 2, n: 'שמועה ברשתות', d: 'פוסט ויראלי טוען שהבנק שלך בצרות. המפקידים מתחילים לשאול.', q: 'שמועה פוגעת יותר בבנק עם הון דק.' },
    { mk: 'calm', hit: 10, months: 3, n: 'דוח רבעוני חזק', d: 'הבנק פרסם דוח טוב: האמון עולה.' },
  ],
  crises: [
    { mk: 'fraud', pct: 0.01, n: 'מעילה בסניף', d: 'מנהל סניף מעל בכספי לקוחות. ההפסד יורד מההון.', q: 'בקרה עולה כסף. מעילה עולה יותר.' },
    { mk: 'stress', n: 'מבחן קיצון של המפקח', d: 'המפקח בודק איך הבנק יעמוד במשבר. בנק עם יחס הון נמוך — השוק שומע על זה.', q: 'כמה הון יש לך מעל המינימום?' },
    { n: 'תביעה ייצוגית', d: 'לקוחות תובעים על עמלות. פשרה עולה כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון הקפיא את משכורת המנכ"ל החודש.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'בונוס מהדירקטוריון', text: 'הדירקטוריון אישר בונוס: ₪1,500,000.', after: 'בונוס הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -800000, title: 'קנס מהמפקח', text: 'המפקח קנס את הבנק על דיווח מאוחר: ₪800,000 מהכיס שלך.', after: 'ציות עולה כסף. אי־ציות עולה יותר.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'העלית את הריבית ללווים באחוז מעל השוק. מי ימשיך לקחת ממך הלוואות?', answers: ['כולם, רק בפחות', 'בעיקר מי שאף בנק אחר לא רוצה', 'אף אחד'], correct: 1, reward: 'lesson', lesson: 'adverse_selection', explain: 'הלווים הטובים הולכים לבנק זול יותר. מי שנשאר — מסוכן יותר. זו ברירה שלילית.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'כמה מהפיקדונות בנק מחזיק במזומן?', answers: ['את כולם', 'חלק קטן — השאר הלוואות', 'כלום'], correct: 1, reward: 'lesson', lesson: 'bank_run', explain: 'רוב הפיקדונות הלוו הלאה. אם כולם באים באותו יום — הבנק צריך למכור הלוואות בהפסד.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'נתת משכנתאות קבועות ב־5%. הריבית על הפיקדונות עלתה ל־5%. מה קרה לרווח?', answers: ['גדל', 'נעלם — אתה משלם כמו שאתה מקבל', 'לא השתנה'], correct: 1, reward: 'lesson', lesson: 'maturity_mismatch', explain: 'הלוואה ארוכה בריבית קבועה על כסף קצר: כשהריבית עולה, הפער נשחק.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'בבנק הכסף הוא בעיקר של אחרים. הרווח מגיע מהפער בריבית — והסכנה מאובדן אמון.',
    dealAsk: ['כמה מזה תצטרך כשהמפקידים ירצו את הכסף?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    runWarn: 'שמועות ברשת. האמון יורד — עוד קצת, ויתחילו למשוך.',
    runHit: 'תור בסניפים: מפקידים משכו {amount} בחודש אחד.',
    regulator: 'המפקח נכנס: יחס ההון {pct}%. שנה בלי דיבידנד ובלי אשראי מסוכן.',
    raised: 'גייסת {amount}. ההון גדל — והחלק שלך קטן.',
    bookSold: 'מכרת {amount} מהספר. פחות סיכון, פחות הכנסה.',
    offerAsk: 'מה זה עושה ליחס ההון — ומי הלווים האלה באמת?',
    offerBuy: 'קנית. עכשיו נראה איך הלווים האלה מחזירים.',
    offerPass: 'ויתרת. לא כל ספר הוא מציאה.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. בנק מנצח עם מחיר נכון, הון בצד ואמון שקט.',
    won: '₪700 מיליון הון, יחס הון בריא ושנה בלי המפקח. בנק שמחזיק.',
  },
};
