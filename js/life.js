// מירוץ העכברים v3 — "החיים האמיתיים": pure data + pure helpers for the life systems.
// No engine imports (the engine imports us). No DOM, no Math.random, no Date.
import { TAX_IL } from './data/tax.js';
import { ipow } from './finance/bank.js';
//
//  • Israeli payslip (2026 TAX_IL): gross → income tax − credit points, Bituah Leumi + health, pension.
//  • Monthly plans (time & energy), happiness, credit-score bands.
//  • Life events (tile L) — real dilemmas, effects scale with the player's base net salary (S).
//  • LESSONS — the library collection (58 lessons), unlocked by the engine by experience.

/* ============================================================ tax & payslip */
// One tax source: js/data/tax.js TAX_IL (= js/data/real.js TAX_IL, tested equal). TAX is a read-only view of it in the
// shape the formulas below use — derived once at load, never mutated.
const T = TAX_IL;
export const TAX = Object.freeze({
  brackets: Object.freeze(T.brackets.map((b) => Object.freeze([b.upTo == null ? Infinity : b.upTo, b.rate]))),
  creditPoint: T.creditPointValue, points: T.defaultCreditPoints, kidPoints: 1, degreePoints: 1,
  blLow: T.bituachLeumi.reducedUpTo, blRateLow: T.bituachLeumi.employeeReduced, blRateHigh: T.bituachLeumi.employeeFull, blMax: T.bituachLeumi.maxInsurable,
  healthRateLow: T.health.reduced, healthRateHigh: T.health.full,
  pensionEmployee: T.pension.employee, pensionEmployer: T.pension.employer, severance: T.pension.severance,
  capGains: T.capitalGains, rental: T.rentalTrack, rentExempt: T.rentalExemptUpTo,
});

function incomeTaxExact(gross, points) {
  let tax = 0, low = 0;
  for (const [up, rate] of TAX.brackets) { if (gross <= low) break; tax += (Math.min(gross, up) - low) * rate; low = up; }
  return Math.max(0, tax - points * TAX.creditPoint);
}
function blExact(gross) { const g = Math.min(Math.max(0, gross), TAX.blMax); return Math.min(g, TAX.blLow) * TAX.blRateLow + Math.max(0, g - TAX.blLow) * TAX.blRateHigh; }
function healthExact(gross) { const g = Math.min(Math.max(0, gross), TAX.blMax); return Math.min(g, TAX.blLow) * TAX.healthRateLow + Math.max(0, g - TAX.blLow) * TAX.healthRateHigh; }
/** Monthly income tax for a gross salary (after credit points), whole ₪. */
export function incomeTax(gross, points = TAX.points) { return Math.round(incomeTaxExact(gross, points)); }
/** Marginal income-tax rate at this gross. */
export function marginalRate(gross) { for (const [up, rate] of TAX.brackets) if (gross <= up) return rate; return 0.5; }
/** Bituah Leumi + health tax (employee share), whole ₪. */
export function blTax(gross) { return Math.round(blExact(gross) + healthExact(gross)); }
/**
 * Gross → payslip in whole shekels. Net = round(gross − exact deductions) (₪15,000 → ₪11,312 with the 2026 table);
 * the income-tax line absorbs the rounding so the lines always add up exactly.
 */
export function slip(gross, points = TAX.points) {
  gross = Math.max(0, Math.round(gross));
  const itx = incomeTaxExact(gross, points), bl = blExact(gross), hl = healthExact(gross), pe = gross * TAX.pensionEmployee;
  let net = Math.round(gross - itx - bl - hl - pe);
  const blR = Math.round(bl), hlR = Math.round(hl), peR = Math.round(pe);
  let it = gross - net - blR - hlR - peR;
  if (it < 0) { it = 0; net = gross - blR - hlR - peR; } // (rounding) never a negative tax line
  return { gross, incomeTax: it, bl: blR + hlR, bituahLeumi: blR, health: hlR, pensionEmployee: peR, net,
    employerPension: Math.round(gross * TAX.pensionEmployer), severanceDeposit: Math.round(gross * TAX.severance),
    effectiveTaxRate: gross ? Math.round(((it + blR + hlR) / gross) * 1000) / 10 : 0, marginalRate: Math.round(marginalRate(gross) * 100) };
}
/** Integer compound growth: amount × (1+r)^months, rounded to whole ₪ once at the end. */
export function compound(amount, monthlyRate, months) { return Math.round(amount * ipow(1 + monthlyRate, months)); }
/** Smallest gross (rounded up to ₪10) whose net is ≥ `net`. */
export function grossFromNet(net, points = TAX.points) {
  if (net <= 0) return 0;
  let lo = net, hi = net * 3;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (slip(mid, points).net >= net) hi = mid; else lo = mid; }
  return Math.ceil(hi / 10) * 10;
}

