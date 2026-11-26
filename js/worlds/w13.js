// World 13 — אצטדיון הכוכבים ("מועדון בדרג השני, אצטדיון חצי ריק"). Goal (all, hold 2): net worth ≥ ₪450M with the squad at BOOK value
// AND the 12-month wage bill ≤ 70 % of revenue. CATALOG-25 §1.4 w13 / §2.2: the rule adapter `league` (js/worlds/adapters/league.js: a
// fictional 3-tier league of 8 clubs, a 10-round season with 2 transfer windows, the final-rank cliff ×1.6 / ×1.0 / ×0.6, locked wages,
// book vs market value, injuries, the stadium) + the new module `auction` (js/worlds/mech/auction.js: players bought against 1–3 rival
// clubs with sealed ceilings — the winner's curse) on the new 'H' tile (שוק ההעברות) + the content pool `deal` on 'O' (sponsors and club
// facilities, js/content/deals-w13.js). Spec + as built: docs/full-upgrade/worlds/w13-stadium.md. Every number is TUNE (gates-w13.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w13')); not ranked until the DB migration. minRules 7 (the lazy `content` stream).
// Fictional clubs, players and brands only (tools/data/real-names.txt includes real football clubs; tools/validate-worlds.mjs L-fict).
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import league, { lotOf, awardLot, lotBudget, clubNames } from './adapters/league.js';
import auction from './mech/auction.js';
import { DEALS_W13 } from '../content/deals-w13.js';

const board = ring(['OHOD?HMHL', 'OMHLXOHOD', 'OHOMEODHL', 'OXMHTO?MD']); // 40 tiles, paydays on the corners, 7 × 'H' (שוק ההעברות)

/** The starting squad: [age, rating, book ₪ now, months left on the contract, academy?]. Potential and injury-proneness are sealed (init draws). */
const BASE = [[29, 62, 4e6, 18], [27, 60, 5e6, 24], [25, 59, 6e6, 30], [31, 61, 1e6, 12], [24, 58, 4e6, 24], [22, 55, 3e6, 30], [28, 57, 2e6, 12], [26, 56, 3e6, 24], [30, 58, 1e6, 12],
  [23, 54, 2e6, 30], [33, 57, 0, 6], [20, 50, 0, 24, 1], [19, 48, 0, 30, 1], [27, 53, 1e6, 18], [25, 52, 1e6, 24], [21, 51, 0, 24, 1], [29, 54, 0, 12], [18, 46, 0, 36, 1]];
const YOUTH = [[28, 60, 3e6, 18], [26, 58, 3e6, 24], [24, 57, 2e6, 30], [30, 59, 1e6, 12], [21, 55, 0, 30, 1], [20, 54, 0, 30, 1], [22, 56, 1e6, 24], [19, 52, 0, 36, 1], [27, 56, 1e6, 12],
  [21, 53, 0, 24, 1], [18, 50, 0, 36, 1], [19, 49, 0, 30, 1], [23, 53, 1e6, 18], [17, 47, 0, 36, 1], [20, 51, 0, 24, 1], [25, 54, 0, 12], [18, 48, 0, 36, 1], [31, 55, 0, 6]];
const CLUB = { k: 'club', n: 'המועדון', d: 'הסגל, האצטדיון והמתקנים. בשווי הנקי: השחקנים לפי הספרים.', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'club' } };
const SP = (n, cost, cf, months, d) => ({ k: 'sponsor', n, d, cost, down: cost, value: 0, cf, op: { ck: 'sponsor', months }, q: 'חסות היא כסף כל חודש — עד שהחוזה נגמר, או עד שערורייה.' });
const FAC = (n, cost, down, cf, d) => ({ k: 'facility', n, d, cost, down, value: cost, cf, op: { ck: 'facility' } });

