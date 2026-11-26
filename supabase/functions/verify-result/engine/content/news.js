// Content pool `news` (CATALOG-25 §3.6 / §4): the text of the market's news lines — one per company event and regime change. Data only;
// js/systems/content.js picks a line on the `content` stream (2 draws, always), so text variety never moves a price. Placeholders the
// market fills: {co} {tk} {sector} {pct} {regime}. Tags = the event type (js/worlds/mech/market.js EVENTS) or 'regime'.
const N = (id, tag, n, o = {}) => Object.freeze({ id: 'news.' + id, v: 1, pool: 'news', tags: [tag], w: o.w || 10, cooldown: 0, text: Object.freeze({ n }), ...(o.mult ? { mult: o.mult } : {}) });

export const NEWS = Object.freeze([
  N('revUp.1', 'revUp', '{co} ({tk}): ההכנסות ברבעון עלו מעל הצפי. המניה {pct}.'),
  N('revUp.2', 'revUp', 'דוח חזק ב{co}: הלקוחות קונים יותר. {tk} {pct}.'),
  N('revUp.3', 'revUp', '{co} מעדכנת את התחזית למעלה. המניה {pct}.'),
  N('revUp.4', 'revUp', 'בענף ה{sector}, {co} מראה צמיחה. {tk} {pct}.', { mult: { regime: { recession: 0.5 } } }),
  N('revDown.1', 'revDown', '{co} ({tk}): ההכנסות ירדו. המניה {pct}.'),
  N('revDown.2', 'revDown', 'רבעון חלש ב{co}: המכירות נחלשו. {tk} {pct}.'),
  N('revDown.3', 'revDown', '{co} מורידה את התחזית לשנה. המניה {pct}.'),
  N('launch.1', 'launch', '{co} משיקה מוצר חדש — והשוק אוהב. {tk} {pct}.'),
  N('launch.2', 'launch', 'השקה מוצלחת ב{co}: הזמנות ראשונות מעל הצפי. המניה {pct}.'),
  N('launch.3', 'launch', '{co} ({tk}) נכנסת לשוק חדש. המניה {pct}.'),
  N('lostClient.1', 'lostClient', 'הלקוח הגדול של {co} עובר למתחרה. {tk} {pct}.'),
  N('lostClient.2', 'lostClient', '{co} מאבדת חוזה מרכזי. המניה {pct}.'),
  N('lostClient.3', 'lostClient', 'מכה ל{co}: לקוח שהיה רבע מההכנסות עוזב. {tk} {pct}.'),
  N('debt.1', 'debt', '{co} מגייסת חוב בריבית גבוהה. המניה {pct}.'),
  N('debt.2', 'debt', 'חברת הדירוג מזהירה על החוב של {co}. {tk} {pct}.'),
  N('debt.3', 'debt', '{co} ({tk}) דוחה תשלום לספקים. המניה {pct}.'),
  N('merger.1', 'merger', 'הצעת רכישה ל{co}: פרמיה גדולה על המחיר. {tk} {pct}. העסקה צפויה להיסגר בחודש הבא.'),
  N('merger.2', 'merger', 'קונה אסטרטגי רוצה את {co}. המניה {pct}. בעלי המניות יקבלו מזומן במחיר העסקה.'),
  N('merger.3', 'merger', 'מיזוג בענף ה{sector}: {co} נמכרת. {tk} {pct}.'),
  N('fraud.1', 'fraud', 'חשד להונאה ב{co}: הדוחות נבדקים, והמסחר מושהה. {tk} {pct}.'),
  N('fraud.2', 'fraud', '"המייסדים נעלמו"? {co} לא מפרסמת דוחות, והמסחר הושהה. המניה {pct}.'),
  N('fraud.3', 'fraud', 'רואה החשבון של {co} מסרב לחתום. המסחר ב־{tk} מושהה. {pct}.'),
  N('regime.1', 'regime', 'מצב השוק השתנה: {regime}.'),
  N('regime.2', 'regime', 'הכלכלנים מסכימים: עכשיו {regime}. המחירים יזוזו אחרת.'),
  N('regime.3', 'regime', 'שינוי מגמה בבורסה — {regime}.'),
]);
