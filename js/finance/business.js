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
};

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
  const p = { ...clone(base), ...(opts.overrides ? clone(opts.overrides) : {}) };
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
  return {
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
/** Units the business can serve this month (labour × equipment). Subscription: unlimited. */
export function capacity(b) {
  const p = b.p;
  if (p.mode === 'subscription') return Infinity;
  const labour = (b.manager ? p.managerCap : p.ownerCap) + b.staff * p.perStaff - b.newHires * p.perStaff * 0.5;
  const equip = p.equipCap != null ? p.equipCap + b.expanded * (p.expand ? p.expand.cap : 0) : Infinity;
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
  if (d.marketing != null && d.marketing !== b.marketing) { changes.push({ k: 'marketing', from: b.marketing, to: d.marketing }); b.marketing = d.marketing; }
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
  const p = b.p; const prev = b.last;
  b.month += 1;
  const r1 = rng(), r2 = rng(), r3 = rng(); // ALWAYS 3 draws, whatever happens
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
    if (E.demand) b.effects.push({ id, kind: 'demand', mult: E.demand, until: b.month + E.months - 1 });
    if (E.cost) b.effects.push({ id, kind: 'cost', mult: E.cost, until: b.month + E.months - 1 });
    if (E.cap) b.effects.push({ id, kind: 'cap', mult: E.cap, until: b.month + E.months - 1 });
    if (E.oneOff) oneOffs.push({ label: E.title, amount: rnd(p[E.oneOff] * b.cpi), vatable: E.oneOff === 'repair', party: E.oneOff === 'fine' ? 'state' : 'services' });
    if (E.staff) { if (b.staff > 0) { b.staff -= 1; b.newHires = Math.min(b.newHires, b.staff); } else ev.text = 'עובד שעמד להצטרף ביטל ברגע האחרון. נשארת לבד.'; }
    if (E.delay) { if (b.orders.length) b.orders.forEach((o) => { o.arrive += E.delay; }); else ev.text = 'הנמל עמוס — טוב שלא היה לך משלוח בדרך.'; }
    if (E.extra) extra = p.mode === 'subscription' ? rnd(p.baseNew * 3) : rnd((p.baseDemand || 0) * E.extra);
    ev.effect = E.demand ? `ביקוש ×${E.demand} ל־${E.months} חודשים` : E.cost ? `עלות המוצר +${rnd((E.cost - 1) * 100)}% ל־${E.months} חודשים` : E.cap ? 'קיבולת −30% החודש' : E.oneOff ? `הוצאה חד־פעמית ${fmt(oneOffs[oneOffs.length - 1].amount)}` : E.extra ? `+${extra} ${p.unit} החודש` : '';
    events.push(ev);
  }

  // ---- queued decisions: owner injection, inventory orders, equipment, one-off costs
  let vatIn = 0, capex = 0, orderPay = 0, dutyPaid = 0, decidedInject = 0;
  for (const q of b.queued) {
    if (q.kind === 'inject') { receive('owner', q.amount); b.invested += q.amount; b.totals.injected += q.amount; decidedInject += q.amount; }
    else if (q.kind === 'order') {
      const base = q.goods + q.ship; const v = vatOn(base + q.duty);
      pay('suppliers', base + v); pay('state', q.duty); vatIn += v; orderPay += base + q.duty; dutyPaid += q.duty;
      b.orders.push({ units: q.units, value: base + q.duty, arrive: b.month + (p.leadTime || 0) });
    } else if (q.kind === 'capex') {
      const v = vatOn(q.cost); pay('suppliers', q.cost + v); vatIn += v; capex += q.cost;
      b.expanded += q.units; b.equipment.cost += q.cost; b.equipment.book += q.cost;
      b.equipment.dep = rnd(b.equipment.book / p.equipLife);
    } else if (q.kind === 'oneOff') oneOffs.push(q);
  }
  b.queued = [];
  // arrivals
  let arrived = 0;
  b.orders = b.orders.filter((o) => { if (o.arrive <= b.month) { b.stock += o.units; b.stockValue += o.value; arrived += o.units; return false; } return true; });

  // ---- demand, capacity, units
  const cpi = b.cpi, costM = effMult(b, 'cost'), demM = effMult(b, 'demand');
  const noise = 0.9 + 0.2 * r1;
  const pf = priceFactor(p, b.price);
  const lift = marketingLift(p, b.marketing);
  let units, demand, cap = capacity(b), lostCap = 0, lostStock = 0, sub = null;
  if (p.mode === 'subscription') {
    const devs = b.staff + (b.manager ? 0 : 1);
    const churnRate = p.churn * (2 / (1 + devs)) * clamp(1 + 0.5 * p.elasticity * ((b.price - p.refPrice) / p.refPrice), 0.5, 2);
    const organic = p.baseNew * (1 + 0.2 * devs);
    const fromMkt = rnd(lift * pf * demM * noise);
    const newUsers = rnd(organic * pf * demM * noise) + fromMkt + extra;
    const churned = rnd(b.users * churnRate);
    const before = b.users;
    b.users = Math.max(0, b.users - churned + newUsers);
    units = demand = b.users;
    sub = { before, newUsers, fromMkt, churned, churnRate: Math.round(churnRate * 10000) / 10000, devs };
  } else {
    demand = rnd((p.baseDemand * pf * (1 + lift) * demM) * noise) + extra;
    units = Math.min(demand, cap);
    lostCap = demand - units;
    if (p.stock === 'inventory' && units > b.stock) { lostStock = units - b.stock; units = b.stock; }
  }

  // ---- P&L (accrual, VAT excluded)
  const gross = units * b.price;
  const vatOut = vatOf(gross);
  const revenue = gross - vatOut;
  const unitC = p.unitCost * cpi * costM;
  let goods = 0, waste = 0, purchases = 0, dead = 0;
  if (p.stock === 'fresh') {
    const fc = b.lastUnits == null ? units : b.lastUnits;
    const bought = Math.max(units, rnd(fc * (1 + p.buffer)));
    goods = rnd(units * unitC); waste = rnd((bought - units) * unitC); purchases = goods + waste;
  } else if (p.stock === 'inventory') {
    if (units > 0) { goods = b.stock === units ? b.stockValue : rnd((b.stockValue * units) / b.stock); b.stock -= units; b.stockValue -= goods; }
    const deadUnits = rnd(b.stock * (p.deadRate || 0));
    if (deadUnits > 0) { dead = deadUnits === b.stock ? b.stockValue : rnd((b.stockValue * deadUnits) / b.stock); b.stock -= deadUnits; b.stockValue -= dead; }
    waste = dead;
  } else { goods = rnd(units * unitC); purchases = goods; }
  const fulfil = rnd(units * (p.fulfil || 0) * cpi);
  const cogs = goods + waste + fulfil;
  const grossProfit = revenue - cogs;
  const wages = rnd(b.staff * p.wage * cpi);
  const managerWage = b.manager ? rnd(p.managerWage * cpi) : 0;
  const rent = rnd(p.rent * cpi), fixed = rnd(p.fixed * cpi);
  const marketing = b.marketing;
  const royalty = rnd(revenue * (p.royaltyPct || 0));
  const fees = rnd(gross * (p.feePct || 0));
  const depreciation = Math.min(b.equipment.book, b.equipment.dep);
  const oneOff = oneOffs.reduce((s, o) => s + o.amount, 0);
  const opexTotal = wages + managerWage + rent + fixed + marketing + royalty + fees + depreciation + oneOff;
  const ebt = grossProfit - opexTotal;
  let taxable = 0;
  if (ebt > 0) { const used = Math.min(b.taxLoss, ebt); b.taxLoss -= used; taxable = ebt - used; } else b.taxLoss += -ebt;
  const corpTax = rnd(taxable * CORP_TAX);
  const netProfit = ebt - corpTax;
  b.equipment.book -= depreciation;

  // ---- cash (who gets paid)
  const collectedNow = rnd(gross * p.cashShare);
  const arDue = b.ar[0];
  receive('customers', collectedNow + arDue);
  b.ar = [b.ar[1], 0];
  const arNew = gross - collectedNow;
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

  // ---- bookkeeping
  b.lastUnits = units; b.newHires = 0;
  const t = b.totals; t.revenue += revenue; t.netProfit += netProfit; t.drawnGross += drawGross; t.drawnNet += drawNet;
  t.vat += vatPayable; t.corpTax += corpTax; t.divTax += divTax; t.duty += dutyPaid; t.months += 1;
  const be = breakEven(b);
  const grossMargin = revenue ? grossProfit / revenue : 0, netMargin = revenue ? netProfit / revenue : 0;
  const report = {
    month: b.month, type: b.type, name: b.name, unit: p.unit,
    price: b.price, units, demand, capacity: cap === Infinity ? null : cap, lostSales: { capacity: lostCap, stock: lostStock },
    revenueGross: gross, vatOut, revenue,
    cogs: { goods, waste, fulfil, total: cogs, wasteLabel: p.stock === 'inventory' ? 'מלאי מת' : 'פחת וזריקות' },
    grossProfit, grossMargin: pct1(grossMargin),
    opex: { wages, manager: managerWage, rent, fixed, marketing, royalty, fees, depreciation, oneOff, oneOffs: oneOffs.map((o) => ({ label: o.label, amount: o.amount })), total: opexTotal },
    ebt, taxable, corpTax, taxLossCarry: b.taxLoss, netProfit, netMargin: pct1(netMargin),
    vat: { output: vatOut, input: vatIn, payable: vatPayable },
    cash: { start: cash0, collected: collectedNow + arDue, beforeOwner: cashBeforeOwner, end: b.cash, change: cashChange,
      inventoryBought: orderPay, capex },
    receivables: b.ar[0] + b.ar[1],
    inventory: p.stock === 'inventory' ? { units: b.stock, value: b.stockValue, arrived, onOrder: b.orders.reduce((s, o) => s + o.units, 0) } : null,
    flows,
    toOwner: { drawGross, divTax, drawNet, injection, injectedTotal: injectedThisMonth, net: drawNet - injectedThisMonth },
    ownerEnergy: ownerEnergy(b), incomeKind: incomeKind(b),
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
  b.last = { month: b.month, revenue, netProfit, units, price: b.price, grossProfit, opex: { ...report.opex, oneOffs: undefined }, waste, marketing, staff: b.staff, ebt };
  b.hist.push({ m: b.month, rev: revenue, gp: grossProfit, opex: opexTotal, ebt, one: oneOff, np: netProfit, cash: b.cash, units, users: b.users || undefined, draw: drawNet });
  if (b.hist.length > HIST_MAX) b.hist.shift();
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
  const cashIn = b.cash, receivables = b.ar[0] + b.ar[1];
  const proceeds = price + cashIn + receivables;
  const gain = proceeds - b.invested;
  const tax = gain > 0 ? rnd(gain * CAP_GAINS) : 0;
  return { price, method, multiple: method === 'revenue' ? p.revMultiple : p.multiple, normMonthlyProfit: normMonthly, floor, profitValue, revenueValue,
    growth: Math.round(growth * 1000) / 1000, cash: cashIn, receivables, proceeds, invested: b.invested, gain, tax, net: proceeds - tax, text };
}
/** Sell the business. → {business (closed), sale: valuation + {net}}. The engine credits sale.net to the player. */
export function sell(b0) {
  if (b0.closed) throw new Error('business.sell: already closed');
  const sale = valuation(b0);
  const b = clone(b0); b.closed = true; b.soldFor = sale.price; b.cash = 0; b.ar = [0, 0]; b.stock = 0; b.stockValue = 0; b.orders = []; b.queued = [];
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
export function forecast(b, decisions = null, months = 1) {
  const out = []; let cur = b;
  for (let i = 0; i < months; i++) { const r = simulate(cur, i === 0 ? decisions : null, () => 0.5, { noEvents: true }); out.push(r.report); cur = r.business; }
  return { reports: out, business: cur, netProfit: out.reduce((s, r) => s + r.netProfit, 0), cashChange: out.reduce((s, r) => s + r.cash.change, 0) };
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

/** Compact card data for the UI ("דוח עסקי"). `report` = the last simulate() report (optional). */
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
  };
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
  if (!b.manager && p.ownerEnergy >= 8) note('owner_job', 45, `העסק עובד רק כשאתה שם: −${p.ownerEnergy} אנרגיה בחודש. מנהל יעלה ${fmt(rnd(p.managerWage * b.cpi))} — וישחרר לך את הזמן.`, 'biz_owner_job');
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
