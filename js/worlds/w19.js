// World 19 — פעמון הבורסה ("החברה שלך עולה לבורסה"). Goal (all, hold 3): the market value of your stake ≥ ₪1.5B AND net debt ≤ 3 × EBITDA.
// CATALOG-25 §1.4 w19 / §2.2: the rule adapter `bell` (js/worlds/adapters/bell.js: an operating group of two divisions, a public price that
// reacts to your guidance, buybacks, dividends and offerings, the IPO's month and float, an activist) + the tile 'W' (רכישה משלימה: a bolt-on,
// paid in cash or in shares). Spec + as built: docs/full-upgrade/worlds/w19-bell.md. Every number is TUNE (gates-w19.json). Fictional only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w19')); not ranked until the DB migration. minRules 7. No content pool (legacy decks).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import bell from './adapters/bell.js';

const board = ring(['OWOD?LMWL', 'OMWLXO?OD', 'OWOMEODWL', 'OXMWTO?MD']); // 40 tiles, paydays on the corners, 6 × 'W' (רכישה משלימה)
const CO = { k: 'bell', n: 'החברה', d: 'החברה שלך: המפעלים, הרשת, החוב והמניות. בשווי הנקי: החלק שלך לפי מחיר המניה (לפני ההנפקה: 70% ממנו).', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'bell' } };
const HOME = (n, cost, down, cf, d) => ({ k: 'building', n, d, cost, down, value: cost, cf });

