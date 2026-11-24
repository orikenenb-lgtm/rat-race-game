// World 8 — מטרופולין הנדל"ן ("העיר שצומחת לגובה"). Goal: net worth ₪250M, where work in progress counts AT COST (land + what was paid
// into the stages), never at its projected sale value — a half-built tower is not yet worth its apartments.
// Mechanic module `projects` (js/worlds/mech/projects.js) on the shared staged-build core (js/worlds/mech/stages.js, reused by w9): land on
// the new 'Q' tile (a sealed permit wait, overrun, delay and contractor failure — 4 draws at the landing), equity first, a construction
// loan that draws only above 30 % presales, capitalised interest, buyer demand that falls with the rate, sell or hold at completion.
// Spec: docs/full-upgrade/worlds/w8-metropolis.md. Every number is TUNE (tools/sim.mjs --world-gates N w8, tools/balance-data/gates-w8.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w8')); NOT in WORLDS (no daily rotation); not ranked until the DB migration (meta.ranked).
// minRules 6. Visuals live render-side (WORLD_STYLE.w8 in js/render/vocab.js); `theme` here only keeps legacy render code working.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import projects from './mech/projects.js';

const board = ring(['OQOD?LMQI', 'OMQLXO?OD', 'OQOMEODLO', 'OXMQTO?MD']); // 40 tiles, paydays on the corners, 5 × 'Q' (קרקע לפרויקט)

// A site (the Q tile's offer and the plots' plan): units × list (₪ per unit at list price), land, cost (construction + soft, all stages),
// stages × stageMonths, eqReq (equity share of land + cost before the loan), permitAdd (months on top of the sealed permit wait),
// noPresale (offices, logistics: the bank lends against a higher equity share), plan 'sell'|'hold', floors (render hint).
// TUNE (balance pass): list × 1.06 and land × 0.85 of the design numbers below (sale margins ≈ 20–30 % on cost when on time).
const S = (o) => ({ stages: 6, stageMonths: 2, eqReq: 0.2, plan: 'sell', ...o, list: Math.round(o.list * 1.06 / 1000) * 1000, land: Math.round(o.land * 0.85 / 1000) * 1000 });
const sites = [
  S({ pk: 'tower', n: 'מגדל מגורים בצפון העיר', name: 'המגדל בצפון', d: 'קרקע לבניין של 22 קומות ליד הפארק.', units: 90, list: 2400000, land: 38000000, cost: 112000000, floors: 22 }),
  S({ pk: 'boutique', n: 'בניין בוטיק במרכז', name: 'בניין הבוטיק', d: 'מגרש קטן ברחוב שקט במרכז העיר.', units: 40, list: 2900000, land: 22000000, cost: 62000000, stages: 5, floors: 9 }),
  S({ pk: 'renewal', n: 'פינוי־בינוי בשכונה ותיקה', name: 'פרויקט ההתחדשות', d: 'ארבעה בניינים ישנים. הקרקע זולה — הוועדות איטיות.', units: 120, list: 2000000, land: 22000000, cost: 150000000, permitAdd: 4, floors: 16 }),
  S({ pk: 'mixed', n: 'מתחם מגורים ומסחר', name: 'המתחם החדש', d: 'מגדל מגורים מעל קומת מסחר, ליד תחנת הרכבת הקלה.', units: 100, list: 2600000, land: 52000000, cost: 150000000, floors: 25 }),
  S({ pk: 'logistics', n: 'מרכז לוגיסטי', name: 'המרכז הלוגיסטי', d: 'בנייה מהירה, שוכר מחכה. אין מה למכור על הנייר — הבנק רוצה 40% הון עצמי.', units: 10, list: 9500000, land: 18000000, cost: 52000000, stages: 4, stageMonths: 2, eqReq: 0.4, noPresale: true, plan: 'hold', floors: 2 }),
  S({ pk: 'office', n: 'בניין משרדים', name: 'בניין המשרדים', d: 'מגדל משרדים באזור התעסוקה. אין מכירות מוקדמות; אחרי הסיום — שכירות או מכירה בבת אחת.', units: 24, list: 8500000, land: 40000000, cost: 118000000, eqReq: 0.4, noPresale: true, plan: 'hold', floors: 18 }),
  S({ pk: 'tower', n: 'מגדל ליד הים', name: 'המגדל ליד הים', d: 'מגרש עם נוף לים. מחיר הקרקע בהתאם.', units: 80, list: 3200000, land: 62000000, cost: 128000000, floors: 26 }),
  S({ pk: 'boutique', n: 'בניין בשכונה מתחדשת', name: 'הבניין בשכונה', d: 'שכונה שמתחדשת, מחירים שעוד לא עלו.', units: 48, list: 2100000, land: 15000000, cost: 60000000, stages: 5, floors: 8 }),
];