/* ============================================================ monthly plans */
export const PLANS = {
  work: { id: 'work', label: 'עבודה רגילה', short: 'רגיל', desc: 'משכורת מלאה, הכוח מתאושש לאט.', grossMult: 1, energy: 4, happiness: 0 },
  overtime: { id: 'overtime', label: 'שעות נוספות', short: 'שעות נוספות', desc: '+25% ברוטו (ממוסה במדרגה הגבוהה שלך), −12 🔋 כוח בחודש.', grossMult: 1.25, energy: -12, happiness: -2 },
  study: { id: 'study', label: 'לימודים', short: 'לימודים', desc: 'שכר לימוד עכשיו, ובסוף — העלאה של 20% בברוטו (במשחק; במציאות זה תלוי בתחום, ואין הבטחה).', grossMult: 1, energy: -6, happiness: -1 },
  side: { id: 'side', label: 'עסק צדדי', short: 'עסק צדדי', desc: 'הכנסה קטנה ומשתנה בערבים. אם תתמיד — היא הופכת לעסק אמיתי.', grossMult: 1, energy: -8, happiness: 0 },
  rest: { id: 'rest', label: 'מנוחה ומשפחה', short: 'מנוחה', desc: '−15% מהברוטו (פחות שעות), +18 🔋 כוח, +אושר.', grossMult: 0.85, energy: 18, happiness: 4 },
};
export const PLAN_IDS = Object.keys(PLANS);
export const LIFE_CFG = {
  startEnergy: 70, startHappiness: 60, setpoint: 55, adapt: 0.1, happyStar: 60,
  burnoutBelow: 25, burnoutBase: 0.2, burnoutSlope: 1 / 40, burnoutCost: 0.3,
  studyNeed: 8, studyCost: 0.12, studyRaise: 0.2,
  sideBase: 0.08, sideLevelEvery: 5, sideBizAt: 15, sideBizCf: 0.3,
  raiseMin: 65, raiseEvery: 10, raiseMult: 0.08,
  debtStressMult: 6, creditStart: 680,
  inflMin: 2, inflMax: 4, inflSpikeChance: 0.1, inflSpike: [6, 8], salaryCpi: 0.8, rentCpi: 0.7, bizCpi: 0.5,
  idx: { start: 100, annual: 0.04, vol: 0.14, crashChance: 0.01, crash: -0.15, crisisHit: -0.08, div: 0.0025 }, // price median +4%/yr + 3%/yr distribution
  realBoi: 3.25, // Bank of Israel rate today (2026-11), for "in the real world" rate hints
};

/* ============================================================ credit score */
/** Band label + how much of the loan cap the bank still offers. The rate spread itself comes from js/finance/bank.js creditSpread. */
export function creditBand(score) {
  if (score >= 760) return { id: 'excellent', label: 'מצוין', capMult: 1 };
  if (score >= 680) return { id: 'good', label: 'טוב', capMult: 1 };
  if (score >= 600) return { id: 'fair', label: 'בינוני', capMult: 1 };
  if (score >= 520) return { id: 'weak', label: 'חלש', capMult: 0.5 };
  return { id: 'poor', label: 'גרוע', capMult: 0 };
}

