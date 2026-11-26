// World 18 — חוף הסערות ("הלקוחות משלמים היום. הסערה מגיעה מתי שהיא רוצה"). Goal (all, hold 3): net worth ≥ ₪1.2B (your stake in the
// insurer's equity) AND solvency ≥ 1.2 AND a 12-month combined ratio ≤ 100 %. CATALOG-25 §1.4 w18 / §2.2 / §2.4: the new module `insure`
// (js/worlds/mech/insure.js: five lines priced against the market with adverse selection, long-tail reserves with a sealed adequacy, a storm
// season, reinsurance — quota share, XoL layers, a cat bond —, a float in two liquidity classes, solvency and the regulator) + the tile 'Z'
// (תיק פוליסות למכירה: a book to buy, due diligence narrows its loss ratio). Spec + as built: docs/full-upgrade/worlds/w18-storms.md.
// Every number is TUNE (gates-w18.json). Fictional companies only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w18')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import insure from './mech/insure.js';

const board = ring(['OZOD?LMZL', 'OMZLXO?OD', 'OZOMEODZL', 'OXMZTO?MD']); // 40 tiles, paydays on the corners, 6 × 'Z' (תיק פוליסות למכירה)
const INS = { k: 'ins', n: 'חברת הביטוח', d: 'חברת הביטוח שלך: הפוליסות, כספי הפוליסות שמושקעים והעתודות לתביעות. בשווי הנקי: החלק שלך בהון.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'ins' } };
const HOME = (n, cost, down, cf, d) => ({ k: 'building', n, d, cost, down, value: cost, cf });

export default {
  id: 'w18', order: 18, name: 'חוף הסערות', mechanic: 'insure', modules: ['insure'], minRules: 7, mech: [insure],
  tagline: 'הלקוחות משלמים היום. הסערה מגיעה מתי שהיא רוצה — ומי שגבה מעט מדי בקיץ יגלה את זה בחורף.',
  goalLabel: 'שווי נקי של ₪1.2 מיליארד, כושר פירעון 120% ויחס משולב של עד 100% בשנה האחרונה',
  lesson: 'פרמיה שנכנסת היום היא לא רווח — היא הלוואה מהלקוחות עד שהתביעה תגיע. וסערה אחת פוגעת בכל החוף ביחד, בדיוק כשהשוק נופל.',
  story: 'קיבלת חברת ביטוח בעיר חוף. כל חודש נכנסות פרמיות — רכב, דירות בחוף ובפנים הארץ, בריאות ואובדן הכנסות לעסקים — ורק אחר כך מגיעות התביעות. בכל חודש מחליטים: כמה לגבות מכל ענף מול מחיר השוק, כמה מהסיכון להעביר למבטח משנה, ואיפה להשקיע את כספי הפוליסות. באוגוסט עד אוקטובר עונת הסערות. המטרה: שווי של ₪1.2 מיליארד, כושר פירעון של 120% ושנה שבה הביטוח עצמו מרוויח.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w18 (render lane)
    sky: ['#94a3b8', '#312e81'], fog: '#cbd5e1', board: '#cbd5e1', boardEdge: '#312e81', center: '#e2e8f0', accent: '#f97316',
    light: { hemiSky: '#e0e7ff', hemiGround: '#475569', sun: '#f8fafc' }, decor: 'lighthouse',
  },
  board,
  calendar: { startMonth: 1 },
  tiles: tilesFor(board, { Z: { type: 'policyBook', name: 'תיק פוליסות למכירה', color: '#312e81', ink: '#ffffff', icon: 'umbrella' }, O: { name: 'הזדמנות בחוף' }, M: { name: 'שוק הביטוח' }, X: { name: 'נזק בחוף' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'nw', target: 1200000000 }, { type: 'modValue', key: 'solvency', target: 1.2, label: 'כושר פירעון' }, { type: 'modValue', key: 'combined12', target: 1, cmp: 'le', label: 'יחס משולב (12 חודשים)' }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 60 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [3000000, 40000000], monthly: [-2000000, 3000000] } },
  lessonDefs: [
    { id: 'correlated_tail', cat: 'world', title: 'הזנב המתואם', text: 'אלף בתים בחוף הם לא אלף סיכונים נפרדים: סערה אחת פוגעת בכולם באותו לילה — ולפעמים באותו חודש גם השוק נופל. את הזנב הזה מוכרים למבטח משנה לפני העונה, כשהוא זול.' },
    { id: 'combined_ratio', cat: 'world', title: 'יחס משולב', text: 'כמה מכל שקל פרמיה חוזר כתביעות והוצאות. מתחת ל־100% — הביטוח עצמו מרוויח. מעל 100% — משלמים ללקוחות יותר ממה שגובים, ורק הריבית על הכסף מסתירה את זה.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['tenant', 'השוכר הגדול חתם רק לשנה'], ['roof', 'הגג לא שופץ עשרים שנה'], ['flood', 'הבניין באזור הצפה'], ['permit', 'יש חריגת בנייה'], ['lien', 'יש שעבוד ישן'], ['area', 'האזור מתרוקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { ins: 'insurer_hq', building: 'stone_block', stake: 'stone_block', side: 'stone_block', biz: 'stone_block' },
  kinds: { ins: { label: 'חברת הביטוח', debtLabel: 'הלוואה' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'actuary', gender: 'f', age: 46, family: { partner: 'married', kids: 2 }, name: 'אקטוארית', icon: 'chart', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'רונית חישבה תעריפים עשרים שנה, ועכשיו החברה שלה. היא יודעת כמה כל ענף באמת מפסיד — אבל החברה קטנה.',
      pros: ['רואה את יחס התביעות האמיתי של כל ענף (ושל כל תיק שמוצע לה)'], cons: ['החברה הקטנה מבין השלוש'],
      salary: 60000, cash: 4000000,
      expenses: [['משכנתא', 10000], ['רכב', 4000], ['אוכל ושוטף', 10000], ['ילדים', 7000], ['ביטוחים ושוטף', 5000]],
      start: { equity: 400000000, gwp: 900000000 }, assets: [INS] },
    { id: 'topBroker', gender: 'm', age: 52, family: { partner: 'married', kids: 3 }, name: 'סוכן ביטוח מוביל', icon: 'briefcase', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'אבי מכר ביטוחים בכל החוף. כולם מכירים אותו — הוא מביא הרבה לקוחות, אבל מתקשה לגבות מהם מחיר מלא.',
      pros: ['פי 1.4 לקוחות בכל מחיר'], cons: ['הפרמיה שלו נמוכה ב־5% מהמחיר שקבע', 'הרבה דירות בחוף'],
      salary: 55000, cash: 5000000,
      expenses: [['דירה', 14000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 6000], ['ביטוחים ושוטף', 6000]],
      start: { equity: 440000000, gwp: 900000000, mix: { car: 0.28, coast: 0.22, inland: 0.18, health: 0.18, bi: 0.14 } }, assets: [INS] },
    { id: 'mutualChair', gender: 'f', age: 58, family: { partner: 'married', kids: 2 }, name: 'יו"ר חברה הדדית', icon: 'shield', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'מרים עומדת בראש חברת ביטוח שבבעלות המבוטחים. ההון זול והגדול מבין השלוש — אבל כל שינוי מחיר צריך אישור של האסיפה.',
      pros: ['הון גדול', 'גיוס הון בלי הנחה (מבעלי הפוליסות)'], cons: ['אין דיבידנד', 'שינוי מחיר נכנס לתוקף רק בחודש הבא'],
      salary: 45000, cash: 3000000,
      expenses: [['שכירות', 12000], ['רכב', 4000], ['אוכל ושוטף', 9000], ['ביטוחים ושוטף', 5000]],
      start: { equity: 500000000, gwp: 1100000000 }, assets: [INS] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    HOME('דירה להשכרה על הטיילת', 9000000, 3500000, 18000, 'דירה עם נוף לים — וחלון לסערות.'),
    HOME('בניין משרדים בפנים הארץ', 25000000, 10000000, 50000, 'בניין עם שוכרים ותיקים, רחוק מהחוף.'),
    HOME('חנות במרכז העיר', 7000000, 3000000, 15000, 'חנות עם שוכר רשת.'),
  ],
  goldenChance: 1 / 30,
  golden: [HOME('בניין מפירוק במחיר מציאה', 18000000, 7000000, 65000, 'המפרק מוכר בניין מניב ב־30% הנחה.')],

  doodads: [
    { n: 'סירת מפרש', aMult: 0.6, inst: true, q: 'סירה יפה. מי מבטח אותה בעונת הסערות?' },
    { n: 'כנס מבטחים בחו"ל', aMult: 0.3, q: 'נסיעה נעימה. החברה עובדת גם בלעדייך?' },
    { n: 'ביטוח אחריות דירקטורים', aMult: 0.3, need: true, inst: true, d: 'חובה למי שמנהל חברת ביטוח.', q: 'הוצאה הכרחית.' },
    { n: 'רכב יוקרה', aMult: 0.5, inst: true, q: 'כמה חודשי פרמיה הוא עולה?' },
    { n: 'ערב התרמה של המצילים', aMult: 0.25, need: true, d: 'כולם שם.', q: 'יש הוצאות שבאות עם התפקיד.' },
  ],

  market: [
    { mk: 'court', pct: 0.08, n: 'פסק דין שמייקר תביעות ישנות', d: 'בית המשפט הרחיב את הפיצוי בתביעות גוף: העתודות לתביעות הישנות עולות ב־8%.', q: 'עתודה היא הערכה — לא חשבון סגור.' },
    { mk: 'spike', n: 'מבטחי המשנה מעלים מחירים', d: 'אחרי שנה קשה בעולם: ביטוח משנה לסערות יקר פי 1.6 לשנה.', q: 'ביטוח קונים כשהוא זול — לא אחרי הסערה.' },
    { mk: 'rule', n: 'כלל הון חדש של המפקח', d: 'המפקח מחמיר: דרישת ההון עולה ב־15% לשנתיים.' },
    { mk: 'crash', pct: 0.15, n: 'ירידה חדה בשוק ההון', d: 'החלק המסוכן של כספי הפוליסות יורד ב־15%.', q: 'כספי הפוליסות שייכים בסוף למבוטחים.' },
    { mk: 'grow', line: 'health', n: 'מעסיקים גדולים מחפשים ביטוח בריאות', d: 'הביקוש לביטוח בריאות עולה ב־10%.' },
    { mk: 'grow', line: 'car', n: 'שנת שיא במכירות רכב', d: 'הביקוש לביטוח רכב עולה ב־10%.' },
    { mk: 'grow', line: 'coast', n: 'בנייה חדשה על החוף', d: 'שכונה חדשה על החוף: הביקוש לביטוח דירות בחוף עולה ב־10%.', q: 'עוד בתים בחוף — עוד בתים באותה סערה.' },
  ],
  crises: [
    { mk: 'flood', sev: 0.6, n: 'שיטפון בפנים הארץ', d: 'גשם חריג הציף שכונות ועסקים רחוק מהחוף. ביטוח משנה לסערות לא מכסה שיטפון.', q: 'לא כל אסון מגיע מהים.' },
    { mk: 'fraud', pct: 0.04, n: 'טבעת הונאה בתביעות', d: 'נחשפה טבעת של תביעות מזויפות באחד הענפים. הכסף כבר שולם.', q: 'בדיקת תביעות עולה כסף. הונאה עולה יותר.' },
    { n: 'תביעה ייצוגית', d: 'מבוטחים תובעים על דחיית תביעות. פשרה עולה כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון הקפיא את משכורת המנכ"לית החודש.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'בונוס מהדירקטוריון', text: 'הדירקטוריון אישר בונוס: ₪1,500,000.', after: 'בונוס הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -800000, title: 'קנס מהמפקח', text: 'המפקח קנס על דיווח מאוחר: ₪800,000 מהכיס שלך.', after: 'ציות עולה כסף. אי־ציות עולה יותר.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הורדת מחירים ב־10%, והפרמיות זינקו ב־30% כבר החודש. האם החברה מרוויחה יותר?', answers: ['כן — נכנס יותר כסף', 'עוד לא ידוע — התביעות על הפוליסות האלה יגיעו אחר כך', 'לא, אף פעם'], correct: 1, reward: 'lesson', lesson: 'combined_ratio', explain: 'פרמיה מגיעה לפני התביעה. רק כשהתביעות מגיעות יודעים אם המחיר היה נכון.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'ביטחת אלף בתים בחוף. למה זה מסוכן יותר מאלף ביטוחי בריאות?', answers: ['כי בתים יקרים יותר', 'כי סערה אחת פוגעת בכולם ביחד', 'זה לא מסוכן יותר'], correct: 1, reward: 'lesson', lesson: 'correlated_tail', explain: 'מחלות קורות לאנשים שונים בזמנים שונים. סערה פוגעת בכל החוף באותו לילה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מתי הכי כדאי לקנות ביטוח משנה לסערות?', answers: ['מיד אחרי סערה גדולה', 'לפני העונה, בשנה שקטה', 'אף פעם'], correct: 1, reward: 'lesson', lesson: 'correlated_tail', explain: 'אחרי סערה כולם רוצים כיסוי, והמחיר קופץ. בשנה שקטה הוא זול.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'בביטוח הכסף מגיע קודם והתביעות אחר כך. פרמיה היא לא רווח — רק יחס משולב מתחת ל־100% הוא רווח.',
    dealAsk: ['כמה מזה תצטרך אם הסערה תגיע?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    stormHit: '{label}: נזק של {amount}. אחרי ביטוח המשנה: {net} יוצאים מהקופה.',
    stormSeason: 'עונת הסערות התחילה. כמה מהחוף מבוטח אצלך — ומי מבטח אותך?',
    regulator: 'המפקח נכנס: כושר פירעון {pct}%. שנה בלי דיבידנד ובלי צמיחה.',
    hard: 'ביטוח המשנה התייקר אחרי הסערה. מי שקנה לפני — שילם פחות.',
    crash: 'קריסה בשוק ההון: החלק המסוכן של כספי הפוליסות ירד.',
    offerAsk: 'כמה מהפרמיה תחזור כתביעות — ומה זה עושה לכושר הפירעון?',
    offerBuy: 'קנית את התיק. עכשיו נראה כמה תביעות מגיעות איתו.',
    offerPass: 'ויתרת. לא כל תיק הוא מציאה.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם מחיר שמכסה את התביעות, ביטוח משנה לפני העונה והון בצד.',
    won: '₪1.2 מיליארד, כושר פירעון בריא וביטוח שמרוויח בעצמו. עברת את עונת הסערות.',
  },
};
