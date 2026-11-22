// js/finance/business.js — business management sim for "מירוץ העכברים" (owner: real-estate & business engineer).
// Teaches the one lesson most beginners miss: REVENUE ≠ PROFIT ≠ CASH ≠ MONEY IN YOUR POCKET.
//
// Pure, deterministic ES module: no DOM, no Date, no Math.random, no I/O. Never mutates its inputs — every function that
// "changes" a business returns a NEW business object (plain JSON, safe to store in the game state and to serialize).
// MONEY: every ₪ amount in state and results is an INTEGER ₪ (rounded half away from zero at each line, so P&L lines
// and cash-flow lines always add up exactly). Only + − × ÷ and rounding are used (no Math.pow/exp/log), so the results are
// bit-identical in every JS engine (browser ↔ Node server).
// RANDOMNESS: the caller passes rng: () => float in [0,1). simulate() consumes EXACTLY RNG_DRAWS (3) draws per month,
// whatever the player decided — so a seeded challenge stays fair (same seed ⇒ same luck for everyone).
// See docs/FINANCIAL_ENGINE.md → "עסקים" for the model, formulas, simplifications and the engine integration guide.

export const BIZ_VERSION = 1;
export const VAT_PCT = 18;          // מע"מ 18% (from 2025)
export const CORP_TAX = 0.23;       // מס חברות 23% on profit (with loss carry-forward)
export const DIV_TAX = 0.30;        // מס דיבידנד 30% (בעל מניות מהותי) on what the owner draws out of the company
export const CAP_GAINS = 0.30;      // capital-gains tax on selling the business: the owner holds 100% ⇒ בעל מניות מהותי 30% (like DIV_TAX)
export const RNG_DRAWS = 3;         // draws per simulated month: [demand noise, event?, which event]
export const HIST_MAX = 24;         // months of history kept in the state

/* ============================================================ money primitives */
/** Round half away from zero (same rule as finance/bank.js). */
export function rnd(x) {
  if (!Number.isFinite(x)) throw new RangeError(`business: not a finite number: ${x}`);
  const a = Math.floor(Math.abs(x) + 0.5 + 1e-9);
  return x < 0 ? -a : a;
}
/** VAT inside a VAT-inclusive price: ₪118 → ₪18. */
export const vatOf = (gross) => rnd((gross * VAT_PCT) / (100 + VAT_PCT));
/** VAT on top of a pre-VAT amount: ₪100 → ₪18. */
export const vatOn = (net) => rnd((net * VAT_PCT) / 100);
/** VAT-inclusive → net. */
export const netOf = (gross) => gross - vatOf(gross);
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Same format as engine.fmt: "₪1,234" / "−₪50". */
export function fmt(n) { const r = rnd(n); return (r < 0 ? '−' : '') + '₪' + groups(Math.abs(r)); }
const sgn = (n) => (rnd(n) > 0 ? '+' : '') + fmt(n);
const pct1 = (x) => Math.round(x * 1000) / 10;              // 0.1234 → 12.3 (display only)
const pctTxt = (x) => (x < 0 ? '−' : '') + Math.abs(x) + '%';
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const clone = (o) => JSON.parse(JSON.stringify(o));
const isInt = (x) => Number.isInteger(x);

/* ============================================================ archetypes (data) */
// All costs are PRE-VAT ₪ (the business reclaims input VAT); `price` is what the customer pays, VAT INCLUDED (B2C).
// Monthly units. stock: 'none' (pay per unit when sold) | 'fresh' (bought weekly by last month's sales, leftovers spoil)
// | 'inventory' (ordered by the player, arrives after leadTime months, slowly becomes dead stock).
// mode: 'sales' (customers per month) | 'subscription' (users accumulate, churn).
export const ARCHETYPES = {
  coffee: {
    id: 'coffee', name: 'עגלת קפה בתחנת רכבת', short: 'עגלת קפה', icon: 'coffee', model: 'business', unit: 'כוסות', unitOne: 'כוס',
    desc: 'עגלה, מכונת אספרסו ותור של נוסעים עייפים כל בוקר. אתה הבריסטה.',
    lesson: 'עסק קטן שאתה עובד בו הוא בעצם משרה. כדאי לשכור עובד רק כשהוא מכניס יותר ממה שהוא עולה.',
    mode: 'sales', stock: 'fresh', buffer: 0.10,
    startCapital: 25000, equipment: 20000, equipLife: 60,
    price: 14, elasticity: 1.6, baseDemand: 2400, unitCost: 4,
    rent: 2500, fixed: 600, royaltyPct: 0, feePct: 0.01,
    staff: 0, maxStaff: 4, wage: 7500, perStaff: 1500, ownerCap: 1800, ownerEnergy: 12,
    managerWage: 9500, managerCap: 1500, managerEnergy: 2,
    mktHalf: 1000, mktMax: 0.5, mktMaxSpend: 8000,
    cashShare: 1, arLag: 1, multiple: 1.5,
    repair: 1800, fine: 1500, eventChance: 0.25,
    events: { competitor: 3, viral: 2, costSpike: 2, inspection: 1, staffQuit: 1, bigClient: 1, holiday: 1 },
    eventText: { costSpike: 'מחירי פולי הקפה והחלב קפצו בעולם.', bigClient: 'חברת הייטק ליד התחנה הזמינה קפה לכל הצוות לחודש.' },
  },
  laundromat: {
    id: 'laundromat', name: 'מכבסה בשירות עצמי', short: 'מכבסה', icon: 'washer', model: 'business', unit: 'כביסות', unitOne: 'כביסה',
    desc: '12 מכונות שעובדות לבד, 24 שעות ביממה. הוצאות קבועות גבוהות, עלות משתנה נמוכה.',
    lesson: 'אחרי נקודת האיזון כמעט כל כביסה נוספת היא רווח (מינוף תפעולי). אבל המכונות הן התקרה — ומכונה מתקלקלת בדיוק כשהכי צריך אותה.',
    mode: 'sales', stock: 'none',
    startCapital: 120000, equipment: 100000, equipLife: 96, equipCap: 2500,
    expand: { cost: 9000, cap: 210, label: 'מכונת כביסה נוספת', max: 6 },
    price: 18, elasticity: 1.2, baseDemand: 1500, unitCost: 5,
    rent: 7000, fixed: 1500, royaltyPct: 0, feePct: 0.01,
    staff: 0, maxStaff: 2, wage: 6000, perStaff: 3000, ownerCap: 3000, ownerEnergy: 4,
    managerWage: 3000, managerCap: 3000, managerEnergy: 1,
    mktHalf: 1500, mktMax: 0.4, mktMaxSpend: 6000,
    cashShare: 1, arLag: 1, multiple: 3,
    repair: 3500, fine: 1000, eventChance: 0.22,
    events: { breakdown: 3, competitor: 2, costSpike: 2, viral: 1, holiday: 1 },
    eventText: { costSpike: 'חברת החשמל והמים עדכנו תעריפים.', breakdown: 'שתי מכונות נשרפו בגל החום.' },
  },
  toyshop: {
    id: 'toyshop', name: 'חנות צעצועים אונליין — יבוא מהמזרח הרחוק', short: 'חנות אונליין', icon: 'box', model: 'business', unit: 'הזמנות', unitOne: 'הזמנה',
    desc: 'מזמינים מכולה מהספק, מחכים חודש למשלוח, משלמים מכס ומע"מ בנמל, ומוכרים באתר. בלי פרסום — אף אחד לא יודע שאתה קיים.',
    lesson: 'קניית מלאי מוציאה מזומן היום, אבל נרשמת כהוצאה רק כשמוכרים. עסק רווחי יכול להיתקע בלי כסף בקופה.',
    mode: 'sales', stock: 'inventory', leadTime: 1, deadRate: 0.02, startStock: 600,
    shipping: 6, dutyPct: 0.12, fulfil: 14,
    startCapital: 60000, equipment: 10000, equipLife: 36,
    price: 99, elasticity: 2.0, baseDemand: 250, unitCost: 25,
    rent: 0, fixed: 1800, royaltyPct: 0, feePct: 0.03,
    staff: 0, maxStaff: 3, wage: 7000, perStaff: 900, ownerCap: 700, ownerEnergy: 10,
    managerWage: 11000, managerCap: 700, managerEnergy: 2,
    mktHalf: 4000, mktMax: 1.5, mktMaxSpend: 30000,
    cashShare: 0.5, arLag: 1, multiple: 2,
    repair: 1500, fine: 2000, eventChance: 0.25,
    events: { customsDelay: 2, costSpike: 2, platformChange: 2, competitor: 2, viral: 1, holiday: 1 },
    eventText: { costSpike: 'מחירי המכולות בים זינקו: עלות המשלוח וההובלה עלו.', competitor: 'אתר בינלאומי ענק התחיל לשלוח לישראל בחינם.' },
  },
  pizza: {
    id: 'pizza', name: 'זיכיון פיצרייה שכונתית', short: 'פיצרייה', icon: 'pizza', model: 'business', unit: 'פיצות', unitOne: 'פיצה',
    desc: 'מותג של רשת, מתכון מוכן ומשלוחים. הרשת לוקחת תמלוגים מכל מכירה — גם בחודש שהפסדת.',
    lesson: 'מחזור של מעל ₪100,000 בחודש יכול להשאיר רק אלפים בודדים. תמלוגים, שכירות ושכר נאכלים לפני שאתה רואה שקל.',
    mode: 'sales', stock: 'fresh', buffer: 0.08,
    startCapital: 250000, equipment: 180000, equipLife: 84,
    expand: { cost: 25000, cap: 500, label: 'תנור נוסף', max: 2 },
    equipCap: 3200,
    price: 60, elasticity: 1.3, baseDemand: 2400, unitCost: 14,
    rent: 18000, fixed: 6000, royaltyPct: 0.08, feePct: 0.012,
    staff: 4, maxStaff: 8, wage: 9000, perStaff: 600, ownerCap: 700, ownerEnergy: 14,
    managerWage: 13000, managerCap: 600, managerEnergy: 3,
    mktHalf: 4000, mktMax: 0.35, mktMaxSpend: 20000,
    cashShare: 0.7, arLag: 1, multiple: 2.5,
    repair: 6000, fine: 4000, eventChance: 0.25,
    events: { competitor: 3, inspection: 2, costSpike: 2, staffQuit: 2, bigClient: 1, breakdown: 1, holiday: 1 },
    eventText: { costSpike: 'מחירי הגבינות והקמח עלו.', bigClient: 'בית הספר השכונתי הזמין פיצות לכל אירועי סוף השנה.', breakdown: 'התנור הראשי נשבר באמצע שישי בערב.' },
  },
  app: {
    id: 'app', name: 'אפליקציית כושר במנוי חודשי', short: 'אפליקציה', icon: 'rocket', model: 'business', unit: 'מנויים', unitOne: 'מנוי',
    desc: 'סטארט־אפ: מפתחים יקרים, הכנסות קטנות שגדלות לאט, וחנות האפליקציות לוקחת 15%. הכול תלוי בכמה זמן הכסף יחזיק.',
    lesson: 'סטארט־אפ שורף כסף כל חודש עד שהמנויים מכסים את ההוצאות. מה שקובע: קצב השריפה, כמה חודשים נשארו (מסלול), וכמה שווה כל מנוי מול כמה עולה להביא אותו.',
    mode: 'subscription', stock: 'none', startUsers: 200, baseNew: 60, churn: 0.08,
    startCapital: 250000, equipment: 0, equipLife: 1,
    price: 30, elasticity: 1.2, unitCost: 3,
    rent: 3000, fixed: 4000, royaltyPct: 0, feePct: 0.15,
    staff: 1, maxStaff: 6, wage: 22000, perStaff: 0, ownerCap: 0, ownerEnergy: 16,
    managerWage: 30000, managerCap: 0, managerEnergy: 4,
    mktHalf: 15000, mktMax: 400, mktMaxSpend: 60000,
    cashShare: 1, arLag: 1, multiple: 4, revMultiple: 3,
    repair: 3000, fine: 2000, eventChance: 0.25,
    events: { viral: 2, platformChange: 2, competitor: 2, staffQuit: 2, bigClient: 1 },
    eventText: { competitor: 'חברת ענק השיקה אפליקציה דומה — בחינם.', bigClient: 'חברה גדולה קנתה מנוי לכל העובדים שלה.', staffQuit: 'המפתחת הכי טובה שלך קיבלה הצעה שאי אפשר לסרב לה.' },
  },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);
export function archetypeList() {
  return ARCHETYPE_IDS.map((id) => { const a = ARCHETYPES[id]; return { id, name: a.name, short: a.short, icon: a.icon, model: a.model, desc: a.desc, lesson: a.lesson, startCapital: a.startCapital, price: a.price, unit: a.unit, mode: a.mode }; });
}

/* ============================================================ events (data) */
// Every event is plain data. Effects live in business.effects [{id, kind, mult, until}] (JSON-safe).
export const EVENTS = {
  competitor: { title: 'מתחרה חדש נפתח קרוב', text: 'חלק מהלקוחות הולכים לנסות אותו.', demand: 0.82, months: 6 },
  viral: { title: 'ביקורת ויראלית', text: 'מישהו העלה סרטון עליך וכולם רוצים לנסות.', demand: 1.35, months: 1 },
  costSpike: { title: 'הספקים העלו מחירים', text: 'עלות המוצר עלתה.', cost: 1.15, months: 3 },
  breakdown: { title: 'תקלה בציוד', text: 'חלק מהציוד מושבת לחודש, והתיקון לא זול.', cap: 0.7, months: 1, oneOff: 'repair' },
  inspection: { title: 'ביקורת תברואה', text: 'הפקח מצא ליקויים: קנס ותיקונים.', oneOff: 'fine' },
  staffQuit: { title: 'עובד עזב בלי הודעה', text: 'נשארת עם פחות ידיים.', staff: -1 },
  customsDelay: { title: 'עיכוב במכס', text: 'המשלוח שבדרך תקוע בנמל עוד חודש.', delay: 1 },
  platformChange: { title: 'הפלטפורמה שינתה את האלגוריתם', text: 'פחות אנשים רואים אותך בחיפוש.', demand: 0.85, months: 3 },
  bigClient: { title: 'הזמנה גדולה', text: 'לקוח גדול הזמין בבת אחת.', extra: 0.25 },
  holiday: { title: 'עונת החגים', text: 'כולם קונים. חודש חזק.', demand: 1.2, months: 1 },
  // T3 (only in businesses created with t3: rules 4): a decision follows the base effect (see T3_EVENT_CHOICES)
  supplierDelay: { title: 'הספק לא הגיע', text: 'המשלוח של החומרים לא הגיע. מה עושים החודש?' },
  lateClient: { title: 'לקוח גדול — אבל משלם בשוטף+60', text: 'הזמנה גדולה, אבל הכסף יגיע רק בעוד חודשיים.' },
};