/* ============================================================ life events (tile L) */
// Effect fields (S = base net salary): cash (×S), monthly (×S, months: 0 = permanent), label, happiness, energy, glow,
// kid, married, grossMult, carCut, study, jobless, workLoad, friend, severance, credit. `primary` = the balanced choice.
export const LIFE_EVENTS = [
  { id: 'wedding', personal: true, title: 'מתחתנים!', text: 'הגיע הזמן. איזו חתונה תהיה לכם? המתנות יכסו חלק מהעלות — לא הכל.', alt: 'vacation', when: (L) => L.family.partner !== 'married', primary: 'modest',
    options: [
      { id: 'modest', label: 'חתונה צנועה בגינה', cash: -1.2, happiness: 8, married: 'modest', note: 'חגיגה קטנה, בלי חוב.' },
      { id: 'big', label: 'אולם גדול, 400 מוזמנים', cash: -2.5, happiness: 9, glow: 6, married: 'big', note: 'אחרי המתנות עדיין חסר כמעט פי 2.5 ממשכורת.' },
      { id: 'registry', label: 'טקס קטן ומסיבה בבית', cash: -0.2, happiness: 5, married: 'small', note: 'הכי זול — וגם הכי שקט.' },
    ] },
  { id: 'baby', personal: true, title: 'רוצים להרחיב את המשפחה?', text: 'החלטה של החיים. ילד מביא אושר עצום — וגם הוצאה קבועה של שנים, ולילות בלי שינה.', alt: 'parent', when: (L) => L.family.kids < 3, primary: 'yes',
    options: [
      { id: 'yes', label: 'כן, עכשיו', cash: -0.5, monthly: 0.1, months: 0, label2: 'ילד/ה', happiness: 10, energy: -12, kid: 1, note: 'הוצאה חודשית קבועה, ושנה ראשונה מתישה.' },
      { id: 'later', label: 'עוד לא — בעוד שנה־שנתיים', happiness: -1, note: 'אפשר לחזור לזה כשהתזרים חזק יותר.' },
    ] },
  { id: 'moving', personal: true, title: 'מעבר דירה?', text: 'החוזה נגמר. בעל הבית רוצה להעלות שכירות — או שזה הזמן לשנות.', primary: 'stay',
    options: [
      { id: 'bigger', label: 'דירה גדולה ומרווחת', cash: -0.3, monthly: 0.1, months: 0, label2: 'דירה גדולה יותר', happiness: 5, note: 'נעים — והוצאה קבועה גבוהה יותר.' },
      { id: 'stay', label: 'נשארים ומקבלים העלאה קטנה', monthly: 0.03, months: 0, label2: 'העלאת שכירות', note: 'הכי פשוט.' },
      { id: 'smaller', label: 'דירה קטנה וזולה', cash: -0.2, monthly: -0.08, months: 0, label2: 'דירה קטנה יותר', happiness: -4, note: 'פחות נוח — יותר תזרים.' },
    ] },
  { id: 'parent', personal: true, title: 'ההורים צריכים עזרה', text: 'אמא שלך צריכה טיפול ותמיכה. המשפחה מסתכלת עליך.', primary: 'monthly',
    options: [
      { id: 'monthly', label: 'עזרה חודשית לשנה', monthly: 0.08, months: 12, label2: 'עזרה להורים', happiness: 4, note: 'מתחלק לאורך שנה.' },
      { id: 'once', label: 'תשלום אחד גדול', cash: -0.9, happiness: 4, note: 'סוגר עניין — ומכווץ את הכרית.' },
      { id: 'no', label: 'לא עכשיו, אולי האחים', happiness: -7, note: 'חוסך כסף. לא חוסך רגשות אשם.' },
    ] },
  { id: 'car', values: true, title: 'הרכב התקלקל', text: 'המוסך אומר: תיבת הילוכים. אפשר לתקן, להחליף — או לוותר על רכב.', primary: 'fix',
    options: [
      { id: 'fix', label: 'לתקן', cash: -0.4, note: 'עוד כמה שנים של נסיעה.' },
      { id: 'new', label: 'רכב חדש בליסינג', cash: -0.3, monthly: 0.12, months: 36, label2: 'ליסינג רכב חדש', glow: 6, note: 'ריח של חדש — ותשלום ל־3 שנים.' },
      { id: 'bus', label: 'אוטובוס ואופניים', energy: -6, happiness: -3, carCut: 0.6, note: 'חוסך את רוב הוצאות הרכב, לתמיד.' },
    ] },
  { id: 'friend', personal: true, title: 'חבר טוב מבקש עזרה', text: 'חבר מילדות פותח עסק ומבקש הלוואה — או לפחות שתחתום לו ערבות בבנק.', primary: 'no',
    options: [
      { id: 'lend', label: 'להלוות לו', cash: -1, happiness: 3, friend: 'lend', note: 'אולי יחזיר בעוד חצי שנה. אולי לא.' },
      { id: 'guarantee', label: 'לחתום ערבות', happiness: 2, friend: 'guarantee', note: 'לא עולה כלום — אלא אם הוא לא ישלם.' },
      { id: 'no', label: 'לסרב בנימוס', happiness: -3, note: 'שומר על הכסף. אולי פחות על החברות.' },
    ] },
  { id: 'reserve', title: 'צו 8: חודש מילואים', text: 'יוצאים למילואים. ביטוח לאומי משלם תגמול במקום המשכורת — והמדינה מוסיפה מענק.', primary: 'go',
    options: [
      { id: 'go', label: 'יוצאים', cash: 0.3, energy: -20, happiness: -2, note: 'ההכנסה נשמרת. הכוח — פחות.' },
    ] },
  { id: 'jobOffer', personal: true, title: 'הצעת עבודה', text: 'חברה מתחרה רוצה אותך: 25% יותר ברוטו — אבל שעות ארוכות יותר ולחץ.', primary: 'take',
    options: [
      { id: 'take', label: 'לקבל: +25% ברוטו, יותר שעות', grossMult: 1.25, workLoad: 1, happiness: 1, note: 'כל חודש עבודה יעלה לך עוד 4 🔋 כוח.' },
      { id: 'counter', label: 'להשתמש בהצעה כדי לבקש העלאה', grossMult: 1.1, chance: 0.6, note: 'אם הבוס יסכים: +10% באותן שעות.' },
      { id: 'stay', label: 'להישאר — טוב לי כאן', happiness: 2, note: 'שקט נפשי שווה משהו.' },
    ] },
  { id: 'layoff', personal: true, title: 'פיטורים', text: 'החברה מצמצמת. חודשיים בלי משכורת (דמי אבטלה מכסים בערך 60%), עד שתמצא עבודה חדשה. ומה עם הפיצויים?', primary: 'keep',
    options: [
      { id: 'withdraw', label: 'למשוך את הפיצויים מהפנסיה', jobless: 2, happiness: -5, severance: 'withdraw', note: 'כסף עכשיו — פחות פנסיה בעתיד, ולפעמים גם מס.' },
      { id: 'keep', label: 'להשאיר אותם לצמוח בפנסיה', jobless: 2, happiness: -5, severance: 'keep', note: 'הקרן ממשיכה לצבור — אם יש לך כרית.' },
    ] },
  { id: 'health', values: true, title: 'בעיה בגב', text: 'הרופאה ממליצה על טיפול. בציבורי יש תור של חודשים; בפרטי — מחר.', primary: 'public',
    options: [
      { id: 'private', label: 'טיפול פרטי', cash: -0.5, energy: 12, note: 'יקר, מהיר.' },
      { id: 'public', label: 'תור בקופה', energy: -8, happiness: -2, note: 'חינם, אבל כואב עוד קצת.' },
    ] },
  { id: 'vacation', personal: true, title: 'חופשה משפחתית', text: 'כולם עייפים. אולי זה הזמן לעצור לכמה ימים?', primary: 'local',
    options: [
      { id: 'abroad', label: 'טיסה לחו״ל', cash: -1, happiness: 7, energy: 15, note: 'חוויה — וזיכרון לשנים.' },
      { id: 'local', label: 'צימר בגליל', cash: -0.3, happiness: 4, energy: 10, note: 'מנוחה אמיתית, במחיר שפוי.' },
      { id: 'skip', label: 'לא עכשיו', energy: -3, note: 'עוד חודש של עבודה.' },
    ] },
  { id: 'course', title: 'קורס מקצועי', text: 'המעסיק מציע קורס ערב בתחום שלך — חצי מימון. זה יקדם אותך בדרך להעלאה.', primary: 'take',
    options: [
      { id: 'take', label: 'להירשם', cash: -0.5, energy: -6, study: 3, note: 'שלושה חודשי לימוד בחשבון — בלי לשנות תוכנית.' },
      { id: 'skip', label: 'לא עכשיו', note: '' },
    ] },
];

