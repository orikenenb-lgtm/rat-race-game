// World 12 — האימפריה ("המשבר הבא לא יפיל את החברה הכי חלשה. הוא יפיל את מי שערב לה"). Goal (all, hold 3): net worth ≥ ₪2B AND no
// group default in the last 24 paydays AND liquidity coverage ≥ 1.0 (HQ cash ≥ the next 12 months' guaranteed debt service = 12 months on
// the `liquidity` goal). CATALOG-25 §1.1 / §1.2 (w12), docs/full-upgrade/worlds/w12-empire.md: the new module `holding`
// (js/worlds/mech/holding.js) — up to 8 divisions, each a light model of an earlier world's driver; guarantee vs ring-fence per division;
// HQ support or let go; storms with fixed betas; the group rating and contagion; the board's annual dividend; group bonds with a covenant;
// an insurance arm; a shared-services centre; a one-time restructuring — and the division-sale tile 'Z' (חטיבה למכירה; due diligence
// narrows the range). Every number is TUNE (gates-w12.json). Fictional names only.
//
// Lazily loaded (js/worlds/index.js ensureWorld('w12')); not ranked until the bigint migration (NW above int4). minRules 7. No content pool.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import holding from './mech/holding.js';

const board = ring(['OZOD?LMZL', 'OMZLXO?OD', 'OZOMEODZL', 'OXMZTO?MD']); // 40 tiles, paydays on the corners, 6 × 'Z' (חטיבה למכירה)
const DIV = (i) => ({ k: 'd_ret', n: 'חטיבה', d: 'חטיבה בקבוצה.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'div', start: i } });
const ASSET = (k, n, cost, down, cf, d) => ({ k, n, d, cost, down, value: cost, cf });
const D = (t, size, debt, struct, health) => ({ t, size, debt, struct, health });
const STARS = { t2: 62, t3: 52 };

export default {
  id: 'w12', order: 12, name: 'האימפריה', mechanic: 'holding', modules: ['holding'], minRules: 7, mech: [holding],
  tagline: 'קבוצה של מלונות, מפעלים, רשת, נדל"ן, אנרגיה ופיננסים. אתה כבר לא מנהל עסק — אתה מנהל את החוטים שמחברים ביניהם.',
  goalLabel: 'שווי נקי של ₪2 מיליארד, שנתיים בלי חדלות פירעון וכיסוי נזילות של שנה',
  lesson: 'בקבוצה גדולה, הסיכון הגדול הוא לא העסק הכי גרוע. הוא החוטים שמחברים אותו לכל השאר. יציבות לאורך משברים שווה יותר מעוד אחוז צמיחה.',
  story: 'ירשת קבוצה של חטיבות: מלונות, מפעלים, רשת חנויות, נדל"ן, אנרגיה ופיננסים. לכל חטיבה חוב משלה. על חלק מהחובות המטה ערב — ריבית זולה, אבל אם החטיבה נופלת, החוב שלה נופל עליך. חטיבה מגודרת משלמת יותר, ואם היא קורסת הבנקים לוקחים רק אותה. המטרה: שווי נקי של ₪2 מיליארד, שנתיים בלי חדלות פירעון, ומזומן במטה לשנה של החזרים.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w12 (render lane)
    sky: ['#f5f5f4', '#a8a29e'], fog: '#e7e5e4', board: '#f3f0ea', boardEdge: '#78350f', center: '#166534', accent: '#166534',
    light: { hemiSky: '#fafaf9', hemiGround: '#78350f', sun: '#fef3c7' }, decor: 'tower',
  },
  board,
  tiles: tilesFor(board, { Z: { type: 'division', name: 'חטיבה למכירה', color: '#166534', ink: '#ffffff', icon: 'crown' }, O: { name: 'עסקה בקבוצה' }, M: { name: 'חדשות השווקים' }, X: { name: 'משבר בקבוצה' } }),
  loan: { unit: 5000000, autoUnit: 5000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'nw', target: 2000000000 }, { type: 'noDefault', months: 24, key: 'default', label: 'חודשים בלי חדלות פירעון בקבוצה' }, { type: 'liquidity', months: 12, label: 'כיסוי נזילות: חודשים של החזרי חוב בערבות שיש במטה' }] },
  maxMonths: 72,
  stars: STARS,
  start: {},
  doodadWealth: 0.0008,
  tipDoodad: 8000000,
  bounds: { nwMax: 50000000000, passiveMax: 1000000000 },
  econ: { loanUnit: 5000000, autoUnit: 5000000, ddMinFee: 1000000, sideReportFee: 400, tipDoodad: 8000000, doodadWealth: 0.0008, band: { deal: [50000000, 600000000], monthly: [-10000000, 30000000] } },
  lessonDefs: [
    { id: 'contagion', cat: 'world', title: 'הדבקה דרך ערבויות', text: 'ערבות של המטה מוזילה את החוב של חטיבה — עד היום שבו היא נופלת. אז החוב שלה עובר למטה, הדירוג יורד, וכל חוב אחר בערבות מתייקר. חטיבה חלשה אחת יכולה למשוך את כולן.' },
    { id: 'ring_fence', cat: 'world', title: 'לגדר חטיבה', text: 'חטיבה מגודרת משלמת ריבית גבוהה יותר, כי הבנקים יודעים שאם היא תיפול הם יקבלו רק אותה. זה המחיר של חומת אש: כסף כל חודש, כדי שמשבר אחד לא יהפוך למשבר של כולם.' },
    { id: 'stable_group', cat: 'world', title: 'יציבות שווה יותר מצמיחה', text: 'כשסערה פוגעת בכמה חטיבות יחד, מה שמציל את הקבוצה הוא מזומן במטה וחוטים מעטים — לא עוד אחוז צמיחה. פיזור בין עסקים עוזר רק אם הם לא נופלים מאותה סיבה.' },
  ],
  systems: {
    cycle: { amp: 1.2 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 1000000,
      pool: [['books', 'הדוחות של החטיבה "לפי ההנהלה"'], ['guar', 'החטיבה ערבה לחוב של חברה אחרת'], ['client', 'לקוח אחד הוא 40% מהמכירות'], ['lease', 'חוזה השכירות של המטה נגמר בשנה הבאה'], ['union', 'הסכם העבודה פותח בקרוב'], ['court', 'יש תביעה פתוחה נגד החטיבה']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { d_tour: 'hotel_beach', d_ind: 'factory_metal', d_ret: 'store_mall', d_re: 'tower_done', d_en: 'solar_field', d_fin: 'glass_tower', d_glo: 'regional_office', d_trophy: 'hotel', office: 'tower', building: 'tower', side: 'warehouse', biz: 'warehouse', stake: 'regional_office' },
  kinds: {
    d_tour: { label: 'חטיבת מלונות', debtLabel: 'חוב החטיבה' }, d_ind: { label: 'חטיבת תעשייה', debtLabel: 'חוב החטיבה' }, d_ret: { label: 'חטיבת קמעונאות', debtLabel: 'חוב החטיבה' }, d_re: { label: 'חטיבת נדל"ן', debtLabel: 'חוב החטיבה' },
    d_en: { label: 'חטיבת אנרגיה', debtLabel: 'חוב החטיבה' }, d_fin: { label: 'חטיבת פיננסים', debtLabel: 'חוב החטיבה' }, d_glo: { label: 'חטיבת סחר', debtLabel: 'חוב החטיבה' }, d_trophy: { label: 'חטיבת יוקרה', debtLabel: 'חוב החטיבה' },
    office: { label: 'בניין', debtLabel: 'משכנתא' }, building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'chair', gender: 'm', age: 56, family: { partner: 'married', kids: 3 }, name: 'יו"ר הקבוצה, דור שני', icon: 'crown', maxMonths: 72, stars: STARS,
      desc: 'אהרון קיבל מאביו שש חטיבות, וחצי מהחובות שלהן בערבות המטה. הדירוג טוב והכסף זול — אבל מפעל היציקה, הכי חלש בקבוצה, בערבות מלאה.',
      pros: ['דירוג A: הריבית הכי זולה', 'שש חטיבות מהיום הראשון'], cons: ['מבנה ישן: מפעל חלש (בריאות 40) בערבות המטה'],
      salary: 150000, cash: 60000000,
      expenses: [['וילה', 40000], ['רכבים', 12000], ['אוכל ושוטף', 20000], ['ילדים', 15000], ['ביטוחים ושוטף', 10000]],
      start: { rating: 1, divs: [D(0, 1.1, 0.55, 'g', 75), D(2, 1.0, 0.6, 'g', 40), D(4, 1.1, 0.55, 'g', 80), D(6, 1.2, 0.55, 'r', 85), D(8, 1.0, 0.55, 'r', 85), D(10, 0.65, 0.5, 'r', 70)] }, assets: [0, 1, 2, 3, 4, 5].map(DIV) },
    { id: 'activist', gender: 'f', age: 47, family: { partner: 'single', kids: 1 }, name: 'משקיעה אקטיביסטית', icon: 'chart', maxMonths: 72, stars: STARS,
      desc: 'נורית קנתה ארבע חטיבות בזול, כל אחת מגודרת. יש לה הרבה מזומן במטה — ודירקטוריון שדורש דיבידנד של 6% כל שנה.',
      pros: ['קונה ומוכרת חטיבות ב־8% הנחה', '₪120 מיליון במזומן במטה', 'כל החטיבות מגודרות'], cons: ['הדירקטוריון דורש דיבידנד של 6% בשנה', 'דירוג BBB'],
      salary: 120000, cash: 120000000,
      expenses: [['דירה', 25000], ['רכב', 8000], ['אוכל ושוטף', 14000], ['ילד', 8000], ['ביטוחים ושוטף', 8000]],
      start: { rating: 2, divMin: 0.06, deal: 0.92, divs: [D(5, 1.35, 0.5, 'r', 80), D(12, 1.2, 0.5, 'r', 75), D(7, 1.4, 0.5, 'r', 85), D(1, 1.1, 0.5, 'r', 75)] }, assets: [0, 1, 2, 3].map(DIV) },
    { id: 'thirdGen', gender: 'f', age: 31, family: { partner: 'partner', kids: 0 }, name: 'דור שלישי, צעירה', icon: 'sprout', maxMonths: 72, stars: STARS,
      desc: 'מאיה נכנסה לנהל חמש חטיבות עם צוות חדש. ההשקעות שלה עובדות טוב יותר — אבל במטה יש רק ₪25 מיליון, וכמעט כל החוב בערבות.',
      pros: ['השקעות בצמיחה נותנות 10% יותר (צוות חדש)'], cons: ['רק ₪25 מיליון במטה: כיסוי נזילות נמוך מההתחלה', 'ארבע חטיבות בערבות'],
      salary: 100000, cash: 25000000,
      expenses: [['דירה', 18000], ['רכב', 6000], ['אוכל ושוטף', 10000], ['ביטוחים ושוטף', 6000]],
      start: { rating: 2, growF: 1.1, divs: [D(9, 1.2, 0.58, 'g', 85), D(3, 1.15, 0.6, 'g', 65), D(13, 1.1, 0.58, 'g', 75), D(11, 1.0, 0.55, 'r', 75), D(1, 1.1, 0.6, 'g', 70)] }, assets: [0, 1, 2, 3, 4].map(DIV) },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  deals: [
    ASSET('office', 'בניין המטה', 80000000, 24000000, 450000, 'קומות משרדים לקבוצה, השאר מושכר.'),
    ASSET('building', 'מרכז לוגיסטי משותף', 60000000, 18000000, 330000, 'מרכז הפצה שכמה חטיבות משתמשות בו.'),
    ASSET('office', 'מגדל משרדים בעיר', 120000000, 36000000, 650000, 'מגדל חדש, חצי מושכר.'),
    ASSET('building', 'פארק תעשייה קטן', 90000000, 27000000, 500000, 'מבנים מושכרים לשוכרים מחוץ לקבוצה.'),
  ],
  goldenChance: 1 / 30,
  golden: [ASSET('office', 'בניין מטה במחיר הזדמנות', 60000000, 18000000, 650000, 'קבוצה בקשיים מוכרת את בניין המטה שלה בהנחה.')],

  doodads: [
    { n: 'מטוס פרטי לקבוצה', aMult: 1.4, inst: true, q: 'מטוס — או חודשיים של החזרי חוב בצד?' },
    { n: 'כנס מנהלים בחו"ל', aMult: 0.4, q: 'כנס יפה. מה הוא שינה בחוטים בין החטיבות?' },
    { n: 'קנס רגולטורי', aMult: 0.25, need: true, d: 'דוח שהוגש באיחור באחת החטיבות.', q: 'הוצאות שלא תכננת — בשבילן שומרים מזומן במטה.' },
    { n: 'יועצי מבנה הון', aMult: 0.3, need: true, inst: true, d: 'עורכי דין ורואי חשבון למבנה של הקבוצה.', q: 'מבנה מסובך עולה כסף כל שנה.' },
    { n: 'יאכטה', aMult: 0.6, inst: true, q: 'יאכטה. כמה חודשי כיסוי נזילות היא עולה?' },
    { n: 'תרומה לבניין עירייה', aMult: 0.2, q: 'שם על בניין. הדירוג לא עולה בגללו.' },
  ],

  market: [
    { mk: 'recession', n: 'מיתון רב־מדינתי', d: 'כמה מדינות נכנסות למיתון ביחד: ארבעה חודשים של פחות תיירים, פחות קונים ושווקים יורדים.', q: 'כמה מהחטיבות שלך נופלות מאותה סיבה?' },
    { mk: 'energy', n: 'משבר אנרגיה', d: 'מחיר החשמל קופץ: חטיבת האנרגיה מרוויחה, המפעלים משלמים.', q: 'גידור טבעי: חטיבה אחת מרוויחה ממה שפוגע באחרת.' },
    { mk: 'review', n: 'סוכנות הדירוג בודקת', d: 'סוכנות הדירוג בוחנת את הקבוצה: כיסוי נזילות מתחת ל־1 — הורדה; מעל 1.5 ושנה בלי חדלות פירעון — העלאה.', q: 'הדירוג קובע את הריבית על כל חוב בערבות.' },
    { mk: 'antitrust', n: 'בדיקת הגבלים עסקיים', d: 'הממונה על התחרות דורש למכור את החטיבה הגדולה ביותר (רק בקבוצה של 6 חטיבות ומעלה), ב־85% מהשווי.', q: 'גדול מדי זה גם סיכון.' },
    { mk: 'boom', n: 'שוק עולה', d: 'השווקים עולים והקונים חוזרים.' },
  ],

  crises: [
    { mk: 'succession', n: 'מאבק ירושה', d: 'בני משפחה מתווכחים על השליטה. הדירקטוריון דורש דיבידנד גבוה יותר בשנה הבאה.', q: 'גם לחוטים בתוך המשפחה יש מחיר.' },
    { mk: 'cyber', n: 'מתקפת סייבר על המטה', d: 'פורצים חדרו למערכות של המטה. מרכז שירותים משותף = יותר מה לתקן.', q: 'מערכת משותפת חוסכת כסף — ומרכזת סיכון.' },
    { n: 'תביעה ייצוגית', d: 'לקוחות תובעים את אחת החטיבות. עורכי דין עולים כסף.', cash: -6000000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הדירקטוריון דחה את המשכורת שלך החודש.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 5000000, title: 'החזר מס על הקבוצה', text: 'רשות המסים אישרה קיזוז הפסדים בין החטיבות: ₪5,000,000.', after: 'מבנה הקבוצה משפיע גם על המס.' },
    { w: 6, kind: 'cash', amount: -3000000, title: 'קנס על דיווח מאוחר', text: 'דוח של חטיבה אחת הוגש באיחור: ₪3,000,000.', after: 'כל חטיבה — עוד מועדים לזכור.' },
    { w: 3, kind: 'golden', title: 'טלפון מקבוצה בקשיים' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'חטיבה חלשה בערבות המטה נכנסת לגירעון. מה הסיכון הגדול?', answers: ['שהיא תפסיד כסף', 'שהחוב שלה יעבור למטה ויייקר את החוב של כולן', 'שהמנהל יתפטר'], correct: 1, reward: 'lesson', lesson: 'contagion', explain: 'ערבות מחברת את החטיבה לכל השאר. כשהיא נופלת, הדירוג יורד והריבית עולה לכולן.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מה קונה הריבית הגבוהה של חטיבה מגודרת?', answers: ['כלום — זה בזבוז', 'שאם היא תקרוס, הבנקים ייקחו רק אותה', 'דירוג טוב יותר לחטיבה'], correct: 1, reward: 'lesson', lesson: 'ring_fence', explain: 'גידור הוא חומת אש. משלמים עליו כל חודש, כדי שמשבר אחד לא יפיל את הקבוצה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'יש לך מלונות, פיננסים ורשת חנויות. מיתון מגיע. כמה אתה מפוזר?', answers: ['מאוד — שלושה עסקים', 'פחות ממה שנראה — שלושתם נופלים במיתון', 'תלוי בדירוג'], correct: 1, reward: 'lesson', lesson: 'stable_group', explain: 'פיזור עובד רק כשהעסקים לא נופלים מאותה סיבה. מזומן במטה הוא מה שמחזיק בסערה.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כאן אתה לא מנהל עסק — אתה מנהל את הקשרים בין עסקים. בדוק מי בערבות המטה, ומה קורה לכולם אם הוא נופל.',
    dealAsk: ['מי ערב לחוב הזה?', 'כמה זה מוסיף להחזרים של המטה?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    acqAsk: 'טווח רחב: המוכר יודע כמה החטיבה באמת מרוויחה, אתה לא. ושאלה שנייה: אם היא תיפול — מי משלם את החוב שלה?',
    acqDd: 'הבדיקה צמצמה את הטווח. עכשיו שתי שאלות: המחיר מתחת לשווי — והאם המטה ערב לחוב שלה?',
    storm: '{name}: {n} חטיבות שלך חשופות. עכשיו נראה כמה מזומן יש במטה.',
    default: '{name} לא עמדה בחוב, והמטה ערב לה: {amount} עברו למטה. הדירוג ירד ל־{rating} — וכל חוב בערבות מתייקר.',
    lost: '{name} קרסה. היא הייתה מגודרת: הבנקים לקחו את החטיבה ואת החוב שלה — ולא נגעו בשאר הקבוצה.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם מזומן במטה, ערבויות רק לחטיבות חזקות ודיבידנד במינימום.',
    won: '₪2 מיליארד, ושנתיים בלי חדלות פירעון. קבוצה שעומדת בסערות.',
  },
};