/* ============================================================ T3 "business at the centre" data (rules-4 businesses only: create({t3:true})) */
// docs/next-level/specs/T3-stories-business.md §6. A business created without t3 behaves exactly as before (rules 3 = v3).
export const STORY_DRAWS = 2;        // T3: extra draws per simulated month from the business's own sealed story stream (opts.story)
export const SHOCK_FLOOR = 0.6;      // §6.4 combined demand shocks are floored here (before season and price)
/** Per-type T3 parameters merged over the archetype: the decision-event table (holiday → the season calendar, bigClient → lateClient) and the general expansion. */
export const T3_PARAMS = {
  coffee: { events: { competitor: 3, costSpike: 2, staffQuit: 1, lateClient: 1, supplierDelay: 1, viral: 2, inspection: 1 },
    expand: { cost: 18000, demand: 0.6, rent: 2000, label: 'עגלה שנייה בתחנה אחרת', max: 1 },
    eventText: { costSpike: 'מחירי פולי הקפה והחלב קפצו בעולם.', lateClient: 'חברת הייטק ליד התחנה רוצה קפה לכל הצוות — ומשלמת בשוטף+60.' } },
  laundromat: { events: { breakdown: 3, competitor: 2, costSpike: 2, lateClient: 1, viral: 1 },
    eventText: { costSpike: 'חברת החשמל והמים עדכנו תעריפים.', breakdown: 'שתי מכונות נשרפו בגל החום.', lateClient: 'אכסניה גדולה רוצה שתכבס לה מצעים — ומשלמת בשוטף+60.' } },
  toyshop: { events: { customsDelay: 2, costSpike: 2, platformChange: 2, competitor: 2, lateClient: 1, viral: 1 },
    expand: { cost: 8000, demand: 0.4, fixed: 600, label: 'מרקטפלייס נוסף', max: 2 },
    eventText: { costSpike: 'מחירי המכולות בים זינקו: עלות המשלוח וההובלה עלו.', competitor: 'אתר בינלאומי ענק התחיל לשלוח לישראל בחינם.', lateClient: 'רשת גני ילדים רוצה הזמנה גדולה — ומשלמת בשוטף+60.' } },
  pizza: { events: { competitor: 3, inspection: 2, costSpike: 2, staffQuit: 2, supplierDelay: 1, lateClient: 1, breakdown: 1 },
    eventText: { costSpike: 'מחירי הגבינות והקמח עלו.', breakdown: 'התנור הראשי נשבר באמצע שישי בערב.', lateClient: 'בית הספר רוצה פיצות לכל האירועים — ומשלם בשוטף+60.' } },
  app: { events: { viral: 2, platformChange: 2, competitor: 2, staffQuit: 2, lateClient: 1 },
    expand: { cost: 60000, demand: 0.5, fixed: 3000, label: 'גרסת אנדרואיד', max: 1 },
    eventText: { competitor: 'חברת ענק השיקה אפליקציה דומה — בחינם.', staffQuit: 'המפתחת הכי טובה שלך קיבלה הצעה שאי אפשר לסרב לה.', lateClient: 'חברה גדולה רוצה מנוי לכל העובדים — ומשלמת בשוטף+60.' } },
};
/** §6.2 start setups (offer options start:lean / start / start:strong; 'start' = std = today's business). */
export const SETUPS = {
  coffee: { std: { label: 'עגלה רגילה', overrides: {} },
    strong: { label: 'מכונה מקצועית', note: 'מכונה יקרה, קפה טוב יותר: מחיר ₪16 ויותר לקוחות.', overrides: { equipment: 30000, price: 16, baseDemand: 2520, startCapital: 36000 } } },
  laundromat: { lean: { label: '10 מכונות', note: 'פחות מכונות — פחות הון, תקרה נמוכה יותר.', overrides: { equipCap: 2100, equipment: 85000, startCapital: 105000 } },
    std: { label: '12 מכונות', overrides: {} },
    strong: { label: '14 מכונות ומייבשים', note: 'יותר מכונות, יותר כביסות בחורף.', overrides: { equipCap: 2900, equipment: 118000, startCapital: 140000 } } },
  toyshop: { lean: { label: 'מלאי קטן', note: '300 יחידות במלאי. פחות כסף תקוע — וגם פחות למכור.', overrides: { startStock: 300, startCapital: 35000 } },
    std: { label: 'מלאי רגיל', overrides: {} },
    strong: { label: 'מלאי גדול ושיווק', note: '1,000 יחידות ו־₪4,000 שיווק מהחודש הראשון.', overrides: { startStock: 1000, startCapital: 80000, startMarketing: 4000 } } },
  pizza: { lean: { label: 'סניף קטן', note: 'שכירות זולה, תנור אחד, פחות לקוחות.', overrides: { rent: 12000, equipCap: 2400, baseDemand: 1900, startCapital: 200000 } },
    std: { label: 'סניף רגיל', overrides: {} },
    strong: { label: 'עם מנהל מהיום הראשון', note: 'מנהל מנהל את הסניף — העסק פסיבי מההתחלה.', overrides: { startCapital: 263000, manager: true } } },
  app: { lean: { label: 'רק אתה מפתח', note: 'בלי עובדים: שריפה קטנה, צמיחה איטית.', overrides: { staff: 0, startCapital: 150000 } },
    std: { label: 'מפתח אחד', overrides: {} },
    strong: { label: 'צוות של שלושה', note: 'שלושה מפתחים: צומחים מהר — ושורפים מהר.', overrides: { staff: 3, startCapital: 400000 } } },
};
/** §5.4 side-hustle graduation: only small-capital types; the equipment is already yours. */
export const SIDE_GRAD = {
  coffee: { overrides: { startCapital: 23000 }, worlds: 'all' },
  toyshop: { overrides: { startStock: 120, startCapital: 10000 + 120 * 35 + 3000 }, worlds: ['w1', 'w3', 'h'] },
};
export const MONTH_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
/** §6.3 public season calendar: calendar month (1–12) → demand multiplier (app: signups), with a label. */
export const SEASONS = {
  coffee: { 8: [0.9, 'אוגוסט: פחות נוסעים'], 9: [0.8, 'החגים: התחנה מתרוקנת'], 10: [0.85, 'החגים: התחנה מתרוקנת'] },
  laundromat: { 12: [1.15, 'החורף'], 1: [1.2, 'החורף'], 2: [1.15, 'החורף'], 7: [0.95, 'הקיץ'] },
  toyshop: { 12: [1.6, 'חנוכה'], 9: [1.3, 'החגים'], 4: [1.2, 'פסח'], 1: [0.8, 'אחרי החגים'] },
  pizza: { 4: [0.6, 'פסח: בלי חמץ'], 7: [1.15, 'החופש הגדול'], 8: [1.15, 'החופש הגדול'], 12: [1.1, 'חנוכה'] },
  app: { 1: [1.5, 'ינואר: כולם מתחילים דיאטה'], 9: [1.2, 'חזרה לשגרה'], 7: [0.85, 'הקיץ'], 8: [0.85, 'הקיץ'] },
};
/** Season-prep decisions (§6.6 M): the peak month and the choices; announced leadTime + 1 months ahead (toyshop 2, others 1). */
export const SEASON_PREP = {
  toyshop: [{ peak: 12, title: 'חנוכה בעוד חודשיים' }, { peak: 9, title: 'החגים בעוד חודשיים' }],
  pizza: [{ peak: 4, title: 'פסח בעוד חודש', kind: 'passover' }, { peak: 7, title: 'החופש הגדול מתחיל', kind: 'summer' }],
  coffee: [{ peak: 9, title: 'החגים בדרך — התחנה מתרוקנת' }],
  laundromat: [{ peak: 12, title: 'החורף מגיע' }],
  app: [{ peak: 1, title: 'ינואר: כולם מתחילים דיאטה' }],
};
export const STAGE_NAMES = ['התחלה', 'יציב', 'צומח', 'מותג'];
export const SIGNATURE = { coffee: 'תור בבוקר', laundromat: 'ניצולת מכונות', toyshop: 'מלאי לכמה חודשים', pizza: 'מכל ₪100 מחזור נשאר לך', app: 'מסלול' };
export const EVENTS_TEXT = 'במשחק: בערך פעם ב־4 חודשים קורה משהו בעסק';

/* ============================================================ lessons (merge into the library) */
export const BIZ_LESSONS = [
  { id: 'biz_revenue_profit', cat: 'business', title: 'הכנסות זה לא רווח', text: 'מחזור גדול נשמע מרשים, אבל מה שנשאר אחרי כל ההוצאות — הרווח — הוא מה שחשוב. אפשר להגדיל הכנסות ולהקטין רווח באותו חודש.' },
  { id: 'biz_gross_net', cat: 'business', title: 'רווח גולמי ורווח נקי', text: 'רווח גולמי = הכנסות פחות עלות המוצר. רווח נקי = מה שנשאר אחרי שכירות, שכר, שיווק ומס. עסק עם רווח גולמי יפה יכול עדיין להפסיד.' },
  { id: 'biz_vat', cat: 'tax', title: 'מע"מ — כסף שעובר דרכך', text: 'מתוך כל ₪118 שהלקוח משלם, ₪18 שייכים למדינה. מי שסופר אותם כהכנסה מופתע בסוף החודש.' },
  { id: 'biz_receivables', cat: 'business', title: 'לקוחות משלמים אחר כך', text: 'מכירה בכרטיס אשראי או ב"שוטף+30" נכנסת לקופה רק בחודש הבא. רווח על הנייר לא משלם משכורות.' },
  { id: 'biz_breakeven', cat: 'business', title: 'נקודת איזון', text: 'כמה יחידות צריך למכור כדי לכסות את ההוצאות הקבועות. כל יחידה מעליה — רווח. כל יחידה מתחתיה — הפסד.' },
  { id: 'biz_marketing', cat: 'business', title: 'תשואה פוחתת בשיווק', text: 'השקל הראשון בפרסום מביא הכי הרבה לקוחות. כל שקל נוסף מביא פחות. יש נקודה שבה עוד פרסום רק שורף כסף.' },
  { id: 'biz_inventory', cat: 'business', title: 'מלאי הוא כסף שוכב', text: 'קניית מלאי מוציאה מזומן היום ונרשמת כהוצאה רק כשמוכרים. בלי מלאי אין מה למכור; עם יותר מדי — הכסף תקוע במחסן.' },
  { id: 'biz_spoilage', cat: 'business', title: 'פחת ומלאי מת', text: 'סחורה שלא נמכרה בזמן — מתקלקלת או יוצאת מהאופנה. זו הוצאה אמיתית, גם אם אף אחד לא שילם עליה החודש.' },
  { id: 'biz_owner_job', cat: 'business', title: 'עסק או משרה?', text: 'אם העסק עובד רק כשאתה שם — קנית לעצמך משרה. עסק אמיתי ממשיך להרוויח כשאתה לא שם, וזה גם מה שקונה משלם עליו.' },
  { id: 'biz_capacity', cat: 'business', title: 'קיבולת', text: 'אם אין מספיק ידיים או מכונות, לקוחות הולכים. אבל עובד נוסף כדאי רק אם הוא מכניס יותר ממה שהוא עולה.' },
  { id: 'biz_elasticity', cat: 'business', title: 'מחיר וביקוש', text: 'מחיר גבוה יותר מביא פחות לקוחות. השאלה היא אם הרווח מכל לקוח שנשאר מכסה על אלה שהלכו.' },
  { id: 'biz_burn', cat: 'business', title: 'קצב שריפה ומסלול', text: 'סטארט־אפ מפסיד כסף כל חודש עד שההכנסות מכסות את ההוצאות. המזומן בקופה חלקי קצב השריפה החודשי = כמה חודשים נשארו לך לשרוד (המסלול).' },
  { id: 'biz_ltv_cac', cat: 'business', title: 'שווי לקוח מול עלות השגתו', text: 'אם הבאת מנוי ב־₪100 פרסום והוא משאיר לך ₪300 עד שהוא עוזב — שווה. אם הוא משאיר ₪50 — כל לקוח חדש מעמיק את ההפסד.' },
  { id: 'biz_depreciation', cat: 'business', title: 'פחת ציוד', text: 'המכונה שקנית מתבלה כל חודש. זו הוצאה ברווח והפסד, גם אם לא יצא אף שקל מהקופה.' },
  { id: 'biz_draw', cat: 'tax', title: 'משיכה מהעסק', text: 'בחברה בע"מ משלמים מס חברות על הרווח, ועוד מס דיבידנד כשמושכים אותו לכיס. רווח שנשאר בעסק ומושקע מחדש — עוד לא ממוסה פעמיים.' },
  { id: 'biz_seasonality', cat: 'business', title: 'עונות בעסק', text: 'בעסק יש חודשים חזקים וחלשים, ואפשר לדעת אותם מראש. מי שמזמין מלאי ומתכנן עובדים לפני העונה — מרוויח. מי שמגלה אותה באמצע — מפסיד.' },
  { id: 'biz_terms', cat: 'business', title: 'תנאי תשלום וחוב אבוד', text: 'לקוח שמשלם "שוטף+60" מממן את עצמו מהקופה שלך. אם הוא מאחר — חסר לך מזומן. אם הוא לא משלם — הפסדת את הסחורה, ואת המע״מ כבר שילמת. במשחק אין החזר מע״מ על חוב אבוד; במציאות לפעמים יש, בתנאים.' },
  { id: 'biz_valuation', cat: 'business', title: 'כמה שווה עסק', text: 'קונה משלם על רווח שימשיך גם בלעדיך — בדרך כלל פי 1.5 עד 4 מהרווח השנתי. עסק שתלוי בבעלים שווה פחות.' },
];

/* ============================================================ create */
/**
 * New business. The owner pays `startCapital` (engine deducts it from the player's cash); it buys the equipment and the
 * rest is the business's opening cash (+ opening stock for inventory businesses, bought out of the capital).
 * opts: {name?, overrides?: {param: value}, month?: game month for bookkeeping}
 */
export function create(typeId, opts = {}) {
  const base = ARCHETYPES[typeId];
  if (!base) throw new Error(`business: unknown archetype '${typeId}'`);
  const t3 = !!opts.t3;
  const setupOv = t3 && opts.setup && SETUPS[typeId] && SETUPS[typeId][opts.setup] ? SETUPS[typeId][opts.setup].overrides : null;
  const p = { ...clone(base), ...(t3 ? clone(T3_PARAMS[typeId] || {}) : {}), ...(setupOv ? clone(setupOv) : {}), ...(opts.overrides ? clone(opts.overrides) : {}) };
  delete p.lesson; delete p.desc;
  p.refPrice = p.refPrice ?? p.price;
  p.minPrice = p.minPrice ?? Math.max(1, rnd(p.refPrice * 0.5));
  p.maxPrice = p.maxPrice ?? rnd(p.refPrice * 2);
  p.hireCost = p.hireCost ?? rnd(p.wage * 0.25);
  const landed = landedUnit(p, 1, 1);
  const stockUnits = p.stock === 'inventory' ? (p.startStock || 0) : 0;
  const stockValue = stockUnits * landed;
  const cash = p.startCapital - p.equipment - stockValue;
  if (cash < 0) throw new Error(`business: startCapital ${p.startCapital} < equipment + opening stock`);
  const startMkt = t3 && setupOv && setupOv.startMarketing ? setupOv.startMarketing : 0;
  const b = {
    v: BIZ_VERSION, type: typeId, name: opts.name || p.name, p,
    month: 0, startMonth: opts.month ?? 0, closed: false,
    cash, price: p.price, staff: p.staff, newHires: 0, marketing: 0, manager: false, draw: 0,
    stock: stockUnits, stockValue, orders: [], users: p.mode === 'subscription' ? p.startUsers : 0,
    ar: [0, 0], equipment: { cost: p.equipment, book: p.equipment, dep: p.equipment > 0 ? rnd(p.equipment / p.equipLife) : 0 },
    expanded: 0, effects: [], queued: [], taxLoss: 0, cpi: 1, lastUnits: null,
    purchasePrice: p.startCapital, invested: p.startCapital,
    lastDecisionMonth: null, last: null, hist: [],
    totals: { revenue: 0, netProfit: 0, drawnGross: 0, drawnNet: 0, injected: 0, vat: 0, corpTax: 0, divTax: 0, duty: 0, months: 0 },
  };
  if (t3) { // T3 state (plain JSON): receivables with terms, growth stage, the open decision, setup id
    Object.assign(b, { t3: 1, setup: opts.setup || 'std', arTerms: [], stage: 0, stageUp: 0, stageDown: 0, decide: null, lastDecide: {}, startStaff: b.staff, startUsers: b.users || 0, first3: [] });
    if (startMkt) b.marketing = startMkt;
    if (setupOv && setupOv.manager) b.manager = true;
  }
  return b;
}

/** Landed cost of one imported unit (FOB + shipping + duty), at cost index cpi and cost multiplier m. Non-imports: unit cost. */
function landedUnit(p, cpi, m) {
  const goods = p.unitCost * cpi * m;
  if (p.stock !== 'inventory') return rnd(goods);
  const ship = (p.shipping || 0) * cpi;
  return rnd((goods + ship) * (1 + (p.dutyPct || 0)));
}

