// T2 — monthly focus ("מוקד החודש"): data + pure helpers that take plain numbers. No engine imports, no DOM, no randomness.
// The plan decides how many hours you sell for salary; the focus decides where your unpaid attention goes this month.
// It is paid on activation (🔋 from the same budget the plan uses), one per month, with an agenda of 2 queued months.

export const FOCUS_IDS = ['scout', 'debt', 'ops', 'frugal', 'network', 'research', 'none'];

/** Spec §6.2 / §17. cost.energy / cost.happiness are applied on activation; minEnergy = disabled below it. */
export const FOCUS = Object.freeze({
  scout: Object.freeze({ id: 'scout', icon: 'search', label: 'חיפוש עסקאות', desc: 'בודקים הזדמנויות לעומק.', benefit: 'בדיקה בסיסית חינם החודש, בדיקה מקצועית בחצי מחיר.',
    notBest: 'לא כדאי כשאין כסף או הלוואה לקנות, או כשאתה עייף.', cost: { energy: 5, happiness: 0 }, minEnergy: 15 }),
  debt: Object.freeze({ id: 'debt', icon: 'bank', label: 'סדר בחובות', desc: 'מאחדים חובות ומתמקחים עם הבנק.', benefit: 'חוב האשראי עובר להלוואה, והריבית יורדת לחצי שנה.',
    notBest: 'לא כדאי כשהחוב קטן — העמלה גדולה מהחיסכון.', cost: { energy: 3, happiness: 0 }, minEnergy: 13 }),
  ops: Object.freeze({ id: 'ops', icon: 'shop', label: 'יום עבודה על העסק', desc: 'נכנסים לעומק המספרים של העסק.', benefit: 'פותחים את לוח העסק עכשיו, בלי לחכות למשבצת.',
    notBest: 'לא כדאי אם החלטת על העסק לפני פחות משלושה חודשים.', cost: { energy: 6, happiness: 0 }, minEnergy: 16 }),
  frugal: Object.freeze({ id: 'frugal', icon: 'scissors', label: 'ביקורת הוצאות', desc: 'עוברים על כל ההוצאות.', benefit: 'מבטלים מנוי או חותכים הוצאה אחת — לתמיד.',
    notBest: 'לא כדאי כשהאושר כבר נמוך: קשה יותר להגיע ל־★★★.', cost: { energy: 1, happiness: 3 }, minEnergy: 1 }),
  network: Object.freeze({ id: 'network', icon: 'people', label: 'קשרים', desc: 'פגישות, קפה, טלפונים.', benefit: 'יותר סיכוי במשא ומתן ובבקשת העלאה החודש.',
    notBest: 'לא כדאי כשאין עסקה או העלאה באופק.', cost: { energy: 4, happiness: -1 }, minEnergy: 14 }),
  research: Object.freeze({ id: 'research', icon: 'gauge', label: 'מעקב אחרי הכלכלה', desc: 'קוראים נתונים ודוחות.', benefit: 'מד הכלכלה מדויק יותר ל־3 חודשים.',
    notBest: 'לא כדאי כשאין לך עדיין כסף לפעול לפי זה.', cost: { energy: 3, happiness: 0 }, minEnergy: 3 }),
  none: Object.freeze({ id: 'none', icon: 'calendar', label: 'חודש רגיל', desc: 'בלי מוקד מיוחד.', benefit: '+3 🔋 בסוף החודש.', notBest: '—', cost: { energy: 0, happiness: 0 }, minEnergy: 0 }),
});

/** Disabled-reason copy (§17). */
export const FOCUS_REASON = Object.freeze({
  tired: 'אין לך מספיק כוח החודש',
  locked: 'כבר בחרת מוקד לחודש הזה',
  noBiz: 'אין לך עסק לנהל',
  bizRecent: 'החלטת על העסק לפני פחות מ־3 חודשים',
  noDebt: 'אין חובות לסדר',
  noCut: 'אין מה לקצץ — כל ההוצאות כבר נבדקו',
  history: 'במכונת הזמן הכלכלה אמיתית — אין מה לחזות',
});

/** Per-world numbers (§6.2). */
export function focusCfg(worldId) {
  return {
    frugalCut: worldId === 'w1' ? 0.10 : 0.08,   // share cut from the largest eligible expense line, for good
    debtAdj: worldId === 'w2' ? -0.25 : -0.5,      // bank-loan rate, percentage points a month, for 6 months
    debtMonths: 6, debtFeeMin: 150, debtFeePct: 0.005, debtCredit: 10,
    networkNeg: 0.10, networkRaise: 0.10, noneEnergy: 3, researchMonths: 3, frugalMaxCuts: 4,
    scoutInspect1: 0, scoutInspect2Mult: 0.5,
  };
}

/** The debt-focus fee: max(₪150, 0.5% of loans + card debt). */
export function debtFee(worldId, loans, credit) { const c = focusCfg(worldId); return Math.max(c.debtFeeMin, Math.round((loans + credit) * c.debtFeePct)); }

/** Expense lines the frugal audit may cut: not rent/mortgage/loans/repayments/installments, not temporary, not audited yet. */
export const FRUGAL_SKIP = /שכירות|משכנתא|הלוואה|החזר|תשלומים|ליסינג/;
export function frugalEligible(x) { return !!x && x.amount > 0 && !x.until && !x.from && !x.audited && !FRUGAL_SKIP.test(x.label || ''); }
