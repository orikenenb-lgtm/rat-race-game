// World 9 — מדבר האנרגיה ("שמש, רוח ואגירה במדבר"). Goal: operating income AFTER debt service of ₪3.5M a month (passiveTarget, hold 3).
// Mechanic module `energy` (js/worlds/mech/energy.js) on the shared staged-build core (js/worlds/mech/stages.js, written for w8): power
// sites on the new 'V' tile (sealed permit wait, overrun, delay, resource quality — 4 draws at the landing), equity first, a construction
// loan that draws only for a project holding a grid slot ('O' cards contested by rivals, or the grid operator's queue), PPA or merchant at
// completion, a spot power index with spikes and solar cannibalisation, storage on the spread, DCF value and refinancing (build, refi, repeat).
// Spec: docs/full-upgrade/worlds/w9-energy.md. Every number is TUNE (tools/sim.mjs --world-gates N w9, tools/balance-data/gates-w9.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w9')); NOT in WORLDS (no daily rotation); not ranked until the DB migration (meta.ranked).
// minRules 6. Visuals live render-side (WORLD_STYLE.w9 in js/render/vocab.js); `theme` here only keeps legacy render code working.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import energy from './mech/energy.js';

const board = ring(['OVOD?VMVI', 'OMVLXOVOD', 'OVOMEODVL', 'OXMVTO?MD']); // 40 tiles, paydays on the corners, 8 × 'V' (אתר אנרגיה)

// A site (the V tile's offer and the kibbutz's parcels): tech (solar | wind | storage | hybrid), mw, capex (₪, all-in: development 5 % +
// construction), permitAdd (months on top of the sealed permit wait). Build stages and capacity factors are per technology (energy.js TECH).
const S = (o) => ({ ...o, capex: Math.round(o.capex / 1000) * 1000 });
const sites = [
  S({ tech: 'solar', n: 'שדה סולארי ליד ירוחם', name: 'השדה בירוחם', d: 'מישור פתוח ליד קו מתח עליון.', mw: 50, capex: 170000000 }),
  S({ tech: 'solar', n: 'שדה קטן בערבה', name: 'השדה בערבה', d: 'שטח קטן, קרינה חזקה.', mw: 20, capex: 66000000 }),
  S({ tech: 'solar', n: 'שדה ענק ברמת הנגב', name: 'השדה הגדול', d: 'מאה מגה־ואט — זול יותר לכל מגה־ואט, ויקר מאוד בסך הכל.', mw: 100, capex: 320000000, permitAdd: 1 }),
  S({ tech: 'wind', n: 'חוות רוח על הרכס', name: 'חוות הרוח', d: 'רכס עם רוח קבועה בחורף. בנייה ארוכה.', mw: 60, capex: 330000000 }),
  S({ tech: 'storage', n: 'אגירה ליד תחנת המשנה', name: 'מתקן האגירה', d: 'סוללות שקונות חשמל בצהריים ומוכרות בערב.', mw: 50, capex: 115000000 }),
  S({ tech: 'storage', n: 'אגירה קטנה בקיבוץ שכן', name: 'האגירה הקטנה', d: 'מתקן קטן, בנייה מהירה.', mw: 25, capex: 60000000 }),
  S({ tech: 'hybrid', n: 'סולארי עם אגירה ליד דימונה', name: 'השדה עם הסוללות', d: 'שדה סולארי עם סוללות שמוכרות גם בערב.', mw: 40, capex: 185000000 }),
  S({ tech: 'solar', n: 'שדה ליד אשלים', name: 'השדה באשלים', d: 'קרוב לתחנת הכוח התרמו־סולארית.', mw: 40, capex: 140000000 }),
];

/** A project the character already has (fateIdx = which 4 of the 8 init draws seal its fate). */
const P = (site, o) => ({ k: site.tech, n: o.n, d: o.d || '', cost: 0, down: 0, value: 0, cf: 0, op: { ck: 'proj', site, fateIdx: o.fateIdx, slotNow: !!o.slotNow } });
/** The kibbutz's own land for a project (no land cost; the land and the council's support count as 20 % of the capex in equity). */
const SITE = (site, o) => { const land = Math.round(site.capex * 0.2 / 1000) * 1000; return { k: 'site', n: o.n, d: o.d || '', cost: land, down: land, value: land, cf: 0, op: { ck: 'site', site, land, fateIdx: o.fateIdx } }; };
const SLOT = (fee, n, d) => ({ k: 'slot', n, d, cost: fee, down: fee, value: fee, cf: 0, op: { ck: 'slot', fee }, q: 'בלי חיבור לרשת הבנק לא מממן את הבנייה. יש לך פרויקט שמחכה לחיבור?' });