/** T3 §3.5: the substitution of last resort on tile L. NOT in LIFE_EVENTS (the life deck — its size drives the shuffle draws — is unchanged). */
export const LIFE_QUIET = { id: 'quiet', personal: true, title: 'חודש בלי הפתעות', text: 'אין דרמות החודש. מה עושים עם השקט?', primary: 'rest',
  options: [
    { id: 'treat', label: 'ערב בחוץ עם החברים', cash: -0.05, happiness: 2, note: 'קטן, משמח, נגמר.' },
    { id: 'rest', label: 'ערב על הספה', energy: 4, note: 'גם זה מטעין.' },
  ] };

/* ============================================================ lessons library */
// cat: money | debt | invest | tax | time | life | world | history
export const LESSONS = [
  { id: 'due_diligence', cat: 'invest', title: 'בדיקת נאותות', text: 'המספרים על הכרטיס הם מה שהמוכר אומר. בדיקה עולה זמן או כסף — והיא שווה את זה בעיקר כשיש סימני אזהרה והעסקה גבולית. בעסקה מצוינת או גרועה במיוחד, הבדיקה לא תשנה את ההחלטה.' },
  { id: 'business_cycle', cat: 'world', title: 'מחזור כלכלי', text: 'הכלכלה עוברת צמיחה, האטה, מיתון והתאוששות. אף אחד לא יודע בדיוק איפה אנחנו — הנתונים מגיעים באיחור. מי שמחזיק כרית במיתון יכול לקנות בזול; מי שממונף עד הסוף נאלץ למכור.' },
  { id: 'gross_net', cat: 'tax', title: 'ברוטו ונטו', text: 'המשכורת בחוזה היא ברוטו. מה שנכנס לחשבון — נטו — קטן ממנה, כי יורדים ממנה מס הכנסה, ביטוח לאומי, מס בריאות והפרשה לפנסיה.' },
  { id: 'bituah_leumi', cat: 'tax', title: 'ביטוח לאומי ומס בריאות', text: 'הם מממנים קצבאות, דמי אבטלה, תגמולי מילואים ושירותי בריאות. על חלק המשכורת הנמוך השיעור נמוך, ומעליו הוא עולה.' },
  { id: 'pension_match', cat: 'invest', title: 'הפנסיה שלך', text: 'על כל ₪6 שאתה מפריש לפנסיה, המעסיק מפריש עוד ₪12.5 (תגמולים ופיצויים). זה חלק מהשכר שלך — רק נדחה לעתיד.' },
  { id: 'tax_brackets', cat: 'tax', title: 'מדרגות מס', text: 'מס הכנסה מדורג: כל מדרגה של ההכנסה ממוסה בשיעור משלה. שקל נוסף ממוסה לפי המדרגה העליונה שלך — לא כל המשכורת.' },
  { id: 'credit_points', cat: 'tax', title: 'נקודות זיכוי', text: 'לכל תושב ישראל יש נקודות זיכוי (גבר 2.25, אישה 2.75; נקודה ≈ ₪242 בחודש). ילדים מוסיפים נקודות, ותואר ראשון מוסיף נקודה לשנה — עד 3 שנים אחרי הסיום.' },
  { id: 'asset_liability', cat: 'money', title: 'נכס או התחייבות', text: 'נכס מכניס כסף לכיס שלך כל חודש. התחייבות מוציאה ממנו. השאלה היא לא מה זה — אלא לאן הכסף זורם.' },
  { id: 'cashflow', cat: 'money', title: 'תזרים מזומנים', text: 'החשוב הוא לא כמה אתה מרוויח, אלא כמה נשאר בסוף החודש — ומה אתה עושה עם זה.' },
  { id: 'passive_income', cat: 'money', title: 'הכנסה פסיבית', text: 'הכנסה שמגיעה בלי שתעבוד: שכר דירה, דיבידנד, עסק שרץ בלעדיך. כשהיא עוברת את ההוצאות — יצאת מהמירוץ.' },
  { id: 'emergency_fund', cat: 'money', title: 'קרן חירום', text: '3–6 חודשי הוצאות בצד הופכים משבר לחודש רע. בלעדיהם — כל הפתעה הופכת לחוב.' },
  { id: 'opportunity_cost', cat: 'money', title: 'עלות אלטרנטיבית', text: 'כל שקל שהוצאת על צעצוע הוא שקל שלא קנה נכס. השאלה תמיד: מה עוד יכולתי לעשות איתו?' },
  { id: 'credit_card_debt', cat: 'debt', title: 'חוב בכרטיס אשראי', text: 'חוב בכרטיס אשראי ומינוס בעו״ש הם מהאשראי היקר ביותר בבנק: בערך 8%–16% בשנה. החוק מגביל ריבית לריבית בנק ישראל ועוד 15%, ושם בדיוק נמצאות הלוואות "מהירות" מחוץ לבנקים. 3 תשלומים בלי ריבית — בסדר. קרדיט ומינוס מתגלגל — יקר.' },
  { id: 'good_debt', cat: 'debt', title: 'חוב טוב', text: 'הלוואה טובה רק אם הנכס שהיא קונה מכניס יותר ממה שהיא עולה. אחרת זה מינוף להפסד.' },
  { id: 'forced_loan', cat: 'debt', title: 'הלוואה כפויה', text: 'כשנגמר המזומן, הבנק מחליט בשבילך — ובמחיר שלו. כרית קטנה חוסכת הרבה ריבית.' },
  { id: 'leverage', cat: 'debt', title: 'מינוף', text: 'הלוואה מגדילה רווחים — וגם הפסדים. נכס ממונף שירד בערך יכול למחוק את כל ההון ששמת בו.' },
  { id: 'credit_score', cat: 'debt', title: 'דירוג אשראי', text: 'הבנק זוכר: חובות פתוחים והלוואות כפויות מורידים את הדירוג ומייקרים כל הלוואה עתידית. החזרים בזמן מעלים אותו.' },
  { id: 'credit_excellent', cat: 'debt', title: 'דירוג מצוין', text: 'דירוג אשראי גבוה פירושו ריבית נמוכה יותר. זה נכס שקט שנבנה מהרגלים טובים.' },
  { id: 'compound_interest', cat: 'invest', title: 'ריבית דריבית', text: 'כסף שמרוויח כסף, שגם הוא מרוויח כסף. בהתחלה זה איטי, ואחרי שנים זה מפתיע. הזמן הוא הדלק.' },
  { id: 'index_fund', cat: 'invest', title: 'קרן מחקה מדד', text: 'במקום לנחש איזו מניה תצליח, קונים קצת מכולן. דמי ניהול נמוכים, פיזור רחב, ולאורך שנים — בערך תשואת השוק.' },
  { id: 'diversification', cat: 'invest', title: 'פיזור', text: 'כשיש לך כמה סוגי נכסים, מכה אחת לא מפילה הכל.' },
  { id: 'dollar_cost', cat: 'invest', title: 'הוראת קבע להשקעה', text: 'השקעה קבועה כל חודש קונה יותר יחידות כשזול ופחות כשיקר — ופוטרת אותך מהצורך לנחש.' },
  { id: 'drawdown', cat: 'invest', title: 'ירידות הן חלק מהדרך', text: 'גם מדד טוב יורד לפעמים 30% ויותר. מי שלא מסוגל לסבול ירידה צריך פחות מניות — לא יותר אומץ.' },
  { id: 'panic_selling', cat: 'invest', title: 'מכירה בפאניקה', text: 'מי שמוכר בירידה הופך הפסד על הנייר להפסד אמיתי — ומפספס את העלייה שבאה אחריה.' },
  { id: 'buy_the_dip', cat: 'invest', title: 'לקנות בירידה', text: 'ירידות יכולות להיות הזדמנות למי שיש לו כרית, סבלנות ופיזור — בעיקר בקרן מדד רחבה. במניה בודדת ירידה יכולה גם להימשך עד אפס, ואף אחד לא יודע איפה התחתית.' },
  { id: 'time_in_market', cat: 'invest', title: 'זמן בשוק', text: 'לא צריך לתזמן את השוק. מי שנשאר מושקע לאורך שנים קוטף את הימים הטובים — שאי אפשר לנחש מראש.' },
  { id: 'inflation', cat: 'money', title: 'אינפלציה', text: 'כשהמחירים עולים, אותו שקל קונה פחות. מזומן שיושב בעו״ש מאבד ערך בשקט.' },
  { id: 'wage_lag', cat: 'money', title: 'המשכורת מפגרת', text: 'המחירים עולים כל חודש, והמשכורת מתעדכנת פעם בשנה — ולא תמיד במלוא האינפלציה.' },
  { id: 'real_vs_nominal', cat: 'money', title: 'ריאלי ונומינלי', text: '₪100,000 היום הם לא ₪100,000 בעוד עשר שנים. תמיד שואלים: כמה זה שווה במחירים של היום?' },
  { id: 'capital_gains', cat: 'tax', title: 'מס רווח הון', text: 'על רווח ממכירת מניות, קרנות או קריפטו משלמים 25% מס על הרווח הריאלי — החלק שרק שמר על ערכו מול האינפלציה פטור. משלמים רק כשמממשים: מי שמחזיק, דוחה את המס.' },
  { id: 'loss_offset', cat: 'tax', title: 'קיזוז הפסדים', text: 'הפסד ממכירה אחת מקטין את המס על רווח ממכירה אחרת. גם הפסד יכול להיות שווה משהו.' },
  { id: 'rental_tax', cat: 'tax', title: 'מס על שכר דירה', text: 'שכר דירה מדירות מגורים פטור ממס עד ₪5,654 בחודש, על כל הדירות שלך יחד. מעל התקרה הפטור הולך וקטן, ומעל פי 2 ממנה אין פטור. אפשר גם לבחור במסלול של 10% מכל שכר הדירה, בלי לנכות הוצאות. במשחק: עד התקרה — פטור, מעליה — 10% מהכול.' },
  { id: 'betterment_tax', cat: 'tax', title: 'מס שבח', text: 'כשמוכרים דירה ברווח משלמים מס שבח: בדרך כלל 25% מהרווח הריאלי (אחרי אינפלציה והוצאות כמו שיפוץ, עו״ד ותיווך). דירת מגורים יחידה — לרוב פטורה, בתנאים. במשחק: 25% מהרווח הריאלי בין ההצעה למחיר הקנייה.' },
  { id: 'tax_refund', cat: 'tax', title: 'החזר מס', text: 'הרבה שכירים זכאים להחזר מס ולא מבקשים. מי שבודק — מקבל בחזרה כסף ששילם ביותר.' },
  { id: 'side_tax', cat: 'tax', title: 'מס על הכנסה נוספת', text: 'הכנסה מעסק צדדי חייבת בדיווח: פותחים תיק במס הכנסה ומשלמים מקדמות כל חודש. מי שלא מדווח מקבל חשבון בסוף השנה — לפעמים עם קנס.' },
  { id: 'negotiation', cat: 'money', title: 'משא ומתן', text: 'המחיר הראשון הוא רק הצעה. הנחה של 10% בקנייה היא רווח מיידי — אבל מי שלוחץ יותר מדי עלול לאבד את העסקה.' },
  { id: 'negotiation_fail', cat: 'money', title: 'לפעמים אומרים לא', text: 'משא ומתן הוא סיכון: לפעמים המוכר הולך לקונה אחר. כדאי לדעת מראש כמה העסקה שווה לך.' },
  { id: 'ask_raise', cat: 'time', title: 'לבקש העלאה', text: 'העלאה מגיעה למי שמבקש — בזמן הנכון, אחרי הישגים, ועם מספרים. הכי גרוע שיגידו לא.' },
  { id: 'human_capital', cat: 'time', title: 'להשקיע בעצמך', text: 'לימודים עולים זמן וכסף עכשיו, אבל העלאה קבועה במשכורת מחזירה את ההשקעה שוב ושוב.' },
  { id: 'time_scarce', cat: 'time', title: 'הזמן הוא המשאב הנדיר', text: 'שעות נוספות מכניסות כסף, אבל לוקחות זמן וכוח. כסף אפשר להרוויח שוב — זמן לא.' },
  { id: 'marginal_overtime', cat: 'tax', title: 'שעות נוספות ומס', text: 'שעות נוספות ממוסות במדרגה הגבוהה שלך. מכל שקל נוסף נשאר פחות ממה שחשבת.' },
  { id: 'burnout', cat: 'time', title: 'שחיקה', text: 'מי שעובד בלי הפסקה משלם בסוף — בבריאות ובחודשים בלי הכנסה. מנוחה היא חלק מהתוכנית, לא בזבוז.' },
  { id: 'rest_value', cat: 'time', title: 'מנוחה ומשפחה', text: 'חודש רגוע עם המשפחה מוריד קצת מההכנסה — ומוסיף כוח ואושר שמחזיקים מעמד.' },
  { id: 'side_hustle', cat: 'time', title: 'עסק צדדי', text: 'עסק קטן בערבים מתחיל לאט ומעייף, אבל מי שמתמיד יכול להפוך אותו לנכס שמכניס בלי משכורת.' },
  { id: 'hedonic', cat: 'life', title: 'הסתגלות הנאתנית', text: 'הריגוש מקנייה חדשה דועך תוך שבועות. חוויות וקשרים משמחים לאורך זמן יותר מחפצים.' },
  { id: 'lifestyle_creep', cat: 'life', title: 'אינפלציית סגנון חיים', text: 'כל מנוי קטן נשמע זניח, אבל יחד הם מזיזים את קו הסיום — לתמיד.' },
  { id: 'wedding', cat: 'life', title: 'חתונה', text: 'חתונה גדולה היא בחירה, לא חובה. המתנות מכסות רק חלק — וההפרש יכול להיות מקדמה לנכס.' },
  { id: 'kids_cost', cat: 'life', title: 'ילדים', text: 'ילדים הם השמחה הכי גדולה — וגם הוצאה קבועה של שנים. מתכננים אותה כמו כל הוצאה קבועה.' },
  { id: 'guarantor', cat: 'life', title: 'ערבות', text: 'לחתום ערבות זה להבטיח לשלם חוב של מישהו אחר. אם הוא לא ישלם — אתה תשלם.' },
  { id: 'friend_loan', cat: 'life', title: 'להלוות לחבר', text: 'מלווים לחבר רק סכום שמוכנים לא לראות שוב. ככה שומרים גם על הכסף וגם על החברות.' },
  { id: 'total_cost', cat: 'life', title: 'עלות כוללת של רכב', text: 'רכב עולה הרבה יותר מהמחיר שלו: דלק, ביטוח, טיפולים, תיקונים וירידת ערך. מחשבים את כל השנה — לא רק את החשבון של היום.' },
  { id: 'housing_share', cat: 'money', title: 'כמה מהנטו הולך על דיור', text: 'כלל אצבע נפוץ: דיור עד בערך שליש מהנטו. זה לא חוק — אבל מעל זה כל העלאה בשכירות לוחצת על כל השאר.' },
  { id: 'sunk_cost', cat: 'money', title: 'עלות שקועה', text: 'כסף שכבר נתת לא יחזור כי תיתן עוד. כל החלטה חדשה שואלת רק: מה הסיכוי מכאן והלאה?' },
  { id: 'car_cost', cat: 'life', title: 'רכב', text: 'רכב חדש מאבד חלק גדול מערכו כבר בשנים הראשונות. תחבורה ציבורית ואופניים הם חיסכון רציני.' },
  { id: 'reserve_duty', cat: 'life', title: 'מילואים', text: 'בזמן מילואים ביטוח לאומי משלם תגמול במקום המשכורת. ההכנסה נשמרת — הכוח פחות.' },
  { id: 'job_offer', cat: 'life', title: 'הצעת עבודה', text: 'משכורת גבוהה יותר שווה בדיקה: כמה שעות, כמה לחץ, ומה זה עושה לחיים שמחוץ לעבודה.' },
  { id: 'severance', cat: 'life', title: 'פיצויים', text: 'כספי הפיצויים יושבים בקופת הפנסיה. אפשר למשוך אותם בפיטורים — או להשאיר אותם לצמוח.' },
  { id: 'unemployment', cat: 'life', title: 'דמי אבטלה', text: 'דמי אבטלה מכסים רק חלק מהמשכורת ולזמן מוגבל. קרן חירום היא מה שמחזיק אותך בין עבודות.' },
  { id: 'rate_risk', cat: 'world', title: 'ריבית משתנה', text: 'בריבית משתנה ההחזר זז עם הריבית במשק. כשהריבית עולה — התזרים שלך נחתך.' },
  { id: 'fx_risk', cat: 'world', title: 'סיכון מטבע', text: 'מי שמשלם או מקבל בדולרים חשוף לשער. גידור עולה כסף — אבל קונה שקט.' },
  // worlds wave 1 — w5 עיר התיירות (js/worlds/mech/season.js)
  { id: 'seasonal_year', cat: 'world', title: 'עסק עונתי מודדים לפי שנה', text: 'בעסק עונתי חודש אחד לא אומר כלום. הקיץ משלם את החורף — אבל רק אם שמרת ממנו. לכן מסתכלים על ממוצע של שנה שלמה, ושומרים כרית לחודשים החלשים.' },
  { id: 'capacity_pricing', cat: 'world', title: 'מחיר לפי תפוסה', text: 'כשאין חדר פנוי, מחיר גבוה הוא רווח נקי: אותם חדרים נמכרים ביוקר. כשהחדרים ריקים, מחיר נמוך ממלא חדרים שהיו עולים לך רק הוצאות קבועות. מחיר אחד לכל השנה משאיר כסף על השולחן בשני הכיוונים.' },
  { id: 'allotment', cat: 'world', title: 'מכירה מראש בהנחה', text: 'מפעיל שקונה חדרים מראש נותן לך כסף עכשיו ומוריד סיכון — ובתמורה לוקח הנחה. בחודשים חלשים זו עסקה טובה; בחודשים שבהם החדרים היו נמכרים ממילא במחיר מלא, ויתרת על רווח.' },
  { id: 'working_capital', cat: 'world', title: 'הון חוזר', text: 'גם עסק רווחי יכול להיתקע בלי מזומן, כי הכסף נכנס בעונה אחת ויוצא כל חודש. קו אשראי עונתי זול מהלוואה כפויה — כל עוד סוגרים אותו כשהעונה הטובה מגיעה.' },
  // worlds wave 2 — w6 אזור התעשייה (js/worlds/mech/plant.js)
  { id: 'operating_leverage', cat: 'world', title: 'מינוף תפעולי', text: 'כשרוב העלויות קבועות, כל שקל הכנסה שנעלם יוצא ישר מהרווח — וכל שקל שנוסף נכנס ישר אליו. מינוף תפעולי מגדיל רווח בגאות ומכה בשפל.' },
  { id: 'deferred_maintenance', cat: 'world', title: 'תחזוקה שנדחית', text: 'תחזוקה שנדחית לא נחסכת. היא חוזרת עם ריבית: כתקלה, כחודשי השבתה וקנסות, וכשווי נמוך יותר ביום המכירה.' },
  { id: 'idle_capacity', cat: 'world', title: 'קיבולת פנויה', text: 'קו שעומד ריק עדיין משלם שכר, חשמל וריבית. קיבולת שלא מנוצלת עולה כסף כל חודש — אבל היא גם מה שמאפשר לתפוס הזמנה גדולה כשהיא מגיעה.' },
  { id: 'contract_spot', cat: 'world', title: 'חוזה או שוק פתוח', text: 'חוזה ארוך הוא ביטוח: בשפל הוא שומר על הקו מלא, בגאות הוא תופס קיבולת שהייתה נמכרת ביוקר. חוזה על כל הקיבולת הופך כל תקלה לקנס.' },
  // worlds wave 3 — w7 רשתות המסחר (js/worlds/mech/chain.js)
  { id: 'growth_cash', cat: 'world', title: 'צמיחה אוכלת מזומן', text: 'כל סניף חדש בולע שיפוץ, מלאי וחודשים של הפסד לפני שהוא מרוויח. רשת רווחית יכולה להיתקע בלי מזומן אם היא גדלה מהר יותר מהקופה שלה.' },
  { id: 'ramp_up', cat: 'world', title: 'זמן הרצה', text: 'עסק חדש לא מתחיל במכירות מלאות. לקוחות לומדים להכיר אותו לאט, והעלויות הקבועות משולמות מהיום הראשון — לכן כל פתיחה צריכה כרית לחצי שנה.' },
  { id: 'management_span', cat: 'world', title: 'יכולת ניהול', text: 'מנהל יכול להחזיק רק מספר מסוים של סניפים. מעבר לזה כולם נפגעים — גם הסניפים הוותיקים. צמיחה צריכה גם אנשים, לא רק כסף.' },
  { id: 'inventory_cover', cat: 'world', title: 'כמה מלאי להחזיק', text: 'מעט מדי מלאי — מדפים ריקים ולקוחות שהולכים למתחרים. יותר מדי — כסף שתקוע במחסן וסחורה שנמכרת בהנחה. כשהסחורה מגיעה אחרי חודשיים, מתכננים חודשיים קדימה.' },
  { id: 'own_franchise', cat: 'world', title: 'סניף משלך או זכיין', text: 'סניף משלך נותן את כל הרווח ודורש הון, מלאי ומנהל. זכיין פותח בכסף שלו ומשלם חלק קטן מהמכירות — אבל האיכות שלו, והמותג של כולם.' },
  { id: 'power_law', cat: 'world', title: 'חוק החזקה', text: 'ברוב הסטארט־אפים ההשקעה נמחקת, ואחד מתוך הרבה מחזיר את כולם. לכן מפזרים צ׳קים קטנים.' },
  { id: 'giving', cat: 'world', title: 'נתינה שצומחת', text: 'נתינה מוקדמת צומחת לאורך זמן — מלגה היום היא מהנדסת בעוד עשר שנים.' },
  { id: 'bubble', cat: 'history', title: 'בועות', text: 'כשכולם בטוחים שהמחיר רק יעלה, והמחירים מנותקים מהרווחים — זהירות. בועות מתפוצצות בבת אחת.' },
  { id: 'benchmark', cat: 'history', title: 'לנצח את המדד', text: 'רוב המשקיעים לא מנצחים קרן מדד פשוטה לאורך זמן. לפני שבוחרים מניות — משווים לקנה־והחזק.' },
];
export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
export function lessonsList() { return LESSONS.map((l) => ({ ...l })); }
