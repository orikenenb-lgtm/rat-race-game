// The fictional companies pool of the `market` module (CATALOG-25 §3.1) — data only. 8 sectors × 6 companies = 48 entries.
// Every name and ticker is invented; tools/validate-worlds.mjs (M-fict) checks them unique and against tools/data/real-names.txt (real
// listed companies, maintained by hand) — a new entry that collides with a real name fails the validator.
//
// Entry: {key, name, tk, sector, size:'large'|'mid'|'small', beta:[lo,hi], vol:[lo,hi] (monthly idiosyncratic σ), div:[lo,hi] (annual
// dividend yield), q:[lo,hi] (SEALED quality, drawn at listing), debt:'low'|'mid'|'high', px:[lo,hi] (₪ listing price), blurb}.
// Ranges by size (TUNE): large β 0.8–1.1 σ 3–6 % · mid β 0.9–1.3 σ 5–9 % · small β 1.0–1.6 σ 8–14 %.

export const SECTORS = Object.freeze({
  tech: 'טכנולוגיה', fin: 'פיננסים', energy: 'אנרגיה', consumer: 'צריכה', health: 'בריאות', property: 'נדל"ן', industry: 'תעשייה', transport: 'תחבורה',
});
export const SECTOR_IDS = Object.freeze(Object.keys(SECTORS));

const SIZE = {
  large: { beta: [0.8, 1.1], vol: [0.03, 0.06], div: [0.02, 0.045], q: [0.3, 0.9] },
  mid: { beta: [0.9, 1.3], vol: [0.05, 0.09], div: [0.01, 0.03], q: [0.2, 0.85] },
  small: { beta: [1.0, 1.6], vol: [0.08, 0.14], div: [0, 0.015], q: [0.1, 0.8] },
};
const C = (key, name, tk, sector, size, debt, px, blurb, o = {}) => Object.freeze({ key, name, tk, sector, size, ...SIZE[size], ...o, debt, px, blurb });