/* ============================================================ demand / capacity primitives (exported for tests & UI) */
/** Linear price response: +10% price ⇒ −(elasticity×10)% customers. Clamped to [0, 2.5]. */
export function priceFactor(p, price) { return clamp(1 - p.elasticity * ((price - p.refPrice) / p.refPrice), 0, 2.5); }
/** Marketing lift with diminishing returns: max × M / (M + half). sales: fraction of extra demand; subscription: signups/month. */
export function marketingLift(p, spend) { return spend > 0 ? (p.mktMax * spend) / (spend + p.mktHalf) : 0; }
const effMult = (b, kind) => b.effects.filter((e) => e.kind === kind && e.until >= b.month).reduce((m, e) => m * e.mult, 1);
const effAdd = (b, kind) => b.effects.filter((e) => e.kind === kind && e.until >= b.month).reduce((m, e) => m + (e.add || 0), 0);
/** T3 combined demand shock (crisis tile, cycle, competitor, platform…) floored at SHOCK_FLOOR (§6.4). */
const demandShock = (b) => (b.t3 ? Math.max(SHOCK_FLOOR, effMult(b, 'demand')) : effMult(b, 'demand'));
/** T3: the season multiplier for calendar month `cal` (a season-prep choice may set it: effect kind 'seasonSet'). → {mult, label} | null */
export function seasonOf(b, cal) {
  if (!b.t3 || !cal) return null;
  const set = b.effects.filter((e) => e.kind === 'seasonSet' && e.until >= b.month);
  const row = (SEASONS[b.type] || {})[cal];
  if (set.length) return { mult: set[set.length - 1].mult, label: row ? row[1] : 'עונה' };
  return row ? { mult: row[0], label: row[1] } : null;
}
/** Units the business can serve this month (labour × equipment). Subscription: unlimited. */
export function capacity(b) {
  const p = b.p;
  if (p.mode === 'subscription') return Infinity;
  const labour = (b.manager ? p.managerCap : p.ownerCap) + b.staff * p.perStaff - b.newHires * p.perStaff * 0.5 + (b.t3 ? effAdd(b, 'capAdd') : 0);
  const equip = p.equipCap != null ? p.equipCap + b.expanded * (p.expand && p.expand.cap ? p.expand.cap : 0) : Infinity;
  return Math.max(0, Math.floor(Math.min(labour, equip) * effMult(b, 'cap')));
}
/** Monthly energy the business costs its owner (feed into the v3 time/energy layer). */
export function ownerEnergy(b) { return b.closed ? 0 : b.manager ? b.p.managerEnergy : b.p.ownerEnergy; }
/** 'passive' only with a manager — an owner-operated business is a job, not passive income. */
export function incomeKind(b) { return b.manager ? 'passive' : 'active'; }

/* ============================================================ decisions */
/**
 * Validate + apply the player's decisions (quarterly, on the "עסק" tile). Atomic: on any error nothing changes.
 * d = { price?, hire?, fire?, marketing?, order?, manager?: bool, draw?, inject?, expand? } — all integers ≥ 0 (₪ / units).
 * One-off costs (hiring, severance, the inventory order, new equipment) are QUEUED and paid at the start of the next
 * simulate() month, so every shekel moves inside one monthly ledger. `inject` is cash the owner puts in (engine debits him).
 * → {ok, errors[], business, costs:{hiring, severance, inventory, equipment, total}, cashNeeded (₪ the business will lack), changes[]}
 */
export function applyDecisions(b0, d = {}) {
  const b = clone(b0); const p = b.p; const errors = []; const changes = [];
  const costs = { hiring: 0, severance: 0, inventory: 0, equipment: 0, total: 0 };
  if (b.closed) return { ok: false, errors: ['העסק כבר נמכר'], business: b0, costs, cashNeeded: 0, changes };
  const intOk = (k, v) => { if (v == null) return false; if (!isInt(v) || v < 0) { errors.push(`${k}: צריך מספר שלם לא שלילי`); return false; } return true; };
  if (d.price != null) {
    if (!isInt(d.price) || d.price < p.minPrice || d.price > p.maxPrice) errors.push(`מחיר בין ${fmt(p.minPrice)} ל־${fmt(p.maxPrice)}`);
    else if (d.price !== b.price) { changes.push({ k: 'price', from: b.price, to: d.price }); b.price = d.price; }
  }
  const hire = intOk('hire', d.hire) ? d.hire : 0;
  const fire = intOk('fire', d.fire) ? d.fire : 0;
  if (hire && fire) errors.push('אי אפשר לגייס ולפטר באותה החלטה');
  if (fire > b.staff) errors.push(`אפשר לפטר עד ${b.staff}`);
  if (b.staff + hire > p.maxStaff) errors.push(`עד ${p.maxStaff} עובדים`);
  if (d.marketing != null && intOk('marketing', d.marketing) && d.marketing > p.mktMaxSpend) errors.push(`תקציב שיווק עד ${fmt(p.mktMaxSpend)}`);
  if (intOk('order', d.order) && d.order > 0 && p.stock !== 'inventory') errors.push('לעסק הזה אין מלאי להזמין');
  if (intOk('expand', d.expand) && d.expand > 0 && (!p.expand || b.expanded + d.expand > p.expand.max)) errors.push(p.expand ? `עד ${p.expand.max} הרחבות` : 'אין אפשרות הרחבה');
  intOk('draw', d.draw); intOk('inject', d.inject);
  if (d.manager != null && typeof d.manager !== 'boolean') errors.push('manager: true/false');
  if (errors.length) return { ok: false, errors, business: b0, costs, cashNeeded: 0, changes: [] };

  const cpi = b.cpi;
  if (hire) { costs.hiring += hire * rnd(p.hireCost * cpi); b.staff += hire; b.newHires = hire; changes.push({ k: 'hire', n: hire }); }
  if (fire) { costs.severance += fire * rnd(p.wage * cpi); b.staff -= fire; b.newHires = Math.max(0, b.newHires - fire); changes.push({ k: 'fire', n: fire }); }
  if (d.manager === true && !b.manager) { costs.hiring += rnd(p.hireCost * cpi); b.manager = true; changes.push({ k: 'manager', to: true }); }
  if (d.manager === false && b.manager) { costs.severance += rnd(p.managerWage * cpi); b.manager = false; changes.push({ k: 'manager', to: false }); }
  if (d.marketing != null && d.marketing !== b.marketing) { changes.push({ k: 'marketing', from: b.marketing, to: d.marketing }); if (b.t3 && d.marketing > b.marketing) { b.prevMarketing = b.marketing; b.mktRaisedM = b.month; } b.marketing = d.marketing; }
  if (d.draw != null && d.draw !== b.draw) { changes.push({ k: 'draw', from: b.draw, to: d.draw }); b.draw = d.draw; }
  if (d.order > 0) {
    const m = effMult(b, 'cost');
    const goods = rnd(d.order * p.unitCost * cpi * m), ship = rnd(d.order * (p.shipping || 0) * cpi);
    const duty = rnd((goods + ship) * (p.dutyPct || 0));
    b.queued.push({ kind: 'order', units: d.order, goods, ship, duty });
    costs.inventory += goods + ship + duty; changes.push({ k: 'order', n: d.order });
  }
  if (d.expand > 0) {
    const cost = d.expand * rnd(p.expand.cost * cpi);
    b.queued.push({ kind: 'capex', units: d.expand, cost }); costs.equipment += cost; changes.push({ k: 'expand', n: d.expand });
  }
  if (costs.hiring) b.queued.push({ kind: 'oneOff', label: 'גיוס והכשרה', amount: costs.hiring, vatable: true });
  if (costs.severance) b.queued.push({ kind: 'oneOff', label: 'פיצויים והודעה מוקדמת', amount: costs.severance, vatable: false, party: 'staff' });
  if (d.inject > 0) { b.queued.push({ kind: 'inject', amount: d.inject }); changes.push({ k: 'inject', amount: d.inject }); }
  b.lastDecisionMonth = b.month;
  costs.total = costs.hiring + costs.severance + costs.inventory + costs.equipment;
  const vatToo = vatOn(costs.hiring + costs.inventory + costs.equipment);
  const cashNeeded = Math.max(0, costs.total + vatToo - b.cash - (d.inject || 0));
  return { ok: true, errors: [], business: b, costs, cashNeeded, changes };
}
/** Quarterly gate (advisory — the engine decides): true if never decided or ≥ 3 simulated months since the last decision. */
export function canDecide(b) { return !b.closed && (b.lastDecisionMonth == null || b.month - b.lastDecisionMonth >= 3); }

/* ============================================================ the monthly simulation */
/**
 * Simulate one month. decisions (optional) are applied first (see applyDecisions; invalid ⇒ throws, so validate first).
 * rng: () => [0,1), consumed exactly RNG_DRAWS times. opts: {noEvents?: true} (forecasts).
 * → {business (new object), report}
 */