/** A project the character already has (fateIdx = which 4 of the 12 init draws seal its remaining fate). */
const P = (site, o) => ({ k: site.pk, n: o.n, d: o.d || '', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'proj', site: { ...site, permitDone: true, sb: o.sb, opx: o.opx }, tier: 'reliable', fateIdx: o.fateIdx } });
const PLOT = (site, o) => ({ k: 'plot', n: o.n, d: o.d || '', cost: site.land, down: site.land, value: site.land, cf: 0, op: { ck: 'plot', site, fateIdx: o.fateIdx } });

export default {
  id: 'w8', order: 8, name: 'מטרופולין הנדל"ן', mechanic: 'projects', minRules: 6, mech: [projects],
  tagline: 'העיר צומחת לגובה. קרקע, ועדות, מנופים — והכסף יוצא הרבה לפני שהוא חוזר.',
  goalLabel: 'שווי נקי של ₪250 מיליון (בניין שלא נגמר — לפי העלות)',
  lesson: 'בפרויקט ארוך הכסף נגמר לפני שהבניין נגמר. הון עצמי בצד, מכירות מוקדמות ותזמון שלבים הם ההבדל בין יזם לפושט רגל. ושווי על הנייר של בניין שלא נגמר הוא לא שווי.',
  story: 'יצאת מהמירוץ, ועכשיו אתה בונה עיר. כל פרויקט הוא התחייבות של שנים: קודם קרקע והון עצמי, אחר כך ועדות, ורק אז הבנק — ורק אם מכרת מספיק דירות על הנייר. המטרה: חברה ששווה ₪250 מיליון, כשבניין שעוד לא נגמר נספר רק לפי מה שהשקעת בו.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w8 (render lane)
    sky: ['#fde68a', '#93c5fd'], fog: '#e5e7eb', board: '#e5e7eb', boardEdge: '#854d0e', center: '#f3f4f6', accent: '#eab308',
    light: { hemiSky: '#fef3c7', hemiGround: '#9ca3af', sun: '#fde68a' }, decor: 'cranes',
  },
  board,
  tiles: tilesFor(board, { Q: { name: 'קרקע לפרויקט' }, X: { name: 'משבר בבנייה' }, M: { name: 'השוק' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'netWorth', target: 250000000, hold: 2 },
  maxMonths: 80,
  stars: { t2: 64, t3: 52 },
  start: {},
  doodadWealth: 0.002,
  tipDoodad: 5000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 150000, sideReportFee: 400, tipDoodad: 5000000, doodadWealth: 0.002, band: { deal: [10000000, 400000000], monthly: [-2000000, 5000000] } },
  sites,
  systems: {
    cycle: { amp: 1.0 },
    rivals: { preset: 'NORMAL' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 150000,
      pool: [['permit', 'ההיתר הוגש מחדש אחרי ערר'], ['soil', 'לא נעשתה בדיקת קרקע'], ['tenant', 'השוכר הראשי חתם רק לשנה'], ['contractor', 'הקבלן הקודם עזב באמצע'], ['books', 'הדוחות "לפי ההנהלה"'], ['lien', 'יש שעבוד ישן על המגרש']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { tower: 'tower_build', boutique: 'tower_build', renewal: 'tower_build', mixed: 'tower_build', logistics: 'logistics_build', office: 'office_build', plot: 'plot_fence', rent: 'tower_done', building: 'tower_done', stake: 'tower_done', side: 'tower_done', biz: 'tower_done' },
  kinds: {
    tower: { label: 'מגדל מגורים', debtLabel: 'ליווי בנקאי' }, boutique: { label: 'בניין בוטיק', debtLabel: 'ליווי בנקאי' }, renewal: { label: 'התחדשות עירונית', debtLabel: 'ליווי בנקאי' }, mixed: { label: 'מתחם מעורב', debtLabel: 'ליווי בנקאי' },
    logistics: { label: 'מרכז לוגיסטי', debtLabel: 'הלוואה' }, office: { label: 'בניין משרדים', debtLabel: 'הלוואה' }, plot: { label: 'קרקע', debtLabel: 'הלוואה' }, building: { label: 'בניין מושכר', debtLabel: 'משכנתא' },
    side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'developer', gender: 'f', age: 52, family: { partner: 'married', kids: 3 }, name: 'יזמית ותיקה', icon: 'crane', maxMonths: 64, stars: { t2: 54, t3: 46 },
      desc: 'מגדל של 90 דירות באמצע הבנייה, ועדות שמכירות אותה וקונים שסומכים עליה. אבל החוב כבד, והקופה קטנה.',
      pros: ['היתרים מגיעים מהר יותר (25%)', 'מוכרת דירות ב־3% יותר'],
      cons: ['חוב גדול על המגדל', 'קופה קטנה לפרויקט הבא'],
      salary: 35000, cash: 3000000,
      expenses: [['משכנתא', 14000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 8000], ['ביטוחים ושוטף', 7000]],
      assets: [P(sites[0], { n: 'המגדל של רחל', d: 'שלב 3 מתוך 6. 30 דירות כבר נמכרו על הנייר.', fateIdx: 0,
        sb: { stage: 3, spent: 56000000, equity: 47500000, loan: 33500000 }, opx: { presold: 30, presoldRev: 64800000, deposits: 12960000, target: 0.4 } })] }, // the deposits were spent on stages 1–3 (escrow 0)
    { id: 'landowner', gender: 'm', age: 58, family: { partner: 'married', kids: 4 }, name: 'משפחת בעלי קרקעות', icon: 'land', maxMonths: 64, stars: { t2: 52, t3: 44 },
      desc: 'שלושה מגרשים בלי חוב, שעברו במשפחה שלושה דורות. אין צורך לקנות קרקע — אבל כמעט אין מזומן, ומכירה מהירה של מגרש עולה 20%.',
      pros: ['קרקע בלי עלות: שלושה מגרשים', 'עסקת קומבינציה: יזם בונה תמורת חלק מהדירות'],
      cons: ['כמעט בלי מזומן', 'מכירה מהירה של מגרש: 20% פחות'],
      salary: 22000, cash: 4000000,
      expenses: [['שוטף הבית', 9000], ['רכב', 4000], ['אוכל ושוטף', 11000], ['משפחה', 9000], ['ביטוחים ושוטף', 6000]],
      assets: [PLOT({ ...sites[1], land: 9000000 }, { n: 'המגרש ברחוב הזיתים', d: 'מגרש בוטיק במרכז.', fateIdx: 0 }), PLOT({ ...sites[7], land: 8000000 }, { n: 'המגרש בשכונה', fateIdx: 1 }), PLOT({ ...sites[0], land: 11000000 }, { n: 'השטח בצפון', d: 'מספיק למגדל.', fateIdx: 2 })] },
    { id: 'contractor', gender: 'm', age: 47, family: { partner: 'married', kids: 2 }, name: 'קבלן ביצוע', icon: 'hardhat', maxMonths: 84, stars: { t2: 70, t3: 58 },
      desc: 'עשרים שנה בנה לאחרים, עכשיו בונה לעצמו. בונה זול יותר ובלי הפתעות — אבל אין לו צוות מכירות, והוועדות לא מכירות אותו.',
      pros: ['בונה ב־15% פחות', 'חריגות בנייה קטנות בחצי'],
      cons: ['היתרים לוקחים 15% יותר', 'בלי צוות מכירות: הדירות נמכרות ב־3% פחות'],
      salary: 30000, cash: 40000000,
      expenses: [['משכנתא', 11000], ['רכב', 5000], ['אוכל ושוטף', 11000], ['ילדים', 6500], ['ביטוחים ושוטף', 6500]] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד — לשלב הבא.' },

  deals: [
    { k: 'boutique', n: 'פרויקט תקוע למכירה', d: 'יזם שנתקע מוכר בניין בשלב 2 מתוך 5 — ב־60% מהעלות. החריגות כבר ידועות.', cost: 28000000, down: 28000000, value: 28000000, cf: 0,
      op: { ck: 'proj', tier: 'reliable', fate: [0.5, 0, 0, 0.99], site: { ...sites[1], n: 'הפרויקט התקוע', permitDone: true, sb: { stage: 2, land: 13200000, spent: 14800000, equity: 28000000, loan: 0 } } }, q: 'שני שלבים בנויים בזול. כמה הון עצמי ותזמון צריך כדי לגמור אותו?' },
    { k: 'plot', n: 'קרקע בעתודה', d: 'מגרש בלי היתר, במחיר נמוך. מתאים לבניין בינוני — בעוד כמה שנים.', cost: 14000000, down: 14000000, value: 14000000, cf: 0, op: { ck: 'plot', site: { ...sites[7], land: 14000000 }, fate: [0.6, 0.3, 0.2, 0.99] }, q: 'קרקע לא מכניסה כלום עד שבונים. מתי תוכל לבנות עליה?' },
    { k: 'building', n: 'בניין משרדים מושכר', d: 'בניין קטן ומושכר במלואו. בלי בנייה, בלי ועדות.', cost: 30000000, down: 9000000, cf: 60000, value: 30000000, grow: 0.002, q: 'תשואה צנועה ויציבה. מתי זה עדיף על פרויקט?' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'פיזור רחב — ונזיל.' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד לשלב הבא.' },
  ],
  goldenChance: 1 / 30,
  golden: [
    { k: 'plot', n: 'מגרש עם תוכנית מאושרת', d: 'בעל קרקע מבוגר מוכר מגרש עם היתר ביד — בזול.', cost: 9000000, down: 9000000, value: 15000000, cf: 0, op: { ck: 'plot', site: { ...sites[1], land: 15000000, permitDone: true }, fate: [0, 0.2, 0, 0.99] } },
  ],

  doodads: [
    { n: 'רכב מנהלים', aMult: 0.6, inst: true, q: 'רכב יפה. כמה חודשי ריבית על הלוואת בנייה הוא עולה?' },
    { n: 'אירוע השקה לפרויקט', aMult: 0.4, q: 'מסיבה יפה. האם היא מכרה דירות?' },
    { n: 'משרד מעוצב במגדל', aMult: 1.2, inst: true, q: 'משרד יפה לא בונה קומות.' },
    { n: 'יאכטה', aMult: 1.8, inst: true, q: 'יאכטה, או הון עצמי לשלב הבא?' },
    { n: 'חופשה משפחתית', aMult: 0.3, q: 'מגיע לך. המנופים ימשיכו בלעדיך.' },
    { n: 'תיקון גג בבית', aMult: 0.25, need: true, d: 'נזילה בחורף. אין ויכוח.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'ביטוח אחריות אישית', aMult: 0.3, need: true, inst: true, d: 'חובה לכל דירקטור.', q: 'יש הוצאות שאי אפשר לדלג עליהן.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'יפה. כמו מנוף שעובד — רק בלי הקומות.' },
  ],

  market: [
    { mk: 'rate', dr: 1.25, n: 'בנק ישראל מעלה את הריבית', d: 'הריבית עולה ב־1.25%: הלוואות הבנייה מתייקרות, והביקוש לדירות יורד.', q: 'ריבית גבוהה מייקרת את הלוואת הבנייה — ומרחיקה קונים. שני הדברים בבת אחת.' },
    { mk: 'rate', dr: -1, n: 'בנק ישראל מוריד את הריבית', d: 'הריבית יורדת באחוז: ההלוואות זולות יותר והקונים חוזרים.', q: 'ריבית נמוכה: אשראי זול וקונים חוזרים.' },
    { mk: 'freeze', months: 3, n: 'הוועדה מקפיאה אישורים', d: 'הוועדה המחוזית עוצרת דיונים: כל היתר שעוד לא הגיע מתעכב בשלושה חודשים.' },
    { mk: 'steel', pct: 0.08, n: 'מחיר הפלדה מזנק', d: 'הברזל והבטון התייקרו: השלבים של כל פרויקט בבנייה יקרים ב־8%.', q: 'חריגה בעלויות לא עוצרת את הריבית. כמה כרית יש לך?' },
    { mk: 'crane', n: 'תאונת מנוף', d: 'תאונה באתר: פרויקט אחד שלך עוצר לחודש.' },
    { mk: 'foreign', add: 0.1, months: 6, n: 'גל קונים מחו"ל', d: 'קונים מחו"ל חוזרים: הביקוש לדירות עולה ב־10% לחצי שנה.' },
    { mk: 'lottery', cut: 0.07, months: 6, n: 'הגרלת "מחיר מטרה"', d: 'הממשלה מוכרת דירות בהנחה: מחירי הדירות שלך יורדים ב־7% לחצי שנה.', q: 'מכירה מוקדמת נעלה מחיר — לטוב ולרע.' },
    { mk: 'strike', n: 'שביתה במפעל הבטון', d: 'אין בטון חודש: כל האתרים שלך עומדים — והריבית רצה.' },
    { k: 'price', tk: 'IDX', p: 115, n: 'הבורסה בשיא', d: 'קרן המדד עלתה ל־115.' },
  ],

  crises: [
    { mk: 'conBust', n: 'קבלן פשט רגל', d: 'קבלן זול באחד הפרויקטים שלך קרס. קבלן חדש: 15% יותר, וחודשיים בלי עבודה.', q: 'קבלן זול חוסך כסף — עד שהוא לא.' },
    { n: 'תביעה של דיירים', d: 'דיירים בפרויקט קודם תובעים על ליקויים.', cash: -800000, cashLabel: 'פשרה עם הדיירים' },
    { noSalary: true, n: 'מבצע צבאי', d: 'חודש בלי משכורת. האתרים עובדים לאט.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'החזר היטל השבחה', text: 'הוועדה החזירה היטל שנגבה ביתר: ₪1,500,000.', after: 'כסף שנכנס פעם אחת: הון עצמי לשלב הבא?' },
    { w: 6, kind: 'cash', amount: -900000, title: 'ערר של שכנים', text: 'שכנים הגישו ערר. עורכי דין עולים כסף.', after: 'גם בפרויקט טוב יש הוצאות לא צפויות.' },
    { w: 3, kind: 'golden', title: 'טלפון מבעל קרקע' },
    { w: 3, kind: 'raise', amount: 10000, title: 'דירקטוריון', text: 'מינו אותך לדירקטור בחברה ציבורית. המשכורת עולה ב־₪10,000 בחודש.', after: 'עוד מזומן כל חודש = עוד הון עצמי.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הבנק אישר הלוואת בנייה. מתי הוא משחרר את הכסף?', answers: ['מיד', 'אחרי שהשקעת הון עצמי ומכרת מספיק דירות על הנייר', 'בסוף הבנייה'], correct: 1, reward: 'lesson', lesson: 'staged_finance', explain: 'בליווי בנקאי הכסף שלך נכנס ראשון. הבנק נכנס רק אחרי הון עצמי ומכירות מוקדמות — כדי שאם משהו ישתבש, אתה תפסיד קודם.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הפרויקט מתעכב חצי שנה. מה קורה להלוואה?', answers: ['כלום', 'הריבית ממשיכה לרוץ ומצטרפת לחוב — העיכוב עולה כסף כל חודש', 'הבנק מוחק חלק'], correct: 1, reward: 'lesson', lesson: 'capitalised_interest', explain: 'ריבית על הלוואת בנייה מצטברת לחוב. כל חודש של עיכוב מגדיל את העלות — גם אם לא נבנתה אף קומה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מכרת 40% מהדירות על הנייר ב־10% הנחה. אחר כך המחירים קפצו. מה קיבלת?', answers: ['כלום', 'הלוואה שהשתחררה וסיכון שירד — ויתרת על חלק מהעלייה', 'הפסד'], correct: 1, reward: 'lesson', lesson: 'presales', explain: 'מכירה מוקדמת היא ביטוח: היא פותחת את המימון ומורידה סיכון, ומשלמים עליה בהנחה ובוויתור על העלייה.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'בניין בחצי הדרך עלה לך ₪100 מיליון. ברגע שיגמר, הדירות שוות ₪150 מיליון. כמה הוא שווה היום?', answers: ['₪150 מיליון', 'בערך מה שהשקעת — עד שהוא נגמר, הוא שווה רק את העלות', '₪0'], correct: 1, reward: 'lesson', lesson: 'wip_at_cost', explain: 'בניין שלא נגמר עוד יכול להתעכב, להתייקר או להיתקע. עד המסירה — שוויו הוא מה ששולם עליו, לא מה שהוא אולי יהיה.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הריבית עולה ב־2%. מה זה עושה ליזם?', answers: ['רק ההלוואה מתייקרת', 'גם ההלוואה מתייקרת וגם הקונים מתרחקים — שתי מכות בבת אחת', 'כלום'], correct: 1, reward: 'lesson', lesson: 'rate_demand', explain: 'ריבית גבוהה מייקרת את המימון של היזם ואת המשכנתא של הקונה. לכן היא פוגעת פעמיים — בעלות ובמכירות.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'עוד אין לך פרויקט. במטרופולין השווי נבנה מבניינים שנגמרים — ועד שהם נגמרים, הם שווים רק את העלות.',
    paydayNW: 'השווי של החברה: {nw}. היעד: {target}. בניין שעוד לא נגמר נספר רק לפי מה שהשקעת.',
    dealAsk: ['כמה הון עצמי זה צריך, ומתי?', 'מה קורה אם זה מתעכב חצי שנה?'],
    buyGood: 'תזרים בחודש רגיל: {cf}. ותזכור: הון עצמי לשלבים הבאים — לפני הכל.',
    landAsk: ['בפרויקט ארוך הכסף נגמר לפני שהבניין נגמר. כמה הון עצמי תצטרך, ומתי?', 'בדיקת תב"ע עולה ₪150 אלף. שנה של עיכוב בהיתר עולה הרבה יותר.'],
    landBuy: 'קנית קרקע. עכשיו מחכים להיתר — ואחריו כל שלב צריך הון עצמי, עד שמגיעים ל־30% מכירות והבנק נכנס.',
    landPass: 'ויתרת. פרויקט שלא התחלת לא יכול להיתקע.',
    checked: 'בדיקת התב"ע: ההיתר צפוי בעוד {lo}–{hi} חודשים.',
    permitIn: '{name}: ההיתר הגיע. מתחילים לבנות.',
    stalledEquity: '{name} עומד: אין מזומן להון העצמי של השלב. הריבית ממשיכה לרוץ.',
    stalledGate: '{name} עומד: הבנק משחרר את הלוואת הבנייה רק אחרי {pct}% מכירות מוקדמות.',
    delayed: '{name}: עיכוב של {months} חודשים באתר. הריבית רצה.',
    contractorFail: 'הקבלן של {name} פשט רגל. קבלן חדש עולה יותר, וחודשיים בלי עבודה.',
    completed: '{name} הושלם ונמסר לקונים: {net} אחרי החזר ההלוואות.',
    held: '{name} הושלם. {units} דירות נשארו אצלך להשכרה.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. במטרופולין מנצחים עם הון עצמי בצד, מכירות מוקדמות לפני השלב, ולא יותר משני פרויקטים בבת אחת.',
    won: 'חברה ששווה ₪250 מיליון — בבניינים שנגמרו. בנית, מימנת בשלבים ולא נתקעת.',
  },
};
