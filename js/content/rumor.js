// Content pool `rumor` (CATALOG-25 §3.6): noise lines in a high-volatility or bubble market. The company and the line come from the
// `content` stream only — by construction they carry NO information about any sealed value. The library says: "שמועה היא לא מידע".
const R = (id, n) => Object.freeze({ id: 'rumor.' + id, v: 1, pool: 'rumor', tags: ['rumor'], w: 10, cooldown: 0, text: Object.freeze({ n }) });

export const RUMORS = Object.freeze([
  R('1', 'שמועה בפורומים: "{co} עומדת להירכש". אף אחד לא יודע מאיפה זה הגיע.'),
  R('2', 'בקבוצת הווטסאפ של המשקיעים אומרים ש־{tk} "תכפיל את עצמה". שמועה היא לא מידע.'),
  R('3', 'מישהו בטלוויזיה אמר ש{co} "מסתירה משהו". בלי מספרים, בלי מקור.'),
  R('4', 'שמועה: "כל ענף ה{sector} עומד לקרוס". השמועה הזאת חוזרת כל כמה חודשים.'),
  R('5', 'טוויט אנונימי: "{co} חתמה על חוזה ענק". החברה לא הגיבה.'),
  R('6', 'אומרים שהמנכ"ל של {co} מכר מניות. ואולי לא.'),
]);