export default {
  id: 'w19', order: 19, name: 'פעמון הבורסה', mechanic: 'bell', modules: ['bell'], minRules: 7, mech: [bell],
  tagline: 'החברה שלך עולה לבורסה. מעכשיו יש לה מחיר בכל חודש — ולכל מספר שתבטיח יש קהל שבודק אותך.',
  goalLabel: 'שווי של ₪1.5 מיליארד לחלק שלך בבורסה, וחוב נטו של עד פי 3 מהרווח התפעולי',
  lesson: 'מחיר המניה הוא הרווח כפול האמון. מי שמבטיח מעט נענש היום, מי שמבטיח הרבה נענש ברבעון — וקונים מניות בזול, לא בשיא.',
  story: 'יש לך קבוצה של מפעלים ורשת חנויות. מחיר המניה — אם היא רשומה — הוא הרווח של השנה האחרונה, כפול המכפיל של השוק, כפול כמה שמאמינים לך, פחות החוב. בכל רבעון אתה מפרסם הדרכה: כמה תרוויח. עמדת בה — המניה עולה. פספסת — היא נופלת. אפשר להשקיע בצמיחה, לקנות מניות בחזרה, לחלק דיבידנד או להנפיק עוד מניות. המטרה: ₪1.5 מיליארד לחלק שלך, בלי חוב גבוה מדי.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w19 (render lane)
    sky: ['#374151', '#111827'], fog: '#1f2937', board: '#1f2937', boardEdge: '#b45309', center: '#374151', accent: '#16a34a',
    light: { hemiSky: '#f3f4f6', hemiGround: '#111827', sun: '#fde68a' }, decor: 'bell',
  },
  board,
  tiles: tilesFor(board, { W: { type: 'boltOn', name: 'רכישה משלימה', color: '#b45309', ink: '#ffffff', icon: 'bell' }, O: { name: 'הזדמנות' }, M: { name: 'הבורסה' }, X: { name: 'תקלה בחברה' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'modValue', key: 'stakeMkt', target: 1500000000, label: 'החלק שלך בבורסה' }, { type: 'modValue', key: 'netDebtEbitda', target: 3, cmp: 'le', label: 'חוב נטו ÷ רווח תפעולי' }] },
  maxMonths: 66,
  stars: { t2: 58, t3: 50 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [3000000, 40000000], monthly: [-2000000, 3000000] } },
  lessonDefs: [
    { id: 'guidance_cred', cat: 'world', title: 'הדרכה ואמינות', text: 'חברה רשומה מפרסמת כמה היא צפויה להרוויח. מי שעומד בהבטחה — זוכה באמון, והמניה שלו שווה יותר. מי שמבטיח יותר מדי ומפספס נענש פעמיים: על המספר ועל האמון. ומי שמבטיח מעט מדי — משלם על זה כבר היום.' },
    { id: 'buyback', cat: 'world', title: 'קנייה עצמית', text: 'כשחברה קונה את המניות של עצמה, לכל מניה שנשארה יש חלק גדול יותר ברווח. זה משתלם כשהמניה זולה. בשיא — עדיף להנפיק מניות, כי מקבלים הרבה כסף על כל אחת.' },
  ],
  systems: {
    cycle: { amp: 0.6 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['tenant', 'השוכר הגדול חתם רק לשנה'], ['roof', 'הגג לא שופץ עשרים שנה'], ['books', 'הדוחות "לפי ההנהלה"'], ['permit', 'יש חריגת בנייה'], ['lien', 'יש שעבוד ישן'], ['area', 'האזור מתרוקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { bell: 'exchange_floor', building: 'stone_block', stake: 'stone_block', side: 'stone_block', biz: 'stone_block' },
  kinds: { bell: { label: 'החברה', debtLabel: 'הלוואה' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'founderCeo', gender: 'm', age: 50, family: { partner: 'married', kids: 3 }, name: 'מייסד ומנכ"ל', icon: 'briefcase', maxMonths: 66, stars: { t2: 58, t3: 50 },
      desc: 'גיל בנה את הקבוצה מאפס ומחזיק 80% ממנה. השוק סומך עליו — אבל החברה עוד לא רשומה, ואין לה מחיר.',
      pros: ['80% מהחברה', 'אמינות גבוהה'], cons: ['החברה לא רשומה: צריך לבחור מתי ובכמה להנפיק'],
      salary: 70000, cash: 4000000,
      expenses: [['משכנתא', 12000], ['רכב', 5000], ['אוכל ושוטף', 11000], ['ילדים', 8000], ['ביטוחים ושוטף', 5000]],
      start: { ebitda: 11000000, debt: 250000000, cash: 40000000, stake: 0.8, cred: 1.1 }, assets: [CO] },
    { id: 'familyBoard', gender: 'f', age: 55, family: { partner: 'married', kids: 2 }, name: 'נציגת המשפחה', icon: 'shield', maxMonths: 66, stars: { t2: 58, t3: 50 },
      desc: 'אורית מייצגת משפחה שמחזיקה 60% מחברה רשומה ותיקה. המשפחה מצפה לדיבידנד כל שנה — בלי זה האמון בהנהלה נשחק.',
      pros: ['חברה רשומה', 'חוב נמוך'], cons: ['המשפחה דורשת דיבידנד שנתי'],
      salary: 55000, cash: 5000000,
      expenses: [['דירה', 14000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 6000], ['ביטוחים ושוטף', 6000]],
      start: { ebitda: 12000000, debt: 200000000, cash: 50000000, stake: 0.6, cred: 1, listed: true, family: true, divAt: 0 }, assets: [CO] },
    { id: 'turnaroundCeo', gender: 'm', age: 47, family: { partner: 'single', kids: 0 }, name: 'מנכ"ל הבראה', icon: 'chart', maxMonths: 66, stars: { t2: 58, t3: 50 },
      desc: 'רון קנה בזול חלק גדול מחברה רשומה שנקלעה לצרות. יש חוב כבד ושוק שלא מאמין להנהלה — אבל אם ההבראה תצליח, המניה תזנק.',
      pros: ['70% מהחברה, שנקנו בזול', 'הרבה מקום לעלייה'], cons: ['חוב של יותר מפי 3 מהרווח', 'אמינות נמוכה'],
      salary: 50000, cash: 3000000,
      expenses: [['שכירות', 12000], ['רכב', 4000], ['אוכל ושוטף', 9000], ['ביטוחים ושוטף', 5000]],
      start: { ebitda: 14000000, debt: 440000000, cash: 30000000, stake: 0.7, cred: 0.7, listed: true }, assets: [CO] },
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
    { n: 'צלצול בפעמון עם מסיבה', aMult: 0.4, q: 'מסיבה יפה. המניה לא עולה ממנה.' },
    { n: 'כנס משקיעים בחו"ל', aMult: 0.3, q: 'נסיעה נעימה. מי עונה לאנליסטים בזמן הזה?' },
    { n: 'ביטוח אחריות דירקטורים', aMult: 0.3, need: true, inst: true, d: 'חובה בחברה רשומה.', q: 'הוצאה הכרחית.' },
    { n: 'רכב יוקרה', aMult: 0.5, inst: true, q: 'כמה מניות הוא עולה?' },
    { n: 'תרומה לגאלה של הבורסה', aMult: 0.25, need: true, d: 'כולם שם.', q: 'יש הוצאות שבאות עם התפקיד.' },
  ],

  market: [
    { mk: 'mood', dm: 0.08, n: 'המניה נכנסת למדד', d: 'קרנות מדד חייבות לקנות את המניה: מצב הרוח בשוק עולה.', q: 'קרנות מדד קונות בלי לשאול — וגם ימכרו בלי לשאול.' },
    { mk: 'mood', dm: -0.1, n: 'דוח של מוכר בחסר', d: 'קרן פרסמה דוח שלילי על החברה. המניה יורדת, גם אם הדוח לא נכון.', q: 'דוח שלילי מזיז מחיר גם כשהוא לא נכון.' },
    { mk: 'mood', dm: -0.06, n: 'אנליסט מוריד המלצה', d: 'אנליסט בכיר הוריד את ההמלצה על המניה.', q: 'האנליסט מסתכל על אותם מספרים — ועל ההדרכה שלך.' },
    { mk: 'mood', dm: 0.05, n: 'שמועה על רכישה', d: 'שמועה שמתחרה גדול רוצה לקנות את החברה: המניה עולה.', q: 'שמועה היא לא עסקה.' },
    { mk: 'lockup', n: 'תום תקופת החסימה', d: 'מי שקנה לפני ההנפקה יכול למכור: בשנה הראשונה אחרי ההנפקה המניה יורדת.', q: 'מי שקנה לפני ההנפקה יכול עכשיו למכור.' },
    { mk: 'rotate', to: 'bear', n: 'כסף עובר לענפים אחרים', d: 'המשקיעים עוזבים את הענף: שוק דובי, המכפיל יורד.', q: 'המכפיל של הענף זז בלי קשר לחברה שלך.' },
    { mk: 'rotate', to: 'bull', n: 'משקיעים חוזרים לענף', d: 'הכסף חוזר לענף: שוק שורי, המכפיל עולה.', q: 'מכפיל גבוה הוא זמן טוב להנפיק — לא לקנות.' },
  ],
  crises: [
    { mk: 'outage', months: 1, n: 'תקלה בחטיבה', d: 'תקלה עצרה חטיבה לחודש: רווח של חודש יוצא מהקופה.', q: 'גם חברה רשומה עובדת עם מכונות ואנשים.' },
    { n: 'תביעה ייצוגית', d: 'בעלי מניות תובעים על דיווח. פשרה עולה כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון הקפיא את משכורת המנכ"ל החודש.' },
  ],
  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'בונוס מהדירקטוריון', text: 'הדירקטוריון אישר בונוס: ₪1,500,000.', after: 'בונוס הוא לא הכנסה קבועה.' },
    { w: 6, kind: 'cash', amount: -800000, title: 'קנס מרשות ניירות ערך', text: 'הרשות קנסה על דיווח מאוחר: ₪800,000 מהכיס שלך.', after: 'דיווח בזמן הוא חלק מהאמון.' },
    { w: 3, kind: 'golden', title: 'טלפון מהמפרק' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הבטחת רווח של 100 מיליון ברבעון והרווחת 95. מה יקרה למניה?', answers: ['כלום — 95 זה הרבה', 'תרד, וגם יאמינו לך פחות בפעם הבאה', 'תעלה'], correct: 1, reward: 'lesson', lesson: 'guidance_cred', explain: 'השוק מודד אותך מול ההבטחה. פספוס עולה פעמיים: במחיר ובאמון.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'המניה שלך במחיר שיא, פי 11 מהרווח. מה עדיף לעשות?', answers: ['לקנות מניות בחזרה', 'להנפיק מניות ולקבל הרבה כסף לכל אחת', 'לא משנה'], correct: 1, reward: 'lesson', lesson: 'buyback', explain: 'בשיא מקבלים הרבה כסף על כל מניה חדשה. קנייה עצמית משתלמת כשהמניה זולה.' },
  ],
  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'מחיר המניה הוא הרווח כפול האמון, פחות החוב. כל מספר שתבטיח — ייבדק ברבעון.',
    dealAsk: ['כמה מניות שלך זה שווה?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    beat: 'עמדת בהדרכה. השוק מאמין לך יותר — והמחיר עולה.',
    miss: 'פספסת את ההדרכה. המחיר יורד, והאמון יורד איתו.',
    activist: 'קרן אקטיביסטית נכנסה: המניה שלך זולה מהמתחרים. היא כפתה דיבידנד, והאמון בהנהלה ירד.',
    ipo: 'הפעמון צלצל. מעכשיו יש לחברה מחיר בכל חודש.',
    sector: 'הבורסה: {label}. המכפיל של הענף זז — וכך גם המחיר שלך.',
    offerAsk: 'לשלם במזומן ובחוב — או במניות? כמה המניה שלך שווה היום?',
    offerBuy: 'קנית. עכשיו נראה כמה היא באמת מרוויחה.',
    offerPass: 'ויתרת. לא כל רכישה מוסיפה ערך.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם צמיחה אמיתית, הבטחות שעומדים בהן ומניות שמנפיקים ביוקר וקונים בזול.',
    won: '₪1.5 מיליארד בבורסה וחוב בשליטה. השוק מאמין לך.',
  },
};