export function simulate(b0, decisions, rng, opts = {}) {
  if (typeof rng !== 'function') throw new Error('business.simulate: rng function required');
  if (b0.closed) throw new Error('business.simulate: business is closed');
  let b = clone(b0);
  if (decisions && Object.keys(decisions).length) {
    const r = applyDecisions(b, decisions);
    if (!r.ok) throw new Error('business.simulate: ' + r.errors.join('; '));
    b = r.business;
  }
  if (b.t3 && b.decide && !opts.noEvents) b = resolveEvent(b, b.decide.key, defaultChoice(b.decide.id, b)).business; // never two open decisions (the engine resolves before the next month)
  const p = b.p; const prev = b.last;
  b.month += 1;
  const r1 = rng(), r2 = rng(), r3 = rng(); // ALWAYS 3 draws, whatever happens
  // T3: exactly STORY_DRAWS more from the business's own sealed story stream (sealed outcomes of this month's decision)
  let sa = 0.5, sb = 0.5; if (typeof opts.story === 'function') { sa = opts.story(); sb = opts.story(); }
  const t3 = !!b.t3; const cal = opts.cal || null; const cands = [];
  const events = [];
  b.effects = b.effects.filter((e) => e.until >= b.month);
  let extra = 0, oneOffs = [];
  const cash0 = b.cash;
  const flows = { owner: 0, customers: 0, suppliers: 0, staff: 0, landlord: 0, services: 0, franchisor: 0, state: 0 };
  const pay = (party, amount) => { flows[party] -= amount; b.cash -= amount; };
  const receive = (party, amount) => { flows[party] += amount; b.cash += amount; };

  // ---- event (decided by r2, picked by r3)
  if (!opts.noEvents && r2 < p.eventChance) {
    const list = Object.entries(p.events || {});
    const total = list.reduce((s, [, w]) => s + w, 0);
    let x = r3 * total, id = list[list.length - 1][0];
    for (const [k, w] of list) { x -= w; if (x < 0) { id = k; break; } }
    const E = EVENTS[id]; const ev = { id, title: E.title, text: (p.eventText && p.eventText[id]) || E.text };
    const lfx = t3 && id === 'costSpike' && b.type === 'laundromat'; // T3: the laundromat's cost spike is its fixed costs (power, water)
    if (E.demand) b.effects.push({ id, kind: 'demand', mult: E.demand, until: b.month + E.months - 1 });
    if (E.cost) b.effects.push({ id, kind: lfx ? 'fixedMult' : 'cost', mult: E.cost, until: b.month + E.months - 1 });
    if (E.cap) b.effects.push({ id, kind: 'cap', mult: E.cap, until: b.month + E.months - 1 });
    if (E.oneOff && !(t3 && id === 'breakdown')) oneOffs.push({ label: E.title, amount: rnd(p[E.oneOff] * b.cpi), vatable: E.oneOff === 'repair', party: E.oneOff === 'fine' ? 'state' : 'services' });
    if (E.staff) { if (b.staff > 0) { b.staff -= 1; b.newHires = Math.min(b.newHires, b.staff); } else ev.text = 'עובד שעמד להצטרף ביטל ברגע האחרון. נשארת לבד.'; }
    if (E.delay) { if (b.orders.length) b.orders.forEach((o) => { o.arrive += E.delay; }); else ev.text = 'הנמל עמוס — טוב שלא היה לך משלוח בדרך.'; }
    if (E.extra) extra = p.mode === 'subscription' ? rnd(p.baseNew * 3) : rnd((p.baseDemand || 0) * E.extra);
    if (t3 && E.extra) extra = 0; // (bigClient is not in a T3 table; lateClient is a decision)
    ev.effect = E.demand ? `ביקוש ×${E.demand} ל־${E.months} חודשים` : E.cost ? (lfx ? `הוצאות קבועות +${rnd((E.cost - 1) * 100)}% ל־${E.months} חודשים` : `עלות המוצר +${rnd((E.cost - 1) * 100)}% ל־${E.months} חודשים`) : E.cap ? 'קיבולת −30% החודש' : E.oneOff && oneOffs.length ? `הוצאה חד־פעמית ${fmt(oneOffs[oneOffs.length - 1].amount)}` : E.extra ? `+${extra} ${p.unit} החודש` : '';
    events.push(ev);
    if (t3 && !opts.noEvents && T3_CHOICES[id] && eventDecides(b, id)) cands.push({ id, prio: 2 });
  }

  // ---- queued decisions: owner injection, inventory orders, equipment, one-off costs
  let vatIn = 0, capex = 0, orderPay = 0, dutyPaid = 0, decidedInject = 0; const b2b = [];
  for (const q of b.queued) {
    if (q.kind === 'inject') { receive('owner', q.amount); b.invested += q.amount; b.totals.injected += q.amount; decidedInject += q.amount; }
    else if (q.kind === 'order') {
      const base = q.goods + q.ship; const v = vatOn(base + q.duty);
      pay('suppliers', base + v); pay('state', q.duty); vatIn += v; orderPay += base + q.duty; dutyPaid += q.duty;
      b.orders.push({ units: q.units, value: base + q.duty, arrive: b.month + (q.lead != null ? q.lead : (p.leadTime || 0)) });
    } else if (q.kind === 'capex') {
      const v = vatOn(q.cost); pay('suppliers', q.cost + v); vatIn += v; capex += q.cost;
      b.expanded += q.units; b.equipment.cost += q.cost; b.equipment.book += q.cost;
      b.equipment.dep = rnd(b.equipment.book / p.equipLife);
    } else if (q.kind === 'oneOff') oneOffs.push(q);
    else if (q.kind === 'b2b') b2b.push(q);
  }
  b.queued = [];
  // arrivals
  let arrived = 0;
  b.orders = b.orders.filter((o) => { if (o.arrive <= b.month) { b.stock += o.units; b.stockValue += o.value; arrived += o.units; return false; } return true; });

  // ---- demand, capacity, units
  const cpi = b.cpi, costM = effMult(b, 'cost'), demShock = demandShock(b);
  const season = seasonOf(b, cal);
  const demM = demShock * (season ? season.mult : 1);
  const noise = 0.9 + 0.2 * r1;
  const pf = priceFactor(p, b.price);
  const mktSpend = b.marketing + (t3 ? effAdd(b, 'mktAdd') : 0);
  const lift = marketingLift(p, mktSpend);
  const xd = t3 && p.expand && p.expand.demand ? 1 + b.expanded * p.expand.demand : 1; // T3 general expansion: more demand
  let units, demand, cap = capacity(b), lostCap = 0, lostStock = 0, sub = null;
  if (p.mode === 'subscription') {
    const devs = b.staff + (b.manager ? 0 : 1) + (t3 ? effAdd(b, 'devAdd') : 0);
    const churnRate = p.churn * (2 / (1 + devs)) * clamp(1 + 0.5 * p.elasticity * ((b.price - p.refPrice) / p.refPrice), 0.5, 2) * (t3 ? effMult(b, 'churnMult') : 1);
    const organic = p.baseNew * (1 + 0.2 * devs) * xd;
    const fromMkt = rnd(lift * pf * demM * noise);
    let newUsers = rnd(organic * pf * demM * noise * (t3 ? effMult(b, 'newUsersMult') : 1)) + fromMkt + extra;
    if (t3) { const capE = b.effects.filter((e) => e.kind === 'newUsersCap' && e.until >= b.month); if (capE.length) newUsers = Math.min(newUsers, rnd(capE[0].mult * p.baseNew)); }
    const churned = rnd(b.users * churnRate);
    const before = b.users;
    b.users = Math.max(0, b.users - churned + newUsers);
    units = demand = b.users;
    sub = { before, newUsers, fromMkt, churned, churnRate: Math.round(churnRate * 10000) / 10000, devs };
  } else {
    demand = rnd((p.baseDemand * xd * pf * (1 + lift) * demM) * noise) + extra;
    units = Math.min(demand, cap);
    lostCap = demand - units;
    if (p.stock === 'inventory' && units > b.stock) { lostStock = units - b.stock; units = b.stock; }
  }
  // T3 B2B orders on terms (lateClient): booked now, paid at `due` (sealed late / bad); served from what is left
  let b2bUnits = 0, b2bGross = 0, b2bAdv = 0;
  for (const q of b2b) {
    const free = p.stock === 'inventory' ? Math.max(0, b.stock - units) : q.units;
    const u = Math.min(q.units, free); if (u <= 0) continue;
    const g = u * q.price; const adv = rnd(g * (q.adv || 0));
    b2bUnits += u; b2bGross += g; b2bAdv += adv;
    if (g - adv > 0) b.arTerms.push({ amount: g - adv, due: b.month + 2, late: !!q.late, bad: !!q.bad, client: q.client || '' }); // `due` is public; late / bad stay sealed until they happen
  }

  // ---- P&L (accrual, VAT excluded)
  const gross = units * b.price + b2bGross;
  const vatOut = vatOf(gross);
  const revenue = gross - vatOut;
  const unitC = p.unitCost * cpi * costM;
  const soldUnits = units + b2bUnits;
  let goods = 0, waste = 0, purchases = 0, dead = 0;
  if (p.stock === 'fresh') {
    const fc = b.lastUnits == null ? units : b.lastUnits;
    const bought = Math.max(units, rnd(fc * (1 + p.buffer)));
    goods = rnd(units * unitC); waste = rnd((bought - units) * unitC); purchases = goods + waste;
    if (b2bUnits) { const g2 = rnd(b2bUnits * unitC); goods += g2; purchases += g2; }
  } else if (p.stock === 'inventory') {
    if (soldUnits > 0) { goods = b.stock === soldUnits ? b.stockValue : rnd((b.stockValue * soldUnits) / b.stock); b.stock -= soldUnits; b.stockValue -= goods; }
    const deadUnits = rnd(b.stock * (p.deadRate || 0));
    if (deadUnits > 0) { dead = deadUnits === b.stock ? b.stockValue : rnd((b.stockValue * deadUnits) / b.stock); b.stock -= deadUnits; b.stockValue -= dead; }
    waste = dead;
  } else { goods = rnd(soldUnits * unitC); purchases = goods; }
  const fulfil = rnd(soldUnits * (p.fulfil || 0) * cpi);
  const cogs = goods + waste + fulfil;
  const grossProfit = revenue - cogs;
  const wages = t3 ? rnd(b.staff * p.wage * cpi * effMult(b, 'wageMult')) + rnd(effAdd(b, 'wageAdd') * cpi) : rnd(b.staff * p.wage * cpi);
  const managerWage = b.manager ? rnd(p.managerWage * cpi) : 0;
  const rent = t3 ? rnd((p.rent + b.expanded * ((p.expand && p.expand.rent) || 0)) * cpi) : rnd(p.rent * cpi);
  const fixed = t3 ? rnd((p.fixed + b.expanded * ((p.expand && p.expand.fixed) || 0)) * cpi * effMult(b, 'fixedMult')) + rnd(effAdd(b, 'fixedAdd') * cpi) : rnd(p.fixed * cpi);
  const marketing = mktSpend;
  // T3: receivables on terms that fall due this month — collected, or written off ("חוב אבוד": no VAT refund in the game)
  let termsIn = 0, badDebt = 0;
  if (t3 && b.arTerms.length) { b.arTerms = b.arTerms.filter((x) => { const at = x.due + (x.late || x.bad ? 1 : 0); if (at > b.month) return true; if (x.bad) badDebt += x.amount; else termsIn += x.amount; return false; }); } // a bad debt is written off a month after it was due
  const royalty = rnd(revenue * (p.royaltyPct || 0));
  const fees = rnd(gross * (p.feePct || 0));
  const depreciation = Math.min(b.equipment.book, b.equipment.dep);
  const oneOff = oneOffs.reduce((s, o) => s + o.amount, 0);
  const opexTotal = wages + managerWage + rent + fixed + marketing + royalty + fees + depreciation + oneOff + badDebt;
  const ebt = grossProfit - opexTotal;
  let taxable = 0;
  if (ebt > 0) { const used = Math.min(b.taxLoss, ebt); b.taxLoss -= used; taxable = ebt - used; } else b.taxLoss += -ebt;
  const corpTax = rnd(taxable * CORP_TAX);
  const netProfit = ebt - corpTax;
  b.equipment.book -= depreciation;

  // ---- cash (who gets paid)
  const arPrevT = t3 ? b.ar[0] + b.ar[1] + (b.arTermsPrev || 0) : 0;
  const retail = gross - b2bGross;
  const collectedNow = rnd(retail * p.cashShare) + b2bAdv;
  const arDue = b.ar[0];
  receive('customers', collectedNow + arDue + termsIn);
  b.ar = [b.ar[1], 0];
  const arNew = retail - rnd(retail * p.cashShare);
  b.ar[(p.arLag || 1) - 1] += arNew;
  const vline = (party, base, vatable = true) => { if (!base) return; const v = vatable ? vatOn(base) : 0; vatIn += v; pay(party, base + v); };
  vline('suppliers', purchases); vline('suppliers', fulfil);
  pay('staff', wages + managerWage);
  vline('landlord', rent); vline('services', fixed); vline('services', marketing);
  vline('franchisor', royalty); pay('services', fees);
  for (const o of oneOffs) vline(o.party || 'services', o.amount, !!o.vatable);
  const vatPayable = vatOut - vatIn;
  if (vatPayable >= 0) pay('state', vatPayable); else receive('state', -vatPayable);
  pay('state', corpTax);
  const cashBeforeOwner = b.cash;
  let injection = 0;
  if (b.cash < 0) { injection = -b.cash; receive('owner', injection); b.invested += injection; b.totals.injected += injection; }
  const drawGross = Math.min(b.draw, Math.max(0, b.cash));
  const divTax = rnd(drawGross * DIV_TAX), drawNet = drawGross - divTax;
  pay('owner', drawNet); pay('state', divTax);
  const cashChange = b.cash - cash0;
  const injectedThisMonth = decidedInject + injection; // all owner money in (decided + automatic)
  if (t3) b.arTermsPrev = b.arTerms.reduce((x, t) => x + t.amount, 0);

  // ---- bookkeeping
  b.lastUnits = units; b.newHires = 0;
  const lostCapS = lostCap, lostStockS = lostStock;
  const t = b.totals; t.revenue += revenue; t.netProfit += netProfit; t.drawnGross += drawGross; t.drawnNet += drawNet;
  t.vat += vatPayable; t.corpTax += corpTax; t.divTax += divTax; t.duty += dutyPaid; t.months += 1;
  // T6 §5.1 / §11.3: the whole life of the business (beyond HIST_MAX) for the end summary — bookkeeping only
  if (netProfit > 0) t.profitMonths = (t.profitMonths || 0) + 1; else t.lossMonths = (t.lossMonths || 0) + 1;
  if (!t.worst || netProfit < t.worst.np) t.worst = { np: netProfit, m: b.month };
  const be = breakEven(b);
  const grossMargin = revenue ? grossProfit / revenue : 0, netMargin = revenue ? netProfit / revenue : 0;
  const report = {
    month: b.month, type: b.type, name: b.name, unit: p.unit,
    price: b.price, units, demand, capacity: cap === Infinity ? null : cap, lostSales: { capacity: lostCap, stock: lostStock },
    revenueGross: gross, vatOut, revenue,
    cogs: { goods, waste, fulfil, total: cogs, wasteLabel: p.stock === 'inventory' ? 'מלאי מת' : 'פחת וזריקות' },
    grossProfit, grossMargin: pct1(grossMargin),
    opex: { wages, manager: managerWage, rent, fixed, marketing, royalty, fees, depreciation, oneOff, oneOffs: oneOffs.map((o) => ({ label: o.label, amount: o.amount })), ...(t3 ? { badDebt } : {}), total: opexTotal },
    ebt, taxable, corpTax, taxLossCarry: b.taxLoss, netProfit, netMargin: pct1(netMargin),
    vat: { output: vatOut, input: vatIn, payable: vatPayable },
    cash: { start: cash0, collected: collectedNow + arDue + termsIn, beforeOwner: cashBeforeOwner, end: b.cash, change: cashChange,
      inventoryBought: orderPay, capex },
    receivables: b.ar[0] + b.ar[1] + (t3 ? b.arTermsPrev : 0),
    inventory: p.stock === 'inventory' ? { units: b.stock, value: b.stockValue, arrived, onOrder: b.orders.reduce((s, o) => s + o.units, 0) } : null,
    flows,
    toOwner: { drawGross, divTax, drawNet, injection, injectedTotal: injectedThisMonth, net: drawNet - injectedThisMonth },
    ownerEnergy: ownerEnergy(b) + (t3 ? effAdd(b, 'energyAdd') : 0), incomeKind: incomeKind(b),
    breakEven: be, events, sub: null, notes: [], lessons: [], lines: [], headline: '',
  };
  if (sub) {
    const arpuNet = b.price ? (netOf(b.price) - p.unitCost * cpi - b.price * p.feePct) : 0;
    const operating = cashBeforeOwner - cash0 - decidedInject;          // cash the business made/lost on its own
    const burn = Math.max(0, -operating);
    report.sub = { ...sub, users: b.users, mrr: revenue, arr: revenue * 12,
      cac: sub.fromMkt > 0 ? rnd(marketing / sub.fromMkt) : null,
      ltv: rnd(arpuNet / Math.max(sub.churnRate, 0.005)),
      burn, runway: burn > 0 ? Math.floor(Math.max(0, b.cash) / burn) : null }; // runway = cash ÷ monthly burn
  }
  report.lines = plLines(report);
  teach(b, report, prev);
  report.headline = `מחזור ${fmt(gross)} · רווח נקי ${fmt(netProfit)} · בקופה ${sgn(cashChange)}`;
  if (t3) {
    report.cal = cal; report.season = season ? { mult: season.mult, label: season.label } : null;
    report.why = whyOf(b, report, prev, { demShock, season, lift, noise, arPrevT, cogsFromStock: p.stock === 'inventory' ? goods + waste : 0, injected: injectedThisMonth, b2bUnits });
    report.notes = [{ id: 'why', text: report.why.sentence, lesson: null }, ...report.notes].slice(0, 3);
    report.activity = { utilization: cap === Infinity || !cap ? null : Math.round(units / cap * 100) / 100, stockCover: p.stock === 'inventory' ? stockCoverOf(b, demand) : null,
      lostSales: lostCapS + lostStockS, busy: cap !== Infinity && cap > 0 && units >= cap * 0.95, stockout: lostStockS > 0, event: events.length ? events[0].id : season && season.mult > 1 ? 'season' : null };
    if (!opts.noEvents) {
      const sp = seasonPrepFor(b, cal); if (sp) cands.push({ id: 'seasonPrep', prio: 4, data: sp });
      if (overloadDue(b, { lostCap: lostCapS, demand, events, season, sub })) cands.push({ id: b.p.mode === 'subscription' ? 'overloadApp' : 'overload', prio: 3 });
      if (buyerDue(b)) cands.push({ id: 'buyerOffer', prio: 1 });
      cands.sort((x, y) => y.prio - x.prio);
      report.autoDecided = [];
      for (let i = cands.length - 1; i >= 0; i--) { // ≤ 1 decision a month: lower priorities resolve with their default now (§6.6)
        const c = cands[i];
        b.lastDecide[c.id === 'overloadApp' ? 'overload' : c.id] = b.month;
        const d = { key: b.month + ':' + c.id, id: c.id, m: b.month, seal: { a: sa, b: sb }, data: c.data || decideData(b, c.id) };
        b.decide = d; if (c.id === 'buyerOffer') decideOffer(b);
        if (i > 0) { b = resolveEvent(b, d.key, defaultChoice(c.id, b)).business; report.autoDecided.push(c.id); }
      }
      report.decide = b.decide ? [b.decide.key] : [];
    }
  }
  b.last = { month: b.month, revenue, netProfit, units, price: b.price, grossProfit, opex: { ...report.opex, oneOffs: undefined }, waste, marketing, staff: b.staff, ebt, ...(t3 ? { uc: soldUnits ? (goods + fulfil) / soldUnits : 0, corpTax, demShock, season: season ? season.mult : 1, lift, noise, lostCap: lostCapS, lostStock: lostStockS } : {}) };
  b.hist.push({ m: b.month, rev: revenue, gp: grossProfit, opex: opexTotal, ebt, one: oneOff, np: netProfit, cash: b.cash, units, users: b.users || undefined, draw: drawNet });
  if (b.hist.length > HIST_MAX) b.hist.shift();
  if (t3) {
    if (b.first3.length < 3) b.first3.push(revenue);
    const st0 = b.stage; stageStep(b); report.stage = { stage: b.stage, prev: st0, changed: b.stage !== st0, name: STAGE_NAMES[b.stage] };
  }
  return { business: b, report };
}

/* ============================================================ analytics */
/** Break-even units/month: fixed costs ÷ contribution per unit (current price, costs, staff, marketing). */
export function breakEven(b) {
  const p = b.p, cpi = b.cpi, costM = effMult(b, 'cost');
  const net = b.price * 100 / (100 + VAT_PCT);
  const variable = (p.stock === 'inventory' ? landedUnit(p, cpi, costM) : p.unitCost * cpi * costM * (1 + (p.stock === 'fresh' ? p.buffer : 0)))
    + (p.fulfil || 0) * cpi + net * (p.royaltyPct || 0) + b.price * (p.feePct || 0);
  const contribution = net - variable;
  const fixedCosts = rnd((p.rent + p.fixed + b.staff * p.wage + (b.manager ? p.managerWage : 0)) * cpi) + b.marketing + (b.equipment.book > 0 ? b.equipment.dep : 0);
  const units = contribution > 0 ? Math.ceil(fixedCosts / contribution - 1e-9) : null;
  return { units, revenue: units == null ? null : rnd(units * net), contribution: Math.round(contribution * 100) / 100, fixed: fixedCosts,
    text: units == null ? 'בכל מכירה אתה מפסיד — אין נקודת איזון במחיר הזה.' : `צריך ${units} ${p.unit} בחודש כדי לכסות ${fmt(fixedCosts)} הוצאות קבועות (${fmt(contribution)} תרומה לכל ${p.unitOne}).` };
}
/** Gross & net margin (%) of a report. */
export function margins(r) { return { gross: r.revenue ? pct1(r.grossProfit / r.revenue) : 0, net: r.revenue ? pct1(r.netProfit / r.revenue) : 0 }; }

/**
 * What a buyer would pay now. Profit-based: normalised yearly profit (avg EBT + one-offs of the last ≤12 months, minus a manager's
 * wage if the owner runs it himself, after corporate tax) × multiple; subscriptions may sell on revenue (ARR × revMultiple
 * if growing ≥ 3%/month). Floor = 60% of equipment book value + 70% of inventory at cost.
 * The owner also keeps the business cash and receivables. Capital-gains tax 30% (substantial shareholder) on (proceeds − total invested).
 */
