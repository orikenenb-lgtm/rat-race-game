// World 7 — רשתות המסחר ("רחוב הקניות"). Goal: net worth ₪120M AND liquidity of 4 months of the chain's fixed costs, held 3 paydays.
// Mechanic module `chain` (js/worlds/mech/chain.js): branches with a 2-month fit-out and a 6-month ramp-up, a sealed location quality per
// site (the 'R' tile; a location survey narrows it to two of three), cannibalisation inside an area, a regional manager per 6 branches
// (or every branch sells less), one pool of stock with a 2-month lead time and supplier terms, own vs franchise.
// Spec: docs/full-upgrade/worlds/w7-retail.md. Every number is TUNE (tools/sim.mjs --world-gates N w7, tools/balance-data/gates-w7.json).
//
// Lazily loaded (js/worlds/index.js ensureWorld('w7')); NOT in WORLDS (no daily rotation); not ranked until the DB migration (meta.ranked).
// minRules 6. Visuals live render-side (WORLD_STYLE.w7 in js/render/vocab.js); `theme` here only keeps legacy render code working.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import chain, { branchCard } from './mech/chain.js';

const board = ring(['OROD?LMRI', 'OMRLXO?OD', 'OROMEORLO', 'OXMRTO?MD']); // 40 tiles, paydays on the corners, 6 × 'R' (מיקום לסניף)

// A site (the R tile's offer): base = ₪ sales a month at maturity in a B location; rent and staff (₪ a month); capex (fit-out); downPct;
// prior = the public odds of the sealed location quality (the airport is always A); cyc 'counter' = an outlet (shoppers trade down in a
// recession); esc = yearly rent escalation (the cheap-lease trap).
const S = (o) => ({ downPct: 0.5, rate: 0.6, cyc: 'pro', ...o });
const sites = [
  S({ kind: 'street', n: 'חזית ברחוב ראשי', name: 'סניף ברחוב הראשי', d: 'חנות של 200 מ"ר ברחוב קניות.', base: 900000, rent: 90000, staff: 115000, capex: 2600000, prior: { A: 0.3, B: 0.45, C: 0.25 } }),
  S({ kind: 'street', n: 'פינה בשכונה מתחדשת', name: 'סניף בשכונה המתחדשת', d: 'שכונה צעירה שגדלה מהר. עוד אין הרבה חנויות.', base: 820000, rent: 75000, staff: 110000, capex: 2300000, prior: { A: 0.25, B: 0.45, C: 0.3 } }),
  S({ kind: 'mall', n: 'יחידה בקניון אזורי', name: 'סניף בקניון', d: 'קניון ותיק עם חניון מלא בסופי שבוע.', base: 1250000, rent: 165000, staff: 140000, capex: 4000000, prior: { A: 0.3, B: 0.4, C: 0.3 } }),
  S({ kind: 'outlet', n: 'חנות באאוטלט', name: 'סניף אאוטלט', d: 'מתחם אאוטלט ליד הכביש. כשהמשק נחלש — יותר אנשים קונים בזול.', base: 800000, rent: 55000, staff: 100000, capex: 1800000, cyc: 'counter', prior: { A: 0.2, B: 0.5, C: 0.3 } }),
  S({ kind: 'airport', n: 'דוכן בנמל התעופה', name: 'סניף בנמל התעופה', d: 'המיקום הכי טוב בארץ — והשכירות הכי גבוהה.', base: 1500000, rent: 340000, staff: 160000, capex: 6000000, fixedLoc: 'A' }),
  S({ kind: 'mall', n: 'חנות עוגן בקניון חדש', name: 'סניף בקניון החדש', d: 'הסוכן מבטיח: "הקניון החדש יהיה הכי חזק באזור". עוד לא נפתח.', base: 1300000, rent: 150000, staff: 140000, capex: 4500000, prior: { A: 0.15, B: 0.25, C: 0.6 } }),
  S({ kind: 'street', n: 'שכירות זולה ברחוב צדדי', name: 'סניף ברחוב הצדדי', d: 'שכירות נמוכה מאוד בשנה הראשונה. בחוזה: עלייה של 5% כל שנה.', base: 760000, rent: 52000, staff: 100000, capex: 2000000, esc: 0.05, prior: { A: 0.2, B: 0.45, C: 0.35 } }),
  S({ kind: 'street', n: 'סניף במרכז העיר', name: 'סניף במרכז העיר', d: 'מדרחוב במרכז העיר. הרבה תנועה, הרבה מתחרים.', base: 1000000, rent: 115000, staff: 120000, capex: 3000000, prior: { A: 0.35, B: 0.4, C: 0.25 } }),
];