export default {
  id: 'w9', order: 9, name: 'מדבר האנרגיה', mechanic: 'energy', minRules: 6, mech: [energy],
  tagline: 'שמש, רוח ואגירה במדבר. תשתית עולה הון עצום היום ומחזירה אותו לאט — ומי שבונה, ממחזר ובונה שוב, מגלגל פרויקט אחד לעשרה.',
  goalLabel: 'הכנסה תפעולית של ₪3.5 מיליון בחודש אחרי החזר החוב',
  lesson: 'תשתית היא כסף של היום תמורת כסף של מחר. הכנסה ארוכה ויציבה שווה הרבה, ואפשר ללוות כנגדה כדי לבנות עוד. אבל כל שקל שמשכת היום הוא החזר שתשלם מחר.',
  story: 'יצאת מהמירוץ, ועכשיו אתה בונה תחנות כוח במדבר. כל תחנה עולה מאות מיליונים היום ומחזירה אותם לאט, לאורך עשרים שנה. מי שבונה אחת ומחכה — מחכה. מי שבונה, מממן מחדש ובונה שוב — מגלגל. המטרה: ₪3.5 מיליון בחודש מהתחנות, אחרי שהבנק קיבל את ההחזר שלו.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w9 (render lane)
    sky: ['#fef3c7', '#fbbf24'], fog: '#fde68a', board: '#e9c46a', boardEdge: '#92400e', center: '#fef9c3', accent: '#06b6d4',
    light: { hemiSky: '#fef3c7', hemiGround: '#d6a85a', sun: '#fff7d6' }, decor: 'solar',
  },
  board,
  tiles: tilesFor(board, { V: { name: 'אתר אנרגיה' }, X: { name: 'תקלה ברשת' }, M: { name: 'שוק החשמל' } }),
  loan: { unit: 1000000, autoUnit: 1000000, pct: 1.1, cap: 6, bankrupt: 80 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'passiveTarget', key: 'opIncome', target: 3500000, hold: 3, label: 'הכנסה תפעולית אחרי החזר חוב' },
  maxMonths: 84,
  stars: { t2: 68, t3: 56 },
  start: {},
  doodadWealth: 0.002,
  tipDoodad: 5000000,
  bounds: { nwMax: 10000000000, passiveMax: 300000000 },
  econ: { loanUnit: 1000000, autoUnit: 1000000, ddMinFee: 200000, sideReportFee: 400, tipDoodad: 5000000, doodadWealth: 0.002, band: { deal: [3000000, 600000000], monthly: [-3000000, 8000000] } },
  sites,
  systems: {
    cycle: { amp: 1.0 },
    rivals: { preset: 'HARD' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 200000,
      pool: [['site', 'סקר הקרקע ישן'], ['grid', 'החיבור לרשת עוד לא אושר סופית'], ['panels', 'הפאנלים מספק לא מוכר'], ['ppa', 'הקונה בחוזה חתם רק לחמש שנים'], ['books', 'הדוחות "לפי ההנהלה"'], ['lien', 'יש שעבוד ישן על המתקן']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { solar: 'solar_field', wind: 'wind_farm', storage: 'battery_yard', hybrid: 'solar_storage', line: 'pylon_line', h2: 'h2_pilot', slot: 'grid_slot', site: 'desert_plot',
    building: 'solar_field', stake: 'solar_field', side: 'solar_field', biz: 'solar_field' },
  kinds: {
    solar: { label: 'שדה סולארי', debtLabel: 'מימון פרויקט' }, wind: { label: 'חוות רוח', debtLabel: 'מימון פרויקט' }, storage: { label: 'אגירת סוללות', debtLabel: 'מימון פרויקט' }, hybrid: { label: 'סולארי עם אגירה', debtLabel: 'מימון פרויקט' },
    line: { label: 'קו הולכה', debtLabel: 'הלוואה' }, h2: { label: 'פיילוט מימן', debtLabel: 'הלוואה' }, slot: { label: 'חיבור לרשת', debtLabel: 'הלוואה' }, site: { label: 'קרקע לפרויקט', debtLabel: 'הלוואה' },
    building: { label: 'נכס', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'gridEng', gender: 'f', age: 41, family: { partner: 'married', kids: 2 }, name: 'מהנדסת רשת', icon: 'bolt', maxMonths: 84, stars: { t2: 68, t3: 56 },
      desc: 'ליאור מכירה כל תחנת משנה בנגב. יש לה שדה סולארי בהיתרים עם חיבור לרשת שכבר אושר — אבל ההון שלה הוא הקטן ביותר.',
      pros: ['רואה טווח צר יותר של תפוקת אתר', 'בקשת חיבור לתור זולה ב־25%', 'מתחילה עם פרויקט שכבר מחובר לרשת'],
      cons: ['ההון הקטן ביותר'],
      salary: 42000, cash: 25000000,
      expenses: [['משכנתא', 9000], ['רכב', 4000], ['אוכל ושוטף', 10000], ['ילדים', 6000], ['ביטוחים ושוטף', 4000]],
      assets: [P({ ...sites[1], mw: 30, capex: 99000000 }, { n: 'השדה של ליאור', d: 'שדה של 30 מגה־ואט בערבה, בהיתרים, עם חיבור לרשת שליאור השיגה.', fateIdx: 0, slotNow: true })] },
    { id: 'infraFund', gender: 'm', age: 50, family: { partner: 'married', kids: 3 }, name: 'מנהל קרן תשתיות', icon: 'briefcase', maxMonths: 84, stars: { t2: 68, t3: 56 },
      desc: 'דוד מנהל קרן של ₪60 מיליון. הבנקים אוהבים אותו — אבל המשקיעים בקרן מחכים לחלוקה כל שנה, בלי קשר למה שנבנה.',
      pros: ['מימון מחדש עד 80% מהשווי (לא 75%)', 'הכי הרבה הון בהתחלה'],
      cons: ['לחץ משקיעים: כל 12 חודשים חלוקה של 6% מההון (יציאת מזומן חובה)', 'אין פרויקטים ואין חיבורים לרשת'],
      salary: 55000, cash: 60000000,
      expenses: [['משכנתא', 13000], ['רכב', 5000], ['אוכל ושוטף', 12000], ['ילדים', 8000], ['ביטוחים ושוטף', 7000]] },
    { id: 'kibbutz', gender: 'm', age: 60, family: { partner: 'married', kids: 3 }, name: 'קיבוץ בערבה', icon: 'sun', maxMonths: 84, stars: { t2: 68, t3: 56 },
      desc: 'לקיבוץ יש אדמה לשני פרויקטים ותמיכה של המועצה. אבל הקופה קטנה, וכל פרויקט צריך הצבעה של האספה — שלוקחת זמן.',
      pros: ['קרקע בלי עלות לשני פרויקטים (נספרת כהון עצמי)', 'תמיכה מקומית: היתרים מהר יותר ב־20%'],
      cons: ['הצבעה של האספה מעכבת כל פרויקט ב־1–3 חודשים', 'מעט מזומן'],
      salary: 30000, cash: 10000000,
      expenses: [['שוטף הבית', 7000], ['רכב', 3000], ['אוכל ושוטף', 9000], ['משפחה', 6000], ['ביטוחים ושוטף', 3000]],
      assets: [SITE({ ...sites[7], n: 'השטח המזרחי של הקיבוץ' }, { n: 'השטח המזרחי', d: 'אדמה של הקיבוץ לשדה של 40 מגה־ואט.', fateIdx: 0 }), SITE({ ...sites[5], n: 'השטח ליד הרפת' }, { n: 'השטח ליד הרפת', d: 'מקום לאגירה של 25 מגה־ואט.', fateIdx: 1 })] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד — להון העצמי של הפרויקט הבא.' },

  deals: [
    SLOT(4000000, 'חיבור לרשת בתחנת המשנה', 'מנהל הרשת משחרר חיבור אחד. יזמים אחרים רוצים אותו.'),
    SLOT(3000000, 'חיבור לרשת בערבה', 'חיבור בקו ישן ליד הגבול. זול — וגם אחרים שמו לב.'),
    SLOT(5000000, 'חיבור לרשת ליד אשלים', 'חיבור חזק ליד תחנת הכוח. יקר, ומבוקש.'),
    { k: 'solar', n: 'תחנה סולארית פועלת למכירה', d: 'שדה של 40 מגה־ואט בחוזה PPA, פועל שלוש שנים. התפוקה ידועה — והמחיר בהתאם.', cost: 175000000, down: 52000000, value: 173000000, cf: 500000,
      op: { ck: 'plant', tech: 'solar', mw: 40, offtake: 'ppa', ppa: 255, q: 1, life: 204 }, q: 'תחנה שעובדת: אין סיכון בנייה. כמה נשאר אחרי החזר החוב — וכמה אפשר לממן מחדש?' },
    { k: 'line', n: 'חלק בקו הולכה', d: 'נתח בקו מתח עליון חדש. תשואה מפוקחת וקבועה, בלי מזג אוויר.', cost: 60000000, down: 15000000, value: 65000000, cf: 66000,
      op: { ck: 'line', tech: 'line', mw: 0, reg: 450000, opex: 30000, life: 300 }, q: 'תשואה קטנה ויציבה. הבנק מלווה כנגדה הרבה — למה?' },
    { k: 'h2', n: 'פיילוט מימן ירוק', d: 'מיזם חדשני שכולם מדברים עליו. שורף כסף כל חודש — ואולי יום אחד יהיה שווה הון.', cost: 12000000, down: 12000000, value: 12000000, cf: -90000,
      op: { ck: 'h2', burn: 90000, months: 18, payoff: 90000000, p: 0.1 }, q: 'הרבה הייפ, תזרים שלילי, וסיכוי קטן לזכייה גדולה. כמה מזה הון עצמי לתחנה הבאה?' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'פיזור רחב — ונזיל.' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד לשלב הבא.' },
  ],
  goldenChance: 1 / 30,
  golden: [
    { k: 'solar', n: 'תחנה בחוזה PPA ממוכר בקשיים', d: 'יזם שנתקע מוכר שדה פועל של 50 מגה־ואט בחוזה PPA — בהנחה גדולה.', cost: 130000000, down: 40000000, value: 210000000, cf: 750000,
      op: { ck: 'plant', tech: 'solar', mw: 50, offtake: 'ppa', ppa: 255, q: 1, life: 220 } },
  ],

  doodads: [
    { n: 'רכב שטח חדש', aMult: 0.6, inst: true, q: 'רכב יפה. כמה חודשי ריבית על הלוואת בנייה הוא עולה?' },
    { n: 'כנס אנרגיה באירופה', aMult: 0.4, q: 'נסיעה מעניינת. האם היא הביאה חיבור לרשת?' },
    { n: 'משרד מעוצב בתל אביב', aMult: 1.2, inst: true, q: 'משרד יפה לא מייצר מגה־ואט.' },
    { n: 'מטוס פרטי', aMult: 1.8, inst: true, q: 'מטוס, או הון עצמי לתחנה הבאה?' },
    { n: 'חופשה משפחתית', aMult: 0.3, q: 'מגיע לך. השמש תזרח גם בלעדיך.' },
    { n: 'מזגן חדש בבית', aMult: 0.25, need: true, d: 'במדבר אין ויכוח.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'ביטוח אחריות אישית', aMult: 0.3, need: true, inst: true, d: 'חובה לכל דירקטור.', q: 'יש הוצאות שאי אפשר לדלג עליהן.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'יפה. כמו פאנל — רק בלי החשמל.' },
  ],

  market: [
    { mk: 'rate', dr: 1, n: 'בנק ישראל מעלה את הריבית', d: 'הריבית עולה באחוז: ההחזרים מתייקרים, ושווי התחנות יורד.', q: 'ריבית גבוהה: החזר גבוה יותר היום, ושווי נמוך יותר למימון מחדש.' },
    { mk: 'rate', dr: 3, n: 'זעזוע ריבית', d: 'האינפלציה הפתיעה: הריבית קופצת ב־3%. מי שמימן מחדש עד הסוף מרגיש את זה בהחזר — וגם בשווי.', q: 'הלוואה בריבית משתנה: ההחזר זז עם הריבית. כמה מרווח השארת?' },
    { mk: 'rate', dr: -1, n: 'בנק ישראל מוריד את הריבית', d: 'הריבית יורדת באחוז: ההחזרים זולים יותר, ושווי התחנות עולה.', q: 'ריבית נמוכה: רגע טוב למימון מחדש?' },
    { mk: 'rate', dr: -1.25, n: 'הורדת ריבית חדה', d: 'המשק מאט ובנק ישראל מוריד את הריבית ב־1.25%. שווי התחנות קופץ.', q: 'כשהריבית יורדת, השווי עולה — וגם המרווח למימון מחדש.' },
    { mk: 'feedin', cut: 0.1, n: 'הרגולטור מקצץ בתעריף', d: 'חוזי PPA חדשים ייחתמו ב־10% פחות. חוזים קיימים לא משתנים.', q: 'מי שחתם — נעל מחיר. מי שעוד לא — מקבל פחות.' },
    { mk: 'heat', add: 0.35, months: 1, n: 'גל חום', d: 'כל המזגנים דולקים: מחיר החשמל בשוק קופץ ב־35% החודש.' },
    { mk: 'sand', cut: 0.3, n: 'סופת חול', d: 'אבק על הפאנלים: השדות הסולאריים מייצרים 30% פחות החודש.' },
    { mk: 'curtail', cap: 0.7, months: 2, n: 'הגבלת ייצור ברשת', d: 'הרשת עמוסה: כל התחנות מוגבלות ל־70% מהתפוקה לחודשיים.' },
    { mk: 'panels', cut: 0.12, n: 'מחירי הפאנלים צונחים', d: 'פרויקטים חדשים (וכאלה שעוד בהיתרים) זולים ב־12%.' },
    { mk: 'carbon', add: 0.08, n: 'מס פחמן', d: 'הממשלה מטילה מס פחמן: מחיר החשמל בשוק עולה ב־8% — לתמיד.' },
    { mk: 'boom', mw: 600, n: 'גל של שדות סולאריים חדשים', d: 'יזמים אחרים חיברו 600 מגה־ואט סולארי: בצהריים החשמל זול יותר.', q: 'כשכולם מייצרים באותן שעות — המחיר יורד. מי מרוויח מזה?' },
    { k: 'price', tk: 'IDX', p: 115, n: 'הבורסה בשיא', d: 'קרן המדד עלתה ל־115.' },
  ],

  crises: [
    { mk: 'transformer', n: 'שנאי שרף', d: 'השנאי בתחנה הגדולה שלך נשרף: היא מנותקת לחודשיים.', q: 'תחנה אחת גדולה היא גם סיכון אחד גדול.' },
    { n: 'תביעה של שכנים', d: 'שכנים תובעים על סנוור מהפאנלים.', cash: -1000000, cashLabel: 'פשרה עם השכנים' },
    { noSalary: true, n: 'מבצע צבאי', d: 'חודש בלי משכורת. העבודה באתרים מאטה.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 1500000, title: 'החזר מענק', text: 'משרד האנרגיה החזיר מענק שנתקע: ₪1,500,000.', after: 'כסף שנכנס פעם אחת: הון עצמי לפרויקט הבא?' },
    { w: 6, kind: 'cash', amount: -900000, title: 'ערר סביבתי', text: 'ארגון סביבה הגיש ערר. עורכי דין עולים כסף.', after: 'גם בפרויקט טוב יש הוצאות לא צפויות.' },
    { w: 3, kind: 'golden', title: 'טלפון מיזם בקשיים' },
    { w: 3, kind: 'raise', amount: 10000, title: 'דירקטוריון', text: 'מינו אותך לדירקטור בחברת חשמל פרטית. המשכורת עולה ב־₪10,000 בחודש.', after: 'עוד מזומן כל חודש = עוד הון עצמי.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'תחנה מכניסה ₪2 מיליון בחודש לעשרים שנה. הריבית עולה. מה קורה לשווי שלה?', answers: ['כלום — ההכנסה לא השתנתה', 'השווי יורד: הכסף העתידי שווה פחות היום', 'השווי עולה'], correct: 1, reward: 'lesson', lesson: 'dcf_value', explain: 'שווי של הכנסה ארוכה הוא כל ההכנסות העתידיות, מהוונות בריבית. ריבית גבוהה יותר — שווי נמוך יותר.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'מימנת מחדש תחנה וקיבלת ₪40 מיליון. מה השתנה?', answers: ['כלום, זה כסף חינם', 'קיבלת הון לפרויקט הבא — וההחזר החודשי גדל, אז ההכנסה מהתחנה קטנה', 'החוב ירד'], correct: 1, reward: 'lesson', lesson: 'refinance', explain: 'מימון מחדש מחזיר הון עצמי כדי לבנות עוד. המחיר: חוב גדול יותר והחזר חודשי גדול יותר.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'למה הבנק מלווה יותר כנגד תחנה בחוזה PPA מאשר כנגד תחנה בשוק החופשי?', answers: ['כי הוא אוהב חוזים', 'כי ההכנסה קבועה וצפויה — פחות סיכון שלא יוחזר', 'הוא לא'], correct: 1, reward: 'lesson', lesson: 'ppa_merchant', explain: 'חוזה מוריד את הסיכון של המחיר. לכן הבנק מלווה יותר — ואתה מוותר על חלק מהרווח בשוק.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'עוד ועוד שדות סולאריים נבנים. מה קורה למחיר שמקבל שדה סולארי בשוק החופשי?', answers: ['עולה', 'יורד: כולם מוכרים באותן שעות בצהריים', 'לא משתנה'], correct: 1, reward: 'lesson', lesson: 'cannibalisation', explain: 'בצהריים יש עודף חשמל — והמחיר יורד. אגירה שמוכרת בערב מרוויחה דווקא מזה.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'התחנה מכניסה ₪2 מיליון בחודש, וההחזר לבנק הוא ₪1.6 מיליון. כמה זה מקרב אותך ליעד?', answers: ['₪2 מיליון', '₪400 אלף — מה שנשאר אחרי ההחזר', 'כלום'], correct: 1, reward: 'lesson', lesson: 'debt_service', explain: 'היעד סופר רק מה שנשאר אחרי שהבנק קיבל את ההחזר. חוב גדול אוכל את ההכנסה.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'עוד אין לך תחנה שעובדת. במדבר ההכנסה מגיעה רק מתחנות מחוברות — ואחרי שהבנק קיבל את ההחזר שלו.',
    dealAsk: ['כמה מזה הון עצמי לתחנה הבאה?', 'יש לך פרויקט שמחכה לחיבור לרשת?'],
    buyGood: 'תזרים בחודש רגיל: {cf}. ותזכור: הון עצמי לפרויקט הבא — לפני הכל.',
    siteAsk: ['תשתית היא כסף של היום תמורת כסף של מחר. כמה הון עצמי תצטרך, ומאיפה יגיע החיבור לרשת?', 'סקר משאבים עולה ₪250 אלף. אתר שמפיק 10% פחות — מפיק פחות עשרים שנה.'],
    siteBuy: 'ייזמת פרויקט. עכשיו: היתרים, הון עצמי — וחיבור לרשת, בלעדיו הבנק לא נכנס.',
    sitePass: 'ויתרת. פרויקט שלא התחלת לא יכול להיתקע.',
    checked: 'סקר המשאבים: האתר מפיק {lo}–{hi}% מהממוצע.',
    permitIn: '{name}: ההיתרים הגיעו. מתחילים לבנות.',
    stalledEquity: '{name} עומד: אין מזומן להון העצמי. הריבית ממשיכה לרוץ.',
    stalledSlot: '{name} עומד: בלי חיבור לרשת הבנק לא מממן את הבנייה.',
    slotIn: '{name} קיבל חיבור לרשת. הבנק מוכן לממן את הבנייה.',
    delayed: '{name}: עיכוב של {months} חודשים באתר. הריבית רצה.',
    completed: '{name} מחובר לרשת ומוכר חשמל {offtake}.',
    refied: 'מימון מחדש ל{name}: {cash} במזומן. ההחזר החודשי עכשיו {pay}.',
    lpPaid: 'המשקיעים בקרן קיבלו את החלוקה השנתית: {amount}.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. במדבר מנצחים כשבונים, ממחזרים את ההון ובונים שוב — ולא ממחזרים את כל ההכנסה עד הסוף.',
    won: '₪3.5 מיליון בחודש מהתחנות, אחרי החזר החוב. בנית, מימנת מחדש ובנית שוב.',
  },
};