export function valuation(b) {
  const p = b.p; const h = b.hist.slice(-12);
  const floor = rnd(b.equipment.book * 0.6 + b.stockValue * 0.7);
  let profitValue = 0, normMonthly = 0, method = 'assets', text;
  if (h.length >= 3) {
    const avgEbt = h.reduce((s, x) => s + x.ebt + (x.one || 0), 0) / h.length; // buyers normalise one-offs away
    const mgrAdj = b.manager ? 0 : rnd(p.managerWage * b.cpi);
    normMonthly = rnd(avgEbt - mgrAdj);
    profitValue = Math.max(0, rnd(normMonthly * 12 * (1 - CORP_TAX) * p.multiple));
  }
  let revenueValue = 0, growth = 0;
  if (p.mode === 'subscription' && h.length >= 4) {
    const u0 = h[h.length - 4].users || 0, u1 = h[h.length - 1].users || 0;
    growth = u0 > 0 ? (u1 / u0 - 1) / 3 : 0;
    if (growth >= 0.03) revenueValue = rnd(h[h.length - 1].rev * 12 * p.revMultiple);
  }
  let price = Math.max(floor, profitValue, revenueValue);
  if (price === revenueValue && revenueValue > 0) { method = 'revenue'; text = `קונים משלמים על צמיחה: ${fmt(h[h.length - 1].rev * 12)} הכנסה שנתית × ${p.revMultiple}.`; }
  else if (price === profitValue && profitValue > 0) { method = 'profit'; text = `רווח שנתי מנורמל ${fmt(normMonthly * 12)} (אחרי מס) × ${p.multiple}${b.manager ? '' : ` — אחרי שהקונה ניכה ${fmt(p.managerWage)} בחודש על מנהל שיחליף אותך`}.`; }
  else text = h.length < 3 ? 'עוד אין מספיק היסטוריה של רווחים — קונה ישלם רק על הציוד והמלאי.' : 'העסק לא מרוויח מספיק — קונה ישלם רק על הציוד והמלאי.';
  price = rnd(price / 100) * 100;
  const cashIn = b.cash, receivables = b.ar[0] + b.ar[1] + (b.t3 && b.arTerms ? b.arTerms.reduce((x, t) => x + t.amount, 0) : 0);
  const proceeds = price + cashIn + receivables;
  const gain = proceeds - b.invested;
  const tax = gain > 0 ? rnd(gain * CAP_GAINS) : 0;
  return { price, method, multiple: method === 'revenue' ? p.revMultiple : p.multiple, normMonthlyProfit: normMonthly, floor, profitValue, revenueValue,
    growth: Math.round(growth * 1000) / 1000, cash: cashIn, receivables, proceeds, invested: b.invested, gain, tax, net: proceeds - tax, text };
}
/** Sell the business. → {business (closed), sale: valuation + {net}}. The engine credits sale.net to the player. */
export function sell(b0, opts = {}) {
  if (b0.closed) throw new Error('business.sell: already closed');
  const sale = valuation(b0);
  if (opts.price != null) { // T3 buyerOffer: a buyer's price instead of the valuation
    sale.price = Math.max(0, rnd(opts.price)); sale.method = 'offer'; sale.proceeds = sale.price + sale.cash + sale.receivables;
    sale.gain = sale.proceeds - sale.invested; sale.tax = sale.gain > 0 ? rnd(sale.gain * CAP_GAINS) : 0; sale.net = sale.proceeds - sale.tax;
    sale.text = `מכרת לקונה ב־${fmt(sale.price)}, ועוד הקופה והחובות של הלקוחות.`;
  }
  const b = clone(b0); b.closed = true; b.soldFor = sale.price; b.cash = 0; b.ar = [0, 0]; b.stock = 0; b.stockValue = 0; b.orders = []; b.queued = [];
  if (b.t3) { b.arTerms = []; b.decide = null; }
  return { business: b, sale };
}

/** Economy-wide shock from the engine (מיתון, בום, …): demand ×demand (and/or unit cost ×cost) for the next `months` simulated months. */
export function applyShock(b0, { id = 'shock', demand, cost, months = 3 } = {}) {
  const b = clone(b0);
  if (demand) b.effects.push({ id, kind: 'demand', mult: demand, until: b.month + months });
  if (cost) b.effects.push({ id, kind: 'cost', mult: cost, until: b.month + months });
  return b;
}
/** Yearly inflation (pct, e.g. 3.2): costs (unit cost, wages, rent, fixed, fulfilment, shipping) rise; the PRICE does not. */
export function applyInflation(b0, pct) { const b = clone(b0); b.cpi = Math.round(b.cpi * (1 + pct / 100) * 1e6) / 1e6; return b; }

/** Deterministic preview (no events, neutral luck): simulate `months` months with `decisions` applied first. */
export function forecast(b, decisions = null, months = 1, opts = {}) {
  const out = []; let cur = b;
  for (let i = 0; i < months; i++) {
    const so = opts.cal ? { noEvents: true, cal: calPlus(opts.cal, i) } : { noEvents: true };
    const d = i === 0 ? decisions : null;
    let r = simulate(cur, d, () => 0.5, so);
    if (opts.restock != null && i >= opts.restock && cur.p.stock === 'inventory') { // the usual restock (see restockQty), so a cost or demand change reaches the goods you would buy
      const q = restockQty(d && Object.keys(d).length ? applyDecisions(cur, d).business : cur, r.report.demand);
      if (q > 0) r = simulate(cur, { ...(d || {}), order: ((d && d.order) || 0) + q }, () => 0.5, so);
    }
    out.push(r.report); cur = r.business;
  }
  return { reports: out, business: cur, netProfit: out.reduce((s, r) => s + r.netProfit, 0), cashChange: out.reduce((s, r) => s + r.cash.change, 0) };
}
/** Units to order so stock + on order (+ already queued) covers lead time + 3 months of `demand` (as suggest()), in steps of 50. */
export function restockQty(b, demand) {
  const p = b.p; if (p.stock !== 'inventory') return 0;
  const onOrder = b.orders.reduce((s, o) => s + o.units, 0) + b.queued.reduce((s, q) => s + (q.kind === 'order' ? q.units : 0), 0);
  const need = demand * ((p.leadTime || 0) + 3) - b.stock - onOrder;
  return need > 0 ? Math.ceil(need / 50) * 50 : 0;
}

/** Smart default for the decision card (the engine's `primary`): marketing/hiring by a 3-month (subscription: 12-month) forecast, stock to cover lead time + 3 months, a draw that keeps a cushion. */
export function suggest(b) {
  const p = b.p; const d = {}; const why = [];
  const H = p.mode === 'subscription' ? 12 : 3;   // subscribers pay back over many months
  const base = forecast(b, null, H).netProfit;
  // marketing: best of a few presets by H-month profit
  let bestM = b.marketing, bestV = base;
  for (const m of mktPresets(p)) { if (m === b.marketing) continue; const v = forecast(b, { marketing: m }, H).netProfit; if (v > bestV + 300 * H / 3) { bestV = v; bestM = m; } }
  if (bestM !== b.marketing) { d.marketing = bestM; why.push(`שיווק ${fmt(bestM)} בחודש מביא הכי הרבה רווח (לא הכי הרבה לקוחות).`); }
  // hire one if capacity is the bottleneck and it pays
  if (p.mode === 'sales' && b.staff < p.maxStaff && b.last && b.last.units >= capacity(b) * 0.98) {
    const v = forecast(b, { ...d, hire: 1 }, H).netProfit;
    if (v > bestV + 300) { d.hire = 1; bestV = v; why.push('חסרות ידיים, ועובד נוסף מכניס יותר ממה שהוא עולה.'); }
  }
  // inventory: cover lead time + 3 months of expected sales
  if (p.stock === 'inventory') {
    const exp = forecast(b, d, 1).reports[0].demand;
    const onOrder = b.orders.reduce((s, o) => s + o.units, 0);
    const need = exp * ((p.leadTime || 0) + 3) - b.stock - onOrder;
    if (need > 0) { d.order = Math.ceil(need / 50) * 50; why.push(`להזמין ${d.order} ${p.unit}: מספיק לחודש משלוח ועוד שלושה חודשי מכירות.`); }
  }
  // owner draw: take ~80% of the expected profit once the business holds a cushion of 2 months of fixed costs
  const f = forecast(b, d, 1).reports[0];
  const cushion = 2 * breakEven(b).fixed;
  const drawTo = f.netProfit > 0 && b.cash > cushion ? Math.floor((f.netProfit * 0.8) / 500) * 500 : 0;
  if (drawTo !== b.draw && (drawTo > 0 || b.cash < cushion / 2)) { d.draw = drawTo; why.push(drawTo ? `למשוך ${fmt(drawTo)} בחודש ולהשאיר כרית בעסק.` : 'להפסיק למשוך — לעסק אין כרית.'); }
  if (!why.length) why.push('העסק מאוזן — אין צורך לשנות כלום.');
  return { decisions: d, why };
}
function mktPresets(p) { const h = p.mktHalf; return [0, rnd(h / 2), h, 2 * h, 4 * h].filter((x) => x <= p.mktMaxSpend); }

/** Everything the decision card needs (ranges, presets, previews). */
export function decisionOptions(b) {
  const p = b.p, cpi = b.cpi;
  const steps = [-10, -5, 5, 10].map((s) => ({ pct: s, price: clamp(rnd(b.price * (1 + s / 100)), p.minPrice, p.maxPrice) }));
  return {
    canDecide: canDecide(b),
    price: { current: b.price, ref: p.refPrice, min: p.minPrice, max: p.maxPrice, steps },
    staff: { current: b.staff, max: p.maxStaff, wage: rnd(p.wage * cpi), hireCost: rnd(p.hireCost * cpi), severance: rnd(p.wage * cpi), perStaff: p.perStaff },
    marketing: { current: b.marketing, max: p.mktMaxSpend, presets: mktPresets(p) },
    order: p.stock === 'inventory' ? { unitLanded: landedUnit(p, cpi, effMult(b, 'cost')), stock: b.stock, onOrder: b.orders.reduce((s, o) => s + o.units, 0), leadTime: p.leadTime || 0, presets: [0, 200, 400, 800] } : null,
    manager: { has: b.manager, wage: rnd(p.managerWage * cpi), energyNow: ownerEnergy(b), energyWith: p.managerEnergy, energyWithout: p.ownerEnergy },
    draw: { current: b.draw, presets: [0, 2000, 5000, 10000, 20000].filter((x) => x <= Math.max(20000, b.cash)), divTax: DIV_TAX },
    expand: p.expand ? { ...p.expand, cost: rnd(p.expand.cost * cpi), done: b.expanded } : null,
    sell: valuation(b),
    suggest: suggest(b),
  };
}

/**
 * The part of a simulate() report that summary() reads, as a small JSON-safe record (rules-4 engine: kept on the asset as
 * `a.bizRep` after every simulated month, so the manage / inbox cards show last month's L1 / L2 without the session news).
 * Realized numbers only — the month is over, nothing sealed in it.
 */
export function reportCard(r) {
  if (!r) return null;
  return { m: r.month ?? null, revenue: r.revenue, revenueGross: r.revenueGross, netProfit: r.netProfit, corpTax: r.corpTax,
    cash: { change: r.cash.change }, toOwner: { net: r.toOwner.net, drawNet: r.toOwner.drawNet },
    cogs: { total: r.cogs.total }, opex: { total: r.opex.total },
    why: r.why ? { sentence: r.why.sentence, cash: r.why.cash.map((x) => ({ ...x })), profit: r.why.profit.map((x) => ({ ...x })) } : null,
    lines: r.lines.map((x) => ({ ...x })), notes: r.notes.map((x) => ({ ...x })), allNotes: (r.allNotes || r.notes).slice(0, 8).map((x) => ({ ...x })), headline: r.headline };
}

/** Compact card data for the UI ("דוח עסקי"). `report` = the last simulate() report, or its reportCard() (optional). */
export function summary(b, report = null) {
  return {
    name: b.name, type: b.type, icon: b.p.icon, model: b.p.model, month: b.month, closed: b.closed,
    cash: b.cash, receivables: b.ar[0] + b.ar[1], stock: b.p.stock === 'inventory' ? { units: b.stock, value: b.stockValue } : null,
    users: b.p.mode === 'subscription' ? b.users : null,
    price: b.price, staff: b.staff, manager: b.manager, marketing: b.marketing, draw: b.draw,
    ownerEnergy: ownerEnergy(b), incomeKind: incomeKind(b),
    breakEven: breakEven(b), valuation: valuation(b),
    lines: report ? report.lines : [], headline: report ? report.headline : '', notes: report ? report.notes : [],
    hist: b.hist.map((x) => ({ m: x.m, rev: x.rev, np: x.np, cash: x.cash })),
    totals: { ...b.totals }, invested: b.invested,
    ...(b.t3 ? summaryT3(b, report) : {}),
  };
}
/** T3 §10.2 layered summary: L1 three numbers + one sentence, L2 groups + cash bridge + receivables + stock, L3 everything. */
function summaryT3(b, r) {
  const last = b.hist[b.hist.length - 1] || null;
  const l1 = { revenue: r ? r.revenue : last ? last.rev : 0, profit: r ? r.netProfit : last ? last.np : 0, cashDelta: r ? r.cash.change : 0, toOwner: r ? r.toOwner.net : 0, sentence: r && r.why ? r.why.sentence : '' };
  const groups = r ? [
    { k: 'revenue', label: 'הכנסות', amount: r.revenue, lines: r.lines.filter((x) => ['gross', 'vatOut', 'revenue'].includes(x.k)) },
    { k: 'cogs', label: 'עלות המכר', amount: -r.cogs.total, lines: r.lines.filter((x) => ['cogs', 'waste'].includes(x.k)) },
    { k: 'opex', label: 'הוצאות', amount: -r.opex.total, lines: r.lines.filter((x) => ['wages', 'manager', 'rent', 'fixed', 'marketing', 'royalty', 'fees', 'depreciation', 'oneOff'].includes(x.k)) },
    { k: 'tax', label: 'מס', amount: -r.corpTax, lines: r.lines.filter((x) => x.k === 'tax') },
    { k: 'profit', label: 'רווח נקי', amount: r.netProfit, lines: [] }] : [];
  const terms = (b.arTerms || []).map((t) => ({ amount: t.amount, due: t.due, client: t.client }));
  return { stage: b.stage, stageName: STAGE_NAMES[b.stage], signature: signature(b), decide: b.decide ? b.decide.key : null, setup: b.setup || 'std',
    seasonProfile: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, mult: ((SEASONS[b.type] || {})[i + 1] || [1])[0] })),
    l1, l2: { groups, cashBridge: r && r.why ? r.why.cash : [], receivables: { now: b.ar[0] + b.ar[1] + terms.reduce((x, t) => x + t.amount, 0), terms },
      stock: b.p.stock === 'inventory' ? { units: b.stock, cover: b.lastUnits ? Math.round(b.stock / Math.max(1, b.lastUnits) * 10) / 10 : null, onOrder: b.orders.reduce((x, o) => x + o.units, 0), value: b.stockValue } : null },
    l3: { lines: r ? r.lines : [], notes: r ? r.allNotes || r.notes : [], hist: b.hist.slice(), breakEven: breakEven(b), retained: b.totals.netProfit - b.totals.drawnGross, totals: { ...b.totals } } };
}

/* ============================================================ presentation helpers */
function plLines(r) {
  const L = []; const add = (k, label, amount, extra = {}) => { if (amount || extra.always) L.push({ k, label, amount, ...extra }); };
  add('gross', 'מכירות (כולל מע"מ)', r.revenueGross, { always: true });
  add('vatOut', 'מע"מ — של המדינה', -r.vatOut);
  add('revenue', 'הכנסות', r.revenue, { always: true, bold: true });
  add('cogs', 'עלות המכר', -(r.cogs.goods + r.cogs.fulfil));
  add('waste', r.cogs.wasteLabel, -r.cogs.waste);
  add('gp', 'רווח גולמי', r.grossProfit, { always: true, bold: true, pct: r.grossMargin });
  add('wages', 'שכר עובדים', -r.opex.wages);
  add('manager', 'שכר מנהל', -r.opex.manager);
  add('rent', 'שכירות', -r.opex.rent);
  add('fixed', 'הוצאות קבועות', -r.opex.fixed);
  add('marketing', 'שיווק', -r.opex.marketing);
  add('royalty', 'תמלוגים לרשת', -r.opex.royalty);
  add('fees', 'עמלות סליקה', -r.opex.fees);
  add('depreciation', 'פחת ציוד', -r.opex.depreciation);
  for (const o of r.opex.oneOffs) add('oneOff', o.label, -o.amount);
  add('ebt', 'רווח לפני מס', r.ebt, { always: true, bold: true });
  add('tax', 'מס חברות 23%', -r.corpTax);
  add('np', 'רווח נקי', r.netProfit, { always: true, bold: true, pct: r.netMargin });
  add('cash', 'שינוי בקופת העסק', r.cash.change, { always: true, sep: true });
  add('owner', 'לכיס שלך (אחרי מס דיבידנד)', r.toOwner.drawNet);
  add('inject', 'הזרמת מכיסך', -r.toOwner.injectedTotal);
  return L;
}