// a branch the character already owns / franchises (trading: openAt 0, mature)
const B = (o) => ({ k: o.kind || 'hood', n: o.n, d: o.d || '', cost: o.capex || 0, down: o.down ?? o.capex ?? 0, value: 0, cf: 0,
  op: { ck: 'branch', kind: o.kind || 'hood', loc: o.loc, area: o.area, base: o.base, rent: o.rent || 0, staff: o.staff || 0, capex: o.capex || Math.round(o.base * 3), rate: 0.6, own: o.own !== false, fq: o.fq ?? null, cyc: 'pro', esc: 0, count: o.count || 1, age: 12, openAt: 0, surveyed: true, start: true } });

export default {
  id: 'w7', order: 7, name: 'רשתות המסחר', mechanic: 'chain', minRules: 6, mech: [chain],
  tagline: 'יש לך כמה חנויות שמצליחות. כל יועץ אומר לפתוח עוד שלושים. כל סניף חדש בולע מלאי, שכירות ומנהל — ומרוויח רק אחרי חצי שנה.',
  goalLabel: 'שווי נקי של ₪120 מיליון וגם קופה של 4 חודשי עלויות קבועות',
  lesson: 'צמיחה אוכלת מזומן. כל סניף חדש צריך הון, מלאי, מנהל וזמן. רשת רווחית יכולה לפשוט רגל אם היא גדלה מהר יותר מהקופה שלה.',
  story: 'יצאת מהמירוץ, ועכשיו אתה בונה רשת. ברחוב הקניות כל מיקום נראה טוב בערב יפה — אבל רשתות לא נופלות מהפסד, הן נופלות ממחסור במזומן. המטרה: רשת ששווה ₪120 מיליון, עם קופה שמחזיקה ארבעה חודשים של שכירות ומשכורות.',
  theme: { // legacy render fields only; the real look is WORLD_STYLE.w7 (render lane)
    sky: ['#2b2d42', '#ef8354'], fog: '#3d3a4b', board: '#efe6dd', boardEdge: '#9b1c24', center: '#f5efe8', accent: '#e63946',
    light: { hemiSky: '#ffd6b8', hemiGround: '#5c4b51', sun: '#ffb38a' }, decor: 'storefronts',
  },
  board,
  tiles: tilesFor(board, { R: { name: 'מיקום לסניף' }, X: { name: 'משבר בקמעונאות' }, M: { name: 'השוק' } }),
  loan: { unit: 200000, autoUnit: 200000, pct: 1.2, cap: 5, bankrupt: 60 },
  creditPct: 3,
  sideReportFee: 400,
  goal: { type: 'all', hold: 3, of: [{ type: 'nw', target: 120000000 }, { type: 'liquidity', months: 4, label: 'קופה: חודשי עלויות קבועות של הרשת' }] },
  maxMonths: 72,
  stars: { t2: 58, t3: 46 },
  start: {},
  doodadWealth: 0.002,
  tipDoodad: 3000000,
  bounds: { nwMax: 5000000000, passiveMax: 200000000 },
  econ: { loanUnit: 200000, autoUnit: 200000, ddMinFee: 30000, sideReportFee: 400, tipDoodad: 3000000, doodadWealth: 0.002, band: { deal: [400000, 40000000], monthly: [-500000, 3000000] } },
  sites,
  systems: {
    cycle: { amp: 1.0 },
    rivals: { preset: 'NORMAL' },
    dd: { prior: [0.30, 0.32, 0.24, 0.14], cf: 'CF_HARD', vf: 'VF_HARD', minFee: 30000,
      pool: [['lease', 'חוזה השכירות מסתיים בעוד שנתיים'], ['staff', 'מנהלי הסניפים עוזבים עם המוכר'], ['stock', 'חצי מהמלאי ישן'], ['books', 'הרווח "לפי ההנהלה" — אין דוחות מבוקרים'], ['area', 'מתחרה פותח בקרבת מקום'], ['supplier', 'הספק הראשי מעלה מחירים']] },
    focus: { scoutInspect2Mult: 0.5 },
  },
  chains: { exclude: [] },
  models: { street: 'store_street', mall: 'store_mall', outlet: 'store_outlet', airport: 'store_airport', hood: 'store_street', pack: 'store_mall', inventory: 'stock_pallets', dc: 'warehouse', ecom: 'ecom_hub', manager: 'regional_office', warehouse: 'warehouse', stake: 'store_mall', side: 'store_street', biz: 'store_street' },
  kinds: {
    street: { label: 'סניף רחוב', debtLabel: 'הלוואת ציוד' }, mall: { label: 'סניף בקניון', debtLabel: 'הלוואת ציוד' }, outlet: { label: 'סניף אאוטלט', debtLabel: 'הלוואת ציוד' }, airport: { label: 'סניף בנמל התעופה', debtLabel: 'הלוואת ציוד' },
    hood: { label: 'חנות שכונתית', debtLabel: 'הלוואת ציוד' }, pack: { label: 'רשת מתחרה', debtLabel: 'הלוואה' }, inventory: { label: 'מלאי', debtLabel: 'חוב לספקים' },
    dc: { label: 'מרכז הפצה', debtLabel: 'משכנתא' }, ecom: { label: 'אתר מכירות', debtLabel: 'הלוואה' }, warehouse: { label: 'נכס מניב', debtLabel: 'משכנתא' }, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' }, biz: { label: 'עסק', debtLabel: 'הלוואה' }, stake: { label: 'שותפות', debtLabel: 'הלוואה' },
  },
  tickers: { IDX: { ...INDEX_TICKER, model: null } },

  characters: [
    { id: 'shopFounder', gender: 'f', age: 38, family: { partner: 'married', kids: 2 }, name: 'מייסדת הרשת', icon: 'shop', maxMonths: 66, stars: { t2: 54, t3: 47 }, managers: 0,
      desc: 'שלוש חנויות שכונתיות שהלקוחות אוהבים, ומותג חזק. אין מנהלים, והקופה קטנה — כל סניף חדש הוא הימור על המזומן.',
      pros: ['מותג חזק: סניף חדש מתחיל ממכירות גבוהות יותר', 'שלוש חנויות רווחיות כבר עכשיו'],
      cons: ['אין מנהלי אזור: את מנהלת לבד עד 3 סניפים', 'קופה קטנה'],
      salary: 30000, cash: 3000000,
      expenses: [['משכנתא', 8500], ['רכב', 3500], ['אוכל ושוטף', 9000], ['ילדים וחוגים', 6500], ['ביטוחים', 4500]],
      assets: [B({ n: 'החנות הראשונה', d: 'החנות שבה הכל התחיל.', base: 520000, rent: 50000, staff: 80000, capex: 1600000, down: 400000, loc: 'A', area: 0 }),
        B({ n: 'החנות בשכונה', base: 520000, rent: 50000, staff: 80000, capex: 1600000, down: 400000, loc: 'B', area: 0 }),
        B({ n: 'החנות במרכז המסחרי', base: 520000, rent: 50000, staff: 80000, capex: 1600000, down: 400000, loc: 'B', area: 1 })] },
    { id: 'cfo', gender: 'm', age: 45, family: { partner: 'married', kids: 3 }, name: 'סמנכ"ל כספים לשעבר', icon: 'chart', maxMonths: 72, stars: { t2: 56, t3: 46 }, managers: 0,
      desc: 'הרבה מזומן ואפס סניפים. יודע בדיוק כמה הון חוזר כל סניף בולע, והבנק והספקים סומכים עליו. אבל אין לו מותג.',
      pros: ['רואה את ההון החוזר המדויק שכל פתיחה צריכה', 'ריבית בנק נמוכה ב־0.3% בחודש', 'אשראי ספקים ל־60 יום בלי תוספת מחיר'],
      cons: ['אין מותג: סניפים חדשים מתחילים לאט יותר', 'מתחיל מאפס סניפים'],
      salary: 40000, cash: 14000000,
      expenses: [['משכנתא', 12000], ['רכב', 4500], ['אוכל ושוטף', 11000], ['ילדים וחוגים', 9000], ['ביטוחים ושוטף', 6500]] },
    { id: 'franchisor', gender: 'm', age: 50, family: { partner: 'married', kids: 2 }, name: 'זכיין גדול', icon: 'handshake', maxMonths: 80, stars: { t2: 74, t3: 64 }, managers: 0,
      desc: 'שמונה סניפי זכיינות משלמים לך תמלוגים כל חודש, בלי מלאי ובלי שכירות. אבל האיכות לא בידיים שלך — וזכיין גרוע פוגע בכל הרשת.',
      pros: ['הכנסה קבועה מתמלוגים', 'מערכת זכיינות קיימת: כל מיקום אפשר לתת לזכיין', 'הזכיינים שלו משלמים 8% מהמכירות (אצל אחרים 6%)'],
      cons: ['לא שולט באיכות: זכיין גרוע פוגע במותג', 'לקנות סניף בחזרה מזכיין עולה פי 4 מהתמלוג השנתי'],
      salary: 20000, cash: 2500000,
      expenses: [['משכנתא', 11000], ['רכב', 4500], ['אוכל ושוטף', 10000], ['ילדים וחוגים', 6000], ['ביטוחים ושוטף', 6000]],
      assets: [
        B({ n: 'זכיינות בחולון', base: 400000, loc: 'B', area: 0, own: false, fq: 0.55 }), B({ n: 'זכיינות בבת ים', base: 400000, loc: 'C', area: 6, own: false, fq: 0.5 }),
        B({ n: 'זכיינות ברמת גן', base: 400000, loc: 'A', area: 1, own: false, fq: 0.7 }), B({ n: 'זכיינות בגבעתיים', base: 400000, loc: 'B', area: 7, own: false, fq: 0.3 }),
        B({ n: 'זכיינות בפתח תקווה', base: 400000, loc: 'B', area: 2, own: false, fq: 0.6 }), B({ n: 'זכיינות בראשון', base: 400000, loc: 'A', area: 3, own: false, fq: 0.45 }),
        B({ n: 'זכיינות ברחובות', base: 400000, loc: 'B', area: 4, own: false, fq: 0.65 }), B({ n: 'זכיינות בנס ציונה', base: 400000, loc: 'C', area: 9, own: false, fq: 0.5 })] },
  ],

  starterDeal: { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף שעובד בצד — ונזיל ביום שצריך.' },

  deals: [
    branchCard({ k: 'street', n: 'סניף ברחוב קניות ותיק', d: 'חנות פנויה ברחוב שאתה מכיר: מיקום סביר, בלי הפתעות. שיפוץ של חודשיים.', base: 880000, rent: 85000, staff: 110000, capex: 2500000, area: 6, q: 'מיקום ידוע ומספרים של המוכר. כמה כרית תישאר לך לחצי השנה הראשונה?' }),
    branchCard({ k: 'mall', n: 'סניף בקניון השכונתי', d: 'קניון קטן ויציב, חוזה ל־5 שנים.', base: 1100000, rent: 140000, staff: 125000, capex: 3500000, area: 7 }),
    branchCard({ k: 'outlet', n: 'סניף באאוטלט שבשולי העיר', d: 'אאוטלט מוכר. כשהמשק נחלש — יותר אנשים קונים בזול.', base: 780000, rent: 55000, staff: 95000, capex: 1800000, cyc: 'counter', area: 8 }),
    branchCard({ k: 'street', n: 'סניף ליד תחנת הרכבת', d: 'הרבה עוברים ושבים. המוכר מבטיח מכירות יפות.', base: 950000, rent: 100000, staff: 115000, capex: 2800000, area: 9 }),
    branchCard({ k: 'street', n: 'סניף בעיר שכנה', d: 'עיר שאין בה אף סניף שלך. המוכר מספר על ביקוש גדול.', base: 850000, rent: 80000, staff: 110000, capex: 2400000, area: 4 }),
    { k: 'dc', n: 'מרכז הפצה', d: 'מחסן מרכזי שמספק לכל הסניפים: 2% פחות על כל הסחורה. עלות תפעול ₪150 אלף בחודש.', cost: 12000000, down: 3600000, value: 11000000, cf: -190000, op: { ck: 'dc', rate: 0.35 }, q: 'חיסכון של 2% על הסחורה. כמה סניפים צריך כדי שזה ישתלם?' },
    { k: 'ecom', n: 'פלטפורמת סחר מקוון', d: 'אתר ואפליקציה לכל הרשת: עוד 8% מהרווח הגולמי של הסניפים, אחרי 9 חודשי הרצה.', cost: 4000000, down: 1200000, value: 2000000, cf: -140000, op: { ck: 'ecom', rate: 0.6 }, q: 'עלות קבועה של ₪120 אלף בחודש — ותשעה חודשים עד שהאתר מגיע לקצב. כמה סניפים צריך כדי שזה יחזיר?' },
    { k: 'pack', n: 'רשת מתחרה למכירה', d: 'רשת של 6 סניפים שהבעלים שלה פורש. מכירות מהיום הראשון — וגם 6 סניפים לנהל מהיום הראשון.', cost: 24000000, down: 8000000, value: 0, cf: 600000,
      op: { ck: 'branch', kind: 'pack', loc: 'B', area: 5, base: 800000, rent: 75000, staff: 105000, capex: 2000000, rate: 0.55, own: true, cyc: 'pro', esc: 0, count: 6, age: 12, openAt: 0, surveyed: true, start: true }, q: 'שישה סניפים בבת אחת: כמה מנהלי אזור יש לך?' },
    { k: 'warehouse', n: 'מבנה מסחרי מושכר', d: 'מושכר לסופרמרקט בחוזה ארוך.', cost: 8000000, down: 2400000, cf: 45000, value: 8000000, grow: 0.002, q: 'תשואה צנועה ויציבה. מתי זה עדיף על סניף נוסף?' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'פיזור רחב — ונזיל.' },
    { k: 'stock', tk: 'IDX', p: 100, n: 'קרן מדד ב־100', d: 'כסף בצד שאפשר למכור ביום אחד.' },
  ],
  goldenChance: 1 / 30,
  golden: [
    { k: 'street', n: 'חוזה של מתחרה שנסגר', d: 'מתחרה סגר סניף במיקום מצוין. החוזה עובר אליך — עם המדפים.', cost: 1400000, down: 700000, value: 0, cf: 150000,
      op: { ck: 'branch', kind: 'street', loc: 'A', area: 2, base: 900000, rent: 90000, staff: 115000, capex: 1400000, rate: 0.6, own: true, cyc: 'pro', esc: 0, count: 1, age: 0, surveyed: true } },
  ],

  doodads: [
    { n: 'רכב מנהלים', aMult: 0.6, inst: true, q: 'רכב יפה. כמה חודשי שכירות של סניף הוא עולה?' },
    { n: 'כנס זכיינים בחו"ל', aMult: 0.4, q: 'הזכיינים נהנו. השאלה אם המכירות נהנו.' },
    { n: 'משרד הנהלה מעוצב', aMult: 1.2, inst: true, q: 'משרד יפה לא מוכר אף פריט.' },
    { n: 'יאכטה', aMult: 1.8, inst: true, q: 'מה עדיף: יאכטה, או קופה לחורף?' },
    { n: 'חופשה משפחתית', aMult: 0.3, q: 'מגיע לך. רק תדאג שמישהו מזמין סחורה לחגים.' },
    { n: 'תיקון גג בבית', aMult: 0.25, need: true, d: 'נזילה בחורף. אין ויכוח.', q: 'הוצאה הכרחית. בשבילה שומרים כרית.' },
    { n: 'ביטוח אחריות אישית', aMult: 0.3, need: true, inst: true, d: 'חובה לכל דירקטור.', q: 'יש הוצאות שאי אפשר לדלג עליהן.' },
    { n: 'שעון יוקרה', aMult: 0.15, q: 'יפה. כמו מדף מלא בחגים — רק בלי הרווח.' },
  ],

  market: [
    { mk: 'supplier', pct: 0.03, months: 6, n: 'הספק מעלה מחירים', d: 'הספק הראשי מעלה מחירים ב־3% לחצי שנה. הרווח הגולמי של כל הסניפים יורד.', q: 'כשהמרווח דק, 3% על הסחורה הם הרבה מהרווח.' },
    { mk: 'ship', months: 1, n: 'עיכוב במשלוחים', d: 'אוניות נתקעו בתעלה: סחורה שמוזמנת החודש מגיעה חודש מאוחר יותר.', q: 'מלאי ביטחון עולה כסף כל חודש — וביום כזה הוא שווה זהב.' },
    { mk: 'viral', add: 0.3, months: 2, n: 'מוצר ויראלי', d: 'מוצר שלך התפוצץ ברשתות: הביקוש בכל הסניפים קופץ ב־30% לחודשיים — אם יש סחורה על המדף.', q: 'מדף ריק מוכר אפס. כמה מלאי יש לך?' },
    { mk: 'mall', drop: 0.3, months: 6, n: 'הקניונים מתרוקנים', d: 'אחרי פתיחת מרכז ענק מחוץ לעיר — במיקומים החלשים התנועה יורדת ב־30% לחצי שנה.' },
    { mk: 'wage', pct: 0.04, n: 'שכר המינימום עולה', d: 'שכר המינימום עלה: עלויות השכר בכל הסניפים עולות ב־4% — לתמיד.', q: 'עלות קבועה שעולה לכל הסניפים בבת אחת — זה מה שעושה רשת גדולה לרגישה.' },
    { mk: 'credit', months: 6, n: 'ביטוח האשראי מקצץ', d: 'חברת ביטוח האשראי קיצצה את המסגרות: הספקים דורשים תשלום אחרי 30 יום לחצי שנה.', q: 'אשראי ספקים הוא הון חוזר בחינם — עד שלוקחים אותו.' },
    { mk: 'rival', n: 'מתחרה פותח לידך', d: 'רשת מתחרה פותחת סניף באזור שבו יש לך הכי הרבה סניפים. כל סניף שם מוכר פחות.' },
    { k: 'price', tk: 'IDX', p: 115, n: 'הבורסה בשיא', d: 'קרן המדד עלתה ל־115.' },
  ],

  crises: [
    { mk: 'scandal', n: 'סערה ברשתות החברתיות', d: 'סרטון מסניף של זכיין הפך ויראלי. המותג נפגע.', q: 'זכיין לוקח את המותג שלך לעבודה. מי בודק אותו?' },
    { n: 'פריצה למחסן', d: 'הביטוח מכסה רק חלק.', cash: -300000, cashLabel: 'הנזק שהביטוח לא מכסה' },
    { noSalary: true, n: 'מבצע צבאי', d: 'חודש בלי משכורת. הקניונים ריקים.' },
  ],

  mystery: [
    { w: 8, kind: 'cash', amount: 500000, title: 'החזר מס', text: 'החזר מס על השקעה בציוד: ₪500,000.', after: 'כסף שנכנס פעם אחת: קופה, חוב, או סניף?' },
    { w: 6, kind: 'cash', amount: -300000, title: 'תביעה של לקוח', text: 'לקוח תובע על מוצר פגום. עורכי דין עולים כסף.', after: 'גם ברשת מצליחה יש הוצאות לא צפויות. כרית — תמיד.' },
    { w: 3, kind: 'golden', title: 'טלפון מבעל נכס' },
    { w: 3, kind: 'raise', amount: 8000, title: 'דירקטוריון', text: 'מינו אותך לדירקטור ברשת שכנה. המשכורת עולה ב־₪8,000 בחודש.', after: 'עוד מזומן כל חודש = עוד כרית לפתיחה הבאה.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הרשת מרוויחה ₪500 אלף בחודש, ובכל זאת חסר לה מזומן. למה זה יכול לקרות?', answers: ['זה לא יכול לקרות', 'כי הכסף יושב במלאי, בשיפוצים ובסניפים חדשים שעוד מפסידים', 'כי הרווח מזויף'], correct: 1, reward: 'lesson', lesson: 'growth_cash', explain: 'רווח הוא לא מזומן. כל סניף חדש בולע שיפוץ, מלאי וחודשי הפסד — רשת שגדלה מהר יכולה להיתקע בלי כסף גם כשהיא רווחית.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'יש לך 9 סניפים ומנהל אזור אחד. מה קורה?', answers: ['כלום', 'יותר סניפים ממה שאפשר לנהל: כל הסניפים מוכרים פחות, גם הוותיקים', 'רק הסניף החדש נפגע'], correct: 1, reward: 'lesson', lesson: 'management_span', explain: 'מנהל אזור מחזיק בערך 6 סניפים, ואת מחזיקה עוד 3. מעבר לזה כולם נפגעים: תורים, מדפים ריקים, עובדים שעוזבים.' },
    { w: 4, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'הסחורה מגיעה חודשיים אחרי ההזמנה, והחגים בעוד חודשיים. מתי מזמינים?', answers: ['כשהחגים מתחילים', 'עכשיו — ויותר מהרגיל', 'אחרי החגים, כשזול'], correct: 1, reward: 'lesson', lesson: 'inventory_cover', explain: 'עם זמן אספקה של חודשיים, ההחלטה על החגים נעשית חודשיים לפני. מעט מדי מלאי — מדפים ריקים; יותר מדי — הנחות על סחורה ישנה.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'זכיין פותח בכסף שלו ומשלם לך 6% מהמכירות. מה המחיר?', answers: ['אין מחיר', 'רווח קטן יותר מכל סניף, ואיכות שלא בשליטתך', 'הוא לוקח את כל הרווח'], correct: 1, reward: 'lesson', lesson: 'own_franchise', explain: 'זכיינות היא צמיחה בלי הון ובלי מלאי. בתמורה מקבלים חלק קטן מהרווח — וזכיין גרוע פוגע במותג של כולם.' },
    { w: 3, kind: 'quiz', title: 'שאלת אבא עשיר', text: 'סניף חדש הפסיד בשלושת החודשים הראשונים. מה זה אומר?', answers: ['שצריך לסגור אותו', 'כלום עדיין: סניף חדש צריך חצי שנה כדי להגיע למכירות מלאות', 'שהמיקום גרוע'], correct: 1, reward: 'lesson', lesson: 'ramp_up', explain: 'לקוחות לומדים להכיר סניף לאט. בחצי השנה הראשונה הוא מוכר פחות ועולה כמעט אותו דבר — ולכן כל פתיחה צריכה כרית.' },
  ],

  mentor: {
    ...MENTOR,
    start: 'התפקיד שלך: {who}. כאן היעד: {goal}. כל חודש עכשיו: {cf}.',
    payday0: 'עוד אין לך סניף שמוכר. ברשתות המסחר השווי נבנה מסניפים — אבל הקופה היא מה ששומר עליהם.',
    paydayNW: 'השווי של הרשת: {nw}. היעד: {target}. ותזכור את הקופה: ארבעה חודשים של שכירות ומשכורות.',
    dealAsk: ['כמה מזומן זה בולע עד שזה מרוויח?', 'מי ינהל את זה — ויש לך מנהל פנוי?'],
    buyGood: 'בחודש רגיל: {cf} בחודש, {roi} בשנה על ההון. ותזכור: מלאי ושכירות משלמים גם בחודש חלש.',
    siteAsk: ['סניף חדש בולע מזומן חצי שנה לפני שהוא מרוויח. כמה כרית תישאר לך?', 'סקר מיקום עולה ₪30 אלף. פתיחה במיקום חלש עולה מיליונים.'],
    siteOwn: 'חתמת. חודשיים של שיפוץ — שכירות ושכר בלי מכירות — ואחר כך חצי שנה של הרצה.',
    siteFranchise: 'זכיין פותח בכסף שלו, משלם דמי כניסה ו־6% מהמכירות. האיכות — שלו.',
    sitePass: 'ויתרת. לא כל מיקום הוא הזדמנות — וקופה מלאה היא גם החלטה.',
    surveyed: 'הסקר אומר: {locs}. עכשיו להחליט.',
    stockout: 'נגמר המלאי: הסניפים איבדו מכירות, ו־{lost} רווח הלכו למתחרים.',
    overstock: 'יותר מדי מלאי במחסנים: סחורה ישנה נמכרת בהנחה — {md} ירדו מהשווי.',
    overSpan: 'יש {n} סניפים מעבר למה שהמנהלים מסוגלים להחזיק. כל הסניפים מוכרים פחות.',
    opened: '{name} נפתח החודש. חצי שנה עד שהוא מגיע למכירות מלאות.',
    lostTime: 'נגמר הזמן — הגעת ל־{pct} מהיעד. ברשתות מנצחים עם צמיחה שהקופה עומדת בה: מנהל לכל 6 סניפים, מלאי לפני החגים, וכרית לכל פתיחה.',
    won: 'רשת ששווה ₪120 מיליון, עם קופה שמחזיקה ארבעה חודשים. צמחת — ולא נגמר לך הכסף בדרך.',
  },
};
