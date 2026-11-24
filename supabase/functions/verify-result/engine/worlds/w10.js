// World 10 — מרכז הפיננסים ("משרד משפחתי בקומה ה־40"). Goal: net worth ≥ ₪400M, hold 3 (★★★ also needs 0 forced liquidations).
// Modules (CATALOG-25 §1.1 / §3): `market` (js/worlds/mech/market.js — fictional companies in 8 sectors, regimes, company events,
// bankruptcy → claims, relisting with new ids, monthly candles, news; stream `exch`) + `portfolio` (js/worlds/mech/portfolio.js — the
// liquidity classes daily / monthly / locked, margin with calls and forced sales, funds from the content pool `deal`, private deals on the
// new 'Y' tile with capital calls, the put overlay; stream `world`). Content pools (js/systems/content.js, stream `content`): the deal tile's
// funds (js/content/deals-w10.js), the news lines (js/content/news.js) and the rumours (js/content/rumor.js).
// Spec: docs/full-upgrade/worlds/w10-finance.md + CATALOG-25. Every number is TUNE (tools/sim.mjs --world-gates N w10, gates-w10.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w10')); NOT in WORLDS; not ranked until the DB migration (meta.ranked). minRules 7: the
// lazy streams `exch` / `content` exist only in this world's state (streams below), so every other world stays byte-identical.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import market from './mech/market.js';
import portfolio from './mech/portfolio.js';
import { DEALS_W10 } from '../content/deals-w10.js';
import { NEWS } from '../content/news.js';
import { RUMORS } from '../content/rumor.js';

const board = ring(['OWOD?YMWL', 'OMWLXOYOD', 'OWOMEODYL', 'OXMWTO?MD']); // 40 tiles, paydays on the corners, 5 × 'W' (הבורסה), 3 × 'Y' (השקעה פרטית)

/** A fund the character already holds (a module asset card; the same shape the content pool builds). */
const FUND = (n, kind, cost, yld, o = {}) => ({ k: 'fund', n, d: o.d || '', cost, down: cost, value: cost, cf: Math.round(cost * yld / 12 / 10) * 10,
  op: { ck: 'fund', kind, dur: o.dur || 0, beq: o.beq || 0, bcr: o.bcr || 0, bpr: o.bpr || 0, yld } });