function teach(b, r, prev) {
  const p = b.p; const N = [];
  const note = (id, prio, text, lessonId) => N.push({ id, prio, text, lesson: lessonId || null });
  if (r.toOwner.injection > 0) note('injection', 95, `לעסק נגמר המזומן — הזרמת מהכיס שלך ${fmt(r.toOwner.injection)}. רווח זה דבר אחד; כסף בקופה זה דבר אחר.`, 'biz_receivables');
  if (prev && r.revenue > prev.revenue * 1.03 && r.netProfit < prev.netProfit) {
    const keys = ['wages', 'manager', 'marketing', 'rent', 'fixed', 'royalty', 'fees', 'oneOff'];
    const names = { wages: 'השכר', manager: 'שכר המנהל', marketing: 'השיווק', rent: 'השכירות', fixed: 'ההוצאות הקבועות', royalty: 'התמלוגים', fees: 'העמלות', oneOff: 'הוצאה חד־פעמית' };
    let best = null, bestD = 0; for (const k of keys) { const d = (r.opex[k] || 0) - ((prev.opex && prev.opex[k]) || 0); if (d > bestD) { bestD = d; best = k; } }
    note('rev_up_profit_down', 100, `ההכנסות עלו ב־${fmt(r.revenue - prev.revenue)}, אבל הרווח הנקי ירד ב־${fmt(prev.netProfit - r.netProfit)}${best ? ` — ${names[best]} עלה ב־${fmt(bestD)}` : ''}. יותר מחזור ≠ יותר רווח.`, 'biz_revenue_profit');
  }
  if (r.sub && r.ebt < 0) note('burn', 88, `קצב שריפה: ${fmt(r.sub.burn)} בחודש. ${r.sub.runway != null ? `בקופה נשאר מספיק לעוד ${r.sub.runway} חודשים.` : ''} ${p.unit}: ${r.sub.users} (+${r.sub.newUsers}, −${r.sub.churned}).`, 'biz_burn');
  if (r.sub && r.sub.cac != null) note('ltv_cac', r.sub.cac > r.sub.ltv ? 80 : 30, `כל מנוי מפרסום עלה ${fmt(r.sub.cac)}, ומשאיר בממוצע ${fmt(r.sub.ltv)} עד שהוא עוזב.${r.sub.cac > r.sub.ltv ? ' כל לקוח חדש מעמיק את ההפסד!' : ''}`, 'biz_ltv_cac');
  if (r.netProfit < 0 && !r.sub) note('loss', 90, `החודש העסק הפסיד ${fmt(-r.netProfit)}, למרות מחזור של ${fmt(r.revenueGross)}. הוצאות קבועות לא מחכות שהלקוחות יגיעו.`, 'biz_revenue_profit');
  if (prev && prev.price !== r.price && prev.units > 0) {
    const dp = (r.price / prev.price - 1) * 100, du = (r.units / prev.units - 1) * 100;
    note('elastic', 70, `שינית מחיר ב־${dp > 0 ? '+' : ''}${Math.round(dp)}% — והכמות זזה ב־${du > 0 ? '+' : ''}${Math.round(du)}%. ההכנסות ${r.revenue >= prev.revenue ? 'עלו' : 'ירדו'}, הרווח ${r.netProfit >= prev.netProfit ? 'עלה' : 'ירד'}.`, 'biz_elasticity');
  }
  if (r.lostSales.stock > 0) note('stockout', 78, `המלאי נגמר: ${r.lostSales.stock} ${p.unit} לא נמכרו. בלי מלאי אין מכירות — עם יותר מדי, הכסף תקוע במחסן.`, 'biz_inventory');
  if (r.lostSales.capacity > Math.max(2, r.demand * 0.03)) note('capacity', 66, `${r.lostSales.capacity} ${p.unit} הלכו לאיבוד — לא היו מספיק ${p.equipCap != null && r.capacity < (b.manager ? p.managerCap : p.ownerCap) + b.staff * p.perStaff ? 'מכונות' : 'ידיים'}.`, 'biz_capacity');
  const diff = r.cash.change + r.toOwner.drawGross - r.toOwner.injectedTotal - r.netProfit;
  if (Math.abs(diff) > Math.max(1000, Math.abs(r.netProfit) * 0.25)) {
    const why = [];
    if (r.cash.inventoryBought) why.push(`קנית מלאי ב־${fmt(r.cash.inventoryBought)} (עוד לא הוצאה)`);
    if (r.cash.capex) why.push(`ציוד חדש ב־${fmt(r.cash.capex)}`);
    const arNew = r.revenueGross - r.cash.collected;
    if (arNew > 0) why.push(`${fmt(arNew)} עוד אצל הלקוחות`); else if (arNew < 0) why.push(`נכנסו ${fmt(-arNew)} מלקוחות של החודש הקודם`);
    if (p.stock === 'inventory' && r.cogs.goods + r.cogs.waste > 0) why.push(`עלות הסחורה שנמכרה (${fmt(r.cogs.goods + r.cogs.waste)}) שולמה כבר כשקנית את המלאי`);
    if (r.opex.depreciation) why.push(`פחת ${fmt(r.opex.depreciation)} (הוצאה בלי כסף שיצא)`);
    note('cash_vs_profit', 75, `רווח נקי ${fmt(r.netProfit)}, אבל קופת העסק זזה ב־${sgn(r.cash.change + r.toOwner.drawGross - r.toOwner.injectedTotal)} לפני משיכות.${why.length ? ' הסיבה: ' + why.join(', ') + '.' : ''}`, r.cash.inventoryBought ? 'biz_inventory' : 'biz_receivables');
  }
  const wasteRatio = r.cogs.goods ? r.cogs.waste / r.cogs.goods : (r.cogs.waste ? 1 : 0);
  if (r.cogs.waste >= 300 && wasteRatio > (p.stock === 'fresh' ? p.buffer + 0.04 : 0.05)) note('waste', 62, `${fmt(r.cogs.waste)} הלכו ל${p.stock === 'inventory' ? 'מלאי מת שאף אחד כבר לא יקנה' : 'פח — קנית לפי החודש הקודם, והביקוש ירד'}.`, 'biz_spoilage');
  if (r.opex.marketing > p.mktHalf) {
    const step = rnd(p.mktHalf / 2);
    const gain = (m) => marketingLift(p, m) - marketingLift(p, Math.max(0, m - step));
    const first = gain(step), last = gain(r.opex.marketing);
    note('marketing', 52, `ה־${fmt(step)} הראשונים בשיווק מביאים פי ${Math.max(1, Math.round(first / Math.max(last, 1e-9)))} יותר לקוחות מה־${fmt(step)} האחרונים שהוצאת. תשואה פוחתת.`, 'biz_marketing');
  }
  if (r.toOwner.drawGross > 0) note('draw', 40, `משכת ${fmt(r.toOwner.drawGross)}: ${fmt(r.toOwner.divTax)} מס דיבידנד, ${fmt(r.toOwner.drawNet)} לכיס. מה שנשאר בעסק ממשיך לעבוד בשבילך.`, 'biz_draw');
  if (!b.manager && p.ownerEnergy >= 8) note('owner_job', 45, `העסק עובד רק כשאתה שם: −${p.ownerEnergy} 🔋 כוח בחודש. מנהל יעלה ${fmt(rnd(p.managerWage * b.cpi))} — וישחרר לך את הזמן.`, 'biz_owner_job');
  if (r.breakEven.units != null && !r.sub) note('breakeven', r.units < r.breakEven.units ? 72 : 38, `נקודת האיזון: ${r.breakEven.units} ${p.unit} בחודש. מכרת ${r.units}.`, 'biz_breakeven');
  else if (r.breakEven.units == null) note('no_breakeven', 85, r.breakEven.text, 'biz_breakeven');
  if (r.revenue > 0 && r.netMargin > -100) note('margin', 34, `רווח גולמי ${pctTxt(r.grossMargin)} · רווח נקי ${pctTxt(r.netMargin)} — מכל ₪100 הכנסה ${r.netMargin >= 0 ? `נשארו לך ${fmt(r.netMargin)}` : `הפסדת ${fmt(-r.netMargin)}`}.`, 'biz_gross_net');
  note('vat', 30, `מתוך ${fmt(r.revenueGross)} שהלקוחות שילמו, ${fmt(r.vatOut)} הם מע"מ — כסף של המדינה שרק עובר דרכך.`, 'biz_vat');
  if (r.events.length) note('event', 20, `${r.events[0].title}: ${r.events[0].text}`, null);
  N.sort((a, b2) => b2.prio - a.prio);
  r.allNotes = N.map(({ id, text, lesson }) => ({ id, text, lesson }));
  r.notes = r.allNotes.slice(0, 3);
  r.lessons = [...new Set(r.notes.map((n) => n.lesson).filter(Boolean))];
}

/* ============================================================ T3: decision events, why, growth stage (rules-4 businesses: b.t3) */
const MKT = (b) => b.p.mktHalf;
const lastRev = (b) => (b.last ? b.last.revenue : 0);
const priceAt = (b, k) => clamp(rnd(b.price * k), b.p.minPrice, b.p.maxPrice);
const effOf = (b, id, kind) => b.effects.find((e) => e.id === id && e.kind === kind && e.until >= b.month);
const push = (b, kind, n, v, id) => b.effects.push({ id: id || kind, kind, ...(kind.endsWith('Add') ? { add: v } : { mult: v }), until: b.month + n }); // applies to the next n simulated months
const oneOff = (b, label, amount, vatable = true) => b.queued.push({ kind: 'oneOff', label, amount: rnd(amount), vatable, party: 'services' });
const opt3 = (id, label, extra = {}) => ({ id, label, enabled: true, ...extra });

/** Which random events open a decision (T3 §6.6) — `eventDecides` adds the state conditions (B: an order in transit and < 1.5 months of stock; D: staff left or app). */
export const T3_CHOICES = {
  costSpike: (b) => (b.type === 'laundromat'
    ? [opt3('absorb', 'לספוג את העלייה', { default: true }), opt3('price5', 'להעלות מחיר ב־5%'), opt3('night', 'להפעיל בתעריף לילה', { note: 'חצי מהתוספת לשלושה חודשים — ויותר עבודה לך.' })]
    : [opt3('absorb', 'לספוג את העלייה', { default: true }), opt3('price5', 'להעלות מחיר ב־5%', { note: 'חלק מהלקוחות ילכו.' }),
      opt3('switch', 'לעבור לספק זול יותר', { odds: { p: 0.25, text: 'במשחק: 1 מכל 4 ספקים זולים מאכזב' }, risk: { p: 0.25, amount: rnd(0.08 * 2 * Math.max(0, b.last ? b.last.grossProfit : 0)), label: 'לקוחות מתלוננים: ביקוש −8% לחודשיים' } })]),
  customsDelay: (b) => [opt3('wait', 'לחכות', { default: true }), opt3('air', 'להטיס חלק מהמשלוח', { note: 'טיסה עולה פי 4 מהים.' }), opt3('local', 'לקנות מספק מקומי', { note: 'עד 100 יחידות עכשיו, במחיר פי 1.8, בלי מכס.' })],
  supplierDelay: (b) => [opt3('short', 'תפריט מצומצם', { default: true, note: 'פחות מכירות בחודש הבא.' }), opt3('retail', 'לקנות בסופר', { note: 'עלות המוצר פי 1.3 בחודש הבא.' })],
  staffQuit: (b) => [opt3('leave', 'להסתדר בלי', { default: true }), opt3('replace', 'לגייס מחליף', { enabled: b.staff < b.p.maxStaff, reason: b.staff < b.p.maxStaff ? undefined : 'אין מקום לעוד עובד' }),
    b.p.mode === 'subscription' ? opt3('freelance', 'פרילנסר לשלושה חודשים', { note: 'יקר ב־30% — אבל בלי לחפש.' }) : opt3('cover', 'לכסות בעצמי חודשיים', { note: b.manager ? 'המנהל משלם שעות נוספות.' : 'עוד 6 🔋 בחודש עבודה.' })],
  competitor: (b) => [opt3('ignore', 'להתעלם', { default: true }), opt3('match', 'להוריד מחיר ב־10%'), opt3('loyal', 'כרטיס מועדון ושירות', { note: 'עולה כל חודש, ומחזיק לקוחות.' }),
    opt3('push', 'קמפיין נגדי לחודשיים'), ...(b.p.mode === 'subscription' ? [opt3('freemium', 'גרסה חינמית', { note: 'מחיר −30%, פחות עזיבות לחצי שנה.' })] : [])],
  lateClient: (b) => [opt3('decline', 'לוותר', { default: true }),
    opt3('accept', 'לקבל בתנאים שלו', { odds: { p: 0.25, text: 'במשחק: בערך 1 מכל 4 לקוחות כאלה מאחר בחודש, ו־1 מכל 12 לא משלם בכלל' }, risk: { p: 0.08, amount: b2bOrder(b).gross, label: 'חוב אבוד' } }),
    opt3('advance', 'לבקש 30% מקדמה', { odds: { p: 0.6, text: 'במשחק: 6 מכל 10 מסכימים למקדמה' }, risk: { p: 0.08, amount: rnd(b2bOrder(b).gross * 0.7), label: 'חוב אבוד' } })],
  breakdown: (b) => [opt3('repair', 'לתקן עכשיו', { default: true }), opt3('wait', 'לחכות לטכנאי', { note: 'זול יותר — אבל עוד חודשיים בחצי כוח.' }),
    opt3('replace', b.p.expand ? `${b.p.expand.label} במקום` : 'ציוד חדש במקום', { enabled: !!(b.p.expand && b.expanded < b.p.expand.max), reason: b.p.expand && b.expanded < b.p.expand.max ? undefined : 'אין מקום לעוד ציוד' })],
  platformChange: (b) => [opt3('ignore', 'להתעלם', { default: true }), opt3('ads', 'פרסום ממומן לשלושה חודשים'), opt3('own', 'לבנות רשימת תפוצה ואתר', { note: 'עולה פעם אחת, ומוריד עמלות לתמיד.' })],
  overload: (b) => [opt3('wait', 'לתת להם לחכות', { default: true, note: 'לקוחות שחיכו לא תמיד חוזרים.' }), opt3('temp', 'עובד זמני מחברת כוח אדם'), opt3('price10', 'להעלות מחיר ב־10%'),
    opt3('mktDown', 'לחזור לתקציב השיווק הקודם', { enabled: b.marketing > 0, reason: b.marketing > 0 ? undefined : 'אין תקציב שיווק' })],
  overloadApp: (b) => [opt3('nothing', 'לא לעשות כלום', { default: true, note: 'האפליקציה איטית — יותר מנויים עוזבים.' }), opt3('scale', 'להגדיל שרתים', { note: 'הוצאה קבועה חדשה.' }), opt3('waitlist', 'רשימת המתנה')],
  buyerOffer: (b) => { const off = (b.decide && b.decide.data && b.decide.data.offer) || 0; return [opt3('keep', 'להמשיך לבד', { default: true }), opt3('sell', `למכור ב־${fmt(off)}`, { sale: true }),
    opt3('counter', `להציע ${fmt(rnd(off * 1.1 / 100) * 100)}`, { odds: { p: 0.5, text: 'במשחק: בערך חצי מהקונים מסכימים להצעה נגדית' }, risk: { p: 0.5, amount: 0, label: 'הקונה הולך' } })]; },
  seasonPrep: (b) => seasonChoices(b),
};
/** The order size a lateClient asks for (public: it is the order). */
function b2bOrder(b) {
  const p = b.p; const units = p.mode === 'subscription' ? rnd(3 * p.baseNew * 6) : rnd(0.25 * (p.baseDemand || 0));
  const price = rnd(b.price * 0.9); return { units, price, gross: units * price };
}
function seasonChoices(b) {
  const d = (b.decide && b.decide.data) || {}; const p = b.p;
  switch (b.type) {
    case 'toyshop': { const n = seasonOrder(b, false), g = seasonOrder(b, true);
      return [opt3('normal', `הזמנה רגילה (${n} ${p.unit})`, { default: true }), opt3('big', `הזמנה גדולה לעונה (${g} ${p.unit})`, { enabled: g > 0, reason: g > 0 ? undefined : 'יש כבר מספיק מלאי', note: 'מה שלא יימכר יאבד 2% בחודש.' }), opt3('none', 'בלי הזמנה')]; }
    case 'pizza': return d.kind === 'summer' ? [opt3('asUsual', 'כרגיל', { default: true }), opt3('temp', 'עובד לקיץ', { note: 'יותר ידיים לחודשיים.' })]
      : [opt3('asUsual', 'כרגיל', { default: true }), opt3('close', 'לסגור שבוע ולתת חופש', { note: 'פחות שכר, פחות סחורה שנזרקת.' }), opt3('kosher', 'מנות כשרות לפסח', { note: 'עולה פעם אחת — ומחזיר חלק מהלקוחות.' })];
    case 'coffee': return [opt3('asUsual', 'כרגיל', { default: true }), opt3('popup', 'לעבור לחודש לעמדה בקניון'), opt3('short', 'לקצר שעות', { note: 'פחות שכר ופחות עבודה לך.' })];
    case 'laundromat': return [opt3('asUsual', 'כרגיל', { default: true }), opt3('machine', p.expand ? `${p.expand.label} לפני החורף` : 'מכונה נוספת', { enabled: !!(p.expand && b.expanded < p.expand.max), reason: p.expand && b.expanded < p.expand.max ? undefined : 'אין מקום לעוד מכונה' }), opt3('hours', 'שעות פתיחה ארוכות')];
    case 'app': return [opt3('normal', 'כרגיל', { default: true }), opt3('campaign', 'קמפיין גדול לינואר'), opt3('referral', 'חבר מביא חבר')];
    default: return [opt3('asUsual', 'כרגיל', { default: true })];
  }
}
function seasonOrder(b, big) {
  const p = b.p; const exp = forecast(b, null, 1).reports[0].demand; const onOrder = b.orders.reduce((x, o) => x + o.units, 0);
  const mult = (b.decide && b.decide.data && b.decide.data.mult) || 1;
  const need = big ? exp * mult * ((p.leadTime || 0) + 1) - b.stock - onOrder : exp * ((p.leadTime || 0) + 3) - b.stock - onOrder;
  return need > 0 ? Math.ceil(need / 50) * 50 : 0;
}
/** Does a random event open a decision in this state (§6.6 B, D)? */
function eventDecides(b, id) {
  if (id === 'customsDelay') { if (!b.orders.length) return false; const exp = Math.max(1, b.lastUnits || 1); return b.stock / exp < 1.5; }
  if (id === 'staffQuit') return b.staff > 0 || b.p.mode === 'subscription';
  return true;
}
/** The default ("do nothing") choice of a decision. */
export function defaultChoice(id, b) { const fn = T3_CHOICES[id]; const cs = fn ? fn(b) : []; return (cs.find((c) => c.default) || cs[0] || { id: 'ok' }).id; }
function decideData(b, id) {
  if (id === 'lateClient') return { ...b2bOrder(b), client: (b.p.eventText && b.p.eventText.lateClient) || '' };
  if (id === 'buyerOffer') return {}; // the offer is filled in by decideOffer (it is the buyer's public offer, made with this month's draw)
  return {};
}
const TITLE = { seasonPrep: null, overload: 'הקמפיין הצליח מדי', overloadApp: 'השרתים כורעים', buyerOffer: 'קונה מציע לקנות את העסק' };
const TEXT = { overload: 'יותר לקוחות ממה שאפשר לשרת. חלקם הולכים הביתה.', overloadApp: 'כל כך הרבה נרשמים שהאפליקציה נתקעת.', buyerOffer: 'מישהו רוצה לקנות את העסק — כמו שהוא, עם הלקוחות.' };
const LESSONS_OF = { costSpike: ['biz_gross_net', 'biz_elasticity'], customsDelay: ['biz_inventory'], supplierDelay: ['biz_gross_net'], staffQuit: ['biz_capacity', 'biz_owner_job'],
  competitor: ['biz_elasticity', 'biz_marketing'], lateClient: ['biz_terms', 'biz_receivables', 'biz_vat'], breakdown: ['biz_capacity', 'biz_depreciation'], platformChange: ['biz_marketing'],
  overload: ['biz_capacity', 'biz_elasticity'], overloadApp: ['biz_capacity'], buyerOffer: ['biz_valuation', 'biz_owner_job'], seasonPrep: ['biz_seasonality', 'biz_inventory'] };

