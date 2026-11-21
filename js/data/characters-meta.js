// T4 §5.2 — strength / weakness lines for the character cards (lobby lane, text only).
// Every ₪ figure here is re-checked against the engine (characterCard / metrics(createGame()) / the starting assets) by
// tests/t4_meta.test.mjs T-M4, rounded to the nearest ₪100 (a balance change that moves a figure fails the build).
// A missing key simply omits the two rows on the card.
export const CHAR_META = {
  'w1:teacher': { strength: 'הוצאות קבועות נמוכות — היעד קרוב', weakness: 'רק ₪5,000 במזומן — מתחילים בקטן' },
  'w1:driver': { strength: 'הכי הרבה זמן בשכונה: 64 חודשים', weakness: 'חוב אשראי חודשי ומעט מזומן — כל הפתעה כואבת' },
  'w1:dev': { strength: '₪30,000 במזומן — אפשר לקנות נכס כבר בהתחלה', weakness: 'הוצאות של ₪19,000 בחודש — הקו רחוק' },
  'w1:doctor': { strength: 'המשכורת הכי גבוהה בשכונה', weakness: 'גם ההוצאות הכי גבוהות: משכורת גבוהה זה לא חופש' },
  'w2:lawyer': { strength: '₪90,000 במזומן ותזרים של +₪7,500', weakness: 'סגנון חיים של ₪34,500 בחודש — יש מה לקצץ, אם תעזי' },
  'w2:chef': { strength: 'כבר יש עסק שמכניס ₪2,700 בחודש', weakness: 'ההלוואה על הביסטרו בריבית משתנה: ריבית עולה, תזרים יורד' },
  'w2:pm': { strength: '2,500 מניות של החברה — הון שמחכה להחלטה', weakness: 'רק ₪30,000 במזומן, ומשפחה עם 2 ילדים' },
  'w3:importer': { strength: 'עסק יבוא שמכניס ₪14,000 בחודש', weakness: 'דולר חזק = רווח חלש: העסק רגיש לשער' },
  'w3:exporter': { strength: 'מטע שמוכר לאירופה ומכניס ₪11,000 בחודש', weakness: 'דולר חלש = שנה קשה' },
  'w3:captain': { strength: '₪760,000 במזומן ותזרים של +₪10,400', weakness: 'המשכורת בדולרים, ואין עדיין שום הכנסה פסיבית' },
  'w4:founder': { strength: '₪3.2 מיליון במזומן — הכי הרבה הון בעמק', weakness: 'תזרים שלילי: כל חודש יוצאים ₪13,000 מהקופה' },
  'w4:engineer': { strength: 'תזרים של +₪23,000 בחודש', weakness: 'קו הסיום הכי קצר: 60 חודשים' },
  'w4:social': { strength: '20 נקודות השפעה כבר בהתחלה, ו־84 חודשים', weakness: 'הכי מעט כסף בעמק: ₪1.3 מיליון' },
};
export const charMeta = (worldId, charId) => CHAR_META[`${worldId}:${charId}`] || null;
