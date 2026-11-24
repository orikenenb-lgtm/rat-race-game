// Content pool `deal` for w13 אצטדיון הכוכבים (CATALOG-25 §1.4 "sponsors (content pool)", §4.2): the deal tile offers SPONSORSHIPS (an
// activation cost now, money every month until the contract ends — or until a sponsor scandal ends it: risk 'sealed:scandal') and club
// FACILITIES (hospitality boxes, a club shop, a fan zone, a museum: an asset at cost that earns a little every month). Every brand is
// fictional. Numbers: cost = a share of the world's econ.band.deal (₪2M–60M); a sponsorship's value is 0 (a contract, nothing to resell).
const S = (id, o) => Object.freeze({ id: 'deal.' + id, v: 1, pool: 'deal', tiles: ['O'], worlds: ['w13'], tags: ['sponsor'], w: o.w || 10, cooldown: o.cooldown ?? 8, preview: true,
  gen: Object.freeze({ cost: ['band', o.cost[0], o.cost[1]], down: ['ofCost', 1, 1], cf: ['yield', o.y[0], o.y[1]], value: ['ofCost', 0, 0], months: ['int', o.months[0], o.months[1]] }),
  text: Object.freeze(o.text), vars: o.vars ? Object.freeze(o.vars) : undefined, effects: Object.freeze({ k: 'sponsor', op: Object.freeze({ ck: 'sponsor' }) }), risk: 'sealed:scandal',
  ...(o.mult ? { mult: o.mult } : {}), ...(o.trigger ? { trigger: o.trigger } : {}) });
const F = (id, o) => Object.freeze({ id: 'deal.' + id, v: 1, pool: 'deal', tiles: ['O'], worlds: ['w13'], tags: ['facility'], w: o.w || 8, cooldown: o.cooldown ?? 10, perRun: o.perRun || 2, preview: true,
  gen: Object.freeze({ cost: ['band', o.cost[0], o.cost[1]], down: ['ofCost', o.down[0], o.down[1]], cf: ['yield', o.y[0], o.y[1]] }),
  text: Object.freeze(o.text), effects: Object.freeze({ k: o.k || 'facility', op: Object.freeze({ ck: 'facility' }) }), risk: null });
const clean = (e) => { const x = { ...e }; for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k]; return Object.freeze(x); };

export const DEALS_W13 = Object.freeze([
  S('shirt', { cost: [0.04, 0.08], y: [0.025, 0.04], months: [24, 36], w: 12, vars: { brand: ['משקאות גלית', 'רשת סופר ענבל', 'חברת הסלולר טלגל', 'בנק הגפן'] },
    text: { n: 'חסות על החולצה: {brand}', d: '{brand} רוצה את הלוגו שלה על החולצה ל־{months} חודשים. הפקה ושיווק עולים {cost}, והחסות משלמת {cf} בחודש.', q: 'כמה זה שווה אם המועדון יורד ליגה באמצע החוזה? ומה קורה אם נותן החסות מסתבך?' } }),
  S('sleeve', { cost: [0.02, 0.04], y: [0.025, 0.04], months: [12, 24], w: 10, vars: { brand: ['אפליקציית התשלום פייגל', 'חברת הרכב נועם מוטורס', 'חברת המשלוחים חץ'] },
    text: { n: 'חסות על השרוול: {brand}', d: 'חסות קטנה ל־{months} חודשים: הפקה {cost}, תשלום {cf} בחודש.', q: 'חסות קטנה, סיכון קטן. מי עומד מאחורי המותג?' } }),
  S('stand', { cost: [0.05, 0.09], y: [0.022, 0.035], months: [24, 36], w: 8, vars: { brand: ['חברת הביטוח מגן', 'רשת המלונות חוף זהב', 'חברת הבנייה אבני השרון'] },
    text: { n: 'חסות על היציע: {brand}', d: '{brand} רוצה את השם שלה על יציע המזרח. התאמת היציע עולה {cost}, והחסות משלמת {cf} בחודש ל־{months} חודשים.', q: 'מה יקרה לחסות כזאת אם השם של החברה יופיע בכותרות הלא נכונות?' } }),
  S('kit', { cost: [0.03, 0.06], y: [0.025, 0.04], months: [36, 48], w: 8, vars: { brand: ['יצרנית הספורט רוץ', 'מותג הנעליים קפיצה'] },
    text: { n: 'ספק ביגוד: {brand}', d: 'חוזה ביגוד ל־{months} חודשים: עלות מעבר {cost}, ו־{cf} בחודש.', q: 'חוזה ארוך הוא כסף בטוח — כל עוד הספק לא נופל.' } }),
  S('boom', { cost: [0.06, 0.1], y: [0.03, 0.045], months: [24, 36], w: 6, trigger: { on: 'league:promoted', months: 6 }, vars: { brand: ['חברת התקשורת אופק', 'רשת הדלק נתיב'] },
    text: { n: 'חסות ראשית אחרי העלייה: {brand}', d: 'אחרי העלייה כולם רוצים אותך. {brand} מציעה {cf} בחודש ל־{months} חודשים, אחרי השקעה של {cost}.', q: 'חסות גדולה אחרי עלייה. ואם נרד בעוד עונה?' } }),
  F('boxes', { cost: [0.3, 0.5], down: [0.3, 0.4], y: [0.007, 0.01], text: { n: 'תאי אירוח VIP', d: 'שלושים תאים מעל הקווים: עלות {cost}, הכנסה {cf} בחודש מחברות שמארחות לקוחות.', q: 'תאי אירוח מתמלאים כשהקבוצה מנצחת. מה קורה בעונה רעה?' } }),
  F('shop', { cost: [0.1, 0.2], down: [0.4, 0.5], y: [0.008, 0.011], text: { n: 'חנות המועדון', d: 'חנות מרצ׳נדייז ליד הקופות: עלות {cost}, רווח {cf} בחודש.', q: 'חולצה של הקבוצה נמכרת גם בעונה רעה. כמה?' } }),
  F('fanzone', { cost: [0.15, 0.25], down: [0.3, 0.45], y: [0.0075, 0.01], text: { n: 'מתחם אוהדים', d: 'אוכל, הופעות ומשחקים לפני המשחק: עלות {cost}, הכנסה {cf} בחודש.', q: 'מה ממלא מתחם אוהדים — המשחק או המקום?' } }),
  F('museum', { cost: [0.08, 0.14], down: [0.5, 0.6], y: [0.006, 0.009], perRun: 1, text: { n: 'מוזיאון המועדון', d: 'היסטוריה, גביעים וסיורים: עלות {cost}, הכנסה {cf} בחודש.', q: 'נכס קטן ויציב. האם הכסף הזה שווה יותר בשחקן?' } }),
].map(clean));