/**
 * Apply a decision choice (atomic, pure): → {ok, errors, business, costs, cashNeeded, changes, text, lessons, sale?}.
 * Sealed outcomes use b.decide.seal (the business's story draws of the month the event fired). opts.neutral = previews:
 * sealed parts take their no-risk branch (on time, paid, agreed, accepted).
 */
export function resolveEvent(b0, key, choiceId, opts = {}) {
  const fail = (e) => ({ ok: false, errors: [e], business: b0, costs: { total: 0 }, cashNeeded: 0, changes: [], text: '', lessons: [] });
  const dec = b0.decide; if (!b0.t3 || !dec || dec.key !== key) return fail('stale');
  const cs = (T3_CHOICES[dec.id] || (() => []))(b0); const c = cs.find((x) => x.id === choiceId);
  if (!c) return fail('unknown'); if (!c.enabled) return fail(c.reason || 'disabled');
  let b = clone(b0); b.decide = null; const p = b.p; const a = opts.neutral ? 0.99 : dec.seal.a, sb = opts.neutral ? 0.99 : dec.seal.b;
  let text = c.label; let sale = null; let costs = { total: 0 }, cashNeeded = 0, changes = [];
  const viaDecisions = (d) => { const r = applyDecisions(b, d); if (!r.ok) return r.errors[0]; b = r.business; costs = r.costs; cashNeeded = r.cashNeeded; changes = r.changes; return null; };
  let err = null;
  switch (dec.id + ':' + choiceId) {
    case 'costSpike:price5': err = viaDecisions({ price: priceAt(b, 1.05) }); break;
    case 'costSpike:switch': { const e = effOf(b, 'costSpike', 'cost'); if (e) e.mult = 1.05; if (a < 0.25) { push(b, 'demand', 2, 0.92, 'complaints'); text = b.type === 'toyshop' ? 'מוצרים פגומים והחזרות — ביקוש −8% לחודשיים.' : 'לקוחות התלוננו על הטעם — ביקוש −8% לחודשיים.'; } else text = 'הספק החדש בסדר. העלות עלתה רק ב־5%.'; break; }
    case 'costSpike:night': { const e = effOf(b, 'costSpike', 'fixedMult'); if (e) e.mult = 1.07; push(b, 'energyAdd', 3, 2); break; }
    case 'customsDelay:air': { const o = b.orders[0]; if (o) { const u = Math.floor(o.units * 0.3); if (u > 0) { const v = rnd(o.value * u / o.units); o.units -= u; o.value -= v; b.orders.push({ units: u, value: v, arrive: b.month + 1 }); oneOff(b, 'הטסת סחורה', u * (p.shipping || 0) * 4 * b.cpi); } } break; }
    case 'customsDelay:local': b.queued.push({ kind: 'order', units: 100, goods: rnd(100 * p.unitCost * 1.8 * b.cpi), ship: 0, duty: 0, lead: 0 }); break;
    case 'supplierDelay:short': push(b, 'demand', 1, 0.85, 'shortMenu'); break;
    case 'supplierDelay:retail': push(b, 'cost', 1, 1.3, 'retail'); break;
    case 'staffQuit:replace': err = viaDecisions({ hire: 1 }); break;
    case 'staffQuit:cover': push(b, 'capAdd', 2, rnd(p.perStaff * 0.6)); if (b.manager) oneOff(b, 'שעות נוספות למנהל', p.wage * 0.25 * b.cpi, false); else push(b, 'energyAdd', 2, 6); break;
    case 'staffQuit:freelance': push(b, 'devAdd', 3, 1); push(b, 'wageAdd', 3, rnd(p.wage * 1.3)); break;
    case 'competitor:match': err = viaDecisions({ price: priceAt(b, 0.9) }); break;
    case 'competitor:loyal': { const e = effOf(b, 'competitor', 'demand'); if (e) e.mult = 0.9; push(b, 'fixedAdd', 6, Math.round(0.03 * lastRev(b) / 100) * 100); break; }
    case 'competitor:push': push(b, 'mktAdd', 2, MKT(b)); break;
    case 'competitor:freemium': err = viaDecisions({ price: priceAt(b, 0.7) }); push(b, 'churnMult', 6, 0.8); break;
    case 'lateClient:accept': case 'lateClient:advance': {
      const o = b2bOrder(b); const adv = choiceId === 'advance';
      if (adv && !(((a * 9973 + sb * 7919) % 1) < 0.6)) { text = 'הלקוח לא הסכים למקדמה — והלך למתחרה.'; break; } // T3 review m1: agreement from a third derived value, so "late" (a) and "bad" (b) keep their shown odds
      b.queued.push({ kind: 'b2b', units: o.units, price: o.price, adv: adv ? 0.3 : 0, late: a < 0.25, bad: sb < 0.08, client: dec.data.client || '' });
      text = adv ? 'הלקוח הסכים: 30% עכשיו, השאר בעוד חודשיים.' : 'ההזמנה יוצאת בחודש הבא. התשלום — בעוד חודשיים.'; break; }
    case 'breakdown:repair': oneOff(b, 'תיקון הציוד', p.repair * b.cpi); break;
    case 'breakdown:wait': push(b, 'cap', 2, 0.7, 'breakdownWait'); oneOff(b, 'טכנאי (מחיר מוזל)', p.repair * 0.6 * b.cpi); break;
    case 'breakdown:replace': err = viaDecisions({ expand: 1 }); break;
    case 'platformChange:ads': push(b, 'mktAdd', 3, rnd(MKT(b) * 0.5)); break;
    case 'platformChange:own': oneOff(b, 'רשימת תפוצה ואתר', 6000 * b.cpi); p.feePct = Math.max(0, Math.round((p.feePct - 0.01) * 1000) / 1000); break;
    case 'overload:wait': push(b, 'demand', 2, 0.95, 'waited'); break;
    case 'overload:temp': { const cp = capacity(b); push(b, 'cap', 2, cp > 0 ? 1 + p.perStaff / cp : 1, 'temp'); oneOff(b, 'עובד זמני', p.wage * 0.6 * b.cpi, false); break; }
    case 'overload:price10': err = viaDecisions({ price: priceAt(b, 1.1) }); break;
    case 'overload:mktDown': err = viaDecisions({ marketing: Math.min(b.marketing, b.prevMarketing ?? Math.max(0, rnd(b.marketing / 2))) }); break;
    case 'overloadApp:nothing': push(b, 'churnMult', 2, 1.4); break;
    case 'overloadApp:scale': push(b, 'fixedAdd', 9999, 2500); break;
    case 'overloadApp:waitlist': push(b, 'newUsersCap', 1, 1.5); break;
    case 'buyerOffer:sell': sale = { price: dec.data.offer || 0 }; text = 'מכרת את העסק.'; break;
    case 'buyerOffer:counter': if (sb < 0.5) { sale = { price: rnd((dec.data.offer || 0) * 1.1 / 100) * 100 }; text = 'הקונה הסכים להצעה הנגדית!'; } else text = 'הקונה אמר "לא תודה" והלך.'; break;
    case 'seasonPrep:normal': { if (p.stock !== 'inventory') break; const n = seasonOrder(b0, false); if (n > 0) err = viaDecisions({ order: n }); break; }
    case 'seasonPrep:big': err = viaDecisions({ order: seasonOrder(b0, true) }); break;
    case 'seasonPrep:close': push(b, 'wageMult', 1, 0.75); push(b, 'seasonSet', 1, 0.4); break;
    case 'seasonPrep:kosher': oneOff(b, 'מנות כשרות לפסח', 3000 * b.cpi); push(b, 'seasonSet', 1, 0.85); break;
    case 'seasonPrep:temp': push(b, 'capAdd', 2, p.perStaff); oneOff(b, 'עובד לקיץ', p.wage * 2 * b.cpi, false); break;
    case 'seasonPrep:popup': oneOff(b, 'עמדה בקניון לחודש', 2500 * b.cpi); push(b, 'seasonSet', 1, 1.05); break;
    case 'seasonPrep:short': push(b, 'wageMult', 1, 0.7); push(b, 'cap', 1, 0.7, 'shortHours'); push(b, 'energyAdd', 1, -6); break;
    case 'seasonPrep:machine': err = viaDecisions({ expand: 1 }); break;
    case 'seasonPrep:hours': push(b, 'fixedAdd', 3, 800); push(b, 'cap', 3, 1.1, 'longHours'); break;
    case 'seasonPrep:campaign': push(b, 'mktAdd', 1, Math.max(b.marketing, MKT(b))); break;
    case 'seasonPrep:referral': oneOff(b, 'חבר מביא חבר', 4000 * b.cpi); push(b, 'newUsersMult', 2, 1.2); break;
    default: break; // the "do nothing" choices
  }
  if (err) return fail(err);
  return { ok: true, errors: [], business: b, costs, cashNeeded, changes, text, lessons: LESSONS_OF[dec.id] || [], sale };
}
/**
 * The open decision of a business as a card: {key, id, title, text, choices:[{id, label, note, enabled, reason, default, odds, risk, preview:{delta3, cash3}}], lessons, due}.
 * Previews = a 3-month deterministic forecast (neutral luck, sealed parts at their no-risk branch) minus the default's. opts.cal = the next simulated calendar month.
 */