export default {
  id: 'w13', order: 13, name: 'אצטדיון הכוכבים', mechanic: 'league', modules: ['league', 'auction'], minRules: 7, mech: [league, auction], streams: ['content'],
  tagline: 'מועדון בדרג השני, אצטדיון חצי ריק ואוהדים שזוכרים ימים טובים. כל מקום בטבלה שווה כסף אחר — ובין המקום השני לשלישי עובר צוק.',
  goalLabel: 'שווי נקי של ₪450 מיליון (שחקנים לפי הספרים) ושכר עד 70% מההכנסות',
  lesson: 'בטורניר משלמים על מקום, לא על איכות: מקום שני שווה פי 1.6 ממקום שלישי. ומי שזוכה במכירה פומבית הוא לרוב מי שהעריך הכי ביוקר.',
  story: 'קנית מועדון כדורגל בדרג השני. האצטדיון חצי ריק, החוזים נעולים לשנים, ובסוף כל עונה הטבלה מחליטה: שתי הראשונות עולות וההכנסות קופצות פי 1.6, שתי האחרונות יורדות ומאבדות 40%. את השחקנים קונים במכירה מול מועדונים אחרים — ומי שמשלם הכי הרבה הוא לא תמיד מי שקנה הכי טוב. המטרה: שווי נקי של ₪450 מיליון, כשהשכר לא עובר 70% מההכנסות.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w13 (render lane)
    sky: ['#0b1020', '#1e3a8a'], fog: '#0f172a', board: '#166534', boardEdge: '#14532d', center: '#15803d', accent: '#dc2626',
    light: { hemiSky: '#e0f2fe', hemiGround: '#14532d', sun: '#f8fafc' }, decor: 'floodlights',
  },
  board,
  tiles: tilesFor(board, { H: { type: 'transfer', name: 'שוק ההעברות', color: '#dc2626', ink: '#ffffff', icon: 'ball' }, O: { name: 'חסות ונכסים' }, M: { name: 'חדשות הליגה' }, X: { name: 'משבר במועדון' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 2, of: [{ type: 'nw', target: 450000000 }, { type: 'modValue', key: 'wageRatio12', target: 0.7, cmp: 'le', label: 'שכר מול הכנסות (12 חודשים)' }] },
  maxMonths: 84,
  stars: { t2: 72, t3: 60 },
  start: {},
  doodadWealth: 0.0015,
  tipDoodad: 4000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 4000000, doodadWealth: 0.0015, band: { deal: [2000000, 60000000], monthly: [-3000000, 6000000] } },
  content: { pools: { O: 'deal' }, data: { deal: DEALS_W13 } },
  auction: { tile: 'H', tag: 'שוק ההעברות', rivals: clubNames(), make: lotOf, award: awardLot, budget: lotBudget,
    pool: [
      { band: 'young', age: [18, 21], r: [47, 57], d: 'כישרון צעיר מהדרג השלישי.' },
      { band: 'prospect', age: [21, 24], r: [55, 65], d: 'שחקן צעיר שכבר פותח בדרג השני.' },
      { band: 'prime', age: [25, 28], r: [61, 71], d: 'שחקן בשיא, יציב.' },
      { band: 'star', age: [26, 30], r: [71, 81], d: 'כוכב — האוהדים כבר שרים את השם שלו.', wageMult: 1.3 },
      { band: 'veteran', age: [30, 33], r: [63, 73], d: 'ותיק מנוסה. טוב היום, פחות בעוד שנתיים.', wageMult: 0.9 },
    ] },
  lessonDefs: [
    { id: 'rank_cliff', cat: 'world', title: 'צוק התגמול', text: 'בטורניר משלמים על המקום, לא על ההפרש: מקום שני מעלה ליגה ומקום שלישי לא. שקל שמוציאים כדי לעבור את הצוק שווה הרבה — ושקל שמוציאים ולא עוברים, הולך לאיבוד.' },
    { id: 'winners_curse', cat: 'world', title: 'קללת המנצח', text: 'במכירה פומבית כל אחד מעריך את אותו דבר אחרת. מי שזוכה הוא לרוב מי שהעריך הכי ביוקר — כלומר מי שטעה הכי הרבה כלפי מעלה. קובעים מחיר מקסימלי לפני שמתחילים, ולא רודפים אחרי המתחרה.' },
    { id: 'book_value', cat: 'world', title: 'ערך בספרים מול ערך בשוק', text: 'שחקן נרשם בספרים לפי מה ששילמת, ויורד בכל חודש עד סוף החוזה. השוק משלם לפי היכולת והגיל. הרווח בין השניים נרשם רק כשמוכרים.' },
  ],
  systems: {
    cycle: { amp: 0.8 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['brand', 'החברה של נותן החסות חדשה בשוק'], ['court', 'יש תביעה פתוחה נגד נותן החסות'], ['crowd', 'הקהל ירד בשתי העונות האחרונות'], ['permit', 'אישור הבנייה עוד לא סופי'], ['books', 'הדוחות "לפי ההנהלה"'], ['owner', 'הבעלים של החברה מחליף שותפים']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { club: 'stadium', sponsor: 'billboard', facility: 'club_shop', building: 'stadium', stake: 'stadium', side: 'club_shop', biz: 'club_shop' },
  kinds: {
    club: { label: 'המועדון', debtLabel: 'הלוואה' }, sponsor: { label: 'חסות', debtLabel: 'הלוואה' }, facility: { label: 'מתקן של המועדון', debtLabel: 'הלוואה' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'coachOwner', gender: 'm', age: 52, family: { partner: 'married', kids: 3 }, name: 'מאמן שקנה את המועדון', icon: 'whistle', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'רמי אימן עשרים שנה, ועכשיו המועדון שלו. הוא רואה בשחקן מה שאחרים לא רואים — אבל הכסף שלו הוא הקטן ביותר.',
      pros: ['רואה פוטנציאל של שחקן ±5 במקום ±15'], cons: ['מעט מזומן'],
      salary: 40000, cash: 28000000,
      expenses: [['משכנתא', 9000], ['רכב', 4000], ['אוכל ושוטף', 11000], ['ילדים', 7000], ['ביטוחים ושוטף', 5000]],
      start: { div: 1, club: 'הכוכבים', squad: BASE }, assets: [CLUB] },
    { id: 'localTycoon', gender: 'f', age: 48, family: { partner: 'married', kids: 2 }, name: 'טייקונית מקומית', icon: 'crown', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'שרון קנתה את מועדון העיר שלה עם ₪85 מיליון במזומן. האוהדים מצפים לכוכב חדש בכל חלון — ומי שלא מביא, שומע את זה ביציע.',
      pros: ['הרבה מזומן'], cons: ['בלי כוכב חדש בכל חלון העברות — מצב הרוח יורד', 'שכר גבוה ב־10%'],
      salary: 30000, cash: 85000000,
      expenses: [['דירה', 18000], ['רכב', 6000], ['אוכל ושוטף', 13000], ['ילדים', 6000], ['ביטוחים ושוטף', 7000]],
      start: { div: 1, club: 'הכוכבים', squad: BASE, wageMult: 1.1 }, assets: [CLUB] },
    { id: 'academyDirector', gender: 'f', age: 44, family: { partner: 'single', kids: 1 }, name: 'מנהלת אקדמיה', icon: 'sprout', maxMonths: 84, stars: { t2: 72, t3: 60 },
      desc: 'נועה בנתה את האקדמיה של המועדון. כל סוף עונה עולה ממנה שחקן צעיר שאיש עוד לא יודע כמה טוב הוא. סגל צעיר, שכר נמוך, מעט כסף.',
      pros: ['שחקן צעיר מהאקדמיה בכל סוף עונה', 'שכר נמוך ב־15%'], cons: ['מעט מזומן', 'סגל צעיר וחלש יותר'],
      salary: 35000, cash: 30000000,
      expenses: [['שכירות', 7000], ['רכב', 3000], ['אוכל ושוטף', 8000], ['ילד', 4000], ['ביטוחים ושוטף', 4000]],
      start: { div: 1, club: 'הכוכבים', squad: YOUTH, wageMult: 0.85 }, assets: [CLUB] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  // the legacy deal deck: the content pool's fallback only (the deal tile reads content.pools.O first)
  deals: [
    SP('חסות על החולצה', 3000000, 180000, 30, 'חברה מקומית רוצה את הלוגו שלה על החולצה.'),
    SP('חסות על היציע', 4000000, 200000, 24, 'השם של נותן החסות על יציע המזרח.'),
    FAC('תאי אירוח VIP', 20000000, 7000000, 170000, 'תאים לחברות שמארחות לקוחות.'),
    FAC('חנות המועדון', 8000000, 4000000, 75000, 'חולצות, צעיפים ומזכרות.'),
  ],
  goldenChance: 1 / 30,
  golden: [
    SP('נותן חסות ענק מחו"ל', 5000000, 450000, 36, 'חברה בינלאומית רוצה להיכנס לשוק, והקבוצה שלך היא הדרך.'),
  ],

  doodads: [
    { n: 'מטוס פרטי למשחקי חוץ', aMult: 1.4, inst: true, q: 'מטוס, או שחקן צעיר?' },
    { n: 'מסיבת אלופים לפני הזמן', aMult: 0.4, q: 'חוגגים אחרי העלייה — לא לפני.' },
    { n: 'שיפוץ חדר ההלבשה', aMult: 0.6, need: true, d: 'הקיר מתקלף והמקלחות דולפות.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'רכב יוקרה לבעלים', aMult: 0.5, inst: true, q: 'רכב יפה. כמה חודשי שכר של שחקן צעיר הוא עולה?' },
    { n: 'קנס מההתאחדות', aMult: 0.25, need: true, d: 'האוהדים הדליקו זיקוקים ביציע.', q: 'הוצאות שלא תכננת — בשבילן שומרים כרית.' },
    { n: 'ביטוח לאצטדיון', aMult: 0.3, need: true, inst: true, d: 'הביטוח השנתי של המבנה.', q: 'הוצאה קבועה של מי שיש לו אצטדיון.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'שעון שמראה את השעה — לא את הטבלה.' },
  ],

  market: [
    { mk: 'tv', add: 0.1, n: 'חוזה טלוויזיה חדש', d: 'הליגה חתמה על חוזה שידורים חדש: כסף הטלוויזיה עולה ב־10% לכל המועדונים.', q: 'הכנסה שעולה לכולם — מה היא עושה למחירי השחקנים?' },
    { mk: 'fees', months: 6, n: 'שוק ההעברות רותח', d: 'קבוצות מחו"ל קונות בלי חשבון: מחירי השחקנים עולים ב־20% לחצי שנה.', q: 'זמן טוב למכור. זמן רע לקנות.' },
    { mk: 'coach', months: 6, n: 'מאמן הנוער נחטף', d: 'מועדון מתחרה לקח את מאמן הנוער שלך. חצי שנה בלי שיפור לצעירים.', q: 'גם אנשים הם נכס. כמה עולה להחליף אחד?' },
    { mk: 'cup', amt: 3000000, n: 'ריצה בגביע', d: 'הקבוצה עלתה לרבע גמר הגביע: כסף מהכרטיסים ומהטלוויזיה, והקהל מתלהב.', q: 'הכנסה חד־פעמית. אל תבנה עליה שכר קבוע.' },
    { mk: 'derby', fan: 0.1, n: 'דרבי מקומי', d: 'הדרבי של העיר: היציע מלא החודש.', q: 'משחק אחד שממלא את היציע. האם אפשר לבנות עליו?' },
    { mk: 'star', add: 0.3, n: 'הכוכב רוצה העלאה', d: 'השחקן הכי טוב שלך מאיים לעזוב אם לא יקבל 30% יותר. ההנהלה הסכימה.', q: 'שכר עולה בקלות. הוא לא יורד בקלות.' },
    { mk: 'tv', add: 0.05, n: 'זכויות שידור לחו"ל', d: 'הליגה מכרה את המשחקים גם לחו"ל: עוד 5% מכסף הטלוויזיה.' },
  ],

  crises: [
    { mk: 'ffp', n: 'ביקורת יציבות פיננסית', d: 'ההתאחדות בודקת את הספרים: מועדון שהשכר שלו מעל 75% מההכנסות משלם קנס של 4% מהכנסות השנה.', q: 'כמה מההכנסות הולך לשכר?' },
    { mk: 'scandal', n: 'שערוריית נותן חסות', d: 'נותן החסות הגדול שלך בכותרות. החוזה מבוטל מהיום.', q: 'הכנסה מחסות היא טובה — עד שהיא לא.' },
    { mk: 'protest', n: 'מחאת אוהדים', d: 'האוהדים מחרימים את המשחקים: חודשיים של יציע ריק יותר.', q: 'אוהדים הם לקוחות. מה גרם להם לכעוס?' },
    { mk: 'roof', amt: 2000000, n: 'הגג של היציע דולף', d: 'תיקון דחוף לגג היציע. ככל שהאצטדיון גדול יותר, התיקון יקר יותר.' },
    { n: 'תביעה של שחקן לשעבר', d: 'שחקן שעזב תובע על בונוסים. עורכי דין עולים כסף.', cash: -1500000, cashLabel: 'פשרה בתביעה' },
    { noSalary: true, n: 'חודש בלי משכורת', d: 'הוועד המנהל לא אישר את משכורת הבעלים החודש.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'מכירת כרטיסים לגמר', text: 'האצטדיון שלך נבחר לארח משחק גמר: ₪1,500,000.', after: 'אצטדיון הוא גם נכס שמכניס בלי משחק של הקבוצה.' },
    { w: 6, kind: 'cash', amount: -900000, title: 'קנס על התנהגות הקהל', text: 'ההתאחדות קנסה את המועדון: ₪900,000.', after: 'הוצאות שלא תכננת — בשבילן שומרים כרית.' },
    { w: 3, kind: 'golden', title: 'טלפון מנותן חסות גדול' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מקום שני מעלה ליגה (הכנסות פי 1.6), מקום שלישי לא. כמה שווה לך עוד נקודה בסוף העונה?', answers: ['כמו כל נקודה אחרת', 'הרבה — אם היא עוברת את הצוק, ואפס אם לא', 'כלום — מה שחשוב זה הכסף'], correct: 1, reward: 'lesson', lesson: 'rank_cliff', explain: 'בטורניר משלמים על המקום, לא על ההפרש. נקודה שמעבירה את הצוק שווה מיליונים; נקודה שלא — כמעט כלום.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'ארבעה מועדונים מתחרים על שחקן. ניצחת. מה זה אומר על המחיר?', answers: ['שקנית בזול', 'כנראה שהערכת אותו יותר מכולם — אולי ביוקר מדי', 'כלום'], correct: 1, reward: 'lesson', lesson: 'winners_curse', explain: 'מי שזוכה הוא מי שהעריך הכי ביוקר. אם לא קבעת מחיר מקסימלי מראש — כנראה שילמת יותר מדי.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'קנית שחקן ב־₪20 מיליון לחוזה של 4 שנים. כמה הוא שווה בספרים אחרי שנתיים?', answers: ['₪20 מיליון', '₪10 מיליון — הספרים מורידים חלק בכל חודש', 'כמה שהשוק משלם'], correct: 1, reward: 'lesson', lesson: 'book_value', explain: 'בספרים השחקן יורד בקו ישר עד סוף החוזה. השוק משלם לפי יכולת וגיל — והרווח נרשם רק במכירה.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'כאן ההכנסה תלויה במקום בטבלה, והשכר נעול בחוזים. השאלה היא לא רק כמה הקבוצה טובה — אלא כמה עולה להיות טובה.',
    dealAsk: ['כמה מזה תלוי בעונה טובה?', 'חסות היא כסף כל חודש — עד שהיא נגמרת.'],
    buyGood: 'הכנסה בחודש רגיל: {cf}.',
    lotAsk: 'ההערכה הציבורית: {value}. קבע מחיר מקסימלי לפני שאתה מציע — ואל תרדוף אחרי מועדון אחר.',
    lotOutbid: '{by} הציע {price}. המחיר עלה — האם השחקן עלה?',
    lotWon: 'זכית ב־{price}. עכשיו תשאל: למה אף אחד אחר לא הציע יותר?',
    lotLost: 'מועדון אחר לקח אותו ב־{price}. לפעמים ההפסד במכירה הוא הניצחון.',
    lotWalk: 'ויתרת. השחקן הבא יגיע.',
    promoted: 'סוף העונה: מקום {rank}. עולים ל{div} — ההכנסות קופצות פי 1.6. והשכר? הוא כבר נעול.',
    relegated: 'סוף העונה: מקום {rank}. יורדים ל{div}. ההכנסות צונחות, והחוזים נשארים.',
    stayed: 'סוף העונה: מקום {rank}. נשארים ב{div}.',
    sold: '{name} נמכר ב־{price} ({gain} מול הספרים).',
    wageHigh: 'השכר אוכל {pct}% מההכנסות. חוזים נעולים לא מתכווצים כשההכנסה יורדת.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. כאן מנצחים עם עלייה בזמן הנכון ושכר שאפשר לשאת.',
    won: '₪450 מיליון ושכר בשליטה. מועדון שמנצח גם בספרים.',
  },
};