export const COMPANIES = Object.freeze([
  // tech
  C('shgl', 'שבבי הגליל', 'SHGL', 'tech', 'mid', 'low', [30, 70], 'מתכננת שבבים לרכב ולתעשייה.'),
  C('mhbs', 'מחשוב הבשור', 'MHBS', 'tech', 'small', 'mid', [5, 18], 'חברת תוכנה קטנה עם לקוח אחד גדול.'),
  C('tvyr', 'תוכנות הירקון', 'TVYR', 'tech', 'large', 'low', [80, 160], 'תוכנה לבנקים וחברות ביטוח, הכנסה קבועה.'),
  C('syba', 'סייבר עמק', 'SYBA', 'tech', 'mid', 'low', [25, 60], 'אבטחת מידע לעסקים בינוניים.'),
  C('rbng', 'רובוטיקה נגב', 'RBNG', 'tech', 'small', 'high', [4, 15], 'רובוטים למחסנים. צומחת מהר — ושורפת מזומן.'),
  C('anmf', 'ענני המפרץ', 'ANMF', 'tech', 'mid', 'mid', [20, 55], 'שרתים ומרכזי נתונים בצפון.'),
  // fin
  C('orfn', 'אורות פיננסים', 'ORFN', 'fin', 'large', 'mid', [40, 90], 'בנק גדול עם סניפים בכל הארץ.', { beta: [0.9, 1.2] }),
  C('bgva', 'בנק הגבעה', 'BGVA', 'fin', 'mid', 'mid', [15, 40], 'בנק אזורי שמלווה לעסקים קטנים.', { beta: [1.0, 1.4] }),
  C('btsh', 'ביטוח השרון', 'BTSH', 'fin', 'mid', 'low', [30, 65], 'חברת ביטוח רכב ודירה.'),
  C('asyz', 'אשראי עמק יזרעאל', 'ASYZ', 'fin', 'small', 'high', [3, 12], 'הלוואות צרכניות בריבית גבוהה.', { beta: [1.2, 1.7] }),
  C('bmgd', 'בית השקעות מגדלור', 'BMGD', 'fin', 'small', 'mid', [8, 25], 'מנהל קרנות קטן — ההכנסות עולות ויורדות עם השוק.'),
  C('tshd', 'תשלומי הדרום', 'TSHD', 'fin', 'mid', 'low', [20, 50], 'סליקת כרטיסים בחנויות.'),
  // energy
  C('ngsl', 'נגב סולאר', 'NGSL', 'energy', 'small', 'high', [6, 20], 'שדות סולאריים קטנים בנגב.'),
  C('rhgl', 'רוחות הגולן', 'RHGL', 'energy', 'mid', 'high', [18, 45], 'חוות רוח עם חוזים ארוכים.', { beta: [0.7, 1.0] }),
  C('arva', 'אנרגיית ערבה', 'ARVA', 'energy', 'mid', 'mid', [15, 40], 'אגירה וסולארי בדרום.'),
  C('zkms', 'זיקוק המישור', 'ZKMS', 'energy', 'large', 'mid', [50, 110], 'בתי זיקוק ותחנות דלק. רווח שזז עם מחיר הנפט.'),
  C('agng', 'אגירת הנגב', 'AGNG', 'energy', 'small', 'mid', [4, 14], 'סוללות ענק לרשת החשמל.'),
  C('mygr', 'מימן ירוק ים', 'MYGR', 'energy', 'small', 'high', [2, 10], 'פיילוטים של מימן ירוק. הרבה הבטחות, מעט הכנסות.', { q: [0.1, 0.6] }),
  // consumer
  C('mafs', 'מאפיות השפלה', 'MAFS', 'consumer', 'mid', 'low', [20, 45], 'לחם ומאפים לרשתות השיווק.', { beta: [0.6, 0.9] }),
  C('slbt', 'רשת סל הבית', 'SLBT', 'consumer', 'large', 'mid', [30, 70], 'רשת סופרמרקטים ארצית.', { beta: [0.6, 0.9] }),
  C('msgl', 'משקאות הגליל', 'MSGL', 'consumer', 'mid', 'low', [25, 55], 'מים מינרליים ומיצים.'),
  C('ofyf', 'אופנת יפו', 'OFYF', 'consumer', 'small', 'mid', [5, 16], 'רשת בגדים צעירה. טרנד אחד מעלה, טרנד אחד מוריד.'),
  C('kfbk', 'קפה הבוקר', 'KFBK', 'consumer', 'small', 'mid', [6, 18], 'רשת בתי קפה שנפתחת מהר.'),
  C('mzkf', 'מזון הכפר', 'MZKF', 'consumer', 'large', 'low', [45, 95], 'מוצרי חלב וגבינות.', { beta: [0.5, 0.8] }),
  // health
  C('trkm', 'תרופות הכרמל', 'TRKM', 'health', 'small', 'mid', [5, 20], 'תרופה אחת בניסוי מתקדם.', { vol: [0.1, 0.16] }),
  C('mral', 'מכשור רפואי אלון', 'MRAL', 'health', 'mid', 'low', [30, 70], 'ציוד לחדרי ניתוח.'),
  C('bigl', 'ביו־גליל', 'BIGL', 'health', 'small', 'high', [3, 12], 'מעבדת ביוטק צעירה.', { vol: [0.11, 0.16], q: [0.1, 0.7] }),
  C('mrps', 'מרפאות השרון', 'MRPS', 'health', 'mid', 'mid', [20, 45], 'רשת מרפאות פרטיות.', { beta: [0.6, 0.9] }),
  C('gnmk', 'גנום עמק', 'GNMK', 'health', 'small', 'mid', [6, 20], 'בדיקות גנטיות לבתי חולים.'),
  C('mbsk', 'מעבדות השקד', 'MBSK', 'health', 'large', 'low', [60, 130], 'תרופות גנריות. משעמם ויציב.', { beta: [0.5, 0.8] }),
  // property
  C('mghf', 'מגדלי החוף', 'MGHF', 'property', 'mid', 'high', [20, 50], 'מגדלי מגורים להשכרה ליד הים.', { div: [0.03, 0.05] }),
  C('knym', 'קניוני העמק', 'KNYM', 'property', 'large', 'mid', [40, 90], 'קניונים בערי השדה.', { div: [0.035, 0.055] }),
  C('drgv', 'דיור הגבעות', 'DRGV', 'property', 'mid', 'mid', [15, 40], 'שכונות חדשות בפריפריה.', { div: [0.02, 0.04] }),
  C('msmr', 'משרדי מישור', 'MSMR', 'property', 'small', 'high', [5, 15], 'בנייני משרדים ישנים. חלק ריקים.', { div: [0.02, 0.05] }),
  C('lghf', 'לוגיסטיקה חוף', 'LGHF', 'property', 'mid', 'mid', [25, 55], 'מרכזים לוגיסטיים ליד הנמלים.', { div: [0.025, 0.045] }),
  C('btel', 'בתי האלה', 'BTEL', 'property', 'small', 'mid', [4, 14], 'דיור מוגן ודירות קטנות.', { div: [0.03, 0.05] }),
  // industry
  C('pldz', 'פלדת הצפון', 'PLDZ', 'industry', 'large', 'mid', [35, 80], 'מפעל פלדה ותיק עם לקוחות קבועים.', { beta: [1.0, 1.3] }),
  C('mltn', 'מלט הנגב', 'MLTN', 'industry', 'mid', 'mid', [20, 50], 'מלט ובטון לבנייה. עולה ויורד עם הנדל"ן.'),
  C('kmkn', 'כימיקלים הכינרת', 'KMKN', 'industry', 'mid', 'high', [15, 40], 'כימיקלים לחקלאות ולתעשייה.'),
  C('plsk', 'פלסטיק עמק', 'PLSK', 'industry', 'small', 'mid', [4, 14], 'אריזות פלסטיק. לקוחות גדולים, מרווח קטן.'),
  C('mkyr', 'מכונות הירדן', 'MKYR', 'industry', 'mid', 'low', [25, 60], 'מכונות לחקלאות מדייקת.'),
  C('zkmp', 'זכוכית מצפה', 'ZKMP', 'industry', 'small', 'mid', [5, 16], 'זכוכית לבנייה ולפאנלים.'),
  // transport
  C('kvym', 'קווי הים התיכון', 'KVYM', 'transport', 'mid', 'high', [15, 45], 'ספנות מכולות. שנה טובה — שנה רעה.', { beta: [1.1, 1.5] }),
  C('tfng', 'תעופת הנגב', 'TFNG', 'transport', 'small', 'high', [3, 12], 'חברת תעופה קטנה מאילת.', { beta: [1.2, 1.7] }),
  C('rksh', 'רכבות השרון', 'RKSH', 'transport', 'large', 'mid', [40, 85], 'זיכיון קווי רכבת פרבריים.', { beta: [0.6, 0.9] }),
  C('mshe', 'משלוחי אילת', 'MSHE', 'transport', 'small', 'mid', [5, 16], 'שליחויות מהירות לחנויות אונליין.'),
  C('nmlm', 'נמלי המפרץ', 'NMLM', 'transport', 'large', 'mid', [50, 110], 'מסופי מטען בנמל.', { beta: [0.8, 1.1] }),
  C('hsgl', 'הסעות הגליל', 'HSGL', 'transport', 'mid', 'mid', [15, 35], 'אוטובוסים ותחבורה ציבורית בצפון.', { beta: [0.6, 0.9] }),
]);