export function eventChoices(b, opts = {}) {
  const d = b.decide; if (!b.t3 || !d) return null;
  const E = EVENTS[d.id]; const sp = d.id === 'seasonPrep' ? d.data : null;
  const title = sp ? sp.title : TITLE[d.id] || (E && E.title) || d.id;
  const text = sp ? (b.type === 'toyshop' ? `בעונה מוכרים פי ${sp.mult}. מלאי שמגיע אחרי החג נשאר במחסן.` : b.type === 'pizza' && sp.kind !== 'summer' ? 'רוב הלקוחות לא אוכלים חמץ — הביקוש יורד לבערך 60%.'
    : b.type === 'pizza' ? 'יותר משלוחים בערב.' : b.type === 'coffee' ? 'בחגים יש פחות נוסעים.' : b.type === 'laundromat' ? 'בחורף כולם מייבשים אצלך.' : 'הרשמות פי 1.5 בינואר.')
    : d.id === 'lateClient' ? `${(b.p.eventText && b.p.eventText.lateClient) || E.text} ${d.data.units} ${b.p.unit} ב־${fmt(d.data.gross)}.`
    : d.id === 'buyerOffer' ? `${TEXT.buyerOffer} ההצעה: ${fmt(d.data.offer || 0)}.` : TEXT[d.id] || (b.p.eventText && b.p.eventText[d.id]) || (E && E.text) || '';
  const cs = T3_CHOICES[d.id](b);
  const def = cs.find((c) => c.default) || cs[0];
  const f3 = (x) => forecast(x, null, 3, { cal: opts.cal, restock: PREVIEW_RESTOCK[d.id] ?? 0 });
  const baseR = resolveEvent(b, d.key, def.id, { neutral: true }); const base = baseR.ok ? f3(baseR.business) : null;
  const choices = cs.map((c) => {
    let preview = { delta3: 0, cash3: 0 };
    if (c.enabled && base && c.id !== def.id && !(d.id === 'buyerOffer')) {
      const r = resolveEvent(b, d.key, c.id, { neutral: true });
      if (r.ok) { const f = f3(r.business); preview = { delta3: f.netProfit - base.netProfit, cash3: f.cashChange - base.cashChange - (r.cashNeeded || 0) }; if (!preview.delta3 && !preview.cash3) preview.why = noEffectWhy(b, d.id, c.id); }
    }
    return { id: c.id, label: c.label, note: c.note || '', enabled: c.enabled, reason: c.reason, default: !!c.default, odds: c.odds || null, risk: c.risk || null, preview, sale: c.sale || false };
  });
  return { key: d.key, id: d.id, month: d.m, title, text, choices, lessons: LESSONS_OF[d.id] || [], data: { ...d.data } };
}
/** Previews of inventory businesses assume the usual restock from this forecast month on (seasonPrep / customsDelay ARE this month's order: from month 1). */
export const PREVIEW_RESTOCK = { seasonPrep: 1, customsDelay: 1 };
/** Why a choice's 3-month preview is exactly zero (shown with the ₪0, so it never reads as a bug). */
function noEffectWhy(b, id, choiceId) {
  const p = b.p; const k = id + ':' + choiceId;
  if (p.stock === 'inventory' && id === 'costSpike') return 'בשלושת החודשים הקרובים לא תזמין סחורה חדשה — העלייה תפגע רק בהזמנה הבאה.';
  if (['staffQuit:cover', 'overload:temp', 'seasonPrep:temp'].includes(k)) return `כרגע יש מספיק ידיים לכל הלקוחות — עוד עזרה לא תמכור יותר${k === 'staffQuit:cover' && !b.manager ? '. זה עולה לך רק בכוח (🔋), לא בכסף' : ''}.`;
  if (id === 'lateClient' && p.stock === 'inventory' && b.stock <= 0) return 'אין מלאי לספק את ההזמנה בחודש הבא — בלי סחורה אין מכירה.';
  if (p.mode === 'subscription' && !b.users) return 'עוד אין מנויים — אין על מה שזה ישפיע.';
  if (lastRev(b) <= 0) return 'אין כרגע מכירות — אין על מה שזה ישפיע.';
  return 'בשלושת החודשים הקרובים זה לא משנה את הרווח או את הקופה — ההבדל מגיע רק אחר כך.';
}
/** T3 §6.6 M: is a season-prep decision due after calendar month `cal`? → {peak, title, kind, mult, label} | null */
function seasonPrepFor(b, cal) {
  if (!cal) return null;
  const ahead = (b.p.stock === 'inventory' ? (b.p.leadTime || 0) : 0) + 1;
  const target = ((cal - 1 + ahead) % 12) + 1;
  const sp = (SEASON_PREP[b.type] || []).find((x) => x.peak === target); if (!sp) return null;
  const row = SEASONS[b.type][sp.peak];
  return { peak: sp.peak, title: sp.title, kind: sp.kind || null, mult: row[0], label: row[1] };
}
function overloadDue(b, c) {
  if (b.month - (b.lastDecide.overload ?? -99) < 6) return false;
  if (b.p.mode === 'subscription') return !!(c.sub && c.sub.newUsers >= 2.5 * b.p.baseNew);
  return c.demand > 0 && c.lostCap >= 0.15 * c.demand && ((b.mktRaisedM != null && b.month - b.mktRaisedM <= 2) || c.events.some((e) => e.id === 'viral') || !!(c.season && c.season.mult > 1));
}
function buyerDue(b) {
  if (b.month < 12 || b.stage < 2 || b.month - (b.lastDecide.buyerOffer ?? -99) < 12) return false;
  const h = b.hist.slice(-6); return h.length === 6 && h.every((x) => x.np > 0);
}
/** The buyer's offer is made with this month's first story draw (shown on the card: it IS the event). */
export function decideOffer(b) { if (!b.decide || b.decide.id !== 'buyerOffer') return b; const v = valuation(b); b.decide.data.offer = Math.round(v.price * (0.9 + 0.4 * b.decide.seal.a) / 100) * 100; return b; }
function stockCoverOf(b, demand) { return Math.round(b.stock / Math.max(1, demand) * 10) / 10; }

/** T3 §6.8 growth-stage target (0–3) from the business's own history. */
export function growthTarget(b) {
  const h = b.hist; if (b.month < 3 || h.length < 3) return 0;
  const l3 = h.slice(-3); const avgNp = l3.reduce((x, r) => x + r.np, 0) / 3; const avgRev = l3.reduce((x, r) => x + r.rev, 0) / 3;
  if (avgNp < 0) return 0;
  const app = b.p.mode === 'subscription';
  let s1;
  if (app) { const u = h.slice(-3).map((r) => r.users || 0); const lastBurn = h[h.length - 1].np < 0 ? -h[h.length - 1].np : 0; s1 = u[2] > u[0] || (lastBurn ? b.cash / lastBurn >= 12 : true); }
  else { const be = breakEven(b).units; s1 = be != null && h.slice(-2).every((r) => r.units >= be); }
  if (!s1) return 0;
  const f3 = b.first3 && b.first3.length ? b.first3.reduce((x, y) => x + y, 0) / b.first3.length : avgRev;
  const s2 = avgRev >= 1.25 * f3 || b.expanded >= 1 || b.staff >= (b.startStaff || 0) + 2 || (app && b.users >= 2 * (b.startUsers || 1));
  if (!s2) return 1;
  const s3 = b.month >= 12 && (b.manager || valuation(b).price >= 2.5 * b.invested) && (b.expanded >= 1 || (app && b.users >= 4 * (b.startUsers || 1)));
  return s3 ? 3 : 2;
}
/** Hysteresis: up one step after 2 months with a higher target, down one after 3 lower; at most ±1 a month. */
function stageStep(b) {
  const t = growthTarget(b);
  if (t > b.stage) { b.stageUp++; b.stageDown = 0; if (b.stageUp >= 2) { b.stage++; b.stageUp = 0; } }
  else if (t < b.stage) { b.stageDown++; b.stageUp = 0; if (b.stageDown >= 3) { b.stage--; b.stageDown = 0; } }
  else { b.stageUp = 0; b.stageDown = 0; }
}

/** T3 §6.7 "why did it change": a profit bridge (Σ = Δ net profit) and a cash bridge (net profit + Σ = cash change), integers, + one sentence. */
function whyOf(b, r, prev, c) {
  const items = []; const add = (k, amount, text) => { if (amount) items.push({ k, amount, text }); };
  const profit = [];
  if (prev) {
    const dNp = r.netProfit - prev.netProfit;
    const priceEff = rnd((r.price - prev.price) * prev.units * 100 / (100 + VAT_PCT));
    const sold = r.units + (c.b2bUnits || 0);
    const ucNow = sold ? (r.cogs.goods + r.cogs.fulfil) / sold : 0; const ucPrev = prev.uc ?? ucNow;
    const unitCost = prev.uc != null && sold ? -rnd((ucNow - ucPrev) * sold) : 0;
    const waste = -(r.cogs.waste - (prev.waste || 0));
    const volume = (r.grossProfit - prev.grossProfit) - priceEff - unitCost - waste;
    const pl = [];
    if (priceEff) pl.push({ k: 'price', amount: priceEff, text: `שינוי המחיר ל־${fmt(r.price)}` });
    if (volume) { const f = volumeFactor(b, r, prev, c); pl.push({ k: f.k, amount: volume, text: f.text }); }
    if (unitCost) pl.push({ k: 'unitCost', amount: unitCost, text: unitCost < 0 ? 'עלייה בעלות המוצר' : 'ירידה בעלות המוצר' });
    if (waste) pl.push({ k: 'waste', amount: waste, text: r.cogs.wasteLabel });
    const NAMES = { wages: 'שכר עובדים', manager: 'שכר מנהל', rent: 'שכירות', fixed: 'הוצאות קבועות', marketing: 'שיווק', royalty: 'תמלוגים לרשת', fees: 'עמלות', depreciation: 'פחת', oneOff: 'הוצאה חד־פעמית', badDebt: 'חוב אבוד' };
    let small = 0;
    for (const k of Object.keys(NAMES)) { const d = -((r.opex[k] || 0) - ((prev.opex && prev.opex[k]) || 0)); if (!d) continue; if (Math.abs(d) >= 200) pl.push({ k, amount: d, text: `${NAMES[k]} ${d < 0 ? '+' : '−'}${fmt(Math.abs(d))}` }); else small += d; }
    const tax = -(r.corpTax - (prev.corpTax || 0)); if (tax) pl.push({ k: 'tax', amount: tax, text: 'מס חברות' });
    const other = dNp - pl.reduce((x, i) => x + i.amount, 0); // = the small opex lines (exact remainder)
    void small; if (other) pl.push({ k: 'other', amount: other, text: 'ועוד' });
    profit.push(...pl);
  }
  const arNow = r.receivables; const bad = (r.opex && r.opex.badDebt) || 0; const dAr = arNow - c.arPrevT + bad; // T3 review M6: a write-off is not a collection
  add('depreciation', r.opex.depreciation, 'פחת — הוצאה בלי כסף שיצא');
  add('badDebt', bad, 'חוב אבוד — הוצאה שלא יצאה מהקופה');
  add('stock', -r.cash.inventoryBought, `קנית מלאי ב־${fmt(r.cash.inventoryBought)} — ייכנס להכנסות כשתמכור`);
  add('cogsStock', c.cogsFromStock, 'סחורה שנמכרה שולמה כבר');
  add('ar', -dAr, dAr > 0 ? `${fmt(dAr)} עוד אצל לקוחות` : `נכנסו ${fmt(-dAr)} מלקוחות של החודשים הקודמים`);
  add('capex', -r.cash.capex, `ציוד חדש ב־${fmt(r.cash.capex)}`);
  add('draw', -r.toOwner.drawGross, 'משכת לכיס');
  add('inject', c.injected, 'הזרמת מהכיס');
  const rest = r.cash.change - r.netProfit - items.reduce((x, i) => x + i.amount, 0);
  add('vat', rest, 'מע״מ ותזמון תשלומים');
  const top = (xs) => xs.slice().sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))[0] || null;
  const tp = top(profit.filter((x) => x.k !== 'other')) || top(profit); const tc = top(items);
  const dNp = prev ? r.netProfit - prev.netProfit : 0; const dc = r.cash.change;
  let sentence;
  if (!prev) sentence = tc ? `החודש הראשון: ${tc.text}.` : 'החודש הראשון של העסק.';
  else if (Math.abs(dNp) < 200 && Math.abs(dc - r.netProfit) < 200) sentence = 'חודש יציב — כמעט בלי שינוי.';
  else {
    // T3 review M6: noun-phrase reasons; the cash clause compares the cash change with the PROFIT (the profit is most of it)
    const p1 = Math.abs(dNp) < 200 ? 'הרווח כמעט לא זז' : `הרווח ${dNp > 0 ? 'עלה' : 'ירד'} ב־${fmt(Math.abs(dNp))}${tp ? `, בעיקר בגלל ${tp.k === 'other' ? 'שינויים קטנים בהוצאות' : tp.text}` : ''}`;
    const gap = dc - r.netProfit; const glue = (dc >= 0) !== (dNp >= 0) ? ', אבל ' : ', ו';
    const moved = `הקופה ${dc >= 0 ? 'עלתה' : 'ירדה'} ב־${fmt(Math.abs(dc))}`;
    const p2 = Math.abs(gap) < 500 ? `${glue}${moved} — בערך כמו הרווח` : `${glue}${moved} — ${fmt(Math.abs(gap))} ${gap > 0 ? 'יותר' : 'פחות'} מהרווח${tc ? `, בעיקר כי ${tc.text}` : ''}`;
    sentence = `${p1}${p2}.`;
  }
  return { profit, cash: items, sentence };
}
function volumeFactor(b, r, prev, c) {
  const rat = (x, y) => (y ? Math.abs(x / y - 1) : 0);
  const sNow = c.season ? c.season.mult : 1, sPrev = prev.season ?? 1;
  const econIds = new Set(['cycle_rec', 'cycle_exp', 'recession', 'shock']);
  const econ = b.effects.some((e) => e.kind === 'demand' && e.until >= b.month && econIds.has(e.id));
  const dem = Math.max(1, r.demand || r.units || 1);
  const f = [
    { k: 'season', v: rat(sNow, sPrev), text: c.season ? `${c.season.label} (ביקוש פי ${c.season.mult})` : 'סוף העונה' },
    { k: econ ? 'econ' : 'event', v: rat(c.demShock, prev.demShock ?? c.demShock), text: econ ? 'מצב הכלכלה' : r.events.length ? r.events[0].title : 'השפעה של אירוע קודם' },
    { k: 'marketing', v: rat(1 + c.lift, 1 + (prev.lift ?? c.lift)), text: `שיווק ${fmt(r.opex.marketing)} בחודש` },
    { k: 'capacity', v: Math.abs((r.lostSales.capacity || 0) - (prev.lostCap || 0)) / dem, text: r.lostSales.capacity > (prev.lostCap || 0) ? 'לקוחות שלא קיבלו שירות (חסרו ידיים או מכונות)' : 'פחות לקוחות שלא קיבלו שירות' },
    { k: 'stock', v: Math.abs((r.lostSales.stock || 0) - (prev.lostStock || 0)) / dem, text: r.lostSales.stock > (prev.lostStock || 0) ? 'מלאי שנגמר' : 'מלאי שחזר למדפים' },
    { k: 'noise', v: rat(c.noise, prev.noise ?? c.noise), text: c.noise >= (prev.noise ?? c.noise) ? 'חודש חזק מהרגיל' : 'חודש חלש מהרגיל' },
  ];
  return f.sort((x, y) => y.v - x.v)[0];
}
/** Bring a pre-T3 business of a rules-4 game up to T3 (save migration, idempotent): T3 event table, general expansion, state fields. */
export function upgradeT3(b0) {
  if (b0.t3) return b0;
  const b = clone(b0); const P = T3_PARAMS[b.type] || {};
  b.p.events = { ...(P.events || b.p.events) }; delete b.p.events.holiday;
  if (P.eventText) b.p.eventText = { ...(b.p.eventText || {}), ...P.eventText };
  if (P.expand && !b.p.expand) b.p.expand = { ...P.expand };
  Object.assign(b, { t3: 1, setup: 'std', arTerms: [], stage: 0, stageUp: 0, stageDown: 0, decide: null, lastDecide: {}, startStaff: b.staff, startUsers: b.users || 0, first3: b.hist.slice(0, 3).map((h) => h.rev) });
  return b;
}
/** The calendar month (1–12) after `cal` months of offset. */
export const calPlus = (cal, k) => (cal ? ((cal - 1 + k) % 12 + 12) % 12 + 1 : null);
/** §10.2 signature number of the business type (summary). */
export function signature(b) {
  const r = b.hist[b.hist.length - 1] || null; const p = b.p;
  switch (b.type) {
    case 'coffee': case 'laundromat': { const cap = capacity(b); const u = r ? r.units : 0; const v = cap ? Math.round(u / cap * 100) : 0; return { label: SIGNATURE[b.type], value: v, text: `${v}% מהקיבולת` }; }
    case 'toyshop': { const exp = Math.max(1, b.lastUnits || p.baseDemand || 1); const v = Math.round(b.stock / exp * 10) / 10; return { label: SIGNATURE.toyshop, value: v, text: `${v} חודשים · ${fmt(b.stockValue)} תקועים במלאי` }; }
    case 'pizza': { const v = r && r.rev ? Math.round(r.np / r.rev * 100) : 0; return { label: SIGNATURE.pizza, value: v, text: `${fmt(v)} מכל ₪100` }; }
    case 'app': { const burn = r && r.np < 0 ? -r.np : 0; const v = burn ? Math.floor(Math.max(0, b.cash) / burn) : null; return { label: SIGNATURE.app, value: v, text: v == null ? 'העסק לא שורף כסף' : `${v} חודשים` }; }
    default: return null;
  }
}
