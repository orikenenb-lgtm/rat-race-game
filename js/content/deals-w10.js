// Content pool `deal` for w10 מרכז הפיננסים (CATALOG-25 §4.2): the MONTHLY-liquidity class on the deal tile — funds whose NAV moves with
// public factor loadings (js/worlds/mech/portfolio.js: dur = years of rate duration, beq = index beta, bcr = credit-spread beta, bpr =
// property beta). Two traps carry a SEALED risk (risk: 'sealed:…'): the "guaranteed" note's credit beta is 3× what it shows, and the
// non-traded property fund is marked at stale prices. Two entries switch on only after a market regime change (trigger).
// Numbers: cost = a share of the world's econ.band.deal (₪5M–100M), down = all of it (no mortgage on a fund), cf = a monthly yield.
const F = (id, o) => Object.freeze({ id: 'deal.' + id, v: 1, pool: 'deal', tiles: ['O'], worlds: ['w10'], tags: o.tags || ['fund'], w: o.w || 10, cooldown: o.cooldown ?? 6, preview: true,
  gen: Object.freeze({ cost: ['band', o.cost[0], o.cost[1]], down: ['ofCost', 1, 1], cf: ['yield', o.y[0], o.y[1]], ...(o.gen || {}) }),
  text: Object.freeze(o.text), effects: Object.freeze({ k: 'fund', op: Object.freeze({ ck: 'fund', kind: o.kind, dur: o.dur || 0, beq: o.beq || 0, bcr: o.bcr || 0, bpr: o.bpr || 0 }) }),
  ...(o.mult ? { mult: o.mult } : {}), ...(o.trigger ? { trigger: o.trigger } : {}), ...(o.perRun ? { perRun: o.perRun } : {}), risk: o.risk || null });

export const DEALS_W10 = Object.freeze([
  F('govShort', { kind: 'gov', cost: [0.05, 0.3], y: [0.0028, 0.0033], dur: 1.5, text: { n: 'קרן אג"ח ממשלתי קצר', d: 'אג"ח של המדינה לשנה־שנתיים. השקעה של {cost}, הכנסה של {cf} בחודש. כמעט לא זז — וגם לא מרוויח הרבה.', q: 'מה קורה לאג"ח קצר כשהריבית עולה? כמעט כלום. ולאג"ח ארוך?' } }),
  F('govLong', { kind: 'gov', cost: [0.05, 0.35], y: [0.0033, 0.0039], dur: 8, text: { n: 'קרן אג"ח ממשלתי ארוך', d: 'אג"ח של המדינה ל־10 שנים. השקעה של {cost}, {cf} בחודש. כל אחוז ריבית מזיז את השווי בערך 8%.', q: 'אג"ח ארוך הוא הימור על הריבית. לאן היא הולכת?' } }),
  F('linked', { kind: 'gov', cost: [0.05, 0.25], y: [0.0024, 0.0029], dur: 5, text: { n: 'קרן אג"ח צמוד מדד', d: 'אג"ח ממשלתי שמוגן מאינפלציה. {cost}, {cf} בחודש. תשואה נמוכה — ושקט.' } }),
  F('corp', { kind: 'corp', cost: [0.08, 0.35], y: [0.0040, 0.0048], dur: 4, bcr: 1, beq: 0.1, text: { n: 'קרן אג"ח קונצרני', d: 'אג"ח של חברות גדולות. {cost}, {cf} בחודש. כשמרווחי האשראי עולים — השווי יורד.' } }),
  F('credit', { kind: 'credit', cost: [0.1, 0.4], y: [0.0055, 0.0068], dur: 1, bcr: 1.6, beq: 0.15, mult: { regime: { recession: 0.6, bubble: 1.4 } },
    text: { n: 'קרן אשראי פרטי', d: 'הלוואות לחברות בינוניות. {cost}, {cf} בחודש. נזילות חודשית — אבל במשבר הקרן יכולה לנעול פדיונות.', q: 'תשואה גבוהה יותר = סיכון גבוה יותר. מתי הוא מופיע?' } }),
  F('reit', { kind: 'reit', cost: [0.08, 0.35], y: [0.0035, 0.0045], bpr: 1, beq: 0.4, text: { n: 'קרן ריט: נדל"ן מניב', d: 'משרדים, מרכזים לוגיסטיים וקניונים. {cost}, {cf} בחודש משכר הדירה. זז עם מחירי הנדל"ן — וגם עם הבורסה.' } }),
  F('infra', { kind: 'infra', cost: [0.1, 0.4], y: [0.0042, 0.0050], dur: 3, bcr: 0.4, bpr: 0.3, text: { n: 'קרן תשתיות', d: 'כבישי אגרה, מתקני מים וחשמל. {cost}, {cf} בחודש בחוזים ארוכים.' } }),
  F('hedge', { kind: 'hedge', cost: [0.08, 0.3], y: [0, 0], beq: 0.3, gen: { x: ['range', 0, 1] }, risk: 'sealed:alpha', tags: ['fund', 'alt'],
    text: { n: 'קרן גידור "שוק ניטרלי"', d: 'מנהל שמבטיח להרוויח בכל שוק. {cost}, בלי הכנסה חודשית — רק שווי. אף אחד לא יודע אם הוא באמת טוב.', q: 'איך יודעים אם מנהל טוב — או שהיה לו מזל?' } }),
  F('note', { kind: 'note', cost: [0.08, 0.3], y: [0.0095, 0.0105], dur: 1, bcr: 1, mult: { regime: { bubble: 1.5, growth: 1.2 } }, risk: 'sealed:credit', tags: ['fund', 'trap'],
    text: { n: 'פיקדון מובנה: "12% בשנה, מובטח"', d: 'בנקאי מציע מוצר שמשלם {cf} בחודש על {cost}. "בלי סיכון", הוא אומר.', q: 'אם זה באמת בלי סיכון — למה זה משלם פי שלושה מאג"ח ממשלתי?' } }),
  F('stale', { kind: 'stale', cost: [0.1, 0.35], y: [0.0038, 0.0044], bpr: 1, risk: 'sealed:marks', tags: ['fund', 'trap'],
    text: { n: 'קרן נדל"ן לא סחירה', d: 'קרן שמדווחת על שווי יציב מאוד. {cost}, {cf} בחודש. השווי מתעדכן פעם בחצי שנה.', q: 'שווי שכמעט לא זז — כי הנכסים יציבים, או כי אף אחד לא בודק?' } }),
  F('distressed', { kind: 'distress', cost: [0.06, 0.25], y: [0.009, 0.012], dur: 3, bcr: 2.5, w: 14, trigger: { on: 'regime:recession', months: 6 }, tags: ['fund', 'trigger'],
    text: { n: 'אג"ח של חברות במצוקה', d: 'במיתון אג"ח של חברות חלשות נמכרות בזול: {cf} בחודש על {cost}. אם המשק מתאושש — רווח גדול. אם לא — הפסד גדול.', q: 'לקנות כשכולם מוכרים — אומץ או טעות?' } }),
  F('theme', { kind: 'theme', cost: [0.06, 0.25], y: [0, 0], beq: 1.6, w: 14, trigger: { on: 'regime:bubble', months: 4 }, tags: ['fund', 'trigger'],
    text: { n: 'קרן נושאית "הדבר הבא"', d: 'קרן שקונה רק את המניות החמות של הבועה. {cost}. זזה פי 1.6 מהמדד — לשני הכיוונים.', q: 'מי קונה בשיא של בועה?' } }),
]);