/** A starting PE commitment (its sealed multiple and schedule come from the module's 2 init draws). */
const PECOMMIT = (n, commit) => ({ k: 'pe', n, d: 'התחייבות לקרן פרייבט אקוויטי מלפני שנה. הקרן עוד תקרא לכסף.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'private', start: true, deal: 0, commit } });

export default {
  id: 'w10', order: 10, name: 'מרכז הפיננסים', mechanic: 'portfolio', modules: ['market', 'portfolio'], minRules: 7, mech: [market, portfolio], streams: ['exch', 'content'],
  tagline: 'משרד משפחתי בקומה ה־40. מאות מיליונים בעשרות נכסים, ושאלה אחת שמכריעה: כמה מזה אפשר למכור מחר בבוקר בלי להפסיד.',
  goalLabel: 'שווי נקי של ₪400 מיליון — שמחזיק 3 משכורות',
  lesson: 'פיזור אמיתי הוא בין דברים שלא נופלים ביחד. הכמות לא קובעת. ומינוף על נכס שאי אפשר למכור מהר הוא הדרך הקצרה למכור בתחתית.',
  story: 'הגעת לקומה ה־40: משרד משפחתי שמנהל מאות מיליונים. יש בורסה עם חברות שעולות, נופלות ולפעמים נעלמות; קרנות שאפשר לפדות רק בסוף החודש; והשקעות פרטיות שנעולות לשנים. אפשר ללוות כנגד התיק — עד שהשוק נופל והברוקר מתקשר. המטרה: שווי נקי של ₪400 מיליון שמחזיק שלוש משכורות.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w10 (render lane)
    sky: ['#0f172a', '#3b82f6'], fog: '#1e293b', board: '#1e293b', boardEdge: '#0f172a', center: '#334155', accent: '#d4af37',
    light: { hemiSky: '#93c5fd', hemiGround: '#1e293b', sun: '#e0f2fe' }, decor: 'towers',
  },
  board,
  tiles: tilesFor(board, { W: { name: 'הבורסה' }, Y: { name: 'השקעה פרטית' }, M: { name: 'חדשות השוק' }, X: { name: 'משבר' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.2, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'nw', target: 400000000, hold: 3 },
  maxMonths: 84,
  stars: { t2: 72, t3: 60 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 5000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 250000, sideReportFee: 400, tipDoodad: 5000000, doodadWealth: 0.0015, band: { deal: [5000000, 100000000], monthly: [-3000000, 8000000] } },
  marketCfg: { muAdd: 0.0085, slots: 12, sectors: { tech: 2, fin: 2, energy: 1, consumer: 2, health: 1, property: 2, industry: 1, transport: 1 } },
  content: { pools: { O: 'deal' }, data: { deal: DEALS_W10, news: NEWS, rumor: RUMORS } },
  systems: {
    cycle: { amp: 1.0 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 250000,
      pool: [['manager', 'המנהל החליף שלושה אנליסטים בשנה'], ['marks', 'השווי בדוח "לפי מודל"'], ['fees', 'דמי ניהול ודמי הצלחה כפולים'], ['lockup', 'פדיון רק פעם ברבעון'], ['audit', 'רואה חשבון קטן ולא מוכר'], ['lev', 'הקרן עצמה ממונפת']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { fund: 'stone_block', pe: 'vault', stake: 'vault', daily: 'glass_tower', building: 'glass_tower', stock: 'glass_tower', side: 'glass_tower', biz: 'glass_tower' },
  kinds: {
    fund: { label: 'קרן (נזילות חודשית)', debtLabel: 'הלוואה' }, pe: { label: 'קרן פרטית (נעול)', debtLabel: 'הלוואה' }, stake: { label: 'אחזקה פרטית (נעול)', debtLabel: 'הלוואה' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake2: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'allocator', gender: 'f', age: 46, family: { partner: 'married', kids: 2 }, name: 'מנהלת השקעות', icon: 'chart', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'הדס מנהלת ₪110 מיליון של משפחה אחת: מדד, מניות, אג"ח והתחייבות לקרן פרטית. היא יודעת לבדוק חברות — אבל הנאמן לא מרשה לה יותר מ־30% בענף אחד.',
      pros: ['מחקר על חברות בחינם', 'תיק מפוזר מהיום הראשון'], cons: ['מנדט: עד 30% מהשווי בענף אחד', 'התחייבות לקרן פרטית שעוד תקרא לכסף'],
      salary: 60000, cash: 60000000,
      expenses: [['משכנתא', 16000], ['רכב', 5000], ['אוכל ושוטף', 14000], ['ילדים', 9000], ['ביטוחים ושוטף', 8000]],
      start: { idx: 22000000, stocks: [0, 2, 4, 6].map((slot) => ({ slot, value: 4000000 })), mandate: 0.3, freeResearch: true },
      assets: [FUND('אג"ח ממשלתי של המשפחה', 'gov', 10000000, 0.038, { dur: 5, d: 'אג"ח ממשלתי בינוני שהמשפחה מחזיקה שנים.' }), PECOMMIT('קרן הפרייבט של המשפחה', 12000000)] },
    { id: 'blockHeir', gender: 'm', age: 34, family: { partner: 'single', kids: 0 }, name: 'יורש עם החזקה מרוכזת', icon: 'factory', maxMonths: 78, stars: { t2: 66, t3: 56 },
      desc: 'אורן ירש ₪150 מיליון — 70% מהם במניה אחת, של החברה שסבא שלו הקים. מכירה גדולה מורידה את המחיר, ומס רווח הון על מניות שנקנו בזול לפני עשרות שנים.',
      pros: ['ההון הגדול ביותר'], cons: ['70% בחברה אחת', 'מכירת הבלוק מורידה את מחיר המניה (1% לכל 5% שנמכרים)', 'מס רווח הון גבוה: המניות נקנו בזול'],
      salary: 20000, cash: 45000000,
      expenses: [['דירה', 22000], ['רכב', 7000], ['אוכל ושוטף', 15000], ['בילויים', 12000], ['ביטוחים ושוטף', 9000]],
      start: { block: { share: 0.7, of: 150000000, basis: 0.3 } } },
    { id: 'floorTrader', gender: 'f', age: 38, family: { partner: 'married', kids: 1 }, name: 'סוחרת', icon: 'bolt', maxMonths: 90, stars: { t2: 76, t3: 64 },
      desc: 'מאיה עבדה שנים בחדר מסחר. ₪100 מיליון במזומן, עמלות נמוכות ומרווח גבוה יותר מהברוקר. אבל הריבית על ההלוואה גבוהה — ומכה בשוק כואבת לה יותר.',
      pros: ['אפשר ללוות 10% יותר כנגד מניות', 'עמלות חצי מחיר ומרווח קנייה־מכירה קטן'], cons: ['ריבית גבוהה ב־1% על הלוואה כנגד התיק', 'מתחילה בלי אף השקעה'],
      salary: 45000, cash: 100000000,
      expenses: [['משכנתא', 12000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 5000], ['ביטוחים ושוטף', 6000]],
      start: { feeMult: { spread: 0.7, comm: 0.5 } } },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  // the legacy deal deck: the content pool's fallback only (the deal tile reads content.pools.O first)
  deals: [
    FUND('קרן אג"ח ממשלתי קצר', 'gov', 15000000, 0.036, { dur: 1.5, d: 'אג"ח של המדינה לשנה־שנתיים.' }),
    FUND('קרן אג"ח קונצרני', 'corp', 20000000, 0.05, { dur: 4, bcr: 1, beq: 0.1, d: 'אג"ח של חברות גדולות.' }),
    FUND('קרן ריט', 'reit', 18000000, 0.045, { bpr: 1, beq: 0.4, d: 'נדל"ן מניב.' }),
  ],
  goldenChance: 1 / 30,
  golden: [
    FUND('קרן אשראי בהנחה מקרן בפירוק', 'credit', 25000000, 0.085, { dur: 1, bcr: 1.2, d: 'קרן גדולה בפירוק מוכרת תיק הלוואות טובות ב־15% הנחה.' }),
  ],

  doodads: [
    { n: 'יאכטה', aMult: 1.6, inst: true, q: 'יאכטה, או עוד מיליונים שעובדים בבורסה?' },
    { n: 'אוסף אמנות', aMult: 0.9, q: 'אמנות היא לא תיק השקעות. או שכן?' },
    { n: 'משרד בקומה ה־41', aMult: 1.1, inst: true, q: 'משרד יפה לא מוריד את ה־LTV.' },
    { n: 'חופשה באלפים', aMult: 0.3, q: 'מגיע לך. השוק פתוח גם בלעדיך.' },
    { n: 'גאלה של קרן צדקה', aMult: 0.25, need: true, d: 'הבנק הפרטי מצפה לך שם.', q: 'יש הוצאות שבאות עם התפקיד.' },
    { n: 'ביטוח דירקטורים', aMult: 0.3, need: true, inst: true, d: 'חובה למי שיושב בדירקטוריונים.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'רכב יוקרה חדש', aMult: 0.5, inst: true, q: 'רכב יפה. כמה חודשי ריבית על ההלוואה כנגד התיק הוא עולה?' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'שעון שמראה את השעה — לא את המדד.' },
  ],

  market: [
    { mk: 'rate', dr: 1, idx: -0.03, sectors: { property: -0.04, fin: 0.01 }, n: 'בנק ישראל מעלה את הריבית', d: 'הריבית עולה באחוז: אג"ח ארוך יורד, נדל"ן נחלש — והבנקים מרוויחים יותר.', q: 'מה זז כשהריבית עולה? תסתכל על ה"משך" של כל קרן.' },
    { mk: 'rate', dr: -1, idx: 0.03, sectors: { property: 0.04, tech: 0.02 }, n: 'הורדת ריבית', d: 'הריבית יורדת באחוז: אג"ח ארוך עולה, וגם הבורסה.', q: 'כשהריבית יורדת — מה עולה הכי הרבה?' },
    { mk: 'shock', idx: -0.05, dr: 0.75, ds: 0.6, sectors: { tech: -0.03, consumer: -0.02 }, n: 'הפתעת אינפלציה', d: 'המחירים עלו יותר מהצפוי: הריבית קופצת, המניות יורדות, ומרווחי האשראי מתרחבים — הכל ביחד.', q: 'שתים־עשרה השקעות שנופלות ביחד הן בעצם השקעה אחת.' },
    { mk: 'spread', ds: 1.5, idx: -0.04, sectors: { fin: -0.06 }, n: 'מרווחי האשראי מתפוצצים', d: 'משקיעים בורחים מאג"ח של חברות. אג"ח קונצרני וקרנות אשראי יורדות, וגם מניות הבנקים.', q: 'כמה מהתיק שלך הוא בעצם הימור על אשראי?' },
    { mk: 'prop', pr: -0.08, n: 'מחירי הנדל"ן צונחים', d: 'מחירי הנדל"ן יורדים ב־8%: קרנות ריט, נדל"ן לא סחיר ומניות נדל"ן.', q: 'קרן שהשווי שלה לא זז כשכל השוק נופל — יציבה, או שעוד לא עדכנה?' },
    { mk: 'flash', idx: -0.12, rec: 1, n: 'קריסה בזק', d: 'המדד צולל 12% בתוך שעות. הירידה תחזור עד המשכורת הבאה — למי שלא נאלץ למכור.', q: 'מי מוכר בתחתית של קריסה בזק? מי שחייב.' },
    { mk: 'freeze', months: 2, n: 'הקפאת נזילות', d: 'השווקים קפואים: קרנות עם נזילות חודשית לא פודות לחודשיים, והברוקר לא נותן לגיבוי שלהן ערך.', q: 'נזילות חודשית היא נזילות — עד שלא.' },
    { mk: 'gate', months: 3, n: 'קרן אשראי נועלת פדיונות', d: 'קרנות האשראי הפרטי נועלות פדיונות לשלושה חודשים.', q: 'אם כולם רוצים לצאת באותו יום — מי יוצא ראשון?' },
    { mk: 'shock', idx: 0.05, sectors: { tech: 0.04 }, n: 'הבורסה בשיא', d: 'נתוני צמיחה חזקים: המדד עולה 5%.' },
    { mk: 'shock', idx: 0.04, sectors: { fin: 0.02, consumer: 0.02 }, n: 'עונת דוחות חזקה', d: 'רוב החברות הרוויחו יותר מהצפוי: המדד עולה 4%.' },
    { mk: 'shock', idx: 0.03, n: 'כסף זר נכנס', d: 'קרנות מחו"ל קונות מניות מקומיות: המדד עולה 3%.', q: 'מחיר שעולה בגלל כסף שנכנס — יכול לרדת כשהוא יוצא.' },
    { mk: 'shock', idx: -0.04, sectors: { energy: 0.06, transport: -0.05 }, n: 'מחיר הנפט קופץ', d: 'חברות אנרגיה מרוויחות, חברות תחבורה נפגעות.', q: 'אותו אירוע: רווח לאחד, הפסד לשני. מה זה אומר על פיזור?' },
  ],

  crises: [
    { mk: 'flash', idx: -0.08, rec: 1, n: 'מבצע צבאי', d: 'אי־ודאות ביטחונית: הבורסה יורדת 8%. הירידה תחזור עד המשכורת הבאה.', q: 'משבר הוא לא הזמן למכור — אם אין חייבים.' },
    { n: 'תביעה נגד המשרד', d: 'לקוח לשעבר תובע. עורכי דין עולים כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי בונוס', d: 'השותפים במשרד לא מחלקים בונוס החודש.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 2000000, title: 'החזר מס', text: 'רשות המסים החזירה ₪2,000,000 על הפסדים מלפני שנתיים.', after: 'הפסד שקוזז ממס הוא לא הפסד מלא.' },
    { w: 6, kind: 'cash', amount: -1200000, title: 'דמי ניהול שלא שמת לב אליהם', text: 'מנהל קרן גבה דמי הצלחה על רבעון טוב. ₪1,200,000.', after: 'עמלות קטנות מצטברות לסכומים גדולים.' },
    { w: 3, kind: 'golden', title: 'טלפון מקרן בפירוק' },
    { w: 3, kind: 'raise', amount: 15000, title: 'דירקטוריון', text: 'מינו אותך לדירקטורית בחברה ציבורית. המשכורת עולה ב־₪15,000 בחודש.', after: 'עוד מזומן כל חודש = פחות צורך ללוות.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'יש לך 12 מניות שונות — כולן של בנקים. כמה פיזור יש לך?', answers: ['הרבה — 12 מניות', 'מעט: כולן נופלות מאותה סיבה', 'אין צורך בפיזור'], correct: 1, reward: 'lesson', lesson: 'correlation', explain: 'פיזור אמיתי הוא בין דברים שלא נופלים ביחד. 12 בנקים הם הימור אחד על הבנקים.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'לווית 60% כנגד מניות, והשוק ירד 30%. מה קורה?', answers: ['כלום, אני מחכה', 'ההלוואה עברה את הבטוחות — הברוקר יבקש כסף או ימכור', 'הבנק מוחק את ההלוואה'], correct: 1, reward: 'lesson', lesson: 'margin_call', explain: 'כשהשווי יורד, הבטוחות קטנות וההלוואה נשארת. מעל הגבול — קריאת מרווח, ואם אין כסף — מכירה כפויה בתחתית.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'התחייבת ל־₪20 מיליון לקרן פרטית. כמה מזומן צריך היום?', answers: ['אפס — עוד לא שילמתי', 'אפס היום, אבל ₪20 מיליון יידרשו בשנה־שנתיים, כנראה דווקא כשהשוק חלש', '₪20 מיליון היום'], correct: 1, reward: 'lesson', lesson: 'capital_call', explain: 'התחייבות היא חוב עתידי. הקרן קוראת לכסף מתי שהיא צריכה — לפעמים בדיוק במשבר.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מניה עלתה 40% בחודש. מה הנר החודשי אומר לך על החודש הבא?', answers: ['שהיא תמשיך לעלות', 'כלום: הוא מראה מה היה, לא מה יהיה', 'שהיא תרד'], correct: 1, reward: 'lesson', lesson: 'mkt_candle', explain: 'נר מראה פתיחה, שיא, שפל וסגירה של חודש שכבר עבר. מחיר זה לא ערך.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'שמעת שמועה ש"חברה X תירכש". מה עושים?', answers: ['קונים מהר', 'בודקים את החברה — שמועה היא לא מידע', 'מוכרים הכל'], correct: 1, reward: 'lesson', lesson: 'mkt_rumor', explain: 'שמועה היא רעש. מחקר על החברה עולה כסף — אבל הוא מידע.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כאן הכסף עובד בבורסה, בקרנות ובהשקעות פרטיות. השאלה היא לא רק כמה הוא מרוויח — אלא כמה ממנו אפשר למכור מחר.',
    dealAsk: ['כמה מזה אפשר למכור מחר בבוקר?', 'מה מזיז את השווי של הקרן הזאת: ריבית, אשראי או נדל"ן?'],
    buyGood: 'הכנסה בחודש רגיל: {cf}. ותזכור: נזילות חודשית היא לא נזילות יומית.',
    tradeFloor: ['מחיר זה לא ערך. נר חודשי מראה מה קרה — לא מה יקרה.', 'עמלה ומרווח משלמים בכל קנייה ובכל מכירה. מי שסוחר הרבה — משלם הרבה.'],
    researched: '{co}: איכות {band}. זה מידע — לא הבטחה.',
    privAsk: ['כמה מזה תצטרך למכור מחר בבוקר? כסף נעול לא מכסה קריאת מרווח.', 'התחייבות לקרן היא כסף שעוד יוצא — לפעמים בדיוק כשהשוק נופל.'],
    privCommit: 'התחייבת. הכסף עוד אצלך — אבל הוא כבר לא באמת שלך: הקרן תקרא לו.',
    privPass: 'ויתרת. נזילות היא גם נכס.',
    privDD: 'הבדיקה: מכפיל צפוי {lo}×–{hi}×.',
    callDue: 'קריאת מרווח: עד המשכורת הבאה צריך להחזיר כסף או למכור.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם פיזור בין דברים שלא נופלים ביחד, ומינוף שאפשר לשרוד איתו.',
    won: '₪400 מיליון. פיזור אמיתי, מינוף זהיר ונזילות כשצריך אותה.',
  },
};
